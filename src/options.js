// Launch options: the one structure for everything that changes how a run is set up. The desktop and web UI, the
// launch handler, the CLI (flags and --options file) and the saved run's launch.options all use it. Pure; no Electron.
// Later work packages add fields here and nowhere else. Defaults live here and only here.
import { pinPathProblem, PIN_MODES, matcher } from './pins.js'
const DEFAULTS = Object.freeze({
  expose: 'manifest', depth: 0, opener: false, resume: false, caught: true, auto: 0, wait: 10,
  profile: 'none', browser: 'chromium', viewport: null, files: {}, pins: [], responses: [], launchParams: '', storage: 'normal', trace: false,
})
const MAX_PIN = 1024 ** 2, MAX_BODY = 10 * 1024 ** 2, MAX_BODIES = 20 * 1024 ** 2, MAX_LIST = 100   // a pin's value, a response's body, entries in pins or responses
const MAX_FILE = 50 * 1024 ** 2, MAX_TOTAL = 200 * 1024 ** 2   // changed files: per file and in all
const EXPOSE = ['manifest', 'both', '1.2', '2004', 'none']
const bad = (k, why) => { throw new Error(`Option “${k}” ${why}.`) }
const num = (k, v, min, max) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) bad(k, `must be a number from ${min} to ${max}, not ${JSON.stringify(v)}`)
  return n
}
const bool = (k, v) => typeof v === 'boolean' ? v : bad(k, `must be true or false, not ${JSON.stringify(v)}`)
const str = (k, v, allowed) => typeof v === 'string' && v && (!allowed || allowed.includes(v)) ? v : bad(k, `must be ${allowed ? 'one of ' + allowed.join(', ') : 'a non-empty string'}, not ${JSON.stringify(v)}`)
// A path inside the package: relative, forward slashes, no “..”. Overrides (here, over HTTP and in the CLI) all use this.
export const packagePath = p => typeof p === 'string' && !!p && !p.startsWith('/') && !p.includes('\\') && !p.includes('\0') && !p.split('/').includes('..') && !p.split('/').includes('')
const obj = v => v && typeof v === 'object' && !Array.isArray(v)

