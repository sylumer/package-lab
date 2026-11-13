// SCORM 1.2 and 2004 run-time, copied from toolbox (assets/js/elearning.js and the time helpers in tools.js).
// Loaded as a classic script by the host page; exposes scormRuntime on globalThis.
function span12(s) { const m = String(s).match(/^(\d{2,4}):([0-5]\d):([0-5]\d)(\.\d{1,2})?$/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +(m[4] || 0) : null }
const span12Text = t => { t = Math.round(t * 100) / 100; const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = (t % 60).toFixed(2); return `${String(h).padStart(4, '0')}:${String(m).padStart(2, '0')}:${s.padStart(5, '0')}` }
function dur04(s) {
  const m = String(s).match(/^P(?!$)(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?=\d)(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d{1,2})?)S)?)?$/)
  return m ? [31536000, 2592000, 86400, 3600, 60, 1].reduce((t, k, i) => t + (+(m[i + 1] || 0)) * k, 0) : null
}
const dur04Text = t => { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.round(t % 60 * 100) / 100; return `PT${h ? h + 'H' : ''}${m ? m + 'M' : ''}${s || (!h && !m) ? s + 'S' : ''}` }
// SCORM 1.2's API and SCORM 2004's API_1484_11, kept as a flat map of data model values, with the error codes,
// read-only and write-only elements, vocabularies, lengths and array rules of each version.
// ponytail: interaction responses (correct_responses, learner_response) are checked for length only, not against
// each interaction type's pattern grammar; add that if content authors need it.
const SCORM_ERRORS = {
  '1.2': { 0: 'No error', 101: 'General exception', 201: 'Invalid argument error', 202: 'Element cannot have children', 203: 'Element not an array. Cannot have count', 301: 'Not initialized', 401: 'Not implemented error', 402: 'Invalid set value, element is a keyword', 403: 'Element is read only', 404: 'Element is write only', 405: 'Incorrect data type' },
  '2004': { 0: 'No Error', 101: 'General Exception', 102: 'General Initialization Failure', 103: 'Already Initialized', 104: 'Content Instance Terminated', 111: 'General Termination Failure', 112: 'Termination Before Initialization', 113: 'Termination After Termination', 122: 'Retrieve Data Before Initialization', 123: 'Retrieve Data After Termination', 132: 'Store Data Before Initialization', 133: 'Store Data After Termination', 142: 'Commit Before Initialization', 143: 'Commit After Termination', 201: 'General Argument Error', 301: 'General Get Failure', 351: 'General Set Failure', 391: 'General Commit Failure', 401: 'Undefined Data Model Element', 402: 'Unimplemented Data Model Element', 403: 'Data Model Element Value Not Initialized', 404: 'Data Model Element Is Read Only', 405: 'Data Model Element Is Write Only', 406: 'Data Model Element Type Mismatch', 407: 'Data Model Element Value Out Of Range', 408: 'Data Model Dependency Not Established' },
}
// The data models: element (with n for an array index) → [access r/w/rw, type]. Types: s<max> (characters),
// d (decimal), d<lo>:<hi>, i<lo>:<hi> (integer), v:<a|b|…> (vocabulary), span (1.2 HHHH:MM:SS.SS), dur (ISO 8601
// duration), ts (ISO 8601 time), id (identifier), any.
const SCORM12_MODEL = {
  'cmi.core.student_id': ['r'], 'cmi.core.student_name': ['r'], 'cmi.core.lesson_location': ['rw', 's255'], 'cmi.core.credit': ['r'],
  'cmi.core.lesson_status': ['rw', 'v:passed|completed|failed|incomplete|browsed'], 'cmi.core.entry': ['r'],
  'cmi.core.score.raw': ['rw', 'd0:100'], 'cmi.core.score.max': ['rw', 'd0:100'], 'cmi.core.score.min': ['rw', 'd0:100'],
  'cmi.core.total_time': ['r'], 'cmi.core.lesson_mode': ['r'], 'cmi.core.exit': ['w', 'v:time-out|suspend|logout|'], 'cmi.core.session_time': ['w', 'span'],
  'cmi.suspend_data': ['rw', 's4096'], 'cmi.launch_data': ['r'], 'cmi.comments': ['rw', 's4096'], 'cmi.comments_from_lms': ['r'],
  'cmi.objectives.n.id': ['rw', 'id'], 'cmi.objectives.n.score.raw': ['rw', 'd0:100'], 'cmi.objectives.n.score.max': ['rw', 'd0:100'], 'cmi.objectives.n.score.min': ['rw', 'd0:100'],
  'cmi.objectives.n.status': ['rw', 'v:passed|completed|failed|incomplete|browsed|not attempted'],
  'cmi.student_data.mastery_score': ['r'], 'cmi.student_data.max_time_allowed': ['r'], 'cmi.student_data.time_limit_action': ['r'],
  'cmi.student_preference.audio': ['rw', 'i-1:100'], 'cmi.student_preference.language': ['rw', 's255'], 'cmi.student_preference.speed': ['rw', 'i-100:100'], 'cmi.student_preference.text': ['rw', 'i-1:1'],
  'cmi.interactions.n.id': ['w', 'id'], 'cmi.interactions.n.objectives.n.id': ['w', 'id'], 'cmi.interactions.n.time': ['w', 'time12'],
  'cmi.interactions.n.type': ['w', 'v:true-false|choice|fill-in|matching|performance|sequencing|likert|numeric'],
  'cmi.interactions.n.correct_responses.n.pattern': ['w', 's255'], 'cmi.interactions.n.weighting': ['w', 'd'], 'cmi.interactions.n.student_response': ['w', 's255'],
  'cmi.interactions.n.result': ['w', 'v:correct|wrong|unanticipated|neutral|d'], 'cmi.interactions.n.latency': ['w', 'span'],
}
const SCORM12_CHILDREN = { 'cmi.core': 'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time',
  'cmi.core.score': 'raw,min,max', 'cmi.objectives': 'id,score,status', 'cmi.objectives.n.score': 'raw,min,max', 'cmi.student_data': 'mastery_score,max_time_allowed,time_limit_action',
  'cmi.student_preference': 'audio,language,speed,text', 'cmi.interactions': 'id,objectives,time,type,correct_responses,weighting,student_response,result,latency' }
