# Independent security review: Android app

**Audit brief, part 2 of 2** (part 1: Node server)
NexonAI Consulting SRL, Alba Iulia, Romania. Draft of 19 October 2026.
**Confidential.** This brief contains protocol details while a patent check is running. Share it only under a confidentiality agreement.

## 1. What we want to be able to say afterwards

1. The app has no identities. There is no account, phone number, e-mail address or user name, and the pairing code carries no user id.
2. Nothing goes to third parties. On the normal path the app talks to nobody except through Tor, to the customer's own servers only.
3. A message is written to the sender's own node and read from the contact's nodes, and nobody who runs a node can read it, name its sender or tell a real message from cover traffic.
4. Messages are never written to the phone's storage.
5. Keys and secrets on the phone are protected by the phone's key store. The panic PIN removes what we say it removes.
6. The cryptography and the key handling are sound for the stated threat model.
7. The app a customer installs is the app that was reviewed. The report names its fingerprint.

We do not expect a certificate. We expect a report with findings and severities, a statement of coverage and the release fingerprint.

## 2. The app in one page

- Kotlin, Jetpack Compose, Hilt, Room with SQLCipher, Tink (Android Keystore master key), Tor through the Guardian Project's tor-android, bridges (obfs4, Snowflake) through IPtProxy.
- One code base, several builds: `standard`, `pro` (Business, the main product), `client`, `group` (Pro Groups), `whistleblower`, `press`. **Priority for this review: `pro`, then `group`.** The shared code is reviewed once. The parts specific to `whistleblower` and `press` are out of scope for this round.
- Each contact gets its own keys. A pairing code (QR or text) holds a version, a message key, a ratchet key, a routing seed, up to three node addresses and the edition. There is no user id.
- Sending: Double Ratchet, then an outer AES-256-GCM layer with a per-contact key, padded to a 4096-byte packet. The app deposits it with the owner secret on its own node. Reading: the app fetches by routing tag (HMAC of the pairing seeds and the hour) from the contact's nodes, 26 tags per window.
- Nodes: one per Android node app or phone, or up to 250 per customer server. The user holds node lists, chooses a list per contact and the contact gets three nodes from it.
- Messages live in memory only and are removed after 5 minutes or when the app locks. Contacts and node settings are stored; the secrets among them are encrypted with the phone-bound key.
- Protection: PIN, panic PIN, lock-out after wrong tries, optional fingerprint, screenshot and app-switcher block, root check and a build expiry (release builds).
- Pro Groups: local groups with a group code. A message goes one-to-one to each member (up to 10 including the sender). A phone can act as a temporary node, in memory only.

## 3. Preconditions NexonAI completes before kick-off

- A tagged release, built and signed with the release key, with its fingerprint. A matching debuggable build for dynamic analysis, clearly marked.
- Wire format v2: the message length and a version byte inside the encrypted part, every stored packet uniform 4096 bytes, cover packets random bytes. Test vectors for the format.
- The evidence package re-run on the tag. Unit tests for the app run green on the tag.
- A list of the limits in section 6.

## 4. Claims to test

IDs refer to `evidence/CLAIMS_TO_EVIDENCE.md`.

