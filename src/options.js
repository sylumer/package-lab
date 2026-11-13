// Launch options: the one structure for everything that changes how a run is set up. The desktop and web UI, the
// launch handler, the CLI (flags and --options file) and the saved run's launch.options all use it. Pure; no Electron.
// Later work packages add fields here and nowhere else. Defaults live here and only here.
const DEFAULTS = Object.freeze({
  expose: 'manifest', depth: 0, opener: false, resume: false, caught: true, auto: 0, wait: 10,
  profile: 'none', browser: 'chromium', viewport: null, files: {}, pins: [], responses: [], storage: 'normal', trace: false,
})
const EXPOSE = ['manifest', 'both', '1.2', '2004', 'none']
const bad = (k, why) => { throw new Error(`Option “${k}” ${why}.`) }
const num = (k, v, min, max) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) bad(k, `must be a number from ${min} to ${max}, not ${JSON.stringify(v)}`)
  return n
}
const bool = (k, v) => typeof v === 'boolean' ? v : bad(k, `must be true or false, not ${JSON.stringify(v)}`)
const str = (k, v, allowed) => typeof v === 'string' && v && (!allowed || allowed.includes(v)) ? v : bad(k, `must be ${allowed ? 'one of ' + allowed.join(', ') : 'a non-empty string'}, not ${JSON.stringify(v)}`)
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
  files: (k, v) => {
    if (!obj(v) || !Object.values(v).every(x => typeof x === 'string')) bad(k, 'must be an object of package path → replacement text')
    for (const p of Object.keys(v)) if (!p || p.startsWith('/') || p.includes('\\') || p.split('/').includes('..')) bad(k, `has a path that isn’t inside the package: ${JSON.stringify(p)}`)
    return { ...v }
  },
  pins: (k, v) => Array.isArray(v) && v.every(obj) ? v.map(x => ({ ...x })) : bad(k, 'must be a list of objects'),
  responses: (k, v) => Array.isArray(v) && v.every(obj) ? v.map(x => ({ ...x })) : bad(k, 'must be a list of objects'),
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
  const rest = Object.keys(DEFAULTS).filter(k => !['expose', 'depth', 'opener', 'resume', 'caught', 'auto', 'wait'].includes(k) && JSON.stringify(o[k]) !== JSON.stringify(DEFAULTS[k]))
  if (rest.length) a.push('--options', 'options.json')
  return a.join(' ')
}
