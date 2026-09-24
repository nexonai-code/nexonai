import Foundation
import Combine

/// Holds the app's lock state in RAM only (never persisted) — port of the Android app's
/// `AppLockManager.kt`. Set to locked at launch and on every background transition; only a
/// correct PIN (or, opt-in, biometric — see `PinManager.isBiometricEnabled`) unlocks it.
///
/// Deliberately does NOT port Android's "external-intent grace" (a bounded window that keeps the
/// app unlocked across a camera/file-picker round-trip, added there to fix attachments being
/// dropped on return).
///
/// **Resolved 2026‑08‑31, when the camera picker was actually wired up** (this note used to say
/// "add the grace when a picker exists — don't rediscover that bug blind"): the grace turns out
/// not to be needed on iOS, because the platforms differ in a way that matters. Android's camera
/// is a *separate Activity*, so launching it genuinely backgrounds the app and trips its
/// "user left → wipe RAM + lock" observer. iOS's `UIImagePickerController` is presented
/// *in-process* (see `CameraPicker.swift`): the app stays foreground, `scenePhase` reaches at most
/// `.inactive` — which `UnpruufApp`'s handler ignores by design, confirmed on real hardware where
/// the Face ID prompt produces exactly that transition — and neither `stop()` nor `lock()` runs.
/// Porting the grace anyway would weaken the background-wipe guarantee in exchange for nothing.
///
/// The assumption to re-check if this is ever wrong: if returning from the camera ever lands on
/// the PIN screen with the conversation wiped, then `.background` *is* being reported for an
/// in-process picker after all, and mirroring `AppLockManager.kt`'s
/// `beginExternalIntentGrace()`/`isExternalIntentGraceActive()` is the fix.
@MainActor
final class AppLockManager: ObservableObject {
    @Published private(set) var unlocked = false

    func unlock() { unlocked = true }
    func lock() { unlocked = false }
}
