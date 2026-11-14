// Redacted reports (P4.4). redactRun(input, opts) takes a saved run (or the inputs of a static report: boot graph, analysis) and
// returns a copy with the course content taken out, and the findings rebuilt from that copy. Pure: no files, no Electron.
//
// Safe by construction, not by remembering what was removed:
//  - Every field that holds course text is replaced by a marker that gives its length (‹12 characters›): page text, console text,
//    API and pin values, suspend data, request and response bodies and headers, typed text, changed file contents, code text
//    (static snippets, decision text, operand previews), item titles and the manifest's own text.
//  - The findings are not edited afterwards: runFindings, launchFindings and staticFindings run again on the redacted trace, launch,
//    boot graph and analysis, so every quote in them comes from data that is already redacted.
//  - Findings that come from the package's files (boot risks, rule packs) are redacted at the source: a "file:line  code" line keeps
//    only the place, and quoted strings in any message become markers.
//  - Every string is then checked for URLs (query values replaced, fragments dropped), local paths (‹local path›) and, with names,
//    file names (a stable HMAC hash of each folder and file name; the extension stays).
// Kept: element names, SCORM vocabulary (completed, suspend…), numbers and times, URL paths in the package, function names,
// object key names, the package name (unless names are hashed) and error messages minus their quoted strings.
import { createHmac } from 'node:crypto'
import { runAnalysis, withProgress } from './launch.js'
import { staticFindings, runFindings, launchFindings, sortFindings } from './rules.js'
import { viewportName } from './options.js'

const VOCAB = new Set(['completed', 'incomplete', 'not attempted', 'unknown', 'passed', 'failed', 'browse', 'browsed', 'review', 'normal',
  'suspend', 'resume', 'ab-initio', 'logout', 'time-out', 'exit', 'credit', 'no-credit', 'correct', 'wrong', 'unanticipated', 'neutral',
  'choice', 'true-false', 'fill-in', 'long-fill-in', 'matching', 'performance', 'sequencing', 'likert', 'numeric', 'other', 'true', 'false'])
