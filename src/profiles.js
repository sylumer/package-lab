// LMS profiles (P2.1): how a particular LMS hosts content: the origin it serves the package from, its frames, how it
// launches, where and when it puts the API, the headers on package files, how commits behave and its limits. Pure:
// the presets, validating a profile, and working out the profile a launch runs with. See docs/developer-guide.md.

// The fields, with SCORM Lab's own test LMS as the values (the `generic` preset). Limits of null mean the standard's.
const GENERIC = {
  contentOrigin: 'same',                                       // same: lab://run/pkg/ · other: lab://content/pkg/, another origin
  frames: { depth: 0, kind: 'iframe', sandbox: null, allow: 'fullscreen; autoplay' },
  launch: 'frame', popupDelay: 0,                              // frame | popup (window.open), after popupDelay ms
  launchParams: '',                                            // query text; {scoid}, {attempt} and {learner} are filled in
  apiDelay: 0, apiWhere: 'top',                                // ms before the API objects appear · top | parent | opener
  csp: null, headers: {},                                      // on package responses
  commit: 'ok', slowMs: 0,                                     // ok | fail | slow (each commit takes slowMs)
  limits: { suspend12: null, suspend2004: null },              // suspend_data characters; null: the standard's
  cookies: 'normal',                                           // normal | third-party-blocked (P2.2)
}
const FIELDS = Object.keys(GENERIC)
// Presets other than generic are approximations of what each LMS does by default, from its public documentation.
const preset = (notes, sources, fields = {}) => ({ ...structuredClone(GENERIC), ...fields, notes, sources, approximation: true })
export const PROFILES = {
  generic: { ...structuredClone(GENERIC), notes: 'SCORM Lab’s own test LMS: the content on the LMS’s origin, the API on the top window at once. Content finds it the way the standard’s discovery algorithms do.', sources: ['https://scorm.com/scorm-explained/technical-scorm/run-time/api-discovery-algorithms/'], approximation: false },
  moodle: preset('Approximation. Moodle’s SCORM player shows the content in a frame inside its own page (or a popup, by the activity’s display setting), on the LMS’s origin. Its docs don’t give frame depths; the generic values are used, with one frame between the API and the content.',
    ['https://tracker-old.moodle.org/browse/MDL-26303'], { frames: { ...GENERIC.frames, depth: 1 } }),
  'scorm-cloud': preset('Approximation. An embedded SCORM Cloud launch puts the player in a frame served from SCORM Cloud’s own domain, so its cookies can be blocked as third-party. The content and the API share the player’s origin.',
    ['https://cloud.scorm.com/docs/api_reference/v1/lms_integration/', 'https://support.scorm.com/hc/en-us/articles/46727466405787-SCORM-Cloud-How-to-Launch-Courses-in-an-iFrame-Embedded-Launch'], { frames: { ...GENERIC.frames, depth: 1 }, cookies: 'third-party-blocked' }),
  cornerstone: preset('Approximation from community reports, not vendor documents: Cornerstone opens the content in a new window and the content finds the API through window.opener.',
    ['https://community.articulate.com/discussions/discuss/everything-we-know-about-cornerstone-on-demand-and-storyline/839468'], { launch: 'popup', apiWhere: 'opener' }),
  successfactors: preset('Approximation. SuccessFactors Learning shows content in a frame in the same window by default (a new window is a per-content option); the API is on a parent window the content finds by searching upwards.',
    ['https://userapps.support.sap.com/sap/support/knowledge/en/2808684', 'https://userapps.support.sap.com/sap/support/knowledge/en/3376659'], { frames: { ...GENERIC.frames, depth: 1 }, apiWhere: 'parent' }),
  docebo: preset('Approximation. Docebo’s documents recommend viewing SCORM in its full-window player; how it frames content isn’t stated publicly, so the generic values are used.',
    ['https://help.docebo.com/hc/en-us/articles/7428410999826']),
  totara: preset('Approximation. Totara shows SCORM in the current window or a new window (no frame option is documented). With its default “SCORM 1.2 standard mode”, suspend_data is held to the 1.2 limit of 4,096 characters.',
    ['https://totara.help/docs/scorm-activity-settings'], { limits: { suspend12: 4096, suspend2004: null } }),
  blackboard: preset('Approximation from an institution’s help page: Blackboard Learn launches SCORM in a new window or a frame, set per package. Frame depths aren’t documented, so the generic values are used with a popup launch.',
    ['https://askus.northampton.ac.uk/Learntech/faq/285852', 'https://help.anthology.com/blackboard/instructor/en/original-course-view.html'], { launch: 'popup', apiWhere: 'opener' }),
  canvas: preset('Approximation from community reports: Canvas shows SCORM packages in a frame inside its page by default. A new window comes from the package’s own settings, not Canvas.',
    ['https://community.canvaslms.com/t5/Canvas-Question-Forum/Open-SCORM-packages-in-a-new-window/m-p/607452'], { frames: { ...GENERIC.frames, depth: 1 } }),
}
export const PROFILE_NAMES = Object.keys(PROFILES)

