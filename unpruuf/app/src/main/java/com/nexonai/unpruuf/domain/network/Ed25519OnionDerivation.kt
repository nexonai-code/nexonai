package com.nexonai.unpruuf.domain.network

import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Derives a Tor v3 (Ed25519) hidden-service identity key deterministically from a device-local
 * secret, so the "verified" onion (see TorManager.ensureVerifiedOnion) can rotate to a fresh,
 * unpredictable-without-the-secret key on a schedule — without needing to separately generate
 * and persist a new random Tor private key every rotation. Only ever used on the registering
 * device itself: the resulting .onion address is still read back from Tor's own ADD_ONION
 * response (HS_ADDRESS), never independently recomputed elsewhere — see TorManager and
 * P2PNetworkManager.sendVerifiedOnionUpdate for why contacts learn the address via a normal
 * signal instead of computing it themselves (that would need Ed25519 point multiplication and
 * SHA3-256 for the address checksum, real library-grade crypto this project isn't taking on
 * hand-rolled — see the CHANGELOG entry this shipped with).
 *
 * Standard RFC 8032 Ed25519 secret-key expansion (seed -> SHA-512 -> clamp) — the same scheme
 * Tor's own `tor --keygen`/ed25519 identity keys use, not a Tor-specific derivation. Tor's
 * ADD_ONION control command accepts a key blob in exactly this "expanded" 64-byte form
 * (clamped scalar || nonce-derivation prefix), base64-encoded, prefixed "ED25519-V3:".
 *
 * CAUTION: this is genuine key-derivation code, not tag/HMAC comparison like the rest of the
 * wire-ID rotation machinery. It has not been exercised against a live Tor control port (no
 * Tor/Android SDK in the environment that wrote it) — TorManager.ensureVerifiedOnion()
 * self-tests reachability after every registration specifically to catch a derivation mistake
 * quickly rather than silently. Treat as unverified until confirmed working on a real device.
 */
object Ed25519OnionDerivation {

    /**
     * [seed] must be exactly 32 bytes (this is always an HMAC-SHA256 output here — see
     * [deriveTorKeyBlob]). Returns the 64-byte "expanded" Ed25519 secret key: SHA-512(seed),
     * then RFC 8032 §5.1.5 clamping applied to the first 32 bytes (the scalar) — the second 32
     * bytes (the nonce-derivation prefix) are used exactly as SHA-512 produced them, unclamped,
     * per the same spec.
     */
    fun expandSeed(seed: ByteArray): ByteArray {
        require(seed.size == 32) { "Ed25519 seed must be 32 bytes, got ${seed.size}" }
        val h = MessageDigest.getInstance("SHA-512").digest(seed)
        // Clamp the scalar half (RFC 8032 §5.1.5): clear the low 3 bits (cofactor clearing so
        // the scalar is a multiple of 8), clear the top bit, set the second-highest bit (keeps
        // the scalar in the correct range for the standard Ed25519 basepoint order).
        h[0] = (h[0].toInt() and 0xF8).toByte()
        h[31] = (h[31].toInt() and 0x7F).toByte()
        h[31] = (h[31].toInt() or 0x40).toByte()
        return h
    }

    /**
     * [factor] (device-local, never sent anywhere — see IdentityManager.verifiedOnionFactor)
     * and [periodIndex] (a UTC day bucket) -> the exact "ED25519-V3:<base64>" key blob string
     * Tor's ADD_ONION control command expects. Domain-separated from every other HMAC use in
     * this codebase (a fixed label, not just the raw period number) so this can never collide
     * with wire-ID/rotation-offset derivations even if a factor were ever reused by mistake.
     */
    fun deriveTorKeyBlob(factor: ByteArray, periodIndex: Long): String {
        val seed = hmacSha256(factor, "unpruuf-verified-onion-v1:$periodIndex".toByteArray(Charsets.UTF_8))
        val expanded = expandSeed(seed)
        return "ED25519-V3:" + android.util.Base64.encodeToString(expanded, android.util.Base64.NO_WRAP)
    }

    private fun hmacSha256(key: ByteArray, msg: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(msg)
    }
}
