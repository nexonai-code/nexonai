import XCTest
@testable import UnpruufCore

private final class MemoryStore: KeyValueStore {
    var values: [String: String] = [:]
    var writes = 0
    func getString(_ key: String) -> String? { values[key] }
    func setString(_ key: String, _ value: String) { values[key] = value; writes += 1 }
    func removeString(_ key: String) { values[key] = nil }
}

private func onion(_ i: Int) -> String {
    OnionAddress.address(publicKey: Data(repeating: 7, count: 30) + Data([UInt8(i >> 8), UInt8(i & 0xFF)]))!
}

private func file(_ range: Range<Int>, secret: String = "Owner_secret_0123456789-AB", control: String? = nil) -> NodeListFile.Parsed {
    NodeListFile.Parsed(name: "F", ownerSecret: secret, control: control, addresses: range.map(onion), bridges: [])
}

/// Answers per path with scripted replies.
private final class PathConnection: NodeConnection, @unchecked Sendable {
    let routes: [String: (Int, String)]
    var pending = Data()
    init(_ routes: [String: (Int, String)]) { self.routes = routes }
    func send(_ data: Data) async throws {
        let line = String(decoding: data.prefix(80), as: UTF8.self)
        let path = line.split(separator: " ")[1]
        let (status, body) = routes[String(path)] ?? (404, "{}")
        pending = Data("HTTP/1.1 \(status) X\r\nContent-Length: \(body.utf8.count)\r\n\r\n\(body)".utf8)
    }
    func receive(atLeast: Int, atMost: Int) async throws -> Data {
        let out = pending.prefix(atMost)
        pending = Data(pending.dropFirst(out.count))
        return Data(out)
    }
    func setDeadline(_ seconds: TimeInterval) {}
    func close() {}
}

private struct PathTransport: NodeTransport {
    let routes: [String: (Int, String)]
    var unreachable: Set<String> = []
    func connect(address: String, port: UInt16, isolationKey: String?, timeout: TimeInterval) async throws -> NodeConnection {
        if unreachable.contains(address) { throw NodeConnectionError.connectionFailed }
        return PathConnection(routes)
    }
}

final class NodeListsRulesTests: XCTestCase {
    func test_reconcile() {
        var n = 0
        func next() -> String { n += 1; return "new\(n)" }
        let lists = [NodeList(id: "l1", name: "Kunde A", addresses: ["a", "b", "ghost"]), NodeList(id: "l2", name: "Leer", addresses: ["gone"])]
        let out = NodeLists.reconcile(lists, pool: ["a", "b", "c", "d"], newId: next)
        XCTAssertEqual(out.map(\.name), ["Kunde A", NodeLists.defaultName])
        XCTAssertEqual(out[0].addresses, ["a", "b"])
        XCTAssertEqual(out[1].addresses, ["c", "d"])
        XCTAssertEqual(NodeLists.reconcile(out, pool: ["a", "b", "c", "d"], newId: next), out)
        XCTAssertTrue(NodeLists.reconcile(out, pool: [], newId: next).isEmpty)
    }

    func test_aNodeIsInExactlyOneList() {
        let out = NodeLists.reconcile([NodeList(id: "l1", name: "A", addresses: ["x", "y"]), NodeList(id: "l2", name: "B", addresses: ["y", "z"])],
                                      pool: ["x", "y", "z"], newId: { "n" })
        XCTAssertEqual(out[0].addresses, ["x", "y"])
        XCTAssertEqual(out[1].addresses, ["z"])
    }

    func test_assign() {
        let lists = [NodeList(id: "l1", name: "A", addresses: ["x", "y"]), NodeList(id: "l2", name: "B", addresses: ["z"])]
        let moved = NodeLists.assign(lists, addresses: ["z"], listId: "l1", newName: "ignored")
        XCTAssertEqual(moved.count, 1)
        XCTAssertEqual(moved[0].addresses, ["x", "y", "z"])
        let created = NodeLists.assign(lists, addresses: ["y"], listId: "l3", newName: "Neu")
        XCTAssertEqual(created.first { $0.id == "l3" }?.name, "Neu")
        XCTAssertEqual(created.first { $0.id == "l1" }?.addresses, ["x"])
        XCTAssertEqual(NodeLists.list(of: "y", in: created)?.id, "l3")
    }

