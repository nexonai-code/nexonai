import CryptoSwift
import Foundation

/// The only node address the Node-Mesh accepts: a v3 onion, `^[a-z2-7]{56}\.onion$`. Anything else
/// would leave through a Tor exit in the clear, so every value from outside (pairing code, node
/// lists, owner strings, NODEMIGRATE, TEMPNODE, GRANT_RENEW) goes through this, and again right
/// before each connection. Android checks the form only; this also checks the version byte and
/// the checksum, which is stricter and allowed.
public enum OnionAddress {
    private static let suffix = ".onion"
    private static let hostLength = 56
    private static let alphabet = Array("abcdefghijklmnopqrstuvwxyz234567".utf8)

    public static func isValid(_ address: String) -> Bool {
        let utf8 = Array(address.utf8)
        guard utf8.count == hostLength + suffix.utf8.count, address.hasSuffix(suffix),
              let raw = decodeBase32(utf8.prefix(hostLength)), raw.count == 35 else { return false }
        let publicKey = Array(raw[0..<32])
        let checksum = Array(raw[32..<34])
        let version = raw[34]
        guard version == 3 else { return false }
        let digest = SHA3(variant: .sha256).calculate(for: Array(".onion checksum".utf8) + publicKey + [version])
        return Array(digest.prefix(2)) == checksum
    }

    /// 56 base32 characters are exactly 280 bits, so there are no left-over bits to check.
    private static func decodeBase32(_ chars: ArraySlice<UInt8>) -> [UInt8]? {
        var out: [UInt8] = []
        var buffer: UInt32 = 0
        var bits = 0
        for c in chars {
            guard let value = alphabet.firstIndex(of: c) else { return nil }
            buffer = (buffer << 5) | UInt32(value)
            bits += 5
            if bits >= 8 {
                bits -= 8
                out.append(UInt8((buffer >> UInt32(bits)) & 0xFF))
                buffer &= (1 << UInt32(bits)) - 1
            }
        }
        return out
    }
}
