// Retorno del inicio de sesión de Instagram (URI registrada en la app de Meta).
import * as cfg from './config.js'
import * as cryptoBox from './crypto.js'
import * as Auth from './auth.js'
import * as Repo from './repo.js'
import * as Instagram from './instagram.js'
import { now } from './db.js'
import { MetaException } from './meta-exception.js'
import { queryOf } from './http.js'

export async function handle(req, res) {
  const back = (status, msg) => {
    res.statusCode = 302
    res.setHeader('Location', `${cfg.appUrl(req)}#/settings?ig=${status}&msg=${encodeURIComponent(msg)}`)
    res.setHeader('Cache-Control', 'no-store')
    res.end()
  }
  try {
    const q = queryOf(req)
    if (q.error) return back('error', q.error === 'access_denied' ? 'Autorización cancelada en Instagram.' : String(q.error_description || 'Instagram devolvió un error.'))
    const code = String(q.code || ''); const state = String(q.state || '')
    if (!code || !state) return back('error', 'Respuesta de Instagram incompleta.')
    if (!Auth.check(req)) return back('error', 'La sesión del servidor caducó. Inicia sesión y vuelve a conectar.')
    const st = await Repo.consumeState(state)
    if (!st || !cryptoBox.safeEqual(st.session_hash, Auth.sessionHash(req))) return back('error', 'La solicitud de conexión no es válida o caducó. Inténtalo de nuevo.')

    const short = await Instagram.exchangeCode(code)
    const long = await Instagram.longLived(short.access_token)
    const me = await Instagram.me(long.access_token)
    const igId = String(me.user_id ?? short.user_id)
    const username = String(me.username ?? '').toLowerCase()
    if (!igId || !username) return back('error', 'No se pudo obtener la cuenta de Instagram.')
    const type = String(me.account_type ?? '').toUpperCase()
    if (type && !['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'].includes(type)) return back('error', `@${username} no es una cuenta profesional (Business o Creator).`)

    const meta = Object.fromEntries(Object.entries({ account_type: me.account_type, profile_picture_url: me.profile_picture_url, followers_count: me.followers_count, media_count: me.media_count, permissions: short.permissions }).filter(([, v]) => v !== undefined && v !== null))
    const fields = {
      external_account_id: igId, username, access_token_enc: cryptoBox.encrypt(long.access_token), token_expires_at: new Date(Date.now() + long.expires_in * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      token_refreshed_at: now(), status: 'connected', metadata: JSON.stringify(meta), last_error: null, connected_at: now(),
    }
    const acc = (await Repo.accountByExternal('instagram', igId)) || (await Repo.accountByUsername('instagram', username))
    if (acc) {
      if (st.project_id && !acc.project_id) fields.project_id = st.project_id
      await Repo.updateAccount(acc.id, fields)
    } else {
      const id = await Repo.addAccount('instagram', username, st.project_id || null)
      await Repo.updateAccount(id, fields)
    }
    return back('connected', `Cuenta @${username} conectada`)
  } catch (e) {
    if (e instanceof MetaException) return back('error', e.userMessage())
    console.error('[calendapp]', e)
    return back('error', 'Error interno al conectar la cuenta.')
  }
}
