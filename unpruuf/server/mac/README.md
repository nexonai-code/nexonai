# Running the unpruuf relay on macOS

This runs the same relay as the Docker/Linux deployment (`server/README.md`) and the Windows one
(`windows/README.md`), but as a plain Node.js process that manages its own Tor process instead of
Docker Desktop — no Docker needed.

## One-time setup

**Install Node.js.** Either download the LTS release from https://nodejs.org, or if you have
Homebrew: `brew install node`. Tor itself doesn't need to be found/downloaded by hand either: the
first run of `start-mac.command` fetches the official Tor Project Expert Bundle automatically
(the correct build for Apple Silicon or Intel, detected automatically) and installs it into
`mac/tor/`.

**Gatekeeper, one time only:** `start-mac.command` is an unsigned script, so the first time you
double-click it, macOS will refuse with "cannot be opened because it is from an unidentified
developer." Do either of these once:

- Right-click (or Control-click) `start-mac.command` → **Open** → confirm **Open** in the dialog
  that appears, or
- In Terminal: `xattr -d com.apple.quarantine start-mac.command`

After that first approval, double-clicking it normally works every time.

## Running

Double-click **`start-mac.command`** in the `server/` folder (this opens Terminal and runs it).
First run installs dependencies, builds, and downloads Tor (all one-time, a minute or two
depending on your connection); every run after that is fast. Keep the Terminal window open —
closing it stops the relay.

On first run it will:
1. Ask how many hours an undelivered message should be kept before it's dropped (press Enter
   for the default, 6 hours).
2. Generate a random access token and save it, together with the TTL you chose, to
   `relay-identity.json` next to the server files. **Back this file up or treat it like a
   password** — anyone with it can use your relay.
3. Download and install Tor (~30-50 MB, one time only) unless it's already on your PATH (e.g.
   via `brew install tor`).
4. Start Tor and wait for the hidden service to publish (usually 10-30 seconds; can take a bit
   longer the very first time while Tor bootstraps its consensus). macOS's Application Firewall
   may prompt to allow `tor` to accept incoming connections the first time — allow it.
5. Print a QR code and the same information as plain text.

**In the app:** open Settings -> Relay, turn it on, then either tap "Scan QR code" and point the
camera at the terminal, or tap the text field and paste the printed connection string. Do this
on every device that should use this relay.

## Running it in the background (recommended)

By default the relay stops when you close the Terminal window — which is a real problem for
something your contacts need to be able to reach. To run it as a proper background service that
also starts automatically when you log in:

Double-click **`mac/install-service.command`** (or run it from Terminal).

It refuses to install until you have run `start-mac.command` at least once, on purpose: the very
first run asks how long undelivered messages should be kept, and a background service has no
terminal to ask that question in — it would silently take the default without telling you.

Once installed:

| What | How |
|---|---|
| Watch it live | `tail -f ~/Library/Logs/unpruuf-relay.log` |
| Check it's working | double-click `mac/status.command` |
| Show the QR code again | double-click `mac/show-code.command` |
| Stop and remove it | double-click `mac/uninstall-service.command` |

Removing the service leaves your identity, onion address and queued messages untouched — your
contacts do **not** need to re-pair afterwards.

**One caveat:** the log file is never rotated or deleted automatically. It grows by roughly one
line per message, so this is slow, but on a busy relay it will grow indefinitely. Delete it
whenever you like; the relay recreates it.

## Adding another device later

The QR code and connection string are only printed when the relay starts. To point another phone
at an already-running relay, double-click **`mac/show-code.command`** — it prints them again
without restarting anything (a restart would drop every message currently waiting to be
collected).

## Is it actually working?

Double-click **`mac/status.command`**, or run `node dist/mac-start.js --status`. It reads the
relay's own files, so it is safe to run while the relay is running, including as a background
service:

```
unpruuf relay — status

  Onion address:  abc123….onion
  Message TTL:    6h
  Queue:          3 messages waiting across 2 conversations, oldest waiting 4m 12s
```

An **empty queue while your contacts are online is the healthy state** — messages only sit here
until the recipient's device collects them. A queue that keeps growing means the recipient isn't
picking them up (their app closed, their Tor not connected, or they were never paired properly).

## If Tor crashes

The relay now supervises its Tor process: if Tor exits unexpectedly after a successful start, it
is restarted automatically (with a short delay, up to 5 times) and the restart is logged. The
onion address does **not** change across a restart — its keys live in the data directory — so
paired contacts keep working.

If Tor dies immediately and repeatedly, that's a configuration problem rather than a transient
one, so the relay stops retrying and says so in the log rather than looping forever.

## Watching what the relay is doing

Once clients start using it, the same terminal window prints a live activity line for every
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
it that way: it records only size, timing, and that short suffix. Note that the output is
ephemeral in a terminal, but *would* be written to disk if you redirect it to a file or run the
relay under a service manager that captures logs — that's your choice to make; nothing here
writes a log file on its own.

Every run after the first reuses the same credentials, TTL, and downloaded Tor automatically —
you don't need to redo any of this unless you explicitly ask for new credentials (see below).

