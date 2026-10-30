import CryptoKit
import Foundation

/// Which hourly epochs a poll asks a node for, from Android's `NodeMeshWindow`. The full window is
/// needed only when something may have been missed; asking for 26 tags every time would only tell
/// the node operator which tags belong together.
public enum NodeMeshWindow {
    /// `lastSuccessful`: the epoch of the last complete poll of this contact on this node. `nil`
    /// after every app start. Newest first.
    public static func epochs(current: Int64, lastSuccessful: Int64?, fullWindow: [Int64]) -> [Int64] {
        guard let lastSuccessful, lastSuccessful <= current else { return fullWindow }
        let count = current - (lastSuccessful - 1) + 1
        guard count < fullWindow.count else { return fullWindow }
        return (0..<count).map { current - $0 }
    }
}

/// The SOCKS user name that keeps one contact's Tor traffic apart from every other contact's, from
/// Android's `TorIsolation`. It stays on the phone.
public enum TorIsolation {
    public static func key(deviceSecret: Data, contactId: String) -> String {
        let mac = HMAC<SHA256>.authenticationCode(for: Data("tor-isolation:v1:\(contactId)".utf8), using: SymmetricKey(data: deviceSecret))
        return Data(mac).prefix(16).map { String(format: "%02x", $0) }.joined()
    }
}

/// Node-Mesh signals, plain text after the outer decryption, before any ratchet decode.
public enum NodeMeshSignals {
    static let nodeMigratePrefix = "UNPRUUF_NODEMIGRATE_V1:"
    static let tempNodePrefix = "UNPRUUF_TEMPNODE_V1:"
    static let tempNodeOff = "UNPRUUF_TEMPNODE_OFF_V1"
}

/// Sending, polling and receiving of the Node-Mesh, ported from the Node-Mesh parts of Android's
/// `P2PNetworkManager`. Foreground only: there is no background receive on iOS, the queue lives
/// in memory, and what a contact deposited in the last 24 h is still on their nodes on the next open.
@MainActor
public final class NodeMeshEngine {
    public struct Timing {
        public var pollBase: TimeInterval = 20
        public var pollJitter: TimeInterval = 5
        public var pollWaitMs: Int64 = 20_000
        /// Requests of one contact are spread over this long.
        public var requestSpread: TimeInterval = 1.5
        public var backoffInitial: TimeInterval = 3
        public var backoffMax: TimeInterval = 15
        public var loopSync: TimeInterval = 10
        public var coverMean: TimeInterval = 15 * 60
        public var coverMin: TimeInterval = 20
        public var coverMax: TimeInterval = 60 * 60
        public var maxContinuations = 8
        public init() {}
    }

    public struct Events {
        public var onMessage: (_ contactId: String, _ content: MessagePayload.Content) -> Void = { _, _ in }
        public var onDelivered: (_ contactId: String, _ messageId: String) -> Void = { _, _ in }
        /// The message could not even be queued: the side that has to receive first.
        public var onSendFailed: (_ contactId: String, _ messageId: String?) -> Void = { _, _ in }
        public var onRevoke: (_ contactId: String) -> Void = { _ in }
        public var onContactRemoved: (_ contactId: String) -> Void = { _ in }
        public init() {}
    }

    public struct RatchetStorage {
        public let load: (String) -> DoubleRatchet.RatchetState?
        public let save: (String, DoubleRatchet.RatchetState) -> Void
        public let delete: (String) -> Void
        public init(load: @escaping (String) -> DoubleRatchet.RatchetState?,
                    save: @escaping (String, DoubleRatchet.RatchetState) -> Void,
                    delete: @escaping (String) -> Void) {
            self.load = load
            self.save = save
            self.delete = delete
        }
    }

    private struct Delivery {
        let messageId: String?
        let contactId: String
        /// Snapshots from enqueue time: a contact deleted meanwhile must still get its delete signal.
        let tag: String
        let nodes: [NodeConnectionStrings.Owner]
        let ttlMs: Int64?
        let packet: Data
    }

    private struct Reassembly {
        let header: RatchetHeader
        var pieces: [Data?]
        var received: Int
    }

    private struct Cursor {
        let value: Int64
        let tags: Set<String>
    }

    public var events = Events()

    private let contacts: NodeMeshContactStore
    private let nodes: NodeMeshStore
    private let client: NodeMeshClient
    private let ratchets: RatchetStorage
    private let deviceSecret: Data
    private let timing: Timing
    private let isReady: () -> Bool
    private let nowMs: () -> Int64

