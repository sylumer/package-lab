# Plan status

Progress on [plan.md](plan.md). The orchestrator updates this file with each work package's commit. States: `todo`,
`in progress`, `done`, `skipped` (with the reason).

## Summary

In progress on branch `next`.

**Phase 3 (from diagnosis to fix), done.** Corrected package export with six autofixes and a fix picker (`fix`), rule packs for eleven authoring tools and wrappers with a `--tool` override (research was thin, so most rules are info), and comparing two packages (`diff`, Package diff tab) with a Myers line diff.

**Phase 2 (what a local run can't see yet), done.** LMS profiles with eight approximate presets and content on another origin, blocked storage, WebKit runs and device sizes, input macros and the save-and-resume cycle (`cycle`). Popups are now recorded from their first request. `npm test` takes about 2:48, close to the 3:00 cap; later phases put their end-to-end checks behind `--slow`, which takes about 13 minutes.

**Phase 1 (replacing hand work), done.** Overlays (Files tab, `--override`), pins and answers (`--pin`, `--answer`), server-needs discovery (`discover`), an instrumented execution trace (`--trace`, Execution tab), an automatic drill-down (`drill`) and stall analysis. `npm test` takes about 2:20; `--slow` (with a forced-trace pass) about 7 minutes.

**Phase 0 (foundations), done.** One options model across every interface, milestones and progress on every run, and an experiment runner (CLI `experiment`, Experiments tab) with the `api`, `frames` and `standard` presets. `npm test` takes about 1.5 minutes.
 Each commit column is filled in by the following work package's commit, since a commit can't name its own hash.

## Work packages

| # | Work package | Model | State | Commit | Notes |
|---|---|---|---|---|---|
| P0.1 | Launch options model | sonnet | done | fb103a3 | One review round |
| P0.2 | Milestones and progress | sonnet | done | 7203a43 | One review round |
| P0.3 | Experiment runner | sonnet | done | 6c83d13 | One review round (resume now applies to every variant) |
| P1.1 | Change files and rerun (overlays) | sonnet | done | aa4935f | One review round. Editor focus and CRLF handling untested in a browser; cliCommand's --override output not yet in cli.md (P5.3) |
| P1.2 | Pin variables, answer requests | sonnet | done | ec3e7f1 | One review round. Pins are configurable (logged). Some e2e checks moved behind `--slow` |
| P1.3 | What the content wanted from its server | opus | done | d2b0977 | Reviewed by the orchestrator, no changes. Saved discoveries can't be reopened in the UI yet; array elements not explored |
| P1.4 | Code instrumentation: execution trace | opus | done | 5b39657 | Reviewed by the orchestrator. One commit (steps checked in order). `hosted`: window.scorm is true at startCourse, not false as the plan assumed (logged). Overhead fine on `good`, ~17x on compute-heavy code. Known: milestone `t` from API calls is absolute in saved runs |
| P1.5 | Drill-down | opus | done | dba267a | Reviewed by the orchestrator. Resumed once after a usage limit. Adds watch pins; dotted pins share one accessor per object |
| P1.6 | Why it stalled | sonnet | done | 29708c5 | One review round. Also fixed milestone times being absolute. No new tab: the finding carries it |
| P2.1 | LMS profiles and other-origin content | sonnet / opus | done | 5634744 | Built by opus in one piece; reviewed by the orchestrator. Presets from thin haiku research (most vendor pages unreadable), marked approximations. Popup bug fixed in P2.2 |
| P2.2 | Blocked storage and cookies | sonnet | done | 1342563 | One review round (fixes by the orchestrator: popup timeout, no script in content popups). Fixed popup launches being recorded late |
| P2.3 | WebKit and device sizes | sonnet | done | 12a984b | One review round (network confinement, timeouts). Playwright and WebKit installed; WebKit checks are in --slow. Default suite now ~2:41 |
| P2.4 | Save-and-resume cycle | sonnet | done | b3de596 | Resumed once after a usage limit. One review round (typed text now kept only with --record-input; passwords never). Macros are Chromium only |
| P3.1 | Corrected package export | sonnet | done | 2f7c2f0 | One review round (zip names checked, fix picker, UTF-8 only). Run proof uses a new `capitals` fixture: `blank` has a second bug once its capitals are fixed |
| P3.2 | Authoring tool rule packs | sonnet + haiku research | done | 8fcfa13 | Research thin for most tools (Xyleme very thin), so most rules are info. One review round: severities lowered to match the notes; added `--tool` to force a pack |
| P3.3 | Comparing two packages | sonnet | done | | One review round. Behaviour comparison is CLI only (`diff --run`) |
| P4.1 | Code views | sonnet | done | | One review round (formatting in a worker, bounded caches). Big minified files open unformatted first. Six secondary e2e checks moved behind --slow: default suite ~2:24 |
| P4.2 | Timeline | haiku | todo | | |
| P4.3 | Batch checks | haiku | todo | | |
| P4.4 | Redacted report | haiku | todo | | |
| P4.5 | cmi5 and xAPI | sonnet | todo | | |
| P5.1 | Concierge module catch-up | sonnet | todo | | |
| P5.2 | Alfred and CLI polish | haiku | todo | | |
| P5.3 | Documentation pass | haiku + sonnet review | todo | | |
| P5.4 | Final check and release build | sonnet | todo | | |
