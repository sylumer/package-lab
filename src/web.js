// The web interface: the same UI as the desktop window, served over HTTP, so Package Lab can be used from another
// machine. The UI's bridge (ui/bridge.js) turns lab.invoke into POST /api/invoke/<name> and lab.on into server-sent
// events from /api/events. Content windows still run on this Mac; /api/live streams their frames and
// /api/invoke/live-input sends clicks and keys back.
//
// Access needs the token printed at start-up (kept in <userData>/web-token, so the address can be bookmarked):
// opening /?token=… sets an HttpOnly, SameSite=Strict cookie, and every other request needs that cookie.
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { join, extname } from 'node:path'
import { networkInterfaces } from 'node:os'
import { DEFAULT_PORT } from './settings.js'

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }
const DESKTOP_ONLY = new Set(['open-package', 'open-path', 'open-run', 'export-fixed', 'export-report', 'compare-packages', 'check-folder', 'open-batch-row', 'settings', 'settings-set']) // they open file dialogs or open packages on the Mac
const MAX_UPLOAD = 1024 ** 3, MAX_JSON = 20 * 1024 ** 2

export function token(dataDir) {
  const file = join(dataDir, 'web-token')
  try { const t = readFileSync(file, 'utf8').trim(); if (/^[0-9a-f]{32,}$/.test(t)) return t } catch { /* first run */ }
  const t = randomBytes(24).toString('hex')
  writeFileSync(file, t, { mode: 0o600 })
  return t
}

const lanAddress = () => Object.values(networkInterfaces()).flat().find(i => i?.family === 'IPv4' && !i.internal)?.address

export function startWeb({ host = '127.0.0.1', port = DEFAULT_PORT, uiDir, dataDir, handlers, upload, accept = () => {}, download, onLive = () => {} }) {
  const secret = token(dataDir), files = new Set(readdirSync(uiDir))
  const events = new Set(), liveClients = new Set()
  const same = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  const cookie = req => /(?:^|;\s*)packagelab=([0-9a-f]+)/.exec(req.headers.cookie ?? '')?.[1]
  const send = (res, status, type, body, extra = {}) => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', ...extra }); res.end(body) }
  const json = (res, status, data) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(data))
  const body = (req, max) => new Promise((resolve, reject) => {
    const chunks = []; let n = 0
    req.on('data', c => { n += c.length; if (n > max) { reject(new Error('Too large.')); req.destroy() } else chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject)
  })
  const sse = (res, set) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.write(': connected\n\n')
    set.add(res)
    const ping = setInterval(() => res.write(': ping\n\n'), 20000)
    res.on('close', () => { clearInterval(ping); set.delete(res); if (set === liveClients) onLive(liveClients.size) })
    if (set === liveClients) onLive(liveClients.size)
  }

  const server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x')
      if (u.searchParams.has('token')) {
        if (!same(u.searchParams.get('token'), secret)) return send(res, 403, 'text/plain; charset=utf-8', 'Wrong token.')
        return send(res, 302, 'text/plain', '', { Location: '/', 'Set-Cookie': `packagelab=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` })
      }
      if (!same(cookie(req), secret))
        return send(res, 401, 'text/html; charset=utf-8', '<!doctype html><meta charset="utf-8"><title>Package Lab</title><p style="font:15px system-ui;margin:2em">Open the address Package Lab printed when it started (it ends <code>?token=…</code>). <code>package-lab serve --url</code> prints it again.</p>')
      const p = u.pathname
      if (req.method === 'GET' && (p === '/' || files.has(p.slice(1)))) {
        const name = p === '/' ? 'index.html' : p.slice(1)
        return send(res, 200, TYPES[extname(name)] ?? 'application/octet-stream', readFileSync(join(uiDir, name)))
      }
      if (req.method === 'GET' && p === '/api/events') return sse(res, events)
      if (req.method === 'GET' && p === '/api/live') return sse(res, liveClients)
      if (req.method === 'POST' && p === '/api/upload') {
        const name = (u.searchParams.get('name') ?? 'package.zip').split(/[\\/]/).pop().slice(0, 200) || 'package.zip'
        accept(u.searchParams.get('role'))
        return json(res, 200, { value: await upload(name, await body(req, MAX_UPLOAD), u.searchParams.get('role')) })
      }
      if (req.method === 'GET' && p === '/api/export') {   // the corrected package (P3.1), built in memory like uploads are read
        const d = await download({ only: u.searchParams.has('only') ? u.searchParams.get('only').split(',').filter(Boolean) : undefined }), plain = d.name.replace(/[^\w. -]/g, '_')
        return send(res, 200, 'application/zip', d.buf, { 'Content-Disposition': `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(d.name).replace(/['()*!]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`, 'X-Package-Lab-Summary': encodeURIComponent(JSON.stringify(d.summary)), 'Access-Control-Expose-Headers': 'X-Package-Lab-Summary' })
      }
      const m = /^\/api\/invoke\/([\w-]+)$/.exec(p)
      if (req.method === 'POST' && m && handlers[m[1]] && !DESKTOP_ONLY.has(m[1])) {
        const raw = (await body(req, MAX_JSON)).toString('utf8')
        return json(res, 200, { value: (await handlers[m[1]](raw ? JSON.parse(raw) ?? {} : {})) ?? null })
      }
      send(res, 404, 'text/plain; charset=utf-8', 'Not found.')
    } catch (e) {
      if (!res.headersSent) json(res, 500, { error: e.message ?? String(e) })
    }
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      const shown = host === '0.0.0.0' || host === '::' ? lanAddress() ?? 'localhost' : host
      const url = `http://${shown.includes(':') ? `[${shown}]` : shown}:${server.address().port}/?token=${secret}`
      const write = (set, channel, data) => { const msg = `event: ${channel}\ndata: ${JSON.stringify(data)}\n\n`; for (const r of set) r.write(msg) }
      resolve({ url, server, broadcast: (channel, data) => write(events, channel, data), broadcastLive: frame => write(liveClients, 'frame', frame), close: () => server.close() })
    })
  })
}
