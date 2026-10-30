package com.nexonai.unpruuf.domain.network

import com.google.crypto.tink.subtle.Ed25519Sign
import com.google.crypto.tink.subtle.Ed25519Verify
import com.google.crypto.tink.subtle.Hkdf
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * The company list feed, app side. Must stay byte for byte the same as
 * node-mesh-server/src/feed/feedCrypto.ts (FeedCryptoTest pins vectors made there).
 *
 * A company runs a small service whose onion address CHANGES every few hours. The address is
 * derived from a shared secret (the address seed in the feed code) and the time period, so this
 * app computes where the service lives right now; nobody without the seed can. The service
 * returns one file: the company's current node lists, encrypted with the content key and signed
 * with the company's signing key. The app only accepts a list whose signature verifies, and never
 * one older than the one it already has.
 */
object FeedCrypto {
    const val FEED_CODE_PREFIX = "unpruuf-feed:v1:"
    const val LIST_HEADER = "unpruuf-feed-list:v1"
    const val LIST_SEPARATOR = "\n=====\n"
    private const val HOUR_MS = 60L * 60 * 1000
    private val B32 = "abcdefghijklmnopqrstuvwxyz234567"

    // ─── SHA3-256 (the onion address checksum). Not in Android's JCA before API 33, so it is here. ───
    private val RC: LongArray = ulongArrayOf(
        0x0000000000000001UL, 0x0000000000008082UL, 0x800000000000808aUL, 0x8000000080008000UL, 0x000000000000808bUL,
        0x0000000080000001UL, 0x8000000080008081UL, 0x8000000000008009UL, 0x000000000000008aUL, 0x0000000000000088UL,
        0x0000000080008009UL, 0x000000008000000aUL, 0x000000008000808bUL, 0x800000000000008bUL, 0x8000000000008089UL,
        0x8000000000008003UL, 0x8000000000008002UL, 0x8000000000000080UL, 0x000000000000800aUL, 0x800000008000000aUL,
        0x8000000080008081UL, 0x8000000000008080UL, 0x0000000080000001UL, 0x8000000080008008UL
    ).let { u -> LongArray(u.size) { u[it].toLong() } }
    private val ROT = intArrayOf(1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44)
    private val PI = intArrayOf(10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1)

    private fun keccakF(st: LongArray) {
        val bc = LongArray(5)
        for (round in 0 until 24) {
            for (i in 0 until 5) bc[i] = st[i] xor st[i + 5] xor st[i + 10] xor st[i + 15] xor st[i + 20]
            for (i in 0 until 5) {
                val t = bc[(i + 4) % 5] xor java.lang.Long.rotateLeft(bc[(i + 1) % 5], 1)
                for (j in 0 until 25 step 5) st[j + i] = st[j + i] xor t
            }
            var t = st[1]
            for (i in 0 until 24) {
                val j = PI[i]
                val tmp = st[j]
                st[j] = java.lang.Long.rotateLeft(t, ROT[i])
                t = tmp
            }
            for (j in 0 until 25 step 5) {
                for (i in 0 until 5) bc[i] = st[j + i]
                for (i in 0 until 5) st[j + i] = st[j + i] xor (bc[(i + 1) % 5].inv() and bc[(i + 2) % 5])
            }
            st[0] = st[0] xor RC[round]
        }
    }

    fun sha3_256(input: ByteArray): ByteArray {
        val rate = 136
        val padded = ByteArray(((input.size / rate) + 1) * rate)
        input.copyInto(padded)
        padded[input.size] = (padded[input.size].toInt() xor 0x06).toByte()
        padded[padded.size - 1] = (padded[padded.size - 1].toInt() xor 0x80).toByte()
        val st = LongArray(25)
        var off = 0
        while (off < padded.size) {
            for (i in 0 until rate / 8) {
                var lane = 0L
                for (b in 0 until 8) lane = lane or ((padded[off + i * 8 + b].toLong() and 0xff) shl (8 * b))
                st[i] = st[i] xor lane
            }
            keccakF(st)
            off += rate
        }
        val out = ByteArray(32)
        for (i in 0 until 32) out[i] = ((st[i / 8] ushr (8 * (i % 8))) and 0xff).toByte()
        return out
    }

    fun base32(buf: ByteArray): String {
        var bits = 0
        var value = 0
        val sb = StringBuilder()
        for (b in buf) {
            value = (value shl 8) or (b.toInt() and 0xff)
            bits += 8
            while (bits >= 5) {
                sb.append(B32[(value ushr (bits - 5)) and 31])
                bits -= 5
            }
        }
        if (bits > 0) sb.append(B32[(value shl (5 - bits)) and 31])
        return sb.toString()
    }

