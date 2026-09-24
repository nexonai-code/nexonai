import CryptoKit
import XCTest
@testable import UnpruufCore

final class RelayPoolManifestTests: XCTestCase {

    // Signs entirely inline with CryptoKit's own Curve25519.Signing.PrivateKey — no dependency
    // on relaypool-tool (Node) being reachable from a test run. This exercises the exact same
    // code path RelayPoolManifest.verify() will run against a real relaypool-tool-issued
    // manifest, just with a throwaway key pair generated fresh per test.
    private func sign(_ payload: String, with privateKey: Curve25519.Signing.PrivateKey) -> String {
        let payloadData = Data(payload.utf8)
        let signature = try! privateKey.signature(for: payloadData)
        return "unpruuf-relaypool:v1:\(payloadData.base64URLEncodedString()):\(signature.base64URLEncodedString())"
    }

    func test_verify_validManifest_roundTrips() {
        let privateKey = Curve25519.Signing.PrivateKey()
        let publicKeyB64 = privateKey.publicKey.rawRepresentation.base64URLEncodedString()
        let relay1 = "unpruuf-relay:v1:a.onion:tok1"
        let relay2 = "unpruuf-relay:v1:b.onion:tok2"
        let code = sign("1|Acme GmbH|1700000000000|\(relay1);\(relay2)", with: privateKey)

        let info = RelayPoolManifest.verify(code: code, publicKeyB64: publicKeyB64)
        XCTAssertEqual(info?.org, "Acme GmbH")
        XCTAssertEqual(info?.issuedAtMs, 1700000000000)
        XCTAssertEqual(info?.relays, [relay1, relay2])
    }

    func test_verify_singleRelay_stillValid() {
        let privateKey = Curve25519.Signing.PrivateKey()
        let publicKeyB64 = privateKey.publicKey.rawRepresentation.base64URLEncodedString()
        let code = sign("1|Solo Org|1700000000000|unpruuf-relay:v1:a.onion:tok1", with: privateKey)

        let info = RelayPoolManifest.verify(code: code, publicKeyB64: publicKeyB64)
        XCTAssertEqual(info?.relays, ["unpruuf-relay:v1:a.onion:tok1"])
    }

    func test_verify_wrongPublicKey_returnsNil() {
        let privateKey = Curve25519.Signing.PrivateKey()
        let wrongPublicKeyB64 = Curve25519.Signing.PrivateKey().publicKey.rawRepresentation.base64URLEncodedString()
        let code = sign("1|Acme GmbH|1700000000000|unpruuf-relay:v1:a.onion:tok1", with: privateKey)

        XCTAssertNil(RelayPoolManifest.verify(code: code, publicKeyB64: wrongPublicKeyB64))
    }

    func test_verify_tamperedPayload_returnsNil() {
        let privateKey = Curve25519.Signing.PrivateKey()
        let publicKeyB64 = privateKey.publicKey.rawRepresentation.base64URLEncodedString()
        let code = sign("1|Acme GmbH|1700000000000|unpruuf-relay:v1:a.onion:tok1", with: privateKey)

        // Swap in a different (still validly-encoded) payload, keeping the original signature —
        // the signature must fail against payload bytes it wasn't produced for.
        // code == "unpruuf-relaypool:v1:<payloadB64>:<sigB64>" — splitting on ":" yields
        // ["unpruuf-relaypool", "v1", "<payloadB64>", "<sigB64>"], so the signature is parts[3].
        let parts = code.split(separator: ":")
        let tamperedPayload = Data("1|Evil Org|1700000000000|unpruuf-relay:v1:evil.onion:tok".utf8).base64URLEncodedString()
        let tamperedCode = "unpruuf-relaypool:v1:\(tamperedPayload):\(parts[3])"

        XCTAssertNil(RelayPoolManifest.verify(code: tamperedCode, publicKeyB64: publicKeyB64))
    }

    func test_verify_missingPrefix_returnsNil() {
        XCTAssertNil(RelayPoolManifest.verify(code: "not-a-manifest", publicKeyB64: "irrelevant"))
    }

    func test_verify_malformedPayloadShape_returnsNil() {
        let privateKey = Curve25519.Signing.PrivateKey()
        let publicKeyB64 = privateKey.publicKey.rawRepresentation.base64URLEncodedString()
        // Only 3 pipe-delimited fields instead of 4.
        let code = sign("1|Acme GmbH|unpruuf-relay:v1:a.onion:tok1", with: privateKey)

        XCTAssertNil(RelayPoolManifest.verify(code: code, publicKeyB64: publicKeyB64))
    }

    func test_verify_invalidRelayEntry_returnsNil() {
        let privateKey = Curve25519.Signing.PrivateKey()
        let publicKeyB64 = privateKey.publicKey.rawRepresentation.base64URLEncodedString()
        let code = sign("1|Acme GmbH|1700000000000|not-a-relay-string", with: privateKey)

        XCTAssertNil(RelayPoolManifest.verify(code: code, publicKeyB64: publicKeyB64))
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
