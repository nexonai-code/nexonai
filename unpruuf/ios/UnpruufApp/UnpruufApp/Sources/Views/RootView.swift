import SwiftUI
import UIKit

/// App root — mirrors the branching `MainActivity.kt` does inline: no PIN set yet → force setup;
/// PIN set but locked → the lock screen; unlocked → the real app. Jailbreak detection and a
/// build-expiry gate (Android has both) are intentionally NOT ported here yet — see the iOS plan's
/// Phase iOS-8, flagged there as needing a product decision (App Store distribution changes what,
/// if anything, those gates are actually defending against), not silently skipped.
struct RootView: View {
    @ObservedObject var env: AppEnvironment
    @ObservedObject var appLockManager: AppLockManager
    @StateObject private var lockViewModel: LockViewModel
    @State private var showScreenshotHint = false

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
                if Edition.isCompliance {
                    CasesHomeView(env: env)
                } else if Edition.isBusiness {
                    BusinessGateView(env: env)
                } else {
                    ContactListView(env: env)
                }
            }
        }
        .safeAreaInset(edge: .top) {
            if appLockManager.unlocked, env.contactStore.isUnreadable || env.caseStore.isUnreadable {
                Text("Saved data could not be read on this device. It is kept untouched, and new changes are not saved.")
                    .font(.footnote)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(8)
                    .background(Color.red)
            }
        }
        .onAppear { env.privacyShield.start() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.userDidTakeScreenshotNotification)) { _ in
            showScreenshotHint = true
        }
        .alert("Screenshot taken", isPresented: $showScreenshotHint) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("iOS cannot block screenshots. This one is in your Photos and may show your messages.")
        }
    }
}
