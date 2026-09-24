import SwiftUI

struct PairingView: View {
    @ObservedObject var env: AppEnvironment
    @StateObject private var viewModel: PairingViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var showScanner = false
    @State private var pendingScannedJSON: String?
    @State private var nameForPendingContact = ""
    @State private var showManualPaste = false
    @State private var manualPasteText = ""

    init(env: AppEnvironment) {
        self.env = env
        _viewModel = StateObject(wrappedValue: PairingViewModel(env: env))
    }

    /// Pairing is only meaningful once this device advertises a relay of its own — see the guard
    /// in `PairingViewModel.handleScanned` for the real bug this prevents: a contact paired before
    /// a relay was configured stores an EMPTY `myRelayConnectionStrings` and can then never
    /// receive anything from that contact, permanently and silently (setting a relay afterwards
    /// does NOT repair it — the value is frozen per-contact at pairing time). Uses `myRelayPool`,
    /// not `defaultRelayConnectionString`, so it matches exactly what the QR/contact would store.
    private var hasRelayConfigured: Bool { !env.myRelayPool.isEmpty }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    if !hasRelayConfigured {
                        ContentUnavailableView(
                            "Set your relay first",
                            systemImage: "antenna.radiowaves.left.and.right.slash",
                            description: Text("Pairing is disabled until you set your own relay in Settings → My relay. It's the address your contacts' messages reach you at, and it's stored per contact at the moment you pair — so pairing without it would leave that contact permanently unable to reach you, even if you add a relay later.")
                        )
                    } else if let json = viewModel.myQrJSON {
                        VStack(spacing: 12) {
                            Text("Your code").font(.headline)
                            QRCodeImage(text: json)
                                .frame(width: 260, height: 260)
                            Text("Have your contact scan this, then scan theirs.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                        }
                    }

                    VStack(spacing: 12) {
                        if QRScanner.isSupported {
                            Button {
                                showScanner = true
                            } label: {
                                Label("Scan a contact's code", systemImage: "qrcode.viewfinder")
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(!hasRelayConfigured)
                        }
                        Button {
                            showManualPaste = true
                        } label: {
                            Label("Paste code text instead", systemImage: "doc.on.clipboard")
                        }
                        .buttonStyle(.bordered)
                        .disabled(!hasRelayConfigured)
                    }
                }
                .padding()
            }
            .navigationTitle("Add contact")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .fullScreenCover(isPresented: $showScanner) {
                ZStack(alignment: .topTrailing) {
                    QRScannerView { scanned in
                        pendingScannedJSON = scanned
                        showScanner = false
                    }
                    .ignoresSafeArea()
                    Button {
                        showScanner = false
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title)
                            .foregroundStyle(.white, .black.opacity(0.6))
                            .padding()
                    }
                }
            }
            .sheet(isPresented: $showManualPaste) {
                manualPasteSheet
            }
            .alert("Name this contact", isPresented: Binding(get: { pendingScannedJSON != nil }, set: { if !$0 { pendingScannedJSON = nil } })) {
                TextField("Name", text: $nameForPendingContact)
                Button("Add") {
                    guard let json = pendingScannedJSON else { return }
                    viewModel.handleScanned(json: json, displayName: nameForPendingContact.isEmpty ? "New contact" : nameForPendingContact)
                    pendingScannedJSON = nil
                    nameForPendingContact = ""
                }
                Button("Cancel", role: .cancel) { pendingScannedJSON = nil }
            }
            .alert("Error", isPresented: Binding(get: { viewModel.errorMessage != nil }, set: { if !$0 { viewModel.clearError() } })) {
                Button("OK") { viewModel.clearError() }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
            .alert("Added", isPresented: Binding(get: { viewModel.successMessage != nil }, set: { if !$0 { viewModel.clearSuccess() } })) {
                Button("OK") {
                    viewModel.clearSuccess()
                    dismiss()
                }
            } message: {
                Text(viewModel.successMessage ?? "")
            }
            .onChange(of: env.defaultRelayConnectionString) { _ in
                viewModel.refreshMyQrPayload()
            }
            .onChange(of: env.extraRelayConnectionStrings) { _ in
                viewModel.refreshMyQrPayload()
            }
        }
    }

    private var manualPasteSheet: some View {
        NavigationStack {
            Form {
                Section("Contact's code") {
                    TextEditor(text: $manualPasteText)
                        .frame(minHeight: 120)
                        .font(.system(.footnote, design: .monospaced))
                }
                Section("Name") {
                    TextField("Name", text: $nameForPendingContact)
                }
            }
            .navigationTitle("Paste code")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        viewModel.handleScanned(json: manualPasteText, displayName: nameForPendingContact.isEmpty ? "New contact" : nameForPendingContact)
                        showManualPaste = false
                        manualPasteText = ""
                        nameForPendingContact = ""
                    }
                    .disabled(manualPasteText.isEmpty)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showManualPaste = false }
                }
            }
        }
    }
}
