// Sirve archivos multimedia a Instagram mediante URL firmada y de corta duración.
import * as Media from './media.js'
import { queryOf } from './http.js'

const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mov: 'video/quicktime', webm: 'video/webm', mp4: 'video/mp4' }

// Convierte PNG/WebP/GIF a JPEG si sharp está disponible (Instagram solo admite JPEG en imágenes).
async function toJpeg(buf) {
  try {
    const sharp = (await import('sharp')).default
    return await sharp(buf).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer()
  } catch { return null }
}

export async function handle(req, res) {
  const q = queryOf(req)
  let src = null
  try { src = Media.verify(String(q.u || ''), Number(q.e) || 0, String(q.s || '')) } catch { /* firma inválida */ }
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
        if (['png', 'webp', 'gif'].includes(type)) { mode = 'convert'; return true }
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
      const jpg = await toJpeg(buf)
      if (!jpg) res.statusCode = 415
      else { res.statusCode = 200; res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Cache-Control', 'private, max-age=600'); res.write(jpg) }
    } else if (mode === null && res.statusCode === 200) res.statusCode = 502
  } catch (e) {
    console.error('[calendapp media]', e.message)
    if (!res.headersSent) res.statusCode = 502
  }
  res.end()
}
