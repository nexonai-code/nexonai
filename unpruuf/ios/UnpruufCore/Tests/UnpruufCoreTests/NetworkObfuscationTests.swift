import XCTest
@testable import UnpruufCore

/// Mirrors the Android app's `NetworkObfuscationTest.kt` case-for-case.
final class NetworkObfuscationTests: XCTestCase {

    private func randomData(_ count: Int) -> Data {
        var d = Data(count: count)
        if count > 0 {
            _ = d.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!) }
        }
        return d
    }

    func test_emptyPayload_roundTrips() throws {
        let padded = try NetworkObfuscation.padPacket(Data())
        XCTAssertEqual(padded.count, NetworkObfuscation.packetSize)
        XCTAssertEqual(try NetworkObfuscation.unpadPacket(padded), Data())
    }

    func test_typicalPayload_roundTrips() throws {
        let payload = randomData(512)
        let padded = try NetworkObfuscation.padPacket(payload)
        XCTAssertEqual(padded.count, NetworkObfuscation.packetSize)
        XCTAssertEqual(try NetworkObfuscation.unpadPacket(padded), payload)
    }

    func test_largestPayloadThatStillFits_roundTrips() throws {
        let payload = randomData(NetworkObfuscation.packetSize - 8)
        let padded = try NetworkObfuscation.padPacket(payload)
        XCTAssertEqual(padded.count, NetworkObfuscation.packetSize)
        XCTAssertEqual(try NetworkObfuscation.unpadPacket(padded), payload)
    }

    func test_payloadOneByteOverLimit_isRejected() {
        XCTAssertThrowsError(try NetworkObfuscation.padPacket(randomData(NetworkObfuscation.packetSize - 7)))
    }

    func test_unpaddingWrongSizedPacket_isRejected() {
        XCTAssertThrowsError(try NetworkObfuscation.unpadPacket(Data(count: NetworkObfuscation.packetSize - 1)))
    }

    func test_paddedPackets_neverRevealPayloadSizeByTheirOwnSize() throws {
        let small = try NetworkObfuscation.padPacket(randomData(1))
        let large = try NetworkObfuscation.padPacket(randomData(NetworkObfuscation.packetSize - 8))
        XCTAssertEqual(small.count, large.count)
    }

    func test_dummyPackets_areExactlyOnePacketSize() {
        XCTAssertEqual(NetworkObfuscation.generateDummyPacket().count, NetworkObfuscation.packetSize)
    }
}
