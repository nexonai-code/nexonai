package com.nexonai.unpruuf.domain.network

import com.google.crypto.tink.subtle.Hkdf
import com.google.crypto.tink.subtle.X25519
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Whistleblower edition: one organisation-wide QR instead of one code per reporter, plus the
 * case number / status the officer sends back. Byte-compatible with
 * officer-app/src/officer/caseIntake.ts and caseSignals.ts — see those files for the reasoning.
 *
 * Intake (reporter → officer's letterbox, sent automatically after scanning the officer QR):
 *   tag    = base64(HMAC-SHA256(officerMessageKey, "unpruuf-intake-v1:" + hour))
 *   packet = ephemeralX25519Pub(32) || iv(12) || AES-256-GCM(key, plaintext), then padded
 *            key = HKDF-SHA256(X25519(ephemeral, officerPub), salt = officerMessageKey,
 *                              info = "unpruuf-intake-v1", 32)
 *   plaintext = "UNPRUUF_INTAKE_V1\n" + wireIdentity + "\n" + my cross-platform pairing JSON
 *
 * Case signal (officer → reporter, inside the normal Double Ratchet, never shown as a chat line):
 *   "UNPRUUF_CASE_V1:" + {"n":number,"s":status,"o":openedAt,"a":ackDue,"f":feedbackDue,"t":updatedAt}
 */
object OfficerCase {
    const val INTAKE_INFO = "unpruuf-intake-v1"
    const val INTAKE_PLAINTEXT_PREFIX = "UNPRUUF_INTAKE_V1"
    const val CASE_SIGNAL_PREFIX = "UNPRUUF_CASE_V1:"
    /** Hidden first ratchet message right after pairing — gives a session in which the officer
     *  is the receiving side its sending chain, so the receipt can come back at once. */
    const val CASE_HELLO_TEXT = "UNPRUUF_CASE_HELLO_V1"

    /** Re-send the intake this often until the receipt (case number) arrives. */
    const val INTAKE_RETRY_MS = 6 * 60 * 60 * 1000L
    /** …and give up after this long (the officer's letterbox is polled 48 h back). */
    const val INTAKE_GIVE_UP_MS = 14 * 24 * 60 * 60 * 1000L

    private const val HOUR_MS = 60 * 60 * 1000L

    fun hour(nowMs: Long = System.currentTimeMillis()): Long = nowMs / HOUR_MS

    fun intakeTag(officerMessageKey: ByteArray, hour: Long): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(officerMessageKey, "HmacSHA256"))
        return Base64.getEncoder().encodeToString(mac.doFinal("$INTAKE_INFO:$hour".toByteArray(Charsets.UTF_8)))
    }

    fun encodeIntakePlaintext(wireIdentity: String?, pairingJson: String): ByteArray =
        "$INTAKE_PLAINTEXT_PREFIX\n${wireIdentity ?: ""}\n$pairingJson".toByteArray(Charsets.UTF_8)

    /** Seals [plaintext] so that only the officer (holder of [officerX25519Pub]'s private key)
     *  can open it. Not yet padded — the caller pads like every other packet. */
    fun sealIntake(officerX25519Pub: ByteArray, officerMessageKey: ByteArray, plaintext: ByteArray): ByteArray {
        val ephPriv = X25519.generatePrivateKey()
        val ephPub = X25519.publicFromPrivate(ephPriv)
        val shared = X25519.computeSharedSecret(ephPriv, officerX25519Pub)
        val key = Hkdf.computeHkdf("HmacSha256", shared, officerMessageKey, INTAKE_INFO.toByteArray(Charsets.UTF_8), 32)
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        return ephPub + iv + cipher.doFinal(plaintext)
    }

    /** What the reporter's "My case" screen shows. */
    data class CaseInfo(
        val number: String,
        val status: String,
        val openedAt: Long?,
        val ackDueAt: Long?,
        val feedbackDueAt: Long?,
        val updatedAt: Long
    )

    private val CASE_NUMBER = Regex("^HW-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$")
    private val STATUSES = setOf("acknowledged", "in_progress", "closed")

    /** Parses the JSON after [CASE_SIGNAL_PREFIX]. Null for anything malformed — a bad signal
     *  must never crash the receive path or overwrite a good case with garbage. Hand-rolled
     *  (flat object, known keys) so it runs in plain JVM unit tests too. */
    fun parseCaseSignal(json: String): CaseInfo? {
        fun str(key: String) = Regex(""""$key"\s*:\s*"([^"]*)"""").find(json)?.groupValues?.get(1)
        fun num(key: String) = Regex(""""$key"\s*:\s*(\d+)""").find(json)?.groupValues?.get(1)?.toLongOrNull()
        val number = str("n")?.takeIf { CASE_NUMBER.matches(it) } ?: return null
        val status = str("s")?.takeIf { it in STATUSES } ?: return null
        return CaseInfo(number, status, num("o"), num("a"), num("f"), num("t") ?: System.currentTimeMillis())
    }
}
