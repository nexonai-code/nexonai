import Foundation

/// Mirrors `--status-json`'s output shape (see `server/src/mac-start.ts`) — this struct IS the
/// contract between the two; if that JSON shape ever changes, this is the other half to update.
struct RelayQueueSnapshot: Codable {
    let queued: Int
    let tags: Int
    let oldestAgeMs: Double?
}

struct RelayStatusJSON: Codable {
    let onion: String?
    let ttlHours: Double?
    let queue: RelayQueueSnapshot?
    /// Only present on the `{"error": "..."}` shape (identity not created yet, or similar).
    let error: String?
}

/// Mirrors `--show-code-json`'s output shape — either a connection string or an error code.
struct ShowCodeJSON: Codable {
    let connectionString: String?
    let error: String?
}

/// A plain string error — `String` itself doesn't conform to `Error`, and the failure messages
/// here are just relay output/error codes passed through as-is, not worth a whole hierarchy of
/// distinct error cases for.
struct RelayError: Error {
    let message: String
    init(_ message: String) { self.message = message }
}

/// What the traffic-light dot in the menu bar actually shows. Deliberately three states, not just
/// on/off: "the launchd service is loaded but Tor hasn't published yet" (normal for the first
/// 10-30s after a start) looks identical to "broken" if collapsed into just green/red, and that
/// distinction is the whole reason this indicator exists in the first place (see the iOS app's
/// own TorStatusLight, which this deliberately mirrors the spirit of on the relay side).
enum RelayState: Equatable {
    case notConfigured          // no server folder chosen yet
    case notSetUp               // folder chosen, but relay-identity.json doesn't exist
    case stopped                // identity exists, launchd service not loaded
    case starting                // service loaded, onion not published yet
    case running(onion: String) // service loaded, onion published
    case unknown(String)        // something failed in a way not covered above

    var dotColorName: String {
        switch self {
        case .running: return "green"
        case .starting: return "yellow"
        case .notConfigured, .notSetUp, .stopped, .unknown: return "red"
        }
    }
}
