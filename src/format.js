// Formatting code for reading (P4.1). Pure. js-beautify (vendored, src/vendor/beautifier.cjs) lays out JavaScript,
// HTML and CSS; the line map is built by walking the original and the formatted text together, skipping whitespace:
// the n-th non-whitespace character of one is the n-th of the other, so any position can be carried across.
import { createRequire } from 'node:module'
const beautify = createRequire(import.meta.url)('./vendor/beautifier.cjs')

export const kindOf = path => /\.(?:m?js|cjs)$/i.test(path) ? 'js' : /\.html?$/i.test(path) ? 'html' : /\.css$/i.test(path) ? 'css' : null
export const isWs = c => c <= 32 || c === 0xA0 || c === 0xFEFF || c === 0x2028 || c === 0x2029

// Offsets of the non-whitespace characters.
export function nwOffsets(text) {
  let n = 0
  for (let i = 0; i < text.length; i++) if (!isWs(text.charCodeAt(i))) n++
  const out = new Int32Array(n)
  for (let i = 0, k = 0; i < text.length; i++) if (!isWs(text.charCodeAt(i))) out[k++] = i
  return out
}
// Offsets at which each line starts.
export function lineStarts(text) {
  const out = [0]
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) out.push(i + 1)
  return out
}
// The 0-based line holding offset off, in a lineStarts list.
export function lineAt(starts, off) {
  let lo = 0, hi = starts.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (starts[m] <= off) lo = m + 1; else hi = m }
  return lo - 1
}
const lowerBound = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m } return lo }

// { text, o, f } (o and f: offsets of the non-whitespace characters of the original and of the formatted text, same
// length) or { error }.
// A fast hash of a text (for cache keys; a hit is still checked against the text).
export function hashText(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0 }

export function format(text, kind, max = 5e6) {
  if (!beautify[kind]) return { error: 'This kind of file isn’t formatted.' }
  if (text.length > max) return { error: 'The file is too large to format.' }
  let out
  try { out = beautify[kind](text, { indent_size: 2, max_preserve_newlines: 2 }) } catch (e) { return { error: 'The formatter failed: ' + String(e.message).slice(0, 100) } }
  const o = nwOffsets(text), f = nwOffsets(out)
  let same = o.length === f.length
  for (let k = 0; same && k < o.length; k++) same = text.charCodeAt(o[k]) === out.charCodeAt(f[k])
  return same ? { text: out, o, f } : { error: 'The formatter changed the code itself, so its lines can’t be matched to the original.' }
}

// Original offset → formatted offset (the next character that isn't whitespace, if off is in whitespace).
export function toFormatted(fmt, off) {
  const k = Math.min(lowerBound(fmt.o, off), fmt.o.length - 1)
  return k < 0 ? 0 : fmt.f[k]
}
// Formatted offset → original offset.
export function toOriginal(fmt, off) {
  const k = Math.min(lowerBound(fmt.f, off), fmt.f.length - 1)
  return k < 0 ? 0 : fmt.o[k]
}
// Line maps, 0-based: the formatted line of each original line, and the original line of each formatted line, by the line's
// first non-whitespace character. Lines with none (blank) get -1.
export function lineMaps(text, fmt) {
  const os = lineStarts(text), fs = lineStarts(fmt.text), toF = new Array(os.length).fill(-1), toO = new Array(fs.length).fill(-1)
  let a = 0, b = 0, lo = -1, lf = -1
  for (let k = 0; k < fmt.o.length; k++) {   // both offsets only grow, so the lines are found by walking forward
    while (a + 1 < os.length && os[a + 1] <= fmt.o[k]) a++
    while (b + 1 < fs.length && fs[b + 1] <= fmt.f[k]) b++
    if (a !== lo) { toF[a] = b; lo = a }
    if (b !== lf) { toO[b] = a; lf = b }
  }
  return { toF, toO }
}
