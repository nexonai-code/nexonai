import XCTest
@testable import UnpruufCore

final class ControlSignalsTests: XCTestCase {

    func test_wechsel_encodeDecode_roundTrips() {
        let encoded = ControlSignals.encodeWechsel(newGeneration: 5, newRelayConnectionString: "unpruuf-relay:v1:host.onion:tok")
        let decoded = ControlSignals.decodeWechsel(encoded)
        XCTAssertEqual(decoded?.newGeneration, 5)
        XCTAssertEqual(decoded?.newRelayConnectionString, "unpruuf-relay:v1:host.onion:tok")
    }

    func test_wechsel_doesNotMatchOtherSignals() {
        XCTAssertNil(ControlSignals.decodeWechsel(ControlSignals.revoke))
        XCTAssertNil(ControlSignals.decodeWechsel(ControlSignals.deleteContact))
        XCTAssertNil(ControlSignals.decodeWechsel(ControlSignals.dummy))
    }

    func test_wechsel_malformedPayload_returnsNil() {
        XCTAssertNil(ControlSignals.decodeWechsel(Data("UNPRUUF_WECHSEL_V1:not-a-number:conn".utf8)))
        XCTAssertNil(ControlSignals.decodeWechsel(Data("UNPRUUF_WECHSEL_V1:5".utf8))) // missing connection string
        XCTAssertNil(ControlSignals.decodeWechsel(Data("UNPRUUF_WECHSEL_V1:-1:conn".utf8))) // negative generation
        XCTAssertNil(ControlSignals.decodeWechsel(Data("some random bytes".utf8)))
    }

    func test_exactMatchSignals_areDistinct() {
        XCTAssertNotEqual(ControlSignals.revoke, ControlSignals.deleteContact)
        XCTAssertNotEqual(ControlSignals.revoke, ControlSignals.dummy)
        XCTAssertNotEqual(ControlSignals.deleteContact, ControlSignals.dummy)
    }
}
