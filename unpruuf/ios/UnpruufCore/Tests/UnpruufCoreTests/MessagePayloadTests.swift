import XCTest
@testable import UnpruufCore

final class MessagePayloadTests: XCTestCase {

    func test_text_roundTrips() {
        let encoded = MessagePayload.encodeText("hello unpruuf")
        guard case .text(let text) = MessagePayload.decode(encoded) else {
            return XCTFail("expected .text")
        }
        XCTAssertEqual(text, "hello unpruuf")
    }

    func test_emptyText_roundTrips() {
        let encoded = MessagePayload.encodeText("")
        guard case .text(let text) = MessagePayload.decode(encoded) else {
            return XCTFail("expected .text")
        }
        XCTAssertEqual(text, "")
    }

    func test_attachment_roundTrips() throws {
        let bytes = Data((0..<256).map { UInt8($0 % 256) })
        let encoded = try MessagePayload.encodeAttachment(name: "photo.jpg", bytes: bytes, isImage: true)
        guard case .attachment(let name, let outBytes, let isImage) = MessagePayload.decode(encoded) else {
            return XCTFail("expected .attachment")
        }
        XCTAssertEqual(name, "photo.jpg")
        XCTAssertEqual(outBytes, bytes)
        XCTAssertTrue(isImage)
    }

    func test_fileAttachment_isNotFlaggedAsImage() throws {
        let encoded = try MessagePayload.encodeAttachment(name: "doc.pdf", bytes: Data([1, 2, 3]), isImage: false)
        guard case .attachment(_, _, let isImage) = MessagePayload.decode(encoded) else {
            return XCTFail("expected .attachment")
        }
        XCTAssertFalse(isImage)
    }

    func test_emptyInput_decodesToNil() {
        XCTAssertNil(MessagePayload.decode(Data()))
    }

    func test_truncatedAttachmentHeader_decodesToNilInsteadOfCrashing() {
        XCTAssertNil(MessagePayload.decode(Data([1, 0]))) // type=file, but missing 2nd length byte
        XCTAssertNil(MessagePayload.decode(Data([1, 0, 10]))) // claims a 10-byte name but has none
    }
}
