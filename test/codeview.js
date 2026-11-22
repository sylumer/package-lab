// Code views (P4.1): the VLQ decoder and source maps, formatting and its line map, coverage shading, trace markers, links
// and excerpts, the shared UI's copy of the link finder, and the time to open a 2 MB file. Pure: no Electron. Imported by test.js.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { decodeVLQ, decodeMappings, mapUrlOf, parseMap, loadMap, originalAt } from '../src/sourcemap.js'
import { format, kindOf, lineStarts, lineMaps, toFormatted, toOriginal, nwOffsets } from '../src/format.js'
import { codeView, codeViewAsync, isFormatted, charCounts, lineCoverage, siteMarks, evidenceParts, excerptor } from '../src/codeview.js'
import { branchDiff } from '../src/diff.js'
import { renderReport } from '../src/report.js'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const encodeVLQ = n => { let v = n < 0 ? -n * 2 + 1 : n * 2, out = ''; do { let d = v % 32; v = Math.floor(v / 32); if (v) d += 32; out += B64[d] } while (v); return out }
const base = fileURLToPath(new URL('../src/sample/', import.meta.url))

// ---- VLQ and mappings ----
assert.deepEqual(decodeVLQ('A'), [0]); assert.deepEqual(decodeVLQ('C'), [1]); assert.deepEqual(decodeVLQ('D'), [-1])
assert.deepEqual(decodeVLQ('gB'), [16], 'vlq: continuation'); assert.deepEqual(decodeVLQ('AAgBC'), [0, 0, 16, 1], 'vlq: a segment')
assert.deepEqual(decodeVLQ('hB'), [-16]); assert.deepEqual(decodeVLQ(''), [])
for (const n of [0, 1, -1, 15, 16, -16, 31, 32, 1000, -1000, 123456789, -123456789]) assert.deepEqual(decodeVLQ(encodeVLQ(n)), [n], `vlq: round trip ${n}`)
assert.deepEqual(decodeVLQ(['AAAA', 'CAAC'].join('')), [0, 0, 0, 0, 1, 0, 0, 1], 'vlq: values run together')
assert.throws(() => decodeVLQ('A!'), /base64/, 'vlq: not base64'); assert.throws(() => decodeVLQ('g'), /middle/, 'vlq: cut short')
// Fields are relative to the last segment; the generated column starts again at each line; one-field segments are skipped.
const dm = decodeMappings('AAAA,CAAC,E;AACA,CCCC')
assert.deepEqual(Array.from(dm.segs), [0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 2, 2], 'mappings: relative fields, per line')
assert.deepEqual(Array.from(dm.lineStart), [0, 2, 4], 'mappings: line starts')
assert.deepEqual(Array.from(decodeMappings('').segs), [])

// ---- Finding the map ----
const b64 = s => Buffer.from(s).toString('base64')
assert.equal(mapUrlOf('a();\n//# sourceMappingURL=a.js.map'), 'a.js.map'); assert.equal(mapUrlOf('a();\n//@ sourceMappingURL=a.js.map\n'), 'a.js.map')
assert.equal(mapUrlOf('a{}\n/*# sourceMappingURL=a.css.map */'), 'a.css.map', 'map url: css comment'); assert.equal(mapUrlOf('var s = "sourceMappingURL=x"'), null, 'map url: only in a comment')
assert.equal(mapUrlOf('a()'), null)
const MAP = { version: 3, sources: ['src/a.js'], sourcesContent: ['one\ntwo'], mappings: 'AAAA;AACA' }
assert.equal(parseMap(MAP).sources[0].content, 'one\ntwo'); assert.equal(parseMap('{'), null); assert.equal(parseMap({ version: 2 }), null); assert.equal(parseMap({ version: 3, sections: [] }), null, 'map: indexed maps are not read')
assert.equal(parseMap({ ...MAP, sourceRoot: 'r' }).sources[0].name, 'r/src/a.js'); assert.equal(parseMap({ ...MAP, sourcesContent: undefined }).sources[0].content, null, 'map: no sourcesContent')
const inline = `a();\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${b64(JSON.stringify(MAP))}`
assert.equal(loadMap(inline, 'js/a.js').sources[0].name, 'src/a.js', 'map: inline data URL')
assert.equal(loadMap(`a();\n//# sourceMappingURL=data:application/json,${encodeURIComponent(JSON.stringify(MAP))}`, 'a.js').sources.length, 1, 'map: data URL, not base64')
const seen = []
assert.equal(loadMap('a();\n//# sourceMappingURL=maps/a.js.map', 'js/a.js', p => (seen.push(p), JSON.stringify(MAP))).sources.length, 1); assert.deepEqual(seen, ['js/maps/a.js.map'], 'map: a file next to the script')
for (const u of ['https://x.test/a.map', '//x.test/a.map', '../../a.map', '/etc/a.map']) assert.equal(loadMap(`a();\n//# sourceMappingURL=${u}`, 'a.js', () => { throw new Error('read ' + u) }), null, `map: ${u} is not read`)
assert.equal(loadMap('a();\n//# sourceMappingURL=a.map', 'a.js', () => null), null, 'map: file not in the package')
const om = parseMap({ version: 3, sources: ['a'], mappings: 'AAAA,IAAI,KAAK' })   // gen cols 0, 4, 9 → orig cols 0, 4, 9... of line 0
assert.deepEqual(originalAt(om, 0, 5), { source: 0, line: 0, col: 4 }, 'originalAt: the segment at or before'); assert.equal(originalAt(om, 0, 0).col, 0)
assert.equal(originalAt(om, 3, 0), null, 'originalAt: no such line'); assert.equal(originalAt(parseMap({ version: 3, sources: ['a'], mappings: 'IAAA' }), 0, 2), null, 'originalAt: before the first segment')

