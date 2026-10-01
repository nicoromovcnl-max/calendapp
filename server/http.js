import { MetaException } from './meta-exception.js'

export class HttpError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status }
}
export const fail = (code, message, status = 400) => { throw new HttpError(code, message, status) }

export function sendJson(res, data, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(data))
}

export const sendError = (res, err) => sendJson(res, { ok: false, error: { code: err.code, message: err.message } }, err.status)

export const queryOf = (req) => Object.fromEntries(new URL(req.url, 'http://x').searchParams)

export async function bodyOf(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
    try { const d = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString() : String(req.body)); return d && typeof d === 'object' ? d : {} } catch { return {} }
  }
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try { const d = JSON.parse(raw); return d && typeof d === 'object' && !Array.isArray(d) ? d : {} } catch { return {} }
}

// Petición saliente a Meta. Devuelve [status, json|null, raw].
export async function request(method, url, params = {}, timeoutMs = 30000) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  const init = { method, headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) }
  let target = url
  if (method === 'GET') { if ([...qs].length) target += (url.includes('?') ? '&' : '?') + qs } else { init.body = qs; init.headers['Content-Type'] = 'application/x-www-form-urlencoded' }
  let res
  try { res = await fetch(target, init) } catch (e) { throw new MetaException(`No se pudo contactar con Meta: ${e.message}`, 0, null, 'network', 0) }
  const raw = await res.text()
  let json = null
  try { const j = JSON.parse(raw); json = j && typeof j === 'object' ? j : null } catch { /* no JSON */ }
  return [res.status, json, raw]
}
