# Lectora (Trivantis / ELB Learning)

Confidence: LOW. One vendor knowledge-base article read; it does not cover LMS output layout.

## File layout of SCORM exports

- Source project: a main `.awt` file plus resource subfolders such as `images` and `media`. (fetched, ELB Learning KB)
- Published LMS/SCORM output: final HTML or SCORM files, usually in `scorm` or `html` subfolders, regenerated each publish. (fetched)
- Community reports an `extern` folder and an `.ini` file on save, depending on project objects. (forum snippet, unconfirmed)
- SCO is called an Assignable Unit (AU) in Lectora. (search snippet, unconfirmed)
- `imsmanifest.xml` placement not confirmed by any source read.

## Modes and config (keys that switch LMS/web/preview)

- SCORM/AICC output is enabled per project: Title Options (older versions) or Project Options (newer, Design ribbon). (search snippet, unconfirmed version split)
- No config key found.

## Known LMS problems and fixes

- None confirmed from sources read.

## Export settings that matter

- Enable AICC and SCORM for LMS in Project Options. (snippet)
- Publish target SCORM version: not confirmed.

## Detection hints (file names and strings a tool could look for)

- `*.awt` (Lectora source project; strongest marker)
- `scorm/` or `html/` published folders (vendor doc)
- `extern/`, `*.ini` (community-reported, unconfirmed)
- `imsmanifest.xml` at zip root (expected for SCORM; unconfirmed for Lectora)

## How Package Lab uses this

Detects `.awt` files, `trivantis`, `a001index.html`. Static: a source project in the ZIP (info).

## Sources

Read (fetched):
- https://knowledgebase.elblearning.com/file-management-with-lectora

Seen in search snippets only (not opened):
- https://community.elblearning.com/topics/automatic-saving-of-titles-in-lectora-0b830e97
- https://knowledgebase.elblearning.com/scorm-101-and-a-lectora-how-to
- https://help.lumi.education/articles/9460373-html-and-scorm-export
