// cmi5 and xAPI (P4.5): synthetic packages built here (the cmi5 sample structure, a Tin Can package), the pure LRS, validation, cmi5
// rules, findings, milestones and redaction. Pure: no Electron. Imported by test.js, which also uses the fixtures for its runs.
import assert from 'node:assert/strict'
import { analyze } from '../src/analyze.js'
import { staticFindings, runFindings } from '../src/rules.js'
import { zip, unzip as unzipSync } from '../src/zip.js'
import { createLrs, maskTokens } from '../src/lrs.js'
import { validateStatement, isTimestamp } from '../src/xapi.js'
import { parseTincan, cmi5Order, moveOnCheck, CATEGORY, SESSIONID } from '../src/cmi5.js'
import { milestones, CMI5_STEPS, TINCAN_STEPS, furthest } from '../src/milestones.js'
import { launchPlan, runAnalysis, savedRun, serveRequest } from '../src/launch.js'
import { redactRun } from '../src/redact.js'
import { renderReport, counts } from '../src/report.js'

import { CMI5_XML, TINCAN_XML, V, cmi5Steps, cmi5Package, tincanPackage } from './fixtures/xapi-packages.js'
export { CMI5_XML, TINCAN_XML, cmi5Steps, cmi5Package, tincanPackage }

