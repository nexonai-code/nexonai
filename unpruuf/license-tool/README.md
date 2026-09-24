# unpruuf license tool

Offline license issuing for unpruuf Standard/Pro (Client is free, never needs a license — see
`AppEdition`/`LicenseManager.requiresLicense`). No server, no network calls, nothing installed
beyond Node.js itself (uses only Node's built-in `crypto` module).

## How it works

A license code is a small signed blob:

```
unpruuf-license:v1:<base64url(payload)>:<base64url(signature)>
```

`payload` is `1|<edition>|<serial>|<customer>|<issuedAtMs>|<expiresAtMs>`, signed with an
Ed25519 private key that only YOU hold (`private-key.json`, generated once by `keygen.js`).
The app verifies it with Tink's `Ed25519Verify` against the matching public key baked into
`LicenseManager.PUBLIC_KEY_B64` — nobody without the private key can mint a code the app will
accept, and nobody can extend an expired one without a fresh signature from you.

**Important limit, by design**: this cannot enforce "exactly N devices total" — no purely
offline system can (no device knows what any other device is doing). What it DOES enforce:
a code must be genuinely signed (can't be forged), and each code self-binds to the first
device it's activated on (copying one activated seat's app data to a second phone is
detected and rejected). "Exactly 350 seats" stays a contractual limit — issue exactly 350
codes and don't hand out more.

## First-time setup

```bash
node keygen.js
```

Generates `private-key.json` (gitignored, never shipped in a project ZIP) and prints the
public key. **Back up `private-key.json` somewhere safe and offline** — lose it and you can
never issue or renew a license under that public key again; if it's ever compromised, treat
every license as untrustworthy and switch the app to a new key pair (which does invalidate
every code issued under the old one).

The public key printed here must match `LicenseManager.PUBLIC_KEY_B64` in the Android app —
it already does for the key pair this project currently ships with. Only rotate it if you
intend to invalidate everything issued so far.

## GUI (Windows, no command line needed)

`gui/` has a local browser-based front end for everything below — same signing logic, still
fully offline. Double-click `gui/start-windows.bat`, it opens a page where you fill in a form
instead of typing flags, and every code you issue is saved and browsable (customer, edition,
serial, expiry) without re-running anything. See `gui/README.md`.

## Issuing licenses (command line)

One license:

```bash
node issue.js --edition pro --customer "Acme GmbH" --count 1 --years 1
```

A 350-seat deal, with a CSV manifest for your own records:

```bash
node issue.js --edition pro --customer "Acme GmbH" --count 350 --years 1 --serial-prefix ACME --out acme-2027.csv
```

Prints `<serial>\t<license code>` per line — hand each employee/device their own line.
`--out` additionally writes a CSV with everything (serial, customer, edition, issued/expires
ISO timestamps, the code itself) for your own bookkeeping. Run `node issue.js` with no
arguments for the full flag list.

## Renewing a seat (after ~1 year)

Run `issue.js` again for that ONE serial (`--count 1`, same `--serial-prefix`/`--start-at` so
the serial number matches what the customer already has), with a fresh `--years`. Nothing
needs to be revoked — the old code simply stops working once its `expiresAtMs` passes; the new
one is entered in the app's Settings → License, replacing it.

## Testing a code without touching the private key

```bash
node verify.js "unpruuf-license:v1:...."
```

Does exactly what the app does on-device: verifies the signature, prints the parsed fields
and days remaining (or how long ago it expired).
