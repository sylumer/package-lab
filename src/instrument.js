// Code instrumentation (P1.4): the ordered execution trace. Pure; no Electron.
//
// instrument() parses a script with acorn and inserts calls by text position, without generating code, so everything
// else stays byte for byte as it was and no line moves:
//   - at the start of each function body (after its directives) __labT(1, site), and __labT(2, site) at its end;
//     `return x` becomes `return __labR(site, (x))` and a bare `return` becomes `return __labT(2, site)`;
//   - each decision (an if, ternary, while, do-while or for test, the left of &&, || and ??, a switch discriminant)
//     becomes __labC(site, (test)), which records it and gives back the value. A comparison of simple operands
//     (names, properties, literals, typeof x) becomes __labC(site, (a), (b), "==="), which compares inside the call
//     (each operand still evaluated once, in order), and !x becomes __labC(site, (x), 0, "!").
// Code inside `with` is left alone (the names would be looked up on the with object). A file that doesn't parse is
// served unchanged. The site table gives each id its file, line, column, kind and text.
//
// The page side is src/host/trace-probe.js. A .js file also starts with PRELUDE, which defines do-nothing versions of
// the three functions where the probe isn't (workers), so the code runs there as before.
import { parse } from './vendor/acorn.js'

export const MAX_TRACED = 2 * 1024 ** 2   // bytes: larger files are served as they are and listed as not traced
const OPS = new Set(['===', '!==', '==', '!=', '<', '<=', '>', '>=', 'in', 'instanceof'])
const UNARY = new Set(['typeof', 'void', '-', '+', '!', '~'])
// The comparisons __labC does for the operand forms. The probe has the same switch.
const COMPARE = 'switch(o){case void 0:case"??":return a;case"!":return!a;case"===":return a===b;case"!==":return a!==b;case"==":return a==b;case"!=":return a!=b;case"<":return a<b;case"<=":return a<=b;case">":return a>b;case">=":return a>=b;case"in":return a in b;case"instanceof":return a instanceof b}'
export const PRELUDE = `typeof __labT=="function"||function(g){function d(n,f){Object.defineProperty(g,n,{value:f,configurable:true})}d("__labT",function(){});d("__labR",function(s,v){return v});d("__labC",function(s,a,b,o){${COMPARE}})}(globalThis);`

export const clip = (s, n = 120) => { s = s.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }
const LINE = /\r\n?|[\n\u2028\u2029]/g   // line ends as V8 counts them
export function lineStarts(text) { const out = [0]; for (const m of text.matchAll(LINE)) out.push(m.index + m[0].length); return out }
// The index of the last entry <= x in a sorted list (by key).
function lastAtMost(list, x, key = v => v) { let lo = 0, hi = list.length - 1, i = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (key(list[m]) <= x) { i = m; lo = m + 1 } else hi = m - 1 } return i }

function parseJs(src, module) {
  let first
  for (const sourceType of module ? ['module', 'script'] : ['script', 'module']) {
    const tokens = []
    try { return { ast: parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, onToken: t => tokens.push(t.start, t.end) }), tokens } } catch (e) { first ??= e }
  }
  throw first
}

const simple = n => n.type === 'Identifier' || n.type === 'ThisExpression' || n.type === 'Literal' || n.type === 'MemberExpression' || n.type === 'ChainExpression' ||
  n.type === 'TemplateLiteral' && !n.expressions.length || n.type === 'UnaryExpression' && UNARY.has(n.operator) && simple(n.argument)
const keyName = k => k.type === 'Identifier' ? k.name : k.type === 'PrivateIdentifier' ? '#' + k.name : k.type === 'Literal' ? String(k.value) : '[…]'

