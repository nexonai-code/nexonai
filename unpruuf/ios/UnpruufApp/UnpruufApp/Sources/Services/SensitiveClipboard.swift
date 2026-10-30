import UIKit
import UniformTypeIdentifiers

/// Copies stay on this device (no Universal Clipboard) and the system removes them after 60 s,
/// whether or not anything read them. Same 60 s as Android's `SensitiveClipboard`.
enum SensitiveClipboard {
    static let lifetime: TimeInterval = 60

    static func copy(_ text: String) {
        UIPasteboard.general.setItems(
            [[UTType.plainText.identifier: text]],
            options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(lifetime)]
        )
    }
}
