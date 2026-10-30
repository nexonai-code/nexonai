import XCTest
@testable import UnpruufCore

private func onion(_ i: Int) -> String {
    OnionAddress.address(publicKey: Data(repeating: 5, count: 30) + Data([UInt8(i >> 8), UInt8(i & 0xFF)]))!
}

private final class Memory: KeyValueStore {
    var values: [String: String] = [:]
    func getString(_ key: String) -> String? { values[key] }
    func setString(_ key: String, _ value: String) { values[key] = value }
    func removeString(_ key: String) { values[key] = nil }
}

/// The node contract in memory, with what a real server does to cursors and long answers.
private final class FakeNodes: @unchecked Sendable {
    struct Blob { let id: Int64; let tag: String; let data: String }
    var blobs: [String: [Blob]] = [:]
    var nextId: Int64 = 1
    var limit = 256
    var depositStatus: Int?
    var fetchStatus: (Int, Int?)?
    var fetchRequests: [(address: String, tags: [String], since: Int64)] = []
    var depositTtls: [Int64] = []
    var isolationKeys: [String?] = []
    private let lock = NSLock()

    func handle(address: String, isolationKey: String?, head: String, body: Data) -> Data {
        lock.lock(); defer { lock.unlock() }
        isolationKeys.append(isolationKey)
        let json = (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:]
        func reply(_ status: Int, _ payload: String, retry: Int? = nil) -> Data {
            let extra = retry.map { "Retry-After: \($0)\r\n" } ?? ""
            return Data("HTTP/1.1 \(status) X\r\n\(extra)Content-Length: \(payload.utf8.count)\r\n\r\n\(payload)".utf8)
        }
        if head.hasPrefix("PUT /deposit") {
            if let status = depositStatus { return reply(status, "{}") }
            depositTtls.append((json["ttl"] as? NSNumber)?.int64Value ?? 0)
            blobs[address, default: []].append(Blob(id: nextId, tag: json["routing_tag"] as! String, data: json["ciphertext"] as! String))
            nextId += 1
            return reply(201, "{}")
        }
        if head.hasPrefix("POST /fetchMany") {
            if let (status, retry) = fetchStatus { return reply(status, "{}", retry: retry) }
            let tags = json["tags"] as! [String]
            let since = (json["since"] as? NSNumber)?.int64Value ?? 0
            fetchRequests.append((address, tags, since))
            let matching = (blobs[address] ?? []).filter { tags.contains($0.tag) && $0.id > since }
            let page = matching.prefix(limit)
            var map: [String: [String]] = [:]
            for b in page { map[b.tag, default: []].append(b.data) }
            var out: [String: Any] = ["cursor": page.last?.id ?? since, "blobs": map]
            if matching.count > limit { out["more"] = true }
            return reply(200, String(decoding: try! JSONSerialization.data(withJSONObject: out), as: UTF8.self))
        }
        return reply(404, "{}")
    }
}

private final class FakeConnection: NodeConnection, @unchecked Sendable {
    let nodes: FakeNodes
    let address: String
    let isolationKey: String?
    var answer = Data()
    init(_ nodes: FakeNodes, _ address: String, _ key: String?) {
        self.nodes = nodes
        self.address = address
        isolationKey = key
    }
    func send(_ data: Data) async throws {
        let end = data.range(of: Data("\r\n\r\n".utf8))!
        answer = nodes.handle(address: address, isolationKey: isolationKey,
                              head: String(decoding: data[..<end.lowerBound], as: UTF8.self), body: Data(data[end.upperBound...]))
    }
    func receive(atLeast: Int, atMost: Int) async throws -> Data {
        let out = answer.prefix(atMost)
        answer = Data(answer.dropFirst(out.count))
        return Data(out)
    }
    func setDeadline(_ seconds: TimeInterval) {}
    func close() {}
}

private struct FakeTransport: NodeTransport {
    let nodes: FakeNodes
    func connect(address: String, port: UInt16, isolationKey: String?, timeout: TimeInterval) async throws -> NodeConnection {
        FakeConnection(nodes, address, isolationKey)
    }
}

@MainActor
private final class Phone {
    let memory = Memory()
    let nodes: NodeMeshStore
    let contacts: NodeMeshContactStore
    var ratchets: [String: DoubleRatchet.RatchetState] = [:]
    var received: [String] = []
    var receivedFiles: [Data] = []
    var delivered: [String] = []
    var sendFailed = 0
    var removed: [String] = []
    var revoked = 0
    var ready = true
    var now: Int64 = 486_000 * 3_600_000 + 5
    let engine: NodeMeshEngine