    func test_rename_keepsTheOldNameForABlankOne() {
        let lists = [NodeList(id: "l1", name: "A", addresses: ["x"])]
        XCTAssertEqual(NodeLists.rename(lists, listId: "l1", name: "  ")[0].name, "A")
        XCTAssertEqual(NodeLists.rename(lists, listId: "l1", name: "Kunde")[0].name, "Kunde")
    }
}

final class NodeMeshStoreTests: XCTestCase {
    private func store(_ memory: MemoryStore = MemoryStore()) -> NodeMeshStore { NodeMeshStore(store: memory) }

    func test_ownerAddress_isValid_andSurvivesARestart() {
        XCTAssertTrue(OnionAddress.isValid(onion(1)))
        let memory = MemoryStore()
        let s = store(memory)
        XCTAssertTrue(s.addNode(ownerString: "unpruuf-node-owner:v1:\(onion(1)):secret_0123456789"))
        XCTAssertFalse(s.addNode(ownerString: "junk"))
        XCTAssertEqual(store(memory).nodes.map(\.address), [onion(1)])
        XCTAssertEqual(store(memory).poolSources.count, 1)
    }

    func test_readdingANode_replacesItsSecret() {
        let s = store()
        s.addNode(ownerString: "unpruuf-node-owner:v1:\(onion(1)):old_secret_012345")
        s.addNode(ownerString: "unpruuf-node-owner:v1:\(onion(1)):new_secret_012345")
        XCTAssertEqual(s.nodes.map(\.ownerSecret), ["new_secret_012345"])
        XCTAssertEqual(s.poolSources.map(\.ownerSecret), ["new_secret_012345"])
    }

    func test_plainHostsNeverEnter() {
        let s = store()
        XCTAssertFalse(s.addNodes(["evil.example.com"], ownerSecret: "s"))
        XCTAssertTrue(s.nodes.isEmpty)
    }

    func test_import_newList_thenIntoAnExistingOne() throws {
        let s = store()
        guard case .ok(let id, "Kunde", 3, 3) = s.importNodeList(file(0..<3), name: "Kunde", targetListId: nil) else { return XCTFail() }
        guard case .ok(id, "Kunde", 2, 5) = s.importNodeList(file(3..<5, secret: "Second_secret_012345"), name: "x", targetListId: id) else { return XCTFail() }
        let list = try XCTUnwrap(s.lists.first)
        XCTAssertEqual(s.serverCount(list), 2)
        XCTAssertEqual(s.poolSources.count, 2)
        XCTAssertEqual(s.importNodeList(file(5..<6), name: "x", targetListId: "nope"), .unknownList)
    }

    func test_import_isAllOrNothing() {
        let s = store()
        _ = s.importNodeList(file(0..<999), name: "A", targetListId: nil)
        XCTAssertEqual(s.importNodeList(file(999..<1001), name: "B", targetListId: nil), .noRoom(needed: 2, free: 1))
        XCTAssertEqual(s.nodes.count, 999)
        XCTAssertEqual(s.lists.count, 1)
    }

    func test_import_rememberesControl() {
        let s = store()
        _ = s.importNodeList(file(0..<2, control: onion(50)), name: "A", targetListId: nil)
        XCTAssertEqual(s.controlAddresses, [onion(0): onion(50)])
    }

    func test_scannedNode_landsInStandard() {
        let s = store()
        s.addNode(ownerString: "unpruuf-node-owner:v1:\(onion(1)):secret_0123456789")
        XCTAssertEqual(s.lists.map(\.name), [NodeLists.defaultName])
    }

