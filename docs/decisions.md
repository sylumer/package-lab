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
