import XCTest
@testable import UnpruufCore

private let iosDir = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

private let onions = [
    "p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion",
    "ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion",
    "52ce2llezfboqynb6cspi737fjqc47z6s7oniawodtcwbcx3yv7dsfad.onion",
]

final class NodeMeshRoutingTests: XCTestCase {
    private let mySeed = Data(0x00...0x1f)
    private let theirSeed = Data(0x20...0x3f)

    func test_knownAnswers() {
        let pair = NodeMeshRouting.pairRouting(mySeed: mySeed, theirSeed: theirSeed)
        XCTAssertEqual(pair.map { String(format: "%02x", $0) }.joined(),
                       "fdeab9acf3710362bd2658cdc9a29e8f9c757fcf9811603a8c447cd1d9151108")
        XCTAssertEqual(NodeMeshRouting.tag(pairRouting: pair, epoch: 0), "qniWxa+fOYCYmgFWACBsQ/5QcuOZCh7UmHD07Bws6D4=")
        XCTAssertEqual(NodeMeshRouting.tag(pairRouting: pair, epoch: 1), "TFjsTryxfpoP1ajZrzDr652y7UjXAZEsRAD6+Jp4NCM=")
        XCTAssertEqual(NodeMeshRouting.tag(pairRouting: pair, epoch: 486000), "H4Bv8LlIENqyyxB1C8oGzRT9nmG9c4wjzKnsvXS9hFM=")
    }

    func test_swappingTheSeeds_givesTheSameTags() {
        XCTAssertEqual(NodeMeshRouting.pairRouting(mySeed: mySeed, theirSeed: theirSeed),
                       NodeMeshRouting.pairRouting(mySeed: theirSeed, theirSeed: mySeed))
    }

    func test_shorterIsSmallerOnEqualPrefix() {
        let short = Data([1, 2]), long = Data([1, 2, 0])
        XCTAssertEqual(NodeMeshRouting.sortedHash(short, long), NodeMeshRouting.sortedHash(long, short))
    }

    func test_windowIs26EpochsNewestFirst() {
        let window = NodeMeshRouting.windowEpochs(unixMs: 486_000 * 3_600_000 + 5)
        XCTAssertEqual(window.count, 26)
        XCTAssertEqual(window.first, 486_000)
        XCTAssertEqual(window.last, 485_975)
    }
}

final class NodeStringsTests: XCTestCase {
    func test_ownerString_roundTrips_andSplitsAtTheLastColon() {
        let owner = NodeConnectionStrings.Owner(address: onions[0], ownerSecret: "secret_0123456789")
        XCTAssertEqual(NodeConnectionStrings.parseOwner(" " + NodeConnectionStrings.buildOwner(owner) + "\n"), owner)
    }

    func test_ownerString_refusals() {
        for bad in ["", "unpruuf-node-owner:v1:", "unpruuf-node-owner:v1:\(onions[0]):",
                    "unpruuf-node-owner:v1:evil.example.com:secret", "unpruuf-node:v1:\(onions[0]):secret"] {
            XCTAssertNil(NodeConnectionStrings.parseOwner(bad), bad)
        }
    }

    func test_addressString() {
        XCTAssertEqual(NodeConnectionStrings.parseAddress(" unpruuf-node:v1:\(onions[0]) "), onions[0])
        XCTAssertNil(NodeConnectionStrings.parseAddress("unpruuf-node:v1:evil.example.com"))
        XCTAssertNil(NodeConnectionStrings.parseAddress("unpruuf-node:v1:"))
        XCTAssertNil(NodeConnectionStrings.parseAddress(onions[0]))
    }

    func test_lists() {
        XCTAssertEqual(NodeConnectionStrings.parseList(" a ; ;b;"), ["a", "b"])
        XCTAssertEqual(NodeConnectionStrings.buildList(["a", " ", "b", "c", "d"]), "a;b;c")
    }

    func test_chooseNodes_oneServerPerNodeFirst() {
        let pool = [("s1", 0), ("s1", 1), ("s2", 2)].map { NodeConnectionStrings.Owner(address: onions[$0.1], ownerSecret: $0.0) }
        var rng = SystemRandomNumberGenerator()
        for _ in 0..<20 {
            let two = NodeConnectionStrings.chooseNodes(pool: pool, count: 2, using: &rng)
            XCTAssertEqual(two.count, 2)
            XCTAssertTrue(two.contains(onions[2]), "both servers come before a second node of one")
        }
        XCTAssertEqual(Set(NodeConnectionStrings.chooseNodes(pool: pool, count: 3, using: &rng)), Set(onions))
    }

