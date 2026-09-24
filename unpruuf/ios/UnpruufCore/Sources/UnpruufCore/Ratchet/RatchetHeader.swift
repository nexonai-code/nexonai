import Foundation

/// Double Ratchet message header (Signal spec §"Sending/receiving": `dh`, `pn`, `n`).
///
/// Travels in the clear alongside the ciphertext — it is not secret, only authenticated (folded
/// into the AEAD associated data by ``DoubleRatchet``), so the receiver can locate the right
/// chain/message key before it can decrypt anything.
///
/// Wire layout, fixed 40 bytes: `dhPub(32) | pn(4, big-endian) | n(4, big-endian)`. Byte-for-byte
/// compatible with the Android app's `RatchetHeader.kt` — do not change this layout without
/// changing both sides together.
public struct RatchetHeader: Equatable {
    public static let dhKeyLen = 32
    public static let size = dhKeyLen + 4 + 4

    /// Sender's current ratchet public key (raw X25519, 32 bytes).
    public let dhPub: Data
    /// Length of the sender's previous sending chain (messages sent before their last DH step).
    public let previousChainLength: Int32
    /// Index of this message within the sender's current sending chain.
    public let messageNumber: Int32

    public init(dhPub: Data, previousChainLength: Int32, messageNumber: Int32) {
        self.dhPub = dhPub
        self.previousChainLength = previousChainLength
        self.messageNumber = messageNumber
    }

    public func encode() throws -> Data {
        guard dhPub.count == Self.dhKeyLen else {
            throw RatchetHeaderError.invalidKeyLength
        }
        var out = Data(capacity: Self.size)
        out.append(dhPub)
        out.append(Self.bigEndianBytes(previousChainLength))
        out.append(Self.bigEndianBytes(messageNumber))
        return out
    }

    public static func decode(_ raw: Data, offset: Int = 0) throws -> RatchetHeader {
        guard raw.count - offset >= size else {
            throw RatchetHeaderError.truncated
        }
        let base = raw.startIndex + offset
        let dhPub = raw.subdata(in: base..<(base + dhKeyLen))
        let pn = readInt32(raw, at: base + dhKeyLen)
        let n = readInt32(raw, at: base + dhKeyLen + 4)
        return RatchetHeader(dhPub: dhPub, previousChainLength: pn, messageNumber: n)
    }

    private static func bigEndianBytes(_ value: Int32) -> Data {
        let v = UInt32(bitPattern: value)
        return Data([
            UInt8((v >> 24) & 0xFF),
            UInt8((v >> 16) & 0xFF),
            UInt8((v >> 8) & 0xFF),
            UInt8(v & 0xFF),
        ])
    }

    private static func readInt32(_ raw: Data, at offset: Int) -> Int32 {
        let b0 = UInt32(raw[offset])
        let b1 = UInt32(raw[offset + 1])
        let b2 = UInt32(raw[offset + 2])
        let b3 = UInt32(raw[offset + 3])
        let v = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3
        return Int32(bitPattern: v)
    }
}

public enum RatchetHeaderError: Error {
    case invalidKeyLength
    case truncated
}
