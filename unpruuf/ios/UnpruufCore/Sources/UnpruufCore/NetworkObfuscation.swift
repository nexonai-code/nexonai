import Foundation

/// Pads every outer packet to a fixed size so an observer on the wire can't tell messages apart
/// by size. Direct port of the Android app's `NetworkObfuscation.kt` — same layout:
/// `[payloadSize: 4 bytes][offset: 4 bytes][random pad][payload][random pad]`, total exactly
/// ``packetSize`` bytes.
public enum NetworkObfuscation {
    public static let packetSize = 4096

    public static func padPacket(_ payload: Data) throws -> Data {
        guard payload.count <= packetSize - 8 else {
            throw NetworkObfuscationError.payloadTooLarge
        }
        var result = Data(count: packetSize)
        let padLength = packetSize - payload.count - 8
        var pad = Data(count: padLength)
        if padLength > 0 {
            let status = pad.withUnsafeMutableBytes { ptr -> Int32 in
                SecRandomCopyBytes(kSecRandomDefault, padLength, ptr.baseAddress!)
            }
            guard status == errSecSuccess else { throw NetworkObfuscationError.randomFailed }
        }
        let offset = padLength == 0 ? 0 : Int.random(in: 0..<max(1, padLength / 2))

        result.replaceSubrange(0..<4, with: bigEndianBytes(UInt32(payload.count)))
        result.replaceSubrange(4..<8, with: bigEndianBytes(UInt32(offset)))
        result.replaceSubrange((8 + offset)..<(8 + offset + payload.count), with: payload)
        if offset > 0 {
            result.replaceSubrange(8..<(8 + offset), with: pad.prefix(offset))
        }
        return result
    }

    public static func unpadPacket(_ packet: Data) throws -> Data {
        guard packet.count == packetSize else {
            throw NetworkObfuscationError.invalidPacketSize
        }
        let base = packet.startIndex
        let payloadSize = Int(readUInt32(packet, at: base))
        let offset = Int(readUInt32(packet, at: base + 4))
        let start = base + 8 + offset
        guard offset >= 0, payloadSize >= 0, start >= base, start + payloadSize <= packet.endIndex else {
            throw NetworkObfuscationError.corruptHeader
        }
        return packet.subdata(in: start..<(start + payloadSize))
    }

    public static func generateDummyPacket() -> Data {
        var dummy = Data(count: packetSize)
        _ = dummy.withUnsafeMutableBytes { ptr -> Int32 in
            SecRandomCopyBytes(kSecRandomDefault, packetSize, ptr.baseAddress!)
        }
        return dummy
    }

    private static func bigEndianBytes(_ value: UInt32) -> Data {
        Data([UInt8((value >> 24) & 0xFF), UInt8((value >> 16) & 0xFF), UInt8((value >> 8) & 0xFF), UInt8(value & 0xFF)])
    }

    private static func readUInt32(_ data: Data, at offset: Int) -> UInt32 {
        let b0 = UInt32(data[offset]), b1 = UInt32(data[offset + 1])
        let b2 = UInt32(data[offset + 2]), b3 = UInt32(data[offset + 3])
        return (b0 << 24) | (b1 << 16) | (b2 << 8) | b3
    }
}

public enum NetworkObfuscationError: Error {
    case payloadTooLarge
    case invalidPacketSize
    case randomFailed
    case corruptHeader
}
