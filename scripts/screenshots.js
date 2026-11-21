// Makes the pictures the guide shows (E3.3): the desktop app's own windows at 1280 × 800, in light and dark, as docs/images/<view>-<theme>.png.
// `npm run screenshots` runs it. It drives the app the way test/ui.js does (Playwright's Electron driver, a temporary data folder), so it
// needs the same machine as the UI smoke test. Not part of the test suite: run it again when the UI changes.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, clickCourse, close, contentSize, focusMain, goodZip, launch, open, page, runWindow, start, stop, view } from '../test/ui.js'

const out = join(fileURLToPath(new URL('..', import.meta.url)), 'docs', 'images')

// The window is 1280 × 800 whenever it is (re)opened, and each view is given a moment to draw before its picture.
// Playwright emulates a light colour scheme on its pages; clearing that lets the app follow nativeTheme (PACKAGE_LAB_THEME).
async function fresh(zip) {
  if (zip) await open(zip); else await start()
  await contentSize(1280, 800)
  await page().emulateMedia({ colorScheme: null })
  await page().waitForTimeout(500)
}
async function shot(name, theme) {
  await focusMain()
  await page().waitForTimeout(300)
  await page().screenshot({ path: join(out, `${name}-${theme}.png`) })
  console.log(`wrote docs/images/${name}-${theme}.png`)
}

mkdirSync(out, { recursive: true })
try {
  for (const theme of ['light', 'dark']) {
    process.env.PACKAGE_LAB_THEME = theme   // main.js sets nativeTheme.themeSource from it; the app is started fresh for each theme
    await fresh()
    await page().getByText('Something is wrong? Start here').waitFor()
    await shot('start-screen', theme)

    await fresh(goodZip())   // a package open, the toolbar and the static Findings
    await shot('package-open', theme)

    await launch()   // a run that reaches the end, so the verdict says Ran through
    await page().locator('#status').filter({ hasText: 'Recording' }).waitFor()
    await page().waitForTimeout(3000)
    await clickCourse(await runWindow(), '#exit')
    await stop()
    await view('Findings')
    await page().locator('#view .verdict').waitFor()
    await shot('findings', theme)

    await page().getByRole('button', { name: 'Inspector', exact: true }).click()
    await page().getByRole('tab', { name: 'Settings', exact: true }).click()
    await shot('settings', theme)
    await page().getByRole('tab', { name: 'Macro', exact: true }).click()
    await shot('macro', theme)
    await page().getByRole('tab', { name: 'Help', exact: true }).click()
    await page().locator('#doc-pick').selectOption({ label: 'Getting started' })
    await page().waitForFunction(() => document.querySelector('#doc-body h1')?.innerText === 'Getting started')
    await shot('help', theme)
    await page().getByRole('button', { name: 'Close the inspector' }).click()

    await launch()   // the live view, with the pointer over the course so the coordinates bar has a position
    await page().getByRole('button', { name: 'Show in Package Lab', exact: true }).click()
    await page().locator('#view img.live-frame[src^="data:image/jpeg"]').waitFor({ timeout: 10000 })
    await page().locator('.live-frame').hover({ position: { x: 300, y: 200 } })
    await page().locator('.live-pos').filter({ hasText: /^x \d+/ }).waitFor({ timeout: 5000 })
    await page().locator('.live-bar').scrollIntoViewIfNeeded()   // the coordinates bar sits below the picture
    await shot('live', theme)
    await stop()
    await close()
  }
} finally {
  await cleanup()
}
