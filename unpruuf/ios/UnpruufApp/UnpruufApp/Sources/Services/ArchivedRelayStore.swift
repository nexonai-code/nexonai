import Combine
import Foundation

/// One relay address kept after its contact was deleted — see `ArchivedRelayStore`'s doc comment
/// for why this exists as a separate record instead of just leaving the contact around.
struct ArchivedRelay: Codable, Identifiable, Equatable {
    let id: String
    /// The deleted contact's display name at the time of deletion — a snapshot, not a live
    /// reference (the contact itself is gone), so renaming a *different*, later contact can never
    /// retroactively relabel this entry.
    let label: String
    let connectionString: String
    let archivedAt: Date
}

/// Relay addresses deliberately kept when their contact is deleted, in case that person re-pairs
/// later — see `ContactListViewModel.remove`'s "keep their relay" option, which is what actually
/// writes here.
///
/// **Why a separate list rather than just leaving the `Contact` around:** deleting a contact also
/// sends them `ControlSignals.deleteContact` and zeroizes the shared message history — that's the
/// actual "end this relationship" action, and it's still exactly what "Delete Everything" does.
/// This only preserves the one piece of information that's tedious to re-obtain if they *do* come
/// back (their relay address), as a plain reference — not a shortcut back into a live contact.
/// Re-pairing when they return still means scanning a fresh QR: that's what re-establishes the
/// actual cryptographic identity and Double Ratchet session, which nothing here substitutes for.
///
/// Read-only from the outside except for `archive`/`remove`; storage is plain `UserDefaults`
/// (Codable-encoded), the same trust level `AppEnvironment`'s own relay strings already use — not
/// a new, weaker place for this data to live.
@MainActor
final class ArchivedRelayStore: ObservableObject {
    @Published private(set) var entries: [ArchivedRelay] = []

    private let key = "archived_relays"

    init() {
        load()
    }

    /// No-ops if this exact connection string is already archived — re-deleting the same contact
    /// twice (or archiving the same relay from two different old contacts, unlikely but possible)
    /// shouldn't pile up duplicates.
    func archive(label: String, connectionString: String) {
        guard !connectionString.isEmpty, !entries.contains(where: { $0.connectionString == connectionString }) else { return }
        entries.insert(
            ArchivedRelay(id: UUID().uuidString, label: label, connectionString: connectionString, archivedAt: Date()),
            at: 0
        )
        persist()
    }

    func remove(id: String) {
        entries.removeAll { $0.id == id }
        persist()
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(entries) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: key),
              let decoded = try? JSONDecoder().decode([ArchivedRelay].self, from: data) else { return }
        entries = decoded
    }
}
