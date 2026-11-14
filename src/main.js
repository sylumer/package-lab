// SCORM Lab's main process: the window, the package server (lab://run/), runs and their recorders, and the three
// ways of driving them: the desktop window (IPC), the web interface (src/web.js) and headless runs for the CLI
// (--run=<job.json>). See docs/developer-guide.md.
//
// Command-line flags (all optional):
//   <file.zip>           open this package in the window
//   --run=<job.json>     headless: launch one item, wait, write the run to job.out, quit (used by bin/scorm-lab.js)
//   --serve[=port]       start the web interface (default port 4880); --host=<address> (default 127.0.0.1)
//   --no-window          no desktop window (with --serve: a server only)
//   --show-runs          with --no-window: show the content windows anyway
import { app, BrowserWindow, ipcMain, dialog, protocol, session } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, renameSync, existsSync, unlinkSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { unzip } from './zip.js'
import { analyze } from './analyze.js'
import { Recorder, shiftTimes } from './recorder.js'
import { compare } from './diff.js'
import { staticFindings, runFindings, launchFindings, compareFindings, sortFindings } from './rules.js'
import { bootGraph, bootRun } from './bootpath.js'
import { milestones, milestoneFinding, runCounts } from './milestones.js'
import { startWeb } from './web.js'
import { normaliseOptions, cliCommand, packagePath } from './options.js'
import { overlayFiles, overrideList, overrideFinding, overrideProgressFinding, entryBuffer, isText } from './overlay.js'
import { unified } from './textdiff.js'
import { PRESETS, planVariants, runResult, summarise, experimentFindings } from './experiments.js'
import { discover, checkDiscover } from './shape.js'
import { drill, watchPins } from './drilldown.js'
import { stall, stallFinding } from './stall.js'
import { PROFILES, launchProfile, apiAt, fillParams } from './profiles.js'
import { instrument, instrumentHtml, restoreTrace, lastEvents, eventCount, MAX_TRACED } from './instrument.js'

protocol.registerSchemesAsPrivileged([{ scheme: 'lab', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])

// ---- Flags ----
const argv = process.argv.slice(1)
const flag = name => argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`))
const flagValue = (name, dflt) => { const a = flag(name); return a === undefined ? undefined : a.includes('=') ? a.slice(a.indexOf('=') + 1) : dflt }
const JOB = flagValue('run', '')
const SERVE = flag('serve') !== undefined
const WINDOW = !JOB && flag('no-window') === undefined
const SHOW_RUNS = WINDOW || flag('show-runs') !== undefined
const DEFAULT_PORT = 4880

// Headless runs use a throwaway profile, so they never touch the desktop app's saved runs or its lock.
if (JOB) app.setPath('userData', join(tmpdir(), `scorm-lab-run-${process.pid}`))
// SCORM_LAB_DATA moves everything else (saved runs, the web token, sign-ins for references): for tests and side-by-side setups.
else if (process.env.SCORM_LAB_DATA) app.setPath('userData', process.env.SCORM_LAB_DATA)

const HOST_FILES = new Set(['host.html', 'host.js', 'wrap.html', 'scorm-runtime.js'])
const MIME = { html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json',
  xml: 'application/xml', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', vtt: 'text/vtt',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', pdf: 'application/pdf', txt: 'text/plain', wasm: 'application/wasm' }
const mime = name => (MIME[extname(name).slice(1).toLowerCase()] ?? 'application/octet-stream') + (/^(html?|js|mjs|css|json|xml|svg|txt|vtt)$/i.test(extname(name).slice(1)) ? '; charset=utf-8' : '')

let ui = null, web = null, pkg = null, config = {}, active = null, nextId = 1
let served = null   // the files the running content is served from: the package's, with any overrides on top
let pkgHeaders = {} // the run's LMS profile's headers on package files: its own, and its CSP
let tracing = null  // a traced run (options.trace): { files: path → instrumented entry served in this run, untraced: path → why, sites }
const runs = new Map()
const runsDir = () => { const d = join(app.getPath('userData'), 'runs'); mkdirSync(d, { recursive: true }); return d }

// Everything the interfaces are told: the desktop window over IPC, web clients over server-sent events.
function emit(channel, data) {
  if (ui && !ui.isDestroyed()) ui.webContents.send(channel, data)
  web?.broadcast(channel, data)
}

// ---- The package server ----
function serve(req) {
  const u = new URL(req.url)
  let path
  try { path = decodeURIComponent(u.pathname) } catch { path = u.pathname }
  const headers = { 'Cache-Control': 'no-store' }
  // lab://run/ is the LMS's origin; lab://content/ serves the same package from another origin (a profile's contentOrigin: other).
  if (path.startsWith('/__lab/') && u.host === 'run') {
    const name = path.slice(7)
    if (name === 'config.json') return new Response(JSON.stringify(config), { headers: { ...headers, 'Content-Type': 'application/json' } })
    if (HOST_FILES.has(name)) return new Response(readFileSync(new URL('./host/' + name, import.meta.url)), { headers: { ...headers, 'Content-Type': mime(name) } })
  }
  if (path.startsWith('/pkg/') && pkg) {
    const p = path.slice(5), files = served ?? pkg.files, file = files.get(p) ?? (p === '' || p.endsWith('/') ? files.get(p + 'index.html') : undefined)
    const buf = file && tracing ? traceFile(files.has(p) ? p : p + 'index.html', file) : file
    if (buf) {
      Object.assign(headers, pkgHeaders)
      headers['Content-Type'] = mime(p); headers['Accept-Ranges'] = 'bytes'
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('Range') || '')
      if (range && (range[1] || range[2])) {
        const size = buf.length, start = range[1] ? +range[1] : Math.max(0, size - +range[2]), end = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1
        if (start >= size || start > end) return new Response('', { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
        return new Response(buf.subarray(start, end + 1), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}` } })
      }
      return new Response(buf, { headers })
    }
  }
  return new Response(`${path} isn’t in the package.`, { status: 404, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } })
}

