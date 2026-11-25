// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
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

// Print layout on top of the guide's own CSS: a cover, no sidebar, the contents on their own page, chapters start a page.
// The page margins, running header and page numbers are CSS margin boxes rather than printToPDF's header and footer, so
// the cover (@page :first) can have none of them. VERSION is filled in by render().
const PRINT = `<style>
@page { size: A4; margin: 18mm 15mm;
  @top-right { content: 'Package Lab User Guide'; font: 8px Helvetica, Arial, sans-serif; color: #6e6e73; }
  @bottom-left { content: 'Package Lab VERSION'; font: 8px Helvetica, Arial, sans-serif; color: #6e6e73; }
  @bottom-right { content: counter(page) ' / ' counter(pages); font: 8px Helvetica, Arial, sans-serif; color: #6e6e73; } }
@page :first { margin: 0; @top-right { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }
html, body { height: auto; background: #fff; }
.cover { position: relative; width: 210mm; height: 297mm; overflow: hidden; break-after: page; color: #1d1d1f; }
.cover .band { position: absolute; inset: 0 0 auto 0; height: 118mm; background: linear-gradient(160deg, #1a4fa0 0%, #2f7de1 100%); }
.cover .band::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2.2mm; background: #7fd1ff; }
.cover .logo { position: absolute; left: 22mm; top: 82mm; width: 64mm; height: 64mm; background: #fff; border-radius: 15mm; }   /* no box-shadow: Preview draws its soft mask as a dark square */
.cover .logo svg { width: 100%; height: 100%; }
.cover .kicker { position: absolute; left: 22mm; top: 26mm; color: #fff; font-size: 13px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; opacity: .9; }
.cover .titles { position: absolute; left: 22mm; right: 22mm; top: 160mm; }
.cover h1 { font-size: 54px; line-height: 1.05; margin: 0; font-weight: 700; letter-spacing: -.02em; }
.cover h1 span { color: #1a4fa0; }
.cover .tagline { font-size: 18px; color: #48484d; margin: 6mm 0 0; max-width: 140mm; line-height: 1.45; }
.cover .meta { position: absolute; left: 22mm; right: 22mm; bottom: 22mm; display: flex; gap: 14mm; border-top: 1px solid #d9d9de; padding-top: 6mm; }
.cover .meta div { font-size: 13px; } .cover .meta b { display: block; font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: #6e6e73; font-weight: 600; margin-bottom: 1mm; }
.book { display: block; }
#contents { display: block; position: static; height: auto; padding: 0; background: none; border: 0; break-after: page; }
#contents .brand, #contents > p { display: none; }
#contents::before { content: 'Contents'; display: block; font-size: 30px; font-weight: 700; margin-bottom: 8px; }
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
  const html = guideHtml().replace(/ To print it or save it as a PDF, use your browser's Print command\./, '').replace('</head>', PRINT.replace('VERSION', version) + '\n</head>')
    .replace('<body>', '<body>\n' + cover(version))
  const tmp = mkdtempSync(join(tmpdir(), 'pl-guide-')), file = join(tmp, 'guide.html')
  try {
    writeFileSync(file, html)
    const win = new BrowserWindow({ show: false, webPreferences: { javascript: false } })
    await win.loadFile(file)
    const pdf = await win.webContents.printToPDF({
      preferCSSPageSize: true, printBackground: true, generateDocumentOutline: true, generateTaggedPDF: true,
    })
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, pdf)
    console.log(`Wrote ${out}`)
  } catch (e) { console.error(e); process.exitCode = 1 }
  finally { rmSync(tmp, { recursive: true, force: true }); app.exit(process.exitCode ?? 0) }
}

// The cover: the app's icon (build/icon.svg), the title, the guide's tagline and edition line from its README, and the version.
function cover(version) {
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const readme = readFileSync(join(root, 'docs', 'user-guide', 'README.md'), 'utf8')
  const tagline = readme.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim() ?? ''
  const [, edition = '', date = ''] = readme.match(/Edition ([^,]+), ([^,]+), for Package Lab/) ?? []
  const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8').replace(/<\?xml[^>]*>/, '')
  const meta = [['Package Lab', version], ['Edition', edition], ['Published', date]].filter(([, v]) => v)
  return `<section class="cover" aria-label="Cover">
<div class="band"></div><div class="kicker">Package Lab</div>
<div class="logo">${svg}</div>
<div class="titles"><h1>Package Lab<br><span>User Guide</span></h1><p class="tagline">${esc(tagline)}</p></div>
<div class="meta">${meta.map(([k, v]) => `<div><b>${k}</b>${esc(v)}</div>`).join('')}</div>
</section>`
}
