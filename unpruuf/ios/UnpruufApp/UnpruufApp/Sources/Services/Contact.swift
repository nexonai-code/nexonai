import Foundation

/// A paired contact in cross-platform (relay-mandatory) mode. Unlike the Android app's `Contact`
/// (one onion address per contact), there is no direct address here — only relay + wire-tag
/// generation, tracked **per direction** because rotation is manual and each side can "Wechsel"
/// independently, unlike Android's shared-clock hourly rotation (see `CROSS_PLATFORM_PLAN.md`).
struct Contact: Codable, Identifiable, Equatable, Hashable {
    /// The contact's userId.
    let id: String
    var displayName: String
    /// The contact's 32-byte receive key (their `Identity.myMessageKey`), base64.
    let messageKeyBase64: String
    /// The contact's X25519 ratchet identity public key, base64 — bootstraps the Double Ratchet session.
    let x25519RatchetPublicKeyBase64: String

    /// Where I push messages addressed to this contact (their relay pool, as they told me) — try
    /// in order, stop at first success. Up to `RelayConnectionString.maxPoolSize` entries.
    var theirRelayConnectionStrings: [String]
    /// Where I poll for messages from this contact (my relay pool, as I told them — may differ
    /// per contact if the user has manually pointed different contacts at different relays).
    /// Unlike sending, polling checks EVERY entry each round — a message could have landed at
    /// any of them (relay fetch is delete-on-fetch, so there's no "try next" fallback here).
    var myRelayConnectionStrings: [String]

    /// My identity generation as currently known to this contact (bumped when I "Wechsel" my
    /// side of this pairing). Determines the tag I address outgoing messages with.
    var myGeneration: Int
    /// This contact's identity generation as currently known to me (bumped when I receive their
    /// `UNPRUUF_WECHSEL_V1`). Determines the tag I poll for.
    var theirGeneration: Int

    var addedAt: Date

    /// Set once the user has compared `Identity.safetyNumber(...)` for this contact with them out
    /// of band (a call, a voice message — NOT the same channel the pairing QR/relay string was
    /// shared over) and it matched. Purely a local trust indicator, never sent over the wire and
    /// never required to message this contact — see `Views/ContactDetailView.swift`. Mirrors the
    /// Android app's `Contact.isVerified`.
    var isVerified: Bool = false

    init(
        id: String, displayName: String, messageKeyBase64: String, x25519RatchetPublicKeyBase64: String,
        theirRelayConnectionStrings: [String], myRelayConnectionStrings: [String],
        myGeneration: Int = 0, theirGeneration: Int = 0, addedAt: Date = Date(), isVerified: Bool = false
    ) {
        self.id = id
        self.displayName = displayName
        self.messageKeyBase64 = messageKeyBase64
        self.x25519RatchetPublicKeyBase64 = x25519RatchetPublicKeyBase64
        self.theirRelayConnectionStrings = theirRelayConnectionStrings
        self.myRelayConnectionStrings = myRelayConnectionStrings
        self.myGeneration = myGeneration
        self.theirGeneration = theirGeneration
        self.addedAt = addedAt
        self.isVerified = isVerified
    }

    var messageKey: Data { Data(base64Encoded: messageKeyBase64) ?? Data() }
    var x25519RatchetPublicKey: Data { Data(base64Encoded: x25519RatchetPublicKeyBase64) ?? Data() }

    // Manual Decodable so a `contacts.enc` file written before `isVerified` existed still decodes
    // (falls back to `false`) instead of throwing — Swift's synthesized decoder would otherwise
    // require every stored property to be present in the JSON. Encoding stays synthesized
    // (Encodable conformance is unaffected by this). Raw values keep the JSON keys singular
    // (`theirRelayConnectionString`, not `...Strings`) even though the Swift property is now
    // plural/array-typed — a deliberate choice so a `contacts.enc` file written before this
    // change decodes as a one-entry list rather than needing a file-format migration.
    enum CodingKeys: String, CodingKey {
        case id, displayName, messageKeyBase64, x25519RatchetPublicKeyBase64
        case theirRelayConnectionStrings = "theirRelayConnectionString"
        case myRelayConnectionStrings = "myRelayConnectionString"
        case myGeneration, theirGeneration, addedAt, isVerified
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        displayName = try c.decode(String.self, forKey: .displayName)
        messageKeyBase64 = try c.decode(String.self, forKey: .messageKeyBase64)
        x25519RatchetPublicKeyBase64 = try c.decode(String.self, forKey: .x25519RatchetPublicKeyBase64)
        theirRelayConnectionStrings = try Self.decodeRelayList(c, key: .theirRelayConnectionStrings)
        myRelayConnectionStrings = try Self.decodeRelayList(c, key: .myRelayConnectionStrings)
        myGeneration = try c.decode(Int.self, forKey: .myGeneration)
        theirGeneration = try c.decode(Int.self, forKey: .theirGeneration)
        addedAt = try c.decode(Date.self, forKey: .addedAt)
        isVerified = try c.decodeIfPresent(Bool.self, forKey: .isVerified) ?? false
    }

    /// Decodes a relay field that may be a `[String]` (current format) or a lone `String` (a
    /// `contacts.enc` entry written before this change) — tries the array first since that's the
    /// current shape, falls back to wrapping a single string, matching `isVerified`'s own
    /// established forward-compat pattern in this file.
    private static func decodeRelayList(_ c: KeyedDecodingContainer<CodingKeys>, key: CodingKeys) throws -> [String] {
        if let list = try? c.decode([String].self, forKey: key) { return list }
        if let single = try? c.decode(String.self, forKey: key) { return [single] }
        return []
    }
}
