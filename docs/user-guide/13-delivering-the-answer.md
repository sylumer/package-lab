# 13. Delivering the answer

**What you'll learn:** how to turn a diagnosis into something useful to someone else: a corrected package, a report
that leaves the course content out, a saved run, a comparison of two exports, and a check of a whole folder.

A diagnosis that stays in your head helps nobody. The author needs to know what to change in their tool, the LMS
administrator what to change in their settings, the vendor what their product does wrong. Each needs evidence they can
check, without your having to send them a course they may not be allowed to see.

## A corrected package

Some problems have a mechanical fix: one Package Lab can make without guessing what the author meant.
**Export corrected package…** (in **Actions**, or **File › Export Corrected Package…**, ⌘E) shows a checklist of the
fixes that apply, all ticked. Untick any you don't want and choose **Export…**.

| Fix, as the checklist names it | What it does |
|---|---|
| Rename the manifest to imsmanifest.xml | `Imsmanifest.xml` becomes `imsmanifest.xml` |
| Move the package's files to the top of the ZIP | For a ZIP made from the folder above the package |
| Remove manifest file entries for files that aren't in the package | Takes `<file>` lines for absent files out of the manifest |
| Make the manifest's SCORM version match the API the scripts use | Sets the manifest's version and namespaces |
| Make references match the capitals of the files | Changes references to match the file, or renames the file when every reference spells it the same way |
| Load scripts, styles and frames over https | Changes `http://` scripts, styles and frames to `https://` |
| Remove Xyleme's server-side player setting | Removes the `PLAYER_TYPE = 'Server-side'` line that makes a Xyleme export wait for Xyleme's server |

The export also includes **every file you changed in Files**. So a fix you proved with an override in chapter 8 can be
exported as a package.

Package Lab never touches the original. The new ZIP has a `PACKAGE-LAB-CHANGES.txt` listing every change, and anything
it decided not to do. The status line says how many findings the changes cleared: it checks the new package again,
from its files.

**A corrected package is a test, not a release.** Run it, then try it in the real LMS. And send the author the list of
changes, so the next export from their tool doesn't bring the problem back.

### Try it

1. Open `03-not-tracked.zip` and export a corrected package. Which fix is offered? Open the result and run it. Does it
   track now?
2. Open `02-blank-page.zip` and export. Read `PACKAGE-LAB-CHANGES.txt`. The capitals fix renamed a *file* rather than
   the reference. Why? Is the package now fixed? What's left, and why can't Package Lab fix it?
3. Open `04-loading-forever.zip` and try to export. What does Package Lab say? Fix it yourself: correct
   `data/config.json` in **Files**, save it as an override, run to prove it, and export again.

## A report without the course content

Courses are often confidential, licensed, or full of learners' answers. A redacted report shows what went wrong without
any of that.

1. Select the run that shows the problem.
2. On **Findings**, tick **Take the course content out**.
3. Choose **Save report…**.

What goes: the text the course shows, console messages, stored values (answers, names, bookmarks), suspend data,
request and response bodies, typed text and macros, changed file contents, the scripts' text, xAPI statement contents,
query values, local file paths and the item's title.

What stays: the verdict, the findings (worked out again from what's left), milestones, the timeline, API calls with
their element names, numbers and times, function and property names, the package's name and file paths, and the first
part of each error message.

A banner at the top of the report says what was taken out. **Read the report before you send it**: a browser's error
message can still carry words the course wrote. On the command line, `report --redact --redact-names --key-out`
also replaces the file names with hashes, and gives you the key to match them back.

## Saved runs

Every run is saved as JSON in the data folder's `runs/` folder. **File › Open Saved Run…** (or **Open saved…** under **Runs**)
brings one back, to read its views or to compare it with another run. Opening it doesn't change your settings or
package.

A saved run also records the launch options it used: settings, changed files, pins, answers and macro. The command line
can repeat it exactly:

```bash
package-lab run course.zip --options-from run.json
```

The run doesn't contain the package itself. To hand a diagnosis to a colleague who has Package Lab, send them the
saved run *and* the same ZIP. They can read your run in the app, and repeat it, or change one thing, with
`--options-from` ([chapter 14](14-working-at-scale.md#options-files-a-diagnosis-you-can-repeat)). Saved runs hold the
course's scripts and stored data, so treat them like the course.

## Comparing two packages

Two exports of the same course, one that works and one that doesn't? **Compare packages…** (in **Actions**) asks for a
second ZIP and compares it with the open one, from the files, without running either. The **Package diff** view shows:

- **Files**: added, removed and changed, each text file with a line diff;
- **Manifest**: what differs, field by field;
- **Loading path**: files only one of them loads, and files whose state changed (*in package* in one, *missing* in the
  other);
- **New findings and findings gone.** Start with the new ones.

### Try it

Open `01-works.zip`, choose **Compare packages…**, and pick `02-blank-page.zip`. Which files changed? What do the new
findings say? Could you have diagnosed `02-blank-page.zip` from this view alone?

## Checking a folder

A course often arrives as a folder of exports, one per language or per LMS. **Check a folder…** (in **Actions**) checks
every ZIP in a folder, from the files, and shows one row per package in **Folder check**: its verdict, SCORM version,
tool, counts of errors and warnings, and the worst finding. Click a row to open that package.

### Try it

Check your practice folder. How many packages does it say are **OK**? How many of those have you found faults in?

This is the most important lesson in this chapter. A folder check is fast and catches the problems the files can show:
wrong names, missing files, versions, capitals, server paths. It **cannot** see a course that waits for a message, keeps
state in blocked storage, ignores its bookmark or fails only in Safari. Most of your practice packages pass a
folder check, and of those only the three with nothing wrong in the course (01, 14 and 15) work. Use a folder check to triage, then run the ones that matter.

## Writing it up

Whatever you send, the reader needs the same four things, and Package Lab's findings are written in this order for
that reason:

1. **What happens**: the symptom, in the learner's terms.
2. **Where it stops**: the milestone, and the finding.
3. **The evidence**: the file and line, the request, the API call. Attach the redacted report.
4. **What to change, and the proof that it works**: “With `startOK` pinned to `true`, the course tracks normally
   (run attached).”

The last part is what makes the report land. “I think it's the manifest” starts an argument. “Changing the manifest's
version to 1.2 makes it track, here's the run” ends one.

## Check yourself

1. Which problems can a corrected package fix, and which can't it?
2. Why must you still test a corrected package in the real LMS?
3. Name three things a redacted report removes, and three it keeps.
4. A folder check says a package is OK. What does that tell you, and what doesn't it?
5. Write a four-part report for any one practice package you've diagnosed.

Next: [Working at scale](14-working-at-scale.md).
