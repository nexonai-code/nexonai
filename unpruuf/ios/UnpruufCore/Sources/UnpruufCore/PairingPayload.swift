import Foundation

/// **New** QR pairing payload for cross-platform (relay-mandatory) mode. Android's existing QR
/// (`QrPairViewModel.kt`) encodes an onion address — meaningless for a peer that's never directly
/// dialable. This is the cross-platform-mode equivalent: `n` (my relay connection pool) plays
/// the same role Android's `o` (onion address) does — "the address(es) others should use to reach
/// me" — just relay+wire-tag instead of a direct onion. Documented as the authoritative spec in
/// `CROSS_PLATFORM_PLAN.md` for Android's later companion work to match.
///
/// Since v1.10 (Android), Android also uses this exact format for Android↔Android pairing when
/// `RelayManager.RelayMode.MANDATORY` is on, not just for talking to iOS — see CHANGELOG
/// "Business/Mandatory pairing unification". iOS itself needs no change for this: it already only
/// ever generates/reads this format (there is no onion-based pairing on iOS to begin with), and
/// `parseFlatJSON` below already ignores any key it doesn't recognize — including the `e`
/// (edition) field two real Android editions now exchange here, which iOS has no use for since it
/// has no Standard/Client/Pro concept of its own.
///
/// Compact single-letter JSON keys, same rationale as the Android QR's v3 format: a shorter
/// payload means a lower QR version, which means larger/easier-to-scan modules for weaker camera
/// autofocus. `n` holds up to `RelayConnectionString.maxPoolSize` (2) `;`-joined connection
/// strings rather than one — a deliberately small failover pool, not an open-ended list, to keep
/// that same size tradeoff in check (each extra entry meaningfully grows the QR; see CHANGELOG).
public struct PairingPayload: Equatable {
    public let version: Int
    public let userId: String
    public let messageKeyBase64: String
    public let x25519RatchetPublicKeyBase64: String
    /// My current relay connection pool (each `unpruuf-relay:v1:...`) — where the contact should
    /// send messages addressed to me. First entry is preferred/primary; a contact tries the rest
    /// only if it fails. Capped at `RelayConnectionString.maxPoolSize` by `buildList`/`fromJSON`.
    public let relayConnectionStrings: [String]

    public init(userId: String, messageKeyBase64: String, x25519RatchetPublicKeyBase64: String, relayConnectionStrings: [String]) {
        self.version = 2
        self.userId = userId
        self.messageKeyBase64 = messageKeyBase64
        self.x25519RatchetPublicKeyBase64 = x25519RatchetPublicKeyBase64
        self.relayConnectionStrings = relayConnectionStrings
    }

    private init(version: Int, userId: String, messageKeyBase64: String, x25519RatchetPublicKeyBase64: String, relayConnectionStrings: [String]) {
        self.version = version
        self.userId = userId
        self.messageKeyBase64 = messageKeyBase64
        self.x25519RatchetPublicKeyBase64 = x25519RatchetPublicKeyBase64
        self.relayConnectionStrings = relayConnectionStrings
    }

    /// Encodes to the compact wire JSON. `n` (relay connection pool, `;`-joined) already contains
    /// colons and semicolons — stored as-is inside the JSON string value, escaping only the
    /// double quote/backslash characters that would otherwise break the hand-rolled parser below.
    public func toJSON() -> String {
        let u = Self.compactUserId(userId) ?? userId
        let n = RelayConnectionString.buildList(relayConnectionStrings)
        return "{\"v\":\(version),\"u\":\"\(u)\",\"p\":\"\(messageKeyBase64)\",\"k\":\"\(x25519RatchetPublicKeyBase64)\",\"n\":\"\(Self.escape(n))\"}"
    }

    /// Accepts both today's list-valued `n` and — forwards/backwards compatibility isn't the
    /// point here (an old scanner misparsing a new QR is a real, documented risk either way, see
    /// CHANGELOG) but a single-entry `n` is still exactly one valid list, so no special-casing is
    /// needed to accept one.
    public static func fromJSON(_ json: String) -> PairingPayload? {
        guard let map = Self.parseFlatJSON(json) else { return nil }
        guard let compactUserId = map["u"], let userId = expandUserId(compactUserId) else { return nil }
        guard let p = map["p"], let k = map["k"], let n = map["n"] else { return nil }
        let v = map["v"].flatMap { Int($0) } ?? 1
        let relays = Array(RelayConnectionString.parseList(Self.unescape(n)).prefix(RelayConnectionString.maxPoolSize))
        guard !relays.isEmpty else { return nil }
        return PairingPayload(version: v, userId: userId, messageKeyBase64: p, x25519RatchetPublicKeyBase64: k, relayConnectionStrings: relays)
    }

    /// 36-char dashed UUID string -> 22-char unpadded Base64 of its 16 raw bytes — same encoding
    /// as Android QR v3's `compactUserId`.
    private static func compactUserId(_ userId: String) -> String? {
        guard let uuid = UUID(uuidString: userId) else { return nil }
        let bytes = withUnsafeBytes(of: uuid.uuid) { Data($0) }
        return bytes.base64EncodedString().trimmingCharacters(in: CharacterSet(charactersIn: "="))
    }

    private static func expandUserId(_ compact: String) -> String? {
        var b64 = compact
        while b64.count % 4 != 0 { b64.append("=") }
        guard let bytes = Data(base64Encoded: b64), bytes.count == 16 else {
            // Not compact — might already be a plain UUID string (forwards-compatible fallback).
            return UUID(uuidString: compact) != nil ? compact : nil
        }
        let uuid = bytes.withUnsafeBytes { $0.load(as: uuid_t.self) }
        return UUID(uuid: uuid).uuidString
    }

    private static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    }

    private static func unescape(_ s: String) -> String {
        s.replacingOccurrences(of: "\\\"", with: "\"").replacingOccurrences(of: "\\\\", with: "\\")
    }

    /// Minimal flat `{"k":"v",...}` parser — no nested objects/arrays, matching the QR payload's
    /// own deliberately flat shape (same approach as the Android QR's hand-rolled parser).
    private static func parseFlatJSON(_ json: String) -> [String: String]? {
        guard let data = json.data(using: .utf8) else { return nil }
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        var result: [String: String] = [:]
        for (key, value) in obj {
            if let s = value as? String { result[key] = s }
            else if let n = value as? NSNumber { result[key] = n.stringValue }
        }
        return result
    }
}
