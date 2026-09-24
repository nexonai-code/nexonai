import CryptoKit
import Foundation

enum PinResult { case normal, panic, wrong }

/// Local PIN + panic-PIN storage — Swift port of the Android app's `PinManager.kt`. Stores salted
/// PBKDF2-HMAC-SHA256 hashes only, the PIN itself is never stored anywhere.
///
/// Uses a hand-rolled single-block PBKDF2 (RFC 8018) built on CryptoKit's `HMAC<SHA256>`, rather
/// than CommonCrypto's `CCKeyDerivationPBKDF` — CommonCrypto isn't cleanly importable from a pure
/// Swift Package target without extra system-library setup, and this hash is purely local (never
/// sent over the wire, unlike anything in `UnpruufCore`), so there's no need to byte-match
/// Android's PBKDF2 output, only to use an equally standard, equally strong construction. Same
/// 120,000-iteration count as Android for parity.
final class PinManager {
    private let keychain: KeychainStore
    private static let iterations = 120_000

    init(keychain: KeychainStore) {
        self.keychain = keychain
    }

    var isPinSet: Bool {
        keychain.getData("pin_hash") != nil && keychain.getData("panic_hash") != nil
    }

    // Opt-in, off by default. Biometric unlock can only ever stand in for the NORMAL PIN — there
    // is no biometric equivalent of the panic PIN (no "duress fingerprint" gesture), so this flag
    // never affects panic-PIN behavior — same rule as Android's identical comment on this property.
    var isBiometricEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: "biometric_enabled") }
        set { UserDefaults.standard.set(newValue, forKey: "biometric_enabled") }
    }

    func setPins(pin: String, panicPin: String) {
        var salt = Data(count: 16)
        _ = salt.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 16, $0.baseAddress!) }
        keychain.setData("pin_salt", salt)
        keychain.setData("pin_hash", Self.hash(pin, salt: salt))
        keychain.setData("panic_hash", Self.hash(panicPin, salt: salt))
    }

    func check(_ input: String) -> PinResult {
        guard let salt = keychain.getData("pin_salt") else { return .wrong }
        let candidate = Self.hash(input, salt: salt)
        if let pinHash = keychain.getData("pin_hash"), Self.constantTimeEquals(candidate, pinHash) {
            return .normal
        }
        if let panicHash = keychain.getData("panic_hash"), Self.constantTimeEquals(candidate, panicHash) {
            return .panic
        }
        return .wrong
    }

    private static func hash(_ pin: String, salt: Data) -> Data {
        pbkdf2SHA256(password: Data(pin.utf8), salt: salt, iterations: iterations)
    }

    private static func constantTimeEquals(_ a: Data, _ b: Data) -> Bool {
        guard a.count == b.count else { return false }
        var diff: UInt8 = 0
        for i in 0..<a.count { diff |= a[i] ^ b[i] }
        return diff == 0
    }

    /// Single-block PBKDF2-HMAC-SHA256 (dkLen == hLen == 32 bytes, so only U1..Uc need XORing —
    /// no multi-block T_i concatenation). `U1 = HMAC(password, salt ‖ INT32BE(1))`,
    /// `U_j = HMAC(password, U_{j-1})` for j = 2...iterations, result = U1 ⊕ U2 ⊕ ... ⊕ Uc.
    private static func pbkdf2SHA256(password: Data, salt: Data, iterations: Int) -> Data {
        let key = SymmetricKey(data: password)
        let blockIndex: [UInt8] = [0, 0, 0, 1] // INT(1), big-endian
        var u = Data(HMAC<SHA256>.authenticationCode(for: salt + Data(blockIndex), using: key))
        var result = u
        if iterations > 1 {
            for _ in 2...iterations {
                u = Data(HMAC<SHA256>.authenticationCode(for: u, using: key))
                for i in 0..<result.count { result[i] ^= u[i] }
            }
        }
        return result
    }
}
