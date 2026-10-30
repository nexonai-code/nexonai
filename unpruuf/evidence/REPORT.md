# Evidence report

- Run: 2026-10-25T20:53:37.804Z
- Source: git 046f9ec879abe332194d2134afea24b3d2d8a817 (with uncommitted changes)
- Node.js v22.22.0, linux x64
- Checks: 99 passed, 0 failed. Findings (claims the evidence does not support): 1.
- Node server test suite: 137 passed, 0 failed, 1 skipped, of 138.
- Online comparison of the Tor hashes: no.

This report shows what these scripts could check on this source and this machine. It is not a security audit and not a certificate. Anything marked "needs an auditor" in CLAIMS_TO_EVIDENCE.md is not covered here.

## Findings

- **F1** (08-packet-header.js): Without a key a stored packet shows its payload length (44 for a cover packet, 31 / 329 / 3029 for texts of 2, 300 and 3000 characters in this simplified model). On the wire the size is always 4096 bytes. What leaks is the number inside the packet, to whoever can read the node's database or the relay. The way to close it is to put the length inside the encrypted part (a wire-format change for every client).

## 01 What the node server can do (its whole surface)

27 passed, 0 failed

- PASS registered routes are exactly the documented ones (GET /fetch, GET /health, GET /lock-status, GET /pool, POST /fetchMany, POST /unlock, PUT /deposit)
- PASS there is no route that deletes, wipes, lists or exports
- PASS undocumented paths answer 404 for GET, POST, PUT, DELETE, PATCH (even with the owner secret)
- PASS DELETE /fetch is refused (status 404)
- PASS PATCH /fetch is refused (status 404)
- PASS PUT /fetch is refused (status 404)
- PASS POST /fetch is refused (status 404)
- PASS DELETE /deposit is refused
- PASS deposit without a secret is refused (401)
- PASS deposit with a wrong secret is refused (401)
- PASS a contact (who knows only the routing tag) cannot deposit
- PASS deposit with the owner secret is accepted (201)
- PASS GET /pool needs the owner secret
- PASS fetch returns the blob without any secret (the tag is the credential)
- PASS fetching twice gives the same answer (nothing is consumed)
- PASS fetchMany returns it too and still deletes nothing (rows before 1, after 1)
- PASS a tag that does not exist answers with an empty list, not an error
- PASS the fetch answer contains only "blobs" (no sender, no time, no address) (blobs)
- PASS a deposit asking for 10 days is capped at the node profile (6 h) (6 h)
- PASS a deposit asking for 5 s gets 5 s
- PASS an invalid routing tag is refused (400)
- PASS an oversized request is refused (status 413)
- PASS a negative or zero lifetime is refused (400)
- PASS broken JSON gets a short error without stack trace, file path or library name ({"error":"bad request"})
- PASS an oversized body is refused (413) with a short error (status 413)
- PASS a ciphertext that is not base64 is refused (400)
- PASS a node that holds its total ceiling refuses further deposits (507) (statuses 201, 507)

## 02 What the node server keeps on disk

9 passed, 0 failed

- PASS the database has one data table (blobs) and nothing else (blobs, sqlite_sequence)
- PASS the table has exactly these columns: id, tag, blob, created_at, expires_at (blob, created_at, expires_at, id, tag)
- PASS three deposits, three rows
- PASS the owner secret is not on disk
- PASS no client address is on disk (127.0.0.1, 203.0.113.77, 198.51.100.9)
- PASS no user agent is on disk
- PASS before expiry the first blob is in the file (sanity check of the method)
- PASS the sweep removed all expired packets (removed 3, left 0)
- PASS after expiry the packet bytes are gone from the files (secure_delete overwrites them)

Notes:
- files examined: node-mesh.sqlite, node-mesh.sqlite-shm, node-mesh.sqlite-wal (148136 bytes)

## 03 What the node server source does with senders, network and logs

8 passed, 0 failed

