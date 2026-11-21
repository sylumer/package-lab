// Package Lab's window: toolbar, runs list and the tabs that show a run.
import { markdown } from './markdown.js'
const $ = id => document.getElementById(id)
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) if (v != null && v !== false) k === 'class' ? e.className = v : k.startsWith('on') ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v === true ? '' : v)
  e.append(...kids.flat(Infinity).filter(x => x != null && x !== false).map(x => typeof x === 'object' ? x : String(x)))
  return e
}
const say = t => { $('status').textContent = t }
const short = u => (u || '').replace(/^lab:\/\/(?:run|content)\/pkg\//, '')
const at = f => f ? `${f.fn || '(anonymous)'} ${short(f.url)}:${f.line}` : ''
const secs = t => (t / 1000).toFixed(2)

const st = { macro: { events: [], viewport: null }, cyc: { busy: false, note: '', rows: [], findings: [], runs: [] }, pins: [], responses: [], pinDraft: { path: '', value: '', frames: 'content' }, answer: null, running: null, boots: {}, pkg: null, runs: [], sel: null, ref: null, fail: null, cmp: null, tab: 'Findings', live: [] }
const TABS = ['Findings', 'Boot path', 'Package', 'Files', 'API', 'xAPI', 'Lookups', 'Network', 'Scripts', 'Execution', 'Drill-down', 'Timeline', 'Errors', 'Console', 'Frames', 'Compare', 'Package diff', ...(lab.web ? [] : ['Folder check']), 'Experiments', 'Test saving', 'Server needs', ...(lab.web ? ['Live'] : [])]

// ---- The code view: every file:line in evidence opens it (src/ui/codeview.js draws it, the code-view handler fills it) ----
const codePane = $('code-pane')
function openCode(req) {
  act(async () => {
    const ask = o => lab.invoke('code-view', { ...req, ...o }), v = await ask({})
    if (v.empty) { say(v.otherPackage ? 'This run is from another package; open it to see its files.' : `${req.path} isn’t available: it isn’t in the open package, and this run didn’t record it.`); return }
    codePane.replaceChildren(CodeView.create(v, { col: req.col, ask, close: () => { codePane.hidden = true; codePane.replaceChildren() } }))
    codePane.dataset.run = req.run ?? ''; codePane.hidden = false; say('')
  })
}
// Text with every file:line made a link that opens the code there.
const link = text => CodeView.parts(text).map(p => p.path ? h('button', { type: 'button', class: 'link', title: 'Show the code', onclick: () => openCode({ run: st.sel ?? undefined, path: p.path, line: p.line, col: p.col }) }, p.text) : p.text)

function findingsList(fs) {
  if (!fs?.length) return h('p', { class: 'muted' }, 'No findings.')
  return fs.map(f => h('div', { class: 'finding ' + f.sev }, h('h3', {}, h('span', { class: 'sev' }, f.sev === 'warn' ? 'warning' : f.sev), f.title),
    f.detail && h('p', {}, f.detail), f.evidence?.length && h('ul', {}, f.evidence.map(e => h('li', {}, link(e)))), f.fix && h('p', { class: 'fix' }, h('b', {}, 'Try: '), f.fix),
    h('p', { class: 'small' }, h('button', { type: 'button', class: 'link', title: 'Open what this finding means in the help panel', onclick: () => findingHelp(f.title) }, 'What this means'))))
}
function table(cols, rows) {
  const q = $('filter').value.trim().toLowerCase()
  const shown = q ? rows.filter(r => r.some(c => String(c ?? '').toLowerCase().includes(q))) : rows
  return [h('p', { class: 'muted small' }, `${shown.length} of ${rows.length}`),
    h('table', {}, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c)))),
      h('tbody', {}, shown.slice(0, 3000).map(r => h('tr', {}, r.map(c => c instanceof Node ? h('td', {}, c) : h('td', {}, c ?? '')))))) ]
}
const run = () => st.runs.find(r => r.id === st.sel)

// Save report… (P4.4): this run's report as HTML, redacted (no course content) if the box is ticked.
const saveReport = (run, redact) => act(async () => {
  const r = lab.web ? await lab.report({ run, redact }) : await lab.invoke('export-report', { run, redact })
  say(r.cancelled ? 'Report not saved.' : `Report saved${r.file ? ' as ' + r.file : ''}${redact ? ', redacted' : ''}.`)
}, 'Writing the report…')

