import XCTest
@testable import UnpruufCore

private enum TestError: Error { case incompleteReassembly }

/// Mirrors the Android app's `RatchetFrameTest.kt` case-for-case.
final class RatchetFrameTests: XCTestCase {

    private let header = RatchetHeader(dhPub: Data((0..<32).map { UInt8($0 + 1) }), previousChainLength: 3, messageNumber: 7)

    private func randomData(_ count: Int) -> Data {
        var d = Data(count: count)
        if count > 0 {
            _ = d.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!) }
        }
        return d
    }

    /// Reassembles frames by their explicit index, in the order given — simulates in-order arrival.
    private func reassemble(_ ciphertext: Data) throws -> (frames: [RatchetFrame.Frame], out: Data) {
        let frames = RatchetFrame.split(header: header, ciphertext: ciphertext)
        let decoded = try frames.map { RatchetFrame.decode(try RatchetFrame.encode($0))! }
        for f in decoded {
            XCTAssertLessThanOrEqual(try RatchetFrame.encode(f).count + 28, 4088)
        }
        return (decoded, try reassembleByIndex(decoded))
    }

    /// Reassembles a set of decoded frames purely from each `.chunkCont`'s index / the implicit
    /// index-0 of `.chunkStart` — order of the input array doesn't matter.
    private func reassembleByIndex(_ decoded: [RatchetFrame.Frame]) throws -> Data {
        if decoded.count == 1, case .single(_, let ciphertext) = decoded[0] {
            return ciphertext
        }
        var totalChunks = 0
        var startPiece: Data?
        for f in decoded {
            if case .chunkStart(let total, _, let piece) = f {
                totalChunks = Int(total)
                startPiece = piece
            }
        }
        var slots = [Data?](repeating: nil, count: totalChunks)
        slots[0] = startPiece
        for f in decoded {
            if case .chunkCont(let index, let piece) = f {
                slots[Int(index)] = piece
            }
        }
        var out = Data()
        for slot in slots {
            guard let piece = slot else { throw TestError.incompleteReassembly } // unreachable if test data is well-formed
            out.append(piece)
        }
        return out
    }

    func test_emptyCiphertext_roundTripsAsSingleFrame() throws {
        let (frames, out) = try reassemble(Data())
        XCTAssertEqual(frames.count, 1)
        XCTAssertEqual(out, Data())
    }

    func test_textSizedCiphertext_roundTripsAsSingleFrame() throws {
        let ciphertext = "hello unpruuf".data(using: .utf8)!
        let (frames, out) = try reassemble(ciphertext)
        XCTAssertEqual(frames.count, 1)
        XCTAssertEqual(out, ciphertext)
    }

    func test_ciphertextExactlyAtChunkBoundary_staysSingleFrame() throws {
        let ciphertext = randomData(RatchetFrame.ciphertextChunkSize)
        let (frames, out) = try reassemble(ciphertext)
        XCTAssertEqual(frames.count, 1)
        XCTAssertEqual(out, ciphertext)
    }

    func test_oneByteOverBoundary_splitsIntoTwoFrames() throws {
        let ciphertext = randomData(RatchetFrame.ciphertextChunkSize + 1)
        let (frames, out) = try reassemble(ciphertext)
        XCTAssertEqual(frames.count, 2)
        XCTAssertEqual(out, ciphertext)
    }

    func test_a2MBPhoto_splitsIntoManyFramesAndReassemblesCorrectly() throws {
        let ciphertext = randomData(2 * 1024 * 1024)
        let (frames, out) = try reassemble(ciphertext)
        XCTAssertEqual(frames.count, 525)
        XCTAssertEqual(out, ciphertext)
    }

    func test_a5MBFile_splitsIntoExpectedChunkCount() throws {
        let ciphertext = randomData(5 * 1024 * 1024)
        let (frames, out) = try reassemble(ciphertext)
        // ceil(5*1024*1024 / 4000) — must stay comfortably under the relay's MAX_BLOBS_PER_TAG (1500).
        XCTAssertEqual(frames.count, 1311)
        XCTAssertEqual(out, ciphertext)
    }

    func test_eachChunkCont_carriesItsOwnIndex_notImpliedByPosition() {
        let ciphertext = randomData(RatchetFrame.ciphertextChunkSize * 5)
        let frames = RatchetFrame.split(header: header, ciphertext: ciphertext)
        let indices = frames.compactMap { f -> Int32? in
            if case .chunkCont(let index, _) = f { return index }
            return nil
        }
        XCTAssertEqual(indices, [1, 2, 3, 4])
    }

    func test_reassemblyIsCorrect_evenWhenChunkContFramesArriveOutOfOrder() throws {
        // The core regression test for why relay-eligible chunked transfers are safe: the relay
        // is a polled mailbox, not a live socket — nothing here should assume arrival order.
        let ciphertext = randomData(RatchetFrame.ciphertextChunkSize * 20 + 123)
        let frames = RatchetFrame.split(header: header, ciphertext: ciphertext)
        let encoded = try frames.map { try RatchetFrame.encode($0) }
        var decoded = encoded.map { RatchetFrame.decode($0)! }
        decoded.shuffle()
        XCTAssertEqual(try reassembleByIndex(decoded), ciphertext)
    }

    func test_reassemblyTolerates_aDuplicateRetransmittedChunkArrivingTwice() throws {
        let ciphertext = randomData(RatchetFrame.ciphertextChunkSize * 3 + 50)
        let frames = RatchetFrame.split(header: header, ciphertext: ciphertext)
        let decoded = try frames.map { RatchetFrame.decode(try RatchetFrame.encode($0))! }
        // Simulate index 1 arriving twice (e.g. a retry that wasn't actually needed).
        let dup = decoded.first { f -> Bool in
            if case .chunkCont(let index, _) = f { return index == 1 }
            return false
        }!
        var withDuplicate = decoded + [dup]
        withDuplicate.shuffle()
        XCTAssertEqual(try reassembleByIndex(withDuplicate), ciphertext)
    }

    func test_malformedInput_decodesToNilInsteadOfThrowing() {
        XCTAssertNil(RatchetFrame.decode(Data()))
        XCTAssertNil(RatchetFrame.decode(Data([RatchetFrame.kindSingle, 1, 2])))
        XCTAssertNil(RatchetFrame.decode(Data([99, 1, 2, 3])))
        // ChunkCont with no room for the 4-byte index.
        XCTAssertNil(RatchetFrame.decode(Data([RatchetFrame.kindChunkCont, 1, 2])))
        // ChunkCont with index 0 — reserved for ChunkStart's own piece, never valid on the wire.
        XCTAssertNil(RatchetFrame.decode(Data([RatchetFrame.kindChunkCont, 0, 0, 0, 0, 9, 9])))
    }
}
