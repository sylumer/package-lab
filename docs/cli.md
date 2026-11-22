# Package Lab command line

`package-lab` checks, runs and reports on SCORM packages from the terminal, scripts and other tools. Alfred and the
Concierge module use it too.

- [Installing](#installing)
- [Commands](#commands)
- [The app's settings as flags](#the-apps-settings-as-flags)
- [Choosing an item](#choosing-an-item)
- [cmi5 and Tin Can packages](#cmi5-and-tin-can-packages)
- [analyze](#analyze)
- [items](#items)
- [run](#run)
- [experiment](#experiment)
- [discover](#discover)
- [drill](#drill)
- [cycle](#cycle)
- [fix](#fix)
- [diff](#diff)
- [batch](#batch)
- [report](#report)
- [doctor](#doctor)
- [open](#open)
- [serve](#serve)
- [settings](#settings)
- [completion](#completion)
- [help and version](#help-and-version)
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

To put `package-lab` on your PATH:

```bash
npm link
```

Without linking, use `node bin/package-lab.js`. Commands that run a package (`run`, `experiment`, `discover`, `drill`, `cycle`, `diff --run`, `batch --run`, `report --run`, `open`, `serve`)
need Electron. That is either this repo's own (installed by `npm install`) or `/Applications/Package Lab.app`. `analyze`,
`items` and plain `report` need only Node.

## Commands

| Command | Does |
|---|---|
| `analyze <package.zip>` | Checks the package without running it: manifest, scripts, boot path |
| `fix <package.zip>` | Writes a corrected copy of the package: the mechanical fixes, and any `--override` files |
| `items <package.zip>` | Lists the items that can be launched, numbered |
| `run <package.zip>` | Launches an item in a hidden browser, records it, and reports what went wrong |
| `experiment <package.zip>` | Runs the same launch several ways, one after another, and prints how far each got. `--out` also keeps an HTML report |
| `discover <package.zip>` | Works out what the content wants from its server: the fields it reads from each answer, and a stand-in response |
| `drill <package.zip>` | Why it stopped: the decisions that led to the dead end, their values, and where each `undefined` came from |
| `cycle <package.zip>` | Tests saving: runs, leaves the way a learner does, then resumes from what it left, and checks the content saved and read its place |
| `diff <a.zip> <b.zip>` | What changed between two packages: files with text diffs, manifest, loading path and findings; with `--run`, how far each got |
| `batch <folder \| zips…>` | Checks every package in a folder (or the zips named): one row each, with its verdict. `--run` runs each one too. [Details](#batch) |
| `doctor` | Checks this Mac can run Package Lab (Node, Electron, Playwright and WebKit, the data folder, the web interface port in [Settings](#settings), the installed app) and lists the names the options accept. Says what to do next |
| `report <package.zip \| run.json>` | Writes an HTML report of the package, of a run (`--run`), or of a saved run. Each `file:line` in a finding's evidence links to a read-only excerpt (±20 lines) of that file, from the package or the saved run's sources |
| `open [package.zip]` | Opens the desktop app, optionally with a package |
| `serve` | Starts the [web interface](web.md) |
| `macro show <file.json>` | Prints a macro's steps as the editor's table. [Details](#macros) |
| `settings [port [n]]` | Shows the settings and their file, or prints or sets the web interface port. [Details](#settings) |
| `completion zsh` | Prints a zsh completion script. [Details](#completion) |
| `help`, `version` | Help and the version. `package-lab <command> --help` shows the help too. All take `--json` ([JSON output](#json-output)) |

## The app's settings as flags

Each setting of the desktop app and the web interface has a flag, so a launch the app shows can be repeated here. **Copy as CLI command** (under Advanced) writes the line for the current settings. The app's own pages are in the [help](help/run-settings.md).

| App setting | Command line | Notes |
|---|---|---|
| Item | `--item` | |
| API | `--api` | |
| Resume last run's data | `--resume-from` | takes a saved run |
| Profile and its fields | `--profile`, `--profile-file` | see [Profiles](#profiles) |
| Frame depth | `--depth` | |
| In a new window | `--window` | |
| Launch parameters | `--launch-params` | |
| Stop after | `--wait` | a time in seconds; to stop by hand, use a [live run](#live-runs) |
| Record caught errors | `--no-caught` | the flag turns the recording off |
| Trace the code | `--trace` | |
| Keep typed text in runs | `--record-input` | |
| Storage | `--storage` | |
| Browser | `--browser` | |
| Device size | `--viewport` | |
| Authoring tool | `--tool` | |
| Pins | `--pin` | |
| Answers | `--answer` | |
| Macro | `--macro` | |
| Changed files | `--override` | |
| Options as JSON | `--options` | |
| Test saving | `cycle` | |
| Experiments | `experiment --preset` | |
| Server needs | `discover` | |
| Drill-down | `drill` | |
| Export corrected package | `fix` | |
| Compare packages | `diff` | |
| Check a folder | `batch` | |
| Save report, content taken out | `report --redact` | |
| Saved runs | `run --out`, `--options-from` | |
| Record a working copy | none | desktop app and web interface only |
| Appearance | none | Settings only (`theme` in `settings --json`); the course never sees it |
| Code view | none | `report` links each `file:line` to an excerpt |

## Choosing an item

`--item <n | id>` picks the item to check or launch:
- **n** is a number from `items` (1 is the first launchable item);
- **id** is the item's identifier in the manifest.

The default is the first SCO.

## cmi5 and Tin Can packages

`analyze`, `items`, `run`, `report`, `experiment`, `batch` and the other commands that open a package also take a **cmi5**
package (a `cmi5.xml` at the top) and a **Tin Can** package (a `tincan.xml` and no `imsmanifest.xml`). Their items are
the AUs, or the activities with a `<launch>`; `--item` takes a number from `items` or the AU's (or activity's) id. A run of
one gives the content a local LRS instead of a SCORM API, so `--api`, `--resume-from` and the `cycle` command don't apply
to it. What differs in the output:

- the summary line says `cmi5` or `Tin Can (xAPI)`; `analyze --json` has `format` (`scorm`, `cmi5` or `tincan`);
- the `run` text has an **xAPI** block after the milestones: each statement with its time, who sent it, whether the LRS
  stored or rejected it, a summary, and the problems found in it, then the documents written. The milestones are the
  [cmi5 or Tin Can ones](help/other-formats.md#cmi5-and-tin-can-packages);
- `run --json` has `xapi`: `{ format, endpoint, registration, tokenFetches, calls, statements, documents }`, the LRS record
  of the [developer guide](developer-guide.md#the-lrs-record-tracelrs), and `counts.statements` and `counts.lrsCalls`; the
  saved run (`--out`) holds the same under `trace.lrs`;
- `report` of a run has an **xAPI** section; with `--redact` the statements' text, activity ids, names, responses and
  documents are replaced by their lengths, and their structure, ids, times, scores, the standard verbs and the problems stay.

The findings are in [findings.md](findings.md#from-a-cmi5-or-tin-can-run-the-lrs). `--wait` should be long enough for the
AU to send its statements (a few seconds for a script-driven AU; a learner-driven one needs a [live run](#live-runs)).

## analyze

```bash
package-lab analyze course.zip [--item n] [--json] [--strict] [--tool id]
```

`--tool` applies an authoring tool's [rule pack](findings.md#from-authoring-tool-packs) even when the package shows no sign of it (a
Xyleme export may carry no marker): `xyleme`, `storyline`, `rise`, `captivate`, `ispring`, `lectora`, `adapt`, `dominknow`, `evolve`,
`scormdriver` or `pipwerks`. It works the same on `report`, `run`, `experiment` and the other commands that open a package, and is
the `tool` field of an options file. Its findings say the pack was chosen by you.

Prints a summary line, then the findings from the files, worst first, and the verdict. Each finding has its
severity, title, explanation, evidence (`·` lines) and **Try:**.

```
Package Lab · course.zip
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
package-lab items course.zip [--json]
```

Lists each launchable item: its number, title (indented by depth), type, identifier and launch file.

## run

```bash
package-lab run course.zip [--item n] [--api manifest|both|1.2|2004|none] [--depth n] [--window]
                         [--resume-from run.json] [--wait seconds] [--out run.json] [--live folder]
                         [--no-caught] [--show] [--json] [--strict] [--options options.json]
                         [--options-from run.json] [--override path=file …] [--pin name=json …]
                         [--answer pattern=reply …] [--launch-params a=1&b=2] [--trace]
                         [--storage normal|blocked|partitioned] [--browser chromium|webkit] [--viewport preset|WxH] [--profile name] [--profile-file profile.json]
```

Launches the item in a hidden browser, with Package Lab's test LMS. It lets the item run for `--wait` seconds (default
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
| `--profile` | `generic` | Hosts the content the way an LMS does: `generic` (Package Lab's own), `moodle`, `scorm-cloud`, `cornerstone`, `successfactors`, `docebo`, `totara`, `blackboard` or `canvas` (see [Profiles](#profiles)) |
| `--profile-file` | none | A custom profile from a JSON file (see [Profiles](#profiles)). With `--profile` too, that preset is its base unless the file names one |
| `--tool` | auto | An authoring tool's rule pack to apply whether or not the package shows it (see [analyze](#analyze)) |
| `--storage` | `normal` | Storage in the content's frames: `blocked` makes `localStorage` and `sessionStorage` throw a `SecurityError`, `document.cookie` read empty and `indexedDB.open` fail, as Safari does for content in another site's page; `partitioned` empties the run window's storage first. With `normal`, a profile whose `cookies` is `third-party-blocked` (`scorm-cloud`) blocks it too. See the [help](help/run-settings.md#browser-and-device). In an options file: `"storage": "blocked"` |
| `--browser` | `chromium` | `webkit` runs the content in Safari's engine through Playwright (see [WebKit](#webkit)) |
| `--viewport` | none | A device size: `iphone`, `ipad`, `android-phone`, or a width and height like `390x844`. The preset's touch, pixel ratio and user agent come with it. With no `--viewport` the window is as it is |
| `--macro` | none | A JSON file of clicks, keys, typing and waits to play at their times during the run (see [Macros](#macros)). A version 2 file also sets the window size the macro was recorded at, unless `--viewport` is given (the size is printed to standard error). Chromium only. In an options file: `"macro": [ … ]` |
| `--record-input` | off | Keeps the text typed in the content's frames in the run's probe reports (`trace.probe`, `type: "input"`), so a macro can be made from it. Never from a password field, or a field whose `autocomplete` is `current-password`, `new-password`, `cc-…` or `one-time-code`: those report only a length. Without it a run holds clicks and named keys, no text |
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

#### Profiles

A profile reproduces how an LMS hosts content: the origin it serves the package from, its frames, how it launches,
where and when it puts the API, headers on the package's files, how commits behave and its limits. The presets other
than `generic` are approximations from each LMS's public documentation; see the
[help](help/run-settings.md#lms) for every field.

`--profile-file` takes a custom profile: any fields, over a preset named in `base` (default `generic`). `frames` and
`limits` may be partial.

```json
{ "base": "moodle", "contentOrigin": "other", "frames": { "depth": 2, "sandbox": "allow-scripts allow-same-origin" },
  "launch": "popup", "popupDelay": 500, "apiWhere": "top", "launchParams": "id={scoid}&attempt={attempt}",
  "apiDelay": 0, "csp": null, "headers": { "X-Frame-Options": "SAMEORIGIN" }, "commit": "slow", "slowMs": 800,
  "limits": { "suspend12": 4096, "suspend2004": null }, "cookies": "normal" }
```

Fields that don't fit together stop the run with a message: `apiWhere: opener` needs `launch: popup`; a popup with
`apiWhere` `top` or `parent` needs `frames.depth` of 1 or more; a `frameset` can't have `sandbox` or `allow`. `--depth`
(when not 0) and `--window` go on top of the profile. In an options file, the same goes in `"profile"` (a name or an
object). The run keeps it in `launch.options.profile`, and every field resolved in `launch.profile`.

```bash
# Does it still find the LMS when the LMS serves it from another domain?
package-lab run course.zip --profile-file other.json     # other.json: { "contentOrigin": "other" }
```

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
package-lab run course.zip --override js/app.js=fixed-app.js --out changed.json
package-lab run course.zip --options-from changed.json     # the same changes again
```

To see whether a change helped, compare `furthest` in the two `run --json` outputs (with and without `--override`), or
use an [experiment](#experiment). The desktop and web interfaces compare for you.

#### Pins and answers

A pin forces a value the content reads, before its own code runs. The value is JSON, so text needs quotes:

```bash
package-lab run course.zip --pin previewMode=false
package-lab run course.zip --pin config.mode='"live"' --pin 'navigator.userAgent="Mozilla/5.0 (test)"'
```

A name is a global (`previewMode`) or a dotted path (`config.mode`). `navigator.userAgent` is the only `navigator` name
you can pin; `location` can't be pinned (use `--launch-params`). The content's attempts to change a pinned value, and
pins it never read, appear in the findings.

An answer replaces the server's reply to matching requests. The pattern is a glob (`*` any text, `?` one character) or a
`/regex/` with the flags `i`, `m`, `s` or `u`, tried against the whole address, the path with its query, and the path
alone. `@file` answers with 200 and the file's text; `status:body` gives the status and body yourself:

```bash
package-lab run course.zip --answer '/api/player/config=@config.json'
package-lab run course.zip --answer '/api/player/config=200:{}' --answer '*/user.json=404:'
```

Anything beyond a pattern, status and body (a method, headers) goes in the options file, where a response can name a
`bodyFile` (read by the command line, relative to the options file; its text goes into the saved options):

```json
{ "pins": [{ "path": "previewMode", "value": false, "frames": "all" }],
  "responses": [{ "match": "/api/*", "method": "GET", "status": 200, "headers": { "Content-Type": "application/json" }, "bodyFile": "config.json" }] }
```

A response with no content type gets `application/json` if its body starts with `{` or `[`, otherwise `text/plain`, and
`Access-Control-Allow-Origin: *` unless you set it. Package Lab's own pages are never answered. Flags add to the pins and
responses of an options file or `--options-from` run.

#### Tracing

`--trace` serves the package's scripts with calls added that record, in order, every function that starts and ends and
every decision (`if`, `? :`, `&&`, `||`, `??`, `switch`, loop tests) with its result and the values it tested. The
content behaves as it does without it. The saved run (`--out`) holds the events in `trace.exec`, the table of places
they refer to in `trace.sites`, and the original files in `trace.sources`; the desktop and web interfaces show them in
the **Execution** tab. To have the decisions explained, use [`drill`](#drill). See [Tracing the code](help/experiments-and-servers.md#tracing-the-code) for what it covers, and the
[developer guide](developer-guide.md#the-execution-trace) for the format. To read the last events from a script:

```bash
package-lab run course.zip --trace --out run.json
node -e "import('./src/instrument.js').then(m => { const t = JSON.parse(require('fs').readFileSync('run.json')).trace; for (const e of m.lastEvents(t, 50)) console.log(e.file + ':' + e.line, e.say) })"
```

#### WebKit

`--browser webkit` runs the content in Safari's engine through Playwright, in a Node process of the CLI (not Electron),
with the same test LMS, package files, changed files, pins, answers, profile and storage setting. It is an optional
extra: install it with `npm i -D playwright && npx playwright install webkit` in the Package Lab folder. Without it the
command exits with status 2 and says so.

```bash
package-lab run course.zip --browser webkit --viewport iphone --out ios.json
package-lab experiment course.zip --preset browsers
```

The saved run has `trace.browser` set to `webkit`. It has no coverage, no caught errors, no script sources and no script
list, so findings that need them say nothing. `--trace` and `--live` aren't available, and so `drill` (which traces) isn't
either. `--viewport` works in both browsers: a preset (`iphone`, `ipad`, `android-phone`) or `WIDTHxHEIGHT`.

`waitingFor` is what the content was still waiting for at the end (see [Why it stalled](help/experiments-and-servers.md#why-it-stalled)): `pollers`, `unanswered` messages, `listeners` that never ran, `pending` requests and the `last` code that ran. The same appears as a **The content was waiting for** finding in the text output.

`milestones` lists the ten steps of the SCORM path, each reached or not (see [Milestones](help/reading-a-run.md#milestones));
`furthest` is the id of the last one reached, or `null`. The text output adds a **Milestones** line with a tick or a
cross for each step, and what the content was showing at the end (visible elements, any loading indicator, and the
start of its text), the counts (API calls, requests, failures, uncaught errors), and the run's findings.

#### Copy as CLI command

**Copy as CLI command** (in the inspector's Settings, under Advanced, in the desktop app and the web interface) copies the `package-lab run` line
for the current launch. It starts with the package's file name and adds `--item` when the item isn't the first. Each
setting that a flag can express gets one; the rest go in a file the line names:

| Printed | Means |
|---|---|
| `--override js/app.js=js/app.js` | A changed file. The line assumes a copy of it at the same path, relative to where you run the command. One for each changed file |
| `--pin name=json`, `--answer pattern=status:body` | Pins for the content's frames only, and answers with no method or headers. Anything else is in `--options options.json` |
| `--resume-from previous-run.json` | Resume is on. Put a run's data in a file of that name, or pass your own saved run |
| `--macro macro.json` | A macro. Save it as a JSON list of events first |
| `--profile name` or `--profile-file profile.json` | A preset by name, or a changed profile: save its fields in that file |
| `--launch-params`, `--storage`, `--browser`, `--viewport`, `--tool`, `--trace`, `--record-input` | As the flags in the run table above |
| `--options options.json` | Any other setting that is not the default. Save the options JSON shown under Advanced in the inspector's Settings as that file |

The line is a starting point: the files it names must be made before it runs.

## experiment

Runs one item several ways, one after another, with the same headless runs as `run`, and prints a table of how far
each got.

```bash
package-lab experiment course.zip [--item n] [--wait s] [--variants file.json | --preset name] [--json] [--out folder]
```

The first run is the **default**: the launch options from the other flags (`--api`, `--depth`, `--window`, `--wait`,
`--options`, `--resume-from`, …), so every variant runs with the same resume data. Then each variant runs with its changes
applied over those options. With a preset, a variant that ends up with the same options as an earlier one is skipped; with
your own `--variants` file, every variant runs. Each run lasts `--wait` seconds (default 10), so a full set takes a while;
progress goes to standard error.

| Option | Default | What it does |
|---|---|---|
| `--preset` | `standard` | Built-in variants: `api` (manifest, both, 1.2, 2004, none), `frames` (depth 0 to 3, and a new window), `standard` (`api` and `frames` together: 8 variants besides the default), `lms` (each [profile](#profiles)), `storage` (normal and blocked), or `browsers` (Chromium and WebKit) |
| `--variants` | none | Your own variants, from a JSON file: a list of `{ "name", "patch" }` or `{ "variants": [...] }`. `patch` is any [launch options](developer-guide.md#launch-options). Not with `--preset` |
| `--out` | none | A folder; each run is kept in it as a saved run (`01-default.json`, `02-api_both.json`, …) as it finishes, and at the end the result (the same as `--json`) as `experiment.json`, and an HTML report of the variants and findings as `report.html` |
| `--json` | off | Prints JSON (below) instead of a table |

```json
[{ "name": "deep frames", "patch": { "depth": 3 } }, { "name": "2004 in a window", "patch": { "expose": "2004", "opener": true } }]
```

The table has one row per variant: furthest [milestone](help/reading-a-run.md#milestones), API calls, errors, the verdict, and
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
answers. See [Server needs](help/experiments-and-servers.md#server-needs) for how it works and what it can't see. With
`--out <folder>`, it keeps each round's run and the result as `discovery.json`. The app keeps its results in a `discoveries` folder next to the saved runs.

```bash
package-lab discover course.zip [--item n] [--request pattern] [--rounds n] [--json] [--out folder] [run options]
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

## drill

Why it stopped: the decisions that led to where the run stopped, each with its values, and where each `undefined`
came from. See [Why it stopped](help/experiments-and-servers.md#drill-down) for how it works.

```bash
package-lab drill course.zip [--item n] [--json] [--out folder] [run options]
```

It runs the item with tracing (whatever `--trace` says), works out the chain, and, if the chain has values it needs to
watch (global names such as `player` or `config.cdn`), runs it again with those values watched (`pins` with
`mode: "watch"`, added to your own). The run options apply to both runs. Progress goes to standard error.

| Option | Default | What it does |
|---|---|---|
| `--out` | none | A folder: the runs (`01-traced.json`, `02-watched.json`) and the result as `drill.json` (the same as `--json`) |
| `--json` | off | Prints JSON (below) instead of text |

The text output is the milestones line, the numbered chain under **Why it stopped**, up to ten other decisions whose
other branch never ran, and the findings (see [From a drill-down](findings.md#from-a-drill-down)).

`drill --json`:

```json
{
  "package": "course.zip", "item": { "number": 1, "…": "…" }, "base": { "trace": true, "…": "…" }, "furthest": "shown",
  "traced": true, "deadEnd": { "t": 193, "quiet": false, "events": 9 },
  "decisions": [{ "t": 193, "site": 4, "file": "boot.js", "line": 3, "at": "boot.js:3", "kind": "if", "code": "if (window.player && player.ready)",
    "result": 0, "said": "false", "operands": [{ "code": "window.player", "value": "undefined", "preview": ["undefined"] }],
    "untaken": { "lines": ["start()"], "calls": ["start()"] } }],
  "chain": [
    { "n": 1, "text": "In boot.js:3, `if (window.player && player.ready)` was false because `window.player` was undefined. …", "short": "…", "at": "boot.js:3", "decision": "if (window.player && player.ready)", "level": 1 },
    { "n": 6, "text": "`config` came from data/config.json (200), which has no `cdn`.", "short": "data/config.json has no `cdn`", "cause": "file", "file": "data/config.json", "field": "cdn" }
  ],
  "cause": { "kind": "file", "text": "…" },
  "summary": "`if (window.player && player.ready)` was false (boot.js:3) ← … ← data/config.json has no `cdn`",
  "watch": ["player", "config.cdn"], "watched": true,
  "findings": ["…"],
  "out": null
}
```

- `decisions` are the key decisions: in the dead end, and their other branch is code that never ran. `result` is 1 or
  0 (for `??`, 1 means it had a value); `untaken` is the first lines of the other branch and the functions it calls that never ran.
- `chain[].cause`, on the last step only, is `request` (with `request`), `script` (with `file`), `file` (with `file`
  and `field` if one is missing) or `version`. `cause` is null when the chain ends somewhere Package Lab can't name;
  a step with `discover: true` is a server response that Discover can work out.
- `watch` is the paths the watch run watched; `watched` is false when there was nothing to watch (one run only).

Exit status is 0 unless the command fails.

## cycle

Tests that progress is saved and resumed, without a person clicking through. See
[Testing that progress is saved and resumed](help/macros.md#test-saving).

```bash
package-lab cycle course.zip [--item n] [--macro macro.json] [--json] [--strict] [--out folder] [run options]
```

It runs the item twice, one after the other:

1. **Run 1** plays the macro (if there is one), then leaves like a learner closing the window: the content is sent to
   `about:blank`, which runs its `beforeunload`, `pagehide` and `unload` handlers with the recorder still attached, and
   the window is closed. The data model the test LMS held is kept.
2. **Run 2** resumes from that data (as `--resume-from` does) and plays no macro.

The run options apply to both. `--wait` is the length of each run (default 10 s), so a cycle takes about twice that plus
start-up; keep it short for a macro that finishes quickly. Progress goes to standard error. Chromium only: with
`--browser webkit` the command fails, saying so.

| Option | Default | What it does |
|---|---|---|
| `--macro` | none | The events to play in run 1 (see [Macros](#macros)). Without one nothing is clicked: only what the content saves by itself counts |
| `--out` | none | A folder: both runs (`01-first.json`, `02-resumed.json`) as saved runs |
| `--json` | off | Prints JSON (below) instead of text |
| `--strict` | off | Exit status 1 if the findings include an error |

The text output is the two runs side by side (API calls, entry offered, location and suspend data read and saved, status,
exit, whether the content ended the session) and the findings (see
[From a save-and-resume test](findings.md#from-a-save-and-resume-test)).

`cycle --json`:

```json
{
  "package": "course.zip", "item": { "number": 1, "…": "…" }, "base": { "macro": [{ "t": 400, "type": "click", "x": 0.631, "y": 0.328 }], "…": "…" },
  "runs": [
    { "furthest": "wrote", "verdict": { "sev": "ok", "title": "…" }, "apiCalls": 15, "out": null },
    { "furthest": "wrote", "verdict": { "sev": "ok", "title": "…" }, "apiCalls": 11, "out": null }
  ],
  "rows": [{ "label": "Entry offered", "a": "ab-initio", "b": "resume" }, "…"],
  "findings": [{ "sev": "info", "title": "Saving and resuming worked", "detail": "…", "evidence": ["…"], "fix": "" }]
}
```

`runs[n].out` is the saved run's path when `--out` was given, else null. `rows` are the side-by-side table: `a` is run 1
and `b` run 2.

### Macros

A macro file is a JSON list of events, or `{ "format": "package-lab-macro", "version": 2, "viewport": { "width": 1100, "height": 800 }, "events": [ … ] }`.
Version 1 files (the same without `viewport`) and bare lists still work and play as they always did. Each event
has `t`, the milliseconds since the run started (0 to 3,600,000), and a `type`:

| Type | Fields | Does |
|---|---|---|
| `click` | `x`, `y`, `approx`?, `target`? | A left click at that point. `x` and `y` run from 0 to 1 across the window. `approx: true` (made in a frame of another origin, where only the frame's own position is known) is skipped in replay, and the run's trace has a `macro-skipped` note. `target` ties the click to the element it was made on (below) |
| `move` | `x`, `y` | Moves the pointer |
| `wheel` | `x`, `y`, `dy` | Scrolls by `dy` pixels (positive is down) |
| `key` | `key` | One of `Enter`, `Tab`, `Escape`, `Backspace`, `Delete`, `Space`, `Up`, `Down`, `Left`, `Right`, `PageUp`, `PageDown`, `Home`, `End` |
| `text` | `text` | Types the text (up to 2,000 characters) into the focused field |
| `wait` | one of `ms`, `text`, `milestone`, `quiet`; `timeout`? | Blocks the macro until the condition holds (see below) |

A `wait` has exactly one condition, and an optional `timeout` in milliseconds (1,000 to 600,000; 30,000 if left out):

| Field | Waits until |
|---|---|
| `ms` (1 to 600,000) | That many milliseconds have passed (no timeout applies) |
| `text` (1 to 200 characters) | The text is in the `document.body.innerText` of any frame of the content, checked every 250 ms. Frames of another origin are looked at through their own session |
| `milestone` | The run has reached that step of its [progress strip](findings.md#from-a-run-milestones): one of `launched`, `scripts`, `shown`, `looked`, `found`, `initialised`, `read`, `wrote`, `committed`, `finished` |
| `quiet` (100 to 30,000) | No request has been pending for that many milliseconds. A request that never ends, such as a long poll, stops it being met |

The sleep before each event is the gap between its `t` and the one before (the first: its own `t`), counted from the end
of a wait. If a wait times out, the run's trace gets a `macro-wait` note, the macro plays nothing more, and the run
carries on to its end (finding: [From a run](findings.md#from-a-run-the-macro)).

**Target.** A click made in the course's own frames is recorded with `target`, the element it hit:
`{ "sel": "#next", "text": "Next", "role": "button", "frame": [0] }`. `sel` is a CSS selector (an id, a `data-testid`,
`aria-label` or `name` that is unique, or a path of `tag:nth-of-type()` steps of at most 6 levels; at most 500
characters), `text` the element's text (at most 60 characters; for a field its `aria-label` or placeholder, and nothing
for a password field), `role` its `role` or tag name, and `frame` the indexes of the frames to go down from the top
window (left out for the top window itself). When the macro is played, the click looks for that element: if exactly one
element matches and can be seen, it is scrolled to the middle and clicked wherever it is now, however the window size or
layout differs. Otherwise the click uses `x` and `y`, the trace gets a `macro-anchor` note, and the run has one info
finding ([From a run](findings.md#from-a-run-the-macro)). Edit `sel` to point a click at another element.

**Size.** `viewport` (whole pixels, 100 to 10,000) is the window the positions were measured across. When a macro with
a `viewport` is loaded by `--macro`, the desktop app or the web interface, and the run has no device size of its own,
the run's `viewport` option is set to it (`"1100x800"`). With another `--viewport` the run's wins, and the trace gets a
`macro-size` note (finding: "The macro was recorded at 1100×800 and played at 390×844: clicks may miss").

```json
{ "format": "package-lab-macro", "version": 2, "viewport": { "width": 1100, "height": 800 }, "events": [
  { "t": 400, "type": "wait", "text": "Next", "timeout": 10000 },
  { "t": 500, "type": "click", "x": 0.631, "y": 0.328 },
  { "t": 900, "type": "click", "x": 0.73, "y": 0.328 }
] }
```

At most 2,000 events and 100 KB of typed text in all. Events are played in time order through the same input as the live
view, to the newest window of the run. `--macro` works on `run` as well, and the macro goes in the saved run's
`launch.options.macro`. Make one by recording in the [live view](web.md#live-view), or from a run in the desktop app
(the clicks, keys and typing the probe saw are in the run's `probe` list with `type: "input"`). Macros are not supported in
WebKit.

**Showing a macro.** `package-lab macro show macro.json` prints the steps as the macro editor's table, with the size the
macro was recorded at above it. With a size, the Where column is in pixels; without one (a version 1 file or a bare list)
it is percentages. `--json` prints `{ file, viewport, steps }`, where `viewport` is `{ width, height }` or `null` and each
step is `{ n, when, action, where, wait }`. `--macro` prints the size it plays at (`Playing the macro at 1100x800, the size
it was recorded at.`) on standard error, unless `--json` is given.

```
Recorded at 1100x800; 3 steps

Step  When                    Action  Where
────  ──────────────────────  ──────  ────────
1     wait for “Next” (10 s)  Wait
2     +0.1 s                  Click   694, 262
3     +0.4 s                  Click   803, 262
```

The example is the macro above. The Where column has no element here, because the macro has no `target`; a click
with one shows it after the position, as `#next “Next”`.

## fix

```bash
package-lab fix course.zip [--only id,…] [--override path=file …] [--out fixed.zip] [--json]
```

Writes a corrected copy of the package and says what it changed. The original is not touched. Without `--out` the
file is `course-fixed.zip` in the current folder. If there is nothing to change, it says so and writes no file.

| Fix id | Does |
|---|---|
| `manifest-case` | Renames the manifest to `imsmanifest.xml` |
| `manifest-not-root` | Moves the files up out of the folder that holds the manifest, to the top of the ZIP |
| `file-missing` | Removes `<file>` entries for files that aren't in the package |
| `manifest-version` | Sets `<schemaversion>` and the namespaces to match the SCORM API the scripts use (1.2 or 2004 4th Edition) |
| `case` | Makes references match the capitals of the files: it changes the references, or renames the file when every reference spells it the same way |
| `http-to-https` | Changes `http://` addresses of scripts, styles and frames to `https://` |
| `xyleme-player-type` | Removes `PLAYER_TYPE = 'Server-side'` from a Xyleme static export, so it stops waiting for Xyleme's content server |

| Option | Meaning |
|---|---|
| `--only` | Run only these fixes, as a comma-separated list. Default: all of them |
| `--override` | Put a changed file in the new package, as for `run`: `--override js/app.js=fixed-app.js`. Repeatable. Overrides go in first, then the fixes |
| `--out` | Where to write the ZIP |
| `--json` | Prints `{ package, out, applied: [{ id, label, changes }], notes: [{ id, label, notes }], overridden, proof: { before, after, gone, remaining, added } }` |

Inside the new ZIP, `PACKAGE-LAB-CHANGES.txt` lists every change and the Package Lab version. After writing it, `fix`
checks the result again without running it, and prints which findings are gone (`proof.gone`), which are still there,
and which are new or worded differently (a fix can change a count in a title). What a fix left alone, and why (a file that isn't valid UTF-8, a rename that would replace a file, something it couldn't convert), is printed under **Not done** and listed in `notes`; notes are not changes, so if there are only notes no file is written. An unknown id in `--only` is an error
(status 2). Check the result with `package-lab analyze fixed.zip`, or run it.

## diff

```bash
package-lab diff a.zip b.zip [--item n] [--run [run options]] [--json] [--out report.html]
```

Compares two packages: **a** is the one that worked (or the older one), **b** the other. Without `--run` it reads the
files only, and prints:
- the files added in b, only in a, and changed (with sizes);
- the manifest, field by field (versions, resources, items, launch paths and parameters);
- the loading path of the launch page: files only one package loads, and files whose status changed;
- the findings only b has (new) and only a has (gone);
- a line diff of each changed text file under 1 MB (the first 200 lines each; `--out` has all of them). Minified
  files are diffed as they are.

| Option | Meaning |
|---|---|
| `--item` | The item to compare in both packages, as for `analyze`. Default: each package's first SCO |
| `--run` | Runs the same item with the same options on both (one after the other) and compares how far each got and the counts. Takes the [run options](#run), including `--wait` |
| `--out` | Also writes an HTML report: a diff section with a collapsible line diff for each changed file |
| `--json` | Prints JSON instead of text (below) |

With `--run`, the output starts with a sentence like "good.zip reached “Wrote data”; blank.zip reached “Launch page
loaded”. blank.zip got less far.", and lists the milestones and the counts (API calls, requests, failed requests,
uncaught errors, visible text) for each. `diff` always exits 0 when it finishes; status 2 means it couldn't (a missing file, a
bad ZIP, an unknown `--item`, a run that didn't finish).

`diff --json`:

```json
{
  "a": { "name": "a.zip", "files": 6, "size": 9671, "item": { "id": "lesson", "title": "…", "launch": "lesson.html" }, "findings": ["…"] },
  "b": { "name": "b.zip", "…": "…" },
  "files": {
    "added": [{ "path": "js/App.js", "size": 1 }], "removed": [{ "path": "old.js", "size": 10 }], "same": 4,
    "changed": [{ "path": "lesson.html", "before": 1939, "after": 160, "text": true, "tooBig": false, "diff": "@@ -1,50 +1,1 @@\n-…\n+…" }]
  },
  "manifest": [{ "where": "item i1", "field": "mastery", "a": "", "b": "80" }, { "where": "resource r2", "field": "", "a": null, "b": "webcontent b.html" }],
  "boot": { "a": "lesson.html", "b": "lesson.html", "added": [{ "path": "vendor/missing.js", "kind": "script", "how": "tag", "status": "missing" }],
            "removed": ["…"], "changed": [{ "path": "x.js", "kind": "script", "a": "ok", "b": "case" }] },
  "findings": { "added": ["…"], "gone": ["…"], "same": 0 },
  "summary": "1 file added, 0 files removed, 1 file changed; …",
  "behaviour": { "a": { "name": "a.zip", "furthest": "wrote", "furthestLabel": "Wrote data", "milestones": ["…"] }, "b": { "furthest": "launched", "…": "…" },
                 "better": -1, "steps": [{ "id": "launched", "label": "…", "a": true, "b": true }],
                 "counts": { "apiCalls": { "a": 9, "b": 0 }, "requests": { "a": 7, "b": 6 }, "…": "…" }, "summary": "…" }
}
```

`diff` is `null` for a file with no text diff (`text: false`, or `tooBig`). In `manifest`, `a` or `b` is `null` where that
side has no such resource or item. `behaviour` is only there with `--run`; `better` is 1 when b got further, -1 when
it got less far, 0 for no difference. Files and findings are the same lists as `analyze --json`.

## batch

```bash
package-lab batch <folder | zips…> [--run [run options]] [--recursive] [--jobs n] [--csv file.csv] [--out report.html] [--json]
```

Checks every package in a folder, one row each. Without `--run` each package is checked from its files alone, the same
checks `analyze` makes on its first SCO. A folder gives its `.zip` files (sorted by name; with `--recursive`, the ones in
its subfolders too). Anything else named is a package path: a path that doesn't exist, or a file that isn't a ZIP, is a
row marked **Failed** with the reason, and the batch goes on.

The table has these columns:

| Column | Meaning |
|---|---|
| Package | The file name |
| SCORM version | From the manifest (`1.2`, `2004 4th edition`), or blank |
| Tool | The authoring tool Package Lab recognised, or blank |
| Verdict | **OK**, **Warning** or **Error**: the worst finding, as `analyze` shows it. **Failed**: the package couldn't be opened or its run didn't finish |
| Errors, Warnings | The counts of findings of each kind |
| Furthest milestone | With `--run` only: the furthest step the run reached (for example "Wrote data") |
| Note | The title of the worst finding, or the reason for a failed row |

| Option | Meaning |
|---|---|
| `--run` | Runs each package with the run options (the same as `run`, with `--wait` as the length of each run). The verdict, counts and furthest milestone come from the run. Runs go one at a time, or two at a time with `--jobs` over 1. A run still going after its wait plus 60 seconds is stopped, and its row is **Failed** |
| `--recursive` | Looks in the folder's subfolders too. Symbolic links to folders are never followed: each one is skipped, with a line on standard error saying so. A symbolic link to a `.zip` is checked |
| `--jobs n` | Packages checked at once. The static checks run in worker threads. Default 1. Capped at the number of cores this Mac has |
| `--csv file.csv` | Also writes the table as CSV: the same columns, quoted where needed. A cell that starts with `=`, `+`, `-`, `@` or a tab gets a leading apostrophe, so a spreadsheet shows it as text and doesn't run it as a formula |
| `--out report.html` | Also writes an HTML report: a summary table that links to each package, and each package's report below it, collapsed. With `--run`, the runs are in them |
| `--json` | Prints JSON instead of the table (below) |

A package the check can't finish (a worker that runs out of its 1 GB of memory, say) is a **Failed** row too.

The text output ends with a line such as "3 packages: 1 OK, 0 with warnings, 1 with errors, 1 failed." Exit status is 0
when the batch finishes, even if packages have errors or failed; 2 when there is nothing to check (no `.zip` in the folder)
or the options are wrong.

`batch --json`:

```json
{
  "folder": "courses",
  "run": false,
  "summary": { "packages": 3, "ok": 1, "warnings": 0, "errors": 1, "failed": 1 },
  "rows": [
    { "package": "blank.zip", "path": "/…/courses/blank.zip", "scorm": "1.2", "tool": "", "verdict": "error", "note": "Resource lesson_res launches Lesson.html, but the ZIP has lesson.html. Paths are case-sensitive on most servers.", "errors": 2, "warnings": 0, "furthest": null },
    { "package": "broken.zip", "path": "/…/courses/broken.zip", "scorm": null, "tool": "", "verdict": "failed", "note": "Couldn’t open it: Not a ZIP file (no end of central directory).", "errors": 0, "warnings": 0, "furthest": null }
  ],
  "csv": null,
  "out": null
}
```

`verdict` is `ok`, `warn`, `error` or `failed`. `furthest` is the milestone's label with `--run` (for example `"Wrote data"`), else `null`.
`csv` and `out` are the absolute paths written, or `null`. Rows are in file-name order.

## report

```bash
package-lab report course.zip [--item n] [--out report.html] [--open] [--fragment]
package-lab report course.zip --run [run options] [--out report.html] [--open]
package-lab report run.json [--out report.html] [--open] [--fragment]
package-lab report run.json --redact [--redact-names --key-out key.json] [--out report.html]
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
| `--redact` | Takes the course content out, for sending the report to someone else (below) |
| `--redact-names` | With `--redact`: also replaces the package's file names with hashes |
| `--key-out <file.json>` | With `--redact-names`: writes the key and the table of names to this new file (mode 600). Keep it: it is the only way back from a hash to a name |
| `--key <file.json>` | With `--redact-names`: reuses a key from `--key-out`, so the same names get the same hashes in another report |
| `--json` | Prints `{ input, out, verdict, counts, findings }` instead of the text. The HTML goes to `--out`, or to the temporary file `--open` makes, so one of them is needed. With `--redact` it prints `{ input, out, redacted: true, verdict: { sev }, counts }`: the findings and the verdict's title quote the course, so they are left out. With `--redact-names` the paths `input` and `out` are left out too |

**Redacted reports.** `--redact` keeps the report's structure and everything it diagnoses, and takes out the course's
own content: page text, console text, API values (SCORM's vocabulary such as `completed`, `passed`, `suspend` and
`normal`, numbers and times stay; element names stay), suspend data, request and response bodies and headers, typed
and macro text, changed file contents, code text and snippets, values the code compared, query values and fragments
in addresses, local file paths, and the item's and course's titles. Each thing taken out appears as its length, such as
`‹12 characters›`, and a banner at the top counts what was removed. The findings and milestones are worked out again
from what is left, so they quote nothing that was removed. Error messages keep only their first part: up to the first colon, or the
whole message for a known shape such as `x is not defined`. Quoted strings (straight or curly) are always taken out. Free-text elements
(learner id and name, location, comments, interaction and objective ids, suspend data) are masked even when numeric. Addresses of other
sites keep their host and path, with id-like parts (4 or more digits, UUIDs, 16 or more hex or base64 characters) hidden. The package name and the paths of its files stay (unless `--redact-names`). Code excerpts are not shown. For a
run saved on its own, the findings that need the package's files (static findings) are left out: use `report course.zip
--run --redact` to have them too.

```bash
package-lab report run.json --redact --out report-for-vendor.html
package-lab report run.json --redact --redact-names --key-out ~/keep/course-key.json --out report-for-vendor.html
```

With `--redact-names`, every folder and file name appears as a hash such as `f4c278f5e9`, and a file keeps its extension
(`f4c278f5e9.html`). The key file (`package-lab-redaction-key`, version 1) holds the secret and the table. It is written
as a new file after the report is written, so a failed report leaves none. `--key` must name a JSON key file from
`--key-out`, or the command stops with an error.

## doctor

```bash
package-lab doctor [--port n] [--json]
```

Checks what this Mac can do, so a program (the Concierge module builds its run form from it) or you can tell why
something won't run. A missing optional part is a result, not a failure: the exit status is 0 unless the command
itself fails. The checks:

| Check | Passes when |
|---|---|
| `node` | Node.js is 20 or later |
| `electron` | Electron is installed in this repo, or Package Lab.app is installed: packages can be run |
| `webkit` | Playwright is installed with its WebKit: `--browser webkit` works |
| `data` | Package Lab's data folder (`PACKAGE_LAB_DATA`, or the default) exists |
| `port` | The port (the one in Settings, 4880 unless changed, or `--port`, a whole number from 1 to 65535: anything else is an error, status 2) is free for `serve`, both on this Mac only (127.0.0.1) and on every address (0.0.0.0) |
| *(not a check)* | The installed app is reported as the top-level `app`, not in `checks`, so the list stays as the Concierge module reads it. The text output shows it on its own line |

`doctor --json`:

```json
{
  "version": "0.3.0", "ok": true,
  "checks": [{ "id": "electron", "label": "Electron, to run packages", "ok": true, "detail": "/path/to/Electron" }, "…"],
  "capabilities": { "analyze": true, "run": true, "webkit": false },
  "profiles": ["generic", "moodle", "…"], "tools": ["xyleme", "…"], "viewports": ["iphone", "ipad", "android-phone"],
  "presets": ["standard", "api", "…"], "fixes": [{ "id": "manifest-case", "label": "Rename the manifest to imsmanifest.xml" }, "…"],
  "app": { "path": "/Applications/Package Lab.app", "version": "0.3.0" }
}
```

`ok` is true when every check passes. `app` is `null` when Package Lab.app isn't in `/Applications` or `~/Applications`, else `{ path, version }` (the version from its `Info.plist`). `capabilities.run` needs Electron; `capabilities.webkit` needs Playwright and its WebKit (a WebKit run uses no Electron). The lists are the names `--profile`, `--tool`, `--viewport`, `experiment --preset` and
`fix --only` accept. The installed app is shown too, but it isn't a check: a Mac that runs packages from this repo's Electron is fine without it. `doctor` ends with a **To do** list (or *Ready*) for the checks that failed.

## open

```bash
package-lab open [course.zip]
```

Opens the desktop app. If `/Applications/Package Lab.app` exists, it opens that (so a running copy gets the package);
otherwise it starts this repo's Electron.

## serve

```bash
package-lab serve [--port n] [--host 127.0.0.1] [--window] [--show-runs]
package-lab serve --url [--port n]
```

Starts the [web interface](web.md) and prints its address with the access token. It stays running until Ctrl-C.

| Option | Meaning |
|---|---|
| `--port` | Default: the port in [Settings](#settings), 4880 unless changed. Overrides it for this start |
| `--host` | `127.0.0.1` (default): this Mac only. `0.0.0.0`: every network interface, so other devices on your network can reach it |
| `--window` | Also opens the desktop window, sharing the same session |
| `--show-runs` | Shows content windows on this Mac while they run (they're hidden otherwise) |
| `--url` | Prints the address (from the saved token) and exits |
| `--json` | With `--url`: prints `{ url }`. Without `--url` it is refused (status 2): a running server has no JSON output |

## settings

```bash
package-lab settings [--json]
package-lab settings port [--json]
package-lab settings port <n>
```

`settings` shows the settings and the path of the file they are kept in: `settings.json` in the data folder (see
[Environment](#environment)). `settings --json` (without `port`) also has `theme` (system, light or dark), the app's
appearance, which is changed in the app's Settings and not from the command line. `settings port` prints just the
port, for scripts. `settings port <n>` saves it. The port must be 1024 to 65535; any other value exits with status 1
and a message. The desktop app's **Package Lab › Settings…**
does the same ([Settings](help/getting-started.md#settings)). The web interface uses this port unless `--port` is given.

## completion

```bash
package-lab completion zsh > ~/.zfunc/_package-lab
```

Prints a zsh completion script: the commands, each one's flags (with the choices for `--api`, `--browser`, `--preset`,
`--profile`, `--tool`, `--viewport` and `--storage`), and file completion for packages (`*.zip`), JSON files and folders.
To use it, save it as `_package-lab` in a folder on your `fpath` (`fpath=(~/.zfunc $fpath)` before `compinit` in
`~/.zshrc`), then start a new shell. Or source it: `source <(package-lab completion zsh)`. Only `zsh` is supported. With
`--json` it prints `{ shell, script }`. The script is made from the command table in `src/completion.js`, which the
tests check against the help text.

## help and version

```bash
package-lab help [--json]
package-lab version [--json]
package-lab <command> --help
```

`help` prints the list of commands with a line each, and the options of every command. `<command> --help` prints the same
help. `version` prints the version. `--json` gives `{ version, commands: [{ name, summary }] }` for `help` and `{ version }` for
`version`. The command table, and each command's flags, are in `src/completion.js`; the tests check that the help text
lists every command and flag.

## Exit statuses

| Status | Meaning |
|---|---|
| 0 | Done (findings may still include errors) |
| 1 | `--strict` and the findings include at least one error |
| 2 | The command failed: bad arguments, a missing or unreadable file, or a run that didn't finish. `batch` with no package to check |

## JSON output

Every command takes `--json`, except that `serve` only has it with `--url`. Each command's section gives its shape. Where a
command has no section of its own, its shape is here:

| Command | `--json` prints | Shape in |
|---|---|---|
| `analyze`, `items` | The package summary, items, verdict, counts and findings (`items` is just the items list) | [JSON output](#json-output), [items](#items) |
| `run` | The launch, verdict, counts, milestones, findings, API calls and screens of the run | [JSON output](#json-output) |
| `experiment` | The variants and findings (with `--out`, `report.html` is written too) | [experiment](#experiment) |
| `discover` | The requests, the fields they read, the stand-in, rounds and findings | [discover](#discover) |
| `drill` | The decisions, the chain, the cause and the findings | [drill](#drill) |
| `cycle` | Both runs, the side-by-side rows and the findings | [cycle](#cycle) |
| `fix` | What was applied, the notes and the proof | [fix](#fix) |
| `diff` | Files, manifest, loading path, findings, and behaviour with `--run` | [diff](#diff) |
| `batch` | A summary and one row per package | [batch](#batch) |
| `report` | `{ input, out, verdict: { sev, title }, counts, findings }`; with `--redact`, `{ input, out, redacted: true, verdict: { sev }, counts }` | [report](#report) |
| `doctor` | The checks, what this Mac can do, and the names the options accept | [doctor](#doctor) |
| `open` | `{ app: "installed" \| "repo", path, package }`: the app it opened, its path, and the package (absolute) or `null` | [open](#open) |
| `serve --url` | `{ url }` | [serve](#serve) |
| `help` | `{ version, commands: [{ name, summary }] }` | [help and version](#help-and-version) |
| `version` | `{ version }` | [help and version](#help-and-version) |
| `macro show` | `{ file, viewport, steps }` | [Macros](#macros) |
| `completion zsh` | `{ shell, script }` | [completion](#completion) |

`analyze --json`:

```json
{
  "package": "course.zip",
  "format": "scorm",
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
  "waitingFor": { "stalled": true, "pollers": [{ "site": "boot.js:2", "kind": "interval", "every": 250, "fired": 38, "condition": { "text": "window.API → undefined", "n": 38 } }], "unanswered": [{ "message": "“player-ready”", "why": "no-listener", "to": "lab://run/__lab/host.html", "count": 1 }], "listeners": [], "pending": [], "last": { "traced": false, "items": ["…"] } },
  "findings": ["…"],
  "api": [{ "call": "Initialize", "el": "", "value": null, "result": "true", "err": 0 }],
  "screens": [{ "frame": "lab://run/pkg/index.html", "readyState": "complete", "text": 0, "visible": 3, "media": 0, "loader": "div#preloader", "hidden": false, "sample": "" }],
  "xapi": null,
  "out": "/path/to/run.json"
}
```

For a cmi5 or Tin Can run `api` is empty and `xapi` is the [LRS record](developer-guide.md#the-lrs-record-tracelrs) (no
credential in it). `diff --json` is described under [diff](#diff). `items --json` is the `items` array above. The boot graph and saved-run formats are described in the
[developer guide](developer-guide.md#data-formats).

## Live runs

`--live <folder>` lets another program watch and drive a run. The Concierge module uses it.

| File | Written by | Contents |
|---|---|---|
| `folder/frame.jpg` | Package Lab | The content window, about every 0.4 s while it changes (JPEG, up to 1280 px wide) |
| `folder/frame.json` | Package Lab | `{ "w": 1100, "h": 768, "t": ms since launch }`: the window's size in CSS pixels |
| `folder/status.json` | Package Lab | `{ "state": "starting" \| "running" \| "analysing" \| "done", "until": epoch ms, "api", "requests", "errors", "t" }` |
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
| `PACKAGE_LAB_ELECTRON` | The Electron or Package Lab binary to use. A path ending in `electron` or `electron.exe` is given the repo as its app; anything else (such as `/Applications/Package Lab.app/Contents/MacOS/Package Lab`) runs on its own |
| `PACKAGE_LAB_APP` | A copy of the desktop app (the `.app` on a Mac, `Package Lab.exe` on Windows), for portable copies. `open` starts it in place of the installed app. `run` and `serve` use it only when this repo's Electron isn't installed. `doctor` reports it as the installed app |
| `PACKAGE_LAB_DATA` | Moves Package Lab's data folder (saved runs, web token, reference sign-ins, settings) for `serve`, `open` and `settings`. Default `~/Library/Application Support/Package Lab` on a Mac, `%APPDATA%\Package Lab` on Windows, and `$XDG_CONFIG_HOME/Package Lab` (or `~/.config/Package Lab`) on Linux |
| `NO_COLOR` | Plain text output |
| `PACKAGE_LAB_NO_PLAYWRIGHT` | `1` makes Playwright fail to load, as it does where it isn't installed, so `--browser webkit` refuses with its how-to-install message. For Package Lab's own tests |
| `PACKAGE_LAB_FORCE_TRACE` | `1` traces every package run, as `--trace` does. For Package Lab's own tests |

## Examples

```bash
# Does the version matter? Compare the default with both APIs offered.
package-lab run course.zip --json | jq '.counts.apiCalls'
package-lab run course.zip --api both --json | jq '.counts.apiCalls'

# Deep frames, as in many LMSs.
package-lab run course.zip --depth 3

# Resume test: run, keep it, run again from its data.
package-lab run course.zip --wait 30 --out first.json
package-lab run course.zip --resume-from first.json

# The same, automatically: click through with a macro, leave like a learner, resume, and check.
package-lab cycle course.zip --macro macro.json --wait 8

# Check every package in a folder; list the ones with errors.
for z in exports/*.zip; do package-lab analyze "$z" --strict >/dev/null || echo "$z"; done

# A report to send to the author.
package-lab report course.zip --run --wait 20 --out course-report.html
```
