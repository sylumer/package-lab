# 14. Working at scale

**What you'll learn:** how to do everything you've done in the window from the command line, so you can check many
packages, repeat a diagnosis exactly, script it and keep the results. And how to use Package Lab from another device.

The desktop app is the best place to explore one course. When you have twenty courses, or the same check to run every
time a vendor sends an update, or a colleague who needs to repeat exactly what you did, the command line is better.

## The command line in five commands

The command line and the web interface come with the Package Lab source, not the downloaded app: set them up with
[If you have the source](03-install-and-practice-kit.md#if-you-have-the-source) in chapter 3 first. The app's
**Check a folder…** does the same as `batch` without them.

Every command starts with `package-lab`. Add `--help` to any of them for its options.

```bash
package-lab analyze course.zip
```

The static findings, from the files only. Fast, and needs no browser.

```bash
package-lab run course.zip --wait 20 --out run.json
```

Runs the first SCO for 20 seconds and prints the milestones and findings. `--out` saves the run, which you can open in
the app with **File › Open Saved Run…**.

```bash
package-lab report course.zip --run --open
```

Runs it and opens an HTML report in your browser: findings, milestones, timeline, and code excerpts for each
`file:line`. Add `--redact` to take the course content out.

```bash
package-lab fix course.zip --out fixed.zip
```

Writes a corrected package, as **Export corrected package…** does.

```bash
package-lab batch ~/Downloads/vendor-exports --csv results.csv --out results.html
```

Checks every package in a folder: one row each, as a table, a CSV and an HTML report. Add `--run` to run each one too,
and get the furthest milestone of each.

### Try it

From the Package Lab folder:

```bash
package-lab batch practice --run --wait 8
```

It takes a couple of minutes. Compare the **Furthest milestone** column with the **Verdict** column, and with what
you've learnt about each package. Which packages does `--run` catch that the plain batch in chapter 13 didn't?

## Every setting is a flag

Every setting in the inspector has a flag, so any run you did in the app can be repeated here:

| In the app | On the command line |
|---|---|
| Item | `--item 2` |
| API | `--api both` |
| Profile | `--profile moodle` |
| Frame depth, In a new window | `--depth 2`, `--window` |
| Stop after | `--wait 20` |
| Trace the code | `--trace` |
| Storage, Browser, Device size | `--storage blocked`, `--browser webkit`, `--viewport ipad` |
| Authoring tool | `--tool storyline` |
| Pins, Answers | `--pin previewMode=false`, `--answer '/api/config=200:{}'` |
| Changed files | `--override js/app.js=fixed-app.js` |
| Macro | `--macro macro.json` |
| Resume last run's data | `--resume-from run.json` |
| Record caught errors (off) | `--no-caught` |
| Keep typed text in runs | `--record-input` |
| Watch the course window | `--show` |

There's no flag for **Stop after: I stop it**: a command-line run always lasts `--wait` seconds. (`--live` lets another
program watch and drive a run.)

You don't need to remember them. **Copy as CLI command**, at the bottom of **Settings › Advanced**, copies the
`package-lab run` line for the current settings. The [command line reference](../cli.md#the-apps-settings-as-flags)
has the full list.

And the tools of the Deep dive and Tools groups are commands:

| In the app | Command |
|---|---|
| Experiments | `package-lab experiment course.zip --preset lms` |
| Server needs | `package-lab discover course.zip` |
| Drill-down | `package-lab drill course.zip` |
| Test saving | `package-lab cycle course.zip --macro macro.json` |
| Compare packages | `package-lab diff a.zip b.zip` (`--run` runs both) |
| Check a folder | `package-lab batch folder` (`--recursive` for subfolders, `--jobs n` to run several at once) |

Some of them do more on the command line than in the window:

- `experiment --variants file.json` runs *your own* variants: a list of `{ "name", "patch" }`, each changing one thing.
  The [recipe for one LMS and not another](../recipes.md#works-in-one-lms-not-another) shows it finding which field
  of a profile matters.
- `discover --request /api/player/config --rounds 3` works on one request, for at most three rounds.
- `items course.zip` lists a package's launchable items, numbered for `--item`.

## Options files: a diagnosis you can repeat

When a run needs several pins, answers and changed files, put them in an **options file**, a JSON file:

```json
{
  "expose": "both",
  "pins": [{ "path": "previewMode", "value": false }],
  "responses": [{ "match": "/api/player/config", "status": 200, "body": "{}" }]
}
```

```bash
package-lab run course.zip --options fix-test.json --wait 20
```

The names in the file aren't always the flags' names (the **API** setting is `expose`, for example). The easy way to
get them right is to set the run up in the app, then look at **The options as JSON** under **Settings › Advanced**, or
at `launch.options` in a saved run.

And because every saved run keeps its options, `--options-from run.json` repeats a saved run exactly. That is how you
hand a diagnosis to a colleague, or re-check it after the vendor's next export.

## Profiles of your own

Once you know how your real LMS hosts courses (ask its administrator), write it down as a profile file: any fields,
over a preset named in `base`.

```json
{ "base": "moodle", "contentOrigin": "other", "frames": { "depth": 2 }, "limits": { "suspend12": 4096 } }
```

```bash
package-lab run course.zip --profile-file our-lms.json --wait 20
```

Now “does it work in our LMS?” is a command you can run on every course before it's uploaded. The fields are in the
[command line reference](../cli.md#profiles).

## JSON output and scripting

Every command takes `--json` and prints its result as JSON, for scripts. Exit statuses tell a script what happened:

| Status | Means |
|---|---|
| 0 | The command worked (the findings may still include errors) |
| 1 | With `--strict`, the findings include at least one error |
| 2 | The command failed: bad arguments, an unreadable file, a run that didn't finish |

So `--strict` gates on *errors*. A run that only stops short of a milestone, with warnings, still exits 0. To gate on
how far a run got, read `furthest` from the JSON (`launched`, `scripts`, `shown`, `looked`, `found`, `initialised`,
`read`, `wrote`, `committed`, `finished`):

```bash
package-lab run course.zip --profile-file our-lms.json --wait 20 --json | jq -e '.furthest == "committed"'
```

`jq -e` exits 1 when the answer is false, so a vendor's package that doesn't reach **Committed** under your LMS's
profile can stop a pipeline before it's uploaded.

## The web interface: Package Lab from another device

```bash
package-lab serve
```

This prints an address with a sign-in token, such as `http://127.0.0.1:4880/?token=…`. Open it in a browser: it's
nearly the whole app, plus a **Live** view of the course window that you can click and type into. Courses still run on
the Mac. The differences that matter:

- **Open package…** uploads a ZIP from the device you're on, and it replaces the package open on the Mac *for everyone*
  using it.
- There's no **Check a folder…** (use `package-lab batch` on the Mac), no **Record** button and no menu bar. Record
  macros with **Record clicks** in the Live view.
- Settings, pins, answers and the macro are kept in that browser's page: reloading clears pins, answers and the macro.

The [web interface guide](../web.md#using-it) lists every difference.

To reach it from an iPad or another computer, see [Reaching it from another device](../web.md#reaching-it-from-another-device).
Read the [security notes](../web.md#security) first: anyone with the address and token can use it.

## Check yourself

1. How do you repeat, on the command line, a run you set up in the app?
2. A colleague can't reproduce your result. What do you send them?
3. Write the command that runs a course under your own LMS profile and fails if it doesn't reach **Committed**.
4. Why might you run `batch --run` rather than plain `batch` on a vendor's delivery?

Next: [Thinking like an analyst](15-thinking-like-an-analyst.md).
