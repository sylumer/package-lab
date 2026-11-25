# 15. Thinking like an analyst

**What you'll learn:** the method that ties every chapter together, the habits that keep you honest, the traps that
catch experienced people, how to read authoring-tool and xAPI findings, and a final challenge.

You now know every tool. What makes an expert isn't knowing more buttons. It's knowing which question to ask next,
and not believing an answer until it's proved.

## The method

Every diagnosis, however hard, follows the same loop.

1. **Get the symptom in the learner's words.** Where (which LMS, browser, device), when (at launch, on page 5, on
   return), and what they see. Most wasted hours start with a vague symptom.
2. **Read the files.** Static findings. Note them as predictions.
3. **Reproduce it.** Run with the defaults. If it works, change the environment towards the learner's: profile,
   browser, device, storage. **You can't fix what you can't reproduce.** If you can't reproduce it in Package Lab, say
   so, and record a working copy in the real LMS ([chapter 12](12-going-deeper.md#comparing-with-a-working-copy)).
4. **Locate it.** The first missed milestone. The first problem in loading order. The first error in time order.
5. **Explain it.** Follow the evidence to a cause: findings, then views, then waiting-for, drill-down and tracing.
   Stop when you can say “it stops at *X* because *Y*, shown by *Z*”.
6. **Prove it.** Change one thing (a setting, a file, a pin, an answer) and show the course gets further. If it
   doesn't, your explanation was wrong: go back to step 5.
7. **Hand it on.** What happens, where it stops, the evidence, and the change that fixes it with its proof
   ([chapter 13](13-delivering-the-answer.md#writing-it-up)).

## A map from symptom to first move

| Symptom | First move | Then |
|---|---|---|
| Blank page | Run; read the blank-page finding's evidence in order | Boot path's first *never asked for*; Errors' first error |
| Stuck on loading | Run; read the loading-screen finding | Errors; **waiting for**; Timeline around the stop |
| Not tracked | Run; Lookups | **API: Both**; **frames** experiment; Package's mode switches |
| Doesn't resume | Record a macro; **Test saving** | The first resume finding; API of run 2 |
| Fails in Safari or on an iPad | Run with **WebKit** and **iPad**; **Storage: Blocked** | Errors; reproduce in Chromium and trace |
| Fails in one LMS | **lms** experiment | One profile field at a time |
| Worked in the authoring tool | Run; Network for server-root requests | **Server needs**; answers; ask for an LMS export |
| Nothing fails, nothing happens | **waiting for** finding | **Drill-down**; trace; **Execution** from the bottom |

The [recipes](../recipes.md) are the long form of six of these rows.

## Habits

- **Glance at the summary chip before every run.** A setting left from the last test is the commonest cause of a
  confusing result. So is a macro you forgot to clear, and a pin or an answer left in **Settings › Advanced**. Most settings
  survive quitting the app, so check after a restart too. (Pins, answers and the macro don't.)
- **Name what changed.** One line per run in a log: the change, and how far it got.
- **Start each theory from a clean baseline.** A run with the defaults, nothing changed, to compare against.
- **Give the course a fair chance.** A 10-second run with nobody clicking can't call `LMSFinish`. Use **I stop it**
  and leave the course properly before blaming it for not finishing.
- **Read the findings, not only the banner.** The milestone can stay the same while the cause changes
  ([chapter 8](08-testing-a-theory.md#tool-4-answering-a-request)).
- **Keep the evidence.** Save runs, keep `--out` folders, keep redacted reports. You'll be asked again.

## Traps

**Static findings are predictions.** `05-error-in-the-console.zip` carries a static Problem, “Scripts run before what
they need”. The error does happen, and it doesn't matter: the course starts properly a moment later. Severity says how
bad a problem would be, not that it is. And the reverse: most of the practice packages have no static findings at all,
and every one of them except the three sound ones is broken.

**A finding's Try: is the commonest fix, not this course's fix.** In `13-keeps-looking.zip` the finding suggests trying
both APIs. That's right for most courses that show it, and wrong for that one.

**A folder check can't see run-time faults.** Most of the practice packages pass one, broken or not.

**Package Lab's LMS isn't your LMS.** Profiles are approximations from public documents, and administrators change
settings. A run is a strong hint, never a verdict. Confirm every fix where the learners are.

**Absence of evidence.** A WebKit run has no caught errors and no coverage; a trace leaves out `eval` and HTML
`onclick` handlers; drill-down can't watch a function's local variables; server needs can't see inside a worker. When
the evidence is silent, check whether the tool could have seen it.

**Changing two things.** If it works after two changes, you don't know which one mattered, and you may tell an author
to change something that didn't need changing.

## Authoring tools

Package Lab knows eleven authoring tools and wrappers: Xyleme, Articulate Storyline and Rise, Adobe Captivate, iSpring, Lectora,
Adapt, dominKnow, Evolve, the SCORM Driver and the pipwerks wrapper. When it recognises one, it adds findings that start
with the tool's name (“Adapt: …”), and each says how sure it is:

- **Matches a known pattern**: from forum reports and the like. Information, worth checking.
- **Confirmed in the package's files**: Package Lab read the setting itself.
- **Confirmed in this run**: the recording shows it.

A package that doesn't name its tool is treated like any other, unless you set **Authoring tool** in **Settings ›
Advanced** (or `--tool` on the command line). The [authoring tool notes](../packs/README.md) say what Package Lab knows
about each, and where it comes from. Read the one for the tools your organisation uses: knowing how a tool's exports
usually fail is half the diagnosis.

## cmi5 and xAPI courses

A cmi5 or Tin Can package opens like any other. What changes:

- **There's no SCORM API.** The test LMS gives the course a learning record store instead, and puts its address in the
  launch URL, as an LMS does. **API**, **Resume last run's data** and **Test saving** don't apply.
- **The milestones are different.** For cmi5: launch page loaded, scripts loaded, content shown, fetched the auth
  token, initialized, completed/passed/failed, terminated. For Tin Can: the first three, then sent a statement and sent
  a completion statement.
- **The xAPI view** replaces the API view: every statement in order, who sent it, whether the LRS stored or refused
  it, and its validation problems, each with its place in the statement (`result.score.scaled`); the state and profile
  documents; and every request to the LRS.

The LRS checks every statement against xAPI 1.0.3, and the cmi5 rules. A statement that breaks a MUST is refused with
status 400, as the specification requires. Real LRSs vary: some are stricter, some store what they should refuse, so
a statement your LRS accepted isn't proof it's valid. Most cmi5 faults are about order and context: “completed” before “initialized”,
a missing session id, the auth token fetched twice. The [findings](../findings.md#from-a-cmi5-or-tin-can-run-the-lrs)
list them all. Profiles, frame depth, device sizes, storage and WebKit all still apply.

**cmi5 in one paragraph.** A cmi5 course is made of **AUs** (assignable units, cmi5's word for a launchable item).
The LMS launches an AU with its LRS address, an actor, a **registration** (the learner's enrolment) and a one-use
URL to fetch an **auth token**. The LMS sends a “launched” statement itself. The AU then fetches the token (once only),
sends “initialized”, then “completed”, “passed” or “failed” as they happen, and “terminated” last. Every statement in
that **session** carries the same session id in its `context`. The course's `moveOn` rule, in the package's
`cmi5.xml`, says which of completed and passed the LMS needs before it counts the AU as done.

### Try it: `16-cmi5-never-passes.zip`

*“The LMS shows the lesson completed, but never passed.”*

1. Open it. What kind of package does the window say it is? What does **Package** list as the items?
2. Run it for 10 seconds. Read the banner. Did it reach every milestone?
3. Now read the findings. How many errors are there, when every milestone has a tick?
4. Open **xAPI**. Which statement was rejected, and what is the problem with it, at which place in the statement?
5. What else is wrong with the order of the statements, and what would a cmi5 LMS do about it?

### Try it: `17-tincan-answer-missing.zip`

*“The completion arrives, but the quiz answer never shows in our reports.”*

1. Run it for 10 seconds. Which milestones did it reach?
2. In **xAPI**, find the statement that was refused. What value broke which rule?
3. What happens to a refused statement in a real LRS, and so in the learner's record?

Check your answers in [the answers](appendix-a-answers.md#16-cmi5-never-passes).

The lesson of both: **milestones measure how far a run got, not whether everything it sent was accepted.** For xAPI,
always read the xAPI view.

## The final challenge

You've diagnosed every practice package one chapter at a time, knowing which tools each chapter was about. Real courses don't
come with a chapter. Three ways to finish:

1. **Cold diagnosis.** Ask someone to rename the nineteen practice packages to `a.zip` to `s.zip` without telling you
   which is which. Diagnose them all with the method above, then check against [the answers](appendix-a-answers.md).
2. **Make a fault.** Open `01-works.zip`, change one file in **Files** to break it in a way this guide hasn't shown
   (a typo in an element name in `lesson.js`, `cmi.core.lesson_staus`, say; or `LMSCommit` removed), export the package,
   and give it to a colleague to diagnose. Then do the same with theirs. Before you hand it over, check that your fault
   is findable: run it yourself, and note which milestone, finding or Test saving result shows it. Mark your
   colleague's diagnosis against the four parts of a report: the symptom, where it stops, the evidence, and a change
   that's proved to fix it.
3. **A real course.** Take a course that has given your organisation trouble. Follow the method from step 1. Write the
   four-part report. If you can't reproduce it, write that down too, with what you tried: that's evidence as well.

## Beyond this guide

Some things an expert meets that this guide only touches:

- **Interactions and scores.** The sample course records each quiz answer as `cmi.interactions.n.*`, and compares its
  score with the manifest's mastery score (`cmi.student_data.mastery_score`). It also reads `cmi.launch_data`, from the
  manifest's `adlcp:datafromlms`. An LMS's reports of answers come from these. Read them in the **API** view.
- **SCORM 2004's two statuses.** 2004 splits 1.2's `lesson_status` into `cmi.completion_status` (completed or not)
  and `cmi.success_status` (passed or failed), and adds `cmi.score.scaled` (-1 to 1). A course that sets one and not
  the other shows up oddly in LMS reports.
- **Sequencing.** SCORM 2004 can carry rules for the order of SCOs and what unlocks what. Package Lab launches one item
  at a time and doesn't play sequencing rules: test those in the LMS.
- **Several SCOs, and how the LMS reports them.** How an LMS rolls several SCOs' statuses up into one course result,
  and how it treats `cmi.core.lesson_mode` and `credit`, are the LMS's business. Package Lab shows what each SCO
  sends; what the LMS's reports make of it, test in the LMS.
- **Authoring tools.** The [authoring tool notes](../packs/README.md), one page per tool.
- **The Windows build.** `docs/windows.md` in the source code covers building and running it.

## Where to go from here

- The [recipes](../recipes.md): step by step for the commonest problems.
- [Findings](../findings.md): every finding, what it means, what to do.
- The [Help](../help.md): every view, button and setting.
- The [command line reference](../cli.md): every command and flag.

## Check yourself

1. State the seven steps of the method from memory.
2. You can't reproduce a learner's problem in Package Lab. What do you do?
3. Name three things you should check before every run.
4. What does “Confirmed in this run” on an authoring-tool finding mean, compared with “Matches a known pattern”?
5. A cmi5 course's LRS refuses a statement with status 400. Where do you look, and what will it tell you?
