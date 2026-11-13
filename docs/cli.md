# SCORM Lab command line

`scorm-lab` checks, runs and reports on SCORM packages from the terminal, scripts and other tools. Alfred and the
Concierge module use it too.

- [Installing](#installing)
- [Commands](#commands)
- [Choosing an item](#choosing-an-item)
- [analyze](#analyze)
- [items](#items)
- [run](#run)
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

Without linking, use `node bin/scorm-lab.js`. Commands that run a package (`run`, `report --run`, `open`, `serve`)
need Electron. That is either this repo's own (installed by `npm install`) or `/Applications/SCORM Lab.app`. `analyze`,
`items` and plain `report` need only Node.

## Commands

| Command | Does |
|---|---|
| `analyze <package.zip>` | Checks the package without running it: manifest, scripts, boot path |
| `items <package.zip>` | Lists the items that can be launched, numbered |
| `run <package.zip>` | Launches an item in a hidden browser, records it, and reports what went wrong |
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
| `--out` | none | Keeps the full run (scripts, requests, coverage, sources). Open it in the desktop app with **Open saved…**, or pass it to `report` or `--resume-from` |
| `--live` | none | See [Live runs](#live-runs) |
| `--no-caught` | off | Don't record errors the content catches |
| `--show` | off | Shows the content window while it runs |

The text output adds what the content was showing at the end (visible elements, any loading indicator, and the
start of its text), the counts (API calls, requests, failures, uncaught errors), and the run's findings.

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

#### Options file

`--options file.json` takes any [launch option](developer-guide.md#launch-options). Leave out what you don't need;
missing options get their defaults. An unknown option or a bad value stops the run with a message naming it.

```json
{ "expose": "both", "depth": 2, "wait": 20 }
```

The options the run used are saved in the run's `launch.options`.

```json
{
  "package": "course.zip", "item": { "number": 1, "…": "…" },
  "launch": { "version": "2004", "expose": "2004", "depth": 0, "opener": false, "item": "Module 1", "itemType": "sco", "url": "…", "resume": false, "options": { "expose": "manifest", "…": "…" } },
  "verdict": { "sev": "error", "title": "The content shows a blank page" },
  "counts": { "errors": 2, "warnings": 1, "info": 0, "apiCalls": 0, "requests": 37, "failedRequests": 1, "uncaught": 1, "seconds": 10 },
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
