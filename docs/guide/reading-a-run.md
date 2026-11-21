# Reading a run

A run is one launch of an item, from **Run** to **Stop**. When it ends, Package Lab analyses it, saves it and selects it. The [views](views.md) are listed in the sidebar; this page explains the findings, the milestones and how to find the cause.

## Findings

Findings list problems, worst first:

- **Problem** (error) means this will stop it working;
- **Warning** means it may stop it working, or has a side effect worth knowing about;
- **Note** (info) is context.

Each card shows its icon and that word, so colour is never the only sign. Each finding has an explanation, the evidence (file and line, or what happened) and **Try:** with what to do. [Findings](../findings.md) explains every one. **What this means** opens that finding's row there, in the docs panel.

At the top of Findings is a banner with an icon and one of the three words. Its sentence says how far the run got: “Got as far as “…”, but didn’t reach “…”.” If every step was reached, it says “Ran through” instead. The banner's word is the worst finding's. Under it are the milestones, then the findings, worst first.

## Milestones

Every package run is placed on the path a SCORM course should follow. Each step has a tick if the run reached it and a cross if not. Hover over a step to see what showed it.

1. **Launch page loaded**: the launch page came back with a successful status (2xx, or a redirect).
2. **Scripts loaded**: every script the launch page names was requested, and none failed.
3. **Content shown**: some frame showed 20 characters of text or more, or an image or other media.
4. **Looked for the API**: the content searched for the SCORM API.
5. **Found the API**: it found one.
6. **Initialised**: `LMSInitialize` or `Initialize` returned true.
7. **Read saved data**: it read the entry, location or suspend data.
8. **Wrote data**: it set the location, suspend data, status, score or completion.
9. **Committed**: a commit returned true.
10. **Finished**: `LMSFinish` or `Terminate` returned true.

