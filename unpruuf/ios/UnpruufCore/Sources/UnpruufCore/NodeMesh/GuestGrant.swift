import CryptoKit
import Foundation

/// Guest grant for the free Client app, same bytes as Android's `GuestGrant` and
/// `node-mesh-server/src/guest/guestGrant.ts`, pinned by `guest-grants/vectors.json`. A guest only
/// stores the token and sends it; the node checks the MAC. Tokens are secrets: never log them.
public enum GuestGrant {
    public static let version: UInt8 = 1
    public static let maxScopeBytes = 64
    private static let fixedLength = 32
    private static let macDomain = Data("unpruuf-guest-grant-v1\0".utf8)
    private static let hkdfInfo = Data("unpruuf guest grant v1".utf8)

    public struct Info: Equatable {
        public let grantId: Data
        public let notAfterMs: Int64
        public let depositsPerHour: Int
        public let bytesPerHour: Int64
        public let scope: Data
    }

    /// Issues `<base64url(grant)>.<base64url(mac)>`. Owner side only.
    public static func issue(ownerSecret: String, grantId: Data, notAfterMs: Int64, depositsPerHour: Int,
                             bytesPerHour: Int64, scope: Data = Data()) -> String? {
        guard grantId.count == 16, scope.count <= maxScopeBytes, (0...0xFFFF).contains(depositsPerHour),
              (0...0xFFFF_FFFF).contains(bytesPerHour), notAfterMs >= 0 else { return nil }
        var grant = Data([version])
        grant.append(grantId)
        withUnsafeBytes(of: notAfterMs.bigEndian) { grant.append(contentsOf: $0) }
        withUnsafeBytes(of: UInt16(depositsPerHour).bigEndian) { grant.append(contentsOf: $0) }
        withUnsafeBytes(of: UInt32(bytesPerHour).bigEndian) { grant.append(contentsOf: $0) }
        grant.append(UInt8(scope.count))
        grant.append(scope)
        let key = HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: Data(ownerSecret.utf8)),
                                         salt: Data(), info: hkdfInfo, outputByteCount: 32)
        let mac = HMAC<SHA256>.authenticationCode(for: macDomain + grant, using: key)
        return base64Url(grant) + "." + base64Url(Data(mac))
    }

    /// Reads the fields of a token without checking it. `nil` for anything malformed.
    public static func parse(_ token: String) -> Info? {
        let parts = token.components(separatedBy: ".")
        guard parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty,
              let raw = base64UrlDecode(parts[0]) else { return nil }
        let bytes = [UInt8](raw)
        guard bytes.count >= fixedLength, bytes[0] == version else { return nil }
        let scopeLength = Int(bytes[31])
        guard scopeLength <= maxScopeBytes, bytes.count == fixedLength + scopeLength else { return nil }
        func number(_ range: Range<Int>) -> UInt64 { bytes[range].reduce(0) { $0 << 8 | UInt64($1) } }
        let notAfter = number(17..<25)
        guard notAfter <= UInt64(Int64.max) else { return nil }
        return Info(grantId: Data(bytes[1..<17]), notAfterMs: Int64(notAfter),
                    depositsPerHour: Int(number(25..<27)), bytesPerHour: Int64(number(27..<31)),
                    scope: Data(bytes[fixedLength...]))
    }

    /// True if the token is unreadable or expires within `windowMs` (default 2 days).
    public static func needsRenewal(_ token: String, nowMs: Int64, windowMs: Int64 = 2 * 86_400_000) -> Bool {
        guard let info = parse(token) else { return true }
        return info.notAfterMs - nowMs <= windowMs
    }

    public static func authorizationHeader(_ token: String) -> String { "Guest \(token)" }

    public static func encodeList(_ tokens: [String]) -> String { tokens.joined(separator: ";") }

    /// At most `max` tokens, index-aligned with the node addresses. Anything unreadable becomes an
    /// empty slot instead of being trusted.
    public static func decodeList(_ raw: String, max: Int) -> [String] {
        raw.components(separatedBy: ";").prefix(max).map { parse($0) == nil ? "" : $0 }
    }

    private static func base64Url(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func base64UrlDecode(_ s: String) -> Data? {
        var b64 = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let remainder = b64.count % 4
        if remainder > 0 { b64 += String(repeating: "=", count: 4 - remainder) }
        return Data(base64Encoded: b64)
    }
}
