# SCORM Lab: design

A desktop app (Electron) that works out why a SCORM package doesn't work as expected: it won't launch, makes no API
calls, doesn't save progress, or works on one host and not another. It goes past inspection by running the package
under the browser's own debugger (the Chrome DevTools Protocol) and recording what the content's code actually does.

Everything runs locally. No package content leaves the machine.

## The core idea: explain one run on its own

There is usually no working copy to compare with: the package may never have worked anywhere. So SCORM Lab works
out why from a single run, the way a person does in DevTools, but exhaustively:

0. **Boot path** (`src/bootpath.js`). Before anything runs, the launch page's loading path is worked out from the
   files: every page, script, stylesheet, frame and data file it loads (tags in order, then paths in the scripts),
   resolved the way the browser does it and checked against the package. That finds missing and wrongly capitalised
   files, server and out-of-package paths, scripts that run before what they need, broken config files, Flash,
   IE-only code, frame busting and mixed content. In a run, each step is matched to what was actually requested, and
   the probe reports what each frame shows (text, visible elements, a loading indicator, a hidden page). A blank page
   or stuck loading screen is then explained by what went wrong along the path, in order, and by the first file the
   loading code never got as far as asking for.
1. **Milestones.** SCORM content has a known path: launch page loads, scripts load, the player starts, the API is
   found, Initialize, the resume values are read, progress is written, Commit, Terminate. The run is placed on that
   path, and the first step not reached is the problem to explain.
2. **Why it stopped there.** When the content goes quiet short of a milestone, SCORM Lab lists what it was waiting
   for: requests still pending or failed, timers polling for something that never appears, `message` listeners
   waiting for a host that never answers (postMessage handshakes), promises never settled, and the last code that
   ran.
3. **Execution trace.** Package scripts are instrumented as they're served (function entries and exits, branch
   decisions, in order), so the trace shows the actual sequence of decisions leading to the dead end, not just which
   code ran.
4. **Automatic drill-down.** For the decisions just before the dead end, a second run captures the values of each
   condition's parts (non-pausing breakpoints). A value that is undefined is then traced back to where it was last
   assigned or read from (a global, a query parameter, a config file, the LMS). This is what's otherwise done by hand:
   following load paths and chasing undefined returns.
5. **Experiments.** Hypotheses from the evidence are tested by relaunching with one thing changed (the other API
   version, frame depth, opener, a stubbed server path, a different user agent), and reported as "this change
   gets it further" or "no effect".

A comparison with a working run is an extra, for when one exists.

## Engines

1. **Static analysis** (`src/analyze.js`): manifest (versions, resources, launch paths, `xml:base`, case
   mismatches against the ZIP), and a scan of every script for SCORM API discovery (which API names, how the API
   is searched for), network calls (`fetch`, XHR, absolute and server-relative URLs, which signal a package that
   still depends on the host it was authored on), and authoring tool fingerprints.
2. **Run harness** (`src/main.js`, `src/host/`): the package is served from memory at `lab://run/pkg/…`; a host
   page at `lab://run/__lab/host.html` plays the LMS (the SCORM run-time copied from toolbox's Package Player) and
   frames the content. Host profiles change what the content sees: which API objects exist, how deep the frame is.
   Every lookup of `window.API` or `window.API_1484_11` is logged with the stack that made it, so "no API calls"
   becomes "the content looked for X from Y and got undefined", or "the content never looked at all".
3. **Recorder** (`src/recorder.js`): a CDP session on the run's page and every frame or worker it starts
   (auto-attach, so cross-origin frames are recorded too). It records scripts as parsed (with the stack that loaded
   them), network requests with their initiators and outcomes, frame navigations, console output, uncaught and
   caught exceptions (with stacks), and precise block coverage (which functions and branches ran).
4. **Diagnosis** (`src/rules.js`, and the milestone, stall and drill-down analyses to come), with comparison
   (`src/diff.js`) as an optional extra: pure functions over two recorded runs and the
   static analysis. The comparison matches requests and scripts by path (ignoring host and package root), and
   functions by script and position, then lists what the reference did that the run didn't. Rules turn the
   evidence into findings: severity, what happened, evidence, likely cause, what to try.

## Interfaces

All of them drive the same main process (`src/main.js`) and the same findings:

- **Desktop window**: a toolbar (open package, launch settings, stop after, record reference), the runs list, and tabs
  for Findings, Boot path, Package, API, Lookups, Network, Scripts, Errors, Console, Frames and Compare.
- **Web interface** (`scorm-lab serve`): the same interface over HTTP with a token, plus a Live tab that streams the
  running course and sends clicks and keys back. For use from other devices.
- **CLI** (`bin/scorm-lab.js`): analyze, items, run (headless, with a live folder for frames and input), report (HTML),
  open, serve.
- **Alfred workflow** and **Concierge module**: thin layers over the CLI.

See docs/developer-guide.md.

## Roadmap

- Phase 1 (done): harness, recorder, API lookup probe, static scan, first rules, optional comparison.
- Interfaces (done): packaged app with Open With, CLI, web interface with live view, Alfred workflow, Concierge module,
  HTML reports.
- Phase 2: boot path and launch analysis (done); milestones and stall analysis (what the content was waiting for when it stopped); instrumented execution
  trace with the ordered decisions before the dead end.
- Phase 3: automatic drill-down (condition values and the origin of undefined values) and automatic experiments.
- Phase 4: progress-save cycle run automatically (launch, exit, relaunch, check the content reads back what it wrote);
  readable code views; rule packs per authoring tool; suggested fixes; redacted report.

## Limits

Findings rank likely causes with their evidence. They aren't verdicts, and a package can fail for reasons
outside the content (LMS settings, network, browser policy) that a local run can only hint at.