// ---- The minified fixture with an inline map: the original source at a finding's line ----
const ORIG = ['// math helpers', 'export function add(a, b) {', '  return a + b', '}', '', 'export function sub(a, b) {', '  return a - b', '}', ''].join('\n')
const GEN = 'function add(a,b){return a+b}function sub(a,b){return a-b}add(1,2);'
// [generated text, original line (0-based), original col]
const spots = [['function add', 1, 7], ['return a+b', 2, 2], ['function sub', 5, 7], ['return a-b', 6, 2]]
let prev = [0, 0, 0], enc = ''
for (const [t, ol, oc] of spots) { const g = GEN.indexOf(t); enc += (enc ? ',' : '') + [g - prev[0], 0, ol - prev[1], oc - prev[2]].map(encodeVLQ).join(''); prev = [g, ol, oc] }
// Each segment is relative to the one before; the first generated column is absolute.
const mapJson = JSON.stringify({ version: 3, file: 'math.min.js', sources: ['src/math.js'], sourcesContent: [ORIG], mappings: enc })
const MIN = `${GEN}\n//# sourceMappingURL=data:application/json;base64,${b64(mapJson)}`
const col = t => GEN.indexOf(t) + 1
let v = codeView({ text: MIN, path: 'js/math.min.js', line: 1, col: col('return a-b') })
assert.equal(v.mode, 'mapped', 'fixture: a map with sources shows them'); assert.equal(v.text, ORIG, 'fixture: the original source'); assert.equal(v.target, 7, 'fixture: at the finding’s line')
assert.deepEqual(v.modes, ['formatted', 'original', 'mapped']); assert.deepEqual(v.sources, ['src/math.js'])
assert.equal(codeView({ text: MIN, path: 'js/math.min.js', line: 1, col: col('return a+b') }).target, 3, 'fixture: another place')
assert.equal(codeView({ text: MIN, path: 'js/math.min.js', line: 1, col: col('function add') }).target, 2)
// A finding's evidence → link → view.
const link = evidenceParts('Uncaught: boom at js/math.min.js:1:' + col('return a-b')).find(p => p.path)
assert.deepEqual([link.path, link.line, link.col], ['js/math.min.js', 1, col('return a-b')])
assert.equal(codeView({ text: MIN, path: link.path, line: link.line, col: link.col }).target, 7, 'fixture: evidence link → original line')
// The other modes of the same position.
v = codeView({ text: MIN, path: 'js/math.min.js', line: 1, col: col('return a-b'), mode: 'original' })
assert.equal(v.mode, 'original'); assert.equal(v.target, 1); assert.equal(v.text, MIN)
v = codeView({ text: MIN, path: 'js/math.min.js', line: 1, col: col('return a-b'), mode: 'formatted' })
assert.equal(v.mode, 'formatted'); assert.match(v.text.split('\n')[v.target - 1], /return a - b/, 'fixture: formatted target is the line of the position')
v = codeView({ text: 'a()', path: 'a.js', mode: 'mapped' }); assert.equal(v.mode, 'original'); assert.match(v.note, /no source map/, 'view: a mode that is not there falls back, and says so')
assert.equal(codeView({ text: 'a b', path: 'a.txt', mode: 'formatted' }).mode, 'original', 'view: text files are not formatted')
// A map file in the package, and a map without sources (the original isn't shown, the position still is formatted).
const fileMap = codeView({ text: GEN + '\n//# sourceMappingURL=math.min.js.map', path: 'js/math.min.js', line: 1, col: col('return a-b'), readFile: p => p === 'js/math.min.js.map' ? mapJson : null })
assert.equal(fileMap.mode, 'mapped'); assert.equal(fileMap.target, 7, 'fixture: map file from the package')
const noContent = JSON.stringify({ ...JSON.parse(mapJson), sourcesContent: undefined })
assert.equal(codeView({ text: GEN + '\n//# sourceMappingURL=a.map', path: 'a.js', line: 1, col: 1, readFile: () => noContent, mode: 'auto' }).mode, 'original', 'view: a map without sourcesContent shows nothing from it')

