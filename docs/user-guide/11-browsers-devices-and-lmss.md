# 11. Browsers, devices and LMSs

**What you'll learn:** why a course that works in one place fails in another, and how to reproduce Safari, iPads,
blocked storage and the way particular LMSs host courses, without leaving Package Lab.

“It works for me” is usually true. The course works in the author's Chrome, on their laptop, in the authoring tool's
preview. It fails for a learner on an iPad, in an LMS that serves content from another domain. The difference is the
environment, and Package Lab can imitate each part of it.

## The browser: Chromium or WebKit

**Settings › Browser and device › Browser** chooses the engine:

- **Chromium**: Package Lab's own browser, the engine inside Chrome and Edge. Everything works.
- **WebKit (Safari's engine)**: the engine of Safari, and of every browser on an iPhone and iPad. It needs Package Lab
  run from its source code, with WebKit added ([chapter 14](14-working-at-scale.md#add-webkit)): the downloaded
  app can't run WebKit, and says so if you choose it.

A WebKit run uses the same test LMS, files, changes, pins, answers, profile and storage setting. It records requests,
console messages, uncaught errors and API calls, but not coverage, caught errors or script sources, so it can't be
traced and the code view is empty. Its label says `webkit`.

The commonest cause of a WebKit-only failure is code that uses something only Chrome has, such as
`navigator.userAgentData`. The error names it, with the line.

## The device: phone and tablet sizes

**Device size** runs the course at **iPhone** (390 × 844), **iPad** (820 × 1180), **Android phone** (412 × 915) or a
custom size. The presets also turn on touch, tell the course it's on a mobile device (its user agent included) and
honour its `<meta name="viewport">`. A custom size changes only the size.

Use it for layout problems (a **Next** button off the screen, a course that refuses to run on a phone) and together
with WebKit for “fails on my iPad”.

## Storage: what the browser lets the course keep

**Storage** sets what the course's frames get:

| Storage | What happens |
|---|---|
| **Normal** | Storage as usual. It lasts between runs while the app is open, shared by every package |
| **Blocked (Safari-like)** | `localStorage` and `sessionStorage` throw a `SecurityError`, cookies read as empty, IndexedDB fails. The strictest case: Chrome with third-party cookies blocked, and some Safari versions and settings, for a page inside another site's frame |
| **Partitioned (empty)** | Nothing refused, but emptied before the run: a learner's first visit, and how current Safari usually treats a frame from another site |

If the course used blocked storage, the finding **The content needs storage the browser can block** lists every use,
with its line. The fix is to keep the course's state in the LMS (`cmi.suspend_data`) and wrap browser storage in
`try/catch`.

## The LMS: profiles

Every LMS hosts a course a little differently. **Settings › LMS › Profile** imitates one:

- **generic** is Package Lab's own test LMS, the default;
- **moodle**, **scorm-cloud**, **cornerstone**, **successfactors**, **docebo**, **totara**, **blackboard** and **canvas**
  are approximations, from each LMS's public documentation and community reports, of what it does by default.
  **canvas** is Canvas's SCORM tool showing a package in a frame inside the course page, its default. The notes under the list say
  which documents, and where they were silent.

Choose a profile and its fields fill in. The ones that break courses:

| Field | What it imitates | What breaks |
|---|---|---|
| **Content origin** | Course files served from the LMS's own domain (**same**) or another (**other**) | Across origins the course can't reach the LMS's windows, so it can't find the API |
| **Frames**, **Frame kind** | How many LMS frames wrap the course, and whether they're `iframe`s or an old `frameset` | Courses that search too few parents |
| **Sandbox**, **Allow** | The sandbox on the course's frame | A sandbox without `allow-same-origin` cuts the course off |
| **Launch**, **Popup delay** | In a frame, or a new window after a delay | Courses that only search parents, or look only once |
| **API delay** | The API appears a moment after launch | Courses that look once, at once |
| **API on** | The API on the top window, the parent, or the opener | Courses that look in only one place |
| **CSP**, **Headers** | Security headers on every file | Inline scripts, `eval`, other sites |
| **Commit**, **Slow commit** | Commits that fail or are slow | Courses that ignore a failed save |
| **Suspend data** | The LMS's own limit | Courses that save a lot |
| **Cookies** | Third-party cookies blocked | The same as blocked storage |

Change any field to try a variation; choosing another profile clears your changes. An LMS's administrator can change
most of these, so **treat a preset as a likely setup, not a fact**. When you know the real settings, set them here for each run, or write them down as
your own profile file *(command line, [chapter 14](14-working-at-scale.md#profiles-of-your-own))*.

## Experiments for this chapter

Three experiment presets, from the **Experiments** view, try all of it at once:

- **browsers**: Chromium, then WebKit;
- **storage**: normal, then blocked;
- **lms**: every profile in turn.

## Try it: `10-fails-in-safari.zip`

*“Fine on my PC, broken on my iPad.”*

1. Run it for 10 seconds with the default settings. How far does it get?
2. Set **Browser** to **WebKit** (it needs the source code with WebKit added: see [chapter 14](14-working-at-scale.md#add-webkit))
   and **Device size** to **iPad**, and run again. How far now? What does the course show? Would WebKit alone, at the
   normal size, have been enough?
3. Read **Errors**. What is the error, and which line of which file? What does that code use?
4. Now run the **browsers** experiment. Does the table agree?
5. Put **Browser** and **Device size** back.

With the downloaded app you can do step 1 only: WebKit needs the source code. Read the other steps, then
[the answer](appendix-a-answers.md#10-fails-in-safari), which gives what each WebKit run shows.

## Try it: `11-fails-in-some-lmss.zip`

*“Works in one LMS, stuck on Connecting… in another.”*

1. Run it with the defaults. Does it work?
2. Run the **lms** experiment. Which profile gets less far than the others?
3. Click that row to open its run. Read the findings. What does the course need that this LMS doesn't allow?
4. Prove the cause with one setting, without a profile: set the profile back to **generic**, set **Storage** to
   **Blocked**, and run. Same result?
5. Find the line of code in the finding's evidence. What would you tell the author to change?
6. Put **Storage** back to **Normal**.

Check your answer in [the answers](appendix-a-answers.md#11-fails-in-some-lmss).

Notice how step 4 narrowed it down. The profile changed several things at once. Setting one of them on its own showed
which one mattered. That is the one-change rule again.

## Try it: `18-lost-in-some-lmss.zip`

*“Fine in our test LMS, never connects in Moodle or Canvas.”*

1. Run it with the defaults. Does it work?
2. Run the **lms** experiment. Which profiles get less far? Click one and read its findings.
3. One of the failing rows, **scorm-cloud**, also blocks storage. Read its finding: does Package Lab blame storage?
   Why not?
4. Find the one setting the failing profiles share. Test it on its own: set the profile back to **generic**, change
   only that setting to the failing profiles' value, and run. Then run the **frames** experiment.
5. Open **Lookups** for a failing run. How many windows did the course look at before it gave up? In `scorm.js`, find
   the line that decides how far it searches.
6. Put **Frame depth** back to 0.

Check your answer in [the answers](appendix-a-answers.md#18-lost-in-some-lmss).

## Try it: `19-forgets-its-answers.zip`

*“It remembers my page, but not my answers.”*

1. Run it for 10 seconds. What's the first Problem? What does the **API** view show for the call it names?
2. Which limit is it over, and is it this LMS's limit or the standard's? Where in a profile could you change the
   limit to match a particular LMS?
3. Suggest two fixes, one for the author and one for the package's export.

Check your answer in [the answers](appendix-a-answers.md#19-forgets-its-answers).

## Try it: two LMS behaviours on `01-works.zip`

Profiles can break a course that has nothing wrong with it as written. Two common ones:

1. **The API comes late.** In **Settings › LMS**, set **API delay (ms)** to 1000, and run `01-works.zip` for 10
   seconds. How far does it get? What does the course's first line say? `scorm.js` looks for the API once, at start-up.
   What would a sturdier course do?
2. **The save fails.** Set **API delay** back to 0, set **Commit** to **fail**, and run again. Which milestone is
   missed now? Does the course tell the learner? What would a learner lose in a real LMS?
3. Choose the **generic** profile again to clear your changes.

Check your answers in [the answers](appendix-a-answers.md#other-exercises).

## Check yourself

1. A course fails only in WebKit. What's the first view you read, and what are you looking for?
2. Why can't you trace a WebKit run, and how do you get round it?
3. What's the difference between **Blocked** and **Partitioned** storage?
4. A course fails with the **scorm-cloud** profile, which changes both storage and frame depth. How do you find out
   which of the two matters?
5. Why should you treat a profile as an approximation?

Next: [Going deeper](12-going-deeper.md).
