import Combine
import Foundation
import UnpruufCore

/// unpruuf Compliance: opens cases, hands the report to the reporting office, receives the case
/// number / status and the office's replies. Counterpart of `RelayService` for the consumer app —
/// same relay API, same wire format — but every case runs on its own `Identity`.
///
/// Flow of a new case (all automatic after the one scan of the organisation QR):
///  1. fresh keys for this case (`PrefixedKeyValueStore`), ratchet session created
///  2. a hidden "hello" ratchet message (so the office can answer even if it is the receiving side)
///  3. the intake — this case's pairing code, sealed so only the office opens it — into the
///     office's letterbox; re-sent every 6 h until the receipt arrives
///  4. the office answers with the case number over the case's own ratchet channel
@MainActor
final class ComplianceService: ObservableObject {
    enum ConnectResult: Equatable {
        case ok(caseId: String)
        case unreadable
        case notAnOffice
        case noRelay
    }

    static let backoffInitialMs: UInt64 = 3_000
    static let backoffMaxMs: UInt64 = 15_000
    private static let pollIntervalSeconds: UInt64 = 20

    private let caseStore: CaseStore
    private let messageStore: InMemoryMessageStore
    private let keychain: KeychainStore
    private let torController: TorController
    private let http = SocksHTTPClient()

    private var identities: [String: Identity] = [:]
    private var pollTask: Task<Void, Never>?
    private var flushTask: Task<Void, Never>?

    private struct PendingDelivery {
        let messageId: String?
        let caseId: String
        let padded: Data
        let tag: String
        let relays: [String]
    }
    private var deliveryQueue: [PendingDelivery] = []

    private struct ChunkReassembly {
        let header: RatchetHeader
        var pieces: [Data?]
        var received: Int
        var isComplete: Bool { received == pieces.count }
    }
    private var chunkReassembly: [String: ChunkReassembly] = [:]

    init(caseStore: CaseStore, messageStore: InMemoryMessageStore, keychain: KeychainStore, torController: TorController) {
        self.caseStore = caseStore
        self.messageStore = messageStore
        self.keychain = keychain
        self.torController = torController
    }

    // MARK: Per-case identity

    func identity(for reportCase: ReportCase) -> Identity {
        if let existing = identities[reportCase.id] { return existing }
        let created = Identity(store: PrefixedKeyValueStore(base: keychain, prefix: reportCase.keyPrefix))
        identities[reportCase.id] = created
        return created
    }

    // MARK: Connecting / new case

    /// Validates a scanned or pasted organisation QR, remembers it and opens the first case.
    func connect(rawQR: String) -> ConnectResult {
        let trimmed = rawQR.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let payload = PairingPayload.fromJSON(trimmed) else { return .unreadable }
        guard payload.appEdition == "officer" else { return .notAnOffice }
        guard payload.relayConnectionStrings.contains(where: { RelayConnectionString.parse($0) != nil }) else { return .noRelay }
        caseStore.setOrganization(payload)
        guard let id = openNewCase() else { return .unreadable }
        return .ok(caseId: id)
    }

    /// A new, independent case with the remembered organisation — no new scan needed.
    @discardableResult
    func openNewCase() -> String? {
        guard let org = caseStore.organization else { return nil }
        let reportCase = ReportCase(
            id: UUID().uuidString,
            officerUserId: org.userId,
            officerMessageKeyBase64: org.messageKeyBase64,
            officerX25519PublicKeyBase64: org.x25519RatchetPublicKeyBase64,
            relayConnectionStrings: org.relayConnectionStrings,
            addedAt: Date()
        )
        caseStore.add(reportCase)
        guard (try? createSession(for: reportCase)) != nil else {
            caseStore.remove(id: reportCase.id)
            return nil
        }
        caseStore.startIntake(id: reportCase.id)
        Task { [weak self] in
            await self?.sendHello(caseId: reportCase.id)
            await self?.sendIntakeIfDue(caseId: reportCase.id)
        }
        return reportCase.id
    }

    /// Removes every trace of the case from this phone. The office keeps its record (Art. 9
    /// retention) — nothing is sent to it.
    func removeCaseFromDevice(id: String) {
        messageStore.zeroizeContact(id)
        deliveryQueue.removeAll { $0.caseId == id }
        chunkReassembly.removeValue(forKey: id)
        identities.removeValue(forKey: id)
        caseStore.remove(id: id)
    }

