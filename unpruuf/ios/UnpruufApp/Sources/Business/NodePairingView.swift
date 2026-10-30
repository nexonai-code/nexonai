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
                    Section(L.t("Noduri din lista", "Nodes from list")) {
                        Picker(L.t("Listă", "List"), selection: $selectedListId) {
                            Text(L.t("Alege", "Choose")).tag(String?.none)
                            ForEach(lists, id: \.id) { Text($0.name).tag(String?.some($0.id)) }
                        }
                        .onChange(of: selectedListId) { id in
                            if let id { flow.selectList(id: id) }
                            myCode = flow.myCode()
                        }
                    }
                }
                if let myCode {
                    Section(L.t("Codul meu", "My code")) {
                        QRCodeImage(text: myCode.toJSON())
                            .frame(maxWidth: 260, maxHeight: 260)
                            .frame(maxWidth: .infinity)
                        Button(L.t("Copiază codul", "Copy the code")) { SensitiveClipboard.copy(myCode.toJSON()) }
                    }
                }
                Section(L.t("Contact", "Contact")) {
                    TextField(L.t("Nume", "Name"), text: $name)
                        .noKeyboardLearning()
                    if QRScanner.isSupported {
                        Button(L.t("Scanează codul lor", "Scan their code")) { showScanner = true }
                            .disabled(trimmedName.isEmpty)
                    }
                }
                Section(L.t("…sau lipește codul lor", "…or paste their code")) {
                    TextEditor(text: $pasted)
                        .frame(minHeight: 90)
                        .font(.system(.footnote, design: .monospaced))
                        .codeInput()
                    Button(L.t("Adaugă", "Add")) { take(pasted) }
                        .disabled(pasted.isEmpty || trimmedName.isEmpty)
                }
                if let errorText {
                    Text(errorText).foregroundStyle(.red)
                }
            }
            .navigationTitle(L.t("Adaugă contact", "Add contact"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L.t("Închide", "Close")) { dismiss() }
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
            errorText = L.t("Acesta nu este un cod de asociere valid.", "This is not a valid pairing code.")
            return
        }
        switch flow.handle(payload: payload, displayName: trimmedName) {
        case .added:
            errorText = nil
            name = ""
            pasted = ""
            dismiss()
        case .alreadyContact(let existing):
            errorText = L.t("\(existing) este deja contact.", "\(existing) is already a contact.")
        case .keyChanged:
            errorText = L.t("Cheia acestui contact s-a schimbat. Nu a fost adăugat.", "This contact's key has changed. It was not added.")
        case .refusedEdition(let edition):
            errorText = NodeMeshEdition.isGroup(edition)
                ? L.t("Acesta este un cod Pro Groups și poate fi adăugat doar în aplicația Pro Groups.", "This is a Pro Groups code, it can only be added in the Pro Groups app.")
                : L.t("Acesta este un cod de raportare și nu poate fi adăugat aici.", "This is a reporting code, it can't be added here.")
        case .guestInvitationNeedsClient:
            errorText = L.t("Această invitație poate fi acceptată doar în aplicația gratuită Client.", "This invitation can only be accepted in the free Client app.")
        case .guestAnswerNotSupported:
            errorText = L.t("Invitațiile pentru oaspeți nu sunt încă disponibile pe iOS.", "Guest invitations are not available on iOS yet.")
        case .invalidCode:
            errorText = L.t("Acesta nu este un cod de asociere valid.", "This is not a valid pairing code.")
        case .ownNodeFirst:
            errorText = L.t("Adaugă mai întâi un nod propriu.", "Add a node of your own first.")
        case .chooseList:
            errorText = L.t("Alege mai întâi o listă.", "Choose a list first.")
        case .codeUsed:
            errorText = L.t("Acest cod a fost deja folosit. Deschide din nou ecranul pentru un cod nou.", "This code was already used. Open this screen again for a new one.")
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
                Section(L.t("Număr de siguranță", "Safety number")) {
                    Text(contact.safetyNumber)
                        .font(.system(.title2, design: .monospaced))
                    Text(L.t("Comparați numărul pe un alt canal, de exemplu la telefon.", "Compare it over another channel, for example a call."))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section {
                    if contact.isVerified {
                        Label(L.t("Verificat", "Verified"), systemImage: "checkmark.seal")
                    } else {
                        TextField(L.t("Codul citit de contact", "Code they read you"), text: $entered)
                            .noKeyboardLearning()
                            .keyboardType(.numberPad)
                        Button(L.t("Salvează", "Save")) { verify(contact) }
                        if mismatch {
                            Text(L.t("Codul nu se potrivește.", "The code does not match.")).foregroundStyle(.red)
                        }
                    }
                }
                Section {
                    Button(L.t("Șterge contactul", "Delete contact"), role: .destructive) { confirmDelete = true }
                } footer: {
                    Text(L.t("Contactul este anunțat și dispare și de pe telefonul lui.", "The contact is told and disappears from their phone too."))
                }
            }
        }
        .navigationTitle(contact?.displayName ?? "")
        .confirmationDialog(L.t("Ștergi contactul?", "Delete this contact?"), isPresented: $confirmDelete) {
            Button(L.t("Șterge", "Delete"), role: .destructive) {
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