    private var queue: [Delivery] = []
    private var flushTask: Task<Void, Never>?
    private var wipeCount = 0
    private var reassembly: [String: Reassembly] = [:]
    private var seenHashes = Set<Data>()
    private var seenOrder: [Data] = []
    private static let maxSeen = 20_000
    private var cursors: [String: Cursor] = [:]
    private var lastComplete: [String: Int64] = [:]
    private var rateLimitedUntil: [String: Date] = [:]
    private var contactLoops: [String: Task<Void, Never>] = [:]
    private var syncTask: Task<Void, Never>?
    private var coverTask: Task<Void, Never>?

    public init(contacts: NodeMeshContactStore, nodes: NodeMeshStore, client: NodeMeshClient, ratchets: RatchetStorage,
                deviceSecret: Data, timing: Timing = Timing(), isReady: @escaping () -> Bool,
                nowMs: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.contacts = contacts
        self.nodes = nodes
        self.client = client
        self.ratchets = ratchets
        self.deviceSecret = deviceSecret
        self.timing = timing
        self.isReady = isReady
        self.nowMs = nowMs
    }

    private func isolationKey(_ contactId: String) -> String {
        TorIsolation.key(deviceSecret: deviceSecret, contactId: contactId)
    }

    // MARK: Lifecycle

