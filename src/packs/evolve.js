// Evolve Authoring (docs/packs/evolve.md: no markers confirmed; this is not the Evolve LMS).
import { score } from './util.js'

export default {
  id: 'evolve', name: 'Evolve',
  detect: (a, files) => score(files, [['name', /evolve(authoring)?\//i, 0.5], ['text', /\bevolveauthoring\b/i, 0.6]]),
  staticRules({ analysis: a }) {
    const out = [], m = a.manifest
    if (m?.version === '2004')
      out.push({ sev: 'info', basis: 'pattern', title: 'the package is SCORM 2004; guidance for Evolve content recommends SCORM 1.2',
        detail: 'Intellum’s help (seen as a search snippet) advises publishing SCORM 1.2. If this LMS has trouble, 1.2 has the widest support.',
        evidence: [`manifest schema version: ${m.schemaversion || '2004'}`], fix: 'If tracking fails, publish as SCORM 1.2 and upload the ZIP as exported.' })
    if (a.problems.some(p => p.code === 'manifest-not-root'))
      out.push({ sev: 'info', basis: 'pattern', title: 'the manifest is inside a folder; Evolve guidance says upload the ZIP as exported',
        detail: 'A community reply says not to re-zip or unzip Evolve exports. A wrapper folder is what re-zipping usually adds.',
        evidence: [a.root], fix: 'Zip the folder’s contents, so imsmanifest.xml is at the top, or upload the original export.' })
    return out
  },
  runRules() { return [] },
  notes: 'docs/packs/evolve.md',
  sources: [
    'https://community.evolveauthoring.com/t/cant-upload-scorm-file-into-evolve-free-trial/3071',
    'https://employees.intellum.com/student/path/512086',
    'https://help.mapal-os.com/flow-learning/learning-and-development/self-supported-authoring/check-your-evolve-module-before-launch/',
    'https://www.academyofmine.com/anatomy-of-a-scorm-course/',
  ],
}
