// Drill-down (P1.5): from a traced run (P1.4), the decisions that led to the dead end, each with its values, and where
// each undefined came from, as a numbered chain. Pure: the caller runs the content, twice (traced, then again with
// watch pins on the paths drill() asks for) and passes both traces.
//
//   drill({ trace, milestones, files, launch })          → { watch: [paths], … } (the static pass)
//   drill({ trace, milestones, files, launch, watch })   → the same with what the watch run saw (watch: its trace)
//
// files is the Map of package path → Buffer or text the run was served (overrides applied). Sources are parsed with
// the vendored acorn; sites, coverage and events come from the trace.
import { parse, parseExpressionAt } from './vendor/acorn.js'
import { lineStarts, inlineScripts, show, clip, LITERAL, HEAD, MAX_TRACED } from './instrument.js'
import { pinPathProblem } from './pins.js'
import { globals } from './bootpath.js'

export const QUIET = 2000, WINDOW = 300, NEAR = 1000, LEVELS = 3
const GLOBAL = new Set(['window', 'self', 'globalThis'])
const CALLBACK = new Set(['then', 'done', 'success', 'always', 'getJSON', 'get', 'post', 'ajax', 'load', 'onload', 'onreadystatechange'])
const short = u => String(u ?? '').replace(/^lab:\/\/(?:run|content)\/pkg\//, '').replace(/^lab:\/\/(?:run|content)(?=\/)/, '')
const pkgPath = u => { try { const x = new URL(u); return x.protocol === 'lab:' && x.pathname.startsWith('/pkg/') ? decodeURIComponent(x.pathname.slice(5)) : null } catch { return null } }
const textOf = b => typeof b === 'string' ? b : b.toString('utf8')
const secs = t => `${(t / 1000).toFixed(1)} s`
const code = s => '`' + s + '`'

// ---- Sources: every script of the package, parsed once, with parent links ----
function tryParse(src, module) {
  for (const sourceType of module ? ['module', 'script'] : ['script', 'module']) {
    try { return parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true }) } catch { /* the other way, or nothing */ }
  }
  return null
}
// [{ file, text, ast, parent (WeakMap), all (nodes in source order) }]. A page's inline scripts are parsed one at a time
// over a copy of the page with everything else blanked, so their positions are positions in the page.
export function programs(files) {
  const out = []
  for (const [file, buf] of files ?? []) {
    const ext = /\.(\w+)$/.exec(file)?.[1].toLowerCase()
    if (!/^(js|mjs|html?)$/.test(ext ?? '') || buf.length > MAX_TRACED) continue
    const text = textOf(buf), html = /^html?$/.test(ext)
    const parts = html ? inlineScripts(text).map(s => [text.slice(0, s.start).replace(/[^\r\n]/g, ' ') + text.slice(s.start, s.end), s.module]) : [[text, ext === 'mjs']]
    for (const [src, module] of parts) {
      const ast = tryParse(src, module)
      if (!ast) continue
      const parent = new WeakMap(), all = []
      try {
        (function walk(n, p) {
          parent.set(n, p); all.push(n)
          for (const k in n) { const v = n[k]; if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, n) } else if (v && typeof v.type === 'string') walk(v, n) }
        })(ast, null)
      } catch { continue }   // too deeply nested
      out.push({ file, text, html, ast, parent, all })
    }
  }
  return out
}

// 'window.player' → 'player', 'cfg?.lms' → 'cfg.lms'; null for anything that isn't a plain dotted path.
export function nodePath(node) {
  const segs = []
  for (let n = node; ;) {
    if (n.type === 'ChainExpression') { n = n.expression; continue }
    if (n.type === 'Identifier') { segs.unshift(n.name); break }
    if (n.type !== 'MemberExpression') return null
    if (!n.computed) segs.unshift(n.property.name)
    else if (n.property.type === 'Literal' && typeof n.property.value === 'string') segs.unshift(n.property.value)
    else return null
    n = n.object
  }
  while (segs.length > 1 && GLOBAL.has(segs[0])) segs.shift()
  return segs.join('.')
}
export function codePath(text) {
  try { const n = parseExpressionAt(text, 0, { ecmaVersion: 'latest' }); return n.end === text.length ? nodePath(n) : null } catch { return null }
}

