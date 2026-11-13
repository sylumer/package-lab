# SCORM Lab command line

`scorm-lab` checks, runs and reports on SCORM packages from the terminal, scripts and other tools. Alfred and the
Concierge module use it too.

- [Installing](#installing)
- [Commands](#commands)
- [Choosing an item](#choosing-an-item)
- [analyze](#analyze)
- [items](#items)
- [run](#run)
- [experiment](#experiment)
- [discover](#discover)
- [report](#report)
- [open](#open)
- [serve](#serve)
- [Exit statuses](#exit-statuses)
- [JSON output](#json-output)
- [Live runs](#live-runs)
- [Environment](#environment)
- [Examples](#examples)

## Installing

In the repo:

```bash
npm install
```

To put `scorm-lab` on your PATH:

```bash
npm link
```

Without linking, use `node bin/scorm-lab.js`. Commands that run a package (`run`, `experiment`, `discover`, `report --run`, `open`, `serve`)
need Electron. That is either this repo's own (installed by `npm install`) or `/Applications/SCORM Lab.app`. `analyze`,
`items` and plain `report` need only Node.

## Commands

| Command | Does |
|---|---|
| `analyze <package.zip>` | Checks the package without running it: manifest, scripts, boot path |
| `items <package.zip>` | Lists the items that can be launched, numbered |
| `run <package.zip>` | Launches an item in a hidden browser, records it, and reports what went wrong |
| `experiment <package.zip>` | Runs the same launch several ways, one after another, and prints how far each got |
| `discover <package.zip>` | Works out what the content wants from its server: the fields it reads from each answer, and a stand-in response |
| `report <package.zip \| run.json>` | Writes an HTML report of the package, of a run (`--run`), or of a saved run |
| `open [package.zip]` | Opens the desktop app, optionally with a package |
| `serve` | Starts the [web interface](web.md) |
| `help`, `version` | Help and the version. `scorm-lab <command> --help` shows the help too |

## Choosing an item

`--item <n | id>` picks the item to check or launch:
- **n** is a number from `items` (1 is the first launchable item);
- **id** is the item's identifier in the manifest.

The default is the first SCO.

## analyze

```bash
scorm-lab analyze course.zip [--item n] [--json] [--strict]
```

Prints a summary line, then the findings from the files, worst first, and the verdict. Each finding has its
severity, title, explanation, evidence (`·` lines) and **Try:**.

```
SCORM Lab · course.zip
SCORM 2004 4th edition · 3 items · made with Xyleme · 412 files (38.2 MB)
Item: Module 1 (sco) → index.html

ERROR  Paths differ from the files only in capitals
  This works on Windows and macOS (and in many authoring previews) but fails on the Linux servers most LMSs use…
  · js/Player.js is js/player.js in the ZIP, from index.html:14
  Try: Make the reference match the file name exactly.

ERROR  Paths differ from the files only in capitals  (1 errors, 0 warnings, 2 notes)
```

## items

```bash
scorm-lab items course.zip [--json]
```

Lists each launchable item: its number, title (indented by depth), type, identifier and launch file.

## run

```bash
scorm-lab run course.zip [--item n] [--api manifest|both|1.2|2004|none] [--depth n] [--window]
                         [--resume-from run.json] [--wait seconds] [--out run.json] [--live folder]
                         [--no-caught] [--show] [--json] [--strict] [--options options.json]
                         [--options-from run.json] [--override path=file …] [--pin name=json …]
                         [--answer pattern=reply …] [--launch-params a=1&b=2] [--trace]
```

Launches the item in a hidden browser, with SCORM Lab's test LMS. It lets the item run for `--wait` seconds (default
10), then analyses it. With no one using the course, this shows whether it starts, finds the LMS, initialises and reads
its data. Anything that needs a learner, such as finishing or committing, needs a [live run](#live-runs) or the desktop
app.

| Option | Default | Meaning |
|---|---|---|
| `--api` | `manifest` | Which API objects the test LMS offers. `both` tests a version mismatch; `none` shows the content's behaviour without an LMS |
| `--depth` | `0` | Empty LMS frames between the API's window and the content (0–5) |
| `--window` | off | Opens the content with `window.open`; it finds the API through `window.opener` |
| `--resume-from` | none | Starts with the data model a previous run left: tests resuming |
| `--wait` | `10` | Seconds to let it run |
| `--options` | none | A JSON file of launch options, for anything a flag can't express (see below). A flag overrides the same option in the file |
| `--options-from` | none | Takes the launch options a saved run recorded (`launch.options`), changed files included, to run it again. `--options` and the flags override it |
| `--override` | none | `<path>=<local file>`: runs with a changed copy of a file of the package (see [Changing files](#changing-files-and-running-again)). Repeat it for more files |
| `--pin` | none | `<name>=<json>`: forces a value the content reads, before its own code runs (see [Pins and answers](#pins-and-answers)). Repeat it for more |
| `--answer` | none | `<pattern>=@<file>` or `<pattern>=<status>:<body>`: answers matching requests with a response of your own (see [Pins and answers](#pins-and-answers)). Repeat it for more |
| `--launch-params` | none | Extra query parameters added to the launch address, like `a=1&b=2` |
| `--trace` | off | Records which functions of the package ran and which way each decision went, with the values (see [Tracing](#tracing)). Keep the run with `--out` to read it |
| `--out` | none | Keeps the full run (scripts, requests, coverage, sources). Open it in the desktop app with **Open saved…**, or pass it to `report` or `--resume-from` |
| `--live` | none | See [Live runs](#live-runs) |
| `--no-caught` | off | Don't record errors the content catches |
| `--show` | off | Shows the content window while it runs |

#### Options file

`--options file.json` takes any [launch option](developer-guide.md#launch-options). Leave out what you don't need;
missing options get their defaults. An unknown option or a bad value stops the run with a message naming it.

```json
{ "expose": "both", "depth": 2, "wait": 20 }
```

The options the run used are saved in the run's `launch.options`.

#### Changing files and running again

`--override js/app.js=fixed-app.js` runs the package as if `js/app.js` held the contents of `fixed-app.js`. The ZIP and
the local file are not changed. The path is relative to the package root, with `/` between folders; `..`, a leading `/`
and `\` are refused (exit status 2). A path that isn't in the package adds a file. A file that is valid UTF-8 text is
kept as text; any other file is kept as base64. The same files can go in an options file:

```json
{ "files": { "js/app.js": { "content": "…" }, "img/logo.png": { "base64": "iVBOR…" } } }
```

The run's findings start with "This run used *N* changed files", and `launch.options.files` in the saved run holds the
content, so the run can be repeated from the run alone:

```bash
scorm-lab run course.zip --override js/app.js=fixed-app.js --out changed.json
scorm-lab run course.zip --options-from changed.json     # the same changes again
```

To see whether a change helped, compare `furthest` in the two `run --json` outputs (with and without `--override`), or
use an [experiment](#experiment). The desktop and web interfaces compare for you.

#### Pins and answers

A pin forces a value the content reads, before its own code runs. The value is JSON, so text needs quotes:

```bash
scorm-lab run course.zip --pin previewMode=false
scorm-lab run course.zip --pin config.mode='"live"' --pin 'navigator.userAgent="Mozilla/5.0 (test)"'
```

A name is a global (`previewMode`) or a dotted path (`config.mode`). `navigator.userAgent` is the only `navigator` name
you can pin; `location` can't be pinned (use `--launch-params`). The content's attempts to change a pinned value, and
pins it never read, appear in the findings.

An answer replaces the server's reply to matching requests. The pattern is a glob (`*` any text, `?` one character) or a
`/regex/` with the flags `i`, `m`, `s` or `u`, tried against the whole address, the path with its query, and the path
alone. `@file` answers with 200 and the file's text; `status:body` gives the status and body yourself:

```bash
scorm-lab run course.zip --answer '/api/player/config=@config.json'
scorm-lab run course.zip --answer '/api/player/config=200:{}' --answer '*/user.json=404:'
```

Anything beyond a pattern, status and body (a method, headers) goes in the options file, where a response can name a
`bodyFile` (read by the command line, relative to the options file; its text goes into the saved options):

```json
{ "pins": [{ "path": "previewMode", "value": false, "frames": "all" }],
  "responses": [{ "match": "/api/*", "method": "GET", "status": 200, "headers": { "Content-Type": "application/json" }, "bodyFile": "config.json" }] }
```

A response with no content type gets `application/json` if its body starts with `{` or `[`, otherwise `text/plain`, and
`Access-Control-Allow-Origin: *` unless you set it. SCORM Lab's own pages are never answered. Flags add to the pins and
responses of an options file or `--options-from` run.

#### Tracing

`--trace` serves the package's scripts with calls added that record, in order, every function that starts and ends and
every decision (`if`, `? :`, `&&`, `||`, `??`, `switch`, loop tests) with its result and the values it tested. The
content behaves as it does without it. The saved run (`--out`) holds the events in `trace.exec`, the table of places
they refer to in `trace.sites`, and the original files in `trace.sources`; the desktop and web interfaces show them in
the **Execution** tab. See [Tracing the code](user-guide.md#tracing-the-code) for what it covers, and the
[developer guide](developer-guide.md#the-execution-trace) for the format. To read the last events from a script:

```bash
scorm-lab run course.zip --trace --out run.json
node -e "import('./src/instrument.js').then(m => { const t = JSON.parse(require('fs').readFileSync('run.json')).trace; for (const e of m.lastEvents(t, 50)) console.log(e.file + ':' + e.line, e.say) })"
```

`milestones` lists the ten steps of the SCORM path, each reached or not (see [Milestones](user-guide.md#milestones));
`furthest` is the id of the last one reached, or `null`. The text output adds a **Milestones** line with a tick or a
cross for each step, and what the content was showing at the end (visible elements, any loading indicator, and the
start of its text), the counts (API calls, requests, failures, uncaught errors), and the run's findings.

## experiment

Runs one item several ways, one after another, with the same headless runs as `run`, and prints a table of how far
each got.

```bash
scorm-lab experiment course.zip [--item n] [--wait s] [--variants file.json | --preset name] [--json] [--out folder]
```

The first run is the **default**: the launch options from the other flags (`--api`, `--depth`, `--window`, `--wait`,
`--options`, `--resume-from`, …), so every variant runs with the same resume data. Then each variant runs with its changes
applied over those options. With a preset, a variant that ends up with the same options as an earlier one is skipped; with
your own `--variants` file, every variant runs. Each run lasts `--wait` seconds (default 10), so a full set takes a while;
progress goes to standard error.

| Option | Default | What it does |
|---|---|---|
| `--preset` | `standard` | Built-in variants: `api` (manifest, both, 1.2, 2004, none), `frames` (depth 0 to 3, and a new window), or `standard` (both) |
| `--variants` | none | Your own variants, from a JSON file: a list of `{ "name", "patch" }` or `{ "variants": [...] }`. `patch` is any [launch options](developer-guide.md#launch-options). Not with `--preset` |
| `--out` | none | A folder; each run is kept in it as a saved run (`01-default.json`, `02-api_both.json`, …) |
| `--json` | off | Prints JSON (below) instead of a table |

```json
[{ "name": "deep frames", "patch": { "depth": 3 } }, { "name": "2004 in a window", "patch": { "expose": "2004", "opener": true } }]
```

The table has one row per variant: furthest [milestone](user-guide.md#milestones), API calls, errors, the verdict, and
how it compares with the default ("got further: reached *X* (was *Y*)", "no change", …). Below it are the experiment's
findings (see [From an experiment](findings.md#from-an-experiment)).

`experiment --json`:

```json
{
  "package": "course.zip", "item": { "number": 1, "…": "…" },
  "base": { "expose": "manifest", "depth": 0, "…": "…" },
  "variants": [
    { "name": "default", "options": { "…": "…" }, "furthest": "looked", "furthestLabel": "Looked for the API", "apiCalls": 0, "errors": 1,
      "verdict": { "sev": "error", "title": "…" }, "progress": "the default", "better": 0, "out": "/path/01-default.json" },
    { "name": "api both", "options": { "…": "…" }, "furthest": "wrote", "furthestLabel": "Wrote data", "apiCalls": 14, "errors": 0,
      "verdict": { "sev": "ok", "title": "No problems found" }, "progress": "got further: reached Wrote data (was Looked for the API)", "better": 1, "out": null }
  ],
  "findings": [{ "sev": "warn", "title": "api both gets further than the default: reached Wrote data", "detail": "…", "evidence": ["expose: \"manifest\" → \"both\""], "fix": "…" }]
}
```

`better` is 1 if the variant got further than the default, -1 if less far, 0 if the same. `out` is the saved run's
path, or `null` without `--out`. Exit status is 0 unless the command fails.

## discover

Works out what the content wants from its server, by answering its requests and watching what it reads from the
answers. See [What the content wants from its server](user-guide.md#what-the-content-wants-from-its-server) for how it
works and what it can't see.

```bash
scorm-lab discover course.zip [--item n] [--request pattern] [--rounds n] [--json] [--out folder] [run options]
```

It runs the item (headless, like `run`) without an answer first. Then it answers the requests with a stand-in that
records every field the content reads, and runs again answering with those fields filled with placeholders (`""`,
`false`, `0`, `[]`), until a round reads no new field or `--rounds` is reached. The run options (`--api`, `--wait`,
`--options`, `--answer`, …) apply to every run; your own `--answer` responses still answer the requests discovery isn't
working on. Progress goes to standard error.

| Option | Default | What it does |
|---|---|---|
| `--request` | every server request | A pattern (a path like `/api/player/config`, a glob, or a `/regex/`) for the request to work on. Without it, every fetch or XHR request the first run made to the server's root or another site, one per path |
| `--rounds` | 5 | At most this many answered runs (1 to 10), after the one without an answer |
| `--out` | none | A folder: each run as a saved run (`01-no_answer.json`, `02-round_1.json`, …) and the result as `discovery.json` (the same as `--json`) |
| `--json` | off | Prints JSON (below) instead of text |

The text output is the rounds table (as for `experiment`, against the run with no answer), then for each request: the
code that made it, each field with its type, how it was used and where, and the stand-in response. Then the findings
(see [From a discovery](findings.md#from-a-discovery)). To use the stand-in, put it in a file and pass
`--answer '/api/player/config=@stand-in.json'` to `run`.

`discover --json`:

```json
{
  "package": "course.zip", "item": { "number": 1, "…": "…" },
  "base": { "expose": "manifest", "…": "…" }, "request": null,
  "requests": [{
    "match": "/api/player/config", "url": "lab://run/api/player/config", "method": "GET", "from": "boot.js:1",
    "fields": [{ "path": "lms.enabled", "type": "boolean", "how": "truthiness test", "at": ["boot.js:3"] },
               { "path": "lms.version", "type": "string", "how": "compared with a string", "at": ["boot.js:4"] }],
    "skeleton": { "lms": { "enabled": false, "version": "" } },
    "response": { "match": "/api/player/config", "status": 200, "headers": {}, "body": "{\"lms\":{\"enabled\":false,\"version\":\"\"}}" }
  }],
  "rows": [
    { "name": "no answer", "furthest": "shown", "furthestLabel": "Content shown", "apiCalls": 0, "errors": 3, "verdict": { "…": "…" }, "progress": "the baseline", "better": 0 },
    { "name": "round 1", "furthest": "committed", "…": "…", "progress": "got further: reached Committed (was Content shown)", "better": 1 }
  ],
  "rounds": 2, "complete": true,
  "noAnswer": { "furthest": "shown", "label": "Content shown" },
  "standIn": { "name": "round 2", "furthest": "committed", "label": "Committed", "better": 1 },
  "findings": ["…"],
  "out": null
}
```

- `fields[].type` is `string`, `number`, `boolean`, `array` or `object`; `how` says what it was judged from; `at` is up to
  three places in the code (`file:line`) that read it. An object field is listed as well as its fields.
- `skeleton` is the stand-in: the fields with placeholder values. `response` is the same as an answer (a
  [response](developer-guide.md#launch-options) for `--options` or the UI).
- `rounds` is the number of answered runs; `complete` is true when the last one read nothing new (so it ran with the
  final stand-in), false when `--rounds` stopped it.
- `standIn` is the last run, against the run with no answer: `better` is 1 if it got further, -1 if less far, 0 if the same.

Exit status is 0 unless the command fails.

## report

```bash
scorm-lab report course.zip [--item n] [--out report.html] [--open] [--fragment]
scorm-lab report course.zip --run [run options] [--out report.html] [--open]
scorm-lab report run.json [--out report.html] [--open] [--fragment]
```

Writes a self-contained HTML report. It works in light and dark mode, and has no external files or scripts. It
contains:
- the verdict and the findings;
- for a run: what happened, what the content showed, the API calls, failed requests and errors;
- the loading path (against the run, for a run);
- package details.

| Option | Meaning |
|---|---|
| `--out` | Where to write it. Without it, the HTML goes to standard output |
| `--open` | Opens it in the default browser (a temporary file if there's no `--out`) |
| `--fragment` | A `<div class="sl">` with scoped styles, for embedding in another page. It picks up the host page's `--err`, `--warn`, `--ok`, `--line` and `--muted` colours if they are defined |
| `--run` | Runs the package first, with the run options, and reports the run |

## open

```bash
scorm-lab open [course.zip]
```

Opens the desktop app. If `/Applications/SCORM Lab.app` exists, it opens that (so a running copy gets the package);
otherwise it starts this repo's Electron.

## serve

```bash
scorm-lab serve [--port 4880] [--host 127.0.0.1] [--window] [--show-runs]
scorm-lab serve --url [--port 4880]
```

Starts the [web interface](web.md) and prints its address with the access token. It stays running until Ctrl-C.

| Option | Meaning |
|---|---|
| `--port` | Default 4880 |
| `--host` | `127.0.0.1` (default): this Mac only. `0.0.0.0`: every network interface, so other devices on your network can reach it |
| `--window` | Also opens the desktop window, sharing the same session |
| `--show-runs` | Shows content windows on this Mac while they run (they're hidden otherwise) |
| `--url` | Prints the address (from the saved token) and exits |

## Exit statuses

| Status | Meaning |
|---|---|
| 0 | Done (findings may still include errors) |
| 1 | `--strict` and the findings include at least one error |
| 2 | The command failed: bad arguments, a missing or unreadable file, or a run that didn't finish |

## JSON output

`analyze --json`:

```json
{
  "package": "course.zip",
  "manifest": { "version": "2004", "edition": "4th", "schemaversion": "2004 4th Edition", "title": "…" },
  "apiUse": "2004", "fingerprints": ["Xyleme"], "files": 412, "size": 40054012,
  "items": [{ "number": 1, "id": "ITEM-1", "title": "Module 1", "type": "sco", "launch": "index.html", "parameters": "" }],
  "item": { "number": 1, "…": "…" },
  "verdict": { "sev": "error", "title": "…" },
  "counts": { "errors": 1, "warnings": 0, "info": 2 },
  "findings": [{ "sev": "error", "title": "…", "detail": "…", "evidence": ["…"], "fix": "…" }],
  "boot": { "start": "index.html", "nodes": ["…"], "pages": ["…"], "dynamic": ["…"], "risks": ["…"] }
}
```

`run --json`:

```json
{
  "package": "course.zip", "item": { "number": 1, "…": "…" },
  "launch": { "version": "2004", "expose": "2004", "depth": 0, "opener": false, "item": "Module 1", "itemType": "sco", "url": "…", "resume": false, "options": { "expose": "manifest", "…": "…" } },
  "verdict": { "sev": "error", "title": "The content shows a blank page" },
  "counts": { "errors": 2, "warnings": 1, "info": 0, "apiCalls": 0, "requests": 37, "failedRequests": 1, "uncaught": 1, "seconds": 10 },
  "milestones": [{ "id": "launched", "label": "Launch page loaded", "reached": true, "t": 120, "evidence": "index.html responded 200" }, "…"],
  "furthest": "looked",
  "findings": ["…"],
  "api": [{ "call": "Initialize", "el": "", "value": null, "result": "true", "err": 0 }],
  "screens": [{ "frame": "lab://run/pkg/index.html", "readyState": "complete", "text": 0, "visible": 3, "media": 0, "loader": "div#preloader", "hidden": false, "sample": "" }],
  "out": "/path/to/run.json"
}
```

`items --json` is the `items` array above. The boot graph and saved-run formats are described in the
[developer guide](developer-guide.md#data-formats).

## Live runs

`--live <folder>` lets another program watch and drive a run. The Concierge module uses it.

| File | Written by | Contents |
|---|---|---|
| `folder/frame.jpg` | SCORM Lab | The content window, about every 0.4 s while it changes (JPEG, up to 1280 px wide) |
| `folder/frame.json` | SCORM Lab | `{ "w": 1100, "h": 768, "t": ms since launch }`: the window's size in CSS pixels |
| `folder/status.json` | SCORM Lab | `{ "state": "starting" \| "running" \| "analysing" \| "done", "until": epoch ms, "api", "requests", "errors", "t" }` |
| `folder/input/*.json` | you | One event per file, read in name order and deleted. Write to a temporary name and rename, so a half-written file is never read |

Input events:

| Event | Does |
|---|---|
| `{ "type": "click", "x": 0.5, "y": 0.25 }` | Clicks at that point, as fractions of the frame's width and height |
| `{ "type": "move", "x": …, "y": … }` | Moves the mouse there |
| `{ "type": "wheel", "x": …, "y": …, "dy": 120 }` | Scrolls (positive `dy` scrolls down) |
| `{ "type": "key", "key": "Enter" }` | Presses Enter, Tab, Escape, Backspace, Delete, Space, Up, Down, Left, Right, PageUp, PageDown, Home or End |
| `{ "type": "text", "text": "hello" }` | Types text into whatever has focus |
| `{ "type": "stop" }` | Ends the run now and analyses it |

Input goes to the newest open window of the run: a popup the content opened, or the run's own window.

## Environment

| Variable | Effect |
|---|---|
| `SCORM_LAB_ELECTRON` | The Electron or SCORM Lab binary to use. A path ending in `electron` is given the repo as its app; anything else (such as `/Applications/SCORM Lab.app/Contents/MacOS/SCORM Lab`) runs on its own |
| `SCORM_LAB_DATA` | Moves SCORM Lab's data folder (saved runs, web token, reference sign-ins) for `serve` and `open`. Default `~/Library/Application Support/SCORM Lab` |
| `NO_COLOR` | Plain text output |
| `SCORM_LAB_FORCE_TRACE` | `1` traces every package run, as `--trace` does. For SCORM Lab's own tests |

## Examples

```bash
# Does the version matter? Compare the default with both APIs offered.
scorm-lab run course.zip --json | jq '.counts.apiCalls'
scorm-lab run course.zip --api both --json | jq '.counts.apiCalls'

# Deep frames, as in many LMSs.
scorm-lab run course.zip --depth 3

# Resume test: run, keep it, run again from its data.
scorm-lab run course.zip --wait 30 --out first.json
scorm-lab run course.zip --resume-from first.json

# Check every package in a folder; list the ones with errors.
for z in exports/*.zip; do scorm-lab analyze "$z" --strict >/dev/null || echo "$z"; done

# A report to send to the author.
scorm-lab report course.zip --run --wait 20 --out course-report.html
```
