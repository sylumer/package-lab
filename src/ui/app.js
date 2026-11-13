// SCORM Lab's window: toolbar, runs list and the tabs that show a run.
const $ = id => document.getElementById(id)
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) if (v != null && v !== false) k === 'class' ? e.className = v : k.startsWith('on') ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v === true ? '' : v)
  e.append(...kids.flat(Infinity).filter(x => x != null && x !== false).map(x => typeof x === 'object' ? x : String(x)))
  return e
}
const say = t => { $('status').textContent = t }
const short = u => (u || '').replace(/^lab:\/\/run\/pkg\//, '')
const at = f => f ? `${f.fn || '(anonymous)'} ${short(f.url)}:${f.line}` : ''
const secs = t => (t / 1000).toFixed(2)

const st = { running: null, boots: {}, pkg: null, runs: [], sel: null, ref: null, fail: null, cmp: null, tab: 'Findings', live: [] }
const TABS = ['Findings', 'Boot path', 'Package', 'API', 'Lookups', 'Network', 'Scripts', 'Errors', 'Console', 'Frames', 'Compare', 'Experiments', ...(lab.web ? ['Live'] : [])]

function findingsList(fs) {
  if (!fs?.length) return h('p', { class: 'muted' }, 'No findings.')
  return fs.map(f => h('div', { class: 'finding ' + f.sev }, h('h3', {}, h('span', { class: 'sev' }, f.sev === 'warn' ? 'warning' : f.sev), f.title),
    f.detail && h('p', {}, f.detail), f.evidence?.length && h('ul', {}, f.evidence.map(e => h('li', {}, e))), f.fix && h('p', { class: 'fix' }, h('b', {}, 'Try: '), f.fix)))
}
function table(cols, rows) {
  const q = $('filter').value.trim().toLowerCase()
  const shown = q ? rows.filter(r => r.some(c => String(c ?? '').toLowerCase().includes(q))) : rows
  return [h('p', { class: 'muted small' }, `${shown.length} of ${rows.length}`),
    h('table', {}, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c)))),
      h('tbody', {}, shown.slice(0, 3000).map(r => h('tr', {}, r.map(c => c instanceof Node ? h('td', {}, c) : h('td', {}, c ?? '')))))) ]
}
const run = () => st.runs.find(r => r.id === st.sel)

