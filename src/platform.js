// Where things live on each platform. Pure: everything comes in as an argument, so the Mac can test the Windows answers.
// The only file besides the darwin-only scripts that may name /Applications or Library/Application Support (test/test.js lints this).
import { posix, win32 } from 'node:path'

const NAME = 'Package Lab'
const pathFor = platform => platform === 'win32' ? win32 : posix

// The folder Electron uses for app.getPath('userData') with the app name "Package Lab". PACKAGE_LAB_DATA is read by the callers.
export function dataDir(platform, env, home) {
  const p = pathFor(platform)
  if (platform === 'darwin') return p.join(home, 'Library', 'Application Support', NAME)
  if (platform === 'win32') return p.join(env.APPDATA || p.join(home, 'AppData', 'Roaming'), NAME)
  return p.join(env.XDG_CONFIG_HOME || p.join(home, '.config'), NAME)
}

// Where to look for the installed app, in order: PACKAGE_LAB_APP (a portable copy), then the usual places, then the unpacked
// build in appDir/dist. On a Mac these are .app bundles; elsewhere, the program itself (see executable).
export function appBinaries(platform, env, home, appDir = '', arch = 'x64') {
  const p = pathFor(platform), dist = os => p.join(appDir, 'dist', `${NAME}-${os}-${arch}`)
  const found = platform === 'darwin' ? ['/Applications/Package Lab.app', p.join(home, 'Applications', 'Package Lab.app')]   // darwin-only
    : platform === 'win32' ? [p.join(env.LOCALAPPDATA || p.join(home, 'AppData', 'Local'), 'Programs', NAME, `${NAME}.exe`), p.join(dist('win32'), `${NAME}.exe`)]
    : [p.join(dist('linux'), NAME)]
  const own = String(env.PACKAGE_LAB_APP ?? '').replace(/[\\/]+$/, '')   // a trailing slash on a .app would hide the .app test in executable
  return [...(own ? [own] : []), ...found]
}

// The program to start inside one of those: a Mac bundle's executable, or the file itself.
export const executable = (platform, app) => platform === 'darwin' && app.endsWith('.app') ? posix.join(app, 'Contents', 'MacOS', NAME) : app   // darwin-only

// What `doctor` says when no app is installed: where the app is installed from.
export const installHint = platform => platform === 'darwin' ? 'npm run install-app puts it in /Applications.' : 'put a copy of the app somewhere and set PACKAGE_LAB_APP to it.'   // darwin-only

// The command that shows a file in its usual program (the report, with --open): [command, args].
export const openCommand = (platform, target) => platform === 'darwin' ? ['open', [target]] : platform === 'win32' ? ['explorer.exe', [target]] : ['xdg-open', [target]]
