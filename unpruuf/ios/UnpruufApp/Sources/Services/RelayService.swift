import Combine
import Foundation
import UnpruufCore

/// Ties the crypto/protocol core to the relay-only transport: mirrors `P2PNetworkManager.kt`'s
/// `attemptDelivery`/`ingestPacket`/`startRelayPoll`, adapted for cross-platform mode where the
/// relay is the *only* delivery path (no LAN/direct-onion fallback — see `CROSS_PLATFORM_PLAN.md`).
@MainActor
final class RelayService: ObservableObject {
    static let backoffInitialMs: UInt64 = 3_000
    static let backoffMaxMs: UInt64 = 15_000

    /// Pure so it's unit-testable without networking — mirrors `P2PNetworkManager.nextBackoff`.
    static func nextBackoff(_ current: UInt64) -> UInt64 { min(current * 2, backoffMaxMs) }

    private let identity: Identity
    private let contactStore: ContactStore
    private let messageStore: InMemoryMessageStore
    private let keychain: KeychainStore
    private let torController: TorController
    private let http = SocksHTTPClient()

    private struct PendingDelivery {
        let messageId: String?
        let contactId: String
        let padded: Data
        /// Wire tag and destination relays, snapshotted at enqueue time rather than re-read from
        /// `contactStore` on every delivery attempt — see `attemptDelivery`'s doc comment for why
        /// this matters: a contact can be deleted (as `ControlSignals.deleteContact` itself does,
        /// right after enqueueing) while this item is still queued/retrying, and re-reading the
        /// (now-gone) contact used to make every subsequent attempt fail forever, silently.
        let wireTag: String
        let relayCandidates: [String]
    }

    private var deliveryQueue: [PendingDelivery] = []
    private var flushTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?

    private struct ChunkReassembly {
        let header: RatchetHeader
        var pieces: [Data?]
        var received: Int
        var isComplete: Bool { received == pieces.count }
    }
    private var chunkReassembly: [String: ChunkReassembly] = [:] // keyed by senderId

    init(identity: Identity, contactStore: ContactStore, messageStore: InMemoryMessageStore, keychain: KeychainStore, torController: TorController) {
        self.identity = identity
        self.contactStore = contactStore
        self.messageStore = messageStore
        self.keychain = keychain
        self.torController = torController
    }

    // MARK: - Sending

    /// Double-Ratchet-encrypts `plaintext`, splits it into as many outer packets as needed, and
    /// enqueues all of them (or none) — a partially-enqueued chunked transfer would leave the
    /// receiver's reassembly waiting forever for a chunk that never arrives.
    func sendMessage(to contactId: String, plaintext: Data, messageId: String?) async {
        guard let contact = contactStore.get(id: contactId) else { return }
        do {
            let state = try loadOrCreateSession(for: contact)
            let pairSecret = identity.pairSecret(contactMsgKey: contact.messageKey)
            let encrypted = try DoubleRatchet.encrypt(state: state, plaintext: plaintext, associatedData: pairSecret)
            keychain.saveRatchetState(contactId: contactId, state: state)

            let tag = identity.myWireTag(contactMsgKey: contact.messageKey, generation: contact.myGeneration)
            let relayCandidates = contact.theirRelayConnectionStrings

            let frames = RatchetFrame.split(header: encrypted.header, ciphertext: encrypted.ciphertext)
            var toEnqueue: [Data] = []
            for frame in frames {
                let encoded = try RatchetFrame.encode(frame)
                let sealed = try OuterEnvelope.encrypt(plaintext: encoded, contactKey32: contact.messageKey)
                guard sealed.count <= NetworkObfuscation.packetSize - 8 else { return }
                toEnqueue.append(try NetworkObfuscation.padPacket(sealed))
            }
            for (index, padded) in toEnqueue.enumerated() {
                let isLast = index == toEnqueue.count - 1
                deliveryQueue.append(PendingDelivery(
                    messageId: isLast ? messageId : nil, contactId: contactId, padded: padded,
                    wireTag: tag, relayCandidates: relayCandidates
                ))
            }
            print("[Relay] sendMessage: enqueued \(toEnqueue.count) packet(s) for \(contact.displayName)")
            flushQueue()
        } catch {
            // Encryption/session failure — nothing safe to enqueue. Caller sees no delivery
            // attempt, and the message would otherwise sit on "Sending…" forever with no visible
            // reason, so this is both logged and surfaced in the chat: silently swallowing it is
            // exactly what made a real send-side failure undiagnosable on hardware.
            //
            // The one genuinely expected case is the Double Ratchet's own bootstrap asymmetry:
            // whichever side `createSession` gave the receiver role to (see its doc comment) has
            // no sending chain until it has decrypted one inbound message — correct protocol
            // behaviour, not a fault, but indistinguishable from a network problem unless it's
            // spelled out. It only ever applies to the very first message of a fresh pairing.
            print("[Relay] sendMessage FAILED before enqueue (encryption/session): \(error)")
            if let messageId {
                let ratchetBootstrap = (error as? DoubleRatchet.RatchetError)?.message.contains("no sending chain") ?? false
                messageStore.markFailed(
                    contactId: contactId,
                    messageId: messageId,
                    reason: ratchetBootstrap
                        ? "Waiting for \(contact.displayName) to write first"
                        : "Couldn't encrypt — not sent"
                )
            }
        }
    }

