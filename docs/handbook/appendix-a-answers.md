# Appendix A: Exercise answers

What is wrong with each practice package, how Package Lab shows it, and what fixes it. Try each exercise before you
read its answer: the point is the method, not the fault.

The outputs quoted here come from 10-second runs with the default settings. Times and counts in yours may differ a
little.

## 01-works

Nothing. It is the sample course as it was written. A 10-second run nobody uses stops at **Committed**, with “The
content never called LMSFinish” and “The content never set exit”, because nobody left the course. Used and left with
**Save and exit**, it runs through. With a macro that moves two pages, **Test saving** ends with “Saving and resuming
worked”.

## 02-blank-page

**The fault:** the launch page has no content of its own; a script builds it. The page asks for `js/app.js`, but the
file in the package is `js/App.js`. It also asks for `vendor/missing.js`, which isn't there at all.

**How it shows:** static Problems “1 file the launch loads isn't in the package” and “Paths differ from the files only in
capitals”, and the note “The launch page has no content of its own”. The run stops after **Launch page loaded**, with
“The content shows a blank page”, whose evidence starts with `Not found: js/app.js (404)`.

**Which matters:** the capitals first. `js/App.js` is the script that builds the page, so without it nothing shows.
The missing `vendor/missing.js` is a real fault too, but nothing on the page depends on it.

