// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// How a launch page should load, worked out from the files alone: the boot graph. Starting at the launch page it
// follows every page, script, stylesheet, frame and data file the browser would load (tags in document order,
// then the paths scripts load at run time), resolves each the way the browser would, and checks it against the
// package. Then it looks for what commonly leaves a launch blank: missing or misnamed files, paths outside the
// package, load-order mistakes, content built for a browser that no longer exists, mixed content, frame busting and
// broken config files. Pure: takes the files Map from unzip and the launch path.

const lineAt = (text, i) => { let n = 1; for (let k = text.indexOf('\n'); k !== -1 && k < i; k = text.indexOf('\n', k + 1)) n++; return n }
const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
const KIND = { js: 'script', mjs: 'script', json: 'data', xml: 'data', txt: 'data', html: 'page', htm: 'page', css: 'style', swf: 'flash', wasm: 'wasm' }
const kindOf = p => KIND[(/\.([a-z0-9]+)$/i.exec(p)?.[1] ?? '').toLowerCase()] ?? 'asset'
const MAX_NODES = 2000, MAX_SCAN = 5e6

// Resolve a reference from a folder the way a browser would. Returns { path } inside the package, or why not.
export function resolveRef(dir, ref) {
  ref = (ref ?? '').trim()
  if (!ref || /^(#|javascript:|data:|blob:|mailto:|about:|tel:)/i.test(ref)) return null
  if (/^file:|^[a-z]:\\/i.test(ref)) return { local: ref }
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) return { remote: ref }
  let p = ref.split(/[?#]/)[0]
  if (ref.startsWith('/')) return { server: p }
  try { p = decodeURIComponent(p) } catch { /* keep as is */ }
  const out = dir ? dir.split('/') : []
  for (const s of p.split('/')) {
    if (s === '..') { if (!out.length) return { outside: ref }; out.pop() } else if (s && s !== '.') out.push(s)
  }
  return { path: out.join('/') }
}

const attrs = s => {
  const o = {}
  for (const m of s.matchAll(/([\w:-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) o[m[1].toLowerCase()] = m[2] ? m[2].replace(/^["']|["']$/g, '') : ''
  return o
}
const blank = s => s.replace(/[^\n]/g, ' ') // keeps offsets and line numbers

// Pages: tags in document order, inline scripts, and what the body shows before any script runs.
function parseHtml(text) {
  const t = text.replace(/<!--[\s\S]*?-->/g, blank)
  const out = { refs: [], scripts: [], base: null, bodyText: 0, frameset: /<frameset\b/i.test(t), refresh: null }
  for (const m of t.matchAll(/<(script|link|iframe|frame|img|object|embed|meta|base|source|video|audio)\b([^>]*)>/gi)) {
    const tag = m[1].toLowerCase(), a = attrs(m[2]), line = lineAt(t, m.index)
    if (tag === 'base' && a.href != null) out.base = a.href
    else if (tag === 'script') {
      const type = (a.type || '').toLowerCase()
      if (type && !/^(text|application)\/(java|ecma)script$|^module$/.test(type)) continue // templates, JSON blocks
      const mode = type === 'module' ? 'module' : a.async != null ? 'async' : a.defer != null && a.src ? 'defer' : 'sync'
      if (a.src) { out.refs.push({ ref: a.src, how: 'tag', kind: 'script', line, mode, nomodule: a.nomodule != null }); out.scripts.push({ ref: a.src, mode, line }) }
      else {
        const end = t.indexOf('</script', m.index + m[0].length), body = text.slice(m.index + m[0].length, end < 0 ? undefined : end)
        out.scripts.push({ inline: body, mode: type === 'module' ? 'module' : 'sync', line, offset: m.index + m[0].length })
      }
      if (a['data-main']) out.refs.push({ ref: /\.js$/i.test(a['data-main']) ? a['data-main'] : a['data-main'] + '.js', how: 'require.js data-main', kind: 'script', line })
    } else if (tag === 'link') {
      const rel = (a.rel || '').toLowerCase()
      if (/stylesheet|modulepreload|preload|import/.test(rel) && a.href) out.refs.push({ ref: a.href, how: 'tag', kind: /stylesheet/.test(rel) ? 'style' : kindOf(a.href), line })
    } else if (tag === 'meta') {
      const c = /^\s*\d+\s*;\s*url\s*=\s*['"]?([^'"]+)/i.exec(a.content || '')
      if ((a['http-equiv'] || '').toLowerCase() === 'refresh' && c) { out.refresh = c[1]; out.refs.push({ ref: c[1], how: 'meta refresh', kind: 'page', line }) }
    } else {
      const ref = tag === 'object' ? a.data : a.src
      if (ref) out.refs.push({ ref, how: 'tag', kind: tag === 'iframe' || tag === 'frame' ? 'page' : kindOf(ref), line,
        flash: /shockwave-flash/i.test(a.type || '') || /\.swf$/i.test(ref) })
    }
  }
  const body = /<body\b[^>]*>([\s\S]*)/i.exec(t)?.[1] ?? ''
  out.bodyText = body.replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ').replace(/\s+/g, ' ').trim().length
  out.bodyMedia = /<(img|video|canvas|svg|iframe|frame|object|embed)\b/i.test(body)
  return out
}

// Scripts: string literals that look like package files, and what the code around each does with it.
const PATHLIKE = /^(?:\.{0,2}\/)?[\w@~%.-]+(?:\/[\w@~%.-]+)*\.(?:m?js|json|xml|html?|css|swf|txt|wasm)(?:[?#].*)?$/i
const lineText = (text, i) => { const s = text.lastIndexOf('\n', i) + 1, e = text.indexOf('\n', i); const l = text.slice(s, e < 0 ? undefined : e); return (l.length > 200 ? l.slice(Math.max(0, i - s - 80), i - s + 120) : l).trim() }
const SERVERISH = /^\/(api|content|services?|rest|data|assets|static|player|lms|xyleme|ws|v\d)\b/i
function howUsed(before) {
  if (/(\bimport\s*\(|\bfrom|\bimport)\s*$/.test(before)) return 'import'
  if (/importScripts\s*\(\s*$|new\s+(Shared)?Worker\s*\(\s*$/.test(before)) return 'worker'
  if (/(\bfetch\s*\(|\.open\s*\(\s*["']\w+["']\s*,|\$\.\w+\s*\(|axios\.\w+\s*\(|\burl\s*:)\s*$/.test(before)) return 'request'
  if (/(\.src\s*=|setAttribute\s*\(\s*["']src["']\s*,|\.href\s*=)\s*$/.test(before)) return 'src'
  if (/(location(\.href)?\s*=|location\.(replace|assign)\s*\(|window\.open\s*\()\s*$/.test(before)) return 'navigate'
  if (/\b(require|define|requirejs)\s*\(\s*\[[^\]]*$/.test(before)) return 'amd'
  return 'literal'
}
function scanScript(text) {
  const refs = [], dynamic = []
  for (const m of text.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n]){1,300})\1/g)) {
    const v = m[2], before = text.slice(Math.max(0, m.index - 60), m.index), after = text.slice(m.index + m[0].length, m.index + m[0].length + 4)
    const joined = /\+\s*$/.test(before) || /^\s*\+/.test(after) || m[1] === '`' && v.includes('${')
    const line = lineAt(text, m.index)
    if (joined) { if (/\/|\.(m?js|json|xml|html?)\b/.test(v) && dynamic.length < 40 && dynamic.at(-1)?.line !== line) dynamic.push({ text: lineText(text, m.index), line }); continue }
    const how = howUsed(before)
    // Server paths often have no extension (/api/player/config): taken when the code loads them, or they look like one.
    const server = /^\/(?!\/)[\w-]+(?:\/[\w.-]+)+\/?$/.test(v) && (how !== 'literal' || SERVERISH.test(v))
    if (!PATHLIKE.test(v) && !server) continue
    refs.push({ ref: v, how, kind: server && !PATHLIKE.test(v) ? 'data' : kindOf(v.split(/[?#]/)[0]), line })
  }
  return { refs, dynamic }
}

// Top-level names a script defines and the ones it uses as soon as it runs (column-0 statements, so not inside
// functions). Minified files are skipped: everything is on one line. Known libraries declare their globals.
const LIBS = [[/jquery/i, ['$', 'jQuery']], [/require(\.min)?\.js$/i, ['require', 'define', 'requirejs']], [/underscore|lodash/i, ['_']], [/backbone/i, ['Backbone']], [/swfobject/i, ['swfobject']]]
export function globals(text, name = '') {
  const defs = new Set(LIBS.filter(([re]) => re.test(name)).flatMap(([, g]) => g)), uses = new Map()
  const lines = text.split('\n'), minified = text.length > 2000 && text.length / lines.length > 300
  for (const m of text.matchAll(/\b(?:window|self|globalThis)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) defs.add(m[1])
  if (minified) return { defs, uses, minified }
  const indent = Math.min(...lines.filter(l => l.trim()).map(l => /^\s*/.exec(l)[0].length), 99)
  lines.forEach((raw, i) => {
    const l = raw.slice(indent)
    const d = /^(?:var|let|const|function\*?|class|async\s+function)\s+([A-Za-z_$][\w$]*)/.exec(l)
    if (d) defs.add(d[1])
    if (!/^[A-Za-z_$(]/.test(l) || /^(function|class|async\s+function)\b/.test(l)) return
    // A function written on the same line (a listener, a callback) runs later: only what comes before it runs now. An
    // IIFE, a line starting with “(”, runs at once, so it is read whole.
    const now = l.startsWith('(') ? l : l.replace(/\bfunction\b[\s\S]*|(?:\([^()]*\)|\b[\w$]+)\s*=>[\s\S]*/, '')
    for (const u of now.replace(/^(?:var|let|const)\s+[\w$]+\s*=/, '').replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*(?=[.(\[])/g))
      if (!uses.has(u[1])) uses.set(u[1], i + 1)
  })
  return { defs, uses, minified }
}

export function bootGraph(files, start) {
  const lower = new Map([...files.keys()].map(n => [n.toLowerCase(), n]))
  const names = new Map()
  for (const n of files.keys()) { const b = n.split('/').pop().toLowerCase(); if (!names.has(b)) names.set(b, n) }
  const nodes = [], byPath = new Map(), pages = [], dynamic = [], risks = []
  const text = p => { const b = files.get(p); return b && b.length <= MAX_SCAN ? b.toString('utf8') : null }

  // Status of a resolved reference: ok, case (exists with other capitals), missing, or where it points instead.
  const status = r => {
    if (!r) return null
    if (r.remote) return { status: /^http:/i.test(r.remote) ? 'remote-http' : 'remote', target: r.remote }
    if (r.server) return { status: 'server', target: r.server }
    if (r.outside) return { status: 'outside', target: r.outside }
    if (r.local) return { status: 'local', target: r.local }
    if (files.has(r.path)) return { status: 'ok', path: r.path }
    const ci = lower.get(r.path.toLowerCase())
    if (ci) return { status: 'case', path: r.path, actual: ci }
    const other = names.get(r.path.split('/').pop().toLowerCase())
    return { status: 'missing', path: r.path, elsewhere: other }
  }
  const add = (ref, from, depth, doc) => {
    if (nodes.length >= MAX_NODES) return
    // Scripts resolve fetch and src paths from the page that runs them; import and workers from the script itself.
    const dir = ref.how === 'import' || ref.how === 'worker' || !doc ? dirOf(from?.path ?? '') : doc.dir
    let st = status(resolveRef(dir, ref.ref))
    if (!st) return
    if (st.status === 'missing' && doc && from && from.kind === 'script' && dir !== dirOf(from.path)) {
      const alt = status(resolveRef(dirOf(from.path), ref.ref))
      if (alt?.status === 'ok') st = { ...st, scriptRelative: alt.path }
    }
    const seen = byPath.get(st.path ?? st.target)
    if (seen) { if (!seen.also) seen.also = []; if (seen.also.length < 5) seen.also.push({ from: from?.path, line: ref.line }); return }
    const n = { ...st, ref: ref.ref, kind: st.status === 'ok' ? kindOf(st.path) : ref.kind, how: ref.how, mode: ref.mode, from: from?.path ?? null, line: ref.line ?? 0, depth, doc: doc?.path ?? null, docDir: doc?.dir ?? null, flash: ref.flash }
    if (st.path || st.target) byPath.set(st.path ?? st.target, n)
    nodes.push(n)
    return n
  }

  const root = add({ ref: start, how: 'launch', kind: 'page' }, null, 0, null)
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n.status !== 'ok' && n.status !== 'case') continue
    const p = n.status === 'case' ? n.actual : n.path, src = text(p)
    if (src == null) continue
    if (n.kind === 'page') {
      const h = parseHtml(src), base = h.base != null ? resolveRef(dirOf(p), h.base.replace(/[^/]*$/, '')) : null
      const doc = { path: p, dir: base?.path ?? dirOf(p) }
      const page = { path: p, html: h, doc, node: n }
      pages.push(page)
      if (h.base != null && !base?.path && base?.path !== '') risks.push({ sev: 'warn', title: `${p} sets <base href="${h.base}">, outside the package`, detail: 'Every relative path on the page then resolves against that address instead of the package.', evidence: [], fix: 'Remove the <base> element, or point it inside the package.' })
      for (const r of h.refs) add(r, n, n.depth + 1, doc)
      for (const s of h.scripts.filter(x => x.inline != null)) {
        const sc = scanScript(s.inline)
        for (const r of sc.refs) add({ ...r, line: s.line + r.line - 1 }, n, n.depth + 1, doc)
        dynamic.push(...sc.dynamic.map(d => ({ ...d, file: p, line: s.line + d.line - 1 })))
      }
    } else if (n.kind === 'script') {
      const sc = scanScript(src), doc = n.doc ? { path: n.doc, dir: n.docDir } : { path: p, dir: dirOf(p) }
      for (const r of sc.refs) add(r, n, n.depth + 1, doc)
      dynamic.push(...sc.dynamic.map(d => ({ ...d, file: p })))
    }
  }

  // ---- What commonly leaves a launch blank ----
  const at = n => `${n.from ?? '(launch)'}${n.line ? ':' + n.line : ''}`
  const crit = n => n.how !== 'literal' || ['script', 'page', 'data', 'style'].includes(n.kind)
  if (root?.status !== 'ok') risks.push({ sev: 'error', title: `The launch page ${start} ${root?.status === 'case' ? `is ${root.actual} in the ZIP (different capitals)` : 'isn’t in the package'}`, detail: 'Nothing can load.', evidence: [], fix: 'Correct the resource href in imsmanifest.xml.' })
  const bad = (st, kinds) => nodes.filter(n => n !== root && n.status === st && (!kinds || kinds(n)))
  const tagMissing = bad('missing', n => n.how !== 'literal' && n.how !== 'request' || n.kind === 'script')
  if (tagMissing.length) risks.push({ sev: 'error', title: `${tagMissing.length} file${tagMissing.length > 1 ? 's' : ''} the launch loads ${tagMissing.length > 1 ? 'aren’t' : 'isn’t'} in the package`,
    detail: 'A page or script asks for these and gets “not found”. A missing script usually means everything it would have built never appears.',
    evidence: tagMissing.slice(0, 10).map(n => `${n.path} (${n.how}${n.kind !== 'asset' ? ' ' + n.kind : ''}) from ${at(n)}${n.elsewhere ? `: there is a ${n.elsewhere}` : ''}${n.scriptRelative ? `: ${n.scriptRelative} exists relative to the script, but the browser resolves it from the page ${n.doc}` : ''}`),
    fix: 'Republish with every file included, or correct the paths. Where the same name exists elsewhere, the path is wrong rather than the file missing.' })
  const softMissing = bad('missing', n => !tagMissing.includes(n) && crit(n))
  if (softMissing.length) risks.push({ sev: 'warn', title: `Scripts name ${softMissing.length} file${softMissing.length > 1 ? 's' : ''} that ${softMissing.length > 1 ? 'aren’t' : 'isn’t'} in the package`,
    detail: 'These paths appear in the code as text. Some may be unused or built differently at run time; a run shows which are actually asked for.',
    evidence: softMissing.slice(0, 10).map(n => `${n.path} (${n.how}) in ${at(n)}${n.elsewhere ? `: there is a ${n.elsewhere}` : ''}${n.scriptRelative ? `: ${n.scriptRelative} exists relative to the script; the browser resolves it from ${n.doc}` : ''}`), fix: '' })
  const cased = bad('case')
  if (cased.length) risks.push({ sev: 'error', title: 'Paths differ from the files only in capitals',
    detail: 'This works on Windows and macOS (and in many authoring previews) but fails on the Linux servers most LMSs use: the file is “not found”.',
    evidence: cased.slice(0, 10).map(n => `${n.path} is ${n.actual} in the ZIP, from ${at(n)}`), fix: 'Make the reference match the file name exactly.', autofix: { id: 'case', params: {} } })
  const server = bad('server', crit)
  if (server.length) risks.push({ sev: 'error', title: 'The launch depends on paths at the root of the server',
    detail: 'These only exist on the platform the content came from. In an LMS they are “not found” or return the LMS’s own pages.',
    evidence: server.slice(0, 10).map(n => `${n.target} (${n.how}) from ${at(n)}`), fix: 'Export as a standalone package, or find the setting that makes these paths relative.' })
  const outside = bad('outside')
  if (outside.length) risks.push({ sev: 'error', title: 'Paths climb out of the package (../ above its top folder)', detail: 'Usually a page moved into a subfolder at export without its paths being updated.',
    evidence: outside.slice(0, 10).map(n => `${n.target} from ${at(n)}`), fix: 'Correct the paths, or check the manifest’s launch page is the one the export intended.' })
  const local = bad('local')
  if (local.length) risks.push({ sev: 'error', title: 'Paths point at the author’s own computer', detail: 'file:// and drive-letter paths only work on the machine that made the package.', evidence: local.slice(0, 6).map(n => `${n.target} from ${at(n)}`), fix: 'Include the files and use relative paths.' })
  const http = bad('remote-http', n => ['script', 'style', 'page'].includes(n.kind) && n.how !== 'literal')
  if (http.length) risks.push({ sev: 'warn', title: 'Scripts, styles or frames load over http://', detail: 'LMSs serve over https, and browsers block http scripts, styles and frames on an https page (mixed content).', evidence: http.slice(0, 6).map(n => `${n.target} from ${at(n)}`), fix: 'Use https:// addresses, or include the files.', autofix: { id: 'http-to-https', params: {} } })
  const remote = bad('remote', n => ['script', 'style', 'page'].includes(n.kind) && n.how !== 'literal')
  if (remote.length) risks.push({ sev: 'info', title: 'The launch loads code from other sites', detail: 'If a learner’s network blocks them, or the site is gone, the content fails.', evidence: remote.slice(0, 6).map(n => `${n.target} from ${at(n)}`), fix: '' })

  const reached = nodes.filter(n => n.status === 'ok' && (n.kind === 'script' || n.kind === 'page')).map(n => [n.path, text(n.path) ?? ''])
  const grep = (re, max = 6) => reached.flatMap(([p, s]) => [...s.matchAll(re)].slice(0, 2).map(m => `${p}:${lineAt(s, m.index)}  ${s.slice(Math.max(0, m.index - 30), m.index + 70).replace(/\s+/g, ' ')}`)).slice(0, max)
  const flash = nodes.filter(n => n.flash || n.kind === 'flash')
  const swfobject = grep(/\bswfobject\b|application\/x-shockwave-flash/gi)
  if (flash.length || swfobject.length) risks.push({ sev: 'error', title: 'The content needs Adobe Flash Player', detail: 'No current browser runs Flash (support ended in 2021), so the content area stays blank or shows a “get Flash” message.',
    evidence: [...flash.slice(0, 4).map(n => `${n.path ?? n.target} from ${at(n)}`), ...swfobject.slice(0, 4)], fix: 'Republish from the source as HTML5. Flash content can’t be fixed in the package.' })
  const ie = reached.filter(([, s]) => /\bActiveXObject\b|\battachEvent\s*\(|\bdocument\.all\b/.test(s) && !/addEventListener/.test(s))
  if (ie.length) risks.push({ sev: 'warn', title: 'Some scripts only work in Internet Explorer', detail: 'They use ActiveXObject, attachEvent or document.all without a modern alternative, which throw in current browsers.',
    evidence: ie.slice(0, 5).map(([p]) => p), fix: 'Republish with a current version of the authoring tool.' })
  const bust = grep(/\btop\.location(\.href)?\s*=(?!=)|\btop\.location\.(replace|assign)\s*\(|\bparent\.location(\.href)?\s*=(?!=)/g)
  if (bust.length) risks.push({ sev: 'warn', title: 'Scripts navigate the window above them', detail: 'Frame-busting or “open full screen” code replaces the LMS page, or is blocked by the LMS’s sandbox and throws, leaving the frame empty.',
    evidence: bust, fix: 'Look at the condition around it: content often does this when it thinks it isn’t in its own player.' })
  const fileOf = (pg, ref) => { const n = byPath.get(resolveRef(pg.doc.dir, ref)?.path); return n?.status === 'ok' ? n : null }
  const writes = pages.flatMap(pg => pg.html.scripts.filter(s => s.mode !== 'sync' && s.ref).map(s => [pg, s])).filter(([pg, s]) => /document\.write(ln)?\s*\(/.test(text(fileOf(pg, s.ref)?.path ?? '') ?? ''))
  if (writes.length) risks.push({ sev: 'warn', title: 'Deferred or async scripts use document.write', detail: 'The browser ignores document.write from these, so whatever they write never appears.', evidence: writes.map(([pg, s]) => `${s.ref} in ${pg.path}:${s.line}`), fix: '' })
  const mods = nodes.filter(n => n.status === 'ok' && (n.mode === 'module' || /\.mjs$/i.test(n.path)))
  if (mods.length) risks.push({ sev: 'info', title: 'The content uses JavaScript modules', detail: 'Module scripts are refused unless the server sends them as JavaScript, and some LMSs serve .mjs (or files from a CDN) with the wrong type or without CORS headers. It also won’t run from a local file.',
    evidence: mods.slice(0, 5).map(n => `${n.path} from ${at(n)}`), fix: 'If a run in the LMS shows “Failed to load module script … MIME type”, ask the LMS to serve .js and .mjs as text/javascript.' })
  for (const n of nodes.filter(n => n.status === 'ok' && /\.json$/i.test(n.path))) {
    try { JSON.parse(text(n.path) ?? '') } catch (e) { risks.push({ sev: 'error', title: `${n.path} isn’t valid JSON`, detail: 'The content reads it while starting; a parse error there usually stops the start-up.', evidence: [`${e.message}`, `read from ${at(n)}`], fix: 'Correct the file (often a hand edit, or a byte-order mark or trailing comma).' }) }
  }

  // Load order: a script that runs at once and uses a name only a later (or deferred, or async) script defines.
  for (const pg of pages) {
    const list = pg.html.scripts.map(s => {
      const node = s.ref ? fileOf(pg, s.ref) : null
      const src = s.inline ?? (node ? text(node.path) ?? '' : '')
      return { ...s, name: s.ref ?? `inline script at ${pg.path}:${s.line}`, g: globals(src, s.ref ?? '') }
    })
    const ordered = [...list.filter(s => s.mode === 'sync'), ...list.filter(s => s.mode === 'defer' || s.mode === 'module'), ...list.filter(s => s.mode === 'async')]
    pg.execOrder = ordered.map(s => ({ name: s.name, mode: s.mode, line: s.line }))
    const problems = []
    ordered.forEach((s, i) => {
      if (s.mode !== 'sync') return
      const earlier = new Set(ordered.slice(0, i + 1).flatMap(x => [...x.g.defs]))
      for (const [name, line] of s.g.uses) {
        if (earlier.has(name)) continue
        const later = ordered.slice(i + 1).find(x => x.g.defs.has(name))
        if (later) problems.push(`${s.name}${s.inline != null ? '' : ':' + line} uses ${name} as soon as it runs, but ${name} comes from ${later.name}, which runs later (${later.mode === 'sync' ? 'it is further down the page' : later.mode})`)
      }
    })
    if (problems.length) risks.push({ sev: 'error', title: `Scripts on ${pg.path} run before what they need`, detail: 'A script that uses something not defined yet throws “… is not defined”, and the start-up stops there.',
      evidence: problems.slice(0, 8), fix: 'Move the script after the one it needs, or remove defer or async from that one.' })
    const h = pg.html
    if (pg.node === root && !h.frameset && !h.refresh && h.bodyText < 20 && !h.bodyMedia && h.scripts.length)
      risks.push({ sev: 'info', title: 'The launch page has no content of its own', detail: 'Everything you see is built by its scripts, so if any of them fail or wait for something, the page stays blank.', evidence: [`${h.scripts.length} script${h.scripts.length > 1 ? 's' : ''} on ${pg.path}`], fix: '' })
  }
  return { start, nodes, pages: pages.map(p => ({ path: p.path, execOrder: p.execOrder, base: p.html.base, bodyText: p.html.bodyText })), dynamic: dynamic.slice(0, 60), risks }
}

// The boot graph against a recorded run: for each node, whether the browser asked for it and what came back.
const pathOfUrl = u => { try { const x = new URL(u); return x.protocol === 'lab:' && x.pathname.startsWith('/pkg/') ? decodeURIComponent(x.pathname.slice(5)) : null } catch { return null } }
export function bootRun(boot, trace) {
  const req = new Map(), server = new Map()
  for (const r of trace.requests) {
    const p = pathOfUrl(r.url)
    if (p != null) req.set(p, r)
    else if (/^lab:\/\/(?:run|content)\/(?!pkg\/|__lab\/)/.test(r.url) && !(trace.lrs && /\/__lrs\//.test(r.url))) server.set(new URL(r.url).pathname, r)
  }
  const result = r => !r ? null : { status: r.status ?? null, failed: r.failed && !r.canceled ? r.failed : null, pending: r.status == null && !r.failed, t: r.t }
  return boot.nodes.map(n => ({ ...n, run: result(n.path != null ? req.get(n.path) : n.status === 'server' ? server.get(n.target) : null) }))
}
