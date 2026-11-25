// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// The save-and-resume cycle (P2.4), pure: reading a macro file, making a macro from the clicks a run recorded, and the
// findings from a run that left the way a learner does and a second run that resumed from what the first left.
// Running the two launches is up to the caller (src/main.js in the apps, bin/package-lab.js headless).
import { normaliseOptions } from './options.js'

// A macro's recorded window size: { width, height } in whole pixels (100 to 10000), or null. Throws on a size that isn't one.
const macroSize = v => { if (v == null) return null; const { width, height } = normaliseOptions({ viewport: v }).viewport; return { width, height } }
// A macro file is a list of events, or { format: 'package-lab-macro', version: 1 or 2, viewport?, events }. Returns the checked
// events and the window size they were recorded at ({ width, height }, or null: version 1 files and bare lists have none).
export function readMacro(json) {
  const events = Array.isArray(json) ? json : json && typeof json === 'object' && Array.isArray(json.events) ? json.events : null
  if (!events) throw new Error('A macro file holds a list of events, or { "events": [ … ] }.')
  return { events: normaliseOptions({ macro: events }).macro, viewport: Array.isArray(json) ? null : macroSize(json.viewport) }
}
export const macroFile = (events, viewport = null) => ({ format: 'package-lab-macro', version: 2, ...(viewport ? { viewport: macroSize(viewport) } : {}), events })
export { macroSize }

// The sleep before each event: the time since the one before (the first: its own time).
export const macroDelays = events => events.map((e, i) => Math.max(0, e.t - (i ? events[i - 1].t : 0)))

// How long no request has been pending, in ms at time `now` on the run's clock; 0 while one is. requests: the recorder's (t, end).
export const quietFor = (requests, now) => requests.some(r => r.end === undefined) ? 0 : now - Math.max(0, ...requests.map(r => r.end))

// A macro recorded at a size plays at that size when the run has none; with another size the run's wins, and the note says so
// (rules.js turns it into a finding). recorded: { width, height } or null.
export function withMacroSize(options, recorded) {
  if (!recorded || !options.macro.length) return { options, note: null }
  if (!options.viewport) return { options: { ...options, viewport: normaliseOptions({ viewport: `${recorded.width}x${recorded.height}` }).viewport }, note: null }
  const used = { width: options.viewport.width, height: options.viewport.height }
  return { options, note: used.width === recorded.width && used.height === recorded.height ? null : { type: 'macro-size', recorded, used } }
}

// The clicks, keys and typing the probe saw in the content's frames (probe.js, type 'input'), as macro events.
// Text kept only with the recordInput option, and never from password-like fields (the probe reports those by length only, and they are left out here).
// A click in a frame of another origin is marked approx and isn't replayed; any other click keeps its target (E1.2).
// A click's target (the element it was made on, E1.2) is kept when it passes the macro's checks, so a bad report can't break the macro.
export const cleanTarget = target => { try { return normaliseOptions({ macro: [{ t: 0, type: 'click', x: 0, y: 0, target }] }).macro[0].target } catch { return undefined } }
export const macroFromTrace = trace => normaliseOptions({ macro: (trace?.probe ?? []).filter(p => p.type === 'input' && typeof p.t === 'number' && (p.kind !== 'text' || typeof p.text === 'string')).map(p => ({ t: p.t, type: p.kind,
  ...(p.kind === 'click' ? { x: p.x, y: p.y, ...(p.approx ? { approx: true } : cleanTarget(p.target) ? { target: cleanTarget(p.target) } : {}) } : p.kind === 'key' ? { key: p.key } : { text: p.text }) })).slice(0, 2000) }).macro

// The second run of a cycle resumes from the first's data and plays no macro. The first leaves the way a learner does (main.js, headless).
export const resumeOptions = options => normaliseOptions({ ...options, macro: [], resume: true })

