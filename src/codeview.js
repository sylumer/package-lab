// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// Code views (P4.1). Pure. What the shared code view shows for one file: its text as it was written, formatted, or as the
// source map's original; which lines ran (coverage) and what the trace saw at them; and the small excerpts the report
// embeds. The interfaces draw it (src/ui/codeview.js, report.js); nothing here makes HTML.
import { Worker } from 'node:worker_threads'
import { kindOf, format, hashText, isWs, lineStarts, lineAt, toFormatted } from './format.js'
import { loadMap, mapJsonOf, cachedMap, rememberMap, originalAt } from './sourcemap.js'

export const MINIFIED = 800      // a line longer than this makes a file "minified"
export const CLIP = 400          // longest line an excerpt shows
const MAX_COVERED = 30e6
const LAZY = 30e3               // "auto" formats files up to this size at once; bigger ones in a second step, in a worker
const CACHE_BYTES = 60e6        // formatted texts kept

// The package path of a lab://…/pkg/ address, or null.
export const urlPath = u => { try { const x = new URL(u); return x.protocol === 'lab:' && x.pathname.startsWith('/pkg/') ? decodeURIComponent(x.pathname.slice(5)) : null } catch { return null } }

// ---- Formatting, remembered (the last files, up to CACHE_BYTES; a hit is checked against the text, not only its hash) ----
const memo = new Map()
let memoBytes = 0
const keyOf = (text, kind) => kind + hashText(text) + ':' + text.length
const sizeOf = (text, res) => text.length * 2 + (res.text ? res.text.length * 2 + (res.o.length + res.f.length) * 4 : 0)
const hit = (text, kind) => { const e = memo.get(keyOf(text, kind)); return e && e.text === text ? e : null }
export const isFormatted = (text, kind) => !!hit(text, kind)
function remember(text, kind, res) {
  const k = keyOf(text, kind), old = memo.get(k)
  if (old) { memoBytes -= old.size; memo.delete(k) }
  const e = { text, res, size: sizeOf(text, res) }
  memo.set(k, e); memoBytes += e.size
  for (const [key, x] of memo) { if (memoBytes <= CACHE_BYTES || key === k) break; memo.delete(key); memoBytes -= x.size }
}
export function formatted(text, kind) {
  let e = hit(text, kind)
  if (!e) { remember(text, kind, format(text, kind)); e = hit(text, kind) }
  return e.res
}

// ---- Off the main thread (the desktop's handler awaits these; tests and the CLI report use the plain functions) ----
let worker = null
const jobs = new Map()
let seq = 0
function drop(e) { for (const j of jobs.values()) j.reject(e); jobs.clear(); worker = null }
function work(msg) {
  return new Promise((resolve, reject) => {
    try {
      if (!worker) {
        worker = new Worker(new URL('./codeworker.js', import.meta.url))
        worker.on('message', ({ id, ...rest }) => { jobs.get(id)?.resolve(rest); jobs.delete(id); if (!jobs.size) worker?.unref() })
        worker.on('error', drop); worker.on('exit', () => drop(new Error('The worker stopped.')))

      }
      const id = ++seq
      jobs.set(id, { resolve, reject }); worker.ref(); worker.postMessage({ id, ...msg })   // kept alive while a job is out
    } catch (e) { reject(e) }
  })
}
// codeView, with formatting a big file and decoding a big map done in a worker first. If the worker can't be had, it is done here.
export async function codeViewAsync(o) {
  const kind = kindOf(o.path)
  try {
    if (kind && o.mode === 'formatted' && o.text.length > LAZY && !isFormatted(o.text, kind)) {
      const r = await work({ op: 'format', text: o.text, kind })
      remember(o.text, kind, r.error ? { error: r.error } : r.r)
    }
    const json = kind === 'js' || kind === 'css' ? mapJsonOf(o.text, o.path, o.readFile) : null
    if (json && json.length > LAZY && !cachedMap(json)) rememberMap(json, (await work({ op: 'map', json })).r ?? null)
  } catch { /* no worker: the plain function does it */ }
  return codeView(o)
}