const SCORM04_MODEL = {
  'cmi._version': ['r'], 'cmi.comments_from_learner.n.comment': ['rw', 's4000'], 'cmi.comments_from_learner.n.location': ['rw', 's250'], 'cmi.comments_from_learner.n.timestamp': ['rw', 'ts'],
  'cmi.comments_from_lms.n.comment': ['r'], 'cmi.comments_from_lms.n.location': ['r'], 'cmi.comments_from_lms.n.timestamp': ['r'],
  'cmi.completion_status': ['rw', 'v:completed|incomplete|not attempted|unknown'], 'cmi.completion_threshold': ['r'], 'cmi.credit': ['r'], 'cmi.entry': ['r'],
  'cmi.exit': ['w', 'v:time-out|suspend|logout|normal|'],
  'cmi.interactions.n.id': ['rw', 'uri'], 'cmi.interactions.n.type': ['rw', 'v:true-false|choice|fill-in|long-fill-in|likert|matching|performance|sequencing|numeric|other'],
  'cmi.interactions.n.objectives.n.id': ['rw', 'uri'], 'cmi.interactions.n.timestamp': ['rw', 'ts'], 'cmi.interactions.n.correct_responses.n.pattern': ['rw', 's4000'],
  'cmi.interactions.n.weighting': ['rw', 'd'], 'cmi.interactions.n.learner_response': ['rw', 's4000'], 'cmi.interactions.n.result': ['rw', 'v:correct|incorrect|unanticipated|neutral|d'],
  'cmi.interactions.n.latency': ['rw', 'dur'], 'cmi.interactions.n.description': ['rw', 's250'],
  'cmi.launch_data': ['r'], 'cmi.learner_id': ['r'], 'cmi.learner_name': ['r'],
  'cmi.learner_preference.audio_level': ['rw', 'd0:'], 'cmi.learner_preference.language': ['rw', 's250'], 'cmi.learner_preference.delivery_speed': ['rw', 'd0:'], 'cmi.learner_preference.audio_captioning': ['rw', 'v:-1|0|1'],
  'cmi.location': ['rw', 's1000'], 'cmi.max_time_allowed': ['r'], 'cmi.mode': ['r'],
  'cmi.objectives.n.id': ['rw', 'uri'], 'cmi.objectives.n.score.scaled': ['rw', 'd-1:1'], 'cmi.objectives.n.score.raw': ['rw', 'd'], 'cmi.objectives.n.score.min': ['rw', 'd'], 'cmi.objectives.n.score.max': ['rw', 'd'],
  'cmi.objectives.n.success_status': ['rw', 'v:passed|failed|unknown'], 'cmi.objectives.n.completion_status': ['rw', 'v:completed|incomplete|not attempted|unknown'],
  'cmi.objectives.n.progress_measure': ['rw', 'd0:1'], 'cmi.objectives.n.description': ['rw', 's250'],
  'cmi.progress_measure': ['rw', 'd0:1'], 'cmi.scaled_passing_score': ['r'], 'cmi.score.scaled': ['rw', 'd-1:1'], 'cmi.score.raw': ['rw', 'd'], 'cmi.score.min': ['rw', 'd'], 'cmi.score.max': ['rw', 'd'],
  'cmi.session_time': ['w', 'dur'], 'cmi.success_status': ['rw', 'v:passed|failed|unknown'], 'cmi.suspend_data': ['rw', 's64000'], 'cmi.time_limit_action': ['r'], 'cmi.total_time': ['r'],
  'adl.nav.request': ['rw', 'nav'], 'adl.nav.request_valid.continue': ['r'], 'adl.nav.request_valid.previous': ['r'],
}
// The arrays, whose _count can be read.
const SCORM_ARRAYS = /^cmi\.(objectives|interactions|comments_from_learner|comments_from_lms)$|\.(objectives|correct_responses)$/
const SCORM04_CHILDREN = { 'cmi.comments_from_learner': 'comment,location,timestamp', 'cmi.comments_from_lms': 'comment,location,timestamp',
  'cmi.interactions': 'id,type,objectives,timestamp,correct_responses,weighting,learner_response,result,latency,description', 'cmi.learner_preference': 'audio_level,language,delivery_speed,audio_captioning',
  'cmi.objectives': 'id,score,success_status,completion_status,progress_measure,description', 'cmi.score': 'scaled,raw,min,max', 'cmi.objectives.n.score': 'scaled,raw,min,max' }

