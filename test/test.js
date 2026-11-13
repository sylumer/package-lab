// Tests: unit checks of the pure parts, then (skipped with --unit) end-to-end checks in Electron: the CLI's analyze,
// run and report on six fixture packages, live input, the web interface, and the Concierge module if it's next to
// this repo (../concierge/modules/scorm-lab). Fixtures are built from test/fixtures/base, the sample SCORM 1.2
// package from toolbox. See docs/developer-guide.md.
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzip } from '../src/zip.js'
import { analyze, pkgPath } from '../src/analyze.js'
import { matchByPath, branchDiff, compare, segs } from '../src/diff.js'
import { staticFindings, runFindings, launchFindings } from '../src/rules.js'
import { bootGraph, resolveRef } from '../src/bootpath.js'
import { renderReport, verdict } from '../src/report.js'
import { normaliseOptions, cliCommand } from '../src/options.js'
import { PRESETS, planVariants, runResult, summarise, experimentFindings } from '../src/experiments.js'
import { diffLines, unified } from '../src/textdiff.js'
import { isText, entryFor, entryBuffer, overlayFiles, overrideList, overrideFinding, overrideProgressFinding } from '../src/overlay.js'
import { pinPathProblem, matcher, answerFor, buildAnswer, pinPrefix, userAgentPin, lexicalDeclaration, pinFindings, parsePinFlag, parseAnswerFlag } from '../src/pins.js'
import { STEPS, milestones, furthest, firstMissing, milestoneFinding, progress, runCounts } from '../src/milestones.js'
import { probeBody, shapePrefix, requestPattern, serverRequests, sourceHint, shapeReads, inferShape, discover, discoverFindings, checkDiscover } from '../src/shape.js'
import { servedBody } from '../src/pins.js'
import { instrument, instrumentHtml, restoreTrace, lastEvents, show, traceFindings } from '../src/instrument.js'
import vm from 'node:vm'

const base = new URL('./fixtures/base/', import.meta.url).pathname, work = mkdtempSync(join(tmpdir(), 'scorm-lab-'))
function fixture(name, edit = () => {}) {
  const dir = join(work, name)
  cpSync(base, dir, { recursive: true })
  edit(dir)
  execFileSync('zip', ['-qr', join(work, name + '.zip'), '.'], { cwd: dir })
  return join(work, name + '.zip')
}
const sub = (dir, file, a, b) => writeFileSync(join(dir, file), readFileSync(join(dir, file), 'utf8').replace(a, b))

// good: as is. mismatch: the manifest says 2004, the content uses 1.2. hosted: content that asks its platform for
// its configuration at /api/player/config and, without it, falls back to its own API object (a "preview" shim).
const good = fixture('good')
const mismatch = fixture('mismatch', d => {
  sub(d, 'imsmanifest.xml', '<schemaversion>1.2</schemaversion>', '<schemaversion>2004 4th Edition</schemaversion>')
  sub(d, 'imsmanifest.xml', 'adlcp_rootv1p2', 'adlcp_v1p3')
})
const hosted = fixture('hosted', d => {
  writeFileSync(join(d, 'boot.js'), `
var previewMode = false
function startCourse() { if (window.scorm) scorm.start() }
fetch('/api/player/config').then(function (r) { if (!r.ok) throw new Error('no config'); return r.json() })
  .then(function () { startCourse() })
  .catch(function () {
    previewMode = true
    window.API = { LMSInitialize: function () { return 'true' }, LMSGetValue: function () { return '' }, LMSSetValue: function () { return 'true' },
      LMSCommit: function () { return 'true' }, LMSFinish: function () { return 'true' }, LMSGetLastError: function () { return '0' } }
    startCourse()
  })
`)
  sub(d, 'lesson.html', /<script/, '<script src="boot.js"></script><script')
  sub(d, 'lesson.js', /scorm\.start\(\)/g, 'true')
})

// blank: the launch page has nothing of its own and is built by a script referenced with the wrong capitals.
// order: an inline script uses the SCORM wrapper before its deferred script has run. loader: a loading screen that
// waits for a broken config file, and code that would load another script but never runs.
const blank = fixture('blank', d => {
  mkdirSync(join(d, 'js'))
  writeFileSync(join(d, 'js', 'App.js'), "document.body.innerHTML = '<h1>Built by App.js</h1>'")
  writeFileSync(join(d, 'lesson.html'), '<!doctype html><html><head><script src="scorm.js"></script><script src="js/app.js"></script><script src="vendor/missing.js"></script></head><body></body></html>')
})
const order = fixture('order', d => sub(d, 'lesson.html', '<script src="scorm.js"></script>', '<script>scorm.start()</script><script src="scorm.js" defer></script>'))
const loader = fixture('loader', d => {
  mkdirSync(join(d, 'js')); mkdirSync(join(d, 'data'))
  writeFileSync(join(d, 'data', 'config.json'), '{ "start": true, }')
  writeFileSync(join(d, 'js', 'next.js'), "document.body.textContent = 'next'")
  writeFileSync(join(d, 'js', 'boot.js'), `
function later() { var s = document.createElement('script'); s.src = 'js/next.js'; document.head.appendChild(s) }
fetch('data/config.json').then(function (r) { return r.text() }).then(function (t) { var c = JSON.parse(t); if (c.start) later() })
`)
  writeFileSync(join(d, 'lesson.html'), '<!doctype html><html><head><script src="scorm.js"></script><script src="js/boot.js"></script></head><body><div id="loading" class="spinner" style="width:80px;height:80px;background:#ccc">Loading</div></body></html>')
})

// gated: the lesson only starts if window.startOK is set, which nothing sets. Overriding lesson.js to drop the test fixes it.
const gated = fixture('gated', d => sub(d, 'lesson.js', /\nstart\(\)\s*$/, '\nif (window.startOK) start()\n'))
const gatedFix = join(work, 'lesson-fixed.js')
writeFileSync(gatedFix, readFileSync(join(work, 'gated', 'lesson.js'), 'utf8').replace('if (window.startOK) start()', 'start()'))

// pinned: a mode flag the content sets itself (a pin holds it), a settings object, a frozen object, and the user agent.
// lexical: the same flag declared with let, which a pin can't replace.
const pinned = fixture('pinned', d => {
  writeFileSync(join(d, 'boot.js'), `
var previewMode = true
var config = { mode: 'preview' }
var locked = Object.freeze({ a: 1 })
console.log('PINNED mode=' + config.mode + ' preview=' + previewMode + ' ua=' + navigator.userAgent)
config.mode = 'set by the content'
addEventListener('load', function () { if (!previewMode) scorm.start() })
`)
  sub(d, 'lesson.html', /<script/, '<script src="boot.js"></script><script')
  sub(d, 'lesson.js', /scorm\.start\(\)/g, 'true')
})
const lexical = fixture('lexical', d => {
  writeFileSync(join(d, 'boot.js'), "let previewMode = true\naddEventListener('load', function () { if (!previewMode) scorm.start() })\n")
  sub(d, 'lesson.html', /<script/, '<script src="boot.js"></script><script')
  sub(d, 'lesson.js', /scorm\.start\(\)/g, 'true')
})

// needs: content that fetches its configuration from /api/player/config and only starts with it. Discovery has to
// find cfg.lms.enabled (a truthiness test), cfg.lms.version (compared with '2004') and cfg.assets.base (joined to text).
const NEEDS_BOOT = `fetch('/api/player/config').then(function (r) { if (!r.ok) throw new Error('no config'); return r.json() }).then(function (cfg) {
  var media = cfg.assets.base + 'media/'
  if (cfg.lms.enabled) {
    if (cfg.lms.version === '2004') console.log('wants SCORM 2004')
  }
  document.getElementById('status').setAttribute('data-media', media)
  start()
}).catch(function (e) { document.getElementById('status').textContent = 'Couldn’t load the player configuration: ' + e.message })
`
const needs = fixture('needs', d => {
  writeFileSync(join(d, 'boot.js'), NEEDS_BOOT)
  sub(d, 'lesson.html', '<script src="lesson.js" defer></script>', '<script src="lesson.js" defer></script><script src="boot.js" defer></script>')
  sub(d, 'lesson.js', /\nstart\(\)\s*$/, '\n')
})

// ---- Unit ----
const files = unzip(readFileSync(good))
assert.ok(files.has('imsmanifest.xml') && files.has('lesson.js'), 'zip lists files')
assert.match(files.get('lesson.html').toString(), /<html/i, 'zip inflates')
assert.equal(pkgPath('a/b/', '../c/d.html?x=1#y'), 'a/c/d.html')
assert.equal(pkgPath('', 'https://x.test/a'), null)

const ag = analyze(files)
assert.equal(ag.manifest.version, '1.2'); assert.equal(ag.apiUse, '1.2')
assert.deepEqual(ag.fingerprints, [], 'no false fingerprints (querySelectorAll isn’t Lectora)')
assert.ok(!staticFindings(ag).some(f => f.sev === 'error'), 'good package has no static errors')
const am = analyze(unzip(readFileSync(mismatch)))
assert.equal(am.manifest.version, '2004')
assert.ok(staticFindings(am).some(f => /says SCORM 2004, but the scripts use the SCORM 1.2/.test(f.title)), 'version mismatch found statically')
const ah = analyze(unzip(readFileSync(hosted)))
assert.ok(staticFindings(ah).some(f => /root of the server/.test(f.title)), 'server path found statically')
assert.ok(staticFindings(ah).some(f => /mode switches/.test(f.title)), 'mode switch found statically')
assert.ok(staticFindings(ah).some(f => /create their own SCORM API/.test(f.title)), 'own API object found statically')

assert.deepEqual(segs('lab://run/pkg/js/app.js'), ['js', 'app.js'])
const m = matchByPath([{ url: 'https://h.test/content/abc/js/app.js' }, { url: 'https://h.test/x.js' }], [{ url: 'lab://run/pkg/lib/app.js' }, { url: 'lab://run/pkg/js/app.js' }])
assert.equal(m[0].url, 'lab://run/pkg/js/app.js', 'longest common suffix wins'); assert.equal(m[1], null)

// V8 ranges: function 0-100 ran; in A the block 10-20 didn't run, in B the block 30-40 didn't.
const bd = branchDiff([0, 100, 1, 10, 20, 0], [0, 100, 1, 30, 40, 0])
assert.deepEqual(bd.map(d => [d.s, d.inA, d.inB]), [[10, false, true], [30, true, false]])
// Nested: B lists 10-50 as not run, with 20-30 inside it run; A ran all of it.
assert.deepEqual(branchDiff([0, 100, 1], [0, 100, 1, 10, 50, 0, 20, 30, 1]).map(d => [d.s, d.inA, d.inB]), [[10, true, false]])

const trace = (o = {}) => ({ requests: [], scripts: [], exceptions: [], caught: [], log: [], probe: [], coverage: [], ...o })
assert.ok(runFindings(trace(), { kind: 'package', itemType: 'sco', expose: '1.2' }).some(f => /never looked for the SCORM API/.test(f.title)))
assert.ok(runFindings(trace({ probe: [{ type: 'lookup', name: 'API', found: false, frame: 'lab://run/pkg/a.html' }] }), { kind: 'package', itemType: 'sco', expose: '2004' })
  .some(f => /looked for API and found nothing/.test(f.title) && /disagree on the SCORM version/.test(f.detail)))
const cmp = compare(trace({ requests: [{ t: 5, url: 'https://h.test/c/api/config', method: 'GET', status: 200 }, { t: 1, url: 'https://h.test/c/a.js', method: 'GET', status: 200 }] }),
  trace({ requests: [{ t: 1, url: 'lab://run/pkg/a.js', method: 'GET', status: 200 }] }))
assert.equal(cmp.requests.onlyRef.length, 1); assert.equal(cmp.firstDivergence.kind, 'request')
assert.deepEqual(resolveRef('a/b', '../c.js?x'), { path: 'a/c.js' })
assert.deepEqual(resolveRef('', '../c.js'), { outside: '../c.js' })
assert.ok(resolveRef('a', '/api/x').server && resolveRef('a', 'https://x.test/y').remote && resolveRef('a', 'C:\\x\\y.js').local)
const bootOf = zip => { const f = unzip(readFileSync(zip)); return bootGraph(f, analyze(f).manifest.items[0].res.path) }
const bg = bootOf(good)
assert.deepEqual(bg.nodes.map(n => n.path), ['lesson.html', 'style.css', 'scorm.js', 'lesson.js'])
assert.ok(!bg.risks.some(r => r.sev === 'error'), 'good boot: no errors: ' + JSON.stringify(bg.risks.map(r => r.title)))
const bb = bootOf(blank).risks.map(r => r.title + ' ' + r.evidence.join(' '))
assert.ok(bb.some(t => /capitals/.test(t) && /js\/App\.js/.test(t)), 'blank: case: ' + bb)
assert.ok(bb.some(t => /isn’t in the package/.test(t) && /vendor\/missing\.js/.test(t)), 'blank: missing: ' + bb)
assert.ok(bb.some(t => /no content of its own/.test(t)), 'blank: empty launch page')
assert.ok(bootOf(order).risks.some(r => /run before what they need/.test(r.title) && /uses scorm/.test(r.evidence[0])), 'order: load order')
const lb = bootOf(loader)
assert.ok(lb.risks.some(r => /config\.json isn’t valid JSON/.test(r.title)), 'loader: bad JSON')
assert.ok(lb.nodes.some(n => n.path === 'js/next.js' && n.how === 'src'), 'loader: script-loaded script found')
// A run in which only the launch page and scorm.js were asked for, and nothing showed.
const lr = launchFindings(trace({ duration: 3000, requests: ['lesson.html', 'scorm.js', 'js/boot.js', 'data/config.json'].map((p, i) => ({ t: i, url: 'lab://run/pkg/' + p, method: 'GET', status: 200 })),
  probe: [{ type: 'dom', frame: 'lab://run/pkg/lesson.html', text: 7, media: 0, visible: 1, frames: 0, loader: 'div#loading.spinner', readyState: 'complete' }] }), lb).map(f => f.title)
