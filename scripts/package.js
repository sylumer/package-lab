// Builds Package Lab.app in dist/ (for this Mac's architecture) with its icon, signed ad hoc so it runs on this Mac.
// With --install, also copies it to /Applications (replacing an older copy) and registers it with Finder, so
// Open With, `open -a "Package Lab"` and Alfred find it. See docs/developer-guide.md.
import { packager } from '@electron/packager'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DOCS } from '../src/docs.js'

const root = new URL('..', import.meta.url).pathname, build = join(root, 'build')
const electron = join(root, 'node_modules', '.bin', 'electron'), run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' })

// The icon: SVG, rendered by Electron, then every size macOS wants, then .icns.
if (!existsSync(join(build, 'icon.icns'))) {
  run(electron, [join(root, 'scripts', 'icon.cjs')])
  const set = join(build, 'icon.iconset')
  rmSync(set, { recursive: true, force: true }); mkdirSync(set)
  for (const s of [16, 32, 128, 256, 512]) {
    run('sips', ['-z', String(s), String(s), join(build, 'icon.png'), '--out', join(set, `icon_${s}x${s}.png`)])
    run('sips', ['-z', String(s * 2), String(s * 2), join(build, 'icon.png'), '--out', join(set, `icon_${s}x${s}@2x.png`)])
  }
  run('iconutil', ['-c', 'icns', set, '-o', join(build, 'icon.icns')])
  rmSync(set, { recursive: true, force: true })
}

// Drops dist, tests, scripts etc. and every .md file, except the docs shown in the app (docs/ itself and its packs/ folder stay as directories).
const kept = new Set(DOCS.map(d => '/docs/' + d.name)), keptDirs = new Set(['/docs', '/docs/packs'])
const ignore = p => kept.has(p) || keptDirs.has(p) ? false : /^\/(dist|test|docs|scripts|build|alfred)(\/|$)/.test(p) || /^\/\.git/.test(p) || /\.md$/.test(p)

const [out] = await packager({
  dir: root, out: join(root, 'dist'), overwrite: true, platform: 'darwin', arch: process.arch,
  name: 'Package Lab', executableName: 'Package Lab', appBundleId: 'com.sylumer.package-lab', appCategoryType: 'public.app-category.developer-tools',
  icon: join(build, 'icon.icns'), prune: true, asar: false,
  ignore,
  // Lets Finder offer Package Lab under Open With for .zip files, without making it the default.
  extendInfo: { CFBundleDocumentTypes: [{ CFBundleTypeName: 'ZIP archive', CFBundleTypeRole: 'Viewer', LSHandlerRank: 'Alternate', LSItemContentTypes: ['public.zip-archive'] }] },
})
const app = join(out, 'Package Lab.app')
run('codesign', ['--force', '--deep', '--sign', '-', app])
console.log(`Built ${app}`)

if (process.argv.includes('--install')) {
  try { execFileSync('osascript', ['-e', 'if application id "com.sylumer.package-lab" is running then tell application id "com.sylumer.package-lab" to quit']) } catch { /* not running */ }
  rmSync('/Applications/Package Lab.app', { recursive: true, force: true })
  run('ditto', [app, '/Applications/Package Lab.app'])
  run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', '/Applications/Package Lab.app'])
  console.log('Installed /Applications/Package Lab.app')
}
