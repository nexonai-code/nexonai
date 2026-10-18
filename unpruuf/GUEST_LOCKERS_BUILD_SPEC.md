# Guest lockers: build spec for a free, invite-only Client app

Status 18 October 2026. Proposal, nothing built yet. **Internal. Names protocol details; do not give to customers or the public (patent check still running).**

## 0. Read this first

- This repository snapshot contains the older single-node server (`node-mesh-server`, three routes: deposit, fetch, fetchMany). The server described in `CLAIMS_TO_EVIDENCE.md` (seven requests, 250 virtual nodes per server, up to 100 slots per node, pool, lock status, unlock) is the current one. This spec is written against that description. The implementer must first map every "server" statement below onto the real code and write down where slots are addressed. Anything marked **VERIFY** depends on that.
- Packet-size finding F1: the first 8 bytes of a stored packet carry the payload length in clear (`NetworkObfuscation.padPacket`, still so in this snapshot). Guest traffic inherits whatever the packet format is at the time. Land the F1 fix first or together with this work, because guest deposits would otherwise show length to the inviter's operator (who is the inviter).

## 1. Goal

A person with no servers of their own can use the free Client app, only after being invited by a Pro/Business user, and still get the full promise: no identities, no third party, nothing stays longer than 24 hours.

Non-goals:
- NexonAI hosting any node (we run nothing; it would make us operator, a subpoena target and possibly a processor under GDPR Art. 28).
- Client to Client pairing (stays blocked). Client pairs only with Pro, any number of different inviters.
- Any change to how a Pro user writes to their own nodes.
- Any user account, directory or identity for guests.

## 2. The idea in one picture

```
 Client phone                     Inviter's own servers                  Inviter's app
 (no server)                      (customer-run, over Tor)
   |  deposit with guest grant -> [ guest slots ]  <---- fetch (local) ---- reads guest's packages
   |  <---- fetch ---------------- [ inviter's slots ] <-- deposit (owner) -- writes to guest
```

Everything the Client "owns" is a small set of guest slots on the inviter's servers. The inviter reads them where they already are. The Client reads the inviter's lockers as any contact does today. Reciprocity is unchanged; only the place where the Client writes moves.

## 3. Terms

- **Owner**: the Pro/Business user or organisation that runs servers. **Guest**: the Client app user.
- **Grant**: a signed, expiring token that lets a guest deposit on one server, within limits.
- **Slot**: one of up to 100 compartments of a virtual node. **VERIFY** how a slot is addressed in the 250 x 100 server (by tag, by index, by hash).

## 4. Flows

1. **Invite.** Owner app creates an invitation: the owner's pairing data plus a guest block with grants for at least three nodes on three different servers. Shown once as QR, or as file or code for long data. Single use, expires after a short window (default 7 days).
2. **Pairing.** Client app imports the invitation. It checks edition rules (Client pairs with Pro only), stores pairing data and grants encrypted, and from then on deposits into the guest slots like a contact would into its own nodes.
3. **Messaging.** Client to owner: deposit with the guest grant on the owner's server. Owner to client: owner deposits with the owner secret into the owner's own lockers; the client fetches. Both fetch paths are unchanged.
4. **Renewal.** Before a grant expires the owner app sends a new grant to the guest inside the normal encrypted channel (new control message `GRANT_RENEW`). Nothing else is needed.
5. **Revocation.** Soft: the owner app stops renewing, the grant runs out. Hard (optional, see 5.5): owner-only call adds the grant id to a denylist.

## 5. Server changes

### 5.1 Auth on deposit

`PUT /deposit` accepts two kinds of credential, nothing else:
- `Authorization: Bearer <ownerSecret>` as today.
- `Authorization: Guest <grant>.<mac>`.