// ---- Coverage ----
// V8's block coverage as a count for every character: -1 where nothing says. Ranges (start, end, count) are applied outer
// first, so the innermost range wins. covs: [{ fns: [[name, [start, end, count, …]]] }], more than one when the file ran in
// several frames; a character counts as run if it ran in any.
export function charCounts(len, covs) {
  const out = new Int32Array(len).fill(-1)
  for (const c of covs) {
    const rs = []
    for (const [, r] of c.fns) for (let i = 0; i + 2 < r.length; i += 3) rs.push([Math.max(0, r[i]), Math.min(r[i + 1], len), r[i + 2]])
    rs.sort((a, b) => a[0] - b[0] || b[1] - a[1])
    const one = covs.length === 1 ? out : new Int32Array(len).fill(-1)
    for (const [s, e, n] of rs) if (e > s) one.fill(n, s, e)
    if (one !== out) for (let i = 0; i < len; i++) if (one[i] > out[i]) out[i] = one[i]
  }
  return out
}
// One number per line: how many times it ran, -2 when part of it ran and part didn't, -1 when coverage says nothing.
export function lineCoverage(text, starts, counts) {
  const out = new Array(starts.length).fill(-1)
  for (let l = 0; l < starts.length; l++) {
    const a = starts[l], b = l + 1 < starts.length ? starts[l + 1] : text.length
    let first = -1, min = Infinity, max = -1
    for (let i = a; i < b; i++) {
      const c = counts[i]
      if (c < 0 || isWs(text.charCodeAt(i))) continue
      if (first < 0) first = c
      if (c < min) min = c
      if (c > max) max = c
    }
    out[l] = first < 0 ? -1 : min === 0 && max > 0 ? -2 : first
  }
  return out
}

// ---- Trace markers ----
// What a traced run saw at each site of one file: [{ line, col, kind, text, n (calls), t, f (decision results) }].
export function siteMarks(trace, path) {
  const sites = trace?.sites, by = new Map()
  if (!sites) return []
  for (const b of trace.exec ?? []) for (const e of b.events) {
    const s = sites[e[2]]
    if (!s || s.file !== path) continue
    let m = by.get(e[2])
    if (!m) by.set(e[2], m = { line: s.line, col: s.col, kind: s.kind, text: s.text, n: 0, t: 0, f: 0 })
    const k = e[1], n = k === 4 ? e[4] : 1
    if (k === 1 || k === 4 && s.kind === 'function') m.n += n
    else if (k === 3 || k === 4) { if (e[3]) m.t += n; else m.f += n }
  }
  return [...by.values()]
}
const markText = m => m.kind === 'function' ? `${m.text || '(anonymous)'}() called ×${m.n}` : m.kind === 'switch' ? `switch ×${m.t + m.f}` :
  `${m.kind}: ${[m.t && `true ×${m.t}`, m.f && `false ×${m.f}`].filter(Boolean).join(', ') || 'no result'}`
// { line → text } for marks placed by lineOf(mark) (1-based, or 0 for "not in this view").
function markLines(marks, lineOf) {
  const by = {}
  for (const m of marks) { const l = lineOf(m); if (l > 0) (by[l] ??= []).push(markText(m)) }
  return Object.fromEntries(Object.entries(by).map(([l, a]) => [l, a.slice(0, 3).join('  ·  ') + (a.length > 3 ? `  · +${a.length - 3}` : '')]))
}