const VIEWS = {
  Findings() {
    const r = run()
    if (!r) return [h('h3', { class: 'section' }, 'Package'), findingsList(st.pkg?.findings ?? [])]
    return [h('p', { class: 'muted small' }, `${r.label}. Saved to ${r.file || '(not saved)'}.`),
      r.milestones && h('p', { class: 'milestones' }, r.milestones.map(s => h('span', { class: s.reached ? 'ok' : 'bad', title: s.evidence }, `${s.reached ? '✓' : '✗'} ${s.label}`))),
      findingsList(r.findings)]
  },
  'Boot path'() {
    const r = run(), item = $('item').value
    let boot = r?.boot
    if (!boot) {
      if (!st.pkg) return h('p', { class: 'muted' }, 'Open a package.')
      boot = st.boots[item]
      if (boot === undefined || boot === 'pending') { if (!boot) { st.boots[item] = 'pending'; lab.invoke('boot', { item: +item }).then(b => { st.boots[item] = b; render() }) } return h('p', { class: 'muted' }, 'Working out the boot path…') }
      if (!boot) return h('p', { class: 'muted' }, 'This item has no launch page in the package.')
    }
    const FILE = { ok: 'in package', case: 'wrong capitals', missing: 'missing', server: 'server path', outside: 'outside package', local: 'author’s computer', remote: 'other site', 'remote-http': 'other site (http)' }
    const runCell = n => !r ? '' : !n.run ? h('span', { class: n.status === 'ok' && n.how !== 'literal' && n.kind !== 'asset' ? 'bad' : 'muted' }, 'never asked for')
      : n.run.failed || n.run.status >= 400 ? h('span', { class: 'bad' }, String(n.run.status ?? n.run.failed)) : n.run.pending ? 'still waiting' : `${n.run.status} at ${secs(n.run.t)} s`
    const out = [h('p', { class: 'muted small' }, r ? `How ${boot.start} should load, against what ${r.label} actually loaded.` : `How ${boot.start} should load, worked out from the files. Launch it to see what actually loads.`),
      findingsList(boot.risks),
      h('h3', { class: 'section' }, 'Loading path'),
      ...table(['#', 'File', 'Kind', 'How', 'From', 'In the files', ...(r ? ['In the run'] : [])], boot.nodes.map((n, i) => [i + 1, '  '.repeat(n.depth) + (n.path ?? n.target), n.kind + (n.mode && n.mode !== 'sync' ? ` (${n.mode})` : ''), n.how,
        n.from ? `${n.from}:${n.line}` : '', h('span', { class: n.status === 'ok' ? 'ok' : 'bad' }, FILE[n.status] + (n.actual ? ': ' + n.actual : '') + (n.elsewhere ? ' (there is ' + n.elsewhere + ')' : '')), ...(r ? [runCell(n)] : [])]))]
    for (const pg of boot.pages) out.push(h('h3', { class: 'section' }, `Script order on ${pg.path}`), ...table(['Runs', 'Script', 'Mode', 'Line'], pg.execOrder.map((x, i) => [i + 1, x.name, x.mode, x.line])))
    if (boot.dynamic.length) out.push(h('h3', { class: 'section' }, 'Paths built at run time (can’t be checked from the files)'), ...table(['File', 'Line', 'Code'], boot.dynamic.map(d => [d.file, d.line, h('code', {}, d.text)])))
    return out
  },
  Package() {
    const a = st.pkg?.analysis
    if (!a) return h('p', { class: 'muted' }, 'Open a package.')
    const m = a.manifest
    const out = [h('table', {}, h('tbody', {},
      [['File', st.pkg.name], ['Files', `${a.files} (${(a.size / 1048576).toFixed(1)} MB)`], ['Manifest', m ? `SCORM ${m.version}${m.edition ? ' ' + m.edition + ' edition' : ''} (schemaversion “${m.schemaversion}”)` : 'none'],
        ['Scripts use', a.apiUse === 'none' ? 'no SCORM API names' : a.apiUse === 'both' ? 'both APIs' : 'SCORM ' + a.apiUse], ['Made with', a.fingerprints.join(', ') || 'not recognised'], ['Root', a.root || '(top of the ZIP)']]
        .map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v)))))]
    if (m) out.push(h('h3', { class: 'section' }, 'Items'), ...table(['Item', 'Type', 'Launch', 'Parameters', 'Mastery'], m.items.map(i => ['  '.repeat(i.depth) + (i.title || i.id), i.type, i.res?.path ?? i.res?.href ?? '', i.params, i.mastery])))
    const rows = []
    for (const [file, s] of Object.entries(a.scan)) for (const [k, list] of Object.entries(s)) for (const x of list) rows.push([file, x.line, k, h('code', {}, x.text)])
    out.push(h('h3', { class: 'section' }, 'What the scripts say'), ...table(['File', 'Line', 'Kind', 'Code'], rows))
    return out
  },
  API() {
    const list = run() ? run().trace.probe : st.live
    const calls = list.filter(p => p.type === 'api')
    const rows = calls.map(c => [secs(c.t ?? 0), c.call, c.el, c.value === undefined ? '' : h('code', {}, String(c.value).slice(0, 400)), c.result, c.err ? h('span', { class: 'bad' }, c.err + (c.diag ? ': ' + c.diag : '')) : ''])
    const out = table(['s', 'Call', 'Element', 'Value', 'Result', 'Error'], rows)
    const cmi = run()?.trace.cmi
    if (cmi) for (const [v, vals] of Object.entries(cmi)) out.push(h('h3', { class: 'section' }, `Stored values at the end (SCORM ${v})`), ...table(['Element', 'Value'], Object.entries(vals).map(([k, x]) => [k, h('code', {}, x)])))
    return out
  },
  Lookups() {
    const list = (run() ? run().trace.probe : st.live).filter(p => p.type !== 'api')
    return table(['s', 'Kind', 'Name', 'Result', 'Frame', 'Where'], list.map(p => [secs(p.t ?? 0), p.type, p.name ?? '',
      p.type === 'lookup' ? h('span', { class: p.found ? 'ok' : 'bad' }, (p.found ? 'found' : 'missing') + (p.n > 1 ? ` ×${p.n}` : '')) : p.type === 'frame' ? `depth ${p.depth}${p.topReachable ? '' : ', top unreachable'}${p.opener ? ', has opener' : ''}` : p.type === 'assign' ? `${p.kind} {${(p.keys || []).join(', ')}}` : p.error ?? '',
      short(p.frame), h('code', {}, (p.stack || []).slice(0, 3).join('\n'))]))
  },
  Network() {
    const r = run(); if (!r) return h('p', { class: 'muted' }, 'Choose a run.')
    return table(['s', 'Method', 'URL', 'Type', 'Status', 'From'], r.trace.requests.map(q => [secs(q.t), q.method, short(q.url), q.type,
      q.failed || q.status >= 400 ? h('span', { class: 'bad' }, String(q.status ?? q.failed) + (q.failed && q.status ? ' ' + q.failed : '')) : q.status ?? '…', h('code', {}, (q.from || []).slice(0, 3).map(at).join('\n'))]))
  },
  Scripts() {
    const r = run(); if (!r) return h('p', { class: 'muted' }, 'Choose a run.')
    return table(['s', 'Script', 'Size', 'Loaded by'], r.trace.scripts.map(s => [secs(s.t), short(s.url) || '(eval)', s.length, h('code', {}, (s.from || []).slice(0, 4).map(at).join('\n'))]))
  },
  Errors() {
    const r = run(); if (!r) return h('p', { class: 'muted' }, 'Choose a run.')
    const rows = [...r.trace.exceptions.map(e => [secs(e.t), 'uncaught', e.text, e.at, e.url + ':' + e.line]), ...r.trace.caught.map(e => [secs(e.t), e.uncaught ? 'uncaught' : 'caught', e.text, e.at, '']),
      ...r.trace.log.filter(l => l.level === 'error' || l.level === 'warning').map(l => [secs(l.t), l.source, l.text, [], l.url])]
      .sort((a, b) => a[0] - b[0]).map(([t, k, text, frames, u]) => [t, k, text, h('code', {}, (frames.length ? frames.slice(0, 5).map(at) : [short(u)]).join('\n'))])
    return table(['s', 'Kind', 'Message', 'Where'], rows)
  },
  Console() {
    const r = run(); if (!r) return h('p', { class: 'muted' }, 'Choose a run.')
    return table(['s', 'Level', 'Message', 'Where'], r.trace.console.map(c => [secs(c.t), c.level, h('code', {}, c.text), at(c.at?.[0])]))
  },
  Frames() {
    const r = run(); if (!r) return h('p', { class: 'muted' }, 'Choose a run.')
    return [h('h3', { class: 'section' }, 'Navigations'), ...table(['s', 'Frame', 'Parent', 'URL'], r.trace.navigations.map(n => [secs(n.t), n.frame.slice(0, 8), n.parent.slice(0, 8), short(n.url)])),
      h('h3', { class: 'section' }, 'Targets (cross-origin frames, workers, popups)'), ...table(['s', 'Type', 'URL'], r.trace.targets.map(t => [secs(t.t), t.type, short(t.url)]))]
  },
  Compare() {
    if (!st.cmp) return h('p', { class: 'muted' }, 'Choose a reference (R) and a failing run (F) in the list, then Compare.')
    const c = st.cmp.cmp, cov = c.coverage
    const out = [findingsList(st.cmp.findings),
      h('h3', { class: 'section' }, 'Requests the reference made that the run didn’t'), ...table(['s', 'URL', 'Status', 'From'], c.requests.onlyRef.map(q => [secs(q.t), q.url, q.status, h('code', {}, (q.from || []).slice(0, 3).map(at).join('\n'))])),
      h('h3', { class: 'section' }, 'Requests that worked in the reference and failed in the run'), ...table(['URL in run', 'Run', 'Reference'], c.requests.failedInRun.map(x => [short(x.run.url), x.run.status ?? x.run.failed, x.ref.status])),
      h('h3', { class: 'section' }, 'Scripts only in the reference'), ...table(['s', 'Script'], c.scripts.onlyRef.map(s => [secs(s.t), s.url])),
      h('h3', { class: 'section' }, 'Scripts only in the run'), ...table(['s', 'Script'], c.scripts.onlyRun.map(s => [secs(s.t), short(s.url)]))]
    if (cov) out.push(
      h('h3', { class: 'section' }, 'Branches taken only in the reference'), ...table(['Script', 'Line', 'Function', 'Code'], cov.branchesOnlyRef.map(b => [short(b.url), b.line, b.fn, h('code', {}, b.text.trim())])),
      h('h3', { class: 'section' }, 'Branches taken only in the run'), ...table(['Script', 'Line', 'Function', 'Code'], cov.branchesOnlyRun.map(b => [short(b.url), b.line, b.fn, h('code', {}, b.text.trim())])),
      h('h3', { class: 'section' }, 'Functions that ran only in the reference'), ...table(['Script', 'Line', 'Function'], cov.fnsOnlyRef.map(f => [short(f.url), f.line, f.name])),
      h('h3', { class: 'section' }, 'Functions that ran only in the run'), ...table(['Script', 'Line', 'Function'], cov.fnsOnlyRun.map(f => [short(f.url), f.line, f.name])))
    return out
  },
}

