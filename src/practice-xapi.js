// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// The xAPI practice and test packages: a cmi5 package (the cmi5 sample structure, one AU) and a Tin Can package, built in
// memory. Shared by test/xapi.js (which asserts on them) and src/practice.js (the User Guide's practice packages),
// so both describe the same packages. No assertions here.
import { zip } from './zip.js'
import { CATEGORY } from './cmi5.js'

// The cmi5 course structure of the spec's sample (one block, one AU), with the AU's launch page.
export const CMI5_XML = `<?xml version="1.0" encoding="utf-8"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="http://example.com/courses/lab-cmi5"><title><langstring lang="en-US">Sample cmi5 course</langstring></title><description><langstring lang="en-US">A course.</langstring></description></course>
  <block id="http://example.com/courses/lab-cmi5/block1"><title><langstring lang="en-US">Block one</langstring></title>
    <au id="http://example.com/courses/lab-cmi5/au1" moveOn="CompletedOrPassed" masteryScore="0.8" launchMethod="AnyWindow" activityType="http://adlnet.gov/expapi/activities/lesson">
      <title><langstring lang="en-US">Lesson one</langstring></title><description><langstring lang="en-US">The lesson.</langstring></description><url>au/index.html</url>
      <launchParameters>level=2</launchParameters></au></block>
</courseStructure>`
export const TINCAN_XML = `<?xml version="1.0" encoding="utf-8"?>
<tincan xmlns="http://projecttincan.com/tincan.xsd"><activities>
  <activity id="http://example.com/activities/lab-tincan" type="http://adlnet.gov/expapi/activities/course"><name lang="en-US">Sample Tin Can course</name><description lang="en-US">A course.</description><launch lang="en-us">index.html</launch></activity>
</activities></tincan>`

// What an AU does, as a script a browser can run (no libraries). steps: the statements to send, in order, each [name, verb IRI, result?].
const CMI5_JS = (steps, extra = '') => `
var q = new URLSearchParams(location.search), endpoint = q.get('endpoint'), reg = q.get('registration'), actor = JSON.parse(q.get('actor')), act = q.get('activityId'), token = '', t = Date.now()
function call(method, path, body, headers) {
  return fetch(endpoint + path, { method: method, headers: Object.assign({ 'X-Experience-API-Version': '1.0.3', 'Authorization': 'Basic ' + token }, body ? { 'Content-Type': 'application/json' } : {}, headers || {}), body: body ? JSON.stringify(body) : undefined })
}
function say(ctx, name, iri, result) {
  var id = crypto.randomUUID(), s = { id: id, actor: actor, verb: { id: iri, display: { 'en-US': name } }, object: { objectType: 'Activity', id: act }, context: ctx, timestamp: new Date(t += 10).toISOString() }
  if (result) s.result = result
  return call('PUT', 'statements?statementId=' + id, s)
}
document.title = 'Lesson one'
fetch(q.get('fetch'), { method: 'POST' }).then(function (r) { return r.json() }).then(function (d) {
  token = d['auth-token']
  ${extra}
  return call('GET', 'activities/state?stateId=LMS.LaunchData&activityId=' + encodeURIComponent(act) + '&agent=' + encodeURIComponent(JSON.stringify(actor)) + '&registration=' + reg)
}).then(function (r) { return r.json() }).then(function (data) {
  var tpl = data.contextTemplate, ctx = { registration: reg, extensions: tpl.extensions, contextActivities: { grouping: tpl.contextActivities.grouping, category: [{ objectType: 'Activity', id: '${CATEGORY}' }] } }
  var steps = ${JSON.stringify(steps)}, p = Promise.resolve()
  steps.forEach(function (s) { p = p.then(function () { return say(s.noctx ? { registration: reg } : ctx, s[0], s[1], s[2]) }) })
  return p
})`
export const V = n => `http://adlnet.gov/expapi/verbs/${n}`
const D = { duration: 'PT2S' }
export const cmi5Steps = {
  good: [['initialized', V('initialized')], ['completed', V('completed'), { completion: true, ...D }], ['passed', V('passed'), { success: true, score: { scaled: 0.9 }, ...D }], ['terminated', V('terminated'), D]],
  // completed before initialized, a verb that is not an IRI, and a statement without the session id and category
  broken: [['completed', V('completed'), { completion: true, ...D }], ['initialized', V('initialized')], ['passed', 'passed', { success: true, ...D }], ['terminated', V('terminated'), D]],
}
export function cmi5Package(steps = cmi5Steps.good, { xml = CMI5_XML, extra = '' } = {}) {
  return zip(new Map([['cmi5.xml', Buffer.from(xml)], ['au/index.html', Buffer.from('<!doctype html><html><head><title>AU</title></head><body><h1>Lesson one</h1><p>This lesson is a cmi5 AU: it asks the test LMS for its token and sends statements.</p><script src="au.js"></script></body></html>')],
    ['au/au.js', Buffer.from(CMI5_JS(steps, extra))]]))
}
const TINCAN_JS = `
var q = new URLSearchParams(location.search), endpoint = q.get('endpoint'), auth = q.get('auth'), reg = q.get('registration'), actor = JSON.parse(q.get('actor')), act = q.get('activity_id')
function post(body) { return fetch(endpoint + 'statements', { method: 'POST', headers: { 'X-Experience-API-Version': '1.0.3', 'Authorization': auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
function st(verb, extra) { return Object.assign({ actor: actor, verb: { id: 'http://adlnet.gov/expapi/verbs/' + verb, display: { 'en-US': verb } }, object: { objectType: 'Activity', id: act }, context: { registration: reg } }, extra || {}) }
fetch(endpoint + 'about', { headers: { 'X-Experience-API-Version': '1.0.3' } }).then(function () {
  return post(st('experienced'))
}).then(function () {
  return post(st('answered', { result: { score: { scaled: 1.5 }, response: 'private answer' } }))   // scaled is out of range: the LRS refuses it
}).then(function () {
  return fetch(endpoint + 'activities/state?stateId=bookmark&activityId=' + encodeURIComponent(act) + '&agent=' + encodeURIComponent(JSON.stringify(actor)), { method: 'PUT', headers: { 'X-Experience-API-Version': '1.0.3', 'Authorization': auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 3 }) })
}).then(function () {
  return post(st('completed', { result: { completion: true, success: true, score: { scaled: 0.9, raw: 9, min: 0, max: 10 }, duration: 'PT1M' } }))
})`
export function tincanPackage() {
  return zip(new Map([['tincan.xml', Buffer.from(TINCAN_XML)], ['index.html', Buffer.from('<!doctype html><html><head><title>Tin Can</title></head><body><h1>Tin Can course</h1><p>This page sends statements to the test LRS.</p><script src="tc.js"></script></body></html>')], ['tc.js', Buffer.from(TINCAN_JS)]]))
}

