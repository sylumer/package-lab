// UI smoke test (E0.1): opens the real desktop app with Playwright's Electron driver, clicks through it and fails if a
// visible behaviour breaks. Run by `npm run test:ui`, and by `node test/test.js --slow`. The helpers are exported so
// later work packages and scripts/screenshots.js can drive the same window. The app keeps its data in a temp folder.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
import { _electron, chromium } from 'playwright'
import { VIEWPORTS } from '../src/options.js'

const root = fileURLToPath(new URL('..', import.meta.url))
let app = null, win = null, work = null
export const errors = []   // uncaught errors from any window this file opened
const dir = () => work ??= mkdtempSync(join(tmpdir(), 'package-lab-ui-'))

// The `good` fixture, built the way test/test.js builds it: src/sample, zipped.
export function goodZip() {
  const d = join(dir(), 'good')
  cpSync(join(root, 'src', 'sample'), d, { recursive: true })
  execFileSync('zip', ['-qr', join(dir(), 'good.zip'), '.'], { cwd: d })
  return join(dir(), 'good.zip')
}

// Starts the app (with a package, if given) on a throwaway data folder, and returns its window.
export async function start(zip) {
  await close()
  app = await _electron.launch({ args: zip ? [root, zip] : [root], env: { ...process.env, PACKAGE_LAB_DATA: join(dir(), 'data') } })
  win = await app.firstWindow()
  win.on('pageerror', e => errors.push(e.message))
  win.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await win.waitForLoadState('domcontentloaded')
  return win
}
export async function close() { const a = app; app = win = null; if (a) await a.close().catch(() => {}) }
export const page = () => win
// Sets the main window's content size (scripts/screenshots.js uses 1280 × 800). The main window is the one that loads the UI page.
export const contentSize = (w, h) => app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows().find(x => /src\/ui\/index\.html$/.test(x.webContents.getURL())).setContentSize(w, h), [w, h])
// Brings the main window to the front and focuses it (a run's course window takes focus, which dims the main window's sidebar).
export const focusMain = () => app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); BrowserWindow.getAllWindows().find(x => /src\/ui\/index\.html$/.test(x.webContents.getURL())).focus() })
// Closes the app and removes the temp folder.
export async function cleanup() { await close(); if (work) rmSync(work, { recursive: true, force: true, maxRetries: 5 }); work = null }
// There is no handler to open a package in a running app, so this restarts the app with the package as an argument.
export const open = async zip => { await start(zip); await win.locator('#pkg-name').filter({ hasText: /\.zip$/ }).waitFor() }
// Runs the package and waits until the run is live.
// Run and Stop are one toolbar button: its name is Run until a run is live, then Stop.
export async function launch() { await win.getByRole('button', { name: 'Run', exact: true }).click(); await win.getByRole('button', { name: 'Stop', exact: true }).waitFor() }
export async function stop() { await win.getByRole('button', { name: 'Stop', exact: true }).click(); await win.locator('#runs li').first().waitFor() }
export const view = (name, p = win) => p.locator('#views').getByRole('button', { name, exact: true }).click()
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
  await win.locator('#views').waitFor({ state: 'attached' })
  assert.ok(await win.locator('#views').isHidden(), 'start screen: the view list is hidden')
  assert.equal(await win.locator('#tabs').count(), 0, 'there is no tab bar any more')
  // The toolbar (E2.1): the controls by accessible name, the Mac chrome, the Run button's label.
  for (const [role, name] of [['button', 'Open package'], ['combobox', 'Item'], ['button', 'Run'], ['button', 'Test saving'], ['button', 'Inspector'], ['button', 'Help']])
    assert.ok(await win.locator('#toolbar').getByRole(role, { name, exact: true }).isVisible(), `the toolbar has ${name}`)
  assert.ok(await win.getByRole('button', { name: 'Record macro' }).isHidden(), 'Record shows only while a run is going')
  assert.equal((await win.locator('#toolbar').boundingBox()).height, 52, 'the toolbar is 52 px high')
  assert.equal(await win.evaluate(() => document.body.classList.contains('mac')), process.platform === 'darwin', 'body.mac on macOS only')
  assert.equal(await win.evaluate(() => getComputedStyle(document.getElementById('toolbar')).paddingLeft), process.platform === 'darwin' ? '78px' : '12px', 'room for the traffic lights')
  console.log('ui: start screen ok')

  assert.ok(await win.locator('#summary').isHidden(), 'no chip in a clean state')
  await open(goodZip())
  assert.match(await text('#pkg-name'), /good\.zip/, 'the package name shows')
  assert.ok(await win.getByRole('button', { name: 'Run', exact: true }).isEnabled(), 'Run is enabled')
  console.log('ui: package open ok')

  // Drop (E2.5). The overlay shows while a file is dragged over the window and goes when the drag leaves. A .txt is refused with the
  // message and changes nothing. A desktop drop of good.zip can't be dispatched: a File the page made has no place on disk, so the
  // desktop path is tested through open-path, the handler a drop calls (see decisions.md).
  await dispatchFile(win, 'dragenter', 'good.zip')
  await win.locator('#drop').waitFor()
  assert.equal(await text('#drop'), 'Drop to open', 'dragging a file over the window shows Drop to open')
  await dispatchFile(win, 'dragleave', 'good.zip')
  await win.locator('#drop').waitFor({ state: 'hidden' })
  await dispatchFile(win, 'drop', 'notes.txt', Buffer.from('not a package'))
  assert.equal(await win.locator('#status').textContent(), 'Only .zip packages can be opened', 'a .txt is refused with the message')
  assert.match(await text('#pkg-name'), /good\.zip/, 'and the package stays open')
  // With a dialog open (Settings), a drag shows no overlay: the window takes no drops then.
  await menu('Settings…')
  await win.locator('#settings[open]').waitFor()
  await dispatchFile(win, 'dragenter', 'good.zip')
  assert.ok(await win.locator('#drop').isHidden(), 'no Drop to open overlay while a dialog is open')
  await win.keyboard.press('Escape')
  await win.locator('#settings:not([open])').waitFor({ state: 'attached' })
  const openPathError = path => win.evaluate(path => lab.invoke('open-path', { path }).then(() => '', e => e.message), path)
  const notes = join(dir(), 'notes.txt'), folder = join(dir(), 'folder.zip'), missing = join(dir(), 'missing.zip')
  writeFileSync(notes, 'not a package'); mkdirSync(folder)
  assert.match(await openPathError(notes), /Only \.zip packages can be opened/, 'open-path refuses a file that is not a .zip')
  assert.match(await openPathError(folder), /isn’t a file, so it can’t be opened/, 'open-path refuses a folder named .zip')
  assert.match(await openPathError(missing), /isn’t a file, so it can’t be opened/, 'open-path refuses a .zip that does not exist')
  assert.match(await openPathError(''), /Drop the file from Finder/, 'open-path refuses an empty path')
  assert.match((await win.evaluate(path => lab.invoke('open-path', { path }), goodZip())).name, /good\.zip$/, 'open-path opens a .zip file')
  console.log('ui: drop ok')

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
  await clickCourse(await runWindow(), '#exit')   // Save and exit: the course finishes, so the run reaches every step (E2.4)
  await stop()
  assert.ok(await win.locator('#runs li').count() >= 1, 'a run is listed')
  await view('Findings')
  await win.locator('#view .finding').first().waitFor()
  assert.ok(await win.locator('#view .finding').count() >= 1, 'Findings shows at least one finding')
  // E2.4: the banner at the top of Findings says how the run went: the icon and the word, then the sentence.
  assert.match(await text('#view .verdict'), /^Good\s+Ran through: /, 'after a run of good, the banner says Good and Ran through')
  console.log('ui: launch, stop, findings ok')

  // The live view (E4.1): no frame is captured while nobody watches; Show in Package Lab opens it; a frame comes within 3 s; hovering fills
  // the coordinates bar; Copy puts the position on the clipboard.
  await launch()
  await app.evaluate(({ webContents }) => { globalThis.captures = 0; for (const w of webContents.getAllWebContents()) { const f = w.capturePage.bind(w); w.capturePage = (...a) => { globalThis.captures++; return f(...a) } } })
  await win.waitForTimeout(1200)
  assert.equal(await app.evaluate(() => globalThis.captures), 0, 'live: nothing is captured while nobody watches')
  await win.getByRole('button', { name: 'Show in Package Lab', exact: true }).click()
  await win.locator('#view img.live-frame[src^="data:image/jpeg"]').waitFor({ timeout: 3000 })
  assert.ok(await app.evaluate(() => globalThis.captures) > 0, 'live: frames are captured once Live is open')
  assert.ok(await win.getByRole('button', { name: 'Show in Package Lab', exact: true }).isHidden(), 'live: the link goes when Live is open')
  await win.locator('.live-frame').hover({ position: { x: 40, y: 40 } })
  await win.locator('.live-pos').filter({ hasText: /^x \d+ {2}y \d+ px · [\d.]+% [\d.]+%/ }).waitFor({ timeout: 3000 })
  await win.getByRole('button', { name: 'Copy', exact: true }).click()
  await win.locator('.live-bar').getByText('Copied', { exact: true }).waitFor()
  assert.match(await app.evaluate(({ clipboard }) => clipboard.readText()), /^x=\d+ y=\d+/, 'live: Copy puts the position on the clipboard')
  await win.getByRole('button', { name: 'Crosshair', exact: true }).click()
  assert.equal(await win.getByRole('button', { name: 'Crosshair', exact: true }).getAttribute('aria-pressed'), 'true', 'live: Crosshair toggles')
  await win.getByRole('button', { name: 'Crosshair', exact: true }).click()
  // live-watch on then off leaves 0; a reload of the window with Live open leaves no watcher.
  const watchers = () => win.evaluate(() => lab.invoke('state').then(s => s.liveWatchers))
  assert.equal(await watchers(), 1, 'live: the open Live view is one watcher')
  await win.reload(); await win.waitForLoadState('domcontentloaded')
  assert.equal(await watchers(), 0, 'live: a reload leaves no watcher')
  await win.evaluate(() => lab.invoke('live-watch', { on: true })); await win.evaluate(() => lab.invoke('live-watch', { on: true })); await win.evaluate(() => lab.invoke('live-watch', { on: false }))
  assert.equal(await watchers(), 0, 'live: on twice then off leaves 0')
  await win.evaluate(() => lab.invoke('stop'))
  await open(goodZip())   // the reload dropped the package and the run: start again for what follows
  console.log('ui: live view ok')
  await viewChecks()

  await win.getByRole('button', { name: 'Help', exact: true }).click()
  await win.locator('#docs:not([hidden])').waitFor()
  await win.waitForFunction(() => document.querySelector('#doc-body').innerText.length > 200)   // the user guide has loaded
  // The document list is under its four groups (E3.1), and Getting started opens from it.
  assert.deepEqual(await win.locator('#doc-pick optgroup').evaluateAll(gs => gs.map(g => g.label)), ['Help', 'Recipes and findings', 'Reference', 'Authoring tools'], 'help: the list shows the four groups')
  await win.locator('#doc-pick').selectOption({ label: 'Getting started' })
  await win.waitForFunction(() => document.querySelector('#doc-pick').value === 'help/getting-started.md' && document.querySelector('#doc-body h1')?.innerText === 'Getting started')
  console.log('ui: help groups and getting started ok')
  // E3.2: search finds Run settings; the Storage ⓘ opens Run settings at Storage; the contents list the page's headings.
  await win.locator('#doc-search').fill('partitioned')
  await win.locator('#doc-results button', { hasText: 'Run settings' }).first().waitFor()
  await win.locator('#doc-results button', { hasText: 'Run settings' }).first().click()
  await win.waitForFunction(() => document.querySelector('#doc-pick').value === 'help/run-settings.md')
  assert.ok(await win.locator('#doc-toc li').count() > 3, 'help: On this page lists the headings')
  await win.getByRole('button', { name: 'Close the inspector' }).click()
  await win.locator('#inspector[hidden]').waitFor({ state: 'attached' })
  await win.getByRole('button', { name: 'Inspector', exact: true }).click()
  await win.getByRole('tab', { name: 'Settings' }).click()
  await win.getByRole('button', { name: 'Help: Storage' }).click()
  await win.waitForFunction(() => document.querySelector('#doc-pick').value === 'help/run-settings.md' && document.querySelector('#doc-body h3')?.innerText === 'Storage')
  assert.ok(await win.evaluate(() => { const r = document.querySelector('#doc-body h3').getBoundingClientRect(), b = document.querySelector('#doc-body').getBoundingClientRect(); return r.top >= b.top - 1 && r.top < b.bottom }), 'help: Storage is scrolled into view')
  console.log('ui: help search and context help ok')
  await win.getByRole('button', { name: 'Close the inspector' }).click()
  await win.locator('#inspector[hidden]').waitFor({ state: 'attached' })   // Close shuts the inspector, Help being one of its segments
  console.log('ui: help panel ok')

  // The User Guide is a window of its own: the Help panel's User Guide button opens it, with its contents and a chapter.
  await win.getByRole('button', { name: 'Help', exact: true }).click()
  const [guideWin] = await Promise.all([app.waitForEvent('window'), win.locator('#doc-guide').click()])
  await guideWin.waitForFunction(() => document.querySelectorAll('#toc button').length > 15 && document.querySelector('#page h1')?.innerText)
  assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(i => i.role === 'help').submenu.items[0].label), 'User Guide', 'the Help menu starts with User Guide')
  await guideWin.locator('#toc button', { hasText: '9. Macros' }).click()
  await guideWin.waitForFunction(() => document.querySelector('#page h1')?.innerText === '9. Macros: playing the learner' && document.querySelectorAll('#page button.practice').length > 3)
  assert.equal(await guideWin.locator('#next').innerText(), '10. Saving and resuming →', 'guide: Next leads to the next chapter')
  await guideWin.close()
  await win.getByRole('button', { name: 'Close the inspector' }).click()
  console.log('ui: user guide window ok')

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

  // View → Show Inspector (⌥⌘I) toggles the right pane (E2.2): Settings, Macro and Help in one pane, Advanced closed to begin with.
  assert.equal(await menu('Show Inspector', 'View'), 'Alt+CmdOrCtrl+I')
  await win.locator('#inspector:not([hidden])').waitFor()
  assert.equal(await win.getByRole('tab', { name: 'Help', exact: true }).getAttribute('aria-selected'), 'true', 'the inspector opens on the segment it was last on (Help, above)')
  await win.getByRole('tab', { name: 'Settings', exact: true }).click()
  assert.equal(await win.locator('#advanced').evaluate(e => e.open), false, 'Advanced is closed by default')
  assert.ok(await win.locator('#depth').isHidden(), 'the Advanced controls are not shown')
  assert.equal((await win.locator('#inspector').boundingBox()).width, 340, 'the inspector is 340 px wide')
  await win.getByRole('tab', { name: 'Settings', exact: true }).focus()
  await win.keyboard.press('ArrowRight')
  assert.equal(await win.getByRole('tab', { name: 'Macro', exact: true }).getAttribute('aria-selected'), 'true', 'the arrow keys move through the segments')
  assert.ok(await win.locator('#macro').isVisible(), 'Macro shows the macro box')
  await win.getByRole('tab', { name: 'Settings', exact: true }).click()
  await win.getByRole('separator', { name: 'Resize the inspector' }).focus()
  await win.keyboard.press('ArrowLeft')
  assert.equal((await win.locator('#inspector').boundingBox()).width, 360, 'ArrowLeft on the handle widens the inspector')
  await win.keyboard.press('ArrowRight')
  // Device size iPhone: the chip beside Run names it, and a run saves the iPhone preset as its viewport.
  assert.doesNotMatch(await win.locator('#summary').textContent(), /iPhone/, 'no iPhone chip yet (the macro recorded above shows as a chip of its own)')
  await win.locator('#viewport').selectOption('iphone')
  assert.match(await win.locator('#summary').innerText(), /iPhone/, 'the chip says iPhone')
  await menu('Show Inspector', 'View')
  await win.locator('#inspector[hidden]').waitFor({ state: 'attached' })
  assert.ok(await win.locator('#summary').isVisible(), 'the chip stays beside Run with the inspector shut')
  await win.locator('#summary').click()
  await win.locator('#inspector:not([hidden])').waitFor()
  assert.equal(await win.getByRole('tab', { name: 'Settings', exact: true }).getAttribute('aria-selected'), 'true', 'the chip opens Settings')
  const before = new Set(readdirSync(join(dir(), 'data', 'runs')))
  await launch(); await win.waitForTimeout(1500); await stop()
  await win.waitForFunction(() => document.querySelector('#view').innerText.includes('Saved to /'))
  const saved = readdirSync(join(dir(), 'data', 'runs')).filter(f => !before.has(f))
  assert.equal(saved.length, 1, 'the run was saved')
  assert.deepEqual(JSON.parse(readFileSync(join(dir(), 'data', 'runs', saved[0]), 'utf8')).launch.options.viewport, VIEWPORTS.iphone, 'the run saved the iPhone preset as launch.options.viewport')
  await win.locator('#viewport').selectOption('')
  await win.waitForFunction(() => !document.getElementById('summary').textContent.includes('iPhone'))
  console.log('ui: inspector ok')

  // File → Record a Working Copy… opens its dialog, which has the address field.
  await menu('Record a Working Copy…', 'File')
  await win.locator('#ref-dialog[open]').waitFor()
  assert.ok(await win.getByRole('textbox', { name: 'Address' }).isVisible(), 'the dialog has the address field')
  await win.keyboard.press('Escape')
  await win.locator('#ref-dialog:not([open])').waitFor({ state: 'attached' })
  console.log('ui: working copy dialog ok')

  // The macro editor (E4.2): the macro recorded above has 1 step. Add a wait for "Next" (an empty one is refused, naming the text), move it
  // before the click, save it as "next", restart the app on the same data: "next" is listed and loads with 2 steps.
  const macroPane = async () => {
    if (await win.locator('#inspector').isHidden()) await menu('Show Inspector', 'View')
    await win.getByRole('tab', { name: 'Macro', exact: true }).click()
  }
  await macroPane()
  const steps = win.locator('.macro-table tbody tr')
  await steps.first().waitFor()
  assert.equal(await steps.count(), 1, 'the table shows the recorded click')
  assert.match(await steps.first().innerText(), /Click/, 'its action is Click')
  await win.locator('#wait-kind').selectOption('text')
  await win.getByRole('button', { name: 'Add wait', exact: true }).click()
  assert.match(await win.locator('.macro-wait .field-err').innerText(), /text/, 'an empty wait is refused, and the message names the text')
  await win.getByRole('textbox', { name: 'Text to wait for' }).fill('Next')
  await win.getByRole('button', { name: 'Add wait', exact: true }).click()
  await win.locator('.macro-table tbody tr').nth(1).waitFor()
  assert.match(await steps.nth(1).innerText(), /wait for “Next” \(30 s\)/, 'the wait is added after the last step')
  await win.getByRole('button', { name: 'Move step 2 up' }).click()
  await win.locator('.macro-table tbody tr:first-child td:nth-child(3)').filter({ hasText: 'Wait' }).waitFor()
  assert.match(await win.locator('#macro-summary').innerText(), /^2 events/, 'the summary counts both steps')
  await win.getByRole('button', { name: 'Save As…', exact: true }).click()
  await win.getByRole('textbox', { name: 'Name for the macro' }).fill('../x')
  await win.getByRole('button', { name: 'Save', exact: true }).click()
  assert.match(await win.locator('#macro .row:has(#macro-name) .field-err').innerText(), /name/, 'a bad name is refused')
  await win.getByRole('textbox', { name: 'Name for the macro' }).fill('next')
  await win.getByRole('button', { name: 'Save', exact: true }).click()
  await win.locator('#macro-saved option', { hasText: 'next (2 steps' }).waitFor({ state: 'attached' })
  await open(goodZip())
  await macroPane()
  await win.locator('#macro-saved option', { hasText: 'next (2 steps' }).waitFor({ state: 'attached' })
  assert.match(await win.locator('#macro-summary').innerText(), /^None/, 'a restarted app has no macro until one is loaded')
  await win.locator('#macro-saved').selectOption('next')
  await win.locator('.macro-table tbody tr').nth(1).waitFor()
  assert.equal(await win.locator('.macro-table tbody tr').count(), 2, '"next" loads with 2 steps')
  assert.match(await win.locator('#macro-summary').innerText(), /^2 events/, 'and the summary says so')
  console.log('ui: macro editor ok')
  assert.deepEqual(await longTitles(win), [], 'no title attribute is longer than 100 characters')
  assert.deepEqual(errors, [], 'no uncaught errors in the window')
  await themeChecks()
  await webChecks()
  console.log('ui: web toolbar ok')
}

