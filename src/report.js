// Reports: a package's findings (and, after a run, what happened) as HTML, plus the verdict and counts the CLI and
// the Concierge module show. Pure. renderReport gives a complete page, or with fragment: true a <div class="sl">
// with its own scoped styles, for embedding (the Concierge module prints it inside its page).
import { bootRun } from './bootpath.js'
import { isLab } from './diff.js'
import { milestones } from './milestones.js'

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
    Object.assign(c, { apiCalls: api.length, requests: trace.requests.length, failedRequests: trace.requests.filter(r => r.status >= 400 || r.failed && !r.canceled).length,
      uncaught: trace.exceptions.length, seconds: Math.round((trace.duration ?? 0) / 1000) })
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
.sl .sl-scroll { overflow-x: auto; }
.sl table { border-collapse: collapse; width: 100%; font-size: 12px; }
.sl th, .sl td { text-align: left; vertical-align: top; padding: 3px 6px; border-bottom: 1px solid var(--sl-line); }
.sl td { word-break: break-word; }
.sl details { margin: 6px 0; } .sl summary { cursor: pointer; }
.sl pre.sl-diff { margin: 4px 0; padding: 6px 0; overflow-x: auto; background: var(--sl-code); border-radius: 6px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.sl .sl-diff div { padding: 0 8px; white-space: pre; } .sl .sl-diff .add { background: color-mix(in srgb, var(--sl-ok) 20%, transparent); } .sl .sl-diff .del { background: color-mix(in srgb, var(--sl-err) 20%, transparent); } .sl .sl-diff .hunk { color: var(--sl-muted); }
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
export function findingsHtml(findings) {
  if (!findings?.length) return '<p class="sl-muted">No findings.</p>'
  return findings.map(f => `<div class="sl-finding ${esc(f.sev)}"><h3><span class="sl-sev">${f.sev === 'warn' ? 'warning' : esc(f.sev)}</span>${esc(f.title)}</h3>${f.detail ? `<p>${esc(f.detail)}</p>` : ''}${f.evidence?.length ? `<ul>${f.evidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}${f.fix ? `<p><b>Try:</b> ${esc(f.fix)}</p>` : ''}</div>`).join('')
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
function runHtml(run) {
  const t = run.trace, c = counts(run.findings, t), api = t.probe.filter(p => p.type === 'api'), l = run.launch ?? {}
  const facts = [['Ran for', `${c.seconds} s`], ['Offered', l.expose ? (l.expose === 'both' ? 'SCORM 1.2 and 2004 APIs' : l.expose === 'none' ? 'no API' : `SCORM ${l.expose} API`) + (l.depth ? `, ${l.depth} frames deep` : '') + (l.opener ? ', in a new window' : '') + (l.resume ? ', resuming saved data' : '') : '—'],
    ['API calls', c.apiCalls ? `${c.apiCalls} (first: ${api[0].call})` : 'none'], ['Requests', `${c.requests}${c.failedRequests ? `, ${c.failedRequests} failed` : ''}`], ['Uncaught errors', c.uncaught]]
  const shown = screens(t).map(d => [esc(short(d.frame)), esc(d.readyState), d.visible, d.media, esc(d.loader ?? ''), esc(d.sample ?? '')])
  const errs = [...t.exceptions.map(e => [((e.t ?? 0) / 1000).toFixed(2), 'uncaught', esc(e.text), esc(where(e.at?.[0]) || short(e.url) + ':' + e.line)]),
    ...(t.caught ?? []).filter(e => !e.uncaught).map(e => [((e.t ?? 0) / 1000).toFixed(2), 'caught', esc(e.text), esc(where(e.at?.[0]))])].sort((a, b) => a[0] - b[0])
  const failed = t.requests.filter(r => r.status >= 400 || r.failed && !r.canceled)
  return `<h2>What happened</h2>${table(['', ''], facts.map(([k, v]) => [`<b>${esc(k)}</b>`, esc(v)]))}
<h2>What the content showed at the end</h2>${table(['Frame', 'State', 'Visible elements', 'Images and media', 'Loading indicator', 'Text'], shown)}
<h2>API calls</h2>${table(['s', 'Call', 'Element', 'Value', 'Result', 'Error'], api.map(a => [((a.t ?? 0) / 1000).toFixed(2), esc(a.call), esc(a.el), `<code>${esc(String(a.value ?? '').slice(0, 300))}</code>`, esc(a.result), a.err ? `<span class="sl-bad">${esc(a.err)}${a.diag ? ': ' + esc(a.diag) : ''}</span>` : '']), 300)}
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

function milestoneHtml(list) {
  return `<h2>Milestones</h2><p class="sl-mono">${list.map(s => `<span class="${s.reached ? '' : 'sl-bad'}" title="${esc(s.evidence)}">${s.reached ? '✓' : '✗'} ${esc(s.label)}</span>`).join(' &nbsp; ')}</p>`
}

// o: { title, subtitle, findings, boot, run (a saved run), analysis, fragment }
export function renderReport(o) {
  const run = o.run, findings = o.findings ?? run?.findings ?? [], v = verdict(findings), c = counts(findings)
  const a = o.analysis, m = a?.manifest
  const pkgTable = a ? `<h2>Package</h2>${table(['', ''], [['Manifest', m ? `SCORM ${m.version}${m.edition ? ' ' + m.edition + ' edition' : ''}` : 'none'], ['Scripts use', a.apiUse === 'none' ? 'no SCORM API names' : a.apiUse === 'both' ? 'both APIs' : 'SCORM ' + a.apiUse],
    ['Made with', a.fingerprints.join(', ') || 'not recognised'], ['Files', `${a.files} (${(a.size / 1048576).toFixed(1)} MB)`], ['Items', (m?.items ?? []).map(i => `${i.title || i.id} (${i.type || '?'})`).join('; ')]].map(([k, x]) => [`<b>${esc(k)}</b>`, esc(x)]))}` : ''
  const body = `<div class="sl"><style>${CSS}</style>
${o.fragment ? '' : `<h1>${esc(o.title ?? 'SCORM Lab report')}</h1>`}${o.subtitle ? `<p class="sl-muted">${esc(o.subtitle)}</p>` : ''}
<div class="sl-verdict"><span class="sl-badge ${v.sev}">${v.sev === 'warn' ? 'warning' : v.sev === 'ok' ? 'ok' : 'error'}</span><b>${esc(v.title)}</b><span class="sl-muted">${c.errors} errors · ${c.warnings} warnings · ${c.info} notes</span></div>
${run?.kind === 'package' ? milestoneHtml(Array.isArray(run.milestones) ? run.milestones : milestones(run.trace, run.boot)) : ''}<h2>Findings</h2>${findingsHtml(findings)}
${run ? runHtml(run) : ''}
${o.boot ?? run?.boot ? `<h2>Loading path</h2>${bootHtml(o.boot ?? run.boot, run?.trace)}` : ''}
${pkgTable}
${o.diff ? diffHtml(o.diff) : ''}
<p class="sl-muted">Made by SCORM Lab on ${esc(new Date().toISOString().slice(0, 16).replace('T', ' '))}. Everything here was worked out on this computer.</p></div>`
  return o.fragment ? body : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(o.title ?? 'SCORM Lab report')}</title><style>${PAGE_CSS}</style></head><body><main>${body}</main></body></html>`
}