    func sendControlSignal(_ signal: Data, to contactId: String) async {
        guard let contact = contactStore.get(id: contactId) else { return }
        guard let sealed = try? OuterEnvelope.encrypt(plaintext: signal, contactKey32: contact.messageKey),
              sealed.count <= NetworkObfuscation.packetSize - 8,
              let padded = try? NetworkObfuscation.padPacket(sealed) else { return }
        let tag = identity.myWireTag(contactMsgKey: contact.messageKey, generation: contact.myGeneration)
        deliveryQueue.append(PendingDelivery(
            messageId: nil, contactId: contactId, padded: padded,
            wireTag: tag, relayCandidates: contact.theirRelayConnectionStrings
        ))
        flushQueue()
    }

    /// Rotates my identity towards `contactId`: bumps my generation, optionally adopts a new
    /// relay, and tells the contact via `UNPRUUF_WECHSEL_V1` — sent under the *current* (about to
    /// become stale) generation, since the contact doesn't know about the rotation yet.
    func wechsel(contactId: String, newRelayConnectionString: String?) async {
        guard let contact = contactStore.get(id: contactId) else { return }
        let nextGeneration = contact.myGeneration + 1
        let relay = newRelayConnectionString ?? contact.myRelayConnectionStrings.first ?? ""
        let signal = ControlSignals.encodeWechsel(newGeneration: nextGeneration, newRelayConnectionString: relay)
        await sendControlSignal(signal, to: contactId)
        _ = contactStore.bumpMyGeneration(contactId: contactId, newRelayConnectionString: newRelayConnectionString)
    }

    private func flushQueue() {
        guard flushTask == nil else { return }
        flushTask = Task { [weak self] in
            guard let self else { return }
            var backoff = Self.backoffInitialMs
            while await self.hasPendingDeliveries() {
                let anyDelivered = await self.attemptAllPending()
                if anyDelivered { backoff = Self.backoffInitialMs } else {
                    try? await Task.sleep(nanoseconds: backoff * 1_000_000)
                    backoff = Self.nextBackoff(backoff)
                }
            }
            self.flushTask = nil
        }
    }

    private func hasPendingDeliveries() -> Bool { !deliveryQueue.isEmpty }

