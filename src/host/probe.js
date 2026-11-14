// Injected into every frame before its own scripts run (Page.addScriptToEvaluateOnNewDocument). It watches the two
// names SCORM content looks for, API and API_1484_11, on this frame's window: every lookup (with the stack that made
// it and whether something was there) and every assignment. Values pass through untouched, so an LMS that sets
// window.API works as normal. Reports go to the recorder through the __labReport binding.
(() => {
  if (window.__labProbed) return
  window.__labProbed = true
  const report = data => { try { __labReport(JSON.stringify({ frame: location.href, ...data })) } catch (e) { /* binding missing */ } }
  const stack = (skip = 0) => (new Error().stack || '').split('\n').slice(3 + skip, 9 + skip).map(s => s.trim().replace(/^at /, '')).filter(s => !s.includes('probe.js') && !/^__lab[A-Z]/.test(s))
  let depth = 0, w = window
  try { while (w !== w.parent && depth < 20) { w = w.parent; depth++ } } catch (e) { depth = -1 }
  let topReachable = true
  try { void window.top.location.href } catch (e) { topReachable = false }
  // origin is 'null' in a frame sandboxed without allow-same-origin (P2.1).
  report({ type: 'frame', depth, topReachable, opener: !!window.opener, referrer: document.referrer, origin: window.origin })
  const seen = new Map()
  // On a real LMS or hosted platform (anything but SCORM Lab's own host page, which logs its own calls), the API
  // object's methods are wrapped so that its calls are recorded too.
  const ownHost = location.href.startsWith('lab://run/__lab/')
  const QUIET = /GetLastError|GetErrorString|GetDiagnostic/
  const wrap = (name, v) => {
    if (ownHost || !v || typeof v !== 'object' || v.__labWrapped) return v
    const version = name === 'API' ? '1.2' : '2004', lastError = version === '1.2' ? 'LMSGetLastError' : 'GetLastError'
    const logged = (k, fn, self) => function (...a) {
      const result = fn.apply(self, a)
      if (!QUIET.test(k)) {
        let err = 0
        if (String(result) === 'false' || String(result) === '') try { err = +self[lastError].call(self) || 0 } catch (e) { /* no error call */ }
        report({ type: 'api', version, call: k, el: a[0] === undefined ? '' : String(a[0]), value: a[1] === undefined ? undefined : String(a[1]).slice(0, 5000), result: String(result), err, host: true })
      }
      return result
    }
    try {
      for (const k of Object.keys(v)) if (typeof v[k] === 'function') v[k] = logged(k, v[k], v)
      Object.defineProperty(v, '__labWrapped', { value: true })
      return v
    } catch (e) {
      return new Proxy(v, { get: (o, k) => typeof o[k] === 'function' && typeof k === 'string' ? logged(k, o[k], o) : o[k] })
    }
  }
  // What the page shows: text, visible elements and media, a visible loading indicator, and whether the page itself
  // is hidden. Sent when the document is parsed, when it has loaded, then at intervals while it changes, so the
  // last report is what the learner was looking at.
  if (!ownHost) {
    let last = ''
    const dom = () => {
      try {
        const b = document.body
        if (!b) return report({ type: 'dom', readyState: document.readyState, body: false })
        const vw = innerWidth, vh = innerHeight, els = b.getElementsByTagName('*')
        let visible = 0, media = 0, frames = 0, loader = null
        for (let i = 0; i < els.length && i < 4000; i++) {
          const e = els[i], r = e.getBoundingClientRect()
          if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) continue
          const cs = getComputedStyle(e)
          if (cs.visibility === 'hidden' || +cs.opacity === 0) continue
          visible++
          if (/^(IFRAME|FRAME)$/.test(e.tagName)) frames++
          else if (/^(IMG|VIDEO|CANVAS|SVG|OBJECT|EMBED)$/i.test(e.tagName)) media++
          const cls = typeof e.className === 'string' ? e.className.trim() : ''
          if (!loader && /load|spinner|preload|progress|wait|busy/i.test(e.id + ' ' + cls)) loader = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (cls ? '.' + cls.split(/\s+/).slice(0, 3).join('.') : '')
        }
        const hidden = [document.documentElement, b].map(x => getComputedStyle(x)).some(s => s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0)
        const text = (b.innerText || '').replace(/\s+/g, ' ').trim()
        const d = { readyState: document.readyState, text: text.length, sample: text.slice(0, 160), visible, media, frames, loader, hidden, elements: els.length, w: vw, h: vh }
        const key = JSON.stringify(d)
        if (key !== last) { last = key; report({ type: 'dom', ...d }) }
      } catch (e) { /* page going away */ }
    }
    document.addEventListener('DOMContentLoaded', dom)
    addEventListener('load', dom)
    ;[1, 2, 4, 7, 10, 15, 25, 40, 60].forEach(s => setTimeout(dom, s * 1000)) // also when load never comes
    addEventListener('pagehide', dom)
  }
  // Pins (P1.2): the recorder puts the pins for this run in window.__labPins. Top-level names become accessors on the
  // window, so `var x = …` at the top of a classic script assigns through the setter and is ignored. A dotted path is
  // an accessor on its root that, when given an object, pins the next name on that object, and so on. Every read and
  // write is reported (throttled like lookups). The accessors are configurable on purpose: a let or const at the top
  // of a script then makes its own binding (which the pin can't replace) instead of a SyntaxError that stops the script.
  const pins = (window.__labPins || []).filter(p => p.frames === 'all' || !ownHost)
  try { delete window.__labPins } catch (e) { /* kept */ }
  const preview = v => { try { return String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 200) } catch (e) { return typeof v } }
  const pinSeen = new Map()
  const pinNote = (type, path, extra) => {
    const s = stack(1), key = type + path + s.join('|'), n = (pinSeen.get(key) || 0) + 1
    pinSeen.set(key, n)
    if (n <= 3 || n % 100 === 0) report({ type, path, n, stack: s, ...extra })
  }
  // A dotted path's intermediate names share one accessor per object and name (hooks), so several pins under one root
  // (config.a, config.b) all follow a new object assigned to it. A watch pin (P1.5) passes values through and reports
  // watch-read and watch-write; on a name that another pin goes through, the shared accessor reports for it.
  // ponytail: a watched name that didn't exist yet is a non-enumerable accessor, so `name in obj` says yes; a Proxy would avoid that.
  const hooks = new WeakMap()
  const leaf = (obj, key, pin) => {
    const hook = hooks.get(obj)?.get(key)
    if (pin.mode === 'watch' && hook) { hook.watch.push(pin.path); return }
    if (pin.mode === 'watch') {
      const d = Object.getOwnPropertyDescriptor(obj, key)
      let v = d && 'value' in d ? d.value : undefined
      Object.defineProperty(obj, key, { configurable: true, enumerable: d ? d.enumerable : false,
        get() { pinNote('watch-read', pin.path); return d && d.get ? d.get.call(this) : v },
        set(x) { pinNote('watch-write', pin.path, { value: preview(x) }); if (d && d.set) d.set.call(this, x); else { v = x; if (!d) Object.defineProperty(obj, key, { enumerable: true }) } } })
      return
    }
    Object.defineProperty(obj, key, { configurable: true, enumerable: true,
      get() { pinNote('pin-read', pin.path); return pin.value },
      set(v) { pinNote('pin-write', pin.path, { value: preview(v) }) } })
  }
  const pinAt = (obj, segs, pin, prefix = '') => {
    const [key, ...rest] = segs, here = prefix ? prefix + '.' + key : key
    try {
      if (!rest.length) return leaf(obj, key, pin)
      let m = hooks.get(obj)
      if (!m) hooks.set(obj, m = new Map())
      const hook = m.get(key)
      if (hook) { hook.list.push([rest, pin]); const v = obj[key]; if (v && typeof v === 'object') pinAt(v, rest, pin, here); return }
      const h = { list: [[rest, pin]], watch: [] }
      m.set(key, h)
      let held = obj[key]
      if (held && typeof held === 'object') pinAt(held, rest, pin, here)
      Object.defineProperty(obj, key, { configurable: true, enumerable: true,
        get() { for (const w of h.watch) pinNote('watch-read', w); return held },
        set(v) { for (const w of h.watch) pinNote('watch-write', w, { value: preview(v) }); held = v; if (v && typeof v === 'object') for (const [r, p] of h.list) pinAt(v, r, p, here) } })
    } catch (e) { report({ type: 'pin-failed', path: pin.path, error: String(e.message || e).slice(0, 200) }) }
  }
  // Longer paths first, so a watched name that another pin goes through finds the shared accessor already there.
  pins.sort((a, b) => b.path.split('.').length - a.path.split('.').length)
  const held = pins.map(pin => { const root = pin.path.split('.')[0]; pinAt(window, [root, ...pin.path.split('.').slice(1)], pin); return [pin, root, Object.getOwnPropertyDescriptor(window, root)?.get] })
  // Content that redefines a pinned name (defineProperty, delete, a function declaration) replaces the pin: say so once the page has loaded.
  addEventListener('load', () => { for (const [pin, root, get] of held) if (get && Object.getOwnPropertyDescriptor(window, root)?.get !== get) report({ type: 'pin-failed', path: pin.path, error: 'the content redefined ' + root + ' after the pin was set, so the pin no longer applies' }) })
  // Blocked storage (P2.2): with window.__labStorage = 'blocked' (the recorder sets it, as it does the pins), content frames get
  // what Safari gives a third-party frame: localStorage and sessionStorage throw SecurityError when read, document.cookie
  // reads '' and ignores writes, and indexedDB.open fails with a SecurityError error event. Every access is reported
  // (throttled like lookups). SCORM Lab's own pages keep their storage.
  const blockStorage = window.__labStorage === 'blocked' && !ownHost
  try { delete window.__labStorage } catch (e) { /* kept */ }
  if (blockStorage) {
    const noted = new Map(), insecure = () => new DOMException('The operation is insecure.', 'SecurityError')
    const note = what => {
      const s = stack(1), key = what + s.join('|'), n = (noted.get(key) || 0) + 1
      noted.set(key, n)
      if (n <= 3 || n % 100 === 0) report({ type: 'storage-blocked', what, n, stack: s })
    }
    const fail = (name, f) => { try { f() } catch (e) { report({ type: 'probe-failed', name, error: String(e) }) } }
    for (const name of ['localStorage', 'sessionStorage'])
      fail(name, () => Object.defineProperty(window, name, { configurable: true, enumerable: true, get() { note(name); throw insecure() } }))
    fail('cookie', () => Object.defineProperty(Document.prototype, 'cookie', { configurable: true, enumerable: true,
      get() { note('document.cookie (read)'); return '' }, set(v) { note('document.cookie (write)') } }))
    // ponytail: the request is a plain EventTarget with the IDBOpenDBRequest fields, enough for onerror and addEventListener handlers; a real request object would need a second page.
    fail('indexedDB', () => Object.defineProperty(IDBFactory.prototype, 'open', { configurable: true, writable: true, value: function open() {
      note('indexedDB.open')
      const req = new EventTarget()
      Object.assign(req, { readyState: 'pending', result: undefined, error: null, source: null, transaction: null, onerror: null, onsuccess: null, onupgradeneeded: null, onblocked: null })
      queueMicrotask(() => {
        req.readyState = 'done'; req.error = insecure()
        const ev = new Event('error', { bubbles: true, cancelable: true })
        req.dispatchEvent(ev)
        if (typeof req.onerror === 'function') req.onerror.call(req, ev)
      })
      return req
    } }))
  }
  for (const name of ['API', 'API_1484_11']) {
    let value = wrap(name, window[name])
    try {
      Object.defineProperty(window, name, {
        configurable: true, enumerable: true,
        get() {
          const s = stack(), key = name + s.join('|'), n = (seen.get(key) || 0) + 1
          seen.set(key, n)
          // Content that polls would flood the log: the first three of each stack, then every hundredth.
          if (n <= 3 || n % 100 === 0) report({ type: 'lookup', name, found: value != null, n, stack: s })
          return value
        },
        set(v) { value = wrap(name, v); report({ type: 'assign', name, kind: typeof v, keys: v && typeof v === 'object' ? Object.keys(v).slice(0, 12) : [], stack: stack() }) },
      })
    } catch (e) { report({ type: 'probe-failed', name, error: String(e) }) }
  }
  // What the content waits for (P1.6): timers, 'message' listeners and postMessage calls, and animation frames (counted
  // only). Each name is replaced by a Proxy of the original, so the return value, `this` and every argument pass through
  // (string callbacks too); callbacks are wrapped only to count their runs, and a listener's wrapper is remembered so
  // removeEventListener finds it. Timers go out as a summary (per call site) at most once a second at first, then every
  // 5 s, and when the page hides or the recorder flushes; listeners and messages are reported as they happen, throttled.
  {
    const R = Reflect, own = Object.getOwnPropertyDescriptor, later = window.setTimeout, now = Date.now
    // The first frames of the caller, after this probe's own (anonymous) ones.
    const sites = n => { const f = (new Error().stack || '').split('\n').slice(1).map(x => x.trim().replace(/^at /, '')).filter(Boolean); while (f.length && /<anonymous>:\d+:\d+\)?$/.test(f[0])) f.shift(); return f.slice(0, n) }
    // Each wrapper (a hooked native's Proxy, a callback's wrapper) maps to the function it stands for, so that
    // Function.prototype.toString says what it said before and String(setTimeout) is unchanged.
    const orig = new WeakMap(), cl = x => String(x).slice(0, 80)
    const hook = (owner, name, apply) => {
      for (let o = owner; o; o = Object.getPrototypeOf(o)) {
        const d = own(o, name)
        if (!d) continue
        if (typeof d.value === 'function') try { const p = new Proxy(d.value, { apply }); orig.set(p, d.value); Object.defineProperty(o, name, { ...d, value: p }) } catch (e) { report({ type: 'probe-failed', name, error: cl(e) }) }
        return
      }
    }
    hook(Function.prototype, 'toString', (t, th, a) => R.apply(t, orig.has(th) ? orig.get(th) : th, a))
    const safe = f => { try { return f() } catch (e) { return undefined } }
    const href = w => safe(() => String(w.location.href)) || ''
    const isWin = w => w == null || safe(() => w.window === w)
    // Timers: one entry per kind and call site.
    if (!ownHost) {
      const T = new Map(), ids = new Map()
      let dirty = false, sched = 0, snaps = 0, raf = 0
      const tick = () => {
        sched = 0
        if (!dirty) return
        dirty = false; snaps++
        const list = [...T.values()].sort((a, b) => b.fired + b.created - a.fired - a.created).slice(0, 40)
        report({ type: 'timers', raf, sites: list.map(e => e.site), list: list.map(e => [e.kind, e.delay, e.created, e.fired, e.cleared, e.last ? now() - e.last : null]) })
      }
      const mark = () => { dirty = true; if (!sched) sched = later.call(window, tick, snaps < 30 ? 1000 : 5000) }
      // A stack costs: it is taken for the first 50 timers of each kind and every 20th after that; the others count
      // against the last site seen for the kind (a loop that re-arms the same timeout is one site).
      const seen = { timeout: 0, interval: 0 }, lastSite = { timeout: '', interval: '' }
      const entry = (kind, delay) => {
        const n = ++seen[kind]
        if (n <= 50 || n % 20 === 0) lastSite[kind] = sites(1)[0] || ''
        const key = kind + '|' + lastSite[kind]
        let e = T.get(key)
        if (!e) { if (T.size >= 200) return null; T.set(key, e = { kind, site: lastSite[kind], delay: 0, created: 0, fired: 0, cleared: 0, last: 0 }) }
        e.created++; e.delay = Math.max(0, +delay || 0)
        return e
      }
      for (const kind of ['timeout', 'interval']) hook(window, kind === 'timeout' ? 'setTimeout' : 'setInterval', (t, th, a) => {
        let e, id
        try {
          if (typeof a[0] === 'function' && (e = entry(kind, a[1]))) {
            const fn = a[0]
            const w = function () { if (kind === 'timeout') ids.delete(id); e.fired++; e.last = now(); mark(); return R.apply(fn, this, arguments) }
            orig.set(w, fn); a = [w, ...a.slice(1)]
            mark()
          }
        } catch (err) { /* never break the content */ }
        id = R.apply(t, th, a)
        if (e && ids.size < 5000) ids.set(id, e)
        return id
      })
      for (const name of ['clearTimeout', 'clearInterval']) hook(window, name, (t, th, a) => {
        try { const e = ids.get(a[0]); if (e) { e.cleared++; ids.delete(a[0]); mark() } } catch (err) { /* never break the content */ }
        return R.apply(t, th, a)
      })
      hook(window, 'requestAnimationFrame', (t, th, a) => { raf++; if (raf % 60 === 1) mark(); return R.apply(t, th, a) })
      addEventListener('pagehide', () => { dirty = true; tick() })
      Object.defineProperty(window, '__labFlushT', { configurable: true, value() { dirty = true; tick() } })   // the recorder calls it as the run stops
    }
    // 'message' listeners (functions only: an object's handleEvent is passed through and not counted).
    const wrappers = new WeakMap()
    let nextId = 0
    hook(typeof EventTarget === 'function' ? EventTarget.prototype : null, 'addEventListener', (t, th, a) => {
      try {
        if (a[0] === 'message' && typeof a[1] === 'function' && isWin(th)) {
          let w = wrappers.get(a[1])
          if (!w) {
            // Ids are unique; only the first 100 listeners are reported (a listener not reported isn't judged).
            const meta = { id: nextId++, ran: 0 }, fn = a[1], reported = meta.id < 100
            if (reported) report({ type: 'listener', id: meta.id, stack: sites(3) })
            wrappers.set(fn, w = function () {
              if (reported && (++meta.ran <= 5 || meta.ran % 100 === 0)) report({ type: 'msg-run', id: meta.id, n: meta.ran })
              return R.apply(fn, this, arguments)
            })
            orig.set(w, fn)
          }
          a = [a[0], w, ...a.slice(2)]
        }
      } catch (err) { /* never break the content */ }
      return R.apply(t, th, a)
    })
    hook(typeof EventTarget === 'function' ? EventTarget.prototype : null, 'removeEventListener', (t, th, a) => {
      try { if (a[0] === 'message' && typeof a[1] === 'function' && wrappers.has(a[1])) a = [a[0], wrappers.get(a[1]), ...a.slice(2)] } catch (err) { /* never break the content */ }
      return R.apply(t, th, a)
    })
    // postMessage: where it went (this frame's page, when the call is to this window), the message's shape and the
    // origin it named. A message's values are kept only when short: a string, number or boolean of 80 characters or less.
    // Strings are cut at 80 characters, and a value is kept only if it is a string, number or boolean of that size.
    // Only a plain object (prototype some realm's Object.prototype, or null: the sender may be another frame) has its keys read, by descriptor (no getters). A Proxy
    // can't be told from an object: its getPrototypeOf trap runs here (and ownKeys, if it passes as plain); an array
    // is reported by kind only, so its length (a trap on a Proxy) isn't read.
    const shape = d => {
      const t = typeof d
      if (d === null || t !== 'object') return { kind: d === null ? 'null' : cl(t), ...(t === 'string' ? d.length <= 80 ? { value: d } : {} : t === 'number' || t === 'boolean' ? { value: String(d) } : {}) }
      if (Array.isArray(d)) return { kind: 'array' }
      const proto = Object.getPrototypeOf(d)
      if (proto !== null && Object.getPrototypeOf(proto) !== null) return { kind: 'object' }   // any realm's Object.prototype has no prototype of its own
      const keys = Object.keys(d).slice(0, 5), vals = {}
      for (const k of keys) { const v = own(d, k)?.value; if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' && v.length <= 80) vals[cl(k)] = v }
      return { kind: 'object', keys: keys.map(cl), vals }
    }
    const posted = new Map()
    hook(window, 'postMessage', (t, th, a) => {
      try {
        const to = href(th == null ? window : th), sh = shape(a[0]), key = to + JSON.stringify(sh), n = (posted.get(key) || 0) + 1
        if (n === 1 && posted.size >= 200) return R.apply(t, th, a)   // too many kinds of message: the rest aren't reported
        posted.set(key, n)
        if (n <= 10 || n % 100 === 0) report({ type: 'post', to, shape: sh, origin: cl(typeof a[1] === 'string' ? a[1] : safe(() => own(a[1], 'targetOrigin').value) || ''), n, stack: sites(3) })
      } catch (err) { /* never break the content */ }
      return R.apply(t, th, a)
    })
  }
})()
