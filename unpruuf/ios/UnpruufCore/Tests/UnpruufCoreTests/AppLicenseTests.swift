import CryptoKit
import XCTest
@testable import UnpruufCore

final class AppLicenseTests: XCTestCase {

    // The shared vectors of 27.10.2026 use a throw-away key; the production key is never tested
    // against, that would take a real code.
    private struct Vectors: Decodable {
        struct Licence: Decodable {
            let publicKeyB64: String
            let appCode: String
            let serverCode: String
            let tamperedAppCode: String
        }
        let licence: Licence
    }

    private static let vectors: Vectors.Licence = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("vectors/ios-vectors-2026-10-27.json")
        return try! JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url)).licence
    }()

    private let issuedAt: Int64 = 1_800_000_000_000
    private let expiresAt: Int64 = 1_831_536_000_000
    private let day: Int64 = 86_400_000

    private func sign(_ payload: String, with privateKey: Curve25519.Signing.PrivateKey) -> String {
        let payloadData = Data(payload.utf8)
        let signature = try! privateKey.signature(for: payloadData)
        return "unpruuf-license:v1:\(payloadData.base64URLEncodedString()):\(signature.base64URLEncodedString())"
    }

    func test_productionKey_isTheNewKey() {
        XCTAssertEqual(AppLicense.publicKeyB64, "t7ZQMSMx3iMbLZ9ke7c-2hYSkgRvyw43HZzaIyvyVC4")
        XCTAssertEqual(AppLicense.publicKeyB64.count, 43)
    }

    func test_verify_vectorCode_parsesEveryField() {
        let v = Self.vectors
        let info = AppLicense.verify(code: v.appCode, edition: "pro", publicKeyB64: v.publicKeyB64)
        XCTAssertEqual(info, AppLicense.Info(edition: "pro", serial: "VEC-0001", customer: "Test Vector",
                                             issuedAtMs: issuedAt, expiresAtMs: expiresAt))
    }

    func test_verify_toleratesSurroundingWhitespace() {
        let v = Self.vectors
        XCTAssertNotNil(AppLicense.verify(code: " \(v.appCode)\n", edition: "pro", publicKeyB64: v.publicKeyB64))
    }

    func test_verify_tamperedCode_returnsNil() {
        let v = Self.vectors
        XCTAssertNil(AppLicense.verify(code: v.tamperedAppCode, edition: "pro", publicKeyB64: v.publicKeyB64))
    }

    func test_verify_wrongEdition_returnsNil() {
        let v = Self.vectors
        XCTAssertNil(AppLicense.verify(code: v.appCode, edition: "standard", publicKeyB64: v.publicKeyB64))
    }

    func test_verify_vectorCodeAgainstProductionKey_returnsNil() {
        XCTAssertNil(AppLicense.verify(code: Self.vectors.appCode, edition: "pro"))
    }

    func test_verify_serverCode_returnsNil() {
        let v = Self.vectors
        XCTAssertNil(AppLicense.verify(code: v.serverCode, edition: "pro", publicKeyB64: v.publicKeyB64))
    }

    func test_verify_malformedPayloads_returnNil() {
        let key = Curve25519.Signing.PrivateKey()
        let pub = key.publicKey.rawRepresentation.base64URLEncodedString()
        XCTAssertNotNil(AppLicense.verify(code: sign("1|pro|S|C|1|2", with: key), edition: "pro", publicKeyB64: pub))
        for payload in ["2|pro|S|C|1|2", "1|pro|S|C|1", "1|pro|S|C|1|2|3", "1|pro|S|C|x|2", "1|pro|S|C|1|y"] {
            XCTAssertNil(AppLicense.verify(code: sign(payload, with: key), edition: "pro", publicKeyB64: pub), payload)
        }
        XCTAssertNil(AppLicense.verify(code: sign("1|ghost|S|C|1|2", with: key), edition: "ghost", publicKeyB64: pub))
        XCTAssertNil(AppLicense.verify(code: "unpruuf-license:v1:", edition: "pro", publicKeyB64: pub))
        XCTAssertNil(AppLicense.verify(code: "unpruuf-license:v1:abc:", edition: "pro", publicKeyB64: pub))
        XCTAssertNil(AppLicense.verify(code: "unpruuf-license:v1:abc:def", edition: "pro", publicKeyB64: pub))
    }

    func test_state_followsTheClock() {
        let v = Self.vectors
        func state(_ now: Int64) -> AppLicense.State {
            AppLicense.state(code: v.appCode, edition: "pro", nowMs: now, publicKeyB64: v.publicKeyB64)
        }
        let info = AppLicense.verify(code: v.appCode, edition: "pro", publicKeyB64: v.publicKeyB64)!
        XCTAssertEqual(state(expiresAt - 31 * day), .valid(info, daysLeft: 31))
        XCTAssertEqual(state(expiresAt - 30 * day), .expiringSoon(info, daysLeft: 30))
        XCTAssertEqual(state(expiresAt - 1), .expiringSoon(info, daysLeft: 0))
        XCTAssertEqual(state(expiresAt), .expired(info))
        XCTAssertEqual(state(expiresAt + day), .expired(info))
    }

    func test_state_noCodeAndBadCode() {
        XCTAssertEqual(AppLicense.state(code: nil, edition: "pro", nowMs: issuedAt), .notConfigured)
        XCTAssertEqual(AppLicense.state(code: "nonsense", edition: "pro", nowMs: issuedAt), .invalid)
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
