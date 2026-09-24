import SwiftUI

struct ContactListView: View {
    @ObservedObject var env: AppEnvironment
    // Observed directly (not via a view model computed property) so SwiftUI actually re-renders
    // when they change — see ContactListViewModel's doc comment for why.
    @ObservedObject var contactStore: ContactStore
    @ObservedObject var messageStore: InMemoryMessageStore
    private let viewModel: ContactListViewModel

    @State private var showPairing = false
    @State private var showSettings = false
    @State private var renamingContact: Contact?
    @State private var renameText = ""
    @State private var verifyingContact: Contact?
    /// Drives the delete confirmation below — swipe-to-delete no longer deletes immediately, it
    /// asks first whether to also keep the contact's relay address (see `ArchivedRelayStore`).
    @State private var contactPendingDeletion: Contact?

    init(env: AppEnvironment) {
        self.env = env
        self.contactStore = env.contactStore
        self.messageStore = env.messageStore
        self.viewModel = ContactListViewModel(env: env)
    }

    private var contacts: [Contact] { contactStore.contacts.sorted { $0.displayName < $1.displayName } }

    var body: some View {
        NavigationStack {
            List {
                if contacts.isEmpty {
                    ContentUnavailableView(
                        "No contacts yet",
                        systemImage: "person.badge.plus",
                        description: Text("Tap + to pair with someone.")
                    )
                }
                ForEach(contacts) { contact in
                    NavigationLink(value: contact) {
                        HStack {
                            Circle()
                                .fill(Color.accentColor.opacity(0.2))
                                .frame(width: 36, height: 36)
                                .overlay(Text(String(contact.displayName.prefix(1))).font(.headline))
                            VStack(alignment: .leading) {
                                Text(contact.displayName)
                                Text("cross-platform").font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if messageStore.unreadContactIds.contains(contact.id) {
                                Circle().fill(Color.accentColor).frame(width: 8, height: 8)
                            }
                        }
                    }
                    .swipeActions {
                        Button(role: .destructive) { contactPendingDeletion = contact } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        Button {
                            renamingContact = contact
                            renameText = contact.displayName
                        } label: {
                            Label("Rename", systemImage: "pencil")
                        }
                        .tint(.blue)
                    }
                    // Safety-number verification (see ContactDetailView) — leading edge, since
                    // it's a non-destructive, positive action, matching the trailing/destructive
                    // split iOS conventionally uses (e.g. Mail's flag-on-leading, delete-on-trailing).
                    .swipeActions(edge: .leading) {
                        Button { verifyingContact = contact } label: {
                            Label(
                                contact.isVerified ? "Verified" : "Verify",
                                systemImage: contact.isVerified ? "checkmark.shield.fill" : "shield"
                            )
                        }
                        .tint(contact.isVerified ? .green : .gray)
                    }
                }
            }
            .navigationDestination(for: Contact.self) { contact in
                ChatView(
                    viewModel: ChatViewModel(contact: contact, env: env),
                    messageStore: env.messageStore,
                    torController: env.torController
                )
            }
            .navigationTitle("unpruuf")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { showSettings = true } label: { Image(systemName: "gearshape") }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 12) {
                        // Trailing on every screen, not just this one — see TorStatusLight's own
                        // doc comment for why: a chat's leading slot is the back button, so
                        // trailing is the one corner every screen actually has in common.
                        TorStatusLight(torController: env.torController)
                        Button { showPairing = true } label: { Image(systemName: "plus") }
                    }
                }
            }
            .sheet(isPresented: $showPairing) { PairingView(env: env) }
            .sheet(isPresented: $showSettings) { SettingsView(env: env) }
            .sheet(item: $verifyingContact) { contact in
                NavigationStack {
                    ContactDetailView(env: env, contactId: contact.id)
                }
            }
            .alert("Rename contact", isPresented: Binding(get: { renamingContact != nil }, set: { if !$0 { renamingContact = nil } })) {
                TextField("Name", text: $renameText)
                Button("Save") {
                    if let contact = renamingContact { viewModel.rename(contact, to: renameText) }
                    renamingContact = nil
                }
                Button("Cancel", role: .cancel) { renamingContact = nil }
            }
            // Asks the "keep their relay?" question before anything is actually deleted — see
            // ArchivedRelayStore's doc comment for what "keep" means (a reference address, not a
            // shortcut back into a live contact) and ContactListViewModel.remove for what happens
            // to the relationship itself either way (always ends it, always notifies them).
            .confirmationDialog(
                "Delete \(contactPendingDeletion?.displayName ?? "this contact")?",
                isPresented: Binding(get: { contactPendingDeletion != nil }, set: { if !$0 { contactPendingDeletion = nil } }),
                titleVisibility: .visible
            ) {
                Button("Delete Contact & Relay", role: .destructive) {
                    if let contact = contactPendingDeletion { Task { await viewModel.remove(contact, keepRelay: false) } }
                    contactPendingDeletion = nil
                }
                Button("Delete Contact, Keep Relay for Later") {
                    if let contact = contactPendingDeletion { Task { await viewModel.remove(contact, keepRelay: true) } }
                    contactPendingDeletion = nil
                }
                Button("Cancel", role: .cancel) { contactPendingDeletion = nil }
            } message: {
                Text("This ends the conversation and can't be undone. \"Keep Relay\" saves their relay address under Settings → Archived relays, in case they come back — it does not keep the conversation or let you message them again without re-pairing.")
            }
        }
    }
}