## Getting a fresh token

If you think the current token leaked, or you just want a clean slate, run in Terminal from the
`server/` folder:

```bash
./start-mac.command --regenerate
```

This issues a new token (same TTL) and prints a new QR/text — every device needs to be
re-scanned/re-pasted after this, since the old token stops working immediately.

## Changing the TTL later

The TTL is only asked interactively the very first time. To change it afterwards, either:
- delete `relay-identity.json` and run again (this also generates a **new token** — every device
  needs to be re-scanned), or
- pass `--ttl <hours>` **together with** `--regenerate` on a run where you also want a fresh
  token, e.g. `./start-mac.command --regenerate --ttl 24`.

## If the automatic Tor download doesn't work

Some networks/firewalls block outbound access to torproject.org. If that happens, the terminal
prints the exact download URL and target folder so you can install it another way instead:

- **Homebrew (easiest):** `brew install tor` — once it's on PATH, `start-mac.command` finds and
  uses it automatically, no files needed under `mac/tor/` at all.
- **Manual download:** grab the **Tor Expert Bundle** for macOS from
  https://www.torproject.org/download/tor/ — scroll down past the Tor Browser button to the "Tor
  Expert Bundle" table and pick the macOS build matching your Mac (Apple Silicon = `aarch64`,
  Intel = `x86_64`). Extract it and copy the `tor` binary so you end up with:

  ```
  server/mac/tor/tor
  ```

  then make it executable: `chmod +x server/mac/tor/tor`. Run `start-mac.command` again — it'll
  find the manually-placed binary and skip the download.

## Custom Tor location

If `tor` lives somewhere other than `mac/tor/tor` or PATH (e.g. a Homebrew install at a
non-default prefix), point at it directly — this also skips the automatic download entirely:

```bash
./start-mac.command --tor-exe /opt/homebrew/bin/tor
```

or set it once via an environment variable (`export TOR_EXE_PATH=/opt/homebrew/bin/tor` in your
shell profile).

## Running a second, independent relay for testing

For testing "two separate people" scenarios on one Mac — e.g. pairing two iPhones against two
*different* relays, as if each phone belonged to a different person, instead of both sharing this
same one — a second relay can run alongside the main one: its own identity, its own onion address,
its own port (8788 instead of 8787), completely independent of everything above. It shares only the
read-only `tor` binary at `mac/tor/tor` and this same `dist/` build; no state is shared.

1. `./mac/start-relay-b.command` — same first-run flow as `start-mac.command` (asks for a message
   TTL, downloads Tor if needed, prints a QR/connection string), but everything it creates lives
   under `server/instances/b/` instead of `server/` itself.
2. To run it in the background too (recommended, same reasoning as the main relay):
   `./mac/install-relay-b-service.command` (needs step 1 done at least once first, same reason as
   `install-service.command`).
3. `./mac/show-code-b.command` / `./mac/status-b.command` / `./mac/uninstall-relay-b-service.command`
   — same idea as the main relay's own versions, for this second instance.

Point one iPhone's Settings → "My relays" at the **main** relay's connection string, and the other
iPhone's at **this second one's** — each phone's QR code then advertises a different relay, so
pairing them together produces exactly the "two separate people, two separate node servers"
scenario. This is a testing convenience, not a separate product surface — the menu bar app
(`mac/MenuBarApp/`) only manages the main relay; use these scripts directly from Terminal for the
second one.

## Troubleshooting

- **"Node.js was not found"** — install Node.js (nodejs.org or `brew install node`), then open a
  new Terminal / re-double-click the `.command` file.
- **"cannot be opened because it is from an unidentified developer"** — see the Gatekeeper step
  above; this only has to be done once.
- **"automatic download failed"** — see "If the automatic Tor download doesn't work" above.
- **Tor never publishes / times out** — check that `mac/tor/tor` exists and is executable (or
  `--tor-exe`/`TOR_EXE_PATH` points at a real binary), and that macOS's firewall isn't silently
  blocking `tor`'s incoming connection (System Settings -> Network -> Firewall -> Options).
- **"tor process exited (signal SIGKILL) before publishing a hostname", with no Tor log output
  at all beforehand** — or **"Library not loaded: @executable_path/libevent-2.1.7.dylib ...
  missing code signature"** — on Apple Silicon Macs, macOS refuses to run or load any Mach-O
  file with no code signature at all (this applies to `tor` itself AND every `.dylib` it loads).
  `start-mac.command` ad-hoc-signs every binary/`.dylib` in `mac/tor/` automatically as of this
  version; if you're on an already-downloaded copy from before this fix, sign everything by hand
  once:

  ```bash
  find mac/tor -type f \( -name "*.dylib" -o -perm -u+x \) -exec codesign --sign - --force {} \;
  ```

  then run `start-mac.command` again.
- **A device can't reach the relay after scanning** — the app also needs Tor to be running and
  ready (see the app's own Settings -> Network & security status). The relay itself is a Tor
  hidden service, so both ends need working Tor connectivity.
