import cfg from '../config/projects.json'

// Registro de proyectos activos. Todo lo que no resuelva a uno de estos proyectos
// (p. ej. proyectos antiguos que siguen en la hoja) se oculta de la interfaz.
export const PROJECTS = cfg.projects
export const SEED_ACCOUNTS = cfg.accounts

export const projectKey = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

const index = new Map()
PROJECTS.forEach((p) => [p.name, ...(p.aliases || [])].forEach((n) => index.set(projectKey(n), p)))

export const resolveProject = (name) => index.get(projectKey(name)) || null
export const projectById = (id) => PROJECTS.find((p) => p.id === id) || null
export const projectByName = (name) => resolveProject(name)
export const PROJECT_NAMES = PROJECTS.map((p) => p.name)

const NEUTRAL = { bg: '#EFF1EE', text: '#4A4F4B', dot: '#A8ADAA' }
export const projectColor = (name) => resolveProject(name)?.color || NEUTRAL

// Separa lo que se muestra de lo que se oculta por no pertenecer a un proyecto activo.
export function applyProjectRegistry(list) {
  const visible = []
  let hidden = 0
  for (const rec of list) {
    const p = resolveProject(rec.proyecto)
    if (!p) { hidden++; continue }
    visible.push(p.name === rec.proyecto ? rec : { ...rec, proyecto_original: rec.proyecto_original || rec.proyecto, proyecto: p.name })
  }
  return { visible, hidden }
}

// Nombre para mostrar: "PREVENIDOS Y ACCIÓN" → "Prevenidos y Acción".
const SMALL = new Set(['y', 'de', 'del', 'la', 'el', 'en'])
export const prettyProject = (name) => (name || '').toLowerCase().split(' ').map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
