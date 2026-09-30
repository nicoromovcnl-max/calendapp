import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { lsGet, lsRemove, lsSet } from './lib/storage.js'
import {
  PASSWORD, PUBLICATIONS_CSV, REQUESTS_CSV, SCRIPT_URL, fetchPublications, fetchRequests, isPendingRequest, parseDate,
  requestToPublication, scriptCreatePublication, scriptDeleteRequest, scriptSubmitRequest, scriptUpdatePublication,
  scriptUpdateRequest, splitMedia,
} from './lib/data.js'
import { demoPublications, demoRequests } from './lib/demo.js'
import { PROJECTS, PROJECT_NAMES, applyProjectRegistry, resolveProject } from './lib/projects.js'
import { aggregateStatus, pubRef, statusToEstado, withDestinations } from './lib/destinations.js'
import { canPublish, useSocial } from './lib/social.jsx'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

const NAME_KEY = 'pubcal_solicitante'
const AUTH_KEY = 'pubcal_auth'
const ACTIVE_ACCOUNT_KEY = 'calendapp_account'
const now = new Date()

const PREVIEW = import.meta.env.MODE === 'preview'
const read = (k, fallback) => {
  try { return JSON.parse(lsGet(k) ?? 'null') ?? fallback } catch { return fallback }
}
const write = (k, v) => lsSet(k, JSON.stringify(v))
const dateOut = (d) => (d instanceof Date ? d.toISOString() : d)
const dateIn = (list) => list.map((p) => ({ ...p, fecha: p.fecha ? new Date(p.fecha) : null }))
function toDate(v) {
  if (v instanceof Date && !isNaN(v)) return v
  return parseDate(String(v || '')) || new Date()
}
const dateIn2 = (list) => list.map((r, i) => ({ ...r, fecha: toDate(r.fecha), id: r.id || String(i) }))

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
  const [settingsTab, setSettingsTab] = useState('cuenta')
  const [reqFilter, setReqFilter] = useState('all')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [projectsFilter, setProjectsFilter] = useState([])
  const [canalFilter, setCanalFilter] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('')
  const [search, setSearch] = useState('')
  const [activeAccount, setActiveAccountState] = useState(() => lsGet(ACTIVE_ACCOUNT_KEY) || null)

  const [pubs, setPubs] = useState([])
  const [hiddenPubs, setHiddenPubs] = useState(0)
  const [hiddenReqs, setHiddenReqs] = useState(0)
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
  const goIntegrations = useCallback(() => { setSettingsTab('integraciones'); setView('settings') }, [setView])

  // ── Avisos ──────────────────────────────────────────────────────────────
  const toast = useMemo(() => {
    const push = (type, message, duration = 3200) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((t) => [...t, { id, type, message }])
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration)
    }
    return {
      success: (m) => push('success', m),
      error: (m) => push('error', m, 6000),
      info: (m) => push('info', m),
    }
  }, [])

  // ── Cuentas sociales y destinos (backend) ───────────────────────────────
  const social = useSocial({ demo, toast })
  const { accounts } = social

  const setActiveAccount = useCallback((id) => { setActiveAccountState(id); lsSet(ACTIVE_ACCOUNT_KEY, id || '') }, [])
  const account = useMemo(() => accounts.find((a) => a.id === activeAccount) || null, [accounts, activeAccount])
  const accountsOf = useCallback((project) => accounts.filter((a) => a.proyecto === project), [accounts])
  const accountOf = useCallback((project) => accounts.find((a) => a.proyecto === project) || null, [accounts])
  const accountById = useCallback((id) => accounts.find((a) => a.id === String(id)) || null, [accounts])
  const matchesAccount = useCallback((project) => !account || account.proyecto === project, [account])
  const pubMatchesAccount = useCallback((p) => !account || (p.destinos?.length ? p.destinos.some((d) => d.accountId === account.id) : p.proyecto === account.proyecto), [account])

  // Resultado del flujo OAuth (el backend redirige a #/settings?ig=...).
  useEffect(() => {
    const m = window.location.hash.match(/[?&]ig=([a-z]+)(?:&msg=([^&]*))?/)
    if (!m) return
    const msg = m[2] ? decodeURIComponent(m[2]) : ''
    setSettingsTab('integraciones')
    if (m[1] === 'connected') toast.success(msg || 'Cuenta de Instagram conectada')
    else toast.error(msg || 'No se pudo conectar la cuenta de Instagram')
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/settings`)
  }, [toast])

  // ── Publicaciones (hoja) ────────────────────────────────────────────────
  const loadPublications = useCallback(async (force = false) => {
    if (!config.spreadsheetId || PREVIEW) return
    if (!force) {
      const cached = read('pubcal_pubs_cache', null)
      if (cached) setPubs(applyProjectRegistry(dateIn(cached)).visible)
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
      const { visible, hidden } = applyProjectRegistry([...fromSheet, ...approved])
      setPubs(visible)
      setHiddenPubs(hidden)
      write('pubcal_pubs_cache', visible.map((p) => ({ ...p, fecha: dateOut(p.fecha) })))
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

  // Publicaciones + cambios locales + destinos (uno por cuenta social).
  const publications = useMemo(() => {
    const base = demo ? demoPublications : pubs
    const map = new Map(base.map((p) => [p.id, p]))
    const baseRefs = new Set(base.map(pubRef))
    const extra = []
    for (const [id, o] of overrides) {
      if (map.has(id)) map.set(id, { ...map.get(id), ...o })
      else if (o.fecha && !(id.startsWith('tmp-') && baseRefs.has(pubRef(o)))) extra.push(o)
    }
    return [...map.values(), ...extra].map((p) => {
      // Fuera de la demo, el estado real de los destinos lo manda el servidor; el snapshot local solo sirve hasta la primera sincronización.
      const dests = demo ? p.destinos : (social.destinationsByRef.get(pubRef(p)) ?? p.destinos)
      const withD = withDestinations(p, dests)
      return withD.destinos?.length ? { ...withD, estado: statusToEstado(aggregateStatus(withD.destinos)) } : withD
    })
  }, [demo, pubs, overrides, social.destinationsByRef])

  const sortedPublications = useMemo(() => [...publications].sort((a, b) => (a.fecha || 0) - (b.fecha || 0)), [publications])

  const filteredPublications = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sortedPublications.filter((p) => {
      if (projectsFilter.length && !projectsFilter.includes(p.proyecto)) return false
      if (!pubMatchesAccount(p)) return false
      if (canalFilter && (p.canal || '').toLowerCase() !== canalFilter.toLowerCase()) return false
      if (estadoFilter && (p.estado || '') !== estadoFilter) return false
      if (q.length >= 2) return [p.titulo, p.copy, p.proyecto, p.canal].some((f) => f && f.toLowerCase().includes(q))
      return true
    })
  }, [sortedPublications, projectsFilter, canalFilter, estadoFilter, search, pubMatchesAccount])

  // Nombre de proyecto tal y como está en la hoja, para no reescribir datos existentes.
  const sheetProject = (pub) => (pub.proyecto_original && resolveProject(pub.proyecto_original)?.name === pub.proyecto ? pub.proyecto_original : pub.proyecto)

  const persistDestinations = useCallback(async (pub, { previousRef, dests }) => {
    if (!dests) return null
    if (demo) {
      const prev = new Map((pub.destinos || []).map((d) => [d.accountId, d]))
      return dests.map((d) => {
        const old = prev.get(d.accountId)
        return old && ['published', 'failed'].includes(old.status)
          ? old
          : { id: `${pub.id}-${d.accountId}`, accountId: d.accountId, canal: 'Instagram', status: d.status, scheduledAt: d.scheduledAt, publishedAt: null, externalPostId: null, errorMessage: null }
      })
    }
    const ref = pubRef(pub)
    return social.savePublicationDestinations({
      ref, previous_ref: previousRef && previousRef !== ref ? previousRef : null, project_id: resolveProject(pub.proyecto)?.id,
      title: pub.titulo, caption: pub.copy || '', media: splitMedia(pub.media), tipo: pub.tipo || 'imagen',
      destinations: dests.map((d) => ({ social_account_id: Number(d.accountId), status: d.status, scheduled_at: d.scheduledAt ? d.scheduledAt.toISOString() : null })),
    })
  }, [demo, social])

  const publishNow = useCallback(async (list) => {
    const results = []
    for (const d of list) {
      const acc = accounts.find((a) => a.id === d.accountId)
      try {
        const r = await social.publishDestination(d.id)
        results.push({ dest: r, acc })
        if (r?.status === 'published') toast.success(`Publicado en @${acc?.handle || d.accountId}`)
        else if (r?.status === 'failed') toast.error(`@${acc?.handle}: ${r.error_message || r.errorMessage || 'No se pudo publicar.'}`)
        else toast.info(`@${acc?.handle}: publicación en curso`)
      } catch (e) {
        toast.error(`@${acc?.handle || d.accountId}: ${e.message}`)
      }
    }
    return results
  }, [accounts, social, toast])

  // Guardado unificado desde el editor: hoja (contrato existente) + destinos (servidor).
  const savePublication = useCallback(async (pub, { dests, previousRef, publishAfter } = {}) => {
    const isSheetRow = /^\d+$/.test(String(pub.id))
    let saved = pub
    if (dests) {
      try {
        const list = await persistDestinations(pub, { previousRef, dests })
        if (list) saved = withDestinations({ ...pub, destinos: list }, list)
      } catch (e) {
        toast.error(`Los destinos no se guardaron: ${e.message}`)
      }
    }
    if (saved.destinos?.length) saved = { ...saved, estado: statusToEstado(aggregateStatus(saved.destinos)) }
    setOverride(pub.id, saved)
    setSelectedPub(saved)
    setEditing(null)
    toast.success('Publicación guardada')
    if (!demo && config.requestsScriptUrl && isSheetRow) {
      try { await scriptUpdatePublication(config.requestsScriptUrl, parseInt(pub.id), { ...saved, proyecto: sheetProject(saved), destinos: undefined }) } catch { toast.error('No se pudo guardar en la hoja') }
    }
    if (publishAfter && saved.destinos?.length && !demo) {
      const targets = saved.destinos.filter((d) => publishAfter.includes(d.accountId) && ['draft', 'scheduled', 'failed'].includes(d.status))
      await publishNow(targets)
      if (isSheetRow) setTimeout(() => loadPublications(true), 3000)
    }
    if (!demo && isSheetRow) setTimeout(async () => { await loadPublications(true); clearOverride(pub.id) }, 5000)
    return saved
  }, [demo, config.requestsScriptUrl, persistDestinations, publishNow, loadPublications, setOverride, clearOverride, toast])

  const createPublication = useCallback(async (form, { dests, publishAfter } = {}) => {
    const fecha = new Date(`${form.fecha}T12:00:00`)
    const draft = { ...form, id: `tmp-${Date.now()}`, fecha, promocionado: 'No', url_post: '', hora: form.hora || '' }
    let saved = draft
    if (dests?.length) {
      try {
        const list = await persistDestinations(draft, { dests })
        if (list) saved = withDestinations({ ...draft, destinos: list }, list)
      } catch (e) {
        toast.error(`Los destinos no se guardaron: ${e.message}`)
      }
    }
    if (saved.destinos?.length) saved = { ...saved, estado: statusToEstado(aggregateStatus(saved.destinos)) }
    if (demo) {
      setOverride(saved.id, saved)
      setEditing(null)
      toast.success('Publicación creada (demo)')
      return saved
    }
    try {
      const { hora, destinos, ...sheetForm } = form
      await scriptCreatePublication(config.requestsScriptUrl, { ...sheetForm, estado: saved.estado || form.estado })
      setOverride(saved.id, saved)
      setEditing(null)
      toast.success('Publicación añadida a la hoja')
      loadPublications(true)
      setTimeout(() => loadPublications(true), 4000)
    } catch {
      toast.error('Error de conexión.')
      return saved
    }
    if (publishAfter && saved.destinos?.length) {
      const targets = saved.destinos.filter((d) => publishAfter.includes(d.accountId))
      await publishNow(targets)
    }
    return saved
  }, [demo, config.requestsScriptUrl, persistDestinations, publishNow, loadPublications, setOverride, toast])

  // Acciones sobre un destino ya existente (detalle de publicación).
  const publishDestinationNow = useCallback(async (d) => { await publishNow([d]) }, [publishNow])
  const cancelDestination = useCallback(async (d) => {
    if (demo) { setOverride(selectedPub.id, { ...selectedPub, destinos: selectedPub.destinos.map((x) => (x.id === d.id ? { ...x, status: 'cancelled' } : x)) }); return }
    await social.cancelDestination(d.id)
  }, [demo, selectedPub, social, setOverride])

  // ── Peticiones ──────────────────────────────────────────────────────────
  const loadRequests = useCallback(async () => {
    if (demo) { setRequests(demoRequests); return }
    const local = applyProjectRegistry(dateIn2(read('pubcal_requests', []))).visible
    const cached = applyProjectRegistry(dateIn2(read('pubcal_requests_cache', []))).visible
    const keys = new Set(local.map((r) => `${r.proyecto}||${r.titulo}`))
    const merged = [...local, ...cached.filter((r) => !keys.has(`${r.proyecto}||${r.titulo}`))]
    setRequests(merged.sort((a, b) => (a.fecha || 0) - (b.fecha || 0)))
    setRequestsLoading(true)
    try {
      const { visible: remote, hidden } = applyProjectRegistry(await fetchRequests(REQUESTS_CSV))
      setHiddenReqs(hidden)
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
    if (payload.solicitante?.trim()) lsSet(NAME_KEY, payload.solicitante.trim())
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

  // Una petición aprobada se convierte en publicación: se abre el editor para elegir proyecto, cuentas y hora.
  const openEditorForRequest = useCallback((req) => {
    const fecha = req.fecha instanceof Date ? req.fecha : new Date(req.fecha)
    setEditing(requestToPublication({ ...req, fecha }))
  }, [])

  // ── Sesión ──────────────────────────────────────────────────────────────
  const login = useCallback((password) => {
    if (password !== PASSWORD) return false
    lsSet(AUTH_KEY, '1')
    setIsAuth(true)
    // Sesión de servidor (cuentas y publicación): si usa la misma contraseña, queda activa.
    if (!demo && social.backend.state === 'online') social.login(password).catch(() => {})
    return true
  }, [demo, social])
  const logout = useCallback(() => { lsRemove(AUTH_KEY); setIsAuth(false); social.logout() }, [social])
  const requireAuth = useCallback((then) => { if (isAuth) then(); else setShowAuth(true) }, [isAuth])

  const userName = lsGet(NAME_KEY) || ''

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
    config, isAuth, demo, view, setView, settingsTab, setSettingsTab, goIntegrations, reqFilter, setReqFilter, year, month, shiftMonth, goToday, setYear, setMonth,
    projectsFilter, setProjectsFilter, canalFilter, setCanalFilter, estadoFilter, setEstadoFilter, search, setSearch,
    publications, sortedPublications, filteredPublications, projects: PROJECTS, projectNames: PROJECT_NAMES, hiddenCount: hiddenPubs + hiddenReqs,
    loading, error, lastSynced, loadPublications, savePublication, createPublication, publishDestinationNow, cancelDestination,
    requests, requestsLoading, pendingCount, loadRequests, changeRequestState, saveRequest, deleteRequest, submitRequest, openEditorForRequest,
    selectedPub, setSelectedPub, editing, setEditing, showAuth, setShowAuth,
    requestForm, setRequestForm, requestEdit, setRequestEdit, requestDelete, setRequestDelete, toasts, toast,
    social, accounts, account, activeAccount, setActiveAccount, accountOf, accountsOf, accountById, matchesAccount, pubMatchesAccount, canPublish,
    newPubDate, setNewPubDate, login, logout, requireAuth, userName, enterDemo, exitDemo, sidebarCollapsed, setSidebarCollapsed, setRequests,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
