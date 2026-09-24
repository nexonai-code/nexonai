import SwiftUI
import UIKit

/// Camera capture for chat attachments, wrapping `UIImagePickerController`.
///
/// **Why UIImagePickerController and not a hand-built AVFoundation capture UI:** this needs a
/// shutter button, a preview, and a retake step — all of which the system controller already
/// provides, in a form users recognise. A custom capture screen would be a large surface to get
/// right for no benefit to a messenger whose photo feature is "send a snapshot".
///
/// **On the app-lock interaction** (worth knowing, because the Android side has a real bug here):
/// Android's camera is a separate Activity, so launching it backgrounds the whole app, which its
/// lifecycle observer treats as "user left → wipe RAM + lock" — every attach attempt used to come
/// back to a PIN screen with the photo dropped, which is why `AppLockManager.kt` has a bounded
/// "external-intent grace". On iOS this controller is presented *in-process*: the app stays
/// foreground, `scenePhase` reaches at most `.inactive` (which `UnpruufApp` deliberately ignores),
/// and no wipe or lock is triggered. That is why no equivalent grace is ported here — it would
/// weaken the background-wipe guarantee for nothing. If a real device ever *does* come back from
/// the camera locked and empty, that assumption was wrong and the grace is what to add.
///
/// The captured image never touches disk: it goes straight from the picker into
/// `ChatViewModel.sendImage`, which re-encodes it in memory (see `ImagePreparer`).
struct CameraPicker: UIViewControllerRepresentable {
    let onCaptured: (UIImage) -> Void
    let onCancelled: () -> Void

    /// False in the Simulator and on any device without a usable camera — callers should check
    /// this before offering the option rather than presenting a controller that can't work.
    static var isAvailable: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.allowsEditing = false
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onCaptured: onCaptured, onCancelled: onCancelled)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let onCaptured: (UIImage) -> Void
        private let onCancelled: () -> Void

        init(onCaptured: @escaping (UIImage) -> Void, onCancelled: @escaping () -> Void) {
            self.onCaptured = onCaptured
            self.onCancelled = onCancelled
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            // `.originalImage` deliberately, not `.editedImage`: editing is off, and the original
            // is what `ImagePreparer` expects to normalise and strip. `info[.mediaMetadata]`
            // (which carries EXIF including location) is ignored entirely — it is never read,
            // never attached, and the re-encode drops it regardless.
            if let image = info[.originalImage] as? UIImage {
                onCaptured(image)
            } else {
                onCancelled()
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onCancelled()
        }
    }
}