// ---- The view ----
// o: { text, path, line, col (1-based, in the original text), mode: 'auto' | 'original' | 'formatted' | 'mapped', source (index, mapped),
//      trace (a full run's trace, for coverage and markers), readFile(path) → text | null (for a map file) }
// → { path, kind, mode, modes, later, text, target (1-based line in this text, 0 when unknown), cov (per line, or null), covNote, marks ({ line: text }),
//     source, sources ([name, …] mapped), note, minified }
export function codeView(o) {
  const { text, path, trace, readFile } = o, kind = kindOf(path), starts = lineStarts(text)
  const line = Math.max(1, Math.min(starts.length, o.line | 0 || 1)), col = Math.max(1, o.col | 0 || 1)
  const lineLen = l => (l + 1 < starts.length ? starts[l + 1] - 1 : text.length) - starts[l]
  let minified = false
  for (let l = 0; l < starts.length && !minified; l++) minified = lineLen(l) > MINIFIED
  const off = starts[line - 1] + Math.min(col - 1, Math.max(0, lineLen(line - 1)))
  const map = kind === 'js' || kind === 'css' ? loadMap(text, path, readFile) : null
  const withContent = map ? map.sources.map((s, i) => s.content != null ? i : -1).filter(i => i >= 0) : []
  const hitAt = map ? originalAt(map, line - 1, col - 1) : null
  const modes = [...kind ? ['formatted'] : [], 'original', ...withContent.length ? ['mapped'] : []]
  let mode = o.mode ?? 'auto', note = ''
  // Formatting a big file takes a moment: "auto" shows it as it is, with later: 'formatted' for the caller to ask again, unless it is small or done already.
  let later = ''
  if (mode === 'auto') {
    mode = hitAt && withContent.includes(hitAt.source) ? 'mapped' : minified && kind ? 'formatted' : 'original'
    if (mode === 'formatted' && text.length > LAZY && !isFormatted(text, kind)) { mode = 'original'; later = 'formatted' }
  }
  if (!modes.includes(mode)) { note = mode === 'mapped' ? 'This file has no source map with its sources.' : 'This kind of file isn’t formatted.'; mode = 'original' }

  // Coverage and markers are worked out on the original text, then carried to the mode shown.
  const covs = text.length < MAX_COVERED && !/\.html?$/i.test(path) ? (trace?.coverage ?? []).filter(c => urlPath(c.url) === path) : []
  const counts = covs.length ? charCounts(text.length, covs) : null
  const marks = siteMarks(trace, path)
  const siteOff = m => starts[Math.min(m.line, starts.length) - 1] + m.col - 1
  const view = { path, kind, modes, minified, note, later, source: -1, sources: map ? map.sources.map(s => s.name) : [] }
  const covNote = trace?.coverage?.length && !counts && !/\.html?$/i.test(path) ? 'This run has no coverage for this file.' : ''

  if (mode === 'formatted') {
    const f = formatted(text, kind)
    if (f.error) { view.note = f.error; mode = 'original' }
    else {
      const fs = lineStarts(f.text)
      let cov = null
      if (counts) {
        const fc = new Int32Array(f.text.length).fill(-1)
        for (let k = 0; k < f.o.length; k++) fc[f.f[k]] = counts[f.o[k]]
        cov = lineCoverage(f.text, fs, fc)
      }
      return { ...view, mode, text: f.text, target: lineAt(fs, toFormatted(f, off)) + 1, cov, covNote, marks: markLines(marks, m => lineAt(fs, toFormatted(f, siteOff(m))) + 1) }
    }
  }
  if (mode === 'mapped') {
    const si = withContent.includes(o.source) ? o.source : hitAt && withContent.includes(hitAt.source) ? hitAt.source : withContent[0], src = map.sources[si].content, ss = lineStarts(src)
    let cov = null
    if (counts) {
      const first = new Array(ss.length).fill(-1), min = new Array(ss.length).fill(Infinity), max = new Array(ss.length).fill(-1)
      for (let i = 0; i < map.segs.length; i += 5) {
        if (map.segs[i + 2] !== si) continue
        const g = starts[map.segs[i]], ol = map.segs[i + 3]
        const c = g === undefined || ol >= ss.length ? -1 : counts[g + map.segs[i + 1]]
        if (c === undefined || c < 0) continue
        if (first[ol] < 0) first[ol] = c
        if (c < min[ol]) min[ol] = c
        if (c > max[ol]) max[ol] = c
      }
      cov = first.map((c, l) => c < 0 ? -1 : min[l] === 0 && max[l] > 0 ? -2 : c)
    }
    const place = m => { const p = originalAt(map, m.line - 1, m.col - 1); return p && p.source === si ? p.line + 1 : 0 }
    return { ...view, mode, source: si, text: src, target: hitAt && hitAt.source === si ? hitAt.line + 1 : 0, cov, covNote, marks: markLines(marks, place) }
  }
  return { ...view, mode: 'original', text, target: line, cov: counts ? lineCoverage(text, starts, counts) : null, covNote, marks: markLines(marks, m => m.line) }
}