const isFn = n => /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n?.type)
const exits = s => !!s && (/^(ReturnStatement|ThrowStatement|BreakStatement|ContinueStatement)$/.test(s.type)
  || s.type === 'BlockStatement' && exits(s.body.at(-1)) || s.type === 'IfStatement' && exits(s.consequent) && exits(s.alternate))
// The code a decision didn't take, as { start, end }, or null if there is none (an if without else that carries on).
export function untakenRange(prog, node, result) {
  if (node.type === 'IfStatement') {
    if (!result) return node.consequent
    if (node.alternate) return node.alternate
    if (!exits(node.consequent)) return null
    const p = prog.parent.get(node), body = p?.type === 'SwitchCase' ? p.consequent : p?.body
    const next = Array.isArray(body) ? body.slice(body.indexOf(node) + 1) : []
    return next.length ? { start: next[0].start, end: next.at(-1).end } : null
  }
  if (node.type === 'ConditionalExpression') return result ? node.alternate : node.consequent
  if (node.type === 'LogicalExpression') return node.operator === '&&' ? (result ? null : node.right) : result ? node.right : null
  return null
}
// The nearest decision that had to go one way for node to run: { test node, kind, want }. Inside a named function that
// has no guard of its own, the guard of the first call to it (one hop).
export function guardOf(progs, prog, node, hops = 1) {
  for (let c = node, p = prog.parent.get(node); p; c = p, p = prog.parent.get(p)) {
    if (p.type === 'IfStatement' && c !== p.test) return { prog, node: p, kind: 'if', at: p.test.start, want: c === p.consequent ? 1 : 0 }
    if (p.type === 'ConditionalExpression' && c !== p.test) return { prog, node: p, kind: 'ternary', at: p.test.start, want: c === p.consequent ? 1 : 0 }
    if (p.type === 'LogicalExpression' && c === p.right) return { prog, node: p, kind: p.operator, at: p.left.start, want: p.operator === '&&' ? 1 : 0 }
    if (isFn(p)) {
      const name = p.id?.name ?? (prog.parent.get(p)?.type === 'VariableDeclarator' ? prog.parent.get(p).id.name : null)
      if (!name || hops < 1) return null
      for (const q of progs) for (const n of q.all) if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === name) return guardOf(progs, q, n, hops - 1)
      return null
    }
  }
  return null
}

