# 12. Going deeper

**What you'll learn:** what to do when the findings don't name a cause: when nothing failed, nothing threw, and the
course simply stopped. You'll use *why it stalled*, tracing, drill-down, server needs and a comparison with a working
copy.

The findings so far have explained failures: a missing file, an error, a lookup that found nothing. The hardest courses
don't fail. They wait, or choose a path, and nothing in the record says why. These tools find out.

## Why it stalled

When a run stops short of **Wrote data** and nothing failed outright, the course is usually **waiting** for something.
Package Lab records, in every frame, the timers, `postMessage` calls and `message` listeners the course sets up, and
the finding **The content was waiting for: …** lists what was still open at the end:

- **Messages with no answer**: a message the course sent to another window (the LMS, a parent frame) that nobody
  answered. Its type is named: `{ type: 'player-ready' }` shows as “player-ready”.
- **Pollers**: a timer still firing at the end, every so many milliseconds, checking for something.
- **Messages that never came**: a listener in the course that never ran.
- **Requests** still open.
- **The last code that ran.**

Then ask: in a real LMS or player, what answers each of these? And give the course the same, with a pin, an answer or a
changed file.

### Try it: `12-waits-forever.zip`

*“No errors anywhere, but nothing is recorded.”*

1. Open it. There's a static Problem: **Scripts on lesson.html run before what they need**. Write down what it predicts.
2. Run it for 10 seconds. Where did it stop? Is there an uncaught error, as the static finding predicted?
3. Read **The content was waiting for: …**. What did the course send, to whom, and what is it waiting to receive?
4. Open the line its evidence names. Which call is the one the static check worried about? Does it run “as soon as
   it runs”, or later?
5. How would you test your theory? (A pin can't send a message. What can change the course's behaviour?)

