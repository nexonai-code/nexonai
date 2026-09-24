import Combine
import Foundation
import UnpruufCore

@MainActor
final class PairingViewModel: ObservableObject {
    @Published var myQrJSON: String?
    @Published var errorMessage: String?
    @Published var successMessage: String?

    private let env: AppEnvironment

    init(env: AppEnvironment) {
        self.env = env
        refreshMyQrPayload()
    }

    /// Regenerates my own QR payload — call whenever the default relay setting changes, since the
    /// QR always advertises the *current* relay (mirrors Android's "wait for a real onion before
    /// showing the QR" pattern, just for "has a relay been configured yet" instead).
    func refreshMyQrPayload() {
        guard !env.myRelayPool.isEmpty else {
            myQrJSON = nil
            return
        }
        let payload = PairingPayload(
            userId: env.identity.userId,
            messageKeyBase64: env.identity.myMessageKey.base64EncodedString(),
            x25519RatchetPublicKeyBase64: env.identity.myX25519RatchetPublicKeyBase64,
            relayConnectionStrings: env.myRelayPool
        )
        myQrJSON = payload.toJSON()
    }

    /// Handles a scanned QR (or pasted JSON) from a contact. Cross-platform mode has no
    /// onion-address concept to validate, only that at least one relay connection string parses.
    func handleScanned(json: String, displayName: String) {
        guard let payload = PairingPayload.fromJSON(json) else {
            errorMessage = "Couldn't read this code. Make sure both devices are on a compatible version and scan again."
            return
        }
        guard payload.relayConnectionStrings.contains(where: { RelayConnectionString.parse($0) != nil }) else {
            errorMessage = "This contact's relay connection info looks invalid."
            return
        }
        guard payload.userId != env.identity.userId else {
            errorMessage = "That's your own QR code — ask your contact to show theirs."
            return
        }
        // Real bug found on real hardware, 2026‑08‑29: pairing was allowed even with no relay of
        // my own configured — `PairingView` hides the QR in that case but leaves the scan/paste
        // buttons active. The resulting contact gets an EMPTY `myRelayConnectionStrings`, which
        // `RelayService.pollOnce` then iterates over zero times: that contact can never receive
        // anything, permanently and silently, while sending to them keeps working normally (it
        // uses *their* pool, not mine). Refuse to create such a contact at all.
        guard !env.myRelayPool.isEmpty else {
            errorMessage = "Set your own relay in Settings first — without it, your contact's messages would have nowhere to reach you."
            return
        }

        let contact = Contact(
            id: payload.userId,
            displayName: displayName,
            messageKeyBase64: payload.messageKeyBase64,
            x25519RatchetPublicKeyBase64: payload.x25519RatchetPublicKeyBase64,
            theirRelayConnectionStrings: payload.relayConnectionStrings,
            myRelayConnectionStrings: env.myRelayPool
        )
        env.contactStore.add(contact)
        do {
            // The Double Ratchet's bootstrap is deliberately asymmetric: `createSession` gives
            // exactly one of the two devices a sending chain up front, and the other one can't
            // send until it has decrypted an inbound message (see `DoubleRatchet.initReceiver`'s
            // doc comment — correct protocol behaviour, and unavoidable: making both sides
            // initiators would have them derive the *same* sending chain and reuse message keys).
            // Which side gets which role is decided by a key comparison, so it's effectively
            // arbitrary from the user's point of view — telling them up front is the difference
            // between "this app is broken" and "I'll wait for their message". Confirmed on real
            // hardware: without this, the first message from the receiver side just sat on
            // "Sending…" indefinitely with no explanation anywhere.
            let state = try env.relayService.createSession(for: contact)
            successMessage = state.sendChainKey == nil
                ? "\(displayName) added.\n\nAsk \(displayName) to send the first message — for encryption reasons this device can't open the conversation. That applies to the first message only; afterwards both of you can write freely."
                : "\(displayName) added."
        } catch {
            errorMessage = "Paired, but couldn't start the secure session. Try re-scanning."
        }
    }

    func clearError() { errorMessage = nil }
    func clearSuccess() { successMessage = nil }
}
