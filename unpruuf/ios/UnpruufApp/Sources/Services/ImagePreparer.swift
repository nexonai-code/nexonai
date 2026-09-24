import UIKit

/// Prepares a camera photo for sending — port of the Android app's `ChatViewModel.prepareImage`,
/// with one deliberate difference in the size budget (see below).
///
/// Two effects, both wanted:
///
/// 1. **Privacy.** Drawing the image into a fresh graphics context and re-encoding it as JPEG
///    drops every metadata block the original carried: EXIF (**GPS position**, capture time,
///    camera model), XMP, embedded thumbnails. This is why it re-encodes *unconditionally*,
///    never "only if too large" — a small photo leaks location just as well as a big one.
///    `UIImage.draw(in:)` bakes `imageOrientation` into the pixels first, so the stripped copy
///    doesn't come out rotated.
/// 2. **Transfer time.** Every 4000 bytes of ciphertext becomes one more 4096-byte relay packet
///    (see `RatchetFrame`), and `SocksHTTPClient` opens a *fresh Tor connection per packet* — it
///    deliberately has no pooling. So bytes translate almost linearly into minutes here.
///
/// **Why the budget is smaller than Android's:** Android caps images at 2 MB / 2048 px. Over this
/// relay-only transport that would be ~525 separate Tor round-trips for a single photo. The cap
/// here is a *local sender-side policy*, not part of the wire format — an Android peer sending a
/// 2 MB photo is received fine either way (a fetch returns every queued chunk in one request; only
/// sending is per-chunk), so lowering it costs no interoperability. Raise it once
/// `SocksHTTPClient` reuses one connection for a burst of packets; until then this keeps a photo
/// send in the region of a couple of minutes rather than ten.
enum ImagePreparer {
    /// Long-edge limit in pixels. Still comfortably sharp for a chat photo on any phone screen.
    static let maxDimension: CGFloat = 1600
    /// Target size after compression — roughly 150 relay packets.
    static let maxBytes = 600 * 1024

    /// Returns JPEG data with all source metadata removed, or nil if the image can't be encoded.
    static func prepareJPEG(from image: UIImage) -> Data? {
        let normalized = normalizedAndScaled(image)
        var quality: CGFloat = 0.85
        var data = normalized.jpegData(compressionQuality: quality)
        // Step the quality down until it fits, with a floor — below ~0.4 the artefacts cost more
        // than the bytes save, same stepping and floor Android uses.
        while let current = data, current.count > maxBytes, quality > 0.4 {
            quality -= 0.15
            data = normalized.jpegData(compressionQuality: quality)
        }
        return data
    }

    /// Redraws the image at or below `maxDimension` on its long edge. The redraw itself is what
    /// strips metadata and applies orientation — it happens even when no downscaling is needed,
    /// which is the point (see this type's doc comment).
    private static func normalizedAndScaled(_ image: UIImage) -> UIImage {
        let size = image.size
        let longEdge = max(size.width, size.height)
        guard longEdge > 0 else { return image }
        let factor = longEdge > maxDimension ? maxDimension / longEdge : 1
        let target = CGSize(width: (size.width * factor).rounded(), height: (size.height * factor).rounded())

        let format = UIGraphicsImageRendererFormat.default()
        // scale = 1 so `target` is real pixels, not points multiplied by the screen's scale factor
        // — otherwise a "1600 px" image comes out 4800 px wide on a 3x device, which is exactly
        // the size blow-up this is meant to prevent.
        format.scale = 1
        // No transparency to preserve: the output is JPEG, which has no alpha channel anyway.
        format.opaque = true
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
