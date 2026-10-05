import CryptoKit
import Foundation

/// unpruuf Compliance (Whistleblower): one organisation-wide QR instead of one code per reporter,
/// plus the case number / status the reporting office sends back. Byte-compatible with
/// `officer-app/src/officer/caseIntake.ts` + `caseSignals.ts`, the Android `OfficerCase.kt` and the
/// browser reporter — see those files for the reasoning behind the format.
///
/// Intake (reporter → the office's letterbox, sent automatically after scanning the office QR):
///
///     tag    = base64(HMAC-SHA256(officerMessageKey, "unpruuf-intake-v1:" + hour))
///     packet = ephemeralX25519Pub(32) || iv(12) || AES-256-GCM ciphertext || tag(16)
///              key = HKDF-SHA256(X25519(ephemeral, officerPub), salt: officerMessageKey,
///                                info: "unpruuf-intake-v1", 32 bytes)
///     plaintext = "UNPRUUF_INTAKE_V1\n" + wireIdentity + "\n" + the reporter's pairing JSON
///
/// `iv || ciphertext || tag` is exactly `AES.GCM.SealedBox.combined`, so the sealed packet is the
/// ephemeral public key followed by the box.
///
/// Case signal (office → reporter, inside the normal Double Ratchet, never shown as a chat line):
/// `"UNPRUUF_CASE_V1:" + {"n":number,"s":status,"o":openedAt,"a":ackDue,"f":feedbackDue,"t":updatedAt}`
public enum OfficerCase {
    public static let intakeInfo = "unpruuf-intake-v1"
    public static let intakePlaintextPrefix = "UNPRUUF_INTAKE_V1"
    public static let caseSignalPrefix = "UNPRUUF_CASE_V1:"
    /// Hidden first ratchet message right after pairing: gives a session in which the office is the
    /// receiving side its sending chain, so the receipt can come back at once.
    public static let caseHelloText = "UNPRUUF_CASE_HELLO_V1"

    /// Re-send the intake this often until the receipt (case number) arrives.
    public static let intakeRetryInterval: TimeInterval = 6 * 60 * 60
    /// …and give up after this long (the office's letterbox is polled 48 h back).
    public static let intakeGiveUpAfter: TimeInterval = 14 * 24 * 60 * 60

    private static let hourSeconds: TimeInterval = 60 * 60

    public static func hour(at date: Date = Date()) -> Int64 {
        Int64(date.timeIntervalSince1970 / hourSeconds)
    }

    public static func intakeTag(officerMessageKey: Data, hour: Int64) -> String {
        let mac = HMAC<SHA256>.authenticationCode(
            for: Data("\(intakeInfo):\(hour)".utf8), using: SymmetricKey(data: officerMessageKey)
        )
        return Data(mac).base64EncodedString()
    }

    public static func encodeIntakePlaintext(wireIdentity: String?, pairingJSON: String) -> Data {
        Data("\(intakePlaintextPrefix)\n\(wireIdentity ?? "")\n\(pairingJSON)".utf8)
    }

    private static func intakeKey(sharedSecret: SharedSecret, officerMessageKey: Data) -> SymmetricKey {
        sharedSecret.hkdfDerivedSymmetricKey(
            using: SHA256.self, salt: officerMessageKey, sharedInfo: Data(intakeInfo.utf8), outputByteCount: 32
        )
    }

    /// Seals `plaintext` so that only the office (holder of `officerX25519Pub`'s private key) can
    /// open it. Not yet padded — the caller pads like every other packet.
    public static func sealIntake(officerX25519Pub: Data, officerMessageKey: Data, plaintext: Data) throws -> Data {
        let ephemeral = Curve25519.KeyAgreement.PrivateKey()
        let officerKey = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: officerX25519Pub)
        let shared = try ephemeral.sharedSecretFromKeyAgreement(with: officerKey)
        let key = intakeKey(sharedSecret: shared, officerMessageKey: officerMessageKey)
        let sealed = try AES.GCM.seal(plaintext, using: key)
        guard let combined = sealed.combined else { throw OfficerCaseError.sealFailed }
        return ephemeral.publicKey.rawRepresentation + combined
    }

    /// Office side — used by tests; the officer-app implements the same in TypeScript.
    public static func openIntake(officerPrivateKey: Data, officerMessageKey: Data, sealed: Data) throws -> Data {
        guard sealed.count >= 32 + 12 + 16 else { throw OfficerCaseError.dataTooShort }
        let base = sealed.startIndex
        let ephemeralPub = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: sealed.subdata(in: base..<(base + 32)))
        let priv = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: officerPrivateKey)
        let shared = try priv.sharedSecretFromKeyAgreement(with: ephemeralPub)
        let key = intakeKey(sharedSecret: shared, officerMessageKey: officerMessageKey)
        let box = try AES.GCM.SealedBox(combined: sealed.subdata(in: (base + 32)..<sealed.endIndex))
        return try AES.GCM.open(box, using: key)
    }

    /// What the reporter's "Status" tab shows.
    public struct CaseInfo: Equatable {
        public let number: String
        /// "acknowledged" | "in_progress" | "closed"
        public let status: String
        public let openedAt: Date?
        public let ackDueAt: Date?
        public let feedbackDueAt: Date?
        public let updatedAt: Date

        public init(number: String, status: String, openedAt: Date?, ackDueAt: Date?, feedbackDueAt: Date?, updatedAt: Date) {
            self.number = number
            self.status = status
            self.openedAt = openedAt
            self.ackDueAt = ackDueAt
            self.feedbackDueAt = feedbackDueAt
            self.updatedAt = updatedAt
        }
    }

    private static let statuses: Set<String> = ["acknowledged", "in_progress", "closed"]

    /// `HW-XXXX-XXXX`, no 0/1/I/L/O (read out loud and typed by hand) — same alphabet as the office.
    public static func isCaseNumber(_ s: String) -> Bool {
        let allowed = Set("23456789ABCDEFGHJKMNPQRSTUVWXYZ")
        let parts = s.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0] == "HW", parts[1].count == 4, parts[2].count == 4 else { return false }
        return (parts[1] + parts[2]).allSatisfy { allowed.contains($0) }
    }

    /// Parses a decrypted message text; nil for anything that is not a well-formed case signal — a
    /// bad signal must never crash the receive path or overwrite a good case with garbage.
    public static func parseCaseSignal(_ text: String) -> CaseInfo? {
        guard text.hasPrefix(caseSignalPrefix) else { return nil }
        let json = String(text.dropFirst(caseSignalPrefix.count))
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let number = obj["n"] as? String, isCaseNumber(number),
              let status = obj["s"] as? String, statuses.contains(status) else { return nil }
        func date(_ key: String) -> Date? {
            guard let ms = (obj[key] as? NSNumber)?.doubleValue else { return nil }
            return Date(timeIntervalSince1970: ms / 1000)
        }
        return CaseInfo(
            number: number, status: status, openedAt: date("o"), ackDueAt: date("a"),
            feedbackDueAt: date("f"), updatedAt: date("t") ?? Date()
        )
    }
}

public enum OfficerCaseError: Error {
    case sealFailed
    case dataTooShort
}
