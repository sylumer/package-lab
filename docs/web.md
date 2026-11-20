# Package Lab web interface

The web interface is the desktop app in a browser. Use it from another computer, an iPad or a phone. Courses still run
on the Mac, in Package Lab's own browser; the **Live** tab shows them and sends your clicks and keys back.

If you use [Concierge](concierge.md), its Package Lab module is the simpler way to work from other devices: it uses
Concierge's login and HTTPS. The web interface gives you the whole app: every tab, comparisons and saved runs.

- [Starting it](#starting-it)
- [Signing in](#signing-in)
- [Reaching it from another device](#reaching-it-from-another-device)
- [Using it](#using-it)
- [Live view](#live-view)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## Starting it

```bash
package-lab serve
```

This prints an address like `http://127.0.0.1:4880/?token=3f9c…`. Open it in a browser. It runs until you press Ctrl-C.

Other ways to start it:

```bash
npm run serve
```
This runs it from the repo, without a window.

```bash
package-lab serve --window
```
This also opens the desktop window. The window and every browser share one session: the same package, runs and
running course.

In Alfred, the `packageweb` keyword starts it if it isn't running and opens it (see [Alfred](alfred.md)).

The port is 4880 unless you pass `--port`. It is recorded in `~/github/PORTS.md`.

## Signing in

The address includes an access token. Opening it once sets a cookie (for a year) and drops the token from the
address, so you can bookmark the plain address afterwards. Without the cookie or token, every page answers "401" with
instructions.

The token is kept in `~/Library/Application Support/Package Lab/web-token`, so the address stays the same between
starts.

```bash
package-lab serve --url
```
This prints the address again.

To change the token, delete that file and restart; every device then needs the new address.

## Reaching it from another device

By default it listens on `127.0.0.1`, so only this Mac can reach it. Choose one of these:

1. **SSH tunnel (recommended).** It stays private to this Mac. On the other computer, run:
   ```bash
   ssh -L 4880:127.0.0.1:4880 you@your-mac.local
   ```
   Then open `http://127.0.0.1:4880/?token=…` there. Remote Login must be on (System Settings › General › Sharing).
2. **Your network.** Start it with:
   ```bash
   package-lab serve --host 0.0.0.0
   ```
   It prints an address with the Mac's network IP. Anyone on the network who has the address with its token can use
   it. The connection is plain HTTP, so use this only on a network you trust.
3. **Tailscale or a VPN.** Use `--host 0.0.0.0` (or the VPN address) and the Mac's address on that network.
4. **Screen Sharing.** To use the desktop app itself from another Mac, use macOS Screen Sharing; nothing else is
   needed.

## Using it

Everything works as in the [user guide](user-guide.md), except:

- **Open package…** uploads a `.zip` from the device you are on, with progress shown in the status line. It replaces
  the package open on the Mac for everyone.
- **Save report…** on the Findings tab of a run downloads that run's HTML report, with **Take the course content out** ticked for a redacted one (see the [user guide](user-guide.md#sending-a-report-without-the-course-content)). The report comes from `POST /api/invoke/report-html`; the web interface has no file names option (that is in the CLI).
- **Export corrected package…** builds the corrected `.zip` on the Mac and your browser downloads it (it can't use a save dialog). It includes your changed files and the fixes; see the [user guide](user-guide.md#exporting-a-corrected-package). The package is built in memory, so it needs room for a second copy of the package on the Mac. The address is `GET /api/export` (`?only=case,http-to-https` limits the fixes; `?only=` with nothing after it means none, so only your changed files). Before downloading, the page shows the checklist of fixes that apply, as the desktop app does; with nothing to change it answers with an error that says so.
- **Check a folder…** isn't in the web interface: it needs a folder on the Mac, and the Folder check tab is desktop only.
  To check a folder from another device, run `package-lab batch` on the Mac (in Terminal, or over SSH); see [cli.md](cli.md#batch).
- **Compare packages…** uploads a second `.zip` from the device you are on and shows the **Package diff** tab: files and text diffs, manifest, loading path and findings, from the files alone. The second package is compared and not kept: the one open on the Mac stays as it is. See the [user guide](user-guide.md#comparing-two-packages); to compare how they run, use [`package-lab diff --run`](cli.md#diff).
- **Open saved…** lists the runs saved on the Mac, newest first; click one to open it.
- **Stop after** is the way to run a course unattended: launch, come back, and read the findings.
- **More options** and **Copy as CLI command** work as in the desktop app. Copying needs the page to be open on
  `localhost` or over https; if the browser refuses, select the command shown next to the button.
- The Findings tab starts with the **Milestones** strip, as in the desktop app.
- The **Timeline** tab works as in the desktop app: the lanes, the Zoom and Start sliders, hover details, and clicks that open the tab.
- The **Files** tab works as in the desktop app. **Replace from a file…** sends the file from the device you are on (up to about 15 MB). Changed files are kept on the Mac for the session and shared by everyone using the interface; paths outside the package are refused.
- Pins (More options and the **Lookups** tab) and answers (the **Network** tab's **Answer this request…**, listed under More options) work as in the desktop app. They are kept in the page, so reloading it clears them; the CLI line under **Copy as CLI command** repeats them.
- The **Experiments** tab works as in the desktop app. The runs happen one after another on the Mac, and the table fills in as each finishes. Open another browser and it shows the same events as they arrive; the table itself is not kept, so a page opened mid-experiment shows only the runs that finish after it joined.
- The **Server needs** tab works as in the desktop app: its rounds run one after another on the Mac, and the result shows when the last one finishes. **Save as response** adds the stand-in to this page's answers. The result is also saved on the Mac (in the `discoveries` folder next to the saved runs); like the Experiments table, a page opened midway shows only what happens after it joined. One experiment or discovery runs at a time.
- **Trace the code** (under More options) and the **Execution** tab work as in the desktop app. The page gets the last 500 events of a traced run, not the whole trace; **Code** shows a script as the run recorded it, and a page's code from the package open on the Mac (so open the run's package to see it).
- The **Drill-down** tab works as in the desktop app: its runs (traced again if needed, then the watch run) happen on the Mac, in the same slot as experiments and discoveries, and the chain shows when they finish. It needs the run's package to be the one open on the Mac. Like the Experiments table, the result isn't kept in the page.
- The **code view** (every `file:line` in a finding, **Code**, **View code**) works as in the desktop app: formatting, source maps and coverage are worked out on the Mac and the page gets the one file it shows. A page's code, and a script with no run chosen, come from the package open on the Mac.
- **The content was waiting for…** appears in the Findings tab as in the desktop app; nothing extra is needed.
- The **Profile** list and the **Profile fields** under More options work as in the desktop app. Changed fields are kept in the page, so reloading it clears them; the CLI line then says `--profile-file profile.json` (save the custom profile from the options JSON shown above it).
- **Storage** (under More options) and the **storage** experiment work as in the desktop app; the CLI line says `--storage blocked`.
- **Browser** and **Device size** (under More options) work as in the desktop app; the CLI line says `--browser webkit --viewport iphone`. A WebKit run happens on the Mac in a Node process, shows in the Runs list like any run, and has no live view. If Playwright isn't installed, the page shows the message that says how to install it. With a device size, the **Live** view shows the page at that size.
- **Test saving** (the button next to Launch, and its tab) works as in the desktop app: both runs happen on the Mac, in the same slot as experiments, and the tab shows the two runs side by side with the findings when the second ends. Like the Experiments table, a page opened midway shows only what happens after it joined.
- **Macro** (under More options) shows the macro the page holds, with **Clear** and **Use this run's clicks** (the clicks the probe saw in the selected run). The macro is kept in the page, so reloading clears it; the CLI line says `--macro macro.json`.
- The **xAPI** tab works as in the desktop app, for a cmi5 or Tin Can run: the statements with their validation, the documents and the requests to the LRS. The LRS runs on the Mac (at `lab://run/__lrs/` inside the run's browser); the page only reads the run's record.
- A **Live** tab shows the running course.
- Joining while a course is running shows it in progress, with the **Live** tab selected.
- **Help** opens the docs in the same panel as the desktop app. The app menu is desktop only.
- Launch options are remembered in each browser, not on the Mac (see [Testing a theory](user-guide.md#testing-a-theory-launch-settings)).

## Live view

While a run is going, the **Live** tab shows the course window, updated about every half second while it changes.

- **Click** the picture to click the course at that point.
- **Scroll** over the picture to scroll the course.
- **Keys:** click the picture to focus it, then type. Letters go to the course as text; Enter, Tab, Escape, Backspace,
  Delete, Space, the arrows, Page Up/Down, Home and End go as keys. ⌘ and Ctrl shortcuts stay with your browser.
- The text box and **Type** send a whole string, which is easier on a phone. The buttons send single keys.
- **Record clicks** keeps every click, key and piece of text you send through the picture, with its time into the run;
  **Save macro** stops recording and keeps them as the page's macro, which is played at the start of every launch and by
  **Test saving**. Recording starts fresh each time, drops pointer moves, and stops with a message at 2,000 events or 100 KB of text. Text typed here is kept in the macro, so don't type secrets.
- **Stop and analyse** ends the run.

The picture is a few hundred milliseconds behind, so wait for it to update before the next click. Courses that open a
popup are shown in the popup, since input goes to the newest window of the run.

## Security

- **Access:** the token, then an `HttpOnly`, `SameSite=Strict` cookie. Cross-site pages can't use your cookie to drive
  it.
- **No dialogs on the Mac:** the web interface can't open the Mac's file dialogs. It uploads instead, and
  **Open saved…** only lists and opens files in Package Lab's runs folder.
- **What a client can do:** with the address, someone can upload and run packages on the Mac, and read your saved runs
  (which contain package scripts and stored data). Treat the address like a password.
- **Courses run sandboxed:** in Package Lab's browser, with their own storage partition, never in the browser you view
  them from.
- **HTTP only:** for remote use, prefer the SSH tunnel, or use the [Concierge module](concierge.md), which is served
  over HTTPS with a login.

## Troubleshooting

- **"401" page:** open the address with `?token=…` (see [Signing in](#signing-in)).
- **"address already in use":** something else is on 4880. Use `--port`, check `lsof -nP -iTCP:4880 -sTCP:LISTEN`, and
  update PORTS.md if you change it for good.
- **"Lost the connection":** the server stopped or the network dropped; the page reconnects by itself when it's back.
- **The live picture doesn't change:** the course may be static; it is only sent when it changes. Click something.
