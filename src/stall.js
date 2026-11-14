// Why it stalled (P1.6): when the content goes quiet short of a milestone, what it was still waiting for. Pure: takes a
// trace (the probe's timers, listener, msg-run and post reports, plus the execution trace if there is one) and the
// milestone list. The probe is src/host/probe.js; the formats are in docs/developer-guide.md.
//
//   stall(trace, milestones) → { stalled, pollers, unanswered, listeners, pending, last, waiting }
//   stallFinding(result)     → a finding, or null
import { isLab } from './diff.js'
import { describe, show } from './instrument.js'
import { firstMissing } from './milestones.js'

export const REPLY = 2000, HEARD = 1000   // ms after a message in which a reply, or a listener running, counts
const norm = u => String(u ?? '').split('#')[0]
const short = u => String(u ?? '').replace(/^lab:\/\/run\/pkg\//, '')
const code = s => '`' + s + '`'
// A stack line, "fn (url:line:col)" or "url:line:col".
const parse = s => { const m = /^(?:(.*?) \()?(.*?):(\d+):(\d+)\)?$/.exec(s ?? ''); return m ? { fn: m[1] ?? '', url: m[2], line: +m[3] } : { fn: '', url: String(s ?? ''), line: 0 } }
const where = s => { const p = parse(s); return `${p.fn ? p.fn + ' ' : ''}${short(p.url)}:${p.line}` }
const pkgFile = u => { try { const x = new URL(u); return x.protocol === 'lab:' && x.pathname.startsWith('/pkg/') ? decodeURIComponent(x.pathname.slice(5)) : null } catch { return null } }
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

// Decisions by site: how many times each was taken and the last event ([time, 3, site, result, preview…]).
function decisions(trace) {
  const m = new Map()
  for (const b of trace.exec ?? []) for (const e of b.events) {
    if (e[1] === 3) { const c = m.get(e[2]) ?? { n: 0, last: null }; c.n++; if (!c.last || e[0] >= c.last[0]) c.last = e; m.set(e[2], c) }
    else if (e[1] === 4 && m.has(e[2])) m.get(e[2]).n += e[4]
  }
  return m
}
// The decision a timer's callback most likely tested: in the file that made the timer, taken about as often as the timer
// fired (a test the callback runs once per firing), nearest the line that made it.
// ponytail: matches by file and count, not by the callback's own code; a second test in the file taken as often can be picked.
function condition(trace, dec, site, fired) {
  const at = parse(site), file = pkgFile(at.url)
  if (!file || !trace.sites) return null
  let best = null
  for (const [id, c] of dec) {
    const s = trace.sites[id]
    if (!s || s.file !== file || c.n < fired * 0.8 || c.n > fired * 1.5 + 2) continue
    const score = [Math.abs(c.n - fired), Math.abs(s.line - at.line)]
    if (!best || score[0] < best.score[0] || score[0] === best.score[0] && score[1] < best.score[1]) best = { id, c, score }
  }
  if (!best) return null
  const s = trace.sites[best.id], ev = best.c.last
  return { text: s.args?.length === 1 && ev[4] ? `${s.args[0]} → ${show(ev[4])}` : `${s.text} → ${ev[3] ? 'true' : 'false'}`, expr: s.args?.length === 1 ? s.args[0] : s.text, n: best.c.n, say: describe(ev, s) }
}

// What a message was, in a few words: its type if it has one ("player-ready"), else its keys.
const label = sh => {
  const v = sh?.vals ?? {}, t = [v.type, v.event, v.action, v.name, v.message, sh?.value].find(x => typeof x === 'string')
  return t !== undefined ? `“${t}”` : sh?.keys?.length ? `a message with {${sh.keys.join(', ')}}` : `a ${sh?.kind ?? 'message'} message`
}
const place = u => isLab(u) ? 'the LMS window' : short(u)

// The last code that ran: the last events of an execution trace, or, without one, the last functions coverage shows ran,
// scripts in load order.
function lastCode(trace) {
  const all = []
  for (const b of trace.exec ?? []) for (const e of b.events) all.push(e)
  if (all.length && trace.sites) {
    all.sort((a, b) => a[0] - b[0])
    return { traced: true, items: all.slice(-5).map(e => { const s = trace.sites[e[2]]; return `${s ? `${s.file}:${s.line} ` : ''}${describe(e, s)}` }) }
  }
  const cov = new Map((trace.coverage ?? []).map(c => [c.sid + ':' + c.id, c])), items = []
  for (const sc of [...(trace.scripts ?? [])].reverse()) {
    const c = cov.get(sc.sid + ':' + sc.id)
    if (!c || isLab(c.url)) continue
    for (const [name, r] of [...c.fns].reverse()) if (name && r[2] > 0 && items.length < 5) items.push(`${name} in ${short(c.url)}`)
    if (items.length >= 5) break
  }
  return { traced: false, items }
}

export function stall(trace, milestones) {
  const probe = trace.probe ?? [], end = trace.duration ?? Math.max(0, ...probe.map(p => p.t ?? 0)), content = p => !isLab(p.frame)
  const stalled = !milestones || !milestones.find(m => m.id === 'wrote')?.reached
  // Active pollers: the last summary of each frame's timers.
  const summaries = new Map()
  for (const p of probe) if (p.type === 'timers' && content(p)) summaries.set(p.sid + '|' + p.frame, p)
  const dec = decisions(trace), pollers = []
  for (const p of summaries.values()) p.list.forEach(([kind, delay, created, fired, cleared, since], i) => {
    if (fired < 3 || since == null || kind === 'interval' && created <= cleared || kind === 'timeout' && created < 2) return
    if (end - (p.t - since) > Math.max(2000, 3 * delay)) return   // not firing at the end
    const site = p.sites[i], cond = condition(trace, dec, site, fired)
    pollers.push({ frame: p.frame, kind, site: where(site), every: delay, fired, condition: cond,
      say: `${where(site)} ${kind === 'interval' ? 'polls' : 'keeps re-arming a timeout'} every ${delay} ms (${plural(fired, 'run')})${cond ? `; tests ${code(cond.text)}, ${plural(cond.n, 'time')}` : ''}` })
  })
  pollers.sort((a, b) => !b.condition - !a.condition || b.fired - a.fired)

  // Messages sent with nothing to answer them.
  const posts = probe.filter(p => p.type === 'post'), listeners = probe.filter(p => p.type === 'listener'), runs = probe.filter(p => p.type === 'msg-run')
  const groups = new Map()
  for (const p of posts) {
    if (!p.to) continue   // another origin: not visible from here
    const ran = runs.some(r => norm(r.frame) === norm(p.to) && r.t >= p.t && r.t <= p.t + HEARD)
    const heard = listeners.some(l => norm(l.frame) === norm(p.to))
    const replied = posts.some(q => q !== p && q.t >= p.t && q.t <= p.t + REPLY && norm(q.to) !== norm(p.to))
    const why = !ran ? heard ? 'not-handled' : 'no-listener' : replied ? null : 'no-reply'
    if (!why) continue
    const key = [p.to, label(p.shape), why].join('|'), g = groups.get(key)
    if (g) g.count = Math.max(g.count, p.n ?? 1)   // n is the probe's running count for that message
    else groups.set(key, { to: p.to, message: label(p.shape), why, t: p.t, from: p.stack?.[0] ? where(p.stack[0]) : '', origin: p.origin, count: p.n ?? 1,
      say: `${p.stack?.[0] ? where(p.stack[0]) + ' sent ' : 'Sent '}${label(p.shape)} to ${place(p.to)}${p.origin ? ` (origin ${p.origin})` : ''}: ${why === 'no-listener' ? 'nothing there was listening' : why === 'not-handled' ? 'its listener did not run' : 'its listener ran but nothing was sent back'}` })
  }
  const unanswered = [...groups.values()]

  // Listeners in the content that never ran.
  const ran = new Set(runs.map(r => r.sid + '|' + r.frame + '|' + r.id))
  const waiting = listeners.filter(l => content(l) && !ran.has(l.sid + '|' + l.frame + '|' + l.id)).map(l => ({ frame: l.frame, site: l.stack?.[0] ? where(l.stack[0]) : '', say: `${l.stack?.[0] ? where(l.stack[0]) : short(l.frame)} listens for a message that never came` }))

  const pending = trace.requests.filter(r => r.status == null && !r.failed && !r.canceled && !isLab(r.url) && !/^(data|blob):/.test(r.url)).map(r => ({ url: short(r.url), t: r.t, say: `Still waiting at the end for ${short(r.url)} (asked at ${(r.t / 1000).toFixed(1)} s)` }))
  return { stalled, pollers, unanswered, listeners: waiting, pending, last: lastCode(trace), waiting: pollers.length + unanswered.length + waiting.length + pending.length,
    missing: milestones ? firstMissing(milestones)?.label ?? '' : '' }
}

// "The content was waiting for: …", or null when it wasn't stalled or nothing waiting was seen.
export function stallFinding(s) {
  if (!s?.stalled || !s.waiting) return null
  const parts = [
    ...s.unanswered.map(u => `a reply to ${u.message}`),
    ...s.pollers.map(p => p.condition ? `${code(p.condition.expr)} to change (checked every ${p.every} ms)` : `a timer at ${p.site} (every ${p.every} ms)`),
    ...(s.listeners.length ? [`a message to arrive (${plural(s.listeners.length, 'listener')} never ran)`] : []),
    ...(s.pending.length ? [`${plural(s.pending.length, 'request')} that never finished`] : []),
  ]
  const uniq = [...new Set(parts)]
  return { sev: 'warn', title: `The content was waiting for: ${uniq.slice(0, 3).join('; ')}${uniq.length > 3 ? '; …' : ''}`,
    detail: `${s.missing ? `The run stopped short of “${s.missing}”` : 'The run stopped short of writing data'}, and nothing failed outright: the content was still waiting. Below is what it was waiting for, and the last code it ran.`,
    evidence: [...s.unanswered, ...s.pollers, ...s.listeners.slice(0, 5), ...s.pending.slice(0, 5)].map(x => x.say).slice(0, 14)
      .concat(s.last.items.length ? [`Last ${s.last.traced ? 'events' : 'functions that ran'}: ${s.last.items.join(' · ')}`] : []),
    fix: 'Find what answers each of these in a real LMS or player (the message, the API object, the value), then give the content the same: --pin can set a value, and --override can change the page.' }
}
