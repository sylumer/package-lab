# 7. Your first diagnoses

**What you'll learn:** a routine for any broken package, and how to use it on four practice packages. By the end you
should be able to say, for each one, what is wrong, how you know, and what would fix it.

## The first-look routine

Do this with every package, real or practice, before anything clever.

1. **Open it and read the static findings.** Errors here (a misnamed manifest, a missing file, wrong capitals, a
   version mismatch) often explain everything downstream. Note them, but don't trust them blindly yet.
2. **Run it with the default settings for 10 or 20 seconds**: everything as it comes, except **Stop after** set to
   10 s or 20 s (its own default is *I stop it*). Don't touch the course. Throughout this guide, “run it for 10
   seconds” means this.
3. **Read the banner sentence.** Where did it stop? That milestone tells you which kind of problem you have (see
   the table below).
4. **Read the first finding that explains the stop**, and follow its evidence into the views ([chapter 6](06-reading-the-evidence.md#from-a-finding-to-the-evidence)).
5. **Write down your diagnosis in one sentence**: “It stops at *X* because *Y*, shown by *Z*.” If you can't fill in
   *Z*, you haven't finished.

Where it stopped, and where to look:

| Stopped before | The kind of problem | Look in |
|---|---|---|
| Launch page loaded | The manifest's launch path is wrong, or that file is missing | Package, Network |
| Scripts loaded | A file didn't load | Network, Boot path |
| Content shown | The page never drew anything | The blank-page or loading-screen finding, Errors, Boot path |
| Looked for the API | The LMS code never ran | Errors, Lookups, Package (mode switches) |
| Found the API | It looked in the wrong place, or for the wrong name | Lookups |
| Initialised | It found the LMS, but the first call failed | API (the call's result and error code) |
| Read saved data, Wrote data or Committed | The conversation stopped part-way | API |
| Finished | Often nothing: nobody left the course | Use it yourself, with **I stop it** |

The [recipes](../recipes.md) are longer versions of this routine for six of the commonest symptoms. Use them on real
courses.

## Exercise 1: `02-blank-page.zip`

*“The course is just a white page.”*

1. Open it. How many static findings are there, and of what severity?
2. Run it for 10 seconds. What does the banner say? Which milestone is the first cross?
3. Find the finding **The content shows a blank page**. Its evidence is a list, *in loading order*, of what went wrong
   on the way. What is first?
4. Open **Boot path**. Find the two scripts the launch page loads after `scorm.js`. What does **In the files** say for
   each? What does **In the run** say?
5. One of the problems is a file that is truly missing. The other is a file that *is* in the package. What's the
   difference, and which of the two matters more for this course? (Hint: look at what the launch page contains in
   **Files**, and the note **The launch page has no content of its own**.)

Write your diagnosis, then check it in [the answers](appendix-a-answers.md#02-blank-page).

## Exercise 2: `03-not-tracked.zip`

*“I finished it, but the LMS says I never started.”*

1. Open it. Read the static finding. What does it claim?
2. Run it for 10 seconds. The course shows its pages, but read its first line of text in the course window (or in
   the evidence for **Content shown**). What does it say?
3. Which milestone is the first cross?
4. Open **Lookups**. What name did the content look for? What does the finding say the run *offered*?
5. The finding's **Try:** suggests a test with the **API** setting set to **Both**. You'll learn to run it in [chapter 8](08-testing-a-theory.md); for now, write down what
   you expect it to show.

Check your diagnosis in [the answers](appendix-a-answers.md#03-not-tracked).

## Exercise 3: `04-loading-forever.zip`

*“It says Loading and never gets past it.”*

1. Open it and read the static findings. There's an error about a data file. Open the file in **Files** and look at
   it. Can you see what's wrong? (Look closely at the end.)
2. Run it for 10 seconds. The banner names a finding about a loading screen. Which element did Package Lab recognise
   as the loading indicator?
3. Open **Errors**. What is the first error, and which file and line does it name? Click through to the code.
4. There's a warning: **Code that loads the next part of the content never ran**. Which file was never loaded? Look at
   the code that would have loaded it. Why didn't it run?
5. Open **Timeline**. Where does the error sit relative to the request for the data file?

Check your diagnosis in [the answers](appendix-a-answers.md#04-loading-forever).

## Exercise 4: `05-error-in-the-console.zip`

*“The browser console shows an error. Does it matter?”*

This one is different. Somebody saw an error and wants to know if it's the cause of their problems.

1. Open it. The static finding is a **Problem**. What does it say will happen?
2. Run it for 10 seconds. How far did the run get? Compare it with a 10-second run of `01-works.zip`.
3. Open **Errors**. The error is real. Where is it?
4. Look at the API view and the stored values. Did the course track?
5. So: is the error a fault, and does it matter? What would you tell the person who asked?

Check your answer in [the answers](appendix-a-answers.md#05-error-in-the-console).

The lesson here is the most useful one in this chapter. **A static finding is a prediction. The run is the test of
it.** Package Lab's static checks are cautious: they warn about what *can* go wrong, and sometimes it doesn't. Its
severity is how bad the problem would be if it happened, not proof that it did. Always confirm with a run before you
tell anyone their course is broken, and always say *how much* it matters.

## What you've learnt

- Every diagnosis starts with the same routine: static findings, a short run, the first missed milestone.
- The milestone tells you which views to open.
- The first problem in loading order, or the first error in time order, is usually the cause. Later ones follow from it.
- Static findings predict; runs confirm.

## Check yourself

1. A run's first cross is at **Looked for the API**. Which views do you open first?
2. Why does the blank-page finding list its evidence in loading order?
3. A package has a static Problem, but a run reaches every milestone you'd expect. What do you report?
4. Say the one-sentence diagnosis for any one of the four exercises, with its evidence.

Next: [Testing a theory](08-testing-a-theory.md).
