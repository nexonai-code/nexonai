import Foundation

/// Control-message signals sent inside the same `OuterEnvelope` as any real chat message —
/// checked for an exact/prefix match *before* attempting `RatchetFrame` decode, exactly mirroring
/// `P2PNetworkManager.kt`'s companion object and `ingestPacket()`'s check order.
public enum ControlSignals {
    /// Exact-match signals — identical strings to the Android app's, so a future shared contact
    /// (once Android grows cross-platform-mode support) recognizes them without translation.
    public static let revoke = "UNPRUUF_REVOKE_V1".data(using: .utf8)!
    public static let deleteContact = "UNPRUUF_DELETE_CONTACT_V1".data(using: .utf8)!
    public static let dummy = "UNPRUUF_DUMMY_V1".data(using: .utf8)!

    /// New for cross-platform mode: prefix (not exact-match) — carries the new generation number
    /// and the sender's new relay connection string after a "Wechsel" rotation. See
    /// `CROSS_PLATFORM_PLAN.md`'s wire-tag rotation section for why a generation counter replaces
    /// Android's hour bucket here, and `Identity.myWireTag`/`expectedWireTag` for how it's used.
    public static let wechselPrefix = "UNPRUUF_WECHSEL_V1:"

    /// Builds the Wechsel signal payload: `UNPRUUF_WECHSEL_V1:<generation>:<relayConnectionString>`.
    public static func encodeWechsel(newGeneration: Int, newRelayConnectionString: String) -> Data {
        Data("\(wechselPrefix)\(newGeneration):\(newRelayConnectionString)".utf8)
    }

    public struct WechselUpdate {
        public let newGeneration: Int
        public let newRelayConnectionString: String
    }

    /// Parses a Wechsel signal payload, or `nil` if `plaintext` isn't one (including malformed —
    /// a malformed value must never crash or silently corrupt contact state, only be ignored).
    public static func decodeWechsel(_ plaintext: Data) -> WechselUpdate? {
        guard let str = String(data: plaintext, encoding: .utf8), str.hasPrefix(wechselPrefix) else {
            return nil
        }
        let rest = String(str.dropFirst(wechselPrefix.count))
        guard let firstColon = rest.firstIndex(of: ":") else { return nil }
        let generationStr = rest[rest.startIndex..<firstColon]
        let connStr = String(rest[rest.index(after: firstColon)...])
        guard let generation = Int(generationStr), generation >= 0, !connStr.isEmpty else { return nil }
        return WechselUpdate(newGeneration: generation, newRelayConnectionString: connStr)
    }
}