- PASS no code reads the caller's address, port, user agent or forwarded-for header
- PASS network modules are imported only where expected
- PASS the export-list tool talks only to this computer (127.0.0.1), never outward (hosts: 127.0.0.1)
- PASS the only outbound HTTPS request in the server is the one-time Tor download (node-mesh-server/src/tor/torDownload.ts:155)
- PASS every web address written in the code is the Tor archive or localhost (http://localhost, https://archive.torproject.org)
- PASS every fetch( is a relative address inside the local setup pages
- PASS request handling and storage never log a tag, a packet or a secret
- PASS the server has exactly three runtime dependencies: better-sqlite3, express, qrcode (better-sqlite3, express, qrcode)

Notes:
- node-mesh-server/src/admin/adminApp.ts:90  the setup page checks the connection comes from this computer or a private network (not stored, not logged)
- network imports found: exportListCli.ts (http), index.ts (http), tor/torControl.ts (net), tor/torDownload.ts (https)
- production packages in package-lock.json (including nested): 133. An auditor should review these or ask for an SBOM.

## 04 What the Android app can do towards the outside (manifest, libraries, source)

16 passed, 0 failed

- PASS the app asks for exactly these permissions: ACCESS_NETWORK_STATE, CAMERA, CHANGE_WIFI_MULTICAST_STATE, FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC, INTERNET, POST_NOTIFICATIONS, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, WAKE_LOCK (ACCESS_NETWORK_STATE, CAMERA, CHANGE_WIFI_MULTICAST_STATE, FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC, INTERNET, POST_NOTIFICATIONS, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, WAKE_LOCK)
- PASS no permission for contacts, location, phone, SMS, microphone, accounts, calendar or storage
- PASS backup is switched off (allowBackup=false, fullBackupContent=false)
- PASS clear-text traffic is switched off (usesCleartextTraffic=false)
- PASS only one component is reachable from other apps, and it is the launcher activity (<activity
            android:name=".MainActivity"
            android:exported=)
- PASS no analytics, crash-reporting, advertising, push or Google Play services library is a dependency
- PASS the app uses no ready-made HTTP client, WebView or download manager
- PASS no source file imports telephony, location, contacts, accounts, call log, Google services or Firebase
- PASS every client socket the app opens goes through the Tor SOCKS proxy, except one (through Tor: P2PNetworkManager.kt:2879, RelayClient.kt:145, Socks5.kt:51; direct: P2PNetworkManager.kt:2873)
- PASS the app's own SOCKS5 client connects only to the local Tor proxy (127.0.0.1), and every caller passes that address (callers: NodeMeshClient.kt:303; connect calls in Socks5.kt: 1)
- PASS all listening sockets are bound to 127.0.0.1, except one random-port socket for the same-Wi-Fi shortcut (loopback: P2PNetworkManager.kt:1343, PhoneTempNode.kt:125; open: P2PNetworkManager.kt:3062)
- PASS that open socket exists only while a direct contact exists: never in the whistleblower edition, never for Business (Node-Mesh) contacts (definition + 1 call; guard found: true; call behind the guard: true)
- PASS the Android device id is read in exactly one place (the local licence check), and nowhere else (app/src/main/java/com/nexonai/unpruuf/domain/license/LicenseManager.kt:162)
- PASS that value is hashed and kept on the phone (the licence check has no network call)
- PASS web addresses in the source: only the Snowflake broker front and a documentation link (https://1098762253.rsc.cdn77.org)
- PASS screenshots and the app-switcher preview are blocked (FLAG_SECURE is set) (app/src/main/java/com/nexonai/unpruuf/MainActivity.kt:102, app/src/main/java/com/nexonai/unpruuf/MainActivity.kt:103)

Notes:
- non-Android-platform libraries (an auditor should review each): com.google.crypto.tink:tink-android:1.11.0, com.google.zxing:core:3.5.3, com.journeyapps:zxing-android-embedded:4.3.0, com.netzarchitekten:IPtProxy:5.5.1, info.guardianproject:tor-android:0.4.8.16, net.zetetic:android-database-sqlcipher:4.5.4, org.nanohttpd:nanohttpd:2.3.1
- the one direct socket (app/src/main/java/com/nexonai/unpruuf/domain/network/P2PNetworkManager.kt:2873) is the same-Wi-Fi shortcut for direct (onion) contacts. It is never used for Business or Node-Mesh contacts, and not at all in the whistleblower edition (see SECURITY_CLAIMS.md, 2026-10-01).
- Only if the user is on a network that blocks Tor does the app fall back to bridges. The Snowflake path then contacts a broker through a CDN front and STUN servers (see ConnectionPaths.kt). That is Tor's own circumvention, but it IS contact with third-party infrastructure, so "the app talks only to Tor" holds for the direct path and must be worded carefully for the fallback path.

## 05 Routing tags: formula, fixed values, and what they reveal across contacts

14 passed, 0 failed

- PASS pair secret for the fixed seeds matches the published value
- PASS tag for epoch 0 matches
- PASS tag for epoch 1 matches
- PASS tag for epoch 486000 matches
- PASS both partners get the same tag whoever is "mine"
- PASS Android IdentityManager: pair secret is SHA-256 over the two seeds in sorted order
- PASS Android IdentityManager: tag is HMAC-SHA256(pair secret, "routing:<epoch>"), Base64 without line breaks
- PASS Android: one epoch is one hour (3 600 000 ms)
- PASS Android: every pairing draws fresh message key and routing seed from SecureRandom (32 bytes each)
- PASS 300 contacts get 300 different own seeds (no seed is shown to two contacts)
- PASS 300 contacts get 300 different tags in the same hour
- PASS the 26 tags of the receive window of one contact are all different
- PASS a different seed for the same epoch gives a different tag (an outsider without the seeds cannot compute it)
- PASS tags look uniformly random: share of 1-bits over 4000 tags is within 0.5 ± 0.005 (share 0.5001)

Notes:
- What this does not show: that no structure exists (that rests on HMAC-SHA256 being a pseudo-random function), or anything about traffic timing and volume, which the next scripts and the auditor scope list as open.

## 06 What the pairing code and the packets carry (identity fields)

9 passed, 0 failed

- PASS the Business pairing code has exactly the fields v, p, k, s, n, e (e, k, n, p, s, v)
- PASS there is no user id field ("u") in the code that is written
- PASS a unit test pins "the encoded QR carries no user id"
- PASS message key, ratchet key pair and routing seed are generated per pairing, not per device
- PASS the pending values are cleared once a scan binds them to a contact
- PASS the contact record has no field for a phone number, e-mail address or account (Node-Mesh contacts hold keys, node addresses and a name the user typed)
- PASS outer layer is AES-256-GCM with a fresh random 12-byte IV per packet
- PASS the ratchet header holds a key, a chain length and a message number, and nothing else (it sits INSIDE the outer encryption)
- PASS the message payload is one type byte plus content (no sender or recipient field)

Notes:
- meaning of the fields: v version, p message key (fresh for this one pairing), k ratchet public key (fresh), s routing seed (fresh), n up to three node addresses, e edition name.
- fields of the contact record: id, onionAddress, publicKey, rotationFactor, displayName, isClientSlot, addedAt, lastSeen, x25519RatchetPublicKey, crossPlatform, myRelayConnectionString, theirRelayConnectionString, myGeneration, theirGeneration, isVerified, remoteUserId, myWireIdentity, theirWireIdentity, manualRelayOwner, nodeMesh, theirNodeMeshRoutingSeed, theirNodeAddresses, myPairMessageKey, myPairRatchetPrivateKey, myPairRatchetPublicKey, myPairRoutingSeed, myNodeAddresses, guestGrants, tempNodeAddress, tempNodeOwnerSecret, tempNodeActive, theirTempNodeAddress, caseNumber, caseStatus, caseOpenedAt, caseAckDueAt, caseFeedbackDueAt, caseUpdatedAt, intakeStartedAt, intakeLastSentAt, messageTtlHours, tempNodeOnPhone
- control signals defined in the app: UNPRUUF_REVOKE_V1, UNPRUUF_DELETE_CONTACT_V1, UNPRUUF_DUMMY_V1, UNPRUUF_MAIN_ONION_V1:, UNPRUUF_NEWID_V1:, UNPRUUF_VERIFIED_ONION_V1:, UNPRUUF_RELAYOWNER_V1:, UNPRUUF_NODEMIGRATE_V1:, UNPRUUF_TEMPNODE_V1:, UNPRUUF_TEMPNODE_OFF_V1, UNPRUUF_WECHSEL_V1:

## 07 The downloaded Tor program is checked against pinned SHA-256 values

7 passed, 0 failed

- PASS node-mesh-server/src/tor/torDownload.ts: four pinned values (Windows, Linux, macOS Intel, macOS Apple Silicon) (windows-x86_64, linux-x86_64, macos-x86_64, macos-aarch64)
- PASS node-mesh-server/src/tor/torDownload.ts: the download is hashed and compared before it is extracted
- PASS server/src/torDownload.ts: four pinned values (Windows, Linux, macOS Intel, macOS Apple Silicon) (windows-x86_64, linux-x86_64, macos-x86_64, macos-aarch64)
- PASS server/src/torDownload.ts: the download is hashed and compared before it is extracted
- PASS officer-app/src/tor/torDownload.ts: four pinned values (Windows, Linux, macOS Intel, macOS Apple Silicon) (windows-x86_64, linux-x86_64, macos-x86_64, macos-aarch64)
- PASS officer-app/src/tor/torDownload.ts: the download is hashed and compared before it is extracted
- PASS all three copies pin the same version and the same values (15.0.19, 15.0.19, 15.0.19)

Notes:
- pinned version: 15.0.19. The Android app does not download Tor: it carries the library tor-android (checked as a dependency, see 04).
- offline run. Add --online to compare with the Tor Project's signed list (needs network and gpg).

## 08 What a stored packet shows without a key (finding F1)

5 passed, 0 failed

- PASS a stored packet is exactly 4096 bytes
- PASS its first four bytes, readable without any key, give the payload length (a cover packet shows 44)
- PASS the length is exactly the length of what was encrypted (iv + plaintext + tag)
- PASS different message lengths show as different numbers (31, 329, 3029)
- PASS PacketMetadataTest (real app classes) ran and passed: it pins that the leak exists today (4 tests, 0 failures)

## 09 Known vulnerabilities in the libraries of the server programs (npm audit)

4 passed, 0 failed

- PASS node-mesh-server: no known vulnerability in production libraries (critical 0, high 0, moderate 0, low 0)
- PASS server: no known vulnerability in production libraries (critical 0, high 0, moderate 0, low 0)
- PASS officer-app: no known vulnerability in production libraries (critical 0, high 0, moderate 0, low 0)
- PASS control: no known vulnerability in production libraries (critical 0, high 0, moderate 0, low 0)

Notes:
- license-tool: no package-lock.json, not checked
- relaypool-tool: no package-lock.json, not checked
