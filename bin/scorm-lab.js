#!/usr/bin/env node
// scorm-lab: the command-line interface. Static analysis runs here in Node; runs, the desktop window and the web
// interface start Electron (this repo's, or the installed SCORM Lab.app). See docs/cli.md.
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, openSync, closeSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir, homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { unzip } from '../src/zip.js'
import { exportFixed, fixedName, FIX_IDS } from '../src/fixes.js'
import { analyze } from '../src/analyze.js'
import { bootGraph } from '../src/bootpath.js'
import { staticFindings, sortFindings } from '../src/rules.js'
import { normaliseOptions } from '../src/options.js'
import { parsePinFlag, parseAnswerFlag } from '../src/pins.js'
import { entryFor } from '../src/overlay.js'
import { furthest, strip } from '../src/milestones.js'
import { stall } from '../src/stall.js'
import { PRESETS, planVariants, runResult, summarise, experimentFindings } from '../src/experiments.js'
import { discover, checkDiscover } from '../src/shape.js'
import { drill, watchPins } from '../src/drilldown.js'
import { overlayFiles } from '../src/overlay.js'
import { renderReport, verdict, counts, screens } from '../src/report.js'
import { launchPlan, runAnalysis, savedRun, WEBKIT_ORIGINS } from '../src/launch.js'
import { readMacro, cycleFindings, cycleRows, resumeOptions } from '../src/cycle.js'

const APP_DIR = new URL('..', import.meta.url).pathname
const VERSION = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8')).version
const INSTALLED = '/Applications/SCORM Lab.app'
const DATA_DIR = join(homedir(), 'Library', 'Application Support', 'SCORM Lab')

const HELP = `SCORM Lab ${VERSION}: find out why a SCORM package doesn't work.

Usage: scorm-lab <command> [options]

Commands
  analyze <package.zip>     Check the package without running it: manifest, scripts, launch path.
  fix <package.zip>         Write a corrected copy of the package: the mechanical fixes, plus any --override files.
  items <package.zip>       List the items that can be launched, with their numbers.
  run <package.zip>         Launch an item in a hidden browser, record it, and report what went wrong.
  experiment <package.zip>  Run the same launch several ways, one after another, and show how far each got.
  discover <package.zip>    Work out what the content wants from its server: the fields it reads, and a stand-in response.
  drill <package.zip>       Why it stopped: the decisions that led to the dead end, their values, and where each undefined came from.
  cycle <package.zip>       Test saving: leave the way a learner does, then resume, and check the content saved and read its place.
  report <package.zip | run.json>
                            Write an HTML report: of the package (or, with --run, of a run), or of a saved run.
  open [package.zip]        Open the desktop app, optionally with a package.
  serve                     Start the web interface, to use SCORM Lab from another device.
  help                      This help. Also: scorm-lab <command> --help.
  version                   The version.

Options for analyze, run and report
  --item <n | id>           The item to check or launch (a number from 'items', or its identifier). Default: the first SCO.
  --json                    Print JSON instead of text (analyze, items, run).
  --strict                  Exit with status 1 if there are any errors in the findings.

Options for run (and report --run)
  --api <setting>           Which SCORM API the test LMS offers: manifest (default), both, 1.2, 2004 or none.
  --depth <n>               Empty LMS frames between the API and the content (0–5). Default 0.
  --window                  Open the content in a new window (it finds the API through window.opener).
  --resume-from <run.json>  Start with the data a previous run left (to test resuming).
  --wait <seconds>          How long to let it run. Default 10.
  --options <file.json>     Launch options as JSON, for anything a flag can't express. Flags override the file.
  --options-from <run.json> Use the launch options a saved run recorded (changed files included). Other options and flags override them.
  --override <path>=<file>  Run with a changed copy of a package file: the file's contents replace <path>. Repeatable.
  --pin <name>=<json>       Force a value the content reads, before its own code runs: --pin previewMode=false, --pin config.mode='"live"'.
                            navigator.userAgent can be pinned too. Repeatable.
  --answer <pattern>=<reply>  Answer matching requests yourself: --answer '/api/player/config=@config.json' (a file) or
                            --answer '/api/player/config=200:{}' (status:body). The pattern is a glob or a /regex/. Repeatable.
  --launch-params <a=1&b=2> Extra query parameters on the launch address.
  --tool <id>               Apply an authoring tool's rule pack even if the package doesn't show it: xyleme, storyline, rise, captivate, ispring, lectora, adapt, dominknow, evolve, scormdriver, pipwerks.
  --profile <name>          Host the content the way an LMS does: generic (default), moodle, scorm-cloud, cornerstone,
                            successfactors, docebo, totara, blackboard or canvas. Presets are approximations.
  --profile-file <x.json>   A custom profile: { "base": "moodle", "contentOrigin": "other", … } (see the user guide).
  --browser <name>          chromium (default, the app's own Chromium) or webkit (Safari's engine, through Playwright: no coverage, caught
                            errors or code tracing; needs npm i -D playwright && npx playwright install webkit).
  --viewport <size>         A device size: iphone, ipad, android-phone, or WIDTHxHEIGHT like 390x844. Default: the window as it is.
  --storage <mode>          Storage in the content's frames: normal (default), blocked (what Safari does for content in another site's
                            page) or partitioned (empty at the start of the run).
  --macro <file.json>       Clicks, keys and typing to play during the run, at their times (a list of events; see docs/cli.md). Chromium only.
  --record-input            Keep the text typed in the content in the run (never from password fields), to make a macro from it.
  --trace                   Record which functions ran and which way each decision went (the saved run's trace.exec).
  --out <run.json>          Keep the full run (open it in the desktop app with Open saved…).
  --live <folder>           Write frames to <folder>/frame.jpg and read clicks and keys from <folder>/input/.
  --no-caught               Don't record errors the content catches itself.
  --show                    Show the content window while it runs.

Options for fix
  --only <id,…>             Only these fixes (default: all): ${FIX_IDS.join(', ')}.
  --override <path>=<file>  Put a changed file in the corrected package (as for run). Repeatable.
  --out <fixed.zip>         Where to write it. Default: <package>-fixed.zip in the current folder.
  --json                    Print JSON instead of text.

Options for experiment (also the run options above, which set the default launch)
  --variants <file.json>    Your own variants: [{ "name": "deep", "patch": { "depth": 2 } }, …].
  --preset <name>           Built-in variants: standard (default), api, frames, lms (one per LMS profile), storage (normal and blocked), browsers (chromium and webkit).
  --out <folder>            Keep each run in <folder> as a saved run.
  --json                    Print JSON instead of a table.

Options for discover (also the run options above, which set every round's launch)
  --request <pattern>       The request to work on (a glob like /api/config or a /regex/). Default: every fetch or XHR
                            request the first run makes to the server's root or another site.
  --rounds <n>              At most this many rounds of answering and watching (1–10). Default 5.
  --out <folder>            Keep each round's run in <folder>, and the result as discovery.json.
  --json                    Print JSON instead of text.

Options for drill (also the run options above; the first run is always traced)
  --out <folder>            Keep both runs in <folder>, and the result as drill.json.
  --json                    Print JSON instead of text.

Options for cycle (also the run options above; --wait is the length of each of the two runs)
  --macro <file.json>       What to play in the first run before it leaves (without one, nothing is clicked).
  --out <folder>            Keep both runs in <folder> as saved runs.
  --json                    Print JSON instead of text.
  --strict                  Exit with status 1 if the findings include an error.

Options for report
  --out <file.html>         Where to write it. Default: print to standard output.
  --open                    Open the report in the browser (written to a temporary file if there's no --out).
  --fragment                An HTML fragment for embedding, not a whole page.
  --run                     Run the package first (with the run options) and report the run.

Options for serve
  --port <n>                Default 4880.
  --host <address>          Default 127.0.0.1 (this Mac only). 0.0.0.0 makes it reachable on your network.
  --window                  Open the desktop window as well.
  --show-runs               Show content windows on this Mac while they run.
  --url                     Print the address (with its access token) and exit.

Exit status: 0 done, 1 errors found with --strict, 2 the command failed.
`

