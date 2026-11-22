import { posix } from 'node:path'

// The user-facing docs bundled with the app and shown in its docs panel; names are paths relative to docs/.
// group is the heading the panel's list puts them under; the order here is the order in the list.
export const DOCS = [
  { name: 'README.md', title: 'Contents', group: 'Guide' },
  { name: 'user-guide.md', title: 'User guide', group: 'Guide' },
  { name: 'guide/getting-started.md', title: 'Getting started', group: 'Guide' },
  { name: 'guide/reading-a-run.md', title: 'Reading a run', group: 'Guide' },
  { name: 'guide/run-settings.md', title: 'Run settings', group: 'Guide' },
  { name: 'guide/views.md', title: 'Views', group: 'Guide' },
  { name: 'guide/macros.md', title: 'Macros and test saving', group: 'Guide' },
  { name: 'guide/changing-and-exporting.md', title: 'Changing and exporting', group: 'Guide' },
  { name: 'guide/experiments-and-servers.md', title: 'Experiments and servers', group: 'Guide' },
  { name: 'guide/other-formats.md', title: 'cmi5, Tin Can and authoring tools', group: 'Guide' },
  { name: 'handbook/README.md', title: 'Handbook contents', group: 'Handbook' },
  { name: 'handbook/01-welcome.md', title: '1. Welcome', group: 'Handbook' },
  { name: 'handbook/02-elearning-basics.md', title: '2. E-learning in ten minutes', group: 'Handbook' },
  { name: 'handbook/03-install-and-practice-kit.md', title: '3. Install and practice kit', group: 'Handbook' },
  { name: 'handbook/04-tour-of-the-window.md', title: '4. A tour of the window', group: 'Handbook' },
  { name: 'handbook/05-first-run.md', title: '5. Your first run', group: 'Handbook' },
  { name: 'handbook/06-reading-the-evidence.md', title: '6. Reading the evidence', group: 'Handbook' },
  { name: 'handbook/07-first-diagnoses.md', title: '7. Your first diagnoses', group: 'Handbook' },
  { name: 'handbook/08-testing-a-theory.md', title: '8. Testing a theory', group: 'Handbook' },
  { name: 'handbook/09-macros.md', title: '9. Macros', group: 'Handbook' },
  { name: 'handbook/10-saving-and-resuming.md', title: '10. Saving and resuming', group: 'Handbook' },
  { name: 'handbook/11-browsers-devices-and-lmss.md', title: '11. Browsers, devices and LMSs', group: 'Handbook' },
  { name: 'handbook/12-going-deeper.md', title: '12. Going deeper', group: 'Handbook' },
  { name: 'handbook/13-delivering-the-answer.md', title: '13. Delivering the answer', group: 'Handbook' },
  { name: 'handbook/14-working-at-scale.md', title: '14. Working at scale', group: 'Handbook' },
  { name: 'handbook/15-thinking-like-an-analyst.md', title: '15. Thinking like an analyst', group: 'Handbook' },
  { name: 'handbook/appendix-a-answers.md', title: 'A. Exercise answers', group: 'Handbook' },
  { name: 'handbook/appendix-b-quick-reference.md', title: 'B. Quick reference', group: 'Handbook' },
  { name: 'handbook/appendix-c-troubleshooting.md', title: 'C. Troubleshooting', group: 'Handbook' },
  { name: 'handbook/glossary.md', title: 'Glossary', group: 'Handbook' },
  { name: 'handbook/changelog.md', title: 'Change log', group: 'Handbook' },
  { name: 'recipes.md', title: 'Recipes', group: 'Recipes and findings' },
  { name: 'findings.md', title: 'Findings', group: 'Recipes and findings' },
  { name: 'web.md', title: 'Web interface', group: 'Reference' },
  { name: 'cli.md', title: 'Command line', group: 'Reference' },
  { name: 'alfred.md', title: 'Alfred', group: 'Reference' },
  { name: 'concierge.md', title: 'Concierge', group: 'Reference' },
  { name: 'packs/README.md', title: 'Authoring tools', group: 'Authoring tools' },
  { name: 'packs/adapt.md', title: 'Adapt', group: 'Authoring tools' },
  { name: 'packs/captivate.md', title: 'Captivate', group: 'Authoring tools' },
  { name: 'packs/dominknow.md', title: 'dominKnow', group: 'Authoring tools' },
  { name: 'packs/evolve.md', title: 'Evolve', group: 'Authoring tools' },
  { name: 'packs/ispring.md', title: 'iSpring', group: 'Authoring tools' },
  { name: 'packs/lectora.md', title: 'Lectora', group: 'Authoring tools' },
  { name: 'packs/pipwerks.md', title: 'pipwerks', group: 'Authoring tools' },
  { name: 'packs/rise.md', title: 'Rise', group: 'Authoring tools' },
  { name: 'packs/scormdriver.md', title: 'SCORM Driver', group: 'Authoring tools' },
  { name: 'packs/storyline.md', title: 'Storyline', group: 'Authoring tools' },
  { name: 'packs/xyleme.md', title: 'Xyleme', group: 'Authoring tools' },
]

// Images in the docs panel (E3.3): every ![alt](path) becomes a data: URI, so the page's CSP (img-src 'self' data:) stays as it is.
// path is relative to the doc's own folder and must stay under docs/. Only PNGs are inlined, and only up to MAX_IMAGE bytes; anything else
// (missing, another format, a web address, too big) becomes its alt text. read(path) returns the file's bytes, or null.
export const MAX_IMAGE = 400 * 1024
const PNG = [0x89, 0x50, 0x4e, 0x47]
// ponytail: rewrites every image syntax in the text, including one inside a code span or fence. Fine for the repo's docs; skip code when a doc needs a literal ![..](..).
export function inlineImages(md, name, read) {
  return String(md).replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => {
    if (/^[a-z][\w+.-]*:|^\/|\\/i.test(src)) return alt   // a web address, an absolute path, or a Windows separator (the paths are POSIX)
    const path = posix.normalize(posix.join(posix.dirname(name), src))
    if (path.startsWith('../') || !path.toLowerCase().endsWith('.png')) return alt
    const buf = read(path)
    if (!buf || buf.length > MAX_IMAGE || !PNG.every((b, i) => buf[i] === b)) return alt
    return `![${alt}](data:image/png;base64,${buf.toString('base64')})`
  })
}
