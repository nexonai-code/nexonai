import Network
import XCTest
@testable import UnpruufCore

private let onion = "p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion"

/// Replays scripted bytes, in as many pieces as the test wants, and records what was sent.
private final class ScriptedConnection: NodeConnection, @unchecked Sendable {
    var incoming: [Data]
    var sent = Data()
    var closed = false

    init(_ pieces: [Data]) { incoming = pieces }

    func send(_ data: Data) async throws { sent.append(data) }

    func receive(atLeast: Int, atMost: Int) async throws -> Data {
        var out = Data()
        while out.count < atLeast, !incoming.isEmpty {
            let take = min(atMost - out.count, incoming[0].count)
            out.append(incoming[0].prefix(take))
            incoming[0] = Data(incoming[0].dropFirst(take))
            if incoming[0].isEmpty { incoming.removeFirst() }
        }
        return out
    }

    func setDeadline(_ seconds: TimeInterval) {}
    func close() { closed = true }
}

private struct ScriptedTransport: NodeTransport {
    let connection: ScriptedConnection?
    func connect(address: String, port: UInt16, isolationKey: String?, timeout: TimeInterval) async throws -> NodeConnection {
        guard let connection else { throw NodeConnectionError.connectionFailed }
        return connection
    }
}

private func reply(_ status: Int, headers: [String] = [], body: String = "") -> Data {
    let head = (["HTTP/1.1 \(status) X", "Content-Length: \(body.utf8.count)"] + headers).joined(separator: "\r\n")
    return Data((head + "\r\n\r\n" + body).utf8)
}

private func client(_ pieces: Data...) -> (NodeMeshClient, ScriptedConnection) {
    let connection = ScriptedConnection(pieces)
    return (NodeMeshClient(transport: ScriptedTransport(connection: connection)), connection)
}

final class NodeMeshClientTests: XCTestCase {
    func test_plainHost_isNeverConnected() async {
        let (c, connection) = client(reply(201))
        let result = await c.deposit(address: "evil.example.com", ownerSecret: "s", routingTag: "t", ciphertext: Data())
        XCTAssertEqual(result, .failed)
        XCTAssertTrue(connection.sent.isEmpty, "the secret never leaves")
    }

    func test_deposit_statusMapping() async {
        let cases: [(Int, NodeMeshClient.DepositResult)] = [
            (201, .accepted), (507, .storageFull), (402, .licenceExpired), (423, .serverLocked), (400, .failed), (413, .failed),
        ]
        for (status, expected) in cases {
            let (c, _) = client(reply(status))
            let result = await c.deposit(address: onion, ownerSecret: "s", routingTag: "t", ciphertext: Data())
            XCTAssertEqual(result, expected, "\(status)")
        }
        let (c, _) = client(reply(429, headers: ["Retry-After: 7"]))
        let limited = await c.deposit(address: onion, ownerSecret: "s", routingTag: "t", ciphertext: Data())
        XCTAssertEqual(limited, .tagQueueFull(retryAfterSeconds: 7))
    }

