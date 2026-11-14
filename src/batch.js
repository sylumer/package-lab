// Batch checks (P4.3): every package in a folder, one row each. The rows, the table, the CSV and the HTML summary are pure;
// checkPackage reads one file and staticRows checks many in worker threads (batchworker.js). The CLI runs the packages
// with --run as child processes and merges each run in with runRow. See docs/developer-guide.md.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { basename, join, resolve } from 'node:path'

const WORKER_MB = 1024   // a worker's old-generation heap limit: a package that needs more (a zip bomb, say) fails its row
import { unzip } from './zip.js'
import { analyze } from './analyze.js'
import { bootGraph } from './bootpath.js'
import { staticFindings, sortFindings } from './rules.js'
import { renderReport, verdict, counts, esc } from './report.js'
import { furthest } from './milestones.js'

// Text from a package (names, findings) may hold control characters: drop them before it's shown or written (tab stays).
const clean = s => String(s ?? '').replace(/[\x00-\x08\x0a-\x1f\x7f]/g, '')
export const SEV_LABEL = { ok: 'OK', warn: 'Warning', error: 'Error', failed: 'Failed' }
const columns = run => ['Package', 'SCORM version', 'Tool', 'Verdict', 'Errors', 'Warnings', ...(run ? ['Furthest milestone'] : []), 'Note']
const cells = (r, run) => [r.package, r.scorm ?? '', r.tool, SEV_LABEL[r.verdict] ?? r.verdict, r.errors, r.warnings, ...(run ? [r.furthest ?? ''] : []), r.note]

// A row for a package that couldn't be checked: its error is the note.
export const failedRow = (path, why) => ({ package: clean(basename(path)), path: resolve(path), scorm: null, tool: '', verdict: 'failed', note: clean(`Couldn’t open it: ${why}`), errors: 0, warnings: 0, furthest: null })

// The default item is the first SCO, else the first with something to launch (as `scorm-lab analyze` checks it). Returns { row, fragment }:
// the row, and with fragment: true the package's report as an HTML fragment (renderReport). Never throws: a package it can't read is a failed row.
export function checkPackage(path, { fragment = false } = {}) {
  try {
    const files = unzip(readFileSync(path)), a = analyze(files, { tool: null }), m = a.manifest
    const list = (m?.items ?? []).filter(i => i.res)
    const item = list.find(i => i.type === 'sco') ?? list[0] ?? null
    const boot = item?.res.path ? bootGraph(files, item.res.path) : null
    const findings = sortFindings([...staticFindings(a), ...(boot?.risks ?? [])])
    const v = verdict(findings), c = counts(findings), name = clean(basename(path))
    const row = { package: name, path: resolve(path), scorm: m ? m.version + (m.edition ? ` ${m.edition} edition` : '') : null, tool: a.fingerprints.join(', '),
      verdict: v.sev, note: clean(v.title), errors: c.errors, warnings: c.warnings, furthest: null }
    if (!fragment) return { row }
    const subtitle = item ? `${item.title || item.id} (${item.res.path ?? item.res.href}), from the files only. Run it to see what actually happens.` : 'No item to launch. From the files only.'
    return { row, fragment: renderReport({ title: `SCORM Lab: ${name}`, subtitle, findings, boot, analysis: a, files, fragment: true }) }
  } catch (e) {
    return { row: failedRow(path, e.message) }
  }
}

// Checks many packages: up to `jobs` worker threads (capped at the machine's parallelism), each taking the next package when it is
// free. Results are in the order of the files: [{ row, fragment }]. Each worker has one permanent error and exit handler, so a
// worker that dies (crash, out of memory: resourceLimits) fails the package it was checking, and its lane starts a new worker.
// A lane that throws stops the whole batch: every worker is terminated and the error is rethrown.
export async function staticRows(files, { jobs = 1, fragment = false } = {}) {
  const out = new Array(files.length), live = new Set()
  let next = 0, aborted = false
  const spawn = () => {
    const x = { w: new Worker(new URL('./batchworker.js', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: WORKER_MB } }), dead: false, pending: null }
    const die = why => { x.dead = true; const p = x.pending; x.pending = null; p?.bad(new Error(why)) }
    x.w.on('message', m => { const p = x.pending; x.pending = null; p?.ok(m) })
    x.w.on('error', e => die(e.message))
    x.w.on('exit', code => die(`the check stopped (${code})`))
    live.add(x)
    return x
  }
  const retire = x => { x.w.terminate(); live.delete(x) }
  const lane = async () => {
    let x = spawn()
    try {
      while (!aborted && next < files.length) {
        const i = next++
        if (x.dead) { retire(x); x = spawn() }
        try {
          out[i] = await new Promise((ok, bad) => { x.pending = { ok, bad }; x.w.postMessage({ path: files[i], fragment }) })
        } catch (e) { out[i] = { row: failedRow(files[i], e.message) }; retire(x); x = spawn() }
      }
    } finally { retire(x) }
  }
  try {
    await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, files.length)) }, lane))
  } catch (e) {
    aborted = true
    for (const x of live) retire(x)
    throw e
  }
  return out
}