// Appearance (E3.4): the choice in Settings sets data-theme and nativeTheme.themeSource at once, is still there after a restart, and never reaches a
// run window: the course sees the Mac's own appearance (the opposite of the choice here).
const BG = { light: '#fff', dark: '#1c1c1e' }
const themeState = w => w.evaluate(() => ({ attr: document.documentElement.dataset.theme ?? null, bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() }))
async function chooseTheme(name) {
  await menu('Settings…'); await win.locator('#settings[open]').waitFor()
  await win.getByRole('radio', { name }).check()
  await win.keyboard.press('Escape'); await win.locator('#settings:not([open])').waitFor({ state: 'attached' })
}
const themeSource = () => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)
async function themeChecks() {
  assert.equal(await themeSource(), 'system', 'theme: the default is System')
  await chooseTheme('Dark')
  assert.deepEqual(await themeState(win), { attr: 'dark', bg: BG.dark }, 'theme: Dark sets the attribute and the dark --bg')
  assert.equal(await themeSource(), 'dark', 'theme: Dark sets nativeTheme.themeSource')
  await start()   // same data folder: the choice is kept
  assert.deepEqual(await themeState(win), { attr: 'dark', bg: BG.dark }, 'theme: still dark after a restart')
  assert.equal(await themeSource(), 'dark', 'theme: and nativeTheme follows it at startup')
  await chooseTheme('System')
  assert.equal((await themeState(win)).attr, null, 'theme: System removes the attribute')
  assert.equal(await themeSource(), 'system', 'theme: System sets themeSource back')
  await chooseTheme('Light')
  assert.deepEqual(await themeState(win), { attr: 'light', bg: BG.light }, 'theme: Light gives the light --bg')
  // Keyboard: the group is native radios, so the arrow keys move between them.
  await menu('Settings…'); await win.locator('#settings[open]').waitFor()
  await win.getByRole('radio', { name: 'Light' }).focus(); await win.keyboard.press('ArrowRight')
  assert.equal((await themeState(win)).attr, 'dark', 'theme: the arrow keys change the choice')
  await win.keyboard.press('Escape')
  console.log('ui: theme ok')
  if (process.platform === 'darwin') {   // the Mac's appearance is read with systemPreferences.getUserDefault, which only the Mac has
    // The course sees the real system appearance: with the choice opposite to the Mac's, a run of `good` still reports the Mac's.
    const osDark = await app.evaluate(({ systemPreferences }) => systemPreferences.getUserDefault('AppleInterfaceStyle', 'string') === 'Dark')
    await chooseTheme(osDark ? 'Light' : 'Dark')
    await open(goodZip())
    assert.equal(await themeSource(), osDark ? 'light' : 'dark', 'theme: the app is set opposite to the Mac')
    await launch()
    const run = await runWindow()
    await run.waitForLoadState('domcontentloaded')
    assert.equal(await run.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches), osDark, 'theme: the run window reports the Mac’s appearance, not the app’s')
    await stop()
    await chooseTheme('System')
    console.log('ui: theme in run windows ok')
  } else console.log('skipped (needs a Mac): theme in run windows')
}

