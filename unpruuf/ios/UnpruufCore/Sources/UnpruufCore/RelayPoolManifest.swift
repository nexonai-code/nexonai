import CryptoKit
import Foundation

/// Offline verification of a company-issued relay-pool manifest — see
/// `unpruuf/relaypool-tool/` for the offline signer (its private key never ships; a SEPARATE
/// Ed25519 key pair from any license/signing key the project might use elsewhere — a leaked
/// relay-pool key only lets someone hand out bogus relay ADDRESSES, never anything else, and
/// vice versa). Format: `unpruuf-relaypool:v1:<base64url(payload)>:<base64url(signature)>`,
/// payload `1|<org>|<issuedAtMs>|<relay1>;<relay2>;...` — same hand-rolled pipe-delimited style
/// as `RelayConnectionString`, deliberately not JSON so there's nothing to canonicalize before
/// verifying. Verified with CryptoKit's `Curve25519.Signing.PublicKey` — the first Ed25519
/// verifier in this project's iOS code (cross-checked against relaypool-tool's Node-side signer
/// and against Tink's `Ed25519Verify` on the Android side before shipping; all three accept the
/// same signature over the same payload bytes).
public enum RelayPoolManifest {
    private static let prefix = "unpruuf-relaypool:v1:"

    public struct Info: Equatable {
        public let org: String
        public let issuedAtMs: Int64
        public let relays: [String]

        public init(org: String, issuedAtMs: Int64, relays: [String]) {
            self.org = org
            self.issuedAtMs = issuedAtMs
            self.relays = relays
        }
    }

    /// Verifies and parses [code] against [publicKeyB64] (base64url of the raw 32-byte Ed25519
    /// public key — see `relaypool-tool/keygen.js`'s printed output). Returns `nil` on any
    /// failure: bad prefix, bad base64, bad signature, malformed payload, or a relay entry that
    /// doesn't parse as a real connection string.
    public static func verify(code: String, publicKeyB64: String) -> Info? {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix(prefix) else { return nil }
        let rest = String(trimmed.dropFirst(prefix.count))
        guard let sep = rest.lastIndex(of: ":"),
              sep > rest.startIndex, rest.index(after: sep) < rest.endIndex else { return nil }
        let payloadB64 = String(rest[rest.startIndex..<sep])
        let sigB64 = String(rest[rest.index(after: sep)...])

        guard let payload = base64UrlDecode(payloadB64),
              let signature = base64UrlDecode(sigB64),
              signature.count == 64,
              let publicKeyRaw = base64UrlDecode(publicKeyB64) else { return nil }

        guard let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: publicKeyRaw) else {
            return nil
        }
        guard publicKey.isValidSignature(signature, for: payload) else { return nil }

        guard let payloadStr = String(data: payload, encoding: .utf8) else { return nil }
        let fields = payloadStr.components(separatedBy: "|")
        guard fields.count == 4, fields[0] == "1", !fields[1].isEmpty else { return nil }
        guard let issuedAtMs = Int64(fields[2]) else { return nil }
        let relays = RelayConnectionString.parseList(fields[3])
        guard !relays.isEmpty, relays.allSatisfy({ RelayConnectionString.parse($0) != nil }) else {
            return nil
        }
        return Info(org: fields[1], issuedAtMs: issuedAtMs, relays: relays)
    }

    private static func base64UrlDecode(_ s: String) -> Data? {
        var b64 = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let remainder = b64.count % 4
        if remainder > 0 { b64 += String(repeating: "=", count: 4 - remainder) }
        return Data(base64Encoded: b64)
    }
}