    convenience init(_ range: Range<Int>, fake: FakeNodes) {
        self.init(addresses: range.map(onion), secret: "Server_\(range.lowerBound)_0123456789",
                  seed: UInt8(range.lowerBound), transport: FakeTransport(nodes: fake))
    }

    init(addresses: [String], secret: String, seed: UInt8, transport: NodeTransport) {
        var timing = NodeMeshEngine.Timing()
        timing.pollWaitMs = 0
        timing.requestSpread = 0
        timing.backoffInitial = 0.01
        timing.backoffMax = 0.02
        let memory = self.memory
        let nodes = NodeMeshStore(store: memory)
        let contacts = NodeMeshContactStore(store: memory)
        let file = NodeListFile.Parsed(name: "L", ownerSecret: secret, control: nil, addresses: addresses, bridges: [])
        _ = nodes.importNodeList(file, name: "A", targetListId: nil)
        self.nodes = nodes
        self.contacts = contacts
        var box: Phone?
        engine = NodeMeshEngine(contacts: contacts, nodes: nodes, client: NodeMeshClient(transport: transport),
                                ratchets: .init(load: { box?.ratchets[$0] }, save: { box?.ratchets[$0] = $1 }, delete: { box?.ratchets[$0] = nil }),
                                deviceSecret: Data(repeating: seed, count: 32), timing: timing,
                                isReady: { box?.ready ?? false }, nowMs: { box?.now ?? 0 })
        box = self
        engine.events.onMessage = { [unowned self] _, content in
            switch content {
            case .text(let text): received.append(text)
            case .attachment(_, let bytes, _): receivedFiles.append(bytes)
            }
        }
        engine.events.onDelivered = { [unowned self] _, id in delivered.append(id) }
        engine.events.onSendFailed = { [unowned self] _, _ in sendFailed += 1 }
        engine.events.onContactRemoved = { [unowned self] id in removed.append(id) }
        engine.events.onRevoke = { [unowned self] _ in revoked += 1 }
    }

    var contact: NodeMeshContact { contacts.contacts[0] }
}

@MainActor
final class NodeMeshEngineTests: XCTestCase {
    private func pair(_ fake: FakeNodes) throws -> (first: Phone, second: Phone) {
        let a = Phone(0..<5, fake: fake), b = Phone(10..<15, fake: fake)
        let flowA = NodeMeshPairingFlow(nodes: a.nodes, contacts: a.contacts), flowB = NodeMeshPairingFlow(nodes: b.nodes, contacts: b.contacts)
        let codeA = try XCTUnwrap(flowA.myCode()), codeB = try XCTUnwrap(flowB.myCode())
        _ = flowA.handle(payload: codeB, displayName: "B")
        _ = flowB.handle(payload: codeA, displayName: "A")
        let aFirst = [UInt8](a.contact.myRatchetKeyPair.publicKey).lexicographicallyPrecedes([UInt8](b.contact.myRatchetKeyPair.publicKey))
        return aFirst ? (a, b) : (b, a)
    }

    private func settle(_ phone: Phone) async {
        for _ in 0..<500 where phone.engine.pendingDeliveryCount > 0 {
            try? await Task.sleep(nanoseconds: 2_000_000)
        }
    }

    private func poll(_ phone: Phone) async { await phone.engine.pollContact(phone.contact.id) }

    func test_textBothDirections_andAChunkedAttachment() async throws {
        let fake = FakeNodes()
        let (a, b) = try pair(fake)
        a.engine.send(contactId: a.contact.id, plaintext: MessagePayload.encodeText("hallo"), messageId: "m1")
        await settle(a)
        XCTAssertEqual(a.delivered, ["m1"])
        await poll(b)
        XCTAssertEqual(b.received, ["hallo"])

        let big = Data((0..<30_000).map { UInt8($0 % 251) })
        b.engine.send(contactId: b.contact.id, plaintext: try MessagePayload.encodeAttachment(name: "f", bytes: big, isImage: false), messageId: "m2")
        await settle(b)
        await poll(a)
        XCTAssertEqual(a.receivedFiles, [big])
    }

