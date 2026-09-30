import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { lsGet, lsRemove, lsSet } from './lib/storage.js'
import {
  DEFAULT_PROJECTS, PASSWORD, PUBLICATIONS_CSV, REQUESTS_CSV, SCRIPT_URL, fetchPublications, fetchRequests,
  isPendingRequest, parseDate, requestToPublication, scriptCreatePublication, scriptDeleteRequest, scriptSubmitRequest,
  scriptUpdatePublication, scriptUpdateRequest,
} from './lib/data.js'
import { demoPublications, demoRequests } from './lib/demo.js'
import { accountForProject, buildAccounts, loadAccountLinks, loadActiveAccount, loadCustomHandles, normalizeHandle, saveAccountLinks, saveActiveAccount, saveCustomHandles } from './lib/accounts.js'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

const NAME_KEY = 'pubcal_solicitante'
const AUTH_KEY = 'pubcal_auth'
const now = new Date()

const PREVIEW = import.meta.env.MODE === 'preview'
const read = (k, fallback) => {
  try { return JSON.parse(lsGet(k) ?? 'null') ?? fallback } catch { return fallback }
}
const write = (k, v) => lsSet(k, JSON.stringify(v))
const dateOut = (d) => (d instanceof Date ? d.toISOString() : d)
const dateIn = (list) => list.map((p) => ({ ...p, fecha: p.fecha ? new Date(p.fecha) : null }))

const VIEWS = ['calendar', 'list', 'feed', 'requests', 'projects', 'library', 'stats', 'settings']
const viewFromHash = () => {
  const h = window.location.hash.replace('#/', '').split('?')[0]
  return VIEWS.includes(h) ? h : 'calendar'
}

