import CryptoKit
import Foundation

/// Small storage protocol `Identity` is built against, so this file has no Keychain dependency
/// and stays testable without one — `UnpruufApp`'s `KeychainStore` is the real implementation.
public protocol KeyValueStore {
    func getString(_ key: String) -> String?
    func setString(_ key: String, _ value: String)
}

/// Per-device identity plus the pair-secret/wire-tag math, a port of the relevant half of the
/// Android app's `IdentityManager.kt`. The wire-tag rotation formula here is adapted for
/// cross-platform mode: Android rotates hourly on an assumption both clocks independently agree;
/// cross-platform mode drops that assumption (see `CROSS_PLATFORM_PLAN.md`) in favor of an
/// explicit, `Wechsel`-communicated **generation counter** in the same HMAC formula's slot the
/// hour bucket used to occupy.
public final class Identity {
    private let store: KeyValueStore

    public init(store: KeyValueStore) {
        self.store = store
    }

    public lazy var userId: String = {
        if let existing = store.getString("user_id") { return existing }
        let id = UUID().uuidString
        store.setString("user_id", id)
        return id
    }()

    /// 32-byte symmetric receive key — shared via QR code so contacts can encrypt to us.
    public lazy var myMessageKey: Data = {
        if let existing = store.getString("msg_key"), let data = Data(base64Encoded: existing) {
            return data
        }
        var key = Data(count: 32)
        _ = key.withUnsafeMutableBytes { ptr in SecRandomCopyBytes(kSecRandomDefault, 32, ptr.baseAddress!) }
        store.setString("msg_key", key.base64EncodedString())
        return key
    }()

    public lazy var myX25519RatchetKeyPair: DoubleRatchet.KeyPair = {
        if let privB64 = store.getString("x25519_ratchet_priv_key"),
           let pubB64 = store.getString("x25519_ratchet_pub_key"),
           let priv = Data(base64Encoded: privB64), let pub = Data(base64Encoded: pubB64) {
            return DoubleRatchet.KeyPair(privateKey: priv, publicKey: pub)
        }
        let pair = DoubleRatchet.generateKeyPair()
        store.setString("x25519_ratchet_priv_key", pair.privateKey.base64EncodedString())
        store.setString("x25519_ratchet_pub_key", pair.publicKey.base64EncodedString())
        return pair
    }()

    public var myX25519RatchetPublicKeyBase64: String {
        myX25519RatchetKeyPair.publicKey.base64EncodedString()
    }

    /// The pair's actual shared secret: symmetric because both devices compute it from the same
    /// two inputs (my key, their key), sorted into a fixed order before hashing — device A calling
    /// this with B's key and device B calling this with A's key produce the identical 32 bytes.
    /// Used to derive the wire tag (below) and the Double Ratchet's X3DH-lite salt/AAD.
    public func pairSecret(contactMsgKey: Data) -> Data {
        let mine = [UInt8](myMessageKey)
        let other = [UInt8](contactMsgKey)
        let (a, b) = Self.compareUnsigned(mine, other) <= 0 ? (mine, other) : (other, mine)
        var hasher = SHA256()
        hasher.update(data: Data(a))
        hasher.update(data: Data(b))
        return Data(hasher.finalize())
    }

    /// **Real bug found on real hardware, 2026‑09‑02 — the first Android↔iOS cross-platform
    /// message exchange ever actually tested in this project.** Diagnostic logging added to
    /// `RelayService.pollOnce` showed the tag iOS computed for an Android contact never matching
    /// the tag the Android device actually stored its packets under — every fetch legitimately
    /// returned 0 blobs, forever, even though the relay's own status confirmed the messages were
    /// sitting there waiting. Root cause: `UUID.uuidString` on Swift always returns UPPERCASE hex
    /// (`FC7FDEDD-...`), while Kotlin/Java's `UUID.toString()` always returns lowercase
    /// (`fc7fdedd-...`) — confirmed by comparing a real contact's `id` (captured from the
    /// Android peer's QR code, uppercase after Swift's `UUID(uuid:).uuidString`) against what
    /// that same peer's own Android `IdentityManager.userId` actually is (lowercase, native
    /// Kotlin). Both wire-tag functions HMAC the literal `"userId:generation"` string, and HMAC
    /// is byte-exact — different case means a completely different tag for the "same" UUID, so
    /// Android↔iOS wire tags could never match, only same-platform ones (Swift-vs-Swift or
    /// Kotlin-vs-Kotlin) happened to always agree since each side is internally consistent with
    /// itself. Fixed by lowercasing the userId component right here, at the one place both
    /// directions' tags are actually built, rather than needing to migrate every already-stored
    /// `Identity.userId`/`Contact.id` value — this fixes an existing broken pairing (like the one
    /// that surfaced it) immediately, with no re-pairing needed, since Kotlin's `UUID.toString()`
    /// was already lowercase and this makes Swift's match it instead of the other way around.
    ///
    /// Wire tag I identify myself with to a contact, for rotation `generation` (0 at pairing,
    /// incremented and explicitly propagated on each "Wechsel" — see `ControlSignals`).
    public func myWireTag(contactMsgKey: Data, generation: Int) -> String {
        hmac(key: pairSecret(contactMsgKey: contactMsgKey), message: "\(userId.lowercased()):\(generation)")
    }

