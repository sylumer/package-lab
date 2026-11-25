// SPDX-License-Identifier: AGPL-3.0-only. Copyright (C) 2026 Stephen Millard. Additional terms apply: see LINEAGE-AND-ATTRIBUTION.md.
// Settings kept on disk (<data folder>/settings.json), shared by the desktop app, the CLI and Alfred. Plain Node.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const DEFAULT_PORT = 4880
export const validPort = n => Number.isInteger(n) && n >= 1024 && n <= 65535
export const THEMES = ['system', 'light', 'dark']   // the app's appearance (E3.4)
export const validTheme = t => THEMES.includes(t)

// A missing file, unreadable JSON or an invalid value gives the default.
export function readSettings(dir) {
  let s = {}; try { s = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) ?? {} } catch { /* defaults */ }
  return { port: validPort(s.port) ? s.port : DEFAULT_PORT, theme: validTheme(s.theme) ? s.theme : 'system' }
}

export function writeSettings(dir, patch) {
  if (patch.port !== undefined && !validPort(patch.port)) throw new Error('The port must be a whole number from 1024 to 65535.')
  if (patch.theme !== undefined && !validTheme(patch.theme)) throw new Error('The appearance must be system, light or dark.')
  const s = { ...readSettings(dir), ...patch }
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(s, null, 2) + '\n')
  return s
}
