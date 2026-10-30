import SwiftUI
import UniformTypeIdentifiers
import UnpruufCore

/// Adds nodes from a scanned owner QR, or a pasted or chosen list file. Both carry the server's
/// write key, so nothing here is logged or kept beyond the import.
struct NodeImportView: View {
    @ObservedObject var model: NodeListsModel
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var showScanner = false
    @State private var showFiles = false
    @State private var errorText: String?
    @State private var pendingFile: NodeListFile.Parsed?
    @State private var listName = ""
    @State private var targetListId: String?

    var body: some View {
        NavigationStack {
            Form {
                if let file = pendingFile {
                    Section(L.t("\(file.addresses.count) noduri din listă", "\(file.addresses.count) nodes in the file")) {
                        Picker(L.t("Adaugă la", "Add to"), selection: $targetListId) {
                            Text(L.t("Listă nouă", "New list")).tag(String?.none)
                            ForEach(model.lists, id: \.id) { Text($0.name).tag(String?.some($0.id)) }
                        }
                        if targetListId == nil {
                            TextField(L.t("Nume", "Name"), text: $listName)
                        }
                        Button(L.t("Importă", "Import")) { finishImport(file) }
                    }
                } else {
                    if QRScanner.isSupported {
                        Button(L.t("Scanează codul serverului", "Scan the server's code")) { showScanner = true }
                    }
                    Button(L.t("Alege fișierul listei", "Choose the list file")) { showFiles = true }
                    Section(L.t("…sau lipește", "…or paste")) {
                        TextEditor(text: $text)
                            .frame(minHeight: 120)
                            .font(.system(.footnote, design: .monospaced))
                            .codeInput()
                        Button(L.t("Continuă", "Continue")) { take(text) }
                            .disabled(text.isEmpty)
                    }
                }
                if let errorText {
                    Text(errorText).foregroundStyle(.red)
                }
            }
            .navigationTitle(L.t("Adaugă noduri", "Add nodes"))
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
            .fileImporter(isPresented: $showFiles, allowedContentTypes: [.plainText, .text]) { result in
                guard case .success(let url) = result else { return }
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                take((try? String(contentsOf: url, encoding: .utf8)) ?? "")
            }
        }
    }

    private func take(_ raw: String) {
        errorText = nil
        switch model.classify(raw) {
        case .ownerCode:
            if model.addOwnerCode(raw) { dismiss() } else { errorText = noRoomText(needed: 1, free: 0) }
        case .listFile(let file):
            pendingFile = file
            listName = file.name
            text = ""
        case .invalid:
            errorText = L.t("Acesta nu este un cod de server și nici o listă de noduri.",
                            "This is neither a server code nor a node list.")
        }
    }

    private func finishImport(_ file: NodeListFile.Parsed) {
        switch model.importFile(file, name: listName, targetListId: targetListId) {
        case .ok:
            dismiss()
        case .noRoom(let needed, let free):
            errorText = noRoomText(needed: needed, free: free)
        case .unknownList:
            errorText = L.t("Lista nu mai există.", "That list no longer exists.")
        }
    }

    private func noRoomText(needed: Int, free: Int) -> String {
        L.t("Nu mai este loc: \(needed) noduri noi, \(free) libere. Nu s-a importat nimic.",
            "No room: \(needed) new nodes, \(free) free. Nothing was imported.")
    }
}
