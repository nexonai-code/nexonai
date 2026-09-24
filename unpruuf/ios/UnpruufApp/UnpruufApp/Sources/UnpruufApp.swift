import SwiftUI
import UIKit

@main
struct UnpruufApp: App {
    @StateObject private var env = AppEnvironment()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView(env: env)
        }
        .onChange(of: scenePhase) { newPhase in
            // Diagnostic (2026‑08‑29): real-device logs show Tor's control connection being torn
            // down and rebuilt seconds after a successful bootstrap, on a device whose app was
            // never backgrounded by the user — and `stop()` below is the only thing that can
            // cause it. Logging every transition here is what tells us whether `scenePhase`
            // really is reporting `.background`/`.inactive` spuriously (and which one), rather
            // than inferring it indirectly from Tor's behavior.
            print("[Scene] phase changed to \(newPhase)")
            switch newPhase {
            case .active:
                env.start()
            case .background:
                backgroundAndStop()
            default:
                break
            }
        }
    }

    /// **Real bug found from a user report, 2026‑09‑02**: a message written and sent right before
    /// backgrounding the app could vanish forever — never arriving on the other device, and gone
    /// from the relay's own queue too, not just from this device's chat. Root cause: `.background`
    /// used to call `env.stop()` (see `AppEnvironment.stop()`) the instant it fired. That both
    /// resets `TorController.isReady` — which `RelayService.attemptAllPending` gates its whole
    /// delivery loop on — and wipes every RAM message (`messageStore.wipeAll()`), so a delivery
    /// still queued or mid-flight at that exact moment was cut off with no way to retry and
    /// nothing left in the UI to even show it had failed. Compounding it: this app never requested
    /// any extra background execution time, so iOS could suspend the process within seconds of
    /// backgrounding regardless of the above — often before a fresh Tor SOCKS connection + HTTP
    /// POST to the relay has any realistic chance to complete.
    ///
    /// Fixed by requesting the standard `beginBackgroundTask` grace window and deferring `stop()`
    /// until either `RelayService.waitForPendingDeliveries` reports the queue is empty or that
    /// window is about to run out — whichever comes first — instead of cutting delivery off
    /// unconditionally. `FinishOnceGuard` exists because the expiration handler and the delivery
    /// wait's completion race to run this exactly once, and the expiration handler can fire on a
    /// different thread — same pattern as `RelayController.swift`'s `ResumeGuard` on the macOS
    /// menu bar app, for the identical reason. The `UIApplication.shared.applicationState`
    /// check guards the case where the user returns to the app before the deferred `stop()` fires:
    /// without it, a fast background→foreground round-trip could stop a session `env.start()` had
    /// already restarted.
    private func backgroundAndStop() {
        let doneGuard = FinishOnceGuard()
        var taskId: UIBackgroundTaskIdentifier = .invalid
        taskId = UIApplication.shared.beginBackgroundTask(withName: "unpruuf-flush-outbox") {
            doneGuard.finishOnce {
                print("[Scene] background task expired before delivery flush finished")
                if UIApplication.shared.applicationState != .active {
                    env.stop()
                    env.appLockManager.lock()
                }
                UIApplication.shared.endBackgroundTask(taskId)
            }
        }
        Task {
            // Leaves a few seconds of margin inside the ~30s grace period most background tasks
            // actually get, so the cleanup below and endBackgroundTask() itself have room to run
            // before the system's own deadline hits.
            await env.relayService.waitForPendingDeliveries(timeout: 25)
            doneGuard.finishOnce {
                if UIApplication.shared.applicationState != .active {
                    env.stop()
                    env.appLockManager.lock()
                }
                UIApplication.shared.endBackgroundTask(taskId)
            }
        }
    }
}

private final class FinishOnceGuard {
    private var done = false
    private let lock = NSLock()
    func finishOnce(_ work: () -> Void) {
        lock.lock()
        defer { lock.unlock() }
        guard !done else { return }
        done = true
        work()
    }
}
