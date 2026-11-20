# Package Lab: build plan for the next stage

This is a work plan to be carried out from start to finish by an orchestrating Claude session that sends work to
subagents, without asking the owner anything once it has begun. It covers every addition agreed on 2026-11-13:

- changing a package's files and rerunning it;
- overriding variables and server responses;
- working out what the content wanted from its server;
- automatic drill-down into the code's decisions;
- explaining why the content stalled;
- LMS profiles;
- blocking storage and cookies;
- other browsers and device sizes;
- an automatic save-and-resume cycle;
- exporting a corrected package;
- checks for specific authoring tools;
- comparing two packages;
- code views, a timeline, batch checks, redacted reports and cmi5/xAPI support.

Progress is recorded in [plan-status.md](plan-status.md). Decisions made along the way go in
[decisions.md](decisions.md).

- [How to run this plan](#how-to-run-this-plan)
- [Rules for every work package](#rules-for-every-work-package)
- [Models](#models)
- [Order and dependencies](#order-and-dependencies)
- [Phase 0: foundations](#phase-0-foundations)
- [Phase 1: replacing hand work](#phase-1-replacing-hand-work)
- [Phase 2: what a local run can't see yet](#phase-2-what-a-local-run-cant-see-yet)
- [Phase 3: from diagnosis to fix](#phase-3-from-diagnosis-to-fix)
- [Phase 4: everyday use](#phase-4-everyday-use)
- [Phase 5: interfaces, documentation and release](#phase-5-interfaces-documentation-and-release)
- [Prompt template for subagents](#prompt-template-for-subagents)

## How to run this plan

The orchestrator (an Opus session in `~/github/package-lab`) works as follows:

1. **Set up once.** Read this file, `docs/developer-guide.md`, `DESIGN.md` and `plan-status.md`. Create the branch:
   ```bash
   git switch -c next
   ```
   If `next` already exists, switch to it and carry on from the first work package in `plan-status.md` that isn't
   `done` or `skipped`.
2. **Take work packages in the order given in [Order and dependencies](#order-and-dependencies).** For each one:
   1. Send it to a subagent with the [prompt template](#prompt-template-for-subagents), using the work package's
      model. Wait for the result.
   2. Review the diff. For an Opus work package, the orchestrator reviews it itself. For other work packages, a
      Sonnet subagent reviews the diff against the acceptance criteria (agent type `caveman:cavecrew-reviewer`,
      model `sonnet`). Send problems back to the same subagent with `SendMessage`, at most twice.
   3. Run the full test suite: `npm test`. It must pass, and so must every acceptance criterion.
   4. Commit on `next` (see [commits](#commits)). Update `plan-status.md` (state, commit hash, notes) in the same
      commit.
3. **When a work package can't be finished.** It has failed acceptance three times, or it needs something the
   machine can't provide. Revert its uncommitted changes (`git restore --staged --worktree .` and remove new files),
   mark it `skipped` in `plan-status.md` with the reason, and skip every work package that depends on it. Then carry
   on with the next independent one. Never stop the whole plan for one work package.
4. **At the end of each phase:** run `npm test`, then merge into `main`:
   ```bash
   git switch main
   git merge --ff-only next
   git switch next
   ```
   Then write a short phase summary at the top of `plan-status.md`.
5. **At the end of the plan:** do Phase 5, then write the final summary in `plan-status.md`: what was built, what was
   skipped and why, and what to try first.
6. **Never push:** the repo has no remote. Never ask the owner a question; decide with the
   [defaults](#decisions-without-the-owner) and log the decision.

**Where agents work.** Work sequentially, in this one checkout, on `next`. Don't use worktree isolation: worktree
agents branch from `origin/main`, and there is no origin. The only parallel work allowed is read-only research
subagents (marked **research** below) and documentation-only work packages, run alongside an implementation work
package that doesn't touch `docs/`.

**Concierge.** Work packages that change the Concierge module (`~/github/concierge/modules/package-lab/run`) work on a
branch `package-lab-next` in that repo, created the first time it's needed. They commit there, and merge
`--ff-only` into its `main` at the end of the plan. `~/github/concierge` has other work in progress at times: stage
only the files the work package touched (`git add <paths>`), never `git add -A`, and never commit anything else.

### Decisions without the owner

When the plan leaves something open, choose in this order:

1. **Whatever the plan says.**
2. **The existing pattern in the code** (see the developer guide).
3. **The simplest version that meets the acceptance criteria.** Note the larger version as a `ponytail:` comment
   with its ceiling.
4. **When two options are equally simple, the one that keeps all data on the machine and adds no dependency.**

Record every such choice as a line in `docs/decisions.md`: date, work package, the choice and why.

### Commits

These are the owner's rules, and they override any default:

- **No attribution trailers.** Never add `Co-Authored-By` or any other AI attribution line. Commit as the user.
- **Message format.** A subject line under about 72 characters, in the imperative ("Add …", "Let …"), then a blank
  line, then a short body.
- **Check before going on.** Run `git log -1 --format=%B` and confirm the second line is blank.
- **Granularity.** One commit per work package. A work package marked large may commit at its numbered steps.

## Rules for every work package

- **Privacy.** Never send package content anywhere, and never open packages outside `test/`.
  - Subagents may search the web only for public documentation (for example LMS or authoring-tool docs). They must
    never put package code, file names from a real package, or the owner's details into a query.
  - Use fixtures you build in `test/` from scratch or from `test/fixtures/base`. Never use a real course.
- **No new runtime dependencies,** except those named in a work package:
  - `acorn`, vendored in P1.4;
  - `js-beautify`, vendored in P4.1;
  - `playwright`, as an optional devDependency in P2.3.

  Vendored files go in `src/vendor/` with their licence file and a line in `docs/developer-guide.md`.
- **Pure where possible.** Analysis and findings stay pure functions over a trace, analysis or boot graph, in their
  own modules, testable without Electron.
- **Every work package adds:**
  - unit tests for its pure parts;
  - a fixture package that shows the behaviour, with an end-to-end assertion in `test/test.js`;
  - every new finding in `docs/findings.md`;
  - the user-facing changes in the relevant guide (`user-guide.md`, `cli.md`, `web.md`, `concierge.md`);
  - the internals in `developer-guide.md` (data formats included).
- **Saved runs stay readable.** Add fields; never rename or remove them. Bump `version` in the saved-run format only
  if a reader would break otherwise, and keep reading version 1.
- **Interfaces in step.** A launch option added in one place exists in all four:
  - desktop and web UI;
  - `handlers.launch`;
  - the CLI's flags and job file;
  - the saved run's `launch`.

  The Concierge module gets it in Phase 5 unless the work package says otherwise.
- **Writing style for user-facing text and docs.** Plain words, short sentences. Say what happened, then why it
  matters, then what to do. Follow `docs/findings.md`'s existing tone. Prefer "the content" and "the LMS" to jargon.
- **Tests.** `node test/test.js --unit` while working; `npm test` before handing back. The full suite must stay under
  three minutes. If it would exceed that, put the new end-to-end checks behind `--slow` and run them at phase ends.

## Models

Subagents use the `model` parameter of the Agent tool:

| Model | For | Why |
|---|---|---|
| **opus** | Work that needs new design: the code instrumenter (P1.4), working out what the content wanted from its server (P1.3), the drill-down analysis (P1.5), serving content from another origin (part of P2.1), and the orchestrator's reviews of these | Hard reasoning about browser and JavaScript semantics; mistakes there are costly |
| **sonnet** | Most features: clear specs that need judgement in Electron, the Chrome DevTools Protocol, the UI and tests. Also every review of a non-Opus work package | Strong at well-specified implementation |
| **haiku** | Well-defined, low-risk work: the timeline view, batch checks, redaction, documentation passes, fixture building, catalogue entries, Alfred updates | Cheap and quick when the spec leaves little to decide |

If a Haiku work package fails review twice, retry it once with Sonnet. If a Sonnet one does, retry it once with Opus.
Record any escalation in `plan-status.md`.

## Order and dependencies

| # | Work package | Model | Needs | Size |
|---|---|---|---|---|
| P0.1 | Launch options model | sonnet | — | M |
| P0.2 | Milestones and progress | sonnet | — | M |
| P0.3 | Experiment runner | sonnet | P0.1, P0.2 | M |
| P1.1 | Change files and rerun (overlays) | sonnet | P0.1 | L |
| P1.2 | Pin variables, answer requests | sonnet | P0.1 | L |
| P1.3 | What the content wanted from its server | opus | P1.2, P0.3 | L |
| P1.4 | Code instrumentation: the ordered execution trace | opus | P0.1 | XL |
| P1.5 | Drill-down: condition values and where undefined came from | opus | P1.4, P1.2 | L |
| P1.6 | Why it stalled: timers, messages, polling | sonnet | P1.4 | M |
| P2.1 | LMS profiles, including content on another origin | sonnet (origin part: opus) | P0.1, P0.3 | L |
| P2.2 | Blocked storage and cookies | sonnet | P2.1 | S |
| P2.3 | Other browsers (WebKit) and device sizes | sonnet | P0.1 | L |
| P2.4 | Automatic save-and-resume cycle | sonnet | P0.2, P0.3 | M |
| P3.1 | Corrected package export | sonnet | P1.1 | M |
| P3.2 | Authoring tool checks (rule packs) | sonnet + research | P0.2 | L |
| P3.3 | Comparing two packages | sonnet | — | M |
| P4.1 | Code views (format, source maps, coverage and trace overlays) | sonnet | P1.4 | L |
| P4.2 | Timeline | haiku | P0.2 | S |
| P4.3 | Batch checks | haiku | P0.3 | S |
| P4.4 | Redacted report | haiku | — | S |
| P4.5 | cmi5 and xAPI | sonnet | P0.2 | XL |
| P5.1 | Concierge module catch-up | sonnet | Phases 1–4 | M |
| P5.2 | Alfred and CLI polish | haiku | Phases 1–4 | S |
| P5.3 | Documentation pass | haiku, then sonnet review | everything | M |
| P5.4 | Final check and release build | sonnet | everything | S |

Sizes: S is up to about 300 lines with tests and docs; M up to about 800; L up to about 1,500; XL more than that,
committed in steps.

Run them in table order. The only allowed reordering is to skip ahead past something skipped.

---

## Phase 0: foundations

### P0.1 Launch options model (sonnet)

**Goal.** One structure for everything that changes how a run is set up, passed the same way from every interface
and saved with the run, so later work packages only add fields.

**Files.** New `src/options.js`; `src/main.js`, `bin/package-lab.js`, `src/ui/app.js`, `src/ui/index.html`, tests and
docs.

**Spec.**

- `normaliseOptions(o)` returns:
  ```
  { expose, depth, opener, resume, caught, auto, wait,
    profile: 'none', browser: 'chromium', viewport: null,
    files: {}, pins: [], responses: [], storage: 'normal', trace: false }
  ```
  It validates every field. Unknown fields throw with a clear message. It is the only place defaults live.
- `launchItem` takes options through `normaliseOptions`. `launch` in the saved run gains `options` (the normalised
  object). Keep the existing top-level fields for readers of version 1.
- The CLI parses flags into the same object, puts it in the job file as `options`, and gets `--options <file.json>`
  for anything a flag can't express (later work packages add flags too).
- UI: a collapsible **More options** area under the toolbar, with a JSON view of the current options (read-only for
  now) and **Copy as CLI command**, which prints the equivalent `package-lab run …` line.

**Acceptance.**
- `normaliseOptions` has unit tests for defaults, every field's validation, and unknown-field errors.
- Every existing test passes unchanged.
- A run made with `--options` saves the same `launch.options` as the same run made with flags.

### P0.2 Milestones and progress (sonnet)

**Goal.** Place every run on the SCORM path and say how far it got, so runs can be compared by progress (see
`DESIGN.md`).

**Files.** New `src/milestones.js`; `src/rules.js`, `src/report.js`, the UI, the CLI, tests and docs.

**Spec.**

- `milestones(trace, boot)` returns an ordered list of steps, each `{ id, label, reached, t, evidence }`:
  1. `launched`: the launch page responded 200.
  2. `scripts`: every tag script in the boot path was requested and none failed.
  3. `shown`: some content frame showed text of 20 characters or more, or media.
  4. `looked`: an API lookup happened.
  5. `found`: a lookup found an API.
  6. `initialised`: `LMSInitialize` or `Initialize` returned true.
  7. `read`: `GetValue` on entry, location or suspend data.
  8. `wrote`: `SetValue` on location, suspend data, status, score or completion.
  9. `committed`: a commit returned true.
  10. `finished`: `LMSFinish` or `Terminate` returned true.

  `furthest` is the last step reached in order; `firstMissing` is the first step not reached.
- `progress(a, b)` compares two milestone lists and the counts (API calls, requests, failed requests, uncaught
  errors, visible text). It returns `{ better: -1 | 0 | 1, steps: [...], counts: {...}, summary: 'got further: reached
  initialised (was looked)' }`.
- A finding at the top of every package run, with severity `info`, plus the first missing step:
  "Got as far as: *label*. Didn't reach: *label*."
- **Milestones** strip at the top of the Findings tab (ticks and crosses), in the report, and in `run --json`
  (`milestones`, `furthest`), plus one line in the CLI text output.

**Acceptance.**
- Unit tests over hand-made traces for each step.
- The `good` fixture reaches `wrote`; with the live click and stop it reaches at least `wrote`.
- `mismatch` reaches `looked`; `blank` reaches `launched` only.
- `progress` is tested for better, worse and equal.

### P0.3 Experiment runner (sonnet)

**Goal.** Run several variants of one launch headless, one after another, and get a table of how far each got. P1.3,
P2.1, P2.4 and P4.3 build on it.

**Files.** New `src/experiments.js` (pure planning and summarising) and a CLI command `experiment`; the desktop UI
and web get an **Experiments** tab; tests and docs.

**Spec.**

- An experiment is `{ base: options, variants: [{ name, patch: partial options }] }`. `planVariants` merges each patch
  over the base with `normaliseOptions`.
- CLI:
  ```bash
  package-lab experiment <zip> [--item n] [--wait s] [--variants file.json | --preset <name>] [--json] [--out dir]
  ```
  It runs the variants sequentially with the existing headless path, saves each run in `--out` if given, and prints a
  table: variant, furthest milestone, API calls, errors, verdict, and progress against the base.
- Built-in presets:
  - `api`: manifest, both, 1.2, 2004, none.
  - `frames`: depth 0–3, plus a new window.
  - `standard`: the union of `api` and `frames`, deduplicated.

  P2.1 adds `lms`; P2.2 adds `storage`; P2.3 adds `browsers`.
- UI: the **Experiments** tab with a preset picker, **Run all**, a live table that fills as each run finishes, and a
  click to open any run. In the web interface it is the same, through new handlers `experiment-start` and
  `experiment-stop`, with progress events `experiment`.
- Findings from an experiment (pure `experimentFindings(results)`):
  - "*Variant* gets further than the default: reached *X*". Severity `warn`; the evidence is the settings difference.
    This turns a hypothesis into a fact.
  - "Nothing tried made a difference". Severity `info`.

**Acceptance.**
- `mismatch` with the `api` preset reports that `both` and `1.2` get further.
- Unit tests for planning and findings.
- `--json` output is documented in `cli.md`.

---

## Phase 1: replacing hand work

### P1.1 Change files and rerun: overlays (sonnet)

**Goal.** Edit any file of the package in Package Lab and run the edited version straight away, with the original kept,
then see whether it got further.

**Files.** `src/main.js` (serve and package state), `src/ui/` (a file browser and editor), `src/options.js` (`files`),
`bin/package-lab.js` (`--override <path>=<local file>`), tests and docs.

**Spec.**

- `options.files` is `{ path: { content (utf8 text) | base64 } }`. `serve()` looks there before the ZIP. The boot
  graph is recomputed for the overlaid file set, with a combined files Map.
- **Files** tab:
  - a tree of the package, with a filter;
  - click a text file to view it in a textarea editor with line numbers and a monospace font;
  - **Save as override** (kept in the session's package state, not on disk);
  - **Revert**;
  - a list of current overrides, with a diff view (a simple line diff; use the Myers diff from P3.3 if that exists,
    otherwise write a small LCS diff in `src/textdiff.js` that P3.3 then reuses).
- **Launch with overrides** uses the session's overrides. Findings and the report list the overrides at the top
  ("This run used 2 changed files: …").
- After a run with overrides, if there is an earlier run of the same item without them, a `progress` comparison
  finding (P0.2) says whether the change helped.
- Saved runs keep the overrides' content, so the run is reproducible. The CLI can rerun from a saved run's options:
  `--options-from run.json`.
- Binary files can be replaced from a local file (desktop: file picker; web: upload) but not edited.

**Acceptance.**
- A fixture whose `lesson.js` calls `scorm.start()` only if `window.startOK` is set gets no API calls. With an override
  of `lesson.js` that removes the condition, it does, and the progress finding says it got further.
- The CLI `--override` gives the same result.
- The overrides round-trip through a saved run.

### P1.2 Pin variables, answer requests (sonnet)

**Goal.** Force values the content reads, and answer requests with responses you supply, before the content's own
code runs.

**Files.** `src/host/probe.js`, `src/recorder.js` (Fetch domain), `src/options.js`, the UI, the CLI, tests and docs.

**Spec.**

- **Pins.** `options.pins` is `[{ path: 'previewMode' | 'config.mode' | 'navigator.userAgent', value (JSON),
  frames: 'content' | 'all' }]`. The recorder passes them to the probe through `Page.addScriptToEvaluateOnNewDocument`
  (a small JSON prefix ahead of `probe.js`).
  - **Top-level names:** `Object.defineProperty(window, name, { get: () => value, set: v => report({ type: 'pin-write',
    path, value: preview(v), stack }) , configurable: false })`. This must happen before the content's scripts, so
    that `var x = …` at the top of a classic script, which assigns through the global object, is ignored and logged.
    Note: a `let` or `const` at the top level of a script creates a lexical binding that a window property can't
    override. Detect this (the content's assignment never triggers the setter, and the script declares the name
    with let/const, which the boot graph's `globals()` can tell) and report a finding: "Couldn't pin *name*: the
    script declares it with let/const. Use a file override instead."
  - **Dotted paths:** an accessor on the root that, when assigned an object, defines the next segment on that object
    in the same way. If the object is frozen, report it.
  - **`navigator.*` and `location.search`:** use `Emulation.setUserAgentOverride` for the user agent. For extra query
    parameters, use a new option `launchParams: 'a=1&b=2'`, appended to the launch URL; don't pin `location`.
  - Each read of a pinned value is reported (throttled like lookups), so the run shows that the pin was used.
- **Responses.** `options.responses` is `[{ match: 'glob or /regex/', method?, status: 200, headers: {}, body: string,
  bodyFile?: path }]`. The recorder enables `Fetch.enable` with `patterns` (requestStage Request) on every session
  and fulfils matching requests (`Fetch.fulfillRequest`). Others continue. Answered requests are marked
  `answered: true` in the trace.
- **UI:**
  - **Network** tab: on any failed or server request, **Answer this request…** opens a small form (status, content
    type, body), prefilled with `{}` for JSON-looking paths.
  - **Lookups** tab and a new **Pins** section in More options: add, edit and remove pins.
  - In both, **Run with these**.
- **CLI:** `--pin name=json` (repeatable) and `--answer 'glob=@file.json'` or `--answer 'glob=status:body'`.
- **Findings:**
  - "The content tried to change a pinned value", with the stack. This shows where it sets its mode.
  - "Pinned value never read". Severity `info`.
  - "Answered *N* requests with your responses". Severity `info`, with the list.

**Acceptance.**
- With the `hosted` fixture:
  - answering `/api/player/config` with `{}` makes `startCourse` run without the fallback, so there is no own-API
    finding and there are calls to Package Lab's LMS;
  - pinning `previewMode=false` produces a "tried to change a pinned value" finding pointing at `boot.js`.
- A `let` fixture produces the can't-pin finding.

### P1.3 What the content wanted from its server (opus)

**Goal.** For every request outside the package (server-root or another site), work out what the content did with
the response, and build a stand-in response by experiment until the content stops asking for more. This is the
direct answer to "it works on its platform but not in an LMS".

**Files.** New `src/shape.js` (pure), `src/host/probe.js`, `src/main.js` (the discovery loop), the UI, the CLI
(`package-lab discover`), tests and docs.

**Spec.**

1. **Record reads.** When `options.responses` answers a request with the special body `"@probe"`, the probe makes
   `Response.prototype.json`, `Response.prototype.text` (when followed by `JSON.parse`), `XMLHttpRequest.response`
   and `responseText` (likewise) and `JSON.parse` return a recording Proxy for that request's data. Use the request
   URL to match. The Proxy records:
   - each property path read (`config.player.mode`), with the stack and the type of use where it can tell:
     `typeof` comparisons, truthiness tests, string methods, iteration (`Symbol.iterator`, `length`, `map`), numeric
     use (`Symbol.toPrimitive` with hint `number`);
   - `in` checks and `Object.keys`.

   A read returns another recording Proxy (so deeper reads are seen), and the Proxy is falsy-safe where possible.
   Document the limits: a Proxy is always truthy, so `if (cfg.x)` takes the true branch.
2. **Infer a shape.** `inferShape(reads)` builds a JSON skeleton from the paths and how they were used: booleans for
   truthiness tests, strings for string methods and comparisons with strings, numbers, arrays for iteration, and
   objects for deeper paths.
3. **Discovery loop.** `discover(item, request pattern, rounds = 5)` uses the experiment runner. It runs with
   `@probe`, infers a skeleton, then reruns answering with the skeleton, filled with placeholder values (`""`,
   `false`, `0`, `[]`). It records the new reads and stops when a round adds no new paths or reaches the round
   limit. Each round's milestones are compared (P0.2).
4. **Output.** For each server request:
   - the URL and method;
   - the code that made it;
   - every field read, with the code that read it and its inferred type;
   - the final skeleton;
   - how far the content got with it, against no answer.

   **Save as response** adds it to the session's responses (P1.2).
5. **Findings:**
   - "The content needs these from its server". Severity `warn`. The evidence is the URL plus the fields and
     types, and the fix is: "the export needs a setting that removes this dependency, or the LMS must serve this; a
     stand-in response with these fields lets it get as far as *milestone*".
   - When the content gets further with the skeleton than with a failure: "With a stand-in for *URL*, the content
     reaches *milestone*". Severity `warn`.

**UI.** **Server needs** tab, listing each server request with **Discover** and the result. In the web interface, the
same.

**CLI.**
```bash
package-lab discover <zip> [--item n] [--request glob] [--rounds n] [--json] [--out dir]
```

**Acceptance.**
- A fixture whose boot script fetches `/api/player/config` reads `cfg.lms.enabled` (truthiness), `cfg.lms.version`
  (compared with `'2004'`) and `cfg.assets.base` (concatenated). Discovery must report all three with the right
  types, and the skeleton run must reach `looked` or beyond.
- Unit tests for `inferShape`.

### P1.4 Code instrumentation: the ordered execution trace (opus)

**Goal.** Record, in order, which functions ran and which way each decision went, with the condition's values,
without pausing. This is the base for drill-down (P1.5), stall analysis (P1.6) and the code views (P4.1).

**Files.** `src/vendor/acorn.js`, plus its licence, vendored from the npm package (a single ESM file). Copy the
built `dist/acorn.mjs` from `npm pack acorn` into the repo; don't add a runtime dependency. Also new
`src/instrument.js` (pure), `src/main.js` (serve), `src/host/probe.js` (buffer), `src/recorder.js` (collection),
tests and docs.

**Steps** (commit after each):

1. **Instrumenter.** `instrument(source, { file, scriptId })` parses with acorn (`ecmaVersion: 'latest'`,
   `sourceType` script or module, `allowHashBang`, falling back to script then module). It inserts calls by text
   position (no code generation):
   - function entry: `__labT(1, siteId)` at the start of each function body;
   - function exit: wrap returns by inserting `__labT(2, siteId)` before return statements and at the end of the
     body;
   - each `if` test, ternary test, logical `&&`, `||` and `??`, `switch` discriminant, and loop test: rewritten
     `(test)` → `__labC(siteId, (test))`, which records the boolean result and returns the value unchanged;
   - simple operands: for a test made of comparisons and member or identifier operands, also capture the operand
     values: `__labC(siteId, (a), (b), op)`, or a small set of helper forms (strict and loose equality, `typeof`
     comparison, `in`, `instanceof`, and plain truthiness).

     Capture previews only: type, and for primitives the value (strings cut to 80 characters); for objects the
     constructor name and up to 5 keys.
   - **Never change behaviour.** Preserve evaluation order, side effects, `this`, `arguments`, getter calls (an
     operand is evaluated exactly once), generators and async functions, `super`, and strict mode. Don't instrument
     code inside `with`. Any file that fails to parse is served unchanged and reported.

   `siteId` indexes into a site table `{ file, line, col, kind, text (the source of the test, 120 characters) }`,
   returned alongside the new source.
2. **Runtime.** The probe defines `__labT` and `__labC` on each frame's global (non-enumerable), writing into a ring
   buffer of 200,000 events: `[time, kind, siteId, result, preview…]`. Events are flushed to the recorder through
   `__labReport` in batches (every 250 ms and at page hide). Repetitive loops are collapsed: the same site with the
   same result more than 1,000 times in a row is counted, not stored.
3. **Serving.** When `options.trace` is true, `serve()` instruments package `.js` files and inline scripts in `.html`
   files of 2 MB or less (larger ones are listed as not traced). Results are cached per package and file hash.
   Source maps stay pointing at the original. The trace keeps the original sources in `trace.sources` and the site
   table in `trace.sites`.
4. **Recorded data.** `trace.exec`: the events, with a `sid` and frame per batch. `truncated.exec` is set if the ring
   wrapped.
5. **Exposure.**
   - **Trace** checkbox under More options, and CLI `--trace`.
   - A new **Execution** tab: the last 500 events before the run went quiet, newest last, each with file:line and the
     decision (`if (cfg.lms) → false, cfg.lms = undefined`), and a filter. Clicking an event opens the code (P4.1
     when present; until then the source with the line highlighted).

**Acceptance.**
- Unit tests over a corpus of tricky snippets:
  - short-circuit side effects, getters, optional chaining, `await` in conditions, generators, classes, `super`,
    labelled loops, `switch` fall-through, comma expressions, arrow concise bodies, default parameters, and
    directives ("use strict" stays first);
  - instrumented code gives the same result and the same side-effect log as the original under `node:vm`.
- The `hosted` fixture with tracing records the `if (!r.ok)` decision, and the `startCourse` entry with
  `window.scorm` false.
- Every existing end-to-end test still passes with `--trace` forced on, through a temporary environment switch
  `PACKAGE_LAB_FORCE_TRACE=1` in one test pass. Instrumented runs must not change any fixture's findings except the
  tracing-only ones.
- Overhead: the `good` fixture's run time with tracing is under twice that without.

### P1.5 Drill-down: condition values and where undefined came from (opus)

**Goal.** Without help, point at the decisions that led to the dead end, explain each with its values, and say where
each `undefined` came from.

**Files.** New `src/drilldown.js` (pure), `src/main.js` (the follow-up run), the UI, the CLI, tests and docs.

**Spec.**

1. **Dead end.** The last 300 trace events (P1.4) before the last milestone (P0.2) and before the run went quiet
   (more than 2 s without events), plus every decision in functions that ran within 1 s of the first missing
   milestone's expected moment.
2. **Key decisions.** Decisions on the path to the dead end whose result, if flipped, would have led to code that
   never ran. Coverage (`trace.coverage`) tells which blocks ran. For each key decision, report:
   - the code;
   - the operands' values;
   - the branch taken, and what the other branch would have run (the first lines of the untaken block, and any
     function it calls that never ran).
3. **Where `undefined` came from.** For each operand that was `undefined` or `null`:
   - **Static.** Find assignments to that identifier or property in package sources (acorn walk: assignment
     expressions, declarations with initialisers, object literal keys under the same path, `Object.defineProperty`).
     List them with file:line.
   - **Dynamic.** Rerun the same options with pins (P1.2) in watch mode (`pin.mode: 'watch'`, which records reads and
     writes but doesn't force a value) on those paths. Report:
     - whether any assignment ran, when and from where;
     - the value written;
     - or "never assigned". With "never assigned", it also reports the static assignments that exist but never ran,
       which shows the condition guarding them, and where the value would come from: a response field (link to
       P1.3), a query parameter (`location.search` reads), the LMS (a `GetValue`), or a global another script should
       have set (from the boot graph's `globals()`: "defined by *script*, which never loaded").
4. **Chains.** Repeat step 3 up to three levels when the guard of a never-run assignment is itself undefined-driven.
5. **Output.**
   - A **Drill-down** tab with a numbered chain, readable as a story: "1. In `boot.js:12`, `if (cfg.lms)` was false
     because `cfg.lms` was undefined. 2. `cfg` came from the response to `/api/player/config`, which failed (404).
     3. …".
   - A finding: "Why it stopped: *one-line chain summary*". Severity `error` when the chain ends at a cause Package Lab
     can name (failed request, missing script, version), otherwise `warn`.

**CLI.** `package-lab drill <zip> [run options] [--json]`. It runs with tracing, then the watch run, then prints the
chain.

**Acceptance.**
- `hosted` with drill-down names the failed `/api/player/config` request as the origin of the fallback.
- A new fixture with three levels (`if (window.player && player.ready)`, where `player` is assigned only in a script
  that loads only if `config.cdn` is set, and `config` comes from a JSON file that lacks `cdn`) is explained to the
  JSON file.

### P1.6 Why it stalled: timers, messages, polling (sonnet)

**Goal.** When the content goes quiet short of a milestone, list what it was waiting for.

**Files.** `src/host/probe.js`, new `src/stall.js` (pure), `src/rules.js`, the UI, tests and docs.

**Spec.**

- **The probe records:**
  - `setInterval` and `setTimeout`: creation (callback source location from the stack, delay), each firing (counts,
    throttled), and clears;
  - `addEventListener('message')` registrations (frame and stack);
  - every `postMessage` sent: target frame (as a URL), target origin and the data's shape (type and first keys,
    never values longer than 80 characters), and whether a listener in the target frame ran within 1 s;
  - `requestAnimationFrame` loops (counted only).
- **`stall(trace, milestones)`** reports at the end:
  - **Active pollers:** intervals, or chains of timeouts at the same site, still firing at the end. When a trace
    (P1.4) exists, include the condition the callback tested and its last value, for example: "polls every 500 ms;
    tests `window.API_1484_11` → undefined, 120 times".
  - **Unanswered messages:** sent with no listener in the target, or with a listener that never replied, where a
    reply is a message back within 2 s.
  - **Listeners waiting for a message that never came:** listeners registered in content frames that never fired.
  - **Pending requests at the end** (existing).
  - **The last code that ran:** the last trace events, or, without a trace, the last coverage-active functions by
    script load order.
- **Finding:** "The content was waiting for: *summary*". It sits under the blank-page and loading-screen findings
  when they apply, and stands alone otherwise. Severity `warn`.

**Acceptance.**
- A fixture that posts `{type: 'player-ready'}` to its parent and waits for `{type: 'launch'}` is reported as an
  unanswered handshake, naming the message types.
- A fixture polling for `window.API` every 250 ms is reported as a poller, with its condition when traced.

---

## Phase 2: what a local run can't see yet

### P2.1 LMS profiles, including content on another origin (sonnet; the origin part opus)

**Goal.** Run the content the way particular LMSs host it.

**Files.** New `src/profiles.js` (data and validation); `src/main.js` (serving), `src/host/host.js` and `wrap.html`,
`src/options.js` (`profile`, plus explicit overrides of profile fields), the UI, the CLI, tests and docs.

**Profile fields:**
- `contentOrigin`: `same` (`lab://run/pkg/`) or `other` (`lab://content/pkg/`, a different origin);
- `frames`: `{ depth, kind: iframe | frameset, sandbox: attribute string | null, allow }`;
- `launch`: `frame | popup`, with `popupDelay` in ms;
- `launchParams`: a query string, with `{scoid}`, `{attempt}` and `{learner}` placeholders;
- `apiDelay`: ms before the API objects appear;
- `apiWhere`: `top | parent | opener`;
- `csp`: a `Content-Security-Policy` header on package responses, or null;
- `headers`: extra response headers;
- `commit`: `ok | fail | slow`, with `slowMs`;
- `limits`: `{ suspend12, suspend2004 }`;
- `cookies`: `normal | third-party-blocked` (P2.2 implements it).

**Content on another origin** (opus):
- Register handling for the host `content` on the `lab` scheme, serving the same files.
- With `other`, the host frames the content from `lab://content/…`.
- Lookups through `parent` and `top` then throw `SecurityError`. Record those in the probe (`lookup-blocked` with
  the frame and stack).
- **Finding:** "The content can't reach the LMS from another origin". Its fix explains that the LMS and content must
  share an origin, or the content must use a cross-domain wrapper, with evidence.
- Make sure the recorder still attaches to the content frame (an out-of-process iframe through auto-attach).
- The opus subagent decides how the probe's API accessor behaves when blocked, and checks that Package Lab's own host
  still logs calls.

**Presets** (research subagents: haiku, searching public documentation only): `generic` (the current behaviour),
`moodle`, `scorm-cloud`, `cornerstone`, `successfactors`, `docebo`, `totara`, `blackboard`, `canvas`. Each preset
has a `notes` string and `sources` (URLs of the public docs used), and is marked "approximation". Where documents
don't say, use `generic` values and say so in `notes`. Add the `lms` preset to the experiment runner: one variant per
LMS profile.

**UI and CLI.**
- A **Profile** select in the toolbar.
- Profile fields are editable in More options.
- CLI flag `--profile <name>`; `--profile-file x.json` for a custom profile.

**Acceptance.**
- A fixture that searches `window.parent.API` works with the `same` origin, and with `other` gets the
  cannot-reach-from-another-origin finding.
- The sandbox without `allow-same-origin` is detected.
- Profiles validate.
- Every preset has sources.

### P2.2 Blocked storage and cookies (sonnet)

**Goal.** Reproduce the "works in Chrome, not in Safari or iPad" failures caused by storage blocked in third-party
frames.

**Spec.** With `storage: 'blocked'` (or the profile's `third-party-blocked`), the probe redefines, in content frames
only:
- `localStorage` and `sessionStorage` getters, to throw `SecurityError` (Safari's behaviour);
- `document.cookie`: setting is ignored and reading returns `''`;
- `indexedDB.open` errors.

Also add `storage: 'partitioned'`: a fresh empty storage per run (the default is already a per-partition profile, so
document the difference).

**Findings:**
- "The content needs storage the browser can block". Severity `warn`, with the stacks of the blocked accesses.
- Under P0.2 progress: "With storage blocked, the content gets less far". Shown when run as an experiment (the
  `storage` preset: normal vs blocked).

**Acceptance.** A fixture that stores its state in `localStorage` before initialising fails under `blocked` and is
explained.

### P2.3 Other browsers (WebKit) and device sizes (sonnet)

**Goal.** Run in Safari's engine, and at phone and tablet sizes.

**Device sizes:**
- `options.viewport`: `{ width, height, deviceScaleFactor, mobile, touch, userAgent }`, with presets `iphone`, `ipad`
  and `android-phone`.
- Apply through `Emulation.setDeviceMetricsOverride`, `Emulation.setTouchEmulationEnabled` and
  `Emulation.setUserAgentOverride` on the run window.
- The live view uses the emulated size.

**WebKit:**
- `options.browser`: `'webkit'`.
- Add `playwright` as an optional devDependency, loaded with dynamic import. When it's missing, say how to install it
  (`npm i -D playwright && npx playwright install webkit`) and refuse the run.
- New `src/webkit-runner.js`, run from the CLI's Node process, not Electron. It does the following:
  - Launch WebKit and serve the package and host files from memory through `page.route('https://lms.lab.invalid/**')`.
    This is the same layout as `lab://run/`, with `run/` → `/`, so host files work unchanged.
  - Add the probe with `addInitScript`, and expose `__labReport` with `exposeBinding`. Apply pins, responses and
    overlays the same way.
  - Collect requests (`request`, `requestfinished` and `requestfailed`), console, `pageerror` and frames.
  - Write a trace in the same format, with `trace.browser = 'webkit'`, no coverage, no caught errors and no sources.
  - Findings must cope with the missing parts: every rule already reads optional lists, so test it.
- Desktop and web: the **Browser** select runs WebKit runs through the CLI's job path (spawned Node) and shows the
  result like any run. There is no live view for WebKit in this work package; note it as a `ponytail:` comment.
- Experiment preset `browsers`: chromium against webkit.

**Acceptance.**
- With Playwright installed, `good` runs in WebKit and reaches `wrote`, and a fixture that uses a Chrome-only API
  (for example `navigator.userAgentData.brands` without a guard) fails only in WebKit, with the error recorded.
- Without Playwright, the error message is clear and the test is skipped.

### P2.4 Automatic save-and-resume cycle (sonnet)

**Goal.** Test progress saving without a person clicking through.

**Spec.**

- **Input macros.**
  - The live view (desktop and web) gets **Record clicks**: every input event sent through `live-input` is recorded
    with its time, and **Save macro** stores it (in the session, saved with runs).
  - Clicks made directly in the desktop course window can't be seen through CDP, so the probe records
    `pointerdown`, `keydown` and `input` events in content frames instead, as normalised coordinates (relative to
    the top frame) and key names. Use those for desktop runs.
  - `options.macro` replays events at their times (`live.input`).
- **`cycle(item, options, macro?)`** uses the experiment runner:
  1. **Run 1:** play the macro, if given. Then leave the way a learner closing the window would: trigger
     `beforeunload`, `pagehide` and `unload` by navigating the content window to `about:blank` and closing it, with
     the recorder still attached. Capture the stored data model.
  2. **Run 2:** resume from run 1's data.
- **Checks** (pure `cycleFindings`):
  - Run 1 saved something (suspend data, location or status). If not: "Leaving the course saved nothing", severity
    `error`. List the unload handlers that ran (probe: count `beforeunload` and `pagehide` listeners and whether they
    called the API).
  - Exit was `suspend` (or exit is unset, with the incomplete status).
  - `Finish` or `Terminate` was called on unload.
  - Run 2 was offered `entry = resume`, read location and suspend data. If it didn't read them: "On resume, the
    content didn't read its saved place", severity `error`.
  - Run 2's first location write equals run 1's last. If it restarts at the beginning: "The content read its saved
    place but started from the beginning", severity `warn`.
  - Suspend data written in run 2 starts from run 1's, not empty.
- **UI.** **Test saving** button: runs the cycle with the current options and macro, and shows the two runs side by
  side, with the cycle findings.
- **CLI.** `package-lab cycle <zip> [run options] [--macro file.json] [--json]`.

**Acceptance.**
- `good` passes the cycle when given a macro that clicks **Next** then **Save and exit**.
- A fixture that never sets exit, and one that ignores its bookmark, produce their findings.

---

## Phase 3: from diagnosis to fix

### P3.1 Corrected package export (sonnet)

**Goal.** Fix what can be fixed mechanically, plus the user's overlays, and export a new `.zip`, listing each change.

**Spec.**

- **ZIP writer** in `src/zip.js`: `zip(files Map)`. It writes local headers, deflates with `deflateRawSync` (stored
  if not smaller), and writes the central directory and CRC32 (`zlib.crc32` when present, otherwise a table
  implementation). Round-trip test against `unzip` and the system `unzip -t`.
- **Autofixes.** A finding may carry `autofix: { id, label, apply(files) → { files, changes: [string] } }`. It is
  kept as data (`{ id, params }`), with the functions in `src/fixes.js` so findings stay serialisable. Fixes:
  - **`case`:** rename references to match the file's capitals in pages and scripts, or rename the file when a
    single reference style is used everywhere. Choose per file, and log the choice.
  - **`manifest-version`:** set `<schemaversion>` and the namespaces to match the API the scripts use (1.2 ⇄ 2004
    4th Edition), with namespace sets taken from known-good manifests.
  - **`file-missing`:** remove `<file>` entries for files that don't exist.
  - **`http-to-https`:** http URLs for scripts, styles and frames.
  - **`manifest-case`:** rename to `imsmanifest.xml`.
  - **`manifest-not-root`:** re-root the ZIP.
- **Export.** Combine the selected autofixes and overlays (P1.1) into `<name>-fixed.zip`, and put
  `PACKAGE-LAB-CHANGES.txt` inside, listing every change and the Package Lab version.
  - Desktop: **Export corrected package…** (a save dialog).
  - Web and Concierge: a download.
  - CLI:
    ```bash
    package-lab fix <zip> [--only id,…] [--override …] --out fixed.zip
    ```
- **Proof.** After export, run `analyze` on the result and report which findings are gone. Optionally run it as a
  variant in an experiment.

**Acceptance.**
- `blank`'s capitals fixed: `analyze` on the result has no capitals finding and the run is no longer blank.
- `mismatch`'s version fixed: calls appear.
- The ZIP is valid according to `unzip -t`.

### P3.2 Authoring tool checks: rule packs (sonnet, with research by haiku)

**Goal.** Findings that know particular tools: their file layouts, config files, wrappers, known failure patterns and
the export setting to change.

**Spec.**

- `src/packs/<tool>.js` exports `{ id, name, detect(analysis, files) → confidence, staticRules(ctx) → findings,
  runRules(ctx, trace) → findings, notes, sources }`. `src/packs/index.js` registers the packs. `fingerprints` moves
  to use the packs' `detect`. Findings from packs say "Xyleme:" (and so on) in their title prefix.
- **Research first** (haiku research subagents, public sources only: vendor docs, community forums, public GitHub
  issues). One short `docs/packs/<tool>.md` per tool with:
  - the file layout of SCORM exports;
  - the config files and keys that switch LMS, preview and standalone modes;
  - known LMS problems and their fixes;
  - the export settings that matter;
  - sources.

  No package content goes into any query.
- **Tools, in order:**
  - **Xyleme first,** because it is the owner's case: its player and config files, any platform API dependency,
    and preview against LMS modes.
  - **Then:** Articulate Storyline (`story.html`, `lms/scormdriver.js`, `strLMSStandard`, `blnLMSPresent`
    patterns), Rise (`scormcontent/`, its LMS shim), Captivate (`CPM.js`, `scormdriver`), iSpring, Lectora, Adapt
    (`adapt-contrib-spoor` settings), dominKnow, Evolve, and the SCORM Driver and pipwerks wrappers.
- **Rules use existing evidence.** Each rule reads the analysis, boot graph and trace. For example, Storyline's
  "published for Web or LMS but launched as the other" (a config value against `blnLMSPresent` in the trace), Adapt's
  `_isEnabled: false` in `spoor`, and SCORM Driver's `strLMSStandard` against the manifest.
- **Confidence.** Every pack rule states how sure it is ("matches a known pattern" against "confirmed in this run").
  Rules from forum knowledge are `info` unless the run confirms them.

**Acceptance.**
- One fixture per tool, built synthetically from the public file layout (not real exports), triggers its pack's
  detection and at least one rule.
- The Xyleme pack's research notes list their sources.
- The existing fingerprint tests still pass.

### P3.3 Comparing two packages (sonnet)

**Goal.** See what changed between two exports, in files and in behaviour.

**Spec.**

- `src/textdiff.js`: a Myers diff with line granularity and unified output (reuse it if P1.1 made a simpler one, and
  replace that).
- `comparePackages(a, b)` returns:
  - files added, removed and changed (with sizes);
  - text diffs for changed text files under 1 MB (minified files are diffed after formatting, P4.1, when available);
  - the manifest compared field by field (versions, resources, items, launch paths, parameters);
  - the boot graphs compared (nodes added, removed and changed status);
  - findings that differ.
- **Behaviour.** An option to run the same item with the same options on both, and compare milestones and counts
  (P0.2).
- **Interfaces.**
  - Desktop and web: **Compare packages…** opens a second package. The result appears in a **Package diff** view.
  - CLI:
    ```bash
    package-lab diff <a.zip> <b.zip> [--run] [--json] [--out report.html]
    ```
  - Report: a diff section, with a collapsible diff per file.

**Acceptance.**
- `good` against `blank` lists the changed `lesson.html`, the added `js/App.js`, the boot-graph differences and the
  new findings.
- With `--run`, it says that `good` reaches `wrote` and `blank` reaches `launched`.

---

## Phase 4: everyday use

### P4.1 Code views (sonnet)

**Goal.** Read the content's code comfortably, at the line a finding points to, with what ran.

**Spec.**

- **Vendor `js-beautify`** (MIT, the `beautify.js` single file, with its licence) for formatting JavaScript, HTML
  and CSS. Formatting keeps a line map from the original to the formatted text, so positions from coverage, the
  trace and findings still land. Build the map by tokenising: compare non-whitespace characters between original
  and formatted.
- **Source maps.** Parse `sourceMappingURL` (inline data URLs or files in the package). A VLQ decoder in
  `src/sourcemap.js` maps generated positions to original sources, which are shown when `sourcesContent` is present.
- **Code view** (shared by Scripts, Files, Execution, Drill-down and evidence links):
  - line numbers;
  - formatted, original or source-mapped mode;
  - coverage shading (ran, didn't run, ran N times);
  - trace markers (decisions with their results, from P1.4);
  - a search box;
  - "go to line".
- **Every `file:line` in evidence becomes a link** that opens the view there. Do this in `app.js`'s findings list
  and in the report, where links go to an embedded read-only view of that file's excerpt (±20 lines).
- Plain DOM, no editor library. Virtualise rendering for files over 5,000 lines (render only the lines in view).

**Acceptance.**
- A minified fixture with an inline source map shows the original source at a finding's line.
- Coverage shading matches `branchDiff`'s ranges on `good`.
- The view opens in under 300 ms for a 2 MB file.

### P4.2 Timeline (haiku)

**Goal.** One picture of a run.

**Spec.** A **Timeline** tab: an SVG with time on the horizontal axis and lanes for:
- requests (bars from start to response, red when failed);
- scripts parsed;
- API calls (dots, coloured by call);
- milestones (P0.2, labelled);
- errors (red ticks);
- DOM snapshots (hover to see the text sample);
- trace density (a sparkline, if traced).

Zoom with a range slider; hover for details; clicking an item opens its tab at that row. Pure `timelineModel(trace)`
in `src/timeline.js` with unit tests. Same in the report as a static SVG.

**Acceptance.** The model's unit tests pass. The `good` run's timeline shows ten API calls and every milestone up to
`wrote`, in order.

### P4.3 Batch checks (haiku)

**Goal.** Check a whole folder of packages at once.

**Spec.**

- **CLI:**
  ```bash
  package-lab batch <folder | zips…> [--run] [--wait s] [--recursive] [--json] [--csv file] [--out report.html] [--jobs n]
  ```
  `--jobs` is the parallel static checks; runs are always one at a time unless `--jobs` is over 1, then at most 2.
- **Output:**
  - a table: package, SCORM version, tool, verdict, errors and warnings, and furthest milestone (with `--run`);
  - an HTML report with a summary table linking to each package's section (the existing report per package,
    collapsed);
  - CSV with the same columns.
- **Desktop:** **Check a folder…** shows the table and opens a package on click.
- **Alfred:** a File Action on folders: **Check SCORM packages in folder**.

**Acceptance.** A folder of all the fixtures gives one row each, with the expected verdicts. CSV and HTML are written.

### P4.4 Redacted report (haiku)

**Goal.** A report that can be sent to a vendor without the course content.

**Spec.** `renderReport(..., { redact: true })` and `redactRun(run)` (pure):
- **Removed:** DOM text samples, console text (keep level and source location), API values (keep element names;
  keep vocabulary values such as `completed` and `suspend`, numbers and lengths; replace free text with
  `‹N characters›`), suspend data (length only), script sources (never included anyway), and request bodies.
- **URLs** keep their path in the package. Query values are replaced.
- **File names:** keep them by default. With `--redact-names`, hash them, using a stable short hash, with a key in a
  separate file the user keeps.
- **A banner** at the top says what was removed.

Interfaces: a report option (CLI `report --redact`, desktop and web export, and a Concierge download link).

**Acceptance.** Unit tests: no fixture text string from the `good` lesson appears in a redacted report of its run.

### P4.5 cmi5 and xAPI (sonnet)

**Goal.** Diagnose cmi5 and xAPI (Tin Can) packages too.

**Spec.**

- **Detection:** `cmi5.xml`, or `tincan.xml` with no `imsmanifest.xml`. Parse the course structure (AUs and
  activities, launch URLs, `moveOn`, `masteryScore`, `launchMethod`).
- **A local LRS** in the main process, served at `lab://run/__lrs/`. It handles:
  - the statements resource: `PUT`, `POST` and `GET` with the `statementId` and `since` queries;
  - the state, activity profile and agent profile resources;
  - the `about` resource.

  It checks the `X-Experience-API-Version` header. It validates statements against the xAPI 1.0.3 rules (actor,
  verb, object, IRIs, timestamps, result score range), and is strict but reports problems as findings rather than
  rejecting where the spec allows. Basic auth uses a generated token.
- **cmi5 launch:** the URL with `endpoint`, `fetch`, `actor`, `registration` and `activityId`. The fetch URL returns
  the auth token once. The `LMS.LaunchData` state document holds `launchMode`, `moveOn`, `masteryScore`,
  `returnURL` and `contextTemplate`.
- **Milestones for these formats:**
  - cmi5: `fetched` the token, `initialized`, `completed` or `passed` or `failed`, `terminated`.
  - Tin Can: the first statement, then the completion statement.
- **Findings:**
  - cmi5 rules: statements out of order; `completed` before `initialized`; `moveOn` not satisfied; a missing
    `sessionid` in context extensions; the `cmi5` category activity missing; fetching the token twice.
  - xAPI validation errors.
  - The LRS endpoint never called.
- **UI and CLI:** an **xAPI** tab with the statement list and validation, and the state documents. Runs and reports
  include them.

**Acceptance.**
- A synthetic cmi5 fixture (built in tests from the cmi5 spec's sample structure) reaches `terminated`.
- A broken one (`completed` before `initialized`, a bad verb IRI) gets both findings.
- A Tin Can fixture's statements are listed and validated.

---

## Phase 5: interfaces, documentation and release

### P5.1 Concierge module catch-up (sonnet)

In `~/github/concierge/modules/package-lab/run`, on branch `package-lab-next`:

- **Run form:** profile, browser (WebKit only if Playwright is present: check with
  `package-lab doctor --json`, a small new CLI command listing capabilities), device size, storage, trace (on by
  default), and **Test saving** (the cycle).
- **Experiments:** **Try variants** with a preset select, then a table page that updates as runs finish (use a worker
  per experiment, with the same polling pattern as runs).
- **Pages** for run results: Drill-down (the chain as text), What it waited for, Server needs (with **Discover**),
  and Milestones at the top.
- **Downloads:** redacted report, corrected package (**Fix** with the autofix checklist), and package diff against
  another uploaded package.
- **Overrides:** upload a replacement file for a path (no in-browser editor), and add a pin or a response with a
  small form.

Update the module's header comment, `modules/README.md` and `docs/concierge.md`. Extend the module's tests in
`test/test.js`.

### P5.2 Alfred and CLI polish (haiku)

- **Alfred:** add actions for experiments (`⇧↩` on `scorm`: run the `standard` preset and open the report), fix
  (export a corrected package next to the original), and the folder batch action.
- **Rebuild** with `npm run alfred -- --no-open` in the tests.
- **CLI:** `package-lab doctor` (Node, Electron, Playwright and WebKit, the installed app, data folder, port 4880 free).
  Shell completion scripts for zsh (`package-lab completion zsh`). Consistent `--json` on every command.

### P5.3 Documentation pass (haiku, then a sonnet review)

- Update the README feature list, the user guide (a section per new tab and button), `findings.md` (every finding
  added in this plan, grouped as now), `cli.md` (every command and flag, with JSON shapes), `web.md`, `alfred.md`,
  `concierge.md`, and the developer guide.
  - The developer guide covers new modules, data formats (`options`, `exec`, `sites`, milestones, shapes,
    experiments, profiles, packs, macros, cycle results, LRS), how to add a profile, a pack or an autofix, and the
    vendored libraries.
- Add a **Recipes** page (`docs/recipes.md`) with step-by-step diagnoses:
  - works on the authoring platform but not in an LMS;
  - blank page;
  - no API calls;
  - doesn't resume;
  - Safari or iPad only;
  - works in one LMS but not another.

  Each uses the features in order.
- Update `DESIGN.md`'s roadmap to show what's done.
- The Sonnet review checks every documented flag and button against the code (grep), and every finding title in
  `findings.md` against `rules.js`, `bootpath.js`, the packs and the other finding sources. Fix every mismatch.

### P5.4 Final check and release build (sonnet)

- `npm test` (with `--slow` checks), and `node test/test.js --unit`.
- `npm run package`. Check that the built app runs `package-lab run` through `PACKAGE_LAB_ELECTRON` on `good`.
- `npm run alfred -- --no-open` builds.
- Merge `next` into `main` (`--ff-only`), and `package-lab-next` into concierge `main` (`--ff-only`). If concierge
  `main` moved, rebase `package-lab-next` onto it first. If that conflicts, stop the merge, leave the branch, and say
  so in the final summary.
- Bump `version` in `package.json` to 0.2.0, and the module's `module.json` to 1.1.0.
- Write the final summary in `plan-status.md`. Don't install the app, the module or the workflow on the machine;
  list the commands to do so.

---

## Prompt template for subagents

Use this for every work package. Fill in the brackets. Keep it self-contained: subagents don't see this conversation.

```
You are implementing work package [ID] "[title]" of Package Lab, a local tool that diagnoses SCORM packages
(repo: ~/github/package-lab, branch `next`, already checked out; work in this checkout, not a worktree).

Read first: docs/plan.md (section [ID] and "Rules for every work package"), docs/developer-guide.md, and the files
named in the work package. Follow the code's existing patterns (plain ESM, no runtime dependencies beyond those the
plan names, pure analysis modules, findings as { sev, title, detail, evidence, fix }).

Do:
- Implement the spec in docs/plan.md section [ID] exactly. Where it leaves a choice, pick the simplest option that
  meets the acceptance criteria and add a line to docs/decisions.md.
- Add the tests and fixtures the work package's acceptance criteria name, plus unit tests for pure code.
- Update docs: findings.md, the relevant user guide(s), developer-guide.md.
- Run `node test/test.js --unit` while working and `npm test` at the end. Both must pass.

Don't:
- Commit (the orchestrator commits), push, or change unrelated files.
- Open, read or upload any SCORM package outside test/. Never put package content or personal details in web
  searches (public documentation searches only).
- Ask questions: decide and log the decision.

Report back: files changed, tests added, test results (the last lines of npm test), decisions logged, and anything
not done with the reason.
```

For review subagents:

```
Review the uncommitted diff in ~/github/package-lab (git diff and new files) for work package [ID] in docs/plan.md.
Check it against the spec and acceptance criteria, the "Rules for every work package", behaviour preservation, and
security (escaping in HTML, paths confined, no data leaving the machine). One line per problem with file:line and
severity. Say "no problems" if none. Don't edit files.
```
