import Foundation

/// Wire format for a relay's address + auth token, shared as one blob (QR or copyable text).
/// Byte-for-byte port of the relay server's `connectionString.ts`
/// (`buildConnectionString`/`parseConnectionString`) — same format the Android app's
/// `RelayManager.parseConnectionString` already implements.
///
/// Format: `unpruuf-relay:v1:<onion-or-host:port>:<authToken>`
public enum RelayConnectionString {
    private static let prefix = "unpruuf-relay:v1:"

    public static func build(address: String, authToken: String) -> String {
        "\(prefix)\(address):\(authToken)"
    }

    public struct Parsed {
        public let address: String
        public let authToken: String
    }

    /// The address itself may contain no colons (a bare .onion) or one (host:port) — the auth
    /// token is always the LAST segment, so split from the right, exactly like the TS/Kotlin
    /// counterparts.
    public static func parse(_ raw: String) -> Parsed? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix(prefix) else { return nil }
        let rest = String(trimmed.dropFirst(prefix.count))
        guard let lastColon = rest.lastIndex(of: ":") else { return nil }
        guard lastColon > rest.startIndex, rest.index(after: lastColon) < rest.endIndex else { return nil }
        let address = String(rest[rest.startIndex..<lastColon])
        let authToken = String(rest[rest.index(after: lastColon)...])
        guard !address.isEmpty, !authToken.isEmpty else { return nil }
        return Parsed(address: address, authToken: authToken)
    }

    /// Max entries carried in a pairing QR's own relay pool — a deliberate tradeoff between
    /// failover redundancy and QR payload size (see PairingPayload.swift's doc comment on `n`).
    public static let maxPoolSize = 2

    /// Joins a list of full `unpruuf-relay:v1:...` connection strings with `;` — safe because
    /// neither a bare/host:port address nor a base64url auth token can contain `;` (see
    /// `server/src/identity.ts`'s `generateToken()` alphabet). Drops empty/blank entries and caps
    /// at `maxPoolSize`, so callers never have to re-check invariants after the fact.
    public static func buildList(_ list: [String]) -> String {
        list.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .prefix(maxPoolSize)
            .joined(separator: ";")
    }

    /// Splits a `;`-joined list back into individual connection strings — does NOT validate each
    /// one with `parse()`; callers that need only well-formed entries should filter with
    /// `parse(_:) != nil` themselves (kept separate so a partially-malformed list doesn't lose
    /// its still-good entries here).
    public static func parseList(_ raw: String) -> [String] {
        raw.split(separator: ";", omittingEmptySubsequences: true)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}
