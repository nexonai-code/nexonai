import CryptoKit
import Foundation

/// Bootstraps a Double Ratchet session's very first root key from the mutual-QR pairing exchange
/// — "X3DH-lite" because both sides already know both X25519 identity keys by the time either can
/// send anything (mutual QR, not an async one-sided handshake), so this is a single DH plus an
/// HKDF, not the full Signal X3DH protocol. Mirrors the Android app's
/// `RatchetSessionManager.deriveSharedSecret`.
public enum X3DHBootstrap {
    private static let info = "unpruuf-x3dh-lite-v1".data(using: .utf8)!

    /// `salt` must be the pair's symmetric shared secret (`Identity.pairSecret`), not either
    /// side's own key alone — using an asymmetric value here would make each side derive a
    /// different root key and silently break decryption in both directions despite pairing itself
    /// succeeding (see the Android class's doc comment for the bug this guards against).
    public static func deriveSharedSecret(myPrivateKey: Data, theirPublicKey: Data, salt: Data) throws -> Data {
        let priv = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: myPrivateKey)
        let pub = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: theirPublicKey)
        let dh = try priv.sharedSecretFromKeyAgreement(with: pub).withUnsafeBytes { Data($0) }
        return HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: dh), salt: salt, info: info, outputByteCount: 32
        ).withUnsafeBytes { Data($0) }
    }
}