const bad = (field, why) => { throw new Error(`Profile field “${field}” ${why}.`) }
const obj = v => v && typeof v === 'object' && !Array.isArray(v)
const oneOf = (f, v, list) => list.includes(v) ? v : bad(f, `must be one of ${list.join(', ')}, not ${JSON.stringify(v)}`)
const ms = (f, v) => Number.isInteger(v) && v >= 0 && v <= 60000 ? v : bad(f, `must be a whole number of ms from 0 to 60000, not ${JSON.stringify(v)}`)
const line = (f, v, max = 2000) => typeof v === 'string' && !/[\r\n\0]/.test(v) && v.length <= max ? v : bad(f, `must be one line of text (at most ${max} characters)`)
const SANDBOX = ['allow-downloads', 'allow-forms', 'allow-modals', 'allow-orientation-lock', 'allow-pointer-lock', 'allow-popups', 'allow-popups-to-escape-sandbox',
  'allow-presentation', 'allow-same-origin', 'allow-scripts', 'allow-storage-access-by-user-activation', 'allow-top-navigation', 'allow-top-navigation-by-user-activation', 'allow-top-navigation-to-custom-protocols']
const parts = (f, v, keys, check) => {
  if (!obj(v)) bad(f, `must be an object with ${keys.join(', ')}`)
  const extra = Object.keys(v).filter(k => !keys.includes(k))
  if (extra.length) bad(f, `has an unknown field: ${extra.join(', ')}`)
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, check[k](`${f}.${k}`, x)]))
}
// Each field's check; nested objects (frames, limits) may be partial, and are merged over the base profile's.
const check = {
  contentOrigin: (f, v) => oneOf(f, v, ['same', 'other']),
  frames: (f, v) => parts(f, v, ['depth', 'kind', 'sandbox', 'allow'], {
    depth: (f, v) => Number.isInteger(v) && v >= 0 && v <= 5 ? v : bad(f, 'must be a whole number from 0 to 5'),
    kind: (f, v) => oneOf(f, v, ['iframe', 'frameset']),
    sandbox: (f, v) => {
      if (v === null) return null
      const words = line(f, v, 500).trim().split(/\s+/).filter(Boolean), unknown = words.filter(w => !SANDBOX.includes(w))
      return unknown.length ? bad(f, `has a word that isn’t a sandbox flag: ${unknown.join(', ')}`) : words.join(' ')
    },
    allow: (f, v) => line(f, v, 500),
  }),
  launch: (f, v) => oneOf(f, v, ['frame', 'popup']),
  popupDelay: ms,
  launchParams: (f, v) => typeof v === 'string' && !/[\s#]/.test(v) ? v.replace(/^[?&]+/, '') : bad(f, 'must be query text without spaces or #, like a=1&id={scoid}'),
  apiDelay: ms,
  apiWhere: (f, v) => oneOf(f, v, ['top', 'parent', 'opener']),
  csp: (f, v) => v === null ? null : line(f, v),
  headers: (f, v) => {
    if (!obj(v) || Object.keys(v).length > 50) bad(f, 'must be an object of header name → text (at most 50)')
    for (const [k, x] of Object.entries(v)) {
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k)) bad(f, `has a name that isn’t a header name: ${JSON.stringify(k)}`)
      line(`${f}.${k}`, x)
    }
    return Object.fromEntries(Object.entries(v))
  },
  commit: (f, v) => oneOf(f, v, ['ok', 'fail', 'slow']),
  slowMs: ms,
  limits: (f, v) => parts(f, v, ['suspend12', 'suspend2004'], Object.fromEntries(['suspend12', 'suspend2004'].map(k =>
    [k, (f, v) => v === null || Number.isInteger(v) && v > 0 && v <= 10 ** 7 ? v : bad(f, 'must be null (the standard’s limit) or a whole number of characters')]))),
  cookies: (f, v) => oneOf(f, v, ['normal', 'third-party-blocked']),
}

