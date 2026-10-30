import Combine
import Foundation
import UnpruufCore

/// The reporter's cases plus the remembered reporting-office QR. Cases are stored encrypted
/// (AES-GCM under a random key that lives in the Keychain), like the consumer app's contacts.
@MainActor
final class CaseStore: ObservableObject {
    @Published private(set) var cases: [ReportCase] = []
    /// The scanned reporting-office QR, nil until the first scan. New cases reuse it, so "+ New
    /// case" needs no new scan.
    @Published private(set) var organization: PairingPayload?

    private let keychain: KeychainStore
    private let fileURL: URL
    private static let organizationKey = "wb_office_qr"

    init(keychain: KeychainStore) {
        self.keychain = keychain
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        self.fileURL = dir.appendingPathComponent("cases.enc")
        if let json = keychain.getString(Self.organizationKey) {
            organization = PairingPayload.fromJSON(json)
        }
        load()
    }

    private var fileKey: Data {
        if let existing = keychain.getData("cases_file_key") { return existing }
        var key = Data(count: 32)
        _ = key.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 32, $0.baseAddress!) }
        keychain.setData("cases_file_key", key)
        return key
    }

    private func load() {
        guard let encrypted = try? Data(contentsOf: fileURL),
              let decrypted = try? OuterEnvelope.decrypt(data: encrypted, myKey32: fileKey),
              let decoded = try? JSONDecoder().decode([ReportCase].self, from: decrypted) else { return }
        cases = decoded
    }

    private func persist() {
        guard let plaintext = try? JSONEncoder().encode(cases),
              let encrypted = try? OuterEnvelope.encrypt(plaintext: plaintext, contactKey32: fileKey) else { return }
        try? encrypted.write(to: fileURL, options: .atomic)
    }

    // MARK: Organisation

    func setOrganization(_ payload: PairingPayload) {
        keychain.setString(Self.organizationKey, payload.toJSON())
        organization = payload
    }

    /// "Scan another organisation": new cases use the new QR, existing cases keep theirs.
    func forgetOrganization() {
        keychain.removeData(Self.organizationKey)
        organization = nil
    }

    // MARK: Cases

    var sortedCases: [ReportCase] {
        cases.sorted { ($0.caseUpdatedAt ?? $0.addedAt) > ($1.caseUpdatedAt ?? $1.addedAt) }
    }

    func get(id: String) -> ReportCase? { cases.first { $0.id == id } }

    func add(_ reportCase: ReportCase) {
        cases.append(reportCase)
        persist()
    }

    private func update(_ id: String, _ change: (inout ReportCase) -> Void) {
        guard let idx = cases.firstIndex(where: { $0.id == id }) else { return }
        change(&cases[idx])
        persist()
    }

    func startIntake(id: String, at date: Date = Date()) {
        update(id) { $0.intakeStartedAt = date; $0.intakeLastSentAt = nil }
    }

    func markIntakeSent(id: String, at date: Date = Date()) {
        update(id) { $0.intakeLastSentAt = date }
    }

    func stopIntake(id: String) {
        update(id) { $0.intakeStartedAt = nil }
    }

    /// The office's receipt / status update. Also ends the intake retries.
    func applyCaseInfo(id: String, info: OfficerCase.CaseInfo) {
        update(id) {
            $0.caseNumber = info.number
            $0.caseStatus = info.status
            $0.caseOpenedAt = info.openedAt
            $0.caseAckDueAt = info.ackDueAt
            $0.caseFeedbackDueAt = info.feedbackDueAt
            $0.caseUpdatedAt = info.updatedAt
            $0.intakeStartedAt = nil
        }
    }

    /// Removes the case and every key it owned from this phone. The office keeps its own record.
    func remove(id: String) {
        guard let removed = cases.first(where: { $0.id == id }) else { return }
        cases.removeAll { $0.id == id }
        persist()
        keychain.deleteRatchetState(contactId: id)
        PrefixedKeyValueStore.removeIdentity(base: keychain, prefix: removed.keyPrefix)
    }

    func wipeAll() {
        for c in cases {
            keychain.deleteRatchetState(contactId: c.id)
            PrefixedKeyValueStore.removeIdentity(base: keychain, prefix: c.keyPrefix)
        }
        cases.removeAll()
        forgetOrganization()
        try? FileManager.default.removeItem(at: fileURL)
    }
}