    func test_contactNodes_comeFromOneList() throws {
        let s = store()
        guard case .ok(let id, _, _, _) = s.importNodeList(file(0..<4), name: "A", targetListId: nil) else { return XCTFail() }
        _ = s.importNodeList(file(4..<8, secret: "Second_secret_012345"), name: "B", targetListId: nil)
        var rng = SystemRandomNumberGenerator()
        let picked = s.chooseNodesForNewContact(listId: id, using: &rng)
        XCTAssertEqual(picked.count, 3)
        XCTAssertTrue(Set(picked).isSubset(of: Set((0..<4).map(onion))))
        XCTAssertTrue(s.chooseNodesForNewContact(listId: "nope", using: &rng).isEmpty)
    }

    func test_deleteList_takesItsNodes() throws {
        let s = store()
        guard case .ok(let id, _, _, _) = s.importNodeList(file(0..<3), name: "A", targetListId: nil) else { return XCTFail() }
        XCTAssertEqual(s.deleteList(id: id), 3)
        XCTAssertTrue(s.nodes.isEmpty)
        XCTAssertTrue(s.poolSources.isEmpty)
        XCTAssertFalse(s.isUsable)
    }

    func test_unreadableState_isLeftAlone() {
        let memory = MemoryStore()
        memory.values["node_mesh_state"] = "not json"
        let s = store(memory)
        XCTAssertTrue(s.isUnreadable)
        s.addNode(ownerString: "unpruuf-node-owner:v1:\(onion(1)):secret_0123456789")
        XCTAssertEqual(memory.values["node_mesh_state"], "not json")
    }

    func test_wipe() {
        let memory = MemoryStore()
        let s = store(memory)
        _ = s.importNodeList(file(0..<2, control: onion(50)), name: "A", targetListId: nil)
        s.wipe()
        XCTAssertNil(memory.values["node_mesh_state"])
        XCTAssertTrue(s.nodes.isEmpty && s.lists.isEmpty && s.poolSources.isEmpty && s.controlAddresses.isEmpty)
    }

    func test_importSiblings_addsThemToTheSourcesList_andRemembersControl() async {
        let s = store()
        s.addNode(ownerString: "unpruuf-node-owner:v1:\(onion(1)):secret_0123456789")
        let listId = s.lists[0].id
        let body = "{\"control\":\"\(onion(50))\",\"addresses\":[\"\(onion(1))\",\"\(onion(2))\",\"evil.example.com\"]}"
        let client = NodeMeshClient(transport: PathTransport(routes: ["/pool": (200, body)]))
        let added = await s.importSiblings(client: client)
        XCTAssertEqual(added, 1)
        XCTAssertEqual(s.lists.first { $0.id == listId }?.addresses.sorted(), [onion(1), onion(2)].sorted())
        XCTAssertEqual(s.controlAddresses[onion(1)], onion(50))
    }

    func test_importSiblings_skipsAServerThatDoesNotAnswer() async {
        let s = store()
        s.addNode(ownerString: "unpruuf-node-owner:v1:\(onion(1)):secret_0123456789")
        let client = NodeMeshClient(transport: PathTransport(routes: [:], unreachable: [onion(1)]))
        let added = await s.importSiblings(client: client)
        XCTAssertEqual(added, 0)
        XCTAssertEqual(s.nodes.count, 1)
    }

    func test_lockedServer_unlocksAndBringsItsNodesBack() async {
        let s = store()
        _ = s.importNodeList(file(0..<2, control: onion(50)), name: "A", targetListId: nil)
        let client = NodeMeshClient(transport: PathTransport(routes: [
            "/lock-status": (200, "{\"locked\":true}"),
            "/unlock": (200, "{\"unlocked\":true,\"addresses\":[\"\(onion(2))\"]}"),
        ]))
        let locked = await s.findLockedServers(client: client)
        XCTAssertEqual(locked, [.init(sourceAddress: onion(0), controlAddress: onion(50), nodeCount: 2)])
        let ok = await s.unlock(server: locked[0], client: client)
        XCTAssertTrue(ok)
        XCTAssertEqual(s.nodes.count, 3)
    }
}
