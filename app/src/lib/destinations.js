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

// ── Zonas horarias ────────────────────────────────────────────────────────
export const TIMEZONES = ['Europe/Madrid', 'Atlantic/Canary', 'Europe/London', 'UTC', 'America/New_York', 'America/Mexico_City', 'America/Bogota', 'America/Argentina/Buenos_Aires']
export const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid' } catch { return 'Europe/Madrid' } }
export const defaultTz = () => (TIMEZONES.includes(browserTz()) ? browserTz() : 'Europe/Madrid')

const validTz = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }
function zoneParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const o = {}
  f.formatToParts(date).forEach((x) => { o[x.type] = x.value })
  return o
}
// "HH:MM" de un instante en la zona indicada (por defecto, la del navegador).
export function hhmmIn(date, tz) {
  if (!(date instanceof Date) || isNaN(date)) return ''
  if (!tz || !validTz(tz)) return hhmm(date)
  const p = zoneParts(date, tz)
  return `${p.hour}:${p.minute}`
}
// Instante UTC que corresponde a "fecha + hora" en la zona indicada.
export function combineDateTime(date, time, tz) {
  if (!(date instanceof Date) || isNaN(date) || !/^\d{1,2}:\d{2}$/.test(time || '')) return null
  const [h, m] = time.split(':').map(Number)
  if (!tz || !validTz(tz)) return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0)
  const guess = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0)
  let t = guess
  for (let i = 0; i < 2; i++) {
    const p = zoneParts(new Date(t), tz)
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, 0)
    t += guess - asUtc
  }
  return new Date(t)
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
  timezone: d.timezone || null,
})

export const destTime = (d) => hhmmIn(d?.scheduledAt || d?.publishedAt, d?.timezone)

export const normalizeEvent = (e) => ({ channelId: String(e.channel_id ?? e.channelId), at: new Date(e.at), type: e.type, message: e.message || '' })
export const EVENT_LABEL = { created: 'Creada', draft: 'Guardada como borrador', scheduled: 'Programada', rescheduled: 'Reprogramada', publishing: 'Publicando…', resumed: 'Reanudada', published: 'Publicada', failed: 'Error', cancelled: 'Cancelada' }

// Añade destinos a una publicación y deriva los campos que usa la interfaz.
export function withDestinations(pub, dests) {
  if (!dests?.length) return pub
  const first = [...dests].filter((d) => d.scheduledAt).sort((a, b) => a.scheduledAt - b.scheduledAt)[0]
  return { ...pub, destinos: dests, hora: pub.hora || destTime(first || dests[0]) }
}
