# iOS build order: free, invite-only Client app with guest lockers

Status 18 October 2026. Internal. Names protocol details; not for customers or the public (patent check still running).

Read first, in this order: `GUEST_LOCKERS_BUILD_SPEC.md` (design, sections 1 to 11), `guest-grants/FORMAT.md` (byte format), `guest-grants/vectors.json` (test vectors), then the iOS Business build order `IOS_BUSINESS_BUILD_SPEC.md` (not in this repository snapshot; it is in the handover package of 14 October 2026).

## 1. Goal

An iPhone user without servers of their own can use the free Client app after being invited by a Pro/Business user. The Client writes into guest slots on the inviter's servers and fetches from the inviter's lockers, over Tor. No account, no phone number, no NexonAI server.

Out of scope: Pro Groups, Ghost, hosting by NexonAI, Client to Client pairing (stays blocked), any new identity.

## 2. Prerequisite

The iOS Business client (Node-Mesh) must exist first: pairing code `v,p,k,s,n,e`, deposit and fetch against nodes through Tor, ratchet session, local contact store, hourly routing tags. Guest support is an addition to that, not a separate stack. If it does not exist yet, build its packages first and add this order afterwards. Packet size and the length header: take the packet format as it is when you build (finding F1 is open in the Android code snapshot; follow whatever the team decided).

## 3. What to build

### 3.1 `GuestGrant` in `UnpruufCore` (pure Swift, no UIKit)
- `issue(ownerSecret:spec:)`, `parse(token:)`, `needsRenewal(token:now:window:)`, `authorizationHeader(token:)`, `encodeList` / `decodeList(raw:max:)`.
- Use CryptoKit: `HKDF<SHA256>.deriveKey(inputKeyMaterial:salt:info:outputByteCount:)` with empty salt, info `"unpruuf guest grant v1"`, 32 bytes; `HMAC<SHA256>` over `"unpruuf-guest-grant-v1\0" || grant`.
- base64url without padding. Big-endian fields (`withUnsafeBytes`, `UInt64(bigEndian:)`, never host order).
- **Acceptance:** an XCTest reads `guest-grants/vectors.json` and reproduces every token byte for byte, parses every field back, rejects malformed tokens (empty, one segment, three segments, wrong version, wrong length), and round-trips the grant list. The Android JVM test `GuestGrantTest.kt` is the model; mirror its cases.

### 3.2 Pairing code field `g`
- Extend the Node-Mesh pairing payload with `guestGrants: [String]`, index-aligned with the node addresses. Absent for normal pairings; parsing must stay compatible with codes that have no `g`.
- On import keep at most as many grants as addresses; an unreadable token becomes an empty slot (see `decodeList`).
- Android reference: `NodeMeshPairing.kt` in `screens/qrpair`.

### 3.3 Deposit as guest
- In the Node-Mesh client, add `depositAsGuest(node:grant:tag:ciphertext:ttl:)` returning an enum: `ok`, `grantRefused` (HTTP 401), `quotaReached` (429), `failed`.
- Header `Authorization: Guest <token>`; same body as an owner deposit. **No fallback** to another node, another path or the owner credential on any result. Android reference: `NodeMeshClient.depositAsGuest`.
- Never log the token, the grant id or the header.

### 3.4 Storage
- Grants are secrets: store in the Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`), one set per inviter (a Client may have several inviters). Not in iCloud Keychain, not in backups.
- Remove the grants when the contact is deleted.

### 3.5 Renewal
- New control message `GRANT_RENEW` through the existing encrypted channel (same shape as the other control signals in `ControlSignals.swift`). **Built on Android 26.10.2026, iOS must match byte for byte.** Plain text: `UNPRUUF_GRANTRENEW_V1:` followed by up to 3 entries joined with `;`, each entry `<v3 onion address>,<grant token>` (address without the `unpruuf-node:v1:` prefix). The owner app sends it every quarter of the grant validity (7-day grants: every 42 hours), long before expiry; a lost renewal is covered by the next one. The Client accepts it only from a contact that already holds guest grants, drops every entry whose address is not a v3 onion or whose token does not read as a grant or has run out, and replaces BOTH node lists and the stored tokens with exactly the remaining entries (so a renewal also moves the guest to new nodes). Nothing usable left: ignore. Reference: `GuestRenewal.kt` and `GuestRenewalTest.kt` in the Android app.
- Client side check on each app start and before each deposit: `needsRenewal` true means show a quiet hint; expired means stop depositing and show "Ask your contact to renew your access". No silent retry loop.

### 3.6 Client edition rules
- New app target `UnpruufClient` (free). Pairs with Pro only; Client with Client is refused. Several inviters allowed.
- Interface languages: English now; Romanian if the Business client has it.

### 3.7 Owner side (only if the iOS Pro app exists)
- "Invite a guest": choose pool/servers, validity (proposal 7 days), quota (proposal 60 deposits and 1 MiB per hour), shows the code as QR, with file or text-code fallback for long data. One grant per node, new grant id per invitation and per node (`SecureRandom` equivalent: `SystemRandomNumberGenerator` / `SecRandomCopyBytes`).
- Auto renewal while the guest is a contact; "stop renewing" action.
- If the iOS Pro app does not exist yet, skip 3.7. Owner invitations then come from the Android Pro app.

## 4. iOS limits to respect
- Receiving only while the app is open or during short background fetches; do not promise push. Guests poll like every other contact.
- No local server on iPhone: a Client never acts as a node.
- Tor on iOS: follow the Business order (bridges, circuit warm-up). Test on mobile data.

## 5. App Store
- The Client app is only usable with an invitation. Apple review needs a way in: prepare a **demo invitation** for the reviewers (a grant against a test node run by the team, long validity, low quota) and put the access steps in the review notes. Without it the app is likely rejected as non-functional.
- No account creation, so no "sign in with Apple" question. Privacy label: no data collected by us; state that messages are end-to-end encrypted and routed via the inviter's servers.
- Distribution alternative for organisations: Apple Business Manager / custom app. Decision for the team.

## 6. Test against the reference server
```
cd node-mesh-server && npm install && npm run build
NODE_MESH_GUEST_GRANTS=1 EPHEMERAL=1 node dist/index.js    # prints the owner secret
```
Issue a token with the Swift `GuestGrant.issue` using that owner secret, `PUT /deposit` with `Authorization: Guest <token>`, expect 201; expired, tampered or foreign tokens 401; the third deposit with `depositsPerHour = 2` 429. Without `NODE_MESH_GUEST_GRANTS=1` every guest token gets 401.

## 7. Acceptance checklist
1. Vector test green (all cases byte for byte).
2. Guest deposit 201 / 401 / 429 against the reference server, with the mapping to the enum.
3. Pairing code with and without `g` parses; Client with Client refused.
4. Grants only in the Keychain, never in logs, never in backups.
5. Renewal replaces tokens; expired grant stops deposits with the plain message.
6. Real iPhone on mobile data: deposit, fetch, receive, renewal across expiry, server restart.

## 8. Open decisions for the team
Default validity and quota; hard revocation (needs a server route) or expiry only; Romanian UI; Apple Business Manager vs App Store; demo invitation set-up for review.
