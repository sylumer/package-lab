// xAPI 1.0.3 statement validation (P4.5), and what the statements of a run say. Pure.
// validateStatement(s) → [{ sev: 'error' | 'warn', code, path, text }]: errors are what the spec says an LRS must reject; warnings are
// what it only recommends. The texts never quote the statement's own values (they are course content: see redact.js).
import { isIri, verbName, cmi5Order, moveOnCheck } from './cmi5.js'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// An ISO 8601 date and time with a time zone, and a real calendar date.
export const isTimestamp = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)$/i.exec(s)
  if (!m) return false
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number), days = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return mo >= 1 && mo <= 12 && d >= 1 && d <= days && h <= 23 && mi <= 59 && se <= 60
}
const DURATION = /^P(?!$)(?:\d+(?:\.\d+)?Y)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?W)?(?:\d+(?:\.\d+)?D)?(?:T(?=\d)(?:\d+(?:\.\d+)?H)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?S)?)?$/
const LANG = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/
const INTERACTION = ['true-false', 'choice', 'fill-in', 'long-fill-in', 'matching', 'performance', 'sequencing', 'likert', 'numeric', 'other']
const TOP = ['id', 'actor', 'verb', 'object', 'result', 'context', 'timestamp', 'stored', 'authority', 'version', 'attachments']
const obj = v => v && typeof v === 'object' && !Array.isArray(v)

