// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// The thread that checks packages for a batch (P4.3): a message { path, fragment } in, checkPackage's { row, fragment } out.
// See batch.js (staticRows).
import { parentPort } from 'node:worker_threads'
import { checkPackage } from './batch.js'

parentPort.on('message', ({ path, fragment }) => parentPort.postMessage(checkPackage(path, { fragment })))
