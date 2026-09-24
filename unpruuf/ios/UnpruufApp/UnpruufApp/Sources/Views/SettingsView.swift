import LocalAuthentication
import SwiftUI
import UIKit
import UnpruufCore

struct SettingsView: View {
    @ObservedObject var env: AppEnvironment
    // Observed directly, not through `env` — see ContactListViewModel's doc comment for why a
    // nested ObservableObject's changes wouldn't otherwise trigger a re-render here.
    @ObservedObject var torController: TorController
    @ObservedObject var contactStore: ContactStore
    @ObservedObject var archivedRelayStore: ArchivedRelayStore
    @Environment(\.dismiss) private var dismiss

    @State private var showScanner = false
    @State private var biometricEnabled = false
    @State private var relayPoolText: String = ""
    @State private var relayPoolStatus: String?
    @State private var lightPalette: TorStatusLight.Palette = .redGreen

    private var biometricSupported: Bool {
        var error: NSError?
        return LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }

    private var appVersionString: String {
        let shortVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(shortVersion) (\(build))"
    }

    /// Sorted the same way `ContactListView` sorts, so "which contact is this row for" reads
    /// consistently between the two screens.
    private var sortedContacts: [Contact] { contactStore.contacts.sorted { $0.displayName < $1.displayName } }

    init(env: AppEnvironment) {
        self.env = env
        self.torController = env.torController
        self.contactStore = env.contactStore
        self.archivedRelayStore = env.archivedRelayStore
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(torController.isReady ? "Tor connected" : "Connecting to Tor…")
                        .foregroundStyle(torController.isReady ? .green : .secondary)
                } header: {
                    Text("Status")
                }

                myRelaysSection