// ---- Experiments: one launch run several ways, with a table that fills as each run finishes ----
st.exp = { preset: 'standard', presets: null, names: [], rows: [], findings: [], busy: false, note: '' }
VIEWS.Experiments = () => {
  const x = st.exp
  if (!x.presets) { x.presets = []; lab.invoke('experiment-presets').then(p => { x.presets = p; render() }) }
  const rows = x.names.map((n, i) => x.rows[i] ?? { name: n, pending: true })
  return [h('p', { class: 'muted small' }, 'Runs the item with the settings above, then again with each variant changed, one after another. Each takes as long as “Stop after” (10 s if that is “I stop it”).'),
    h('div', { class: 'row' },
      h('label', {}, 'Variants ', h('select', { onchange: e => { x.preset = e.target.value } }, x.presets.map(p => h('option', { value: p, selected: p === x.preset }, p)))),
      h('button', { type: 'button', disabled: x.busy || !!st.running || !st.pkg?.items.length, onclick: () => act(async () => {
        x.names = []; x.rows = []; x.findings = []; x.busy = true; x.note = ''; render()
        try { await lab.invoke('experiment-start', { item: +$('item').value, preset: x.preset, ...launchOptions(), wait: +$('auto').value || 10 }) } catch (e) { x.busy = false; throw e }
      }) }, 'Run all'),
      h('button', { type: 'button', class: 'secondary', disabled: !x.busy, onclick: () => act(() => lab.invoke('experiment-stop')) }, 'Stop'),
      h('span', { class: 'muted small' }, x.note)),
    rows.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Variant', 'Furthest', 'API calls', 'Errors', 'Verdict', 'Against the default'].map(c => h('th', {}, c)))),
      h('tbody', {}, rows.map(r => h('tr', { class: r.runId ? 'click' : null, title: r.runId ? 'Open this run' : null, onclick: r.runId ? () => { st.sel = r.runId; st.tab = 'Findings'; render() } : null },
        r.pending || r.failed ? [h('td', {}, r.name), h('td', { colspan: 5, class: r.failed ? 'bad' : 'muted' }, r.failed ? r.progress : x.busy ? 'waiting…' : 'not run')]
          : [r.name, r.furthestLabel, r.apiCalls, r.errors, h('span', { class: r.verdict.sev === 'ok' ? 'ok' : 'bad' }, r.verdict.sev === 'ok' ? 'OK' : r.verdict.title), h('span', { class: r.better > 0 ? 'ok' : r.better < 0 ? 'bad' : null }, r.progress)].map(c => h('td', {}, c)))))) : null,
    findingsList(x.findings)]
}

