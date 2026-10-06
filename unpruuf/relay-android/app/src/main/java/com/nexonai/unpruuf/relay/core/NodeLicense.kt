package com.nexonai.unpruuf.relay.core

import com.google.crypto.tink.subtle.Ed25519Verify
import java.util.Base64

/**
 * Server licence for the Android Business Node — the same offline check as
 * node-mesh-server/src/license.ts, byte for byte the same code format:
 *
 *   unpruuf-server-license:v1:<base64url(payload)>:<base64url(ed25519 signature)>
 *   payload   = 1|<serial>|<customer>|<maxNodes>|<issuedAtMs>|<expiresAtMs>
 *   signature = over  "unpruuf-server-license-v1\n" + payload
 *
 * Signed with the same key as the app licences (license-tool). Nothing is sent anywhere, no
 * device is identified. An Android node is always exactly one node, so [Info.maxNodes] is read
 * but does not change anything here. Without a licence the owner QR stays hidden and deposits
 * are refused (HTTP 402); after expiry deposits are refused too, reading keeps working so
 * nothing already stored is lost. A renewal takes effect at once.
 *
 * Honest limit, same as on the PC server: this is the customer's own device and readable code.
 * The check keeps honest customers honest; it is not copy protection.
 */
object NodeLicense {
    const val PREFIX = "unpruuf-server-license:v1:"
    const val APP_PREFIX = "unpruuf-license:v1:"
    private const val SIGN_DOMAIN = "unpruuf-server-license-v1\n"
    private const val MAX_NODES = 250
    private const val DAY_MS = 24L * 60 * 60 * 1000
    const val EXPIRY_WARNING_DAYS = 30L

    /** Same Ed25519 public key as the app's LicenseManager.PUBLIC_KEY_B64 and the PC server. */
    const val PUBLIC_KEY_B64 = "67A_r4YeFkvYoXDF30gar2gRBcufokgvYQd5dVeEwKE"

    data class Info(val serial: String, val customer: String, val maxNodes: Int, val issuedAtMs: Long, val expiresAtMs: Long)

    enum class Status { MISSING, INVALID, VALID, EXPIRING, EXPIRED }

    data class Summary(val status: Status, val customer: String?, val serial: String?, val expiresAtMs: Long?, val daysLeft: Long?)

    sealed class ApplyResult {
        data class Ok(val info: Info) : ApplyResult()
        object WrongType : ApplyResult()
        object Invalid : ApplyResult()
    }

    private fun decode(s: String): ByteArray? = runCatching { Base64.getUrlDecoder().decode(s) }.getOrNull()

    /** The licence inside [code], or null for anything that is not a genuinely signed server licence. */
    fun verify(code: String, publicKeyB64: String = PUBLIC_KEY_B64): Info? {
        val trimmed = code.trim()
        if (!trimmed.startsWith(PREFIX)) return null
        val rest = trimmed.substring(PREFIX.length)
        val sep = rest.lastIndexOf(':')
        if (sep <= 0 || sep == rest.length - 1) return null
        val payloadBytes = decode(rest.substring(0, sep)) ?: return null
        val signature = decode(rest.substring(sep + 1)) ?: return null
        if (signature.size != 64) return null
        val publicKey = decode(publicKeyB64) ?: return null
        val signed = (SIGN_DOMAIN + String(payloadBytes, Charsets.UTF_8)).toByteArray(Charsets.UTF_8)
        if (runCatching { Ed25519Verify(publicKey).verify(signature, signed) }.isFailure) return null
        val f = String(payloadBytes, Charsets.UTF_8).split("|")
        if (f.size != 6 || f[0] != "1") return null
        val maxNodes = f[3].toIntOrNull() ?: return null
        if (maxNodes < 1 || maxNodes > MAX_NODES) return null
        val issued = f[4].toLongOrNull() ?: return null
        val expires = f[5].toLongOrNull() ?: return null
        return Info(f[1], f[2], maxNodes, issued, expires)
    }

    /** Where the applied code lives — SharedPreferences in the app, a map in tests. */
    interface CodeStore {
        fun read(): String?
        fun write(code: String)
    }

    /** Holds the node's licence. */
    class Guard(
        private val store: CodeStore,
        private val publicKeyB64: String = PUBLIC_KEY_B64,
        private val now: () -> Long = System::currentTimeMillis
    ) {
        private var info: Info? = null
        private var sawCode = false

        init { reload() }

        fun reload() {
            val code = store.read()?.trim().orEmpty()
            sawCode = code.isNotEmpty()
            info = if (sawCode) verify(code, publicKeyB64) else null
        }

        fun apply(code: String): ApplyResult {
            val trimmed = code.trim()
            val verified = verify(trimmed, publicKeyB64)
                ?: return if (trimmed.startsWith(APP_PREFIX)) ApplyResult.WrongType else ApplyResult.Invalid
            store.write(trimmed)
            reload()
            return ApplyResult.Ok(verified)
        }

        fun status(): Status {
            val i = info ?: return if (sawCode) Status.INVALID else Status.MISSING
            val left = i.expiresAtMs - now()
            return when {
                left <= 0 -> Status.EXPIRED
                left <= EXPIRY_WARNING_DAYS * DAY_MS -> Status.EXPIRING
                else -> Status.VALID
            }
        }

        /** A genuine licence is present (valid, expiring or expired). */
        fun activated(): Boolean = info != null

        /** Reason code when new deposits must be refused, else null. Reading is never blocked. */
        fun depositBlocked(): String? = when (status()) {
            Status.EXPIRED -> "license_expired"
            Status.MISSING, Status.INVALID -> "license_missing"
            else -> null
        }

        fun summary(): Summary {
            val i = info
            return Summary(status(), i?.customer, i?.serial, i?.expiresAtMs, i?.let { (it.expiresAtMs - now()) / DAY_MS })
        }
    }
}
