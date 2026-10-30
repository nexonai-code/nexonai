import Foundation

/// The stored licence of this install, ported from Android's `LicenseManager`. Offline: a code needs
/// a genuine signature, binds itself to the first install it is activated on, and turning the clock
/// back does not extend it. A seat count cannot be enforced without a server, that stays a matter of
/// the contract. Survives the panic PIN, like the identity and the PINs.
public final class AppLicenseStore {
    public enum ApplyResult: Equatable {
        case activated
        case invalid
        case otherDevice
    }

    private static let codeKey = "license_code"
    private static let boundKey = "license_bound_install"
    private static let installKey = "license_install_id"
    private static let trustedNowKey = "license_trusted_now_ms"

    private let store: KeyValueStore
    private let edition: String
    private let publicKeyB64: String
    private let wallMs: () -> Int64

    public init(store: KeyValueStore, edition: String, publicKeyB64: String = AppLicense.publicKeyB64,
                wallMs: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.store = store
        self.edition = edition
        self.publicKeyB64 = publicKeyB64
        self.wallMs = wallMs
    }

    /// Random and kept in the Keychain, because `identifierForVendor` changes on a reinstall.
    private var installId: String {
        if let existing = store.getString(Self.installKey), !existing.isEmpty { return existing }
        let id = UUID().uuidString
        store.setString(Self.installKey, id)
        return id
    }

    /// Never decreases: moving the clock back stops helping once a later date has been seen.
    private func trustedNowMs() -> Int64 {
        let stored = store.getString(Self.trustedNowKey).flatMap { Int64($0) } ?? 0
        let now = max(stored, wallMs())
        if now > stored { store.setString(Self.trustedNowKey, String(now)) }
        return now
    }

    /// Re-entering the bound code and a renewal both work; nothing is stored on a refusal.
    public func apply(code: String) -> ApplyResult {
        guard AppLicense.verify(code: code, edition: edition, publicKeyB64: publicKeyB64) != nil else { return .invalid }
        let bound = store.getString(Self.boundKey).flatMap { $0.isEmpty ? nil : $0 }
        guard bound == nil || bound == installId else { return .otherDevice }
        store.setString(Self.codeKey, code.trimmingCharacters(in: .whitespacesAndNewlines))
        store.setString(Self.boundKey, bound ?? installId)
        return .activated
    }

    public var state: AppLicense.State {
        guard let code = store.getString(Self.codeKey), !code.isEmpty else { return .notConfigured }
        if let bound = store.getString(Self.boundKey), !bound.isEmpty, bound != installId { return .invalid }
        return AppLicense.state(code: code, edition: edition, nowMs: trustedNowMs(), publicKeyB64: publicKeyB64)
    }

    /// Expiring soon still works, it is only warned about.
    public var isLicensed: Bool {
        switch state {
        case .valid, .expiringSoon: return true
        case .notConfigured, .expired, .invalid: return false
        }
    }
}
