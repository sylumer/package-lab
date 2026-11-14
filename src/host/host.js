// The test LMS. On host.html it makes the SCORM API objects the launch asks for, then frames the content (through
// empty LMS frames, wrap.html#n, for depth) or opens it in a window. API calls go to the recorder through __labReport.
// wrap.html loads this too: wrap.html#n is an LMS frame n frames above the content, which frames the next one down.
// Where the API goes, and when, follows the run's LMS profile (config.json: apiAt, apiDelay; see src/profiles.js).
(async () => {
  const cfg = await (await fetch('config.json')).json()
  const n = +location.hash.slice(1) || 0
  if (!n) {
    const report = data => { try { __labReport(JSON.stringify({ frame: location.href, ...data })) } catch (e) { /* not recorded */ } }
    // With cfg.snapshots (a run that will leave like a learner, P2.4): the data model after each call that can change it, so the last one is what the LMS held when the content left: a
    // page that is closing can't be asked. Sent at once while leaving, otherwise at most every 250 ms. The recorder keeps only the last.
    let closing = false, lastSnap = 0, snapTimer = 0
    const snap = () => { snapTimer = 0; lastSnap = Date.now(); report({ type: 'cmi-now', values: window.__labCmi() }) }
    const changed = () => { if (closing || Date.now() - lastSnap > 250) snap(); else if (!snapTimer) snapTimer = setTimeout(snap, 250) }
    const make = version => scormRuntime({ ...cfg.runtime, version, cmi: new Map(Object.entries(cfg.cmi?.[version] ?? {})),
      log: e => { report({ type: 'api', version, ...e, value: e.value === undefined ? undefined : String(e.value).slice(0, 5000) }); if (cfg.snapshots && /SetValue|Commit|Finish|Terminate/.test(e.call)) changed() } })
    const expose = cfg.expose === 'both' ? ['1.2', '2004'] : cfg.expose === 'none' ? [] : [cfg.expose]
    const rts = {}
    for (const v of expose) rts[v] = make(v)
    // The values at the end of the run, for the progress checks.
    window.__labCmi = () => Object.fromEntries(Object.entries(rts).map(([v, r]) => [v, Object.fromEntries(r.cmi)]))
    addEventListener('pagehide', () => { closing = true; report({ type: 'cmi', values: window.__labCmi() }) })
    // The API objects stay this page's (its calls are logged here) but go on the window the profile names, after apiDelay.
    const give = w => { for (const v of expose) w[v === '1.2' ? 'API' : 'API_1484_11'] = rts[v].api }
    let ready = !cfg.apiDelay
    const waiting = []
    window.__labPlace = w => ready ? give(w) : waiting.push(w)
    if (!ready) setTimeout(() => { ready = true; waiting.forEach(give) }, cfg.apiDelay)
  }
  // The LMS page that holds the API: this run's host.html is the top window, or the opener of the content's window.
  if (n === (cfg.apiAt ?? 0)) (n ? top.__labPlace ? top : top.opener : window).__labPlace(window)
  const depth = n ? n - 1 : cfg.depth, next = depth > 0 ? 'wrap.html#' + depth : cfg.launch
  if (!n && cfg.opener) {
    document.body.textContent = 'The content is in its own window (window-opener profile).'
    // Opened blank; main.js calls __labPopupReady once the run's recorder is attached to the new window, and only then does it load.
    setTimeout(() => {
      const w = window.open('about:blank', 'content', 'width=1024,height=768')
      window.__labPopupReady = () => { window.__labPopupReady = null; if (w) w.location.href = next }
      setTimeout(() => window.__labPopupReady?.(), 3000)   // in case the recorder never attaches
    }, cfg.popupDelay || 0)
    return
  }
  // The frames' kind, and on the content's own frame the sandbox and allow attributes.
  const frames = cfg.frames ?? { kind: 'iframe', sandbox: null, allow: 'fullscreen; autoplay' }
  const f = document.createElement(frames.kind === 'frameset' ? 'frame' : 'iframe')
  f.src = next
  if (frames.kind === 'frameset') {
    const set = document.createElement('frameset')
    set.rows = '100%'; set.append(f)
    document.body.replaceWith(set)
    return
  }
  f.allow = frames.allow
  if (next === cfg.launch && frames.sandbox !== null) f.setAttribute('sandbox', frames.sandbox)
  document.body.append(f)
})()
