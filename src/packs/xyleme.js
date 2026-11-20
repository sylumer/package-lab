// Xyleme. Public information is thin (docs/packs/xyleme.md), so detection uses only the names the notes list, and the
// rules rest on what Package Lab records anyway: requests to the platform's server root or another site, and content
// that builds its own API object. Nothing here claims to know Xyleme's files.
import { score, scriptHits, evidenceLines, serverNeeds, outsideHosts, ownApi, launchPath, short, textOf, named, SCRIPTY, SERVER_PLAYER } from './util.js'

const NEXT = 'Open the Server needs tab and run Discover on the request: it works out what the content reads from it. Save the stand-in as a pin or an answer to keep testing past it.'
const MARK = /xyleme|bravais/i

export default {
  id: 'xyleme', name: 'Xyleme',
  detect: (a, files) => score(files, [['name', /xyleme|bravais/i, 0.6], ['text', /\b(xyleme|bravais)\b/i, 0.6]]),
  // A run that talks to a Xyleme host is Xyleme even when the files carry no name.
  detectRun: trace => (trace.requests ?? []).some(r => /^https?:\/\/[^/]*(xyleme|bravais)/i.test(r.url)) ? 0.8 : 0,
  staticRules({ analysis: a, files }) {
    const out = [], scan = a.scan
    // A static export marked for Xyleme's own content server: RequireJS waits for it with no timeout, so nothing shows and nothing errors.
    const player = named(files, SCRIPTY).flatMap(f => { const t = textOf(files, f); return [...t.matchAll(SERVER_PLAYER)].map(m => `${f}:${t.slice(0, m.index).split('\n').length}  ${m[0].trim()}`) })
    if (player.length) out.push({ sev: 'error', basis: 'package', title: 'built for Xyleme’s server-side player: it will hang in any other LMS',
      detail: 'The page sets PLAYER_TYPE to \'Server-side\', so the player waits for Xyleme’s content server to supply its code (RequireJS is set to wait with no time limit). Outside Xyleme that never arrives: the page stays blank and no error shows. Taking out that one line lets the static export run in any LMS.',
      evidence: player.slice(0, 6), fix: 'Use Export corrected package (or package-lab fix) to remove the line, or republish from Xyleme as a standalone SCORM package.', autofix: { id: 'xyleme-player-type', params: {} } })
    const server = evidenceLines(scan, 'serverPaths', 6)
    if (server.length) out.push({ sev: 'info', basis: 'pattern', title: 'the content expects its platform at the server root',
      detail: 'Paths such as /api/… only work on a host that serves them. Xyleme content may be built to call the platform it was published from.',
      evidence: server, fix: NEXT })
    const own = evidenceLines(scan, 'apiDefine', 4)
    if (own.length) out.push({ sev: 'info', basis: 'pattern', title: 'the content builds its own SCORM API',
      detail: 'Content that creates window.API itself may talk to that instead of the LMS (a preview or standalone path).',
      evidence: own, fix: 'Run it: the Own API finding says whether it did. Then find the setting or condition that makes it do so (see Discover and pins).' })
    const lp = launchPath(a), page = lp && files.get(lp), remote = lp && evidenceLines(scan, 'absolute', 4, f => f === lp)
    if (page && page.length < 3072 && remote.length) out.push({ sev: 'info', basis: 'pattern', title: 'the launch page is small and points to another site',
      detail: 'A launch page that only loads content from an outside host is how a cloud player works: the package depends on that host being reachable and answering.',
      evidence: [`${lp} is ${page.length} bytes`, ...remote], fix: 'Run it and look at the requests to the outside host. ' + NEXT })
    const hosts = scriptHits(files, MARK).length ? evidenceLines(scan, 'absolute', 5, () => true).filter(l => MARK.test(l)) : []
    if (hosts.length) out.push({ sev: 'info', basis: 'pattern', title: 'scripts refer to a Xyleme address',
      detail: 'The content may depend on that host at run time.', evidence: hosts, fix: 'Run it and check that these requests succeed from the LMS’s network.' })
    return out
  },
  runRules({ launch }, trace) {
    const out = [], needs = serverNeeds(trace), hosts = outsideHosts(trace), own = launch.kind === 'package' ? ownApi(trace) : []
    // Generic behaviour is only a warning when the requests name a Xyleme host; otherwise it is the pattern a platform-hosted export shows.
    const marked = this.detectRun(trace) > 0, sev = bad => bad && marked ? 'warn' : 'info'
    if (needs.length) out.push({ sev: sev(needs.some(n => n.failed)), basis: 'run', title: 'the content asked its host for data outside the package',
      detail: `${needs.length} request${needs.length > 1 ? 's' : ''} went to the root of the host, not the package.${needs.some(n => n.failed) ? ' The test LMS does not serve them, so they failed.' : ''} This is the pattern a platform-hosted export shows; the requests alone do not show that the platform is Xyleme. An LMS that is not the platform may not serve them either.`,
      evidence: needs.slice(0, 8).map(n => `${n.method} ${n.match}${n.failed ? ' (failed)' : ''} from ${n.from}`), fix: NEXT })
    if (hosts.length) out.push({ sev: sev(hosts.some(h => h.failed)), basis: 'run', title: 'the content fetches from another site',
      detail: 'A launch that gets its content from an outside host (a cloud-player style launch) works only while that host is reachable from the learner’s browser. This is the pattern a platform-hosted export shows.',
      evidence: hosts.slice(0, 6).map(h => `${h.host}: ${h.count} request${h.count > 1 ? 's' : ''}${h.failed ? `, ${h.failed} failed` : ''} (${h.example})`),
      fix: 'Check the failed requests, then use Discover on them. If the host needs a sign-in or a token, the package may not run outside its platform.' })
    if (own.length) out.push({ sev: sev(true), basis: 'run', title: 'the content built its own SCORM API in this run',
      detail: 'It set window.API or API_1484_11 itself, so it may be in a preview or standalone mode and not talk to the LMS. A platform-hosted export can do this when it cannot reach its platform.',
      evidence: own.slice(0, 4).map(p => `${p.name} set in ${short(p.frame)} from ${p.stack?.[0] ?? '?'}`),
      fix: 'Find what makes it choose that path: often a failed request for its configuration. Answer that request (Discover, then pins and answers) and run again.' })
    return out
  },
  notes: 'docs/packs/xyleme.md',
  sources: [
    'https://www.madcapsoftware.com/products/create/faq/',
    'https://docs.stackone.com/integration-guides/lms/content-library-and-lxps/xyleme.md',
    'https://learningnews.com/news/xyleme/2013/xyleme-drastically-improves-scorm-publishing-with-the-release-of-bravais-21-',
  ],
}
