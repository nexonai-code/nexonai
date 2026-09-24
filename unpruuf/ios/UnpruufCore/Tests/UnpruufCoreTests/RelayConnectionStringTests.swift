import XCTest
@testable import UnpruufCore

final class RelayConnectionStringTests: XCTestCase {

    func test_buildThenParse_roundTrips() {
        let built = RelayConnectionString.build(address: "abcdefghij234567.onion", authToken: "s3cr3t-token")
        XCTAssertEqual(built, "unpruuf-relay:v1:abcdefghij234567.onion:s3cr3t-token")
        let parsed = RelayConnectionString.parse(built)
        XCTAssertEqual(parsed?.address, "abcdefghij234567.onion")
        XCTAssertEqual(parsed?.authToken, "s3cr3t-token")
    }

    func test_parse_trimsWhitespace() {
        let parsed = RelayConnectionString.parse("  unpruuf-relay:v1:host:1234:tok  \n")
        XCTAssertEqual(parsed?.address, "host:1234")
        XCTAssertEqual(parsed?.authToken, "tok")
    }

    func test_parse_missingPrefix_returnsNil() {
        XCTAssertNil(RelayConnectionString.parse("not-a-relay-string:host:tok"))
    }

    func test_parse_noColonInRemainder_returnsNil() {
        XCTAssertNil(RelayConnectionString.parse("unpruuf-relay:v1:onlyoneword"))
    }

    func test_parse_emptyAddress_returnsNil() {
        XCTAssertNil(RelayConnectionString.parse("unpruuf-relay:v1::token"))
    }

    func test_parse_emptyToken_returnsNil() {
        XCTAssertNil(RelayConnectionString.parse("unpruuf-relay:v1:host:"))
    }

    // MARK: - buildList / parseList

    func test_buildList_joinsWithSemicolon() {
        let joined = RelayConnectionString.buildList([
            "unpruuf-relay:v1:a.onion:tok1",
            "unpruuf-relay:v1:b.onion:tok2",
        ])
        XCTAssertEqual(joined, "unpruuf-relay:v1:a.onion:tok1;unpruuf-relay:v1:b.onion:tok2")
    }

    func test_buildList_capsAtMaxPoolSize() {
        let joined = RelayConnectionString.buildList((1...5).map { "unpruuf-relay:v1:host\($0).onion:tok\($0)" })
        XCTAssertEqual(joined.components(separatedBy: ";").count, RelayConnectionString.maxPoolSize)
    }

    func test_buildList_dropsBlankEntries() {
        let joined = RelayConnectionString.buildList(["unpruuf-relay:v1:a.onion:tok", "", "   "])
        XCTAssertEqual(joined, "unpruuf-relay:v1:a.onion:tok")
    }

    func test_parseList_splitsOnSemicolon() {
        let list = RelayConnectionString.parseList("unpruuf-relay:v1:a.onion:tok1;unpruuf-relay:v1:b.onion:tok2")
        XCTAssertEqual(list, ["unpruuf-relay:v1:a.onion:tok1", "unpruuf-relay:v1:b.onion:tok2"])
    }

    func test_parseList_dropsEmptySegmentsFromTrailingOrDoubleSeparators() {
        let list = RelayConnectionString.parseList("unpruuf-relay:v1:a.onion:tok1;;unpruuf-relay:v1:b.onion:tok2;")
        XCTAssertEqual(list, ["unpruuf-relay:v1:a.onion:tok1", "unpruuf-relay:v1:b.onion:tok2"])
    }

    func test_parseList_ofEmptyString_isEmptyArray() {
        XCTAssertEqual(RelayConnectionString.parseList(""), [])
    }

    func test_buildList_thenParseList_roundTrips() {
        let original = ["unpruuf-relay:v1:a.onion:tok1", "unpruuf-relay:v1:b.onion:tok2"]
        XCTAssertEqual(RelayConnectionString.parseList(RelayConnectionString.buildList(original)), original)
    }
}
