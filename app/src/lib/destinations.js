import { projectKey } from './projects.js'

// Un destino es la relación entre una publicación y una cuenta social concreta.
// Vocabulario común con el backend (publication_channels.status).
export const DEST_STATUS = { draft: 'Borrador', scheduled: 'Programado', publishing: 'Publicando', published: 'Publicado', failed: 'Error', cancelled: 'Cancelado' }
export const destLabel = (s) => DEST_STATUS[s] || s || ''

const PRIORITY = ['failed', 'publishing', 'scheduled', 'draft', 'published', 'cancelled']
export function aggregateStatus(dests) {
  if (!dests?.length) return null
  return PRIORITY.find((s) => dests.some((d) => d.status === s)) || null
}

// Equivalente en el vocabulario de la hoja (columna "estado").
export const statusToEstado = (s) => ({ draft: 'Borrador', scheduled: 'Programado', publishing: 'Programado', published: 'Publicado', failed: 'En edición', cancelled: 'Cancelado' }[s] || '')

const pad = (n) => String(n).padStart(2, '0')
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const hhmm = (d) => (d instanceof Date && !isNaN(d) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '')

// Clave estable para unir una publicación de la hoja con sus destinos en el servidor.
export function pubRef(pub) {
  const d = pub.fecha instanceof Date ? isoDate(pub.fecha) : ''
  const title = (pub.titulo || '').toLowerCase().replace(/\s+/g, ' ').trim()
  return `${projectKey(pub.proyecto)}|${d}|${title}`
}

// Combina fecha (Date) y hora "HH:MM" en un instante local.
export function combineDateTime(date, time) {
  if (!(date instanceof Date) || isNaN(date) || !/^\d{1,2}:\d{2}$/.test(time || '')) return null
  const [h, m] = time.split(':').map(Number)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0)
}

export const normalizeDestination = (d) => ({
  id: String(d.id),
  accountId: String(d.accountId ?? d.social_account_id),
  canal: d.canal || 'Instagram',
  status: d.status || 'draft',
  scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : d.scheduled_at ? new Date(d.scheduled_at) : null,
  publishedAt: d.publishedAt ? new Date(d.publishedAt) : d.published_at ? new Date(d.published_at) : null,
  externalPostId: d.externalPostId ?? d.external_post_id ?? null,
  externalUrl: d.externalUrl ?? d.external_url ?? null,
  errorMessage: d.errorMessage ?? d.error_message ?? null,
})

// Añade destinos a una publicación y deriva los campos que usa la interfaz.
export function withDestinations(pub, dests) {
  if (!dests?.length) return pub
  const first = [...dests].filter((d) => d.scheduledAt).sort((a, b) => a.scheduledAt - b.scheduledAt)[0]
  return { ...pub, destinos: dests, hora: pub.hora || hhmm(first?.scheduledAt || dests[0].publishedAt) }
}
