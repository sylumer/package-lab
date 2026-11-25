# Package Lab on Windows

Download the Windows app from the [latest release](https://github.com/sylumer/package-lab/releases/latest):
`Package-Lab-win-x64.zip` for Intel and AMD PCs, `Package-Lab-win-arm64.zip` for Windows on Arm.

Package Lab can also be built for Windows on a Mac. The result is a portable app: a folder you unzip and run. There is no
installer, nothing is written to the registry, and Package Lab doesn't register itself for `.zip` files.

## Build it

On the Mac, in the repository:

```bash
npm run package -- --platform win32            # this Mac's architecture
npm run package -- --platform win32 --arch x64 # or arm64
```

This makes two things in `dist/`:

- `Package Lab-win32-<arch>/`, the unpacked app, with `Package Lab.exe`;
- `Package-Lab-win-<arch>.zip`, the same folder zipped.

The first build downloads the Windows copy of Electron. The icon and version details are set on `Package Lab.exe`
with `resedit`, a pure-JavaScript editor, so no Wine is needed. `--platform darwin` (the default) builds the Mac app
as before, and `--install` is for the Mac only.

## Run it

1. Copy the zip to the Windows PC and unzip it. Any folder will do, including a USB stick.
2. Run `Package Lab.exe`. Windows may warn that the app is from an unknown publisher: it isn't code-signed. Choose **More info**, then
   **Run anyway**.
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

- No translucent sidebar (vibrancy), and no system accent colour. The window has its own frame and menu bar.
- Ctrl replaces ⌘ and Alt replaces ⌥ in shortcuts; the docs in the app show the Windows keys.
- WebKit runs work through Playwright, but WebKit on Windows is a weaker stand-in for Safari than on a Mac.
- No installer, code signing or auto-update. **Help › Check for Updates…** says whether there is a newer release.

## Trying it on Windows

For whoever has a Windows PC. Write down what you see at each step, and send the notes to the owner with the Windows
version. Steps 6 and 7 also need Node.js and a copy of this repository on the PC, after `npm ci`, because the command
line and the web interface run from the repository. The repository also has a workflow, `.github/workflows/windows.yml`,
that runs the suite on a Windows runner once it is pushed.

1. **Unzip and run.** Unzip `Package-Lab-win-<arch>.zip` and run `Package Lab.exe`. Note: any unknown-publisher
   warning, whether the window opens, and whether the menu bar, toolbar and tabs fit.
2. **Open `good.zip` and run it.** Make it from the files inside `test/fixtures/base` (the files, not the folder): select
   them, right-click, Send to, Compressed (zipped) folder, and name it `good.zip`. These are the same files the test
   suite zips as its good package. Note: whether it opens, what the findings say, and any error about file names or paths.
3. **Record a macro.** On `good.zip`, open **Live**, choose **Record clicks**, click two or three things in the course,
   then **Save macro** (see [Macros](help/macros.md)). Run it again. Note: whether the clicks land where you made them.
4. **Test saving.** Use **Test saving** with that macro set up. It runs the course, plays the macro, then checks that the
   course saves and resumes (see [Macros](help/macros.md)). Note: whether it reports success, and where the saved runs go (expected: `%APPDATA%\Package Lab`).
5. **Settings → Appearance.** Try Light, Dark and System (see [Appearance](help/run-settings.md#appearance)). Note:
   whether the colours and the window frame follow, and whether anything is hard to read.
6. **The web interface from a phone.** From the repository on the PC, run
   `node bin/package-lab.js serve --host 0.0.0.0`. It prints the PC's network address when it can find one; if the
   address it prints says `localhost` or `127.0.0.1`, replace that part with the PC's IPv4 address from `ipconfig`.
   Open the result on a phone on the same Wi-Fi (see [Web interface](web.md)). Windows Firewall may ask first. Note: whether the page loads, whether the address's token
   gets you in, and whether the course opens.
7. **The CLI's `doctor`.** In PowerShell, from the repository, run
   `$env:PACKAGE_LAB_APP = "<full path to Package Lab.exe>"`, then `node bin/package-lab.js doctor`. Note: each line
   of its output, especially the Electron, Playwright and WebKit lines and the data folder.

## Not yet tried on Windows

This build has been made and checked on a Mac, but never started on Windows.
