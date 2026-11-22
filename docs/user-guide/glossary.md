# Glossary

**Answer.** A response you give to a request the content makes, in place of the server's. See
[chapter 8](08-testing-a-theory.md#tool-4-answering-a-request).

**API.** The JavaScript object an LMS puts on one of its windows for a SCORM course to talk to: `window.API` in SCORM
1.2, `window.API_1484_11` in SCORM 2004. See [chapter 2](02-elearning-basics.md#the-lms-and-the-api).

**Asset.** An item that doesn't track the learner, such as a glossary page.

**AU (assignable unit).** cmi5's name for a launchable part of a course.

**Boot path.** How the launch page should load, worked out from the files: every file in order, with what loads it and
whether it's there.

**Caught error.** An error the content handled itself. Easy to miss, because the course carries on, often in a mode
that doesn't talk to the LMS.

**cmi5.** A set of rules on top of xAPI for launching courses from an LMS and the statements they must send. A cmi5
package has a `cmi5.xml`.

**Commit.** `LMSCommit` or `Commit`: asks the LMS to save what the course has written so far.

**Content origin.** Whether the LMS serves course files from its own domain or another one. See **Origin**.

**Coordinates bar.** The line under the Live view's picture: the pointer's position in pixels and as fractions of the
window, and the element under it.

**Coverage.** Which lines of a script ran in a run. Green ran, red didn't, amber partly.

**Data model.** The named values a SCORM course reads and writes, such as `cmi.core.lesson_location`.

**Drill-down.** A Package Lab tool that explains why a run stopped as a chain of decisions, each the reason for the one
before.

**Entry.** `cmi.core.entry` or `cmi.entry`: `ab-initio` on a first launch, `resume` when the LMS offers to resume.

**Execution view.** The traced events of a run: functions called and decisions made, with their values.

**Exit.** `cmi.core.exit` or `cmi.exit`: how the learner left. `suspend` means “coming back”, and many LMSs offer a resume
only after it.

**Experiment.** Several runs of one item with one setting varied each time, compared in a table.

**Finding.** Package Lab's conclusion about a package or a run: a severity, a title, an explanation, evidence and what
to try.

**Frame.** A page shown inside another page. LMSs usually show courses in frames, sometimes several deep.

**Frame depth.** How many frames sit between the LMS's window and the course.

**Help.** Package Lab's reference: what each view, button and setting does, in the inspector's Help panel. For while you
work, where this User Guide is for learning.

**Item.** An entry in a package's structure that an LMS can launch.

**Launch page.** The page an item opens first: the resource's `href` in the manifest.

**Live view.** The course window shown inside Package Lab (or the web interface), which you can click and type into.

**LMS (learning management system).** The system that gives courses to learners and records their progress.

**Lookup.** A time the content read `window.API` or `window.API_1484_11`, recorded with whether it found one.

**LRS (learning record store).** Where xAPI statements are sent and kept.

**Macro.** A list of clicks, keys, typed text and waits that Package Lab plays into a course during a run. See
[chapter 9](09-macros.md).

**Macro file.** A macro saved as JSON, with its events and the window size it was recorded at. See
[chapter 9](09-macros.md#macro-files).

**Manifest.** `imsmanifest.xml`: a SCORM package's description of itself, its items and its files.

**Milestone.** One of the steps a healthy run passes, from **Launch page loaded** to **Finished**. The first one missed
is where to start looking.

**Mode switch.** A name in a course's code, such as `previewMode`, that decides whether it behaves as if it's in an
LMS.

**Origin.** The scheme, host and port a page comes from, such as `https://lms.example.com`. Pages from different
origins can't reach into each other's windows.

**Override (changed file).** Your edited copy of a file of the package, used in runs in place of the original.

**Package.** The ZIP file a course is delivered in.

**Pin.** A value Package Lab forces the content to read, from before its own code runs.

**Profile.** An imitation of the way a particular LMS hosts courses: origin, frames, sandbox, launch, API placement,
headers, commits and limits.

**Redacted report.** An HTML report with the course content taken out, safe to send to a vendor.

**Resume.** Starting a course again from where the learner left, using the bookmark and suspend data the LMS kept.

**Run.** One launch of an item, from **Run** to **Stop**, recorded and analysed.

**Run finding.** A finding from what happened in a run.

**Sandbox.** An attribute on a frame that limits what its page can do.

**SCO (sharable content object).** An item that tracks the learner through the SCORM API.

**SCORM.** The most widely used standard for packaging e-learning and tracking it in an LMS, in two versions: 1.2 and
2004.

**Server needs.** A Package Lab tool that works out what the content wants from its server, and a stand-in response.

**Statement.** An xAPI record of something a learner did: an actor, a verb and an object, such as “Learner, Test
completed Fire Safety”.

**Static finding.** A finding from the package's files alone, before anything runs. A prediction, to be confirmed by a
run.

**Summary chip.** The label beside **Run** listing every setting that isn't at its default.

**Suspend data.** `cmi.suspend_data`: the course's own saved state. Limited to 4,096 characters in SCORM 1.2 and 64,000
in 2004.

**Test saving.** Package Lab's save-and-resume test: a run that leaves the way a learner does, then a run that resumes.

**Tin Can.** The original name of xAPI. A Tin Can package has a `tincan.xml`.

**Tracing.** Recording every function the content's scripts ran and every decision they made, with their values.

**User Guide.** This book: Package Lab taught in chapters with exercises, in a window of its own (**Help › User Guide**).

**Wait.** A macro step that holds the macro until some text appears, a milestone is reached, the network is quiet, or
a time has passed.

**WebKit.** Safari's browser engine, used by every browser on iPhone and iPad.

**Working copy.** A recording of the course where it works (its authoring tool's preview, another LMS), to compare
with a failing run.

**xAPI.** The Experience API: courses send statements to an LRS over the web instead of calling an API object in the
page.