const VIEWS = {
  Findings() {
    const r = run()
    if (!r) return [h('h3', { class: 'section' }, 'Package'), findingsList(st.pkg?.findings ?? [])]
    const redact = h('input', { type: 'checkbox', id: 'report-redact' })
    return [h('p', { class: 'muted small' }, `${r.label}. Saved to ${r.file || '(not saved)'}.`),
      r.milestones && h('p', { class: 'milestones' }, r.milestones.map(s => h('span', { class: s.reached ? 'ok' : 'bad', title: s.evidence }, `${s.reached ? '✓' : '✗'} ${s.label}`))),
      findingsList(r.findings),
      h('div', { class: 'row' }, h('label', { class: 'muted small' }, redact, ' Take the course content out'),
        h('button', { type: 'button', class: 'secondary', title: 'Save this run’s report as HTML. Redacted: no page text, console text, API values, suspend data, bodies or file contents; vocabulary, numbers and element names stay.', onclick: () => saveReport(r.id, redact.checked) }, 'Save report…'))]
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
      [['File', st.pkg.name], ['Files', `${a.files} (${(a.size / 1048576).toFixed(1)} MB)`], [a.format && a.format !== 'scorm' ? 'Course file' : 'Manifest', !m ? 'none' : a.format === 'cmi5' ? 'cmi5 (cmi5.xml)' : a.format === 'tincan' ? 'Tin Can (tincan.xml)' : `SCORM ${m.version}${m.edition ? ' ' + m.edition + ' edition' : ''} (schemaversion “${m.schemaversion}”)`],
        ['Scripts use', a.apiUse === 'none' ? 'no SCORM API names' : a.apiUse === 'both' ? 'both APIs' : 'SCORM ' + a.apiUse], ['Made with', a.fingerprints.join(', ') || 'not recognised'], ['Root', a.root || '(top of the ZIP)']]
        .map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v)))))]
    if (m) out.push(h('h3', { class: 'section' }, 'Items'), ...table(['Item', 'Type', 'Launch', 'Parameters', 'Mastery'], m.items.map(i => ['  '.repeat(i.depth) + (i.title || i.id), i.type, i.res?.path ?? i.res?.href ?? '', i.params, i.mastery])))
    const rows = []
    for (const [file, s] of Object.entries(a.scan)) for (const [k, list] of Object.entries(s)) for (const x of list) rows.push([file, h('button', { type: 'button', class: 'link', onclick: () => openCode({ path: file, line: x.line }) }, String(x.line)), k, h('code', {}, x.text)])
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
  // The LRS of a cmi5 or Tin Can run (P4.5): the statements with their validation, the documents (state, profiles) and the requests.
  xAPI() {
    const x = run()?.trace.lrs
    if (!x) return h('p', { class: 'muted' }, run() ? 'This run had no LRS: only cmi5 and Tin Can (xAPI) packages get one.' : 'Launch a cmi5 or Tin Can package to see its statements here.')
    const verb = e => (e.statement?.verb?.id ?? '').replace(/^.*[/#]/, '') || '(no verb)'
    const line = e => { const st = e.statement ?? {}, r = st.result ?? {}, o = st.object ?? {}, bits = [r.completion === true && 'completion', r.success === true ? 'success' : r.success === false && 'failure', typeof r.score?.scaled === 'number' && `scaled ${r.score.scaled}`, r.duration].filter(Boolean)
      return [verb(e), o.definition?.name ? Object.values(o.definition.name)[0] : o.id ?? '', ...bits].join(' · ') }
    const probs = e => (e.problems ?? []).length ? h('div', {}, e.problems.map(p => h('div', { class: p.sev === 'error' ? 'bad' : 'muted' }, `${p.sev} ${p.path || 'statement'}: ${p.text}`))) : ''
    const n = k => x.statements.filter(e => e.status === k).length
    return [h('p', { class: 'muted small' }, `${x.format === 'cmi5' ? 'cmi5' : 'Tin Can'} · ${x.statements.length} statements (${n('stored')} stored, ${n('rejected')} rejected) · ${x.calls.length} requests to the LRS${x.format === 'cmi5' ? ` · the auth token was fetched ${x.fetches.length} time${x.fetches.length === 1 ? '' : 's'}` : ''} · endpoint ${x.endpoint}`),
      h('h3', { class: 'section' }, 'Statements'),
      ...table(['#', 's', 'From', 'Status', 'Statement', 'Validation'], x.statements.map(e => [e.n, secs(e.t ?? 0), e.by === 'lms' ? 'the LMS' : 'the content',
        h('span', { class: e.status === 'rejected' ? 'bad' : 'ok' }, e.status), h('details', {}, h('summary', {}, line(e)), h('pre', { class: 'code' }, JSON.stringify(e.statement, null, 2))), probs(e)])),
      h('h3', { class: 'section' }, 'Documents (state, activity profile, agent profile)'),
      ...table(['Kind', 'Id', 'Type', 'Written by', 'Writes', 'Content'], x.documents.map(d => [d.kind, d.id, d.contentType, d.by === 'lms' ? 'the LMS' : 'the content', d.writes, h('code', {}, String(d.value).slice(0, 600))])),
      h('h3', { class: 'section' }, 'Requests to the LRS'),
      ...table(['s', 'Method', 'Resource', 'Status', 'Authorization', 'Version header', 'Problems'], x.calls.map(c => [secs(c.t ?? 0), c.method, c.resource, h('span', { class: c.status >= 400 ? 'bad' : '' }, String(c.status)), c.auth, c.version, (c.problems ?? []).map(p => p.text).join(' ')]))]
  },
  Lookups() {
    const list = (run() ? run().trace.probe : st.live).filter(p => p.type !== 'api')
    return [h('h3', { class: 'section' }, 'Pins'), pinsEditor(), ...table(['s', 'Kind', 'Name', 'Result', 'Frame', 'Where'], list.map(p => [secs(p.t ?? 0), p.type, p.name ?? p.path ?? '',
      p.type === 'pin-read' ? `pinned value read${p.n > 1 ? ` ×${p.n}` : ''}` : p.type === 'pin-write' ? h('span', { class: 'bad' }, `tried to set it to ${p.value}`) : p.type === 'pin-failed' ? h('span', { class: 'bad' }, `couldn’t pin: ${p.error}`) :
      p.type === 'lookup' ? h('span', { class: p.found ? 'ok' : 'bad' }, (p.found ? 'found' : 'missing') + (p.n > 1 ? ` ×${p.n}` : '')) : p.type === 'frame' ? `depth ${p.depth}${p.topReachable ? '' : ', top unreachable'}${p.opener ? ', has opener' : ''}` : p.type === 'assign' ? `${p.kind} {${(p.keys || []).join(', ')}}` : p.type === 'shape' ? `${p.use} from ${host(p.url)}` : p.error ?? '',
      short(p.frame), h('code', {}, (p.stack || []).slice(0, 3).join('\n'))]))]
  },
  Network() {
    const r = run(); if (!r) return h('p', { class: 'muted' }, 'Choose a run.')
    // Any failed request, or one for the server's root or another site, can be answered with a response of your own.
    const answerable = q => !/^lab:\/\/(?:run|content)\/(pkg|__lab)\//.test(q.url) && !/^(data|blob):/.test(q.url) || q.failed && !q.canceled || q.status >= 400
    return [answerForm(), ...table(['s', 'Method', 'URL', 'Type', 'Status', 'From', ''], r.trace.requests.map(q => [secs(q.t), q.method, short(q.url), q.type,
      q.answered ? h('span', { class: 'ok' }, `answered ${q.status ?? ''}`) : q.failed || q.status >= 400 ? h('span', { class: 'bad' }, String(q.status ?? q.failed) + (q.failed && q.status ? ' ' + q.failed : '')) : q.status ?? '…', h('code', {}, (q.from || []).slice(0, 3).map(at).join('\n')),
      answerable(q) ? h('button', { type: 'button', class: 'secondary', onclick: () => { st.answer = answerDraft(q); render() } }, 'Answer this request…') : '']))]
  },
  Scripts() {
    const r = run(); if (!r) return h('p', { class: 'muted' }, 'Choose a run.')
    return table(['s', 'Script', 'Size', 'Loaded by', ''], r.trace.scripts.map(s => [secs(s.t), short(s.url) || '(eval)', s.length, h('code', {}, (s.from || []).slice(0, 4).map(at).join('\n')),
      /^lab:\/\/(?:run|content)\/pkg\//.test(s.url ?? '') ? h('button', { type: 'button', class: 'secondary', onclick: () => openCode({ run: r.id, path: decodeURIComponent(short(s.url)), line: 1 }) }, 'Code') : '']))
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

// ---- Pins and answers: values forced before the content's code runs, and responses given instead of the network ----
// Both live in the session (st.pins, st.responses) and go with every launch; "Run with these" launches now.
const afterChange = () => { render(); showOptions(); showPinBox() }
const runWithThese = () => $('launch').click()
function pinsEditor() {
  const d = st.pinDraft, field = (key, props = {}) => h('input', { type: 'text', value: d[key], spellcheck: 'false', oninput: e => { d[key] = e.target.value }, ...props })
  const add = () => {
    let value
    try { value = JSON.parse(d.value) } catch { return say('The value must be JSON: false, 3, "text", {"a":1}. Text needs quotes.') }
    if (!d.path.trim()) return say('Give the name to pin, like previewMode or config.mode.')
    st.pins.push({ path: d.path.trim(), value, frames: d.frames }); st.pinDraft = { path: '', value: '', frames: d.frames }; afterChange()
  }
  return [st.pins.length ? h('ul', { class: 'overrides' }, st.pins.map((p, i) => h('li', {}, h('code', {}, `${p.path} = ${JSON.stringify(p.value)}`), ` ${p.frames === 'all' ? 'in every frame ' : ''}`,
      h('button', { type: 'button', class: 'secondary', onclick: () => { st.pinDraft = { path: p.path, value: JSON.stringify(p.value), frames: p.frames }; st.pins.splice(i, 1); afterChange() } }, 'Edit'),
      h('button', { type: 'button', class: 'secondary', onclick: () => { st.pins.splice(i, 1); afterChange() } }, 'Remove')))) : h('p', { class: 'muted small' }, 'No pins. A pin makes the content read the value you give, whatever it sets itself.'),
    h('div', { class: 'row pins-form' }, h('label', {}, 'Name ', field('path', { placeholder: 'previewMode or config.mode', 'aria-label': 'Name to pin' })), h('label', {}, 'Value (JSON) ', field('value', { placeholder: 'false', 'aria-label': 'Value as JSON' })),
      h('label', {}, 'In ', h('select', { onchange: e => { d.frames = e.target.value } }, h('option', { value: 'content', selected: d.frames === 'content' }, 'the content’s frames'), h('option', { value: 'all', selected: d.frames === 'all' }, 'every frame'))),
      h('button', { type: 'button', onclick: add }, 'Add pin'), h('button', { type: 'button', class: 'secondary', disabled: !!st.running || !st.pkg?.items.length, onclick: runWithThese }, 'Run with these'))]
}
const looksJson = u => /\.json(\?|$)|\/api\/|\/rest\/|graphql/i.test(u)
const autoType = body => /^\s*[{[]/.test(body) ? 'application/json' : 'text/plain; charset=utf-8'
// The form's starting values for a request: its path (for the server's root) or address (another site), and {} if it looks like JSON.
function answerDraft(q) {
  let match = q.url
  try { const u = new URL(q.url); match = u.protocol === 'lab:' ? u.pathname : u.origin + u.pathname } catch { /* leave it whole */ }
  const json = looksJson(q.url)
  return { index: -1, match, method: q.method && q.method !== 'GET' ? q.method : '', status: 200, type: json ? 'application/json' : '', body: json ? '{}' : '' }
}
function answerForm() {
  const a = st.answer
  if (!a) return null
  const field = (key, props = {}) => h('input', { type: 'text', value: a[key], spellcheck: 'false', oninput: e => { a[key] = e.target.value }, ...props })
  const save = andRun => {
    const status = +a.status
    if (!a.match.trim()) return say('Say which requests to answer: a path like /api/config, a glob like *.json, or a /regex/.')
    if (!Number.isInteger(status) || status < 100 || status > 599) return say('The status must be a whole number from 100 to 599, like 200.')
    const r = { match: a.match.trim(), ...(a.method.trim() ? { method: a.method.trim().toUpperCase() } : {}), status, headers: a.type.trim() && a.type.trim() !== autoType(a.body) ? { 'Content-Type': a.type.trim() } : {}, body: a.body }
    if (a.index >= 0) st.responses[a.index] = r; else st.responses.push(r)
    st.answer = null; afterChange(); say('Answer added. It applies to the next launch.')
    if (andRun) runWithThese()
  }
  return h('div', { class: 'answer-form' }, h('h3', { class: 'section' }, 'Answer this request'),
    h('p', { class: 'muted small' }, 'The content gets this instead of what the server would send. It applies to every request that matches, from the next launch.'),
    h('div', { class: 'row pins-form' }, h('label', {}, 'Match ', field('match', { 'aria-label': 'Which requests to answer' })), h('label', {}, 'Method ', field('method', { placeholder: 'any', size: '6', 'aria-label': 'Method' })),
      h('label', {}, 'Status ', field('status', { size: '4', 'aria-label': 'Status' })), h('label', {}, 'Content type ', field('type', { placeholder: 'automatic', 'aria-label': 'Content type' }))),
    h('textarea', { class: 'answer', spellcheck: 'false', 'aria-label': 'Body', oninput: e => { a.body = e.target.value } }, a.body),
    h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => save(false) }, a.index >= 0 ? 'Save answer' : 'Add answer'),
      h('button', { type: 'button', disabled: !!st.running || !st.pkg?.items.length, onclick: () => save(true) }, 'Add and run with these'), h('button', { type: 'button', class: 'secondary', onclick: () => { st.answer = null; render() } }, 'Cancel')))
}
function answersList() {
  return st.responses.length ? h('ul', { class: 'overrides' }, st.responses.map((r, i) => h('li', {}, h('code', {}, `${r.method ? r.method + ' ' : ''}${r.match} → ${r.status}`), ` ${r.body.length} characters `,
    h('button', { type: 'button', class: 'secondary', onclick: () => { st.answer = { index: i, match: r.match, method: r.method ?? '', status: r.status, type: r.headers['Content-Type'] ?? '', body: r.body }; st.tab = 'Network'; render() } }, 'Edit'),
    h('button', { type: 'button', class: 'secondary', onclick: () => { st.responses.splice(i, 1); afterChange() } }, 'Remove'))))
    : h('p', { class: 'muted small' }, 'None. In a run’s Network tab, choose “Answer this request…” on a request.')
}
// The More options boxes. Drawn when pins or answers change, not on every redraw, so typing isn't interrupted.
function showPinBox() { $('pins').replaceChildren(...pinsEditor()); $('answers').replaceChildren(answersList()) }

// ---- Files: look at any file of the package, change it for the next run (an override), and see what changed ----
st.files = { list: null, open: null, draft: '', diffs: {}, note: '' }
const overrides = () => st.pkg?.overrides ?? []
const setOverrides = list => { if (st.pkg) st.pkg.overrides = list; st.files.list = null; render(); showOptions() }
const openFile = path => act(async () => {
  const f = await lab.invoke('file', { path }); st.files.open = f; st.files.draft = f.content ?? ''; st.files.note = ''; render()
})
const saveOverride = body => act(async () => {
  const f = st.files.open
  st.files.diffs = {}
  setOverrides(await lab.invoke('override-set', { path: f.path, ...body }))
  await openFile(f.path); st.files.note = 'Saved as an override. The next launch uses it.'; render()
})
const revert = path => act(async () => {
  setOverrides(await lab.invoke('override-revert', path === undefined ? {} : { path })); if (path === undefined) st.files.diffs = {}; else delete st.files.diffs[path]
  if (st.files.open && (path === undefined || path === st.files.open.path)) await openFile(st.files.open.path)
})
const readBase64 = file => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] ?? ''); r.onerror = () => reject(new Error('Couldn’t read that file.')); r.readAsDataURL(file) })
const pick = h('input', { type: 'file', hidden: true })
pick.onchange = () => { const f = pick.files[0]; pick.value = ''; if (f) readBase64(f).then(b => saveOverride({ base64: b })).catch(e => say(e.message)) }
function editor() {
  const f = st.files.open
  if (!f) return h('p', { class: 'muted' }, 'Click a file to see it.')
  const out = [h('h3', { class: 'section' }, f.path), h('p', { class: 'muted small' }, `${f.size} bytes${f.overridden ? ' · changed for the next run' : ''}`)]
  if (f.text && !f.tooBig) {
    const gutter = h('pre', { class: 'gutter', 'aria-hidden': 'true' }), area = h('textarea', { class: 'code', spellcheck: 'false', wrap: 'off', 'aria-label': `Contents of ${f.path}` })
    area.value = st.files.draft
    const numbers = () => { gutter.textContent = Array.from({ length: area.value.split('\n').length }, (_, i) => i + 1).join('\n') }
    area.oninput = () => { st.files.draft = area.value; numbers() }
    area.onscroll = () => { gutter.scrollTop = area.scrollTop }
    numbers()
    out.push(h('div', { class: 'editor' }, gutter, area),
      h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => saveOverride({ content: f.crlf ? area.value.replace(/\r?\n/g, '\r\n') : area.value }) }, 'Save as override'),
        h('button', { type: 'button', class: 'secondary', disabled: !f.overridden, onclick: () => revert(f.path) }, 'Revert'),
        h('button', { type: 'button', class: 'secondary', onclick: () => pick.click() }, 'Replace from a file…'),
        /\.(?:m?js|cjs|html?|css)$/i.test(f.path) && h('button', { type: 'button', class: 'secondary', title: 'Read it formatted, with the coverage of the chosen run', onclick: () => openCode({ run: st.sel ?? undefined, path: f.path, line: 1 }) }, 'View code')))
  } else out.push(h('p', { class: 'muted' }, f.tooBig ? 'This file is too large to edit here. You can replace it with a file.' : 'This is not a text file, so it can’t be edited here. You can replace it with a file.'),
    h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => pick.click() }, 'Replace from a file…'), h('button', { type: 'button', class: 'secondary', disabled: !f.overridden, onclick: () => revert(f.path) }, 'Revert')))
  if (st.files.note) out.push(h('p', { class: 'muted small' }, st.files.note))
  return out
}
function diffBlock(path) {
  const d = st.files.diffs[path]
  if (!d) return null
  if (d.binary) return h('p', { class: 'muted small' }, `Replaced file: ${d.before ?? 'new'} → ${d.after} bytes. Binary files have no line diff.`)
  return h('pre', { class: 'diff' }, d.diff.split('\n').map(l => h('div', { class: l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : l[0] === '@' ? 'hunk' : null }, l || ' ')))
}
VIEWS.Files = () => {
  if (!st.pkg) return h('p', { class: 'muted' }, 'Open a package.')
  const x = st.files
  if (!x.list) { x.list = []; lab.invoke('files').then(l => { x.list = l; render() }) }
  const q = $('filter').value.trim().toLowerCase(), shown = x.list.filter(f => !q || f.path.toLowerCase().includes(q)), tree = []
  let dirs = []
  for (const f of shown) {
    const parts = f.path.split('/'), dir = parts.slice(0, -1)
    if (!q) { let i = 0; while (i < dir.length && dirs[i] === dir[i]) i++; for (; i < dir.length; i++) tree.push(h('li', { class: 'dir' }, '  '.repeat(i) + dir[i] + '/')); dirs = dir }
    tree.push(h('li', { class: f.path === x.open?.path ? 'sel' : null }, h('button', { type: 'button', class: 'link', onclick: () => openFile(f.path) }, (q ? '' : '  '.repeat(dir.length)) + (q ? f.path : parts.at(-1))),
      f.overridden && h('span', { class: 'tag' }, 'changed'), !f.text && h('span', { class: 'muted small' }, ' binary')))
  }
  const list = overrides()
  return [h('div', { class: 'files' },
    h('ol', { class: 'tree' }, tree.length ? tree : h('li', { class: 'muted' }, x.list.length ? 'No file matches the filter.' : 'Loading…')),
    h('div', { class: 'file' }, editor())),
    h('h3', { class: 'section' }, 'Changed files'),
    list.length ? [h('p', { class: 'muted small' }, 'The next launch uses these, and the package on disk stays as it is.'),
      h('ul', { class: 'overrides' }, list.map(o => h('li', {}, h('b', {}, o.path), ` ${o.binary ? 'replaced file' : 'changed text'}, ${o.size} bytes${o.added ? ', not in the package' : ''} `,
        !o.binary && h('button', { type: 'button', class: 'secondary', onclick: () => act(async () => { if (x.diffs[o.path]) delete x.diffs[o.path]; else x.diffs[o.path] = await lab.invoke('override-diff', { path: o.path }); render() }) }, x.diffs[o.path] ? 'Hide changes' : 'Show changes'),
        o.binary && h('button', { type: 'button', class: 'secondary', onclick: () => act(async () => { x.diffs[o.path] = await lab.invoke('override-diff', { path: o.path }); render() }) }, 'Size'),
        h('button', { type: 'button', class: 'secondary', onclick: () => revert(o.path) }, 'Revert'), diffBlock(o.path)))),
      h('button', { type: 'button', class: 'secondary', onclick: () => revert() }, 'Revert all')] : h('p', { class: 'muted' }, 'None. Click a file, change it and choose Save as override, then Launch.'), pick]
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
    runRows(rows, x.busy), findingsList(x.findings)]
}
// The table of an experiment's (or a discovery's) runs; a click on a row opens that run.
function runRows(rows, busy, first = 'Variant', against = 'the default') {
  if (!rows.length) return null
  return h('table', {}, h('thead', {}, h('tr', {}, [first, 'Furthest', 'API calls', 'Errors', 'Verdict', `Against ${against}`].map(c => h('th', {}, c)))),
    h('tbody', {}, rows.map(r => h('tr', { class: r.runId ? 'click' : null, title: r.runId ? 'Open this run' : null, onclick: r.runId ? () => { st.sel = r.runId; st.tab = 'Findings'; render() } : null },
      r.pending || r.failed ? [h('td', {}, r.name), h('td', { colspan: 5, class: r.failed ? 'bad' : 'muted' }, r.failed ? r.progress : busy ? 'waiting…' : 'not run')]
        : [r.name, r.furthestLabel, r.apiCalls, r.errors, h('span', { class: r.verdict.sev === 'ok' ? 'ok' : 'bad' }, r.verdict.sev === 'ok' ? 'OK' : r.verdict.title), h('span', { class: r.better > 0 ? 'ok' : r.better < 0 ? 'bad' : null }, r.progress)].map(c => h('td', {}, c))))))
}