The first finding says it in words: “Got as far as: …. Didn’t reach: ….” The first step with a cross is where to start looking. A timed run usually stops before the learner finishes, so a cross at **Committed** or **Finished** is often expected: use **Stop** after using the course to see them. A cmi5 or Tin Can run has its own list, in [cmi5 and Tin Can packages](other-formats.md#cmi5-and-tin-can-packages).

## The findings that matter most

- **The content shows a blank page** or **is stuck on a loading screen**: what went wrong while it loaded, in order. Its evidence covers files not found, requests to the server outside the package, the first errors (earliest first), things the browser refused to load or run, requests still waiting at the end, problems from the files, and a page that hid itself and never showed itself again. Fix the first one; later ones often follow from it.
- **Loading stopped part way through …**, or **Code that loads the next part never ran**: files the content was meant to load but never asked for. The first one is where the content stopped or went another way.
- **The content never looked for the SCORM API** or **looked for API and found nothing**: why there are no API calls.
- **The content set its own window.API**: a preview or offline shim that talks to itself instead of the LMS.
- **Progress findings**: failed API calls, no `LMSFinish` or `Terminate`, no commit, suspend data too long, exit never set.
- **The content was waiting for: …**: see [Why it stalled](experiments-and-servers.md#why-it-stalled).

**Record caught errors** (under **Settings › Recording**) pauses on every exception the content throws, records it and carries on. This matters because content often catches its own LMS errors and fails silently. Turn it off if a course throws so many that it slows down.

## Boot path

**Boot path** is how the selected item's launch page should load, worked out from the files. It has three parts.

- **Loading path:** every page, script, stylesheet, frame and data file, in loading order, indented under what loads it. Each row shows:
  - **How** it is loaded: `tag` (a `<script>`, `<link>` or `<iframe>` on the page), `request` (`fetch` or XHR), `src` (a script that sets `.src`), `import`, `navigate`, `require.js data-main`, or `literal` (a path that only appears as text in a script);
  - **From:** the file and line that loads it;
  - **In the files:** in package, missing, wrong capitals, server path, outside package, author's computer, or other site. A missing file whose name exists elsewhere in the package means the path is wrong, not the file.
- **Script order:** the order the scripts on each page actually run in. Normal scripts run first, in page order, then `defer` and module scripts, then `async` scripts whenever they arrive. A script that uses something before the script defining it has run is reported as an error.
- **Paths built at run time:** code that assembles paths (such as `'lib/' + name + '.js'`). These can't be checked from the files; a run shows which ones load.

In a run, the **Boot path** view adds **In the run**: when each file was asked for, and its status, or *never asked for*. Pick another item in the toolbar to see its boot path.

## Timeline

The **Timeline** view shows one run on a single time axis, so you can see what happened together. Each row is one kind of event:

- **Milestones**: the steps the run reached (the same as the strip at the top of Findings).
- **Requests**: a bar from the request to its response, red when it failed.
- **Scripts parsed**: when each script was read.
- **API calls**: a dot per call, coloured by kind (start, read, write, save, finish).
- **Errors**: a red tick per error.
- **What showed**: a dot each time the content's screen was checked. Hover it to see the text the content showed.
- **Trace activity**: a sparkline of how busy the traced run was. It appears only for a traced run.

Use the **Zoom** slider to look closer, and the **Start** slider to move along the run when zoomed in. Hover an item for its details. Click an item to open the view it came from (Network for a request, API for a call, and so on); that view opens at the top, not at the row. Steps the run didn't reach are listed under the chart. The HTML report has the same timeline as a picture.

## Reading the code

Anything that names a place in a file opens the code view there: a `file:line` in a finding's evidence (it is a link), **Code** in the Execution and Scripts views, a line number in the Package view's scan, the places in the Drill-down view, and **View code** under a file in the Files view. The view appears above the table; **Close** hides it.

- **Line numbers** and the line you came for, highlighted.
- **Formatted, Original, Source map.** *Formatted* lays JavaScript, HTML and CSS out for reading, so a minified file opens readable; its line numbers are the formatted text's, and the view still lands on the right place. *Original* is the file as it is. *Source map* shows the code the file was built from, when the file points to a source map that holds it: the view lands on the original line, and a map with several sources has a menu. A source map with no sources in it shows nothing, and Package Lab never fetches one from another site.
- **Coverage.** With a run chosen, each line is shaded: green ran (with `×N`, how many times), red didn't run, amber only part of the line ran. A page's inline scripts aren't shaded; for those, trace markers are the best guide. The run must have recorded the file.
- **Trace markers.** For a traced run, a grey note at the right of a line says what the trace saw: `show() called ×3`, `if: true ×1, false ×8`.
- **Search** (Enter for the next match, Shift+Enter for the previous) and **Go** to a line number.

A very large minified file opens as it is at once, and the formatted view arrives a moment later (a file over 5 MB isn't formatted). The view closes when you choose another run. A file over 5,000 lines draws only the lines in view. Lines over 600 characters are cut in the display; the search still looks in all of the line.

In the HTML report (`report`), each `file:line` in a finding's evidence links to a read-only excerpt of 20 lines either side, made from the package, or for a saved run from the sources it recorded.

## A method for a package that doesn't work

1. **Open it** and read the findings from the files. Fix any errors there first: a misnamed launch file or a version mismatch explains everything downstream.
2. **Run it with the defaults** and stop after 20 seconds. Did it show anything? Did it call the API?
3. **Blank or stuck:** follow the blank-page finding's evidence in order, then **Boot path** for the first file it never asked for, and **Errors** for the first error.
4. **Shows but no API calls:** look at **Lookups**. Never looked means the LMS code never ran: check errors and the mode-switch findings. Looked and found nothing means a version or frame problem: try API **Both**, then frame depth, then **In a new window**.
5. **Calls the API but doesn't save:** look at the progress findings and the **API** view. Then test resuming, as in [Macros and test saving](macros.md#testing-resume-by-hand).
6. **Not sure why it went that way:** use **Drill down** on the run. It follows the decision that sent the run the wrong way back to its cause. For more, run again with **Trace the code** on and read **Execution** from the bottom up.
7. **Its own API object:** the content decided it isn't in an LMS. **Lookups** shows the assignment and the code that made it; **Package** lists the mode switches. Find the export setting for an LMS or standalone package.

## On the command line

`run` launches an item and prints the same findings, and `report` writes the HTML report with the timeline and the code excerpts. See [run](../cli.md#run) and [report](../cli.md#report).
