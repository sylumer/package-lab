# Package Lab

Package Lab works out why an e-learning package (SCORM 1.2 or 2004, cmi5 or xAPI) doesn't work. A package might:

- fail to launch;
- show a blank page or a loading screen that never ends;
- never talk to the LMS;
- not save progress;
- work in one LMS, or in Chrome, but not in another LMS, Safari or on an iPad.

Package Lab reads the package's files to work out how it should load. It then runs the package under the browser's
debugger, with its own test LMS, and records what the code actually does. It turns that evidence into findings: what
went wrong, the evidence for it, the likely cause, and what to try.

Everything runs on your computer (Mac or Windows). No package content is sent anywhere.

Website: [packagelab.thoughtasylum.com](https://packagelab.thoughtasylum.com). Downloads: [latest release](https://github.com/sylumer/package-lab/releases/latest).

## Ways to use it

| Interface | Best for | Guide |
|---|---|---|
| **Desktop app** | Hands-on debugging: launch, use the course, dig through every view | [User Guide](docs/user-guide/README.md) to learn it, [Help](docs/help.md) while you use it |
| **Command line** (`package-lab`) | Quick checks, scripted runs, reports, automation | [CLI](docs/cli.md) |
| **Web interface** | The full app from another computer, iPad or phone, with a live view of the course | [Web interface](docs/web.md) |

Every finding Package Lab can report, with what it means and what to do, is listed in [Findings](docs/findings.md).
For step-by-step diagnoses of common problems, see [Recipes](docs/recipes.md).

## Install

### Download

From the [latest release](https://github.com/sylumer/package-lab/releases/latest):

| Download | For |
|---|---|
| `Package-Lab-mac-arm64.zip` | Macs with Apple silicon (M1 and later). Signed and notarised: unzip, move to Applications, open. |
| `Package-Lab-win-x64.zip` | Windows 10 and 11 on Intel or AMD. Portable: unzip and run `Package Lab.exe`. Not code-signed, so Windows warns on first run ([Windows notes](docs/windows.md)). |
| `Package-Lab-win-arm64.zip` | Windows on Arm. |
| `Package-Lab-User-Guide.pdf` | The User Guide, to read without the app. |

There is no Intel Mac download; build it from source with `make mac-x64`. To see whether there's a newer version,
choose **Help › Check for Updates…** in the app.

### From source

You need macOS and [Node.js](https://nodejs.org) 20 or later.

```bash
git clone https://github.com/sylumer/package-lab.git
```

```bash
cd package-lab
npm install
```

Then, as you need them:

```bash
npm link
```
This makes the `package-lab` command available everywhere.

```bash
npm run install-app
```
This builds `Package Lab.app` and puts it in Applications, so it appears in Finder's **Open With** and Launchpad.

WebKit runs (Safari's engine) need Playwright, which is optional:

```bash
npm i -D playwright && npx playwright install webkit
```

## Quick start

```bash
npm start
```
This opens the desktop app. Choose **Open package…**, read the findings, then **Launch**.

```bash
package-lab analyze course.zip
```
This checks the package from its files only.

```bash
package-lab run course.zip
```
This runs it for 10 seconds and reports what went wrong.

```bash
package-lab report course.zip --run --open
```
This runs it and opens an HTML report.

```bash
package-lab doctor
```
This checks that this Mac can do everything above (Node, Electron, WebKit, the data folder) and says what is missing.

```bash
package-lab serve
```
This starts the web interface. See [Web interface](docs/web.md) for reaching it from another device.

## What it does

**Checks the files, before anything runs**

- **Manifest:** versions, resources, launch paths, `xml:base`, and file names whose capitals differ from the ZIP.
- **Boot path:** everything the launch page loads, in order, resolved the way a browser does it and checked against the
  ZIP. It finds missing or miscapitalised files, paths at the root of the server or outside the package, scripts that
  run before what they need, broken config files, Flash, Internet Explorer-only code, frame busting and mixed content.
- **Authoring tools:** rule packs for eleven tools (Xyleme, Articulate Storyline and Rise, Adobe Captivate, iSpring,
  Lectora, Adapt, dominKnow, Evolve, SCORM Driver and the pipwerks wrapper). `--tool` applies one when a package
  doesn't name its tool.
- **cmi5 and Tin Can packages:** the course file, its units and launch files.
- **Corrected package:** `fix` and **Export corrected package…** make six mechanical fixes (capitals, the manifest
  name and version, missing file entries, `http://` links, and the files' position in the ZIP) and check that they
  clear the findings they address.
- **Comparing packages:** `diff` and the **Package diff** view compare two exports: files, manifest, loading path and
  findings. `diff --run` runs both and compares how far each got.
- **Folder checks:** `batch` checks every package in a folder, one row each, with a CSV and an HTML report.

**Runs the package and records what happens**

- **Test LMS:** launches the item in Package Lab's own LMS, and records every API call, every lookup of the API, requests,
  scripts, errors, console output, frames, what each frame showed at the end, the stored data and code coverage.
- **Milestones:** where the run got on the SCORM path, in ten steps (the cmi5 and Tin Can paths have their own).
- **Why it stalled:** what the content was still waiting for when it stopped: messages with no reply, timers that poll,
  and requests with no answer.
- **Execution trace** (**Trace the code**): the functions and decisions that ran, in order, with the values they tested.
  Code views show the file formatted, with its coverage, its trace markers and its source map.
- **Drill-down:** the chain of decisions that led to the dead end, traced back to a cause such as a missing file field
  or a failed request.
- **Timeline:** one run on one time axis: requests, API calls, errors, scripts and what the screen showed.
- **Profiles:** hosts the content the way an LMS does. There are eight approximate presets (Moodle, SCORM Cloud,
  Cornerstone, SuccessFactors, Docebo, Totara, Blackboard and Canvas), each open to change, and custom profiles.
- **Storage:** runs with storage blocked (as Safari does for content in another site's page) or empty.
- **WebKit and device sizes:** runs in Safari's engine, and at iPhone, iPad, Android phone or a custom size.

**Tests a theory by changing one thing**

- **Overlays:** edit any text file of the package in Package Lab and run the edited copy. The original is kept, and a
  run tells you whether the change got it further.
- **Pins and answers:** force a value the content reads before its own code runs (`--pin`), and answer a request with
  your own response (`--answer`).
- **Server needs** (`discover`): finds what the content reads from its server, and a stand-in response that gets it
  further.
- **Experiments:** runs several variants of one launch, one after another (the API versions, frame depth, a new window,
  the LMS profiles, storage, and WebKit), and says which ones get further.
- **Test saving** (`cycle`): leaves the course the way a learner closing the window does, resumes it, and checks what it
  saved and whether it read its place back. A macro can play the clicks and keys first.
- **Resume and options:** start from an earlier run's data, or from a saved run's options, to repeat it exactly.

**Reports, sharing and interfaces**

- **HTML reports:** of a package, or of a run. A redacted report takes the course content out, and can hash the file
  names, so you can send it to an author.
- **cmi5 and xAPI:** a local learning record store (LRS) checks every statement against xAPI 1.0.3, and the cmi5 rules,
  as the LRS receives them.
- **Interfaces:** the desktop app, the web interface (with a live view you can click and type into), and the command line.
  Shell completion for zsh is built in (`package-lab completion zsh`).

## Documentation

- [User Guide](docs/user-guide/README.md): learn Package Lab in chapters, with practice packages, from SCORM basics to expert diagnosis.
- [Help](docs/help.md): the desktop app, one task to a page, from getting started to the views and the settings.
- [Recipes](docs/recipes.md): step-by-step diagnoses, from a package that works in the authoring tool but not in an LMS to
  one that works in Chrome but not in Safari.
- [Findings](docs/findings.md): every finding, what it means and what to try.
- [CLI](docs/cli.md): commands, options, output and exit statuses.
- [Web interface](docs/web.md): remote use, live view and security.
- [Developer guide](docs/developer-guide.md): architecture, data formats, adding findings, profiles, packs and fixes,
  testing and packaging.
- [Design](DESIGN.md): the thinking behind it, and the roadmap.

## Tests

```bash
npm test
```
This runs:
- unit checks;
- end-to-end checks in Electron with hidden windows: the CLI on the fixture packages, live input, and the web interface.

It takes about two and a half minutes. `npm test -- --slow` adds the longer end-to-end checks (about 14 minutes), and
`node test/test.js --unit` runs only the unit checks. See the [developer guide](docs/developer-guide.md#tests).

## Licence

Package Lab is free software, licensed under the [GNU Affero General Public License v3.0](LICENSE), with additional
project lineage and attribution requirements ([LINEAGE-AND-ATTRIBUTION.md](LINEAGE-AND-ATTRIBUTION.md)). Derivative
distributions must preserve the project's provenance and identify their upstream origins. See [NOTICE](NOTICE),
[LINEAGE.md](LINEAGE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
