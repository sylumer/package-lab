# SCORM Lab in Concierge

The **SCORM Lab** module puts SCORM Lab in the [Concierge](../../concierge/README.md) dashboard. From any browser,
phone or tablet that can reach Concierge, you can:
- upload a package;
- see what's wrong with it from its files;
- run it on the Mac, watching and using it live, with the settings an LMS or a device would change;
- try it several ways and see how far each got, test saving, and ask why it stopped and what it wants from its server;
- try a fix without editing the package: replace a file, pin a value or answer a request;
- read and download the report (also with the course content taken out), a corrected package, or a diff against another package.

It uses Concierge's HTTPS and macOS login. Packages and runs stay on the Mac.

- [Requirements](#requirements)
- [Installing](#installing)
- [Settings](#settings)
- [Packages](#packages)
- [A package's page](#a-packages-page)
- [Running a package](#running-a-package)
- [Changing what the content gets](#changing-what-the-content-gets)
- [Try variants](#try-variants)
- [A run's page](#a-runs-page)
- [A corrected package and a diff](#a-corrected-package-and-a-diff)
- [The home page tile](#the-home-page-tile)
- [Where its data is](#where-its-data-is)
- [Limits](#limits)
- [Troubleshooting](#troubleshooting)
- [How it works](#how-it-works)

## Requirements

- Concierge.
- The scorm-lab repo, by default at `~/github/scorm-lab`, with `npm install` run in it. That installs SCORM Lab's
  browser (Electron); without it, packages can be checked but not run.
- Optional: Playwright and its WebKit (`npm i -D playwright && npx playwright install webkit`) for runs in Safari's
  engine. The run form offers WebKit only when `scorm-lab doctor` says it works.
- Node.js 20 or later. The module looks in `/opt/homebrew/bin`, `/usr/local/bin`, then your login shell's PATH.

## Installing

The module is in the Concierge repo at `modules/scorm-lab`. Either:
- run `make modules` in the Concierge repo (this installs or updates every module in the repo); or
- copy just this one:
  ```bash
  rsync -a --delete modules/scorm-lab/ ~/Library/Application\ Support/Concierge/modules/scorm-lab/
  ```

Reload the dashboard. **SCORM Lab** is under **Tools**, and its tile is on the home page.

## Settings

If the repo or Node is somewhere else, create
`~/Library/Application Support/Concierge/data/scorm-lab/config.json`:

```json
{ "scormlab": "/path/to/scorm-lab", "node": "/path/to/node" }
```

Both keys are optional. If something is missing, the module's pages say what and where.

## Packages

The module's home page lists the packages you've uploaded, newest first. For each, it shows:
- its summary: SCORM version, items, authoring tool and size;
- the verdict from its files;
- the result of its last run.

**Upload** a `.zip` (up to 1 GB) with the file picker. It is checked straight away, and its page opens.

## A package's page

- **Run it:** the run settings (see below) and **Run**.
- **Runs:** each run with its result and settings. Click one to open it.
- **From the files:** the report from the package's files for the chosen item:
  - the verdict and findings;
  - the loading path with the script order on each page, and paths built at run time;
  - package details.

  Pick another item to see its report. **Download this report** gives a standalone HTML file; **Download the package**
  gives back the `.zip`.
- **Delete package and runs:** removes it and everything about it from the Mac. You can't delete a package while one
  of its runs is going.

## Running a package

| Setting | Meaning |
|---|---|
| **Item** | What to launch (the first SCO is chosen for you) |
| **SCORM API offered** | As the manifest says, both, 1.2 only, 2004 only, or none. **Both** tests a version mismatch |
| **Frame depth** | Empty LMS frames between the API and the content (0–3), as in many LMSs |
| **Let it run for** | 10 seconds to 30 minutes. It stops by itself after this, or sooner when you choose **Stop and analyse** |
| **Resume from** | Start with the data an earlier run left, to test resuming |
| **Open in a new window** | The content finds the LMS through `window.opener` |
| **Host it like** | An LMS profile (Moodle, SCORM Cloud, …): how it frames the content and what it blocks. Presets are approximations |
| **Browser** | Chromium, or WebKit (Safari's engine) if it is installed. WebKit runs have no live view |
| **Device size** | The window as it is, a phone or tablet preset, or your own `WIDTHxHEIGHT` |
| **Storage in the content's frames** | Normal, blocked (as Safari does for content in another site's page), or empty at the start |
| **Authoring tool** | Detect it, or apply one tool's rules to the package |
| **Trace the content's code** | On by default. Records which functions ran and which way each decision went. Drill-down needs it |
| **Use the replacement files…** | Shown when the package has them (see below) |

**Run** starts a run. **Test saving** runs twice instead: the first run leaves the way a learner does, the second
resumes from what it left, and the page shows what was saved and read back in each. It runs in Chromium, for SCORM
packages, and has no live view.

The API, depth, length, profile, browser, device, storage, tool, trace and new-window settings are remembered between
visits, on every device.

## Changing what the content gets

**Change what the content gets** on the package's page tests a theory without editing the package. Each change applies
to the runs, experiments and corrected package that use it (the run form has a box for it):
- **Replacement file:** type a path inside the package (like `js/app.js`), choose a file. It stands in for that file.
  There is no editor: make the file on your Mac and upload it.
- **Pin:** a name the content reads (like `previewMode`) and a JSON value (`false`, `3`, `"text"`). It is set before the
  content's own code runs.
- **Response:** a request pattern (like `/api/player/config`), a status and a body. Matching requests get that answer.

Remove one with **Remove**. A run keeps the changes it used, and its page says how many.

## Try variants

**Try variants** runs the same item several ways, one after another: pick a set (the SCORM API settings, frame depth,
each LMS, storage normal and blocked, or Chromium and WebKit) and how long each run lasts. The experiment's page shows
a table that fills in as each run finishes (furthest step reached, API calls, errors), then how each compares with the
default and what the differences suggest. It keeps working if you leave the page. The package page lists past experiments.

## A run's page

**While it runs:**
- The status: starting, running or analysing. It also counts API calls, requests and uncaught errors, and shows the
  time left.
- **Show the course (live view):** the course window, updated while it changes.
  - Tap or click the picture to click the course; scroll over it to scroll.
  - Select the picture, then type: letters go as text, and Enter, Tab, Escape, arrows and the like go as keys.
  - The text box and **Type** send a whole string, which is easier on a phone. The buttons send single keys.
  - Untick the box to stop sending pictures (useful on a slow connection).
- **Stop and analyse:** ends the run now.

The page updates by itself and shows the report when the run is done.

**When it's done:**
- **Milestones**, at the top: the steps of a SCORM run (launch page, scripts, content shown, API found, initialised,
  read, wrote, committed, finished), which were reached and what showed it. A save test shows its table here instead.
- **Download the report:** a standalone HTML page. **Download the report with the course content taken out** hides
  page text, API values, typed text and file contents, so you can send it to someone else.
- **Download the run:** the full run as JSON. Open it in the desktop app with **Open saved…**, or use it with the CLI.
- **Run again with these settings**, or **Run again, resuming from this run**.
- **What it waited for:** if the run stopped short and nothing failed, what the content was still waiting for (a reply, a
  value, a timer, a request) and the last code it ran.
- **Drill-down:** **Work out why it stopped** runs the content again, traced, and lists the decisions that led to the dead
  end as a numbered chain, ending at a cause when it can name one (a file with no such field, a request that failed). It
  takes a minute or so; the page updates by itself.
- **Server needs:** **Discover** works out what the content reads from its own server: each request, the fields it reads
  and a stand-in response. **Use this as a response in later runs** adds the stand-in to the package's responses.
- The report:
  - the verdict and findings;
  - what happened, and what the content showed at the end;
  - API calls, failed requests and errors;
  - the loading path against the run, and package details.

  [Findings](findings.md) explains each finding.

**If a run fails** (SCORM Lab couldn't start, or crashed), the page says why and has the log.

## A corrected package and a diff

On a package's page:
- **Corrected package:** tick the fixes (the ones the files showed are ticked) and press **Fix**. The page lists what
  changed, what it couldn't do, and which findings are gone, with a link to download the `.zip`. The original isn't
  touched. Replacement files go into the corrected package too.
- **Compare with another package:** pick another upload and press **Compare** to see the files added, removed and changed, the manifest changes,
  and the findings that appeared or went away. **Download the diff as a report** has a diff for each changed file.

## The home page tile

- A run in progress: **running**, with the package's name.
- Otherwise: the latest package's verdict (from its last run, or from its files if it hasn't been run), as an
  error, warning or ok badge with the verdict's title. The tile's light follows it.

The tile refreshes every 20 seconds.

## Where its data is

`~/Library/Application Support/Concierge/data/scorm-lab/`:

| Path | Contents |
|---|---|
| `config.json` | Optional settings |
| `packages/<n>/` | One uploaded package: the `.zip`, `meta.json`, `analysis.json` and cached reports |
| `packages/<n>/runs/<m>/` | One run: settings (`job.json`), the full run (`run.json`), `summary.json`, the report, `done.json`, `log.txt`, the live-view folder, and `tools/` for Drill-down and Discover |
| `packages/<n>/experiments/<e>/` | One experiment: settings, `log.txt`, `done.json`, and `runs/` with each variant's saved run and `experiment.json` |
| `packages/<n>/overrides.json`, `overrides/` | The package's replacement files, pins and responses |
| `packages/<n>/fixed/` | The last corrected package |
| `doctor.json` | What `scorm-lab doctor` said, kept for five minutes |
| `preferences.json` | The remembered run settings |

Each package keeps its 30 newest runs and 10 newest experiments; older ones are deleted when a new one finishes. Delete a package from its page,
or delete its folder.

## Limits

- **One upload** is at most 1 GB (Concierge's limit).
- **Several runs can go at once.** Each uses its own hidden browser, so the Mac's memory is the limit.
- **Live input** goes to the newest window of the run. A course in a popup is shown and driven there.
- **At most three** runs, experiments, Drill-down or Discover tasks go at once, all packages together; a fourth is refused
  with a message. At most 50 packages are kept, and one replacement file can be up to 50 MB.
- **Nothing is made by just opening a page.** The report downloads are made when a run ends; **Make the report for this
  item**, **Make the downloadable report** and **Compare** (a button) make theirs once and keep them.
- An old run or experiment is never deleted while it is still working.
- **Drill-down, Discover and Test saving** run the content several times, so they take as many run lengths. They can't be
  stopped once started, so pick a short length.
- **References and comparison with a reference** aren't in the module: they need a browser you sign in to. Use the desktop app or the
  [web interface](web.md).

## Troubleshooting

| Message or symptom | Fix |
|---|---|
| "SCORM Lab isn't at …" | Put the repo there, or set `scormlab` in `config.json` |
| "Node.js wasn't found" | `brew install node`, or set `node` in `config.json` |
| "SCORM Lab's browser (Electron) isn't installed" | Run `npm install` in the repo |
| A run stays at "starting" | Look at its log (in the run's folder, `log.txt`). The first run after installing can take longer while macOS checks Electron |
| "The run didn't finish" | The page shows the error and log. Try the same run from Terminal: `scorm-lab run <the zip in packages/<n>/> --show` |
| The live picture is black or doesn't change | The course hasn't drawn yet, or is static; click something |

## How it works

The module is a Python script, `run`, that Concierge calls for each request, as with all Concierge modules (see
Concierge's `docs/writing-modules.md`). It does no analysis itself: it calls SCORM Lab's CLI.

| Action | What the module calls |
|---|---|
| Upload | `scorm-lab analyze <zip> --json`, saved as `analysis.json` |
| Reports from the files | `scorm-lab report <zip> --item n --fragment`, cached |
| What the form offers | `scorm-lab doctor --json`: the profiles, tools, device sizes, presets and fixes, and whether WebKit works |
| Run | A detached worker (`run --worker <package> <run>`) calls `scorm-lab run <zip> … --live <folder> --out run.json --json` (with `--profile`, `--browser`, `--viewport`, `--storage`, `--tool`, `--trace`, `--override`, `--pin` and `--answer` as set), then `scorm-lab report run.json --fragment`, then writes `done.json` |
| Test saving | The same worker calls `scorm-lab cycle <zip> … --out <folder> --json`; the second run becomes `run.json` |
| Try variants | A detached worker calls `scorm-lab experiment <zip> --preset <name> --out <folder>`; the page reads the saved runs as they appear, then `experiment.json` |
| Drill-down, Discover | A detached worker calls `scorm-lab drill` or `discover <zip> --options-from run.json --json` |
| Redacted report | `scorm-lab report run.json --redact --out <file>` |
| Corrected package | `scorm-lab fix <zip> --only <ids> --override … --json --out <file>` |
| Package diff | `scorm-lab diff <a.zip> <b.zip> --json`, and `--out <file>` for the download |
| Live view | The page fetches `/frame` every 0.7 s for the newest `frame.jpg` (as base64 in the page) and `status.json`. Clicks and keys are POSTed to `/input` and written to the run's `live/input/` folder, which SCORM Lab reads |

See [Live runs](cli.md#live-runs) for the live folder's format.