// ---- Arguments ----
function parse(args) {
  const o = { _: [] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (!a.startsWith('--')) { o._.push(a); continue }
    const [k, v] = a.slice(2).split(/=(.*)/s)
    const takes = ['item', 'api', 'depth', 'resume-from', 'wait', 'options', 'options-from', 'override', 'pin', 'answer', 'launch-params', 'storage', 'browser', 'viewport', 'macro', 'profile', 'profile-file', 'tool', 'out', 'live', 'port', 'host', 'variants', 'preset', 'request', 'rounds', 'only']
    const val = v !== undefined ? v : takes.includes(k) ? args[++i] : true
    if (k === 'override' || k === 'pin' || k === 'answer') (o[k] ??= []).push(val); else o[k] = val
  }
  return o
}
class Fail extends Error {}
const fail = msg => { throw new Fail(msg) }
const tty = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code, s) => tty ? `\x1b[${code}m${s}\x1b[0m` : s
const SEV = { error: s => paint('31;1', s), warn: s => paint('33;1', s), info: s => paint('2', s), ok: s => paint('32;1', s) }

// ---- Packages ----
// The rule pack to apply whatever the package shows: --tool, else the options file's or saved run's tool.
function toolOf(o = {}) {
  const t = o.tool ?? (o.options !== undefined ? optionsFile(o.options).tool : undefined) ?? (o['options-from'] !== undefined ? optionsFromRun(o['options-from']).tool : undefined) ?? null
  try { return normaliseOptions({ tool: t }).tool } catch (e) { fail(e.message) }
}
function openZip(path, o) {
  if (!path) fail('Name a package: scorm-lab <command> <package.zip>')
  if (!existsSync(path)) fail(`No such file: ${path}`)
  let files
  try { files = unzip(readFileSync(path)) } catch (e) { fail(`${basename(path)} isn’t a readable ZIP: ${e.message}`) }
  return { name: basename(path), path: resolve(path), files, analysis: analyze(files, { tool: toolOf(o) }) }
}
const launchable = a => (a.manifest?.items ?? []).map((it, index) => ({ ...it, index })).filter(i => i.res)
function pickItem(a, want) {
  const list = launchable(a)
  if (!list.length) fail('The package has no item with something to launch.')
  if (want === undefined) return list.find(i => i.type === 'sco') ?? list[0]
  const n = /^\d+$/.test(String(want)) ? list[+want - 1] : list.find(i => i.id === want)
  return n ?? fail(`No item ${want}. Items: ${list.map((i, k) => `${k + 1} (${i.id})`).join(', ')}`)
}
function check(pkg, want) {
  const item = pickItem(pkg.analysis, want), boot = item.res.path ? bootGraph(pkg.files, item.res.path) : null
  return { item, boot, findings: sortFindings([...staticFindings(pkg.analysis), ...(boot?.risks ?? [])]) }
}
const itemJson = (i, k) => ({ number: k + 1, id: i.id, title: i.title, type: i.type, launch: i.res.path ?? i.res.href, parameters: i.params })