// ---- Test saving: leave like a learner, resume, check (src/cycle.js); the two runs side by side ----
VIEWS['Test saving'] = () => {
  const x = st.cyc, off = x.busy || !!st.running || !st.pkg?.items.length
  const open = id => id && st.runs.some(q => q.id === id) ? h('button', { type: 'button', class: 'link', onclick: () => { st.sel = id; st.tab = 'API'; render() } }, 'open run') : ''
  return [h('p', { class: 'muted small' }, 'Runs the item with the settings above and plays the macro (More options). Then it leaves the way a learner closing the window does, and runs the item again with the data that was saved, to see whether the content saved its place and went back to it. Each run lasts as long as “Stop after” (10 s if that is “I stop it”). Chromium only.'),
    h('div', { class: 'row' }, h('button', { type: 'button', disabled: off, onclick: startCycle }, 'Test saving'),
      h('button', { type: 'button', class: 'secondary', disabled: !x.busy, onclick: () => act(() => lab.invoke('cycle-stop')) }, 'Stop'),
      h('span', { class: 'muted small' }, `${x.note} Macro: ${st.macro.events.length ? st.macro.events.length + ' events' : 'none (nothing will be clicked)'}.`)),
    x.rows.length ? h('table', {}, h('thead', {}, h('tr', {}, ['', 'Run 1: leaves', 'Run 2: resumes'].map(c => h('th', {}, c)))),
      h('tbody', {}, x.rows.map(r => h('tr', {}, h('th', {}, r.label), h('td', {}, r.a), h('td', {}, r.b))), h('tr', {}, h('td', {}), h('td', {}, open(x.runs[0])), h('td', {}, open(x.runs[1]))))) : null,
    x.findings.length ? [h('h3', { class: 'section' }, 'Findings'), findingsList(x.findings)] : null]
}
function startCycle() {
  const x = st.cyc
  act(async () => {
    Object.assign(x, { busy: true, note: 'Starting…', rows: [], findings: [], runs: [] }); st.tab = 'Test saving'; render()
    try { await lab.invoke('cycle-start', { item: +$('item').value, ...launchOptions(), macroSize: macroSize(), wait: +$('auto').value || 10 }) } catch (e) { x.busy = false; x.note = ''; throw e }
  })
}