    func test_theSideThatMustReceiveFirst_isTold() async throws {
        let fake = FakeNodes()
        let (_, b) = try pair(fake)
        b.engine.send(contactId: b.contact.id, plaintext: MessagePayload.encodeText("x"), messageId: "m")
        XCTAssertEqual(b.sendFailed, 1)
        XCTAssertEqual(b.engine.pendingDeliveryCount, 0)
    }

    func test_eachPacketGoesToEveryNode_andIsReadOnce() async throws {
        let fake = FakeNodes()
        let (a, b) = try pair(fake)
        a.engine.send(contactId: a.contact.id, plaintext: MessagePayload.encodeText("once"), messageId: nil)
        await settle(a)
        XCTAssertEqual(fake.blobs.values.map(\.count).reduce(0, +), 3, "three nodes")
        await poll(b)
        XCTAssertEqual(b.received, ["once"], "the ratchet would fail on a second copy")
    }

    func test_oneRequestPerContactAndNode_withTheContactsTorKey() async throws {
        let fake = FakeNodes()
        let (_, b) = try pair(fake)
        await poll(b)
        XCTAssertEqual(fake.fetchRequests.count, 3)
        XCTAssertEqual(Set(fake.fetchRequests.map(\.address)).count, 3)
        XCTAssertEqual(fake.fetchRequests[0].tags.count, 26, "first poll: full window")
        XCTAssertEqual(Set(fake.isolationKeys.map { $0 ?? "" }).count, 1)
        XCTAssertEqual(fake.isolationKeys[0]?.count, 32)

        fake.fetchRequests.removeAll()
        await poll(b)
        XCTAssertEqual(fake.fetchRequests[0].tags.count, 2, "steady state: two epochs")
    }

    func test_cursorAsksOnlyForWhatIsNew() async throws {
        let fake = FakeNodes()
        let (a, b) = try pair(fake)
        a.engine.send(contactId: a.contact.id, plaintext: MessagePayload.encodeText("1"), messageId: nil)
        await settle(a)
        await poll(b)
        fake.fetchRequests.removeAll()
        await poll(b)
        XCTAssertTrue(fake.fetchRequests.allSatisfy { $0.since > 0 }, "\(fake.fetchRequests.map(\.since))")
    }

    func test_cutAnswer_isFetchedOnFromTheCursor() async throws {
        let fake = FakeNodes()
        fake.limit = 2
        let (a, b) = try pair(fake)
        for i in 0..<5 { a.engine.send(contactId: a.contact.id, plaintext: MessagePayload.encodeText("m\(i)"), messageId: nil) }
        await settle(a)
        await poll(b)
        XCTAssertEqual(b.received.sorted(), ["m0", "m1", "m2", "m3", "m4"])
    }

    func test_cutAnswer_stopsAfterEightContinuations_andStaysIncomplete() async throws {
        let fake = FakeNodes()
        fake.limit = 1
        let (a, b) = try pair(fake)
        for i in 0..<12 { a.engine.send(contactId: a.contact.id, plaintext: MessagePayload.encodeText("m\(i)"), messageId: nil) }
        await settle(a)
        await poll(b)
        XCTAssertEqual(fake.fetchRequests.count, 3 * 8)
        fake.fetchRequests.removeAll()
        await poll(b)
        XCTAssertEqual(fake.fetchRequests[0].tags.count, 26, "an incomplete poll keeps the full window")
        XCTAssertEqual(b.received.count, 12, "the next poll gets the rest")
    }

    func test_nodeSaysWait_noRequestUntilThen() async throws {
        let fake = FakeNodes()
        let (_, b) = try pair(fake)
        fake.fetchStatus = (429, 60)
        await poll(b)
        fake.fetchStatus = nil
        fake.fetchRequests.removeAll()
        await poll(b)
        XCTAssertTrue(fake.fetchRequests.isEmpty)
    }

    func test_deposit_failsThenWorks_inOrder() async throws {
        let fake = FakeNodes()
        let (a, b) = try pair(fake)
        fake.depositStatus = 507
        a.engine.send(contactId: a.contact.id, plaintext: MessagePayload.encodeText("eins"), messageId: "1")
        a.engine.send(contactId: a.contact.id, plaintext: MessagePayload.encodeText("zwei"), messageId: "2")
        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(a.engine.pendingDeliveryCount, 2)
        XCTAssertTrue(a.delivered.isEmpty)
        fake.depositStatus = nil
        await settle(a)
        XCTAssertEqual(a.delivered, ["1", "2"])
        await poll(b)
        XCTAssertEqual(b.received, ["eins", "zwei"])
    }

