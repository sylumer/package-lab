// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// pipwerks SCORM API wrapper (docs/packs/pipwerks.md): SCORM.API.find / SCORM.API.get, version-agnostic.
import { score, named, scriptHits, apiCalls, lookups } from './util.js'

export default {
  id: 'pipwerks', name: 'pipwerks SCORM wrapper',
  detect: (a, files) => score(files, [['name', /SCORM_API_wrapper/i, 0.8], ['text', /pipwerks\.SCORM|pipwerks\s*=/, 0.8]]),
  staticRules({ files }) {
    const wrapper = new Set([...named(files, /SCORM_API_wrapper/i), ...scriptHits(files, /pipwerks\.SCORM\s*=|pipwerks\.SCORM\.version/)])
    const users = scriptHits(files, /\bSCORM\.init\s*\(/).filter(n => !wrapper.has(n))
    return wrapper.size && !users.length ? [{ sev: 'info', basis: 'pattern', title: 'the wrapper is in the package, but no script calls SCORM.init()',
      detail: 'The wrapper only talks to the LMS when a script starts it with SCORM.init(). The content may use another wrapper, or start it under a different name.',
      evidence: [...wrapper].slice(0, 3), fix: 'Run it and look at the API lookups: if there are none, find what should call SCORM.init().' }] : []
  },
  runRules(ctx, trace) {
    const looks = lookups(trace)
    return looks.length && !looks.some(l => l.found) && !apiCalls(trace).length ? [{ sev: 'warn', basis: 'run', title: 'SCORM.API.find found no API',
      detail: 'The wrapper searched the window, its parents and the opener and found none, so SCORM.init() returns false. Content that ignores that result runs untracked.',
      evidence: looks.slice(0, 4).map(l => `${l.name} not found from ${l.stack?.[0] ?? '?'}`), fix: 'Check the SCORM version (the Both APIs profile shows whether it is the cause) and the frame depth.' }] : []
  },
  notes: 'docs/packs/pipwerks.md',
  sources: ['https://github.com/pipwerks/scorm-api-wrapper', 'https://pipwerks.com/laboratory/scorm/api-wrapper-javascript', 'https://pipwerks.com/scorm-api-wrapper-116/', 'https://www.npmjs.com/package/pipwerks-scorm-api-wrapper'],
}
