import Foundation

/// Which product this binary is. The consumer app and unpruuf Compliance share all of the crypto
/// and relay code; the Compliance target differs only in its `Info.plist` (`UnpruufEdition` =
/// `compliance`, own bundle id and name — see `Info-Compliance.plist` and `../../README.md`).
enum Edition {
    static let isCompliance: Bool =
        (Bundle.main.object(forInfoDictionaryKey: "UnpruufEdition") as? String) == "compliance"
}

/// Compliance texts: Romanian (the product's primary market, same as the Android flavour) unless
/// the phone is not set to Romanian, then English.
enum L {
    static let isRomanian: Bool = Locale.preferredLanguages.first?.hasPrefix("ro") ?? true

    static func t(_ ro: String, _ en: String) -> String { isRomanian ? ro : en }
}
