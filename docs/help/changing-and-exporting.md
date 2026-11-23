# Changing and exporting

Test a fix before touching the real course, then hand the result on: as a corrected package, as a report, or as a saved run.

## Changing files and running again

To test a fix, change the file here and run it.

1. Open the **Files** view. Click a file in the tree (the filter box narrows it).
2. Edit the text, then choose **Save as override**. The file is marked **changed**, and the view shows how many files are changed. Nothing is written to the package or to disk: the changes live in this session.
3. Choose **Run**. The run uses the changed files. At the top of its Findings is “This run used *N* changed files”, and if an earlier run of the same item used no changes, a second note says whether the change helped (it got further, got less far, or made no difference).
4. Under **Changed files** you can see each change as a line diff (**Show changes**), **Revert** one file, or **Revert all**.

A file that isn't text (an image, say) can't be edited, but **Replace from a file…** swaps in a file from your computer. Saving a file back to exactly what it was removes the override. Changes are kept for the session; they go in a saved run's options, so opening that run repeats them. Changed files are used by experiments too.

Package Lab works out the boot path again for the changed files, but the checks on the manifest and scripts under **Package** still describe the original package.

## Pins and answers

Two more ways to test a theory without touching the course. Both happen before the content's own code could notice.

**Pin a value.** Many courses decide how to behave from a name, such as `previewMode` or `config.mode`. A pin makes the content read the value you choose, whatever it sets itself.

1. Under **Settings › Advanced**, in **Pins** (the **Lookups** view has the same list), type the name, the value as JSON (`false`, `3`, `"text"`, `{"a":1}`; text needs quotes), and choose **Add pin**. **Edit** and **Remove** change the list.
2. Choose **Run with these**, or **Run**. Pins go with every launch until you remove them.

Names can be dotted (`config.mode`): the pin applies to that part of the object once the content creates it. `navigator.userAgent` can be pinned too; other `navigator` names and `location` can't. For extra query parameters on the launch address, use **Launch parameters** under Advanced. **In** chooses whether the pin applies in the content's frames only (the default) or in every frame.

The Lookups view then shows each read of a pinned value, and each time the content tried to change it. If it tried, the findings say where: that is often the code that sets its mode. If a script declares the name with `let` or `const` at its top level, a pin can't replace it; the findings say so and point at the line. Change that line in the Files view instead.

**Answer a request.** When the content asks its platform for something (a configuration file, a user record) and gets nothing, it may fall back to a mode that never talks to an LMS. Give it an answer and see what it does.

1. In the **Network** view, choose **Answer this request…** on a failed request, or on one for the server's root or another site.
2. Check the pattern, status, content type and body. The body starts as `{}` for paths that look like JSON. The pattern is a path such as `/api/player/config`, a glob (`*` and `?`), or a `/regex/`.
3. Choose **Add and run with these**. Answered requests show as **answered** in the Network view.

The list of answers is under **Settings › Advanced**, in **Answers**. The findings list the requests that were answered, and any answer nothing asked for. An answer applies to every request that matches, in every frame. For a request the content made to find its server settings, [Server needs](experiments-and-servers.md#server-needs) can write the answer for you.

Pins and answers are saved in a run's options, so a saved run repeats them.

## Exporting a corrected package

**Export corrected package…** (in the **Actions** list, or **File › Export Corrected Package…**, ⌘E) first shows a checklist of the fixes that apply to this package, all ticked: untick any you don't want, then choose **Export…**. It saves a new `.zip` with two kinds of change:

- the files you changed in the **Files** view (see above), and
- the mechanical fixes below, for the problems Package Lab can correct without guessing.

| Fix | What it does |
|---|---|
| Rename the manifest | `Imsmanifest.xml` becomes `imsmanifest.xml` |
| Move the files to the top of the ZIP | For a ZIP made from the folder above the package |
| Remove missing file entries | Takes `<file>` lines for files that aren't there out of the manifest |
| Match the SCORM version | Sets the manifest's version and namespaces to the API the scripts use |
| Match capitals | Changes references to match the file, or renames the file when everything spells it the same way |
| Use https | Changes `http://` scripts, styles and frames to `https://` |

If a fix can't do its job safely (a file that isn't plain UTF-8 text, a rename that would overwrite a file), it leaves that alone and says so under **Not done** in `PACKAGE-LAB-CHANGES.txt`. The original package is not changed. You choose where to save the new one (in the web interface, the browser downloads it). `PACKAGE-LAB-CHANGES.txt` lists every change. The status line says how many findings the changes cleared: Package Lab checks the new package again, without running it. If nothing needs changing, it says so and writes nothing.

