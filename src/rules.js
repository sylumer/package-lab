// Findings: evidence from the static analysis, a recorded run and (optionally) a comparison, turned into likely
// causes. Pure. Each finding: { sev: 'error' | 'warn' | 'info', title, detail, evidence: [string], fix }.
import { isLab, isLrs } from './diff.js'
import { bootRun } from './bootpath.js'
import { pinFindings } from './pins.js'
import { traceFindings } from './instrument.js'
import { packRun } from './packs/index.js'
import { lrsFindings } from './xapi.js'

const where = f => f ? `${f.fn || '(anonymous)'} ${f.url ? f.url.replace(/^lab:\/\/(?:run|content)\/pkg\//, '') : ''}:${f.line}` : ''
const short = u => (u || '').replace(/^lab:\/\/(?:run|content)\/pkg\//, '')
const API_NAME = { '1.2': 'API', '2004': 'API_1484_11' }
const SUSPEND_MAX = { '1.2': 4096, '2004': 64000 }

export function staticFindings(a) {
  const out = []
  if (!a) return out
  const sev = { 'no-manifest': 'error', 'manifest-xml': 'error', 'launch-missing': 'error', 'launch-case': 'error', 'manifest-case': 'error',
    'file-missing': 'warn', 'manifest-not-root': 'warn', 'launch-remote': 'warn', 'no-sco': 'warn',
    'course-case': 'error', 'course-not-root': 'error', 'no-au': 'error', 'cmi5-moveon': 'error' }   // (cmi5 and Tin Can course files, P4.5)
  const autofix = { 'manifest-case': 1, 'manifest-not-root': 1, 'file-missing': 1, 'launch-case': 'case' }   // problem code → the autofix that addresses it (src/fixes.js)
  for (const p of a.problems) out.push({ sev: sev[p.code] ?? 'warn', title: p.text, evidence: [], fix: '', ...(autofix[p.code] && { autofix: { id: autofix[p.code] === 1 ? p.code : autofix[p.code], params: {} } }) })
  const m = a.manifest
  const scorm = (a.format ?? 'scorm') === 'scorm'
  if (m && scorm && a.apiUse !== 'none' && a.apiUse !== 'both' && a.apiUse !== m.version)
    out.push({ sev: 'error', title: `The manifest says SCORM ${m.version}, but the scripts use the SCORM ${a.apiUse} API`,
      detail: `An LMS offers only ${API_NAME[m.version]} for a SCORM ${m.version} package, and the content looks for ${API_NAME[a.apiUse]}, so it finds no LMS.`,
      evidence: evidenceFrom(a.scan, a.apiUse === '1.2' ? 'api12' : 'api04', 3),
      fix: `Republish for SCORM ${m.version}, or correct <schemaversion> in imsmanifest.xml to match the content (${a.apiUse === '1.2' ? '1.2' : '2004 4th Edition'}). Check with the Both APIs profile.`,
      autofix: { id: 'manifest-version', params: { to: a.apiUse } } })
  if (m && a.apiUse === 'none' && m.items.some(i => i.type === 'sco'))
    out.push({ sev: 'warn', title: 'No script in the package mentions the SCORM API',
      detail: 'The SCOs may load their LMS code from somewhere else (a server or another site), or build the names at run time.',
      evidence: evidenceFrom(a.scan, 'absolute', 5).concat(evidenceFrom(a.scan, 'serverPaths', 5)), fix: 'Run it and look at the API lookups and the network requests.' })
  const absolute = evidenceFrom(a.scan, 'absolute', 8), server = evidenceFrom(a.scan, 'serverPaths', 8)
  if (server.length) out.push({ sev: 'warn', title: 'Scripts ask for paths at the root of the server',
    detail: 'Server-relative paths such as /api/… work only on a host that serves them, which is typical of content exported from an authoring platform that still expects that platform.',
    evidence: server, fix: 'Run it: failed requests to these paths confirm it. The export usually has a setting for standalone or LMS packages.' })
  if (absolute.length) out.push({ sev: 'info', title: 'Scripts refer to other sites', detail: 'The content may depend on these being reachable from the learner’s browser.', evidence: absolute, fix: '' })
  const defines = evidenceFrom(a.scan, 'apiDefine', 6)
  if (defines.length) out.push({ sev: 'warn', title: 'Scripts create their own SCORM API object',
    detail: 'Content that defines window.API or API_1484_11 itself (for preview, offline or standalone use) may talk to that instead of the LMS.',
    evidence: defines, fix: 'Run it: if the content sets its own API, find the condition that makes it do so.' })
  const domain = evidenceFrom(a.scan, 'domainSet', 6)
  if (domain.length) out.push({ sev: 'warn', title: 'Scripts set document.domain',
    detail: 'Browsers now ignore setting document.domain (origin-keyed agent clusters: Chrome 115 and later, and other browsers), so content that relies on it to reach the LMS across frames breaks. If it works the value out with a regex on the address, that can also throw on a host it did not expect, and the rest of that script block is skipped.',
    evidence: domain, fix: 'Take the assignment out, or make sure the content does not need it: it should find the LMS API through window.parent or window.opener, which work without it.' })
  const modes = evidenceFrom(a.scan, 'modeSwitches', 8)
  if (modes.length) out.push({ sev: 'info', title: 'Scripts have mode switches (preview, standalone, LMS…)', detail: 'Content that behaves differently on its authoring host and in an LMS usually decides here.', evidence: modes, fix: '' })
  out.push(...a.packFindings ?? [])
  if (a.fingerprints.length) out.push({ sev: 'info', title: `Made with ${a.fingerprints.join(', ')}`, evidence: [], fix: '' })
  return out
}
function evidenceFrom(scan, key, max) {
  const out = []
  for (const [file, s] of Object.entries(scan ?? {})) for (const x of s[key] ?? []) { if (out.length >= max) return out; out.push(`${file}:${x.line}  ${x.text}`) }
  return out
}

// launch: { kind: 'package' | 'reference', version, expose ('1.2' | '2004' | 'both' | 'none'), itemType }
export function runFindings(trace, launch = {}, analysis = null) {
  const out = [], probe = trace.probe ?? []
  const allApi = probe.filter(p => p.type === 'api'), lookups = probe.filter(p => p.type === 'lookup')
  // In a package run, calls the probe logged (host: true) went to an API object that isn't Package Lab's LMS.
  const shim = launch.kind === 'package' ? allApi.filter(c => c.host) : [], api = allApi.filter(c => !shim.includes(c))
  const contentAssigns = launch.kind === 'package' ? probe.filter(p => p.type === 'assign' && !isLab(p.frame)) : []
  const pkgReq = trace.requests.filter(r => !isLab(r.url) && !isLrs(r.url, trace) && !/^(data|blob):/.test(r.url))
  const failed = pkgReq.filter(r => r.failed && !r.canceled || r.status >= 400)
  const firstApi = api[0]?.t ?? Infinity
  const errors = [...trace.exceptions.map(e => ({ ...e, uncaught: true })), ...(trace.caught ?? []).filter(c => !c.uncaught)]
  const uncaughtBefore = trace.exceptions.filter(e => e.t < firstApi)

  if (launch.kind === 'package' && launch.itemType === 'sco') {
    if (!api.length && !lookups.length)
      out.push({ sev: 'error', title: 'The content never looked for the SCORM API',
        detail: 'Not on its own window, a parent or the opener. Its LMS code never ran: it failed before reaching it, wasn’t loaded, or the content took a path that doesn’t use the LMS (a preview or standalone mode, or a server).',
        evidence: [...uncaughtBefore.slice(0, 3).map(e => `Uncaught: ${e.text} at ${where(e.at[0]) || short(e.url) + ':' + e.line}`),
          ...failed.slice(0, 5).map(r => `Failed: ${r.method} ${short(r.url)} (${r.status ?? r.failed})`)],
        fix: 'Check the uncaught errors and failed requests listed here first, then the Boot path tab for the first file the content never asked for.' })
    // Lookups another origin refused have their own finding (originFindings), which says why nothing was found.
    else if (!api.length && !shim.length && !probe.some(p => p.type === 'lookup-blocked' && /^API(_1484_11)?$/.test(p.name))) {
      const names = [...new Set(lookups.map(l => l.name))], found = lookups.some(l => l.found)
      out.push({ sev: 'error', title: found ? 'The content found the API but never called it' : `The content looked for ${names.join(' and ')} and found nothing`,
        detail: found ? 'Something after the lookup stopped it: see the errors after the first lookup.'
          : launch.expose && !names.some(n => n === API_NAME[launch.expose] || launch.expose === 'both') ? `This run offered ${launch.expose === 'none' ? 'no API' : API_NAME[launch.expose]}: the package and its manifest disagree on the SCORM version.`
            : 'It looked in frames where the LMS hadn’t put the API: check the lookups’ frames and the frame depth.',
        evidence: lookups.slice(0, 6).map(l => `${l.name} ${l.found ? 'found' : 'missing'} on ${short(l.frame)} from ${l.stack?.[0] ?? '?'}`),
        fix: found ? 'Look at the first error after the lookup.' : 'Launch again with the Both APIs profile. If calls appear, the SCORM version is the cause.' })
    }
  }
  // Notes from the macro player (main.js, E1.1).
  for (const n of probe.filter(p => p.type === 'macro-size'))
    out.push({ sev: 'info', title: `The macro was recorded at ${n.recorded.width}×${n.recorded.height} and played at ${n.used.width}×${n.used.height}: clicks may miss`,
      detail: 'A macro’s clicks are positions across the window. This run has a device size of its own, which wins over the size the macro was recorded at.',
      evidence: [], fix: 'Run with the device size set to “Window as it is” to play the macro at its own size, or record it again at this size.' })
  const anchors = probe.filter(p => p.type === 'macro-anchor')
  if (anchors.length) out.push({ sev: 'info', title: `${anchors.length} click${anchors.length === 1 ? '' : 's'} didn’t find ${anchors.length === 1 ? 'its' : 'their'} element and used ${anchors.length === 1 ? 'its' : 'their'} recorded position`,
    detail: 'A macro click that knows its element looks for it first and clicks wherever it is now. When that element wasn’t on the page (or more than one matched, or it couldn’t be seen), the click went to the position it was recorded at, which may be somewhere else at this window size.',
    evidence: anchors.slice(0, 8).map(n => `step ${n.event + 1}: ${n.found ? n.found + ' elements matched' : 'no element found'}`), fix: 'Record the macro again on this version of the content, or edit the click’s target in the macro file.' })
  for (const n of probe.filter(p => p.type === 'macro-wait')) {
    const w = n.for ?? {}, what = w.text !== undefined ? `“${w.text}” and it never appeared` : w.milestone ? `the step “${w.milestone}” and the run never reached it` : `the network to be quiet for ${w.quiet} ms and it never was`
    out.push({ sev: 'warn', title: `The macro stopped at step ${n.event + 1}: waited ${+(n.waited / 1000).toFixed(1)} s for ${what}`,
      detail: 'The macro waits for what its wait step names and plays nothing after it if that doesn’t happen in time. The clicks and keys after it were not played.',
      evidence: [], fix: 'Lengthen the wait step’s timeout, or check the step before it: it may not have done what the next one waits for.' })
  }
  if (contentAssigns.length)
    out.push({ sev: shim.length ? 'error' : 'warn', title: 'The content set its own window.API or API_1484_11',
      detail: 'Content that brings its own API object (a preview or standalone shim) talks to that instead of the LMS, so nothing is saved.' +
        (shim.length ? ` ${shim.length} API call${shim.length > 1 ? 's' : ''} went to it.` : ''),
      evidence: [...contentAssigns.slice(0, 4).map(a => `${a.name} = ${a.kind} {${a.keys.join(', ')}} in ${short(a.frame)} from ${a.stack?.[0] ?? '?'}`),
        ...shim.slice(0, 4).map(c => `${c.call}(${c.el}) → ${c.result} on the content’s own object`)],
      fix: 'Find the setting that makes the content create it (often a preview, offline or standalone flag) and turn it off in the export.' })
  if (launch.kind === 'package') out.push(...originFindings(probe, launch.profile), ...storageFindings(trace))
  for (const f of probe.filter(p => p.type === 'frame' && !isLab(p.frame)).slice(0, 3))
    if (!f.topReachable) out.push({ sev: 'info', title: 'The content’s top window is on another site', detail: 'Wrappers that search window.top fail here.', evidence: [short(f.frame)], fix: '' })

  if (failed.length) {
    const server = failed.filter(r => /^lab:\/\/(?:run|content)\/(?!pkg\/)/.test(r.url))
    if (server.length) out.push({ sev: 'error', title: 'The content asked the host for files outside the package',
      detail: 'These paths start at the root of the server, so they only work on the platform the content was made for.',
      evidence: server.slice(0, 8).map(r => `${r.method} ${new URL(r.url).pathname} from ${where(r.from?.[0])}`),
      fix: 'Export as a standalone SCORM package (all files inside), or find the setting that points the content at its own folder.' })
    const rest = failed.filter(r => !server.includes(r))
    if (rest.length) out.push({ sev: 'warn', title: `${rest.length} request${rest.length > 1 ? 's' : ''} failed`, evidence: rest.slice(0, 10).map(r => `${r.method} ${short(r.url)} → ${r.status ?? r.failed} from ${where(r.from?.[0])}`), fix: '' })
  }
  if (launch.kind === 'package') out.push(...pinFindings(trace, launch.options), ...traceFindings(trace))
  if (trace.exceptions.length)
    out.push({ sev: 'warn', title: `${trace.exceptions.length} uncaught error${trace.exceptions.length > 1 ? 's' : ''}`, evidence: trace.exceptions.slice(0, 6).map(e => `${e.text}  at ${where(e.at[0]) || short(e.url) + ':' + e.line}`), fix: '' })
  const csp = (trace.log ?? []).filter(l => /Content Security Policy|Refused to/i.test(l.text))
  if (csp.length) out.push({ sev: 'warn', title: 'The browser refused to load or run something', evidence: csp.slice(0, 5).map(l => l.text), fix: '' })
  if (errors.length > trace.exceptions.length && !trace.exceptions.length && !api.length)
    out.push({ sev: 'info', title: `${errors.length} errors were thrown and caught`, detail: 'Caught errors can hide the real failure: content that catches its own LMS errors fails silently.', evidence: (trace.caught ?? []).slice(0, 5).map(c => `${c.text} at ${where(c.at[0])}`), fix: '' })

  // Progress: what the content did with the data model.
  if (api.length) {
    const calls = n => api.filter(c => c.call === n), sets = el => api.filter(c => /SetValue$/.test(c.call) && c.el === el)
    const v = api[0].version, init = calls(v === '1.2' ? 'LMSInitialize' : 'Initialize'), fin = calls(v === '1.2' ? 'LMSFinish' : 'Terminate')
    const errs = api.filter(c => c.result === 'false' || c.err > 0)
    if (errs.length) out.push({ sev: 'warn', title: `${errs.length} API call${errs.length > 1 ? 's' : ''} failed`, evidence: errs.slice(0, 8).map(c => `${c.call}(${c.el}${c.value !== undefined ? ', ' + String(c.value).slice(0, 60) : ''}) → error ${c.err}${c.diag ? ': ' + c.diag : ''}`), fix: 'An LMS rejects the same values: the content’s data won’t be saved.' })
    if (init.length && !fin.length) out.push({ sev: 'warn', title: `The content never called ${v === '1.2' ? 'LMSFinish' : 'Terminate'}`, detail: 'Many LMSs only save the session when it ends properly. (It may have been closed before it got the chance: close it with the Stop button after leaving the course the normal way.)', evidence: [], fix: '' })
    if (init.length && !calls(v === '1.2' ? 'LMSCommit' : 'Commit').length) out.push({ sev: 'info', title: 'The content never committed', detail: 'Without commits, progress is lost if the browser closes before the session ends.', evidence: [], fix: '' })
    const sd = sets('cmi.suspend_data').at(-1)
    const max = launch.profile?.limits?.[v === '1.2' ? 'suspend12' : 'suspend2004'] || SUSPEND_MAX[v]   // an LMS profile's own limit (P2.1)
    if (sd && String(sd.value).length > max * 0.8) out.push({ sev: String(sd.value).length > max ? 'error' : 'warn', title: `Suspend data is ${String(sd.value).length.toLocaleString()} characters`, detail: `${max === SUSPEND_MAX[v] ? `SCORM ${v}` : `This LMS profile (${launch.profile.name})`} allows ${max.toLocaleString()}; LMSs truncate or reject more, and the course then can’t resume.`, evidence: [], fix: v === '1.2' ? 'Publish as SCORM 2004 (64,000 characters), or reduce what the content saves.' : 'Reduce what the content saves.' })
    if (init.length && !sets(v === '1.2' ? 'cmi.core.exit' : 'cmi.exit').length) out.push({ sev: 'info', title: 'The content never set exit', detail: 'Without exit set to suspend, many LMSs start a new attempt next time instead of resuming.', evidence: [], fix: '' })
    if (init.length && !sets(v === '1.2' ? 'cmi.core.lesson_status' : 'cmi.completion_status').length) out.push({ sev: 'info', title: 'The content never reported completion', evidence: [], fix: '' })
  }
  if (trace.lrs) out.push(...lrsFindings(trace.lrs))   // cmi5 and Tin Can (P4.5)
  if (launch.kind === 'package' && analysis) out.push(...packRun(analysis, trace, launch))
  return out
}

// Content on another origin than the LMS (P2.1): lookups of the API the browser refused, and a sandbox without
// allow-same-origin (an opaque origin, so the same refusals). profile is the run's resolved LMS profile (launch.profile).
export function originFindings(probe, profile) {
  const out = [], blocked = probe.filter(p => p.type === 'lookup-blocked' && /^API(_1484_11)?$/.test(p.name))
  const sandbox = profile?.frames?.sandbox ?? null, words = sandbox === null ? [] : sandbox.split(/\s+/)
  const opaque = probe.filter(p => p.type === 'frame' && !isLab(p.frame) && p.origin === 'null')
  if (blocked.length) out.push({ sev: 'error', title: 'The content can’t reach the LMS from another origin',
    detail: `The content runs on ${opaque.length ? 'an opaque origin of its own (a sandbox)' : `another origin (${originOf(blocked[0].frame)})`} than the LMS window that holds the API. The browser refused its lookups of the API through parent, top or opener with a SecurityError, so it can’t find the LMS. Some LMSs serve content from a separate domain or CDN, which does this.`,
    evidence: blocked.slice(0, 6).map(b => `${b.name} blocked${b.uncaught ? ' (uncaught)' : ''} in ${short(b.frame)} at ${b.stack?.[0] ?? '?'}`),
    fix: 'The LMS and the content must share an origin: have the LMS serve the package from its own domain. Otherwise the content needs a cross-domain wrapper that talks to the LMS with postMessage (some LMSs offer one for content on another domain).' })
  if (sandbox !== null && !words.includes('allow-same-origin') || opaque.length) out.push({ sev: 'error', title: 'The LMS frame’s sandbox has no allow-same-origin',
    detail: `The frame holding the content has a sandbox attribute without allow-same-origin, so the content gets an opaque origin of its own: it can’t reach the LMS’s API on its parent, top or opener, and can’t keep cookies or storage.${sandbox !== null && !words.includes('allow-scripts') ? ' Without allow-scripts, none of its scripts run at all.' : ''}`,
    evidence: [...sandbox !== null ? [`sandbox="${sandbox}"`] : [], ...opaque.slice(0, 3).map(f => `${short(f.frame)} has origin null`)],
    fix: 'Add allow-same-origin and allow-scripts to the sandbox in the LMS’s settings or player template, or remove the sandbox.' })
  return out
}
// Storage the browser can block (P2.2): the accesses the probe refused in a run with storage blocked (a `storage-blocked`
// probe report each, with the stack), and, of the uncaught errors, those they caused.
export function storageFindings(trace) {
  const hits = (trace.probe ?? []).filter(p => p.type === 'storage-blocked')
  if (!hits.length) return []
  const kinds = [...new Set(hits.map(h => h.what))], thrown = (trace.exceptions ?? []).filter(e => /SecurityError|operation is insecure/.test(e.text))
  return [{ sev: 'warn', title: 'The content needs storage the browser can block',
    detail: `This run blocked storage in the content’s frames, as Safari and some other browsers do for content that sits inside another site’s page (an LMS on another domain): ${kinds.join(', ')}. The content asked for it, so it may not work there.` +
      (thrown.length ? ` ${thrown.length} uncaught error${thrown.length > 1 ? 's' : ''} came from it, so the content stopped at the first.` : ' It handled the refusal, or it didn’t need the result.'),
    evidence: [...new Set(hits.map(h => `${h.what} in ${short(h.frame)} at ${h.stack?.[0] ?? '?'}`))].slice(0, 8),
    fix: 'Keep the course’s state in the LMS (cmi.suspend_data) instead of the browser, or wrap each use of localStorage, sessionStorage, cookies and indexedDB in try/catch with a fallback in memory. Run the content again with Storage set to normal to see the difference.' }]
}
const originOf = u => /^[a-z][\w+.-]*:\/\/[^/]*/i.exec(u ?? '')?.[0] ?? 'unknown'

export function compareFindings(cmp) {
  const out = []
  if (!cmp) return out
  if (cmp.firstDivergence) {
    const d = cmp.firstDivergence
    out.push({ sev: 'error', title: 'First difference from the working run', detail: `${d.kind === 'script' ? 'The reference loaded a script the run never loaded' : d.kind === 'request' ? 'The reference made a request the run never made' : 'A request that worked in the reference failed in the run'}, ${(d.t / 1000).toFixed(1)} s in.`,
      evidence: [d.text, ...(d.item.from ?? d.item.ref?.from ?? []).slice(0, 4).map(where).map(s => 'from ' + s)], fix: 'Look at the code that made it (the first “from” line) in the reference: what it needed, the run lacked.' })
  }
  const c = cmp.coverage
  if (c?.branchesOnlyRun.length || c?.branchesOnlyRef.length)
    out.push({ sev: 'warn', title: 'Branches that went differently', detail: 'The same code, taking a different path in each run. The earliest in the loading order is usually where the content decided it wasn’t where it expected.',
      evidence: [...c.branchesOnlyRef.slice(0, 6).map(b => `only in reference: ${short(b.url)}:${b.line} in ${b.fn}  ${b.text.trim().slice(0, 120)}`),
        ...c.branchesOnlyRun.slice(0, 6).map(b => `only in run: ${short(b.url)}:${b.line} in ${b.fn}  ${b.text.trim().slice(0, 120)}`)], fix: '' })
  if (c?.differentFiles.length) out.push({ sev: 'info', title: `${c.differentFiles.length} script${c.differentFiles.length > 1 ? 's differ' : ' differs'} between the runs`, detail: 'The hosted copy isn’t the same file as the package’s, so their code can’t be compared line by line.', evidence: c.differentFiles.slice(0, 5).map(f => short(f.run)), fix: '' })
  if (cmp.exceptions.onlyRun.length) out.push({ sev: 'warn', title: 'Errors only in the run', evidence: cmp.exceptions.onlyRun.slice(0, 6).map(e => `${e.text} at ${where(e.at[0])}`), fix: '' })
  if (cmp.api.ref && !cmp.api.run) out.push({ sev: 'error', title: `The reference made ${cmp.api.ref} API calls; the run made none`, evidence: cmp.api.refFirst.map(c => `${c.call}(${c.el ?? ''})`), fix: '' })
  return out
}

// Launch: did the content load and show anything, and if not, what along its loading path went wrong. boot is the
// static boot graph of the launch page (bootpath.js).
export function launchFindings(trace, boot) {
  const out = []
  if (!boot) return out
  const nodes = bootRun(boot, trace), probe = trace.probe ?? []
  const content = probe.filter(p => p.type === 'dom' && !isLab(p.frame))
  const last = [...new Map(content.map(d => [d.frame, d])).values()]
  const secs = ((trace.duration ?? 0) / 1000).toFixed(0)
  const root = nodes[0]

  // Why, in loading order: each candidate cause found in the run.
  const why = []
  const pkgFailed = trace.requests.filter(r => /^lab:\/\/(?:run|content)\/pkg\//.test(r.url) && (r.status >= 400 || r.failed && !r.canceled))
  for (const r of pkgFailed.slice(0, 6)) why.push(`Not found: ${short(r.url)} (${r.status ?? r.failed}) from ${where(r.from?.[0]) || '?'}`)
  const serverFailed = trace.requests.filter(r => /^lab:\/\/(?:run|content)\/(?!pkg\/|__lab\/)/.test(r.url) && !isLrs(r.url, trace))
  for (const r of serverFailed.slice(0, 4)) why.push(`Asked the server for ${new URL(r.url).pathname} (outside the package) from ${where(r.from?.[0]) || '?'}`)
  const ex = [...trace.exceptions].sort((a, b) => a.t - b.t)
  ex.slice(0, 3).forEach((e, i) => why.push(`${i ? 'Then' : 'First'} uncaught error at ${(e.t / 1000).toFixed(1)} s: ${e.text} at ${where(e.at[0]) || short(e.url) + ':' + e.line}`))
  for (const l of (trace.log ?? []).filter(l => /Refused to|Content Security Policy|MIME type|Failed to load module|Mixed Content|Blocked/i.test(l.text)).slice(0, 4)) why.push(`Browser: ${l.text.slice(0, 220)}`)
  const pending = trace.requests.filter(r => r.status == null && !r.failed && !/^(data|blob):/.test(r.url))
  for (const r of pending.slice(0, 4)) why.push(`Still waiting at the end for ${short(r.url)} (asked at ${(r.t / 1000).toFixed(1)} s)`)
  for (const r of boot.risks.filter(r => r.sev === 'error').slice(0, 4)) why.push(`From the files: ${r.title}`)
  const hidden = last.filter(d => d.hidden)
  for (const d of hidden.slice(0, 2)) why.push(`${short(d.frame)} is hidden by its own style (display, visibility or opacity): the content hides itself until start-up finishes, and start-up never finished`)
  const loaders = last.filter(d => d.loader)

  if (!content.length) {
    const r = root?.run
    out.push({ sev: 'error', title: r?.status >= 400 || r?.failed ? `The launch page ${boot.start} wasn’t found` : !r ? `The launch page ${boot.start} was never requested` : `The launch page ${boot.start} never got as far as showing anything`,
      detail: !r ? 'The LMS frame never loaded it: check the manifest’s launch path and parameters.' : r.status >= 400 || r.failed ? 'The address the manifest gives doesn’t match a file in the package.' : 'It was served but never finished being parsed: a script on it blocked or the page replaced itself.',
      evidence: why.slice(0, 12), fix: why.length ? 'Start with the first line above.' : '' })
  } else if (last.every(d => (d.text ?? 0) < 20 && !d.media)) {
    const loader = loaders[0]
    out.push({ sev: 'error', title: loader ? `The content is stuck on a loading screen (${loader.loader})` : 'The content shows a blank page',
      detail: `${secs} s after launch, no frame of the content shows text or images${loader ? ', only a loading indicator' : ''}. Below, in loading order, is what went wrong on the way.${why.length ? '' : ' Nothing failed outright: the content is waiting for something (see the loading path for what it never asked for, and the API lookups for an LMS it didn’t find).'}`,
      evidence: [...why, ...last.slice(0, 4).map(d => `${short(d.frame)}: ${d.readyState}, ${d.visible} visible elements, ${d.frames} frames, text “${d.sample ?? ''}”`)].slice(0, 16),
      fix: why.length ? 'Fix the first cause listed; later ones often follow from it.' : 'Look at the Boot path tab for the first file it never asked for, and what was meant to ask for it.' })
  } else if (loaders.length && last.every(d => (d.text ?? 0) < 200))
    out.push({ sev: 'warn', title: `The content may be stuck on a loading screen (${loaders[0].loader})`, detail: 'A loading indicator was still showing at the end.', evidence: why.slice(0, 10), fix: '' })

  // The loading path: files the pages and scripts that did load were meant to load, but never asked for.
  const requested = n => n.run && !n.run.failed && !(n.run.status >= 400)
  const parents = new Set(nodes.filter(requested).map(n => n.path))
  const skipped = nodes.filter((n, i) => i && n.status === 'ok' && !n.run && parents.has(n.from) && n.kind !== 'asset' && n.how !== 'literal')
  const tags = skipped.filter(n => n.how === 'tag')
  if (skipped.length) out.push({ sev: tags.length ? 'error' : 'warn', title: tags.length ? `Loading stopped part way through ${tags[0].from}` : 'Code that loads the next part of the content never ran',
    detail: tags.length ? 'The page names these in its own tags but the browser never asked for them: parsing stopped before reaching them (a script that blocked, threw during document.write, or navigated away).'
      : 'Scripts that did load contain code to load these, but it never ran: the content took another path, or stopped, before getting there. The first is where to look.',
    evidence: skipped.slice(0, 10).map(n => `${n.path} (${n.how}${n.kind ? ' ' + n.kind : ''}), from ${n.from}:${n.line}`), fix: 'Look at the code around the first line, and what it waits for.' })
  return out
}

const RANK = { error: 0, warn: 1, info: 2 }
export const sortFindings = fs => fs.sort((a, b) => RANK[a.sev] - RANK[b.sev])
