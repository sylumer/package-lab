# 10. Saving and resuming

**What you'll learn:** how to check that a course saves the learner's place and picks it up again, by hand and with
Package Lab's save-and-resume test. You'll need the macro you recorded in [chapter 9](09-macros.md).

“I have to start again every time” is one of the commonest complaints about e-learning, and one of the hardest to
reproduce, because it needs two sessions and a learner who left part-way. Package Lab can be that learner.

## What a working resume needs

From [chapter 2](02-elearning-basics.md#the-data-model), a course resumes properly when:

1. as the learner moves, it **writes** the bookmark (`lesson_location`) and its own state (`suspend_data`);
2. when the learner leaves early, it sets **exit** to `suspend`, and ends the session (`LMSFinish` or `Terminate`);
3. next time, the LMS **offers a resume**: `entry` is `resume`, and the saved values are given back;
4. the course **reads** the bookmark and suspend data, and **uses** them to go back to where the learner was;
5. when it saves again, it **adds to** what was there rather than starting over.

A fault at any step looks the same to the learner: they start again. The job is to find which step broke.

## Testing it by hand

You can do the whole thing yourself:

1. Set **Stop after** to **I stop it**, and **Run**.
2. Go a few pages in, then leave the course the normal way (its exit or close button).
3. **Stop**. In **API**, check that the location and suspend data were set, exit was set to `suspend`, there was a
   commit, and `LMSFinish` was called.
4. In **Settings › LMS**, tick **Resume last run's data**, and **Run** again. The data model starts with what the last
   run stored.
5. Did the course go back to where you left? In this run's **API** view, did it read `cmi.core.entry`,
   `lesson_location` and `suspend_data`, and then write the same location back?

That works, but it's slow, and it's easy to forget a step. The save-and-resume test does it for you.

## Test saving

**Test saving** in the toolbar (⇧⌘R) runs the course, plays a macro of the learner's clicks, and then leaves the way
a learner closing the window does: the course is sent to a blank page, so its `beforeunload`, `pagehide` and `unload`
handlers run, and the window is closed. Package Lab keeps what the LMS held. Then it runs the course again with that
data, as a resume.

The **Test saving** view shows the two runs side by side:

| Row | Run 1: leaves | Run 2: resumes |
|---|---|---|
| Entry offered | `ab-initio` | `resume` |
| Location saved (first, last) | `1, 3` | `3, 3` |
| Exit set | `suspend` | |
| Session ended by the content | yes, while leaving | no |

and the findings, which stop at the first thing that went wrong: **Leaving the course saved nothing**, **…didn't end
the session**, **The LMS started a new attempt instead of resuming**, **On resume, the content didn't read its saved
place**, **The content read its saved place but started from the beginning**, and so on. The last one you want to see
is **Saving and resuming worked**.

Each run lasts as long as **Stop after** (10 s if it says *I stop it*). Both runs are in **Runs**, so you can open
their API views. Test saving runs in Chromium only.

## Why it needs a macro

Without a macro, Test saving checks only what the course saves by itself at start-up. Most courses save as the learner
moves, so for a real test something must move: that's the macro from [chapter 9](09-macros.md). Run 1 plays it; run 2
plays nothing, so you can see where the course puts the learner by itself.

**The macro carries over.** The current macro isn't tied to a package: it stays loaded when you open another one, and
plays in every run until you **Clear** it. That's handy here, because every practice package has the same **Next**
button. It's a nuisance later, so the chapter ends by clearing it.

## Try it: `01-works.zip` first

1. Open `01-works.zip`. In the **Macro** segment, choose your saved macro `two-pages` from the menu at the top (or
   record one again: **Next** twice).
2. Choose **Test saving**. Read the table. What location did run 1 save last? What did run 2 read?
3. The last finding should be **Saving and resuming worked**. This is what good looks like.

## Try it: `08-forgets-its-place.zip`

*“When I go back, I'm at the start again.”*

1. Open it. The macro from `01-works.zip` is still loaded: check the **Macro** segment.
2. **Test saving**. Read the row **Entry offered** for run 2, and the row **Exit set** for run 1.
3. Read the finding. Which of the five steps above broke?
4. Check it by hand: in run 1's **API** view, is there a `LMSSetValue` of `cmi.core.exit`?

Check your answer in [the answers](appendix-a-answers.md#08-forgets-its-place).

## Try it: `09-starts-over.zip`

*“It asks me where I was, then starts from page 1 anyway.”*

1. With your macro, **Test saving**.
2. Compare **Location saved (first, last)** for the two runs. Where did run 1 leave? Where did run 2 start?
3. Read the finding. This time, which step broke? Did the course read its bookmark?
4. In run 2's code view of `lesson.js`, find where the location is read and what is done with it.

Check your answer in [the answers](appendix-a-answers.md#09-starts-over).

## Two warnings about this test

- **It uses Package Lab's test LMS's rules.** It offers a resume only after exit is `suspend`, as many LMSs do. Some
  LMSs are more forgiving, some stricter. Confirm the behaviour in the real LMS.
- **Suspend data has limits.** A finding “Suspend data is *N* characters” means an LMS may cut it off: 4,096 in SCORM
  1.2, 64,000 in 2004, or a profile's own limit. A course that resumes in Package Lab but not in the LMS may be over it.

## Before you go on

Choose **Clear** in the **Macro** segment. The next chapters' runs should play no macro.

## Check yourself

1. Name the five things a course must do for resume to work.
2. Why does Test saving need a macro for most courses?
3. A course resumes in Package Lab but not in the LMS. Name two things you'd check.
4. Why does run 2 of the test play no macro?

Next: [Browsers, devices and LMSs](11-browsers-devices-and-lmss.md).
