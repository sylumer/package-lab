// make guide-pdf (npm run guide:pdf [file]): the User Guide as a PDF, from the same HTML as scripts/guide-html.js, printed
// by Electron's Chromium (webContents.printToPDF), so it needs nothing installed beyond the devDependencies. Links between
// chapters and the contents page stay clickable, the PDF has a bookmark outline from the headings, and pages are numbered.
// Run under Node it starts Electron on this same file; scripts/package.js writes one into dist/ with every build.
// Default output: dist/Package Lab User Guide.pdf
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const self = fileURLToPath(import.meta.url), root = fileURLToPath(new URL('..', import.meta.url))

// Print layout on top of the guide's own CSS: no sidebar, the contents become the title page, chapters start a page.
const PRINT = `<style>
html, body { height: auto; background: #fff; }
.book { display: block; }
#contents { display: block; position: static; height: auto; padding: 0; background: none; border: 0; break-after: page; }
#contents .brand { font-size: 34px; margin: 24px 0 8px; } #contents .brand b { display: block; font-size: 18px; color: var(--muted); font-weight: 600; }
#contents h2 { font-size: 11px; margin-top: 16px; } #contents li { font-size: 13px; margin: 2px 0; }
#reader { display: block; overflow: visible; }
.doc { max-width: none; padding: 0; }
.chapter { break-before: page; border: 0; padding: 0; }
.doc a, #contents a { color: var(--accent); }
.doc h1, .doc h2, .doc h3, .doc h4 { break-after: avoid; }
.doc img, .doc pre, .doc tr, .doc blockquote { break-inside: avoid; }
.doc pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.doc table { display: table; overflow: visible; }
.doc .done-box { display: none; }
</style>`

export function guidePdf(out = join(root, 'dist', 'Package Lab User Guide.pdf')) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  return import('electron').then(({ default: electron }) => execFileSync(electron, [self, resolve(out)], { env, stdio: 'inherit' }))
}

if (process.versions.electron) {
  const { app, BrowserWindow, nativeTheme } = await import('electron')
  const { guideHtml } = await import('./guide-html.js')
  const out = process.argv.at(-1)
  app.dock?.hide()
  app.whenReady().then(() => render(app, BrowserWindow, nativeTheme, guideHtml, out))   // not awaited: Electron emits ready only after this module has run
} else if (resolve(process.argv[1] ?? '') === self) {
  await guidePdf(process.argv[2])
}

async function render(app, BrowserWindow, nativeTheme, guideHtml, out) {
  nativeTheme.themeSource = 'light'   // print in the light theme whatever the system is set to
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  const html = guideHtml().replace(/ To print it or save it as a PDF, use your browser's Print command\./, '').replace('</head>', PRINT + '\n</head>')
  const tmp = mkdtempSync(join(tmpdir(), 'pl-guide-')), file = join(tmp, 'guide.html')
  try {
    writeFileSync(file, html)
    const win = new BrowserWindow({ show: false, webPreferences: { javascript: false } })
    await win.loadFile(file)
    const small = 'font-family: Helvetica, Arial, sans-serif; font-size: 8px; color: #6e6e73; width: 100%; padding: 0 15mm;'
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4', printBackground: true, generateDocumentOutline: true, generateTaggedPDF: true,
      margins: { top: 0.7, bottom: 0.7, left: 0.6, right: 0.6 },
      displayHeaderFooter: true,
      headerTemplate: `<div style='${small} text-align: right'>Package Lab User Guide</div>`,
      footerTemplate: `<div style='${small} display: flex; justify-content: space-between'><span>Package Lab ${version}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    })
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, pdf)
    console.log(`Wrote ${out}`)
  } catch (e) { console.error(e); process.exitCode = 1 }
  finally { rmSync(tmp, { recursive: true, force: true }); app.exit(process.exitCode ?? 0) }
}