    /// Gives already-enqueued outbound deliveries a bounded window to actually finish — see
    /// `UnpruufApp.swift`'s `.background` handling for why this exists. Real bug found from a user
    /// report, 2026‑09‑02: a message sent immediately before backgrounding could be silently lost
    /// forever. `AppEnvironment.stop()` used to run the instant `.background` fired, and it both
    /// resets `TorController.isReady` (which `attemptAllPending` above gates on — see its `guard`)
    /// and wipes every RAM message, so a delivery attempt still queued or in-flight at that exact
    /// moment was cut off mid-flight with no way to retry and nothing left in the UI to even show
    /// it failed. The app also never requested extra background execution time, so iOS could
    /// suspend the process within seconds regardless — often before a fresh Tor SOCKS connection +
    /// HTTP POST to the relay reliably completes. Called from inside a `beginBackgroundTask`
    /// window, so `torController.isReady` is still whatever it was in the foreground and
    /// `attemptAllPending` can keep making real progress for the duration of this wait.
    func waitForPendingDeliveries(timeout: TimeInterval) async {
        guard !deliveryQueue.isEmpty else { return }
        let deadline = Date().addingTimeInterval(timeout)
        while !deliveryQueue.isEmpty && Date() < deadline {
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
    }

    /// One pass over the queue: tries every item once, dropping delivered ones, skipping further
    /// items for a contact once one of theirs failed this round (preserves per-contact order).
    private func attemptAllPending() async -> Bool {
        guard torController.isReady else { return false }
        var anyDelivered = false
        var failedContacts: Set<String> = []
        var remaining: [PendingDelivery] = []
        for item in deliveryQueue {
            if failedContacts.contains(item.contactId) { remaining.append(item); continue }
            if await attemptDelivery(item) {
                anyDelivered = true
                if let id = item.messageId {
                    messageStore.markDelivered(contactId: item.contactId, messageId: id)
                }
            } else {
                failedContacts.insert(item.contactId)
                remaining.append(item)
            }
        }
        deliveryQueue = remaining
        return anyDelivered
    }

    /// Tries each candidate relay in order, stopping at the first success — safe because relay
    /// delivery is a single idempotent-enough POST, not something that could double-send visibly
    /// (a retry on a different candidate after one fails is just "try somewhere else", not
    /// "deliver twice"). Unlike polling (see `pollOnce`), sending doesn't need to try every
    /// candidate every time: once one relay accepts the packet, the contact will find it there.
    ///
    /// Deliberately uses `item.wireTag`/`item.relayCandidates` (snapshotted at enqueue time) and
    /// never re-reads `contactStore` — a queued item, most importantly `ControlSignals
    /// .deleteContact` itself, must keep retrying correctly even after the contact it was for has
    /// already been removed locally (that removal is what queues it in the first place). Real bug
    /// found on real hardware: re-looking the contact up here meant a "delete contact" signal
    /// could never actually leave the device, since by the time this ran the contact used to
    /// already be gone — every retry failed the lookup and this queued forever without ever
    /// reaching the network, so the other side's copy of the contact was never removed.
    private func attemptDelivery(_ item: PendingDelivery) async -> Bool {
        if item.relayCandidates.isEmpty {
            print("[Relay] attemptDelivery: contact \(item.contactId) advertised NO relay — nothing to push to")
        }
        for relayString in item.relayCandidates {
            guard let conn = RelayConnectionString.parse(relayString) else {
                print("[Relay] attemptDelivery: unparseable relay string, skipping this candidate")
                continue
            }
            guard let (host, port) = Self.splitHostPort(conn.address) else { continue }
            do {
                let body = try JSONEncoder().encode(["tag": item.wireTag, "blob": item.padded.base64EncodedString()])
                let response = try await http.request(
                    method: "POST", socksPort: torController.socksPort, targetHost: host, targetPort: port,
                    path: "/v1/relay", headers: ["Authorization": "Bearer \(conn.authToken)"], body: body
                )
                print("[Relay] attemptDelivery: POST to \(host):\(port) returned \(response.statusCode)")
                if response.statusCode == 201 { return true }
            } catch {
                print("[Relay] attemptDelivery: POST to \(host):\(port) failed: \(error)")
                continue // this candidate is unreachable — try the next one
            }
        }
        return false
    }

    // MARK: - Receiving (poll)

    func startPolling() {
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.pollOnce()
                try? await Task.sleep(nanoseconds: 20_000_000_000) // 20s
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    /// Unlike `attemptDelivery`, this must check EVERY entry of `myRelayConnectionStrings` every
    /// round, not stop at the first reachable one — relay fetch is delete-on-fetch, so a message
    /// could have landed at any one of my advertised addresses (the sender picks independently,
    /// see `attemptDelivery`'s own doc comment), and skipping an address here means silently
    /// never seeing what's waiting there.
    /// **Diagnostic note, 2026‑09‑02**: a real cross-platform (Android→iOS) pairing showed the
    /// relay correctly storing the sender's packets, but this device never surfaced them —
    /// silently, since a successful-but-empty fetch response was never logged at all (only a
    /// non-empty result or a network error was). That made it impossible to tell, from a log
    /// alone, whether this device was polling the wrong tag (a real bug) or just hadn't gotten a
    /// response back yet. Every poll attempt for every contact is now logged unconditionally —
    /// the tag/generation queried and how many blobs came back — so the next real-device log
    /// settles it directly instead of by elimination.
    private func pollOnce() async {
        guard torController.isReady else { return }
        for contact in contactStore.contacts {
            let tag = identity.expectedWireTag(contactMsgKey: contact.messageKey, contactUserId: contact.id, generation: contact.theirGeneration)
            print("[Relay] pollOnce: contact=\(contact.displayName) id=\(contact.id) theirGeneration=\(contact.theirGeneration) tag=\(tag)")
            // Real bug found on real hardware, 2026‑08‑29: the tag MUST be percent-encoded here.
            // `Identity.hmac` returns STANDARD-alphabet base64 (not URL-safe), so roughly half of
            // all wire tags contain a `+`. A literal `+` in a query string is decoded back as a
            // SPACE by every standard query parser (the Node relay's included) — that's the
            // application/x-www-form-urlencoded convention, not a relay bug. The corrupted tag
            // then fails the relay's `TAG_RE` and 400s, and the `statusCode == 200` guard below
            // silently skips it — so a contact whose tag happens to contain a `+` could never
            // receive anything, while sending always worked (push puts the tag in the JSON body,
            // never in a URL). This is the exact same bug the Android client already hit and
            // fixed — see `RelayClient.kt`'s `URLEncoder.encode(wireTag, "UTF-8")` and its long
            // comment; the iOS port never picked that fix up.
            //
            // `.urlQueryAllowed` would NOT work here: it deliberately permits `+`, which is the
            // one character actually causing the corruption. `.alphanumerics` encodes `+`, `/`
            // and `=` alike, which is exactly what a base64 tag needs.
            let encodedTag = tag.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? tag
            // A contact paired while this device had no relay configured ends up with an EMPTY
            // pool here (see `PairingViewModel.handleScanned`, which used to allow that) — the
            // loop below then does nothing at all, so this device can never receive from that
            // contact, silently and permanently, even though sending to them keeps working.
            // Logging it makes that state visible instead of looking like "the relay is empty".
            if contact.myRelayConnectionStrings.isEmpty {
                print("[Relay] pollOnce: \(contact.displayName) has NO relay address to poll — re-pair this contact (both sides) to fix")
            }
            for relayString in contact.myRelayConnectionStrings {
                guard let conn = RelayConnectionString.parse(relayString) else { continue }
                guard let (host, port) = Self.splitHostPort(conn.address) else { continue }
                do {
                    let response = try await http.request(
                        method: "GET", socksPort: torController.socksPort, targetHost: host, targetPort: port,
                        path: "/v1/fetch?tag=\(encodedTag)", headers: ["Authorization": "Bearer \(conn.authToken)"]
                    )
                    guard response.statusCode == 200 else {
                        print("[Relay] fetch got HTTP \(response.statusCode) from \(host) — skipping this address")
                        continue
                    }
                    let decoded = try JSONDecoder().decode([String: [String]].self, from: response.body)
                    let blobs = decoded["blobs"] ?? []
                    // Unconditional now — see the diagnostic note on pollOnce() above. A `0
                    // blob(s)` line here, repeated every 20s while the relay's own status shows
                    // messages waiting, is definitive proof this device is polling the WRONG tag
                    // (or wrong host/relay), not just "hasn't gotten to it yet".
                    print("[Relay] fetch \(contact.displayName) tag=\(tag) from \(host) -> \(blobs.count) blob(s)")
                    for blobB64 in blobs {
                        guard let blob = Data(base64Encoded: blobB64) else { continue }
                        let ingested = await ingestPacket(tag: tag, packet: blob)
                        print("[Relay] ingestPacket returned \(ingested)")
                    }
                } catch {
                    print("[Relay] fetch from \(host) failed: \(error)")
                    continue // this address is unreachable this round — try the next one, still this round
                }
            }
        }
    }

    /// Unified receive path: unpad -> outer decrypt -> dummy check -> resolve sender -> control
    /// signals -> ratchet-frame decode/reassemble -> ratchet decrypt -> message payload decode.
    private func ingestPacket(tag: String, packet: Data) async -> Bool {
        guard let padded = try? NetworkObfuscation.unpadPacket(packet) else { return false }
        guard let plaintext = try? OuterEnvelope.decrypt(data: padded, myKey32: identity.myMessageKey) else { return false }
        if plaintext == ControlSignals.dummy { return true }

        guard let senderId = resolveSender(tag: tag) else { return false }
        guard let contact = contactStore.get(id: senderId) else { return false }

        if plaintext == ControlSignals.revoke {
            messageStore.zeroizeContact(senderId)
            return true
        }
        if plaintext == ControlSignals.deleteContact {
            messageStore.zeroizeContact(senderId)
            contactStore.remove(id: senderId)
            return true
        }
        if let wechsel = ControlSignals.decodeWechsel(plaintext) {
            contactStore.applyWechsel(contactId: senderId, newGeneration: wechsel.newGeneration, newRelayConnectionString: wechsel.newRelayConnectionString)
            return true
        }

        guard let frame = RatchetFrame.decode(plaintext) else { return false }
        let header: RatchetHeader
        let ciphertext: Data
        switch frame {
        case .single(let h, let ct):
            header = h
            ciphertext = ct
        case .chunkStart(let total, let h, let piece):
            var pieces = [Data?](repeating: nil, count: Int(total))
            pieces[0] = piece
            chunkReassembly[senderId] = ChunkReassembly(header: h, pieces: pieces, received: 1)
            return true
        case .chunkCont(let index, let piece):
            guard var reassembly = chunkReassembly[senderId], Int(index) < reassembly.pieces.count else { return false }
            if reassembly.pieces[Int(index)] == nil {
                reassembly.pieces[Int(index)] = piece
                reassembly.received += 1
            }
            chunkReassembly[senderId] = reassembly
            guard reassembly.isComplete else { return true }
            chunkReassembly.removeValue(forKey: senderId)
            header = reassembly.header
            var combined = Data()
            for p in reassembly.pieces { combined.append(p!) }
            ciphertext = combined
        }

        do {
            let state = try loadOrCreateSession(for: contact)
            let pairSecret = identity.pairSecret(contactMsgKey: contact.messageKey)
            let realPlaintext = try DoubleRatchet.decrypt(state: state, header: header, ciphertext: ciphertext, associatedData: pairSecret)
            keychain.saveRatchetState(contactId: senderId, state: state)
            guard let content = MessagePayload.decode(realPlaintext) else { return false }
            switch content {
            case .text(let text):
                messageStore.addMessage(senderId, RamMessage(
                    id: UUID().uuidString, senderId: senderId, content: Data(text.utf8),
                    timestamp: Date(), isOutgoing: false, type: .text
                ))
            case .attachment(let name, let bytes, let isImage):
                messageStore.addMessage(senderId, RamMessage(
                    id: UUID().uuidString, senderId: senderId, content: bytes,
                    timestamp: Date(), isOutgoing: false, type: isImage ? .image : .file, fileName: name
                ))
            }
            messageStore.markUnread(senderId)
            return true
        } catch {
            return false
        }
    }

    /// Matches an inbound wire tag against every known contact's expected tag, at their currently
    /// known generation *and* the immediately adjacent ones — since rotation is manual and
    /// unsynchronized (no shared clock the way Android's hourly rotation has), a message sent
    /// just before I process a contact's Wechsel could still arrive tagged with the prior
    /// generation, or (rarely) I could receive it before I've caught up if my own state lags.
    private func resolveSender(tag: String) -> String? {
        for contact in contactStore.contacts {
            for generation in [contact.theirGeneration, contact.theirGeneration - 1, contact.theirGeneration + 1] where generation >= 0 {
                let expected = identity.expectedWireTag(contactMsgKey: contact.messageKey, contactUserId: contact.id, generation: generation)
                if expected == tag { return contact.id }
            }
        }
        return nil
    }

    private func loadOrCreateSession(for contact: Contact) throws -> DoubleRatchet.RatchetState {
        if let existing = keychain.loadRatchetState(contactId: contact.id) {
            return existing
        }
        return try createSession(for: contact)
    }

    /// Mirrors `RatchetSessionManager.createSession`: both sides already know both X25519 keys
    /// after mutual QR exchange, so the tie for who performs the initial sending DH step is broken
    /// by a symmetric, deterministic comparison both devices compute identically.
    func createSession(for contact: Contact) throws -> DoubleRatchet.RatchetState {
        let my = identity.myX25519RatchetKeyPair
        let theirPub = contact.x25519RatchetPublicKey
        let pairSecret = identity.pairSecret(contactMsgKey: contact.messageKey)
        let shared = try X3DHBootstrap.deriveSharedSecret(myPrivateKey: my.privateKey, theirPublicKey: theirPub, salt: pairSecret)

        let state: DoubleRatchet.RatchetState
        if Self.compareUnsigned([UInt8](my.publicKey), [UInt8](theirPub)) < 0 {
            state = try DoubleRatchet.initSender(sharedRootKey: shared, ownKeyPair: my, theirPublicKey: theirPub)
        } else {
            state = DoubleRatchet.initReceiver(sharedRootKey: shared, ownKeyPair: my)
        }
        keychain.saveRatchetState(contactId: contact.id, state: state)
        return state
    }

    private static func compareUnsigned(_ a: [UInt8], _ b: [UInt8]) -> Int {
        let n = min(a.count, b.count)
        for i in 0..<n {
            let d = Int(a[i]) - Int(b[i])
            if d != 0 { return d }
        }
        return a.count - b.count
    }

    /// Real bug found on real hardware, 2026‑08‑29: this used to default a bare `.onion` address
    /// (no explicit port) to **8787** — `server/src/config.ts`'s `PORT`, which is only the
    /// *local* `127.0.0.1` port the relay's Express app listens on inside the machine running
    /// it. The hidden service's actual *virtual* port, the only one Tor ever exposes to a
    /// client, is fixed at **80** — see every relay torrc builder (`torProcess.ts`'s
    /// `buildTorrc`: `HiddenServicePort 80 127.0.0.1:<localPort>`) and the already-working
    /// Android client's own `RelayClient.kt` (`RELAY_PORT = 80`, same reasoning documented
    /// there). Connecting to `<onion>:8787` fails outright since the hidden service was never
    /// told to expose that port at all — this silently broke *every* relay call (both push and
    /// poll) for the default bare-onion connection-string case, which explains why messages
    /// neither sent nor arrived even with Tor itself fully connected on both ends.
    private static func splitHostPort(_ address: String) -> (host: String, port: UInt16)? {
        // Relay addresses are typically a bare `.onion` host, always reached on the hidden
        // service's virtual port 80; a `host:port` form is also accepted for local/dev relays
        // (see connectionString.ts).
        if let lastColon = address.lastIndex(of: ":"), let port = UInt16(address[address.index(after: lastColon)...]) {
            return (String(address[address.startIndex..<lastColon]), port)
        }
        return (address, 80) // hidden service's fixed virtual port — see doc comment above
    }
}