function printFindings(findings) {
  for (const f of findings) {
    console.log(`\n${SEV[f.sev](f.sev === 'warn' ? 'WARNING' : f.sev.toUpperCase())}  ${f.title}`)
    if (f.detail) console.log(`  ${f.detail}`)
    for (const e of f.evidence ?? []) console.log(paint('2', `  · ${e}`))
    if (f.fix) console.log(`  Try: ${f.fix}`)
  }
}
function printHeader(pkg, item) {
  const a = pkg.analysis, m = a.manifest
  console.log(paint('1', `SCORM Lab · ${pkg.name}`))
  console.log(`${m ? `SCORM ${m.version}${m.edition ? ' ' + m.edition + ' edition' : ''}` : 'No manifest'} · ${launchable(a).length} items · ${a.fingerprints.length ? 'made with ' + a.fingerprints.join(', ') : 'authoring tool not recognised'} · ${a.files} files (${(a.size / 1048576).toFixed(1)} MB)`)
  if (item) console.log(`Item: ${item.title || item.id} (${item.type || '?'}) → ${item.res.path ?? item.res.href}`)
}
function printVerdict(findings) {
  const v = verdict(findings), c = counts(findings)
  console.log(`\n${SEV[v.sev === 'ok' ? 'ok' : v.sev](v.sev === 'ok' ? 'OK' : v.sev === 'warn' ? 'WARNING' : 'ERROR')}  ${v.title}  ${paint('2', `(${c.errors} errors, ${c.warnings} warnings, ${c.info} notes)`)}`)
}

// ---- Electron ----
function electron() {
  const env = process.env.SCORM_LAB_ELECTRON
  if (env) return /(^|\/)electron$/i.test(env) ? [env, [APP_DIR]] : [env, []]
  try { const bin = createRequire(import.meta.url)('electron'); if (typeof bin === 'string' && existsSync(bin)) return [bin, [APP_DIR]] } catch { /* not installed here */ }
  const app = join(INSTALLED, 'Contents', 'MacOS', 'SCORM Lab')
  if (existsSync(app)) return [app, []]
  fail('Electron isn’t installed: run npm install in the scorm-lab folder, or install SCORM Lab.app.')
}

// Launch options from --options <file.json>, and from the flags that were given (flags win).
function jsonFile(path, what) {
  if (typeof path !== 'string' || !path) fail('Name a JSON file.')
  if (!existsSync(path)) fail(`No such file: ${path}`)
  let j
  try { j = JSON.parse(readFileSync(path, 'utf8')) } catch (e) { fail(`${basename(path)} isn’t valid JSON: ${e.message}`) }
  if (!j || typeof j !== 'object' || Array.isArray(j)) fail(`${basename(path)} must hold one JSON object of ${what}.`)
  return j
}
function optionsFile(path) {
  if (!path) return {}
  const j = jsonFile(path, 'options, like { "depth": 1 }')
  // A response's bodyFile is read here, relative to the options file, and its content goes into body: the options never carry paths.
  if (Array.isArray(j.responses)) j.responses = j.responses.map(r => {
    if (!r || typeof r !== 'object' || r.bodyFile === undefined) return r
    if (r.body !== undefined) fail(`A response for ${JSON.stringify(r.match)} has both body and bodyFile. Use one.`)
    const { bodyFile, ...rest } = r
    const dir = resolve(dirname(path)), file = resolve(dir, String(bodyFile))
    if (isAbsolute(String(bodyFile)) || file !== dir && !file.startsWith(dir + sep)) fail(`bodyFile ${JSON.stringify(bodyFile)} must be inside the folder of ${basename(path)}: a relative path without “..”.`)
    return { ...rest, body: readText(file) }
  })
  return j
}
function readText(file) {
  if (!existsSync(file)) fail(`No such file: ${file}`)
  try { return readFileSync(file, 'utf8') } catch (e) { fail(`Can’t read ${file}: ${e.code === 'EISDIR' ? 'it is a folder' : e.message}`) }
}
// --options-from run.json: the launch options a saved run recorded.
function optionsFromRun(path) {
  if (!path) return {}
  if (typeof path !== 'string') fail('--options-from needs a saved run file.')
  if (!existsSync(path)) fail(`No such file: ${path}`)
  let j
  try { j = JSON.parse(readFileSync(path, 'utf8')) } catch (e) { fail(`${basename(path)} isn’t valid JSON: ${e.message}`) }
  if (!j?.launch?.options) fail(`${basename(path)} has no recorded launch options (it is a saved run from before they were kept, or isn’t a saved run).`)
  return j.launch.options
}
// --override path=local file, repeatable: text files are kept as text, anything else as base64.
function overrideFiles(list = []) {
  const files = []
  for (const spec of list) {
    const at = typeof spec === 'string' ? spec.indexOf('=') : -1
    if (at < 1) fail('--override needs <path in the package>=<local file>, like --override js/app.js=fixed-app.js')
    const path = spec.slice(0, at), local = spec.slice(at + 1)
    if (!existsSync(local)) fail(`No such file: ${local}`)
    let buf
    try { buf = readFileSync(local) } catch (e) { fail(`Can’t read ${local}: ${e.code === 'EISDIR' ? 'it is a folder' : e.message}`) }
    files.push([path, entryFor(buf)])
  }
  return Object.fromEntries(files)
}
// --macro file.json: a list of events, or { events }.
function macroFile(path) {
  if (typeof path !== 'string' || !path) fail('--macro needs a JSON file of events.')
  if (!existsSync(path)) fail(`No such file: ${path}`)
  let j
  try { j = JSON.parse(readFileSync(path, 'utf8')) } catch (e) { fail(`${basename(path)} isn’t valid JSON: ${e.message}`) }
  try { return readMacro(j) } catch (e) { fail(`${basename(path)}: ${e.message}`) }
}
function flagOptions(o) {
  const f = {}
  if (o.api !== undefined) f.expose = o.api
  if (o.depth !== undefined) f.depth = o.depth
  if (o.window) f.opener = true
  if (o['no-caught']) f.caught = false
  if (o.wait !== undefined) f.wait = o.wait
  if (o['launch-params'] !== undefined) f.launchParams = o['launch-params']
  if (o.trace) f.trace = true
  if (o.storage !== undefined) f.storage = o.storage
  if (o.browser !== undefined) f.browser = o.browser
  if (o.viewport !== undefined) f.viewport = o.viewport
  if (o.macro !== undefined) f.macro = macroFile(o.macro)
  if (o['record-input']) f.recordInput = true
  if (o.tool !== undefined) f.tool = o.tool
  // --profile-file holds a custom profile: { base?, …fields }. With --profile too, that name is its base unless it names one.
  if (o['profile-file'] !== undefined) {
    const p = jsonFile(o['profile-file'], 'a profile, like { "base": "moodle", "contentOrigin": "other" }')
    f.profile = o.profile !== undefined && p.base === undefined ? { base: o.profile, ...p } : p
  } else if (o.profile !== undefined) f.profile = o.profile
  return f
}

