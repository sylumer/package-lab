// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// npm run practice [folder]: builds the User Guide's practice packages (src/practice.js) into ./practice, or the folder given.
import { resolve } from 'node:path'
import { buildKit } from '../src/practice.js'

const out = resolve(process.argv[2] ?? 'practice'), files = buildKit(out)
console.log(`${files.filter(f => f.endsWith('.zip')).length} practice packages and ${files.filter(f => f.endsWith('.json')).length} macros in ${out}`)
