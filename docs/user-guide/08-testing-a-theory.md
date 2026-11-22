# 8. Testing a theory

**What you'll learn:** how to prove a diagnosis instead of guessing it, by changing one thing in Package Lab and
running again. You'll use launch settings, changed files, pins, answers and experiments.

## Why prove it?

In chapter 7 you formed diagnoses from findings. A diagnosis is a theory. Before you tell an author to republish, or an
LMS administrator to change a setting, you want to know the change will work. Package Lab lets you make that change in
its own copy of the world, without touching the course, and see whether the course gets further.

The rule, from [chapter 1](01-welcome.md#how-package-lab-thinks): **change one thing, run again, compare.** If you
change two things and it works, you don't know which one mattered.

“Further” is measured by the milestones. A change that moves the banner from “Got as far as *Looked for the API*” to
“Got as far as *Committed*” helped. One that makes no difference didn't.

## Tool 1: launch settings

The quickest theories to test are about how the LMS hosts the course. The inspector's **Settings** hold them. The
three you'll use most:

| Setting | Where | What it tests |
|---|---|---|
| **API** | LMS | Which API objects the test LMS offers: *as the manifest says*, *both*, *1.2 only*, *2004 only* or *none*. If *both* works where *as the manifest says* didn't, the manifest declares the wrong version. *None* shows what the course does with no LMS at all |
| **Frame depth** | Advanced | How many empty frames sit between the LMS's window and the course (0 to 3). A course that only searches a few parents fails when it's deeper. Many LMSs put content two or three frames deep |
| **In a new window** | Advanced | The LMS opens the course with `window.open`, so the course has to find the API through its opener |

After any change, glance at the **summary chip** beside **Run**: it lists every setting that isn't at its default.
When you've finished testing, put them back. Most settings are remembered even after you quit Package Lab
([chapter 4](04-tour-of-the-window.md#the-toolbar-along-the-top)), so a setting you forget today surprises you tomorrow.

### Try it: `03-not-tracked.zip`

In chapter 7 you found that the manifest declares SCORM 2004 while the scripts use 1.2. Prove it.

1. Open `03-not-tracked.zip` and run it for 10 seconds with the defaults. Note how far it got.
2. Set **API** (in **Settings › LMS**) to **Both**. The summary chip now shows it.
3. Run again for 10 seconds. How far does it get now? What does **Lookups** show?
4. Set **API** back to **As the manifest says**.

You have proved the cause: the content works when the LMS offers the API it expects. You've also shown the two
possible fixes: republish the course for SCORM 2004, or correct the manifest to say 1.2. (Package Lab can make the
second fix for you, in [chapter 13](13-delivering-the-answer.md).)

## Tool 2: changing a file

Sometimes the theory is about the course's own code: “if this line weren't here, it would work”. Package Lab lets
you edit any text file of the package and run the edited copy. The original is never changed.

1. Open **Files** and choose a file.
2. Edit it, then choose **Save as override**. It's marked **changed**.
3. **Run**. The run uses the changed file. Its findings start with “This run used 1 changed file”, and if an earlier
   run of the same item had no changes, a second note says whether the change helped: it got further, got less far,
   or made no difference.
4. **Show changes** shows your edit as a diff. **Revert** undoes one file, **Revert all** undoes them all.

Changes last for the session and go with every run, including experiments, until you revert them. A non-text file
can be swapped with **Replace from a file…**.

### Try it: `02-blank-page.zip`

1. Open `02-blank-page.zip`, open **Files**, and choose `lesson.html`.
2. Correct the capitals of the script path you identified in chapter 7. Choose **Save as override**.
3. Run for 10 seconds. What does the second note at the top of Findings say? Is the page still blank?
4. Read the blank-page finding again. Its first cause has changed. What is it now, and on which line? (Think about
   where in the page the script tag is, and what exists at that moment.)
5. Fix that too, with a second change to `lesson.html`, and run again. What does the page show now? Is the missing
   script still a problem?

This is what most real diagnoses look like. One fault hides the next. Fix the first cause, run again, and read the
first cause again, until the course gets as far as it should.

## Tool 3: pinning a value

Courses often decide how to behave from a variable: `previewMode`, `config.lms`, `isStandalone`. A **pin** makes the
content read the value you choose, from before its first line of code runs, whatever it sets itself.

1. Open the inspector's **Settings › Advanced** (or the **Lookups** view, which has the same list), and find **Pins**.
2. Type the name (`previewMode`, or a dotted name like `config.mode`), the value as JSON (`true`, `false`, `3`,
   `"text"` with quotes), and choose **Add pin**.
3. Choose **Run with these**, or **Run**.

**Lookups** then shows every read of a pinned value, and every time the content *tried to change* it, with the line.
That line is often the code that decides the course's mode, which is exactly what you were looking for.

If the content declares the name with `let` or `const` at the top of a script, a pin can't replace it. The findings
say so and point at the line; change it in **Files** instead.

### Try it: `06-stuck-connecting.zip`

*“It says Connecting to the LMS… for ever, and nothing is recorded.”*

1. Run it for 10 seconds and read the banner. Where did it stop? Is there an *uncaught* error in **Errors**?
2. With no error, the content chose not to start its LMS code. Open `lesson.js` in the code view with your run chosen,
   and look at the coverage near the end of the file. Which line ran, and which didn't? What does that line test?
3. Pin that name to `true`, and run again. How far does it get?
4. Remove the pin. Now prove it a second way: change the line in **Files** so it doesn't test anything, save it as an
   override, and run. Same result?

Check your answer in [the answers](appendix-a-answers.md#06-stuck-connecting).

## Tool 4: answering a request

Content made for a hosting platform often asks that platform for something before it starts: a configuration file, a
user record, a licence. In an LMS nobody answers, so it stops, or falls back to a mode that never talks to the LMS.
An **answer** gives the content a response to a request, so you can see what it does next.

1. In **Network**, find the failed request, or the one to the server's root or another site, and choose **Answer this
   request…**.
2. Check the pattern (a path, a glob with `*`, or a `/regex/`), the status, the content type and the body. A JSON
   path starts with `{}`.
3. Choose **Add and run with these**. Answered requests are marked **answered** in Network.

The list is in **Settings › Advanced › Answers**. The findings name the requests that were answered, and any answer
nothing asked for.

### Try it: `07-works-on-the-platform.zip`

*“It worked in the authoring tool's preview, but not in our LMS.”*

1. Run it for 10 seconds. It looks as though it got quite far. Which milestones did it reach? Now read the first
   finding. Who was the content really talking to?
2. Open **Network**. Which request failed? What kind of path is it?
3. Answer it with the default body `{}`, and run. The banner may say the same milestone as before. Read the findings
   again: which one has gone? Open **Lookups** and **API**: whose `LMSInitialize` was called this time?
4. What does that tell you about the course, and what would you ask its author?

The milestone didn't move, but the course is talking to a different LMS. Milestones measure how far a run got, not
who it got there with. Always read the findings, not only the banner.

Check your answer in [the answers](appendix-a-answers.md#07-works-on-the-platform). [Chapter 12](12-going-deeper.md#server-needs)
shows how Package Lab can work out what a real answer should contain.

## Tool 5: experiments

Changing one setting at a time is the method, but when you don't know which setting to try, Package Lab can try them
all for you. Open **Experiments**, choose a set of variants, and **Run all**. It runs the item with your current
settings, then once with each variant, and fills a table as each finishes: how far it got, API calls, errors, the
verdict, and how it compares with the first run.

| Variants | Tries |
|---|---|
| **api** | The API as the manifest says, both, 1.2, 2004 and none |
| **frames** | Frame depth 0, 1, 2 and 3, and a new window |
| **standard** | Both of those |
| **lms** | Every LMS profile ([chapter 11](11-browsers-devices-and-lmss.md)) |
| **storage** | Storage normal, then blocked |
| **browsers** | Chromium, then WebKit |

If a variant got further than the first run, a finding says so and names the settings that changed. Click a row to
open that run. Each run lasts as long as **Stop after** (10 s if it says *I stop it*).

### Try it

1. Run the **api** experiment on `03-not-tracked.zip`. Which variants get further than the default? Does it agree
   with what you proved by hand?
2. Run the **standard** experiment on `01-works.zip`. Which variants get less far than the default, and why would
   you expect the API ones to? Which frame variants make no difference, and what does that tell you about how far up
   its `scorm.js` searches?

## Keeping track

As soon as you're testing theories, you'll have a dozen runs and forget which was which. Two habits help:

- **Read the run's label.** It names the profile, browser, device, storage mode and so on when they aren't the
  defaults.
- **Keep a log.** One line per run: what you changed, how far it got. It's the evidence you'll hand on in chapter 13.

## Check yourself

1. Why change one thing at a time?
2. What's the difference between a pin and a changed file? When would you use each?
3. A course gets further with **API: Both**. What two fixes does that suggest?
4. You answered a request and the course got further. Is the course now fixed?
5. When would you run an experiment rather than change a setting yourself?

Next: [Macros: playing the learner](09-macros.md).
