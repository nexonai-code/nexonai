import SwiftUI

/// Always-visible Tor indicator: connected vs. not, in one of two colour palettes the user picks
/// in Settings.
///
/// Exists because "why is my message stuck?" and "is Tor up?" are the same question in this app —
/// both sending and receiving are gated on `TorController.isReady` (see `RelayService`'s
/// `attemptAllPending`/`pollOnce`, which both return early when it's false). Before this, the
/// answer lived only in Settings, so noticing required leaving the conversation you were in.
///
/// **Placement, deliberately identical everywhere:** the contact list, every chat, and Settings
/// all show this in the trailing (top-right) corner of their navigation bar. Top-*left* would work
/// on the contact list, but a chat's leading slot is the system back button — rather than have the
/// light live in a different corner depending on which screen you're on, it's trailing
/// everywhere, matching the one screen that has no choice.
///
/// **Why it takes `torController` explicitly instead of reaching through `AppEnvironment`:** this
/// view observes it directly, which is what makes it re-render the instant `isReady` flips. A
/// computed lookup through a *nested* `ObservableObject` never fires the enclosing view's
/// `objectWillChange` — the same SwiftUI trap already documented on `ContactListViewModel` and
/// worked around the same way in `SettingsView`. Because the observation lives here, the parent
/// doesn't need to observe anything for the light to stay current.
///
/// **Colour palette:** red/green is the default (matches the "traffic light" mental model most
/// people expect), but it's also the one combination the most common forms of colour blindness
/// (protanopia/deuteranopia — a red-green axis defect) can't reliably distinguish. The Settings
/// toggle switches to blue/orange, the pairing recommended across accessibility guidelines (e.g.
/// the Okabe–Ito colour-blind-safe palette) precisely because blue and orange sit on different
/// axes from *both* red-green and the much rarer blue-yellow (tritanopia) defect — no single
/// binary pair is guaranteed universal, but this one has the broadest coverage of any two-colour
/// choice. The state is also exposed as a VoiceOver accessibility label regardless of palette,
/// and Settings → Status spells it out in words as the unambiguous fallback either way.
struct TorStatusLight: View {
    @ObservedObject var torController: TorController

    /// Shared with the toggle in `SettingsView` via the same `@AppStorage` key — a plain per-device
    /// display preference, not sensitive, so it doesn't need routing through `AppEnvironment`'s
    /// manual UserDefaults wiring the way relay/identity settings do.
    @AppStorage("tor_light_palette") private var paletteRaw: String = Palette.redGreen.rawValue

    enum Palette: String, CaseIterable, Identifiable {
        case redGreen
        case blueOrange
        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .redGreen: return "Red / Green"
            case .blueOrange: return "Blue / Orange (colour-blind friendly)"
            }
        }

        func color(connected: Bool) -> Color {
            switch self {
            case .redGreen: return connected ? .green : .red
            case .blueOrange: return connected ? .blue : .orange
            }
        }
    }

    private var palette: Palette { Palette(rawValue: paletteRaw) ?? .redGreen }
    private var color: Color { palette.color(connected: torController.isReady) }

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 10, height: 10)
            // A soft glow so it reads as a lit indicator rather than a stray dot.
            .shadow(color: color.opacity(0.9), radius: 3)
            .animation(.easeInOut(duration: 0.25), value: torController.isReady)
            .accessibilityLabel(torController.isReady ? "Tor connected" : "Tor not connected")
    }
}
