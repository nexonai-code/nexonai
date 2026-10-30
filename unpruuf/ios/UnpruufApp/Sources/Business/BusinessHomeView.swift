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
                    Text(String(localized: "The node list cannot be read on this phone. It is left untouched."))
                        .foregroundStyle(.red)
                }
                ForEach(model.lockedServers, id: \.sourceAddress) { server in
                    Section(String(localized: "Server locked")) {
                        Text(String(localized: "The server restarted. Unlock it only if it is yours. If in doubt, set up a new server."))
                            .font(.footnote)
                        Button(String(localized: "Unlock")) { serverToUnlock = server }
                    }
                }
                Section(String(localized: "Contacts")) {
                    if contacts.isEmpty {
                        Text(String(localized: "No contacts yet."))
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
                                        .accessibilityLabel(String(localized: "Unread"))
                                }
                            }
                        }
                    }
                    Button(String(localized: "Add contact")) { showPairing = true }
                        .disabled(model.lists.isEmpty)
                }
                Section(String(localized: "Node lists")) {
                    if model.lists.isEmpty {
                        Text(String(localized: "No nodes yet. Tap + and scan your server's code or import its list."))
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
                    NavigationLink(String(localized: "License")) { LicenseView(store: env.licenseStore) }
                    Text(torController.isReady ? String(localized: "Tor: connected") : String(localized: "Tor: connecting…"))
                    Text(String(localized: "Not independently audited."))
                        .foregroundStyle(.secondary)
                    Text(String(localized: "Messages wait on the sender's servers for the lifetime they chose (at most 24 h). Open the app to receive. Cover traffic runs only while the app is open."))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("unpruuf Business")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showImport = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel(String(localized: "Add nodes"))
                }
            }
            .refreshable { await model.searchServers() }
            .sheet(isPresented: $showImport) { NodeImportView(model: model) }
            .sheet(isPresented: $showPairing, onDismiss: reloadContacts) {
                NodePairingView(nodes: env.nodeMeshStore, contacts: env.nodeMeshContacts, lists: model.lists)
            }
            .onAppear(perform: reloadContacts)
            .confirmationDialog(String(localized: "Unlock this server?"),
                                isPresented: Binding(get: { serverToUnlock != nil }, set: { if !$0 { serverToUnlock = nil } }),
                                presenting: serverToUnlock) { server in
                Button(String(localized: "Unlock")) {
                    Task { unlockFailed = await !model.unlock(server) }
                }
            } message: { server in
                Text(String(localized: "This sends the write key to the server. \(server.nodeCount) nodes."))
            }
            .alert(String(localized: "Unlocking failed."), isPresented: $unlockFailed) {
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
        String(localized: "Nodes: \(list.addresses.count) · Servers: \(model.serverCount(list))")
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
                Section(String(localized: "Name")) {
                    TextField(String(localized: "Name"), text: $name)
                        .onSubmit { model.rename(list, to: name) }
                }
                Section {
                    LabeledContent(String(localized: "Nodes"), value: "\(list.addresses.count)")
                    LabeledContent(String(localized: "Servers"), value: "\(model.serverCount(list))")
                }
                Section {
                    Button(String(localized: "Delete list"), role: .destructive) { confirmDelete = true }
                } footer: {
                    Text(String(localized: "The nodes leave this phone. The servers do not change."))
                }
            }
        }
        .navigationTitle(list?.name ?? "")
        .onAppear { name = list?.name ?? "" }
        .onDisappear { if let list { model.rename(list, to: name) } }
        .confirmationDialog(String(localized: "Delete this list?"), isPresented: $confirmDelete) {
            Button(String(localized: "Delete"), role: .destructive) {
                if let list { model.delete(list) }
                dismiss()
            }
        }
    }
}