**The second fault:** fix the capitals and run again, and the page is *still* blank. Now the first cause in the
blank-page finding is a new one: `TypeError: Cannot set properties of null (setting 'innerHTML')`, at `js/App.js:1` if
you corrected the reference in `lesson.html` (chapter 8's way), or `js/app.js:1` if **Export corrected package…**
renamed the file. The script runs in the page's `<head>`, before the `<body>` exists, so `document.body` is `null`. The
first fault was hiding the second. This is normal: fix the first cause, run again, and read the first cause again,
until the run gets where it should.

**The fix:** make the reference match the file name. **Export corrected package…** offers this, and because the only
reference spells it `app.js`, it renames the file. Then run the script after the body exists: add `defer` to its
`<script>` tag, or move the tag to the end of the body. And republish with `vendor/missing.js`, or remove the reference.

With the first two as overrides, the page shows “Built by App.js”, with no error. **Content shown** still has a cross,
because it needs at least 20 characters of text and the sample page has 15: milestones are rules of thumb, too. This
sample page has no SCORM code of its own, so even fixed it never looks for the LMS. That's a limit of the exercise, not
of your diagnosis.

## 03-not-tracked

**The fault:** the manifest declares SCORM 2004, but the scripts use the SCORM 1.2 API.

**How it shows:** static Problem “The manifest says SCORM 2004, but the scripts use the SCORM 1.2 API”. In the run, the
course shows its pages and its first line says “No LMS found: this page works, but nothing is tracked.” It stops at
**Looked for the API** with “The content looked for API and found nothing: This run offered API_1484_11: the package and
its manifest disagree on the SCORM version.” **Lookups** shows it looking for `API`.

**The proof:** with **API: Both**, or the **api** experiment, it reaches **Committed**: “api both gets further than the
default”, and so does “api 1.2”. “api 2004” and “api none” make no difference.

**The fix:** either republish for SCORM 2004, or correct the manifest to 1.2. **Export corrected package…** makes the
second (“Match the SCORM version”), and clears the finding.

## 04-loading-forever

**The fault:** `data/config.json` has a trailing comma (`{ "start": true, }`), which isn't valid JSON. `js/boot.js` reads
it and parses it before it loads the next part of the course; the parse throws, so the next part never loads and the
loading screen stays.

**How it shows:** static Problem “data/config.json isn't valid JSON”, read from `js/boot.js:2`. The run stops after
**Scripts loaded** with “The content is stuck on a loading screen (div#loading.spinner)”, whose first evidence is the
`SyntaxError` at `js/boot.js:2`. “Code that loads the next part of the content never ran” names `js/next.js`.

**The fix:** remove the comma. Package Lab has no automatic fix for this (it can't know what the author meant), so
**Export corrected package…** says there's nothing to change. Correct it in **Files**, save it as an override, run
to prove it, then export.

## 05-error-in-the-console

**The fault:** an inline script on the launch page calls `scorm.start()` before `scorm.js` has run (it's loaded with
`defer`, so it runs later). That throws `ReferenceError: scorm is not defined`.

**How it shows:** static Problem “Scripts on lesson.html run before what they need”. The run shows the uncaught error at
`lesson.html:7`, and then reaches **Committed**, exactly as `01-works.zip` does.

**Does it matter?** Hardly. The course's own `lesson.js` starts the session properly a moment later, so it tracks. The
answer to “does it matter?” is: it's a real error, it should be removed because it's noise that hides real problems,
but it isn't why anything fails. The static finding's severity said how bad it *could* be; the run shows it isn't.

## 06-stuck-connecting

**The fault:** the last line of `lesson.js` is `if (window.startOK) start()`, and nothing sets `startOK`. So `start()`,
which finds the LMS, never runs, and the page keeps its first message, “Connecting to the LMS…”.

**How it shows:** no static findings. The run stops after **Content shown** with “The content never looked for the
SCORM API”, and no error. Coverage in `lesson.js` shows the `if` ran and `start()` didn't. Drill-down says: “In
lesson.js:68, `if (window.startOK)` was false because `window.startOK` was undefined”, then “`startOK` was never
assigned (watched), and nothing in the package sets it. It may be something the LMS or the page around the course is
expected to provide.”

**The proof:** pin `startOK` to `true`, or change the line to `start()` as an override: either way it reaches
**Committed**.

**The fix:** ask the author what `startOK` is meant to be set by. Courses that expect their player or a wrapper page to
set a flag are common; the fix is an export without that dependency.

## 07-works-on-the-platform

**The fault:** the course asks `/api/player/config` (a path at the root of the server, which only its authoring
platform has). When that fails, it creates its own `window.API`, a preview stand-in that answers `true` to everything,
and talks to that instead of the LMS.

**How it shows:** static Problem “The launch depends on paths at the root of the server”, and warnings “Scripts create
their own SCORM API object” and the mode switch `previewMode`. The run looks good at a glance (it reaches
**Initialised**), but its first finding is “The content set its own window.API or API_1484_11… 1 API call went to it”.
Network shows `GET /api/player/config` failed.

**The proof:** answer `/api/player/config` with `{}`. The milestone stays the same, but “The content set its own
window.API” goes, and the `LMSInitialize` goes to Package Lab's LMS. (It reads and writes nothing after that, because
this sample's lesson starts before the answer arrives; in a real course, this is where you'd use **Server needs**.)
**Server needs** reports that the course read nothing from the response: any successful reply would do.

**The fix:** an export for an LMS or standalone, without the platform dependency. Ask the author for it, with the
redacted report as evidence.

## 08-forgets-its-place

**The fault:** `scorm.js` never sets `cmi.core.exit`, so when the learner leaves early, the LMS isn't told they're
suspending. Package Lab's test LMS, like many real ones, then starts a new attempt.

**How it shows:** a timed run is identical to one of `01-works.zip`, notes and all: nobody leaves, so neither sets
exit. Only **Test saving** tells them apart. It shows **Exit set** empty in run 1 and **Entry offered** empty in run 2,
with “The LMS started a new attempt instead of resuming (entry was “”)”.

**The fix:** set `cmi.core.exit` to `suspend` whenever the learner leaves before finishing.

## 09-starts-over

**The fault:** on resume, `lesson.js` reads `cmi.core.lesson_location`, then ignores it and opens page 1.

**How it shows:** nothing in a single run. **Test saving** with a macro that moves on a page or two shows **Location
saved (first, last)** of `1, 3` in run 1 and `1, 1` in run 2, with “The content read its saved place but started from
the beginning: left at “3”, first saved after resuming: “1””. Without a macro, run 1 never leaves page 1, so the test
passes: the fault only shows when the learner has somewhere to come back to.

**The fix:** use the location that was read to open the right page.

## 10-fails-in-safari

**The fault:** the first line of `lesson.js` reads `navigator.userAgentData.brands`, which only Chromium-based browsers
have. In Safari's engine `navigator.userAgentData` is undefined, so the line throws and the rest of the script, which
starts the course, never runs.

**How it shows:** fine in Chromium. In WebKit, it stops after **Content shown** with “The content never looked for the
SCORM API” and the uncaught `TypeError: undefined is not an object (evaluating 'navigator.userAgentData.brands')` at
`lesson.js:1`.

**The fix:** check that `navigator.userAgentData` exists before using it, or don't use it.

## 11-fails-in-some-lmss

**The fault:** a script reads and writes `localStorage` before the lesson starts, and the lesson only starts if that
worked. Where storage is blocked (Safari, and browsers that block third-party cookies, for content in another site's
frame), reading `localStorage` throws, so the lesson never starts.

**How it shows:** fine with the defaults and most profiles. The **lms** experiment shows **scorm-cloud** getting less
far (to **Content shown**), with “With storage blocked, the content gets less far”: the scorm-cloud profile blocks
third-party cookies. With **Storage: Blocked** alone, the same, and “The content needs storage the browser can block”
names `localStorage` at `boot.js:2`.

**The fix:** keep the learner's state in the LMS (`cmi.suspend_data`), and wrap any browser storage in `try/catch` so
the course carries on without it.

## 12-waits-forever

**The fault:** `boot.js` tells its parent window it's ready (`{ type: 'player-ready' }`) and waits for a reply
(`{ type: 'launch' }`) before it starts the LMS session. That's a handshake with a particular player; no LMS sends it.

**How it shows:** a static Problem, “Scripts on lesson.html run before what they need: boot.js:2 uses scorm as soon as it
runs”, which is **wrong**: `scorm.start()` on that line is inside the message listener, which would run later, after
`scorm.js`. The run has no uncaught error. It stops after **Content shown**, with “The content was waiting for: a reply
to “player-ready”; a message to arrive (1 listener never ran)”, whose evidence is “boot.js:1 sent “player-ready” to the
LMS window (origin *): nothing there was listening” and “boot.js:2 listens for a message that never came”.

**The proof:** a pin can't send a message. Change `boot.js` in **Files** so it starts the session once the page has
loaded, `addEventListener('load', function () { scorm.start() })`, without waiting for the message. Save it as an
override and run: it finds the API and initialises. (Calling `scorm.start()` at once won't do: `boot.js` runs before
`scorm.js`, so `scorm` doesn't exist yet. That is the problem the static finding imagined.)

**The fix:** an export that doesn't expect the player's handshake, or an LMS-side wrapper that answers it.

## 13-keeps-looking

**The fault:** `boot.js` checks `window.API` every 250 ms, on the course's *own* window, and only starts the session
when it's there. An LMS puts the API on one of its own windows, a parent frame or the opener, never on the course's
window, so it never appears.

**How it shows:** no static findings. The run stops at **Looked for the API** with “The content looked for API and
found nothing: It looked in frames where the LMS hadn't put the API”, and “The content was waiting for: a timer at
boot.js:1 (every 250 ms)”. **Lookups** shows every lookup on `lesson.html`. Drill-down: “In boot.js:2, `if (window.API)`
was false because `window.API` was undefined”, then “`API` is the LMS's SCORM 1.2 API: it lives on an LMS window (a
parent frame or the opener), not on the content's own window.”

**The trap:** the finding's **Try:** suggests **API: Both**. That doesn't help: the API isn't missing, it's somewhere the
course doesn't look. Frame depth and a new window don't help either.

**The proof:** change `window.API` to `parent.API` on line 2 of `boot.js`, as an override. It finds the API and
initialises.

**The fix:** search for the API the standard way: the window, then each parent up to the top, then the opener.

## 14-next-button-late

**Not a fault in the course:** the exercise is the macro. **Next** is on the page from the start but hidden for 3
seconds, so the macro's clicks at 0.5 s and 0.9 s find no visible element, fall back to their position, and hit
nothing. A 10-second run leaves `cmi.core.lesson_location` at `1`.

**The fix:** a wait for the text `Next` before the first click. With it, the clicks land once the button shows, and the
location goes `1`, `2`, `3`. The same is true of real courses with intros, animations or slow requests: wait for
something, not for a time.

## 15-button-moves

**Not a fault in the course:** **Next** is pinned 20 pixels from the top right corner, so its place across the window
changes with the width.

- As recorded, and at **iPhone** size, the clicks find `#next` and click it wherever it is: the location reaches `3`.
  At iPhone size, the note “The macro was recorded at 1100×800 and played at 390×844: clicks may miss” warns you, but
  they don't miss.
- With the selector changed to `#nope`, the clicks can't find their element and use their recorded position, and the
  run notes “2 clicks didn't find their element and used their recorded position”. At iPhone size that position happens
  to land on the button anyway, which is luck, not design.
- At 2400 × 800 the recorded position (93.6% across, 2,246 pixels) is left of the button (2,280 to 2,380 pixels), so the
  position-only clicks miss, and the location stays at `1`.

The lesson: a click tied to its element survives layout changes; a position alone works only at the size it was
recorded.

## 16-cmi5-never-passes

**The fault:** the AU sends its statements in the wrong order (“completed” before “initialized”), and its “passed”
statement uses the bare word `passed` as its verb id instead of the IRI `http://adlnet.gov/expapi/verbs/passed`.

**How it shows:** no static findings. The run ticks every cmi5 milestone, and the banner says “Reached every step”.
But there are three errors: “The LRS rejected 1 statement” (`#4 verb.id: verb.id isn't an absolute IRI`), “1 statement
has a verb id that isn't an IRI”, and “cmi5: The AU sent “completed” before “initialized””. The **xAPI** view shows
statement 4 as rejected.

**Why the LMS never shows passed:** the LRS refused the “passed” statement with status 400, so it was never recorded. A
cmi5 LMS may also ignore or reject the whole session for its order.

**The fix:** use full verb IRIs, and send “initialized” first and “terminated” last.

## 17-tincan-answer-missing

**The fault:** the “answered” statement reports `result.score.scaled` as `1.5`. xAPI allows -1 to 1.

**How it shows:** every Tin Can milestone is reached. The error “The LRS rejected 1 statement” names `#2
result.score.scaled: result.score.scaled must be from -1 to 1`. The completion statement, sent later, is stored.

**Why the answer is missing:** a real LRS refuses the statement just as Package Lab's does, so the answer is never
recorded, while the completion is. Reports built from the LRS show completion and no answer.

**The fix:** report a scaled score between -1 and 1 (here, `1`, or the raw score with `min` and `max`).

## 18-lost-in-some-lmss

**The fault:** `scorm.js` searches for the API on its own window and one parent only (its loop stops at `i < 2`, where
the sample's searches 20). An LMS that puts the course a frame deeper is out of its reach.

**How it shows:** fine with the generic profile, whose course sits directly under the LMS page. The **lms** experiment
shows **moodle**, **scorm-cloud** and **canvas** getting only as far as **Looked for the API**: those presets put one
frame between the LMS and the course. Their runs say “The content looked for API and found nothing: It looked in
frames where the LMS hadn't put the API”. The **frames** experiment agrees: depth 1 and 2 fail, a new window works
(the course also checks its opener).

**The trap:** the experiment's summary for **scorm-cloud** says “With storage blocked, the content gets less far”,
because that profile also blocks third-party cookies. Here it's wrong: this course uses no storage, and moodle and
canvas, which block nothing, fail the same way. The one setting they share is the frame depth. When a finding names a
cause, check it against the other evidence.

**The fix:** search every parent up to the top window, then the opener, as the SCORM standard's sample code does.

## 19-forgets-its-answers

**The fault:** on its first page the course writes 5,000 characters of suspend data. SCORM 1.2 allows 4,096.

**How it shows:** the Problem “Suspend data is 5,000 characters”, and the warning “1 API call failed”, naming
`LMSSetValue(cmi.suspend_data, …) → error 405`. The **API** view shows that call returning `false`. The location
(the page) is a separate value, and it saves.

**The limit:** the standard's, which Package Lab's test LMS enforces. An LMS may set its own; a profile's **Suspend
data 1.2** and **2004** fields change it. Some LMSs cut the data off silently instead of refusing it, which is worse:
the course reads back broken data.

**The fixes:** for the author, save less (or compress it); for the export, publish as SCORM 2004, which allows 64,000.

## Other exercises

Short answers to the exercises not covered above. Your numbers may differ slightly.

**Chapter 5.** (1) A run you leave with **Save and exit** at page 3 reaches every milestone, and has no note about
exit: **Save and exit** sets it to `suspend`. (2) The timed run adds “The content never called LMSFinish” and “The
content never set exit”, because nobody left. (3) The score is `cmi.core.score.raw`: 100 with every answer right.

**Chapter 6.** (1) `cmi.core.exit`, set to `suspend` (by **Save and exit** before the quiz is passed; after it, to an
empty value). (2) `scorm.js` looks on the course's own window first, then its parent, where it finds the API: the
lookups name `find` in `scorm.js`. (3) `lesson.js` is loaded with `defer`, so **Script order** runs it after the
page's normal scripts. (4) Lines for wrong answers, or for the branch you didn't take (passed or failed), are red.
(5) The quiz submission writes the interactions, the score and the status. (6) The course runs in a frame of Package
Lab's own LMS page, as it would in an LMS.

**Chapter 7, exercise 3.** (2) `div#loading.spinner`. (4) `js/next.js`, loaded by `later()` in `js/boot.js`, which
runs only after the JSON is parsed, and the parse threw. (5) The error comes just after the request for
`data/config.json` returns.

**Chapter 8, experiments.** (1) **api both** and **api 1.2** reach **Committed**; **api 2004** and **api none** make no
difference. (2) On `01-works.zip`, **api 2004** and **api none** get less far, as they should (the course uses 1.2).
Depth 1, depth 2 and a new window make no difference: `scorm.js` searches up to 20 parents and the opener. Depth 3 gets
nowhere, which is a known issue in Package Lab 0.3.0 (see the [change log](changelog.md#known-issues)).

**Chapter 11, two LMS behaviours.** (1) With the API 1 second late, the course stops at **Looked for the API** and says
“No LMS found”: it looked once, at once. A sturdier course retries for a few seconds. (2) With commits failing, it
misses **Committed**, with “1 API call failed: LMSCommit() → error 101”. The course doesn't check the result, so the
learner isn't told, and in a real LMS their progress since the last good save would be lost.

**Chapter 12, comparing two runs.** You should see the comparison list branches and functions that ran in one run and not the other:
in **R**, `start` and the API calls it makes; in **F**, the `if (window.startOK)` decision going the other way. It points
at the last line of `lesson.js`, as in chapter 8.

**Chapter 13.** (1) **Make the manifest's SCORM version match the API the scripts use**; the result tracks. (2) The
capitals fix renamed the file because the only reference spells it `app.js`. It isn't fixed: the second fault (the
script runs before the body exists) and the missing `vendor/missing.js` need a person. (3) Nothing to change: the
trailing comma in the JSON needs a decision, so correct it in **Files** and export. Comparing `01-works.zip` with
`02-blank-page.zip` shows `lesson.html` changed, `js/App.js` added, and the new findings about the missing file and
the capitals: enough for the diagnosis. The folder check passes most packages, most of them broken.

**Chapter 14.** `batch --run` adds the furthest milestone of each package, which catches the packages that stop short
(such as `06` and `13`) even though their files pass.
