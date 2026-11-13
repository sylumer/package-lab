# Plan status

Progress on [plan.md](plan.md). The orchestrator updates this file with each work package's commit. States: `todo`,
`in progress`, `done`, `skipped` (with the reason).

## Summary

In progress on branch `next`.

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
| P1.3 | What the content wanted from its server | opus | done | | Reviewed by the orchestrator, no changes. Saved discoveries can't be reopened in the UI yet; array elements not explored |
| P1.4 | Code instrumentation: execution trace | opus | todo | | |
| P1.5 | Drill-down | opus | todo | | |
| P1.6 | Why it stalled | sonnet | todo | | |
| P2.1 | LMS profiles and other-origin content | sonnet / opus | todo | | |
| P2.2 | Blocked storage and cookies | sonnet | todo | | |
| P2.3 | WebKit and device sizes | sonnet | todo | | |
| P2.4 | Save-and-resume cycle | sonnet | todo | | |
| P3.1 | Corrected package export | sonnet | todo | | |
| P3.2 | Authoring tool rule packs | sonnet + haiku research | todo | | |
| P3.3 | Comparing two packages | sonnet | todo | | |
| P4.1 | Code views | sonnet | todo | | |
| P4.2 | Timeline | haiku | todo | | |
| P4.3 | Batch checks | haiku | todo | | |
| P4.4 | Redacted report | haiku | todo | | |
| P4.5 | cmi5 and xAPI | sonnet | todo | | |
| P5.1 | Concierge module catch-up | sonnet | todo | | |
| P5.2 | Alfred and CLI polish | haiku | todo | | |
| P5.3 | Documentation pass | haiku + sonnet review | todo | | |
| P5.4 | Final check and release build | sonnet | todo | | |
