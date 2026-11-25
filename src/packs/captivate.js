// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// Adobe Captivate (docs/packs/captivate.md: forum reports, low confidence).
import { score, named, short } from './util.js'

export default {
  id: 'captivate', name: 'Adobe Captivate',
  detect: (a, files) => score(files, [['name', /(^|\/)CPM\.js$/i, 0.8], ['name', /(^|\/)index_scorm\.html$/i, 0.6], ['name', /captivate/i, 0.3], ['text', /cp\.CPProjInit/, 0.8], ['text', /captivate/i, 0.3]]),
  staticRules({ files }) {
    const old = named(files, /(^|\/)(scorm_support|scormsupport|SCORM_utilities)\.js$/i)
    return old.length ? [{ sev: 'info', basis: 'pattern', title: 'the package has an older Captivate SCORM support file',
      detail: 'Reports name scorm_support.js (a 2012 template) and SCORM_utilities.js as files that were updated or edited per package to fix scores not saving.',
      evidence: old, fix: 'If the score or completion is not saved, republish with a current Captivate and check these files are not from an old template.' }] : []
  },
  runRules(ctx, trace) {
    const hits = (trace.exceptions ?? []).filter(e => /\bcp is not defined\b/.test(e.text))
    return hits.length ? [{ sev: 'warn', basis: 'run', title: '“cp is not defined” was thrown',
      detail: 'Reports link this to a line break in a Project Info field, or to a name clash in CPM.js. The content stops before it reaches the LMS.',
      evidence: hits.slice(0, 3).map(e => `${e.text} at ${short(e.url)}:${e.line ?? '?'}`),
      fix: 'In Captivate remove any line break from the Project Info fields (name, author, description) and publish again.' }] : []
  },
  notes: 'docs/packs/captivate.md',
  sources: [
    'https://community.adobe.com/t5/captivate-discussions/captivate2019-configuring-scorm-settings-in-the-source/td-p/13025030',
    'https://community.adobe.com/t5/captivate/uncaught-referenceerror-cp-is-not-defined/td-p/11879381',
    'https://helpx.adobe.com/ph_fil/captivate/help/how-to-create-scorm-package-adobe-captivate.html',
    'https://pipwerks.com/important-adobe-captivate-scorm-template-update/',
  ],
}
