import Combine
import Foundation
import UnpruufCore

/// Port of the Android app's `ContactDetailViewModel.kt`.
@MainActor
final class ContactDetailViewModel: ObservableObject {
    @Published private(set) var contact: Contact?
    // My own safety number for `contact` — derived, so it recomputes whenever `contact` does.
    @Published private(set) var mySafetyNumber: String?
    // nil = no attempt yet, true = last entered code matched, false = it didn't.
    @Published var verifyResult: Bool?

    private let env: AppEnvironment

    init(env: AppEnvironment, contactId: String) {
        self.env = env
        self.contact = env.contactStore.get(id: contactId)
        if let contact {
            mySafetyNumber = env.identity.safetyNumber(theirX25519RatchetPublicKeyBase64: contact.x25519RatchetPublicKeyBase64)
        }
    }

    /// Compares [enteredCode] — whatever the user typed after the contact read THEIR copy of
    /// [mySafetyNumber] aloud — against this device's own computed code. Only persists
    /// `isVerified` on a match; a mismatch is surfaced but never silently saved, since silently
    /// marking a non-matching contact "verified" would defeat the entire point.
    func verify(enteredCode: String) {
        guard let expected = mySafetyNumber, let contact else { return }
        let matches = normalize(enteredCode) == normalize(expected)
        verifyResult = matches
        if matches {
            env.contactStore.setVerified(id: contact.id, verified: true)
            self.contact = env.contactStore.get(id: contact.id)
        }
    }

    /// Clears any prior match/mismatch banner — called as the user edits the field again, so a
    /// stale "codes don't match" doesn't linger next to a code they haven't re-submitted yet.
    func clearVerifyResult() {
        verifyResult = nil
    }

    private func normalize(_ code: String) -> String {
        code.filter(\.isNumber)
    }
}