// Static assignments to a path in the package's scripts: assignments, declarations with a value, object literal keys
// under the same path, Object.defineProperty, and top-level function declarations. [{ file, line, at, text, node, value, prog }]
export function assignments(progs, path) {
  const out = [], segs = path.split('.')
  const add = (prog, node, value) => {
    const line = prog.text.slice(0, node.start).split('\n').length, lineText = prog.text.split('\n')[line - 1] ?? ''
    out.push({ file: prog.file, line, at: `${prog.file}:${line}`, text: clip(lineText, 100), node, value, prog })
  }
  // An object literal assigned to a prefix of the path: the key under it, if there is one.
  const inLiteral = (prog, value, rest) => {
    let v = value
    for (const k of rest) {
      if (v?.type !== 'ObjectExpression') return null
      const p = v.properties.find(x => x.type === 'Property' && !x.computed && (x.key.name ?? String(x.key.value)) === k)
      if (!p) return null
      v = p.value
    }
    return v
  }
  for (const prog of progs) for (const n of prog.all) {
    let target = null, value = null
    if (n.type === 'AssignmentExpression') { target = nodePath(n.left); value = n.right }
    else if (n.type === 'VariableDeclarator' && n.init && n.id.type === 'Identifier' && !enclosingFn(prog, n)) { target = n.id.name; value = n.init }
    else if (n.type === 'FunctionDeclaration' && n.id && !enclosingFn(prog, prog.parent.get(n))) { target = n.id.name; value = n }
    else if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && nodePath(n.callee) === 'Object.defineProperty' && n.arguments[1]?.type === 'Literal') {
      const obj = n.arguments[0] && nodePath(n.arguments[0])
      target = obj && (GLOBAL.has(obj) ? String(n.arguments[1].value) : `${obj}.${n.arguments[1].value}`); value = n.arguments[2] ?? null
    }
    if (!target) continue
    if (target === path) add(prog, n, value)
    else if (value && path.startsWith(target + '.')) { const v = inLiteral(prog, value, segs.slice(target.split('.').length)); if (v) add(prog, n, v) }
  }
  return out
}
function enclosingFn(prog, node) { for (let p = node; p; p = prog.parent.get(p)) if (isFn(p)) return p; return null }
const fnLabel = (prog, fn) => fn.id?.name ?? (prog.parent.get(fn)?.type === 'VariableDeclarator' ? prog.parent.get(fn).id.name : 'an anonymous function')
// A name declared in a function around node: { fn, param: bool, init (the declared value) }.
function findLocal(prog, node, name) {
  for (let p = node; p; p = prog.parent.get(p)) {
    if (!isFn(p)) continue
    if (p.params.some(x => x.type === 'Identifier' && x.name === name || x.type === 'AssignmentPattern' && x.left.name === name)) return { fn: p, param: true }
    for (const n of prog.all) if (n.start >= p.body.start && n.end <= p.body.end && enclosingFn(prog, prog.parent.get(n)) === p && (
      n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === name || n.type === 'FunctionDeclaration' && n.id?.name === name)) return { fn: p, param: false, init: n.init ?? null }
  }
  return null
}
// A function given to .then(…), $.getJSON(…), .onload = … and the like: its parameters are what a request sent.
function isCallback(prog, fn) {
  const p = prog.parent.get(fn)
  if (p?.type === 'CallExpression' && p.arguments.includes(fn)) { const c = p.callee; return CALLBACK.has(c.type === 'MemberExpression' ? c.property.name : c.name) }
  if (p?.type === 'AssignmentExpression' && p.right === fn && p.left.type === 'MemberExpression') return CALLBACK.has(p.left.property.name)
  return false
}

// ---- The run ----
function context({ trace, milestones = [], files, launch, watch }) {
  const progs = programs(files), sites = trace.sites ?? [], lines = new Map()
  const all = []
  for (const b of trace.exec ?? []) for (const e of b.events) if (e[1] !== 4) all.push({ ev: e, frame: b.frame })
  all.sort((a, b) => a.ev[0] - b.ev[0])
  const lastOf = new Map(), seen = new Set()
  all.forEach((x, i) => { seen.add(x.ev[2]); if (x.ev[1] === 3) lastOf.set(x.ev[2], i) })
  const ctx = { trace, milestones, files, launch, watch, progs, sites, all, lastOf, seen, wanted: new Set() }
  ctx.offset = s => { const p = ctx.progs.find(q => q.file === s.file); if (!p) return -1; if (!lines.has(s.file)) lines.set(s.file, lineStarts(p.text)); return (lines.get(s.file)[s.line - 1] ?? -1e9) + s.col - 1 }
  return ctx
}

// The events of the dead end: the last 300 before the run went quiet (more than 2 s without events after the last
// milestone reached), plus the decisions within 1 s of that milestone (when the next one was due).
export function deadEnd(all, milestones = []) {
  if (!all.length) return { from: 0, to: 0, end: null, quiet: false }
  const last = milestones.filter(s => s.reached).at(-1), since = last?.t ?? 0
  let end = all.length - 1
  for (let i = 0; i < all.length - 1; i++) if (all[i].ev[0] >= since && all[i + 1].ev[0] - all[i].ev[0] > QUIET) { end = i; break }
  const from = Math.max(0, end - WINDOW + 1), near = []
  if (last) all.forEach((x, i) => { if (i < from && x.ev[1] === 3 && Math.abs(x.ev[0] - last.t) <= NEAR) near.push(i) })
  return { from, to: end, near, end: all[end].ev[0], quiet: end < all.length - 1 }
}

