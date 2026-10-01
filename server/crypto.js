import crypto from 'node:crypto'
import { appKey } from './config.js'

// Cifrado de tokens en reposo: AES-256-GCM con APP_KEY (32 bytes en base64). Formato: base64(iv | tag | datos).
export const available = () => appKey() !== null

export function encrypt(plain) {
  const key = appKey()
  if (!key) throw new Error('APP_KEY no está configurada: no se pueden guardar tokens.')
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64')
}

export function decrypt(blob) {
  const key = appKey()
  const raw = Buffer.from(String(blob || ''), 'base64')
  if (!key || raw.length <= 28) throw new Error('No se pudo descifrar el token guardado.')
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
    d.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
  } catch {
    throw new Error('El token guardado no se pudo descifrar (¿cambió APP_KEY?).')
  }
}

// Firma HMAC (URLs de medios, sesión). Usa subclaves derivadas para no reutilizar la clave tal cual.
export function sign(data, purpose = 'media') {
  const key = appKey()
  if (!key) throw new Error('APP_KEY no está configurada.')
  return crypto.createHmac('sha256', crypto.createHmac('sha256', key).update(purpose).digest()).update(data).digest('hex')
}

export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}
