# unpruuf relay-pool tool

Offline issuing of a signed, company-managed relay server list for unpruuf's cross-platform
(iOS-interop) relay mode — see `../CROSS_PLATFORM_PLAN.md`. No server, no network calls, nothing
installed beyond Node.js itself (uses only Node's built-in `crypto` module). Structural sibling
of `../license-tool/`, but a **separate** Ed25519 key pair and a separate wire prefix — a leaked
relay-pool key only lets someone hand out bogus relay *addresses*, never a valid app license,
and vice versa.

## Why this exists

Every unpruuf user already publishes their own relay address(es) at pairing time — there is
never a requirement that two contacts share a common server. The gap this tool closes is
different: a company running its own relay server(s) wants to hand its employees a ready-made
list of those servers, instead of everyone copy-pasting connection strings by hand, and wants to
be able to update that list later (a server gets decommissioned, a new one comes online) without
re-pairing anyone.

## How it works

A manifest code is a small signed blob:

```
unpruuf-relaypool:v1:<base64url(payload)>:<base64url(signature)>
```

`payload` is `1|<org>|<issuedAtMs>|<relay1>;<relay2>;...`, signed with an Ed25519 private key
that only the issuer holds (`private-key.json`, generated once by `keygen.js`). Both apps verify
it against a public key baked into the app: `RelayPoolManager.PUBLIC_KEY_B64` on Android (Tink's
`Ed25519Verify`), and the matching constant in `RelayPoolManager.swift` on iOS (CryptoKit's
`Curve25519.Signing.PublicKey`) — nobody without the private key can mint a manifest either app
will accept.

**Import is unrestricted by design (v1)**: any user who has the manifest text — however the
company hands it out (email, intranet page, printed card) — can import it in Settings. There is
no separate "enterprise account" concept and no per-device binding, unlike a license code:
importing only ever changes *that device's own* backup relay list
(`RelayManager.setExtraConnectionStrings`), it doesn't register the device anywhere. Re-importing
an updated manifest simply replaces the previous list wholesale.

## First-time setup

```bash
node keygen.js
```

Generates `private-key.json` (gitignored, never shipped in a project ZIP) and prints the public
key. **Back it up somewhere safe and offline** — lose it and you can never issue a manifest under
that public key again; if it's ever compromised, rotate it (new `keygen.js` run) and ship the new
public key in the next app build, which invalidates every manifest issued under the old key.

The public key printed here must match `RelayPoolManager.PUBLIC_KEY_B64` in the Android app
**and** the equivalent constant in `RelayPoolManager.swift` on iOS — both must be the same key.

## Issuing a manifest

```bash
node issue.js --org "Acme GmbH" \
  --relay "unpruuf-relay:v1:acmerelay1xyz.onion:AbCdEf123..." \
  --relay "unpruuf-relay:v1:acmerelay2xyz.onion:GhIjKl456..."
```

Pass one `--relay` flag per server. Prints the manifest code to stdout; `--out manifest.txt`
also writes it to a file. Every relay listed goes into the manifest — the app itself caps how
many it keeps active (`RelayManager.RELAY_POOL_MAX_SIZE`), so it's fine to list every server the
company runs and let each device's app pick.

## Re-issuing after the server list changes

Just run `issue.js` again with the updated `--relay` list and redistribute the new code. Nothing
needs to be revoked — a device simply keeps using whatever it last successfully imported until it
imports a newer one.

## Testing a manifest without touching the private key

```bash
node verify.js "unpruuf-relaypool:v1:...."
```

Does exactly what a device does on import: verifies the signature and prints the parsed org,
issue date, and relay list.
