// Experiments: one launch run several ways, and a table of how far each way got. Pure: planning the variants,
// summarising results, and the findings that turn a hypothesis into a fact. Running them is up to the caller
// (bin/package-lab.js headless, src/main.js in the apps).
import { normaliseOptions } from './options.js'
import { furthest, progress, runCounts } from './milestones.js'
import { verdict } from './report.js'
import { PROFILE_NAMES, storageMode } from './profiles.js'

const api = ['manifest', 'both', '1.2', '2004', 'none'].map(v => ({ name: `api ${v}`, patch: { expose: v } }))
const frames = [...[0, 1, 2, 3].map(n => ({ name: `depth ${n}`, patch: { depth: n } })), { name: 'new window', patch: { opener: true } }]
const union = (...lists) => { const seen = new Set(); return lists.flat().filter(v => { const k = JSON.stringify(v.patch); return !seen.has(k) && seen.add(k) }) }
// lms: one variant per LMS profile (P2.1). storage: normal and blocked (P2.2; the one the default already is is left out). browsers (P2.3): Chromium and WebKit.
const lms = PROFILE_NAMES.map(n => ({ name: `lms ${n}`, patch: { profile: n } }))
const storage = ['normal', 'blocked'].map(v => ({ name: `storage ${v}`, patch: { storage: v } }))
const browsers = ['chromium', 'webkit'].map(v => ({ name: `browser ${v}`, patch: { browser: v } }))
export const PRESETS = { api, frames, standard: union(api, frames), lms, storage, browsers }

// { base: options, variants: [{ name, patch }] } → [{ name, options }], the base first as “default”. A variant that
// ends up with the same options as an earlier one is left out, unless dedupe is false (variants the user wrote).
export function planVariants({ base, variants = [], dedupe = true }) {
  if (!Array.isArray(variants)) throw new Error('Variants must be a list of { name, patch }.')
  const plan = [{ name: 'default', options: normaliseOptions(base) }], same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  for (const [i, v] of variants.entries()) {
    if (!v || typeof v.name !== 'string' || !v.name || (v.patch !== undefined && (typeof v.patch !== 'object' || !v.patch || Array.isArray(v.patch)))) throw new Error(`Variant ${i + 1} needs a name and a patch object, like { "name": "deep", "patch": { "depth": 2 } }.`)
    if (v.name === 'default' || variants.findIndex(x => x?.name === v.name) !== i) throw new Error(`Variant name “${v.name}” is used twice (or is “default”, which is the base).`)
    let options
    try { options = normaliseOptions({ ...plan[0].options, ...v.patch }) } catch (e) { throw new Error(`Variant “${v.name}”: ${e.message}`) }
    if (!dedupe || !plan.some(p => same(p.options, options))) plan.push({ name: v.name, options })
  }
  return plan
}

// What an experiment keeps of one finished run (a saved-run object).
export const runResult = (name, options, run, extra = {}) =>
  ({ name, options, milestones: run.milestones, counts: runCounts(run.trace), errors: run.findings.filter(f => f.sev === 'error').length, verdict: verdict(run.findings),
    storageRefused: (run.trace?.probe ?? []).some(p => p.type === 'storage-blocked'), ...extra })

// One row per result; results[0] is the base. progress is against the base.
export function summarise(results) {
  return results.map((r, i) => {
    const p = i ? progress(results[0], r) : null, f = furthest(r.milestones)
    return { name: r.name, furthest: f?.id ?? null, furthestLabel: f?.label ?? 'nothing', apiCalls: r.counts.apiCalls, errors: r.errors, verdict: r.verdict,
      progress: p ? p.summary : 'the default', better: p ? p.better : 0, ...(r.runId !== undefined && { runId: r.runId }) }
  })
}

const settingsDiff = (a, b) => Object.keys(b).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(k => `${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`)

export function experimentFindings(results) {
  const [base, ...rest] = results, out = []
  if (!base) return out
  for (const r of rest) {
    if (!/^got further/.test(progress(base, r).summary)) continue  // a tie on the furthest step isn't “further”
    out.push({ sev: 'warn', title: `${r.name} gets further than the default: reached ${furthest(r.milestones)?.label ?? 'nothing'}`,
      detail: `With the default settings the run got as far as “${furthest(base.milestones)?.label ?? 'nothing'}”. Changing the settings below got it further, so they matter.`,
      evidence: settingsDiff(base.options, r.options), fix: 'Check what the real LMS offers for these settings, or what the content assumes about them.' })
  }
  // Storage blocked (P2.2): a variant with it blocked that gets less far than the default, which doesn't.
  for (const r of rest) {
    if (storageMode(r.options) !== 'blocked' || storageMode(base.options) === 'blocked') continue
    const p = progress(base, r)
    if (p.better >= 0) continue
    // A variant that blocks storage and changes other settings too (an LMS profile that blocks cookies) can fail for one of
    // those. Blame storage only when the run had storage refused, or when storage is all that changed. storageRefused is
    // undefined for results saved before it existed: those keep the old reading.
    const diff = settingsDiff(base.options, r.options), onlyStorage = diff.every(d => /^storage:/.test(d))
    if (r.storageRefused === false && !onlyStorage) {
      out.push({ sev: 'warn', title: `${r.name} gets less far than the default: ${p.summary.replace(/^got less far: /, '')}`,
        detail: `With the default settings the run got as far as “${furthest(base.milestones)?.label ?? 'nothing'}”. This variant blocks storage, but the content never used any, so one of the other settings below is the cause.`,
        evidence: [...p.steps.filter(s => s.a && !s.b).map(s => `Not reached: ${s.label}`), ...diff],
        fix: 'Change the settings below one at a time to find the one that matters.' })
      continue
    }
    out.push({ sev: 'warn', title: 'With storage blocked, the content gets less far',
      detail: `With storage normal the run got as far as “${furthest(base.milestones)?.label ?? 'nothing'}”. With it blocked, as Safari does for content inside another site’s page, it ${p.summary}.`,
      evidence: [...p.steps.filter(s => s.a && !s.b).map(s => `Not reached with storage blocked: ${s.label}`), ...settingsDiff(base.options, r.options)],
      fix: 'Look at the “The content needs storage the browser can block” finding of the blocked run for where the content uses storage, and keep its state in the LMS instead.' })
  }
  if (!out.length) out.push({ sev: 'info', title: 'Nothing tried made a difference', detail: `None of the ${rest.length} variants got further than the default.`, evidence: [], fix: '' })
  return out
}
