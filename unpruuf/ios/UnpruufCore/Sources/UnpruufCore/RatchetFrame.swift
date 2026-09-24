import Foundation

/// Outer wire framing for one ratchet-encrypted logical message, split across as many
/// ``ciphertextChunkSize`` pieces as needed to fit ``NetworkObfuscation``'s 4096-byte packets.
/// Direct, byte-for-byte port of the Android app's `RatchetFrame.kt` — do not change the wire
/// layout here without changing that file too.
///
/// Each piece becomes its own outer packet (`OuterEnvelope` + `NetworkObfuscation.padPacket`) and
/// its own queued delivery. Because pieces can arrive via direct delivery or the relay mailbox (a
/// polled store, not a live socket) — and on iOS, cross-platform mode is relay-only — `.chunkCont`
/// carries its own explicit `index` rather than relying on arrival order: the receive side buffers
/// by index and only completes once every index `1..<totalChunks` has arrived, in whatever order.
public enum RatchetFrame {
    public static let kindSingle: UInt8 = 0
    public static let kindChunkStart: UInt8 = 1
    public static let kindChunkCont: UInt8 = 2

    /// Ciphertext bytes per outer packet — comfortably under the ~4015-4059 byte budget of every frame kind.
    public static let ciphertextChunkSize = 4000

    public enum Frame {
        case single(header: RatchetHeader, ciphertext: Data)
        /// Always chunk index 0.
        case chunkStart(totalChunks: Int32, header: RatchetHeader, piece: Data)
        /// `index` is 1-based (0 is always the chunkStart's own piece) — never re-derived from arrival order.
        case chunkCont(index: Int32, piece: Data)
    }

    /// Splits one ratchet-encrypted message into 1+ frames, in order.
    public static func split(header: RatchetHeader, ciphertext: Data) -> [Frame] {
        if ciphertext.count <= ciphertextChunkSize {
            return [.single(header: header, ciphertext: ciphertext)]
        }
        let totalChunks = (ciphertext.count + ciphertextChunkSize - 1) / ciphertextChunkSize
        return (0..<totalChunks).map { index in
            let start = ciphertext.startIndex + index * ciphertextChunkSize
            let end = min(start + ciphertextChunkSize, ciphertext.endIndex)
            let piece = ciphertext.subdata(in: start..<end)
            return index == 0
                ? .chunkStart(totalChunks: Int32(totalChunks), header: header, piece: piece)
                : .chunkCont(index: Int32(index), piece: piece)
        }
    }

    public static func encode(_ frame: Frame) throws -> Data {
        switch frame {
        case .single(let header, let ciphertext):
            var out = Data([kindSingle])
            out.append(try header.encode())
            out.append(ciphertext)
            return out
        case .chunkStart(let totalChunks, let header, let piece):
            var out = Data([kindChunkStart])
            out.append(intBytes(totalChunks))
            out.append(try header.encode())
            out.append(piece)
            return out
        case .chunkCont(let index, let piece):
            var out = Data([kindChunkCont])
            out.append(intBytes(index))
            out.append(piece)
            return out
        }
    }

    public static func decode(_ raw: Data) -> Frame? {
        guard !raw.isEmpty else { return nil }
        let base = raw.startIndex
        switch raw[base] {
        case kindSingle:
            guard raw.count >= 1 + RatchetHeader.size else { return nil }
            guard let header = try? RatchetHeader.decode(raw, offset: 1) else { return nil }
            let ciphertext = raw.subdata(in: (base + 1 + RatchetHeader.size)..<raw.endIndex)
            return .single(header: header, ciphertext: ciphertext)
        case kindChunkStart:
            guard raw.count >= 1 + 4 + RatchetHeader.size else { return nil }
            let totalChunks = readInt(raw, at: base + 1)
            guard totalChunks >= 2 else { return nil } // a real multi-chunk transfer always has >= 2 pieces
            guard let header = try? RatchetHeader.decode(raw, offset: 1 + 4) else { return nil }
            let piece = raw.subdata(in: (base + 1 + 4 + RatchetHeader.size)..<raw.endIndex)
            return .chunkStart(totalChunks: totalChunks, header: header, piece: piece)
        case kindChunkCont:
            guard raw.count >= 1 + 4 else { return nil }
            let index = readInt(raw, at: base + 1)
            guard index >= 1 else { return nil } // 0 is reserved for chunkStart's own piece
            let piece = raw.subdata(in: (base + 1 + 4)..<raw.endIndex)
            return .chunkCont(index: index, piece: piece)
        default:
            return nil
        }
    }

    private static func intBytes(_ value: Int32) -> Data {
        let v = UInt32(bitPattern: value)
        return Data([UInt8((v >> 24) & 0xFF), UInt8((v >> 16) & 0xFF), UInt8((v >> 8) & 0xFF), UInt8(v & 0xFF)])
    }

    private static func readInt(_ raw: Data, at offset: Int) -> Int32 {
        let b0 = UInt32(raw[offset]), b1 = UInt32(raw[offset + 1])
        let b2 = UInt32(raw[offset + 2]), b3 = UInt32(raw[offset + 3])
        return Int32(bitPattern: (b0 << 24) | (b1 << 16) | (b2 << 8) | b3)
    }
}
