// Timeline (P4.2): one run's events on a shared time axis, as lanes. Pure. timelineModel(trace, milestones?) gives each
// lane's items in ms from the start of the run. timelineView(trace, milestones?, { from, to }) gives the same items as
// fractions (x, x2) of the window shown, with ticks and the density buckets, for the Timeline tab and the report to draw.
import { isLab } from './diff.js'
import { milestones as runMilestones } from './milestones.js'

// Lanes top to bottom. tab: what a click on an item opens (the tab only; the row is not selected).
export const LANES = [
  { id: 'milestones', label: 'Milestones', tab: 'Findings' },
  { id: 'requests', label: 'Requests', tab: 'Network' },
  { id: 'scripts', label: 'Scripts parsed', tab: 'Scripts' },
  { id: 'api', label: 'API calls', tab: 'API' },
  { id: 'errors', label: 'Errors', tab: 'Errors' },
  { id: 'dom', label: 'What showed', tab: 'Findings' },
  { id: 'density', label: 'Trace activity', tab: 'Execution' },   // only in a traced run
]
const BUCKETS = 80
const short = u => String(u ?? '').replace(/^lab:\/\/(?:run|content)\/pkg\//, '')
// The kind of a call, for its colour: init, get, set, commit, finish or other.
export const callKind = c => /Initiali[sz]e$/.test(c) ? 'init' : /GetValue$/.test(c) ? 'get' : /SetValue$/.test(c) ? 'set' : /Commit$/.test(c) ? 'commit' : /Finish$|Terminate$/.test(c) ? 'finish' : 'other'

// Items are { t, t2? (a bar's end), label, title, kind?, failed? }. Times in ms from the start of the run.
export function timelineModel(trace, ms) {
  const t = trace ?? {}, list = k => Array.isArray(t[k]) ? t[k] : []
  const probe = list('probe'), exec = list('exec'), reqs = list('requests'), scripts = list('scripts')
  const steps = ms ?? runMilestones(t, null)
  const api = probe.filter(p => p.type === 'api')
  const dom = probe.filter(p => p.type === 'dom' && !isLab(p.frame))
  const errors = [...list('exceptions').map(e => ({ ...e, kind: 'uncaught' })), ...list('caught').map(e => ({ ...e, kind: e.uncaught ? 'uncaught' : 'caught' }))]
  const times = [t.duration ?? 0, ...reqs.map(r => r.end ?? r.t ?? 0), ...probe.map(p => p.t ?? 0), ...list('console').map(c => c.t ?? 0)]
  let duration = 1
  for (const x of times) if (x > duration) duration = x
  const lanes = {
    milestones: steps.filter(s => s.reached && s.t != null).map(s => ({ t: s.t, id: s.id, label: s.label, title: `${s.label} at ${(s.t / 1000).toFixed(1)} s · ${s.evidence}` })),
    requests: reqs.filter(r => r.t != null).map(r => {
      const failed = r.status >= 400 || !!r.failed && !r.canceled, what = `${r.method ?? 'GET'} ${short(r.url)}`
      return { t: r.t, t2: r.end ?? r.t, label: what, failed, title: `${what} · ${failed ? 'failed: ' + (r.status ?? r.failed) : r.status ?? 'no response'} · ${(((r.end ?? r.t) - r.t) / 1000).toFixed(2)} s` }
    }),
    scripts: scripts.filter(s => s.t != null).map(s => ({ t: s.t, label: short(s.url) || '(eval)', title: `${short(s.url) || '(eval)'} · ${s.length ?? '?'} characters` })),
    api: api.filter(a => a.t != null).map(a => ({ t: a.t, kind: callKind(a.call), label: `${a.call}${a.el ? ' ' + a.el : ''}`, title: `${a.call} ${a.el ?? ''} → ${a.result ?? ''}${a.err ? ' · error ' + a.err + (a.diag ? ': ' + a.diag : '') : ''}` })),
    errors: errors.filter(e => e.t != null).map(e => ({ t: e.t, kind: e.kind, label: e.text ?? '', title: `${e.kind}: ${e.text ?? ''}` })),
    dom: dom.filter(d => d.t != null).map(d => ({ t: d.t, label: String(d.sample ?? '').slice(0, 80), title: `${d.text ?? 0} characters, ${d.media ?? 0} media${d.sample ? ': ' + String(d.sample).slice(0, 200) : ''}` })),
  }
  const model = { range: { from: 0, to: duration }, lanes, milestones: steps, missing: steps.filter(s => !s.reached).map(s => s.label) }
  if (exec.length) {   // events per bucket; a repeat record (4) counts for the times it stands for
    const size = duration / BUCKETS, buckets = new Array(BUCKETS).fill(0)
    for (const b of exec) for (const e of b.events ?? []) {
      if (!Array.isArray(e)) continue
      const i = Math.min(BUCKETS - 1, Math.max(0, Math.floor((e[0] ?? 0) / size)))
      buckets[i] += 1 + (e[1] === 4 ? e[4] || 0 : 0)
    }
    lanes.density = buckets; model.size = size
  }
  return model
}

const STEP_MS = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000, 120000, 300000, 600000]
const secs = ms => `${(ms / 1000).toFixed(ms % 1000 && ms < 10000 ? 1 : 0)} s`

// The model cut to a window (from, to in ms, default the whole run), with x positions as fractions of the window (0 to 1).
// Items outside it are left out; a bar is kept if any part of it is shown.
// The model cut to a window (from, to in ms, default the whole run; clamped to the run). x positions are fractions of the window
// (0 to 1), clamped, so a bar or a bucket that starts before the window starts at 0. Items outside it are left out.
export function timelineView(trace, ms, win = {}) {
  const m = timelineModel(trace, ms), dur = m.range.to
  const num = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)
  let from = Math.min(Math.max(0, num(win.from) ?? 0), dur), to = Math.min(Math.max(0, num(win.to) ?? dur), dur)
  if (to - from < 1) to = Math.min(dur, from + 1)
  const span = Math.max(1, to - from), at = v => (v - from) / span, clamp = v => Math.min(1, Math.max(0, v)), lanesOut = []
  for (const L of LANES) {
    if (L.id === 'density') {
      if (!m.lanes.density) continue
      let max = 1
      for (const n of m.lanes.density) if (n > max) max = n
      const items = []
      m.lanes.density.forEach((n, i) => {
        const a = i * m.size, b = a + m.size
        if (b <= from || a >= to) return
        const x = clamp(at(a)), x2 = clamp(at(b))
        items.push({ x, w: x2 - x, n, title: `${n} trace event${n === 1 ? '' : 's'} from ${secs(a)} to ${secs(b)}` })
      })
      lanesOut.push({ ...L, max, items })
      continue
    }
    const items = m.lanes[L.id].filter(it => it.t <= to && (it.t2 ?? it.t) >= from)
      .map(it => ({ ...it, x: clamp(at(it.t)), x2: it.t2 != null ? clamp(at(it.t2)) : undefined }))
    lanesOut.push({ ...L, items })
  }
  const step = STEP_MS.find(s => s >= span / 8) ?? STEP_MS.at(-1), ticks = []
  for (let v = Math.ceil(from / step) * step, n = 0; v <= to && n < 20; v += step, n++) ticks.push({ x: at(v), label: secs(v) })
  return { range: { from, to, duration: dur }, ticks, lanes: lanesOut, milestones: m.milestones, missing: m.missing }
}
