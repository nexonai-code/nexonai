import Foundation

/// This device's own nodes, ported from Android's `NodeMeshManager`: the pool (address and owner
/// secret, what deposits use), the lists (which nodes a new contact is given), the pool sources
/// (the nodes that can name their siblings) and the control addresses of sealed servers. It holds
/// the write keys, so it goes in the Keychain, one item, and is never logged.
public final class NodeMeshStore {
    private struct State: Codable {
        var nodes: [Node] = []
        var poolSources: [Node] = []
        var lists: [NodeList] = []
        /// Pool source address to control address.
        var controlAddresses: [String: String] = [:]
    }

    private struct Node: Codable, Equatable {
        let address: String
        let ownerSecret: String
        var owner: NodeConnectionStrings.Owner { .init(address: address, ownerSecret: ownerSecret) }
        init(_ owner: NodeConnectionStrings.Owner) {
            address = owner.address
            ownerSecret = owner.ownerSecret
        }
    }

    private static let key = "node_mesh_state"

    private let store: KeyValueStore
    private let newId: () -> String
    private var state = State()
    /// The saved state exists but cannot be read. It is left alone: nothing is saved over it.
    public private(set) var isUnreadable = false

    public init(store: KeyValueStore, newId: @escaping () -> String = { UUID().uuidString }) {
        self.store = store
        self.newId = newId
        if let raw = store.getString(Self.key), !raw.isEmpty {
            if let decoded = try? JSONDecoder().decode(State.self, from: Data(raw.utf8)) {
                state = decoded
            } else {
                isUnreadable = true
            }
        }
    }

    private func save() {
        guard !isUnreadable, let data = try? JSONEncoder().encode(state) else { return }
        store.setString(Self.key, String(decoding: data, as: UTF8.self))
    }

    /// Panic PIN: every own node with its owner secret, all lists, sources and control addresses.
    public func wipe() {
        state = State()
        isUnreadable = false
        store.removeString(Self.key)
    }

    // MARK: Pool

    public var nodes: [NodeConnectionStrings.Owner] { state.nodes.map(\.owner) }
    public var poolSources: [NodeConnectionStrings.Owner] { state.poolSources.map(\.owner) }
    public var isUsable: Bool { !state.nodes.isEmpty }

    /// Adds the node of a scanned or pasted owner string and remembers it as a pool source.
    @discardableResult
    public func addNode(ownerString: String) -> Bool {
        guard let parsed = NodeConnectionStrings.parseOwner(ownerString),
              addNodes([parsed.address], ownerSecret: parsed.ownerSecret) else { return false }
        state.poolSources.removeAll { $0.address == parsed.address }
        state.poolSources.append(Node(parsed))
        save()
        return true
    }

    /// One server's nodes under one owner secret. A known address gets the new secret. False if
    /// nothing could be added because the pool is full.
    @discardableResult
    public func addNodes(_ addresses: [String], ownerSecret: String, listId: String? = nil) -> Bool {
        var seen = Set<String>()
        let incoming = addresses.filter { OnionAddress.isValid($0) && seen.insert($0).inserted }
        guard !incoming.isEmpty else { return false }
        let kept = state.nodes.filter { !seen.contains($0.address) }
        let room = NodeConnectionStrings.ownNodesMax - kept.count
        guard room > 0 else { return false }
        let added = Array(incoming.prefix(room))
        state.nodes = kept + added.map { Node(.init(address: $0, ownerSecret: ownerSecret)) }
        if let listId {
            state.lists = NodeLists.assign(state.lists, addresses: added, listId: listId, newName: NodeLists.defaultName)
        }
        save()
        return true
    }

    public func removeNode(address: String) {
        state.nodes.removeAll { $0.address == address }
        state.poolSources.removeAll { $0.address == address }
        save()
    }

    /// Asks each pool source for every node its server runs. A server that does not answer is
    /// skipped, the node scanned from it stays usable. Returns how many nodes were added.
    public func importSiblings(client: NodeMeshClient) async -> Int {
        let before = state.nodes.count
        for source in poolSources {
            guard let info = await client.listPool(address: source.address, ownerSecret: source.ownerSecret) else { continue }
            addNodes(info.addresses, ownerSecret: source.ownerSecret,
                     listId: NodeLists.list(of: source.address, in: lists)?.id)
            if let control = info.controlAddress {
                state.controlAddresses[source.address] = control
                save()
            }
        }
        return state.nodes.count - before
    }

    // MARK: Sealed servers

    public struct LockedServer: Equatable {
        public let sourceAddress: String
        public let controlAddress: String
        public let nodeCount: Int
    }

