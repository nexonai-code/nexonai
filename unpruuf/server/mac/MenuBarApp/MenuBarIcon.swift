import AppKit

/// The menu-bar dot itself. Deliberately rendered as a plain colored `NSImage` with
/// `isTemplate = false` rather than an SF Symbol — a template image (the menu bar default) is
/// always monochrome, which would throw away the one piece of information this icon exists to
/// show (green/yellow/red at a glance, no click needed — same reasoning as the iOS app's own
/// TorStatusLight).
enum MenuBarIcon {
    static func dot(for state: RelayState) -> NSImage {
        let color: NSColor
        switch state.dotColorName {
        case "green": color = .systemGreen
        case "yellow": color = .systemYellow
        default: color = .systemRed
        }
        let size = NSSize(width: 16, height: 16)
        let image = NSImage(size: size)
        image.lockFocus()
        let inset: CGFloat = 3
        let rect = NSRect(x: inset, y: inset, width: size.width - inset * 2, height: size.height - inset * 2)
        color.setFill()
        NSBezierPath(ovalIn: rect).fill()
        image.unlockFocus()
        image.isTemplate = false
        return image
    }
}