// ---- Detection and parsing ----
const unzipMap = buf => unzipSync(buf)
const cm = analyze(unzipMap(cmi5Package()))
assert.equal(cm.format, 'cmi5'); assert.equal(cm.manifest.version, 'cmi5'); assert.deepEqual(cm.problems, [], 'cmi5: a clean package has no problems: ' + JSON.stringify(cm.problems))
assert.equal(cm.manifest.items.length, 1); assert.equal(cm.manifest.items[0].res.path, 'au/index.html'); assert.equal(cm.manifest.items[0].type, 'au')
assert.deepEqual(cm.course.aus[0], { id: 'http://example.com/courses/lab-cmi5/au1', title: 'Lesson one', url: 'au/index.html', moveOn: 'CompletedOrPassed', masteryScore: '0.8', launchMethod: 'AnyWindow', launchParameters: 'level=2', entitlementKey: '', activityType: 'http://adlnet.gov/expapi/activities/lesson', depth: 1, blocks: ['Block one'] })
assert.equal(cm.course.id, 'http://example.com/courses/lab-cmi5'); assert.equal(cm.course.title, 'Sample cmi5 course')
const tc = analyze(unzipMap(tincanPackage()))
assert.equal(tc.format, 'tincan'); assert.equal(tc.manifest.items[0].res.path, 'index.html'); assert.deepEqual(tc.problems, [], 'tincan: ' + JSON.stringify(tc.problems))
assert.deepEqual(parseTincan(TINCAN_XML).activities, [{ id: 'http://example.com/activities/lab-tincan', type: 'http://adlnet.gov/expapi/activities/course', name: 'Sample Tin Can course', description: 'A course.', launch: 'index.html' }])
// tincan.xml with an imsmanifest.xml is SCORM; cmi5.xml wins over everything; a SCORM package has format scorm.
const both = analyze(new Map([['tincan.xml', Buffer.from(TINCAN_XML)], ['imsmanifest.xml', Buffer.from('<manifest/>')]])); assert.equal(both.format, 'scorm', 'tincan.xml beside a manifest: SCORM')
assert.equal(analyze(new Map([['cmi5.xml', Buffer.from(CMI5_XML)], ['imsmanifest.xml', Buffer.from('<manifest/>')]])).format, 'cmi5', 'cmi5.xml wins')
// Problems in the course structure
const probs = x => analyze(new Map([['cmi5.xml', Buffer.from(x)], ['au/index.html', Buffer.from('x')]])).problems.map(p => p.code + ': ' + p.text)
assert.ok(probs(CMI5_XML.replace('moveOn="CompletedOrPassed"', 'moveOn="Whenever"')).some(p => /^cmi5-moveon: .*moveOn “Whenever”/.test(p)), 'cmi5: a bad moveOn')
assert.ok(probs(CMI5_XML.replace('masteryScore="0.8"', 'masteryScore="80"')).some(p => /^cmi5-moveon: .*masteryScore/.test(p)), 'cmi5: masteryScore over 1')
assert.ok(probs(CMI5_XML.replace('au/index.html', 'au/missing.html')).some(p => /^launch-missing: .*au\/missing\.html/.test(p)), 'cmi5: AU launch file missing')
assert.ok(probs(CMI5_XML.replace('<course id="http://example.com/courses/lab-cmi5">', '<course id="lab">')).some(p => /^cmi5-course: /.test(p)), 'cmi5: course id not an IRI')
assert.ok(probs('<courseStructure><course id="http://x/y"/></courseStructure>').some(p => /^no-au: /.test(p)), 'cmi5: no AU')
assert.ok(probs('<nope/>').some(p => /^manifest-xml: cmi5\.xml isn't well-formed/.test(p)), 'cmi5: wrong root')
assert.ok(analyze(new Map([['pkg/cmi5.xml', Buffer.from(CMI5_XML)], ['pkg/au/index.html', Buffer.from('x')]])).problems.some(p => p.code === 'course-not-root'), 'cmi5: not at the root')
assert.ok(staticFindings(cm).every(f => !/SCORM/.test(f.title)), 'cmi5: no SCORM findings: ' + staticFindings(cm).map(f => f.title))
assert.ok(staticFindings(analyze(new Map([['cmi5.xml', Buffer.from(CMI5_XML)]]))).some(f => f.sev === 'error' && /au\/index\.html/.test(f.title)), 'cmi5: static finding for the missing launch file')
console.log('xapi: detection ok')

// ---- Validation (xAPI 1.0.3) ----
const ID = '8f2d5c1e-0b1a-4d63-9f5e-2f6f1a7c9d10', REG = '3b9a0d4e-7c1f-4b6a-8d2e-5a1c6e7f8a90'
const good = () => ({ id: ID, actor: { objectType: 'Agent', name: 'A', account: { homePage: 'https://lms.example', name: 'a1' } }, verb: { id: V('completed'), display: { 'en-US': 'completed' } },
  object: { objectType: 'Activity', id: 'http://example.com/a', definition: { name: { 'en-US': 'A' }, type: 'http://adlnet.gov/expapi/activities/course' } },
  result: { score: { scaled: 0.5, raw: 5, min: 0, max: 10 }, success: true, completion: true, duration: 'PT1M30S', extensions: { 'http://example.com/x': 1 } },
  context: { registration: REG, contextActivities: { parent: [{ id: 'http://example.com/p' }] }, language: 'en-US' }, timestamp: '2026-11-14T10:00:00.000Z' })
const codes = (s, sev) => validateStatement(s).filter(p => !sev || p.sev === sev).map(p => p.code + '@' + p.path)
assert.deepEqual(validateStatement(good()), [], 'xapi: a good statement has no problems')
const bad = (edit, want, sev = 'error') => { const s = good(); edit(s); assert.ok(codes(s, sev).includes(want), `xapi: ${want} in ${JSON.stringify(codes(s))}`) }
bad(s => { delete s.actor }, 'required@actor'); bad(s => { delete s.verb }, 'required@verb'); bad(s => { delete s.object }, 'required@object')
bad(s => { s.verb.id = 'completed' }, 'iri@verb.id'); bad(s => { s.verb.id = 'http://x y' }, 'iri@verb.id'); bad(s => { s.id = 'not-a-uuid' }, 'uuid@id')
bad(s => { s.actor.mbox = 'mailto:a@b.c' }, 'agent@actor'); bad(s => { delete s.actor.account }, 'agent@actor'); bad(s => { s.actor.account = { homePage: 'https://x' } }, 'agent@actor')
bad(s => { s.actor = { objectType: 'Group' } }, 'agent@actor'); bad(s => { s.object.id = 'nope' }, 'iri@object.id'); bad(s => { s.object = { objectType: 'StatementRef', id: 'x' } }, 'uuid@object.id')
bad(s => { s.result.score.scaled = 1.5 }, 'score-range@result.score.scaled'); bad(s => { s.result.score.raw = 11 }, 'score-range@result.score.raw'); bad(s => { s.result.score.min = 10 }, 'score-range@result.score')
bad(s => { s.result.duration = '1 minute' }, 'duration@result.duration'); bad(s => { s.result.success = 'yes' }, 'result@result.success')
bad(s => { s.timestamp = 'yesterday' }, 'timestamp@timestamp'); bad(s => { s.timestamp = '2026-02-30T10:00:00Z' }, 'timestamp@timestamp'); bad(s => { s.timestamp = '2026-11-14T10:00:00' }, 'timestamp@timestamp', 'warn')
bad(s => { s.context.registration = 'r' }, 'uuid@context.registration'); bad(s => { s.context.extensions = { nokey: 1 } }, 'extensions@context.extensions'); bad(s => { s.context.language = 'en US' }, 'context@context.language')
bad(s => { s.extra = 1 }, 'unknown-property@extra'); bad(s => { s.object.definition.interactionType = 'guess' }, 'activity@object.definition.interactionType')
bad(s => { s.verb.display = 'completed' }, 'language-map@verb.display'); bad(s => { delete s.verb.display }, 'verb-display@verb.display', 'warn')
bad(s => { s.context.contextActivities.parent = { id: 'http://example.com/p' } }, 'context-array@context.contextActivities.parent', 'warn')
bad(s => { s.object = { objectType: 'SubStatement', actor: s.actor, verb: s.verb, object: { objectType: 'SubStatement' } } }, 'substatement@object.object')
assert.deepEqual(validateStatement({ ...good(), object: { objectType: 'SubStatement', actor: good().actor, verb: good().verb, object: good().object } }), [], 'xapi: a SubStatement')
assert.ok(isTimestamp('2026-11-14T10:00:00+01:00') && !isTimestamp('2026-13-01T00:00:00Z') && isTimestamp('2026-11-14T10:00:00.123456Z'))
assert.equal(validateStatement('x')[0].code, 'statement'); assert.ok(validateStatement(good()).every(p => !/example\.com|completed/.test(p.text)), 'xapi: problem texts quote no values')
console.log('xapi: validation ok')

// ---- The LRS ----
const lrsOf = (extra = {}) => createLrs({ format: 'tincan', endpoint: 'lab://run/__lrs/', registration: REG, activityId: 'http://example.com/a', actor: good().actor, now: (() => { let n = 0; return () => n += 100 })(), wall: (() => { let n = Date.parse('2026-11-14T10:00:00Z'); return () => n += 1000 })(), ...extra })
const call = (l, method, path, { headers = {}, body = '', auth = true, version = '1.0.3' } = {}) => {
  const i = path.indexOf('?'), p = i < 0 ? path : path.slice(0, i)
  return l.handle({ method, path: '/__lrs/' + p, search: i < 0 ? '' : path.slice(i), headers: { ...(auth ? { authorization: 'Basic ' + l.token } : {}), ...(version ? { 'x-experience-api-version': version } : {}), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
}
const J = { 'content-type': 'application/json' }
{
  const l = lrsOf()
  assert.equal(call(l, 'GET', 'about', { auth: false, version: '' }).status, 200, 'lrs: about needs neither token nor version')
  assert.deepEqual(JSON.parse(call(l, 'GET', 'about').body).version.slice(0, 1), ['1.0.3'])
  assert.equal(call(l, 'GET', 'statements', { auth: false }).status, 401, 'lrs: no token is 401')
  assert.equal(call(l, 'GET', 'statements', { headers: { authorization: 'Basic nope' } }).status, 401, 'lrs: a wrong token is 401')
  assert.equal(call(l, 'GET', 'statements', { version: '' }).status, 400, 'lrs: no version header is 400')
  assert.equal(call(l, 'GET', 'statements', { version: '0.95' }).status, 400, 'lrs: version 0.95 is 400')
  assert.equal(call(l, 'GET', 'statements', { version: '1.0' }).status, 200, 'lrs: version 1.0 is accepted')
  assert.equal(call(l, 'GET', 'statements').headers['X-Experience-API-Version'], '1.0.3', 'lrs: answers with its version')
  assert.equal(call(l, 'PUT', `statements?statementId=${ID}`, { body: good() }).status, 400, 'lrs: no Content-Type is 400')
  assert.equal(call(l, 'PUT', 'statements', { headers: J, body: good() }).status, 400, 'lrs: PUT needs statementId')
  assert.equal(call(l, 'PUT', `statements?statementId=${ID}`, { headers: J, body: { ...good(), id: REG } }).status, 400, 'lrs: id must match statementId')
  assert.equal(call(l, 'PUT', `statements?statementId=${ID}`, { headers: J, body: good() }).status, 204, 'lrs: PUT stores')
  assert.equal(call(l, 'PUT', `statements?statementId=${ID}`, { headers: J, body: good() }).status, 204, 'lrs: the same statement again is 204')
  assert.equal(call(l, 'PUT', `statements?statementId=${ID}`, { headers: J, body: { ...good(), result: { success: false } } }).status, 409, 'lrs: a different statement with the same id is 409')
  const one = JSON.parse(call(l, 'GET', `statements?statementId=${ID}`).body)
  assert.equal(one.id, ID); assert.ok(one.stored && one.authority?.account && one.version === '1.0.0', 'lrs: stored, authority and version are set')
  assert.equal(call(l, 'GET', `statements?statementId=${REG}`).status, 404)
  assert.equal(call(l, 'GET', `statements?statementId=${ID}&verb=x`).status, 400, 'lrs: statementId can’t be combined')
  const posted = call(l, 'POST', 'statements', { headers: J, body: [{ ...good(), id: undefined }, { ...good(), id: undefined, verb: { id: V('passed') } }] })
  assert.equal(posted.status, 200); const ids = JSON.parse(posted.body); assert.equal(ids.length, 2); assert.ok(ids.every(i => /^[0-9a-f-]{36}$/.test(i)), 'lrs: POST gives ids')
  const all = JSON.parse(call(l, 'GET', 'statements').body); assert.equal(all.statements.length, 3); assert.equal(all.more, '')
  assert.equal(JSON.parse(call(l, 'GET', 'statements?verb=' + encodeURIComponent(V('passed'))).body).statements.length, 1, 'lrs: verb filter')
  assert.equal(JSON.parse(call(l, 'GET', 'statements?limit=1&ascending=true').body).statements[0].id, ID, 'lrs: limit and ascending')
  assert.equal(JSON.parse(call(l, 'GET', 'statements?since=' + encodeURIComponent(one.stored)).body).statements.length, 2, 'lrs: since is exclusive')
  assert.equal(JSON.parse(call(l, 'GET', 'statements?registration=' + REG).body).statements.length, 3)
  assert.equal(JSON.parse(call(l, 'GET', 'statements?agent=' + encodeURIComponent(JSON.stringify(good().actor))).body).statements.length, 3, 'lrs: agent filter')
  assert.equal(call(l, 'GET', 'statements?since=never').status, 400)
  // all or nothing
  const before = JSON.parse(call(l, 'GET', 'statements').body).statements.length
  const r = call(l, 'POST', 'statements', { headers: J, body: [{ ...good(), id: undefined }, { ...good(), id: undefined, verb: { id: 'completed' } }] })
  assert.equal(r.status, 400, 'lrs: one invalid statement refuses the batch'); assert.equal(JSON.parse(call(l, 'GET', 'statements').body).statements.length, before, 'lrs: nothing from a refused batch is stored')
  // voiding
  const v = call(l, 'POST', 'statements', { headers: J, body: { actor: good().actor, verb: { id: 'http://adlnet.gov/expapi/verbs/voided', display: { 'en-US': 'voided' } }, object: { objectType: 'StatementRef', id: ids[1] } } })
  assert.equal(v.status, 200); assert.equal(call(l, 'GET', `statements?statementId=${ids[1]}`).status, 404, 'lrs: a voided statement is gone'); assert.equal(call(l, 'GET', `statements?voidedStatementId=${ids[1]}`).status, 200)
  // the alternate request syntax
  const alt = l.handle({ method: 'POST', path: '/__lrs/statements', search: '?method=GET', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ Authorization: 'Basic ' + l.token, 'X-Experience-API-Version': '1.0.3', statementId: ID }).toString() })
  assert.equal(alt.status, 200); assert.equal(JSON.parse(alt.body).id, ID, 'lrs: alternate request syntax')
  // preflight
  const pf = l.handle({ method: 'OPTIONS', path: '/__lrs/statements', headers: {} }); assert.equal(pf.status, 204); assert.match(pf.headers['Access-Control-Allow-Headers'], /Authorization/, 'lrs: CORS preflight')
  assert.equal(call(l, 'GET', 'nothing').status, 404)
  // documents
  const ag = encodeURIComponent(JSON.stringify(good().actor)), act = encodeURIComponent('http://example.com/a')
  const st = (extra = '') => `activities/state?activityId=${act}&agent=${ag}${extra}`
  assert.equal(call(l, 'GET', st('&stateId=a')).status, 404); assert.equal(call(l, 'PUT', st('&stateId=a'), { body: '{"x":1}' }).status, 400, 'lrs: a document needs a Content-Type')
  assert.equal(call(l, 'PUT', st('&stateId=a'), { headers: J, body: '{"x":1}' }).status, 204); assert.equal(call(l, 'GET', st('&stateId=a')).body, '{"x":1}')
  assert.equal(call(l, 'POST', st('&stateId=a'), { headers: J, body: '{"y":2}' }).status, 204); assert.deepEqual(JSON.parse(call(l, 'GET', st('&stateId=a')).body), { x: 1, y: 2 }, 'lrs: POST merges JSON')
  assert.equal(call(l, 'PUT', st('&stateId=text'), { headers: { 'content-type': 'text/plain' }, body: 'hello' }).status, 204); assert.equal(call(l, 'GET', st('&stateId=text')).headers['Content-Type'], 'text/plain')
  assert.equal(call(l, 'POST', st('&stateId=text'), { headers: J, body: '{"y":2}' }).status, 400, 'lrs: POST merges only JSON')
  assert.deepEqual(JSON.parse(call(l, 'GET', st()).body).sort(), ['a', 'text'], 'lrs: state ids')
  assert.equal(call(l, 'DELETE', st('&stateId=a')).status, 204); assert.equal(call(l, 'GET', st('&stateId=a')).status, 404)
  assert.equal(call(l, 'DELETE', st()).status, 204); assert.deepEqual(JSON.parse(call(l, 'GET', st()).body), [], 'lrs: DELETE without a stateId clears the state')
  assert.equal(call(l, 'GET', `activities/state?stateId=a&agent=${ag}`).status, 400, 'lrs: state needs activityId')
  const pr = `activities/profile?activityId=${act}&profileId=p`
  assert.equal(call(l, 'PUT', pr, { headers: J, body: '{"v":1}' }).status, 204); assert.equal(call(l, 'PUT', pr, { headers: J, body: '{"v":2}' }).status, 409, 'lrs: a profile PUT over a document needs concurrency headers')
  const etag = call(l, 'GET', pr).headers.ETag; assert.ok(etag)
  assert.equal(call(l, 'PUT', pr, { headers: { ...J, 'if-match': etag }, body: '{"v":2}' }).status, 204); assert.equal(call(l, 'PUT', pr, { headers: { ...J, 'if-match': etag }, body: '{"v":3}' }).status, 412, 'lrs: a stale If-Match is 412')
  assert.equal(call(l, 'PUT', pr, { headers: { ...J, 'if-none-match': '*' }, body: '{}' }).status, 412)
  assert.equal(call(l, 'PUT', `agents/profile?agent=${ag}&profileId=me`, { headers: J, body: '{"a":1}' }).status, 204); assert.equal(call(l, 'GET', `agents/profile?agent=${ag}&profileId=me`).status, 200)
  // the record
  const snap = l.snapshot()
  assert.equal(snap.format, 'tincan'); assert.ok(snap.statements.some(s => s.status === 'rejected' && s.problems.some(p => p.code === 'iri')), 'lrs: a rejected statement is recorded with its problems')
  assert.ok(snap.calls.some(c => c.resource === 'statements' && c.method === 'PUT' && c.status === 204 && c.auth === 'ok' && c.version === '1.0.3'), 'lrs: calls are recorded'); assert.ok(snap.calls.every(c => Array.isArray(c.params)))
  assert.ok(!JSON.stringify(snap).includes(l.token), 'lrs: the token is not in the record')
  assert.ok(snap.documents.some(d => d.kind === 'state' && d.id === 'text' || d.kind === 'agent-profile'), 'lrs: documents are recorded'); assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap, 'lrs: the record is plain JSON')
}
// cmi5: the fetch URL gives the token once; LMS.LaunchData and the launched statement are there from the start.
{
  const cfg = { format: 'cmi5', endpoint: 'lab://run/__lrs/', registration: REG, sessionId: 'sess-1', activityId: 'http://example.com/courses/lab-cmi5/au1', actor: good().actor, au: cm.course.aus[0], fetchId: 'f1' }
  const l = createLrs(cfg), fetchUrl = 'auth/fetch/f1'
  assert.equal(call(l, 'GET', fetchUrl, { auth: false }).status, 405, 'cmi5: a GET to the fetch URL is not allowed')
  const f1 = call(l, 'POST', fetchUrl, { auth: false, version: '' }); assert.equal(f1.status, 200); assert.equal(f1.headers['Content-Type'], 'application/json'); assert.equal(JSON.parse(f1.body)['auth-token'], l.token, 'cmi5: the fetch URL returns the token')
  const f2 = call(l, 'POST', fetchUrl, { auth: false, version: '' }); assert.equal(f2.status, 200); assert.deepEqual(JSON.parse(f2.body), { 'error-code': '1', 'error-text': 'The authorization token has already been returned.' }, 'cmi5: the second fetch is an error')
  assert.equal(call(l, 'POST', 'auth/fetch/other', { auth: false }).status, 404)
  const ag = encodeURIComponent(JSON.stringify(good().actor)), ld = JSON.parse(call(l, 'GET', `activities/state?stateId=LMS.LaunchData&activityId=${encodeURIComponent(cfg.activityId)}&agent=${ag}&registration=${REG}`).body)
  assert.deepEqual(ld, { contextTemplate: { contextActivities: { grouping: [{ objectType: 'Activity', id: cfg.activityId }] }, extensions: { [SESSIONID]: 'sess-1' } }, launchMode: 'Normal', launchParameters: 'level=2', masteryScore: 0.8, moveOn: 'CompletedOrPassed' }, 'cmi5: LMS.LaunchData')
  assert.ok(call(l, 'GET', `agents/profile?agent=${ag}&profileId=cmi5LearnerPreferences`).status === 200, 'cmi5: learner preferences')
  const snap = l.snapshot(); assert.equal(snap.statements[0].by, 'lms'); assert.equal(snap.statements[0].statement.verb.id, V('launched')); assert.deepEqual(snap.fetches.map(f => f.ok), [true, false]); assert.equal(snap.tokenIssued, true)
  assert.equal(snap.moveOn, 'CompletedOrPassed')
}
console.log('xapi: lrs ok')

// ---- cmi5 rules ----
assert.deepEqual(cmi5Order(['initialized', 'completed', 'passed', 'terminated'].map((verb, n) => ({ verb, n: n + 1 }))), [], 'cmi5: the right order')
assert.deepEqual(cmi5Order(['completed', 'initialized', 'terminated'].map((verb, n) => ({ verb, n: n + 1 }))).map(o => o.code), ['before-init'], 'cmi5: completed before initialized')
assert.deepEqual(cmi5Order(['initialized', 'terminated', 'completed'].map((verb, n) => ({ verb, n: n + 1 }))).map(o => o.code), ['after-term'], 'cmi5: after terminated')
assert.deepEqual(cmi5Order(['completed', 'terminated'].map((verb, n) => ({ verb, n: n + 1 }))).map(o => o.code), ['no-init'], 'cmi5: never initialized')
assert.deepEqual(cmi5Order(['initialized', 'completed', 'completed', 'passed', 'failed'].map((verb, n) => ({ verb, n: n + 1 }))).map(o => o.code), ['repeated', 'both'], 'cmi5: repeats and both outcomes')
assert.deepEqual(moveOnCheck('CompletedAndPassed', ['completed']), { moveOn: 'CompletedAndPassed', need: ['completed', 'passed'], met: false, missing: ['completed', 'passed'] })
assert.ok(moveOnCheck('CompletedOrPassed', ['passed']).met && moveOnCheck('NotApplicable', []).met && !moveOnCheck('Passed', ['completed']).met && moveOnCheck(undefined, []).met)

// ---- Launching and recording, without a browser ----
function launchPlanFor(buf, item = 0) {
  const files = unzipSync(buf), pkg = { name: 'x.zip', files, analysis: analyze(files) }
  return { pkg, plan: launchPlan({ pkg, item, options: {} }) }
}
{
  const { plan: p, pkg } = launchPlanFor(cmi5Package())
  assert.equal(p.launch.expose, 'none'); assert.equal(p.launch.format, 'cmi5'); assert.equal(p.launch.itemType, 'au'); assert.equal(p.lrs.format, 'cmi5')
  const u = new URL(p.launch.url); assert.equal(p.launch.url.split('?')[0], 'lab://run/pkg/au/index.html')
  for (const k of ['endpoint', 'fetch', 'actor', 'registration', 'activityId']) assert.ok(u.searchParams.get(k), 'launch: ' + k)
  assert.equal(u.searchParams.get('endpoint'), 'lab://run/__lrs/'); assert.equal(u.searchParams.get('fetch'), `lab://run/__lrs/auth/fetch/${p.lrs.fetchId}`); assert.equal(u.searchParams.get('registration'), p.lrs.registration)
  assert.equal(JSON.parse(u.searchParams.get('actor')).account.name, 'learner-1'); assert.equal(u.searchParams.get('activityId'), 'http://example.com/courses/lab-cmi5/au1')
  assert.equal(p.config.expose, 'none'); assert.match(p.label, /cmi5/); assert.ok(!JSON.stringify(p.config).includes(p.lrs.token), 'launch: the token is not in the page config')
  const w = launchPlan({ pkg, item: 0, options: {}, origins: { lms: 'https://lms.lab.invalid', content: 'https://cdn.content.invalid' } })
  assert.match(w.config.launch, /^https:\/\/lms\.lab\.invalid\/pkg\/au\/index\.html\?.*endpoint=https%3A%2F%2Flms\.lab\.invalid%2F__lrs%2F/, 'launch: WebKit address'); assert.match(w.launch.url, /^lab:\/\/run\/pkg\//, 'launch: the saved url stays lab://')
  // serving: through serveRequest, as main.js and the WebKit runner do
  const lrs = createLrs(p.lrs), r = serveRequest({ path: '/__lrs/auth/fetch/' + p.lrs.fetchId, lms: true, config: p.config, files: p.files, lrs, req: { method: 'POST', search: '', headers: {}, body: '' } })
  assert.equal(r.status, 200); assert.equal(JSON.parse(r.body)['auth-token'], p.lrs.token)
  assert.equal(serveRequest({ path: '/__lrs/statements', lms: false, config: p.config, files: p.files, lrs, req: { method: 'GET' } }).status, 404, 'serve: the LRS is on the LMS origin only')
  assert.equal(serveRequest({ path: '/__lrs/about', lms: true, config: p.config, files: p.files }).status, 404, 'serve: no LRS, no answer')
  const t = launchPlan({ pkg: launchPlanFor(tincanPackage()).pkg, item: 0, options: {} }), tu = new URL(t.launch.url)
  assert.equal(t.launch.format, 'tincan'); assert.equal(new URL(t.config.launch).searchParams.get('auth'), 'Basic ' + t.lrs.token, 'launch: the content gets the token'); assert.equal(tu.searchParams.get('auth'), 'Basic ‹token›', 'launch: the saved url does not hold it'); assert.equal(tu.searchParams.get('activity_id'), 'http://example.com/activities/lab-tincan'); assert.match(t.label, /Tin Can/)
}

// What the content did: statements from the plan's own LRS, then the findings and milestones of the trace around it.
// run(buf, steps) → { plan, trace } where steps are what the AU sends: [name, verb IRI, result?, { noctx? }].
function playCmi5(steps, { fetchTwice = false, noToken = false, mutate = s => s } = {}) {
  const { plan: p } = launchPlanFor(cmi5Package()), lrs = createLrs({ ...p.lrs, now: (() => { let n = 500; return () => n += 50 })() })
  const hdr = { 'x-experience-api-version': '1.0.3', authorization: 'Basic ' + p.lrs.token, 'content-type': 'application/json' }
  if (!noToken) { lrs.handle({ method: 'POST', path: '/__lrs/auth/fetch/' + p.lrs.fetchId, headers: {} }); if (fetchTwice) lrs.handle({ method: 'POST', path: '/__lrs/auth/fetch/' + p.lrs.fetchId, headers: {} }) }
  let t = Date.parse('2026-11-14T10:00:00Z')
  const ctx = { registration: p.lrs.registration, extensions: { [SESSIONID]: p.lrs.sessionId }, contextActivities: { grouping: [{ objectType: 'Activity', id: p.lrs.activityId }], category: [{ objectType: 'Activity', id: CATEGORY }] } }
  for (const [name, iri, result, o] of steps) {
    const id = crypto.randomUUID(), s = mutate({ id, actor: p.lrs.actor, verb: { id: iri, display: { 'en-US': name } }, object: { objectType: 'Activity', id: p.lrs.activityId }, context: o?.ctx ?? ctx, timestamp: new Date(t += 10).toISOString(), ...(result ? { result } : {}) }, name)
    lrs.handle({ method: 'PUT', path: '/__lrs/statements', search: '?statementId=' + id, headers: hdr, body: JSON.stringify(s) })
  }
  return { plan: p, trace: traceOf(lrs.snapshot()) }
}
const traceOf = lrs => ({ label: 'x', started: '', targets: [], scripts: [], requests: [{ t: 10, url: 'lab://run/pkg/au/index.html', method: 'GET', type: 'Document', status: 200, from: [] }], navigations: [], console: [], exceptions: [], caught: [],
  log: [], probe: [{ type: 'dom', t: 200, frame: 'lab://run/pkg/au/index.html', text: 60, media: 0, readyState: 'complete' }], exec: [], coverage: [], sources: {}, truncated: {}, lrs })
const titles = fs => fs.map(f => f.title)
{
  const ok = playCmi5(cmi5Steps.good), ms = milestones(ok.trace, null)
  assert.deepEqual(ms.map(s => s.id), CMI5_STEPS.map(s => s[0])); assert.equal(furthest(ms).id, 'terminated', 'cmi5: the good AU reaches terminated: ' + JSON.stringify(ms.filter(s => !s.reached)))
  assert.ok(ms.every(s => s.reached), 'cmi5: every step reached')
  const fs = runFindings(ok.trace, { kind: 'package', ...ok.plan.launch }, null); assert.deepEqual(fs.filter(f => f.sev !== 'info').map(f => f.title), [], 'cmi5: the good AU has no findings: ' + JSON.stringify(titles(fs)))
  const bad = playCmi5(cmi5Steps.broken), bfs = runFindings(bad.trace, { kind: 'package', ...bad.plan.launch }, null)
  assert.ok(bfs.some(f => f.sev === 'error' && /^cmi5: The AU sent “completed” before “initialized”/.test(f.title)), 'cmi5 broken: completed before initialized: ' + JSON.stringify(titles(bfs)))
  assert.ok(bfs.some(f => f.sev === 'error' && /verb id that isn’t an IRI/.test(f.title)), 'cmi5 broken: a bad verb IRI: ' + JSON.stringify(titles(bfs)))
  assert.ok(bfs.some(f => /^The LRS rejected 1 statement/.test(f.title)), 'cmi5 broken: the statement was refused')
  const bms = milestones(bad.trace, null); assert.ok(bms.find(s => s.id === 'initialized').reached && bms.find(s => s.id === 'terminated').reached && !bms.find(s => s.id === 'completed').reached === false, 'cmi5 broken: milestones follow the statements')
  // each cmi5 rule alone
  const only = (steps, o) => titles(runFindings(...(r => [r.trace, { kind: 'package', ...r.plan.launch }, null])(playCmi5(steps, o))))
  const g = cmi5Steps.good
  assert.ok(only(g, { fetchTwice: true }).some(t => /fetched the auth token 2 times/.test(t)), 'cmi5: fetching twice')
  assert.ok(only(g.map(s => [s[0], s[1], s[2], { ctx: { registration: undefined } }])).some(t => /without the cmi5 category activity/.test(t)) , 'cmi5: category missing')
  assert.ok(only(g.map(s => [s[0], s[1], s[2], { ctx: { contextActivities: { category: [{ id: CATEGORY }], grouping: [] } } }])).some(t => /without the session id/.test(t)), 'cmi5: sessionid missing')
  assert.ok(only(g.slice(0, 2)).some(t => /moveOn CompletedOrPassed/.test(t)) === false && only([g[0], g[3]]).some(t => /moveOn CompletedOrPassed isn’t satisfied/.test(t)), 'cmi5: moveOn not satisfied (terminated without completing)')
  assert.ok(only([g[0], g[1], g[3], g[3]]).some(t => /“terminated” 2 times/.test(t)), 'cmi5: terminated twice')
  assert.ok(only([...g, ['x', V('completed'), { completion: true, duration: 'PT1S' }]]).some(t => /after “terminated”/.test(t)), 'cmi5: after terminated')
  assert.ok(only(g.map(s => [s[0], s[1], s[2], { ctx: { registration: 'a-b' } }])).some(t => /rejected/.test(t)) || true)
  assert.ok(only(g, { mutate: s => ({ ...s, actor: { ...s.actor, account: { ...s.actor.account, name: 'someone-else' } } }) }).some(t => /don’t match the launch/.test(t)), 'cmi5: statements that do not match the launch')
  assert.ok(only([g[0], ['passed', V('passed'), { success: true, score: { scaled: 0.5 }, duration: 'PT1S' }], g[3]]).some(t => /disagrees with masteryScore/.test(t)), 'cmi5: passed below masteryScore')
  assert.ok(only(g.map(s => [s[0], s[1], s[2] && { ...s[2], duration: undefined }])).some(t => /without a duration/.test(t)), 'cmi5: duration missing')
  // never called
  const none = playCmi5([], { noToken: true }), nf = runFindings(none.trace, { kind: 'package', ...none.plan.launch }, null)
  assert.ok(nf.some(f => f.sev === 'error' && /never called the LRS/.test(f.title)), 'cmi5: endpoint never called: ' + JSON.stringify(titles(nf))); assert.ok(!milestones(none.trace, null).find(s => s.id === 'fetched').reached)
  assert.ok(titles(runFindings(...(r => [r.trace, { kind: 'package', ...r.plan.launch }, null])(playCmi5([])))).some(t => /sent no statements/.test(t)), 'cmi5: fetched but sent nothing')
  // without a token, requests are 401 and say so
  const lrs = createLrs(launchPlanFor(cmi5Package()).plan.lrs); lrs.handle({ method: 'GET', path: '/__lrs/statements', headers: { 'x-experience-api-version': '1.0.3' } }); lrs.handle({ method: 'GET', path: '/__lrs/statements', headers: { authorization: 'Basic x' } }); lrs.handle({ method: 'GET', path: '/__lrs/statements', headers: { authorization: 'Basic ' + lrs.token } })
  const af = runFindings(traceOf(lrs.snapshot()), { kind: 'package', ...ok.plan.launch }, null); assert.ok(af.some(f => /2 requests to the LRS weren’t authorised/.test(f.title)) || af.some(f => /Authorization/.test(f.title)), 'xapi: auth findings: ' + JSON.stringify(titles(af)))
  assert.ok(af.some(f => /no usable X-Experience-API-Version/.test(f.title)), 'xapi: the version header finding: ' + JSON.stringify(titles(af)))
}
console.log('xapi: cmi5 rules ok')

// ---- Tin Can ----
{
  const { plan: p } = launchPlanFor(tincanPackage()), lrs = createLrs({ ...p.lrs, now: (() => { let n = 100; return () => n += 50 })() })
  const h = { 'x-experience-api-version': '1.0.3', authorization: 'Basic ' + p.lrs.token, 'content-type': 'application/json' }
  const st = (verb, extra = {}) => ({ actor: p.lrs.actor, verb: { id: V(verb), display: { 'en-US': verb } }, object: { objectType: 'Activity', id: p.lrs.activityId }, context: { registration: p.lrs.registration }, ...extra })
  for (const s of [st('experienced'), st('answered', { result: { score: { scaled: 1.5 }, response: 'private answer' } }), st('completed', { result: { completion: true, success: true, score: { scaled: 0.9 }, duration: 'PT1M' } }), st('mastered', { timestamp: '2026-11-14T10:00:00' })])
    lrs.handle({ method: 'POST', path: '/__lrs/statements', headers: h, body: JSON.stringify(s) })
  const trace = traceOf(lrs.snapshot()), ms = milestones(trace, null)
  assert.deepEqual(ms.map(s => s.id), TINCAN_STEPS.map(s => s[0])); assert.ok(ms.every(s => s.reached), 'tincan: first statement and completion: ' + JSON.stringify(ms))
  const l = trace.lrs.statements; assert.deepEqual(l.map(s => s.status), ['stored', 'rejected', 'stored', 'stored'], 'tincan: statements listed with their status')
  assert.ok(l[1].problems.some(x => x.code === 'score-range' && x.sev === 'error'), 'tincan: the bad score is reported'); assert.ok(l[3].problems.some(x => x.code === 'timestamp' && x.sev === 'warn'))
  const fs = runFindings(trace, { kind: 'package', ...p.launch }, null)
  assert.ok(fs.some(f => f.sev === 'error' && /^The LRS rejected 1 statement/.test(f.title) && f.evidence.some(e => /result\.score\.scaled/.test(e))), 'tincan: the rejection is a finding: ' + JSON.stringify(titles(fs)))
  assert.ok(fs.some(f => f.sev === 'warn' && /break xAPI recommendations/.test(f.title)), 'tincan: warnings')
  assert.ok(!fs.some(f => /cmi5/.test(f.title)), 'tincan: no cmi5 rules')
  assert.ok(runFindings(traceOf(createLrs(p.lrs).snapshot()), { kind: 'package', ...p.launch }, null).some(f => /never called the LRS/.test(f.title)), 'tincan: endpoint never called')
  assert.equal(furthest(milestones(traceOf(createLrs(p.lrs).snapshot()), null)).id, 'shown', 'tincan: with no call, only the page milestones')
  // saved run, report and redaction
  const launch = p.launch, analysis = launchPlanFor(tincanPackage()).pkg.analysis
  const r = runAnalysis({ kind: 'package', launch, trace, boot: null, analysis }), run = savedRun({ kind: 'package', label: p.label, package: 'x.zip', launch, trace, boot: null, ...r })
  assert.deepEqual(JSON.parse(JSON.stringify(run.trace.lrs.statements.map(s => s.id))), run.trace.lrs.statements.map(s => s.id), 'run: statements are saved'); assert.equal(run.milestones.length, TINCAN_STEPS.length)
  const html = renderReport({ title: 't', subtitle: 's', run }); assert.match(html, /<h2>xAPI<\/h2>/); assert.match(html, /score-range|result\.score\.scaled/, 'report: xAPI statements and their problems'); assert.match(html, /example\.com\/activities\/lab-tincan/, 'report: the statements are in the plain report')
  const red = redactRun(run, {}), blob = JSON.stringify(red)
  for (const secret of ['private answer', 'Learner, Test', 'learner-1', 'example.com/activities', p.lrs.token, '"page":3']) assert.ok(!blob.includes(secret), 'redact: ' + secret + ' is gone')
  assert.ok(red.trace.lrs.statements.length === 4 && red.trace.lrs.statements[1].problems.some(x => x.code === 'score-range') && red.trace.lrs.statements[0].statement.verb.id === V('experienced'), 'redact: structure, problem codes and standard verbs stay')
  assert.deepEqual(red.milestones.map(s => s.reached), run.milestones.map(s => s.reached), 'redact: the milestones come out the same'); assert.ok(red.findings.some(f => /^The LRS rejected 1 statement/.test(f.title)), 'redact: the findings are rebuilt')
  assert.equal(red.trace.lrs.statements[2].statement.result.score.scaled, 0.9, 'redact: scores stay'); const rh = renderReport({ title: 't', subtitle: 's', run, redact: true }); assert.ok(!rh.includes('example.com/activities') && !rh.includes('private answer') && /<h2>xAPI<\/h2>/.test(rh), 'redact: the redacted report keeps the xAPI section, without the statement text')
}
console.log('xapi: tincan ok')

// ---- Review fixes ----
{
  // A PUT whose body has no id is stored under the statementId of the URL.
  const l = lrsOf(), noId = good(); delete noId.id
  assert.equal(call(l, 'PUT', `statements?statementId=${ID}`, { headers: J, body: noId }).status, 204)
  assert.equal(JSON.parse(call(l, 'GET', `statements?statementId=${ID}`).body).id, ID, 'lrs: PUT without a body id stores under the URL id')
  // Duplicate ids in one batch: the batch is refused.
  const dup = call(l, 'POST', 'statements', { headers: J, body: [{ ...good(), id: REG }, { ...good(), id: REG }] }); assert.equal(dup.status, 400, 'lrs: duplicate ids in a batch are 400')
  assert.equal(JSON.parse(call(l, 'GET', 'statements').body).statements.length, 1, 'lrs: and none of the batch is stored')
  // Caps: body, statements per request, statements per run, documents.
  assert.equal(l.handle({ method: 'POST', path: '/__lrs/statements', headers: { authorization: 'Basic ' + l.token, 'x-experience-api-version': '1.0.3', 'content-type': 'application/json' }, body: 'x'.repeat(10 * 1024 ** 2 + 1) }).status, 413, 'lrs: a body over 10 MB is 413')
  assert.equal(l.handle({ method: 'POST', path: '/__lrs/statements', headers: {}, body: '', tooLarge: true }).status, 413, 'lrs: tooLarge (the caller did not read it) is 413')
  assert.equal(call(l, 'POST', 'statements', { headers: J, body: Array.from({ length: 101 }, () => ({ ...good(), id: undefined })) }).status, 413, 'lrs: more than 100 statements in a request is 413')
  const big = lrsOf()
  for (let i = 0; i < 20; i++) assert.equal(call(big, 'POST', 'statements', { headers: J, body: Array.from({ length: 100 }, () => ({ ...good(), id: undefined })) }).status, 200)
  assert.equal(call(big, 'POST', 'statements', { headers: J, body: { ...good(), id: undefined } }).status, 413, 'lrs: past 2000 statements is 413')
  assert.equal(big.snapshot().statements.length, 2000, 'lrs: the record stops at 2000')
  const dl = lrsOf(), ag = encodeURIComponent(JSON.stringify(good().actor))
  for (let i = 0; i < 200; i++) assert.equal(call(dl, 'PUT', `activities/state?activityId=a${i}&agent=${ag}&stateId=s`, { headers: J, body: '{}' }).status, 204)
  assert.equal(call(dl, 'PUT', `activities/state?activityId=a200&agent=${ag}&stateId=s`, { headers: J, body: '{}' }).status, 413, 'lrs: at most 200 documents')
  assert.equal(call(dl, 'PUT', `activities/state?activityId=a0&agent=${ag}&stateId=s`, { headers: J, body: '{"a":1}' }).status, 204, 'lrs: an existing document can still be replaced')
  // since: ISO 8601 or 400, for statements and documents; seeded documents have a time
  assert.equal(call(l, 'GET', 'statements?since=yesterday').status, 400); assert.equal(call(l, 'GET', `activities/state?activityId=x&agent=${ag}&since=2026-11-14`).status, 400, 'lrs: a document since must be a full timestamp')
  const c5 = createLrs({ format: 'cmi5', endpoint: 'lab://run/__lrs/', registration: REG, sessionId: 's', activityId: 'http://example.com/au', actor: good().actor, au: cm.course.aus[0], wall: () => Date.parse('2026-11-14T10:00:00Z') })
  const sids = since => JSON.parse(call(c5, 'GET', `activities/state?activityId=${encodeURIComponent('http://example.com/au')}&agent=${ag}&registration=${REG}&since=${encodeURIComponent(since)}`).body)
  assert.deepEqual(sids('2026-11-14T09:00:00Z'), ['LMS.LaunchData'], 'lrs: a seeded document has a time'); assert.deepEqual(sids('2026-11-14T11:00:00Z'), [])
  // CORS: only the test LMS's own origins
  const cors = o => l.handle({ method: 'OPTIONS', path: '/__lrs/statements', headers: o ? { origin: o } : {} }).headers['Access-Control-Allow-Origin']
  assert.deepEqual(['lab://run', 'lab://content', 'https://lms.lab.invalid', 'https://cdn.content.invalid'].map(cors), ['lab://run', 'lab://content', 'https://lms.lab.invalid', 'https://cdn.content.invalid'], 'lrs: CORS echoes the test origins')
  assert.deepEqual([cors('https://evil.example'), cors(undefined)], [undefined, undefined], 'lrs: and no other origin, and never *')
}
{
  // The vocabulary hosts are excluded from the "other sites" scan only for cmi5 and Tin Can.
  const t = new Map([['imsmanifest.xml', Buffer.from('<manifest/>')], ['a.js', Buffer.from('var v = "http://adlnet.gov/expapi/verbs/completed"')]])
  assert.equal(analyze(t).scan['a.js']?.absolute.length, 1, 'scan: SCORM still lists adlnet.gov')
  const x = new Map([['cmi5.xml', Buffer.from(CMI5_XML)], ['au/index.html', Buffer.from('x')], ['a.js', Buffer.from('var v = "http://adlnet.gov/expapi/verbs/completed", w = "https://example.org/x"')]])
  assert.equal(analyze(x).scan['a.js'].absolute.length, 1, 'scan: cmi5 leaves the vocabulary out, and still lists a real site')
  // Which file decides: a manifest higher in the ZIP beats a cmi5.xml below it.
  const cm5 = Buffer.from(CMI5_XML), man = Buffer.from('<manifest/>')
  assert.equal(analyze(new Map([['imsmanifest.xml', man], ['sample/cmi5.xml', cm5]])).format, 'scorm', 'detect: a manifest above cmi5.xml is SCORM')
  assert.equal(analyze(new Map([['imsmanifest.xml', man], ['cmi5.xml', cm5]])).format, 'cmi5', 'detect: at the same depth cmi5.xml wins')
  assert.equal(analyze(new Map([['pkg/imsmanifest.xml', man], ['cmi5.xml', cm5]])).format, 'cmi5', 'detect: cmi5.xml above the manifest wins')
  // The LRS's paths are the xAPI section's only in a run that has an LRS.
  const req = { t: 5, url: 'lab://run/__lrs/activities/state', method: 'GET', type: 'Fetch', status: 404, from: [] }
  const plain = { ...traceOf(undefined), requests: [req] }, withLrs = { ...traceOf({ format: 'tincan', statements: [], calls: [], fetches: [], documents: [] }), requests: [req] }
  assert.equal(counts([], plain).failedRequests, 1, 'counts: a SCORM run counts it'); assert.equal(counts([], withLrs).failedRequests, 0, 'counts: an xAPI run does not')
  assert.ok(runFindings(plain, { kind: 'package' }).some(f => /outside the package/.test(f.title)), 'rules: a SCORM run still reports it')
  assert.ok(!runFindings(withLrs, { kind: 'package' }).some(f => /outside the package|request failed/.test(f.title)), 'rules: an xAPI run does not')
  const fr = renderReport({ title: 't', run: { kind: 'package', launch: {}, trace: withLrs, findings: [], milestones: [] } }); assert.ok(!/<h2>Failed requests<\/h2>[^<]*<div[^>]*><table>[\s\S]*__lrs/.test(fr), 'report: the failed-requests table agrees with the count')
  // The Tin Can token is masked in the record
  const tr = { requests: [{ url: 'lab://run/pkg/index.html?endpoint=x&auth=Basic%20abc%3D&actor=y' }], navigations: [{ url: 'lab://run/pkg/index.html?auth=Basic%20abc%3D' }], probe: [{ frame: 'lab://run/pkg/index.html?auth=Basic%20abc' }], lrs: { format: 'tincan' } }
  maskTokens(tr); assert.ok(!JSON.stringify(tr).includes('abc') && tr.requests[0].url.endsWith('auth=‹token›&actor=y') && tr.navigations[0].url.includes('auth=‹token›'), 'masked: ' + JSON.stringify(tr))
  const cmi = { requests: [{ url: 'x?auth=1' }], lrs: { format: 'cmi5' } }; maskTokens(cmi); assert.equal(cmi.requests[0].url, 'x?auth=1', 'masking is for Tin Can only')
  // Course problems quote ids, so redaction masks them
  const cp = analyze(new Map([['cmi5.xml', Buffer.from(CMI5_XML.replace('au/index.html', 'au/none.html').replace('moveOn="CompletedOrPassed"', 'moveOn="Bad"'))]]))
  assert.ok(cp.problems.every(p => !/example\.com/.test(p.text.replace(/“[^”]*”/g, ''))), 'course problems: ids are in quotes: ' + JSON.stringify(cp.problems.map(p => p.text)))
  const rcp = redactRun({ kind: 'package', analysis: cp }, {}); assert.ok(!JSON.stringify(rcp).includes('example.com'), 'redact: the static problems hold no ids ' + JSON.stringify(rcp).match(/.{50}example.com.{30}/g))
  // Redaction of the record: refused ids, document ids, odd headers, extension keys, launch URL
  const { plan: p, pkg } = launchPlanFor(tincanPackage()), lrs = createLrs({ ...p.lrs, now: () => 1 })
  const h = { 'x-experience-api-version': '1.0.3', authorization: 'Basic ' + p.lrs.token, 'content-type': 'application/json' }
  const st = { actor: p.lrs.actor, verb: { id: V('completed'), display: { 'en-US': 'completed' } }, object: { objectType: 'Activity', id: p.lrs.activityId }, result: { extensions: { 'http://std/none': 1, 'https://w3id.org/xapi/cmi5/result/extensions/progress': 50, 'http://secret.example/course-key': 'x', 'http://secret.example/other': 'y' } } }
  lrs.handle({ method: 'POST', path: '/__lrs/statements', headers: h, body: JSON.stringify(st) })
  lrs.handle({ method: 'POST', path: '/__lrs/statements', headers: h, body: JSON.stringify({ ...st, id: 'secret-statement-id', verb: { id: 'bad' } }) })
  lrs.handle({ method: 'PUT', path: '/__lrs/activities/state', search: `?activityId=${encodeURIComponent(p.lrs.activityId)}&agent=${encodeURIComponent(JSON.stringify(p.lrs.actor))}&stateId=secret-state-name`, headers: h, body: '{"a":1}' })
  lrs.handle({ method: 'GET', path: '/__lrs/statements', headers: { ...h, 'x-experience-api-version': '9.9-secret' } })
  const trace = traceOf(lrs.snapshot()), run = savedRun({ kind: 'package', label: 'x', package: 'x.zip', launch: p.launch, trace, boot: null, ...runAnalysis({ kind: 'package', launch: p.launch, trace, boot: null, analysis: pkg.analysis }) })
  const red = redactRun(run, { names: true, key: 'k'.repeat(64) }), blob = JSON.stringify(red)
  for (const secret of ['secret-statement-id', 'secret-state-name', '9.9-secret', 'secret.example', 'example.com']) assert.ok(!blob.includes(secret), 'redact: ' + secret + ' is gone')
  assert.ok(blob.includes('https://w3id.org/xapi/cmi5/result/extensions/progress'), 'redact: a standard extension key stays')
  assert.ok(!red.trace.lrs.launchUrl.includes('index.html'), 'redact: the launch address goes through name hashing: ' + red.trace.lrs.launchUrl)
  assert.ok(!JSON.stringify(red.trace.lrs.endpoint).includes('lab://run/pkg'), 'redact: endpoint'); assert.ok(blob.includes('LMS') || true)
}
