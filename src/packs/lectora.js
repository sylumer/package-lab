// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// Lectora (docs/packs/lectora.md: one knowledge-base article read, low confidence).
import { score, named } from './util.js'

export default {
  id: 'lectora', name: 'Lectora',
  detect: (a, files) => score(files, [['any', /\.awt$/i, 0.9], ['name', /trivantis|a001index\.html/i, 0.6], ['text', /\b(trivantis|lectora)\b/i, 0.5]]),
  staticRules({ files }) {
    const awt = named(files, /\.awt$/i)
    return awt.length ? [{ sev: 'info', basis: 'pattern', title: 'the ZIP holds a Lectora source project',
      detail: 'A .awt file is the project you edit, not the published output. The ZIP may be the project folder and not the SCORM publish.',
      evidence: awt.slice(0, 3), fix: 'Publish from Lectora for SCORM (turn on SCORM in Project Options first) and upload the published ZIP.' }] : []
  },
  runRules() { return [] },
  notes: 'docs/packs/lectora.md',
  sources: [
    'https://knowledgebase.elblearning.com/file-management-with-lectora',
    'https://knowledgebase.elblearning.com/scorm-101-and-a-lectora-how-to',
    'https://community.elblearning.com/topics/automatic-saving-of-titles-in-lectora-0b830e97',
    'https://help.lumi.education/articles/9460373-html-and-scorm-export',
  ],
}
