// cmi5 and Tin Can (xAPI) packages (P4.5): the course structure files (cmi5.xml, tincan.xml), the launch URL each format
// uses, the LMS.LaunchData state document, and the cmi5 rules a run's statements must follow. Pure: no Electron, no files.
// See docs/developer-guide.md ("cmi5 and xAPI") for the formats.
import { xmlTree, xKid, xKids, xFind } from './xml.js'

export const CMI5_VERBS = ['initialized', 'completed', 'passed', 'failed', 'terminated', 'abandoned', 'waived', 'satisfied', 'launched']
export const VERB = name => `http://adlnet.gov/expapi/verbs/${name}`
export const CATEGORY = 'https://w3id.org/xapi/cmi5/context/categories/cmi5'
export const SESSIONID = 'https://w3id.org/xapi/cmi5/context/extensions/sessionid'
export const MOVE_ON = ['Passed', 'Completed', 'CompletedAndPassed', 'CompletedOrPassed', 'NotApplicable']
export const LAUNCH_METHODS = ['AnyWindow', 'OwnWindow']
// What kind of package an analysis is, in words: 'SCORM 2004 4th edition', 'cmi5', 'Tin Can (xAPI)', or 'none' with no manifest.
export const formatName = a => a?.format === 'cmi5' ? 'cmi5' : a?.format === 'tincan' ? 'Tin Can (xAPI)' : a?.manifest ? `SCORM ${a.manifest.version}${a.manifest.edition ? ' ' + a.manifest.edition + ' edition' : ''}` : 'none'
export const isIri = s => typeof s === 'string' && /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/.test(s)

const langText = n => !n ? '' : xFind(n, 'langstring')?.text ?? n.text
const text = (n, name) => xKid(n, name)?.text ?? ''

// cmi5.xml → { format: 'cmi5', id, title, description, aus: [{ id, title, url, moveOn, masteryScore, launchMethod, launchParameters,
// entitlementKey, activityType, depth, blocks (titles of the blocks it is in) }] }. Throws on XML that isn't well formed.
export function parseCmi5(xml) {
  const tree = xmlTree(xml)
  if (!/^courseStructure$/i.test(tree.name)) throw new Error(`The root element is <${tree.name}>, not <courseStructure>.`)
  const course = xKid(tree, 'course'), aus = []
  const walk = (n, depth, blocks) => {
    for (const k of n.kids) {
      if (/^block$/i.test(k.name)) walk(k, depth + 1, [...blocks, langText(xKid(k, 'title')) || k.attrs.id || ''])
      else if (/^au$/i.test(k.name)) aus.push({ id: k.attrs.id ?? '', title: langText(xKid(k, 'title')), url: text(k, 'url').trim(), moveOn: k.attrs.moveon ?? '',
        masteryScore: k.attrs.masteryscore ?? '', launchMethod: k.attrs.launchmethod ?? '', launchParameters: text(k, 'launchParameters'), entitlementKey: text(k, 'entitlementKey'),
        activityType: k.attrs.activitytype ?? '', depth, blocks })
    }
  }
  walk(tree, 0, [])
  return { format: 'cmi5', id: course?.attrs.id ?? '', title: langText(xKid(course, 'title')), description: langText(xKid(course, 'description')), aus }
}

// tincan.xml → { format: 'tincan', activities: [{ id, type, name, description, launch }] }.
export function parseTincan(xml) {
  const tree = xmlTree(xml)
  if (!/^tincan$/i.test(tree.name)) throw new Error(`The root element is <${tree.name}>, not <tincan>.`)
  const activities = xKids(xKid(tree, 'activities'), 'activity').map(a => ({ id: a.attrs.id ?? '', type: a.attrs.type ?? '', name: langText(xKid(a, 'name')), description: langText(xKid(a, 'description')), launch: text(a, 'launch').trim() }))
  return { format: 'tincan', activities }
}

