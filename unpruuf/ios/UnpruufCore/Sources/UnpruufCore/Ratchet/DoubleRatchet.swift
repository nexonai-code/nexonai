import CryptoKit
import CryptoSwift
import Foundation

/// Textbook Double Ratchet (Signal spec: https://signal.org/docs/specifications/doubleratchet/),
/// a direct port of the Android app's `DoubleRatchet.kt`. Built on CryptoKit for every primitive
/// it has natively (X25519, HKDF, HMAC-SHA256) plus CryptoSwift for the one primitive CryptoKit
/// lacks: XChaCha20-Poly1305 (CryptoKit's `ChaChaPoly` is the 12-byte-nonce IETF variant, not the
/// 24-byte-nonce XChaCha20 variant the Android side uses via Tink). All CryptoSwift-specific
/// calls are isolated in the `aeadSeal`/`aeadOpen` pair at the bottom of this file — if
/// CryptoSwift's exact API surface doesn't match what's assumed here, the fix is contained to
/// those two functions and does not touch the ratchet algorithm itself.
///
/// **Wire compatibility requirement:** the AEAD output layout here — `nonce(24) || ciphertext ||
/// tag(16)` — must exactly match Tink's `XChaCha20Poly1305.encrypt()` on the Android side (see
/// that class's doc comment). This is the single highest-value thing to double-check first if
/// cross-platform messages fail to decrypt.
public enum DoubleRatchet {

    /// Bounded so a malicious/broken peer can't force unbounded memory growth.
    public static let maxSkippedKeys = 1000

    private static let rootKdfInfo = "unpruuf-ratchet-root-v1".data(using: .utf8)!

    public struct RatchetError: Error {
        public let message: String
        public init(_ message: String) { self.message = message }
    }

    public struct KeyPair {
        public let privateKey: Data
        public let publicKey: Data
        public init(privateKey: Data, publicKey: Data) {
            self.privateKey = privateKey
            self.publicKey = publicKey
        }
    }

    /// Mutable ratchet session state for one direction of one contact. All fields are
    /// intentionally mutable — `encrypt`/`decrypt` advance them in place, and the caller is
    /// responsible for persisting the result after every call so forward secrecy survives an app
    /// restart (old keys are simply overwritten).
    public final class RatchetState {
        public var dhsPrivateKey: Data
        public var dhsPublicKey: Data
        public var dhr: Data?
        public var rootKey: Data
        public var sendChainKey: Data?
        public var recvChainKey: Data?
        public var sendCount: Int32
        public var recvCount: Int32
        public var previousChainLength: Int32
        public var skippedKeys: [String: Data]

        public init(
            dhsPrivateKey: Data, dhsPublicKey: Data, dhr: Data?, rootKey: Data,
            sendChainKey: Data?, recvChainKey: Data?, sendCount: Int32 = 0, recvCount: Int32 = 0,
            previousChainLength: Int32 = 0, skippedKeys: [String: Data] = [:]
        ) {
            self.dhsPrivateKey = dhsPrivateKey
            self.dhsPublicKey = dhsPublicKey
            self.dhr = dhr
            self.rootKey = rootKey
            self.sendChainKey = sendChainKey
            self.recvChainKey = recvChainKey
            self.sendCount = sendCount
            self.recvCount = recvCount
            self.previousChainLength = previousChainLength
            self.skippedKeys = skippedKeys
        }
    }

    public struct EncryptedMessage {
        public let header: RatchetHeader
        public let ciphertext: Data
    }

    public static func generateKeyPair() -> KeyPair {
        let priv = Curve25519.KeyAgreement.PrivateKey()
        return KeyPair(privateKey: priv.rawRepresentation, publicKey: priv.publicKey.rawRepresentation)
    }

    /// Initialise as the party that already knows the peer's ratchet public key. Performs the
    /// initial sending DH step immediately, so this side can send right away.
    public static func initSender(sharedRootKey: Data, ownKeyPair: KeyPair, theirPublicKey: Data) throws -> RatchetState {
        let state = RatchetState(
            dhsPrivateKey: ownKeyPair.privateKey, dhsPublicKey: ownKeyPair.publicKey,
            dhr: theirPublicKey, rootKey: sharedRootKey, sendChainKey: nil, recvChainKey: nil
        )
        let (rk, ck) = try kdfRootKey(rootKey: state.rootKey, dhOutput: try dh(privateKey: state.dhsPrivateKey, publicKey: theirPublicKey))
        state.rootKey = rk
        state.sendChainKey = ck
        return state
    }