assert.ok(lr.some(t => /stuck on a loading screen/.test(t)), 'loader: stuck: ' + lr)
assert.ok(lr.some(t => /never ran/.test(t)), 'loader: next.js never asked for: ' + lr)
// Milestones: each step from hand-made traces, over the good package's boot graph (lesson.html, style.css, scorm.js, lesson.js).
const reqs = (...ps) => ps.map((p, i) => ({ t: 10 + i, url: 'lab://run/pkg/' + p, method: 'GET', status: 200 }))
const allReqs = reqs('lesson.html', 'style.css', 'scorm.js', 'lesson.js')
const pf = 'lab://run/pkg/lesson.html'
const call = (c, el = '', result = 'true') => ({ type: 'api', t: 100, call: c, el, result, err: 0 })
const reached = (t, b = bg) => milestones(t, b).filter(s => s.reached).map(s => s.id).join()
assert.equal(reached(trace()), '', 'milestones: empty trace reaches nothing')
assert.equal(reached(trace({ requests: reqs('lesson.html') })), 'launched', 'milestones: launched')
assert.equal(reached(trace({ requests: [{ ...reqs('lesson.html')[0], status: 404 }] })), '', 'milestones: a 404 launch page is not launched')
assert.equal(reached(trace({ requests: allReqs })), 'launched,scripts', 'milestones: scripts')
assert.equal(reached(trace({ requests: [...reqs('lesson.html', 'scorm.js'), { ...reqs('lesson.js')[0], status: 404 }] })), 'launched', 'milestones: a failed script tag')
assert.equal(reached(trace({ requests: reqs('lesson.html', 'scorm.js') })), 'launched', 'milestones: a script tag never requested')
const shownT = trace({ requests: allReqs, probe: [{ type: 'dom', t: 50, frame: pf, text: 25, media: 0 }] })
assert.equal(reached(shownT), 'launched,scripts,shown', 'milestones: shown by text')
assert.ok(reached(trace({ probe: [{ type: 'dom', t: 5, frame: pf, text: 3, media: 1 }] })).includes('shown'), 'milestones: shown by media')
assert.ok(!reached(trace({ probe: [{ type: 'dom', t: 5, frame: pf, text: 19, media: 0 }] })).includes('shown'), 'milestones: 19 characters is not shown')
assert.ok(!reached(trace({ probe: [{ type: 'dom', t: 5, frame: 'lab://run/__lab/host.html', text: 99, media: 0 }] })).includes('shown'), 'milestones: SCORM Lab’s own page is not content')
assert.equal(reached(trace({ requests: allReqs, probe: [{ type: 'lookup', t: 60, name: 'API', found: false, frame: pf }] })), 'launched,scripts,looked', 'milestones: looked')
assert.equal(reached(trace({ requests: allReqs, probe: [{ type: 'lookup', t: 60, name: 'API', found: true, frame: pf }] })), 'launched,scripts,looked,found', 'milestones: found')
const step = (id, probe) => milestones(trace({ probe }), bg).find(s => s.id === id)
assert.ok(step('initialised', [call('LMSInitialize')]).reached && step('initialised', [call('Initialize')]).reached, 'milestones: initialised, both versions')
assert.ok(!step('initialised', [call('LMSInitialize', '', 'false')]).reached, 'milestones: initialise that returned false')
assert.equal(step('initialised', [call('LMSInitialize')]).t, 100, 'milestones: step time')
for (const el of ['cmi.core.entry', 'cmi.core.lesson_location', 'cmi.location', 'cmi.entry', 'cmi.suspend_data']) assert.ok(step('read', [call('LMSGetValue', el)]).reached, 'milestones: read ' + el)
assert.ok(!step('read', [call('LMSGetValue', 'cmi.core.student_name')]).reached, 'milestones: reading the name is not reading saved data')
for (const el of ['cmi.core.lesson_location', 'cmi.suspend_data', 'cmi.core.lesson_status', 'cmi.completion_status', 'cmi.success_status', 'cmi.core.score.raw', 'cmi.score.scaled']) assert.ok(step('wrote', [call('SetValue', el)]).reached, 'milestones: wrote ' + el)
assert.ok(!step('wrote', [call('LMSSetValue', 'cmi.core.session_time')]).reached, 'milestones: session_time is not progress')
assert.ok(step('committed', [call('Commit')]).reached && !step('committed', [call('LMSCommit', '', 'false')]).reached, 'milestones: committed')
assert.ok(step('finished', [call('Terminate')]).reached && step('finished', [call('LMSFinish')]).reached && !step('finished', [call('Terminate', '', 'false')]).reached, 'milestones: finished')
const full = milestones(trace({ requests: allReqs, probe: [shownT.probe[0], { type: 'lookup', t: 60, name: 'API', found: true, frame: pf }, call('LMSInitialize'), call('LMSGetValue', 'cmi.core.entry'),
  call('LMSSetValue', 'cmi.core.lesson_status'), call('LMSCommit'), call('LMSFinish')] }), bg)
assert.ok(full.every(s => s.reached) && full.length === 10 && firstMissing(full) === null && furthest(full).id === 'finished', 'milestones: all ten')
assert.equal(milestones(trace({ requests: allReqs, probe: [call('LMSInitialize')] }), bg).find(s => s.id === 'found').reached, true, 'milestones: an API call implies the API was found')
assert.ok(milestones(trace({ requests: reqs('lesson.html') }), null).find(s => s.id === 'launched').reached, 'milestones: no boot graph, judged from requests')
const part = milestones(trace({ requests: allReqs, probe: [shownT.probe[0]] }), bg)
assert.equal(furthest(part).id, 'shown'); assert.equal(firstMissing(part).id, 'looked')
assert.match(milestoneFinding(part).title, /Got as far as: Content shown\. Didn’t reach: Looked for the API\./)
assert.equal(milestoneFinding(part).sev, 'info')
assert.match(milestoneFinding(milestones(trace(), bg)).title, /Got as far as: nothing/)
// progress: better, worse, equal.
const mk = (...ids) => milestones(trace({ requests: allReqs, probe: [ids.includes('looked') && { type: 'lookup', t: 1, name: 'API', found: false, frame: pf }, ids.includes('init') && call('LMSInitialize')].filter(Boolean) }), bg)
const pLooked = progress({ milestones: mk('looked'), counts: runCounts(trace({ requests: allReqs })) }, { milestones: mk('init'), counts: runCounts(trace({ requests: allReqs, probe: [call('LMSInitialize')], exceptions: [{ t: 1 }] })) })
assert.equal(pLooked.better, 1); assert.match(pLooked.summary, /got further: reached Initialised \(was Looked for the API\)/)
assert.deepEqual(pLooked.counts.apiCalls, { a: 0, b: 1 }); assert.deepEqual(pLooked.counts.uncaught, { a: 0, b: 1 })
assert.equal(pLooked.steps.find(s => s.id === 'initialised').a, false)
assert.equal(progress(mk('init'), mk('looked')).better, -1); assert.match(progress(mk('init'), mk('looked')).summary, /got less far/)
assert.equal(progress(mk('looked'), mk('looked')).better, 0); assert.match(progress(mk('looked'), mk('looked')).summary, /no change/)
const mkSteps = n => STEPS.map(([id, label], i) => ({ id, label, reached: i < n || i === 9 && n === 10, t: null, evidence: '' }))
const tie = progress(mkSteps(3).map((s, i) => ({ ...s, reached: i === 1 || i === 2 })), mkSteps(3))
assert.equal(tie.better, 1); assert.equal(tie.summary, 'same furthest step (Content shown), more steps reached')
assert.match(progress(mkSteps(3), mkSteps(3).map((s, i) => ({ ...s, reached: i === 2 }))).summary, /same furthest step \(Content shown\), fewer steps reached/)
assert.throws(() => progress(null, mk('looked')), /two milestone lists/); assert.throws(() => progress({}, mk('looked')), /two milestone lists/)
assert.equal(progress(milestones(trace(), bg), milestones(trace(), bg)).better, 0)
assert.deepEqual(runCounts(trace({ requests: [{ url: 'lab://run/pkg/a', status: 404 }, { url: 'lab://run/pkg/b', status: 200 }], exceptions: [{}], probe: [call('x'), { type: 'dom', frame: pf, text: 30 }, { type: 'dom', frame: pf, text: 40 }] })),
  { apiCalls: 1, requests: 2, failedRequests: 1, uncaught: 1, visibleText: 40 }, 'runCounts: last report of each frame')
const html = renderReport({ title: 'T', findings: [{ sev: 'error', title: '<img src=x onerror=alert(1)>', evidence: ['a & b'] }], fragment: true })
assert.ok(html.includes('&lt;img src=x') && !html.includes('<img src=x') && html.includes('a &amp; b'), 'report escapes')
assert.deepEqual(verdict([{ sev: 'warn', title: 'w' }, { sev: 'error', title: 'e' }]), { sev: 'error', title: 'e' })
assert.deepEqual(verdict([]).sev, 'ok')
// Launch options: defaults, validation, unknown fields, the CLI line.
const dflt = normaliseOptions()
assert.deepEqual(dflt, { expose: 'manifest', depth: 0, opener: false, resume: false, caught: true, auto: 0, wait: 10, profile: 'none', browser: 'chromium', viewport: null,
  files: {}, pins: [], responses: [], launchParams: '', storage: 'normal', trace: false }, 'options: defaults')
assert.deepEqual(normaliseOptions({}), dflt); assert.notEqual(normaliseOptions().files, normaliseOptions().files, 'options: defaults are not shared')
assert.deepEqual(normaliseOptions({ depth: '3', auto: '20', expose: '1.2', viewport: { width: 390, height: 844 } }), { ...dflt, depth: 3, auto: 20, expose: '1.2', viewport: { width: 390, height: 844 } })
for (const [o, re] of [[{ nope: 1 }, /Unknown option: nope/], [{ nope: 1, other: 2 }, /Unknown options: nope, other/], [{ expose: 'x' }, /expose.*one of/], [{ depth: 6 }, /depth/], [{ depth: 1.5 }, /depth/],
  [{ depth: 'a' }, /depth/], [{ opener: 'yes' }, /opener/], [{ caught: 0 }, /caught/], [{ resume: null }, /resume/], [{ auto: -1 }, /auto/], [{ wait: 0 }, /wait/], [{ trace: 1 }, /trace/],
  [{ profile: '' }, /profile/], [{ browser: 'webkit' }, /browser/], [{ viewport: { width: 1 } }, /viewport/], [{ viewport: { width: 0, height: 5 } }, /viewport/], [{ files: [] }, /files/],
  [{ files: { 'a.js': 1 } }, /files/], [{ pins: {} }, /pins/], [{ pins: [1] }, /pins/], [{ responses: 'x' }, /responses/],
  [{ pins: [{ path: 'a b', value: 1 }] }, /pins.*path/], [{ pins: [{ path: 'a' }] }, /pins.*value/], [{ pins: [{ path: 'a', value: undefined }] }, /pins.*value/], [{ pins: [{ path: 'a', value: 1, frames: 'top' }] }, /frames/],
  [{ pins: [{ path: 'a', value: 1, mode: 'watch' }] }, /mode/], [{ pins: [{ path: 'a', value: 1, nope: 1 }] }, /unknown field: nope/], [{ pins: [{ path: 'API', value: 1 }] }, /can’t pin API/],
  [{ pins: [{ path: 'location.search', value: 'a' }] }, /launch parameters/], [{ pins: [{ path: 'navigator.language', value: 'a' }] }, /navigator\.userAgent/], [{ pins: [{ path: 'a.__proto__.b', value: 1 }] }, /pins/],
  [{ responses: [{ body: 'x' }] }, /match/], [{ responses: [{ match: '/(/', body: 'x' }] }, /pattern/], [{ responses: [{ match: '/a/', status: 99 }] }, /status/], [{ responses: [{ match: 'a', body: 1 }] }, /body/],
  [{ responses: [{ match: 'a', headers: { x: {} } }] }, /headers/], [{ responses: [{ match: 'a', bodyFile: 'x.json' }] }, /command line/], [{ responses: [{ match: 'a', nope: 1 }] }, /unknown field/],
  [{ launchParams: 'a b' }, /launchParams/], [{ launchParams: 'a=1#x' }, /launchParams/], [{ launchParams: 1 }, /launchParams/], [{ storage: 3 }, /storage/], ['x', /object/]])
  assert.throws(() => normaliseOptions(o), re, 'options: ' + JSON.stringify(o))
assert.throws(() => normaliseOptions({ constructor: 1 }), /Unknown option: constructor/)
assert.throws(() => normaliseOptions(JSON.parse('{"__proto__":1}')), /Unknown option: __proto__/)
for (const p of ['', '/a.js', '../a.js', 'a/../b.js', 'a\\b.js']) assert.throws(() => normaliseOptions({ files: { [p]: 'x' } }), /files/, 'options: files key ' + p)
assert.deepEqual(normaliseOptions({ files: { 'js/a.js': 'x', 'b.png': { base64: 'AAEC' }, 'c.js': { content: '' } } }).files, { 'js/a.js': { content: 'x' }, 'b.png': { base64: 'AAEC' }, 'c.js': { content: '' } }, 'options: files shapes')
for (const f of [{ 'a.js': {} }, { 'a.js': { content: 'x', base64: 'AA==' } }, { 'a.js': { base64: '!!' } }, { 'a.js': { base64: 'AAE' } }, { 'a.js': { content: 1 } }, { 'a//b.js': 'x' }, { 'a/': 'x' }])
  assert.throws(() => normaliseOptions({ files: f }), /files/, 'options: files value ' + JSON.stringify(f))
