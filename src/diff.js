// Compares two recorded runs: a reference (where the content works) and a run (where it doesn't). Pure functions.
// Requests and scripts are matched by path, ignoring host and package root: the longest run of trailing path
// segments decides, so https://host/content/abc/js/app.js matches lab://run/pkg/js/app.js.

// Path segments of a URL, without the lab host's own prefixes.
export function segs(url) {
  let u
  try { u = new URL(url) } catch { return [] }
  let p = u.pathname
  if (u.protocol === 'lab:') p = p.replace(/^\/pkg\//, '/')
  return p.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s) } catch { return s } })
}
export const isLab = url => /^lab:\/\/run\/__lab\//.test(url)
const ignorable = url => !url || /^(data|blob|chrome|chrome-extension|devtools|about):/.test(url) || isLab(url)

// For each item of a, the best item of b by common trailing segments (at least the file name), or null.
export function matchByPath(a, b, url = x => x.url) {
  const byName = new Map()
  for (const x of b) { const s = segs(url(x)); if (s.length) (byName.get(s.at(-1)) ?? byName.set(s.at(-1), []).get(s.at(-1))).push([x, s]) }
  return a.map(x => {
    const s = segs(url(x)), cands = s.length ? byName.get(s.at(-1)) ?? [] : []
    let best = null, bestN = 0
    for (const [y, ys] of cands) {
      let n = 0
      while (n < s.length && n < ys.length && s[s.length - 1 - n] === ys[ys.length - 1 - n]) n++
      if (n > bestN) { best = y; bestN = n }
    }
    return best
  })
}
const ok = r => r.status >= 200 && r.status < 400 && !r.failed
// Line and column of an offset, with the line's text.
export function lineOf(src, off) {
  if (!src) return { line: 0, text: '' }
  const start = src.lastIndexOf('\n', off - 1) + 1, end = src.indexOf('\n', off)
  let line = 1
  for (let k = src.indexOf('\n'); k !== -1 && k < off; k = src.indexOf('\n', k + 1)) line++
  const text = src.slice(start, end < 0 ? undefined : end)
  return { line, col: off - start + 1, text: text.length > 240 ? text.slice(Math.max(0, off - start - 80), off - start + 160) : text }
}

// Functions keyed by name and the n-th function of that name in the script, so the same code matches across runs.
function fnMap(cov) {
  const m = new Map(), n = new Map()
  for (const [name, r] of [...cov.fns].sort((a, b) => a[1][0] - b[1][0])) {
    const k = name + '#' + (n.get(name) ?? 0); n.set(name, (n.get(name) ?? 0) + 1); m.set(k, { name, r })
  }
  return m
}

// Branches. V8 lists a function's range first, then nested blocks whose count differs from the block around them;
// a block not listed has its enclosing block's count. Ranges here are relative to the function's start.
const ranges = r => { const out = []; for (let i = 0; i < r.length; i += 3) out.push([r[i] - r[0], r[i + 1] - r[0], r[i + 2]]); return out }
function countOf(rs, s, e) {
  let best = null
  for (const x of rs) if (x[0] <= s && x[1] >= e && (!best || x[1] - x[0] <= best[1] - best[0])) best = x
  return best ? best[2] : 0
}
// Blocks that ran in one function and not in the other: [{ s, e, inA, inB }].
export function branchDiff(ra, rb) {
  const a = ranges(ra), b = ranges(rb), seen = new Set(), out = []
  for (const [s, e] of [...a.slice(1), ...b.slice(1)]) {
    if (seen.has(s + ':' + e)) continue
    seen.add(s + ':' + e)
    const inA = countOf(a, s, e) > 0, inB = countOf(b, s, e) > 0
    if (inA !== inB) out.push({ s, e, inA, inB })
  }
  return out.sort((x, y) => x.s - y.s)
}