// ---- Formatting and the line map ----
const lesson = readFileSync(base + 'lesson.js', 'utf8'), page = readFileSync(base + 'lesson.html', 'utf8'), css = readFileSync(base + 'style.css', 'utf8')
assert.deepEqual([kindOf('a/b.JS'), kindOf('x.mjs'), kindOf('i.htm'), kindOf('s.css'), kindOf('a.json'), kindOf('a.png')], ['js', 'js', 'html', 'css', null, null])
for (const [text, kind] of [[lesson, 'js'], [page, 'html'], [css, 'css'], [GEN, 'js'], ['var a=1;if(a){b(a)}else{c()}', 'js']]) {
  const f = format(text, kind)
  assert.ok(f.text, `format ${kind}: ${f.error}`)
  assert.equal(f.text.replace(/\s+/g, ''), text.replace(/\s+/g, ''), `format ${kind}: only whitespace changes`)
  // Every character carries over: the original offset's character is the formatted offset's.
  for (let off = 0; off < text.length; off += 7) { const g = toFormatted(f, off); if (!/\s/.test(text[off])) assert.equal(f.text[g], text[off], `format ${kind}: offset ${off} maps to the same character`) }
  assert.equal(toOriginal(f, toFormatted(f, text.search(/\S/))), text.search(/\S/))
}
const f1 = format(GEN, 'js'), lm = lineMaps(GEN, f1)
assert.equal(lm.toF.length, 1); assert.equal(lm.toO.length, f1.text.split('\n').length); assert.ok(lm.toO.every(l => l === 0 || l === -1), 'line map: a one-line file is all line 0')
const f2 = format(lesson, 'js'), lm2 = lineMaps(lesson, f2), fl = f2.text.split('\n'), ol = lesson.split('\n')
assert.equal(lm2.toO.length, fl.length)
for (let i = 0; i < fl.length; i++) if (lm2.toO[i] >= 0) assert.ok(ol[lm2.toO[i]].replace(/\s+/g, '').startsWith(fl[i].replace(/\s+/g, '').slice(0, 8)) || fl[i].trim() === '' || ol[lm2.toO[i]].replace(/\s+/g, '').includes(fl[i].replace(/\s+/g, '').slice(0, 8)), `line map: formatted line ${i + 1} → original ${lm2.toO[i] + 1}`)
assert.equal(lm2.toF[ol.findIndex(l => l.startsWith('function chosen'))] >= 0, true)
// A formatter that changes characters is refused rather than trusted (a template with odd spacing is kept as it is).
assert.ok(format('var s = `a\n   b`', 'js').text, 'format: a template literal keeps its spaces')
assert.match(format('x', 'nope').error, /isn’t formatted/); assert.match(format('x'.repeat(50), 'js', 10).error, /too large/)
assert.ok(nwOffsets('a b\n c').length === 3)

