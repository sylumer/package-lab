// A line diff (Myers, O(ND)) for showing what changed in a text file. Pure.
// diffLines(a, b) → [{ op: ' ' | '-' | '+', text }]; unified(a, b) → text with @@ hunks, '' when equal.
// Line endings are not changes (CRLF counts as LF). Past MAX_EDITS edits the middle is shown as replaced, not
// minimal: that keeps the time and memory bounded (about MAX_EDITS² integers).
const split = s => s === '' ? [] : s.replace(/\r\n/g, '\n').split('\n')
const MAX_EDITS = 3000

// Shortest edit script between int arrays x and y: a list of '=', '-', '+' in order, or null past MAX_EDITS edits.
function myers(x, y) {
  const n = x.length, m = y.length, max = Math.min(n + m, MAX_EDITS), off = max + 1, v = new Int32Array(2 * max + 4), trace = []
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2))   // v as it was before this round, for k in -d-1 … d+1
    for (let k = -d; k <= d; k += 2) {
      let px = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1, py = px - k
      while (px < n && py < m && x[px] === y[py]) { px++; py++ }
      v[off + k] = px
      if (px >= n && py >= m) {
        const ops = []
        let cx = n, cy = m
        for (let e = d; e > 0; e--) {
          const t = trace[e], k2 = cx - cy, down = k2 === -e || (k2 !== e && t[k2 - 1 + e + 1] < t[k2 + 1 + e + 1]), pk = down ? k2 + 1 : k2 - 1, ppx = t[pk + e + 1], ppy = ppx - pk
          for (const mid = down ? ppx : ppx + 1; cx > mid; cx--, cy--) ops.push('=')
          ops.push(down ? '+' : '-'); cx = ppx; cy = ppy
        }
        while (cx > 0 && cy > 0) { ops.push('='); cx--; cy-- }
        return ops.reverse()
      }
    }
  }
  return null
}

export function diffLines(a, b) {
  const x = split(a), y = split(b)
  let s = 0
  while (s < x.length && s < y.length && x[s] === y[s]) s++
  let e = 0
  while (e < x.length - s && e < y.length - s && x[x.length - 1 - e] === y[y.length - 1 - e]) e++
  const mx = x.slice(s, x.length - e), my = y.slice(s, y.length - e), out = x.slice(0, s).map(text => ({ op: ' ', text }))
  const ids = new Map(), id = t => ids.get(t) ?? ids.set(t, ids.size).get(t)
  const ops = !mx.length || !my.length ? null : myers(mx.map(id), my.map(id))
  if (!ops) out.push(...mx.map(text => ({ op: '-', text })), ...my.map(text => ({ op: '+', text })))
  else {
    let i = 0, j = 0
    for (const op of ops) {
      if (op === '=') { out.push({ op: ' ', text: mx[i] }); i++; j++ } else if (op === '-') out.push({ op: '-', text: mx[i++] })
      else out.push({ op: '+', text: my[j++] })
    }
  }
  out.push(...x.slice(x.length - e).map(text => ({ op: ' ', text })))
  return out
}

export function unified(a, b, context = 3) {
  const d = diffLines(a, b), keep = new Set()
  d.forEach((r, i) => { if (r.op !== ' ') for (let k = Math.max(0, i - context); k <= Math.min(d.length - 1, i + context); k++) keep.add(k) })
  if (!keep.size) return ''
  const lines = []
  let ai = 0, bi = 0, i = 0
  while (i < d.length) {
    if (!keep.has(i)) { if (d[i].op !== '+') ai++; if (d[i].op !== '-') bi++; i++; continue }
    let j = i
    while (j < d.length && keep.has(j)) j++
    const hunk = d.slice(i, j), na = hunk.filter(r => r.op !== '+').length, nb = hunk.filter(r => r.op !== '-').length
    lines.push(`@@ -${na ? ai + 1 : ai},${na} +${nb ? bi + 1 : bi},${nb} @@`, ...hunk.map(r => r.op + r.text))
    ai += na; bi += nb; i = j
  }
  return lines.join('\n')
}
