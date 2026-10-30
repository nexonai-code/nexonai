import SwiftUI
import UnpruufCore

/// Home of unpruuf Business. For now the node lists; chats and pairing come with the next packages.
struct BusinessHomeView: View {
    @ObservedObject var env: AppEnvironment
    @ObservedObject private var torController: TorController
    @ObservedObject private var messageStore: InMemoryMessageStore
    @StateObject private var model: NodeListsModel
    @State private var showImport = false
    @State private var showPairing = false
    @State private var contacts: [NodeMeshContact] = []
    @State private var serverToUnlock: NodeMeshStore.LockedServer?
    @State private var unlockFailed = false

    init(env: AppEnvironment) {
        self.env = env
        self.torController = env.torController
        self.messageStore = env.messageStore
        _model = StateObject(wrappedValue: NodeListsModel(store: env.nodeMeshStore, client: env.nodeMeshClient))
    }

    var body: some View {
        NavigationStack {
            List {
                if model.isUnreadable {
                    Text(L.t("Lista de noduri nu poate fi citită pe acest telefon. Rămâne neatinsă.",
                             "The node list cannot be read on this phone. It is left untouched."))
                        .foregroundStyle(.red)
                }
                ForEach(model.lockedServers, id: \.sourceAddress) { server in
                    Section(L.t("Server blocat", "Server locked")) {
                        Text(L.t("Serverul a repornit. Deblochează-l doar dacă este al tău. Dacă ai dubii, configurează un server nou.",
                                 "The server restarted. Unlock it only if it is yours. If in doubt, set up a new server."))
                            .font(.footnote)
                        Button(L.t("Deblochează", "Unlock")) { serverToUnlock = server }
                    }
                }
                Section(L.t("Contacte", "Contacts")) {
                    if contacts.isEmpty {
                        Text(L.t("Încă nu există contacte.", "No contacts yet."))
                            .foregroundStyle(.secondary)
                    }
                    ForEach(contacts) { contact in
                        NavigationLink {
                            NodeChatView(env: env, contactId: contact.id)
                        } label: {
                            HStack {
                                Text(contact.displayName)
                                if messageStore.unreadContactIds.contains(contact.id) {
                                    Spacer()
                                    Circle().fill(Color.accentColor).frame(width: 10, height: 10)
                                        .accessibilityLabel(L.t("Necitit", "Unread"))
                                }
                            }
                        }
                    }
                    Button(L.t("Adaugă contact", "Add contact")) { showPairing = true }
                        .disabled(model.lists.isEmpty)
                }
                Section(L.t("Liste de noduri", "Node lists")) {
                    if model.lists.isEmpty {
                        Text(L.t("Încă nu există noduri. Atinge + și scanează codul serverului tău sau importă lista lui.",
                                 "No nodes yet. Tap + and scan your server's code or import its list."))
                            .foregroundStyle(.secondary)
                    }
                    ForEach(model.lists, id: \.id) { list in
                        NavigationLink {
                            NodeListDetailView(model: model, listId: list.id)
                        } label: {
                            VStack(alignment: .leading) {
                                Text(list.name)
                                Text(summary(list)).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Section {
                    Text(torController.isReady ? L.t("Tor: conectat", "Tor: connected") : L.t("Tor: se conectează…", "Tor: connecting…"))
                    Text(L.t("Neauditat independent.", "Not independently audited."))
                        .foregroundStyle(.secondary)
                    Text(L.t("Mesajele așteaptă pe serverele expeditorului cât a ales acesta (cel mult 24 de ore). Deschide aplicația ca să le primești. Traficul de acoperire rulează doar cât aplicația este deschisă.",
                             "Messages wait on the sender's servers for the lifetime they chose (at most 24 h). Open the app to receive. Cover traffic runs only while the app is open."))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("unpruuf Business")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showImport = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel(L.t("Adaugă noduri", "Add nodes"))
                }
            }
            .refreshable { await model.searchServers() }
            .sheet(isPresented: $showImport) { NodeImportView(model: model) }
            .sheet(isPresented: $showPairing, onDismiss: reloadContacts) {
                NodePairingView(nodes: env.nodeMeshStore, contacts: env.nodeMeshContacts, lists: model.lists)
            }
            .onAppear(perform: reloadContacts)
            .confirmationDialog(L.t("Deblochezi serverul?", "Unlock this server?"),
                                isPresented: Binding(get: { serverToUnlock != nil }, set: { if !$0 { serverToUnlock = nil } }),
                                presenting: serverToUnlock) { server in
                Button(L.t("Deblochează", "Unlock")) {
                    Task { unlockFailed = await !model.unlock(server) }
                }
            } message: { server in
                Text(L.t("Cheia de scriere pleacă la acest server. \(server.nodeCount) noduri.",
                         "This sends the write key to the server. \(server.nodeCount) nodes."))
            }
            .alert(L.t("Deblocarea nu a reușit.", "Unlocking failed."), isPresented: $unlockFailed) {
                Button("OK", role: .cancel) {}
            }
        }
        .task(id: torController.isReady) {
            if torController.isReady { await model.searchServers() }
        }
    }

    private func reloadContacts() {
        contacts = env.nodeMeshContacts.contacts.sorted { $0.displayName < $1.displayName }
    }

    private func summary(_ list: NodeList) -> String {
        L.t("Noduri: \(list.addresses.count) · Servere: \(model.serverCount(list))",
            "Nodes: \(list.addresses.count) · Servers: \(model.serverCount(list))")
    }
}

struct NodeListDetailView: View {
    @ObservedObject var model: NodeListsModel
    let listId: String
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var confirmDelete = false

    private var list: NodeList? { model.lists.first { $0.id == listId } }

    var body: some View {
        Form {
            if let list {
                Section(L.t("Nume", "Name")) {
                    TextField(L.t("Nume", "Name"), text: $name)
                        .onSubmit { model.rename(list, to: name) }
                }
                Section {
                    LabeledContent(L.t("Noduri", "Nodes"), value: "\(list.addresses.count)")
                    LabeledContent(L.t("Servere", "Servers"), value: "\(model.serverCount(list))")
                }
                Section {
                    Button(L.t("Șterge lista", "Delete list"), role: .destructive) { confirmDelete = true }
                } footer: {
                    Text(L.t("Nodurile dispar de pe acest telefon. Serverele nu se schimbă.",
                             "The nodes leave this phone. The servers do not change."))
                }
            }
        }
        .navigationTitle(list?.name ?? "")
        .onAppear { name = list?.name ?? "" }
        .onDisappear { if let list { model.rename(list, to: name) } }
        .confirmationDialog(L.t("Ștergi lista?", "Delete this list?"), isPresented: $confirmDelete) {
            Button(L.t("Șterge", "Delete"), role: .destructive) {
                if let list { model.delete(list) }
                dismiss()
            }
        }
    }
}