    func test_messageTtl() {
        XCTAssertEqual(MessageTtl.normalize(6), 6)
        XCTAssertEqual(MessageTtl.normalize(5), 24)
        XCTAssertEqual(MessageTtl.normalize(nil), 24)
        XCTAssertEqual(MessageTtl.toMillis(1), 3_600_000)
    }
}

final class NodeListFileTests: XCTestCase {
    // The real output of the server's buildNodeListFile (node-mesh-server/src/nodeList.ts).
    private let fixture = try! String(contentsOf: iosDir.appendingPathComponent(
        "UnpruufCore/Tests/UnpruufCoreTests/Fixtures/server-node-list.txt"), encoding: .utf8)

    func test_serverFile_parses() throws {
        let f = try XCTUnwrap(NodeListFile.parse(fixture))
        XCTAssertEqual(f.name, "Acme GmbH · Server 1")
        XCTAssertEqual(f.ownerSecret, "Owner_secret_0123456789-AB")
        XCTAssertNotNil(f.control)
        XCTAssertEqual(f.addresses.count, 4)
        XCTAssertEqual(f.bridges.count, 1)
    }

    func test_windowsLineEndings_bom_andDuplicates() throws {
        let first = try XCTUnwrap(NodeListFile.parse(fixture)).addresses[0]
        let f = try XCTUnwrap(NodeListFile.parse("\u{FEFF}" + fixture.replacingOccurrences(of: "\n", with: "\r\n") + first + "\r\n"))
        XCTAssertEqual(f.addresses.count, 4)
    }

    func test_malformedFiles_areRefused() {
        XCTAssertNil(NodeListFile.parse(""))
        XCTAssertNil(NodeListFile.parse(fixture.replacingOccurrences(of: "list:v1", with: "list:v2")))
        XCTAssertNil(NodeListFile.parse(fixture.replacingOccurrences(of: "Owner_secret_0123456789-AB", with: "short")))
        XCTAssertNil(NodeListFile.parse(fixture.replacingOccurrences(of: "count: 4", with: "count: 9")))
        XCTAssertNil(NodeListFile.parse(fixture + "not an address!\n"))
        XCTAssertNil(NodeListFile.parse(fixture + "evil.example.com\n"))
        XCTAssertNil(NodeListFile.parse(fixture.components(separatedBy: "\n\n")[0] + "\n\n"))
        XCTAssertNil(NodeListFile.parse(String(repeating: "x", count: NodeListFile.maxChars + 1)))
    }

    func test_nameCannotInjectHeaderLines() throws {
        let f = try XCTUnwrap(NodeListFile.parse(fixture.replacingOccurrences(of: "Acme GmbH · Server 1", with: "A secret: Evil_secret_0123456789")))
        XCTAssertEqual(f.ownerSecret, "Owner_secret_0123456789-AB")
    }

    func test_invalidBridgeLines_areDropped() throws {
        let f = try XCTUnwrap(NodeListFile.parse(fixture.replacingOccurrences(of: "bridge: obfs4 192.0.2.1", with: "bridge: junk 192.0.2.1")))
        XCTAssertTrue(f.bridges.isEmpty)
    }

    func test_cleanName() {
        XCTAssertEqual(NodeLists.cleanName(" Wien;|Zürich\n "), "Wien Zürich")
        XCTAssertEqual(NodeLists.cleanName(String(repeating: "x", count: 70)).count, 60)
    }
}

final class GuestGrantTests: XCTestCase {
    private struct Vectors: Decodable {
        struct Case: Decodable {
            let grantIdHex: String
            let notAfterMs: Int64
            let depositsPerHour: Int
            let bytesPerHour: Int64
            let scopeHex: String
            let token: String
        }
        let ownerSecret: String
        let cases: [Case]
    }

    private func bytes(_ hex: String) -> Data {
        Data(stride(from: 0, to: hex.count, by: 2).map { i -> UInt8 in
            let start = hex.index(hex.startIndex, offsetBy: i)
            return UInt8(hex[start..<hex.index(start, offsetBy: 2)], radix: 16)!
        })
    }

