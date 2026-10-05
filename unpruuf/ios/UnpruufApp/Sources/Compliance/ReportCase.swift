import Foundation
import UnpruufCore

/// One report ("case") of this reporter. Everything that identifies the reporter on the wire lives
/// in the case's own keychain-backed `Identity` (see `PrefixedKeyValueStore`), not here; this holds
/// the reporting office's side and what the office told us about the case.
struct ReportCase: Codable, Identifiable, Equatable, Hashable {
    /// Local only — never leaves the phone.
    let id: String
    let officerUserId: String
    let officerMessageKeyBase64: String
    let officerX25519PublicKeyBase64: String
    /// The office's relays: we push to them, and the office pushes to the same ones (it answers on
    /// the relay it advertised in its QR).
    var relayConnectionStrings: [String]
    var addedAt: Date

    /// Set when the first report is handed over; cleared as soon as the receipt arrives. While set,
    /// the intake is re-sent every `OfficerCase.intakeRetryInterval`.
    var intakeStartedAt: Date?
    var intakeLastSentAt: Date?

    var caseNumber: String?
    /// "acknowledged" | "in_progress" | "closed"
    var caseStatus: String?
    var caseOpenedAt: Date?
    var caseAckDueAt: Date?
    var caseFeedbackDueAt: Date?
    var caseUpdatedAt: Date?

    var officerMessageKey: Data { Data(base64Encoded: officerMessageKeyBase64) ?? Data() }
    var officerX25519PublicKey: Data { Data(base64Encoded: officerX25519PublicKeyBase64) ?? Data() }

    /// Prefix for this case's own Keychain entries.
    var keyPrefix: String { "case_\(id)_" }
}
