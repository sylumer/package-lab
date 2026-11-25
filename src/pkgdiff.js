// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// Comparing two packages (P3.3): what changed between two exports, in files and in behaviour. Pure: takes two
// packages ({ name, files (Map from unzip), analysis? }) and works out the rest. Not to be confused with diff.js,
// which compares two recorded runs.
import { analyze } from './analyze.js'
import { bootGraph } from './bootpath.js'
import { staticFindings, sortFindings } from './rules.js'
import { isText } from './overlay.js'
import { unified } from './textdiff.js'
import { milestones, furthest, progress, runCounts } from './milestones.js'

export const MAX_TEXT = 1024 ** 2
export const MAX_TOTAL = 5 * 1024 ** 2   // all the text diffs together; past it the rest are listed without one   // text files larger than this (either side) are listed but not diffed

// The item to launch: a number (1-based, among the items with something to launch) or an identifier; by default the
// first SCO. null when there is none.
export function pickItem(analysis, want) {
  const list = (analysis.manifest?.items ?? []).filter(i => i.res)
  if (want === undefined || want === null) return list.find(i => i.type === 'sco') ?? list[0] ?? null
  return /^\d+$/.test(String(want)) ? list[+want - 1] ?? null : list.find(i => i.id === want) ?? null
}

// What a package looks like before any run: its item, boot graph and findings.
function inspect(pkg, want) {
  const analysis = pkg.analysis ?? analyze(pkg.files), item = pickItem(analysis, want), boot = item?.res.path ? bootGraph(pkg.files, item.res.path) : null
  return { analysis, item, boot, findings: sortFindings([...staticFindings(analysis), ...(boot?.risks ?? [])]) }
}

// Files: added, removed, changed (with sizes), and a unified diff of each changed text file under MAX_TEXT.
export function compareFiles(fa, fb) {
  const out = { added: [], removed: [], changed: [], same: 0 }
  let budget = MAX_TOTAL
  for (const [path, buf] of fb) if (!fa.has(path)) out.added.push({ path, size: buf.length })
  for (const [path, buf] of fa) {
    const o = fb.get(path)
    if (!o) { out.removed.push({ path, size: buf.length }); continue }
    if (buf.equals(o)) { out.same++; continue }
    const text = isText(buf) && isText(o)
    let tooBig = text && (buf.length > MAX_TEXT || o.length > MAX_TEXT), diff = null
    if (text && !tooBig) {
      const eol = buf.toString('utf8').replace(/\r\n/g, '\n') === o.toString('utf8').replace(/\r\n/g, '\n')
      diff = unified(buf.toString('utf8'), o.toString('utf8')) || (eol ? '(only the line endings changed)' : '(changes that aren’t visible line by line)')
      if (diff.length > budget) { diff = null; tooBig = true } else budget -= diff.length
    }
    // ponytail: minified files are diffed as they are (one huge line); P4.1's formatter will make them readable.
    out.changed.push({ path, before: buf.length, after: o.length, text, tooBig, diff })
  }
  for (const l of [out.added, out.removed, out.changed]) l.sort((x, y) => x.path < y.path ? -1 : 1)
  return out
}

// The manifest field by field: [{ where, field, a, b }], with a or b null where one side has no such thing.
const FIELDS = {
  package: ['version', 'edition', 'schemaversion', 'title'],
  resource: ['type', 'href', 'path', 'query', 'files', 'deps'],
  item: ['title', 'depth', 'type', 'resource', 'params', 'launchData', 'mastery', 'maxTime', 'timeLimitAction', 'completionThreshold'],
}
const val = (o, f) => Array.isArray(o[f]) ? o[f].join(', ') : o[f] === undefined || o[f] === null ? '' : String(o[f])
export function compareManifests(ma, mb) {
  const rows = []
  const fields = (where, kind, x, y) => { for (const f of FIELDS[kind]) if (val(x, f) !== val(y, f)) rows.push({ where, field: f, a: val(x, f), b: val(y, f) }) }
  fields('manifest', 'package', ma ?? {}, mb ?? {})
  if (!ma !== !mb) rows.push({ where: 'manifest', field: '(file)', a: ma ? 'present' : 'none', b: mb ? 'present' : 'none' })
  for (const [kind, list] of [['resource', m => m?.resources ?? []], ['item', m => m?.items ?? []]]) {
    const A = new Map(list(ma).map(x => [x.id, x])), B = new Map(list(mb).map(x => [x.id, x])), name = (x, id) => `${kind} ${id}`
    const brief = x => kind === 'item' ? `${x.title || x.id} (${x.type || '?'}, ${x.res?.path ?? x.res?.href ?? 'nothing to launch'})` : `${x.type} ${x.href}`
    for (const [id, x] of A) { const y = B.get(id); if (!y) rows.push({ where: name(x, id), field: '', a: brief(x), b: null }); else fields(name(x, id), kind, x, y) }
    for (const [id, y] of B) if (!A.has(id)) rows.push({ where: name(y, id), field: '', a: null, b: brief(y) })
  }
  return rows
}

