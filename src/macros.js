// The macro editor's pure parts (E4.2): timing edits that keep the rest in place, the table's rows, and the name of a saved macro.
// Every edit returns a new list that has been through normaliseOptions({ macro }), so a bad value throws the message the options give.
import { normaliseOptions } from './options.js'
import { macroDelays } from './cycle.js'

const check = events => normaliseOptions({ macro: events }).macro
// Events with the sleep before each, put back on the clock: every event keeps its own delay, so t never goes down.
const onClock = (events, delays) => { let t = 0; return events.map((e, i) => ({ ...e, t: (t += delays[i]) })) }
const at = (events, i) => { if (!Number.isInteger(i) || i < 0 || i >= events.length) throw new Error('Choose a step first.'); return i }

// Sets the sleep before step i. Every later step moves by the difference, so they keep their own delays.
export function setDelay(events, i, ms) {
  at(events, i)
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) throw new Error('The delay needs to be a number of milliseconds, 0 or more.')
  const by = Math.round(ms) - macroDelays(events)[i]
  return check(events.map((e, j) => j < i ? e : { ...e, t: e.t + by }))
}
// Moves step i up (dir -1) or down (1). The step takes its delay with it and the others keep theirs, so the macro lasts as long as before.
export function move(events, i, dir) {
  at(events, i)
  const j = i + (dir < 0 ? -1 : 1)
  if (j < 0 || j >= events.length) return events
  const delays = macroDelays(events), order = events.map((_, k) => k)
  ;[order[i], order[j]] = [order[j], order[i]]
  return check(onClock(order.map(k => events[k]), order.map(k => delays[k])))
}
// Removes step i. The steps after it keep their own delays, so the macro gets shorter by the removed step's delay.
export function remove(events, i) {
  at(events, i)
  const delays = macroDelays(events), keep = events.map((_, k) => k).filter(k => k !== i)
  return check(onClock(keep.map(k => events[k]), keep.map(k => delays[k])))
}
// Puts a wait ({ ms | text | milestone | quiet, timeout? }) in at position i (0 to events.length: before step i, or at the end). It has no delay of its own.
export function insertWait(events, i, wait) {
  if (!Number.isInteger(i) || i < 0 || i > events.length) throw new Error('Choose where the wait goes.')
  return check([...events.slice(0, i), { ...wait, type: 'wait', t: i ? events[i - 1].t : 0 }, ...events.slice(i)])
}
// Changes fields of step i; a value of null takes the field out. t and type can't be changed here (use setDelay).
export function setFields(events, i, patch) {
  at(events, i)
  const e = { ...events[i] }
  for (const [k, v] of Object.entries(patch)) { if (k === 't' || k === 'type') continue; if (v === null) delete e[k]; else e[k] = v }
  return check(events.map((x, j) => j === i ? e : x))
}
// The one entry point the interfaces use: { op: 'delay' | 'move' | 'remove' | 'wait' | 'set' | 'none', i, ms, dir, wait, patch }.
export function edit(events, { op = 'none', i, ms, dir, wait, patch } = {}) {
  if (op === 'delay') return setDelay(events, i, ms)
  if (op === 'move') return move(events, i, dir)
  if (op === 'remove') return remove(events, i)
  if (op === 'wait') return insertWait(events, i, wait ?? {})
  if (op === 'set') return setFields(events, i, patch ?? {})
  return check(events)
}

// What the table shows for each step: { n, when, action, where, wait }.
const s = ms => `${+(ms / 1000).toFixed(1)} s`
const clip = (t, n = 40) => t.length > n ? t.slice(0, n - 1) + '…' : t
export function macroRows(events, viewport = null) {
  const delays = macroDelays(events)
  return events.map((e, i) => {
    const wait = e.type === 'wait', limit = ` (${s(e.timeout ?? 30000)})`
    const when = !wait ? `+${s(delays[i])}` : e.text !== undefined ? `wait for “${clip(e.text)}”${limit}` : e.milestone ? `wait for step ${e.milestone}${limit}` : e.quiet ? `wait for the network to be quiet for ${s(e.quiet)}${limit}` : `wait ${s(e.ms)}`
    const action = { click: 'Click', move: 'Move', wheel: 'Scroll', key: `Key ${e.key}`, text: `Type “${clip(e.text ?? '')}”`, wait: 'Wait' }[e.type]
    const pos = e.x === undefined ? '' : viewport ? `${Math.round(e.x * viewport.width)}, ${Math.round(e.y * viewport.height)}` : `${Math.round(e.x * 100)}%, ${Math.round(e.y * 100)}%`
    const el = e.target ? `${e.target.sel}${e.target.text ? ` “${e.target.text}”` : ''}` : ''
    return { n: i + 1, when, action: e.type === 'wheel' ? `Scroll ${e.dy > 0 ? 'down' : 'up'}` : action, where: [pos, el].filter(Boolean).join(' '), wait }
  })
}

// A saved macro's name: 1 to 60 characters from letters, digits, spaces, dots, dashes and underscores, not starting with a dot.
export function macroName(name) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Give the macro a name.')
  if (name.length > 60) throw new Error('A macro name can be at most 60 characters.')
  if (name.startsWith('.')) throw new Error('A macro name can’t start with a dot.')
  if (!/^[\w .-]+$/.test(name)) throw new Error('A macro name can use letters, digits, spaces, dots, dashes and underscores only.')
  return name
}
