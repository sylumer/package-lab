// Builds SCORM Lab.app in dist/ (for this Mac's architecture) with its icon, signed ad hoc so it runs on this Mac.
// With --install, also copies it to /Applications (replacing an older copy) and registers it with Finder, so
// Open With, `open -a "SCORM Lab"` and Alfred find it. See docs/developer-guide.md.
import { packager } from '@electron/packager'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

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

const [out] = await packager({
  dir: root, out: join(root, 'dist'), overwrite: true, platform: 'darwin', arch: process.arch,
  name: 'SCORM Lab', executableName: 'SCORM Lab', appBundleId: 'com.sylumer.scorm-lab', appCategoryType: 'public.app-category.developer-tools',
  icon: join(build, 'icon.icns'), prune: true, asar: false,
  ignore: [/^\/(dist|test|docs|scripts|build|alfred)(\/|$)/, /^\/\.git/, /\.md$/],
  // Lets Finder offer SCORM Lab under Open With for .zip files, without making it the default.
  extendInfo: { CFBundleDocumentTypes: [{ CFBundleTypeName: 'ZIP archive', CFBundleTypeRole: 'Viewer', LSHandlerRank: 'Alternate', LSItemContentTypes: ['public.zip-archive'] }] },
})
const app = join(out, 'SCORM Lab.app')
run('codesign', ['--force', '--deep', '--sign', '-', app])
console.log(`Built ${app}`)

if (process.argv.includes('--install')) {
  try { execFileSync('osascript', ['-e', 'if application id "com.sylumer.scorm-lab" is running then tell application id "com.sylumer.scorm-lab" to quit']) } catch { /* not running */ }
  rmSync('/Applications/SCORM Lab.app', { recursive: true, force: true })
  run('ditto', [app, '/Applications/SCORM Lab.app'])
  run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', '/Applications/SCORM Lab.app'])
  console.log('Installed /Applications/SCORM Lab.app')
}
