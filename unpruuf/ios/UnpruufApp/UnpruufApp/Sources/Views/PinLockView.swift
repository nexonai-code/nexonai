import LocalAuthentication
import SwiftUI

/// Lock screen: PIN dots, a real number pad, optional Face ID/Touch ID. Deliberately looks
/// IDENTICAL for a normal PIN and the panic PIN — same dots, same pad, same everything — port of
/// the Android app's `PinLockScreen.kt`. Submit is the checkmark key (PINs are 4-12 digits, so
/// auto-submit at a fixed length isn't possible).
struct PinLockView: View {
    @ObservedObject var viewModel: LockViewModel
    @State private var pin = ""

    var body: some View {
        VStack {
            Spacer()

            (Text("un").foregroundColor(.accentColor) + Text("pruuf"))
                .font(.system(size: 22, weight: .heavy))

            Spacer().frame(height: 10)
            Text("Enter PIN")
                .font(.footnote)
                .foregroundStyle(.secondary)

            Spacer().frame(height: 28)

            // One dot per typed digit; at least four slots so the target length reads at a
            // glance without revealing how long this user's actual PIN is.
            HStack(spacing: 12) {
                ForEach(0..<max(4, pin.count), id: \.self) { index in
                    Circle()
                        .fill(index < pin.count ? Color.accentColor : Color(.systemGray4))
                        .frame(width: 12, height: 12)
                }
            }

            Spacer().frame(height: 14)

            // Fixed-height error slot so the pad never jumps when a message appears.
            Group {
                if let error = viewModel.errorMessage {
                    Text(error).font(.footnote).foregroundStyle(.red)
                } else {
                    Text(" ").font(.footnote)
                }
            }
            .frame(height: 20)

            Spacer().frame(height: 14)

            VStack(spacing: 14) {
                pinRow(["1", "2", "3"])
                pinRow(["4", "5", "6"])
                pinRow(["7", "8", "9"])
                pinRow(["\u{2713}", "0", "\u{232B}"])
            }

            if biometricAvailable {
                Spacer().frame(height: 22)
                Button {
                    attemptBiometricUnlock()
                } label: {
                    Image(systemName: biometryIconName)
                        .font(.system(size: 30))
                        .foregroundColor(.accentColor)
                        .frame(width: 72, height: 72)
                        .overlay(Circle().stroke(Color(.systemGray4)))
                }
            }

            Spacer()
            Spacer()
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
        .onAppear {
            if biometricAvailable { attemptBiometricUnlock() }
        }
    }

    private func pinRow(_ keys: [String]) -> some View {
        HStack(spacing: 22) {
            ForEach(keys, id: \.self) { key in
                padKey(key)
            }
        }
    }

    @ViewBuilder
    private func padKey(_ key: String) -> some View {
        switch key {
        case "\u{2713}":
            padButton(label: key, emphasized: pin.count >= 4, enabled: pin.count >= 4) {
                viewModel.submitPin(pin)
                pin = ""
            }
        case "\u{232B}":
            padButton(label: key, ghost: true, enabled: !pin.isEmpty) {
                pin.removeLast()
                viewModel.clearError()
            }
        default:
            padButton(label: key, enabled: pin.count < 12) {
                pin += key
                viewModel.clearError()
            }
        }
    }

    private func padButton(label: String, emphasized: Bool = false, ghost: Bool = false, enabled: Bool = true, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 20, design: .monospaced))
                .frame(width: 64, height: 64)
                .foregroundColor(emphasized ? .white : (enabled ? .primary : .secondary.opacity(0.4)))
                .background(emphasized ? Color.accentColor : (ghost ? Color(.systemBackground) : Color(.secondarySystemBackground)))
                .clipShape(Circle())
                .overlay(
                    Circle().stroke(Color(.systemGray4), lineWidth: (ghost || emphasized) ? 0 : 1)
                )
        }
        .disabled(!enabled)
    }

    // MARK: - Biometrics

    // Biometric-only, no device-passcode fallback: unpruuf already has its own separate PIN —
    // falling back to the PHONE's passcode here would be a different, weaker secret than
    // unpruuf's own PIN, so it's deliberately not offered (same reasoning, same choice, as
    // Android's BiometricPrompt config). Declining or failing the prompt just leaves the PIN pad
    // usable as normal.
    private var biometricAvailable: Bool {
        guard viewModel.isBiometricEnabled else { return false }
        var error: NSError?
        return LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }

    private var biometryIconName: String {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        return context.biometryType == .faceID ? "faceid" : "touchid"
    }

    private func attemptBiometricUnlock() {
        let context = LAContext()
        context.localizedCancelTitle = "Use PIN instead"
        context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: "Confirm your identity to unlock unpruuf"
        ) { success, _ in
            guard success else { return }
            Task { @MainActor in viewModel.biometricUnlock() }
        }
    }
}
