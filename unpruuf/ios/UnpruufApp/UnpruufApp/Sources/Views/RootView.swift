import SwiftUI

/// App root — mirrors the branching `MainActivity.kt` does inline: no PIN set yet → force setup;
/// PIN set but locked → the lock screen; unlocked → the real app. Jailbreak detection and a
/// build-expiry gate (Android has both) are intentionally NOT ported here yet — see the iOS plan's
/// Phase iOS-8, flagged there as needing a product decision (App Store distribution changes what,
/// if anything, those gates are actually defending against), not silently skipped.
struct RootView: View {
    @ObservedObject var env: AppEnvironment
    @ObservedObject var appLockManager: AppLockManager
    @StateObject private var lockViewModel: LockViewModel

    init(env: AppEnvironment) {
        self.env = env
        self.appLockManager = env.appLockManager
        _lockViewModel = StateObject(wrappedValue: LockViewModel(env: env))
    }

    var body: some View {
        Group {
            if !lockViewModel.isPinSet {
                PinSetupView(viewModel: lockViewModel)
            } else if !appLockManager.unlocked {
                PinLockView(viewModel: lockViewModel)
            } else {
                ContactListView(env: env)
            }
        }
    }
}
