# Articulate Rise

Confidence: LOW. Only forum snippets were available; the Articulate threads returned 403 on fetch.

## File layout of SCORM exports

- Staff/community reports: the LMS export zip contains a `scormcontent/` folder; media and attachments sit in `scormcontent/assets/`. (community-reported)
- Reported: the SCORM zip has its files at the zip root, not inside an extra wrapper folder. (community-reported, unconfirmed)
- Reported: AICC, SCORM, cmi5 and xAPI LMS exports share one folder structure, so folder names alone do not identify the format. (community-reported)
- A `tincan.xml` in the package is reported to mean xAPI content. (staff statement as quoted in search snippet, unconfirmed)

## Modes and config (keys that switch LMS/web/preview)

- Publishing for LMS vs web is chosen in the publish dialog; no config key was found in any source read. Unconfirmed.
- Staff-era note: Rise exports as LMS packages only; there is no equivalent of Storyline's `strLMSStandard` variable found.

## Known LMS problems and fixes

- Launch file disagreement: some users say the LMS should read the start page from the manifest; others report that pointing to `scormcontent/index.html` loses completion/score; `indexAPI.html` in a `scormdriver` subfolder is cited by others. Reported LMS receiving 100% completion regardless of set file. (community, unconfirmed)
- Zipping: MindTickle reportedly will not treat a package as SCORM if zipped outside the exported folder; other users report Rise re-zipping an already-zipped folder. (community)

## Export settings that matter

- Publish target: LMS (SCORM 1.2 / 2004 / AICC / xAPI standard choice).
- Zip vs folder output: export format has changed across Rise releases (community reports "no more .zip SCORM export").

## Detection hints (file names and strings a tool could look for)

- Folder `scormcontent/` (strongest reported marker)
- `scormcontent/assets/`
- `scormcontent/index.html`
- `scormdriver/indexAPI.html` (shared Rustici-style driver pattern; unconfirmed for Rise)
- `imsmanifest.xml` at zip root (expected for SCORM; unconfirmed for Rise)
- `tincan.xml` present means xAPI, not SCORM
- Candidate strings, unconfirmed: `scormcontent`, `indexAPI.html`

## How SCORM Lab uses this

Detects `scormcontent/`. Static: a `tincan.xml` with no manifest reads as an xAPI export (info).

## Sources

Read (fetched): none usable.

Seen in search snippets only (not opened):
- https://community.articulate.com/discussions/rise-360/correct-procedure-for-exporting-rise-content-to-an-lms (403 on fetch)
- https://community.articulate.com/discussions/rise/what-file-do-you-use-to-load-a-rise-course-into-lms (403 on fetch)
- https://community.articulate.com/discussions/discuss/rise-course-xapi-file-structure-change/1244243
- https://community.articulate.com/discussions/rise-360/no-more-zip-scorm-export-in-rise
- https://help.learningbank.io/en/export-guide-for-articulate-rise-scorm-files
