# Change log

What changed in each edition of this handbook, newest first. The handbook describes **Package Lab 0.3.0**. Where the
app and the handbook disagree, the app is right: please report it.

## Known issues

Problems in Package Lab 0.3.0 that the exercises run into. The handbook points them out where they appear.

- **Frame depth 3 doesn't load the course.** A run with **Frame depth** 3 (or the **depth 3** variant of the
  **frames** and **standard** experiments) ends on a blank page and reaches no milestone, even for a course that works
  at every other depth. Depths 0 to 2 work. ([Chapter 8](08-testing-a-theory.md#tool-5-experiments))
- **An experiment can blame the wrong setting.** When an LMS profile changes several settings, the experiment's summary
  may name blocked storage for a failure that another of the profile's settings caused. For `18-lost-in-some-lmss.zip`,
  the **scorm-cloud** row is blamed on storage; the cause is the frame depth. ([Chapter 11](11-browsers-devices-and-lmss.md))
- **“Scripts run before what they need” can be wrong.** The static check reports a name used early in a script even
  when the use is inside a function that runs later, such as an event listener. `12-waits-forever.zip` shows it.
  ([Chapter 12](12-going-deeper.md#why-it-stalled))

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
- A *Beyond this handbook* section in chapter 15: interactions, SCORM 2004's two statuses, sequencing, the Windows
  build.
- This change log, and `book.lua`, a Pandoc filter for building the handbook as one document.

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
  milestone, what the web interface can't do, Alfred's keywords and the Concierge module.

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