// Did the code between start and end of file run? An event at a site inside says yes; otherwise V8's block coverage
// (the innermost range around start). A page's inline scripts are judged from events only.
// ponytail: inline-script coverage offsets are relative to each script, which isn't worth mapping here; events only.
export function ran(ctx, file, start, end) {
  for (const [id, s] of ctx.sites.entries()) if (s?.file === file && ctx.seen.has(id)) { const o = ctx.offset(s); if (o >= start && o < end) return true }
  if (/\.html?$/i.test(file)) return null
  const cov = (ctx.trace.coverage ?? []).filter(c => pkgPath(c.url) === file)
  if (!cov.length) return loaded(ctx, file) ? null : false
  let any = false
  for (const c of cov) {
    let best = null
    for (const [, r] of c.fns) for (let i = 0; i < r.length; i += 3) if (r[i] <= start && start < r[i + 1] && (!best || r[i + 1] - r[i] < best[1] - best[0])) best = [r[i], r[i + 1], r[i + 2]]
    if (best && best[2] > 0) any = true
  }
  return any
}
const loaded = (ctx, file) => (ctx.trace.scripts ?? []).some(s => pkgPath(s.url) === file) || (ctx.trace.requests ?? []).some(r => pkgPath(r.url) === file && !r.failed && !(r.status >= 400))

// The node a decision site stands for, and its program.
function siteNode(ctx, s) {
  const off = ctx.offset(s)
  for (const prog of ctx.progs) {
    if (prog.file !== s.file) continue
    for (const n of prog.all) {
      if (n.start > off) break
      if (s.kind === 'if' && n.type === 'IfStatement' && n.test.start === off || s.kind === 'ternary' && n.type === 'ConditionalExpression' && n.test.start === off) return { prog, node: n, test: n.test }
      if (n.type === 'LogicalExpression' && n.operator === s.kind && n.left.start === off && clip(prog.text.slice(n.left.start, n.left.end)) === s.text) return { prog, node: n, test: n.left }
    }
  }
  return null
}

const nullish = p => p && (p[0] === 'undefined' || p[0] === 'null')
const falsy = p => nullish(p) || p && (p[1] === false || p[1] === 0 || p[1] === '' || p[1] === 'NaN')
// A decision event (index i of ctx.all) described: where, its code, the result, and the operands with their values,
// including those of the decisions inside its test that ran just before it (the left of an && in an if).
function decisionAt(ctx, i) {
  const { ev } = ctx.all[i], s = ctx.sites[ev[2]]
  if (!s) return null
  const sn = siteNode(ctx, s), operands = []
  const addOps = (site, e) => (site.args ?? []).forEach((a, k) => {
    const p = e.slice(4)[k]
    if (!p || LITERAL.test(a)) return
    const tf = /^typeof\s+/.exec(a)
    if (tf && p[0] === 'string' && p[1] === 'undefined') operands.push({ code: a.slice(tf[0].length), value: 'undefined', preview: ['undefined'] })
    else if (!tf) operands.push({ code: a, value: show(p), preview: p })
  })
  if (sn) for (let j = i - 1; j >= 0 && i - j < 50; j--) {
    const x = ctx.all[j], sj = ctx.sites[x.ev[2]]
    if (x.ev[1] !== 3 || sj?.file !== s.file) break
    const o = ctx.offset(sj)
    if (o < sn.test.start || o >= sn.test.end) break
    addOps(sj, x.ev)
  }
  addOps(s, ev)
  const result = ev[3] ? 1 : 0, head = (HEAD[s.kind] ?? (t => t))(s.text)
  return { i, t: ev[0], site: ev[2], file: s.file, line: s.line, at: `${s.file}:${s.line}`, kind: s.kind, code: head,
    result, said: s.kind === '??' ? (result ? 'had a value' : 'was null or undefined') : result ? 'true' : 'false', operands, sn }
}
// Key decisions: those in the dead end whose other branch is code that never ran. The last of each site, in time order.
function keyDecisions(ctx, de) {
  const idx = [...(de.near ?? []), ...Array.from({ length: de.to - de.from + 1 }, (_, k) => de.from + k)]
  const last = new Map()
  for (const i of idx) if (ctx.all[i]?.ev[1] === 3) last.set(ctx.all[i].ev[2], i)
  const out = [], inside = new Set()
  for (const i of [...last.values()].sort((a, b) => a - b)) {
    const d = decisionAt(ctx, i)
    if (!d?.sn) continue
    const u = untakenRange(d.sn.prog, d.sn.node, d.result)
    if (!u || ran(ctx, d.file, u.start, u.end) !== false) continue
    // A decision inside another's test (the left of && in an if) is part of that one.
    for (const [id, s] of ctx.sites.entries()) if (s?.file === d.file && id !== d.site && s.kind !== 'function') { const o = ctx.offset(s); if (o >= d.sn.test.start && o < d.sn.test.end && (o > d.sn.test.start || s.text.length < ctx.sites[d.site].text.length)) inside.add(id) }
    const text = d.sn.prog.text.slice(u.start, u.end)
    const calls = [...new Set(d.sn.prog.all.filter(n => n.type === 'CallExpression' && n.start >= u.start && n.end <= u.end)
      .map(n => n.callee.type === 'Identifier' ? n.callee.name : n.callee.type === 'MemberExpression' && !n.callee.computed ? n.callee.property.name : null))]
      .filter(name => { const ids = ctx.sites.flatMap((s, id) => s?.kind === 'function' && s.text === name ? [id] : []); return ids.length && !ids.some(id => ctx.seen.has(id)) })
    out.push({ ...d, untaken: { lines: text.split('\n').map(l => clip(l, 100)).filter(l => l && !/^[{}()[\];,]+$/.test(l)).slice(0, 3), calls: calls.slice(0, 5).map(c => c + '()') } })
  }
  return out.filter(d => !inside.has(d.site))
}

