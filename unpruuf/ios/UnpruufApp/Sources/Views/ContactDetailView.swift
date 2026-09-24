import SwiftUI

/// Out-of-band pairing verification (safety number) — see `Identity.safetyNumber`'s doc comment
/// for the mechanism. Port of the Android app's `ContactDetailScreen.kt`. Reachable for ANY
/// contact, not just cross-platform ones, so it generalizes as an optional extra check on top of
/// normal pairing too — not only the least-verified (cross-platform) path it's most relevant for.
struct ContactDetailView: View {
    @StateObject private var viewModel: ContactDetailViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var enteredCode = ""

    init(env: AppEnvironment, contactId: String) {
        _viewModel = StateObject(wrappedValue: ContactDetailViewModel(env: env, contactId: contactId))
    }

    var body: some View {
        Form {
            if viewModel.contact?.isVerified == true {
                Section {
                    Label("Verified", systemImage: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                }
            }

            Section {
                Text(viewModel.mySafetyNumber ?? "\u{2014}")
                    .font(.system(.title2, design: .monospaced))
                    .bold()
            } header: {
                Text("Your safety number for this contact")
            } footer: {
                Text("Compare this with \(viewModel.contact?.displayName ?? "them") over a call or voice message — NOT the same channel you used to share the pairing code. If both sides see the same number, the pairing code wasn't tampered with on the way.")
            }

            Section {
                TextField("Code they read you", text: $enteredCode)
                    .keyboardType(.numberPad)
                    .onChange(of: enteredCode) { _ in viewModel.clearVerifyResult() }
                Button("Save") {
                    viewModel.verify(enteredCode: enteredCode)
                }
                .disabled(enteredCode.isEmpty || viewModel.mySafetyNumber == nil)
            } header: {
                Text("Enter their code")
            }

            if let matches = viewModel.verifyResult {
                Section {
                    Label(
                        matches
                            ? "Codes match \u{2014} \(viewModel.contact?.displayName ?? "this contact") is verified."
                            : "Codes don't match. Do not assume this contact is who they claim \u{2014} ask them to read their code again, or re-pair carefully.",
                        systemImage: matches ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
                    )
                    .foregroundStyle(matches ? .green : .red)
                }
            }
        }
        .navigationTitle(viewModel.contact?.displayName ?? "Verify contact")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }
            }
        }
    }
}
