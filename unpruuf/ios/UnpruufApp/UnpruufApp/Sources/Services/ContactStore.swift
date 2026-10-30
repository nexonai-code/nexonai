import Foundation
import Combine
import UnpruufCore

/// Contact list persistence: a single AES-256-GCM-encrypted JSON file (key held in Keychain)
/// rather than pulling in SQLCipher-for-iOS as a new binary dependency — contacts are the only
/// thing in this app that needs disk persistence at all (messages stay RAM-only, see
/// `InMemoryMessageStore`, mirroring the Android app's architecture).
@MainActor
final class ContactStore: ObservableObject {
    @Published private(set) var contacts: [Contact] = []
    /// The contact file exists but cannot be read. It is then left alone: nothing is saved over
    /// it, new changes live in memory only, and `RootView` says so.
    @Published private(set) var isUnreadable = false

    private let keychain: KeychainStore
    private let fileURL: URL
    private static let fileKeyName = "contacts_file_key"

    init(keychain: KeychainStore, fileURL: URL? = nil) {
        self.keychain = keychain
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        self.fileURL = fileURL ?? dir.appendingPathComponent("contacts.enc")
        load()
    }

    private func load() {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        guard let encrypted = try? Data(contentsOf: fileURL),
              let key = keychain.fileKey(named: Self.fileKeyName, fileURL: fileURL),
              let decrypted = try? OuterEnvelope.decrypt(data: encrypted, myKey32: key),
              let decoded = try? JSONDecoder().decode([Contact].self, from: decrypted) else {
            isUnreadable = true
            return
        }
        contacts = decoded
    }

    private func persist() {
        guard !isUnreadable,
              let key = keychain.fileKey(named: Self.fileKeyName, fileURL: fileURL),
              let plaintext = try? JSONEncoder().encode(contacts),
              let encrypted = try? OuterEnvelope.encrypt(plaintext: plaintext, contactKey32: key) else { return }
        try? encrypted.write(to: fileURL, options: .atomic)
        BackupExclusion.mark(fileURL)
    }

    func add(_ contact: Contact) {
        contacts.removeAll { $0.id == contact.id }
        contacts.append(contact)
        persist()
        keychain.deleteRatchetState(contactId: contact.id) // re-pairing starts a fresh session
    }

    func remove(id: String) {
        contacts.removeAll { $0.id == id }
        persist()
        keychain.deleteRatchetState(contactId: id)
    }

    func get(id: String) -> Contact? {
        contacts.first { $0.id == id }
    }

    /// Applies a Wechsel update received from a contact: bumps `theirGeneration` and replaces
    /// their relay pool with just this one new address — Wechsel announces a deliberate switch to
    /// a specific relay, not an addition to the existing pool.
    func applyWechsel(contactId: String, newGeneration: Int, newRelayConnectionString: String) {
        guard let idx = contacts.firstIndex(where: { $0.id == contactId }) else { return }
        contacts[idx].theirGeneration = newGeneration
        contacts[idx].theirRelayConnectionStrings = [newRelayConnectionString]
        persist()
    }

    /// Records my own rotation for this contact (after successfully sending `UNPRUUF_WECHSEL_V1`).
    func bumpMyGeneration(contactId: String, newRelayConnectionString: String?) -> Int? {
        guard let idx = contacts.firstIndex(where: { $0.id == contactId }) else { return nil }
        contacts[idx].myGeneration += 1
        if let newRelay = newRelayConnectionString {
            contacts[idx].myRelayConnectionStrings = [newRelay]
        }
        persist()
        return contacts[idx].myGeneration
    }

    /// Manual, local-only correction of one of a contact's relay addresses — from Settings →
    /// "Contacts' relays", NOT the synchronized Wechsel protocol path (`RelayService.wechsel`,
    /// which notifies the contact and bumps a generation counter). This only edits what THIS
    /// device believes their relay is, useful when a contact shared an updated address out of
    /// band. `index == theirRelayConnectionStrings.count` appends a new entry (up to
    /// `RelayConnectionString.maxPoolSize`); any other out-of-range index is a no-op.
    func setTheirRelay(contactId: String, index: Int, address: String) {
        guard let idx = contacts.firstIndex(where: { $0.id == contactId }) else { return }
        var relays = contacts[idx].theirRelayConnectionStrings
        if index >= 0 && index < relays.count {
            relays[index] = address
        } else if index == relays.count && relays.count < RelayConnectionString.maxPoolSize {
            relays.append(address)
        } else {
            return
        }
        contacts[idx].theirRelayConnectionStrings = relays
        persist()
    }

    /// Removes one relay address from a contact's pool. If it was their only one, they become
    /// unreachable until a new address is added or the contact is re-paired — the caller is
    /// expected to have confirmed that with the user first (see `SettingsView`'s confirmation
    /// dialog, which reads specifically stronger when this would be the last remaining address).
    func removeTheirRelay(contactId: String, index: Int) {
        guard let idx = contacts.firstIndex(where: { $0.id == contactId }) else { return }
        var relays = contacts[idx].theirRelayConnectionStrings
        guard index >= 0 && index < relays.count else { return }
        relays.remove(at: index)
        contacts[idx].theirRelayConnectionStrings = relays
        persist()
    }

    func rename(id: String, to newName: String) {
        guard let idx = contacts.firstIndex(where: { $0.id == id }) else { return }
        contacts[idx].displayName = newName
        persist()
    }

    /// Only ever called on a genuine safety-number match — see `ContactDetailViewModel.verify()`.
    /// A mismatch is surfaced to the caller but never persisted here.
    func setVerified(id: String, verified: Bool) {
        guard let idx = contacts.firstIndex(where: { $0.id == id }) else { return }
        contacts[idx].isVerified = verified
        persist()
    }

    /// Full local wipe (mirrors Android's revoke/panic-wipe path).
    func wipeAll() {
        for c in contacts { keychain.deleteRatchetState(contactId: c.id) }
        contacts.removeAll()
        try? FileManager.default.removeItem(at: fileURL)
        keychain.removeData(Self.fileKeyName)
        isUnreadable = false
    }
}