// Adds the edits and sites for one script (src, which starts at offset in the whole text) to ctx.
function instrumentScript(src, offset, module, ctx) {
  const { ast, tokens } = parseJs(src, module)
  const text = n => src.slice(n.start, n.end)
  const at = (pos, txt, rank, seq, end) => ctx.edits.push({ pos: offset + pos, end: end === undefined ? undefined : offset + end, text: txt, rank, seq })
  const site = (kind, node, txt, args) => {
    const pos = offset + node.start, line = lastAtMost(ctx.lines, pos)
    ctx.sites.push({ file: ctx.file, line: line + 1, col: pos - ctx.lines[line] + 1, kind, text: clip(txt), ...(args ? { args: args.map(a => clip(a, 60)) } : {}) })
    return ctx.base + ctx.sites.length - 1
  }
  // The single token strictly between two positions, or null (there are parentheses or nothing).
  const tokenBetween = (from, to) => {
    let lo = 0, hi = tokens.length / 2   // the first token starting at or after from
    while (lo < hi) { const m = (lo + hi) >> 1; if (tokens[m * 2] < from) lo = m + 1; else hi = m }
    const i = lo * 2
    return i + 2 < tokens.length && tokens[i + 1] <= to && tokens[i + 2] >= to ? [tokens[i], tokens[i + 1]] : null
  }
  let seq = 0
  const wrap = (node, pre, post) => { const s = ++seq; at(node.start, pre, 2, s); at(node.end, post, 0, s) }
  const decision = (test, kind) => {
    if (kind === '??') { wrap(test, `__labC(${site(kind, test, text(test), simple(test) ? [text(test)] : null)},(`, '),0,"??")'); return }
    if (test.type === 'BinaryExpression' && OPS.has(test.operator) && simple(test.left) && simple(test.right)) {
      const op = tokenBetween(test.left.end, test.right.start)
      if (op && src.slice(op[0], op[1]) === test.operator) {
        const s = ++seq
        at(test.left.start, `__labC(${site(kind, test, text(test), [text(test.left), text(test.right)])},(`, 2, s)
        at(op[0], '),(', 1, s, op[1])
        at(test.right.end, `),${JSON.stringify(test.operator)})`, 0, s)
        return
      }
    }
    if (test.type === 'UnaryExpression' && test.operator === '!' && simple(test.argument) && tokenBetween(test.start, test.argument.start)?.[0] === test.start) {
      const s = ++seq
      at(test.start, `__labC(${site(kind, test, text(test), [text(test.argument)])},(`, 2, s, test.start + 1)   // ordered with the opens: outer wraps first
      at(test.end, '),0,"!")', 0, s)
      return
    }
    wrap(test, `__labC(${site(kind, test, text(test), simple(test) ? [text(test)] : null)},(`, '))')
  }
  const fnName = (n, parent) => n.id?.name || (/^(Property|MethodDefinition|PropertyDefinition)$/.test(parent?.type) && parent.value === n ? keyName(parent.key)
    : parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier' ? parent.id.name : parent?.type === 'AssignmentExpression' && parent.right === n ? clip(text(parent.left), 60) : '') || '(anonymous)'
  const enterFn = (n, parent) => {
    const s = site('function', n, fnName(n, parent)), q = ++seq
    if (n.body.type !== 'BlockStatement') { at(n.body.start, `(__labT(1,${s}),__labR(${s},(`, 2, q); at(n.body.end, ')))', 0, q); return s }
    const dirs = n.body.body.filter((st, i, all) => st.directive !== undefined && all.slice(0, i).every(x => x.directive !== undefined))
    at(dirs.length ? dirs.at(-1).end : n.body.start + 1, `${dirs.length ? ';' : ''}__labT(1,${s});`, 2, q)
    at(n.body.end - 1, `;__labT(2,${s});`, 2, Infinity)   // after anything that closes there
    return s
  }
  const visit = (node, parent, fn) => {
    switch (node.type) {
      case 'WithStatement': visit(node.object, node, fn); return   // nothing inside a with block
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': fn = enterFn(node, parent); break
      case 'ReturnStatement':
        if (fn === undefined) break
        if (node.argument) wrap(node.argument, `__labR(${fn},(`, '))'); else at(node.start + 6, ` __labT(2,${fn})`, 2, ++seq)
        break
      case 'IfStatement': decision(node.test, 'if'); break
      case 'ConditionalExpression': decision(node.test, 'ternary'); break
      case 'LogicalExpression': decision(node.left, node.operator); break
      case 'SwitchStatement': decision(node.discriminant, 'switch'); break
      case 'WhileStatement': decision(node.test, 'while'); break
      case 'DoWhileStatement': decision(node.test, 'do-while'); break
      case 'ForStatement': if (node.test) decision(node.test, 'for'); break
    }
    for (const k in node) {
      const v = node[k]
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') visit(c, node, fn) } else if (v && typeof v.type === 'string' && k !== 'loc') visit(v, node, fn)
    }
  }
  visit(ast, null, undefined)
  return ast
}

// Applies the edits: closes first at a position (inner before outer), then opens and replaced tokens (outer before
// inner). An insertion that starts with a name character after one gets a space, so `return!x` can't become one name.
// map: [origStart, origEnd, genStart, genEnd] per edit, for toOrig.
function assemble(text, edits) {
  edits.sort((a, b) => a.pos - b.pos || a.rank - b.rank || (a.rank === 0 ? b.seq - a.seq : a.seq - b.seq))
  const parts = [], map = []
  let from = 0, len = 0, tail = ''   // tail: the last characters written, without joining the parts
  for (const e of edits) {
    if (e.pos < from) throw new Error('overlapping edits')
    if (e.pos > from) { parts.push(text.slice(from, e.pos)); len += e.pos - from; tail = text.slice(Math.max(from, e.pos - 2), e.pos) }
    const t = /^[\w$]/.test(e.text) && /[\p{ID_Continue}$\u200c\u200d\\]$/u.test(tail) ? ' ' + e.text : e.text
    map.push([e.pos, e.end ?? e.pos, len, len + t.length])
    parts.push(t); len += t.length; tail = t.slice(-2); from = e.end ?? e.pos
  }
  parts.push(text.slice(from))
  return { code: parts.join(''), map }
}

// A position in the instrumented text → the position in the original. Inside an insertion it is where it was inserted.
export function toOrig(map, g) {
  const i = lastAtMost(map, g, m => m[2])
  if (i < 0) return g
  const [os, oe, gs, ge] = map[i]
  return g < ge ? os : oe + (g - ge)
}

// One script. { code, sites, map } or, if it doesn't parse, { code: source, sites: [], map: [], error }.
// base is the id of the first site (site ids are unique across a run's files); module: try module before script.
export function instrument(source, { file = '', base = 0, module = false } = {}) {
  const ctx = { file, base, sites: [], edits: [], lines: lineStarts(source) }
  try {
    const ast = instrumentScript(source, 0, module, ctx)
    if (!ctx.edits.length) return { code: source, sites: [], map: [] }
    // The prelude goes after the directives, so "use strict" stays first, and before everything else.
    const dirs = ast.body.filter((st, i, all) => st.directive !== undefined && all.slice(0, i).every(x => x.directive !== undefined))
    ctx.edits.push({ pos: dirs.length ? dirs.at(-1).end : ast.body[0].start, text: (dirs.length ? ';' : '') + PRELUDE, rank: 2, seq: 0 })
    return { ...assemble(source, ctx.edits), sites: ctx.sites }
  } catch (e) { return { code: source, sites: [], map: [], error: e instanceof RangeError ? 'too deeply nested' : String(e.message).slice(0, 200) } }
}

// Inline scripts of a page (not in comments; no src; a JavaScript type or module). [{ start, end, module }]
export function inlineScripts(html) {
  const out = [], re = /<!--|<script\b([^>]*)>/gi
  let m
  while ((m = re.exec(html))) {
    if (m[0] === '<!--') { const e = html.indexOf('-->', m.index + 4); if (e < 0) break; re.lastIndex = e + 3; continue }
    const attrs = m[1], start = m.index + m[0].length, close = html.slice(start).search(/<\/script/i), end = close < 0 ? html.length : start + close
    re.lastIndex = end
    const type = /\btype\s*=\s*["']?\s*([^"'\s>]*)/i.exec(attrs)?.[1].toLowerCase() ?? ''
    if (/\bsrc\s*=/i.test(attrs) || type && !/^((text|application)\/(x-)?(java|ecma)script|module)$/.test(type)) continue
    out.push({ start, end, module: type === 'module' })
  }
  return out
}

// A page: each inline script instrumented in place. { code, sites, map, scripts: [[origStart, origEnd]], errors: [] }.
export function instrumentHtml(html, { file = '', base = 0 } = {}) {
  const ctx = { file, base, sites: [], edits: [], lines: lineStarts(html) }, errors = [], scripts = []
  for (const s of inlineScripts(html)) {
    const sites = ctx.sites.length, edits = ctx.edits.length
    scripts.push([s.start, s.end])
    try { instrumentScript(html.slice(s.start, s.end), s.start, s.module, ctx) } catch (e) {
      ctx.sites.length = sites; ctx.edits.length = edits
      errors.push(`inline script at line ${lastAtMost(ctx.lines, s.start) + 1}: ${e instanceof RangeError ? 'too deeply nested' : String(e.message).slice(0, 200)}`)
    }
  }
  if (!ctx.edits.length) return { code: html, sites: [], map: [], scripts, errors }
  return { ...assemble(html, ctx.edits), sites: ctx.sites, scripts, errors }
}

// ---- After the run: positions back to the original files ----
const pathOf = u => { try { const x = new URL(u); return x.protocol === 'lab:' && x.pathname.startsWith('/pkg/') ? decodeURIComponent(x.pathname.slice(5)) : null } catch { return null } }

// Everything the browser recorded about an instrumented file points into the instrumented text. restoreTrace puts it
// back: columns of stack frames (lines never move), coverage offsets, and the sources (the original text, so
// trace.sources holds what the package has). files: Map of package path → { original, code, map, scripts? }.
export function restoreTrace(trace, files) {
  if (!files?.size) return trace
  const lines = new Map(), linesOf = f => { if (!lines.has(f)) lines.set(f, { gen: lineStarts(f.code), orig: lineStarts(f.original) }); return lines.get(f) }
  const col = (url, line, c) => {
    const f = files.get(pathOf(url))
    if (!f || !f.map.length || !(line > 0) || !(c > 0)) return c
    const l = linesOf(f), g = l.gen[line - 1]
    return g === undefined || l.orig[line - 1] === undefined ? c : toOrig(f.map, g + c - 1) - l.orig[line - 1] + 1
  }
  const fixFrames = list => { for (const fr of list ?? []) if (fr && fr.col !== undefined) fr.col = col(fr.url, fr.line, fr.col) }
  for (const s of trace.scripts ?? []) fixFrames(s.from)
  for (const r of trace.requests ?? []) fixFrames(r.from)
  for (const k of ['console', 'exceptions', 'caught']) for (const x of trace[k] ?? []) fixFrames(x.at)
  for (const p of trace.probe ?? []) for (const k of ['stack', 'sites']) if (Array.isArray(p[k])) p[k] = p[k].map(s => typeof s === 'string' ? s.replace(/(lab:\/\/(?:run|content)\/pkg\/[^\s()]*?):(\d+):(\d+)/g, (_, u, l, c) => `${u}:${l}:${col(u, +l, +c)}`) : s)
  // Coverage offsets are from the start of each script: for an inline script, that start is in the page.
  const scripts = new Map((trace.scripts ?? []).map(s => [s.sid + ':' + s.id, s])), firstStart = new Map()
  for (const c of trace.coverage ?? []) {
    const f = files.get(pathOf(c.url))
    if (!f) continue
    let base = 0
    if (f.scripts) { const st = scripts.get(c.sid + ':' + c.id)?.start ?? [0, 0], g = linesOf(f).gen[st[0]]; base = g === undefined ? 0 : g + st[1] }
    const origBase = toOrig(f.map, base)
    if (!firstStart.has(c.url)) firstStart.set(c.url, origBase)
    for (const fn of c.fns) fn[1] = fn[1].map((v, i) => i % 3 === 2 ? v : toOrig(f.map, base + v) - origBase)
  }
  for (const url of Object.keys(trace.sources ?? {})) {
    const f = files.get(pathOf(url))
    if (!f) continue
    if (!f.scripts) { trace.sources[url] = f.original; continue }
    const start = firstStart.get(url), s = f.scripts.find(x => x[0] === start) ?? f.scripts[0]
    if (s) trace.sources[url] = f.original.slice(s[0], s[1])
  }
  return trace
}

// ---- Reading the trace ----
// trace.exec: [{ t, sid, frame, events: [[t, kind, site, result, ...previews]] }]. Kinds: 1 entry, 2 exit, 3 decision,
// 4 "the event before repeated n more times" ([t, 4, site, result, n]). A preview is [type, value?, …] (trace-probe.js).
export function show(p) {
  if (!Array.isArray(p)) return '?'
  switch (p[0]) {
    case 'string': return JSON.stringify(p[1]) + (p[2] ? `… (${p[2]} characters)` : '')
    case 'number': case 'boolean': return String(p[1])
    case 'undefined': case 'null': return p[0]
    case 'bigint': return p[1] + 'n'
    case 'symbol': return p[1] ?? 'Symbol()'
    case 'function': return `function ${p[1] || '(anonymous)'}`
    case 'object': return (p[1] || 'Object') + (Array.isArray(p[2]) ? ` {${p[2].join(', ')}${p[3] > p[2].length ? ', …' : ''}}` : '')
    default: return p[0]
  }
}
export const LITERAL = /^(['"`].*['"`]|-?[\d.][\w.]*|true|false|null|undefined|void 0)$/
export const HEAD = { if: t => `if (${t})`, ternary: t => `${t} ? …`, '&&': t => `${t} && …`, '||': t => `${t} || …`, '??': t => `${t} ?? …`, switch: t => `switch (${t})`,
  while: t => `while (${t})`, 'do-while': t => `do … while (${t})`, for: t => `for (…; ${t}; …)` }
// One event as a sentence: "if (cfg.lms) → false, cfg.lms = undefined", "startCourse() called".
export function describe(ev, site) {
  if (!site) return `site ${ev[2]} (unknown)`
  if (ev[1] === 1) return `${site.text}() called`
  if (ev[1] === 2) return `${site.text}() returned`
  if (ev[1] === 4) return `(the same ${ev[4]} more times)`
  const prev = ev.slice(4), head = (HEAD[site.kind] ?? (t => t))(site.text)
  if (site.kind === 'switch') return `${head} → ${show(prev[0])}`
  const result = site.kind === '??' ? (ev[3] ? 'has a value' : 'null or undefined') : ev[3] ? 'true' : 'false'
  const vals = (site.args ?? []).map((a, i) => [a, prev[i]]).filter(([a, p]) => p && !LITERAL.test(a) && a !== show(p)).map(([a, p]) => `${a} = ${show(p)}`)
  return [`${head} → ${result}`, ...vals].join(', ')
}
// The last n events of the run, in time order across frames, each with its place and its sentence.
export function lastEvents(trace, n = 500) {
  const all = []
  for (const b of trace.exec ?? []) for (const e of b.events) all.push([e, b.frame])
  all.sort((a, b) => a[0][0] - b[0][0])
  return all.slice(-n).map(([e, frame]) => {
    const s = trace.sites?.[e[2]]
    return { t: e[0], frame, kind: e[1], site: e[2], file: s?.file ?? '', line: s?.line ?? 0, col: s?.col ?? 0, say: describe(e, s) }
  })
}
export const eventCount = trace => (trace.exec ?? []).reduce((n, b) => n + b.events.length, 0)

// Findings that only a traced run has: files left as they were, and a trace cut short.
export function traceFindings(trace) {
  if (!trace?.sites) return []
  const out = []
  const un = trace.untraced ?? []
  if (un.length) out.push({ sev: 'info', title: `${un.length} script file${un.length > 1 ? 's were' : ' was'} not traced`,
    detail: 'These ran as they are, so the Execution tab shows nothing from them. Everything else about the run is the same.',
    evidence: un.slice(0, 10).map(u => `${u.file}: ${u.why}`), fix: 'A file over 2 MB is left out to keep the run quick; a file Package Lab couldn’t read as JavaScript may use syntax it doesn’t know yet. The rest of the trace still applies.' })
  if (trace.truncated?.exec) out.push({ sev: 'info', title: 'The execution trace is incomplete',
    detail: 'The content ran more than 200,000 functions and decisions, so the oldest were dropped. The last ones, which show where it stopped, are kept.',
    evidence: [`${eventCount(trace)} events kept`], fix: 'Stop the run sooner after the point you care about, or change the files so less runs before it.' })
  return out
}
