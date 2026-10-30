import CryptoKit
import Foundation

/// A paired Node-Mesh contact. It has no user id, `id` is a local random value, and everything
/// "my" exists for this one contact only. Holds private keys, so it lives in the Keychain.
public struct NodeMeshContact: Codable, Equatable, Identifiable {
    public let id: String
    public var displayName: String
    public let addedAt: Date
    /// Added from a free Client app's code.
    public let isClientSlot: Bool
    public var isVerified: Bool

    public let theirMessageKeyBase64: String
    public let theirRatchetPublicKeyBase64: String
    public let theirRoutingSeedBase64: String
    /// With the `unpruuf-node:v1:` prefix.
    public var theirNodeAddresses: [String]

    public let myMessageKeyBase64: String
    public let myRatchetPrivateKeyBase64: String
    public let myRatchetPublicKeyBase64: String
    public let myRoutingSeedBase64: String
    /// With the `unpruuf-node:v1:` prefix.
    public var myNodeAddresses: [String]

    /// One of `MessageTtl.stepsHours`, `nil` is the default.
    public var messageTtlHours: Int?

    public var theirMessageKey: Data { Data(base64Encoded: theirMessageKeyBase64) ?? Data() }
    public var myMessageKey: Data { Data(base64Encoded: myMessageKeyBase64) ?? Data() }
    public var theirRatchetPublicKey: Data { Data(base64Encoded: theirRatchetPublicKeyBase64) ?? Data() }

    public var myRatchetKeyPair: DoubleRatchet.KeyPair {
        DoubleRatchet.KeyPair(privateKey: Data(base64Encoded: myRatchetPrivateKeyBase64) ?? Data(),
                              publicKey: Data(base64Encoded: myRatchetPublicKeyBase64) ?? Data())
    }

    public var pairSecret: Data {
        NodeMeshCrypto.pairSecret(myMessageKey: myMessageKey, theirMessageKey: theirMessageKey)
    }

    public var pairRouting: Data {
        NodeMeshRouting.pairRouting(mySeed: Data(base64Encoded: myRoutingSeedBase64) ?? Data(),
                                    theirSeed: Data(base64Encoded: theirRoutingSeedBase64) ?? Data())
    }

    /// The code both people compare over another channel, same as `Identity.safetyNumber` but from
    /// the keys of this pairing.
    public var safetyNumber: String {
        let digest = [UInt8](NodeMeshRouting.sortedHash(myRatchetKeyPair.publicKey, theirRatchetPublicKey))
        let n = digest.prefix(4).reduce(UInt32(0)) { $0 << 8 | UInt32($1) }
        let code = String(format: "%06d", Int(n % 1_000_000))
        return "\(code.prefix(3)) \(code.suffix(3))"
    }
}

/// Which editions this app may pair with, ported from Android's `AppEdition.canAdd` for `pro`.
public enum NodeMeshEdition {
    public static let pro = "pro"
    public static let client = "client"
    private static let refused: Set<String> = ["whistleblower", "press", "officer", "group"]

    public static func canAdd(_ theirEdition: String) -> Bool { !refused.contains(theirEdition) }

    public static func isGroup(_ edition: String) -> Bool { edition == "group" }
}

/// The contacts and the pairing code on screen. The pairing is kept until a scan binds it, so
/// leaving the screen does not strand someone who already scanned this code.
public final class NodeMeshContactStore {
    public struct Pending: Codable, Equatable {
        public let messageKeyBase64: String
        public let ratchetPrivateKeyBase64: String
        public let ratchetPublicKeyBase64: String
        public let routingSeedBase64: String
        /// Without prefix.
        public let nodeAddresses: [String]
    }

    private struct State: Codable {
        var contacts: [NodeMeshContact] = []
        var pending: Pending?
    }

    private static let key = "node_mesh_contacts"

    private let store: KeyValueStore
    private var state = State()
    public private(set) var isUnreadable = false

    public init(store: KeyValueStore) {
        self.store = store
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

    public var contacts: [NodeMeshContact] { state.contacts }

    public func contact(id: String) -> NodeMeshContact? { state.contacts.first { $0.id == id } }

    public func contact(theirMessageKeyBase64 key: String) -> NodeMeshContact? {
        state.contacts.first { $0.theirMessageKeyBase64 == key }
    }

    public func add(_ contact: NodeMeshContact) {
        state.contacts.append(contact)
        save()
    }

    public func update(id: String, _ change: (inout NodeMeshContact) -> Void) {
        guard let i = state.contacts.firstIndex(where: { $0.id == id }) else { return }
        change(&state.contacts[i])
        save()
    }

    public func remove(id: String) {
        state.contacts.removeAll { $0.id == id }
        save()
    }

    public var pending: Pending? { state.pending }

    public func setPending(_ pending: Pending?) {
        state.pending = pending
        save()
    }

    /// Panic PIN: every contact with its keys, and an open pairing code.
    public func wipe() {
        state = State()
        isUnreadable = false
        store.removeString(Self.key)
    }
}

/// One pairing screen, ported from the Node-Mesh part of Android's `QrPairViewModel`. The code
/// on screen stays valid for that screen even after it was bound, because the other side may still
/// have to scan it; it can bind only once.
public final class NodeMeshPairingFlow {
    public enum Outcome: Equatable {
        case added(NodeMeshContact)
        case alreadyContact(String)
        case keyChanged
        case refusedEdition(String)
        case guestInvitationNeedsClient
        case guestAnswerNotSupported
        case invalidCode
        case ownNodeFirst
        case chooseList
        case codeUsed
    }

