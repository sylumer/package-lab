// A small line diff (longest common subsequence) for showing what an override changed. Pure.
// diffLines(a, b) → [{ op: ' ' | '-' | '+', text }]; unified(a, b) → text with @@ hunks, '' when equal.
const split = s => s === '' ? [] : s.replace(/\r\n/g, '\n').split('\n')

export function diffLines(a, b) {
  const x = split(a), y = split(b)
  let s = 0
  while (s < x.length && s < y.length && x[s] === y[s]) s++
  let e = 0
  while (e < x.length - s && e < y.length - s && x[x.length - 1 - e] === y[y.length - 1 - e]) e++
  const mx = x.slice(s, x.length - e), my = y.slice(s, y.length - e), out = x.slice(0, s).map(text => ({ op: ' ', text }))
  if (!mx.length || !my.length || mx.length * my.length > 4e6 || mx.length + my.length > 20000) {   // ponytail: too big for the table; show the middle as replaced. Myers (P3.3) would do better.
    out.push(...mx.map(text => ({ op: '-', text })), ...my.map(text => ({ op: '+', text })))
  } else {
    const n = mx.length, m = my.length, t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = mx[i] === my[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
    let i = 0, j = 0
    while (i < n || j < m) {
      if (i < n && j < m && mx[i] === my[j]) { out.push({ op: ' ', text: mx[i] }); i++; j++ }
      else if (i < n && (j >= m || t[i + 1][j] >= t[i][j + 1])) out.push({ op: '-', text: mx[i++] })
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