    func wipeEverything() {
        deliveryQueue.removeAll()
        chunkReassembly.removeAll()
        identities.removeAll()
        caseStore.wipeAll()
    }

    // MARK: Ratchet session

    private func createSession(for reportCase: ReportCase) throws -> DoubleRatchet.RatchetState {
        let identity = identity(for: reportCase)
        let mine = identity.myX25519RatchetKeyPair
        let theirPub = reportCase.officerX25519PublicKey
        let pairSecret = identity.pairSecret(contactMsgKey: reportCase.officerMessageKey)
        let shared = try X3DHBootstrap.deriveSharedSecret(myPrivateKey: mine.privateKey, theirPublicKey: theirPub, salt: pairSecret)
        let state: DoubleRatchet.RatchetState
        if Self.compareUnsigned([UInt8](mine.publicKey), [UInt8](theirPub)) < 0 {
            state = try DoubleRatchet.initSender(sharedRootKey: shared, ownKeyPair: mine, theirPublicKey: theirPub)
        } else {
            state = DoubleRatchet.initReceiver(sharedRootKey: shared, ownKeyPair: mine)
        }
        keychain.saveRatchetState(contactId: reportCase.id, state: state)
        return state
    }

    private func loadOrCreateSession(for reportCase: ReportCase) throws -> DoubleRatchet.RatchetState {
        if let existing = keychain.loadRatchetState(contactId: reportCase.id) { return existing }
        return try createSession(for: reportCase)
    }

    // MARK: Sending

    /// The report text (or a follow-up) of a case. Shown in the thread at once, delivered in the
    /// background with retries.
    func sendMessage(caseId: String, text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let messageId = UUID().uuidString
        messageStore.addMessage(caseId, RamMessage(
            id: messageId, senderId: "self", content: Data(trimmed.utf8),
            timestamp: Date(), isOutgoing: true, type: .text
        ))
        Task { [weak self] in
            await self?.enqueueRatchet(caseId: caseId, plaintext: MessagePayload.encodeText(trimmed), messageId: messageId)
        }
    }

    private func sendHello(caseId: String) async {
        // Silently skipped when this side cannot send yet — then the office's receipt opens the chain.
        await enqueueRatchet(caseId: caseId, plaintext: MessagePayload.encodeText(OfficerCase.caseHelloText), messageId: nil)
    }

    private func enqueueRatchet(caseId: String, plaintext: Data, messageId: String?) async {
        guard let reportCase = caseStore.get(id: caseId) else { return }
        do {
            let state = try loadOrCreateSession(for: reportCase)
            let identity = identity(for: reportCase)
            let pairSecret = identity.pairSecret(contactMsgKey: reportCase.officerMessageKey)
            let encrypted = try DoubleRatchet.encrypt(state: state, plaintext: plaintext, associatedData: pairSecret)
            keychain.saveRatchetState(contactId: caseId, state: state)

            let tag = identity.myWireTag(contactMsgKey: reportCase.officerMessageKey, generation: 0)
            var packets: [Data] = []
            for frame in RatchetFrame.split(header: encrypted.header, ciphertext: encrypted.ciphertext) {
                let sealed = try OuterEnvelope.encrypt(plaintext: try RatchetFrame.encode(frame), contactKey32: reportCase.officerMessageKey)
                guard sealed.count <= NetworkObfuscation.packetSize - 8 else { return }
                packets.append(try NetworkObfuscation.padPacket(sealed))
            }
            for (index, padded) in packets.enumerated() {
                deliveryQueue.append(PendingDelivery(
                    messageId: index == packets.count - 1 ? messageId : nil, caseId: caseId,
                    padded: padded, tag: tag, relays: reportCase.relayConnectionStrings
                ))
            }
            flushQueue()
        } catch {
            guard let messageId else { return }
            let waiting = (error as? DoubleRatchet.RatchetError)?.message.contains("no sending chain") ?? false
            messageStore.markFailed(
                contactId: caseId, messageId: messageId,
                reason: waiting
                    ? L.t("Canalul se deschide imediat ce oficiul confirmă primirea. Încearcă din nou în câteva secunde.",
                          "The channel opens as soon as the reporting office confirms receipt. Try again in a few seconds.")
                    : L.t("Nu s-a putut cripta — netrimis", "Couldn't encrypt — not sent")
            )
        }
    }