    func test_deposit_sendsTheContract() async throws {
        let (c, connection) = client(reply(201))
        _ = await c.deposit(address: onion, ownerSecret: "secret", routingTag: "a+b/c=", ciphertext: Data([1, 2, 3]), ttlMs: 3_600_000)
        let sent = String(decoding: connection.sent, as: UTF8.self)
        XCTAssertTrue(sent.hasPrefix("PUT /deposit HTTP/1.1\r\nHost: \(onion)\r\nAuthorization: Bearer secret\r\nConnection: close\r\n"))
        let body = try XCTUnwrap(sent.components(separatedBy: "\r\n\r\n").last)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(body.utf8)) as? [String: Any])
        XCTAssertEqual(json["routing_tag"] as? String, "a+b/c=")
        XCTAssertEqual(json["ciphertext"] as? String, "AQID")
        XCTAssertEqual(json["ttl"] as? Int, 3_600_000)
        XCTAssertTrue(connection.closed)
    }

    func test_guestDeposit_mapping_andHeader() async {
        let cases: [(Int, NodeMeshClient.GuestDepositResult)] = [(201, .ok), (401, .grantRefused), (429, .quotaReached), (500, .failed)]
        for (status, expected) in cases {
            let (c, connection) = client(reply(status))
            let result = await c.depositAsGuest(address: onion, grantToken: "tok.en", routingTag: "t", ciphertext: Data())
            XCTAssertEqual(result, expected, "\(status)")
            XCTAssertTrue(String(decoding: connection.sent, as: UTF8.self).contains("Authorization: Guest tok.en\r\n"))
        }
        let unreachable = NodeMeshClient(transport: ScriptedTransport(connection: nil))
        let result = await unreachable.depositAsGuest(address: onion, grantToken: "t", routingTag: "t", ciphertext: Data())
        XCTAssertEqual(result, .failed)
    }

    func test_fetchMany_readsBlobsCursorAndMore() async {
        let (c, connection) = client(reply(200, body: "{\"cursor\":42,\"more\":true,\"blobs\":{\"a+b=\":[\"AQID\",\"!!\"],\"c\":[]}}"))
        let outcome = await c.fetchMany(address: onion, tags: ["a+b=", "c"], waitMs: 20_000, since: 5)
        XCTAssertEqual(outcome, .ok(.init(blobs: ["a+b=": [Data([1, 2, 3])], "c": []], cursor: 42, more: true)))
        XCTAssertTrue(String(decoding: connection.sent, as: UTF8.self).hasPrefix("POST /fetchMany HTTP/1.1\r\n"))
    }

    func test_fetchMany_oldNodeHasNoCursor_andMoreOnlyCountsAtTheTop() {
        XCTAssertNil(NodeMeshClient.parseFetchMany(Data("{\"blobs\":{\"t\":[]}}".utf8))?.cursor)
        XCTAssertEqual(NodeMeshClient.parseFetchMany(Data("{\"cursor\":1,\"blobs\":{\"more\":[\"true\"]}}".utf8))?.more, false)
        XCTAssertNil(NodeMeshClient.parseFetchMany(Data("not json".utf8)))
    }

    func test_fetchMany_rateLimit_andEmptyTags() async {
        let (c, connection) = client(reply(429, headers: ["retry-after: 3"]))
        let limited = await c.fetchMany(address: onion, tags: ["t"], waitMs: 0, since: 0)
        XCTAssertEqual(limited, .rateLimited(retryAfterSeconds: 3))
        XCTAssertTrue(connection.closed)
        let (empty, untouched) = client()
        let none = await empty.fetchMany(address: onion, tags: [], waitMs: 0, since: 9)
        XCTAssertEqual(none, .ok(.init(blobs: [:], cursor: 9, more: false)))
        XCTAssertTrue(untouched.sent.isEmpty)
    }

    func test_retryAfter_isCappedAtOneHour() async {
        let (c, _) = client(reply(429, headers: ["Retry-After: 99999999"]))
        let limited = await c.fetchMany(address: onion, tags: ["t"], waitMs: 0, since: 0)
        XCTAssertEqual(limited, .rateLimited(retryAfterSeconds: 3600))
    }

    func test_pool_dropsWhatIsNotAV3Onion() {
        let body = Data("{\"control\":\"\(onion)\",\"addresses\":[\"\(onion)\",\"\(onion)\",\"evil.example.com\"]}".utf8)
        XCTAssertEqual(NodeMeshClient.parsePool(body), .init(addresses: [onion], controlAddress: onion))
        XCTAssertNil(NodeMeshClient.parsePool(Data("{\"control\":\"evil.example.com\"}".utf8))?.controlAddress)
    }

    func test_lockStatus_andHealth() async {
        let (c, _) = client(reply(200, body: "{\"locked\":true}"))
        let locked = await c.lockStatus(controlAddress: onion)
        XCTAssertEqual(locked, true)
        let (h, _) = client(reply(503))
        let healthy = await h.healthCheck(address: onion)
        XCTAssertFalse(healthy)
    }

    // MARK: Reply limits

    private func read(_ pieces: Data...) async -> NodeHTTPResponse? {
        try? await NodeHTTPResponse.read(from: ScriptedConnection(pieces))
    }

    func test_reply_inSmallPieces() async {
        let full = reply(200, body: "hello")
        let response = await read(full.prefix(3), full.dropFirst(3).prefix(20), Data(full.dropFirst(23)))
        XCTAssertEqual(response?.status, 200)
        XCTAssertEqual(response?.body, Data("hello".utf8))
    }

    func test_reply_limits() async {
        let longLine = Data(("HTTP/1.1 200 OK\r\nX: " + String(repeating: "a", count: 9000) + "\r\n\r\n").utf8)
        let longLineResult = await read(longLine)
        XCTAssertNil(longLineResult)
        let noNewline = await read(Data(repeating: 0x61, count: 9000))
        XCTAssertNil(noNewline)
        let manyLines = await read(reply(200, headers: (0..<65).map { "X-\($0): 1" }))
        XCTAssertNil(manyLines)
        let manyOk = await read(reply(200, headers: (0..<62).map { "X-\($0): 1" }))
        XCTAssertEqual(manyOk?.status, 200)
        let huge = await read(Data("HTTP/1.1 200 OK\r\nContent-Length: 12582913\r\n\r\n".utf8))
        XCTAssertNil(huge)
        let truncated = await read(Data("HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nabc".utf8))
        XCTAssertNil(truncated)
        let empty = await read()
        XCTAssertNil(empty)
    }
}

