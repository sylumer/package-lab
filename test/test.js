// Tests: unit checks of the pure parts, then (skipped with --unit) end-to-end checks in Electron: the CLI's analyze,
// run and report on six fixture packages, live input, the web interface, and the Concierge module if it's next to
// this repo (../concierge/modules/package-lab). Fixtures are built from src/sample, the sample SCORM 1.2
// package from toolbox. See docs/developer-guide.md.
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { dirname, join, relative, sep } from 'node:path'
import { unzip, zip, crc32, crc32Table } from '../src/zip.js'
import { FIXES, FIX_IDS, correct, exportFixed, fixedName, prove, staticAll } from '../src/fixes.js'
import { analyze, pkgPath } from '../src/analyze.js'
import { matchByPath, branchDiff, compare, segs } from '../src/diff.js'
import { staticFindings, runFindings, launchFindings } from '../src/rules.js'
import { bootGraph, resolveRef } from '../src/bootpath.js'
import { renderReport, verdict, runVerdict, timelineHtml, experimentHtml } from '../src/report.js'
import { COMMANDS, zshCompletion } from '../src/completion.js'
import { DEFAULT_PORT, validPort, validTheme, readSettings, writeSettings } from '../src/settings.js'
import { OPEN, CHECK, RUN, EXPERIMENT, FIX, BATCH, WEB } from '../scripts/alfred-scripts.js'
import { redactRun, kept } from '../src/redact.js'
import { timelineModel, timelineView } from '../src/timeline.js'
import { normaliseOptions, cliCommand, VIEWPORTS, viewportName, optionsSummary } from '../src/options.js'
import { PRESETS, planVariants, runResult, summarise, experimentFindings } from '../src/experiments.js'
import { diffLines, unified } from '../src/textdiff.js'
import { markdown, slugOf, headings, searchDocs, keysFor } from '../src/ui/markdown.js'
import { dataDir, appBinaries, executable, openCommand, installHint, dataOverride, PORTABLE_DIR, runnerEnv } from '../src/platform.js'
import icoWriter from '../scripts/ico.cjs'
import { DOCS, GUIDE, MAX_IMAGE, inlineImages } from '../src/docs.js'
import { comparePackages, compareFiles, compareManifests, compareBoots, compareFindings, compareBehaviour } from '../src/pkgdiff.js'
import { isText, entryFor, entryBuffer, overlayFiles, overrideList, overrideFinding, overrideProgressFinding } from '../src/overlay.js'
import { pinPathProblem, matcher, answerFor, buildAnswer, pinPrefix, userAgentPin, lexicalDeclaration, pinFindings, parsePinFlag, parseAnswerFlag } from '../src/pins.js'
import { STEPS, milestones, furthest, firstMissing, milestoneFinding, progress, runCounts } from '../src/milestones.js'
import { probeBody, shapePrefix, requestPattern, serverRequests, sourceHint, shapeReads, inferShape, discover, discoverFindings, checkDiscover } from '../src/shape.js'
import { servedBody } from '../src/pins.js'
import { instrument, instrumentHtml, restoreTrace, lastEvents, show, traceFindings } from '../src/instrument.js'
import { stall, stallFinding } from '../src/stall.js'
import { Recorder, shiftTimes, isBlocked, nameAt } from '../src/recorder.js'
import { launchPlan, serveRequest, WEBKIT_ORIGINS, runAnalysis } from '../src/launch.js'
import { PROFILES, PROFILE_NAMES, checkProfile, resolveProfile, launchProfile, apiAt, fillParams, storageMode } from '../src/profiles.js'
import { originFindings, storageFindings } from '../src/rules.js'
import { setDelay, move, remove, insertWait, setFields, edit as editMacro, macroRows, macroTable, macroName } from '../src/macros.js'
import { cycleFindings, cycleRows, readMacro, macroFile as macroFileOf, macroDelays, quietFor, withMacroSize, macroFromTrace, cleanTarget, resumeOptions } from '../src/cycle.js'
import { drill, deadEnd, untakenRange, programs, assignments, codePath, watchPins } from '../src/drilldown.js'
import './packs.js'
import { cmi5Package, cmi5Steps, tincanPackage } from './xapi.js'
import { CMI5_STEPS } from '../src/milestones.js'
import './codeview.js'
import './batch.js'
import vm from 'node:vm'

