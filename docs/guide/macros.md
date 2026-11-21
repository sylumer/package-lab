# Macros and test saving

**Test saving** checks that a course saves its place and resumes from it. A **macro** is a list of clicks, keys, typed text and waits that Package Lab plays during a run, so a course can be taken through the same steps each time.

## Test saving

1. Make a macro of one click-through of the course (see [Making a macro](#making-a-macro)), or write one ([Macros](../cli.md#macros)). A macro is needed only if the course saves its place when the learner moves, not at start-up.
2. Choose **Test saving** in the toolbar. It runs the course and plays the macro. Then it leaves the way a learner closing the window does: the course is sent to a blank page, which makes it run its `beforeunload`, `pagehide` and `unload` handlers, and the window is closed. Package Lab keeps the data model the LMS held at that point.
3. It runs the course again with that data, as a resume, and checks that the first run saved something and ended the session, that the LMS offered a resume, that the course read its saved place and used it, and that suspend data carried on from where it was.

The **Test saving** view shows the two runs side by side (entry offered, location and suspend data read and saved, exit, whether the session was ended), with the findings (see [From a save-and-resume test](../findings.md#from-a-save-and-resume-test)). Each run is in the Runs list too, so you can open its API view. Each run lasts as long as **Stop after** (10 s if that is “I stop it”). Test saving runs in Chromium only.

## Testing resume by hand

Test saving does these steps for you. To do them yourself:

1. Launch with **Stop after: I stop it**. Go part-way through, then leave the course the normal way. The **API** view should show suspend data and location being set, exit set to `suspend`, a commit, and `LMSFinish` or `Terminate`.
2. Stop, then check the progress findings and the stored values at the bottom of **API**.
3. Tick **Resume last run's data** (under **Settings › LMS**) and run again. On resume, the content should read `cmi.core.entry` or `cmi.entry` (`resume`), `lesson_location` or `location`, and `suspend_data`, and return to where you were.

If it starts from the beginning, look in the second run's **API** view: did it read those values, and did it use them?

## Making a macro

There are four ways to make one:

- **Record** (the desktop app): launch the item, press **Record** in the toolbar (or **Run › Record Macro**, ⌥⌘R), then click through the course. The button reads **Recording…** while it is on. Press **Record** again, or choose **Stop**, and Package Lab asks “Save 14 steps as the macro?”. **Save** replaces the macro with those clicks, and **Discard** keeps the macro you had. Only clicks made after Record was pressed are kept. Typed text is kept only if **Keep typed text in runs (for macros)** was ticked for that run.
- **Live view** (the desktop app and the web interface): open **Live** (or **Show in Package Lab** in the toolbar), choose **Record clicks** over the Live tab, use the course, then **Save macro**. Everything sent through the picture is recorded with its time into the run. The coordinates bar under the picture shows where a click will land and which element is there (see [Live](views.md#live)).
- **A run in the desktop app**: clicks made directly in the course window can't be seen from outside, so the probe records them in the course's frames instead. Choose a run, then **Use this run's clicks** in the inspector's **Macro** segment. Clicks in a frame on another origin are placed relative to that frame.
- **A file**: the `--macro` option on the command line, or `"macro"` in an options file.

Recording drops pointer moves, and stops with a message at 2,000 events or 100 KB of text. A click made in a frame from another origin is marked approximate and is not replayed; the run's trace says how many were skipped.

## What is kept

The probe records click positions and named keys (Enter, Tab, the arrows…) in the course's frames. It records **typed text** only if **Keep typed text in runs (for macros)** (under **Settings › Recording**) was ticked for that run, and never from a password field or a field whose `autocomplete` names a password, a card detail or a one-time code: only the length of what was typed is kept, and no keys. Without the tick, a run holds no typed text. Text you type through the Live view while **Record clicks** is on is kept in the macro, so don't type secrets there.

A redacted report cuts the text and the values in the selectors. See [Sending a report](changing-and-exporting.md#sending-a-report-without-the-course-content).

## Clicks follow the element

A click is saved with the element it was made on, as well as its position. When the macro plays, the click goes to that element wherever it is now (a button that moved at another window size, say). If the element can't be found, the click goes to its recorded position, and the run has an info finding: “3 clicks didn’t find their element and used their recorded position”. What is saved about the element is a selector, its role, and at most 60 characters of its text; never the text of a password field.

## Window size

A macro remembers the window size it was recorded at (“14 events over 12.3 s, recorded at 1100×800” in the **Macro** segment), because its clicks are positions across the window. When **Device size** is “Window as it is”, the course runs at that size. If you choose a device size yourself, yours wins, and the run says so in a finding: “The macro was recorded at 1100×800 and played at 390×844: clicks may miss”.

## Waits

Timing is the usual reason a macro misses: a button that appears after a slow request isn't there at the moment the click is. A macro file can hold wait steps that block until something has happened, then carry on. A wait is one of: some milliseconds; a piece of text that appears on the page (in any frame of the lesson's origin, or a frame of its own); a step of the run's progress strip (`found`, `initialised`, `wrote`…); or a quiet network (no request pending for that long). Each has a timeout (30 s unless it says otherwise). If it runs out, the macro stops there, the run has the finding “The macro stopped at step 4: waited 30 s for “Next” and it never appeared”, and the run carries on to its end.

## Keeping the macro

The macro is kept with your other options. The **Macro** segment shows how many events it has, with **Clear**. It is played at the start of every run from then on, and is saved in each run's launch options. **Use this run's clicks**, **Record** and **Record clicks** replace the macro you had. Macros need Chromium: with WebKit chosen, the run says so.

## On the command line

`--macro` plays a JSON file of clicks, keys, typing and waits, and `cycle` runs the whole save-and-resume test. The file format is in [Macros](../cli.md#macros), and [cycle](../cli.md#cycle) describes the test.
