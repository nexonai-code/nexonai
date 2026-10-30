import CryptoKit
import Foundation

/// Routing tags of the Node-Mesh, ported from `IdentityManager.nodeMeshPairSecret`,
/// `nodeMeshRoutingTag` and `nodeMeshToleranceEpochs`. Both sides of a pair compute the same tags
/// from the two routing seeds; the seeds are never used for anything else.
public enum NodeMeshRouting {
    /// Protocol constant, the tag changes every hour.
    public static let rotationIntervalMs: Int64 = 3_600_000
    /// Longest chat lifetime, so the longest a packet can wait for its reader.
    public static let maxTtlMs: Int64 = 24 * 3_600_000

    /// SHA-256 over the two values in unsigned byte order, so both sides get the same 32 bytes.
    public static func sortedHash(_ mine: Data, _ theirs: Data) -> Data {
        let a = [UInt8](mine), b = [UInt8](theirs)
        let (first, second) = b.lexicographicallyPrecedes(a) ? (b, a) : (a, b)
        var hasher = SHA256()
        hasher.update(data: Data(first))
        hasher.update(data: Data(second))
        return Data(hasher.finalize())
    }

    public static func pairRouting(mySeed: Data, theirSeed: Data) -> Data {
        sortedHash(mySeed, theirSeed)
    }

    public static func epoch(unixMs: Int64) -> Int64 {
        unixMs / rotationIntervalMs
    }

    /// Standard base64 with padding. It contains `+`, `/` and `=`, so it needs percent-encoding
    /// in a query string; JSON bodies carry it as it is.
    public static func tag(pairRouting: Data, epoch: Int64) -> String {
        let mac = HMAC<SHA256>.authenticationCode(for: Data("routing:\(epoch)".utf8), using: SymmetricKey(data: pairRouting))
        return Data(mac).base64EncodedString()
    }

    /// Every epoch a packet still alive at `unixMs` can be tagged with, newest first: 26 epochs.
    public static func windowEpochs(unixMs: Int64) -> [Int64] {
        let current = epoch(unixMs: unixMs)
        let size = (maxTtlMs + rotationIntervalMs - 1) / rotationIntervalMs + 1
        return (0...size).map { current - $0 }
    }
}