    private let nodes: NodeMeshStore
    private let contacts: NodeMeshContactStore
    private var shown: NodeMeshContactStore.Pending?
    private var bound = false
    public private(set) var selectedListId: String?

    public init(nodes: NodeMeshStore, contacts: NodeMeshContactStore) {
        self.nodes = nodes
        self.contacts = contacts
        let lists = nodes.lists
        // A code already pending keeps the list it was made from.
        selectedListId = contacts.pending.flatMap { pending in
            lists.first { list in pending.nodeAddresses.contains(where: list.addresses.contains) }?.id
        } ?? (lists.count == 1 ? lists[0].id : nil)
    }

    /// Another list starts a fresh pairing: a code already scanned must not be mixed with its nodes.
    public func selectList(id: String) {
        guard id != selectedListId else { return }
        contacts.setPending(nil)
        shown = nil
        bound = false
        selectedListId = id
    }

    private func newPending(listId: String) -> NodeMeshContactStore.Pending {
        let keys = NodeMeshPairKeys.generate()
        var rng = SystemRandomNumberGenerator()
        return .init(messageKeyBase64: keys.messageKey.base64EncodedString(),
                     ratchetPrivateKeyBase64: keys.ratchetKeyPair.privateKey.base64EncodedString(),
                     ratchetPublicKeyBase64: keys.ratchetKeyPair.publicKey.base64EncodedString(),
                     routingSeedBase64: keys.routingSeed.base64EncodedString(),
                     nodeAddresses: nodes.chooseNodesForNewContact(listId: listId, using: &rng))
    }

    private func currentPending() -> NodeMeshContactStore.Pending? {
        if let shown { return shown }
        guard nodes.isUsable, let listId = selectedListId else { return nil }
        guard let list = nodes.lists.first(where: { $0.id == listId }) else {
            selectedListId = nil
            contacts.setPending(nil)
            return nil
        }
        // A pending set that does not come from the selected list is useless.
        let pending = contacts.pending.flatMap { p in p.nodeAddresses.contains(where: list.addresses.contains) ? p : nil }
            ?? newPending(listId: listId)
        contacts.setPending(pending)
        shown = pending
        return pending
    }

    public func myCode() -> NodeMeshPairingPayload? {
        guard let pairing = currentPending() else { return nil }
        return NodeMeshPairingPayload(
            messageKeyBase64: pairing.messageKeyBase64, ratchetPublicKeyBase64: pairing.ratchetPublicKeyBase64,
            routingSeedBase64: pairing.routingSeedBase64,
            nodeAddresses: pairing.nodeAddresses.map(NodeConnectionStrings.buildAddress),
            edition: NodeMeshEdition.pro
        )
    }

    private static func isKey(_ base64: String) -> Bool {
        Data(base64Encoded: base64)?.count == 32
    }

    public func handle(payload: NodeMeshPairingPayload, displayName: String, sessionId: String = UUID().uuidString) -> Outcome {
        guard NodeMeshEdition.canAdd(payload.edition) else { return .refusedEdition(payload.edition) }
        if payload.guestGrants.contains(where: { !$0.isEmpty }) { return .guestInvitationNeedsClient }
        if !payload.guestInviteId.isEmpty, payload.edition == NodeMeshEdition.client { return .guestAnswerNotSupported }
        guard Self.isKey(payload.messageKeyBase64), Self.isKey(payload.ratchetPublicKeyBase64),
              Self.isKey(payload.routingSeedBase64) else { return .invalidCode }
        guard nodes.isUsable else { return .ownNodeFirst }

        // No user id in this format: the message key tells a re-scan from a new contact.
        if let existing = contacts.contact(theirMessageKeyBase64: payload.messageKeyBase64) {
            return existing.theirRatchetPublicKeyBase64 == payload.ratchetPublicKeyBase64
                ? .alreadyContact(existing.displayName) : .keyChanged
        }
        if bound { return .codeUsed }
        guard let mine = currentPending() else { return nodes.isUsable ? .chooseList : .ownNodeFirst }

        let contact = NodeMeshContact(
            id: sessionId, displayName: displayName, addedAt: Date(),
            isClientSlot: payload.edition == NodeMeshEdition.client, isVerified: false,
            theirMessageKeyBase64: payload.messageKeyBase64,
            theirRatchetPublicKeyBase64: payload.ratchetPublicKeyBase64,
            theirRoutingSeedBase64: payload.routingSeedBase64,
            theirNodeAddresses: Array(payload.nodeAddresses.prefix(NodeConnectionStrings.poolMaxSize)),
            myMessageKeyBase64: mine.messageKeyBase64,
            myRatchetPrivateKeyBase64: mine.ratchetPrivateKeyBase64,
            myRatchetPublicKeyBase64: mine.ratchetPublicKeyBase64,
            myRoutingSeedBase64: mine.routingSeedBase64,
            myNodeAddresses: mine.nodeAddresses.map(NodeConnectionStrings.buildAddress),
            messageTtlHours: nil
        )
        contacts.add(contact)
        contacts.setPending(nil)
        bound = true
        return .added(contact)
    }
}
