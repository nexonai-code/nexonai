import SwiftUI
import Vision
import VisionKit

/// Thin SwiftUI wrapper around `VisionKit.DataScannerViewController` (iOS 16+) — a fully native,
/// no-dependency QR scanner (unlike the Android app's ZXing-based `PortraitCaptureActivity`).
struct QRScannerView: UIViewControllerRepresentable {
    let onScanned: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let controller = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: false,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {
        try? controller.startScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onScanned: onScanned) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onScanned: (String) -> Void
        private var delivered = false

        init(onScanned: @escaping (String) -> Void) {
            self.onScanned = onScanned
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !delivered else { return }
            for item in addedItems {
                if case .barcode(let barcode) = item, let value = barcode.payloadStringValue {
                    delivered = true
                    onScanned(value)
                    return
                }
            }
        }
    }
}

/// Availability guard — `DataScannerViewController` requires a physical device with a camera and
/// isn't available on the Simulator; callers should check this before presenting `QRScannerView`.
enum QRScanner {
    static var isSupported: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }
}
