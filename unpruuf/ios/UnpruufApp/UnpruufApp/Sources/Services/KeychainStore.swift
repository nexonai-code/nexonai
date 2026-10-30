import Foundation
import Security
import UnpruufCore

/// Thin Keychain wrapper for everything that must survive app restarts: identity keys and
/// per-contact Double Ratchet session state. `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
/// so it's readable while backgrounded (needed for the relay poll) but never leaves the device
/// (no iCloud Keychain sync) — mirrors the Android app's device-local `SharedPreferences` storage.
final class KeychainStore: KeyValueStore {
    private let service: String
    private let accessible: CFString

    /// The default is the store for everything the relay poll may need while the phone is locked.
    /// Owner secrets of own nodes use `nodeMesh`: readable only while the phone is unlocked.
    init(service: String = "com.nexonai.unpruuf.identity",
         accessible: CFString = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly) {
        self.service = service
        self.accessible = accessible
    }

    static func nodeMesh() -> KeychainStore {
        KeychainStore(service: "com.nexonai.unpruuf.nodemesh", accessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly)
    }

    func removeString(_ key: String) {
        removeData(key)
    }

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
            kSecAttrAccessible as String: accessible,
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

// MARK: - Local storage helpers

extension KeychainStore {
    /// Key of an encrypted file. Never creates a new one while the file exists: the next save would
    /// overwrite the old file with one nobody can read the old contents from. `nil` means the file
    /// is there and its key is not.
    func fileKey(named name: String, fileURL: URL) -> Data? {
        if let existing = getData(name) { return existing }
        guard !FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        var key = Data(count: 32)
        guard key.withUnsafeMutableBytes({ SecRandomCopyBytes(kSecRandomDefault, 32, $0.baseAddress!) }) == errSecSuccess else {
            return nil
        }
        setData(name, key)
        return getData(name)
    }

    /// Moves a value an older install left in `UserDefaults` (which ends up in backups) here.
    func migrateFromDefaults(_ key: String) {
        let defaults = UserDefaults.standard
        if getData(key) == nil {
            if let text = defaults.string(forKey: key) {
                setString(key, text)
            } else if let data = defaults.data(forKey: key) {
                setData(key, data)
            }
        }
        if getData(key) != nil { defaults.removeObject(forKey: key) }
    }

    /// Ratchet states left behind by contacts that are no longer in the contact file, too.
    func removeAllRatchetStates() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let items = result as? [[String: Any]] else { return }
        for account in items.compactMap({ $0[kSecAttrAccount as String] as? String })
        where account.hasPrefix("ratchet_state_") {
            removeData(account)
        }
    }
}

/// Keeps the app's files out of iCloud and iTunes backups. The flag on `Library` and `Documents`
/// covers what is inside; a file replaced by an atomic write gets it again with `mark`.
enum BackupExclusion {
    static func apply() {
        let manager = FileManager.default
        for directory in [FileManager.SearchPathDirectory.libraryDirectory, .documentDirectory] {
            mark(manager.urls(for: directory, in: .userDomainMask)[0])
        }
        mark(manager.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Preferences"))
    }

    static func mark(_ url: URL) {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var target = url
        try? target.setResourceValues(values)
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
