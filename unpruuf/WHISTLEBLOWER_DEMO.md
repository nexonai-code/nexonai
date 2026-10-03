# unpruuf Whistleblower — Demo Runbook (Uni 1 Decembrie 1918 Alba Iulia)

**Sprache:** Android-App (Whistleblower-Edition), Officer-Dashboard, Web-Reporter und Tablet-Relay (relay-android) sind komplett auf Rumänisch — Stand 2026-09-27, siehe CHANGELOG.md. Diese Runbook-Datei selbst bleibt Deutsch (nur für dich).

What got built this session, and exactly how to run the demo you described: Android reporter
scans an officer's QR and sends a message; a relay runs on a tablet; a Windows laptop runs the
officer dashboard; plus a browser-only fallback channel with its own disclaimer.

---

## 1. What exists now

| Piece | Where | Status |
|---|---|---|
| Android "Whistleblower" edition | `unpruuf/app/` (new Gradle flavor `whistleblower`) | Structurally reviewed, **not compiler-verified** (no Android SDK here — same standing caveat as the rest of this app, see STATUS.md §3) |
| Relay (blind mailbox) | `unpruuf/relay-android/` (tablet) or `unpruuf/server/` (any machine) | Built, tested (relay-android LAN toggle + CORS added, not compiler-verified; `server/` changes: 50/50 existing tests pass) |
| Officer dashboard | `unpruuf/officer-app/` (Windows laptop) | **Built AND genuinely run** — TypeScript compiles clean, and a full pairing→report→reply round trip was verified against a real relay instance in this session |
| Browser reporting fallback | `unpruuf/web-reporter/` (any device, any browser) | **Built AND genuinely run** — its own independent crypto port was verified interoperating with the officer-app's, over a real relay, in this session |

**The officer-app and web-reporter are the two pieces with real, run-verified proof, not just
code review** — genuinely rare for this project (see STATUS.md's running "not build-verified"
theme for the Android/iOS apps). Say this plainly if asked how confident to be in each piece.

---

## 2. Before the meeting — one-time setup

### 2.1 Android reporter app
Build the `whistleblowerDebug` (or `whistleblowerRelease`) variant in Android Studio and install
it on the demo phone. First real build/run of this edition — budget time to fix whatever Android
Studio actually reports; the fix loop that's worked all project is: paste the exact error text
back, get a fix, rebuild.

### 2.2 Tablet relay
Install `relay-android` on the tablet. Open it, let Tor bootstrap, then copy the relay's
connection string (`unpruuf-relay:v1:...`) shown on screen — this is `RELAY_CONNECTION_STRING`
below. That's it for Tor-based use (the officer-app and the Android reporter both reach it over
Tor now — see officer-app/README.md's Architecture section).

Only needed for the **web-reporter** part of the demo (§2.4) — it has no Tor client of its own,
so it needs the LAN path instead: **Settings → Allow LAN access → ON**, and note the tablet's
Wi-Fi IP (Android Settings → Wi-Fi → the connected network's details) — the local HTTP port is
always **8787**, so that's `http://<tablet-ip>:8787`, entered on the officer dashboard's first
screen as the address a browser-based reporter should use.

### 2.3 Officer dashboard (Windows laptop)
In `unpruuf/officer-app/`: run `install.bat` once, then `start.bat`. When prompted, paste the
relay's connection string from 2.2 and pick an officer password (write it down somewhere safe —
there is no recovery). First start downloads Tor (~30-50 MB, one-time) and bootstraps a real
connection to the relay's onion address — watch the console for live progress. Once it says
"Dashboard listening", open `http://localhost:3000`.

Skip Tor for a quick offline test instead? Set `RELAY_REACHABLE_BASE_URL` to the tablet's LAN
address (`http://<tablet-ip>:8787`) before running `start.bat` — this needs "Allow LAN access"
from §2.2 turned on too. Not the real demo path; use only for a dry run without internet.

### 2.4 Web-reporter (optional, for the browser-fallback part of the demo)
In `unpruuf/web-reporter/`: `install.bat` then `start.bat`. Open `http://localhost:5173` (or its
LAN address from another device) when you want to show that path.

---

## 3. The demo sequence itself

1. **Officer dashboard is already running**, `http://localhost:3000` open, showing the pairing
   QR.
