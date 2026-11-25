// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// Records one run through the Chrome DevTools Protocol: the page and, by auto-attach, every frame and worker it
// starts (so cross-origin frames are recorded too). The trace is plain JSON: see DESIGN.md.
import { readFileSync } from 'node:fs'
import { pinPrefix, userAgentPin, answerFor, buildAnswer } from './pins.js'
import { shapePrefix } from './shape.js'
import { toLab } from './launch.js'

const PROBE = readFileSync(new URL('./host/probe.js', import.meta.url), 'utf8'), SHAPE = readFileSync(new URL('./host/shape-probe.js', import.meta.url), 'utf8')
const TRACE = readFileSync(new URL('./host/trace-probe.js', import.meta.url), 'utf8')
const EXEC_CAP = 200000   // execution trace events kept (the newest); see trace-probe.js
// Sends every frame's pending trace events and timer summary now. silent: a cross-origin frame's refusal mustn't pause or be recorded.
export const FLUSH = '(function f(w){try{w.__labFlush&&w.__labFlush()}catch(e){}try{w.__labFlushT&&w.__labFlushT()}catch(e){}try{for(var i=0;i<w.frames.length;i++)f(w.frames[i])}catch(e){}})(globalThis)'
export const CAP = { scripts: 5000, requests: 10000, console: 5000, caught: 2000, log: 2000, probe: 5000 }
const frames = st => (st?.callFrames ?? []).slice(0, 8).map(f => ({ fn: f.functionName, url: f.url, line: f.lineNumber + 1, col: f.columnNumber + 1 }))
const argText = a => a.type === 'string' ? a.value : a.unserializableValue ?? (a.value !== undefined ? JSON.stringify(a.value) : a.description ?? a.type)

