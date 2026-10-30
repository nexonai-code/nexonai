import Combine
import Foundation
import UnpruufCore

/// App-level glue around `UnpruufCore.RelayPoolManifest`'s pure verifier — see that type's doc
/// comment for the wire format and cross-runtime verification story. This class owns *where* an
/// imported manifest is remembered (the relay strings carry their token, so they go in the
/// Keychain, like `AppEnvironment`'s `extraRelayConnectionStrings`). Applying a successfully-verified manifest to
/// `env.extraRelayConnectionStrings` is left to the caller (`SettingsView`) rather than done
/// here, so this type has no dependency on `AppEnvironment` — the same split already used there
/// for the hand-entered backup-relay field. Import is deliberately unrestricted (no device
/// binding, no "enterprise account" concept) — see the plan's confirmed v1 decision; any user
/// holding the manifest text can import it, and it REPLACES (not merges) the previous list.
@MainActor
final class RelayPoolManager: ObservableObject {
    /// Safe to be public; only verifies, never signs. Must match `RelayPoolManager.PUBLIC_KEY_B64`
    /// on Android exactly — both platforms verify manifests issued by the same relaypool-tool key.
    static let publicKeyB64 = "jyPHi5C8bldr8B5p4lGz65Id3Rxqe0UFgov1A9r5y1A"

    @Published private(set) var lastImported: RelayPoolManifest.Info?

    private let keychain: KeychainStore

    init(keychain: KeychainStore) {
        self.keychain = keychain
        keychain.migrateFromDefaults(Self.relaysKey)
        if let org = UserDefaults.standard.string(forKey: Self.orgKey) {
            let issuedAtMs = UserDefaults.standard.object(forKey: Self.issuedAtKey) as? Int64 ?? -1
            let relays = RelayConnectionString.parseList(keychain.getString(Self.relaysKey) ?? "")
            if issuedAtMs >= 0, !relays.isEmpty {
                self.lastImported = RelayPoolManifest.Info(org: org, issuedAtMs: issuedAtMs, relays: relays)
            }
        }
    }

    /// Verifies `code` and, on success, remembers it as the last-imported manifest (both in
    /// memory and on the device). Returns the parsed info on success — the caller is
    /// responsible for applying `info.relays` wherever it needs to go — or `nil` if `code` isn't
    /// a validly-signed manifest.
    func importManifest(_ code: String) -> RelayPoolManifest.Info? {
        guard let info = RelayPoolManifest.verify(code: code, publicKeyB64: Self.publicKeyB64) else {
            return nil
        }
        UserDefaults.standard.set(info.org, forKey: Self.orgKey)
        UserDefaults.standard.set(info.issuedAtMs, forKey: Self.issuedAtKey)
        keychain.setString(Self.relaysKey, RelayConnectionString.buildList(info.relays))
        lastImported = info
        return info
    }

    /// Panic PIN: the imported manifest goes too.
    func wipe() {
        UserDefaults.standard.removeObject(forKey: Self.orgKey)
        UserDefaults.standard.removeObject(forKey: Self.issuedAtKey)
        keychain.removeData(Self.relaysKey)
        lastImported = nil
    }

    private static let orgKey = "relay_pool_manifest_org"
    private static let issuedAtKey = "relay_pool_manifest_issued_at_ms"
    private static let relaysKey = "relay_pool_manifest_relays"
}