// ---- Coverage shading ----
// V8's ranges for a function and its blocks → a count per character; the innermost range wins.
const cc = charCounts(100, [{ fns: [['f', [0, 100, 1, 10, 20, 0, 12, 14, 5]]] }])
assert.deepEqual([cc[0], cc[10], cc[13], cc[15], cc[20], cc[99]], [1, 0, 5, 0, 1, 1], 'coverage: innermost range wins')
assert.equal(charCounts(10, [{ fns: [] }])[3], -1, 'coverage: no range says nothing'); assert.deepEqual(Array.from(charCounts(4, [{ fns: [['', [0, 99, 2]]] }])), [2, 2, 2, 2], 'coverage: a range past the end is cut')
assert.deepEqual(Array.from(charCounts(4, [{ fns: [['', [0, 4, 0]]] }, { fns: [['', [0, 2, 3]]] }])), [3, 3, 0, 0], 'coverage: ran in any frame counts')
const src3 = 'a\nb\n\nc d'
assert.deepEqual(lineCoverage(src3, lineStarts(src3), charCounts(src3.length, [{ fns: [['', [0, 8, 1, 2, 3, 0, 6, 8, 0]]] }])), [1, 0, -1, -2], 'coverage: ran, didn’t, blank line says nothing, part of a line')
// It matches branchDiff on the base package's lesson.js: the blocks branchDiff reports are shaded ran in one run and not in the other.
const sS = lesson.indexOf('function start()'), sE = lesson.indexOf('function chosen()'), b0 = lesson.indexOf("{ status.textContent = 'No LMS"), b1 = lesson.indexOf('}', b0) + 1
const fnA = ['start', [sS, sE, 1, b0, b1, 0]], fnB = ['start', [sS, sE, 1, lesson.indexOf('var saved'), lesson.indexOf('Object.keys(saved)'), 0]]   // run A skips the no-LMS block, run B skips something else
const ca = charCounts(lesson.length, [{ fns: [['', [0, lesson.length, 1]], fnA] }]), cb = charCounts(lesson.length, [{ fns: [['', [0, lesson.length, 1]], fnB] }])
const diffs = branchDiff(fnA[1], fnB[1])
assert.equal(diffs.length, 2, 'coverage: branchDiff finds both blocks')
for (const d of diffs) for (let i = sS + d.s; i < sS + d.e; i++) assert.deepEqual([ca[i] > 0, cb[i] > 0], [d.inA, d.inB], `coverage: char ${i} agrees with branchDiff`)
// Lines: the no-LMS line is shaded "didn’t run" in A and "ran" in B; formatting doesn't change which characters ran.
const ls = lineStarts(lesson), noLms = lesson.slice(0, b0).split('\n').length - 1, la = lineCoverage(lesson, ls, ca), lb = lineCoverage(lesson, ls, cb)
assert.equal(la[noLms], -2, 'coverage: a line that is partly in the block is partly shaded'); assert.ok(lb[noLms] > 0)
const viewTrace = covs => ({ coverage: covs.map(fns => ({ url: 'lab://run/pkg/lesson.js', fns })) })
const va = codeView({ text: lesson, path: 'lesson.js', line: 1, mode: 'original', trace: viewTrace([[['', [0, lesson.length, 1]], fnA]]) }), vf = codeView({ text: lesson, path: 'lesson.js', line: 1, mode: 'formatted', trace: viewTrace([[['', [0, lesson.length, 1]], fnA]]) })
assert.deepEqual(va.cov, la, 'view: original mode shades the lines'); assert.equal(vf.cov.length, vf.text.split('\n').length)
const fmtF = format(lesson, 'js'), fcounts = new Int32Array(fmtF.text.length).fill(-1)
for (let k = 0; k < fmtF.o.length; k++) fcounts[fmtF.f[k]] = ca[fmtF.o[k]]
assert.deepEqual(vf.cov, lineCoverage(fmtF.text, lineStarts(fmtF.text), fcounts), 'view: formatted mode carries the counts across')
// The no-LMS text is not run in A: its formatted lines are shaded "didn't run".
assert.ok(vf.cov.some((c, i) => c === 0 && /No LMS found/.test(vf.text.split('\n')[i])), 'view: formatted, the block that didn’t run is shaded')
assert.equal(codeView({ text: lesson, path: 'lesson.js', trace: { coverage: [] } }).cov, null); assert.match(codeView({ text: lesson, path: 'lesson.js', trace: { coverage: [{ url: 'lab://run/pkg/other.js', fns: [] }] } }).covNote, /no coverage for this file/)
assert.equal(codeView({ text: page, path: 'lesson.html', trace: { coverage: [{ url: 'lab://run/pkg/lesson.html', fns: [['', [0, 5, 1]]] }] } }).cov, null, 'view: a page’s inline coverage is not mapped')
// In the source-mapped view the coverage is by original line.
const minCov = { coverage: [{ url: 'lab://run/pkg/js/math.min.js', fns: [['', [0, GEN.length, 1]], ['sub', [GEN.indexOf('function sub'), GEN.indexOf('add(1,2)'), 0]]] }] }
v = codeView({ text: MIN, path: 'js/math.min.js', line: 1, col: col('return a-b'), trace: minCov })
assert.deepEqual([v.cov[1], v.cov[2], v.cov[5], v.cov[6], v.cov[0]], [1, 1, 0, 0, -1], 'fixture: coverage by original line')

