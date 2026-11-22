# Experiments and servers

For when one setting isn't enough: try them all, find out what the content asks of its server, follow a stop back to its cause, and compare with a course that works.

## Experiments

Instead of changing one setting at a time, let Package Lab do it. Open the **Experiments** view, choose a set of variants, and click **Run all**. It runs the item with the settings in the inspector (the default), then again with each variant, one after another. Each run lasts as long as **Stop after** (10 seconds if that says “I stop it”).

| Variants | What is tried |
|---|---|
| **api** | The API offered: as the manifest says, both, 1.2, 2004 and none |
| **frames** | Frame depth 0, 1, 2 and 3, and a new window |
| **standard** | Both of the above (a variant that matches the default is left out) |
| **lms** | Each LMS profile in turn (see [Profile](run-settings.md#lms)) |
| **storage** | Storage normal and blocked (see [Browser and device](run-settings.md#browser-and-device)) |
| **browsers** | Chromium and WebKit (see [Browser and device](run-settings.md#browser-and-device)) |

The table fills in as each run finishes: how far it got, API calls, errors, the verdict, and how it compares with the default. Click a row to open that run. **Stop** ends the run in progress and skips the rest; the run it cut short is left out of the table and the findings, though it stays in the Runs list. A run that fails to finish shows as such, and the experiment carries on. Your own variants, from a file, are on the command line: [experiment](../cli.md#experiment).

If a variant got further than the default, a finding says so and lists the settings that changed, which tells you which setting matters. If nothing helps, the finding says that too.

## Comparing with a working copy

If the course does work somewhere, such as the authoring tool's hosted preview, another LMS or SCORM Cloud, record that too. Choose **File › Record a Working Copy…** (or **Record a working copy…** in **Actions**). In the dialog, enter the address of the course and choose **Record**.

1. The course opens in Package Lab's own browser, where you can sign in; sign-ins are kept between sessions. Use it the same way, then choose **Stop**. API calls on the real LMS are recorded too.
2. In **Runs**, mark the working run **R** and the failing run **F**, then choose **Compare**.

The comparison matches requests and scripts by path, ignoring host and package folder. It shows the first request or script the reference had that the run didn't; requests that failed only in the run; errors only in the run; and branches and functions that ran in one and not the other, with their code.

## Server needs

Content made for a hosting platform often asks that platform for its settings (`/api/player/config`, a user record) before it starts. In an LMS nobody answers, so it stops or falls back to a preview mode. Answering the request by hand needs to know what to put in the answer. **Discover** works it out.

1. Run the item once, then open the **Server needs** view. It lists the run's fetch and XHR requests to the server's root or another site.
2. Choose **Discover** on a request, or **Discover all server requests**. **Rounds** limits how many times it tries (5 by default).
3. Package Lab runs the item without an answer, then answers the requests with a stand-in and watches every field the content reads from it, and how it uses each one. It runs again, answering with those fields filled in (`""`, `false`, `0`, `[]`), and again, until a round finds no new field. Each round is a run as long as **Stop after** (10 seconds if that says “I stop it”).

The result shows, for each request: the code that made it, every field read with its type, how it was used and where, and the stand-in response. The **Rounds** table says how far each run got against the one without an answer; click a row to open that run. **Save as response** adds the stand-in to your answers (see [Pins and answers](changing-and-exporting.md#pins-and-answers)), so the next run gets it. Edit the values first if the content needs real ones (`true`, a version number). The result is also saved in the `discoveries` folder next to the saved runs.

What it can't see:

- A field that doesn't exist yet is answered with a stand-in that is always there and always truthy, so in the first round `if (config.enabled)` takes the true branch. Later rounds use the placeholder values, so they behave like a real answer.
- `typeof` on a missing field says `object`, `'x' in config` says yes, and listing or iterating it gives nothing. Calling a missing field throws, as it would with a real answer, unless it is named like a list or text method (`map`, `trim`).
- Types come from how the code used a value. Package Lab reads the code next to a comparison or a truthiness test. Code built at run time (`eval`), or reading the answer in a worker, isn't followed. A field it read but did nothing visible with is shown as true or false.
- Lists found in a real answer are given as they are, and not looked into.

## Why it stalled

When a run stops short of **Wrote data** and nothing failed outright, the content is usually waiting. Package Lab records, in every frame, the timers, `message` listeners and `postMessage` calls the content makes (and counts animation frames). The finding **The content was waiting for: …** lists what was still open at the end:

- **Messages with no answer.** A message the content sent to another window (the LMS window, a parent frame) that had no listener there, whose listener didn't run within 1 s, or whose listener ran but sent nothing back within 2 s. The message's type is named (`{ type: 'player-ready' }` is “player-ready”); only short values are recorded. A message to a window on another site can't be judged and is left out.
- **Pollers.** A timer still firing at the end: an interval, or a chain of timeouts from one place in the code (at least three runs). With **Trace the code** on, Package Lab also names the test the callback made and its last value: “polls every 250 ms; tests `window.API` → undefined, 120 times”.
- **Messages that never came.** A `message` listener in the content that never ran.
- **Requests** still open at the end.
- **The last code that ran:** the last events (traced), or the last functions that ran.

The finding sits under the blank-page or loading-screen finding when there is one. Then ask what answers each item in a real LMS or player, and give the content the same: a [pin](changing-and-exporting.md#pins-and-answers) can set a value, and a [file override](changing-and-exporting.md#changing-files-and-running-again) can change the page.

What it can't see: a listener set with `onmessage = …`, or an object with `handleEvent`, isn't counted; messages between workers, ports and other windows than frames aren't recorded; a timer started with a string of code runs as usual, but its runs aren't counted.

## Drill-down

The **Drill-down** view explains, without your help, why a run stopped where it did. Choose a run and click **Drill down**. If the run wasn't traced, Package Lab runs the item again with tracing; then, if it needs to know where a value came from, it runs it once more watching that value. Each run lasts as long as **Stop after** (10 s if that is “I stop it”), uses the run's own settings, and appears in the Runs list. **Stop** stops it.

The answer is a numbered chain, read as a story, and a finding that sums it up in one line. For example:

1. In `boot.js:3`, `if (window.player && player.ready)` was false because `window.player` was undefined. Otherwise it would have run `start()`, which never ran.
2. `player` was never assigned (watched). It is set at `js/player.js:1`, which is in a file that never loaded.
3. `js/player.js` is loaded only by `boot.js:9`, which never ran.
4. `boot.js:9` loads `js/player.js` only when `if (config.cdn)` (`boot.js:7`) is true; it was false because `config.cdn` was undefined.
5. `config.cdn` was never assigned (watched). `config` was set at `boot.js:6`.
6. `config` came from `data/config.json` (200), which has no `cdn`.

How it gets there:

- **The dead end.** The last 300 events before the run went quiet (2 s without any) after its last milestone, and the decisions made within 1 s of that milestone.
- **Key decisions.** Decisions there whose other branch is code that never ran. The chain starts from the last one whose values explain it: an `undefined` or `null`, or a false value from somewhere Package Lab can name.
- **Where a value came from.** Package Lab looks for every place in the package that sets it, and in the watch run, which of them ran, when, and with what value. When none ran, it says why: the file never loaded, or a decision kept it from running. It follows that decision's own `undefined` values, up to three levels. A value can also come from a response, the launch address's query, the LMS (`GetValue`), or a script that defines it.
- **The finding** is an error when the chain ends at a cause Package Lab can name: a failed request, a script that failed or that nothing loads, a JSON file without the field, or an API version the LMS didn't offer. Otherwise it's a warning, and the last step says where to look.

What it can't follow: names local to a function aren't watched; a server's response isn't visible (run **Discover** to see what the content reads from it); in inline scripts, whether code ran is judged from the trace only; and a watched name that didn't exist before is seen by `name in window` as there, with the value `undefined`.

## Tracing the code

Findings say what the content did. To see why, turn on **Trace the code** under **Settings › Recording** and run again. Package Lab then records, in order, every function of the package's scripts that ran and which way each decision went, with the values it tested. The content doesn't pause, and behaves as it does without tracing.

The **Execution** view shows the last 500 events before the run went quiet, newest last:

- `startCourse() called` and `startCourse() returned`: a function started and ended. A start without an end means it threw, or was still waiting (an `await`) when the run stopped.
- `if (cfg.lms) → false, cfg.lms = undefined`: a decision, which way it went, and the values it compared. The same goes for `? :`, `&&`, `||`, `??`, `switch` and loop tests. Text is cut to 80 characters; an object shows its kind and up to five of its names.
- `(the same 4000 more times)`: a loop that made the same decision over and over is counted, not listed.

The filter box narrows the list. **Code** opens the [code view](reading-a-run.md#reading-the-code) at that line. Start from the bottom: the last decisions are usually where the content gave up.

What tracing covers, and what it doesn't:

- Scripts and inline scripts in the package's pages, up to 2 MB each. Larger files, files that aren't UTF-8 text, and scripts Package Lab can't read run as they are; a finding lists them.
- Not code from other sites, code built at run time (`eval`, `new Function`), event handlers written in HTML attributes, or code inside a `with` block. Code in workers runs but isn't recorded.
- At most 200,000 events are kept, the newest. A finding says when older ones were dropped.
- The content runs a little slower. A script that reads its own source (`fn.toString()`) sees the traced version.

The saved run keeps the trace. Traced runs have an answer on the command line too: see [run](../cli.md#tracing).

## On the command line

[experiment](../cli.md#experiment), [discover](../cli.md#discover), [drill](../cli.md#drill) and [run](../cli.md#tracing) give the same results as text or JSON. The `waitingFor` field of `run --json` holds what the content was waiting for.
