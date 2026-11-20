// What the content wanted from its server (P1.3). Pure: no Electron, no files.
//
// A response answered with the body "@probe" (pins.js serves {} or the JSON after the marker) is handed to the content
// as a recording Proxy (host/shape-probe.js), which reports each property read and how a missing value was used. From
// those reports inferShape builds a JSON skeleton. discover() runs the launch with no answer, then with @probe, then
// again answering with the skeleton so far, until a round finds no new field or the round limit is reached.
import { matcher, patternRe, PROBE_BODY } from './pins.js'
import { normaliseOptions } from './options.js'
import { furthest, progress } from './milestones.js'
import { runResult, summarise } from './experiments.js'

const short = u => String(u ?? '').replace(/^lab:\/\/(?:run|content)\/pkg\//, '').replace(/^lab:\/\/(?:run|content)(?=\/)/, '')
const where = f => f ? `${short(f.url)}:${f.line}` : ''

// ---- What the recorder needs ----
export const probeBody = skeleton => skeleton === undefined ? '@probe' : '@probe ' + JSON.stringify(skeleton)
// The text put ahead of the probe: the patterns of the responses answered with @probe, as regex source and flags.
export const shapePrefix = responses => {
  const list = (responses ?? []).filter(r => PROBE_BODY.test(r.body ?? '')).map(r => patternRe(r.match))
  return list.length ? `globalThis.__labShape = ${JSON.stringify(list)};\n` : ''
}

// ---- Which requests went to a server ----
// fetch and XHR requests to the host's root (lab://run/ outside the package and Package Lab's pages) or another site.
const isServer = (r, trace) => /^(XHR|Fetch)$/.test(r.type) && (/^lab:\/\/(?:run|content)\/(?!pkg\/|__lab\/)/.test(r.url) && !(trace?.lrs && /\/__lrs\//.test(r.url)) || /^https?:/.test(r.url))
// The pattern that answers a request: its path on the host's root (any query), or its address on another site.
export function requestPattern(url) {
  const u = new URL(url)
  return u.protocol === 'lab:' ? u.pathname : u.origin + u.pathname
}
// [{ match, url, method, from }], one per pattern.
export function serverRequests(trace) {
  const out = new Map()
  for (const r of trace.requests ?? []) if (isServer(r, trace)) { const match = requestPattern(r.url); if (!out.has(match)) out.set(match, { match, url: r.url, method: r.method, from: where(r.from?.[0]) }) }
  return [...out.values()]
}

// ---- Reading the code around a read ----
// The probe reports where a property was read (the column of its name). The text around it often says what the
// content expected: a comparison with a string or a number, a typeof check, a truthiness test, a default after ||.
// Returns { type, how } or null.
export function sourceHint(text, line, col, key) {
  const src = String(text ?? '').split('\n')[line - 1]
  if (src === undefined || src.slice(col - 1, col - 1 + key.length) !== key) return null   // not at the name: minified, computed keys
  const after = src.slice(col - 1 + key.length), before = src.slice(0, col - 1).replace(/[\w$.]*$/, '')
  if (/^\s*(\.|\[|\(|=(?!=))/.test(after)) return null   // goes deeper, calls it or assigns to it
  if (/typeof\s*\(?\s*$/.test(before)) {
    const m = /^\s*\)?\s*[!=]==?\s*['"`](\w+)['"`]/.exec(after)
    return m && ['string', 'number', 'boolean', 'object'].includes(m[1]) ? { type: m[1], how: `typeof checked against “${m[1]}”` } : null
  }
  const cmp = /^\s*[!=]==?\s*(?:(['"`])|(-?\.?\d)|(true|false)\b)/.exec(after) ?? /(?:(['"`])[^'"`]*['"`]|(\d)|\b(true|false))\s*[!=]==?\s*$/.exec(before)
  if (cmp) return cmp[1] ? { type: 'string', how: 'compared with a string' } : cmp[2] ? { type: 'number', how: 'compared with a number' } : { type: 'boolean', how: 'compared with true or false' }
  if (/^\s*[<>]=?(?!>)/.test(after) || /(^|[^=<>])[<>]=?\s*$/.test(before)) return { type: 'number', how: 'compared as a number' }
  if (/^\s*(?:[-*%]|\/(?![/*]))(?!=)/.test(after)) return { type: 'number', how: 'used in arithmetic' }
  const dflt = /^\s*(?:\|\||\?\?)\s*(?:(['"`])|(-?\d)|(\[)|(\{)|(true|false)\b)/.exec(after)
  if (dflt) return [null, { type: 'string', how: 'has a text default' }, { type: 'number', how: 'has a number default' }, { type: 'array', how: 'has a list default' }, { type: 'object', how: 'has an object default' }, { type: 'boolean', how: 'has a true or false default' }][dflt.findIndex((x, i) => i && x)]
  if (/(\b(?:if|while)\s*\(|!|&&|\|\||\?)\s*$/.test(before) || /^\s*(&&|\|\||\?(?![?.]))/.test(after)) return { type: 'boolean', how: 'truthiness test' }
  return null
}

// The probe's reports for one request pattern, each with where it was read and what the code there says:
// [{ url, path, use, at, hint? }]. use is read, in, keys, array, string, number or text (joined to text or compared loosely).
export function shapeReads(trace, match) {
  const test = matcher(match)
  return (trace.probe ?? []).filter(p => p.type === 'shape' && typeof p.path === 'string' && test(p.url)).map(p => {
    const f = /\(?([a-z][\w+.-]*:\/\/[^\s()]+?):(\d+):(\d+)\)?$/.exec(p.stack?.[0] ?? '')
    const hint = p.use === 'read' && f ? sourceHint(trace.sources?.[f[1]], +f[2], +f[3], p.path.slice(p.path.lastIndexOf('.') + 1)) : null
    return { url: p.url, path: p.path, use: p.use, at: f ? `${short(f[1])}:${f[2]}` : '', ...(hint && { hint }) }
  })
}

// ---- The shape ----
const PLACEHOLDER = { string: '', number: 0, boolean: false, array: [], object: {} }
function typeOf(n) {
  if (n.kids.size) return ['object', 'looked inside']
  if (n.uses.has('keys')) return ['object', 'listed its keys']
  if (n.uses.has('array')) return ['array', 'used as a list']
  if (n.uses.has('string')) return ['string', 'used text methods on it']
  if (n.uses.has('number')) return ['number', 'used as a number']
  const hint = n.hints.find(h => h.type !== 'boolean') ?? n.hints[0]
  if (hint) return [hint.type, hint.how]
  if (n.uses.has('text')) return ['string', 'used as text']
  if (n.uses.has('in')) return ['boolean', 'only checked with in, so any value']
  return ['boolean', 'read and not used otherwise: most likely a truthiness test']
}
// reads (from shapeReads) → { skeleton (JSON with placeholders: "", 0, false, [], {}), fields: [{ path, type, how, at: [file:line] }] }.
export function inferShape(reads) {
  const node = () => ({ kids: new Map(), uses: new Set(), hints: [], at: [] }), root = node()
  for (const r of reads ?? []) {
    let n = root
    for (const k of r.path ? r.path.split('.') : []) { if (!n.kids.has(k)) n.kids.set(k, node()); n = n.kids.get(k) }
    if (r.use && r.use !== 'read') n.uses.add(r.use)
    if (r.hint) n.hints.push(r.hint)
    if (r.at && !n.at.includes(r.at)) n.at.push(r.at)
  }
  const fields = []
  const build = (n, path) => {
    const [type, how] = path ? typeOf(n) : ['object']
    if (path) fields.push({ path, type, how, at: n.at.slice(0, 3) })
    if (type !== 'object') return structuredClone(PLACEHOLDER[type])
    return Object.fromEntries([...n.kids].map(([k, kid]) => [k, build(kid, path ? path + '.' + k : k)]))
  }
  return { skeleton: build(root, ''), fields }
}

// ---- The discovery loop ----
// run(name, options) runs one launch to its end and resolves to the saved run (src/main.js and bin/package-lab.js give
// it; a run with an id keeps it as runId). request is a pattern, or none for every server request the first run made.
// onRound(row, index) is called after each run with its experiment row (experiments.js).
// Throws if the settings can't be used, before anything runs.
export function checkDiscover({ request, rounds = 5 }) {
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error(`Rounds must be a whole number from 1 to 10, not ${JSON.stringify(rounds)}.`)
  if (request === undefined) return
  if (typeof request !== 'string' || !request) throw new Error('The request to discover must be a pattern like /api/config or *.json.')
  try { matcher(request) } catch (e) { throw new Error(`The request pattern doesn’t work (${e.message}): ${request}`) }
}
export async function discover({ base, request, rounds = 5, run, onRound = () => {} }) {
  checkDiscover({ request, rounds })
  const results = [], traces = [], rows = () => summarise(results).map((r, i) => i ? r : { ...r, progress: 'the baseline' })
  const step = async (name, options) => {
    const r = await run(name, options)
    traces.push(r.trace)
    results.push(runResult(name, options, r, r.id !== undefined ? { runId: r.id } : {}))
    onRound(rows().at(-1), results.length - 1)
    return r
  }
  const plain = normaliseOptions(base)
  await step('no answer', plain)
  const asked = request !== undefined ? [{ match: request }] : serverRequests(traces[0])
  const reads = new Map(asked.map(a => [a.match, []])), seen = new Set()
  let complete = false, n = 0
  while (asked.length && n < rounds) {
    n++
    const shapes = new Map(asked.map(a => [a.match, n > 1 ? inferShape(reads.get(a.match)).skeleton : undefined]))
    const r = await step(`round ${n}`, normaliseOptions({ ...plain, responses: [...asked.map(a => ({ match: a.match, body: probeBody(shapes.get(a.match)) })), ...plain.responses] }))
    const before = seen.size
    for (const a of asked) for (const x of shapeReads(r.trace, a.match)) { reads.get(a.match).push(x); seen.add(a.match + '\n' + x.path) }
    if (seen.size === before) { complete = true; break }
  }
  // A pattern given by hand: its URL, method and caller from the first run that made the request.
  for (const a of asked) if (!a.url) {
    const test = matcher(a.match), q = traces.flatMap(t => t.requests ?? []).find(x => test(x.url))
    Object.assign(a, { url: q?.url ?? a.match, method: q?.method ?? 'GET', from: where(q?.from?.[0]) })
  }
  const last = results.at(-1), p = progress(results[0], last)
  const result = {
    requests: asked.map(a => { const s = inferShape(reads.get(a.match)); return { ...a, ...s, response: { match: a.match, status: 200, headers: {}, body: JSON.stringify(s.skeleton) } } }),
    rows: rows(), rounds: n, complete,
    noAnswer: { furthest: furthest(results[0].milestones)?.id ?? null, label: furthest(results[0].milestones)?.label ?? 'nothing' },
    standIn: { name: last.name, furthest: furthest(last.milestones)?.id ?? null, label: furthest(last.milestones)?.label ?? 'nothing', better: /^got further/.test(p.summary) ? 1 : p.better < 0 ? -1 : 0 },
  }
  result.findings = discoverFindings(result)
  return result
}

// ---- Findings ----
export function discoverFindings(d) {
  const out = [], used = d.requests.filter(r => r.fields.length)
  if (!d.requests.length) return [{ sev: 'info', title: 'The content made no requests to a server', detail: 'Its first run asked nothing of the host’s root or another site with fetch or XHR, so there is nothing to discover.', evidence: [], fix: '' }]
  for (const r of used) out.push({ sev: 'warn', title: 'The content needs these from its server',
    detail: `It asked for ${short(r.url)} and read the fields below from the response. Without an answer it got as far as “${d.noAnswer.label}”.${d.complete ? '' : ` Discovery stopped after ${d.rounds} rounds while it was still finding fields, so there may be more.`}`,
    evidence: [`${r.method} ${short(r.url)}${r.from ? ' from ' + r.from : ''}`, ...r.fields.map(f => `${f.path}: ${f.type} (${f.how}${f.at.length ? ', ' + f.at.join(', ') : ''})`)],
    fix: `The export needs a setting that removes this dependency, or the LMS must serve this. A stand-in response with these fields lets the content get as far as “${d.standIn.label}”.` })
  if (used.length && d.standIn.better > 0) out.push({ sev: 'warn', title: `With a stand-in for ${used.map(r => short(r.url)).join(' and ')}, the content reaches ${d.standIn.label}`,
    detail: `Without an answer it got as far as “${d.noAnswer.label}”. With a response holding just the fields it read, it got further, so this request is what holds it back outside its own platform.`,
    evidence: d.rows.map(r => `${r.name}: ${r.furthestLabel ?? r.progress}`), fix: 'Save the stand-in as a response to keep testing past it, and look for the export setting or LMS feature that provides it.' })
  for (const r of d.requests.filter(x => !x.fields.length)) out.push({ sev: 'info', title: `The content didn’t read what ${short(r.url)} sent`,
    detail: 'Package Lab answered the request and watched the response, and saw nothing read. The content may ignore it, never get as far as reading it, or read it in a way Package Lab doesn’t follow (a Blob, a stream, a worker).',
    evidence: [`${r.method} ${short(r.url)}${r.from ? ' from ' + r.from : ''}`], fix: '' })
  return out
}