// Problems with the course structure itself: [{ code, text }] (analyze turns them into findings).
export function courseProblems(course) {
  const out = []
  if (course.format === 'cmi5') {
    if (!course.id) out.push({ code: 'cmi5-course', text: 'cmi5.xml has no course id: <course id="…"> is required.' })
    else if (!isIri(course.id)) out.push({ code: 'cmi5-course', text: 'The course id in cmi5.xml isn’t an absolute IRI (it needs a scheme, such as https://example.com/course).' })
    if (!course.aus.length) out.push({ code: 'no-au', text: 'cmi5.xml has no assignable unit (<au>): nothing can be launched.' })
    const seen = new Set()
    for (const au of course.aus) {
      const who = au.id ? `“${au.id}”` : '(an AU with no id)'
      if (!au.id) out.push({ code: 'cmi5-au', text: 'An AU in cmi5.xml has no id.' })
      else if (!isIri(au.id)) out.push({ code: 'cmi5-au', text: `AU ${who} has an id that isn’t an absolute IRI.` })
      else if (seen.has(au.id)) out.push({ code: 'cmi5-au', text: `AU ${who} is listed twice: AU ids must be unique.` })
      seen.add(au.id)
      if (!au.url) out.push({ code: 'cmi5-au', text: `AU ${who} has no <url>: there is nothing to launch.` })
      if (au.moveOn && !MOVE_ON.includes(au.moveOn)) out.push({ code: 'cmi5-moveon', text: `AU ${who} has moveOn “${au.moveOn}”; cmi5 allows ${MOVE_ON.join(', ')}.` })
      if (au.masteryScore !== '' && !(/^\d*\.?\d+$/.test(au.masteryScore) && +au.masteryScore >= 0 && +au.masteryScore <= 1)) out.push({ code: 'cmi5-moveon', text: `AU ${who} has masteryScore “${au.masteryScore}”; it must be a number from 0 to 1.` })
      if (au.launchMethod && !LAUNCH_METHODS.includes(au.launchMethod)) out.push({ code: 'cmi5-au', text: `AU ${who} has launchMethod “${au.launchMethod}”; cmi5 allows ${LAUNCH_METHODS.join(' or ')}.` })
    }
  } else if (!course.activities.some(a => a.launch)) out.push({ code: 'no-au', text: 'tincan.xml has no activity with a <launch>: nothing can be launched.' })
  return out
}

// The manifest-shaped view of a course (analysis.manifest), so items, launching, and the launch checks work as they do for SCORM.
// pkgPath and isRemote come from analyze.js. Items: { id, title, depth, res, type ('au' | 'activity'), mastery, au | activity }.
export function courseManifest(course, base, pkgPath, isRemote) {
  const res = (id, href, type) => ({ id, type, href, base, path: href && !isRemote(href) ? pkgPath(base, href) : null, query: href.includes('?') ? href.slice(href.indexOf('?')) : '', files: [], deps: [] })
  const items = course.format === 'cmi5'
    ? course.aus.map(au => ({ id: au.id, title: au.title, depth: au.depth, resource: au.id, res: au.url ? res(au.id, au.url, 'au') : undefined, params: '', type: 'au', launchData: au.launchParameters,
      mastery: au.masteryScore, maxTime: '', timeLimitAction: '', completionThreshold: '', au }))
    : course.activities.filter(a => a.launch).map(a => ({ id: a.id, title: a.name, depth: 0, resource: a.id, res: res(a.id, a.launch, 'activity'), params: '', type: 'activity', launchData: '', mastery: '', maxTime: '', timeLimitAction: '', completionThreshold: '', activity: a }))
  return { version: course.format, edition: '', schemaversion: '', title: course.format === 'cmi5' ? course.title : course.activities[0]?.name ?? '', format: course.format,
    resources: items.filter(i => i.res).map(i => i.res), items, namespaces: '' }
}

// ---- Launch ----
const enc = encodeURIComponent
// The URL parameters a cmi5 AU is launched with; the fetch URL is where it gets its auth token, once. actor is an Agent object.
export const cmi5Query = ({ endpoint, fetch, actor, registration, activityId }) => `endpoint=${enc(endpoint)}&fetch=${enc(fetch)}&actor=${enc(JSON.stringify(actor))}&registration=${enc(registration)}&activityId=${enc(activityId)}`
// The Tin Can launch (the Rustici launch convention): the endpoint, an Authorization header value to use as it is, the actor and the registration.
export const tincanQuery = ({ endpoint, token, actor, registration, activityId }) => `endpoint=${enc(endpoint)}&auth=${enc('Basic ' + token)}&actor=${enc(JSON.stringify(actor))}&registration=${enc(registration)}&activity_id=${enc(activityId)}`

// The LMS.LaunchData state document (cmi5 §11.3): what the AU reads before it starts. sessionId goes in the context template, as a cmi5 LMS does.
export function launchData({ au, activityId, sessionId, returnURL = '' }) {
  const ctx = { contextActivities: { grouping: [{ objectType: 'Activity', id: activityId }] }, extensions: { [SESSIONID]: sessionId } }
  return { contextTemplate: ctx, launchMode: 'Normal', ...(au.launchParameters ? { launchParameters: au.launchParameters } : {}), ...(au.masteryScore !== '' ? { masteryScore: +au.masteryScore } : {}),
    moveOn: au.moveOn || 'NotApplicable', ...(returnURL ? { returnURL } : {}), ...(au.entitlementKey ? { entitlementKey: { courseStructure: au.entitlementKey } } : {}) }
}

// ---- Rules ----
// What moveOn asks for, from the verbs sent: { need, met, missing }. NotApplicable (and no moveOn) asks for nothing.
export function moveOnCheck(moveOn, verbs) {
  const has = v => verbs.includes(v), m = moveOn || 'NotApplicable'
  const need = { Passed: ['passed'], Completed: ['completed'], CompletedAndPassed: ['completed', 'passed'], CompletedOrPassed: ['completed or passed'], NotApplicable: [] }[m] ?? []
  const met = m === 'CompletedOrPassed' ? has('completed') || has('passed') : need.every(has)
  return { moveOn: m, need, met, missing: met ? [] : need }
}

