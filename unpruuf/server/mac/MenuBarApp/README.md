# unpruuf Relay — macOS menu bar app

A small always-running menu bar helper for the relay in `server/mac/` (see `../README.md`): a
green/yellow/red dot showing whether it's actually working, plus Start/Stop and "show the QR code
again" — without opening Terminal. It wraps the existing `install-service.command` /
`uninstall-service.command` scripts and the relay's own `--status-json` / `--show-code-json`
output; it does not reimplement any of that logic, so a fix or change there is automatically
picked up here too.

**Written without a Mac, Xcode, or a Swift toolchain — same situation as `../../ios/README.md`,
same request: if anything doesn't compile, paste the exact error back.**

## Setup — turning this into a buildable Xcode project

1. Xcode → File → New → Project → **macOS** → **App**.
   - Product Name: `unpruuf Relay` (or anything you like — this is a personal tool, not something
     shipped to anyone else).
   - Interface: SwiftUI. Language: Swift.
   - Minimum deployment: **macOS 13** — `MenuBarExtra` (the whole point of this app) doesn't exist
     before that.
   - Save it anywhere convenient, e.g. next to this README in `server/mac/MenuBarApp/` — or
     literally anywhere else on your Mac; it doesn't need to live inside the unpruuf project at
     all, since it talks to your relay's `server/` folder purely by you picking that folder once
     in its UI (see step 4).

2. **Delete Xcode's auto-generated `ContentView.swift` and the `…App.swift` it created** (the
   ones with the default "Hello, world" text) — this folder's `MenuBarAppApp.swift` replaces the
   latter, and `ContentView.swift` here replaces the former (same filename, different content).

3. **Drag in this folder's Swift files**: `MenuBarAppApp.swift`, `ContentView.swift`,
   `RelayController.swift`, `RelayStatus.swift`, `QRCodeView.swift`, `MenuBarIcon.swift`. Xcode
   will offer to copy them in — either choice ("Copy items if needed" checked or not) is fine.

4. **Turn off App Sandbox.** Click the project in the navigator → your target → **Signing &
   Capabilities** tab → find the **App Sandbox** capability → click the **−** (minus) to remove it
   entirely. This app runs shell scripts and `node` as ordinary child processes (the same scripts
   you'd otherwise double-click yourself) — App Sandbox would block exactly that, with cryptic
   permission failures rather than a clear error. This is a personal tool for your own Mac, not
   something distributed through the Mac App Store, so sandboxing buys nothing here.

5. **Hide the Dock icon** (this is a menu-bar-only app, not a normal windowed app): select
   `Info.plist` (or the target's **Info** tab in newer Xcode) → add a row:
   - Key: `Application is agent (UIElement)` (this is `LSUIElement`)
   - Type: Boolean
   - Value: **YES**

6. **Build and run** (⌘R). No Dock icon should appear — instead, look for a small red/green/yellow
   dot in the menu bar (top-right area, near the clock). Click it.

7. **First use:** click **"Choose server folder…"** and pick your unpruuf project's `server/`
   folder (the one containing `start-mac.command`). If you've never run the relay before at all,
   the app will tell you to run `./start-mac.command` once yourself in Terminal first — that
   one-time step asks how long to keep undelivered messages, which only makes sense as an
   interactive question (see `../README.md`'s own explanation of why `install-service.command`
   refuses to run unattended before that first setup). Once that's done, come back to the menu bar
   app and click **"Start relay"**.

## What it actually does, and doesn't do

- **Start relay** runs `mac/install-service.command` — the same background-launchd install you'd
  otherwise double-click, safe to run again even if the service is already installed.
- **Stop relay** runs `mac/uninstall-service.command`. Stopping does **not** delete your identity,
  onion address, or queued messages — starting again picks up exactly where it left off (see
  `../README.md`).
- **Show QR / code** calls `node dist/mac-start.js --show-code-json`, a read-only command safe to
  run alongside an already-running relay — it never restarts anything or touches the queue.
- The dot polls every 10 seconds via `--status-json` (also read-only, safe to run continuously).
- **Not included:** launch-at-login for this menu bar app itself (the relay's own background
  service already survives logout/reboot on its own via launchd — this app is only a convenient
  window into it, so if you also want the *menu bar app itself* to reopen automatically, add it
  manually via System Settings → General → Login Items → "+").

## Known risk areas

1. **Node/PATH resolution** — every action runs through `zsh -l -c "…"` (a login shell) specifically
   so Homebrew's `/opt/homebrew/bin` (Apple Silicon) or `/usr/local/bin` (Intel) ends up on PATH,
   the same way your own Terminal would see it. If Start/Stop/Refresh fail with something like
   "node: command not found" even though `node --version` works fine in your own Terminal, your
   shell's PATH setup is unusual (e.g. set only in `.bashrc` instead of a file `zsh -l` reads) —
   tell me the exact error and which shell you use day to day.
2. **launchctl output format** — `isServiceLoaded()` only checks `launchctl list`'s exit code, not
   its output, so it can't yet distinguish "loaded and healthy" from "loaded but crash-looping".
   The dot still tells the more important thing (is Tor actually publishing, via `--status-json`'s
   `onion` field), so this is a minor gap, not a correctness bug.
