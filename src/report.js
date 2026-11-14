// Reports: a package's findings (and, after a run, what happened) as HTML, plus the verdict and counts the CLI and
// the Concierge module show. Pure. renderReport gives a complete page, or with fragment: true a <div class="sl">
// with its own scoped styles, for embedding (the Concierge module prints it inside its page).
import { bootRun } from './bootpath.js'
import { isLab, isLrs } from './diff.js'
import { milestones } from './milestones.js'
import { timelineView } from './timeline.js'
import { excerptor, urlPath } from './codeview.js'
import { entryBuffer, isText } from './overlay.js'
import { redactRun } from './redact.js'
import { statementSummary } from './xapi.js'
import { formatName } from './cmi5.js'

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const short = u => String(u ?? '').replace(/^lab:\/\/(?:run|content)\/pkg\//, '')
const where = f => f ? `${f.fn || '(anonymous)'} ${short(f.url)}:${f.line}` : ''

// The worst finding decides: { sev: 'error' | 'warn' | 'ok', title }.
export function verdict(findings = []) {
  const e = findings.find(f => f.sev === 'error'), w = findings.find(f => f.sev === 'warn')
  return e ? { sev: 'error', title: e.title } : w ? { sev: 'warn', title: w.title } : { sev: 'ok', title: 'No problems found' }
}
export function counts(findings = [], trace) {
  const c = { errors: findings.filter(f => f.sev === 'error').length, warnings: findings.filter(f => f.sev === 'warn').length, info: findings.filter(f => f.sev === 'info').length }
  if (trace) {
    const api = trace.probe.filter(p => p.type === 'api')
    // The LRS's own answers (a 400 for a bad statement) belong to the xAPI section, not to the failed requests.
    Object.assign(c, { apiCalls: api.length, requests: trace.requests.length, failedRequests: trace.requests.filter(r => !isLrs(r.url, trace) && (r.status >= 400 || r.failed && !r.canceled)).length,
      uncaught: trace.exceptions.length, seconds: Math.round((trace.duration ?? 0) / 1000) })
    if (trace.lrs) Object.assign(c, { statements: trace.lrs.statements.filter(s => s.by === 'au').length, lrsCalls: trace.lrs.calls.length })   // cmi5 and Tin Can (P4.5)
  }
  return c
}
// What the content showed at the end: the last DOM report of each content frame.
export function screens(trace) {
  return [...new Map((trace?.probe ?? []).filter(p => p.type === 'dom' && !isLab(p.frame)).map(d => [d.frame, d])).values()]
}

const CSS = `
.sl { --sl-err: var(--err, #c4281c); --sl-warn: var(--warn, #a15c00); --sl-ok: var(--ok, #1e7d32); --sl-line: var(--line, #d9d9de); --sl-muted: var(--muted, #6e6e73); --sl-code: var(--code, rgba(127,127,127,.12)); font-size: 14px; line-height: 1.45; }
.sl h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--sl-muted); margin: 22px 0 6px; }
.sl .sl-verdict { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; margin: 6px 0 2px; }
.sl .sl-badge { display: inline-block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; padding: 2px 8px; border-radius: 999px; color: #fff; background: var(--sl-muted); }
.sl .sl-badge.error { background: var(--sl-err); } .sl .sl-badge.warn { background: var(--sl-warn); } .sl .sl-badge.ok { background: var(--sl-ok); }
.sl .sl-finding { border: 1px solid var(--sl-line); border-left: 4px solid var(--sl-muted); border-radius: 8px; padding: 8px 12px; margin: 8px 0; }
.sl .sl-finding.error { border-left-color: var(--sl-err); } .sl .sl-finding.warn { border-left-color: var(--sl-warn); }
.sl .sl-finding h3 { font-size: 14px; margin: 0 0 4px; } .sl .sl-finding p { margin: 4px 0; }
.sl .sl-finding ul { margin: 4px 0; padding-left: 18px; } .sl .sl-finding li, .sl code, .sl .sl-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-word; }
.sl .sl-sev { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; margin-right: 6px; color: var(--sl-muted); }
.sl .error > h3 .sl-sev, .sl .sl-bad { color: var(--sl-err); } .sl .warn > h3 .sl-sev { color: var(--sl-warn); }
.sl .sl-muted { color: var(--sl-muted); }
.sl .sl-banner { border: 1px solid var(--sl-warn); border-radius: 8px; padding: 8px 12px; margin: 10px 0; font-size: 13px; }
.sl .sl-scroll { overflow-x: auto; }
.sl table { border-collapse: collapse; width: 100%; font-size: 12px; }
.sl th, .sl td { text-align: left; vertical-align: top; padding: 3px 6px; border-bottom: 1px solid var(--sl-line); }
.sl td { word-break: break-word; }
.sl details { margin: 6px 0; } .sl summary { cursor: pointer; }
.sl pre.sl-diff { margin: 4px 0; padding: 6px 0; overflow-x: auto; background: var(--sl-code); border-radius: 6px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.sl .sl-diff div { padding: 0 8px; white-space: pre; } .sl .sl-code .hl { background: color-mix(in srgb, var(--sl-warn) 25%, transparent); } .sl .sl-ln { display: inline-block; min-width: 4ch; margin-right: 1.5ch; text-align: right; color: var(--sl-muted); user-select: none; }
.sl .sl-excerpt { margin: 4px 0; } .sl .sl-finding a { color: inherit; } .sl .sl-diff .add { background: color-mix(in srgb, var(--sl-ok) 20%, transparent); } .sl .sl-diff .del { background: color-mix(in srgb, var(--sl-err) 20%, transparent); } .sl .sl-diff .hunk { color: var(--sl-muted); }
.sl .sl-tl { width: 100%; height: auto; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.sl .sl-tl-grid { stroke: var(--sl-line); } .sl .sl-tl-sep { stroke: var(--sl-line); } .sl .sl-tl-tick, .sl .sl-tl-lane { fill: var(--sl-muted); }
.sl .tl-bar, .sl .tl-density { fill: var(--sl-muted); opacity: .6; } .sl .tl-bar.tl-bad { fill: var(--sl-err); opacity: 1; }
.sl .tl-dot { stroke: none; } .sl .tl-mlabel { fill: var(--sl-muted); font-size: 11px; } .sl .tl-init { fill: var(--sl-ok); } .sl .tl-get { fill: #1565c0; } .sl .tl-set { fill: #7b1fa2; } .sl .tl-commit { fill: #00838f; } .sl .tl-finish { fill: #5d4037; } .sl .tl-other, .sl .tl-script { fill: var(--sl-muted); } .sl .tl-ms { fill: var(--sl-ok); } .sl .tl-bad { fill: var(--sl-err); } .sl .tl-dom { fill: #ff9800; }
`
const PAGE_CSS = `
:root { --bg: #fff; --fg: #1d1d1f; --muted: #6e6e73; --line: #d9d9de; --err: #c4281c; --warn: #a15c00; --ok: #1e7d32; --code: #f0f0f3; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #1c1c1e; --fg: #f2f2f7; --muted: #98989f; --line: #3a3a3c; --err: #ff6b5e; --warn: #ffb340; --ok: #4cd964; --code: #2a2a2d; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 16px; }
h1 { font-size: 20px; margin: 8px 0 2px; }
`

function table(cols, rows, max = 500) {
  if (!rows.length) return '<p class="sl-muted">None.</p>'
  const more = rows.length > max ? `<p class="sl-muted">First ${max} of ${rows.length}.</p>` : ''
  return `<div class="sl-scroll"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, max).map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${more}`
}
// ex (optional, from excerptor): every file:line in the evidence becomes a link to a read-only excerpt (±20 lines) under the finding.
const excerptHtml = x => `<details class="sl-excerpt"><summary class="sl-mono">${esc(x.title)}${x.ex.label ? ` <span class="sl-muted">(${esc(x.ex.label)})</span>` : ''}</summary><pre class="sl-diff sl-code" id="${x.id}">${x.ex.lines.map(l => `<div class="${l.hl ? 'hl' : ''}"><span class="sl-ln">${l.n}</span>${esc(l.text) || ' '}</div>`).join('')}</pre></details>`
export function findingsHtml(findings, ex) {
  if (!findings?.length) return '<p class="sl-muted">No findings.</p>'
  const evidence = e => ex ? ex.parts(e).map(p => p.id ? `<a href="#${p.id}">${esc(p.text)}</a>` : esc(p.text)).join('') : esc(e)
  return findings.map(f => {
    const list = f.evidence?.length ? `<ul>${f.evidence.map(e => `<li>${evidence(e)}</li>`).join('')}</ul>` : ''
    return `<div class="sl-finding ${esc(f.sev)}"><h3><span class="sl-sev">${f.sev === 'warn' ? 'warning' : esc(f.sev)}</span>${esc(f.title)}</h3>${f.detail ? `<p>${esc(f.detail)}</p>` : ''}${list}${ex ? ex.take().map(excerptHtml).join('') : ''}${f.fix ? `<p><b>Try:</b> ${esc(f.fix)}</p>` : ''}</div>`
  }).join('')
}
// The text of the package files a report can show excerpts of: the files the run was changed to (launch.options.files), else what the run
// recorded, else the package's own files (Map path → Buffer).
export function reportText(o) {
  const rec = new Map(), files = o.files, changed = o.run?.launch?.options?.files ?? {}
  for (const [u, t] of Object.entries(o.run?.trace?.sources ?? {})) { const p = urlPath(u); if (p && typeof t === 'string' && t) rec.set(p, t) }
  return path => {
    if (Object.hasOwn(changed, path)) { try { const b = entryBuffer(changed[path]); if (isText(b)) return b.toString('utf8') } catch { /* fall through */ } }
    if (rec.has(path)) return rec.get(path)
    const b = files?.get?.(path)
    return b && !b.subarray(0, 8000).includes(0) ? Buffer.from(b).toString('utf8') : null
  }
}
const FILE = { ok: 'in package', case: 'wrong capitals', missing: 'missing', server: 'server path', outside: 'outside package', local: 'author’s computer', remote: 'other site', 'remote-http': 'other site (http)' }
export function bootHtml(boot, trace) {
  if (!boot) return ''
  const nodes = trace ? bootRun(boot, trace) : boot.nodes
  const runCell = n => !n.run ? `<span class="${n.status === 'ok' && n.how !== 'literal' && n.kind !== 'asset' ? 'sl-bad' : 'sl-muted'}">never asked for</span>`
    : n.run.failed || n.run.status >= 400 ? `<span class="sl-bad">${esc(n.run.status ?? n.run.failed)}</span>` : n.run.pending ? 'still waiting' : `${esc(n.run.status)} at ${(n.run.t / 1000).toFixed(2)} s`
  let out = table(['#', 'File', 'Kind', 'How', 'From', 'In the files', ...(trace ? ['In the run'] : [])], nodes.map((n, i) => [i + 1, `<span class="sl-mono">${'&nbsp;&nbsp;'.repeat(n.depth)}${esc(n.path ?? n.target)}</span>`,
    esc(n.kind + (n.mode && n.mode !== 'sync' ? ` (${n.mode})` : '')), esc(n.how), esc(n.from ? `${n.from}:${n.line}` : ''),
    `<span class="${n.status === 'ok' ? '' : 'sl-bad'}">${esc(FILE[n.status] + (n.actual ? ': ' + n.actual : '') + (n.elsewhere ? ` (there is ${n.elsewhere})` : ''))}</span>`, ...(trace ? [runCell(n)] : [])]))
  for (const pg of boot.pages) out += `<details><summary>Script order on ${esc(pg.path)}</summary>${table(['Runs', 'Script', 'Mode', 'Line'], pg.execOrder.map((x, i) => [i + 1, esc(x.name), esc(x.mode), x.line]))}</details>`
  if (boot.dynamic.length) out += `<details><summary>Paths built at run time (${boot.dynamic.length})</summary>${table(['File', 'Line', 'Code'], boot.dynamic.map(d => [esc(d.file), d.line, `<code>${esc(d.text)}</code>`]))}</details>`
  return out
}
// The xAPI section of a run with an LRS (trace.lrs): the statements with their problems, the documents and the requests.
function xapiHtml(x) {
  const ok = x.statements.filter(s => s.status === 'stored').length, bad = x.statements.filter(s => s.status === 'rejected').length
  const probs = s => (s.problems ?? []).map(p => `<span class="${p.sev === 'error' ? 'sl-bad' : 'sl-muted'}">${esc(p.sev)} ${esc(p.path)}: ${esc(p.text)}</span>`).join('<br>')
  return `<h2>xAPI</h2><p>${esc(x.format === 'cmi5' ? 'cmi5' : 'Tin Can')}: ${x.statements.length} statements (${ok} stored, ${bad} rejected), ${x.calls.length} requests to the LRS${x.format === 'cmi5' ? `, the auth token was fetched ${x.fetches.length} time${x.fetches.length === 1 ? '' : 's'}` : ''}.</p>
${table(['#', 's', 'From', 'Status', 'Statement', 'Problems'], x.statements.map(s => [s.n, ((s.t ?? 0) / 1000).toFixed(2), esc(s.by === 'lms' ? 'the LMS' : 'the content'), s.status === 'rejected' ? '<span class="sl-bad">rejected</span>' : esc(s.status), `<code>${esc(statementSummary(s))}</code>`, probs(s)]), 300)}
<details><summary>Documents (${x.documents.length})</summary>${table(['Kind', 'Id', 'Type', 'Written by', 'Content'], x.documents.map(d => [esc(d.kind), esc(d.id), esc(d.contentType), esc(d.by === 'lms' ? 'the LMS' : 'the content'), `<code>${esc(String(d.value).slice(0, 400))}</code>`]), 100)}</details>
<details><summary>Requests to the LRS (${x.calls.length})</summary>${table(['s', 'Method', 'Resource', 'Status', 'Authorization', 'Problems'], x.calls.map(c => [((c.t ?? 0) / 1000).toFixed(2), esc(c.method), esc(c.resource), c.status >= 400 ? `<span class="sl-bad">${esc(c.status)}</span>` : esc(c.status), esc(c.auth), esc((c.problems ?? []).map(p => p.text).join(' '))]), 300)}</details>`
}
function runHtml(run) {
  const t = run.trace, c = counts(run.findings, t), api = t.probe.filter(p => p.type === 'api'), l = run.launch ?? {}
  const facts = [['Ran for', `${c.seconds} s`], ['Offered', l.format && l.format !== 'scorm' ? 'a test LRS (' + (l.format === 'cmi5' ? 'cmi5' : 'Tin Can') + ')' : l.expose ? (l.expose === 'both' ? 'SCORM 1.2 and 2004 APIs' : l.expose === 'none' ? 'no API' : `SCORM ${l.expose} API`) + (l.depth ? `, ${l.depth} frames deep` : '') + (l.opener ? ', in a new window' : '') + (l.resume ? ', resuming saved data' : '') : '—'],
    ['API calls', c.apiCalls ? `${c.apiCalls} (first: ${api[0].call})` : 'none'], ['Requests', `${c.requests}${c.failedRequests ? `, ${c.failedRequests} failed` : ''}`], ['Uncaught errors', c.uncaught]]
  const shown = screens(t).map(d => [esc(short(d.frame)), esc(d.readyState), d.visible, d.media, esc(d.loader ?? ''), esc(d.sample ?? '')])
  const errs = [...t.exceptions.map(e => [((e.t ?? 0) / 1000).toFixed(2), 'uncaught', esc(e.text), esc(where(e.at?.[0]) || short(e.url) + ':' + e.line)]),
    ...(t.caught ?? []).filter(e => !e.uncaught).map(e => [((e.t ?? 0) / 1000).toFixed(2), 'caught', esc(e.text), esc(where(e.at?.[0]))])].sort((a, b) => a[0] - b[0])
  const failed = t.requests.filter(r => !isLrs(r.url, t) && (r.status >= 400 || r.failed && !r.canceled))
  return `<h2>What happened</h2>${table(['', ''], facts.map(([k, v]) => [`<b>${esc(k)}</b>`, esc(v)]))}
<h2>What the content showed at the end</h2>${table(['Frame', 'State', 'Visible elements', 'Images and media', 'Loading indicator', 'Text'], shown)}
<h2>API calls</h2>${table(['s', 'Call', 'Element', 'Value', 'Result', 'Error'], api.map(a => [((a.t ?? 0) / 1000).toFixed(2), esc(a.call), esc(a.el), `<code>${esc(String(a.value ?? '').slice(0, 300))}</code>`, esc(a.result), a.err ? `<span class="sl-bad">${esc(a.err)}${a.diag ? ': ' + esc(a.diag) : ''}</span>` : '']), 300)}
${t.lrs ? xapiHtml(t.lrs) : ''}
<h2>Failed requests</h2>${table(['s', 'Method', 'URL', 'Status', 'From'], failed.map(r => [((r.t ?? 0) / 1000).toFixed(2), esc(r.method), esc(short(r.url)), `<span class="sl-bad">${esc(r.status ?? r.failed)}</span>`, esc(where(r.from?.[0]))]))}
<h2>Errors</h2>${table(['s', 'Kind', 'Message', 'Where'], errs, 200)}`
}

// The package diff (pkgdiff.js comparePackages, with .behaviour when both were run): every changed file's diff is a collapsed <details>.
const MAX_DIFF_LINES = 3000
const kb = n => n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`
export function diffHtml(d) {
  const f = d.files, bh = d.behaviour, row = (x, c) => [esc(x.path), kb(x.size), c]
  const diffPre = text => { const lines = text.split('\n'); return `<pre class="sl-diff">${lines.slice(0, MAX_DIFF_LINES).map(l => `<div class="${l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : l[0] === '@' ? 'hunk' : ''}">${esc(l) || ' '}</div>`).join('')}</pre>${lines.length > MAX_DIFF_LINES ? `<p class="sl-muted">First ${MAX_DIFF_LINES} of ${lines.length} lines.</p>` : ''}` }
  const changed = f.changed.map(c => `<details><summary><span class="sl-mono">${esc(c.path)}</span> <span class="sl-muted">${kb(c.before)} → ${kb(c.after)}${c.diff === null ? (c.tooBig ? ', too large to show line by line' : ', not a text file') : ''}</span></summary>${c.diff === null ? '' : diffPre(c.diff)}</details>`).join('')
  const bootRow = (n, note) => [`${esc(n.path)} <span class="sl-muted">(${note})</span>`, esc(n.kind), esc(n.how), esc(FILE[n.status] ?? n.status)]
  return `<h2>Package diff</h2><p>${esc(d.a.name)} (A) against ${esc(d.b.name)} (B): ${esc(d.summary)}</p>
${bh ? `<h2>Behaviour</h2><p><b>${esc(bh.summary)}</b></p>${milestoneHtml(bh.a.milestones).replace('<h2>Milestones</h2>', `<p class="sl-muted">${esc(d.a.name)}</p>`)}${milestoneHtml(bh.b.milestones).replace('<h2>Milestones</h2>', `<p class="sl-muted">${esc(d.b.name)}</p>`)}${table(['', 'A', 'B'], Object.entries(bh.counts).map(([k, v]) => [esc(k), esc(v.a), esc(v.b)]))}` : ''}
<h2>Files</h2>${table(['File', 'Size', 'Change'], [...f.added.map(x => row(x, 'added in B')), ...f.removed.map(x => row(x, 'only in A')), ...f.changed.map(x => [esc(x.path), `${kb(x.before)} → ${kb(x.after)}`, 'changed'])])}${changed}
<h2>Manifest</h2>${table(['Where', 'Field', 'A', 'B'], d.manifest.map(m => [esc(m.where), esc(m.field), m.a === null ? '<span class="sl-muted">none</span>' : esc(m.a), m.b === null ? '<span class="sl-muted">none</span>' : esc(m.b)]))}
<h2>Loading path</h2><p class="sl-muted">Launch page: ${esc(d.boot.a ?? 'none')} in A, ${esc(d.boot.b ?? 'none')} in B.</p>${table(['File', 'Kind', 'How', 'In the files'], [...d.boot.added.map(n => bootRow(n, 'only in B')), ...d.boot.removed.map(n => bootRow(n, 'only in A')), ...d.boot.changed.map(c => [`${esc(c.path)} <span class="sl-muted">(status changed)</span>`, esc(c.kind), '', `${esc(FILE[c.a] ?? c.a)} → ${esc(FILE[c.b] ?? c.b)}`])])}
<h2>New findings (in B, not in A)</h2>${findingsHtml(d.findings.added)}<h2>Findings gone (in A, not in B)</h2>${findingsHtml(d.findings.gone)}`
}

// The run's timeline as a static SVG (P4.2): the same lanes as the Timeline tab, whole run, hover titles.
const TL_W = 1000, TL_LABEL = 150, TL_ROW = 26, TL_LABEL_GAP = 110
const tlShort = s => String(s ?? '').length > 22 ? String(s).slice(0, 21) + '…' : String(s ?? '')
export function timelineHtml(trace, ms) {
  if (!trace) return ''
  const d = timelineView(trace, ms), H = 24 + d.lanes.length * TL_ROW + 4, P = TL_W - TL_LABEL - 10, px = x => TL_LABEL + x * P, X = x => px(x).toFixed(1)
  const ticks = d.ticks.map(k => `<line class="sl-tl-grid" x1="${X(k.x)}" x2="${X(k.x)}" y1="20" y2="${H - 2}"/><text class="sl-tl-tick" x="${X(k.x)}" y="12" text-anchor="middle">${esc(k.label)}</text>`).join('')
  const rows = d.lanes.map((L, i) => {
    const y0 = 24 + i * TL_ROW, mid = y0 + TL_ROW / 2
    const items = L.items.map(it => {
      const tip = `<title>${esc(it.title)}</title>`
      if (L.id === 'density') { const hh = (TL_ROW - 6) * it.n / L.max; return it.n ? `<rect class="tl-density" x="${X(it.x)}" y="${(y0 + TL_ROW - 3 - hh).toFixed(1)}" width="${Math.max(1, it.w * P).toFixed(1)}" height="${hh.toFixed(1)}">${tip}</rect>` : '' }
      if (L.id === 'requests') return `<rect class="tl-bar tl-${it.failed ? 'bad' : 'other'}" x="${X(it.x)}" y="${mid - 4}" width="${Math.max(2, (it.x2 - it.x) * P).toFixed(1)}" height="8">${tip}</rect>`
      const cls = L.id === 'api' ? it.kind : L.id === 'errors' ? 'bad' : L.id === 'milestones' ? 'ms' : L.id === 'dom' ? 'dom' : 'script'
      return `<circle class="tl-dot tl-${cls}" cx="${X(it.x)}" cy="${mid}" r="4">${tip}</circle>`
    }).join('')
    let labels = ''
    if (L.id === 'milestones') { let last = -Infinity; for (const it of [...L.items].sort((a, b) => a.x - b.x)) if (px(it.x) - last >= TL_LABEL_GAP) { labels += `<text class="tl-mlabel" x="${(px(it.x) + 6).toFixed(1)}" y="${mid + 4}">${esc(tlShort(it.label))}</text>`; last = px(it.x) } }
    return `<line class="sl-tl-sep" x1="0" x2="${TL_W}" y1="${y0}" y2="${y0}"/><text class="sl-tl-lane" x="6" y="${mid + 4}">${esc(L.label)}</text>${items}${labels}`
  }).join('')
  return `<div class="sl-scroll"><svg class="sl-tl" viewBox="0 0 ${TL_W} ${H}" role="img" aria-label="Timeline of the run">${ticks}${rows}</svg></div>${d.missing.length ? `<p class="sl-muted">Not reached: ${esc(d.missing.join(', '))}.</p>` : ''}`
}

function milestoneHtml(list) {
  return `<h2>Milestones</h2><p class="sl-mono">${list.map(s => `<span class="${s.reached ? '' : 'sl-bad'}" title="${esc(s.evidence)}">${s.reached ? '✓' : '✗'} ${esc(s.label)}</span>`).join(' &nbsp; ')}</p>`
}

// What a redacted report says it took out (redact.js counts), in words.
const REMOVED = { dom: 'page text', console: 'console messages', values: 'API and pin values', suspend: 'suspend data', bodies: 'request and response bodies and headers', typed: 'typed and macro text',
  files: 'changed file contents', scripts: 'code text', snippets: 'code snippets from the files', previews: 'values the code compared', titles: 'item and course titles', headers: 'header and policy values',
  queries: 'query values and fragments in addresses', paths: 'local file paths', quotes: 'quoted strings in messages', messages: 'message text after the first colon', ids: 'ids in addresses' }
function redactionBanner({ names, counts }) {
  const parts = Object.entries(REMOVED).filter(([k]) => counts[k]).map(([k, w]) => `${esc(w)} (${counts[k]})`)
  return `<div class="sl-banner"><b>Redacted report.</b> Taken out: ${parts.length ? parts.join(', ') : 'nothing in this run needed it'}. Free text is replaced by its length. Kept: element names, SCORM vocabulary (such as completed), numbers and times, ${names ? 'folder and file names as hashes' : 'the package name and the paths of its files'} (a query or fragment is never kept), function and property names, and the first part of each error message (up to its first colon, or the whole message for a known shape such as “x is not defined”; quoted strings are always taken out). Addresses of other sites keep their host and path, with id-like parts (long numbers, UUIDs, long hex or base64) hidden. The findings were worked out again from what is left. Code excerpts and the package diff are not shown.${names ? ' The key file has the table to match the hashes back to names.' : ''}</div>`
}
// The report's inputs with the course content taken out, and the findings worked out again from them (redact.js). redact: true, or the options for redactRun (names, key, map).
function redactInput(o) {
  const opts = o.redact === true ? {} : o.redact, run = o.run
  const R = redactRun({ ...(run ?? {}), findings: o.findings ?? run?.findings, boot: o.boot ?? run?.boot, analysis: o.analysis },
    { ...opts, package: opts.package ?? run?.package ?? undefined, paths: o.files ? [...o.files.keys()] : opts.paths })
  return { run: run ? R : undefined, title: `SCORM Lab: ${R.package ?? R.label ?? 'report'}`, subtitle: run ? R.label : 'From the files only. Run it to see what actually happens.', findings: R.findings, boot: R.boot, analysis: R.analysis,
    redaction: R.redaction, excerpts: false, files: undefined, diff: undefined }
}

// o: { title, subtitle, findings, boot, run (a saved run), analysis, fragment, files (Map path → Buffer: lets file:line in evidence link to an excerpt), excerpts (false: no excerpts, no links),
//      redact (true, or redactRun's options: the report is redacted, with a banner saying what was taken out; no excerpts, no package diff),
//      extra (HTML from this module's helpers, such as experimentHtml, shown under the verdict) }
export function renderReport(input) {
  // extra is HTML built by our helpers from unredacted rows, so a redacted report never shows it (its findings and tables are rebuilt from what is left).
  const o = input.redact ? { ...input, ...redactInput(input), extra: undefined } : input
  const run = o.run, findings = o.findings ?? run?.findings ?? [], v = verdict(findings), c = counts(findings)
  const a = o.analysis, m = a?.manifest, ex = o.excerpts !== false && (o.files || run?.trace?.sources || run?.launch?.options?.files) ? excerptor(reportText(o)) : null
  const pkgTable = a ? `<h2>Package</h2>${table(['', ''], [[a.format && a.format !== 'scorm' ? 'Course file' : 'Manifest', formatName(a)], ['Scripts use', a.apiUse === 'none' ? 'no SCORM API names' : a.apiUse === 'both' ? 'both APIs' : 'SCORM ' + a.apiUse],
    ['Made with', a.fingerprints.join(', ') || 'not recognised'], ['Files', `${a.files} (${(a.size / 1048576).toFixed(1)} MB)`], ['Items', (m?.items ?? []).map(i => `${i.title || i.id} (${i.type || '?'})`).join('; ')]].map(([k, x]) => [`<b>${esc(k)}</b>`, esc(x)]))}` : ''
  const body = `<div class="sl"><style>${CSS}</style>
${o.fragment ? '' : `<h1>${esc(o.title ?? 'SCORM Lab report')}</h1>`}${o.subtitle ? `<p class="sl-muted">${esc(o.subtitle)}</p>` : ''}
${o.redaction ? redactionBanner(o.redaction) : ''}
<div class="sl-verdict"><span class="sl-badge ${v.sev}">${v.sev === 'warn' ? 'warning' : v.sev === 'ok' ? 'ok' : 'error'}</span><b>${esc(v.title)}</b><span class="sl-muted">${c.errors} errors · ${c.warnings} warnings · ${c.info} notes</span></div>
${o.extra ?? ''}
${run?.kind === 'package' ? milestoneHtml(Array.isArray(run.milestones) ? run.milestones : milestones(run.trace, run.boot)) : ''}${run?.trace ? `<h2>Timeline</h2>${timelineHtml(run.trace, run.milestones ?? undefined)}` : ''}<h2>Findings</h2>${findingsHtml(findings, ex)}
${run ? runHtml(run) : ''}
${o.boot ?? run?.boot ? `<h2>Loading path</h2>${bootHtml(o.boot ?? run.boot, run?.trace)}` : ''}
${pkgTable}
${o.diff ? diffHtml(o.diff) : ''}
<p class="sl-muted">Made by SCORM Lab on ${esc(new Date().toISOString().slice(0, 16).replace('T', ' '))}. Everything here was worked out on this computer.</p></div>`
  return o.fragment ? body : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(o.title ?? 'SCORM Lab report')}</title><style>${PAGE_CSS}</style></head><body><main>${body}</main></body></html>`
}

// An experiment's variants (experiment --out writes report.html with this): the same columns as the text table. rows are summarise()'s rows.
export function experimentHtml(rows = []) {
  const verdictText = r => r.verdict.sev === 'ok' ? 'OK' : r.verdict.sev.toUpperCase()
  return `<h2>Variants</h2>${table(['Variant', 'Furthest', 'API calls', 'Errors', 'Verdict', 'Against the default'],
    rows.map(r => [r.name, r.furthestLabel, r.apiCalls, r.errors, verdictText(r), r.progress].map(c => esc(c))))}`
}
