# 6. Reading the evidence

**What you'll learn:** what each of the main views records, what normal looks like in each, and how to move from a
finding to the evidence behind it. Keep a run of `01-works.zip` from chapter 5 selected while you read: the one where you chose
**Save and exit**.

Findings are Package Lab's conclusions. The views are its evidence. An analyst reads both: the findings to know where
to look, the views to check the findings are right and to see what they don't say.

## The API view: the conversation with the LMS

Every SCORM call the content made, in order, with its element, value, result and error code, and below them the values
the LMS held at the end.

On a good run of `01-works.zip` it reads like the healthy session from chapter 2. Here are its first calls, shortened
(your view also shows reads of `cmi.launch_data` and a second read of the status):

| Call | Element | Value | Result |
|---|---|---|---|
| `LMSInitialize` | | | `true` |
| `LMSGetValue` | `cmi.core.student_name` | | `Learner, Test` |
| `LMSGetValue` | `cmi.core.entry` | | `ab-initio` |
| `LMSGetValue` | `cmi.core.lesson_status` | | `not attempted` |
| `LMSSetValue` | `cmi.core.lesson_status` | `incomplete` | `true` |
| `LMSGetValue` | `cmi.suspend_data` | | |
| `LMSSetValue` | `cmi.core.lesson_location` | `1` | `true` |
| `LMSCommit` | | | `true` |
| … | | | |

What to look for:

- **A `false` result**, and the error code beside it. An error on a call the course thinks worked is a silent
  failure. The commonest codes are in the table below.
- **The order.** Reading `cmi.core.entry` and then never reading the location is a course that won't resume.
- **What was never called.** No `LMSFinish`? No `LMSSetValue` of the status? Absence is evidence too.
- **The stored values at the end**: what an LMS would keep.

The error codes you'll see most:

| Meaning | SCORM 1.2 | SCORM 2004 |
|---|---|---|
| Called before the session started | 301 | 122 (get), 132 (set), 142 (commit) |
| No such element (often a typo) | 201 or 401 | 401 |
| The element is read-only | 403 | 404 |
| The value is the wrong type or too long | 405 | 406 |

## Lookups: did the content find the LMS?

Every time the content read `window.API` or `window.API_1484_11`, in any frame, with whether it found one and the line
of code that looked. It also shows each frame's depth and opener, and any time the content *assigned* those names itself.

On a good run there are a few lookups, the last one found. This view answers the most common question about a course that
doesn't track: did it look at all, did it look in the right place, and did it look for the right name?

## Network: every request

Every file and data request: its status, type, and the code that made it. A good run has only `200` responses from
the package. Look for:

- **404 (not found)**: a missing file, or the wrong capitals;
- **requests to the server's root** (`/api/…`) or **another site**: the content expects a platform that isn't here;
- **requests with no response** at the end of the run: something the content is still waiting for.

## Errors and Console

**Errors** lists, in time order, uncaught errors (the ones that stop a script), caught errors (ones the content caught
itself, when **Record caught errors** is on) and browser warnings, each with where it happened. **The first error is
usually the one that matters**: later ones are often knock-on effects.

Caught errors matter because content often catches its own failures and carries on quietly. A course that catches the
error from a failed LMS lookup and switches to “offline mode” shows no uncaught error at all.

**Console** is whatever the content printed with `console.log`. Authors often leave useful messages there.

## Boot path: how the course should load, and how it did

**Boot path** is worked out from the files: every page, script, stylesheet, frame and data file the launch page loads,
in loading order, indented under whatever loads it. Each row says:

- **How** it is loaded: a `tag` on the page, a `request` (fetch or XHR), a script that sets `src`, an `import`, and so on;
- **From**: the file and line that loads it;
- **In the files**: *in package*, *missing*, *wrong capitals*, *server path*, *outside package*, *author's computer* or
  *other site*.

With a run selected, it adds **In the run**: when each file was asked for, and its status, or *never asked for*. The
first file marked *never asked for* is where loading stopped or went another way.

Below the loading path are **Script order** (the order scripts actually run, with `defer` and `async` taken into
account) and **Paths built at run time**, which can't be checked from the files.

## Timeline: everything at once

**Timeline** puts the run on one time axis: milestones, requests (bars, red if they failed), scripts, API calls (dots,
coloured by kind), errors (red ticks) and what the screen showed. Use **Zoom** and **Start** to look closer, hover for
details, and click to open the view an item came from.

The timeline answers “what happened just before it went wrong?”, which no single view can. A request that failed a
moment before the content gave up on the LMS, or an error just after a script loaded, stands out here.

## Frames and Scripts

- **Frames**: every frame navigation and its target, including frames on another origin, workers and popups.
- **Scripts**: every script the browser read, in order, with what loaded it. **Code** opens one.

## Package and Files: the package itself

These two views are about the package, and look the same with or without a run.

- **Package**: the manifest's items and resources, and every match from a scan of the scripts: API names, searches,
  requests, server paths and **mode switches** (names such as `previewMode` or `standalone`, where content often decides
  whether it is in an LMS). Each line number opens the code.
- **Files**: the package's files as a tree, with an editor. [Chapter 8](08-testing-a-theory.md) uses it.

## The code view

Anything that names a place in a file opens the code there: a `file:line` in a finding's evidence (it's a link),
**Code** in Scripts and Execution, a line number in Package, **View code** in Files. It shows:

- **Formatted** code, so a minified file is readable (or **Original**, as it is, or the **Source map**'s original
  source when the file has one);
- **Coverage**, with a run chosen: green lines ran (with how many times), red didn't, amber partly ran;
- **Search** and **Go** to a line.

Coverage is a quiet superpower. A red block in the middle of green tells you which way the code went, without your
having to understand it all.

## From a finding to the evidence

Every finding names its evidence. The skill is following it:

1. Read the finding's **evidence** lines.
2. Click the `file:line` to see the code.
3. Open the view the evidence came from (Network for a request, Errors for an error, Lookups for a lookup) and find
   the row.
4. Look at what happened *just before* it, in that view or the Timeline.

## Try it

Use your run of `01-works.zip` from chapter 5 where you chose **Save and exit** at page 3, before the quiz. **Runs** lists
runs in the order you made them, newest at the bottom.

1. In **API**, find the calls made when you chose **Save and exit**. Which element was set to `suspend`?
2. In **Lookups**, how many times did the content look for `API` before it found it? On which line of `scorm.js`?
3. In **Boot path**, which file is loaded with `defer`, and what does **Script order** say about when it runs?
4. In the code view of `lesson.js`, with your run chosen, find a line coverage shows in red. Why didn't it run?
   (Hint: did you get every question right?)
5. In **Timeline**, use a run where you submitted the quiz, and hover over the API dots around that time. What was
   written?
6. In **Frames**, how many frames does the run have, and which one is the course in? Compare with what chapter 2
   said about where an LMS puts a course.

## Check yourself

1. Which view tells you whether the content looked for the LMS, and where?
2. A run has five errors. Which do you read first?
3. What does *never asked for* in the Boot path's **In the run** column mean?
4. Why can a course with no uncaught errors still have failed because of an error?
5. What does a red line in the code view's coverage tell you?

Next: [Your first diagnoses](07-first-diagnoses.md).
