import Combine
import Foundation
import UnpruufCore

/// What the Business screens show of `NodeMeshStore`, which is plain storage. Every change goes
/// through here, so the screens stay in step.
@MainActor
final class NodeListsModel: ObservableObject {
    @Published private(set) var lists: [NodeList] = []
    @Published private(set) var lockedServers: [NodeMeshStore.LockedServer] = []
    @Published private(set) var isSearching = false

    private let store: NodeMeshStore
    private let client: NodeMeshClient

    init(store: NodeMeshStore, client: NodeMeshClient) {
        self.store = store
        self.client = client
        lists = store.lists
    }

    var nodeCount: Int { store.nodes.count }
    var isUnreadable: Bool { store.isUnreadable }

    func serverCount(_ list: NodeList) -> Int { store.serverCount(list) }

    enum Input {
        case ownerCode
        case listFile(NodeListFile.Parsed)
        case invalid
    }

    /// A scanned or pasted text, or the contents of a file.
    func classify(_ raw: String) -> Input {
        if let file = NodeListFile.parse(raw) { return .listFile(file) }
        return NodeConnectionStrings.parseOwner(raw) != nil ? .ownerCode : .invalid
    }

    /// One scan is enough: the server names its other nodes when Tor is up.
    func addOwnerCode(_ raw: String) -> Bool {
        guard store.addNode(ownerString: raw) else { return false }
        lists = store.lists
        Task { await searchServers() }
        return true
    }

    func importFile(_ file: NodeListFile.Parsed, name: String, targetListId: String?) -> NodeMeshStore.ImportResult {
        let result = store.importNodeList(file, name: name, targetListId: targetListId)
        lists = store.lists
        return result
    }

    /// Looks for new nodes on the known servers and for servers waiting to be unlocked.
    func searchServers() async {
        guard !isSearching else { return }
        isSearching = true
        defer { isSearching = false }
        _ = await store.importSiblings(client: client)
        lists = store.lists
        lockedServers = await store.findLockedServers(client: client)
    }

    /// Sends the owner secret to the server: only after the user confirmed it.
    func unlock(_ server: NodeMeshStore.LockedServer) async -> Bool {
        let ok = await store.unlock(server: server, client: client)
        lists = store.lists
        lockedServers = await store.findLockedServers(client: client)
        return ok
    }

    func rename(_ list: NodeList, to name: String) {
        store.renameList(id: list.id, name: name)
        lists = store.lists
    }

    func delete(_ list: NodeList) {
        store.deleteList(id: list.id)
        lists = store.lists
    }
}
