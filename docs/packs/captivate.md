# Adobe Captivate

Confidence: LOW. No Adobe primary doc was readable (helpx returned 403). Findings are from forum snippets and one 2012 blog post.

## File layout of SCORM exports

- Community reports name these files in a SCORM package: `index_scorm.html`, `assets/CPM.js`, and a `dr/` folder (a "dr" driver folder). (forum-reported, unconfirmed for current versions)
- A 2012 pipwerks post refers to `scorm_support.js` (v1.20120328) as a template file to update. (fetched, 2012, old template)
- The `SCORM_utilities.js` file is named in Saba guidance for Captivate SCORM 1.2 packages. (forum, unconfirmed)
- Forum "cp is not defined" errors trace to `CPM.js` in the package. (forum)

## Modes and config (keys that switch LMS/web/preview)

- No config key was identified in any source read. Project info fields are reported to feed into `CPM.js`; a line break in a Project Info field was reported to break loading. (forum, unconfirmed)
- SCORM version and LMS settings are set at publish time; exact dialog names not confirmed.

## Known LMS problems and fixes

- "cp is not defined" / uncaught ReferenceError: caused by a line break in a Project Info field or an identifier conflict in `CPM.js`. Fix: remove the break, or copy in a clean `CPM.js`. (forum)
- Score not saved to LMS in old template: fixed by updating `scormsupport.js`/ `scorm_support.js` to a newer build (2012 post; old).
- Saba: edit `SCORM_utilities.js` per package. (forum)

## Export settings that matter

- SCORM version (1.2 vs 2004) and LMS tracking/reporting options: exact names unconfirmed.

## Detection hints (file names and strings a tool could look for)

- `index_scorm.html` (candidate start page)
- `CPM.js` (strongest candidate marker; name appears in forum errors)
- `dr/` folder
- `SCORM_utilities.js`, `scorm_support.js`
- Candidate strings, unconfirmed: `cp is not defined`, `CPM`

## How Package Lab uses this

Detects `CPM.js`, `index_scorm.html` and `cp.CPProjInit`. Static: the older support files (info). Run: an uncaught "cp is not defined" is shown with the reported cause.

## Sources

Read (fetched):
- https://pipwerks.com/important-adobe-captivate-scorm-template-update/

Seen in search snippets only (not opened):
- https://community.adobe.com/t5/captivate/uncaught-referenceerror-cp-is-not-defined/td-p/11879381
- https://community.adobe.com/t5/captivate-discussions/captivate2019-configuring-scorm-settings-in-the-source/td-p/13025030
- https://helpx.adobe.com/ph_fil/captivate/help/how-to-create-scorm-package-adobe-captivate.html (403 on fetch)
