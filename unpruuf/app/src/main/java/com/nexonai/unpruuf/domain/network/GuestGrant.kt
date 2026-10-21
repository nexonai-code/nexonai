package com.nexonai.unpruuf.domain.network

import java.nio.ByteBuffer
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Guest grant for the free, invite-only Client app (GUEST_LOCKERS_BUILD_SPEC.md). A signed,
 * expiring token that lets a guest without servers of their own deposit on the OWNER's node.
 *
 * The owner app issues grants with [issue]; the guest app only stores the token and sends it as
 * `Authorization: Guest <token>` (see [authorizationHeader]). The node verifies statelessly with
 * a key derived from its owner secret, so the owner secret itself never leaves the owner's side.
 *
 * Wire format is identical to node-mesh-server/src/guest/guestGrant.ts and pinned by the shared
 * vectors in `guest-grants/vectors.json` (copied to `src/test/resources`). Pure JVM on purpose:
 * no Android classes, so it runs in plain unit tests.
 */
object GuestGrant {
    const val VERSION = 1
    const val MAX_SCOPE_BYTES = 64
    private const val FIXED_LEN = 32
    private val MAC_DOMAIN = "unpruuf-guest-grant-v1\u0000".toByteArray(Charsets.UTF_8)
    private val HKDF_INFO = "unpruuf guest grant v1".toByteArray(Charsets.UTF_8)
    private val b64 = Base64.getUrlEncoder().withoutPadding()
    private val b64d = Base64.getUrlDecoder()

    data class Spec(
        val grantId: ByteArray,
        val notAfterMs: Long,
        val depositsPerHour: Int,
        val bytesPerHour: Long,
        val scope: ByteArray = ByteArray(0)
    )

    /** What a guest app can read from a token without any key: the expiry, to know when to ask
     *  for a renewal. The MAC is checked by the node, never by the guest. */
    data class Info(val grantId: ByteArray, val notAfterMs: Long, val depositsPerHour: Int, val bytesPerHour: Long, val scope: ByteArray)

    /** Issues `<base64url(grant)>.<base64url(mac)>` for [ownerSecret]. Owner side only. */
    fun issue(ownerSecret: String, spec: Spec): String {
        require(spec.grantId.size == 16) { "grantId must be 16 bytes" }
        require(spec.scope.size <= MAX_SCOPE_BYTES) { "scope too long" }
        require(spec.depositsPerHour in 0..0xFFFF) { "depositsPerHour out of range" }
        require(spec.bytesPerHour in 0..0xFFFFFFFFL) { "bytesPerHour out of range" }
        require(spec.notAfterMs >= 0) { "notAfterMs must not be negative" }
        val bb = ByteBuffer.allocate(FIXED_LEN + spec.scope.size) // big-endian by default
        bb.put(VERSION.toByte())
        bb.put(spec.grantId)
        bb.putLong(spec.notAfterMs)
        bb.putShort(spec.depositsPerHour.toShort())
        bb.putInt(spec.bytesPerHour.toInt())
        bb.put(spec.scope.size.toByte())
        bb.put(spec.scope)
        val grantBytes = bb.array()
        val mac = hmac(deriveKey(ownerSecret), MAC_DOMAIN + grantBytes)
        return b64.encodeToString(grantBytes) + "." + b64.encodeToString(mac)
    }

    /** New random grant id, 16 bytes, per invitation and per node. */
    fun newGrantId(random: SecureRandom = SecureRandom()): ByteArray = ByteArray(16).also { random.nextBytes(it) }

    /** Reads the fields of a token (no verification). Returns null for anything malformed. */
    fun parse(token: String): Info? {
        val dot = token.indexOf('.')
        if (dot <= 0 || dot == token.length - 1 || token.indexOf('.', dot + 1) != -1) return null
        val bytes = runCatching { b64d.decode(token.substring(0, dot)) }.getOrNull() ?: return null
        if (bytes.size < FIXED_LEN || bytes[0].toInt() != VERSION) return null
        val scopeLen = bytes[31].toInt() and 0xFF
        if (scopeLen > MAX_SCOPE_BYTES || bytes.size != FIXED_LEN + scopeLen) return null
        val bb = ByteBuffer.wrap(bytes)
        val grantId = ByteArray(16).also { bb.position(1); bb.get(it) }
        val notAfter = bb.getLong(17)
        if (notAfter < 0) return null
        val per = bb.getShort(25).toInt() and 0xFFFF
        val bytesPerHour = bb.getInt(27).toLong() and 0xFFFFFFFFL
        return Info(grantId, notAfter, per, bytesPerHour, bytes.copyOfRange(FIXED_LEN, bytes.size))
    }

    /** True if the token is unreadable or expires within [renewWindowMs] (default 2 days). */
    fun needsRenewal(token: String, nowMs: Long, renewWindowMs: Long = 2L * 24 * 3600 * 1000): Boolean {
        val info = parse(token) ?: return true
        return info.notAfterMs - nowMs <= renewWindowMs
    }

    fun authorizationHeader(token: String): String = "Guest $token"

    /** Joins index-aligned grant tokens for the pairing code's `g` field. Tokens only contain
     *  base64url characters and '.', so ';' is a safe separator. Empty string = no grant. */
    fun encodeList(tokens: List<String>): String = tokens.joinToString(";")

    /** Splits the `g` field back into at most [max] tokens, keeping empty slots so the list stays
     *  index-aligned with the node addresses. Anything that does not parse as a token is
     *  replaced by an empty slot instead of being trusted. */
    fun decodeList(raw: String, max: Int): List<String> =
        raw.split(";").take(max).map { if (it.isEmpty() || parse(it) == null) "" else it }

    /** HKDF-SHA256, empty salt, 32 bytes. One expand block is enough for 32 bytes. */
    internal fun deriveKey(ownerSecret: String): ByteArray {
        val prk = hmac(ByteArray(32), ownerSecret.toByteArray(Charsets.UTF_8))
        return hmac(prk, HKDF_INFO + byteArrayOf(1))
    }

    private fun hmac(key: ByteArray, data: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(data)
    }

    /** Constant-time equality for tests and any future local checks. */
    internal fun constantTimeEquals(a: ByteArray, b: ByteArray): Boolean = MessageDigest.isEqual(a, b)
}
