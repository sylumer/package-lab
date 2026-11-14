# Authoring tool packs

Research notes behind the rule packs in `src/packs/` (P3.2). Each file records what public sources say about one tool:
its file layout, config keys, known LMS problems, export settings and detection hints, with sources and what is
unconfirmed. Each ends with how SCORM Lab uses it. How packs work and how to add one: the
[developer guide](../developer-guide.md#rule-packs-p32). The findings they produce: [findings](../findings.md#from-authoring-tool-packs).

| Tool | Notes | Confidence of the research | Rules |
|---|---|---|---|
| Xyleme | [xyleme.md](xyleme.md) | Thin: nothing confirmed | Run-evidence based (platform requests, own API, outside host) |
| Articulate Storyline | [storyline.md](storyline.md) | Low (forum) | Web against LMS publish, API version |
| Articulate Rise | [rise.md](rise.md) | Low (forum) | xAPI export |
| Adobe Captivate | [captivate.md](captivate.md) | Low | Old support files, "cp is not defined" |
| iSpring | [ispring.md](ispring.md) | Medium for the package shape | One SCO |
| Lectora | [lectora.md](lectora.md) | Low | Source project in the ZIP |
| Adapt | [adapt.md](adapt.md) | High for config keys | `_isEnabled`, `_scormVersion`, debug window |
| dominKnow | [dominknow.md](dominknow.md) | Low | No manifest (Web package) |
| Evolve | [evolve.md](evolve.md) | Low | SCORM 2004, wrapper folder |
| SCORM Driver | [scormdriver.md](scormdriver.md) | Medium | `strLMSStandard`, `strContentLocation` |
| pipwerks wrapper | [pipwerks.md](pipwerks.md) | Medium | Never started, no API found |

Rules from forum knowledge are `info` until the package's files or a run confirm them.