export function validateStatement(s, { sub = false } = {}) {
  const out = []
  const err = (path, code, text) => out.push({ sev: 'error', code, path, text })
  const warn = (path, code, text) => out.push({ sev: 'warn', code, path, text })
  const iri = (v, path, what) => { if (typeof v !== 'string' || !v) err(path, 'iri', `${path} is required: ${what} must be an IRI.`); else if (!isIri(v)) err(path, 'iri', `${path} isn’t an absolute IRI (it has no scheme, or has spaces).`) }
  const iriOpt = (v, path) => { if (v !== undefined && (typeof v !== 'string' || !isIri(v))) err(path, 'iri', `${path} isn’t an absolute IRI.`) }
  const langMap = (v, path) => {
    if (v === undefined) return
    if (!obj(v)) return err(path, 'language-map', `${path} must be a language map (language tag → text).`)
    for (const [k, x] of Object.entries(v)) { if (!LANG.test(k)) err(path, 'language-map', `${path} has a key that isn’t a language tag.`); if (typeof x !== 'string') err(path, 'language-map', `${path} has a value that isn’t text.`) }
  }
  const extensions = (v, path) => {
    if (v === undefined) return
    if (!obj(v)) return err(path, 'extensions', `${path} must be an object whose keys are IRIs.`)
    for (const k of Object.keys(v)) if (!isIri(k)) err(path, 'extensions', `${path} has a key that isn’t an IRI.`)
  }
  const uuid = (v, path) => { if (typeof v !== 'string' || !UUID.test(v)) err(path, 'uuid', `${path} must be a UUID.`) }
  const time = (v, path) => { if (v === undefined) return; if (typeof v !== 'string' || !isTimestamp(v)) { if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(v)) warn(path, 'timestamp', `${path} has no time zone: a timestamp should say its offset (Z or +hh:mm).`); else err(path, 'timestamp', `${path} isn’t an ISO 8601 date and time.`) } }

  const agent = (a, path, group = false) => {
    if (!obj(a)) return err(path, 'agent', `${path} must be an object.`)
    const type = a.objectType ?? 'Agent'
    if (type !== 'Agent' && !(group && type === 'Group')) return err(path, 'agent', `${path}.objectType must be ${group ? 'Agent or Group' : 'Agent'}.`)
    if (a.name !== undefined && typeof a.name !== 'string') err(path, 'agent', `${path}.name must be text.`)
    const ifis = ['mbox', 'mbox_sha1sum', 'openid', 'account'].filter(k => a[k] !== undefined)
    if (type === 'Group' && !ifis.length) {
      if (!Array.isArray(a.member) || !a.member.length) err(path, 'agent', `${path} is an anonymous Group, which must list its members.`)
      else a.member.forEach((m, i) => agent(m, `${path}.member[${i}]`))
      return
    }
    if (ifis.length !== 1) return err(path, 'agent', `${path} must have exactly one identifier (mbox, mbox_sha1sum, openid or account), not ${ifis.length}.`)
    if (a.mbox !== undefined && !(typeof a.mbox === 'string' && /^mailto:[^\s@]+@[^\s@]+$/.test(a.mbox))) err(path, 'agent', `${path}.mbox must be a mailto: address.`)
    if (a.mbox_sha1sum !== undefined && !(typeof a.mbox_sha1sum === 'string' && /^[0-9a-f]{40}$/i.test(a.mbox_sha1sum))) err(path, 'agent', `${path}.mbox_sha1sum must be a 40-digit SHA1.`)
    if (a.openid !== undefined) iri(a.openid, `${path}.openid`, 'the OpenID')
    if (a.account !== undefined) {
      if (!obj(a.account)) err(path, 'agent', `${path}.account must be an object with homePage and name.`)
      else { iri(a.account.homePage, `${path}.account.homePage`, 'the account’s home page'); if (typeof a.account.name !== 'string' || !a.account.name) err(path, 'agent', `${path}.account.name is required.`) }
    }
  }
  const activity = (a, path) => {
    if (!obj(a)) return err(path, 'activity', `${path} must be an object.`)
    iri(a.id, `${path}.id`, 'an Activity’s id')
    const d = a.definition
    if (d === undefined) return
    if (!obj(d)) return err(`${path}.definition`, 'activity', `${path}.definition must be an object.`)
    langMap(d.name, `${path}.definition.name`); langMap(d.description, `${path}.definition.description`)
    iriOpt(d.type, `${path}.definition.type`); iriOpt(d.moreInfo, `${path}.definition.moreInfo`); extensions(d.extensions, `${path}.definition.extensions`)
    if (d.interactionType !== undefined && !INTERACTION.includes(d.interactionType)) err(`${path}.definition.interactionType`, 'activity', `${path}.definition.interactionType isn’t an xAPI interaction type.`)
    if (d.correctResponsesPattern !== undefined && !(Array.isArray(d.correctResponsesPattern) && d.correctResponsesPattern.every(x => typeof x === 'string'))) err(path, 'activity', `${path}.definition.correctResponsesPattern must be a list of text.`)
    for (const k of ['choices', 'scale', 'source', 'target', 'steps']) if (d[k] !== undefined) {
      if (!Array.isArray(d[k])) err(path, 'activity', `${path}.definition.${k} must be a list.`)
      else d[k].forEach((c, i) => { if (!obj(c) || typeof c.id !== 'string') err(path, 'activity', `${path}.definition.${k}[${i}] needs an id.`); else langMap(c.description, `${path}.definition.${k}[${i}].description`) })
    }
  }
  const ref = (r, path) => { if (!obj(r) || r.objectType !== 'StatementRef') err(path, 'statement-ref', `${path} must be a StatementRef.`); else uuid(r.id, `${path}.id`) }

  if (!obj(s)) return [{ sev: 'error', code: 'statement', path: '', text: 'A statement must be a JSON object.' }]
  for (const k of Object.keys(s)) if (!TOP.includes(k) && !(sub && k === 'objectType')) err(k, 'unknown-property', `The statement has a property the standard doesn’t define (it may have only ${TOP.join(', ')}).`)
  if (s.id !== undefined) uuid(s.id, 'id')
  if (sub) { for (const k of ['id', 'stored', 'version', 'authority']) if (s[k] !== undefined) err(k, 'substatement', `A SubStatement must not have ${k}.`) }
  // actor, verb, object
  if (s.actor === undefined) err('actor', 'required', 'actor is required.'); else agent(s.actor, 'actor', true)
  if (s.verb === undefined) err('verb', 'required', 'verb is required.')
  else if (!obj(s.verb)) err('verb', 'verb', 'verb must be an object with an id.')
  else { iri(s.verb.id, 'verb.id', 'a verb’s id'); langMap(s.verb.display, 'verb.display'); if (isIri(s.verb.id) && !s.verb.display) warn('verb.display', 'verb-display', 'verb.display is missing: it is recommended, so people can read the statement.') }
  const o = s.object
  if (o === undefined) err('object', 'required', 'object is required.')
  else if (!obj(o)) err('object', 'object', 'object must be an object.')
  else {
    const type = o.objectType ?? 'Activity'
    if (type === 'Activity') activity(o, 'object')
    else if (type === 'Agent' || type === 'Group') agent(o, 'object', true)
    else if (type === 'StatementRef') ref(o, 'object')
    else if (type === 'SubStatement') {
      if (sub) err('object', 'substatement', 'A SubStatement’s object must not be another SubStatement.')
      else for (const p of validateStatement(o, { sub: true })) out.push({ ...p, path: 'object.' + p.path })
      if (o.objectType !== 'SubStatement') err('object', 'substatement', 'object.objectType must be “SubStatement”.')
    } else err('object', 'object', 'object.objectType must be Activity, Agent, Group, SubStatement or StatementRef.')
  }
  // result
  const r = s.result
  if (r !== undefined) {
    if (!obj(r)) err('result', 'result', 'result must be an object.')
    else {
      const sc = r.score
      if (sc !== undefined) {
        if (!obj(sc)) err('result.score', 'score', 'result.score must be an object.')
        else {
          for (const k of ['scaled', 'raw', 'min', 'max']) if (sc[k] !== undefined && !(typeof sc[k] === 'number' && Number.isFinite(sc[k]))) err('result.score.' + k, 'score', `result.score.${k} must be a number.`)
          if (typeof sc.scaled === 'number' && (sc.scaled < -1 || sc.scaled > 1)) err('result.score.scaled', 'score-range', 'result.score.scaled must be from -1 to 1.')
          if (typeof sc.min === 'number' && typeof sc.max === 'number' && sc.min >= sc.max) err('result.score', 'score-range', 'result.score.min must be less than max.')
          if (typeof sc.raw === 'number' && typeof sc.min === 'number' && sc.raw < sc.min) err('result.score.raw', 'score-range', 'result.score.raw is below min.')
          if (typeof sc.raw === 'number' && typeof sc.max === 'number' && sc.raw > sc.max) err('result.score.raw', 'score-range', 'result.score.raw is above max.')
        }
      }
      for (const k of ['success', 'completion']) if (r[k] !== undefined && typeof r[k] !== 'boolean') err('result.' + k, 'result', `result.${k} must be true or false.`)
      if (r.response !== undefined && typeof r.response !== 'string') err('result.response', 'result', 'result.response must be text.')
      if (r.duration !== undefined && !(typeof r.duration === 'string' && DURATION.test(r.duration))) err('result.duration', 'duration', 'result.duration isn’t an ISO 8601 duration.')
      extensions(r.extensions, 'result.extensions')
    }
  }
  // context
  const c = s.context
  if (c !== undefined) {
    if (!obj(c)) err('context', 'context', 'context must be an object.')
    else {
      if (c.registration !== undefined) uuid(c.registration, 'context.registration')
      if (c.instructor !== undefined) agent(c.instructor, 'context.instructor', true)
      if (c.team !== undefined) { if (!obj(c.team) || c.team.objectType !== 'Group') err('context.team', 'context', 'context.team must be a Group.'); else agent(c.team, 'context.team', true) }
      if (c.contextActivities !== undefined) {
        if (!obj(c.contextActivities)) err('context.contextActivities', 'context', 'context.contextActivities must be an object.')
        else for (const [k, v] of Object.entries(c.contextActivities)) {
          if (!['parent', 'grouping', 'category', 'other'].includes(k)) err('context.contextActivities', 'context', 'context.contextActivities has a key other than parent, grouping, category and other.')
          else (Array.isArray(v) ? v : [v]).forEach((a, i) => activity(a, `context.contextActivities.${k}[${i}]`))
          if (!Array.isArray(v) && ['parent', 'grouping', 'category', 'other'].includes(k)) warn(`context.contextActivities.${k}`, 'context-array', `context.contextActivities.${k} should be a list (a single object is accepted by an LRS, but 1.0.3 content sends a list).`)
        }
      }
      if (c.revision !== undefined && typeof c.revision !== 'string') err('context.revision', 'context', 'context.revision must be text.')
      if (c.platform !== undefined && typeof c.platform !== 'string') err('context.platform', 'context', 'context.platform must be text.')
      if ((c.revision !== undefined || c.platform !== undefined) && o && (o.objectType ?? 'Activity') !== 'Activity') err('context', 'context', 'context.revision and context.platform are only for a statement whose object is an Activity.')
      if (c.language !== undefined && !(typeof c.language === 'string' && LANG.test(c.language))) err('context.language', 'context', 'context.language isn’t a language tag.')
      if (c.statement !== undefined) ref(c.statement, 'context.statement')
      extensions(c.extensions, 'context.extensions')
    }
  }
  time(s.timestamp, 'timestamp'); time(s.stored, 'stored')
  if (s.version !== undefined && !(typeof s.version === 'string' && /^1\.0(\.\d+)?$/.test(s.version))) err('version', 'version', 'version must be 1.0 or 1.0.x.')
  if (s.authority !== undefined) agent(s.authority, 'authority', true)
  if (s.attachments !== undefined) {
    if (!Array.isArray(s.attachments)) err('attachments', 'attachments', 'attachments must be a list.')
    else s.attachments.forEach((a, i) => {
      const p = `attachments[${i}]`
      if (!obj(a)) return err(p, 'attachments', `${p} must be an object.`)
      iri(a.usageType, p + '.usageType', 'an attachment’s usageType'); langMap(a.display, p + '.display'); langMap(a.description, p + '.description')
      if (typeof a.contentType !== 'string' || !a.contentType) err(p, 'attachments', `${p}.contentType is required.`)
      if (!Number.isInteger(a.length) || a.length < 0) err(p, 'attachments', `${p}.length must be a whole number of bytes.`)
      if (typeof a.sha2 !== 'string' || !a.sha2) err(p, 'attachments', `${p}.sha2 is required.`)
      if (a.fileUrl !== undefined) iriOpt(a.fileUrl, p + '.fileUrl')
    })
  }
  return out
}