`grant` = `version | grantId (16 random bytes) | serverId | scope | notAfter | limits`.
`mac` = HMAC over `grant` keyed with a key derived from the owner secret (domain-separated, for example `HKDF(ownerSecret, "guest-grant-v1")`).
The server already has the owner secret, so verification is stateless: recompute the MAC, compare in constant time, check `notAfter`, check `serverId`. No grant is stored. **Do not** reuse the owner secret itself as MAC key.

### 5.2 What a guest can and cannot do

- Only `PUT /deposit`. Never `unlock`, `pool`, `lock-status`, or any future owner route. Route table must make this explicit (allow-list per credential type).
- Reads need no credential today (the routing tag is the credential). Unchanged.
- The packet size, TTL cap (profile 1/6/24 h, a deposit may only ask for less) and queue cap per tag stay as they are.
- **VERIFY**: scope. The server cannot see whose tag a deposit is for (blind store). So a grant cannot say "tag X only". Bind it to what the server can see: server, virtual node and slot range, plus quota (5.3).

### 5.3 Quota

- Per grant: deposits per hour and bytes per hour, token bucket in memory, keyed by `grantId`. Not persisted, never logged.
- Per slot range: capacity comes from the slots reserved for the grant.
- Exceeding a limit returns the same 429 as a full tag queue; the guest app shows a plain message.

### 5.4 Invariants that must still hold (see `CLAIMS_TO_EVIDENCE.md`)

| Row | Today | After this change |
|---|---|---|
| A1 | seven requests, nothing else | seven (eight with 5.5), list updated, 14 unknown paths x 5 methods still 404 even with a guest grant |
| A2 | only the owner writes | **owner or a valid guest grant**; stranger, contact, wrong secret, forged or expired grant refused (401) |
| A3 | reading never changes anything | unchanged |
| A4 | deposit may only shorten life | unchanged for both credential types |
| A5 | five columns per packet | **unchanged**. Do not add a grant column; a packet must never be linkable to a grant on disk |
| A6 | no sender address, user agent, secret stored | add: no grant token, no grantId stored or logged |
| A9 | never logs tag, packet or secret | add grant tokens |
| A10 | settings give no extra capability | new setting `GUEST_GRANTS` (off by default), limits as settings. Turning it on must be the only way to accept guest grants |

### 5.5 Optional hard revocation (decision for the team)

One owner-only route `POST /revoke` with a grant id. A small table holds revoked ids until the grant's own `notAfter`. This is the only persisted grant data and holds no packet link. Skip it in v1 if short validity (default 7 days, automatic renewal) is enough.

## 6. Invitation format

Extends the Business pairing code (fields today: version, message key, ratchet key, routing seed, up to three node addresses, edition).
- New field `g`: list of `(nodeAddress, grant)` for the nodes in the code.
- Same freshness rules as today: new keys per pairing, no user id.
- Must carry **no** durable identifier of the guest. A grant id is random per invitation and per server.
- Size: three grants fit a QR; add file and text-code fallback. **VERIFY** QR capacity with real data.
- The code contains secrets: show once, never store in clear, never log, warn before screenshot (the app is already `FLAG_SECURE`).

## 7. Apps

### 7.1 Pro/Business app (Android now, iOS later)
- "Invite a guest": choose pool/servers, validity, quota. Shows the code.
- Guest list: local label only, expiry date, renew, stop renewing (and revoke if 5.5 exists).
- Automatic renewal before expiry while the guest is a contact.
- Reading guest packages: unchanged, they sit on the owner's own nodes.

### 7.2 Client app (Android)
- Import invitation; stores grants in the encrypted store.
- Deposit with `Authorization: Guest ...` for packages to that inviter. One grant set per inviter; several inviters allowed.
- Handle `GRANT_RENEW`.
- Errors in plain words: grant expired ("ask your contact to renew"), quota reached, server unreachable. **No silent fallback** to any other node or path.
- Edition rules stay: Client pairs with Pro only.
- UI language: the Business apps are English only today (Romanian exists in the main app); decide for the Client.