export function compareCoverage(ref, run) {
  const out = { fnsOnlyRef: [], fnsOnlyRun: [], branchesOnlyRef: [], branchesOnlyRun: [], differentFiles: [] }
  const covRun = run.coverage, match = matchByPath(ref.coverage, covRun)
  ref.coverage.forEach((a, i) => {
    const b = match[i]
    if (!b) return
    if (a.hash && b.hash && a.hash !== b.hash) { out.differentFiles.push({ ref: a.url, run: b.url }); return }
    const src = run.sources?.[b.url] || ref.sources?.[a.url] || '', fa = fnMap(a), fb = fnMap(b)
    const at = (off, url) => ({ url, ...lineOf(src, off) })
    for (const [k, { name, r }] of fa) {
      const o = fb.get(k)
      if (!o) continue
      const ranA = r[2] > 0, ranB = o.r[2] > 0
      if (ranA && !ranB) out.fnsOnlyRef.push({ name: name || '(anonymous)', ...at(r[0], b.url), count: r[2] })
      else if (!ranA && ranB) out.fnsOnlyRun.push({ name: name || '(anonymous)', ...at(o.r[0], b.url), count: o.r[2] })
      else if (ranA && ranB) for (const d of branchDiff(r, o.r)) (d.inA ? out.branchesOnlyRef : out.branchesOnlyRun).push({ fn: name || '(anonymous)', ...at(o.r[0] + d.s, b.url) })
    }
  })
  return out
}

export function compare(ref, run) {
  const reqA = ref.requests.filter(r => !ignorable(r.url)), reqB = run.requests.filter(r => !ignorable(r.url))
  const m = matchByPath(reqA, reqB), back = matchByPath(reqB, reqA)
  const requests = { onlyRef: [], failedInRun: [], onlyRun: [] }
  reqA.forEach((r, i) => {
    if (!ok(r)) return
    if (!m[i]) requests.onlyRef.push(r)
    else if (!ok(m[i])) requests.failedInRun.push({ ref: r, run: m[i] })
  })
  reqB.forEach((r, i) => { if (!back[i]) requests.onlyRun.push(r) })
  const scrA = ref.scripts.filter(s => s.url && !ignorable(s.url)), scrB = run.scripts.filter(s => s.url && !ignorable(s.url))
  const ms = matchByPath(scrA, scrB), msb = matchByPath(scrB, scrA)
  const scripts = { onlyRef: scrA.filter((s, i) => !ms[i]), onlyRun: scrB.filter((s, i) => !msb[i]) }
  const errKey = e => e.text.replace(/\d+/g, 'N')
  const refErr = new Set([...ref.exceptions, ...ref.caught].map(errKey))
  const exceptions = { onlyRun: run.exceptions.filter(e => !refErr.has(errKey(e))), caughtOnlyRun: run.caught.filter(e => !refErr.has(errKey(e))) }
  const api = s => s.probe.filter(p => p.type === 'api'), lookups = s => s.probe.filter(p => p.type === 'lookup')
  const coverage = ref.coverage?.length && run.coverage?.length ? compareCoverage(ref, run) : null
  // The first thing the reference did that the run didn't, in the reference's time order.
  const cands = [
    ...requests.onlyRef.map(r => ({ t: r.t, kind: 'request', text: `${r.method} ${r.url}`, item: r })),
    ...requests.failedInRun.map(x => ({ t: x.ref.t, kind: 'request-failed', text: `${x.run.url} (${x.run.status ?? x.run.failed})`, item: x })),
    ...scripts.onlyRef.map(s => ({ t: s.t, kind: 'script', text: s.url, item: s })),
  ].sort((a, b) => a.t - b.t)
  return { requests, scripts, exceptions, coverage, firstDivergence: cands[0] ?? null,
    api: { ref: api(ref).length, run: api(run).length, refFirst: api(ref).slice(0, 10) },
    lookups: { ref: lookups(ref).length, run: lookups(run).length } }
}
