// Milestones: where a run got to on the SCORM path (launch page, scripts, something shown, API lookup, initialise,
// read, write, commit, finish), and how two runs compare. Pure: takes a trace and the boot graph of the launch page.
import { isLab } from './diff.js'
import { bootRun } from './bootpath.js'

export const STEPS = [
  ['launched', 'Launch page loaded'], ['scripts', 'Scripts loaded'], ['shown', 'Content shown'], ['looked', 'Looked for the API'],
  ['found', 'Found the API'], ['initialised', 'Initialised'], ['read', 'Read saved data'], ['wrote', 'Wrote data'],
  ['committed', 'Committed'], ['finished', 'Finished'],
]
const READ = /^cmi\.(core\.)?(entry|lesson_location|location)$|^cmi\.suspend_data$/
const WRITE = /^cmi\.(core\.)?(lesson_location|location|lesson_status|completion_status|success_status|score\.\w+)$|^cmi\.suspend_data$/
const ok = r => r && r.status >= 200 && r.status < 400 && !r.failed
const secs = t => t == null ? '' : ` at ${(t / 1000).toFixed(1)} s`

// boot may be null (no launch page to read): then the launch and scripts are judged from the requests alone.
export function milestones(trace, boot) {
  const probe = trace.probe ?? [], api = probe.filter(p => p.type === 'api')
  const nodes = boot ? bootRun(boot, trace) : [], root = nodes[0]?.run
  const pkgReq = (trace.requests ?? []).filter(r => !isLab(r.url) && !/^(data|blob):/.test(r.url))
  const isJs = r => /\.m?js(\?|$)/i.test(r.url)
  // Script tags on other sites can't be requested through SCORM Lab's host, so they aren't counted.
  const scripts = boot ? nodes.filter(n => n.how === 'tag' && n.kind === 'script' && !/^(remote|remote-http|local)$/.test(n.status)) : pkgReq.filter(isJs)
  const scriptsBad = boot ? scripts.find(n => !n.run || n.run.failed || n.run.status >= 400) : scripts.find(r => r.failed && !r.canceled || r.status >= 400)
  const dom = probe.find(p => p.type === 'dom' && !isLab(p.frame) && ((p.text ?? 0) >= 20 || p.media > 0))
  const lookups = probe.filter(p => p.type === 'lookup' && !isLab(p.frame))
  const lastT = list => Math.max(...list.map(x => x.run?.t ?? x.t ?? 0))
  const first = (pred, text) => { const c = api.find(pred); return c && { t: c.t, evidence: text(c) } }
  const apiStep = (re, test = () => true) => first(c => re.test(c.call) && test(c), c => `${c.call}(${c.el ?? ''})`)
  const returned = re => apiStep(re, c => c.result === 'true')
  const found = lookups.find(l => l.found)
  const hit = {
    launched: boot ? ok(root) && { t: root.t, evidence: `${boot.start} responded ${root.status}` } : (r => r && { t: r.t, evidence: 'the first request succeeded' })(pkgReq.find(ok)),
    scripts: !scriptsBad && { t: scripts.length ? lastT(scripts) : null, evidence: `${scripts.length} script${scripts.length === 1 ? '' : 's'} requested, none failed` },
    shown: dom && { t: dom.t, evidence: `${dom.text} characters of text, ${dom.media} media in ${dom.frame.replace(/^lab:\/\/run\/pkg\//, '')}` },
    looked: lookups[0] ? { t: lookups[0].t, evidence: `${lookups[0].name} looked up` } : api[0] && { t: api[0].t, evidence: `${api[0].call} called` },
    found: found ? { t: found.t, evidence: `${found.name} was there` } : api[0] && { t: api[0].t, evidence: 'the API was called' },
    initialised: returned(/^(LMSInitialize|Initialize)$/),
    read: apiStep(/GetValue$/, c => READ.test(c.el)),
    wrote: apiStep(/SetValue$/, c => WRITE.test(c.el)),
    committed: returned(/^(LMSCommit|Commit)$/),
    finished: returned(/^(LMSFinish|Terminate)$/),
  }
  const list = STEPS.map(([id, label]) => {
    const h = id === 'scripts' && !hit.launched ? null : hit[id]
    return { id, label, reached: !!h, t: h?.t ?? null, evidence: h?.evidence ?? '' }
  })
  return list
}

// The last step reached, and the first not reached (null when there is none).
export const furthest = list => list.filter(s => s.reached).at(-1) ?? null
export const firstMissing = list => list.find(s => !s.reached) ?? null

// The finding that goes at the top of a package run.
export function milestoneFinding(list) {
  const f = furthest(list), m = firstMissing(list)
  return { sev: 'info', title: `Got as far as: ${f ? f.label : 'nothing'}.${m ? ` Didn’t reach: ${m.label}.` : ' Reached every step.'}`,
    detail: '', evidence: list.map(s => `${s.reached ? '✓' : '✗'} ${s.label}${s.reached ? secs(s.t) : ''}`), fix: '' }
}

// What a run did, in numbers, for comparing runs.
export function runCounts(trace) {
  const probe = trace.probe ?? [], doms = new Map(probe.filter(p => p.type === 'dom' && !isLab(p.frame)).map(d => [d.frame, d]))
  return { apiCalls: probe.filter(p => p.type === 'api').length, requests: (trace.requests ?? []).length,
    failedRequests: (trace.requests ?? []).filter(r => r.status >= 400 || r.failed && !r.canceled).length,
    uncaught: (trace.exceptions ?? []).length, visibleText: [...doms.values()].reduce((t, d) => t + (d.text ?? 0), 0) }
}

// Compares run a (before) with run b (after). Each is { milestones, counts } or just a milestone list.
export function progress(a, b) {
  const as = Array.isArray(a) ? a : a?.milestones, bs = Array.isArray(b) ? b : b?.milestones
  if (!Array.isArray(as) || !Array.isArray(bs)) throw new Error('progress needs two milestone lists.')
  const ac = a.counts ?? {}, bc = b.counts ?? {}
  const idx = l => l.findLastIndex(s => s.reached), n = l => l.filter(s => s.reached).length
  const fa = furthest(as), fb = furthest(bs), name = s => s?.label ?? 'nothing'
  const byFurthest = Math.sign(idx(bs) - idx(as)), d = byFurthest || Math.sign(n(bs) - n(as))
  const summary = byFurthest > 0 ? `got further: reached ${name(fb)} (was ${name(fa)})`
    : byFurthest < 0 ? `got less far: reached ${name(fb)} (was ${name(fa)})`
      : d > 0 ? `same furthest step (${name(fb)}), more steps reached`
        : d < 0 ? `same furthest step (${name(fb)}), fewer steps reached`
          : `no change: ${fb ? 'both reached ' + fb.label : 'neither reached any step'}`
  const counts = {}
  for (const k of new Set([...Object.keys(ac), ...Object.keys(bc)])) counts[k] = { a: ac[k], b: bc[k] }
  return { better: d, steps: as.map((s, i) => ({ id: s.id, label: s.label, a: s.reached, b: bs[i]?.reached ?? false })), counts, summary }
}

// One line: ✓ Launch page loaded  ✓ Scripts loaded  ✗ Content shown …
export const strip = list => list.map(s => `${s.reached ? '✓' : '✗'} ${s.label}`).join('  ')
