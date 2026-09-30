// Servidor local que imita el enrutado de Vercel (rewrites de vercel.json). Uso: node server/local.js
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' }

export async function createServer() {
  const [routes, callback, media, cron] = await Promise.all([import('./routes.js'), import('./callback.js'), import('./media-route.js'), import('./cron.js')])
  const table = {
    '/api/index': routes.handle, '/api/index.php': routes.handle,
    '/api/instagram-callback': callback.handle, '/api/instagram-callback.php': callback.handle,
    '/api/media': media.handle, '/api/media.php': media.handle, '/api/cron': cron.handle,
  }
  return http.createServer(async (req, res) => {
    const p = new URL(req.url, 'http://x').pathname
    if (table[p]) return table[p](req, res)
    const file = path.join(ROOT, p === '/' ? 'index.html' : p)
    if (file.startsWith(ROOT) && !file.includes('/server/') && !file.includes('/api/') && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
      return res.end(fs.readFileSync(file))
    }
    res.statusCode = 404; res.end('Not found')
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3000)
  ;(await createServer()).listen(port, () => console.log(`CalendApp local en http://127.0.0.1:${port}`))
}
