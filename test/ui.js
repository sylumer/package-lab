// UI smoke test (E0.1): opens the real desktop app with Playwright's Electron driver, clicks through it and fails if a
// visible behaviour breaks. Run by `npm run test:ui`, and by `node test/test.js --slow`. The helpers are exported so
// later work packages and scripts/screenshots.js can drive the same window. The app keeps its data in a temp folder.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
import { _electron, chromium } from 'playwright'

const root = fileURLToPath(new URL('..', import.meta.url))
let app = null, win = null, work = null
export const errors = []   // uncaught errors from any window this file opened
const dir = () => work ??= mkdtempSync(join(tmpdir(), 'package-lab-ui-'))

// The `good` fixture, built the way test/test.js builds it: test/fixtures/base, zipped.
export function goodZip() {
  const d = join(dir(), 'good')
  cpSync(join(root, 'test', 'fixtures', 'base'), d, { recursive: true })
  execFileSync('zip', ['-qr', join(dir(), 'good.zip'), '.'], { cwd: d })
  return join(dir(), 'good.zip')
}

// Starts the app (with a package, if given) on a throwaway data folder, and returns its window.
export async function start(zip) {
  await close()
  app = await _electron.launch({ args: zip ? [root, zip] : [root], env: { ...process.env, PACKAGE_LAB_DATA: join(dir(), 'data') } })
  win = await app.firstWindow()
  win.on('pageerror', e => errors.push(e.message))
  await win.waitForLoadState('domcontentloaded')
  return win
}
export async function close() { const a = app; app = win = null; if (a) await a.close().catch(() => {}) }
export const page = () => win
// Closes the app and removes the temp folder.
export async function cleanup() { await close(); if (work) rmSync(work, { recursive: true, force: true }); work = null }
// There is no handler to open a package in a running app, so this restarts the app with the package as an argument.
export const open = async zip => { await start(zip); await win.locator('#pkg-name').filter({ hasText: /\.zip$/ }).waitFor() }
// Runs the package and waits until the run is live.
// Run and Stop are one toolbar button: its name is Run until a run is live, then Stop.
export async function launch() { await win.getByRole('button', { name: 'Run', exact: true }).click(); await win.getByRole('button', { name: 'Stop', exact: true }).waitFor() }
export async function stop() { await win.getByRole('button', { name: 'Stop', exact: true }).click(); await win.locator('#runs li').first().waitFor() }
export const view = name => win.getByRole('tab', { name, exact: true }).click()
export const text = selector => win.locator(selector).innerText()
// A menu item is clicked from the main process: Playwright's keyboard doesn't reach the native menu's shortcuts. `under` names the
// top-level menu to look in (Run has an item called Run); it returns the item's accelerator.
export const menu = (label, under) => app.evaluate(({ Menu }, [l, u]) => {
  const find = items => { for (const i of items) { if (i.label === l && !i.submenu) return i; const f = i.submenu && find(i.submenu.items); if (f) return f } }
  const item = find(u ? Menu.getApplicationMenu().items.find(i => i.label === u).submenu.items : Menu.getApplicationMenu().items)
  item.click()
  return item.accelerator
}, [label, under])

