import Foundation

/// Owner and address strings of a node, ported from the companion object of `NodeMeshManager`.
/// The owner string carries the write key: local only, never in a QR or sent to a contact.
public enum NodeConnectionStrings {
    public static let ownerPrefix = "unpruuf-node-owner:v1:"
    public static let addressPrefix = "unpruuf-node:v1:"
    /// How many nodes one contact gets.
    public static let poolMaxSize = 3
    /// How many own nodes this device can hold in total.
    public static let ownNodesMax = 1000

    public struct Owner: Equatable, Hashable {
        public let address: String
        public let ownerSecret: String

        public init(address: String, ownerSecret: String) {
            self.address = address
            self.ownerSecret = ownerSecret
        }
    }

    /// Split at the last colon: the secret is base64url and never contains one.
    public static func parseOwner(_ raw: String) -> Owner? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix(ownerPrefix) else { return nil }
        let rest = String(trimmed.dropFirst(ownerPrefix.count))
        guard let colon = rest.lastIndex(of: ":"), colon > rest.startIndex,
              rest.index(after: colon) < rest.endIndex else { return nil }
        let address = String(rest[..<colon])
        guard OnionAddress.isValid(address) else { return nil }
        return Owner(address: address, ownerSecret: String(rest[rest.index(after: colon)...]))
    }

    public static func buildOwner(_ owner: Owner) -> String {
        "\(ownerPrefix)\(owner.address):\(owner.ownerSecret)"
    }

    public static func parseAddress(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix(addressPrefix) else { return nil }
        let address = String(trimmed.dropFirst(addressPrefix.count))
        return OnionAddress.isValid(address) ? address : nil
    }

    public static func buildAddress(_ address: String) -> String {
        addressPrefix + address
    }

    public static func buildList(_ list: [String]) -> String {
        list.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .prefix(poolMaxSize)
            .joined(separator: ";")
    }

    public static func parseList(_ raw: String) -> [String] {
        raw.components(separatedBy: ";")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    /// Random pick, one node per server first (so no single server sees a whole conversation),
    /// then random fill. A server is a distinct owner secret.
    public static func chooseNodes<G: RandomNumberGenerator>(pool: [Owner], count: Int, using generator: inout G) -> [String] {
        let shuffled = pool.shuffled(using: &generator)
        var picked: [Owner] = []
        for node in shuffled where picked.count < count && !picked.contains(where: { $0.ownerSecret == node.ownerSecret }) {
            picked.append(node)
        }
        for node in shuffled where picked.count < count && !picked.contains(node) {
            picked.append(node)
        }
        return picked.map(\.address)
    }
}
