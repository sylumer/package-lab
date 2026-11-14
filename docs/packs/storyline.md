# Articulate Storyline

Confidence: LOW. Mostly forum reports. No Articulate primary doc was readable (community forum threads returned 403).

## File layout of SCORM exports

- Forum reports say LMS output includes `scormdriver.js` (or a `scormdriver/` subfolder) and a start page `story.html`. (community-reported, unconfirmed exact tree)
- Newer builds (reported as 3.39.21985.0+) combine older JS into a single `scormdriver.js`. (community-reported)
- Web output is a different build from LMS output; forum says the two are published separately. (community-reported)
- Output is a `.zip` for LMS upload; `story.html` alone shows a blank page and spinner in a browser for LMS output. (community-reported)

## Modes and config (keys that switch LMS/web/preview)

- Publish target is chosen in the Publish dialog: "Web" vs "LMS". LMS then asks for a standard (SCORM 1.2, SCORM 2004, AICC, Tin Can/xAPI). (community-reported)
- Forum reports that the chosen SCORM version is not always honoured: `scormdriver.js` may pick the SCORM 2004 API regardless of the setting; users hand-edited the file. (community-reported, unconfirmed)
- Testing hook (AICC-era guidance): set Reporting and Tracking "Filename(URL)" to `index_lms.html`, then edit `scormdriver.js` or `Configuration.js` (set `REVIEW_MODE_IS_READ_ONLY = false`). (articulatesupport article, AICC-specific)
- Variables `strLMSStandard`, `blnLMSPresent`: named in the task brief; NOT confirmed by any source read. Unconfirmed.

## Known LMS problems and fixes

- LMS ignores the SCORM version in export settings; fix is editing `scormdriver.js` by hand. Edits are lost on reinstall/update, so re-apply per package. (forum, unconfirmed)
- Debug display is toggled by a flag in `scormdriver.js` when tracking fails. (forum, unconfirmed flag name)
- Tracking via TinCan/xAPI reported to fail on some LMSs (forum threads, no fix confirmed).
- Test on SCORM Cloud or the target LMS, not by opening in a browser. (forum advice)

## Export settings that matter

- Publish target: Web vs LMS (decides the whole build).
- LMS standard: SCORM 1.2 / 2004 / AICC / xAPI.
- Reporting and Tracking: Filename(URL) for the start page (per AICC guidance above).

## Detection hints (file names and strings a tool could look for)

- `scormdriver.js` (present in LMS builds per forum reports; unconfirmed that it is absent in Web builds)
- `story.html` (start page; present in both builds per reports, unconfirmed)
- `index_lms.html` (only if set manually via Filename(URL))
- `Configuration.js`, `REVIEW_MODE_IS_READ_ONLY` (AICC-era)
- `imsmanifest.xml` at zip root (expected in any SCORM zip; not confirmed for Storyline specifically)
- Candidate strings to grep, unconfirmed: `strLMSStandard`, `blnLMSPresent`, `API_1484_11`, `LMSInitialize`

## How SCORM Lab uses this

Detects `story_content/` or `story.html`. Static: `story.html` without `scormdriver.js` (may be a Web publish; info). Run (info): story.html loaded, no API lookup and no driver, which fits a Web publish launched as LMS. The forum report that the driver ignores the SCORM setting has no rule of its own: the general version-mismatch finding covers it. `strLMSStandard` and `blnLMSPresent` are not confirmed for Storyline, so no rule reads them; the SCORM Driver pack reads `strLMSStandard`.

## Sources

Read (fetched):
- https://www.articulatesupport.com/article/storyline-test-aicc-content-in-scorm-cloud

Seen in search snippets only (not opened, pages returned 403 or were not fetched):
- https://community.articulate.com/discussions/discuss/how-does-storyline-360-identify-whether-it-is-published-to-an-lms-or-the-web/967754/replies/967755
- https://community.articulate.com/discussions/articulate-storyline/experiential-differences-in-publishing-to-web-vs-scorm-1-2
