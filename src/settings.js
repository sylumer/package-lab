// Settings kept on disk (<data folder>/settings.json), shared by the desktop app, the CLI and Alfred. Plain Node.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const DEFAULT_PORT = 4880
export const validPort = n => Number.isInteger(n) && n >= 1024 && n <= 65535

// A missing file, unreadable JSON or an invalid value gives the default.
export function readSettings(dir) {
  let s = {}; try { s = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) ?? {} } catch { /* defaults */ }
  return { port: validPort(s.port) ? s.port : DEFAULT_PORT }
}

export function writeSettings(dir, patch) {
  if (patch.port !== undefined && !validPort(patch.port)) throw new Error('The port must be a whole number from 1024 to 65535.')
  const s = { ...readSettings(dir), ...patch }
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(s, null, 2) + '\n')
  return s
}
