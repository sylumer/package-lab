# SCORM Lab

SCORM Lab works out why a SCORM package doesn't work. A package might:

- fail to launch;
- show a blank page or a loading screen that never ends;
- never talk to the LMS;
- not save progress.

SCORM Lab reads the package's files to work out how it should load. It then runs the package under the browser's
debugger, with its own test LMS, and records what the code actually does. It turns that evidence into findings: what
went wrong, the evidence for it, the likely cause, and what to try.

Everything runs on your Mac. No package content is sent anywhere.

## Ways to use it

| Interface | Best for | Guide |
|---|---|---|
| **Desktop app** | Hands-on debugging: launch, use the course, dig through every tab | [User guide](docs/user-guide.md) |
| **Command line** (`scorm-lab`) | Quick checks, scripted runs, reports, automation | [CLI](docs/cli.md) |
| **Web interface** | The full app from another computer, iPad or phone, with a live view of the course | [Web interface](docs/web.md) |
| **Alfred** | Opening, checking or running a package straight from Alfred or Finder | [Alfred](docs/alfred.md) |
| **Concierge module** | Upload, check and run packages from the Concierge dashboard on any device | [Concierge](docs/concierge.md) |

Every finding SCORM Lab can report, with what it means and what to do, is listed in [Findings](docs/findings.md).

## Install

You need macOS and [Node.js](https://nodejs.org) 20 or later.

```bash
cd ~/github/scorm-lab
npm install
```

Then, as you need them:

```bash
npm link
```
This makes the `scorm-lab` command available everywhere.

```bash
npm run install-app
```
This builds `SCORM Lab.app` and puts it in Applications, so it appears in Finder's **Open With**, Launchpad and Alfred.

```bash
npm run alfred
```
This builds the Alfred workflow and opens it, so Alfred offers to import it.

## Quick start

```bash
npm start
```
This opens the desktop app. Choose **Open package…**, read the findings, then **Launch**.

```bash
scorm-lab analyze course.zip
```
This checks the package from its files only.

```bash
scorm-lab run course.zip
```
This runs it for 10 seconds and reports what went wrong.

```bash
scorm-lab report course.zip --run --open
```
This runs it and opens an HTML report.

```bash
scorm-lab serve
```
This starts the web interface. See [Web interface](docs/web.md) for reaching it from another device.

## What it checks

- **From the files.** It checks:
  - the manifest: versions, resources, launch paths, `xml:base`, and file names whose capitals differ from the ZIP;
  - which SCORM API the scripts use, and how they search for it;
  - the authoring tool that made the package.

  The **boot path** is everything the launch page loads, in order, resolved the way a browser does it and checked
  against the ZIP. Problems there include:
  - missing or miscapitalised files;
  - paths at the root of the server, or paths that climb out of the package;
  - scripts that run before what they need;
  - broken JSON config;
  - Flash, or code that only runs in Internet Explorer;
  - frame busting;
  - mixed content.
- **From a run.** Every SCORM API call, and every time the content looks up `window.API` or `API_1484_11` (with the
  code that did it). It also records:
  - scripts, with what loaded them;
  - network requests, with their outcome and what made them;
  - uncaught and caught errors;
  - console output and frames;
  - what each frame was showing at the end;
  - the stored data model, and code coverage.
- **Experiments.** Relaunch with one thing changed to test a theory:
  - which API versions are offered;
  - how deep the frame is;
  - opening in a new window;
  - resuming from an earlier run's data.

Comparing with a run of a copy that works, if there is one, is an optional extra.

## Documentation

- [User guide](docs/user-guide.md): the desktop app, tab by tab.
- [Findings](docs/findings.md): every finding, what it means and what to try.
- [CLI](docs/cli.md): commands, options, output and exit statuses.
- [Web interface](docs/web.md): remote use, live view and security.
- [Alfred](docs/alfred.md): the workflow.
- [Concierge](docs/concierge.md): the Concierge module.
- [Developer guide](docs/developer-guide.md): architecture, data formats, adding findings, testing and packaging.
- [Design](DESIGN.md): the thinking behind it, and the roadmap.

## Tests

```bash
npm test
```
This runs:
- unit checks;
- end-to-end checks in Electron with hidden windows: the CLI on six fixture packages, live input, the web interface,
  and the Concierge module if `../concierge` exists.

It takes about a minute. `node test/test.js --unit` runs only the unit checks. See the
[developer guide](docs/developer-guide.md#tests).
