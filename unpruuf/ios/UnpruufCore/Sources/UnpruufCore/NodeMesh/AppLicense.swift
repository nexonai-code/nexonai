import CryptoKit
import Foundation

/// Offline app licence check, ported from Android's `LicenseManager` (no server, ever). Format:
/// `unpruuf-license:v1:<base64url(payload)>:<base64url(signature)>`, payload
/// `1|<edition>|<serial>|<customer>|<issuedAtMs>|<expiresAtMs>`, Ed25519 over the raw payload
/// bytes. Server licences (`unpruuf-server-license:v1:`) belong to the server and are refused here.
///
/// Pure logic only: storing the code, binding it to the install and the clock high-water mark
/// come with the licence screen, so the caller passes in the trusted "now".
public enum AppLicense {
    private static let prefix = "unpruuf-license:v1:"
    private static let editions: Set<String> = ["standard", "pro", "client", "group"]
    private static let expiringSoonDays: Int64 = 30
    private static let msPerDay: Int64 = 24 * 60 * 60 * 1000

    /// Public half of the licence key pair (license-tool/keygen.js), same value as Android's
    /// `LicenseManager.PUBLIC_KEY_B64`. It can only verify, never sign.
    public static let publicKeyB64 = "t7ZQMSMx3iMbLZ9ke7c-2hYSkgRvyw43HZzaIyvyVC4"

    public struct Info: Equatable {
        public let edition: String
        public let serial: String
        public let customer: String
        public let issuedAtMs: Int64
        public let expiresAtMs: Int64

        public init(edition: String, serial: String, customer: String, issuedAtMs: Int64, expiresAtMs: Int64) {
            self.edition = edition
            self.serial = serial
            self.customer = customer
            self.issuedAtMs = issuedAtMs
            self.expiresAtMs = expiresAtMs
        }
    }

    public enum State: Equatable {
        case notConfigured
        case valid(Info, daysLeft: Int64)
        case expiringSoon(Info, daysLeft: Int64)
        case expired(Info)
        case invalid
    }

    /// Verifies and parses [code]. Returns `nil` on any failure, including a genuine code for an
    /// edition other than [edition], so a cheaper code cannot unlock a dearer build.
    public static func verify(code: String, edition: String, publicKeyB64: String = publicKeyB64) -> Info? {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix(prefix) else { return nil }
        let rest = String(trimmed.dropFirst(prefix.count))
        guard let sep = rest.lastIndex(of: ":"),
              sep > rest.startIndex, rest.index(after: sep) < rest.endIndex else { return nil }

        guard let payload = base64UrlDecode(String(rest[rest.startIndex..<sep])),
              let signature = base64UrlDecode(String(rest[rest.index(after: sep)...])),
              signature.count == 64,
              let publicKeyRaw = base64UrlDecode(publicKeyB64),
              let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: publicKeyRaw),
              publicKey.isValidSignature(signature, for: payload) else { return nil }

        guard let payloadStr = String(data: payload, encoding: .utf8) else { return nil }
        let fields = payloadStr.components(separatedBy: "|")
        guard fields.count == 6, fields[0] == "1" else { return nil }
        guard editions.contains(fields[1]), fields[1] == edition else { return nil }
        guard let issuedAtMs = Int64(fields[4]), let expiresAtMs = Int64(fields[5]) else { return nil }
        return Info(edition: fields[1], serial: fields[2], customer: fields[3],
                    issuedAtMs: issuedAtMs, expiresAtMs: expiresAtMs)
    }

    /// State of a stored [code] at the trusted time [nowMs].
    public static func state(code: String?, edition: String, nowMs: Int64,
                             publicKeyB64: String = publicKeyB64) -> State {
        guard let code else { return .notConfigured }
        guard let info = verify(code: code, edition: edition, publicKeyB64: publicKeyB64) else { return .invalid }
        if nowMs >= info.expiresAtMs { return .expired(info) }
        let daysLeft = (info.expiresAtMs - nowMs) / msPerDay
        return daysLeft <= expiringSoonDays ? .expiringSoon(info, daysLeft: daysLeft) : .valid(info, daysLeft: daysLeft)
    }

    private static func base64UrlDecode(_ s: String) -> Data? {
        var b64 = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let remainder = b64.count % 4
        if remainder > 0 { b64 += String(repeating: "=", count: 4 - remainder) }
        return Data(base64Encoded: b64)
    }
}
