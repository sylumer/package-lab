// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// WebKit runs (P2.3): the same launch as an Electron run, in Safari's engine through Playwright. It runs in plain Node
// (the CLI's process, or a child the apps start), not in Electron. The package and the test LMS's files are served from
// memory through the browser's request routing at https://lms.lab.invalid/ (the LMS, as lab://run/ is) and
// https://cdn.content.invalid/ (lab://content/), the probe goes in ahead of every page's own scripts, and what the browser
// reports is written as the same trace as a run in Electron, with trace.browser = 'webkit'. There is no coverage, no
// caught errors, no script sources and no script list: Playwright can't see them. Findings that use them say nothing.
// Playwright is an optional devDependency, loaded when a WebKit run starts. See docs/developer-guide.md.
import { existsSync, readFileSync, writeFileSync, renameSync, realpathSync } from 'node:fs'
import { unzip } from './zip.js'
import { analyze } from './analyze.js'
import { answerFor, buildAnswer, userAgentPin } from './pins.js'
import { probeSource, FLUSH, CAP } from './recorder.js'
import { serveRequest, launchPlan, toLab, WEBKIT_ORIGINS } from './launch.js'
import { createLrs, maskTokens, MAX_BODY } from './lrs.js'

const HOW = 'npm i -D playwright && npx playwright install webkit'
// Only a source checkout can run WebKit: a packaged app (inside the app's resources folder or app.asar, or with no package.json beside src/) has no Playwright.
const packaged = () => /\.asar|\/resources\/app\//i.test(decodeURIComponent(import.meta.url)) || !existsSync(new URL('../package.json', import.meta.url))
const INSTALL = () => packaged() ? 'WebKit runs need the Package Lab source checkout with Playwright installed; the packaged app can’t run them.' : `WebKit runs need Playwright, which isn’t installed here. Install it with: ${HOW}`
// PACKAGE_LAB_NO_PLAYWRIGHT=1 makes it fail to load, as it does where it isn't installed: for tests.
export async function loadPlaywright() {
  if (process.env.PACKAGE_LAB_NO_PLAYWRIGHT) throw new Error(INSTALL())
  try { return await import('playwright') } catch (e) {
    // Only the package 'playwright' itself being absent is "not installed"; a module it needs that is missing is a different problem.
    if (e?.code !== 'ERR_MODULE_NOT_FOUND' || !/['"]playwright['"]/.test(String(e.message).split('\n')[0])) throw e
    throw new Error(INSTALL())
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const withTimeout = (p, ms = 3000) => Promise.race([p, sleep(ms).then(() => { throw new Error('timed out') })])
const labHost = u => { try { return /^(lms\.lab|cdn\.content)\.invalid$/.test(new URL(u).hostname) } catch { return false } }
const TYPES = { document: 'Document', script: 'Script', xhr: 'XHR', fetch: 'Fetch', stylesheet: 'Stylesheet', image: 'Image', media: 'Media', font: 'Font', websocket: 'WebSocket', manifest: 'Manifest', other: 'Other' }
// A stack as Playwright gives it for a page error (V8's format, "at fn (url:line:col)", in every browser) as the trace's frames.
const frames = stack => String(stack ?? '').split('\n').map(l => /^\s*at (?:(.*?) \()?(.+?):(\d+):(\d+)\)?$/.exec(l)).filter(Boolean).slice(0, 8)
  .map(m => ({ fn: m[1] ?? '', url: toLab(m[2]), line: +m[3], col: +m[4] }))
const LOGGED = /Refused to|Content Security Policy|MIME type|Failed to load|Blocked|Mixed Content/i   // console errors that Chromium also puts in its log

// plan: from launchPlan (WebKit origins). wait: seconds. stop(): true when the run should end. onReady() once WebKit is up.
// Returns the trace.
export async function runWebkit({ plan, wait = 10, stop = () => false, onReady }) {
  const { o, files, config, headers, launch } = plan
  if (o.trace) throw new Error('Tracing the code runs only in Chromium: turn Trace the code off (or --trace) for a WebKit run.')
  const pw = await loadPlaywright(), vp = o.viewport
  let browser
  try { browser = await pw.webkit.launch() } catch (e) {
    throw new Error(/Executable doesn.t exist|install/i.test(e.message) ? (packaged() ? INSTALL() : `WebKit isn’t installed for Playwright. Install it with: ${HOW}`) : `WebKit didn’t start: ${e.message.split('\n')[0]}`)
  }
  try {
    const ctx = await browser.newContext({ viewport: { width: vp?.width ?? 1100, height: vp?.height ?? 800 }, deviceScaleFactor: vp?.deviceScaleFactor ?? 1, isMobile: !!vp?.mobile, hasTouch: !!vp?.touch,
      userAgent: userAgentPin(o.pins) ?? (vp?.userAgent || undefined), serviceWorkers: 'block' })
    const t0 = Date.now(), t = () => Date.now() - t0
    const lrs = plan.lrs ? createLrs({ ...plan.lrs, now: t }) : null   // a cmi5 or Tin Can run's LRS, answered here like the test LMS's own files
    const trace = { label: plan.label, browser: 'webkit', browserVersion: browser.version(), started: new Date().toISOString(), targets: [], scripts: [], requests: [], navigations: [], console: [], exceptions: [],
      caught: [], log: [], probe: [], exec: [], coverage: [], sources: {}, truncated: {} }
    const push = (list, item) => { if (trace[list].length < (CAP[list] ?? 5000)) trace[list].push(item); else trace.truncated[list] = true }

    // The probe's reports (binding first, so the init script finds it), and the probe itself, as ahead of every frame's own scripts.
    await ctx.exposeBinding('__labReport', (source, payload) => {
      let d
      try { d = JSON.parse(toLab(payload)) } catch { return }
      // A window's first blank page (the run's own, or one the host opens) isn't content; Electron's recorder attaches after it.
      if (d.type === 'cmi-now') return   // the Electron recorder keeps these (P2.4); the data model is read at the end
      if (d.frame === 'about:blank' && source.frame === source.page.mainFrame()) return
      push('probe', { ...d, t: t(), sid: '' })
    })
    await ctx.addInitScript({ content: probeSource({ pins: o.pins, responses: o.responses, storage: launch.storage }) })

    // Requests: one record each, made by whichever of the request event and the route comes first.
    const recs = new Map()
    let nextId = 1
    const rec = req => {
      let r = recs.get(req)
      if (!r) {
        r = { t: t(), sid: '', id: String(nextId++), url: toLab(req.url()), method: req.method(), type: TYPES[req.resourceType()] ?? 'Other', from: [] }
        const prev = req.redirectedFrom(); if (prev && recs.has(prev)) recs.get(prev).redirect = r.url
        recs.set(req, r); push('requests', r)
      }
      return r
    }
    ctx.on('request', rec)
    ctx.on('response', res => { const r = rec(res.request()); r.status = res.status(); r.mime = (res.headers()['content-type'] ?? '').split(';')[0] })
    ctx.on('requestfailed', req => { const r = rec(req), why = req.failure()?.errorText ?? 'failed'; r.failed = why; r.canceled = /cancel|abort/i.test(why) })
    // Nothing aimed at the lab hosts ever reaches the network: other schemes, ports and WebSockets there are refused.
    await ctx.routeWebSocket?.(labHost, ws => ws.close())
    await ctx.route('**/*', async route => {
      const req = route.request(), r = rec(req), u = new URL(req.url()), lms = u.origin === WEBKIT_ORIGINS.lms
      if (labHost(req.url()) && !lms && u.origin !== WEBKIT_ORIGINS.content) return route.abort().catch(() => {})
      const hit = answerFor(o.responses, toLab(req.url()), req.method())
      if (hit) {   // an answer of the run's own: the request never reaches the content's server (or the package)
        const a = buildAnswer(hit.response)
        Object.assign(r, { answered: true, answeredBy: hit.index })
        return route.fulfill({ status: a.status, headers: Object.fromEntries(a.headers.map(h => [h.name, h.value])), body: Buffer.from(a.body, 'base64') }).catch(e => {
          Object.assign(r, { answered: false, answeredBy: undefined, answerFailed: String(e?.message ?? e).slice(0, 200), answerMatch: hit.response.match })
          return route.continue().catch(() => {})
        })
      }
      if (!lms && u.origin !== WEBKIT_ORIGINS.content) return route.continue().catch(() => {})   // anything else goes to the network, as in a Chromium run
      let path
      try { path = decodeURIComponent(u.pathname) } catch { path = u.pathname }
      const s = serveRequest({ path, lms, range: req.headers().range ?? '', config, files, headers, lrs, req: { method: req.method(), search: u.search, headers: req.headers(), body: (req.postDataBuffer()?.length ?? 0) > MAX_BODY ? '' : req.postData() ?? '', tooLarge: (req.postDataBuffer()?.length ?? 0) > MAX_BODY } })
      return route.fulfill({ status: s.status, headers: s.headers, body: typeof s.body === 'string' ? Buffer.from(s.body) : s.body }).catch(() => {})
    })

    // Pages (the run's window, and any the content opens), their frames, console and uncaught errors.
    const ids = new Map(), frameId = f => { if (!ids.has(f)) ids.set(f, 'f' + (ids.size + 1)); return ids.get(f) }
    let main = null
    ctx.on('page', async page => {
      main ??= page
      push('targets', { t: t(), sid: '', parent: '', type: 'page', url: '' })
      page.on('frameattached', f => push('targets', { t: t(), sid: '', parent: '', type: 'iframe', url: '' }))
      page.on('framenavigated', f => push('navigations', { t: t(), sid: '', frame: frameId(f), parent: f.parentFrame() ? frameId(f.parentFrame()) : '', url: toLab(f.url()) }))
      page.on('console', m => {
        const loc = m.location(), text = toLab(m.text()).slice(0, 2000), level = m.type()
        push('console', { t: t(), sid: '', level, text, at: loc?.url ? [{ fn: '', url: toLab(loc.url), line: loc.lineNumber + 1, col: loc.columnNumber + 1 }] : [] })
        if ((level === 'error' || level === 'warning') && LOGGED.test(text)) push('log', { t: t(), sid: '', level, source: 'network', text: text.slice(0, 1000), url: toLab(loc?.url) })
      })
      page.on('pageerror', e => {
        const at = frames(e.stack)
        push('exceptions', { t: t(), sid: '', text: `${e.name && e.name !== 'Error' ? e.name + ': ' : 'Error: '}${e.message}`.split('\n')[0], url: at[0]?.url ?? '', line: at[0]?.line ?? 0, at })
      })
      // A window the host page opens blank (window-opener profiles) goes on to the content once this side is ready.
      const opener = await page.opener().catch(() => null)
      if (opener && opener === main) await withTimeout(main.evaluate('window.__labPopupReady?.()')).catch(() => {})
    })

    const page = await ctx.newPage()
    await page.goto(WEBKIT_ORIGINS.lms + '/__lab/host.html', { waitUntil: 'commit' }).catch(() => {})
    onReady?.()
    const until = Date.now() + wait * 1000
    while (Date.now() < until && !stop() && browser.isConnected()) await sleep(100)

    // The end: each frame sends its pending timer summary, and the LMS page's data model is read.
    let cmi = null
    if (browser.isConnected()) {
      for (const p of ctx.pages()) for (const f of p.frames()) await withTimeout(f.evaluate(FLUSH)).catch(() => {})
      await sleep(200)
      cmi = await withTimeout(page.evaluate('JSON.stringify(window.__labCmi?.() ?? null)')).then(JSON.parse).catch(() => null)
    }
    trace.cmi = cmi
    if (lrs) { trace.lrs = lrs.snapshot(); maskTokens(trace) }
    trace.ended = new Date().toISOString(); trace.duration = t()
    return trace
  } finally { await browser.close().catch(() => {}) }
}

// A package from a ZIP file, as the CLI and the apps open one.
export const openPackage = path => { const files = unzip(readFileSync(path)); return { name: path.split('/').pop(), files, analysis: analyze(files) } }

// One launch: the plan (item, options, resume data) for pkg, then the run. Returns { plan, trace }.
export async function runJob({ pkg, item, options, cmi, wait, stop, onReady }) {
  const plan = launchPlan({ pkg, item, cmi, options, origins: WEBKIT_ORIGINS })
  return { plan, trace: await runWebkit({ plan, wait: wait ?? plan.o.wait, stop, onReady }) }
}

// As a script (the apps start it this way, as plain Node): node webkit-runner.js job.json. The job is
// { zip, item, options, cmi, out, stop (a file whose appearance ends the run), ready (a file written once WebKit is up), wait }.
// It writes { trace } to out, or says why it couldn't on standard error and exits 1.
if (process.argv[1] && (() => { try { return realpathSync(process.argv[1]) === realpathSync(import.meta.filename) } catch { return false } })()) {
  try {
    const job = JSON.parse(readFileSync(process.argv[2], 'utf8')), pkg = openPackage(job.zip)
    const { trace } = await runJob({ pkg: { ...pkg, name: job.name ?? pkg.name }, item: job.item, options: job.options, cmi: job.cmi, wait: job.wait, stop: () => !!job.stop && existsSync(job.stop), onReady: () => job.ready && writeFileSync(job.ready, '') })
    writeFileSync(job.out + '.tmp', JSON.stringify({ trace })); renameSync(job.out + '.tmp', job.out)
  } catch (e) { console.error(e.message); process.exit(1) }
}
