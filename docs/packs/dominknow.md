# dominKnow ONE (Claro)

Confidence: LOW. One vendor community article read; publish panel described, no file-tree or config info.

## File layout of SCORM exports

- No export file tree was found in any source read. Unconfirmed.
- Publish outputs offered: SCORM, AICC, xAPI, cmi5 (LMS), Web package (ZIP for web server), LRS, Document, Desktop package. (fetched)

## Modes and config (keys that switch LMS/web/preview)

- Publish target chosen in the Publish panel: LMS, Web Package, LRS, SCORM Cloud, Document, Desktop. (fetched)
- LMS target: Standard drop-down selects SCORM 1.2, SCORM 2004, AICC or xAPI. (fetched)
- Not all licence levels include every option. (fetched)
- No config file keys found. Claro is the slide-based fixed-layout authoring mode; no Claro-specific SCORM setting was found.

## Known LMS problems and fixes

- None confirmed from sources read.

## Export settings that matter

- LMS Standard (1.2 / 2004 / AICC / xAPI).
- PENS target for one-click upload to PENS-compliant LMSs; otherwise manual download and upload. (fetched)
- SCORM Cloud target for pre-testing. (fetched)

## Detection hints (file names and strings a tool could look for)

- Unconfirmed: no package file names found. Only the zip itself is known.
- Check for `imsmanifest.xml` at zip root as the generic SCORM marker; not confirmed for dominKnow.

## How Package Lab uses this

Detects the name `dominknow`. Static: no manifest, which matches a Web package publish (info).

## Sources

Read (fetched):
- https://community.dominknow.com/showArticle/Publishing-your-Project-eaebc3b0

Seen in search snippets only (not opened):
- https://dominknow.com/publishing (vendor marketing)
- https://rusticisoftware.com/resources/dominknow-scorm-cloud-case-study/
