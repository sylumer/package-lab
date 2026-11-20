# Package Lab: evolution plan

Written 2026-11-20. A work plan for the stage after [plan.md](plan.md), to be carried out from start to finish by an
orchestrating Claude session that sends work to subagents. It has three goals:

- **A friendlier app.** Make the desktop app feel like a Mac app and stop it looking intimidating.
- **App-first docs.** Lead with the app rather than the command line, in shorter pages, with help reachable from where
  it's needed.
- **Real macros.** Macros people can find, trust and edit: the window size saved with them, wait steps, clicks tied to
  the element clicked, recording in the desktop app, coordinates on screen and an editor.

Progress is recorded in [evolution-status.md](evolution-status.md). Decisions made along the way go in
[decisions.md](decisions.md).

- [Where things stand](#where-things-stand)
- [How to run this plan](#how-to-run-this-plan)
- [Rules for every work package](#rules-for-every-work-package)
- [Models](#models)
- [Order and dependencies](#order-and-dependencies)
- [Phase 0: a safety net for the UI](#phase-0-a-safety-net-for-the-ui)
- [Phase 1: macros that replay reliably](#phase-1-macros-that-replay-reliably)
- [Phase 2: a Mac-style window](#phase-2-a-mac-style-window)
- [Phase 3: documentation built around the app](#phase-3-documentation-built-around-the-app)
- [Phase 4: coordinates and the macro editor](#phase-4-coordinates-and-the-macro-editor)
- [Phase 5: interfaces in step, final check](#phase-5-interfaces-in-step-final-check)
- [Not planned](#not-planned)
- [Prompt templates](#prompt-templates)

## Where things stand

**UI** (`src/ui/index.html`, `src/ui/app.js`, `src/ui/style.css`):

- Two toolbar rows with about 20 controls, then a **More options** disclosure holding launch parameters, storage,
  authoring tool, browser, device size, tracing, profile fields, the macro, pins, answers and the options JSON.
- Twenty-one tabs in one row (`TABS`, `app.js`), some hidden when empty (`HIDE`).
- Tooltips are paragraphs.
- Jargon is the first thing a new user sees: "Frame depth", "API: As the manifest says", "Record caught errors".
- The window is a plain `BrowserWindow` (`createWindow`, `src/main.js`) with a standard title bar.
- No automated test looks at the UI itself. UI work so far was checked through the handlers (`invoke` over the web
  interface in `test/test.js`) and by eye.

**Docs:**

- `user-guide.md` is 955 lines, `cli.md` 986 and `developer-guide.md` 1,576.
- The docs panel (`src/docs.js`, `openDoc` in `app.js`) offers 21 documents in one flat menu, with no search.
- `markdown.js` doesn't draw images.
- The user guide has around 30 command-line references mixed into it.

**Macros** (`src/options.js` `check.macro`, `src/cycle.js`, `live` and `macro` in `src/main.js`, the input listeners
in `src/host/probe.js`):

- An event is `{ t, type: click | move | wheel | key | text, x, y, dy, key, text, approx }`. `x` and `y` are 0–1
  fractions of the content window.
- **The size isn't kept.** Replay maps fractions onto whatever size the window has at replay (`live.input`). The
  macro doesn't record the size it was made at, so a different window size, or content that reflows, sends clicks to
  the wrong place.
- **Replay is time-only.** It is `setTimeout(…, e.t)` per event (`launchItem`). On a slower load, clicks arrive before
  the thing they were meant for exists.
- **Recording is hidden.** "Record clicks" exists only in the web interface's Live view (`livePanel`). In the desktop
  app the only route is "Use this run's clicks" (`macro-from-run`, built from the probe's `input` reports), hidden
  under More options.
- **There's no editor.** The macro file format is `{ format: 'package-lab-macro', version: 1, events }` (`macroFile`,
  `readMacro`).

## How to run this plan

The orchestrator is a **Sonnet** session in `~/github/package-lab`. No work package here needs new design at the level
that justified Opus in plan.md, so the orchestrator is the cheaper model too. It works as follows:

1. **Set up once.**
   1. Read this file, `docs/developer-guide.md`, `DESIGN.md` and `evolution-status.md`.
   2. Check `git status --short`. If anything other than `docs/evolution-plan.md`, `docs/evolution-status.md` or
      `docs/README.md` is uncommitted, **stop and tell the owner**. This is the only question the plan allows: work
      in progress mustn't be swept into a work package's commit.
   3. Create the branch:
      ```bash
      git switch -c evolve
      ```
      If `evolve` already exists, switch to it and carry on from the first work package in `evolution-status.md`
      that isn't `done` or `skipped`.
2. **Take the work packages in [table order](#order-and-dependencies).** For each one:
   1. Mark it `in progress` in `evolution-status.md`.
   2. Send it to a subagent with the [prompt template](#prompt-templates), using the work package's model. Wait for
      the result.
   3. Review the diff with a reviewer subagent of the model given in the table (agent type
      `caveman:cavecrew-reviewer`). Send any problems back to the same builder with `SendMessage`, at most twice.
   4. Run `npm test`. Run `npm test -- --slow` as well when the work package touches `src/main.js`, `src/host/` or
      `src/recorder.js`, or adds a `--slow` check. Every acceptance criterion must hold.
   5. Commit on `evolve` (see [commits](#commits)), with `evolution-status.md` updated (state, previous commit's hash,
      notes) in the same commit.
3. **Escalation.** If a Haiku work package fails review twice, retry it once with Sonnet. If a Sonnet one does, retry
   it once with Opus. Record the escalation in `evolution-status.md`.
4. **When a work package can't be finished.** That means it has failed acceptance after escalation, or it needs
   something the machine can't provide. Then:
   1. Revert its uncommitted changes: `git restore --staged --worktree .`, and remove any new files.
   2. Mark it `skipped` with the reason, and skip every work package that needs it.
   3. Carry on with the next independent work package. Never stop the whole plan for one.
5. **At the end of each phase:**
   1. Run `npm test -- --slow`.
   2. Merge into `main`:
      ```bash
      git switch main
      git merge --ff-only evolve
      git switch evolve
      ```
   3. Write a short phase summary at the top of `evolution-status.md`.
6. **At the end:** after E5.3, write the final summary in `evolution-status.md`: what was built, what was skipped and
   why, what still needs a look by eye, and what to try first.
7. **Never push**, and never ask the owner anything else. Decide with the
   [defaults](#decisions-without-the-owner) and log the decision.

**Where agents work.** Work sequentially in this one checkout, on `evolve`, without worktree isolation (there is no
remote for worktrees to branch from). Parallel work is allowed only in these cases:

- read-only research subagents;
- Phase 3's documentation work packages, which may run alongside a Phase 4 work package because they touch only
  `docs/`, `src/docs.js` and `src/ui/markdown.js`, and Phase 4 doesn't touch those.

### Decisions without the owner

When the plan leaves something open, choose in this order:

1. **What the plan says.**
2. **The existing pattern in the code.** See the developer guide; reuse helpers already there (`h`, `act`, `say`,
   `normaliseOptions`, `readMacro`, `live.input`, the `HIDE` rules, the docs panel).
3. **The simplest version that meets the acceptance criteria.** Note the larger version as a `ponytail:` comment with
   its ceiling.
4. **When two options are equally simple, the one that adds no dependency and keeps all data on the machine.**

Log each choice as a line in `docs/decisions.md`: date, work package, the choice, and why.

### Commits

These are the owner's rules, and they override any default:

- **No attribution trailers.** Never add `Co-Authored-By` or any other AI attribution line. Commit as the user.
- **Message format.** A subject line under about 72 characters, in the imperative ("Add …", "Let …"), then a blank
  line, then a short body.
- **Check before going on.** Run `git log -1 --format=%B` and confirm the second line is blank.
- **One commit per work package.** A work package marked L may commit at its numbered steps.

## Rules for every work package

All of plan.md's [rules](plan.md#rules-for-every-work-package) still apply: privacy, no new runtime dependencies, pure
analysis modules, saved runs that stay readable, interfaces in step, and the writing style. In addition:

- **The web interface stays working.** `index.html` and `app.js` are shared by the desktop app and the web interface.
  - Anything that exists only in Electron (title bar, vibrancy, the accent colour, file paths from drops) must degrade
    to nothing in a browser.
  - Check with `lab.web` or feature detection; never by user agent.
- **No UI frameworks or icon fonts.** Icons are inline SVG `<symbol>`s in `index.html` (the CSP allows them), used
  with `<svg><use href="#i-run"/></svg>`. Styles stay in `style.css`, as tokens on `:root` with the dark values under
  `prefers-color-scheme: dark`.
- **Accessibility basics are not optional.**
  - Every icon-only button has an `aria-label`.
  - Everything works from the keyboard.
  - Focus is visible.
  - Colour is never the only signal: severity has an icon and a word.
- **Macro privacy.** Typed text and the text of clicked elements are learner-adjacent data.
  - Typed text: never from password-like fields (the probe's `secret`), and kept only with `recordInput`.
  - Element text: at most 60 characters, never from `input`, `textarea` or `contenteditable` (their `aria-label` or
    `placeholder` is used instead).
  - Both are redacted by `report --redact` (`src/redact.js`).
- **Test layers.** Choose the cheapest layer that would fail if the code broke:
  1. **Unit** (`node test/test.js --unit`, no Electron): pure functions. Every new pure function gets at least one
     assertion here.
  2. **Handlers** (end to end, over the web interface's `invoke`): new IPC handlers and run behaviour. Behind `slow`
     when a check launches a run.
  3. **UI smoke** (E0.1, `test/ui.js`, behind `--slow`): what a person sees and clicks. One check per visible
     behaviour a work package adds, not per element.
- **Suite budget.** The default suite stays under three minutes. New checks that launch Electron or a run go behind
  `--slow`.
- **Docs in the same work package.** User-facing changes go in the guide pages: the `user-guide.md` sections until E3.1
  has split it, then `docs/guide/`. Internals go in `developer-guide.md`, and new launch options and CLI flags in
  `cli.md`.

## Models

Subagents use the Agent tool's `model` parameter. **Use the cheapest model that can do the work package without a
review round being likely to fail:**

| Model | Use for | In this plan |
|---|---|---|
| **haiku** | The spec decides everything; mechanical edits; moving text; scripts with a clear recipe; documentation | E1.3, E2.4, E2.5, E3.1, E3.3, E5.2. Reviews of doc-only work packages, apart from checking them against the code |
| **sonnet** | Judgement in Electron, CDP, the probe or the UI's structure; anything touching replay, privacy or the window; every code review | E0.1, E1.1, E1.2, E2.1, E2.2, E2.3, E3.2, E4.1, E4.2, E5.1, E5.3, the orchestrator, and reviews of all code work packages and of E3.1's accuracy |
| **opus** | Only as the escalation after a Sonnet work package fails review twice | — |

**Why so little Opus.** The hard parts here (element anchors across frames, the replay player) are well specified
below, and plan.md's history shows Sonnet handled harder probe and CDP work (P2.1, P2.3, P2.4) with one review round.
The documentation work packages are Haiku, but plan.md's P5.3 found that Haiku documentation drifted from the code
(29 mismatches). So E3.1 gets a **Sonnet accuracy review**, and the docs link check (E3.1) catches broken links
mechanically.

**Research.** None is needed. If a subagent needs Electron or Playwright API details, it reads `node_modules` (the
types and docs that ship there) before searching the web.

## Order and dependencies

| # | Work package | Model | Review | Needs | Size |
|---|---|---|---|---|---|
| E0.1 | UI smoke test harness | sonnet | sonnet | — | S |
| E1.1 | Macro format 2: window size and wait steps | sonnet | sonnet | — | M |
| E1.2 | Clicks tied to the element clicked | sonnet | sonnet | E1.1 | M |
| E1.3 | Record from the desktop app | haiku | sonnet | E1.1 | S |
| E2.1 | Window chrome and one toolbar | sonnet | sonnet | E0.1 | M |
| E2.2 | The inspector: run settings on the right | sonnet | sonnet | E2.1 | L |
| E2.3 | Views grouped in the sidebar | sonnet | sonnet | E2.2 | M |
| E2.4 | A verdict at the top of Findings | haiku | sonnet | E2.3 | S |
| E2.5 | Drop a package on the window; short tooltips | haiku | sonnet | E2.2 | S |
| E3.1 | Split the user guide; docs link check | haiku | sonnet (accuracy) | E2.3 | L |
| E3.2 | Docs search, contents and context help | sonnet | sonnet | E3.1 | M |
| E3.3 | Screenshots by script; images in the docs panel | haiku | sonnet | E3.1, E0.1 | S |
| E4.1 | The live view in the desktop app, with coordinates | sonnet | sonnet | E1.2, E2.2 | M |
| E4.2 | The macro editor | sonnet | sonnet | E4.1 | L |
| E5.1 | CLI, web, Alfred and Concierge in step | sonnet | sonnet | Phases 1–4 | S |
| E5.2 | Documentation pass | haiku | sonnet (accuracy) | everything | M |
| E5.3 | Final check and release build | sonnet | — (the orchestrator) | everything | S |

Sizes are as in plan.md: S up to about 300 lines with tests and docs, M up to about 800, L up to about 1,500.

Run them in table order. The only reordering allowed is skipping past something skipped, plus the parallel
documentation work described under [Where agents work](#how-to-run-this-plan).

---

## Phase 0: a safety net for the UI

### E0.1 UI smoke test harness (sonnet)

**Goal.** Phase 2 restructures the window. Before that starts, there needs to be a test that opens the real app,
clicks through it and fails if a visible behaviour breaks.

**Files.** New `test/ui.js`. `test/test.js` (calls it when `--slow`), `package.json` (a `test:ui` script), and the
testing section of `developer-guide.md`.

**Build.**

1. Use Playwright's Electron driver, which is already a devDependency, so nothing is added:
   ```js
   import { _electron } from 'playwright'
   const app = await _electron.launch({ args: [root, fixtureZip], env: { ...process.env, PACKAGE_LAB_DATA: tmpDir } })
   const win = await app.firstWindow()
   ```
   - `PACKAGE_LAB_DATA` (read in `main.js`) moves saved runs and settings to a temporary folder. Never use the
     owner's real data folder.
   - Passing the zip as an argument opens it (`openPath`).
2. Write a small helper set, used by every later work package:
   - `open(zip)`;
   - `launch()`, which clicks the launch control and waits for `#stop` to be enabled;
   - `stop()`;
   - `view(name)`, which selects a view by its visible name (tab text today; E2.3 changes how it finds it);
   - `text(selector)`.

   Select by role and visible text (`getByRole('button', { name: 'Launch' })`) wherever possible, so the
   restructuring in Phase 2 changes the helpers, not every check.
3. **Checks for today's UI** (each one is what a person would notice broken):
   - With no package: the start screen shows "Something is wrong? Start here", and the tab bar is hidden.
   - After opening `good`: the package name shows, and Launch is enabled.
   - Launch, wait 3 seconds, stop: a run appears in the runs list, and Findings shows at least one finding.
   - The Help button opens the docs panel with the user guide. Close hides it.
   - ⌘, opens Settings, and Escape closes it.
4. If `_electron.launch` doesn't work with this Electron version, fall back to driving the web interface with
   Playwright's Chromium against `package-lab serve` on a free port, and log the decision. Then the desktop-only
   checks in later work packages become handler checks.

**Tests.** `test/ui.js` is the test. It runs within `npm test -- --slow` and on its own via `npm run test:ui`, and
takes under 60 seconds.

**Acceptance.**
- `npm run test:ui` passes on a clean checkout.
- Breaking any one of the checks deliberately makes it fail: for example rename the Launch button in `index.html`,
  check that it fails, then revert. Note in the report that this was tried.
- The default `npm test` time is unchanged.

---

## Phase 1: macros that replay reliably

### E1.1 Macro format 2: window size and wait steps (sonnet)

**Goal.** A macro replays at the size it was recorded at, and can wait for the content instead of relying on timing.

**Files.** `src/options.js`, `src/cycle.js`, `src/main.js` (the `macro` recorder, `live`, the replay in
`launchItem`), `src/recorder.js` (the window size in the trace), `bin/package-lab.js` (`--macro`), `src/ui/app.js`
(`showMacro`, the `macro-save` caller), `src/redact.js`, tests and docs.

**Spec.**

- **Event types.** Add `wait` to `MACRO_FIELDS`, with exactly one of:
  - `ms`: 1 to 600000;
  - `text`: 1 to 200 characters. Waits until the text appears in any content frame's `document.body.innerText`;
  - `milestone`: one of the ids in `STEPS` (`src/milestones.js`), such as `found`, `initialised`, `wrote`;
  - `quiet`: 100 to 30000. Waits until no request has been pending for that many milliseconds.

  Also an optional `timeout`, 1000 to 600000, defaulting to 30000. Validate the fields in `check.macro` the way the
  other types are validated, with clear messages naming the event number.
- **Macro file version 2.** The file is:
  ```json
  { "format": "package-lab-macro", "version": 2, "viewport": { "width": 1100, "height": 800 }, "events": [ … ] }
  ```
  - `readMacro` accepts versions 1 and 2 and a bare list, and returns `{ events, viewport }`, with `viewport: null`
    when the file has none.
  - `macroFile(events, viewport)` writes version 2.
  - Update every caller of `readMacro`; `grep -n readMacro` finds them.
- **The size comes through the existing `viewport` option, not a new one.** When a macro with a size is loaded (UI,
  CLI `--macro`, `cycle-start`) and the run's `viewport` is null, set `viewport` to `"WIDTHxHEIGHT"`.
  - If the run already has a different viewport, keep the run's, and add a probe note
    `{ type: 'macro-size', recorded, used }`.
  - `runFindings` turns that note into an `info` finding: "The macro was recorded at 1100×800 and played at 390×844:
    clicks may miss".
- **Recording the size.**
  - `Recorder` adds `trace.window = { width, height }`: the content size when the run starts, and again whenever it
    changes, keeping the last value.
  - `macro-save` returns `{ events, viewport }`, with the viewport from the active window's `getContentSize()` at the
    first recorded event.
  - `macro-from-run` returns `{ events, viewport: trace.window ?? null }`.
- **The player.** Replace the `setTimeout` loop with one async function, `playMacro(a, events, from = 0, to)`, in
  `main.js`:
  - It plays events in order. Before each one it sleeps `e.t - prev.t` (the first event: `e.t`). A `wait` event
    blocks until its condition holds or it times out.
  - It stops when the run (`a`) is no longer `active`.
  - **Checking a wait** happens every 250 ms:
    - `text`: `Runtime.evaluate` in every attached session (`rec.sessions`). Ignore errors from frames that have gone.
    - `milestone`: compute `milestones(rec.trace, boot)` and look at `reached`.
    - `quiet`: the recorder's pending requests (`rec.req`).
  - **On timeout:** push a probe note `{ type: 'macro-wait', event: i, waited: ms, for: … }` and stop the macro.
    `runFindings` turns it into a `warn` finding: "The macro stopped at step 4: waited 30 s for “Next” and it never
    appeared", whose fix says to lengthen the timeout or check the step before.
  - `from` and `to` are for E4.2. Export the timing part as a pure function `macroDelays(events)`, returning the
    sleep before each event, so it can be unit-tested.
- **UI.**
  - `st.macro` becomes `{ events, viewport }` (an empty macro is `{ events: [], viewport: null }`).
  - `showMacro` shows "14 events over 12.3 s, recorded at 1100×800".
  - `launchOptions` sends `macro: st.macro.events`, and sets `viewport` from the macro as above when the Device size
    select is "Window as it is".
- **Redaction.** `redact.js` already cuts `text` in macro events. Wait `text` values are cut the same way: they can be
  course text.

**Tests.**
- Unit:
  - `check.macro` accepts each wait form and refuses each bad one: two conditions, a timeout out of range, an unknown
    milestone.
  - `readMacro` accepts version 1, version 2 and a bare list, with the right `viewport`.
  - `macroFile` round-trips.
  - `macroDelays([{t:0},{t:500},{type:'wait',t:600},{t:900}])` returns `[0, 500, 100, 300]`.
  - The `macro-size` and `macro-wait` notes produce their findings.
  - Redaction cuts a wait's text.
- **Fixture `latebutton`**, built from `test/fixtures/base`: the page shows **Next** only after 3 s; clicking it sets
  `cmi.core.lesson_location` to 2.
- End to end (`slow`):
  - A version 1 macro with one click on Next at 1 s, via `run --macro`: the location is not 2 (the click came too
    early).
  - The same click preceded by `{ type: 'wait', text: 'Next' }`: the location is 2.
  - A wait for text that never appears, with `timeout: 2000`: the `warn` finding appears, and the run still finishes.
  - A version 2 macro with `viewport` 800×600 is run with no `--viewport`: the saved run's `launch.options.viewport`
    is 800×600, and the click on `good`'s Next (measured at that size) reaches it.
- Handlers (`slow`): update the existing macro checks for `macro-save`'s new return value. Check
  `macro-from-run(...).viewport` equals the run window's size.

**Acceptance.**
- Every existing cycle and macro test passes, with only the changes needed for the new return values.
- Version 1 macro files still load and play exactly as before.

### E1.2 Clicks tied to the element clicked (sonnet)

**Goal.** A click is replayed on the element that was clicked, wherever it has moved to. The coordinates are only
the fallback.

**Files.** `src/host/probe.js`, `src/cycle.js` (`macroFromTrace`), `src/options.js` (the `target` field),
`src/main.js` (the player and `live.input`), `src/redact.js`, tests and docs.

**Spec.**

- **In the probe**, define `window.__labSel(el)`, which describes an element:
  ```
  { sel, text, role, frame }
  ```
  - `sel` is a CSS selector:
    - `#id` when the id is unique in its document and doesn't look generated (no run of 5 or more digits or hex
      characters);
    - otherwise `[data-testid]`, `[aria-label]` or `[name]` when unique;
    - otherwise a `tag:nth-of-type()` path up from the nearest unique ancestor, at most 6 steps.

    Check uniqueness with `querySelectorAll(sel).length === 1`.
  - `text`: trimmed `innerText`, at most 60 characters, under the privacy rule.
  - `role`: the explicit `role` or the tag name.
  - `frame`: the path of frame indexes from the top window (`[0, 2]`), found by walking `parent.frames`. Leave it out
    when the walk hits another origin.

  Also define `window.__labHit(x, y)`. It takes 0–1 fractions across the top window, follows `elementFromPoint` down
  through same-origin iframes, and returns `__labSel` of the deepest element, or `null`. This is for E4.1.
- **Recording.** The `pointerdown` listener adds `target: __labSel(composedPath()[0])` to its `input` report, unless
  `approx` is set. `macroFromTrace` carries `target` into click events. The live-view recorder (`macro.events` in
  `main.js`) asks the target frame for `__labHit(x, y)` before sending the click, and stores the result as `target`.
- **Validation.** `check.macro` allows `target` on click events:
  - an object with `sel` (a string of at most 500 characters);
  - optional `text` (at most 60), `role` (at most 40) and `frame` (at most 8 integers from 0 to 999).
- **Replay.** For a click with a `target`:
  1. Find the frame by its path (CDP: the session whose frame matches, or `Runtime.evaluate` in the top session down
     `frames[i]`).
  2. Run `document.querySelectorAll(sel)` there. When there is exactly one match, and it is visible (its client rect
     has size, and it's in the viewport after `scrollIntoView({ block: 'center' })`), take the centre of its rect plus
     the frames' offsets, as 0–1 fractions of the window. Click there through `live.input`, so it is real input.
  3. Otherwise click at `x`, `y`, and push a probe note `{ type: 'macro-anchor', event: i, found: 0 | 2+, used:
     'position' }`. One `info` finding sums these up: "3 clicks didn't find their element and used their recorded
     position".
- **Redaction.** `target.text` is cut like typed text. `target.sel` keeps its structure, but attribute values in it
  are cut.

**Tests.**
- Unit:
  - `check.macro` accepts and refuses `target` shapes.
  - `macroFromTrace` keeps `target`.
  - Redaction of `target.text` and of attribute values in `sel`.
- **Fixture `movebutton`**, built from `base`: **Next** is positioned `right: 20px; top: 20px`, so its fraction across
  the window changes with the width. It has a unique id.
- End to end (`slow`):
  - A macro recorded at 1100×800 (clicking Next, with `target` from a real recording run) replayed with
    `--viewport 600x800`: the location is 2, and there's no `macro-anchor` note.
  - The same macro with its `target.sel` edited to `#nope`: the click falls back to the position (at 600 wide it
    misses), and the `info` finding is there.
  - The probe never records `target.text` from an `<input type=password>` or a `textarea`. Use a fixture page with
    both, click them, and check the run's probe reports.

**Acceptance.**
- `__labSel` and `__labHit` exist in every content frame (the probe), never in the host page (`ownHost`).
- Clicks in other-origin frames still record `approx` and are skipped as before.

### E1.3 Record from the desktop app (haiku)

**Goal.** Recording a macro in the desktop app is one obvious button, used in the real course window.

**Files.** `src/ui/index.html`, `src/ui/app.js`, `src/main.js` (the menu), the user guide's macro section, and
`test/ui.js`.

**Spec.**

- A **Record** button in the toolbar, next to Stop, with an `i-record` icon. It is shown only while a run is running
  and only in the desktop app (`!lab.web`; the web interface keeps Live's Record clicks). Its menu item is under Run:
  **Record Macro**, ⌥⌘R.
- Pressing it stores `st.recordFrom = Date.now() - run start` (the run's `started`, from the `state` event) and turns
  the button red, reading **Recording…** with `aria-pressed="true"`.
- When the run stops while recording, or Record is pressed again:
  1. Call `macro-from-run` on the finished run.
  2. Keep the events with `t >= st.recordFrom`, shifting their `t` back by `recordFrom`.
  3. Show a `<dialog>`: "Save 14 steps as the macro?", with **Save** and **Discard**. Save sets `st.macro`, calls
     `showMacro()` and `showOptions()`, and says "Macro saved: 14 steps. It plays at the start of each launch."
- If the run had `recordInput` off, the dialog adds one line: "Typed text wasn't kept. Turn on Keep typed text to
  include it."
- No new handler: `macro-from-run` does the work.

**Tests.**
- `test/ui.js`:
  1. Open `good`, launch, press Record.
  2. Click Next in the run window. Get it with `app.windows()`, the one whose title starts with "Run:", and use
     `win.mouse.click` at the measured position.
  3. Stop. The dialog says 1 step. Save. The macro summary says "1 event".
- Unit: none (no new pure code).

**Acceptance.**
- The button never appears in the web interface.
- Discard leaves the earlier macro unchanged.

---

## Phase 2: a Mac-style window

### E2.1 Window chrome and one toolbar (sonnet)

**Goal.** The window looks like a Mac app: a toolbar in the title bar, a few clear actions, and the system accent
colour.

**Files.** `src/main.js` (`createWindow`, `buildMenu`), `src/preload.cjs`, `src/ui/index.html`, `src/ui/style.css`,
`src/ui/app.js`, `test/ui.js`, docs.

**Spec.**

- **Window.** `titleBarStyle: 'hiddenInset'`, `trafficLightPosition: { x: 14, y: 14 }`, `vibrancy: 'sidebar'`,
  `visualEffectState: 'followWindow'`, `backgroundColor: '#00000000'`, all on macOS only. `body` keeps an opaque
  background everywhere except the sidebar, which uses a translucent `--sidebar` token.
- **Toolbar.** One `<header>` row, 52 px high, with `-webkit-app-region: drag`; every control in it has `no-drag`. It
  leaves 78 px on the left for the traffic lights (`body.mac` only, set when `!lab.web && navigator.platform` starts
  with "Mac"). It holds, in order:
  1. Open (icon `i-open`);
  2. the package name (as a title, ellipsised);
  3. the item select;
  4. **Run/Stop**, one button that toggles (icon and label change; ⌘R and ⌘.);
  5. Record (E1.3);
  6. Test Saving;
  7. a flexible spacer;
  8. the status text;
  9. Inspector (icon `i-sidebar-right`, ⌥⌘I; it toggles the right pane, which E2.2 fills);
  10. Help (icon `i-help`).

  Everything else in today's two `.bar` rows stays where it is for now, in a temporary `#legacy-bar` below the
  toolbar. E2.2 moves it. Compare, Folder check and Export stay reachable from the File menu, which already has them.
- **Accent colour.** In preload, expose `lab.accent` (the hex from `systemPreferences.getAccentColor()`, sent from main
  through `ipcMain.handle('accent')`) and a listener for the `accent-color-changed` event. `app.js` sets `--accent`
  from it. The web interface keeps the CSS default.
- **Buttons.**
  - Only Run/Stop is filled (`button.primary`); every other button is plain.
  - Toolbar buttons are 28 px high with 6 px radius, icon plus label at widths of 1100 px and above, and icon only
    below that, keeping the `aria-label`.
  - `:focus-visible` shows a 3 px accent ring.
- **Icons.** One `<svg hidden>` block of `<symbol>`s in `index.html`: open, run, stop, record, test-saving,
  sidebar-right, help, warn, error, info, ok, copy, crosshair, plus, trash, up, down. Draw them at 16×16 with
  `stroke="currentColor"`, 1.5 stroke, SF Symbols-like. Write them by hand: no icon library.
- **Menu.** Add a **Run** menu: Run (⌘R), Stop (⌘.), Record Macro (⌥⌘R), Test Saving. Add **View → Show Inspector**
  (⌥⌘I).

**Tests.**
- `test/ui.js`:
  - The toolbar has the controls by accessible name.
  - ⌘R launches and ⌘. stops.
  - The Run button's label switches between Run and Stop.
  - The `body` has class `mac` in Electron on darwin.
  - Update the E0.1 helpers to use the new Run button.
- Handlers: none new.
- Manual note for the status file: "light and dark mode screenshots attached in E3.3".

**Acceptance.**
- The web interface (`npm run serve`, loaded in Playwright's Chromium in `test/ui.js`) shows the same toolbar, with
  no gap for traffic lights and no errors in the console.
- Every earlier UI check passes.

### E2.2 The inspector: run settings on the right (sonnet)

**Goal.** Run settings move out of the toolbar into a grouped right-hand pane. A summary chip shows when anything isn't
at its default.

**Files.** `src/ui/index.html`, `src/ui/app.js`, `src/ui/style.css`, `src/options.js` (one pure function),
`test/test.js`, `test/ui.js`, docs.

**Spec.**

- **The pane.** Generalise `#docs` into `#inspector`, 340 px wide and resizable by a drag handle (stored width in
  `localStorage`, wrapped in try/catch like `store`). At the top is a segmented control: **Settings**, **Macro**,
  **Help**. Help is today's docs panel, unchanged inside. The selected segment and the open or closed state are
  remembered (`store`).
- **Settings**, in `<details open>` groups with the same controls and ids, so `launchOptions()` keeps working:
  - **LMS:** Profile, its fields (`#profile-fields`), API (`#expose`), Resume last run's data.
  - **Browser and device:** Browser, Device size (with the custom size), Storage.
  - **Recording:** Stop after, Record caught errors, Trace the code, Keep typed text.
  - **Advanced** (closed by default): Frame depth, In a new window, Launch parameters, Authoring tool, Pins, Answers,
    the options JSON, and Copy as CLI command.
- **Macro** holds today's `#macro` box until E4.2 replaces it.
- **Record reference** leaves the toolbar. It becomes **File → Record a Working Copy…**, which opens a small dialog
  holding the URL field, plus a button at the top of the Compare view when no reference exists. `#legacy-bar` and
  `details#more` are deleted.
- **Summary chip.** Add a pure `optionsSummary(o)` to `options.js`. It returns short labels for the fields that differ
  from `DEFAULTS`, in a fixed order, at most 4 plus "+N more". For example `normaliseOptions({ expose: '2004',
  profile: 'moodle', viewport: 'iphone' })` gives `['SCORM 2004', 'Moodle', 'iPhone']`. The chip sits beside Run;
  clicking it opens the inspector's Settings. It isn't shown when the list is empty.

**Tests.**
- Unit: `optionsSummary` for the defaults (`[]`), one field, every field type at least once, and the "+N more" limit.
- `test/ui.js`:
  - The inspector opens with ⌥⌘I.
  - Changing Device size to iPhone shows an "iPhone" chip.
  - A launch with it saves `launch.options.viewport` as the iPhone preset: check through `runs` or the saved file.
  - Advanced is closed by default.
  - Record a Working Copy opens its dialog.

**Acceptance.**
- `launchOptions()` produces the same object as before for the same choices. Add a handler check that saves an
  options object with every field set, and compare it with the one built before the change. The orchestrator records
  the "before" object in the work package's prompt.
- The CLI line from Copy as CLI command is unchanged.

### E2.3 Views grouped in the sidebar (sonnet)

**Goal.** Replace the 21-tab row with a grouped source list in the left sidebar, under the runs.

**Files.** `src/ui/app.js`, `src/ui/index.html`, `src/ui/style.css`, `test/ui.js`, docs.

**Spec.**

- A constant `GROUPS` in `app.js`:
  ```js
  [['Summary', ['Findings', 'Timeline']],
   ['Package', ['Boot path', 'Files', 'Package']],
   ['What happened', ['API', 'xAPI', 'Network', 'Errors', 'Console', 'Frames', 'Lookups', 'Scripts']],
   ['Deep dive', ['Execution', 'Drill-down', 'Experiments']],
   ['Tools', ['Compare', 'Package diff', 'Folder check', 'Test saving', 'Server needs', 'Live']]]
  ```
  Every name in `TABS` appears exactly once. Add a unit-style assertion of that at module load (`console.assert`) and
  in `test/ui.js`.
- The sidebar: a **Runs** section (today's list, unchanged), then the groups as `<nav>` lists of buttons with
  `aria-current="page"` on the chosen one. `HIDE` still leaves out empty views; a group whose views are all hidden is
  left out.
- `#tabs` is removed. `st.tab` and `VIEWS` are unchanged, so every view keeps working.
- The filter box moves to the top of the content area, shown only for table views (as today).
- Keyboard: ↑ and ↓ move through the visible views when the list has focus, and ⌘1 to ⌘5 jump to the first visible
  view of each group.

**Tests.**
- `test/ui.js`:
  - Every group shows after a run of `good`.
  - Clicking "Network" shows a table.
  - "Compare" is hidden until a comparison exists.
  - ⌘1 selects Findings.
  - Update `view(name)` to click the sidebar entry.

**Acceptance.**
- No view is unreachable: `test/ui.js` visits each visible one after a traced run of `good` and checks it renders
  without a console error.

### E2.4 A verdict at the top of Findings (haiku)

**Goal.** One plain sentence says how the run went before any detail.

**Files.** `src/report.js` (next to the existing `verdict`), `src/ui/app.js`, `src/ui/style.css`, `test/test.js`,
docs.

**Spec.**

- Add a pure `runVerdict(milestones, findings)` returning `{ sev: 'ok' | 'info' | 'warn' | 'error', text }`.
  - `text` names the furthest milestone reached and the first one missed, using the milestone labels. For example:
    "Launched and found the LMS, but never saved progress".
  - When every milestone was reached: "Ran through: launched, talked to the LMS and saved its progress".
  - `sev` is the worst finding's severity, or `ok` when there's none above `info`.
- The Findings view starts with a banner: the severity icon (`i-error`, `i-warn`, `i-info`, `i-ok`), the word
  ("Problem", "Warning", "Note", "Good") and the text. Its colour comes from the severity tokens.
- In finding cards, replace the uppercase severity text with the icon plus the word in normal case. Keep `.sev` for the
  word.

**Tests.**
- Unit: `runVerdict` on these cases, using existing milestone test data:
  - nothing reached;
  - launched only;
  - looked but not found;
  - initialised but never wrote;
  - all reached;
  - all reached with a `warn` finding.
- `test/ui.js`: after a run of `good`, the banner says "Ran through" with "Good".

**Acceptance.** The CLI's `report` output is unchanged; the verdict is UI only for now.

### E2.5 Drop a package on the window; short tooltips (haiku)

**Goal.** The small things a Mac user expects.

**Files.** `src/preload.cjs`, `src/main.js`, `src/ui/app.js`, `src/ui/index.html`, `src/ui/style.css`, `test/ui.js`.

**Spec.**

- **Drop.** Dropping a `.zip` anywhere on the window opens it. While dragging, an overlay reads "Drop to open".
  - Desktop: preload exposes `lab.pathFor(file)` using `webUtils.getPathForFile`, then
    `invoke('open-path', { path })` (reuse `openPath`). Validate in main that the path ends in `.zip` and is a file.
  - Web: `lab.upload(file)` as the Open button does today.
  - Any other file type shows "Only .zip packages can be opened".
- **Tooltips.** Every `title` in `index.html` and in `h(...)` calls in `app.js` becomes one line of at most about 80
  characters. Move the long explanations into the guide pages, under the matching setting. Add the help links in E3.2.

**Tests.**
- `test/ui.js`: dispatch a drop of `good.zip` on the window (Playwright `dispatchEvent` with a `DataTransfer`), and the
  package opens.
- A unit-style check in `test/ui.js` that no `title` attribute in the rendered page is longer than 100 characters.

**Acceptance.** Dropping a `.txt` file shows the message and changes nothing.

---

## Phase 3: documentation built around the app

### E3.1 Split the user guide; docs link check (haiku, Sonnet accuracy review)

**Goal.** Short, task-shaped pages that lead with the app. The command line sits in its own reference.

**Files.** New `docs/guide/*.md`. `docs/user-guide.md` (becomes an index), `docs/README.md`, `src/docs.js`,
`src/ui/app.js` (the `openDoc` targets in `RECIPES` and elsewhere), `test/test.js`.

**Spec.**

- **Pages**, each under about 150 lines, written for the window as it is after Phase 2:

  | Page | Covers |
  |---|---|
  | `guide/getting-started.md` | Install, open a package, run it, read the verdict: one page, five minutes |
  | `guide/reading-a-run.md` | The sidebar groups, milestones, the timeline, where to look for what |
  | `guide/run-settings.md` | The inspector, group by group: each setting, when to change it, what it costs |
  | `guide/views.md` | Every view, one short section each, in sidebar order |
  | `guide/macros.md` | Recording, waits, the window size, elements versus positions, Test saving |
  | `guide/changing-and-exporting.md` | Files, pins, answers, export |
  | `guide/experiments-and-servers.md` | Experiments, Server needs, Drill-down |
  | `guide/other-formats.md` | cmi5 and xAPI |

- **Command line.** Command-line material leaves these pages. Each page may end with one short "On the command line"
  paragraph linking to the matching `cli.md` section. `cli.md` gains whatever it lacked from the user guide.
- **The old guide.** `user-guide.md` keeps its title and becomes a one-screen index of the pages. Its old headings
  stay as a list of links ("Storage blocked in the content's frames → Run settings: Storage"), so old anchors land
  somewhere useful.
- **The docs panel list.** `src/docs.js` gains a `group` field (Guide, Recipes and findings, Reference, Authoring
  tools), and lists the new pages in reading order. Recipes and Findings stay where they are.
- **Link check.** Add to the unit tests: for every Markdown file in `DOCS`, every relative link must point to a file
  that exists, and every `#anchor` must match a heading in its target. Generate anchors with the slug function from
  `markdown.js`: export it.

**Review.** A Sonnet subagent checks every statement in `docs/guide/` against the code: control names, defaults and
limits. It lists mismatches as `file:line`. The builder fixes them.

**Tests.** The link check. `test/ui.js`: the Help segment's document list shows the groups, and "Getting started"
opens.

**Acceptance.**
- No page in `docs/guide/` is over 170 lines.
- The link check passes.
- `grep -c "package-lab " docs/guide/*.md` is at most 2 per page (the "On the command line" paragraph).

### E3.2 Docs search, contents and context help (sonnet)

**Goal.** Help is found from where the question arises, and the docs can be searched.

**Files.** `src/ui/app.js`, `src/ui/markdown.js`, `src/ui/index.html`, `src/ui/style.css`, `src/docs.js`,
`test/test.js`, `test/ui.js`.

**Spec.**

- **Contents.** Add a pure `headings(md)` in `markdown.js`, returning `[{ level, text, id }]` with the same slugs the
  renderer uses. The Help segment shows a collapsible "On this page" list of level 2 and 3 headings above the
  document.
- **Search.**
  - A search field at the top of Help. On input (debounced 150 ms), it loads every document's text once, through the
    existing `doc` handler, cached in `docs.text`.
  - It finds matches case-insensitively and shows up to 20 results: the document title, the nearest heading above the
    match, and about 80 characters around it with the match in `<mark>`. Clicking a result opens that heading.
  - Make this a pure function `searchDocs(texts, query)` in `markdown.js`.
- **Context help.**
  - Each inspector group heading, each sidebar group heading and the Findings verdict banner get a small ⓘ button,
    `aria-label="Help: Storage"`.
  - The target comes from a `data-help="guide/run-settings.md#storage"` attribute. One delegated listener opens it in
    the Help segment (opening the inspector if it is closed).
  - The link check (E3.1) also checks every `data-help` value in `index.html`, and those `app.js` generates. Collect
    them with a regular expression over both files.

**Tests.**
- Unit:
  - `headings` on a small document with duplicate headings (the slugs must match the renderer's ids);
  - `searchDocs`: a match, no match, a match inside a code block, and the 20-result cap.
- `test/ui.js`:
  - Searching "partitioned" finds Run settings.
  - The Storage ⓘ opens Run settings at Storage.

**Acceptance.** Every `data-help` target resolves.

### E3.3 Screenshots by script; images in the docs panel (haiku)

**Goal.** The guide pages show the app, and the pictures can be remade in one command when the UI changes.

**Files.** New `scripts/screenshots.js`, `package.json` (a `screenshots` script), `src/ui/markdown.js` (images),
`src/main.js` (the `doc` handler inlines images), `docs/guide/*.md`, `docs/images/`.

**Spec.**

- **The script.** `scripts/screenshots.js` uses the E0.1 helpers (import them from `test/ui.js`; export them there).
  1. Open `good` in a 1280×800 window, light mode, then dark mode (`nativeTheme.themeSource` through an env flag,
     `PACKAGE_LAB_THEME`, read in `main.js` for this purpose only).
  2. Save PNGs to `docs/images/`: start screen, the toolbar with a package open, a run's Findings with the verdict,
     the inspector's Settings, the Macro segment, the Help segment, and the Live view with coordinates (once E4.1
     exists; skip it if not).
  3. Name the files `<view>-<light|dark>.png`.
- **Images in the panel.** `markdown.js` draws `![alt](images/x.png)` as `<img alt>`. The `doc` handler replaces
  image paths inside `docs/` with `data:` URIs: PNG only, at most 400 KB each, otherwise the alt text. This keeps the
  CSP (`img-src 'self' data:`) unchanged.
- The guide pages use the light images. GitHub shows the same files.

**Tests.**
- Unit: `markdown.js` draws an image with escaped alt text, and a `javascript:` URL isn't used as the `src`.
- The `doc` handler test: an image over 400 KB comes back as its alt text.
- `npm run screenshots` succeeds and writes the files. Run it in the work package; don't add it to the suite.

**Acceptance.**
- The images are under 2 MB in total.
- The link check covers image paths.

---

## Phase 4: coordinates and the macro editor

### E4.1 The live view in the desktop app, with coordinates (sonnet)

**Goal.** See the course inside Package Lab, with the cursor's position and the element under it, and copy them.

**Files.** `src/main.js` (`live`, handlers), `src/preload.cjs`, `src/ui/app.js` (`livePanel`, `liveWatch`),
`src/ui/style.css`, `test/ui.js`, `test/test.js`, docs.

**Spec.**

- **Frames over IPC.** `liveWatch(on)` in the desktop app calls `invoke('live-watch', { on })`. In main, that changes
  `live.watchers` by one and restarts `live`. Frames go to the UI window with `ui.webContents.send('live', frame)`
  alongside `web?.broadcastLive`. Preload passes the `live` channel through `lab.on`.
- **Showing it.** Live is listed in the Tools group in the desktop app too (remove the `lab.web` condition in `TABS`).
  While a run is running, the toolbar's status gains a "Show in Package Lab" link that selects it.
- **Coordinates bar**, under the picture:
  ```
  x 412  y 233 px · 37.5% 29.1% · button#next “Next”      [Crosshair] [Copy]
  ```
  - Pixels are `fraction × frame.w` (and `frame.h`), the run window's size from the frame message.
  - **The element:** on `mousemove` over the picture, throttled to one call every 150 ms, call
    `invoke('live-hit', { x, y })`. Main runs `__labHit(x, y)` (E1.2) by `Runtime.evaluate` in the run's top session
    and returns the result, or `null`. Show `role#id` or the selector, at most 40 characters, plus the text.
  - **Crosshair** toggles CSS guide lines through the cursor.
  - **Copy** (and ⌘C while the picture has focus) copies `x=412 y=233 (37.5%, 29.1%)`, plus the selector on a second
    line when known, with `navigator.clipboard.writeText`. Then it says "Copied".
- **Clicking the picture** still sends clicks (as today), so recording through the live view works in the desktop app
  as well. The live view's Record clicks button stays.

**Tests.**
- Handlers (`slow`):
  - `live-hit` during a run of `good` at Next's measured position returns a target whose `text` is "Next".
  - Outside the content (0.99, 0.99) it returns `null` or a body element, never an error.
  - `live-watch` on then off leaves `live.watchers` at 0: expose it read-only through the existing `state` event, or
    check that frames stop.
- `test/ui.js`:
  - Launch `good` and select Live: a frame appears within 3 s.
  - Hovering over the picture fills the coordinates bar.
  - Copy puts text matching `/^x=\d+ y=\d+/` on the clipboard (`electronApp.evaluate(({ clipboard }) =>
    clipboard.readText())`).

**Acceptance.**
- The web interface's Live view behaves as before, plus the coordinates bar.
- No frames are captured when nobody watches (check `capturePage` isn't called).

### E4.2 The macro editor (sonnet)

**Goal.** See every step of a macro, change it, add waits, try parts of it against the running course, and keep named
macros per package.

**Files.** `src/ui/app.js`, `src/ui/style.css`, `src/main.js` (handlers, the player's `from` and `to`), the new pure
module `src/macros.js`, `test/test.js`, `test/ui.js`, docs.

**Spec.**

- **The Macro segment** (replacing `#macro`): a table of steps.

  | Column | Shows |
  |---|---|
  | # | The step number |
  | When | `+0.8 s` (the time since the previous step) for timed events; "wait for “Next” (30 s)" for waits |
  | Action | Click, Key Enter, Type “…”, Scroll |
  | Where | `412, 233` (pixels at the macro's size) and the element (`button#next “Next”`) when it has a target |
  | | Up, Down, Delete |

  - Selecting a row shows an edit form below the table for that step's fields. Changes are validated through
    `normaliseOptions({ macro })`, and the error is shown beside the field.
  - Under the table: **Add wait**, with a menu offering for text, for a milestone, for the network to go quiet, or for
    a time. It inserts after the selected row.
  - Also under the table: **Play step**, **Play from here** and **Play to here** (enabled only while a run is running),
    and the size ("Recorded at 1100×800").
- **Timing edits keep the rest in place.** Changing a step's delay shifts every later `t` by the difference. Do it as
  a pure function `setDelay(events, i, ms)` in `src/macros.js`, with `move(events, i, dir)`,
  `remove(events, i)` and `insertWait(events, i, wait)`, all keeping `t` non-decreasing.
- **Playing parts.** Add the handler `macro-play`, taking `{ events, from, to }`. It runs `playMacro(active, events,
  from, to)` (E1.1), refuses when no run is running ("Launch first"), and plays one at a time ("A macro is already
  playing").
- **Named macros.**
  - Saved in `<data folder>/macros/<package id>/<name>.json` as version 2 files. The package id is what saved runs
    already use to group by package; find it, don't invent one.
  - Handlers: `macro-list` (names, sizes and step counts), `macro-load`, `macro-store` and `macro-delete`.
  - A name is 1 to 60 characters matching `/^[\w .-]+$/`, not starting with a dot. Resolve the path and confirm it
    stays inside the macros folder.
  - The segment has a select of saved macros, plus **Save As…**, **Import…** and **Export…**. In the desktop app these
    use the save and open dialogs; in the web interface, a download and a file input. Import goes through
    `readMacro`.

**Tests.**
- Unit (`src/macros.js`):
  - `setDelay` shifts later steps.
  - `move` keeps `t` non-decreasing by swapping delays, not times.
  - `remove` of the first step.
  - `insertWait` at the end.
  - A round-trip through `normaliseOptions`.
- Handlers:
  - `macro-store`, then `macro-list`, then `macro-load`, then `macro-delete` round-trip.
  - The names `../x`, `.hidden`, `a/b`, a 61-character name and an empty name are each refused.
  - (`slow`) `macro-play` from step 2 of a two-step macro on a running `good` plays only Save and exit: the run's API
    log shows the exit write and no second location change.
  - `macro-play` with no run is refused.
- `test/ui.js`:
  - Record one click (E1.3), open the Macro segment, add a wait for "Next" before it, Save As "next", and reload the
    app: "next" is listed and loads with 2 steps.

**Acceptance.**
- An edited macro saved and loaded again is byte-identical to `macroFile(events, viewport)` of the edited list.
- Every refusal message names what to fix.

---

## Phase 5: interfaces in step, final check

### E5.1 CLI, web, Alfred and Concierge in step (sonnet)

**Goal.** Everything Phases 1 and 4 added can be reached outside the desktop app as well.

**Spec.**

- CLI:
  - `--macro` reads version 2 (E1.1 did this) and prints the size it applies.
  - `package-lab macro show <file>` prints the steps as the editor's table, with `--json` for JSON.
  - Completion (`src/completion.js`) gains `macro show`.
- Web: the editor's Import and Export work (E4.2), and so does the live view's coordinates bar (E4.1). Check them in
  `test/ui.js` against `serve`.
- Alfred: no change, unless an existing action passes a macro; then accept version 2.
- Concierge (`~/github/concierge/modules/package-lab`, on branch `package-lab-evolve`, staging only the files touched,
  never `git add -A`):
  - its macro field accepts version 2 files;
  - its version gets a minor bump.

**Tests.**
- `macro show` on a version 1 file and on a version 2 file with a wait and a target.
- The completion test lists `macro`.

### E5.2 Documentation pass (haiku, Sonnet accuracy review)

**Spec.**

- Bring `docs/guide/`, `cli.md`, `web.md`, `findings.md` (the new macro findings: size, wait, anchor), `alfred.md`,
  `concierge.md`, `developer-guide.md` (inspector, groups, `__labSel`, `__labHit`, the player, the macros folder,
  `test/ui.js`) and `DESIGN.md`'s Interfaces section up to date.
- Rerun `npm run screenshots`.
- The Sonnet review checks statements against the code, as in E3.1.

**Acceptance.** The link check passes, and the review's mismatches are fixed.

### E5.3 Final check and release build (sonnet)

**Spec.**

- Run `npm test -- --slow`, then `npm run package`.
- Open the packaged app on `good`:
  - record a macro with a wait;
  - run Test saving;
  - check the verdict says it saved and resumed.
- Bump the version to 0.3.0.
- Write the final summary in `evolution-status.md`, including a list of **what was only checked by script and wants a
  look by eye**: vibrancy in both modes, the traffic-light spacing, and the icon drawings.

---

## Not planned

- **Showing the course inside the main window** (`WebContentsView`) instead of a separate window. The live view
  (E4.1) covers coordinates and recording. Add it if the screenshot rate (about 2.5 frames a second) proves too slow
  for real use.
- **Element anchors in other-origin frames.** The probe can't reach across, so those clicks stay `approx` and are
  skipped, as now.
- **Macros in WebKit runs.** There is no input path to replay through.
- **Thumbnails per macro step.** The element label and Copy cover identifying a step. Add them if steps without a
  target prove hard to tell apart.
- **Drag to reorder steps.** Up and Down buttons cover it and work from the keyboard.

## Prompt templates

**Builder.** Fill in the brackets. Keep it self-contained: subagents don't see the orchestrator's conversation.

```
You are implementing work package [ID] "[title]" of Package Lab, a local Electron app that diagnoses SCORM, cmi5 and
xAPI packages (repo: ~/github/package-lab, branch `evolve`, already checked out; work in this checkout, not a
worktree).

Read first: docs/evolution-plan.md (section [ID], "Rules for every work package" and "Where things stand"),
docs/plan.md "Rules for every work package", docs/developer-guide.md, and every file the work package names. Read the
code each change touches end to end before editing; reuse the helpers already there.

Do:
- Implement the spec in section [ID] exactly. Where it leaves a choice, pick the simplest option that meets the
  acceptance criteria and add a line to docs/decisions.md.
- Add the tests the section names, at the layer it names (unit, handlers, test/ui.js). Every new pure function gets
  a unit assertion.
- Update the docs the section names.
- Run `node test/test.js --unit` while working. At the end run `npm test`, and `npm test -- --slow` if you touched
  src/main.js, src/host/, src/recorder.js or test/ui.js. All must pass.
[Only for E2.2: the launch options object before the change, for the equality check: <paste>]

Don't:
- Commit, push, or change files the work package doesn't need.
- Open any package outside test/. Never put package content or personal details in a web search.
- Add a runtime dependency, a UI framework or an icon library.
- Ask questions: decide, and log the decision.

Report back: files changed; tests added (by layer); the last lines of each test run; decisions logged; anything not
done, with the reason.
```

**Reviewer.**

```
Review the uncommitted diff in ~/github/package-lab (git diff, and new files from git status) for work package [ID]
in docs/evolution-plan.md. Check it against:
- the section's spec and acceptance criteria;
- "Rules for every work package" in both plan files;
- behaviour preservation (the web interface, saved runs, version 1 macros, the CLI line);
- security: HTML escaping, paths confined (macro names, dropped files, doc images), nothing leaving the machine;
- macro privacy: typed text, target text, redaction;
- accessibility: labels, keyboard, focus.
One line per problem: file:line, severity, what's wrong, the fix. Say "no problems" if there are none. Don't edit
files.
[For E3.1 and E5.2: also check every statement in the changed docs against the code (control names, defaults, limits,
flags) and list each mismatch.]
```