    func test_nothingGoesOutBeforeTorIsReady() async throws {
        let fake = FakeNodes()
        let (a, _) = try pair(fake)
        a.ready = false
        a.engine.send(contactId: a.contact.id, plaintext: MessagePayload.encodeText("x"), messageId: nil)
        try await Task.sleep(nanoseconds: 30_000_000)
        XCTAssertTrue(fake.blobs.isEmpty)
        a.ready = true
        await settle(a)
        XCTAssertFalse(fake.blobs.isEmpty)
    }

    func test_ttl_isSentWithTheChatsLifetime() async throws {
        let fake = FakeNodes()
        let (a, _) = try pair(fake)
        a.contacts.update(id: a.contact.id) { $0.messageTtlHours = 1 }
        a.engine.send(contactId: a.contact.id, plaintext: MessagePayload.encodeText("x"), messageId: nil)
        a.engine.sendSignal(ControlSignals.dummy, contactId: a.contact.id)
        await settle(a)
        XCTAssertEqual(Set(fake.depositTtls), [3_600_000], "cover packets carry it too")
    }

    func test_deleteContact_signalStillGoesOut_andRemovesThemThere() async throws {
        let fake = FakeNodes()
        let (a, b) = try pair(fake)
        let id = a.contact.id, theirId = b.contact.id
        a.engine.deleteContact(id: id)
        XCTAssertTrue(a.contacts.contacts.isEmpty)
        await settle(a)
        await poll(b)
        XCTAssertEqual(b.removed, [theirId])
        XCTAssertTrue(b.contacts.contacts.isEmpty)
        XCTAssertNil(b.ratchets[theirId])
    }

    func test_signals_revokeCoverAndMigration() async throws {
        let fake = FakeNodes()
        let (a, b) = try pair(fake)
        a.engine.sendSignal(ControlSignals.revoke, contactId: a.contact.id)
        a.engine.sendSignal(ControlSignals.dummy, contactId: a.contact.id)
        let old = try XCTUnwrap(NodeConnectionStrings.parseAddress(b.contact.theirNodeAddresses[0]))
        let new = onion(700)
        a.engine.sendSignal(Data("UNPRUUF_NODEMIGRATE_V1:unpruuf-node:v1:\(old);unpruuf-node:v1:\(new)".utf8), contactId: a.contact.id)
        a.engine.sendSignal(Data("UNPRUUF_TEMPNODE_V1:unpruuf-node:v1:evil.example.com".utf8), contactId: a.contact.id)
        a.engine.sendSignal(Data("UNPRUUF_TEMPNODE_V1:unpruuf-node:v1:\(onion(701))".utf8), contactId: a.contact.id)
        await settle(a)
        await poll(b)
        XCTAssertEqual(b.revoked, 1)
        XCTAssertTrue(b.received.isEmpty)
        XCTAssertTrue(b.contact.theirNodeAddresses.contains("unpruuf-node:v1:" + new))
        XCTAssertFalse(b.contact.theirNodeAddresses.contains("unpruuf-node:v1:" + old))
        XCTAssertEqual(b.contact.theirNodeAddresses.count, 3)
        XCTAssertEqual(b.contact.theirTempNodeAddress, onion(701))
    }

    func test_packetOfAnotherContact_isDropped() async throws {
        let fake = FakeNodes()
        let (_, b) = try pair(fake)
        b.engine.ingest(contactId: b.contact.id, tag: "t", packet: Data(repeating: 1, count: 4096))
        XCTAssertTrue(b.received.isEmpty)
    }

    func test_wipe_stopsWhatIsQueued() async throws {
        let fake = FakeNodes()
        let (a, _) = try pair(fake)
        a.ready = false
        a.engine.send(contactId: a.contact.id, plaintext: MessagePayload.encodeText("x"), messageId: nil)
        a.engine.wipe()
        XCTAssertEqual(a.engine.pendingDeliveryCount, 0)
        a.ready = true
        try await Task.sleep(nanoseconds: 30_000_000)
        XCTAssertTrue(fake.blobs.isEmpty)
    }