    private func flushQueue() {
        guard flushTask == nil else { return }
        flushTask = Task { [weak self] in
            guard let self else { return }
            var backoff = Self.backoffInitialMs
            while await self.hasPendingDeliveries() {
                if await self.attemptAllPending() {
                    backoff = Self.backoffInitialMs
                } else {
                    try? await Task.sleep(nanoseconds: backoff * 1_000_000)
                    backoff = min(backoff * 2, Self.backoffMaxMs)
                }
            }
            await self.finishFlush()
        }
    }

    private func hasPendingDeliveries() -> Bool { !deliveryQueue.isEmpty }

    private func finishFlush() { flushTask = nil }

    private func attemptAllPending() async -> Bool {
        guard torController.isReady else { return false }
        var anyDelivered = false
        var failedCases: Set<String> = []
        var remaining: [PendingDelivery] = []
        for item in deliveryQueue {
            if failedCases.contains(item.caseId) { remaining.append(item); continue }
            if await push(tag: item.tag, padded: item.padded, relays: item.relays) {
                anyDelivered = true
                if let id = item.messageId { messageStore.markDelivered(contactId: item.caseId, messageId: id) }
            } else {
                failedCases.insert(item.caseId)
                remaining.append(item)
            }
        }
        deliveryQueue = remaining
        return anyDelivered
    }

    private func push(tag: String, padded: Data, relays: [String]) async -> Bool {
        for relayString in relays {
            guard let conn = RelayConnectionString.parse(relayString), let (host, port) = Self.splitHostPort(conn.address) else { continue }
            do {
                let body = try JSONEncoder().encode(["tag": tag, "blob": padded.base64EncodedString()])
                let response = try await http.request(
                    method: "POST", socksPort: torController.socksPort, targetHost: host, targetPort: port,
                    path: "/v1/relay", headers: ["Authorization": "Bearer \(conn.authToken)"], body: body
                )
                if response.statusCode == 201 { return true }
            } catch {
                continue // this relay is unreachable — try the next one
            }
        }
        return false
    }

    // MARK: Intake

    /// Hands this case's pairing code to the office's letterbox, once per `intakeRetryInterval`
    /// until the receipt (case number) is in.
    private func sendIntakeIfDue(caseId: String) async {
        guard torController.isReady, let reportCase = caseStore.get(id: caseId),
              let started = reportCase.intakeStartedAt, reportCase.caseNumber == nil else { return }
        let now = Date()
        if now.timeIntervalSince(started) > OfficerCase.intakeGiveUpAfter {
            caseStore.stopIntake(id: caseId)
            return
        }
        if let last = reportCase.intakeLastSentAt, now.timeIntervalSince(last) < OfficerCase.intakeRetryInterval { return }

        let identity = identity(for: reportCase)
        let pairing = PairingPayload(
            userId: identity.userId,
            messageKeyBase64: identity.myMessageKey.base64EncodedString(),
            x25519RatchetPublicKeyBase64: identity.myX25519RatchetPublicKeyBase64,
            relayConnectionStrings: reportCase.relayConnectionStrings,
            appEdition: "whistleblower"
        )
        guard let sealed = try? OfficerCase.sealIntake(
            officerX25519Pub: reportCase.officerX25519PublicKey,
            officerMessageKey: reportCase.officerMessageKey,
            plaintext: OfficerCase.encodeIntakePlaintext(wireIdentity: nil, pairingJSON: pairing.toJSON())
        ), sealed.count <= NetworkObfuscation.packetSize - 8,
           let padded = try? NetworkObfuscation.padPacket(sealed) else { return }

        let tag = OfficerCase.intakeTag(officerMessageKey: reportCase.officerMessageKey, hour: OfficerCase.hour())
        if await push(tag: tag, padded: padded, relays: reportCase.relayConnectionStrings) {
            caseStore.markIntakeSent(id: caseId)
        }
    }

    // MARK: Polling

