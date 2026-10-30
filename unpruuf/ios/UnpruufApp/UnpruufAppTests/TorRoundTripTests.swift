import UnpruufCore
import XCTest
@testable import UnpruufApp

private final class Memory: KeyValueStore {
    var values: [String: String] = [:]
    func getString(_ key: String) -> String? { values[key] }
    func setString(_ key: String, _ value: String) { values[key] = value }
    func removeString(_ key: String) { values[key] = nil }
}

/// Two engines talking over the real Tor network, through a real onion node, with the app's own Tor
/// and SOCKS stream isolation. Needs a running server; start one with `EPHEMERAL=1 node dist/index.js`
/// and pass its owner code as `TEST_RUNNER_NODE_OWNER=<code>` to `xcodebuild test-without-building`.
@MainActor
final class TorRoundTripTests: XCTestCase {
    @MainActor private final class Phone {
        let memory = Memory()
        let nodes: NodeMeshStore
        let contacts: NodeMeshContactStore
        var ratchets: [String: DoubleRatchet.RatchetState] = [:]
        var texts: [String] = []
        var files: [Data] = []
        var delivered: [String] = []
        var engine: NodeMeshEngine!

        init(owner: String, seed: UInt8, client: NodeMeshClient, ready: @escaping () -> Bool) {
            nodes = NodeMeshStore(store: memory)
            contacts = NodeMeshContactStore(store: memory)
            nodes.addNode(ownerString: owner)
            var timing = NodeMeshEngine.Timing()
            timing.pollWaitMs = 0
            engine = NodeMeshEngine(
                contacts: contacts, nodes: nodes, client: client,
                ratchets: .init(load: { [unowned self] in ratchets[$0] }, save: { [unowned self] in ratchets[$0] = $1 },
                                delete: { [unowned self] in ratchets[$0] = nil }),
                deviceSecret: Data(repeating: seed, count: 32), timing: timing, isReady: ready
            )
            engine.events.onMessage = { [unowned self] _, content in
                switch content {
                case .text(let text): texts.append(text)
                case .attachment(_, let bytes, _): files.append(bytes)
                }
            }
            engine.events.onDelivered = { [unowned self] _, id in delivered.append(id) }
        }

        var contact: NodeMeshContact { contacts.contacts[0] }
    }

    private func wait(_ seconds: TimeInterval, _ what: String, until done: () async -> Bool) async throws {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            if await done() { return }
            try await Task.sleep(nanoseconds: 2_000_000_000)
        }
        XCTFail("timed out: \(what)")
        throw CancellationError()
    }

    func test_messagesBothWays_overRealTor() async throws {
        guard let owner = ProcessInfo.processInfo.environment["NODE_OWNER"] else { throw XCTSkip("no onion node") }
        var maybeTor: TorController?
        try await wait(30, "the app's Tor to start") {
            maybeTor = TorController.running
            return maybeTor != nil
        }
        let tor = try XCTUnwrap(maybeTor)
        try await wait(240, "Tor to get ready") { tor.isReady }
        let client = NodeMeshClient(transport: TorNodeTransport(socksPort: { await tor.socksPort }))

        let parsed = try XCTUnwrap(NodeConnectionStrings.parseOwner(owner))
        try await wait(180, "the onion node to answer") { await client.healthCheck(address: parsed.address) }

        let one = Phone(owner: owner, seed: 1, client: client) { tor.isReady }
        let two = Phone(owner: owner, seed: 2, client: client) { tor.isReady }
        let flowOne = NodeMeshPairingFlow(nodes: one.nodes, contacts: one.contacts)
        let flowTwo = NodeMeshPairingFlow(nodes: two.nodes, contacts: two.contacts)
        let codeOne = try XCTUnwrap(flowOne.myCode()), codeTwo = try XCTUnwrap(flowTwo.myCode())
        _ = flowOne.handle(payload: codeTwo, displayName: "2")
        _ = flowTwo.handle(payload: codeOne, displayName: "1")
        let firstIsOne = [UInt8](one.contact.myRatchetKeyPair.publicKey).lexicographicallyPrecedes([UInt8](two.contact.myRatchetKeyPair.publicKey))
        let (a, b) = firstIsOne ? (one, two) : (two, one)

        a.engine.send(contactId: a.contact.id, plaintext: MessagePayload.encodeText("hallo über Tor"), messageId: "m1")
        try await wait(180, "the text to be deposited") { a.delivered == ["m1"] }
        try await wait(180, "the text to arrive") {
            await b.engine.pollContact(b.contact.id)
            return b.texts == ["hallo über Tor"]
        }

        let file = Data((0..<9_000).map { UInt8($0 % 251) })
        b.engine.send(contactId: b.contact.id, plaintext: try MessagePayload.encodeAttachment(name: "f", bytes: file, isImage: false), messageId: "m2")
        try await wait(180, "the file to be deposited") { b.delivered == ["m2"] }
        try await wait(180, "the file to arrive") {
            await a.engine.pollContact(a.contact.id)
            return a.files == [file]
        }
    }
}