// The grouped view list (E2.3), after a run of `good`: every group, the table filter, ⌘1, arrow keys, and every visible view drawn without an error.
const GROUPS = ['Summary', 'Package', 'What happened', 'Deep dive', 'Tools']
async function viewChecks() {
  const trace = on => win.locator('#trace').evaluate((e, on) => { e.checked = on; e.dispatchEvent(new Event('change', { bubbles: true })) }, on)
  await trace(true); await launch(); await win.waitForTimeout(2000); await stop(); await trace(false)   // a traced run, so Execution and the code views have something
  const views = win.locator('#views'), names = () => views.locator('nav').getByRole('button').allInnerTexts()
  assert.deepEqual(await views.locator('h2').evaluateAll(hs => hs.map(h => h.firstChild.textContent)), GROUPS, 'every group shows after a run of good')
  assert.ok(!(await names()).includes('Compare'), 'Compare is hidden until a comparison exists')
  assert.ok((await names()).includes('Live'), 'Live is listed on the desktop too (E4.1)')
  await view('Network')
  assert.equal(await views.locator('[aria-current=page]').innerText(), 'Network', 'the chosen view is aria-current')
  await win.locator('#view table').waitFor()
  assert.ok(await win.locator('#filter').isVisible(), 'the filter box shows over a table')
  await view('Boot path')
  await win.keyboard.press(process.platform === 'darwin' ? 'Meta+1' : 'Control+1')
  assert.equal(await views.locator('[aria-current=page]').innerText(), 'Findings', '⌘1 selects Findings')
  await views.locator('[aria-current=page]').focus()
  await win.keyboard.press('ArrowDown')
  const all = await names()
  assert.equal(await views.locator('[aria-current=page]').innerText(), all[all.indexOf('Findings') + 1], '↓ moves to the next visible view')
  assert.ok(await views.locator('[aria-current=page]').evaluate(e => e === document.activeElement), 'and keeps the focus')
  await win.keyboard.press('ArrowUp')
  assert.equal(await views.locator('[aria-current=page]').innerText(), 'Findings', '↑ moves back')
  // Every visible view renders, with nothing in the console.
  const seen = errors.length
  for (const n of all) { await view(n); await win.waitForTimeout(100); assert.ok(await win.locator('#view').evaluate(e => e.children.length > 0), `${n} draws something`) }
  assert.equal(errors.length, seen, 'no error while visiting every view: ' + errors.slice(seen).join(' | '))
  console.log(`ui: ${all.length} views ok`)
}

