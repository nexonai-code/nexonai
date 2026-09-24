import Foundation
import Combine

enum MessageType: String, Codable {
    case text, file, image
}

struct RamMessage: Identifiable, Equatable {
    let id: String
    let senderId: String // contact's id, or "self"
    let content: Data
    let timestamp: Date
    let isOutgoing: Bool
    let type: MessageType
    var fileName: String?
    /// Set once the recipient's ACK/relay-fetch confirms delivery — mirrors the Android app's
    /// `deliveredIds` checkmark state.
    var delivered: Bool = false
    /// Non-nil when the message could not even be queued for delivery (see
    /// `RelayService.sendMessage`'s catch). Without this an unsendable message sat on "Sending…"
    /// forever with no explanation — which is exactly how the Double Ratchet's one-time
    /// "the non-initiator side must receive before it can send" bootstrap presented itself on real
    /// hardware: indistinguishable from a network problem.
    var failureReason: String? = nil
}

/// RAM-only message store — cleared on app termination, nothing ever touches disk. Mirrors the
/// Android app's `InMemoryMessageStore.kt`; this is the same architectural pillar (message
/// content never persisted) carried over to iOS.
@MainActor
final class InMemoryMessageStore: ObservableObject {
    @Published private(set) var messagesByContact: [String: [RamMessage]] = [:]
    @Published private(set) var unreadContactIds: Set<String> = []

    // Messages live at most 5 minutes in RAM while the app is open — same figure and same
    // periodic-sweep shape as Android's `InMemoryMessageStore.kt` (`MESSAGE_TTL_MS`,
    // `SWEEP_INTERVAL_MS`), a `while(isActive) { delay(...); expireOldMessages() }` coroutine
    // loop there, a `Task` loop here.
    private static let messageTTL: TimeInterval = 5 * 60
    private static let sweepInterval: TimeInterval = 15
    private var sweepTask: Task<Void, Never>?

    init() {
        sweepTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(Self.sweepInterval * 1_000_000_000))
                guard let self else { return }
                await self.expireOldMessages()
            }
        }
    }

    deinit {
        sweepTask?.cancel()
    }

    // Drops (doesn't attempt an in-place zero-fill — see `zeroizeContact()`'s own doc comment on
    // why that's not a meaningful guarantee for Swift's copy-on-write `Data`) every message older
    // than the TTL. Mirrors Android's `expireOldMessages()` exactly in shape: partition each
    // contact's list into expired/kept, drop empty contact entries, only republish `@Published`
    // state if something actually changed.
    private func expireOldMessages() {
        let cutoff = Date().addingTimeInterval(-Self.messageTTL)
        var changed = false
        var next: [String: [RamMessage]] = [:]
        for (contactId, list) in messagesByContact {
            let kept = list.filter { $0.timestamp >= cutoff }
            if kept.count != list.count { changed = true }
            if !kept.isEmpty { next[contactId] = kept }
        }
        if changed { messagesByContact = next }
    }

    func addMessage(_ contactId: String, _ message: RamMessage) {
        messagesByContact[contactId, default: []].append(message)
    }

    func markDelivered(contactId: String, messageId: String) {
        guard var list = messagesByContact[contactId] else { return }
        guard let idx = list.firstIndex(where: { $0.id == messageId }) else { return }
        list[idx].delivered = true
        list[idx].failureReason = nil
        messagesByContact[contactId] = list
    }

    /// Marks an outgoing message as un-sendable, with a reason the chat shows in place of
    /// "Sending…". Only for failures that happen *before* the delivery queue — anything already
    /// queued keeps retrying and stays "Sending…" legitimately.
    func markFailed(contactId: String, messageId: String, reason: String) {
        guard var list = messagesByContact[contactId] else { return }
        guard let idx = list.firstIndex(where: { $0.id == messageId }) else { return }
        list[idx].failureReason = reason
        messagesByContact[contactId] = list
    }

    func markUnread(_ contactId: String) {
        unreadContactIds.insert(contactId)
    }

    func clearUnread(_ contactId: String) {
        unreadContactIds.remove(contactId)
    }

    /// Zeroizes and drops all messages for a contact (revoke/delete). Swift's `Data`/arrays don't
    /// guarantee an in-place zero-and-free the way a manual zeroize does on the JVM side, but
    /// dropping every reference immediately still removes it from any *live* memory the app itself
    /// can reach — same best-effort guarantee documented in `SECURITY_CLAIMS.md`.
    func zeroizeContact(_ contactId: String) {
        messagesByContact[contactId] = nil
        unreadContactIds.remove(contactId)
    }

    func wipeAll() {
        messagesByContact.removeAll()
        unreadContactIds.removeAll()
    }
}