// ---- Server needs: what the content wants from its server, found by answering its requests and watching what it reads ----
st.disc = { rounds: 5, rows: [], result: null, busy: false, note: '' }
const host = u => (u || '').replace(/^lab:\/\/(?:run|content)(?=\/)/, '')
// fetch and XHR requests to the server's root or another site, one per pattern (as src/shape.js serverRequests).
const serverReqs = r => { const seen = new Set(); return (r?.trace.requests ?? []).filter(q => /^(XHR|Fetch)$/.test(q.type) && (/^lab:\/\/(?:run|content)\/(?!pkg\/|__lab\/)/.test(q.url) || /^https?:/.test(q.url)) && !seen.has(answerDraft(q).match) && seen.add(answerDraft(q).match)) }
const saveResponse = resp => { const i = st.responses.findIndex(x => x.match === resp.match); if (i >= 0) st.responses[i] = resp; else st.responses.push(resp); afterChange(); say(`Added an answer for ${resp.match}. It applies to the next launch (see More options).`) }
VIEWS['Server needs'] = () => {
  const x = st.disc, r = run(), reqs = serverReqs(r), off = x.busy || !!st.running || !st.pkg?.items.length
  const start = request => act(async () => {
    x.rows = []; x.result = null; x.busy = true; x.note = ''; render()
    try { await lab.invoke('discover-start', { item: +$('item').value, ...(request ? { request } : {}), rounds: x.rounds, ...launchOptions(), wait: +$('auto').value || 10 }) } catch (e) { x.busy = false; throw e }
  })
  const out = [h('p', { class: 'muted small' }, 'Discover answers the content’s requests to its server and watches what it reads from the answer, round after round, until it reads nothing new. Each round is a run of the item with the settings above, as long as “Stop after” (10 s if that is “I stop it”). The answer is a stand-in that is always there: if (setting) is always true, so the content may go further than with a real answer.'),
    h('div', { class: 'row' }, h('label', {}, 'Rounds ', h('select', { onchange: e => { x.rounds = +e.target.value } }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => h('option', { value: n, selected: n === x.rounds }, n)))),
      h('button', { type: 'button', disabled: off, onclick: () => start() }, 'Discover all server requests'),
      h('button', { type: 'button', class: 'secondary', disabled: !x.busy, onclick: () => act(() => lab.invoke('discover-stop')) }, 'Stop'), h('span', { class: 'muted small' }, x.note)),
    h('h3', { class: 'section' }, r ? `Server requests in ${r.label}` : 'Server requests'),
    !r ? h('p', { class: 'muted' }, 'Choose a run to list the requests it made to a server, or discover them all.') : !reqs.length ? h('p', { class: 'muted' }, 'This run made no fetch or XHR requests to a server.')
      : table(['Method', 'URL', 'From', ''], reqs.map(q => [q.method, host(q.url), h('code', {}, (q.from || []).slice(0, 3).map(at).join('\n')), h('button', { type: 'button', disabled: off, onclick: () => start(answerDraft(q).match) }, 'Discover')])),
    x.rows.length ? [h('h3', { class: 'section' }, 'Rounds'), runRows(x.rows, x.busy, 'Run', 'no answer')] : null]
  for (const q of x.result?.requests ?? []) out.push(h('h3', { class: 'section' }, `${q.method} ${host(q.url)}`), h('p', { class: 'muted small' }, q.from ? `Requested from ${q.from}.` : ''),
    q.fields.length ? [...table(['Field', 'Type', 'How it was used', 'Where'], q.fields.map(f => [h('code', {}, f.path), f.type, f.how, f.at.join(', ')])),
      h('pre', {}, JSON.stringify(q.skeleton, null, 2)), h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => saveResponse(q.response) }, 'Save as response'))]
      : h('p', { class: 'muted' }, 'Nothing was read from the response.'))
  if (x.result) out.push(h('h3', { class: 'section' }, 'Findings'), findingsList(x.result.findings))
  return out
}

// ---- Execution: the last events of a traced run, and the code of the one clicked ----
const showCode = (r, e) => openCode({ run: r.id, path: e.file, line: e.line, col: e.col })
VIEWS.Execution = () => {
  const r = run(); if (!r) return h('p', { class: 'muted' }, 'Choose a run.')
  const tail = r.trace.execTail
  if (!tail) return h('p', { class: 'muted' }, 'This run wasn’t traced. Tick “Trace the code” under More options and launch again to record which functions ran and which way each decision went.')
  return [h('p', { class: 'muted small' }, `The last ${tail.length} of ${r.trace.execEvents} events before the run went quiet, newest last. Code opens the line.`),
    ...table(['s', 'Where', 'What happened', ''], tail.map(e => [secs(e.t), e.file ? `${e.file}:${e.line}` : '', e.say, e.file ? h('button', { type: 'button', class: 'secondary', onclick: () => showCode(r, e) }, 'Code') : '']))]
}

// ---- Drill-down: why the selected run stopped, as a numbered chain (src/drilldown.js) ----
st.drill = { run: null, busy: false, note: '', result: null }
VIEWS['Drill-down'] = () => {
  const r = run(), x = st.drill
  if (!r) return h('p', { class: 'muted' }, 'Choose a run.')
  if (r.kind !== 'package') return h('p', { class: 'muted' }, 'Drill-down works on runs of a package.')
  const mine = x.run === r.id, res = mine ? x.result : null
  const out = [h('p', { class: 'muted small' }, `Follows the decisions that led to where ${r.label} stopped, back to where each value came from. It ${r.trace.execTail ? '' : 'runs the item again with tracing, then '}may run it once more, watching the values it needs to explain (each as long as “Stop after”, 10 s if that is “I stop it”).`),
    h('div', { class: 'row' }, h('button', { type: 'button', disabled: x.busy || !!st.running, onclick: () => act(async () => {
      Object.assign(st.drill, { run: r.id, busy: true, note: 'Starting…', result: null }); render()
      try { await lab.invoke('drill-start', { run: r.id }) } catch (e) { x.busy = false; x.note = ''; throw e }
    }) }, res ? 'Drill down again' : 'Drill down'),
    h('button', { type: 'button', class: 'secondary', disabled: !x.busy, onclick: () => act(() => lab.invoke('drill-stop')) }, 'Stop'),
    h('span', { class: 'muted small' }, mine ? x.note : ''))]
  if (!res) return out
  const open = id => id && st.runs.some(q => q.id === id) ? h('button', { type: 'button', class: 'link', onclick: () => { st.sel = id; st.tab = 'Execution'; render() } }, 'open') : null
  out.push(h('h3', { class: 'section' }, 'Why it stopped'),
    res.chain.length ? h('ol', { class: 'chain' }, res.chain.map(s => h('li', {}, link(s.text)))) : h('p', { class: 'muted' }, 'No chain.'),
    h('p', { class: 'muted small' }, 'Traced run: ', open(res.traceRun) ?? 'this one', res.watchRun ? [' · watch run (', res.watch.join(', '), '): ', open(res.watchRun)] : ''),
    findingsList(res.findings))
  const others = res.decisions.filter(d => !res.chain.some(s => s.at === d.at && s.decision === d.code))
  if (others.length) out.push(h('h3', { class: 'section' }, 'Other decisions whose other branch never ran'),
    ...table(['Where', 'Decision', 'Values', 'Would have run'], others.map(d => [link(d.at), `${d.code} → ${d.said}`, d.operands.map(o => `${o.code} = ${o.value}`).join(', '), h('code', {}, d.untaken.lines.join('\n'))])))
  return out
}

