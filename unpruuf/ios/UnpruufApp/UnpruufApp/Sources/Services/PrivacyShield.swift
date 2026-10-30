import UIKit

/// Covers the app with an opaque window while it is not active, so the app switcher's snapshot is
/// empty, and while the screen is being recorded or mirrored. Screenshots cannot be prevented on
/// iOS, only noticed (`RootView` shows a hint). A separate window at alert level also covers
/// sheets and the keyboard.
@MainActor
final class PrivacyShield {
    private var window: UIWindow?
    private var observers: [NSObjectProtocol] = []
    private var resigned = false

    func start() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        func observe(_ name: Notification.Name, _ change: @escaping @MainActor (PrivacyShield) -> Void) {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    change(self)
                }
            })
        }
        observe(UIApplication.willResignActiveNotification) { $0.resigned = true; $0.update() }
        observe(UIApplication.didBecomeActiveNotification) { $0.resigned = false; $0.update() }
        observe(UIScreen.capturedDidChangeNotification) { $0.update() }
        update()
    }

    private var scene: UIWindowScene? {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    }

    private func update() {
        guard let scene else { return }
        let cover = resigned || scene.screen.isCaptured
        if cover, window == nil {
            let window = UIWindow(windowScene: scene)
            window.windowLevel = .alert + 1
            window.rootViewController = UIViewController()
            window.rootViewController?.view.backgroundColor = .systemBackground
            window.isHidden = false
            self.window = window
        } else if !cover, let window {
            window.isHidden = true
            self.window = nil
        }
    }
}
