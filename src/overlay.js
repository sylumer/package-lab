// Overrides: files of a package replaced for one run. Pure: building the file set a run is served from, and the
// findings that say a run used changed files and whether the change helped. options.files is
// { path: { content } | { base64 } } (see options.js); the original package is never changed.
import { progress } from './milestones.js'

const dec = new TextDecoder('utf-8', { fatal: true })
// Text that can be edited: valid UTF-8 with no NUL bytes.
export function isText(buf) {
  if (buf.includes(0)) return false
  try { dec.decode(buf); return true } catch { return false }
}
export const entryBuffer = e => Buffer.from(e.content ?? e.base64, e.content !== undefined ? 'utf8' : 'base64')
export const entryFor = buf => isText(buf) ? { content: buf.toString('utf8') } : { base64: buf.toString('base64') }

// The files a run is served from: the package's, with the overrides on top (added paths too).
export function overlayFiles(files, overrides = {}) {
  const keys = Object.keys(overrides)
  if (!keys.length) return files
  const out = new Map(files)
  for (const k of keys) out.set(k, entryBuffer(overrides[k]))
  return out
}

const kb = n => n < 1024 ? `${n} bytes` : `${(n / 1024).toFixed(1)} KB`
// What the interfaces list: [{ path, size, binary, added }].
export const overrideList = (files, overrides = {}) => Object.entries(overrides).map(([path, e]) => {
  const buf = entryBuffer(e)
  return { path, size: buf.length, binary: e.base64 !== undefined, added: !files.has(path) }
})

// The note at the top of a run that used overrides (null when it used none).
export function overrideFinding(overrides = {}) {
  const paths = Object.keys(overrides)
  if (!paths.length) return null
  return { sev: 'info', title: `This run used ${paths.length} changed file${paths.length === 1 ? '' : 's'}: ${paths.slice(0, 5).join(', ')}${paths.length > 5 ? ', …' : ''}`,
    detail: 'These files were replaced inside SCORM Lab for this run. The package on disk is unchanged, so everything below describes the changed copy, not the original.',
    evidence: paths.map(p => `${p}: ${overrides[p].base64 !== undefined ? 'replaced file' : 'changed text'}, ${kb(entryBuffer(overrides[p]).length)}`),
    fix: 'To see the original again, run without the changes: revert them in the Files tab, or leave out --override.' }
}

// Did the change help? before and after are { milestones, counts } of the runs without and with the overrides.
export function overrideProgressFinding(before, after) {
  const p = progress(before, after)
  return { sev: p.better < 0 ? 'warn' : 'info', title: `Compared with the run before the changes: ${p.summary}`,
    detail: p.better > 0 ? 'The changed files made a difference, so the problem is in those files (or in what they load).'
      : p.better < 0 ? 'The change made things worse. Revert it, or look at what it broke.' : 'The change did not move the run along the SCORM path.',
    evidence: p.steps.filter(s => s.a !== s.b).map(s => `${s.label}: ${s.a ? 'reached' : 'not reached'} before, ${s.b ? 'reached' : 'not reached'} now`),
    fix: p.better > 0 ? 'Make the same change in the course’s source and publish it again.' : '' }
}