// ---- Live view (web interface only): the running content, with clicks and keys sent back to it ----
const KEYS = { Enter: 'Enter', Tab: 'Tab', Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete', ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', PageUp: 'PageUp', PageDown: 'PageDown', Home: 'Home', End: 'End' }
const liveInput = e => lab.invoke('live-input', e).catch(() => {})
const liveImg = h('img', { class: 'live-frame', alt: 'The running content', tabindex: '0' })
const liveInfo = h('p', { class: 'muted small' }, 'Waiting for the first frame…')
const liveText = h('input', { type: 'text', placeholder: 'Text to type into the course', spellcheck: 'false', 'aria-label': 'Text to type into the course' })
const livePanel = h('div', { class: 'live' },
  h('p', { class: 'muted small' }, 'The course is running on the Mac. Click the picture to click the course; with the picture focused, keys go to the course too.'),
  liveImg, liveInfo,
  h('div', { class: 'row' }, liveText, h('button', { type: 'button', onclick: () => { if (liveText.value) { liveInput({ type: 'text', text: liveText.value }); liveText.value = '' } } }, 'Type'),
    ...['Enter', 'Tab', 'Escape', 'Backspace', 'Space', 'Up', 'Down', 'Left', 'Right'].map(k => h('button', { type: 'button', class: 'secondary', onclick: () => liveInput({ type: 'key', key: k }) }, k))))