    /// Initialise as the party that does NOT yet know the peer's ratchet public key. Cannot send
    /// until `decrypt` has processed at least one inbound message — that is correct Double
    /// Ratchet behaviour, not a bug: only `decrypt` discovers `theirPublicKey` and completes the
    /// matching sending chain via the standard DH-ratchet step.
    public static func initReceiver(sharedRootKey: Data, ownKeyPair: KeyPair) -> RatchetState {
        RatchetState(
            dhsPrivateKey: ownKeyPair.privateKey, dhsPublicKey: ownKeyPair.publicKey,
            dhr: nil, rootKey: sharedRootKey, sendChainKey: nil, recvChainKey: nil
        )
    }

    public static func encrypt(state: RatchetState, plaintext: Data, associatedData: Data) throws -> EncryptedMessage {
        guard let chainKey = state.sendChainKey else {
            throw RatchetError("no sending chain yet — must receive at least one message first")
        }
        let (nextChainKey, messageKey) = try kdfChainKey(chainKey: chainKey)
        state.sendChainKey = nextChainKey
        let header = RatchetHeader(dhPub: state.dhsPublicKey, previousChainLength: state.previousChainLength, messageNumber: state.sendCount)
        state.sendCount += 1
        let ciphertext = try aeadSeal(messageKey: messageKey, plaintext: plaintext, aad: associatedData + (try header.encode()))
        return EncryptedMessage(header: header, ciphertext: ciphertext)
    }

    public static func decrypt(state: RatchetState, header: RatchetHeader, ciphertext: Data, associatedData: Data) throws -> Data {
        let fullAd = associatedData + (try header.encode())

        if let messageKey = trySkippedKey(state: state, header: header) {
            return try aeadOpen(messageKey: messageKey, ciphertext: ciphertext, aad: fullAd)
        }

        if state.dhr == nil || header.dhPub != state.dhr {
            try skipMessageKeys(state: state, until: header.previousChainLength)
            try dhRatchetStep(state: state, theirNewPublicKey: header.dhPub)
        }

        try skipMessageKeys(state: state, until: header.messageNumber)
        guard let chainKey = state.recvChainKey else {
            throw RatchetError("receiving chain not established")
        }
        let (nextChainKey, messageKey) = try kdfChainKey(chainKey: chainKey)
        state.recvChainKey = nextChainKey
        state.recvCount += 1
        return try aeadOpen(messageKey: messageKey, ciphertext: ciphertext, aad: fullAd)
    }

    // MARK: - DH ratchet

    private static func dhRatchetStep(state: RatchetState, theirNewPublicKey: Data) throws {
        state.previousChainLength = state.sendCount
        state.sendCount = 0
        state.recvCount = 0
        state.dhr = theirNewPublicKey

        let (rk1, recvChain) = try kdfRootKey(rootKey: state.rootKey, dhOutput: try dh(privateKey: state.dhsPrivateKey, publicKey: theirNewPublicKey))
        state.rootKey = rk1
        state.recvChainKey = recvChain

        let newKeyPair = generateKeyPair()
        state.dhsPrivateKey = newKeyPair.privateKey
        state.dhsPublicKey = newKeyPair.publicKey

        let (rk2, sendChain) = try kdfRootKey(rootKey: state.rootKey, dhOutput: try dh(privateKey: state.dhsPrivateKey, publicKey: theirNewPublicKey))
        state.rootKey = rk2
        state.sendChainKey = sendChain
    }

    // MARK: - Skipped message keys (out-of-order delivery)

