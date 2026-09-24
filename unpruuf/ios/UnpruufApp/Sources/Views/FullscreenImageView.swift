import SwiftUI

/// Full-size viewer for a photo in a chat, opened by tapping its bubble.
///
/// Deliberately offers no save/share/copy action. Every other part of this app is built so message
/// content never reaches persistent storage (`InMemoryMessageStore` is RAM-only and wiped on
/// background), and a "Save to Photos" button here would quietly undo that for the one message
/// type where it matters most. Looking at a photo is a view concern; getting it out of the app
/// deliberately isn't offered.
struct FullscreenImageView: View {
    let image: UIImage
    let onClose: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .ignoresSafeArea()
            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title)
                    .foregroundStyle(.white, .black.opacity(0.6))
                    .padding()
            }
            .accessibilityLabel("Close photo")
        }
        // Swiping down is what people try first on a full-screen photo; the close button stays as
        // the discoverable fallback.
        .gesture(
            DragGesture().onEnded { value in
                if value.translation.height > 100 { onClose() }
            }
        )
    }
}