// A traced run gets scripts and pages instrumented (src/instrument.js), worked out once per package and file content.
// Site ids run on across the package's files (pkg.sites), so one table serves every run of it.
function traceFile(path, buf) {
  const ext = extname(path).slice(1).toLowerCase(), html = ext === 'html' || ext === 'htm'
  if (!html && ext !== 'js' && ext !== 'mjs') return buf
  const text = buf.length > MAX_TRACED ? null : buf.toString('utf8')
  const why = text === null ? `over ${MAX_TRACED / 1024 ** 2} MB` : !Buffer.from(text, 'utf8').equals(buf) ? 'not UTF-8 text' : null
  if (why) { tracing.untraced.set(path, why); return buf }
  const key = path + '\0' + createHash('sha1').update(buf).digest('hex')
  let e = pkg.traced.get(key)
  if (!e) {
    const opts = { file: path, base: pkg.sites.length }, r = html ? instrumentHtml(text, opts) : instrument(text, { ...opts, module: ext === 'mjs' })
    for (const s of r.sites) pkg.sites.push(s)
    const error = r.error ?? r.errors?.join('; ')
    e = { original: text, code: r.code, map: r.map, scripts: html ? r.scripts : undefined, buf: r.code === text ? buf : Buffer.from(r.code, 'utf8'),
      why: error && (html ? `${r.errors.length > 1 ? 'some inline scripts' : 'an inline script'} couldn’t be read as JavaScript (${error})` : `couldn’t be read as JavaScript (${error})`) }
    pkg.traced.set(key, e)
  }
  if (e.why) tracing.untraced.set(path, e.why)
  if (e.map.length) tracing.files.set(path, e)
  return e.buf
}

// ---- Runs ----
// What the interfaces get for a run: everything but the script sources and raw coverage, which can be large.
// Changed files go to the interfaces as paths and sizes only.
const slim = l => l?.options?.files && { ...l, options: { ...l.options, files: Object.fromEntries(Object.entries(l.options.files).map(([p, e]) => [p, { size: entryBuffer(e).length }])) } }
// A traced run's events are replaced by the last 500, described (the Execution tab).
const summary = r => ({ id: r.id, label: r.label, kind: r.kind, launch: slim(r.launch) ?? r.launch, findings: r.findings, milestones: r.milestones, file: r.file,
  boot: r.boot && { ...r.boot, nodes: bootRun(r.boot, r.trace) },
  trace: { ...r.trace, sources: undefined, coverage: undefined, exec: undefined, sites: undefined, coveredScripts: r.trace.coverage?.length ?? 0,
    ...(r.trace.sites ? { execEvents: eventCount(r.trace), execTail: r.execTail ??= lastEvents(r.trace, 500) } : {}) } })

// Milestones (package runs only) and the findings with the "Got as far as" note first.
// A run that used overrides also gets a note saying so, and, if there is an earlier run of the item without them, whether the change helped.
function withProgress(kind, trace, boot, findings, launch, before) {
  if (kind !== 'package') return { findings: sortFindings(findings), milestones: null }
  const ms = milestones(trace, boot), over = overrideFinding(launch?.options?.files)
  const helped = over && before && overrideProgressFinding(before, { milestones: ms, counts: runCounts(trace) })
  // "Was waiting for" goes under the blank-page or loading-screen finding when there is one, else it sorts with the warnings.
  const waiting = stallFinding(stall(trace, ms)), sorted = sortFindings(findings), at = sorted.findLastIndex(f => /blank page|loading screen/.test(f.title))
  if (waiting && at >= 0) sorted.splice(at + 1, 0, waiting)
  else if (waiting) { sorted.push(waiting); sortFindings(sorted) }
  return { findings: [milestoneFinding(ms), ...(over ? [over] : []), ...(helped ? [helped] : []), ...sorted], milestones: ms }
}
// The latest earlier run of the same item of this package that used no overrides.
function runBefore(launch) {
  if (!Object.keys(launch?.options?.files ?? {}).length) return null
  const r = [...runs.values()].reverse().find(r => r.kind === 'package' && r.package === pkg?.name && r.launch?.itemIndex === launch.itemIndex && r.milestones && !Object.keys(r.launch.options?.files ?? {}).length)
  return r && { milestones: r.milestones, counts: runCounts(r.trace) }
}

