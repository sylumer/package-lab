# 3. Install, and build your practice kit

**What you'll learn:** how to install the Package Lab app and make the practice packages the rest of this guide uses.

## What you need

A Mac or a Windows PC, and the Package Lab app. That is all for every chapter except two optional extras: the WebKit
(Safari engine) steps in chapter 11 and the command line in chapter 14 need Package Lab's source code, and
[chapter 14](14-working-at-scale.md#before-you-start-the-source-code) explains them. Nothing else needs installing,
and no Terminal.

This guide uses Mac keys: on Windows, Ctrl replaces ⌘, Alt replaces ⌥ and Shift replaces ⇧, so ⌥⌘I is
Ctrl+Alt+I. Where something works only on a Mac, the guide says so.

## Install the app

**On a Mac:**

1. Download `Package-Lab-mac-arm64.zip` from [packagelab.thoughtasylum.com](https://packagelab.thoughtasylum.com) or
   the [latest release](https://github.com/sylumer/package-lab/releases/latest). It is for Macs with Apple silicon (M1
   and later). If your browser didn't unzip it, double-click the zip.
2. Drag **Package Lab** into your **Applications** folder.
3. Open it. The app is signed and notarised by Apple, so macOS opens it after asking once whether you want to open an
   app downloaded from the internet.

**On Windows:**

1. Download Package Lab for Windows from the same places: `Package-Lab-win-x64.zip` for most PCs, or
   `Package-Lab-win-arm64.zip` for Windows on Arm. It is a portable app: a zip with no installer.
2. Unzip it into any folder, a USB stick included.
3. Run `Package Lab.exe` in that folder. The Windows app isn't code-signed yet, so Windows may warn that it comes from an unknown
   publisher: choose **More info**, then **Run anyway**.

Nothing is written to the registry, and Package Lab doesn't make itself the app for `.zip` files. To uninstall it,
delete the folder.

To see whether there is a newer version, choose **Help › Check for Updates…**. Package Lab asks GitHub only when you
choose it, and offers to open the download page.

## Open Package Lab

Open **Package Lab** from Applications or Launchpad on a Mac, or run `Package Lab.exe` on Windows. On a Mac, you can
also right-click a course's `.zip` in Finder and choose **Open With › Package Lab**.

You should see a window that says what Package Lab does and lists common symptoms. That is the **start screen**, and
[chapter 4](04-tour-of-the-window.md) explains it. Leave the window open.

## Build the practice kit

The practice packages are all made from one small SCORM 1.2 sample course, *Fire Safety Basics*: four pages and a
three-question quiz, which bookmarks the learner's page, saves their answers, and records a score.

Build it in the app, on a Mac or Windows: open this guide in its own window (**Help › User Guide**, ⇧⌘G) and choose
**Build practice kit**, under the contents. The packages go in the `practice` folder of Package Lab's data folder, and
**Show folder** opens it. From then on, every practice package name in the guide's text is a button that opens that
package in Package Lab. Build the kit again at any time to get fresh copies.

These are the packages:

| Package | What a learner would report | First used in |
|---|---|---|
| `01-works.zip` | Nothing: it works. Use it to learn what “good” looks like | Chapter 5 |
| `02-blank-page.zip` | “The course is just a white page” | Chapter 7 |
| `03-not-tracked.zip` | “I finished it, but the LMS says I never started” | Chapter 7 |
| `04-loading-forever.zip` | “It says Loading and never gets past it” | Chapter 7 |
| `05-error-in-the-console.zip` | “The browser console shows an error. Does it matter?” | Chapter 7 |
| `06-stuck-connecting.zip` | “It says *Connecting to the LMS…* for ever, and nothing is recorded” | Chapter 8 |
| `07-works-on-the-platform.zip` | “It worked in the authoring tool's preview, but not in our LMS” | Chapter 8 |
| `08-forgets-its-place.zip` | “When I go back, I'm at the start again” | Chapter 10 |
| `09-starts-over.zip` | “It asks me where I was, then starts from page 1 anyway” | Chapter 10 |
| `10-fails-in-safari.zip` | “Fine on my PC, broken on my iPad” | Chapter 11 |
| `11-fails-in-some-lmss.zip` | “Works in one LMS, stuck on *Connecting…* in another” | Chapter 11 |
| `12-waits-forever.zip` | “No errors anywhere, but nothing is recorded” | Chapter 12 |
| `13-keeps-looking.zip` | “It never connects, but the vendor says it's fine” | Chapter 12 |
| `14-next-button-late.zip` | “Our automated test clicks Next and nothing happens” | Chapter 9 |
| `15-button-moves.zip` | “The macro works on my screen but not on the test machine” | Chapter 9 |
| `16-cmi5-never-passes.zip` | “The LMS shows the lesson completed, but never passed” | Chapter 15 |
| `17-tincan-answer-missing.zip` | “The completion arrives, but the quiz answer never shows in our reports” | Chapter 15 |
| `18-lost-in-some-lmss.zip` | “Fine in our test LMS, never connects in Moodle or Canvas” | Chapter 11 |
| `19-forgets-its-answers.zip` | “It remembers my page, but not my answers” | Chapter 11 |

Packages 14 and 15 come with a macro file each (`14-next-button-late.macro.json`, `15-button-moves.macro.json`), and
their course has nothing wrong with it: the exercise is the macro. Packages 16 and 17 are cmi5 and Tin Can (xAPI)
courses, for the last chapter.

Each package has exactly one fault, except `01-works.zip`, `14-next-button-late.zip` and `15-button-moves.zip`, whose
courses are sound. The names tell you the symptom, never the cause. Diagnose with
Package Lab's findings and views first, as you would on a real course where the code is 40,000 lines of minified
JavaScript; read the code when an exercise sends you there, and not before. When you have a diagnosis, check it in
[the answers](appendix-a-answers.md).

## Where Package Lab keeps things

On a Mac, Package Lab keeps its data in `~/Library/Application Support/Package Lab`; on Windows, in
`%APPDATA%\Package Lab`, unless there is a folder named `Package Lab Data` beside `Package Lab.exe`, which it then uses
instead, so that nothing is left on the PC. **Help › Show Data Folder** opens whichever it is:

- `runs/`: every run, saved as JSON;
- `macros/`: macros you save by name;
- `discoveries/`: the results of **Server needs**;
- `practice/`: the practice kit, when you build it from the guide;
- `settings.json`: the app's own settings.

Saved runs hold the course's scripts and the values it stored. Treat them as you would the course itself.

## Check yourself

1. Where do you build the practice kit, and where does it go?
2. Which practice package should you open first, and why?
3. Where would you find a run you did yesterday?

Next: [A tour of the window](04-tour-of-the-window.md).