// Starts the web interface (npm run serve) and Playwright's Chromium, and gives fn a page on it plus the list of console problems.
export async function withWeb(fn) {
  const srv = spawn(electron, [root, '--serve=0', '--no-window'], { env: { ...process.env, PACKAGE_LAB_DATA: join(dir(), 'web-data') }, stdio: ['ignore', 'pipe', 'ignore'] })
  let log = ''; srv.stdout.on('data', d => { log += d })
  // Playwright's own Chromium; if this Playwright version's build isn't installed, any Chromium build in its cache will do (the page is plain HTML).
  const browser = await chromium.launch().catch(() => {
    // Mac-only fallback: the Playwright cache and the Chrome for Testing .app bundle are looked for where the Mac keeps them.
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
    await fn(p, problems)
  } finally { await browser.close(); srv.kill() }
}

// Sets every launch-option control the window exposes to a value that isn't the default (E2.2), the way a person would, and
// returns what launchOptions() made of it (the argument of the `options` call) and the Copy as CLI command line. It sets the
// controls by id and fires their change events, so it works wherever the controls sit. test/fixtures/launch-options-before.json
// holds what the window made of these choices before the inspector moved the controls; webChecks compares against it.
export async function everyChoice(p) {
  await p.locator('#file').setInputFiles(goodZip())
  await p.locator('#pkg-name').filter({ hasText: /\.zip$/ }).waitFor()
  await p.locator('#profile option[value=moodle]').waitFor({ state: 'attached' })
  await p.evaluate(() => { window.__options = []; const o = lab.invoke; lab.invoke = (n, a) => { if (n === 'options') window.__options.push(a); return o.call(lab, n, a) } })
  const set = (id, v) => p.evaluate(([id, v]) => { const e = document.getElementById(id); if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })) }, [id, v])
  await set('profile', 'moodle')
  // A profile field changed from the preset's (the fields are drawn again when the profile changes, so this comes after it).
  await p.evaluate(() => { const l = [...document.querySelectorAll('#profile-fields label')].find(x => x.firstChild.textContent === 'API delay (ms)'); l.querySelector('input').value = '250'; l.querySelector('input').dispatchEvent(new Event('change', { bubbles: true })) })
  for (const [id, v] of [['expose', '2004'], ['depth', '2'], ['opener', true], ['resume', true], ['caught', false], ['auto', '30'], ['launch-params', 'a=1&b=2'], ['trace', true], ['storage', 'blocked'], ['tool', 'storyline'],
    ['browser', 'webkit'], ['viewport', 'custom'], ['viewport-w', '500'], ['viewport-h', '700'], ['record-input', true]]) await set(id, v)
  // A pin, through the Lookups tab's form.
  await view('Lookups', p)
  await p.locator('#view').getByLabel('Name to pin').fill('previewMode'); await p.locator('#view').getByLabel('Value as JSON').fill('false')
  await p.locator('#view').getByRole('button', { name: 'Add pin', exact: true }).click()
  await set('item', await p.evaluate(() => document.getElementById('item').value))
  await p.waitForTimeout(500)
  return p.evaluate(() => ({ options: window.__options.at(-1), cli: document.getElementById('cli-line').textContent }))
}

