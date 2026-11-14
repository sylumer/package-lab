// What every browser's run shares, in plain Node (no Electron): the files the test LMS serves for a launch, the launch
// plan (the test LMS's configuration, the content's address, headers, label) and the findings a finished run gets.
// src/main.js (Electron runs) and src/webkit-runner.js (WebKit runs, P2.3) both build on it. See docs/developer-guide.md.
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { normaliseOptions, viewportName } from './options.js'
import { overlayFiles, overrideFinding, overrideProgressFinding } from './overlay.js'
import { staticFindings, runFindings, launchFindings, sortFindings } from './rules.js'
import { milestones, milestoneFinding, runCounts } from './milestones.js'
import { stall, stallFinding } from './stall.js'
import { launchProfile, apiAt, fillParams, storageMode } from './profiles.js'

// ---- Serving ----
export const HOST_FILES = new Set(['host.html', 'host.js', 'wrap.html', 'scorm-runtime.js'])
const MIME = { html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json',
  xml: 'application/xml', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', vtt: 'text/vtt',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', pdf: 'application/pdf', txt: 'text/plain', wasm: 'application/wasm' }
export const mime = name => (MIME[extname(name).slice(1).toLowerCase()] ?? 'application/octet-stream') + (/^(html?|js|mjs|css|json|xml|svg|txt|vtt)$/i.test(extname(name).slice(1)) ? '; charset=utf-8' : '')

// One request to the test LMS or the package: { path (decoded), lms (is it the LMS's own origin), range (the Range header),
// config, files (Map path → Buffer), headers (the profile's, on package files), file (path, buffer → buffer: a traced run
// instruments here) } → { status, headers, body (Buffer | string) }.
export function serveRequest({ path, lms, range = '', config, files, headers: pkgHeaders = {}, file: map = (_, b) => b }) {
  const headers = { 'Cache-Control': 'no-store' }
  if (path.startsWith('/__lab/') && lms) {
    const name = path.slice(7)
    if (name === 'config.json') return { status: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(config) }
    if (HOST_FILES.has(name)) return { status: 200, headers: { ...headers, 'Content-Type': mime(name) }, body: readFileSync(new URL('./host/' + name, import.meta.url)) }
  }
  if (path.startsWith('/pkg/')) {
    const p = path.slice(5), file = files.get(p) ?? (p === '' || p.endsWith('/') ? files.get(p + 'index.html') : undefined)
    const buf = file && map(files.has(p) ? p : p + 'index.html', file)
    if (buf) {
      Object.assign(headers, pkgHeaders)
      headers['Content-Type'] = mime(p); headers['Accept-Ranges'] = 'bytes'
      const r = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (r && (r[1] || r[2])) {
        const size = buf.length, start = r[1] ? +r[1] : Math.max(0, size - +r[2]), end = r[1] && r[2] ? Math.min(+r[2], size - 1) : size - 1
        if (start >= size || start > end) return { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` }, body: '' }
        return { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}` }, body: buf.subarray(start, end + 1) }
      }
      return { status: 200, headers, body: buf }
    }
  }
  return { status: 404, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }, body: `${path} isn’t in the package.` }
}

// ---- The launch plan ----
// The same in every browser except where the content's address points: origins is { lms, content } (lab://run and
// lab://content in Electron; https://lab.invalid and https://content.invalid in WebKit). launch.url stays in lab:// form
// in every browser, so findings and saved runs read the same.
export const LAB_ORIGINS = { lms: 'lab://run', content: 'lab://content' }
export const WEBKIT_ORIGINS = { lms: 'https://lab.invalid', content: 'https://content.invalid' }
const LEARNER = { id: 'learner-1', name: 'Learner, Test' }

