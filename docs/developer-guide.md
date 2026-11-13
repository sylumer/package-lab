# SCORM Lab developer guide

How SCORM Lab is built, the formats it reads and writes, and how to change it.

- [Principles](#principles)
- [Layout](#layout)
- [Architecture](#architecture)
- [The main process](#the-main-process)
- [Serving the package: lab://](#serving-the-package-lab)
- [The test LMS](#the-test-lms)
- [The probe](#the-probe)
- [The recorder](#the-recorder)
- [Static analysis](#static-analysis)
- [The boot graph](#the-boot-graph)
- [Findings](#findings)
- [Adding a finding](#adding-a-finding)
- [Comparison](#comparison)
- [Reports](#reports)
- [Interfaces](#interfaces)
- [Data formats](#data-formats)
- [Tests](#tests)
- [Packaging](#packaging)
- [The Alfred workflow](#the-alfred-workflow)
- [The Concierge module](#the-concierge-module)
- [Debugging](#debugging)

## Principles

- **Nothing leaves the machine.** No telemetry, no network calls of SCORM Lab's own, and no AI services. Packages are
  read in memory.
- **Evidence, then findings.** The recorder and the static analysis collect facts. Findings are pure functions over
  those facts, so they can be recomputed from a saved run and tested without Electron.
- **One run explains itself.** Diagnosis must not need a working copy. Comparison is an extra.
- **No runtime dependencies.** The app uses Electron, Node's standard library and the browser; only packaging needs
  `@electron/packager`. The ZIP and XML readers are small and written here.
- **ES modules** throughout, except `src/preload.cjs` (Electron preloads in a sandbox must be CommonJS) and
  `scripts/icon.cjs`.

## Layout

```
bin/scorm-lab.js        CLI
src/
  main.js               Electron main process: windows, lab:// server, runs, IPC and web handlers, headless runs
  preload.cjs           window.lab for the desktop window (IPC)
  web.js                HTTP server for the web interface (API, events, live frames, auth)
  recorder.js           CDP recorder: one per run window or popup
  host/                 Loaded inside the run window
    host.html, host.js  The test LMS page
    wrap.html           An empty LMS frame (for frame depth)
    scorm-runtime.js    SCORM 1.2 and 2004 run-time (from toolbox)
    probe.js            Injected into every frame: API lookups, assignments, wrapped calls, DOM snapshots
  zip.js, xml.js        Readers
  options.js            Launch options: normaliseOptions (the only place defaults live), cliCommand
  analyze.js            Manifest and script scan
  bootpath.js           Boot graph (how the launch should load) and bootRun (against a run)
  rules.js              Findings: static, run, launch, comparison
  diff.js               Comparison of two runs
  report.js             HTML reports, verdict, counts
  ui/                   The interface (desktop window and web)
    index.html, style.css, app.js
    bridge.js           window.lab over HTTP when there is no preload (web)
scripts/
  package.js            Builds SCORM Lab.app (and --install)
  icon.cjs              Renders build/icon.svg to build/icon.png
  alfred.js             Builds the Alfred workflow
build/icon.svg          The app icon
test/test.js            Tests; test/fixtures/base is the sample package
docs/                   User and developer documentation
```

The Concierge module is in the Concierge repo at `modules/scorm-lab/run`.

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

`SCORM_LAB_DATA` replaces the data folder (`app.getPath('userData')`, by default
`~/Library/Application Support/SCORM Lab`) for the first two modes.

The rest of the file, in order:

- **State:** one package (`pkg`: name, files Map, analysis, cached boot graphs, `lastCmi`) and at most one active run
  (`active`: window, popups, recorders, launch settings, boot graph, auto-stop timer). Finished runs are kept in a Map
  for the session.
- **`emit(channel, data)`:** sends to the desktop window over IPC and to web clients over server-sent events.
  Channels: `package`, `run`, `state`, `probe`.
- **`begin()` and `finish()`:** open a run window, start the recorder on `about:blank` (the debugger needs a renderer
  before the content loads), then navigate. `finish()` reads the stored data model, stops the recorders (merging
  popups), destroys the windows, computes findings and saves the run.
- **`live`:** frames and input for the live view. It captures `capturePage()` every 400 ms while someone is watching
  (a web client on `/api/live`, or a headless run with a live folder), and sends a frame only when it changed. Input
  goes to the newest window through `sendInputEvent` and `insertText`. Hidden windows render and take input.
- **`handlers`:** the interfaces' API. They are registered with `ipcMain.handle` and passed to the web server.
- **Start-up:** handles `open-file` (Finder, `open -a`, Alfred), the single-instance lock, and window creation.
- **`headless()`:** the `--run` mode. It reads input files from the live folder while it waits.

### Launch options

`src/options.js` is the one place that knows the options and their defaults. `normaliseOptions(o)` fills in defaults,
validates every field and throws on unknown fields or bad values. Numbers may arrive as strings (UI selects). Adding an
option means: a default and a check in `options.js`, then a flag (or just the `--options` file), a control in the UI,
and a line in the guides. The shape:

```
{ expose: 'manifest'|'both'|'1.2'|'2004'|'none', depth: 0–5, opener, resume, caught (bool), auto (s, 0 = until stopped),
  wait (s, headless runs), profile: 'none', browser: 'chromium', viewport: null | { width, height },
  files: { path: text }, pins: [], responses: [], storage: 'normal', trace: false }
```

`launchItem` takes `{ item, cmi?, ...options }`, normalises the options and saves them in `launch.options` (the older
`launch` fields stay for version 1 readers). The CLI merges the `--options` file and then the flags, normalises, and
writes the result to the job file as `options`; the headless run normalises it again. `cliCommand(options, { zip, item })`
builds the line for **Copy as CLI command**; fields without a flag become `--options options.json`.

### Handlers

| Name | Argument | Returns |
|---|---|---|
| `open-package` | — | Package info (desktop only: opens a dialog) |
| `state` | — | `{ pkg, runs, running, web }`: everything a new client needs |
| `boot` | `{ item }` | The boot graph for a manifest item index |
| `launch` | `{ item, cmi?, …launch options }` (flat; unknown options throw) | `true` |
| `options` | `{ item?, …launch options }` | `{ options, command }`: the normalised options and the equivalent `scorm-lab run` line |
| `reference` | `{ url, caught, auto }` | `true` |
| `stop` | — | The run's id, or null |
| `compare` | `{ ref, run }` | `{ cmp, findings }` |
| `open-run` | — | Run summaries (desktop only: opens a dialog) |
| `saved-runs` | — | `[{ file, size, mtime }]` from the runs folder |
| `load-run` | `{ file }` | `[run summary]`. The name is reduced to a base name in the runs folder |
| `source` | `{ run, url }` | A script's source from a run |
| `live-input` | an input event | `true` if delivered |

Package info is `{ name, loaded, analysis, findings, items: [{ index, title, type, depth, href }] }`. A run summary is
the run without script sources and raw coverage, with `boot.nodes` already matched against the run (`bootRun`).

## Serving the package: lab://

`lab://` is registered as privileged (standard, secure, fetch, CORS, stream) and handled on the `lab` session
partition only.

- `lab://run/pkg/<path>`: a file from the ZIP in memory, with its MIME type and `Range` support (for media). A
  missing file is a plain-text 404, so failed requests are visible.
- `lab://run/__lab/<file>`: the host files, and `config.json` (the launch settings).
- Any other path, such as `lab://run/api/…`, is a 404. This is how content asking for server-root paths shows up:
  `rules.js` reports requests to `lab://run/` outside `pkg/` and `__lab/`.

Content runs sandboxed with context isolation, without Node.

## The test LMS

`host.js` reads `config.json`:

```
{ expose: '1.2' | '2004' | 'both' | 'none', depth, opener, launch (URL), cmi, runtime: { … from the manifest item } }
```

It makes the API objects with `scormRuntime` (`scorm-runtime.js`, copied from toolbox: full data models, error codes
and validation for 1.2 and 2004), and puts them on its window as `API` and `API_1484_11`. Then it frames the content,
through `wrap.html#<n>|<url>` for depth, or opens it with `window.open` for the opener setting. Every call is reported
through `__labReport` as `{ type: 'api', version, call, el, value, result, err, diag }`. `window.__labCmi()` returns
the stored values; `finish()` reads it.

## The probe

`host/probe.js` is added to every frame before its own scripts (`Page.addScriptToEvaluateOnNewDocument`, on every
auto-attached target too). It reports through the `__labReport` binding:

| Report | When |
|---|---|
| `{ type: 'frame', depth, topReachable, opener, referrer }` | Once per frame |
| `{ type: 'lookup', name, found, n, stack }` | Each read of `window.API` or `window.API_1484_11` (an accessor property). Throttled to the first three per call site, then every hundredth, because content polls |
| `{ type: 'assign', name, kind, keys, stack }` | Each assignment to those names |
| `{ type: 'api', …, host: true }` | Calls to an API object the probe wrapped: one on a real LMS (references), or content's own object in a package run |
| `{ type: 'dom', readyState, text, sample, visible, media, frames, loader, hidden, elements, w, h }` | What the frame shows. Sent at DOMContentLoaded, load, page hide, and 1–60 s after start, only when it changes. Not sent from SCORM Lab's host pages |

The recorder adds `t` (ms since start), `sid` and `frame` (the frame's URL).

## The recorder

`Recorder` (`src/recorder.js`) attaches the Chrome DevTools Protocol to a window's `webContents.debugger`. It
auto-attaches to every frame, worker and popup target (flattened, paused until set up, so nothing is missed). For each
session it enables:

| Domain | Records |
|---|---|
| Runtime | The `__labReport` binding, console output, uncaught exceptions |
| Debugger | Every parsed script, with the stack that loaded it. Pauses on all exceptions and resumes at once, to record caught errors |
| Network | Requests with their initiator and outcome |
| Log | Browser messages (CSP, mixed content, MIME type) |
| Profiler | Precise block coverage with call counts |
| Page | Navigations, and adds the probe |

`stop()` takes coverage and script sources from every session still open. The lists are capped (5,000 scripts,
10,000 requests…); `truncated` says which overflowed.

## Static analysis

`analyze(files)` (`src/analyze.js`) returns:

```
{ files, size, root, problems: [{ code, text }], fingerprints: [tool], scan: { file: { api12, api04, search, requests,
  absolute, serverPaths, hostChecks, modeSwitches, apiDefine } }, manifest, apiUse: '1.2' | '2004' | 'both' | 'none' }
```

- `parseManifest` resolves `xml:base` at the manifest, resources and resource levels. It flattens items with depth,
  resource, parameters, mastery score and the other run-time values from the manifest.
- `scanText` is a set of regular expressions over every script and page. Each list holds up to 20 `{ line, match,
  text }` per file.
- `FINGERPRINTS` recognises authoring tools by file names and text. Text patterns use word boundaries, so
  `querySelectorAll` isn't Lectora.

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

## Findings

A finding is:

```js
{ sev: 'error' | 'warn' | 'info', title, detail?, evidence?: [string], fix? }
```

| Function | Input | Covers |
|---|---|---|
| `staticFindings(analysis)` | `analyze()` | Manifest problems, version mismatch, server paths, own API, mode switches, tool |
| `bootGraph().risks` | files | Everything in [the boot graph](#the-boot-graph) |
| `launchFindings(trace, boot)` | a run and its boot graph | Launch page not loaded, blank page, stuck loading screen (with causes in loading order), loading stopped, loading code never ran |
| `runFindings(trace, launch)` | a run and its launch settings | API never looked for, not found, found but not called, own API object, top unreachable, server requests, failed requests, uncaught errors, refusals, caught errors, and progress (failed calls, finish, commit, suspend data, exit, completion) |
| `compareFindings(cmp)` | `compare()` | First divergence, branches, differing files, errors only in the run |

`sortFindings` orders by severity (stable, so each function's own order is kept within a severity). `verdict()` in
`report.js` is the first error, else the first warning, else ok. Every finding is listed for users in
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

## Reports

`renderReport({ title, subtitle, findings, boot, run, analysis, fragment })` (`src/report.js`) returns a full HTML
page, or a `<div class="sl">` fragment with scoped styles. The fragment uses the host page's `--err`, `--warn`, `--ok`,
`--line`, `--muted` and `--code` if they are defined. Everything interpolated goes through `esc()`. `counts()` and
`screens()` are shared with the CLI's JSON output.

## Interfaces

### Desktop window

`src/ui/app.js` is plain DOM code. `h(tag, props, ...kids)` builds elements; `VIEWS[tab]()` returns a tab's content;
`render()` redraws the tabs, the view and the runs list from `st`. It talks only through `window.lab`:
`lab.invoke(name, arg)` and `lab.on(channel, fn)`.

The page's CSP allows only its own scripts and styles, and `data:` images (for live frames).

### Web interface

`src/web.js` serves `src/ui/` and the API:

| Method and path | Does |
|---|---|
| `GET /?token=…` | Checks the token and sets the cookie, then redirects to `/` |
| `GET /`, `GET /<ui file>` | The interface |
| `POST /api/invoke/<handler>` | JSON body, then `{ value }` or `{ error }` (status 500). `open-package` and `open-run` are refused |
| `POST /api/upload?name=` | Raw `.zip` body (up to 1 GB), then `{ value: package info }` |
| `GET /api/events` | Server-sent events: `package`, `run`, `state`, `probe` |
| `GET /api/live` | Server-sent events: `frame` with `{ w, h, t, jpeg (base64) }`. Open connections count as watchers |

Every request except the token exchange needs the `scormlab` cookie, compared in constant time. Responses carry
`no-store`, `nosniff`, `DENY` framing and `no-referrer`. The token is 24 random bytes, kept in `<userData>/web-token`
with mode 600.

`src/ui/bridge.js` defines `window.lab` over these endpoints when there is no preload, and adds `lab.web`,
`lab.upload(file, progress)` and `lab.live(fn)`. `app.js` checks `lab.web` for the differences (upload, saved-runs
dialog, Live tab, joining a session in progress).

### CLI

`bin/scorm-lab.js` does static work in Node, importing the same modules. For runs, it writes a job file to a temp
folder:

```json
{ "zip": "/abs/course.zip", "item": 0, "expose": "manifest", "depth": 0, "opener": false, "caught": true,
  "resumeFrom": null, "wait": 10, "out": "/abs/run.json", "live": null }
```

It then runs Electron with `--run=<job>` (stdout ignored, stderr to a log), waits for `out`, and reads the run back.
`item` here is the manifest item index; the CLI's `--item` numbers are positions among launchable items. Electron is
chosen from `SCORM_LAB_ELECTRON`, then this repo's `electron` package, then `/Applications/SCORM Lab.app`.

## Data formats

### Saved run (`scorm-lab-run`, version 1)

```js
{
  format: 'scorm-lab-run', version: 1,
  kind: 'package' | 'reference', label, package,          // package file name
  launch: { version, expose, depth, opener, item, itemIndex, itemType, url, resume, options },  // reference: { url }; options (added in P0.1) is the normalised launch options
  findings: [finding],                                     // as computed when saved; readers recompute
  boot: bootGraph | null,
  trace: {
    label, started, ended, duration,                       // ISO times, ms
    targets:    [{ t, sid, parent, type, url }],
    scripts:    [{ t, sid, id, url, hash, length, module, sourceMap, from: [frame] }],
    requests:   [{ t, sid, id, url, method, type, initiator, from: [frame], status?, mime?, failed?, canceled?, redirect? }],
    navigations:[{ t, sid, frame, parent, url }],
    console:    [{ t, sid, level, text, at: [frame] }],
    exceptions: [{ t, sid, text, url, line, at: [frame] }],
    caught:     [{ t, sid, text, uncaught, at: [frame] }],
    log:        [{ t, sid, level, source, text, url }],
    probe:      [probe report],                            // see The probe
    coverage:   [{ sid, id, url, hash, fns: [[name, [start, end, count, …]]] }],
    sources:    { url: source },
    truncated:  { list: true },
    cmi:        { '1.2'?: { element: value }, '2004'?: { … } } | null
  }
}
```

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

## Tests

```bash
npm test
```

`npm test` runs `node test/test.js`; add `--unit` for only the unit checks. The test builds fixtures from
`test/fixtures/base` (the toolbox SCORM 1.2 sample) in a temp folder:

| Fixture | Change | Tests |
|---|---|---|
| `good` | none | Works: initialises, no errors, coverage recorded, resume offers stored data |
| `mismatch` | Manifest says 2004 | Version finding statically; no calls; calls with API both |
| `hosted` | Asks `/api/player/config`, falls back to its own `window.API` | Server path, mode switch, own API (static and run) |
| `blank` | Empty launch page; script referenced as `js/app.js`, file `js/App.js`; missing `vendor/missing.js` | Capitals, missing file, empty page; blank-page finding with not-found evidence |
| `order` | Inline script uses `scorm` before the deferred `scorm.js` | Load-order error |
| `loader` | Loading screen; `data/config.json` with a trailing comma; `js/next.js` loaded only after the config parses | Invalid JSON; stuck on loading screen; code that loads next never ran |

The end-to-end part covers:
- **CLI:** analyze (JSON, `--strict` statuses, missing file), items, report (static and run).
- **Runs:** all fixtures, including a saved run, resume, and `--api both`.
- **Live:** a frame appears, a click on **Next** reaches the course (`lesson_location` 2), and stop ends it early.
- **Web:** 401 without the token, the token exchange, upload, launch with auto-stop, live frames over SSE, the run in
  `state`, saved runs, and `load-run` refusing paths outside the runs folder.
- **Concierge module:** run as Concierge would (CGI environment, temp data folder): upload, the static report, a run,
  the report, widget and download. Skipped if `../concierge` isn't there.

To add a fixture, use `fixture(name, edit)`: it copies the base, calls `edit(dir)`, and zips it.

## Packaging

```bash
npm run package
```

`scripts/package.js` does the following:
1. If `build/icon.icns` is missing, renders `build/icon.svg` with Electron (`scripts/icon.cjs`), resizes it with
   `sips` and builds the `.icns` with `iconutil`.
2. Packages with `@electron/packager` for this Mac's architecture into `dist/SCORM Lab-darwin-<arch>/`. Tests, docs,
   scripts and build files are left out; devDependencies are pruned.
3. Signs ad hoc (`codesign --sign -`), so it runs on this Mac.

The bundle id is `com.sylumer.scorm-lab`. `Info.plist` declares `.zip` files with rank Alternate, so SCORM Lab is in
Open With without becoming the default.

`npm run install-app` also quits a running copy, replaces `/Applications/SCORM Lab.app` and registers it with
LaunchServices. It isn't notarised: for other Macs, sign it with a Developer ID and notarise it (as Concierge's
`make release` does).

## The Alfred workflow

`scripts/alfred.js` writes the workflow's `info.plist` from JavaScript objects (as JSON, then `plutil -convert xml1`),
adds the icon, zips it to `dist/SCORM Lab.alfredworkflow` and opens it. Its objects are:
- keywords `scormlab` and `scormweb`;
- a file filter `scorm` (zip archives), with ↩, ⌘ and ⌥ connections;
- three File Actions;
- bash Run Script actions (argv input) and notifications.

The workflow variables `node`, `cli` and `wait` are filled in at build time. To change what it does, edit the scripts
in `alfred.js` and run `npm run alfred` again; Alfred replaces the old copy on import.

## The Concierge module

`modules/scorm-lab/run` in the Concierge repo is a Python 3.9 CGI script; see [Concierge](concierge.md#how-it-works)
for what it calls. Points to keep when changing it:
- It never imports SCORM Lab code. It calls the CLI, so the CLI's JSON and the `--live` folder are its contract. Keep
  them backward compatible, or change both together.
- Ids in URLs are digits only (`num()`), and file names are made by the module.
- Uploaded names are reduced to a safe base name.
- Input events are re-built from known fields before they are written.
- The worker is fully detached (`start_new_session`, no inherited pipes), as Concierge requires.
- It is tested from `test/test.js` here.

## Debugging

- **Watch a headless run:** `scorm-lab run course.zip --show`.
- **DevTools on a run window:** in the desktop app, focus the course window and press ⌥⌘I. The recorder is already
  attached, but Chrome allows DevTools alongside it.
- **Raw evidence:** `scorm-lab run course.zip --out run.json`, then read `run.json` (see the format above), or open
  it in the desktop app.
- **Isolate data:** `SCORM_LAB_DATA=/tmp/lab npm start` keeps saved runs and the web token out of your real ones.
- **Electron's output in a CLI run** goes to `electron.log` in the job's temp folder, which is deleted afterwards. To
  keep it, run Electron directly: `npx electron . --run=/path/job.json`.
- **Recompute findings** after changing rules: re-open a saved run (findings are recomputed on load), or call
  `launchFindings`, `runFindings` and `bootGraph().risks` on it from a Node script.
