// Autofixes (P3.1): the mechanical corrections a package can have, and the export of a corrected copy. A finding that a
// fix addresses carries `autofix: { id, params }` (plain data, see rules.js); the functions live here. Each fix is
// apply(files Map, params) → { files: new Map, changes: [string] } and does nothing (no changes) when there is nothing
// to fix, so every fix can run on every package. Pure: no files are read or written here.
import { analyze, pkgPath } from './analyze.js'
import { bootGraph, resolveRef } from './bootpath.js'
import { staticFindings, sortFindings } from './rules.js'
import { overlayFiles } from './overlay.js'
import { named, textOf, SCRIPTY, SERVER_PLAYER } from './packs/util.js'
import { zip } from './zip.js'

const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
const MANIFEST = /(^|\/)imsmanifest\.xml$/i
const manifestName = files => [...files.keys()].filter(n => MANIFEST.test(n)).sort((a, b) => a.split('/').length - b.split('/').length)[0]
const launchPaths = a => [...new Set((a.manifest?.items ?? []).map(i => i.res?.path).filter(Boolean))]
const dec = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
// The text of a file, or null (with a note) when it isn't valid UTF-8: such a file is left alone rather than damaged.
function getText(files, name, notes) {
  try { return dec.decode(files.get(name)) } catch { const msg = `Left ${name} alone: it isn’t valid UTF-8 text, so it can’t be edited safely.`; notes?.add ? notes.add(msg) : notes?.push(msg); return null }
}
const setText = (files, name, text) => files.set(name, Buffer.from(text, 'utf8'))
const lowerMap = files => new Map([...files.keys()].map(n => [n.toLowerCase(), n]))
// Replace a reference wherever it appears as a quoted string (an attribute or a string in script); the count.
function swapQuoted(files, name, from, to, notes) {
  let n = 0, text = getText(files, name, notes)
  if (text == null) return 0
  for (const q of ['"', "'", '`']) { const parts = text.split(q + from + q); n += parts.length - 1; text = parts.join(q + to + q) }
  if (n) setText(files, name, text)
  return n
}
const RESOURCE = /<resource\b(?:[^>]*\/>|[\s\S]*?<\/resource>)/g
// The manifest's <resource> blocks by identifier.
const blocksById = text => new Map((text.match(RESOURCE) ?? []).map(b => [/\bidentifier\s*=\s*(["'])(.*?)\1/.exec(b)?.[2], b]).reverse())

// ---- manifest-case, manifest-not-root ----
function manifestCase(files) {
  const a = analyze(files), name = manifestName(files), want = (a.root ?? '') + 'imsmanifest.xml'
  if (!name || name === want) return { files, changes: [] }
  if (files.has(want)) return { files, changes: [], notes: [`Left ${name} alone: the package already has a ${want}.`] }
  const out = new Map([...files].map(([k, v]) => [k === name ? want : k, v]))
  return { files: out, changes: [`Renamed ${name} to ${want}.`] }
}
function manifestRoot(files) {
  const a = analyze(files), root = a.root ?? ''
  if (!root || !files.has(root + 'imsmanifest.xml')) return { files, changes: [] }
  const out = new Map(), outside = []
  for (const [k, v] of files) {
    if (!k.startsWith(root)) { outside.push(k); continue }
    const n = k.slice(root.length)
    if (files.has(n)) return { files, changes: [], notes: [`Left the folder ${root} alone: moving its files up would replace ${n}.`] }
    out.set(n, v)
  }
  for (const k of outside) out.set(k, files.get(k))
  return { files: out, changes: [`Moved the files out of the folder ${root} to the top of the ZIP (${out.size - outside.length} files).${outside.length ? ` ${outside.length} files that were already outside it stay where they were.` : ''}`] }
}

// ---- file-missing ----
function fileMissing(files) {
  const a = analyze(files), name = manifestName(files)
  if (!a.manifest || !name) return { files, changes: [] }
  const notes = [], changes = [], lower = lowerMap(files)
  let text = getText(files, name, notes)
  if (text == null) return { files, changes, notes }
  const blocks = blocksById(text)
  a.manifest.resources.forEach(r => {
    if (!blocks.has(r.id)) return
    const orig = blocks.get(r.id)
    let block = orig
    block = block.replace(/[ \t]*<file\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*?(?:\/>|>[\s\S]*?<\/file>)[ \t]*\r?\n?/g, (whole, q, href) => {
      const p = pkgPath(r.base, href.replace(/&amp;/g, '&'))
      if (p == null || files.has(p) || lower.has(p.toLowerCase())) return whole
      changes.push(`Removed <file href="${href}"> from resource ${r.id}: the package has no ${p}.`)
      return ''
    })
    text = text.replace(orig, () => block)
  })
  if (!changes.length) return { files, changes, notes }
  const out = new Map(files); setText(out, name, text)
  return { files: out, changes, notes }
}

// ---- manifest-version ----
const NS = { '1.2': { def: 'http://www.imsproject.org/xsd/imscp_rootv1p1p2', adlcp: 'http://www.adlnet.org/xsd/adlcp_rootv1p2', version: '1.2' },
  '2004': { def: 'http://www.imsglobal.org/xsd/imscp_v1p1', adlcp: 'http://www.adlnet.org/xsd/adlcp_v1p3', version: '2004 4th Edition' } }
const NS2004 = { adlseq: 'http://www.adlnet.org/xsd/adlseq_v1p3', adlnav: 'http://www.adlnet.org/xsd/adlnav_v1p3', imsss: 'http://www.imsglobal.org/xsd/imsss' }
function manifestVersion(files, params = {}) {
  const a = analyze(files), name = manifestName(files), m = a.manifest, to = params.to ?? a.apiUse
  if (!m || !name || !NS[to] || to === m.version) return { files, changes: [], notes: [] }
  if (a.apiUse !== to) return { files, changes: [], notes: [] }   // only when the scripts use that API
  const ns = NS[to], changes = [], notes = []
  let text = getText(files, name, notes)
  const rootTag = text && /<manifest\b[^>]*>/i.exec(text)
  if (!rootTag) return { files, changes: [], notes }
  let tag = rootTag[0]
  tag = tag.replace(/(\sxmlns\s*=\s*)(["'])[^"']*\2/, `$1"${ns.def}"`)
  tag = /\sxmlns:adlcp\s*=/.test(tag) ? tag.replace(/(\sxmlns:adlcp\s*=\s*)(["'])[^"']*\2/, `$1"${ns.adlcp}"`) : tag.replace(/>$/, ` xmlns:adlcp="${ns.adlcp}">`)
  if (/\sxsi:schemaLocation\s*=/.test(tag)) { tag = tag.replace(/\s+xsi:schemaLocation\s*=\s*("[^"]*"|'[^']*')/, ''); changes.push('Removed xsi:schemaLocation from <manifest>: it named the other version’s schema files.') }
  const body = text.slice(rootTag.index + rootTag[0].length)
  for (const [p, uri] of Object.entries(NS2004)) {
    if (to === '2004' && !new RegExp(`\\sxmlns:${p}\\s*=`).test(tag)) tag = tag.replace(/>$/, ` xmlns:${p}="${uri}">`)
    if (to === '1.2' && !new RegExp(`[<\\s/]${p}:`).test(body)) tag = tag.replace(new RegExp(`\\s+xmlns:${p}\\s*=\\s*("[^"]*"|'[^']*')`), '')
  }
  text = text.slice(0, rootTag.index) + tag + body
  if (/<schemaversion\b[^>]*>/i.test(text)) text = text.replace(/(<schemaversion\b[^>]*>)[\s\S]*?(<\/schemaversion>)/i, `$1${ns.version}$2`)
  else if (/<\/schema>/i.test(text)) text = text.replace(/<\/schema>/i, `</schema>\n    <schemaversion>${ns.version}</schemaversion>`)
  else notes.push('The manifest has no <schema> element, so <schemaversion> was not added.')
  // Names that differ in case between the two versions' adlcp elements.
  text = to === '2004' ? text.replace(/\b(\w+:)scormtype(?==)/gi, '$1scormType').replace(/(<\/?\w+:)datafromlms\b/gi, '$1dataFromLMS')
    : text.replace(/\b(\w+:)scormType(?==)/g, '$1scormtype').replace(/(<\/?\w+:)dataFromLMS\b/g, '$1datafromlms')
  if (to === '2004' && /<\w+:masteryscore\b/i.test(text)) notes.push('The mastery score (adlcp:masteryscore) is a SCORM 1.2 element and was not converted: SCORM 2004 sets it in sequencing.')
  changes.unshift(`${name}: <schemaversion> ${m.schemaversion || '(none)'} → ${ns.version}; namespaces set for SCORM ${to === '1.2' ? '1.2' : '2004 4th Edition'}, to match the SCORM ${to} API the scripts use.`)
  const out = new Map(files); setText(out, name, text)
  return { files: out, changes, notes }
}

// ---- case ----
// The reference with its path segments spelled as `actual`, or null if that wouldn't resolve to it.
function recase(dir, ref, actual) {
  const m = /^([^?#]*)([\s\S]*)$/.exec(ref), segs = m[1].split('/'), want = actual.split('/')
  let k = want.length
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i] === '' || segs[i] === '.' || segs[i] === '..') continue
    if (!k) return null
    const w = want[--k]
    segs[i] = segs[i].includes('%') ? encodeURIComponent(w) : w
  }
  const fixed = segs.join('/') + m[2]
  return resolveRef(dir, fixed)?.path === actual ? fixed : null
}
function fixCase(files) {
  let cur = new Map(files); const changes = [], notes = new Set()
  for (let round = 0; round < 6; round++) {
    const a = analyze(cur), lower = lowerMap(cur), name = manifestName(cur), edits = [], renames = new Map()
    // The manifest's own references (launch pages, file lists).
    if (a.manifest && name) {
      const mt = getText(cur, name, notes), blocks = mt == null ? new Map() : blocksById(mt)
      a.manifest.resources.forEach(r => {
        for (const m of (blocks.get(r.id) ?? '').matchAll(/\bhref\s*=\s*(["'])(.*?)\1/g)) {
          const p = pkgPath(r.base, m[2]), actual = p != null && !cur.has(p) && lower.get(p.toLowerCase()), fixed = actual && recase(r.base, m[2], actual)
          if (fixed && fixed !== m[2]) edits.push({ file: name, ref: m[2], fixed, actual })
        }
      })
    }
    // References inside pages and scripts, as the boot graph finds them.
    const nodes = launchPaths(a).flatMap(p => bootGraph(cur, p).nodes).filter(n => n.how !== 'launch')
    const byActual = Map.groupBy(nodes.filter(n => n.status === 'case'), n => n.actual)
    for (const [actual, list] of byActual) {
      const spellings = new Set(list.map(n => n.path)), okUsed = nodes.some(n => n.status === 'ok' && n.path === actual)
      const only = [...spellings][0]
      if (!okUsed && spellings.size === 1 && dirOf(only) === dirOf(actual) && !cur.has(only)) { renames.set(actual, only); continue }
      for (const n of list) {
        const from = n.from && (cur.has(n.from) ? n.from : lower.get(n.from.toLowerCase()))
        if (!from) continue
        const dir = n.how === 'import' || n.how === 'worker' || n.docDir == null ? dirOf(from) : n.docDir, fixed = recase(dir, n.ref, actual)
        if (fixed && fixed !== n.ref) edits.push({ file: from, ref: n.ref, fixed, actual })
      }
    }
    let did = false
    for (const e of new Map(edits.map(e => [`${e.file}\0${e.ref}`, e])).values()) {
      if (swapQuoted(cur, e.file, e.ref, e.fixed, notes)) { did = true; changes.push(`In ${e.file}, changed ${e.ref} to ${e.fixed}, to match the capitals of ${e.actual}.`) }
    }
    for (const [from, to] of renames) {
      cur = new Map([...cur].map(([k, v]) => [k === from ? to : k, v])); did = true
      changes.push(`Renamed ${from} to ${to}: every reference in the package spells it that way, so the file was changed, not the references.`)
    }
    if (!did) break
  }
  return { files: cur, changes, notes: [...notes] }
}

// ---- http-to-https ----
function httpToHttps(files) {
  let cur = new Map(files); const changes = [], notes = new Set()
  for (let round = 0; round < 4; round++) {
    const a = analyze(cur), lower = lowerMap(cur), seen = new Set()
    let did = false
    for (const p of launchPaths(a)) for (const n of bootGraph(cur, p).nodes) {
      if (n.status !== 'remote-http' || !['script', 'style', 'page'].includes(n.kind) || n.how === 'literal') continue
      for (const f of [n.from, ...(n.also ?? []).map(x => x.from)]) {
        const file = f && (cur.has(f) ? f : lower.get(f.toLowerCase())), key = `${file}\0${n.ref}`
        if (!file || seen.has(key)) continue
        seen.add(key)
        const to = n.ref.replace(/^http:/i, 'https:')
        if (swapQuoted(cur, file, n.ref, to, notes)) { did = true; changes.push(`In ${file}, changed ${n.ref} to ${to}. Check that the site serves it over https.`) }
      }
    }
    if (!did) break
  }
  return { files: cur, changes, notes: [...notes] }
}

// ---- xyleme-player-type ----
// Only the assignment goes, so line numbers stay put. document.domain is left alone: it is a separate finding.
function xylemePlayerType(files) {
  const out = new Map(files), changes = [], notes = new Set()
  for (const f of named(files, SCRIPTY)) {
    if (!SERVER_PLAYER.test(textOf(files, f))) { SERVER_PLAYER.lastIndex = 0; continue }
    SERVER_PLAYER.lastIndex = 0
    const text = getText(out, f, notes)
    if (text == null) continue
    setText(out, f, text.replace(SERVER_PLAYER, () => { changes.push(`Removed the PLAYER_TYPE = 'Server-side' line from ${f}, so the player no longer waits for Xyleme’s server.`); return '' }))
  }
  return { files: changes.length ? out : files, changes, notes: [...notes] }
}

// The fixes in the order they run: the layout of the ZIP first, then the manifest, then the references.
export const FIXES = {
  'manifest-case': { label: 'Rename the manifest to imsmanifest.xml', apply: manifestCase },
  'manifest-not-root': { label: 'Move the package’s files to the top of the ZIP', apply: manifestRoot },
  'file-missing': { label: 'Remove manifest file entries for files that aren’t in the package', apply: fileMissing },
  'manifest-version': { label: 'Make the manifest’s SCORM version match the API the scripts use', apply: manifestVersion },
  case: { label: 'Make references match the capitals of the files', apply: fixCase },
  'http-to-https': { label: 'Load scripts, styles and frames over https', apply: httpToHttps },
  'xyleme-player-type': { label: 'Remove Xyleme’s server-side player setting', apply: xylemePlayerType },
}
export const FIX_IDS = Object.keys(FIXES)

// The findings of a package without running it: what the interfaces list before a run (first SCO's boot graph).
export function staticAll(files) {
  const a = analyze(files), items = a.manifest?.items ?? [], it = items.find(i => i.type === 'sco' && i.res?.path) ?? items.find(i => i.res?.path)
  return sortFindings([...staticFindings(a), ...(it ? bootGraph(files, it.res.path).risks : [])])
}
// Which findings are gone, still there, or new, by title.
export function prove(before, after) {
  const b = staticAll(before).map(f => f.title), a = staticAll(after).map(f => f.title)
  return { before: b.length, after: a.length, gone: b.filter(t => !a.includes(t)), remaining: b.filter(t => a.includes(t)), added: a.filter(t => !b.includes(t)) }
}

// The fixes the findings name (their autofix ids), in running order: [{ id, label }].
export const applicable = findings => FIX_IDS.filter(id => findings.some(f => f.autofix?.id === id)).map(id => ({ id, label: FIXES[id].label }))

export function parseOnly(only) {
  if (only == null) return null
  const ids = (Array.isArray(only) ? only : String(only).split(',')).map(s => String(s).trim()).filter(Boolean)
  const bad = ids.find(i => !Object.hasOwn(FIXES, i))
  if (bad !== undefined) throw new Error(`No autofix “${bad}”. The fixes are: ${FIX_IDS.join(', ')}.`)
  if (!ids.length && !Array.isArray(only)) throw new Error(`--only needs fix ids: ${FIX_IDS.join(', ')}.`)
  return ids
}

// The corrected package: the overrides on top of the package, then the selected fixes in order. Returns
// { files, applied: [{ id, label, changes }], notes: [{ id, label, notes }] (what a fix left alone, and why), overridden: [path], proof } (files has no change list yet).
export function correct(files, { only, overrides = {} } = {}) {
  const ids = parseOnly(only) ?? FIX_IDS, applied = [], notes = []
  let cur = overlayFiles(files, overrides)
  if (cur === files) cur = new Map(files)
  for (const id of FIX_IDS.filter(i => ids.includes(i))) {
    const r = FIXES[id].apply(cur)
    cur = r.files
    if (r.changes.length) applied.push({ id, label: FIXES[id].label, changes: r.changes })
    if (r.notes?.length) notes.push({ id, label: FIXES[id].label, notes: r.notes })
  }
  return { files: cur, applied, notes, overridden: Object.keys(overrides), proof: prove(files, cur) }
}

export const changesText = (c, version, name = 'the package') => [
  `SCORM Lab ${version}: changes made to ${name}`, '',
  ...(c.applied.length || c.overridden.length ? [] : ['No changes.', '']),
  ...(c.overridden.length ? ['Changed files (from the Files tab or --override):', ...c.overridden.map(p => `  - ${p}`), ''] : []),
  ...c.applied.flatMap(f => [`${f.label} [${f.id}]`, ...f.changes.map(x => `  - ${x}`), '']),
  ...(c.notes.length ? ['Not done:', ...c.notes.flatMap(f => f.notes.map(x => `  - ${x}`)), ''] : []),
  'Findings the changes cleared:', ...(c.proof.gone.length ? c.proof.gone.map(t => `  - ${t}`) : ['  (none)']),
  ...(c.proof.added.length ? ['', 'Findings that are new or have changed wording:', ...c.proof.added.map(t => `  - ${t}`)] : []),
  '', `Findings still there: ${c.proof.remaining.length}. Run SCORM Lab on this package to see them.`, '',
  'The original package was not changed. Check the corrected package in your LMS before relying on it.', ''].join('\n')

// The finished export: { zip: Buffer | null (nothing changed), ...correct() }.
export function exportFixed(files, { version = '', name, ...opts } = {}) {
  const c = correct(files, opts)
  if (!c.applied.length && !c.overridden.length) return { ...c, zip: null }
  const out = new Map(c.files)
  out.set('SCORM-LAB-CHANGES.txt', Buffer.from(changesText(c, version, name), 'utf8'))
  return { ...c, zip: zip(out) }
}
export const fixedName = name => `${String(name || 'package').replace(/\.zip$/i, '')}-fixed.zip`