| # | Claim | What we ask the auditor to do | Our evidence now |
|---|---|---|---|
| A1 | No identities. The pairing code has no user id and the contact record has no phone, e-mail or account. No analytics, advertising or Google services library. Nine permissions, none for contacts, location, phone, SMS, microphone, accounts, calendar or storage. | Review manifest, dependencies and the code that builds and reads pairing codes. Confirm on the release APK. | B1 to B8, B11; scripts `04`, `06` |
| A2 | Network traffic goes through Tor only. A same-Wi-Fi shortcut exists only for direct contacts, never for Business or whistleblower. | Capture the traffic of a phone for several hours with Business contacts. Test a network that blocks Tor (bridges, Snowflake) and name every third party contacted on those paths. | B7, B9 (code only; no capture yet) |
| A3 | Routing tags are computable only by the two partners, change every hour and cannot be linked across contacts. Writing needs the owner secret, reading needs the tag. | Review the tag construction and window, the per-contact keys and node choice. Run the real flow on two phones and a server. | B2, B3; script `05`; no third-party run |
| A4 | Messages are never on disk. | Take a forensic image of a phone after use, with and without root. Search the image for message text. Review the memory handling and its limits (strings made for the screen cannot be overwritten). | D1 (read only) |
| A5 | Secrets are protected at rest: ratchet and onion keys, owner secrets of own nodes, node lists, feed keys, relay token. The database is encrypted. | Review the key store use (`CryptoManager`, `SealedStrings`, `IdentityManager`, `PinManager`), the SQLCipher key handling, backup settings and what remains in clear. Check upgrades from older versions. | D2, Tier 2 in `SECURITY_CLAIMS.md`; unit tests |
| A6 | The panic PIN removes contacts, sessions, onion keys, groups, own nodes, node lists, feed sources, relay setup and the organisation code. The identity keys, licence and PINs stay. Wrong PINs lock the pad (5th wrong try: 30 s, doubling, at most 1 hour). | Test on devices from two makers. Check what remains. Judge a 4-digit PIN against someone with root, who can reset the counter. Judge the loss of the phone key (the app then says it cannot read the PIN). | D3, D3a; unit tests for the schedule |
| A7 | Screenshot, screen recording and the app switcher show nothing, including dialogs. Notifications say only that a message arrived. Clipboard copies of codes are marked sensitive and cleared after 60 s. | Test on devices from two makers and on Android 12 and 13 or later. | B10; device test open |
| A8 | The crypto is sound: Double Ratchet (X25519, HKDF, XChaCha20-Poly1305), a session start without signed identities (a reduced X3DH), the outer AES-256-GCM layer, wire format v2 (padding inside the authenticated part, uniform packets). | Review the protocol and the code. Decide whether the reduced session start is acceptable for the threat model. Check IV handling, key separation, error handling and replay. | C1 to C6; cross-checks between Kotlin and TypeScript |
| A9 | Input from outside is handled safely: pairing codes, node-list files, feed content, group codes, images, attachments, malformed packets. | Fuzz these inputs. Test oversized and malformed images (a decoder guard exists since 19 October 2026). Review the node-list parser and the confirmation dialog. | Parser limits and tests |
| A10 | Licence and device check run offline and send nothing. A root check and a build expiry exist in release builds. | Review `LicenseManager`, `RootDetector` and the expiry gate. State how far they hold against a modified app (we call them honest friction, not protection). | B8, F2 |
| A11 | The delivered app equals the reviewed source. | Rebuild from the tag, compare the result, check the signature and the R8 mapping. | Release key in place; no reproducible build yet |
| A12 | The Tor and bridge integration works as described and fails safely. | Review `TorManager`, the bridge manager and the pluggable transports: start, circuit use, behaviour when Tor is blocked, what leaks when it fails. | Not yet reviewed by us beyond B7 |

## 5. How we would like the work done

1. Static review of the files named above and of the shared code paths for sending and reading.
2. Dynamic tests on two of your Android phones (rooted and not), with our debuggable build, then confirmation on the release build.
3. A traffic capture of several hours (A2) against a node server you control, if possible combined with part 1.
4. A cryptography review by a specialist (A8).

We can provide the tag, build instructions, test licences, QR codes and a server. You provide the phones and the capture.

## 6. Limits we state ourselves

- A phone that is already compromised, and a root user with time, can read what the app can read. The PIN lock-out and the panic PIN are not protection against that.
- A 4-digit PIN has little entropy. The lock-out and the phone-bound storage of the hash are the protection. The counter lives in the app's storage and the device clock.
- Strings shown on screen cannot be overwritten in memory. Messages are removed from our own store and not from the runtime's copies.
- Messages that cannot be sent wait in memory and are lost if the app is closed. This follows from keeping nothing on disk.
- The bridge and Snowflake fallbacks contact third parties (broker, front domain, STUN servers). "Only Tor" holds for the direct path.
- Whoever gives a user a node list decides which nodes the user writes to. The content stays encrypted but the routing tags and times are visible to that node's operator.
- A global observer who sees both ends of the network can correlate timing.
- Debug builds are debuggable and skip the root check. They are for tests only.
- The licence for apps is tied to the device; it is bookkeeping, not copy protection.

## 7. Out of scope

Tor and Android themselves, the phone maker's software, the customer's hosting, a global observer, legal assessment (GDPR, Directive 2019/1937), the iOS app, the `whistleblower` and `press` specific parts for this round, the officer app, the node server (part 1), the customer tool.

## 8. Deliverables

- Report with findings, severities, evidence and recommendations.
- A statement of what was covered and what was not, per claim above.
- The release fingerprint of what was reviewed.
- A re-test of fixed findings.
- Permission for NexonAI to quote the summary and the coverage statement. We will not quote more without your agreement.

Timing, price and contact: to be agreed.