// The verb name of a statement's verb IRI ('initialized') if it is a cmi5 verb, else ''.
export const verbName = s => { const m = /^(?:http:\/\/adlnet\.gov\/expapi\/verbs|https:\/\/w3id\.org\/xapi\/adl\/verbs)\/(\w+)$/.exec(s?.verb?.id ?? ''); return m && CMI5_VERBS.includes(m[1]) ? m[1] : '' }

// The cmi5 rules a statement breaks by itself, against the launch: [{ code, text }]. s is a statement; launch is
// { actor, registration, activityId, sessionId } (the LMS's values). Only the AU's own statements are checked.
export function cmi5StatementProblems(s, launch) {
  const out = [], name = verbName(s)
  if (!name || name === 'launched') return out
  const cat = (s.context?.contextActivities?.category ?? []), cats = Array.isArray(cat) ? cat : [cat]
  if (!cats.some(c => c?.id === CATEGORY)) out.push({ sev: 'error', code: 'cmi5-category', path: 'context.contextActivities.category', text: `A cmi5 “${name}” statement must have the cmi5 category activity (${CATEGORY}) in context.contextActivities.category.` })
  if (!s.context?.extensions?.[SESSIONID]) out.push({ sev: 'error', code: 'cmi5-sessionid', path: 'context.extensions', text: `A cmi5 “${name}” statement must carry the session id in context.extensions (${SESSIONID}).` })
  else if (launch.sessionId && s.context.extensions[SESSIONID] !== launch.sessionId) out.push({ sev: 'warn', code: 'cmi5-sessionid', path: 'context.extensions', text: `The session id in a “${name}” statement isn’t the one in LMS.LaunchData’s context template.` })
  if (launch.registration && s.context?.registration !== launch.registration) out.push({ sev: 'error', code: 'cmi5-launch', path: 'context.registration', text: `A cmi5 “${name}” statement must use the registration it was launched with.` })
  if (launch.activityId && s.object?.id !== launch.activityId) out.push({ sev: 'error', code: 'cmi5-launch', path: 'object.id', text: `A cmi5 “${name}” statement’s object must be the AU it was launched as (the activityId parameter).` })
  const a = s.actor, la = launch.actor
  if (la && !(a?.account?.name === la.account?.name && a?.account?.homePage === la.account?.homePage)) out.push({ sev: 'error', code: 'cmi5-launch', path: 'actor', text: `A cmi5 “${name}” statement’s actor must be the actor it was launched with.` })
  const r = s.result ?? {}
  if (['completed', 'passed', 'failed', 'terminated'].includes(name) && !r.duration) out.push({ sev: 'error', code: 'cmi5-duration', path: 'result.duration', text: `A cmi5 “${name}” statement must have result.duration.` })
  const want = { completed: ['completion', true], passed: ['success', true], failed: ['success', false] }[name]
  if (want && r[want[0]] !== want[1]) out.push({ sev: 'error', code: 'cmi5-result', path: 'result.' + want[0], text: `A cmi5 “${name}” statement must have result.${want[0]} ${want[1]}.` })
  if (r.score && name !== 'passed' && name !== 'failed') out.push({ sev: 'error', code: 'cmi5-result', path: 'result.score', text: `A cmi5 “${name}” statement must not have a score: only “passed” and “failed” may.` })
  return out
}

// The order rules over the AU's statements, in the order they arrived (each { verb: 'initialized', t, n }): [{ code, text, evidence: [string] }].
export function cmi5Order(list) {
  const out = [], at = (v, k = 0) => list.filter(x => x.verb === v)[k]
  const init = at('initialized'), term = at('terminated')
  const label = x => `#${x.n} ${x.verb}`
  const before = list.filter(x => init && list.indexOf(x) < list.indexOf(init) && x.verb !== 'initialized')
  if (init && before.length) out.push({ code: 'before-init', text: `The AU sent ${before.map(x => '“' + x.verb + '”').join(', ')} before “initialized”`, evidence: before.map(label).concat(label(init)) })
  const noInit = !init && list.filter(x => x.verb !== 'launched')
  if (noInit?.length) out.push({ code: 'no-init', text: 'The AU sent statements but never “initialized”', evidence: noInit.map(label) })
  if (term) {
    const after = list.slice(list.indexOf(term) + 1)
    if (after.length) out.push({ code: 'after-term', text: `The AU sent ${after.map(x => '“' + x.verb + '”').join(', ')} after “terminated”`, evidence: after.map(label).concat(label(term)) })
  }
  for (const v of ['initialized', 'completed', 'terminated']) {
    const all = list.filter(x => x.verb === v)
    if (all.length > 1) out.push({ code: 'repeated', text: `The AU sent “${v}” ${all.length} times; once per session is allowed`, evidence: all.map(label) })
  }
  if (at('passed') && at('failed')) out.push({ code: 'both', text: 'The AU sent both “passed” and “failed” in one session', evidence: list.filter(x => x.verb === 'passed' || x.verb === 'failed').map(label) })
  return out
}