    /** The v3 onion address of an Ed25519 public key. */
    fun onionAddress(publicKey: ByteArray): String {
        val checksum = sha3_256(".onion checksum".toByteArray(Charsets.US_ASCII) + publicKey + byteArrayOf(3)).copyOfRange(0, 2)
        return base32(publicKey + checksum + byteArrayOf(3)) + ".onion"
    }

    fun epochOf(nowMs: Long, periodHours: Int): Long = nowMs / (periodHours * HOUR_MS)

    /** Where the feed lives during [epoch]. */
    fun addressForEpoch(addressSeed: ByteArray, epoch: Long): String {
        val seed = Hkdf.computeHkdf("HmacSha256", addressSeed, "unpruuf-feed-v1".toByteArray(), "onion-epoch:$epoch".toByteArray(), 32)
        return onionAddress(Ed25519Sign.KeyPair.newKeyPairFromSeed(seed).publicKey)
    }

    /** Which periods to try, best guess first — tolerates a phone clock that is off by up to [toleranceMs]. */
    fun candidateEpochs(nowMs: Long, periodHours: Int, toleranceMs: Long = 45 * 60_000L): List<Long> {
        val periodMs = periodHours * HOUR_MS
        val cur = nowMs / periodMs
        val start = cur * periodMs
        return when {
            nowMs - start < toleranceMs -> listOf(cur, cur - 1)
            start + periodMs - nowMs < toleranceMs -> listOf(cur, cur + 1)
            else -> listOf(cur)
        }
    }

    fun candidateAddresses(code: FeedCode, nowMs: Long): List<String> =
        candidateEpochs(nowMs, code.periodHours).map { addressForEpoch(code.addressSeed, it) }

    // ─── the feed code employees are given ───

    class FeedCode(
        val name: String,
        val periodHours: Int,
        val addressSeed: ByteArray,
        val contentKey: ByteArray,
        val signPublicKey: ByteArray
    )

    private fun b64u(s: String): ByteArray? = runCatching { Base64.getUrlDecoder().decode(s) }.getOrNull()

    fun parseFeedCode(text: String): FeedCode? {
        val t = text.trim()
        if (!t.startsWith(FEED_CODE_PREFIX)) return null
        val p = t.removePrefix(FEED_CODE_PREFIX).split("|")
        if (p.size != 6 || p[0] != "1") return null
        val period = p[2].toIntOrNull() ?: return null
        if (period < 1 || period > 24) return null
        val seed = b64u(p[3]) ?: return null
        val content = b64u(p[4]) ?: return null
        val pub = b64u(p[5]) ?: return null
        if (seed.size != 32 || content.size != 32 || pub.size != 32) return null
        val name = NodeLists.cleanName(p[1]).ifEmpty { "Firma" }
        return FeedCode(name, period, seed, content, pub)
    }

    // ─── the list file ───

    class OpenedList(val seq: Long, val issuedAtMs: Long, val plaintext: String)

    /** Null unless the signature is genuine (checked first) and the content decrypts. */
    fun openList(blob: String, contentKey: ByteArray, signPublicKey: ByteArray): OpenedList? = runCatching {
        val lines = blob.removePrefix("﻿").split(Regex("\r?\n"))
        if (lines[0].trim() != LIST_HEADER) return null
        val f = mutableMapOf<String, String>()
        for (line in lines.drop(1)) {
            val m = Regex("^([a-z]+): (.*)$").matchEntire(line.trim()) ?: continue
            f[m.groupValues[1]] = m.groupValues[2].trim()
        }
        val seq = f["seq"]?.toLongOrNull()?.takeIf { it >= 0 } ?: return null
        val issued = f["issued"]?.toLongOrNull() ?: return null
        val iv = f["iv"] ?: return null
        val data = f["data"] ?: return null
        val sig = Base64.getDecoder().decode(f["sig"] ?: return null)
        if (sig.size != 64) return null
        val signed = "unpruuf-feed-list-v1\n$seq\n$issued\n$iv\n$data".toByteArray(Charsets.UTF_8)
        Ed25519Verify(signPublicKey).verify(sig, signed) // throws on a bad signature
        val raw = Base64.getDecoder().decode(data)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(contentKey, "AES"), GCMParameterSpec(128, Base64.getDecoder().decode(iv)))
        cipher.updateAAD("unpruuf-feed-v1:$seq".toByteArray(Charsets.UTF_8))
        OpenedList(seq, issued, String(cipher.doFinal(raw), Charsets.UTF_8))
    }.getOrNull()

    fun splitLists(plaintext: String): List<String> =
        plaintext.split(LIST_SEPARATOR).map { it.trim() }.filter { it.isNotEmpty() }
}