A fix is a mechanical guess at what you meant. Run the new package and check it in your LMS before you rely on it. Findings that need a decision (a missing script, a server the content needs) are left alone; the findings that have a fix say so in [Findings](../findings.md).

## Sending a report without the course content

A report can show a vendor what went wrong without the course itself. Select a run, tick **Take the course content out** on the Findings view, and choose **Save report…**. The web interface does the same and downloads the file.

What goes: the text the pages show, console messages, the values the course stored (its answers, names and bookmarks), suspend data, request and response bodies and headers, anything you typed or recorded as a macro, changed file contents, the scripts' text and code snippets, the text of xAPI statements (names, activity ids, responses, extension values) and the state and profile documents, query values and fragments in addresses, local file paths, and the item's title.

What stays: the verdict, the findings (worked out again from what is left), the milestones, the timeline, the API calls with their element names and SCORM's own words, the xAPI statements' structure (the standard verbs and categories, ids, times, scores and the problems found in them), `completed`, `passed` and `suspend`, numbers and times, function and property names, the package's name and file paths, and the first part of each error the browser reported (up to its first colon, or the whole message for a known shape such as “x is not defined”; quoted strings always go). Learner ids, names, locations and comments are hidden even when they are numbers. Addresses of other sites keep their host and path, with id-like parts hidden. A banner at the top says what was taken out and what was kept.

Check the report before you send it: a message from the browser can still hold words the course wrote outside quotes.

## Saved runs

Every run is saved as JSON in `~/Library/Application Support/Package Lab/runs/`. **Open saved…** (in the **Runs** list) brings runs back, for reading or comparing. Runs saved by the command line open the same way. Saved runs hold the content's script sources and the data it stored, so treat them like the package.

## Comparing two packages

Two exports of the same course, one that works and one that doesn't? **Compare packages…** (in **Actions**) asks for a second `.zip` and compares it with the open one. The first is **A**, the second **B**. The result appears in the **Package diff** view. It is worked out from the files alone, so nothing runs. It shows:

- **Files:** what B added, what only A has, and what changed, with sizes. Each changed text file (under 1 MB) has a line diff you can open. Binary files and very large ones are listed without one.
- **Manifest:** what differs, field by field: the SCORM version, resources, items, launch paths and parameters.
- **Loading path:** the files the launch page loads that only one package has, and files whose state changed (for example “in package” in A, “missing” in B).
- **New findings and findings gone:** the findings only B has, and the ones only A has. Start with the new ones.

Minified files are compared as they are, so a changed minified script shows as one long changed line.

## Checking a folder of packages

A course often comes as a folder of exports. **Check a folder…** (in **Actions**) asks for a folder and checks every `.zip` in it, from the files alone, so nothing runs. The result appears in the **Folder check** view, one row per package:

- **Verdict:** OK, Warning or Error, the worst finding as it shows in Findings. **Failed** means the file couldn't be opened (it isn't a ZIP, say). It stays in the table, with the reason, and the other packages are still checked.
- **SCORM**, **Tool**, the number of **Errors** and **Warnings**, and the title of the worst finding.

Click a row to open that package in the window, as if you had opened it. Only the packages of the last check can be opened this way.

## On the command line

[fix](../cli.md#fix) writes the corrected package, [diff](../cli.md#diff) compares two packages (with `--run`, how far each got), [batch](../cli.md#batch) checks a folder and writes a CSV and an HTML report, and [report](../cli.md#report) makes the redacted report with `--redact`, and `--redact-names --key-out` replaces the file names with hashes. Keep the key file yourself: it is the only way to match a hash back to its file.
