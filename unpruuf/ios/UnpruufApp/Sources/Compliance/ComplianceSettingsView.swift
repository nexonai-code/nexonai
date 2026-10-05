import LocalAuthentication
import SwiftUI
import UIKit

/// Compliance settings: connection state, optional Face ID, version, and deleting everything.
/// No relay or contact settings — the relay comes from the organisation's QR.
struct ComplianceSettingsView: View {
    @ObservedObject var env: AppEnvironment
    @ObservedObject var torController: TorController
    @Environment(\.dismiss) private var dismiss

    @State private var biometricEnabled = false
    @State private var showWipeConfirm = false

    init(env: AppEnvironment) {
        self.env = env
        self.torController = env.torController
    }

    private var biometricAvailable: Bool {
        var error: NSError?
        return LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(L.t("Conexiune", "Connection")) {
                    HStack {
                        Text(L.t("Rețea Tor", "Tor network"))
                        Spacer()
                        TorStatusLight(torController: torController)
                    }
                    Text(L.t(
                        "Toate sesizările trec prin Tor. Oficiul de raportare nu află adresa ta de internet.",
                        "All reports travel through Tor. The reporting office never learns your internet address."
                    ))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }

                if biometricAvailable {
                    Section(L.t("Deblocare", "Unlock")) {
                        Toggle(L.t("Folosește Face ID / Touch ID", "Use Face ID / Touch ID"), isOn: Binding(
                            get: { biometricEnabled },
                            set: { newValue in
                                biometricEnabled = newValue
                                env.pinManager.isBiometricEnabled = newValue
                            }
                        ))
                        Text(L.t(
                            "Codul PIN de panică rămâne mereu disponibil și șterge totul.",
                            "The panic PIN always stays available and deletes everything."
                        ))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button(L.t("Șterge toate cazurile de pe acest telefon", "Delete all cases from this phone"), role: .destructive) {
                        showWipeConfirm = true
                    }
                } footer: {
                    Text(L.t(
                        "Oficiul de raportare păstrează cazurile. Pe acest telefon nu rămâne nicio urmă, nici codul QR al organizației.",
                        "The reporting office keeps the cases. Nothing is left on this phone, not even the organisation's QR code."
                    ))
                }

                Section {
                    HStack {
                        Text(L.t("Versiune", "Version"))
                        Spacer()
                        Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle(L.t("Setări", "Settings"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(L.t("Gata", "Done")) { dismiss() } }
            }
            .onAppear { biometricEnabled = env.pinManager.isBiometricEnabled }
            .confirmationDialog(
                L.t("Ștergi toate cazurile de pe acest telefon?", "Delete all cases from this phone?"),
                isPresented: $showWipeConfirm, titleVisibility: .visible
            ) {
                Button(L.t("Șterge tot", "Delete everything"), role: .destructive) {
                    env.wipeContactsAndMessages()
                    dismiss()
                }
                Button(L.t("Anulează", "Cancel"), role: .cancel) {}
            }
        }
    }
}