const check = {
  expose: (k, v) => str(k, v, EXPOSE),
  depth: (k, v) => { const n = num(k, v, 0, 5); return Number.isInteger(n) ? n : bad(k, 'must be a whole number from 0 to 5') },
  opener: bool, resume: bool, caught: bool, trace: bool,
  auto: (k, v) => num(k, v, 0, 3600),
  wait: (k, v) => num(k, v, 1, 3600),
  profile: str,                                  // narrowed by the work package that adds profiles
  browser: (k, v) => str(k, v, ['chromium']),    // widened by P2.3
  viewport: (k, v) => v === null ? null : obj(v) && Object.keys(v).sort().join() === 'height,width' && [v.width, v.height].every(n => Number.isInteger(n) && n > 0)
    ? { width: v.width, height: v.height } : bad(k, 'must be null or { width, height } in whole pixels'),
  // { path: { content (utf8 text) } | { base64 } }. A bare string is shorthand for { content }.
  files: (k, v) => {
    if (!obj(v)) bad(k, 'must be an object of package path → { content } or { base64 }')
    const out = [], size = e => e.content !== undefined ? Buffer.byteLength(e.content) : e.base64.length * 3 / 4
    let total = 0
    for (const [p, x] of Object.entries(v)) {
      if (!packagePath(p)) bad(k, `has a path that isn’t inside the package: ${JSON.stringify(p)}`)
      const e = typeof x === 'string' ? { content: x } : x
      if (!obj(e) || Object.keys(e).length !== 1 || !(typeof e.content === 'string' || typeof e.base64 === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(e.base64) && e.base64.length % 4 === 0))
        bad(k, `needs { "content": text } or { "base64": data } for ${JSON.stringify(p)}`)
      if (size(e) > MAX_FILE) bad(k, `has a file over ${MAX_FILE / 1024 ** 2} MB: ${JSON.stringify(p)}`)
      if ((total += size(e)) > MAX_TOTAL) bad(k, `holds more than ${MAX_TOTAL / 1024 ** 2} MB of changed files in all`)
      out.push([p, { ...e }])
    }
    return Object.fromEntries(out)   // not out[p] = …, which would set the prototype for a path called __proto__
  },
  // [{ path, value (JSON), frames: 'content' | 'all', mode: 'force' }]
  pins: (k, v) => {
    if (!Array.isArray(v) || !v.every(obj)) bad(k, 'must be a list of { path, value }')
    if (v.length > MAX_LIST) bad(k, `can hold at most ${MAX_LIST} pins`)
    return v.map(x => {
      const extra = Object.keys(x).filter(f => !['path', 'value', 'frames', 'mode'].includes(f))
      if (extra.length) bad(k, `has an unknown field: ${extra.join(', ')}`)
      const why = pinPathProblem(x.path)
      if (why) bad(k, `has a path that ${why}: ${JSON.stringify(x.path)}`)
      if (!Object.hasOwn(x, 'value') || typeof JSON.stringify(x.value) !== 'string') bad(k, `needs a value (any JSON, null included) for ${x.path}`)
      if (JSON.stringify(x.value).length > MAX_PIN) bad(k, `has a value over ${MAX_PIN / 1024 ** 2} MB for ${x.path}`)
      const frames = x.frames ?? 'content', mode = x.mode ?? 'force'
      if (!['content', 'all'].includes(frames)) bad(k, `needs frames to be content or all for ${x.path}`)
      if (!PIN_MODES.includes(mode)) bad(k, `needs mode to be ${PIN_MODES.join(' or ')} for ${x.path}`)
      return { path: x.path, value: structuredClone(x.value), frames, mode }
    })
  },
  // [{ match: glob or /regex/, method?, status: 200, headers: {}, body: '' }]. bodyFile is for the command line, which turns it into body.
  responses: (k, v) => {
    if (!Array.isArray(v) || !v.every(obj)) bad(k, 'must be a list of { match, body }')
    if (v.length > MAX_LIST) bad(k, `can hold at most ${MAX_LIST} responses`)
    let total = 0
    return v.map(x => {
      const extra = Object.keys(x).filter(f => !['match', 'method', 'status', 'headers', 'body'].includes(f))
      if (extra.includes('bodyFile')) bad(k, 'can’t read files: the command line reads bodyFile and puts the content in body')
      if (extra.length) bad(k, `has an unknown field: ${extra.join(', ')}`)
      if (typeof x.match !== 'string' || !x.match) bad(k, 'needs match: a glob like /api/*.json or a /regex/')
      try { matcher(x.match) } catch (e) { bad(k, `has a pattern that doesn’t work (${e.message}): ${JSON.stringify(x.match)}`) }
      const status = x.status === undefined ? 200 : x.status, headers = x.headers ?? {}, body = x.body ?? ''
      if (!Number.isInteger(status) || status < 100 || status > 599) bad(k, `needs status to be a whole number from 100 to 599 for ${x.match}`)
      if (x.method !== undefined && !(typeof x.method === 'string' && /^[A-Za-z]+$/.test(x.method))) bad(k, `needs method to be a name like GET for ${x.match}`)
      if (!obj(headers) || !Object.values(headers).every(h => typeof h === 'string' || typeof h === 'number')) bad(k, `needs headers to be an object of text for ${x.match}`)
      if (typeof body !== 'string') bad(k, `needs body to be text for ${x.match}`)
      if (Buffer.byteLength(body) > MAX_BODY) bad(k, `has a body over ${MAX_BODY / 1024 ** 2} MB for ${x.match}`)
      if ((total += Buffer.byteLength(body)) > MAX_BODIES) bad(k, `holds more than ${MAX_BODIES / 1024 ** 2} MB of response bodies in all`)
      return { match: x.match, ...(x.method ? { method: x.method.toUpperCase() } : {}), status, headers: { ...headers }, body }
    })
  },
  // Extra query parameters for the launch URL, like 'a=1&b=2'.
  launchParams: (k, v) => {
    if (typeof v !== 'string' || /[\s#]/.test(v)) bad(k, 'must be query text without spaces or #, like a=1&b=2')
    return v.replace(/^[?&]+/, '')
  },
  storage: str,                                  // narrowed by the work package that adds storage modes
}

// Returns the full options object for o (missing fields get defaults). Throws on unknown fields and bad values.
export function normaliseOptions(o = {}) {
  if (!obj(o)) throw new Error('Options must be an object.')
  const unknown = Object.keys(o).filter(k => !Object.hasOwn(DEFAULTS, k))
  if (unknown.length) throw new Error(`Unknown option${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Known options: ${Object.keys(DEFAULTS).join(', ')}.`)
  const out = {}
  for (const [k, d] of Object.entries(DEFAULTS)) out[k] = o[k] === undefined ? structuredClone(d) : check[k](k, o[k])
  return out
}

const quote = s => /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`
// The `scorm-lab run …` line that makes the same launch. Fields with no flag go to --options options.json.
// ponytail: assumes the --options file is written by the user; add a flag for each field when it matters.
export function cliCommand(options, { zip = 'package.zip', item } = {}) {
  const o = normaliseOptions(options), a = ['scorm-lab', 'run', quote(zip)]
  if (item) a.push('--item', String(item))
  if (o.expose !== DEFAULTS.expose) a.push('--api', o.expose)
  if (o.depth) a.push('--depth', String(o.depth))
  if (o.opener) a.push('--window')
  if (o.resume) a.push('--resume-from', 'previous-run.json')
  if (!o.caught) a.push('--no-caught')
  const wait = o.auto || o.wait   // the CLI always stops by itself: --wait is the auto-stop
  if (wait !== DEFAULTS.wait) a.push('--wait', String(wait))
  // Pins and responses with a flag's worth of settings get one; anything else (frames, headers, a method) goes in the options file.
  const pinFlag = o.pins.every(p => p.frames === 'content' && p.mode === 'force'), answerFlag = o.responses.every(r => !r.method && !Object.keys(r.headers).length)
  const flagged = ['expose', 'depth', 'opener', 'resume', 'caught', 'auto', 'wait', 'files', 'launchParams', ...pinFlag ? ['pins'] : [], ...answerFlag ? ['responses'] : []]
  const rest = Object.keys(DEFAULTS).filter(k => !flagged.includes(k) && JSON.stringify(o[k]) !== JSON.stringify(DEFAULTS[k]))
  // Changed files: --override path=path, which assumes a local copy saved at the same relative path.
  for (const p of Object.keys(o.files)) a.push('--override', quote(`${p}=${p}`))
  if (pinFlag) for (const p of o.pins) a.push('--pin', quote(`${p.path}=${JSON.stringify(p.value)}`))
  if (answerFlag) for (const r of o.responses) a.push('--answer', quote(`${r.match}=${r.status}:${r.body}`))
  if (o.launchParams) a.push('--launch-params', quote(o.launchParams))
  if (rest.length) a.push('--options', 'options.json')
  return a.join(' ')
}
