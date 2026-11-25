// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// make guide (npm run guide [file]): the User Guide as one self-contained HTML file, for reading outside the app, on a
// website, or printed to PDF from a browser. Built with the app's own renderer (src/ui/markdown.js) and the chapter list
// in src/docs.js, so it needs nothing installed. Links between chapters become links within the page; links to Help and
// the reference stay as text, since those pages aren't in the file. The screenshots are inlined. scripts/package.js
// writes one into dist/ with every build. Default output: dist/Package Lab User Guide.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GUIDE, inlineImages } from '../src/docs.js'
import { markdown } from '../src/ui/markdown.js'

const root = fileURLToPath(new URL('..', import.meta.url)), docs = join(root, 'docs')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function guideHtml() {
  const ids = new Map(GUIDE.map((d, i) => [d.name, 'c' + i]))
  const chapters = GUIDE.map(d => {
    const id = ids.get(d.name)
    const md = inlineImages(readFileSync(join(docs, d.name), 'utf8'), d.name, p => { try { return readFileSync(join(docs, p)) } catch { return null } })
    const html = markdown(md, id + '-').replace(/<a href="([^"]*)">(.*?)<\/a>/g, (all, href, text) => {
      if (/^(https?|mailto):/i.test(href)) return all
      const [path, anchor] = href.split('#'), name = path ? posix.normalize(posix.join(posix.dirname(d.name), path)) : d.name
      const to = ids.get(name)
      return to ? `<a href="#${anchor ? to + '-' + anchor : to}">${text}</a>` : text
    })
    return `<section class="chapter doc" id="${id}">\n${html}</section>`
  })
  const parts = [...new Set(GUIDE.map(d => d.part))]
  const toc = parts.map(p => `<h2>${esc(p)}</h2><ol>${GUIDE.filter(d => d.part === p).map(d => `<li><a href="#${ids.get(d.name)}">${esc(d.title)}</a></li>`).join('')}</ol>`).join('\n')
  const css = readFileSync(join(root, 'src', 'ui', 'guide.css'), 'utf8')
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Package Lab User Guide</title>
<style>
${css}
.book { display: grid; grid-template-columns: 290px minmax(0, 1fr); }
#contents { position: sticky; top: 0; height: 100vh; }
#contents h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 16px 0 4px; }
#contents ol { list-style: none; margin: 0; padding: 0; } #contents li { margin: 3px 0; } #contents a { color: var(--fg); text-decoration: none; }
.chapter { border-bottom: 1px solid var(--line); padding-bottom: 32px; }
@media (max-width: 720px) { .book { display: block; } #contents { position: static; height: auto; } }
@media print { .chapter { break-before: page; border: 0; } a { color: inherit; } }
</style>
</head>
<body>
<div class="book">
<nav id="contents" aria-label="Contents"><div class="brand"><b>Package Lab</b> User Guide</div><p class="muted small">For Package Lab ${esc(version)}. To print it or save it as a PDF, use your browser's Print command.</p>
${toc}
</nav>
<main id="reader">
${chapters.join('\n')}
</main>
</div>
</body>
</html>
`
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const out = resolve(process.argv[2] ?? join(root, 'dist', 'Package Lab User Guide.html'))
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, guideHtml())
  console.log(`Wrote ${out}`)
}