function addRun(kind, label, launch, trace, boot) {
  const id = nextId++
  const { findings, milestones } = withProgress(kind, trace, boot, [...launchFindings(trace, boot), ...runFindings(trace, { kind, ...launch }),
    ...(kind === 'package' ? [...staticFindings(pkg?.analysis), ...(boot?.risks ?? [])] : [])], launch, runBefore(launch))
  const run = { id, kind, label, launch, trace, findings, milestones, file: '', boot, package: pkg && kind === 'package' ? pkg.name : null }
  if (!JOB) {
    const file = join(runsDir(), `${new Date().toISOString().replace(/[:.]/g, '-')}-${label.replace(/[^\w.-]+/g, '_').slice(0, 60)}.json`)
    try { writeFileSync(file, JSON.stringify(savedRun(run))); run.file = file } catch { /* not saved */ }
  }
  runs.set(id, run)
  emit('run', summary(run))
  return run
}
// A run as saved to disk: what Open saved… and the CLI read back. See docs/developer-guide.md for the format.
const savedRun = r => ({ format: 'scorm-lab-run', version: 1, kind: r.kind, label: r.label, package: r.package, launch: r.launch, trace: r.trace, boot: r.boot, findings: r.findings, milestones: r.milestones })

// Popups (window-opener profiles, or content that opens itself in a new window) get their own recorder, merged at the end.
function watchPopups(wc, extra, ropts, wins) {
  wc.on('did-create-window', child => {
    const rec = new Recorder(child.webContents, ropts)
    rec.onProbe = p => emit('probe', p)
    extra.push(rec); wins.push(child)
    rec.start().catch(() => {})
    watchPopups(child.webContents, extra, ropts, wins)
    child.on('close', e => { if (!rec.stopped) { e.preventDefault(); rec.stop().finally(() => child.destroy()) } })
  })
}

async function begin({ kind, label, url, launch, partition, caught, boot, auto, files, pins, responses, trace, headers }) {
  await finish()
  served = files ?? null   // only now: the previous run may have been using the old set
  pkgHeaders = headers ?? {}
  tracing = trace ? { files: new Map(), untraced: new Map(), sites: pkg.sites } : null
  const win = new BrowserWindow({ width: 1100, height: 800, show: SHOW_RUNS, title: `${kind === 'reference' ? 'Reference' : 'Run'}: ${label}`,
    webPreferences: { partition, sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  const ropts = { caught, pins, responses, trace: !!trace }, rec = new Recorder(win.webContents, { label, ...ropts }), extra = [], wins = [win]
  rec.onProbe = p => emit('probe', p)
  win.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { show: SHOW_RUNS, webPreferences: { partition, sandbox: true, backgroundThrottling: false } } }))
  watchPopups(win.webContents, extra, ropts, wins)
  active = { win, wins, rec, extra, kind, label, launch, boot, tracing, started: Date.now() }
  win.on('close', e => { if (active?.win === win) { e.preventDefault(); finish() } })
  if (auto > 0) { const a = active; a.timer = setTimeout(() => { if (active === a) finish() }, auto * 1000) }
  // The debugger needs a renderer: start one on a blank page, attach, then go to the content.
  await win.loadURL('about:blank')
  await rec.start()
  emit('state', { running: kind, label, auto: auto || 0 })
  live.restart()
  win.loadURL(url)
}

// The run is kept on the active object (a.run) and a.ended is set either way, so a waiting experiment can tell.
async function finish() {
  if (!active) return null
  const a = active
  try { return await finishActive(a) } finally { a.ended = true }
}
async function finishActive(a) {
  active = null
  clearTimeout(a.timer)
  live.restart()
  let cmi = null
  if (a.kind === 'package') cmi = await a.rec.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__labCmi?.() ?? null)', returnByValue: true }).then(r => JSON.parse(r.result.value)).catch(() => null)
  const trace = await a.rec.stop()
  for (const r of a.extra) {
    const t = await r.stop()
    // A popup's recorder started later: its times are moved onto the run's clock.
    const off = r.t0 - a.rec.t0
    for (const k of ['targets', 'scripts', 'requests', 'navigations', 'console', 'exceptions', 'caught', 'log', 'probe', 'exec', 'coverage']) trace[k].push(...shiftTimes(k, t[k], off).map(x => ({ ...x, sid: 'popup:' + (x.sid ?? '') })))
    Object.assign(trace.sources, t.sources); Object.assign(trace.truncated, t.truncated)
  }
  // A traced run: the site table, the files left as they were, and everything pointed back at the original files.
  if (a.tracing) {
    trace.sites = a.tracing.sites.slice()
    trace.untraced = [...a.tracing.untraced].map(([file, why]) => ({ file, why }))
    restoreTrace(trace, a.tracing.files)
  }
  trace.cmi = cmi
  if (a.kind === 'package' && cmi && pkg) pkg.lastCmi = cmi
  for (const w of a.wins) if (!w.isDestroyed()) w.destroy()
  emit('state', { running: null })
  return (a.run = addRun(a.kind, a.label, a.launch, trace, a.boot))
}

