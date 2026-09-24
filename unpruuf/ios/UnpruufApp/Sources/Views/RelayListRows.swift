import SwiftUI

/// One editable row for one of my own relay slots, in Settings → "My relays". Also carries an
/// optional local label (e.g. "Mac at home") so two of my own relays don't look identical.
///
/// **Why `@State` is initialized from a constructor parameter, not read live from `AppEnvironment`
/// on every render:** typing needs to survive the parent view's own re-renders (which happen on
/// every unrelated `@Published` change elsewhere in `AppEnvironment`) without being clobbered mid-
/// edit. The `.id(...)` the call site attaches — keyed to the *current stored* address and label —
/// is what makes this safe: as long as nothing external changes those values, SwiftUI keeps this
/// row's identity (and therefore its `@State`) stable across re-renders. If a Save from this same
/// row, or the "Import" button elsewhere in Settings, changes the stored value, the id changes and
/// SwiftUI remounts the row fresh from the new value — exactly once, not on every keystroke.
struct MyRelayRow: View {
    let placeholder: String
    let initialAddress: String
    let initialLabel: String
    let canDelete: Bool
    let onSave: (_ address: String, _ label: String) -> Void
    let onDelete: () -> Void

    @State private var address: String
    @State private var label: String
    @State private var showDeleteConfirm = false

    init(
        placeholder: String, initialAddress: String, initialLabel: String, canDelete: Bool,
        onSave: @escaping (String, String) -> Void, onDelete: @escaping () -> Void
    ) {
        self.placeholder = placeholder
        self.initialAddress = initialAddress
        self.initialLabel = initialLabel
        self.canDelete = canDelete
        self.onSave = onSave
        self.onDelete = onDelete
        _address = State(initialValue: initialAddress)
        _label = State(initialValue: initialLabel)
    }

    private var trimmedAddress: String { address.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedLabel: String { label.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var isUnchanged: Bool { trimmedAddress == initialAddress && trimmedLabel == initialLabel }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("Label (optional, e.g. \"Mac at home\")", text: $label)
                .font(.footnote)
            TextField(placeholder, text: $address, axis: .vertical)
                .font(.system(.footnote, design: .monospaced))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            HStack {
                Button("Save") { onSave(trimmedAddress, trimmedLabel) }
                    .disabled(trimmedAddress.isEmpty || isUnchanged)
                Spacer()
                if canDelete {
                    Button("Delete", role: .destructive) { showDeleteConfirm = true }
                }
            }
        }
        .confirmationDialog("Delete this relay?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Delete", role: .destructive, action: onDelete)
        }
    }
}

/// One editable row for one relay address belonging to a specific contact, in Settings →
/// "Contacts' relays". Same identity/`@State` reasoning as `MyRelayRow` — see its doc comment.
struct ContactRelayRow: View {
    let contactName: String
    let initialAddress: String
    /// Drives the confirmation wording: deleting a contact's only relay makes them unreachable
    /// until a new address is added or they're re-paired, which is worth saying plainly rather
    /// than treating it as an ordinary delete.
    let isOnlyRelayForContact: Bool
    let onSave: (String) -> Void
    let onDelete: () -> Void

    @State private var address: String
    @State private var showDeleteConfirm = false

    init(
        contactName: String, initialAddress: String, isOnlyRelayForContact: Bool,
        onSave: @escaping (String) -> Void, onDelete: @escaping () -> Void
    ) {
        self.contactName = contactName
        self.initialAddress = initialAddress
        self.isOnlyRelayForContact = isOnlyRelayForContact
        self.onSave = onSave
        self.onDelete = onDelete
        _address = State(initialValue: initialAddress)
    }

    private var trimmedAddress: String { address.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("unpruuf-relay:v1:...", text: $address, axis: .vertical)
                .font(.system(.footnote, design: .monospaced))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            HStack {
                Button("Save") { onSave(trimmedAddress) }
                    .disabled(trimmedAddress.isEmpty || trimmedAddress == initialAddress)
                Spacer()
                Button("Delete", role: .destructive) { showDeleteConfirm = true }
            }
        }
        .confirmationDialog(
            isOnlyRelayForContact
                ? "This is \(contactName)'s only relay. Deleting it means they can't reach you until you add a new one or re-pair."
                : "Delete this relay for \(contactName)?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive, action: onDelete)
        }
    }
}

/// The always-empty row offered to add a second relay for a contact who currently has only one
/// (`theirRelayConnectionStrings.count < RelayConnectionString.maxPoolSize`) — the "a new empty
/// row appears once the current one has something in it" pattern, scoped per contact rather than
/// globally, since a contact's relay can only ever be added *for that specific contact*.
struct AddContactRelayRow: View {
    let contactName: String
    let onSave: (String) -> Void

    @State private var address = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("Add a backup relay for \(contactName) (optional)", text: $address, axis: .vertical)
                .font(.system(.footnote, design: .monospaced))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            Button("Save") {
                let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return }
                onSave(trimmed)
                address = ""
            }
            .disabled(address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }
}
