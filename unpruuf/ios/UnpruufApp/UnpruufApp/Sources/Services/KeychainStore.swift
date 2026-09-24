import Foundation
import Security
import UnpruufCore

/// Thin Keychain wrapper for everything that must survive app restarts: identity keys and
/// per-contact Double Ratchet session state. `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
/// so it's readable while backgrounded (needed for the relay poll) but never leaves the device
/// (no iCloud Keychain sync) — mirrors the Android app's device-local `SharedPreferences` storage.
final class KeychainStore: KeyValueStore {
    private let service = "com.nexonai.unpruuf.identity"

    func getString(_ key: String) -> String? {
        guard let data = getData(key) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func setString(_ key: String, _ value: String) {
        setData(key, Data(value.utf8))
    }

    func getData(_ key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    func setData(_ key: String, _ value: Data) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: value,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        if status == errSecSuccess {
            SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        } else {
            var insert = query
            attributes.forEach { insert[$0] = $1 }
            SecItemAdd(insert as CFDictionary, nil)
        }
    }

    func removeData(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }

    /// Every key currently stored under our service, for a full local wipe (mirrors Android's
    /// SharedPreferences-clear-on-delete-contact/panic behavior). Best-effort: Keychain doesn't
    /// offer a native "delete all for this service in one call" outside of this query pattern.
    func removeAll() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

// MARK: - Per-contact ratchet session persistence

/// Codable mirror of `RatchetStateEntity`/`DoubleRatchet.RatchetState`, for Keychain persistence.
struct RatchetStateRecord: Codable {
    var dhsPrivateKey: Data
    var dhsPublicKey: Data
    var dhr: Data?
    var rootKey: Data
    var sendChainKey: Data?
    var recvChainKey: Data?
    var sendCount: Int32
    var recvCount: Int32
    var previousChainLength: Int32
    var skippedKeys: [String: Data]
}

extension KeychainStore {
    private func ratchetKey(_ contactId: String) -> String { "ratchet_state_\(contactId)" }

    func loadRatchetState(contactId: String) -> DoubleRatchet.RatchetState? {
        guard let data = getData(ratchetKey(contactId)),
              let record = try? JSONDecoder().decode(RatchetStateRecord.self, from: data) else {
            return nil
        }
        return DoubleRatchet.RatchetState(
            dhsPrivateKey: record.dhsPrivateKey, dhsPublicKey: record.dhsPublicKey, dhr: record.dhr,
            rootKey: record.rootKey, sendChainKey: record.sendChainKey, recvChainKey: record.recvChainKey,
            sendCount: record.sendCount, recvCount: record.recvCount,
            previousChainLength: record.previousChainLength, skippedKeys: record.skippedKeys
        )
    }

    func saveRatchetState(contactId: String, state: DoubleRatchet.RatchetState) {
        let record = RatchetStateRecord(
            dhsPrivateKey: state.dhsPrivateKey, dhsPublicKey: state.dhsPublicKey, dhr: state.dhr,
            rootKey: state.rootKey, sendChainKey: state.sendChainKey, recvChainKey: state.recvChainKey,
            sendCount: state.sendCount, recvCount: state.recvCount,
            previousChainLength: state.previousChainLength, skippedKeys: state.skippedKeys
        )
        guard let data = try? JSONEncoder().encode(record) else { return }
        setData(ratchetKey(contactId), data)
    }

    func deleteRatchetState(contactId: String) {
        removeData(ratchetKey(contactId))
    }
}
