import SwiftUI

extension View {
    /// For message text: the keyboard neither corrects nor learns from what is typed.
    func noKeyboardLearning() -> some View {
        autocorrectionDisabled().textInputAutocapitalization(.never)
    }

    /// For codes, addresses and connection strings.
    func codeInput() -> some View {
        noKeyboardLearning().keyboardType(.asciiCapable)
    }
}