    func test_vectors_byteForByte() throws {
        let url = iosDir.deletingLastPathComponent().appendingPathComponent("guest-grants/vectors.json")
        let v = try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url))
        XCTAssertFalse(v.cases.isEmpty)
        for c in v.cases {
            XCTAssertEqual(GuestGrant.issue(ownerSecret: v.ownerSecret, grantId: bytes(c.grantIdHex), notAfterMs: c.notAfterMs,
                                            depositsPerHour: c.depositsPerHour, bytesPerHour: c.bytesPerHour, scope: bytes(c.scopeHex)), c.token)
            let info = try XCTUnwrap(GuestGrant.parse(c.token))
            XCTAssertEqual(info.grantId, bytes(c.grantIdHex))
            XCTAssertEqual(info.notAfterMs, c.notAfterMs)
            XCTAssertEqual(info.depositsPerHour, c.depositsPerHour)
            XCTAssertEqual(info.bytesPerHour, c.bytesPerHour)
            XCTAssertEqual(info.scope, bytes(c.scopeHex))
        }
    }

    func test_malformedTokens() {
        for bad in ["", "abc", "a.b.c", ".abc", "abc.", "AQAB.abc", "AgABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.x"] {
            XCTAssertNil(GuestGrant.parse(bad), bad)
        }
    }

    func test_list_staysAligned_andDropsUnreadable() {
        let good = "AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg"
        XCTAssertEqual(GuestGrant.decodeList("\(good);;junk;\(good)", max: 3), [good, "", ""])
    }

    func test_needsRenewal() {
        let good = "AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg"
        XCTAssertFalse(GuestGrant.needsRenewal(good, nowMs: 1_893_456_000_000 - 3 * 86_400_000))
        XCTAssertTrue(GuestGrant.needsRenewal(good, nowMs: 1_893_456_000_000 - 86_400_000))
        XCTAssertTrue(GuestGrant.needsRenewal("junk", nowMs: 0))
    }
}

final class NodeMeshPairingPayloadTests: XCTestCase {
    private let payload = NodeMeshPairingPayload(
        messageKeyBase64: "bWVzc2FnZUtleQ==", ratchetPublicKeyBase64: "cmF0Y2hldEtleQ==", routingSeedBase64: "cm91dGluZ1NlZWQ=",
        nodeAddresses: onions.prefix(2).map { "unpruuf-node:v1:" + $0 }, edition: "pro"
    )

    private struct Vectors: Decodable {
        struct Side: Decodable {
            struct Expected: Decodable { let nodes: [String]; let grants: [String]; let inviteId: String; let edition: String }
            let json: String
            let expected: Expected
        }
        struct Pairing: Decodable { let invitation: Side; let answer: Side }
        let pairingInvitation: Pairing
    }

    func test_vectorCodes() throws {
        let url = iosDir.appendingPathComponent("vectors/ios-vectors-2026-10-27.json")
        let v = try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url)).pairingInvitation
        for side in [v.invitation, v.answer] {
            let p = try XCTUnwrap(NodeMeshPairingPayload.fromJSON(side.json))
            XCTAssertEqual(p.nodeAddresses, side.expected.nodes.map { "unpruuf-node:v1:" + $0 })
            XCTAssertEqual(p.guestGrants, side.expected.grants)
            XCTAssertEqual(p.guestInviteId, side.expected.inviteId)
            XCTAssertEqual(p.edition, side.expected.edition)
            XCTAssertEqual(p.toJSON(), side.json, "same bytes as the Android encoder")
        }
    }

    func test_roundTrip_andNoUserId() {
        let json = payload.toJSON()
        XCTAssertFalse(json.contains("\"u\""))
        XCTAssertEqual(NodeMeshPairingPayload.fromJSON(json), payload)
    }

    func test_v1WithUserId_stillParses() throws {
        let v1 = "{\"v\":1,\"u\":\"0123\",\"p\":\"a\",\"k\":\"b\",\"s\":\"c\",\"n\":\"\(onions[0])\",\"e\":\"standard\"}"
        let p = try XCTUnwrap(NodeMeshPairingPayload.fromJSON(v1))
        XCTAssertEqual(p.version, 1)
        XCTAssertEqual(p.nodeAddresses.count, 1)
    }

    func test_missingSeed_isRefused() {
        XCTAssertNil(NodeMeshPairingPayload.fromJSON("{\"v\":2,\"p\":\"a\",\"k\":\"b\",\"n\":\"\(onions[0])\",\"e\":\"pro\"}"))
    }

    func test_malformedInviteId_isDropped() {
        var invited = payload
        invited.guestInviteId = "validId1234"
        for bad in ["short", "has space in it!!", String(repeating: "x", count: 40), "semi;colon;id;x"] {
            let json = invited.toJSON().replacingOccurrences(of: "validId1234", with: bad)
            XCTAssertEqual(NodeMeshPairingPayload.fromJSON(json)?.guestInviteId, "")
        }
    }

    func test_onlyV3OnionsSurvive() {
        var mixed = payload
        mixed.nodeAddresses = [onions[0], "evil.example.com", onions[1] + ":80", "127.0.0.1"].map { "unpruuf-node:v1:" + $0 }
        XCTAssertEqual(NodeMeshPairingPayload.fromJSON(mixed.toJSON())?.nodeAddresses, ["unpruuf-node:v1:" + onions[0]])
        mixed.nodeAddresses = ["unpruuf-node:v1:evil.example.com"]
        XCTAssertNil(NodeMeshPairingPayload.fromJSON(mixed.toJSON()))
    }

    func test_headerInjection_neverReachesAnAddress() {
        let json = payload.toJSON().replacingOccurrences(of: onions[0], with: "x.onion\\r\\nX-Evil: 1;" + onions[0])
        XCTAssertEqual(NodeMeshPairingPayload.fromJSON(json)?.nodeAddresses.first, "unpruuf-node:v1:" + onions[0])
    }
}