    /// When the app becomes active. The first poll of each contact goes out at once: everything
    /// deposited while the app was closed is still there.
    public func start() {
        guard syncTask == nil else { return }
        syncTask = Task { [weak self] in
            while !Task.isCancelled {
                self?.syncContactLoops()
                let wait = self?.timing.loopSync ?? 10
                try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            }
        }
        coverTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let delay = self?.nextCoverDelay() else { return }
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                if Task.isCancelled { return }
                self?.sendCover()
            }
        }
        flush()
    }

    public func stop() {
        syncTask?.cancel()
        syncTask = nil
        coverTask?.cancel()
        coverTask = nil
        contactLoops.values.forEach { $0.cancel() }
        contactLoops.removeAll()
    }

    /// Panic PIN: nothing queued goes out any more, and nothing is remembered.
    public func wipe() {
        stop()
        wipeCount += 1
        queue.removeAll()
        reassembly.removeAll()
        seenHashes.removeAll()
        seenOrder.removeAll()
        cursors.removeAll()
        lastComplete.removeAll()
        rateLimitedUntil.removeAll()
    }

    public var pendingDeliveryCount: Int { queue.count }

    /// A bounded window for what is queued when the app leaves the foreground.
    public func waitForPendingDeliveries(timeout: TimeInterval) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !queue.isEmpty && Date() < deadline {
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
    }

    private func syncContactLoops() {
        let ids = Set(contacts.contacts.map(\.id))
        for (id, task) in contactLoops where !ids.contains(id) {
            task.cancel()
            contactLoops[id] = nil
            forgetPollState(id)
        }
        for id in ids where contactLoops[id] == nil {
            contactLoops[id] = Task { [weak self] in
                while !Task.isCancelled {
                    guard let self else { return }
                    await self.pollContact(id)
                    let wait = self.timing.pollBase + Double.random(in: -self.timing.pollJitter...self.timing.pollJitter)
                    try? await Task.sleep(nanoseconds: UInt64(max(wait, 0.01) * 1_000_000_000))
                }
            }
        }
    }

    private func forgetPollState(_ contactId: String) {
        let prefix = "\(contactId)|"
        cursors = cursors.filter { !$0.key.hasPrefix(prefix) }
        lastComplete = lastComplete.filter { !$0.key.hasPrefix(prefix) }
        rateLimitedUntil = rateLimitedUntil.filter { !$0.key.hasPrefix(prefix) }
    }

    // MARK: Sending

    private func session(for contact: NodeMeshContact) throws -> DoubleRatchet.RatchetState {
        if let existing = ratchets.load(contact.id) { return existing }
        let state = try NodeMeshCrypto.createSession(myRatchetKeyPair: contact.myRatchetKeyPair,
                                                     theirRatchetPublicKey: contact.theirRatchetPublicKey,
                                                     pairSecret: contact.pairSecret)
        ratchets.save(contact.id, state)
        return state
    }

    private func currentTag(_ contact: NodeMeshContact) -> String {
        NodeMeshRouting.tag(pairRouting: contact.pairRouting, epoch: NodeMeshRouting.epoch(unixMs: nowMs()))
    }

    /// The nodes I gave this contact, with their write keys.
    private func depositNodes(_ contact: NodeMeshContact) -> [NodeConnectionStrings.Owner] {
        let addresses = Set(contact.myNodeAddresses.compactMap(NodeConnectionStrings.parseAddress))
        return nodes.nodes.filter { addresses.contains($0.address) }
    }

    private func enqueue(contact: NodeMeshContact, packets: [Data], messageId: String?) {
        let tag = currentTag(contact)
        let targets = depositNodes(contact)
        let ttl = MessageTtl.toMillis(contact.messageTtlHours)
        for (index, packet) in packets.enumerated() {
            queue.append(Delivery(messageId: index == packets.count - 1 ? messageId : nil, contactId: contact.id,
                                  tag: tag, nodes: targets, ttlMs: ttl, packet: packet))
        }
        flush()
    }

    /// All packets of a message or none: a transfer missing a piece never completes.
    public func send(contactId: String, plaintext: Data, messageId: String?) {
        guard let contact = contacts.contact(id: contactId) else { return }
        do {
            let state = try session(for: contact)
            let packets = try NodeMeshCrypto.seal(plaintext: plaintext, state: state, pairSecret: contact.pairSecret,
                                                  theirMessageKey: contact.theirMessageKey)
            ratchets.save(contactId, state)
            enqueue(contact: contact, packets: packets, messageId: messageId)
        } catch {
            events.onSendFailed(contactId, messageId)
        }
    }

    public func sendSignal(_ signal: Data, contactId: String) {
        guard let contact = contacts.contact(id: contactId),
              let packet = try? NodeMeshCrypto.sealSignal(signal, theirMessageKey: contact.theirMessageKey) else { return }
        enqueue(contact: contact, packets: [packet], messageId: nil)
    }

    /// Tells the contact and removes it here. The signal keeps going after the row is gone.
    public func deleteContact(id: String) {
        sendSignal(ControlSignals.deleteContact, contactId: id)
        removeContact(id: id)
    }

    private func removeContact(id: String) {
        contacts.remove(id: id)
        ratchets.delete(id)
        reassembly[id] = nil
        contactLoops[id]?.cancel()
        contactLoops[id] = nil
        forgetPollState(id)
    }

    private func flush() {
        guard flushTask == nil else { return }
        flushTask = Task { [weak self] in
            guard let self else { return }
            var backoff = self.timing.backoffInitial
            while !self.queue.isEmpty {
                if await self.attemptAll() {
                    backoff = self.timing.backoffInitial
                } else {
                    try? await Task.sleep(nanoseconds: UInt64(backoff * 1_000_000_000))
                    backoff = min(backoff * 2, self.timing.backoffMax)
                }
            }
            self.flushTask = nil
        }
    }

    /// One pass: frames of one contact stay in order, the first failure ends that contact's turn.
    private func attemptAll() async -> Bool {
        guard isReady() else { return false }
        let pass = queue
        let wipesAtStart = wipeCount
        var anyDelivered = false
        var failed = Set<String>()
        var remaining: [Delivery] = []
        for item in pass {
            if failed.contains(item.contactId) {
                remaining.append(item)
                continue
            }
            if await deposit(item) {
                anyDelivered = true
                if let id = item.messageId { events.onDelivered(item.contactId, id) }
            } else {
                failed.insert(item.contactId)
                remaining.append(item)
            }
            if wipeCount != wipesAtStart { return false }
        }
        queue = remaining + queue.dropFirst(pass.count)
        return anyDelivered
    }

    /// To every node of the contact, success if at least one accepted.
    private func deposit(_ item: Delivery) async -> Bool {
        let key = isolationKey(item.contactId)
        let client = self.client
        return await withTaskGroup(of: Bool.self) { group in
            for node in item.nodes {
                group.addTask {
                    await client.deposit(address: node.address, ownerSecret: node.ownerSecret, routingTag: item.tag,
                                         ciphertext: item.packet, ttlMs: item.ttlMs, isolationKey: key) == .accepted
                }
            }
            var accepted = false
            for await ok in group where ok { accepted = true }
            return accepted
        }
    }

    // MARK: Cover traffic

    private func nextCoverDelay() -> TimeInterval {
        let count = contacts.contacts.count
        guard count > 0 else { return timing.coverMean }
        let u = max(Double.random(in: 0..<1), 1e-9)
        return min(max(-(timing.coverMean / Double(count)) * log(u), timing.coverMin), timing.coverMax)
    }

    /// Same tag, nodes and lifetime as a real message of that chat, no ratchet.
    private func sendCover() {
        guard isReady(), let contact = contacts.contacts.randomElement() else { return }
        sendSignal(ControlSignals.dummy, contactId: contact.id)
    }

    // MARK: Polling

    /// One request per (contact, node), never one naming the tags of several contacts.
    public func pollContact(_ contactId: String) async {
        guard isReady(), let contact = contacts.contact(id: contactId) else { return }
        var seen = Set<String>()
        var addresses = contact.theirNodeAddresses.compactMap(NodeConnectionStrings.parseAddress)
        if let temp = contact.theirTempNodeAddress { addresses.append(temp) }
        addresses = addresses.filter { seen.insert($0).inserted }
        guard !addresses.isEmpty else { return }

        let now = nowMs()
        let full = NodeMeshRouting.windowEpochs(unixMs: now)
        let current = full[0]
        let pair = contact.pairRouting
        let spread = timing.requestSpread
        await withTaskGroup(of: Void.self) { group in
            for address in addresses {
                let key = "\(contactId)|\(address)"
                let epochs = NodeMeshWindow.epochs(current: current, lastSuccessful: lastComplete[key], fullWindow: full)
                let tags = epochs.map { NodeMeshRouting.tag(pairRouting: pair, epoch: $0) }
                group.addTask { [weak self] in
                    try? await Task.sleep(nanoseconds: UInt64(Double.random(in: 0...spread) * 1_000_000_000))
                    guard let self else { return }
                    if let complete = await self.pollAddress(key: key, contactId: contactId, address: address, tags: tags) {
                        if complete { await self.markComplete(key, current) } else { await self.markIncomplete(key) }
                    }
                }
            }
        }
        // Forget the state of addresses this contact no longer uses.
        let keep = Set(addresses.map { "\(contactId)|\($0)" })
        let prefix = "\(contactId)|"
        cursors = cursors.filter { !$0.key.hasPrefix(prefix) || keep.contains($0.key) }
        lastComplete = lastComplete.filter { !$0.key.hasPrefix(prefix) || keep.contains($0.key) }
    }

    private func markComplete(_ key: String, _ epoch: Int64) { lastComplete[key] = epoch }
    private func markIncomplete(_ key: String) { lastComplete[key] = nil }

    /// `nil` while the node asked us to wait. Otherwise whether everything was downloaded. Tags the
    /// cursor covers ask only for what is new; tags that just entered the window are read from 0.
    private func pollAddress(key: String, contactId: String, address: String, tags: [String]) async -> Bool? {
        if let until = rateLimitedUntil[key] {
            if until > Date() { return nil }
            rateLimitedUntil[key] = nil
        }
        let state = cursors[key]
        let known = state?.tags ?? []
        let fresh = tags.filter { !known.contains($0) }
        let covered = tags.filter { known.contains($0) }
        var received: [Int64?] = []
        var unfinished: [Int64] = []
        var failed = false

        func run(_ group: [String], since: Int64, wait: Int64) async {
            let chunks = stride(from: 0, to: group.count, by: NodeMeshClient.maxTagsPerFetch).map {
                Array(group[$0..<min($0 + NodeMeshClient.maxTagsPerFetch, group.count)])
            }
            for chunk in chunks {
                var from = since
                var rounds = 0
                while true {
                    // Only a single-chunk call long-polls, several waits would stack up.
                    let outcome = await client.fetchMany(address: address, tags: chunk, waitMs: chunks.count == 1 && rounds == 0 ? wait : 0,
                                                         since: from, isolationKey: isolationKey(contactId))
                    switch outcome {
                    case .failed:
                        failed = true
                        return
                    case .rateLimited(let seconds):
                        rateLimitedUntil[key] = Date().addingTimeInterval(TimeInterval(seconds ?? Int(timing.pollBase)))
                        failed = true
                        return
                    case .ok(let result):
                        for (tag, blobs) in result.blobs {
                            for blob in blobs { ingest(contactId: contactId, tag: tag, packet: blob) }
                        }
                        rounds += 1
                        if result.more, let next = result.cursor, next > from, rounds < timing.maxContinuations {
                            from = next
                            continue
                        }
                        received.append(result.cursor)
                        if result.more, let next = result.cursor { unfinished.append(next) }
                    }
                    break
                }
                if failed { return }
            }
        }

        if !fresh.isEmpty { await run(fresh, since: 0, wait: covered.isEmpty ? timing.pollWaitMs : 0) }
        if !covered.isEmpty, !failed, let state { await run(covered, since: state.value, wait: timing.pollWaitMs) }

        if failed { return false }
        if received.isEmpty || received.contains(where: { $0 == nil }) {
            cursors[key] = nil
        } else {
            // A chunk answered completely says nothing more up to now, so the furthest cursor is
            // safe; a chunk cut short pins the bound to where it stopped.
            let bound = unfinished.min() ?? received.compactMap { $0 }.max() ?? 0
            cursors[key] = Cursor(value: bound, tags: Set(tags))
        }
        return unfinished.isEmpty
    }

    // MARK: Receiving

    /// The sender is known from the tag that was asked for. Every packet sits on up to three nodes
    /// and the ratchet cannot decrypt twice, so the hash is reserved before anything else.
    func ingest(contactId: String, tag: String, packet: Data) {
        let hash = Data(SHA256.hash(data: packet))
        guard !seenHashes.contains(hash) else { return }
        remember(hash)
        if !process(contactId: contactId, packet: packet) { forget(hash) }
    }

    private func remember(_ hash: Data) {
        seenHashes.insert(hash)
        seenOrder.append(hash)
        if seenOrder.count > Self.maxSeen {
            seenHashes.remove(seenOrder.removeFirst())
        }
    }

    private func forget(_ hash: Data) {
        seenHashes.remove(hash)
        seenOrder.removeAll { $0 == hash }
    }

    private func process(contactId: String, packet: Data) -> Bool {
        guard let contact = contacts.contact(id: contactId),
              let plaintext = NodeMeshCrypto.openOuter(packet: packet, myMessageKey: contact.myMessageKey) else { return false }
        if plaintext == ControlSignals.dummy { return true }
        if plaintext == ControlSignals.revoke {
            events.onRevoke(contactId)
            return true
        }
        if plaintext == ControlSignals.deleteContact {
            queue.removeAll { $0.contactId == contactId }
            removeContact(id: contactId)
            events.onContactRemoved(contactId)
            return true
        }
        if let text = String(data: plaintext, encoding: .utf8), handleSignal(text, contact: contact) { return true }

        guard let frame = RatchetFrame.decode(plaintext) else { return false }
        let header: RatchetHeader
        let ciphertext: Data
        switch frame {
        case .single(let h, let c):
            header = h
            ciphertext = c
        case .chunkStart(let total, let h, let piece):
            var pieces = [Data?](repeating: nil, count: Int(total))
            pieces[0] = piece
            reassembly[contactId] = Reassembly(header: h, pieces: pieces, received: 1)
            return true
        case .chunkCont(let index, let piece):
            guard var slot = reassembly[contactId], Int(index) < slot.pieces.count else { return false }
            if slot.pieces[Int(index)] == nil {
                slot.pieces[Int(index)] = piece
                slot.received += 1
            }
            guard slot.received == slot.pieces.count else {
                reassembly[contactId] = slot
                return true
            }
            reassembly[contactId] = nil
            header = slot.header
            ciphertext = slot.pieces.reduce(into: Data()) { $0.append($1!) }
        }

        do {
            let state = try session(for: contact)
            let decrypted = try DoubleRatchet.decrypt(state: state, header: header, ciphertext: ciphertext, associatedData: contact.pairSecret)
            ratchets.save(contactId, state)
            // A type this app does not know (groups): received, nothing to show.
            if let content = MessagePayload.decode(decrypted) { events.onMessage(contactId, content) }
            return true
        } catch {
            return false
        }
    }

    private func handleSignal(_ text: String, contact: NodeMeshContact) -> Bool {
        if text.hasPrefix(NodeMeshSignals.nodeMigratePrefix) {
            let entries = NodeConnectionStrings.parseList(String(text.dropFirst(NodeMeshSignals.nodeMigratePrefix.count)))
            if entries.count >= 2, let old = NodeConnectionStrings.parseAddress(entries[0]),
               let new = NodeConnectionStrings.parseAddress(entries[1]) {
                contacts.update(id: contact.id) { c in
                    var seen = Set<String>()
                    let updated = c.theirNodeAddresses.compactMap(NodeConnectionStrings.parseAddress).filter { $0 != old } + [new]
                    c.theirNodeAddresses = updated.filter { seen.insert($0).inserted }
                        .prefix(NodeConnectionStrings.poolMaxSize).map(NodeConnectionStrings.buildAddress)
                }
            }
            return true
        }
        if text.hasPrefix(NodeMeshSignals.tempNodePrefix) {
            if let address = NodeConnectionStrings.parseAddress(String(text.dropFirst(NodeMeshSignals.tempNodePrefix.count))) {
                contacts.update(id: contact.id) { $0.theirTempNodeAddress = address }
            }
            return true
        }
        if text == NodeMeshSignals.tempNodeOff {
            contacts.update(id: contact.id) { $0.theirTempNodeAddress = nil }
            return true
        }
        // Signals of other modes mean nothing for a Node-Mesh contact.
        return text.hasPrefix("UNPRUUF_")
    }
}
