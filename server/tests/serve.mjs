// Arranca la app completa en local con Postgres en memoria y un Meta simulado (para probar el navegador de extremo a extremo).
import crypto from 'node:crypto'
import { startMock } from './mock-meta.js'
Object.assign(process.env, {
  APP_KEY: crypto.randomBytes(32).toString('base64'), ADMIN_PASSWORD: 'GL12345!', META_APP_ID: '123', META_APP_SECRET: 'test-secret', CRON_SECRET: 'cron-test',
  META_REDIRECT_URI: 'http://127.0.0.1:8900/api/instagram-callback', APP_URL: 'http://127.0.0.1:8900/', DATABASE_URL: 'pglite://memory',
  META_GRAPH_BASE: 'http://127.0.0.1:8901', META_OAUTH_TOKEN: 'http://127.0.0.1:8901/oauth/access_token', MEDIA_ALLOW_PRIVATE: '1',
})
await startMock(8901)
const { createServer } = await import('../local.js')
;(await createServer()).listen(8900, '127.0.0.1', () => console.log('listo'))
