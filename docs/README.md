# Package Lab documentation

For people using it:

- [User Guide](user-guide/README.md): learn Package Lab, in chapters with exercises, from knowing nothing about SCORM to diagnosing what nobody else can. In the app: **Help › User Guide** (⇧⌘G), in a window of its own.
- [Help](help.md): help while you use the desktop app, one task to a page, in the app's Help panel: [getting started](help/getting-started.md), [reading a run](help/reading-a-run.md), [run settings](help/run-settings.md), [views](help/views.md), [macros and test saving](help/macros.md), [changing and exporting](help/changing-and-exporting.md), [experiments and servers](help/experiments-and-servers.md) and [cmi5, Tin Can and authoring tools](help/other-formats.md).
- [Recipes](recipes.md): step-by-step diagnoses for the usual problems: works in the authoring tool but not in an LMS, a blank page, no API calls, doesn't resume, works in Chrome but not in Safari or on an iPad, and works in one LMS but not another.
- [Findings](findings.md): every finding, what it means and what to try.
- [Authoring tool notes](packs/README.md): what the rule packs know about Xyleme, Storyline, Adapt and the rest, and where it comes from.
- [Command line](cli.md): `package-lab analyze`, `run`, `cycle`, `report`, `open`, `serve`; JSON output; live runs.
- [Web interface](web.md): using Package Lab from another device, with the live view; security.
- [Alfred](alfred.md): the workflow's keywords and File Actions.
- [Concierge](concierge.md): the Concierge dashboard module.
- [Windows](windows.md): building the portable Windows app on a Mac, running it, and where its data goes.

For people changing it:

- [Developer guide](developer-guide.md): architecture, each part in turn, data formats, adding findings, tests, packaging.
- [Design](../DESIGN.md): the approach and the roadmap.
- [Build plan](plan.md): the next stage, written to be run by an orchestrating session and subagents; progress in [plan-status.md](plan-status.md).
- [Evolution plan](evolution-plan.md): a friendlier Mac-style UI, app-first docs in shorter pages, and macros with on-screen coordinates, recording and an editor; written to be run like the build plan, with progress in [evolution-status.md](evolution-status.md).