final class Socks5Tests: XCTestCase {
    private func run(_ username: String?, _ replies: Data...) async -> (Bool, ScriptedConnection) {
        let connection = ScriptedConnection(replies)
        let ok = (try? await Socks5.connect(over: connection, host: "a.onion", port: 80, username: username)) != nil
        return (ok, connection)
    }

    private let granted = Data([5, 0, 0, 1, 0, 0, 0, 0, 0, 0])

    func test_withoutUserName() async {
        let (ok, c) = await run(nil, Data([5, 0]), granted)
        XCTAssertTrue(ok)
        XCTAssertEqual([UInt8](c.sent), [5, 1, 0, 5, 1, 0, 3, 7] + Array("a.onion".utf8) + [0, 80])
    }

    func test_withUserName_sendsItAsUserAndPassword() async {
        let (ok, c) = await run("ab", Data([5, 2]), Data([1, 0]), granted)
        XCTAssertTrue(ok)
        XCTAssertEqual([UInt8](c.sent.prefix(10)), [5, 1, 2, 1, 2, 97, 98, 2, 97, 98])
    }

    func test_proxySkippingTheUserName_isRefused() async {
        let (ok, c) = await run("ab", Data([5, 0]), granted)
        XCTAssertFalse(ok, "fails closed")
        XCTAssertEqual(c.sent.count, 3, "no connect request went out")
    }

    func test_refusals() async {
        let notSocks = await run(nil, Data([4, 0]))
        XCTAssertFalse(notSocks.0)
        let wrongCredentials = await run("ab", Data([5, 2]), Data([1, 1]))
        XCTAssertFalse(wrongCredentials.0)
        let refused = await run(nil, Data([5, 0]), Data([5, 4, 0, 1, 0, 0, 0, 0, 0, 0]))
        XCTAssertFalse(refused.0)
        let closed = await run(nil, Data([5, 0]))
        XCTAssertFalse(closed.0)
    }

    func test_nameAddressInTheReply_isConsumed() async {
        let connection = ScriptedConnection([Data([5, 0]), Data([5, 0, 0, 3, 2, 97, 98, 0, 80]), Data("rest".utf8)])
        try? await Socks5.connect(over: connection, host: "a.onion", port: 80, username: nil)
        let left = try? await connection.receive(atLeast: 4, atMost: 4)
        XCTAssertEqual(left, Data("rest".utf8))
    }

    func test_torNotReady_nothingIsSent() async {
        let transport = TorNodeTransport(socksPort: { 0 })
        do {
            _ = try await transport.connect(address: onion, port: 80, isolationKey: nil, timeout: 1)
            XCTFail("no connection without Tor")
        } catch {
            XCTAssertEqual(error as? NodeConnectionError, .torNotReady)
        }
    }
}

