// Sirve archivos multimedia a Instagram mediante URL firmada y de corta duración.
import * as Media from './media.js'
import { queryOf } from './http.js'

const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mov: 'video/quicktime', webm: 'video/webm', mp4: 'video/mp4' }

const RATIOS = { '1:1': 1, '4:5': 0.8, '1.91:1': 1.91 }
const MIN_R = 0.8
const MAX_R = 1.91

// Convierte a JPEG (Instagram solo admite JPEG) y, si se pide, ajusta el formato: recorta (crop) o deja la imagen entera
// con bandas blancas (fit). Con "original" solo se toca la imagen si queda fuera de 4:5 – 1,91:1. Devuelve null si falla.
async function processImage(buf, ratio, fit) {
  try {
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(buf).rotate().flatten({ background: '#ffffff' }).toBuffer({ resolveWithObject: true })
    const W = info.width
    const H = info.height
    const src = W / H
    const target = ratio && RATIOS[ratio] ? RATIOS[ratio] : Math.min(MAX_R, Math.max(MIN_R, src))
    let img = sharp(data)
    if (Math.abs(src - target) > 0.005) {
      if (fit === 'crop') {
        const w = src > target ? Math.round(H * target) : W
        const h = src > target ? H : Math.round(W / target)
        img = img.extract({ left: Math.floor((W - w) / 2), top: Math.floor((H - h) / 2), width: w, height: h })
      } else {
        const cw = src > target ? W : Math.round(H * target)
        const ch = src > target ? Math.round(W / target) : H
        img = img.resize({ width: cw, height: ch, fit: 'contain', background: '#ffffff' })
      }
    }
    // En dos pasos: sharp solo aplica el último resize de una cadena.
    return await sharp(await img.toBuffer()).resize({ width: 1440, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()
  } catch { return null }
}

// Original en JPEG y dentro del rango permitido: se envía tal cual.
async function inRange(buf) {
  try {
    const sharp = (await import('sharp')).default
    const m = await sharp(buf).metadata()
    const [w, h] = (m.orientation || 1) > 4 ? [m.height, m.width] : [m.width, m.height]
    return !!w && !!h && w / h >= MIN_R - 0.005 && w / h <= MAX_R + 0.005 && (m.orientation || 1) === 1
  } catch { return false }
}

export async function handle(req, res) {
  const q = queryOf(req)
  let src = null
  const ratio = ['original', '1:1', '4:5', '1.91:1'].includes(q.r) ? q.r : ''
  const fit = ratio ? (q.f === 'crop' ? 'crop' : 'fit') : ''
  try { src = Media.verify(String(q.u || ''), Number(q.e) || 0, String(q.s || ''), ratio, fit) } catch { /* firma inválida */ }
  if (!src) { res.statusCode = 403; return res.end() }
  let mode = null // null = decidiendo, 'pass' = enviar tal cual, 'convert' = convertir a JPEG
  let buf = Buffer.alloc(0)
  let live = {}
  try {
    await Media.download(src, async (chunk) => {
      if (mode === null) {
        buf = Buffer.concat([buf, chunk])
        if (buf.length < 12) return true
        const type = Media.detectType(buf, live['content-type'] ?? '')
        if (['png', 'webp', 'gif'].includes(type) || (type === 'jpeg' && ratio)) { mode = 'convert'; return true }
        if (['jpeg', 'mp4', 'mov', 'webm'].includes(type)) {
          mode = 'pass'
          res.statusCode = 200
          res.setHeader('Content-Type', MIME[type] ?? 'video/mp4')
          if (live['content-length']) res.setHeader('Content-Length', live['content-length'])
          res.setHeader('Cache-Control', 'private, max-age=600')
          res.write(buf); buf = Buffer.alloc(0)
          return true
        }
        res.statusCode = 415
        return false
      }
      if (mode === 'convert') { buf = Buffer.concat([buf, chunk]); return buf.length <= 20971520 }
      return res.write(chunk) || (await new Promise((r) => res.once('drain', () => r(true))))
    }, { onHeaders: (_s, h) => { live = h } })
    if (mode === 'convert' && buf.length) {
      const isJpeg = Media.detectType(buf) === 'jpeg'
      const jpg = isJpeg && ratio === 'original' && (await inRange(buf)) ? buf : await processImage(buf, ratio, fit)
      if (!jpg) res.statusCode = 415
      else { res.statusCode = 200; res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Cache-Control', 'private, max-age=600'); res.write(jpg) }
    } else if (mode === null && res.statusCode === 200) res.statusCode = 502
  } catch (e) {
    console.error('[calendapp media]', e.message)
    if (!res.headersSent) res.statusCode = 502
  }
  res.end()
}