const at01 = e => ({ x: e.offsetX / liveImg.clientWidth, y: e.offsetY / liveImg.clientHeight })
liveImg.addEventListener('click', e => { liveImg.focus(); liveInput({ type: 'click', ...at01(e) }) })
let wheelAt = 0
liveImg.addEventListener('wheel', e => { e.preventDefault(); if (Date.now() - wheelAt < 60) return; wheelAt = Date.now(); liveInput({ type: 'wheel', ...at01(e), dy: e.deltaY }) }, { passive: false })
liveImg.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey) return
  if (KEYS[e.key]) { e.preventDefault(); liveInput({ type: 'key', key: KEYS[e.key] }) } else if (e.key.length === 1) { e.preventDefault(); liveInput({ type: 'text', text: e.key }) }
})
let liveStop = null
function liveWatch(on) {
  if (on && !liveStop) liveStop = lab.live(f => { liveImg.src = 'data:image/jpeg;base64,' + f.jpeg; liveInfo.textContent = `${f.w} × ${f.h} · ${secs(f.t)} s into the run` })
  else if (!on && liveStop) { liveStop(); liveStop = null; liveImg.removeAttribute('src'); liveInfo.textContent = 'Waiting for the first frame…' }
}
VIEWS.Live = () => st.running ? livePanel : h('p', { class: 'muted' }, 'Launch an item to see it here. It runs on the Mac; this view lets you watch and use it from here.')

function render() {
  if (lab.web) liveWatch(st.tab === 'Live' && !!st.running)
  $('tabs').replaceChildren(...TABS.map(t => h('button', { type: 'button', role: 'tab', 'aria-selected': String(t === st.tab), onclick: () => { st.tab = t; render() } }, t)))
  $('view').replaceChildren(...[VIEWS[st.tab]()].flat(Infinity))
  $('runs').replaceChildren(...st.runs.map(r => h('li', { class: r.id === st.sel ? 'sel' : null, onclick: () => { st.sel = r.id; render() } },
    h('label', { title: 'Reference: the run that works' }, h('input', { type: 'radio', name: 'ref', checked: st.ref === r.id, onclick: e => { e.stopPropagation(); st.ref = r.id; render() } }), h('span', { class: 'tag' }, 'R')),
    h('label', { title: 'The run that fails' }, h('input', { type: 'radio', name: 'fail', checked: st.fail === r.id, onclick: e => { e.stopPropagation(); st.fail = r.id; render() } }), h('span', { class: 'tag' }, 'F')),
    h('span', { class: 'lbl' }, r.label, h('span', { class: 'kind' }, `${r.findings.filter(f => f.sev === 'error').length} errors · ${r.trace.probe.filter(p => p.type === 'api').length} API calls · ${r.trace.requests.length} requests`)))))
  $('compare').disabled = !(st.ref && st.fail && st.ref !== st.fail)
}

