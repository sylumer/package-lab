// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// The execution trace, page side (P1.4). Injected ahead of probe.js in every frame when a run is traced
// (options.trace). The package's scripts are served instrumented (src/instrument.js) and call these three:
//   __labT(1 | 2, site)          a function started or ended
//   __labR(site, value)          a function returned value (recorded as an end; value given back)
//   __labC(site, a, b?, op?)     a decision: records it and gives back what the test gave (see instrument.js)
// Events [time, kind, site, result, ...previews] go into a ring of 200,000 and are sent to the recorder through
// __labReport as { type: 'exec', events, wrapped } 250 ms after the first one, at page hide, and when __labFlush() is
// called (the recorder does that as the run stops). The same site with the same result more than 1,000 times in a row
// is counted, not stored: [time, 4, site, result, n] says the event before repeated n more times.
//
// A preview never runs the content's code: no getters, no toString or valueOf. Objects give their constructor's name
// and up to five own keys (arrays, typed arrays, windows and DOM objects give only the name). A Proxy's traps do run
// when it is previewed (getPrototypeOf, ownKeys), except for Package Lab's own (shape-probe.js).
(() => {
  if (typeof globalThis.__labT === 'function') return
  // Taken now, before the content can replace them.
  const CAP = 200000, REPEAT = 1000, later = setTimeout, now = Date.now, stringify = JSON.stringify, Str = String
  const { apply, defineProperty } = Reflect, { keys, getPrototypeOf, getOwnPropertyDescriptor } = Object, isArray = Array.isArray, isView = ArrayBuffer.isView
  const slice = String.prototype.slice, test = RegExp.prototype.test, isShape = typeof globalThis.__labIsShape === 'function' ? globalThis.__labIsShape : () => false
  const NOKEYS = /^(Window|Document|HTMLDocument|XMLDocument|Location|Node|Text|NodeList|HTMLCollection|\w*Element)$/
  let ring = [], head = 0, n = 0, wrapped = false, timer = 0
  let lastKind = 0, lastSite = -1, lastRes = -1, run = 0, skipped = 0

  const pv = v => {
    const t = typeof v
    if (v === null) return ['null']
    if (t === 'undefined') return ['undefined']
    if (t === 'string') return v.length > 80 ? ['string', apply(slice, v, [0, 80]), v.length] : ['string', v]
    if (t === 'number') return ['number', v === v && v !== Infinity && v !== -Infinity ? v : Str(v)]
    if (t === 'boolean') return ['boolean', v]
    if (t === 'bigint' || t === 'symbol') return [t, Str(v)]
    try {
      if (isShape(v)) return ['object', 'stand-in']
      if (t === 'function') { const d = getOwnPropertyDescriptor(v, 'name'); return ['function', d && typeof d.value === 'string' ? d.value : ''] }
      const p = getPrototypeOf(v), c = p && getOwnPropertyDescriptor(p, 'constructor'), cn = c && typeof c.value === 'function' && getOwnPropertyDescriptor(c.value, 'name')
      const name = p === null ? 'Object' : cn && typeof cn.value === 'string' ? cn.value : ''
      if (isArray(v) || isView(v) || apply(test, NOKEYS, [name])) return ['object', name]
      const k = keys(v), first = []
      for (let i = 0; i < k.length && i < 5; i++) first[i] = k[i]
      return ['object', name, first, k.length]
    } catch (e) { return [t] }
  }
  const put = e => {
    if (n < CAP) ring[(head + n++) % CAP] = e
    else { ring[head] = e; head = (head + 1) % CAP; wrapped = true }
    if (!timer) timer = later(flush, 250)
  }
  // previews: 0 (none), 1 (a) or 2 (a and b)
  const record = (kind, site, res, previews, a, b) => {
    if (kind === lastKind && site === lastSite && res === lastRes) { if (++run > REPEAT) { skipped++; return } }
    else { if (skipped) put([now(), 4, lastSite, lastRes, skipped]); skipped = 0; run = 1; lastKind = kind; lastSite = site; lastRes = res }
    put(kind !== 3 ? [now(), kind, site] : previews === 2 ? [now(), 3, site, res, pv(a), pv(b)] : [now(), 3, site, res, pv(a)])
  }
  function flush() {
    timer = 0
    if (skipped) { put([now(), 4, lastSite, lastRes, skipped]); skipped = 0 }
    if (!n) return
    const events = []
    for (let i = 0; i < n; i++) events[i] = ring[(head + i) % CAP]
    const w = wrapped
    ring = []; head = 0; n = 0; wrapped = false
    try { __labReport(stringify({ type: 'exec', frame: location.href, events, wrapped: w })) } catch (e) { /* binding missing */ }
  }
  // Named, so a stack that passes through them says so (probe.js leaves them out of its stacks).
  function __labT(kind, site) { try { record(kind, site) } catch (e) { /* never break the content */ } }
  function __labR(site, v) { try { record(2, site) } catch (e) { /* never break the content */ } return v }
  function __labC(site, a, b, o) {
    let v
    switch (o) {
      case undefined: case '??': v = a; break
      case '!': v = !a; break
      case '===': v = a === b; break
      case '!==': v = a !== b; break
      case '==': v = a == b; break   // eslint-disable-line eqeqeq
      case '!=': v = a != b; break   // eslint-disable-line eqeqeq
      case '<': v = a < b; break
      case '<=': v = a <= b; break
      case '>': v = a > b; break
      case '>=': v = a >= b; break
      case 'in': v = a in b; break
      case 'instanceof': v = a instanceof b; break
    }
    try { record(3, site, (o === '??' ? v !== null && v !== undefined : v) ? 1 : 0, o === undefined || o === '!' || o === '??' ? 1 : 2, a, b) } catch (e) { /* never break the content */ }
    return v
  }
  for (const [name, value] of [['__labT', __labT], ['__labR', __labR], ['__labC', __labC], ['__labFlush', flush]]) defineProperty(globalThis, name, { value })
  try { addEventListener('pagehide', flush) } catch (e) { /* no window */ }
})()