// Whether value v suits type, for the version's data model.
const SCORM_TYPES = {
  id: v => /^\S{1,255}$/.test(v), uri: v => v.length > 0 && v.length <= 4000 && !/\s/.test(v), span: v => span12(v) !== null, dur: v => dur04(v) !== null,
  time12: v => /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,2})?$/.test(v),
  ts: v => /^\d{4}(-\d{2}(-\d{2}(T\d{2}(:\d{2}(:\d{2}(\.\d{1,2})?)?)?(Z|[+-]\d{2}(:\d{2})?)?)?)?)?$/.test(v),
  nav: v => /^(continue|previous|choice|jump|exit|exitAll|abandon|abandonAll|suspendAll|_none_)$|^\{target=[^}]+\}(choice|jump)$/.test(v),
}
function scormTypeOk(type, v) {
  if (!type || type === 'any') return true
  if (SCORM_TYPES[type]) return SCORM_TYPES[type](v)
  if (type[0] === 's') return v.length <= +type.slice(1)
  if (type.startsWith('v:')) return type.slice(2).split('|').includes(v) || (type.endsWith('|d') && /^-?\d+(\.\d+)?$/.test(v))
  if (!(type[0] === 'i' ? /^-?\d+$/ : /^-?\d+(\.\d+)?$/).test(v)) return false
  const [lo, hi] = type.slice(1).split(':')
  return (lo === undefined || lo === '' || +v >= +lo) && (hi === undefined || hi === '' || +v <= +hi)
}
// The 2004 range errors (407) are for numbers that fit the type but not its range; 1.2 calls both 405.
const scormRangeOnly = (type, v) => /^[di][-\d:]*$/.test(type) && /^-?\d+(\.\d+)?$/.test(v) && !scormTypeOk(type, v)

