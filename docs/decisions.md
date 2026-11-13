# Decisions

Choices made while carrying out [plan.md](plan.md) where the plan left them open. One line each: date, work package,
the choice, and why.

- 2026-11-13 · P0.1 · `handlers.launch` stays flat (`{ item, cmi?, ...options }`) · the web and UI callers already send flat fields; `item` and `cmi` are the only non-options.
- 2026-11-13 · P0.1 · `wait` (CLI seconds, default 10) and `auto` (UI auto-stop) are both options · `auto` is the UI's name, `wait` the CLI's; the CLI line uses `auto` as `--wait` when set.
- 2026-11-13 · P0.1 · `profile` and `storage` accept any non-empty string, `browser` only `chromium` · the packages that define their values (P2.1, P1.2, P2.3) narrow or widen the checks.
- 2026-11-13 · P0.1 · The More options area gets its JSON and CLI line from a new `options` handler · the UI is classic scripts and can't import `options.js`; one source of truth.
- 2026-11-13 · P0.1 · `--resume-from` stays a job field, not an option; the run sets `options.resume` true when it resumes · a file path isn't a launch option.
- 2026-11-13 · P0.1 · Depth outside 0–5 now throws instead of clamping · the plan says every field is validated.
- 2026-11-13 · P0.1 · Bad `--wait`, `--depth` or UI `auto` values now fail (exit 2) instead of falling back to a default or clamping · every option is validated in one place.
- 2026-11-13 · P0.1 · `options.resume` becomes true when a run uses `--resume-from` · the saved options then describe what the run did.
- 2026-11-13 · orchestrator · plan-status commit hashes are recorded by the next work package's commit · a commit can't contain its own hash
- 2026-11-13 · P0.2 · `furthest` is the highest step reached, not the end of an unbroken run from the start · a course that skips a step (a script failed but the API still worked) is still best described by how far it got; `firstMissing` says what was skipped.
- 2026-11-13 · P0.2 · `looked` and `found` also count any API call, and `found` needs a lookup that found something or a call · API objects found by paths the probe doesn't see (a host's own API) still show progress.
- 2026-11-13 · P0.2 · `progress` takes `{ milestones, counts }` objects (or bare lists) and breaks a tie on furthest by the number of steps reached · the plan says it compares lists and counts; one call shape for both.
- 2026-11-13 · P0.2 · Script tags on other sites are not required for `scripts` · SCORM Lab's host never sees them requested through the package.
- 2026-11-13 · P0.2 · Milestones are computed in `main.js` and stored in the saved run, and in `run --json` as `milestones` and `furthest` · one place, readers needn't recompute; the report falls back to computing them for older runs.
- 2026-11-13 · P0.2 · The "Got as far as" finding is put first after sorting, though it is `info` · the plan says top of every package run; `verdict()` still picks the first error or warning.
- 2026-11-13 · P0.2 · `launched` counts any 2xx or 3xx response, and the user guide says so · a redirect still means the launch page was served.
- 2026-11-13 · P0.2 · `milestoneFinding` lives in `milestones.js`, not `rules.js` · it formats the milestone list, so it sits beside it; `rules.js` stays findings from trace evidence, and `main.js` adds it first.
- 2026-11-13 · P0.2 · `progress` throws on missing milestone lists, and says "same furthest step (X), more/fewer steps reached" when only the tie-break differs · avoids "reached X (was X)" and silent bad input.
- 2026-11-13 · P0.3 · The base run is always the first row, named `default`, and (for presets) a variant with the same options as an earlier one is left out · the plan says `standard` is "deduplicated", and a run identical to the default would only repeat it (so `api manifest` and `depth 0` don't appear under the defaults).
- 2026-11-13 · P0.3 · `experiment` with neither `--preset` nor `--variants` uses `standard`; both together fail · a useful default beats an error; two sources would be ambiguous.
- 2026-11-13 · P0.3 · The "gets further" warning needs the furthest step to be later, not just more steps reached · the title says "reached X", which a tie on the furthest step would make false.
- 2026-11-13 · P0.3 · The CLI starts one Electron per variant (the existing `runPackage`), the apps run them in one process · reuses the headless path as the plan says; the apps already hold a long-lived process.
- 2026-11-13 · P0.3 · In the apps, each variant runs for `wait` (set from "Stop after", or 10 s if "I stop it") through `auto` · a table of runs needs each to end by itself.
- 2026-11-13 · P0.3 · The Experiments table lives in the page (not the saved state), and a late-joining web client sees only later events · simplest; the runs themselves are all in the runs list.
- 2026-11-13 · P0.3 · `--variants` accepts a list or `{ variants }`, and `--resume-from` applies to every run, as part of the base · the apps treat resume as a base option, so the CLI matches.
- 2026-11-13 · P0.3 · Variants equal to an earlier one are dropped only for presets; variants from a user's file all run · the user wrote them on purpose (a repeat of the default shows run-to-run noise), and silent dropping would surprise.
- 2026-11-13 · P0.3 · In the apps, a variant whose run ends unrecorded is shown as failed and the experiment carries on (a failed default stops it); a run cut short by Stop is left out of results · a truncated run would make misleading comparisons.
- 2026-11-13 · P1.1 · A bare string in `options.files` is accepted and means `{ content }` · P0.1's `files` was text only, so existing options files keep working; the stored form is always `{ content }` or `{ base64 }`.
- 2026-11-13 · P1.1 · Session overrides live in `pkg.overrides` on the server and `launch` uses them when the caller gives no `files` · the web interface has several clients and the plan says "kept in the session's package state"; an explicit `files` (CLI, experiments' variants) always wins.
- 2026-11-13 · P1.1 · The tree is a sorted list with folder rows and indentation, not collapsible folders · simplest thing that is a tree; the filter flattens it.
- 2026-11-13 · P1.1 · Files over 1 MB are not opened in the editor (replace from a file only) · a textarea with huge text is slow, and the plan only requires editing text files.
- 2026-11-13 · P1.1 · Binary replacement goes through the JSON `override-set` handler as base64 (about 15 MB) on desktop and web · one path for both, no new upload endpoint; the path is checked in the handler either way.
- 2026-11-13 · P1.1 · Saving a file back to exactly its original bytes removes the override · it isn't a change, and it keeps "changed files" honest.
- 2026-11-13 · P1.1 · The boot graph is recomputed for a run with overrides, but the static analysis (manifest, script scan) stays the original's · the plan asks only for the boot graph; re-analysing is a later refinement.
- 2026-11-13 · P1.1 · The "got further" comparison finding is made only in the apps, against the latest earlier run of the same item without overrides, and is not rebuilt when a saved run is reopened · it needs the session's earlier runs; the CLI user compares `furthest` or uses an experiment. The "used N changed files" note is rebuilt from `launch.options.files`.
- 2026-11-13 · P1.1 · `--options-from` takes the saved run's whole `launch.options`; `--options` and flags override it, and `--override` adds to its files · most specific wins.
- 2026-11-13 · P1.1 · `src/textdiff.js` is an LCS table with common start/end trimmed and a size cap · P3.3 doesn't exist; P3.3 can replace it with Myers behind the same two functions.
- 2026-11-13 · P1.1 · Changed files are limited to 50 MB each and 200 MB in all, checked in `normaliseOptions` · keeps memory bounded whichever interface sends them; summaries sent to the UI carry paths and sizes only.
- 2026-11-13 · P1.1 · `cliCommand` writes `--override path=path` for each changed file (a local copy at the same relative path is assumed) and not `--options options.json` for files alone · a copyable line that works once the files are saved, without a placeholder to edit.
- 2026-11-13 · P1.1 · Saving from the editor keeps CRLF line endings if the file used them · the textarea turns them into LF; an unchanged save then equals the original and makes no override.
- 2026-11-13 · P1.1 · The Files view isn't redrawn while the editor has focus · run and state events would otherwise reset the cursor and scroll.
- 2026-11-13 · P1.1 · Reopening a saved run does not rebuild the "compared with the run before" finding · accepted: it needs the session's earlier runs.
