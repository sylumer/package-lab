// Records one run through the Chrome DevTools Protocol: the page and, by auto-attach, every frame and worker it
// starts (so cross-origin frames are recorded too). The trace is plain JSON: see DESIGN.md.
import { readFileSync } from 'node:fs'
import { pinPrefix, userAgentPin, answerFor, buildAnswer } from './pins.js'

const PROBE = readFileSync(new URL('./host/probe.js', import.meta.url), 'utf8')
const CAP = { scripts: 5000, requests: 10000, console: 5000, caught: 2000, log: 2000, probe: 5000 }
const frames = st => (st?.callFrames ?? []).slice(0, 8).map(f => ({ fn: f.functionName, url: f.url, line: f.lineNumber + 1, col: f.columnNumber + 1 }))
const argText = a => a.type === 'string' ? a.value : a.unserializableValue ?? (a.value !== undefined ? JSON.stringify(a.value) : a.description ?? a.type)

export class Recorder {
  // pins and responses are the run's launch options (pins.js): pins go into the probe, responses are served through the Fetch domain.
  constructor(wc, { label, caught = true, pins = [], responses = [] } = {}) {
    this.wc = wc; this.dbg = wc.debugger; this.caught = caught; this.t0 = Date.now(); this.sessions = new Set([''])
    this.probe = pinPrefix(pins) + PROBE; this.userAgent = userAgentPin(pins); this.responses = responses; this.answered = new Map()
    this.trace = { label, started: new Date().toISOString(), targets: [], scripts: [], requests: [], navigations: [], console: [], exceptions: [],
      caught: [], log: [], probe: [], coverage: [], sources: {}, truncated: {} }
    this.req = new Map()
  }
  t() { return Date.now() - this.t0 }
  push(list, item) { if (this.trace[list].length < CAP[list]) this.trace[list].push(item); else this.trace.truncated[list] = true }
  send(method, params = {}, sid) { return this.dbg.sendCommand(method, params, sid || undefined) }

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
    await s('Debugger.setPauseOnExceptions', { state: this.caught ? 'all' : 'none' })
    await s('Network.enable'); await s('Log.enable')
    await s('Profiler.enable'); await s('Profiler.startPreciseCoverage', { callCount: true, detailed: true })
    if (this.userAgent) await s('Emulation.setUserAgentOverride', { userAgent: this.userAgent })
    if (this.responses.length) await s('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
    if (type === 'page' || type === 'iframe') { await s('Page.enable'); await s('Page.addScriptToEvaluateOnNewDocument', { source: this.probe }) }
    await s('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
    if (sid) await s('Runtime.runIfWaitingForDebugger')
  }

  async onEvent(method, p, sid) {
    const t = this.t()
    switch (method) {
      case 'Target.attachedToTarget':
        this.sessions.add(p.sessionId)
        this.trace.targets.push({ t, sid: p.sessionId, parent: sid, type: p.targetInfo.type, url: p.targetInfo.url })
        return this.setup(p.sessionId, p.targetInfo.type)
      case 'Target.detachedFromTarget': this.sessions.delete(p.sessionId); return
      case 'Debugger.scriptParsed':
        if (!p.url && !p.stackTrace) return // anonymous evals without a known cause are noise
        return this.push('scripts', { t, sid, id: p.scriptId, url: p.url, hash: p.hash, length: p.length, module: !!p.isModule,
          sourceMap: p.sourceMapURL || '', from: frames(p.stackTrace) })
      case 'Debugger.paused':
        if (p.reason === 'exception' || p.reason === 'promiseRejection') this.push('caught', { t, sid, text: p.data?.description?.split('\n')[0] ?? p.data?.value ?? '', uncaught: !!p.data?.uncaught, at: frames({ callFrames: p.callFrames.map(f => ({ functionName: f.functionName, url: f.url, lineNumber: f.location.lineNumber, columnNumber: f.location.columnNumber })) }) })
        return this.send('Debugger.resume', {}, sid).catch(() => {})
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
      case 'Network.responseReceived': { const r = this.req.get(p.requestId); if (r) { r.status = p.response.status; r.mime = p.response.mimeType } return }
      case 'Network.loadingFailed': { const r = this.req.get(p.requestId); if (r) { r.failed = p.blockedReason || p.corsErrorStatus?.corsError || p.errorText; r.canceled = p.canceled } return }
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
        try { this.push('probe', { t, sid, ...JSON.parse(p.payload) }) } catch { /* bad payload */ }
        this.onProbe?.(this.trace.probe.at(-1))
    }
  }

  // Coverage and sources are collected at the end, from every session still open.
  async stop() {
    if (this.stopped) return this.trace
    this.stopped = true
    if (!this.detached) {
      const byId = new Map(this.trace.scripts.map(s => [s.sid + ':' + s.id, s]))
      for (const sid of this.sessions) {
        const cov = await this.send('Profiler.takePreciseCoverage', {}, sid).catch(() => null)
        for (const sc of cov?.result ?? []) {
          const meta = byId.get(sid + ':' + sc.scriptId)
          if (!sc.url || !meta) continue
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
