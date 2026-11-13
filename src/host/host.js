// The test LMS: makes the SCORM API objects the host profile asks for, then frames the content (through empty LMS
// frames if the profile has depth) or opens it in a window. API calls go to the recorder through __labReport.
(async () => {
  const cfg = await (await fetch('config.json')).json()
  const report = data => { try { __labReport(JSON.stringify({ frame: location.href, ...data })) } catch (e) { /* not recorded */ } }
  const make = version => scormRuntime({ ...cfg.runtime, version, cmi: new Map(Object.entries(cfg.cmi?.[version] ?? {})),
    log: e => report({ type: 'api', version, ...e, value: e.value === undefined ? undefined : String(e.value).slice(0, 5000) }) })
  const expose = cfg.expose === 'both' ? ['1.2', '2004'] : cfg.expose === 'none' ? [] : [cfg.expose]
  const rts = {}
  for (const v of expose) { rts[v] = make(v); window[v === '1.2' ? 'API' : 'API_1484_11'] = rts[v].api }
  // The values at the end of the run, for the progress checks.
  window.__labCmi = () => Object.fromEntries(Object.entries(rts).map(([v, r]) => [v, Object.fromEntries(r.cmi)]))
  addEventListener('pagehide', () => report({ type: 'cmi', values: window.__labCmi() }))
  const url = cfg.launch
  if (cfg.opener) {
    document.body.textContent = 'The content is in its own window (window-opener profile).'
    window.open(url, 'content', 'width=1024,height=768')
    return
  }
  const f = document.createElement('iframe')
  f.src = cfg.depth > 0 ? 'wrap.html#' + encodeURIComponent(cfg.depth + '|' + url) : url
  f.allow = 'fullscreen; autoplay'
  document.body.append(f)
})()