// ---- Trace markers ----
const sites = [{ file: 'lesson.js', line: 7, col: 3, kind: 'function', text: 'show' }, { file: 'lesson.js', line: 24, col: 7, kind: 'if', text: 'entry === "resume"' }, { file: 'other.js', line: 1, col: 1, kind: 'if', text: 'x' }]
const mt = { sites, exec: [{ frame: 'f', events: [[1, 1, 0, 0], [2, 3, 1, 1], [3, 3, 1, 0], [4, 3, 1, 0], [5, 4, 1, 0, 6], [6, 3, 2, 1], [7, 4, 0, 0, 2]] }] }
assert.deepEqual(siteMarks(mt, 'lesson.js').map(m => [m.kind, m.n, m.t, m.f]), [['function', 3, 0, 0], ['if', 0, 1, 8]], 'markers: counts per site, repeats included')
v = codeView({ text: lesson, path: 'lesson.js', line: 1, mode: 'original', trace: mt })
assert.deepEqual(v.marks, { 7: 'show() called ×3', 24: 'if: true ×1, false ×8' }, 'markers: by line')
v = codeView({ text: lesson, path: 'lesson.js', line: 1, mode: 'formatted', trace: mt })
assert.match(v.text.split('\n')[+Object.keys(v.marks)[0] - 1], /function show/, 'markers: formatted lines'); assert.equal(Object.keys(v.marks).length, 2)
assert.deepEqual(siteMarks({}, 'a.js'), [], 'markers: an untraced run has none')

// ---- Links and excerpts ----
const P = s => evidenceParts(s).filter(p => p.path).map(p => [p.path, p.line, p.col])
assert.deepEqual(P('Uncaught: x is not defined at js/app.js:12:5 and lab://run/pkg/a%20b/c%20d.js:3'), [['js/app.js', 12, 5], ['a b/c d.js', 3, 0]])
assert.deepEqual(P('GET https://cdn.test/lib/x.js:3:4 from (boot.js:9)'), [['boot.js', 9, 0]], 'links: another site’s file is not a link')
assert.deepEqual(P('load.html:2, then style.css:40:1 and data.json:7'), [['load.html', 2, 0], ['style.css', 40, 1], ['data.json', 7, 0]])
assert.deepEqual(P('no links: 12:5, file.js, v1.2:3'), [], 'links: a number alone is not one')
assert.equal(evidenceParts('a js/x.js:1 b').map(p => p.text).join(''), 'a js/x.js:1 b', 'links: the parts give the text back'); assert.deepEqual(evidenceParts(''), [])
// The UI's own copy finds the same links.
const ui = { window: {} }
vm.runInNewContext(readFileSync(new URL('../src/ui/codeview.js', import.meta.url), 'utf8'), ui)
for (const s of ['Uncaught: x at js/app.js:12:5 and lab://run/pkg/a%20b/c%20d.js:3', 'GET https://cdn.test/lib/x.js:3:4 from (boot.js:9)', 'load.html:2, then style.css:40:1', 'nothing', 'a js/x.js:1 b'])
  assert.equal(JSON.stringify(ui.window.CodeView.parts(s)), JSON.stringify(evidenceParts(s)), `links: the UI finds the same in “${s}”`)
