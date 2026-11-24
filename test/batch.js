// Batch checks (P4.3), unit tests: the CSV cells and the formula guard, the summary, the rows after a run, the HTML's escaping,
// the folder listing and a package that can't be read. Pure apart from temporary files; imported by test.js.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { batchFiles, batchCsv, batchHtml, batchSummary, batchTable, csvCell, checkPackage, runRow, failedRun, summaryText } from '../src/batch.js'

// CSV: quoting, the formula guard (= + - @ and a tab get an apostrophe), control characters dropped.
assert.equal(csvCell('plain'), 'plain')
assert.equal(csvCell('a,b'), '"a,b"')
assert.equal(csvCell('say "hi"'), '"say ""hi"""')
assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`, 'a formula with quotes is guarded and quoted')
assert.equal(csvCell('+1'), "'+1")
assert.equal(csvCell('-x'), "'-x")
assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)")
assert.equal(csvCell('\tcmd'), "'\tcmd")
assert.equal(csvCell('a\x1b[31mb'), 'a[31mb', 'control characters are dropped')
assert.equal(csvCell(2), '2'); assert.equal(csvCell(null), '')
assert.equal(csvCell('a-b'), 'a-b', 'a sign inside a cell is not guarded')

const rowOf = (over = {}) => ({ package: 'a.zip', path: '/x/a.zip', scorm: '1.2', tool: 'Articulate', verdict: 'ok', note: 'No problems found', errors: 0, warnings: 0, furthest: null, ...over })
const rows = [rowOf(), rowOf({ package: 'b.zip', verdict: 'error', note: 'Capitals', errors: 2, warnings: 1 }), rowOf({ package: 'c.zip', verdict: 'failed', note: 'Couldn’t open it: x', scorm: null, tool: '' })]

assert.deepEqual(batchSummary(rows), { packages: 3, ok: 1, warnings: 0, errors: 1, failed: 1 })
assert.equal(summaryText(batchSummary(rows)), '3 packages: 1 OK, 0 with warnings, 1 with errors, 1 failed.')

// The CSV has the same columns as the table; the furthest milestone column only with --run.
assert.equal(batchCsv(rows).split('\r\n')[0], 'Package,SCORM version,Tool,Verdict,Errors,Warnings,Note')
assert.equal(batchCsv(rows, { run: true }).split('\r\n')[0], 'Package,SCORM version,Tool,Verdict,Errors,Warnings,Furthest milestone,Note')
assert.equal(batchCsv(rows).split('\r\n')[2], 'b.zip,1.2,Articulate,Error,2,1,Capitals', 'CSV row for an error')
assert.equal(batchCsv(rows).split('\r\n').at(-1), '', 'CSV ends with a line break')
assert.equal(batchTable(rows)[2][3], 'Error', 'table verdict label')
assert.equal(batchTable(rows)[3][3], 'Failed')
assert.equal(batchCsv([rowOf({ package: '=evil.zip', note: 'a, "b"' })]).split('\r\n')[1], `'=evil.zip,1.2,Articulate,OK,0,0,"a, ""b"""`, 'CSV row with a guarded name and a quoted note')

// After a run: the run's verdict and counts, and the furthest milestone's label. A run that doesn't finish is failed, with the reason.
const run = { verdict: { sev: 'warn', title: 'Stalled at Scripts' }, counts: { errors: 0, warnings: 1 }, milestones: [
  { id: 'launched', label: 'Launch page loaded', reached: true }, { id: 'scripts', label: 'Scripts loaded', reached: true }, { id: 'shown', label: 'Content shown', reached: false }] }
assert.deepEqual(runRow(rowOf(), run), rowOf({ verdict: 'warn', note: 'Stalled at Scripts', errors: 0, warnings: 1, furthest: 'Scripts loaded' }))
assert.equal(runRow(rowOf(), { ...run, milestones: null }).furthest, null, 'no milestones: no furthest')
assert.equal(failedRun(rowOf(), 'exit 2').verdict, 'failed'); assert.match(failedRun(rowOf(), 'exit 2').note, /The run didn’t finish: exit 2/)

// HTML: the names and notes are escaped; a row with a section links to it, a failed row has none.
const html = batchHtml([{ row: rowOf({ package: '<img src=x onerror=alert(1)>.zip' }), fragment: '<div class="sl">section</div>' }, { row: rows[2] }], { folder: 'F & G' })
assert.ok(!html.includes('<img src=x'), 'a package name is escaped'); assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;.zip'))
assert.match(html, /<a href="#pkg-1">/); assert.ok(html.includes('<details id="pkg-1">') && !html.includes('pkg-2'), 'only a readable package has a section')
assert.ok(html.includes('F &amp; G') && html.includes('<div class="sl">section</div>'), 'the folder is escaped; a fragment goes in as it is')

// Folders: the zips of a folder (sorted; subfolders only with recursive); anything that isn't a folder is taken as a package path.
{
  const dir = mkdtempSync(join(tmpdir(), 'package-lab-batch-unit-'))
  mkdirSync(join(dir, 'sub')); mkdirSync(join(dir, '.hidden'))
  for (const f of ['b.zip', 'a.ZIP', 'notes.txt', 'sub/c.zip', '.hidden/d.zip']) writeFileSync(join(dir, f), 'x')
  assert.deepEqual(batchFiles([dir]).map(p => p.slice(dir.length + 1).replaceAll(sep, "/")), ['a.ZIP', 'b.zip'], 'a folder: its zips, sorted, no hidden folders')
  assert.deepEqual(batchFiles([dir], { recursive: true }).map(p => p.slice(dir.length + 1).replaceAll(sep, "/")), ['a.ZIP', 'b.zip', 'sub/c.zip'])
  assert.deepEqual(batchFiles([join(dir, 'missing.zip')]), [join(dir, 'missing.zip')], 'a missing package is kept (a failed row)')
}

// Symbolic links to folders are skipped (and reported), even with recursive; a link to a zip is checked.
{
  const dir = mkdtempSync(join(tmpdir(), 'package-lab-batch-link-'))
  mkdirSync(join(dir, 'real')); writeFileSync(join(dir, 'real', 'inner.zip'), 'x'); writeFileSync(join(dir, 'one.zip'), 'x')
  symlinkSync(join(dir, 'real'), join(dir, 'linkdir')); symlinkSync(join(dir, 'one.zip'), join(dir, 'linkzip.zip'))
  const skipped = []
  const got = batchFiles([dir], { recursive: true, onSkip: p => skipped.push(p) }).map(p => p.slice(dir.length + 1).replaceAll(sep, "/"))
  assert.deepEqual(got, ['linkzip.zip', 'one.zip', 'real/inner.zip'], 'a symlink to a folder is not followed; a symlink to a zip is listed')
  assert.deepEqual(skipped, [join(dir, 'linkdir')], 'the skipped link is reported')
}

// A package that can't be read is a failed row, not an error: a file that isn't a ZIP, and a missing one.
{
  const dir = mkdtempSync(join(tmpdir(), 'package-lab-batch-bad-'))
  const bad = join(dir, 'broken.zip'); writeFileSync(bad, 'not a zip')
  const r = checkPackage(bad), gone = checkPackage(join(dir, 'gone.zip'))
  assert.equal(r.row.verdict, 'failed'); assert.match(r.row.note, /^Couldn’t open it: /); assert.equal(r.row.package, 'broken.zip')
  assert.equal(r.fragment, undefined); assert.equal(gone.row.verdict, 'failed', 'a missing file is a failed row too')
}

console.log('batch: unit ok')
