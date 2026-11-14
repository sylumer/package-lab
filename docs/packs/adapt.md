# Adapt (adapt-contrib-spoor)

Confidence: HIGH for config keys and defaults (README read). MEDIUM for SCORM 2004 status.

## File layout of SCORM exports

- Spoor is a plugin; the export is the Adapt build with a SCORM manifest added. Manifest id default: `_manifestIdentifier` = `adapt_manifest`. (fetched README)
- Exact output tree (for example `course/`, `imsmanifest.xml` location) not confirmed from the README read.

## Modes and config (keys that switch LMS/web/preview)

- `config.json` → `_spoor._isEnabled` (default `true`). Setting `false` yields a valid SCORM package that does no tracking. (fetched; forum note)
- `_spoor._advancedSettings._scormVersion`: `"1.2"` (default) or `"2004"`. (fetched)
- `_spoor._advancedSettings._showDebugWindow`: default `false`. (fetched)
- `_spoor._advancedSettings._connectionTest` sub-keys: `_isEnabled` (true), `_testOnSetValue` (true), `_silentRetryLimit` (2), `_silentRetryDelay` (1000). (fetched)
- `_spoor._reporting._onTrackingCriteriaMet` values: completed, passed, failed, incomplete. (fetched, no default stated)
- Adapt v3+: `_completionCriteria` must be configured in config.json. (search snippet, community)
- `scorm_test_harness.html` honours `_showCookieLmsResetButton` and `_shouldPersistCookieLMSData`. (fetched)

## Known LMS problems and fixes

- SCORM 2004: README says it is "officially" 1.2 only in Limitations, though 2004 4th Edition files are bundled by default. Treat 2004 as unsupported. (fetched)
- Turning `_isEnabled` on: learners cannot retry questions unless the course resets (e.g. `_isResetOnRevisit` in adapt-contrib-assessment). (community, unconfirmed)
- Commit on exit: `_commitOnStatusChange` true, `_commitOnVisibilityChangeHidden` true, retry limit 5, delay 2000 ms. Tune if the LMS drops commits. (fetched defaults)

## Export settings that matter

- `_isEnabled`, `_scormVersion`, `_tracking._shouldSubmitScore` (default false), `_shouldRecordInteractions` (true), `_shouldStoreResponses` (true).

## Detection hints (file names and strings a tool could look for)

- `config.json` containing `"_spoor"` key
- `"_scormVersion"`, `"_manifestIdentifier": "adapt_manifest"`
- `imsmanifest.xml` (SCORM manifest; `adapt_manifest` identifier)
- `scorm_test_harness.html`

## How SCORM Lab uses this

Reads `config.json` for the `_spoor` key and applies the README's keys: `_isEnabled` false (warning), `_scormVersion` (default 1.2) against the manifest (warning), `_showDebugWindow` (warning), and the 2004 limitation (info). These are confirmed in the package's files.

## Sources

Read (fetched):
- https://github.com/adaptlearning/adapt-contrib-spoor
- https://github.com/adaptlearning/adapt_framework/wiki/Tracking-in-the-Framework---xAPI-and-SCORM-and-others (archived 2015-16 planning page, not current config)

Seen in search snippets only (not opened):
- https://github.com/adaptlearning/adapt-contrib-assessment/wiki/Restore-assessment-state
- https://community.adaptlearning.org/mod/forum/discuss.php?d=2690
