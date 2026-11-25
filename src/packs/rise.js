// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// Articulate Rise (docs/packs/rise.md: forum snippets, low confidence).
import { score, named } from './util.js'

export default {
  id: 'rise', name: 'Articulate Rise',
  detect: (a, files) => score(files, [['name', /(^|\/)scormcontent\//i, 0.6], ['name', /lib\/rise/i, 0.5], ['text', /articulate.{0,200}rise|__rise/i, 0.4]]),
  staticRules({ analysis: a, files }) {
    const out = [], tc = named(files, /(^|\/)tincan\.xml$/i)
    if (tc.length && (!a.manifest || a.format === 'tincan'))
      out.push({ sev: 'info', basis: 'pattern', title: 'this looks like an xAPI export, not SCORM',
        detail: 'Rise reports say a tincan.xml means xAPI content. There is no imsmanifest.xml, so an LMS that expects SCORM will refuse it. (Package Lab runs it against its own LRS.)',
        evidence: tc, fix: 'Publish again choosing SCORM 1.2 or SCORM 2004 in Rise’s LMS export, and upload the ZIP as exported.' })
    return out
  },
  runRules() { return [] },
  notes: 'docs/packs/rise.md',
  sources: [
    'https://community.articulate.com/discussions/discuss/rise-course-xapi-file-structure-change/1244243',
    'https://community.articulate.com/discussions/rise-360/correct-procedure-for-exporting-rise-content-to-an-lms',
    'https://community.articulate.com/discussions/rise-360/no-more-zip-scorm-export-in-rise',
    'https://community.articulate.com/discussions/rise/what-file-do-you-use-to-load-a-rise-course-into-lms',
    'https://help.learningbank.io/en/export-guide-for-articulate-rise-scorm-files',
  ],
}
