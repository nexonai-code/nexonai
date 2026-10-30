import Combine
import Foundation

/// Port of the Android app's `LockViewModel.kt` — PIN setup/check, panic-PIN wipe, biometric
/// unlock. Same DI shape as this app's other view models (plain `init(env:)`, no framework).
@MainActor
final class LockViewModel: ObservableObject {
    @Published var errorMessage: String?
    /// Seconds the PIN pad is locked for after too many wrong tries; 0 when it is free.
    @Published private(set) var lockSeconds = 0

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
        guard pin.count >= 4, panicPin.count >= 4 else { errorMessage = "PIN must be at least 4 digits."; return }
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
            refreshLock()
        case .locked:
            refreshLock()
        }
    }

    /// Called once a second by the lock screen, so the remaining time counts down.
    func refreshLock() {
        let seconds = Int((pinManager.lockRemainingMs() + 999) / 1000)
        guard seconds != lockSeconds else { return }
        lockSeconds = seconds
        if seconds >= 60 {
            errorMessage = "Too many wrong tries. Try again in \((seconds + 59) / 60) min."
        } else if seconds > 0 {
            errorMessage = "Too many wrong tries. Try again in \(seconds) s."
        } else {
            errorMessage = nil
        }
    }

    /// Called after a successful `LAContext` biometric evaluation — same success path as
    /// `.normal`, without checking any PIN, since the biometric check itself is the proof. Never
    /// usable for the panic path: there is no biometric equivalent of the panic PIN.
    func biometricUnlock() {
        errorMessage = nil
        appLockManager.unlock()
    }

    func clearError() { if lockSeconds == 0 { errorMessage = nil } }
}
