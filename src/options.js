// Launch options: the one structure for everything that changes how a run is set up. The desktop and web UI, the
// launch handler, the CLI (flags and --options file) and the saved run's launch.options all use it. Pure; no Electron.
// Later work packages add fields here and nowhere else. Defaults live here and only here.
import { pinPathProblem, PIN_MODES, matcher, USER_AGENT } from './pins.js'
import { checkProfile, launchProfile } from './profiles.js'
import { PACKS } from './packs/index.js'
import { STEPS } from './milestones.js'
const DEFAULTS = Object.freeze({
  expose: 'manifest', depth: 0, opener: false, resume: false, caught: true, auto: 0, wait: 10,
  profile: 'generic', browser: 'chromium', viewport: null, files: {}, pins: [], responses: [], launchParams: '', storage: 'normal', trace: false, macro: [], recordInput: false, tool: null,
})
const MAX_PIN = 1024 ** 2, MAX_BODY = 10 * 1024 ** 2, MAX_BODIES = 20 * 1024 ** 2, MAX_LIST = 100   // a pin's value, a response's body, entries in pins or responses
// A macro (P2.4; wait steps in format 2, E1.1): events, at most this many, with at most this much typed text in all, none later than an hour into the run.
export const MACRO_KEYS = /^(Enter|Tab|Escape|Backspace|Delete|Space|Up|Down|Left|Right|PageUp|PageDown|Home|End)$/
const MAX_MACRO = 2000, MAX_MACRO_TEXT = 100 * 1024, MAX_MACRO_T = 3600 * 1000
const MACRO_FIELDS = { click: ['x', 'y', 'approx', 'target'], move: ['x', 'y', 'approx'], wheel: ['x', 'y', 'dy'], key: ['key'], text: ['text'], wait: ['ms', 'text', 'milestone', 'quiet', 'timeout'] }
const MAX_FILE = 50 * 1024 ** 2, MAX_TOTAL = 200 * 1024 ** 2   // changed files: per file and in all
const EXPOSE = ['manifest', 'both', '1.2', '2004', 'none']
export const STORAGE = ['normal', 'blocked', 'partitioned']
export const BROWSERS = ['chromium', 'webkit']   // webkit (P2.3) runs in Playwright's WebKit, not Electron; see src/webkit-runner.js
// Device sizes (P2.3). The user agents are the browsers' own, of the versions they are named for.
export const VIEWPORTS = {
  iphone: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, touch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
  ipad: { width: 820, height: 1180, deviceScaleFactor: 2, mobile: true, touch: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
  'android-phone': { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true, touch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36' },
}
const PLAIN = { deviceScaleFactor: 1, mobile: false, touch: false, userAgent: '' }
// A name for a device size: its preset, or WIDTHxHEIGHT. The command line's spelling is the same: --viewport iphone, --viewport 390x844.
export const viewportName = v => Object.entries(VIEWPORTS).find(([, p]) => JSON.stringify(p) === JSON.stringify(v))?.[0] ?? `${v.width}x${v.height}`
// '' when the size has settings beyond width and height that a name can't carry (it then goes in the options file).
const viewportFlag = v => Object.entries(PLAIN).every(([k, d]) => v[k] === d) || Object.values(VIEWPORTS).some(p => JSON.stringify(p) === JSON.stringify(v)) ? viewportName(v) : ''
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
  // An authoring-tool rule pack (src/packs) to apply whether or not it recognises the package; null leaves it to detection.
  tool: (k, v) => v === null ? null : str(k, v, PACKS.map(p => p.id)),
  expose: (k, v) => str(k, v, EXPOSE),
  depth: (k, v) => { const n = num(k, v, 0, 5); return Number.isInteger(n) ? n : bad(k, 'must be a whole number from 0 to 5') },
  opener: bool, resume: bool, caught: bool, trace: bool,
  // Keep the text typed in the content's frames in the probe's input reports (P2.4), for making a macro from the run. Never from password-like fields.
  recordInput: bool,
  auto: (k, v) => num(k, v, 0, 3600),
  wait: (k, v) => num(k, v, 1, 3600),
  // A preset name or a custom profile object (profiles.js); 'none', from runs saved before P2.1, is generic.
  profile: (k, v) => checkProfile(v),
  browser: (k, v) => str(k, v, BROWSERS),
  // null (the window as it is) · a preset name · 'WIDTHxHEIGHT' · { width, height, deviceScaleFactor?, mobile?, touch?, userAgent? }.
  // Always returned in full; the object { width, height } saved by earlier versions reads as a plain size.
  viewport: (k, v) => {
    if (v === null) return null
    if (typeof v === 'string') {
      const m = /^(\d+)x(\d+)$/i.exec(v.trim())
      if (m) v = { width: +m[1], height: +m[2] }
      else if (Object.hasOwn(VIEWPORTS, v.trim())) return { ...VIEWPORTS[v.trim()] }
      else bad(k, `must be null, a preset (${Object.keys(VIEWPORTS).join(', ')}), WIDTHxHEIGHT like 390x844, or { width, height }, not ${JSON.stringify(v)}`)
    }
    if (!obj(v)) bad(k, 'must be null, a preset name, WIDTHxHEIGHT, or { width, height } in whole pixels')
    const extra = Object.keys(v).filter(f => !['width', 'height', ...Object.keys(PLAIN)].includes(f))
    if (extra.length) bad(k, `has an unknown field: ${extra.join(', ')}`)
    const out = { ...PLAIN, ...v }
    if (![out.width, out.height].every(n => Number.isInteger(n) && n >= 100 && n <= 10000)) bad(k, 'needs width and height in whole pixels, from 100 to 10000')
    if (typeof out.deviceScaleFactor !== 'number' || !(out.deviceScaleFactor >= 0.5 && out.deviceScaleFactor <= 5)) bad(k, 'needs deviceScaleFactor to be a number from 0.5 to 5')
    if (typeof out.mobile !== 'boolean' || typeof out.touch !== 'boolean') bad(k, 'needs mobile and touch to be true or false')
    if (typeof out.userAgent !== 'string' || /[\r\n\0]/.test(out.userAgent) || out.userAgent.length > 500) bad(k, 'needs userAgent to be one line of text')
    return { width: out.width, height: out.height, deviceScaleFactor: out.deviceScaleFactor, mobile: out.mobile, touch: out.touch, userAgent: out.userAgent }
  },
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
  // [{ path, value (JSON), frames: 'content' | 'all', mode: 'force' }] or [{ path, frames, mode: 'watch' }]
  pins: (k, v) => {
    if (!Array.isArray(v) || !v.every(obj)) bad(k, 'must be a list of { path, value }')
    if (v.length > MAX_LIST) bad(k, `can hold at most ${MAX_LIST} pins`)
    return v.map(x => {
      const extra = Object.keys(x).filter(f => !['path', 'value', 'frames', 'mode'].includes(f))
      if (extra.length) bad(k, `has an unknown field: ${extra.join(', ')}`)
      const why = pinPathProblem(x.path)
      if (why) bad(k, `has a path that ${why}: ${JSON.stringify(x.path)}`)
      const frames = x.frames ?? 'content', mode = x.mode ?? 'force'
      if (!['content', 'all'].includes(frames)) bad(k, `needs frames to be content or all for ${x.path}`)
      if (!PIN_MODES.includes(mode)) bad(k, `needs mode to be ${PIN_MODES.join(' or ')} for ${x.path}`)
      // A watch pin only records reads and writes (P1.5): it has no value, and the user agent can't be watched.
      if (mode === 'watch') { if (x.path === USER_AGENT) bad(k, `can only force ${x.path}, not watch it`); return { path: x.path, frames, mode } }
      if (!Object.hasOwn(x, 'value') || typeof JSON.stringify(x.value) !== 'string') bad(k, `needs a value (any JSON, null included) for ${x.path}`)
      if (JSON.stringify(x.value).length > MAX_PIN) bad(k, `has a value over ${MAX_PIN / 1024 ** 2} MB for ${x.path}`)
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
  // normal: the run window's storage as it is (it lasts from run to run while the app is open) · blocked: Safari's refusals in
  // content frames (the probe) · partitioned: the same storage, emptied before the run. The profile's cookies field can block too.
  storage: (k, v) => str(k, v, STORAGE),
  // [{ t (ms into the run), type: 'click' | 'move' | 'wheel' | 'key' | 'text' | 'wait', x, y (0–1 across the window), dy, key, text }], replayed through the live view's input (main.js live.input).
  macro: (k, v) => {
    if (!Array.isArray(v) || !v.every(obj)) bad(k, 'must be a list of events like { "t": 1500, "type": "click", "x": 0.5, "y": 0.3 }')
    if (v.length > MAX_MACRO) bad(k, `can hold at most ${MAX_MACRO} events`)
    let text = 0
    const unit = (e, f) => typeof e[f] === 'number' && e[f] >= 0 && e[f] <= 1 ? e[f] : bad(k, `needs ${f} to be a number from 0 to 1 in each ${e.type} event`)
    return v.map((e, i) => {
      const allowed = Object.hasOwn(MACRO_FIELDS, e.type) ? MACRO_FIELDS[e.type] : null
      if (!allowed) bad(k, `needs type to be click, move, wheel, key, text or wait in event ${i + 1}`)
      const extra = Object.keys(e).filter(f => !['t', 'type', ...allowed].includes(f))
      if (extra.length) bad(k, `has an unknown field in event ${i + 1}: ${extra.join(', ')}`)
      if (typeof e.t !== 'number' || !(e.t >= 0 && e.t <= MAX_MACRO_T)) bad(k, `needs t to be a number of milliseconds from 0 to ${MAX_MACRO_T} in event ${i + 1}`)
      const out = { t: Math.round(e.t), type: e.type }
      if (allowed.includes('x')) { out.x = unit(e, 'x'); out.y = unit(e, 'y') }
      if (e.approx !== undefined) { if (e.approx !== true) bad(k, `needs approx to be true or left out in event ${i + 1}`); out.approx = true }   // a click in another origin's frame, placed approximately: not replayed
      if (e.target !== undefined) {   // E1.2: the element a click was made on: { sel, text?, role?, frame? }
        const t = e.target, at = f => `needs target.${f} in event ${i + 1}`, has = f => t[f] !== undefined
        if (!obj(t) || Object.keys(t).some(f => !['sel', 'text', 'role', 'frame'].includes(f))) bad(k, `needs target to be like { "sel": "#next" } in event ${i + 1}`)
        if (typeof t.sel !== 'string' || !t.sel || t.sel.length > 500) bad(k, at('sel') + ' to be 1 to 500 characters')
        if (has('text') && (typeof t.text !== 'string' || t.text.length > 60)) bad(k, at('text') + ' to be at most 60 characters')
        if (has('role') && (typeof t.role !== 'string' || t.role.length > 40)) bad(k, at('role') + ' to be at most 40 characters')
        if (has('frame') && (!Array.isArray(t.frame) || t.frame.length > 8 || !t.frame.every(n => Number.isInteger(n) && n >= 0 && n <= 999))) bad(k, at('frame') + ' to be at most 8 whole numbers from 0 to 999')
        out.target = { sel: t.sel, ...(has('text') ? { text: t.text } : {}), ...(has('role') ? { role: t.role } : {}), ...(has('frame') ? { frame: [...t.frame] } : {}) }
      }
      if (e.type === 'wheel') { if (typeof e.dy !== 'number' || !Number.isFinite(e.dy) || Math.abs(e.dy) > 10000) bad(k, `needs dy to be a number from -10000 to 10000 in event ${i + 1}`); out.dy = e.dy }
      if (e.type === 'key') { if (!MACRO_KEYS.test(e.key)) bad(k, `needs key to be a name like Enter or Tab in event ${i + 1}, not ${JSON.stringify(e.key)}`); out.key = e.key }
      if (e.type === 'wait') {
        const num = (f, lo, hi) => typeof e[f] === 'number' && e[f] >= lo && e[f] <= hi ? Math.round(e[f]) : bad(k, `needs ${f} to be a number from ${lo} to ${hi} in event ${i + 1}`)
        const given = ['ms', 'text', 'milestone', 'quiet'].filter(f => e[f] !== undefined)
        if (given.length !== 1) bad(k, `needs exactly one of ms, text, milestone or quiet in wait event ${i + 1}`)
        if (given[0] === 'ms') out.ms = num('ms', 1, 600000)
        if (given[0] === 'quiet') out.quiet = num('quiet', 100, 30000)
        if (given[0] === 'text') { if (typeof e.text !== 'string' || !e.text || e.text.length > 200) bad(k, `needs text to be 1 to 200 characters in wait event ${i + 1}`); if ((text += e.text.length) > MAX_MACRO_TEXT) bad(k, `holds more than ${MAX_MACRO_TEXT / 1024} KB of text in all`); out.text = e.text }
        if (given[0] === 'milestone') { if (!STEPS.some(s => s[0] === e.milestone)) bad(k, `needs milestone to be one of ${STEPS.map(s => s[0]).join(', ')} in wait event ${i + 1}`); out.milestone = e.milestone }
        if (e.timeout !== undefined) out.timeout = num('timeout', 1000, 600000)
      }
      if (e.type === 'text') {
        if (typeof e.text !== 'string' || !e.text || e.text.length > 2000) bad(k, `needs text to be 1 to 2000 characters in event ${i + 1}`)
        if ((text += e.text.length) > MAX_MACRO_TEXT) bad(k, `holds more than ${MAX_MACRO_TEXT / 1024} KB of typed text in all`)
        out.text = e.text
      }
      return out
    }).sort((a, b) => a.t - b.t)
  },
}

// Returns the full options object for o (missing fields get defaults). Throws on unknown fields and bad values.
export function normaliseOptions(o = {}) {
  if (!obj(o)) throw new Error('Options must be an object.')
  const unknown = Object.keys(o).filter(k => !Object.hasOwn(DEFAULTS, k))
  if (unknown.length) throw new Error(`Unknown option${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Known options: ${Object.keys(DEFAULTS).join(', ')}.`)
  const out = {}
  for (const [k, d] of Object.entries(DEFAULTS)) out[k] = o[k] === undefined ? structuredClone(d) : check[k](k, o[k])
  launchProfile(out)   // the profile's fields must fit together, with depth and opener on top
  return out
}

const quote = s => /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`
// The `package-lab run …` line that makes the same launch. Fields with no flag go to --options options.json.
// ponytail: assumes the --options file is written by the user; add a flag for each field when it matters.
export function cliCommand(options, { zip = 'package.zip', item } = {}) {
  const o = normaliseOptions(options), a = ['package-lab', 'run', quote(zip)]
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
  const vpFlag = o.viewport ? viewportFlag(o.viewport) : ''
  const flagged = ['expose', 'depth', 'opener', 'resume', 'caught', 'auto', 'wait', 'files', 'launchParams', 'trace', 'profile', 'storage', 'browser', 'macro', 'recordInput', 'tool', ...vpFlag || !o.viewport ? ['viewport'] : [], ...pinFlag ? ['pins'] : [], ...answerFlag ? ['responses'] : []]
  const rest = Object.keys(DEFAULTS).filter(k => !flagged.includes(k) && JSON.stringify(o[k]) !== JSON.stringify(DEFAULTS[k]))
  // Changed files: --override path=path, which assumes a local copy saved at the same relative path.
  for (const p of Object.keys(o.files)) a.push('--override', quote(`${p}=${p}`))
  if (pinFlag) for (const p of o.pins) a.push('--pin', quote(`${p.path}=${JSON.stringify(p.value)}`))
  if (answerFlag) for (const r of o.responses) a.push('--answer', quote(`${r.match}=${r.status}:${r.body}`))
  if (o.launchParams) a.push('--launch-params', quote(o.launchParams))
  if (o.trace) a.push('--trace')
  if (o.storage !== DEFAULTS.storage) a.push('--storage', o.storage)
  if (o.browser !== DEFAULTS.browser) a.push('--browser', o.browser)
  if (o.macro.length) a.push('--macro', 'macro.json')
  if (o.recordInput) a.push('--record-input')
  if (o.tool) a.push('--tool', o.tool)
  if (vpFlag) a.push('--viewport', vpFlag)
  // A preset by name; a custom profile in a file of its own.
  if (typeof o.profile === 'string' && o.profile !== DEFAULTS.profile) a.push('--profile', o.profile)
  if (typeof o.profile === 'object') a.push('--profile-file', 'profile.json')
  if (rest.length) a.push('--options', 'options.json')
  return a.join(' ')
}
