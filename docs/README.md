# SCORM Lab documentation

For people using it:

- [User guide](user-guide.md): the desktop app, from opening a package to reading a run, with a method for packages that don't work. Every tab and toolbar button is listed in [The tabs and buttons, one by one](user-guide.md#the-tabs-and-buttons-one-by-one).
- [Recipes](recipes.md): step-by-step diagnoses for the usual problems: works in the authoring tool but not in an LMS, a blank page, no API calls, doesn't resume, works in Chrome but not in Safari or on an iPad, and works in one LMS but not another.
- [Findings](findings.md): every finding, what it means and what to try.
- [Authoring tool notes](packs/README.md): what the rule packs know about Xyleme, Storyline, Adapt and the rest, and where it comes from.
- [Command line](cli.md): `scorm-lab analyze`, `run`, `cycle`, `report`, `open`, `serve`; JSON output; live runs.
- [Web interface](web.md): using SCORM Lab from another device, with the live view; security.
- [Alfred](alfred.md): the workflow's keywords and File Actions.
- [Concierge](concierge.md): the Concierge dashboard module.

For people changing it:

- [Developer guide](developer-guide.md): architecture, each part in turn, data formats, adding findings, tests, packaging.
- [Design](../DESIGN.md): the approach and the roadmap.
- [Build plan](plan.md): the next stage, written to be run by an orchestrating session and subagents; progress in [plan-status.md](plan-status.md).