// The launch option `profile`: a preset name, or a custom profile { base?: preset name, notes?, …fields } whose fields
// (nested ones may be partial) go over the base's. Returns it normalised; throws on anything else. 'none' (the
// option's value before P2.1, in saved runs) is generic.
export function checkProfile(v) {
  if (v === 'none') return 'generic'
  if (typeof v === 'string') return Object.hasOwn(PROFILES, v) ? v : bad('profile', `must be one of ${PROFILE_NAMES.join(', ')} or a custom profile object, not ${JSON.stringify(v)}`)
  if (!obj(v)) bad('profile', 'must be a profile name or an object of profile fields')
  const out = {}
  for (const [k, x] of Object.entries(v)) {
    if (k === 'base') out.base = typeof x === 'string' && Object.hasOwn(PROFILES, x) ? x : bad('base', `must be one of ${PROFILE_NAMES.join(', ')}`)
    else if (k === 'notes') out.notes = typeof x === 'string' && x.length <= 2000 ? x : bad('notes', 'must be text')
    else if (Object.hasOwn(check, k)) out[k] = check[k](k, x)
    else bad(k, `isn’t a profile field. The fields are ${FIELDS.join(', ')} (and base, notes)`)
  }
  return out
}

// Every field of a profile option (a name or a custom object), resolved over its base.
export function resolveProfile(p = 'generic') {
  p = checkProfile(p)
  const named = typeof p === 'string', base = structuredClone(PROFILES[named ? p : p.base ?? 'generic'])
  const out = Object.fromEntries(FIELDS.map(k => [k, base[k]]))
  if (!named) for (const k of FIELDS) if (p[k] !== undefined) out[k] = obj(GENERIC[k]) && k !== 'headers' ? { ...out[k], ...p[k] } : p[k]
  return { name: named ? p : p.base ? `${p.base} (changed)` : 'custom', ...out }
}

// The profile a launch runs with: the option's profile, with the older launch options on top (depth when not 0, the
// new window). Throws when the fields don't fit together.
export function launchProfile(options = {}) {
  const p = resolveProfile(options.profile)
  if (options.depth) p.frames.depth = options.depth
  if (options.opener) { p.launch = 'popup'; p.apiWhere = 'opener' }
  const { depth, kind, sandbox } = p.frames
  if (p.apiWhere === 'opener' && p.launch !== 'popup') bad('apiWhere', 'can be opener only when launch is popup (the API is on the window that opened the content)')
  if (p.launch === 'popup' && p.apiWhere !== 'opener' && !depth) bad('apiWhere', `can be ${p.apiWhere} with launch popup only with frames.depth of 1 or more (an LMS frame in the new window to hold the API)`)
  if (kind === 'frameset' && (sandbox !== null || p.frames.allow !== GENERIC.frames.allow)) bad('frames.kind', 'frameset can’t have a sandbox or allow attribute (a <frame> has neither); use iframe')
  return p
}

// Where the test LMS puts the API: 0 is its own page (host.html); n is the LMS frame wrap.html#n (n frames above the
// content, counting down: wrap.html#1 is the content's parent).
export const apiAt = p => p.apiWhere === 'opener' ? 0 : p.apiWhere === 'parent' ? (p.frames.depth ? 1 : 0) : p.launch === 'popup' ? p.frames.depth : 0

// launchParams with its placeholders filled in (each value URL-encoded).
export const fillParams = (text, values) => text.replace(/\{(scoid|attempt|learner)\}/g, (_, k) => encodeURIComponent(values[k] ?? ''))
