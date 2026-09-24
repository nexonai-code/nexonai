import SwiftUI

/// First-run PIN setup — port of the Android app's `PinSetupScreen.kt`. Shown instead of
/// `PinLockView` whenever `LockViewModel.isPinSet` is false, i.e. a PIN is effectively mandatory,
/// not opt-in-forever: the app never reaches `ContactListView` without one being set first.
struct PinSetupView: View {
    @ObservedObject var viewModel: LockViewModel
    @State private var pin = ""
    @State private var pinRepeat = ""
    @State private var panic = ""
    @State private var localError: String?

    var body: some View {
        VStack {
            ScrollView {
                VStack(spacing: 12) {
                    Spacer().frame(height: 32)
                    Image(systemName: "lock.fill")
                        .font(.system(size: 44))
                        .foregroundColor(.accentColor)
                    Spacer().frame(height: 8)
                    Text("Set up PIN").font(.title2).bold()
                    Text("Set a PIN to open the app and a separate panic PIN. Entering the panic PIN instantly deletes all contacts and opens the app empty.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 8)

                    Spacer().frame(height: 12)
                    pinField($pin, "PIN (min. 4 digits)")
                    pinField($pinRepeat, "Repeat PIN")
                    pinField($panic, "Panic PIN")

                    if let error = localError ?? viewModel.errorMessage {
                        Text(error).font(.footnote).foregroundStyle(.red)
                    }
                }
                .padding(.horizontal, 24)
            }

            Button {
                localError = nil
                viewModel.clearError()
                guard pin == pinRepeat else { localError = "PINs do not match."; return }
                viewModel.setupPins(pin: pin, panicPin: panic)
            } label: {
                Text("Save PIN").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(pin.count < 4 || pinRepeat.isEmpty || panic.count < 4)
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
        }
    }

    private func pinField(_ text: Binding<String>, _ label: String) -> some View {
        SecureField(label, text: Binding(
            get: { text.wrappedValue },
            set: { text.wrappedValue = String($0.filter(\.isNumber).prefix(12)) }
        ))
        .keyboardType(.numberPad)
        .textFieldStyle(.roundedBorder)
    }
}
