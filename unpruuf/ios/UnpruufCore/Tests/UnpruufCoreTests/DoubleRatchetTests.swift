import XCTest
import CryptoKit
@testable import UnpruufCore

/// Mirrors the Android app's `DoubleRatchetTest.kt` case-for-case, so the two implementations are
/// exercised the same way even though they can't literally share a test runner.
final class DoubleRatchetTests: XCTestCase {

    private let ad = "routing-tag".data(using: .utf8)!
    private let rotationFactor: Data = {
        var d = Data(count: 32)
        _ = d.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 32, $0.baseAddress!) }
        return d
    }()

    /// Mirrors the HKDF(DH(a,b), salt=rotationFactor) bootstrap planned for pairing.
    private func sharedSecret(myPriv: Data, theirPub: Data) throws -> Data {
        let priv = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: myPriv)
        let pub = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: theirPub)
        let dh = try priv.sharedSecretFromKeyAgreement(with: pub).withUnsafeBytes { Data($0) }
        return HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: dh), salt: rotationFactor,
            info: "unpruuf-x3dh-lite".data(using: .utf8)!, outputByteCount: 32
        ).withUnsafeBytes { Data($0) }
    }

    private func pairedSessions() throws -> (a: DoubleRatchet.RatchetState, b: DoubleRatchet.RatchetState) {
        let a = DoubleRatchet.generateKeyPair() // long-term key, "initiator"
        let b = DoubleRatchet.generateKeyPair() // ephemeral key, "partner"
        let sharedA = try sharedSecret(myPriv: a.privateKey, theirPub: b.publicKey)
        let sharedB = try sharedSecret(myPriv: b.privateKey, theirPub: a.publicKey)
        XCTAssertEqual(sharedA, sharedB, "both sides derive the same X3DH-lite secret")
        let stateB = try DoubleRatchet.initSender(sharedRootKey: sharedB, ownKeyPair: b, theirPublicKey: a.publicKey)
        let stateA = DoubleRatchet.initReceiver(sharedRootKey: sharedA, ownKeyPair: a)
        return (stateA, stateB)
    }

    func test_firstMessageFromSenderInitSide_bootstrapsReceiverInitSide() throws {
        let (stateA, stateB) = try pairedSessions()
        let msg = try DoubleRatchet.encrypt(state: stateB, plaintext: "hello from B".data(using: .utf8)!, associatedData: ad)
        let plaintext = try DoubleRatchet.decrypt(state: stateA, header: msg.header, ciphertext: msg.ciphertext, associatedData: ad)
        XCTAssertEqual(String(data: plaintext, encoding: .utf8), "hello from B")
    }

    func test_receiverInitSide_cannotSendBeforeReceivingAnything() throws {
        let (stateA, _) = try pairedSessions()
        XCTAssertThrowsError(try DoubleRatchet.encrypt(state: stateA, plaintext: "too early".data(using: .utf8)!, associatedData: ad)) { error in
            XCTAssertTrue(error is DoubleRatchet.RatchetError)
        }
    }

    func test_messagesRoundTrip_acrossManyDHRatchetSteps() throws {
        let (stateA, stateB) = try pairedSessions()
        let first = try DoubleRatchet.encrypt(state: stateB, plaintext: "kickoff".data(using: .utf8)!, associatedData: ad)
        _ = try DoubleRatchet.decrypt(state: stateA, header: first.header, ciphertext: first.ciphertext, associatedData: ad)

        for i in 0..<10 {
            let fromB = try DoubleRatchet.encrypt(state: stateB, plaintext: "b-\(i)".data(using: .utf8)!, associatedData: ad)
            let openedB = try DoubleRatchet.decrypt(state: stateA, header: fromB.header, ciphertext: fromB.ciphertext, associatedData: ad)
            XCTAssertEqual(String(data: openedB, encoding: .utf8), "b-\(i)")

            let fromA = try DoubleRatchet.encrypt(state: stateA, plaintext: "a-\(i)".data(using: .utf8)!, associatedData: ad)
            let openedA = try DoubleRatchet.decrypt(state: stateB, header: fromA.header, ciphertext: fromA.ciphertext, associatedData: ad)
            XCTAssertEqual(String(data: openedA, encoding: .utf8), "a-\(i)")
        }
    }

    func test_outOfOrderMessagesWithinOneChain_stillDecrypt() throws {
        let (stateA, stateB) = try pairedSessions()
        let first = try DoubleRatchet.encrypt(state: stateB, plaintext: "kickoff".data(using: .utf8)!, associatedData: ad)
        _ = try DoubleRatchet.decrypt(state: stateA, header: first.header, ciphertext: first.ciphertext, associatedData: ad)

        let sent = try (0..<4).map { i in try DoubleRatchet.encrypt(state: stateB, plaintext: "ooo-\(i)".data(using: .utf8)!, associatedData: ad) }
        for idx in [3, 1, 0, 2] {
            let m = sent[idx]
            let opened = try DoubleRatchet.decrypt(state: stateA, header: m.header, ciphertext: m.ciphertext, associatedData: ad)
            XCTAssertEqual(String(data: opened, encoding: .utf8), "ooo-\(idx)")
        }
    }

    func test_messageLostInTransit_isRecoveredLaterViaSkippedKeyCache() throws {
        let (stateA, stateB) = try pairedSessions()
        let first = try DoubleRatchet.encrypt(state: stateB, plaintext: "kickoff".data(using: .utf8)!, associatedData: ad)
        _ = try DoubleRatchet.decrypt(state: stateA, header: first.header, ciphertext: first.ciphertext, associatedData: ad)

        let lost = try DoubleRatchet.encrypt(state: stateB, plaintext: "lost".data(using: .utf8)!, associatedData: ad)
        let arrives = try DoubleRatchet.encrypt(state: stateB, plaintext: "arrives".data(using: .utf8)!, associatedData: ad)
        let later = try DoubleRatchet.encrypt(state: stateB, plaintext: "later".data(using: .utf8)!, associatedData: ad)

        let openedArrives = try DoubleRatchet.decrypt(state: stateA, header: arrives.header, ciphertext: arrives.ciphertext, associatedData: ad)
        XCTAssertEqual(String(data: openedArrives, encoding: .utf8), "arrives")
        let openedLater = try DoubleRatchet.decrypt(state: stateA, header: later.header, ciphertext: later.ciphertext, associatedData: ad)
        XCTAssertEqual(String(data: openedLater, encoding: .utf8), "later")
        let openedLost = try DoubleRatchet.decrypt(state: stateA, header: lost.header, ciphertext: lost.ciphertext, associatedData: ad)
        XCTAssertEqual(String(data: openedLost, encoding: .utf8), "lost")
    }

    func test_decryptingWithWrongAssociatedData_fails() throws {
        let (stateA, stateB) = try pairedSessions()
        let first = try DoubleRatchet.encrypt(state: stateB, plaintext: "kickoff".data(using: .utf8)!, associatedData: ad)
        _ = try DoubleRatchet.decrypt(state: stateA, header: first.header, ciphertext: first.ciphertext, associatedData: ad)

        let msg = try DoubleRatchet.encrypt(state: stateB, plaintext: "tamper-me".data(using: .utf8)!, associatedData: ad)
        XCTAssertThrowsError(try DoubleRatchet.decrypt(state: stateA, header: msg.header, ciphertext: msg.ciphertext, associatedData: "wrong-tag".data(using: .utf8)!))
    }

    func test_ratchetHeader_roundTripsThroughWireEncoding() throws {
        let header = RatchetHeader(dhPub: Data((0..<32).map { UInt8($0) }), previousChainLength: 7, messageNumber: 42)
        let decoded = try RatchetHeader.decode(try header.encode())
        XCTAssertEqual(header, decoded)
    }
}
