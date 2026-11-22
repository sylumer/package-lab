# Appendix B: Quick reference

The handbook on one page: keep it beside you while you work.

## The method

1. Get the symptom in the learner's words: where, when, what they see.
2. Read the static findings, as predictions.
3. Reproduce it: run with the defaults, then move the environment towards the learner's.
4. Locate it: the first missed milestone, the first problem in loading order, the first error in time order.
5. Explain it: “it stops at *X* because *Y*, shown by *Z*”.
6. Prove it: change one thing, and show it gets further.
7. Hand it on: what happens, where it stops, the evidence, the change and its proof.

## The SCORM milestones

| # | Milestone | If it's the first cross, look at |
|---|---|---|
| 1 | Launch page loaded | The manifest's launch path; Network |
| 2 | Scripts loaded | Network; Boot path |
| 3 | Content shown | The blank-page or loading-screen finding; Errors; Boot path |
| 4 | Looked for the API | Errors; the **waiting for** finding; Package's mode switches |
| 5 | Found the API | Lookups; **API: Both**; the **frames** experiment |
| 6 | Initialised | API (the call's result and error code) |
| 7 | Read saved data | API |
| 8 | Wrote data | API; the **waiting for** finding |
| 9 | Committed | API; the profile's **Commit** |
| 10 | Finished | Often nothing: use the course and leave it yourself |

cmi5 runs: launch page loaded, scripts loaded, content shown, fetched the auth token, initialized, completed/passed/
failed, terminated. Tin Can runs: the first three, sent a statement, sent a completion statement.

## Symptom to first move

| Symptom | First move |
|---|---|
| Blank page | Run; the blank-page finding's evidence, in order |
| Stuck loading | Run; the loading-screen finding; Errors |
| Not tracked | Run; Lookups; **API: Both** |
| Doesn't resume | Record a macro; **Test saving** |
| Fails in Safari or on an iPad | **WebKit** + **iPad**; **Storage: Blocked** |
| Fails in one LMS | The **lms** experiment |
| Worked in the authoring tool | Network for `/…` requests; **Server needs** |
| Nothing fails, nothing happens | The **waiting for** finding; **Drill-down** |
| cmi5 or xAPI not recorded | The **xAPI** view: rejected statements and their problems |

## Ways to test a theory

| Tool | Changes | Where |
|---|---|---|
| Launch settings | How the LMS hosts the course | Inspector › Settings |
| Profile | All of that, as a particular LMS | Settings › LMS › Profile |
| Changed file | The course's own code | Files › **Save as override** |
| Pin | A value the course reads | Settings › Advanced › Pins |
| Answer | A server's response | Network › **Answer this request…** |
| Experiment | One setting, every value | Experiments › **Run all** |

## Keyboard shortcuts

| Keys | Does |
|---|---|
| ⌘O | Open a package |
| ⌘R | Run |
| ⌘. | Stop |
| ⌥⌘R | Record a macro |
| ⇧⌘R | Test saving |
| ⌘E | Export corrected package |
| ⌥⌘I | Show or hide the inspector |
| ⌘1 to ⌘5 | Jump to a view group |
| ↑ ↓ | Move through the views |
| ⇧⌘H | Docs |
| ⌘, | Package Lab's settings |

On Windows, Ctrl replaces ⌘ and Alt replaces ⌥.

## The commands

| Command | Does |
|---|---|
| `package-lab doctor` | Checks this computer |
| `package-lab analyze course.zip` | Static findings |
| `package-lab run course.zip --wait 20 --out run.json` | Runs and saves |
| `package-lab report course.zip --run --redact --out report.html` | A report without the course content |
| `package-lab experiment course.zip --preset lms` | Every LMS profile |
| `package-lab discover course.zip` | Server needs |
| `package-lab drill course.zip` | Drill-down |
| `package-lab cycle course.zip --macro macro.json` | Test saving |
| `package-lab fix course.zip --out fixed.zip` | A corrected package |
| `package-lab diff a.zip b.zip` | Compare two packages |
| `package-lab batch folder --run` | Check and run a folder |
| `package-lab macro show macro.json` | Print a macro's steps |
| `package-lab serve` | The web interface |

## SCORM at a glance

| | SCORM 1.2 | SCORM 2004 |
|---|---|---|
| API object | `API` | `API_1484_11` |
| Start, end | `LMSInitialize`, `LMSFinish` | `Initialize`, `Terminate` |
| Bookmark | `cmi.core.lesson_location` | `cmi.location` |
| Resume? | `cmi.core.entry` | `cmi.entry` |
| Left early | `cmi.core.exit` = `suspend` | `cmi.exit` = `suspend` |
| Suspend data limit | 4,096 characters | 64,000 characters |