    /// Wire tag the contact (`contactUserId`) identifies themself with, for the same generation.
    public func expectedWireTag(contactMsgKey: Data, contactUserId: String, generation: Int) -> String {
        hmac(key: pairSecret(contactMsgKey: contactMsgKey), message: "\(contactUserId.lowercased()):\(generation)")
    }

    private func hmac(key: Data, message: String) -> String {
        let mac = HMAC<SHA256>.authenticationCode(for: Data(message.utf8), using: SymmetricKey(data: key))
        return Data(mac).base64EncodedString()
    }

    /// Out-of-band pairing verification (safety number) — port of the Android app's
    /// `IdentityManager.safetyNumber()`. Derived from both devices' static X25519 identity
    /// (ratchet) keys — sorted into a fixed order, then SHA-256 hashed, so both sides compute the
    /// identical code regardless of who's "mine" vs "theirs" (same "sort two keys, then hash"
    /// shape as `pairSecret()` above). Meant to be compared over a channel DIFFERENT from
    /// whatever carried the pairing QR/relay string itself (a call, a voice message) — offline,
    /// no network round-trip, which matters here more than on Android: cross-platform mode has no
    /// guarantee both devices are ever online at the same moment. Particularly relevant for
    /// cross-platform (iOS<->Android) pairing specifically, since that's the least build-verified
    /// pairing path in the whole system (see the iOS plan's Phase iOS-1) — this is the direct,
    /// user-facing mitigation for exactly that residual risk.
    public func safetyNumber(theirX25519RatchetPublicKeyBase64: String) -> String {
        guard let theirs = Data(base64Encoded: theirX25519RatchetPublicKeyBase64) else { return "------" }
        let mine = [UInt8](myX25519RatchetKeyPair.publicKey)
        let theirBytes = [UInt8](theirs)
        let (a, b) = Self.compareUnsigned(mine, theirBytes) <= 0 ? (mine, theirBytes) : (theirBytes, mine)
        var hasher = SHA256()
        hasher.update(data: Data(a))
        hasher.update(data: Data(b))
        let digest = [UInt8](hasher.finalize())
        // First 4 bytes -> unsigned 32-bit -> mod 1,000,000 -> zero-padded 6-digit code, grouped
        // for readability — same truncation Android's safetyNumber() uses, so both platforms
        // would show the identical code for the identical pair of keys.
        let n = (UInt32(digest[0]) << 24) | (UInt32(digest[1]) << 16) | (UInt32(digest[2]) << 8) | UInt32(digest[3])
        // Int(), not passing UInt32 straight to String(format:) — %d's C variadic argument
        // promotion expects a size/signedness match with the format specifier, and a raw UInt32
        // isn't guaranteed to bridge correctly through that call on every architecture.
        let code = String(format: "%06d", Int(n % 1_000_000))
        let start = code.index(code.startIndex, offsetBy: 3)
        return "\(code[code.startIndex..<start]) \(code[start...])"
    }

    private static func compareUnsigned(_ a: [UInt8], _ b: [UInt8]) -> Int {
        let n = min(a.count, b.count)
        for i in 0..<n {
            let d = Int(a[i]) - Int(b[i])
            if d != 0 { return d }
        }
        return a.count - b.count
    }
}
