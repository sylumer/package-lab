// What the content reads from a server's response (P1.3). Injected ahead of probe.js when a run answers requests with
// "@probe" (see src/shape.js): the recorder puts the patterns of those requests in globalThis.__labShape. For a
// response whose URL matches, Response.json(), Response.text() followed by JSON.parse, and XMLHttpRequest's response
// and responseText followed by JSON.parse give the content a recording Proxy over the data instead of the plain data.
// Every property it reads, and how it uses a value that wasn't there, is reported as { type: 'shape', url, path, use }.
//
// The Proxy stands in for values the response doesn't have. It is always truthy (if (cfg.x) takes the true branch),
// typeof says 'object', `in` says yes and Object.keys lists nothing. A missing value turned into text is '', into a
// number 0, iterated it is empty, and a missing key named like an array or string method (map, trim…) can be called
// and acts on [] or ''. Arrays in the data are given as they are and not followed.
(() => {
  const list = globalThis.__labShape
  try { delete globalThis.__labShape } catch (e) { /* kept */ }
  if (!Array.isArray(list) || !list.length) return
  const res = list.map(p => new RegExp(p.source, p.flags))
  const probed = url => {
    if (!url) return false
    let u
    try { u = new URL(url, location.href) } catch (e) { return false }
    const lab = u.href.replace(/^https:\/\/lab\.invalid\//, 'lab://run/').replace(/^https:\/\/content\.invalid\//, 'lab://content/')   // patterns are written against the trace's form
    return res.some(re => re.test(u.href) || re.test(lab) || re.test(u.pathname + u.search) || re.test(u.pathname))
  }
  const send = d => { try { __labReport(JSON.stringify({ frame: location.href, ...d })) } catch (e) { /* binding missing */ } }
  // Frames of the content only: the probe's own have no address.
  const stack = () => (new Error().stack || '').split('\n').slice(1).map(s => s.trim().replace(/^at /, '')).filter(s => /:\/\/.*:\d+:\d+\)?$/.test(s)).slice(0, 5)
  const seen = new Map()
  let sent = 0
  const report = (url, path, use) => {
    const s = stack(), key = url + ' ' + path + ' ' + use + ' ' + s[0], n = (seen.get(key) || 0) + 1
    seen.set(key, n)
    if ((n <= 3 || n % 100 === 0) && sent++ < 3000) send({ type: 'shape', url, path, use, n, stack: s })
  }
  const ARRAY = new Set(['map', 'forEach', 'filter', 'some', 'every', 'find', 'findIndex', 'reduce', 'reduceRight', 'join', 'sort', 'flatMap', 'flat', 'push', 'pop', 'shift', 'unshift', 'splice', 'reverse', 'includes', 'indexOf', 'lastIndexOf', 'slice', 'concat', 'at'])
  const STRING = new Set(['trim', 'trimStart', 'trimEnd', 'toLowerCase', 'toUpperCase', 'split', 'replace', 'replaceAll', 'startsWith', 'endsWith', 'charAt', 'charCodeAt', 'substring', 'substr', 'match', 'padStart', 'padEnd', 'localeCompare', 'normalize', 'search', 'repeat'])
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v)
  const wrapped = new WeakMap()   // data object → its Proxy, so cfg.lms === cfg.lms
  // Every Proxy made here, so the execution trace (trace-probe.js) can preview one without running its traps.
  const proxies = new WeakSet()
  Object.defineProperty(globalThis, '__labIsShape', { value: v => proxies.has(v) })
  // A Proxy for the value at path. target is the data object there, or {} for a value the response doesn't have; a
  // missing key named like a method gets a function target, so that calling it works.
  function make(url, path, target) {
    const kids = new Map(), written = new Set(), at = k => path ? path + '.' + k : k
    const child = (k, v) => {
      if (!kids.has(k)) kids.set(k, plain(v) ? (wrapped.get(v) || make(url, at(k), v)) : v === undefined ? make(url, at(k), ARRAY.has(k) || STRING.has(k) ? () => {} : {}) : v)
      return kids.get(k)
    }
    const p = new Proxy(target, {
      get(t, k, recv) {
        if (typeof k === 'symbol') {
          if (Object.hasOwn(t, k) || k in t) return Reflect.get(t, k, recv)
          if (k === Symbol.toPrimitive) return hint => { report(url, path, hint === 'number' ? 'number' : hint === 'string' ? 'string' : 'text'); return hint === 'number' ? 0 : '' }
          if (k === Symbol.iterator) { report(url, path, 'array'); return function* () {} }
          return undefined
        }
        const own = plain(t) && Object.hasOwn(t, k)   // a function target's own names (length, name) aren't data
        if (written.has(k) || k === 'then' || k === 'toJSON' || (!own && k in t)) return Reflect.get(t, k, recv)
        if (own) { report(url, at(k), 'read'); return child(k, t[k]) }
        if (k === 'length') { report(url, path, 'array'); return 0 }
        if (!ARRAY.has(k) && !STRING.has(k)) report(url, at(k), 'read')   // a method name is reported when it is called (apply)
        return child(k, undefined)
      },
      apply(t, self, args) {   // a missing method was called: its owner is a list or text
        const k = path.slice(path.lastIndexOf('.') + 1), owner = path.slice(0, Math.max(0, path.lastIndexOf('.')))
        report(url, owner, ARRAY.has(k) ? 'array' : 'string')
        return (ARRAY.has(k) ? [] : '')[k](...args)
      },
      has(t, k) { if (typeof k === 'string' && !written.has(k)) report(url, at(k), 'in'); return true },
      ownKeys(t) { report(url, path, 'keys'); return Reflect.ownKeys(t) },
      set(t, k, v) { written.add(k); return Reflect.set(t, k, v) },
    })
    if (plain(target)) wrapped.set(target, p)
    proxies.add(p)
    return p
  }
  const root = (url, data) => plain(data) ? make(url, '', data) : data
  // Text read from a probed response, waiting for its JSON.parse. One parse each.
  const pending = []
  const pend = (text, url) => { if (typeof text === 'string' && !pending.some(p => p.text === text && p.url === url)) { pending.push({ text, url }); if (pending.length > 20) pending.shift() } }
  const parse = JSON.parse
  JSON.parse = function (text) {
    const v = parse.apply(this, arguments), i = pending.findIndex(p => p.text === text)
    return i < 0 ? v : root(pending.splice(i, 1)[0].url, v)
  }
  if (typeof Response !== 'undefined') {
    const R = Response.prototype, json = R.json, text = R.text
    R.json = function () { const url = this.url; return probed(url) ? json.call(this).then(d => root(url, d)) : json.call(this) }
    R.text = function () { const url = this.url; return probed(url) ? text.call(this).then(t => { pend(t, url); return t }) : text.call(this) }
  }
  if (typeof XMLHttpRequest !== 'undefined') {
    const X = XMLHttpRequest.prototype, dr = Object.getOwnPropertyDescriptor(X, 'response'), dt = Object.getOwnPropertyDescriptor(X, 'responseText'), xr = new WeakMap()
    if (dr?.get) Object.defineProperty(X, 'response', { ...dr, get() {
      const v = dr.get.call(this)
      if (this.readyState !== 4 || !probed(this.responseURL)) return v
      if (this.responseType === 'json') { if (!xr.has(this)) xr.set(this, root(this.responseURL, v)); return xr.get(this) }
      pend(v, this.responseURL)
      return v
    } })
    if (dt?.get) Object.defineProperty(X, 'responseText', { ...dt, get() { const v = dt.get.call(this); if (this.readyState === 4 && probed(this.responseURL)) pend(v, this.responseURL); return v } })
  }
})()