    func startPolling() {
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.pollOnce()
                try? await Task.sleep(nanoseconds: Self.pollIntervalSeconds * 1_000_000_000)
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    func pollOnce() async {
        guard torController.isReady else { return }
        for reportCase in caseStore.cases {
            await sendIntakeIfDue(caseId: reportCase.id)
            await fetch(reportCase)
        }
    }

    private func fetch(_ reportCase: ReportCase) async {
        let identity = identity(for: reportCase)
        // The office answers with generation 0; a little tolerance costs nothing.
        for generation in 0...2 {
            let tag = identity.expectedWireTag(
                contactMsgKey: reportCase.officerMessageKey, contactUserId: reportCase.officerUserId, generation: generation
            )
            let encodedTag = tag.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? tag
            for relayString in reportCase.relayConnectionStrings {
                guard let conn = RelayConnectionString.parse(relayString), let (host, port) = Self.splitHostPort(conn.address) else { continue }
                do {
                    let response = try await http.request(
                        method: "GET", socksPort: torController.socksPort, targetHost: host, targetPort: port,
                        path: "/v1/fetch?tag=\(encodedTag)", headers: ["Authorization": "Bearer \(conn.authToken)"]
                    )
                    guard response.statusCode == 200,
                          let decoded = try? JSONDecoder().decode([String: [String]].self, from: response.body) else { continue }
                    for blobB64 in decoded["blobs"] ?? [] {
                        guard let blob = Data(base64Encoded: blobB64) else { continue }
                        _ = ingest(packet: blob, into: reportCase.id)
                    }
                } catch {
                    continue
                }
            }
        }
    }

    // MARK: Receiving

    private func ingest(packet: Data, into caseId: String) -> Bool {
        guard let reportCase = caseStore.get(id: caseId) else { return false }
        let identity = identity(for: reportCase)
        guard let padded = try? NetworkObfuscation.unpadPacket(packet),
              let plaintext = try? OuterEnvelope.decrypt(data: padded, myKey32: identity.myMessageKey) else { return false }
        if plaintext == ControlSignals.dummy { return true }
        // The office never revokes, deletes or rotates a reporter's case; such signals are ignored.
        if plaintext == ControlSignals.revoke || plaintext == ControlSignals.deleteContact { return true }
        if ControlSignals.decodeWechsel(plaintext) != nil { return true }

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
            chunkReassembly[caseId] = ChunkReassembly(header: h, pieces: pieces, received: 1)
            return true
        case .chunkCont(let index, let piece):
            guard var reassembly = chunkReassembly[caseId], Int(index) < reassembly.pieces.count else { return false }
            if reassembly.pieces[Int(index)] == nil {
                reassembly.pieces[Int(index)] = piece
                reassembly.received += 1
            }
            chunkReassembly[caseId] = reassembly
            guard reassembly.isComplete else { return true }
            chunkReassembly.removeValue(forKey: caseId)
            header = reassembly.header
            var combined = Data()
            for p in reassembly.pieces { combined.append(p!) }
            ciphertext = combined
        }

        do {
            let state = try loadOrCreateSession(for: reportCase)
            let pairSecret = identity.pairSecret(contactMsgKey: reportCase.officerMessageKey)
            let realPlaintext = try DoubleRatchet.decrypt(state: state, header: header, ciphertext: ciphertext, associatedData: pairSecret)
            keychain.saveRatchetState(contactId: caseId, state: state)
            guard let content = MessagePayload.decode(realPlaintext) else { return false }
            switch content {
            case .text(let text):
                if let info = OfficerCase.parseCaseSignal(text) {
                    // Receipt / status update: stored on the case, never shown as a chat line.
                    caseStore.applyCaseInfo(id: caseId, info: info)
                    return true
                }
                if text == OfficerCase.caseHelloText { return true }
                messageStore.addMessage(caseId, RamMessage(
                    id: UUID().uuidString, senderId: caseId, content: Data(text.utf8),
                    timestamp: Date(), isOutgoing: false, type: .text
                ))
                messageStore.markUnread(caseId)
            case .attachment(let name, let bytes, let isImage):
                messageStore.addMessage(caseId, RamMessage(
                    id: UUID().uuidString, senderId: caseId, content: bytes,
                    timestamp: Date(), isOutgoing: false, type: isImage ? .image : .file, fileName: name
                ))
                messageStore.markUnread(caseId)
            }
            return true
        } catch {
            return false
        }
    }

    // MARK: Helpers

    private static func compareUnsigned(_ a: [UInt8], _ b: [UInt8]) -> Int {
        let n = min(a.count, b.count)
        for i in 0..<n {
            let d = Int(a[i]) - Int(b[i])
            if d != 0 { return d }
        }
        return a.count - b.count
    }

    private static func splitHostPort(_ address: String) -> (host: String, port: UInt16)? {
        if let lastColon = address.lastIndex(of: ":"), let port = UInt16(address[address.index(after: lastColon)...]) {
            return (String(address[address.startIndex..<lastColon]), port)
        }
        return (address, 80) // a hidden service's fixed virtual port
    }
}