// A lookup the browser refused because the window is on another origin (P2.1). The exception, when it is thrown, says
// only “SecurityError: Blocked a frame with origin … from accessing a cross-origin frame.”; the property's name is read
// from the code where it was thrown (line and column 0-based): w.API, w["API"]. '' when it can't be read.
export const isBlocked = text => /^SecurityError\b.*\bBlocked a frame\b/.test(text ?? '')
export function nameAt(source, line, col) {
  const rest = (source ?? '').split('\n')[line]?.slice(col) ?? '', m = /^\.?\s*([A-Za-z_$][\w$]*)|^\[\s*(['"])([^'"]*)\2/.exec(rest)
  return m ? m[1] ?? m[3] : ''
}

// A popup recorder's list moved onto the run's clock: each item's t, and for the execution trace each event's time.
export const shiftTimes = (list, items, off) => items.map(x => ({ ...x, ...(x.t === undefined ? {} : { t: x.t + off }), ...(x.end === undefined ? {} : { end: x.end + off }),
  ...(list === 'exec' ? { events: x.events.map(e => Array.isArray(e) ? [e[0] + off, ...e.slice(1)] : e) } : {}) }))

// What the probe is told about storage (P2.2): only blocking needs anything from here; partitioned is done by the main process.
export const storagePrefix = mode => mode === 'blocked' ? "globalThis.__labStorage = 'blocked';\n" : ''

// The script put into every frame ahead of the page's own: the run's pins, storage mode and shape/trace probes, then probe.js.
// The same in every browser (the CDP recorder below, and src/webkit-runner.js).
export const probeSource = ({ pins = [], responses = [], trace = false, storage = 'normal', recordInput = false } = {}) =>
  (recordInput ? 'globalThis.__labText = true;\n' : '') + storagePrefix(storage) + pinPrefix(pins) + (shapePrefix(responses) && shapePrefix(responses) + SHAPE + ';\n') + (trace ? TRACE + ';\n' : '') + PROBE

// Answers are given by main.js's https handler (Fetch.requestPaused doesn't fire for a request that handler serves), which keeps a
// log of { method, url, index } or { …, failed } in the order it answered; here each entry marks the first still-unmarked request like it.
export function markAnswers(trace, log) {
  for (const a of log) {
    const r = trace.requests.find(r => r.method === a.method && r.url === a.url && !r.answered && !r.answerFailed)
    if (r) Object.assign(r, a.failed ? { answered: false, answerFailed: a.failed, answerMatch: a.match } : { answered: true, answeredBy: a.index })
  }
}

export class Recorder {
  // pins and responses are the run's launch options (pins.js): pins go into the probe, responses are served through the Fetch domain.
  // Responses answered with @probe (shape.js) also put shape-probe.js, with their patterns, ahead of the probe.
  // storage: the run's effective mode (profiles.js storageMode); 'blocked' puts a line ahead of the probe that makes it block storage.
  // trace (a traced run, P1.4) puts trace-probe.js ahead of the probe too; its reports go to trace.exec.
  // viewport (P2.3): a device size, applied through Emulation to the page, and its user agent to every frame (a pinned user agent wins).
  constructor(wc, { label, caught = true, pins = [], responses = [], trace = false, storage = 'normal', viewport = null, recordInput = false, dark } = {}) {
    this.dark = dark; this.wc = wc; this.dbg = wc.debugger; this.caught = caught; this.t0 = Date.now(); this.sessions = new Set([''])
    this.probe = probeSource({ pins, responses, trace, storage, recordInput }); this.userAgent = userAgentPin(pins) ?? (viewport?.userAgent || undefined); this.viewport = viewport; this.responses = responses; this.answered = new Map()
    this.traced = trace; this.execCount = 0
    this.trace = { label, browser: 'chromium', started: new Date().toISOString(), targets: [], scripts: [], requests: [], navigations: [], console: [], exceptions: [],
      caught: [], log: [], probe: [], exec: [], coverage: [], sources: {}, truncated: {} }
    this.req = new Map(); this.scriptUrl = new Map()   // sid:scriptId → url, for blocked lookups' stacks
  }
  t() { return Date.now() - this.t0 }
  // The run window's content size (E1.1): now, and again whenever it changes; the trace keeps the last. A macro made from the run plays at it.
  setWindow(width, height) { this.trace.window = { width, height } }
  push(list, item) { if (this.trace[list].length < CAP[list]) this.trace[list].push(item); else this.trace.truncated[list] = true }
  send(method, params = {}, sid) { return this.dbg.sendCommand(method, params, sid || undefined) }

  // The colour scheme the content sees (E3.4): true or false pins it to the system's, undefined leaves it alone. Applies to every frame now and later.
  media() { return { features: this.dark === undefined ? [] : [{ name: 'prefers-color-scheme', value: this.dark ? 'dark' : 'light' }] } }
  setDark(dark) { this.dark = dark; return Promise.all([...this.sessions].map(sid => this.send('Emulation.setEmulatedMedia', this.media(), sid).catch(() => {}))) }
  async start() {
    this.dbg.attach('1.3')
    this.dbg.on('message', (_e, method, params, sid) => this.onEvent(method, params, sid || '').catch(() => {}))
    this.dbg.on('detach', () => { this.detached = true })
    await this.setup('', 'page')
  }
  async setup(sid, type) {
    const s = (m, p) => this.send(m, p, sid).catch(() => {})
    await s('Runtime.enable'); await s('Runtime.addBinding', { name: '__labReport' })
    await s('Debugger.enable'); await s('Debugger.setAsyncCallStackDepth', { maxDepth: 16 })
    // Uncaught exceptions pause even without caught errors, so blocked lookups are seen (only those are kept then).
    await s('Debugger.setPauseOnExceptions', { state: this.caught ? 'all' : 'uncaught' })
    await s('Network.enable'); await s('Log.enable')
    await s('Profiler.enable'); await s('Profiler.startPreciseCoverage', { callCount: true, detailed: true })
    if (this.userAgent) await s('Emulation.setUserAgentOverride', { userAgent: this.userAgent })
    if (this.viewport && !sid) {
      const { width, height, deviceScaleFactor, mobile, touch } = this.viewport
      await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile })
      await s('Emulation.setTouchEmulationEnabled', { enabled: touch })
    }
    if (this.dark !== undefined) await s('Emulation.setEmulatedMedia', this.media())   // after the device size and user agent
    if (this.responses.length) await s('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
    if (type === 'page' || type === 'iframe') { await s('Page.enable'); await s('Page.addScriptToEvaluateOnNewDocument', { source: this.probe }) }
    await s('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
    if (sid) await s('Runtime.runIfWaitingForDebugger')
  }

  async onEvent(method, p, sid) {
    const t = this.t()
    // The content is served from https://lms.lab.invalid/ (so it sees a real https address) but the trace keeps lab:// (launch.js), as in a WebKit run.
    if (JSON.stringify(p).includes('.invalid')) p = JSON.parse(toLab(JSON.stringify(p)))
    switch (method) {
      case 'Target.attachedToTarget':
        this.sessions.add(p.sessionId)
        this.trace.targets.push({ t, sid: p.sessionId, parent: sid, type: p.targetInfo.type, url: p.targetInfo.url })
        return this.setup(p.sessionId, p.targetInfo.type)
      case 'Target.detachedFromTarget': this.sessions.delete(p.sessionId); return
      case 'Debugger.scriptParsed':
        if (p.url) this.scriptUrl.set(sid + ':' + p.scriptId, p.url)
        if (!p.url && !p.stackTrace) return // anonymous evals without a known cause are noise
        return this.push('scripts', { t, sid, id: p.scriptId, url: p.url, hash: p.hash, length: p.length, module: !!p.isModule,
          sourceMap: p.sourceMapURL || '', from: frames(p.stackTrace), ...(p.startLine || p.startColumn ? { start: [p.startLine, p.startColumn] } : {}) })
      case 'Debugger.paused': {
        const text = p.data?.description?.split('\n')[0] ?? p.data?.value ?? ''
        // A lookup through parent, top or opener that another origin refused (P2.1): recorded as a probe report, with
        // the frame (its address, read while paused) and the stack. The probe can't see these: the refusal comes before
        // any accessor on the other window runs. Package Lab's own injected scripts (no address) are left out.
        const at = p.callFrames[0], url = f => f.url || this.scriptUrl.get(sid + ':' + f.location.scriptId) || ''
        if (p.reason === 'exception' && isBlocked(text) && at && url(at)) {
          const src = await this.send('Debugger.getScriptSource', { scriptId: at.location.scriptId }, sid).then(r => r.scriptSource).catch(() => '')
          const frame = await this.send('Debugger.evaluateOnCallFrame', { callFrameId: at.callFrameId, expression: 'location.href', silent: true, returnByValue: true }, sid).then(r => r.result.value).catch(() => '')
          this.push('probe', { type: 'lookup-blocked', name: nameAt(src, at.location.lineNumber, at.location.columnNumber), frame: toLab(frame),
            stack: p.callFrames.slice(0, 6).map(f => `${f.functionName || '<anonymous>'} (${url(f)}:${f.location.lineNumber + 1}:${f.location.columnNumber + 1})`), uncaught: !!p.data?.uncaught, t, sid })
          this.onProbe?.(this.trace.probe.at(-1))
        }
        if (this.caught && (p.reason === 'exception' || p.reason === 'promiseRejection')) this.push('caught', { t, sid, text, uncaught: !!p.data?.uncaught, at: frames({ callFrames: p.callFrames.map(f => ({ functionName: f.functionName, url: f.url, lineNumber: f.location.lineNumber, columnNumber: f.location.columnNumber })) }) })
        return this.send('Debugger.resume', {}, sid).catch(() => {})
      }
      case 'Network.requestWillBeSent': {
        const r = { t, sid, id: p.requestId, url: p.request.url, method: p.request.method, type: p.type, initiator: p.initiator?.type,
          from: p.initiator?.stack ? frames(p.initiator.stack) : p.initiator?.url ? [{ url: p.initiator.url, line: (p.initiator.lineNumber ?? 0) + 1 }] : [] }
        if (p.redirectResponse) { const prev = this.req.get(p.requestId); if (prev) { prev.status = p.redirectResponse.status; prev.redirect = p.request.url } }
        if (this.answered.has(p.requestId)) Object.assign(r, this.answered.get(p.requestId))
        this.req.set(p.requestId, r); return this.push('requests', r)
      }
      // Requests a response answers are fulfilled here and never reach the server; everything else carries on.
      case 'Fetch.requestPaused': {
        // At the request stage (all we enable) responseStatusCode is unset; a response-stage pause is never answered.
        const hit = p.responseStatusCode === undefined ? answerFor(this.responses, p.request.url, p.request.method) : null
        if (!hit) return this.send('Fetch.continueRequest', { requestId: p.requestId }, sid).catch(() => {})
        const a = buildAnswer(hit.response), mark = { answered: true, answeredBy: hit.index }
        if (p.networkId) { this.answered.set(p.networkId, mark); const r = this.req.get(p.networkId); if (r) Object.assign(r, mark) }
        // If answering fails, let the request go to the server and record that it wasn't answered.
        return this.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: a.status, responseHeaders: a.headers, body: a.body }, sid).catch(e => {
          const fail = { answered: false, answeredBy: undefined, answerFailed: String(e?.message ?? e).slice(0, 200), answerMatch: hit.response.match }
          if (p.networkId) { this.answered.set(p.networkId, fail); const r = this.req.get(p.networkId); if (r) Object.assign(r, fail) }
          return this.send('Fetch.continueRequest', { requestId: p.requestId }, sid).catch(() => {})
        })
      }
      case 'Network.responseReceived': { const r = this.req.get(p.requestId); if (r) { r.status = p.response.status; r.mime = p.response.mimeType; r.end = t } return }
      case 'Network.loadingFailed': { const r = this.req.get(p.requestId); if (r) { r.failed = p.blockedReason || p.corsErrorStatus?.corsError || p.errorText; r.canceled = p.canceled; r.end = t } return }
      // A dialog is recorded. During a learner-style leave (P2.4, `leaving`) a beforeunload prompt is accepted, as a learner confirming would; otherwise it is left as it was.
      case 'Page.javascriptDialogOpening':
        this.push('probe', { type: 'dialog', kind: p.type, message: String(p.message ?? '').slice(0, 200), leaving: !!this.leaving, t, sid })
        return this.leaving && p.type === 'beforeunload' ? this.send('Page.handleJavaScriptDialog', { accept: true }, sid).catch(() => {}) : undefined
      case 'Page.frameNavigated': return this.trace.navigations.push({ t, sid, frame: p.frame.id, parent: p.frame.parentId ?? '', url: p.frame.url })
      case 'Runtime.consoleAPICalled':
        return this.push('console', { t, sid, level: p.type, text: p.args.map(argText).join(' ').slice(0, 2000), at: frames(p.stackTrace).slice(0, 3) })
      case 'Runtime.exceptionThrown': {
        const d = p.exceptionDetails
        return this.trace.exceptions.push({ t, sid, text: (d.exception?.description ?? d.text).split('\n')[0], url: d.url, line: d.lineNumber + 1, at: frames(d.stackTrace) })
      }
      case 'Log.entryAdded': return this.push('log', { t, sid, level: p.entry.level, source: p.entry.source, text: p.entry.text.slice(0, 1000), url: p.entry.url ?? '' })
      case 'Runtime.bindingCalled':
        if (p.name !== '__labReport') return
        let d
        try { d = JSON.parse(p.payload) } catch { return /* bad payload */ }
        if (d?.type === 'exec' && Array.isArray(d.events)) return this.exec(t, sid, d)
        if (d?.type === 'cmi-now') { this.lastCmi = d.values; return }   // the LMS page's data model after its latest change (host.js); kept for a run that left
        this.push('probe', { ...d, t, sid })   // t last: a report's own t (the test LMS's API calls have Date.now()) must not replace the run-relative time
        this.onProbe?.(this.trace.probe.at(-1))
    }
  }

  // A batch of execution trace events: times made relative to the start of the run; the oldest dropped past EXEC_CAP.
  exec(t, sid, d) {
    for (const e of d.events) if (Array.isArray(e)) e[0] -= this.t0
    const ex = this.trace.exec
    ex.push({ t, sid, frame: d.frame, events: d.events })
    this.execCount += d.events.length
    if (d.wrapped) this.trace.truncated.exec = true
    while (this.execCount > EXEC_CAP) {
      const drop = Math.min(ex[0].events.length, this.execCount - EXEC_CAP)
      ex[0].events.splice(0, drop); this.execCount -= drop; this.trace.truncated.exec = true
      if (!ex[0].events.length) ex.shift()
    }
  }

  // Coverage and sources are collected at the end, from every session still open.
  async stop() {
    if (this.stopped) return this.trace
    this.stopped = true
    if (!this.detached) {
      for (const sid of this.sessions) await this.send('Runtime.evaluate', { expression: FLUSH, silent: true }, sid).catch(() => {})
      const byId = new Map(this.trace.scripts.map(s => [s.sid + ':' + s.id, s]))
      for (const sid of this.sessions) {
        const cov = await this.send('Profiler.takePreciseCoverage', {}, sid).catch(() => null)
        for (const sc of cov?.result ?? []) {
          const meta = byId.get(sid + ':' + sc.scriptId)
          if (!sc.url || !meta) continue
          sc.url = toLab(sc.url)
          this.trace.coverage.push({ sid, id: sc.scriptId, url: sc.url, hash: meta.hash,
            fns: sc.functions.map(f => [f.functionName, f.ranges.flatMap(r => [r.startOffset, r.endOffset, r.count])]) })
          if (!(sc.url in this.trace.sources)) {
            const src = await this.send('Debugger.getScriptSource', { scriptId: sc.scriptId }, sid).catch(() => null)
            this.trace.sources[sc.url] = src?.scriptSource?.length < 30e6 ? src.scriptSource : ''
          }
        }
      }
      try { this.dbg.detach() } catch { /* already gone */ }
    }
    this.trace.ended = new Date().toISOString(); this.trace.duration = this.t()
    return this.trace
  }
}