assert.equal(cliCommand(dflt, { zip: 'a b.zip', item: 2 }), "scorm-lab run 'a b.zip' --item 2")
assert.equal(cliCommand({ expose: 'both', depth: 2, opener: true, caught: false, auto: 20, trace: true }), 'scorm-lab run package.zip --api both --depth 2 --window --no-caught --wait 20 --trace')
assert.equal(cliCommand({ storage: 'blocked' }), 'scorm-lab run package.zip --options options.json', 'cliCommand: a field without a flag goes to the options file')
// Experiments: planning, summary, findings.
const planned = planVariants({ base: {}, variants: PRESETS.standard })
assert.deepEqual(planned.map(p => p.name), ['default', 'api both', 'api 1.2', 'api 2004', 'api none', 'depth 1', 'depth 2', 'depth 3', 'new window'], 'experiments: standard drops variants equal to the default')
assert.equal(planned[1].options.expose, 'both'); assert.deepEqual(planned[0].options, dflt)
assert.deepEqual(planVariants({ base: { depth: 1 }, variants: [{ name: 'a', patch: { expose: '1.2' } }] })[1].options, normaliseOptions({ depth: 1, expose: '1.2' }), 'experiments: patch merges over the base')
assert.equal(PRESETS.standard.length, new Set(PRESETS.standard.map(v => JSON.stringify(v.patch))).size, 'experiments: standard has no repeats')
assert.equal(planVariants({ base: {}, variants: [{ name: 'same', patch: {} }], dedupe: false }).length, 2, 'experiments: user variants are kept')
assert.throws(() => planVariants({ base: {}, variants: [{ name: 'x', patch: { depth: 9 } }] }), /Variant “x”: .*depth/)
assert.throws(() => planVariants({ base: {}, variants: [{ name: 'x', patch: { nope: 1 } }] }), /Unknown option/)
assert.throws(() => planVariants({ base: {}, variants: [{ name: 'x' }, { name: 'x' }] }), /twice/)
assert.throws(() => planVariants({ base: {}, variants: [{ patch: {} }] }), /needs a name/)
assert.throws(() => planVariants({ base: {}, variants: {} }), /list/)
const exRes = (name, options, n, extra = {}) => ({ name, options, milestones: mkSteps(n), counts: { apiCalls: n, uncaught: 0 }, errors: 0, verdict: { sev: 'ok', title: 'No problems found' }, ...extra })
const exBase = exRes('default', dflt, 4), exBoth = exRes('api both', normaliseOptions({ expose: 'both' }), 6), exNone = exRes('api none', normaliseOptions({ expose: 'none' }), 2)
const exRows = summarise([exBase, exBoth, exNone])
assert.deepEqual(exRows.map(r => [r.name, r.furthest, r.better]), [['default', 'looked', 0], ['api both', 'initialised', 1], ['api none', 'scripts', -1]], 'experiments: summary')
assert.equal(exRows[0].progress, 'the default'); assert.match(exRows[1].progress, /got further/)
const exF = experimentFindings([exBase, exBoth, exNone])
assert.equal(exF.length, 1); assert.equal(exF[0].sev, 'warn'); assert.match(exF[0].title, /^api both gets further than the default: reached Initialised/)
assert.deepEqual(exF[0].evidence, ['expose: "manifest" → "both"'], 'experiments: evidence is the settings difference')
const exNo = experimentFindings([exBase, exRes('same', dflt, 4), exNone])
assert.equal(exNo.length, 1); assert.equal(exNo[0].sev, 'info'); assert.match(exNo[0].title, /Nothing tried made a difference/)
assert.equal(experimentFindings([exBase, exRes('tie', dflt, 4)])[0].sev, 'info', 'experiments: a tie is not further')
assert.deepEqual(experimentFindings([]), [])
const exRun = runResult('v', dflt, { milestones: mkSteps(2), trace: trace(), findings: [{ sev: 'error', title: 'bad' }] }, { runId: 3 })
assert.equal(exRun.errors, 1); assert.equal(exRun.verdict.title, 'bad'); assert.equal(exRun.runId, 3); assert.equal(summarise([exRun])[0].runId, 3)
// Line diff and overrides.
const protoFiles = normaliseOptions({ files: JSON.parse('{"__proto__":"x","constructor":{"base64":"AAEC"}}') }).files
assert.deepEqual(Object.keys(protoFiles), ['__proto__', 'constructor'], 'options: __proto__ and constructor are ordinary paths')
assert.equal(Object.getPrototypeOf(protoFiles), Object.prototype); assert.deepEqual(protoFiles['__proto__'], { content: 'x' })
assert.deepEqual([...overlayFiles(new Map(), protoFiles).keys()], ['__proto__', 'constructor'])
assert.throws(() => normaliseOptions({ files: { 'a.js': { content: 'x'.repeat(50 * 1024 ** 2 + 1) } } }), /over 50 MB/, 'options: per-file cap')
assert.throws(() => normaliseOptions({ files: Object.fromEntries([1, 2, 3, 4, 5].map(i => ['f' + i, { content: 'x'.repeat(45 * 1024 ** 2) }])) }), /more than 200 MB/, 'options: total cap')
assert.equal(cliCommand({ files: { 'js/a.js': { content: 'x' }, 'b c.js': { content: 'y' } } }), "scorm-lab run package.zip --override js/a.js=js/a.js --override 'b c.js=b c.js'", 'cliCommand: one --override per changed file')
assert.deepEqual(diffLines('', 'a\nb').map(r => r.op), ['+', '+']); assert.deepEqual(diffLines('a', '').map(r => r.op), ['-'], 'textdiff: an empty side')
const dl = (a, b) => diffLines(a, b).map(r => r.op + r.text).join('|')
assert.equal(dl('a\nb\nc', 'a\nb\nc'), ' a| b| c'); assert.equal(dl('', 'x'), '+x'); assert.equal(dl('x', ''), '-x'); assert.equal(dl('', ''), '')
assert.equal(dl('a\nb\nc', 'a\nB\nc'), ' a|-b|+B| c', 'textdiff: a changed line'); assert.equal(dl('a\nc', 'a\nb\nc'), ' a|+b| c', 'textdiff: an added line')
assert.equal(dl('a\r\nb', 'a\nb'), ' a| b', 'textdiff: line endings are not changes')
assert.equal(unified('a\nb', 'a\nb'), ''); assert.equal(unified('a\nb\nc\nd', 'a\nB\nc\nd\ne'), '@@ -1,4 +1,5 @@\n a\n-b\n+B\n c\n d\n+e')
const longA = Array.from({ length: 40 }, (_, i) => 'line ' + i).join('\n'), longB = longA.replace('line 20', 'LINE 20')
assert.equal(unified(longA, longB).split('\n').length, 9, 'textdiff: three lines of context each side'); assert.match(unified(longA, longB), /^@@ -18,7 \+18,7 @@/)
const big = Array.from({ length: 3000 }, (_, i) => 'x' + i).join('\n'); assert.equal(diffLines(big, big.replace(/x/g, 'y')).filter(r => r.op === '+').length, 3000, 'textdiff: large inputs still diff')
assert.ok(isText(Buffer.from('héllo')) && !isText(Buffer.from([104, 0, 105])) && !isText(Buffer.from([0xff, 0xfe, 0x41])), 'overlay: text or binary')
assert.deepEqual(entryFor(Buffer.from('hi')), { content: 'hi' }); assert.deepEqual(entryFor(Buffer.from([0, 1, 2])), { base64: 'AAEC' })
assert.deepEqual([...entryBuffer({ base64: 'AAEC' })], [0, 1, 2])
const ofiles = new Map([['a.js', Buffer.from('old')], ['b.css', Buffer.from('body')]])
assert.equal(overlayFiles(ofiles, {}), ofiles, 'overlay: no overrides, same map')
const merged = overlayFiles(ofiles, { 'a.js': { content: 'new' }, 'img/x.png': { base64: 'AAEC' } })
assert.equal(merged.get('a.js').toString(), 'new'); assert.equal(merged.get('b.css').toString(), 'body'); assert.deepEqual([...merged.get('img/x.png')], [0, 1, 2], 'overlay: replace, keep, add')
assert.equal(ofiles.get('a.js').toString(), 'old', 'overlay: the original map is untouched')
assert.deepEqual(overrideList(ofiles, { 'a.js': { content: 'new' }, 'n.png': { base64: 'AAEC' } }), [{ path: 'a.js', size: 3, binary: false, added: false }, { path: 'n.png', size: 3, binary: true, added: true }])
assert.equal(overrideFinding({}), null)
const of2 = overrideFinding({ 'a.js': { content: 'new' }, 'b.png': { base64: 'AAEC' } })
assert.match(of2.title, /^This run used 2 changed files: a\.js, b\.png$/); assert.equal(of2.sev, 'info'); assert.equal(of2.evidence.length, 2)
assert.match(overrideFinding({ 'a.js': { content: '' } }).title, /1 changed file:/)
const ms = mkSteps
const pf1 = overrideProgressFinding({ milestones: ms(3), counts: {} }, { milestones: ms(6), counts: {} })
assert.match(pf1.title, /got further: reached Initialised \(was Content shown\)/); assert.equal(pf1.sev, 'info'); assert.ok(pf1.evidence.length === 3)
assert.equal(overrideProgressFinding({ milestones: ms(6), counts: {} }, { milestones: ms(3), counts: {} }).sev, 'warn', 'overlay: worse is a warning')
assert.match(overrideProgressFinding({ milestones: ms(3), counts: {} }, { milestones: ms(3), counts: {} }).title, /no change/)
// Pins and answers: validation shapes, matching, the probe prefix, findings, the command line's spellings.
assert.deepEqual(normaliseOptions({ pins: [{ path: 'previewMode', value: false }, { path: 'config.mode', value: null, frames: 'all' }] }).pins,
  [{ path: 'previewMode', value: false, frames: 'content', mode: 'force' }, { path: 'config.mode', value: null, frames: 'all', mode: 'force' }], 'options: pin defaults')
assert.deepEqual(normaliseOptions({ responses: [{ match: '/api/*', method: 'post', body: '{}' }, { match: '/x/i', status: '404', headers: { A: 'b' } }].map(r => ({ ...r, status: r.status && +r.status })) }).responses,
  [{ match: '/api/*', method: 'POST', status: 200, headers: {}, body: '{}' }, { match: '/x/i', status: 404, headers: { A: 'b' }, body: '' }], 'options: response defaults')