const base = fileURLToPath(new URL('../src/sample/', import.meta.url)), work = mkdtempSync(join(tmpdir(), 'package-lab-'))
// Fixtures are zipped, and written zips checked, by an outside tool, not our own zip.js: Info-ZIP, or on Windows
// (which has neither zip nor unzip) its built-in tar.exe, which writes zips and checks their CRCs as it extracts.
const isWin = process.platform === 'win32'
const zipDir = (dir, out) => isWin ? execFileSync('tar', ['-a', '-cf', out, ...readdirSync(dir)], { cwd: dir }) : execFileSync('zip', ['-qr', out, '.'], { cwd: dir })
const unzipT = path => spawnSync('unzip', ['-t', path], { encoding: 'utf8' })   // Info-ZIP on Windows too (the tests need its zip already); Windows' tar can't read non-ASCII names in a non-UTF-8 console
function fixture(name, edit = () => {}) {
  const dir = join(work, name)
  cpSync(base, dir, { recursive: true })
  edit(dir)
  zipDir(dir, join(work, name + '.zip'))
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

// chromeonly: reads navigator.userAgentData.brands without a guard, which only Chromium has: it fails in WebKit (Safari).
const chromeOnly = fixture('chromeonly', d => sub(d, 'lesson.js', /^/, "var brands = navigator.userAgentData.brands.map(function (b) { return b.brand }).join()\n"))

// noexit: never sets cmi.core.exit, so an LMS has no reason to offer a resume. restart: reads its bookmark and then opens page 1 anyway.
const noExit = fixture('noexit', d => sub(d, 'scorm.js', /\s*api\.LMSSetValue\('cmi\.core\.exit', exit\)/, ''))
const restart = fixture('restart', d => sub(d, 'lesson.js', /show\(entry === 'resume'[^\n]*\n/, "scorm.get('cmi.core.lesson_location')\n  show(1)\n"))

// typing: a text field and a password field, to see what is kept of typed text.
const typing = fixture('typing', d => sub(d, 'lesson.html', '<nav>', '<p><input id="name" type="text"> <input id="pw" type="password" autocomplete="current-password"></p><nav>'))
// latebutton: Next is there from the start but only visible, and so only clickable and only in the page's text, after 3 s. It is a big
// button in the top left corner, so a click at (0.15, 0.1) hits it at any window size.
const latebutton = fixture('latebutton', d => writeFileSync(join(d, 'lesson.js'), readFileSync(join(d, 'lesson.js'), 'utf8') + "\nvar late = document.getElementById('next'); late.style.cssText = 'position:fixed;left:10px;top:10px;width:300px;height:100px;visibility:hidden'; setTimeout(function () { late.style.visibility = 'visible' }, 3000)\n"))
// movebutton: Next is pinned 20px from the top right corner, so its fraction across the window changes with the width. It has a unique id.
const movebutton = fixture('movebutton', d => writeFileSync(join(d, 'lesson.js'), readFileSync(join(d, 'lesson.js'), 'utf8') + "\ndocument.getElementById('next').style.cssText = 'position:fixed;right:20px;top:20px;width:100px;height:40px'\n"))
// clickfields: a password field and a textarea with text in it, at known places (the top left corner), to see what a click on them records.
const clickfields = fixture('clickfields', d => sub(d, 'lesson.html', '<nav>', '<input id="pw" type="password" placeholder="Your password" style="position:fixed;left:0;top:0;width:300px;height:50px"><textarea id="ta" placeholder="Notes" style="position:fixed;left:0;top:60px;width:300px;height:50px">my private notes</textarea><nav>'))
// handshake: tells its parent it is ready and waits for {type: 'launch'}, which no LMS here sends. polling: checks
// window.API every 250 ms (the LMS offers it on the parent, so it never finds it on its own window).
const handshake = fixture('handshake', d => {
  writeFileSync(join(d, 'boot.js'), `parent.postMessage({ type: 'player-ready' }, '*')
addEventListener('message', function (e) { if (e.data && e.data.type === 'launch') scorm.start() })
`)
  sub(d, 'lesson.html', /<script/, '<script src="boot.js"></script><script')
  sub(d, 'lesson.js', /scorm\.start\(\)/g, 'true')
})
const polling = fixture('polling', d => {
  writeFileSync(join(d, 'boot.js'), `var waited = setInterval(function () {
  if (window.API) { clearInterval(waited); scorm.start() }
}, 250)
`)
  sub(d, 'lesson.html', /<script/, '<script src="boot.js"></script><script')
  sub(d, 'lesson.js', /scorm\.start\(\)/g, 'true')
})

// stored: keeps the learner's place in localStorage and only starts when that worked, which it never does where storage
// is blocked (Safari, content in another site's frame): the lesson never starts, so it never looks for the LMS.
const stored = fixture('stored', d => {
  writeFileSync(join(d, 'boot.js'), `// Restores the learner's place from localStorage before the lesson starts.
var saved = JSON.parse(localStorage.getItem('lab-state') || '{}')
saved.visits = (saved.visits || 0) + 1
localStorage.setItem('lab-state', JSON.stringify(saved))
window.labState = saved
`)
  sub(d, 'lesson.html', '<script src="lesson.js" defer>', '<script src="boot.js"></script><script src="lesson.js" defer>')
  sub(d, 'lesson.js', /\nstart\(\)\s*$/, '\nif (window.labState) start()\n')
})

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

// levels (P1.5): the lesson starts only if window.player is ready; player is set by js/player.js, which boot.js loads only
// if config.cdn is set; config comes from data/config.json, which has no cdn. The drill-down must explain it to the JSON file.
const LEVELS_BOOT = `var config = {}
function begin() {
  if (window.player && player.ready) start()
}
fetch('data/config.json').then(function (r) { return r.json() }).then(function (c) {
  config = c
  if (config.cdn) {
    var s = document.createElement('script')
    s.src = 'js/player.js'
    s.onload = begin
    document.head.appendChild(s)
  } else setTimeout(begin, 100)
})
`
const levels = fixture('levels', d => {
  mkdirSync(join(d, 'js')); mkdirSync(join(d, 'data'))
  writeFileSync(join(d, 'data', 'config.json'), '{ "start": true }\n')
  writeFileSync(join(d, 'js', 'player.js'), 'window.player = { ready: true }\n')
  writeFileSync(join(d, 'boot.js'), LEVELS_BOOT)
  sub(d, 'lesson.html', '<script src="lesson.js" defer></script>', '<script src="lesson.js" defer></script><script src="boot.js" defer></script>')
  sub(d, 'lesson.js', /\nstart\(\)\s*$/, '\n')
})

// ---- Unit ----
const files = unzip(readFileSync(good))
assert.throws(() => unzip(zip(new Map([['a.bin', Buffer.alloc(4096)], ['b.bin', Buffer.alloc(4096)]])), 6000), /unzips to more than/, 'unzip: a package that inflates past the cap is refused (zip bomb)')
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
// A use inside a function on the same line (a listener) runs later, so it isn't “before what it needs”; an IIFE runs at once.
const orderOf = boot => { const f = unzip(readFileSync(good)); f.set('boot.js', Buffer.from(boot)); f.set('lesson.html', Buffer.from(f.get('lesson.html').toString().replace('<script', '<script src="boot.js"></script><script'))); return bootGraph(f, 'lesson.html').risks.some(r => /run before what they need/.test(r.title)) }
assert.equal(orderOf("addEventListener('message', function (e) { scorm.start() })\n"), false, 'order: a use inside a listener runs later')
assert.equal(orderOf("addEventListener('load', () => scorm.start())\n"), false, 'order: a use inside an arrow function runs later')
assert.equal(orderOf("(function () { scorm.start() })()\n"), true, 'order: a use inside an IIFE runs at once')
assert.equal(orderOf("scorm.start()\n"), true, 'order: a use at the top level runs at once')
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
assert.ok(!reached(trace({ probe: [{ type: 'dom', t: 5, frame: 'lab://run/__lab/host.html', text: 99, media: 0 }] })).includes('shown'), 'milestones: Package Lab’s own page is not content')
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
// runVerdict (E2.4): the banner's sentence and severity, over the same milestone data.
const ran = 'Ran through: launched, talked to the LMS and saved its progress'
assert.deepEqual(runVerdict(milestones(trace(), bg), []), { sev: 'ok', text: 'Didn’t reach any step. The first missing one is “Launch page loaded”.' }, 'runVerdict: nothing reached')
assert.deepEqual(runVerdict(milestones(trace({ requests: reqs('lesson.html') }), bg), []), { sev: 'ok', text: 'Got as far as “Launch page loaded”, but didn’t reach “Scripts loaded”.' }, 'runVerdict: launched only')
assert.deepEqual(runVerdict(mk('looked'), []), { sev: 'ok', text: 'Got as far as “Looked for the API”, but didn’t reach “Content shown”.' }, 'runVerdict: looked but not found')
assert.deepEqual(runVerdict(milestones(trace({ requests: allReqs, probe: [shownT.probe[0], { type: 'lookup', t: 1, name: 'API', found: true, frame: pf }, call('LMSInitialize')] }), bg), []), { sev: 'ok', text: 'Got as far as “Initialised”, but didn’t reach “Read saved data”.' }, 'runVerdict: initialised but never wrote')
assert.deepEqual(runVerdict(full, []), { sev: 'ok', text: ran }, 'runVerdict: all reached')
assert.deepEqual(runVerdict(full, [{ sev: 'info', title: 'i' }, { sev: 'warn', title: 'w' }]), { sev: 'warn', text: ran }, 'runVerdict: all reached with a warning')
assert.equal(runVerdict(full, [{ sev: 'error', title: 'e' }, { sev: 'warn', title: 'w' }]).sev, 'error', 'runVerdict: the worst finding decides')
assert.equal(runVerdict(full, [{ sev: 'info', title: 'i' }]).sev, 'ok', 'runVerdict: info-only findings give ok')
assert.deepEqual(runVerdict([], []), { sev: 'ok', text: 'Didn’t reach any step.' }, 'runVerdict: an empty milestone list is nothing reached')
const html = renderReport({ title: 'T', findings: [{ sev: 'error', title: '<img src=x onerror=alert(1)>', evidence: ['a & b'] }], fragment: true })
assert.ok(html.includes('&lt;img src=x') && !html.includes('<img src=x') && html.includes('a &amp; b'), 'report escapes')
assert.deepEqual(verdict([{ sev: 'warn', title: 'w' }, { sev: 'error', title: 'e' }]), { sev: 'error', title: 'e' })
assert.deepEqual(verdict([]).sev, 'ok')
// Launch options: defaults, validation, unknown fields, the CLI line.
const dflt = normaliseOptions()
assert.deepEqual(dflt, { expose: 'manifest', depth: 0, opener: false, resume: false, caught: true, auto: 0, wait: 10, profile: 'generic', browser: 'chromium', viewport: null,
  files: {}, pins: [], responses: [], launchParams: '', storage: 'normal', trace: false, macro: [], recordInput: false, tool: null }, 'options: defaults')
assert.deepEqual(normaliseOptions({}), dflt); assert.notEqual(normaliseOptions().files, normaliseOptions().files, 'options: defaults are not shared')
assert.deepEqual(normaliseOptions({ depth: '3', auto: '20', expose: '1.2', viewport: { width: 390, height: 844 } }), { ...dflt, depth: 3, auto: 20, expose: '1.2', viewport: { width: 390, height: 844, deviceScaleFactor: 1, mobile: false, touch: false, userAgent: '' } }, 'options: a saved { width, height } viewport reads as a plain size')
for (const [o, re] of [[{ nope: 1 }, /Unknown option: nope/], [{ nope: 1, other: 2 }, /Unknown options: nope, other/], [{ expose: 'x' }, /expose.*one of/], [{ depth: 6 }, /depth/], [{ depth: 1.5 }, /depth/],
  [{ depth: 'a' }, /depth/], [{ opener: 'yes' }, /opener/], [{ caught: 0 }, /caught/], [{ resume: null }, /resume/], [{ auto: -1 }, /auto/], [{ wait: 0 }, /wait/], [{ trace: 1 }, /trace/],
  [{ profile: '' }, /profile/], [{ browser: 'firefox' }, /browser.*one of chromium, webkit/], [{ viewport: { width: 1 } }, /viewport/], [{ viewport: { width: 0, height: 5 } }, /viewport/], [{ viewport: 'tv' }, /viewport.*preset/], [{ viewport: '390' }, /viewport/], [{ viewport: '50x50' }, /viewport/],
  [{ viewport: { width: 400, height: 800, mobile: 'yes' } }, /mobile/], [{ viewport: { width: 400, height: 800, deviceScaleFactor: 9 } }, /deviceScaleFactor/], [{ viewport: { width: 400, height: 800, nope: 1 } }, /unknown field: nope/], [{ viewport: { width: 400, height: 800, userAgent: 'a\nb' } }, /userAgent/], [{ files: [] }, /files/],
  [{ files: { 'a.js': 1 } }, /files/], [{ pins: {} }, /pins/], [{ pins: [1] }, /pins/], [{ responses: 'x' }, /responses/],
  [{ pins: [{ path: 'a b', value: 1 }] }, /pins.*path/], [{ pins: [{ path: 'a' }] }, /pins.*value/], [{ pins: [{ path: 'a', value: undefined }] }, /pins.*value/], [{ pins: [{ path: 'a', value: 1, frames: 'top' }] }, /frames/],
  [{ pins: [{ path: 'a', value: 1, mode: 'nope' }] }, /mode/], [{ pins: [{ path: 'navigator.userAgent', mode: 'watch' }] }, /watch/], [{ pins: [{ path: 'a', value: 1, nope: 1 }] }, /unknown field: nope/], [{ pins: [{ path: 'API', value: 1 }] }, /can’t pin API/],
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
assert.equal(cliCommand(dflt, { zip: 'a b.zip', item: 2 }), "package-lab run 'a b.zip' --item 2")
assert.equal(cliCommand({ expose: 'both', depth: 2, opener: true, caught: false, auto: 20, trace: true }), 'package-lab run package.zip --api both --depth 2 --window --no-caught --wait 20 --trace')
// Browser and device size (P2.3).
assert.equal(normaliseOptions({ browser: 'webkit' }).browser, 'webkit', 'browser: webkit')
for (const [name, v] of Object.entries(VIEWPORTS)) { assert.deepEqual(normaliseOptions({ viewport: name }).viewport, v, 'viewport: preset ' + name); assert.equal(viewportName(v), name) }
assert.deepEqual(Object.keys(VIEWPORTS), ['iphone', 'ipad', 'android-phone'], 'viewport: the presets')
assert.ok(Object.values(VIEWPORTS).every(v => v.mobile && v.touch && v.deviceScaleFactor > 1 && /Mozilla/.test(v.userAgent)), 'viewport: presets are mobile, with touch, scale and user agent')
assert.deepEqual(normaliseOptions({ viewport: '390x844' }).viewport, { width: 390, height: 844, deviceScaleFactor: 1, mobile: false, touch: false, userAgent: '' }, 'viewport: WxH')
assert.deepEqual(normaliseOptions({ viewport: ' 1024X768 ' }).viewport, normaliseOptions({ viewport: { width: 1024, height: 768 } }).viewport, 'viewport: WxH is a plain size')
assert.deepEqual(normaliseOptions({ viewport: normaliseOptions({ viewport: 'iphone' }).viewport }).viewport, VIEWPORTS.iphone, 'viewport: normalising twice changes nothing')
assert.equal(viewportName(normaliseOptions({ viewport: '390x844' }).viewport), '390x844', 'viewportName: a plain size')
// optionsSummary (E2.2): the labels for the chip beside Run.
const sum = o => optionsSummary(normaliseOptions(o))
assert.deepEqual(sum({}), [], 'optionsSummary: the defaults say nothing')
assert.deepEqual(sum({ expose: '2004', profile: 'moodle', viewport: 'iphone' }), ['SCORM 2004', 'Moodle', 'iPhone'], 'optionsSummary: the spec example')
assert.deepEqual(sum({ viewport: '500x700' }), ['500x700'], 'optionsSummary: a custom size')
for (const [o, want] of [[{ expose: '1.2' }, 'SCORM 1.2'], [{ expose: 'both' }, 'Both APIs'], [{ expose: 'none' }, 'No API'], [{ profile: { base: 'moodle', apiDelay: 5 } }, 'Custom profile'], [{ browser: 'webkit' }, 'WebKit'],
  [{ viewport: 'ipad' }, 'iPad'], [{ viewport: 'android-phone' }, 'Android phone'], [{ storage: 'blocked' }, 'Storage blocked'], [{ depth: 2 }, 'Frame depth 2'], [{ opener: true }, 'New window'], [{ resume: true }, 'Resume'],
  [{ auto: 30 }, 'Stop after 30 s'], [{ auto: 120 }, 'Stop after 2 min'], [{ caught: false }, 'No caught errors'], [{ trace: true }, 'Traced'], [{ recordInput: true }, 'Typed text kept'], [{ tool: 'rise' }, 'Tool: rise'],
  [{ launchParams: 'a=1' }, 'Parameters'], [{ macro: [{ t: 0, type: 'key', key: 'Tab' }] }, '1 macro step'], [{ pins: [{ path: 'a', value: 1 }] }, '1 pin'], [{ responses: [{ match: '/a', body: '' }, { match: '/b', body: '' }] }, '2 answers'],
  [{ files: { 'a.js': { content: 'x' } } }, '1 changed file']]) assert.deepEqual(sum(o), [want], 'optionsSummary: ' + want)
assert.deepEqual(sum({ expose: '2004', profile: 'moodle', browser: 'webkit', viewport: 'iphone', storage: 'blocked', trace: true }), ['SCORM 2004', 'Moodle', 'WebKit', 'iPhone', '+2 more'], 'optionsSummary: at most 4, then +N more')
assert.deepEqual(sum({ expose: '2004', profile: 'moodle', browser: 'webkit', viewport: 'iphone' }), ['SCORM 2004', 'Moodle', 'WebKit', 'iPhone'], 'optionsSummary: exactly 4 has no +N')
assert.equal(cliCommand({ browser: 'webkit' }), 'package-lab run package.zip --browser webkit', 'cliCommand: --browser')
assert.equal(cliCommand({ viewport: 'iphone', browser: 'webkit' }), 'package-lab run package.zip --browser webkit --viewport iphone', 'cliCommand: --viewport preset')
assert.equal(cliCommand({ viewport: { width: 390, height: 844 } }), 'package-lab run package.zip --viewport 390x844', 'cliCommand: --viewport WxH')
assert.equal(cliCommand({ viewport: { width: 390, height: 844, mobile: true } }), 'package-lab run package.zip --options options.json', 'cliCommand: a size with settings no name carries goes to the options file')
// Storage (P2.2): the three modes, the flag, and the profile's cookies field.
for (const s of ['normal', 'blocked', 'partitioned']) assert.equal(normaliseOptions({ storage: s }).storage, s, 'storage: ' + s)
assert.throws(() => normaliseOptions({ storage: 'nope' }), /storage.*one of normal, blocked, partitioned/, 'storage: other words are refused')
assert.equal(cliCommand({ storage: 'blocked' }), 'package-lab run package.zip --storage blocked', 'cliCommand: --storage')
assert.deepEqual(['normal', 'blocked', 'partitioned'].map(storage => storageMode(normaliseOptions({ storage }))), ['normal', 'blocked', 'partitioned'], 'storageMode: the option')
assert.deepEqual([{}, { profile: 'scorm-cloud' }, { profile: 'scorm-cloud', storage: 'partitioned' }, { profile: { cookies: 'third-party-blocked' } }, { profile: 'moodle' }].map(o => storageMode(normaliseOptions(o))),
  ['normal', 'blocked', 'partitioned', 'blocked', 'normal'], 'storageMode: normal means the profile’s cookies field says')
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
// The storage preset (P2.2): normal and blocked; the one equal to the default is skipped. Blocked getting less far is a finding.
assert.deepEqual(planVariants({ base: {}, variants: PRESETS.storage }).map(p => p.name), ['default', 'storage blocked'], 'experiments: storage preset, normal is the default')
assert.deepEqual(planVariants({ base: { storage: 'blocked' }, variants: PRESETS.storage }).map(p => p.name), ['default', 'storage normal'], 'experiments: storage preset from a blocked base')
assert.deepEqual(planVariants({ base: { profile: 'scorm-cloud' }, variants: PRESETS.storage }).map(p => p.name), ['default', 'storage blocked'], 'experiments: a profile that blocks cookies')
const exBlocked = exRes('storage blocked', normaliseOptions({ storage: 'blocked' }), 2), exSt = experimentFindings([exRes('default', dflt, 8), exBlocked])
assert.equal(exSt.length, 1); assert.equal(exSt[0].title, 'With storage blocked, the content gets less far'); assert.equal(exSt[0].sev, 'warn')
assert.ok(exSt[0].evidence.includes('Not reached with storage blocked: Looked for the API') && exSt[0].evidence.includes('storage: "normal" → "blocked"'), 'experiments: what was lost, and the setting: ' + exSt[0].evidence)
assert.match(exSt[0].detail, /got less far/)
assert.equal(experimentFindings([exRes('default', dflt, 4), exRes('storage blocked', normaliseOptions({ storage: 'blocked' }), 4)])[0].sev, 'info', 'experiments: blocked that makes no difference is no finding')
assert.equal(experimentFindings([exRes('default', normaliseOptions({ storage: 'blocked' }), 8), exBlocked]).some(f => /storage blocked/.test(f.title)), false, 'experiments: not when the default is blocked too')
// A profile that blocks cookies and changes the frames too: storage is blamed only if the run had storage refused.
const exCloud = refused => ({ ...exRes('lms scorm-cloud', normaliseOptions({ profile: 'scorm-cloud' }), 2), storageRefused: refused })
assert.ok(/^lms scorm-cloud gets less far than the default/.test(experimentFindings([exRes('default', dflt, 8), exCloud(false)])[0].title), 'experiments: a profile that blocks storage, with none used, is not blamed on storage')
assert.equal(experimentFindings([exRes('default', dflt, 8), exCloud(true)])[0].title, 'With storage blocked, the content gets less far', 'experiments: storage refused in that run: blamed on storage')
// The browsers preset (P2.3): Chromium against WebKit; the one the default already is is left out.
assert.deepEqual(planVariants({ base: {}, variants: PRESETS.browsers }).map(p => p.name), ['default', 'browser webkit'], 'experiments: browsers preset')
assert.deepEqual(planVariants({ base: { browser: 'webkit' }, variants: PRESETS.browsers }).map(p => p.name), ['default', 'browser chromium'], 'experiments: browsers preset from a webkit base')
// WebKit's launch plan and files (P2.3): the same plan as Electron's with the addresses on lms.lab.invalid, and the same served files.
{
  const pk = { name: 'good.zip', files: unzip(readFileSync(good)) }; pk.analysis = analyze(pk.files)
  const e = launchPlan({ pkg: pk, item: 0, options: {} }), w = launchPlan({ pkg: pk, item: 0, options: { browser: 'webkit', viewport: 'iphone' }, origins: WEBKIT_ORIGINS })
  assert.equal(e.config.launch, 'lab://run/pkg/lesson.html', 'plan: Electron’s address'); assert.equal(w.config.launch, 'https://lms.lab.invalid/pkg/lesson.html', 'plan: WebKit’s address')
  assert.equal(w.launch.url, 'lab://run/pkg/lesson.html', 'plan: the launch keeps the lab:// address in every browser')
  assert.equal(w.label, 'good.zip · Lesson and quiz · SCORM 1.2 · webkit · iphone', 'plan: label names the browser and device size'); assert.ok(!/webkit|iphone/.test(e.label), 'plan: Chromium at the window’s size adds nothing')
  assert.deepEqual({ ...w.config, launch: 0 }, { ...e.config, launch: 0 }, 'plan: the test LMS’s configuration is the same'); assert.deepEqual(w.headers, e.headers)
  const other = launchPlan({ pkg: pk, item: 0, options: { browser: 'webkit', profile: { contentOrigin: 'other' } }, origins: WEBKIT_ORIGINS })
  assert.equal(other.config.launch, 'https://cdn.content.invalid/pkg/lesson.html', 'plan: content on another origin'); assert.equal(other.launch.url, 'lab://content/pkg/lesson.html')
  assert.equal(launchPlan({ pkg: pk, item: 0, options: { launchParams: 'a=1' }, origins: WEBKIT_ORIGINS }).config.launch, 'https://lms.lab.invalid/pkg/lesson.html?a=1')
  assert.throws(() => launchPlan({ pkg: pk, item: 99, options: {} }), /nothing to launch/)
  const rq = (path, extra = {}) => serveRequest({ path, lms: true, config: { a: 1 }, files: new Map([['a.js', Buffer.from('0123456789')]]), headers: { 'X-Test': '1' }, ...extra })
  assert.deepEqual([rq('/__lab/config.json').status, rq('/__lab/config.json').body], [200, '{"a":1}'], 'serve: config'); assert.equal(rq('/__lab/host.html').headers['Content-Type'], 'text/html; charset=utf-8')
  assert.equal(rq('/__lab/host.html', { lms: false }).status, 404, 'serve: the LMS’s files only on the LMS’s origin'); assert.equal(rq('/pkg/a.js').headers['X-Test'], '1', 'serve: the profile’s headers on package files')
  assert.equal(rq('/pkg/nope.js').status, 404); assert.equal(rq('/pkg/a.js', { range: 'bytes=2-4' }).body.toString(), '234', 'serve: ranges'); assert.equal(rq('/pkg/a.js', { range: 'bytes=20-' }).status, 416)
}
// A WebKit trace has no coverage, caught errors, sources, script list or log: every reader copes (P2.3).
{
  const wk = { label: 'x', browser: 'webkit', started: '', ended: '', duration: 900, cmi: null, truncated: {}, requests: [{ t: 5, sid: '', id: '1', url: 'lab://run/pkg/lesson.html', method: 'GET', type: 'Document', status: 200, from: [] }],
    exceptions: [{ t: 40, sid: '', text: 'TypeError: undefined is not an object (evaluating \'navigator.userAgentData.brands\')', url: 'lab://run/pkg/lesson.js', line: 1, at: [{ fn: '', url: 'lab://run/pkg/lesson.js', line: 1, col: 5 }] }],
    probe: [{ type: 'frame', frame: 'lab://run/pkg/lesson.html', depth: 1, topReachable: true, origin: 'https://lms.lab.invalid', t: 20, sid: '' }, { type: 'dom', frame: 'lab://run/pkg/lesson.html', readyState: 'complete', text: 100, media: 0, visible: 5, hidden: false, t: 30, sid: '' }] }
  const launch = { kind: 'package', version: '1.2', expose: '1.2', depth: 0, opener: false, itemType: 'sco', profile: PROFILES.generic, options: normaliseOptions({ browser: 'webkit' }) }
  assert.ok(runFindings(wk, launch).some(f => /error/i.test(f.title) && f.evidence.some(x => /brands/.test(x)) || /brands/.test(JSON.stringify(f))), 'webkit trace: runFindings reports the error')
  assert.ok(Array.isArray(launchFindings(wk, null)), 'webkit trace: launchFindings')
  const wms = milestones(wk, null); assert.ok(wms.find(m => m.id === 'shown').reached, 'webkit trace: milestones')
  assert.equal(typeof stall(wk, wms).stalled, 'boolean', 'webkit trace: stall'); assert.ok(drill({ trace: wk, milestones: wms, files: new Map(), launch }).summary !== undefined, 'webkit trace: drill-down has nothing to say, and doesn’t fail')
  assert.ok(compare(wk, wk).exceptions, 'webkit trace: compare'); assert.match(renderReport({ title: 'x', run: { trace: wk, findings: [], milestones: wms, launch, label: 'x' }, fragment: true }), /What happened|Milestones/, 'webkit trace: the report')
}
const exRun = runResult('v', dflt, { milestones: mkSteps(2), trace: trace(), findings: [{ sev: 'error', title: 'bad' }] }, { runId: 3 })
assert.equal(exRun.errors, 1); assert.equal(exRun.verdict.title, 'bad'); assert.equal(exRun.runId, 3); assert.equal(summarise([exRun])[0].runId, 3)
// LMS profiles (P2.1): presets validate, a custom profile goes over its base, fields that don't fit together are refused.
// PRESET_SOURCES_PENDING: the presets' researched values and sources come separately; flip this when they are in.
const PRESET_SOURCES_PENDING = false
assert.deepEqual(PROFILE_NAMES, ['generic', 'moodle', 'scorm-cloud', 'cornerstone', 'successfactors', 'docebo', 'totara', 'blackboard', 'canvas'], 'profiles: the presets')
for (const [n, p] of Object.entries(PROFILES)) {
  const { notes, sources, approximation, ...fields } = p
  assert.deepEqual(checkProfile(fields), fields, `profiles: ${n} validates as a custom profile`)
  assert.ok(typeof notes === 'string' && notes && Array.isArray(sources) && approximation === (n !== 'generic'), `profiles: ${n} has notes, sources and is marked approximation`)
  assert.doesNotThrow(() => launchProfile({ profile: n }), `profiles: ${n} fits together`)
  if (!PRESET_SOURCES_PENDING) assert.ok(sources.length >= 1 && sources.every(u => /^https:\/\//.test(u)), `profiles: ${n} has sources`)
}
if (PRESET_SOURCES_PENDING) console.log('profiles: TODO the presets’ sources are pending research (PRESET_SOURCES_PENDING)')
assert.equal(normaliseOptions({ profile: 'none' }).profile, 'generic', 'profiles: none (runs saved before P2.1) is generic')
assert.deepEqual(normaliseOptions({ profile: { base: 'moodle', frames: { sandbox: ' allow-scripts  allow-same-origin ' } } }).profile, { base: 'moodle', frames: { sandbox: 'allow-scripts allow-same-origin' } }, 'profiles: custom kept as given, normalised')
const rp = resolveProfile({ frames: { depth: 2 }, contentOrigin: 'other', headers: { 'X-A': '1' } })
assert.deepEqual([rp.name, rp.frames, rp.contentOrigin, rp.apiWhere, rp.headers], ['custom', { depth: 2, kind: 'iframe', sandbox: null, allow: 'fullscreen; autoplay' }, 'other', 'top', { 'X-A': '1' }], 'profiles: partial fields go over generic')
assert.equal(resolveProfile({ base: 'canvas' }).name, 'canvas (changed)')
assert.deepEqual(resolveProfile('generic'), { name: 'generic', ...Object.fromEntries(Object.entries(PROFILES.generic).filter(([k]) => !['notes', 'sources', 'approximation'].includes(k))) })
for (const [p, re] of [['nope', /must be one of generic/], [3, /profile name or an object/], [{ contentOrigin: 'x' }, /contentOrigin/], [{ frames: { depth: 6 } }, /frames\.depth/], [{ frames: { nope: 1 } }, /frames.*unknown field: nope/],
  [{ frames: { kind: 'div' } }, /frames\.kind/], [{ frames: { sandbox: 'allow-scripts allow-everything' } }, /sandbox flag: allow-everything/], [{ frames: { allow: 'a\nb' } }, /frames\.allow/], [{ launch: 'tab' }, /launch/],
  [{ popupDelay: -1 }, /popupDelay/], [{ apiDelay: 1.5 }, /apiDelay/], [{ launchParams: 'a b' }, /launchParams/], [{ apiWhere: 'window' }, /apiWhere/], [{ csp: 1 }, /csp/], [{ headers: { 'a b': 'x' } }, /header name/],
  [{ headers: { a: 'x\r\ny' } }, /headers\.a/], [{ commit: 'maybe' }, /commit/], [{ slowMs: 'x' }, /slowMs/], [{ limits: { suspend12: 0 } }, /limits\.suspend12/], [{ cookies: 'none' }, /cookies/], [{ base: 'x' }, /base/], [{ nope: 1 }, /isn’t a profile field/]])
  assert.throws(() => normaliseOptions({ profile: p }), re, 'profiles: refused ' + JSON.stringify(p))
assert.throws(() => normaliseOptions({ profile: { apiWhere: 'opener' } }), /opener only when launch is popup/, 'profiles: opener needs a popup')
assert.throws(() => normaliseOptions({ profile: { launch: 'popup' } }), /frames\.depth of 1 or more/, 'profiles: a popup with the API on its top needs an LMS frame')
assert.throws(() => normaliseOptions({ profile: { frames: { kind: 'frameset', sandbox: 'allow-scripts' } } }), /frameset can’t have a sandbox/)
assert.deepEqual([launchProfile({ depth: 2 }).frames.depth, launchProfile({ opener: true }).launch, launchProfile({ opener: true }).apiWhere], [2, 'popup', 'opener'], 'profiles: depth and the new window go on top')
assert.deepEqual([{}, { apiWhere: 'parent' }, { apiWhere: 'parent', frames: { depth: 3 } }, { launch: 'popup', apiWhere: 'opener', frames: { depth: 2 } }, { launch: 'popup', frames: { depth: 2 } }, { launch: 'popup', apiWhere: 'parent', frames: { depth: 2 } }].map(p => apiAt(resolveProfile(p))),
  [0, 0, 1, 0, 2, 1], 'profiles: where the API goes')
assert.equal(fillParams('id={scoid}&a={attempt}&l={learner}&x={other}', { scoid: 'sco 1', attempt: 1, learner: 'l-1' }), 'id=sco%201&a=1&l=l-1&x={other}', 'profiles: placeholders')
assert.equal(cliCommand({ profile: 'moodle' }), 'package-lab run package.zip --profile moodle'); assert.equal(cliCommand({ profile: { contentOrigin: 'other' } }), 'package-lab run package.zip --profile-file profile.json')
assert.deepEqual(PRESETS.lms.map(v => v.patch.profile), PROFILE_NAMES, 'experiments: lms has one variant per profile')
assert.equal(planVariants({ base: {}, variants: PRESETS.lms }).length, PROFILE_NAMES.length, 'experiments: lms keeps every profile but generic (the default)')
// Content on another origin: blocked lookups (named from the code) and an opaque origin.
assert.ok(isBlocked('SecurityError: Blocked a frame with origin "lab://content" from accessing a cross-origin frame.') && !isBlocked('TypeError: x'))
assert.deepEqual([nameAt('  if (w.API) x', 0, 7), nameAt('a\nw["API_1484_11"]', 1, 1), nameAt('w.  API', 0, 1), nameAt('', 3, 0)], ['API', 'API_1484_11', 'API', ''], 'recorder: the blocked name is read from the code')
const blockedTrace = trace({ probe: [{ type: 'lookup', name: 'API', found: false, frame: 'lab://content/pkg/a.html' }, { type: 'lookup-blocked', name: 'API', frame: 'lab://content/pkg/a.html', stack: ['find (lab://content/pkg/scorm.js:6:47)'], uncaught: true }] })
const bf = runFindings(blockedTrace, { kind: 'package', itemType: 'sco', expose: '1.2', profile: resolveProfile({ contentOrigin: 'other' }) })
assert.ok(bf.some(f => f.title === 'The content can’t reach the LMS from another origin' && f.sev === 'error' && /lab:\/\/content/.test(f.detail) && f.evidence[0] === 'API blocked (uncaught) in a.html at find (lab://content/pkg/scorm.js:6:47)' && /share an origin/.test(f.fix) && /cross-domain wrapper/.test(f.fix)), 'origin: the finding: ' + JSON.stringify(bf))
assert.ok(!bf.some(f => /found nothing/.test(f.title)), 'origin: no “found nothing” as well')
assert.deepEqual(originFindings([{ type: 'lookup-blocked', name: 'href', frame: 'lab://content/pkg/a.html' }], resolveProfile()), [], 'origin: only API lookups count')
const sbf = originFindings([{ type: 'frame', frame: 'lab://run/pkg/a.html', origin: 'null' }], resolveProfile({ frames: { sandbox: 'allow-scripts' } }))
assert.ok(sbf.length === 1 && /sandbox has no allow-same-origin/.test(sbf[0].title) && sbf[0].evidence.join() === 'sandbox="allow-scripts",a.html has origin null', 'sandbox: detected: ' + JSON.stringify(sbf))
assert.match(originFindings([], resolveProfile({ frames: { sandbox: 'allow-forms' } }))[0].detail, /Without allow-scripts/, 'sandbox: from the profile alone, and no scripts')
assert.deepEqual(originFindings([], resolveProfile({ frames: { sandbox: 'allow-scripts allow-same-origin' } })), [], 'sandbox: allow-same-origin is fine')
const sdCall = { type: 'api', version: '1.2', call: 'LMSSetValue', el: 'cmi.suspend_data', value: 'x'.repeat(1500), result: 'true', err: 0 }
assert.ok(runFindings(trace({ probe: [sdCall] }), { kind: 'package', profile: resolveProfile({ limits: { suspend12: 1024 } }) }).some(f => /Suspend data is 1,500/.test(f.title) && f.sev === 'error' && /This LMS profile \(custom\) allows 1,024/.test(f.detail)), 'limits: the profile’s suspend data limit')
// Line diff and overrides.
const protoFiles = normaliseOptions({ files: JSON.parse('{"__proto__":"x","constructor":{"base64":"AAEC"}}') }).files
assert.deepEqual(Object.keys(protoFiles), ['__proto__', 'constructor'], 'options: __proto__ and constructor are ordinary paths')
assert.equal(Object.getPrototypeOf(protoFiles), Object.prototype); assert.deepEqual(protoFiles['__proto__'], { content: 'x' })
assert.deepEqual([...overlayFiles(new Map(), protoFiles).keys()], ['__proto__', 'constructor'])
assert.throws(() => normaliseOptions({ files: { 'a.js': { content: 'x'.repeat(50 * 1024 ** 2 + 1) } } }), /over 50 MB/, 'options: per-file cap')
assert.throws(() => normaliseOptions({ files: Object.fromEntries([1, 2, 3, 4, 5].map(i => ['f' + i, { content: 'x'.repeat(45 * 1024 ** 2) }])) }), /more than 200 MB/, 'options: total cap')
assert.equal(cliCommand({ files: { 'js/a.js': { content: 'x' }, 'b c.js': { content: 'y' } } }), "package-lab run package.zip --override js/a.js=js/a.js --override 'b c.js=b c.js'", 'cliCommand: one --override per changed file')
assert.deepEqual(diffLines('', 'a\nb').map(r => r.op), ['+', '+']); assert.deepEqual(diffLines('a', '').map(r => r.op), ['-'], 'textdiff: an empty side')
const dl = (a, b) => diffLines(a, b).map(r => r.op + r.text).join('|')
assert.equal(dl('a\nb\nc', 'a\nb\nc'), ' a| b| c'); assert.equal(dl('', 'x'), '+x'); assert.equal(dl('x', ''), '-x'); assert.equal(dl('', ''), '')
assert.equal(dl('a\nb\nc', 'a\nB\nc'), ' a|-b|+B| c', 'textdiff: a changed line'); assert.equal(dl('a\nc', 'a\nb\nc'), ' a|+b| c', 'textdiff: an added line')
assert.equal(dl('a\r\nb', 'a\nb'), ' a| b', 'textdiff: line endings are not changes')
assert.equal(unified('a\nb', 'a\nb'), ''); assert.equal(unified('a\nb\nc\nd', 'a\nB\nc\nd\ne'), '@@ -1,4 +1,5 @@\n a\n-b\n+B\n c\n d\n+e')
const longA = Array.from({ length: 40 }, (_, i) => 'line ' + i).join('\n'), longB = longA.replace('line 20', 'LINE 20')
assert.equal(unified(longA, longB).split('\n').length, 9, 'textdiff: three lines of context each side'); assert.match(unified(longA, longB), /^@@ -18,7 \+18,7 @@/)
const big = Array.from({ length: 3000 }, (_, i) => 'x' + i).join('\n'); assert.equal(diffLines(big, big.replace(/x/g, 'y')).filter(r => r.op === '+').length, 3000, 'textdiff: large inputs still diff')
// Myers diff (P3.3): minimal, bounded, line endings ignored.
assert.deepEqual(diffLines('', ''), [], 'myers: both empty'); assert.deepEqual(diffLines('a\nb', 'a\nb').map(r => r.op), [' ', ' '], 'myers: identical'); assert.equal(unified('', ''), '')
assert.deepEqual(diffLines('', 'a').map(r => r.op + r.text), ['+a'], 'myers: empty before'); assert.deepEqual(diffLines('a\nb', '').map(r => r.op + r.text), ['-a', '-b'], 'myers: empty after')
assert.equal(dl('a\nb\nc', 'x\ny\nz'), '-a|-b|-c|+x|+y|+z', 'myers: all changed')
assert.equal(dl('a\r\nb\r\nc', 'a\nB\nc'), ' a|-b|+B| c', 'myers: CRLF against LF, like the old diff'); assert.equal(unified('a\r\nb', 'a\nb'), '', 'myers: only line endings differ')
{ // minimal: the edit script is as short as the LCS says (checked against a table on random small inputs), and rebuilds both sides
  let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n
  for (let t = 0; t < 400; t++) {
    const x = Array.from({ length: rnd(9) }, () => 'abc'[rnd(3)]), y = Array.from({ length: rnd(9) }, () => 'abc'[rnd(3)]), d = diffLines(x.join('\n'), y.join('\n'))
    const lcs = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0))
    for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    assert.equal(d.filter(r => r.op !== ' ').length, x.length + y.length - 2 * lcs[0][0], 'myers: minimal ' + x + ' / ' + y)
    assert.deepEqual(d.filter(r => r.op !== '+').map(r => r.text), x); assert.deepEqual(d.filter(r => r.op !== '-').map(r => r.text), y)
  }
}
{ // large inputs stay fast: a few edits in 50,000 lines, and everything changed in 20,000 (past the edit cap: shown as replaced)
  const A = Array.from({ length: 50000 }, (_, i) => 'line ' + i), B = A.slice(); for (let i = 0; i < 50000; i += 500) B[i] = 'changed ' + i
  let t0 = Date.now(), d = diffLines(A.join('\n'), B.join('\n')); assert.equal(d.filter(r => r.op === '+').length, 100, 'myers: large, few edits'); assert.ok(Date.now() - t0 < 3000, 'myers: large input is fast: ' + (Date.now() - t0) + ' ms')
  t0 = Date.now(); d = diffLines(A.slice(0, 20000).join('\n'), A.slice(0, 20000).map(l => 'x' + l).join('\n')); assert.equal(d.filter(r => r.op === '+').length, 20000); assert.ok(Date.now() - t0 < 3000, 'myers: all changed is fast: ' + (Date.now() - t0) + ' ms')
}

// comparePackages (P3.3), on small packages built in memory.
{
  const buf = s => Buffer.from(s), man = (extra = '', href = 'a.html') => `<?xml version="1.0"?><manifest identifier="m" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata><organizations default="o"><organization identifier="o"><title>T</title><item identifier="i1" identifierref="r1"><title>One</title>${extra}</item></organization></organizations><resources><resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="${href}"><file href="${href}"/></resource></resources></manifest>`
  const pa = { name: 'a.zip', files: new Map([['imsmanifest.xml', buf(man())], ['a.html', buf('<p>one</p>\n<p>two</p>\n')], ['x.bin', Buffer.from([0, 1, 2])], ['same.txt', buf('s')], ['gone.js', buf('1')]]) }
  const pb = { name: 'b.zip', files: new Map([['imsmanifest.xml', buf(man('<adlcp:masteryscore>80</adlcp:masteryscore>', 'b.html'))], ['b.html', buf('<p>one</p>\n<p>2</p>\n')], ['a.html', buf('<p>one</p>\n<p>TWO</p>\n')], ['x.bin', Buffer.from([0, 1, 3, 4])], ['same.txt', buf('s')], ['new.js', buf('2')]]) }
  const c = comparePackages(pa, pb)
  assert.deepEqual(c.files.added.map(f => f.path + ':' + f.size), ['b.html:20', 'new.js:1'], 'pkgdiff: added with sizes'); assert.deepEqual(c.files.removed.map(f => f.path), ['gone.js']); assert.equal(c.files.same, 1)
  assert.deepEqual(c.files.changed.map(f => [f.path, f.before, f.after, f.text]), [['a.html', 22, 22, true], ['imsmanifest.xml', c.files.changed[1].before, c.files.changed[1].after, true], ['x.bin', 3, 4, false]], 'pkgdiff: changed with sizes')
  assert.equal(c.files.changed[0].diff, '@@ -1,3 +1,3 @@\n <p>one</p>\n-<p>two</p>\n+<p>TWO</p>\n ', 'pkgdiff: unified diff of a text file'); assert.equal(c.files.changed[2].diff, null, 'pkgdiff: no diff for binary files')
  assert.ok(c.manifest.some(m => m.where === 'item i1' && m.field === 'mastery' && m.a === '' && m.b === '80') && c.manifest.some(m => m.where === 'resource r1' && m.field === 'href' && m.a === 'a.html' && m.b === 'b.html'), 'pkgdiff: manifest field by field: ' + JSON.stringify(c.manifest))
  assert.deepEqual(c.boot.a, 'a.html'); assert.equal(c.boot.b, 'b.html'); assert.match(c.summary, /2 files added, 1 file removed, 3 files changed/)
  // text over 1 MB (either side) is listed but not diffed; a change of line endings alone says so.
  const huge = 'x\n'.repeat(600000), cf = compareFiles(new Map([['h.txt', buf(huge)], ['e.txt', buf('a\r\nb')]]), new Map([['h.txt', buf(huge + 'y')], ['e.txt', buf('a\nb')]]))
  assert.deepEqual(cf.changed.map(f => [f.path, f.tooBig, f.diff]), [['e.txt', false, '(only the line endings changed)'], ['h.txt', true, null]], 'pkgdiff: over 1 MB is not diffed')
  const lines = t => Array.from({ length: 30000 }, (_, i) => t + i).join('\n'), bigA = new Map(Array.from({ length: 14 }, (_, n) => ['f' + n + '.txt', buf(lines('a'))])), bigB = new Map(Array.from({ length: 14 }, (_, n) => ['f' + n + '.txt', buf(lines('b'))]))
  const bud = compareFiles(bigA, bigB).changed; assert.ok(bud[0].diff && bud.some(x => x.diff === null && x.tooBig) && bud.filter(x => x.diff).length < 14, 'pkgdiff: past the total budget a diff is left out: ' + bud.map(x => x.diff?.length))
  assert.equal(compareFiles(new Map([['x', buf('a\r\nb')]]), new Map([['x', buf('a\nb')]])).changed[0].diff, '(only the line endings changed)')
  // no manifest on one side
  assert.ok(compareManifests(null, analyze(pb.files).manifest).some(m => m.field === '(file)' && m.a === 'none'), 'pkgdiff: a missing manifest')
  assert.deepEqual(compareBoots(null, null), { a: null, b: null, removed: [], added: [], changed: [] })
  const f1 = { sev: 'error', title: 'T', evidence: ['e'] }, cfx = compareFindings([f1, { sev: 'info', title: 'U', evidence: [] }], [f1, { sev: 'warn', title: 'V', evidence: [] }])
  assert.deepEqual([cfx.gone.map(f => f.title), cfx.added.map(f => f.title), cfx.same], [['U'], ['V'], 1], 'pkgdiff: findings that differ')
  // behaviour from two runs' milestones and counts
  const ms = n => STEPS.map(([id, label], i) => ({ id, label, reached: i < n, t: null, evidence: '' })), run = n => ({ milestones: ms(n), trace: { probe: [], requests: [], exceptions: [] } })
  const bh = compareBehaviour(run(8), run(1), ['good.zip', 'blank.zip'])
  assert.deepEqual([bh.a.furthest, bh.b.furthest, bh.better], ['wrote', 'launched', -1]); assert.match(bh.summary, /good\.zip reached “Wrote data”; blank\.zip reached “Launch page loaded”\. blank\.zip got less far/)
  // the report: a collapsible diff per file, with everything escaped
  const evil = comparePackages({ name: '<i>a</i>.zip', files: new Map([['<b>.html', buf('<script>1</script>\n')]]) }, { name: 'b.zip', files: new Map([['<b>.html', buf('<script>2</script>\n')]]) }, {})
  const html = renderReport({ title: 't', diff: { ...evil, behaviour: bh } })
  assert.ok(html.includes('<details><summary><span class="sl-mono">&lt;b&gt;.html</span>') && html.includes('&lt;script&gt;2&lt;/script&gt;') && !html.includes('<script>2') && !html.includes('<i>a</i>'), 'pkgdiff: the report escapes everything')
  assert.match(html, /Package diff[\s\S]*Behaviour[\s\S]*good\.zip reached/, 'pkgdiff: the report has a diff section and the behaviour')
}
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
assert.equal(answerFor(rs, 'lab://run/__lab/host.js', 'GET'), null, 'answer: Package Lab’s own pages are never answered'); assert.equal(answerFor([], 'x://y'), null)
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
// Watch pins (P1.5): no value, go to the probe, and get no findings of their own.
assert.deepEqual(normaliseOptions({ pins: [{ path: 'config.cdn', mode: 'watch', value: 1 }] }).pins, [{ path: 'config.cdn', frames: 'content', mode: 'watch' }], 'options: a watch pin has no value')
assert.equal(pinPrefix([{ path: 'a', frames: 'content', mode: 'watch' }]), 'globalThis.__labPins = [{"path":"a","frames":"content","mode":"watch"}];\n', 'pins: watch pins go to the probe')
assert.deepEqual(pinFindings(trace({ probe: [{ type: 'pin-failed', path: 'w', error: 'x' }] }), { pins: [{ path: 'w', frames: 'content', mode: 'watch' }] }), [], 'pins: watch pins get no findings')
assert.deepEqual(watchPins({ pins: [{ path: 'a', value: 1, frames: 'content', mode: 'force' }] }, ['b']).map(p => p.path + ' ' + p.mode), ['a force', 'b watch'], 'drill: watch pins added to the run’s own')
{
  // The probe's watch pins under vm (window as a plain object: vm's global object bypasses accessors).
  const reports = [], ctx = vm.createContext({ location: { href: 'lab://run/pkg/a.html' }, document: { referrer: '', addEventListener() {} }, addEventListener() {}, setTimeout() {}, __labReport: x => reports.push(JSON.parse(x)) })
  vm.runInContext('window = {}; window.__labPins = ' + JSON.stringify([{ path: 'player', frames: 'content', mode: 'watch' }, { path: 'config', frames: 'content', mode: 'watch' }, { path: 'config.cdn', frames: 'content', mode: 'watch' }, { path: 'config.x', value: 5, frames: 'content', mode: 'force' }]), ctx)
  vm.runInContext(readFileSync(new URL('../src/host/probe.js', import.meta.url), 'utf8'), ctx)
  const got = vm.runInContext("window.config = {}; window.config = { a: 1 }; window.config.cdn = 'c'; window.player = { ready: true }; JSON.stringify([window.player.ready, window.config.cdn, window.config.x, Object.keys(window.config), 'nope' in window])", ctx)
  assert.equal(got, '[true,"c",5,["a","cdn","x"],false]', 'watch: values pass through; a force pin under the same root still holds')
  assert.deepEqual(reports.filter(r => r.type === 'watch-write').map(r => `${r.path}=${r.value}`), ['config={}', 'config={"a":1}', 'config.cdn=c', 'player={"ready":true}'], 'watch: writes reported')
  assert.ok(reports.some(r => r.type === 'watch-read' && r.path === 'config.cdn'), 'watch: reads reported')
}
{
  // Blocked storage (P2.2) under vm: the probe's refusals, and that Package Lab's own pages and other modes are left alone.
  const probeSrc = readFileSync(new URL('../src/host/probe.js', import.meta.url), 'utf8')
  const sandbox = (href, mode) => {
    const reports = [], ctx = vm.createContext({ location: { href }, document: { referrer: '', addEventListener() {} }, addEventListener() {}, setTimeout() {}, DOMException, Event, EventTarget, queueMicrotask,
      Document: { prototype: {} }, IDBFactory: { prototype: { open() { return 'real' } } }, __labReport: x => reports.push(JSON.parse(x)) })
    vm.runInContext('window = { localStorage: "real" };' + (mode ? ` window.__labStorage = ${JSON.stringify(mode)};` : ''), ctx)
    vm.runInContext(probeSrc, ctx)
    return { reports, ctx, run: code => vm.runInContext(code, ctx) }
  }
  const b = sandbox('lab://run/pkg/a.html', 'blocked')
  assert.equal(b.run("try { window.localStorage; 'no error' } catch (e) { e.name + ': ' + e.message }"), 'SecurityError: The operation is insecure.', 'storage probe: localStorage throws SecurityError')
  assert.equal(b.run("try { window.sessionStorage; 'no error' } catch (e) { e.name }"), 'SecurityError', 'storage probe: sessionStorage too')
  assert.equal(b.run("var d = Object.create(Document.prototype); d.cookie = 'a=1'; d.cookie"), '', 'storage probe: cookies read empty and writes are ignored')
  b.run("var req = IDBFactory.prototype.open('db', 1); globalThis.out = []; req.onerror = function (e) { out.push('onerror ' + req.error.name + ' ' + req.readyState) }; req.addEventListener('error', function () { out.push('listener') }); globalThis.req = req")
  assert.equal(b.run('req.readyState'), 'pending', 'storage probe: the request is pending until the error')
  await Promise.resolve()
  assert.equal(b.run("out.join()"), 'listener,onerror SecurityError done', 'storage probe: indexedDB.open errors, to both kinds of handler')
  assert.deepEqual(b.reports.filter(r => r.type === 'storage-blocked').map(r => r.what), ['localStorage', 'sessionStorage', 'document.cookie (write)', 'document.cookie (read)', 'indexedDB.open'], 'storage probe: each access is reported')
  assert.ok(b.reports.find(r => r.what === 'localStorage').stack, 'storage probe: with a stack')
  assert.equal(b.run('window.__labStorage'), undefined, 'storage probe: the setting is removed from the page')
  for (const [href, mode] of [['lab://run/__lab/host.html', 'blocked'], ['lab://run/pkg/a.html', 'partitioned'], ['lab://run/pkg/a.html', undefined]]) {
    const s = sandbox(href, mode)
    assert.equal(s.run('window.localStorage'), 'real', `storage probe: ${href} with ${mode} keeps storage`)
    assert.equal(s.run("IDBFactory.prototype.open('x')"), 'real')
  }
}
// The finding, and what it says about uncaught errors it caused.
const stBlocked = [{ type: 'storage-blocked', what: 'localStorage', frame: 'lab://run/pkg/lesson.html', stack: ['get localStorage (lab://run/pkg/boot.js:2:20)'] }, { type: 'storage-blocked', what: 'localStorage', frame: 'lab://run/pkg/lesson.html', stack: ['get localStorage (lab://run/pkg/boot.js:2:20)'] }, { type: 'storage-blocked', what: 'document.cookie (read)', frame: 'lab://run/pkg/lesson.html', stack: ['f (lab://run/pkg/a.js:9:1)'] }]
const stF = storageFindings(trace({ probe: stBlocked, exceptions: [{ text: 'SecurityError: The operation is insecure.', at: [] }] }))
assert.equal(stF.length, 1); assert.equal(stF[0].title, 'The content needs storage the browser can block'); assert.equal(stF[0].sev, 'warn')
assert.deepEqual(stF[0].evidence, ['localStorage in lesson.html at get localStorage (lab://run/pkg/boot.js:2:20)', 'document.cookie (read) in lesson.html at f (lab://run/pkg/a.js:9:1)'], 'storage finding: evidence has the stacks, once each')
assert.match(stF[0].detail, /localStorage, document\.cookie \(read\)/); assert.match(stF[0].detail, /1 uncaught error came from it/)
assert.match(storageFindings(trace({ probe: stBlocked }))[0].detail, /handled the refusal/, 'storage finding: no uncaught errors')
assert.deepEqual(storageFindings(trace({ probe: [{ type: 'api' }] })), [], 'storage finding: none without a blocked access')
assert.ok(runFindings(trace({ probe: stBlocked }), { kind: 'package', itemType: 'asset' }).some(f => /needs storage/.test(f.title)), 'storage finding: runFindings includes it')
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
  `package-lab run package.zip --pin previewMode=false --pin 'navigator.userAgent="a b"' --answer '/api/*=404:{"a":1}' --launch-params 'a=1&b=2'`, 'cliCommand: pins, answers, launch parameters')
assert.equal(cliCommand(normaliseOptions({ pins: [{ path: 'x', value: 1, frames: 'all' }], responses: [{ match: 'a', headers: { A: 'b' } }] })), 'package-lab run package.zip --options options.json', 'cliCommand: what a flag can’t say goes to the options file')
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
// Drill-down (P1.5): the pure parts over hand-made traces.
assert.deepEqual(['window.player', 'cfg?.lms.version', 'a[0]', 'f()', "self['x'].y", 'typeof a'].map(codePath), ['player', 'cfg.lms.version', null, null, 'x.y', null], 'drill: operand paths')
{
  const progs = programs(new Map([['a.js', 'var cfg = { lms: { on: 1 } }\nObject.defineProperty(window, "flag", { value: 1 })\nif (x) { y = 1 } else z()\nif (!r) throw 1\nnext()']]))
  assert.deepEqual(assignments(progs, 'cfg.lms.on').map(a => a.at), ['a.js:1'], 'drill: a key in an object literal'); assert.deepEqual(assignments(progs, 'flag').map(a => a.at), ['a.js:2'], 'drill: defineProperty')
  const ifs = progs[0].all.filter(n => n.type === 'IfStatement'), src = progs[0].text, txt = r => r && src.slice(r.start, r.end)
  assert.deepEqual([txt(untakenRange(progs[0], ifs[0], 1)), txt(untakenRange(progs[0], ifs[0], 0)), txt(untakenRange(progs[0], ifs[1], 1)), untakenRange(progs[0], ifs[1], 0) && txt(untakenRange(progs[0], ifs[1], 0))], ['z()', '{ y = 1 }', 'next()', 'throw 1'], 'drill: the branch not taken')
  const ev = (t, kind = 3) => ({ ev: [t, kind, 0, 1] })
  assert.deepEqual(deadEnd([ev(10), ev(20), ev(3000), ev(3100)], [{ reached: true, t: 0 }]), { from: 0, to: 1, near: [], end: 20, quiet: true }, 'drill: the dead end stops where the run went quiet')
  assert.equal(deadEnd(Array.from({ length: 400 }, (_, i) => ev(i)), []).from, 100, 'drill: the last 300 events')
}
{
  // levels, by hand: the sites from the instrumenter, the events and coverage the run would record.
  const ins = instrument(LEVELS_BOOT, { file: 'boot.js' }), id = (kind, text) => ins.sites.findIndex(s => s.kind === kind && s.text === text)
  const files = new Map([['boot.js', LEVELS_BOOT], ['js/player.js', 'window.player = { ready: true }\n'], ['data/config.json', '{ "start": true }']])
  const off = s => LEVELS_BOOT.indexOf(s), cdnBlock = off('{\n    var s'), startCall = off('start()')
  const tr = trace({ sites: ins.sites, scripts: [{ url: 'lab://run/pkg/boot.js' }], requests: [{ t: 80, type: 'Fetch', url: 'lab://run/pkg/data/config.json', method: 'GET', status: 200, from: [{ url: 'lab://run/pkg/boot.js', line: 5 }] }],
    coverage: [{ url: 'lab://run/pkg/boot.js', fns: [['', [0, LEVELS_BOOT.length, 1, cdnBlock, LEVELS_BOOT.indexOf('} else'), 0, startCall, startCall + 7, 0]]] }],
    exec: [{ frame: 'lab://run/pkg/lesson.html', events: [[91, 3, id('if', 'config.cdn'), 0, ['undefined']], [193, 1, id('function', 'begin')], [193, 3, id('&&', 'window.player'), 0, ['undefined']], [193, 3, id('if', 'window.player && player.ready'), 0], [193, 2, id('function', 'begin')]] }] })
  const input = { trace: tr, milestones: [{ id: 'shown', reached: true, t: 90 }], files, launch: { expose: '1.2' } }
  const first = drill(input)
  assert.deepEqual(first.watch.sort(), ['config.cdn', 'player'], 'drill: the paths to watch')
  const r = drill({ ...input, watch: trace() })
  assert.deepEqual(r.chain.map(s => s.short), ['`if (window.player && player.ready)` was false (boot.js:3)', '`player` never set', 'js/player.js never loaded', '`if (config.cdn)` was false (boot.js:7)', '`config.cdn` never set', 'data/config.json has no `cdn`'], 'drill: the chain down to the JSON file: ' + r.chain.map(s => s.text).join('\n'))
  assert.match(r.chain[1].text, /never assigned \(watched\)[\s\S]*js\/player\.js:1/, 'drill: the static assignment that never ran')
  assert.deepEqual([r.cause.kind, r.findings[0].sev, r.findings[0].title.slice(0, 16)], ['file', 'error', 'Why it stopped: '], 'drill: a named cause is an error')
  // The watch run saw the assignment: the chain stops there.
  const w = drill({ ...input, watch: trace({ probe: [{ type: 'watch-write', path: 'player', value: '{}', t: 500, stack: ['lab://run/pkg/late.js:3:1'] }] }) })
  assert.match(w.chain[1].text, /assigned at late\.js:3:1 .*later than the test/, 'drill: an assignment the watch run saw'); assert.equal(w.findings[0].sev, 'warn')
}
{
  // hosted, by hand: if (!r.ok) was true, so return r.json() never ran; r is the response to a request that failed.
  const BOOT = `fetch('/api/player/config').then(function (r) { if (!r.ok) throw new Error('no config'); return r.json() })\n`
  const ins = instrument(BOOT, { file: 'boot.js' }), ret = BOOT.indexOf('return r.json')
  const tr = trace({ sites: ins.sites, scripts: [{ url: 'lab://run/pkg/boot.js' }], requests: [{ t: 50, type: 'Fetch', url: 'lab://run/api/player/config', status: 404, from: [{ url: 'lab://run/pkg/boot.js', line: 1 }] }],
    coverage: [{ url: 'lab://run/pkg/boot.js', fns: [['', [0, BOOT.length, 1]], ['', [BOOT.indexOf('function (r)'), BOOT.indexOf(' })'), 1, ret - 1, BOOT.indexOf(' })'), 0]]] }],
    exec: [{ frame: 'x', events: [[60, 3, ins.sites.findIndex(s => s.kind === 'if'), 1, ['boolean', false]]] }] })
  const r = drill({ trace: tr, milestones: [], files: new Map([['boot.js', BOOT]]) })
  assert.deepEqual(r.chain.map(s => s.text), ['In boot.js:1, `if (!r.ok)` was true because `r.ok` was false. Otherwise it would have run `return r.json()`.', '`r` came from the response to /api/player/config, which failed (404).'], 'drill: hosted')
  assert.deepEqual([r.cause.kind, r.watch], ['request', []], 'drill: a local is not watched')
}
assert.equal(drill({ trace: trace() }).findings[0].title, 'Why it stopped: nothing to drill into', 'drill: an untraced run')

// Times in a saved run are relative to its start, including the test LMS's API calls, which carry their own Date.now().
{
  const rec = new Recorder({ debugger: {} }, { label: 'x' })
  rec.t0 = Date.now() - 1500
  await rec.onEvent('Runtime.bindingCalled', { name: '__labReport', payload: JSON.stringify({ type: 'api', t: Date.now(), call: 'LMSInitialize', result: 'true' }) }, '')
  const t = rec.trace.probe[0].t
  assert.deepEqual(shiftTimes('exec', [{ t: 5, events: [[10, 1, 0], 'x'] }], 100), [{ t: 105, events: [[110, 1, 0], 'x'] }], 'recorder: a popup’s exec times move onto the run’s clock')
  assert.deepEqual(shiftTimes('coverage', [{ id: 1 }], 100), [{ id: 1 }], 'recorder: lists without times are left alone')
  assert.ok(t >= 1500 && t < 5000, 'recorder: an API call’s t is relative to the run start, not an absolute time: ' + t)
}
// Why it stalled (P1.6). The probe's timers, listeners and postMessage under vm: everything passes through, and the reports say what happened.
{
  const reports = [], queue = new Map(), sent = []
  let nid = 0
  class ET { addEventListener(type, fn) { (this.l ??= []).push([type, fn]); return 'added' } removeEventListener(type, fn) { this.l = (this.l ?? []).filter(x => x[1] !== fn); return 'removed' } fire(type, ev) { return (this.l ?? []).filter(x => x[0] === type).map(x => x[1].call(this, ev)) } }
  const sb = { __labReport: x => reports.push(JSON.parse(x)), location: { href: 'lab://run/pkg/a.html' }, document: { referrer: '', addEventListener() {} }, addEventListener() {}, EventTarget: ET,
    setTimeout: (f, ms, ...a) => { queue.set(++nid, { f, a }); return nid }, setInterval: (f, ms, ...a) => { queue.set(++nid, { f, a }); return nid }, clearTimeout: id => { queue.delete(id); return 'cleared' }, clearInterval: id => { queue.delete(id) },
    requestAnimationFrame: () => 1, postMessage(m, o) { sent.push([this, m, o]); return 'sent' } }
  const ctx = vm.createContext(sb)
  sb.window = sb; sb.parent = sb; sb.top = sb; sb.opener = null
  const tm0 = sb.setTimeout; sb.__timer = tm0; sb.setTimeout = vm.runInContext('(function setTimeout(f, ms, ...a) { return __timer(f, ms, ...a) })', ctx)   // made in the page's realm, as a browser's are
  const beforeText = vm.runInContext('String(setTimeout)', ctx), nativeToString = vm.runInContext('Function.prototype.toString.toString()', ctx)
  vm.runInContext(readFileSync(new URL('../src/host/probe.js', import.meta.url), 'utf8'), ctx)
  const seen = []
  const id = sb.setTimeout(function (a, b) { seen.push([this === sb || this === undefined, a, b]); return 'ignored' }, 10, 'x', 'y')
  assert.equal(id, nid, 'stall probe: setTimeout returns the id'); queue.get(id).f.call(sb, ...queue.get(id).a)
  assert.deepEqual(seen, [[true, 'x', 'y']], 'stall probe: this and extra arguments reach the callback')
  const sid = sb.setTimeout('alert(1)', 5); assert.equal(queue.get(sid).f, 'alert(1)', 'stall probe: a string callback passes through untouched')
  const iv = sb.setInterval(function () { seen.push('tick') }, 250)
  for (let i = 0; i < 4; i++) queue.get(iv).f()
  assert.equal(sb.clearTimeout(999), 'cleared', 'stall probe: a clear passes its result on')
  sb.requestAnimationFrame(() => {}); sb.__labFlushT()
  const tm = reports.findLast(r => r.type === 'timers')
  assert.equal(tm.raf, 1); assert.deepEqual(tm.list.filter(l => l[0] === 'interval').map(l => l.slice(0, 5)), [['interval', 250, 1, 4, 0]], 'stall probe: the interval, its delay and runs: ' + JSON.stringify(tm.list))
  assert.match(tm.sites[tm.list.findIndex(l => l[0] === 'interval')], /test\.js:\d+:\d+/, 'stall probe: the site is the caller, not the probe')
  sb.clearInterval(iv); sb.__labFlushT()
  assert.equal(reports.findLast(r => r.type === 'timers').list.find(l => l[0] === 'interval')[4], 1, 'stall probe: a clear is counted')
  const w = new ET(); w.window = w
  const handler = function (e) { return [this === w, e] }
  assert.equal(w.addEventListener('message', handler), 'added', 'stall probe: addEventListener returns what it did')
  assert.deepEqual(w.fire('message', 5), [[true, 5]], 'stall probe: this and the argument reach a listener')
  assert.ok(reports.some(r => r.type === 'listener' && r.id === 0) && reports.some(r => r.type === 'msg-run' && r.id === 0), 'stall probe: registration and run reported')
  assert.equal(w.removeEventListener('message', handler), 'removed'); assert.deepEqual(w.fire('message', 1), [], 'stall probe: removeEventListener finds the wrapped listener')
  w.addEventListener('click', handler); assert.equal(w.l.at(-1)[1], handler, 'stall probe: other events are not wrapped')
  const objectListener = { handleEvent() {} }; w.addEventListener('message', objectListener); assert.equal(w.l.at(-1)[1], objectListener, 'stall probe: a listener object is passed as it is')
  assert.equal(sb.postMessage({ type: 'player-ready', long: 'x'.repeat(200), n: 1, nested: { a: 1 } }, '*'), 'sent', 'stall probe: postMessage returns its result')
  assert.deepEqual(sent[0].slice(1), [{ type: 'player-ready', long: 'x'.repeat(200), n: 1, nested: { a: 1 } }, '*'], 'stall probe: postMessage arguments pass through')
  assert.equal(vm.runInContext('String(setTimeout) + String(addEventListener) + String(String)', ctx), beforeText + vm.runInContext('String(addEventListener) + String(String)', ctx), 'stall probe: String(setTimeout) is what it was before the probe')
  assert.equal(vm.runInContext('Function.prototype.toString.toString()', ctx), nativeToString, 'stall probe: toString of the patched toString is unchanged')
  const longKey = 'k'.repeat(200); sb.postMessage({ [longKey]: 1, f() {} , s: Symbol('x') }, 'o'.repeat(200)); sb.postMessage(function () {}); sb.postMessage(new (class P {})())
  const posts = reports.filter(r => r.type === 'post')
  assert.deepEqual([posts.at(-3).origin.length, posts.at(-3).shape.keys[0].length, posts.at(-2).shape], [80, 80, { kind: 'function' }], 'stall probe: strings capped at 80, no value for functions')
  assert.deepEqual(posts.at(-1).shape, { kind: 'object' }, 'stall probe: a class instance’s keys are not read')
  const post = reports.find(r => r.type === 'post')
  assert.deepEqual([post.to, post.origin, post.shape], ['lab://run/pkg/a.html', '*', { kind: 'object', keys: ['type', 'long', 'n', 'nested'], vals: { type: 'player-ready', n: 1 } }], 'stall probe: message shape: long values and objects left out')
}
// stall(): hand-made traces.
{
  const F = 'lab://run/pkg/a.html', HOST = 'lab://run/__lab/host.html', at = (l, c = 5) => `lab://run/pkg/a.html:${l}:${c}`
  const ms = (...reachedIds) => STEPS.map(([id, label]) => ({ id, label, reached: reachedIds.includes(id) }))
  const st = (probe, extra = {}, m = ms('launched')) => stall(trace({ duration: 10000, probe, ...extra }), m)
  const timers = (list, sites = [at(3)]) => ({ type: 'timers', t: 9990, frame: F, sid: '', raf: 0, sites, list })
  // pollers
  let r = st([timers([['interval', 250, 1, 40, 0, 100]])])
  assert.deepEqual(r.pollers.map(p => [p.kind, p.every, p.fired]), [['interval', 250, 40]], 'stall: an interval still firing at the end'); assert.match(r.pollers[0].say, /a\.html:3 polls every 250 ms \(40 runs\)$/)
  assert.equal(st([timers([['interval', 250, 1, 40, 1, 100]])]).pollers.length, 0, 'stall: a cleared interval is not active')
  assert.equal(st([timers([['interval', 250, 1, 40, 0, 6000]])]).pollers.length, 0, 'stall: not firing at the end')
  assert.equal(st([timers([['interval', 250, 1, 2, 0, 100]])]).pollers.length, 0, 'stall: two runs is not polling')
  assert.equal(st([timers([['timeout', 500, 1, 30, 1, 100]])]).pollers.length, 0, 'stall: one timeout is not a chain'); assert.equal(st([timers([['timeout', 500, 30, 30, 0, 100]])]).pollers.length, 1, 'stall: a chain of timeouts is')
  assert.equal(st([{ ...timers([['interval', 250, 1, 40, 0, 100]]), frame: HOST }]).pollers.length, 0, 'stall: Package Lab’s own frames are not content')
  // the condition, with a trace: the poll's test, and its last value
  const POLL = "var t = setInterval(function () { if (window.API_1484_11) { clearInterval(t) } }, 500)\n", ins = instrument(POLL, { file: 'a.html' })
  const di = ins.sites.findIndex(s => s.kind === 'if'), tr = { sites: ins.sites, exec: [{ frame: F, events: [[100, 3, di, 0, ['undefined']], [300, 3, di, 0, ['undefined']], [9000, 4, di, 0, 38]] }] }
  r = st([timers([['interval', 500, 1, 40, 0, 100]], [at(1, 9)])], tr)
  assert.deepEqual(r.pollers[0].condition && [r.pollers[0].condition.text, r.pollers[0].condition.n], ['window.API_1484_11 → undefined', 40], 'stall: the condition and its last value'); assert.match(r.pollers[0].say, /polls every 500 ms \(40 runs\); tests `window\.API_1484_11 → undefined`, 40 times/)
  assert.equal(st([timers([['interval', 500, 1, 400, 0, 100]], [at(1, 9)])], tr).pollers[0].condition, null, 'stall: a test taken far less often than the timer fired is not its condition')
  // messages
  const post = (t, to, type, extra = {}) => ({ type: 'post', t, frame: to, to, shape: { kind: 'object', keys: ['type'], vals: { type } }, origin: '*', n: 1, stack: [at(7)], ...extra })
  r = st([post(100, HOST, 'player-ready')])
  assert.deepEqual(r.unanswered.map(u => [u.message, u.why]), [['“player-ready”', 'no-listener']], 'stall: a handshake nobody listens for'); assert.match(r.unanswered[0].say, /a\.html:7 sent “player-ready” to the LMS window \(origin \*\): nothing there was listening/)
  const lis = { type: 'listener', t: 5, frame: HOST, sid: '', id: 0, stack: ['lab://run/__lab/host.html:1:1'] }
  assert.equal(st([lis, post(100, HOST, 'player-ready')]).unanswered[0].why, 'not-handled', 'stall: a listener that didn’t run')
  const ran = { type: 'msg-run', t: 100, frame: HOST, sid: '', id: 0, n: 1 }
  assert.equal(st([lis, post(100, HOST, 'x'), ran]).unanswered[0].why, 'no-reply', 'stall: a listener that ran but never replied')
  assert.equal(st([lis, post(100, HOST, 'x'), ran, post(900, F, 'launch')]).unanswered.filter(u => u.message === '“x”').length, 0, 'stall: a message back within 2 s is a reply')
  assert.equal(st([lis, post(100, HOST, 'x'), ran, post(2500, F, 'launch')]).unanswered.filter(u => u.message === '“x”').length, 1, 'stall: after 2 s it is not')
  assert.equal(st([lis, post(100, HOST, 'x'), { ...ran, t: 1500 }]).unanswered[0].why, 'not-handled', 'stall: a listener running after 1 s is not an answer')
  assert.equal(st([post(100, '', 'x')]).unanswered.length, 0, 'stall: a target on another origin can’t be judged')
  assert.deepEqual(st(Array.from({ length: 10 }, (_, i) => post(100 + i, HOST, 'x', { n: i + 1 }))).unanswered.map(u => u.count), [10], 'stall: n is the probe’s running count, so the largest is the total')
  // listeners that never ran, requests, last code
  r = st([{ ...lis, frame: F }, { ...lis, frame: F, id: 1 }, { type: 'msg-run', t: 50, frame: F, sid: '', id: 1 }, lis])
  assert.equal(r.listeners.length, 1, 'stall: only content listeners that never ran'); assert.match(r.listeners[0].say, /^lab:\/\/run\/__lab\/host\.html:1 listens|a\.html|host\.html:1 listens for a message that never came/)
  assert.deepEqual(st([], { requests: [{ t: 1500, url: 'lab://run/pkg/x.json', method: 'GET' }, { t: 1, url: 'lab://run/pkg/y.json', status: 200 }] }).pending.map(p => p.url), ['x.json'], 'stall: a request with no answer')
  r = st([post(100, HOST, 'x')], { sites: ins.sites, exec: [{ frame: F, events: [[1, 3, di, 0, ['undefined']]] }] }); assert.deepEqual(r.last, { traced: true, items: ['a.html:1 if (window.API_1484_11) → false, window.API_1484_11 = undefined'] }, 'stall: the last events, traced')
  r = st([post(100, HOST, 'x')], { scripts: [{ sid: '', id: '1', url: 'lab://run/pkg/a.js' }, { sid: '', id: '2', url: 'lab://run/pkg/b.js' }], coverage: [{ sid: '', id: '1', url: 'lab://run/pkg/a.js', fns: [['early', [0, 9, 1]]] }, { sid: '', id: '2', url: 'lab://run/pkg/b.js', fns: [['', [0, 9, 1]], ['wait', [0, 9, 2]], ['never', [0, 9, 0]]] }] })
  assert.deepEqual(r.last, { traced: false, items: ['wait in b.js', 'early in a.js'] }, 'stall: without a trace, the last functions coverage shows ran, scripts in load order')
  // the finding
  const f = stallFinding(st([post(100, HOST, 'player-ready'), timers([['interval', 250, 1, 40, 0, 100]])]))
  assert.equal(f.sev, 'warn'); assert.equal(f.title, 'The content was waiting for: a reply to “player-ready”; a timer at a.html:3 (every 250 ms)', 'stall: finding title')
  assert.ok(f.evidence.some(e => /player-ready/.test(e)) && f.evidence.some(e => /polls every 250 ms/.test(e)), 'stall: evidence lists each item')
  assert.equal(stallFinding(st([post(100, HOST, 'x')], {}, ms('launched', 'wrote'))), null, 'stall: a run that wrote data wasn’t stalled'); assert.equal(stallFinding(st([])), null, 'stall: nothing waiting, no finding')
}

// ---- Save and resume (P2.4): macros and the cycle's findings ----
{
  const click = (t, x = 0.5, y = 0.5) => ({ t, type: 'click', x, y })
  assert.deepEqual(normaliseOptions({ macro: [{ t: 2000, type: 'key', key: 'Enter' }, { t: 1000.4, type: 'click', x: 0.1, y: 1 }, { t: 5, type: 'text', text: 'hi' }, { t: 9, type: 'wheel', x: 0, y: 0, dy: -100 }, { t: 10, type: 'move', x: 0.2, y: 0.2 }] }).macro.map(e => e.t + e.type), ['5text', '9wheel', '10move', '1000click', '2000key'], 'macro: checked, rounded and sorted by time')
  assert.deepEqual(normaliseOptions().macro, [], 'macro: empty by default')
  for (const [bad, why] of [['x', /list of events/], [[1], /list of events/], [[{ t: 0, type: 'tap' }], /type to be click/], [[{ t: 0, type: 'click', x: 2, y: 0 }], /x to be a number from 0 to 1/], [[{ t: 0, type: 'click', x: 0 }], /y to be a number/],
    [[{ t: -1, type: 'key', key: 'Enter' }], /t to be a number/], [[{ t: 3600001, type: 'key', key: 'Enter' }], /t to be a number/], [[{ t: 0, type: 'key', key: 'F13' }], /key to be a name/], [[{ t: 0, type: 'text', text: '' }], /text to be 1 to 2000/],
    [[{ t: 0, type: 'click', x: 0, y: 0, z: 1 }], /unknown field in event 1: z/], [Array.from({ length: 2001 }, (_, i) => click(i)), /at most 2000 events/], [Array.from({ length: 52 }, () => ({ t: 0, type: 'text', text: 'x'.repeat(2000) })), /KB of typed text/]])
    assert.throws(() => normaliseOptions({ macro: bad }), why, 'macro: refused ' + JSON.stringify(bad).slice(0, 50))
  assert.match(cliCommand({ macro: [click(5)] }), / --macro macro\.json$/, 'macro: the CLI line')
  assert.deepEqual(readMacro({ events: [click(1)] }), readMacro([click(1)]), 'macro file: a list or { events }'); assert.deepEqual(readMacro([click(1)]), { events: [click(1)], viewport: null }, 'macro file: a bare list has no size'); assert.throws(() => readMacro({ nope: 1 }), /list of events/)
  // Macro format 2 (E1.1): wait steps, the recorded window size, the player's delays, and the notes the player leaves.
  {
    const w = (extra, t = 5) => [{ t, type: 'wait', ...extra }]
    assert.deepEqual(normaliseOptions({ macro: [...w({ text: 'Next' }), ...w({ ms: 500.4 }, 6), ...w({ milestone: 'found', timeout: 2000 }, 7), ...w({ quiet: 300 }, 8)] }).macro,
      [{ t: 5, type: 'wait', text: 'Next' }, { t: 6, type: 'wait', ms: 500 }, { t: 7, type: 'wait', milestone: 'found', timeout: 2000 }, { t: 8, type: 'wait', quiet: 300 }], 'macro: each wait form is accepted')
    for (const [bad, why] of [[w({}), /exactly one of ms, text, milestone or quiet in wait event 1/], [w({ text: 'a', ms: 5 }), /exactly one/], [w({ ms: 0 }), /ms to be a number from 1 to 600000/], [w({ ms: 600001 }), /ms to be a number/],
      [w({ text: '' }), /text to be 1 to 200 characters in wait event 1/], [w({ text: 'x'.repeat(201) }), /text to be 1 to 200/], [w({ milestone: 'nope' }), /milestone to be one of launched, scripts/], [w({ quiet: 99 }), /quiet to be a number from 100 to 30000/],
      [w({ quiet: 30001 }), /quiet to be a number/], [w({ text: 'a', timeout: 999 }), /timeout to be a number from 1000 to 600000/], [w({ text: 'a', timeout: 600001 }), /timeout to be a number/], [[{ t: 0, type: 'wait', text: 'a', x: 0 }], /unknown field in event 1: x/]])
      assert.throws(() => normaliseOptions({ macro: bad }), why, 'macro: refused ' + JSON.stringify(bad))
    const ev = [click(1)], vp = { width: 800, height: 600 }
    assert.deepEqual(readMacro({ format: 'package-lab-macro', version: 1, events: ev }), { events: ev, viewport: null }, 'macro file: version 1')
    assert.deepEqual(readMacro({ format: 'package-lab-macro', version: 2, viewport: vp, events: ev }), { events: ev, viewport: vp }, 'macro file: version 2 with a size')
    assert.deepEqual(readMacro({ version: 2, events: ev }), { events: ev, viewport: null }, 'macro file: version 2 without a size')
    assert.throws(() => readMacro({ version: 2, viewport: { width: 5, height: 5 }, events: ev }), /whole pixels/, 'macro file: a bad size is refused')
    assert.deepEqual(macroFileOf(ev, vp), { format: 'package-lab-macro', version: 2, viewport: vp, events: ev }, 'macro file: written as version 2')
    assert.deepEqual(readMacro(JSON.parse(JSON.stringify(macroFileOf(ev, vp)))), { events: ev, viewport: vp }, 'macro file: round trip')
    assert.deepEqual(readMacro(macroFileOf(ev)), { events: ev, viewport: null }, 'macro file: round trip without a size')
    assert.deepEqual(macroDelays([{ t: 0 }, { t: 500 }, { type: 'wait', t: 600 }, { t: 900 }]), [0, 500, 100, 300], 'player: the sleep before each event')
    assert.deepEqual(macroDelays([{ t: 700 }]), [700], 'player: the first event waits its own time'); assert.deepEqual(macroDelays([]), [])
    assert.equal(quietFor([{ end: 100 }, { end: 400 }], 1000), 600, 'quiet: since the last request ended'); assert.equal(quietFor([{ end: 100 }, {}], 1000), 0, 'quiet: not while one is pending'); assert.equal(quietFor([], 700), 700, 'quiet: no requests at all')
    const run = { ...normaliseOptions({ macro: ev }) }
    assert.deepEqual([withMacroSize(run, vp).options.viewport.width, withMacroSize(run, vp).options.viewport.height, withMacroSize(run, vp).note], [800, 600, null], 'macro size: set when the run has none')
    assert.equal(withMacroSize(run, null).options, run, 'macro size: none recorded, none set')
    const other = normaliseOptions({ macro: ev, viewport: 'iphone' })
    assert.deepEqual(withMacroSize(other, vp), { options: other, note: { type: 'macro-size', recorded: vp, used: { width: 390, height: 844 } } }, 'macro size: the run’s own size wins, with a note')
    assert.equal(withMacroSize(normaliseOptions({ macro: ev, viewport: '800x600' }), vp).note, null, 'macro size: the same size is no note')
    assert.equal(withMacroSize(normaliseOptions({ viewport: 'iphone' }), vp).note, null, 'macro size: no events, no note')
    // The macro editor's pure parts (E4.2).
    {
      const clk = (t, x = 0.5) => ({ t, type: 'click', x, y: 0.5 }), three = [clk(1000, 0.1), clk(3000, 0.2), clk(6000, 0.3)], ts = l => l.map(e => e.t), xs = l => l.map(e => e.x)
      assert.deepEqual(ts(setDelay(three, 1, 500)), [1000, 1500, 4500], 'editor: setDelay shifts every later step by the difference')
      assert.deepEqual(ts(setDelay(three, 0, 0)), [0, 2000, 5000], 'editor: the first step’s delay is its own time')
      assert.deepEqual(ts(setDelay(three, 2, 4000)), [1000, 3000, 7000], 'editor: a longer delay on the last step')
      assert.throws(() => setDelay(three, 1, -5), /0 or more/, 'editor: a negative delay is refused'); assert.throws(() => setDelay(three, 1, 'x'), /number of milliseconds/); assert.throws(() => setDelay(three, 9, 5), /Choose a step/)
      assert.deepEqual([xs(move(three, 1, 1)), ts(move(three, 1, 1))], [[0.1, 0.3, 0.2], [1000, 4000, 6000]], 'editor: move swaps the delays with the steps, not the times')
      assert.deepEqual([xs(move(three, 1, -1)), ts(move(three, 1, -1))], [[0.2, 0.1, 0.3], [2000, 3000, 6000]], 'editor: move up')
      assert.equal(move(three, 0, -1), three, 'editor: the first step can’t go up'); assert.equal(move(three, 2, 1), three, 'editor: the last step can’t go down')
      for (let i = 0; i < 3; i++) for (const d of [-1, 1]) assert.ok(ts(move(three, i, d)).every((t, k, l) => !k || t >= l[k - 1]), 'editor: t stays non-decreasing')
      assert.deepEqual([xs(remove(three, 0)), ts(remove(three, 0))], [[0.2, 0.3], [2000, 5000]], 'editor: remove the first step: the others keep their delays')
      assert.deepEqual(ts(remove(three, 1)), [1000, 4000], 'editor: remove a middle step'); assert.deepEqual(remove([clk(5)], 0), [], 'editor: remove the only step')
      const w = insertWait(three, 3, { text: 'Next' })
      assert.deepEqual(w.map(e => e.type), ['click', 'click', 'click', 'wait'], 'editor: insertWait at the end'); assert.deepEqual([w[3].t, w[3].text], [6000, 'Next'])
      assert.deepEqual(insertWait(three, 0, { ms: 500 }).map(e => [e.type, e.t]), [['wait', 0], ['click', 1000], ['click', 3000], ['click', 6000]], 'editor: insertWait at the start leaves the rest in place')
      assert.deepEqual(insertWait(three, 1, { quiet: 300 })[1], { t: 1000, type: 'wait', quiet: 300 }, 'editor: a wait in the middle has its neighbour’s time')
      assert.throws(() => insertWait(three, 1, { text: '' }), /text/, 'editor: an empty wait is refused'); assert.throws(() => insertWait(three, 1, { milestone: 'nope' }), /milestone/); assert.throws(() => insertWait(three, 9, { ms: 5 }), /where/)
      assert.deepEqual(setFields(three, 0, { x: 0.9 })[0], clk(1000, 0.9), 'editor: setFields changes a field'); assert.throws(() => setFields(three, 0, { x: 2 }), /x to be a number from 0 to 1/, 'editor: a bad value says what to fix')
      assert.equal(setFields([{ t: 1, type: 'wait', text: 'a', timeout: 5000 }], 0, { timeout: null })[0].timeout, undefined, 'editor: null takes a field out')
      assert.deepEqual(editMacro(three, { op: 'remove', i: 0 }), remove(three, 0), 'editor: edit routes to the pure functions'); assert.deepEqual(editMacro(three), three, 'editor: no op checks the list')
      const edited = insertWait(setDelay(three, 1, 400), 1, { text: 'Next', timeout: 5000 }), rt = normaliseOptions({ macro: JSON.parse(JSON.stringify(macroFileOf(edited, vp))).events }).macro
      assert.deepEqual(rt, edited, 'editor: an edited list survives a file and normaliseOptions'); assert.deepEqual(readMacro(macroFileOf(edited, vp)), { events: edited, viewport: vp }, 'editor: and readMacro')
      const rows = macroRows([clk(800), { t: 800, type: 'wait', text: 'Next' }, { t: 900, type: 'wait', quiet: 500, timeout: 5000 }, { t: 900, type: 'wait', ms: 2000 }, { t: 1000, type: 'wait', milestone: 'wrote' },
        { t: 1100, type: 'key', key: 'Enter' }, { t: 1200, type: 'text', text: 'hello' }, { t: 1300, type: 'wheel', x: 0.5, y: 0.5, dy: -120 }, { t: 1400, type: 'click', x: 0.375, y: 0.25, target: { sel: 'button#next', text: 'Next' } }], { width: 1100, height: 800 })
      assert.deepEqual(rows.map(r => r.when), ['+0.8 s', 'wait for “Next” (30 s)', 'wait for the network to be quiet for 0.5 s (5 s)', 'wait 2 s', 'wait for step wrote (30 s)', '+0.1 s', '+0.1 s', '+0.1 s', '+0.1 s'], 'editor rows: When')
      assert.deepEqual(rows.map(r => r.action), ['Click', 'Wait', 'Wait', 'Wait', 'Wait', 'Key Enter', 'Type “hello”', 'Scroll up', 'Click'], 'editor rows: Action')
      assert.deepEqual([rows[0].where, rows[7].where, rows[8].where], ['550, 400', '550, 400', '413, 200 button#next “Next”'], 'editor rows: Where in pixels, with the element')
      assert.equal(macroRows([clk(0)])[0].where, '50%, 50%', 'editor rows: no size, so percentages')
      assert.deepEqual(macroTable(rows.slice(0, 2)), [['Step', 'When', 'Action', 'Where'], ['1', '+0.8 s', 'Click', '550, 400'], ['2', 'wait for “Next” (30 s)', 'Wait', '']], 'macro show: the table is a header and one row of strings per step')
      assert.equal(macroName('next'), 'next'); assert.equal(macroName('Step 2.v-1_a'), 'Step 2.v-1_a', 'editor: a good name')
      for (const bad of ['', ' ', '../x', '.hidden', 'a/b', 'a\\b', 'x'.repeat(61), 'tab\t', null, 'é']) assert.throws(() => macroName(bad), /name|dot|characters|letters/, `editor: the name ${JSON.stringify(bad)} is refused`)
      assert.equal(macroName('x'.repeat(60)).length, 60, 'editor: 60 characters is fine')
    }
    const launch = { kind: 'package', itemType: 'sco', expose: '1.2' }
    const sized = runFindings(trace({ probe: [{ type: 'macro-size', recorded: vp, used: { width: 390, height: 844 }, t: 5 }] }), launch).find(f => /recorded at/.test(f.title))
    assert.deepEqual([sized.sev, sized.title], ['info', 'The macro was recorded at 800×600 and played at 390×844: clicks may miss'], 'macro size: the finding')
    const waited = runFindings(trace({ probe: [{ type: 'macro-wait', event: 3, waited: 30000, for: { text: 'Next' }, t: 5 }, { type: 'macro-wait', event: 0, waited: 2500, for: { milestone: 'found' }, t: 6 }, { type: 'macro-wait', event: 1, waited: 5000, for: { quiet: 500 }, t: 7 }] }), launch).filter(f => /^The macro stopped/.test(f.title))
    assert.deepEqual(waited.map(f => f.sev + ' ' + f.title), ['warn The macro stopped at step 4: waited 30 s for “Next” and it never appeared', 'warn The macro stopped at step 1: waited 2.5 s for the step “found” and the run never reached it',
      'warn The macro stopped at step 2: waited 5 s for the network to be quiet for 500 ms and it never was'], 'macro wait: the findings')
    assert.match(waited[0].fix, /Lengthen the wait step’s timeout/, 'macro wait: the fix')
  }
  assert.deepEqual(macroFromTrace({ probe: [{ type: 'input', kind: 'click', x: 0.5, y: 0.25, t: 40 }, { type: 'api', t: 41 }, { type: 'input', kind: 'key', key: 'Tab', t: 50 }, { type: 'input', kind: 'text', text: 'a', t: 60 }] }),
    [{ t: 40, type: 'click', x: 0.5, y: 0.25 }, { t: 50, type: 'key', key: 'Tab' }, { t: 60, type: 'text', text: 'a' }], 'macro: made from the probe’s input reports')
  // Clicks tied to their element (E1.2): the target field, what the trace carries over, and what redaction cuts.
  {
    const tg = { sel: '#next', text: 'Next', role: 'button', frame: [0, 2] }, ck = target => [{ t: 1, type: 'click', x: 0.5, y: 0.5, target }]
    assert.deepEqual(normaliseOptions({ macro: ck(tg) }).macro[0].target, tg, 'target: accepted whole'); assert.deepEqual(normaliseOptions({ macro: ck({ sel: 'a' }) }).macro[0].target, { sel: 'a' }, 'target: only sel is needed')
    for (const [bad, why] of [['#next', /target to be like/], [{}, /target.sel in event 1 to be 1 to 500/], [{ sel: 'a'.repeat(501) }, /target.sel/], [{ sel: 'a', text: 'x'.repeat(61) }, /target.text in event 1 to be at most 60/], [{ sel: 'a', role: 'x'.repeat(41) }, /target.role/],
      [{ sel: 'a', frame: [1000] }, /target.frame/], [{ sel: 'a', frame: [0, 0, 0, 0, 0, 0, 0, 0, 0] }, /target.frame/], [{ sel: 'a', frame: [1.5] }, /target.frame/], [{ sel: 'a', x: 1 }, /target to be like/]])
      assert.throws(() => normaliseOptions({ macro: ck(bad) }), why, 'target: refused ' + JSON.stringify(bad).slice(0, 40))
    assert.throws(() => normaliseOptions({ macro: [{ t: 1, type: 'key', key: 'Tab', target: tg }] }), /unknown field in event 1: target/, 'target: only on clicks')
    assert.deepEqual(readMacro(JSON.parse(JSON.stringify({ version: 2, events: ck(tg) }))).events, ck(tg), 'target: survives a macro file')
    assert.deepEqual(macroFromTrace({ probe: [{ type: 'input', kind: 'click', x: 0.5, y: 0.5, t: 1, target: tg }, { type: 'input', kind: 'click', x: 0.1, y: 0.1, t: 2, approx: true, target: tg }, { type: 'input', kind: 'click', x: 0.2, y: 0.2, t: 3, target: { sel: '' } }] }),
      [{ t: 1, type: 'click', x: 0.5, y: 0.5, target: tg }, { t: 2, type: 'click', x: 0.1, y: 0.1, approx: true }, { t: 3, type: 'click', x: 0.2, y: 0.2 }], 'target: macroFromTrace keeps it, but not on an approximate click or a bad one')
    assert.deepEqual([cleanTarget(tg), cleanTarget(null), cleanTarget({ sel: 5 })], [tg, undefined, undefined], 'target: cleanTarget')
    const mkTrace = o => ({ ...trace(), label: 'x', duration: 4000, sources: {}, console: [], navigations: [], cmi: {}, exec: [], sites: [], targets: [], untraced: [], ...o })
    const rd = redactRun({ trace: mkTrace({ probe: [{ type: 'input', t: 1, kind: 'click', x: 0.5, y: 0.5, target: { sel: '#chapter-two > [aria-label="Secret label"]:nth-of-type(2)', text: 'Secret words', role: 'button' } }, { type: 'input', t: 2, kind: 'click', x: 0.5, y: 0.5, target: { sel: '#\\32 nd-chapter > b' } }] }), kind: 'reference', launch: { options: { macro: ck({ sel: '[name="user-name"]', text: 'Secret words', role: 'input' }) } } })
    assert.deepEqual(rd.trace.probe[0].target, { sel: '#‹11 characters› > [aria-label="‹12 characters›"]:nth-of-type(2)', text: '‹12 characters›', role: 'button' }, 'redact: a target’s text, ids and attribute values')
    assert.equal(rd.trace.probe[1].target.sel, '#‹14 characters› > b', 'redact: an id with a CSS hex escape is cut whole')
    assert.deepEqual(rd.launch.options.macro[0].target, { sel: '[name="‹9 characters›"]', text: '‹12 characters›', role: 'input' }, 'redact: a macro’s target')
    assert.ok(!JSON.stringify(rd).includes('Secret') && !JSON.stringify(rd).includes('chapter') && !JSON.stringify(rd).includes('nd-'), 'redact: nothing of the target is left')
    const anchored = runFindings(trace({ probe: [{ type: 'macro-anchor', event: 2, found: 0, used: 'position', t: 5 }, { type: 'macro-anchor', event: 4, found: 2, used: 'position', t: 6 }, { type: 'macro-anchor', event: 5, found: 0, used: 'position', t: 7 }] }), { kind: 'package', itemType: 'sco', expose: '1.2' }).find(f => /element/.test(f.title))
    assert.deepEqual([anchored.sev, anchored.title, anchored.evidence], ['info', '3 clicks didn’t find their element and used their recorded position', ['step 3: no element found', 'step 5: 2 elements matched', 'step 6: no element found']], 'macro anchor: the finding')
    assert.equal(runFindings(trace({ probe: [{ type: 'macro-anchor', event: 0, found: 0, used: 'position', t: 5 }] }), { kind: 'package', itemType: 'sco', expose: '1.2' }).find(f => /element/.test(f.title)).title, '1 click didn’t find its element and used its recorded position', 'macro anchor: one click')
  }
  assert.deepEqual([resumeOptions({ macro: [click(1)], depth: 1 })].map(o => [o.macro.length, o.resume, o.depth]), [[0, true, 1]], 'cycle: the second run plays no macro and resumes')

  // cycleFindings over runs made of the probe's API reports (SCORM 1.2).
  const call = (c, el = '', value, result = 'true') => ({ type: 'api', version: '1.2', call: c, el, value, result })
  const set = (el, v) => call('LMSSetValue', el, v), get = (el, result = 'x') => call('LMSGetValue', el, undefined, result)
  const L = 'cmi.core.lesson_location', S = 'cmi.suspend_data', X = 'cmi.core.exit', ST = 'cmi.core.lesson_status'
  const unload = { type: 'unload', event: 'pagehide', frame: 'lab://run/pkg/a.html', listeners: { beforeunload: 0, pagehide: 1, unload: 0 }, props: [] }
  const run = (probe, cmi = {}) => ({ trace: { probe: [call('LMSInitialize'), ...probe], cmi: { '1.2': cmi } } })
  const saving = [set(L, '3'), set(ST, 'incomplete'), set(S, '{"a":1}'), unload, set(X, 'suspend'), call('LMSFinish')]
  const resumed = (extra = [], entry = 'resume') => run([get(X + 'x'), get(L), get(S), ...extra], { 'cmi.core.entry': entry })
  const titles = (a, b, macro) => cycleFindings({ runs: [a, b], macro }).map(f => f.sev + ' ' + f.title)
  assert.deepEqual(titles(run(saving), resumed([set(L, '3'), set(S, '{"a":1,"b":2}')])), ['info Saving and resuming worked'], 'cycle: a clean cycle')
  let f = cycleFindings({ runs: [run([get(L)]), resumed()], macro: [] })
  assert.deepEqual(f.map(x => x.sev + ' ' + x.title), ['error Leaving the course saved nothing'], 'cycle: nothing saved stops the checks')
  assert.ok(f[0].evidence.some(e => /No macro was given/.test(e)) && f[0].evidence.some(e => /No beforeunload/.test(e)), 'cycle: nothing saved: says no macro, no unload event')
  f = cycleFindings({ runs: [run([call('LMSSetValue', L, '', 'true'), unload]), resumed()], macro: [click(1)] })
  assert.ok(f[0].sev === 'error' && f[0].evidence[0] === 'The macro played 1 events first.' && f[0].evidence.some(e => /a\.html added 0 beforeunload, 1 pagehide, 0 unload listeners/.test(e)), 'cycle: an empty location is not a save; the handlers are listed: ' + JSON.stringify(f[0].evidence))
  f = cycleFindings({ runs: [run([set(L, '3'), unload, set('cmi.core.session_time', '0000:00:01.00'), set(X, 'suspend')]), resumed([set(L, '3')])] })
  assert.deepEqual(f.map(x => x.sev + ' ' + x.title), ['warn Leaving the course didn’t end the session'], 'cycle: no Finish')
  assert.ok(/API calls while leaving: LMSSetValue\(cmi\.core\.session_time\), LMSSetValue\(cmi\.core\.exit\)/.test(f[0].evidence.join()), 'cycle: calls made while leaving are listed: ' + f[0].evidence)
  f = titles(run([...saving.slice(0, 4), call('LMSFinish')]), resumed([], ''))
  assert.deepEqual(f, ['warn The LMS started a new attempt instead of resuming (entry was “”)'], 'cycle: exit never set, no resume offered')
  f = cycleFindings({ runs: [run([...saving.slice(0, 4), set(X, 'normal'), call('LMSFinish')]), resumed([], '')] })
  assert.ok(/exit written by the content: “normal”/.test(f[0].evidence[0]) && /Set cmi\.core\.exit to “suspend”/.test(f[0].fix), 'cycle: exit with another value')
  assert.deepEqual(titles(run([...saving.slice(0, 2), set(ST, 'completed'), call('LMSFinish')]), resumed([], '')), ['info The first run finished the attempt, so there was nothing to resume'], 'cycle: a finished attempt has nothing to resume')
  f = cycleFindings({ runs: [run(saving), run([set(L, '3')], { 'cmi.core.entry': 'resume' })] })
  assert.deepEqual([f[0].sev, f[0].title, f[0].evidence.length], ['error', 'On resume, the content didn’t read its saved place', 2], 'cycle: saved place not read: ' + JSON.stringify(f))
  assert.deepEqual(titles(run(saving), resumed([set(L, '1')])), ['warn The content read its saved place but started from the beginning'], 'cycle: restarts at the beginning')
  assert.deepEqual(titles(run(saving), resumed([set(L, '3'), set(S, '')])), ['warn Suspend data written after resuming doesn’t start from what was saved'], 'cycle: suspend data starts again')
  assert.deepEqual(titles(run(saving), resumed([set(L, '3'), set(S, '{"a":1,"b":22}')])), ['info Saving and resuming worked'], 'cycle: longer suspend data is fine')
  // SCORM 2004 uses its own elements, found from the version the first run initialised.
  const c4 = (c, el = '', value, result = 'true') => ({ type: 'api', version: '2004', call: c, el, value, result })
  const r4 = (probe, cmi) => ({ trace: { probe: [c4('Initialize'), ...probe], cmi: { 2004: cmi } } })
  assert.deepEqual(titles(r4([c4('SetValue', 'cmi.location', '5'), c4('SetValue', 'cmi.exit', 'suspend'), c4('Terminate')], {}), r4([c4('GetValue', 'cmi.location', undefined, '5'), c4('SetValue', 'cmi.location', '5')], { 'cmi.entry': 'resume' })), ['info Saving and resuming worked'], 'cycle: SCORM 2004')
  const rows = cycleRows([run(saving, { [ST]: 'incomplete' }), resumed([set(L, '3')])])
  assert.deepEqual(rows.find(r => r.label === 'Entry offered'), { label: 'Entry offered', a: '(nothing)', b: 'resume' }, 'cycle: rows'); assert.equal(rows.find(r => r.label === 'Exit set').a, 'suspend')
  // Review fixes: the final leave's reports, Finish before or while leaving, exit as its own finding, approximate clicks, typed text.
  const leaveMark = { type: 'leave' }, early = { ...unload, frame: 'lab://run/pkg/early.html' }
  f = cycleFindings({ runs: [run([early, set(L, '3'), leaveMark, unload, call('LMSSetValue', X, 'suspend'), call('LMSFinish')]), resumed([set(L, '3')])] })
  assert.deepEqual(f.map(x => x.title), ['Saving and resuming worked'], 'cycle: Finish while leaving counts')
  f = cycleFindings({ runs: [run([early, set(L, '3'), set(ST, 'incomplete'), unload, leaveMark, call('LMSSetValue', X, 'suspend')]), resumed([set(L, '3')])] })
  assert.deepEqual(f.map(x => x.title), ['Leaving the course didn’t end the session'], 'cycle: Finish before the leave marker is not "while leaving"; unloads before it are not the leave')
  assert.deepEqual(f[0].evidence, ['No beforeunload, pagehide or unload event reached the content.'], 'cycle: only reports after the leave are listed: ' + f[0].evidence)
  f = cycleFindings({ runs: [run([set(L, '3'), call('LMSFinish')]), resumed([], '')] })
  assert.deepEqual(f.map(x => x.title), ['The content never sets exit, and its status is “”'], 'cycle: exit unset with no incomplete status is its own finding, and the entry finding is left out as redundant')
  f = cycleFindings({ runs: [run([...saving.slice(0, 4), set(X, 'normal'), call('LMSFinish')]), resumed([], '')] })
  assert.deepEqual(f.map(x => x.title), ['The content exits with “normal” instead of “suspend”'], 'cycle: exit with another value')
  f = cycleFindings({ runs: [run(saving.slice(0, 2).concat([call('LMSFinish')])), resumed([], '')] })
  assert.deepEqual(f.map(x => x.title), ['The LMS started a new attempt instead of resuming (entry was “”)'], 'cycle: exit unset with the status incomplete passes the exit check; entry still says no resume')
  // approximate clicks and typed text
  assert.deepEqual(readMacro([{ t: 1, type: 'click', x: 0.1, y: 0.2, approx: true }]).events, [{ t: 1, type: 'click', x: 0.1, y: 0.2, approx: true }], 'macro: approx clicks are kept')
  assert.throws(() => normaliseOptions({ macro: [{ t: 1, type: 'click', x: 0, y: 0, approx: 1 }] }), /approx/, 'macro: approx is true or left out')
  assert.throws(() => normaliseOptions({ macro: [{ t: 0, type: 'constructor' }] }), /type to be click/, 'macro: only own event types (constructor is not one)')
  assert.deepEqual(macroFromTrace({ probe: [{ type: 'input', kind: 'click', x: 0.5, y: 0.5, approx: true, t: 5 }, { type: 'input', kind: 'text', length: 6, redacted: true, t: 6 }, { type: 'input', kind: 'text', text: 'ok', t: 7 }] }),
    [{ t: 5, type: 'click', x: 0.5, y: 0.5, approx: true }, { t: 7, type: 'text', text: 'ok' }], 'macro: redacted text (a password field) is left out, approx kept')
  assert.equal(normaliseOptions({ recordInput: true }).recordInput, true); assert.match(cliCommand({ recordInput: true }), / --record-input$/, 'recordInput: the CLI line'); assert.throws(() => normaliseOptions({ recordInput: 'yes' }), /true or false/)
}

// ---- Corrected package export (P3.1): the ZIP writer and the autofixes ----
{
  const method = buf => buf.readUInt16LE(8)   // of the first local header
  // The writer: an empty file, binary data that doesn't compress (stored), large compressible data (deflated), non-ASCII names (UTF-8 flag).
  const noise = randomBytes(50000), big = Buffer.from('<p>Package Lab</p>\n'.repeat(120000))
  const z = zip(new Map([['empty.txt', Buffer.alloc(0)], ['noise.bin', noise], ['big.html', big], ['dir/café ü.txt', Buffer.from('é')], ['日本語/ファイル.js', Buffer.from('var a = 1')]]))
  const back = unzip(z)
  assert.deepEqual([...back.keys()], ['empty.txt', 'noise.bin', 'big.html', 'dir/café ü.txt', '日本語/ファイル.js'], 'zip: names and order survive, non-ASCII included')
  assert.ok(back.get('empty.txt').length === 0 && back.get('noise.bin').equals(noise) && back.get('big.html').equals(big) && back.get('dir/café ü.txt').toString() === 'é', 'zip: contents round-trip')
  const first = z.readUInt32LE(0) === 0x04034b50 && method(z), eocd = z.length - 22, cd = z.readUInt32LE(eocd + 16)
  const entries = []; for (let p = cd, i = 0; i < z.readUInt16LE(eocd + 10); i++) { const n = z.readUInt16LE(p + 28); entries.push({ flags: z.readUInt16LE(p + 8), method: z.readUInt16LE(p + 10), csize: z.readUInt32LE(p + 20), size: z.readUInt32LE(p + 24), name: z.subarray(p + 46, p + 46 + n).toString('utf8') }); p += 46 + n + z.readUInt16LE(p + 30) + z.readUInt16LE(p + 32) }
  assert.equal(first, 0, 'zip: an empty file is stored')
  assert.deepEqual(entries.map(e => e.method), [0, 0, 8, 0, 0], 'zip: empty, incompressible and tiny data are stored, large text deflated')
  assert.ok(entries[2].method === 8 && entries[2].csize < big.length / 10, 'zip: large text is deflated and smaller: ' + entries[2].csize)
  assert.ok(entries.every(e => e.csize <= e.size || e.method === 8) && entries[1].csize === noise.length, 'zip: stored only when deflate isn’t smaller')
  assert.deepEqual(entries.map(e => !!(e.flags & 0x800)), [false, false, false, true, true], 'zip: the UTF-8 flag is set for non-ASCII names only')
  const zf = join(work, 'writer.zip'); writeFileSync(zf, z)
  const t = unzipT(zf); assert.equal(t.status, 0, 'zip: unzip -t accepts it: ' + t.stdout + t.stderr); assert.match(t.stdout, /No errors detected/)
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926, 'zip: crc32 check value'); assert.equal(crc32Table(Buffer.from('123456789')), 0xcbf43926, 'zip: the table fallback agrees')
  assert.equal(crc32Table(noise), crc32(noise), 'zip: the table fallback agrees on binary data')
  assert.equal(unzip(zip(new Map())).size, 0, 'zip: an empty archive')
  for (const bad of ['', '/etc/x', '../x', 'a/../x', 'a\\b', 'C:/x', 'c:x', 'a\nb', 'a\x00b', '\\x']) assert.throws(() => zip(new Map([[bad, Buffer.alloc(0)]])), /unsafe ZIP entry name/, 'zip: refuses ' + JSON.stringify(bad))
  assert.ok(zip(new Map([['a..b/c.txt', Buffer.alloc(0)], ['.hidden', Buffer.alloc(0)]])).length, 'zip: dots inside names are fine')
  assert.throws(() => zip(new Map(Array.from({ length: 65536 }, (_, i) => ['f' + i, Buffer.alloc(0)]))), /Too many files/, 'zip: the entry limit is refused, not truncated')

  // The fixes, on small packages built in memory from the sample.
  const sample = () => unzip(readFileSync(good)), map = o => new Map(Object.entries(o).map(([k, v]) => [k, Buffer.from(v)]))
  const rename = (m, f) => new Map([...m].map(([k, v]) => [f(k), v]))
  const edit = (m, name, a, b) => { const o = new Map(m); o.set(name, Buffer.from(o.get(name).toString().replace(a, b))); return o }
  const probs = m => analyze(m).problems.map(p => p.code)
  const run1 = (id, m, params) => FIXES[id].apply(m, params)
  assert.deepEqual(FIX_IDS, ['manifest-case', 'manifest-not-root', 'file-missing', 'manifest-version', 'case', 'http-to-https', 'xyleme-player-type'], 'fixes: the seven, in order')
  for (const id of FIX_IDS) assert.deepEqual(run1(id, sample()).changes, [], `fixes: ${id} does nothing to a good package`)
  // manifest-case
  let r = run1('manifest-case', rename(sample(), k => k === 'imsmanifest.xml' ? 'IMSManifest.XML' : k))
  assert.ok(r.files.has('imsmanifest.xml') && !r.files.has('IMSManifest.XML') && r.changes.length === 1 && !probs(r.files).length, 'fix manifest-case: renamed: ' + r.changes)
  // manifest-not-root (and with the manifest in the wrong case, both together)
  r = run1('manifest-not-root', rename(sample(), k => 'course/' + k))
  assert.deepEqual([...r.files.keys()].sort(), [...sample().keys()].sort(), 'fix manifest-not-root: files are at the top of the ZIP'); assert.ok(r.changes.length === 1 && !probs(r.files).length)
  const both = correct(rename(sample(), k => 'course/' + (k === 'imsmanifest.xml' ? 'ImsManifest.xml' : k)))
  assert.deepEqual(both.applied.map(f => f.id), ['manifest-case', 'manifest-not-root'], 'fixes: layout fixes run in order'); assert.ok(!probs(both.files).length && both.files.has('imsmanifest.xml'))
  const clash = new Map([...rename(sample(), k => 'course/' + k), ['lesson.html', Buffer.from('x')]]), refused = run1('manifest-not-root', clash)
  assert.ok(refused.changes.length === 0 && /Left the folder course\/ alone/.test(refused.notes[0]), 'fix manifest-not-root: refuses to replace a file, with a note and no change')
  const refusedExport = exportFixed(clash, {}); assert.ok(refusedExport.zip === null && refusedExport.notes.length === 1, 'export: only notes means no zip')
  // file-missing
  r = run1('file-missing', edit(sample(), 'imsmanifest.xml', '<file href="lesson.js"/>', '<file href="lesson.js"/>\n      <file href="gone.js"/>\n      <file href="Style.CSS"><metadata/></file>'))
  assert.ok(!r.files.get('imsmanifest.xml').toString().includes('gone.js') && r.files.get('imsmanifest.xml').toString().includes('Style.CSS'), 'fix file-missing: a missing entry is removed, one with other capitals kept (that is the case fix’s)')
  assert.ok(r.changes.length === 1 && !probs(r.files).includes('file-missing'), 'fix file-missing: ' + r.changes)
  // manifest-version: the mismatch fixture (manifest 2004, scripts 1.2), and the other way
  const mm = unzip(readFileSync(mismatch)); r = run1('manifest-version', mm)
  const mmA = analyze(r.files), mmText = r.files.get('imsmanifest.xml').toString()
  assert.equal(mmA.manifest.version, '1.2'); assert.equal(mmA.manifest.schemaversion, '1.2'); assert.ok(/adlcp_rootv1p2/.test(mmText) && /imscp_rootv1p1p2/.test(mmText) && !/adlcp_v1p3|imscp_v1p1"/.test(mmText), 'fix manifest-version: 2004 → 1.2 namespaces: ' + mmText.slice(0, 600))
  assert.ok(!staticFindings(mmA).some(f => /but the scripts use/.test(f.title)), 'fix manifest-version: the mismatch finding is gone')
  let s04 = edit(edit(sample(), 'scorm.js', /[\s\S]*/, 'var API_1484_11 = window.parent.API_1484_11; API_1484_11.Initialize("")'), 'lesson.js', /[\s\S]*/, 'var x = 1')
  s04 = edit(s04, 'imsmanifest.xml', '<adlcp:masteryscore>80</adlcp:masteryscore>', '<adlcp:masteryscore>80</adlcp:masteryscore><adlcp:datafromlms>x</adlcp:datafromlms>')
  assert.ok(staticFindings(analyze(s04)).some(f => /says SCORM 1\.2, but the scripts use the SCORM 2004 API/.test(f.title) && f.autofix.params.to === '2004'), 'fix manifest-version: setup: 1.2 manifest, 2004 scripts')
  r = run1('manifest-version', s04); const t04 = r.files.get('imsmanifest.xml').toString(), a04 = analyze(r.files)
  assert.ok(a04.manifest.version === '2004' && a04.manifest.edition === '4th' && /adlcp_v1p3/.test(t04) && /imscp_v1p1"/.test(t04) && /xmlns:imsss/.test(t04) && /adlcp:scormType="sco"/.test(t04) && /adlcp:dataFromLMS/.test(t04), 'fix manifest-version: 1.2 → 2004: ' + t04.slice(0, 900))
  assert.ok(r.notes.some(c => /mastery score.*not converted/.test(c)) && !r.changes.some(c => /mastery/.test(c)), 'fix manifest-version: says what it didn’t convert, as a note: ' + r.notes)
  assert.deepEqual(run1('manifest-version', unzip(readFileSync(good))).changes, [], 'fix manifest-version: nothing when the scripts agree')
  // case: rename (every reference spells it the same wrong way), rewrite (another reference has it right), the manifest's own href, an import path
  const blankFiles = unzip(readFileSync(blank)); r = run1('case', blankFiles)
  assert.ok(r.files.has('js/app.js') && !r.files.has('js/App.js') && /Renamed js\/App\.js to js\/app\.js/.test(r.changes[0]), 'fix case: single wrong spelling renames the file: ' + r.changes)
  assert.ok(!bootGraph(r.files, 'lesson.html').risks.some(x => /capitals/.test(x.title)), 'fix case: no capitals finding on the boot graph')
  let mix = new Map(sample()); mix.set('js/App.js', Buffer.from('var a = 1')); mix.set('lesson.html', Buffer.from('<script src="js/App.js"></script><script src="../js/APP.js"></script>')); mix.set('glossary.html', Buffer.from('<script src="js/app.js"></script>'))
  r = run1('case', mix)
  assert.ok(r.files.has('js/App.js') && !r.files.has('js/app.js') && r.files.get('glossary.html').toString() === '<script src="js/App.js"></script>', 'fix case: with one right spelling the references change: ' + r.changes)
  assert.ok(!bootGraph(r.files, 'glossary.html').risks.some(x => /capitals/.test(x.title)), 'fix case: glossary no longer has capitals problems')
  r = run1('case', edit(sample(), 'imsmanifest.xml', 'href="lesson.html"', 'href="Lesson.HTML"'))
  assert.ok(/href="lesson\.html"/.test(r.files.get('imsmanifest.xml').toString()) && r.changes.length === 1 && !probs(r.files).includes('launch-case'), 'fix case: the manifest’s launch href: ' + r.changes)
  let dirs = new Map(sample()); dirs.set('Js/Lib.js', Buffer.from('1')); dirs.set('lesson.html', Buffer.from('<script src="js/lib.js"></script><script src="JS/lib.js"></script>'))
  r = run1('case', dirs); assert.ok(r.files.has('Js/Lib.js') && r.files.get('lesson.html').toString() === '<script src="Js/Lib.js"></script><script src="Js/Lib.js"></script>', 'fix case: a folder in the wrong capitals, two spellings: ' + r.changes)
  // http-to-https
  const web = edit(sample(), 'lesson.html', /<script/, '<script src="http://cdn.example.com/lib.js"></script><link rel="stylesheet" href=\'http://cdn.example.com/x.css\'><script')
  r = run1('http-to-https', web); assert.ok(/src="https:\/\/cdn\.example\.com\/lib\.js"/.test(r.files.get('lesson.html').toString()) && /href='https:\/\/cdn\.example\.com\/x\.css'/.test(r.files.get('lesson.html').toString()) && r.changes.length === 2, 'fix http-to-https: ' + r.changes)
  assert.ok(!bootGraph(r.files, 'lesson.html').risks.some(x => /over http/.test(x.title)), 'fix http-to-https: the finding is gone')
  // Files that aren't valid UTF-8 are left alone, with a note.
  const latin = new Map(web); latin.set('lesson.html', Buffer.concat([Buffer.from(web.get('lesson.html')), Buffer.from([0xff, 0xfe])]))
  r = run1('http-to-https', latin); assert.ok(r.changes.length === 0 && r.files.get('lesson.html').equals(latin.get('lesson.html')) && /lesson\.html alone: it isn’t valid UTF-8/.test(r.notes[0]), 'fix: a file that isn’t UTF-8 is not edited: ' + r.notes)
  const badManifest = new Map(mm); badManifest.set('imsmanifest.xml', Buffer.concat([mm.get('imsmanifest.xml'), Buffer.from([0xff])]))
  r = run1('manifest-version', badManifest); assert.ok(r.changes.length === 0 && r.notes.length === 1, 'fix manifest-version: a manifest that isn’t UTF-8 is left alone: ' + r.notes)
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), mm.get('imsmanifest.xml')]), withBom = new Map(mm); withBom.set('imsmanifest.xml', bom)
  assert.deepEqual([...run1('manifest-version', withBom).files.get('imsmanifest.xml').subarray(0, 3)], [0xef, 0xbb, 0xbf], 'fix manifest-version: a byte-order mark is kept')
  // Resource blocks are matched by identifier: a commented-out resource earlier in the manifest doesn't shift them.
  r = run1('file-missing', edit(edit(sample(), 'imsmanifest.xml', '<file href="lesson.js"/>', '<file href="lesson.js"/><file href="gone2.js"/>'), 'imsmanifest.xml', '<resources>', '<resources><!-- <resource identifier="old" href="x.html"><file href="gone.js"/><file href="lesson.js"/></resource> -->'))
  assert.ok(r.changes.length === 1 && /gone2\.js/.test(r.changes[0]) && /<!-- <resource identifier="old"[^>]*><file href="gone\.js"\/>/.test(r.files.get('imsmanifest.xml').toString()), 'fix file-missing: blocks matched by identifier: ' + r.changes)
  // The findings carry the fix as data, and stay serialisable.
  const fixable = f => f.autofix?.id
  assert.deepEqual(staticFindings(analyze(rename(sample(), k => 'course/' + (k === 'imsmanifest.xml' ? 'ImsManifest.xml' : k)))).map(fixable).filter(Boolean).sort(), ['manifest-case', 'manifest-not-root'], 'findings: manifest layout problems carry their fix')
  assert.equal(staticFindings(analyze(edit(sample(), 'imsmanifest.xml', '</resource>', '<file href="nope.js"/></resource>'))).find(f => /nope\.js/.test(f.title)).autofix.id, 'file-missing')
  assert.ok(bootGraph(blankFiles, 'lesson.html').risks.find(x => /capitals/.test(x.title)).autofix.id === 'case' && bootGraph(web, 'lesson.html').risks.find(x => /over http/.test(x.title)).autofix.id === 'http-to-https', 'findings: boot risks carry theirs')
  const withFix = staticFindings(analyze(mm)).find(f => f.autofix); assert.deepEqual(JSON.parse(JSON.stringify(withFix)), withFix, 'findings: autofix is plain data'); assert.deepEqual(withFix.autofix, { id: 'manifest-version', params: { to: '1.2' } })
  assert.ok(FIX_IDS.every(id => typeof FIXES[id].apply === 'function' && FIXES[id].label), 'fixes: each has a label and a function')
  // Export: overrides first, then the fixes; the change list and the proof; nothing changed means no zip; --only; unknown ids.
  const ex = exportFixed(blankFiles, { version: '9.9.9', name: 'blank.zip', overrides: { 'extra.txt': { content: 'hi' } } })
  const exOut = unzip(ex.zip), notes = exOut.get('PACKAGE-LAB-CHANGES.txt').toString()
  assert.ok(exOut.get('extra.txt').toString() === 'hi' && exOut.has('js/app.js') && /^Package Lab 9\.9\.9: changes made to blank\.zip/.test(notes) && /extra\.txt/.test(notes) && /Renamed js\/App\.js/.test(notes) && /Findings the changes cleared:\n {2}- Paths differ from the files only in capitals/.test(notes), 'export: the zip and its change list: ' + notes)
  assert.ok(ex.proof.gone.some(t => /capitals/.test(t)) && !staticAll(exOut).some(f => /capitals/.test(f.title)), 'export: proof by analysing the result')
  assert.deepEqual(prove(blankFiles, ex.files).gone, ex.proof.gone)
  assert.equal(exportFixed(sample(), {}).zip, null, 'export: a package with nothing to fix gives no zip'); assert.ok(exportFixed(sample(), { overrides: { 'a.txt': { content: 'x' } } }).zip, 'export: overrides alone are a change')
  assert.deepEqual(correct(mm, { only: 'case' }).applied, [], 'export: --only leaves the others out'); assert.deepEqual(correct(mm, { only: ['manifest-version'] }).applied.map(f => f.id), ['manifest-version'])
  assert.throws(() => correct(mm, { only: 'nope' }), /No autofix “nope”/, 'export: unknown id'); assert.throws(() => correct(mm, { only: ',' }), /needs fix ids/)
  assert.deepEqual(exportFixed(ex.files, {}).applied, [], 'export: running it again on its own result changes nothing')
  assert.ok(correct(mm).files !== mm && mm.get('imsmanifest.xml').toString().includes('schemaversion>2004'), 'export: the original files are not changed')
  assert.equal(fixedName('a b.ZIP'), 'a b-fixed.zip')
}
// Timeline (P4.2): lanes from hand-made traces (the good run's lanes are checked in the end-to-end part).
{
  const tr = {
    duration: 4000,
    requests: [{ t: 100, end: 400, url: 'lab://run/pkg/a.js', method: 'GET', status: 200 }, { t: 500, url: 'https://x.test/b', method: 'GET', failed: 'net::ERR', status: undefined }],
    scripts: [{ t: 150, url: 'lab://run/pkg/a.js', length: 10 }], console: [],
    exceptions: [{ t: 900, text: 'boom' }], caught: [{ t: 950, text: 'c', uncaught: false }],
    probe: [{ type: 'api', t: 200, call: 'LMSInitialize', el: '', result: 'true' }, { type: 'api', t: 300, call: 'LMSSetValue', el: 'cmi.core.lesson_status', result: 'true' },
      { type: 'dom', t: 1200, frame: 'lab://content/pkg/index.html', text: 40, media: 0, sample: 'Hello' }, { type: 'dom', t: 5, frame: 'lab://run/__lab/host.html', text: 9 }],
    exec: [{ t: 0, sid: '', frame: 'x', events: [[10, 1, 0], [1500, 4, 0, 1, 3]] }],
  }
  const ms = [{ id: 'launched', label: 'Launch page loaded', reached: true, t: 100, evidence: 'e' }, { id: 'scripts', label: 'Scripts loaded', reached: false, t: null, evidence: '' }]
  const m = timelineModel(tr, ms)
  assert.deepEqual(m.range, { from: 0, to: 4000 }, 'timeline: range is the run')
  assert.deepEqual(m.lanes.api.map(a => a.kind), ['init', 'set'], 'timeline: API calls coloured by kind')
  assert.deepEqual(m.lanes.requests.map(r => [r.t, r.t2, r.failed]), [[100, 400, false], [500, 500, true]], 'timeline: request bars, failed flag')
  assert.deepEqual(m.lanes.errors.map(e => e.kind), ['uncaught', 'caught'], 'timeline: errors')
  assert.deepEqual(m.lanes.dom.map(d => d.label), ['Hello'], 'timeline: Package Lab’s own page is not a DOM snapshot')
  assert.deepEqual(m.lanes.milestones.map(x => x.id), ['launched'], 'timeline: reached milestones only')
  assert.deepEqual(m.missing, ['Scripts loaded'], 'timeline: missing milestones named')
  assert.equal(m.lanes.density.reduce((a, b) => a + b, 0), 5, 'timeline: density counts events and repeats')
  assert.equal(m.size, 50, 'timeline: 80 buckets over the run')
  assert.equal(timelineModel({ probe: [], requests: [] }).lanes.density, undefined, 'timeline: no density when untraced')
  const empty = timelineModel({})
  assert.ok(empty.range.to > 0 && empty.lanes.api.length === 0 && empty.lanes.requests.length === 0, 'timeline: empty trace')
  const w = timelineView(tr, ms, { from: 0, to: 1000 })
  const lane = (v, id) => v.lanes.find(l => l.id === id).items
  assert.deepEqual(lane(w, 'api').map(a => +a.x.toFixed(2)), [0.2, 0.3], 'timeline view: calls as fractions of the window')
  assert.equal(lane(timelineView(tr, ms, { from: 0, to: 800 }), 'errors').length, 0, 'timeline view: items outside the window are left out')
  assert.equal(lane(w, 'requests')[0].x2, 0.4, 'timeline view: a bar that ends inside the window')
  assert.equal(lane(timelineView(tr, ms, { from: 1000, to: 2000 }), 'density').length, 20, 'timeline view: density buckets in the window')
  assert.deepEqual(lane(timelineView(tr, ms, { from: 1000, to: 2000 }), 'dom').map(d => +d.x.toFixed(1)), [0.2], 'timeline view: a DOM snapshot at 1200 in 1000 to 2000')
  assert.ok(timelineView(tr, ms).ticks.length >= 4, 'timeline view: ticks')
  const cut = timelineView(tr, ms, { from: 150, to: 1000 }).lanes.find(l => l.id === 'requests').items[0]
  assert.ok(cut.x === 0, 'timeline view: a bar that starts before the window starts at 0')
  assert.deepEqual([timelineView(tr, ms, { from: -5, to: 9e9 }).range], [{ from: 0, to: 4000, duration: 4000 }], 'timeline view: the window is clamped to the run')
  const bad = timelineHtml({ duration: 1000, requests: [], probe: [], exceptions: [{ t: 10, text: '<img onerror=x>' }], caught: [] }, [])
  assert.ok(bad.includes('&lt;img onerror=x&gt;') && !bad.includes('<img'), 'timeline report: text is escaped')
  assert.ok(bad.startsWith('<div class="sl-scroll"><svg class="sl-tl"'), 'timeline report: static SVG')
}

// Redacted reports (P4.4): a hand-made run with every kind of content in it. None of the content may survive; the diagnosis
// (vocabulary, numbers, element names, package paths) must. The input is not changed. The findings are worked out again from
// the redacted run, so they hold nothing the redacted run does not.
{
  assert.ok(['completed', 'suspend', 'ab-initio', 'not attempted', '85', '-1.5', 'PT1H30M', '00:10:00'].every(kept) && !kept('Welcome') && !kept('oxygen') && kept(''), 'redact: vocabulary, numbers and times are kept; text is not')
  const L = 'lab://run/pkg/'
  const mkTrace = o => ({ label: 'x', duration: 4000, sources: {}, console: [], log: [], exceptions: [], caught: [], requests: [], navigations: [], probe: [], cmi: {}, exec: [], sites: [], scripts: [], coverage: [], targets: [], untraced: [], ...o })
  const prof = { name: 'Custom LMS', frames: { depth: 0, sandbox: null }, headers: { 'X-Token': 'hdr-secret-value' }, csp: "default-src 'self' https://secret-cdn.example", launchParams: 'user=jsmith&sid=77;flag', limits: {} }
  const hand = {
    format: 'package-lab-run', version: 1, kind: 'package', label: 'pkg.zip · Lesson title · Part two · SCORM 1.2', package: 'pkg.zip', file: '/Users/someone/runs/a.json',
    launch: { version: '1.2', expose: '1.2', depth: 0, opener: false, item: 'Lesson title · Part two', itemIndex: 0, itemType: 'sco', url: L + 'lesson.html?learner=jsmith&token=abc123', resume: false, storage: 'normal', profile: prof,
      options: { files: { 'js/lesson.js': { content: 'var secret = "Wrong answer text"' } }, pins: [{ path: 'cmi.core.student_name', value: 'Sam Learner' }], launchParams: 'user=jsmith&sid=77;flag', profile: prof,
        responses: [{ match: 'https://example.com/api/*?key=apikey99', status: 200, body: '{"name":"Sam Learner"}', headers: { 'Set-Cookie': 'session=cookie-secret' } }], macro: [{ t: 5, type: 'text', text: 'my typed password' }, { t: 9, type: 'key', key: 'Enter' }, { t: 12, type: 'wait', text: 'Course heading words' }] } },
    findings: [{ sev: 'info', title: 'Said “Welcome to the course text here”', detail: 'Found it on the page', evidence: ['lab://run/pkg/lesson.html', 'LMSSetValue cmi.core.student_name = Sam Learner'] }],
    milestones: [{ id: 'shown', label: 'Content shown', reached: true, evidence: '42 characters of text, 0 media in lesson.html' }],
    boot: { start: 'lesson.html', nodes: [{ path: 'lesson.html', kind: 'page', how: 'launch', status: 'ok', depth: 0, ref: 'lesson.html' },
      { path: 'Course Folder/part two.html', target: 'Course%20Folder/part%20two.html?who=jsmith#frag', ref: 'part%20two.html?who=jsmith#frag', kind: 'page', how: 'tag', status: 'ok', depth: 1, from: 'lesson.html', line: 4 },
      { target: 'C:\\Users\\Sam Lee\\Course\\x.html', kind: 'page', how: 'tag', status: 'local', depth: 1, from: 'lesson.html', line: 5 }, { target: 'file:///Users/sam/course/y.html', kind: 'page', how: 'tag', status: 'local', depth: 1, from: 'lesson.html', line: 6 }],
      pages: [{ path: 'lesson.html', bodyText: 'Welcome to the course page', execOrder: [{ name: 'js/lesson.js?v=build77', mode: 'defer', line: 8 }] }],
      dynamic: [{ file: 'js/lesson.js', line: 3, text: "load('Lesson part two')" }],
      risks: [{ sev: 'warn', title: 'Scripts navigate the window above them', detail: 'd', evidence: ['js/lesson.js:7  top.location = "https://secret-host.example/start" // passPhrase', 'js/lesson.js:9 is read as "quoted json text"'], fix: '' }] },
    trace: mkTrace({
      label: 'x', sources: { 'lab://run/pkg/js/lesson.js': 'var secret = 1' },
      console: [{ t: 10, sid: 'a', level: 'log', text: 'hello from the course', at: [{ fn: 'show', url: L + 'js/lesson.js', line: 3, col: 5 }] }],
      log: [{ t: 11, sid: 'a', level: 'error', source: 'network', text: "Failed to load resource: https://example.com/a.js?sid=sess1 'quoted thing'", url: '' }, { t: 12, sid: 'a', level: 'info', source: 'javascript', text: 'content wrote this text', url: '' }],
      exceptions: [{ t: 11, text: "Uncaught TypeError: Cannot read properties of null (reading 'secretprop')", url: L + 'js/lesson.js', line: 3, at: [] },
        { t: 12, text: 'Uncaught Error: the answer to ‘ZQ item’ was wrong, it\'s \'it\'s ZQ2\' and unquoted zebra stripes', url: L + 'js/lesson.js', line: 4, at: [] },
        { t: 13, text: 'Refused to load the script because it violates the following Content Security Policy directive zebra-src', url: '', line: 0, at: [] },
        { t: 14, text: 'Uncaught ReferenceError: lessonData is not defined', url: '', line: 0, at: [] }],
      requests: [{ t: 12, sid: 'a', id: '1', url: 'https://example.com/api/x?token=abc123&lang=en#top', method: 'POST', status: 200, postData: 'SECRET=body', from: [] },
        { t: 13, sid: 'a', id: '2', url: L + 'img/a.png?v=7;secretflag&k', method: 'GET', status: 404, from: [] }],
      probe: [
        { type: 'dom', t: 20, frame: L + 'lesson.html', readyState: 'complete', text: 42, sample: 'Welcome to the course text here', loader: 'div#Please-wait-for-the-lesson', media: 0, visible: 3, frames: 0 },
        { type: 'api', t: 30, version: '1.2', call: 'LMSSetValue', el: 'cmi.core.lesson_status', value: 'completed', result: 'true' },
        { type: 'api', t: 31, version: '1.2', call: 'LMSSetValue', el: 'cmi.suspend_data', value: '{"q1":"oxygen"}', result: 'true' },
        { type: 'api', t: 32, version: '1.2', call: 'LMSGetValue', el: 'cmi.core.student_name', result: 'Sam Learner', err: 0 },
        { type: 'api', t: 33, version: '1.2', call: 'LMSSetValue', el: 'cmi.core.lesson_location', value: '3', result: 'true' },
        { type: 'api', t: 34, version: '1.2', call: 'LMSSetValue', el: 'cmi.core.lesson_location', value: 'core', result: 'true' },
        { type: 'input', t: 40, kind: 'text', text: 'my typed password' },
        { type: 'dialog', t: 41, kind: 'alert', message: 'Lesson complete, well done', leaving: false },
        { type: 'pin-write', t: 42, path: 'cmi.core.student_name', value: 'Sam Learner', n: 1 },
        { type: 'shape', t: 43, url: 'https://example.com/api/x?token=abc123', path: 'items.0.title', use: 'read', n: 1 },
        { type: 'cmi', t: 44, values: { 'cmi.core.student_name': 'Sam Learner', 'cmi.core.lesson_status': 'incomplete' } },
        { type: 'cmi-now', t: 45, values: { 'cmi.suspend_data': 'resume text here' } },
        { type: 'api', t: 47, version: '1.2', call: 'LMSSetValue', el: 'cmi.core.score.raw', value: '85', result: 'true' },
        { type: 'api', t: 48, version: '1.2', call: 'LMSSetValue', el: 'cmi.core.student_id', value: '12345', result: 'true' },
        { type: 'api', t: 49, version: '1.2', call: 'LMSSetValue', el: 'cmi.core.score.max', value: 'x', result: 'false', err: 405, diag: 'Invalid value: “zq secret ab”' },
        { type: 'frame', t: 46, frame: L + 'lesson.html', depth: 0, referrer: 'https://lms.example/launch?user=jsmith#x', origin: 'https://lms.example' },
        { type: 'macro-wait', t: 50, event: 2, waited: 30000, for: { text: 'Course heading words' } },
      ],
      cmi: { '1.2': { 'cmi.core.lesson_status': 'incomplete', 'cmi.suspend_data': 'xyz is secret text' } },
      scripts: [{ t: 1, sid: 'a', id: '7', url: L + 'js/lesson.js', hash: 'abc', length: 40 }], untraced: [{ file: 'js/big.js', why: 'too big' }],
    }),
  }
  const forbidden = ['Welcome to the course', 'Please-wait-for-the-lesson', 'hello from the course', 'SECRET=body', 'abc123', 'var secret', 'secret text', 'Wrong answer text', 'Sam Learner', 'my typed password', 'Lesson complete, well done',
    'oxygen', 'Lesson title', 'Part two', 'Lesson part two', '/Users/', 'Sam Lee', 'C:\\', '#top', '#frag', '#x', 'jsmith', 'hdr-secret-value', 'secret-cdn', 'cookie-secret', 'apikey99', 'sid=77', 'flag', 'secretprop', 'secretflag', 'sess1', 'quoted thing',
    'content wrote this text', 'passPhrase', 'secret-host', 'quoted json text', 'resume text here', 'build77', 'v=7', 'course/y.html']
  const red = redactRun(hand), text = JSON.stringify(red)
  for (const f of forbidden) assert.ok(!text.includes(f), 'redact: nothing of the content survives: ' + f)
  const T = red.trace, p = T.probe
  assert.equal(p[1].value, 'completed', 'redact: vocabulary kept')
  assert.equal(p[4].value, '‹1 characters›', 'redact: lesson_location is free text even when numeric')
  assert.equal(p[12].value, '85', 'redact: a score stays')
  assert.equal(p[13].value, '‹5 characters›', 'redact: a numeric learner id goes')
  assert.equal(p[14].diag, 'Invalid value: ‹12 characters›', 'redact: the rejected value in a diag (curly quotes) goes')
  assert.equal(p[5].value, '‹4 characters›', 'redact: a short common word is a value too')
  assert.equal(p[2].value, `‹${'{"q1":"oxygen"}'.length} characters›`, 'redact: suspend data as its length')
  assert.equal(p[2].el, 'cmi.suspend_data', 'redact: element names kept')
  assert.equal(p[3].result, `‹${'Sam Learner'.length} characters›`, 'redact: a Get’s result is a value too')
  assert.deepEqual(p[10].values, { 'cmi.core.student_name': '‹11 characters›', 'cmi.core.lesson_status': 'incomplete' }, 'redact: a cmi probe’s values')
  assert.deepEqual(p[11].values, { 'cmi.suspend_data': '‹16 characters›' }, 'redact: a cmi-now probe’s values')
  assert.equal(p[15].referrer, 'https://lms.example/launch?user=‹6 characters›', 'redact: a referrer’s query')
  assert.equal(T.cmi['1.2']['cmi.core.lesson_status'], 'incomplete', 'redact: cmi vocabulary kept')
  assert.equal(T.cmi['1.2']['cmi.suspend_data'], `‹${'xyz is secret text'.length} characters›`, 'redact: cmi suspend data as its length')
  assert.equal(red.label, 'pkg.zip · item 1 · SCORM 1.2 · Custom LMS', 'redact: the label is rebuilt from fields; a title with the separator in it is gone')
  assert.equal(T.console[0].level, 'log', 'redact: console keeps its level')
  assert.equal(T.console[0].at[0].url, 'lab://run/pkg/js/lesson.js', 'redact: a package path is kept')
  assert.equal(T.requests[0].url, `https://example.com/api/x?token=‹6 characters›&lang=‹2 characters›`, 'redact: query values replaced, path kept, fragment dropped')
  assert.equal(T.requests[1].url, 'lab://run/pkg/img/a.png?v=‹1 characters›;‹10 characters›&‹1 characters›', 'redact: a ;-separated query, and parts without =')
  assert.ok(!('postData' in T.requests[0]), 'redact: request bodies removed')
  assert.equal(T.log[0].text, 'Failed to load resource: ‹50 characters›', 'redact: a browser message keeps up to its first colon; the rest goes unless it is a known shape')
  assert.equal(T.log[1].text, '‹23 characters›', 'redact: log text from the page’s own scripts goes')
  assert.equal(T.exceptions[0].text, 'Uncaught TypeError: Cannot read properties of null (reading ‹10 characters›)', 'redact: a known message shape is kept whole, its quoted part masked')
  assert.ok(T.exceptions[1].text.startsWith('Uncaught Error: ‹') && !/ZQ|zebra/.test(T.exceptions[1].text), 'redact: curly and apostrophe-holding quotes, and unquoted text after the colon, go: ' + T.exceptions[1].text)
  assert.equal(T.exceptions[2].text, 'Refused to load the script because ‹' + 'it violates the following Content Security Policy directive zebra-src'.length + ' characters›', 'redact: a Refused message keeps its words up to because')
  assert.equal(T.exceptions[3].text, 'Uncaught ReferenceError: lessonData is not defined', 'redact: x is not defined stays')
  assert.equal(redactRun({ trace: mkTrace({ exceptions: [{ t: 1, text: "bad 'it's ZQ' here", at: [] }], log: [{ t: 1, source: 'security', level: 'error', text: 'a b' }] }), kind: 'reference' }).trace.exceptions[0].text, '‹23 characters›', 'redact: an apostrophe inside a quoted string does not end it (the message has no colon, so it goes whole)')
  assert.equal(redactRun({ trace: mkTrace({ requests: [{ t: 1, url: 'https://api.example.com/users/12345678/v2/3f2504e0-4f89-11d3-9a0c-0305e82c3301/QmFzZTY0SWRlbnRpZmllcjEy.json', method: 'GET' }] }), kind: 'reference' }).trace.requests[0].url,
    'https://api.example.com/users/‹8 characters›/v2/‹36 characters›/‹24 characters›.json', 'redact: id-like path parts of another site’s address go; host and the rest stay')
  assert.equal(p[8].value, `‹${'Sam Learner'.length} characters›`, 'redact: pin values')
  assert.equal(p[9].url, 'https://example.com/api/x?token=‹6 characters›', 'redact: a shape read’s URL')
  assert.equal(red.launch.options.files['js/lesson.js'].content, `‹${'var secret = "Wrong answer text"'.length} characters›`, 'redact: changed file contents')
  assert.equal(red.launch.options.macro[0].text, `‹${'my typed password'.length} characters›`, 'redact: typed text')
  assert.equal(red.launch.options.macro[2].text, `‹${'Course heading words'.length} characters›`, 'redact: a wait step’s text')
  assert.equal(red.trace.probe.find(x => x.type === 'macro-wait').for.text, `‹${'Course heading words'.length} characters›`, 'redact: the text a macro waited for')
  assert.ok(!JSON.stringify(red).includes('Course heading words'), 'redact: no wait text anywhere')
  assert.equal(red.launch.options.launchParams, 'user=‹6 characters›&sid=‹2 characters›;‹4 characters›', 'redact: launch parameters')
  assert.equal(red.launch.url, 'lab://run/pkg/lesson.html?learner=‹6 characters›&token=‹6 characters›', 'redact: the launch URL’s query')
  for (const pr of [red.launch.profile, red.launch.options.profile]) assert.deepEqual([pr.headers, pr.csp, pr.launchParams, pr.name], [{ 'X-Token': '‹16 characters›' }, '‹45 characters›', 'user=‹6 characters›&sid=‹2 characters›;‹4 characters›', 'Custom LMS'], 'redact: a custom profile’s headers, policy and parameters')
  const ans = red.launch.options.responses[0]
  assert.deepEqual([ans.match, ans.body, ans.headers], ['https://example.com/api/*?key=‹8 characters›', '‹22 characters›', { 'Set-Cookie': '‹21 characters›' }], 'redact: a response’s match query, body and headers')
  assert.equal(red.launch.item, undefined, 'redact: the item’s title is gone')
  assert.deepEqual(T.sources, {}, 'redact: script sources removed')
  assert.equal(red.file, undefined, 'redact: the file the run was saved to is not in the copy')
  assert.deepEqual(red.boot.nodes.slice(1, 4).map(n => [n.path, n.target, n.ref]), [['Course Folder/part two.html', 'Course%20Folder/part%20two.html?who=‹6 characters›', 'part%20two.html?who=‹6 characters›'], [undefined, '‹local path›', undefined], [undefined, '‹local path›', undefined]], 'redact: boot paths keep folders and lose queries; local paths go')
  assert.equal(red.boot.pages[0].execOrder[0].name, 'js/lesson.js?v=‹7 characters›', 'redact: a script reference’s query')
  assert.equal(red.boot.risks[0].evidence[0], `js/lesson.js:7  ‹${'top.location = "https://secret-host.example/start" // passPhrase'.length} characters›`, 'redact: a code snippet in a file finding keeps only its place')
  assert.ok(red.boot.risks[0].evidence[1].includes('‹16 characters›') && !red.boot.risks[0].evidence[1].includes('quoted json'), 'redact: quotes in a file finding go')
  assert.equal(red.boot.dynamic[0].text.startsWith('‹'), true, 'redact: dynamic path code goes')
  // The findings are rebuilt from the redacted run: the saved one (with its quotes of the page) is not carried over.
  assert.ok(red.findings.length && !red.findings.some(f => /Welcome|Sam Learner/.test(JSON.stringify(f))), 'redact: findings come from the redacted data')
  assert.ok(red.findings.some(f => /uncaught error/.test(f.title)) && red.findings.some(f => /Scripts navigate the window above them/.test(f.title)), 'redact: the diagnosis (uncaught errors, file findings) is still there')
  assert.ok(Array.isArray(red.milestones) && JSON.stringify(red.milestones).indexOf('Sam') < 0, 'redact: milestones are worked out again')
  assert.ok(text.includes('cmi.core.lesson_status') && text.includes('cmi.core.lesson_location'), 'redact: a value like “core” does not break element names')
  assert.ok(red.redaction.counts.values >= 4 && red.redaction.counts.bodies >= 2 && red.redaction.counts.queries >= 8 && red.redaction.counts.paths >= 2 && red.redaction.counts.quotes >= 2 && !red.redaction.names, 'redact: counts of what was taken out')
  assert.equal(hand.trace.console[0].text, 'hello from the course', 'redact: the input is not changed')

  // Execution trace: operand previews (and the code text) are the content's; the stall finding is built from the redacted trace.
  const stallRun = {
    kind: 'package', label: 'p.zip · T · SCORM 1.2', package: 'p.zip', launch: { version: '1.2', expose: '1.2', depth: 0, itemIndex: 0, itemType: 'sco', storage: 'normal', options: {}, profile: { name: 'generic', frames: { depth: 0, sandbox: null }, limits: {} } },
    boot: null, trace: mkTrace({ duration: 19200,
      probe: [{ type: 'timers', t: 19000, sid: 'a', frame: L + 'lesson.html', sites: [`poll (${L}js/lesson.js:5:3)`], list: [['interval', 500, 1, 30, 0, 100]], raf: 0 }],
      sites: [{ file: 'js/lesson.js', line: 5, col: 3, kind: 'if', text: "answer === 'secret answer text'", args: ["answer", "'secret answer text'"] }, { file: 'js/lesson.js', line: 2, col: 1, kind: 'function', text: 'poll' }],
      exec: [{ t: 0, sid: 'a', frame: L + 'js/lesson.js', events: [...Array(30)].map((_, i) => [i * 500, 3, 0, 0, ['string', 'secret answer text here', 23], ['number', 5]]).concat([[1, 1, 1]]) }] }) }
  assert.ok(JSON.stringify(runAnalysis({ kind: 'package', launch: stallRun.launch, trace: stallRun.trace, boot: null, analysis: null })).includes('secret answer text'), 'redact: (the unredacted run does show the preview in its stall finding)')
  const rs = redactRun(stallRun), rsText = JSON.stringify(rs)
  assert.ok(!rsText.includes('secret answer') && rs.findings.some(f => /waiting for/.test(f.title)), 'redact: operand previews and decision code are gone, and the stall finding is still made')
  assert.deepEqual(rs.trace.exec[0].events[0].slice(4), [['string', '‹23 characters›'], ['number', 5]], 'redact: a string preview is its length; a number stays')
  assert.deepEqual(rs.trace.sites[0].args, ['‹6 characters›', '‹20 characters›'], 'redact: each decision operand is a marker')
  assert.equal(rs.trace.sites[1].text, 'poll', 'redact: function names kept')

  // Names (--redact-names): stable for one key, different for another; folders, percent-encoded names and every path hashed.
  const k1 = Buffer.alloc(32, 1), m1 = new Map(), a = redactRun(hand, { names: true, key: k1, map: m1, paths: ['Course Folder/part two.html', 'lesson.html', 'js/lesson.js', 'Other Dir/unused.mp3'] }), b2 = redactRun(hand, { names: true, key: k1 })
  assert.equal(JSON.stringify(a.trace), JSON.stringify(b2.trace), 'redact names: the same key gives the same output')
  assert.notEqual(JSON.stringify(a), JSON.stringify(redactRun(hand, { names: true, key: Buffer.alloc(32, 2) })), 'redact names: another key gives other hashes')
  assert.match(a.trace.console[0].at[0].url, /^lab:\/\/run\/pkg\/f[0-9a-f]{10}\/f[0-9a-f]{10}\.js$/, 'redact names: folder and file name hashed; the extension stays')
  assert.equal(a.trace.console[0].at[0].url, `lab://run/pkg/${m1.get('js/')}/${m1.get('lesson.js')}`, 'redact names: the table has both hashes')
  const nt = JSON.stringify(a)
  for (const n of ['lesson.js', 'lesson.html', 'pkg.zip', 'Course Folder', 'Course%20Folder', 'part two', 'part%20two', 'big.js', 'a.png', 'img/', '/js/']) assert.ok(!nt.includes(n), 'redact names: no file or folder name left in the copy: ' + n)
  assert.equal(a.boot.nodes[1].path, `${m1.get('Course Folder/')}/${m1.get('part two.html')}`, 'redact names: a path with spaces is hashed by its decoded names')
  assert.ok(a.boot.nodes[1].target.startsWith(`${m1.get('Course Folder/')}/${m1.get('part two.html')}?who=`), 'redact names: the encoded form of the same path gets the same hash')
  assert.equal(a.package, m1.get('pkg.zip'), 'redact names: the package name')
  assert.ok(a.label.startsWith(m1.get('pkg.zip') + ' · item 1'), 'redact names: the label uses the hash')
  assert.ok(m1.has('Other Dir/') && m1.has('unused.mp3'), 'redact names: a file list given by the caller is in the table')
  assert.ok(a.findings.some(f => JSON.stringify(f).includes(m1.get('lesson.js'))), 'redact names: the findings use the hashes too')
  assert.throws(() => redactRun(hand, { names: true }), /key/, 'redact names: needs a key')

  // A report of files only: the static findings are worked out again from the analysis with its code snippets taken out.
  const analysis = { files: 3, size: 1000, root: '', apiUse: '1.2', tool: null, packs: [], fingerprints: [], problems: [{ code: 'launch-missing', text: "Resource r1 launches Lesson One.html, which isn't in the package." }],
    manifest: { version: '2004', edition: '4th', schemaversion: '2004 4th Edition', title: 'Course title', resources: [{ id: 'r1', type: 'sco', href: 'Lesson One.html?u=jsmith', base: '', path: 'Lesson One.html', query: '?u=jsmith', files: ['Lesson One.html'], deps: [] }],
      items: [{ id: 'ITEM-secret', title: 'Lesson title', depth: 0, resource: 'r1', type: 'sco', params: '?p=jsmith', launchData: 'launch secret', mastery: '80' }] },
    scan: { 'js/lesson.js': { api12: [{ line: 3, match: 'LMSInitialize', text: 'var passPhrase = LMSInitialize("")' }], api04: [], search: [], requests: [], absolute: [], serverPaths: [], hostChecks: [], modeSwitches: [], apiDefine: [] } },
    packFindings: [{ sev: 'info', title: 'Pack: x', detail: 'saw "secret detail"', evidence: ['js/lesson.js:3  var passPhrase = 1'], fix: '' }] }
  const sr = redactRun({ analysis, boot: hand.boot, findings: [{ sev: 'error', title: 'old finding Lesson title', evidence: [] }] }, { package: 'pkg.zip' })
  const st = JSON.stringify(sr)
  for (const f of ['passPhrase', 'Lesson title', 'Course title', 'jsmith', 'launch secret', 'ITEM-secret', 'secret detail', 'old finding']) assert.ok(!st.includes(f), 'redact static: ' + f)
  assert.ok(sr.findings.some(f => /manifest says SCORM 2004/.test(f.title) && /js\/lesson\.js:3  ‹\d+ characters›/.test(f.evidence[0])), 'redact static: the finding keeps file and line, not the code')
  assert.equal(sr.analysis.manifest.items[0].id, 'item 1', 'redact static: item ids are numbers')

  // The report: a banner that says what was taken out, no content, no excerpts; the title is the redacted label.
  const page = renderReport({ title: 'Package Lab: pkg.zip', subtitle: hand.label, run: hand, redact: true })
  assert.ok(page.includes('Redacted report.') && page.includes('Taken out:') && page.includes('query values') && !page.includes('class="sl-excerpt"') && !page.includes('nothing in this run needed it'), 'redact report: banner, no excerpts')
  assert.ok(page.includes('<title>Package Lab: pkg.zip</title>') && page.includes('up to its first colon') && page.includes('keep their host and path'), 'redact report: the title, and what is kept')
  for (const f of forbidden) assert.ok(!page.includes(f), 'redact report: nothing of the content in the page: ' + f)
  assert.ok(!renderReport({ title: 'x', run: hand }).includes('Redacted report.'), 'redact report: a plain report has no banner')
  const stat = renderReport({ title: 'Package Lab: pkg.zip', subtitle: 'Lesson title (lesson.html), from the files only', findings: [], fragment: true, analysis, boot: hand.boot, redact: { package: 'pkg.zip' } })
  assert.ok(!stat.includes('Lesson title') && !stat.includes('passPhrase') && stat.includes('Redacted report.'), 'redact report: a package report’s titles and code go')
}
console.log('redact: unit ok')

// P5.2: the command table, the zsh completion script, and the experiment's HTML report (escaped).
{
  const names = COMMANDS.map(c => c.name), z = zshCompletion()
  assert.equal(new Set(names).size, names.length, 'completion: command names are unique')
  assert.deepEqual(COMMANDS.filter(c => !c.flags.includes('json')).map(c => c.name), [], 'json: every command has --json (serve: with --url)')
  assert.ok(z.startsWith('#compdef package-lab\n') && z.includes('_files -g "*.zip"') && z.includes('compdef _package_lab package-lab'), 'completion: header, package files, compdef')
  for (const c of COMMANDS) {
    assert.ok(z.includes(`    '${c.name}:`) && z.includes(`\n    ${c.name})\n`), `completion: ${c.name} is listed and has a case`)
    for (const f of c.flags) assert.ok(z.includes(`'--${f}[`), `completion: --${f} of ${c.name}`)
  }
  assert.ok(z.includes("'1:package or saved run:_files'") && z.includes("'1:package:_files -g \"*.zip\"'"), 'completion: positional arguments are quoted')
  assert.match(z, /'--preset\[The built-in variants\]:preset:\(api frames standard lms storage browsers\)'/, 'completion: preset choices come from PRESETS')
  const rep = renderReport({ title: 'Package Lab: x.zip', subtitle: 'sub', findings: [], extra: experimentHtml([{ name: '<img src=x onerror=1>', furthestLabel: 'Wrote data', apiCalls: 3, errors: 0, verdict: { sev: 'ok', title: 'ok' }, progress: 'the default' }]) })
  assert.ok(rep.includes('<h2>Variants</h2>') && rep.includes('&lt;img src=x onerror=1&gt;') && !rep.includes('<img src=x'), 'experiment report: the variants table, escaped')
  assert.ok(rep.indexOf('<h2>Variants</h2>') < rep.indexOf('<h2>Findings</h2>') && rep.includes('<td>Wrote data</td>'), 'experiment report: the variants come above the findings')
  assert.ok(!renderReport({ title: 'x', findings: [] }).includes('Variants'), 'experiment report: a plain report has no variants table')
  assert.ok(!renderReport({ title: 'x', findings: [], redact: { package: 'pkg.zip' }, extra: experimentHtml([]) }).includes('Variants'), 'experiment report: a redacted report never shows extra HTML')
}
console.log('completion and experiment report: unit ok')
{
  const d = mkdtempSync(join(tmpdir(), 'pl-settings-'))
  assert.deepEqual(readSettings(join(d, 'none')), { port: DEFAULT_PORT, theme: 'system' }, 'settings: defaults with no file')
  writeFileSync(join(d, 'settings.json'), '{nope'); assert.equal(readSettings(d).port, 4880, 'settings: corrupt JSON falls back')
  writeFileSync(join(d, 'settings.json'), '{"port":80}'); assert.equal(readSettings(d).port, 4880, 'settings: an invalid saved port falls back')
  for (const bad of [80, 70000, 'abc', 4880.5]) { assert.ok(!validPort(bad)); assert.throws(() => writeSettings(d, { port: bad }), /1024 to 65535/, 'settings: rejects ' + bad) }
  assert.deepEqual(writeSettings(join(d, 'sub'), { port: 5123 }), { port: 5123, theme: 'system' }); assert.deepEqual(readSettings(join(d, 'sub')), { port: 5123, theme: 'system' }, 'settings: round trip')
  // The appearance (E3.4): system, light or dark; anything else reads as system and is refused on write.
  writeFileSync(join(d, 'settings.json'), '{"theme":"dark"}'); assert.equal(readSettings(d).theme, 'dark', 'settings: a saved theme is read')
  writeFileSync(join(d, 'settings.json'), '{"theme":"blue"}'); assert.equal(readSettings(d).theme, 'system', 'settings: an invalid saved theme falls back')
  assert.ok(validTheme('light') && !validTheme('blue'), 'settings: validTheme')
  const media = dark => new Recorder({ debugger: {} }, { dark }).media().features   // E3.4: what a run window is told about the colour scheme
  assert.deepEqual(media(true), [{ name: 'prefers-color-scheme', value: 'dark' }], 'recorder: dark is pinned'); assert.equal(media(false)[0].value, 'light', 'recorder: light is pinned'); assert.deepEqual(media(undefined), [], 'recorder: system leaves it alone')
  assert.throws(() => writeSettings(d, { theme: 'blue' }), /system, light or dark/, 'settings: rejects a theme that is not one of the three')
  assert.equal(writeSettings(join(d, 'sub'), { theme: 'light' }).port, 5123, 'settings: a theme change keeps the port')
  rmSync(d, { recursive: true })
}
console.log('settings: unit ok')
{
  const h = markdown('# Exporting a corrected package\n\n## From the manifest\n\n## From the manifest\n')
  assert.ok(h.includes('<h2 id="from-the-manifest">') && h.includes('<h2 id="from-the-manifest-1">') && h.includes('id="exporting-a-corrected-package"'), 'markdown: heading ids, duplicates numbered')
  const t = markdown('| A | B |\n|---|---|\n| x \\| y | **z** |')
  assert.ok(t.includes('<thead><tr><th>A</th><th>B</th></tr></thead>') && t.includes('<td>x | y</td><td><strong>z</strong></td>'), 'markdown: table, escaped pipe, inline in cells')
  const l = markdown('- a\n  - b\n- c\n\n1. one\n2. two')
  assert.equal(l, '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>\n<ol><li>one</li><li>two</li></ol>\n', 'markdown: nested and numbered lists')
  const c = markdown('- step\n  ```js\n  <script>x()</script>\n  ```')
  assert.ok(c.includes('<pre><code class="language-js">&lt;script&gt;x()&lt;/script&gt;</code></pre>') && !c.includes('<script>'), 'markdown: fenced code escaped, even inside a list item')
  const k = markdown('[bad](javascript:alert(1)) [ok](help.md#x) [web](https://a.test/?a=1&b=2)')
  assert.ok(!k.includes('javascript:') && k.includes('<a href="help.md#x">ok</a>') && k.includes('href="https://a.test/?a=1&amp;b=2"'), 'markdown: unsafe link dropped, safe kept')
  assert.equal(markdown('a **b** *c* `<d>`\nnext'), '<p>a <strong>b</strong> <em>c</em> <code>&lt;d&gt;</code> next</p>\n', 'markdown: inline formatting, wrapped lines join')
}
  assert.ok(markdown('## settings', 'doc-').includes('id="doc-settings"'), 'markdown: heading ids take the prefix')
{   // E3.3: an image is drawn from a relative path or a PNG data: URI, with its alt text escaped; any other source is only the alt text.
  assert.equal(markdown('![A "q" <b>](images/x.png)'), '<p><img alt="A &quot;q&quot; &lt;b&gt;" src="images/x.png"></p>\n', 'markdown: an image with escaped alt text')
  assert.ok(markdown('![x](data:image/png;base64,QUJD)').includes('<img alt="x" src="data:image/png;base64,QUJD">'), 'markdown: a PNG data URI is drawn')
  const js = markdown('![x](javascript:alert(1))')
  assert.ok(!js.includes('javascript') && !js.includes('<img'), 'markdown: a javascript: source is not used')
  assert.ok(!markdown('![x](//evil.test/a.png)').includes('<img'), 'markdown: a protocol-relative source is not used')
}
console.log('markdown: unit ok')
{   // The docs' links (E3.1): every relative link in a doc in DOCS names a file that exists, and every #anchor is a heading there, slugged as the panel slugs them. The guide pages and the index link only to docs the panel can open. Code blocks are not read for links.
  const docsDir = fileURLToPath(new URL('../docs/', import.meta.url))
  const names = new Set([...DOCS, ...GUIDE].map(d => d.name))
  const anchorsOf = file => {
    const seen = {}, out = new Set()
    let fence = false
    for (const l of readFileSync(file, 'utf8').split('\n')) {
      if (/^\s*```/.test(l)) fence = !fence
      else if (!fence && /^#{1,6}\s/.test(l)) out.add(slugOf(l.replace(/^#{1,6}\s+(.*?)\s*#*$/, '$1'), seen))
    }
    return out
  }
  const broken = []
  // Help pages and the User Guide link only to docs the app can open (the Help panel's, or the guide's: guide.js opens both).
  assert.ok(GUIDE.every(d => d.name.startsWith('user-guide/')) && !DOCS.some(d => d.name.startsWith('user-guide/')), 'docs: the User Guide is apart from the Help panel')
  for (const d of [...DOCS, ...GUIDE]) {
    const file = join(docsDir, d.name), inPanel = d.name.startsWith('help/') || d.name.startsWith('user-guide/') || d.name === 'help.md'
    const text = readFileSync(file, 'utf8').replace(/^\s*```[\s\S]*?^\s*```/gm, '')
    for (const [, , href] of text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue   // web addresses and mailto: are not checked here
      const [path, anchor = ''] = href.split('#')
      const target = path ? join(dirname(file), path) : file
      if (!existsSync(target)) { broken.push(`${d.name}: ${href} (no such file)`); continue }
      if (anchor && target.endsWith('.md') && !anchorsOf(target).has(anchor)) broken.push(`${d.name}: ${href} (no such heading)`)
      const name = relative(docsDir, target).split(sep).join('/')
      if (inPanel && target.endsWith('.md') && !names.has(name)) broken.push(`${d.name}: ${href} (not a doc in the panel)`)
    }
  }
  assert.deepEqual(broken, [], 'docs: every link in DOCS and GUIDE points to a file and a heading that exist, and help and the guide link only to docs the app opens')
  // E3.3: the images the guide shows are PNGs in docs/images, each at most 400 KB and 2 MB in all. The link check above covers their paths.
  const imgs = readdirSync(join(docsDir, 'images')), sizes = imgs.map(f => statSync(join(docsDir, 'images', f)).size)
  assert.ok(imgs.every(f => f.endsWith('.png')) && sizes.every(n => n <= MAX_IMAGE) && sizes.reduce((a, b) => a + b, 0) < 2 * 1024 * 1024, 'docs images: PNGs, each at most 400 KB, under 2 MB in all')
  console.log('docs links: unit ok')
  // E3.2: every data-help target resolves to a doc and heading. The targets are the data-help="…" values in index.html, and in app.js the first argument after the name in infoBtn(…, '…') and the values in GROUP_HELP, which are the only places it writes them.
  const ui = f => readFileSync(new URL('../src/ui/' + f, import.meta.url), 'utf8')
  const helpTargets = [...ui('index.html').matchAll(/data-help="([^"]+)"/g)].map(m => m[1])
  const js = ui('app.js')
  helpTargets.push(...[...js.matchAll(/infoBtn\([^,]+,\s*'([^']+)'/g)].map(m => m[1]), ...[...js.match(/const GROUP_HELP = \{([^}]*)\}/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]).filter(v => v.includes('#')))
  assert.ok(helpTargets.length >= 10, 'data-help: the targets are found')
  const bad = helpTargets.filter(t => { const [n, a] = t.split('#'); return !names.has(n) || !a || !anchorsOf(join(docsDir, n)).has(a) })
  assert.deepEqual(bad, [], 'data-help: every target is a doc and heading that exist')
}
{   // E3.2: headings and searchDocs
  const md = '# T\n\n## A\n\n```\n## not a heading\n```\n\n### B `x`\n\n## A\n'
  const hs = headings(md)
  assert.deepEqual(hs.map(x => [x.level, x.text, x.id]), [[1, 'T', 't'], [2, 'A', 'a'], [3, 'B x', 'b-x'], [2, 'A', 'a-1']], 'headings: levels, text, duplicate ids')
  assert.deepEqual([...markdown(md, 'p-').matchAll(/id="p-([^"]+)"/g)].map(m => m[1]), hs.map(x => x.id), 'headings: ids match the renderer')
  const docs = [{ name: 'a.md', title: 'Alpha', text: '# Alpha\n\n## Setup\n\nUse the Frobnicator <b>now</b>.\n\n```\nfrobnicator(1)\n```\n' }]
  const r = searchDocs(docs, 'FROBNICATOR')
  assert.equal(r.length, 2, 'searchDocs: a match in prose and one in a code block')
  assert.deepEqual([r[0].title, r[0].heading, r[0].id], ['Alpha', 'Setup', 'setup'], 'searchDocs: title and nearest heading')
  assert.equal(r[0].html, 'Use the <mark>Frobnicator</mark> &lt;b&gt;now&lt;/b&gt;.', 'searchDocs: the match is marked and the text escaped')
  assert.equal(searchDocs(docs, '<b>')[0].html, 'Use the Frobnicator <mark>&lt;b&gt;</mark>now&lt;/b&gt;.', 'searchDocs: a query with HTML is escaped too')
  assert.deepEqual(searchDocs(docs, 'zzz'), [], 'searchDocs: no match')
  assert.equal(searchDocs([{ name: 'b.md', title: 'B', text: 'x\n'.repeat(50) }], 'x').length, 20, 'searchDocs: capped at 20')
  console.log('docs search: unit ok')
}
{   // E3.3: inlineImages puts a doc's PNGs in as data: URIs (up to 400 KB, PNG signature, under docs/); anything else becomes its alt text. searchDocs skips the data.
  const png = n => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(n - 4)])
  const files = { 'images/a.png': png(10), 'images/edge.png': png(MAX_IMAGE), 'images/big.png': png(MAX_IMAGE + 1), 'images/b.jpg': Buffer.from([0xff, 0xd8, 0xff]), 'images/fake.png': Buffer.from('not a png') }
  const read = p => files[p] ?? null, data = b => `data:image/png;base64,${b.toString('base64')}`
  const md = '![A](../images/a.png) ![Edge](../images/edge.png) ![Big](../images/big.png) ![Jpg](../images/b.jpg) ![Fake](../images/fake.png) ![Missing](../images/none.png) ![Web](https://x.test/a.png) ![Up](../../a.png) ![Abs](/etc/a.png)'
  assert.equal(inlineImages(md, 'help/page.md', read), `![A](${data(files['images/a.png'])}) ![Edge](${data(files['images/edge.png'])}) Big Jpg Fake Missing Web Up Abs`, 'inlineImages: PNGs up to 400 KB inline, everything else is its alt text')
  assert.equal(inlineImages('![A](images/a.png)', 'README.md', read), `![A](${data(files['images/a.png'])})`, 'inlineImages: a doc at the top of docs/')
  assert.equal(inlineImages('no images, [a link](x.md)', 'README.md', read), 'no images, [a link](x.md)', 'inlineImages: text without images is unchanged')
  assert.equal(inlineImages('![W](..\\images\\a.png) ![P](//evil.test/a.png)', 'help/page.md', read), 'W P', 'inlineImages: a backslash path or a protocol-relative address is alt text')
  assert.deepEqual(searchDocs([{ name: 'a.md', title: 'A', text: '![Pic](' + data(files['images/a.png']) + ')' }], 'QUJD'), [], 'searchDocs: an inlined image is not searched')
  assert.equal(searchDocs([{ name: 'a.md', title: 'A', text: '![Pic](' + data(files['images/a.png']) + ')' }], 'pic')[0].html, '![<mark>Pic</mark>]()', 'searchDocs: the alt text is searched')
}
{   // E6.1: where things live on each platform, shortcut text and the portability lint
  const home = '/Users/a', winHome = 'C:\\Users\\a'
  assert.equal(dataDir('darwin', {}, home), '/Users/a/Library/Application Support/Package Lab', 'dataDir: darwin')
  assert.equal(dataDir('win32', { APPDATA: 'D:\\Roam' }, winHome), 'D:\\Roam\\Package Lab', 'dataDir: win32 with APPDATA')
  assert.equal(dataDir('win32', {}, winHome), 'C:\\Users\\a\\AppData\\Roaming\\Package Lab', 'dataDir: win32 without APPDATA')
  assert.equal(dataDir('linux', { XDG_CONFIG_HOME: '/x/cfg' }, home), '/x/cfg/Package Lab', 'dataDir: linux with XDG_CONFIG_HOME')
  assert.equal(dataDir('linux', {}, home), '/Users/a/.config/Package Lab', 'dataDir: linux without XDG_CONFIG_HOME')
  assert.deepEqual(appBinaries('darwin', {}, home, '/r'), ['/Applications/Package Lab.app', '/Users/a/Applications/Package Lab.app'], 'appBinaries: darwin is the two .app paths bin/package-lab.js used to look in')
  assert.equal(executable('darwin', '/Applications/Package Lab.app'), '/Applications/Package Lab.app/Contents/MacOS/Package Lab', 'executable: the Mac bundle’s program')
  assert.equal(executable('darwin', '/x/Package Lab'), '/x/Package Lab', 'executable: a program stays as it is')
  assert.deepEqual(appBinaries('win32', { LOCALAPPDATA: 'D:\\Local' }, winHome, 'C:\\lab', 'arm64'), ['D:\\Local\\Programs\\Package Lab\\Package Lab.exe', 'C:\\lab\\dist\\Package Lab-win32-arm64\\Package Lab.exe'], 'appBinaries: win32')
  assert.equal(appBinaries('win32', {}, winHome, 'C:\\lab')[0], 'C:\\Users\\a\\AppData\\Local\\Programs\\Package Lab\\Package Lab.exe', 'appBinaries: win32 without LOCALAPPDATA')
  assert.deepEqual(appBinaries('linux', {}, home, '/r', 'x64'), ['/r/dist/Package Lab-linux-x64/Package Lab'], 'appBinaries: linux')
  assert.equal(appBinaries('darwin', { PACKAGE_LAB_APP: '/p/Package Lab.app/' }, home, '/r')[0], '/p/Package Lab.app', 'appBinaries: a trailing slash is dropped')
  assert.equal(executable('darwin', appBinaries('darwin', { PACKAGE_LAB_APP: '/p/Package Lab.app/' }, home, '/r')[0]), '/p/Package Lab.app/Contents/MacOS/Package Lab', 'executable: so a bundle given with a slash still works')
  assert.equal(appBinaries('win32', { PACKAGE_LAB_APP: 'D:\\P\\Package Lab.exe\\' }, winHome, 'C:\\lab')[0], 'D:\\P\\Package Lab.exe', 'appBinaries: or a backslash')
  assert.equal(installHint('darwin'), 'npm run install-app puts it in /Applications.', 'installHint: darwin is the old text')
  for (const pl of ['darwin', 'win32', 'linux']) assert.equal(appBinaries(pl, { PACKAGE_LAB_APP: '/portable/Package Lab' }, home, '/r')[0], '/portable/Package Lab', `appBinaries: PACKAGE_LAB_APP wins on ${pl}`)
  assert.deepEqual([openCommand('darwin', '/t/r.html'), openCommand('win32', 'C:\\t\\r.html'), openCommand('linux', '/t/r.html')], [['open', ['/t/r.html']], ['explorer.exe', ['C:\\t\\r.html']], ['xdg-open', ['/t/r.html']]], 'openCommand: one per platform')
  assert.equal(keysFor(true, '⌥⌘I and ⌘R'), '⌥⌘I and ⌘R', 'keys: unchanged on a Mac')
  assert.equal(keysFor(false, '⌘R'), 'Ctrl+R', 'keys: ⌘ is Ctrl')
  assert.equal(keysFor(false, '⌥⌘I, ⇧⌘R and ⇧⌥⌘I.'), 'Ctrl+Alt+I, Ctrl+Shift+R and Ctrl+Alt+Shift+I.', 'keys: Option is Alt, in the order Ctrl, Alt, Shift')
  assert.equal(keysFor(false, '⌘1 to ⌘5, ⌘, and ⌘.'), 'Ctrl+1 to Ctrl+5, Ctrl+, and Ctrl+.', 'keys: digits and punctuation')
  assert.equal(keysFor(false, '# ⌘R\n`⌘R` and ⌘R\n```\n⌘R\n```\n⌘R'), '# ⌘R\n`⌘R` and Ctrl+R\n```\n⌘R\n```\nCtrl+R', 'keys: headings, inline code and fenced code are left alone')
  assert.equal(keysFor(false, '**⇧↩** and ⌘ alone and ⌘Cmd'), '**⇧↩** and ⌘ alone and ⌘Cmd', 'keys: only a modifier followed by a key is changed')
  // E6.2: the portable data folder is picked by a pure function; PACKAGE_LAB_DATA wins everywhere; only Windows uses the folder.
  assert.equal(PORTABLE_DIR, 'Package Lab Data')
  assert.equal(dataOverride('win32', {}, 'E:\\Lab', true), 'E:\\Lab\\Package Lab Data', 'dataOverride: win32 with the folder')
  assert.equal(dataOverride('win32', {}, 'E:\\Lab', false), null, 'dataOverride: win32 without it')
  for (const [pl, dir] of [['darwin', '/x/Contents/MacOS'], ['linux', '/x'], ['win32', 'E:\\Lab']]) {
    assert.equal(dataOverride(pl, { PACKAGE_LAB_DATA: '/d' }, dir, true), '/d', `dataOverride: PACKAGE_LAB_DATA wins on ${pl}`)
    if (pl !== 'win32') assert.equal(dataOverride(pl, {}, dir, true), null, `dataOverride: ${pl} ignores the folder`)
  }
  // E6.2: the ICO writer: a header for 4 images, the right offsets, PNG signatures there.
  {
    const png = n => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n, 7)]), sizes = [16, 32, 48, 256], datas = sizes.map((s, i) => png(10 + i))
    const f = icoWriter(sizes.map((size, i) => ({ size, data: datas[i] })))
    assert.deepEqual([f.readUInt16LE(0), f.readUInt16LE(2), f.readUInt16LE(4)], [0, 1, 4], 'ico: header (reserved, type 1, 4 images)')
    let at = 6 + 16 * 4
    sizes.forEach((size, i) => {
      const e = 6 + 16 * i
      assert.equal(f[e], size === 256 ? 0 : size, `ico: width of image ${i}`); assert.equal(f[e + 1], size === 256 ? 0 : size, `ico: height of image ${i}`)
      assert.equal(f.readUInt32LE(e + 8), datas[i].length, `ico: size of image ${i}`); assert.equal(f.readUInt32LE(e + 12), at, `ico: offset of image ${i}`)
      assert.ok(f.subarray(at, at + 8).equals(datas[i].subarray(0, 8)), `ico: PNG signature at image ${i}`)
      at += datas[i].length
    })
    assert.equal(f.length, at, 'ico: nothing after the last image')
  }
  // The lint: no .pathname on a URL built from import.meta.url, and no Mac paths outside src/platform.js and `// darwin-only` lines.
  const lint = [], top = fileURLToPath(new URL('..', import.meta.url)), P = '(?:[^()]|\\([^()]*\\))*'   // P: text with one level of nested parentheses
  const urlPath = new RegExp(`new URL\\(${P}import\\.meta\\.url${P}\\)\\.pathname`)
  const macPath = /\/Applications\b|Library\/Application Support|\.app\/Contents|'Library'\s*,\s*'Application Support'|['"]Applications['"]/
  for (const dir of ['src', 'bin', 'scripts']) {
    const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'vendor' ? [] : e.isDirectory() ? walk(join(d, e.name)) : /\.(c|m)?js$/.test(e.name) ? [join(d, e.name)] : [])
    for (const f of walk(join(top, dir))) readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      const rel = relative(top, f).split(sep).join('/'), at = `${rel}:${i + 1}`
      if (urlPath.test(l)) lint.push(`${at}: .pathname of a URL from import.meta.url`)
      if (macPath.test(l) && !/\/\/ darwin-only/.test(l) && rel !== 'src/platform.js') lint.push(`${at}: a Mac path outside src/platform.js`)
    })
  }
  assert.ok(urlPath.test("const a = new URL(f('x', 1), import.meta.url).pathname") && macPath.test("join(h, 'Library', 'Application Support')") && macPath.test("join(h, 'Applications')") && macPath.test('see /Applications.'), 'portability lint: the patterns catch what they should')
  assert.deepEqual(lint, [], 'portability lint: ' + lint.join('; '))
  assert.deepEqual(runnerEnv({ Path: 'C:\\W', SystemRoot: 'C:\\Windows', LOCALAPPDATA: 'C:\\L', SECRET: 'x', ELECTRON_RUN_AS_NODE: '0' }), { Path: 'C:\\W', SystemRoot: 'C:\\Windows', LOCALAPPDATA: 'C:\\L', ELECTRON_RUN_AS_NODE: '1' }, 'runnerEnv: what Windows needs, nothing else, as Node')
  console.log('platform: unit ok')
}
console.log('unit: ok')