/// Loopback, in the test target only. Against the real server:
/// `NODE_MESH_TEST_PORT=<port> NODE_MESH_TEST_SECRET=<owner secret> swift test --filter RealServerTests`
/// with the server started as `NODE_MESH_TOR=0 EPHEMERAL=1 node dist/index.js`.
private struct LoopbackTransport: NodeTransport {
    let port: UInt16
    func connect(address: String, port _: UInt16, isolationKey: String?, timeout: TimeInterval) async throws -> NodeConnection {
        try await NWNodeConnection.open(host: "127.0.0.1", port: port, timeout: timeout)
    }
}

final class RealServerTests: XCTestCase {
    private func setting() throws -> (NodeMeshClient, String) {
        let env = ProcessInfo.processInfo.environment
        guard let port = env["NODE_MESH_TEST_PORT"].flatMap(UInt16.init), let secret = env["NODE_MESH_TEST_SECRET"] else {
            throw XCTSkip("no test server")
        }
        return (NodeMeshClient(transport: LoopbackTransport(port: port)), secret)
    }

    private func tag() -> String { Data((0..<32).map { _ in UInt8.random(in: 0...255) }).base64EncodedString() }

    func test_depositFetchCursor() async throws {
        let (c, secret) = try setting()
        let healthy = await c.healthCheck(address: onion)
        XCTAssertTrue(healthy)
        let t = tag()
        let packet = Data(repeating: 9, count: 4096)
        let deposited = await c.deposit(address: onion, ownerSecret: secret, routingTag: t, ciphertext: packet, ttlMs: 3_600_000)
        XCTAssertEqual(deposited, .accepted)

        guard case .ok(let first) = await c.fetchMany(address: onion, tags: [t], waitMs: 0, since: 0) else { return XCTFail() }
        XCTAssertEqual(first.blobs[t], [packet])
        let cursor = try XCTUnwrap(first.cursor)
        XCTAssertFalse(first.more)
        guard case .ok(let second) = await c.fetchMany(address: onion, tags: [t], waitMs: 0, since: cursor) else { return XCTFail() }
        XCTAssertEqual(second.blobs[t] ?? [], [], "the cursor covers what was read")
    }

    func test_longPollReturnsWhenSomethingArrives() async throws {
        let (c, secret) = try setting()
        let t = tag()
        guard case .ok(let start) = await c.fetchMany(address: onion, tags: [t], waitMs: 0, since: 0) else { return XCTFail() }
        async let waiting = c.fetchMany(address: onion, tags: [t], waitMs: 10_000, since: start.cursor ?? 0)
        try await Task.sleep(nanoseconds: 500_000_000)
        let began = Date()
        _ = await c.deposit(address: onion, ownerSecret: secret, routingTag: t, ciphertext: Data(repeating: 1, count: 4096))
        guard case .ok(let woken) = await waiting else { return XCTFail() }
        XCTAssertEqual(woken.blobs[t]?.count, 1)
        XCTAssertLessThan(Date().timeIntervalSince(began), 5)
    }

    func test_poolImport() async throws {
        let (c, secret) = try setting()
        let info = await c.listPool(address: onion, ownerSecret: secret)
        XCTAssertEqual(info?.addresses, [onion])
        let denied = await c.listPool(address: onion, ownerSecret: "wrong-secret-0123")
        XCTAssertNil(denied)
    }

    func test_refusals() async throws {
        let (c, secret) = try setting()
        let t = tag()
        let wrongSecret = await c.deposit(address: onion, ownerSecret: "wrong-secret", routingTag: t, ciphertext: Data(repeating: 1, count: 4096))
        XCTAssertEqual(wrongSecret, .failed)
        let oversize = await c.deposit(address: onion, ownerSecret: secret, routingTag: t, ciphertext: Data(repeating: 1, count: 70_000))
        XCTAssertEqual(oversize, .failed)
        let badTag = await c.deposit(address: onion, ownerSecret: secret, routingTag: "not a tag", ciphertext: Data(repeating: 1, count: 4096))
        XCTAssertEqual(badTag, .failed)
    }
}
