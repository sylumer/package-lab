// Builds Package Lab.app in dist/ (for this Mac's architecture) with its icon, signed ad hoc so it runs on this Mac.
// With --platform win32 (and --arch x64 or arm64) it builds the portable Windows app instead: dist/Package Lab-win32-<arch>/ and a zip of it, see docs/windows.md.
// With --install, also copies it to /Applications (replacing an older copy) and registers it with Finder, so // darwin-only
// Open With, `open -a "Package Lab"` and Alfred find it. See docs/developer-guide.md.
import { packager } from '@electron/packager'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOCS } from '../src/docs.js'
import { zip } from '../src/zip.js'

const root = fileURLToPath(new URL('..', import.meta.url)), build = join(root, 'build')
const electron = join(root, 'node_modules', '.bin', 'electron'), run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' })

const option = name => { const i = process.argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`)), a = process.argv[i]; if (i < 0) return undefined; const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : process.argv[i + 1]; if (!v || v.startsWith('--')) throw new Error(`--${name} needs a value.`); return v }
const platform = option('platform') ?? 'darwin', arch = option('arch') ?? process.arch
if (platform !== 'darwin' && process.argv.includes('--install')) throw new Error('--install is for the Mac build only.')
if (!['darwin', 'win32'].includes(platform)) throw new Error(`--platform is darwin or win32, not ${platform}.`)
if (!['x64', 'arm64'].includes(arch)) throw new Error(`--arch is x64 or arm64, not ${arch}.`)

// The icon: SVG, rendered by Electron, then every size macOS wants, then .icns.
if (platform === 'darwin' && !existsSync(join(build, 'icon.icns'))) {
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

// Drops dist, tests, scripts etc. and every .md file, except the docs shown in the app (docs/ itself and the folders they sit in, such as packs/ and guide/, stay as directories).
const kept = new Set(DOCS.map(d => '/docs/' + d.name)), keptDirs = new Set(['/docs', ...DOCS.filter(d => d.name.includes('/')).map(d => '/docs/' + d.name.split('/')[0])])
// The guide's light pictures (docs/images/*-light.png, E3.3) are kept too: the panel draws them from the packaged docs.
const shot = p => p === '/docs/images' || /^\/docs\/images\/[^/]+-light\.png$/.test(p)
const ignore = p => kept.has(p) || keptDirs.has(p) || shot(p) ? false : /^\/(dist|test|docs|scripts|build|alfred)(\/|$)/.test(p) || /^\/\.git/.test(p) || /\.md$/.test(p)

// Windows: the icon as .ico, from the PNG (icon.png is made first if it is missing).
if (platform === 'win32' && !existsSync(join(build, 'icon.ico'))) {
  if (!existsSync(join(build, 'icon.png'))) run(electron, [join(root, 'scripts', 'icon.cjs')])
  run(electron, [join(root, 'scripts', 'icon.cjs'), '--ico'])
}
// The .ico stays in the Windows build, for the window's own icon (src/main.js).
const keepIco = p => platform === 'win32' && (p === '/build' || p === '/build/icon.ico')
const ignoreAll = p => keepIco(p) ? false : ignore(p)

const [out] = await packager({
  dir: root, out: join(root, 'dist'), overwrite: true, platform, arch,
  name: 'Package Lab', executableName: 'Package Lab', prune: true, asar: false,
  ...(platform === 'darwin' ? {   // darwin-only
    appBundleId: 'com.sylumer.package-lab', appCategoryType: 'public.app-category.developer-tools', icon: join(build, 'icon.icns'),   // darwin-only
    // Lets Finder offer Package Lab under Open With for .zip files, without making it the default.
    extendInfo: { CFBundleDocumentTypes: [{ CFBundleTypeName: 'ZIP archive', CFBundleTypeRole: 'Viewer', LSHandlerRank: 'Alternate', LSItemContentTypes: ['public.zip-archive'] }] },   // darwin-only
  } : {}),   // no icon for win32: packager would run rcedit, which needs Wine off Windows
  ignore: ignoreAll,
})

if (platform === 'win32') {
  // Sets the icon and version details with resedit (pure JavaScript, no Wine), then zips the folder: unzip it and run Package Lab.exe.
  const { NtExecutable, NtExecutableResource, Data, Resource } = await import('resedit')
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const exePath = join(out, 'Package Lab.exe'), exe = NtExecutable.from(readFileSync(exePath)), res = NtExecutableResource.from(exe)
  const group = Resource.IconGroupEntry.fromEntries(res.entries)[0]   // the group Electron's own icon is in, else a new one
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, group?.id ?? 1, group?.lang ?? 1033, Data.IconFile.from(readFileSync(join(build, 'icon.ico'))).icons.map(i => i.data))
  const info = Resource.VersionInfo.fromEntries(res.entries)[0], [v1, v2, v3] = version.split('.').map(n => parseInt(n, 10) || 0)
  info.setFileVersion(v1, v2, v3, 0, 1033); info.setProductVersion(v1, v2, v3, 0, 1033)
  info.setStringValues({ lang: 1033, codepage: 1200 }, { FileVersion: version, ProductVersion: version, ProductName: 'Package Lab', FileDescription: 'Package Lab', CompanyName: 'Package Lab', LegalCopyright: 'Package Lab', InternalName: 'Package Lab', OriginalFilename: 'Package Lab.exe' })
  info.outputToResourceEntries(res.entries); res.outputResource(exe)
  writeFileSync(exePath, Buffer.from(exe.generate()))
  const top = `Package Lab-win32-${arch}`, files = new Map(), walk = d => readdirSync(d, { withFileTypes: true }).forEach(e => e.isSymbolicLink() ? 0 : e.isDirectory() ?   // symlinks (node_modules/.bin) mean nothing on Windows
    walk(join(d, e.name)) : files.set(`${top}/${relative(out, join(d, e.name)).split(sep).join('/')}`, readFileSync(join(d, e.name))))
  walk(out)
  const zipPath = join(root, 'dist', `Package Lab-${version}-win32-${arch}.zip`)
  writeFileSync(zipPath, zip(files))
  console.log(`Built ${out}\nand ${zipPath}`)
  process.exit(0)
}
const app = join(out, 'Package Lab.app')
run('codesign', ['--force', '--deep', '--sign', '-', app])
console.log(`Built ${app}`)

if (process.argv.includes('--install')) {
  try { execFileSync('osascript', ['-e', 'if application id "com.sylumer.package-lab" is running then tell application id "com.sylumer.package-lab" to quit']) } catch { /* not running */ }
  rmSync('/Applications/Package Lab.app', { recursive: true, force: true })   // darwin-only
  run('ditto', [app, '/Applications/Package Lab.app'])   // darwin-only
  run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', '/Applications/Package Lab.app'])   // darwin-only
  console.log('Installed /Applications/Package Lab.app')   // darwin-only
}
