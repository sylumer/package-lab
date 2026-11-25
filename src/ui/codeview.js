// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// The shared code view (P4.1), a classic script (window.CodeView): one file with line numbers, the mode (formatted, original or from
// its source map), coverage shading, trace markers, a search box and "go to line". Plain DOM. A file over 5,000 lines draws only
// the lines in view. What it shows comes from the code-view handler (src/codeview.js).
(() => {
  const LH = 18, VIRTUAL = 5000, SPARE = 30, CLIP = 600, MODES = { formatted: 'Formatted', original: 'Original', mapped: 'Source map' }
  // "js/app.js:12:5" in a piece of evidence → { text } and { text, path, line, col }. The same as evidenceParts in src/codeview.js
  // (test/codeview.js checks they agree).
  const LINK = /(?<![\w/:.@%+~-])((?:lab:\/\/(?:run|content)\/pkg\/)?(?:[\w.@%+~-]+\/)*[\w.@%+~-]+\.(?:m?js|cjs|html?|css|json|xml|txt)):(\d+)(?::(\d+))?/g
  function parts(s) {
    s = String(s ?? '')
    const out = []
    let at = 0
    for (const m of s.matchAll(LINK)) {
      if (m.index > at) out.push({ text: s.slice(at, m.index) })
      let path = m[1].replace(/^lab:\/\/(?:run|content)\/pkg\//, '')
      try { path = decodeURIComponent(path) } catch { /* as written */ }
      out.push({ text: m[0], path, line: +m[2], col: +(m[3] ?? 0) })
      at = m.index + m[0].length
    }
    if (at < s.length) out.push({ text: s.slice(at) })
    return out
  }

  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag)
    for (const [k, v] of Object.entries(props)) if (v != null && v !== false) k === 'class' ? e.className = v : k.startsWith('on') ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v === true ? '' : v)
    e.append(...kids.flat().filter(x => x != null && x !== false))
    return e
  }
  const shade = c => c > 0 ? 'ran' : c === 0 ? 'none' : c === -2 ? 'part' : ''
  const times = c => c > 9999 ? '9999+' : c > 0 ? '×' + c : c === 0 ? '0' : c === -2 ? '~' : ''

  // view: what the code-view handler returned. ctl: { col, ask(options) → Promise of a view, close() }.
  function create(view, ctl) {
    let v = view, lines = [], hits = [], hitSet = new Set(), at = -1, token = 0
    const status = el('span', { class: 'muted small', role: 'status' })
    const search = el('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search this file', spellcheck: 'false' })
    const found = el('span', { class: 'muted small' })
    const goto = el('input', { type: 'number', min: '1', placeholder: 'Line', 'aria-label': 'Go to line' })
    const modes = el('span', { class: 'cv-modes' }), sources = el('select', { 'aria-label': 'Original source' })
    const title = el('b'), legend = el('p', { class: 'muted small' })
    const rows = el('div', { class: 'cv-rows' }), scroller = el('div', { class: 'cv-scroll', tabindex: '0', role: 'region', 'aria-label': 'Code' }, rows)
    const root = el('div', { class: 'cv' },
      el('div', { class: 'row wrap' }, title, modes, sources, status, el('span', { style: 'flex:1' }), search,
        el('button', { type: 'button', class: 'secondary', title: 'Previous match', onclick: () => step(-1) }, '↑'),
        el('button', { type: 'button', class: 'secondary', title: 'Next match', onclick: () => step(1) }, '↓'), found,
        goto, el('button', { type: 'button', class: 'secondary', onclick: () => jump(+goto.value) }, 'Go'),
        el('button', { type: 'button', class: 'secondary', onclick: () => ctl.close() }, 'Close')), legend, scroller)

    const clip = (t, n) => {
      if (t.length <= CLIP) return t
      const a = v.mode === 'original' && n === v.target && ctl.col > 1 ? Math.max(0, Math.min(ctl.col - 100, t.length - CLIP)) : 0
      return (a ? '… ' : '') + t.slice(a, a + CLIP) + (a + CLIP < t.length ? ` … (${t.length.toLocaleString()} characters)` : '')
    }
    const row = i => {
      const n = i + 1, c = v.cov ? v.cov[i] : -1, m = v.marks?.[n]
      return el('div', { class: ['cv-line', n === v.target && 'hl', hitSet.has(i) && 'hit', shade(c) && 'cov-' + shade(c)].filter(Boolean).join(' ') },
        el('span', { class: 'cv-g' }, el('span', { class: 'cv-n' }, String(n)), el('span', { class: 'cv-c', title: c > 0 ? `ran ${c} time${c > 1 ? 's' : ''}` : c === 0 ? 'didn’t run' : c === -2 ? 'part of this line ran' : '' }, times(c))),
        el('span', { class: 'cv-t' }, clip(lines[i], n) || ' '), m && el('span', { class: 'cv-m', title: m }, m))
    }
    function paint() {
      const n = lines.length
      if (n <= VIRTUAL) { rows.style.paddingTop = rows.style.paddingBottom = '0'; rows.replaceChildren(...lines.map((_, i) => row(i))); return }
      const from = Math.max(0, Math.floor(scroller.scrollTop / LH) - SPARE), to = Math.min(n, from + Math.ceil(scroller.clientHeight / LH) + 2 * SPARE)
      rows.style.paddingTop = from * LH + 'px'; rows.style.paddingBottom = (n - to) * LH + 'px'
      rows.replaceChildren(...Array.from({ length: to - from }, (_, k) => row(from + k)))
    }
    const reveal = n => { scroller.scrollTop = Math.max(0, (n - 1) * LH - scroller.clientHeight / 3); if (lines.length > VIRTUAL) paint() }
    function jump(n) {
      if (!(n >= 1)) return
      v.target = Math.min(lines.length, Math.floor(n)); title.textContent = head(); paint(); reveal(v.target)
    }
    function find() {
      const q = search.value.toLowerCase()
      hits = []; at = -1
      if (q) for (let i = 0; i < lines.length && hits.length < 5000; i++) if (lines[i].toLowerCase().includes(q)) hits.push(i)
      hitSet = new Set(hits)
      found.textContent = q ? (hits.length ? `${hits.length}${hits.length === 5000 ? '+' : ''} lines` : 'no match') : ''
      paint()
    }
    function step(d) {
      if (!hits.length) return
      at = (at + d + hits.length) % hits.length
      found.textContent = `${at + 1} of ${hits.length}${hits.length === 5000 ? '+' : ''}`
      paint(); reveal(hits[at] + 1)
    }
    const head = () => `${v.path}${v.target ? ':' + v.target : ''}`
    function load(o) {
      const mine = ++token
      status.textContent = o.mode === 'formatted' ? 'Formatting…' : 'Loading…'
      return ctl.ask(o).then(nv => { if (mine === token) { show(nv); status.textContent = '' } }, e => { if (mine === token) status.textContent = e.message })
    }
    function show(nv) {
      v = nv; lines = v.text.split('\n').map(l => l.replace(/\r$/, '')); hits = []; hitSet = new Set(); at = -1
      title.textContent = head()
      modes.replaceChildren(...v.modes.map(m => el('button', { type: 'button', class: m === v.mode ? '' : 'secondary', 'aria-pressed': String(m === v.mode), onclick: () => m !== v.mode && load({ mode: m }) }, MODES[m])))
      sources.hidden = !(v.mode === 'mapped' && v.sources.length > 1)
      sources.replaceChildren(...v.sources.map((s, i) => el('option', { value: String(i), selected: i === v.source }, s)))
      legend.replaceChildren(...[v.mode === 'mapped' ? `Original source: ${v.sources[v.source]}.` : v.mode === 'formatted' ? 'Formatted for reading; line numbers are the formatted text’s.' : '',
        v.note, v.cov ? el('span', {}, el('span', { class: 'cv-key cov-ran' }, 'ran (×N times)'), ' ', el('span', { class: 'cv-key cov-none' }, 'didn’t run'), ' ', el('span', { class: 'cv-key cov-part' }, 'part of the line ran')) : v.covNote || 'No run is chosen, or it has no coverage, so nothing is shaded.',
        Object.keys(v.marks ?? {}).length ? 'Grey notes at the right: what the trace saw there.' : ''].filter(Boolean).flatMap(x => [x, ' ']))
      paint(); requestAnimationFrame(() => reveal(v.target || 1))   // once it is in the page and has a height
      if (v.later) load({ mode: v.later })
    }
    sources.onchange = () => load({ mode: 'mapped', source: +sources.value })
    search.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (!hits.length || search.dataset.q !== search.value) { search.dataset.q = search.value; find(); step(1) } else step(e.shiftKey ? -1 : 1) } }
    search.oninput = () => { search.dataset.q = ''; find() }
    goto.onkeydown = e => { if (e.key === 'Enter') jump(+goto.value) }
    scroller.addEventListener('scroll', () => { if (lines.length > VIRTUAL) paint() })
    show(view)
    return root
  }
  window.CodeView = { create, parts }
})()
