import Combine
import Foundation

/// Port of the Android app's `LockViewModel.kt` — PIN setup/check, panic-PIN wipe, biometric
/// unlock. Same DI shape as this app's other view models (plain `init(env:)`, no framework).
@MainActor
final class LockViewModel: ObservableObject {
    @Published var errorMessage: String?

    private let env: AppEnvironment
    private var pinManager: PinManager { env.pinManager }
    private var appLockManager: AppLockManager { env.appLockManager }

    init(env: AppEnvironment) {
        self.env = env
    }

    var isPinSet: Bool { pinManager.isPinSet }
    var isBiometricEnabled: Bool { pinManager.isBiometricEnabled }

    /// First-time setup: normal PIN + a separate panic PIN.
    func setupPins(pin: String, panicPin: String) {
        guard pin.count >= 4 else { errorMessage = "PIN must be at least 4 digits."; return }
        guard pin != panicPin else { errorMessage = "Panic PIN must differ from the PIN."; return }
        pinManager.setPins(pin: pin, panicPin: panicPin)
        appLockManager.unlock()
    }

    /// Checks a typed PIN. The panic PIN instantly wipes contacts + messages and opens the app
    /// empty — see `AppEnvironment.wipeContactsAndMessages()` for exactly what that does and,
    /// just as importantly, what it deliberately leaves untouched.
    func submitPin(_ input: String) {
        switch pinManager.check(input) {
        case .normal:
            errorMessage = nil
            appLockManager.unlock()
        case .panic:
            env.wipeContactsAndMessages()
            errorMessage = nil
            appLockManager.unlock()
        case .wrong:
            errorMessage = "Wrong PIN."
        }
    }

    /// Called after a successful `LAContext` biometric evaluation — same success path as
    /// `.normal`, without checking any PIN, since the biometric check itself is the proof. Never
    /// usable for the panic path: there is no biometric equivalent of the panic PIN.
    func biometricUnlock() {
        errorMessage = nil
        appLockManager.unlock()
    }

    func clearError() { errorMessage = nil }
}