// ---- Where a value came from ----
function requestFrom(ctx, file, t) {
  return (ctx.trace.requests ?? []).filter(r => /^(XHR|Fetch)$/.test(r.type) && r.t <= t && (r.from ?? []).some(f => pkgPath(f.url) === file)).at(-1) ?? null
}
// root came from the response to req; rest is the path below it.
function fromResponse(ctx, req, root, rest) {
  const url = short(req.url), failed = req.failed && !req.canceled || req.status >= 400
  if (failed) return [{ text: `${code(root)} came from the response to ${url}, which failed (${req.status ?? req.failed}).`, short: `${url} failed (${req.status ?? req.failed})`, cause: 'request', request: url }]
  const file = pkgPath(req.url)
  if (file && ctx.files.has(file)) {
    let v
    try { v = JSON.parse(textOf(ctx.files.get(file))) } catch { return [{ text: `${code(root)} came from ${file}, which isn’t valid JSON.`, short: `${file} isn’t valid JSON`, cause: 'file', file }] }
    for (const [k, seg] of rest.entries()) {
      if (!v || typeof v !== 'object' || !Object.hasOwn(v, seg)) {
        const miss = rest.slice(0, k + 1).join('.')
        return [{ text: `${code(root)} came from ${file} (${req.status ?? 'loaded'}), which has no ${code(miss)}.`, short: `${file} has no ${code(miss)}`, cause: 'file', file, field: miss }]
      }
      v = v[seg]
    }
    return [{ text: `${code(root)} came from ${file}, where ${code(rest.join('.') || root)} is ${JSON.stringify(v)?.slice(0, 80)}.`, short: `${file} says ${JSON.stringify(v)?.slice(0, 40)}` }]
  }
  return [{ text: `${code(root)} came from the response to ${url} (${req.status}). Package Lab can’t see what the server sent: Discover (the Server needs tab, or package-lab discover) works out what the content reads from it.`,
    short: `the response to ${url}`, request: url, discover: true }]
}
// What a value's code says about where it came from: a response, the query string, the LMS.
function fromCode(ctx, prog, value, root, rest, t) {
  const src = value ? prog.text.slice(value.start, value.end) : ''
  if (value?.type === 'Identifier') { const l = findLocal(prog, value, value.name); if (l?.param && isCallback(prog, l.fn)) { const req = requestFrom(ctx, prog.file, t); if (req) return fromResponse(ctx, req, root, rest) } }
  if (/JSON\.parse|\.json\(\)|responseText|\.response\b|responseJSON/.test(src)) { const req = requestFrom(ctx, prog.file, t); if (req) return fromResponse(ctx, req, root, rest) }
  if (/location\.(search|href|hash)|URLSearchParams/.test(src)) return [{ text: `${code(root)} comes from the launch address’s query (${code(clip(src, 60))}), and the run’s address had no such value.`, short: 'a query parameter the launch didn’t have', query: true }]
  if (/GetValue\s*\(/.test(src)) return [{ text: `${code(root)} comes from the LMS (${code(clip(src, 60))}).`, short: 'a value from the LMS', lms: true }]
  return null
}

// Why the assignment a never ran: its file never loaded, or a decision kept it from running. Returns steps.
function whyNotRun(ctx, a, level) {
  if (!loaded(ctx, a.file)) {
    const req = (ctx.trace.requests ?? []).find(r => pkgPath(r.url) === a.file)
    if (req) return [{ text: `${a.file} was requested but failed (${req.status ?? req.failed}).`, short: `${a.file} failed (${req.status ?? req.failed})`, cause: 'script', file: a.file }]
    const base = a.file.split('/').pop()
    for (const prog of ctx.progs) for (const n of prog.all) {
      if (n.type !== 'Literal' || typeof n.value !== 'string' || !n.value.includes(base)) continue
      const v = n.value.split(/[?#]/)[0].replace(/^\.?\//, '')
      if (!(a.file === v || a.file.endsWith('/' + v) || v.endsWith('/' + a.file) || v === base)) continue
      const line = prog.text.slice(0, n.start).split('\n').length
      return [{ text: `${a.file} is loaded only by ${prog.file}:${line}, which never ran.`, short: `${a.file} never loaded` }, ...guardSteps(ctx, guardOf(ctx.progs, prog, n), level, `${prog.file}:${line} loads ${a.file}`)]
    }
    return [{ text: `Nothing in the package loads ${a.file}.`, short: `nothing loads ${a.file}`, cause: 'script', file: a.file }]
  }
  return guardSteps(ctx, guardOf(ctx.progs, a.prog, a.node), level, `${a.at} sets it`)
}
// The decision that kept code from running, as a step, and (for a value that was undefined) where that came from.
function guardSteps(ctx, g, level, what) {
  if (!g) return [{ text: `Package Lab found no decision around the code where ${what}.`, short: 'no decision found' }]
  const line = g.prog.text.slice(0, g.at).split('\n').length
  const id = ctx.sites.findIndex(s => s?.file === g.prog.file && s.kind === g.kind && ctx.offset(s) === g.at)
  const i = ctx.lastOf.get(id)
  if (id < 0 || i === undefined) return [{ text: `The decision at ${g.prog.file}:${line} around the code where ${what} never ran.`, short: `${g.prog.file}:${line} never ran` }]
  const d = decisionAt(ctx, i)
  return explain(ctx, d, level, `${what} only when ${code(d.code)} (${d.at}) is ${g.want ? 'true' : 'false'}; it was ${d.said}`)
}

// Where the operand op of decision d got its value. Returns steps.
function origin(ctx, op, d, level) {
  const path = codePath(op.code)
  if (!path) return [{ text: `Package Lab can’t tell where ${code(op.code)} came from.`, short: `${code(op.code)} (unknown)` }]
  const [root, ...rest] = path.split('.'), prog = d.sn?.prog
  // A name local to the function: a parameter of a callback is what a request sent; otherwise read its declaration.
  const local = prog && findLocal(prog, d.sn.node, root)
  if (local) {
    if (local.param && isCallback(prog, local.fn)) { const req = requestFrom(ctx, prog.file, d.t); if (req) return fromResponse(ctx, req, root, rest) }
    return fromCode(ctx, prog, local.init, root, rest, d.t) ?? [{ text: `${code(root)} is local to ${fnLabel(prog, local.fn)} (${d.at}), so Package Lab can’t watch it. Read that function to see where it’s set.`, short: `${code(root)} is local` }]
  }
  if (root === 'API' || root === 'API_1484_11') {
    const wants = root === 'API' ? '1.2' : '2004', offered = ctx.launch?.expose
    if (offered && offered !== 'both' && offered !== wants) return [{ text: `${code(root)} is the SCORM ${wants} API, and the test LMS offered SCORM ${offered === 'none' ? 'no API' : offered}.`, short: `the LMS offered SCORM ${offered}, not ${wants}`, cause: 'version' }]
    return [{ text: `${code(root)} is the LMS’s SCORM ${wants} API: it lives on an LMS window (a parent frame or the opener), not on the content’s own window.`, short: `${code(root)} is on the LMS’s window` }]
  }
  if (!pinPathProblem(path)) ctx.wanted.add(path)
  // What the watch run saw.
  const writes = ctx.watch ? (ctx.watch.probe ?? []).filter(p => p.type === 'watch-write' && p.path === path) : []
  if (writes.length) {
    const w = writes.at(-1), at = short(w.stack?.[0] ?? 'somewhere unknown')
    return [{ text: `In the watch run, ${code(path)} was assigned at ${at} (${secs(w.t)}), value ${w.value}${w.t > d.t ? `, later than the test ran in the traced run (${secs(d.t)}): the test may run too early` : ''}.`, short: `${code(path)} set at ${at}` }]
  }
  const never = ctx.watch ? `${code(path)} was never assigned (watched)` : `${code(path)} was undefined`
  const assigns = assignments(ctx.progs, path)
  for (const a of assigns) {
    const r = ran(ctx, a.file, a.node.start, a.node.end)
    if (r !== false) continue
    if (level >= LEVELS) return [{ text: `${never}. It is set at ${a.at} (${code(a.text)}), which never ran. (Stopped after ${LEVELS} levels.)`, short: `${a.at} never ran` }]
    return [{ text: `${never}. It is set at ${a.at} (${code(a.text)}), which ${loaded(ctx, a.file) ? 'never ran' : 'is in a file that never loaded'}.`, short: `${code(path)} never set` }, ...whyNotRun(ctx, a, level + 1)]
  }
  // The path itself is never assigned: where did its root come from?
  if (rest.length) {
    for (const a of assignments(ctx.progs, root).reverse()) {
      if (ran(ctx, a.file, a.node.start, a.node.end) === false) continue
      const from = fromCode(ctx, a.prog, a.value, root, rest, d.t)
      if (from) return [{ text: `${never}. ${code(root)} was set at ${a.at} (${code(a.text)}).`, short: `${code(path)} never set` }, ...from]
    }
  }
  if (!assigns.length) for (const [file, buf] of ctx.files) if (/\.m?js$/i.test(file) && globals(textOf(buf), file).defs.has(root) && !loaded(ctx, file))
    return [{ text: `${never}. ${code(root)} is defined by ${file}, which never loaded.`, short: `${file} never loaded` }, ...whyNotRun(ctx, { file, node: null }, level + 1)]
  if (assigns.length) return [{ text: `${never}, though ${assigns[0].at} (${code(assigns[0].text)}) sets it.`, short: `${code(path)} not set in time` }]
  return [{ text: `${never}, and nothing in the package sets it. It may be something the LMS or the page around the course is expected to provide.`, short: `nothing sets ${code(path)}` }]
}

// One decision as a step, then the origin of its first operand that explains it.
function explain(ctx, d, level, lead) {
  const ops = d.operands.filter(o => falsy(o.preview))
  const because = ops.length ? ` because ${ops.map(o => `${code(o.code)} was ${o.value}`).join(' and ')}` : d.operands.length ? `, with ${d.operands.map(o => `${code(o.code)} = ${o.value}`).join(', ')}` : ''
  const first = d.untaken?.lines[0] ?? '…', calls = d.untaken?.calls.filter(c => !first.startsWith(c)) ?? []
  const other = d.untaken ? ` Otherwise it would have run ${code(first)}${calls.length ? `, calling ${calls.join(', ')}, which never ran` : d.untaken.calls.length ? ', which never ran' : ''}.` : ''
  const step = { text: lead ? `${lead}${because}.` : `In ${d.at}, ${code(d.code)} was ${d.said}${because}.${other}`, short: `${code(d.code)} was ${d.said} (${d.at})`, at: d.at, decision: d.code, level }
  for (const op of ops) {
    const from = origin(ctx, op, d, level)
    if (nullish(op.preview) || from.some(s => s.cause)) return [step, ...from]
  }
  return [step]
}

const FIX = {
  request: s => `Answer the request yourself (package-lab run --answer '${s.request}=@file.json', or Answer this request… in the Network tab), or find out why the server refuses it. Discover works out what the answer should contain.`,
  file: s => `Add ${s.field ? code(s.field) + ' to ' : 'valid JSON to '}${s.file} with a file override (the Files tab, or --override) and run again, or pin the value it should have.`,
  script: s => `Check that ${s.file} is in the package and that the code that loads it runs.`,
  version: () => 'Offer both APIs (package-lab run --api both, or API: both) and run again.',
}
// The whole drill-down. See the top of the file.
export function drill(input) {
  const { trace } = input
  if (!trace?.sites || !(trace.exec ?? []).length) {
    return { traced: !!trace?.sites, decisions: [], chain: [], watch: [], watched: !!input.watch, cause: null, summary: '',
      findings: [{ sev: 'info', title: 'Why it stopped: nothing to drill into', detail: trace?.sites ? 'The traced run recorded no decisions in the package’s scripts.' : 'The run wasn’t traced, so there are no decisions to follow.', evidence: [], fix: 'Drill down on a traced run (Trace the code in the inspector’s Settings, or package-lab drill).' }] }
  }
  const ctx = context({ ...input, files: input.files ?? new Map() }), de = deadEnd(ctx.all, ctx.milestones)
  const decisions = keyDecisions(ctx, de)
  // The chain starts from the last key decision whose values explain it: an undefined or null operand, or a false one
  // that came from somewhere Package Lab can name (a failed request).
  let chain = []
  for (const d of [...decisions].reverse()) {
    const steps = explain(ctx, d, 1)
    if (steps.length > 1 && (d.operands.some(o => nullish(o.preview)) || steps.some(s => s.cause))) { chain = steps; break }
  }
  if (!chain.length && decisions.length) chain = explain(ctx, decisions.at(-1), 1)
  chain = chain.map((s, k) => ({ n: k + 1, ...s }))
  const end = chain.at(-1), cause = end?.cause ? { kind: end.cause, text: end.text } : null
  const summary = chain.map(s => s.short).join(' ← ')
  const findings = [chain.length ? { sev: cause ? 'error' : 'warn', title: `Why it stopped: ${summary}`,
    detail: cause ? 'Each step is the reason for the one before; the last is a cause Package Lab can name.' : 'Each step is the reason for the one before. Package Lab couldn’t follow the last one to a cause it can name.',
    evidence: chain.map(s => `${s.n}. ${s.text}`), fix: cause ? FIX[cause.kind](end) : end.discover ? 'Run Discover on that request to see what the content reads from it.' : 'Read the code named in the last step: it decides the value.' }
    : { sev: 'info', title: 'Why it stopped: no decision led to code that never ran', detail: 'In the last part of the run, every decision’s other branch ran at some point, or had nothing to run.', evidence: [], fix: 'Look at the Execution tab for the last events before the run went quiet.' }]
  return { traced: true, deadEnd: { t: de.end, quiet: de.quiet, events: de.to - de.from + 1 + (de.near?.length ?? 0) },
    decisions: decisions.map(({ sn, i, ...d }) => d), chain, cause, summary, watch: [...ctx.wanted], watched: !!input.watch, findings }
}
// The pins that watch the paths a drill-down asks for, added to the run's own.
export const watchPins = (options, paths) => [...(options.pins ?? []).filter(p => !(p.mode === 'watch' && paths.includes(p.path))), ...paths.map(path => ({ path, frames: 'content', mode: 'watch' }))]
