import XCTest
@testable import UnpruufCore

private final class Memory: KeyValueStore {
    var values: [String: String] = [:]
    func getString(_ key: String) -> String? { values[key] }
    func setString(_ key: String, _ value: String) { values[key] = value }
    func removeString(_ key: String) { values[key] = nil }
}

private func onion(_ i: Int) -> String {
    OnionAddress.address(publicKey: Data(repeating: 9, count: 30) + Data([UInt8(i >> 8), UInt8(i & 0xFF)]))!
}

private func listFile(_ range: Range<Int>, _ secret: String) -> NodeListFile.Parsed {
    NodeListFile.Parsed(name: "L", ownerSecret: secret, control: nil, addresses: range.map(onion), bridges: [])
}

private final class Phone {
    let memory = Memory()
    lazy var nodes = NodeMeshStore(store: memory)
    lazy var contacts = NodeMeshContactStore(store: memory)
    var listId = ""
    init(_ range: Range<Int>, secret: String) {
        if case .ok(let id, _, _, _) = nodes.importNodeList(listFile(range, secret), name: "A", targetListId: nil) { listId = id }
    }
    func flow() -> NodeMeshPairingFlow { NodeMeshPairingFlow(nodes: nodes, contacts: contacts) }
}

final class NodeMeshPairingFlowTests: XCTestCase {
    private func foreignCode(edition: String = "pro") -> NodeMeshPairingPayload {
        let k = NodeMeshPairKeys.generate()
        return NodeMeshPairingPayload(messageKeyBase64: k.messageKey.base64EncodedString(),
                                      ratchetPublicKeyBase64: k.ratchetKeyPair.publicKey.base64EncodedString(),
                                      routingSeedBase64: k.routingSeed.base64EncodedString(),
                                      nodeAddresses: ["unpruuf-node:v1:" + onion(900)], edition: edition)
    }

    func test_twoPhones_pair_andAgreeOnEverything() throws {
        let a = Phone(0..<5, secret: "Server_a_0123456789"), b = Phone(10..<15, secret: "Server_b_0123456789")
        let flowA = a.flow(), flowB = b.flow()
        let codeA = try XCTUnwrap(flowA.myCode()), codeB = try XCTUnwrap(flowB.myCode())
        XCTAssertEqual(codeA.nodeAddresses.count, 3)
        guard case .added(let onA) = flowA.handle(payload: try XCTUnwrap(.fromJSON(codeB.toJSON())), displayName: "B"),
              case .added(let onB) = flowB.handle(payload: try XCTUnwrap(.fromJSON(codeA.toJSON())), displayName: "A") else { return XCTFail() }

        XCTAssertEqual(onA.pairSecret, onB.pairSecret)
        XCTAssertEqual(onA.pairRouting, onB.pairRouting)
        XCTAssertEqual(onA.safetyNumber, onB.safetyNumber)
        XCTAssertEqual(onA.theirNodeAddresses, onB.myNodeAddresses)
        XCTAssertEqual(onA.safetyNumber.count, 7)

        // A real ratchet session between the two, one message.
        let sender = [UInt8](onA.myRatchetKeyPair.publicKey).lexicographicallyPrecedes([UInt8](onB.myRatchetKeyPair.publicKey)) ? onA : onB
        let receiver = sender == onA ? onB : onA
        let out = try NodeMeshCrypto.createSession(myRatchetKeyPair: sender.myRatchetKeyPair, theirRatchetPublicKey: sender.theirRatchetPublicKey, pairSecret: sender.pairSecret)
        let inc = try NodeMeshCrypto.createSession(myRatchetKeyPair: receiver.myRatchetKeyPair, theirRatchetPublicKey: receiver.theirRatchetPublicKey, pairSecret: receiver.pairSecret)
        let packet = try XCTUnwrap(NodeMeshCrypto.seal(plaintext: Data("hi".utf8), state: out, pairSecret: sender.pairSecret, theirMessageKey: sender.theirMessageKey).first)
        let frame = try XCTUnwrap(RatchetFrame.decode(try XCTUnwrap(NodeMeshCrypto.openOuter(packet: packet, myMessageKey: receiver.myMessageKey))))
        guard case .single(let header, let ciphertext) = frame else { return XCTFail() }
        XCTAssertEqual(try DoubleRatchet.decrypt(state: inc, header: header, ciphertext: ciphertext, associatedData: receiver.pairSecret), Data("hi".utf8))
    }

    func test_codeSurvivesLeavingTheScreen_andIsNewAfterBinding() throws {
        let a = Phone(0..<5, secret: "Server_a_0123456789")
        let first = try XCTUnwrap(a.flow().myCode())
        XCTAssertEqual(a.flow().myCode(), first)
        let reloaded = NodeMeshContactStore(store: a.memory)
        XCTAssertEqual(NodeMeshPairingFlow(nodes: a.nodes, contacts: reloaded).myCode(), first)

        let flow = a.flow()
        XCTAssertEqual(flow.myCode(), first)
        guard case .added = flow.handle(payload: foreignCode(), displayName: "B") else { return XCTFail() }
        XCTAssertEqual(flow.myCode(), first, "the other side may still need to scan it")
        XCTAssertEqual(flow.handle(payload: foreignCode(), displayName: "C"), .codeUsed)
        XCTAssertNotEqual(a.flow().myCode()?.messageKeyBase64, first.messageKeyBase64)
    }

