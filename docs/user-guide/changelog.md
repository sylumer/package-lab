# Change log

What changed in each edition of this guide, newest first. The guide describes **Package Lab 0.3.0**, with the fixes
listed under edition 1.2. Where the app and the guide disagree, the app is right: please report it.

## Edition 1.3 (25 November 2026)

**New**

- Chapter 3 says where to download Package Lab (the website and GitHub releases), that the Mac app is signed and
  notarised, and that **Help › Check for Updates…** says whether there is a newer version.

## Edition 1.2 (22 November 2026)

The guide becomes a book of its own, and the app problems the last edition listed as known issues are fixed.

**New**

- The User Guide has its own window: **Help › User Guide** (⇧⌘G), or **User Guide** in the Help panel. Contents by
  part, Previous and Next, On this page, search, a **Done** box on every exercise with progress in the contents, and it
  reopens where you left off. The web interface has the same at `guide.html`, in a tab of its own.
- The practice kit builds from the guide's window (**Build practice kit**), on the Mac or Windows, with no Terminal.
  Practice package names in the text open the package in Package Lab; macro file names load the macro.
- `Package Lab User Guide.html`: the whole guide in one file, written into `dist/` and the Windows zip by every build,
  and by `make guide`.
- `Package Lab User Guide.pdf`: the guide as a PDF, with a cover, contents, bookmarks and working links, written
  beside it by every build, and by `make guide-pdf`.

**Changed**

- Names: this book was the *Handbook* and is now the *User Guide*. What used to be called the user guide (the
  reference, one task to a page) is now **Help**, and stays in the inspector's Help panel. The Help menu's **Show Docs**
  is now **Show Help**, and **Help Topics** opens Help's index.
- About this guide explains the guide and Help, and the guide's window. Chapters 3, 4 and 9 use the window: building
  the kit, opening packages and loading macros. Windows users can now do every exercise the Mac app can.
- Appendix C has a section on the guide's window.
- A review as a new reader: the counts of faulty and sound practice packages agree everywhere; what needs the source
  code is said up front, with each command-line-only feature marked; “run it for 10 seconds” is defined; the run list
  is oldest first, as the app shows it; a fixed pipeline gate (`jq`), Windows paths and menus, suspend data limits
  as minimums, softer claims about Safari storage and real LRSs, a short cmi5 primer before exercise 16, and more
  glossary terms. The findings' **Try:** says “API set to Both”, not “the Both APIs profile”.
- Chapter 3 is about the downloaded app only, on the Mac or Windows, and its first-open warnings: no Terminal, no
  source code. Setting up the source code (Node.js, `npm install`, `npm link`, `doctor`, `make webkit`) moves to the
  start of chapter 14, the only chapter that needs it, with WebKit for chapter 11. Chapters 1 and 11, Appendices B and
  C say what needs the source: the command line, the web interface and WebKit runs.

**Fixed in Package Lab, and so no longer known issues**

- **Frame depth 3 now loads the course.** The browser refused a third LMS frame with the same address as the frames
  around it; each LMS frame now has its own. Chapter 8's experiment and its answer are updated.
- **Experiments no longer blame blocked storage for another setting.** A variant that blocks storage, among other
  changes, is put down to storage only if the course used storage. Chapter 11's exercise on `18-lost-in-some-lmss.zip`
  and its answer are updated.
- **“Scripts run before what they need” no longer fires for code inside a function.** A use inside a listener or a
  callback written on the same line runs later, so it isn't flagged. `12-waits-forever.zip` has no static findings now;
  chapter 12's exercise, chapter 15's traps and Appendix A are updated.

## Edition 1.1 (22 November 2026)

A revision after a full review of the first edition, against the app, its reference docs and runs of every exercise.

**New**

- Chapter 9, *Macros: playing the learner*: recording in the toolbar and in the Live view, the coordinates bar, what
  a macro remembers, waits, the editor, saved macros, macro files and `package-lab macro show`.
- Six practice packages: `14-next-button-late` and `15-button-moves` (with a macro file each) for macros,
  `16-cmi5-never-passes` and `17-tincan-answer-missing` for xAPI, and `18-lost-in-some-lmss` and
  `19-forgets-its-answers` for LMS hosting. The kit now has 19 packages.
- Exercises on an API that comes late, failing commits, and comparing two local runs (**R** and **F**).
- Appendix A now answers every exercise, under *Other exercises*. Appendix B, *Quick reference*, and Appendix C,
  *Troubleshooting Package Lab*.
- A *Beyond this guide* section in chapter 15: interactions, SCORM 2004's two statuses, sequencing, the Windows
  build.
- This change log, and `book.lua`, a Pandoc filter for building the guide as one document.
- A *Known issues* section, for three problems in Package Lab the exercises ran into. All three are fixed in edition 1.2.

**Changed**

- Chapters 9 to 14 became 10 to 15. *Saving and resuming* (now chapter 10) uses chapter 9's macro, and says that the
  macro carries over from one package to the next until you clear it.
- *Exercise answers* became Appendix A.
- The three severities: the window says **Problem**, **Warning** and **Note**; the command line says error, warning and
  info. Chapter 5 maps them, and exercises in the window now say Problem.
- Chapter 3: the full kit, `make webkit` instead of `npm i -D playwright` (which changed `package.json`), what Windows
  users can and can't do, and “read the code only when an exercise says so”.
- Chapter 4: which settings are remembered after you quit; the **Open** button's real label; **Open saved…** and the
  **R** and **F** marks.
- Chapter 6: SCORM 1.2 and 2004 error codes side by side; the API table marked as shortened; a **Frames** exercise.
- Chapter 13: the corrected-package fixes under their real checklist names, including the Xyleme fix.
- Chapter 14: more flags, `--variants`, `discover --request`, `items`, exit statuses, how to gate a pipeline on a
  milestone, what the web interface can't do, and two integrations since taken out of the docs.

**Corrected**

- Chapter 5: the quiz is three **Next**s away, not two; going back to the files-only views means opening the package
  again (there is no entry for the package in **Runs**).
- Chapter 13: opening a saved run in the app only reads it. Repeating it needs the same ZIP and
  `package-lab run --options-from`.
- Chapter 14: `--strict` fails on error findings, not on a missed milestone.
- Chapter 8: the **standard** experiment on `01-works.zip` has a stated result, and the depth 3 issue is noted.
- Appendix A: the second fault in `02-blank-page.zip` names the right file for each way of fixing the first; the
  answer for `08-forgets-its-place.zip` no longer contradicts itself.
- Chapter 2: the manifest extract says what it leaves out; the six healthy steps “map onto” the ten milestones.
- Chapter 1: no jargon before chapter 2 explains it.
- Folder-check lessons no longer quote a count of packages that changes with the kit.

## Edition 1.0 (22 November 2026)

The first edition: fourteen chapters from foundations to expert method, exercise answers, a glossary, and a practice
kit of thirteen packages built by `npm run practice`.