// ---- Live view (web interface only): the running content, with clicks and keys sent back to it ----
const KEYS = { Enter: 'Enter', Tab: 'Tab', Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete', ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', PageUp: 'PageUp', PageDown: 'PageDown', Home: 'Home', End: 'End' }
// Record clicks (macros, P2.4): what is sent through the picture is kept, with its time into the run, until Save macro.
const recordBtn = h('button', { type: 'button', class: 'secondary', onclick: () => act(async () => recording(await lab.invoke('macro-record', { on: !st.recording }))) }, 'Record clicks')
const liveMacro = h('span', { class: 'muted small' })
const recording = on => { st.recording = on; recordBtn.textContent = on ? 'Stop recording (not saved)' : 'Record clicks'; liveMacro.textContent = on ? 'Recording: use the picture, then Save macro.' : '' }
const liveInput = e => lab.invoke('live-input', e).catch(() => {})
const liveImg = h('img', { class: 'live-frame', alt: 'The running content', tabindex: '0' })
const liveInfo = h('p', { class: 'muted small' }, 'Waiting for the first frame…')
const liveText = h('input', { type: 'text', placeholder: 'Text to type into the course', spellcheck: 'false', 'aria-label': 'Text to type into the course' })
const livePanel = h('div', { class: 'live' },
  h('p', { class: 'muted small' }, 'The course is running on the Mac. Click the picture to click the course; with the picture focused, keys go to the course too.'),
  liveImg, liveInfo,
  h('div', { class: 'row' }, liveText, h('button', { type: 'button', onclick: () => { if (liveText.value) { liveInput({ type: 'text', text: liveText.value }); liveText.value = '' } } }, 'Type'),
    ...['Enter', 'Tab', 'Escape', 'Backspace', 'Space', 'Up', 'Down', 'Left', 'Right'].map(k => h('button', { type: 'button', class: 'secondary', onclick: () => liveInput({ type: 'key', key: k }) }, k))),
  h('div', { class: 'row' }, recordBtn, h('button', { type: 'button', class: 'secondary', onclick: () => act(async () => { st.macro = await lab.invoke('macro-save'); recording(false); showMacro(); showOptions(); say(`Macro saved: ${st.macro.events.length} events. It plays at the start of each launch.`) }) }, 'Save macro'), liveMacro))
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
// ---- Timeline (P4.2): one run's events on a time axis. The lanes come from the timeline handler (src/timeline.js), for the window the
// sliders ask for; a click on an item opens its tab (not its row). The SVG is built with createElementNS, text as text nodes. ----
const TL_NS = 'http://www.w3.org/2000/svg', TL_W = 1000, TL_LABEL = 150, TL_ROW = 26, TL_LABEL_GAP = 110
const tlShort = s => String(s ?? '').length > 22 ? String(s).slice(0, 21) + '…' : String(s ?? '')
const svgEl = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(TL_NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); e.append(...kids); return e }
function timelineBody(d) {
  const P = TL_W - TL_LABEL - 10, H = 24 + d.lanes.length * TL_ROW + 4, X = x => TL_LABEL + x * P
  const svg = svgEl('svg', { class: 'tl-svg', viewBox: `0 0 ${TL_W} ${H}`, role: 'img', 'aria-label': 'Timeline of the run' })
  svg.addEventListener('click', e => { const t = e.target.closest?.('[data-tab]'); if (t) { st.tab = t.dataset.tab; render() } })
  for (const k of d.ticks) svg.append(svgEl('line', { class: 'tl-grid', x1: X(k.x), x2: X(k.x), y1: 20, y2: H - 2 }), svgEl('text', { class: 'tl-tick', x: X(k.x), y: 12, 'text-anchor': 'middle' }, k.label))
  d.lanes.forEach((L, i) => {
    const y0 = 24 + i * TL_ROW, mid = y0 + TL_ROW / 2
    svg.append(svgEl('line', { class: 'tl-sep', x1: 0, x2: TL_W, y1: y0, y2: y0 }), svgEl('text', { class: 'tl-lane', x: 6, y: mid + 4 }, L.label))
    for (const it of L.items) {
      const tab = { 'data-tab': L.tab }, tip = svgEl('title', {}, it.title)
      if (L.id === 'density') { if (!it.n) continue; const hh = (TL_ROW - 6) * it.n / L.max; svg.append(svgEl('rect', { class: 'tl-density', x: X(it.x), y: y0 + TL_ROW - 3 - hh, width: Math.max(1, it.w * P), height: hh, ...tab }, tip)); continue }
      if (L.id === 'requests') { svg.append(svgEl('rect', { class: `tl-bar tl-${it.failed ? 'bad' : 'other'}`, x: X(it.x), y: mid - 4, width: Math.max(2, (it.x2 - it.x) * P), height: 8, ...tab }, tip)); continue }
      const cls = L.id === 'api' ? it.kind : L.id === 'errors' ? 'bad' : L.id === 'milestones' ? 'ms' : L.id === 'dom' ? 'dom' : 'script'
      svg.append(svgEl('circle', { class: `tl-dot tl-${cls}`, cx: X(it.x), cy: mid, r: 4, ...tab }, tip))
    }
    // Milestone labels, left to right; one is left out when it would run into the one before it.
    if (L.id === 'milestones') { let last = -Infinity; for (const it of [...L.items].sort((a, b) => a.x - b.x)) if (X(it.x) - last >= TL_LABEL_GAP) { svg.append(svgEl('text', { class: 'tl-mlabel', x: X(it.x) + 6, y: mid + 4 }, tlShort(it.label))); last = X(it.x) } }
  })
  return [h('p', { class: 'muted' }, `Showing ${secs(d.range.from)} s to ${secs(d.range.to)} s of ${secs(d.range.duration)} s.`), svg]
}
// Asks the handler for a window (none: the whole run) and redraws only the SVG, so a slider keeps its place while it is dragged.
function loadTimeline(win) {
  const tl = st.tl, seq = ++tl.seq
  lab.invoke('timeline', { run: tl.run, ...win }).then(d => {
    if (seq !== tl.seq || st.tl !== tl) return
    tl.data = d; tl.error = null
    const holder = document.querySelector('#view .tl-holder')
    if (holder) holder.replaceChildren(...timelineBody(d)); else render()
  }).catch(e => { if (seq !== tl.seq || st.tl !== tl) return; tl.error = e.message || String(e); render() })
}
VIEWS.Timeline = () => {
  const r = run(); if (!r) return h('p', { class: 'muted' }, 'Choose a run.')
  // The key changes when the run does (more events, a longer run), so the timeline is worked out again.
  const key = `${r.id}:${r.trace.duration}:${r.trace.probe.length}:${r.trace.requests.length}`
  if (!st.tl || st.tl.key !== key) { st.tl = { key, run: r.id, zoom: 1, pan: 0, data: null, error: null, seq: 0 }; loadTimeline({}) }
  const tl = st.tl
  if (tl.error) return [h('p', { class: 'bad' }, `The timeline couldn’t be worked out: ${tl.error}`), h('button', { type: 'button', class: 'secondary', onclick: () => { st.tl = null; render() } }, 'Try again')]
  const d = tl.data
  if (!d) return h('p', { class: 'muted' }, 'Working out the timeline…')
  const dur = d.range.duration, winOf = () => { const span = dur / tl.zoom, from = (dur - span) * tl.pan; return { from, to: from + span } }
  const zoom = h('input', { type: 'range', min: 1, max: 20, step: 0.1, value: tl.zoom, oninput: e => { tl.zoom = +e.target.value; panEl.disabled = tl.zoom <= 1; loadTimeline(tl.zoom > 1 ? winOf() : {}) } })
  const panEl = h('input', { type: 'range', min: 0, max: 1000, value: Math.round(tl.pan * 1000), disabled: tl.zoom <= 1 ? true : null, oninput: e => { tl.pan = e.target.value / 1000; loadTimeline(winOf()) } })
  return [h('div', { class: 'tl-controls' },
    h('label', {}, 'Zoom ', zoom),
    h('label', {}, 'Start ', panEl)),
    h('p', { class: 'muted' }, 'Hover an item for details. Click it to open the tab it came from (the tab, not the row).'),
    h('div', { class: 'tl-holder' }, ...timelineBody(d)),
    d.missing.length ? h('p', { class: 'muted' }, `Not reached: ${d.missing.join(', ')}.`) : null]
}
VIEWS.Live = () => st.running ? livePanel : h('p', { class: 'muted' }, 'Launch an item to see it here. It runs on the Mac; this view lets you watch and use it from here.')

// Tabs with nothing to show are left out of the tab bar (never the chosen one, and never the ones the user starts things from:
// Lookups holds the pins, and Experiments, Test saving, Server needs, Drill-down, Folder check and Live are not listed here).
const HIDE = {
  Package: () => !st.pkg, Files: () => !st.pkg,
  xAPI: () => !run()?.trace.lrs && !(st.pkg?.analysis.format && st.pkg.analysis.format !== 'scorm'),
  Network: () => !run()?.trace.requests.length, Scripts: () => !run()?.trace.scripts.length, Console: () => !run()?.trace.console.length,
  Errors: () => { const t = run()?.trace; return !t || !(t.exceptions.length || t.caught.length || t.log.some(l => l.level === 'error' || l.level === 'warning')) },
  Frames: () => { const t = run()?.trace; return !t || !(t.navigations.length || t.targets.length) },
  Execution: () => !run()?.trace.execTail, Timeline: () => !run(), Compare: () => !st.cmp, 'Package diff': () => !st.pdiff,
}

// ---- Start screen: shown until a package (or a run) is open ----
const RECIPES = [['The page is blank', 'Launch, then read Findings, Boot path and Errors.', 'shows-a-blank-page'],
  ['The content never talks to the LMS', 'Launch, then look at Lookups and API.', 'no-api-calls'],
  ['It doesn’t save or resume', 'Test saving (set up a macro first).', 'doesnt-resume'],
  ['Works in Chrome, not in Safari or on an iPad', 'More options: Storage “Blocked”, Browser “WebKit”, Device size; then Launch.', 'works-in-chrome-not-in-safari-or-on-an-ipad'],
  ['Works in one LMS, not another', 'Experiments, or choose a Profile and Launch.', 'works-in-one-lms-not-another'],
  ['Works in the authoring tool, not in an LMS', 'Launch, then Server needs: Discover all server requests.', 'works-on-the-authoring-platform-not-in-an-lms']]
const startScreen = () => h('div', { class: 'welcome' },
  h('p', {}, 'Package Lab runs a SCORM, cmi5 or Tin Can package the way an LMS would, records what happens, and says what stops it working.'),
  h('p', {}, 'Open a package to start: choose Open package… above.'),
  h('h2', {}, 'Something is wrong? Start here'),
  h('table', {}, h('thead', {}, h('tr', {}, ['Symptom', 'What to press', ''].map(c => h('th', {}, c)))),
    h('tbody', {}, RECIPES.map(([sym, what, id]) => h('tr', {}, h('td', {}, sym), h('td', {}, what), h('td', {}, h('button', { type: 'button', class: 'link', onclick: () => openDoc('recipes.md', id) }, 'Steps')))))))