// A SCORM run-time for one launch. o: { version '1.2' | '2004', edition, cmi: Map (kept between launches), learner:
// { id, name }, credit, mode, launchData, mastery, maxTime, timeLimitAction, completionThreshold, log(entry) }.
// Returns { api, cmi, state () }: api has the version's eight functions, cmi the values, state 'new' | 'running' | 'ended'.
function scormRuntime(o) {
  const v12 = o.version === '1.2', model = { ...(v12 ? SCORM12_MODEL : SCORM04_MODEL) }, kids = v12 ? SCORM12_CHILDREN : SCORM04_CHILDREN
  const cmi = o.cmi || new Map(), errs = SCORM_ERRORS[v12 ? '1.2' : '2004']
  let state = 'new', last = 0, diag = ''
  if (o.edition === '2nd edition' && !v12) model['cmi.suspend_data'] = ['rw', 's4000']
  // Values the LMS sets at each launch.
  const prevExit = cmi.get(v12 ? 'cmi.core.exit' : 'cmi.exit')
  const fixed = v12 ? {
    'cmi.core.student_id': o.learner?.id ?? 'learner-1', 'cmi.core.student_name': o.learner?.name ?? 'Learner, Test', 'cmi.core.credit': o.credit ?? 'credit',
    'cmi.core.lesson_mode': o.mode ?? 'normal', 'cmi.launch_data': o.launchData ?? '', 'cmi.student_data.mastery_score': o.mastery ?? '',
    'cmi.student_data.max_time_allowed': o.maxTime ?? '', 'cmi.student_data.time_limit_action': o.timeLimitAction ?? '',
    'cmi.core.entry': prevExit === 'suspend' ? 'resume' : cmi.has('cmi.core.lesson_status') ? '' : 'ab-initio', 'cmi.comments_from_lms': cmi.get('cmi.comments_from_lms') ?? '',
  } : {
    'cmi._version': '1.0', 'cmi.learner_id': o.learner?.id ?? 'learner-1', 'cmi.learner_name': o.learner?.name ?? 'Learner, Test', 'cmi.credit': o.credit ?? 'credit',
    'cmi.mode': o.mode ?? 'normal', 'cmi.launch_data': o.launchData ?? '', 'cmi.scaled_passing_score': o.mastery ?? '', 'cmi.completion_threshold': o.completionThreshold ?? '',
    'cmi.max_time_allowed': o.maxTime ?? '', 'cmi.time_limit_action': o.timeLimitAction ?? 'continue,no message',
    'cmi.entry': prevExit === 'suspend' || prevExit === 'logout' ? 'resume' : cmi.has('cmi.completion_status') ? '' : 'ab-initio',
    'adl.nav.request_valid.continue': 'unknown', 'adl.nav.request_valid.previous': 'unknown',
  }
  for (const [k, val] of Object.entries(fixed)) cmi.set(k, String(val))
  const defaults = v12 ? { 'cmi.core.lesson_status': 'not attempted', 'cmi.core.total_time': '0000:00:00.00', 'cmi.core.lesson_location': '', 'cmi.suspend_data': '', 'cmi.comments': '', 'cmi.core.score.raw': '', 'cmi.core.score.min': '', 'cmi.core.score.max': '' }
    : { 'cmi.completion_status': 'unknown', 'cmi.success_status': 'unknown', 'cmi.total_time': 'PT0S', 'adl.nav.request': '_none_' }
  for (const [k, val] of Object.entries(defaults)) if (!cmi.has(k)) cmi.set(k, val)
  // A new attempt (the last one wasn't suspended) starts over, keeping only the launch values.
  if (fixed[v12 ? 'cmi.core.entry' : 'cmi.entry'] !== 'resume' && prevExit !== undefined) {
    for (const k of [...cmi.keys()]) if (!(k in fixed)) cmi.delete(k)
    for (const [k, val] of Object.entries(defaults)) cmi.set(k, val)
  }
  for (const k of [v12 ? 'cmi.core.exit' : 'cmi.exit', v12 ? 'cmi.core.session_time' : 'cmi.session_time']) cmi.delete(k)

  const fail = (code, d = '') => { last = code; diag = d; return 'false' }
  const generic = el => el.replace(/\.\d+(?=\.|$)/g, '.n')
  const count = prefix => { let n = 0; while ([...cmi.keys()].some(k => k.startsWith(`${prefix}.${n}.`))) n++; return n }
  const record = (call, el, value, result) => o.log?.({ t: Date.now(), call, el, value, result, err: last, diag })
  const call = (name, fn) => (...a) => { last = 0; diag = ''; const r = String(fn(...a)); record(name, a[0] ?? '', a[1], r); return r }

  function getValue(el) {
    el = String(el ?? '')
    if (state !== 'running') return fail(v12 ? 301 : state === 'new' ? 122 : 123), ''
    if (!el) return fail(v12 ? 201 : 301, 'No element was named.'), ''
    const kw = el.match(/^(.*)\._(children|count)$/)
    if (kw) {
      const base = generic(kw[1])
      if (kw[2] === 'children') return kids[base] ?? (fail(v12 ? 202 : 301, `${kw[1]} has no children.`), '')
      return SCORM_ARRAYS.test(base) ? String(count(kw[1])) : (fail(v12 ? 203 : 301, `${kw[1]} isn’t an array.`), '')
    }
    const def = model[generic(el)]
    if (!def) return fail(v12 ? 201 : 401, `${el} isn’t in the SCORM ${o.version} data model.`), ''
    if (def[0] === 'w') return fail(v12 ? 404 : 405, `${el} is write-only.`), ''
    if (!cmi.has(el)) {
      if (!v12 && /\.n\./.test(generic(el))) return fail(301, `${el} hasn’t been set.`), ''
      if (!v12 && !(generic(el) in fixed) && !(el in defaults)) return fail(403, `${el} hasn’t been set.`), ''
      return ''
    }
    return cmi.get(el)
  }
  function setValue(el, value) {
    el = String(el ?? ''); value = String(value ?? '')
    if (state !== 'running') return fail(v12 ? 301 : state === 'new' ? 132 : 133)
    if (/\._(children|count|version)$/.test(el)) return fail(v12 ? 402 : 404, `${el} is a keyword and can’t be set.`)
    const g = generic(el), def = model[g]
    if (!def) return fail(v12 ? 201 : 401, `${el} isn’t in the SCORM ${o.version} data model.`)
    if (def[0] === 'r') return fail(v12 ? 403 : 404, `${el} is read-only.`)
    // Array rules: an index may be the next one at most, and (2004) an entry's id must be set before anything else.
    const idx = [...el.matchAll(/\.(\d+)(?=\.)/g)]
    for (const m of idx) {
      const prefix = el.slice(0, m.index), n = +m[1]
      if (n > count(prefix)) return fail(v12 ? 201 : 351, `${prefix}.${n} skips an index: the next one is ${count(prefix)}.`)
    }
    if (!v12 && idx.length && /^cmi\.(objectives|interactions)\.\d+\.(?!id$)/.test(el) && !cmi.has(el.replace(/^(cmi\.\w+\.\d+)\..*$/, '$1.id')))
      return fail(408, `Set ${el.replace(/^(cmi\.\w+\.\d+)\..*$/, '$1.id')} first.`)
    if (!scormTypeOk(def[1], value)) return fail(v12 ? 405 : scormRangeOnly(def[1], value) ? 407 : 406, `“${value.length > 60 ? value.slice(0, 60) + '…' : value}” doesn’t suit ${el} (${scormTypeName(def[1])}).`)
    cmi.set(el, value)
    return 'true'
  }
  function initialize(arg) {
    if (String(arg ?? '') !== '') return fail(v12 ? 201 : 201, 'The argument must be "".')
    if (state === 'running') return fail(v12 ? 101 : 103, 'Already initialised.')
    if (state === 'ended') return fail(v12 ? 101 : 104, 'This launch has ended; relaunch to start again.')
    state = 'running'; return 'true'
  }
  function terminate(arg) {
    if (String(arg ?? '') !== '') return fail(201, 'The argument must be "".')
    if (state !== 'running') return fail(v12 ? 301 : state === 'new' ? 112 : 113)
    // The session's time is added to the total, as an LMS does.
    const st = cmi.get(v12 ? 'cmi.core.session_time' : 'cmi.session_time'), secs = st ? (v12 ? span12(st) : dur04(st)) : 0
    const tk = v12 ? 'cmi.core.total_time' : 'cmi.total_time', total = (v12 ? span12(cmi.get(tk)) : dur04(cmi.get(tk))) || 0
    cmi.set(tk, v12 ? span12Text(total + secs) : dur04Text(total + secs))
    const ek = v12 ? 'cmi.core.exit' : 'cmi.exit'
    if (!cmi.has(ek)) cmi.set(ek, '') // so that the next launch knows this one ended without suspending
    if (v12 && cmi.get('cmi.core.lesson_status') === 'not attempted') cmi.set('cmi.core.lesson_status', 'incomplete')
    state = 'ended'; return 'true'
  }
  function commit(arg) {
    if (String(arg ?? '') !== '') return fail(201, 'The argument must be "".')
    if (state !== 'running') return fail(v12 ? 301 : state === 'new' ? 142 : 143)
    return 'true'
  }
  const lastError = () => String(last), errorString = c => errs[+c] ?? '', diagnostic = c => (c === '' || c == null || +c === last) ? diag : ''
  const api = v12
    ? { LMSInitialize: call('LMSInitialize', initialize), LMSFinish: call('LMSFinish', terminate), LMSGetValue: call('LMSGetValue', getValue), LMSSetValue: call('LMSSetValue', setValue),
      LMSCommit: call('LMSCommit', commit), LMSGetLastError: lastError, LMSGetErrorString: errorString, LMSGetDiagnostic: diagnostic }
    : { Initialize: call('Initialize', initialize), Terminate: call('Terminate', terminate), GetValue: call('GetValue', getValue), SetValue: call('SetValue', setValue),
      Commit: call('Commit', commit), GetLastError: lastError, GetErrorString: errorString, GetDiagnostic: diagnostic }
  return { api, cmi, state: () => state }
}
const scormTypeName = t => !t ? 'any value' : t === 'id' ? 'an identifier' : t === 'span' ? 'a time as HHHH:MM:SS.SS' : t[0] === 's' ? `at most ${(+t.slice(1)).toLocaleString()} characters` : t.startsWith('v:') ? 'one of ' + t.slice(2).split('|').map(x => x === 'd' ? 'a number' : x === '' ? '""' : x).join(', ')
  : t[0] === 'd' || t[0] === 'i' ? `${t[0] === 'i' ? 'a whole number' : 'a number'}${t.length > 1 ? ' from ' + t.slice(1).replace(':', ' to ').replace(/ to $/, ' up') : ''}`
  : { span: 'a time as HHHH:MM:SS.SS', time12: 'a time of day as HH:MM:SS', dur: 'an ISO 8601 duration such as PT1M30S', ts: 'an ISO 8601 time', id: 'an identifier', uri: 'an identifier without spaces', nav: 'a navigation request' }[t] || t

globalThis.scormRuntime = scormRuntime
