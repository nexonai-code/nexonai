import XCTest
@testable import UnpruufCore

private final class InMemoryStore: KeyValueStore {
    private var values: [String: String] = [:]
    func getString(_ key: String) -> String? { values[key] }
    func setString(_ key: String, _ value: String) { values[key] = value }
}

final class IdentityTests: XCTestCase {

    func test_myMessageKey_isStableAcrossAccesses() {
        let identity = Identity(store: InMemoryStore())
        let first = identity.myMessageKey
        let second = identity.myMessageKey
        XCTAssertEqual(first, second)
        XCTAssertEqual(first.count, 32)
    }

    func test_pairSecret_isSymmetricBetweenTwoIdentities() {
        let a = Identity(store: InMemoryStore())
        let b = Identity(store: InMemoryStore())
        XCTAssertEqual(a.pairSecret(contactMsgKey: b.myMessageKey), b.pairSecret(contactMsgKey: a.myMessageKey))
    }

    func test_wireTag_myTagMatchesContactsExpectedTag() {
        let a = Identity(store: InMemoryStore())
        let b = Identity(store: InMemoryStore())
        // A's own wire tag (to B) must equal what B expects from A, for the same generation.
        let aTag = a.myWireTag(contactMsgKey: b.myMessageKey, generation: 3)
        let bExpectsFromA = b.expectedWireTag(contactMsgKey: a.myMessageKey, contactUserId: a.userId, generation: 3)
        XCTAssertEqual(aTag, bExpectsFromA)
    }

    func test_wireTag_changesWithGeneration() {
        let a = Identity(store: InMemoryStore())
        let b = Identity(store: InMemoryStore())
        let gen0 = a.myWireTag(contactMsgKey: b.myMessageKey, generation: 0)
        let gen1 = a.myWireTag(contactMsgKey: b.myMessageKey, generation: 1)
        XCTAssertNotEqual(gen0, gen1)
    }

    func test_keysPersistAcrossNewIdentityInstancesOverTheSameStore() {
        let store = InMemoryStore()
        let first = Identity(store: store)
        let key = first.myMessageKey
        let ratchetPub = first.myX25519RatchetPublicKeyBase64

        let second = Identity(store: store)
        XCTAssertEqual(second.myMessageKey, key)
        XCTAssertEqual(second.myX25519RatchetPublicKeyBase64, ratchetPub)
        XCTAssertEqual(second.userId, first.userId)
    }

    func test_safetyNumber_isSymmetricBetweenTwoIdentities() {
        let a = Identity(store: InMemoryStore())
        let b = Identity(store: InMemoryStore())
        // Both sides must compute the identical code regardless of who's "mine" vs "theirs" —
        // the whole point of sorting the two keys into a fixed order before hashing.
        let fromA = a.safetyNumber(theirX25519RatchetPublicKeyBase64: b.myX25519RatchetPublicKeyBase64)
        let fromB = b.safetyNumber(theirX25519RatchetPublicKeyBase64: a.myX25519RatchetPublicKeyBase64)
        XCTAssertEqual(fromA, fromB)
    }

    func test_safetyNumber_isSixDigitsGroupedAsThreeAndThree() {
        let a = Identity(store: InMemoryStore())
        let b = Identity(store: InMemoryStore())
        let code = a.safetyNumber(theirX25519RatchetPublicKeyBase64: b.myX25519RatchetPublicKeyBase64)
        let parts = code.split(separator: " ")
        XCTAssertEqual(parts.count, 2)
        XCTAssertEqual(parts[0].count, 3)
        XCTAssertEqual(parts[1].count, 3)
        XCTAssertTrue(code.allSatisfy { $0.isNumber || $0 == " " })
    }

    func test_safetyNumber_changesForADifferentContact() {
        let a = Identity(store: InMemoryStore())
        let b = Identity(store: InMemoryStore())
        let c = Identity(store: InMemoryStore())
        let ab = a.safetyNumber(theirX25519RatchetPublicKeyBase64: b.myX25519RatchetPublicKeyBase64)
        let ac = a.safetyNumber(theirX25519RatchetPublicKeyBase64: c.myX25519RatchetPublicKeyBase64)
        XCTAssertNotEqual(ab, ac)
    }
}