// ---- Docs panel: the Markdown docs beside the window (src/docs.js lists and reads them; markdown.js draws them) ----
const store = { get: k => { try { return localStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* not remembered */ } } }
const docs = { list: null, text: {}, cur: null, anchor: '', hist: [] }
const docBody = $('doc-body')
const saveDocs = () => store.set('pl.docs', JSON.stringify({ open: !$('docs').hidden, doc: docs.cur }))
// back: going back, so the page left isn't added to the history again.
const openDoc = (name, anchor = '', back) => act(async () => {
  $('docs').hidden = false
  if (!docs.list) { docs.list = await lab.invoke('docs'); $('doc-pick').replaceChildren(...docs.list.map(d => h('option', { value: d.name }, d.title))) }
  if (!docs.list.some(d => d.name === name)) name = docs.cur ?? docs.list[0]?.name
  if (!name) return
  const text = docs.text[name] ??= await lab.invoke('doc', { name })
  if (docs.cur && !back) docs.hist.push([docs.cur, docs.anchor])
  Object.assign(docs, { cur: name, anchor })
  docBody.innerHTML = markdown(text, 'doc-')
  $('doc-pick').value = name; $('doc-back').disabled = !docs.hist.length
  let target = null
  try { target = anchor && docBody.querySelector('#' + CSS.escape('doc-' + decodeURIComponent(anchor))) } catch { /* bad escape: top */ }
  if (target) target.scrollIntoView(); else docBody.scrollTop = 0
  saveDocs()
})
// The row of findings.md whose first cell is this finding's title: its *placeholders* match any text.
const rowFor = (root, title) => [...root.querySelectorAll('tr')].find(tr => {
  const c = tr.cells[0]; if (!c || c.tagName !== 'TD') return false
  const k = c.cloneNode(true); k.querySelectorAll('em').forEach(m => m.replaceWith('\0'))
  const rx = k.textContent.trim().split('\0').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+?')
  return new RegExp(`^${rx}$`, 'i').test(title)
})
async function findingHelp(title) {
  await openDoc('findings.md')
  const row = docs.cur === 'findings.md' && rowFor(docBody, title)
  if (!row) return
  row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 2600)
}
// x.md, x.md#a, packs/x.md, ../x.md, #a: from the folder of the open doc; null if it isn't one of the docs.
function docLink(href) {
  const [path, anchor = ''] = href.split('#')
  if (!path) return [docs.cur, anchor]
  const dir = docs.cur.split('/').slice(0, -1)
  for (const seg of path.split('/')) if (seg === '..') dir.pop(); else if (seg !== '.') dir.push(seg)
  const name = dir.join('/')
  return docs.list.some(d => d.name === name) ? [name, anchor] : null
}
docBody.addEventListener('click', e => {
  const a = e.target.closest('a[href]')
  if (!a) return
  e.preventDefault()
  const href = a.getAttribute('href')
  if (/^https?:/i.test(href)) return void (lab.web ? window.open(href, '_blank', 'noopener') : window.open(href))
  const to = !/^[a-z][a-z0-9+.-]*:/i.test(href) && docLink(href)
  if (to) openDoc(...to)
})
$('doc-pick').onchange = () => openDoc($('doc-pick').value)
$('doc-back').onclick = () => { const [n, a] = docs.hist.pop(); openDoc(n, a, true) }
$('doc-close').onclick = () => { $('docs').hidden = true; saveDocs() }
$('help').onclick = () => $('docs').hidden ? openDoc(docs.cur ?? 'README.md', docs.anchor) : $('doc-close').click()
// Settings (desktop only: the menu sends it, and the handlers refuse the web interface).
let settingsDefault = 4880
const setNote = t => { $('set-status').textContent = t }
function openSettings() {
  act(async () => { const s = await lab.invoke('settings'); settingsDefault = s.defaults.port; $('set-port').value = s.port; setNote(`Kept in ${s.path}`); $('settings').showModal() })
}
$('set-reset').onclick = () => { $('set-port').value = settingsDefault }
$('set-save').onclick = async () => {
  try {
    const { settings, free } = await lab.invoke('settings-set', { port: +$('set-port').value })
    if (!free) return setNote(`Something is already listening on port ${settings.port}; saved anyway — pick another if the web interface won’t start.`)
    $('settings').close(); say(`Saved: the web interface will use port ${settings.port}.`)
  } catch (e) { setNote(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) }
}
lab.on?.('menu', ({ action, name }) => { if (action === 'docs') openDoc(name ?? docs.cur ?? 'README.md'); else if (action === 'settings') openSettings(); else { const b = $(action); if (b && !b.disabled) b.click() } })
try { const d = JSON.parse(store.get('pl.docs')); if (d?.open) openDoc(typeof d.doc === 'string' ? d.doc : 'README.md') } catch { /* nothing remembered */ }

function render() {
  if (!codePane.hidden && codePane.dataset.run !== '' && +codePane.dataset.run !== st.sel) { codePane.hidden = true; codePane.replaceChildren() }   // its run isn't the chosen one any more
  if (lab.web) liveWatch(st.tab === 'Live' && !!st.running)
  const welcome = !st.pkg && !st.runs.length && !st.live.length && !st.batch && !st.running
  $('tabs').hidden = $('filter').parentElement.hidden = welcome
  const tabs = TABS.filter(t => t === st.tab || !HIDE[t]?.())
  const firstTool = tabs.find(t => t === 'Folder check' || t === 'Experiments')
  $('tabs').replaceChildren(...tabs.map(t => h('button', { type: 'button', role: 'tab', class: t === firstTool ? 'gap' : null, 'aria-selected': String(t === st.tab), onclick: () => { st.tab = t; render() } }, t === 'Files' && overrides().length ? `Files (${overrides().length})` : t)))
  // Not while the file editor has focus: a redraw (a run or state event) would lose the cursor and scroll position.
  if (!(st.tab === 'Files' && document.activeElement?.classList.contains('code')) && !document.activeElement?.matches?.('#view .pins-form input, #view .answer-form input, #view .answer-form textarea')) $('view').replaceChildren(...[welcome ? startScreen() : VIEWS[st.tab]()].flat(Infinity).filter(x => x != null && x !== false))
  $('runs').replaceChildren(...st.runs.map(r => h('li', { class: r.id === st.sel ? 'sel' : null, onclick: () => { st.sel = r.id; render() } },
    h('label', { title: 'Reference: the run that works' }, h('input', { type: 'radio', name: 'ref', checked: st.ref === r.id, onclick: e => { e.stopPropagation(); st.ref = r.id; render() } }), h('span', { class: 'tag' }, 'R')),
    h('label', { title: 'The run that fails' }, h('input', { type: 'radio', name: 'fail', checked: st.fail === r.id, onclick: e => { e.stopPropagation(); st.fail = r.id; render() } }), h('span', { class: 'tag' }, 'F')),
    h('span', { class: 'lbl' }, r.label, h('span', { class: 'kind' }, `${r.findings.filter(f => f.sev === 'error').length} errors · ${r.trace.lrs ? r.trace.lrs.statements.length + ' statements' : r.trace.probe.filter(p => p.type === 'api').length + ' API calls'} · ${r.trace.requests.length} requests`)))))
  $('compare').disabled = !(st.ref && st.fail && st.ref !== st.fail)
  showMacro()
}