// The web interface in Playwright's Chromium: the same toolbar, no room kept for traffic lights, no errors in the console.
async function webChecks() {
  await withWeb(async (p, problems) => {
    for (const [role, name] of [['button', 'Open package'], ['combobox', 'Item'], ['button', 'Run'], ['button', 'Test saving'], ['button', 'Inspector'], ['button', 'Help']])
      assert.ok(await p.locator('#toolbar').getByRole(role, { name, exact: true }).isVisible(), `web: the toolbar has ${name}`)
    for (const id of ['ref', 'compare-pkg', 'export']) assert.ok(await p.locator('#' + id).isVisible(), `web: #${id} is visible`)
    assert.ok(await p.locator('#check-folder').isHidden(), 'web: Check a folder is desktop only')
    assert.ok(await p.getByRole('button', { name: 'Record macro' }).isHidden(), 'web: no Record button')
    assert.equal(await p.evaluate(() => document.body.classList.contains('mac')), false, 'web: no body.mac')
    assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById('toolbar')).paddingLeft), '12px', 'web: no gap for traffic lights')
    assert.equal(await p.evaluate(() => document.documentElement.style.getPropertyValue('--accent')), '', 'web: the accent stays the CSS default')
    await p.waitForTimeout(500)
    assert.deepEqual(problems, [], 'web: no errors in the console: ' + problems.join(' | '))
    // Drop (E2.5), web: a .zip dropped on the window is uploaded and opens; a .txt is refused and changes nothing.
    await dispatchFile(p, 'drop', 'good.zip', readFileSync(goodZip()))
    await p.locator('#pkg-name').filter({ hasText: /good\.zip/ }).waitFor()
    await dispatchFile(p, 'drop', 'notes.txt', Buffer.from('not a package'))
    assert.equal(await p.locator('#status').textContent(), 'Only .zip packages can be opened', 'web: a .txt is refused with the message')
    assert.match(await p.locator('#pkg-name').textContent(), /good\.zip/, 'web: the package stays open')
    assert.deepEqual(await longTitles(p), [], 'web: no title attribute is longer than 100 characters')
    // E5.1: the live view's coordinates bar works in the browser too: a run of good, a frame, a hover.
    await p.getByRole('button', { name: 'Run', exact: true }).click()
    await p.getByRole('button', { name: 'Stop', exact: true }).waitFor(); await view('Live', p)
    await p.locator('#view img.live-frame[src^="data:image/jpeg"]').waitFor({ timeout: 8000 })
    await p.locator('.live-frame').hover({ position: { x: 40, y: 40 } })
    await p.locator('.live-pos').filter({ hasText: /^x \d+ {2}y \d+ px · [\d.]+% [\d.]+%/ }).waitFor({ timeout: 3000 })
    await p.getByRole('button', { name: 'Stop', exact: true }).click(); await p.locator('#runs li').first().waitFor()
    const wasOpen = await p.locator('#inspector').isVisible()
    // E5.1: the macro editor's Import reads a file through the browser's file input, and Export downloads one.
    if (await p.locator('#inspector').isHidden()) await p.getByRole('button', { name: 'Inspector', exact: true }).click()
    await p.getByRole('tab', { name: 'Macro', exact: true }).click()
    const imported = { format: 'package-lab-macro', version: 2, viewport: { width: 1100, height: 800 }, events: [{ t: 100, type: 'wait', text: 'Next', timeout: 10000 }, { t: 200, type: 'click', x: 0.5, y: 0.25 }] }
    await p.locator('#macro-file').setInputFiles({ name: 'imp.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) })
    await p.locator('.macro-table tbody tr').nth(1).waitFor()
    assert.match(await p.locator('#macro-summary').innerText(), /^2 events.*recorded at 1100×800/, 'web: Import loads the file and its size')
    assert.match(await p.locator('.macro-table tbody tr').first().innerText(), /wait for “Next” \(10 s\)/, 'web: the imported wait is in the table')
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export…', exact: true }).click()])
    assert.equal(dl.suggestedFilename(), 'macro.json', 'web: Export downloads macro.json')
    assert.deepEqual(JSON.parse(readFileSync(await dl.path(), 'utf8')), imported, 'web: the exported file is the imported one')
    await p.locator('#macro-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('nope') })
    await p.locator('#status').filter({ hasText: /isn’t a macro/ }).waitFor()
    assert.equal(await p.locator('.macro-table tbody tr').count(), 2, 'web: a bad file changes nothing')
    problems.splice(0, problems.length, ...problems.filter(m => !/api\/invoke\/macro-parse/.test(m)))   // the browser logs the refused file's 500
    await p.getByRole('button', { name: 'Clear', exact: true }).click(); await p.locator('#macro-summary').filter({ hasText: /^None/ }).waitFor()   // later steps compare the launch options
    if (!wasOpen) await p.getByRole('button', { name: 'Inspector', exact: true }).click()
    // E2.2: with every control set to a non-default value, launchOptions() and the Copy as CLI command line are what the window made of
    // the same choices before the controls moved into the inspector.
    const before = JSON.parse(readFileSync(join(root, 'test', 'fixtures', 'launch-options-before.json'), 'utf8'))
    assert.deepEqual(await everyChoice(p), before, 'web: the same choices make the same launch options and CLI line as before the inspector')
    // A package is open now, so the view list shows.
    assert.deepEqual(await p.locator('#views nav[aria-label=Tools] button').allInnerTexts(), ['Test saving', 'Server needs', 'Live'], 'web: Tools has Live and no Folder check')
    await view('Live', p)
    assert.equal(await p.locator('#views [aria-current=page]').innerText(), 'Live', 'web: Live can be chosen')
    await p.getByRole('button', { name: 'Inspector', exact: true }).click()
    assert.ok(await p.locator('#summary').isVisible(), 'web: the chip shows for non-default settings')
    assert.deepEqual(problems, [], 'web: no errors after the settings were changed: ' + problems.join(' | '))
    // E3.4: the appearance is this browser's: Dark sets the attribute and survives a reload, and the server's settings.json is untouched.
    const settingsFile = join(dir(), 'web-data', 'settings.json'), prior = existsSync(settingsFile) ? readFileSync(settingsFile, 'utf8') : null
    await p.getByRole('button', { name: 'Settings', exact: true }).click()
    await p.locator('#settings[open]').waitFor()
    assert.ok(await p.locator('#set-port').isHidden(), 'web: the port is not offered')
    await p.getByRole('radio', { name: 'Dark' }).check()
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark', 'web: Dark sets the attribute')
    await p.reload(); await p.locator('#toolbar').waitFor()
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark', 'web: the choice survives a reload')
    assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()), BG.dark, 'web: the dark --bg')
    assert.equal(existsSync(settingsFile) ? readFileSync(settingsFile, 'utf8') : null, prior, 'web: settings.json is unchanged')
  })
}

