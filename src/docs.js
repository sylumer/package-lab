import { posix } from 'node:path'

// The user-facing docs bundled with the app and shown in its Help panel; names are paths relative to docs/.
// group is the heading the panel's list puts them under; the order here is the order in the list.
export const DOCS = [
  { name: 'README.md', title: 'Contents', group: 'Help' },
  { name: 'help.md', title: 'Help topics', group: 'Help' },
  { name: 'help/getting-started.md', title: 'Getting started', group: 'Help' },
  { name: 'help/reading-a-run.md', title: 'Reading a run', group: 'Help' },
  { name: 'help/run-settings.md', title: 'Run settings', group: 'Help' },
  { name: 'help/views.md', title: 'Views', group: 'Help' },
  { name: 'help/macros.md', title: 'Macros and test saving', group: 'Help' },
  { name: 'help/changing-and-exporting.md', title: 'Changing and exporting', group: 'Help' },
  { name: 'help/experiments-and-servers.md', title: 'Experiments and servers', group: 'Help' },
  { name: 'help/other-formats.md', title: 'cmi5, Tin Can and authoring tools', group: 'Help' },
  { name: 'recipes.md', title: 'Recipes', group: 'Recipes and findings' },
  { name: 'findings.md', title: 'Findings', group: 'Recipes and findings' },
  { name: 'web.md', title: 'Web interface', group: 'Reference' },
  { name: 'cli.md', title: 'Command line', group: 'Reference' },
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

// The User Guide: a book of its own, read in its own window (src/ui/guide.html), not in the Help panel. part groups the
// contents; the order here is the reading order, which Previous and Next follow. Names are paths relative to docs/.
const G = (file, title, part) => ({ name: 'user-guide/' + file, title, part })
export const GUIDE = [
  G('README.md', 'About this guide', 'Start here'),
  G('01-welcome.md', '1. Welcome', 'Part 1: Foundations'), G('02-elearning-basics.md', '2. E-learning in ten minutes', 'Part 1: Foundations'),
  G('03-install-and-practice-kit.md', '3. Install, and build your practice kit', 'Part 1: Foundations'), G('04-tour-of-the-window.md', '4. A tour of the window', 'Part 1: Foundations'),
  G('05-first-run.md', '5. Your first run', 'Part 2: Beginner'), G('06-reading-the-evidence.md', '6. Reading the evidence', 'Part 2: Beginner'),
  G('07-first-diagnoses.md', '7. Your first diagnoses', 'Part 2: Beginner'),
  G('08-testing-a-theory.md', '8. Testing a theory', 'Part 3: Practitioner'), G('09-macros.md', '9. Macros: playing the learner', 'Part 3: Practitioner'),
  G('10-saving-and-resuming.md', '10. Saving and resuming', 'Part 3: Practitioner'), G('11-browsers-devices-and-lmss.md', '11. Browsers, devices and LMSs', 'Part 3: Practitioner'),
  G('12-going-deeper.md', '12. Going deeper', 'Part 4: Expert'), G('13-delivering-the-answer.md', '13. Delivering the answer', 'Part 4: Expert'),
  G('14-working-at-scale.md', '14. Working at scale', 'Part 4: Expert'), G('15-thinking-like-an-analyst.md', '15. Thinking like an analyst', 'Part 4: Expert'),
  G('appendix-a-answers.md', 'A. Exercise answers', 'Appendices'), G('appendix-b-quick-reference.md', 'B. Quick reference', 'Appendices'),
  G('appendix-c-troubleshooting.md', 'C. Troubleshooting Package Lab', 'Appendices'), G('glossary.md', 'Glossary', 'Appendices'),
  G('changelog.md', 'Change log', 'Appendices'),
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
