# Appendix C: Troubleshooting Package Lab

When Package Lab itself, rather than the course, seems to be the problem. If you have the source, start with
`package-lab doctor`: it checks Node, Electron, WebKit, the data folder and the web interface's port, and ends with a
**To do** list. Rows that mention `npm` or the Package Lab folder are for the source only
([chapter 3](03-install-and-practice-kit.md#if-you-have-the-source)).

## Installing and starting

| Symptom | Cause and cure |
|---|---|
| The Mac says it can't open Package Lab, or can't check it for malicious software | The app isn't signed by Apple. Go to **System Settings › Privacy & Security** and choose **Open Anyway** beside the message about Package Lab, once |
| Windows warns about an unknown publisher | The app isn't code-signed. Choose **More info**, then **Run anyway** |
| `package-lab: command not found` | The command line comes with the source, not the downloaded app. With the source, the command isn't linked yet. In the Package Lab folder, run `npm link`, or use `node bin/package-lab.js` instead |
| `node: command not found`, or `doctor` says Node is too old | Install Node.js 20 or later from nodejs.org |
| “Electron couldn't be found” | Run `npm install` in the Package Lab folder, or install the app with `npm run install-app` |
| Opening a second package doesn't open a second window | That's by design: one window at a time. The new package goes to the window that's open |
| Package Lab isn't in Finder's **Open With** menu | Move the app into **Applications** and open it once. From the source, run `npm run install-app`, which builds the app and registers it. On Windows Package Lab never registers for `.zip` files: use **Open** or drop the file on the window |

## Opening a package

| Symptom | Cause and cure |
|---|---|
| “Only .zip packages can be opened” | You dropped another kind of file. Package Lab opens ZIP files only; zip the course folder first |
| Nothing happens when you choose **Run** | Read the status line. A package with no readable manifest (or `cmi5.xml` or `tincan.xml`) can't be launched: its static findings say why |

## Running

| Symptom | Cause and cure |
|---|---|
| The course window is blank and there are no findings | The run hasn't been analysed yet. Choose **Stop**: the findings come after |
| A run surprises you: other settings, clicks you didn't make, answers or pins | Look at the summary chip beside **Run**, the **Macro** segment, and **Pins** and **Answers** under **Settings › Advanced**. Something from an earlier test is still set |
| The course is very slow, or there are thousands of caught errors | Turn off **Record caught errors** in **Settings › Recording**. Tracing slows a course down too |
| “Playwright isn't installed” when you choose WebKit | In the Package Lab folder: `npm i -D playwright && npx playwright install webkit` |
| “WebKit runs need the Package Lab source checkout” | The downloaded app can't run WebKit. Use Chromium with **Storage: Blocked (Safari-like)** and **Device size: iPad**, or run Package Lab from the source ([chapter 3](03-install-and-practice-kit.md#if-you-have-the-source)) |
| The macro didn't play | Macros need Chromium. Check **Browser**, and that the macro segment isn't empty |
| The course needs a sign-in or licence server | Its requests show in **Network**. If they fail, that's a finding in itself: the course depends on a server. Use **Server needs**, or record a working copy where it can sign in |
| **Trace the code** has no effect, or the code view is empty | The run was in WebKit, which can't be traced, or the script is over 2 MB, built with `eval`, or from another site |

## The User Guide

| Symptom | Cause and cure |
|---|---|
| Practice package names aren't buttons, or a button says the package isn't there | Choose **Build practice kit** under the guide's contents first. Names are buttons only in the guide's own window or tab, not on GitHub or in the one-file copy |
| Choosing a package name seems to do nothing | It opened in the Package Lab window, which may be behind the guide. In the web interface, it opened in the other tab |
| The guide opens at the wrong place | It reopens where you last read. Choose a chapter in the contents |
| Your ticks have gone | They're kept per browser (or for the desktop app's guide window): another browser, or cleared site data, starts again |

## The web interface

| Symptom | Cause and cure |
|---|---|
| A “401” page | Open the address with its `?token=…`, as `serve` printed it |
| “address already in use” | Something else is on the port. Change it in **Package Lab › Settings…**, or start with `--port` |
| “Lost the connection” | The server stopped or the network dropped. The page reconnects by itself |
| The Live picture doesn't change | It's sent only when the course changes. Click something |

## Data and privacy

- Package Lab's data is in `~/Library/Application Support/Package Lab` (**Help › Show Data Folder**). Its `runs/`
  folder can grow large; delete old runs you don't need.
- Saved runs hold the course's scripts and stored values. Keep them as you would the course.
- Package Lab never sends course content anywhere. The course's own requests to other sites go out as they would in
  any browser, and **Network** shows them.

## Still stuck

The [Help](../help.md) covers every view and setting, and the
[getting started troubleshooting](../help/getting-started.md#troubleshooting) has the same basics in brief.
