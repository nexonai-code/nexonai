import XCTest
@testable import UnpruufCore

final class OuterEnvelopeTests: XCTestCase {

    private func randomData(_ count: Int) -> Data {
        var d = Data(count: count)
        _ = d.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!) }
        return d
    }

    func test_encryptDecrypt_roundTrips() throws {
        let key = randomData(32)
        let plaintext = "hello unpruuf".data(using: .utf8)!
        let encrypted = try OuterEnvelope.encrypt(plaintext: plaintext, contactKey32: key)
        let decrypted = try OuterEnvelope.decrypt(data: encrypted, myKey32: key)
        XCTAssertEqual(decrypted, plaintext)
    }

    func test_outputLayout_isIvPlusCiphertextPlusTag() throws {
        let key = randomData(32)
        let plaintext = randomData(100)
        let encrypted = try OuterEnvelope.encrypt(plaintext: plaintext, contactKey32: key)
        // iv(12) + ciphertext(100) + tag(16)
        XCTAssertEqual(encrypted.count, 12 + 100 + 16)
    }

    func test_decryptingWithWrongKey_fails() throws {
        let key = randomData(32)
        let wrongKey = randomData(32)
        let encrypted = try OuterEnvelope.encrypt(plaintext: "secret".data(using: .utf8)!, contactKey32: key)
        XCTAssertThrowsError(try OuterEnvelope.decrypt(data: encrypted, myKey32: wrongKey))
    }

    func test_decryptingTooShortData_throwsWithoutCrashing() {
        XCTAssertThrowsError(try OuterEnvelope.decrypt(data: Data([1, 2, 3]), myKey32: randomData(32)))
    }
}