2. **Phone**: open the Whistleblower app, scan the officer's QR. **One QR for the whole
   organisation** — say this out loud: no per-employee codes, nothing that ties a code to a person.
3. **Laptop**: a few seconds later the case appears on its own, with a case number (`HW-…`). No
   copying, no pasting.
4. **Phone**: chat screen → top strip / "My case": the case number and "Received and confirmed"
   arrive automatically — that is the Art. 9 acknowledgement, done by the system.
5. **Phone**: send a message (this is your actual report text).
6. **Laptop**: within ~8 seconds (the poll interval) the message appears in the case thread.
7. **Laptop**: type a reply, send it. Then change the status to "În lucru" — the phone's "My case"
   screen updates by itself.
8. **Phone**: the reply arrives on the next poll — show the whole round trip working.
9. **(Optional) Tablet**: open `relay-android`'s own screen and point out the "RECENT ACTIVITY"
   log — real STORED/FETCHED events for the messages that just moved, with no content visible
   (this is the "compliance by architecture" argument made concrete: even you, running the
   relay, can't read what just passed through it).
10. **(Optional) Browser fallback**: open web-reporter, paste the officer's code + the relay
    address, send a message the same way — point out the disclaimer banner, and that it's
    talking to the exact same relay and the exact same officer dashboard, just without Tor/RAM-
    only/device hardening.

---

## 4. Talking points for the committee

- **"First company using this the way the law actually wants it — through architecture, not a
  contract."** The relay never sees plaintext or identity — it's a blind mailbox addressed by a
  rotating tag (see `COMPLIANCE.md`). Point at the RECENT ACTIVITY log (step 9) as the concrete
  proof, not just a claim.
- **This is a genuine EU Directive 2019/1937 channel, not just "anonymous chat with extra
  steps."** Every case gets a 7-day acknowledgement deadline (Art. 9(1)(a)) and a 3-month
  feedback deadline (Art. 9(1)(f)) the moment it's created — visible on the dashboard.
- **No independent audit exists yet.** Say this before being asked, same standard `SECURITY_
  CLAIMS.md`/`COMPLIANCE.md` already hold the rest of this project to. "Engineered this way,
  verifiable in source" — not "certified."
- **Free now, small fee possibly from year two** — matches what you told them; nothing in this
  build assumes or requires payment infrastructure, so that's a business decision, not a
  technical dependency.
- **If asked "did you write this code" — be straightforward**: built with Claude Code this
  session, based on your own completed thesis work on whistleblower platforms and NexonAI's
  existing unpruuf architecture. The crypto core is a direct, cross-verified port of the same
  Double Ratchet implementation the Android app has used and refined for months.

## 5. If something breaks live

- **Phone (or laptop) can't reach Tor / pairing hangs**: known risk of live-demo Tor bootstrap on
  unknown venue Wi-Fi — both the phone and now the officer-app itself bootstrap real Tor
  connections. Have mobile data as a fallback network for the phone; for the laptop, a wired/
  tethered connection is a good backup if the venue Wi-Fi is flaky. As a last resort, set
  `RELAY_REACHABLE_BASE_URL` to skip Tor on the laptop (see §2.3) — same-Wi-Fi-as-tablet only.
- **Dashboard doesn't see the case after pasting the code**: check the officer-app console
  window — it prints Tor bootstrap and relay connectivity errors directly.
- **Nothing arrives after ~30 seconds**: the poll interval is 8s by default; three misses in a
  row is a real problem, not just latency — check `relay-android`'s RECENT ACTIVITY log for
  whether anything was even STORED.

---

## 6. What's explicitly NOT done yet (say so if asked, don't oversell)

- Android APKs were compiled and unit-tested here (see STATUS.md's "Build-verification baseline"),
  but never installed/run on a real phone — first real device run happens on your machine.
- officer-app's Tor client was verified reaching a real handshake with the live Tor network in
  this session's sandbox, but a full bootstrap completing end-to-end on a real internet
  connection hasn't been confirmed outside that sandbox yet — should behave like any other Tor
  client (Tor Browser included), but confirm on your own laptop before the meeting.
- Single-relay routing only — a case's replies always go through the one relay this officer-app
  instance is configured with, not a multi-relay pool.
- No case export/audit-log/multi-officer support — this is the "Basis-Grundgerüst" you asked
  for, not the full case-management suite.
