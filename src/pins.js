// Pins and answers (P1.2). Pure: no Electron, no files. A pin forces a value the content reads; an answer is a response
// SCORM Lab gives to a request instead of the network. This file holds what both the recorder (to apply them) and the
// rules (to explain what happened) need: matching, the probe's prefix, the findings, and the command-line spellings.
const short = u => String(u ?? '').replace(/lab:\/\/(?:run|content)\/pkg\//g, '')

// ---- Pins ----
// A path is a name (previewMode) or a dotted path (config.mode). navigator.userAgent is the one navigator name that
// can be pinned (it goes through the debugger, not the page). Names the probe or the page itself depends on are refused.
const PATH = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/
const DENIED = new Set(['window', 'self', 'top', 'parent', 'globalThis', 'document', 'location', 'API', 'API_1484_11', 'constructor', 'prototype', '__proto__'])
export const USER_AGENT = 'navigator.userAgent'
export const PIN_MODES = ['force', 'watch']   // watch (P1.5): record reads and writes without forcing a value
// Returns why a pin path can't be used, or '' if it can.
export function pinPathProblem(path) {
  if (typeof path !== 'string' || !PATH.test(path)) return 'must be a name like previewMode or a dotted path like config.mode'
  const [root] = path.split('.')
  if (path === USER_AGENT) return ''
  if (root === 'navigator') return 'can only pin navigator.userAgent'
  if (root === 'location') return 'can’t pin location. For extra query parameters use the launch parameters option'
  if (DENIED.has(root) || root.startsWith('__lab') || path.split('.').some(s => s === '__proto__' || s === 'constructor' || s === 'prototype')) return `can’t pin ${root}`
  return ''
}
// The text put ahead of probe.js: the pins that apply in a frame are read from window.__labPins, which the probe deletes.
export const pinPrefix = pins => pins?.length ? `globalThis.__labPins = ${JSON.stringify(pins.filter(p => p.path !== USER_AGENT))};\n` : ''
export const userAgentPin = pins => pins?.find(p => p.path === USER_AGENT && typeof p.value === 'string')?.value

// The line number of a top-level (column 0) let or const declaration of name in text, or 0. A pin can't replace one:
// the declaration makes a binding of its own, which a window property can't override.
export function lexicalDeclaration(text, name) {
  const m = new RegExp(`^(?:let|const)\\s+${name.replace(/[$]/g, '\\$')}(?![\\w$])`, 'm').exec(text ?? '')
  return m ? text.slice(0, m.index).split('\n').length : 0
}

// ---- Answers ----
const globRe = g => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
// A matcher for a glob (* any text, ? one character) or /regex/flags (flags i, m, s, u). It looks at the whole URL, the path with its
// query, and the path alone, so '/api/player/config' works without the host. Throws if the regex is bad.
// The pattern as a regex's { source, flags }, so the probe can match the same way in the page (shape.js).
export function patternRe(match) {
  const m = /^\/(.+)\/([imsu]*)$/s.exec(match)   // so /api/player/config is a glob: “config” isn't a set of flags
  const re = m ? new RegExp(m[1], m[2]) : globRe(match)
  return { source: re.source, flags: re.flags }
}
export function matcher(match) {
  const { source, flags } = patternRe(match), re = new RegExp(source, flags)
  return url => {
    let u
    try { u = new URL(url) } catch { u = null }
    return re.test(url) || !!u && (re.test(u.pathname + u.search) || re.test(u.pathname))
  }
}
// The first response of the list that answers this request, as { response, index }, or null. SCORM Lab's own pages are never answered.
export function answerFor(responses, url, method = 'GET') {
  if (!responses?.length || /^lab:\/\/run\/__(lab|lrs)\//.test(url)) return null
  for (const [index, response] of responses.entries()) {
    if (response.method && response.method !== String(method).toUpperCase()) continue
    try { if (matcher(response.match)(url)) return { response, index } } catch { /* a bad pattern never matches */ }
  }
  return null
}
// What Fetch.fulfillRequest needs: the status, headers as { name, value } and the body in base64. A response with no
// content type gets JSON if the body looks like it, otherwise plain text; CORS is opened unless the response says otherwise.
// A body of "@probe", or "@probe" and JSON, asks the probe to record what the content reads from the response (P1.3,
// shape.js). The network gets the JSON after the marker, or {}.
export const PROBE_BODY = /^@probe(?:\s|$)/
export const servedBody = body => PROBE_BODY.test(body ?? '') ? body.slice(6).trim() || '{}' : body ?? ''
export function buildAnswer(r) {
  const body = servedBody(r.body)
  const headers = Object.entries(r.headers ?? {}).map(([name, value]) => ({ name, value: String(value) })), has = n => headers.some(h => h.name.toLowerCase() === n)
  if (!has('content-type')) headers.push({ name: 'Content-Type', value: /^\s*[{[]/.test(body) ? 'application/json' : 'text/plain; charset=utf-8' })
  if (!has('access-control-allow-origin')) headers.push({ name: 'Access-Control-Allow-Origin', value: '*' })
  return { status: r.status ?? 200, headers, body: Buffer.from(body, 'utf8').toString('base64') }
}

// ---- Findings ----
// Watch pins (P1.5's drill-down) only record: they get no findings here.
export function pinFindings(trace, options = {}) {
  const pins = (options.pins ?? []).filter(p => p.mode !== 'watch'), forced = new Set(pins.map(p => p.path))
  const out = [], probe = (trace.probe ?? []).filter(p => !/^pin-/.test(p.type) || forced.has(p.path)), responses = options.responses ?? []
  if (pins.length) {
    const writes = probe.filter(p => p.type === 'pin-write'), failed = probe.filter(p => p.type === 'pin-failed')
    const seen = new Set(), where = p => p.stack?.[0] ? short(p.stack[0]) : 'somewhere unknown'
    const lines = writes.map(p => `${p.path} = ${p.value} from ${where(p)}`).filter(l => !seen.has(l) && seen.add(l))
    if (lines.length) out.push({ sev: 'warn', title: 'The content tried to change a pinned value',
      detail: 'The pin held, so the content still saw your value. The code named below is where it sets its mode or setting.',
      evidence: lines.slice(0, 10), fix: 'Look at that code: it decides the value you pinned. Change it with a file override, or remove the pin if you wanted the content to choose.' })
    const done = new Set([...writes, ...probe.filter(p => p.type === 'pin-read')].map(p => p.path))
    const fails = new Set()
    for (const p of failed) if (!fails.has(p.path)) { fails.add(p.path); out.push({ sev: 'warn', title: `Couldn’t pin ${p.path}`, detail: `The browser refused (${p.error}). An object that is frozen or locked can’t have a value forced on it.`, evidence: [], fix: 'Use a file override instead.' }) }
    for (const pin of pins) {
      if (pin.path === USER_AGENT || done.has(pin.path) || fails.has(pin.path)) continue
      const root = pin.path.split('.')[0]
      const decl = Object.entries(trace.sources ?? {}).map(([file, text]) => [file, lexicalDeclaration(text, root)]).find(([, line]) => line)
      if (decl) { fails.add(pin.path); out.push({ sev: 'warn', title: `Couldn’t pin ${root}: the script declares it with let or const`,
        detail: 'A let or const at the top of a script makes a name of its own, which a pin can’t replace, so the content went on using its own value.',
        evidence: [`${root} is declared at ${short(decl[0])}:${decl[1]}`], fix: 'Use a file override instead: change that line in the Files tab.' }) }
    }
    const unread = pins.filter(p => p.path !== USER_AGENT && !done.has(p.path) && !fails.has(p.path))
    if (unread.length) out.push({ sev: 'info', title: 'Pinned value never read',
      detail: 'The content never looked at ' + (unread.length > 1 ? 'these, so they changed nothing.' : 'this, so it changed nothing.') + ' The name may be wrong, the code that reads it never ran, or the name is declared with let or const somewhere other than the start of a line, which SCORM Lab can’t see.',
      evidence: unread.map(p => `${p.path} = ${JSON.stringify(p.value)}`), fix: 'Check the spelling, and whether the content got as far as the code that reads it.' })
  }
  if (responses.length) {
    const failedAns = (trace.requests ?? []).filter(r => r.answerFailed)
    if (failedAns.length) out.push({ sev: 'warn', title: `Couldn’t answer ${failedAns.length} request${failedAns.length > 1 ? 's' : ''}`, detail: 'The browser refused the response, so the request went to the server as normal.',
      evidence: failedAns.slice(0, 10).map(r => `${r.method} ${short(r.url)}: ${r.answerFailed}`), fix: 'Check the status, headers and body of the response.' })
    const answered = (trace.requests ?? []).filter(r => r.answered), used = new Set(answered.map(r => r.answeredBy))
    if (answered.length) out.push({ sev: 'info', title: `Answered ${answered.length} request${answered.length > 1 ? 's' : ''} with your responses`,
      detail: 'These requests never reached a server. The content got the response you supplied.',
      evidence: answered.slice(0, 10).map(r => `${r.method} ${short(r.url)} → ${responses[r.answeredBy]?.status ?? '?'}`), fix: '' })
    const idle = responses.filter((_, i) => !used.has(i))
    if (idle.length) out.push({ sev: 'info', title: `${idle.length === 1 ? 'A response' : idle.length + ' responses'} matched no request`,
      detail: 'The content never made a request that matches ' + (idle.length === 1 ? 'it' : 'them') + '.', evidence: idle.map(r => `${r.method ? r.method + ' ' : ''}${r.match}`), fix: 'Check the pattern against the Network tab, and whether the content got as far as making the request.' })
  }
  return out
}

// ---- The command line's spellings ----
// --pin name=json  →  { path, value }. The value is JSON, so strings need quotes: --pin 'navigator.userAgent="X"'.
export function parsePinFlag(spec) {
  const at = typeof spec === 'string' ? spec.indexOf('=') : -1
  if (at < 1) throw new Error('--pin needs name=value, like --pin previewMode=false (the value is JSON, so a string needs quotes).')
  const path = spec.slice(0, at), text = spec.slice(at + 1)
  let value
  try { value = JSON.parse(text) } catch { throw new Error(`--pin ${path}: “${text}” isn’t JSON. Strings need quotes, like --pin ${path}='"text"'.`) }
  return { path, value }
}
// --answer 'glob=@file.json' (status 200, body from the file) or 'glob=status:body'  →  { match, status, body } or { match, file }.
export function parseAnswerFlag(spec) {
  const m = /^(.+?)=(?:@([\s\S]+)|(\d{3}):([\s\S]*))$/.exec(typeof spec === 'string' ? spec : '')
  if (!m) throw new Error('--answer needs <pattern>=@<file> or <pattern>=<status>:<body>, like --answer \'/api/config=@config.json\' or --answer \'/api/config=200:{}\'.')
  return m[2] !== undefined ? { match: m[1], file: m[2] } : { match: m[1], status: +m[3], body: m[4] }
}
