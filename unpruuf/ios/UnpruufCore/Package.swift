// swift-tools-version:5.9
import PackageDescription

/// Crypto/protocol core for unpruuf's iOS (cross-platform "GRAL" mode) app. Deliberately has no
/// UIKit/SwiftUI/Tor dependency, so `swift test` here validates the wire-format and ratchet logic
/// without needing a full Xcode project — see `unpruuf/ios/README.md`.
///
/// UNVERIFIED: the exact current version/API of CryptoSwift's `AEADXChaCha20Poly1305` (used only
/// in `DoubleRatchet.swift`, isolated there) could not be confirmed in this environment — no
/// Swift toolchain is available here at all. If `swift build`/`swift test` reports a version
/// resolution or API mismatch, that's the first thing to check.
let package = Package(
    name: "UnpruufCore",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [
        .library(name: "UnpruufCore", targets: ["UnpruufCore"])
    ],
    dependencies: [
        .package(url: "https://github.com/krzyzanowskim/CryptoSwift.git", from: "1.8.0")
    ],
    targets: [
        .target(name: "UnpruufCore", dependencies: ["CryptoSwift"]),
        .testTarget(name: "UnpruufCoreTests", dependencies: ["UnpruufCore"]),
    ]
)
