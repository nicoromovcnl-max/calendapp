import { INSTAGRAM_HANDLES } from './data.js'
import { lsGet, lsSet } from './storage.js'

const CUSTOM_KEY = 'calendapp_accounts'
const ACTIVE_KEY = 'calendapp_account'

// Cuentas conocidas además de las derivadas de INSTAGRAM_HANDLES. Solo son valores por defecto:
// la lista completa se calcula en tiempo de ejecución y admite cuentas añadidas por el usuario.
const SEED_HANDLES = ['ticketealaoficial', 'teatrocorfu7']

export const normalizeHandle = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^@/, '').replace(/[^a-z0-9_.]/g, '')
const normalizeName = (s) => normalizeHandle((s || '').replace(/\s+/g, ''))

export function loadCustomHandles() {
  try { return JSON.parse(lsGet(CUSTOM_KEY) || '[]').filter(Boolean) } catch { return [] }
}
export const saveCustomHandles = (list) => lsSet(CUSTOM_KEY, JSON.stringify(list))
export const loadActiveAccount = () => lsGet(ACTIVE_KEY) || null
export const saveActiveAccount = (id) => lsSet(ACTIVE_KEY, id || '')

export function buildAccounts(custom = []) {
  const map = new Map()
  const add = (handle, proyecto) => {
    const h = normalizeHandle(handle)
    if (!h) return
    const prev = map.get(h)
    map.set(h, { id: h, handle: h, canal: 'Instagram', proyecto: proyecto || prev?.proyecto || null })
  }
  Object.entries(INSTAGRAM_HANDLES).forEach(([proj, h]) => add(h, proj))
  SEED_HANDLES.forEach((h) => add(h))
  custom.forEach((h) => add(h))
  return [...map.values()].sort((a, b) => a.handle.localeCompare(b.handle))
}

export function accountForProject(accounts, project) {
  if (!project) return null
  const n = normalizeName(project)
  return accounts.find((a) => a.proyecto === project) || accounts.find((a) => a.handle === n) || null
}
