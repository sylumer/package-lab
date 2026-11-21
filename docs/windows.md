# Package Lab on Windows

Package Lab can be built for Windows on a Mac. The result is a portable app: a folder you unzip and run. There is no
installer, nothing is written to the registry, and Package Lab doesn't register itself for `.zip` files.

## Build it

On the Mac, in the repository:

```bash
npm run package -- --platform win32            # this Mac's architecture
npm run package -- --platform win32 --arch x64 # or arm64
```

This makes two things in `dist/`:

- `Package Lab-win32-<arch>/`, the unpacked app, with `Package Lab.exe`;
- `Package Lab-<version>-win32-<arch>.zip`, the same folder zipped.

The first build downloads the Windows copy of Electron. The icon and version details are set on `Package Lab.exe`
with `resedit`, a pure-JavaScript editor, so no Wine is needed. `--platform darwin` (the default) builds the Mac app
as before, and `--install` is for the Mac only.

## Run it

1. Copy the zip to the Windows PC and unzip it. Any folder will do, including a USB stick.
2. Run `Package Lab.exe`. Windows may warn that the app is from an unknown publisher: it isn't code-signed.
3. Open a package with Open, or drop a `.zip` on the window.

For the command line, set `PACKAGE_LAB_APP` to the full path of `Package Lab.exe`, then run
`node bin/package-lab.js doctor` from the repository. `doctor` also looks in
`%LOCALAPPDATA%\Programs\Package Lab\` and in this repository's `dist/`.

## Where the data goes

- **By default**, in `%APPDATA%\Package Lab`: saved runs, macros, settings and the web token.
- **Fully portable**: make a folder named `Package Lab Data` next to `Package Lab.exe`. If it is there when the app
  starts, the app uses it for everything above, and nothing is left on the PC.
- **`PACKAGE_LAB_DATA`** names a folder and wins over both. The command line doesn't look for the portable folder, so
  set `PACKAGE_LAB_DATA` for it too if the two should share data.

To move from one to the other, close Package Lab and copy the folder: from `%APPDATA%\Package Lab` into a new
`Package Lab Data` next to the exe, or the other way round.

## What differs from the Mac

- No Alfred workflow.
- No translucent sidebar (vibrancy), and no system accent colour. The window has its own frame and menu bar.
- Ctrl replaces ⌘ and Alt replaces ⌥ in shortcuts; the docs in the app show the Windows keys.
- WebKit runs work through Playwright, but WebKit on Windows is a weaker stand-in for Safari than on a Mac.
- No installer, code signing or auto-update.

## Not yet tried on Windows

This build has been made and checked on a Mac, but never started on Windows.
