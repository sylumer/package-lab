# cmi5, Tin Can and authoring tools

Most of the guide is about SCORM. This page covers the two xAPI formats, cmi5 and Tin Can, and the checks Package Lab makes for the tools that built a package.

## cmi5 and Tin Can packages

Package Lab diagnoses two more kinds of package, found by their course file:

- **cmi5**: a ZIP with `cmi5.xml` at the top (a course made of blocks and AUs, the assignable units).
- **Tin Can (xAPI)**: a ZIP with `tincan.xml` and no `imsmanifest.xml`.

Open one as you open a SCORM package. The **Package** view shows *Course file: cmi5* and lists the AUs (or the Tin Can activities that have a `<launch>`) as the items, with `moveOn` and `masteryScore` for cmi5. **Findings** checks the course file and the launch files before running (see [Findings](../findings.md#from-a-cmi5-or-tin-can-package)). Run an item as usual.

There is no SCORM API. The test LMS gives the content an **LRS** instead, a learning record store of its own, at `lab://run/__lrs/`, and puts its address in the launch URL the way an LMS does:

- **cmi5**: `endpoint`, `fetch`, `actor`, `registration` and `activityId`. The AU POSTs to the `fetch` address to get an auth token, **once** (a second request gets error 1, as in the standard), and sends it as `Authorization: Basic <token>`. The LRS holds the `LMS.LaunchData` state document (`contextTemplate` with the session id, `launchMode`, `moveOn`, `masteryScore`, `launchParameters`) and the learner's preferences, and has recorded the LMS's “launched” statement before the AU starts. An AU whose `launchMethod` is OwnWindow opens in its own window.
- **Tin Can**: `endpoint`, `auth` (the whole `Basic …` value), `actor`, `registration` and `activity_id`. The content gets the real token; in a saved run, a report and the Network view's saved addresses show it as `‹token›`.

The LRS speaks xAPI 1.0.3: statements (PUT, POST, and GET with `statementId`, `since`, `until`, `verb`, `activity`, `registration`, `agent`, `limit`), state, activity profile and agent profile documents, `about`, and the `X-Experience-API-Version` header. It checks every statement against the standard. A statement that breaks a MUST is refused with status 400, as a real LRS does, and recorded with its problems. What the standard only recommends is accepted and noted. The learner is “Learner, Test”, and nothing is kept after the run except what the saved run holds.

The milestones follow the statements:

- cmi5: **Launch page loaded**, **Scripts loaded**, **Content shown**, **Fetched the auth token**, **Initialized**, **Completed, passed or failed**, **Terminated**.
- Tin Can: the first three, then **Sent a statement** and **Sent a completion statement** (a statement with the verb completed, passed, failed or mastered, or a result with `completion` or `success` true).

Launch settings that are about SCORM (**API**, **Resume last run's data**, and the save-and-resume test) don't apply to these runs. Profiles, frame depth, the device size, storage and WebKit do, and a run saves its statements.

## The xAPI view

For a cmi5 or Tin Can run, the **xAPI** view shows:

- **Statements**: every statement in the order it arrived, with when, who sent it (the LMS or the content), whether the LRS stored or rejected it, a one-line summary (verb, object, result) and its **Validation**: each problem, with the place in the statement it is about (`result.score.scaled`), and whether it is an error (the LRS refuses the statement) or a warning. Open a statement to see its JSON.
- **Documents**: the state, activity profile and agent profile documents, and who wrote them.
- **Requests to the LRS**: every request with its status, whether it carried the token and the version header, and what was wrong with it.

The cmi5 findings (statements out of order, “completed” before “initialized”, no category activity or session id, `moveOn` not satisfied, the token fetched twice) are in [Findings](../findings.md#from-a-cmi5-or-tin-can-run-the-lrs), with every xAPI check. A report has an **xAPI** section with the same tables.

## Authoring tool checks

If Package Lab recognises the tool that made a package, it adds findings that know that tool. They start with its name (“Adapt: …”, “SCORM Driver (Rustici): …”) and appear with the other findings, before and after a run. Tools covered: Xyleme, Articulate Storyline and Rise, Adobe Captivate, iSpring, Lectora, Adapt, dominKnow, Evolve, the SCORM Driver and the pipwerks wrapper.

Each says how sure it is:

- **Matches a known pattern**: it comes from forum reports and the like. It is only information, and worth checking.
- **Confirmed in the package's files**: Package Lab read the setting itself, such as Adapt's `_isEnabled` or the SCORM Driver's `strLMSStandard`.
- **Confirmed in this run**: the recording shows it.

Public information about some tools is thin, so these checks are cautious: they stay information until a run or the files confirm them. For Xyleme, they rest on what Package Lab records for any package: requests to the platform's server, another site, or content that builds its own API. Their advice points to **Discover**, pins and answers.

A package that carries no tool name is treated like any other, unless you set **Authoring tool** (under **Settings › Advanced**) to the tool. Its rules then run whether or not Package Lab recognises it, and the findings say you chose it. [Findings](../findings.md#from-authoring-tool-packs) lists them all.

## On the command line

The `--tool` option of [analyze](../cli.md#analyze) applies an authoring tool's rules to a package. The [cmi5 and Tin Can section](../cli.md#cmi5-and-tin-can-packages) lists what differs in the command-line output.
