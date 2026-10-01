// Scheduler real: publica los destinos programados cuya hora ya llegó y retoma los que siguen procesándose.
// No depende del navegador. Lo llama Vercel Cron o un cron externo con `Authorization: Bearer $CRON_SECRET`.
import * as cfg from './config.js'
import * as cryptoBox from './crypto.js'
import * as Repo from './repo.js'
import * as Instagram from './instagram.js'
import * as Publisher from './publisher.js'
import { now } from './db.js'
import { MetaException } from './meta-exception.js'
import { queryOf, sendJson } from './http.js'

export async function publishDue(req, budgetMs) {
  const started = Date.now()
  await Repo.setState('scheduler_last_run', now())
  const out = []
  for (const id of await Repo.dueChannelIds()) {
    if (Date.now() - started > budgetMs) break // el resto se retoma en la siguiente ejecución
    const r = await Publisher.run(id, req, 20)
    out.push({ id, status: r.status ?? '?', error: r.error_message ?? null })
  }
  return out
}

// Renueva los tokens de larga duración antes de que caduquen (60 días). Meta solo permite renovar tokens con más de 24 h que sigan vigentes.
async function refreshTokens() {
  const out = []
  for (const pub of await Repo.accounts()) {
    if (pub.status !== 'connected' || !pub.token_expires_at) continue
    if (Date.parse(pub.token_expires_at) - Date.now() > 10 * 86400 * 1000) continue // aún queda margen
    const acc = await Repo.account(pub.id)
    try {
      const t = await Instagram.refresh(Repo.token(acc))
      await Repo.updateAccount(pub.id, { access_token_enc: cryptoBox.encrypt(t.access_token), token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'), token_refreshed_at: now(), last_error: null })
      out.push({ account: pub.username, result: 'renovado' })
    } catch (e) {
      if (e instanceof MetaException) await Repo.updateAccount(pub.id, { status: e.isAuthError() ? 'expired' : 'error', last_error: e.userMessage() })
      out.push({ account: pub.username, result: e.message })
    }
  }
  return out
}

export async function handle(req, res) {
  const secret = cfg.get('CRON_SECRET')
  if (!secret) return sendJson(res, { ok: false, error: { code: 'not_configured', message: 'Falta CRON_SECRET.' } }, 503)
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!cryptoBox.safeEqual(secret, given)) return sendJson(res, { ok: false, error: { code: 'unauthorized', message: 'No autorizado.' } }, 401)
  try {
    const job = queryOf(req).job || 'publish'
    if (job === 'refresh') return sendJson(res, { ok: true, job, results: await refreshTokens() })
    return sendJson(res, { ok: true, job: 'publish', results: await publishDue(req, 40000) })
  } catch (e) {
    console.error('[calendapp cron]', e)
    return sendJson(res, { ok: false, error: { code: 'server', message: 'Error interno del servidor.' } }, 500)
  }
}
