# pipwerks SCORM API Wrapper

Confidence: MEDIUM. Repo page read. Function names and file name not confirmed from the page.

## File layout of SCORM exports

- Not an authoring tool; a JavaScript wrapper dropped into a package. Main file name not confirmed (the repo page showed `src/`, `package.json`, `readme.md`). Older archived copies are named `SCORM_API_wrapper.js` (search snippets, unconfirmed for current release).

## Modes and config (keys that switch LMS/web/preview)

- None found. Version-agnostic: works with SCORM 1.2 and SCORM 2004 without extra config. (fetched readme)
- Lookup uses `SCORM.API.find()` and `SCORM.API.get()`, based on ADL code. (fetched readme)

## Known LMS problems and fixes

- Not investigated in depth. Author page (pipwerks.com) returned 404 on fetch, so changelog details are unconfirmed.
- Older release notes (from snippets, unconfirmed): 1.1.x "auto-handle exit and status"; version 1.1.7 from 2008.

## Export settings that matter

- Not applicable.

## Detection hints (file names and strings a tool could look for)

- `SCORM_API_wrapper.js` (candidate name in older copies)
- `pipwerks` as a global namespace (`pipwerks.SCORM`) — candidate, unconfirmed
- `SCORM.API.find`, `SCORM.API.get` (fetched readme)
- `API`, `API_1484_11` (adapter objects a wrapper searches for; general SCORM, unconfirmed here)

## How Package Lab uses this

Detects `SCORM_API_wrapper` and `pipwerks.SCORM`. Static: the wrapper is present but no script calls `SCORM.init()` (info). Run: the wrapper's API lookup found nothing.

## Sources

Read (fetched):
- https://github.com/pipwerks/scorm-api-wrapper

Seen in search snippets only (not opened or fetch failed):
- https://pipwerks.com/laboratory/scorm/api-wrapper-javascript (404 on fetch)
- https://pipwerks.com/scorm-api-wrapper-116/
- https://www.npmjs.com/package/pipwerks-scorm-api-wrapper (community fork, not the official repo)
