# 1. Welcome

## The problem Package Lab solves

An e-learning course arrives as a ZIP file. Somebody uploads it to the LMS (the learning management system that hands
courses to learners and records their progress). Then something goes wrong:

- the course doesn't open, or shows a blank page;
- it sits on a loading spinner for ever;
- it plays, but the LMS never records that anyone took it;
- learners come back and have to start again;
- it works in Chrome but not in Safari, or on a laptop but not on an iPad;
- it works in one LMS but not in the one your organisation uses.

The LMS usually says nothing useful. The authoring tool says the course is fine. The vendor asks for a screenshot.
Everyone is guessing.

Package Lab stops the guessing. It plays the part of the LMS itself, runs the course in a browser of its own, watching it the way a programmer's debugger does,
and records everything the course does: every file it loads, every message it sends to the LMS, every error, and what
was on the screen. Then it turns that record into **findings**: what went wrong, the evidence, the likely cause and
what to try.

Everything happens on your own computer. Package Lab itself sends nothing anywhere. The course runs in Package Lab's
browser as it would in a learner's, so the course's own requests (fonts, analytics, its vendor's servers) still go
out, and the **Network** view shows every one. Treat a course you don't trust as you would on any web page.

## How Package Lab thinks

Four ideas run through the whole tool. Once you have them, its features make sense.

**1. Read the files before running anything.** A lot can be told from the ZIP alone: a manifest with the wrong name,
a script that isn't in the package, a file name with the wrong capitals. Package Lab checks these the moment you open a
package. These are *static* findings.

**2. Then run it and record what really happens.** Some problems only show when the course runs: a request to a server
that isn't there, an error on line 4,000 of a script, a course that never looks for the LMS. Package Lab launches the
course in its own test LMS and records the run. These are *run* findings.

**3. Measure how far it got.** Every run is placed on a path of **milestones**: the page loaded, the scripts loaded,
something showed, the course looked for the LMS, found it, started a session, read its saved data, wrote progress,
saved it, and finished. The first milestone it missed is where to start looking. “How far did it get?” becomes a
question with an answer, and a change that makes it get further is a change that helped.

**4. Change one thing and run again.** When you have a theory (“it can't find the LMS because the LMS is further away than the course looks”; [chapter 2](02-elearning-basics.md)
explains how a course finds its LMS), you test it by changing one setting or one file in Package Lab, never in the real course, and running again.
If it gets further, the theory was right.

That last idea is what separates an analyst from someone clicking buttons. Most of this guide is about it.

## What Package Lab is not

- **It isn't your LMS.** Its test LMS follows the standards and can imitate the way several real LMSs host courses,
  but a run in Package Lab is a strong hint, not a verdict. Confirm every fix in the real LMS.
- **It isn't an authoring tool.** It can make small, mechanical corrections to a package and lets you try edits, but
  the lasting fix usually belongs in the authoring tool's export.
- **It doesn't judge the course's teaching.** It cares whether the course works and tracks, not whether it's good.

## The ways to use it

| Way | What it is | Where this guide covers it |
|---|---|---|
| Desktop app | A Mac (or Windows) window. Most of this guide uses it | Chapters 4 to 13 |
| Command line | `package-lab` commands for quick checks, scripts and reports. Needs the Package Lab source | [Chapter 14](14-working-at-scale.md) |
| Web interface | The desktop app in any browser, from another computer, iPad or phone. Needs the source too | [Chapter 14](14-working-at-scale.md) |

## How this guide works

Each chapter has:

- **What you'll learn**, at the top;
- the explanation, with the buttons and views to use in **bold**;
- **Try it** exercises on the practice packages;
- **Check yourself**, a few questions at the end. If you can answer them, move on.

The practice packages are all made from one small sample course, *Fire Safety Basics*, with a single fault added to
each. Their names describe the symptom a learner would report, never the cause. Finding the cause is the exercise.
When you have a diagnosis, check it in [the answers](appendix-a-answers.md).

A note on words: this guide uses *course*, *package* and *content* almost interchangeably. Strictly, the
**package** is the ZIP file, the **course** is what the learner sees, and the **content** is the course's own pages
and scripts as they run. The [glossary](glossary.md) has every other term.

## Check yourself

1. What is the difference between a static finding and a run finding?
2. Why does Package Lab care about the *first* milestone a run missed?
3. Where should you make a change to test a theory: in the course's files, or in Package Lab?

Next: [E-learning in ten minutes](02-elearning-basics.md).
