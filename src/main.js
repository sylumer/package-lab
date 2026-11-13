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
import { unzip } from './zip.js'
import { analyze } from './analyze.js'
import { Recorder } from './recorder.js'
import { compare } from './diff.js'
import { staticFindings, runFindings, launchFindings, compareFindings, sortFindings } from './rules.js'
import { bootGraph, bootRun } from './bootpath.js'
import { milestones, milestoneFinding } from './milestones.js'
import { startWeb } from './web.js'
import { normaliseOptions, cliCommand } from './options.js'
import { PRESETS, planVariants, runResult, summarise, experimentFindings } from './experiments.js'

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
  if (path.startsWith('/__lab/')) {
    const name = path.slice(7)
    if (name === 'config.json') return new Response(JSON.stringify(config), { headers: { ...headers, 'Content-Type': 'application/json' } })
    if (HOST_FILES.has(name)) return new Response(readFileSync(new URL('./host/' + name, import.meta.url)), { headers: { ...headers, 'Content-Type': mime(name) } })
  }
  if (path.startsWith('/pkg/') && pkg) {
    const p = path.slice(5), buf = pkg.files.get(p) ?? (p === '' || p.endsWith('/') ? pkg.files.get(p + 'index.html') : undefined)
    if (buf) {
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

// ---- Runs ----
// What the interfaces get for a run: everything but the script sources and raw coverage, which can be large.
const summary = r => ({ id: r.id, label: r.label, kind: r.kind, launch: r.launch, findings: r.findings, milestones: r.milestones, file: r.file,
  boot: r.boot && { ...r.boot, nodes: bootRun(r.boot, r.trace) },
  trace: { ...r.trace, sources: undefined, coverage: undefined, coveredScripts: r.trace.coverage?.length ?? 0 } })

// Milestones (package runs only) and the findings with the "Got as far as" note first.
function withProgress(kind, trace, boot, findings) {
  if (kind !== 'package') return { findings: sortFindings(findings), milestones: null }
  const ms = milestones(trace, boot)
  return { findings: [milestoneFinding(ms), ...sortFindings(findings)], milestones: ms }
}

function addRun(kind, label, launch, trace, boot) {
  const id = nextId++
  const { findings, milestones } = withProgress(kind, trace, boot, [...launchFindings(trace, boot), ...runFindings(trace, { kind, ...launch }),
    ...(kind === 'package' ? [...staticFindings(pkg?.analysis), ...(boot?.risks ?? [])] : [])])
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
function watchPopups(wc, extra, caught, wins) {
  wc.on('did-create-window', child => {
    const rec = new Recorder(child.webContents, { caught })
    rec.onProbe = p => emit('probe', p)
    extra.push(rec); wins.push(child)
    rec.start().catch(() => {})
    watchPopups(child.webContents, extra, caught, wins)
    child.on('close', e => { if (!rec.stopped) { e.preventDefault(); rec.stop().finally(() => child.destroy()) } })
  })
}

async function begin({ kind, label, url, launch, partition, caught, boot, auto }) {
  await finish()
  const win = new BrowserWindow({ width: 1100, height: 800, show: SHOW_RUNS, title: `${kind === 'reference' ? 'Reference' : 'Run'}: ${label}`,
    webPreferences: { partition, sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  const rec = new Recorder(win.webContents, { label, caught }), extra = [], wins = [win]
  rec.onProbe = p => emit('probe', p)
  win.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { show: SHOW_RUNS, webPreferences: { partition, sandbox: true, backgroundThrottling: false } } }))
  watchPopups(win.webContents, extra, caught, wins)
  active = { win, wins, rec, extra, kind, label, launch, boot, started: Date.now() }
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
    for (const k of ['targets', 'scripts', 'requests', 'navigations', 'console', 'exceptions', 'caught', 'log', 'probe', 'coverage']) trace[k].push(...t[k].map(x => ({ ...x, sid: 'popup:' + (x.sid ?? '') })))
    Object.assign(trace.sources, t.sources)
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
  pkg = { name, path, files, analysis, lastCmi: null, boots: new Map(), loaded: Date.now() }
  const info = pkgInfo()
  emit('package', info)
  return info
}
// The package as the interfaces see it: its analysis, findings before running, and launchable items.
function pkgInfo() {
  if (!pkg) return null
  const m = pkg.analysis.manifest, first = m?.items.find(i => i.type === 'sco' && i.res?.path) ?? m?.items.find(i => i.res?.path)
  return { name: pkg.name, loaded: pkg.loaded, analysis: pkg.analysis, findings: sortFindings([...staticFindings(pkg.analysis), ...(first ? bootFor(first.res.path).risks : [])]),
    items: (m?.items ?? []).filter(i => i.res).map(i => ({ index: m.items.indexOf(i), title: i.title || i.id, type: i.type, depth: i.depth, href: i.res.path ?? i.res.href })) }
}
// The boot graph of a launch page, worked out once per package.
function bootFor(path) {
  if (!pkg.boots.has(path)) pkg.boots.set(path, bootGraph(pkg.files, path))
  return pkg.boots.get(path)
}

// o: { item, cmi?, ...launch options } (see options.js). Unknown options throw.
async function launchItem({ item: itemIndex, cmi: givenCmi, ...rest }) {
  if (!pkg?.analysis.manifest) throw new Error('Open a package with a manifest first.')
  const o = normaliseOptions(rest)
  const m = pkg.analysis.manifest, item = m.items[itemIndex]
  if (!item?.res) throw new Error('That item has nothing to launch.')
  const res = item.res
  let url = res.path ? 'lab://run/pkg/' + res.path.split('/').map(encodeURIComponent).join('/') + res.query : res.href
  const params = item.params.replace(/^[?&]/, '')
  if (params) url += (url.includes('?') ? '&' : '?') + params
  const expose = !o.expose || o.expose === 'manifest' ? m.version : o.expose
  const cmi = givenCmi ?? (o.resume && pkg.lastCmi ? pkg.lastCmi : null)
  config = { expose, depth: o.depth, opener: o.opener, launch: url, cmi,
    runtime: { edition: m.edition === '2nd' ? '2nd edition' : '', learner: { id: 'learner-1', name: 'Learner, Test' }, credit: 'credit', mode: 'normal',
      launchData: item.launchData, mastery: item.mastery, maxTime: item.maxTime, timeLimitAction: item.timeLimitAction, completionThreshold: item.completionThreshold } }
  const launch = { version: m.version, expose, depth: config.depth, opener: config.opener, item: item.title || item.id, itemIndex, itemType: item.type, url, resume: !!cmi, options: o }
  await begin({ kind: 'package', label: `${pkg.name} · ${item.title || item.id} · ${expose === 'both' ? 'both APIs' : expose === 'none' ? 'no API' : 'SCORM ' + expose}${config.depth ? ' · depth ' + config.depth : ''}${config.opener ? ' · window' : ''}${cmi ? ' · resumed' : ''}`,
    url: 'lab://run/__lab/host.html', launch, partition: 'lab', caught: o.caught, boot: res.path ? bootFor(res.path) : null, auto: o.auto })
  return true
}

function readRun(file) {
  const d = JSON.parse(readFileSync(file, 'utf8'))
  if (!d.trace) throw new Error(`${basename(file)} isn’t a SCORM Lab run.`)
  const id = nextId++
  const run = { id, kind: d.kind, label: (d.label ?? basename(file)) + ' (saved)', launch: d.launch, trace: d.trace, file, boot: d.boot, package: d.package,
    ...withProgress(d.kind, d.trace, d.boot, [...launchFindings(d.trace, d.boot), ...runFindings(d.trace, { kind: d.kind, ...d.launch }), ...(d.boot?.risks ?? [])]) }
  runs.set(id, run)
  return summary(run)
}

// ---- Experiments: the same launch run several ways, one after another (see src/experiments.js) ----
// Progress goes out as 'experiment' events: { state: 'start', names } · { state: 'result', index, row } · { state: 'done', rows, findings } · { state: 'error', message }.
let experiment = null
async function experimentStart({ item, preset = 'standard', variants, ...rest }) {
  if (experiment || active) throw new Error('Something is already running. Stop it first.')
  if (!variants && !Object.hasOwn(PRESETS, preset)) throw new Error(`No preset “${preset}”. Presets: ${Object.keys(PRESETS).join(', ')}.`)
  const plan = planVariants({ base: rest, variants: variants ?? PRESETS[preset], dedupe: !variants }), job = experiment = { stop: false }, results = [], failed = new Map()
  emit('experiment', { state: 'start', names: plan.map(p => p.name) })
  ;(async () => {
    try {
      for (const [index, v] of plan.entries()) {
        if (job.stop) break
        await launchItem({ ...v.options, auto: v.options.auto || v.options.wait, item })
        const a = active
        while (a && !a.ended) await new Promise(r => setTimeout(r, 200))
        if (job.stop) break   // a run cut short by Stop is left out
        if (!a?.run) {        // it ended without being recorded: say so and carry on
          if (!index) throw new Error('The default run didn’t finish, so there is nothing to compare with.')
          failed.set(v.name, { name: v.name, failed: true, progress: 'the run didn’t finish' })
          emit('experiment', { state: 'result', index, row: failed.get(v.name) })
          continue
        }
        results.push(runResult(v.name, v.options, a.run, { runId: a.run.id }))
        emit('experiment', { state: 'result', index, row: summarise(results).at(-1) })
      }
      const rows = new Map([...summarise(results), ...failed.values()].map(r => [r.name, r]))
      emit('experiment', { state: 'done', rows: plan.map(p => rows.get(p.name) ?? null), findings: experimentFindings(results), stopped: job.stop })
    } catch (e) { emit('experiment', { state: 'error', message: e.message }) } finally { experiment = null }
  })()
  return plan.map(p => p.name)
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
  options: ({ item, ...o }) => { const options = normaliseOptions(o); return { options, command: cliCommand(options, { zip: pkg?.name, item }) } },
  reference: async o => {
    const u = new URL(o.url)
    if (!/^https?:$/.test(u.protocol)) throw new Error('A reference is a web address (http or https).')
    await begin({ kind: 'reference', label: `Reference · ${u.host}${u.pathname.length > 1 ? u.pathname.slice(0, 40) : ''}`, url: u.href, launch: { url: u.href }, partition: 'persist:reference', caught: o.caught !== false, auto: +o.auto || 0 })
    return true
  },
  'experiment-presets': () => Object.keys(PRESETS),
  'experiment-start': o => experimentStart(o),
  'experiment-stop': async () => { if (experiment) experiment.stop = true; await finish(); return true },
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
  source: ({ run, url }) => runs.get(run)?.trace.sources?.[url] ?? '',
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
