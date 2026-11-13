# SCORM Lab user guide

This guide covers the desktop app. The [web interface](web.md) is the same app in a browser, with an extra **Live** tab.

- [Opening SCORM Lab](#opening-scorm-lab)
- [The window](#the-window)
- [Opening a package](#opening-a-package)
- [Before running: Findings and Boot path](#before-running-findings-and-boot-path)
- [Launching an item](#launching-an-item)
- [Reading a run](#reading-a-run)
- [Testing a theory: launch settings](#testing-a-theory-launch-settings)
- [Testing resume and progress saving](#testing-resume-and-progress-saving)
- [Comparing with a working copy (optional)](#comparing-with-a-working-copy-optional)
- [Saved runs](#saved-runs)
- [A method for a package that doesn't work](#a-method-for-a-package-that-doesnt-work)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)

## Opening SCORM Lab

- **Installed app** (`npm run install-app`): open **SCORM Lab** from Applications, Launchpad or Alfred. To open a
  package with it, right-click the `.zip` in Finder and choose **Open With › SCORM Lab**, or drag the `.zip` onto its
  Dock icon.
- **From the repo:**
  ```bash
  npm start
  ```
  or, to open a package straight away:
  ```bash
  npx electron . course.zip
  ```
- **From the command line:**
  ```bash
  scorm-lab open course.zip
  ```
  This uses the installed app if there is one.

Only one SCORM Lab window runs at a time. Opening another package sends it to the window that's already open.

## The window

- **Toolbar, first row:**
  - **Open package…**
  - the item to launch
  - the launch settings (see [Testing a theory](#testing-a-theory-launch-settings))
  - **Stop after** and **Launch**
- **Toolbar, second row:**
  - the address of a working copy, and **Record reference** (optional)
  - **Record caught errors**
  - **Stop and analyse**
  - the status line
- **Runs** (left): every run in this session, plus any saved runs you open. Click one to show it in the tabs.
  The **R** and **F** buttons are for comparing.
- **Tabs:** Findings, Boot path, Package, Files, API, Lookups, Network, Scripts, Errors, Console, Frames, Compare and Experiments. The
  **Filter** box filters whichever table is showing.

When no run is selected, the tabs show the package as read from its files. When a run is selected, they show that run.

## Opening a package

Choose **Open package…** and pick the `.zip`. SCORM Lab reads it in memory; it isn't unpacked anywhere. The
**Findings** tab fills straight away with what can be told from the files. The status line counts the errors and
warnings.

The package is checked like this:
- The manifest must be called `imsmanifest.xml`, in lower case, at the top of the ZIP.
- Each resource's launch file and listed files must exist with exactly the same capitals.
- The manifest's SCORM version must match the API the scripts use.

## Before running: Findings and Boot path

**Findings** lists problems, worst first:
- **error** means this will stop it working;
- **warning** means it may stop it working, or has a side effect worth knowing about;
- **info** is context.

Each finding has an explanation, the evidence (file and line, or what happened), and **Try:** with what to do.
[Findings](findings.md) explains every one.

**Boot path** is how the selected item's launch page should load, worked out from the files:

- **Loading path:** every page, script, stylesheet, frame and data file, in loading order and indented under what
  loads it. Each row shows:
  - **How** it is loaded:
    - `tag`: a `<script>`, `<link>` or `<iframe>` on the page;
    - `request`: `fetch` or XHR;
    - `src`: a script that sets `.src`;
    - `import`;
    - `navigate`;
    - `require.js data-main`;
    - `literal`: a path that only appears as text in a script.
  - **From:** the file and line that loads it.
  - **In the files:** in package, missing, wrong capitals, server path, outside package, author's computer, or other
    site. A missing file whose name exists elsewhere in the package means the path is wrong, not the file.
- **Script order:** the order the scripts on each page actually run in. Normal scripts run first, in page order, then
  `defer` and module scripts, then `async` scripts whenever they arrive. A script that uses something before the script
  defining it has run is reported as an error.
- **Paths built at run time:** code that assembles paths (such as `'lib/' + name + '.js'`). These can't be checked
  from the files; a run shows which ones load.

Pick another item in the toolbar to see its boot path.

## Launching an item

1. Choose the **Item**: the first SCO is selected for you.
2. Choose the launch settings. For a first run, leave them as they are.
3. Choose **Stop after**:
   - **I stop it:** you use the course yourself.
   - **A time:** SCORM Lab stops and analyses by itself.
4. Choose **Launch**. The course opens in its own window, with SCORM Lab as the LMS. The **API** tab fills live with
   the API calls.
5. Use the course as a learner would: go through a few pages and answer a question. To test saving, leave it the
   normal way (its exit or close button).
6. Choose **Stop and analyse**, or close the course window.

SCORM Lab then collects code coverage and scripts, works out the findings, saves the run and selects it.

## Reading a run

Start with **Findings**. At the top is the **Milestones** strip, then the run's findings, then the ones from the files.

### Milestones

Every package run is placed on the path a SCORM course should follow. Each step has a tick if the run reached it and a
cross if not. Hover over a step to see what showed it.

1. **Launch page loaded**: the launch page came back with a successful status (2xx, or a redirect).
2. **Scripts loaded**: every script the launch page names was requested, and none failed.
3. **Content shown**: some frame showed 20 characters of text or more, or an image or other media.
4. **Looked for the API**: the content searched for the SCORM API.
5. **Found the API**: it found one.
6. **Initialised**: `LMSInitialize` or `Initialize` returned true.
7. **Read saved data**: it read the entry, location or suspend data.
8. **Wrote data**: it set the location, suspend data, status, score or completion.
9. **Committed**: a commit returned true.
10. **Finished**: `LMSFinish` or `Terminate` returned true.

The first finding says it in words: "Got as far as: …. Didn’t reach: …." The first step with a cross is where to
start looking. A timed run usually stops before the learner finishes, so a cross at **Committed** or **Finished** is
often expected: use **Stop and analyse** after using the course to see them.

The most useful findings are:

- **The content shows a blank page** or **is stuck on a loading screen**: what went wrong while it loaded, in order.
  Its evidence covers:
  - files not found;
  - requests to the server outside the package;
  - the first errors, earliest first;
  - things the browser refused to load or run;
  - requests still waiting at the end;
  - problems from the files;
  - a page that hid itself and never showed itself again.

  Fix the first one: later ones often follow from it.
- **Loading stopped part way through …**, or **Code that loads the next part never ran**: files the content was meant
  to load but never asked for. The first one is where the content stopped or went another way.
- **The content never looked for the SCORM API** or **looked for API and found nothing**: why there are no API calls.
- **The content set its own window.API**: a preview or offline shim that talks to itself instead of the LMS.
- Progress findings: failed API calls, no `LMSFinish` or `Terminate`, no commit, suspend data too long, exit never set.

Then the other tabs:

| Tab | Shows |
|---|---|
| **Boot path** | The loading path, plus **In the run**: when each file was asked for and its status, or *never asked for* |
| **Package** | The manifest, the items, and every match from the static scan (API names, searches, requests, server paths, mode switches) |
| **API** | Every API call in order: element, value, result, error code and text, and the stored values at the end |
| **Lookups** | Each time the content read `window.API` or `window.API_1484_11` in any frame, with whether it found one and the code that looked. Also frame depth and opener for each frame, and any assignment to those names |
| **Network** | Every request: status, type and the code that made it |
| **Scripts** | Every script the browser parsed, in order, with what loaded it |
| **Errors** | Uncaught errors, caught errors (if **Record caught errors** is on), and browser warnings, in time order with where they happened |
| **Console** | The content's console output |
| **Frames** | Frame navigations and targets (cross-origin frames, workers, popups) |
| **Compare** | See [Comparing](#comparing-with-a-working-copy-optional) |

**Record caught errors** pauses on every exception the content throws, records it, then carries on. This matters
because content often catches its own LMS errors and fails silently. Turn it off if a course throws so many that it
slows down.

## Testing a theory: launch settings

Change one setting, launch again, and see whether the content gets further.

| Setting | What it changes | Tests |
|---|---|---|
| **API** | Which API objects the test LMS puts on its window: as the manifest says, both, 1.2 only, 2004 only, or none | **Both** working where **As the manifest says** didn't means the manifest declares the wrong SCORM version. **None** shows what the content does without an LMS (its standalone or preview path) |
| **Frame depth** | Empty LMS frames between the API's window and the content (0–3) | Content that searches only a few parents fails at greater depth. Many LMSs put content 2–3 frames deep |
| **In a new window** | The content opens with `window.open`, and finds the API through `window.opener` | Content that only searches parents fails in LMSs that launch in a new window |
| **Resume last run's data** | The data model starts with the values the last run stored | Whether the content reads back and uses its bookmark and suspend data |

Under the toolbar, **More options** shows every option the next launch will use, as JSON (read-only for now).
**Copy as CLI command** copies the `scorm-lab run …` line that repeats the launch from the command line. Options that
have no flag are left out of the line; it adds `--options options.json` to say a file is needed.

## Changing files and running again

To test a fix before touching the real course, change the file here and run it.

1. Open the **Files** tab. Click a file in the tree (the filter box narrows it).
2. Edit the text, then choose **Save as override**. The file is marked **changed**, and the tab shows how many files
   are changed. Nothing is written to the package or to disk: the changes live in this session.
3. Choose **Launch**. The run uses the changed files. At the top of its Findings is "This run used *N* changed files",
   and if an earlier run of the same item used no changes, a second note says whether the change helped (it got
   further, got less far, or made no difference).
4. Under **Changed files** you can see each change as a line diff (**Show changes**), **Revert** one file, or
   **Revert all**.

A file that isn't text (an image, say) can't be edited, but **Replace from a file…** swaps in a file from your
computer. Saving a file back to exactly what it was removes the override. **Save as override** keeps the changes for the
session; they go in a saved run's options, so opening that run (or the CLI's `--options-from`) repeats them. Changed
files are used by experiments too, as part of the default launch.

SCORM Lab works out the boot path again for the changed files, but the checks on the manifest and scripts under
**Package** still describe the original package.

## Trying every setting at once: experiments

Instead of changing one setting at a time, let SCORM Lab do it. Open the **Experiments** tab, choose a set of variants,
and click **Run all**. It runs the item with the settings in the toolbar (the default), then again with each variant,
one after another. Each run lasts as long as **Stop after** (10 seconds if that says **I stop it**).

| Variants | What is tried |
|---|---|
| **api** | The API offered: as the manifest says, both, 1.2, 2004 and none |
| **frames** | Frame depth 0, 1, 2 and 3, and a new window |
| **standard** | Both of the above (a variant that matches the default is left out) |

The table fills in as each run finishes: how far it got, API calls, errors, the verdict, and how it compares with the
default. Click a row to open that run. **Stop** ends the run in progress and skips the rest. The run it cut short is left out of the table and the findings (it is still in the Runs list). A run that fails to finish shows as such and the experiment carries on. Variants you list yourself on the command line are all run, even ones that repeat the default; the built-in sets leave those out.

If a variant got further than the default, a finding says so and lists the settings that changed. That tells you
which setting matters. If nothing helps, the finding says that too. The same thing runs from the command line:
see [`experiment`](cli.md#experiment).

## Testing resume and progress saving

1. Launch with **Stop after: I stop it**. Go part-way through, then leave the course the normal way. The API tab
   should show suspend data and location being set, exit set to `suspend`, a commit, and `LMSFinish` or `Terminate`.
2. Stop and analyse. Check the progress findings and the stored values at the bottom of **API**.
3. Tick **Resume last run's data** and launch again. On resume, the content should read `cmi.core.entry` or
   `cmi.entry` (`resume`), `lesson_location` or `location`, and `suspend_data`, and return to where you were.

If it starts from the beginning, look in the second run's **API** tab: did it read those values, and did it use them?

## Comparing with a working copy (optional)

If the course does work somewhere, such as the authoring tool's hosted preview, another LMS or SCORM Cloud, you can
record that too:

1. Enter its address in **Working copy** and choose **Record reference**. It opens in SCORM Lab's own browser, where
   you can sign in; sign-ins are kept between sessions. Use it the same way, then **Stop and analyse**. API calls on
   the real LMS are recorded too.
2. In **Runs**, mark the working run **R** and the failing run **F**, then choose **Compare**.

The comparison matches requests and scripts by path, ignoring host and package folder. It shows:
- the first request or script the reference had that the run didn't;
- requests that failed only in the run;
- errors only in the run;
- branches and functions that ran in one and not the other, with their code.

## Saved runs

Every run is saved as JSON in `~/Library/Application Support/SCORM Lab/runs/`. **Open saved…** brings runs back, for
reading or comparing. They hold the content's script sources and the data it stored, so treat them like the package.
Runs made by the CLI (`scorm-lab run --out`) and the Concierge module (**Download the run**) open the same way.

## A method for a package that doesn't work

1. **Open it** and read the findings from the files. Fix any errors there first: a misnamed launch file or a version
   mismatch explains everything downstream.
2. **Launch it with the defaults** and stop after 20 seconds. Did it show anything? Did it call the API?
3. **Blank or stuck:** follow the blank-page finding's evidence in order, then **Boot path** for the first file it
   never asked for, and **Errors** for the first error.
4. **Shows but no API calls:** look at **Lookups**. Never looked means the LMS code never ran; check errors and the
   mode-switch findings. Looked and found nothing means a version or frame problem: try API **Both**, then frame
   depth, then **In a new window**.
5. **Calls the API but doesn't save:** look at the progress findings and the **API** tab. Then test resuming as above.
6. **Its own API object:** the content decided it isn't in an LMS. **Lookups** shows the assignment and the code
   that made it; **Package** lists the mode switches. Find the export setting for an LMS or standalone package.

## Privacy

SCORM Lab never sends package content anywhere:
- the package is served from memory to SCORM Lab's own browser;
- requests the content makes to other sites go out as they would in any browser, which the Network tab shows;
- saved runs stay in your Library folder;
- reports say they were made on this computer.

## Troubleshooting

- **Nothing happens when I launch.** Look at the status line. A package without a readable manifest can't be launched.
- **The course window is blank and there are no findings.** Stop and analyse: the launch findings explain what didn't
  load.
- **Too many caught errors, or the course is slow.** Turn off **Record caught errors**.
- **A course needs a sign-in or licence server.** Its requests show in **Network**. If they fail, that is a finding in
  itself: the package depends on a server.
- **Electron couldn't be found.** Run `npm install` in the repo.
