# SCORM Lab in Alfred

The SCORM Lab workflow opens, checks, fixes and runs SCORM packages from Alfred's search and from File Actions.

## Installing

1. In the scorm-lab repo, run `npm install` (once).
2. Optionally, run `npm run install-app` so the workflow opens packages in the installed app. Without it, the workflow
   starts the repo's Electron instead.
3. Run:
   ```bash
   npm run alfred
   ```
   This builds `dist/SCORM Lab.alfredworkflow` and opens it. Alfred offers to import it; choose **Import**.

The workflow runs this repo's CLI with the Node that built it. Their paths are stored as the workflow variables `node`
and `cli`. If you move the repo or change Node, run `npm run alfred` again, or edit those variables in Alfred
Preferences › Workflows › SCORM Lab › [x]. Its shell is in `scripts/alfred-scripts.js`.

## Using it

| In Alfred | Does |
|---|---|
| `scormlab` | Opens SCORM Lab |
| `scorm <name>` | Finds `.zip` files by name (Spotlight). **↩** opens the package in SCORM Lab. **⌘↩** checks it from its files and opens the report in your browser. **⇧↩** runs the standard experiment (the [`standard` preset](cli.md#experiment): 10 variants) and opens its report. **⌥↩** runs it, then opens the report |
| `scormweb` | Starts the [web interface](web.md) on this Mac if it isn't running, and opens it in your browser |

File Actions: select a `.zip` in Alfred, or in Finder with Alfred's File Actions hotkey, then choose one of:

- **Open in SCORM Lab**
- **Check with SCORM Lab**: a report from the files, opened in your browser
- **Run and report with SCORM Lab**: runs it hidden for 20 seconds, then opens the report
- **Fix with SCORM Lab**: writes a corrected copy next to the original (the [fixes](cli.md#fix) `fix` makes), named `<name>-fixed.zip`. If that name is taken (a file or a symlink) it uses `<name>-fixed-2.zip`, `-3` and so on, up to 100, and never overwrites. If there is nothing to fix, no file is written and a notification says so

Select a **folder** instead and the File Action **Check SCORM packages in folder** checks every `.zip` in it from its files
(as `scorm-lab batch` does, see [cli.md](cli.md#batch)), and opens the batch report in your browser. A notification shows
the folder's name, or the last line of the log if it fails.

Checks and runs end with a notification. A run takes the wait plus a few seconds. Change the length with the
workflow variable `wait`, in seconds.

**⇧↩** (the standard experiment) runs 10 variants, each for `wait` seconds, one after another: with the default of 20
seconds that is about four minutes, and Alfred shows nothing until it ends. The report opens in your browser, with a table
of the variants and their findings.

## Notes

- Reports go to a temporary folder. To keep one, save it from the browser, or use the CLI with `--out`. The experiment's
  folder holds its runs, `experiment.json` and `report.html`.
- Each action keeps the CLI's error output in a log file that `mktemp` makes in `$TMPDIR` (`scorm-lab-alfred.XXXXXX`). If a
  run fails, the notification shows its last line. A failure to open a report is reported on its own.
- `scormweb` listens on this Mac only (port 4880). Its log is a `scorm-lab-web.XXXXXX` file in `$TMPDIR`. To stop it, run
  `pkill -f "scorm-lab.js serve"`.
- Without the installed app, **Open in SCORM Lab** starts the repo's Electron, and a second package opens in the same
  window.
