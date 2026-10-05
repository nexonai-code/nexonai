import CryptoKit
import XCTest
@testable import UnpruufCore

final class OfficerCaseTests: XCTestCase {
    func testSealedIntakeRoundTripsAndStrangerCannotOpenIt() throws {
        let officer = Curve25519.KeyAgreement.PrivateKey()
        let messageKey = Data((0..<32).map { UInt8($0) })
        let plain = OfficerCase.encodeIntakePlaintext(wireIdentity: nil, pairingJSON: "{\"v\":2}")
        let sealed = try OfficerCase.sealIntake(
            officerX25519Pub: officer.publicKey.rawRepresentation, officerMessageKey: messageKey, plaintext: plain
        )
        XCTAssertEqual(sealed.count, 32 + 12 + plain.count + 16)
        XCTAssertLessThanOrEqual(sealed.count, NetworkObfuscation.packetSize - 8)
        let opened = try OfficerCase.openIntake(
            officerPrivateKey: officer.rawRepresentation, officerMessageKey: messageKey, sealed: sealed
        )
        XCTAssertEqual(opened, plain)

        let stranger = Curve25519.KeyAgreement.PrivateKey()
        XCTAssertThrowsError(try OfficerCase.openIntake(
            officerPrivateKey: stranger.rawRepresentation, officerMessageKey: messageKey, sealed: sealed
        ))
    }

    func testIntakeTagChangesEveryHourAndIsTheSameForEveryoneWithTheQR() {
        let key = Data((0..<32).map { UInt8($0) })
        XCTAssertEqual(
            OfficerCase.intakeTag(officerMessageKey: key, hour: 470_000),
            OfficerCase.intakeTag(officerMessageKey: Data(key), hour: 470_000)
        )
        XCTAssertNotEqual(
            OfficerCase.intakeTag(officerMessageKey: key, hour: 470_000),
            OfficerCase.intakeTag(officerMessageKey: key, hour: 470_001)
        )
    }

    func testCaseSignalFromTheOfficerAppParses() throws {
        let text = OfficerCase.caseSignalPrefix +
            "{\"n\":\"HW-7Q4M-2X9D\",\"s\":\"in_progress\",\"o\":1700000000000,\"a\":1700604800000,\"f\":1707776000000,\"t\":1700100000000}"
        let info = try XCTUnwrap(OfficerCase.parseCaseSignal(text))
        XCTAssertEqual(info.number, "HW-7Q4M-2X9D")
        XCTAssertEqual(info.status, "in_progress")
        XCTAssertEqual(info.openedAt, Date(timeIntervalSince1970: 1_700_000_000))
        XCTAssertEqual(info.feedbackDueAt, Date(timeIntervalSince1970: 1_707_776_000))
    }

    func testMalformedCaseSignalsAreRejected() {
        XCTAssertNil(OfficerCase.parseCaseSignal(OfficerCase.caseSignalPrefix + "{\"n\":\"HW-0000-1111\",\"s\":\"closed\"}"))
        XCTAssertNil(OfficerCase.parseCaseSignal(OfficerCase.caseSignalPrefix + "{\"n\":\"HW-7Q4M-2X9D\",\"s\":\"deleted\"}"))
        XCTAssertNil(OfficerCase.parseCaseSignal(OfficerCase.caseSignalPrefix + "not json"))
        XCTAssertNil(OfficerCase.parseCaseSignal("hello"))
    }

    func testCaseNumberAlphabet() {
        XCTAssertTrue(OfficerCase.isCaseNumber("HW-7Q4M-2X9D"))
        XCTAssertFalse(OfficerCase.isCaseNumber("HW-0Q4M-2X9D"))
        XCTAssertFalse(OfficerCase.isCaseNumber("HW-7Q4M-2X9"))
        XCTAssertFalse(OfficerCase.isCaseNumber("XX-7Q4M-2X9D"))
    }
}
