// UI smoke test (E0.1): opens the real desktop app with Playwright's Electron driver, clicks through it and fails if a
// visible behaviour breaks. Run by `npm run test:ui`, and by `node test/test.js --slow`. The helpers are exported so
// later work packages and scripts/screenshots.js can drive the same window. The app keeps its data in a temp folder.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

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
export async function launch() { await win.getByRole('button', { name: 'Launch', exact: true }).click(); await win.locator('#stop:enabled').waitFor() }
export async function stop() { await win.getByRole('button', { name: 'Stop and analyse' }).click(); await win.locator('#runs li').first().waitFor() }
export const view = name => win.getByRole('tab', { name, exact: true }).click()
export const text = selector => win.locator(selector).innerText()
// A menu item is clicked from the main process: Playwright's keyboard doesn't reach the native menu's shortcuts.
export const menu = label => app.evaluate(({ Menu }, l) => {
  const find = items => { for (const i of items) { if (i.label === l) return i; const f = i.submenu && find(i.submenu.items); if (f) return f } }
  find(Menu.getApplicationMenu().items).click()
}, label)

async function checks() {
  await start()
  await win.getByText('Something is wrong? Start here').waitFor()
  await win.locator('#tabs').waitFor({ state: 'attached' })
  assert.ok(await win.locator('#tabs').isHidden(), 'start screen: the tab bar is hidden')
  console.log('ui: start screen ok')

  await open(goodZip())
  assert.match(await text('#pkg-name'), /good\.zip/, 'the package name shows')
  assert.ok(await win.getByRole('button', { name: 'Launch', exact: true }).isEnabled(), 'Launch is enabled')
  console.log('ui: package open ok')

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
  assert.deepEqual(errors, [], 'no uncaught errors in the window')
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
