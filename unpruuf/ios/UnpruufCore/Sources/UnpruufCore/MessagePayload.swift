import Foundation

/// Binary layout of the plaintext a Double Ratchet message carries: `[type: 1 byte][payload]`.
/// Lives *inside* the ratchet ciphertext — see ``RatchetFrame`` for the outer chunking/framing
/// that wraps the ciphertext itself. Direct port of the Android app's `MessagePayload.kt`.
public enum MessagePayload {
    private static let typeText: UInt8 = 0
    private static let typeFile: UInt8 = 1
    private static let typeImage: UInt8 = 2

    public enum Content {
        case text(String)
        case attachment(name: String, bytes: Data, isImage: Bool)
    }

    public static func encodeText(_ text: String) -> Data {
        var out = Data([typeText])
        out.append(text.data(using: .utf8) ?? Data())
        return out
    }

    public static func encodeAttachment(name: String, bytes: Data, isImage: Bool) throws -> Data {
        guard let nameBytes = name.data(using: .utf8), nameBytes.count <= 0xFFFF else {
            throw MessagePayloadError.nameTooLong
        }
        var out = Data(capacity: 1 + 2 + nameBytes.count + bytes.count)
        out.append(isImage ? typeImage : typeFile)
        out.append(UInt8((nameBytes.count >> 8) & 0xFF))
        out.append(UInt8(nameBytes.count & 0xFF))
        out.append(nameBytes)
        out.append(bytes)
        return out
    }

    public static func decode(_ raw: Data) -> Content? {
        guard !raw.isEmpty else { return nil }
        let base = raw.startIndex
        switch raw[base] {
        case typeText:
            let textData = raw.subdata(in: (base + 1)..<raw.endIndex)
            return .text(String(data: textData, encoding: .utf8) ?? "")
        case typeFile, typeImage:
            guard raw.count >= 3 else { return nil }
            let nameLen = (Int(raw[base + 1]) << 8) | Int(raw[base + 2])
            guard raw.count >= 3 + nameLen else { return nil }
            let nameData = raw.subdata(in: (base + 3)..<(base + 3 + nameLen))
            guard let name = String(data: nameData, encoding: .utf8) else { return nil }
            let bytes = raw.subdata(in: (base + 3 + nameLen)..<raw.endIndex)
            return .attachment(name: name, bytes: bytes, isImage: raw[base] == typeImage)
        default:
            return nil
        }
    }
}

public enum MessagePayloadError: Error {
    case nameTooLong
}