const NUMBER = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i
const TIME = /^(P(?=\d|T\d)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?|\d{2}:\d{2}:\d{2}(\.\d+)?)$/
export const kept = s => s === '' || VOCAB.has(s) || NUMBER.test(s) || TIME.test(s)
const mark = n => `‹${n} characters›`
const marker = s => mark(String(s).length)
const isMarker = s => /^‹\d+ characters›$/.test(s)
const LOG_KEEP = new Set(['network', 'security', 'violation', 'deprecation', 'intervention', 'rendering', 'storage', 'xml', 'appcache', 'recommendation'])   // browser-made log sources
const BODY = `[^\\s'"<>)\\]]`
// One pass over a string: URLs, local paths, and relative file references with a query or fragment (the last has two groups).
const SCAN = new RegExp([
  `(?:lab|https?|wss?):\\/\\/${BODY}+`,
  `\\bdata:${BODY}+`,
  `\\bfile:\\/\\/${BODY}*`,
  `(?<!\\w)[A-Za-z]:\\\\(?:[^\\\\/:*?"<>|\\r\\n]+\\\\)*[^\\\\/:*?"<>|\\s)\\]]*`,
  `(?<![\\w.:/-])\\/(?:Users|home|private|var|tmp|Volumes|opt|root|mnt)\\/(?:[^/\\n'"<>)\\]]+\\/)*[^\\s/'"<>)\\]]*`,
  `(?<![\\w%~./:@-])((?:\\.{1,2}\\/)*(?:[\\w%~.-]+\\/)*[\\w%~-][\\w%~.-]*\\.[A-Za-z0-9]{1,5})([?#]${BODY}+)`,
].join('|'), 'g')
// A quoted string: straight or curly quotes. An inner quote followed by a word character (it's) does not end a straight-quoted string.
const QUOTE = /(?<!\w)(['"`])((?:(?!\1)[^\n\\]|\\.|\1(?=\w))*)\1(?!\w)|“[^”\n]*”|‘[^’\n]*’(?!\w)/g
// Free-text data model elements: masked whatever the value, numbers included.
const FREE = /student_id|learner_id|student_name|learner_name|lesson_location|cmi\.location|suspend_data|learner_response|student_response|comments|interactions\.\d+\.(id|description)|objectives\.\d+\.id/
// Browser message shapes that are kept whole (after their quoted strings are masked).
const SHAPES = [/^(Uncaught )?(\w*Error: )?[\w$.]+ is not (defined|a function|a constructor|iterable)$/, /^(Uncaught )?\w*Error: Cannot (read|set) propert(y|ies) of (undefined|null) \(\w+ ‹\d+ characters›\)$/,
  /^Failed to load resource: the server responded with a status of \d+( \([A-Za-z ]+\))?$/]
const idLike = seg => { const m = /^(.*?)(\.[A-Za-z0-9]{1,5})?$/.exec(seg); return /^\d{4,}$/.test(m[1]) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m[1]) || /^(?=.*\d)[A-Za-z0-9+_=-]{16,}$/.test(m[1]) }
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function redactRun(input, { names = false, key, map = new Map(), package: pkgName, paths = [] } = {}) {
  if (names && !key) throw new Error('Hashing file names needs a key.')
  const r = JSON.parse(JSON.stringify(input ?? {}))
  const c = {}, done = new WeakMap(), known = new Set()
  const count = (what, n = 1) => { if (n) c[what] = (c[what] ?? 0) + n }
  const skip = (o, k) => { (done.get(o) ?? done.set(o, new Set()).get(o)).add(k) }
  // Replace o[k] with fn(o[k]); the generic string pass then leaves that field alone (it is already handled once).
  const fix = (o, k, fn) => { if (o && o[k] !== undefined && o[k] !== null) { o[k] = fn(o[k]); skip(o, k) } }
  const drop = (v, what) => {
    if (v === undefined || v === null || v === '') return v
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    if (isMarker(s)) return s
    count(what); return marker(s)
  }
  const cut = (o, k, what) => fix(o, k, v => drop(v, what))
  const edit = (o, k, fn) => { if (typeof o?.[k] === 'string') o[k] = fn(o[k]) }   // changed here, URLs and names still checked by the final pass
  // Exception and browser messages stay, but their quoted strings (values, code) become markers.
  const msg = s => String(s).replace(QUOTE, (m, __, inner) => { count('quotes'); return mark((inner ?? m.slice(1, -1)).length) })
  // A message from the browser: quoted strings go, then only a known shape stays whole; else the text after the first ": " goes
  // (and after "because" in a "Refused to…" message).
  const browserMsg = s => {
    const q = msg(s)
    if (SHAPES.some(re => re.test(q))) return q
    const r = /^Refused to .*?\bbecause\b/.exec(q), i = r ? r[0].length : q.indexOf(': ') >= 0 ? q.indexOf(': ') + 1 : 0
    if (i >= q.length || /^(‹\d+ characters›\s*)*$/.test(q.slice(i).trim())) return q
    count('messages'); return q.slice(0, i) + (i ? ' ' : '') + marker(q.slice(i).trim())
  }

  // ---- Names: a stable hash of each folder and file name (with --redact-names) ----
  const hmac = n => createHmac('sha256', key).update(n).digest('hex').slice(0, 10)
  const hashSeg = (seg, last) => {
    const [, raw, tail] = /^([^:]*)(.*)$/s.exec(seg)   // a stack line's ":3:5" stays
    let n = raw; try { n = decodeURIComponent(raw) } catch { /* as written */ }
    if (!n) return seg
    const k = last ? n : n + '/'
    if (!map.has(k)) map.set(k, 'f' + hmac(n) + (last ? /\.[A-Za-z0-9]{1,8}$/.exec(n)?.[0] ?? '' : ''))
    return map.get(k) + tail
  }
  const hashPath = p => {
    if (!names || !p) return p
    const segs = p.split('/')
    const dec = s => { try { return decodeURIComponent(s) } catch { return s } }
    known.add(segs.map(s => dec(/^[^:]*/.exec(s)[0])).join('/'))
    return segs.map((s, i) => !s || s === '.' || s === '..' ? s : hashSeg(s, i === segs.length - 1)).join('/')
  }
  // ---- Queries and URLs ----
  // "a=1&b=2;c": values and bare parts become markers; the names before = stay.
  const query = q => q.split(/([&;])/).map(p => {
    if (p === '&' || p === ';' || p === '' || p.includes('‹')) return p
    const i = p.indexOf('=')
    count('queries')
    return i < 0 ? marker(p) : p.slice(0, i + 1) + (i === p.length - 1 ? '' : marker(p.slice(i + 1)))
  }).join('')
  const split = s => /^([^?#]*)(?:\?([^#]*))?(?:#.*)?$/s.exec(s)
  function redactUrl(u) {
    if (/^data:/i.test(u)) { const i = u.indexOf(','); return i < 0 ? u : u.slice(0, i + 1) + marker(u.slice(i + 1)) }
    const [, pre, host, path, q] = /^((?:lab|https?|wss?):\/\/)([^/?#]*)([^?#]*)(?:\?([^#]*))?/i.exec(u) ?? [u, '', '', '']
    if (!pre) return u
    const p = /^lab:/i.test(pre) && path.startsWith('/pkg/') ? '/pkg/' + hashPath(path.slice(5)) : path
    return pre + host + (/^lab:/i.test(pre) ? p : p.split('/').map(x => { if (!idLike(x)) return x; count('ids'); const m = /^(.*?)(\.[A-Za-z0-9]{1,5})?$/.exec(x); return marker(m[1]) + (m[2] ?? '') }).join('/')) + (q !== undefined ? '?' + query(q) : '')
  }
  const SCAN_ONE = (m, relPath, relTail) => {
    if (relPath !== undefined) { const q = relTail.startsWith('?') ? relTail.slice(1).replace(/#.*$/s, '') : ''; return hashPath(relPath) + (q ? '?' + query(q) : '') }
    if (/^(?:lab|https?|wss?):/i.test(m) || /^data:/i.test(m)) return redactUrl(m)
    count('paths'); return '‹local path›'
  }
  let bareRe = null
  const scrub = s => {
    let x = s.replace(SCAN, SCAN_ONE)
    if (bareRe) x = x.replace(bareRe, m => m.includes('/') ? hashPath(m) : hashSeg(m, true))
    return x
  }
  // A field that holds a package path or reference (maybe with a query or fragment).
  const pathField = v => {
    if (typeof v !== 'string' || !v) return v
    if (/^[a-z][\w+.-]+:/i.test(v) || /^[A-Za-z]:[\\/]/.test(v) || /^\/(?:Users|home|private|var|tmp|Volumes|opt|root|mnt)\//.test(v)) return scrub(v)
    const [, p, q] = split(v)
    return hashPath(p) + (q !== undefined ? '?' + query(q) : '')
  }
  // A URL pattern (a response's match): the query's values go.
  const urlish = v => { if (typeof v !== 'string') return v; const [, h, q] = split(v); return scrub(h) + (q !== undefined ? '?' + query(q) : '') }

  // ---- Values ----
  // A value of the data model, probe or pin: vocabulary, numbers and times stay; free text goes. Keys (element names) stay.
  const tree = (v, k = '') => {
    if (typeof v === 'number' && FREE.test(k)) return drop(String(v), 'values')
    if (typeof v === 'string') return /suspend_data$/.test(k) ? drop(v, 'suspend') : FREE.test(k) ? (isMarker(v) ? v : drop(v, 'values')) : kept(v) || isMarker(v) ? v : drop(v, 'values')
    if (Array.isArray(v)) return v.map(x => tree(x, k))
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([x, y]) => [x, tree(y, x)]))
    return v
  }
  // An operand preview in the execution trace: [type, value, …]. Strings are the content's; numbers, booleans and names stay.
  const preview = p => {
    if (!Array.isArray(p)) return p
    if (p[0] === 'string') { const s = String(p[1] ?? ''); if (kept(s)) return ['string', s]; count('previews'); return ['string', mark(p[2] || s.length)] }
    if (p[0] === 'symbol') return ['symbol']
    return p
  }
  const probe = p => {
    switch (p.type) {
      case 'dom': cut(p, 'sample', 'dom'); cut(p, 'loader', 'dom'); break
      case 'dialog': cut(p, 'message', 'dom'); break
      case 'input': cut(p, 'text', 'typed'); break
      case 'post': if (p.shape) { fix(p.shape, 'value', v => tree(v)); fix(p.shape, 'vals', v => tree(v)) } break
      case 'pin-failed': case 'probe-failed': edit(p, 'error', browserMsg); break
    }
    if (p.type === 'api') { fix(p, 'value', v => tree(v, p.el)); fix(p, 'result', v => tree(v, /GetValue$/.test(p.call) ? p.el : '')); edit(p, 'diag', browserMsg) }
    else if (p.type !== 'post') { fix(p, 'value', v => tree(v, p.path)); fix(p, 'result', v => tree(v)); fix(p, 'values', v => tree(v)) }
  }
  // A finding that comes from the package's files: "file:line  code" keeps the place; quoted strings go.
  const finding = f => ({ ...f, title: msg(f.title ?? ''), ...(f.detail !== undefined && { detail: msg(f.detail) }),
    evidence: (f.evidence ?? []).map(e => { const m = /^(.+?:\d+)  (.*)$/s.exec(String(e)); if (m) { count('snippets'); return m[1] + '  ' + marker(m[2]) } return msg(e) }) })
  const profile = p => {
    if (!p || typeof p !== 'object') return
    if (p.headers && typeof p.headers === 'object') { p.headers = Object.fromEntries(Object.entries(p.headers).map(([k, v]) => [k, drop(String(v), 'headers')])); skip(p, 'headers') }
    cut(p, 'csp', 'headers')
    fix(p, 'launchParams', v => query(v.replace(/^[?&]/, '')))
  }

  const t = r.trace, l = r.launch, o = l?.options
  // ---- Trace ----
  for (const p of t?.probe ?? []) probe(p)
  for (const e of t?.console ?? []) cut(e, 'text', 'console')
  for (const e of t?.log ?? []) { if (LOG_KEEP.has(e.source)) edit(e, 'text', browserMsg); else cut(e, 'text', 'console') }
  for (const e of [...(t?.exceptions ?? []), ...(t?.caught ?? [])]) edit(e, 'text', browserMsg)
  for (const q of t?.requests ?? []) {
    for (const k of ['postData', 'body', 'headers']) if (q[k] !== undefined) { delete q[k]; count('bodies') }
    edit(q, 'answerFailed', browserMsg); fix(q, 'answerMatch', urlish)
  }
  if (t?.cmi) t.cmi = tree(t.cmi)
  for (const b of t?.exec ?? []) for (const ev of b.events ?? []) if (ev[1] === 3) for (let i = 4; i < ev.length; i++) ev[i] = preview(ev[i])
  for (const s of t?.sites ?? []) {
    if (s.kind !== 'function') cut(s, 'text', 'scripts')
    if (Array.isArray(s.args)) { s.args = s.args.map(a => drop(a, 'scripts')); skip(s, 'args') }
    fix(s, 'file', pathField)
  }
  for (const u of t?.untraced ?? []) { fix(u, 'file', pathField); edit(u, 'why', browserMsg) }
  if (t?.sources) { count('scripts', Object.keys(t.sources).length); t.sources = {} }

  // ---- Launch and options ----
  if (l) { if (l.item !== undefined) { delete l.item; count('titles') }; profile(l.profile) }
  if (o) {
    if (o.files) o.files = Object.fromEntries(Object.entries(o.files).map(([p, e]) => [hashPath(p), e?.base64 !== undefined ? { base64: drop(e.base64, 'files') } : { content: drop(typeof e === 'string' ? e : e?.content ?? '', 'files') }]))
    if (o.macro) for (const ev of o.macro) cut(ev, 'text', 'typed')
    for (const x of o.responses ?? []) {
      cut(x, 'body', 'bodies'); fix(x, 'match', urlish)
      if (x.headers && typeof x.headers === 'object') { x.headers = Object.fromEntries(Object.entries(x.headers).map(([k, v]) => [k, drop(String(v), 'headers')])); skip(x, 'headers') }
    }
    for (const p of o.pins ?? []) fix(p, 'value', v => tree(v, p.path))
    fix(o, 'launchParams', v => query(v.replace(/^[?&]/, '')))
    profile(o.profile)
  }

  // ---- Boot graph ----
  const b = r.boot
  if (b) {
    fix(b, 'start', pathField)
    for (const n of b.nodes ?? []) for (const k of ['path', 'target', 'ref', 'from', 'actual', 'elsewhere', 'doc', 'scriptRelative']) fix(n, k, pathField)
    for (const pg of b.pages ?? []) {
      fix(pg, 'path', pathField); fix(pg, 'base', pathField); cut(pg, 'bodyText', 'dom')
      for (const x of pg.execOrder ?? []) fix(x, 'name', v => /^inline script at /.test(v) ? 'inline script at ' + pathField(v.slice(17)) : pathField(v))
    }
    for (const d of b.dynamic ?? []) { fix(d, 'file', pathField); cut(d, 'text', 'scripts') }
    if (b.risks) b.risks = b.risks.map(finding)
  }

  // ---- Analysis: only what the report shows, with the code snippets and titles taken out ----
  if (r.analysis) {
    const a = r.analysis, m = a.manifest, resource = x => ({ id: x.id, type: x.type, href: pathField(x.href ?? ''), base: pathField(x.base ?? ''), path: x.path == null ? null : pathField(x.path),
      query: x.query ? '?' + query(x.query.replace(/^\?/, '')) : '', files: (x.files ?? []).map(pathField), deps: x.deps ?? [] })
    let n = 0
    r.analysis = { files: a.files, size: a.size, root: pathField(a.root ?? ''), apiUse: a.apiUse, tool: a.tool, packs: a.packs, fingerprints: a.fingerprints,
      problems: (a.problems ?? []).map(p => ({ code: p.code, text: msg(p.text) })),
      ...(m && { manifest: { version: m.version, edition: m.edition, schemaversion: m.schemaversion, resources: (m.resources ?? []).map(resource),
        items: (m.items ?? []).map(i => { if (i.title) count('titles'); return { id: `item ${++n}`, title: '', depth: i.depth, resource: i.resource, type: i.type, res: i.res ? resource(i.res) : undefined,
          params: i.params ? query(i.params.replace(/^[?&]/, '')) : '', launchData: drop(i.launchData, 'values'), mastery: i.mastery, maxTime: i.maxTime, timeLimitAction: i.timeLimitAction, completionThreshold: i.completionThreshold } }) } }),
      scan: Object.fromEntries(Object.entries(a.scan ?? {}).map(([file, s]) => [hashPath(file), Object.fromEntries(Object.entries(s).map(([k, list]) => [k, list.map(x => ({ line: x.line, match: drop(x.match, 'snippets'), text: drop(x.text, 'snippets') }))]))])),
      packFindings: (a.packFindings ?? []).map(finding) }
  }
  for (const p of paths) hashPath(String(p))
  const pkgOrig = r.package ?? pkgName
  if (names && pkgOrig) hashSeg(pkgOrig, true)
  // What is rebuilt later is not walked: the saved findings and milestones go; the package findings the run carried are kept to scrub.
  const savedPack = t && !r.analysis ? (r.findings ?? []).filter(f => f.pack).map(finding) : []
  if (t || r.analysis || r.boot) { delete r.findings; delete r.milestones } else r.findings = (r.findings ?? []).map(finding)
  r._saved = savedPack

  // ---- Every other string: URLs, local paths, file names ----
  // The names found so far (and every path in a package URL) are also hashed where they stand in prose, such as a message.
  if (names) {
    const collect = v => { if (typeof v === 'string') for (const u of v.match(/(?:lab|https?):\/\/[^/\s'"<>)\]]*\/pkg\/[^\s'"<>)\]?#]+/g) ?? []) hashPath(u.replace(/^[^/]*\/\/[^/]*\/pkg\//, '')); else if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === 'object') Object.values(v).forEach(collect) }
    collect(r)
    const files = [...map.keys()].filter(k => !k.endsWith('/') && /\.\w+$/.test(k))
    const alts = [...new Set([...known].filter(k => k.includes('/') && /\.\w+$/.test(k)).concat(files))].sort((x, y) => y.length - x.length).map(escRe)
    if (alts.length) bareRe = new RegExp(`(?<![\\w./%-])(?:${alts.join('|')})(?![\\w-]|\\.\\w)`, 'g')
  }
  const walk = v => {
    if (typeof v === 'string') return scrub(v)
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') { const d = done.get(v); for (const k of Object.keys(v)) if (!d?.has(k)) v[k] = walk(v[k]); return v }
    return v
  }
  const analysis = r.analysis; delete r.analysis
  for (const k of Object.keys(r)) r[k] = walk(r[k])
  if (analysis) { for (const k of ['problems', 'packFindings']) analysis[k] = walk(analysis[k]); r.analysis = analysis }
  const saved = r._saved; delete r._saved

  // ---- The label, from structure ----
  const pkgShown = pkgOrig ? (names ? hashSeg(pkgOrig, true) : pkgOrig) : null
  const label = () => {
    if (r.kind !== 'package' || !l) return r.label
    const ex = l.expose
    return [pkgShown ?? '', `item ${(l.itemIndex ?? 0) + 1}`, ex === 'both' ? 'both APIs' : ex === 'none' ? 'no API' : `SCORM ${ex}`,
      ...(l.profile?.name && l.profile.name !== 'generic' ? [l.profile.name] : []), ...(l.storage && l.storage !== 'normal' ? [`storage ${l.storage}`] : []),
      ...(l.depth ? [`depth ${l.depth}`] : []), ...(l.opener ? ['window'] : []), ...(l.resume ? ['resumed'] : []),
      ...(o?.browser && o.browser !== 'chromium' ? [o.browser] : []), ...(o?.viewport ? [viewportName(o.viewport)] : [])].filter(Boolean).join(' · ')
  }
  if (pkgOrig) r.package = pkgShown
  if (r.label !== undefined || t?.label !== undefined || l) { const s = label(); if (r.label !== undefined || l) r.label = s; if (t?.label !== undefined) t.label = s }
  delete r.file

  // ---- The findings, worked out again from the redacted data ----
  const kind = r.kind ?? 'package'
  if (t) {
    Object.assign(r, r.analysis
      ? runAnalysis({ kind, launch: l, trace: t, boot: r.boot, analysis: r.analysis })
      : withProgress(kind, t, r.boot, [...launchFindings(t, r.boot), ...runFindings(t, { kind, ...l }), ...(kind === 'package' ? r.boot?.risks ?? [] : []), ...(kind === 'package' ? saved : [])], l))
  } else if (r.analysis || r.boot) r.findings = sortFindings([...staticFindings(r.analysis), ...(r.boot?.risks ?? [])])
  r.redaction = { names, counts: c }
  return r
}
