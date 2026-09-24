import Combine
import Foundation
import UnpruufCore

/// Holds actions only — `ContactListView` observes `env.contactStore`/`env.messageStore` directly
/// (as `@ObservedObject`) for its data, since those are the actual `@Published` sources of truth.
/// A view model with only computed properties over a *nested* `ObservableObject` would never
/// itself fire `objectWillChange` (a real SwiftUI gotcha this deliberately avoids), so this class
/// intentionally holds no `contacts`/`hasUnread` accessors — see `ContactListView`.
@MainActor
final class ContactListViewModel {
    private let env: AppEnvironment

    init(env: AppEnvironment) {
        self.env = env
    }

    /// [keepRelay] archives the contact's relay address(es) into `ArchivedRelayStore` before the
    /// contact itself is deleted, for "delete this person but I might want their relay address if
    /// they come back" — see that store's doc comment for why this preserves only the address,
    /// not a shortcut back into a live contact. `ContactListView`'s delete confirmation is what
    /// actually asks the question this parameter answers.
    ///
    /// **Must `await` the signal send before removing the contact locally — order matters.**
    /// Real bug found on real hardware: this used to fire the send as an un-awaited `Task` and
    /// then immediately call `contactStore.remove`. Since both run on the main actor, the
    /// synchronous removal completed before the spawned Task ever got a chance to run, so by the
    /// time `sendControlSignal` actually executed, the contact was already gone from
    /// `contactStore` — its own lookup guard failed silently, and the "delete contact" signal was
    /// never sent at all. The other side's copy of the contact was left behind indefinitely.
    func remove(_ contact: Contact, keepRelay: Bool) async {
        if keepRelay {
            for relay in contact.theirRelayConnectionStrings {
                env.archivedRelayStore.archive(label: contact.displayName, connectionString: relay)
            }
        }
        await env.relayService.sendControlSignal(ControlSignals.deleteContact, to: contact.id)
        env.messageStore.zeroizeContact(contact.id)
        env.contactStore.remove(id: contact.id)
    }

    func rename(_ contact: Contact, to newName: String) {
        env.contactStore.rename(id: contact.id, to: newName.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}
