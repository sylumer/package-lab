// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// The thread that does the slow parts of a code view (P4.1): formatting and decoding a source map. Messages: { id, op: 'format', text, kind }
// or { id, op: 'map', json }; the reply is { id, r } or { id, error }. See codeview.js (codeViewAsync).
import { parentPort } from 'node:worker_threads'
import { format } from './format.js'
import { parseMapUncached } from './sourcemap.js'

parentPort.on('message', ({ id, op, text, kind, json }) => {
  try {
    const r = op === 'format' ? format(text, kind) : parseMapUncached(json)
    if (r?.error) parentPort.postMessage({ id, error: r.error })
    else parentPort.postMessage({ id, r })
  } catch (e) { parentPort.postMessage({ id, error: String(e.message) }) }
})