// A file dragged over the window (dragenter, dragleave) or dropped on it (drop): Playwright's dispatchEvent with a DataTransfer that
// holds the file. The window reads the name (.zip or not); the bytes are only there so the file is a real one.
async function dispatchFile(p, type, name, bytes = Buffer.alloc(0)) {
  const dt = await p.evaluateHandle(({ name, b64 }) => { const d = new DataTransfer(); d.items.add(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name)); return d }, { name, b64: bytes.toString('base64') })
  await p.locator('body').dispatchEvent(type, { dataTransfer: dt })
  await dt.dispose()
}
// The title attributes on the page that are longer than 100 characters (E2.5: a tooltip is one line).
const longTitles = p => p.evaluate(() => [...document.querySelectorAll('[title]')].map(e => e.title).filter(t => t.length > 100))

// Launches with Record pressed, clicks Next in the course window, and stops. Leaves the Save/Discard dialog open.
async function recordRound() {
  await launch()
  await win.getByRole('button', { name: 'Record macro', exact: true }).click()
  await win.locator('#record[aria-pressed="true"]').waitFor()
  await clickCourse(await runWindow(), '#next')
  await stop()
  await win.locator('#record-dialog[open]').waitFor()
}
// The run window is the window that isn't the main one and shows the course's host (the LMS address, not a file or about: page).
// It is shown, so its mouse reaches the course.
export async function runWindow() {
  for (let i = 0; i < 100; i++) {
    const run = app.windows().find(w => w !== win && /^https?:/.test(w.url()))
    if (run) return run
    await win.waitForTimeout(200)
  }
  throw new Error('The run window never opened')
}
// Clicks the middle of a course button (Next, or Save and exit) with the run window's mouse, at its measured position (in whichever frame it is).
export async function clickCourse(run, sel) {
  for (let i = 0; i < 100; i++) {
    for (const f of run.frames()) {
      if (!await f.locator(sel).count()) continue
      const box = await f.locator(sel).boundingBox()
      if (box) return run.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    }
    await run.waitForTimeout(200)
  }
  throw new Error(`${sel} never appeared in the run window`)
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
