// The User Guide window (guide.html): docs/user-guide/ as a book, apart from the Help panel. Contents by part, one chapter
// at a time with Previous and Next, On this page, search, a tick for each “Try it” done, the place you were, and the
// practice kit: package names in the text open that package in Package Lab, and macro file names load that macro.
// Links to other docs (Help, the CLI reference) open here too, under a bar that leads back to the chapter.
// The same page is the web interface's /guide.html (bridge.js gives it window.lab over HTTP).
import { markdown, headings, searchDocs, keysFor } from './markdown.js'

const lab = window.lab, isMac = navigator.platform.startsWith('Mac'), keys = s => keysFor(isMac, s)
const $ = id => document.getElementById(id)
const store = { get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* not remembered */ } } }
const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) if (k.startsWith('on')) e[k] = v; else if (v !== false && v != null) e.setAttribute(k, v); e.append(...kids.flat().filter(k => k != null)); return e }
const say = t => { $('say').textContent = t }
const PRACTICE = /^\d\d-[a-z0-9-]+\.(zip|macro\.json)$/
const TRY = /^(Try it|Exercise \d)/

let guide = [], docs = [], cur = null, back = null   // back: the chapter, and its scroll, to return to while a Help doc is shown
const text = {}
const done = store.get('pl.guide.done') ?? {}
if (lab.web) { const t = store.get('pl.theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t }

const load = async name => text[name] ??= keys(await lab.invoke('doc', { name }))
const inGuide = name => guide.some(d => d.name === name)
const tries = name => text[name] ? headings(text[name]).filter(x => x.level <= 3 && TRY.test(x.text)).map(x => name + '#' + x.id) : []

// A link's target as a docs path and anchor, from the folder of the doc it is in; null for anything else.
function resolve(href, from) {
  const [path, anchor = ''] = href.split('#')
  if (!path) return [from, anchor]
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || !path.endsWith('.md')) return null
  const dir = from.split('/').slice(0, -1)
  for (const seg of path.split('/')) if (seg === '..') dir.pop(); else if (seg !== '.') dir.push(seg)
  const name = dir.join('/')
  return inGuide(name) || docs.some(d => d.name === name) ? [name, anchor] : null
}

function drawContents() {
  const parts = [...new Set(guide.map(d => d.part))]
  $('toc').replaceChildren(...parts.flatMap(p => [h('h2', {}, p), h('ol', {}, guide.filter(d => d.part === p).map(d => {
    const t = tries(d.name), n = t.filter(k => done[k]).length
    return h('li', {}, h('button', { type: 'button', 'data-doc': d.name, 'aria-current': d.name === cur ? 'page' : false, onclick: () => go(d.name) },
      h('span', { class: 't' }, d.title), t.length ? h('span', { class: 'p' + (n === t.length ? ' done' : ''), title: `${n} of ${t.length} exercises done` }, n === t.length ? '✓' : `${n}/${t.length}`) : null))
  }))]))
  const all = guide.flatMap(d => tries(d.name)), n = all.filter(k => done[k]).length
  $('progress').textContent = all.length ? `${n} of ${all.length} exercises ticked off.` : ''
}

async function go(name, anchor = '', { keepScroll } = {}) {
  if (!inGuide(name) && !docs.some(d => d.name === name)) name = guide[0].name
  const md = await load(name), page = $('page'), ref = !inGuide(name)
  if (ref && !back) back = { name: cur, top: $('reader').scrollTop }
  if (!ref) back = null
  cur = name
  page.innerHTML = markdown(md, 'g-')
  // A tick beside each “Try it”, remembered in this browser (or this Mac's guide window).
  if (!ref) for (const hd of page.querySelectorAll('h2, h3')) {
    if (!TRY.test(hd.textContent)) continue
    const key = name + '#' + hd.id.slice(2), box = h('input', { type: 'checkbox', 'aria-label': 'Done: ' + hd.textContent })
    box.checked = !!done[key]
    box.onchange = () => { if (box.checked) done[key] = true; else delete done[key]; store.set('pl.guide.done', done); drawContents() }
    hd.append(h('label', { class: 'done-box' }, box, 'Done'))
  }
  // Practice package and macro names become buttons.
  for (const c of page.querySelectorAll(':not(pre) > code')) {
    const file = c.textContent
    if (!PRACTICE.test(file)) continue
    const zip = file.endsWith('.zip')
    c.replaceWith(h('button', { type: 'button', class: 'practice', title: zip ? `Open ${file} in Package Lab` : `Load ${file} into Package Lab's Macro segment`, onclick: () => practice(file) }, file))
  }
  const toc = headings(md).filter(x => x.level === 2 || x.level === 3)
  $('onpage-list').replaceChildren(...toc.map(x => h('li', { class: 'l' + x.level }, h('a', { href: '#', onclick: e => { e.preventDefault(); $('g-' + x.id)?.scrollIntoView() } }, x.text))))
  $('ref-bar').hidden = !ref
  if (ref) $('ref-title').textContent = `From Help and the reference: ${docs.find(d => d.name === name)?.title ?? name}`
  const i = guide.findIndex(d => d.name === name), prev = guide[i - 1], next = guide[i + 1]
  $('prev').textContent = !ref && prev ? '← ' + prev.title : ''; $('prev').onclick = () => go(prev.name)
  $('next').textContent = !ref && next ? next.title + ' →' : ''; $('next').onclick = () => go(next.name)
  $('pager').hidden = ref
  document.title = `${page.querySelector('h1')?.textContent ?? 'User Guide'} · Package Lab User Guide`
  history.replaceState(null, '', '#' + encodeURIComponent(name) + (anchor ? '#' + encodeURIComponent(anchor) : ''))
  drawContents()
  let target = null
  try { target = anchor && $('g-' + decodeURIComponent(anchor)) } catch { /* a bad anchor: the top */ }
  if (target) target.scrollIntoView()
  else $('reader').scrollTop = keepScroll ?? 0
  if (!ref) store.set('pl.guide.place', { name, top: keepScroll ?? 0 })
  if (!keepScroll && !target) page.focus({ preventScroll: true })
}

async function practice(file) {
  try {
    if (file.endsWith('.zip')) { await lab.invoke('practice-open', { file }); say(`Opened ${file} in Package Lab.`); showKit(`Opened ${file} in ${lab.web ? 'Package Lab (the other tab)' : 'the Package Lab window'}.`) }
    else { const r = await lab.invoke('practice-macro', { file }); showKit(`Loaded ${file} into the Macro segment: ${r.steps} steps.`) }
  } catch (e) { showKit(err(e)) }
}
const err = e => String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const showKit = t => { $('kit-status').textContent = t; say(t) }

// Links: chapters here, Help and reference docs here under the bar, web addresses in the browser.
$('page').addEventListener('click', e => {
  const a = e.target.closest('a[href]')
  if (!a) return
  e.preventDefault()
  const href = a.getAttribute('href')
  if (/^https?:/i.test(href)) return void window.open(href, '_blank', 'noopener')
  const to = resolve(href, cur)
  if (to) go(...to)
})
$('ref-back').onclick = () => back ? go(back.name, '', { keepScroll: back.top }) : go(guide[0].name)

// Search across the guide's chapters.
let timer
const clear = () => { $('search').value = ''; $('results').hidden = true; $('results').replaceChildren(); $('search-status').textContent = '' }
$('search').addEventListener('keydown', e => { if (e.key === 'Escape') { clearTimeout(timer); clear() } })
$('search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(async () => {
  const q = $('search').value
  if (!q.trim()) return clear()
  await Promise.all(guide.map(d => load(d.name)))
  if ($('search').value !== q) return
  const hits = searchDocs(guide.map(d => ({ ...d, text: text[d.name] })), q)
  $('results').replaceChildren(...hits.map(r => { const b = h('button', { type: 'button', onclick: () => { clear(); go(r.name, r.id) } }, h('b', {}, r.title + (r.heading ? ' › ' + r.heading : '')), h('span', { class: 'snip' })); b.querySelector('.snip').innerHTML = r.html; return h('li', {}, b) }))
  $('search-status').textContent = hits.length ? `${hits.length} result${hits.length === 1 ? '' : 's'}` : 'Nothing found.'
  $('results').hidden = !hits.length
}, 150) })