// ---- What a run's statements say (trace.lrs) ----
// The verb of a recorded statement, as the last part of its IRI ('completed'), and the AU's statements in the order cmi5 means: by
// timestamp, then arrival.
export const statementVerb = s => (s.statement?.verb?.id ?? '').replace(/^.*[/#]/, '')
const stamp = s => { const t = Date.parse(s.statement?.timestamp ?? ''); return Number.isNaN(t) ? 0 : t }
export const auStatements = lrs => (lrs?.statements ?? []).filter(s => s.by === 'au' && (s.status === 'stored' || s.status === 'duplicate')).sort((a, b) => stamp(a) - stamp(b) || a.n - b.n)

// One line for a recorded statement: verb, object and result ("completed · http://… · success · scaled 0.9").
export function statementSummary(e) {
  const st = e.statement ?? {}, r = st.result ?? {}, o = st.object ?? {}
  const what = o.definition?.name ? Object.values(o.definition.name)[0] : o.id ?? ''
  const bits = [r.completion === true && 'completion', r.success === true ? 'success' : r.success === false && 'failure', typeof r.score?.scaled === 'number' && `scaled ${r.score.scaled}`, r.duration && r.duration].filter(Boolean)
  return [statementVerb(e) || '(no verb)', String(what), ...bits].join(' · ')
}

// The milestone hits for a run with an LRS: { [step id]: { t, evidence } | undefined }.
export function lrsHits(lrs) {
  const sts = auStatements(lrs), has = (...verbs) => sts.find(s => verbs.includes(cmiVerb(s) || statementVerb(s)))
  const hit = (s, text) => s && { t: s.t, evidence: `${text} (statement #${s.n})` }
  if (lrs.format === 'cmi5') {
    const f = lrs.fetches?.find(x => x.ok)
    return { fetched: f && { t: f.t, evidence: 'the auth token was fetched' }, initialized: hit(has('initialized'), '“initialized” sent'),
      completed: hit(has('completed', 'passed', 'failed'), 'a completion or result statement sent'), terminated: hit(has('terminated'), '“terminated” sent') }
  }
  const done = sts.find(s => ['completed', 'passed', 'failed', 'mastered'].includes(statementVerb(s)) || s.statement?.result?.completion === true || s.statement?.result?.success === true)
  return { statement: hit(sts[0], 'the first statement'), completion: hit(done, `a “${done ? statementVerb(done) : ''}” statement`) }
}
const cmiVerb = s => verbName(s.statement)

// Findings from a run's LRS record. Worked out from what was recorded (problems found when each statement arrived, the verbs and the
// calls), not by validating again: a redacted run, whose statement text is masked, gives the same findings.
const MAX = 8
const some = (list, n = MAX) => list.slice(0, n)
export function lrsFindings(lrs) {
  if (!lrs) return []
  const out = [], all = lrs.statements ?? [], mine = all.filter(s => s.by === 'au'), calls = lrs.calls ?? [], cmi5 = lrs.format === 'cmi5'
  const with_ = (list, pred) => list.filter(s => (s.problems ?? []).some(pred))
  const lines = (list, pred, per = 2) => some(list).flatMap(s => s.problems.filter(pred).slice(0, per).map(p => `#${s.n} ${p.path || 'statement'}: ${p.text}`)).slice(0, MAX * 2)
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
  const aux = p => /^cmi5-/.test(p.code)

  // The endpoint
  const used = calls.filter(c => c.resource !== 'preflight')
  if (!used.length) out.push({ sev: 'error', title: `The content never called the LRS`,
    detail: `The launch gave it an endpoint (${lrs.endpoint}) ${cmi5 ? 'and a fetch URL' : 'and an auth token'}, and nothing was requested from it: no statement was sent, so nothing the learner does is recorded.`,
    evidence: [], fix: 'Check the launch parameters the content reads (endpoint, ' + (cmi5 ? 'fetch, actor, registration, activityId' : 'auth, actor, registration') + ') and its errors in the Console. Content that never starts usually failed before it reached the LRS code.' })
  else if (!mine.length && !all.some(s => s.status === 'rejected')) out.push({ sev: 'warn', title: 'The content used the LRS but sent no statements',
    detail: 'Without statements nothing is recorded: not progress, not completion.', evidence: some(used).map(c => `${c.method} ${c.resource} → ${c.status}`), fix: '' })

  // Requests the LRS refused or could not use, grouped by cause
  const callWith = code => used.filter(c => c.problems?.some(p => p.code === code))
  const v = callWith('version-missing').concat(callWith('version-bad'))
  if (v.length) out.push({ sev: 'error', title: `${plural(v.length, 'request')} had no usable X-Experience-API-Version header`,
    detail: 'Every xAPI request must say which version it speaks (1.0.0 to 1.0.3); an LRS refuses the rest with status 400, so these requests did nothing.',
    evidence: some(v).map(c => `${c.method} ${c.resource} → ${c.status}${c.version ? ' (version ' + c.version + ')' : ''}`), fix: 'Send X-Experience-API-Version: 1.0.3 with every request.' })
  const a = callWith('auth')
  if (a.length) out.push({ sev: 'error', title: `${plural(a.length, 'request')} to the LRS ${a.every(c => c.auth === 'missing') ? 'had no Authorization header' : 'weren’t authorised'}`,
    detail: `${cmi5 ? 'The AU gets its token by a POST to the fetch URL' : 'The launch gives the token as the auth parameter'}; every request then sends it as Authorization: Basic <token>. Without it the LRS answers 401.`,
    evidence: some(a).map(c => `${c.method} ${c.resource} → ${c.status} (${c.auth === 'missing' ? 'no Authorization header' : 'wrong token'})`), fix: cmi5 ? 'Fetch the token once from the fetch URL and send it on every request.' : 'Send the auth value from the launch URL as the Authorization header.' })
  const ct = callWith('content-type')
  if (ct.length) out.push({ sev: 'error', title: 'Statements were sent with the wrong Content-Type', detail: ct[0].problems.find(p => p.code === 'content-type').text, evidence: some(ct).map(c => `${c.method} ${c.resource} → ${c.status}`), fix: 'Send statements as application/json.' })
  const unknown = used.filter(c => c.resource === 'unknown')
  if (unknown.length) out.push({ sev: 'warn', title: `${plural(unknown.length, 'request')} asked the LRS for something it doesn’t have`, detail: 'The LRS has the statements, state, activity profile, agent profile and about resources.', evidence: some(unknown).map(c => `${c.method} ${c.status}`), fix: '' })
  const big = callWith('too-large')
  if (big.length) out.push({ sev: 'error', title: `${plural(big.length, 'request')} to the LRS ${big.length === 1 ? 'was' : 'were'} too large`, detail: big[0].problems.find(p => p.code === 'too-large').text, evidence: some(big).map(c => `${c.method} → ${c.status}`), fix: 'Send less in one request.' })
  const alt = callWith('alternate-syntax')
  if (alt.length) out.push({ sev: 'info', title: 'The content used the alternate request syntax', detail: alt[0].problems.find(p => p.code === 'alternate-syntax').text, evidence: [], fix: '' })

  // Statements
  const rejected = all.filter(s => s.status === 'rejected')
  if (rejected.length) out.push({ sev: 'error', title: `The LRS rejected ${plural(rejected.length, 'statement')}`,
    detail: 'A statement that breaks the xAPI 1.0.3 rules is refused with status 400, as a real LRS does: it is lost, and whatever it reported (progress, completion) is not recorded.',
    evidence: lines(rejected, p => p.sev === 'error', 3), fix: 'Correct the statement where the content builds it. The xAPI tab lists every problem with its place in the statement.' })
  const badVerb = all.filter(s => (s.problems ?? []).some(p => p.path === 'verb.id' && p.code === 'iri'))
  if (badVerb.length) out.push({ sev: 'error', title: `${plural(badVerb.length, 'statement')} ${badVerb.length === 1 ? 'has' : 'have'} a verb id that isn’t an IRI`,
    detail: 'A verb’s id must be an absolute IRI, such as http://adlnet.gov/expapi/verbs/completed. A bare word is not one, and an LRS refuses the statement.',
    evidence: some(badVerb).map(s => `#${s.n} verb.id`), fix: 'Use the verb’s full IRI.' })
  const warned = with_(all, p => p.sev === 'warn' && !aux(p) && p.code !== 'batch')
  if (warned.length) out.push({ sev: 'warn', title: `${plural(warned.length, 'statement')} break xAPI recommendations`, detail: 'The LRS accepted them, because the standard only recommends these.', evidence: lines(warned, p => p.sev === 'warn' && !aux(p)), fix: '' })

  // cmi5
  if (cmi5) {
    const fetched = lrs.fetches ?? []
    if (fetched.length > 1) out.push({ sev: 'warn', title: `cmi5: the AU fetched the auth token ${fetched.length} times`,
      detail: 'The fetch URL is one-time use: only the first request gets the token, and a second one gets error 1 (“already returned”). An AU should fetch once and keep the token.',
      evidence: fetched.map((f, i) => `${f.ok ? 'got the token' : 'got error 1'} at ${(f.t / 1000).toFixed(1)} s`), fix: 'Keep the token after the first fetch, and don’t fetch again on a reload or in another frame.' })
    const sts = auStatements(lrs), seq = sts.map(s => ({ verb: cmiVerb(s), t: s.t, n: s.n })).filter(x => x.verb)
    for (const o of cmi5Order(seq)) out.push({ sev: 'error', title: `cmi5: ${o.text}`, detail: 'cmi5 fixes the order of an AU’s statements: “initialized” first, “terminated” last, and “completed”, “passed” and “failed” only once and between them (“passed” and “failed” never both). A cmi5 LMS ignores or rejects a session that breaks the order.', evidence: o.evidence.slice(0, MAX), fix: 'Send “initialized” as soon as the AU is ready, and “terminated” last.' })
    for (const [code, title, detail, fix] of [
      ['cmi5-category', 'cmi5: statements without the cmi5 category activity', 'Every cmi5-defined statement (initialized, completed, passed, failed, terminated) must have the cmi5 category activity in context.contextActivities.category, so the LMS can find them.', 'Start each statement’s context from the contextTemplate in the LMS.LaunchData state document, and add the category on top.'],
      ['cmi5-sessionid', 'cmi5: statements without the session id', 'Every cmi5-defined statement must carry the session id from the LMS.LaunchData contextTemplate in context.extensions, so the LMS knows which launch it belongs to.', 'Copy context.extensions from the contextTemplate into each statement.'],
      ['cmi5-launch', 'cmi5: statements that don’t match the launch', 'A cmi5 statement must use the actor and registration the AU was launched with, and the AU’s own activity id as its object.', 'Use the actor, registration and activityId from the launch URL, unchanged.'],
      ['cmi5-id', 'cmi5: statements without an id', 'A cmi5 AU must give every statement it sends a UUID id.', 'Generate a UUID for each statement.'],
      ['cmi5-duration', 'cmi5: statements without a duration', 'The “initialized” statement needs none, but “completed”, “passed”, “failed” and “terminated” must carry result.duration (ISO 8601).', 'Add result.duration.'],
      ['cmi5-result', 'cmi5: statements with the wrong result', 'cmi5 fixes the result of each verb: “completed” has completion true, “passed” success true, “failed” success false, and only “passed” and “failed” may have a score.', 'Correct the result of these statements.'],
    ]) {
      const list = with_(sts, p => p.code === code)
      if (list.length) out.push({ sev: 'error', title: `${title} (${list.length})`, detail, evidence: lines(list, p => p.code === code, 1), fix })
    }
    const verbs = seq.map(x => x.verb), mo = moveOnCheck(lrs.moveOn, verbs)
    if (!mo.met && verbs.includes('initialized'))
      out.push({ sev: verbs.includes('terminated') ? 'warn' : 'info', title: `cmi5: moveOn ${mo.moveOn} isn’t satisfied`, detail: `The AU’s moveOn is ${mo.moveOn}, so an LMS counts it as done only after ${mo.need.map(x => '“' + x + '”').join(' and ')}. ${verbs.length ? `This session sent: ${[...new Set(verbs)].join(', ')}.` : ''}${verbs.includes('terminated') ? '' : ' The AU hadn’t terminated when the run ended, so it may simply not have finished.'}`,
        evidence: [], fix: 'Check that the AU sends the statements moveOn asks for, once the learner has completed or passed.' })
    const mastery = lrs.masteryScore !== '' && lrs.masteryScore != null ? +lrs.masteryScore : null
    if (mastery !== null) for (const s of sts) {
      const sc = s.statement?.result?.score?.scaled, vb = cmiVerb(s)
      if (typeof sc === 'number' && (vb === 'passed' && sc < mastery || vb === 'failed' && sc >= mastery))
        out.push({ sev: 'error', title: `cmi5: “${vb}” with a score that disagrees with masteryScore`, detail: `The AU’s masteryScore is ${mastery}: a “passed” score must reach it and a “failed” score must stay below it.`, evidence: [`#${s.n} ${vb}, scaled ${sc}`], fix: 'Decide pass or fail from the masteryScore in LMS.LaunchData.' })
    }
  }
  return out
}
