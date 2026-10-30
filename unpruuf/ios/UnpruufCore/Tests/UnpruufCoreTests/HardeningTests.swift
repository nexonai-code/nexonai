import XCTest
@testable import UnpruufCore

final class PinLockoutTests: XCTestCase {
    func test_firstFourWrongTriesAreFree() {
        for n in 1...4 { XCTAssertNil(PinLockout.lockDelayMs(fails: n)) }
    }

    func test_fifthWrongTryLocksForThirtySeconds_andItDoublesFromThere() {
        XCTAssertEqual(PinLockout.lockDelayMs(fails: 5), 30_000)
        XCTAssertEqual(PinLockout.lockDelayMs(fails: 6), 60_000)
        XCTAssertEqual(PinLockout.lockDelayMs(fails: 7), 120_000)
        XCTAssertEqual(PinLockout.lockDelayMs(fails: 8), 240_000)
    }

    func test_neverLocksLongerThanOneHour() {
        XCTAssertEqual(PinLockout.lockDelayMs(fails: 30), 3_600_000)
        XCTAssertEqual(PinLockout.lockDelayMs(fails: 10_000), 3_600_000)
    }

    func test_movingTheDateForwardDoesNotShortenAPause() {
        let day: Int64 = 86_400_000
        XCTAssertEqual(PinLockout.remainingLockMs(wallUntil: 1_030_000, wallNow: 1_000_000 + day + 2_000,
                                                  lockedForMs: 30_000, elapsedAtLock: 5_000, elapsedNow: 7_000), 28_000)
    }

    func test_theLongerOfTheTwoClocksWins() {
        XCTAssertEqual(PinLockout.remainingLockMs(wallUntil: 1_030_000, wallNow: 1_030_000 - 3_630_000,
                                                  lockedForMs: 30_000, elapsedAtLock: 5_000, elapsedNow: 5_000), 3_630_000)
    }

    func test_afterARestartOnlyTheWallClockCounts() {
        XCTAssertEqual(PinLockout.remainingLockMs(wallUntil: 1_030_000, wallNow: 1_020_000,
                                                  lockedForMs: 30_000, elapsedAtLock: 900_000, elapsedNow: 3_000), 10_000)
        XCTAssertEqual(PinLockout.remainingLockMs(wallUntil: 1_030_000, wallNow: 1_040_000,
                                                  lockedForMs: 30_000, elapsedAtLock: 900_000, elapsedNow: 3_000), 0)
    }

    func test_noMonotonicFields_stillWorks() {
        XCTAssertEqual(PinLockout.remainingLockMs(wallUntil: 1_005_000, wallNow: 1_000_000,
                                                  lockedForMs: 0, elapsedAtLock: -1, elapsedNow: 100), 5_000)
        XCTAssertEqual(PinLockout.remainingLockMs(wallUntil: 0, wallNow: 1_000_000,
                                                  lockedForMs: 0, elapsedAtLock: -1, elapsedNow: 100), 0)
    }

    func test_anExpiredPauseIsOver() {
        XCTAssertEqual(PinLockout.remainingLockMs(wallUntil: 1_030_000, wallNow: 1_031_000,
                                                  lockedForMs: 30_000, elapsedAtLock: 5_000, elapsedNow: 40_000), 0)
    }
}

final class OnionAddressTests: XCTestCase {
    private struct Vectors: Decodable {
        struct Addresses: Decodable { let valid: [String]; let invalid: [String] }
        let onionAddresses: Addresses
    }

    private static let vectors: Vectors.Addresses = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("vectors/ios-vectors-2026-10-27.json")
        return try! JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url)).onionAddresses
    }()

    func test_vectorAddresses() {
        XCTAssertFalse(Self.vectors.valid.isEmpty)
        for a in Self.vectors.valid { XCTAssertTrue(OnionAddress.isValid(a), a) }
        for a in Self.vectors.invalid { XCTAssertFalse(OnionAddress.isValid(a), a) }
    }

    func test_oneChangedCharacter_failsTheChecksum() {
        var chars = Array(Self.vectors.valid[0])
        chars[0] = chars[0] == "a" ? "b" : "a"
        XCTAssertFalse(OnionAddress.isValid(String(chars)))
    }

    func test_rightFormWrongCharacters() {
        XCTAssertFalse(OnionAddress.isValid(String(repeating: "1", count: 56) + ".onion"))
        XCTAssertFalse(OnionAddress.isValid(String(repeating: "a", count: 56) + ".onion"))
    }
}

final class FrameBoundsTests: XCTestCase {
    private func bytes(_ v: Int32) -> Data {
        let u = UInt32(bitPattern: v)
        return Data([UInt8(u >> 24), UInt8((u >> 16) & 0xFF), UInt8((u >> 8) & 0xFF), UInt8(u & 0xFF)])
    }

    func test_chunkStart_overTheLimit_isRefused() {
        let header = Data(count: RatchetHeader.size)
        func frame(_ total: Int32) -> Data { Data([RatchetFrame.kindChunkStart]) + bytes(total) + header }
        XCTAssertNil(RatchetFrame.decode(frame(2049)))
        XCTAssertNil(RatchetFrame.decode(frame(Int32.max)))
        XCTAssertNil(RatchetFrame.decode(frame(-1)))
    }

    func test_chunkCont_atTheLimit_isRefused() {
        func frame(_ index: Int32) -> Data { Data([RatchetFrame.kindChunkCont]) + bytes(index) }
        XCTAssertNotNil(RatchetFrame.decode(frame(2047)))
        XCTAssertNil(RatchetFrame.decode(frame(2048)))
    }

    func test_unpad_headerOutsideThePacket_isRefused() {
        func packet(size: UInt32, offset: UInt32) -> Data {
            var p = Data(count: NetworkObfuscation.packetSize)
            p.replaceSubrange(0..<4, with: bytes(Int32(bitPattern: size)))
            p.replaceSubrange(4..<8, with: bytes(Int32(bitPattern: offset)))
            return p
        }
        XCTAssertNoThrow(try NetworkObfuscation.unpadPacket(packet(size: 4088, offset: 0)))
        XCTAssertThrowsError(try NetworkObfuscation.unpadPacket(packet(size: 4089, offset: 0)))
        XCTAssertThrowsError(try NetworkObfuscation.unpadPacket(packet(size: 1, offset: 4088)))
        XCTAssertThrowsError(try NetworkObfuscation.unpadPacket(packet(size: .max, offset: .max)))
    }
}