// ---- End to end ----
const slow = process.argv.includes('--slow')   // the slower end-to-end checks: run at phase ends (see docs/developer-guide.md)
if (!process.argv.includes('--unit')) {
  const root = fileURLToPath(new URL('..', import.meta.url)), cli = join(root, 'bin', 'package-lab.js'), electron = process.env.PACKAGE_LAB_ELECTRON ?? createRequire(import.meta.url)('electron')   // the npm package's main is its binary's path (.bin/electron is a .cmd on Windows)
  const node = (args, opts = {}) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 120000, ...opts })
  const run = (zip, ...args) => { const r = node(['run', zip, '--wait', '3', '--json', ...args]); assert.ok(r.stdout, 'run printed nothing: ' + r.stderr); return JSON.parse(r.stdout) }
  const calls = r => r.api.map(a => a.call + ' ' + a.el)
  const titles = r => r.findings.map(f => f.title + ' ' + (f.evidence ?? []).join(' '))

  // The CLI without Electron: analyze, items, report, exit statuses.
  const an = JSON.parse(node(['analyze', blank, '--json']).stdout)
  assert.equal(an.verdict.sev, 'error'); assert.ok(an.findings.some(f => /capitals/.test(f.title)), 'cli analyze: capitals')
  assert.equal(an.item.number, 1, 'cli analyze: item number')
  // --tool applies a rule pack the package doesn't show (hosted asks the server root, so Xyleme's static rule fires).
  const tl = JSON.parse(node(['analyze', hosted, '--tool', 'xyleme', '--json']).stdout)
  assert.ok(tl.findings.some(f => /^Xyleme: the content expects its platform/.test(f.title) && /chosen by you/.test(f.detail)), 'cli --tool: ' + tl.findings.map(f => f.title))
  assert.ok(!JSON.parse(node(['analyze', hosted, '--json']).stdout).findings.some(f => /^Xyleme:/.test(f.title)), 'cli: no pack without --tool')
  assert.notEqual(node(['analyze', hosted, '--tool', 'nope']).status, 0, 'cli --tool: unknown id fails')
  assert.equal(node(['analyze', blank, '--strict']).status, 1, 'cli --strict fails on errors')
  assert.equal(node(['analyze', good, '--strict']).status, 0, 'cli --strict passes a good package')

  // doctor (P5.1): the checks and the names the Concierge module builds its form from.
  {
    const dr = JSON.parse(node(['doctor', '--json']).stdout)
    assert.deepEqual(dr.checks.map(c => c.id), ['node', 'electron', 'webkit', 'data', 'port'], 'doctor: the checks')
    assert.ok(dr.capabilities.analyze && dr.capabilities.run === dr.checks[1].ok, 'doctor: capabilities follow the checks')
    assert.ok(dr.profiles.includes('moodle') && dr.tools.includes('rise') && dr.viewports.includes('iphone') && dr.presets.includes('storage'), 'doctor: names')
    assert.deepEqual(dr.fixes.map(f => f.id), FIX_IDS, 'doctor: every fix, with a label')
    const nopw = JSON.parse(node(['doctor', '--json'], { env: { ...process.env, PACKAGE_LAB_NO_PLAYWRIGHT: '1' } }).stdout)
    assert.ok(!nopw.checks[2].ok && !nopw.capabilities.webkit && /Install it with/.test(nopw.checks[2].detail), 'doctor: no Playwright means no WebKit')
    const busy = await new Promise(res => { const srv = createServer(); srv.listen(0, '127.0.0.1', () => res(srv)) })
    const bj = JSON.parse(node(['doctor', '--json', '--port', String(busy.address().port)]).stdout)
    busy.close()
    assert.ok(!bj.checks[4].ok && !bj.ok, 'doctor: a port in use is reported')
    const wide = await new Promise(res => { const srv = createServer(); srv.listen(0, '0.0.0.0', () => res(srv)) })
    const wj = JSON.parse(node(['doctor', '--json', '--port', String(wide.address().port)]).stdout)
    wide.close()
    assert.ok(!wj.checks[4].ok, 'doctor: a server bound on every address is reported')
    for (const bad of ['0', '65536', 'abc', '80x', '-1', '']) { const r = node(['doctor', '--port', bad]); assert.equal(r.status, 2, 'doctor: --port ' + bad + ' is refused'); assert.match(r.stderr, /--port needs a whole number from 1 to 65535/) }
    assert.match(node(['doctor']).stdout, /doctor[\s\S]*Node\.js 20 or later/, 'doctor: text')
  }

  {
    // settings: the web interface's port, kept in the data folder; serve --url uses it.
    {
      const data = mkdtempSync(join(tmpdir(), 'pl-settings-cli-')), env = { ...process.env, PACKAGE_LAB_DATA: data }, st = (...a) => node(['settings', ...a], { env })
      assert.equal(st('port').stdout.trim(), '4880', 'settings: the default port')
      assert.equal(st('port', '5123').stdout.trim(), '5123', 'settings: port <n> saves')
      assert.equal(st('port').stdout.trim(), '5123', 'settings: port prints the saved value')
      assert.equal(JSON.parse(st('--json').stdout).port, 5123, 'settings: --json')
      const bad = st('port', '80'); assert.equal(bad.status, 1, 'settings: a bad port exits 1'); assert.match(bad.stderr, /1024 to 65535/); assert.equal(st('port').stdout.trim(), '5123')
      writeFileSync(join(data, 'web-token'), 'a'.repeat(32))
      assert.match(node(['serve', '--url'], { env }).stdout, /:5123\/\?token=/, 'serve --url uses the saved port')
      assert.match(node(['serve', '--url', '--port', '5999'], { env }).stdout, /:5999\//, 'serve --url: --port wins')
      rmSync(data, { recursive: true })
    }
  }
  assert.equal(node(['analyze', join(work, 'nope.zip')]).status, 2, 'cli: missing file is status 2')
  assert.match(node(['items', good]).stdout, /1 {2}Lesson and quiz/)
  assert.match(node(['report', good, '--fragment']).stdout, /class="sl"[\s\S]*Loading path/, 'cli report (static)')
  console.log('cli: ok')

  // package-lab diff (P3.3), without Electron: good against blank.
  const dfRep = join(work, 'diff.html'), df = node(['diff', good, blank, '--json', '--out', dfRep]); assert.equal(df.status, 0, 'cli diff: ' + df.stderr)
  const dj = JSON.parse(df.stdout)
  assert.deepEqual(dj.files.added.map(f => f.path), ['js/App.js'], 'cli diff: the added file'); assert.deepEqual(dj.files.changed.map(f => f.path), ['lesson.html'], 'cli diff: the changed file')
  assert.ok(dj.files.changed[0].diff.includes('-<script src="lesson.js" defer></script>') && dj.files.changed[0].diff.includes('+<!doctype html>'), 'cli diff: the text diff of lesson.html')
  assert.ok(dj.boot.added.some(n => n.path === 'vendor/missing.js' && n.status === 'missing') && dj.boot.removed.some(n => n.path === 'lesson.js'), 'cli diff: boot graph differences: ' + JSON.stringify(dj.boot))
  assert.ok(dj.findings.added.some(f => /capitals/.test(f.title)) && dj.findings.added.some(f => /no content of its own/.test(f.title)) && !dj.findings.gone.length, 'cli diff: new findings')
  assert.equal(dj.behaviour, undefined, 'cli diff: no behaviour without --run')
  const dfHtml = readFileSync(dfRep, 'utf8'); assert.match(dfHtml, /<h2>Package diff<\/h2>[\s\S]*<details><summary><span class="sl-mono">lesson\.html<\/span>[\s\S]*Loading path/, 'cli diff: --out writes the report')
  const dtext = node(['diff', good, blank]).stdout; assert.match(dtext, /\+ js\/App\.js[\s\S]*~ lesson\.html[\s\S]*\+ vendor\/missing\.js[\s\S]*New findings/, 'cli diff: text output')
  assert.match(node(['diff', good, good]).stdout, /Identical\./, 'cli diff: identical packages'); assert.equal(JSON.parse(node(['diff', good, good, '--json']).stdout).findings.added.length, 0)
  { // control characters in names are not printed
    const evilZip = join(work, 'evil.zip'), mf = unzip(readFileSync(good)); mf.set('xQ7Z9K2red.txt', Buffer.from('1'))
    const raw = zip(mf); let at; while ((at = raw.indexOf('Q7Z9K2')) >= 0) { raw.set([0x1b, 0x5b, 0x33, 0x31, 0x6d, 0x07], at) }   // the writer refuses control characters, so patch the name afterwards
    writeFileSync(evilZip, raw)
    const ev = node(['diff', good, evilZip]).stdout; assert.ok(ev.includes('x[31mred.txt') && !/[\x00-\x08\x0b-\x1f\x7f]/.test(ev), 'cli diff: control characters stripped')
  }
  assert.equal(node(['diff', good]).status, 2, 'cli diff: needs two packages'); assert.equal(node(['diff', good, join(work, 'nope.zip')]).status, 2); assert.equal(node(['diff', good, blank, '--item', '9']).status, 2, 'cli diff: unknown item')

  // package-lab fix (P3.1), without Electron: the corrected zip is valid (unzip -t), reads back, and analyze no longer finds what was fixed.
  const fixOut = join(work, 'blank-fixed.zip'), fx = node(['fix', blank, '--out', fixOut, '--json'])
  assert.equal(fx.status, 0, 'cli fix: ' + fx.stderr); const fj = JSON.parse(fx.stdout)
  assert.ok(fj.applied.some(f => f.id === 'case') && fj.proof.gone.some(t => /capitals/.test(t)) && fj.out === fixOut, 'cli fix: --json lists the change and the proof')
  const uz = unzipT(fixOut); assert.equal(uz.status, 0, 'cli fix: unzip -t: ' + uz.stdout + uz.stderr)
  const fixedFiles = unzip(readFileSync(fixOut)); assert.ok(fixedFiles.has('js/app.js') && /^Package Lab \S+: changes made to blank\.zip/.test(fixedFiles.get('PACKAGE-LAB-CHANGES.txt').toString()), 'cli fix: round-trip through the reader')
  const fan = JSON.parse(node(['analyze', fixOut, '--json']).stdout)
  assert.ok(!fan.findings.some(f => /capitals/.test(f.title)), 'cli fix: no capitals finding in the result: ' + fan.findings.map(f => f.title)); assert.ok(fan.findings.some(f => /vendor\/missing\.js/.test(f.evidence?.join(' '))), 'cli fix: what isn’t mechanically fixable (a missing file) is still reported')
  assert.match(node(['fix', mismatch, '--out', join(work, 'mismatch-fixed.zip')]).stdout, /manifest-version[\s\S]*Findings cleared: 1 of 1[\s\S]*Wrote /, 'cli fix: text output')
  assert.ok(!JSON.parse(node(['analyze', join(work, 'mismatch-fixed.zip'), '--json']).stdout).findings.some(f => /but the scripts use/.test(f.title)), 'cli fix: the version finding is gone')
  assert.equal(unzipT(join(work, 'mismatch-fixed.zip')).status, 0)
  const nothing = node(['fix', good, '--out', join(work, 'good-fixed.zip')]); assert.ok(nothing.status === 0 && /Nothing to change/.test(nothing.stdout) && !existsSync(join(work, 'good-fixed.zip')), 'cli fix: nothing to fix writes no file')
  const only = JSON.parse(node(['fix', mismatch, '--only', 'case', '--out', join(work, 'only.zip'), '--json']).stdout); assert.deepEqual(only.applied, [], 'cli fix: --only limits the fixes'); assert.equal(only.out, null)
  assert.equal(node(['fix', good, '--only', 'nope']).status, 2, 'cli fix: unknown id fails'); assert.match(node(['fix', good, '--only', 'nope']).stderr, /No autofix “nope”/); assert.equal(node(['fix', good, '--only']).status, 2, 'cli fix: --only needs a value')
  const ovFile = join(work, 'ov.txt'); writeFileSync(ovFile, 'note')
  const ov = node(['fix', good, '--override', 'notes/ov.txt=' + ovFile, '--out', join(work, 'ov.zip')]); assert.equal(ov.status, 0, ov.stderr); assert.equal(unzip(readFileSync(join(work, 'ov.zip'))).get('notes/ov.txt').toString(), 'note', 'cli fix: --override files go in')
  assert.equal(node(['fix', join(work, 'nope.zip')]).status, 2, 'cli fix: missing file is status 2')

  // P5.2, without Electron. Help and version: JSON, and every command and flag in the help text.
  {
    const hj = JSON.parse(node(['help', '--json']).stdout), helpText = node(['help']).stdout
    assert.deepEqual(hj.commands.map(c => c.name), COMMANDS.map(c => c.name), 'json: help lists every command')
    for (const c of COMMANDS) { assert.match(helpText, new RegExp(`^  ${c.name}\\b`, 'm'), 'help: command ' + c.name); for (const f of c.flags) assert.ok(helpText.includes('--' + f), `help: --${f} of ${c.name}`) }
    assert.match(JSON.parse(node(['version', '--json']).stdout).version, /^\d+\.\d+\.\d+/, 'json: version')
    const cz = node(['completion', 'zsh']); assert.equal(cz.status, 0, cz.stderr); assert.equal(cz.stdout, zshCompletion(), 'completion: the script on standard output')
    assert.equal(JSON.parse(node(['completion', 'zsh', '--json']).stdout).shell, 'zsh', 'json: completion')
    assert.ok(COMMANDS.some(c => c.name === 'macro') && cz.stdout.includes('\n    macro)\n') && cz.stdout.includes("'1:subcommand:(show)'"), 'completion: macro show is listed')
    // E5.1: macro show on a version 1 file (no size) and a version 2 file with a size, a wait and a target.
    const mv1 = join(work, 'show1.json'); writeFileSync(mv1, JSON.stringify([{ t: 400, type: 'click', x: 0.5, y: 0.25 }, { t: 900, type: 'key', key: 'Enter' }]))
    const mv2 = join(work, 'show2.json'); writeFileSync(mv2, JSON.stringify({ format: 'package-lab-macro', version: 2, viewport: { width: 1100, height: 800 }, events: [{ t: 100, type: 'wait', text: 'Next', timeout: 10000 }, { t: 200, type: 'click', x: 0.5, y: 0.25, target: { sel: '#next', text: 'Next' } }] }))
    const mv3 = join(work, 'show3.json'); writeFileSync(mv3, JSON.stringify([{ t: 1, type: 'text', text: 'a\u009bb' }]))
    const s3 = node(['macro', 'show', mv3]); assert.ok(!s3.stdout.includes('\u009b') && s3.stdout.includes('Type “ab”') && /; 1 step$/m.test(s3.stdout), 'macro show: C1 controls are dropped, and one step is singular')
    const s1 = node(['macro', 'show', mv1]); assert.equal(s1.status, 0, s1.stderr)
    assert.match(s1.stdout, /No size recorded[^\n]*2 steps/); assert.match(s1.stdout, /^1 {2,}\+0\.4 s {2,}Click {2,}50%, 25%$/m, 'macro show: version 1 rows are in percentages'); assert.match(s1.stdout, /^2 {2,}\+0\.5 s {2,}Key Enter$/m)
    const s2 = node(['macro', 'show', mv2]); assert.equal(s2.status, 0, s2.stderr)
    assert.match(s2.stdout, /Recorded at 1100x800; 2 steps/); assert.match(s2.stdout, /wait for “Next” \(10 s\)/, 'macro show: the wait'); assert.match(s2.stdout, /550, 200 #next “Next”/, 'macro show: pixels and the target')
    const j2 = JSON.parse(node(['macro', 'show', mv2, '--json']).stdout); assert.deepEqual([j2.viewport, j2.steps.length, j2.steps[0].action, j2.steps[1].where], [{ width: 1100, height: 800 }, 2, 'Wait', '550, 200 #next “Next”'], 'macro show: json')
    assert.equal(JSON.parse(node(['macro', 'show', mv1, '--json']).stdout).viewport, null, 'macro show: version 1 has no viewport')
    assert.equal(node(['macro', 'show', join(work, 'nope.json')]).status, 2, 'macro show: a missing file fails'); assert.match(node(['macro', 'show']).stderr, /Name a macro file/); assert.match(node(['macro']).stderr, /Usage: package-lab macro show/)
    assert.equal(node(['completion', 'bash']).status, 2, 'completion: only zsh'); assert.match(node(['completion']).stderr, /Name the shell/)
    const zfile = join(work, '_package-lab'); writeFileSync(zfile, cz.stdout)
    if (spawnSync('zsh', ['-c', 'true']).status === 0) { const zn = spawnSync('zsh', ['-n', zfile], { encoding: 'utf8' }); assert.equal(zn.status, 0, 'completion: zsh -n accepts it: ' + zn.stderr) }
    else console.log('completion: zsh not installed, syntax check skipped')
    // open: where it went, as JSON. PACKAGE_LAB_ELECTRON names node with no script, so nothing opens.
    assert.deepEqual(JSON.parse(node(['open', '--json'], { env: { ...process.env, PACKAGE_LAB_ELECTRON: process.execPath } }).stdout), { app: 'repo', path: process.execPath, package: null }, 'json: open')
    // report: JSON with the HTML in a file; a redacted report's JSON has no findings or verdict title.
    const rj = JSON.parse(node(['report', good, '--json', '--out', join(work, 'static.html')]).stdout)
    assert.ok(rj.out && rj.verdict && Array.isArray(rj.findings) && rj.counts && existsSync(join(work, 'static.html')), 'json: report')
    const rn = JSON.parse(node(['report', good, '--redact', '--redact-names', '--key-out', join(work, 'names-key.json'), '--json', '--out', join(work, 'static-names.html')]).stdout)
    assert.ok(!('input' in rn) && !('out' in rn) && rn.redacted, 'json: --redact-names leaves out the paths')
    const rr = JSON.parse(node(['report', good, '--redact', '--json', '--out', join(work, 'static-redacted.html')]).stdout)
    assert.ok(rr.redacted && !('findings' in rr) && !('title' in rr.verdict) && rr.verdict.sev === rj.verdict.sev, 'json: a redacted report keeps no findings or titles')
    assert.equal(node(['report', good, '--json']).status, 2, 'json: report needs --out or --open'); assert.match(node(['report', good, '--json']).stderr, /needs --out or --open/)
    const sj = node(['serve', '--json']); assert.equal(sj.status, 2, 'json: serve --json without --url is refused'); assert.match(sj.stderr, /serve --json needs --url/)
    // serve --url: the address with its token, as text or JSON. The token file is in a fake home.
    const fakeHome = mkdtempSync(join(work, 'home-')), env = { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome, APPDATA: undefined }, tokenDir = dataDir(process.platform, {}, fakeHome)
    mkdirSync(tokenDir, { recursive: true }); writeFileSync(join(tokenDir, 'web-token'), 'tok123\n')
    assert.equal(node(['serve', '--url', '--port', '4999'], { env }).stdout.trim(), 'http://127.0.0.1:4999/?token=tok123', 'serve --url')
    assert.deepEqual(JSON.parse(node(['serve', '--url', '--port', '4999', '--json'], { env }).stdout), { url: 'http://127.0.0.1:4999/?token=tok123' }, 'json: serve --url')

    const isMac = process.platform === 'darwin', skipped = []   // E6.1: what needs a Mac is counted and reported in one line below
    // doctor: the installed app is an optional check (last, and not part of ok); its version comes from Info.plist.
    const dj = JSON.parse(node(['doctor', '--json'], { env }).stdout)
    assert.ok(!dj.checks.some(c => c.id === 'app') && 'app' in dj, 'doctor: the app is reported at the top level, not in checks')
    assert.equal(dj.ok, dj.checks.every(c => c.ok), 'doctor: ok is the checks')
    if (isMac) {   // the version comes from Info.plist, read with plutil
      const appDir = join(fakeHome, 'Applications', 'Package Lab.app', 'Contents')
      mkdirSync(appDir, { recursive: true })
      writeFileSync(join(appDir, 'Info.plist'), '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>9.8.7</string></dict></plist>\n')
      const withApp = JSON.parse(node(['doctor', '--json'], { env }).stdout)
      if (!existsSync('/Applications/Package Lab.app')) assert.deepEqual(withApp.app, { path: join(fakeHome, 'Applications', 'Package Lab.app'), version: '9.8.7' }, 'doctor: ~/Applications is found, with its version')
      assert.match(node(['doctor'], { env }).stdout, /Package Lab\.app, the installed desktop app/)
    } else skipped.push('doctor: the installed app’s version (plutil)')
    const emptyEnv = { ...env, HOME: join(fakeHome, 'empty'), USERPROFILE: join(fakeHome, 'empty'), LOCALAPPDATA: undefined, PACKAGE_LAB_APP: undefined }   // Windows looks in these, not HOME
    const noApp = JSON.parse(node(['doctor', '--json'], { env: emptyEnv }).stdout)
    if (!existsSync('/Applications/Package Lab.app')) assert.ok(noApp.app === null, 'doctor: no app is reported as null')
    assert.match(node(['doctor'], { env: emptyEnv }).stdout, /(no|ok) +Package Lab(\.app)?,/, 'doctor: text reports the app (installed or not: it looks in /Applications, not HOME)')
    assert.match(node(['doctor']).stdout, /Ready:|To do:/, 'doctor: text summary with advice')

    // Alfred (P5.2): the build lints, the ⇧↩ action runs the standard experiment, the scripts are valid shell, and Fix never overwrites.
    if (isMac) {
      const alf = spawnSync(process.execPath, [join(root, 'scripts', 'alfred.js'), '--no-open'], { encoding: 'utf8' }); assert.equal(alf.status, 0, 'alfred build: ' + alf.stderr)
      const info = join(root, 'dist', 'alfred', 'info.plist')
      assert.equal(spawnSync('plutil', ['-lint', info], { encoding: 'utf8' }).status, 0, 'alfred: plutil -lint')
      const wf = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', info], { encoding: 'utf8' }))
      const filterUid = wf.objects.find(o => o.type === 'alfred.workflow.input.filefilter' && o.config.keyword === 'scorm').uid
      const shift = wf.connections[filterUid].find(c => c.modifiers === 131072), target = wf.objects.find(o => o.uid === shift?.destinationuid)
      assert.ok(target && /experiment "\$1" --preset standard/.test(target.config.script), 'alfred: shift-return on scorm runs the standard experiment')
      assert.ok(wf.objects.some(o => o.type === 'alfred.workflow.trigger.action' && o.config.name === 'Fix with Package Lab'), 'alfred: the fix action')
      assert.ok(wf.objects.some(o => o.type === 'alfred.workflow.trigger.action' && o.config.filetypes?.includes('public.folder')), 'alfred: the folder batch action')
      for (const [n, body] of Object.entries({ OPEN, CHECK, RUN, EXPERIMENT, FIX, BATCH, WEB })) { const sh = spawnSync('/bin/bash', ['-n', '-c', body], { encoding: 'utf8' }); assert.equal(sh.status, 0, `alfred ${n} is valid shell: ${sh.stderr}`) }
      const fixDir = mkdtempSync(join(work, 'alfred-fix-')), pkgCopy = join(fixDir, 'my course.zip')
      cpSync(blank, pkgCopy)
      const fixRun = file => spawnSync('/bin/bash', ['-c', FIX, 'bash', file], { encoding: 'utf8', env: { PATH: process.env.PATH, node: process.execPath, cli } })
      const symDir = mkdtempSync(join(work, 'alfred-sym-')), symPkg = join(symDir, 'c.zip'), symTarget = join(symDir, 'target.txt')
      cpSync(blank, symPkg); writeFileSync(symTarget, 'keep me'); symlinkSync(symTarget, join(symDir, 'c-fixed.zip'))
      assert.equal(spawnSync('/bin/bash', ['-c', FIX, 'bash', symPkg], { encoding: 'utf8', env: { PATH: process.env.PATH, node: process.execPath, cli } }).stdout.trim(), 'Wrote c-fixed-2.zip', 'alfred fix: a symlink at the name is not followed or replaced')
      assert.equal(readFileSync(symTarget, 'utf8'), 'keep me', 'alfred fix: the symlink target is untouched')
      assert.equal(fixRun(pkgCopy).stdout.trim(), 'Wrote my course-fixed.zip', 'alfred fix: the first copy')
      assert.equal(fixRun(pkgCopy).stdout.trim(), 'Wrote my course-fixed-2.zip', 'alfred fix: never overwrites, -2')
      assert.equal(fixRun(pkgCopy).stdout.trim(), 'Wrote my course-fixed-3.zip', 'alfred fix: -3')
      assert.ok(existsSync(join(fixDir, 'my course-fixed-3.zip')) && readFileSync(join(fixDir, 'my course-fixed.zip')).equals(readFileSync(join(fixDir, 'my course-fixed-2.zip'))), 'alfred fix: the copies are written next to the original')
      const quiet = join(fixDir, 'good.zip'); cpSync(good, quiet)
      assert.equal(fixRun(quiet).stdout.trim(), 'Nothing to fix in good.zip', 'alfred fix: nothing to change writes no file'); assert.ok(!existsSync(join(fixDir, 'good-fixed.zip')))
      assert.deepEqual(readdirSync(fixDir).filter(f => f.startsWith('.package-lab-fix')), [], 'alfred fix: no temporary file is left behind')
    } else skipped.push('Alfred: the workflow build and its shell scripts (plutil, bash)')
    if (skipped.length) console.log(`skipped (needs a Mac): ${skipped.join('; ')}`)
  }

  // Batch checks (P4.3), without Electron: every fixture in one folder, and a file that isn't a ZIP. One row each, with the verdict
  // analyze gives its package; a CSV and an HTML report are written. The static checks run in worker threads (--jobs 3).
  {
    const folder = join(work, 'batch'); mkdirSync(folder)
    const all = { good, mismatch, hosted, blank, order, loader, gated, chromeOnly, noExit, restart, typing, handshake, polling, stored, pinned, lexical, needs, levels }
    for (const [name, zipPath] of Object.entries(all)) cpSync(zipPath, join(folder, name + '.zip'))
    writeFileSync(join(folder, 'broken.zip'), 'not a zip')
    const csvFile = join(work, 'batch.csv'), htmlFile = join(work, 'batch.html')
    const bj = node(['batch', folder, '--jobs', '3', '--json', '--csv', csvFile, '--out', htmlFile])
    assert.equal(bj.status, 0, 'batch: ' + bj.stderr)
    const b = JSON.parse(bj.stdout), names = Object.keys(all), rowFor = f => b.rows.find(r => r.package === f)
    assert.equal(b.rows.length, names.length + 1, 'batch: one row per package')
    const sevOf = zip => {   // the verdict `analyze` gives the package: the same checks as the CLI's, on one thread
      const files = unzip(readFileSync(zip)), a = analyze(files, { tool: null }), item = (a.manifest?.items ?? []).filter(i => i.res)
      const first = item.find(i => i.type === 'sco') ?? item[0], boot = first?.res.path ? bootGraph(files, first.res.path) : null
      return verdict([...staticFindings(a), ...(boot?.risks ?? [])]).sev
    }
    for (const name of names) assert.equal(rowFor(name + '.zip').verdict, sevOf(all[name]), `batch: ${name} has its analyze verdict`)
    assert.equal(rowFor('blank.zip').verdict, 'error', 'batch: blank has the capitals error')
    assert.equal(rowFor('broken.zip').verdict, 'failed'); assert.match(rowFor('broken.zip').note, /^Couldn’t open it: /, 'batch: a bad file is a row with its error')
    assert.equal(b.summary.failed, 1); assert.equal(b.summary.packages, names.length + 1)
    const csv = readFileSync(csvFile, 'utf8').split('\r\n')
    assert.equal(csv[0], 'Package,SCORM version,Tool,Verdict,Errors,Warnings,Note'); assert.equal(csv.length, names.length + 3, 'batch: CSV has a line per package and ends with a line break')
    assert.ok(csv.some(l => l.startsWith('blank.zip,') && l.includes(',Error,')), 'batch: CSV has the blank row')
    const page = readFileSync(htmlFile, 'utf8')
    assert.match(page, /<h1>Package Lab: batch check<\/h1>/); assert.ok(names.every(n => page.includes(`>${n}.zip</a>`)), 'batch: the summary links each package')
    assert.match(page, /<details id="pkg-1"><summary>[^<]*<\/summary><div class="sl">/, 'batch: each package has its report, collapsed')
    const text = node(['batch', folder]); assert.equal(text.status, 0, text.stderr)
    assert.match(text.stdout, new RegExp(`${names.length + 1} packages: `)); assert.match(text.stdout, /broken\.zip\s+Failed/, 'batch: text table')
    const missing = JSON.parse(node(['batch', join(work, 'nope-folder'), '--json']).stdout)
    assert.equal(missing.rows[0].verdict, 'failed', 'batch: a path that is not there is a failed row')
    assert.equal(node(['batch', folder, '--jobs', '0']).status, 2, 'batch: --jobs needs 1 or more')
    if (slow) {   // --run (P4.3): good and blank, two at a time. Each row takes its run's verdict and furthest milestone; the HTML carries the runs.
      const rf = join(work, 'batch-run'); mkdirSync(rf); cpSync(good, join(rf, 'good.zip')); cpSync(blank, join(rf, 'blank.zip'))
      const rr = node(['batch', rf, '--run', '--wait', '3', '--jobs', '2', '--json', '--out', join(work, 'batch-run.html')], { timeout: 300000 })
      assert.equal(rr.status, 0, 'batch --run: ' + rr.stderr)
      const rj = JSON.parse(rr.stdout), g2 = rj.rows.find(r => r.package === 'good.zip'), bl = rj.rows.find(r => r.package === 'blank.zip')
      assert.equal(rj.run, true)
      assert.ok(STEPS.findIndex(s => s[1] === g2.furthest) >= STEPS.findIndex(s => s[0] === 'wrote'), 'batch --run: good reaches wrote: ' + g2.furthest)
      assert.equal(bl.furthest, STEPS[0][1], 'batch --run: blank only launches: ' + bl.furthest)
      assert.match(readFileSync(join(work, 'batch-run.html'), 'utf8'), /What happened/, 'batch --run: the HTML has the runs')
    }
  }
  console.log('batch: ok')

  // Runs.
  const out = join(work, 'good-run.json'), g = run(good, '--out', out)
  assert.ok(calls(g).includes('LMSInitialize '), 'good: initialised: ' + calls(g))
  const saved = JSON.parse(readFileSync(out, 'utf8'))
  assert.ok(saved.format === 'package-lab-run' && saved.trace.coverage.length > 0 && saved.trace.scripts.length > 0, 'good: full run saved with coverage')
  assert.ok(!g.findings.some(f => f.sev === 'error'), 'good: no errors: ' + titles(g))
  assert.ok(g.screens.some(s => s.text > 20), 'good: something showed')
  const idx = id => STEPS.findIndex(s => s[0] === id)
  assert.ok(idx(g.furthest) >= idx('wrote'), 'good: reaches wrote: ' + g.furthest)
  assert.match(g.findings[0].title, /^Got as far as: /, 'good: the milestone finding is first')
  assert.equal(g.findings[0].sev, 'info')
  assert.match(node(['report', out]).stdout, /<h2>Milestones<\/h2>/, 'report: milestones strip')
  assert.match(node(['report', out]).stdout, /<!doctype html>[\s\S]*What happened/, 'cli report (run)')
  // Redacted report (P4.4), of the good run saved above: no text the good lesson shows, writes or reads back is in it. Element names
  // are kept on purpose, so they are taken out before the check; a value the lesson writes can only be in it as its length.
  const redOut = join(work, 'good-redacted.html'), keyFile = join(work, 'good-key.json')
  assert.equal(node(['report', out, '--redact', '--out', redOut]).status, 0, 'redact: report')
  const redHtml = readFileSync(redOut, 'utf8').replace(/cmi\.[\w.]+/g, '')
  const lessonHtml = readFileSync(join(base, 'lesson.html'), 'utf8'), lessonJs = readFileSync(join(base, 'lesson.js'), 'utf8')
  const shown = [...lessonHtml.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').matchAll(/>([^<]+)</g)].map(m => m[1].trim())
    .concat(lessonJs.split('\n').filter(l => /textContent/.test(l)).flatMap(l => [...l.replace(/getElementById\('[^']*'\)/g, '').matchAll(/'([^']*)'/g)].map(m => m[1].trim())))
  const wrote = saved.trace.probe.filter(p => p.type === 'api').flatMap(p => [p.value, p.result]).filter(v => typeof v === 'string')
  assert.deepEqual([...shown, ...wrote].filter(x => x.length >= 4 && !kept(x) && redHtml.includes(x)), [], 'redact: no course text in the redacted report')
  assert.ok(redHtml.includes('Redacted report.') && redHtml.includes('Got as far as'), 'redact: banner, and the findings still there')
  // File names (--redact-names): hashed in the report; the key file keeps the table; the same key gives the same hashes.
  assert.equal(node(['report', out, '--redact', '--redact-names', '--key-out', keyFile, '--out', redOut]).status, 0, 'redact names: report')
  const key = JSON.parse(readFileSync(keyFile, 'utf8'))
  assert.ok(key.names['lesson.html'] && readFileSync(redOut, 'utf8').includes(key.names['lesson.html']) && !readFileSync(redOut, 'utf8').includes('lesson.html'), 'redact names: hashed, with the table in the key file')
  assert.equal(node(['report', out, '--redact', '--redact-names', '--key', keyFile, '--out', redOut]).status, 0, 'redact names: report with the key')
  assert.ok(readFileSync(redOut, 'utf8').includes(key.names['lesson.html']), 'redact names: the same key gives the same hashes')
  assert.equal(node(['report', out, '--redact-names', '--key-out', keyFile]).status, 2, 'redact: names need --redact')
  // The key file: it must be a key file; it is written only after the report, and never over another file.
  const badKey = join(work, 'bad-key.json'), notRun = join(work, 'not-a-run.json'), key2 = join(work, 'key2.json')
  writeFileSync(badKey, '{"format":"package-lab-redaction-key","key":"abc"}'); writeFileSync(notRun, '{}')
  const bk = node(['report', out, '--redact', '--redact-names', '--key', badKey, '--out', redOut])
  assert.ok(bk.status === 2 && /isn’t a key file/.test(bk.stderr), 'redact: a key file with the wrong shape is refused: ' + bk.stderr)
  writeFileSync(badKey, 'not json'); assert.equal(node(['report', out, '--redact', '--redact-names', '--key', badKey, '--out', redOut]).status, 2, 'redact: a key file that is not JSON is refused')
  assert.equal(node(['report', notRun, '--redact', '--redact-names', '--key-out', key2]).status, 2, 'redact: a report that fails')
  assert.ok(!existsSync(key2), 'redact: a failed report leaves no key file behind')
  assert.equal(node(['report', out, '--redact', '--redact-names', '--key-out', keyFile]).status, 2, 'redact: an existing key file is not overwritten')
  // cmi5 and Tin Can (P4.5). Without Electron: analyze, items and the course file. One Electron run in the default suite: the good cmi5 AU
  // reaches terminated (fetched its token once, initialized, completed, passed, terminated), is saved with its statements, and reports (also redacted).
  const cmi5Zip = join(work, 'cmi5.zip'), cmi5BadZip = join(work, 'cmi5-broken.zip'), tincanZip = join(work, 'tincan.zip')
  writeFileSync(cmi5Zip, cmi5Package()); writeFileSync(cmi5BadZip, cmi5Package(cmi5Steps.broken)); writeFileSync(tincanZip, tincanPackage())
  {
    const ca = JSON.parse(node(['analyze', cmi5Zip, '--json']).stdout), ta = JSON.parse(node(['analyze', tincanZip, '--json']).stdout)
    assert.deepEqual([ca.format, ca.manifest.version, ca.item.type, ca.item.launch, ca.verdict.sev], ['cmi5', 'cmi5', 'au', 'au/index.html', 'ok'], 'cmi5: analyze: ' + JSON.stringify(ca.findings.map(f => f.title)))
    assert.deepEqual([ta.format, ta.item.type, ta.item.launch, ta.verdict.sev], ['tincan', 'activity', 'index.html', 'ok'], 'tincan: analyze')
    assert.match(node(['analyze', cmi5Zip]).stdout, /^Package Lab · cmi5\.zip\ncmi5 · 1 items/, 'cmi5: the header names the format'); assert.match(node(['items', tincanZip]).stdout, /Sample Tin Can course {2}activity/)
  }
  const c5Out = join(work, 'cmi5-run.json'), c5 = run(cmi5Zip, '--out', c5Out), c5Saved = JSON.parse(readFileSync(c5Out, 'utf8'))
  assert.equal(c5.furthest, 'terminated', 'cmi5: the good AU reaches terminated: ' + JSON.stringify(c5.milestones.filter(m => !m.reached)) + titles(c5))
  assert.deepEqual(c5.milestones.map(m => m.id), CMI5_STEPS.map(m => m[0]), 'cmi5: its own milestones'); assert.ok(!c5.findings.some(f => f.sev === 'error' || f.sev === 'warn'), 'cmi5: no problems: ' + titles(c5))
  assert.deepEqual(c5.xapi.statements.map(x => x.statement.verb.id.split('/').pop()), ['launched', 'initialized', 'completed', 'passed', 'terminated'], 'cmi5: the statements are in the run'); assert.equal(c5.xapi.tokenFetches.length, 1)
  assert.deepEqual([c5Saved.trace.lrs.format, c5Saved.launch.format, c5Saved.launch.expose, c5Saved.trace.lrs.statements.length, c5Saved.trace.lrs.documents.some(d => d.id === 'LMS.LaunchData')], ['cmi5', 'cmi5', 'none', 5, true], 'cmi5: the saved run carries the LRS')
  assert.ok(c5Saved.trace.lrs.calls.every(c => c.status < 400) && !JSON.stringify(c5Saved.trace.lrs).includes('Basic '), 'cmi5: every request was answered, and no credential is kept')
  assert.match(node(['report', c5Out]).stdout, /<h2>xAPI<\/h2>[\s\S]*terminated/, 'cmi5: the report has the xAPI section')
  const c5Red = node(['report', c5Out, '--redact']).stdout; assert.ok(/<h2>xAPI<\/h2>/.test(c5Red) && !/example\.com|Learner, Test|learner-1/.test(c5Red), 'cmi5: the redacted report has the section and none of the names')
  console.log('cmi5: ok')

  const res = run(good, '--resume-from', out)
  // The sample only resumes after exit = suspend, which a timed-out run never sets; what carries over is its status.
  assert.ok(res.launch.resume && res.api.some(a => a.el === 'cmi.core.lesson_status' && a.call === 'LMSGetValue' && a.result === 'incomplete'), 'resume: stored data offered: ' + calls(res))
  // The same options by flags and by --options give the same saved launch.options (--slow: two more runs; the fixtures' own flags are exercised below).
  const optFile = join(work, 'opts.json'); writeFileSync(optFile, JSON.stringify({ expose: 'both', depth: 1, wait: 3 }))
  if (slow) {
    assert.match(node(['run', good, '--wait', '3']).stdout, /Milestones: ✓ Launch page loaded/, 'cli: milestones line')
    const byFlags = run(good, '--api', 'both', '--depth', '1'), byFile = JSON.parse(node(['run', good, '--options', optFile, '--json']).stdout)
    assert.deepEqual(byFile.launch.options, byFlags.launch.options, 'options: file and flags agree')
    assert.equal(byFile.launch.options.expose, 'both'); assert.equal(byFile.launch.expose, 'both', 'options: version 1 fields kept')
  }
  assert.equal(node(['run', good, '--api', 'x']).status, 2, 'options: bad flag value fails')
  assert.equal(node(['run', good, '--wait', 'x']).status, 2, 'options: bad --wait fails')
  writeFileSync(optFile, '[]'); assert.match(node(['run', good, '--options', optFile]).stderr, /one JSON object/, 'options: array file rejected')
  const mm = run(mismatch)
  assert.equal(mm.api.length, 0, 'mismatch: no calls')
  assert.equal(mm.furthest, 'looked', 'mismatch: reaches looked')
  assert.ok(titles(mm).some(t => /looked for API and found nothing/.test(t)), 'mismatch: lookup finding: ' + titles(mm))
  if (slow) assert.ok(calls(run(mismatch, '--api', 'both')).includes('LMSInitialize '), 'mismatch with both APIs: calls appear (the api preset below shows it too)')
  const hRun = run(hosted), hh = titles(hRun)
  assert.ok(hh.some(t => /asked the host for files outside the package/.test(t)), 'hosted: server request: ' + hh)
  assert.ok(hh.some(t => /set its own window.API/.test(t)), 'hosted: own API: ' + hh)
  const blankRun = run(blank), rb = titles(blankRun)
  assert.ok(rb.some(t => /blank page/.test(t) && /Not found: js\/app\.js/.test(t)), 'blank run: ' + rb)
  assert.equal(blankRun.furthest, 'launched', 'blank: reaches launched only')
  assert.ok(titles(run(order)).some(t => /run before what they need/.test(t)), 'order run: static finding')
  const rl = titles(run(loader))
  assert.ok(rl.some(t => /stuck on a loading screen/.test(t) && /JSON/.test(t)), 'loader run: ' + rl)
  // Why it stalled (P1.6): a handshake the LMS never answers is named by its message type.
  const hs = run(handshake), hsf = hs.findings.find(f => /was waiting for/.test(f.title))
  assert.ok(hsf && /player-ready/.test(hsf.title) && hsf.sev === 'warn' && hsf.evidence.some(e => /sent “player-ready” to the LMS window.*nothing there was listening/.test(e)), 'handshake: reported as unanswered: ' + titles(hs))
  assert.ok(hs.waitingFor.unanswered[0].message === '“player-ready”' && hs.waitingFor.listeners.length === 1, 'handshake: --json waitingFor: ' + JSON.stringify(hs.waitingFor))
  assert.match(node(['run', handshake, '--wait', '3']).stdout, /WARNING {2}The content was waiting for: a reply to “player-ready”/, 'handshake: the CLI prints the finding')
  assert.ok(g.milestones.every(m => !m.reached || m.t === null || m.t >= 0 && m.t < 20000) && saved.trace.probe.filter(p => p.type === 'api').every(p => p.t < 20000), 'good: milestone and API times are relative to the start of the run')
  { // The Timeline (P4.2) on the good run, which the run above saved: ten API calls, and every milestone up to wrote, in order.
    const tlg = timelineModel(saved.trace, saved.milestones), want = STEPS.slice(0, idx('wrote') + 1).map(s => s[0])
    assert.equal(tlg.lanes.api.length, 10, 'timeline: ten API calls: ' + tlg.lanes.api.map(a => a.label))
    const got = tlg.lanes.milestones.map(m => m.id)
    assert.deepEqual(got.filter(id => want.includes(id)), want, 'timeline: milestones up to wrote, in order: ' + got)
    assert.ok(want.every(id => tlg.lanes.milestones.some(m => m.id === id && m.t != null)), 'timeline: every step up to wrote has a time')  // not sorted by time: a step's time is its first evidence ("shown" is any DOM report)
  }
  if (slow) {
    const pl = run(polling, '--wait', '4'), plf = pl.findings.find(f => /was waiting for/.test(f.title))
    assert.ok(plf && plf.evidence.some(e => /polls every 250 ms/.test(e) && (process.env.PACKAGE_LAB_FORCE_TRACE === '1' || !/tests/.test(e))), 'polling: a poller without a trace: ' + titles(pl))
    const plt = run(polling, '--wait', '4', '--trace'), pltf = plt.findings.find(f => /was waiting for/.test(f.title))
    assert.ok(pltf && /`window\.API` to change \(checked every 250 ms\)/.test(pltf.title) && pltf.evidence.some(e => /boot\.js:1 polls every 250 ms \(\d+ runs\); tests `window\.API → undefined`, \d+ times/.test(e)), 'polling: the condition when traced: ' + titles(plt))
  }
  if (slow) {
    // P3.2: a pack's run rules in a real run. The hosted fixture (server request, own API) with a Xyleme marker in its script.
    const xyleme = fixture('xyleme', d => { cpSync(join(work, 'hosted'), d, { recursive: true }); writeFileSync(join(d, 'boot.js'), readFileSync(join(d, 'boot.js'), 'utf8') + '\n// Xyleme player\n') })
    const xr = run(xyleme), xt = titles(xr)
    assert.ok(xr.packs?.some(p => p.id === 'xyleme') || xt.some(t => /^Made with Xyleme/.test(t)), 'xyleme: detected: ' + xt)
    assert.ok(xt.some(t => /^Xyleme: the content asked its host for data outside the package/.test(t)) && xt.some(t => /^Xyleme: the content built its own SCORM API in this run/.test(t)), 'xyleme: run rules: ' + xt)
  }
  if (slow) {
    // P3.1: the corrected packages run. A package whose only fault is a script reference in the wrong capitals, once fixed, has
    // no 404 (blank itself would then show its own script error: that script runs before <body> exists); mismatch's version fixed: calls appear with no --api setting.
    const capitals = fixture('capitals', d => {
      mkdirSync(join(d, 'js')); writeFileSync(join(d, 'js', 'App.js'), "document.body.insertAdjacentHTML('beforeend', '<h1>Built by App.js</h1>')")
      sub(d, 'lesson.html', '</body>', '<script src="js/app.js"></script></body>')
    })
    assert.ok(titles(run(capitals)).some(t => /js\/app\.js/.test(t) && /404|Not found/.test(t)), 'fix: setup: the wrong capitals give a 404 for js/app.js')
    const capOut = join(work, 'capitals-fixed.zip'); assert.equal(node(['fix', capitals, '--out', capOut]).status, 0)
    const fb = run(capOut), fbt = titles(fb)
    assert.ok(!fbt.some(t => /404|Not found/.test(t)), 'fix: the corrected package loads the renamed script: ' + fbt)
    assert.ok(calls(run(join(work, 'mismatch-fixed.zip'))).includes('LMSInitialize '), 'fix: the corrected mismatch makes API calls')
  }
  console.log('runs: ok')

  // LMS profiles (P2.1). good searches window.parent.API (scorm.js): it works on the same origin (the good run above),
  // and on another origin the lookup is blocked and explained, with the content frame still recorded (an OOPIF).
  const profFile = (name, p) => { const f = join(work, name + '.json'); writeFileSync(f, JSON.stringify(p)); return f }
  const oOut = join(work, 'other-run.json'), oRun = run(good, '--profile-file', profFile('other', { contentOrigin: 'other' }), '--out', oOut), oSaved = JSON.parse(readFileSync(oOut, 'utf8'))
  const oF = oRun.findings.find(f => f.title === 'The content can’t reach the LMS from another origin')
  assert.ok(oF && oF.sev === 'error' && oF.evidence.some(e => /^API blocked \(uncaught\) in lesson\.html at find \(lab:\/\/content\/pkg\/scorm\.js:\d+:\d+\)$/.test(e)), 'other origin: the finding: ' + titles(oRun))
  assert.ok(oRun.api.length === 0 && /^lab:\/\/content\/pkg\/lesson\.html/.test(oSaved.launch.url) && oSaved.launch.profile.contentOrigin === 'other' && oSaved.launch.options.profile.contentOrigin === 'other', 'other origin: served from lab://content, profile saved')
  assert.ok(oSaved.trace.probe.some(p => p.type === 'dom' && p.frame.startsWith('lab://content/pkg/')) && oSaved.trace.probe.some(p => p.type === 'frame' && p.frame.startsWith('lab://content/') && !p.topReachable), 'other origin: the recorder attached to the content frame')
  const sbRun = run(good, '--profile-file', profFile('sandbox', { frames: { sandbox: 'allow-scripts' } }))
  assert.ok(sbRun.findings.some(f => /sandbox has no allow-same-origin/.test(f.title) && f.evidence.includes('sandbox="allow-scripts"') && f.evidence.some(e => /lesson\.html has origin null/.test(e))), 'sandbox: detected: ' + titles(sbRun))
  // The API on the content's parent, two LMS frames down, with the profile's parameters and failing commits; --profile is the base.
  const pOut2 = join(work, 'parent-run.json'), pr = run(good, '--profile', 'moodle', '--profile-file', profFile('parent', { frames: { depth: 2 }, apiWhere: 'parent', commit: 'fail', launchParams: 'id={scoid}&attempt={attempt}' }), '--out', pOut2)
  const prSaved = JSON.parse(readFileSync(pOut2, 'utf8'))
  assert.ok(calls(pr).includes('LMSInitialize ') && prSaved.trace.probe.some(p => p.type === 'lookup' && p.found && p.frame === 'lab://run/__lab/wrap.html?1#1'), 'profile: the API is on the content’s parent: ' + calls(pr))
  // Three LMS frames and more: each frame has its own address, or the browser refuses to load the third one inside the others.
  const d3 = run(good, '--depth', '3'); assert.equal(d3.furthest, 'committed', 'depth 3: the content loads and finds the API: ' + titles(d3))
  assert.ok(pr.api.some(a => a.call === 'LMSCommit' && a.result === 'false' && a.err === 101) && /[?&]id=lesson&attempt=1$/.test(prSaved.launch.url), 'profile: commits fail, parameters filled in: ' + prSaved.launch.url)
  assert.deepEqual(prSaved.launch.options.profile, { base: 'moodle', frames: { depth: 2 }, apiWhere: 'parent', commit: 'fail', launchParams: 'id={scoid}&attempt={attempt}' }, 'profile: saved as given')
  assert.equal(node(['run', good, '--profile', 'nope']).status, 2, 'profile: an unknown preset fails')
  assert.equal(node(['run', good, '--profile-file', profFile('bad', { apiWhere: 'opener' })]).status, 2, 'profile: fields that don’t fit together fail')
  if (slow) {
    // A popup after a delay, with an LMS frame in it holding the API (its top); frames in a frameset; a delayed API that
    // content looking once misses; a CSP and headers on package files.
    const pop = run(good, '--profile-file', profFile('popup', { launch: 'popup', popupDelay: 500, frames: { depth: 1 }, apiWhere: 'top' }), '--wait', '4')
    assert.ok(calls(pop).includes('LMSInitialize '), 'profile: popup with the API on its top: ' + calls(pop))
    const fs = run(good, '--profile-file', profFile('frameset', { frames: { depth: 1, kind: 'frameset' } }))
    assert.ok(calls(fs).includes('LMSInitialize '), 'profile: frameset: ' + calls(fs))
    const late = run(good, '--profile-file', profFile('late', { apiDelay: 1500 }))
    assert.ok(late.api.length === 0 && titles(late).some(t => /looked for API and found nothing/.test(t)), 'profile: a late API is missed: ' + titles(late))
    const cspRun = run(good, '--profile-file', profFile('csp', { csp: "script-src 'none'", headers: { 'X-Lab': '1' } }))
    assert.ok(titles(cspRun).some(t => /refused to load or run something/.test(t) && /script-src 'none'/.test(t)), 'profile: the CSP header applies: ' + titles(cspRun))
    const lx = JSON.parse(node(['experiment', good, '--preset', 'lms', '--wait', '2', '--json']).stdout)
    assert.deepEqual(lx.variants.map(v => v.name), ['default', ...PROFILE_NAMES.slice(1).map(n => 'lms ' + n)], 'experiment: the lms preset')
  }
  // What the content sees of its own address: https, a secure context (Package Lab serves https://lms.lab.invalid/ and https://cdn.content.invalid/),
  // while the trace keeps the lab:// form. A course that reads location.href with a regex must not get lab:// (that once hid a hang).
  const seen = fixture('seen', d => sub(d, 'lesson.html', '<script src="scorm.js"></script>', `<script>
var m = location.href.match(/https?:\\/\\/[^\\/]*\\.([^\\/:\\.]*\\.[^\\/:\\.]*).[^\\/:]*\\//)
console.log('SEEN ' + JSON.stringify({ protocol: location.protocol, host: location.hostname, secure: isSecureContext, https: location.href.startsWith('https://'), regex: m && m[1] }))
</script><script src="scorm.js"></script>`))
  for (const [name, args, host, origin] of [['same', [], 'lms.lab.invalid', 'lab://run'], ['other', ['--profile-file', profFile('seen-other', { contentOrigin: 'other' })], 'cdn.content.invalid', 'lab://content']]) {
    const out = join(work, `seen-${name}.json`), r = run(seen, ...args, '--out', out), sv = JSON.parse(readFileSync(out, 'utf8'))
    const line = sv.trace.console.map(c => c.text).find(t => /^SEEN /.test(t)); assert.ok(line, `origin ${name}: the content logged: ` + JSON.stringify(sv.trace.console))
    assert.deepEqual(JSON.parse(line.slice(5)), { protocol: 'https:', host, secure: true, https: true, regex: host.split('.').slice(1).join('.') }, `origin ${name}: the content sees https, and the tenant-host regex finds its domain without throwing`)
    assert.ok(sv.trace.requests.some(q => q.url.startsWith(origin + '/pkg/lesson.html') && q.status === 200) && !JSON.stringify(sv.trace).includes('.invalid/'), `origin ${name}: the trace keeps lab:// addresses`)
    if (name === 'same') assert.ok(calls(r).includes('LMSInitialize '), 'origin: SCORM still works')   // on another origin the API is out of reach
  }
  console.log('profiles: ok')

  // A window launch (--window): the recorder has to be attached before the window loads, or its requests and probe are missed.
  const winRun = run(good, '--window', '--wait', '2')
  assert.ok(!winRun.findings.some(f => /was never requested|never got as far as showing anything/.test(f.title)) && calls(winRun).includes('LMSInitialize '), 'window: the launch page is matched in the trace: ' + titles(winRun))
  assert.ok(idx(winRun.furthest) >= idx('wrote') && winRun.screens.some(s => /lesson\.html/.test(s.frame) && s.text > 20), 'window: content shown and data written: ' + winRun.furthest)

  // Blocked storage (P2.2): stored works as it is, and with storage blocked (by the option, or a profile) it never starts and says why.
  if (slow) assert.ok(calls(run(stored, '--wait', '2')).includes('LMSInitialize '), 'storage: stored works with normal storage')
  const stOut = join(work, 'stored-blocked.json'), stRun = run(stored, '--storage', 'blocked', '--wait', '2', '--out', stOut), stSaved = JSON.parse(readFileSync(stOut, 'utf8')), stf = stRun.findings.find(f => f.title === 'The content needs storage the browser can block')
  assert.ok(stf && stf.sev === 'warn' && stf.evidence.some(e => /^localStorage in lesson\.html at .*boot\.js:2:/.test(e)) && /1 uncaught error came from it/.test(stf.detail), 'storage: blocked is explained: ' + titles(stRun))
  assert.ok(stRun.api.length === 0 && stRun.findings.some(f => /never looked for the SCORM API/.test(f.title)) && stSaved.launch.storage === 'blocked' && stSaved.launch.options.storage === 'blocked', 'storage: it never reaches the LMS, and the mode is saved: ' + titles(stRun))
  assert.ok(stSaved.trace.exceptions.some(e => /SecurityError/.test(e.text)) && stSaved.trace.probe.some(p => p.type === 'storage-blocked' && p.what === 'localStorage' && p.stack.length), 'storage: the refusal is in the trace')
  if (slow) {
    const stPart = run(stored, '--storage', 'partitioned', '--wait', '2')
    assert.ok(calls(stPart).includes('LMSInitialize ') && !stPart.findings.some(f => /needs storage/.test(f.title)), 'storage: partitioned keeps storage')
  }
  assert.equal(node(['run', good, '--storage', 'nope']).status, 2, 'storage: a bad mode fails')
  if (slow) {
    assert.ok(titles(run(stored, '--profile', 'scorm-cloud', '--wait', '2')).some(t => /needs storage the browser can block/.test(t)), 'storage: the scorm-cloud profile blocks it too')
    assert.ok(!run(good, '--storage', 'blocked', '--wait', '2').findings.some(f => /needs storage/.test(f.title)), 'storage: good doesn’t use any, so nothing is said')
    const sx = JSON.parse(node(['experiment', stored, '--preset', 'storage', '--wait', '2', '--json']).stdout)
    assert.deepEqual(sx.variants.map(v => v.name), ['default', 'storage blocked'], 'storage experiment: the variants')
    assert.ok(sx.findings.some(f => f.title === 'With storage blocked, the content gets less far'), 'storage experiment: less far: ' + sx.findings.map(f => f.title))
  }
  console.log('storage: ok')

  // Device sizes in Electron, and other browsers (P2.3). Without Playwright WebKit refuses and says how to install it.
  const noPw = node(['run', good, '--browser', 'webkit', '--wait', '1'], { env: { ...process.env, PACKAGE_LAB_NO_PLAYWRIGHT: '1' } })
  assert.equal(noPw.status, 2, 'browser: no Playwright fails'); assert.match(noPw.stderr, /Playwright, which isn’t installed here\. Install it with: npm i -D playwright && npx playwright install webkit/, 'browser: the refusal says how to install: ' + noPw.stderr)
  assert.equal(node(['run', good, '--browser', 'firefox']).status, 2, 'browser: a bad name fails'); assert.equal(node(['run', good, '--viewport', 'tv']).status, 2, 'viewport: a bad size fails')
  const vpOut = join(work, 'iphone-run.json'), vpRun = run(good, '--viewport', 'iphone', '--wait', '2', '--out', vpOut), vpSaved = JSON.parse(readFileSync(vpOut, 'utf8'))
  const vpDom = vpSaved.trace.probe.find(p => p.type === 'dom' && /lesson\.html/.test(p.frame))
  assert.deepEqual([vpDom.w, vpDom.h], [390, 844], 'viewport: the content sees the iPhone preset’s size: ' + [vpDom.w, vpDom.h])
  assert.ok(vpSaved.launch.options.viewport.mobile && vpSaved.launch.options.viewport.touch && vpSaved.trace.browser === 'chromium' && / · iphone$/.test(vpSaved.label), 'viewport: kept in the saved run: ' + vpSaved.label)
  assert.ok(calls(vpRun).includes('LMSInitialize '), 'viewport: good still works at phone size')
  console.log('browsers and device sizes (quick): ok')
  let wkReady = false   // Playwright and its WebKit are here (slow checks; not repeated in the forced-trace pass, which only changes Electron runs)
  if (slow && process.env.PACKAGE_LAB_FORCE_TRACE !== '1') {
    const wkProbe = node(['run', good, '--browser', 'webkit', '--wait', '3', '--json'])
    if (wkProbe.status !== 0 && /Install it with/.test(wkProbe.stderr)) console.log('webkit: skipped (' + wkProbe.stderr.trim().split('\n')[0] + ')')
    else {
      wkReady = true
      assert.equal(wkProbe.status, 0, 'webkit: ' + wkProbe.stderr)
      const wk = JSON.parse(wkProbe.stdout), wkOut = join(work, 'webkit-run.json'), wkSaved = (run(good, '--browser', 'webkit', '--out', wkOut), JSON.parse(readFileSync(wkOut, 'utf8')))
      assert.ok(idx(wk.furthest) >= idx('wrote'), 'webkit: good reaches wrote: ' + wk.furthest + ' ' + titles(wk))
      assert.ok(calls(wk).includes('LMSInitialize ') && !wk.findings.some(f => f.sev === 'error'), 'webkit: good has API calls and no errors: ' + titles(wk))
      assert.deepEqual([wkSaved.trace.browser, wkSaved.trace.coverage.length, wkSaved.trace.caught.length, Object.keys(wkSaved.trace.sources).length, wkSaved.launch.options.browser], ['webkit', 0, 0, 0, 'webkit'], 'webkit: trace in the same format, with no coverage, caught errors or sources')
      assert.ok(wkSaved.trace.requests.some(r => r.url === 'lab://run/pkg/lesson.html' && r.status === 200) && wkSaved.trace.probe.some(p => p.type === 'dom' && p.frame === 'lab://run/pkg/lesson.html' && p.text > 20), 'webkit: requests and the probe’s reports use lab:// addresses')
      assert.ok(wkSaved.trace.browserVersion, 'webkit: the version is recorded')
      assert.match(node(['report', wkOut]).stdout, /<h2>Milestones<\/h2>/, 'webkit: a saved WebKit run reports like any other')
      // A Chrome-only API: fine in Chromium, an error recorded in WebKit.
      const coChrome = run(chromeOnly, '--wait', '2'), coWk = run(chromeOnly, '--browser', 'webkit', '--wait', '2', '--out', wkOut), coSaved = JSON.parse(readFileSync(wkOut, 'utf8'))
      assert.ok(calls(coChrome).includes('LMSInitialize ') && !coChrome.findings.some(f => /brands/.test(JSON.stringify(f))), 'chromeonly: works in Chromium: ' + titles(coChrome))
      assert.ok(coSaved.trace.exceptions.some(e => /brands/.test(e.text) && /lesson\.js$/.test(e.url)), 'chromeonly: the error is recorded in WebKit: ' + JSON.stringify(coSaved.trace.exceptions))
      assert.ok(coWk.findings.some(f => f.sev === 'error' && /brands/.test(JSON.stringify(f))) && !calls(coWk).includes('LMSInitialize '), 'chromeonly: fails only in WebKit, and is explained: ' + titles(coWk))
      // Device size and the LMS profile in WebKit; an unsupported option is refused.
      const wkVp = run(good, '--browser', 'webkit', '--viewport', 'ipad', '--wait', '2', '--out', wkOut), wkVpDom = JSON.parse(readFileSync(wkOut, 'utf8')).trace.probe.find(p => p.type === 'dom' && /lesson\.html/.test(p.frame))
      assert.deepEqual([wkVpDom.w, wkVpDom.h], [820, 1180], 'webkit: the iPad preset’s size: ' + [wkVpDom.w, wkVpDom.h]); assert.ok(calls(wkVp).includes('LMSInitialize '))
      assert.ok(calls(run(good, '--browser', 'webkit', '--profile', 'moodle', '--wait', '2')).includes('LMSInitialize '), 'webkit: a framed LMS profile works')
      assert.ok(calls(run(good, '--browser', 'webkit', '--profile', 'cornerstone', '--wait', '3')).includes('LMSInitialize '), 'webkit: a window-opener profile works')
      assert.ok(titles(run(stored, '--browser', 'webkit', '--storage', 'blocked', '--wait', '2')).some(t => /needs storage the browser can block/.test(t)), 'webkit: blocked storage is explained')
      assert.ok(run(hosted, '--browser', 'webkit', '--answer', '/api/player/config=200:{}', '--wait', '2').findings.some(f => /Answered 1 request/.test(f.title)), 'webkit: answers')
      assert.match(node(['run', good, '--browser', 'webkit', '--trace']).stderr, /Tracing the code runs only in Chromium/, 'webkit: tracing is refused')
      const wc5 = run(cmi5Zip, '--browser', 'webkit', '--wait', '3'); assert.equal(wc5.furthest, 'terminated', 'webkit: a cmi5 AU reaches terminated through the same LRS: ' + titles(wc5)); assert.equal(wc5.xapi.statements.length, 5)
      const wt = run(tincanZip, '--browser', 'webkit', '--wait', '3'); assert.deepEqual(wt.xapi.statements.map(x => x.status), ['stored', 'rejected', 'stored'], 'webkit: a Tin Can package: its statements are validated the same')
      const bx = JSON.parse(node(['experiment', chromeOnly, '--preset', 'browsers', '--wait', '2', '--json']).stdout)
      assert.deepEqual(bx.variants.map(v => v.name), ['default', 'browser webkit'], 'browsers experiment: the variants')
      assert.ok(bx.variants[1].furthest !== bx.variants[0].furthest && idx(bx.variants[0].furthest) > idx(bx.variants[1].furthest), 'browsers experiment: webkit gets less far: ' + JSON.stringify(bx.variants.map(v => [v.name, v.furthest])))
    }
    // The live view uses the emulated size.
    const liveDir = join(work, 'vp-live'); run(good, '--viewport', 'ipad', '--wait', '3', '--live', liveDir)
    assert.deepEqual([JSON.parse(readFileSync(join(liveDir, 'frame.json'), 'utf8')).w, JSON.parse(readFileSync(join(liveDir, 'frame.json'), 'utf8')).h], [820, 1180], 'viewport: the live frame is the emulated size')
    console.log('webkit: ok')
  }

  // Tracing (P1.4): hosted, traced, records its failed configuration check and startCourse, keeps the original source,
  // and finds what the untraced run found.
  const forced = process.env.PACKAGE_LAB_FORCE_TRACE === '1'
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

  // Drill-down (P1.5): hosted's fallback comes from the failed /api/player/config request. r is a local, so one run.
  const dh = JSON.parse(node(['drill', hosted, '--wait', '3', '--json']).stdout)
  assert.ok(dh.chain.some(s => s.request === '/api/player/config' && /failed \(404\)/.test(s.text)) && dh.cause?.kind === 'request' && dh.findings[0].sev === 'error', 'drill: hosted names the failed request: ' + JSON.stringify(dh.chain))
  assert.ok(dh.chain[0].text.startsWith('In boot.js:4, `if (!r.ok)` was true') && !dh.watched, 'drill: hosted starts at the failed check, without a watch run')
  if (slow) {
    const dlDir = join(work, 'drill'), dl = node(['drill', levels, '--wait', '3', '--out', dlDir])
    assert.match(dl.stdout, /Why it stopped\n\s+1\. In boot\.js:3, `if \(window\.player && player\.ready\)` was false[\s\S]*never assigned \(watched\)[\s\S]*js\/player\.js[\s\S]*`if \(config\.cdn\)`[\s\S]*data\/config\.json \(200\), which has no `cdn`/, 'drill: levels explained to the JSON file: ' + dl.stdout + dl.stderr)
    const dlSaved = JSON.parse(readFileSync(join(dlDir, 'drill.json'), 'utf8'))
    assert.ok(dlSaved.watched && dlSaved.watch.includes('player') && existsSync(join(dlDir, '02-watched.json')), 'drill: --out keeps both runs and drill.json')
    assert.ok(JSON.parse(readFileSync(join(dlDir, '02-watched.json'), 'utf8')).launch.options.pins.some(p => p.mode === 'watch' && p.path === 'config.cdn'), 'drill: the watch run has watch pins')
  }
  console.log('drill: ok')

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
  assert.ok(calls(hAns).includes('LMSInitialize '), 'answer: the content reaches Package Lab’s LMS: ' + calls(hAns))
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
  assert.ok(existsSync(join(exDir, '02-api_both.json')) && JSON.parse(readFileSync(exBy['api both'].out, 'utf8')).format === 'package-lab-run', 'experiment: runs saved in --out')
  assert.deepEqual(JSON.parse(readFileSync(join(exDir, 'experiment.json'), 'utf8')).variants.map(v => v.name), ex.variants.map(v => v.name), 'experiment: --out also keeps the result as experiment.json')
  if (slow) {   // --variants with a file: two more runs
  const exText = node(['experiment', mismatch, '--variants', (writeFileSync(join(work, 'variants.json'), JSON.stringify([{ name: 'deep', patch: { depth: 1 } }])), join(work, 'variants.json')), '--wait', '3'])
  assert.match(exText.stdout, /Variant\s+Furthest[\s\S]*deep[\s\S]*Nothing tried made a difference/, 'experiment: text table and --variants file: ' + exText.stdout)
  }
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
  if (slow) {   // package-lab diff --run (P3.3): good reaches wrote, blank only launched
    const dr = node(['diff', good, blank, '--run', '--wait', '3', '--json']); assert.equal(dr.status, 0, 'diff --run: ' + dr.stderr)
    const bj = JSON.parse(dr.stdout).behaviour
    assert.ok(idx(bj.a.furthest) >= idx('wrote') && bj.b.furthest === 'launched' && bj.better === -1, 'diff --run: how far each got: ' + [bj.a.furthest, bj.b.furthest]); assert.ok(bj.counts.apiCalls.a > bj.counts.apiCalls.b, 'diff --run: counts')
    assert.match(node(['diff', good, blank, '--run', '--wait', '3']).stdout, /good\.zip reached “[^”]+”; blank\.zip reached “Launch page loaded”[\s\S]*apiCalls: \d+ → 0/, 'diff --run: text output')
  }
  for (const bad of [['--rounds', '0'], ['--rounds', 'x'], ['--request', '/(/'], ['--rounds']]) assert.equal(node(['discover', needs, ...bad]).status, 2, 'discover: bad flags fail: ' + bad)
  console.log('discover: ok')

  // Live: a frame appears, a click on Next reaches the course, stop ends the run early.
  const live = join(work, 'live')
  const child = spawn(process.execPath, [cli, 'run', good, '--wait', '60', '--live', live, '--json'], { stdio: ['ignore', 'pipe', 'ignore'] })
  let stdout = ''; child.stdout.on('data', d => { stdout += d })
  const until = async (test, ms, what) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 200))) if (test()) return; throw new Error('timed out: ' + what) }
  await until(() => existsSync(join(live, 'frame.jpg')), 30000, 'first frame')
  // The first frame can come before the course has loaded (GitHub's Windows runner is slow): click once it has called the API.
  await until(() => { try { return JSON.parse(readFileSync(join(live, 'status.json'), 'utf8')).api > 0 } catch { return false } }, 30000, 'the course calling the API')
  const started = Date.now()
  // On GitHub Actions, keep the frames and sizes around the click for the workflow's diagnostics artifact.
  const diag = process.env.GITHUB_ACTIONS ? join(root, 'dist', 'diag') : null, keep = name => { if (diag) try { mkdirSync(diag, { recursive: true }); for (const f of ['frame.jpg', 'frame.json', 'status.json']) cpSync(join(live, f), join(diag, `${name}-${f}`)) } catch { /* best effort */ } }
  keep('before')
  // Next sits 146 px right of centre and 253 px down (the sample's fixed-width column), whatever the window size: a
  // smaller screen (GitHub's Windows runner is 1024×768) shrinks the run window, so fixed fractions would miss it.
  const fr = JSON.parse(readFileSync(join(live, 'frame.json'), 'utf8'))
  writeFileSync(join(live, 'input', '1.json'), JSON.stringify({ type: 'click', x: 0.5 + 146 / fr.w, y: 253 / fr.h }))
  await new Promise(r => setTimeout(r, 1500))
  const clickTaken = !existsSync(join(live, 'input', '1.json'))
  keep('after')
  writeFileSync(join(live, 'input', '2.json'), JSON.stringify({ type: 'stop' }))
  await new Promise(r => child.on('exit', r))
  assert.ok(Date.now() - started < 30000, 'live: stop ended it early')
  const lv = JSON.parse(stdout)
  const liveInfo = () => JSON.stringify({ clickTaken, frame: (() => { try { return JSON.parse(readFileSync(join(live, 'frame.json'), 'utf8')) } catch { return null } })(), location: lv.api.filter(a => a.el === 'cmi.core.lesson_location').map(a => a.value), furthest: lv.furthest })
  assert.ok(lv.api.some(a => a.el === 'cmi.core.lesson_location' && a.value === '2'), 'live: the click reached Next: ' + liveInfo())
  assert.ok(STEPS.findIndex(s => s[0] === lv.furthest) >= STEPS.findIndex(s => s[0] === 'wrote'), 'live: reaches at least wrote: ' + lv.furthest)
  console.log('live: ok')

  // Save and resume (P2.4): a macro clicks Next, then Save and exit (positions across the window, measured on the sample page).
  const macroFile = join(work, 'macro.json'); writeFileSync(macroFile, JSON.stringify([{ t: 400, type: 'click', x: 0.631, y: 0.328 }, { t: 900, type: 'click', x: 0.73, y: 0.328 }]))
  const cycle = (zip, ...args) => { const r = node(['cycle', zip, '--wait', '2', '--json', ...args]); assert.ok(r.stdout, 'cycle printed nothing: ' + r.stderr); return JSON.parse(r.stdout) }
  const cyc = cycle(good, '--macro', macroFile)
  assert.deepEqual(cyc.findings.map(f => f.sev + ' ' + f.title), ['info Saving and resuming worked'], 'cycle: good passes: ' + JSON.stringify(cyc.findings))
  assert.deepEqual([cyc.rows.find(r => r.label === 'Entry offered').b, cyc.rows.find(r => r.label === 'Exit set').a, cyc.rows.find(r => r.label === 'Location saved (first, last)').b], ['resume', 'suspend', '2, 2'], 'cycle: the second run resumed on page 2: ' + JSON.stringify(cyc.rows))
  assert.equal(cyc.base.macro.length, 2, 'cycle: the macro is in the options')
  console.log('cycle: ok')
  if (slow) {
    // Without a macro, only what start-up saves counts; the findings of the fixtures; the options and the text output; WebKit is refused.
    assert.deepEqual(cycle(good).findings.map(f => f.sev), ['info'], 'cycle: with no macro the start-up bookmark and the pagehide handler still pass')
    const ne = cycle(noExit, '--macro', macroFile)
    assert.deepEqual(ne.findings.map(f => f.sev + ' ' + f.title), ['warn The LMS started a new attempt instead of resuming (entry was “”)'], 'cycle: no exit: ' + JSON.stringify(ne.findings))
    assert.ok(ne.findings[0].evidence[0] === 'exit written by the content: nothing', 'cycle: no exit: evidence')
    const rs = cycle(restart, '--macro', macroFile)
    assert.deepEqual(rs.findings.map(f => f.sev + ' ' + f.title), ['warn The content read its saved place but started from the beginning'], 'cycle: restart: ' + JSON.stringify(rs.findings))
    assert.deepEqual(rs.findings[0].evidence, ['left at “2”', 'first saved after resuming: “1”'], 'cycle: restart: evidence')
    const cdir = join(work, 'cycle-runs'), ct = node(['cycle', good, '--wait', '2', '--macro', macroFile, '--out', cdir])
    assert.match(ct.stdout, /Run 1: leaves {2,}Run 2: resumes[\s\S]*Entry offered {2,}ab-initio {2,}resume[\s\S]*INFO {2}Saving and resuming worked[\s\S]*Runs saved in /, 'cycle: text output: ' + ct.stdout + ct.stderr)
    assert.ok(existsSync(join(cdir, '01-first.json')) && JSON.parse(readFileSync(join(cdir, '02-resumed.json'), 'utf8')).launch.resume === true, 'cycle: --out keeps both runs')
    assert.equal(node(['cycle', noExit, '--wait', '2', '--macro', macroFile, '--strict']).status, 0, 'cycle: --strict ignores warnings')
    // A macro in an ordinary run reaches the page, and the run's saved options carry it.
    const mr = run(good, '--wait', '3', '--macro', macroFile)
    assert.ok(mr.api.some(a => a.el === 'cmi.core.lesson_location' && a.value === '2') && mr.launch.options.macro.length === 2 && mr.api.some(a => a.call === 'LMSFinish'), 'macro: replayed in a run: ' + calls(mr))
    // Macro format 2 (E1.1): wait steps, and the size a macro was recorded at.
    {
      let n = 0
      const macro2 = (events, extra = {}) => { const f = join(work, `macro2-${n++}.json`); writeFileSync(f, JSON.stringify({ format: 'package-lab-macro', version: 2, ...extra, events })); return f }
      const toTwo = r => r.api.some(a => a.el === 'cmi.core.lesson_location' && a.value === '2'), click = { type: 'click', x: 0.15, y: 0.1 }
      const early = run(latebutton, '--wait', '6', '--macro', macro2([{ t: 1000, ...click }], { version: 1 }))
      assert.ok(!toTwo(early), 'wait: a click on Next at 1 s comes too early: ' + calls(early))
      const waited = run(latebutton, '--wait', '8', '--macro', macro2([{ t: 100, type: 'wait', text: 'Next' }, { t: 200, ...click }]))
      assert.ok(toTwo(waited), 'wait: the click after a wait for “Next” reaches it: ' + calls(waited))
      assert.ok(!waited.findings.some(f => /macro stopped/.test(f.title)), 'wait: no timeout finding when the text appears')
      const never = run(latebutton, '--wait', '6', '--macro', macro2([{ t: 100, type: 'wait', text: 'Never on the page', timeout: 2000 }, { t: 200, ...click }]))
      assert.ok(never.findings.some(f => f.sev === 'warn' && /^The macro stopped at step 1: waited 2 s for “Never on the page” and it never appeared/.test(f.title)) && !toTwo(never), 'wait: a wait that times out stops the macro: ' + titles(never))
      assert.ok(never.api.some(a => a.call === 'LMSCommit'), 'wait: and the run still finishes, with its calls')
      const byStep = run(latebutton, '--wait', '6', '--macro', macro2([{ t: 100, type: 'wait', milestone: 'initialised' }, { t: 200, type: 'wait', quiet: 100 }, { t: 300, type: 'wait', ms: 3500 }, { t: 400, ...click }]))
      assert.ok(toTwo(byStep) && !byStep.findings.some(f => /macro stopped/.test(f.title)), 'wait: a milestone, a quiet network and a pause: ' + titles(byStep))
      const small = macro2([{ t: 100, type: 'wait', text: 'Next' }, { t: 200, ...click }], { viewport: { width: 800, height: 600 } })
      const sized = run(latebutton, '--wait', '8', '--macro', small)
      assert.deepEqual([sized.launch.options.viewport.width, sized.launch.options.viewport.height], [800, 600], 'macro size: the run is at the size the macro was recorded at')
      assert.ok(toTwo(sized), 'macro size: the click reaches Next at that size: ' + calls(sized))
      const forced = run(latebutton, '--wait', '8', '--viewport', '1000x700', '--macro', small)
      assert.deepEqual([forced.launch.options.viewport.width, forced.launch.options.viewport.height], [1000, 700], 'macro size: --viewport wins')
      assert.ok(forced.findings.some(f => f.sev === 'info' && f.title === 'The macro was recorded at 800×600 and played at 1000×700: clicks may miss'), 'macro size: and says so: ' + titles(forced))
    }
    // Clicks tied to their element (E1.2): recorded at 1100 wide, replayed at 600 where Next has moved.
    {
      const at = (px, py, w, h) => ({ type: 'click', x: px / w, y: py / h }), tf = join(work, 'target.json')
      const rec = (id, fixtureZip, clicks, viewport) => { const out = join(work, id + '.json'); run(fixtureZip, '--wait', '3', '--viewport', viewport, '--macro', (() => { const f = join(work, id + '-in.json'); writeFileSync(f, JSON.stringify(clicks.map((c, i) => ({ t: 500 + i * 400, ...c })))); return f })(), '--out', out); return JSON.parse(readFileSync(out, 'utf8')) }
      const made = rec('movebutton-rec', movebutton, [at(1075, 40, 1100, 800)], '1100x800'), events = macroFromTrace(made.trace)
      assert.equal(events.length, 1, 'target: the recording run saw the click'); assert.deepEqual([events[0].target.sel, events[0].target.text, events[0].target.role], ['#next', 'Next', 'button'], 'target: a real recording carries the element: ' + JSON.stringify(events))
      const toTwo = r => r.api.some(a => a.el === 'cmi.core.lesson_location' && a.value === '2'), anchors = r => r.trace?.probe?.filter(p => p.type === 'macro-anchor') ?? []
      const play = (events, ...args) => { writeFileSync(tf, JSON.stringify({ format: 'package-lab-macro', version: 2, viewport: { width: 1100, height: 800 }, events })); const out = join(work, 'target-out.json'), r = run(movebutton, '--wait', '3', '--viewport', '600x800', '--macro', tf, '--out', out); return { ...r, trace: JSON.parse(readFileSync(out, 'utf8')).trace } }
      const found = play(events)
      assert.ok(toTwo(found) && !anchors(found).length, 'target: the click finds Next at 600 wide: ' + calls(found) + JSON.stringify(anchors(found)))
      const lost = play([{ ...events[0], target: { ...events[0].target, sel: '#nope' } }])
      assert.ok(!toTwo(lost), 'target: a lost element falls back to the position, which misses at 600 wide')
      assert.deepEqual(anchors(lost).map(p => [p.event, p.found, p.used]), [[0, 0, 'position']], 'target: and leaves a note'); assert.ok(lost.findings.some(f => f.sev === 'info' && f.title === '1 click didn’t find its element and used its recorded position'), 'target: and the finding: ' + titles(lost))
      assert.ok(!toTwo(play([{ t: 500, ...at(1075, 40, 1100, 800) }])), 'target: the same click with no target misses at 600 wide')
      // Secret fields: a click on a password field or a textarea never records its text.
      const f = rec('clickfields-rec', clickfields, [at(80, 30, 800, 600), at(80, 90, 800, 600)], '800x600'), ins = f.trace.probe.filter(p => p.type === 'input' && p.kind === 'click')
      assert.equal(ins.length, 2, 'target: both clicks recorded: ' + JSON.stringify(ins)); assert.deepEqual(ins.map(p => p.target?.sel), ['#pw', '#ta'], 'target: the fields are found by id')
      assert.equal(ins[0].target.text, undefined, 'target: no text for a password field'); assert.equal(ins[1].target.text, 'Notes', 'target: a textarea gives its placeholder'); assert.ok(!JSON.stringify(f.trace.probe).includes('my private notes'), 'target: never the textarea’s content')
    }
    writeFileSync(optFile, JSON.stringify({ macro: [{ t: 1, type: 'tap' }] })); assert.match(node(['run', good, '--options', optFile]).stderr, /type to be click/, 'macro: a bad macro in the options file fails')
    writeFileSync(optFile, '{"nope":1}'); assert.match(node(['run', good, '--macro', optFile]).stderr, /list of events/, 'macro: a bad macro file fails')
    // Typed text: kept only with --record-input, never from the password field (its length only), and keys are not kept for it either.
    const typeMacro = join(work, 'type.json'); writeFileSync(typeMacro, JSON.stringify([{ t: 400, type: 'click', x: 0.278, y: 0.3 }, { t: 700, type: 'text', text: 'abc' }, { t: 1000, type: 'key', key: 'Tab' }, { t: 1300, type: 'text', text: 'hunter2' }]))
    for (const [flag, kept] of [[[], false], [['--record-input'], true]]) {
      const tOut = join(work, 'typing' + kept + '.json'); run(typing, '--wait', '4', '--macro', typeMacro, '--out', tOut, ...flag)
      const inputs = JSON.parse(readFileSync(tOut, 'utf8')).trace.probe.filter(p => p.type === 'input')
      assert.ok(!JSON.stringify(inputs).includes('hunter2'), 'typing: the password is never kept: ' + JSON.stringify(inputs))
      assert.equal(inputs.some(p => p.kind === 'text' && p.text === 'abc'), kept, 'typing: text kept only with --record-input: ' + JSON.stringify(inputs))
      assert.equal(inputs.some(p => p.redacted && p.length === 7), kept, 'typing: a password field is reported by length only, and only when recording text: ' + JSON.stringify(inputs))
      assert.ok(inputs.some(p => p.kind === 'click'), 'typing: the click is kept')
    }
    assert.match(node(['cycle', good, '--browser', 'webkit']).stderr, /Chromium only/, 'cycle: WebKit is refused')
    assert.match(node(['run', good, '--browser', 'webkit', '--macro', macroFile]).stderr, /Chromium only/, 'macro: WebKit is refused')
  }

  if (slow) {   // cmi5 and Tin Can (P4.5): the broken AU, the Tin Can package, and the web interface carrying the statements
    assert.match(node(['run', cmi5Zip, '--wait', '3']).stdout, /xAPI {2}5 statements \(5 stored, 0 rejected\)[\s\S]*launched[\s\S]*terminated[\s\S]*✓ Terminated/, 'cmi5: the text output lists the statements')
    const c5b = run(cmi5BadZip), tb = titles(c5b)
    assert.ok(c5b.findings.some(f => f.sev === 'error' && /^cmi5: The AU sent “completed” before “initialized”/.test(f.title)) && c5b.findings.some(f => f.sev === 'error' && /verb id that isn’t an IRI/.test(f.title)), 'cmi5 broken: both findings: ' + tb)
    assert.equal(c5b.xapi.statements.find(x => x.status === 'rejected').problems[0].path, 'verb.id', 'cmi5 broken: the rejected statement says where')
    const tcOut = join(work, 'tincan-run.json'), tcRun = run(tincanZip, '--out', tcOut), tcSaved = JSON.parse(readFileSync(tcOut, 'utf8'))
    assert.deepEqual(tcRun.xapi.statements.map(x => [x.status, x.statement.verb.id.split('/').pop()]), [['stored', 'experienced'], ['rejected', 'answered'], ['stored', 'completed']], 'tincan: statements listed')
    assert.ok(tcRun.xapi.statements[1].problems.some(p => p.code === 'score-range'), 'tincan: validated'); assert.ok(tcRun.findings.some(f => /^The LRS rejected 1 statement/.test(f.title)), 'tincan: the finding: ' + titles(tcRun))
    assert.deepEqual([tcRun.furthest, tcSaved.trace.lrs.documents.map(d => d.id)], ['completion', ['bookmark']], 'tincan: reaches the completion statement, and its state document is kept')
    assert.ok(!node(['report', tcOut, '--redact']).stdout.includes('example.com'), 'tincan: the redacted report')
    // The same through the handlers (what the apps and the xAPI tab use): upload, launch, the run's trace.lrs, and the saved run opening again.
    const wd = join(work, 'web-cmi5'), srv = spawn(electron, [root, '--serve=0', '--no-window'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, PACKAGE_LAB_DATA: wd }, stdio: ['ignore', 'pipe', 'ignore'] })
    let wlog = ''; srv.stdout.on('data', d => { wlog += d })
    try {
      await until(() => /http:\/\/\S+/.test(wlog), 30000, 'web start')
      const wurl = /http:\/\/\S+/.exec(wlog)[0], wbase = wurl.split('/?')[0], wH = { cookie: (await fetch(wurl, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0] }
      const winvoke = async (name, arg) => { const r = await (await fetch(`${wbase}/api/invoke/${name}`, { method: 'POST', headers: wH, body: JSON.stringify(arg ?? {}) })).json(); if (r.error) throw new Error(r.error); return r.value }
      await fetch(wbase + '/api/upload?name=cmi5.zip', { method: 'POST', headers: wH, body: readFileSync(cmi5Zip) })
      const info = await winvoke('state'); assert.equal(info.pkg.analysis.format, 'cmi5'); assert.equal(info.pkg.items[0].type, 'au')
      await winvoke('launch', { item: 0, auto: 3 })
      let wst
      for (const end = Date.now() + 30000; Date.now() < end; await new Promise(r => setTimeout(r, 500))) { wst = await winvoke('state'); if (wst.runs.length && !wst.running) break }
      assert.equal(wst.runs[0].milestones.at(-1).reached, true, 'web cmi5: terminated'); assert.equal(wst.runs[0].trace.lrs.statements.length, 5, 'web cmi5: the run carries the LRS record')
      const wrep = await winvoke('report-html', { run: wst.runs[0].id, redact: true }); assert.ok(/<h2>xAPI<\/h2>/.test(wrep.html) && !/example\.com/.test(wrep.html), 'web cmi5: the redacted report')
      const sv = await winvoke('saved-runs'); assert.equal((await winvoke('load-run', { file: sv[0].file }))[0].trace.lrs.statements.length, 5, 'web cmi5: the saved run opens with its statements')
    } finally { srv.kill() }
  }

  // The web interface: token, upload, launch, live frames, the run, saved runs.
  const data = join(work, 'web-data')
  const server = spawn(electron, [root, '--serve=0', '--no-window'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, PACKAGE_LAB_DATA: data }, stdio: ['ignore', 'pipe', 'ignore'] })   // ELECTRON_RUN_AS_NODE: these tests may themselves run as Electron-as-Node
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
    for (const extra of [{ origin: 'http://localhost:1' }, { 'sec-fetch-site': 'same-site' }, { origin: 'null' }])
      assert.equal((await fetch(`${base}/api/invoke/state`, { method: 'POST', headers: { ...H, ...extra }, body: '{}' })).status, 403, `web: a POST from another origin is refused (${JSON.stringify(extra)})`)
    assert.equal((await fetch(`${base}/api/invoke/state`, { method: 'POST', headers: { ...H, origin: base, 'sec-fetch-site': 'same-origin' }, body: '{}' })).status, 200, 'web: a POST from its own page is let through')
    // E3.3: the doc handler inlines the guide's PNGs, so a doc comes with no image paths left to fetch.
    const guide = await invoke('doc', { name: 'help/getting-started.md' })
    assert.ok(guide.includes('](data:image/png;base64,') && !/\]\(\.\.\/images\//.test(guide), 'web: the doc handler inlines the guide images')
    const macrosDoc = await invoke('doc', { name: 'help/macros.md' })
    assert.ok(macrosDoc.includes('](data:image/png;base64,'), 'web: a page with images inlines them')
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
    // Named macros over the handlers (E4.2): store, list, load, delete; names that could leave the folder or aren't names are refused; nothing plays without a run.
    {
      const evs2 = [{ t: 400, type: 'wait', text: 'Next' }, { t: 400, type: 'click', x: 0.631, y: 0.328, target: { sel: 'button#next', text: 'Next' } }], vp2 = { width: 1100, height: 800 }
      assert.deepEqual(await invoke('macro-list'), [], 'web: no saved macros yet')
      assert.deepEqual(await invoke('macro-store', { name: 'next', events: evs2, viewport: vp2 }), { name: 'next', size: vp2, steps: 2 }, 'web: macro-store')
      assert.equal(readFileSync(join(data, 'macros', 'good.zip', 'next.json'), 'utf8'), JSON.stringify(macroFileOf(evs2, vp2)), 'web: the saved file is the version 2 file of the edited list, byte for byte')
      await invoke('macro-store', { name: 'Second one.v2', events: [evs2[1]] })
      assert.deepEqual((await invoke('macro-list')).map(m => [m.name, m.size, m.steps]), [['Second one.v2', null, 1], ['next', vp2, 2]], 'web: macro-list gives names, sizes and step counts')
      assert.deepEqual(await invoke('macro-load', { name: 'next' }), { events: evs2, viewport: vp2 }, 'web: macro-load')
      assert.deepEqual(await invoke('macro-edit', { events: evs2, viewport: vp2, op: 'move', i: 0, dir: 1 }).then(r => r.rows.map(x => x.action)), ['Click', 'Wait'], 'web: macro-edit gives the rows')
      await assert.rejects(invoke('macro-edit', { events: evs2, op: 'set', i: 1, patch: { x: 9 } }), /x to be a number from 0 to 1/, 'web: macro-edit refuses a bad value')
      await assert.rejects(invoke('macro-store', { name: 'bad', events: [{ t: 1, type: 'click' }] }), /x to be a number/, 'web: a bad macro isn’t stored')
      for (const bad of ['../x', '.hidden', 'a/b', 'x'.repeat(61), '']) {
        await assert.rejects(invoke('macro-store', { name: bad, events: evs2 }), /name|dot|characters|letters/, `web: macro-store refuses ${JSON.stringify(bad)}`)
        await assert.rejects(invoke('macro-load', { name: bad }), /./, `web: macro-load refuses ${JSON.stringify(bad)}`); await assert.rejects(invoke('macro-delete', { name: bad }), /./, `web: macro-delete refuses ${JSON.stringify(bad)}`)
      }
      assert.equal(existsSync(join(data, 'macros', 'x.json')) || existsSync(join(data, 'macros', 'good.zip', '.hidden.json')), false, 'web: nothing was written outside the name')
      await assert.rejects(invoke('macro-load', { name: 'nothing' }), /no macro called nothing/, 'web: loading a name that isn’t there')
      assert.equal(await invoke('macro-delete', { name: 'Second one.v2' }), true); assert.deepEqual((await invoke('macro-list')).map(m => m.name), ['next'], 'web: macro-delete')
      assert.deepEqual(await invoke('macro-file', { events: evs2, viewport: vp2 }), macroFileOf(evs2, vp2), 'web: macro-file is what Export saves')
      assert.deepEqual(await invoke('macro-parse', { text: JSON.stringify(macroFileOf(evs2, vp2)) }), { events: evs2, viewport: vp2 }, 'web: macro-parse is what Import reads')
      await assert.rejects(invoke('macro-parse', { text: 'not json' }), /isn’t JSON/, 'web: Import refuses a file that isn’t JSON'); await assert.rejects(invoke('macro-parse', { text: '{"a":1}' }), /list of events/, 'web: or one that isn’t a macro')
      await assert.rejects(invoke('macro-export', {}), /./, 'web: Export… (dialog) is desktop only'); await assert.rejects(invoke('macro-import', {}), /./, 'web: Import… (dialog) is desktop only')
      await assert.rejects(invoke('macro-play', { events: evs2 }), /Launch first/, 'web: macro-play with no run is refused')
      await invoke('macro-delete', { name: 'next' })
    }
    // An experiment through the handlers: two runs (default and one variant), announced as 'experiment' events.
    const evs = await fetch(base + '/api/events', { headers: H }), evReader = evs.body.getReader()
    let evText = ''
    assert.equal((await invoke('experiment-presets')).join(), 'api,frames,standard,lms,storage,browsers', 'web: presets')
    assert.match((await invoke('options', { storage: 'blocked' })).command, / --storage blocked$/, 'web: the storage option in the CLI line')
    assert.deepEqual(Object.keys(await invoke('profiles')), PROFILE_NAMES, 'web: profiles')
    assert.match((await invoke('options', { profile: { base: 'docebo', apiDelay: 100 } })).command, / --profile-file profile\.json$/, 'web: a custom profile in options')
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
    assert.equal(po.command, "package-lab run gated.zip --item 1 --pin previewMode=false --answer '/api/*=404:{}' --launch-params a=1", 'web: options handler builds the pin and answer flags')
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
      assert.ok(existsSync(done.result.file) && JSON.parse(readFileSync(done.result.file, 'utf8')).format === 'package-lab-discovery', 'web: the result is saved')
    }
    // Drill-down over the handlers (slow): an untraced run of levels, traced again, watched, then the chain.
    if (slow) {
      assert.equal((await fetch(base + '/api/upload?name=levels.zip', { method: 'POST', headers: H, body: readFileSync(levels) })).status, 200)
      const n0 = (await invoke('state')).runs.length
      await invoke('launch', { item: 0, auto: 3 })
      let plain
      for (let end = Date.now() + 30000; Date.now() < end; await new Promise(r => setTimeout(r, 500))) { const s4 = await invoke('state'); if (!s4.running && s4.runs.length === n0 + 1) { plain = s4.runs.at(-1); break } }
      const drEvs = await fetch(base + '/api/events', { headers: H }), drReader = drEvs.body.getReader()
      let drText = ''
      assert.equal(await invoke('drill-start', { run: plain.id }), true, 'web: drill-down starts')
      await assert.rejects(invoke('drill-start', { run: plain.id }), /already running/, 'web: one at a time')
      while (!/event: drill\ndata: \{"state":"(done|error)".*\n/.test(drText)) drText += new TextDecoder().decode((await drReader.read()).value)
      drReader.cancel()
      const dd = JSON.parse(/event: drill\ndata: (\{"state":"done".*)\n/.exec(drText)?.[1] ?? 'null')
      assert.ok(dd?.result.cause?.kind === 'file' && dd.result.chain.at(-1).file === 'data/config.json' && dd.result.traceRun && dd.result.watchRun, 'web: drill-down result: ' + drText.slice(-800))
      assert.equal((drText.match(/"state":"step"/g) ?? []).length, forced ? 1 : 2, 'web: traced again (unless every run is traced), then watched')
    }
    // Macros and Test saving over the handlers (slow): Record clicks keeps what goes through live-input with its time, the probe saw the
    // same click, and the cycle runs twice and says what it found, as 'cycle' events.
    if (slow) {
      assert.equal((await fetch(base + '/api/upload?name=good.zip', { method: 'POST', headers: H, body: readFileSync(good) })).status, 200)
      assert.equal(await invoke('macro-record', { on: true }), true, 'web: recording starts')
      await invoke('launch', { item: 0, auto: 6 })
      await new Promise(r => setTimeout(r, 1500))
      // live-hit (E4.1): the element at Next's position, nothing or a body outside the content, bad numbers clamped; live-watch counts up and down, never below 0.
      assert.equal((await invoke('live-hit', { x: 0.631, y: 0.328 }))?.text, 'Next', 'web: live-hit finds Next')
      const away = await invoke('live-hit', { x: 0.99, y: 0.99 }); assert.ok(away === null || /^(body|html)/i.test(away.sel) || away.role === 'body', 'web: live-hit outside the content: ' + JSON.stringify(away))
      await invoke('live-hit', { x: '1);throw 1;(', y: {} })
      assert.equal((await invoke('state')).liveWatchers, 0, 'web: nobody watches'); await assert.rejects(invoke('live-watch', { on: true }), /./, 'web: live-watch is desktop only')
      assert.equal((await invoke('state')).liveWatchers, 0, 'web: and it changed nothing')
      assert.equal(await invoke('live-input', { type: 'click', x: 0.631, y: 0.328 }), true)
      const saved = await invoke('macro-save'), rec = saved.events
      assert.ok(Number.isInteger(saved.viewport?.width) && saved.viewport.width > 100 && saved.viewport.height > 100, 'web: the macro has the window size: ' + JSON.stringify(saved.viewport))
      assert.deepEqual(rec.map(e => [e.type, e.x, e.y]), [['click', 0.631, 0.328]], 'web: the click is recorded'); assert.ok(rec[0].t >= 1000 && rec[0].t < 6000, 'web: with its time into the run: ' + rec[0].t)
      await invoke('live-input', { type: 'click', x: 0.2, y: 0.2 })
      assert.equal((await invoke('macro-save')).events.length, 1, 'web: saving stops recording: a later click is not added')
      const mid = await invoke('stop'), fromRun = await invoke('macro-from-run', { run: mid }), seen = fromRun.events
      assert.ok(seen.length === 2 && seen[0].type === 'click' && Math.abs(seen[0].x - 0.631) < 0.01 && Math.abs(seen[0].y - 0.328) < 0.02, 'web: the probe saw both clicks, recorded or not: ' + JSON.stringify(seen))
      assert.deepEqual(fromRun.viewport, saved.viewport, 'web: macro-from-run has the run window’s size')
      await assert.rejects(invoke('macro-from-run', { run: 9999 }), /Choose a run/, 'web: macro-from-run needs a run')
      await assert.rejects(invoke('options', { macro: [{ t: 0, type: 'click' }] }), /x to be a number/, 'web: a bad macro is refused')
      assert.match((await invoke('options', { macro: rec })).command, / --macro macro\.json$/, 'web: the macro in the CLI line')
      const cEvs = await fetch(base + '/api/events', { headers: H }), cReader = cEvs.body.getReader()
      let cText = ''
      assert.equal(await invoke('cycle-start', { item: 0, wait: 4, macro: rec, macroSize: saved.viewport }), true, 'web: the cycle starts')
      await assert.rejects(invoke('cycle-start', { item: 0 }), /already running/, 'web: one at a time')
      while (!/event: cycle\ndata: \{"state":"(done|error)".*\n/.test(cText)) cText += new TextDecoder().decode((await cReader.read()).value)
      cReader.cancel()
      const cd = JSON.parse(/event: cycle\ndata: (\{"state":"done".*)\n/.exec(cText)?.[1] ?? 'null')
      assert.ok(cd && cd.runs.length === 2 && cd.findings.map(f => f.title).join() === 'Saving and resuming worked' && cd.rows.find(r => r.label === 'Entry offered').b === 'resume', 'web: the cycle result: ' + cText.slice(-600))
      assert.equal((cText.match(/"state":"run"/g) ?? []).length, 2, 'web: an event for each run')
      await assert.rejects(invoke('cycle-start', { item: 0, browser: 'webkit' }), /Chromium only/, 'web: the cycle refuses WebKit')
      await assert.rejects(invoke('launch', { item: 0, browser: 'webkit', macro: rec }), /Chromium only/, 'web: a macro refuses WebKit')
      // macro-play (E4.2): from step 2 of two steps on a running course plays only Save and exit; one part plays at a time.
      {
        const two = [{ t: 400, type: 'click', x: 0.631, y: 0.328 }, { t: 900, type: 'click', x: 0.73, y: 0.328 }], nRuns = (await invoke('state')).runs.length
        await invoke('launch', { item: 0, auto: 8 })
        await new Promise(r => setTimeout(r, 1500))
        await assert.rejects(invoke('macro-play', { events: two, from: 5 }), /Choose a step/, 'web: macro-play needs a step that exists')
        await assert.rejects(invoke('macro-play', { events: two, from: 1.5 }), /whole step numbers/, 'web: macro-play refuses a fraction'); await assert.rejects(invoke('macro-play', { events: two, from: 0, to: '2' }), /whole step numbers/, 'web: and a string')
        assert.equal(await invoke('macro-play', { events: [{ t: 0, type: 'wait', text: 'never on this page', timeout: 3000 }, two[0]], from: 0, to: 1 }), true, 'web: macro-play starts')
        await assert.rejects(invoke('macro-play', { events: two, from: 1 }), /already playing/, 'web: one part at a time')
        await new Promise(r => setTimeout(r, 3800))   // the wait times out at 3 s
        assert.equal(await invoke('macro-play', { events: two, from: 1 }), true, 'web: macro-play from step 2')
        await new Promise(r => setTimeout(r, 1500))
        await invoke('stop')
        const r2 = (await invoke('state')).runs[nRuns], calls = r2.trace.probe.filter(p => p.type === 'api').map(a => a.call + ' ' + a.el)
        assert.equal(calls.filter(c => c === 'LMSSetValue cmi.core.lesson_location').length, 1, 'web: only the start set the location, so Next wasn’t played: ' + calls)
        assert.ok(calls.includes('LMSSetValue cmi.core.exit') && calls.includes('LMSFinish '), 'web: Save and exit was played: ' + calls)
        assert.ok(r2.trace.probe.some(p => p.type === 'macro-wait'), 'web: the first part’s wait timed out and was noted')
      }
    }
    // A WebKit run over the handlers (slow, with Playwright): the options line, the run through the CLI's Node path, and Stop.
    if (slow && !forced && wkReady) {
      assert.equal((await fetch(base + '/api/upload?name=good.zip', { method: 'POST', headers: H, body: readFileSync(good) })).status, 200)
      assert.equal((await invoke('options', { browser: 'webkit', viewport: 'iphone' })).command, 'package-lab run good.zip --browser webkit --viewport iphone', 'web: browser and device size in the CLI line')
      assert.equal((await invoke('options', { viewport: 'custom' }).catch(e => e)).message?.match(/viewport/)?.[0], 'viewport', 'web: a bad device size is refused')
      const nw = (await invoke('state')).runs.length
      await invoke('launch', { item: 0, auto: 3, browser: 'webkit', viewport: 'iphone' })
      let wr
      for (let end = Date.now() + 40000; Date.now() < end; await new Promise(r => setTimeout(r, 500))) { const s5 = await invoke('state'); if (!s5.running && s5.runs.length === nw + 1) { wr = s5.runs[nw]; break } }
      assert.ok(wr && wr.trace.browser === 'webkit' && / · webkit · iphone$/.test(wr.label) && wr.launch.options.browser === 'webkit' && wr.milestones.find(m => m.id === 'wrote').reached, 'web: a WebKit run is shown like any run: ' + wr?.label)
      await invoke('launch', { item: 0, browser: 'webkit' })   // no auto-stop: until stopped
      await new Promise(r => setTimeout(r, 1500))
      assert.ok((await invoke('state')).running, 'web: the WebKit run goes on until stopped')
      assert.ok(await invoke('stop'), 'web: Stop ends it with a run')
      assert.equal((await invoke('state')).runs.length, nw + 2, 'web: the stopped WebKit run is recorded')
    }
    // The corrected package as a download (P3.1, slow): the changed files go in, the zip is valid, and with nothing to fix it says so.
    if (slow) {
      assert.equal((await fetch(base + '/api/upload?name=blank.zip', { method: 'POST', headers: H, body: readFileSync(blank) })).status, 200)
      await invoke('override-set', { path: 'notes.txt', content: 'from the web' })
      const dl = await fetch(base + '/api/export', { headers: H }), sum = JSON.parse(decodeURIComponent(dl.headers.get('x-package-lab-summary'))), dlBuf = Buffer.from(await dl.arrayBuffer())
      assert.ok(dl.status === 200 && dl.headers.get('content-type') === 'application/zip' && /attachment; filename="blank-fixed\.zip"/.test(dl.headers.get('content-disposition')), 'web export: a zip download: ' + dl.status + ' ' + dl.headers.get('content-disposition'))
      assert.ok(sum.file === 'blank-fixed.zip' && sum.applied.includes('case') && sum.gone >= 1, 'web export: summary: ' + JSON.stringify(sum))
      const dlFile = join(work, 'web-fixed.zip'); writeFileSync(dlFile, dlBuf); assert.equal(unzipT(dlFile).status, 0, 'web export: unzip -t')
      const dlFiles = unzip(dlBuf); assert.ok(dlFiles.has('js/app.js') && dlFiles.get('notes.txt').toString() === 'from the web' && dlFiles.has('PACKAGE-LAB-CHANGES.txt'), 'web export: includes the fixes, the overrides and the change list')
      assert.equal((await fetch(base + '/api/export?only=nope', { headers: H })).status, 500, 'web export: an unknown fix is an error')
      const noFix = await fetch(base + '/api/export?only=', { headers: H }), noFixFiles = unzip(Buffer.from(await noFix.arrayBuffer()))
      assert.ok(noFix.status === 200 && noFixFiles.has('js/App.js') && noFixFiles.get('notes.txt') && !noFixFiles.has('js/app.js'), 'web export: an empty list of fixes keeps only the changed files')
      assert.equal(/filename\*=UTF-8''blank-fixed\.zip$/.test(dl.headers.get('content-disposition')), true, 'web export: filename* ends the header')
      await assert.rejects(invoke('export-fixed'), /not found|Not found|invoke/i, 'web export: the save-dialog handler is desktop only')
      await assert.rejects(invoke('check-folder'), /not found|Not found|invoke/i, 'web: check a folder is desktop only')
      await assert.rejects(invoke('open-batch-row', { path: good }), /not found|Not found|invoke/i, 'web: opening a batch row is desktop only')
      assert.equal((await fetch(base + '/api/upload?name=good.zip', { method: 'POST', headers: H, body: readFileSync(good) })).status, 200)
      const none = await fetch(base + '/api/export', { headers: H }); assert.ok(none.status === 500 && /Nothing to change/.test((await none.json()).error), 'web export: nothing to change says so')
      assert.equal((await fetch(base + '/api/export')).status, 401, 'web export: needs the token')
    }
    console.log('web: ok')
  } finally { server.kill() }

  // The Concierge module, if the concierge repo is next to this one.
  const mod = join(root, '..', 'concierge', 'modules', 'package-lab', 'run')
  if (existsSync(mod)) {
    const t0 = Date.now(), dataDir = mkdtempSync(join(tmpdir(), 'package-lab-concierge-'))
    writeFileSync(join(dataDir, 'config.json'), JSON.stringify({ packagelab: root, node: process.execPath }))
    const cgiRaw = (method, path, query = '', input = '') => spawnSync(mod, [], { cwd: dataDir, input, encoding: input instanceof Buffer ? undefined : 'utf8', timeout: 60000,
      env: { HOME: process.env.HOME, USER: process.env.USER, PATH: '/usr/bin:/bin', CONCIERGE_BASE: '/m/package-lab', CONCIERGE_CSRF: 'tok', CONCIERGE_MODULE: join(mod, '..'), REQUEST_METHOD: method, PATH_INFO: path, QUERY_STRING: query } })
    const cgi = (method, path, query = '', input = '') => {
      const r = cgiRaw(method, path, query, input)
      assert.equal(r.status, 0, `module ${path}: ${r.stderr}`)
      return String(r.stdout)
    }
    const waitFor = async (f, re, ms = 90000) => { let page = ''; for (const end = Date.now() + ms; Date.now() < end && !re.test(page); await new Promise(r => setTimeout(r, 1000))) page = f(); assert.match(page, re, 'module: waited for ' + re); return page }
    const fileOf = out => { const m = /^Concierge-File: (.*)$/m.exec(out); assert.ok(m && existsSync(m[1]), 'module: a file to download: ' + out); return m[1] }
    const form = (path, body) => cgi('POST', path, '', 'csrf=tok&' + body)
    assert.match(cgi('POST', '/upload', 'name=blank.zip', readFileSync(blank)), /data-package-lab-id="1"/)
    assert.match(cgi('GET', '/pkg', 'id=1'), /wrong capitals/, 'module: static report')
    cgi('POST', '/run', '', 'csrf=tok&id=1&item=1&api=manifest&depth=0&wait=10')
    let page = ''
    for (const end = Date.now() + 60000; Date.now() < end && !/Download the report/.test(page); await new Promise(r => setTimeout(r, 1000))) page = cgi('GET', '/show', 'id=1&run=1')
    assert.match(page, /blank page/, 'module: run report')
    assert.match(cgi('GET', '/widget'), /badge err/, 'module: widget')
    assert.match(cgi('GET', '/download', 'id=1&run=1&what=run'), /^Concierge-File: \/.*\.json/, 'module: download')
    // P5.1: the run form, escaping, CSRF on every form, overrides, fixes, diffs, redacted report (all without running anything more).
    {
      const doctor = JSON.parse(node(['doctor', '--json']).stdout)
      const pkgPage = cgi('GET', '/pkg', 'id=1')
      for (const re of [/name="profile"/, /name="browser"|Chromium/, /name="viewport"/, /name="storage"/, /name="tool"/, /name="trace"[^>]*checked/, /Test saving/, /Try variants/, /Corrected package/, /Change what the content gets/]) assert.match(pkgPage, re, 'module: run form has ' + re)
      assert.equal(/value="webkit"/.test(pkgPage), doctor.capabilities.webkit, 'module: WebKit is offered only if doctor says so')
      assert.ok(/value="moodle"/.test(pkgPage) && /value="blocked"/.test(pkgPage) && /value="iphone"/.test(pkgPage), 'module: profile, storage and device lists')
      assert.match(pkgPage, /value="case" checked/, 'module: the fix the files showed is ticked')
      const same = page => assert.equal((page.match(/<form method="post"/g) ?? []).length, (page.match(/name="csrf" value="tok"/g) ?? []).length, 'module: every POST form carries the CSRF token')
      same(pkgPage)
      // Escaping: a package named with HTML shows as text, in the list and on its page.
      assert.match(cgi('POST', '/upload', 'name=' + encodeURIComponent('x<img src=x onerror=alert(1)>.zip'), readFileSync(blank)), /data-package-lab-id="2"/)
      for (const page of [cgi('GET', '/'), cgi('GET', '/pkg', 'id=2')]) assert.ok(page.includes('x&lt;img src=x onerror=alert(1)&gt;') && !page.includes('<img src=x'), 'module: names are escaped')
      assert.match(cgi('POST', '/upload', 'name=good.zip', readFileSync(good)), /data-package-lab-id="3"/)
      // Overrides: the path is checked, the file is kept under a number.
      for (const bad of ['../x', '/etc/passwd', 'a/../b', 'a=b', '']) assert.match(cgi('POST', '/override', 'id=1&path=' + encodeURIComponent(bad), 'x'), /class="error"/, 'module: override path refused: ' + bad)
      assert.match(cgi('POST', '/override', 'id=1&path=notes.txt', 'from the module'), /<p>ok<\/p>/)
      assert.deepEqual(readdirSync(join(dataDir, 'packages', '1', 'overrides')), ['1'], 'module: replacement files are kept by number')
      // A second upload for the same path replaces the stored file (the old one is deleted); an over-size file is refused and leaves nothing.
      assert.match(cgi('POST', '/override', 'id=1&path=notes.txt', 'from the module'), /<p>ok<\/p>/)
      assert.deepEqual(readdirSync(join(dataDir, 'packages', '1', 'overrides')), ['2'], 'module: the replaced file is deleted')
      assert.match(cgi('POST', '/override', 'id=1&path=big.bin', Buffer.alloc(51 * 1024 * 1024)), /class="error">[^<]*over 50\.0 MB/, 'module: an upload is capped')
      assert.deepEqual(readdirSync(join(dataDir, 'packages', '1', 'overrides')), ['2'], 'module: a refused upload leaves no file')
      assert.match(form('/ovr', 'id=1&action=pin&name=previewMode&value=false'), /previewMode<\/code> is pinned to <code>false/)
      assert.match(form('/ovr', 'id=1&action=pin&name=previewMode&value=nope'), /class="error">[^<]*JSON/, 'module: a pin needs JSON')
      assert.match(form('/ovr', 'id=1&action=pin&name=a%3Db&value=1'), /class="error"/, 'module: a pin name has no =')
      assert.match(form('/ovr', 'id=1&action=answer&pattern=%2Fapi%2Fx&status=200&body=%7B%7D'), /\/api\/x<\/code> answers 200/)
      assert.match(form('/ovr', 'id=1&action=answer&pattern=a%3Db&status=200&body=1'), /class="error"/, 'module: a response pattern has no =')
      const withOvr = cgi('GET', '/pkg', 'id=1'); same(withOvr)
      assert.match(withOvr, /name="ovr" checked/, 'module: the form offers to use the overrides')
      assert.match(form('/ovr', 'id=1&action=remove&kind=pins&idx=0'), /Saved/)
      assert.deepEqual(JSON.parse(readFileSync(join(dataDir, 'packages', '1', 'overrides.json'), 'utf8')).pins, [], 'module: a pin can be removed')
      // Fix: the ticked fixes and the replacement file, in a zip that passes unzip -t.
      const fixPage = form('/fix', 'id=1&fix=case&fix=http-to-https')
      assert.match(fixPage, /Download the corrected package/); assert.match(fixPage, /Findings cleared/)
      const fixed = fileOf(cgi('GET', '/download', 'id=1&what=fixed'))
      assert.equal(unzipT(fixed).status, 0, 'module: the corrected package is a valid zip')
      const fixedFiles = unzip(readFileSync(fixed)); assert.ok(fixedFiles.has('js/app.js') || [...fixedFiles.keys()].some(k => /app\.js$/i.test(k)), 'module: the fix is in it'); assert.equal(fixedFiles.get('notes.txt')?.toString(), 'from the module', 'module: so is the replacement file')
      assert.match(form('/fix', 'id=1&fix=nope'), /Tick at least one fix/, 'module: an unknown fix is not run')
      // Diff against another upload, and its report.
      assert.match(cgi('GET', '/diff', 'id=1&other=3'), /Compare them/, 'module: a GET makes no comparison'); assert.match(cgiRaw('GET', '/download', 'id=1&other=3&what=diff').stderr, /Compare the two packages first/)
      const diffPage = form('/diff', 'id=1&other=3'); assert.match(diffPage, /<h2>Files<\/h2>/); assert.match(diffPage, /Download the diff as a report/)
      assert.match(readFileSync(fileOf(cgi('GET', '/download', 'id=1&other=3&what=diff')), 'utf8'), /<html/i, 'module: the diff report is a page')
      assert.match(form('/diff', 'id=1&other=99'), /No such package/); assert.match(cgi('GET', '/diff', 'id=1&other=3'), /<h2>Files<\/h2>/, 'module: the comparison is kept')
      // Ids are ASCII digits only.
      for (const q of ['id=%D9%A1', 'id=%C2%B2']) assert.match(cgi('GET', '/pkg', q), /No such package/, 'module: a non-ASCII digit is not an id: ' + q)
      assert.match(cgi('GET', '/show', 'id=1&run=%D9%A1'), /No such run/)
      // Downloads that need node are made by a POST, then served; a GET never makes them.
      assert.match(cgiRaw('GET', '/download', 'id=1&item=1&what=static').stderr, /Make the report first/)
      assert.match(form('/make', 'id=1&item=1'), /Made/); fileOf(cgi('GET', '/download', 'id=1&item=1&what=static'))
      // Report fragments from the CLI escape the package's own text.
      const htmlPkg = fixture('htmltitle', d => { sub(d, 'imsmanifest.xml', 'Fire Safety Basics (sample)', '&lt;img src=x onerror=alert(1)&gt;'); sub(d, 'imsmanifest.xml', 'Lesson and quiz', '&lt;script&gt;alert(2)&lt;/script&gt;') })
      assert.match(cgi('POST', '/upload', 'name=html.zip', readFileSync(htmlPkg)), /data-package-lab-id="4"/)
      const htmlPage = cgi('GET', '/pkg', 'id=4')
      assert.ok(/&lt;script&gt;alert\(2\)|&lt;img src=x/.test(htmlPage) && !htmlPage.includes('<img src=x') && !htmlPage.includes('<script>alert(2)'), 'module: the package page escapes the package text')
      // Limits: at most three workers at once, and a package count.
      const fake = (id, extra = {}) => { const d = join(dataDir, 'packages', '1', 'runs', String(id)); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'job.json'), JSON.stringify({ item: 1, api: 'manifest', depth: 0, wait: 10, started: Date.now() / 1000, ...extra })); return d }
      const busy = [91, 92, 93].map(id => { const d = fake(id); writeFileSync(join(d, 'worker.pid'), String(process.pid)); return d })
      for (const [path, body] of [['/run', 'id=1&item=1&wait=10'], ['/exp', 'id=1&item=1&preset=storage&wait=10'], ['/task', 'id=1&run=1&what=drill']]) {
        const r = cgiRaw('POST', path, '', 'csrf=tok&' + body)
        assert.ok(r.status === 1 && /at most 3 at once/.test(r.stderr), `module: ${path} refused at the limit: ${r.stderr}`)
      }
      assert.deepEqual(readdirSync(join(dataDir, 'packages', '1', 'runs')).sort(), ['1', '91', '92', '93'], 'module: a refused run leaves no folder')
      assert.match(cgiRaw('POST', '/delete', '', 'csrf=tok&id=1').stdout, /still going/, 'module: a package with a live worker is not deleted')
      for (const d of busy) rmSync(d, { recursive: true, force: true })
      // Run again on a Test saving run stays Test saving.
      const cyc = fake(95, { mode: 'cycle' }); writeFileSync(join(cyc, 'done.json'), '{"ok":true}'); writeFileSync(join(cyc, 'summary.json'), JSON.stringify({ cycle: true, verdict: { sev: 'ok', title: 'x' }, rows: [], findings: [] })); writeFileSync(join(cyc, 'run.json'), '{}'); writeFileSync(join(cyc, 'report.html'), '<p>r</p>')
      assert.match(cgi('GET', '/show', 'id=1&run=95'), /name="mode" value="cycle"/, 'module: Run again keeps Test saving')
      assert.doesNotMatch(cgi('GET', '/show', 'id=1&run=1'), /name="mode" value="cycle"/)
      rmSync(cyc, { recursive: true, force: true })
      const stubs = []; for (let k = 100; readdirSync(join(dataDir, 'packages')).filter(x => /^\d+$/.test(x)).length < 50; k++) { mkdirSync(join(dataDir, 'packages', String(k))); stubs.push(k) }
      const many = cgiRaw('POST', '/upload', 'name=more.zip', 'x'); assert.ok(many.status !== 0 && /50 packages/.test(many.stderr), 'module: at most 50 packages: ' + many.stderr)
      for (const k of stubs) rmSync(join(dataDir, 'packages', String(k)), { recursive: true, force: true })
      // The finished run: Milestones first, then the downloads, what it waited for, Drill-down and Server needs; and the redacted report.
      const runPage = cgi('GET', '/show', 'id=1&run=1'); same(runPage)
      assert.ok(runPage.indexOf('<h2>Milestones</h2>') > 0 && runPage.indexOf('<h2>Milestones</h2>') < runPage.indexOf('Download the report'), 'module: Milestones come first')
      for (const re of [/<h2>What it waited for<\/h2>/, /<h2>Drill-down<\/h2>[\s\S]*Work out why it stopped/, /<h2>Server needs<\/h2>[\s\S]*>Discover</, /Download the report with the course content taken out/]) assert.match(runPage, re, 'module: run page has ' + re)
      const plain = readFileSync(fileOf(cgi('GET', '/download', 'id=1&run=1&what=report')), 'utf8'), red = readFileSync(fileOf(cgi('GET', '/download', 'id=1&run=1&what=redacted')), 'utf8')
      assert.ok(red !== plain && /redact|taken out|removed/i.test(red), 'module: the redacted report differs from the plain one')
      assert.match(cgiRaw('GET', '/download', 'id=1&run=1&what=../../x').stderr, /No such download/, 'module: only known downloads')
      assert.ok(cgiRaw('POST', '/delete', '', 'csrf=tok&id=3').status === 0 && !existsSync(join(dataDir, 'packages', '3')), 'module: delete')
    }
    if (slow) {   // P5.1 end to end: the form's settings reach the CLI, Test saving, Try variants, Drill-down and Discover.
      cgi('POST', '/ovr', '', 'csrf=tok&id=1&action=pin&name=previewMode&value=false')
      cgi('POST', '/run', '', 'csrf=tok&id=1&item=1&api=manifest&depth=0&wait=10&profile=moodle&storage=blocked&viewport=iphone&trace=on&ovr=on')
      const job = JSON.parse(readFileSync(join(dataDir, 'packages', '1', 'runs', '2', 'job.json'), 'utf8'))
      assert.deepEqual([job.profile, job.storage, job.viewport, job.trace, job.pins.length, job.files.length], ['moodle', 'blocked', 'iphone', true, 1, 1], 'module slow: the form reaches the job')
      const done = await waitFor(() => cgi('GET', '/show', 'id=1&run=2'), /Download the report/)
      assert.match(done, /LMS: moodle[\s\S]*device iphone[\s\S]*traced/, 'module slow: settings shown')
      const saved = JSON.parse(readFileSync(join(dataDir, 'packages', '1', 'runs', '2', 'run.json'), 'utf8')).launch.options
      assert.deepEqual([saved.profile, saved.storage, saved.pins.length, Object.keys(saved.files)], ['moodle', 'blocked', 1, ['notes.txt']], 'module slow: the CLI got the settings')
      assert.ok(saved.trace, 'module slow: traced')
      // Drill-down and Discover on the run.
      form('/task', 'id=1&run=2&what=drill')
      assert.match(await waitFor(() => cgi('GET', '/show', 'id=1&run=2'), /Work it out again/), /<h2>Drill-down<\/h2>/)
      assert.ok(existsSync(join(dataDir, 'packages', '1', 'runs', '2', 'tools', 'drill', 'result.json')), 'module slow: the drill result is kept')
      assert.match(cgiRaw('POST', '/task', '', 'csrf=tok&id=1&run=2&what=rm').stderr, /finished run/, 'module slow: only drill and discover')
      form('/task', 'id=1&run=2&what=discover')
      assert.match(await waitFor(() => cgi('GET', '/show', 'id=1&run=2'), /Discover again/), /<h2>Server needs<\/h2>/)
      form('/run', 'id=4&item=1&wait=10')
      const htmlRun = await waitFor(() => cgi('GET', '/show', 'id=4&run=1'), /Download the report/)
      assert.ok(!htmlRun.includes('<img src=x') && !htmlRun.includes('<script>alert(2)'), 'module slow: the run page escapes the package text')
      // Test saving: two runs, one table.
      form('/run', 'id=1&item=1&api=manifest&depth=0&wait=10&mode=cycle')
      const cyc = await waitFor(() => cgi('GET', '/show', 'id=1&run=3'), /Run 2: resumes/)
      assert.ok(cyc.indexOf('<h2>Test saving</h2>') < cyc.indexOf('Download the report') && !/Drill-down/.test(cyc), 'module slow: Test saving shows its table at the top')
      // Try variants: a table that fills in as runs finish.
      form('/exp', 'id=1&item=1&preset=storage&wait=10')
      const expPage = await waitFor(() => cgi('GET', '/exp', 'id=1&exp=1'), /Against the default/)
      assert.match(expPage, /storage blocked/); assert.match(cgi('GET', '/expframe', 'id=1&exp=1'), /"state": ?"done"|&quot;state&quot;: ?&quot;done&quot;/)
      assert.match(cgi('GET', '/pkg', 'id=1'), /Experiment 1/)
      assert.match(cgi('GET', '/pkg', 'id=1'), /Test saving/)
      console.log('concierge module (slow): ok')
    }
    console.log(`concierge module: ok (${Math.round((Date.now() - t0) / 1000)} s)`)
  } else console.log('concierge module: skipped (no ../concierge)')

  // Tracing (slow): the overhead on good (when its page has loaded, the median of three runs), and every end-to-end
  // check again with every run traced (PACKAGE_LAB_FORCE_TRACE=1).
  if (slow && !forced) {
    const loaded = (...a) => { const o = join(work, 'overhead.json'); run(good, '--out', o, ...a); return JSON.parse(readFileSync(o, 'utf8')).trace.probe.find(p => p.type === 'dom' && p.readyState === 'complete' && /lesson\.html/.test(p.frame))?.t }
    const median = f => [f(), f(), f()].sort((a, b) => a - b)[1], plainMs = median(() => loaded()), tracedMs = median(() => loaded('--trace'))
    console.log(`trace overhead: good loaded in ${plainMs} ms, ${tracedMs} ms traced`)
    assert.ok(tracedMs < 2 * plainMs + 50, `trace: under twice the time (${plainMs} → ${tracedMs} ms)`)
    const t0 = Date.now(), all = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--slow'], { env: { ...process.env, PACKAGE_LAB_FORCE_TRACE: '1' }, encoding: 'utf8', maxBuffer: 64 * 1024 ** 2 })
    assert.equal(all.status, 0, 'forced trace pass:\n' + all.stdout.slice(-2000) + all.stderr.slice(-4000))
    console.log(`forced trace pass: ok (${Math.round((Date.now() - t0) / 1000)} s)`)
  }
  // The desktop window (E0.1): test/ui.js opens the app, clicks through it and fails if a visible behaviour breaks.
  if (slow && !forced) {
    const ui = spawnSync(process.execPath, [join(root, 'test', 'ui.js')], { encoding: 'utf8', timeout: 120000 })
    assert.equal(ui.status, 0, 'ui smoke test:\n' + ui.stdout.slice(-2000) + ui.stderr.slice(-4000))
    console.log(ui.stdout.trim().split('\n').at(-1))
  }
  console.log('end to end: ok')
}
