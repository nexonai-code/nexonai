# Running the unpruuf relay on Windows

This runs the same relay as the Docker/Linux deployment (`server/README.md`), but as a plain
Node.js process that manages its own Tor process instead of a Docker + Tor-sidecar setup — no
Docker needed.

## One-time setup

**Just install Node.js.** Download the LTS release from https://nodejs.org if you don't have it
— that's it. Tor itself no longer needs to be found/downloaded/extracted by hand: the first run
of `start-windows.bat` fetches the official Tor Project Expert Bundle automatically and installs
it into `windows/tor/`. (It used to require manually hunting down the "Expert Bundle" on
torproject.org's download page — easy to miss, since it's a small technical table buried well
below the much more prominent Tor Browser button. That step is gone now.)

## Running

Double-click **`start-windows.bat`** in the `server/` folder. First run installs dependencies,
builds, and downloads Tor (all one-time, a minute or two depending on your connection); every run
after that is fast. Keep the console window open — closing it stops the relay.

On first run it will:
1. Ask how many hours an undelivered message should be kept before it's dropped (press Enter
   for the default, 6 hours).
2. Generate a random access token and save it, together with the TTL you chose, to
   `relay-identity.json` next to the server files. **Back this file up or treat it like a
   password** — anyone with it can use your relay.
3. Download and install Tor (~30-50 MB, one time only).
4. Start Tor and wait for the hidden service to publish (usually 10-30 seconds; can take a bit
   longer the very first time while Tor bootstraps its consensus).
5. Print a QR code and the same information as plain text.

**In the app:** open Settings -> Relay, turn it on, then either tap "Scan QR code" and point the
camera at the terminal, or tap the text field and paste the printed connection string. Do this
on every device that should use this relay.

## Watching what the relay is doing

Once clients start using it, the same console window prints a live activity line for every
message that arrives, gets picked up, or is rejected:

```
[relay] 21:18:05  STORED   …SUFFIX99  4.0 KB queued
[relay] 21:18:06  FETCHED  …SUFFIX99  2 messages picked up, 8.0 KB, waited 1s
[relay] 21:18:06  REJECTED …s space!  rejected: invalid tag
```

- **STORED** — a message arrived and is now waiting to be collected.
- **FETCHED** — the recipient picked it up. `waited` is how long it sat queued, which is the
  quickest way to tell "the recipient is offline" from "nothing is arriving at all".
- **REJECTED** — the request was refused, with the reason (bad tag, oversized blob, queue full).

Routine empty polls are deliberately **not** logged — every connected device checks in every 20
seconds, and printing those would bury everything else within seconds. So a quiet window with
clients connected is normal and means "nothing to deliver", not "nothing is working".

The `…SUFFIX99` part is the last 8 characters of the sender's rotating wire tag — enough for you
to see that a STORED and its later FETCHED belong together, and nothing more. The relay never
sees message content (everything it stores is already end-to-end encrypted), and this log keeps
it that way: it records only size, timing, and that short suffix.

Every run after the first reuses the same credentials, TTL, and downloaded Tor automatically —
you don't need to redo any of this unless you explicitly ask for new credentials (see below).

## Getting a fresh token

If you think the current token leaked, or you just want a clean slate:

```bat
start-windows.bat --regenerate
```

This issues a new token (same TTL) and prints a new QR/text — every device needs to be
re-scanned/re-pasted after this, since the old token stops working immediately.

## Changing the TTL later

The TTL is only asked interactively the very first time. To change it afterwards, either:
- delete `relay-identity.json` and run again (this also generates a **new token** — every device
  needs to be re-scanned), or
- pass `--ttl <hours>` **together with** `--regenerate` on a run where you also want a fresh
  token, e.g. `start-windows.bat --regenerate --ttl 24`.

## If the automatic Tor download doesn't work

Some networks/firewalls block outbound access to torproject.org, or extraction can fail on very
old Windows versions (the built-in `tar.exe` used to unpack it has shipped since Windows 10
1803 / all of Windows 11). If that happens, the console prints the exact download URL and target
folder so you can do it by hand instead:

1. **Tor.** Download the **Tor Expert Bundle** for Windows from
   https://www.torproject.org/download/tor/ — scroll down past the Tor Browser button to the
   "Tor Expert Bundle" table (look for "Windows Expert Bundle", not Tor Browser — the expert
   bundle is just `tor.exe` and a few DLLs, no browser). Extract it and copy the whole `Tor`
   folder's contents so you end up with:

   ```
   server/windows/tor/tor.exe
   server/windows/tor/*.dll
   ```

2. Run `start-windows.bat` again — it'll find the manually-placed `tor.exe` and skip the
   download.

## Custom Tor location

If `tor.exe` lives somewhere other than `server/windows/tor/tor.exe` (e.g. you already have Tor
Browser installed), point at it instead — this also skips the automatic download entirely:

```bat
start-windows.bat --tor-exe "C:\Path\To\tor.exe"
```

or set it once via an environment variable (`setx TOR_EXE_PATH "C:\Path\To\tor.exe"`, then open a
new terminal).

## Troubleshooting

- **"Node.js was not found on PATH"** — install Node.js and make sure to check "Add to PATH"
  during setup, then open a new terminal/re-double-click the .bat.
- **"automatic download failed"** — see "If the automatic Tor download doesn't work" above.
- **Tor never publishes / times out** — check that `windows/tor/tor.exe` exists (or `--tor-exe`
  points at a real file), and that your firewall isn't blocking outbound connections from
  `tor.exe`. Windows Defender Firewall may prompt on first run — allow it.
- **A device can't reach the relay after scanning** — the app also needs Tor to be running and
  ready (see the app's own Settings -> Network & security status). The relay itself is a Tor
  hidden service, so both ends need working Tor connectivity.
