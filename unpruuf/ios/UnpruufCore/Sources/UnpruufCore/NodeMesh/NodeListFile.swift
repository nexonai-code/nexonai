import Foundation

/// The node-list file a server exports (`node-mesh-server/src/nodeList.ts`), ported from Android's
/// `NodeListFile`. It contains the owner secret, so it is exactly as sensitive as the owner QR:
/// this app only reads it, never writes one.
public enum NodeListFile {
    public static let header = "unpruuf-node-list:v1"
    /// Refuse absurd inputs before parsing: a real file is about 70 bytes per node.
    public static let maxChars = 400_000
    public static let maxAddresses = 5_000
    public static let maxBridges = 10

    public struct Parsed: Equatable {
        public let name: String
        public let ownerSecret: String
        public let control: String?
        public let addresses: [String]
        public let bridges: [String]
    }

    private static let secretCharacters = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")

    public static func parse(_ text: String) -> Parsed? {
        guard text.utf16.count <= maxChars else { return nil }
        var body = text
        if body.hasPrefix("\u{FEFF}") { body.removeFirst() }
        let lines = body.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        guard lines.first?.trimmingCharacters(in: .whitespaces) == header else { return nil }

        var values: [String: String] = [:]
        var bridgeLines: [String] = []
        var i = 1
        while i < lines.count, !lines[i].trimmingCharacters(in: .whitespaces).isEmpty {
            guard let (key, value) = keyValue(lines[i]) else { return nil }
            if key == "bridge" { bridgeLines.append(value) } else { values[key] = value }
            i += 1
        }

        var seen = Set<String>()
        var addresses: [String] = []
        for line in lines.dropFirst(i + 1) {
            let address = line.trimmingCharacters(in: .whitespaces)
            if address.isEmpty { continue }
            guard OnionAddress.isValid(address) else { return nil }
            if seen.insert(address).inserted { addresses.append(address) }
            if addresses.count > maxAddresses { return nil }
        }

        guard let secret = values["secret"], (16...128).contains(secret.count),
              secret.allSatisfy({ secretCharacters.contains($0) }), !addresses.isEmpty else { return nil }
        if let count = values["count"], Int(count) != addresses.count { return nil }
        let control = values["control"].flatMap { $0.isEmpty ? nil : $0 }
        if let control, !OnionAddress.isValid(control) { return nil }
        return Parsed(name: NodeLists.cleanName(values["name"] ?? ""), ownerSecret: secret, control: control,
                      addresses: addresses, bridges: cleanBridgeLines(bridgeLines))
    }

    private static func keyValue(_ line: String) -> (String, String)? {
        guard let colon = line.firstIndex(of: ":"), colon > line.startIndex else { return nil }
        let key = String(line[..<colon])
        guard key.unicodeScalars.allSatisfy({ ("a"..."z").contains($0) }) else { return nil }
        return (key, String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces))
    }

    private static let obfs4 = try! NSRegularExpression(pattern: "^obfs4 \\S+:\\d{1,5} [0-9A-Fa-f]{40} cert=[A-Za-z0-9+/]{20,}={0,2}( iat-mode=[0-2])?$")
    private static let vanilla = try! NSRegularExpression(pattern: "^(\\[[0-9a-fA-F:]+]|\\d{1,3}(\\.\\d{1,3}){3}):\\d{1,5}( [0-9A-Fa-f]{40})?$")

    /// Valid, distinct bridge lines, at most `maxBridges`. Ported from `ConnectionPaths`.
    static func cleanBridgeLines(_ raw: [String]) -> [String] {
        var out: [String] = []
        for line in raw {
            guard let clean = cleanBridgeLine(line), !out.contains(clean) else { continue }
            out.append(clean)
        }
        return Array(out.prefix(maxBridges))
    }

    private static func cleanBridgeLine(_ raw: String) -> String? {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.lowercased().hasPrefix("bridge ") {
            s = String(s.dropFirst(7)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard s.utf16.count <= 600, !s.unicodeScalars.contains(where: { $0.properties.generalCategory == .control }) else { return nil }
        let range = NSRange(s.startIndex..., in: s)
        let matches = obfs4.firstMatch(in: s, range: range) != nil || vanilla.firstMatch(in: s, range: range) != nil
        return matches ? s : nil
    }
}

/// Named groups of own nodes. The list storage comes with `NodeMeshStore`; the name rule is here
/// because the node-list file needs it.
public enum NodeLists {
    public static let defaultName = "Standard"
    public static let maxName = 60

    public static func cleanName(_ raw: String) -> String {
        var out = ""
        var inSeparator = false
        for scalar in raw.unicodeScalars {
            if "\r\n\t;|".unicodeScalars.contains(scalar) {
                if !inSeparator { out += " " }
                inSeparator = true
            } else {
                out.unicodeScalars.append(scalar)
                inSeparator = false
            }
        }
        return String(out.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxName))
    }
}