export function AppProvider({ children }) {
  const config = useMemo(() => ({ spreadsheetId: PUBLICATIONS_CSV, requestsScriptUrl: SCRIPT_URL }), [])

  const [isAuth, setIsAuth] = useState(() => PREVIEW || lsGet(AUTH_KEY) === '1')
  const [demo, setDemo] = useState(PREVIEW)
  const [view, setViewState] = useState(viewFromHash)
  const [reqFilter, setReqFilter] = useState('all')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [projectsFilter, setProjectsFilter] = useState([])
  const [canalFilter, setCanalFilter] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('')
  const [search, setSearch] = useState('')
  const [customHandles, setCustomHandles] = useState(loadCustomHandles)
  const [accountLinks, setAccountLinks] = useState(loadAccountLinks)
  const [activeAccount, setActiveAccountState] = useState(loadActiveAccount)

  const [pubs, setPubs] = useState([])
  const [overrides, setOverrides] = useState(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastSynced, setLastSynced] = useState(null)

  const [requests, setRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(false)

  const [selectedPub, setSelectedPub] = useState(null)
  const [newPubDate, setNewPubDate] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | publicación
  const [showAuth, setShowAuth] = useState(false)
  const [requestForm, setRequestForm] = useState(false)
  const [requestEdit, setRequestEdit] = useState(null)
  const [requestDelete, setRequestDelete] = useState(null)
  const [toasts, setToasts] = useState([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => read('calendapp_sidebar', window.innerWidth < 1100))

  useEffect(() => write('calendapp_sidebar', sidebarCollapsed), [sidebarCollapsed])

  // ── Navegación ──────────────────────────────────────────────────────────
  const setView = useCallback((v) => {
    setViewState(v)
    setSelectedPub(null)
    if (window.location.hash !== `#/${v}`) window.history.pushState(null, '', `#/${v}`)
  }, [])
  useEffect(() => {
    const onPop = () => { setViewState(viewFromHash()); setSelectedPub(null) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // ── Avisos ──────────────────────────────────────────────────────────────
  const toast = useMemo(() => {
    const push = (type, message, duration = 3200) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((t) => [...t, { id, type, message }])
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration)
    }
    return {
      success: (m) => push('success', m),
      error: (m) => push('error', m, 5000),
      info: (m) => push('info', m),
    }
  }, [])

  // ── Publicaciones ───────────────────────────────────────────────────────
  const loadPublications = useCallback(async (force = false) => {
    if (!config.spreadsheetId || PREVIEW) return
    if (!force) {
      const cached = read('pubcal_pubs_cache', null)
      if (cached) setPubs(dateIn(cached))
    }
    setLoading(true)
    setError(null)
    try {
      const [fromSheet, reqs] = await Promise.all([
        fetchPublications(config.spreadsheetId, force),
        fetchRequests(REQUESTS_CSV, force).catch(() => []),
      ])
      const seen = new Set(fromSheet.map((p) => `${p.proyecto}||${p.titulo}`))
      const approved = reqs
        .filter((r) => r.estado === 'Aprobado' && r.fecha)
        .map(requestToPublication)
        .filter((p) => !seen.has(`${p.proyecto}||${p.titulo}`))
      const all = [...fromSheet, ...approved]
      setPubs(all)
      write('pubcal_pubs_cache', all.map((p) => ({ ...p, fecha: dateOut(p.fecha) })))
      setLastSynced(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [config.spreadsheetId])

  useEffect(() => { loadPublications() }, [loadPublications])
  useEffect(() => {
    const t = setInterval(() => loadPublications(), 60000)
    return () => clearInterval(t)
  }, [loadPublications])

  const setOverride = useCallback((id, pub) => setOverrides((m) => new Map(m).set(id, pub)), [])
  const clearOverride = useCallback((id) => setOverrides((m) => { const n = new Map(m); n.delete(id); return n }), [])

  const publications = useMemo(() => {
    const base = demo ? demoPublications : pubs
    if (overrides.size === 0) return base
    const map = new Map(base.map((p) => [p.id, p]))
    const extra = []
    for (const [id, o] of overrides) {
      if (map.has(id)) map.set(id, { ...map.get(id), ...o })
      else if (o.fecha) extra.push(o)
    }
    return [...map.values(), ...extra]
  }, [demo, pubs, overrides])

  const accounts = useMemo(() => buildAccounts(customHandles, accountLinks), [customHandles, accountLinks])
  const linkAccount = useCallback((id, proyecto) => {
    setAccountLinks((l) => { const n = { ...l }; if (proyecto) n[id] = proyecto; else delete n[id]; saveAccountLinks(n); return n })
  }, [])
  const setActiveAccount = useCallback((id) => { setActiveAccountState(id); saveActiveAccount(id) }, [])
  const addAccount = useCallback((raw) => {
    const h = normalizeHandle(raw)
    if (!h) return false
    if (!buildAccounts(customHandles, accountLinks).some((a) => a.id === h)) {
      const next = [...customHandles, h]
      setCustomHandles(next); saveCustomHandles(next)
    }
    setActiveAccount(h)
    return true
  }, [customHandles, accountLinks, setActiveAccount])
  const account = useMemo(() => accounts.find((a) => a.id === activeAccount) || null, [accounts, activeAccount])
  const accountOf = useCallback((project) => accountForProject(accounts, project), [accounts])
  const matchesAccount = useCallback((project) => !account || accountForProject([account], project)?.id === account.id, [account])

  const sortedPublications = useMemo(
    () => [...publications].sort((a, b) => (a.fecha || 0) - (b.fecha || 0)),
    [publications],
  )

  const projectNames = useMemo(() => {
    const set = new Set(publications.map((p) => p.proyecto).filter(Boolean))
    requests.forEach((r) => r.proyecto && set.add(r.proyecto))
    return [...new Set([...DEFAULT_PROJECTS, ...set].map((p) => p.toUpperCase()))].sort()
  }, [publications, requests])

  const filteredPublications = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sortedPublications.filter((p) => {
      if (projectsFilter.length && !projectsFilter.includes(p.proyecto)) return false
      if (!matchesAccount(p.proyecto)) return false
      if (canalFilter && (p.canal || '').toLowerCase() !== canalFilter.toLowerCase()) return false
      if (estadoFilter && (p.estado || '') !== estadoFilter) return false
      if (q.length >= 2) {
        return [p.titulo, p.copy, p.proyecto, p.canal].some((f) => f && f.toLowerCase().includes(q))
      }
      return true
    })
  }, [sortedPublications, projectsFilter, canalFilter, estadoFilter, search, matchesAccount])

  const savePublication = useCallback(async (pub) => {
    setOverride(pub.id, pub)
    setSelectedPub(pub)
    setEditing(null)
    toast.success('Publicación guardada')
    if (demo || !config.requestsScriptUrl) return
    const row = parseInt(pub.id)
    try { await scriptUpdatePublication(config.requestsScriptUrl, row, pub) } catch { toast.error('No se pudo guardar en la hoja') }
    setTimeout(async () => { await loadPublications(true); clearOverride(pub.id) }, 5000)
  }, [demo, config.requestsScriptUrl, loadPublications, setOverride, clearOverride, toast])

  const createPublication = useCallback(async (form) => {
    if (demo) {
      const id = `demo-${Date.now()}`
      setOverride(id, { ...form, id, fecha: new Date(`${form.fecha}T12:00:00`), promocionado: 'No', url_post: '' })
      setEditing(null)
      toast.success('Publicación creada (demo)')
      return
    }
    try {
      await scriptCreatePublication(config.requestsScriptUrl, form)
      setEditing(null)
      toast.success('Publicación añadida a la hoja')
      loadPublications(true)
      setTimeout(() => loadPublications(true), 4000)
    } catch {
      toast.error('Error de conexión.')
    }
  }, [demo, config.requestsScriptUrl, loadPublications, setOverride, toast])

  // ── Peticiones ──────────────────────────────────────────────────────────
  const loadRequests = useCallback(async () => {
    if (demo) { setRequests(demoRequests); return }
    const local = dateIn2(read('pubcal_requests', []))
    const cached = dateIn2(read('pubcal_requests_cache', []))
    const keys = new Set(local.map((r) => `${r.proyecto}||${r.titulo}`))
    const merged = [...local, ...cached.filter((r) => !keys.has(`${r.proyecto}||${r.titulo}`))]
    setRequests(merged.sort((a, b) => (a.fecha || 0) - (b.fecha || 0)))
    setRequestsLoading(true)
    try {
      const remote = await fetchRequests(REQUESTS_CSV)
      const rk = new Set(remote.map((r) => `${r.proyecto}||${r.titulo}`))
      const localOnly = local.filter((r) => !rk.has(`${r.proyecto}||${r.titulo}`))
      setRequests([...remote, ...localOnly].sort((a, b) => (a.fecha || 0) - (b.fecha || 0)))
      write('pubcal_requests_cache', remote.map((r) => ({ ...r, fecha: dateOut(r.fecha) })))
    } catch { /* se mantiene lo local */ } finally {
      setRequestsLoading(false)
    }
  }, [demo])

  useEffect(() => { loadRequests() }, [loadRequests])

  const pendingCount = useMemo(() => requests.filter(isPendingRequest).length, [requests])

  const onRequestState = useCallback((req, prevEstado) => {
    if (req.estado === 'Aprobado' && prevEstado !== 'Aprobado') toast.success('Petición aprobada')
    else if (req.estado === 'Rechazado' && prevEstado !== 'Rechazado') toast.info('Petición rechazada')
    const oid = `approved-${req.id}`
    if (req.estado === 'Aprobado') {
      const fecha = req.fecha instanceof Date ? req.fecha : req.fecha ? new Date(req.fecha) : null
      if (fecha) setOverride(oid, requestToPublication({ ...req, fecha }))
    } else if (prevEstado === 'Aprobado') clearOverride(oid)
    if (!demo) setTimeout(() => loadPublications(true), 5000)
  }, [demo, loadPublications, setOverride, clearOverride, toast])

  const changeRequestState = useCallback(async (req, estado) => {
    const prev = req.estado
    const next = { ...req, estado }
    setRequests((rs) => rs.map((r) => (r.id === req.id ? next : r)))
    onRequestState(next, prev)
    if (config.requestsScriptUrl && req.id.startsWith('sheet-')) {
      try { await scriptUpdateRequest(config.requestsScriptUrl, parseInt(req.id.replace('sheet-', '')), { estado }) } catch { /* sin conexión */ }
    }
    return next
  }, [config.requestsScriptUrl, onRequestState])

  const saveRequest = useCallback((req, prevEstado) => {
    setRequests((rs) => rs.map((r) => (r.id === req.id ? req : r)))
    setRequestEdit(null)
    toast.success('Petición guardada')
    onRequestState(req, prevEstado)
  }, [onRequestState, toast])

  const submitRequest = useCallback(async (data) => {
    const payload = { ...data, fechaSolicitud: new Date().toLocaleDateString('es-ES'), estado: 'Pendiente', promocionado: data.promocionado ? 'Sí' : 'No' }
    delete payload.proyectoOtros
    const entry = { ...payload, id: Date.now().toString() }
    if (demo) {
      setRequests((rs) => [...rs, { ...entry, fecha: parseDate(payload.fecha) || new Date() }])
    } else {
      write('pubcal_requests', [entry, ...read('pubcal_requests', [])])
      if (config.requestsScriptUrl) { try { await scriptSubmitRequest(config.requestsScriptUrl, payload) } catch (e) { console.warn('Apps Script error:', e) } }
    }
    if (payload.solicitante?.trim()) { try { lsSet(NAME_KEY, payload.solicitante.trim()) } catch { /* */ } }
    toast.success('Petición enviada')
    if (!demo) loadRequests()
  }, [demo, config.requestsScriptUrl, loadRequests, toast])

  const deleteRequest = useCallback(async (req, actor) => {
    setRequestDelete(null)
    setRequests((rs) => rs.filter((r) => r.id !== req.id))
    if (actor) {
      const log = read('pubcal_delete_log', [])
      log.unshift({ titulo: req.titulo, proyecto: req.proyecto, actor, ts: new Date().toISOString() })
      write('pubcal_delete_log', log.slice(0, 100))
    }
    write('pubcal_requests', read('pubcal_requests', []).filter((r) => r.id !== req.id))
    write('pubcal_requests_cache', read('pubcal_requests_cache', []).filter((r) => r.id !== req.id))
    if (config.requestsScriptUrl && req.id.startsWith('sheet-')) {
      try { await scriptDeleteRequest(config.requestsScriptUrl, parseInt(req.id.replace('sheet-', ''))) } catch { /* sin conexión */ }
    }
  }, [config.requestsScriptUrl])

  // ── Sesión ──────────────────────────────────────────────────────────────
  const login = useCallback((password) => {
    if (password !== PASSWORD) return false
    lsSet(AUTH_KEY, '1')
    setIsAuth(true)
    return true
  }, [])
  const logout = useCallback(() => { lsRemove(AUTH_KEY); setIsAuth(false) }, [])
  const requireAuth = useCallback((then) => { if (isAuth) then(); else setShowAuth(true) }, [isAuth])

  const userName = (() => { try { return lsGet(NAME_KEY) || '' } catch { return '' } })()

  // ── Demo ────────────────────────────────────────────────────────────────
  const enterDemo = useCallback(() => {
    setDemo(true); setYear(now.getFullYear()); setMonth(now.getMonth()); setProjectsFilter([]); setOverrides(new Map())
  }, [])
  const exitDemo = useCallback(() => { setDemo(false); setOverrides(new Map()) }, [])

  // ── Mes ─────────────────────────────────────────────────────────────────
  const shiftMonth = useCallback((delta) => {
    setMonth((m) => {
      const n = m + delta
      if (n < 0) { setYear((y) => y - 1); return 11 }
      if (n > 11) { setYear((y) => y + 1); return 0 }
      return n
    })
  }, [])
  const goToday = useCallback(() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }, [])

  const value = {
    config, isAuth, demo, view, setView, reqFilter, setReqFilter, year, month, shiftMonth, goToday, setYear, setMonth,
    projectsFilter, setProjectsFilter, canalFilter, setCanalFilter, estadoFilter, setEstadoFilter, search, setSearch,
    publications, sortedPublications, filteredPublications, projectNames, loading, error, lastSynced,
    loadPublications, savePublication, requests, requestsLoading, pendingCount, loadRequests, changeRequestState,
    saveRequest, deleteRequest, submitRequest, createPublication, selectedPub, setSelectedPub, editing, setEditing, showAuth, setShowAuth,
    requestForm, setRequestForm, requestEdit, setRequestEdit, requestDelete, setRequestDelete, toasts, toast,
    accounts, account, activeAccount, setActiveAccount, addAccount, linkAccount, accountOf, matchesAccount, newPubDate, setNewPubDate,
    login, logout, requireAuth, userName, enterDemo, exitDemo, sidebarCollapsed, setSidebarCollapsed, setRequests,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function dateIn2(list) {
  return list.map((r, i) => ({ ...r, fecha: toDate(r.fecha), id: r.id || String(i) }))
}
function toDate(v) {
  if (v instanceof Date && !isNaN(v)) return v
  return parseDate(String(v || '')) || new Date()
}