async function checks() {
  await start()
  await win.getByText('Something is wrong? Start here').waitFor()
  await win.locator('#tabs').waitFor({ state: 'attached' })
  assert.ok(await win.locator('#tabs').isHidden(), 'start screen: the tab bar is hidden')
  // The toolbar (E2.1): the controls by accessible name, the Mac chrome, the Run button's label.
  for (const [role, name] of [['button', 'Open package'], ['combobox', 'Item'], ['button', 'Run'], ['button', 'Test saving'], ['button', 'Inspector'], ['button', 'Help']])
    assert.ok(await win.getByRole(role, { name, exact: true }).isVisible(), `the toolbar has ${name}`)
  assert.ok(await win.getByRole('button', { name: 'Record macro' }).isHidden(), 'Record shows only while a run is going')
  assert.equal((await win.locator('#toolbar').boundingBox()).height, 52, 'the toolbar is 52 px high')
  assert.equal(await win.evaluate(() => document.body.classList.contains('mac')), process.platform === 'darwin', 'body.mac on macOS only')
  assert.equal(await win.evaluate(() => getComputedStyle(document.getElementById('toolbar')).paddingLeft), process.platform === 'darwin' ? '78px' : '12px', 'room for the traffic lights')
  console.log('ui: start screen ok')

  await open(goodZip())
  assert.match(await text('#pkg-name'), /good\.zip/, 'the package name shows')
  assert.ok(await win.getByRole('button', { name: 'Run', exact: true }).isEnabled(), 'Run is enabled')
  console.log('ui: package open ok')

  // ⌘R runs and ⌘. stops (the menu items carry the shortcuts), and the Run button's label follows the run.
  const runMenu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(i => i.label === 'Run').submenu.items.map(i => i.accelerator))
  assert.deepEqual(runMenu.slice(0, 3), ['CmdOrCtrl+R', 'CmdOrCtrl+.', 'Alt+CmdOrCtrl+R'], 'Run menu: ⌘R, ⌘. and ⌥⌘R')
  await menu('Run', 'Run')
  await win.getByRole('button', { name: 'Stop', exact: true }).waitFor()
  assert.equal(await text('#run-text'), 'Stop', 'the label says Stop while a run is going')
  await menu('Stop', 'Run')
  await win.locator('#runs li').first().waitFor()
  await win.getByRole('button', { name: 'Run', exact: true }).waitFor()
  assert.equal(await text('#run-text'), 'Run', 'the label says Run again')
  console.log('ui: run menu ok')

  await launch()
  await win.locator('#status').filter({ hasText: 'Recording' }).waitFor()   // the run is live
  await win.waitForTimeout(3000)
  await stop()
  assert.ok(await win.locator('#runs li').count() >= 1, 'a run is listed')
  await view('Findings')
  await win.locator('#view .finding').first().waitFor()
  assert.ok(await win.locator('#view .finding').count() >= 1, 'Findings shows at least one finding')
  console.log('ui: launch, stop, findings ok')

  await win.getByRole('button', { name: 'Help', exact: true }).click()
  await win.locator('#docs:not([hidden])').waitFor()
  await win.waitForFunction(() => document.querySelector('#doc-body').innerText.length > 200)   // the user guide has loaded
  await win.getByRole('button', { name: 'Close the documentation' }).click()
  await win.locator('#docs[hidden]').waitFor({ state: 'attached' })
  console.log('ui: help panel ok')

  assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items[0].submenu.items.find(i => i.label === 'Settings…').accelerator), 'CmdOrCtrl+,', 'Settings… is ⌘,')
  await menu('Settings…')
  await win.locator('#settings[open]').waitFor()
  await win.keyboard.press('Escape')
  await win.locator('#settings:not([open])').waitFor({ state: 'attached' })
  console.log('ui: settings ok')

  // Record (E1.3): Record, click Next in the course, stop. The dialog keeps the one click; Discard keeps the macro as it was.
  await recordRound()
  assert.match(await win.locator('#record-title').textContent(), /^Save 1 step as the macro\?$/, 'the dialog says 1 step')
  await win.locator('#record-dialog').getByRole('button', { name: 'Save', exact: true }).click()
  await win.locator('#record-dialog:not([open])').waitFor({ state: 'attached' })
  assert.match(await win.locator('#macro').textContent(), /1 event/, 'the macro summary says 1 event')
  await recordRound()
  await win.locator('#record-dialog').getByRole('button', { name: 'Discard', exact: true }).click()
  await win.locator('#record-dialog:not([open])').waitFor({ state: 'attached' })
  assert.match(await win.locator('#macro').textContent(), /1 event/, 'Discard leaves the earlier macro unchanged')
  console.log('ui: record ok')

  // View → Show Inspector (⌥⌘I) toggles the right pane.
  assert.equal(await menu('Show Inspector', 'View'), 'Alt+CmdOrCtrl+I')
  await win.locator('#inspector:not([hidden])').waitFor()
  await menu('Show Inspector', 'View')
  await win.locator('#inspector[hidden]').waitFor({ state: 'attached' })
  console.log('ui: inspector ok')
  assert.deepEqual(errors, [], 'no uncaught errors in the window')
  await webChecks()
  console.log('ui: web toolbar ok')
}