function buildOptions(o) {
  const f = { ...optionsFromRun(o['options-from']), ...optionsFile(o.options) }, flags = flagOptions(o)
  // --override adds to (and wins over) the files from the options file or saved run.
  if (o.override) flags.files = { ...(f.files ?? {}), ...overrideFiles(o.override) }
  // --pin and --answer add to the options file's pins and responses.
  const asFail = fn => { try { return fn() } catch (e) { fail(e.message) } }
  if (o.pin) flags.pins = [...(f.pins ?? []), ...o.pin.map(x => asFail(() => parsePinFlag(x)))]
  if (o.answer) flags.responses = [...(f.responses ?? []), ...o.answer.map(x => {
    const a = asFail(() => parseAnswerFlag(x))
    return a.file !== undefined ? { match: a.match, body: readText(a.file) } : a
  })]
  try { return normaliseOptions({ ...f, ...flags }) } catch (e) { fail(e.message) }
}

// Runs one item headless and returns the saved run. Options as for the run command.
function runPackage(pkg, o, options) {
  const item = pickItem(pkg.analysis, o.item), dir = mkdtempSync(join(tmpdir(), 'scorm-lab-cli-'))
  const out = o.out ? resolve(o.out) : join(dir, 'run.json')
  try { options ??= buildOptions(o) } catch (e) { rmSync(dir, { recursive: true, force: true }); throw e }
  const wait = options.wait
  if (options.browser === 'webkit' && (options.macro.length || o.close)) { rmSync(dir, { recursive: true, force: true }); fail('Macros and the save-and-resume test run in Chromium only: WebKit runs have no input to replay.') }
  if (options.browser === 'webkit') return runWebkit(pkg, item, o, options, dir, out)
  const job = { zip: pkg.path, item: item.index, options, resumeFrom: o['resume-from'] ? resolve(o['resume-from']) : null, close: !!o.close, out, live: o.live ? resolve(o.live) : null }
  writeFileSync(join(dir, 'job.json'), JSON.stringify(job))
  const [bin, pre] = electron(), log = join(dir, 'electron.log'), fd = openSync(log, 'w')
  const r = spawnSync(bin, [...pre, `--run=${join(dir, 'job.json')}`, ...(o.show ? ['--show-runs'] : [])], { stdio: ['ignore', 'ignore', fd], timeout: (wait + 120) * 1000 })
  closeSync(fd)
  if (!existsSync(out)) {
    const why = (existsSync(log) ? readFileSync(log, 'utf8') : '').split('\n').filter(l => /Error|error:/.test(l)).slice(0, 3).join('\n')
    rmSync(dir, { recursive: true, force: true })
    fail(`The run didn’t finish${r.error ? `: ${r.error.message}` : r.status ? ` (exit ${r.status})` : ''}.${why ? '\n' + why : ''}`)
  }
  const run = JSON.parse(readFileSync(out, 'utf8'))
  rmSync(dir, { recursive: true, force: true }) // the job folder; --out is outside it
  return { run, item, out: o.out ? out : null }
}
// A WebKit run (P2.3): Playwright in a plain Node process (src/webkit-runner.js), then the same findings as any run.
function runWebkit(pkg, item, o, options, dir, out) {
  if (o.live) { rmSync(dir, { recursive: true, force: true }); fail('--live isn’t available for WebKit runs.') }
  const cmi = o['resume-from'] ? JSON.parse(readFileSync(resolve(o['resume-from']), 'utf8')).trace?.cmi ?? null : null
  options = { ...options, resume: options.resume || !!cmi }
  const traceFile = join(dir, 'webkit-trace.json'), jobFile = join(dir, 'webkit-job.json')
  writeFileSync(jobFile, JSON.stringify({ zip: pkg.path, item: item.index, options, cmi, out: traceFile, wait: options.wait }))
  const r = spawnSync(process.execPath, [join(APP_DIR, 'src', 'webkit-runner.js'), jobFile], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'], timeout: (options.wait + 20) * 1000, killSignal: 'SIGKILL',   // it ends itself soon after its wait
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|HOME|TMPDIR|SCORM_LAB_.*|PLAYWRIGHT_.*)$/.test(k))) })
  if (!existsSync(traceFile)) {
    rmSync(dir, { recursive: true, force: true })
    fail((r.stderr ?? '').split('\n').filter(l => l.trim()).slice(-3).join('\n') || `The WebKit run didn’t finish${r.error ? `: ${r.error.message}` : r.status ? ` (exit ${r.status})` : ''}.`)
  }
  const { trace } = JSON.parse(readFileSync(traceFile, 'utf8'))
  const plan = launchPlan({ pkg, item: item.index, cmi, options, origins: WEBKIT_ORIGINS }), boot = plan.res.path ? bootGraph(plan.files, plan.res.path) : null
  const run = savedRun({ kind: 'package', label: plan.label, package: pkg.name, launch: plan.launch, trace, boot, ...runAnalysis({ kind: 'package', launch: plan.launch, trace, boot, analysis: pkg.analysis }) })
  if (o.out) writeFileSync(out, JSON.stringify(run))
  rmSync(dir, { recursive: true, force: true })
  return { run, item, out: o.out ? out : null }
}
// What the content was waiting for (src/stall.js), without the full evidence lines of the finding.
const waitingFor = run => { const { pollers, unanswered, listeners, pending, last, stalled } = stall(run.trace, run.milestones); return { stalled, pollers, unanswered, listeners, pending, last } }
const runJson = (pkg, item, run, out) => ({ package: pkg.name, item: itemJson(item, launchable(pkg.analysis).findIndex(i => i.index === item.index)), launch: run.launch,
  verdict: verdict(run.findings), counts: counts(run.findings, run.trace), milestones: run.milestones ?? null, waitingFor: run.milestones ? waitingFor(run) : null, furthest: run.milestones ? furthest(run.milestones)?.id ?? null : null, findings: run.findings,
  api: run.trace.probe.filter(p => p.type === 'api').slice(0, 200).map(({ call, el, value, result, err }) => ({ call, el, value, result, err })),
  screens: screens(run.trace).map(({ frame, readyState, text, visible, media, loader, hidden, sample }) => ({ frame, readyState, text, visible, media, loader, hidden, sample })),
  out })

