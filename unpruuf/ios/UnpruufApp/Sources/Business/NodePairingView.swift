import SwiftUI
import UnpruufCore

/// Adding a contact: pick the list the contact's nodes come from, show my code, take theirs.
struct NodePairingView: View {
    let lists: [NodeList]
    @Environment(\.dismiss) private var dismiss
    @State private var flow: NodeMeshPairingFlow
    @State private var selectedListId: String?
    @State private var myCode: NodeMeshPairingPayload?
    @State private var name = ""
    @State private var pasted = ""
    @State private var showScanner = false
    @State private var errorText: String?

    init(nodes: NodeMeshStore, contacts: NodeMeshContactStore, lists: [NodeList]) {
        self.lists = lists
        let flow = NodeMeshPairingFlow(nodes: nodes, contacts: contacts)
        _flow = State(initialValue: flow)
        _selectedListId = State(initialValue: flow.selectedListId)
        _myCode = State(initialValue: flow.myCode())
    }

    var body: some View {
        NavigationStack {
            Form {
                if lists.count > 1 {
                    Section(String(localized: "Nodes from list")) {
                        Picker(String(localized: "List"), selection: $selectedListId) {
                            Text(String(localized: "Choose")).tag(String?.none)
                            ForEach(lists, id: \.id) { Text($0.name).tag(String?.some($0.id)) }
                        }
                        .onChange(of: selectedListId) { id in
                            if let id { flow.selectList(id: id) }
                            myCode = flow.myCode()
                        }
                    }
                }
                if let myCode {
                    Section(String(localized: "My code")) {
                        QRCodeImage(text: myCode.toJSON())
                            .frame(maxWidth: 260, maxHeight: 260)
                            .frame(maxWidth: .infinity)
                        Button(String(localized: "Copy the code")) { SensitiveClipboard.copy(myCode.toJSON()) }
                    }
                }
                Section(String(localized: "Contact")) {
                    TextField(String(localized: "Name"), text: $name)
                        .noKeyboardLearning()
                    if QRScanner.isSupported {
                        Button(String(localized: "Scan their code")) { showScanner = true }
                            .disabled(trimmedName.isEmpty)
                    }
                }
                Section(String(localized: "…or paste their code")) {
                    TextEditor(text: $pasted)
                        .frame(minHeight: 90)
                        .font(.system(.footnote, design: .monospaced))
                        .codeInput()
                    Button(String(localized: "Add")) { take(pasted) }
                        .disabled(pasted.isEmpty || trimmedName.isEmpty)
                }
                if let errorText {
                    Text(errorText).foregroundStyle(.red)
                }
            }
            .navigationTitle(String(localized: "Add contact"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Close")) { dismiss() }
                }
            }
            .sheet(isPresented: $showScanner) {
                QRScannerView { value in
                    showScanner = false
                    take(value)
                }
            }
        }
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func take(_ raw: String) {
        guard let payload = NodeMeshPairingPayload.fromJSON(raw.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            errorText = String(localized: "This is not a valid pairing code.")
            return
        }
        switch flow.handle(payload: payload, displayName: trimmedName) {
        case .added:
            errorText = nil
            name = ""
            pasted = ""
            dismiss()
        case .alreadyContact(let existing):
            errorText = String(localized: "\(existing) is already a contact.")
        case .keyChanged:
            errorText = String(localized: "This contact's key has changed. It was not added.")
        case .refusedEdition(let edition):
            errorText = NodeMeshEdition.isGroup(edition)
                ? String(localized: "This is a Pro Groups code, it can only be added in the Pro Groups app.")
                : String(localized: "This is a reporting code, it can't be added here.")
        case .guestInvitationNeedsClient:
            errorText = String(localized: "This invitation can only be accepted in the free Client app.")
        case .guestAnswerNotSupported:
            errorText = String(localized: "Guest invitations are not available on iOS yet.")
        case .invalidCode:
            errorText = String(localized: "This is not a valid pairing code.")
        case .ownNodeFirst:
            errorText = String(localized: "Add a node of your own first.")
        case .chooseList:
            errorText = String(localized: "Choose a list first.")
        case .codeUsed:
            errorText = String(localized: "This code was already used. Open this screen again for a new one.")
        }
    }
}

/// Safety number and its comparison, and removing the contact.
struct NodeContactDetailView: View {
    let store: NodeMeshContactStore
    let engine: NodeMeshEngine
    let contactId: String
    @Environment(\.dismiss) private var dismiss
    @State private var contact: NodeMeshContact?
    @State private var entered = ""
    @State private var mismatch = false
    @State private var confirmDelete = false

    var body: some View {
        Form {
            if let contact {
                Section(String(localized: "Safety number")) {
                    Text(contact.safetyNumber)
                        .font(.system(.title2, design: .monospaced))
                    Text(String(localized: "Compare it over another channel, for example a call."))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section {
                    if contact.isVerified {
                        Label(String(localized: "Verified"), systemImage: "checkmark.seal")
                    } else {
                        TextField(String(localized: "Code they read you"), text: $entered)
                            .noKeyboardLearning()
                            .keyboardType(.numberPad)
                        Button(String(localized: "Save")) { verify(contact) }
                        if mismatch {
                            Text(String(localized: "The code does not match.")).foregroundStyle(.red)
                        }
                    }
                }
                Section {
                    Button(String(localized: "Delete contact"), role: .destructive) { confirmDelete = true }
                } footer: {
                    Text(String(localized: "The contact is told and disappears from their phone too."))
                }
            }
        }
        .navigationTitle(contact?.displayName ?? "")
        .confirmationDialog(String(localized: "Delete this contact?"), isPresented: $confirmDelete) {
            Button(String(localized: "Delete"), role: .destructive) {
                engine.deleteContact(id: contactId)
                dismiss()
            }
        }
        .onAppear { contact = store.contact(id: contactId) }
    }

    private func verify(_ contact: NodeMeshContact) {
        let digits = { (s: String) in s.filter(\.isNumber) }
        mismatch = digits(entered) != digits(contact.safetyNumber)
        guard !mismatch else { return }
        store.update(id: contactId) { $0.isVerified = true }
        self.contact = store.contact(id: contactId)
    }
}
