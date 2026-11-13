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
