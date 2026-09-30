import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api } from './api.js'
import { SEED_ACCOUNTS, projectById } from './projects.js'
import { demoAccounts } from './demo.js'
import { normalizeDestination } from './destinations.js'

// Estados de una cuenta social. "demo" y "offline" no son conexiones reales.
export const ACCOUNT_STATUS = {
  connected: { label: 'Conectada', tone: 'green' },
  disconnected: { label: 'Sin conectar', tone: '' },
  pending: { label: 'Sin conectar', tone: '' },
  expired: { label: 'Token caducado', tone: 'amber' },
  error: { label: 'Error', tone: 'red' },
  demo: { label: 'Demo', tone: 'blue' },
  offline: { label: 'Sin servidor', tone: '' },
}
export const canPublish = (a) => a?.status === 'connected'

function fromServer(a) {
  const proj = projectById(a.project_id)
  return {
    id: String(a.id), projectId: a.project_id || null, proyecto: proj?.name || null, platform: a.platform || 'instagram', canal: 'Instagram',
    username: a.username, handle: a.username, externalAccountId: a.external_account_id || null, status: a.status || 'pending',
    tokenExpiresAt: a.token_expires_at ? new Date(a.token_expires_at) : null, metadata: a.metadata || {}, lastError: a.last_error || null,
    connectedAt: a.connected_at ? new Date(a.connected_at) : null, source: 'server',
  }
}

const fromSeed = (a, status) => ({
  id: a.username, projectId: a.projectId, proyecto: projectById(a.projectId)?.name || null, platform: a.platform, canal: 'Instagram',
  username: a.username, handle: a.username, externalAccountId: null, status, tokenExpiresAt: null, metadata: {}, lastError: null, source: 'seed',
})

const fromDemo = (a) => ({ ...fromSeed({ username: a.username, projectId: a.projectId, platform: a.platform }, 'demo'), source: 'demo' })

export function useSocial({ demo, toast }) {
  const [backend, setBackend] = useState({ state: 'unknown', configured: null, authenticated: false, version: null })
  const [serverAccounts, setServerAccounts] = useState([])
  const [destinations, setDestinations] = useState([])
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const bootstrap = useCallback(async () => {
    try {
      const r = await api('bootstrap')
      if (!alive.current) return
      setBackend({ state: 'online', configured: r.configured || {}, authenticated: !!r.authenticated, version: r.version || null })
      setServerAccounts((r.accounts || []).map(fromServer))
      setDestinations((r.destinations || []).map((d) => ({ ...normalizeDestination(d), ref: d.ref })))
    } catch (e) {
      if (!alive.current) return
      setBackend((b) => ({ ...b, state: e.code === 'unavailable' ? 'offline' : 'online' }))
    }
  }, [])

  useEffect(() => { if (!demo) bootstrap() }, [demo, bootstrap])
  useEffect(() => {
    if (demo || backend.state !== 'online') return undefined
    const publishing = destinations.some((d) => d.status === 'publishing')
    const t = setInterval(bootstrap, publishing ? 8000 : 60000)
    return () => clearInterval(t)
  }, [demo, backend.state, destinations, bootstrap])

  const accounts = useMemo(() => {
    if (demo) return demoAccounts.map(fromDemo)
    if (backend.state === 'online') return serverAccounts
    return SEED_ACCOUNTS.map((a) => fromSeed(a, backend.state === 'offline' ? 'offline' : 'pending'))
  }, [demo, backend.state, serverAccounts])

  const destinationsByRef = useMemo(() => {
    const m = new Map()
    destinations.forEach((d) => { if (!m.has(d.ref)) m.set(d.ref, []); m.get(d.ref).push(d) })
    return m
  }, [destinations])

  // Ejecuta una llamada al servidor mostrando errores y detectando sesión caducada.
  const call = useCallback(async (route, opts, { silent = false } = {}) => {
    setBusy(true)
    try { return await api(route, opts) } catch (e) {
      if (e instanceof ApiError && e.status === 401) setBackend((b) => ({ ...b, authenticated: false }))
      if (!silent) toast.error(e.message)
      throw e
    } finally { if (alive.current) setBusy(false) }
  }, [toast])

  const login = useCallback(async (password) => {
    const r = await call('auth/login', { method: 'POST', body: { password } }, { silent: true })
    if (r.ok) { setBackend((b) => ({ ...b, authenticated: true })); await bootstrap() }
    return true
  }, [call, bootstrap])
  const logout = useCallback(async () => { try { await api('auth/logout', { method: 'POST', body: {} }) } catch { /* sin sesión */ } setBackend((b) => ({ ...b, authenticated: false })); setDestinations([]) }, [])

  const connectInstagram = useCallback(async (projectId) => {
    const r = await call('instagram/connect', { method: 'POST', body: { project_id: projectId || null } })
    if (r.url) window.location.assign(r.url)
  }, [call])
  const addAccount = useCallback(async ({ username, projectId }) => {
    await call('accounts/add', { method: 'POST', body: { username, project_id: projectId || null, platform: 'instagram' } })
    await bootstrap()
  }, [call, bootstrap])
  const disconnectAccount = useCallback(async (id) => { await call('accounts/disconnect', { method: 'POST', body: { id } }); await bootstrap(); toast.success('Cuenta desconectada') }, [call, bootstrap, toast])
  const removeAccount = useCallback(async (id) => { await call('accounts/remove', { method: 'POST', body: { id } }); await bootstrap(); toast.success('Cuenta eliminada') }, [call, bootstrap, toast])
  const setAccountProject = useCallback(async (id, projectId) => { await call('accounts/update', { method: 'POST', body: { id, project_id: projectId || null } }); await bootstrap() }, [call, bootstrap])
  const renewToken = useCallback(async (id) => { await call('accounts/refresh', { method: 'POST', body: { id } }); await bootstrap(); toast.success('Token renovado') }, [call, bootstrap, toast])
  const checkAccount = useCallback(async (id) => { const r = await call('accounts/check', { method: 'POST', body: { id } }); await bootstrap(); return r }, [call, bootstrap])

  const savePublicationDestinations = useCallback(async (payload) => {
    const r = await call('publications/save', { method: 'POST', body: payload })
    const list = (r.destinations || []).map((d) => ({ ...normalizeDestination(d), ref: payload.ref }))
    setDestinations((all) => [...all.filter((d) => d.ref !== payload.ref && d.ref !== payload.previous_ref), ...list])
    return list
  }, [call])
  const publishDestination = useCallback(async (id) => {
    const r = await call('destinations/publish', { method: 'POST', body: { id }, timeout: 150000 }, { silent: true })
    await bootstrap()
    return r.destination
  }, [call, bootstrap])
  const cancelDestination = useCallback(async (id) => { await call('destinations/cancel', { method: 'POST', body: { id } }); await bootstrap() }, [call, bootstrap])

  return {
    backend, accounts, destinations, destinationsByRef, busy, bootstrap, login, logout, connectInstagram, addAccount, disconnectAccount, removeAccount,
    setAccountProject, renewToken, checkAccount, savePublicationDestinations, publishDestination, cancelDestination,
  }
}
