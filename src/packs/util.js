// Helpers the packs share. Pure: they read the files Map (name → Buffer), the analysis and a trace.
import { isLab } from '../diff.js'
import { serverRequests } from '../shape.js'

export const SCRIPTY = /\.(js|mjs|html?)$/i
const cache = new WeakMap()   // Buffer → decoded text, so eleven packs decode each file once
export function textOf(files, name) {
  const b = files.get(name)
  if (!b || b.length > 20e6) return ''
  let t = cache.get(b)
  if (t === undefined) cache.set(b, t = b.toString('utf8'))
  return t
}
export const TEXT = /\.(js|mjs|html?|json|xml|css|txt)$/i
export const named = (files, re) => [...files.keys()].filter(n => re.test(n))
// File-name signals count only for text files under 20 MB, as the fingerprints always did; 'any' is for a name the package has whatever its type.
const nameHit = (files, re) => named(files, re).filter(n => TEXT.test(n) && files.get(n).length <= 20e6)
export const scriptHits = (files, re) => named(files, SCRIPTY).filter(n => re.test(textOf(files, n)))
// The strongest weight among the signals that hold: [kind, regex, weight] with kind 'name' (file names of text files), 'any' (file names of any type) or 'text' (scripts and pages).
export function score(files, signals) {
  let best = 0
  for (const [kind, re, w] of signals) if (w > best && (kind === 'any' ? named(files, re).length : kind === 'name' ? nameHit(files, re).length : scriptHits(files, re).length)) best = w
  return best
}
export function jsonOf(files, name) { try { return JSON.parse(textOf(files, name).replace(/^﻿/, '')) } catch { return null } }
export const dirOf = n => n.replace(/[^/]*$/, '')
// ref resolved against a folder, '..' and '.' folded. null if it leaves the package.
export function resolve(dir, ref) {
  const out = []
  for (const s of (dir + ref.split(/[?#]/)[0]).split('/')) { if (s === '..') { if (!out.length) return null; out.pop() } else if (s && s !== '.') out.push(s) }
  return out.join('/')
}
// What a finding from a pack rests on: 'pattern' (a known pattern, not confirmed here), 'package' (read in the package's files) or 'run' (seen in this run).
export const BASIS = {
  pattern: 'Confidence: matches a known pattern. It is not confirmed in this run.',
  package: 'Confidence: confirmed in the package’s files.',
  run: 'Confidence: confirmed in this run.',
}

// ---- Run evidence ----
const short = u => (u || '').replace(/^lab:\/\/(?:run|content)\/pkg\//, '')
export const probeOf = trace => trace.probe ?? []
export const apiCalls = trace => probeOf(trace).filter(p => p.type === 'api' && !p.host)
export const lookups = trace => probeOf(trace).filter(p => p.type === 'lookup')
// The content built its own window.API / API_1484_11.
export const ownApi = trace => probeOf(trace).filter(p => p.type === 'assign' && !isLab(p.frame))
export const requestFailed = r => r.failed && !r.canceled || r.status >= 400
// Requests for the host's root (a platform API), as in the Server needs tab, with whether each failed.
export function serverNeeds(trace) {
  return serverRequests(trace).map(s => ({ ...s, failed: (trace.requests ?? []).some(r => r.url === s.url && requestFailed(r)) }))
}
// Requests to other sites, grouped by host: [{ host, count, failed, example }].
export function outsideHosts(trace) {
  const by = new Map()
  for (const r of trace.requests ?? []) {
    if (!/^https?:/i.test(r.url)) continue
    let host; try { host = new URL(r.url).host } catch { continue }
    const e = by.get(host) ?? { host, count: 0, failed: 0, example: `${r.method} ${r.url}` }
    e.count++; if (requestFailed(r)) e.failed++
    by.set(host, e)
  }
  return [...by.values()]
}
// `var PLAYER_TYPE = 'Server-side';` as Xyleme's static export writes it: any quote, spacing, case, with or without var/let/const/window.
export const SERVER_PLAYER = /\b(?:(?:var|let|const)\s+|window\.)?PLAYER_TYPE\s*=\s*(["'`])server-side\1[ \t]*;?/gi
export const launchPath = a => a.manifest?.items.find(i => i.type === 'sco')?.res?.path ?? a.manifest?.items.find(i => i.res?.path)?.res?.path ?? ''
export const evidenceLines = (scan, key, max = 5, only = () => true) => {
  const out = []
  for (const [file, s] of Object.entries(scan ?? {})) for (const x of s[key]) if (out.length < max && only(file)) out.push(`${file}:${x.line}  ${x.text}`)
  return out
}
export { short }
