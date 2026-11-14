// Articulate Storyline (docs/packs/storyline.md: forum reports, low confidence).
import { score, named, apiCalls, lookups } from './util.js'

export default {
  id: 'storyline', name: 'Articulate Storyline',
  detect: (a, files) => score(files, [['name', /story_content\/|story\.html$/i, 0.8], ['text', /DS\.(presentation|playerGlobals)/, 0.6], ['text', /storyline/i, 0.3]]),
  staticRules({ files }) {
    const out = [], hasDriver = named(files, /(^|\/)scormdriver(\.js$|\/)/i).length
    if (named(files, /(^|\/)story\.html$/i).length && !hasDriver)
      out.push({ sev: 'info', basis: 'pattern', title: 'story.html is here but there is no scormdriver.js',
        detail: 'Forum reports say LMS output includes scormdriver.js and Web output does not. This may be a package published for the Web, which has no LMS code.',
        evidence: named(files, /story\.html$/i).slice(0, 3), fix: 'In Storyline’s Publish dialog, choose LMS (not Web), pick the SCORM standard, and publish again. Then run the new package.' })
    return out
  },
  runRules({ analysis: a }, trace) {
    const calls = apiCalls(trace), looks = lookups(trace), driver = Object.keys(a.scan ?? {}).some(k => /scormdriver/i.test(k))
    return !calls.length && !looks.length && !driver && (trace.requests ?? []).some(r => /story\.html/i.test(r.url) && r.status < 400)
      ? [{ sev: 'info', basis: 'run', title: 'story.html loaded, nothing looked for the LMS, and the package has no scormdriver.js',
        detail: 'Forum reports say Web output has no scormdriver.js. That would fit a Web publish launched as an LMS package, but the run shows only these facts.',
        evidence: ['story.html was requested; no API lookup or call; no scormdriver.js with SCORM calls'], fix: 'If this was meant for an LMS, publish for LMS from Storyline (Publish, then LMS) and run that package.' }] : []
  },
  notes: 'docs/packs/storyline.md',
  sources: [
    'https://community.articulate.com/discussions/articulate-storyline/experiential-differences-in-publishing-to-web-vs-scorm-1-2',
    'https://community.articulate.com/discussions/discuss/how-does-storyline-360-identify-whether-it-is-published-to-an-lms-or-the-web/967754/replies/967755',
    'https://www.articulatesupport.com/article/storyline-test-aicc-content-in-scorm-cloud',
  ],
}
