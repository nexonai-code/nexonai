import Foundation
import UnpruufCore

/// Gives every case its OWN `Identity` (user id, message key, ratchet key pair): the same Keychain,
/// but every key name prefixed with the case id. Two reports from one phone are therefore
/// cryptographically unrelated — to the relay and to the reporting office alike.
final class PrefixedKeyValueStore: KeyValueStore {
    private let base: KeychainStore
    private let prefix: String

    init(base: KeychainStore, prefix: String) {
        self.base = base
        self.prefix = prefix
    }

    func getString(_ key: String) -> String? { base.getString(prefix + key) }
    func setString(_ key: String, _ value: String) { base.setString(prefix + key, value) }

    /// The key names `Identity` writes — removed one by one when a case is removed from the phone.
    static let identityKeys = ["user_id", "msg_key", "x25519_ratchet_priv_key", "x25519_ratchet_pub_key"]

    static func removeIdentity(base: KeychainStore, prefix: String) {
        for key in identityKeys { base.removeData(prefix + key) }
    }
}
