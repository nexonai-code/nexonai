import Foundation

/// The Node-Mesh pairing code, v2, ported from Android's `NodeMeshPairing.kt`. Every value in it
/// is generated for one pairing only. `n` holds the addresses without the `unpruuf-node:v1:`
/// prefix. `g` and `i` exist only in guest invitations and their answers.
public struct NodeMeshPairingPayload: Equatable {
    public var version: Int
    public var messageKeyBase64: String
    public var ratchetPublicKeyBase64: String
    public var routingSeedBase64: String
    /// With the `unpruuf-node:v1:` prefix.
    public var nodeAddresses: [String]
    public var edition: String
    /// Index-aligned with `nodeAddresses`, "" means no grant for that node. A secret.
    public var guestGrants: [String]
    public var guestInviteId: String

    public init(version: Int = 2, messageKeyBase64: String, ratchetPublicKeyBase64: String, routingSeedBase64: String,
                nodeAddresses: [String], edition: String = "standard", guestGrants: [String] = [], guestInviteId: String = "") {
        self.version = version
        self.messageKeyBase64 = messageKeyBase64
        self.ratchetPublicKeyBase64 = ratchetPublicKeyBase64
        self.routingSeedBase64 = routingSeedBase64
        self.nodeAddresses = nodeAddresses
        self.edition = edition
        self.guestGrants = guestGrants
        self.guestInviteId = guestInviteId
    }

    /// Written by hand: one line, single letters, same field order as Android, and `/` in base64
    /// stays as it is.
    public func toJSON() -> String {
        let prefix = NodeConnectionStrings.addressPrefix
        let n = nodeAddresses.map { $0.hasPrefix(prefix) ? String($0.dropFirst(prefix.count)) : $0 }.joined(separator: ";")
        var json = "{\"v\":\(version),\"p\":\"\(messageKeyBase64)\",\"k\":\"\(ratchetPublicKeyBase64)\",\"s\":\"\(routingSeedBase64)\",\"n\":\"\(Self.escape(n))\",\"e\":\"\(edition)\""
        if guestGrants.contains(where: { !$0.isEmpty }) {
            json += ",\"g\":\"\(Self.escape(GuestGrant.encodeList(guestGrants)))\""
        }
        if !guestInviteId.isEmpty {
            json += ",\"i\":\"\(Self.escape(guestInviteId))\""
        }
        return json + "}"
    }

    /// `nil` if this is no Node-Mesh code (no `s`, which tells it from the relay code) or if no
    /// valid v3 onion is left in `n`. A `u` from a v1 code is ignored.
    public static func fromJSON(_ json: String) -> NodeMeshPairingPayload? {
        guard let object = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any],
              let seed = object["s"] as? String, let n = object["n"] as? String,
              let messageKey = object["p"] as? String, let ratchetKey = object["k"] as? String else { return nil }
        let addresses = n.components(separatedBy: ";")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter(OnionAddress.isValid)
            .prefix(NodeConnectionStrings.poolMaxSize)
            .map { NodeConnectionStrings.addressPrefix + $0 }
        guard !addresses.isEmpty else { return nil }
        let inviteId = object["i"] as? String ?? ""
        return NodeMeshPairingPayload(
            version: object["v"] as? Int ?? 1,
            messageKeyBase64: messageKey,
            ratchetPublicKeyBase64: ratchetKey,
            routingSeedBase64: seed,
            nodeAddresses: addresses,
            edition: object["e"] as? String ?? "standard",
            guestGrants: (object["g"] as? String).map { GuestGrant.decodeList($0, max: addresses.count) } ?? [],
            guestInviteId: isValidInviteId(inviteId) ? inviteId : ""
        )
    }

    private static func isValidInviteId(_ id: String) -> Bool {
        (8...24).contains(id.utf8.count) && id.unicodeScalars.allSatisfy {
            ("A"..."Z").contains($0) || ("a"..."z").contains($0) || ("0"..."9").contains($0) || $0 == "_" || $0 == "-"
        }
    }

    private static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    }
}