// ---- Links: every file:line in evidence ----
// "js/app.js:12:5" and "lab://run/pkg/js/app.js:12" in a piece of evidence. Another site's address isn't one.
const LINK = /(?<![\w/:.@%+~-])((?:lab:\/\/(?:run|content)\/pkg\/)?(?:[\w.@%+~-]+\/)*[\w.@%+~-]+\.(?:m?js|cjs|html?|css|json|xml|txt)):(\d+)(?::(\d+))?/g
// → [{ text }, { text, path, line, col }, …] (col is 0 when the evidence has none). The UI's copy of this is in src/ui/codeview.js.
export function evidenceParts(s) {
  const out = []
  let at = 0
  for (const m of String(s ?? '').matchAll(LINK)) {
    if (m.index > at) out.push({ text: s.slice(at, m.index) })
    let path = m[1].replace(/^lab:\/\/(?:run|content)\/pkg\//, '')
    try { path = decodeURIComponent(path) } catch { /* as written */ }
    out.push({ text: m[0], path, line: +m[2], col: +(m[3] ?? 0) })
    at = m.index + m[0].length
  }
  if (at < String(s ?? '').length) out.push({ text: String(s).slice(at) })
  return out
}

// ---- Excerpts for the report ----
const clip = (t, col) => {
  if (t.length <= CLIP) return t
  const a = Math.max(0, Math.min(col - 1 - 120, t.length - CLIP))
  return (a ? '… ' : '') + t.slice(a, a + CLIP) + (a + CLIP < t.length ? ' …' : '')
}
// ±radius lines around the view's target: { from, to, label, lines: [{ n, text, hl }] }. A minified file is shown formatted, or as
// its original source when it has a map with sources.
export function excerpt(view, radius = 20) {
  const t = view.target || 1, from = Math.max(1, t - radius), want = t + radius, lines = []
  for (let at = 0, n = 1; n <= want && at <= view.text.length; n++) {   // only as far as the last line wanted
    const e = view.text.indexOf('\n', at), end = e < 0 ? view.text.length : e
    if (n >= from) lines.push(view.text.slice(at, end))
    at = end + 1
  }
  const to = from + lines.length - 1
  const label = view.mode === 'mapped' ? `source: ${view.sources[view.source]}` : view.mode === 'formatted' ? 'formatted' : ''
  return { from, to, label, lines: lines.map((text, i) => ({ n: from + i, text: clip(text.replace(/\r$/, ''), 1), hl: from + i === t })) }
}
// textOf(path) → text | null. A finding's links get an excerpt each (at most max in all); the same place twice shares one. Ids start with
// prefix, which is random so that two reports in one page don't share them. Formatting and map decoding are remembered per file (codeView's caches).
export function excerptor(textOf, { max = 24, radius = 20, prefix = 'sl-x-' + Math.random().toString(36).slice(2, 7) + '-' } = {}) {
  const made = new Map(), fresh = []
  let n = 0
  return {
    // The parts of one piece of evidence; a link that has an excerpt carries its id.
    parts(e) {
      return evidenceParts(e).map(p => {
        if (!p.path) return p
        const key = `${p.path}:${p.line}:${p.col}`
        if (!made.has(key)) {
          let ex = null
          const text = made.size < max ? textOf(p.path) : null
          if (typeof text === 'string') {
            const at = { text, path: p.path, line: p.line, col: p.col, readFile: textOf }, v = codeView(at)
            ex = excerpt(v.later ? codeView({ ...at, mode: v.later }) : v, radius)
          }
          made.set(key, ex && { id: `${prefix}${++n}`, title: p.text, ex })
          if (ex) fresh.push(made.get(key))
        }
        const m = made.get(key)
        return m ? { ...p, id: m.id } : p
      })
    },
    // The excerpts made since the last call.
    take() { return fresh.splice(0) },
  }
}