// The row of a package after a run (its run JSON from `scorm-lab run --json`): the run's verdict and counts, and the furthest milestone.
export function runRow(row, json) {
  return { ...row, verdict: json.verdict.sev, note: clean(json.verdict.title), errors: json.counts.errors, warnings: json.counts.warnings, furthest: furthest(json.milestones ?? [])?.label ?? null }
}
// A package whose run didn't finish keeps its static row, marked failed with the reason.
export const failedRun = (row, why) => ({ ...row, verdict: 'failed', note: clean(`The run didn’t finish: ${why}`), furthest: null })

// The packages named: a folder gives its .zip files (its subfolders too with recursive); anything else is taken as a package path,
// so a missing one becomes a failed row. Symbolic links to folders are not followed: they are skipped, and onSkip(path) is told of each.
export function batchFiles(inputs, { recursive = false, onSkip } = {}) {
  const out = []
  const isDir = p => { try { return statSync(p).isDirectory() } catch { return false } }
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
      if (e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      if (e.isSymbolicLink() ? isDir(p) : e.isDirectory()) {
        if (e.isSymbolicLink()) onSkip?.(p)
        else if (recursive) walk(p)
      } else if (/\.zip$/i.test(e.name)) out.push(p)
    }
  }
  for (const p of inputs) {
    if (isDir(p)) walk(p)
    else out.push(p)
  }
  return out
}

export function batchSummary(rows) {
  const n = k => rows.filter(r => r.verdict === k).length
  return { packages: rows.length, ok: n('ok'), warnings: n('warn'), errors: n('error'), failed: n('failed') }
}
export const summaryText = s => `${s.packages} packages: ${s.ok} OK, ${s.warnings} with warnings, ${s.errors} with errors, ${s.failed} failed.`

// The table as rows of text, the header first. The same columns in the terminal, the CSV and the HTML summary.
export const batchTable = (rows, run = false) => [columns(run), ...rows.map(r => cells(r, run).map(c => String(c)))]

// A CSV cell: quoted when it has a comma or a quote; a cell that starts with = + - @ (or a tab) gets a leading apostrophe, so a
// spreadsheet shows it as text and doesn't run it as a formula.
const guard = s => /^[=+\-@\t]/.test(s) ? `'${s}` : s
export const csvCell = v => { const s = guard(clean(v)); return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export const batchCsv = (rows, { run = false } = {}) => batchTable(rows, run).map(l => l.map(csvCell).join(',')).join('\r\n') + '\r\n'

const PAGE_CSS = `:root { --bg: #fff; --fg: #1d1d1f; --muted: #6e6e73; --line: #d9d9de; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #1c1c1e; --fg: #f2f2f7; --muted: #98989f; --line: #3a3a3c; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 16px; } h1 { font-size: 20px; margin: 8px 0 2px; }
.muted { color: var(--muted); } .scroll { overflow-x: auto; } table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { text-align: left; vertical-align: top; padding: 4px 6px; border-bottom: 1px solid var(--line); word-break: break-word; }
details { margin: 12px 0; } summary { cursor: pointer; font-weight: 600; }`

// items: [{ row, fragment }] in table order (fragment is the package's report; a failed row has none). The summary table links each
// package to its section, which is collapsed.
export function batchHtml(items, { folder = '', run = false } = {}) {
  const rows = items.map(i => i.row)
  const head = columns(run).map(c => `<th>${esc(c)}</th>`).join('')
  const body = items.map(({ row, fragment }, i) => `<tr>${cells(row, run).map((c, k) => `<td>${k === 0 && fragment !== undefined ? `<a href="#pkg-${i + 1}">${esc(c)}</a>` : esc(c)}</td>`).join('')}</tr>`).join('')
  const sections = items.map(({ row, fragment }, i) => fragment === undefined ? '' : `<details id="pkg-${i + 1}"><summary>${esc(row.package)} · ${esc(SEV_LABEL[row.verdict])}</summary>${fragment}</details>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SCORM Lab: batch check</title><style>${PAGE_CSS}</style></head><body><main>
<h1>SCORM Lab: batch check</h1><p class="muted">${esc(folder)} · ${esc(summaryText(batchSummary(rows)))} · ${run ? 'with runs' : 'from the files alone'}</p>
<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
${sections}
<p class="muted">Made by SCORM Lab on ${esc(new Date().toISOString().slice(0, 16).replace('T', ' '))}. Everything here was worked out on this computer.</p></main></body></html>`
}
