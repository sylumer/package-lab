# SCORM Driver (Rustici)

Confidence: MEDIUM. Official Rustici docs read. Licence and GitHub availability not confirmed.

## File layout of SCORM exports

- The Driver ships a `scormdriver` folder containing `indexAPI.html`, which launches content. (fetched)
- Course files go directly in a top-level `scormcontent/` folder, not in a subfolder. (fetched)
- `indexAPI.html` line `strContentLocation = "../scormcontent/index.html";` points at the start page. (fetched)
- `API.js` holds the function list. (fetched)
- Same process for all SCORM, AICC, cmi5 and Tin Can versions. (fetched)

## Modes and config (keys that switch LMS/web/preview)

- Set the launch page by editing `strContentLocation` in `indexAPI.html`, or name the start page `index.html`. (fetched)
- Driver is a global object when `scormdriver.js` is included: `var SD = window.parent;` (driver in parent frame) or `var SD = window;` (same page). (fetched)
- Example call: `SD.SetPassed()` returns a boolean; check for `true` to confirm the LMS accepted it. (fetched)
- No separate LMS/preview mode switch was found in the docs read.

## Known LMS problems and fixes

- Not covered in the docs read. Contact support@scorm.com for Driver issues (per docs). (fetched)

## Export settings that matter

- Not applicable; Driver is a runtime library, not an authoring export. Packaging is covered on a "Packaging Content" page, not read.

## Detection hints (file names and strings a tool could look for)

- Folder `scormdriver/` containing `indexAPI.html` (strong)
- `scormdriver.js` (Driver library file name; also used by Storyline, so not unique)
- `API.js`
- `scormcontent/` (folder convention)
- `strContentLocation` (string in `indexAPI.html`)
- `var SD = window` / `SD.SetPassed`

## How Package Lab uses this

Detects `scormdriver/indexAPI.html`, `strContentLocation`, `scormdriver.js`. Static: `strLMSStandard`, read only in `scormdriver*.js` files, against the manifest version (info: "SCORM" is read as 1.2 and "SCORM2004" as 2004, but the docs read here don't list the values; other values are reported neutrally), and `strContentLocation` naming a missing file (warning, read from the files). Run (info): the driver loaded but nothing looked for the LMS.

## Sources

Read (fetched):
- https://docs.rusticisoftware.com/driver/index.html

Seen in search snippets only (not opened):
- https://rusticisoftware.com/products/rustici-driver/
- https://rusticisoftware.com/resource-product-type/rustici-driver/

Note: a GitHub repo for "scormdriver" was not found in search results. The search did not establish that the Driver source is public.
