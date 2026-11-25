// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// Source maps (P4.1). Pure. Finds a file's map (an inline data URL, or a file in the package), decodes its VLQ
// "mappings" and answers "what is the original position of this generated one?". The original sources are only
// shown when the map carries them (sourcesContent).
import { posix } from 'node:path'
import { hashText } from './format.js'

const B64 = new Int8Array(128).fill(-1)
for (const [i, c] of [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].entries()) B64[c.charCodeAt(0)] = i
const MAX_MAP = 30e6         // a map file
const MAX_MAPPINGS = 5e6     // its "mappings" string
const CACHE_BYTES = 60e6

// One segment's fields from base64 VLQ: 'AAgBC' → [0, 0, 16, 1]. Throws on a character that isn't base64.
export function decodeVLQ(s) {
  const out = []
  let value = 0, shift = 0
  for (let i = 0; i < s.length; i++) {
    const d = B64[s.charCodeAt(i)]
    if (d === undefined || d < 0) throw new Error(`Not a base64 digit: ${JSON.stringify(s[i])}`)
    value += (d & 31) * 2 ** shift
    if (d & 32) { shift += 5; continue }
    out.push(value % 2 ? -(value - 1) / 2 : value / 2)   // the lowest bit is the sign
    value = 0; shift = 0
  }
  if (shift) throw new Error('A VLQ value ends in the middle.')
  return out
}

// "mappings" → { segs: flat [genLine, genCol, source, origLine, origCol] per segment (all 0-based), lineStart }.
// Segments with one field (no source) are dropped. lineStart[l] is the index (in segments) of generated line l's first.
export function decodeMappings(mappings) {
  const segs = [], lineStart = [0]
  let src = 0, ol = 0, oc = 0, line = 0
  for (const group of String(mappings).split(';')) {
    let gc = 0
    if (group) for (const seg of group.split(',')) {
      if (!seg) continue
      const f = decodeVLQ(seg)
      gc += f[0]
      if (f.length >= 4) { src += f[1]; ol += f[2]; oc += f[3]; segs.push(line, gc, src, ol, oc) }
    }
    line++; lineStart.push(segs.length / 5)
  }
  return { segs: Int32Array.from(segs), lineStart: Int32Array.from(lineStart) }
}

// The map a file points to, as text: the last sourceMappingURL comment. null when there isn't one.
export function mapUrlOf(text) {
  const i = text.lastIndexOf('sourceMappingURL=')
  if (i < 3 || !/(?:\/\/|\/\*)[#@][ \t]*$/.test(text.slice(Math.max(0, i - 8), i))) return null
  return /^[^\s'"]+/.exec(text.slice(i + 17))?.[0].replace(/\*\/$/, '') ?? null
}

// Decoded maps, per map text, kept up to CACHE_BYTES (a file opened again, or linked from several findings, isn't decoded again).
const cache = new Map()
let cached = 0
const keyOf = json => hashText(json) + ':' + json.length
const sizeOf = (json, map) => json.length * 2 + (map ? map.segs.length * 4 + map.lineStart.length * 4 : 0)
export const cachedMap = json => { const e = cache.get(keyOf(json)); return e && e.json === json ? e : null }
export function rememberMap(json, map) {
  const k = keyOf(json), old = cache.get(k)
  if (old) { cached -= old.size; cache.delete(k) }
  const e = { json, map, size: sizeOf(json, map) }
  cache.set(k, e); cached += e.size
  for (const [key, x] of cache) { if (cached <= CACHE_BYTES || key === k) break; cache.delete(key); cached -= x.size }
}

// Parses the JSON of a map. null when it isn't a plain (not indexed) version 3 map, or its mappings are over 5 MB.
export function parseMap(json) {
  if (typeof json === 'string') { const e = cachedMap(json); if (e) return e.map }
  const map = parseMapUncached(json)
  if (typeof json === 'string') rememberMap(json, map)
  return map
}
export function parseMapUncached(json) {
  let m
  try { m = typeof json === 'string' ? JSON.parse(json) : json } catch { return null }
  if (!m || m.version !== 3 || typeof m.mappings !== 'string' || m.mappings.length > MAX_MAPPINGS || !Array.isArray(m.sources)) return null
  let d
  try { d = decodeMappings(m.mappings) } catch { return null }
  const root = typeof m.sourceRoot === 'string' && m.sourceRoot ? m.sourceRoot.replace(/\/?$/, '/') : ''
  return { sources: m.sources.map((s, i) => ({ name: root + String(s ?? ''), content: typeof m.sourcesContent?.[i] === 'string' ? m.sourcesContent[i] : null })), ...d }
}

// The text of a file's map: an inline data URL, or a file of the package (readFile(path) → text or null).
// path is the file's own package path; the map is looked for next to it. null when there is none to read.
export function mapJsonOf(text, path, readFile = () => null) {
  const url = mapUrlOf(text)
  if (!url) return null
  const data = /^data:[^,]*?(;base64)?,([\s\S]*)$/i.exec(url)
  let json
  if (data) {
    try { json = data[1] ? Buffer.from(data[2], 'base64').toString('utf8') : decodeURIComponent(data[2]) } catch { return null }
  } else {
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/')) return null   // another site or the server's root: never fetched
    let rel
    try { rel = posix.normalize(posix.join(posix.dirname(path), decodeURIComponent(url.split(/[?#]/)[0]))) } catch { return null }
    if (rel.startsWith('..') || rel.startsWith('/')) return null
    json = readFile(rel)
  }
  return typeof json === 'string' && json.length <= MAX_MAP ? json : null
}
export function loadMap(text, path, readFile) {
  const json = mapJsonOf(text, path, readFile)
  return json ? parseMap(json) : null
}

// The original position of generated (line, col), all 0-based: { source, line, col } or null when no segment on that line
// starts at or before col.
export function originalAt(map, line, col) {
  const a = map.lineStart[line], b = map.lineStart[line + 1]
  if (a === undefined || b === undefined || a >= b) return null
  let lo = a, hi = b   // the last segment with genCol <= col
  while (lo < hi) { const m = (lo + hi) >> 1; if (map.segs[m * 5 + 1] <= col) lo = m + 1; else hi = m }
  if (lo === a) return null
  const k = (lo - 1) * 5
  return { source: map.segs[k + 2], line: map.segs[k + 3], col: map.segs[k + 4] }
}