// ---- What the runs did ----
const ELS = {
  '1.2': { suspend: 'cmi.suspend_data', location: 'cmi.core.lesson_location', status: 'cmi.core.lesson_status', exit: 'cmi.core.exit', entry: 'cmi.core.entry' },
  2004: { suspend: 'cmi.suspend_data', location: 'cmi.location', status: 'cmi.completion_status', exit: 'cmi.exit', entry: 'cmi.entry' },
}
const FINISHED = /^(completed|passed|failed)$/
const short = u => String(u ?? '').replace(/^lab:\/\/(?:run|content)\/pkg\//, '')
const quote = v => v === undefined ? 'nothing' : `“${String(v).length > 60 ? String(v).slice(0, 60) + '…' : v}”`

const ended = c => /^(LMSFinish|Terminate)$/.test(c.call) && c.result === 'true'
// What one run did, from its trace: the version it used, its successful writes and reads by element, and what happened while leaving.
export function summarise(run) {
  const probe = run?.trace?.probe ?? [], calls = probe.map((p, i) => ({ ...p, i })).filter(p => p.type === 'api')
  const version = calls.find(c => /Initialize$/.test(c.call))?.version ?? (run?.launch?.expose === '2004' ? '2004' : '1.2'), els = ELS[version]
  const writes = el => calls.filter(c => /SetValue$/.test(c.call) && c.el === el && c.result === 'true').map(c => c.value ?? '')
  const reads = el => calls.filter(c => /GetValue$/.test(c.call) && c.el === el && c.result !== 'false').length
  // The leave: from the 'leave' marker the runner puts in the trace when it starts leaving (the last one), else from the first unload report.
  const leaveAt = probe.findLastIndex(p => p.type === 'leave'), tagged = probe.map((p, i) => ({ ...p, i })).filter(p => p.type === 'unload')
  const marks = leaveAt >= 0 ? tagged.filter(p => p.i > leaveAt) : tagged, first = leaveAt >= 0 ? leaveAt : marks[0]?.i ?? Infinity
  const cmi = run?.trace?.cmi?.[version] ?? {}
  return { version, els, calls: calls.length, write: Object.fromEntries(Object.entries(els).map(([k, el]) => [k, writes(el)])), read: Object.fromEntries(Object.entries(els).map(([k, el]) => [k, reads(el)])),
    cmi: Object.fromEntries(Object.entries(els).map(([k, el]) => [k, cmi[el]])), marks, leaving: calls.filter(c => c.i > first),
    // The session ended by Finish or Terminate: before the content knew it was leaving (a button), or by its handlers while leaving.
    endedBefore: calls.some(c => c.i <= first && ended(c)), endedOnLeave: calls.some(c => c.i > first && ended(c)) }
}

// Lines for the finding about leaving: which unload handlers the probe counted, and the API calls made once the content knew it was leaving.
const leavingEvidence = s => {
  const out = []
  for (const m of s.marks) out.push(`${short(m.frame)} added ${Object.entries(m.listeners).map(([k, n]) => `${n} ${k}`).join(', ')} listeners${m.props.length ? `; on… handlers: ${m.props.join(', ')}` : ''}`)
  if (!s.marks.length) out.push('No beforeunload, pagehide or unload event reached the content.')
  else out.push(s.leaving.length ? `API calls while leaving: ${s.leaving.slice(0, 8).map(c => `${c.call}(${c.el})`).join(', ')}` : 'The content made no API calls while leaving.')
  return out
}

// runs: [first, second] (saved-run objects: trace and launch). macro: the events played in the first run, if any.
export function cycleFindings({ runs, macro = [] }) {
  const [a, b] = runs.map(summarise), out = [], last = list => list.at(-1), has = v => v !== undefined && v !== ''
  const saved = ['suspend', 'location', 'status'].filter(k => a.write[k].some(has))
  const status = last(a.write.status) ?? a.cmi.status, exit = last(a.write.exit), done = FINISHED.test(status ?? '')
  if (!saved.length) {
    out.push({ sev: 'error', title: 'Leaving the course saved nothing', detail: 'The content never wrote suspend data, a location or a status before the learner closed the window. An LMS would have nothing to resume from.',
      evidence: [...(macro.length ? [`The macro played ${macro.length} events first.`] : ['No macro was given, so nothing was clicked: only what the content saves by itself at start-up counts. Record clicks in the live view to play some.']), ...leavingEvidence(a)],
      fix: 'Save the bookmark (and suspend data) when the learner moves, not only on a button, and save again in the pagehide or unload handler.' })
    return out
  }
  const fin = a.version === '1.2' ? 'LMSFinish' : 'Terminate'
  if (!a.endedBefore && !a.endedOnLeave) out.push({ sev: 'warn', title: 'Leaving the course didn’t end the session', detail: `Nothing called ${fin} while the content was leaving (its beforeunload, pagehide or unload handlers), and no button had ended the session before. Some LMSs then lose the last values or count the attempt as abandoned.`,
    evidence: leavingEvidence(a), fix: `Call ${fin} from the pagehide handler (and unload as well, for older browsers), after the last SetValue.` })
  if (done) { out.push({ sev: 'info', title: 'The first run finished the attempt, so there was nothing to resume', detail: `The status was ${quote(status)}. A resume only applies to an attempt left unfinished.`, evidence: [], fix: 'Use a macro that stops before the end.' }); return out }
  // Exit: suspend, or unset with the status incomplete. Anything else makes this test LMS (like many) start a new attempt, so then the entry finding below is left out: it would say the same.
  const entry = b.cmi.entry, exitOk = exit === 'suspend' || exit === 'logout' && a.version === '2004' || exit === undefined && status === 'incomplete'
  if (!exitOk) {
    out.push({ sev: 'warn', title: exit === undefined ? `The content never sets exit, and its status is ${quote(status ?? '')}` : `The content exits with ${quote(exit)} instead of “suspend”`,
      detail: 'An LMS offers a resume only for an attempt the content suspended. Left like this, the data from the first run is not offered back.',
      evidence: [`exit written by the content: ${quote(exit)}`, `status at the end: ${quote(status)}`, `entry offered the second time: ${quote(entry)}`], fix: `Set ${a.els.exit} to “suspend” whenever the learner leaves before finishing, before the session ends.` })
    return out
  }
  if (entry !== 'resume') {
    out.push({ sev: 'warn', title: `The LMS started a new attempt instead of resuming (entry was ${quote(entry)})`, detail: 'The content left unfinished with its status incomplete, but never said it was suspending, and this LMS offers a resume only after exit is suspend. The data from the first run was not offered back.',
      evidence: [`exit written by the content: ${quote(exit)}`, `status at the end: ${quote(status)}`, `entry offered the second time: ${quote(entry)}`], fix: `Set ${a.els.exit} to “suspend” whenever the learner leaves before finishing, before the session ends.` })
    return out
  }
  const missing = saved.filter(k => k !== 'status' && !b.read[k])
  if (missing.length && saved.some(k => k !== 'status')) out.push({ sev: 'error', title: 'On resume, the content didn’t read its saved place', detail: 'The LMS offered a resume with the first run’s data, but the content never asked for it.',
    evidence: missing.map(k => `${b.els[k]} was saved (${quote(last(a.write[k]))}) and not read`), fix: 'On launch, when entry is resume, read the location and suspend data and go back to them.' })
  const loc = last(a.write.location), first = b.write.location[0]
  if (has(loc) && b.read.location && first !== undefined && first !== loc) out.push({ sev: 'warn', title: 'The content read its saved place but started from the beginning',
    detail: 'The first location it saved after resuming was not where the learner left.', evidence: [`left at ${quote(loc)}`, `first saved after resuming: ${quote(first)}`], fix: 'Use the location that was read to open the right page, and keep the bookmark until the learner moves on.' })
  const sus = last(a.write.suspend), again = b.write.suspend[0]
  if (has(sus) && again !== undefined && (again === '' || again.length < sus.length)) out.push({ sev: 'warn', title: 'Suspend data written after resuming doesn’t start from what was saved',
    detail: 'The first suspend data written in the second run was empty or shorter than the first run’s, so the earlier progress would be lost.', evidence: [`left with ${sus.length} characters`, `first written after resuming: ${again.length} characters`], fix: 'Read the suspend data on launch and add to it, instead of starting a new one.' })
  if (!out.length) out.push({ sev: 'info', title: 'Saving and resuming worked', detail: 'The first run saved its place and ended the session, the LMS offered a resume, and the content read what was saved.',
    evidence: [`saved: ${saved.map(k => `${a.els[k]} = ${quote(last(a.write[k]))}`).join('; ')}`, `exit ${quote(exit)}, entry ${quote(entry)}`], fix: '' })
  return out
}

// The two runs side by side: [{ label, a, b }], for the Test saving tab and --json.
export function cycleRows(runs) {
  const [a, b] = runs.map(summarise), last = (s, k) => last_(s.write[k]), last_ = l => l.at(-1) ?? '', cell = v => v === undefined || v === '' ? '(nothing)' : String(v).length > 80 ? String(v).slice(0, 80) + '…' : String(v)
  return [
    { label: 'API calls', a: String(a.calls), b: String(b.calls) },
    { label: 'Entry offered', a: cell(a.cmi.entry), b: cell(b.cmi.entry) },
    { label: 'Location read', a: String(a.read.location), b: String(b.read.location) },
    { label: 'Location saved (first, last)', a: `${cell(a.write.location[0])}, ${cell(last(a, 'location'))}`, b: `${cell(b.write.location[0])}, ${cell(last(b, 'location'))}` },
    { label: 'Suspend data read', a: String(a.read.suspend), b: String(b.read.suspend) },
    { label: 'Suspend data saved (last)', a: cell(last(a, 'suspend')), b: cell(last(b, 'suspend')) },
    { label: 'Status', a: cell(last(a, 'status') || a.cmi.status), b: cell(last(b, 'status') || b.cmi.status) },
    { label: 'Exit set', a: cell(last(a, 'exit')), b: cell(last(b, 'exit')) },
    { label: 'Session ended by the content', a: a.endedBefore ? 'yes, before leaving' : a.endedOnLeave ? 'yes, while leaving' : 'no', b: b.endedBefore || b.endedOnLeave ? 'yes' : 'no' },
  ]
}