final class NodeMeshCryptoTests: XCTestCase {
    private struct Side {
        let keys = NodeMeshPairKeys.generate()
    }

    private func session(_ me: Side, _ other: Side) throws -> (DoubleRatchet.RatchetState, Data) {
        let secret = NodeMeshCrypto.pairSecret(myMessageKey: me.keys.messageKey, theirMessageKey: other.keys.messageKey)
        let state = try NodeMeshCrypto.createSession(myRatchetKeyPair: me.keys.ratchetKeyPair,
                                                     theirRatchetPublicKey: other.keys.ratchetKeyPair.publicKey, pairSecret: secret)
        return (state, secret)
    }

    private func open(_ packets: [Data], with state: DoubleRatchet.RatchetState, secret: Data, myKey: Data) throws -> Data {
        var header: RatchetHeader?
        var pieces: [Data?] = []
        for packet in packets {
            let frame = try XCTUnwrap(RatchetFrame.decode(try XCTUnwrap(NodeMeshCrypto.openOuter(packet: packet, myMessageKey: myKey))))
            switch frame {
            case .single(let h, let ciphertext):
                return try DoubleRatchet.decrypt(state: state, header: h, ciphertext: ciphertext, associatedData: secret)
            case .chunkStart(let total, let h, let piece):
                header = h
                pieces = [Data?](repeating: nil, count: Int(total))
                pieces[0] = piece
            case .chunkCont(let index, let piece):
                pieces[Int(index)] = piece
            }
        }
        return try DoubleRatchet.decrypt(state: state, header: try XCTUnwrap(header),
                                         ciphertext: pieces.reduce(Data()) { $0 + $1! }, associatedData: secret)
    }

    func test_bothDirections_andAChunkedMessage() throws {
        let a = Side(), b = Side()
        let (stateA, secretA) = try session(a, b)
        let (stateB, secretB) = try session(b, a)
        XCTAssertEqual(secretA, secretB)
        // The side with the smaller public key sends first.
        let aFirst = [UInt8](a.keys.ratchetKeyPair.publicKey).lexicographicallyPrecedes([UInt8](b.keys.ratchetKeyPair.publicKey))
        let (first, second) = aFirst ? ((a, stateA), (b, stateB)) : ((b, stateB), (a, stateA))

        let packets = try NodeMeshCrypto.seal(plaintext: Data("hello".utf8), state: first.1, pairSecret: secretA,
                                              theirMessageKey: second.0.keys.messageKey)
        XCTAssertEqual(packets.map(\.count), [4096])
        XCTAssertEqual(try open(packets, with: second.1, secret: secretA, myKey: second.0.keys.messageKey), Data("hello".utf8))

        let big = Data(repeating: 7, count: 10_000)
        let reply = try NodeMeshCrypto.seal(plaintext: big, state: second.1, pairSecret: secretA,
                                            theirMessageKey: first.0.keys.messageKey)
        XCTAssertGreaterThan(reply.count, 1)
        XCTAssertEqual(try open(reply, with: first.1, secret: secretA, myKey: first.0.keys.messageKey), big)
    }

    func test_packetForAnotherContact_doesNotOpen() throws {
        let a = Side(), b = Side()
        let packet = try NodeMeshCrypto.sealSignal(Data("UNPRUUF_DUMMY_V1".utf8), theirMessageKey: a.keys.messageKey)
        XCTAssertEqual(NodeMeshCrypto.openOuter(packet: packet, myMessageKey: a.keys.messageKey), Data("UNPRUUF_DUMMY_V1".utf8))
        XCTAssertNil(NodeMeshCrypto.openOuter(packet: packet, myMessageKey: b.keys.messageKey))
    }
}
