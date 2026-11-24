# 3. Install, and build your practice kit

**What you'll learn:** how to install the Package Lab app, make the practice packages the rest of this guide uses, and,
if you have the Package Lab source, set up the command line too.

## What you need

A Mac, or a Windows PC. Most people download the app. That is all this chapter's main steps need, and it does
every exercise except the WebKit steps in chapter 11 and the command line in chapter 14. This guide uses Mac keys: on Windows, Ctrl replaces ⌘ and Alt replaces ⌥.

A few things need the Package Lab source instead, and Node.js: the `package-lab` command line
([chapter 14](14-working-at-scale.md)), the web interface, and WebKit runs, which stand in for Safari in
[chapter 11](11-browsers-devices-and-lmss.md). If you have the source, see
[If you have the source](#if-you-have-the-source) below. If you don't, you can come back to it when you reach those
chapters.

## Install the app

**On a Mac:**

1. Download Package Lab for Mac. If your browser didn't unzip it, double-click the zip.
2. Drag **Package Lab** into your **Applications** folder.
3. Open it. The app isn't signed by Apple, so the first time macOS may say it can't check it for malicious software.
   Choose **Done**, then go to **System Settings › Privacy & Security**, scroll down, and choose **Open Anyway** beside
   the message about Package Lab. You need to do this only once.

**On Windows:**

1. Download Package Lab for Windows. It is a portable app: a zip with no installer.
2. Unzip it into any folder, a USB stick included.
3. Run `Package Lab.exe` in that folder. The app isn't code-signed, so Windows may warn that it comes from an unknown
   publisher: choose **More info**, then **Run anyway**.

Nothing is written to the registry, and Package Lab doesn't make itself the app for `.zip` files. To uninstall it,
delete the folder.

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

If you have the source, you can also build the kit from Terminal into a folder of your own: see
[Practice packages from Terminal](#practice-packages-from-terminal).

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

Each package has exactly one fault (the first has none). The names tell you the symptom, never the cause. Diagnose with
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

## If you have the source

This section is for people with a copy of the Package Lab source, the repository, rather than the downloaded app.
It gives you the `package-lab` command line, the web interface and WebKit runs as well as the app. Skip it if you
downloaded the app.

You need:

- a Mac (on Windows, the command line runs from the source too; `docs/windows.md` in the source explains how);
- [Node.js](https://nodejs.org) 20 or later. To see if you have it, open **Terminal** (in Applications › Utilities)
  and type `node --version`. If it says “command not found”, install Node from its website first;
- the source folder. These steps assume it is at `~/github/package-lab`; use your own path if it is elsewhere.

If you have never used Terminal: you type a command, press Return, and it prints its answer. Each grey box below is one
command. Copy it exactly.

### Install from the source

Go to the folder and install what Package Lab needs:

```bash
cd ~/github/package-lab
```

```bash
npm install
```

This takes a minute or two the first time. Then make the `package-lab` command available everywhere:

```bash
npm link
```

And, if you'd like Package Lab in your Applications folder, Launchpad and Finder's **Open With** menu:

```bash
npm run install-app
```

From the source you can open Package Lab with `package-lab open` in Terminal, or `npm start` in the source folder, as
well as from Applications if you ran `install-app`.

### Check your computer

```bash
package-lab doctor
```

`doctor` checks Node, Electron (the browser Package Lab is built on), the data folder and the rest, and ends with a
**To do** list of anything missing. One item is optional: **WebKit**, Safari's engine, which you need only in
[chapter 11](11-browsers-devices-and-lmss.md). To add it now:

```bash
make webkit
```

That downloads Playwright's copy of WebKit. (If `doctor` says Playwright itself is missing, run `npm install` again
first.) WebKit runs work only when Package Lab runs from the source: `npm start` or `package-lab open`, not the app
that `install-app` copies to Applications.

### Practice packages from Terminal

The app's **Build practice kit** is all you need, but from the source folder you can also build the kit into the
source's own `practice` folder:

```bash
npm run practice
```

It prints `19 practice packages and 2 macros in …/package-lab/practice`. To put them somewhere else, give a folder:
`node scripts/practice-kit.js ~/Desktop/practice`.

## Check yourself

1. Where do you build the practice kit, and where does it go?
2. Which practice package should you open first, and why?
3. Where would you find a run you did yesterday?

Next: [A tour of the window](04-tour-of-the-window.md).
