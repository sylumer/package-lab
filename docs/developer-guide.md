# Package Lab developer guide

How Package Lab is built, the formats it reads and writes, and how to change it.

- [Principles](#principles)
- [Layout](#layout)
- [Architecture](#architecture)
- [The main process](#the-main-process)
- [Serving the package: lab://](#serving-the-package-lab)
- [The test LMS](#the-test-lms)
- [LMS profiles](#lms-profiles)
- [The probe](#the-probe)
- [The recorder](#the-recorder)
- [Static analysis](#static-analysis)
- [The boot graph](#the-boot-graph)
- [cmi5 and xAPI (P4.5)](#cmi5-and-xapi-p45)
- [The execution trace](#the-execution-trace)
- [The drill-down](#the-drill-down)
- [Findings](#findings)
- [Adding a finding](#adding-a-finding)
- [Comparison](#comparison)
- [Code views](#code-views-p41)
- [Reports](#reports)
- [Interfaces](#interfaces)
- [Data formats](#data-formats)
- [Tests](#tests)
- [Packaging](#packaging)
- [The Alfred workflow](#the-alfred-workflow)
- [The Concierge module](#the-concierge-module)
- [Debugging](#debugging)

## Principles

- **Nothing leaves the machine.** No telemetry, no network calls of Package Lab's own, and no AI services. Packages are
  read in memory.
- **Evidence, then findings.** The recorder and the static analysis collect facts. Findings are pure functions over
  those facts, so they can be recomputed from a saved run and tested without Electron.
- **One run explains itself.** Diagnosis must not need a working copy. Comparison is an extra.
- **No runtime dependencies.** The app uses Electron, Node's standard library and the browser; only packaging needs
  `@electron/packager`. The ZIP and XML readers are small and written here. Vendored code lives in `src/vendor/`, each
  file with its licence (see [Layout](#layout)).
- **ES modules** throughout, except `src/preload.cjs` (Electron preloads in a sandbox must be CommonJS) and
  `scripts/icon.cjs`.

## Layout

```
bin/package-lab.js        CLI
src/
  main.js               Electron main process: windows, the app menu (buildMenu), lab:// server, runs, IPC and web handlers, headless runs
  preload.cjs           window.lab for the desktop window (IPC)
  docs.js               The bundled docs: DOCS (name, title, group, file). scripts/package.js copies exactly these into the app; the docs and doc handlers serve only these names
  web.js                HTTP server for the web interface (API, events, live frames, auth)
  settings.js           Settings: DEFAULT_PORT (4880), validPort, readSettings, writeSettings (settings.json in the data folder; readSettings never throws)
  recorder.js           CDP recorder: one per run window or popup; probeSource (the script put into every frame)
  launch.js             What every browser's run shares, in plain Node: serveRequest, launchPlan, the findings of a finished run, savedRun (P2.3)
  webkit-runner.js      WebKit runs through Playwright, in plain Node, not Electron (P2.3)
  host/                 Loaded inside the run window
    host.html, host.js  The test LMS page (host.js also runs in wrap.html)
    wrap.html           An empty LMS frame (for frame depth); may hold the API (a profile's apiWhere)
    scorm-runtime.js    SCORM 1.2 and 2004 run-time (from toolbox)
    probe.js            Injected into every frame: API lookups, assignments, wrapped calls, DOM snapshots
    shape-probe.js      Injected ahead of probe.js when a run answers with @probe: the recording Proxy (P1.3)
    trace-probe.js      Injected ahead of probe.js in a traced run: __labT, __labR, __labC and the event ring (P1.4)
  vendor/
    beautifier.cjs      js-beautify 2.0.3: js/lib/beautifier.js from npm pack js-beautify (the JS, CSS and HTML formatters in one file), unchanged but for its name (a .cjs, because package.json says type: module) (MIT; js-beautify.LICENSE). format.js's formatter; not in package.json
    acorn.js            acorn 8.19.0: dist/acorn.mjs from npm pack acorn, unchanged (MIT; acorn.LICENSE). instrument.js's parser
  zip.js, xml.js        Readers
  pins.js               Pins and answers: matching, the probe's prefix, the findings, the CLI's spellings
  shape.js              What the content wants from its server: reads → shape, the discovery loop, its findings
  format.js             Formatting with the vendored js-beautify, and the line map between original and formatted text (P4.1)
  sourcemap.js          Source maps: VLQ decoder, finding a file's map, original positions (P4.1)
  codeworker.js         The worker thread codeViewAsync uses: formatting and map decoding (P4.1)
  codeview.js           What the shared code view shows: modes, coverage lines, trace markers, evidence links, report excerpts (P4.1)
  instrument.js         The execution trace: instrumenting scripts and pages, positions back to the originals, reading events
  drilldown.js          Why it stopped: key decisions, where each undefined came from, the chain and its finding
  overlay.js            Overrides: the file set a run is served from, and the findings about changed files
  textdiff.js           A Myers line diff (diffLines, unified)
  pkgdiff.js            Comparing two packages: files, manifest, boot graphs, findings, behaviour (P3.3)
  batch.js              Batch checks: a folder's packages as rows, the CSV and the HTML summary, the worker pool for static checks (P4.3)
  batchworker.js        The thread that checks one package for a batch (checkPackage); loaded by staticRows
  stall.js              Why it stalled: pollers, unanswered messages, listeners that never ran, and the finding (P1.6)
  milestones.js         Milestones (where a run got to on the SCORM path, or the cmi5 or Tin Can one) and progress (comparing two runs)
  cmi5.js               cmi5.xml and tincan.xml parsing, the course's manifest-shaped view, the launch parameters, LMS.LaunchData, the cmi5 rules (P4.5)
  xapi.js               xAPI 1.0.3 statement validation, and the findings and milestone hits from a run's LRS record (P4.5)
  lrs.js                The local LRS: createLrs → handle(request), snapshot(); served at /__lrs/ by main.js and the WebKit runner (P4.5)
  options.js            Launch options: normaliseOptions (the only place defaults live), cliCommand
  profiles.js           LMS profiles: the presets, checkProfile, resolveProfile, launchProfile (P2.1)
  analyze.js            Manifest and script scan
  bootpath.js           Boot graph (how the launch should load) and bootRun (against a run)
  rules.js              Findings: static, run, launch, comparison
  packs/                Rule packs for authoring tools: index.js registers them (PACKS); util.js shared readers and
                        the confidence sentences; one file per tool: adapt, captivate, dominknow, evolve, ispring,
                        lectora, pipwerks, rise, scormdriver, storyline, xyleme (P3.2)
  diff.js               Comparison of two runs
  report.js             HTML reports, verdict, runVerdict (the Findings banner, E2.4), counts, the redaction banner, the experiment's variants table (experimentHtml, P5.2)
  completion.js         The command table (names, summaries, flags, value kinds) and the zsh completion script (P5.2)
  redact.js             Redacted reports (P4.4): redactRun, the copy of a run with the course content taken out
  fixes.js              Corrected package export: FIXES (the six autofixes, in run order), correct, prove, exportFixed (P3.1)
  experiments.js        Experiments: PRESETS (api, frames, standard, lms, storage, browsers), planVariants, runResult, summarise, experimentFindings (P0.3)
  macros.js             The macro editor's pure parts: setDelay, move, remove, insertWait, setFields, edit, macroRows, macroName (E4.2)
  cycle.js              Save and resume: macros (readMacro, macroFile, macroDelays, quietFor, withMacroSize), resumeOptions, cycleFindings, cycleRows (P2.4)
  timeline.js           The Timeline: timelineModel (lanes in ms) and timelineView (fractions of the window shown), for the Timeline view and the report (P4.2)
  ui/                   The interface (desktop window and web)
    index.html, style.css, app.js (an ES module)
    codeview.js         The shared code view (classic script, window.CodeView; P4.1)
    bridge.js           window.lab over HTTP when there is no preload (web)
    markdown.js         The docs panel's Markdown renderer: escapes everything, drops non-http and relative link schemes, GitHub-style heading ids (`slugOf`, exported, is the same slug the link check uses); no dependencies
scripts/
  package.js            Builds Package Lab.app (and --install); includes the DOCS from src/docs.js
  icon.cjs              Renders build/icon.svg to build/icon.png
  alfred.js             Builds the Alfred workflow
  alfred-scripts.js     The shell the workflow's script actions run; exported so the tests run it (P5.2)
build/icon.svg          The app icon
test/test.js            Tests (including the Markdown renderer); test/fixtures/base is the sample package
test/packs.js           Rule pack tests (imported by test.js): synthetic packages and hand-made traces
test/batch.js            Batch check tests (imported by test.js): CSV cells and the formula guard, summary, runs merged into rows, HTML escaping, folders
test/xapi.js            cmi5 and xAPI tests (imported by test.js): the cmi5 and Tin Can fixtures, validation, the LRS, cmi5 rules, findings, milestones, redaction; pure
test/codeview.js        Code view tests (imported by test.js): VLQ, source maps, formatting, coverage, links, excerpts, the 2 MB timing; pure
docs/                   User and developer documentation
```

The Concierge module is in the Concierge repo at `modules/package-lab/run`.

## Architecture

```
            ┌────────────── interfaces ──────────────┐
 desktop window (IPC)   web browser (HTTP+SSE)   CLI (spawns Electron --run=job.json)
            │                    │                    │
            └──────► handlers in main.js ◄────────────┘      Concierge module ─► CLI
                         │
        loadPackage ─► analyze + bootGraph            (static: pure)
        launchItem ─► begin() ─► run window ─► lab://run/__lab/host.html (test LMS)
                         │                         └─ iframe(s) ─► lab://run/pkg/<launch>
                         │   Recorder (CDP on the window and every frame/worker/popup) + probe in each frame
        finish() ─► trace ─► launchFindings + runFindings + staticFindings + boot risks ─► run
                         │
                     emit('run') to every interface; saved as JSON
```

## The main process

`src/main.js` runs in one of three modes, chosen by flags:

| Flags | Mode |
|---|---|
| none | Desktop window, single instance (a second launch hands its `.zip` to the first) |
| `--serve[=port] [--host=…] [--no-window] [--show-runs]` | Web interface, with or without the window. Run windows are hidden without a window unless `--show-runs` |
| `--run=<job.json>` | Headless (job: `{ zip, item, options, resumeFrom, out, live }`): load, launch, wait, write the run, quit. Uses a throwaway profile in the temp folder |

`PACKAGE_LAB_DATA` replaces the data folder (`app.getPath('userData')`, by default
`~/Library/Application Support/Package Lab`) for the first two modes.

**Platforms (E6.1).** `src/platform.js` is the one place that knows where things live on each platform. Its functions are pure (platform, environment and home folder come in as arguments, and `path.win32` or `path.posix` builds the answer), so the Mac tests the Windows paths:

- `dataDir(platform, env, home)` is the folder Electron uses for `userData`: `~/Library/Application Support/Package Lab` on a Mac, `%APPDATA%\Package Lab` on Windows (`~/AppData/Roaming` if `APPDATA` is missing), `$XDG_CONFIG_HOME` or `~/.config` then `Package Lab` on Linux. The CLI reads it for `doctor`, `serve --url` and `settings`; `PACKAGE_LAB_DATA` still wins. `dataOverride(platform, env, exeDir, hasPortable)` is what `main.js` calls before `ready`: `PACKAGE_LAB_DATA`, else (Windows only) the `Package Lab Data` folder beside the exe when it exists, else `null` and Electron's own folder.
- `appBinaries(platform, env, home, appDir, arch)` lists where the installed app may be, `PACKAGE_LAB_APP` first (a trailing slash dropped); `doctor` looks in all of them, but `open` and `electron()` use, on a Mac, only `PACKAGE_LAB_APP` and `/Applications`, and off the Mac the unpacked build in `dist/` only after this repo's Electron; `executable` turns a Mac bundle into its program; `openCommand` is the command that shows a file in its usual program (`open`, `explorer.exe`, `xdg-open`).
- File paths are made from URLs with `fileURLToPath(new URL(…, import.meta.url))`, never `.pathname`, which gives `/C:/…` on Windows. The `lab://` URLs are not file paths: their `.pathname` is a path inside the package, always with `/`.
- Mac-only code sits behind `process.platform === 'darwin'` (the window's vibrancy, the accent colour, `plutil` for an installed app's version, `open -a`) or on a line marked `// darwin-only`. A unit check lints `src`, `bin` and `scripts` for `.pathname` on a URL from `import.meta.url`, and for `/Applications/`, `Library/Application Support` and `.app/Contents` outside `src/platform.js` and marked lines (the Mac-only lines of `scripts/package.js` carry the mark).
- Shortcut text in the window goes through `keys()` in `app.js` (`keysFor` in `src/ui/markdown.js`): `⌥⌘I` is `Ctrl+Alt+I` off the Mac. It is applied to the docs as they load into the panel; the Markdown files keep the Mac symbols. Menu accelerators are all `CmdOrCtrl+…` and `Alt`.
- Off the Mac the window has its own frame and menu bar. The toolbar's drag regions are set only under `body.mac`, so they never cover the menu.
- Shell-outs at run time: `main.js` starts `process.execPath` for WebKit runs (with `ELECTRON_RUN_AS_NODE`; the environment it passes includes Windows's `Path`, `SystemRoot`, `TEMP` and profile variables); the CLI starts Electron, `process.execPath` (WebKit runs and `batch --run`'s children), the installed app (`open -a` on a Mac, the program itself elsewhere), `plutil` for the installed app's version (Mac only; elsewhere the version is `null`), and the command from `openCommand` for `report --open`.

The web port is `--serve=N` if given, else the port in the settings (`src/settings.js`), else 4880. The desktop app's
`--serve` and `package-lab serve --port` follow the same order.

The rest of the file, in order:

- **State:** one package (`pkg`: name, files Map, analysis, cached boot graphs, `lastCmi`) and at most one active run
  (`active`: window, popups, recorders, launch settings, boot graph, auto-stop timer). Finished runs are kept in a Map
  for the session.
- **`emit(channel, data)`:** sends to the desktop window over IPC and to web clients over server-sent events.
  Channels: `package`, `run`, `state`, `probe`, `experiment`, `discover`, `drill`. A run's `state` event (`running`, `label`, `auto`) also carries `started`, the run's start time (`Date.now()`), so the desktop Record can count from the press.
- **`begin()` and `finish()`:** open a run window, start the recorder on `about:blank` (the debugger needs a renderer
  before the content loads), then navigate. `finish()` reads the stored data model, stops the recorders (merging
  popups), destroys the windows, computes findings and saves the run.
- **`live`:** frames and input for the live view. It captures `capturePage()` every 400 ms while someone is watching
  (a web client on `/api/live`, or a headless run with a live folder), and sends a frame only when it changed. Input
  goes to the newest window through `sendInputEvent` and `insertText`. Hidden windows render and take input. Watchers are
  counted in `live.watchers`: `live.web` (open `/api/live` connections, set by `onLive`) plus one while `live.uiOn` (the desktop UI's
  Live view, set by the desktop-only `live-watch` handler and cleared when the UI window navigates, reloads or closes). A frame goes to web clients when
  `live.web > 0` and to the UI window as `ui.webContents.send('live', frame)` while `live.uiOn`; `lab.on('live', fn)`
  receives it (the preload's `on` passes any channel). The `state` handler returns `liveWatchers` so a test can see the count.
- **`handlers`:** the interfaces' API. They are registered with `ipcMain.handle` and passed to the web server.
- **App menu:** `buildMenu()` builds the menu bar (desktop only). It has an explicit Package Lab menu, whose **Settings…** (⌘,) sends `{ action: 'settings' }` to the window. Each item sends a `menu` event to the window: `{ action }` for a toolbar button id, or `{ action: 'docs', name }` to open a doc in the docs panel. The Run menu's **Run** and **Stop** both send the toolbar's one Run/Stop button (`#run`): `launch` clicks it only when no run is going and `stop` only when one is. On macOS `createWindow()` adds `MAC_WINDOW` (`hiddenInset` title bar, traffic lights at 14,14, `sidebar` vibrancy, transparent window background); the toolbar is the title bar and `body.mac` leaves 78 px for the lights.
- **Accent colour:** `ipcMain.handle('accent')` returns `systemPreferences.getAccentColor()` as `#rrggbb` (`''` where there is none). `preload.cjs` exposes it as `lab.accent()` and `lab.onAccent(fn)`, which hears the `accent` message main sends on `accent-color-changed`. `app.js` sets `--accent` on the root from both; the web interface has neither, so it keeps the CSS default. Developer Tools is ⇧⌥⌘I (⌥⌘I is Show Inspector). Never detect Electron by user agent: use `lab.web` or check for `lab.accent`.
- **Appearance (E3.4):** `settings.json` has `theme` (`system`, `light` or `dark`; `THEMES`, `validTheme`; `readSettings` gives `system` for anything else and `writeSettings` refuses it, naming the three). `applyTheme()` in `main.js` sets `nativeTheme.themeSource` at startup and from `settings-set` (`{ theme }`; `port` is optional now); `PACKAGE_LAB_THEME` (the screenshots) wins. That would also change `prefers-color-scheme` in run windows, so while `themeSource` isn't `system`, `courseDark()` gives the real system appearance (`AppleInterfaceStyle` on macOS, read at startup elsewhere) and the `Recorder` (option `dark`; `setDark` for a change during a run, also on `AppleInterfaceThemeChangedNotification`) sends `Emulation.setEmulatedMedia` to every session after the device size and user agent. `dark: undefined` leaves the window alone. In the UI, `app.js` sets `<html data-theme>` (removed for System); `style.css` has the dark tokens under `prefers-color-scheme: dark` with `:root:not([data-theme="light"])` and again under `:root[data-theme="dark"]`, and `color-scheme` narrowed by the attribute. The web interface keeps the choice in `localStorage` `pl.theme` and never calls `settings-set`. A new colour token needs a dark value in both places.
- **Start-up:** handles `open-file` (Finder, `open -a`, Alfred), the single-instance lock, and window creation.
- **`headless()`:** the `--run` mode. It reads input files from the live folder while it waits.

### Launch options

`src/options.js` is the one place that knows the options and their defaults. `normaliseOptions(o)` fills in defaults,
validates every field and throws on unknown fields or bad values. Numbers may arrive as strings (UI selects). Adding an
option means: a default and a check in `options.js`, then a flag (or just the `--options` file), a control in the UI,
and a line in the guides. The shape:

```
{ expose: 'manifest'|'both'|'1.2'|'2004'|'none', depth: 0–5, opener, resume, caught (bool), auto (s, 0 = until stopped),
  wait (s, headless runs), profile: 'generic' | preset name | { base?, notes?, …profile fields } (see LMS profiles), browser: 'chromium'|'webkit', viewport: null | { width, height, deviceScaleFactor, mobile, touch, userAgent } (a preset name or 'WxH' is accepted and returned in full),
  files: { path: { content } | { base64 } },
  pins: [{ path, value (JSON), frames: 'content'|'all', mode: 'force' } | { path, frames, mode: 'watch' }],
  responses: [{ match, method?, status, headers, body }], launchParams: 'a=1&b=2', storage: 'normal'|'blocked'|'partitioned' (see Storage), trace: false,
  macro: [{ t (ms), type: 'click'|'move'|'wheel'|'key'|'text'|'wait', x, y, dy, key, text, ms, milestone, quiet, timeout }] (see Save and resume) }
```

The UI keeps the remembered launch options (the ones listed in the [user guide](guide/run-settings.md#remembered-between-sessions)) in localStorage under `pl.launch`; in the web interface that is per browser. The docs panel's state is under `pl.docs`.

`launchItem` takes `{ item, cmi?, ...options }`, normalises the options and saves them in `launch.options` (the older
`launch` fields stay for version 1 readers). The CLI merges the `--options` file and then the flags, normalises, and
writes the result to the job file as `options`; the headless run normalises it again. `cliCommand(options, { zip, item })`
builds the line for **Copy as CLI command**; fields without a flag become `--options options.json`. Pins and responses get `--pin` and `--answer` when the flag can say everything in them (`frames: 'content'`, no method or headers), and `--options options.json` when not.

### Handlers

| Name | Argument | Returns |
|---|---|---|
| `open-package` | — | Package info (desktop only: opens a dialog) |
| `open-path` | `{ path }` | Package info (desktop only). A .zip dropped on the window: `path` is checked to be a string, resolved, and must end in `.zip` (case-insensitive) and be an existing regular file. Otherwise it throws with the reason. Then `openPath`, as the Finder's Open With does |
| `export-report` | `{ run, redact }` | `{ file }` after a save dialog, or `{ cancelled }` (desktop only) |
| `report-html` | `{ run, redact }` | `{ name, html }`: a run's report, for the web download (`lab.report` in the bridge) |
| `state` | — | `{ pkg, runs, running, web }`: everything a new client needs |
| `boot` | `{ item }` | The boot graph for a manifest item index |
| `launch` | `{ item, cmi?, …launch options }` (flat; unknown options throw) | `true` |
| `options` | `{ item?, …launch options }` | `{ options, command }`: the normalised options and the equivalent `package-lab run` line |
| `docs` | — | The bundled docs (the entries of `DOCS`) |
| `doc` | `{ name }` | The Markdown of one bundled doc. Only names in `DOCS` are served; others are refused |
| `reference` | `{ url, caught, auto }` | `true` |
| `files` | — | Every file of the package (and added override paths): `[{ path, size, text, overridden }]` |
| `file` | `{ path }` | `{ path, size, text, tooBig, overridden, content, original }`. `content` is the text (the override if there is one), `null` for binary or over 1 MB; `original` the unchanged text when overridden |
| `override-set` | `{ path, content }` or `{ path, base64 }` | The overrides list. Setting a file to exactly its original removes the override |
| `override-revert` | `{ path? }` | The overrides list; no path reverts all |
| `override-diff` | `{ path }` | `{ binary: false, diff (unified), added }` or `{ binary: true, before, after }` |
| `experiment-presets` | — | The preset names |
| `profiles` | — | The LMS profile presets: `{ name: { …fields, notes, sources, approximation } }` |
| `experiment-start` | `{ item, preset? (default `standard`), variants?, …launch options (the base) }` | The variant names, at once; progress comes as `experiment` events. Throws if a run or experiment is under way |
| `experiment-stop` | — | `true`: stops the run in progress and the rest of the experiment (or discovery) |
| `discover-start` | `{ item, request?, rounds? (1–10, default 5), …launch options (every run's) }` | `true`, at once; progress comes as `discover` events. Throws on bad rounds or pattern, or if a run, experiment or discovery is under way |
| `discover-stop` | — | `true`: stops the run in progress and the rest of the discovery |
| `drill-start` | `{ run }` (a run id) | `true`, at once; progress comes as `drill` events (see [The drill-down](#the-drill-down)). Throws if the run isn't a package run, its package isn't the one open, or a run, experiment, discovery or drill-down is under way |
| `drill-stop` | — | `true`: stops the run in progress and the rest of the drill-down |
| `stop` | — | The run's id, or null |
| `compare` | `{ ref, run }` | `{ cmp, findings }` |
| `compare-packages` | — | The `comparePackages` result for the open package (A) against a chosen one (B); `null` if cancelled (desktop only: opens a dialog; web clients upload with `role=compare` instead) |
| `open-run` | — | Run summaries (desktop only: opens a dialog) |
| `saved-runs` | — | `[{ file, size, mtime }]` from the runs folder |
| `load-run` | `{ file }` | `[run summary]`. The name is reduced to a base name in the runs folder |
| `code-view` | `{ run?, path, line?, col?, mode?, source? }` | The shared code view's data for one file (see [Code views](#code-views-p41)): `{ path, kind, mode, modes, later, text, target, cov, covNote, marks, source, sources, note, minified }`, or `{ path, empty: true }` when the text isn't available. With no run, the open package's file (a changed file as changed) |
| `source` | `{ run, url }` or `{ run, path }` | A script's source from a run, by address; or by package path (the Execution view): the script as recorded, or for a page, the file the run was served (its changed file, or the open package's if it is that package), else `''` |
| `live-input` | an input event | `true` if delivered |
| `live-watch` | `{ on }` | Desktop only. The number of watchers. The desktop UI's Live view calls it with `on: true` while it is shown, `false` after |
| `live-hit` | `{ x, y }` (0–1 across the run window) | `{ sel, text, role }` of the element there (the probe's `__labHit`, through `HIT`), or `null`. `x` and `y` are clamped to numbers before they go in the expression; the strings are cut to 300, 60 and 40 characters |
| `macro-record` | `{ on? }` (default true) | Whether recording is on. Turning it on clears what was recorded |
| `macro-save` | — | `{ events, viewport }`: the recorded events as a checked macro, and the content size of the window at the first one; recording stops |
| `macro-from-run` | `{ run }` | `{ events, viewport }`: the macro made from the `input` reports the probe saw in that run, and `trace.window` (or null) |
| `macro-edit` | `{ events, viewport?, op?, i?, ms?, dir?, wait?, patch? }` | The macro editor's one edit (`edit` in `src/macros.js`; `op` is `delay`, `move`, `remove`, `wait`, `set` or `none`): `{ events, rows, steps }`, the checked list, the table's rows (`macroRows`) and the milestone ids a wait can name. A bad value throws the message `normaliseOptions` gives |
| `macro-play` | `{ events, from?, to? }` | Plays `events[from, to)` into the running course with `playMacro` and returns at once. Refused with "Launch first" when nothing runs, and while another macro plays (`active.playing`, which the launch's own macro sets too). A part played from the middle starts at once |
| `macro-list`, `macro-load`, `macro-store`, `macro-delete` | `{ name?, events?, viewport? }` | Named macros of the open package, in `<data folder>/macros/<package id>/<name>.json` as version 2 files (the file is `JSON.stringify(macroFile(events, viewport))`, so a saved list is byte for byte what `macroFile` makes). The package id is the package's file name with anything but letters, digits, dot, dash and underscore made `_`: the same name the runs list groups by (`run.package`). `macroName` checks the name (1 to 60 characters of `[\w .-]`, no leading dot) and the resolved path must stay inside the package's folder. `macro-list` gives `[{ name, size, steps }]` |
| `macro-file`, `macro-parse` | `{ events, viewport }` · `{ text }` | The web interface's Export and Import: the version 2 file object to download, and `readMacro` of a file's text. The desktop app's `macro-export` and `macro-import` use the save and open dialogs instead (desktop only) |
| `cycle-start` | `{ item, macroSize?, …launch options (the macro too) }` | `true`, at once; progress comes as `cycle` events (see [Save and resume](#save-and-resume-p24)). Throws in WebKit, or if a run, experiment, discovery or drill-down is under way |
| `cycle-stop` | — | `true`: stops the run in progress and the rest of the cycle |
| `settings` | — | The settings, as `readSettings` returns them (desktop only, in `DESKTOP_ONLY`) |
| `settings-set` | `{ port }` | `{ settings, free }`: the saved settings and whether the port was free. A bad port is refused (desktop only) |

Package info is `{ name, loaded, analysis, overrides: [{ path, size, binary, added }], findings, items: [{ index, title, type, depth, href }] }`. A run summary is
the run without script sources and raw coverage, with `boot.nodes` already matched against the run (`bootRun`). It also has `verdict` (`runVerdict(milestones, findings)`, E2.4: `{ sev, text }`, `null` when the run has no milestones), which the Findings banner shows; the interfaces can't import `src/`, so the verdict comes through here, as the milestones and findings do.

## Serving the package: lab://

**What the content sees is https.** In every browser the content loads `https://lms.lab.invalid/…` (the LMS) and
`https://cdn.content.invalid/…` (another origin), so `location.href`, `location.protocol` and `isSecureContext` are those of
a real https LMS. In Electron the `lab` partition handles `https` (`main.js`): those two hosts are served as `lab://run` and
`lab://content` by the code below, any other https address goes to the network (`net.fetch` with
`bypassCustomProtocolHandlers`). The trace, the findings and the UI keep the `lab://` form (`toLab` in `launch.js`, applied by
`Recorder.onEvent` to each CDP event, to the coverage and sources, and to the blocked-lookup frame), so saved runs from before
the change still load. The paths below are the `lab://` names.

`lab://` is registered as privileged (standard, secure, fetch, CORS, stream) and handled on the `lab` session
partition only.

- `lab://run/pkg/<path>`: a file from the ZIP in memory, with its MIME type and `Range` support (for media). A
  missing file is a plain-text 404, so failed requests are visible.
- `lab://run/__lab/<file>`: the host files, and `config.json` (the launch settings).
- `lab://content/pkg/<path>`: the same package files on another origin, for a profile with `contentOrigin: 'other'`
  (P2.1). `__lab/` is served only on `run`, the LMS's origin. Requests from content there to its server root are
  `lab://content/…`; the rules treat both hosts alike.
- Package files (`pkg/` on either host) carry the run's profile's `headers`, and its `csp` as
  `Content-Security-Policy`.
- In a traced run (`options.trace`), `.js`, `.mjs`, `.html` and `.htm` files under `pkg/` are served instrumented: see
  [The execution trace](#the-execution-trace).
- Any other path, such as `lab://run/api/…`, is a 404. This is how content asking for server-root paths shows up:
  `rules.js` reports requests to `lab://run/` outside `pkg/` and `__lab/`.

Content runs sandboxed with context isolation, without Node.

## The test LMS

`host.js` reads `config.json`:

```
{ expose: '1.2' | '2004' | 'both' | 'none', depth, opener (the profile's launch is popup), launch (URL), cmi,
  frames: { depth, kind, sandbox, allow }, popupDelay, apiDelay, apiAt,
  runtime: { … from the manifest item, limits, commit, slowMs } }
```

On `host.html` it makes the API objects with `scormRuntime` (`scorm-runtime.js`, copied from toolbox: full data models,
error codes and validation for 1.2 and 2004; Package Lab added the profile's `limits`, `commit` and `slowMs`). It puts
them, after `apiDelay` ms, on the window `apiAt` names, as `API` and `API_1484_11`: 0 is `host.html` itself, n is the
LMS frame `wrap.html#n`, n frames above the content (`wrap.html#1` is its parent). The objects stay `host.html`'s, so
its log reports every call wherever they are; `wrap.html#n` asks for them with `__labPlace(window)` on `host.html` (its
`top`, or its `top.opener` in a popup). Then it frames the content through `wrap.html#<depth>` (each `wrap.html#n`,
which runs `host.js` too, frames `wrap.html#<n-1>`, and `wrap.html#1` the content), or after `popupDelay` opens the
first of those (or the content) with `window.open`. The window is opened at `about:blank`, and the page goes on to the
address only when `main.js` calls `window.__labPopupReady()` on it, once the popup's recorder is attached (see
[Popups](#the-recorder)). With `frames.kind: 'frameset'` each level is a `frame` in a
`frameset` that replaces the page's body; otherwise an `iframe` with `allow`, and the content's own iframe gets
`sandbox` when there is one. Every call is reported
through `__labReport` as `{ type: 'api', version, call, el, value, result, err, diag }`. `window.__labCmi()` returns
the stored values; `finish()` reads it.

## LMS profiles

`src/profiles.js` (P2.1) is pure. A profile has these fields (the values are the `generic` preset, Package Lab's own test
LMS):

```js
{ contentOrigin: 'same' | 'other',                 // lab://run/pkg/ or lab://content/pkg/
  frames: { depth: 0–5, kind: 'iframe' | 'frameset', sandbox: null | 'allow-scripts …', allow: 'fullscreen; autoplay' },
  launch: 'frame' | 'popup', popupDelay: 0,        // ms, 0–60000 like every delay
  launchParams: '',                                // query text; {scoid}, {attempt}, {learner} filled in (fillParams)
  apiDelay: 0, apiWhere: 'top' | 'parent' | 'opener',
  csp: null | text, headers: { name: text },       // on package responses
  commit: 'ok' | 'fail' | 'slow', slowMs: 0,
  limits: { suspend12: null | n, suspend2004: null | n },   // null: the standard's (4,096; 64,000, or 4,000 in 2004 2nd edition)
  cookies: 'normal' | 'third-party-blocked' }      // third-party-blocked blocks storage in content frames (see Storage)
```

A preset adds `notes`, `sources` (URLs of the public documents used) and `approximation` (true for every preset but
`generic`). The launch option `profile` is a preset name or a custom object `{ base?, notes?, …fields }` whose fields
go over the base's (default `generic`); `frames` and `limits` may be partial. `checkProfile(v)` validates and
normalises the option (unknown fields throw; `'none'`, the option's value before P2.1, becomes `'generic'`).
`resolveProfile(v)` gives every field, with `name` (the preset, `<base> (changed)` or `custom`). `launchProfile(options)`
resolves it with the older options on top (`depth` when not 0; `opener` makes it a popup with the API on the opener)
and throws when fields don't fit together (opener without popup; a popup with the API on its top or parent but no
frame; a frameset with sandbox or allow); `normaliseOptions` calls it, so a bad combination never reaches a run.
`apiAt(profile)` is where the test LMS puts the API (see [The test LMS](#the-test-lms)).

`launchItem` (main.js) uses the resolved profile for the content's address, the launch parameters (the manifest's, the
profile's, then `launchParams`), `config.json`, and the headers; it saves it as `launch.profile`, and its name goes in
the run's label when it isn't generic.

**Content on another origin.** `lab://content` is another origin (and site) than `lab://run`, so Chromium puts the
content in an out-of-process frame; the recorder auto-attaches to it like any frame, so its probe, scripts and
requests are recorded. The content's lookups of `parent.API` (or `top`, `opener`) throw a `SecurityError` before any
accessor on the LMS window runs, so the probe there can't see them: the recorder does (see [The recorder](#the-recorder))
and records `lookup-blocked`. The probe's API accessor on the LMS window is therefore never reached by a blocked lookup;
it behaves as before for same-origin frames, and `host.html` still logs every call it gets. A sandbox without
`allow-same-origin` gives the content the origin `null` (the probe's `frame` report has `origin`), with the same
refusals. `originFindings(probe, profile)` in `rules.js` makes the two findings.

**Adding a profile.** Add an entry to `PROFILES` in `profiles.js` with `preset(notes, sources, fields)`: `fields` are
only the ones that differ from generic; `notes` say what the values are based on and which were left at generic
because the documents don't say; `sources` are the public URLs used. The `lms` experiment preset, the UI list and the
CLI pick it up by themselves. The unit tests check that every preset validates, fits together and has sources (while
the presets' research is pending, `PRESET_SOURCES_PENDING` in `test/test.js` skips the sources check). A new field
needs: its value in `GENERIC`, a check in `check`, its use in `launchItem` or `host.js`, a line in the UI's `PF`
list (`app.js`), and the user guide's table.

**Storage (P2.2).** `options.storage` is `normal`, `blocked` or `partitioned`. `storageMode(options)` (`profiles.js`) is
the mode a run uses: `normal` means "as the profile says", so a profile whose `cookies` is `third-party-blocked` gives
`blocked`; an explicit `partitioned` or `blocked` wins. `launchItem` saves it as `launch.storage` (new; `launch.options.storage`
is the option as given), passes it to `begin`, and the run's label says it when it isn't normal.
- **blocked:** the recorder puts `globalThis.__labStorage = 'blocked'` ahead of the probe (`storagePrefix`). The probe
  reads and deletes it, and, in content frames only (not Package Lab's `lab://run/__lab/` pages), defines accessors that
  throw `DOMException('The operation is insecure.', 'SecurityError')` for `window.localStorage` and `sessionStorage`
  (Safari's refusal), on `Document.prototype.cookie` (reads `''`, writes ignored) and replaces `IDBFactory.prototype.open`
  with a function returning a stand-in request whose `error` is that `SecurityError`, fired to `onerror` and error
  listeners in a microtask. Each use is a `storage-blocked` report. Workers aren't covered (the probe isn't in them).
- **partitioned:** `begin` calls `session.fromPartition('lab').clearStorageData()` before the run. The run window's
  partition is one in-memory partition, so with `normal` storage lasts from run to run while the app is open, and is
  shared by every package (all are `lab://run/`); a headless CLI run starts from nothing anyway. A browser's partitioned
  storage also keys storage by the top-level site; the run window has one top site, so the difference you can see is the
  empty start. Nothing is refused.
- `storageFindings(trace)` in `rules.js` (called from `runFindings` for package runs) makes "The content needs storage the
  browser can block" from the `storage-blocked` reports; `experimentFindings` makes "With storage blocked, the content gets less far".

### Adding a profile

A preset is one entry in `PROFILES` (`src/profiles.js`). To add one:

1. Copy the `generic` entry and change only what its public documents say. Give it `notes` (what the LMS does and what
   is unknown), `sources` (the URLs read, never a query with package content), and `approximation: true`. A field the
   documents don't cover keeps its `generic` value, and the notes say so.
2. Nothing else lists the names in code. `PROFILE_NAMES` is read from `PROFILES` by the `--profile` completion, by
   `doctor --json` (its `profiles`), by the `lms` experiment preset, and by the **Profile** list in the apps (which adds
   "(approximation)" to a preset that has the flag).
3. Update the text that lists the names by hand: the `--profile` line of the help in `bin/package-lab.js`, the profile
   paragraph in `docs/guide/run-settings.md`, and the `--profile` line in `docs/cli.md`.
4. Add a unit check if the preset has a combination `launchProfile` must refuse (for example a frameset with a sandbox),
   and run `node test/test.js --unit`.

The `lms` experiment then includes it, so `package-lab experiment course.zip --preset lms` shows how it compares.

## Vendored libraries

Two libraries are copied into `src/vendor/`, unchanged except for their file names, and each has its licence beside it:

- **acorn 8.19.0**, the JavaScript parser. `src/vendor/acorn.js` is `dist/acorn.mjs` from the npm package. The execution
  trace (`src/instrument.js`) and the drill-down (`src/drilldown.js`) use it to find decision points and operands.
  Licence: `acorn.LICENSE` (MIT).
- **js-beautify 2.0.3**, the formatter for JavaScript, CSS and HTML. `src/vendor/beautifier.cjs` is
  `js/lib/beautifier.js` from the npm package, saved as `.cjs` because `package.json` sets `"type": "module"`. The code
  views (`src/format.js`) use it. Licence: `js-beautify.LICENSE` (MIT).

To update one, unpack its npm package into an empty folder outside the repo (`npm pack <name>@<version>`, then `tar`),
copy the file above over the vendored one, keep the licence, change the version in the [Layout](#layout) and the
comment at the top of the file, and run the tests. `test/codeview.js` covers formatting and source maps, and the
drill-down and trace checks in `test/test.js` run acorn.

## The probe

`host/probe.js` is added to every frame before its own scripts (`Page.addScriptToEvaluateOnNewDocument`, on every
auto-attached target too). It reports through the `__labReport` binding:

| Report | When |
|---|---|
| `{ type: 'frame', depth, topReachable, opener, referrer, origin }` | Once per frame. `origin` is `'null'` in a frame sandboxed without `allow-same-origin` |
| `{ type: 'lookup', name, found, n, stack }` | Each read of `window.API` or `window.API_1484_11` (an accessor property). Throttled to the first three per call site, then every hundredth, because content polls |
| `{ type: 'assign', name, kind, keys, stack }` | Each assignment to those names |
| `{ type: 'lookup-blocked', name, frame, stack, uncaught }` | Made by the recorder, not the probe (P2.1): a read of a property of another origin's window that the browser refused. `name` is read from the code at the throwing position (`w.API`, `w["API"]`; `''` if it can't be), `frame` is the address of the frame that tried, `stack` lines are `fn (url:line:col)` |
| `{ type: 'storage-blocked', what, n, stack }` | From the probe in a run with storage blocked (P2.2), in content frames only: a refused use of `localStorage`, `sessionStorage`, `document.cookie (read)`, `document.cookie (write)` or `indexedDB.open` (`what`). Throttled like lookups |
| `{ type: 'api', …, host: true }` | Calls to an API object the probe wrapped: one on a real LMS (references), or content's own object in a package run |
| `{ type: 'pin-read', path, n, stack }` | Each read of a pinned value (an accessor property). Throttled like lookups |
| `{ type: 'pin-write', path, value, n, stack }` | Each assignment to a pinned name; the pin ignores it. `value` is a short text preview |
| `{ type: 'watch-read', path, n, stack }`, `{ type: 'watch-write', path, value, n, stack }` | A watch pin (P1.5): each read and write of the watched value, which passes through unchanged. Throttled like lookups |
| `{ type: 'pin-failed', path, error }` | The pin couldn't be defined: a frozen object, a name the browser won't redefine |
| `{ type: 'shape', url, path, use, n, stack }` | From `shape-probe.js`, only in runs that answer with `@probe`: a read of `path` (dotted, from the top of the response) in the response from `url` (`use: 'read'`), or how a missing value was used: `in`, `keys`, `array` (iterated, `length`, an array method called), `string` (a string method called, or turned into a string), `number` (turned into a number), `text` (`+` or `==`). Throttled like lookups per path, use and call site; at most 3,000 per frame |
| `{ type: 'exec', events, wrapped }` | From `trace-probe.js`, in traced runs only: a batch of execution trace events. The recorder puts these in `trace.exec`, not `trace.probe` |
| `{ type: 'timers', raf, sites, list }` | From the timer hooks (not in Package Lab's host pages): a summary of `setTimeout` and `setInterval` per kind and call site. `list` is `[kind, delay, created, fired, cleared, msSinceLastRun]` and `sites[i]` is the caller's stack line for `list[i]`. `raf` counts `requestAnimationFrame` calls. At most once a second for the first 30, then every 5 s, and when the page hides or the recorder stops. The recorder's own `t` is when it arrived; the last one of a frame is the state at the end |
| `{ type: 'listener', id, stack }`, `{ type: 'msg-run', id, n }` | A `message` listener (a function, on a window) registered, and each run of it (the first five of each, then every hundredth). `id` is per frame |
| `{ type: 'post', to, shape, origin, n, stack }` | A `postMessage` call, reported by the realm of the window it was called on, so `to` is that window's URL (empty for another origin, where it can't be read). `shape` is `{ kind, value? }` for a primitive, `{ kind: 'array' }`, `{ kind: 'object' }` (a class instance or other non-plain object), or `{ kind: 'object', keys (first 5), vals }` for a plain object (read by descriptor, no getters), where `vals` has only numbers, booleans and strings of 80 characters or less; every stored string (keys, origin, kind) is cut at 80 characters. Residual: a `Proxy` can't be told from an object, so its `getPrototypeOf` trap (and `ownKeys`, if it looks plain) runs when it is inspected. Throttled per target and shape (the first 10, then every hundredth; at most 200 distinct kinds per frame, then none) |
| `{ type: 'input', kind, x, y, key, text }` | P2.4, content frames only: a trusted `pointerdown` (left button; `kind: 'click'`, `x` and `y` 0–1 across the top frame, the frames' offsets added up where they can be reached), a `keydown` of a named key (`kind: 'key'`, `key` in the names `live-input` takes) or an `input` event with text (`kind: 'text'`). A click whose frames can't all be reached (another origin) has `approx: true`; any other click has `target` (E1.2): `window.__labSel(el)`, `{ sel, text, role, frame? }`, or none when it can't be described within the macro's limits. Text is reported only when the run has `recordInput` (the probe prefix `window.__labText`), and for a target (`composedPath()[0]`) that is a password field or has `autocomplete` `current-password`, `new-password`, `cc-…` or `one-time-code` it is `{ kind: 'text', length, redacted: true }`, and its `keydown`s aren't reported at all. At most 2,000 per frame. `macroFromTrace` (`src/cycle.js`) turns them into macro events |
| `{ type: 'unload', event, listeners, props }` | P2.4, content frames only: once, when the first of `beforeunload`, `pagehide` and `unload` reaches the window (a capture listener, added first). `listeners` counts the listeners the content added on its window for each of the three (by the `addEventListener` hook); `props` lists the `on…` handlers it has (also those of `<body onunload>`). Later ones aren't reported: a page that is going away may not get a report out |
| `{ type: 'cmi-now', values }` | From the test LMS's page (`host.js`), only when the page's config has `snapshots` (a run that will leave like a learner: `launchItem` sets it from `leave`), after each call that can change the data model (`SetValue`, `Commit`, `Finish`, `Terminate`): at most every 250 ms, and at once once the page is hiding. The recorder keeps only the last as `lastCmi` and does not put it in `trace.probe`; WebKit never gets them |
| `{ type: 'leave' }`, `{ type: 'dialog', kind, message, leaving }`, `{ type: 'macro-skipped', count, message }`, `{ type: 'macro-anchor', event, found, used }`, `{ type: 'macro-size', recorded, used }`, `{ type: 'macro-wait', event, waited, for }` | Made by the main process through the recorder, not by the probe. `leave`: where the learner-style leave starts (`cycle.js` reads the unload reports and API calls after the last one). `dialog`: a JavaScript dialog opened (a `beforeunload` prompt is accepted only while `leaving`; otherwise it is left as before). `macro-skipped`: approximate clicks a macro didn't replay. `macro-anchor` (`{ event, found, used: 'position' }`, 0-based `event`; `found` is 0 or the number of matches): a click with a `target` whose element wasn't found, so it used its position; `runFindings` sums them into one info finding |
| `{ type: 'dom', readyState, text, sample, visible, media, frames, loader, hidden, elements, w, h }` | What the frame shows. Sent at DOMContentLoaded, load, page hide, and 1–60 s after start, only when it changes. Not sent from Package Lab's host pages |

The recorder adds `t` (ms since start), `sid` and `frame` (the frame's URL). Its `t` and `sid` win over any the
report carries (the test LMS's API calls carry `Date.now()`, which used to make milestone times absolute).

The timer, listener and `postMessage` hooks (P1.6) replace `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`,
`requestAnimationFrame` and `postMessage` on the window, and `EventTarget.prototype.addEventListener` and
`removeEventListener`, with `Proxy` objects that call the original with the same `this` and arguments and give back its
result. Timer and `message` callbacks are wrapped (only to count runs); a string callback is passed as it is, and a
wrapped listener is remembered so `removeEventListener` finds it. `Function.prototype.toString` is hooked too, so a wrapper reports the text of what it stands for (`String(setTimeout)` is unchanged). A stack is taken for the first 50 timers of each kind and every 20th after that; the others count against the last site. Listener ids are unique per frame; only the first 100 are reported. The caller is the first stack line after the probe's
own anonymous frames. `window.__labFlushT()` sends the timer summary now; the recorder calls it, with `__labFlush`, as a
run stops.

## The recorder

`Recorder` (`src/recorder.js`) attaches the Chrome DevTools Protocol to a window's `webContents.debugger`. It
auto-attaches to every frame and worker target (flattened, paused until set up, so nothing is missed); popups get a recorder of their own (below). For each
session it enables:

| Domain | Records |
|---|---|
| Runtime | The `__labReport` binding, console output, uncaught exceptions |
| Debugger | Every parsed script, with the stack that loaded it. Pauses on all exceptions (only uncaught ones with `caught: false`) and resumes at once, to record caught errors and blocked lookups: a `SecurityError` "Blocked a frame…" in a script with an address becomes a `lookup-blocked` probe report, with the frame's address read with `evaluateOnCallFrame` and the property's name from the script's source (`nameAt`). The exception's message at that point doesn't name the property; the "Failed to read a named property" text is only added when it is reported as uncaught |
| Network | Requests with their initiator and outcome |
| Log | Browser messages (CSP, mixed content, MIME type) |
| Profiler | Precise block coverage with call counts |
| Page | Navigations, and adds the probe (ahead of it, the run's pins, `shape-probe.js` with its patterns if a response is `@probe`, and `trace-probe.js` in a traced run) |
| Fetch | Only when the run has `responses`: every request is paused; those a response matches are fulfilled, the rest continue |
| Emulation | With a `navigator.userAgent` pin or a device size: `setUserAgentOverride` (the pin wins). With a device size, on the page only: `setDeviceMetricsOverride` and `setTouchEmulationEnabled` |

**Popups.** A window the test LMS opens (a profile with `launch: popup`, or `--window`) or the content opens gets its
own `Recorder` (`watchPopups` in `main.js`), merged into the run's trace at the end with its times moved onto the run's
clock (`shiftTimes`) and `sid`s prefixed `popup:`. Chromium doesn't auto-attach a page's session to its popups, and the
debugger can only be attached after the window exists, so a popup that starts loading at once is half loaded before
the recorder is there: its requests and probe are missed (the launch page then looked "never requested"). The test LMS
therefore opens its popup at `about:blank` and loads the content when `watchPopups` has attached the recorder and calls
`window.__labPopupReady()` on the opener (`host.js`). A window the *content* opens by itself is still recorded from the
moment the debugger attaches. (ponytail: a popup the content opens with a URL can miss its first requests.)

`stop()` takes coverage and script sources from every session still open (in a traced run, it first asks every frame
of every session to send its pending trace events: `Runtime.evaluate` with `silent`, so a cross-origin frame's refusal
isn't recorded as a caught error). The lists are capped (5,000 scripts,
10,000 requests…); `truncated` says which overflowed.

## Save and resume (P2.4)

`src/cycle.js` is pure: `readMacro`, `macroFile`, `macroDelays`, `quietFor`, `withMacroSize`, `macroFromTrace`, `resumeOptions`, `cycleFindings`, `cycleRows` (and `summarise`, what
one run did, from its `api` and `unload` probe reports). `main.js`, the CLI and the apps run the two launches.

**Macros.** `options.macro` is `[{ t, type, … }]` (see the [CLI guide](cli.md#macros) for the events); `normaliseOptions`
checks every event and sorts by `t`, with caps (2,000 events, 100 KB of text, `t` within an hour). `launchItem` plays
it with `playMacro(a, events, from = 0, to)` (`main.js`), one async function: each event is `live.input(e, true)` after
the sleep `macroDelays(events)` gives (the gap since the event before; the first, its own `t`), through the same code as
the live view (to the newest window of the run, with `sendInputEvent`), as long as the same run is still active. The player
keeps to a clock (each event is due at the start plus the delays added up, reset after a wait) so timers' lateness doesn't
add up. An `approx` click is skipped. A `wait` event blocks in `waitMet`, checked every 250 ms until `timeout` (default
30 s; `ms` waits just sleep): `text` is a `Runtime.evaluate` in every attached session of the run's recorders (`rec.sessions`),
walking `document` and the same-origin `iframe`/`frame` `contentDocument`s (nothing is thrown, so nothing is recorded as a
caught error); `milestone` is `milestones(rec.trace, boot)` and its `reached`; `quiet` is `quietFor(rec.req values, rec.t())`
(no pending request, and the last one ended that long ago). On timeout the player pushes `{ type: 'macro-wait', event: i
(0-based), waited, for: { text } | { milestone } | { quiet } }` and stops; `runFindings` turns it into a warning, and
`redact.js` cuts `for.text`. `from` and `to` are for playing part of a macro (the macro editor). `launchItem` also takes
`macroSize` (`{ width, height }`: a macro file's `viewport`; the headless job's `macroSize` is the same): `withMacroSize` sets
the run's `viewport` to it when the run has none, or returns a `macro-size` note when the run's own size differs, which
`launchItem` pushes into the trace and `runFindings` turns into an info finding. The CLI and the UI also set `viewport` from
the macro in the options they build, so the options JSON and the CLI line show it. `live.input` also records its events
(with `t` from the start of the run) while `macro.recording` is on: the `macro-record` handler starts it and `macro-save`
stops it and returns them with the window's content size at the first one (`macro.viewport`). `Recorder.setWindow` keeps
`trace.window = { width, height }`, the run window's content size at the start and after each resize (the last value stays);
`macro-from-run` returns it as the macro's `viewport`.

**Targets (E1.2).** The probe (content frames only, never `ownHost`) defines `window.__labSel(el)` (the selector rules: a unique
non-generated `#id`, else a unique `[data-testid]`, `[aria-label]` or `[name]`, else a `tag:nth-of-type()` path of at most 6 steps
up to the nearest such anchor; `frame` is found by walking `parent.frames`, and an element that can't be described
within the limits gives `null`) and `window.__labHit(x, y)` (0–1 across that frame's window, down through same-origin
iframes; `null` over a frame it can't enter). The top page of a run is Package Lab's own host page, which has no probe, so
main's `HIT(x, y)` walks down from it to the first frame that has `__labHit` and asks that; `live.input` uses it to add
`target` to a recorded click once the page answers (checked with `cleanTarget`, since the page's own script could replace
the function). `playMacro` runs `FIND(target)` through `webContents.executeJavaScript` on the window the click goes to:
walk `frames[i]` from the top, `querySelectorAll(sel)`, and for exactly one visible match scroll it to the middle and return the
centre as 0–1 across the window with the frames' offsets added; otherwise `{ found }` and the click uses `x` and `y`.
`live-hit` (E4.1) uses `HIT` as it is. The interface keeps the macro (`st.macro = { events, viewport }`) with its other options and sends it with every
launch, as it does pins; `macro-from-run` returns the macro for a run made from its `input` reports. Macros and
the cycle are refused in WebKit (`webkitMacro`, in `main.js` and the CLI): there is no input to replay.

**Leaving.** A run started with `leave` (the cycle's first run; the job file's `close: true`) ends with
`leaveLikeLearner` before the data model is read. In a popup (window-opener profiles, or a window the content opened) the
newest window goes to `about:blank` and is destroyed. Otherwise the content is a frame of the test LMS's page and the
frame's `src` is set to `about:blank`, found by following the `wrap.html` frames down; if there is none the whole window is
navigated. The frame, not the window, because a page that is itself leaving can't report to the recorder (reports from a
page that has navigated away are lost): the LMS page stays up, takes the API calls the content's handlers make, and is
read afterwards. Only during the leave (`leaveLikeLearner` sets `recorder.leaving` and adds a `will-prevent-unload` handler to the windows) is a `beforeunload` dialog accepted and are prompts let through, so a prompt can't hold the leave; at any other time dialogs are recorded (`type: 'dialog'`) and left as before. The data model is read with `window.__labCmi()`, and if that page is gone, from the last
`cmi-now` report (`recorder.lastCmi`; only when `config.snapshots`); it ends up in `trace.cmi`, as before.

**Cycle.** `cycleStart` (handler `cycle-start`, sharing the experiment slot) runs `runToEnd(item, options, leave)`, then
`runToEnd(item, resumeOptions(options), false, run1.trace.cmi)`: the same options, no macro, `resume: true` and run 1's data.
Events `cycle`: `{ state: 'start' }`, `{ state: 'run', index, run }`, `{ state: 'done', runs, rows, findings }`, `{ state: 'error', message }`.
The CLI's `cycle` does the same with two `runPackage` calls (the first with `close`, the second with `--resume-from` the first's saved run).

**Findings.** `cycleFindings({ runs, macro })` reads each run's `type: 'api'` probe reports: the version (from
`Initialize`), the successful `SetValue`s and `GetValue`s by element (suspend data, location, status, exit, entry), whether
`Finish` or `Terminate` succeeded, and the calls after the first `unload` report. The entry the second run was offered is
read from its `trace.cmi`. Checks run in this order: nothing saved (error; stops the rest), session not ended (warning), a finished attempt (info; stops the rest), no resume offered (warning; stops the rest), place not read (error), restarted from the beginning (the first location written differs from the last one left; warning), suspend data empty or shorter than what was left (warning). With none of them, one info finding. Titles and meanings are in [findings.md](findings.md#from-a-save-and-resume-test).
`cycleRows` is the side-by-side table.

## Other browsers and device sizes (P2.3)

**Shared code.** `src/launch.js` is plain Node, imported by `main.js`, the CLI and the WebKit runner: `serveRequest`
(what the test LMS and the package serve for a path: config, host files, package files with ranges and the profile's
headers), `launchPlan` (the item, options and resume data → the test LMS's configuration, the content's address, the
headers, the label and the `launch` object), `withProgress` and `runAnalysis` (a finished run's findings and milestones),
and `savedRun`. `launchPlan` takes `origins`: `WEBKIT_ORIGINS` (`https://lms.lab.invalid`, `https://cdn.content.invalid`) for Electron and WebKit alike;
`LAB_ORIGINS` (`lab://run`, `lab://content`) is the default and only the form the trace keeps. Only `config.launch`, the address the browser loads, differs:
`launch.url` stays `lab://…` so a saved run reads the same in every browser. `recorder.js`'s `probeSource` builds the
script put into every frame (storage mode, pins, shape and trace probes, then `probe.js`), for both browsers.

**WebKit runner.** `src/webkit-runner.js` (`runWebkit`, `runJob`, and a script mode: `node webkit-runner.js job.json`)
runs in Node, never Electron. `loadPlaywright()` does `import('playwright')`; if it is missing (or `PACKAGE_LAB_NO_PLAYWRIGHT=1`),
it throws "WebKit runs need Playwright, which isn't installed here. Install it with: npm i -D playwright && npx playwright
install webkit". Playwright is an optional devDependency; nothing else imports it. What a run does:

- Launches WebKit with one context: the viewport (`options.viewport`, else 1100 × 800, the Electron window), device scale
  factor, `isMobile`, `hasTouch`, and a user agent (a pinned `navigator.userAgent`, else the device's).
- `ctx.route('**/*')` serves `https://lms.lab.invalid/` and `https://cdn.content.invalid/` from memory with `serveRequest`
  (`/pkg/` is the package with its overrides, `/__lab/` the test LMS), answers a request a response matches
  (`answerFor`, `buildAnswer`, marking the request `answered`), and lets anything else go to the network.
- `ctx.exposeBinding('__labReport')` and `ctx.addInitScript(probeSource(…))` give the probe the same channel as in
  Electron. The probe's own pages are recognised by `https://lms.lab.invalid/__lab/` as well as `lab://run/__lab/`; its
  `stack()` skips one frame fewer in WebKit, whose stack has no message line. The first blank page of a window is left out of
  the probe's reports (Electron's recorder attaches after it).
- Requests come from the context's `request`, `response` and `requestfailed` events; console, uncaught page errors,
  frame navigations and targets from each page (`ctx.on('page')`, so popups too). A window the host page opens blank
  (window-opener profiles) is sent on to the content by calling `__labPopupReady` on the opener.
- Every address in the trace is turned back into `lab://run/…` or `lab://content/…` (`toLab`, also over each probe
  report), so no finding or reader needs to know the browser. Resource types are mapped to Chromium's names (`Fetch`, `XHR`,
  `Script`…). Console errors that Chromium would also log (CSP, MIME type, failed loads) are copied to `trace.log`.
- At the end each frame flushes the probe's timer summary and the test LMS's data model is read (`trace.cmi`).

The trace has `browser: 'webkit'` and `browserVersion`, and **no** coverage, caught errors, script sources, script list,
execution events or initiator stacks (`from` is empty): those lists are present and empty. Readers cope: `rules.js`,
`diff.js` and `report.js` read `caught`, `log` and `scripts` with `?? []`; milestones, stall and drill-down read the probe,
requests and exceptions. `trace: true` (the code trace) is refused in a WebKit run. Storage `normal` and `partitioned` are
the same there (every run has a new context); `blocked` is the probe's, as in Electron.

**Who starts it.** The CLI's `runPackage` runs the script with `process.execPath` (Node) as a child, then builds the run
in-process with `launchPlan` and `runAnalysis` and writes the saved run, so `run`, `experiment`, `discover` and `report --run`
all accept `--browser webkit` (`drill` needs a trace, so it is refused). In the apps, `launchItem` calls `beginWebkit`, which writes the package to a
temp folder and starts the script with `ELECTRON_RUN_AS_NODE=1` on Electron's own binary. The job is
`{ zip, name, item, options, cmi, out, stop, ready, wait }`: `ready` is written once WebKit is up (until then a failure
becomes the launch's error), `stop` ends the run when it appears (Stop), and `out` receives `{ trace }`. `active.webkit`
stands in for the window and recorder; `finishWebkit` adds the run with `addRun`, so experiments (`runToEnd`), the Runs list
and saved runs work as for any run. (ponytail: no live view for WebKit; stream Playwright screenshots into `live` when it matters.)

**Device sizes in Electron.** The recorder applies `Emulation.setDeviceMetricsOverride` and
`setTouchEmulationEnabled` to the page (not to its frames) and the user agent to every session. `begin()` also sets the
window's content size to the viewport (and a popup's, in `watchPopups`), so `live.capture()` and `live.input()` work in the
emulated size: `frame.json` is `{ w, h }` of the device. The test LMS pages carry `<meta name="viewport" content="width=device-width, initial-scale=1">`,
as an LMS player for phones does, so a `mobile` emulation lays the content out at the device's width.

## Static analysis

`analyze(files)` (`src/analyze.js`) returns:

```
{ files, size, root, problems: [{ code, text }], fingerprints: [tool], packs, packFindings, scan: { file: { api12, api04, search, requests,
  absolute, serverPaths, hostChecks, modeSwitches, apiDefine } }, manifest, apiUse: '1.2' | '2004' | 'both' | 'none' }
```

- `parseManifest` resolves `xml:base` at the manifest, resources and resource levels. It flattens items with depth,
  resource, parameters, mastery score and the other run-time values from the manifest.
- `scanText` is a set of regular expressions over every script and page. Each list holds up to 20 `{ line, match,
  text }` per file.
- `fingerprints` is the names of the packs that recognise the package (`detectPacks`, below); `packs` is
  `[{ id, name, confidence }]` and `packFindings` the packs' static findings, which `staticFindings` returns. Text
  patterns use word boundaries, so `querySelectorAll` isn't Lectora.

## Rule packs (P3.2)

`src/packs/<tool>.js` holds what is known about one authoring tool or wrapper; `src/packs/index.js` registers them
(`PACKS`, in the order the "Made with" list shows them). The research behind each is in `docs/packs/<tool>.md`.

```js
{ id, name, detect(analysis, files) → 0..1, staticRules({ analysis, files, confidence, detected }) → [rule],
  runRules({ analysis, launch, confidence, detected }, trace) → [rule], detectRun?(trace) → 0..1, notes, sources }
```

- `detect` returns a confidence (0 is no). Any value above 0 counts as recognised and puts `name` in `fingerprints`.
  Weights: 0.8–0.9 for a marker the notes call strong, 0.6 for a usual one, 0.3 for a loose text hit. Use `score()`
  from `util.js`, which takes `[kind, regex, weight]` signals (`'name'` over file names, `'text'` over scripts and
  pages) and decodes each file once.
- `detectRun` is for a pack whose tell is in the run, not the files (Xyleme: a request to a Xyleme host). `packRun`
  runs `runRules` of detected packs and of those that `detectRun` recognises.
- A rule is `{ sev, basis, title, detail, evidence, fix }`. `basis` is `'pattern'` (a known pattern, not confirmed
  here), `'package'` (read in the package's files) or `'run'` (seen in the trace). `finish()` in `index.js` puts the
  pack's name before the title, adds the confidence sentence (`BASIS` in `util.js`) to the detail, keeps a
  `pattern` rule at `info` whatever it says, and adds `pack` and `basis` to the finding. Write titles without the
  prefix.
- The `tool` launch option (null or a pack id; validated against `PACKS`) forces a pack: `analyze(files, { tool })` adds it to
  `analysis.packs` with `chosen: true` and confidence 1, `packRun` adds it from `launch.options.tool`, and `finish()` says it was
  chosen by you. The desktop handler re-analyses the open package when a launch's `tool` differs from the analysis's; the CLI reads
  `--tool`, the options file or the saved run when it opens the ZIP.
- A saved run opened without its package keeps the pack findings it was saved with (`readRun`).
- File-name signals in `score()` count only text files under 20 MB (`'any'` is for a name that matters whatever its type, such as `.awt`).
- Static rules run once, in `analyze()`, and are kept in `analysis.packFindings`. Run rules run in
  `runFindings(trace, launch, analysis)`, which `runAnalysis` calls with the package's analysis; a saved run opened
  without its package has no analysis, so no pack run findings. Both are guarded: a pack that throws is skipped.
- Run rules read only what the recorder already captures (`util.js` has the readers: `apiCalls`, `lookups`,
  `ownApi`, `serverNeeds`, `outsideHosts`). They are pure over an analysis and a trace.

**Adding a pack.**
1. Write `docs/packs/<tool>.md` from public sources (no package content in any query): layout, config keys, known
   problems, export settings, detection hints, sources, and what is unconfirmed.
2. Write `src/packs/<tool>.js`. Use only hints the notes list. Claim `package` or `run` only for what a file or trace
   shows; everything from forum knowledge is `pattern`.
3. Import and add it to `PACKS` in `src/packs/index.js`.
4. Add a synthetic package for it to `cases` in `test/packs.js` (built from the notes' layout, never a real export)
   that triggers detection and a rule, and a hand-made trace test for any run rule.
5. List its findings in `docs/findings.md` and the notes in `docs/packs/README.md`.

## The boot graph

`bootGraph(files, launchPath)` (`src/bootpath.js`) works out how a launch page loads.

1. **Breadth first from the launch page.** For pages, `parseHtml` finds, in document order:
   - `<script src>` (with sync, defer, async or module mode), and inline scripts;
   - `<link rel=stylesheet|preload|modulepreload>`;
   - `<iframe>`, `<frame>`, `<img>`, `<object>`, `<embed>`, `<source>`;
   - `<meta refresh>`, `<base href>`, and require.js `data-main`.

   For scripts (and inline scripts), `scanScript` takes string literals that look like package files, plus
   server-style paths (`/api/x`) used by code that loads them. How each is used comes from the code just before it:
   `import`, `worker`, `request`, `src`, `navigate`, `amd` or `literal`. Literals joined to other strings are recorded
   as paths built at run time instead.
2. **Resolved the way the browser does it.** `fetch` and `src` paths in a script resolve from the document that runs
   it (and its `<base>`); `import` and workers resolve from the script. If a path is missing from the document's
   folder but exists relative to the script, the node records `scriptRelative`: a classic packaging bug.
3. **Each node gets a status:**
   - `ok`;
   - `case`, with `actual` (the file exists with other capitals);
   - `missing`, with `elsewhere` (a file with the same name exists in another folder);
   - `server`, `outside`, `local`, `remote` or `remote-http`.
4. **Risks** (findings) from the nodes and the reachable files: missing files (strong for tags, scripts and
   navigation; weaker for literals), capitals, server paths, out-of-package and local paths, mixed content, Flash,
   IE-only code, frame busting, `document.write` in deferred scripts, modules, invalid JSON.
5. **Load order.** For each page, scripts are put in execution order: sync scripts and inline in page order, then
   `defer` and module scripts, then `async`. `globals()` finds each script's top-level definitions (column-0
   declarations, `window.x =`, and known libraries: jQuery, require.js, underscore/lodash, Backbone, swfobject) and its
   immediate uses (identifiers used as objects or called in column-0 statements). A use that only a later script
   defines is an error. Minified files (very long lines) are skipped for uses, but their `window.x =` definitions count.

`bootRun(boot, trace)` adds `run: { status, failed, pending, t }` to each node, from the run's requests. It matches
`lab://run/pkg/<path>`, and `lab://run/<path>` for server paths.

## cmi5 and xAPI (P4.5)

A package is **cmi5** if `cmi5.xml` is in it (the shallowest one), **Tin Can** if it has a `tincan.xml` and no `imsmanifest.xml`,
and SCORM otherwise. `analyze` sets `analysis.format` (`'scorm' | 'cmi5' | 'tincan'`), reads the course file (`src/cmi5.js`:
`parseCmi5`, `parseTincan`; `analysis.course`) and gives it a manifest-shaped view, `analysis.manifest` with `version` and `format` set
to the format, `items` that are the AUs (`type: 'au'`, with `.au`: id, title, url, moveOn, masteryScore, launchMethod, launchParameters,
entitlementKey, activityType) or the Tin Can activities that have a `<launch>` (`type: 'activity'`), and `res` for each launch file. So
items, the launch checks, `launchPlan`, `bootFor`, the CLI's `--item` and the interfaces work as they do for SCORM; the findings
about SCORM check `analysis.format`. `formatName(analysis)` is the words for it.

**Launching.** `launchPlan` sets `expose: 'none'` (no SCORM API), `launch.format`, and adds the LRS parameters to the URL (`cmi5Query`,
`tincanQuery`). It returns `plan.lrs`, the LRS's configuration: `{ format, endpoint, token, fetchId, registration, sessionId, activityId, au,
launchUrl, actor }`. The endpoint is `<lms origin>/__lrs/`: `https://lms.lab.invalid/__lrs/` in Electron and WebKit (the saved
`launch.url` stays in `lab://` form). The learner is `learner-1`; the actor is an Agent with an `account` whose `homePage` is the LMS origin. A cmi5
AU whose `launchMethod` is OwnWindow is opened in a window, as the window-opener profile does.

**The LRS (`src/lrs.js`).** `createLrs({ ...plan.lrs, now, wall })` is pure and in memory: `handle({ method, path, search, headers (lower-case
names), body (text) })` → `{ status, headers, body }`, and `snapshot()` → the record below. `serveRequest` takes `lrs` and `req` and gives
`/__lrs/…` on the LMS origin to it; Electron's `serve` (now async, since it reads the body) and the WebKit runner's route do that, and are the only
code that differs between browsers. `now` is the run's clock (the recorder's `t()`), so statement times line up with the trace. Behaviour:
- Every response has the CORS headers (the content may be on `lab://content`), and `X-Experience-API-Version: 1.0.3`. OPTIONS is answered with 204.
- Auth: `Authorization: Basic <token>` on everything except `about` and OPTIONS; 401 otherwise (without a `WWW-Authenticate` header, which would make the
  browser ask for a password). The version header must be `1.0` or `1.0.x`; missing or other is 400 (`about` may omit it).
- cmi5: `POST <endpoint>auth/fetch/<fetchId>` returns `{ "auth-token": … }` once and `{ "error-code": "1", "error-text": … }` (status 200, as the spec
  says) after; a GET is 405. The LRS seeds the `LMS.LaunchData` state document, the `cmi5LearnerPreferences` agent profile and the LMS's own
  "launched" statement (`by: 'lms'`) before the AU is launched.
- Limits: a body over 10 MB (`MAX_BODY`; main.js and the WebKit runner refuse it before reading), more than 100 statements in a request, 2000 statements, 200 documents and 5 MB of documents are 413. CORS is answered only for the test LMS's origins. `maskTokens(trace)` replaces a Tin Can run's `auth=` values with `‹token›` in the trace's text; the saved `launch.url` is built with it already.
- Statements: PUT (needs `statementId`, a body id is optional, 204; the same statement again 204, a different one with that id 409), POST (one or a list; the ids), GET (`statementId`,
  `voidedStatementId`, or `since`, `until`, `verb`, `activity`, `registration`, `agent`, `related_*`, `limit`, `ascending`, `format=ids`; `more` is always empty).
  The LRS adds `stored`, `authority` (an account `package-lab`), `version` and a default `timestamp`. A "voided" statement hides its target. The alternate request
  syntax (a POST with `method=`) is supported. One invalid statement refuses the whole request (400) and none is stored.
- Documents: state (activityId, agent, registration, stateId), activity profile, agent profile. PUT and POST (POST merges JSON objects), GET (one document, or the ids
  with `since`), DELETE (a state's DELETE with no `stateId` clears it). Profiles need If-Match / If-None-Match to change a document that exists (409 / 412);
  state accepts them. Documents are text with their `Content-Type`, up to 200 KB.

**Validation (`xapi.js`).** `validateStatement(s)` → `[{ sev, code, path, text }]`: `error` is a MUST of xAPI 1.0.3 (the LRS refuses the statement), `warn` a SHOULD (accepted).
Texts are fixed sentences that never quote the statement, so they are safe to keep in a redacted run. For cmi5, `cmi5StatementProblems(s, launch)` (`cmi5.js`) adds the AU rules a
single statement can break (codes `cmi5-category`, `cmi5-sessionid`, `cmi5-launch`, `cmi5-id`, `cmi5-duration`, `cmi5-result`); they are recorded and the statement is accepted, since
they are cmi5's, not xAPI's. The order rules (`cmi5Order`: before-init, no-init, after-term, repeated, both) and `moveOnCheck` work over the verbs, in `timestamp` order then arrival,
and run when the findings are made.

**Findings and milestones.** `lrsFindings(trace.lrs)` (called from `runFindings`) and `lrsHits(trace.lrs)` (called from `milestones`) read only the record, never the
statements' text: a redacted run, whose text is masked but whose verbs, problem codes, timestamps and results are kept, gives the same ones. `milestones` uses `stepsFor(format)`:
`CMI5_STEPS` (`launched`, `scripts`, `shown`, `fetched`, `initialized`, `completed`, `terminated`) and `TINCAN_STEPS` (`launched`, `scripts`, `shown`, `statement`, `completion`). A run with
an LRS gets no "what it was waiting for" finding. `isLab` counts `/__lrs/` as the test LMS's own, so the LRS's 4xx answers are not "failed requests" and its paths are not "server paths".

### The LRS record (`trace.lrs`)

Added to the trace of a cmi5 or Tin Can run (absent for SCORM; no reader needs it). Saved runs carry it unchanged.

```js
trace.lrs = {
  format: 'cmi5' | 'tincan', endpoint, registration, sessionId, activityId, actor: Agent, launchUrl, tokenIssued,
  moveOn, masteryScore, launchMethod,                      // cmi5 only: the AU's, as the course file gave them ('' = none)
  fetches:   [{ t, ok }],                                  // cmi5: each request to the fetch URL (ok: it got the token)
  calls:     [{ t, method, resource, params: [name], status, auth: 'ok' | 'missing' | 'bad' | 'n/a', version, problems: [{ sev, code, text }] }],
             // resource: statements | state | activity-profile | agent-profile | about | fetch | preflight | unknown; params are the query names only (never values); no token is kept
  statements:[{ n, id, t, by: 'au' | 'lms', via: 'PUT' | 'POST', status: 'stored' | 'rejected' | 'duplicate', statement, voided?,
                problems: [{ sev: 'error' | 'warn', code, path, text }] }],   // statement as received (stored ones as stored); n counts from 1 in arrival order
  documents: [{ kind: 'state' | 'activity-profile' | 'agent-profile', id, activityId?, agent?, registration?, contentType, value (text), t, writes, by: 'au' | 'lms' }],
  truncated: bool                                          // 2000 statements, 5000 requests
}
```

Redaction (`redact.js`, `lrsRecord`): each statement keeps its keys and ids, UUIDs, timestamps, numbers, booleans, scores, `objectType`, the standard verb and category IRIs and
SCORM-like vocabulary; every other string (names, activity ids, responses, descriptions, extension values) is replaced by its length. Documents keep kind, id, type, who wrote
them and a marker for the value. The actor and activity id are masked; problem codes and texts are kept.

## The execution trace

A run with `options.trace` (P1.4) records, in order, every function of the package's scripts that starts and ends, and
every decision with its result and the values it tested. Three parts:

**Instrumenting** (`src/instrument.js`, pure). `instrument(source, { file, base, module })` parses with acorn
(`ecmaVersion: 'latest'`, `allowHashBang`; script then module, or module first for `.mjs` and `type="module"`) and
inserts calls by text position; nothing is regenerated, and no line moves:
- each function body starts `__labT(1, site);` (after its directive prologue, so `"use strict"` stays first) and ends
  `;__labT(2, site);`; `return x` becomes `return __labR(site, (x))` and a bare `return` becomes `return __labT(2, site)`
  (both return what they did); an arrow's expression body becomes `(__labT(1, site), __labR(site, (body)))`;
- each decision (the test of `if`, `? :`, `while`, `do … while` and `for`, the left of `&&`, `||` and `??`, and a
  `switch` discriminant) becomes `__labC(site, (test))`, which records it and returns the value. When both operands of a
  comparison (`===`, `!==`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `instanceof`) are simple (a name, a property, a
  literal, `typeof x`, `-1`) and nothing but the operator lies between them, it becomes `__labC(site, (a), (b), "===")`:
  the operands are evaluated once, in order, as arguments, and the comparison happens inside the call. `!x` becomes
  `__labC(site, (x), 0, "!")`, and the left of `??` is `__labC(site, (a), 0, "??")`;
- code inside `with` is left alone (the inserted names would be looked up on the with object);
- an insertion that starts with a name character after one gets a space (`return!a` must not become `return__labR`).
  Inserted text starts with a name or follows `=>`, so it never turns a line into a call on the line before;
- a `.js` file gets `PRELUDE` after its directives: do-nothing versions of the three functions where the probe isn't
  (a worker). Pages don't need it.

It returns `{ code, sites, map }`, or `{ code: source, sites: [], map: [], error }` if the file doesn't parse.
`instrumentHtml(html, { file, base })` does the same for each inline script (`inlineScripts`: not in comments, no `src`,
a JavaScript type or `module`) and adds `scripts` (each one's range) and `errors`. `map` is `[origStart, origEnd,
genStart, genEnd]` per edit; `toOrig(map, offset)` gives the original position.

**Serving** (`traceFile` in `main.js`). Files of 2 MB or less (`MAX_TRACED`) that are UTF-8 text are instrumented once
per package, path and content hash (`pkg.traced`). Site ids run on across the package's files (`pkg.sites`), so one
table serves every run of the package. Files left as they are, and why, go in `trace.untraced`.

**Page side** (`src/host/trace-probe.js`). Defines `__labT`, `__labR`, `__labC` and `__labFlush` on each frame's global
(non-enumerable, non-writable), taking the built-ins it uses before the content can replace them. Events go into a ring
of 200,000 per frame, sent through `__labReport` 250 ms after the first one, at page hide, and when the recorder stops.
The same site with the same result more than 1,000 times in a row is counted. Previews never run the content's code
(no getters, `toString` or `valueOf`); a `Proxy`'s traps do run (`getPrototypeOf`, `ownKeys`), except for
`shape-probe.js`'s, which it recognises through `__labIsShape`. `probe.js` leaves `__lab…` frames out of its stacks.

**After the run.** `finish()` adds `trace.sites` and `trace.untraced`, then `restoreTrace(trace, files)` points
everything back at the original files: frame columns (in `scripts`, `requests`, `console`, `exceptions`, `caught`) and
`probe` stacks, coverage offsets (for an inline script, from its start in the page, `scripts[].start`), and
`trace.sources`, which gets the original text (for a page, the original inline script, as untraced runs record it). So
every reader of a traced run (findings, discovery's source hints, comparisons) sees the package's own files.
`lastEvents(trace, n)` merges the batches in time order and describes each event (`describe`, `show`);
`traceFindings(trace)` gives the [tracing findings](findings.md#from-a-run-tracing) (called by `runFindings`).

The run summary the interfaces get has no `exec` or `sites`; it has `execEvents` (the count) and `execTail` (the last
500 from `lastEvents`, worked out once per run). The `source` handler takes `{ run, path }` too, for the Execution view.

`PACKAGE_LAB_FORCE_TRACE=1` makes `launchItem` trace every run: the tests use it.

## The drill-down

`src/drilldown.js` is pure (P1.5). `drill({ trace, milestones, files, launch, watch? })` takes a traced run, its
milestones, the files it was served (`overlayFiles(pkg.files, options.files)`), its `launch` (for the API version) and,
on the second call, the watch run's trace. Steps:

1. **Sources.** `programs(files)` parses every `.js`/`.mjs` file and each inline script of a page (over a copy of the
   page with everything else blanked, so positions are page positions) with the vendored acorn, keeping parent links.
2. **Dead end** (`deadEnd`). All events in time order; the end is the first event after the last reached milestone
   followed by more than 2 s without events (else the last event); the window is the last 300 events up to it, plus
   decisions within 1 s of that milestone.
3. **Key decisions.** The last event of each decision site in the window; its node is found from the site (`if` and
   `? :` by the test's start, `&&`/`||`/`??` by the left's start and text). `untakenRange` gives the other branch (for an
   `if` without `else` whose branch exits, the rest of the block); `ran()` says whether it ran: an event at a site
   inside, else V8's block coverage (the innermost range around its start; inline scripts: events only). Decisions
   inside another's test (the left of `&&` in an `if`) give their operands to it. Each has its operands (site `args`
   with their previews; `typeof x` with `'undefined'` counts as `x` undefined), the first lines of the untaken branch
   and the functions it calls whose sites never started.
4. **The chain** starts from the last key decision with an `undefined`/`null` operand or a falsy one whose origin is a
   named cause. `origin()` for an operand path: a local (`findLocal`) that is a parameter of a callback (`.then`,
   `.onload`, `$.getJSON`…) is the response to the last fetch/XHR request from that file before the decision
   (`fromResponse`: failed → cause `request`; a package JSON file → the first missing field, cause `file`; a server →
   "run Discover"); `API`/`API_1484_11` against `launch.expose` → cause `version`; otherwise the path is added to `watch`
   (if `pinPathProblem` allows it) and, with the watch run, a `watch-write` ends the chain there. Without one, the
   static `assignments(progs, path)` (assignments, top-level declarations and function declarations, object literal
   keys under a prefix, `Object.defineProperty`) that never ran are explained by `whyNotRun`: a file that never loaded
   (a failed request → cause `script`; else the string literal that names it and its guard), or the guard around the
   assignment (`guardOf`: the nearest `if`, `? :` or `&&`/`||`/`??` branch, or one hop to the first call of the named
   function around it). The guard's last decision event is explained in turn (`explain`), up to three levels. A dotted
   path nobody sets is traced through its root's assignments that ran (`fromCode`: a callback parameter, `JSON.parse`
   or `.json()`, `location.search`, `GetValue`). `globals()` from `bootpath.js` covers names a script defines that
   acorn can't see (known libraries).
5. **Result:** `{ traced, deadEnd, decisions, chain: [{ n, text, short, at?, decision?, cause?, request?, file?, field?, discover? }],
   cause, summary, watch, watched, findings }` (the `drill --json` object in [cli.md](cli.md#drill) without the CLI's
   fields). The finding's title is `Why it stopped: ` and the steps' `short` texts joined with ` ← `; `error` with a
   cause, `warn` without. `watchPins(options, paths)` adds the watch pins to a run's own.

Callers run twice: the CLI's `drill` (`runPackage`, then again with `watchPins` if `watch` isn't empty) and `drillStart`
in `main.js` (in the experiment slot; traces the run again first if it wasn't traced; `runToEnd` for each run). Events
`drill`: `{ state: 'start', run }`, `{ state: 'step', run, note }`, `{ state: 'done', run, result }` (with `traceRun` and
`watchRun`, run ids), `{ state: 'error', run, message }`. The UI keeps the latest in `st.drill` and shows it in the
**Drill-down** view for that run.

## Pins and answers

`src/pins.js` is pure. A **pin** is `{ path, value, frames, mode }` in `options.pins` (checked in `options.js`; `mode` is `'force'` or `'watch'`, `PIN_MODES` in `pins.js`). A **watch** pin (`{ path, frames, mode: 'watch' }`, no value; the drill-down adds them) records reads and writes without forcing anything: its leaf is an accessor that passes the value through (or the original accessor's getter and setter), non-enumerable if the name didn't exist until it is written. Intermediate names of dotted paths share one accessor per object and name (`hooks` in `probe.js`), so `config.a` and `config.b` both follow a new `config`, and a watch on `config` itself reports through that shared accessor; pins are installed longest path first for that. `pinFindings` ignores watch pins. The recorder puts `globalThis.__labPins = [...]` ahead of `probe.js` (`pinPrefix`, applied through `Page.addScriptToEvaluateOnNewDocument` in every page and iframe); the probe reads and deletes it, drops the pins whose `frames` doesn't cover this frame (`'content'` excludes Package Lab's own `lab://run/__lab/` pages) and installs each one. A top-level name becomes an accessor on `window`: the getter returns the value and reports `pin-read`, the setter ignores the assignment and reports `pin-write`, so `var x = …` at the top of a classic script assigns through it. A dotted path is an accessor on the root that, when given an object, installs the next segment on that object, and so on; a frozen object makes `defineProperty` throw, which is reported as `pin-failed`. The accessors are `configurable: true` (the plan said `false`) so that a top-level `let` or `const` in the content creates its own binding instead of a SyntaxError that would stop the whole script; `pinFindings` then recognises that case (the pin was never read or written, and `lexicalDeclaration` finds a column-0 `let`/`const` of the root name in `trace.sources`) and says so. Inline scripts count only if the browser recorded them under their page's URL; a `let` inside a function or an indented block isn't a global and isn't matched. `navigator.userAgent` is the exception: `userAgentPin` gives the value, and the recorder sends `Emulation.setUserAgentOverride` to every session. `location` and the other `navigator` names are refused; `launchParams` goes on the launch URL instead.

An **answer** is `{ match, method?, status, headers, body }` in `options.responses`. With responses set, `Recorder.setup` calls `Fetch.enable` (all URLs, request stage) on every session. In Electron the content's https requests are served by `main.js`'s `https` handler, and the Fetch domain never pauses them, so the handler runs `answerFor` itself (on the `lab://` form of the URL), fulfils with `buildAnswer`, and logs `{ method, url, index }`; `markAnswers` (`recorder.js`) marks the matching `trace.requests` entries when the run ends. `Fetch.requestPaused` still answers other schemes: it runs `answerFor(responses, url, method)`: the first response that matches (glob or `/regex/flags`, tried on the whole URL, the path with query, and the path) and isn't for `lab://run/__lab/` is sent with `Fetch.fulfillRequest` (`buildAnswer`: base64 body, a content type guessed from the body if none, CORS opened if not set; a body starting `@probe` is a [probing answer](#discovery-what-the-content-wants-from-its-server)); everything else gets `Fetch.continueRequest`. The matching request in `trace.requests` gets `answered: true` and `answeredBy` (the response's index in the list). `networkId` links the paused request to the Network event, which can arrive on either side of it. Responses apply to package runs only, in every frame and popup. `bodyFile` isn't an option: only the CLI reads files (`--answer pattern=@file`, or a response's `bodyFile` in an `--options` file, relative to that file) and it puts the text in `body`; `normaliseOptions` refuses `bodyFile`, so the web handlers can't be made to read a path.

`pinFindings(trace, options)` (called from `runFindings` for package runs) gives the findings in [findings.md](findings.md); it works from `launch.options`, so saved runs get them again when reopened. `parsePinFlag` and `parseAnswerFlag` are the CLI's spellings. In the UI, pins and answers are in `st.pins` and `st.responses` and go with every `launchOptions()`.

## Discovery: what the content wants from its server

`src/shape.js` is pure, apart from the `run` callback `discover` is given.

**The probe.** A response whose body is `@probe`, or `@probe` followed by JSON, is a probing answer. `servedBody` (in
`pins.js`) serves the JSON after the marker, or `{}`; the network never sees the marker. `shapePrefix(responses)` puts
`globalThis.__labShape = [{ source, flags }]` (the probing patterns as regexes, from `patternRe` in `pins.js`, so the
page matches exactly as `matcher` does) ahead of `host/shape-probe.js`, which the recorder adds ahead of `probe.js` only
when there is such a response. In each frame, `shape-probe.js` replaces `Response.prototype.json` and `.text`,
`JSON.parse`, and the `response` and `responseText` getters of `XMLHttpRequest.prototype`. For a matching URL, the parsed
data (from `json()`, an XHR with `responseType: 'json'`, or the next `JSON.parse` of text that came from `text()` or the
XHR) is wrapped in a recording Proxy:
- a read of a key the data has is reported (`read`) and returns the value; plain objects are wrapped in turn (one Proxy
  per object, so identity holds), arrays and primitives are returned as they are;
- a read of a missing key is reported (`read`) and returns a Proxy over `{}` for that path (cached), so deeper reads are
  seen; `then` and `toJSON` are never reported (promises and `JSON.stringify` read them), nor are inherited names
  (`toString`, `hasOwnProperty`…) or keys the content wrote itself;
- on such a Proxy, `Symbol.toPrimitive` reports `number`, `string` or `text` (hint default) and gives `0` or `''`;
  `Symbol.iterator` and `length` report `array` and act empty; `in` reports the key and says yes; `Object.keys` reports
  `keys` and gives nothing;
- a missing key named like an array or string method (`map`, `includes`, `trim`…) gets a Proxy with a function target:
  calling it reports `array` or `string` on its owner and returns what the method gives on `[]` or `''`. Any other
  missing key can't be called, as with a real answer.

Limits (also in the user guide): the Proxy is always truthy and `typeof` says `object`, so the first round takes the
true branch of every test on a missing field. Later rounds answer with placeholders, which are real values.

**Reads to a shape.** `shapeReads(trace, match)` takes the `shape` reports for one pattern and adds `at` (`file:line`)
and, for a `read`, a `hint` from `sourceHint(text, line, col, key)`: the probe's stack gives the column of the property
name (V8 points there for a property get), and the script text in `trace.sources` around it says more than the Proxy can
see: `=== 'x'`, `== 3`, `< n`, arithmetic, `typeof … === 'string'`, a default after `||` or `??`, or a truthiness test
(`if (…)`, `!`, `&&`, `||`, `?`). `inferShape(reads)` builds the tree of paths and types each node, first match wins:
children or `keys` → object; `array`; `string` (a method); `number`; a hint (non-boolean first); `text` → string;
otherwise boolean. It returns `{ skeleton, fields: [{ path, type, how, at }] }`, where the skeleton holds placeholders
(`""`, `0`, `false`, `[]`, `{}`).

**The loop.** `discover({ base, request?, rounds = 5, run, onRound })`: `run(name, options)` must run one launch to its
end and resolve to the saved run (the CLI calls `runPackage`; `main.js` calls `runToEnd`, which experiments use too).
It runs `no answer` with the base options; takes `request`, or `serverRequests(trace)` (fetch and XHR outside the package
and Package Lab's pages, one per `requestPattern`: the path for the host's root, origin and path for another site); then
`round n` with a probing response per pattern ahead of the base responses: `@probe` in round 1, `@probe <skeleton so
far>` after. It stops when a round adds no new path (`complete: true`) or after `rounds`. Each run becomes an experiment
row (`runResult`, `summarise`; the first row's progress is `the baseline`), and `onRound(row, index)` is called after
each. `checkDiscover` validates the settings first. The result is the `discover --json` object in [cli.md](cli.md#discover)
without the CLI's `package`, `item`, `base`, `request` and `out`; `discoverFindings(result)` gives its findings.

In the apps, `discoverStart` runs the loop in the experiment slot (one at a time; `experiment-stop` and `discover-stop`
both stop it), emits `discover` events (`{ state: 'start', request }`, `{ state: 'round', index, row }`,
`{ state: 'done', result }`, `{ state: 'error', message }`) and saves the result (below). The UI's Server needs view
keeps it in `st.disc`; **Save as response** puts `result.requests[i].response` into `st.responses`, replacing one with
the same pattern.

### Saved discovery (`package-lab-discovery`, version 1)

`<userData>/discoveries/<time>-<package>.json` in the apps; `discovery.json` in the CLI's `--out` folder has the CLI's
JSON instead.

```js
{ format: 'package-lab-discovery', version: 1, package, item (manifest index), base (options), request: pattern | null,
  requests: [{ match, url, method, from, fields: [{ path, type, how, at: ['file:line'] }], skeleton, response }],
  rows: [experiment row], rounds, complete, noAnswer: { furthest, label }, standIn: { name, furthest, label, better }, findings,
  file }
```

## Overrides

`options.files` replaces or adds files for one run. The session's overrides live in `pkg.overrides` (`{ path: { content } | { base64 } }`, reset when a package is opened); the Files view's handlers change them. `launchItem` uses `options.files` if the caller gave it and otherwise `pkg.overrides`; the headless run and the CLI always give it. A run is served from `overlayFiles(pkg.files, o.files)` (`served` in `main.js`, which `serve()` reads, so the original `pkg.files` is never touched), and its boot graph is recomputed for that file set and not cached. The static analysis of the package (`pkg.analysis`) stays that of the original.

All paths are checked by `packagePath` in `options.js` (relative, `/` only, no `..`, no empty segment): in `normaliseOptions`, and again in each handler before it looks at `pkg.files`. Nothing is ever read from or written to disk from an override path; the web interface sends replacement files as base64 inside the JSON body (limit 20 MB).

`src/overlay.js` is pure: `isText`, `entryFor(buffer)` (text as `{ content }`, otherwise `{ base64 }`), `overlayFiles`, `overrideList`, `overrideFinding(files)` (the "This run used N changed files" note, `null` for none) and `overrideProgressFinding(before, after)` (uses `progress()` from milestones). `withProgress` in `main.js` puts the notes straight after the milestone finding; the comparison runs only when an earlier run of the same item (same package name and item index) had no overrides, so it exists in the desktop and web interfaces but not in headless runs, and it is not rebuilt when a saved run is reopened (the override note is, from `launch.options.files`). `src/textdiff.js` is a line diff by longest common subsequence (common start and end trimmed first; over four million cells the middle is shown as replaced): `diffLines(a, b)` and `unified(a, b, context = 3)`.

## Corrected package export (P3.1)

`src/zip.js` writes ZIPs as well as reading them: `zip(files Map, date?)` → Buffer. Each entry is deflated (`deflateRawSync`), or stored when that isn't smaller (empty and tiny files, already-compressed data). The CRC is `zlib.crc32` when Node has it and the table version (`crc32Table`, exported so a test can compare them) otherwise. Names with characters outside ASCII get the UTF-8 flag (0x800), which the reader already honours. `zip()` refuses entry names that are empty, absolute, contain `..` segments, backslashes, drive letters or control characters. No ZIP64: more than 65,535 entries, or a 4 GB archive, throws. The archive is built in memory, like uploads.

`src/fixes.js` holds the fixes and the export. `FIXES` is `{ id: { label, apply(files, params) → { files, changes: [string] } } }`; the key order is the order they run (ZIP layout, manifest, then references). `apply` returns `{ files, changes, notes }`: `changes` are things done (no changes means no zip), `notes` are things it declined to do and why. It only edits files that decode as UTF-8 (`getText`, fatal decoder, byte-order mark kept), matches manifest `<resource>` blocks to `analysis.manifest.resources` by identifier (`blocksById`), and never changes its input Map, finds its own work by running `analyze` and `bootGraph` on the files it is given (so it works on the result of the fix before it), and returns no changes when there is nothing to fix. Findings carry only the data: `autofix: { id, params }` (set in `staticFindings` and the boot graph's risks; the `manifest-version` finding has `params.to`, the API the scripts use). `params` is optional input to `apply`, and findings stay serialisable. The interfaces read `autofix` ids to build the export checklist (`applicable(findings)` → `pkgInfo().fixes`: the static findings and the first SCO's boot findings); export runs the `only` list (an array, possibly empty), or every fix when it is left out.

| Id | Fixes | How |
|---|---|---|
| `manifest-case` | manifest not named `imsmanifest.xml` | renames it (not if the name is taken) |
| `manifest-not-root` | manifest inside a folder | strips the folder prefix from every file under it; files outside it stay; nothing is replaced |
| `file-missing` | `<file>` entries with no file | removes each entry, matching resource blocks to `analysis.manifest.resources` in order |
| `manifest-version` | manifest says 1.2 but scripts use 2004 or the other way | rewrites the root element's namespaces (known-good sets, `NS` in the file), `<schemaversion>`, and the `scormtype`/`datafromlms` spelling; drops `xsi:schemaLocation`; says what it cannot convert (the 1.2 mastery score) |
| `case` | references that differ from the file only in capitals | per file: when no reference spells it correctly, one wrong spelling is used everywhere and its folders match, the file is renamed; otherwise each reference is rewritten (`recase` keeps `../`, queries and `%`-encoding, and checks the result resolves to the file). It repeats until nothing changes, because the boot graph lists a repeated reference once |
| `http-to-https` | scripts, styles, frames over `http://` | swaps the quoted string in the file that loads it |

Edits to text are quoted-string swaps (`swapQuoted`): unquoted attributes and strings built at run time are left (and still show as findings afterwards, which the proof reports).

`correct(files, { only, overrides })` puts the overrides on top (`overlayFiles`), runs the selected fixes in order, and returns `{ files, applied: [{ id, label, changes }], overridden, proof }`. `proof` is `prove(before, after)`: the titles of `staticAll()` (the static and first-SCO boot findings) before and after, as `gone`, `remaining` and `added` (a changed count in a title shows as one gone and one added). `exportFixed(files, { version, name, only, overrides })` adds `PACKAGE-LAB-CHANGES.txt` at the top of the ZIP and returns the zip (`null` when nothing changed). The interfaces: `fix` in `bin/package-lab.js`; `handlers['export-fixed']` in `main.js` (a save dialog; desktop only, listed in `DESKTOP_ONLY` in `web.js`); and `GET /api/export` (the `download` option of `startWeb`; the summary is in the `X-Package-Lab-Summary` header) for web clients, used by `lab.download()` in `ui/bridge.js`.

**Adding an autofix:**
1. Add an entry to `FIXES` in `src/fixes.js`, in the position it should run. `apply` returns `{ files, changes }`, with one plain sentence per change, and no changes when there is nothing to do. Never write outside the Map.
2. Put `autofix: { id, params }` on the finding or findings it addresses (`rules.js`, `bootpath.js`).
3. Unit-test it in `test/test.js` (the "Corrected package export" block): does nothing to a good package, fixes a small package built in memory, and the finding is gone after.
4. Add the id to the table above, to `docs/cli.md` (`fix`) and the user guide, and mark the finding in `docs/findings.md`.

## Batch checks (P4.3)

`src/batch.js` checks a folder's packages and puts one row each into a table, a CSV and an HTML summary. Its parts:

- `checkPackage(path, { fragment })` reads one package and returns `{ row, fragment }`. The check is `analyze`'s: the first
  SCO's loading path, the static findings and the boot risks, sorted. The row's `verdict` is `ok`, `warn`, `error` or
  `failed`. It never throws: a file it can't read is a failed row (`failedRow`). `fragment` is the package's
  `renderReport` section, when asked for.
- `staticRows(files, { jobs, fragment })` runs `checkPackage` in up to `jobs` worker threads (`src/batchworker.js`, the same
  pattern as `codeworker.js`). Each lane takes the next file when free; a worker that dies makes its file a failed row, and
  the lane gets a new thread. Results are in file order.
- `runRow(row, json)` and `failedRun(row, why)` merge a run into a row. The run's JSON is what `package-lab run --json`
  prints: its `verdict`, `counts` and `milestones` give the verdict, the counts and the furthest label.
- `batchFiles(inputs, { recursive })` turns a folder into its `.zip` names (sorted; hidden entries skipped). Any other input
  is kept as a path, so a missing one is a failed row.
- `batchTable`, `batchCsv`, `batchHtml`, `batchSummary`, `csvCell`: the output. `csvCell` quotes a cell with a comma or a
  quote, and prefixes a cell that starts with `=`, `+`, `-`, `@` or a tab with an apostrophe (formula injection). Control
  characters are dropped first, as the CLI does for everything from a package. `batchHtml` escapes its text with `esc`, puts
  each package's section (a `<details id="pkg-N">`) below the summary, and links to it from the first column.

The CLI's `batch` command (`bin/package-lab.js`) runs the static pass with `staticRows`, then, with `--run`, `runBatch`: each
package runs as a child process, `package-lab run --json --out <file>`, so Electron is never started twice in one process (its
run is `spawnSync`) and the run's own code path is the one `run` uses. The run file is read back for its report section.
Limits: one run at a time, or two with `--jobs` over 1. A run that exits with an error is a row marked failed, with the
last line of its stderr.

The desktop **Check a folder…** (`check-folder` in `main.js`) uses `batchFiles` and `staticRows` with two threads, static only,
and shows the rows in the **Folder check** view. `open-batch-row` opens a path only if it came from the last check
(`batchPaths`). The button is hidden in the web interface.

**Tests.** `test/batch.js` (unit, in `--unit`) covers the cells, the guard, the summary, the rows after a run, the HTML
escaping and the folder listing. The end-to-end block in `test/test.js` builds every fixture into one folder with a file
that isn't a ZIP, and checks: one row each; each row's verdict equals the one the same checks give that package on one
thread; the CSV's header and line count; the HTML's links and sections; a missing path is a failed row; `--jobs 0` is
refused. The `--slow` block runs `good` and `blank` with `--run` two at a time and checks their furthest milestones and the
run sections in the HTML. The default suite runs no Electron.

## Findings

A finding is:

```js
{ sev: 'error' | 'warn' | 'info', title, detail?, evidence?: [string], fix?, autofix?: { id, params } }
```

| Function | Input | Covers |
|---|---|---|
| `staticFindings(analysis)` | `analyze()` | Manifest problems, version mismatch, server paths, own API, mode switches, tool, and the packs' static findings |
| `bootGraph().risks` | files | Everything in [the boot graph](#the-boot-graph) |
| `launchFindings(trace, boot)` | a run and its boot graph | Launch page not loaded, blank page, stuck loading screen (with causes in loading order), loading stopped, loading code never ran |
| `pinFindings(trace, options)` | a run and its launch options | Pinned value changed, couldn't be pinned (frozen, `let`/`const`), never read; requests answered, responses nothing matched. Called by `runFindings` |
| `runFindings(trace, launch)` | a run and its launch settings | API never looked for, not found, found but not called, own API object, top unreachable, server requests, failed requests, uncaught errors, refusals, caught errors, and progress (failed calls, finish, commit, suspend data, exit, completion) |
| `milestoneFinding(milestones(trace, boot))` | a run and its boot graph | The "Got as far as" note; added first to every package run by `main.js` |
| `compareFindings(cmp)` | `compare()` | First divergence, branches, differing files, errors only in the run |

`sortFindings` orders by severity (stable, so each function's own order is kept within a severity). `verdict()` in
`report.js` is the first error, else the first warning, else ok. `runVerdict(milestones, findings)` (E2.4, UI only) adds the sentence: the furthest step reached and the first missed, or "Ran through" when all were reached; its `sev` is the same worst finding, with an info finding counting as ok. Every finding is listed for users in
[findings.md](findings.md); keep that file in step.

**Writing findings:** the title states what happened, in plain words. `detail` says why it matters. `evidence` lines
are concrete (file:line, the value, the request), at most about ten. `fix` is what to do or check next. Avoid jargon
where a plain word works.

## Adding a finding

1. **Find the evidence.** It is in the trace (`trace.probe`, `requests`, `exceptions`, `caught`, `log`, `scripts`,
   `console`, `cmi`), the analysis, or the boot graph. If it isn't recorded, add it to the probe (new report type) or
   the recorder first.
2. **Add the check** to the function for that source. For example, in `runFindings`, a check that content reads
   `cmi.suspend_data` but never writes it:
   ```js
   const reads = api.filter(c => /GetValue$/.test(c.call) && c.el === 'cmi.suspend_data')
   if (reads.length && !sets('cmi.suspend_data').length)
     out.push({ sev: 'info', title: 'The content reads suspend data but never saves any', detail: '…', evidence: [], fix: '…' })
   ```
3. **Test it:** a unit test with a hand-made trace (see the `trace()` helper in `test/test.js`), and, for anything
   about real behaviour, a fixture package that shows it (see [Tests](#tests)).
4. **Document it** in `docs/findings.md`.

## Comparison

`compare(ref, run)` (`src/diff.js`) matches requests and scripts across hosts by the longest common run of trailing
path segments (at least the file name). It returns:
- requests only in the reference, and requests that worked there and failed in the run;
- scripts only in either;
- exceptions only in either;
- API call counts and lookup counts;
- coverage differences and the first divergence.

`branchDiff` compares V8 block coverage. Nested ranges are listed only where their count differs from the enclosing
range, so an unlisted block takes the innermost enclosing count. Coverage is compared only for scripts with the same
hash.

## Comparing packages (P3.3)

`src/pkgdiff.js` is pure: it takes `{ name, files (Map from unzip), analysis? }` twice. It is not `diff.js` (two runs).
`comparePackages(a, b, { item })` returns `{ a, b, files, manifest, boot, findings, summary }` (the shape is under `diff --json` in
the [CLI guide](cli.md#diff)), built from five small functions that are exported and tested alone:

- `compareFiles`: added, removed, changed (with sizes). A changed file with valid text on both sides and no side over `MAX_TEXT` (1 MB)
  gets a `unified()` diff; the others get `diff: null` (`tooBig` says which). Minified files are diffed as they are until P4.1's formatter exists.
- `compareManifests`: rows `{ where, field, a, b }` over the package fields, every resource and every item, matched by identifier.
- `compareBoots`: nodes keyed by path (or target), first one wins. Added, removed, and status changed.
- `compareFindings`: static findings plus the boot graph's risks, as `analyze` gives them. Same title and evidence is the same finding.
- `compareBehaviour(runA, runB, names)`: from two saved runs' milestones and `runCounts`, through `progress()`. The CLI's `--run` runs both
  with the same options (`runPackage` twice) and attaches it as `.behaviour`. The desktop and web **Package diff** view shows the file-only result.

`textdiff.js` is a Myers O(ND) diff over lines mapped to integers, with common ends trimmed first. Past 3000 edits it gives up on a
minimal script and shows the changed middle as removed then added (the same result as before for a file that was rewritten), which bounds
time and memory (about 3000² integers). Line endings are not changes: CRLF is read as LF.

The desktop window opens a dialog (`compare-packages`); the web interface sends the second file to `POST /api/upload?role=compare`, which
returns the comparison instead of replacing the package. `renderReport` takes `diff` (the result, with `.behaviour` when there is one) and
adds `diffHtml`: a collapsible `<details>` per changed file, everything through `esc()`.

## Milestones

`src/milestones.js` is pure. `milestones(trace, boot)` returns the ten steps in order, each
`{ id, label, reached, t, evidence }` (`t` is ms from the start of the run; `evidence` is one plain sentence). The
ids, in order, are `launched`, `scripts`, `shown`, `looked`, `found`, `initialised`, `read`, `wrote`, `committed`,
`finished`. Rules worth knowing:
- `launched` and `scripts` use `bootRun(boot, trace)`: the launch page returned 2xx or 3xx, and every script tag in the
  boot path that lives in the package was requested without failing. Script tags on other sites are not counted. With
  no boot graph (`null`), they are judged from the package requests instead.
- `shown` uses any content frame's DOM report (not Package Lab's own page), at any time in the run.
- `found` is also true if the API was called, since a call implies the API was there.
- `initialised`, `committed` and `finished` need the call to have returned `'true'`; `read` and `wrote` match the
  element names (1.2 and 2004) in `READ` and `WRITE` and don't look at the result.

`furthest(list)` is the last step reached (not necessarily unbroken), `firstMissing(list)` the first not reached.
`runCounts(trace)` gives the numbers `progress` compares. `progress(a, b)` takes two `{ milestones, counts }` objects
(or bare lists) and returns `{ better, steps, counts, summary }`: `better` is 1 if b got further than a, -1 if less far,
0 if equal. The tie-break is the number of steps reached. P0.3 and later work packages use it to compare runs.

`main.js` adds `milestones` to each package run (the run summary the interfaces get, and the saved run) and puts
`milestoneFinding` first in its findings. Saved runs from before this have no `milestones`; the report computes them.

## Timeline (P4.2)

`src/timeline.js` is pure. `timelineModel(trace, milestones?)` gives the lanes of one run, in ms from the start of the
run. `milestones` defaults to `milestones(trace, null)`, so a run without a boot graph still works. Missing lists (WebKit
runs have no `scripts` or `exec`) count as empty.

```js
{
  range: { from: 0, to: duration },          // duration: trace.duration or the latest time in the trace
  lanes: {
    milestones: [{ t, id, label, title }],   // reached steps with a time, in STEPS order
    requests:   [{ t, t2, failed, label, title }],  // t2: the response or failure time (requests[].end); = t when unknown
    scripts:    [{ t, label, title }],
    api:        [{ t, kind, label, title }], // kind: init, get, set, commit, finish or other (callKind)
    errors:     [{ t, kind, label, title }], // kind: uncaught or caught
    dom:        [{ t, label, title }],       // probe dom reports of content frames; label is the text sample (80 characters)
    density:    [count per bucket]           // only when the trace has exec: 80 buckets; a repeat record (4) counts its n
  },
  milestones: [step],                        // the ten steps, as milestones() gives them
  missing: [label],                          // steps not reached
  size                                       // the bucket size in ms, when density is there
}
```

`timelineView(trace, milestones?, { from, to })` is what the interfaces use: the same items cut to a window, each with `x`
(and `x2` for a bar) as a fraction of the window (0 to 1), the density buckets as `{ x, w, n }`, `ticks` (`{ x, label }`
at round steps), and `lanes` as `{ id, label, tab, items }` in the order of `LANES`. `tab` is the tab a click opens.

The Timeline view calls the `timeline` handler (`{ run, from?, to? }`) in `main.js`, because the UI is a classic script and can't
import the module; it draws the SVG itself with `createElementNS`. The report draws the whole run with `timelineHtml`
(`report.js`), every label through `esc`. Requests get an `end` time from the recorder (on the response or the failure); older
saved runs and WebKit runs have none, so their bars are dots. The milestone lane is in STEPS order, not sorted by time: a
step's time is its first evidence, and `shown` can come before `initialised`.

## Why it stalled

`src/stall.js` is pure. `stall(trace, milestones)` returns `{ stalled, pollers, unanswered, listeners, pending, last,
waiting, missing }` and `stallFinding(result)` makes the finding (or `null`). `stalled` is true when `wrote` wasn't
reached (or there are no milestones).
- `pollers`: for each frame's last `timers` summary (content frames only), the intervals not cleared, and the chains of
  timeouts (created at least twice), that ran at least three times and last ran within `max(2 s, 3 × delay)` of the end
  of the run. With `trace.sites`, `condition` is the decision in the same package file taken about as often as the timer
  ran (0.8 to 1.5 times, nearest the line that made the timer); it carries its last value from the last event.
- `unanswered`: each `post` with a readable target, judged by: a `msg-run` in the target's frame within `HEARD` (1 s) =
  heard; another `post` to a different target within `REPLY` (2 s) = a reply. Reasons: `no-listener` (no `listener`
  report in the target frame), `not-handled`, `no-reply`. Equal messages (target, type, reason) are counted once.
- `listeners`: `listener` reports in content frames with no `msg-run`. `pending`: requests with no status.
- `last`: the last five events when traced, else the last functions with coverage count above zero, scripts in load order.

`main.js` (`withProgress`) adds the finding to package runs: under the last blank-page or loading-screen finding, else
sorted with the warnings. Saved runs get it when they are opened, from the probe's reports. The CLI's `run --json`
gives `waitingFor` (the same result).

## Experiments

`src/experiments.js` is pure. `PRESETS` maps a name to a list of `{ name, patch }`: `api`, `frames`, `standard`, and
`lms` (P2.1: `lms <name>` with `{ profile: name }` for each LMS profile), and `storage` (P2.2: `storage normal` and `storage blocked`; the one equal to the default is dropped), and `browsers` (P2.3: `browser chromium` and `browser webkit`, likewise). `planVariants({ base, variants })` returns `[{ name, options }]`: the base first, named
`default`, then each variant's patch merged over it with `normaliseOptions`; a variant whose options equal an earlier
one's is dropped (unless `dedupe: false`, used for variants the user wrote), and bad patches throw with the variant's name. `runResult(name, options, savedRun, extra)` keeps what
a table needs: `{ name, options, milestones, counts (runCounts), errors, verdict, …extra }`. `summarise(results)` makes
the rows (`results[0]` is the base; each other row has `progress` and `better` from `progress()`), and
`experimentFindings(results)` returns the "gets further" warnings (only when the furthest step is later, not for a tie
on step count) or the "Nothing tried" note. It also adds "With storage blocked, the content gets less far" for a variant whose `storageMode` is `blocked` when the base's isn't and `progress()` says it got less far.

Running is up to the caller. The CLI calls `runPackage` for each plan entry (a fresh Electron each time, or a Node child for a WebKit variant; saved runs in
`--out`). `main.js` runs the plan inside one process: `experimentStart` launches each variant with `auto` set to its
`wait`, waits for the run to be recorded, and emits `experiment` events: `{ state: 'start', names }`,
`{ state: 'result', index, row }`, `{ state: 'done', rows, findings, stopped }` and `{ state: 'error', message }`. One
experiment at a time; the runs also appear in the runs list as usual. The UI's Experiments view keeps its table in
`st.exp` and fills it from these events; it doesn't survive a page reload in the web interface.

## Code views (P4.1)

Three pure modules and one UI script. Nothing in them makes HTML except `report.js` and `ui/codeview.js`.

**`src/format.js`.** `format(text, kind)` runs js-beautify (`kindOf(path)`: `js`, `html`, `css`, else null; indent 2) and
returns `{ text, o, f }`, where `o` and `f` are `Int32Array`s of the offsets of the non-whitespace characters of the
original and of the formatted text. They must have the same length and the same characters, or the result is
`{ error }` (the formatter changed the code; we don't trust a map then). The n-th non-whitespace character of one is
the n-th of the other, so `toFormatted(fmt, off)` and `toOriginal` are a binary search, and `lineMaps(text, fmt)` gives
`toF` and `toO` (the line of each line's first character; -1 for blank lines). Over 5 MB a file isn't formatted.
Formatting is about 4 MB/s (2 MB of dense code, about 0.5 s).

**`src/sourcemap.js`.** `decodeVLQ(str)` (base64 VLQ → integers), `decodeMappings(mappings)` → `{ segs, lineStart }`
(segs is flat, five numbers each: generated line, generated column, source, original line, original column, all
0-based, relative fields undone; one-field segments are dropped), `mapUrlOf(text)` (the last
`//# sourceMappingURL=` or `/*# … */`), `parseMap(json)` (version 3, not indexed; `sources[i] = { name, content }`,
`content` null without `sourcesContent`), `loadMap(text, path, readFile)` (an inline data URL, or a file next to the
script found with `readFile`; another site, a root-relative address or a path leaving the package is never read; a file over
30 MB, or `mappings` over 5 MB, is refused; `mapJsonOf` is the reading half). Decoded maps are cached per map text (up to
60 MB, a hit compared with the text; `cachedMap`, `rememberMap`) and `originalAt(map, line, col)` (the last segment at or before the column).

**`src/codeview.js`.** `codeView({ text, path, line, col, mode, source, trace, readFile })` is the `code-view` handler's
whole job, so tests and the report call it without Electron:
- *Modes.* `auto` picks `mapped` (the map has the source at that position), else `formatted` for a minified file (a
  line over 800 characters), else `original`. A file over 30 KB that isn't yet formatted opens `original` with
  `later: 'formatted'`: the UI draws it, then asks again with that mode. (Formatted results are remembered up to 60 MB, oldest
  dropped first, keyed by a hash and checked against the text.) A mode that isn't there falls back to `original` with `note`.
- *Off the main thread.* `codeViewAsync(o)` (what the handler awaits) first formats a file over 30 KB (when the mode is
  `formatted`) and decodes a map over 30 KB in a `worker_threads` Worker (`src/codeworker.js`, loaded lazily, referenced
  only while a job is out), puts the results in the caches, then calls `codeView`. If the worker can't run, `codeView`
  does the work itself. Tests, the CLI report and `excerptor` use the plain, synchronous functions.
- *Coverage.* `charCounts(len, covs)` turns V8 ranges into a count per character (outer range first, innermost wins, the
  highest count across frames, -1 for nothing); `lineCoverage(text, starts, counts)` makes one number per line (count,
  -2 part of the line ran, -1 nothing, judged by the line's first character). Formatted mode moves each non-whitespace
  character's count across by the map; mapped mode aggregates the counts at each segment's generated position by
  original line. Coverage entries are those whose `url` is the file's `lab://…/pkg/` address; the offsets are already the
  original's (`restoreTrace`). Pages (`.html`) have none: inline-script offsets are relative to each script.
- *Markers.* `siteMarks(trace, path)` counts, per site of the file, calls (`kind` 1, and repeats of a function site) and
  decision results (`kind` 3, and repeats); `marks` is `{ line: text }` placed in the mode shown.
- *Links.* `evidenceParts(text)` splits text into plain parts and `{ text, path, line, col }` links for `file:line[:col]`
  (known extensions only, not after a `/` or `:` so another site's address is left alone). `src/ui/codeview.js` has a copy
  (`CodeView.parts`) because the renderer has no imports; the test runs the script in `vm` and compares the two.
- *Excerpts.* `excerpt(view, 20)` and `excerptor(textOf)`, which `report.js` uses: `parts(evidence)` returns the parts with
  an `id` (random prefix per `excerptor`, so two reports on a page don't clash) where an excerpt could be made (at most 24 per report; one per place; a file's formatting and map are done once, by the caches), `take()` the excerpts made since the last
  call. A minified file is shown formatted, or from its map's source.

**`src/ui/codeview.js`** (classic script, `window.CodeView`). `create(view, { col, ask, close })` returns the element. It
draws every line up to 5,000 lines; over that it draws the lines in view and a buffer of 30 each way, with padding to give the
scroll bar its length (fixed 18 px rows, no wrapping, long lines cut at 600 characters). `ask(options)` calls the handler
again with another mode or source. `app.js` keeps one pane (`#code-pane`) above the tab; `openCode({ run, path, line, col })`
fills it, and `link(text)` turns the file:lines of a piece of evidence into buttons that call it.

**Report.** `renderReport({ …, files })` (a Map of package path → Buffer; the saved run's `trace.sources` are used first)
makes every `file:line` of a finding's evidence an `<a href="#sl-x-N">` and puts a `<details class="sl-excerpt">` with the
escaped lines under the finding. The text is the run's changed file (`launch.options.files`) first, then its recorded source, then `files`. `excerpts: false` leaves out excerpts and links (for the redacted report). Without any of them it is as before. `package-lab report` passes the package's
files. The desktop and web reports aren't built from the interface.

## Reports

`renderReport({ title, subtitle, findings, boot, run, analysis, fragment, files })` (`src/report.js`) returns a full HTML
page, or a `<div class="sl">` fragment with scoped styles. The fragment uses the host page's `--err`, `--warn`, `--ok`,
`--line`, `--muted` and `--code` if they are defined. Everything interpolated goes through `esc()`. `counts()` and
`screens()` are shared with the CLI's JSON output. `renderReport` takes `extra` (trusted HTML from this module's helpers, such as
`experimentHtml(rows)`, shown under the verdict): `experiment --out` writes its `report.html` that way.

`src/completion.js` keeps the CLI's command table: each command's name, summary, positional argument and flags, and the
kind of each flag's value (a file kind, `text`, or a list of choices, which can come from a module such as `PRESETS`).
`zshCompletion()` turns it into the zsh script. The table is separate from the help text, which is prose; the tests check
every command and flag name appears in `help`, so the two can't drift apart silently. A new flag goes in `F` and in the
commands that take it.

**Redacted reports (P4.4).** `renderReport(..., { redact: true })`, or `redact: { names, key, map, package }` for the
options of `redactRun`, passes the run, boot graph, analysis and findings through `redactRun` (`src/redact.js`)
first, then shows a banner that counts what was taken out (`redactionBanner`). The title and subtitle come from the
redacted label, not from the caller. Code excerpts are off and the package diff is left out.

`redactRun(input, { names, key, map, package, paths })` is pure: it copies its input through JSON (the input is never
changed), replaces course content, and **works the findings out again**, then adds `redaction: { names, counts }`. It
is safe by construction, not by remembering what was removed:

1. **Fields.** Each field that holds course text becomes a length marker, `‹12 characters›`: probe `dom` sample and
   loader, `dialog` message, `input` text, the `value`, `result` and `values` of `api`, `pin-write`, `watch-write`,
   `cmi`, `cmi-now` and `post` probes (vocabulary, numbers and times stay: `kept()`), `trace.cmi`, console text, log
   text from the page's own scripts, request bodies and headers, operand previews in `exec` (a string is its length;
   numbers and names stay), code text in `sites` (`text` except for functions, and each `args` element) and
   `boot.dynamic`, `sources`, changed file contents (`launch.options.files`), macro text, response bodies, headers and
   `match` queries, `launch.options.launchParams`, custom profile `headers`, `csp` and `launchParams` (in
   `options.profile` and `launch.profile`), the item title (`launch.item`, manifest titles, item ids become `item N`),
   `boot.pages[].bodyText`, and `analysis.scan` snippets.
2. **Messages.** Exception, caught-error, `pin-failed` and browser log text (sources that are the browser's own:
   network, security, violation…) are kept with their quoted strings (`'…'`, `"…"`, `` `…` ``, and curly quotes; an inner quote followed by a letter does not end a string) replaced by markers. Then (`browserMsg`) only the part up to the first `: ` stays, unless the message is a known shape (`SHAPES`: `x is not defined`, `Cannot read properties of null (reading ‹…›)`, `Failed to load resource: … status of N`); a `Refused to … because` message keeps its words up to `because`. Boot
   risks and rule-pack findings, which come from the files, get the same, and a `file:line  code` evidence line keeps
   only `file:line`.
   Free-text elements (`FREE`: student and learner id and name, location, suspend data, responses, comments, interaction and objective ids) are masked whatever the value, numbers included; scores and times stay. A Set's `result` is not a value.
3. **Strings.** Every other string passes through one scan: `lab://` and `https` URLs (package folders kept; for other sites, host and path stay but id-like path parts, `idLike`, are masked; each query
   part replaced, fragments dropped), `file:` URLs and local paths (`‹local path›`), and relative references with a
   query or fragment (`a.html?x=y#z`). Fields known to hold package paths (boot nodes, `sites[].file`, manifest
   resources, scan file names, changed file names) go through the same rules as a whole.
4. **Names** (`names: true`, `--redact-names`): each decoded folder name and file name becomes `f` plus 10 hex digits of
   `HMAC-SHA256(key, name)`, with the extension kept on the last segment. `map` collects `name` (and `folder/`) to hash
   for the key file; `paths` adds names the caller knows (the package's file list). File names are also replaced, as
   whole words, in messages.
5. **Findings.** The label is rebuilt from fields (package, item number, API, profile, storage, depth…). Then
   `runAnalysis` (the same code a live run uses) runs on the redacted trace, launch, boot graph and analysis (the analysis
   needs the package, so a run saved on its own gets no static findings; the pack findings it carries are kept, as
   when it is opened). A report of the files only runs `staticFindings` on the redacted analysis and the redacted boot
   risks. So every quote in a finding comes from data that is already redacted.

Kept: element names, SCORM vocabulary, numbers and times, package paths (or hashes), function and property names,
the package name (unless names are hashed), and messages minus their quotes.

Known limit: unquoted text in a message from the browser, or in a boot-risk line that is not `file:line  code`, is kept.
The user guide tells the user to check the report before sending it.

## Interfaces

### Desktop window

`src/ui/app.js` is plain DOM code. `h(tag, props, ...kids)` builds elements; `VIEWS[tab]()` returns a tab's content;
`render()` redraws the view list, the view and the runs list from `st`. It talks only through `window.lab`:
`lab.invoke(name, arg)` and `lab.on(channel, fn)`.

**Drop to open (E2.5).** A `.zip` dropped anywhere on the window opens it. `app.js` shows `#drop` (“Drop to open”) while
a file is dragged over the window, counting `dragenter` and `dragleave` so the overlay goes when the drag leaves. On the
desktop, `lab.pathFor(file)` (`webUtils.getPathForFile` in `preload.cjs`) gives the file's place on disk, and
`invoke('open-path', { path })` opens it through `openPath` in `main.js`. A `File` the page made itself has no place on
disk, so `pathFor` returns `''` and `open-path` refuses it: test the desktop path with `invoke('open-path', …)`. The web
interface has no `pathFor`; it uploads the file with `lab.upload`, as Open does. Any file not ending in `.zip` gets
“Only .zip packages can be opened” and nothing changes.

**Tooltips (E2.5).** Each `title` is one line of about 80 characters or less. `test/ui.js` fails if any `title` in the
rendered page is over 100 characters. Longer explanations go in the user guide, under the setting they describe.

The page's CSP allows only its own scripts and styles, and `data:` images (for live frames).

**Toolbar and icons.** `index.html` starts with one `<header id="toolbar">` (52 px, `-webkit-app-region: drag`; every control in it is `no-drag`), then the `.main` row. Icons are `<symbol id="i-…">` elements in one hidden `<svg>` at the top of the toolbar, 16×16, `stroke="currentColor"`, 1.5 stroke, drawn by hand; use them with `<svg class="icon" aria-hidden="true"><use href="#i-run"/></svg>`. There is no icon library. Every toolbar button has an `aria-label`; its `.tb-label` text hides below 1100 px. `syncRun()` in `app.js` sets the Run/Stop button's label, icon and enabled state from `st.running`.

**The view list (E2.3).** `GROUPS` in `app.js` puts every name in `TABS` in exactly one of five groups (a `console.assert` at module load and a check in `test/ui.js` hold it). `render()` draws `#views` in the left sidebar, between Runs and the Actions buttons: an `<h2>` and a `<nav aria-label>` per group, one `<button>` per view, `aria-current="page"` on `st.tab`, a roving `tabindex`. A name in `GROUPS` but not in `TABS` (Folder check on the web) is simply not drawn; `HIDE` hides empty views and a group with none left is left out. `st.tab` and `VIEWS` are what they were. ↑ and ↓ in `#views`, and ⌘1 to ⌘5 anywhere (a page `keydown`, not a menu item), go through `visibleGroups()`. In `test/ui.js`, `view(name)` clicks the entry in `#views`; the toolbar's Test saving button and the Compare button have the same names as views, so find them under `#toolbar` or by id.

**The live view and its coordinates bar (E4.1).** `livePanel` serves both interfaces. `liveWatch(on)` runs from `render()` while the Live view is shown and a run is going: the web calls `lab.live(fn)` (SSE), the desktop calls `live-watch` and listens to `lab.on('live')`. The bar turns the pointer's fraction across the picture into pixels with the last frame's `w` and `h`, and asks `live-hit` at most once every 150 ms (a timer, so the latest position is the one asked). Everything it shows is set with `textContent`. `#show-live` in the toolbar is shown on the desktop while a run is going and Live is not the chosen view. Tests: the slow handlers check `live-hit` and `live-watch`; `test/ui.js` checks that no `capturePage` call happens until Live is open, then a frame, the hover text and Copy.

**The inspector (E2.2).** `#inspector` is the right-hand pane in `.main`: 340 px (`--inspector-w`; the width is kept in `localStorage` `pl.inspector-width`, and `#inspector-resize` is a `role="separator"` handle that drags and takes the left and right arrow keys), a segmented control (`#insp-tabs`, `role="tablist"`, roving tabindex, arrow keys, Home and End) and three panes: `#insp-settings`, `#insp-macro` (the `#macro` box) and `#docs` (Help: the docs panel, unchanged inside). `showInspector(open, seg)` is the one place that shows, hides and selects, and it keeps `pl.inspector` (`{ open, seg }`); `openInspector(seg)` loads the first doc the first time Help shows; `openDoc` opens Help. Settings is `<details>` groups (LMS, Browser and device, Recording, Advanced) holding the same control ids as before, so `launchOptions()` is unchanged. `test/fixtures/launch-options-before.json` is what `launchOptions()` and the Copy as CLI line made, before the controls moved, of a choice of every control (the web check in `test/ui.js` repeats the choices with `everyChoice()` and compares). The `options` handler also returns `summary: optionsSummary(options)` (`src/options.js`, pure: short labels for the fields that differ from `DEFAULTS`, in a fixed order, at most 4 and then "+N more"); `showSummary()` draws it in the chip `#summary` beside Run, which opens Settings and is hidden when the list is empty. Compare packages, Record a working copy (`#ref`, which opens `#ref-dialog`; File → Record a Working Copy… sends the same `ref` action), Check a folder and Export corrected package are buttons under **Actions** at the bottom of the left sidebar, so the web interface keeps them.

### Web interface

`src/web.js` serves `src/ui/` and the API:

| Method and path | Does |
|---|---|
| `GET /?token=…` | Checks the token and sets the cookie, then redirects to `/` |
| `GET /`, `GET /<ui file>` | The interface |
| `POST /api/invoke/<handler>` | JSON body, then `{ value }` or `{ error }` (status 500). `open-package`, `open-path` and `open-run` are refused |
| `POST /api/upload?name=` | Raw `.zip` body (up to 1 GB), then `{ value: package info }`. With `&role=compare`, the body is compared with the open package and `{ value: comparison }` returned; nothing is opened |
| `GET /api/events` | Server-sent events: `package`, `run`, `state`, `probe`, `experiment`, `discover` |
| `GET /api/live` | Server-sent events: `frame` with `{ w, h, t, jpeg (base64) }`. Open connections count as watchers |

Every request except the token exchange needs the `packagelab` cookie, compared in constant time. Responses carry
`no-store`, `nosniff`, `DENY` framing and `no-referrer`. The token is 24 random bytes, kept in `<userData>/web-token`
with mode 600.

`src/ui/bridge.js` defines `window.lab` over these endpoints when there is no preload, and adds `lab.web`,
`lab.upload(file, progress, role?)` and `lab.live(fn)`. `app.js` checks `lab.web` for the differences (upload, saved-runs
dialog, Live view, joining a session in progress).

### CLI

`bin/package-lab.js` does static work in Node, importing the same modules. For runs, it writes a job file to a temp
folder:

```json
{ "zip": "/abs/course.zip", "item": 0, "expose": "manifest", "depth": 0, "opener": false, "caught": true,
  "resumeFrom": null, "wait": 10, "out": "/abs/run.json", "live": null }
```

The job also carries `options`, the normalised launch options (P0.1); the headless run normalises them again. It then
runs Electron with `--run=<job>` (stdout ignored, stderr to a log), waits for `out`, and reads the run back. With `--browser webkit` it runs `src/webkit-runner.js` in Node instead (see Other browsers and device sizes).
`item` here is the manifest item index; the CLI's `--item` numbers are positions among launchable items. Electron is
chosen from `PACKAGE_LAB_ELECTRON`, then this repo's `electron` package, then `/Applications/Package Lab.app` (or `~/Applications`, or what `PACKAGE_LAB_APP` names; see `appBinaries` in `src/platform.js`).

## Data formats

Every file or object the tools read and write, and where each is described:

| Format | Where it's written | Described in |
|---|---|---|
| Launch options (`options`, normalised) | A run's `launch.options`; a `--options` file; the apps' inspector Settings | [Launch options](#launch-options) |
| Saved run (`package-lab-run`, version 1) | `runs/` in the data folder; `run --out`; each experiment, drill and cycle run | [Saved run](#saved-run-package-lab-run-version-1) |
| Execution trace (`trace.exec`, `trace.sites`) | A traced run's saved run | [The execution trace](#the-execution-trace) |
| Milestones | Each package run (`milestones`, `furthest`) | [Milestones](#milestones) and [below](#milestones-in-a-saved-run) |
| Discovery (`package-lab-discovery`, version 1) | `discoveries/` in the data folder; `discover --out` | [Saved discovery](#saved-discovery-package-lab-discovery-version-1) |
| Experiment result (`experiment.json`) | `experiment --out`; the Experiments view | [below](#experiment-result-experimentjson) |
| Cycle result | `cycle --json`; `cycle --out` keeps the two runs | [below](#cycle-result) |
| Macro (`package-lab-macro`, version 2) | A macro file; the `macro` option | [below](#macro-package-lab-macro-version-2) |
| Profile | The `profile` option (a name or an object); `--profile-file` | [LMS profiles](#lms-profiles) |
| Rule pack | `src/packs/<tool>.js` | [Rule packs](#rule-packs-p32) |
| Boot graph | `analysis.boot`; a run's `boot` | [The boot graph](#the-boot-graph) |
| LRS record (`trace.lrs`) | A cmi5 or Tin Can run's saved run | [The LRS record](#the-lrs-record-tracelrs) |
| Corrected package and its changes file | `fix`; Export corrected package | [Corrected package export](#corrected-package-export-p31) |
| Drill-down result (`drill.json`) | `drill --out` | [drill](cli.md#drill) |

### Saved run (`package-lab-run`, version 1)

```js
{
  format: 'package-lab-run', version: 1,
  kind: 'package' | 'reference', label, package,          // package file name
  launch: { version, format, expose, depth, opener, item, itemIndex, itemType, url, resume, options, profile },  // reference: { url }; options (added in P0.1) is the normalised launch options; profile (P2.1) the resolved LMS profile, every field
  findings: [finding],                                     // as computed when saved; readers recompute
  milestones: [milestone] | null,                          // added in P0.2: see Milestones; null for a reference run
  boot: bootGraph | null,
  trace: {
    label, started, ended, duration,                       // ISO times, ms
    browser:    'chromium' | 'webkit',                     // P2.3 (absent in older runs: chromium); webkit also has browserVersion
    targets:    [{ t, sid, parent, type, url }],
    scripts:    [{ t, sid, id, url, hash, length, module, sourceMap, from: [frame], start? }],   // start: [line, column] (0-based) of an inline script in its page, added in P1.4
    requests:   [{ t, sid, id, url, method, type, initiator, from: [frame], status?, mime?, failed?, canceled?, redirect?, answered?, answeredBy? }],   // answered, answeredBy (index into launch.options.responses): added in P1.2
    navigations:[{ t, sid, frame, parent, url }],
    console:    [{ t, sid, level, text, at: [frame] }],
    exceptions: [{ t, sid, text, url, line, at: [frame] }],
    caught:     [{ t, sid, text, uncaught, at: [frame] }],
    log:        [{ t, sid, level, source, text, url }],
    probe:      [probe report],                            // see The probe
    exec:       [{ t, sid, frame, events: [event] }],      // added in P1.4: the execution trace, empty unless traced (below)
    sites:      [site] | undefined,                        // P1.4, traced runs: the site table events refer to
    untraced:   [{ file, why }] | undefined,               // P1.4, traced runs: files served as they were
    coverage:   [{ sid, id, url, hash, fns: [[name, [start, end, count, …]]] }],
    sources:    { url: source },
    truncated:  { list: true },                            // exec: true when trace events were dropped
    window:     { width, height } | undefined,             // E1.1: the run window's content size at the start and after its last resize (Chromium runs; a macro made from the run is recorded at it)
    cmi:        { '1.2'?: { element: value }, '2004'?: { … } } | null,
    lrs:        lrsRecord | undefined                      // P4.5, cmi5 and Tin Can runs: see The LRS record (launch.format is then 'cmi5' | 'tincan', launch.expose 'none')
  }
}
```

`launch.options.files` holds the content of every changed file, so a run can be repeated from the saved run alone (`--options-from`).

The execution trace (traced runs, P1.4):

```js
event = [t, 1 | 2, site]                         // a function started (1) or ended (2); t is ms from the start of the run
      | [t, 3, site, result, ...previews]        // a decision: result 1 or 0 (for ??: 1 = had a value); previews of the operands
      | [t, 4, site, result, n]                  // the event before repeated n more times
site = { file, line, col, kind, text, args? }    // file: package path; line and col 1-based in the original file (pages: in the page)
                                                 // kind: function, if, ternary, &&, ||, ??, switch, while, do-while, for
                                                 // text: the function's name or the test's code (120 characters); args: operand code
preview = ['undefined'] | ['null'] | ['boolean', b] | ['number', n | 'NaN'] | ['string', s (80 characters), fullLength?]
        | ['bigint' | 'symbol', text] | ['function', name] | ['object', constructorName, firstFiveKeys?, keyCount?]
```

`events[i][2]` indexes `trace.sites`. Events are in order within a batch; `lastEvents` merges batches by time.

A frame is `{ fn, url, line, col }`. Older runs without `format` (from before version 1) still open.

### Boot graph

```js
{
  start,                                       // launch path
  nodes: [{ path?, target?, status, actual?, elsewhere?, scriptRelative?, ref, kind, how, mode?, from, line, depth, doc, docDir, flash?, also? }],
  pages: [{ path, base, bodyText, execOrder: [{ name, mode, line }] }],
  dynamic: [{ file, line, text }],
  risks: [finding]
}
```

`kind` is page, script, style, data, flash, wasm or asset. `how` is launch, tag, `require.js data-main`,
`meta refresh`, import, worker, request, src, navigate, amd or literal.

### Milestones in a saved run

`milestones` is the list `milestones(trace, boot)` returns: `[{ id, label, reached, t, evidence }]`, in order.
`t` is in milliseconds from the start of the run. (P1.6 fixed some steps of older saved runs, whose times were absolute.) `furthest` is the last reached step's id, and `null` when none was reached. A cmi5 or Tin Can run uses
its own list, `CMI5_STEPS` or `TINCAN_STEPS` in `src/milestones.js` (`stepsFor(format)` picks it), so read `id`s
against that list, not against `STEPS`.

### Macro (`package-lab-macro`, version 2)

A macro file is a list of events, or this object (`macroFile(events, viewport)` in `src/cycle.js` writes it; `readMacro` reads
version 1, version 2 and a bare list, and returns `{ events, viewport }`, with `viewport: null` when the file has none):

```js
{ format: 'package-lab-macro', version: 2,
  viewport: { width, height },            // the window the positions are across (version 1: none)
  events: [{ t, type: 'click' | 'move' | 'wheel' | 'key' | 'text' | 'wait', x, y, dy, key, text, approx?,
             target?: { sel, text?, role?, frame? },   // a click's element (E1.2): sel ≤ 500 chars, text ≤ 60, role ≤ 40, frame ≤ 8 indexes 0–999
             ms | text | milestone | quiet, timeout? }] }   // the last line is for `wait`: exactly one of the four
```

`t` is the time in milliseconds from the start of the run (0 to 3,600,000). Limits: 2,000 events and 100 KB of typed text
in all (`normaliseOptions` checks them; a `target` is only allowed on a `click`). A `click` from a frame of another origin has `approx: true` and is not
replayed. The option keeps the events sorted by `t`, and a saved run keeps the option.

### Experiment result (`experiment.json`)

`experiment --out` writes the same object as `experiment --json` (see [experiment](cli.md#experiment)). In the code, each
row of the table starts as `runResult(name, options, savedRun, extra)` in `src/experiments.js`:

```js
{ name, options, milestones, counts, errors, verdict, ...extra }   // counts: runCounts(trace)
```

`summarise(results)` adds `progress` and `better` to each row (`results[0]` is the base), and
`experimentFindings(results)` gives the findings. The JSON rows also carry `furthest`, `apiCalls`, `errors`, `verdict`
and `out` (the saved run's path, or `null`), as in [experiment](cli.md#experiment).

### Cycle result

`cycle --json` gives (the desktop and web interfaces send the same `runs`, `rows` and `findings` in the `done` event):

```js
{ package, item, base,                           // base: the options of the first run, macro included
  runs: [{ furthest, verdict, apiCalls, out }],  // run 1 (the leave) and run 2 (the resume)
  rows: [{ label, a, b }],                       // cycleRows(runs): the side-by-side table
  findings }                                     // cycleFindings({ runs, macro })
```

With `--out`, both runs are kept as saved runs (`01-first.json`, `02-resumed.json`). The second has `resume: true`
and no macro in its `launch.options` (`resumeOptions` makes it), and its `trace.cmi` holds what it was offered.

## Tests

```bash
npm test
```

The docs' links are checked in `--unit`: every relative link in a doc listed in `src/docs.js` names an existing file, and every `#anchor` matches a heading there, slugged with `slugOf` from `src/ui/markdown.js`. Links from `docs/guide/` and the user guide index must also point to docs the panel can open. Links inside code blocks are skipped.

`npm test` runs `node test/test.js`; add `--unit` for only the unit checks, or `--slow` for the extra end-to-end runs kept out of the default suite to hold it under three minutes (P1.2: `--options-from` repeating an answered run, the options file with `bodyFile`, the full `pinned` run, the `lexical` run; P1.3: `discover` text output with `--request`, `--rounds` and `--out`, `discover` on `hosted` and `good`, discovery through the web handlers; P1.4: the tracing overhead on `good`, and the whole suite again, `--slow` included, with `PACKAGE_LAB_FORCE_TRACE=1` so every run is traced; P1.5: `drill` on `levels` with `--out`, and a drill-down through the web handlers; P2.1: profiles with a delayed popup, a frameset, a late API and a CSP, and the `lms` experiment; P3.1: the corrected `blank` and `mismatch` run (no longer blank, API calls appear), and the corrected package as a web download). Run `node test/test.js --slow` at phase ends. The test builds fixtures from
`test/fixtures/base` (the toolbox SCORM 1.2 sample) in a temp folder:

The code views (P4.1) have no end-to-end run: `test/codeview.js` is pure and runs in `--unit`. It tests the handler's own function (`codeView`), so the main process is only a thin wrapper, and measures a 2 MB file (opening, then formatting). The DOM part of `src/ui/codeview.js` (drawing, virtual scrolling, search) isn't in the suite; it was checked by hand in a browser against `codeView` output. The 300 ms goal is for opening (the original text with coverage, markers and any map); formatting 2 MB takes about 0.5 s and is a second step.

| Fixture | Change | Tests |
|---|---|---|
| `good` | none | Works: initialises, no errors, coverage recorded, resume offers stored data |
| `mismatch` | Manifest says 2004 | Version finding statically; no calls; calls with API both |
| `hosted` | Asks `/api/player/config`, falls back to its own `window.API` | Server path, mode switch, own API (static and run) |
| `blank` | Empty launch page; script referenced as `js/app.js`, file `js/App.js`; missing `vendor/missing.js` | Capitals, missing file, empty page; blank-page finding with not-found evidence |
| `order` | Inline script uses `scorm` before the deferred `scorm.js` | Load-order error |
| `gated` | `lesson.js` calls `start()` only if `window.startOK` | No API calls; with `lesson.js` overridden (CLI, and over the web handlers) the API is used, the run got further and says so |
| `pinned` | `boot.js` sets `previewMode`, a `config` object and a frozen object itself, and logs what it reads | Pins hold (`previewMode`, `config.mode`, `navigator.userAgent`), the writes are reported with `boot.js`, a frozen object can't be pinned, an unread pin is noted |
| `lexical` | `boot.js` declares `let previewMode` | The can't-pin finding, and the content keeps its own value |
| `needs` | `boot.js` fetches `/api/player/config` and starts the lesson only with it; reads `cfg.lms.enabled` (truthiness), `cfg.lms.version` (`=== '2004'`) and `cfg.assets.base` (joined to text) | Discovery: the three fields with the right types, the stand-in reaches past `looked`. Its `boot.js` also runs in the unit tests, in a `vm` context with `shape-probe.js` and stand-ins for `Response`, `XMLHttpRequest` and `fetch`, to test the Proxy and the loop without Electron |
| `levels` | The lesson starts only if `window.player && player.ready`; `player` is set by `js/player.js`, which `boot.js` loads only if `config.cdn` is set; `config` comes from `data/config.json`, which has no `cdn` | The drill-down's three levels, explained down to the JSON file (`--slow`: CLI and web handlers). Its `boot.js` also feeds the drill-down unit test with hand-made events and coverage |
| `chromeonly` | `lesson.js` starts with an unguarded `navigator.userAgentData.brands` | Works in Chromium; an uncaught error in WebKit, which has no `userAgentData` |
| (cmi5, Tin Can) | built in `test/xapi.js` from the cmi5 spec's sample structure (one block, one AU) and a Tin Can course: the AU is a script that fetches its token, reads LMS.LaunchData and sends statements | See below |
| `loader` | Loading screen; `data/config.json` with a trailing comma; `js/next.js` loaded only after the config parses | Invalid JSON; stuck on loading screen; code that loads next never ran |

The desktop window (E0.1) is tested by `test/ui.js`: it opens the real app with Playwright's Electron driver (`_electron.launch`, already a devDependency) on a temporary `PACKAGE_LAB_DATA` folder, clicks through the start screen, opening `good`, Launch and Stop, Findings, the Help panel and Settings, and fails if any of them breaks. It takes about 10 s. Run it alone with `npm run test:ui`; `node test/test.js --slow` runs it too, and the default suite doesn't. The file exports its helpers (`start`, `close`, `open`, `launch`, `stop`, `view`, `text`, `menu`, `page`, `goodZip`, `contentSize`, `focusMain`, `runWindow`, `clickCourse`, `cleanup`, `withWeb`, `everyChoice`, and the `errors` list) for `scripts/screenshots.js` and later checks. Select by role and visible text, so a change to the window's layout changes the helpers and not every check. `open(zip)` restarts the app with the zip as an argument, and `menu(label)` clicks a native menu item from the main process, since Playwright's keyboard doesn't reach menu shortcuts.
`npm run screenshots` (`scripts/screenshots.js`) uses the same helpers to write the guide's pictures: `docs/images/<view>-<light|dark>.png`, 1280 × 800, one per view the guide shows. It isn't in the suite; run it when the UI changes and commit the PNGs. `PACKAGE_LAB_THEME=light|dark` sets the app's theme (`nativeTheme.themeSource`), and the docs panel draws a guide's PNG images inline from `docs/` (`inlineImages` in `src/docs.js`, up to 400 KB each).

The cmi5 and xAPI tests (P4.5) are in `test/xapi.js` and run in `--unit`: detection and parsing, validation (each rule, and that no problem text quotes a value), the LRS (every resource, the version header, auth, the fetch URL
once, concurrency, the alternate syntax, the record), `launchPlan` and `serveRequest` for both formats, the cmi5 rules one at a time over statements sent to a real LRS, the Tin Can statements and
the redacted record. The default suite runs one Electron run, the good cmi5 AU through the CLI (it reaches `terminated`, is saved with its statements, and reports, also redacted); `--slow` adds the
broken AU (`completed` before `initialized`, a verb that isn't an IRI: both findings), the Tin Can package (statements listed and validated, one refused, a state document), the web handlers,
and both in WebKit when it is installed.

The end-to-end part covers:
- **CLI:** analyze (JSON, `--strict` statuses, missing file), items, report (static and run).
- **Runs:** all fixtures, including a saved run, resume, and `--api both`. Milestones: `good` reaches at least
  `wrote` (also with the live click), `mismatch` reaches `looked`, `blank` reaches `launched` only.
- **Pins and answers:** `hosted` with `/api/player/config` answered (no own API, calls reach the LMS, request marked answered, `--options-from` repeats it, `bodyFile` read at the CLI) and with `previewMode` pinned (the change is reported at `boot.js`); `pinned` and `lexical` as above; bad flags exit with status 2.
- **Package diff (P3.3):** `good` against `blank` (no Electron, in the default suite): the changed `lesson.html` with its text diff, the added `js/App.js`, the boot-graph differences and the new findings, text and `--json` output, `--out` report, identical packages, bad arguments. Behind `--slow`, `diff --run`: `good` reaches `wrote`, `blank` only `launched`. The unit checks cover the Myers diff (minimal against an LCS table, empty sides, CRLF, 50,000-line performance bound) and `pkgdiff.js` on small packages built in memory.
- **Discovery:** `needs` (fields, types, the stand-in gets further, three runs); bad flags exit with status 2.
- **Tracing:** `hosted` with `--trace` records `if (!r.ok)` (true, `r.ok = false`), the `startCourse` entry and its
  `window.scorm` test, keeps the original `boot.js` in `trace.sources`, and has the same findings as untraced; over the
  web handlers, a traced `gated` run's Execution events and the code of one. The unit checks run a corpus of tricky
  snippets (short-circuits, getters, optional chaining, `await`, generators, classes and `super`, labelled loops,
  `switch`, comma expressions, arrow bodies, default parameters, directives, ASI, `with`, Proxies…) under `node:vm` as
  they are, instrumented with `trace-probe.js`, and instrumented with only the prelude, and compare results and logs.
- **Profiles (P2.1):** `good` (whose `scorm.js` searches `window.parent.API`) works with the generic profile and, with
  `contentOrigin: other`, gets "can't reach the LMS from another origin" from a recorded `lookup-blocked`, with its
  content frame recorded; a sandbox without `allow-same-origin` is detected; `--profile moodle` with a profile file puts
  the API on the content's parent two frames down, fails commits and fills in the launch parameters; bad profiles exit
  with status 2. The unit checks validate every preset (and their sources, once `PRESET_SOURCES_PENDING` is false), the
  checks and combinations, `apiAt`, placeholders, `nameAt`, and the findings over hand-made probes.
- **Corrected package (P3.1):** unit checks cover the writer (empty, binary, large, non-ASCII names with the UTF-8 flag, the CRC table against zlib, `unzip -t`) and each fix on small packages built in memory, the `autofix` data on findings, and the export (overrides first, change list, proof, `only`, nothing to change). The CLI checks in the default suite run `fix` on `blank` and `mismatch`, check the output with `unzip -t` and the reader, and `analyze` it (no capitals finding; no version finding; a missing script is still reported). The Electron runs on the corrected packages and the web download are `--slow`.
- **Storage (P2.2):** `stored` (boot.js reads and writes `localStorage` and only starts the lesson if that worked) works as it is and with `--storage partitioned`; with `--storage blocked` (and, with `--slow`, `--profile scorm-cloud`), it never starts, so it never looks for the API, and gets "The content needs storage the browser can block", whose evidence names the line in `boot.js`, with the one uncaught `SecurityError` it caused; with `--slow`, `good` (which uses no storage) gets no such finding, and the `storage` experiment says "With storage blocked, the content gets less far". The unit checks run the probe under `vm` (localStorage and sessionStorage throw `SecurityError`, cookies read empty, `indexedDB.open` fails to both `onerror` and listeners, Package Lab's own pages and the other modes are untouched), and cover `storageMode`, `storageFindings` and the experiment finding. A `--window` run of `good` is matched in the trace (the popup bug above).
- **Drill-down:** `drill hosted --json` names the failed `/api/player/config` request, with one run (the operand is a local).
  The unit checks cover operand paths, the branch not taken, the dead end, static assignments, the probe's watch pins
  under `vm`, and the whole chain for `levels` and `hosted` over hand-made traces.
- **Live:** a frame appears, a click on **Next** reaches the course (`lesson_location` 2), and stop ends it early.
- **Web:** 401 without the token, the token exchange, upload, launch with auto-stop, live frames over SSE, the run in
  `state`, saved runs, and `load-run` refusing paths outside the runs folder, the `options` handler building the pin and answer flags and refusing `bodyFile`.
- **Concierge module:** run as Concierge would (CGI environment, temp data folder): upload, the static report, a run,
  the report, widget and download. Skipped if `../concierge` isn't there. P5.1 adds, quickly: the form's lists against
  `doctor --json`, escaping of a package name, the CSRF token on every POST form, override paths refused (`..`,
  leading `/`, `=`), pins, responses, Fix (the ticked fixes and a replacement file in a valid zip), diff, the redacted
  report, and the run page's sections in order. With `--slow`: the form's settings reaching a run, Drill-down,
  Discover, Test saving and Try variants end to end.
- **doctor (P5.1):** the check ids in order, capabilities following the checks, the name lists, `PACKAGE_LAB_NO_PLAYWRIGHT`
  turning WebKit off, and a busy port reported. `experiment --out` also keeps `experiment.json`.
- **Platforms (E6.1):** a unit check of `src/platform.js` (`dataDir`, `appBinaries`, `executable` and `openCommand` for darwin, win32 with and without `APPDATA` or `LOCALAPPDATA`, and linux with and without `XDG_CONFIG_HOME`; `PACKAGE_LAB_APP` first; the darwin answers equal the old hard-coded paths), of `keysFor` on both platforms, and the portability lint over `src`, `bin` and `scripts`. The checks that need a Mac (Alfred's build and scripts, the installed app's version read with `plutil`, the course's system appearance in `test/ui.js`) run only on `darwin` and print one `skipped (needs a Mac)` line elsewhere. `zip`, `unzip` and `zsh` are still used by the tests and are not on a stock Windows.
- **CLI and Alfred (P5.2):** unit checks cover the command table (every command has `--json`), the zsh script (its header,
  every command's case, every flag, the preset choices), and `experimentHtml` (escaped, above the findings). The CLI checks
  (no Electron) cover every command and flag in `help`, `help`/`version`/`completion` JSON, `zsh -n` on the script when zsh
  is installed, `report --json` (and its redacted form), `serve --url --json` and `open --json` (pointed at Node
  with `PACKAGE_LAB_ELECTRON`, so nothing opens), the doctor's top-level `app` (a fake home with an `Info.plist`; it is not one of `checks`), and
  the Alfred build: `plutil -lint`, the ⇧↩ and Fix and folder actions in the plist, `bash -n` on each script, and the Fix
  script run on a file with a space in its name (`-fixed`, `-fixed-2`, `-fixed-3`, and no file when nothing needs fixing).
  The default suite runs no new Electron: `experiment --out`'s `report.html` is covered by the unit check of its HTML.

- **Browsers and device sizes (P2.3):** unit checks cover the options (presets, `WxH`, the saved `{ width, height }`, bad values), `cliCommand`,
  the `browsers` preset, `launchPlan` and `serveRequest`, and every reader of a trace with no coverage, caught errors, sources, scripts or log.
  In the default suite, the CLI refuses WebKit with a how-to-install message when `PACKAGE_LAB_NO_PLAYWRIGHT=1` makes Playwright fail to load, and `good` at `--viewport iphone` sees a 390 × 844 content frame (the probe's `dom` report).
  With `--slow` (and Playwright with its WebKit installed; otherwise they are skipped and say so): `good` in WebKit reaches `wrote` with a trace in the same format and `lab://` addresses;
  `chromeonly` (reads `navigator.userAgentData.brands` unguarded) works in Chromium and fails in WebKit with the error recorded; the iPad preset's size in WebKit; the moodle (framed) and cornerstone (popup) profiles, blocked storage and answers in WebKit; `--trace` is refused; the `browsers` experiment; the live frame's size at `--viewport ipad`; and, over the web handlers, a WebKit run and Stop.

To add a fixture, use `fixture(name, edit)`: it copies the base, calls `edit(dir)`, and zips it.

## Packaging

```bash
npm run package
```

`scripts/package.js` does the following:
1. If `build/icon.icns` is missing, renders `build/icon.svg` with Electron (`scripts/icon.cjs`), resizes it with
   `sips` and builds the `.icns` with `iconutil`.
2. Packages with `@electron/packager` for this Mac's architecture into `dist/Package Lab-darwin-<arch>/`. Tests, scripts and build files are left out. Docs are left out too, except those listed in `src/docs.js` and the folders they sit in (`docs/guide/`, `docs/packs/`), which the panel needs. devDependencies are pruned.
3. Signs ad hoc (`codesign --sign -`), so it runs on this Mac.

**A Windows build (E6.2).** `npm run package -- --platform win32 [--arch x64|arm64]` (`--platform darwin` is the default; `--arch` defaults to the host's) packages with `@electron/packager` without an `icon` (packager would run `rcedit`, which needs Wine off Windows), then:
1. makes `build/icon.ico` if missing: `scripts/icon.cjs --ico` resizes `build/icon.png` (16, 32, 48, 256 px, with Electron's `nativeImage`) and `scripts/ico.cjs` writes the PNGs into an ICO file;
2. uses `resedit` (a devDependency, pure JavaScript) to put the icon in `Package Lab.exe` and set `FileVersion`, `ProductVersion`, `ProductName`, `FileDescription` and the company and copyright text;
3. zips the folder with `src/zip.js` into `dist/Package Lab-<version>-win32-<arch>.zip`, under a top folder named like the unpacked one, leaving out symlinks (`node_modules/.bin`).

`build/icon.ico` is kept in the Windows build for the window's `icon` option (`main.js`, off the Mac). See [windows.md](windows.md).

The bundle id is `com.sylumer.package-lab`. `Info.plist` declares `.zip` files with rank Alternate, so Package Lab is in
Open With without becoming the default.

`npm run install-app` also quits a running copy, replaces `/Applications/Package Lab.app` and registers it with
LaunchServices. It isn't notarised: for other Macs, sign it with a Developer ID and notarise it (as Concierge's
`make release` does).

## The Alfred workflow

`scripts/alfred.js` writes the workflow's `info.plist` from JavaScript objects (as JSON, then `plutil -convert xml1`),
adds the icon, zips it to `dist/Package Lab.alfredworkflow` and opens it. Its objects are:
- keywords `packagelab` and `packageweb`;
- a file filter `scorm` (zip archives), with ↩, ⌘, ⇧ and ⌥ connections;
- four File Actions on a .zip (open, check, run and report, fix) and one on a folder (the batch check);
- bash Run Script actions (argv input) and notifications.

The shell of the script actions is in `scripts/alfred-scripts.js`, exported so the tests can run it (`bash -n`, and the
Fix naming on a real file). Every variable in it is quoted. The workflow variables `node`, `cli` and `wait` are filled in at
build time. To change what it does, edit the scripts in `alfred-scripts.js` (or the objects in `alfred.js`) and run
`npm run alfred` again; Alfred replaces the old copy on import.

## The Concierge module

`modules/package-lab/run` in the Concierge repo is a Python 3.9 CGI script; see [Concierge](concierge.md#how-it-works)
for what it calls. Points to keep when changing it:
- It never imports Package Lab code. It calls the CLI, so the CLI's JSON and the `--live` folder are its contract. Keep
  them backward compatible, or change both together.
- Ids in URLs are digits only (`num()`), and file names are made by the module.
- Uploaded names are reduced to a safe base name.
- Input events are re-built from known fields before they are written.
- The worker is fully detached (`start_new_session`, no inherited pipes), as Concierge requires. There are three:
  a run (`--worker`), an experiment (`--exp-worker`), and Drill-down or Discover for a run (`--task-worker`).
- The lists in the run form (profiles, tools, device sizes, presets, fixes, whether WebKit works) come from
  `package-lab doctor --json`, kept in `doctor.json` for five minutes. A new profile or tool shows up with no change to the
  module. If `doctor` fails, the form falls back to the plain settings.
- Replacement files are stored under a number (`overrides/<k>`) and the package path is only ever an argument
  (`--override path=file`), never a path the module opens. Paths with `..`, a leading `/`, a backslash or `=` are refused;
  so are pin names and response patterns with `=` (the CLI splits there).
- A run copies the package's overrides, pins and responses into its `job.json` when it starts, so it can be reproduced.
- Experiments run `experiment --out <folder>` and the page reads the saved runs as they appear (names from the CLI's
  progress lines in the log), then `experiment.json` when it is done. Test saving is `cycle --out`; its second run
  is copied to `run.json`, so the report, downloads and Run again work as for a run.
- Drill-down and Discover run `drill`/`discover --options-from run.json --json`, so they repeat the run's own options.
- It is tested from `test/test.js` here.

## Debugging

- **Watch a headless run:** `package-lab run course.zip --show`.
- **DevTools on a run window:** in the desktop app, focus the course window and press ⌥⌘I. The recorder is already
  attached, but Chrome allows DevTools alongside it.
- **Raw evidence:** `package-lab run course.zip --out run.json`, then read `run.json` (see the format above), or open
  it in the desktop app.
- **Isolate data:** `PACKAGE_LAB_DATA=/tmp/lab npm start` keeps saved runs and the web token out of your real ones.
- **Electron's output in a CLI run** goes to `electron.log` in the job's temp folder, which is deleted afterwards. To
  keep it, run Electron directly: `npx electron . --run=/path/job.json`.
- **Recompute findings** after changing rules: re-open a saved run (findings are recomputed on load), or call
  `launchFindings`, `runFindings` and `bootGraph().risks` on it from a Node script.

**Docs search, contents and context help (E3.2).** `markdown.js` exports `headings(md)` (`[{ level, text, id }]`, ids identical to the renderer's, code fences skipped) and `searchDocs(docs, query)` (docs are `[{ name, title, text }]`; up to 20 hits, the first per line, each with the nearest heading above and an `html` snippet: the text is escaped first, then the match is wrapped in `<mark>`). In Help, `#doc-search` (debounced 150 ms) loads every doc once into `docs.text` through the `doc` handler and fills `#doc-results`; `#doc-toc` lists the open doc's level 2 and 3 headings. Context help is a `button.info` with `data-help` naming a guide page and heading, and `aria-label="Help: <name>"`: in `index.html` for the Settings groups and Storage, from `infoBtn()` in `app.js` for the sidebar groups (`GROUP_HELP`) and the verdict banner. One delegated click listener on `document` opens the target with `openDoc`. The `--unit` link check collects every `data-help="…"` value in `index.html`, the targets passed to `infoBtn(` in `app.js` and the values of `GROUP_HELP`, and checks each names a doc and heading that exist, so write a target as a string literal in one of those places. The ⓘ for a Settings group sits in a `.gwrap` beside its `<details>` (not inside `<summary>`), and Storage's in `.field-help` beside its label.
