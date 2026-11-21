# Evolution status

Progress on [evolution-plan.md](evolution-plan.md). The orchestrator updates this file with each work package's
commit. The states are `todo`, `in progress`, `done` and `skipped` (with the reason).

## Summary

Phase 0 done: `test/ui.js` drives the real app through Playwright's Electron driver (`npm run test:ui`, also in `--slow`); slow suite passed and merged into main. Phase 1 in progress.

Each commit column is filled in by the following work package's commit, since a commit can't name its own hash.

## Work packages

| # | Work package | Model | State | Commit | Notes |
|---|---|---|---|---|---|
| E0.1 | UI smoke test harness | sonnet | done | 5736ac5 | Playwright `_electron` works with Electron 45; no fallback needed. One review round. |
| E1.1 | Macro format 2: window size and wait steps | sonnet | done | 86accd4 | One review round: wait text now counts toward the 100 KB text cap; out-of-order events were already sorted by `check.macro`. The 800×600 test uses latebutton, not good (see decisions.md). |
| E1.2 | Clicks tied to the element clicked | sonnet | done | | One review round: the element is asked for before the click is sent, selectors are checked for uniqueness, no text near fields, CSS hex escapes redacted. The field-text guard has no unit test (probe code), only end-to-end coverage. |
| E1.3 | Record from the desktop app | haiku | in progress | | |
| E2.1 | Window chrome and one toolbar | sonnet | todo | | |
| E2.2 | The inspector: run settings on the right | sonnet | todo | | |
| E2.3 | Views grouped in the sidebar | sonnet | todo | | |
| E2.4 | A verdict at the top of Findings | haiku | todo | | |
| E2.5 | Drop a package on the window; short tooltips | haiku | todo | | |
| E3.1 | Split the user guide; docs link check | haiku | todo | | |
| E3.2 | Docs search, contents and context help | sonnet | todo | | |
| E3.3 | Screenshots by script; images in the docs panel | haiku | todo | | |
| E4.1 | The live view in the desktop app, with coordinates | sonnet | todo | | |
| E4.2 | The macro editor | sonnet | todo | | |
| E5.1 | CLI, web, Alfred and Concierge in step | sonnet | todo | | |
| E5.2 | Documentation pass | haiku | todo | | |
| E5.3 | Final check and release build | sonnet | todo | | |
