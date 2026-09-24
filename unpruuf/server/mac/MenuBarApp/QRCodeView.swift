import SwiftUI
import CoreImage.CIFilterBuiltins

/// macOS sibling of the iOS app's `QRCodeImage.swift` — same CoreImage approach, `NSImage`
/// instead of `UIImage`. Kept deliberately as close to that file as possible so the two are easy
/// to compare if the rendering ever needs to change on either side.
struct QRCodeView: View {
    let text: String

    var body: some View {
        if let nsImage = Self.render(text) {
            Image(nsImage: nsImage)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
        } else {
            Rectangle()
                .fill(Color.gray.opacity(0.2))
                .overlay(Text("Couldn't generate QR code").font(.caption))
        }
    }

    private static func render(_ text: String) -> NSImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return NSImage(cgImage: cgImage, size: NSSize(width: scaled.extent.width, height: scaled.extent.height))
    }
}
