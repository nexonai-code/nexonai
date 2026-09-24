package com.nexonai.unpruuf.domain.network

import android.content.Context
import com.google.crypto.tink.subtle.X25519
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class IdentityManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val cryptoManager: CryptoManager,
) {
    private val prefs = context.getSharedPreferences("identity", Context.MODE_PRIVATE)

    // Secret key material (ratchet identity private key, Tor hidden-service private
    // keys, per-contact onion private keys, our message-decryption key) is encrypted
    // at rest with CryptoManager's Android Keystore-backed AEAD before being written
    // here. Plain SharedPreferences alone is only as safe as app-sandbox isolation
    // (readable via root or an adb backup) — not enough for keys SECURITY_CLAIMS.md
    // says are "never disclosed". iOS already keeps the equivalent values in the
    // hardware-backed Keychain (see KeychainStore.swift); this brings Android to the
    // same guarantee instead of the weaker default SharedPreferences.
    private fun encryptSecret(plaintext: ByteArray): String =
        android.util.Base64.encodeToString(cryptoManager.encrypt(plaintext), android.util.Base64.DEFAULT)

    private fun decryptSecret(stored: String): ByteArray {
        // Pre-encryption installs wrote most of these values as plain Base64 (the ratchet
        // key, msg_key) — those decode fine here, then fail AEAD decryption below and are
        // adopted as-is. But tor_priv_key and the per-contact onion keys were stored as
        // Tor's own key text verbatim (e.g. "ED25519-V3:<...>", from TorManager's ADD_ONION
        // result) — NOT Base64 at all (":" isn't in the alphabet), so Base64.decode on those
        // throws. That exception must be caught here too, or it propagates out of
        // getTorPrivKey()/getContactOnionPrivKey() uncaught, silently killing hidden-service
        // setup (TorManager wraps the caller in runCatching, so this never crashed — it just
        // meant the onion was never published, which read as "stuck connecting to Tor").
        return try {
            val raw = android.util.Base64.decode(stored, android.util.Base64.DEFAULT)
            try {
                cryptoManager.decrypt(raw)
            } catch (e: Exception) {
                raw
            }
        } catch (e: Exception) {
            stored.toByteArray(Charsets.UTF_8)
        }
    }

    // Was `by lazy` — switched to a manually-cached getter so regenerateUserId() below can
    // actually invalidate the cached value; `lazy` has no supported way to reset itself.
    private var _userId: String? = null
    val userId: String
        get() = _userId ?: (
            prefs.getString("user_id", null) ?: run {
                val id = UUID.randomUUID().toString()
                prefs.edit().putString("user_id", id).apply()
                id
            }
        ).also { _userId = it }

    /**
     * This device's *pairing-time* identity only — used in this device's QR code and, briefly,
     * as a contact's [pairSecret]/wire-tag fallback until a NEW_IDENTITY signal is exchanged
     * right after pairing (see Contact.kt, P2PNetworkManager.sendNewIdentitySignal). Existing
     * contacts are unaffected by this call: they already run on their own
     * `Contact.myWireIdentity`, decoupled from this value once pairing completes. Deliberately
     * does NOT touch the Tor onion address — TorManager's main onion stays put, same reasoning
     * SECURITY_CLAIMS.md §8 already documents for not re-fragmenting reachability.
     */
    fun regenerateUserId(): String {
        val id = UUID.randomUUID().toString()
        prefs.edit().putString("user_id", id).apply()
        _userId = id
        return id
    }

    val displayName: String
        get() = prefs.getString("display_name", "unpruuf User") ?: "unpruuf User"

    fun setDisplayName(name: String) {
        prefs.edit().putString("display_name", name).apply()
    }

    // Rotation factor rotiert stündlich (GRAL Säule 3)
    fun getCurrentRotationFactor(): String {
        val hourBucket = System.currentTimeMillis() / (60 * 60 * 1000L)
        val random = SecureRandom.getInstance("SHA1PRNG")
        random.setSeed(hourBucket.toString().toByteArray())
        val bytes = ByteArray(16)
        random.nextBytes(bytes)
        return android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
    }

    fun generateKeyPair(): KeyPair {
        val gen = KeyPairGenerator.getInstance("EC")
        gen.initialize(256, SecureRandom())
        return gen.generateKeyPair()
    }

    // ─── Full bidirectional forward secrecy: static per-device X25519 ratchet
    // identity key ────────────────────────────────────────────────────────────
    // Replaces the earlier one-time-ECIES scheme (sender-side only forward
    // secrecy — see CHANGELOG.md 2026-07-10 for why it was scoped that way).
    // This raw X25519 keypair is only ever used to bootstrap the very first
    // root key of a per-contact Double Ratchet session (see RatchetSessionManager)
    // — every message after that uses a session key that's already been
    // forgotten by the time the NEXT message arrives, in both directions. A
    // later compromise of either device no longer exposes past messages sent
    // to or from it, closing the gap SECURITY_CLAIMS.md §1 previously documented.
    data class X25519KeyPair(val privateKey: ByteArray, val publicKey: ByteArray)

    val myX25519RatchetKeyPair: X25519KeyPair by lazy {
        val storedPriv = prefs.getString("x25519_ratchet_priv_key", null)
        val storedPub = prefs.getString("x25519_ratchet_pub_key", null)
        if (storedPriv != null && storedPub != null) {
            val priv = decryptSecret(storedPriv)
            val pub = android.util.Base64.decode(storedPub, android.util.Base64.DEFAULT)
            prefs.edit().putString("x25519_ratchet_priv_key", encryptSecret(priv)).apply()
            X25519KeyPair(priv, pub)
        } else {
            val priv = X25519.generatePrivateKey()
            val pub = X25519.publicFromPrivate(priv)
            prefs.edit()
                .putString("x25519_ratchet_priv_key", encryptSecret(priv))
                .putString("x25519_ratchet_pub_key", android.util.Base64.encodeToString(pub, android.util.Base64.DEFAULT))
                .apply()
            X25519KeyPair(priv, pub)
        }
    }

    val myX25519RatchetPublicKeyBase64: String
        get() = android.util.Base64.encodeToString(myX25519RatchetKeyPair.publicKey, android.util.Base64.NO_WRAP)

    fun getTorPrivKey(): String? =
        prefs.getString("tor_priv_key", null)?.let { String(decryptSecret(it), Charsets.UTF_8) }

    fun saveTorPrivKey(key: String) {
        prefs.edit().putString("tor_priv_key", encryptSecret(key.toByteArray(Charsets.UTF_8))).apply()
    }

    // ─── Verified-onion rotation (see TorManager.ensureVerifiedOnion, Ed25519OnionDerivation) ──
    // Device-local only — never sent to a contact (that's the whole point: contacts learn the
    // resulting onion address via a normal signal on each rotation, not this factor). Lets the
    // daily rotation re-derive the same key on demand instead of persisting a growing history
    // of separately-generated random Tor private keys.

    val verifiedOnionFactor: ByteArray by lazy {
        val stored = prefs.getString("verified_onion_factor", null)
        if (stored != null) {
            decryptSecret(stored)
        } else {
            val factor = ByteArray(32)
            java.security.SecureRandom().nextBytes(factor)
            prefs.edit().putString("verified_onion_factor", encryptSecret(factor)).apply()
            factor
        }
    }

    /** UTC calendar day bucket — the rotation period for the verified onion. */
    fun currentDayBucket(): Long = System.currentTimeMillis() / 86_400_000L

    // The service ID (the ".onion" address minus the suffix) TorManager last registered as the
    // verified onion, so it knows what to DEL_ONION when the day rolls over. Not secret — an
    // onion address is meant to be given out — just persisted so a process restart mid-day
    // doesn't lose track of it and leak a stale service running forever.
    fun getLastVerifiedOnionServiceId(): String? = prefs.getString("last_verified_onion_id", null)

    fun saveLastVerifiedOnionServiceId(serviceId: String) {
        prefs.edit().putString("last_verified_onion_id", serviceId).apply()
    }

    // Which day bucket the currently-registered verified onion was derived for — lets
    // TorManager.ensureVerifiedOnion() skip re-deriving/re-registering on every periodic check
    // once today's onion is already live, instead of only being able to tell via a live Tor
    // round-trip.
    fun getLastVerifiedOnionDay(): Long = prefs.getLong("last_verified_onion_day", -1L)

    fun saveLastVerifiedOnionDay(day: Long) {
        prefs.edit().putLong("last_verified_onion_day", day).apply()
    }

    // Per-contact hidden service keys (my side): stored as "contact_onion_{contactId}"
    fun getAllContactOnionKeys(): Map<String, String> =
        prefs.all.entries
            .filter { it.key.startsWith("contact_onion_") }
            .mapNotNull { e ->
                (e.value as? String)?.let { e.key.removePrefix("contact_onion_") to String(decryptSecret(it), Charsets.UTF_8) }
            }
            .toMap()

    fun getContactOnionPrivKey(contactId: String): String? =
        prefs.getString("contact_onion_$contactId", null)?.let { String(decryptSecret(it), Charsets.UTF_8) }

    fun saveContactOnionPrivKey(contactId: String, key: String) {
        prefs.edit().putString("contact_onion_$contactId", encryptSecret(key.toByteArray(Charsets.UTF_8))).apply()
    }

    fun removeContactOnionPrivKey(contactId: String) {
        prefs.edit().remove("contact_onion_$contactId").apply()
    }

    // ─── Per-Kontakt Wire-ID mit stündlicher Rotation ───────────────────────
    // Statt für alle Kontakte dieselbe userId auf die Leitung zu schreiben,
    // weist sich jedes Gerät gegenüber jedem Kontakt mit einer eigenen,
    // stündlich wechselnden ID aus. Zwei Kontakte können dich so nicht mehr
    // korrelieren. Beide Seiten leiten dieselbe ID aus einem Paar-Geheimnis ab
    // (Hash beider Nachrichtenschlüssel, reihenfolgeunabhängig) + Stundenbucket.

    /**
     * Wall-clock hour bucket, optionally phase-shifted by [offsetSeconds] so a contact's wire-ID
     * doesn't roll over at the exact top of the hour like every other contact's does — see
     * [pairRotationOffsetSeconds].
     */
    fun currentHourBucket(offsetSeconds: Long = 0L): Long =
        (System.currentTimeMillis() / 1000L + offsetSeconds) / 3_600L

    /**
     * Deterministic per-contact rotation offset (0..3599 seconds), derived from [pairSecret] —
     * material already established the moment this pairing's handshake completed (both devices
     * derive the identical value from it, same as [pairSecret] itself, so no new exchange is
     * needed to agree on it). Without this, [currentHourBucket] rotates every onion-mode contact's
     * wire-ID at the exact same wall-clock instant (top of every hour) — [pairSecret] already
     * makes the rotated VALUES unlinkable per contact, but an observer watching several of this
     * device's network paths at once could still notice them all changing in lockstep, which is a
     * timing signal this offset removes. Cross-platform (relay) contacts are unaffected — they
     * already rotate on an explicit generation counter, not a wall-clock bucket (see the
     * cross-platform callers of [myWireId] and `P2PNetworkManager.wechsel()`).
     */
    fun pairRotationOffsetSeconds(contactMsgKeyB64: String): Long {
        val digest = MessageDigest.getInstance("SHA-256").digest(pairSecret(contactMsgKeyB64))
        val n = ((digest[0].toInt() and 0xFF).toLong() shl 24) or
            ((digest[1].toInt() and 0xFF).toLong() shl 16) or
            ((digest[2].toInt() and 0xFF).toLong() shl 8) or
            (digest[3].toInt() and 0xFF).toLong()
        return n % 3_600L
    }

    /**
     * The pair's actual shared secret: symmetric because both devices compute it from the same
     * two inputs (my key, their key), sorted into a fixed order before hashing — so device A
     * calling this with B's key and device B calling this with A's key produce the identical
     * 32 bytes. Used to derive the rotating wire-ID (below) and, since it's the only value in
     * this class that's genuinely equal on both sides, also the Double Ratchet's X3DH-lite salt
     * and per-message AAD (see [com.nexonai.unpruuf.domain.network.ratchet.RatchetSessionManager]).
     * [contactMsgKeyB64]/[myMessageKey] are each individually per-device and NOT shared — do not
     * use either of those alone where a symmetric secret is required.
     */
    fun pairSecret(contactMsgKeyB64: String): ByteArray {
        val other = android.util.Base64.decode(contactMsgKeyB64, android.util.Base64.DEFAULT)
        val mine = myMessageKey
        val (a, b) = if (compareUnsigned(mine, other) <= 0) mine to other else other to mine
        val md = MessageDigest.getInstance("SHA-256")
        md.update(a); md.update(b)
        return md.digest()
    }

    private fun hmac(key: ByteArray, msg: String): String =
        android.util.Base64.encodeToString(hmacBytes(key, msg), android.util.Base64.NO_WRAP)

    private fun hmacBytes(key: ByteArray, msg: String): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(msg.toByteArray())
    }

    private fun compareUnsigned(a: ByteArray, b: ByteArray): Int {
        val n = minOf(a.size, b.size)
        for (i in 0 until n) {
            val d = (a[i].toInt() and 0xFF) - (b[i].toInt() and 0xFF)
            if (d != 0) return d
        }
        return a.size - b.size
    }

    /** Wire-ID, mit der ICH mich gegenüber [contactMsgKeyB64] ausweise.
     *
     *  [identity] defaults to the global, every-contact-identical [userId] for backward
     *  compatibility, but every real call site should pass a contact's own
     *  `Contact.myWireIdentity` once it exists — a freshly generated, per-contact value (see
     *  Contact.kt's doc comments) that replaces [userId] as the "who" component of the HMAC
     *  once this device and the contact have exchanged NEW_IDENTITY signals after pairing.
     *  Without this, every contact you have ever presented the literal same [userId] to could
     *  compare notes and confirm they're both talking to you by that field alone — no
     *  cryptanalysis needed (fixed 2026-09-17, see SECURITY_CLAIMS.md).
     *
     *  [hour] defaults to this contact's own phase-shifted hour bucket (see
     *  [pairRotationOffsetSeconds]) — cross-platform callers pass an explicit generation counter
     *  instead and bypass this default entirely. */
    fun myWireId(
        contactMsgKeyB64: String,
        identity: String = userId,
        hour: Long = currentHourBucket(pairRotationOffsetSeconds(contactMsgKeyB64))
    ): String =
        hmac(pairSecret(contactMsgKeyB64), "$identity:$hour")

    /** Wire-ID, mit der sich der Kontakt ([contactIdentity] — their `myWireIdentity` once known,
     *  else their pairing-time `remoteUserId`) gegenüber mir ausweist. */
    fun expectedWireId(contactMsgKeyB64: String, contactIdentity: String, hour: Long): String =
        hmac(pairSecret(contactMsgKeyB64), "$contactIdentity:$hour")

    /** A fresh, random per-contact identity — generated locally at pairing time (see
     *  QrPairViewModel) and never reused across contacts, unlike [userId]. */
    fun newWireIdentity(): String = java.util.UUID.randomUUID().toString()

    // ─── Relay-owner rhythm: which side's relay list a contact uses right now ──────────────
    // Both devices in a pairing normally share up to 3 relay pool entries each (theirs and
    // mine — see ContactRelayList.kt), but polling BOTH lists for every contact multiplies the
    // number of fetchMany round-trips for no benefit once delivery already works over one of
    // them. Instead, exactly one side's list is "active" at a time, and both devices agree on
    // which one without a network round-trip, the same deterministic-derivation idiom used
    // throughout this class (see [pairRotationOffsetSeconds], [myWireId]).

    /** 6-hour rotation period for the automatic relay-owner rhythm — independent of
     *  [currentDayBucket]'s 24h verified-onion rotation. Shorter than a day so a one-sided or
     *  temporarily-unreachable relay doesn't stay the sole active path for a whole day; long
     *  enough that ownership isn't flapping mid-conversation. */
    fun currentRelayOwnerPeriodBucket(): Long = System.currentTimeMillis() / (6 * 60 * 60 * 1000L)

    /**
     * Deterministic, signal-free choice of whose relay list is active for a contact during
     * [periodBucket] — both devices compute the identical answer from already-shared material
     * (see [pairSecret]), so no exchange is needed to agree on it. A manual override (see
     * Contact.manualRelayOwner / P2PNetworkManager.switchRelayOwner) always takes priority over
     * this when one is set; this is only the automatic fallback rhythm.
     *
     * Lexical order of [myIdentity] vs [theirIdentity] alone would pick the SAME side forever
     * (whichever identity happens to sort first never changes) — that's a fixed assignment, not
     * a rhythm — so a per-period HMAC-derived coin flip is XORed on top to actually rotate
     * ownership across periods.
     *
     * Returns true when the caller's own relay list should be the active one this period.
     */
    fun relayOwnerIsMine(
        contactMsgKeyB64: String,
        myIdentity: String,
        theirIdentity: String,
        periodBucket: Long = currentRelayOwnerPeriodBucket()
    ): Boolean {
        val iAmLexicallyFirst = myIdentity < theirIdentity
        val coinFlip = (hmacBytes(pairSecret(contactMsgKeyB64), "relay-owner:$periodBucket")[0].toInt() and 1) == 1
        return iAmLexicallyFirst xor coinFlip
    }

    // ─── Safety number: out-of-band pairing verification ───────────────────
    // For testers pairing remotely (see QrPairScreen's debug copy/paste flow) or anyone who
    // wants extra assurance beyond an in-person QR scan: a short code both devices compute
    // identically, meant to be compared over a DIFFERENT channel than whatever carried the
    // pairing code itself (a call, a voice message) — not a live network check, so it works
    // even if the two devices are never online at the same moment.

    /**
     * Derived from both devices' static X25519 identity (ratchet) keys — the actual long-term
     * identity anchor a contact is bootstrapped from, not the symmetric message key [pairSecret]
     * uses. Same "sort two keys into a fixed order, then hash" shape as [pairSecret] so both
     * sides get the identical code regardless of who's "mine" vs "theirs". If a pasted/scanned
     * pairing code was tampered with in transit, the ratchet key baked into it changes and so
     * does this code — that's the whole point: a mismatch here means don't trust this contact.
     */
    fun safetyNumber(theirX25519RatchetPublicKeyBase64: String): String {
        val mine = myX25519RatchetKeyPair.publicKey
        val theirs = android.util.Base64.decode(theirX25519RatchetPublicKeyBase64, android.util.Base64.DEFAULT)
        val (a, b) = if (compareUnsigned(mine, theirs) <= 0) mine to theirs else theirs to mine
        val md = MessageDigest.getInstance("SHA-256")
        md.update(a); md.update(b)
        val digest = md.digest()
        // First 4 bytes -> unsigned Int -> mod 1,000,000 -> zero-padded 6-digit code, grouped
        // for readability — Signal's own safety-number digit-grouping idea, scaled down from
        // 60 digits to 6 (this is a quick tester-facing check, not a cryptographic commitment
        // on its own; the SHA-256 digest it's truncated from is).
        val n = ((digest[0].toInt() and 0xFF).toLong() shl 24) or
            ((digest[1].toInt() and 0xFF).toLong() shl 16) or
            ((digest[2].toInt() and 0xFF).toLong() shl 8) or
            (digest[3].toInt() and 0xFF).toLong()
        val code = (n % 1_000_000L).toString().padStart(6, '0')
        return "${code.substring(0, 3)} ${code.substring(3, 6)}"
    }

    // 32-byte symmetric receive key — shared via QR code so contacts can encrypt to us
    val myMessageKey: ByteArray by lazy {
        val stored = prefs.getString("msg_key", null)
        if (stored != null) {
            val key = decryptSecret(stored)
            prefs.edit().putString("msg_key", encryptSecret(key)).apply()
            key
        } else {
            val key = ByteArray(32)
            java.security.SecureRandom().nextBytes(key)
            prefs.edit().putString("msg_key", encryptSecret(key)).apply()
            key
        }
    }

    // ─── unpruuf Business / Node-Mesh routing (see NODE_MESH_SPEC.md §2) ────────────────────
    // Deliberately a SEPARATE secret from everything above — NODE_MESH_SPEC.md §2 calls for two
    // eigenständige Secrets ab Pairing, not one root secret with domain-separated HKDF `info`
    // strings the way [pairSecret] and the ratchet's X3DH-lite salt already share one (see
    // RatchetSessionManager's own doc comment on that). This value is never fed into
    // [pairSecret], the ratchet salt, or anything else derived from [myMessageKey] — routing and
    // encryption stay on genuinely independent derivation paths for Node-Mesh contacts.

    /** Global per-device routing seed, shared via the Node-Mesh QR at pairing time — same
     *  single-global-secret-combined-per-contact shape as [myMessageKey] (see [nodeMeshPairSecret]
     *  for why reusing one value across contacts here is safe: it's always combined with a
     *  contact-specific counterpart before use, so no two contacts ever see the same combined
     *  secret even though they see the same seed from me). */
    val myNodeMeshRoutingSeed: ByteArray by lazy {
        val stored = prefs.getString("node_mesh_routing_seed", null)
        if (stored != null) {
            val seed = decryptSecret(stored)
            prefs.edit().putString("node_mesh_routing_seed", encryptSecret(seed)).apply()
            seed
        } else {
            val seed = ByteArray(32)
            java.security.SecureRandom().nextBytes(seed)
            prefs.edit().putString("node_mesh_routing_seed", encryptSecret(seed)).apply()
            seed
        }
    }

    val myNodeMeshRoutingSeedBase64: String
        get() = android.util.Base64.encodeToString(myNodeMeshRoutingSeed, android.util.Base64.NO_WRAP)

    /**
     * The Node-Mesh pair's shared routing secret — symmetric, same "sort two values into a fixed
     * order, then hash" shape as [pairSecret], just fed [myNodeMeshRoutingSeed] instead of
     * [myMessageKey]. Both devices compute the identical 32 bytes regardless of who's "mine" vs
     * "theirs", which is exactly what lets a poller independently predict the exact tag a
     * contact will have deposited under, without any live exchange beyond the one-time seed swap
     * at pairing.
     */
    fun nodeMeshPairSecret(theirRoutingSeedB64: String): ByteArray {
        val other = android.util.Base64.decode(theirRoutingSeedB64, android.util.Base64.DEFAULT)
        val mine = myNodeMeshRoutingSeed
        val (a, b) = if (compareUnsigned(mine, other) <= 0) mine to other else other to mine
        val md = MessageDigest.getInstance("SHA-256")
        md.update(a); md.update(b)
        return md.digest()
    }

    /** `floor(unix_time / rotation_interval)` — NODE_MESH_SPEC.md §2's epoch counter, deliberately
     *  a coarse bucket rather than raw time for the same clock-drift-robustness reason the
     *  existing hourly wire-ID scheme uses one. */
    fun nodeMeshEpoch(rotationIntervalMs: Long): Long = System.currentTimeMillis() / rotationIntervalMs

    /**
     * `routing_tag = HKDF(shared_pairing_secret, "routing" || epoch_counter)` — NODE_MESH_SPEC.md
     * §2, implemented as HMAC-SHA256 (this class's existing PRF choice for every other rotating
     * tag) rather than a full HKDF construction, since a single-round HMAC over a fixed-length,
     * already-high-entropy 32-byte key is exactly what HKDF-Expand reduces to here — no separate
     * Extract step buys anything when the input key material is already uniform random. No
     * identity component multiplied in (unlike [myWireId]) — Node-Mesh's tag only ever needs to
     * be independently computable by both sides of ONE pair, not disambiguate between several
     * candidate identities the way the onion-based scheme's wire-ID does.
     */
    fun nodeMeshRoutingTag(theirRoutingSeedB64: String, epoch: Long): String =
        hmac(nodeMeshPairSecret(theirRoutingSeedB64), "routing:$epoch")

    /**
     * NODE_MESH_SPEC.md §3's tolerance-window formula — `ceil(TTL / rotation_interval) + 1`,
     * replacing v1's fixed "check 2 tags" guess so the window is correct for ANY TTL/rotation
     * combination a deployment chooses, not just ones where TTL happens to be short. Returns the
     * current epoch plus that many epochs backward, in `expectedNodeMeshTag`-ready order (newest
     * first) — the `+1` at the end covers device clock drift between peers, same reasoning as
     * [nodeMeshEpoch]'s own doc comment.
     */
    fun nodeMeshToleranceEpochs(ttlMs: Long, rotationIntervalMs: Long): List<Long> {
        val current = nodeMeshEpoch(rotationIntervalMs)
        val windowSize = ceilDiv(ttlMs, rotationIntervalMs) + 1
        return (0..windowSize).map { current - it }
    }

    private fun ceilDiv(a: Long, b: Long): Long = (a + b - 1) / b
}
