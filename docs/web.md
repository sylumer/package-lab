# SCORM Lab web interface

The web interface is the desktop app in a browser. Use it from another computer, an iPad or a phone. Courses still run
on the Mac, in SCORM Lab's own browser; the **Live** tab shows them and sends your clicks and keys back.

If you use [Concierge](concierge.md), its SCORM Lab module is the simpler way to work from other devices: it uses
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
scorm-lab serve
```

This prints an address like `http://127.0.0.1:4880/?token=3f9c…`. Open it in a browser. It runs until you press Ctrl-C.

Other ways to start it:

```bash
npm run serve
```
This runs it from the repo, without a window.

```bash
scorm-lab serve --window
```
This also opens the desktop window. The window and every browser share one session: the same package, runs and
running course.

In Alfred, the `scormweb` keyword starts it if it isn't running and opens it (see [Alfred](alfred.md)).

The port is 4880 unless you pass `--port`. It is recorded in `~/github/PORTS.md`.

## Signing in

The address includes an access token. Opening it once sets a cookie (for a year) and drops the token from the
address, so you can bookmark the plain address afterwards. Without the cookie or token, every page answers "401" with
instructions.

The token is kept in `~/Library/Application Support/SCORM Lab/web-token`, so the address stays the same between
starts.

```bash
scorm-lab serve --url
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
   scorm-lab serve --host 0.0.0.0
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
- **Open saved…** lists the runs saved on the Mac, newest first; click one to open it.
- **Stop after** is the way to run a course unattended: launch, come back, and read the findings.
- **More options** and **Copy as CLI command** work as in the desktop app. Copying needs the page to be open on
  `localhost` or over https; if the browser refuses, select the command shown next to the button.
- A **Live** tab shows the running course.
- Joining while a course is running shows it in progress, with the **Live** tab selected.

## Live view

While a run is going, the **Live** tab shows the course window, updated about every half second while it changes.

- **Click** the picture to click the course at that point.
- **Scroll** over the picture to scroll the course.
- **Keys:** click the picture to focus it, then type. Letters go to the course as text; Enter, Tab, Escape, Backspace,
  Delete, Space, the arrows, Page Up/Down, Home and End go as keys. ⌘ and Ctrl shortcuts stay with your browser.
- The text box and **Type** send a whole string, which is easier on a phone. The buttons send single keys.
- **Stop and analyse** ends the run.

The picture is a few hundred milliseconds behind, so wait for it to update before the next click. Courses that open a
popup are shown in the popup, since input goes to the newest window of the run.

## Security

- **Access:** the token, then an `HttpOnly`, `SameSite=Strict` cookie. Cross-site pages can't use your cookie to drive
  it.
- **No dialogs on the Mac:** the web interface can't open the Mac's file dialogs. It uploads instead, and
  **Open saved…** only lists and opens files in SCORM Lab's runs folder.
- **What a client can do:** with the address, someone can upload and run packages on the Mac, and read your saved runs
  (which contain package scripts and stored data). Treat the address like a password.
- **Courses run sandboxed:** in SCORM Lab's browser, with their own storage partition, never in the browser you view
  them from.
- **HTTP only:** for remote use, prefer the SSH tunnel, or use the [Concierge module](concierge.md), which is served
  over HTTPS with a login.

## Troubleshooting

- **"401" page:** open the address with `?token=…` (see [Signing in](#signing-in)).
- **"address already in use":** something else is on 4880. Use `--port`, check `lsof -nP -iTCP:4880 -sTCP:LISTEN`, and
  update PORTS.md if you change it for good.
- **"Lost the connection":** the server stopped or the network dropped; the page reconnects by itself when it's back.
- **The live picture doesn't change:** the course may be static; it is only sent when it changes. Click something.
