// The local LRS (P4.5): the learning record store a cmi5 or Tin Can package talks to, served at <lms origin>/__lrs/ (lab://run/__lrs/ in
// Electron, https://lab.invalid/__lrs/ in WebKit). Pure: createLrs(config) → { handle(request), snapshot() }. The same core serves
// both browsers; main.js and webkit-runner.js only carry requests to it. One LRS per run, in memory; snapshot() is trace.lrs.
//
// handle({ method, path, search, headers (names in lower case), body (string) }) → { status, headers, body (string) }.
// Follows xAPI 1.0.3 where it matters to content: the version header, Basic authorization, the statements resource (PUT, POST, GET with
// statementId, voidedStatementId, since, until, verb, activity, registration, agent, limit, ascending), the state, activity profile
// and agent profile resources (with concurrency headers on the profiles), about, and the alternate request syntax. cmi5 adds the fetch URL.
// Statements that break a MUST are refused with 400 and recorded; what the standard only recommends is accepted and recorded as a warning.
// See docs/developer-guide.md for the trace.lrs format.
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { validateStatement, UUID, isTimestamp } from './xapi.js'
import { cmi5StatementProblems, launchData, VERB, CATEGORY, SESSIONID } from './cmi5.js'

export const LRS_PATH = '/__lrs/'
export const VERSION = '1.0.3'
export const MAX_BODY = 10 * 1024 ** 2   // a request: main.js and the WebKit runner refuse bigger ones before reading them
const MAX_STATEMENTS = 2000, MAX_CALLS = 5000, MAX_DOC = 200 * 1024, MAX_BATCH = 100, MAX_DOCS = 200, MAX_DOC_BYTES = 5 * 1024 ** 2
// Only the test LMS's own origins may read the LRS from a page (not any site).
const ORIGINS = ['lab://run', 'lab://content', 'https://lab.invalid', 'https://content.invalid']
const JSON_TYPE = 'application/json'
const VOIDED = 'http://adlnet.gov/expapi/verbs/voided'
const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))
// The identifier of an agent: its one inverse functional identifier, as a string to key documents by.
const ifi = a => a?.mbox ?? a?.mbox_sha1sum ?? a?.openid ?? (a?.account ? `${a.account.homePage}#${a.account.name}` : null)

