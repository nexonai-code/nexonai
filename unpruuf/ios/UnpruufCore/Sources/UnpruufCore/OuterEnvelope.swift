import CryptoKit
import Foundation

/// Outer per-contact AES-256-GCM envelope — every packet on the wire (chat messages, control
/// signals like revoke/delete/Wechsel, dummy cover traffic) is wrapped in this before
/// ``NetworkObfuscation/padPacket`` pads it. Direct port of the relevant half of the Android
/// app's `CryptoManager.kt` (`encryptForContact`/`decryptWithKey`).
///
/// Output layout: `iv(12) || ciphertext || tag(16)` — this is exactly `CryptoKit.AES.GCM.SealedBox.combined`'s
/// layout and exactly what Java's `Cipher.doFinal` for AES/GCM produces on the Android side (tag
/// appended to the ciphertext), so no manual reassembly is needed on either side of this port.
public enum OuterEnvelope {
    /// Encrypts `plaintext` with a contact's 32-byte receive key.
    public static func encrypt(plaintext: Data, contactKey32: Data) throws -> Data {
        let key = SymmetricKey(data: contactKey32)
        let sealed = try AES.GCM.seal(plaintext, using: key)
        guard let combined = sealed.combined else {
            throw OuterEnvelopeError.sealFailed
        }
        return combined
    }

    /// Decrypts a message that was encrypted with `myKey32` (our own receive key).
    public static func decrypt(data: Data, myKey32: Data) throws -> Data {
        guard data.count > 12 else { throw OuterEnvelopeError.dataTooShort }
        let key = SymmetricKey(data: myKey32)
        let sealed = try AES.GCM.SealedBox(combined: data)
        return try AES.GCM.open(sealed, using: key)
    }
}

public enum OuterEnvelopeError: Error {
    case sealFailed
    case dataTooShort
}
