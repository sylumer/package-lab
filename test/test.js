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
const html = renderReport({ title: 'T', findings: [{ sev: 'error', title: '<img src=x onerror=alert(1)>', evidence: ['a & b'] }], fragment: true })
assert.ok(html.includes('&lt;img src=x') && !html.includes('<img src=x') && html.includes('a &amp; b'), 'report escapes')
assert.deepEqual(verdict([{ sev: 'warn', title: 'w' }, { sev: 'error', title: 'e' }]), { sev: 'error', title: 'e' })
assert.deepEqual(verdict([]).sev, 'ok')
// Launch options: defaults, validation, unknown fields, the CLI line.
const dflt = normaliseOptions()
assert.deepEqual(dflt, { expose: 'manifest', depth: 0, opener: false, resume: false, caught: true, auto: 0, wait: 10, profile: 'none', browser: 'chromium', viewport: null,
  files: {}, pins: [], responses: [], storage: 'normal', trace: false }, 'options: defaults')
assert.deepEqual(normaliseOptions({}), dflt); assert.notEqual(normaliseOptions().files, normaliseOptions().files, 'options: defaults are not shared')
assert.deepEqual(normaliseOptions({ depth: '3', auto: '20', expose: '1.2', viewport: { width: 390, height: 844 } }), { ...dflt, depth: 3, auto: 20, expose: '1.2', viewport: { width: 390, height: 844 } })
for (const [o, re] of [[{ nope: 1 }, /Unknown option: nope/], [{ nope: 1, other: 2 }, /Unknown options: nope, other/], [{ expose: 'x' }, /expose.*one of/], [{ depth: 6 }, /depth/], [{ depth: 1.5 }, /depth/],
  [{ depth: 'a' }, /depth/], [{ opener: 'yes' }, /opener/], [{ caught: 0 }, /caught/], [{ resume: null }, /resume/], [{ auto: -1 }, /auto/], [{ wait: 0 }, /wait/], [{ trace: 1 }, /trace/],
  [{ profile: '' }, /profile/], [{ browser: 'webkit' }, /browser/], [{ viewport: { width: 1 } }, /viewport/], [{ viewport: { width: 0, height: 5 } }, /viewport/], [{ files: [] }, /files/],
  [{ files: { 'a.js': 1 } }, /files/], [{ pins: {} }, /pins/], [{ pins: [1] }, /pins/], [{ responses: 'x' }, /responses/], [{ storage: 3 }, /storage/], ['x', /object/]])
  assert.throws(() => normaliseOptions(o), re, 'options: ' + JSON.stringify(o))
assert.throws(() => normaliseOptions({ constructor: 1 }), /Unknown option: constructor/)
assert.throws(() => normaliseOptions(JSON.parse('{"__proto__":1}')), /Unknown option: __proto__/)
for (const p of ['', '/a.js', '../a.js', 'a/../b.js', 'a\\b.js']) assert.throws(() => normaliseOptions({ files: { [p]: 'x' } }), /files/, 'options: files key ' + p)
assert.deepEqual(normaliseOptions({ files: { 'js/a.js': 'x' } }).files, { 'js/a.js': 'x' })
assert.equal(cliCommand(dflt, { zip: 'a b.zip', item: 2 }), "scorm-lab run 'a b.zip' --item 2")
assert.equal(cliCommand({ expose: 'both', depth: 2, opener: true, caught: false, auto: 20, trace: true }), 'scorm-lab run package.zip --api both --depth 2 --window --no-caught --wait 20 --options options.json')
console.log('unit: ok')

// ---- End to end ----
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
  assert.ok(titles(mm).some(t => /looked for API and found nothing/.test(t)), 'mismatch: lookup finding: ' + titles(mm))
  assert.ok(calls(run(mismatch, '--api', 'both')).includes('LMSInitialize '), 'mismatch with both APIs: calls appear')
  const hh = titles(run(hosted))
  assert.ok(hh.some(t => /asked the host for files outside the package/.test(t)), 'hosted: server request: ' + hh)
  assert.ok(hh.some(t => /set its own window.API/.test(t)), 'hosted: own API: ' + hh)
  const rb = titles(run(blank))
  assert.ok(rb.some(t => /blank page/.test(t) && /Not found: js\/app\.js/.test(t)), 'blank run: ' + rb)
  assert.ok(titles(run(order)).some(t => /run before what they need/.test(t)), 'order run: static finding')
  const rl = titles(run(loader))
  assert.ok(rl.some(t => /stuck on a loading screen/.test(t) && /JSON/.test(t)), 'loader run: ' + rl)
  console.log('runs: ok')

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
  assert.ok(JSON.parse(stdout).api.some(a => a.el === 'cmi.core.lesson_location' && a.value === '2'), 'live: the click reached Next')
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
  console.log('end to end: ok')
}
