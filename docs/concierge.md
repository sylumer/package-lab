# SCORM Lab in Concierge

The **SCORM Lab** module puts SCORM Lab in the [Concierge](../../concierge/README.md) dashboard. From any browser,
phone or tablet that can reach Concierge, you can:
- upload a package;
- see what's wrong with it from its files;
- run it on the Mac, watching and using it live;
- read and download the report.

It uses Concierge's HTTPS and macOS login. Packages and runs stay on the Mac.

- [Requirements](#requirements)
- [Installing](#installing)
- [Settings](#settings)
- [Packages](#packages)
- [A package's page](#a-packages-page)
- [Running a package](#running-a-package)
- [A run's page](#a-runs-page)
- [The home page tile](#the-home-page-tile)
- [Where its data is](#where-its-data-is)
- [Limits](#limits)
- [Troubleshooting](#troubleshooting)
- [How it works](#how-it-works)

## Requirements

- Concierge.
- The scorm-lab repo, by default at `~/github/scorm-lab`, with `npm install` run in it. That installs SCORM Lab's
  browser (Electron); without it, packages can be checked but not run.
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

The API, depth, length and new-window settings are remembered between visits, on every device.

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
- **Download the report:** a standalone HTML page.
- **Download the run:** the full run as JSON. Open it in the desktop app with **Open saved…**, or use it with the CLI.
- **Run again with these settings**, or **Run again, resuming from this run**.
- The report:
  - the verdict and findings;
  - what happened, and what the content showed at the end;
  - API calls, failed requests and errors;
  - the loading path against the run, and package details.

  [Findings](findings.md) explains each finding.

**If a run fails** (SCORM Lab couldn't start, or crashed), the page says why and has the log.

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
| `packages/<n>/runs/<m>/` | One run: settings (`job.json`), the full run (`run.json`), `summary.json`, the report, `done.json`, `log.txt` and the live-view folder |
| `preferences.json` | The remembered run settings |

Each package keeps its 30 newest runs; older ones are deleted when a new run finishes. Delete a package from its page,
or delete its folder.

## Limits

- **One upload** is at most 1 GB (Concierge's limit).
- **Several runs can go at once.** Each uses its own hidden browser, so the Mac's memory is the limit.
- **Live input** goes to the newest window of the run. A course in a popup is shown and driven there.
- **References and comparison** aren't in the module: they need a browser you sign in to. Use the desktop app or the
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
| Run | A detached worker (`run --worker <package> <run>`) calls `scorm-lab run <zip> … --live <folder> --out run.json --json`, then `scorm-lab report run.json --fragment`, then writes `done.json` |
| Live view | The page fetches `/frame` every 0.7 s for the newest `frame.jpg` (as base64 in the page) and `status.json`. Clicks and keys are POSTed to `/input` and written to the run's `live/input/` folder, which SCORM Lab reads |

See [Live runs](cli.md#live-runs) for the live folder's format.
