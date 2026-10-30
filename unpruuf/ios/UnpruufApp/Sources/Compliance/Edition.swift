import Foundation

/// Which product this binary is. The consumer app, unpruuf Compliance and unpruuf Business share
/// their code; each target differs only in its `Info.plist` (`UnpruufEdition`, own bundle id and
/// name — see `Info-Compliance.plist`, `Info-Business.plist` and `../../README.md`).
enum Edition {
    private static let name = Bundle.main.object(forInfoDictionaryKey: "UnpruufEdition") as? String
    static let isCompliance = name == "compliance"
    static let isBusiness = name == "business"
}

/// Compliance and Business texts: Romanian (the product's primary market, same as the Android flavour) unless
/// the phone is not set to Romanian, then English.
enum L {
    static let isRomanian: Bool = Locale.preferredLanguages.first?.hasPrefix("ro") ?? true

    static func t(_ ro: String, _ en: String) -> String { isRomanian ? ro : en }
}