// ---- Live view: frames of the content window for remote viewers, and their clicks and keys sent back ----
// Frames are captured only while someone watches: a web client on /api/live, or a headless run with a live folder.
const live = {
  watchers: 0, dir: null, timer: null, last: null, busy: false,
  // The newest open window of the run: a popup the content opened, or the run's own window.
  target() { return active?.wins.filter(w => !w.isDestroyed()).at(-1) ?? null },
  restart() {
    clearInterval(this.timer); this.timer = null; this.last = null
    if (active && (this.watchers > 0 || this.dir)) this.timer = setInterval(() => this.capture().catch(() => {}), 400)
  },
  async capture() {
    const w = this.target()
    if (!w || this.busy) return
    this.busy = true
    try {
      let img = await w.webContents.capturePage()
      if (img.isEmpty()) return
      if (img.getSize().width > 1280) img = img.resize({ width: 1280 })
      const jpeg = img.toJPEG(70)
      if (this.last && this.last.equals(jpeg)) return
      this.last = jpeg
      const [w0, h0] = w.getContentSize(), frame = { w: w0, h: h0, t: active ? Date.now() - active.started : 0 }
      if (this.watchers > 0) web?.broadcastLive({ ...frame, jpeg: jpeg.toString('base64') })
      if (this.dir) {
        writeFileSync(join(this.dir, 'frame.jpg.tmp'), jpeg); renameSync(join(this.dir, 'frame.jpg.tmp'), join(this.dir, 'frame.jpg'))
        writeFileSync(join(this.dir, 'frame.json'), JSON.stringify(frame))
      }
    } finally { this.busy = false }
  },
  // e: { type: 'click' | 'move' | 'wheel' | 'key' | 'text', x, y (0–1 across the frame), dy, key, text }
  input(e) {
    const w = this.target()
    if (!w || !e) return false
    const wc = w.webContents, [cw, ch] = w.getContentSize()
    const x = Math.round(Math.min(1, Math.max(0, +e.x || 0)) * cw), y = Math.round(Math.min(1, Math.max(0, +e.y || 0)) * ch)
    if (e.type === 'click') {
      wc.sendInputEvent({ type: 'mouseMove', x, y })
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    } else if (e.type === 'move') wc.sendInputEvent({ type: 'mouseMove', x, y })
    else if (e.type === 'wheel') wc.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: -(+e.dy || 0), canScroll: true })
    else if (e.type === 'key' && /^(Enter|Tab|Escape|Backspace|Delete|Space|Up|Down|Left|Right|PageUp|PageDown|Home|End)$/.test(e.key)) {
      wc.sendInputEvent({ type: 'keyDown', keyCode: e.key })
      if (e.key === 'Enter' || e.key === 'Space') wc.sendInputEvent({ type: 'char', keyCode: e.key === 'Enter' ? '\r' : ' ' })
      wc.sendInputEvent({ type: 'keyUp', keyCode: e.key })
    } else if (e.type === 'text' && typeof e.text === 'string') wc.insertText(e.text.slice(0, 2000))
    else return false
    setTimeout(() => this.capture().catch(() => {}), 150)
    return true
  },
}

// ---- Packages ----
function loadPackage(path) { return loadPackageData(basename(path), readFileSync(path), path) }
function loadPackageData(name, buf, path = '') {
  const files = unzip(buf), analysis = analyze(files)
  served = null
  pkg = { name, path, files, analysis, lastCmi: null, boots: new Map(), overrides: Object.create(null), loaded: Date.now(), traced: new Map(), sites: [] }
  const info = pkgInfo()
  emit('package', info)
  return info
}
// The package as the interfaces see it: its analysis, findings before running, and launchable items.
function pkgInfo() {
  if (!pkg) return null
  const m = pkg.analysis.manifest, first = m?.items.find(i => i.type === 'sco' && i.res?.path) ?? m?.items.find(i => i.res?.path)
  return { name: pkg.name, loaded: pkg.loaded, analysis: pkg.analysis, overrides: overrideList(pkg.files, pkg.overrides), findings: sortFindings([...staticFindings(pkg.analysis), ...(first ? bootFor(first.res.path).risks : [])]),
    items: (m?.items ?? []).filter(i => i.res).map(i => ({ index: m.items.indexOf(i), title: i.title || i.id, type: i.type, depth: i.depth, href: i.res.path ?? i.res.href })) }
}
// The boot graph of a launch page, worked out once per package.
function bootFor(path, files = pkg.files) {
  if (files !== pkg.files) return bootGraph(files, path)   // with overrides: worked out again for this run
  if (!pkg.boots.has(path)) pkg.boots.set(path, bootGraph(pkg.files, path))
  return pkg.boots.get(path)
}

