// Injected into every frame before its own scripts run (Page.addScriptToEvaluateOnNewDocument). It watches the two
// names SCORM content looks for, API and API_1484_11, on this frame's window: every lookup (with the stack that made
// it and whether something was there) and every assignment. Values pass through untouched, so an LMS that sets
// window.API works as normal. Reports go to the recorder through the __labReport binding.
(() => {
  if (window.__labProbed) return
  window.__labProbed = true
  const report = data => { try { __labReport(JSON.stringify({ frame: location.href, ...data })) } catch (e) { /* binding missing */ } }
  const stack = () => (new Error().stack || '').split('\n').slice(3, 9).map(s => s.trim().replace(/^at /, '')).filter(s => !s.includes('probe.js'))
  let depth = 0, w = window
  try { while (w !== w.parent && depth < 20) { w = w.parent; depth++ } } catch (e) { depth = -1 }
  let topReachable = true
  try { void window.top.location.href } catch (e) { topReachable = false }
  report({ type: 'frame', depth, topReachable, opener: !!window.opener, referrer: document.referrer })
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
})()
