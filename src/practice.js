// The User Guide's practice packages (docs/user-guide/03-install-and-practice-kit.md): the sample SCORM 1.2 course in
// src/sample, as it is, and with one fault each. The faults are the same as the test suite's fixtures (test/test.js),
// so what the guide says about them is what the tests check. Names say the symptom, not the cause: the cause is the
// exercise. 14 and 15 come with a macro file each, for the macro exercises; 16 and 17 are the cmi5 and Tin Can packages
// of src/practice-xapi.js. Built by the guide window (main.js, into the data folder's practice/), by `npm run practice`
// (scripts/practice-kit.js) and by the tests.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zip } from './zip.js'
import { cmi5Package, cmi5Steps, tincanPackage } from './practice-xapi.js'

const base = fileURLToPath(new URL('./sample/', import.meta.url))

// Each case: a function that changes a copy of the base files (name → text). sub replaces text in one file and fails
// loudly if the text isn't there, so a change to the sample course can't quietly build a package with no fault.
const sub = (f, name, a, b) => {
  const before = f.get(name), after = before.replace(a, b)
  if (after === before) throw new Error(`practice kit: ${name} no longer has ${a}`)
  f.set(name, after)
}
const CASES = {
  '01-works': () => {},
  '02-blank-page': f => {
    f.set('js/App.js', "document.body.innerHTML = '<h1>Built by App.js</h1>'")
    f.set('lesson.html', '<!doctype html><html><head><script src="scorm.js"></script><script src="js/app.js"></script><script src="vendor/missing.js"></script></head><body></body></html>')
  },
  '03-not-tracked': f => {
    sub(f, 'imsmanifest.xml', '<schemaversion>1.2</schemaversion>', '<schemaversion>2004 4th Edition</schemaversion>')
    sub(f, 'imsmanifest.xml', 'adlcp_rootv1p2', 'adlcp_v1p3')
  },
  '04-loading-forever': f => {
    f.set('data/config.json', '{ "start": true, }')
    f.set('js/next.js', "document.body.textContent = 'next'")
    f.set('js/boot.js', "function later() { var s = document.createElement('script'); s.src = 'js/next.js'; document.head.appendChild(s) }\nfetch('data/config.json').then(function (r) { return r.text() }).then(function (t) { var c = JSON.parse(t); if (c.start) later() })\n")
    f.set('lesson.html', '<!doctype html><html><head><script src="scorm.js"></script><script src="js/boot.js"></script></head><body><div id="loading" class="spinner" style="width:80px;height:80px;background:#ccc">Loading</div></body></html>')
  },
  '05-error-in-the-console': f => sub(f, 'lesson.html', '<script src="scorm.js"></script>', '<script>scorm.start()</script><script src="scorm.js" defer></script>'),
  '06-stuck-connecting': f => sub(f, 'lesson.js', /\nstart\(\)\s*$/, '\nif (window.startOK) start()\n'),
  '07-works-on-the-platform': f => {
    f.set('boot.js', `var previewMode = false
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
    sub(f, 'lesson.html', /<script/, '<script src="boot.js"></script><script')
    sub(f, 'lesson.js', /scorm\.start\(\)/g, 'true')
  },
  '08-forgets-its-place': f => sub(f, 'scorm.js', /\s*api\.LMSSetValue\('cmi\.core\.exit', exit\)/, ''),
  '09-starts-over': f => sub(f, 'lesson.js', /show\(entry === 'resume'[^\n]*\n/, "scorm.get('cmi.core.lesson_location')\n  show(1)\n"),
  '10-fails-in-safari': f => sub(f, 'lesson.js', /^/, 'var brands = navigator.userAgentData.brands.map(function (b) { return b.brand }).join()\n'),
  '11-fails-in-some-lmss': f => {
    f.set('boot.js', "// Restores the learner's place from localStorage before the lesson starts.\nvar saved = JSON.parse(localStorage.getItem('lab-state') || '{}')\nsaved.visits = (saved.visits || 0) + 1\nlocalStorage.setItem('lab-state', JSON.stringify(saved))\nwindow.labState = saved\n")
    sub(f, 'lesson.html', '<script src="lesson.js" defer>', '<script src="boot.js"></script><script src="lesson.js" defer>')
    sub(f, 'lesson.js', /\nstart\(\)\s*$/, '\nif (window.labState) start()\n')
  },
  '12-waits-forever': f => {
    f.set('boot.js', "parent.postMessage({ type: 'player-ready' }, '*')\naddEventListener('message', function (e) { if (e.data && e.data.type === 'launch') scorm.start() })\n")
    sub(f, 'lesson.html', /<script/, '<script src="boot.js"></script><script')
    sub(f, 'lesson.js', /scorm\.start\(\)/g, 'true')
  },
  '13-keeps-looking': f => {
    f.set('boot.js', 'var waited = setInterval(function () {\n  if (window.API) { clearInterval(waited); scorm.start() }\n}, 250)\n')
    sub(f, 'lesson.html', /<script/, '<script src="boot.js"></script><script')
    sub(f, 'lesson.js', /scorm\.start\(\)/g, 'true')
  },
  // The API search stops one frame up, so the course finds the LMS only when it sits directly under it.
  '18-lost-in-some-lmss': f => sub(f, 'scorm.js', 'i < 20', 'i < 2'),
  // Saves 5,000 characters of suspend data on its first page: over SCORM 1.2's 4,096.
  '19-forgets-its-answers': f => sub(f, 'lesson.js', "if (scorm.get('cmi.core.lesson_status') === 'not attempted')", "scorm.set('cmi.suspend_data', JSON.stringify({ notes: new Array(5001).join('x') }))\n  if (scorm.get('cmi.core.lesson_status') === 'not attempted')"),
  // Not faults: the course is fine, the exercise is the macro (test/test.js's latebutton and movebutton). Next is hidden for
  // 3 s, as a big button in the top left corner; then Next pinned 20px from the top right, so its place across the window
  // changes with the width.
  '14-next-button-late': f => { f.set('lesson.js', f.get('lesson.js') + "\nvar late = document.getElementById('next'); late.style.cssText = 'position:fixed;left:10px;top:10px;width:300px;height:100px;visibility:hidden'; setTimeout(function () { late.style.visibility = 'visible' }, 3000)\n") },
  '15-button-moves': f => { f.set('lesson.js', f.get('lesson.js') + "\ndocument.getElementById('next').style.cssText = 'position:fixed;right:20px;top:20px;width:100px;height:40px'\n") },
}

// The macros for 14 and 15, as a learner's clicks on Next would be recorded at 1100×800. 14's clicks come before the
// button shows (the exercise adds a wait); 15's are tied to #next, so they follow it to wherever it is.
const next = (t, x, y) => ({ t, type: 'click', x, y, target: { sel: '#next', text: 'Next', role: 'button', frame: [0] } })
const MACROS = {
  '14-next-button-late': [next(500, 0.15, 0.1), next(900, 0.15, 0.1)],
  '15-button-moves': [next(1500, 0.936, 0.05), next(2000, 0.936, 0.05)],
}
const XAPI = { '16-cmi5-never-passes': () => cmi5Package(cmi5Steps.broken), '17-tincan-answer-missing': () => tincanPackage() }

// Writes every practice package (and the two macro files) into out, replacing what is there. Returns the file names.
export function buildKit(out) {
  mkdirSync(out, { recursive: true })
  const written = []
  const write = (name, buf) => { writeFileSync(join(out, name), buf); written.push(name) }
  for (const [name, edit] of Object.entries(CASES)) {
    const files = new Map(readdirSync(base).map(n => [n, readFileSync(join(base, n), 'utf8')]))
    edit(files)
    // imsmanifest.xml first, then the rest in name order, as an authoring tool would write them.
    const names = [...files.keys()].sort((a, b) => (b === 'imsmanifest.xml') - (a === 'imsmanifest.xml') || a.localeCompare(b))
    write(name + '.zip', zip(new Map(names.map(n => [n, Buffer.from(files.get(n))]))))
  }
  for (const [name, events] of Object.entries(MACROS))
    write(name + '.macro.json', JSON.stringify({ format: 'package-lab-macro', version: 2, viewport: { width: 1100, height: 800 }, events }, null, 2) + '\n')
  for (const [name, build] of Object.entries(XAPI)) write(name + '.zip', build())
  return written.sort()
}
// Every name the kit writes, without building it: what the guide offers to open.
export const KIT = [...Object.keys(CASES), ...Object.keys(XAPI)].map(n => n + '.zip').concat(Object.keys(MACROS).map(n => n + '.macro.json')).sort()
