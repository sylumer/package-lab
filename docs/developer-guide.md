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
- [The execution trace](#the-execution-trace)
- [The drill-down](#the-drill-down)
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
  `@electron/packager`. The ZIP and XML readers are small and written here. Vendored code lives in `src/vendor/`, each
  file with its licence (see [Layout](#layout)).
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
    shape-probe.js      Injected ahead of probe.js when a run answers with @probe: the recording Proxy (P1.3)
    trace-probe.js      Injected ahead of probe.js in a traced run: __labT, __labR, __labC and the event ring (P1.4)
  vendor/
    acorn.js            acorn 8.19.0: dist/acorn.mjs from npm pack acorn, unchanged (MIT; acorn.LICENSE). instrument.js's parser
  zip.js, xml.js        Readers
  pins.js               Pins and answers: matching, the probe's prefix, the findings, the CLI's spellings
  shape.js              What the content wants from its server: reads → shape, the discovery loop, its findings
  instrument.js         The execution trace: instrumenting scripts and pages, positions back to the originals, reading events
  drilldown.js          Why it stopped: key decisions, where each undefined came from, the chain and its finding
  overlay.js            Overrides: the file set a run is served from, and the findings about changed files
  textdiff.js           A small LCS line diff (diffLines, unified)
  stall.js              Why it stalled: pollers, unanswered messages, listeners that never ran, and the finding (P1.6)
  milestones.js         Milestones (where a run got to on the SCORM path) and progress (comparing two runs)
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
  Channels: `package`, `run`, `state`, `probe`, `experiment`, `discover`, `drill`.
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
  files: { path: { content } | { base64 } },
  pins: [{ path, value (JSON), frames: 'content'|'all', mode: 'force' } | { path, frames, mode: 'watch' }],
  responses: [{ match, method?, status, headers, body }], launchParams: 'a=1&b=2', storage: 'normal', trace: false }
```

`launchItem` takes `{ item, cmi?, ...options }`, normalises the options and saves them in `launch.options` (the older
`launch` fields stay for version 1 readers). The CLI merges the `--options` file and then the flags, normalises, and
writes the result to the job file as `options`; the headless run normalises it again. `cliCommand(options, { zip, item })`
builds the line for **Copy as CLI command**; fields without a flag become `--options options.json`. Pins and responses get `--pin` and `--answer` when the flag can say everything in them (`frames: 'content'`, no method or headers), and `--options options.json` when not.

### Handlers

| Name | Argument | Returns |
|---|---|---|
| `open-package` | — | Package info (desktop only: opens a dialog) |
| `state` | — | `{ pkg, runs, running, web }`: everything a new client needs |
| `boot` | `{ item }` | The boot graph for a manifest item index |
| `launch` | `{ item, cmi?, …launch options }` (flat; unknown options throw) | `true` |
| `options` | `{ item?, …launch options }` | `{ options, command }`: the normalised options and the equivalent `scorm-lab run` line |
| `reference` | `{ url, caught, auto }` | `true` |
| `files` | — | Every file of the package (and added override paths): `[{ path, size, text, overridden }]` |
| `file` | `{ path }` | `{ path, size, text, tooBig, overridden, content, original }`. `content` is the text (the override if there is one), `null` for binary or over 1 MB; `original` the unchanged text when overridden |
| `override-set` | `{ path, content }` or `{ path, base64 }` | The overrides list. Setting a file to exactly its original removes the override |
| `override-revert` | `{ path? }` | The overrides list; no path reverts all |
| `override-diff` | `{ path }` | `{ binary: false, diff (unified), added }` or `{ binary: true, before, after }` |
| `experiment-presets` | — | The preset names |
| `experiment-start` | `{ item, preset? (default `standard`), variants?, …launch options (the base) }` | The variant names, at once; progress comes as `experiment` events. Throws if a run or experiment is under way |
| `experiment-stop` | — | `true`: stops the run in progress and the rest of the experiment (or discovery) |
| `discover-start` | `{ item, request?, rounds? (1–10, default 5), …launch options (every run's) }` | `true`, at once; progress comes as `discover` events. Throws on bad rounds or pattern, or if a run, experiment or discovery is under way |
| `discover-stop` | — | `true`: stops the run in progress and the rest of the discovery |
| `drill-start` | `{ run }` (a run id) | `true`, at once; progress comes as `drill` events (see [The drill-down](#the-drill-down)). Throws if the run isn't a package run, its package isn't the one open, or a run, experiment, discovery or drill-down is under way |
| `drill-stop` | — | `true`: stops the run in progress and the rest of the drill-down |
| `stop` | — | The run's id, or null |
| `compare` | `{ ref, run }` | `{ cmp, findings }` |
| `open-run` | — | Run summaries (desktop only: opens a dialog) |
| `saved-runs` | — | `[{ file, size, mtime }]` from the runs folder |
| `load-run` | `{ file }` | `[run summary]`. The name is reduced to a base name in the runs folder |
| `source` | `{ run, url }` or `{ run, path }` | A script's source from a run, by address; or by package path (the Execution tab): the script as recorded, or for a page, the file the run was served (its changed file, or the open package's if it is that package), else `''` |
| `live-input` | an input event | `true` if delivered |

Package info is `{ name, loaded, analysis, overrides: [{ path, size, binary, added }], findings, items: [{ index, title, type, depth, href }] }`. A run summary is
the run without script sources and raw coverage, with `boot.nodes` already matched against the run (`bootRun`).

## Serving the package: lab://

`lab://` is registered as privileged (standard, secure, fetch, CORS, stream) and handled on the `lab` session
partition only.

- `lab://run/pkg/<path>`: a file from the ZIP in memory, with its MIME type and `Range` support (for media). A
  missing file is a plain-text 404, so failed requests are visible.
- `lab://run/__lab/<file>`: the host files, and `config.json` (the launch settings).
- In a traced run (`options.trace`), `.js`, `.mjs`, `.html` and `.htm` files under `pkg/` are served instrumented: see
  [The execution trace](#the-execution-trace).
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
| `{ type: 'pin-read', path, n, stack }` | Each read of a pinned value (an accessor property). Throttled like lookups |
| `{ type: 'pin-write', path, value, n, stack }` | Each assignment to a pinned name; the pin ignores it. `value` is a short text preview |
| `{ type: 'watch-read', path, n, stack }`, `{ type: 'watch-write', path, value, n, stack }` | A watch pin (P1.5): each read and write of the watched value, which passes through unchanged. Throttled like lookups |
| `{ type: 'pin-failed', path, error }` | The pin couldn't be defined: a frozen object, a name the browser won't redefine |
| `{ type: 'shape', url, path, use, n, stack }` | From `shape-probe.js`, only in runs that answer with `@probe`: a read of `path` (dotted, from the top of the response) in the response from `url` (`use: 'read'`), or how a missing value was used: `in`, `keys`, `array` (iterated, `length`, an array method called), `string` (a string method called, or turned into a string), `number` (turned into a number), `text` (`+` or `==`). Throttled like lookups per path, use and call site; at most 3,000 per frame |
| `{ type: 'exec', events, wrapped }` | From `trace-probe.js`, in traced runs only: a batch of execution trace events. The recorder puts these in `trace.exec`, not `trace.probe` |
| `{ type: 'timers', raf, sites, list }` | From the timer hooks (not in SCORM Lab's host pages): a summary of `setTimeout` and `setInterval` per kind and call site. `list` is `[kind, delay, created, fired, cleared, msSinceLastRun]` and `sites[i]` is the caller's stack line for `list[i]`. `raf` counts `requestAnimationFrame` calls. At most once a second for the first 30, then every 5 s, and when the page hides or the recorder stops. The recorder's own `t` is when it arrived; the last one of a frame is the state at the end |
| `{ type: 'listener', id, stack }`, `{ type: 'msg-run', id, n }` | A `message` listener (a function, on a window) registered, and each run of it (the first five of each, then every hundredth). `id` is per frame |
| `{ type: 'post', to, shape, origin, n, stack }` | A `postMessage` call, reported by the realm of the window it was called on, so `to` is that window's URL (empty for another origin, where it can't be read). `shape` is `{ kind, value? }` for a primitive, `{ kind: 'array' }`, `{ kind: 'object' }` (a class instance or other non-plain object), or `{ kind: 'object', keys (first 5), vals }` for a plain object (read by descriptor, no getters), where `vals` has only numbers, booleans and strings of 80 characters or less; every stored string (keys, origin, kind) is cut at 80 characters. Residual: a `Proxy` can't be told from an object, so its `getPrototypeOf` trap (and `ownKeys`, if it looks plain) runs when it is inspected. Throttled per target and shape (the first 10, then every hundredth; at most 200 distinct kinds per frame, then none) |
| `{ type: 'dom', readyState, text, sample, visible, media, frames, loader, hidden, elements, w, h }` | What the frame shows. Sent at DOMContentLoaded, load, page hide, and 1–60 s after start, only when it changes. Not sent from SCORM Lab's host pages |

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
auto-attaches to every frame, worker and popup target (flattened, paused until set up, so nothing is missed). For each
session it enables:

| Domain | Records |
|---|---|
| Runtime | The `__labReport` binding, console output, uncaught exceptions |
| Debugger | Every parsed script, with the stack that loaded it. Pauses on all exceptions and resumes at once, to record caught errors |
| Network | Requests with their initiator and outcome |
| Log | Browser messages (CSP, mixed content, MIME type) |
| Profiler | Precise block coverage with call counts |
| Page | Navigations, and adds the probe (ahead of it, the run's pins, `shape-probe.js` with its patterns if a response is `@probe`, and `trace-probe.js` in a traced run) |
| Fetch | Only when the run has `responses`: every request is paused; those a response matches are fulfilled, the rest continue |
| Emulation | Only with a `navigator.userAgent` pin: `setUserAgentOverride` |

`stop()` takes coverage and script sources from every session still open (in a traced run, it first asks every frame
of every session to send its pending trace events: `Runtime.evaluate` with `silent`, so a cross-origin frame's refusal
isn't recorded as a caught error). The lists are capped (5,000 scripts,
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
500 from `lastEvents`, worked out once per run). The `source` handler takes `{ run, path }` too, for the Execution tab.

`SCORM_LAB_FORCE_TRACE=1` makes `launchItem` trace every run: the tests use it.

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
**Drill-down** tab for that run.

## Pins and answers

`src/pins.js` is pure. A **pin** is `{ path, value, frames, mode }` in `options.pins` (checked in `options.js`; `mode` is `'force'` or `'watch'`, `PIN_MODES` in `pins.js`). A **watch** pin (`{ path, frames, mode: 'watch' }`, no value; the drill-down adds them) records reads and writes without forcing anything: its leaf is an accessor that passes the value through (or the original accessor's getter and setter), non-enumerable if the name didn't exist until it is written. Intermediate names of dotted paths share one accessor per object and name (`hooks` in `probe.js`), so `config.a` and `config.b` both follow a new `config`, and a watch on `config` itself reports through that shared accessor; pins are installed longest path first for that. `pinFindings` ignores watch pins. The recorder puts `globalThis.__labPins = [...]` ahead of `probe.js` (`pinPrefix`, applied through `Page.addScriptToEvaluateOnNewDocument` in every page and iframe); the probe reads and deletes it, drops the pins whose `frames` doesn't cover this frame (`'content'` excludes SCORM Lab's own `lab://run/__lab/` pages) and installs each one. A top-level name becomes an accessor on `window`: the getter returns the value and reports `pin-read`, the setter ignores the assignment and reports `pin-write`, so `var x = …` at the top of a classic script assigns through it. A dotted path is an accessor on the root that, when given an object, installs the next segment on that object, and so on; a frozen object makes `defineProperty` throw, which is reported as `pin-failed`. The accessors are `configurable: true` (the plan said `false`) so that a top-level `let` or `const` in the content creates its own binding instead of a SyntaxError that would stop the whole script; `pinFindings` then recognises that case (the pin was never read or written, and `lexicalDeclaration` finds a column-0 `let`/`const` of the root name in `trace.sources`) and says so. Inline scripts count only if the browser recorded them under their page's URL; a `let` inside a function or an indented block isn't a global and isn't matched. `navigator.userAgent` is the exception: `userAgentPin` gives the value, and the recorder sends `Emulation.setUserAgentOverride` to every session. `location` and the other `navigator` names are refused; `launchParams` goes on the launch URL instead.

An **answer** is `{ match, method?, status, headers, body }` in `options.responses`. With responses set, `Recorder.setup` calls `Fetch.enable` (all URLs, request stage) on every session. `Fetch.requestPaused` runs `answerFor(responses, url, method)`: the first response that matches (glob or `/regex/flags`, tried on the whole URL, the path with query, and the path) and isn't for `lab://run/__lab/` is sent with `Fetch.fulfillRequest` (`buildAnswer`: base64 body, a content type guessed from the body if none, CORS opened if not set; a body starting `@probe` is a [probing answer](#discovery-what-the-content-wants-from-its-server)); everything else gets `Fetch.continueRequest`. The matching request in `trace.requests` gets `answered: true` and `answeredBy` (the response's index in the list). `networkId` links the paused request to the Network event, which can arrive on either side of it. Responses apply to package runs only, in every frame and popup. `bodyFile` isn't an option: only the CLI reads files (`--answer pattern=@file`, or a response's `bodyFile` in an `--options` file, relative to that file) and it puts the text in `body`; `normaliseOptions` refuses `bodyFile`, so the web handlers can't be made to read a path.

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
and SCORM Lab's pages, one per `requestPattern`: the path for the host's root, origin and path for another site); then
`round n` with a probing response per pattern ahead of the base responses: `@probe` in round 1, `@probe <skeleton so
far>` after. It stops when a round adds no new path (`complete: true`) or after `rounds`. Each run becomes an experiment
row (`runResult`, `summarise`; the first row's progress is `the baseline`), and `onRound(row, index)` is called after
each. `checkDiscover` validates the settings first. The result is the `discover --json` object in [cli.md](cli.md#discover)
without the CLI's `package`, `item`, `base`, `request` and `out`; `discoverFindings(result)` gives its findings.

In the apps, `discoverStart` runs the loop in the experiment slot (one at a time; `experiment-stop` and `discover-stop`
both stop it), emits `discover` events (`{ state: 'start', request }`, `{ state: 'round', index, row }`,
`{ state: 'done', result }`, `{ state: 'error', message }`) and saves the result (below). The UI's Server needs tab
keeps it in `st.disc`; **Save as response** puts `result.requests[i].response` into `st.responses`, replacing one with
the same pattern.

### Saved discovery (`scorm-lab-discovery`, version 1)

`<userData>/discoveries/<time>-<package>.json` in the apps; `discovery.json` in the CLI's `--out` folder has the CLI's
JSON instead.

```js
{ format: 'scorm-lab-discovery', version: 1, package, item (manifest index), base (options), request: pattern | null,
  requests: [{ match, url, method, from, fields: [{ path, type, how, at: ['file:line'] }], skeleton, response }],
  rows: [experiment row], rounds, complete, noAnswer: { furthest, label }, standIn: { name, furthest, label, better }, findings,
  file }
```

## Overrides

`options.files` replaces or adds files for one run. The session's overrides live in `pkg.overrides` (`{ path: { content } | { base64 } }`, reset when a package is opened); the Files tab's handlers change them. `launchItem` uses `options.files` if the caller gave it and otherwise `pkg.overrides`; the headless run and the CLI always give it. A run is served from `overlayFiles(pkg.files, o.files)` (`served` in `main.js`, which `serve()` reads, so the original `pkg.files` is never touched), and its boot graph is recomputed for that file set and not cached. The static analysis of the package (`pkg.analysis`) stays that of the original.

All paths are checked by `packagePath` in `options.js` (relative, `/` only, no `..`, no empty segment): in `normaliseOptions`, and again in each handler before it looks at `pkg.files`. Nothing is ever read from or written to disk from an override path; the web interface sends replacement files as base64 inside the JSON body (limit 20 MB).

`src/overlay.js` is pure: `isText`, `entryFor(buffer)` (text as `{ content }`, otherwise `{ base64 }`), `overlayFiles`, `overrideList`, `overrideFinding(files)` (the "This run used N changed files" note, `null` for none) and `overrideProgressFinding(before, after)` (uses `progress()` from milestones). `withProgress` in `main.js` puts the notes straight after the milestone finding; the comparison runs only when an earlier run of the same item (same package name and item index) had no overrides, so it exists in the desktop and web interfaces but not in headless runs, and it is not rebuilt when a saved run is reopened (the override note is, from `launch.options.files`). `src/textdiff.js` is a line diff by longest common subsequence (common start and end trimmed first; over four million cells the middle is shown as replaced): `diffLines(a, b)` and `unified(a, b, context = 3)`.

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
| `pinFindings(trace, options)` | a run and its launch options | Pinned value changed, couldn't be pinned (frozen, `let`/`const`), never read; requests answered, responses nothing matched. Called by `runFindings` |
| `runFindings(trace, launch)` | a run and its launch settings | API never looked for, not found, found but not called, own API object, top unreachable, server requests, failed requests, uncaught errors, refusals, caught errors, and progress (failed calls, finish, commit, suspend data, exit, completion) |
| `milestoneFinding(milestones(trace, boot))` | a run and its boot graph | The "Got as far as" note; added first to every package run by `main.js` |
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

## Milestones

`src/milestones.js` is pure. `milestones(trace, boot)` returns the ten steps in order, each
`{ id, label, reached, t, evidence }` (`t` is ms from the start of the run; `evidence` is one plain sentence). The
ids, in order, are `launched`, `scripts`, `shown`, `looked`, `found`, `initialised`, `read`, `wrote`, `committed`,
`finished`. Rules worth knowing:
- `launched` and `scripts` use `bootRun(boot, trace)`: the launch page returned 2xx or 3xx, and every script tag in the
  boot path that lives in the package was requested without failing. Script tags on other sites are not counted. With
  no boot graph (`null`), they are judged from the package requests instead.
- `shown` uses any content frame's DOM report (not SCORM Lab's own page), at any time in the run.
- `found` is also true if the API was called, since a call implies the API was there.
- `initialised`, `committed` and `finished` need the call to have returned `'true'`; `read` and `wrote` match the
  element names (1.2 and 2004) in `READ` and `WRITE` and don't look at the result.

`furthest(list)` is the last step reached (not necessarily unbroken), `firstMissing(list)` the first not reached.
`runCounts(trace)` gives the numbers `progress` compares. `progress(a, b)` takes two `{ milestones, counts }` objects
(or bare lists) and returns `{ better, steps, counts, summary }`: `better` is 1 if b got further than a, -1 if less far,
0 if equal. The tie-break is the number of steps reached. P0.3 and later work packages use it to compare runs.

`main.js` adds `milestones` to each package run (the run summary the interfaces get, and the saved run) and puts
`milestoneFinding` first in its findings. Saved runs from before this have no `milestones`; the report computes them.

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

`src/experiments.js` is pure. `PRESETS` maps a name to a list of `{ name, patch }` (P2.1, P2.2 and P2.3 add `lms`,
`storage` and `browsers` here). `planVariants({ base, variants })` returns `[{ name, options }]`: the base first, named
`default`, then each variant's patch merged over it with `normaliseOptions`; a variant whose options equal an earlier
one's is dropped (unless `dedupe: false`, used for variants the user wrote), and bad patches throw with the variant's name. `runResult(name, options, savedRun, extra)` keeps what
a table needs: `{ name, options, milestones, counts (runCounts), errors, verdict, …extra }`. `summarise(results)` makes
the rows (`results[0]` is the base; each other row has `progress` and `better` from `progress()`), and
`experimentFindings(results)` returns the "gets further" warnings (only when the furthest step is later, not for a tie
on step count) or the "Nothing tried" note.

Running is up to the caller. The CLI calls `runPackage` for each plan entry (a fresh Electron each time, saved runs in
`--out`). `main.js` runs the plan inside one process: `experimentStart` launches each variant with `auto` set to its
`wait`, waits for the run to be recorded, and emits `experiment` events: `{ state: 'start', names }`,
`{ state: 'result', index, row }`, `{ state: 'done', rows, findings, stopped }` and `{ state: 'error', message }`. One
experiment at a time; the runs also appear in the runs list as usual. The UI's Experiments tab keeps its table in
`st.exp` and fills it from these events; it doesn't survive a page reload in the web interface.

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
| `GET /api/events` | Server-sent events: `package`, `run`, `state`, `probe`, `experiment`, `discover` |
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
  milestones: [milestone] | null,                          // added in P0.2: see Milestones; null for a reference run
  boot: bootGraph | null,
  trace: {
    label, started, ended, duration,                       // ISO times, ms
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
    cmi:        { '1.2'?: { element: value }, '2004'?: { … } } | null
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

## Tests

```bash
npm test
```

`npm test` runs `node test/test.js`; add `--unit` for only the unit checks, or `--slow` for the extra end-to-end runs kept out of the default suite to hold it under three minutes (P1.2: `--options-from` repeating an answered run, the options file with `bodyFile`, the full `pinned` run, the `lexical` run; P1.3: `discover` text output with `--request`, `--rounds` and `--out`, `discover` on `hosted` and `good`, discovery through the web handlers; P1.4: the tracing overhead on `good`, and the whole suite again, `--slow` included, with `SCORM_LAB_FORCE_TRACE=1` so every run is traced; P1.5: `drill` on `levels` with `--out`, and a drill-down through the web handlers). Run `node test/test.js --slow` at phase ends. The test builds fixtures from
`test/fixtures/base` (the toolbox SCORM 1.2 sample) in a temp folder:

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
| `loader` | Loading screen; `data/config.json` with a trailing comma; `js/next.js` loaded only after the config parses | Invalid JSON; stuck on loading screen; code that loads next never ran |

The end-to-end part covers:
- **CLI:** analyze (JSON, `--strict` statuses, missing file), items, report (static and run).
- **Runs:** all fixtures, including a saved run, resume, and `--api both`. Milestones: `good` reaches at least
  `wrote` (also with the live click), `mismatch` reaches `looked`, `blank` reaches `launched` only.
- **Pins and answers:** `hosted` with `/api/player/config` answered (no own API, calls reach the LMS, request marked answered, `--options-from` repeats it, `bodyFile` read at the CLI) and with `previewMode` pinned (the change is reported at `boot.js`); `pinned` and `lexical` as above; bad flags exit with status 2.
- **Discovery:** `needs` (fields, types, the stand-in gets further, three runs); bad flags exit with status 2.
- **Tracing:** `hosted` with `--trace` records `if (!r.ok)` (true, `r.ok = false`), the `startCourse` entry and its
  `window.scorm` test, keeps the original `boot.js` in `trace.sources`, and has the same findings as untraced; over the
  web handlers, a traced `gated` run's Execution events and the code of one. The unit checks run a corpus of tricky
  snippets (short-circuits, getters, optional chaining, `await`, generators, classes and `super`, labelled loops,
  `switch`, comma expressions, arrow bodies, default parameters, directives, ASI, `with`, Proxies…) under `node:vm` as
  they are, instrumented with `trace-probe.js`, and instrumented with only the prelude, and compare results and logs.
- **Drill-down:** `drill hosted --json` names the failed `/api/player/config` request, with one run (the operand is a local).
  The unit checks cover operand paths, the branch not taken, the dead end, static assignments, the probe's watch pins
  under `vm`, and the whole chain for `levels` and `hosted` over hand-made traces.
- **Live:** a frame appears, a click on **Next** reaches the course (`lesson_location` 2), and stop ends it early.
- **Web:** 401 without the token, the token exchange, upload, launch with auto-stop, live frames over SSE, the run in
  `state`, saved runs, and `load-run` refusing paths outside the runs folder, the `options` handler building the pin and answer flags and refusing `bodyFile`.
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
