import SwiftUI

/// A small always-running menu-bar helper for the unpruuf relay (`server/mac/README.md`) — start/
/// stop the background launchd service, see the connection QR code, and glance at whether Tor is
/// actually publishing, without opening Terminal. Wraps the existing scripts and CLI rather than
/// reimplementing any of their logic — see `RelayController`'s doc comment.
@main
struct MenuBarAppApp: App {
    @StateObject private var controller = RelayController()

    var body: some Scene {
        MenuBarExtra {
            ContentView(controller: controller)
        } label: {
            Image(nsImage: MenuBarIcon.dot(for: controller.state))
        }
        .menuBarExtraStyle(.window)
    }
}