    public var controlAddresses: [String: String] { state.controlAddresses }

    /// Asks every known control address whether its server is locked. Sends nothing secret.
    public func findLockedServers(client: NodeMeshClient) async -> [LockedServer] {
        var locked: [LockedServer] = []
        for (sourceAddress, control) in state.controlAddresses {
            guard let source = poolSources.first(where: { $0.address == sourceAddress }),
                  await client.lockStatus(controlAddress: control) == true else { continue }
            locked.append(LockedServer(sourceAddress: sourceAddress, controlAddress: control,
                                       nodeCount: state.nodes.filter { $0.ownerSecret == source.ownerSecret }.count))
        }
        return locked
    }

    /// Sends the owner secret to the control address, so only after the user confirmed it.
    public func unlock(server: LockedServer, client: NodeMeshClient) async -> Bool {
        guard let source = poolSources.first(where: { $0.address == server.sourceAddress }),
              let addresses = await client.unlock(controlAddress: server.controlAddress, ownerSecret: source.ownerSecret) else { return false }
        if !addresses.isEmpty { addNodes(addresses, ownerSecret: source.ownerSecret) }
        return true
    }

    // MARK: Lists

    /// Always consistent with the real pool: a node without a list lands in "Standard".
    public var lists: [NodeList] {
        let reconciled = NodeLists.reconcile(state.lists, pool: state.nodes.map(\.address), newId: newId)
        if reconciled != state.lists {
            state.lists = reconciled
            save()
        }
        return reconciled
    }

    /// How many different servers the nodes of a list sit on.
    public func serverCount(_ list: NodeList) -> Int {
        let members = Set(list.addresses)
        return Set(state.nodes.filter { members.contains($0.address) }.map(\.ownerSecret)).count
    }

    /// Up to three nodes for a new contact from one list, spread over its servers. Nodes are shared
    /// between contacts on purpose: a node serving a single contact is that contact's fingerprint.
    public func chooseNodesForNewContact<G: RandomNumberGenerator>(listId: String, using generator: inout G) -> [String] {
        guard let members = lists.first(where: { $0.id == listId }).map({ Set($0.addresses) }) else { return [] }
        return NodeConnectionStrings.chooseNodes(pool: nodes.filter { members.contains($0.address) },
                                                 count: NodeConnectionStrings.poolMaxSize, using: &generator)
    }

    public enum ImportResult: Equatable {
        /// `added`: nodes new on this device, `total`: nodes now in the list.
        case ok(listId: String, listName: String, added: Int, total: Int)
        /// Not all of the file's nodes fit: nothing was imported.
        case noRoom(needed: Int, free: Int)
        case unknownList
    }

    /// Takes over every node of a server's list file, all or nothing. `targetListId` adds to that
    /// list, `nil` makes a new one called `name`. The first address becomes the server's pool source.
    public func importNodeList(_ file: NodeListFile.Parsed, name: String, targetListId: String?) -> ImportResult {
        let current = lists
        if let targetListId, !current.contains(where: { $0.id == targetListId }) { return .unknownList }
        let known = Set(state.nodes.map(\.address))
        let fresh = file.addresses.filter { !known.contains($0) }.count
        let free = NodeConnectionStrings.ownNodesMax - known.count
        guard fresh <= free else { return .noRoom(needed: fresh, free: free) }

        let listId = targetListId ?? newId()
        guard addNodes(file.addresses, ownerSecret: file.ownerSecret) else { return .noRoom(needed: fresh, free: free) }
        state.lists = NodeLists.assign(lists, addresses: file.addresses, listId: listId, newName: name)

        let first = file.addresses[0]
        let inFile = Set(file.addresses)
        state.poolSources.removeAll { inFile.contains($0.address) }
        state.poolSources.append(Node(.init(address: first, ownerSecret: file.ownerSecret)))
        if let control = file.control { state.controlAddresses[first] = control }
        save()

        guard let list = lists.first(where: { $0.id == listId }) else { return .unknownList }
        return .ok(listId: listId, listName: list.name, added: fresh, total: list.addresses.count)
    }

    public func renameList(id: String, name: String) {
        state.lists = NodeLists.rename(lists, listId: id, name: name)
        save()
    }

    /// Removes the list and its nodes from this device. Returns how many nodes went with it.
    @discardableResult
    public func deleteList(id: String) -> Int {
        guard let list = lists.first(where: { $0.id == id }) else { return 0 }
        let gone = Set(list.addresses)
        state.nodes.removeAll { gone.contains($0.address) }
        state.poolSources.removeAll { gone.contains($0.address) }
        state.lists.removeAll { $0.id == id }
        save()
        return list.addresses.count
    }
}
