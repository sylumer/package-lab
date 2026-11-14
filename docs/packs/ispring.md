# iSpring Suite

Confidence: MEDIUM for package shape and LMS-profile setting (vendor article read). LOW for folder tree.

## File layout of SCORM exports

- Output is a `.zip` "content package" ready for LMS upload. (iSpring article, fetched)
- Example package contains `imsmanifest.xml` and a resources folder shown as `res`. (fetched; the article does not describe the tree further)
- An iSpring course is a single SCO inside the zip. (fetched)
- The exact folder tree below the zip root is not confirmed by any source read.

## Modes and config (keys that switch LMS/web/preview)

- Output is chosen in the LMS tab: pick the LMS profile matching the LMS standard (SCORM 1.2 or SCORM 2004). (iSpring blog, search snippet; not fetched)
- No config file key found. Unconfirmed.

## Known LMS problems and fixes

- Not investigated in depth; no iSpring-specific LMS problem read. Unconfirmed.
- Vendor article documents runtime calls `LMSCommit` (1.2) and `Commit` (2004) only as examples, not as a fix list.

## Export settings that matter

- LMS profile: SCORM 1.2 vs SCORM 2004 (must match the LMS).
- Status reporting: default Passed/Failed; other status pairs can be chosen. (fetched article)

## Detection hints (file names and strings a tool could look for)

- `imsmanifest.xml` at zip root (confirmed as example)
- `res/` folder (confirmed as example name in one article)
- Candidate strings, unconfirmed: `LMSCommit`, `Commit`, `API_1484_11`

## How SCORM Lab uses this

Detects `ispring` in names or scripts. Static: more than one SCO in the manifest (iSpring exports one; info).

## Sources

Read (fetched):
- https://www.ispringsolutions.com/articles/scorm-structure-and-interaction-with-an-lms.html

Seen in search snippets only (not opened):
- https://www.ispringsolutions.com/blog/scorm-export
- https://www.ispringsolutions.com/supported-lms/moodle/add-scorm-course-into-moodle