                Section {
                    if let info = env.relayPoolManager.lastImported {
                        Text("Imported: \(info.org) (\(info.relays.count) relay\(info.relays.count == 1 ? "" : "s"))")
                            .foregroundStyle(.secondary)
                    } else {
                        Text("No company relay list imported")
                            .foregroundStyle(.secondary)
                    }
                    TextField("unpruuf-relaypool:v1:...", text: $relayPoolText, axis: .vertical)
                        .font(.system(.footnote, design: .monospaced))
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    Button("Import") {
                        if let info = env.relayPoolManager.importManifest(
                            relayPoolText.trimmingCharacters(in: .whitespacesAndNewlines)
                        ) {
                            env.extraRelayConnectionStrings = info.relays
                            relayPoolText = ""
                            relayPoolStatus = "Relay list imported."
                        } else {
                            relayPoolStatus = "This relay-pool code isn't valid."
                        }
                    }
                    .disabled(relayPoolText.isEmpty)
                    if let status = relayPoolStatus {
                        Text(status).foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Company relay list")
                } footer: {
                    Text("Paste a signed relay list from your organization to fill the backup relay above automatically. Re-importing an updated list replaces the previous one.")
                }

                contactRelaysSection

                if !archivedRelayStore.entries.isEmpty {
                    archivedRelaysSection
                }

                Section {
                    LabeledContent("User ID", value: env.identity.userId)
                        .font(.caption)
                        .textSelection(.enabled)
                } header: {
                    Text("Identity")
                }

                if biometricSupported {
                    Section {
                        Toggle("Unlock with Face ID / Touch ID", isOn: $biometricEnabled)
                            .onChange(of: biometricEnabled) { newValue in
                                env.pinManager.isBiometricEnabled = newValue
                            }
                    } header: {
                        Text("Security")
                    } footer: {
                        Text("Alongside the PIN, not instead of it — can only unlock normally, never the panic PIN. Off by default.")
                    }
                }

                Section {
                    Picker("Tor status light colours", selection: $lightPalette) {
                        ForEach(TorStatusLight.Palette.allCases) { palette in
                            Text(palette.displayName).tag(palette)
                        }
                    }
                    .onChange(of: lightPalette) { newValue in
                        UserDefaults.standard.set(newValue.rawValue, forKey: "tor_light_palette")
                    }
                } header: {
                    Text("Appearance")
                } footer: {
                    Text("The small dot next to the + button shows whether Tor is connected. Red/Green is the traditional \"traffic light\" pairing; Blue/Orange is the combination accessibility guidelines recommend for colour blindness, since it stays distinguishable across every common type.")
                }

                Section {
                    // Mirrors the Android app's Settings -> "App version" row (BuildConfig.VERSION_NAME) —
                    // see Info.plist's CFBundleShortVersionString doc comment for how the two stay in step.
                    LabeledContent("App version", value: appVersionString)
                } header: {
                    Text("About")
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    // Same trailing corner as the contact list and every chat — see
                    // TorStatusLight's doc comment for why the placement is kept uniform.
                    TorStatusLight(torController: torController)
                }
            }
            .onAppear {
                biometricEnabled = env.pinManager.isBiometricEnabled
                lightPalette = TorStatusLight.Palette(
                    rawValue: UserDefaults.standard.string(forKey: "tor_light_palette") ?? ""
                ) ?? .redGreen
            }
            .fullScreenCover(isPresented: $showScanner) {
                ZStack(alignment: .topTrailing) {
                    QRScannerView { scanned in
                        env.saveMyRelay(at: 0, address: scanned, label: env.myRelayLabel)
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
        }
    }

    /// My own relay(s) — up to `RelayConnectionString.maxPoolSize` (2): a primary and an optional
    /// backup, e.g. a Mac at home plus a Windows VM as failover. The backup row only appears once
    /// the primary has something saved (or already has its own value) — no reason to show an
    /// empty second slot before the first one is even set up. Once both are filled, a note
    /// explains why there's no third row, instead of the list just silently stopping.
    @ViewBuilder
    private var myRelaysSection: some View {
        Section {
            if QRScanner.isSupported {
                Button {
                    showScanner = true
                } label: {
                    Label("Scan a relay's connection code", systemImage: "qrcode.viewfinder")
                }
            }
            MyRelayRow(
                placeholder: "unpruuf-relay:v1:...",
                initialAddress: env.defaultRelayConnectionString,
                initialLabel: env.myRelayLabel,
                canDelete: !env.defaultRelayConnectionString.isEmpty,
                onSave: { address, label in env.saveMyRelay(at: 0, address: address, label: label) },
                onDelete: { env.deleteMyRelay(at: 0) }
            )
            .id("my-relay-0-\(env.defaultRelayConnectionString)-\(env.myRelayLabel)")

            if !env.defaultRelayConnectionString.isEmpty || !env.extraRelayConnectionStrings.isEmpty {
                MyRelayRow(
                    placeholder: "unpruuf-relay:v1:... (optional)",
                    initialAddress: env.extraRelayConnectionStrings.first ?? "",
                    initialLabel: env.backupRelayLabel,
                    canDelete: !env.extraRelayConnectionStrings.isEmpty,
                    onSave: { address, label in env.saveMyRelay(at: 1, address: address, label: label) },
                    onDelete: { env.deleteMyRelay(at: 1) }
                )
                .id("my-relay-1-\(env.extraRelayConnectionStrings.first ?? "")-\(env.backupRelayLabel)")
            }

            if !env.defaultRelayConnectionString.isEmpty && !env.extraRelayConnectionStrings.isEmpty {
                Text("Maximum of \(RelayConnectionString.maxPoolSize) relays per pairing QR — that's a size limit of the QR code itself, not a setting.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("My relays")
        } footer: {
            Text("These are the relays your contacts send messages to, to reach you (cross-platform mode has no direct address the way onion services do — see CROSS_PLATFORM_PLAN.md). Get a connection string by running the relay server (unpruuf/server/) and scanning or pasting what it prints. The optional label is only shown to you, here — useful for telling two of your own relays apart later, e.g. when retiring one of them.")
        }
    }

    /// One relay address per paired contact, editable directly — this is what routes an outgoing
    /// message to them, so it's a manual, LOCAL correction (contact told you a new address, or a
    /// typo crept in at pairing), not the synchronized Wechsel protocol (see ChatView's "Rotate my
    /// identity" — that notifies the contact; this doesn't). Grouped by contact rather than a
    /// single flat list on purpose: it's a live view over each contact's own stored data, so
    /// deleting a contact elsewhere (contact list swipe-to-delete) removes their section here
    /// automatically — nothing to keep in sync by hand.
    @ViewBuilder
    private var contactRelaysSection: some View {
        Section {
        } header: {
            Text("Contacts' relays")
        } footer: {
            Text(
                sortedContacts.isEmpty
                    ? "No paired contacts yet."
                    : "Where each contact currently expects to be reached, as you have it stored. Editing here only changes your own copy — it doesn't notify them, so use it to correct a wrong address, not to announce a new one (that's \"Rotate my identity\" inside the chat)."
            )
        }

        ForEach(sortedContacts) { contact in
            // Every contact gets a section, even one with zero relays saved (a leftover from a
            // legacy pairing, e.g.) — showing just its "add" row here doubles as the fix for
            // that, using the same mechanism `PairingViewModel` now blocks at pairing time.
            Section {
                ForEach(Array(contact.theirRelayConnectionStrings.enumerated()), id: \.offset) { index, relay in
                    ContactRelayRow(
                        contactName: contact.displayName,
                        initialAddress: relay,
                        isOnlyRelayForContact: contact.theirRelayConnectionStrings.count == 1,
                        onSave: { newAddress in
                            contactStore.setTheirRelay(contactId: contact.id, index: index, address: newAddress)
                        },
                        onDelete: {
                            contactStore.removeTheirRelay(contactId: contact.id, index: index)
                        }
                    )
                    .id("contact-relay-\(contact.id)-\(index)-\(relay)")
                }
                if contact.theirRelayConnectionStrings.count < RelayConnectionString.maxPoolSize {
                    AddContactRelayRow(contactName: contact.displayName) { newAddress in
                        contactStore.setTheirRelay(
                            contactId: contact.id,
                            index: contact.theirRelayConnectionStrings.count,
                            address: newAddress
                        )
                    }
                    .id("contact-relay-add-\(contact.id)-\(contact.theirRelayConnectionStrings.count)")
                }
            } header: {
                Text(contact.displayName)
            }
        }
    }

    /// Relay addresses kept from deleted contacts — see `ArchivedRelayStore`'s doc comment. Only
    /// shown at all once there's something in it, so it doesn't add a permanent empty section for
    /// the common case of never having used "keep relay" on a delete.
    @ViewBuilder
    private var archivedRelaysSection: some View {
        Section {
            ForEach(archivedRelayStore.entries) { entry in
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.label).font(.subheadline.weight(.medium))
                    Text(entry.connectionString)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                    HStack {
                        Button {
                            UIPasteboard.general.string = entry.connectionString
                        } label: {
                            Label("Copy", systemImage: "doc.on.doc")
                        }
                        .font(.caption)
                        Spacer()
                        Button("Delete", role: .destructive) {
                            archivedRelayStore.remove(id: entry.id)
                        }
                        .font(.caption)
                    }
                }
                .padding(.vertical, 2)
            }
        } header: {
            Text("Archived relays")
        } footer: {
            Text("Relay addresses kept from deleted contacts, in case they get back in touch — plain reference copies, not connected to anything else in the app. If that person comes back, pairing again with a fresh QR is still what actually re-establishes a conversation with them.")
        }
    }
}