// The web interface (npm run serve) in Playwright's Chromium: the same toolbar, no room kept for traffic lights, no errors in the console.
async function webChecks() {
  const srv = spawn(electron, [root, '--serve=0', '--no-window'], { env: { ...process.env, PACKAGE_LAB_DATA: join(dir(), 'web-data') }, stdio: ['ignore', 'pipe', 'ignore'] })
  let log = ''; srv.stdout.on('data', d => { log += d })
  // Playwright's own Chromium; if this Playwright version's build isn't installed, any Chromium build in its cache will do (the page is plain HTML).
  const browser = await chromium.launch().catch(() => {
    const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright'), found = existsSync(cache) ? readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort().reverse() : []
    const exe = found.map(d => join(cache, d)).flatMap(d => readdirSync(d).filter(x => x.startsWith('chrome-')).map(x => join(d, x))).map(d => join(d, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')).find(existsSync)
    if (!exe) throw new Error('No Chromium for Playwright: run npx playwright install chromium')
    return chromium.launch({ executablePath: exe })
  })
  try {
    for (let i = 0; i < 150 && !/http:\/\/\S+/.test(log); i++) await new Promise(r => setTimeout(r, 200))
    const url = /http:\/\/\S+/.exec(log)?.[0]
    assert.ok(url, 'the web interface started')
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } }), problems = []
    p.on('pageerror', e => problems.push(e.message)); p.on('console', m => { if (m.type() === 'error') problems.push(m.text() + ' ' + (m.location().url ?? '')) })
    await p.goto(url)
    await p.locator('#toolbar').waitFor()
    for (const [role, name] of [['button', 'Open package'], ['combobox', 'Item'], ['button', 'Run'], ['button', 'Test saving'], ['button', 'Inspector'], ['button', 'Help']])
      assert.ok(await p.getByRole(role, { name, exact: true }).isVisible(), `web: the toolbar has ${name}`)
    assert.ok(await p.getByRole('button', { name: 'Record macro' }).isHidden(), 'web: no Record button')
    assert.equal(await p.evaluate(() => document.body.classList.contains('mac')), false, 'web: no body.mac')
    assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById('toolbar')).paddingLeft), '12px', 'web: no gap for traffic lights')
    assert.equal(await p.evaluate(() => document.documentElement.style.getPropertyValue('--accent')), '', 'web: the accent stays the CSS default')
    await p.waitForTimeout(500)
    assert.deepEqual(problems, [], 'web: no errors in the console: ' + problems.join(' | '))
  } finally { await browser.close(); srv.kill() }
}

// Launches with Record pressed, clicks Next in the course window, and stops. Leaves the Save/Discard dialog open.
async function recordRound() {
  await launch()
  await win.getByRole('button', { name: 'Record macro', exact: true }).click()
  await win.locator('#record[aria-pressed="true"]').waitFor()
  await clickNext(await runWindow())
  await stop()
  await win.locator('#record-dialog[open]').waitFor()
}
// The run window is the window that isn't the main one and shows the course's host (the LMS address, not a file or about: page).
// It is shown, so its mouse reaches the course.
async function runWindow() {
  for (let i = 0; i < 100; i++) {
    const run = app.windows().find(w => w !== win && /^https?:/.test(w.url()))
    if (run) return run
    await win.waitForTimeout(200)
  }
  throw new Error('The run window never opened')
}
// Clicks the middle of the course's Next button with the run window's mouse, at its measured position (in whichever frame it is).
async function clickNext(run) {
  for (let i = 0; i < 100; i++) {
    for (const f of run.frames()) {
      if (!await f.locator('#next').count()) continue
      const box = await f.locator('#next').boundingBox()
      if (box) return run.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    }
    await run.waitForTimeout(200)
  }
  throw new Error('Next never appeared in the run window')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = Date.now()
  const bail = async code => { await cleanup(); process.exit(code) }
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => bail(1))
  setTimeout(() => bail(1).finally(() => process.exit(1)), 100000).unref()   // under the 120 s timeout test/test.js gives it
  try { await checks(); console.log(`ui: ok (${Math.round((Date.now() - t0) / 1000)} s)`) }
  catch (e) { console.error(e); process.exitCode = 1 }
  finally { await cleanup() }
}
