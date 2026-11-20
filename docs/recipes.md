# Recipes: diagnosing a package step by step

Each recipe is one problem you might bring to Package Lab, with the steps to take, in order. Every step uses a feature
that is described in full elsewhere: the [user guide](user-guide.md) for the desktop app, the [CLI](cli.md) for the
commands, and [Findings](findings.md) for what each message means.

The commands here use the CLI, because each one saves its result to a folder you can keep. The desktop app has the same
steps on its tabs; each recipe says where they are.

Three rules run through all of them:

- **Change one thing at a time.** Each run should differ from the last by one setting or one file.
- **Keep what you find.** Use `--out` so every run is kept; you will want to compare them.
- **A local run is a hint, not a verdict.** It runs in Package Lab's test LMS. Confirm each fix in the real LMS.

- [Works on the authoring platform, not in an LMS](#works-on-the-authoring-platform-not-in-an-lms)
- [Shows a blank page](#shows-a-blank-page)
- [No API calls](#no-api-calls)
- [Doesn't resume](#doesnt-resume)
- [Works in Chrome, not in Safari or on an iPad](#works-in-chrome-not-in-safari-or-on-an-ipad)
- [Works in one LMS, not another](#works-in-one-lms-not-another)

## Works on the authoring platform, not in an LMS

This is the most common case. Content made for a hosting platform (a preview on the authoring tool's site) asks that
platform for its settings and files. An LMS doesn't have them, so the content stops or falls back to a preview mode.
This recipe uses a Xyleme export as the example. Use the same steps for any tool.

**1. Check the package from its files, with the tool named.** If the package doesn't name its tool, say so with `--tool`:

```bash
package-lab analyze course.zip --tool xyleme
```

Read the **Made with** line and the findings from the files. Public information about Xyleme is thin, so the Xyleme
rules (see [Findings](findings.md#from-authoring-tool-packs)) only describe patterns any platform-hosted export shows: paths
at the root of the server, a content-built SCORM API, a small launch page that points to another site. From the files
they are information only; a run can raise one to a warning when a request names a Xyleme host and fails. The
findings that matter most are the general ones about the launch and paths at the root of the server.

One Xyleme finding is firm: "built for Xyleme's server-side player: it will hang in any other LMS". A static export
(for example "Static SCORM 1.2" for SuccessFactors) that sets `PLAYER_TYPE = 'Server-side'` waits forever for Xyleme's
content server, so the page stays blank and shows no error. It carries the Autofix `xyleme-player-type`: `package-lab fix
course.zip --out fixed.zip`, or Export corrected package, removes that line. A "Scripts set document.domain" warning
often sits beside it; browsers now ignore that line, and the fix leaves it alone.

**2. Run it and find the step it stopped at.**

```bash
package-lab run course.zip --tool xyleme --wait 20 --out run.json
```

Read the **Milestones** line. If the run didn't reach **Looked for the API**, the content never started its LMS code.
Look at **Got as far as** and **Didn't reach**. In the user guide, the Findings tab shows the same.

**3. Find out what it wants from its server (Server needs).** Each request to the server's root or another site is
listed, and each field the content reads from the answer is named.

```bash
package-lab discover course.zip --tool xyleme --wait 20 --out disc
```

Open `disc/discovery.json`, or the text output. The findings say what the content needs, and whether a stand-in answer
got it further. In the desktop app, use the **Server needs** tab and **Discover all server requests**.

**4. Answer those requests and run again.** Build an options file from the stand-in answers that Discover saved:

```bash
jq '{responses: [.requests[].response]}' disc/discovery.json > answers.json
package-lab run course.zip --tool xyleme --options answers.json --wait 20 --out run2.json
```

(`jq` is optional: copy each `response` from `discovery.json` into the file by hand, in a list under `responses`.)

Compare the two runs. If `run2.json` gets further than `run.json`, the answers are the missing part. The Discover
output also says so in its finding "With a stand-in for …, the content reaches …". In the desktop app, **Save as
response** does the same and **Run with these** runs it.

**5. Find the decision that stopped it (Drill-down).** Drill-down follows the decision back to its cause:

```bash
package-lab drill course.zip --tool xyleme --options answers.json --wait 20 --out drill
```

The chain ends at a cause Package Lab can name, such as a request that failed or a JSON file missing a field. If the
chain ends at a server response, go back to step 3 and look at which field it read.

**6. Test the LMS hosting settings.** Run every LMS profile in turn and see which ones get further:

```bash
package-lab experiment course.zip --tool xyleme --options answers.json --preset lms --wait 20 --out lms
```

The table shows the furthest step for each profile. A profile that gets further shows that the LMS's hosting matters.
Open its run to see the findings for it (for example, "The content can't reach the LMS from another origin").

**7. Fix what can be fixed mechanically.** Some problems have an automatic fix: capitals, the manifest name, the
manifest version, missing file entries and `http://` links. Check the result before using it:

```bash
package-lab fix course.zip --out fixed.zip
package-lab analyze fixed.zip
```

The fix can't add a server or change what the content asks for. If the content still needs its platform's server
(step 3 still lists requests), the real fix is in the authoring tool's export: a standalone or LMS export setting, or
an LMS feature that serves the same files. Ask the author or the LMS administrator for that, and send them
`package-lab report course.zip --run --redact` as the evidence.

## Shows a blank page

The content loads and shows nothing, or stops on a loading screen.

**1. Read the blank-page finding.** It says "The content shows a blank page" (or "is stuck on a loading screen"), and
its evidence is in loading order. Fix the first item: later ones often follow from it.

```bash
package-lab run course.zip --wait 20 --out run.json
```

**2. Check the loading path.** In the desktop app, the **Boot path** tab's **In the run** column shows when each file
was asked for and its status. The first file marked *never asked for* is where loading stopped. From the files alone:

```bash
package-lab analyze course.zip
```

Errors here (a missing file, wrong capitals, a path at the root of the server, a file that climbs out of the package)
are almost always the cause. Run `package-lab fix course.zip --out fixed.zip` for capitals and the manifest.

**3. Read the first error.** The **Errors** tab lists uncaught errors in time order. The first one usually explains the
rest. Look at the file and line it names (the link opens the code).

**4. If there is no cause listed, the content is waiting.** The finding "The content was waiting for: …" names what was
still open: a reply to a message, a timer polling for something, or a request with no answer. Work out what answers it
in the real LMS, then give the content the same, with a pin or an answer (see the Discover recipe above).

**5. If it still isn't clear, trace the decisions.**

```bash
package-lab drill course.zip --wait 20 --out drill
```

Drill-down runs the content with tracing and gives the chain of decisions that led to the dead end. The Execution tab
shows the same events, from the bottom up.

**6. Check for the old-browser causes.** Flash, code that only runs in Internet Explorer, and `document.write` in
deferred scripts are listed in the boot findings with their own fixes.

## No API calls

The content loads, but the LMS never gets a call. The **Lookups** tab is the first place to look.

**1. Did the content look for the API at all?**

- **Never looked** (the Milestones show **Looked for the API** as missing): the LMS code never ran. Check the errors
  and the boot path (the recipe above). If the content sets its own `window.API`, its own preview or standalone path
  took over. Find the setting that makes it do that, and turn it off in the export.
- **Looked, and found nothing**: the LMS isn't where the content looks. Go to step 2.
- **Found it, but never called it**: the first error after the lookup stopped it. Check the **Errors** tab for that
  point.

**2. Try the API versions the LMS might offer.**

```bash
package-lab experiment course.zip --preset api --wait 20 --out api
```

If "both" or "1.2" gets further than the manifest's version, the manifest and the scripts disagree. Fix the manifest
version (the `manifest-version` fix) or republish.

**3. Try frame depth and a new window.** Many LMSs put the content two or three frames deep, or in a new window:

```bash
package-lab experiment course.zip --preset frames --wait 20 --out frames
```

If a deeper frame or a new window gets further, the content searches too few parents to find the API.

**4. Try an LMS hosting that serves the content from another domain.** The content can't reach the LMS's API across
domains. The finding "The content can't reach the LMS from another origin" names each refused lookup. The fix is an LMS
on the same domain, or a cross-domain wrapper that uses `postMessage`:

```bash
package-lab experiment course.zip --preset lms --wait 20 --out lms
```

**5. Check the storage the content uses.** Run with storage blocked. If the content uses `localStorage`,
`sessionStorage`, cookies or IndexedDB in its frames, the finding "The content needs storage the browser can block"
lists each use, and the run may stop there. See the
[Works in Chrome, not in Safari](#works-in-chrome-not-in-safari-or-on-an-ipad) recipe.

**6. Look at the requests.** A request that fails before the content starts its LMS code (a config file, a licence
check) stops it quietly. Use **Network** (or the requests in `run.json`) and the Discover recipe.

## Doesn't resume

The learner comes back and starts again from the beginning, or the course won't pick up where it left off. Test saving
does the whole test in one step, using a macro of what a learner does.

**1. Make a macro of one learner session.** Use the desktop app's **Use this run's clicks** after a run in which you
clicked through part of the course, or the live view's **Record clicks** in the web interface. Or write one (see
[Macros](cli.md#macros)). Add `--record-input` to the run if typed answers matter, and never type passwords.

**2. Run the save-and-resume test.**

```bash
package-lab cycle course.zip --macro macro.json --wait 15 --out cycle
```

The first run plays the macro, then leaves the way a learner closing the window does. The second run resumes from what
the first saved. The text output shows both runs side by side.

**3. Read the findings in this order.** The test stops at the first error, so fix them in turn:

| Finding | Fix |
|---|---|
| **Leaving the course saved nothing** | Save the bookmark and the suspend data as the learner moves (on each page change), and again in `pagehide` |
| **Leaving the course didn't end the session** | Call `LMSFinish` or `Terminate` from `pagehide`, after the last `SetValue` |
| **The content exits with "…" instead of "suspend"**, or **never sets exit** | Set `cmi.core.exit` (or `cmi.exit`) to `suspend` whenever the learner leaves before finishing |
| **The LMS started a new attempt instead of resuming** | The same fix: with `suspend` set, a resume is offered on the next launch |
| **On resume, the content didn't read its saved place** | On launch with `entry` set to `resume`, read the location and the suspend data, then go back to them |
| **The content read its saved place but started from the beginning** | Use the location that was read to open the right page |
| **Suspend data written after resuming doesn't start from what was saved** | Read the suspend data on launch and add to it, rather than starting it again |

**4. Check the limit.** A finding "Suspend data is *N* characters" means the LMS may drop it. SCORM 1.2 allows 4,096
characters and 2004 allows 64,000 (or the profile's own limit). Store less, or publish as SCORM 2004.

**5. Run the test again** after each change, until the last finding is "Saving and resuming worked".

Test saving runs in Chromium and uses the test LMS's own rules, so check the final behaviour in the real LMS. Some LMSs
offer a resume only after the attempt ends in a particular way; the cycle's entry finding shows what this test LMS
offered.

## Works in Chrome, not in Safari or on an iPad

Safari refuses storage to content that sits inside another site's page, which is how most LMSs show a course. iPads
run Safari's engine too, and they also have a touch screen and a smaller window.

**1. Check the tools are there.**

```bash
package-lab doctor
```

WebKit needs Playwright. If `doctor` says it's missing, the **To do** list gives the command.

**2. Run the same item in WebKit, at an iPad size.**

```bash
package-lab run course.zip --browser webkit --viewport ipad --wait 20 --out webkit.json
```

A WebKit run records requests, console messages, errors that stop a script, and the probe's reports. It has no
coverage and no code trace. If it fails here and not in Chromium, the errors name the cause: a line such as
"undefined is not an object (evaluating 'navigator.userAgentData.brands')" is a Chrome-only API.

**3. Test storage blocked, as Safari does for content in another site's frame.**

```bash
package-lab run course.zip --storage blocked --wait 20 --out blocked.json
```

If the finding "The content needs storage the browser can block" appears, the lines it lists are where the content
uses storage. Keep the course state in the LMS (`cmi.suspend_data`), and wrap each browser storage use in `try/catch`
with a fallback in memory.

**4. Compare the settings in one go.**

```bash
package-lab experiment course.zip --preset browsers --wait 20 --out browsers
package-lab experiment course.zip --preset storage --wait 20 --out storage
```

The tables show how far each got. A variant that gets less far (for example, storage blocked) points at what breaks it.

**5. Trace the same settings in Chromium.** WebKit runs can't be traced, and so can't be drilled down. To find the
decision that breaks, run in Chromium with the same storage and device settings and trace it:

```bash
package-lab drill course.zip --storage blocked --viewport ipad --wait 20 --out drill
```

**6. Check the device.** A phone or tablet has a smaller window and touch. Use the iPhone, iPad or Android presets, or a
custom size, and check that the content's layout and `<meta name="viewport">` suit it.

## Works in one LMS, not another

Each LMS hosts content a little differently: its origin, frame depth, sandbox, how it opens the course, when it puts the
API in place, and its limits. A profile reproduces one LMS's way. The presets are approximations, so get the real
settings from the LMS's administrator.

**1. Compare the LMSs you have.** Run every profile and see which gets further:

```bash
package-lab experiment course.zip --preset lms --wait 20 --out lms
```

The table's furthest step is the first place the content breaks in each LMS. A profile that fails, next to one that
works, shows the setting that matters.

**2. Read the failing profile's findings.** Run the item with that profile and read its findings:

```bash
package-lab run course.zip --profile moodle --wait 20 --out moodle.json
```

Typical findings for each setting:

- **Content origin other**: "The content can't reach the LMS from another origin".
- **A sandbox without `allow-same-origin`**: "The LMS frame's sandbox has no allow-same-origin".
- **API on the opener or the parent**: "The content looked for *API* and found nothing", with the detail saying
  whether it's a frame problem. Check the **API on** setting against where the content looks.
- **Cookies third-party blocked** (the scorm-cloud preset): the storage findings.
- **Suspend data limit**: the "Suspend data is *N* characters" finding names the profile's limit.

**3. Find the one setting that matters.** Change one field of the failing profile at a time. Put the candidates in a
variants file and run them as an experiment:

```json
[
  { "name": "other origin", "patch": { "profile": { "base": "moodle", "contentOrigin": "other" } } },
  { "name": "depth 0", "patch": { "profile": { "base": "moodle", "frames": { "depth": 0 } } } },
  { "name": "api on parent", "patch": { "profile": { "base": "moodle", "apiWhere": "parent" } } }
]
```

```bash
package-lab experiment course.zip --profile moodle --variants variants.json --wait 20 --out fields
```

The run options give the default: here, the failing profile (`--profile moodle`). Each variant changes one field from
it, so a variant that gets further names the setting that matters. The finding "*Variant* gets further than the
default" says which one.

**4. Write the profile down.** Once you know the settings, save them as a profile file and run it any time:

```bash
package-lab run course.zip --profile-file moodle-site.json --wait 20
```

**5. Fix the content for the setting that breaks it.** Common fixes: keep the course state in the LMS rather than in
browser storage; wrap cross-frame calls in `try/catch` and use a `postMessage` bridge when the content is on another
origin; read the saved place on launch rather than at the first page. The findings for each setting name the fix.

If one LMS fails for a reason the profile doesn't cover (its own player, a licence server), the Network tab shows the
requests it fails on. Use the Discover recipe for what the content reads from its server.

## Sending the evidence

When you have a diagnosis, send the author or the vendor a report without the course content:

```bash
package-lab report course.zip --run --wait 20 --redact --out report.html
```

The redaction rules and what they keep are in the [user guide](user-guide.md#sending-a-report-without-the-course-content).