// The practice kit: built into the data folder on the Mac running Package Lab.
$('kit-build').onclick = async () => {
  $('kit-build').disabled = true; showKit('Building…')
  try { const r = await lab.invoke('practice-kit', { build: true }); showKit(`${r.files.filter(f => f.endsWith('.zip')).length} practice packages ready${lab.web ? ' on the Mac' : ''}. Choose a package name in the text to open it.`) }
  catch (e) { showKit(err(e)) }
  $('kit-build').disabled = false
}
$('kit-folder').hidden = !!lab.web
$('kit-folder').onclick = () => lab.invoke('practice-folder').catch(e => showKit(err(e)))

// Where you were: scroll position, kept as you read.
let saveTimer
$('reader').addEventListener('scroll', () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (cur && inGuide(cur)) store.set('pl.guide.place', { name: cur, top: $('reader').scrollTop }) }, 300) })
lab.on?.('guide-go', ({ name, anchor }) => go(name, anchor))
// A link or bookmark to guide.html#<chapter>#<heading> while the page is open.
addEventListener('hashchange', () => { const [name, anchor] = location.hash.slice(1).split('#').map(decodeURIComponent); if (name && name !== cur) go(name, anchor ?? '') })
// On a phone the contents fold away above the chapter.
const narrow = matchMedia('(max-width: 720px)')
const fold = () => { $('toc-wrap').open = !narrow.matches }
fold(); narrow.addEventListener('change', fold)
$('toc').addEventListener('click', e => { if (narrow.matches && e.target.closest('button')) $('toc-wrap').open = false })

;(async () => {
  [guide, docs] = await Promise.all([lab.invoke('guide'), lab.invoke('docs')])
  await Promise.all(guide.map(d => load(d.name).catch(() => null)))   // for the exercise counts in the contents
  const [name, anchor] = location.hash.slice(1).split('#').map(decodeURIComponent)
  const place = store.get('pl.guide.place')
  if (name) await go(name, anchor ?? '')
  else if (place && inGuide(place.name)) await go(place.name, '', { keepScroll: place.top })
  else await go(guide[0].name)
})().catch(e => { $('page').textContent = 'The guide couldn’t be loaded: ' + err(e) })