// Boot graphs: nodes (files the launch page loads) only in a, only in b, and in both with another status.
export function compareBoots(ba, bb) {
  const key = n => n.path ?? n.target, map = b => { const m = new Map(); for (const n of b?.nodes ?? []) if (key(n) != null && !m.has(key(n))) m.set(key(n), n); return m }
  const A = map(ba), B = map(bb), brief = n => ({ path: key(n), kind: n.kind, how: n.how, status: n.status })
  const out = { a: ba?.start ?? null, b: bb?.start ?? null, removed: [], added: [], changed: [] }
  for (const [k, n] of A) { const m = B.get(k); if (!m) out.removed.push(brief(n)); else if (n.status !== m.status) out.changed.push({ path: k, kind: m.kind, a: n.status, b: m.status }) }
  for (const [k, n] of B) if (!A.has(k)) out.added.push(brief(n))
  return out
}

// Findings: the ones only in a ("gone") and only in b ("new"). Two findings are the same when title and evidence match.
export function compareFindings(fa, fb) {
  const key = f => f.sev + '\n' + f.title + '\n' + (f.evidence ?? []).join('\n'), A = new Set(fa.map(key)), B = new Set(fb.map(key))
  return { gone: fa.filter(f => !B.has(key(f))), added: fb.filter(f => !A.has(key(f))), same: fa.filter(f => B.has(key(f))).length }
}

// Behaviour: two saved runs of the same item and options. Each is a saved run ({ trace, milestones?, boot? }).
export function compareBehaviour(ra, rb, names = ['A', 'B']) {
  const ms = r => Array.isArray(r.milestones) ? r.milestones : milestones(r.trace, r.boot), la = ms(ra), lb = ms(rb)
  const p = progress({ milestones: la, counts: runCounts(ra.trace) }, { milestones: lb, counts: runCounts(rb.trace) })
  const end = l => { const f = furthest(l); return { furthest: f?.id ?? null, furthestLabel: f?.label ?? 'nothing' } }
  const a = end(la), b = end(lb)
  return { a: { name: names[0], ...a, milestones: la }, b: { name: names[1], ...b, milestones: lb }, better: p.better, steps: p.steps, counts: p.counts,
    summary: `${names[0]} reached “${a.furthestLabel}”; ${names[1]} reached “${b.furthestLabel}”. ${p.better > 0 ? `${names[1]} got further.` : p.better < 0 ? `${names[1]} got less far.` : 'No difference in how far they got.'}` }
}

// comparePackages(a, b, { item }) → { a, b, files, manifest, boot, findings, summary }. item: the item to compare (as
// pickItem takes it) in both packages, else each one's first SCO.
export function comparePackages(a, b, { item } = {}) {
  const x = inspect(a, item), y = inspect(b, item), files = compareFiles(a.files, b.files), manifest = compareManifests(x.analysis.manifest, y.analysis.manifest)
  const boot = compareBoots(x.boot, y.boot), findings = compareFindings(x.findings, y.findings)
  const side = (p, i) => ({ name: p.name, files: i.analysis.files, size: i.analysis.size, item: i.item ? { id: i.item.id, title: i.item.title, launch: i.item.res.path ?? i.item.res.href } : null, findings: i.findings })
  const n = (k, one) => `${k} ${one}${k === 1 ? '' : 's'}`
  return { a: side(a, x), b: side(b, y), files, manifest, boot, findings,
    summary: `${n(files.added.length, 'file')} added, ${n(files.removed.length, 'file')} removed, ${n(files.changed.length, 'file')} changed; ${n(manifest.length, 'manifest difference')}; `
      + `${n(boot.added.length + boot.removed.length + boot.changed.length, 'boot-graph difference')}; ${n(findings.added.length, 'new finding')}, ${n(findings.gone.length, 'finding')} gone.`, }
}
