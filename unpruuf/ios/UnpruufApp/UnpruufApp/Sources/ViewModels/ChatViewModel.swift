import Foundation
import UIKit
import UnpruufCore

/// Holds the contact + actions only — `ChatView` observes `env.messageStore` directly (as
/// `@ObservedObject`) for the actual message list, for the same reason
/// `ContactListViewModel` doesn't expose `contacts` itself: a computed property over a *nested*
/// `ObservableObject` never fires this class's own `objectWillChange`.
@MainActor
final class ChatViewModel {
    let contact: Contact
    private let env: AppEnvironment

    init(contact: Contact, env: AppEnvironment) {
        self.contact = contact
        self.env = env
        env.messageStore.clearUnread(contact.id)
    }

    func send(text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let messageId = UUID().uuidString
        env.messageStore.addMessage(contact.id, RamMessage(
            id: messageId, senderId: "self", content: Data(trimmed.utf8),
            timestamp: Date(), isOutgoing: true, type: .text
        ))
        Task {
            await env.relayService.sendMessage(to: contact.id, plaintext: MessagePayload.encodeText(trimmed), messageId: messageId)
        }
    }

    /// Sends a camera photo. The image is re-encoded first (see `ImagePreparer`) — that strips
    /// EXIF/GPS and bounds the size, both of which matter before anything leaves the device.
    ///
    /// The local copy added to the message store is the *prepared* JPEG, not the original, so what
    /// the sender sees in their own chat is exactly what the recipient will get — including the
    /// downscaling. Showing the pristine original locally would quietly misrepresent what was sent.
    ///
    /// Returns an error string to display, or nil on success. Deliberately not a thrown error:
    /// every failure here is something to tell the user in the chat, not an exceptional condition
    /// for the caller to handle structurally.
    @discardableResult
    func sendImage(_ image: UIImage) -> String? {
        guard let jpeg = ImagePreparer.prepareJPEG(from: image) else {
            return "Couldn't process that photo."
        }
        let payload: Data
        do {
            payload = try MessagePayload.encodeAttachment(name: "Photo.jpg", bytes: jpeg, isImage: true)
        } catch {
            return "Couldn't prepare that photo for sending."
        }

        let messageId = UUID().uuidString
        env.messageStore.addMessage(contact.id, RamMessage(
            id: messageId, senderId: "self", content: jpeg,
            timestamp: Date(), isOutgoing: true, type: .image, fileName: "Photo.jpg"
        ))
        Task {
            await env.relayService.sendMessage(to: contact.id, plaintext: payload, messageId: messageId)
        }
        return nil
    }

    func revoke() {
        Task { await env.relayService.sendControlSignal(ControlSignals.revoke, to: contact.id) }
        env.messageStore.zeroizeContact(contact.id)
    }

    /// "Send updated connection info" — this app's equivalent of the Android Pro chat screen's
    /// sync button (see `P2PNetworkManager.sendMainOnionUpdate`), adapted to cross-platform mode:
    /// rotates my identity towards this contact instead of announcing a new onion.
    func wechsel(newRelayConnectionString: String?) {
        Task { await env.relayService.wechsel(contactId: contact.id, newRelayConnectionString: newRelayConnectionString) }
    }

    func displayText(for message: RamMessage) -> String {
        switch message.type {
        case .text: return String(data: message.content, encoding: .utf8) ?? "[error]"
        case .file: return "📎 \(message.fileName ?? "File") (\(message.content.count / 1024) KB)"
        case .image: return "🖼 \(message.fileName ?? "Photo")"
        }
    }
}
