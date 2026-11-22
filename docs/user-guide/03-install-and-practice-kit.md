# 3. Install, and build your practice kit

**What you'll learn:** how to get Package Lab running, check that your computer has everything it needs, and make the
practice packages the rest of this guide uses.

## What you need

- A Mac. A portable Windows build exists too (see `docs/windows.md` in the Package Lab folder). It has no Terminal
  commands, but everything else in this guide works in it, the practice kit included: skip to
  [Open Package Lab](#open-package-lab). This guide uses Mac keys: on Windows, Ctrl replaces ⌘ and Alt replaces ⌥.
- [Node.js](https://nodejs.org) 20 or later. To see if you have it, open **Terminal** (in Applications › Utilities)
  and type `node --version`. If it says “command not found”, install Node from its website first.
- The Package Lab folder. These steps assume it is at `~/github/package-lab`.

If you have never used Terminal: you type a command, press Return, and it prints its answer. Each grey box below is one
command. Copy it exactly.

## Install

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

## Check your computer

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
first.)

## Open Package Lab

Any of these works:

- **Package Lab** in Applications or Launchpad, if you ran `install-app`;
- `package-lab open` in Terminal;
- `npm start` in the Package Lab folder.

You should see a window that says what Package Lab does and lists common symptoms. That is the **start screen**, and
[chapter 4](04-tour-of-the-window.md) explains it. Leave the window open.

## Build the practice kit

The practice packages are all made from one small SCORM 1.2 sample course, *Fire Safety Basics*: four pages and a
three-question quiz, which bookmarks the learner's page, saves their answers, and records a score.

**In the app (Mac or Windows):** open this guide in its own window (**Help › User Guide**, ⇧⌘G) and choose **Build
practice kit**, under the contents. The packages go in the `practice` folder of Package Lab's data folder, and
**Show folder** opens it. From then on, every practice package name in the guide's text is a button that opens that
package in Package Lab. Build the kit again at any time to get fresh copies.

**From Terminal**, if you'd rather have the packages somewhere of your own, in the Package Lab folder:

```bash
npm run practice
```

It prints `19 practice packages and 2 macros in …/package-lab/practice`. To put them somewhere else, give a folder:
`node scripts/practice-kit.js ~/Desktop/practice`.

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

Package Lab keeps its data in `~/Library/Application Support/Package Lab` (**Help › Show Data Folder** opens it):

- `runs/`: every run, saved as JSON;
- `macros/`: macros you save by name;
- `discoveries/`: the results of **Server needs**;
- `practice/`: the practice kit, when you build it from the guide;
- `settings.json`: the app's own settings.

Saved runs hold the course's scripts and the values it stored. Treat them as you would the course itself.

## Check yourself

1. What does `package-lab doctor` tell you, and when would you run it?
2. Which practice package should you open first, and why?
3. Where would you find a run you did yesterday?

Next: [A tour of the window](04-tour-of-the-window.md).
