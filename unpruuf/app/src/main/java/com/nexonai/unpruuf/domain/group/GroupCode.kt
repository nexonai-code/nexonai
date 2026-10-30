package com.nexonai.unpruuf.domain.group

import java.security.MessageDigest
import java.security.SecureRandom

/**
 * The shared secret that makes a set of people "the same group" on every phone.
 *
 * There is no group server and no global identity, so nothing can tell two phones that "Team Wien"
 * on one is "Team Wien" on the other. The members agree on one code (read out, shown as text or
 * sent in an existing chat), and each of them creates the group locally with it. The code never
 * leaves the end-to-end encrypted 1:1 messages in clear: on the wire a group message carries only
 * [groupId], a one-way hash of the code.
 *
 * Format: 12 random characters of a 32-letter alphabet without look-alikes (60 bits), then 2 check
 * characters, written in groups of four (`ABCD-EFGH-JKLM-NP`). The check characters catch a wrong or
 * swapped character before someone silently ends up in a different group.
 */
object GroupCode {
    const val ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    private const val BODY = 12
    private const val CHECK = 2
    private const val ID_DOMAIN = "unpruuf-group-id-v1:"

    private val random = SecureRandom()

    fun generate(): String {
        val body = StringBuilder()
        repeat(BODY) { body.append(ALPHABET[random.nextInt(ALPHABET.length)]) }
        return format(body.toString() + check(body.toString()))
    }

    /** True if [input] has the right length, only alphabet characters and a matching check. */
    fun isValid(input: String): Boolean {
        val n = input.uppercase().filter { it.isLetterOrDigit() }
        if (n.length != BODY + CHECK) return false
        if (n.any { it !in ALPHABET }) return false
        return check(n.substring(0, BODY)) == n.substring(BODY)
    }

    /** Canonical stored form of a valid code, or null. */
    fun canonical(input: String): String? {
        if (!isValid(input)) return null
        return format(input.uppercase().filter { it.isLetterOrDigit() })
    }

    /** The 8 bytes a group message carries on the wire. One-way: the code cannot be read back from it. */
    fun groupId(code: String): ByteArray {
        val n = code.uppercase().filter { it.isLetterOrDigit() }
        return MessageDigest.getInstance("SHA-256").digest((ID_DOMAIN + n).toByteArray(Charsets.UTF_8)).copyOf(8)
    }

    fun groupIdHex(code: String): String = hex(groupId(code))

    fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    /**
     * Two weighted sums over the 32-letter alphabet (Σv and Σ(i+1)·v, both mod 32). Unlike a hash,
     * this DETECTS EVERY single wrong character and every swap of two neighbouring characters —
     * the mistakes people make when reading a code aloud — instead of "almost always".
     */
    private fun check(body: String): String {
        var sum = 0
        var weighted = 0
        body.forEachIndexed { i, ch ->
            val v = ALPHABET.indexOf(ch)
            sum += v
            weighted += (i + 1) * v
        }
        return "" + ALPHABET[sum % 32] + ALPHABET[weighted % 32]
    }

    private fun format(raw: String): String = raw.chunked(4).joinToString("-")
}