// config: { format ('cmi5' | 'tincan'), endpoint, token (the Basic credential, base64), registration, activityId, actor (Agent), fetchId (cmi5),
// sessionId, au (the cmi5 AU: { moveOn, masteryScore, launchMethod, launchParameters, entitlementKey }), launchUrl, now () → ms into the run, wall () → ms since epoch }
export function createLrs(config) {
  const { format, endpoint = '', registration, activityId, actor, now = () => 0, wall = () => Date.now(), au = null, sessionId = '', launchUrl = '' } = config
  const token = config.token ?? Buffer.from(`lab-${randomBytes(6).toString('hex')}:${randomBytes(12).toString('hex')}`).toString('base64')
  const fetchId = config.fetchId ?? randomBytes(12).toString('hex')
  const statements = [], byId = new Map(), calls = [], docs = new Map(), fetches = []
  let tokenIssued = false
  const iso = () => new Date(wall()).toISOString()
  const authority = { objectType: 'Agent', account: { homePage: endpoint.replace(/\/__lrs\/$/, '') || 'https://lab.invalid', name: 'scorm-lab' } }
  const out = (status, body = '', headers = {}) => ({ status, headers: { 'Content-Type': JSON_TYPE, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const fail = (status, text, extra) => ({ ...out(status, text, { 'Content-Type': 'text/plain; charset=utf-8' }), ...extra })

  // ---- Statements ----
  // Adds a statement to the record. by: 'au' | 'lms'. Returns the entry.
  const add = (statement, { by, via, status, problems }) => {
    const e = { n: statements.length + 1, id: statement?.id ?? '', t: now(), by, via, status, statement, problems }
    if (statements.length < MAX_STATEMENTS) { statements.push(e); if (status === 'stored' && e.id) byId.set(e.id, e) }
    return e
  }
  // One statement from the content: problems, then (if it is acceptable) stored with the LRS's own properties.
  const check = s => {
    const problems = validateStatement(s)
    if (format === 'cmi5') {
      if (s && typeof s === 'object' && !s.id) problems.push({ sev: 'warn', code: 'cmi5-id', path: 'id', text: 'A cmi5 AU must give each statement an id (a UUID); this one had none, so the LRS made one.' })
      problems.push(...cmi5StatementProblems(s ?? {}, { actor, registration, activityId, sessionId }).map(p => ({ ...p, sev: p.sev ?? 'error' })))
    }
    return problems
  }
  const finish = (s) => {
    const stored = { ...s, id: s.id ?? randomUUID(), stored: iso(), authority: s.authority ?? authority, version: s.version ?? '1.0.0' }
    stored.timestamp ??= stored.stored
    return stored
  }
  const core = s => { const { stored: _s, authority: _a, version: _v, ...r } = s; return r }
  const dupe = (incoming, old) => { const a = core(incoming), b = core(old); if (a.timestamp === undefined) delete b.timestamp; if (a.id === undefined) a.id = b.id; return same(a, b) }
  // A PUT or POST of statements: { res } (the response). All or nothing: one invalid statement refuses the whole request.
  const post = (body, via, idParam) => {
    let parsed
    try { parsed = JSON.parse(body) } catch { return { res: fail(400, 'The body isn’t JSON.') } }
    const list = via === 'PUT' ? [parsed] : Array.isArray(parsed) ? parsed : [parsed]
    if (list.length > MAX_BATCH) return { res: fail(413, `A request may carry at most ${MAX_BATCH} statements in this LRS.`) }
    if (statements.length >= MAX_STATEMENTS) return { res: fail(413, `This LRS keeps at most ${MAX_STATEMENTS} statements per run.`) }
    const entries = list.map(s => ({ s, problems: check(s) }))
    // A PUT may leave the id out of the body: it is the statementId in the URL.
    if (via === 'PUT' && parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.id === undefined) entries[0].s = { ...parsed, id: idParam }
    const seen = new Set()
    for (const x of entries) if (x.s?.id !== undefined) { if (seen.has(x.s.id)) x.problems.push({ sev: 'error', code: 'duplicate-id', path: 'id', text: 'Two statements in one request have the same id.' }); seen.add(x.s.id) }
    if (via === 'PUT' && parsed?.id !== undefined && parsed.id !== idParam) entries[0].problems.push({ sev: 'error', code: 'id-mismatch', path: 'id', text: 'The statement’s id doesn’t match the statementId in the URL.' })
    // Only what breaks xAPI is refused. A cmi5 rule broken (code cmi5-…) is recorded and accepted: the finding tells the author what a cmi5 LMS would object to.
    const refused = x => x.problems.some(p => p.sev === 'error' && !p.code.startsWith('cmi5-'))
    if (entries.some(refused)) {
      for (const x of entries) add(x.s, { by: 'au', via, status: 'rejected', problems: refused(x) || entries.length === 1 ? x.problems : [...x.problems, { sev: 'warn', code: 'batch', path: '', text: 'Refused with the rest of its batch: a request with an invalid statement stores none.' }] })
      return { res: fail(400, 'A statement breaks the xAPI rules: ' + entries.flatMap(x => x.problems.filter(p => p.sev === 'error')).slice(0, 3).map(p => p.text).join(' ')) }
    }
    for (const x of entries) { const old = x.s?.id && byId.get(x.s.id); if (old && !dupe(x.s, old.statement)) {
      add(x.s, { by: 'au', via, status: 'rejected', problems: [...x.problems, { sev: 'error', code: 'conflict', path: 'id', text: 'A statement with this id is already stored, and this one differs: ids are unique (409).' }] })
      return { res: fail(409, 'A different statement with this id is already stored.') } } }
    const ids = []
    for (const x of entries) {
      const old = x.s.id && byId.get(x.s.id)
      if (old) { ids.push(x.s.id); add(x.s, { by: 'au', via, status: 'duplicate', problems: x.problems }); continue }
      const st = finish(x.s)
      add(st, { by: 'au', via, status: 'stored', problems: x.problems })
      if (st.verb?.id === VOIDED && st.object?.objectType === 'StatementRef') { const t = byId.get(st.object.id); if (t && t.statement.verb?.id !== VOIDED) t.voided = true }
      ids.push(st.id)
    }
    return { res: via === 'PUT' ? { status: 204, headers: {}, body: '' } : out(200, ids) }
  }

  const matchAgent = (a, want, related) => { const k = ifi(want); return k && (ifi(a.actor) === k || (related && (ifi(a.object) === k || ifi(a.context?.instructor) === k))) }
  const get = q => {
    const one = q.get('statementId') ?? q.get('voidedStatementId'), voidedAsk = q.has('voidedStatementId')
    if (q.has('statementId') && q.has('voidedStatementId')) return fail(400, 'Use statementId or voidedStatementId, not both.')
    if (one !== null) {
      const others = [...q.keys()].filter(k => !['statementId', 'voidedStatementId', 'format', 'attachments'].includes(k))
      if (others.length) return fail(400, `statementId can’t be combined with ${others.join(', ')}.`)
      const e = byId.get(one)
      if (!e || !!e.voided !== voidedAsk) return fail(404, 'No such statement.')
      return out(200, e.statement)
    }
    let list = [...byId.values()].filter(e => !e.voided)
    let agent = null
    if (q.has('agent')) { try { agent = JSON.parse(q.get('agent')) } catch { return fail(400, 'agent isn’t JSON.') } }
    for (const k of ['since', 'until']) if (q.has(k) && !isTimestamp(q.get(k))) return fail(400, `${k} isn’t an ISO 8601 timestamp.`)
    const lim = q.has('limit') ? +q.get('limit') : 0
    if (!Number.isInteger(lim) || lim < 0) return fail(400, 'limit must be a whole number.')
    if (q.has('since')) list = list.filter(e => Date.parse(e.statement.stored) > Date.parse(q.get('since')))
    if (q.has('until')) list = list.filter(e => Date.parse(e.statement.stored) <= Date.parse(q.get('until')))
    if (q.has('verb')) list = list.filter(e => e.statement.verb?.id === q.get('verb'))
    if (q.has('registration')) list = list.filter(e => e.statement.context?.registration === q.get('registration'))
    if (q.has('activity')) {
      const rel = q.get('related_activities') === 'true', id = q.get('activity')
      list = list.filter(e => e.statement.object?.id === id || rel && Object.values(e.statement.context?.contextActivities ?? {}).flat().some(a => a?.id === id))
    }
    if (agent) list = list.filter(e => matchAgent(e.statement, agent, q.get('related_agents') === 'true'))
    list.sort((a, b) => a.n - b.n)
    if (q.get('ascending') !== 'true') list.reverse()
    const ids = q.get('format') === 'ids'
    return out(200, { statements: (lim ? list.slice(0, lim) : list).map(e => ids ? { id: e.statement.id } : e.statement), more: '' })
  }

  // ---- Documents: state, activity profile, agent profile ----
  const docKey = (kind, p) => [kind, p.activityId ?? '', p.agent ?? '', p.registration ?? '', p.id].join('\n')
  const seed = (kind, p, value, by = 'lms') => { docs.set(docKey(kind, p), { kind, ...p, contentType: JSON_TYPE, value: JSON.stringify(value), t: now(), wall: wall(), writes: 1, by, etag: etag(JSON.stringify(value)) }) }
  const etag = v => `"${createHash('sha1').update(v).digest('hex')}"`
  const document = (kind, method, q, h, body) => {
    const name = kind === 'state' ? 'stateId' : 'profileId', p = { activityId: q.get('activityId') ?? undefined, agent: q.get('agent') ?? undefined, registration: q.get('registration') ?? undefined }
    const need = kind === 'state' ? ['activityId', 'agent'] : kind === 'activity-profile' ? ['activityId'] : ['agent']
    for (const k of need) if (!p[k]) return fail(400, `${k} is required.`)
    if (p.agent) { try { const a = JSON.parse(p.agent); if (!ifi(a)) throw 0; p.agent = ifi(a) } catch { return fail(400, 'agent isn’t a JSON Agent with an identifier.') } }
    if (kind !== 'state') delete p.registration
    if (kind === 'agent-profile') delete p.activityId
    if (kind === 'activity-profile') delete p.agent
    const id = q.get(name)
    if (method === 'GET' && id === null) {
      if (q.has('since') && !isTimestamp(q.get('since'))) return fail(400, 'since isn’t an ISO 8601 timestamp.')
      const since = q.has('since') ? Date.parse(q.get('since')) : 0
      const mine = [...docs.values()].filter(d => d.kind === kind && d.activityId === p.activityId && d.agent === p.agent && (kind !== 'state' || (d.registration ?? '') === (p.registration ?? '')))
      return out(200, mine.filter(d => !since || (d.wall ?? 0) > since).map(d => d.id))
    }
    if (method === 'DELETE' && id === null) {
      if (kind !== 'state') return fail(400, `${name} is required.`)
      for (const [k, d] of docs) if (d.kind === 'state' && d.activityId === p.activityId && d.agent === p.agent && (d.registration ?? '') === (p.registration ?? '')) docs.delete(k)
      return { status: 204, headers: {}, body: '' }
    }
    if (id === null) return fail(400, `${name} is required.`)
    const key = docKey(kind, { ...p, id }), cur = docs.get(key), ctype = (h['content-type'] ?? '').split(';')[0].trim()
    const ifMatch = h['if-match'], ifNone = h['if-none-match']
    if (method === 'GET') return cur ? { status: 200, headers: { 'Content-Type': cur.contentType, ETag: cur.etag }, body: cur.value } : fail(404, 'No such document.')
    // Concurrency (xAPI 1.0.3 §3.1) is required for the two profile resources; a state document may use it.
    if (kind !== 'state' || ifMatch || ifNone) {
      if (ifMatch && (!cur || ifMatch !== cur.etag)) return fail(412, 'If-Match doesn’t match the stored document.')
      if (ifNone && (ifNone === '*' ? !!cur : cur && ifNone === cur.etag)) return fail(412, 'If-None-Match: the document exists.')
      if (kind !== 'state' && method !== 'GET' && cur && !ifMatch && !ifNone && method === 'PUT') return fail(409, 'The document exists: a PUT needs If-Match or If-None-Match.')
    }
    if (method === 'DELETE') { docs.delete(key); return { status: 204, headers: {}, body: '' } }
    if (!ctype) return fail(400, 'A document needs a Content-Type.')
    if (body.length > MAX_DOC) return fail(413, 'The document is too large for this LRS.')
    const total = [...docs.values()].reduce((n, d) => n + d.value.length, 0) - (cur?.value.length ?? 0)
    if (!cur && docs.size >= MAX_DOCS || total + body.length > MAX_DOC_BYTES) return fail(413, `This LRS keeps at most ${MAX_DOCS} documents and ${MAX_DOC_BYTES / 1024 ** 2} MB of them.`)
    let value = body
    if (method === 'POST' && cur) {
      let a, b
      try { a = JSON.parse(cur.value); b = JSON.parse(body) } catch { return fail(400, 'POST merges JSON objects: one of the documents isn’t JSON.') }
      if (cur.contentType !== JSON_TYPE || ctype !== JSON_TYPE || !a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return fail(400, 'POST merges JSON objects: both documents must be JSON objects.')
      value = JSON.stringify({ ...a, ...b })
    } else if (method === 'POST' && ctype === JSON_TYPE) { try { const b = JSON.parse(body); if (!b || typeof b !== 'object' || Array.isArray(b)) throw 0 } catch { return fail(400, 'A JSON document must be a JSON object to be merged.') } }
    docs.set(key, { kind, ...p, id, contentType: method === 'POST' && cur ? JSON_TYPE : ctype, value, t: now(), wall: wall(), writes: (cur?.writes ?? 0) + 1, by: 'au', etag: etag(value) })
    return { status: 204, headers: { ETag: etag(value) }, body: '' }
  }

  // ---- The LMS's own part: what a cmi5 LMS records before it launches an AU ----
  if (format === 'cmi5') {
    const data = launchData({ au: au ?? {}, activityId, sessionId })
    seed('state', { activityId, agent: ifi(actor), registration, id: 'LMS.LaunchData' }, data)
    seed('agent-profile', { agent: ifi(actor), id: 'cmi5LearnerPreferences' }, { languagePreference: 'en-US', audioPreference: 'off' })
    const ext = { [SESSIONID]: sessionId, 'https://w3id.org/xapi/cmi5/context/extensions/launchmode': 'Normal', 'https://w3id.org/xapi/cmi5/context/extensions/launchurl': launchUrl,
      'https://w3id.org/xapi/cmi5/context/extensions/moveon': au?.moveOn || 'NotApplicable', ...(au?.masteryScore !== '' && au?.masteryScore != null ? { 'https://w3id.org/xapi/cmi5/context/extensions/masteryscore': +au.masteryScore } : {}) }
    const s = finish({ actor, verb: { id: VERB('launched'), display: { 'en-US': 'launched' } }, object: { objectType: 'Activity', id: activityId },
      context: { registration, contextActivities: { category: [{ objectType: 'Activity', id: CATEGORY }], grouping: [{ objectType: 'Activity', id: activityId }] }, extensions: ext } })
    add(s, { by: 'lms', via: 'PUT', status: 'stored', problems: [] })
  }

  // ---- Requests ----
  const about = () => out(200, { version: [VERSION, '1.0.2', '1.0.1', '1.0.0'], extensions: { 'https://scorm-lab.invalid/extensions/lrs': 'SCORM Lab’s local LRS' } })
  const CORS = { 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Experience-API-Version, If-Match, If-None-Match, Accept, Accept-Language',
    'Access-Control-Expose-Headers': 'ETag, X-Experience-API-Version, X-Experience-API-Consistent-Through', 'Access-Control-Max-Age': '600' }

  function handle(req) {
    let { method, path, search = '', headers: h = {}, body = '' } = req
    const rest = path.startsWith(LRS_PATH) ? path.slice(LRS_PATH.length - 1) : path   // '/statements'
    let q = new URLSearchParams(search)
    const origin = ORIGINS.includes(h.origin) ? { 'Access-Control-Allow-Origin': h.origin, Vary: 'Origin' } : {}
    const call = { t: now(), method, resource: '', params: [], status: 0, auth: 'n/a', version: '', problems: [] }
    const done = r => {
      r.headers = { ...CORS, ...origin, 'X-Experience-API-Version': VERSION, 'X-Experience-API-Consistent-Through': iso(), ...r.headers }
      call.status = r.status
      if (calls.length < MAX_CALLS) calls.push(call)
      return r
    }
    const problem = (sev, code, text) => call.problems.push({ sev, code, text })
    if (req.tooLarge || body.length > MAX_BODY) { call.resource = 'too-large'; call.problems.push({ sev: 'error', code: 'too-large', text: `The request body is over ${MAX_BODY / 1024 ** 2} MB, which this LRS refuses.` }); return done(fail(413, 'The request body is too large.')) }
    if (method === 'OPTIONS') { call.resource = 'preflight'; return done({ status: 204, headers: {}, body: '' }) }
    // The alternate request syntax (xAPI 1.0.3 §7.8): a POST with method=… and the headers and content in a form body.
    if (method === 'POST' && q.has('method') && rest !== `/auth/fetch/${fetchId}`) {
      const form = new URLSearchParams(body), real = (q.get('method') ?? '').toUpperCase()
      if (!['GET', 'PUT', 'POST', 'DELETE'].includes(real)) return done(fail(400, 'method must be GET, PUT, POST or DELETE.'))
      q = new URLSearchParams(); h = { ...h }
      for (const [k, v] of form) {
        if (k === 'content') body = v
        else if (/^(authorization|x-experience-api-version|content-type|content-length|if-match|if-none-match)$/i.test(k)) h[k.toLowerCase()] = v
        else q.append(k, v)
      }
      if (!form.has('content')) body = ''
      method = real; call.method = real; problem('warn', 'alternate-syntax', 'The request used the alternate request syntax (a POST with method=…), meant for old browsers.')
    }
    call.params = [...new Set([...q.keys()])]
    call.version = h['x-experience-api-version'] ?? ''
    // The cmi5 fetch URL: a POST that returns the auth token once.
    if (format === 'cmi5' && rest === `/auth/fetch/${fetchId}`) {
      call.resource = 'fetch'; call.auth = 'n/a'
      if (method !== 'POST') { problem('error', 'fetch-get', 'The fetch URL was requested with ' + method + '; cmi5 requires a POST (a GET is not allowed, to prevent caching).'); return done(fail(405, 'The fetch URL takes a POST.', { headers: { Allow: 'POST' } })) }
      const first = !tokenIssued
      tokenIssued = true; fetches.push({ t: now(), ok: first })
      return done(first ? out(200, { 'auth-token': token }, { 'Cache-Control': 'no-store' }) : out(200, { 'error-code': '1', 'error-text': 'The authorization token has already been returned.' }, { 'Cache-Control': 'no-store' }))
    }
    const route = rest.replace(/\/+$/, '')
    const kind = route === '/statements' ? 'statements' : route === '/activities/state' ? 'state' : route === '/activities/profile' ? 'activity-profile' : route === '/agents/profile' ? 'agent-profile' : route === '/about' ? 'about' : ''
    call.resource = kind || 'unknown'
    if (!kind) return done(fail(404, `${path} isn’t an xAPI resource this LRS has.`))
    if (kind !== 'about') {
      const m = /^Basic (.+)$/i.exec(h.authorization ?? '')
      call.auth = !h.authorization ? 'missing' : m && m[1].trim() === token ? 'ok' : 'bad'
      if (call.auth !== 'ok') { problem('error', 'auth', call.auth === 'missing' ? 'The request had no Authorization header.' : 'The Authorization header isn’t the token this LRS gave.'); return done(fail(401, 'Unauthorized.')) }
    }
    const v = call.version
    if (kind !== 'about' || v) {
      if (!v) { problem('error', 'version-missing', 'The request had no X-Experience-API-Version header, which every xAPI request needs.'); return done(fail(400, 'The X-Experience-API-Version header is required.')) }
      if (!/^1\.0(\.\d+)?$/.test(v)) { problem('error', 'version-bad', 'The X-Experience-API-Version header isn’t 1.0 or 1.0.x, which is all this LRS speaks.'); return done(fail(400, `Version ${v} isn’t supported: this LRS speaks 1.0.x.`)) }
    }
    if (kind === 'about') return done(method === 'GET' ? about() : fail(405, 'about takes a GET.'))
    if (!['GET', 'PUT', 'POST', 'DELETE'].includes(method)) return done(fail(405, 'Method not allowed.'))
    if (kind === 'statements') {
      if (method === 'DELETE') return done(fail(405, 'Statements can’t be deleted.'))
      if (method === 'GET') return done(get(q))
      const ct = (h['content-type'] ?? '').split(';')[0].trim().toLowerCase()
      if (ct !== JSON_TYPE) { problem('error', 'content-type', ct ? 'Statements were sent with a Content-Type other than application/json.' : 'The statements request had no Content-Type; it must be application/json.'); return done(fail(400, 'The Content-Type must be application/json.')) }
      if (method === 'PUT' && !q.has('statementId')) return done(fail(400, 'A PUT needs the statementId parameter.'))
      if (method === 'PUT' && !UUID.test(q.get('statementId'))) return done(fail(400, 'statementId must be a UUID.'))
      const r = post(body, method, q.get('statementId'))
      if (r.res.status >= 400) problem('error', 'rejected', 'The LRS refused the statements: see the xAPI tab for each problem.')
      return done(r.res)
    }
    return done(document(kind, method, q, h, body))
  }

  // ---- The record ----
  const snapshot = () => ({ format, endpoint, registration, activityId, actor, sessionId, launchUrl, tokenIssued,
    ...(format === 'cmi5' ? { moveOn: au?.moveOn || 'NotApplicable', masteryScore: au?.masteryScore ?? '', launchMethod: au?.launchMethod || 'AnyWindow' } : {}),
    fetches: fetches.slice(), calls: calls.slice(), statements: statements.map(e => ({ ...e, ...(e.voided ? { voided: true } : {}) })),
    documents: [...docs.values()].map(({ kind, id, activityId, agent, registration, contentType, value, t, writes, by }) => ({ kind, id, ...(activityId ? { activityId } : {}), ...(agent ? { agent } : {}), ...(registration ? { registration } : {}), contentType, value, t, writes, by })),
    truncated: statements.length >= MAX_STATEMENTS || calls.length >= MAX_CALLS })
  return { handle, snapshot, token, fetchId }
}

// The Tin Can launch URL must carry the auth token (the launch convention), so the run's record is cleaned of it: every `auth=` value in
// the trace's text (requests, navigations, probe and console text) becomes ‹token›. Changes the trace in place; a no-op for other runs.
export function maskTokens(trace) {
  if (trace?.lrs?.format !== 'tincan') return trace
  const re = /([?&]auth=)[^&#\s"']*/g
  const walk = v => {
    if (typeof v === 'string') return v.includes('auth=') ? v.replace(re, '$1‹token›') : v
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = walk(v[i]); return v }
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = walk(v[k]); return v }
    return v
  }
  walk(trace.requests); walk(trace.navigations); walk(trace.targets); walk(trace.probe); walk(trace.console); walk(trace.log); walk(trace.exceptions); walk(trace.exec)
  return trace
}
