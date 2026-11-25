// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// Rule packs: findings that know particular authoring tools and wrappers. A pack is
//   { id, name, detect(analysis, files) → 0..1, staticRules(ctx) → findings, runRules(ctx, trace) → findings,
//     detectRun?(trace) → 0..1, notes, sources }
// A rule returns { sev, basis, title, detail, evidence, fix }; basis is 'pattern' (a known pattern, not confirmed here),
// 'package' (read in the package's files) or 'run' (seen in this run). finish() adds the pack's name to the title, says
// how sure the rule is, and keeps a 'pattern' rule at info. How to add a pack: docs/developer-guide.md.
import xyleme from './xyleme.js'
import storyline from './storyline.js'
import rise from './rise.js'
import captivate from './captivate.js'
import ispring from './ispring.js'
import lectora from './lectora.js'
import adapt from './adapt.js'
import dominknow from './dominknow.js'
import evolve from './evolve.js'
import scormdriver from './scormdriver.js'
import pipwerks from './pipwerks.js'
import { BASIS } from './util.js'

export const PACKS = [xyleme, storyline, rise, captivate, ispring, lectora, adapt, dominknow, evolve, pipwerks, scormdriver]

// [{ id, name, confidence }] for the packs that recognise the package.
// tool: a pack id the person chose; that pack is included whether or not it recognises the package (chosen: true).
export function detectPacks(a, files, tool = null) {
  const out = []
  for (const p of PACKS) {
    let confidence = 0
    try { confidence = p.detect(a, files) || 0 } catch { /* a pack's detect must never break an analysis */ }
    if (confidence > 0 || p.id === tool) out.push({ id: p.id, name: p.name, confidence: p.id === tool ? 1 : confidence, ...(p.id === tool && { chosen: true }) })
  }
  return out
}

function finish(pack, f, chosen) {
  const basis = f.basis ?? 'pattern', { basis: _, ...rest } = f
  return { ...rest, sev: basis === 'pattern' ? 'info' : f.sev, title: `${pack.name}: ${f.title}`, detail: [f.detail, BASIS[basis], chosen && 'Pack chosen by you (Authoring tool setting), whether or not the package shows it.'].filter(Boolean).join(' '),
    evidence: f.evidence ?? [], fix: f.fix ?? '', pack: pack.id, basis }
}
const guard = (pack, fn, chosen) => { try { return fn().map(f => finish(pack, f, chosen)) } catch { return [] } }   // a pack must never break an analysis

// Static findings of the detected packs. detected: detectPacks()'s result.
export function packStatic(a, files, detected = a.packs ?? []) {
  return detected.flatMap(d => { const p = PACKS.find(x => x.id === d.id); return p ? guard(p, () => p.staticRules({ analysis: a, files, confidence: d.confidence, detected }), d.chosen) : [] })
}
// Run findings: packs the analysis detected, and those whose detectRun recognises the trace.
export function packRun(a, trace, launch = {}) {
  if (launch.kind !== 'package') return []
  const detected = [...(a?.packs ?? [])], tool = launch.options?.tool
  if (tool && !detected.some(d => d.id === tool)) detected.push({ id: tool, name: tool, confidence: 1, chosen: true })
  for (const p of PACKS) if (!detected.some(d => d.id === p.id)) { let c = 0; try { c = p.detectRun?.(trace) ?? 0 } catch { /* skipped */ }; if (c > 0) detected.push({ id: p.id, name: p.name, confidence: c }) }
  return detected.flatMap(d => { const p = PACKS.find(x => x.id === d.id); return p?.runRules ? guard(p, () => p.runRules({ analysis: a ?? {}, launch, confidence: d.confidence, detected }, trace), d.chosen) : [] })
}