    func test_window() {
        let current: Int64 = 500_000
        let full = (0..<26).map { current - Int64($0) }
        XCTAssertEqual(NodeMeshWindow.epochs(current: current, lastSuccessful: nil, fullWindow: full), full)
        XCTAssertEqual(NodeMeshWindow.epochs(current: current, lastSuccessful: current, fullWindow: full), [current, current - 1])
        XCTAssertEqual(NodeMeshWindow.epochs(current: current, lastSuccessful: current - 1, fullWindow: full), [current, current - 1, current - 2])
        XCTAssertEqual(NodeMeshWindow.epochs(current: current, lastSuccessful: current - 5, fullWindow: full), (0...6).map { current - Int64($0) })
        XCTAssertEqual(NodeMeshWindow.epochs(current: current, lastSuccessful: current - 30, fullWindow: full), full)
        XCTAssertEqual(NodeMeshWindow.epochs(current: current, lastSuccessful: current - 24, fullWindow: full).count, 26)
        XCTAssertEqual(NodeMeshWindow.epochs(current: current, lastSuccessful: current + 3, fullWindow: full), full)
    }

    func test_isolationKey() {
        let secret = Data(repeating: 1, count: 32)
        let a = TorIsolation.key(deviceSecret: secret, contactId: "a")
        XCTAssertEqual(a.count, 32)
        XCTAssertEqual(a, TorIsolation.key(deviceSecret: secret, contactId: "a"))
        XCTAssertNotEqual(a, TorIsolation.key(deviceSecret: secret, contactId: "b"))
        XCTAssertNotEqual(a, TorIsolation.key(deviceSecret: Data(repeating: 2, count: 32), contactId: "a"))
    }
}

private struct LoopbackTransport: NodeTransport {
    let port: UInt16
    func connect(address: String, port _: UInt16, isolationKey: String?, timeout: TimeInterval) async throws -> NodeConnection {
        try await NWNodeConnection.open(host: "127.0.0.1", port: port, timeout: timeout)
    }
}

/// Two engines through the real `node-mesh-server`, see `RealServerTests` for how to run it. Both
/// sides share its one node, so each also reads its own packets back and has to drop them.
@MainActor
final class EngineOnRealServerTests: XCTestCase {
    func test_twoEngines_textAndChunkedFile_bothWays() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let port = env["NODE_MESH_TEST_PORT"].flatMap(UInt16.init), let secret = env["NODE_MESH_TEST_SECRET"] else {
            throw XCTSkip("no test server")
        }
        let address = "p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion"
        let one = Phone(addresses: [address], secret: secret, seed: 1, transport: LoopbackTransport(port: port))
        let two = Phone(addresses: [address], secret: secret, seed: 2, transport: LoopbackTransport(port: port))
        let flowOne = NodeMeshPairingFlow(nodes: one.nodes, contacts: one.contacts)
        let flowTwo = NodeMeshPairingFlow(nodes: two.nodes, contacts: two.contacts)
        let codeOne = try XCTUnwrap(flowOne.myCode()), codeTwo = try XCTUnwrap(flowTwo.myCode())
        _ = flowOne.handle(payload: codeTwo, displayName: "2")
        _ = flowTwo.handle(payload: codeOne, displayName: "1")
        let firstIsOne = [UInt8](one.contact.myRatchetKeyPair.publicKey).lexicographicallyPrecedes([UInt8](two.contact.myRatchetKeyPair.publicKey))
        let (a, b) = firstIsOne ? (one, two) : (two, one)
        a.now = Int64(Date().timeIntervalSince1970 * 1000)
        b.now = a.now

        func settle(_ p: Phone) async {
            for _ in 0..<500 where p.engine.pendingDeliveryCount > 0 { try? await Task.sleep(nanoseconds: 5_000_000) }
        }
        a.engine.send(contactId: a.contact.id, plaintext: MessagePayload.encodeText("hallo server"), messageId: "m1")
        await settle(a)
        XCTAssertEqual(a.delivered, ["m1"])
        await b.engine.pollContact(b.contact.id)
        XCTAssertEqual(b.received, ["hallo server"])

        let big = Data((0..<20_000).map { UInt8($0 % 251) })
        b.engine.send(contactId: b.contact.id, plaintext: try MessagePayload.encodeAttachment(name: "f", bytes: big, isImage: false), messageId: "m2")
        await settle(b)
        XCTAssertEqual(b.delivered, ["m2"])
        await a.engine.pollContact(a.contact.id)
        XCTAssertEqual(a.receivedFiles, [big])
        XCTAssertTrue(a.received.isEmpty, "its own packet on the shared node is not a message")
    }
}