// The experiment table (experiments.js summarise rows). first names the first column.
function printRows(rows, first = 'Variant', base = 'the default') {
  const cols = [first, 'Furthest', 'API calls', 'Errors', 'Verdict', `Against ${base}`], cell = r => [r.name, r.furthestLabel, r.apiCalls, r.errors, r.verdict.sev === 'ok' ? 'OK' : r.verdict.sev.toUpperCase(), r.progress].map(String)
  const table = [cols, ...rows.map(cell)], w = cols.map((_, c) => Math.max(...table.map(r => r[c].length)))
  console.log()
  for (const [i, r] of table.entries()) {
    console.log(r.map((c, k) => c.padEnd(w[k])).join('  ').trimEnd())
    if (i === 0) console.log(paint('2', w.map(n => '─'.repeat(n)).join('  ')))
  }
}

// ---- Commands ----
const commands = {
  analyze(o) {
    const pkg = openZip(o._[0], o), { item, boot, findings } = check(pkg, o.item), a = pkg.analysis
    if (o.json) console.log(JSON.stringify({ package: pkg.name, manifest: a.manifest && { version: a.manifest.version, edition: a.manifest.edition, schemaversion: a.manifest.schemaversion, title: a.manifest.title },
      apiUse: a.apiUse, fingerprints: a.fingerprints, files: a.files, size: a.size, items: launchable(a).map(itemJson), item: itemJson(item, launchable(a).findIndex(i => i.index === item.index)),
      verdict: verdict(findings), counts: counts(findings), findings, boot }, null, 1))
    else { printHeader(pkg, item); printFindings(findings); printVerdict(findings) }
    return o.strict && findings.some(f => f.sev === 'error') ? 1 : 0
  },
  fix(o) {
    const pkg = openZip(o._[0], o)
    for (const k of ['only', 'out']) if (Object.hasOwn(o, k) && (typeof o[k] !== 'string' || !o[k])) fail(`--${k} needs a value.`)
    let r
    try { r = exportFixed(pkg.files, { only: o.only, overrides: overrideFiles(o.override), version: VERSION, name: pkg.name }) } catch (e) { if (e instanceof Fail) throw e; fail(e.message) }
    const out = r.zip ? resolve(o.out ?? fixedName(pkg.name)) : null
    if (out) writeFileSync(out, r.zip)
    if (o.json) console.log(JSON.stringify({ package: pkg.name, out, applied: r.applied, notes: r.notes, overridden: r.overridden, proof: r.proof }, null, 1))
    else {
      console.log(paint('1', `SCORM Lab · fix · ${pkg.name}`))
      if (!r.zip) console.log('Nothing to change: none of the fixes found anything to correct, and no --override was given. No file written.')
      for (const f of r.applied) { console.log(`\n${f.label} ${paint('2', `[${f.id}]`)}`); for (const c of f.changes) console.log(`  · ${c}`) }
      if (r.notes.length) { console.log('\nNot done:'); for (const n of r.notes.flatMap(f => f.notes)) console.log(`  · ${n}`) }
      if (r.overridden.length) console.log(`\nChanged files: ${r.overridden.join(', ')}`)
      if (r.zip) {
        console.log(`\nFindings cleared: ${r.proof.gone.length} of ${r.proof.before}${r.proof.gone.map(t => `\n  ✓ ${t}`).join('')}`)
        if (r.proof.added.length) console.log(`New or reworded:${r.proof.added.map(t => `\n  + ${t}`).join('')}`)
        console.log(`Still there: ${r.proof.remaining.length}`)
        console.log(paint('2', `\nWrote ${out} (the changes are listed inside it, in SCORM-LAB-CHANGES.txt)`))
      }
    }
    return 0
  },
  items(o) {
    const pkg = openZip(o._[0], o), list = launchable(pkg.analysis)
    if (o.json) console.log(JSON.stringify(list.map(itemJson), null, 1))
    else for (const [k, i] of list.entries()) console.log(`${String(k + 1).padStart(3)}  ${'  '.repeat(i.depth)}${i.title || i.id}  ${paint('2', `${i.type || '?'} · ${i.id} · ${i.res.path ?? i.res.href}`)}`)
    return 0
  },
  run(o) {
    const pkg = openZip(o._[0], o), { wait } = buildOptions(o)
    if (!o.json) process.stderr.write(`Running ${pkg.name} for ${wait} s…\n`)
    const { run, item, out } = runPackage(pkg, o)
    if (o.json) console.log(JSON.stringify(runJson(pkg, item, run, out), null, 1))
    else {
      const c = counts(run.findings, run.trace)
      printHeader(pkg, item)
      console.log(`Ran for ${c.seconds} s · offered ${run.launch.expose === 'both' ? 'both APIs' : run.launch.expose === 'none' ? 'no API' : 'SCORM ' + run.launch.expose} · ${c.apiCalls} API calls · ${c.requests} requests (${c.failedRequests} failed) · ${c.uncaught} uncaught errors`)
      for (const d of screens(run.trace)) console.log(paint('2', `Showing in ${d.frame.replace(/^lab:\/\/(?:run|content)\/pkg\//, '')}: ${d.visible} visible elements${d.loader ? ', loading indicator ' + d.loader : ''}, text “${(d.sample ?? '').slice(0, 80)}”`))
      if (run.milestones) console.log(`Milestones: ${strip(run.milestones)}`)
      printFindings(run.findings); printVerdict(run.findings)
      if (out) console.log(paint('2', `\nRun saved to ${out}`))
    }
    return o.strict && run.findings.some(f => f.sev === 'error') ? 1 : 0
  },
  experiment(o) {
    const pkg = openZip(o._[0], o), options = buildOptions(o), item = pickItem(pkg.analysis, o.item)
    for (const k of ['variants', 'preset']) if (Object.hasOwn(o, k) && (typeof o[k] !== 'string' || !o[k])) fail(`--${k} needs a value.`)
    if (o.variants && o.preset) fail('Use --variants or --preset, not both.')
    if (o.preset !== undefined && !Object.hasOwn(PRESETS, o.preset)) fail(`No preset “${o.preset}”. Presets: ${Object.keys(PRESETS).join(', ')}.`)
    let variants = PRESETS[o.preset ?? 'standard']
    if (o.variants) {
      if (!existsSync(o.variants)) fail(`No such file: ${o.variants}`)
      try { variants = JSON.parse(readFileSync(o.variants, 'utf8')) } catch (e) { fail(`${basename(o.variants)} isn’t valid JSON: ${e.message}`) }
      if (variants?.variants) variants = variants.variants
    }
    let plan
    try { plan = planVariants({ base: options, variants, dedupe: !o.variants }) } catch (e) { fail(e.message) }
    const dir = o.out ? resolve(o.out) : null
    if (dir) mkdirSync(dir, { recursive: true })
    const results = []
    for (const [i, v] of plan.entries()) {
      if (!o.json) process.stderr.write(`Variant ${i + 1} of ${plan.length}: ${v.name} (${v.options.wait} s)…\n`)
      const file = dir ? join(dir, `${String(i + 1).padStart(2, '0')}-${v.name.replace(/[^\w.-]+/g, '_').slice(0, 60)}.json`) : undefined
      const { run } = runPackage(pkg, { ...o, out: file, live: undefined }, v.options)
      results.push(runResult(v.name, v.options, run, { out: file ?? null }))
    }
    const rows = summarise(results).map((r, i) => ({ ...r, options: results[i].options, out: results[i].out })), findings = experimentFindings(results)
    if (o.json) console.log(JSON.stringify({ package: pkg.name, item: itemJson(item, launchable(pkg.analysis).findIndex(i => i.index === item.index)), base: options, variants: rows, findings }, null, 1))
    else {
      printHeader(pkg, item)
      printRows(rows)
      printFindings(findings)
      if (dir) console.log(paint('2', `\nRuns saved in ${dir}`))
    }
    return 0
  },
  async discover(o) {
    const pkg = openZip(o._[0], o), options = buildOptions(o), item = pickItem(pkg.analysis, o.item)
    for (const k of ['request', 'rounds']) if (Object.hasOwn(o, k) && (typeof o[k] !== 'string' || !o[k])) fail(`--${k} needs a value.`)
    const rounds = o.rounds === undefined ? 5 : /^\d+$/.test(o.rounds) ? +o.rounds : NaN
    try { checkDiscover({ request: o.request, rounds }) } catch (e) { fail(e.message) }
    const dir = o.out ? resolve(o.out) : null
    if (dir) mkdirSync(dir, { recursive: true })
    let i = 0
    const result = await discover({ base: options, request: o.request, rounds, run: async (name, opts) => {
      i++
      if (!o.json) process.stderr.write(`${name === 'no answer' ? 'Without an answer' : name[0].toUpperCase() + name.slice(1)} (${opts.wait} s)…\n`)
      const file = dir ? join(dir, `${String(i).padStart(2, '0')}-${name.replace(/[^\w.-]+/g, '_')}.json`) : undefined
      return runPackage(pkg, { ...o, out: file, live: undefined }, opts).run
    } })
    const json = { package: pkg.name, item: itemJson(item, launchable(pkg.analysis).findIndex(x => x.index === item.index)), base: options, request: o.request ?? null, ...result, out: dir }
    if (dir) writeFileSync(join(dir, 'discovery.json'), JSON.stringify(json, null, 1))
    if (o.json) { console.log(JSON.stringify(json, null, 1)); return 0 }
    printHeader(pkg, item)
    printRows(result.rows, 'Run', 'no answer')
    for (const r of result.requests) {
      console.log(`\n${paint('1', `${r.method} ${r.url.replace(/^lab:\/\/(?:run|content)(?=\/)/, '')}`)}${r.from ? paint('2', ` from ${r.from}`) : ''}`)
      if (!r.fields.length) { console.log(paint('2', '  Nothing read from the response.')); continue }
      for (const f of r.fields) console.log(`  ${f.path}: ${f.type}${paint('2', ` (${f.how}${f.at.length ? ', ' + f.at.join(', ') : ''})`)}`)
      console.log(`  Stand-in response: ${JSON.stringify(r.skeleton)}`)
    }
    printFindings(result.findings)
    if (dir) console.log(paint('2', `\nRuns and discovery.json saved in ${dir}`))
    return 0
  },
  // A traced run, then (if the drill-down asks to watch values) the same run with watch pins, then the chain.
  drill(o) {
    const pkg = openZip(o._[0], o), options = { ...buildOptions(o), trace: true }, item = pickItem(pkg.analysis, o.item), files = overlayFiles(pkg.files, options.files)
    const dir = o.out ? resolve(o.out) : null
    if (dir) mkdirSync(dir, { recursive: true })
    if (!o.json) process.stderr.write(`Tracing ${pkg.name} for ${options.wait} s…\n`)
    const first = runPackage(pkg, { ...o, out: dir ? join(dir, '01-traced.json') : undefined, live: undefined }, options).run
    const input = { trace: first.trace, milestones: first.milestones, files, launch: first.launch }
    let result = drill(input), second = null
    if (result.watch.length) {
      if (!o.json) process.stderr.write(`Watching ${result.watch.join(', ')}…\n`)
      let opts
      try { opts = normaliseOptions({ ...options, pins: watchPins(options, result.watch) }) } catch (e) { fail(e.message) }
      second = runPackage(pkg, { ...o, out: dir ? join(dir, '02-watched.json') : undefined, live: undefined }, opts).run
      result = drill({ ...input, watch: second.trace })
    }
    const json = { package: pkg.name, item: itemJson(item, launchable(pkg.analysis).findIndex(x => x.index === item.index)), base: options,
      furthest: first.milestones ? furthest(first.milestones)?.id ?? null : null, ...result, out: dir }
    if (dir) writeFileSync(join(dir, 'drill.json'), JSON.stringify(json, null, 1))
    if (o.json) { console.log(JSON.stringify(json, null, 1)); return 0 }
    printHeader(pkg, item)
    if (first.milestones) console.log(`Milestones: ${strip(first.milestones)}`)
    if (result.chain.length) { console.log(paint('1', '\nWhy it stopped')); for (const s of result.chain) console.log(`  ${s.n}. ${s.text}`) }
    const others = result.decisions.filter(d => !result.chain.some(s => s.at === d.at && s.decision === d.code))
    if (others.length) { console.log(paint('1', '\nOther decisions whose other branch never ran')); for (const d of others.slice(-10)) console.log(paint('2', `  ${d.at}  ${d.code} → ${d.said}${d.operands.length ? ', ' + d.operands.map(x => `${x.code} = ${x.value}`).join(', ') : ''}`)) }
    printFindings(result.findings)
    if (dir) console.log(paint('2', `\nRuns and drill.json saved in ${dir}`))
    return 0
  },
  // Test saving (P2.4): the first run plays the macro and leaves like a learner; the second resumes from what it left.
  cycle(o) {
    const pkg = openZip(o._[0], o), options = buildOptions(o), item = pickItem(pkg.analysis, o.item), dir = mkdtempSync(join(tmpdir(), 'scorm-lab-cycle-')), keep = o.out ? resolve(o.out) : null
    if (options.browser === 'webkit') { rmSync(dir, { recursive: true, force: true }); fail('The save-and-resume test runs in Chromium only: WebKit runs have no input to replay.') }
    if (keep) mkdirSync(keep, { recursive: true })
    const f1 = join(keep ?? dir, '01-first.json'), f2 = join(keep ?? dir, '02-resumed.json')
    try {
      if (!o.json) process.stderr.write(`Run 1 of 2: ${options.macro.length ? `playing ${options.macro.length} events, then ` : ''}leaving (${options.wait} s)…\n`)
      const first = runPackage(pkg, { ...o, 'resume-from': undefined, out: f1, live: undefined, close: true }, options).run
      if (!o.json) process.stderr.write(`Run 2 of 2: resuming (${options.wait} s)…\n`)
      const second = runPackage(pkg, { ...o, 'resume-from': f1, out: f2, live: undefined, close: false }, resumeOptions(options)).run
      const findings = cycleFindings({ runs: [first, second], macro: options.macro }), rows = cycleRows([first, second])
      const one = (run, out) => ({ furthest: run.milestones ? furthest(run.milestones)?.id ?? null : null, verdict: verdict(run.findings), apiCalls: counts(run.findings, run.trace).apiCalls, out: keep ? out : null })
      const json = { package: pkg.name, item: itemJson(item, launchable(pkg.analysis).findIndex(i => i.index === item.index)), base: options, runs: [one(first, f1), one(second, f2)], rows, findings }
      if (o.json) console.log(JSON.stringify(json, null, 1))
      else {
        printHeader(pkg, item)
        const table = [['', 'Run 1: leaves', 'Run 2: resumes'], ...rows.map(r => [r.label, r.a, r.b])], w = [0, 1, 2].map(c => Math.max(...table.map(r => r[c].length)))
        console.log()
        for (const [i, r] of table.entries()) { console.log(r.map((c, k) => c.padEnd(w[k])).join('  ').trimEnd()); if (i === 0) console.log(paint('2', w.map(n => '─'.repeat(n)).join('  '))) }
        printFindings(findings)
        if (keep) console.log(paint('2', `\nRuns saved in ${keep}`))
      }
      return o.strict && findings.some(f => f.sev === 'error') ? 1 : 0
    } finally { rmSync(dir, { recursive: true, force: true }) }
  },
  report(o) {
    const input = o._[0]
    if (!input) fail('Name a package or a saved run: scorm-lab report <package.zip | run.json>')
    let html
    if (/\.json$/i.test(input)) {
      if (!existsSync(input)) fail(`No such file: ${input}`)
      const run = JSON.parse(readFileSync(input, 'utf8'))
      if (!run.trace) fail(`${basename(input)} isn’t a SCORM Lab run.`)
      html = renderReport({ title: `SCORM Lab: ${run.package ?? run.label}`, subtitle: run.label, run, fragment: !!o.fragment })
    } else {
      const pkg = openZip(input, o)
      if (o.run) {
        const { run } = runPackage(pkg, { ...o, out: undefined })
        html = renderReport({ title: `SCORM Lab: ${pkg.name}`, subtitle: run.label, run, analysis: pkg.analysis, fragment: !!o.fragment })
      } else {
        const { item, boot, findings } = check(pkg, o.item)
        html = renderReport({ title: `SCORM Lab: ${pkg.name}`, subtitle: `${item.title || item.id} (${item.res.path ?? item.res.href}), from the files only. Run it to see what actually happens.`, findings, boot, analysis: pkg.analysis, fragment: !!o.fragment })
      }
    }
    const out = o.out ? resolve(o.out) : o.open ? join(mkdtempSync(join(tmpdir(), 'scorm-lab-report-')), 'report.html') : null
    if (out) { writeFileSync(out, html); if (!o.open) console.error(`Report written to ${out}`) } else process.stdout.write(html)
    if (o.open && out) spawnSync('open', [out])
    return 0
  },
  open(o) {
    const zip = o._[0] ? resolve(o._[0]) : null
    if (zip && !existsSync(zip)) fail(`No such file: ${zip}`)
    if (existsSync(INSTALLED) && !process.env.SCORM_LAB_ELECTRON) { spawnSync('open', ['-a', INSTALLED, ...(zip ? [zip] : [])]); return 0 }
    const [bin, pre] = electron()
    spawn(bin, [...pre, ...(zip ? [zip] : [])], { detached: true, stdio: 'ignore' }).unref()
    return 0
  },
  serve(o) {
    if (o.url) {
      const t = join(DATA_DIR, 'web-token')
      if (!existsSync(t)) fail('The web interface hasn’t been started yet, so there is no address. Run scorm-lab serve.')
      console.log(`http://${o.host && o.host !== '0.0.0.0' ? o.host : o.host ? 'localhost' : '127.0.0.1'}:${o.port ?? 4880}/?token=${readFileSync(t, 'utf8').trim()}`)
      return 0
    }
    const [bin, pre] = electron()
    const args = [...pre, `--serve=${+(o.port ?? 4880) || 4880}`, `--host=${o.host ?? '127.0.0.1'}`, ...(o.window ? [] : ['--no-window']), ...(o['show-runs'] ? ['--show-runs'] : [])]
    const child = spawn(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] })
    if (!o.host || o.host === '127.0.0.1') console.error('Only this Mac can reach it. To reach it from another device: --host 0.0.0.0 (anyone on your network with the address can use it), or an SSH tunnel. Stop with Ctrl-C.')
    for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill())
    child.on('exit', code => process.exit(code ?? 0))
    return null
  },
  version() { console.log(VERSION); return 0 },
  help() { console.log(HELP); return 0 },
}

const o = parse(process.argv.slice(2)), name = o._.shift() ?? 'help'
const cmd = o.help || o.h ? commands.help : name === '--version' || o.version ? commands.version : commands[name]
try {
  if (!cmd) fail(`Unknown command “${name}”. Try scorm-lab help.`)
  const code = await cmd(o)
  if (code !== null) process.exitCode = code
} catch (e) {
  console.error(e instanceof Fail ? e.message : e.stack ?? String(e))
  process.exitCode = 2
}