// o: { item, cmi?, ...launch options } (see options.js). Unknown options throw.
async function launchItem({ item: itemIndex, cmi: givenCmi, ...rest }) {
  if (!pkg?.analysis.manifest) throw new Error('Open a package with a manifest first.')
  const o = normaliseOptions({ ...rest, files: rest.files ?? pkg?.overrides })   // no files given: the session's overrides
  if (process.env.SCORM_LAB_FORCE_TRACE === '1') o.trace = true   // tests: every run traced
  const m = pkg.analysis.manifest, item = m.items[itemIndex]
  if (!item?.res) throw new Error('That item has nothing to launch.')
  const res = item.res
  const files = overlayFiles(pkg.files, o.files), prof = launchProfile(o)
  // The package's address on the LMS's origin, or on another one (the profile's contentOrigin).
  let url = res.path ? `lab://${prof.contentOrigin === 'other' ? 'content' : 'run'}/pkg/` + res.path.split('/').map(encodeURIComponent).join('/') + res.query : res.href
  const expose = !o.expose || o.expose === 'manifest' ? m.version : o.expose
  const cmi = givenCmi ?? (o.resume && pkg.lastCmi ? pkg.lastCmi : null), learner = { id: 'learner-1', name: 'Learner, Test' }
  // The manifest's parameters, then the profile's (placeholders filled in), then the launch option's.
  const params = [item.params.replace(/^[?&]/, ''), fillParams(prof.launchParams, { scoid: item.id, attempt: cmi ? 2 : 1, learner: learner.id }), o.launchParams]
  for (const q of params.filter(Boolean)) url += (url.includes('?') ? '&' : '?') + q
  config = { expose, depth: prof.frames.depth, opener: prof.launch === 'popup', launch: url, cmi, frames: prof.frames, popupDelay: prof.popupDelay, apiDelay: prof.apiDelay, apiAt: apiAt(prof),
    runtime: { edition: m.edition === '2nd' ? '2nd edition' : '', learner, credit: 'credit', mode: 'normal', limits: prof.limits, commit: prof.commit, slowMs: prof.slowMs,
      launchData: item.launchData, mastery: item.mastery, maxTime: item.maxTime, timeLimitAction: item.timeLimitAction, completionThreshold: item.completionThreshold } }
  const launch = { version: m.version, expose, depth: config.depth, opener: config.opener, item: item.title || item.id, itemIndex, itemType: item.type, url, resume: !!cmi, options: o, profile: prof }
  const headers = { ...prof.headers, ...(prof.csp ? { 'Content-Security-Policy': prof.csp } : {}) }
  await begin({ kind: 'package', label: `${pkg.name} · ${item.title || item.id} · ${expose === 'both' ? 'both APIs' : expose === 'none' ? 'no API' : 'SCORM ' + expose}${prof.name !== 'generic' ? ' · ' + prof.name : ''}${config.depth ? ' · depth ' + config.depth : ''}${config.opener ? ' · window' : ''}${cmi ? ' · resumed' : ''}`,
    url: 'lab://run/__lab/host.html', launch, partition: 'lab', caught: o.caught, boot: res.path ? bootFor(res.path, files) : null, auto: o.auto, files, pins: o.pins, responses: o.responses, trace: o.trace, headers })
  return true
}

function readRun(file) {
  const d = JSON.parse(readFileSync(file, 'utf8'))
  if (!d.trace) throw new Error(`${basename(file)} isn’t a SCORM Lab run.`)
  const id = nextId++
  const run = { id, kind: d.kind, label: (d.label ?? basename(file)) + ' (saved)', launch: d.launch, trace: d.trace, file, boot: d.boot, package: d.package,
    ...withProgress(d.kind, d.trace, d.boot, [...launchFindings(d.trace, d.boot), ...runFindings(d.trace, { kind: d.kind, ...d.launch }), ...(d.boot?.risks ?? [])], d.launch) }
  runs.set(id, run)
  return summary(run)
}

// ---- Experiments: the same launch run several ways, one after another (see src/experiments.js) ----
// Progress goes out as 'experiment' events: { state: 'start', names } · { state: 'result', index, row } · { state: 'done', rows, findings } · { state: 'error', message }.
let experiment = null
async function experimentStart({ item, preset = 'standard', variants, ...rest }) {
  rest = { ...rest, files: rest.files ?? pkg?.overrides }
  if (experiment || active) throw new Error('Something is already running. Stop it first.')
  if (!variants && !Object.hasOwn(PRESETS, preset)) throw new Error(`No preset “${preset}”. Presets: ${Object.keys(PRESETS).join(', ')}.`)
  const plan = planVariants({ base: rest, variants: variants ?? PRESETS[preset], dedupe: !variants }), job = experiment = { stop: false }, results = [], failed = new Map()
  emit('experiment', { state: 'start', names: plan.map(p => p.name) })
  ;(async () => {
    try {
      for (const [index, v] of plan.entries()) {
        if (job.stop) break
        const run = await runToEnd(item, v.options)
        if (job.stop) break   // a run cut short by Stop is left out
        if (!run) {           // it ended without being recorded: say so and carry on
          if (!index) throw new Error('The default run didn’t finish, so there is nothing to compare with.')
          failed.set(v.name, { name: v.name, failed: true, progress: 'the run didn’t finish' })
          emit('experiment', { state: 'result', index, row: failed.get(v.name) })
          continue
        }
        results.push(runResult(v.name, v.options, run, { runId: run.id }))
        emit('experiment', { state: 'result', index, row: summarise(results).at(-1) })
      }
      const rows = new Map([...summarise(results), ...failed.values()].map(r => [r.name, r]))
      emit('experiment', { state: 'done', rows: plan.map(p => rows.get(p.name) ?? null), findings: experimentFindings(results), stopped: job.stop })
    } catch (e) { emit('experiment', { state: 'error', message: e.message }) } finally { experiment = null }
  })()
  return plan.map(p => p.name)
}

// One launch, stopped after its wait; the recorded run, or null if it ended without one. Experiments and discovery use it.
async function runToEnd(item, options) {
  await launchItem({ ...options, auto: options.auto || options.wait, item })
  const a = active
  while (a && !a.ended) await new Promise(r => setTimeout(r, 200))
  return a?.run ?? null
}

