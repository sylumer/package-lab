// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// iSpring (docs/packs/ispring.md: vendor article read; folder tree unconfirmed).
import { score } from './util.js'

export default {
  id: 'ispring', name: 'iSpring',
  detect: (a, files) => score(files, [['name', /ispring/i, 0.7], ['name', /data\/player\.js/i, 0.4], ['text', /ispring/i, 0.6]]),
  staticRules({ analysis: a }) {
    const scos = (a.manifest?.items ?? []).filter(i => i.type === 'sco')
    return scos.length > 1 ? [{ sev: 'info', basis: 'pattern', title: `the manifest has ${scos.length} SCOs; iSpring exports one`,
      detail: 'iSpring’s article describes an iSpring course as a single SCO in the ZIP. More than one suggests the manifest was edited or the package was combined with others.',
      evidence: scos.slice(0, 5).map(i => `${i.title || i.id} → ${i.res?.path ?? '?'}`), fix: 'If progress is wrong, republish the course from iSpring as one package and upload it as exported.' }] : []
  },
  runRules() { return [] },
  notes: 'docs/packs/ispring.md',
  sources: [
    'https://www.ispringsolutions.com/articles/scorm-structure-and-interaction-with-an-lms.html',
    'https://www.ispringsolutions.com/blog/scorm-export',
    'https://www.ispringsolutions.com/supported-lms/moodle/add-scorm-course-into-moodle',
  ],
}
