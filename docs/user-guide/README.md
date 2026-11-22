# The Package Lab User Guide

From “what is a SCORM package?” to diagnosing a course nobody else can fix.

*Edition 1.2, 22 November 2026, for Package Lab 0.3.0. See the [change log](changelog.md) for what changed.*

This guide teaches Package Lab as a course, in order. Each chapter builds on the one before, and most have exercises
on a set of practice packages that you build in [chapter 3](03-install-and-practice-kit.md). Each practice package
has one fault in it. By the end you will have found every one of them, and you will have the method to find the faults
in real courses.

## The guide and Help

Package Lab has two kinds of documentation, for two different moments:

- **This User Guide teaches you Package Lab.** Read it in order, do the exercises, and come out able to diagnose a
  course. It opens in a window of its own: **Help › User Guide** (⇧⌘G), or **User Guide** at the top of the Help
  panel. In the web interface, it opens in its own tab.
- **[Help](../help.md) helps while you work.** It's the reference: every view, button and setting, one task to a page,
  in the inspector's Help panel beside your work. The ⓘ buttons and **What this means** on a finding open it.

The guide links to Help where you need the detail; those pages open in the guide's window, under a bar that leads
back to your chapter.

## Reading it in the app

The guide's window has the contents on the left, grouped in parts, and **On this page** on the right. Previous and next
chapter are at the foot of each chapter. **Search the guide** searches every chapter.

- **Exercises.** Each *Try it* and *Exercise* heading has a **Done** box. The contents show how many of each chapter's
  exercises you've ticked, and the foot of the contents how many in all.
- **Your place.** The guide reopens at the chapter and the point you were reading.
- **The practice kit.** **Build practice kit**, under the contents, makes the practice packages in Package Lab's data
  folder. After that, the name of a practice package in the text (such as `01-works.zip`) is a button: choose it and the
  package opens in Package Lab. A macro file's name loads that macro into the **Macro** segment.

## Reading it outside the app

- **One file:** every build writes `Package Lab User Guide.html` into `dist/` (and into the Windows zip), and `make
  guide` writes it on its own. It's the whole guide on one page, with the screenshots, for any browser. To make a PDF,
  open it and use the browser's **Print**: each chapter starts on a new page.
- **On GitHub:** the chapters are plain Markdown, and read as they are.

## Who it is for

Anyone who has to work out why an e-learning course doesn't work in an LMS: learning technologists, LMS administrators,
course authors, support staff, developers. You don't need to know SCORM, JavaScript or how browsers work. Chapter 2
covers what you need, and later chapters add the rest as you go.

## The chapters

**Part 1: Foundations.** What the tool is for, and what you need to know first.

1. [Welcome](01-welcome.md): what Package Lab does, how it thinks, and how this guide works.
2. [E-learning in ten minutes](02-elearning-basics.md): packages, LMSs, SCORM, the API, the data model, frames and
   origins, cmi5 and xAPI.
3. [Install, and build your practice kit](03-install-and-practice-kit.md): get Package Lab running and make the
   practice packages.
4. [A tour of the window](04-tour-of-the-window.md): the toolbar, sidebar, views, inspector and docs panel.

**Part 2: Beginner.** Run a course and read what happened.

5. [Your first run](05-first-run.md): open a package, run it, read the verdict.
6. [Reading the evidence](06-reading-the-evidence.md): API calls, lookups, requests, errors, the boot path, the timeline
   and the code view.
7. [Your first diagnoses](07-first-diagnoses.md): four broken packages, found from the findings.

**Part 3: Practitioner.** Test a theory without touching the course.

8. [Testing a theory](08-testing-a-theory.md): one change at a time with settings, changed files, pins, answers and
   experiments.
9. [Macros: playing the learner](09-macros.md): recording, waits, clicks that follow their element, and macro files.
10. [Saving and resuming](10-saving-and-resuming.md): the save-and-resume test.
11. [Browsers, devices and LMSs](11-browsers-devices-and-lmss.md): Safari, iPads, blocked storage and LMS profiles.

**Part 4: Expert.** Find causes the findings can't name, and hand the answer on.

12. [Going deeper](12-going-deeper.md): why it stalled, tracing, drill-down, server needs and a working copy.
13. [Delivering the answer](13-delivering-the-answer.md): corrected packages, reports without the course content,
    saved runs, comparing packages and checking a folder.
14. [Working at scale](14-working-at-scale.md): the command line, options files, the web interface, Alfred and
    Concierge.
15. [Thinking like an analyst](15-thinking-like-an-analyst.md): the method, the habits, the traps, cmi5 and xAPI, and a
    final challenge.

**Back matter**

- [Appendix A: Exercise answers](appendix-a-answers.md): what is wrong with each practice package, and the answers to
  every other exercise.
- [Appendix B: Quick reference](appendix-b-quick-reference.md): the method, the milestones, symptoms, shortcuts and
  commands on one page.
- [Appendix C: Troubleshooting Package Lab](appendix-c-troubleshooting.md): when the tool, not the course, is the
  problem.
- [Glossary](glossary.md): every term this guide uses.
- [Change log](changelog.md): what changed in each edition, and known issues.

## How long it takes

Part 1 takes about half an hour, most of it installing. Parts 2 and 3 take an afternoon each if you do the exercises.
Part 4 is for dipping into as real courses bring you problems.

## Making a website or a PDF

For a website of your own, or a PDF typeset with Pandoc rather than printed from a browser. The chapters are plain
Markdown with relative links and no HTML, and combine into one document.

**The order.** This page, the chapters `01` to `15`, the appendices `A` to `C`, the glossary, then the change log.
File names sort into that order, so a shell glob gives it.

**One HTML file**, with [Pandoc](https://pandoc.org) 3 or later, from this folder:

```bash
pandoc --file-scope --lua-filter book.lua README.md [01]*.md appendix-*.md glossary.md changelog.md --toc --embed-resources --standalone --metadata title="The Package Lab User Guide" -o package-lab-guide.html
```

- `--file-scope` keeps each chapter's headings apart (every chapter has a *Try it* and a *Check yourself*), and turns
  links between chapters into links within the document. `book.lua` fixes the two kinds it misses: links to a whole
  chapter, and anchors that start with digits.
- `--embed-resources` puts the screenshots inside the file, so it can be moved.
- Links to the rest of Package Lab's docs (`../cli.md` and the like) stay as they are. In a standalone file they don't
  resolve; on a website that also publishes `docs/`, they do.
- Don't add `--number-sections`: the chapter titles carry their own numbers.

**A PDF:** the same command with `-o package-lab-guide.pdf --pdf-engine=xelatex -V mainfont="Helvetica Neue" -V
monofont=Menlo`. XeLaTeX (from MacTeX or TeX Live) is needed for the ⌘, ⌥, ✓ and curly quotes the guide uses;
the default `pdflatex` fails on them. Some wide tables will run close to the margin.

**A website:** MkDocs, Docusaurus and GitHub Pages take the folder as it is. List the pages in the order above, and
publish the rest of `docs/` alongside it so the links to the reference work.