Check your answer in [the answers](appendix-a-answers.md#12-waits-forever). Step 4 matters: this is a static finding that is
*wrong*. The check saw the name used in a script that runs early, but not that it's inside a function that runs
later. Experts don't take any single finding on trust. They check it against the run.

## Tracing the code

Findings say *what* the course did. To see *why*, turn on **Trace the code** in **Settings › Recording** and run
again. Package Lab then records every function of the course's scripts that ran, and which way each decision went,
with the values it tested. The course runs a little slower, but behaves the same.

The **Execution** view shows the last 500 events before the run went quiet, newest last:

- `startCourse() called` and `startCourse() returned`. A start with no end means it threw, or was still waiting.
- `if (cfg.lms) → false, cfg.lms = undefined`: a decision, which way it went, and why.
- `(the same 4000 more times)`: a loop, counted.

**Read it from the bottom up.** The last decisions are usually where the course gave up. **Code** opens the line, and
the code view adds trace markers: `if: true ×1, false ×8`.

Tracing covers the package's own scripts (up to 2 MB each), not code from other sites, `eval`, or HTML `onclick`
attributes. It keeps the newest 200,000 events. And it needs Chromium.

## Drill-down

**Drill-down** does the reading for you. Choose a run, open **Drill-down**, and choose **Drill down**. If the run
wasn't traced, Package Lab runs it again with tracing; if it needs to know where a value came from, it runs it once more,
watching that value. Then it writes the answer as a numbered chain, each step the reason for the one before:

1. In `boot.js:3`, `if (window.player && player.ready)` was false because `window.player` was undefined. Otherwise it
   would have run `start()`, which never ran.
2. `player` was never assigned (watched). It is set at `js/player.js:1`, which is in a file that never loaded.
3. …

When the chain ends at something Package Lab can name (a failed request, a script that never loaded, a JSON file
without the field, an API version the LMS didn't offer), the finding is an error. Otherwise it's a warning, and the
last step says where to look.

### Try it: `06-stuck-connecting.zip` again

You solved this one in chapter 8 with coverage and a pin. Now let drill-down solve it.

1. Check the **Macro** segment is empty (**Clear** it if not). Run it for 10 seconds, then open **Drill-down** and
   choose **Drill down**. Watch the runs it adds to **Runs**.
2. Read the chain. Does step 1 name the same line you found?
3. What does step 2 say about where the value should come from? Why is that a useful thing to tell an author?

### Try it: `13-keeps-looking.zip`

*“It never connects, but the vendor says it's fine.”*

1. Run it for 10 seconds. Where does it stop? Read **The content was waiting for**: what is it doing?
2. Look at the **Try:** of **The content looked for API and found nothing**. It suggests trying both APIs. Try it.
   Does it help? Why not?
3. Open **Lookups**. On which window does the course look, every time?
4. Drill down. What does step 2 say about where the API lives?
5. Prove it: in **Files**, change the one line in `boot.js` so the course looks where the API really is. Save it as an
   override and run. How far does it get?

Check your answer in [the answers](appendix-a-answers.md#13-keeps-looking). Step 2 is a lesson in itself: a finding's **Try:** is
the most likely fix for *most* courses that show it. Your job is to check whether this course is most courses.

## Server needs

Courses made for a hosting platform ask it for settings before they start. You answered such a request by hand in
[chapter 8](08-testing-a-theory.md#tool-4-answering-a-request), with `{}`. But often the course needs specific fields,
and you don't know which.

The **Server needs** view lists the run's requests to the server's root or to other sites. **Discover**, on one
request, or **Discover all server requests**, works out what each one needs:

1. It runs the course without an answer.
2. It answers with a stand-in and watches every field the course reads from it, and how it uses each one.
3. It runs again with those fields filled in (`""`, `false`, `0`, `[]`), and again, until a round finds no new field
   (5 rounds at most by default).

The result lists, per request, the code that made it, every field read with its type and where it was used, and a
stand-in response. **Save as response** adds it to your answers; edit the values first if the course needs real ones.
The **Rounds** table shows how far each round got.

Try **Discover all server requests** on `07-works-on-the-platform.zip`. It reports that the course didn't read
anything from `/api/player/config`: this course only cares that the request *succeeded*. That's a finding too: any
`200` response would do, which is what your `{}` showed.

## Comparing with a working copy

If the course works somewhere (the authoring tool's preview, another LMS, SCORM Cloud), record it there and compare.

1. **File › Record a Working Copy…**, enter the course's address, and choose **Record**. The course opens in Package
   Lab's browser, where you can sign in (sign-ins are kept). Use it the same way as before, then **Stop**. Real API
   calls are recorded too.
2. In **Runs**, mark the working run **R** (reference) and the failing run **F**.
3. Open **Compare**.

It matches requests and scripts by path, ignoring host and folder, and shows the first request or script the working
copy had that the failing run didn't, requests that failed only in the failing run, errors only there, and functions
and branches that ran in one and not the other.

“The first thing that differed” is often the whole answer.

You don't need a real LMS to practise. Any two runs of the same item can be compared, one marked **R** and one **F**.

### Try it: compare two local runs

1. Open `06-stuck-connecting.zip`, pin `startOK` to `true` ([chapter 8](08-testing-a-theory.md#tool-3-pinning-a-value)),
   turn on **Trace the code**, and run for 10 seconds. This is your working copy: mark it **R**.
2. Remove the pin and run again, still traced. Mark this one **F**, and open **Compare**.
3. What does the comparison list as the first difference? Which functions ran only in **R**? Does it point at the same
   line you found in chapter 8?
4. Turn **Trace the code** off again.

## Choosing the tool

| You know | Use |
|---|---|
| Nothing failed, it just stopped | The **waiting for** finding, then **Drill-down** |
| Which line decided, but not why | **Drill-down**, or trace and read **Execution** from the bottom |
| It asks a server for something | **Server needs** |
| It works somewhere else | **Record a working copy** and **Compare** |
| It fails only in WebKit | Reproduce in Chromium with the same storage and device, then trace that |

## Check yourself

1. What does “waiting for: a reply to *player-ready*” tell you, and what question does it make you ask?
2. Why read the Execution view from the bottom up?
3. A drill-down chain ends with a warning, not an error. What does that tell you?
4. Server needs says the course read nothing from a response. Is that useless?
5. A static finding said a script would fail, but the run shows it didn't. What do you do with the finding?

Next: [Delivering the answer](13-delivering-the-answer.md).
