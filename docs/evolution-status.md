# Evolution status

Progress on [evolution-plan.md](evolution-plan.md). The orchestrator updates this file with each work package's
commit. The states are `todo`, `in progress`, `done` and `skipped` (with the reason).

## Summary

Phase 0 done: `test/ui.js` drives the real app through Playwright's Electron driver (`npm run test:ui`, also in `--slow`); slow suite passed and merged into main.

Phase 1 done: macro format 2 (window size, wait steps, a player on one clock), clicks tied to the element clicked with a position fallback, and a Record button in the desktop app. Each took one review round; the slow suite passed and main was fast-forwarded to b2eb223. Phase 2 in progress.

Each commit column is filled in by the following work package's commit, since a commit can't name its own hash.

## Work packages

| # | Work package | Model | State | Commit | Notes |
|---|---|---|---|---|---|
| E0.1 | UI smoke test harness | sonnet | done | 5736ac5 | Playwright `_electron` works with Electron 45; no fallback needed. One review round. |
| E1.1 | Macro format 2: window size and wait steps | sonnet | done | 86accd4 | One review round: wait text now counts toward the 100 KB text cap; out-of-order events were already sorted by `check.macro`. The 800×600 test uses latebutton, not good (see decisions.md). |
| E1.2 | Clicks tied to the element clicked | sonnet | done | d8d27d1 | One review round: the element is asked for before the click is sent, selectors are checked for uniqueness, no text near fields, CSS hex escapes redacted. The field-text guard has no unit test (probe code), only end-to-end coverage. |
| E1.3 | Record from the desktop app | haiku | done | b2eb223 | One review round: restore path shows Record, replayed macro clicks excluded, only the run recording at press time finishes it, fixed aria-label, focus to Launch after the dialog, run window keeps the course's title. Pressing Record again stops the run. "Never in the web interface" is covered by code only. |
| E2.1 | Window chrome and one toolbar | sonnet | done | 07a83e1 | One review round: vibrancy now shows through the sidebar only, Run text colour follows the accent's luminance, status keeps its full text as a tooltip, short UI strings say Run and Stop. Developer Tools moved to ⇧⌥⌘I. The web check uses a cached Chromium 1200 (build 1255 not installed). Light and dark screenshots come with E3.3. One `npm test` run failed once in the Alfred fix check and passed on rerun (flaky, unrelated). |
| E2.2 | The inspector: run settings on the right | sonnet | done | | One review round. The before object was captured from the E2.1 web interface (`test/fixtures/launch-options-before.json`, every control set) and is compared after the change; macro and answers aren't in it. The Compare view's working-copy button was dropped (Compare stays hidden until a comparison exists); File → Record a Working Copy… and the sidebar's Package group cover it. Narrow widths (under 800 px) not checked. |
| E2.3 | Views grouped in the sidebar | sonnet | in progress | | |
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