// ---- Discovery: what the content wanted from its server (see src/shape.js) ----
// It shares the experiment slot (one at a time; experiment-stop stops it too). Events 'discover': { state: 'start' } ·
// { state: 'round', index, row } · { state: 'done', result } · { state: 'error', message }. The result is also saved
// in <userData>/discoveries/.
async function discoverStart({ item, request, rounds = 5, ...rest }) {
  rest = { ...rest, files: rest.files ?? pkg?.overrides }
  if (experiment || active) throw new Error('Something is already running. Stop it first.')
  if (!pkg?.analysis.manifest) throw new Error('Open a package with a manifest first.')
  rounds = +rounds; request = request || undefined
  checkDiscover({ request, rounds })
  const base = normaliseOptions(rest), job = experiment = { stop: false }
  emit('discover', { state: 'start', request: request ?? null })
  ;(async () => {
    try {
      const result = await discover({ base, request, rounds, onRound: (row, index) => emit('discover', { state: 'round', index, row }),
        run: async (name, options) => {
          const r = job.stop ? null : await runToEnd(item, options)
          if (job.stop) throw new Error('Stopped.')
          if (!r) throw new Error(`The ${name} run didn’t finish.`)
          return r
        } })
      try {
        const dir = join(app.getPath('userData'), 'discoveries'); mkdirSync(dir, { recursive: true })
        result.file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${pkg.name.replace(/[^\w.-]+/g, '_').slice(0, 60)}.json`)
        writeFileSync(result.file, JSON.stringify({ format: 'scorm-lab-discovery', version: 1, package: pkg.name, item, base, request: request || null, ...result }))
      } catch { result.file = '' }
      emit('discover', { state: 'done', result })
    } catch (e) { emit('discover', { state: 'error', message: e.message }) } finally { experiment = null }
  })()
  return true
}

// ---- Drill-down: why a run stopped (see src/drilldown.js) ----
// For a package run: traced again first if it wasn't, then (if the drill-down asks to watch values) a run with watch
// pins. It shares the experiment slot. Events 'drill': { state: 'start', run } · { state: 'step', run, note } ·
// { state: 'done', run, result } · { state: 'error', run, message }. result also has traceRun and watchRun (run ids).
async function drillStart({ run: id }) {
  const r = runs.get(+id)
  if (!r || r.kind !== 'package') throw new Error('Choose a run of a package.')
  if (experiment || active) throw new Error('Something is already running. Stop it first.')
  if (!pkg || r.package !== pkg.name) throw new Error('Open that run’s package first.')
  const base = normaliseOptions({ ...(r.launch.options ?? {}), trace: true }), item = r.launch.itemIndex, job = experiment = { stop: false }
  emit('drill', { state: 'start', run: r.id })
  ;(async () => {
    try {
      const step = async (note, options) => {
        emit('drill', { state: 'step', run: r.id, note })
        const x = job.stop ? null : await runToEnd(item, options)
        if (job.stop) throw new Error('Stopped.')
        if (!x) throw new Error('The run didn’t finish.')
        return x
      }
      const traced = r.trace.sites ? r : await step('Running it again with tracing…', base)
      const input = { trace: traced.trace, milestones: traced.milestones, files: overlayFiles(pkg.files, base.files), launch: traced.launch }
      let result = drill(input), watched = null
      if (result.watch.length) {
        watched = await step(`Watching ${result.watch.join(', ')}…`, normaliseOptions({ ...base, pins: watchPins(base, result.watch) }))
        result = drill({ ...input, watch: watched.trace })
      }
      emit('drill', { state: 'done', run: r.id, result: { ...result, traceRun: traced.id, watchRun: watched?.id ?? null } })
    } catch (e) { emit('drill', { state: 'error', run: r.id, message: e.message }) } finally { experiment = null }
  })()
  return true
}

// The override for a path, if there is one of its own (not something inherited like “constructor”).
const override = path => Object.hasOwn(pkg.overrides, path) ? pkg.overrides[path] : undefined
// A file of the open package (not an override), after checking the path. Undefined for a new file.
function ownFile(path) {
  if (!pkg) throw new Error('Open a package first.')
  if (!packagePath(path)) throw new Error(`That path isn’t inside the package: ${JSON.stringify(path)}`)
  return pkg.files.get(path)
}

// ---- What the interfaces can ask for. The desktop window calls these over IPC, web clients over HTTP. ----
const handlers = {
  'open-package': async () => {
    const r = await dialog.showOpenDialog(ui, { title: 'Open a SCORM package', filters: [{ name: 'SCORM package', extensions: ['zip'] }], properties: ['openFile'] })
    return r.canceled ? null : loadPackage(r.filePaths[0])
  },
  state: () => ({ pkg: pkgInfo(), runs: [...runs.values()].map(summary), running: active ? { running: active.kind, label: active.label } : null, web: web ? { url: web.url } : null }),
  boot: ({ item }) => { const res = pkg?.analysis.manifest?.items[item]?.res; return res?.path ? bootFor(res.path) : null },
  launch: o => launchItem(o),
  // The normalised options for the current controls, and the CLI line that repeats the launch.
  options: ({ item, ...o }) => { const options = normaliseOptions({ ...o, files: o.files ?? pkg?.overrides }); return { options, command: cliCommand(options, { zip: pkg?.name, item }) } },
  reference: async o => {
    const u = new URL(o.url)
    if (!/^https?:$/.test(u.protocol)) throw new Error('A reference is a web address (http or https).')
    await begin({ kind: 'reference', label: `Reference · ${u.host}${u.pathname.length > 1 ? u.pathname.slice(0, 40) : ''}`, url: u.href, launch: { url: u.href }, partition: 'persist:reference', caught: o.caught !== false, auto: +o.auto || 0 })
    return true
  },
  // Overrides (the Files tab). Paths are checked here, whatever the interface: no traversal, nothing outside the package.
  files: () => {
    if (!pkg) return []
    return [...new Set([...pkg.files.keys(), ...Object.keys(pkg.overrides)])].sort().map(path => { const buf = override(path) ? entryBuffer(override(path)) : pkg.files.get(path)
      return { path, size: buf.length, text: isText(buf), overridden: !!override(path) } })
  },
  file: ({ path }) => {
    const orig = ownFile(path), ov = override(path), now = ov ? entryBuffer(ov) : orig
    if (!now) throw new Error(`${path} isn’t in the package.`)
    const text = isText(now), big = now.length > 1024 ** 2
    return { path, size: now.length, text, tooBig: text && big, overridden: !!ov, content: text && !big ? now.toString('utf8') : null, crlf: text && now.includes('\r\n'),
      original: ov && orig && isText(orig) && orig.length <= 1024 ** 2 ? orig.toString('utf8') : null }
  },
  'override-set': ({ path, content, base64 }) => {
    if (!pkg) throw new Error('Open a package first.')
    if (!packagePath(path)) throw new Error(`That path isn’t inside the package: ${JSON.stringify(path)}`)
    const entry = normaliseOptions({ files: { [path]: base64 !== undefined ? { base64 } : { content } } }).files[path], orig = pkg.files.get(path)
    delete pkg.overrides[path]
    if (!(orig && entryBuffer(entry).equals(orig))) Object.defineProperty(pkg.overrides, path, { value: entry, enumerable: true, writable: true, configurable: true })   // the same as the original is not a change; defineProperty so a path called __proto__ is just a key
    return overrideList(pkg.files, pkg.overrides)
  },
  'override-revert': ({ path }) => {
    if (!pkg) throw new Error('Open a package first.')
    if (path === undefined) pkg.overrides = Object.create(null); else delete pkg.overrides[path]
    return overrideList(pkg.files, pkg.overrides)
  },
  'override-diff': ({ path }) => {
    const orig = ownFile(path), e = override(path)
    if (!e) throw new Error(`${path} hasn’t been changed.`)
    const now = entryBuffer(e)
    if (e.base64 !== undefined || (orig && !isText(orig))) return { binary: true, before: orig?.length ?? null, after: now.length }
    return { binary: false, diff: unified(orig?.toString('utf8') ?? '', now.toString('utf8')) || '(no differences)', added: !orig }
  },
  'experiment-presets': () => Object.keys(PRESETS),
  profiles: () => PROFILES,
  'experiment-start': o => experimentStart(o),
  'experiment-stop': async () => { if (experiment) experiment.stop = true; await finish(); return true },
  'discover-start': o => discoverStart(o),
  'discover-stop': async () => { if (experiment) experiment.stop = true; await finish(); return true },
  'drill-start': o => drillStart(o),
  'drill-stop': async () => { if (experiment) experiment.stop = true; await finish(); return true },
  stop: async () => { const r = await finish(); return r ? r.id : null },
  compare: ({ ref, run }) => {
    const a = runs.get(ref), b = runs.get(run)
    if (!a || !b) throw new Error('Choose two runs.')
    const cmp = compare(a.trace, b.trace)
    return { cmp, findings: sortFindings(compareFindings(cmp)) }
  },
  'open-run': async () => {
    const r = await dialog.showOpenDialog(ui, { title: 'Open a saved run', defaultPath: runsDir(), filters: [{ name: 'SCORM Lab run', extensions: ['json'] }], properties: ['openFile', 'multiSelections'] })
    return r.canceled ? [] : r.filePaths.map(readRun)
  },
  // Saved runs by name, newest first, for web clients (which can't use the file dialog).
  'saved-runs': () => readdirSync(runsDir()).filter(f => f.endsWith('.json')).map(f => { const s = statSync(join(runsDir(), f)); return { file: f, size: s.size, mtime: s.mtimeMs } })
    .sort((a, b) => b.mtime - a.mtime).slice(0, 500),
  'load-run': ({ file }) => {
    const name = basename(String(file ?? ''))
    if (!name.endsWith('.json') || !existsSync(join(runsDir(), name))) throw new Error('No such saved run.')
    return [readRun(join(runsDir(), name))]
  },
  // A script's source from a run, by address; or by package path (the Execution tab): the script as the run recorded it,
  // or for a page, the file the run was served (a changed file from its options, else the open package's, if it is that package).
  source: ({ run, url, path }) => {
    const r = runs.get(run), src = r?.trace.sources ?? {}
    if (url !== undefined) return src[url] ?? ''
    const pathOf = u => { try { const x = new URL(u); return x.protocol === 'lab:' && x.pathname.startsWith('/pkg/') ? decodeURIComponent(x.pathname.slice(5)) : null } catch { return null } }
    const hit = !/\.html?$/i.test(path) && Object.keys(src).find(u => pathOf(u) === path)
    if (hit) return src[hit]
    const files = r?.launch?.options?.files
    if (files && Object.hasOwn(files, path)) return entryBuffer(files[path]).toString('utf8')
    return (r?.package && r.package === pkg?.name && pkg.files.get(path)?.toString('utf8')) || ''
  },
  'live-input': e => live.input(e),
}
for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, (_e, arg) => fn(arg ?? {}))

// ---- Start-up ----
let pendingOpen = argv.find(a => /\.zip$/i.test(a) && !a.startsWith('--')) ?? null
function openPath(p) {
  try { const info = loadPackage(p); if (ui) { ui.show(); ui.focus() } return info } catch (e) { if (ui) dialog.showErrorBox('SCORM Lab', `Couldn’t open ${basename(p)}: ${e.message}`); else console.error(e) }
}
// macOS hands files to the app this way (Finder's Open With, `open -a`, Alfred), before or after it's ready.
app.on('open-file', (e, p) => { e.preventDefault(); if (app.isReady() && (ui || web)) openPath(p); else pendingOpen = p })

if (WINDOW) {
  if (!app.requestSingleInstanceLock()) app.exit(0)
  app.on('second-instance', (_e, args) => {
    const zip = args.find(a => /\.zip$/i.test(a) && !a.startsWith('--'))
    if (!ui) createWindow()
    if (zip) openPath(zip)
    if (ui.isMinimized()) ui.restore()
    ui.show(); ui.focus()
  })
}

function createWindow() {
  ui = new BrowserWindow({ width: 1400, height: 900, title: 'SCORM Lab', webPreferences: { preload: join(import.meta.dirname, 'preload.cjs'), contextIsolation: true, sandbox: true } })
  ui.loadFile(join(import.meta.dirname, 'ui', 'index.html'))
  ui.on('closed', () => { ui = null; if (!web && process.platform !== 'darwin') app.quit() })
  ui.webContents.once('did-finish-load', () => { if (pendingOpen) { openPath(pendingOpen); pendingOpen = null } })
}

app.whenReady().then(async () => {
  session.fromPartition('lab').protocol.handle('lab', serve)
  if (!WINDOW) app.dock?.hide()
  if (JOB) return headless(JOB).catch(e => { console.error(e); app.exit(1) })
  if (SERVE) {
    const port = flagValue('serve', '') === '0' ? 0 : +flagValue('serve', DEFAULT_PORT) || DEFAULT_PORT, host = flagValue('host', '127.0.0.1')
    web = await startWeb({ host, port, uiDir: join(import.meta.dirname, 'ui'), dataDir: app.getPath('userData'), handlers,
      upload: (name, buf) => loadPackageData(name, buf), onLive: n => { live.watchers = n; live.restart() } })
    console.log(`SCORM Lab web interface: ${web.url}`)
  }
  if (WINDOW) createWindow()
  else if (pendingOpen) { openPath(pendingOpen); pendingOpen = null }
})
// On macOS the app stays open with no window (like other Mac apps); the Dock icon brings the window back.
app.on('window-all-closed', () => { if (!web && !JOB && process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (WINDOW && !ui && app.isReady()) createWindow() })

// ---- Headless runs (bin/scorm-lab.js run) ----
// The job file: { zip, item, options (see options.js), resumeFrom, out, live (folder) }. Writes
// the run to out in the saved-run format. With live: frames to live/frame.jpg, progress to live/status.json, and
// input (and { type: 'stop' }) read from live/input/*.json.
async function headless(jobFile) {
  const job = JSON.parse(readFileSync(jobFile, 'utf8'))
  const status = s => { if (job.live) try { writeFileSync(join(job.live, 'status.json'), JSON.stringify({ ...s, t: Date.now() })) } catch { /* folder gone */ } }
  loadPackage(job.zip)
  const m = pkg.analysis.manifest
  if (!m) throw new Error('The package has no readable imsmanifest.xml, so there is nothing to launch.')
  let item = job.item ?? m.items.findIndex(i => i.type === 'sco' && i.res)
  if (item < 0) item = m.items.findIndex(i => i.res)
  const cmi = job.resumeFrom ? JSON.parse(readFileSync(job.resumeFrom, 'utf8')).trace?.cmi ?? null : null
  if (job.live) { mkdirSync(join(job.live, 'input'), { recursive: true }); live.dir = job.live }
  status({ state: 'starting' })
  const options = normaliseOptions(job.options)
  await launchItem({ ...options, resume: options.resume || !!cmi, item, cmi })
  const until = Date.now() + options.wait * 1000
  let stop = false
  while (!stop && Date.now() < until && active) {
    await new Promise(r => setTimeout(r, 200))
    if (!job.live) continue
    for (const f of readdirSync(join(job.live, 'input')).filter(f => f.endsWith('.json')).sort()) {
      const p = join(job.live, 'input', f)
      let e
      try { e = JSON.parse(readFileSync(p, 'utf8')) } catch { continue } // half-written: next time round
      try { unlinkSync(p) } catch { /* already gone */ }
      if (e?.type === 'stop') stop = true; else live.input(e)
    }
    const t = active?.rec.trace
    if (t) status({ state: 'running', until, api: t.probe.filter(p => p.type === 'api').length, requests: t.requests.length, errors: t.exceptions.length })
  }
  status({ state: 'analysing' })
  const r = await finish()
  writeFileSync(job.out + '.tmp', JSON.stringify(savedRun(r)))
  renameSync(job.out + '.tmp', job.out)
  status({ state: 'done' })
  try { rmSync(app.getPath('userData'), { recursive: true, force: true }) } catch { /* temp profile */ }
  app.exit(0)
}