    private static func skipMessageKeys(state: RatchetState, until: Int32) throws {
        guard let chainKey = state.recvChainKey else { return } // nothing received on this chain yet
        if until - state.recvCount > maxSkippedKeys {
            throw RatchetError("too many skipped messages (\(until - state.recvCount))")
        }
        var ck = chainKey
        while state.recvCount < until {
            let (nextChainKey, messageKey) = try kdfChainKey(chainKey: ck)
            ck = nextChainKey
            state.skippedKeys[skippedKeyId(dhPub: state.dhr!, n: state.recvCount)] = messageKey
            if state.skippedKeys.count > maxSkippedKeys {
                throw RatchetError("skipped-key cache overflow")
            }
            state.recvCount += 1
        }
        state.recvChainKey = ck
    }

    private static func trySkippedKey(state: RatchetState, header: RatchetHeader) -> Data? {
        let id = skippedKeyId(dhPub: header.dhPub, n: header.messageNumber)
        return state.skippedKeys.removeValue(forKey: id)
    }

    private static func skippedKeyId(dhPub: Data, n: Int32) -> String {
        dhPub.base64EncodedString() + ":" + String(n)
    }

    // MARK: - Primitives

    private static func dh(privateKey: Data, publicKey: Data) throws -> Data {
        let priv = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: privateKey)
        let pub = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: publicKey)
        let secret = try priv.sharedSecretFromKeyAgreement(with: pub)
        return secret.withUnsafeBytes { Data($0) }
    }

    /// KDF_RK: derives a fresh root key + chain key from the running root key and a new DH output.
    private static func kdfRootKey(rootKey: Data, dhOutput: Data) throws -> (rootKey: Data, chainKey: Data) {
        let out = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: dhOutput),
            salt: rootKey,
            info: rootKdfInfo,
            outputByteCount: 64
        ).withUnsafeBytes { Data($0) }
        return (out.subdata(in: 0..<32), out.subdata(in: 32..<64))
    }

    /// KDF_CK: advances a symmetric chain by one step, yielding (nextChainKey, messageKey).
    private static func kdfChainKey(chainKey: Data) throws -> (nextChainKey: Data, messageKey: Data) {
        let nextChainKey = hmac(key: chainKey, data: Data([0x02]))
        let messageKey = hmac(key: chainKey, data: Data([0x01]))
        return (nextChainKey, messageKey)
    }

    private static func hmac(key: Data, data: Data) -> Data {
        let mac = HMAC<SHA256>.authenticationCode(for: data, using: SymmetricKey(data: key))
        return Data(mac)
    }

    // MARK: - AEAD (XChaCha20-Poly1305, via CryptoSwift — see file doc comment)

    private static let xchachaNonceSize = 24
    private static let xchachaTagSize = 16

    private static func aeadSeal(messageKey: Data, plaintext: Data, aad: Data) throws -> Data {
        var nonceBytes = [UInt8](repeating: 0, count: xchachaNonceSize)
        let status = SecRandomCopyBytes(kSecRandomDefault, xchachaNonceSize, &nonceBytes)
        guard status == errSecSuccess else { throw RatchetError("failed to generate nonce") }

        let result = try AEADXChaCha20Poly1305.encrypt(
            [UInt8](plaintext), key: [UInt8](messageKey), iv: nonceBytes, authenticationHeader: [UInt8](aad)
        )
        // Matches Tink's XChaCha20Poly1305 output framing on the Android side: nonce || ciphertext || tag.
        var out = Data(nonceBytes)
        out.append(contentsOf: result.cipherText)
        out.append(contentsOf: result.authenticationTag)
        return out
    }

    private static func aeadOpen(messageKey: Data, ciphertext: Data, aad: Data) throws -> Data {
        guard ciphertext.count >= xchachaNonceSize + xchachaTagSize else {
            throw RatchetError("ciphertext too short")
        }
        let bytes = [UInt8](ciphertext)
        let nonce = Array(bytes[0..<xchachaNonceSize])
        let tagStart = bytes.count - xchachaTagSize
        let inner = Array(bytes[xchachaNonceSize..<tagStart])
        let tag = Array(bytes[tagStart...])

        let result = try AEADXChaCha20Poly1305.decrypt(
            inner, key: [UInt8](messageKey), iv: nonce, authenticationHeader: [UInt8](aad), authenticationTag: tag
        )
        guard result.success else { throw RatchetError("AEAD authentication failed") }
        return Data(result.plainText)
    }
}
