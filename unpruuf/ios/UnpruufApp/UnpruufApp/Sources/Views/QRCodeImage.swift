import SwiftUI
import CoreImage.CIFilterBuiltins

/// Renders `text` as a QR code using CoreImage's built-in generator — no third-party dependency,
/// unlike the Android app's ZXing.
struct QRCodeImage: View {
    let text: String

    var body: some View {
        if let uiImage = Self.render(text) {
            Image(uiImage: uiImage)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
        } else {
            Rectangle()
                .fill(Color.gray.opacity(0.2))
                .overlay(Text("Couldn't generate QR code").font(.caption))
        }
    }

    private static func render(_ text: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