// Excerpts: ±20 lines, escaped.
const big = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n'), xs = excerptor(p => p === 'js/big.js' ? big : null)
let parts = xs.parts('boom at js/big.js:50:1 and missing.js:3')
assert.ok(parts[1].id && !parts[3].id, 'excerpt: only a file that is there gets one')
let [xp] = xs.take()
assert.deepEqual([xp.ex.from, xp.ex.to, xp.ex.lines.length, xp.ex.lines.find(l => l.hl).n], [30, 70, 41, 50], 'excerpt: ±20 lines around the line')
assert.equal(xs.parts('js/big.js:50:1').find(p => p.path).id, parts[1].id, 'excerpt: the same place is made once'); assert.equal(xs.take().length, 0)
assert.match(excerptor(() => big).parts('x.js:3')[0].id, /^sl-x-[a-z0-9]+-1$/); assert.equal(excerptor(() => big, { prefix: 'p-' }).parts('x.js:3')[0].id, 'p-1')
const evil = '<b>ok</b>\n<script>alert("x")</script>\n&amp; \'q\'\n', files = new Map([['js/evil.js', Buffer.from(evil)]])
const html = renderReport({ title: 't', findings: [{ sev: 'warn', title: 'Boom', evidence: ['Uncaught at js/evil.js:2:1', 'again js/gone.js:1'], fix: '' }], files })
const xid = /<a href="#(sl-x-[a-z0-9]+-1)">js\/evil\.js:2:1<\/a>/.exec(html)?.[1]
assert.ok(xid, 'report: the evidence is a link'); assert.ok(html.includes(`id="${xid}"`), 'report: the excerpt is embedded')
assert.notEqual(xid, /href="#(sl-x-[a-z0-9]+-1)"/.exec(renderReport({ title: 't', findings: [{ sev: 'warn', title: 'B', evidence: ['js/evil.js:2'], fix: '' }], files }))[1], 'report: ids differ between renders')
assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;') && !html.includes('<script>alert') && !html.includes('<b>ok</b>'), 'report: the excerpt is escaped')
assert.ok(!/href="#sl-x-[a-z0-9]+-2"/.test(html), 'report: no link to a file that isn’t there'); assert.match(html, /<div class="hl"><span class="sl-ln">2<\/span>&lt;script&gt;/, 'report: the line is marked')
assert.ok(!renderReport({ title: 't', findings: [{ sev: 'warn', title: 'Boom', evidence: ['at js/evil.js:2:1'], fix: '' }] }).includes('sl-x-'), 'report: without the files it is as before')
// A minified file's excerpt is the formatted text, or the original source when there is a map.
const minRep = renderReport({ title: 't', findings: [{ sev: 'warn', title: 'Boom', evidence: [`at js/math.min.js:1:${col('return a-b')}`], fix: '' }], files: new Map([['js/math.min.js', Buffer.from(MIN)]]) })
assert.match(minRep, /source: src\/math\.js/, 'report: a mapped excerpt says where it is from'); assert.match(minRep, /return a - b/)
// A saved run's own sources are used when the files aren't given.
const runRep = renderReport({ title: 't', run: { kind: 'package', findings: [{ sev: 'warn', title: 'Boom', evidence: ['at a.js:1'], fix: '' }], milestones: [], trace: { sources: { 'lab://run/pkg/a.js': 'one()' }, probe: [], requests: [], exceptions: [], caught: [], duration: 0 } } })
assert.match(runRep, /href="#sl-x-[a-z0-9]+-1"/, 'report: a run’s recorded sources')
assert.ok(!renderReport({ title: 't', findings: [{ sev: 'warn', title: 'Boom', evidence: ['at js/evil.js:2:1'], fix: '' }], files, excerpts: false }).includes('sl-x-'), 'report: excerpts: false leaves out excerpts and links')
// A run that was changed shows the changed file.
const ovRep = renderReport({ title: 't', files, run: { kind: 'package', launch: { options: { files: { 'js/evil.js': { content: 'one\nCHANGED\n' } } } }, findings: [{ sev: 'warn', title: 'Boom', evidence: ['at js/evil.js:2'], fix: '' }], milestones: [], trace: { sources: {}, probe: [], requests: [], exceptions: [], caught: [], duration: 0 } } })
assert.ok(ovRep.includes('CHANGED') && !ovRep.includes('alert'), 'report: excerpts use the run’s changed file')