// pkg: { name, files, analysis }. cmi is data to resume from. Throws on bad options or an item with nothing to launch.
export function launchPlan({ pkg, item: itemIndex, cmi: givenCmi, options, pkgOverrides, origins = LAB_ORIGINS }) {
  if (!pkg?.analysis.manifest) throw new Error('Open a package with a manifest first.')
  const o = normaliseOptions({ ...options, files: options?.files ?? pkgOverrides })   // no files given: the session's overrides
  const m = pkg.analysis.manifest, item = m.items[itemIndex]
  if (!item?.res) throw new Error('That item has nothing to launch.')
  const res = item.res, files = overlayFiles(pkg.files, o.files), prof = launchProfile(o)
  const path = res.path ? '/pkg/' + res.path.split('/').map(encodeURIComponent).join('/') + res.query : null
  let url = path ? `${prof.contentOrigin === 'other' ? 'lab://content' : 'lab://run'}${path}` : res.href, shown = path ? (prof.contentOrigin === 'other' ? origins.content : origins.lms) + path : res.href
  const expose = !o.expose || o.expose === 'manifest' ? m.version : o.expose
  const cmi = givenCmi ?? null
  // The manifest's parameters, then the profile's (placeholders filled in), then the launch option's.
  const params = [item.params.replace(/^[?&]/, ''), fillParams(prof.launchParams, { scoid: item.id, attempt: cmi ? 2 : 1, learner: LEARNER.id }), o.launchParams]
  for (const q of params.filter(Boolean)) { url += (url.includes('?') ? '&' : '?') + q; shown += (shown.includes('?') ? '&' : '?') + q }
  const config = { expose, depth: prof.frames.depth, opener: prof.launch === 'popup', launch: shown, cmi, frames: prof.frames, popupDelay: prof.popupDelay, apiDelay: prof.apiDelay, apiAt: apiAt(prof),
    runtime: { edition: m.edition === '2nd' ? '2nd edition' : '', learner: LEARNER, credit: 'credit', mode: 'normal', limits: prof.limits, commit: prof.commit, slowMs: prof.slowMs,
      launchData: item.launchData, mastery: item.mastery, maxTime: item.maxTime, timeLimitAction: item.timeLimitAction, completionThreshold: item.completionThreshold } }
  const launch = { version: m.version, expose, depth: config.depth, opener: config.opener, item: item.title || item.id, itemIndex, itemType: item.type, url, resume: !!cmi, options: o, profile: prof, storage: storageMode(o) }
  const headers = { ...prof.headers, ...(prof.csp ? { 'Content-Security-Policy': prof.csp } : {}) }
  const label = `${pkg.name} · ${item.title || item.id} · ${expose === 'both' ? 'both APIs' : expose === 'none' ? 'no API' : 'SCORM ' + expose}${prof.name !== 'generic' ? ' · ' + prof.name : ''}${launch.storage !== 'normal' ? ' · storage ' + launch.storage : ''}${config.depth ? ' · depth ' + config.depth : ''}${config.opener ? ' · window' : ''}${cmi ? ' · resumed' : ''}${o.browser !== 'chromium' ? ' · ' + o.browser : ''}${o.viewport ? ' · ' + viewportName(o.viewport) : ''}`
  return { o, item, res, files, prof, config, launch, headers, label }
}

// ---- A finished run's findings ----
// Milestones (package runs only) and the findings with the "Got as far as" note first.
// A run that used overrides also gets a note saying so, and, if there is an earlier run of the item without them, whether the change helped.
export function withProgress(kind, trace, boot, findings, launch, before) {
  if (kind !== 'package') return { findings: sortFindings(findings), milestones: null }
  const ms = milestones(trace, boot), over = overrideFinding(launch?.options?.files)
  const helped = over && before && overrideProgressFinding(before, { milestones: ms, counts: runCounts(trace) })
  // "Was waiting for" goes under the blank-page or loading-screen finding when there is one, else it sorts with the warnings.
  const waiting = stallFinding(stall(trace, ms)), sorted = sortFindings(findings), at = sorted.findLastIndex(f => /blank page|loading screen/.test(f.title))
  if (waiting && at >= 0) sorted.splice(at + 1, 0, waiting)
  else if (waiting) { sorted.push(waiting); sortFindings(sorted) }
  return { findings: [milestoneFinding(ms), ...(over ? [over] : []), ...(helped ? [helped] : []), ...sorted], milestones: ms }
}
// The findings and milestones of a run just recorded. analysis is the package's (the static findings come from it).
export const runAnalysis = ({ kind, launch, trace, boot, analysis, before }) =>
  withProgress(kind, trace, boot, [...launchFindings(trace, boot), ...runFindings(trace, { kind, ...launch }), ...(kind === 'package' ? [...staticFindings(analysis), ...(boot?.risks ?? [])] : [])], launch, before)
// A run as saved to disk: what Open saved… and the CLI read back. See docs/developer-guide.md for the format.
export const savedRun = r => ({ format: 'scorm-lab-run', version: 1, kind: r.kind, label: r.label, package: r.package, launch: r.launch, trace: r.trace, boot: r.boot, findings: r.findings, milestones: r.milestones })
