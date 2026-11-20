# Evolve (Intellum Evolve Authoring)

Confidence: LOW. No Intellum or Evolve Authoring primary doc was readable. Note: "Evolve LMS" (Mapal/iSpring guides) is a different product; do not conflate.

## File layout of SCORM exports

- Unconfirmed. Evolve Authoring publishes a course to SCORM and the zip is imported with its own "Import Evolve Course" option (community reply). (search snippet)
- General SCORM package shape (not Evolve-specific): `imsmanifest.xml` at zip root with the launch file named in the manifest. (fetched general article, see below)

## Modes and config (keys that switch LMS/web/preview)

- Not found. Unconfirmed.

## Known LMS problems and fixes

- Intellum (platform) guidance, from snippet: to replace a package, delete the old one first, then upload. Publish as SCORM 1.2 rather than AICC when producing a zip. Intellum emits a message describing failures. (search snippet, employee help article; not opened)
- Evolve Authoring: upload the zip as exported; do not re-zip or unzip. (community snippet)
- General upload fixes (vendor blogs, not Intellum-specific): imsmanifest.xml at zip root, no extra wrapper folder, short file names, package size within limit. (snippets)

## Export settings that matter

- SCORM version: 1.2 recommended by Intellum guidance (snippet).

## Detection hints (file names and strings a tool could look for)

- `imsmanifest.xml` at zip root (generic SCORM)
- Evolve Authoring-specific markers: none confirmed.

## How Package Lab uses this

Detects the `evolveauthoring` string or an `evolve/` folder. Static: a SCORM 2004 manifest, and a manifest inside a wrapper folder (both info, from Intellum guidance).

## Sources

Read (fetched), general SCORM background only (not Evolve-specific):
- https://www.academyofmine.com/anatomy-of-a-scorm-course/

Seen in search snippets only (not opened):
- https://employees.intellum.com/student/path/512086
- https://community.evolveauthoring.com/t/cant-upload-scorm-file-into-evolve-free-trial/3071
- https://help.mapal-os.com/flow-learning/learning-and-development/self-supported-authoring/check-your-evolve-module-before-launch/ (Evolve LMS, different product)
