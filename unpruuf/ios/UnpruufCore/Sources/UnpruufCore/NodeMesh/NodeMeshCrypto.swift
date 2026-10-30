import CryptoKit
import Foundation

/// The values generated fresh for one contact, shown only in that one pairing code.
public struct NodeMeshPairKeys {
    public let messageKey: Data
    public let ratchetKeyPair: DoubleRatchet.KeyPair
    public let routingSeed: Data

    public init(messageKey: Data, ratchetKeyPair: DoubleRatchet.KeyPair, routingSeed: Data) {
        self.messageKey = messageKey
        self.ratchetKeyPair = ratchetKeyPair
        self.routingSeed = routingSeed
    }

    public static func generate() -> NodeMeshPairKeys {
        NodeMeshPairKeys(
            messageKey: SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) },
            ratchetKeyPair: DoubleRatchet.generateKeyPair(),
            routingSeed: SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
        )
    }
}

/// Message crypto of the Node-Mesh: the relay pipeline with per-contact keys. Same steps as
/// `RelayService`, so the packet format is the one every client already speaks.
public enum NodeMeshCrypto {
    public static func pairSecret(myMessageKey: Data, theirMessageKey: Data) -> Data {
        NodeMeshRouting.sortedHash(myMessageKey, theirMessageKey)
    }

    /// The smaller X25519 public key sends first, both sides reach the same decision.
    public static func createSession(myRatchetKeyPair: DoubleRatchet.KeyPair, theirRatchetPublicKey: Data,
                                     pairSecret: Data) throws -> DoubleRatchet.RatchetState {
        let shared = try X3DHBootstrap.deriveSharedSecret(
            myPrivateKey: myRatchetKeyPair.privateKey, theirPublicKey: theirRatchetPublicKey, salt: pairSecret
        )
        if [UInt8](myRatchetKeyPair.publicKey).lexicographicallyPrecedes([UInt8](theirRatchetPublicKey)) {
            return try DoubleRatchet.initSender(sharedRootKey: shared, ownKeyPair: myRatchetKeyPair, theirPublicKey: theirRatchetPublicKey)
        }
        return DoubleRatchet.initReceiver(sharedRootKey: shared, ownKeyPair: myRatchetKeyPair)
    }

    public enum SealError: Error { case frameTooLarge }

    /// Plaintext to 4096-byte packets, one per frame, in order. Advances `state`, so the caller
    /// saves it afterwards. All of them or none: a transfer missing a piece never completes.
    public static func seal(plaintext: Data, state: DoubleRatchet.RatchetState, pairSecret: Data,
                            theirMessageKey: Data) throws -> [Data] {
        let encrypted = try DoubleRatchet.encrypt(state: state, plaintext: plaintext, associatedData: pairSecret)
        return try RatchetFrame.split(header: encrypted.header, ciphertext: encrypted.ciphertext).map { frame in
            let sealed = try OuterEnvelope.encrypt(plaintext: try RatchetFrame.encode(frame), contactKey32: theirMessageKey)
            guard sealed.count <= NetworkObfuscation.packetSize - 8 else { throw SealError.frameTooLarge }
            return try NetworkObfuscation.padPacket(sealed)
        }
    }

    /// A control signal or cover packet: outer encryption only, no ratchet.
    public static func sealSignal(_ signal: Data, theirMessageKey: Data) throws -> Data {
        let sealed = try OuterEnvelope.encrypt(plaintext: signal, contactKey32: theirMessageKey)
        guard sealed.count <= NetworkObfuscation.packetSize - 8 else { throw SealError.frameTooLarge }
        return try NetworkObfuscation.padPacket(sealed)
    }

    /// Unpad and outer decrypt with the key I gave this contact. `nil` means not for this contact.
    public static func openOuter(packet: Data, myMessageKey: Data) -> Data? {
        guard let padded = try? NetworkObfuscation.unpadPacket(packet) else { return nil }
        return try? OuterEnvelope.decrypt(data: padded, myKey32: myMessageKey)
    }
}