### 7.3 iOS
Client edition does not exist on iOS yet. Add invitation import, grant storage in Keychain and `GRANT_RENEW` to `ios/IOS_BUSINESS_BUILD_SPEC.md` when the team decides to build a Client for iPhone.

## 8. unpruuf Control
- Per server: guest policy on/off, default limits, optional revoked-grant push (if 5.5).
- Control holds no guest list and learns no identities.
- Buchführung only: licence rules unchanged ("one server per licence").

## 9. Ghost mode
Independent of this work. A guest can use Ghost with the inviter when both are online. Whether the Client edition gets Ghost is a team decision; Ghost is still untested on real phones.

## 10. Security notes (honest)

- The inviter's operator sees deposit timing and volume per grant, never an identity. That is already true for any recipient and belongs in one sentence on the invitation screen.
- A stolen invitation can be used to deposit junk within the quota. It cannot read anything (reads need tags the thief does not have, content is encrypted). Single use and short expiry limit the window.
- Denial of service by one guest is bounded by quota and slot reservation.
- Wording allowed after the checks pass: "Invite-only is enforced by the server, not only by the app." Not allowed: "anonymous", "untraceable", "secure from the inviter's operator".
- GDPR: no new data class. The organisation stays controller; content is encrypted; metadata as above. Needs the usual lawyer/DPO confirmation.

## 11. Capacity and licences

- One guest needs a small, fixed number of slots on a few servers. With up to 25,000 slots per server the slot budget is far larger than any realistic guest count. The real limit is load per server, which has not been measured. Measure before promising a guest count.
- No change to licences. Client stays free. The inviter's servers carry the load. Optional policy for the team: maximum guests per licence.

## 12. Work packages (order)

1. **Server**: Guest credential on deposit, allow-list per credential, quota, setting `GUEST_GRANTS`, tests. Acceptance: forged/expired/foreign-server grants refused, guest cannot reach any other route, TTL and queue caps unchanged, no grant data in the database or logs.
2. **Evidence**: update checks 01 (routes and auth), 02 (storage unchanged: prove five columns), 03 (no logging of tokens), 06 (invitation fields); add check 10 "guest limits" (quota, expiry, scope). Rerun all; update A1, A2, A6, A9, A10 wording in `CLAIMS_TO_EVIDENCE.md` and `SECURITY_CLAIMS.md`.
3. **Pro app**: invite screen, guest list, automatic renewal, `GRANT_RENEW`.
4. **Client app**: import, deposit with grant, renewal, error messages, no fallback.
5. **Control**: guest policy per server.
6. **Docs and materials**: `NODE_MESH_SPEC.md` (new section), `STATUS.md`, Client edition text in `EDITIONS.md`, whitepaper and website (one sentence each, no numbers on public pages).
7. **iOS**: spec update only.
8. **Real test**: two or three real phones, a real VPS, grant expiry and renewal, quota, offline guest, Tor on mobile data.

## 13. Open decisions for the team

1. Default grant validity (proposal 7 days, automatic renewal) and invitation window (proposal 7 days).
2. Default quota per guest.
3. Hard revocation in v1 (adds a route) or only expiry.
4. Maximum guests per licence, or no limit.
5. Ghost in the Client edition.
6. Client app interface languages.
7. Later move of a guest to their own server without re-pairing (needs a node-update message; check what exists in the Node-Mesh code).

## 14. Test plan (minimum)

Server: valid guest deposit accepted; forged MAC, wrong server id, expired grant, tampered scope refused; guest on `unlock` and any owner route refused; quota exceeded gives 429; deposit TTL never longer than the profile; no grant data in database files or logs (search every byte, as check 02 does).
Apps: import, deposit, receive, renewal across expiry, expired grant message, invitation used twice, invitation after expiry, Client pairing with Client still blocked, several inviters on one Client.
Real world: mobile data, doze, server restart, unlock after restart.
