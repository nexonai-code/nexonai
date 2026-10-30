import ImageIO
import UIKit

/// Decoding of received images, same limits as Android: the size is read from the file's header
/// first, so a tiny file claiming a huge picture never gets its pixels allocated.
enum SafeImage {
    static let maxPixels = 50_000_000
    static let maxEdge = 20_000
    /// Long edge of what is actually decoded.
    static let maxDecodedEdge = 2048

    private static let noCache = [kCGImageSourceShouldCache: false] as CFDictionary

    /// Reads the header only, cheap enough for every redraw of a chat row.
    static func isDecodable(_ data: Data) -> Bool {
        source(for: data) != nil
    }

    private static func source(for data: Data) -> CGImageSource? {
        guard let source = CGImageSourceCreateWithData(data as CFData, noCache),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, noCache) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              isAcceptable(width: width, height: height) else { return nil }
        return source
    }

    static func decode(_ data: Data) -> UIImage? {
        guard let source = source(for: data) else { return nil }
        let options = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxDecodedEdge,
        ] as CFDictionary
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options) else { return nil }
        return UIImage(cgImage: image)
    }

    static func isAcceptable(width: Int, height: Int) -> Bool {
        guard width > 0, height > 0, width <= maxEdge, height <= maxEdge else { return false }
        return width * height <= maxPixels
    }
}
