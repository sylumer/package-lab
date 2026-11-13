# Findings

Every finding SCORM Lab can report, grouped by where it comes from. Each has a severity:
- **error**: this stops the package working;
- **warning**: this may stop it working, or has a side effect worth knowing about;
- **info**: context.

Titles below are as SCORM Lab shows them, with *italic* parts filled in.

The verdict at the top of a report, in the CLI and in the Concierge widget is the first error, or the first warning
if there are no errors.

- [From the manifest](#from-the-manifest)
- [From the scripts](#from-the-scripts)
- [From the boot path](#from-the-boot-path)
- [From a run: launching and showing](#from-a-run-launching-and-showing)
- [From a run: finding the LMS](#from-a-run-finding-the-lms)
- [From a run: requests and errors](#from-a-run-requests-and-errors)
- [From a run: milestones](#from-a-run-milestones)
- [From a run: progress](#from-a-run-progress)
- [From an experiment](#from-an-experiment)
- [From a comparison](#from-a-comparison)

## From the manifest

| Finding | Severity | Meaning | What to try |
|---|---|---|---|
| No imsmanifest.xml in the package | error | Not a SCORM package, or the manifest is missing | Re-export as SCORM |
| The manifest is named *X*; it must be imsmanifest.xml in lower case | error | LMSs look for exactly `imsmanifest.xml` | Rename it |
| The manifest is in *folder*, not at the top of the ZIP | warning | The ZIP was made from the folder above the package | Zip the package folder's contents, not the folder |
| The manifest isn't well-formed XML | error | It can't be read, so nothing can be imported | Fix the XML (often a hand edit or a bad character) |
| Resource *R* launches *path*, but the ZIP has *Path* | error | The capitals differ, which fails on most LMS servers | Make the `href` match the file exactly |
| Resource *R* launches *path*, which isn't in the package | error | The launch file is missing | Fix the `href`, or include the file |
| Resource *R* lists *file*, which isn't in the package | warning | A `<file>` entry has no file; harmless unless the content needs it | Remove the entry or include the file |
| Resource *R* launches *URL*, on another site | warning | The package needs that site to be reachable | Include the content in the package |
| No item launches a SCO | warning | Assets never talk to the LMS: no API calls or progress are expected | Check the export type |
| The manifest says SCORM *X*, but the scripts use the SCORM *Y* API | error | The LMS offers only the manifest's API, so the content finds no LMS | Republish for the right version, or correct `<schemaversion>`. Confirm with the API **Both** setting |

## From the scripts

| Finding | Severity | Meaning | What to try |
|---|---|---|---|
| No script in the package mentions the SCORM API | warning | The LMS code may be loaded from elsewhere, or built at run time | Run it, then look at Lookups and Network |
| Scripts ask for paths at the root of the server | warning | `/api/…` style paths work only on the platform the content came from | Run it to confirm; look for an export setting for standalone or LMS packages |
| Scripts refer to other sites | info | The content may depend on them | |
| Scripts create their own SCORM API object | warning | A preview, offline or standalone shim; the content may talk to it instead of the LMS | Run it: if it sets its own API, find the condition that makes it do so |
| Scripts have mode switches (preview, standalone, LMS…) | info | Where content usually decides how it behaves on its authoring host and in an LMS | Read the code around them |
| Made with *tool* | info | The authoring tool or wrapper SCORM Lab recognised | |

## From the boot path

These come from following everything the launch page loads (see **Boot path** in the [user guide](user-guide.md)).

| Finding | Severity | Meaning | What to try |
|---|---|---|---|
| The launch page *X* isn't in the package (or has different capitals) | error | Nothing can load | Correct the resource `href` |
| *N* files the launch loads aren't in the package | error | Pages or scripts ask for them and get "not found". A missing script usually means what it would have built never appears. If a file with the same name exists elsewhere, the path is wrong. If a path works relative to the script but not the page, the script was written for another folder layout: fetch and `src` paths resolve from the page | Include the files, or correct the paths |
| Scripts name *N* files that aren't in the package | warning | Paths that appear as text in scripts; some may be unused | A run shows which are actually asked for |
| Paths differ from the files only in capitals | error | Works on Windows and macOS, fails on Linux servers | Make each reference match exactly |
| The launch depends on paths at the root of the server | error | They exist only on the source platform | Export as standalone, or find the setting that makes them relative |
| Paths climb out of the package (../ above its top folder) | error | Usually a page moved into a subfolder at export | Correct the paths, or check the launch page |
| Paths point at the author's own computer | error | `file://` and drive-letter paths | Include the files with relative paths |
| Scripts, styles or frames load over http:// | warning | Blocked on an https LMS (mixed content) | Use https, or include the files |
| The launch loads code from other sites | info | Fails if the learner can't reach them | |
| The content needs Adobe Flash Player | error | No browser runs Flash, so it is blank or shows "get Flash" | Republish as HTML5 from the source |
| Some scripts only work in Internet Explorer | warning | `ActiveXObject`, `attachEvent` or `document.all` with no modern alternative | Republish with a current version of the tool |
| Scripts navigate the window above them | warning | Frame busting replaces the LMS page, or is blocked by its sandbox | Look at the condition: content often does it when it thinks it isn't in its own player |
| Deferred or async scripts use document.write | warning | Browsers ignore it there, so nothing appears | |
| The content uses JavaScript modules | info | Needs the server to send `.js` and `.mjs` as JavaScript, and CORS for files on a CDN | If an LMS run shows a MIME type error, ask the LMS to fix the type |
| *file*.json isn't valid JSON | error | A config file read at start-up that won't parse usually stops start-up | Fix it (often a trailing comma or byte-order mark) |
| Scripts on *page* run before what they need | error | A script uses a name that only a later, deferred or async script defines: "… is not defined" | Move it after the script it needs, or remove `defer`/`async` from that one |
| *page* sets `<base href>` outside the package | warning | Every relative path then points elsewhere | Remove it or point it inside |
| The launch page has no content of its own | info | Everything is built by scripts, so any failure leaves it blank | Context for a blank page |

## From a run: launching and showing

| Finding | Severity | Meaning | What to try |
|---|---|---|---|
| The launch page *X* wasn't found / was never requested / never got as far as showing anything | error | The launch itself failed. The evidence lists what went wrong, in order | Start with the first line of evidence |
| The content shows a blank page | error | At the end, no frame of the content showed text or images. The evidence, in loading order, covers files not found, requests to the server outside the package, the first errors, things the browser refused, requests still waiting, problems from the files, a page hidden by its own style, and what each frame showed | Fix the first cause; later ones often follow from it. With no cause listed, the content is waiting for something: see the boot path and Lookups |
| The content is stuck on a loading screen (*element*) | error | As above, with only a loading indicator showing | As above |
| The content may be stuck on a loading screen | warning | A loading indicator was still showing, with a little text | Check whether it ever finishes |
| Loading stopped part way through *page* | error | Files named in the page's own tags were never requested: parsing stopped (a script that blocked, failed during `document.write`, or navigated away) | Look at the last script before them |
| Code that loads the next part of the content never ran | warning | Scripts that loaded contain code to load these files, but it never ran: the content went another way or stopped first | Look at the code around the first one, and what it waits for |

## From a run: finding the LMS

| Finding | Severity | Meaning | What to try |
|---|---|---|---|
| The content never looked for the SCORM API | error | Not on its own window, a parent or the opener: its LMS code never ran. It failed before reaching it, wasn't loaded, or the content took a path without the LMS | Check the uncaught errors, failed requests and boot path |
| The content looked for *API* and found nothing | error | It looked where the LMS hadn't put an API. The detail says whether the run offered a different version (the package and its manifest disagree) or whether it's a frame problem | Launch with API **Both**; then try frame depth and a new window |
| The content found the API but never called it | error | Something after the lookup stopped it | Look at the first error after the lookup |
| The content set its own window.API or API_1484_11 | error if calls went to it, otherwise warning | A preview or standalone shim: nothing is saved | Find the setting (preview, offline, standalone) that makes it do this, and turn it off in the export |
| The content's top window is on another site | info | Wrappers that search `window.top` fail here | |

## From a run: requests and errors

| Finding | Severity | Meaning |
|---|---|---|
| The content asked the host for files outside the package | error | Server-root requests, which only work on the source platform. Export as a standalone package |
| *N* requests failed | warning | Requests inside the package or to other sites that failed, with what made them |
| *N* uncaught errors | warning | Errors nothing caught, with where they happened |
| The browser refused to load or run something | warning | Content Security Policy, MIME type, mixed content and similar refusals |
| *N* errors were thrown and caught | info | Shown when there are no API calls and no uncaught errors: caught errors can hide the real failure |

## From a run: milestones

Every package run has this finding first, whatever else is found. The same steps show as ticks and crosses at the top
of the Findings tab, in the report, and in `run --json`. See [Milestones](user-guide.md#milestones) for the ten steps.

| Finding | Severity | Meaning | What to try |
|---|---|---|---|
| Got as far as: *step*. Didn't reach: *step*. | info | The last step of the SCORM path the run reached, and the first it didn't. If every step was reached it says so | Start at the step it didn't reach: the findings below say why |

## From a run: progress

These appear only when the content called the API.

| Finding | Severity | Meaning | What to try |
|---|---|---|---|
| *N* API calls failed | warning | Calls that returned `false` or an error code; an LMS rejects the same values | Look at the values and error text |
| The content never called LMSFinish / Terminate | warning | Many LMSs save only when the session ends properly. A timed run stops before the learner leaves, so this is expected there | Leave the course the normal way, then stop |
| The content never committed | info | Progress is lost if the browser closes first | |
| Suspend data is *N* characters | error if over the limit, warning near it | SCORM 1.2 allows 4,096 characters, 2004 allows 64,000; more is truncated or rejected and resuming breaks | Publish as SCORM 2004, or reduce what is saved |
| The content never set exit | info | Without `suspend`, many LMSs start a new attempt next time | |
| The content never reported completion | info | | |

## From an experiment

Only after **Run all** on the Experiments tab, or `scorm-lab experiment`. They compare each variant with the default run.

| Finding | Severity | Meaning | What to try |
|---|---|---|---|
| *Variant* gets further than the default: reached *step* | warning | With the default settings the run stopped earlier. Changing the settings listed in the evidence got it further, so those settings matter. This is a fact from a run, not a guess | Check what the real LMS offers for those settings, or what the content assumes about them |
| Nothing tried made a difference | info | No variant got further than the default | Try your own variants, or look at what stops the default run in its own findings |

## From a comparison

Only after **Compare** with a run of a working copy.

| Finding | Severity | Meaning |
|---|---|---|
| First difference from the working run | error | The first script or request the reference had and the run didn't, or that worked there and failed here, with the code that made it |
| Branches that went differently | warning | The same code taking a different path in each run; the earliest usually is where the content decided it wasn't where it expected |
| *N* scripts differ between the runs | info | The hosted copy isn't the same file, so lines can't be compared |
| Errors only in the run | warning | |
| The reference made *N* API calls; the run made none | error | |