async function act(fn, busy) {
  try { if (busy) say(busy); await fn() } catch (e) { say(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) }
}
function showPackage(p) {
  if (!p) return
  st.pkg = p; st.sel = null; st.boots = {}
  $('pkg-name').textContent = p.name
  $('item').replaceChildren(...p.items.map(i => h('option', { value: i.index }, `${'· '.repeat(i.depth)}${i.title} (${i.type || '?'})`)))
  const firstSco = p.items.find(i => i.type === 'sco'); if (firstSco) $('item').value = firstSco.index
  $('item').disabled = !p.items.length; $('launch').disabled = !p.items.length
  say(`${p.name}: before running, ${p.findings.filter(f => f.sev === 'error').length} errors and ${p.findings.filter(f => f.sev === 'warn').length} warnings.`)
  st.tab = 'Findings'; render()
}
$('open').onclick = () => lab.web ? $('file').click() : act(async () => showPackage(await lab.invoke('open-package')))
$('file').onchange = () => act(async () => {
  const f = $('file').files[0]
  if (!f) return
  showPackage(await lab.upload(f, p => say(`Uploading ${f.name}: ${Math.round(p * 100)}%`)))
  $('file').value = ''
}, 'Uploading…')
const launchOptions = () => ({ expose: $('expose').value, depth: +$('depth').value || 0, opener: $('opener').checked, resume: $('resume').checked, caught: $('caught').checked, auto: +$('auto').value })
async function showOptions() {
  try {
    const n = st.pkg?.items.findIndex(i => i.index === +$('item').value) + 1
    const r = await lab.invoke('options', { ...launchOptions(), item: n || undefined })
    $('options-json').textContent = JSON.stringify(r.options, null, 2); $('cli-line').textContent = r.command
  } catch (e) { $('options-json').textContent = e.message; $('cli-line').textContent = '' }
}
for (const id of ['item', 'expose', 'depth', 'opener', 'resume', 'caught', 'auto']) $(id).addEventListener('change', showOptions)
$('more').addEventListener('toggle', showOptions)
$('copy-cli').onclick = () => act(async () => { await navigator.clipboard.writeText($('cli-line').textContent); say('Copied.') })
$('launch').onclick = () => act(async () => {
  st.live = []
  await lab.invoke('launch', { item: +$('item').value, ...launchOptions() })
  st.sel = null; st.tab = lab.web ? 'Live' : 'API'; render()
}, 'Launching…')
$('ref').onclick = () => act(async () => { st.live = []; await lab.invoke('reference', { url: $('ref-url').value.trim(), caught: $('caught').checked, auto: +$('auto').value }); st.sel = null; st.tab = lab.web ? 'Live' : 'API'; render() }, 'Opening the reference…')
$('stop').onclick = () => act(() => lab.invoke('stop'), 'Collecting coverage and sources…')
$('compare').onclick = () => act(async () => { st.cmp = await lab.invoke('compare', { ref: st.ref, run: st.fail }); st.tab = 'Compare'; render(); say('Compared.') }, 'Comparing…')
const addRuns = list => { for (const r of list) if (!st.runs.some(x => x.id === r.id)) st.runs.push(r); if (list.length) { st.sel = list.at(-1).id; st.tab = 'Findings' } render() }
$('open-run').onclick = () => act(async () => {
  if (!lab.web) return addRuns(await lab.invoke('open-run'))
  const list = await lab.invoke('saved-runs')
  $('saved-list').replaceChildren(...(list.length ? list.map(f => h('li', {}, h('button', { type: 'button', class: 'link', onclick: () => act(async () => { $('saved').close(); addRuns(await lab.invoke('load-run', { file: f.file })) }, 'Opening…') },
    f.file.replace(/\.json$/, '')), h('span', { class: 'muted small' }, ` ${(f.size / 1048576).toFixed(1)} MB`))) : [h('li', { class: 'muted' }, 'None yet.')]))
  $('saved').showModal()
})
$('filter').oninput = () => render()
$('item').onchange = () => render()
let pending = false
lab.on('probe', p => { st.live.push(p); if (!run() && !pending) { pending = true; setTimeout(() => { pending = false; if (!run()) render() }, 300) } })
lab.on('run', r => { if (st.runs.some(x => x.id === r.id)) return; st.runs.push(r); if (!st.exp.busy) { st.sel = r.id; st.tab = 'Findings' } render(); say(`Recorded: ${r.findings.filter(f => f.sev === 'error').length} errors, ${r.findings.filter(f => f.sev === 'warn').length} warnings.`) })
lab.on('state', s => { st.running = s.running ? s : null; if (!s.running && st.tab === 'Live') st.tab = 'Findings'; render(); $('stop').disabled = !s.running; $('launch').disabled = !!s.running || !st.pkg?.items.length; $('ref').disabled = !!s.running; if (s.running) say(`Recording ${s.label}. ${s.auto ? `It stops by itself after ${s.auto} s, or` : 'Use the course, then'} Stop and analyse${lab.web ? '' : ' (or close its window)'}.`) })
lab.on('experiment', e => {
  const x = st.exp
  if (e.state === 'start') { x.names = e.names; x.rows = []; x.findings = []; x.busy = true }
  else if (e.state === 'result') { x.rows[e.index] = e.row; x.note = `Finished ${e.index + 1} of ${x.names.length}.` }
  else if (e.state === 'done') { x.rows = e.rows; x.findings = e.findings; x.busy = false; x.note = e.stopped ? 'Stopped.' : 'Done.' }
  else { x.busy = false; x.note = e.message }
  render()
})
lab.on('package', p => { if (p?.loaded !== st.pkg?.loaded) showPackage(p) })
render()
// The web interface may join a session already under way: show its package, runs and any run in progress.
if (lab.web) lab.invoke('state').then(s => {
  if (s.pkg) showPackage(s.pkg)
  addRuns(s.runs)
  if (s.running) { st.running = s.running; $('stop').disabled = false; $('launch').disabled = true; st.tab = 'Live'; render() }
  document.title = 'SCORM Lab (web)'
}).catch(e => say(e.message))
