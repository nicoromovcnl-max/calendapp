// Instagram descarga el archivo desde una URL pública. Los archivos de CalendApp viven en Drive, así que el
// servidor los sirve a través de una URL firmada y de corta duración (/api/media) que solo admite orígenes públicos.
import dns from 'node:dns/promises'
import net from 'node:net'
import * as cfg from './config.js'
import * as cryptoBox from './crypto.js'

export function normalizeSource(url) {
  let m = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/)
  if (!m && url.includes('drive.google.com')) m = url.match(/[?&]id=([\w-]+)/)
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : url
}

const b64 = (s) => Buffer.from(s).toString('base64url')
const unb64 = (s) => Buffer.from(s, 'base64url').toString()

// opts.ratio / opts.fit: formato de imagen (original|1:1|4:5|1.91:1 y crop|fit). Forman parte de la firma.
export function relayUrl(source, req, ttl = 3600, opts = {}) {
  const u = b64(normalizeSource(source))
  const e = Math.floor(Date.now() / 1000) + ttl
  const r = opts.ratio || ''
  const f = r ? opts.fit || 'fit' : ''
  const q = { u, e: String(e), s: cryptoBox.sign(`${u}|${e}|${r}|${f}`) }
  if (r) { q.r = r; q.f = f }
  return `${cfg.appUrl(req)}api/media?${new URLSearchParams(q)}`
}

export function verify(u, e, s, r = '', f = '') {
  if (!u || !s || e < Date.now() / 1000 || !cryptoBox.safeEqual(cryptoBox.sign(`${u}|${e}|${r}|${f}`), s)) return null
  return unb64(u)
}

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  }
  const l = ip.toLowerCase()
  if (l.startsWith('::ffff:')) return privateIp(l.slice(7))
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb')
}

export async function isSafeUrl(url) {
  let p
  try { p = new URL(url) } catch { return false }
  const allowPrivate = cfg.get('MEDIA_ALLOW_PRIVATE') === '1'
  if (allowPrivate) return ['http:', 'https:'].includes(p.protocol)
  if (p.protocol !== 'https:') return false
  if (net.isIP(p.hostname)) return !privateIp(p.hostname)
  try {
    const ips = await dns.lookup(p.hostname, { all: true })
    return ips.length > 0 && ips.every((i) => !privateIp(i.address))
  } catch { return false }
}

// Descarga siguiendo redirecciones a mano (cada destino se valida). sink(chunk) devuelve false para parar.
// Devuelve { status, headers } (cabeceras en minúsculas).
export async function download(url, sink, { range = null, maxBytes = 314572800, onHeaders = null } = {}) {
  for (let hop = 0; hop < 6; hop++) {
    if (!(await isSafeUrl(url))) throw new Error('Origen del archivo no permitido.')
    const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'CalendApp/2.0', ...(range ? { Range: range } : {}) }, signal: AbortSignal.timeout(240000) })
    const headers = Object.fromEntries(res.headers)
    if ([301, 302, 303, 307, 308].includes(res.status) && headers.location) { await res.body?.cancel(); url = new URL(headers.location, url).toString(); continue }
    onHeaders?.(res.status, headers)
    let sent = 0
    if (res.body) {
      const reader = res.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        sent += value.length
        if (sent > maxBytes || (await sink(Buffer.from(value))) === false) { await reader.cancel(); break }
      }
    }
    return { status: res.status, headers }
  }
  throw new Error('Demasiadas redirecciones al descargar el archivo.')
}

export function detectType(b, contentType = '') {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.subarray(0, 4).toString('latin1') === '\x89PNG') return 'png'
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif'
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  if (b.subarray(4, 8).toString('latin1') === 'ftyp') return b.subarray(8, 12).toString('latin1').includes('qt') ? 'mov' : 'mp4'
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm'
  if (/text\/html/i.test(contentType)) return 'html'
  return 'unknown'
}

// Clasifica un origen: [image|video|youtube|blocked, detalle]. Lee solo los primeros bytes.
export async function classify(source) {
  source = normalizeSource(source)
  if (/(youtube\.com|youtu\.be)/i.test(source)) return ['youtube', 'unknown']
  let buf = Buffer.alloc(0)
  let r
  try { r = await download(source, (d) => { buf = Buffer.concat([buf, d]); return buf.length < 4096 }, { range: 'bytes=0-4095' }) } catch (e) { return ['blocked', e.message] }
  const type = detectType(buf, r.headers['content-type'] ?? '')
  if (['jpeg', 'png', 'gif', 'webp'].includes(type)) return ['image', type]
  if (['mp4', 'mov', 'webm'].includes(type)) return ['video', type]
  return ['blocked', type === 'html' ? 'El enlace no devuelve un archivo (¿es público?).' : 'Formato de archivo no reconocido.']
}
