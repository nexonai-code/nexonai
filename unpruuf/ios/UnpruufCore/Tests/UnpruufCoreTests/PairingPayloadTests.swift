import XCTest
@testable import UnpruufCore

final class PairingPayloadTests: XCTestCase {

    func test_encodeDecode_roundTrips() {
        let payload = PairingPayload(
            userId: UUID().uuidString,
            messageKeyBase64: "YWJjZGVmZ2gxMjM0NTY3OA==",
            x25519RatchetPublicKeyBase64: "eHl6MTIzNDU2Nzg5MGFiY2RlZg==",
            relayConnectionStrings: ["unpruuf-relay:v1:abcdefghij234567.onion:token123"]
        )
        let json = payload.toJSON()
        let decoded = PairingPayload.fromJSON(json)
        XCTAssertEqual(decoded, payload)
    }

    func test_relayConnectionStringWithColons_survivesRoundTrip() {
        // The relay connection string itself contains multiple colons — must not be truncated.
        let payload = PairingPayload(
            userId: UUID().uuidString, messageKeyBase64: "a", x25519RatchetPublicKeyBase64: "b",
            relayConnectionStrings: ["unpruuf-relay:v1:host.onion:5000:secrettoken"]
        )
        let decoded = PairingPayload.fromJSON(payload.toJSON())
        XCTAssertEqual(decoded?.relayConnectionStrings, ["unpruuf-relay:v1:host.onion:5000:secrettoken"])
    }

    func test_malformedJSON_returnsNilInsteadOfThrowing() {
        XCTAssertNil(PairingPayload.fromJSON(""))
        XCTAssertNil(PairingPayload.fromJSON("{not json"))
        XCTAssertNil(PairingPayload.fromJSON("{\"u\":\"only-user-id\"}"))
    }

    func test_userIdCompaction_roundTrips() {
        let id = UUID().uuidString
        let payload = PairingPayload(userId: id, messageKeyBase64: "x", x25519RatchetPublicKeyBase64: "y", relayConnectionStrings: ["unpruuf-relay:v1:h:t"])
        let decoded = PairingPayload.fromJSON(payload.toJSON())
        XCTAssertEqual(decoded?.userId, id)
    }

    // MARK: - Multi-entry relay pool (redundant relay addresses)

    func test_twoRelayEntries_surviveRoundTrip() {
        let relays = [
            "unpruuf-relay:v1:first234567890.onion:tokenA",
            "unpruuf-relay:v1:second34567890.onion:tokenB",
        ]
        let payload = PairingPayload(
            userId: UUID().uuidString, messageKeyBase64: "x", x25519RatchetPublicKeyBase64: "y",
            relayConnectionStrings: relays
        )
        let decoded = PairingPayload.fromJSON(payload.toJSON())
        XCTAssertEqual(decoded?.relayConnectionStrings, relays)
    }

    func test_relayEntriesWithInternalColons_eachSurviveRoundTrip() {
        // Both entries individually contain multiple colons — the ';' join must not be confused
        // with the ':' the individual connection strings already use.
        let relays = [
            "unpruuf-relay:v1:host-one.onion:5000:tokenOne",
            "unpruuf-relay:v1:host-two.onion:5001:tokenTwo",
        ]
        let payload = PairingPayload(
            userId: UUID().uuidString, messageKeyBase64: "x", x25519RatchetPublicKeyBase64: "y",
            relayConnectionStrings: relays
        )
        let decoded = PairingPayload.fromJSON(payload.toJSON())
        XCTAssertEqual(decoded?.relayConnectionStrings, relays)
    }

    func test_moreThanMaxPoolSize_isCappedOnEncode() {
        // Constructing with 4 entries and encoding must not silently blow past the QR-size budget
        // — buildList() itself caps at maxPoolSize (2), so toJSON() never emits more than that
        // regardless of what the caller passed in.
        let relays = (1...4).map { "unpruuf-relay:v1:host\($0)234567890.onion:token\($0)" }
        let payload = PairingPayload(
            userId: UUID().uuidString, messageKeyBase64: "x", x25519RatchetPublicKeyBase64: "y",
            relayConnectionStrings: relays
        )
        let decoded = PairingPayload.fromJSON(payload.toJSON())
        XCTAssertEqual(decoded?.relayConnectionStrings.count, RelayConnectionString.maxPoolSize)
        XCTAssertEqual(decoded?.relayConnectionStrings, Array(relays.prefix(RelayConnectionString.maxPoolSize)))
    }

    func test_singleLegacyEntry_stillDecodesAsAOneElementList() {
        // A QR/payload produced by an app version before the pool existed is just one valid list
        // entry — no special-casing needed to accept it.
        let json = "{\"v\":1,\"u\":\"\(PairingPayloadTests.compactId())\",\"p\":\"a\",\"k\":\"b\",\"n\":\"unpruuf-relay:v1:h:t\"}"
        let decoded = PairingPayload.fromJSON(json)
        XCTAssertEqual(decoded?.relayConnectionStrings, ["unpruuf-relay:v1:h:t"])
    }

    func test_emptyEntriesAndTrailingSeparator_areDropped() {
        let json = "{\"v\":2,\"u\":\"\(PairingPayloadTests.compactId())\",\"p\":\"a\",\"k\":\"b\",\"n\":\"unpruuf-relay:v1:h:t;;\"}"
        let decoded = PairingPayload.fromJSON(json)
        XCTAssertEqual(decoded?.relayConnectionStrings, ["unpruuf-relay:v1:h:t"])
    }

    func test_emptyRelayList_failsToDecode() {
        let json = "{\"v\":2,\"u\":\"\(PairingPayloadTests.compactId())\",\"p\":\"a\",\"k\":\"b\",\"n\":\"\"}"
        XCTAssertNil(PairingPayload.fromJSON(json))
    }

    private static func compactId() -> String {
        let bytes = withUnsafeBytes(of: UUID().uuid) { Data($0) }
        return bytes.base64EncodedString().trimmingCharacters(in: CharacterSet(charactersIn: "="))
    }
}