assert.equal(normaliseOptions({ launchParams: '?a=1&b=2' }).launchParams, 'a=1&b=2', 'options: launchParams loses its ?')
assert.equal(normaliseOptions({ pins: [{ path: 'navigator.userAgent', value: 'X' }] }).pins[0].path, 'navigator.userAgent')
const again = normaliseOptions({ pins: [{ path: 'a', value: { b: [1] } }], responses: [{ match: 'a', body: 'x' }] }); assert.deepEqual(normaliseOptions(again), again, 'options: normalising twice changes nothing')
assert.equal(pinPathProblem('config.mode'), ''); assert.match(pinPathProblem('1a'), /name/); assert.match(pinPathProblem('window'), /can’t pin/); assert.match(pinPathProblem('__labPins'), /can’t pin/)
const wide = normaliseOptions({ pins: [{ path: 'x', value: 1 }] }).pins
assert.equal(pinPrefix(wide), 'globalThis.__labPins = [{"path":"x","value":1,"frames":"content","mode":"force"}];\n'); assert.equal(pinPrefix([]), '')
assert.equal(pinPrefix(normaliseOptions({ pins: [{ path: 'navigator.userAgent', value: 'U' }] }).pins), 'globalThis.__labPins = [];\n', 'pins: the user agent is not a probe pin')
assert.equal(userAgentPin(normaliseOptions({ pins: [{ path: 'navigator.userAgent', value: 'U' }, { path: 'a', value: 1 }] }).pins), 'U'); assert.equal(userAgentPin(wide), undefined)
assert.ok(matcher('/api/*')('https://h.test/api/x?y=1') && matcher('/api/player/config')('lab://run/api/player/config') && !matcher('/api/player/config')('lab://run/api/player/config2'), 'answer: glob against the path')
assert.ok(matcher('*.json')('lab://run/pkg/data/a.json') && matcher('/a?c')('x://h/abc') && !matcher('/a?c')('x://h/abbc'), 'answer: * and ?')
assert.ok(matcher('/\\.json$/')('lab://run/x/a.json') && matcher('/API/i')('lab://run/api/x') && !matcher('/^x$/')('lab://run/a'), 'answer: regex')
assert.ok(matcher('https://h.test/a.b')('https://h.test/a.b') && !matcher('https://h.test/a.b')('https://h.test/aXb'), 'answer: a dot in a glob is a dot')
assert.throws(() => matcher('/(/'))
const rs = normaliseOptions({ responses: [{ match: '/api/*', method: 'POST', body: 'post' }, { match: '/api/*', body: 'any' }, { match: '*', body: 'all' }] }).responses
assert.equal(answerFor(rs, 'lab://run/api/x', 'POST').index, 0); assert.equal(answerFor(rs, 'lab://run/api/x', 'GET').index, 1, 'answer: method and order'); assert.equal(answerFor(rs, 'lab://run/other', 'get').index, 2)
assert.equal(answerFor(rs, 'lab://run/__lab/host.js', 'GET'), null, 'answer: SCORM Lab’s own pages are never answered'); assert.equal(answerFor([], 'x://y'), null)
const ba = buildAnswer({ status: 201, headers: { 'X-A': 'b' }, body: '{"a":1}' })
assert.equal(ba.status, 201); assert.equal(Buffer.from(ba.body, 'base64').toString(), '{"a":1}')
assert.deepEqual(ba.headers, [{ name: 'X-A', value: 'b' }, { name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], 'answer: type from the body, CORS opened')
assert.equal(buildAnswer({ body: 'hi' }).headers[0].value, 'text/plain; charset=utf-8')
assert.equal(buildAnswer({ headers: { 'content-type': 'x/y', 'access-control-allow-origin': 'a' }, body: '' }).headers.length, 2, 'answer: given headers are kept')
assert.equal(lexicalDeclaration('var a\nlet previewMode = 1', 'previewMode'), 2); assert.equal(lexicalDeclaration('  let previewMode = 1', 'previewMode'), 0, 'pins: only column 0')
assert.equal(lexicalDeclaration('const $x = 1', '$x'), 1); assert.equal(lexicalDeclaration('let previewModeTwo', 'previewMode'), 0); assert.equal(lexicalDeclaration(undefined, 'a'), 0)
const pinOpts = normaliseOptions({ pins: [{ path: 'previewMode', value: false }, { path: 'config.mode', value: 'live' }, { path: 'nobody', value: 1 }, { path: 'navigator.userAgent', value: 'U' }, { path: 'locked.a', value: 1 }, { path: 'lex', value: 1 }],
  responses: [{ match: '/api/*', body: '{}' }, { match: '/never', body: '' }] })
const pinTrace = trace({ sources: { 'lab://run/pkg/boot.js': 'var a\nlet lex = 1' }, requests: [{ url: 'lab://run/api/x', method: 'GET', answered: true, answeredBy: 0 }, { url: 'lab://run/pkg/a.js', method: 'GET' }],
  probe: [{ type: 'pin-write', path: 'previewMode', value: 'true', stack: ['lab://run/pkg/boot.js:7:5'] }, { type: 'pin-write', path: 'previewMode', value: 'true', stack: ['lab://run/pkg/boot.js:7:5'] },
    { type: 'pin-read', path: 'config.mode', stack: [] }, { type: 'pin-failed', path: 'locked.a', error: 'TypeError: Cannot redefine property: a' }] })
const pf2 = pinFindings(pinTrace, pinOpts), pt = t => pf2.find(f => t.test(f.title))
assert.deepEqual(pt(/tried to change/).evidence, ['previewMode = true from boot.js:7:5'], 'pins: write finding, repeats folded'); assert.equal(pt(/tried to change/).sev, 'warn')
assert.deepEqual(pt(/never read/).evidence, ['nobody = 1']); assert.equal(pt(/never read/).sev, 'info', 'pins: never read is a note, and neither the user agent nor a failed pin is listed')
assert.match(pt(/Couldn’t pin locked\.a/).detail, /frozen/); assert.match(pt(/Couldn’t pin lex: .*let or const/).evidence[0], /boot\.js:2/); assert.match(pt(/Couldn’t pin lex/).fix, /file override/)
assert.equal(pt(/Answered 1 request/).evidence[0], 'GET lab://run/api/x → 200'); assert.deepEqual(pt(/matched no request/).evidence, ['/never'])
assert.deepEqual(pinFindings(trace(), {}), []); assert.deepEqual(pinFindings(trace(), normaliseOptions()), [], 'pins: none set, nothing said')
assert.ok(runFindings(pinTrace, { kind: 'package', itemType: 'asset', options: pinOpts }).some(f => /tried to change a pinned value/.test(f.title)), 'pins: runFindings includes them')
assert.ok(!runFindings(pinTrace, { kind: 'reference', options: pinOpts }).some(f => /pinned/.test(f.title)), 'pins: not for a reference')
assert.deepEqual(parsePinFlag('previewMode=false'), { path: 'previewMode', value: false }); assert.deepEqual(parsePinFlag('a.b={"x":[1]}'), { path: 'a.b', value: { x: [1] } })
assert.deepEqual(parsePinFlag('navigator.userAgent="X=Y"'), { path: 'navigator.userAgent', value: 'X=Y' })
for (const bad of ['x', '=1', 'x=notjson', 'x=', true, undefined]) assert.throws(() => parsePinFlag(bad), /--pin/, 'pins: bad flag ' + bad)
assert.deepEqual(parseAnswerFlag('/api/config=@c.json'), { match: '/api/config', file: 'c.json' }); assert.deepEqual(parseAnswerFlag('/api/config=200:{}'), { match: '/api/config', status: 200, body: '{}' })
assert.deepEqual(parseAnswerFlag('/a?x=1=404:no: way'), { match: '/a?x=1', status: 404, body: 'no: way' }, 'answer flag: = in the pattern, : in the body'); assert.deepEqual(parseAnswerFlag('/a=200:'), { match: '/a', status: 200, body: '' })
for (const bad of ['/a', '/a=x', '/a=20:{}', '=200:x', true]) assert.throws(() => parseAnswerFlag(bad), /--answer/, 'answer: bad flag ' + bad)
assert.equal(cliCommand(normaliseOptions({ pins: [{ path: 'previewMode', value: false }, { path: 'navigator.userAgent', value: 'a b' }], responses: [{ match: '/api/*', status: 404, body: '{"a":1}' }], launchParams: 'a=1&b=2' })),
  `scorm-lab run package.zip --pin previewMode=false --pin 'navigator.userAgent="a b"' --answer '/api/*=404:{"a":1}' --launch-params 'a=1&b=2'`, 'cliCommand: pins, answers, launch parameters')
assert.equal(cliCommand(normaliseOptions({ pins: [{ path: 'x', value: 1, frames: 'all' }], responses: [{ match: 'a', headers: { A: 'b' } }] })), 'scorm-lab run package.zip --options options.json', 'cliCommand: what a flag can’t say goes to the options file')
assert.throws(() => normaliseOptions({ responses: [1, 2, 3].map(i => ({ match: 'a' + i, body: 'x'.repeat(8 * 1024 ** 2) })) }), /more than 20 MB/, 'options: total response size cap')
assert.match(pinFindings(trace({ requests: [{ url: 'lab://run/api/x', method: 'GET', answerFailed: 'bad header' }] }), normaliseOptions({ responses: [{ match: 'a' }] })).find(f => /Couldn’t answer 1 request/.test(f.title)).evidence[0], /bad header/)

// Shape (P1.3). The recording Proxy runs here in a vm context, with stand-ins for Response, XMLHttpRequest and fetch:
// the same probe code the browser gets, and the needs fixture's boot.js as the content.
const SHAPE = readFileSync(new URL('../src/host/shape-probe.js', import.meta.url), 'utf8'), CFG = 'lab://run/api/player/config'
// Runs code in a fresh page-like context with the given responses (as options.responses); resolves to { reports, ctx }.
// Each page gets its own classes, as each browser frame has its own: the probe patches their prototypes.
async function inPage(code, responses, extra = {}) {
  class FakeResponse { constructor(body, url, status = 200) { Object.assign(this, { body, url, status, ok: status < 400 }) } json() { return Promise.resolve(JSON.parse(this.body)) } text() { return Promise.resolve(this.body) } }
  class FakeXHR { constructor(body, url, type = '') { this.body = body; this.responseURL = url; this.readyState = 4; this.responseType = type } }
  Object.defineProperty(FakeXHR.prototype, 'response', { configurable: true, get() { return this.responseType === 'json' ? JSON.parse(this.body) : this.body } })
  Object.defineProperty(FakeXHR.prototype, 'responseText', { configurable: true, get() { return this.body } })
  const reports = [], answer = url => responses.find(r => matcher(r.match)(url))
  const ctx = vm.createContext({ __labReport: s => reports.push(JSON.parse(s)), location: { href: 'lab://run/pkg/lesson.html' }, URL, Response: FakeResponse, XMLHttpRequest: FakeXHR, console: { log() {} },
    fetch: async u => { const url = 'lab://run' + u, a = answer(url); return a ? new FakeResponse(servedBody(a.body), url) : new FakeResponse('Not found', url, 404) }, ...extra })
  vm.runInContext(shapePrefix(responses) + SHAPE, ctx, { filename: 'probe' })
  vm.runInContext(code, ctx, { filename: 'lab://run/pkg/boot.js' })
  await new Promise(r => setTimeout(r, 20))
  return { reports, ctx }
}
const page = () => ({ document: { getElementById: () => ({ setAttribute() {}, textContent: '' }) }, start() { ctxStarted.n++ } }), ctxStarted = { n: 0 }
{
  const { reports } = await inPage(NEEDS_BOOT, [{ match: '/api/player/config', body: '@probe' }], page())
  assert.equal(ctxStarted.n, 1, 'shape: with @probe the content got past its configuration')
  const reads = shapeReads({ probe: reports, sources: { 'lab://run/pkg/boot.js': NEEDS_BOOT } }, '/api/player/config'), sh = inferShape(reads), byPath = Object.fromEntries(sh.fields.map(f => [f.path, f]))
  assert.deepEqual(sh.skeleton, { assets: { base: '' }, lms: { enabled: false, version: '' } }, 'shape: skeleton of the needs fixture')
  assert.deepEqual([byPath['lms.enabled'].type, byPath['lms.version'].type, byPath['assets.base'].type], ['boolean', 'string', 'string'], 'shape: types')
  assert.match(byPath['lms.enabled'].how, /truthiness/); assert.match(byPath['lms.version'].how, /compared with a string/); assert.match(byPath['assets.base'].how, /text/)
  assert.deepEqual(byPath['lms.version'].at, ['boot.js:4'], 'shape: where it was read')
  // Round 2: answered with the skeleton, the real values are used (enabled is false, so version isn't read) and nothing is new.
  const r2 = await inPage(NEEDS_BOOT, [{ match: '/api/player/config', body: probeBody(sh.skeleton) }], page())
  assert.deepEqual([...new Set(r2.reports.map(r => r.path))].sort(), ['assets', 'assets.base', 'lms', 'lms.enabled'], 'shape: with the skeleton, the data is real')
  // Without an answer the content never starts.
  ctxStarted.n = 0; await inPage(NEEDS_BOOT, [], page()); assert.equal(ctxStarted.n, 0, 'shape: no answer, no start')
}
{
  // The Proxy's documented behaviour, and the other ways in: text() + JSON.parse, XHR responseText + JSON.parse, XHR json.
  const code = `var out = globalThis.out = {}
new Response('{"real":{"n":2},"list":[1]}', '${CFG}').json().then(function (c) {
  out.truthy = !!c.missing; out.type = typeof c.missing; out.inCheck = 'zz' in c; out.keys = Object.keys(c.missing).length; out.json = JSON.stringify(c.missing)
  out.num = +c.count; out.text = 'v' + c.label; out.mapped = c.items.map(function (x) { return x }).length; out.iter = [].concat(Array.from(c.rows)).length
  out.trimmed = c.name.trim(); out.real = c.real.n; out.list = Array.isArray(c.list); out.same = c.real === c.real; c.own = 5; out.own = c.own
  try { c.missing() } catch (e) { out.callThrows = e instanceof TypeError }
  return c
}).then(function (c) { out.thenable = typeof c.then })
new Response('{}', '${CFG}').text().then(function (t) { out.fromText = JSON.parse(t).viaText; out.again = JSON.stringify(JSON.parse(t)) })
var x = new XMLHttpRequest('{}', '${CFG}'); out.xhrText = JSON.parse(x.responseText).viaXhr
var j = new XMLHttpRequest('{}', '${CFG}', 'json'); out.xhrJson = j.response.viaJson; out.xhrSame = j.response === j.response
new Response('{}', 'lab://run/other').json().then(function (c) { out.other = c.anything })`
  const { reports, ctx } = await inPage(code, [{ match: '/api/player/config', body: '@probe' }])
  const o = ctx.out
  assert.deepEqual([o.truthy, o.type, o.inCheck, o.keys, o.json, o.num, o.text, o.mapped, o.iter, o.trimmed, o.real, o.list, o.same, o.own, o.callThrows, o.thenable],
    [true, 'object', true, 0, '{}', 0, 'v', 0, 0, '', 2, true, true, 5, true, 'undefined'], 'shape proxy: always truthy, an object, empty when listed or iterated, real data as is')
  assert.equal(typeof o.fromText, 'object'); assert.equal(o.again, '{}', 'shape: one JSON.parse per text, the next gets the plain value')
  assert.equal(o.other, undefined, 'shape: other URLs are untouched')
  const reads = shapeReads({ probe: reports }, '/api/player/config'), sh = inferShape(reads), t = Object.fromEntries(sh.fields.map(f => [f.path, f.type]))
  assert.deepEqual([t.count, t.label, t.items, t.rows, t.name, t.viaText, t.viaXhr, t.viaJson, t.zz, t['real.n'], t.missing], ['number', 'string', 'array', 'array', 'string', 'boolean', 'boolean', 'boolean', 'boolean', 'boolean', 'object'], 'shape: uses become types: ' + JSON.stringify(t))
  assert.ok(!reads.some(r => r.path === 'own' || r.path === 'then' || r.path === 'items.map'), 'shape: the content’s own writes, then and method names are not fields')
  assert.equal(o.xhrSame, true)
}
// Source hints, type order, and the helpers.
const hint = (line, key) => sourceHint(line, 1, line.indexOf(key) + 1, key)?.type ?? null
assert.deepEqual(['if (c.a === "x")', 'if (2 == c.a)', 'c.a > 3', 'c.a * 2', 'if (typeof c.a === "number")', 'x = c.a || []', 'x = c.a ?? 5', 'if (!c.a) go()', 'c.a && go()', 'go(c.a)', 'c.a.b', 'c.a = 1', 'f(x => c.a)'].map(l => hint(l, 'a')),
  ['string', 'number', 'number', 'number', 'number', 'array', 'number', 'boolean', 'boolean', null, null, null, null], 'shape: source hints')
assert.equal(sourceHint('if (c.b === 1)', 1, 3, 'a'), null, 'shape: a column not at the name gives no hint')
assert.deepEqual(inferShape([{ path: 'a', use: 'text' }, { path: 'a', use: 'read', hint: { type: 'number', how: 'compared with a number' } }, { path: 'b', use: 'keys' }, { path: 'c', use: 'array' }, { path: 'c.d', use: 'read' }]).skeleton,
  { a: 0, b: {}, c: { d: false } }, 'shape: a hint beats loose text use; children make an object')
assert.deepEqual(inferShape([]), { skeleton: {}, fields: [] })
assert.equal(servedBody('@probe'), '{}'); assert.equal(servedBody('@probe {"a":1}'), '{"a":1}'); assert.equal(servedBody('@probed'), '@probed'); assert.equal(probeBody({ a: 1 }), '@probe {"a":1}')
assert.equal(buildAnswer({ body: '@probe' }).headers.find(h => h.name === 'Content-Type').value, 'application/json', 'shape: a probe answer is JSON')
assert.equal(shapePrefix([{ match: 'a', body: 'x' }]), ''); const prefixed = JSON.parse(shapePrefix([{ match: '/api/*', body: '@probe' }, { match: 'x', body: '{}' }]).replace(/^globalThis\.__labShape = |;\n$/g, ''))
assert.deepEqual(prefixed.map(p => new RegExp(p.source, p.flags).test('/api/x')), [true], 'shape: the prefix holds the @probe patterns only')
assert.equal(requestPattern('lab://run/api/x?y=1'), '/api/x'); assert.equal(requestPattern('https://h.test/a/b?c'), 'https://h.test/a/b')
assert.deepEqual(serverRequests({ requests: [{ url: 'lab://run/api/x?1', method: 'GET', type: 'Fetch', from: [{ url: 'lab://run/pkg/a.js', line: 3 }] }, { url: 'lab://run/api/x?2', type: 'XHR' }, { url: 'lab://run/pkg/data.json', type: 'Fetch' },
  { url: 'lab://run/__lab/config.json', type: 'Fetch' }, { url: 'https://cdn.test/lib.js', type: 'Script' }, { url: 'https://h.test/q', method: 'POST', type: 'XHR' }] }),
  [{ match: '/api/x', url: 'lab://run/api/x?1', method: 'GET', from: 'a.js:3' }, { match: 'https://h.test/q', url: 'https://h.test/q', method: 'POST', from: '' }], 'shape: server requests are fetch and XHR outside the package, one per pattern')
for (const bad of [{ rounds: 0 }, { rounds: 11 }, { rounds: 1.5 }, { request: '' }, { request: '/(/' }]) assert.throws(() => checkDiscover(bad), /Rounds|pattern/, 'discover: bad settings ' + JSON.stringify(bad))
// The discovery loop, with runs made in the vm: no answer, @probe, then the skeleton, which adds nothing, so it stops.
{
  const fakeRun = async (name, options) => {
    ctxStarted.n = 0
    const { reports } = await inPage(NEEDS_BOOT, options.responses, page()), started = ctxStarted.n > 0
    return { trace: { requests: [{ url: CFG, method: 'GET', type: 'Fetch', from: [{ url: 'lab://run/pkg/boot.js', line: 1 }] }], probe: reports, sources: { 'lab://run/pkg/boot.js': NEEDS_BOOT } },
      milestones: STEPS.map(([id, label], i) => ({ id, label, reached: i <= (started ? 8 : 2), t: 0, evidence: '' })), findings: [] }
  }
  const names = [], d = await discover({ base: { wait: 3 }, run: fakeRun, onRound: r => names.push(r.name) })
  assert.deepEqual(names, ['no answer', 'round 1', 'round 2'], 'discover: stops when a round adds nothing'); assert.equal(d.complete, true); assert.equal(d.rounds, 2)
  assert.deepEqual(d.requests[0].skeleton, { assets: { base: '' }, lms: { enabled: false, version: '' } }); assert.equal(d.requests[0].response.body, JSON.stringify(d.requests[0].skeleton))
  assert.equal(d.requests[0].from, 'boot.js:1'); assert.equal(d.rows[0].progress, 'the baseline'); assert.equal(d.standIn.better, 1)
  const ft = d.findings.map(f => f.title)
  assert.deepEqual(ft, ['The content needs these from its server', 'With a stand-in for /api/player/config, the content reaches Committed'], 'discover findings: ' + ft)
  assert.ok(d.findings[0].evidence.includes('lms.version: string (compared with a string, boot.js:4)'), 'discover: the evidence lists fields and types')
  const one = await discover({ base: {}, rounds: 1, request: '/api/player/*', run: fakeRun })
  assert.equal(one.complete, false); assert.equal(one.requests[0].url, CFG, 'discover: a pattern given by hand gets the request it matched'); assert.match(one.findings[0].detail, /stopped after 1 rounds/)
  const none = await discover({ base: {}, run: async () => ({ trace: { requests: [], probe: [] }, milestones: STEPS.map(([id, label]) => ({ id, label, reached: false })), findings: [] }) })
  assert.deepEqual(none.findings.map(f => f.title), ['The content made no requests to a server'])
  assert.match(discoverFindings({ ...d, requests: [{ ...d.requests[0], fields: [] }] }).map(f => f.title).join(), /didn’t read what \/api\/player\/config sent/)
}
// Instrumentation (P1.4). Each snippet runs three times under node:vm: as it is, instrumented with trace-probe.js
// (the page side), and instrumented with only the prelude (as in a worker). Results and side-effect logs must match.
const TRACE = readFileSync(new URL('../src/host/trace-probe.js', import.meta.url), 'utf8')
async function runSnippet(code, probe) {
  const log = [], reports = []
  const ctx = vm.createContext({ log: (...a) => { log.push(a.map(String).join(' ')) }, setTimeout, location: { href: 'lab://run/pkg/a.js' }, out: undefined, __labReport: s => reports.push(JSON.parse(s)) })
  if (probe) vm.runInContext(TRACE, ctx)
  vm.runInContext(code, ctx, { filename: 'lab://run/pkg/a.js' })
  let out
  try { out = JSON.stringify(await ctx.out) } catch (e) { out = 'threw ' + e.constructor.name }
  ctx.__labFlush?.()
  return { out, log: JSON.stringify(log), events: reports.flatMap(r => r.events), reports }
}
const CORPUS = {
  'short-circuit side effects': `let n = 0; const f = () => (log('f'), n++); out = [f() && f(), 0 && f(), f() || f(), null ?? f(), 0 ?? f(), f() ?? 1, n]`,
  getters: `const o = { get x() { log('get x'); return 1 } }; out = [o.x === 1 ? 'a' : 'b', o.x == o.x, !o.x, o.x || 2]; if (o.x > 0) log('pos'); while (!o.x) break`,
  'optional chaining': `const a = { b: null, c: { d: 0 } }; out = [a?.b?.c ? 1 : 2, a.b?.c === undefined, a?.["b"] ?? 'd', a.c?.d || 'z', a.q?.() ? 1 : 0]`,
  'await in conditions': `async function g() { if (await Promise.resolve(log('aw') || 0)) return 1; return (await 2) > 1 ? 'y' : 'n' } out = g()`,
  generators: `function* gen() { let i = 0; while (i < 3) { if (yield i) log('sent'); i++ } return 'done' } const it = gen(); out = [it.next(), it.next(true), it.next(), it.next(), it.next()]`,
  'classes and super': `class A { constructor(x) { this.x = x || 1 } m() { return this.x > 1 ? 'big' : 'small' } static s() { return this.name } get g() { return this.x } }
class B extends A { constructor() { super(2); if (super.m() === 'big') log('big') } m() { return super.m() + (this.g ? '!' : '?') } }
out = [new B().m(), B.s(), new A().m(), new B() instanceof A]`,
  'class fields, private names, static blocks': `class K { #p = 1; q = this.#p > 0 ? 'pos' : 'neg'; has(o) { return #p in o ? 'has' : 'not' } static { log(this.name ? 'named' : 'anon') } } out = [new K().q, new K().has(new K()), new K().has({})]`,
  'labelled loops': `outer: for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) { if (j === 1) continue outer; if (i === 2) break outer; log(i + ',' + j) } } out = 1`,
  'switch fall-through': `function sw(v) { const r = []; switch (v) { case 1: r.push(1); case 2: r.push(2); break; default: r.push('d') } return r } let k = 0; switch (k++) { case 0: log('zero') } out = [sw(1), sw(2), sw(3), k]`,
  'comma expressions': `let c = 0; if ((c++, c > 0)) log('c'); for (let i = 0, j = 3; i < j, j > 1; i++, j--) log(i, j); out = (c++, c) ? c : -1`,
  'arrow concise bodies': `const f = x => x ? { a: x } : null, g = x => ({ b: x }), h = async x => x && await x, k = x => y => x || y; out = Promise.all([f(1), f(0), g(2), h(3), k(0)(4), [1, 2].map(x => x > 1)])`,
  'default parameters': `function d(a = log('def') || 5, b = a > 3 ? 'hi' : 'lo') { return [a, b] } const e = (x = 1, { y = x ? 2 : 3 } = {}) => x + y; out = [d(), d(1), d(undefined, 'x'), e(), e(0)]`,
  directives: `function s() { "use strict"; return this === undefined } function t() { 'use strict'
  return typeof this } function u() { 'a'; "use strict"; if (this) return 'sloppy'; return 'strict' } out = [s(), t(), u(), (function () { return !this })(), (() => { 'use strict'; return 1 })()]`,
  'top-level "use strict"': `"use strict"
var top = function () { return this === undefined }; out = [top(), (function () { try { undeclared1 = 1; return 'sloppy' } catch (e) { return e.constructor.name } })()]`,
  'this and arguments': `function a() { return arguments.length > 1 ? arguments[1] : this && this.v } function b() { arguments[0] = 9; return arguments[0] === 9 && arguments.length } out = [a(1, 2), a.call({ v: 3 }), a.call(null), b(1)]`,
  'ASI after return': `function r() { return
  1 } function q(a) { if (a)
  return
  log('after') } let x = 1
;[1, 2].forEach(v => log(v))
function z() { return!0||1 } function y() { return(1)?2:3 } out = [r(), q(1), q(0), z(), y()]`,
  'statement starting with ( or [': `var a1 = 1, g = function () { return 5 }
var b1 = g
(a1 || 2) && log('called')
var c1 = [1]
[0] || log('index')
out = [b1, c1]`,
  'typeof, in, instanceof, undeclared names': `out = [typeof nope === 'undefined', 'a' in { a: 1 }, [] instanceof Array, typeof nope2 == 'string' ? 1 : 2]; try { if (!nope3) log(1) } catch (e) { log(e.constructor.name) } try { if (null.x) log('no') } catch (e) { log(e instanceof TypeError) }`,
  'with blocks are left alone': `var w = { k: 1, __labC: 1 }; with (w) { if (k) log('k'); out = k ? 'yes' : 'no' }`,
  loops: `let i = 0; do { i++ } while (i < 5 && i !== 3); for (let j = 0; j < 2; j++) log(j); while (!(i > 10)) i += 3; for (;;) { if (i > 0) break } out = i`,
  'valueOf order and single evaluation': `const L = { valueOf() { log('L'); return 1 } }, R = { valueOf() { log('R'); return 2 } }; out = [L < R, L == 1, R >= L, L != R, L > R ? 'g' : 'l']`,
  'Proxy traps not run by previews': `const P = new Proxy({ a: 1 }, { get(t, k) { log('get ' + String(k)); return t[k] }, has(t, k) { log('has ' + k); return k in t } }); out = ['a' in P, P.a === 1, P ? 1 : 0, !P]`,
  'nested decisions in callbacks': `out = [1, 2, 3, 4].filter(x => x > 1 && x < 3 || x === 4).map(x => x % 2 ? 'odd' : x ?? 'none')`,
  'template literals': `const tag = (s, ...v) => s.raw.join('|') + v.join(); out = [tag\`a\${1 > 0 ? 'y' : 'n'}b\`, \`\${0 || 'z'}\`]`,
  'getters with ?? and ||': `let gets = 0; const o2 = { get v() { gets++; return 0 } }; const r = o2.v ?? 7; out = [r, gets, o2.v || 9, gets, o2.v && 1, gets]`,
  'direct eval': `function ev() { var loc = 5; return eval('loc') > 4 ? 'direct' : 'no' } function ev2() { var loc = 1; return (0, eval)('typeof loc') === 'undefined' } out = [ev(), ev2()]`,
  'new.target': `function N() { if (!new.target) return 'call'; this.k = new.target === N } out = [new N().k, N()]`,
  'async generators': `async function* ag() { for (let i = 0; i < 3; i++) if (i !== 1) yield i } async function run() { const r = []; for await (const v of ag()) if (v >= 0) r.push(v); return r } out = run()`,
  'regex and division': `var xx = 4, g = 2; out = [/a/.test('a') ? 1 : 0, xx / 2 > 1 /* c */ === true, xx
/ g
/ 1 > 0 ? 'div' : 'no']`,
  'HTML-like comments': `var hc = 1 <!-- a comment
--> also a comment
out = hc ? 'one' : 'other'`,
  hashbang: `#!/usr/bin/env node
out = 1 ? 2 : 3`,
  'function names and length': `const named = function () {}, arrow = () => {}, obj = { m() { return 1 }, ['c' + 1]: () => 2 }; out = [named.name, arrow.name, obj.m.name, obj.c1.name, ((a, b) => a || b).length, obj.m()]`,
  'try/finally returns': `function tf() { try { return 'try' } finally { log('finally') } } function tg() { try { throw 1 } catch (e) { return e ? 'caught' : 'no' } } out = [tf(), tg()]`,
  getters_and_setters: `const s = { _v: 0, get v() { return this._v ? this._v : -1 }, set v(x) { if (x > 0) this._v = x } }; s.v = 5; s.v = -1; out = s.v`,
  recursion: `function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2) } out = fib(12)`,
  'yield and super in tests': `function* g() { const r = (yield 1) ? 'a' : 'b'; while (yield r) log('again'); return r } const it = g(); it.next(); const st = [it.next(true), it.next(1), it.next(0)]
class P { m() { return 1 } } class Q extends P { m() { return (() => super.m() ? 'arrow' : 'no')() } } out = [st, new Q().m()]`,
  'return then regex or brace-less branches': `function t(s) { if (!s) return; else if (s === 'x') return 0; return /a/.test(s) ? 1 : 2 } out = [t(''), t('x'), t('a'), t('b')]`,
}
for (const [name, code] of Object.entries(CORPUS)) {
  const ins = instrument(code, { file: 'a.js' })
  assert.ok(!ins.error, `instrument: ${name} parses: ${ins.error}`)
  const plain = await runSnippet(code), traced = await runSnippet(ins.code, true), worker = await runSnippet(ins.code, false)
  assert.equal(traced.out, plain.out, `instrument: ${name}: same result\n${ins.code}`)
  assert.equal(traced.log, plain.log, `instrument: ${name}: same side effects\n${ins.code}`)
  assert.equal(worker.out + worker.log, plain.out + plain.log, `instrument: ${name}: same without the probe (a worker)`)
  assert.equal(ins.code.split(/\r\n?|\n/).length, code.split(/\r\n?|\n/).length, `instrument: ${name}: no line moves`)
  if (name !== 'with blocks are left alone' && name !== 'hashbang') assert.ok(traced.events.length > 0, `instrument: ${name}: events recorded`)
}
{
  // What's recorded: the hosted fixture's boot code, with a failed response.
  const BOOT = `function startCourse() { if (window.scorm) scorm.start() }
function onConfig(r) { if (!r.ok) throw new Error('no config'); return r.json() }
try { onConfig({ ok: false, status: 404 }) } catch (e) { startCourse() }
out = 1`
  const ins = instrument(BOOT, { file: 'boot.js', base: 10 }), byKind = k => ins.sites.findIndex(s => s.kind === k) + 10
  assert.deepEqual(ins.sites.map(s => [s.kind, s.text, s.line]), [['function', 'startCourse', 1], ['if', 'window.scorm', 1], ['function', 'onConfig', 2], ['if', '!r.ok', 2]], 'instrument: sites')
  assert.deepEqual(ins.sites[3].args, ['r.ok'], 'instrument: the operand of !')
  const r = await runSnippet(ins.code.replace(/^/, 'var window = globalThis; '), true)
  const evs = r.events.map(e => e.slice(1))
  assert.deepEqual(evs, [[1, 12], [3, 13, 1, ['boolean', false]], [1, 10], [3, 11, 0, ['undefined']], [2, 10]], 'instrument: the events in order: ' + JSON.stringify(evs))
  const trace = { exec: r.reports.map(x => ({ t: 0, sid: '', frame: x.frame, events: x.events })), sites: Object.assign([], Object.fromEntries(ins.sites.map((s, i) => [i + 10, s]))) }
  assert.deepEqual(lastEvents(trace).map(e => e.say), ['onConfig() called', 'if (!r.ok) → true, r.ok = false', 'startCourse() called', 'if (window.scorm) → false, window.scorm = undefined', 'startCourse() returned'], 'instrument: events described')
  assert.equal(lastEvents(trace, 2).length, 2)
  // Repeats: a tight loop's test is stored 1,000 times, then counted.
  const loop = await runSnippet(instrument('var i = 0; while (i < 5000) i++; out = i').code, true)
  assert.equal(loop.events.filter(e => e[1] === 3).length, 1001, 'trace: 1,000 repeats stored, then the different result')
  assert.deepEqual(loop.events.find(e => e[1] === 4).slice(1), [4, 0, 1, 4000], 'trace: the rest counted')
  // Previews: no content code runs; strings cut to 80 characters; objects give a name and up to five keys.
  const pv = await runSnippet(instrument(`class Thing {} var s = 'x'.repeat(100), o = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }, t = new Thing(), arr = [1], nul = Object.create(null)
if (s) 1; if (o) 1; if (t) 1; if (arr) 1; if (nul) 1; if (NaN) 1; if (1n) 1; if (Symbol('q')) 1; if (function named() {}) 1; out = 1`).code, true)
  assert.deepEqual(pv.events.map(e => e[4]), [['string', 'x'.repeat(80), 100], ['object', 'Object', ['a', 'b', 'c', 'd', 'e'], 6], ['object', 'Thing', [], 0], ['object', 'Array'], ['object', 'Object', [], 0],
    ['number', 'NaN'], ['bigint', '1'], ['symbol', 'Symbol(q)'], ['function', 'named']], 'trace: previews')
  assert.deepEqual([['string', 'x', 100], ['object', 'Thing', ['a'], 3], ['symbol', 'Symbol(q)'], ['number', 2]].map(show), ['"x"… (100 characters)', 'Thing {a, …}', 'Symbol(q)', '2'])
}
{
  // A large real program: acorn itself, instrumented, parses main.js to the same tree as the original (with the probe, and without).
  const acornSrc = readFileSync(new URL('../src/vendor/acorn.js', import.meta.url), 'utf8').replace(/^export .*$/m, 'globalThis.acornParse = parse'), ins = instrument(acornSrc)
  const input = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  const tree = (code, probe) => { const ctx = vm.createContext({ setTimeout: () => 0, location: { href: 'x' }, __labReport() {} }); if (probe) vm.runInContext(TRACE, ctx); vm.runInContext(code, ctx); return JSON.stringify(ctx.acornParse(input, { ecmaVersion: 'latest', sourceType: 'module', locations: true })) }
  const want = tree(acornSrc)
  assert.ok(!ins.error && ins.sites.length > 1000 && tree(ins.code, true) === want && tree(ins.code, false) === want, 'instrument: acorn, instrumented, still parses the same')
}
// Edge cases of the instrumenter itself.
assert.match(instrument('function f(){"use strict"\nreturn 1}').code, /\(globalThis\);function f\(\)\{"use strict";__labT\(1,0\);\nreturn __labR\(0,\(1\)\);__labT\(2,0\);\}$/, 'instrument: the directive stays first')
assert.match(instrument('"use strict";if(a)b').code, /^"use strict";;typeof __labT/, 'instrument: the prelude goes after the program’s directives')
assert.equal(instrument('import x from "y"; export const z = x ? 1 : 2').error, undefined, 'instrument: falls back to module')
assert.equal(instrument('await f(); if (a) b()', { module: true }).error, undefined, 'instrument: top-level await as a module')
assert.match(instrument('if (a b').error, /Unexpected token/, 'instrument: a file that doesn’t parse is reported')
assert.equal(instrument('if (a b').code, 'if (a b', 'instrument: and served unchanged')
assert.deepEqual(instrument('var x = 1').sites, [], 'instrument: nothing to record, nothing changed'); assert.equal(instrument('var x = 1').code, 'var x = 1')
assert.match(instrument('if ((a) === b) 1').code, /__labC\(0,\(\(a\) === b\)\)/, 'instrument: parenthesised operands keep the plain form')
// Pages: inline scripts only (not src, JSON or comments), positions in the page.
const PAGE = '<html><head><!-- <script>if (c) 1</script> --><script src="x.js"></script><script type="application/json">{"a": 1}</script>\n<script>\nif (a) b()\n</script><script type="module">if (m) 1</script></head></html>'
const hp = instrumentHtml(PAGE, { file: 'p.html', base: 5 })
assert.deepEqual(hp.sites.map(s => [s.kind, s.text, s.line, s.col]), [['if', 'a', 3, 5], ['if', 'm', 4, 36]], 'instrument: page sites')
assert.match(hp.code, /<!-- <script>if \(c\) 1<\/script> -->.*\{"a": 1\}<\/script>\n<script>\nif \(__labC\(5,\(a\)\)\) b\(\)\n<\/script><script type="module">if \(__labC\(6,\(m\)\)\) 1/s)
assert.ok(!hp.code.includes('typeof __labT'), 'instrument: no prelude in pages (the probe is always there)')
assert.match(instrumentHtml('<script>if (</script><script>if (b) 1</script>').errors[0], /^inline script at line 1: /, 'instrument: a broken inline script is reported, the others still instrumented')
// Positions back to the original: columns in frames and stacks, coverage offsets, sources.
{
  const src = 'function f(a) { if (a.b === 1) return g(a) }\nvar q = 1', ins = instrument(src, { file: 'f.js' })
  const genCol = ins.code.split('\n')[0].indexOf('g(a)') + 1, origCol = src.indexOf('g(a)') + 1, url = 'lab://run/pkg/f.js?v=1'
  const genOff = ins.code.indexOf('g(a)'), q = ins.code.indexOf('var q')
  const tr = { scripts: [{ sid: '', id: '1', url, from: [] }], requests: [{ from: [{ url, line: 1, col: genCol }] }], console: [{ at: [{ url, line: 1, col: genCol }, { url: 'lab://run/pkg/other.js', line: 1, col: genCol }] }],
    probe: [{ stack: [`f (${url}:1:${genCol})`, `${url}:2:5`] }], coverage: [{ sid: '', id: '1', url, fns: [['f', [genOff, q, 1]]] }], sources: { [url]: ins.code } }
  restoreTrace(tr, new Map([['f.js', { original: src, ...ins }]]))
  assert.equal(tr.requests[0].from[0].col, origCol, 'restore: frame columns'); assert.equal(tr.console[0].at[1].col, genCol, 'restore: other files untouched')
  assert.deepEqual(tr.probe[0].stack, [`f (${url}:1:${origCol})`, `${url}:2:5`], 'restore: probe stacks')
  assert.deepEqual(tr.coverage[0].fns[0][1], [src.indexOf('g(a)'), src.indexOf('var q'), 1], 'restore: coverage offsets')
  assert.equal(tr.sources[url], src, 'restore: the original source')
  const html = '<p>\n<script>if (a) b()</script><script>\n  if (c) d()</script>', hi = instrumentHtml(html, { file: 'p.html' }), purl = 'lab://run/pkg/p.html'
  const second = hi.code.indexOf('<script>\n') + 8, line3 = hi.code.split('\n')[2], genD = line3.indexOf('d()') + 1
  const pt = { scripts: [{ sid: 's', id: '2', url: purl, start: [1, 8] }, { sid: 's', id: '3', url: purl, start: [1, second - hi.code.indexOf('\n') - 1] }],
    coverage: [{ sid: 's', id: '3', url: purl, fns: [['', [0, hi.code.lastIndexOf('</script>') - second, 1]]] }], probe: [{ stack: [`${purl}:3:${genD}`] }], sources: { [purl]: 'instrumented' } }
  restoreTrace(pt, new Map([['p.html', { original: html, ...hi }]]))
  assert.deepEqual(pt.probe[0].stack, [`${purl}:3:${html.split('\n')[2].indexOf('d()') + 1}`], 'restore: page columns')
  assert.equal(pt.sources[purl], '\n  if (c) d()', 'restore: an inline script’s original text')
  assert.deepEqual(pt.coverage[0].fns[0][1], [0, '\n  if (c) d()'.length, 1], 'restore: inline coverage offsets')
}
assert.deepEqual(traceFindings({ sites: [], untraced: [{ file: 'big.js', why: 'over 2 MB' }], truncated: { exec: true }, exec: [{ events: [[0, 1, 0]] }] }).map(f => f.title), ['1 script file was not traced', 'The execution trace is incomplete'], 'trace findings')
assert.deepEqual(traceFindings({ probe: [] }), [], 'trace findings: only for traced runs')
console.log('unit: ok')

// ---- End to end ----
const slow = process.argv.includes('--slow')   // the slower end-to-end checks: run at phase ends (see docs/developer-guide.md)
if (!process.argv.includes('--unit')) {
  const root = new URL('..', import.meta.url).pathname, cli = join(root, 'bin', 'scorm-lab.js'), electron = join(root, 'node_modules', '.bin', 'electron')
  const node = (args, opts = {}) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 120000, ...opts })
  const run = (zip, ...args) => { const r = node(['run', zip, '--wait', '3', '--json', ...args]); assert.ok(r.stdout, 'run printed nothing: ' + r.stderr); return JSON.parse(r.stdout) }
  const calls = r => r.api.map(a => a.call + ' ' + a.el)
  const titles = r => r.findings.map(f => f.title + ' ' + (f.evidence ?? []).join(' '))

  // The CLI without Electron: analyze, items, report, exit statuses.
  const an = JSON.parse(node(['analyze', blank, '--json']).stdout)
  assert.equal(an.verdict.sev, 'error'); assert.ok(an.findings.some(f => /capitals/.test(f.title)), 'cli analyze: capitals')
  assert.equal(an.item.number, 1, 'cli analyze: item number')
  assert.equal(node(['analyze', blank, '--strict']).status, 1, 'cli --strict fails on errors')
  assert.equal(node(['analyze', good, '--strict']).status, 0, 'cli --strict passes a good package')
  assert.equal(node(['analyze', join(work, 'nope.zip')]).status, 2, 'cli: missing file is status 2')
  assert.match(node(['items', good]).stdout, /1 {2}Lesson and quiz/)
  assert.match(node(['report', good, '--fragment']).stdout, /class="sl"[\s\S]*Loading path/, 'cli report (static)')
  console.log('cli: ok')

  // Runs.
  const out = join(work, 'good-run.json'), g = run(good, '--out', out)
  assert.ok(calls(g).includes('LMSInitialize '), 'good: initialised: ' + calls(g))
  const saved = JSON.parse(readFileSync(out, 'utf8'))
  assert.ok(saved.format === 'scorm-lab-run' && saved.trace.coverage.length > 0 && saved.trace.scripts.length > 0, 'good: full run saved with coverage')
  assert.ok(!g.findings.some(f => f.sev === 'error'), 'good: no errors: ' + titles(g))
  assert.ok(g.screens.some(s => s.text > 20), 'good: something showed')
  const idx = id => STEPS.findIndex(s => s[0] === id)
  assert.ok(idx(g.furthest) >= idx('wrote'), 'good: reaches wrote: ' + g.furthest)
  assert.match(g.findings[0].title, /^Got as far as: /, 'good: the milestone finding is first')
  assert.equal(g.findings[0].sev, 'info')
  assert.match(node(['run', good, '--wait', '3']).stdout, /Milestones: ✓ Launch page loaded/, 'cli: milestones line')
  assert.match(node(['report', out]).stdout, /<h2>Milestones<\/h2>/, 'report: milestones strip')
  assert.match(node(['report', out]).stdout, /<!doctype html>[\s\S]*What happened/, 'cli report (run)')
  const res = run(good, '--resume-from', out)
  // The sample only resumes after exit = suspend, which a timed-out run never sets; what carries over is its status.
  assert.ok(res.launch.resume && res.api.some(a => a.el === 'cmi.core.lesson_status' && a.call === 'LMSGetValue' && a.result === 'incomplete'), 'resume: stored data offered: ' + calls(res))
  // The same options by flags and by --options give the same saved launch.options.
  const optFile = join(work, 'opts.json'); writeFileSync(optFile, JSON.stringify({ expose: 'both', depth: 1, wait: 3 }))
  const byFlags = run(good, '--api', 'both', '--depth', '1'), byFile = JSON.parse(node(['run', good, '--options', optFile, '--json']).stdout)
  assert.deepEqual(byFile.launch.options, byFlags.launch.options, 'options: file and flags agree')
  assert.equal(byFile.launch.options.expose, 'both'); assert.equal(byFile.launch.expose, 'both', 'options: version 1 fields kept')
  assert.equal(node(['run', good, '--api', 'x']).status, 2, 'options: bad flag value fails')
  assert.equal(node(['run', good, '--wait', 'x']).status, 2, 'options: bad --wait fails')
  writeFileSync(optFile, '[]'); assert.match(node(['run', good, '--options', optFile]).stderr, /one JSON object/, 'options: array file rejected')
  const mm = run(mismatch)
  assert.equal(mm.api.length, 0, 'mismatch: no calls')
  assert.equal(mm.furthest, 'looked', 'mismatch: reaches looked')
  assert.ok(titles(mm).some(t => /looked for API and found nothing/.test(t)), 'mismatch: lookup finding: ' + titles(mm))
  assert.ok(calls(run(mismatch, '--api', 'both')).includes('LMSInitialize '), 'mismatch with both APIs: calls appear')
  const hRun = run(hosted), hh = titles(hRun)
  assert.ok(hh.some(t => /asked the host for files outside the package/.test(t)), 'hosted: server request: ' + hh)
  assert.ok(hh.some(t => /set its own window.API/.test(t)), 'hosted: own API: ' + hh)
  const rb = titles(run(blank))
  assert.ok(rb.some(t => /blank page/.test(t) && /Not found: js\/app\.js/.test(t)), 'blank run: ' + rb)
  assert.equal(run(blank).furthest, 'launched', 'blank: reaches launched only')
  assert.ok(titles(run(order)).some(t => /run before what they need/.test(t)), 'order run: static finding')
  const rl = titles(run(loader))
  assert.ok(rl.some(t => /stuck on a loading screen/.test(t) && /JSON/.test(t)), 'loader run: ' + rl)
  console.log('runs: ok')

  // Tracing (P1.4): hosted, traced, records its failed configuration check and startCourse, keeps the original source,
  // and finds what the untraced run found.
  const forced = process.env.SCORM_LAB_FORCE_TRACE === '1'
  if (!forced) assert.ok(!saved.trace.sites && !saved.launch.options.trace, 'trace: off by default')
  const trOut = join(work, 'hosted-traced.json'), trRun = run(hosted, '--trace', '--out', trOut), trSaved = JSON.parse(readFileSync(trOut, 'utf8'))
  const says = lastEvents(trSaved.trace, 1e6).map(e => `${e.file}:${e.line} ${e.say}`), sc = says.indexOf('boot.js:3 startCourse() called')
  assert.ok(says.includes('boot.js:4 if (!r.ok) → true, r.ok = false'), 'trace: the failed configuration check: ' + says.join('\n'))
  // scorm.js has loaded by the time the request fails, so window.scorm is there.
  assert.ok(sc >= 0 && /^boot\.js:3 if \(window\.scorm\) → true, window\.scorm = Object \{start, /.test(says[sc + 1]) && says.slice(sc).includes('boot.js:3 startCourse() returned'), 'trace: startCourse and its test: ' + says.slice(sc, sc + 3))
  assert.equal(trSaved.trace.sources['lab://run/pkg/boot.js'], readFileSync(join(work, 'hosted', 'boot.js'), 'utf8'), 'trace: the original source is kept')
  assert.ok(trSaved.trace.sites.some(x => x.file === 'lesson.js') && !trSaved.trace.untraced.length && trSaved.launch.options.trace === true, 'trace: sites, nothing left out, the option saved')
  // Titles only: whether lesson.js starts before hosted's own API is set is a race, traced or not, which changes the milestones and the calls listed.
  const findingTitles = r => r.findings.map(f => f.title).filter(t => !/^Got as far as/.test(t)).sort()
  assert.deepEqual(findingTitles(trRun), findingTitles(hRun), 'trace: the same findings as without it')
  assert.match(node(['report', trOut]).stdout, /<!doctype html>/, 'trace: a traced run makes a report')
  console.log('trace: ok')

  // Overrides: the gated lesson only starts if window.startOK is set. Overriding lesson.js gets it going (CLI), and the
  // override survives a saved run and --options-from.
  const gPlain = run(gated)
  assert.equal(gPlain.api.length, 0, 'gated: no API calls without the override: ' + calls(gPlain))
  assert.ok(!gPlain.findings.some(f => /changed file/.test(f.title)), 'gated: no override note without overrides')
  const gOut = join(work, 'gated-run.json'), gFix = run(gated, '--override', 'lesson.js=' + gatedFix, '--out', gOut)
  assert.ok(calls(gFix).includes('LMSInitialize '), 'gated: the override makes it start: ' + calls(gFix))
  assert.ok(idx(gFix.furthest) > idx(gPlain.furthest), `gated: got further (${gPlain.furthest} → ${gFix.furthest})`)
  assert.match(gFix.findings[1].title, /^This run used 1 changed file: lesson\.js$/, 'gated: the override is listed at the top: ' + titles(gFix))
  assert.deepEqual(Object.keys(gFix.launch.options.files), ['lesson.js']); assert.match(gFix.launch.options.files['lesson.js'].content, /^start\(\)$/m)
  const gSaved = JSON.parse(readFileSync(gOut, 'utf8'))
  assert.equal(gSaved.launch.options.files['lesson.js'].content, readFileSync(gatedFix, 'utf8'), 'overrides round-trip: the saved run keeps the content')
  assert.match(node(['report', gOut]).stdout, /This run used 1 changed file/, 'report: lists the overrides')
  const gAgain = JSON.parse(node(['run', gated, '--options-from', gOut, '--wait', '3', '--json']).stdout)
  assert.deepEqual(gAgain.launch.options.files, gSaved.launch.options.files, 'options-from: the same overrides')
  assert.ok(calls(gAgain).includes('LMSInitialize '), 'options-from: reproduces the run')
  assert.equal(node(['run', gated, '--override', '../x.js=' + gatedFix]).status, 2, 'override: path outside the package is refused')
  assert.equal(node(['run', gated, '--override', 'noequals']).status, 2, 'override: needs path=file')
  assert.equal(node(['run', gated, '--override', 'a.js=' + join(work, 'nope.js')]).status, 2, 'override: missing local file')
  assert.equal(node(['run', gated, '--options-from', join(work, 'nope.json')]).status, 2, 'options-from: missing file')
  console.log('overrides: ok')

  // Pins and answers: the hosted content asks its platform for /api/player/config and falls back to its own API without it.
  const hOut = join(work, 'hosted-answered.json')
  const hAns = run(hosted, '--answer', '/api/player/config=200:{}', '--pin', 'previewMode=false', '--out', hOut), hAnsT = titles(hAns)
  assert.ok(!hAnsT.some(t => /set its own window.API/.test(t)), 'answer: no fallback, so no own API: ' + hAnsT)
  assert.ok(calls(hAns).includes('LMSInitialize '), 'answer: the content reaches SCORM Lab’s LMS: ' + calls(hAns))
  assert.ok(hAns.findings.some(f => /^Answered 1 request with your responses$/.test(f.title) && /api\/player\/config → 200/.test(f.evidence.join())), 'answer: finding: ' + hAnsT)
  assert.ok(hAnsT.some(t => /tried to change a pinned value/.test(t) && /previewMode = false from boot\.js/.test(t)), 'pin: write finding points at boot.js: ' + hAnsT)
  const hSaved = JSON.parse(readFileSync(hOut, 'utf8'))
  assert.ok(hSaved.trace.requests.some(q => q.answered && /\/api\/player\/config$/.test(q.url) && q.status === 200), 'answer: the request is marked answered in the trace')
  assert.deepEqual(hSaved.launch.options.responses, [{ match: '/api/player/config', status: 200, headers: {}, body: '{}' }], 'answer: saved with the run')
  const bodyFile = join(work, 'cfg-body.txt'), optFile2 = join(work, 'answers.json'); writeFileSync(bodyFile, '{}')
  if (slow) {
    const hAgain = JSON.parse(node(['run', hosted, '--options-from', hOut, '--wait', '3', '--json']).stdout)
    assert.ok(!titles(hAgain).some(t => /set its own window.API/.test(t)) && calls(hAgain).includes('LMSInitialize '), 'answer: --options-from reproduces it')
    // An options file with bodyFile (read at the CLI, relative to the file) and a header, plus --answer @file for a response nothing asks for.
    writeFileSync(optFile2, JSON.stringify({ responses: [{ match: '/api/player/config', bodyFile: 'cfg-body.txt', headers: { 'X-Test': '1' } }] }))
    const viaFile = JSON.parse(node(['run', hosted, '--options', optFile2, '--answer', '/nothing/here=@' + bodyFile, '--wait', '3', '--json']).stdout)
    assert.deepEqual(viaFile.launch.options.responses.map(r => r.body), ['{}', '{}'], 'answer: bodyFile and @file are read at the CLI and their content goes into the options')
    assert.ok(viaFile.launch.options.responses.every(r => r.bodyFile === undefined) && viaFile.launch.options.responses[0].headers['X-Test'] === '1')
    assert.ok(!titles(viaFile).some(t => /set its own window.API/.test(t)) && titles(viaFile).some(t => /^A response matched no request/.test(t) && /\/nothing\/here/.test(t)), 'answer: options file, and an unused response is said so: ' + titles(viaFile))
  }
  if (slow) {
    const pOut = join(work, 'pinned-run.json')
    const pRun = run(pinned, '--pin', 'previewMode=false', '--pin', 'config.mode="live"', '--pin', 'locked.a=2', '--pin', 'nobody=1', '--pin', 'navigator.userAgent="LabAgent/1"', '--launch-params', 'a=1&b=2', '--out', pOut), pT = titles(pRun)
    assert.ok(calls(pRun).includes('LMSInitialize '), 'pin: previewMode held false, so the content started: ' + calls(pRun) + pT)
    const pSaved = JSON.parse(readFileSync(pOut, 'utf8')), consoleText = pSaved.trace.console.map(c => c.text).join('\n')
    assert.match(consoleText, /PINNED mode=live preview=false ua=LabAgent\/1/, 'pin: forced values, dotted path and user agent seen by the content: ' + consoleText)
    assert.ok(pT.some(t => /tried to change a pinned value/.test(t) && /previewMode = true from boot\.js/.test(t) && /config\.mode = set by the content from boot\.js/.test(t)), 'pin: both writes reported: ' + pT)
    assert.ok(pT.some(t => /Couldn’t pin locked\.a/.test(t)), 'pin: frozen object reported: ' + pT)
    assert.ok(pT.some(t => /^Pinned value never read nobody = 1$/.test(t)), 'pin: never read, and only that one: ' + pT)
    assert.ok(pSaved.trace.probe.some(p => p.type === 'pin-read' && p.path === 'previewMode'), 'pin: reads reported')
    assert.ok(/[?&]a=1&b=2$/.test(pSaved.launch.url), 'launch parameters are on the launch address: ' + pSaved.launch.url)
    assert.deepEqual(pSaved.launch.options.pins.map(x => x.path), ['previewMode', 'config.mode', 'locked.a', 'nobody', 'navigator.userAgent'], 'pin: saved with the run')
  }
  if (slow) {
    const lx = run(lexical, '--pin', 'previewMode=false'), lxT = titles(lx)
    assert.ok(lxT.some(t => /Couldn’t pin previewMode: the script declares it with let or const .*boot\.js:1/.test(t)), 'pin: let can’t be pinned: ' + lxT)
    assert.ok(!lxT.some(t => /never read|SyntaxError/.test(t)) && !calls(lx).includes('LMSInitialize '), 'pin: the let page ran, and went on with its own value: ' + lxT)
  }
  assert.equal(node(['run', hosted, '--pin', 'previewMode']).status, 2, 'pin: needs a value'); assert.equal(node(['run', hosted, '--pin', 'previewMode=nope']).status, 2, 'pin: value must be JSON')
  assert.equal(node(['run', hosted, '--pin', 'location.search="a"']).status, 2, 'pin: location is refused'); assert.equal(node(['run', hosted, '--answer', 'x']).status, 2, 'answer: bad spelling')
  assert.equal(node(['run', hosted, '--answer', '/a=@' + join(work, 'nope.json')]).status, 2, 'answer: missing file'); assert.equal(node(['run', hosted, '--launch-params', 'a b']).status, 2, 'launch params: no spaces')
  writeFileSync(optFile2, JSON.stringify({ responses: [{ match: 'a', body: 'x', bodyFile: 'cfg-body.txt' }] })); assert.match(node(['run', hosted, '--options', optFile2]).stderr, /both body and bodyFile/, 'answer: body and bodyFile')
  writeFileSync(optFile2, JSON.stringify({ responses: [{ match: 'a', bodyFile: 'missing.txt' }] })); assert.equal(node(['run', hosted, '--options', optFile2]).status, 2, 'answer: missing bodyFile')
  writeFileSync(optFile2, JSON.stringify({ responses: [{ match: 'a', bodyFile: '../cfg-body.txt' }] })); assert.match(node(['run', hosted, '--options', optFile2]).stderr, /must be inside the folder/, 'answer: bodyFile may not leave the options folder')
  writeFileSync(optFile2, JSON.stringify({ responses: [{ match: 'a', bodyFile: bodyFile }] })); assert.match(node(['run', hosted, '--options', optFile2]).stderr, /must be inside the folder/, 'answer: bodyFile may not be absolute')
  console.log('pins and answers: ok')

  // Experiments: the api preset on mismatch shows that offering both APIs, or 1.2, gets further.
  const exDir = join(work, 'experiment')
  const ex = JSON.parse(node(['experiment', mismatch, '--preset', 'api', '--wait', '3', '--json', '--out', exDir]).stdout)
  const exBy = Object.fromEntries(ex.variants.map(v => [v.name, v]))
  assert.deepEqual(ex.variants.map(v => v.name), ['default', 'api both', 'api 1.2', 'api 2004', 'api none'], 'experiment: variants')
  assert.equal(exBy.default.furthest, 'looked', 'experiment: default reaches looked')
  assert.ok(exBy['api both'].better > 0 && exBy['api 1.2'].better > 0, 'experiment: both and 1.2 get further')
  const exTitles = ex.findings.map(f => f.title)
  assert.ok(exTitles.some(t => /^api both gets further/.test(t)) && exTitles.some(t => /^api 1\.2 gets further/.test(t)) && !exTitles.some(t => /api none gets further/.test(t)), 'experiment findings: ' + exTitles)
  assert.ok(existsSync(join(exDir, '02-api_both.json')) && JSON.parse(readFileSync(exBy['api both'].out, 'utf8')).format === 'scorm-lab-run', 'experiment: runs saved in --out')
  const exText = node(['experiment', mismatch, '--variants', (writeFileSync(join(work, 'variants.json'), JSON.stringify([{ name: 'deep', patch: { depth: 1 } }])), join(work, 'variants.json')), '--wait', '3'])
  assert.match(exText.stdout, /Variant\s+Furthest[\s\S]*deep[\s\S]*Nothing tried made a difference/, 'experiment: text table and --variants file: ' + exText.stdout)
  assert.equal(node(['experiment', mismatch, '--preset', 'nope']).status, 2, 'experiment: unknown preset fails')
  assert.equal(node(['experiment', mismatch, '--preset']).status, 2, 'experiment: --preset needs a value')
  assert.equal(node(['experiment', mismatch, '--preset', 'constructor']).status, 2, 'experiment: inherited names are not presets')
  assert.equal(node(['experiment', mismatch, '--variants']).status, 2, 'experiment: --variants needs a value')
  assert.equal(node(['experiment', mismatch, '--preset', 'api', '--variants', 'x.json']).status, 2, 'experiment: both --preset and --variants fails')
  console.log('experiment: ok')

  // Discovery: the needs fixture only starts once /api/player/config answers. Discovery finds the three fields and their
  // types, and the stand-in gets it past looking for the API.
  const dv = JSON.parse(node(['discover', needs, '--wait', '3', '--json']).stdout), dvF = Object.fromEntries(dv.requests[0].fields.map(f => [f.path, f.type]))
  assert.deepEqual([dv.requests[0].match, dvF['lms.enabled'], dvF['lms.version'], dvF['assets.base']], ['/api/player/config', 'boolean', 'string', 'string'], 'discover: fields and types: ' + JSON.stringify(dvF))
  assert.ok(idx(dv.standIn.furthest) >= idx('looked') && idx(dv.standIn.furthest) > idx(dv.noAnswer.furthest), `discover: the stand-in gets further (${dv.noAnswer.furthest} → ${dv.standIn.furthest})`)
  assert.deepEqual(dv.findings.map(f => f.sev + ' ' + f.title.replace(/reaches .*/, 'reaches')), ['warn The content needs these from its server', 'warn With a stand-in for /api/player/config, the content reaches'], 'discover: findings')
  assert.ok(dv.complete && dv.rows.length === 3, 'discover: no answer, @probe, then the skeleton, which found nothing new')
  if (slow) {
    const dvDir = join(work, 'discovery'), dvText = node(['discover', needs, '--wait', '3', '--request', '/api/player/*', '--rounds', '1', '--out', dvDir])
    assert.match(dvText.stdout, /Run\s+Furthest[\s\S]*round 1[\s\S]*lms\.version: string \(compared with a string, boot\.js:4\)[\s\S]*Stand-in response: \{"assets":\{"base":""\},"lms":\{"enabled":false,"version":""\}\}[\s\S]*stopped after 1 rounds/, 'discover: text output: ' + dvText.stdout)
    const dvSaved = JSON.parse(readFileSync(join(dvDir, 'discovery.json'), 'utf8'))
    assert.ok(dvSaved.complete === false && dvSaved.request === '/api/player/*' && existsSync(join(dvDir, '02-round_1.json')), 'discover: --out keeps the runs and discovery.json')
    const dvHosted = JSON.parse(node(['discover', hosted, '--wait', '3', '--json']).stdout)
    assert.deepEqual(dvHosted.findings.map(f => f.title), ['The content didn’t read what /api/player/config sent'], 'discover: hosted asks but reads nothing')
    const dvGood = JSON.parse(node(['discover', good, '--wait', '3', '--json']).stdout)
    assert.deepEqual(dvGood.findings.map(f => f.title), ['The content made no requests to a server'], 'discover: nothing to discover in good')
  }
  for (const bad of [['--rounds', '0'], ['--rounds', 'x'], ['--request', '/(/'], ['--rounds']]) assert.equal(node(['discover', needs, ...bad]).status, 2, 'discover: bad flags fail: ' + bad)
  console.log('discover: ok')

  // Live: a frame appears, a click on Next reaches the course, stop ends the run early.
  const live = join(work, 'live')
  const child = spawn(process.execPath, [cli, 'run', good, '--wait', '60', '--live', live, '--json'], { stdio: ['ignore', 'pipe', 'ignore'] })
  let stdout = ''; child.stdout.on('data', d => { stdout += d })
  const until = async (test, ms, what) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 200))) if (test()) return; throw new Error('timed out: ' + what) }
  await until(() => existsSync(join(live, 'frame.jpg')), 30000, 'first frame')
  const started = Date.now()
  writeFileSync(join(live, 'input', '1.json'), JSON.stringify({ type: 'click', x: 0.631, y: 0.328 }))
  await new Promise(r => setTimeout(r, 1500))
  writeFileSync(join(live, 'input', '2.json'), JSON.stringify({ type: 'stop' }))
  await new Promise(r => child.on('exit', r))
  assert.ok(Date.now() - started < 30000, 'live: stop ended it early')
  const lv = JSON.parse(stdout)
  assert.ok(lv.api.some(a => a.el === 'cmi.core.lesson_location' && a.value === '2'), 'live: the click reached Next')
  assert.ok(STEPS.findIndex(s => s[0] === lv.furthest) >= STEPS.findIndex(s => s[0] === 'wrote'), 'live: reaches at least wrote: ' + lv.furthest)
  console.log('live: ok')

  // The web interface: token, upload, launch, live frames, the run, saved runs.
  const data = join(work, 'web-data')
  const server = spawn(electron, [root, '--serve=0', '--no-window'], { env: { ...process.env, SCORM_LAB_DATA: data }, stdio: ['ignore', 'pipe', 'ignore'] })
  let log = ''; server.stdout.on('data', d => { log += d })
  try {
    await until(() => /http:\/\/\S+/.test(log), 30000, 'web start')
    const url = /http:\/\/\S+/.exec(log)[0], base = url.split('/?')[0]
    assert.equal((await fetch(base + '/api/invoke/state', { method: 'POST' })).status, 401, 'web: no token, no access')
    const login = await fetch(url, { redirect: 'manual' })
    assert.equal(login.status, 302)
    const cookie = login.headers.get('set-cookie').split(';')[0], H = { cookie }
    const invoke = async (name, arg) => { const r = await (await fetch(`${base}/api/invoke/${name}`, { method: 'POST', headers: H, body: JSON.stringify(arg ?? {}) })).json(); if (r.error) throw new Error(r.error); return r.value }
    assert.match(await (await fetch(base + '/', { headers: H })).text(), /bridge\.js/, 'web: UI served')
    const up = await (await fetch(base + '/api/upload?name=good.zip', { method: 'POST', headers: H, body: readFileSync(good) })).json()
    assert.equal(up.value.name, 'good.zip', 'web: upload')
    await invoke('launch', { item: 0, auto: 4 })
    const frames = await fetch(base + '/api/live', { headers: H }), reader = frames.body.getReader()
    let sse = ''
    while (!sse.includes('event: frame')) sse += new TextDecoder().decode((await reader.read()).value)
    reader.cancel()
    assert.ok(/"jpeg":"/.test(sse), 'web: live frame')
    let st
    for (const end = Date.now() + 30000; Date.now() < end; await new Promise(r => setTimeout(r, 500))) { st = await invoke('state'); if (st.runs.length && !st.running) break }
    assert.ok(st.runs[0]?.trace.probe.some(p => p.type === 'api'), 'web: the run recorded API calls')
    const list = await invoke('saved-runs')
    assert.equal(list.length, 1, 'web: run saved')
    assert.equal((await invoke('load-run', { file: list[0].file }))[0].kind, 'package', 'web: saved run loads')
    await assert.rejects(invoke('load-run', { file: '../../etc/passwd' }), /No such saved run/, 'web: load-run stays in the runs folder')
    // An experiment through the handlers: two runs (default and one variant), announced as 'experiment' events.
    const evs = await fetch(base + '/api/events', { headers: H }), evReader = evs.body.getReader()
    let evText = ''
    assert.equal((await invoke('experiment-presets')).join(), 'api,frames,standard', 'web: presets')
    await assert.rejects(invoke('experiment-start', { item: 0, preset: 'nope' }), /No preset/, 'web: unknown preset')
    assert.deepEqual(await invoke('experiment-start', { item: 0, wait: 3, variants: [{ name: 'both', patch: { expose: 'both' } }] }), ['default', 'both'], 'web: experiment starts')
    await assert.rejects(invoke('experiment-start', { item: 0 }), /already running/, 'web: one experiment at a time')
    while (!evText.includes('"state":"done"')) evText += new TextDecoder().decode((await evReader.read()).value)
    evReader.cancel()
    assert.ok(evText.includes('"state":"start"') && (evText.match(/"state":"result"/g) ?? []).length === 2, 'web: experiment events')
    assert.equal((await invoke('state')).runs.length, 4, 'web: both experiment runs recorded (plus the earlier run and its reloaded copy)')
    // Overrides over HTTP: confined to the package, text and binary, the progress finding after a rerun.
    assert.equal((await fetch(base + '/api/upload?name=gated.zip', { method: 'POST', headers: H, body: readFileSync(gated) })).status, 200)
    assert.ok((await invoke('files')).some(f => f.path === 'lesson.js' && f.text && !f.overridden), 'web: files lists the package')
    for (const path of ['../x.js', '/etc/passwd', 'a/../../b', 'a\\b', '']) {
      await assert.rejects(invoke('override-set', { path, content: 'x' }), /isn’t inside the package/, 'web: override path refused: ' + path)
      await assert.rejects(invoke('file', { path }), /isn’t inside the package/, 'web: file path refused: ' + path)
    }
    await assert.rejects(invoke('override-set', { path: 'a.js', base64: '!!' }), /base64/, 'web: bad base64 refused')
    await assert.rejects(invoke('override-set', { path: 'a.js' }), /content/, 'web: nothing to set')
    assert.deepEqual((await invoke('override-set', { path: '__proto__', content: 'x' })).map(o => o.path), ['__proto__'], 'web: __proto__ is just a path')
    await assert.rejects(invoke('file', { path: 'constructor' }), /isn’t in the package/, 'web: constructor is not a file')
    await invoke('override-revert', {})
    const po = await invoke('options', { item: 1, pins: [{ path: 'previewMode', value: false }], responses: [{ match: '/api/*', status: 404, body: '{}' }], launchParams: 'a=1' })
    assert.equal(po.command, "scorm-lab run gated.zip --item 1 --pin previewMode=false --answer '/api/*=404:{}' --launch-params a=1", 'web: options handler builds the pin and answer flags')
    await assert.rejects(invoke('options', { pins: [{ path: 'location.search', value: 'a' }] }), /launch parameters/, 'web: a bad pin is refused')
    await assert.rejects(invoke('options', { responses: [{ match: 'a', bodyFile: '/etc/passwd' }] }), /command line/, 'web: bodyFile is not read over HTTP')
    let ov = await invoke('override-set', { path: 'img/logo.png', base64: 'AAECAw==' })
    assert.deepEqual(ov, [{ path: 'img/logo.png', size: 4, binary: true, added: true }], 'web: a binary replacement')
    assert.equal((await invoke('file', { path: 'img/logo.png' })).content, null, 'web: binary files have no text')
    assert.equal((await invoke('override-diff', { path: 'img/logo.png' })).binary, true)
    assert.deepEqual(await invoke('override-revert', { path: 'img/logo.png' }), [], 'web: revert one')
    const lessonJs = (await invoke('file', { path: 'lesson.js' })).content
    assert.deepEqual(await invoke('override-set', { path: 'lesson.js', content: lessonJs }), [], 'web: a change back to the original is no change')
    await invoke('launch', { item: 0, auto: 3 })
    for (let end = Date.now() + 30000; Date.now() < end; await new Promise(r => setTimeout(r, 500))) if (!(await invoke('state')).running && (await invoke('state')).runs.length === 5) break
    ov = await invoke('override-set', { path: 'lesson.js', content: lessonJs.replace('if (window.startOK) start()', 'start()') })
    assert.equal(ov.length, 1)
    assert.match((await invoke('override-diff', { path: 'lesson.js' })).diff, /^@@[\s\S]*-if \(window\.startOK\) start\(\)\n\+start\(\)/, 'web: diff view')
    assert.equal((await invoke('state')).pkg.overrides.length, 1, 'web: state lists the overrides')
    assert.ok((await invoke('options', {})).options.files['lesson.js'], 'web: options carry the session overrides')
    await invoke('launch', { item: 0, auto: 3 })
    let last
    for (let end = Date.now() + 30000; Date.now() < end; await new Promise(r => setTimeout(r, 500))) { const s2 = await invoke('state'); if (!s2.running && s2.runs.length === 6) { last = s2.runs[5]; break } }
    assert.ok(last, 'web: the run with overrides finished')
    assert.ok(last.findings.some(f => /This run used 1 changed file/.test(f.title)), 'web: override note')
    assert.ok(last.findings.some(f => /^Compared with the run before the changes: got further/.test(f.title)), 'web: progress finding: ' + last.findings.map(f => f.title))
    assert.deepEqual(await invoke('override-revert', {}), [], 'web: revert all')
    // A traced run through the handlers: the Execution tab gets the last events, and the code of one of them.
    await invoke('launch', { item: 0, auto: 3, trace: true })
    let traced
    for (let end = Date.now() + 30000; Date.now() < end; await new Promise(r => setTimeout(r, 500))) { const s3 = await invoke('state'); if (!s3.running && s3.runs.length === 7) { traced = s3.runs[6]; break } }
    assert.ok(traced?.trace.execTail.length > 0 && traced.trace.execEvents >= traced.trace.execTail.length && traced.trace.exec === undefined && traced.trace.sites === undefined, 'web: a traced run sends its last events, not the whole trace')
    const gate = traced.trace.execTail.find(e => e.say === 'if (window.startOK) → false, window.startOK = undefined')
    assert.equal(gate?.file, 'lesson.js', 'web: the gated decision: ' + traced.trace.execTail.map(e => e.say).slice(-5))
    assert.match((await invoke('source', { run: traced.id, path: 'lesson.js' })).split(/\n/)[gate.line - 1], /if \(window\.startOK\) start\(\)/, 'web: the code at the event')
    assert.match(await invoke('source', { run: traced.id, path: 'lesson.html' }), /<html/i, 'web: a page’s code comes from the package')
    // Discovery over the handlers (slow): events for each round, then the result, which is also saved.
    await assert.rejects(invoke('discover-start', { item: 0, rounds: 0 }), /Rounds/, 'web: bad rounds refused')
    if (slow) {
      assert.equal((await fetch(base + '/api/upload?name=needs.zip', { method: 'POST', headers: H, body: readFileSync(needs) })).status, 200)
      const dEvs = await fetch(base + '/api/events', { headers: H }), dReader = dEvs.body.getReader()
      let dText = ''
      assert.equal(await invoke('discover-start', { item: 0, wait: 3 }), true, 'web: discovery starts')
      await assert.rejects(invoke('discover-start', { item: 0 }), /already running/, 'web: one at a time')
      while (!/event: discover\ndata: \{"state":"(done|error)".*\n/.test(dText)) dText += new TextDecoder().decode((await dReader.read()).value)
      dReader.cancel()
      const done = JSON.parse(/event: discover\ndata: (\{"state":"done".*)\n/.exec(dText)?.[1] ?? 'null')
      assert.ok(done, 'web: discovery finished: ' + dText.slice(-500))
      assert.equal((dText.match(/"state":"round"/g) ?? []).length, 3, 'web: an event per run')
      assert.deepEqual(done.result.requests[0].skeleton, { assets: { base: '' }, lms: { enabled: false, version: '' } }, 'web: the skeleton')
      assert.ok(existsSync(done.result.file) && JSON.parse(readFileSync(done.result.file, 'utf8')).format === 'scorm-lab-discovery', 'web: the result is saved')
    }
    console.log('web: ok')
  } finally { server.kill() }

  // The Concierge module, if the concierge repo is next to this one.
  const mod = join(root, '..', 'concierge', 'modules', 'scorm-lab', 'run')
  if (existsSync(mod)) {
    const dataDir = mkdtempSync(join(tmpdir(), 'scorm-lab-concierge-'))
    writeFileSync(join(dataDir, 'config.json'), JSON.stringify({ scormlab: root, node: process.execPath }))
    const cgi = (method, path, query = '', input = '') => {
      const r = spawnSync(mod, [], { cwd: dataDir, input, encoding: input instanceof Buffer ? undefined : 'utf8', timeout: 60000,
        env: { HOME: process.env.HOME, USER: process.env.USER, PATH: '/usr/bin:/bin', CONCIERGE_BASE: '/m/scorm-lab', CONCIERGE_CSRF: 'tok', CONCIERGE_MODULE: join(mod, '..'), REQUEST_METHOD: method, PATH_INFO: path, QUERY_STRING: query } })
      assert.equal(r.status, 0, `module ${path}: ${r.stderr}`)
      return String(r.stdout)
    }
    assert.match(cgi('POST', '/upload', 'name=blank.zip', readFileSync(blank)), /data-scorm-lab-id="1"/)
    assert.match(cgi('GET', '/pkg', 'id=1'), /wrong capitals/, 'module: static report')
    cgi('POST', '/run', '', 'csrf=tok&id=1&item=1&api=manifest&depth=0&wait=10')
    let page = ''
    for (const end = Date.now() + 60000; Date.now() < end && !/Download the report/.test(page); await new Promise(r => setTimeout(r, 1000))) page = cgi('GET', '/show', 'id=1&run=1')
    assert.match(page, /blank page/, 'module: run report')
    assert.match(cgi('GET', '/widget'), /badge err/, 'module: widget')
    assert.match(cgi('GET', '/download', 'id=1&run=1&what=run'), /^Concierge-File: \/.*\.json/, 'module: download')
    console.log('concierge module: ok')
  } else console.log('concierge module: skipped (no ../concierge)')

  // Tracing (slow): the overhead on good (when its page has loaded, the median of three runs), and every end-to-end
  // check again with every run traced (SCORM_LAB_FORCE_TRACE=1).
  if (slow && !forced) {
    const loaded = (...a) => { const o = join(work, 'overhead.json'); run(good, '--out', o, ...a); return JSON.parse(readFileSync(o, 'utf8')).trace.probe.find(p => p.type === 'dom' && p.readyState === 'complete' && /lesson\.html/.test(p.frame))?.t }
    const median = f => [f(), f(), f()].sort((a, b) => a - b)[1], plainMs = median(() => loaded()), tracedMs = median(() => loaded('--trace'))
    console.log(`trace overhead: good loaded in ${plainMs} ms, ${tracedMs} ms traced`)
    assert.ok(tracedMs < 2 * plainMs + 50, `trace: under twice the time (${plainMs} → ${tracedMs} ms)`)
    const t0 = Date.now(), all = spawnSync(process.execPath, [new URL(import.meta.url).pathname, '--slow'], { env: { ...process.env, SCORM_LAB_FORCE_TRACE: '1' }, encoding: 'utf8', maxBuffer: 64 * 1024 ** 2 })
    assert.equal(all.status, 0, 'forced trace pass:\n' + all.stdout.slice(-2000) + all.stderr.slice(-4000))
    console.log(`forced trace pass: ok (${Math.round((Date.now() - t0) / 1000)} s)`)
  }
  console.log('end to end: ok')
}