// ---- Time to open a 2 MB file ----
const readable = Array.from({ length: 33000 }, (_, i) => `function f${i}(a, b) { if (a > ${i}) { return b } return a + ${i} }`).join('\n')
const dense = Array.from({ length: 22000 }, (_, i) => `function f${i}(a,b){var c=a+b;if(c>${i}){return c*2}else{for(var k=0;k<3;k++){c+=k}}return"x"+c}`).join('')
const covs = [{ url: 'lab://run/pkg/big.js', fns: [['', [0, readable.length, 1]], ...Array.from({ length: 3000 }, (_, i) => ['f' + i, [i * 40, i * 40 + 30, i % 2, i * 40 + 10, i * 40 + 20, 0]])] }]
const time = fn => { const t = performance.now(); const r = fn(); return [r, Math.round(performance.now() - t)] }
let r, ms
;[r, ms] = time(() => codeView({ text: readable, path: 'big.js', line: 30000, col: 1, trace: { coverage: covs } }))
console.log(`code view: ${(readable.length / 1e6).toFixed(1)} MB, ${readable.split('\n').length} lines, opened in ${ms} ms (with coverage)`)
assert.ok(ms < 300, `a 2 MB file opens in under 300 ms (took ${ms})`); assert.equal(r.target, 30000); assert.ok(r.cov.length === 33000)
;[r, ms] = time(() => codeView({ text: dense, path: 'big.min.js', line: 1, col: 1000 }))
console.log(`code view: ${(dense.length / 1e6).toFixed(1)} MB minified, opened in ${ms} ms, then formatted: later = ${r.later}`)
assert.ok(ms < 300, `a 2 MB minified file opens in under 300 ms (took ${ms})`); assert.equal(r.later, 'formatted', 'a big minified file is formatted in a second step'); assert.equal(r.mode, 'original')
;[r, ms] = time(() => codeView({ text: dense, path: 'big.min.js', line: 1, col: 1000, mode: 'formatted' }))
console.log(`code view: formatting and the line map for ${(dense.length / 1e6).toFixed(1)} MB took ${ms} ms (${r.text.split('\n').length} lines)`)
assert.ok(ms < 3000, `formatting a 2 MB file is bounded (took ${ms})`); assert.match(r.text.split('\n')[r.target - 1], /f\d+|var|return|for|if/)
;[, ms] = time(() => codeView({ text: dense, path: 'big.min.js', line: 1, col: 1000 }))
assert.ok(ms < 300 && codeView({ text: dense, path: 'big.min.js', line: 1, col: 1000 }).mode === 'formatted', 'once formatted, the file opens formatted at once')

// ---- Caches, the worker, limits ----
// A formatted result is only reused for the same text (not for another with the same hash and length), and the cache is bounded.
const t1 = 'var a=1;if(a){b()}'.repeat(2000), t2 = t1.slice(0, -1) + ' '
assert.ok(!isFormatted(t1, 'js')); codeView({ text: t1, path: 'c.js', mode: 'formatted' }); assert.ok(isFormatted(t1, 'js') && !isFormatted(t2, 'js'), 'cache: another text isn’t a hit')
const before = codeView({ text: t1, path: 'c.js', mode: 'formatted' }).text
assert.equal(codeView({ text: t1, path: 'c.js', mode: 'formatted' }).text, before, 'cache: a hit gives the same text')
for (let i = 0; i < 5; i++) codeView({ text: dense.slice(0, 1.5e6).replace(/f(\d+)/g, `g${i}$1`), path: 'd.js', mode: 'formatted' })
assert.ok(!isFormatted(t1, 'js'), 'cache: older results are dropped past 60 MB')
// The worker gives what the plain function gives, and a map's decoding is cached.
const wk = { text: dense, path: 'big.min.js', line: 1, col: 1000, mode: 'formatted' }
const viaWorker = await codeViewAsync(wk), plain = codeView(wk)
assert.ok(viaWorker.text === plain.text && viaWorker.target === plain.target && viaWorker.mode === 'formatted', 'worker: the same view as the plain function')
const bigMap = JSON.stringify({ version: 3, sources: ['a.js'], sourcesContent: ['x'], mappings: 'AAAA' + ';AAAA'.repeat(10000) }), bigText = 'a();'.repeat(10000) + `\n//# sourceMappingURL=data:application/json;base64,${b64(bigMap)}`
const mv = await codeViewAsync({ text: bigText, path: 'a.js', line: 1, col: 1, mode: 'mapped' })
assert.equal(mv.mode, 'mapped', 'worker: a big map is decoded off the thread'); assert.equal(loadMap(bigText, 'a.js'), loadMap(bigText, 'a.js'), 'map: decoded once per file')
assert.equal(parseMap({ version: 3, sources: ['a'], mappings: 'A'.repeat(5e6 + 1) }), null, 'map: mappings over 5 MB are refused')
assert.match(format('x'.repeat(5e6 + 1), 'js').error, /too large/, 'format: over 5 MB is refused')