async function act(fn, busy) {
  try { if (busy) say(busy); await fn() } catch (e) { say(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) }
}
function showPackage(p) {
  if (!p) return
  st.pkg = p; st.sel = null; st.boots = {}; st.files = { list: null, open: null, draft: '', diffs: {}, note: '' }
  $('pkg-name').textContent = p.name
  $('item').replaceChildren(...p.items.map(i => h('option', { value: i.index }, `${'· '.repeat(i.depth)}${i.title} (${i.type || '?'})`)))
  const firstSco = p.items.find(i => i.type === 'sco'); if (firstSco) $('item').value = firstSco.index
  $('item').disabled = !p.items.length; $('launch').disabled = !p.items.length; $('cycle').disabled = !p.items.length; $('export').disabled = false; $('compare-pkg').disabled = false; st.pdiff = null
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
// ---- Package diff (P3.3): the open package (A) against a second one (B) ----
const kb = n => n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`
const showDiff = d => { if (!d) return; st.pdiff = d; st.tab = 'Package diff'; render(); say(`${d.a.name} against ${d.b.name}: ${d.summary}`) }
$('compare-pkg').onclick = () => lab.web ? $('file2').click() : act(async () => showDiff(await lab.invoke('compare-packages')), 'Comparing…')
$('file2').onchange = () => act(async () => {
  const f = $('file2').files[0]
  if (!f) return
  showDiff(await lab.upload(f, p => say(`Uploading ${f.name}: ${Math.round(p * 100)}%`), 'compare'))
  $('file2').value = ''
}, 'Uploading…')
VIEWS['Package diff'] = () => {
  const d = st.pdiff
  if (!d) return h('p', { class: 'muted' }, st.pkg ? 'Choose Compare packages… to compare the open package (A) with another one (B).' : 'Open a package, then choose Compare packages….')
  const f = d.files, none = h('span', { class: 'muted' }, 'none'), cell = v => v === null ? none.cloneNode(true) : v
  const diffPre = text => { const all = text.split('\n'), lines = all.slice(0, 3000); return [h('pre', { class: 'diff' }, lines.map(l => h('div', { class: l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : l[0] === '@' ? 'hunk' : null }, l || ' '))), all.length > 3000 && h('p', { class: 'muted small' }, `First 3000 of ${all.length} lines. package-lab diff --out has all of them.`)] }
  return [h('p', {}, h('b', {}, d.a.name), ' (A) against ', h('b', {}, d.b.name), ` (B): ${d.summary}`),
    h('p', { class: 'muted small' }, 'From the files alone. To compare how they run, use package-lab diff --run.'),
    h('h3', { class: 'section' }, 'Files'),
    ...table(['File', 'Size', 'Change'], [...f.added.map(x => [x.path, kb(x.size), 'added in B']), ...f.removed.map(x => [x.path, kb(x.size), 'only in A']), ...f.changed.map(x => [x.path, `${kb(x.before)} → ${kb(x.after)}`, 'changed'])]),
    f.changed.map(c => h('details', {}, h('summary', {}, h('span', { class: 'mono' }, c.path), h('span', { class: 'muted' }, ` ${kb(c.before)} → ${kb(c.after)}${c.diff === null ? c.tooBig ? ', too large to show line by line' : ', not a text file' : ''}`)), c.diff === null ? null : diffPre(c.diff))),
    h('h3', { class: 'section' }, 'Manifest'),
    ...table(['Where', 'Field', 'A', 'B'], d.manifest.map(m => [m.where, m.field, cell(m.a), cell(m.b)])),
    h('h3', { class: 'section' }, 'Loading path'),
    h('p', { class: 'muted small' }, `Launch page: ${d.boot.a ?? 'none'} in A, ${d.boot.b ?? 'none'} in B.`),
    ...table(['File', 'Kind', 'How', 'Change'], [...d.boot.added.map(n => [n.path, n.kind, n.how, `only in B (${n.status})`]), ...d.boot.removed.map(n => [n.path, n.kind, n.how, `only in A (${n.status})`]), ...d.boot.changed.map(c => [c.path, c.kind, '', `${c.a} → ${c.b}`])]),
    h('h3', { class: 'section' }, 'New findings (in B, not in A)'), findingsList(d.findings.added),
    h('h3', { class: 'section' }, 'Findings gone (in A, not in B)'), findingsList(d.findings.gone)]
}
// ---- Folder check (P4.3, desktop only): every package in a folder, one row each. A row opens that package. ----
const BATCH_SEV = { ok: 'OK', warn: 'Warning', error: 'Error', failed: 'Failed' }
const showBatch = b => { if (!b) return; st.batch = b; st.tab = 'Folder check'; render(); say(`${b.folder}: ${b.summary.packages} packages checked.`) }
const openBatchRow = r => act(async () => showPackage(await lab.invoke('open-batch-row', { path: r.path })), 'Opening…')
$('check-folder').onclick = () => act(async () => showBatch(await lab.invoke('check-folder')), 'Checking the folder…')
$('check-folder').hidden = !!lab.web   // desktop only: the web interface can't open a folder on this Mac
VIEWS['Folder check'] = () => {
  const b = st.batch
  if (!b) return h('p', { class: 'muted' }, 'Choose Check a folder… to check every SCORM package in a folder.')
  const s = b.summary
  return [h('p', {}, h('b', {}, b.folder), `: ${s.packages} packages, ${s.ok} OK, ${s.warnings} with warnings, ${s.errors} with errors, ${s.failed} failed.`),
    h('p', { class: 'muted small' }, 'From the files alone. Click a package to open it.'),
    h('table', {}, h('thead', {}, h('tr', {}, ['Package', 'SCORM', 'Tool', 'Verdict', 'Errors', 'Warnings', 'Note'].map(c => h('th', {}, c)))),
      h('tbody', {}, b.rows.map(r => h('tr', { class: 'click', title: 'Open this package', onclick: () => openBatchRow(r) },
        [r.package, r.scorm ?? '', r.tool, BATCH_SEV[r.verdict] ?? r.verdict, r.errors, r.warnings, r.note].map(c => h('td', {}, String(c)))))))]
}
// ---- LMS profile (P2.1): a preset from the toolbar, with the fields changed in More options going over it ----
// [field path, label, choices | 'text' | 'number' | 'json']. Empty sandbox, CSP and limits are null (none, the standard's).
const PF = [['contentOrigin', 'Content origin', ['same', 'other']], ['frames.depth', 'Frames', [0, 1, 2, 3, 4, 5]], ['frames.kind', 'Frame kind', ['iframe', 'frameset']],
  ['frames.sandbox', 'Sandbox', 'text'], ['frames.allow', 'Allow', 'text'], ['launch', 'Launch', ['frame', 'popup']], ['popupDelay', 'Popup delay (ms)', 'number'],
  ['launchParams', 'Profile parameters', 'text'], ['apiDelay', 'API delay (ms)', 'number'], ['apiWhere', 'API on', ['top', 'parent', 'opener']], ['csp', 'CSP', 'text'],
  ['headers', 'Headers (JSON)', 'json'], ['commit', 'Commit', ['ok', 'fail', 'slow']], ['slowMs', 'Slow commit (ms)', 'number'],
  ['limits.suspend12', 'Suspend data 1.2', 'number'], ['limits.suspend2004', 'Suspend data 2004', 'number'], ['cookies', 'Cookies', ['normal', 'third-party-blocked']]]
st.profiles = null; st.profileEdits = {}
const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o)
const toText = (kind, v) => v === null ? '' : kind === 'json' ? JSON.stringify(v) : String(v)
const fromText = (path, kind, t) => kind === 'json' ? JSON.parse(t || '{}') : t === '' && /sandbox|csp|limits/.test(path) ? null : kind === 'number' || typeof kind[0] === 'number' ? Number(t) : t
// The option: the preset's name, or { base, …changed fields } when any were changed.
function profileOption() {
  const e = Object.entries(st.profileEdits)
  if (!e.length) return $('profile').value
  const o = { base: $('profile').value }
  for (const [p, v] of e) { const [a, b] = p.split('.'); if (b) (o[a] ??= {})[b] = v; else o[a] = v }
  return o
}
function showProfile() {
  const pr = st.profiles?.[$('profile').value]
  if (!pr) return
  $('profile-notes').textContent = `${pr.notes}${pr.sources.length ? ' Sources: ' + pr.sources.join(', ') : ''}`
  $('profile-fields').replaceChildren(...PF.map(([p, label, kind]) => {
    const el = Array.isArray(kind) ? h('select', {}, kind.map(c => h('option', { value: c }, c))) : h('input', { type: kind === 'number' ? 'number' : 'text', min: kind === 'number' ? 0 : null, spellcheck: 'false', size: kind === 'number' ? 6 : 18 })
    el.value = toText(kind, Object.hasOwn(st.profileEdits, p) ? st.profileEdits[p] : getPath(pr, p))
    el.onchange = () => {
      let v
      try { v = fromText(p, kind, el.value.trim()) } catch { return say('Headers must be a JSON object, like {"X-Frame-Options": "DENY"}.') }
      if (JSON.stringify(v) === JSON.stringify(getPath(pr, p))) delete st.profileEdits[p]; else st.profileEdits[p] = v
      showOptions()
    }
    return h('label', {}, label, el)
  }))
}
lab.invoke('profiles').then(p => {
  st.profiles = p
  $('profile').replaceChildren(...Object.entries(p).map(([n, x]) => h('option', { value: n }, n + (x.approximation ? ' (approximation)' : ''))))
  showProfile(); restore('profile'); showProfile()
}).catch(() => {})
$('profile').addEventListener('change', () => { st.profileEdits = {}; showProfile() })
// ---- Remembered launch options: the ones that aren't about this package (localStorage 'pl.launch'; a stale value is ignored) ----
const REMEMBER = ['expose', 'profile', 'depth', 'opener', 'auto', 'caught', 'storage', 'browser', 'viewport', 'viewport-w', 'viewport-h', 'trace']
const saved = () => { try { return JSON.parse(store.get('pl.launch')) ?? {} } catch { return {} } }
function restore(...ids) {
  const o = saved()
  for (const id of ids) {
    const el = $(id), v = o[id]
    if (v === undefined) continue
    if (el.type === 'checkbox') el.checked = v === true
    else if (el.tagName !== 'SELECT' || [...el.options].some(x => x.value === String(v))) el.value = String(v)
  }
  $('viewport-custom').hidden = $('viewport').value !== 'custom'
}
restore(...REMEMBER.filter(id => id !== 'profile'))   // the profile list arrives later
const remember = () => store.set('pl.launch', JSON.stringify({ ...saved(), ...Object.fromEntries(REMEMBER.filter(id => id !== 'profile' || st.profiles).map(id => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value])) }))
for (const id of REMEMBER) $(id).addEventListener('change', remember)
const macroSize = () => st.macro.events.length ? st.macro.viewport : null   // what the macro was recorded at (main.js launchItem)
const launchOptions = () => ({ macro: st.macro.events, recordInput: $('record-input').checked, expose: $('expose').value, profile: profileOption(), depth: +$('depth').value || 0, opener: $('opener').checked, resume: $('resume').checked, caught: $('caught').checked, auto: +$('auto').value,
  pins: st.pins, responses: st.responses, launchParams: $('launch-params').value.trim(), trace: $('trace').checked, storage: $('storage').value, tool: $('tool').value || null,
  browser: $('browser').value, viewport: $('viewport').value === 'custom' ? `${+$('viewport-w').value}x${+$('viewport-h').value}` : $('viewport').value || (macroSize() ? `${macroSize().width}x${macroSize().height}` : null) })
// The Macro box under More options: how long it is, the clicks the selected run's probe saw, and Clear.
function showMacro() {
  const r = run(), seen = r ? r.trace.probe.filter(p => p.type === 'input').length : 0, m = st.macro, n = m.events.length
  $('macro').replaceChildren(h('p', { class: 'muted small' }, n ? `${n} events over ${(m.events.at(-1).t / 1000).toFixed(1)} s${m.viewport ? `, recorded at ${m.viewport.width}×${m.viewport.height}` : ''}. They play at the start of every launch${m.viewport ? ', at that size unless Device size says otherwise' : ''}, and are saved in each run’s options.` : 'None. Record clicks in the Live view (web interface), or take the clicks of a run.'),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'secondary', disabled: !seen, title: 'The clicks, keys and typing the probe saw in the course’s frames during the selected run', onclick: () => act(async () => { st.macro = await lab.invoke('macro-from-run', { run: r.id }); showMacro(); showOptions(); say(`Macro made from the selected run: ${st.macro.events.length} events.`) }) }, seen ? `Use this run’s clicks (${seen})` : 'Use this run’s clicks'),
      h('button', { type: 'button', class: 'secondary', disabled: !n, onclick: () => { st.macro = { events: [], viewport: null }; showMacro(); showOptions() } }, 'Clear')))
}
async function showOptions() {
  try {
    const n = st.pkg?.items.findIndex(i => i.index === +$('item').value) + 1
    const r = await lab.invoke('options', { ...launchOptions(), item: n || undefined })
    $('options-json').textContent = JSON.stringify(r.options, null, 2); $('cli-line').textContent = r.command
  } catch (e) { $('options-json').textContent = e.message; $('cli-line').textContent = '' }
}
for (const id of ['item', 'expose', 'profile', 'depth', 'opener', 'resume', 'caught', 'auto', 'launch-params', 'trace', 'record-input', 'storage', 'tool', 'browser', 'viewport', 'viewport-w', 'viewport-h']) $(id).addEventListener('change', showOptions)
$('viewport').addEventListener('change', () => { $('viewport-custom').hidden = $('viewport').value !== 'custom' })
$('more').addEventListener('toggle', showOptions)
$('cycle').onclick = startCycle
// ---- Record (E1.3, desktop only): press Record during a run and click through the course. When the run stops, its clicks
// (from the press on) become the macro, once the user says Save in the dialog. Discard leaves the macro as it was. ----
st.recordFrom = null; st.recordPending = null; st.recordRun = null   // recordFrom: ms into the run where Record was pressed; recordRun: that run's start (state event); null when not recording
const recordEl = $('record'), recordDlg = $('record-dialog'), recordTip = recordEl.title
const showRecord = () => { const on = st.recordFrom != null; $('record-text').textContent = on ? 'Recording…' : 'Record'; recordEl.setAttribute('aria-pressed', String(on)); recordEl.title = on ? 'Press again to stop the run and save the clicks.' : recordTip }
// Shown only in the desktop app and only while a run is going; used by the state event and by the restore path.
function setRunning(s) { st.running = s || null; recordEl.hidden = lab.web || !s; showRecord() }
recordEl.onclick = () => {
  if (st.recordFrom != null) return $('stop').click()   // Record again ends the run too: the clicks are only read once the run is analysed
  if (!st.running) return say('Launch an item first, then press Record and click through the course.')
  // A macro replays at the start of the run as real input: its clicks are not the user's, so recording starts after its last event.
  const press = Date.now() - st.running.started, last = st.macro.events.at(-1)
  st.recordFrom = last ? Math.max(press, last.t + 1) : press
  showRecord(); say('Recording: click through the course. Press Record again, or Stop and analyse, to keep the clicks.')
}
const finishRecord = (run, from) => act(async () => {
  const m = await lab.invoke('macro-from-run', { run: run.id })
  const events = m.events.filter(e => e.t >= from).map(e => ({ ...e, t: e.t - from }))
  st.recordPending = { events, viewport: m.viewport }
  const n = events.length, inputOff = !run.launch?.options?.recordInput
  $('record-title').textContent = n ? `Save ${n} ${n === 1 ? 'step' : 'steps'} as the macro?` : 'Nothing was recorded'
  $('record-note').textContent = [n ? '' : 'Click in the course while Record is pressed, then press Record again.', inputOff ? 'Typed text wasn’t kept. Turn on Keep typed text to include it.' : ''].filter(Boolean).join(' ')
  $('record-save').disabled = !n
  recordDlg.showModal()
})
$('record-save').onclick = () => {
  const p = st.recordPending; recordDlg.close(); if (!p) return
  st.macro = { events: p.events, viewport: p.viewport }; showMacro(); showOptions()
  say(`Macro saved: ${p.events.length} ${p.events.length === 1 ? 'step' : 'steps'}. It plays at the start of each launch.`)
}
$('record-discard').onclick = () => recordDlg.close()
recordDlg.addEventListener('close', () => { st.recordPending = null; $('launch').focus() })   // Record is hidden once the run has ended, so focus goes to Launch
// Export corrected package…: a checklist of the fixes that apply to this package (all ticked), then the export.
$('export').onclick = () => {
  const fixes = st.pkg?.fixes ?? [], panel = $('export-panel')
  panel.replaceChildren(h('strong', {}, 'Export with these fixes:'),
    ...fixes.map(f => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, 'data-fix': f.id }), ' ' + f.label)),
    !fixes.length && h('span', { class: 'muted' }, 'No automatic fixes apply to this package. Files you changed in the Files tab are still included.'),
    h('button', { type: 'button', onclick: () => { const only = [...panel.querySelectorAll('input[data-fix]:checked')].map(i => i.dataset.fix); panel.hidden = true; exportFixed(only) } }, 'Export…'),
    h('button', { type: 'button', class: 'secondary', onclick: () => { panel.hidden = true } }, 'Cancel'))
  panel.hidden = false
}
const exportFixed = only => act(async () => {
  const r = await (lab.web ? lab.download(only) : lab.invoke('export-fixed', { only }))
  say(r.cancelled ? 'Export cancelled.' : !r.file ? 'Nothing to change: none of the fixes found anything to correct, and no files are changed.'
    : `${lab.web ? 'Downloaded' : 'Saved'} ${r.file}: ${r.changes} change${r.changes === 1 ? '' : 's'}, ${r.gone} finding${r.gone === 1 ? '' : 's'} cleared, ${r.remaining} still there. PACKAGE-LAB-CHANGES.txt inside lists every change.`)
}, 'Building the corrected package…')
$('copy-cli').onclick = () => act(async () => { await navigator.clipboard.writeText($('cli-line').textContent); say('Copied.') })
$('launch').onclick = () => act(async () => {
  st.live = []
  await lab.invoke('launch', { item: +$('item').value, ...launchOptions(), macroSize: macroSize() })
  st.sel = null; st.tab = lab.web ? 'Live' : st.pkg?.analysis.format && st.pkg.analysis.format !== 'scorm' ? 'xAPI' : 'API'; render()
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
lab.on('run', r => { if (st.runs.some(x => x.id === r.id)) return; if (st.recordFrom != null && Math.abs(Date.parse(r.trace.started) - st.recordRun) < 50) { const from = st.recordFrom; st.recordFrom = null; showRecord(); finishRecord(r, from) } st.runs.push(r);if (!st.exp.busy && !st.disc.busy && !st.drill.busy && !st.cyc.busy) { st.sel = r.id; st.tab = 'Findings' } render(); say(`Recorded: ${r.findings.filter(f => f.sev === 'error').length} errors, ${r.findings.filter(f => f.sev === 'warn').length} warnings.`) })
lab.on('state', s => { if (s.running) Object.assign(st, { recordFrom: null, recordRun: s.started }); setRunning(s.running ? s : null);if (!s.running && st.tab === 'Live') st.tab = 'Findings'; render(); $('stop').disabled = !s.running;$('launch').disabled = !!s.running || !st.pkg?.items.length; $('cycle').disabled = !!s.running || !st.pkg?.items.length; $('ref').disabled = !!s.running; if (s.running) say(`Recording ${s.label}. ${s.auto ? `It stops by itself after ${s.auto} s, or` : 'Use the course, then'} Stop and analyse${lab.web ? '' : ' (or close its window)'}.`) })
lab.on('experiment', e => {
  const x = st.exp
  if (e.state === 'start') { x.names = e.names; x.rows = []; x.findings = []; x.busy = true }
  else if (e.state === 'result') { x.rows[e.index] = e.row; x.note = `Finished ${e.index + 1} of ${x.names.length}.` }
  else if (e.state === 'done') { x.rows = e.rows; x.findings = e.findings; x.busy = false; x.note = e.stopped ? 'Stopped.' : 'Done.' }
  else { x.busy = false; x.note = e.message }
  render()
})
lab.on('macro', e => { if (e.state === 'full') { recording(false); say(e.message) } })
lab.on('cycle', e => {
  const x = st.cyc
  if (e.state === 'start') Object.assign(x, { busy: true, rows: [], findings: [], runs: [], note: 'Run 1: playing the macro and leaving…' })
  else if (e.state === 'run') { x.runs[e.index] = e.run; x.note = e.index ? 'Done.' : 'Run 2: resuming…' }
  else if (e.state === 'done') Object.assign(x, { busy: false, rows: e.rows, findings: e.findings, runs: e.runs, note: 'Done.' })
  else Object.assign(x, { busy: false, note: e.message })
  render()
})
lab.on('discover', e => {
  const x = st.disc
  if (e.state === 'start') { x.rows = []; x.result = null; x.busy = true; x.note = 'Running without an answer first…' }
  else if (e.state === 'round') { x.rows[e.index] = e.row; x.note = `Finished: ${e.row.name}.` }
  else if (e.state === 'done') { x.result = e.result; x.rows = e.result.rows; x.busy = false; x.note = `Done after ${e.result.rounds} round${e.result.rounds === 1 ? '' : 's'}.${e.result.file ? ' Saved to ' + e.result.file : ''}` }
  else { x.busy = false; x.note = e.message }
  render()
})
lab.on('drill', e => {
  const x = st.drill
  if (e.state === 'start') Object.assign(x, { run: e.run, busy: true, result: null, note: 'Working…' })
  else if (e.state === 'step') x.note = e.note
  else if (e.state === 'done') Object.assign(x, { run: e.run, busy: false, result: e.result, note: 'Done.' })
  else Object.assign(x, { busy: false, note: e.message })
  render()
})
showPinBox()
lab.on('package', p => { if (p?.loaded !== st.pkg?.loaded) showPackage(p) })
render()
// The web interface may join a session already under way: show its package, runs and any run in progress.
if (lab.web) lab.invoke('state').then(s => {
  if (s.pkg) showPackage(s.pkg)
  addRuns(s.runs)
  if (s.running) { setRunning(s.running); $('stop').disabled = false; $('launch').disabled = true; st.tab = 'Live'; render() }
  document.title = 'Package Lab (web)'
}).catch(e => say(e.message))