    func test_rescan_andChangedKey() throws {
        let a = Phone(0..<5, secret: "Server_a_0123456789")
        let flow = a.flow()
        var code = foreignCode()
        guard case .added = flow.handle(payload: code, displayName: "B") else { return XCTFail() }
        XCTAssertEqual(flow.handle(payload: code, displayName: "x"), .alreadyContact("B"))
        code.ratchetPublicKeyBase64 = NodeMeshPairKeys.generate().ratchetKeyPair.publicKey.base64EncodedString()
        XCTAssertEqual(flow.handle(payload: code, displayName: "x"), .keyChanged)
        XCTAssertEqual(a.contacts.contacts.count, 1)
    }

    func test_editionRules() {
        let flow = Phone(0..<5, secret: "Server_a_0123456789").flow()
        for edition in ["whistleblower", "press", "officer", "group"] {
            XCTAssertEqual(flow.handle(payload: foreignCode(edition: edition), displayName: "x"), .refusedEdition(edition))
        }
        guard case .added(let client) = flow.handle(payload: foreignCode(edition: "client"), displayName: "c") else { return XCTFail() }
        XCTAssertTrue(client.isClientSlot)
    }

    func test_guestCodes_areNotForThisApp() {
        let flow = Phone(0..<5, secret: "Server_a_0123456789").flow()
        var invitation = foreignCode()
        invitation.guestGrants = ["x"]
        XCTAssertEqual(flow.handle(payload: invitation, displayName: "x"), .guestInvitationNeedsClient)
        var answer = foreignCode(edition: "client")
        answer.guestInviteId = "inviteId123"
        XCTAssertEqual(flow.handle(payload: answer, displayName: "x"), .guestAnswerNotSupported)
    }

    func test_refusals_withoutNodesOrList_andBadKeys() throws {
        let empty = Memory()
        let noNodes = NodeMeshPairingFlow(nodes: NodeMeshStore(store: empty), contacts: NodeMeshContactStore(store: empty))
        XCTAssertNil(noNodes.myCode())
        XCTAssertEqual(noNodes.handle(payload: foreignCode(), displayName: "x"), .ownNodeFirst)

        let a = Phone(0..<5, secret: "Server_a_0123456789")
        _ = a.nodes.importNodeList(listFile(5..<8, "Server_c_0123456789"), name: "B", targetListId: nil)
        let twoLists = a.flow()
        XCTAssertNil(twoLists.selectedListId, "two lists: the user chooses")
        XCTAssertEqual(twoLists.handle(payload: foreignCode(), displayName: "x"), .chooseList)
        var bad = foreignCode()
        bad.routingSeedBase64 = "c2hvcnQ="
        XCTAssertEqual(twoLists.handle(payload: bad, displayName: "x"), .invalidCode)
    }

    func test_anotherList_startsFresh_withItsNodes() throws {
        let a = Phone(0..<5, secret: "Server_a_0123456789")
        guard case .ok(let second, _, _, _) = a.nodes.importNodeList(listFile(5..<8, "Server_c_0123456789"), name: "B", targetListId: nil) else { return XCTFail() }
        let flow = a.flow()
        flow.selectList(id: a.listId)
        let first = try XCTUnwrap(flow.myCode())
        flow.selectList(id: second)
        let other = try XCTUnwrap(flow.myCode())
        XCTAssertNotEqual(first.messageKeyBase64, other.messageKeyBase64)
        XCTAssertTrue(Set(other.nodeAddresses).isSubset(of: Set((5..<8).map { "unpruuf-node:v1:" + onion($0) })))
    }

    func test_safetyNumber_matchesIdentitysCalculation() {
        final class M: KeyValueStore { var d: [String: String] = [:]
            func getString(_ k: String) -> String? { d[k] }
            func setString(_ k: String, _ v: String) { d[k] = v } }
        let identity = Identity(store: M())
        let mine = identity.myX25519RatchetKeyPair
        let their = NodeMeshPairKeys.generate()
        let contact = NodeMeshContact(id: "x", displayName: "x", addedAt: Date(), isClientSlot: false, isVerified: false,
            theirMessageKeyBase64: "", theirRatchetPublicKeyBase64: their.ratchetKeyPair.publicKey.base64EncodedString(),
            theirRoutingSeedBase64: "", theirNodeAddresses: [], myMessageKeyBase64: "", myRatchetPrivateKeyBase64: "",
            myRatchetPublicKeyBase64: mine.publicKey.base64EncodedString(), myRoutingSeedBase64: "", myNodeAddresses: [], messageTtlHours: nil)
        XCTAssertEqual(contact.safetyNumber, identity.safetyNumber(theirX25519RatchetPublicKeyBase64: contact.theirRatchetPublicKeyBase64))
    }

    func test_wipe_andUnreadableState() {
        let memory = Memory()
        memory.values["node_mesh_contacts"] = "junk"
        let store = NodeMeshContactStore(store: memory)
        XCTAssertTrue(store.isUnreadable)
        store.setPending(nil)
        XCTAssertEqual(memory.values["node_mesh_contacts"], "junk")
        store.wipe()
        XCTAssertNil(memory.values["node_mesh_contacts"])
        XCTAssertFalse(store.isUnreadable)
    }
}
