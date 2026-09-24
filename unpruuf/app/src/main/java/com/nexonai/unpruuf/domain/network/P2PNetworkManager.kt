package com.nexonai.unpruuf.domain.network

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.nexonai.unpruuf.MainActivity
import com.nexonai.unpruuf.R
import com.nexonai.unpruuf.UnpruufApplication
import com.nexonai.unpruuf.domain.AppEdition
import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.data.repository.InMemoryMessageStore
import com.nexonai.unpruuf.data.repository.MessageType
import com.nexonai.unpruuf.data.repository.RamMessage
import com.nexonai.unpruuf.domain.network.ratchet.RatchetHeader
import com.nexonai.unpruuf.domain.network.ratchet.RatchetSessionManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import java.io.*
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.ServerSocket
import java.net.Socket
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class P2PNetworkManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val messageStore: InMemoryMessageStore,
    private val cryptoManager: CryptoManager,
    private val identityManager: IdentityManager,
    private val torManager: TorManager,
    private val contactDao: ContactDao,
    private val ratchetSessionManager: RatchetSessionManager,
    private val relayManager: RelayManager,
    private val relayClient: RelayClient,
    private val nodeMeshManager: NodeMeshManager,
    private val nodeMeshClient: NodeMeshClient
) {
    companion object {
        private const val SERVICE_TYPE = "_unpruuf._tcp."

        // Virtueller Onion-Port: identisch für ALLE Editionen — darauf verbinden
        // sich Sender (onionAddress:ONION_PORT). Darf sich nie unterscheiden.
        const val ONION_PORT = 54321

        // Lokaler Listen-Port: pro Edition verschieden, damit Standard/Pro/Client
        // GLEICHZEITIG auf demselben Gerät laufen können, ohne sich um Port 54321
        // zu streiten. Der Onion-Dienst mappt ONION_PORT → 127.0.0.1:LOCAL_PORT.
        val LOCAL_PORT: Int = 54321 + when (AppEdition.current) {
            AppEdition.PRO -> 1
            AppEdition.CLIENT -> 2
            else -> 0
        }
        val REVOKE_SIGNAL: ByteArray = "UNPRUUF_REVOKE_V1".toByteArray(Charsets.UTF_8)
        // Löscht den Kontakt beidseitig (bidirektional).
        val DELETE_CONTACT_SIGNAL: ByteArray = "UNPRUUF_DELETE_CONTACT_V1".toByteArray(Charsets.UTF_8)
        // Tarnverkehr: wird verworfen, nicht gespeichert, nicht angezeigt.
        val DUMMY_SIGNAL: ByteArray = "UNPRUUF_DUMMY_V1".toByteArray(Charsets.UTF_8)
        // Prefix (not exact-match, unlike the signals above) — carries a variable onion address
        // payload after it. Lets an existing pairing move from its legacy per-contact onion to
        // the device's main onion (or announce a freshly re-created main onion) without requiring
        // delete+re-pair. See sendMainOnionUpdate()/ingestPacket()'s handling below and
        // SECURITY_CLAIMS.md §8.
        private const val MAIN_ONION_UPDATE_SIGNAL_PREFIX = "UNPRUUF_MAIN_ONION_V1:"
        // Prefix carrying this device's freshly-generated Contact.myWireIdentity for the
        // receiving contact — sent once, right after a new contact is created (see
        // QrPairViewModel), always tagged under the pairing-time fallback identity (never under
        // the new identity itself, or the receiver couldn't recognize this very packet — see
        // candidateIdentities()'s doc comment). See Contact.kt for why this exists.
        private const val NEW_IDENTITY_SIGNAL_PREFIX = "UNPRUUF_NEWID_V1:"
        // Same shape as MAIN_ONION_UPDATE_SIGNAL_PREFIX, different address: the "verified"
        // onion (see TorManager.ensureVerifiedOnion/Ed25519OnionDerivation) is only ever sent to
        // safety-number-verified contacts, and rotates daily. A separate prefix costs nothing
        // and keeps intent traceable — receive-side handling writes to contact.onionAddress
        // exactly the same way either prefix does (see ingestPacketInner).
        private const val VERIFIED_ONION_UPDATE_SIGNAL_PREFIX = "UNPRUUF_VERIFIED_ONION_V1:"
        // Prefix carrying a manual relay-owner switch (see switchRelayOwner()) — payload is
        // "mine" or "theirs", already resolved to the RECEIVER's own perspective by the sender
        // (the opposite of the sender's local choice, since "my list" here is "the contact's
        // list" there), so the receive side just stores it as-is. Overrides the automatic
        // rhythm (IdentityManager.relayOwnerIsMine()) for this contact until switched again.
        private const val RELAY_OWNER_SWITCH_SIGNAL_PREFIX = "UNPRUUF_RELAYOWNER_V1:"
        // unpruuf Business / Node-Mesh only (NODE_MESH_SPEC.md §6) — payload is
        // "<old unpruuf-node:v1:addr>;<new unpruuf-node:v1:addr>", reusing NodeMeshManager's
        // existing ';'-joined connection-string-list format rather than inventing a new
        // delimiter — an address itself may contain a colon (host:port), so a raw "old:new"
        // split would be ambiguous, but this format already handles that correctly.
        private const val NODE_MIGRATE_SIGNAL_PREFIX = "UNPRUUF_NODEMIGRATE_V1:"
        // Temp Node (NODE_MESH_SPEC.md §7). Payload is a bare "unpruuf-node:v1:<address>" —
        // reuses NodeMeshManager's contact-facing (no-secret) format, same as
        // theirNodeAddresses/NODE_MIGRATE_SIGNAL_PREFIX above; the owner secret for MY OWN Temp
        // Node never goes over the wire to a contact (see NodeMeshManager's doc comment).
        private const val TEMP_NODE_SIGNAL_PREFIX = "UNPRUUF_TEMPNODE_V1:"
        // No payload — explicit shutdown (§7 step 8), distinct from a heartbeat-timeout
        // auto-fallback (§7 step 7), which is purely local state on the SENDING side and isn't
        // announced at all (the receiving side keeps polling a now-dead address harmlessly until
        // this signal, or a new TEMP_NODE_SIGNAL_PREFIX, eventually arrives).
        private const val TEMP_NODE_OFF_SIGNAL_PREFIX = "UNPRUUF_TEMPNODE_OFF_V1"
        // §7 step 7's heartbeat: how often each registered Temp Node is pinged, and how many
        // CONSECUTIVE failures before this device gives up and falls back that contact's
        // outgoing traffic to the standard pool. 3 strikes at a 2-minute interval is ~6 minutes
        // of sustained unreachability before falling back — long enough to ride out one flaky
        // probe (same "don't bounce on one bad check" lesson LEGACY_ONION_FAILURE_THRESHOLD
        // above already encodes for a different subsystem), short enough that a genuinely
        // closed Temp Node tool doesn't leave messages stuck for long before the fallback kicks
        // in and standard nodes take back over.
        private const val TEMP_NODE_HEARTBEAT_INTERVAL_MS = 2 * 60_000L
        private const val TEMP_NODE_HEARTBEAT_FAILURE_THRESHOLD = 3
        // v3 onion service IDs are exactly 56 base32 characters before the ".onion" suffix.
        private val ONION_V3_REGEX = Regex("^[a-z2-7]{56}\\.onion$")
        // Cross-platform (iOS-interop) only — see CROSS_PLATFORM_PLAN.md. Payload after the
        // prefix is "<generation>:<newRelayConnectionString>" — split at the FIRST colon, not
        // the last: the generation number never contains a colon, but the relay connection
        // string after it does (unpruuf-relay:v1:address:token has three of its own), so this is
        // the opposite split direction from RelayManager.parseConnectionString (which correctly
        // splits at the LAST colon, because there the token is always the final segment and the
        // address before it is what may contain one). Matches iOS's ControlSignals.decodeWechsel
        // (rest.firstIndex(of: ":")). Sent under the sender's CURRENT (about-to-be-stale)
        // generation — see wechsel().
        private const val WECHSEL_SIGNAL_PREFIX = "UNPRUUF_WECHSEL_V1:"
        // ±1 generation tolerance for cross-platform contacts (resolveSender/startRelayPoll) —
        // mirrors the ±2h hour-bucket tolerance normal contacts get, but generation rotation
        // isn't clock-driven, so the window is symmetric around the single last-known value
        // instead of centered on "now".
        private const val WECHSEL_GENERATION_TOLERANCE = 1L
        // Empfänger bestätigt jede verarbeitete Nachricht mit diesem Byte.
        // Nur nach Erhalt des ACK gilt eine Nachricht als zugestellt.
        private const val ACK = 0x06
        // Tarnverkehr-Intervall (randomisiert, in ms)
        private const val DUMMY_MIN_MS = 45_000L
        private const val DUMMY_MAX_MS = 240_000L
        // Nach Verlassen eines Chats den Sendepfad noch für diese Dauer warm
        // halten — Verlassen (Wechsel zur Kontaktliste, kurzes Backgrounden)
        // heißt meistens nicht "Gespräch beendet". Ohne Gnadenfrist geht die
        // Wärme sofort verloren und die nächste Nachricht zahlt einen vollen
        // Kaltstart (siehe startActiveChatWarmup).
        private const val ACTIVE_CHAT_GRACE_MS = 2 * 60_000L
        // Feste ID → alle eingehenden Nachrichten erscheinen als EINE anonyme
        // Benachrichtigung (verrät weder Absender noch Anzahl).
        private const val GENERIC_MESSAGE_NOTIF_ID = 2001

        // How long an accepted connection may sit idle before the receive loop closes it.
        // Must stay comfortably above startActiveChatWarmup's 20s cadence — the warm-up
        // dummies ride the same pooled connection and are what keep it open between real
        // messages of the active chat.
        private const val IDLE_RECEIVE_TIMEOUT_MS = 65_000

        // Caps concurrent accepted server sockets. Anyone who has learned our onion
        // address (not just paired contacts — nothing authenticates before the first
        // packet) can otherwise open unlimited connections and hold them open up to
        // IDLE_RECEIVE_TIMEOUT_MS, exhausting the process's fd budget and starving our
        // own outgoing Tor sockets, which draw from the same pool.
        private const val MAX_CONCURRENT_CONNECTIONS = 64

        // Reachability probes MUST use the same timeout as real sends. This briefly shipped
        // as 25s on the reasoning "a healthy own hidden service answers well within that" —
        // wrong on exactly the network that matters: sendViaTor's own comment documents that
        // an onion rendezvous from a mobile-data client often needs MORE than 25s even when
        // everything is healthy. A too-short probe timeout makes a mobile device declare
        // ITSELF unreachable when it's merely slow, and the retry loop then "fixes" that
        // with forceBounce — tearing down all of that device's circuits over and over for no
        // reason. Probing all onions in parallel (see isSelfReachableViaTor) is what fixed
        // the check's duration; the per-probe timeout is not the place to save time.
        private const val SELF_CHECK_TIMEOUT_MS = 40_000

        // How many chunk packets of a file/photo transfer are written per ACK round on the
        // pooled Tor connection (see sendWindowViaTorPooled). 8 × 4 KB ≈ 33 KB in flight —
        // far below TCP buffer sizes (no deadlock risk), big enough to collapse eight
        // high-latency round-trips into one.
        private const val CHUNK_WINDOW = 8

        // RelayManager.RelayMode.AUTO's size trigger: a chunk train whose total padded size
        // exceeds this goes straight to the relay (if usable), skipping LAN/Tor-direct — a
        // slow/fragile direct Tor transfer is a worse bet for a bulky file than the relay
        // mailbox. Single-packet items (attemptDelivery — text/control signals) are always
        // one fixed-size packet, nowhere near this threshold, so it only applies to
        // attemptChunkTrainDelivery.
        private const val RELAY_SIZE_THRESHOLD_BYTES = 2 * 1024 * 1024

        // Adaptive replacement for the old single fixed RELAY_POLL_INTERVAL_MS (was 6s always,
        // continuously, whether or not anyone was even looking at a chat — reported for real as
        // "akku schrotten" on always-on MANDATORY-mode devices). Two independent knobs now, picked
        // per round by isChatActiveOrRecent(): how long to sleep BETWEEN poll rounds, and how long
        // each round's POST /v1/fetchMany may long-poll (waitMs) before answering if nothing was
        // queued yet. A long-poll response returns the instant a blob actually arrives regardless
        // of waitMs — it only ever adds latency up to that cap when NOTHING arrives — so the idle
        // case leans on a long wait (fewer reconnects while nothing is happening anyway) and the
        // active case leans on a short interval (frequent rounds re-evaluate activeContactId/
        // manual relay-owner changes promptly) plus a moderately long wait on top, since it costs
        // nothing when a chat is open and messages are actually flowing.
        private const val RELAY_POLL_INTERVAL_ACTIVE_MS = 6_000L
        private const val RELAY_POLL_INTERVAL_IDLE_MS = 90_000L
        private const val RELAY_POLL_WAIT_MS_ACTIVE = 20_000L
        private const val RELAY_POLL_WAIT_MS_IDLE = 5_000L

        // Mirrors server/src/config.ts's MAX_FETCH_MANY_TAGS / relay-android's
        // RelayConstants.MAX_FETCH_MANY_TAGS — this device must never send more tags in one
        // POST /v1/fetchMany than either relay implementation accepts. Chunked into multiple
        // calls to the same target on the rare contact-count/bucket-count combination that
        // exceeds it, rather than silently dropping tags past the cap.
        private const val MAX_FETCH_MANY_TAGS_PER_CALL = 64

        // unpruuf Business / Node-Mesh (NODE_MESH_SPEC.md §3) — matches that document's
        // confirmed defaults exactly, chosen there to stay consistent with the numbers this app
        // and the consumer relay already use (hourly wire-ID rotation, 6h relay TTL default).
        // Deliberately NOT coupled (rotation_interval independent of TTL) — see §3's reasoning:
        // the tolerance window is computed FROM both via IdentityManager.nodeMeshToleranceEpochs,
        // so any future change to either value here stays correct automatically.
        private const val NODE_MESH_ROTATION_INTERVAL_MS = 60 * 60 * 1000L
        private const val NODE_MESH_DEFAULT_TTL_MS = 6 * 60 * 60 * 1000L

        // Connect timeout for FRESH Tor connections to a CONTACT's onion (the pooled send
        // paths). 40s was enough for every path except the hardest one: mobile-data client
        // → mobile-data hidden service, both ends behind carrier NAT, right after the
        // receiver's descriptor republished. Reported for real: with both devices on
        // mobile, one direction timed out on every single attempt ("can receive, can't
        // send") while the same receiver was instantly reachable from Wi‑Fi — i.e. the
        // hidden service was fine, only the double-carrier rendezvous needed longer than
        // 40s. Since connections are pooled now, this price is paid once per connection,
        // not per message — a longer patient first connect beats an endless series of
        // 40s failures. Probes (keep-alive/self-check) keep their own shorter timeouts.
        private const val TOR_CONNECT_TIMEOUT_MS = 90_000

        // Legacy per-contact onions are deliberately excluded from the reachability VERDICT
        // (isSelfReachableViaTor gates only on the main onion — see that function's doc comment
        // for why). That fixed the false-negative bounce-loop bug, but opened a new gap: if a
        // legacy onion goes unreachable while the main onion stays fine, NOTHING re-checks or
        // recovers it — reported for real as "sending to an old contact stuck 5+ minutes on
        // mobile, status pill said TOR ACTIVE the whole time" even though the general
        // mobile↔mobile timeout fix (TOR_CONNECT_TIMEOUT_MS above) was already in place, because
        // the receiving side's relevant onion for THIS pairing was a legacy one, not the main
        // one it was sending its own reachability signal from. Threshold and interval below
        // drive an independent, decoupled recovery path for exactly this case (see
        // recordLegacyOnionProbe) — deliberately conservative (3 consecutive failures, at most
        // one bounce per 2 minutes) so it can't reintroduce the "one flaky check → disruptive
        // bounce" regression this file has already been burned by twice.
        private const val LEGACY_ONION_FAILURE_THRESHOLD = 3
        private const val LEGACY_RECOVERY_MIN_INTERVAL_MS = 120_000L

        // Progressive delivery-queue backoff: start fast, double on every
        // stalled round, cap so a long outage doesn't push wait times too far.
        const val BACKOFF_INITIAL_MS = 3_000L
        const val BACKOFF_MAX_MS = 15_000L

        // Pure so it's unit-testable without Android/Tor/coroutines — see
        // P2PNetworkManagerBackoffTest. Kept in sync with flushQueue()'s usage.
        fun nextBackoff(current: Long): Long = (current * 2).coerceAtMost(BACKOFF_MAX_MS)

        // Pure so it's unit-testable without Android/Tor/coroutines — see WechselDecodeTest.
        // [rest] is the Wechsel signal payload with WECHSEL_SIGNAL_PREFIX already stripped:
        // "<generation>:<newRelayConnectionString>". Split at the FIRST colon, not the last —
        // see the doc comment on WECHSEL_SIGNAL_PREFIX for why (regression: this used to split
        // at the last colon, which always failed to parse a real relay connection string).
        // Returns null for anything malformed, mirroring iOS's ControlSignals.decodeWechsel.
        fun parseWechselSignal(rest: String): Pair<Long, String>? {
            val sep = rest.indexOf(':')
            if (sep <= 0 || sep >= rest.length - 1) return null
            val newGeneration = rest.substring(0, sep).toLongOrNull() ?: return null
            val newRelay = rest.substring(sep + 1)
            if (RelayManager.parseConnectionString(newRelay) == null) return null
            return newGeneration to newRelay
        }
    }

    private data class PendingDelivery(
        val messageId: String?,
        val contactId: String,
        val padded: ByteArray,
        // Nachrichtenschlüssel (Base64) des Kontakts — zum Ableiten der
        // rotierenden Wire-ID zum Sendezeitpunkt.
        val wireKeyB64: String,
        // This contact's own myWireIdentity, snapshotted at enqueue time for the same reason
        // wireKeyB64 is (a live contactDao lookup at send time can't be trusted — see
        // crossPlatformWireId below). Null means "not set yet" — callers fall back to
        // IdentityManager.userId, matching pre-per-contact-identity behavior.
        val myIdentity: String? = null,
        // Falls gesetzt, wird diese .onion-Adresse direkt genutzt statt einer
        // DB-Abfrage — nötig, wenn der Kontakt lokal schon gelöscht wurde.
        val onionOverride: String? = null,
        // One frame of a multi-frame (file/photo) transfer. Chunk items are delivered
        // AFTER all single-packet items of the same contact (texts must never sit behind a
        // minutes-long transfer — reported for real as "everything hung for ~5 minutes
        // after an image"), and in ACK-pipelined windows instead of one round-trip each.
        // Safe to reorder around: a text is its own ratchet message, and the Double
        // Ratchet's skipped-key cache handles it arriving before an earlier-encrypted
        // (still-uploading) transfer completes, exactly like out-of-order network arrival.
        val isChunk: Boolean = false,
        // Cross-platform (iOS-interop) contacts only: the wire ID and relay candidates this item
        // must be sent with, computed once at enqueue time — see attemptDelivery's doc comment
        // for why a live contactDao lookup can't be trusted here for these. Null for every
        // non-cross-platform item, which keeps using onionOverride/wireKeyB64 as before.
        val crossPlatformWireId: String? = null,
        // The relays THIS contact advertised to us, snapshotted at enqueue time — for every
        // contact since v5, not just cross-platform ones (before that, standard contacts pushed
        // to this device's OWN global relay, which only ever worked when both sides happened to
        // have configured the same one). Snapshotted rather than looked up live for the reason
        // spelled out in attemptDelivery's doc comment: sendDeleteContact removes the contact row
        // in the same coroutine that enqueues the delete signal, so a live lookup is already gone
        // by delivery time. Null/empty falls back to the global relay, which is what a contact
        // paired before v5 still relies on.
        val relayCandidates: List<String>? = null,
        // unpruuf Business / Node-Mesh contacts only (NODE_MESH_SPEC.md) — this item's routing
        // tag and the contact's own advertised node addresses to fetch-poll never apply to a
        // deposit itself (Node-Mesh writes to THIS DEVICE'S OWN nodes, always read live from
        // NodeMeshManager, which never depends on the contact row) — but the routing TAG does
        // depend on Contact.theirNodeMeshRoutingSeed, so it's snapshotted here for the same
        // reason crossPlatformWireId is: sendDeleteContact removes the contact row in the same
        // coroutine that enqueues the delete signal, so a live lookup would already be gone by
        // delivery time. Null for every non-Node-Mesh item.
        val nodeMeshRoutingTag: String? = null
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    // LAN peers: userId-prefix (8 chars) → (host, port)
    private val lanPeers = ConcurrentHashMap<String, Pair<String, Int>>()
    private val acceptSemaphore = Semaphore(MAX_CONCURRENT_CONNECTIONS)

    // Zustell-Warteschlange: Nachrichten bleiben hier bis der Empfänger sie
    // per ACK bestätigt hat. Wird bei Tor-Reconnect und periodisch geleert.
    private val deliveryQueue = ConcurrentLinkedQueue<PendingDelivery>()
    private val flushing = AtomicBoolean(false)
    // Weckt den schlafenden Zustell-Worker sofort, wenn eine neue Nachricht
    // eingereiht wird → keine Wartezeit hinter einer laufenden Backoff-Pause.
    private val wakeSignal = Channel<Unit>(Channel.CONFLATED)

    private val _deliveredIds = MutableStateFlow<Set<String>>(emptySet())
    val deliveredIds: StateFlow<Set<String>> = _deliveredIds.asStateFlow()

    // Serializes sendMessage's per-contact encrypt+enqueue sequence so one message's chunks
    // are always enqueued as a contiguous block — the receive-side reassembly below relies on
    // chunks from different messages to the same contact never interleaving.
    private val sendLocks = ConcurrentHashMap<String, Mutex>()

    // In-progress chunked-transfer reassembly, one slot per sender. The send-side lock above and
    // the delivery queue's strict per-contact ordering (see flushQueue/attemptDelivery) guarantee
    // one message's chunks are never interleaved with another's — but chunks can now also fall
    // back to the relay per-frame (a polled mailbox, not a live socket), so *within* one message,
    // pieces are buffered by their explicit RatchetFrame.Frame.ChunkCont.index rather than trusted
    // to arrive in order.
    private class ChunkReassembly(val header: RatchetHeader, val totalChunks: Int) {
        // Slot 0 is the ChunkStart's own piece; slots 1..totalChunks-1 fill in as ChunkCont
        // frames arrive, in whatever order they actually show up.
        val pieces = arrayOfNulls<ByteArray>(totalChunks)
        var received = 0
        fun isComplete() = received == totalChunks
    }
    private val chunkReassembly = ConcurrentHashMap<String, ChunkReassembly>()

    private var nsdManager: NsdManager? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private var serverSocket: ServerSocket? = null
    private var regListener: NsdManager.RegistrationListener? = null
    private var discListener: NsdManager.DiscoveryListener? = null
    private var started = false

    fun start() {
        if (started) return
        started = true
        acquireMulticastLock()
        startServer()
        registerService()
        discoverPeers()

        // Sobald Tor (wieder) bereit ist: Warteschlange sofort abarbeiten
        scope.launch {
            torManager.isReady.filter { it }.collect { flushQueue() }
        }

        // After a network change the bounce leaves circuits cold. Re-warm the
        // open chat's send path and re-flush the queue immediately (don't wait
        // for the 20s/60s loops), so sending recovers fast after mobile↔Wi‑Fi.
        scope.launch {
            torManager.networkChanged.collect {
                // Pooled connections ran through circuits the bounce just tore down — drop
                // them all so the next send starts fresh instead of burning its first
                // attempt on a provably dead socket.
                closeAllPooledConnections()
                activeContactId.value?.let { id -> runCatching { warmUpContact(id) } }
                flushQueue()
                verifyReachabilityAfterNetworkChange()
            }
        }

        startDummyTraffic()
        startOnionKeepAlive()
        startActiveChatWarmup()
        startRelayPoll()
        startNodeMeshPoll()
        startTempNodeHeartbeat()
        startPeriodicReachabilityCheck()
    }

    // Polls the relay mailbox for every contact, so messages that were relayed while we were
    // offline get picked up once we're back. Two independent targets per poll round: (1) the
    // ONE global relay (if configured) for normal contacts, hour-tagged, ±2h tolerance — same
    // as before; (2) for cross-platform (iOS-interop) contacts, EACH contact's OWN relay
    // (contact.myRelayConnectionString — see CROSS_PLATFORM_PLAN.md), generation-tagged, ±1
    // tolerance. These contacts are relay-mandatory and don't depend on the global relay being
    // enabled at all — a cross-platform contact must keep working even with the global relay
    // fallback switched off in Settings.
    private fun startRelayPoll() {
        scope.launch {
            while (isActive) {
                val active = isChatActiveOrRecent()
                delay(if (active) RELAY_POLL_INTERVAL_ACTIVE_MS else RELAY_POLL_INTERVAL_IDLE_MS)
                pollRelayOnce()
            }
        }
    }

    /** True while a chat is open, or was closed recently enough to still be inside
     *  [ACTIVE_CHAT_GRACE_MS] — the same window [isWarmPath] uses for the send-side Tor warmup.
     *  Drives [startRelayPoll]'s interval/wait choice: tight polling while someone might actually
     *  be looking at a conversation, relaxed otherwise. */
    private fun isChatActiveOrRecent(): Boolean =
        activeContactId.value != null || System.currentTimeMillis() < recentContactWarmUntil

    /** Runs one relay poll round right now, outside the periodic loop's own cadence — called
     *  when a chat is opened (see setActiveChat) so the wait is the Tor fetch RTT alone, not
     *  RTT plus up to a full idle-interval of leftover cycle time. Idempotent (delete-on-
     *  fetch means an extra, redundant call just finds nothing new) — safe to call freely. */
    fun pollRelayNow() {
        scope.launch { pollRelayOnce() }
    }

    /**
     * One poll round, batched per distinct relay TARGET (address+token) instead of per contact
     * per tag — every contact's expected tags for a given target are collected first, then
     * fetched with as few `POST /v1/fetchMany` calls as [MAX_FETCH_MANY_TAGS_PER_CALL] allows,
     * one round-trip (per target) instead of one per contact×identity×bucket combination. This
     * is the actual battery lever: most pairings share the same handful of relay servers (this
     * device's own configured pool, snapshotted per contact at pairing time — see
     * [contactMyRelayList]), so collapsing by target rather than by contact turns what used to be
     * up to `contacts × pool-entries × buckets × identities` separate requests into, typically,
     * one request per pool entry, total.
     *
     * Within that, which of a contact's own (up to 3) pool entries get checked at all this round
     * is gated by [IdentityManager.relayOwnerIsMine] (or [Contact.manualRelayOwner] if set): the
     * primary entry is always checked (that's where a sender's push overwhelmingly lands — see
     * [relayTargetsFor]/[pushToRelays]'s "first success wins" order), but the fallback entries
     * only get a full check on this contact's "mine" period, or when its chat is currently open
     * — same reasoning [pairRotationOffsetSeconds] already uses elsewhere in this class to phase
     * per-contact work apart instead of hitting every contact's full pool every single round.
     */
    private suspend fun pollRelayOnce() {
        if (!torManager.isReady.value) return
        val contacts = runCatching { contactDao.getAllContactsOnce() }.getOrDefault(emptyList())
        val activeChat = activeContactId.value

        // One loop for both contact kinds since v5. Before that, standard contacts polled this
        // device's OWN globally configured relay while cross-platform contacts polled the pool
        // they had advertised per contact — which is why a standard pairing only ever received
        // anything over the relay when both sides happened to have configured the very same one.
        // Now every contact is polled at the addresses THEY were told to push to.
        val tagsByTarget = LinkedHashMap<RelayManager.ParsedConnection, MutableSet<String>>()

        for (c in contacts) {
            val fullPool = contactMyRelayList(c).mapNotNull { RelayManager.parseConnectionString(it) }
                .ifEmpty {
                    // Pre-v5 pairing: nothing was advertised, so the global relay is all this
                    // contact can be using. Cross-platform contacts deliberately get no such
                    // fallback — they are relay-only and must keep working even when the global
                    // relay fallback is switched off in Settings.
                    if (!c.crossPlatform && relayManager.isUsable()) {
                        listOf(RelayManager.ParsedConnection(relayManager.getRelayOnion(), relayManager.getAuthToken()))
                    } else emptyList()
                }
            if (fullPool.isEmpty()) continue

            // See this function's doc comment: full pool this round only when it's this
            // contact's "mine" period (or overridden manually), or its chat is open right now —
            // otherwise just the primary entry, which is where almost everything lands anyway.
            val owner = c.manualRelayOwner ?: run {
                val myIdentity = c.myWireIdentity ?: identityManager.userId
                val theirIdentity = c.theirWireIdentity ?: c.remoteUserId
                if (identityManager.relayOwnerIsMine(c.publicKey, myIdentity, theirIdentity)) "mine" else "theirs"
            }
            val targets = if (owner == "mine" || activeChat == c.id) fullPool else fullPool.take(1)

            val buckets: List<Long> = if (c.crossPlatform) {
                // Generation counter, not a clock bucket — see CROSS_PLATFORM_PLAN.md.
                (c.theirGeneration - WECHSEL_GENERATION_TOLERANCE..c.theirGeneration + WECHSEL_GENERATION_TOLERANCE).toList()
            } else {
                // Own phase-shifted bucket per contact, not one shared global hour — see
                // IdentityManager.pairRotationOffsetSeconds().
                val hour = identityManager.currentHourBucket(identityManager.pairRotationOffsetSeconds(c.publicKey))
                listOf(hour, hour - 1, hour + 1, hour - 2, hour + 2)
            }

            for (target in targets) {
                val tags = tagsByTarget.getOrPut(target) { linkedSetOf() }
                for (identity in candidateIdentities(c)) {
                    for (b in buckets) {
                        tags += identityManager.expectedWireId(c.publicKey, identity, b)
                    }
                }
            }
        }

        if (tagsByTarget.isEmpty()) return

        val waitMs = if (isChatActiveOrRecent()) RELAY_POLL_WAIT_MS_ACTIVE else RELAY_POLL_WAIT_MS_IDLE

        // Every distinct target is fetched concurrently — a long-poll blocks its own call for up
        // to waitMs, and sequential targets would otherwise multiply that wait by the number of
        // distinct relay servers in play this round instead of paying it once, in parallel.
        coroutineScope {
            tagsByTarget.map { (target, tags) ->
                async {
                    for (chunk in tags.chunked(MAX_FETCH_MANY_TAGS_PER_CALL)) {
                        val result = runCatching {
                            relayClient.fetchMany(target.address, target.authToken, chunk, waitMs)
                        }.getOrDefault(emptyMap())
                        for ((tag, blobs) in result) {
                            for (blob in blobs) runCatching { ingestPacket(tag, blob) }
                        }
                    }
                }
            }.awaitAll()
        }
    }

    // unpruuf Business / Node-Mesh (NODE_MESH_SPEC.md) — a fully separate poll loop from
    // startRelayPoll above, not a branch inside it: the two transports share almost nothing
    // (owner-secret vs. no-auth-at-all, different client class, no shared-relay-target
    // batching opportunity since each contact's own nodes are typically unique to them, not
    // pooled across contacts the way relay targets can be). Same adaptive interval/wait
    // constants as the relay loop, reused rather than duplicated — the reasoning ("tight while a
    // chat's open, relaxed otherwise") applies identically here.
    private fun startNodeMeshPoll() {
        scope.launch {
            while (isActive) {
                val active = isChatActiveOrRecent()
                delay(if (active) RELAY_POLL_INTERVAL_ACTIVE_MS else RELAY_POLL_INTERVAL_IDLE_MS)
                pollNodeMeshOnce()
            }
        }
    }

    /** Runs one Node-Mesh poll round right now — same "don't make opening a chat wait for the
     *  next scheduled tick" reasoning as [pollRelayNow]. Safe to call freely: fetch never
     *  deletes (NODE_MESH_SPEC.md §4), so a redundant extra call just re-reads what's already
     *  there, same idempotence [ingestPacket]'s own dedup already relies on. */
    fun pollNodeMeshNow() {
        scope.launch { pollNodeMeshOnce() }
    }

    /**
     * Batched per distinct node ADDRESS across every Node-Mesh contact, not per contact — same
     * reasoning as [pollRelayOnce]'s `tagsByTarget` map (see that function's doc comment):
     * several contacts could share overlapping node infrastructure (e.g. a company hosting
     * several employees' own nodes), and collapsing to one `fetchMany` call per distinct address
     * avoids a redundant separate round-trip to the same server for each of them. Typically
     * degrades to "one call per contact" anyway when nodes genuinely are unique per person, which
     * costs nothing extra over the un-batched version — this is a pure win, never a regression.
     */
    private suspend fun pollNodeMeshOnce() {
        if (!torManager.isReady.value) return
        val contacts = runCatching { contactDao.getAllContactsOnce() }.getOrDefault(emptyList())
            .filter { it.nodeMesh }
        if (contacts.isEmpty()) return

        val waitMs = if (isChatActiveOrRecent()) RELAY_POLL_WAIT_MS_ACTIVE else RELAY_POLL_WAIT_MS_IDLE

        val tagsByAddress = LinkedHashMap<String, MutableSet<String>>()
        for (c in contacts) {
            val seed = c.theirNodeMeshRoutingSeed.takeIf { it.isNotBlank() } ?: continue
            val addresses = NodeMeshManager.parseNodeConnectionStringList(c.theirNodeAddresses ?: "")
                .mapNotNull { NodeMeshManager.parseAddressConnectionString(it) }
                // Temp Node (NODE_MESH_SPEC.md §7) — polled alongside the standard pool rather
                // than switched to exclusively: fetch has no delete-on-fetch side effect, so
                // checking both costs an extra request but never risks missing a message during
                // the CONTACT's own activation/fallback transitions, which this device can't
                // observe directly (that state lives on their phone, not this one).
                .plus(c.theirTempNodeAddress?.let { listOf(it) } ?: emptyList())
                .distinct()
            if (addresses.isEmpty()) continue
            val tags = identityManager.nodeMeshToleranceEpochs(NODE_MESH_DEFAULT_TTL_MS, NODE_MESH_ROTATION_INTERVAL_MS)
                .map { epoch -> identityManager.nodeMeshRoutingTag(seed, epoch) }
            // Every address is this ONE contact's own redundant node pool — added independently
            // (a blob could be sitting on any of them, delete-on-fetch isn't in play here so
            // there's no "already drained" risk in checking all).
            for (address in addresses) {
                tagsByAddress.getOrPut(address) { mutableSetOf() }.addAll(tags)
            }
        }
        if (tagsByAddress.isEmpty()) return

        // Every distinct address is fetched concurrently, same reasoning as pollRelayOnce's own
        // concurrent target fetch — a long-poll blocks its own call for up to waitMs, and
        // sequential addresses would otherwise multiply that wait by the number of distinct
        // node servers in play this round instead of paying it once, in parallel.
        coroutineScope {
            tagsByAddress.map { (address, tags) ->
                async {
                    for (chunk in tags.chunked(MAX_FETCH_MANY_TAGS_PER_CALL)) {
                        val result = runCatching {
                            nodeMeshClient.fetchMany(address, chunk, waitMs)
                        }.getOrDefault(emptyMap())
                        for ((tag, blobs) in result) {
                            for (blob in blobs) runCatching { ingestPacket(tag, blob) }
                        }
                    }
                }
            }.awaitAll()
        }
    }

    // Solange ein Chat geöffnet ist, den Tor-Sendepfad zu genau diesem Kontakt
    // warm halten (alle 20 s). Dann ist der Circuit bereit, wenn der Nutzer
    // sendet → kein 10–20 s Kaltstart mehr, v. a. im Mobilfunk.
    private val activeContactId = MutableStateFlow<String?>(null)
    // The most recently active contact keeps getting warmed for
    // ACTIVE_CHAT_GRACE_MS after its chat is left, instead of warmth
    // dropping to zero the instant setActiveChat(null) fires.
    private var recentContactId: String? = null
    private var recentContactWarmUntil: Long = 0L

    fun setActiveChat(contactId: String?) {
        activeContactId.value = contactId
        if (contactId != null) {
            recentContactId = contactId
            // Opening a chat shouldn't have to wait for the next scheduled tick of the
            // background relay poll — check right now, so anything already queued (relay
            // MANDATORY contacts especially) shows up as fast as the Tor RTT allows.
            pollRelayNow()
            pollNodeMeshNow()
        } else {
            recentContactId?.let {
                recentContactWarmUntil = System.currentTimeMillis() + ACTIVE_CHAT_GRACE_MS
            }
        }
    }

    // True if [contactId]'s Tor path is expected to be pre-warmed by startActiveChatWarmup
    // (open chat, or recently-left chat still inside its grace window). Used only for the
    // debug-only send-timing log in attemptDelivery — never affects delivery behavior.
    private fun isWarmPath(contactId: String): Boolean =
        activeContactId.value == contactId ||
            (recentContactId == contactId && System.currentTimeMillis() < recentContactWarmUntil)

    private fun startActiveChatWarmup() {
        scope.launch {
            while (isActive) {
                delay(20_000)
                if (!torManager.isReady.value) continue
                val id = activeContactId.value
                    ?: recentContactId?.takeIf { System.currentTimeMillis() < recentContactWarmUntil }
                    ?: continue
                val contact = runCatching { contactDao.getContactById(id) }.getOrNull() ?: continue
                runCatching { sendDummy(contact) }
            }
        }
    }

    // Hält den EIGENEN Hidden Service warm: verbindet sich regelmäßig über Tor
    // mit den eigenen Onion-Adressen. Das zwingt Tor, Deskriptor + Introduction
    // Points publiziert/aktiv zu halten → Kontakte erreichen uns zuverlässig und
    // schnell, auch auf Geräten mit aggressivem Doze (Samsung) oder im Mobilfunk.
    //
    // Was 60s — reported for real: receiving consistently took "about a minute" per message on
    // mobile data, steady-state (not just right after a network switch, and not helped by having
    // just sent something — sending and receiving use different Tor circuits/introduction
    // points, so a warm send path says nothing about the receive path). The ~1-minute figure
    // lines up almost exactly with this interval: on mobile specifically, the receive path goes
    // cold *between* keep-alive pings (unlike Wi‑Fi, which Android doesn't throttle the same
    // way), so an incoming message has to wait out roughly one keep-alive cycle before the
    // introduction points are live again. Tightened to close that gap — matches
    // startActiveChatWarmup's already-established 20s cadence for the send-side equivalent.
    private fun startOnionKeepAlive() {
        scope.launch {
            while (isActive) {
                delay(20_000)
                if (!torManager.isReady.value) continue
                val enc = runCatching {
                    cryptoManager.encryptForContact(DUMMY_SIGNAL, identityManager.myMessageKey)
                }.getOrNull() ?: continue
                if (enc.size > NetworkObfuscation.PACKET_SIZE - 8) continue
                val padded = NetworkObfuscation.padPacket(enc)
                // In parallel, not sequentially: with several own onions (main + legacy),
                // one slow/dead onion used to hold up the pings to all the others for its
                // full 40s timeout — and push the next keep-alive round out with it.
                coroutineScope {
                    torManager.getMyOnionAddresses().forEach { onion ->
                        launch { runCatching { sendViaTor(onion, padded, "ka") } }
                    }
                }
            }
        }
    }

    // TorManager's network-change bounce republishes the hidden service once, but one attempt
    // turned out not to be reliably enough on its own (reported for real on a Wi‑Fi → mobile-data
    // switch, fresh install/pairing — not stale state carried over from an older build). Rather
    // than hoping a fixed bounce schedule covers it, this actively PROVES the fix worked — a real
    // self-connect through the published hidden service, the same path a contact's incoming
    // connection takes — and keeps asking for another bounce, with backoff, until it does. Gives
    // up after ~2.5 minutes so a genuinely dead network doesn't retry forever.
    //
    // REGRESSION, caught for real: the first version of this checked every 5s and re-bounced
    // Tor on every single failure. Bouncing (DisableNetwork 1→0) tears down ALL of Tor's
    // circuits, not just the hidden-service publish path — and the HS republish this is waiting
    // on is documented (see TorManager/windows-start.ts) to normally take 10-30s on its own. A
    // 5s check interval meant this was almost always re-bouncing Tor before the PREVIOUS bounce
    // had any real chance to finish, which also killed any outgoing send caught in the crossfire
    // (including the delivery queue's own in-progress retries) — reported as "sending stuck for
    // ~5 minutes" after switching networks, i.e. this loop was actively fighting the very thing
    // it was trying to fix. Checks now start at 20s (comfortably past the documented publish
    // time) and back off further from there, so each bounce gets a real, mostly-uninterrupted
    // window to either succeed or genuinely fail before another one is even considered.
    private var reachabilityCheckJob: Job? = null

    // Last self-check verdict, for the contact list's status pill: null = not checked yet,
    // false = the device currently believes its own hidden service is unreachable and is
    // trying to fix it ("RECONNECTING" in the UI). Diagnostic honesty on screen — "Tor
    // active" alone said nothing about whether anyone could actually reach this device.
    private val _selfReachable = MutableStateFlow<Boolean?>(null)
    val selfReachable: StateFlow<Boolean?> = _selfReachable.asStateFlow()

    // Per-onion consecutive-failure streaks for the legacy onions probed (but not verdict-gated)
    // in isSelfReachableViaTor — see LEGACY_ONION_FAILURE_THRESHOLD's doc comment. Fed by every
    // call to isSelfReachableViaTor, both from the network-change retry loop above and the
    // periodic timer below, so a legacy onion that outlives one retry window still gets found.
    private val legacyOnionFailureStreak = ConcurrentHashMap<String, Int>()
    private var lastLegacyRecoveryBounceAt = 0L

    // Fire-and-forget: a legacy onion crossing the failure threshold asks for one bounce,
    // independent of and rate-limited separately from the main gate's own retry loop, so it
    // can never turn into the every-failure-bounces regression that loop was already fixed for.
    //
    // REGRESSION, caught for real right after this shipped: entirely skipping the network-change
    // window was NOT enough on its own the first time this was reasoned through — the guard
    // below was missing, and this could fire its own independent forceBounce() WHILE
    // verifyReachabilityAfterNetworkChange's loop was already actively recovering from the same
    // network switch. A bounce tears down every circuit the device has, including whatever a
    // fresh, otherwise-completely-healthy pairing was in the middle of connecting over — reported
    // as "mobile↔mobile dead in both directions, and a BRAND NEW contact on Wi‑Fi stuck at the
    // clock even after re-pairing and an app restart" — i.e. this mechanism briefly made the
    // exact class of problem it exists to fix worse for everyone, not just the legacy-onion edge
    // case it targeted. Now: don't even accumulate a failure streak while that loop is active —
    // churn during an active network transition is expected and not what this is for; only a
    // legacy onion still failing once things have settled (the periodic 4-min check, loop idle)
    // counts toward the threshold.
    private fun recordLegacyOnionProbe(onion: String, reachable: Boolean) {
        if (reachabilityCheckJob?.isActive == true) return
        if (reachable) {
            legacyOnionFailureStreak.remove(onion)
            return
        }
        val streak = legacyOnionFailureStreak.merge(onion, 1, Int::plus) ?: 1
        if (streak < LEGACY_ONION_FAILURE_THRESHOLD) return
        val now = System.currentTimeMillis()
        if (now - lastLegacyRecoveryBounceAt < LEGACY_RECOVERY_MIN_INTERVAL_MS) return
        lastLegacyRecoveryBounceAt = now
        legacyOnionFailureStreak[onion] = 0
        scope.launch { runCatching { torManager.forceBounce() } }
    }

    // REGRESSION, caught for real: forceBounce() below always emits TorManager.networkChanged
    // (see its doc comment), which is also collected in start() — the SAME collector that calls
    // THIS function. Without the isActive guard, every bounce this loop triggers as part of its
    // own retry attempts fed straight back into cancelling and restarting itself, resetting
    // checkDelay back to start and the give-up deadline back to full on every single one of its
    // own bounces — reported as near-continuous cold-start delays and one 20+-minute recovery.
    // Now a no-op while a check is already in flight.
    //
    // REGRESSION #2, caught for real ("receiving on mobile data completely dead, instantly fine
    // on Wi‑Fi, Tor itself active, sending works"): treating EVERY failed self-connect as
    // license to bounce was self-destructive on mobile data specifically. A self-connect from
    // a mobile client through its own hidden service is the slowest, flakiest path there is —
    // it regularly times out even while actual contacts could connect fine. Each false-negative
    // triggered a full DisableNetwork bounce, tearing down the just-published hidden service;
    // with the periodic check re-entering every 4 minutes, a device on a slow carrier ended up
    // bouncing its own Tor in a near-permanent loop — receiving never had a stable window, so
    // nothing ever arrived. Two changes: a single failed check no longer bounces (it re-checks
    // once first — TWO consecutive failures are required before the disruptive remedy), and
    // after a bounce the next check waits 45s so the republish plus a slow mobile self-connect
    // get a realistic chance before being judged again.
    private fun verifyReachabilityAfterNetworkChange() {
        if (reachabilityCheckJob?.isActive == true) return
        reachabilityCheckJob = scope.launch {
            val deadline = System.currentTimeMillis() + 240_000
            var consecutiveFailures = 0
            var checkDelay = 20_000L
            while (isActive && System.currentTimeMillis() < deadline) {
                delay(checkDelay)
                if (!torManager.isReady.value) continue
                if (isSelfReachableViaTor()) {
                    _selfReachable.value = true
                    return@launch
                }
                _selfReachable.value = false
                consecutiveFailures++
                if (consecutiveFailures >= 2) {
                    runCatching { torManager.forceBounce() }
                    consecutiveFailures = 0
                    checkDelay = 45_000L
                } else {
                    checkDelay = 25_000L
                }
            }
        }
    }

    // The checks above only ever run reactively — triggered by an OS network-change callback.
    // That leaves a gap: staleness with no such event (a carrier silently killing an idle
    // connection, a Tor circuit/introduction-point expiring on its own, a NAT rebind Android
    // doesn't consider a network change) never gets caught or self-healed until the next
    // unrelated network switch happens to fire. This runs the same real self-connect check on a
    // plain timer, independent of any event, so that kind of silent staleness gets found and
    // fixed too. Skips the check (but not the loop) while a reachability recovery from an actual
    // network-change event is already in flight, to avoid two overlapping recovery attempts
    // fighting each other the way the DisableNetwork-bounce regression did (see
    // verifyReachabilityAfterNetworkChange's doc comment above).
    private fun startPeriodicReachabilityCheck() {
        scope.launch {
            while (isActive) {
                delay(4 * 60_000L)
                if (!torManager.isReady.value) continue
                runCatching { rotateVerifiedOnionIfDue() } // day-granularity; a cheap no-op most cycles
                if (reachabilityCheckJob?.isActive == true) continue
                if (isSelfReachableViaTor()) {
                    _selfReachable.value = true
                    continue
                }
                _selfReachable.value = false
                verifyReachabilityAfterNetworkChange()
            }
        }
    }

    // Same self-connect technique startOnionKeepAlive() already uses to keep the HS warm, but
    // here the actual success/failure is used as a real reachability signal instead of a
    // fire-and-forget ping.
    //
    // Verdict semantics, third iteration — each earlier one failed against a real device:
    // `.any {}` let a legacy per-contact onion mask a dead MAIN onion (receiving stayed broken
    // while the check reported fine). `.all {}` fixed that but over-corrected: on mobile data a
    // self-connect is the slowest, flakiest path there is, and requiring EVERY onion (main +
    // each legacy one) to answer within the timeout made the verdict chronically false-negative
    // — which the retry loop answered with full Tor bounces, creating the very unreachability
    // it was checking for (reported as "receiving on mobile completely dead, fine on Wi‑Fi").
    // Now: the MAIN onion is the gate — it's what every current pairing dials, and it must
    // answer, with ONE retry before failing (a single timed-out self-connect on mobile is
    // usually a false negative, and a bounce is far too disruptive to hang on one). Legacy
    // onions are still probed in parallel for descriptor warmth, but can no longer fail the
    // verdict. The `.any{}` bug stays fixed: a legacy onion answering cannot pass the check
    // while the main onion is down, because only the main onion's answer counts.
    //
    // "No longer fail the verdict" initially meant "no longer does ANYTHING" — a legacy onion
    // could go silently unreachable forever with nothing ever noticing, since the visible status
    // pill and the retry loop above both only ever look at the gate. recordLegacyOnionProbe
    // (fed below) is the fix: a small, independently rate-limited side channel that asks for one
    // recovery bounce after real, repeated legacy-onion failures — decoupled from `_selfReachable`
    // so it can't resurrect either of the two regressions above.
    //
    // Deliberately NOT pooled: this probe exists to prove a fresh connection through the
    // published hidden service works right now, which an already-open pooled connection would
    // trivially (and wrongly) pass. Full send timeout per probe — see SELF_CHECK_TIMEOUT_MS
    // for why shortening it is a trap on mobile data.
    private suspend fun isSelfReachableViaTor(): Boolean {
        val enc = runCatching {
            cryptoManager.encryptForContact(DUMMY_SIGNAL, identityManager.myMessageKey)
        }.getOrNull() ?: return false
        if (enc.size > NetworkObfuscation.PACKET_SIZE - 8) return false
        val padded = NetworkObfuscation.padPacket(enc)
        val onions = torManager.getMyOnionAddresses()
        val gate = torManager.onionAddress.value ?: onions.firstOrNull() ?: return false
        return coroutineScope {
            onions.filter { it != gate }.forEach { onion ->
                launch {
                    val reachable = runCatching { sendViaTor(onion, padded, "ka", SELF_CHECK_TIMEOUT_MS) }.getOrDefault(false)
                    recordLegacyOnionProbe(onion, reachable)
                }
            }
            var ok = false
            for (attempt in 1..2) {
                ok = runCatching {
                    sendViaTor(gate, padded, "ka", SELF_CHECK_TIMEOUT_MS)
                }.getOrDefault(false)
                if (ok) break
            }
            ok
        }
    }

    // Smart Dummy Traffic: in randomisierten Abständen ein Tarnpaket an einen
    // zufälligen Kontakt senden. Auf der Leitung nicht von echten Nachrichten
    // unterscheidbar (gleiche Größe, verschlüsselt, eigene Wire-ID). Verschleiert
    // ob/wann wirklich kommuniziert wird. Empfänger verwirft es still.
    private fun startDummyTraffic() {
        scope.launch {
            while (isActive) {
                delay(DUMMY_MIN_MS + java.util.concurrent.ThreadLocalRandom.current()
                    .nextLong(DUMMY_MAX_MS - DUMMY_MIN_MS))
                val contacts = runCatching { contactDao.getAllContactsOnce() }.getOrDefault(emptyList())
                if (contacts.isEmpty()) continue
                // Jeden Kontakt-Pfad warmhalten (Onion-Circuits/Deskriptor frisch
                // halten → erste echte Nachricht ohne Kaltstart). Zufällige
                // Reihenfolge + gelegentliches Aussetzen = unregelmäßiges Muster.
                for (c in contacts.shuffled()) {
                    if (java.util.concurrent.ThreadLocalRandom.current().nextInt(5) == 0) continue
                    runCatching { sendDummy(c) }
                    delay(java.util.concurrent.ThreadLocalRandom.current().nextLong(1_000, 5_000))
                }
            }
        }
    }

    /**
     * Wärmt den Tor-Pfad zu [contactId] vor (Kaltstart einer Onion-Verbindung
     * dauert ~15–20 s). Wird beim Öffnen eines Chats aufgerufen, damit der
     * Circuit bereit ist, wenn der Nutzer kurz darauf sendet.
     */
    fun warmUpContact(contactId: String) {
        scope.launch {
            val contact = contactDao.getContactById(contactId) ?: return@launch
            runCatching { sendDummy(contact) }
        }
    }

    private suspend fun sendDummy(contact: com.nexonai.unpruuf.data.model.Contact) {
        val key = runCatching {
            android.util.Base64.decode(contact.publicKey, android.util.Base64.DEFAULT)
        }.getOrNull()?.takeIf { it.size == 32 } ?: return
        val encrypted = runCatching {
            cryptoManager.encryptForContact(DUMMY_SIGNAL, key)
        }.getOrNull() ?: return
        if (encrypted.size > NetworkObfuscation.PACKET_SIZE - 8) return
        val padded = NetworkObfuscation.padPacket(encrypted)
        val wireId = identityManager.myWireId(contact.publicKey, identity = contact.myWireIdentity ?: identityManager.userId)

        // See attemptChunkTrainDelivery's matching comment — LAN matching key is remoteUserId,
        // not the local-only contact.id.
        val lan = contact.remoteUserId.takeIf { it.isNotBlank() }?.let { lanPeers[it.take(8)] }
        if (lan != null && sendViaTcp(lan.first, lan.second, padded, wireId)) return
        if (torManager.isReady.value && contact.onionAddress.endsWith(".onion")) {
            // Pooled on purpose: the active chat's 20s warm-up dummy travelling over the
            // pooled connection is exactly what keeps that connection open (the receive
            // side idles connections out after IDLE_RECEIVE_TIMEOUT_MS) — so the next real
            // message finds a live connection instead of paying a fresh rendezvous.
            sendViaTorPooled(contact.id, contact.onionAddress, padded, wireId)
        }
    }

    private fun acquireMulticastLock() {
        val wifi = context.getSystemService(WifiManager::class.java)
        multicastLock = wifi?.createMulticastLock("unpruuf_nsd")?.apply { acquire() }
    }

    private fun startServer() {
        scope.launch {
            try {
                val ss = ServerSocket(LOCAL_PORT).also { serverSocket = it }
                while (isActive) {
                    val client = runCatching { ss.accept() }.getOrNull() ?: break
                    if (!acceptSemaphore.tryAcquire()) {
                        client.runCatching { close() }
                        continue
                    }
                    launch {
                        try {
                            receiveMessage(client)
                        } finally {
                            acceptSemaphore.release()
                        }
                    }
                }
            } catch (_: Exception) {}
        }
    }

    // Serves MULTIPLE packets per accepted connection, not one: senders now keep a
    // connection open per contact and reuse it (see the pooled send path below), so every
    // follow-up message and every chunk of a file transfer skips the full SOCKS connect +
    // onion rendezvous (up to 20s cold) it used to pay per packet. Loop exits — closing the
    // socket — on peer close (EOFException from readUTF), on a malformed packet (same
    // silent-drop-and-close as before), or after IDLE_RECEIVE_TIMEOUT_MS with nothing new
    // (SocketTimeoutException). One-shot senders (LAN path, keep-alive probes, an older app
    // version) close after their single packet and just take the EOF exit — nothing about
    // the per-packet wire format or the ACK contract changed.
    private suspend fun receiveMessage(socket: Socket) {
        runCatching {
            socket.soTimeout = IDLE_RECEIVE_TIMEOUT_MS
            val input = DataInputStream(socket.getInputStream())
            while (true) {
                val wireId = input.readUTF()
                val size = input.readInt()
                if (size <= 0 || size > NetworkObfuscation.PACKET_SIZE) return@runCatching
                val packet = ByteArray(size).also { input.readFully(it) }
                if (!ingestPacket(wireId, packet)) return@runCatching
                sendAck(socket)
            }
        }
        socket.runCatching { close() }
    }

    // Recently processed packets, keyed by SHA-256 of the raw outer packet — the lost-ACK
    // dedup below. Access-ordered LRU, bounded; sized to cover more than a full 5 MB file's
    // ~1311 chunks so even a large transfer's retries stay inside the window. Retries resend
    // the exact same padded bytes (PendingDelivery keeps them), and unrelated packets can
    // never collide: the outer AES-GCM encryption uses a fresh random IV per packet.
    private val processedPacketHashes = object : LinkedHashMap<String, Boolean>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Boolean>): Boolean =
            size > 2048
    }

    /**
     * Unpads, decrypts and dispatches one outer packet — shared by the direct socket-receive
     * path above and the relay-poll path below, so a message is handled identically regardless
     * of which transport delivered it. Returns true if the packet was recognized and processed
     * (whether a dummy/control signal or a real message), false if it was malformed/unrecognized
     * and should be silently dropped.
     *
     * LOST-ACK DEDUP: a packet can be delivered and processed while its ACK gets lost on the
     * way back (timeout, connection cut at the wrong moment — the slow mobile-receiver
     * direction makes this a real tail risk, not a theoretical one). The sender then retries
     * the SAME bytes — but a real message can't simply be decrypted again: the Double Ratchet
     * has already consumed that message key and advanced past it, so the retry would fail
     * forever, never get ACKed, and — because the delivery queue strictly orders per contact —
     * permanently jam every later message to that contact behind it (a poison message).
     * So: any packet whose hash was already processed is re-ACKed WITHOUT reprocessing —
     * idempotent delivery — which is also harmlessly correct for dummies and for the (already
     * idempotent) control signals.
     */
    private suspend fun ingestPacket(wireId: String, packet: ByteArray): Boolean {
        val hash = runCatching {
            android.util.Base64.encodeToString(
                java.security.MessageDigest.getInstance("SHA-256").digest(packet),
                android.util.Base64.NO_WRAP
            )
        }.getOrNull()
        // Reserve the hash slot BEFORE processing, not after: the same packet can arrive
        // concurrently via direct delivery and the relay poll (both retry the identical
        // padded bytes), and ingestPacketInner is a suspend fun with no lock of its own —
        // checking-then-inserting after processing left a window where both callers would
        // pass the "not yet seen" check and race on chunkReassembly's mutable state.
        // get() (not containsKey) so a hit refreshes the entry's LRU position.
        val alreadyClaimed = hash != null && synchronized(processedPacketHashes) {
            if (processedPacketHashes[hash] != null) {
                true
            } else {
                processedPacketHashes[hash] = true
                false
            }
        }
        if (alreadyClaimed) return true
        val processed = ingestPacketInner(wireId, packet)
        if (!processed && hash != null) {
            // Not actually processable (malformed/unrecognized) — don't leave a false
            // reservation behind, or a legitimate later packet with a colliding hash
            // (won't happen with SHA-256, but keeps the invariant "only real hits are
            // cached" intact) would be silently swallowed.
            synchronized(processedPacketHashes) { processedPacketHashes.remove(hash) }
        }
        return processed
    }

    private suspend fun ingestPacketInner(wireId: String, packet: ByteArray): Boolean {
        // Unpad → decrypt with OUR OWN receive key (the key we shared in our QR code)
        val padded = runCatching { NetworkObfuscation.unpadPacket(packet) }.getOrNull() ?: return false
        val plaintext = runCatching {
            cryptoManager.decryptWithKey(padded, identityManager.myMessageKey)
        }.getOrNull() ?: return false

        // Tarnpaket: still verwerfen.
        if (plaintext.contentEquals(DUMMY_SIGNAL)) return true

        // Rotierende Wire-ID → echten Kontakt auflösen.
        val senderId = resolveSender(wireId) ?: return false

        if (plaintext.contentEquals(REVOKE_SIGNAL)) {
            messageStore.zeroizeContact(senderId)
            return true
        }

        if (plaintext.contentEquals(DELETE_CONTACT_SIGNAL)) {
            messageStore.zeroizeContact(senderId)
            contactDao.deleteById(senderId)
            identityManager.removeContactOnionPrivKey(senderId)
            ratchetSessionManager.deleteSession(senderId)
            deliveryQueue.removeAll { it.contactId == senderId }
            return true
        }

        val plaintextStr = runCatching { String(plaintext, Charsets.UTF_8) }.getOrNull()
        if (plaintextStr != null && plaintextStr.startsWith(MAIN_ONION_UPDATE_SIGNAL_PREFIX)) {
            val newOnion = plaintextStr.removePrefix(MAIN_ONION_UPDATE_SIGNAL_PREFIX)
            // Defensive shape check before it ever reaches the DB — a malformed or malicious
            // value here must never silently break future delivery to this contact.
            if (ONION_V3_REGEX.matches(newOnion)) {
                contactDao.updateOnionAddress(senderId, newOnion)
            }
            return true
        }

        if (plaintextStr != null && plaintextStr.startsWith(VERIFIED_ONION_UPDATE_SIGNAL_PREFIX)) {
            val newOnion = plaintextStr.removePrefix(VERIFIED_ONION_UPDATE_SIGNAL_PREFIX)
            // Same shape check as the main-onion update above; writes to the same field —
            // there's nothing for this contact to track separately, the "verified" distinction
            // only matters on the SENDING device's side (which onion it chooses to announce).
            if (ONION_V3_REGEX.matches(newOnion)) {
                contactDao.updateOnionAddress(senderId, newOnion)
            }
            return true
        }

        if (plaintextStr != null && plaintextStr.startsWith(WECHSEL_SIGNAL_PREFIX)) {
            val update = parseWechselSignal(plaintextStr.removePrefix(WECHSEL_SIGNAL_PREFIX))
            if (update != null) {
                contactDao.updateWechselInfo(senderId, update.first, update.second)
            }
            return true
        }

        if (plaintextStr != null && plaintextStr.startsWith(NEW_IDENTITY_SIGNAL_PREFIX)) {
            val newIdentity = plaintextStr.removePrefix(NEW_IDENTITY_SIGNAL_PREFIX)
            // Defensive shape check, same reasoning as the onion-address one above — a
            // malformed value here must never silently break future wire-tag resolution.
            if (runCatching { java.util.UUID.fromString(newIdentity) }.isSuccess) {
                contactDao.updateTheirWireIdentity(senderId, newIdentity)
            }
            return true
        }

        if (plaintextStr != null && plaintextStr.startsWith(RELAY_OWNER_SWITCH_SIGNAL_PREFIX)) {
            val owner = plaintextStr.removePrefix(RELAY_OWNER_SWITCH_SIGNAL_PREFIX)
            if (owner == "mine" || owner == "theirs") {
                contactDao.updateManualRelayOwner(senderId, owner)
            }
            return true
        }

        if (plaintextStr != null && plaintextStr.startsWith(NODE_MIGRATE_SIGNAL_PREFIX)) {
            val entries = NodeMeshManager.parseNodeConnectionStringList(plaintextStr.removePrefix(NODE_MIGRATE_SIGNAL_PREFIX))
            val oldAddress = entries.getOrNull(0)?.let { NodeMeshManager.parseAddressConnectionString(it) }
            val newAddress = entries.getOrNull(1)?.let { NodeMeshManager.parseAddressConnectionString(it) }
            val contact = contactDao.getContactById(senderId)
            if (oldAddress != null && newAddress != null && contact != null && contact.nodeMesh) {
                val current = NodeMeshManager.parseNodeConnectionStringList(contact.theirNodeAddresses ?: "")
                    .mapNotNull { NodeMeshManager.parseAddressConnectionString(it) }
                // Replace the migrating entry; if it wasn't already known (e.g. an earlier
                // migration signal was lost), just add the new one rather than silently
                // dropping this announcement.
                val updated = (current.filter { it != oldAddress } + newAddress).distinct()
                    .take(NodeMeshManager.NODE_POOL_MAX_SIZE)
                    .map { NodeMeshManager.buildAddressConnectionString(it) }
                contactDao.updateTheirNodeAddresses(senderId, NodeMeshManager.buildNodeConnectionStringList(updated))
            }
            return true
        }

        if (plaintextStr != null && plaintextStr.startsWith(TEMP_NODE_SIGNAL_PREFIX)) {
            val address = NodeMeshManager.parseAddressConnectionString(plaintextStr.removePrefix(TEMP_NODE_SIGNAL_PREFIX))
            val contact = contactDao.getContactById(senderId)
            if (address != null && contact != null && contact.nodeMesh) {
                contactDao.updateTheirTempNodeAddress(senderId, address)
            }
            return true
        }

        if (plaintextStr == TEMP_NODE_OFF_SIGNAL_PREFIX) {
            val contact = contactDao.getContactById(senderId)
            if (contact != null && contact.nodeMesh) {
                contactDao.updateTheirTempNodeAddress(senderId, null)
            }
            return true
        }

        // Real chat message: unwrap the outer chunk framing, then — once a full logical
        // message is reassembled — the Double Ratchet layer. See RatchetFrame's doc comment for
        // why one reassembly slot per sender is safe and why pieces are buffered by explicit
        // index rather than arrival order — chunks can now arrive via direct delivery or the
        // relay (or a mix across retries), and only direct delivery guarantees in-order arrival.
        val frame = RatchetFrame.decode(plaintext) ?: return false
        val ciphertext: ByteArray
        val header: RatchetHeader
        when (frame) {
            is RatchetFrame.Frame.Single -> {
                header = frame.header
                ciphertext = frame.ciphertext
            }
            is RatchetFrame.Frame.ChunkStart -> {
                chunkReassembly[senderId] = ChunkReassembly(frame.header, frame.totalChunks).apply {
                    pieces[0] = frame.piece
                    received = 1
                }
                return true
            }
            is RatchetFrame.Frame.ChunkCont -> {
                val reassembly = chunkReassembly[senderId] ?: return false
                if (frame.index !in reassembly.pieces.indices) return false
                if (reassembly.pieces[frame.index] == null) {
                    reassembly.pieces[frame.index] = frame.piece
                    reassembly.received++
                }
                if (!reassembly.isComplete()) return true
                chunkReassembly.remove(senderId)
                header = reassembly.header
                ciphertext = reassembly.pieces.fold(ByteArrayOutputStream()) { out, piece ->
                    out.apply { write(piece!!) }
                }.toByteArray()
            }
        }

        val contact = contactDao.getContactById(senderId) ?: return false
        // Must be identityManager.pairSecret(...), NOT contact.publicKey decoded raw — the
        // latter is this device's copy of the CONTACT's key, not a value both sides agree on.
        // See RatchetSessionManager.deriveSharedSecret's doc comment for the full explanation.
        val pairSecret = identityManager.pairSecret(contact.publicKey)
        val realPlaintext = runCatching {
            ratchetSessionManager.decrypt(senderId, header, ciphertext, pairSecret)
        }.getOrNull() ?: return false

        val content = MessagePayload.decode(realPlaintext) ?: return false
        val msg = when (content) {
            is MessagePayload.Content.Text -> RamMessage(
                id = UUID.randomUUID().toString(),
                senderId = senderId,
                content = content.text.toByteArray(Charsets.UTF_8),
                timestamp = System.currentTimeMillis(),
                isOutgoing = false,
                type = MessageType.TEXT
            )
            is MessagePayload.Content.Attachment -> RamMessage(
                id = UUID.randomUUID().toString(),
                senderId = senderId,
                content = content.bytes,
                timestamp = System.currentTimeMillis(),
                isOutgoing = false,
                type = if (content.isImage) MessageType.IMAGE else MessageType.FILE,
                fileName = content.name
            )
        }
        messageStore.addMessage(senderId, msg)
        messageStore.markUnread(senderId)
        showMessageNotification()
        return true
    }

    /**
     * Which identity strings this contact might currently be tagging their outgoing wire-ID
     * with — [Contact.theirWireIdentity] (their fresh per-contact id, once learned via a
     * NEW_IDENTITY signal) tried first, but [Contact.remoteUserId] (their pairing-time claimed
     * identity) is always ALSO tried, permanently, not just during a transition window: if a
     * NEW_IDENTITY signal is ever lost, this self-heals the next time anything is resolved,
     * with no extra state or "was the switch acknowledged" tracking needed. See Contact.kt's
     * doc comments for why the two are no longer the same value.
     */
    private fun candidateIdentities(c: com.nexonai.unpruuf.data.model.Contact): List<String> =
        listOfNotNull(c.theirWireIdentity, c.remoteUserId.takeIf { it.isNotBlank() }).distinct()

    // Ordnet eine eingehende (stündlich rotierende) Wire-ID dem Kontakt zu.
    // ±2 Stunden Toleranz gegen Uhr-Abweichung. Legacy-Fallback: direkte ID.
    private suspend fun resolveSender(wireId: String): String? {
        val contacts = runCatching { contactDao.getAllContactsOnce() }.getOrDefault(emptyList())
        for (c in contacts) {
            // unpruuf Business / Node-Mesh — [wireId] here is actually a routing_tag when this
            // is called from pollNodeMeshOnce (the poll loop reuses ingestPacket()'s existing
            // dedup wrapper by passing the routing tag in the same parameter position a wire ID
            // normally occupies — the parameter just needs to be "an opaque string that resolves
            // to a contact", which a routing tag equally is). No identity/generation ambiguity to
            // resolve here at all, unlike the branches below — the tolerance window alone
            // determines which epochs are still worth checking.
            if (c.nodeMesh) {
                val seed = c.theirNodeMeshRoutingSeed.takeIf { it.isNotBlank() } ?: continue
                for (epoch in identityManager.nodeMeshToleranceEpochs(NODE_MESH_DEFAULT_TTL_MS, NODE_MESH_ROTATION_INTERVAL_MS)) {
                    if (identityManager.nodeMeshRoutingTag(seed, epoch) == wireId) return c.id
                }
                continue
            }
            val identities = candidateIdentities(c)
            if (c.crossPlatform) {
                // Generation-based tag, not hour-based — same expectedWireId formula, just fed
                // a generation counter instead of a clock bucket (see CROSS_PLATFORM_PLAN.md).
                for (identity in identities) {
                    for (g in c.theirGeneration - WECHSEL_GENERATION_TOLERANCE..c.theirGeneration + WECHSEL_GENERATION_TOLERANCE) {
                        if (identityManager.expectedWireId(c.publicKey, identity, g) == wireId) return c.id
                    }
                }
                continue
            }
            // Own phase-shifted bucket per contact, not one shared global hour — see
            // IdentityManager.pairRotationOffsetSeconds().
            val hour = identityManager.currentHourBucket(identityManager.pairRotationOffsetSeconds(c.publicKey))
            for (identity in identities) {
                for (h in longArrayOf(hour, hour - 1, hour + 1, hour - 2, hour + 2)) {
                    if (identityManager.expectedWireId(c.publicKey, identity, h) == wireId) return c.id
                }
            }
            if (c.remoteUserId.isNotBlank() && c.remoteUserId == wireId) return c.id // Legacy (alte App-Version)
        }
        return null
    }

    private fun sendAck(socket: Socket) {
        runCatching {
            socket.getOutputStream().apply {
                write(ACK)
                flush()
            }
        }
    }

    // Anonyme Benachrichtigung: zeigt NUR, dass eine Nachricht eingegangen ist —
    // niemals von wem und niemals den Inhalt. Alle Nachrichten teilen sich eine
    // feste Notification-ID, damit auch die Anzahl der Absender nicht durchsickert.
    private fun showMessageNotification() {
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, UnpruufApplication.CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("unpruuf")
            .setContentText("New message received")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .build()

        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED
        ) {
            NotificationManagerCompat.from(context).notify(GENERIC_MESSAGE_NOTIF_ID, notification)
        }
    }

    /**
     * Send [plaintext] to [toContactId].
     * Die Nachricht wird verschlüsselt und in die Zustell-Warteschlange gelegt.
     * Zustellung: LAN zuerst, dann Tor — mit unbegrenzten Wiederholungen,
     * bis der Empfänger per ACK bestätigt. [messageId] erscheint danach
     * in [deliveredIds] (→ Häkchen im Chat).
     */
    fun sendMessage(toContactId: String, plaintext: ByteArray, messageId: String? = null): Boolean {
        scope.launch {
            sendLocks.getOrPut(toContactId) { Mutex() }.withLock {
                enqueueRatchetMessage(toContactId, plaintext, messageId)
            }
        }
        return true
    }

    /**
     * Double Ratchet-encrypts [plaintext] once (however large), splits it into as many outer
     * packets as needed (see [RatchetFrame]), and enqueues every packet — or none at all: builds
     * the full set of packets before enqueuing any of them, since a partially-enqueued chunked
     * transfer would leave the receiver's reassembly waiting forever for a chunk that never
     * arrives, which is worse than not sending at all. Must be called under [sendLocks] for
     * [toContactId] — see that field's doc comment for why.
     */
    private suspend fun enqueueRatchetMessage(toContactId: String, plaintext: ByteArray, messageId: String?) {
        val contact = contactDao.getContactById(toContactId) ?: return
        val contactKey = runCatching {
            android.util.Base64.decode(contact.publicKey, android.util.Base64.DEFAULT)
        }.getOrNull()?.takeIf { it.size == 32 } ?: return

        // Associated data is identityManager.pairSecret(...) — the pair's actual shared secret,
        // symmetric on both devices — NOT contactKey: that's this device's copy of the CONTACT's
        // own key, different from what the contact's device holds as ITS pairSecret input, so
        // using it directly here would silently break decryption on both ends. See
        // RatchetSessionManager.deriveSharedSecret's doc comment. contactKey itself stays as-is
        // below for the outer per-direction AES envelope, which is correctly asymmetric.
        val pairSecret = identityManager.pairSecret(contact.publicKey)
        val encryptedMessage = runCatching {
            ratchetSessionManager.encrypt(toContactId, plaintext, pairSecret)
        }.getOrNull() ?: return

        val frames = RatchetFrame.split(encryptedMessage.header, encryptedMessage.ciphertext)
        val toEnqueue = ArrayList<ByteArray>(frames.size)
        for (frame in frames) {
            val encoded = RatchetFrame.encode(frame)
            val encrypted = runCatching { cryptoManager.encryptForContact(encoded, contactKey) }.getOrNull()
            if (encrypted == null || encrypted.size > NetworkObfuscation.PACKET_SIZE - 8) return
            toEnqueue.add(NetworkObfuscation.padPacket(encrypted))
        }

        // Cross-platform (iOS-interop) contacts: snapshot the wire ID and relay candidates once,
        // now, rather than letting attemptDelivery/attemptChunkTrainDelivery re-derive them from
        // a live contactDao lookup on every retry — see PendingDelivery's and attemptDelivery's
        // doc comments for the real bug this avoids (a contact deleted while an item is still
        // queued/retrying used to make that item's cross-platform branch silently unreachable).
        val crossPlatformWireId = if (contact.crossPlatform) {
            identityManager.myWireId(
                contact.publicKey,
                identity = contact.myWireIdentity ?: identityManager.userId,
                hour = contact.myGeneration
            )
        } else null
        val relayCandidates = contactTheirRelayList(contact)
        val nodeMeshRoutingTag = nodeMeshTagFor(contact)

        // Chunked (multi-frame) transfers are relay-eligible too, same as single-frame ones:
        // RatchetFrame.Frame.ChunkCont now carries an explicit index, so the receive side
        // reassembles correctly regardless of which transport delivered which piece or what order
        // they arrived in — see ChunkReassembly's doc comment. The delivery queue itself still
        // guarantees frames for one message are always attempted (via whichever transport)
        // strictly in order, one message at a time per contact — see sendLocks/flushQueue.
        toEnqueue.forEachIndexed { index, padded ->
            // Only the LAST chunk carries messageId — chunk delivery is strictly
            // prefix-ordered (see attemptChunkTrainDelivery), so by the time the last chunk
            // is ACKed every earlier one already was too.
            val isLast = index == toEnqueue.lastIndex
            deliveryQueue.add(
                PendingDelivery(
                    if (isLast) messageId else null,
                    toContactId,
                    padded,
                    contact.publicKey,
                    myIdentity = contact.myWireIdentity,
                    isChunk = toEnqueue.size > 1,
                    crossPlatformWireId = crossPlatformWireId,
                    relayCandidates = relayCandidates,
                    nodeMeshRoutingTag = nodeMeshRoutingTag
                )
            )
        }
        wakeSignal.trySend(Unit)
        flushQueue()
    }

    fun sendRevokeSignal(toContactId: String) {
        scope.launch {
            val contact = contactDao.getContactById(toContactId) ?: return@launch
            val contactKey = runCatching {
                android.util.Base64.decode(contact.publicKey, android.util.Base64.DEFAULT)
            }.getOrNull()?.takeIf { it.size == 32 } ?: return@launch

            val encrypted = runCatching {
                cryptoManager.encryptForContact(REVOKE_SIGNAL, contactKey)
            }.getOrNull() ?: return@launch

            if (encrypted.size > NetworkObfuscation.PACKET_SIZE - 8) return@launch
            val padded = NetworkObfuscation.padPacket(encrypted)

            deliveryQueue.add(
                PendingDelivery(
                    null, toContactId, padded, contact.publicKey,
                    myIdentity = contact.myWireIdentity,
                    nodeMeshRoutingTag = nodeMeshTagFor(contact)
                )
            )
            wakeSignal.trySend(Unit)
            flushQueue()
        }
    }

    /**
     * Tells [toContactId] to switch to this device's current main onion address, closing the
     * address-isolation gap documented in SECURITY_CLAIMS.md §8: pairings made before the main
     * onion existed keep using their own legacy per-contact onion until this is sent. Delivered
     * over the pairing's already-established encrypted channel — the receiving device validates
     * the new address's shape before writing it (see ingestPacket()) and otherwise just keeps
     * using whatever onion it already had. Safe to call repeatedly (e.g. if the main onion is
     * ever re-created); it's a plain announcement, not a handshake.
     */
    fun sendMainOnionUpdate(toContactId: String) {
        scope.launch {
            val contact = contactDao.getContactById(toContactId) ?: return@launch
            // Node-Mesh contacts have no onion concept at all — nothing to announce.
            if (contact.nodeMesh) return@launch
            val contactKey = runCatching {
                android.util.Base64.decode(contact.publicKey, android.util.Base64.DEFAULT)
            }.getOrNull()?.takeIf { it.size == 32 } ?: return@launch

            val mainOnion = torManager.ensureMainOnion()
            if (!ONION_V3_REGEX.matches(mainOnion)) return@launch // Tor not ready yet — nothing valid to announce.

            val signal = (MAIN_ONION_UPDATE_SIGNAL_PREFIX + mainOnion).toByteArray(Charsets.UTF_8)
            val encrypted = runCatching {
                cryptoManager.encryptForContact(signal, contactKey)
            }.getOrNull() ?: return@launch

            if (encrypted.size > NetworkObfuscation.PACKET_SIZE - 8) return@launch
            val padded = NetworkObfuscation.padPacket(encrypted)

            deliveryQueue.add(PendingDelivery(null, toContactId, padded, contact.publicKey, myIdentity = contact.myWireIdentity))
            wakeSignal.trySend(Unit)
            flushQueue()
        }
    }

    /**
     * Tells [toContactId] to switch to this device's current *verified* onion — only ever sent
     * to `isVerified` contacts (see `ContactDetailViewModel.verify()`, which sends this once
     * right after a safety-number match), and again every time [rotateVerifiedOnionIfDue] finds
     * the address has actually rotated. [onion] is passed in rather than re-derived here so the
     * caller can self-test it first — see that function's doc comment for why. Safe to call
     * repeatedly; a lost/retried copy just re-announces the same (or by-then-current) address.
     */
    fun sendVerifiedOnionUpdate(toContactId: String, onion: String) {
        scope.launch {
            val contact = contactDao.getContactById(toContactId) ?: return@launch
            // Node-Mesh contacts have no onion concept at all — nothing to announce.
            if (contact.nodeMesh) return@launch
            val contactKey = runCatching {
                android.util.Base64.decode(contact.publicKey, android.util.Base64.DEFAULT)
            }.getOrNull()?.takeIf { it.size == 32 } ?: return@launch

            val signal = (VERIFIED_ONION_UPDATE_SIGNAL_PREFIX + onion).toByteArray(Charsets.UTF_8)
            val encrypted = runCatching {
                cryptoManager.encryptForContact(signal, contactKey)
            }.getOrNull() ?: return@launch

            if (encrypted.size > NetworkObfuscation.PACKET_SIZE - 8) return@launch
            val padded = NetworkObfuscation.padPacket(encrypted)

            deliveryQueue.add(PendingDelivery(null, toContactId, padded, contact.publicKey, myIdentity = contact.myWireIdentity))
            wakeSignal.trySend(Unit)
            flushQueue()
        }
    }

    /**
     * Called from the same periodic reachability loop [startPeriodicReachabilityCheck] already
     * runs (piggybacking its 4-minute cadence — day-granularity rotation needs no finer
     * resolution). Asks [TorManager] to rotate the verified onion if the day has changed; if it
     * just did, self-tests the new address before telling anyone about it (a derivation mistake
     * should surface as "nobody got a working address" being logged here, not as contacts
     * silently losing reachability) — reusing the same self-connect technique
     * [isSelfReachableViaTor] uses, same retry count. Announces to every `isVerified` contact
     * only on success.
     */
    private suspend fun rotateVerifiedOnionIfDue() {
        val newOnion = torManager.ensureVerifiedOnion() ?: return
        if (!selfTestOnion(newOnion)) return // Not confirmed working — leave contacts on the previous address; retried next cycle.

        val verifiedContacts = runCatching { contactDao.getAllContactsOnce() }.getOrDefault(emptyList())
            .filter { it.isVerified }
        verifiedContacts.forEach { sendVerifiedOnionUpdate(it.id, newOnion) }
    }

    /**
     * Called once, right after a contact's safety-number check succeeds (see
     * `ContactDetailViewModel.verify()`) — makes sure the verified onion exists at all yet (a
     * device's very first verification, before [rotateVerifiedOnionIfDue] has ever had a reason
     * to run) and sends it to just this one newly-verified contact immediately, rather than
     * waiting for the next periodic cycle.
     */
    fun notifyContactVerified(contactId: String) {
        scope.launch {
            val onion = torManager.verifiedOnionAddress.value
                ?: torManager.ensureVerifiedOnion()
                ?: return@launch
            if (!selfTestOnion(onion)) return@launch
            sendVerifiedOnionUpdate(contactId, onion)
        }
    }

    /** Shared by [rotateVerifiedOnionIfDue] and [notifyContactVerified] — same self-connect
     *  technique [isSelfReachableViaTor] uses, same retry count, just against one specific
     *  onion instead of every known one. */
    private suspend fun selfTestOnion(onion: String): Boolean {
        val enc = runCatching {
            cryptoManager.encryptForContact(DUMMY_SIGNAL, identityManager.myMessageKey)
        }.getOrNull() ?: return false
        if (enc.size > NetworkObfuscation.PACKET_SIZE - 8) return false
        val padded = NetworkObfuscation.padPacket(enc)
        for (attempt in 1..2) {
            if (runCatching { sendViaTor(onion, padded, "ka", SELF_CHECK_TIMEOUT_MS) }.getOrDefault(false)) return true
        }
        return false
    }

    /**
     * Announces this device's freshly-generated [com.nexonai.unpruuf.data.model.Contact.myWireIdentity]
     * to [toContactId] — called once, right after the contact is created (see QrPairViewModel).
     * From then on this contact's wire-tags use that per-contact identity instead of the global,
     * every-contact-identical [IdentityManager.userId] — see Contact.kt's doc comments for why.
     *
     * Deliberately NOT sent tagged under the new identity itself (the receiver can't recognize a
     * tag it doesn't know about yet) — omitting [PendingDelivery.myIdentity] here falls back to
     * the global [IdentityManager.userId], which the receiver still recognizes permanently via
     * [candidateIdentities]'s `remoteUserId` fallback. Safe to call repeatedly; a lost/retried
     * copy just re-announces the same value.
     */
    fun sendNewIdentitySignal(toContactId: String) {
        scope.launch {
            val contact = contactDao.getContactById(toContactId) ?: return@launch
            val identity = contact.myWireIdentity ?: return@launch
            val contactKey = runCatching {
                android.util.Base64.decode(contact.publicKey, android.util.Base64.DEFAULT)
            }.getOrNull()?.takeIf { it.size == 32 } ?: return@launch

            val signal = (NEW_IDENTITY_SIGNAL_PREFIX + identity).toByteArray(Charsets.UTF_8)
            val encrypted = runCatching {
                cryptoManager.encryptForContact(signal, contactKey)
            }.getOrNull() ?: return@launch
            if (encrypted.size > NetworkObfuscation.PACKET_SIZE - 8) return@launch
            val padded = NetworkObfuscation.padPacket(encrypted)

            // Cross-platform contacts have no onionAddress to fall back to — snapshot the
            // fallback-tagged (NOT myWireIdentity-tagged, same reasoning as above) wire ID and
            // relay candidates now, same as enqueueRatchetMessage/sendDeleteContact do.
            val crossPlatformWireId = if (contact.crossPlatform) {
                identityManager.myWireId(
                    contact.publicKey,
                    identity = identityManager.userId,
                    hour = contact.myGeneration
                )
            } else null
            val relayCandidates = contactTheirRelayList(contact)

            deliveryQueue.add(
                PendingDelivery(
                    null, toContactId, padded, contact.publicKey,
                    crossPlatformWireId = crossPlatformWireId,
                    relayCandidates = relayCandidates
                )
            )
            wakeSignal.trySend(Unit)
            flushQueue()
        }
    }

    /**
     * Manually pins which side's relay list [pollRelayOnce] uses for [contactId], overriding the
     * automatic per-period rhythm (see [IdentityManager.relayOwnerIsMine]) until switched again
     * or cleared. [toMine] = true pins this device's own relay list as the active one; false
     * pins the contact's. Mirrored to the contact with a [RELAY_OWNER_SWITCH_SIGNAL_PREFIX]
     * signal so both sides converge on the same active list without either one having to guess
     * — see that constant's doc comment for why the sent payload is already the RECEIVER's
     * perspective, not a copy of this device's own choice.
     */
    fun switchRelayOwner(contactId: String, toMine: Boolean) {
        scope.launch {
            val contact = contactDao.getContactById(contactId) ?: return@launch
            contactDao.updateManualRelayOwner(contactId, if (toMine) "mine" else "theirs")

            val contactKey = runCatching {
                android.util.Base64.decode(contact.publicKey, android.util.Base64.DEFAULT)
            }.getOrNull()?.takeIf { it.size == 32 } ?: return@launch

            val theirPerspective = if (toMine) "theirs" else "mine"
            val signal = (RELAY_OWNER_SWITCH_SIGNAL_PREFIX + theirPerspective).toByteArray(Charsets.UTF_8)
            val encrypted = runCatching {
                cryptoManager.encryptForContact(signal, contactKey)
            }.getOrNull() ?: return@launch
            if (encrypted.size > NetworkObfuscation.PACKET_SIZE - 8) return@launch
            val padded = NetworkObfuscation.padPacket(encrypted)

            val crossPlatformWireId = if (contact.crossPlatform) {
                identityManager.myWireId(
                    contact.publicKey,
                    identity = contact.myWireIdentity ?: identityManager.userId,
                    hour = contact.myGeneration
                )
            } else null
            val relayCandidates = contactTheirRelayList(contact)

            deliveryQueue.add(
                PendingDelivery(
                    null, contactId, padded, contact.publicKey,
                    crossPlatformWireId = crossPlatformWireId,
                    relayCandidates = relayCandidates
                )
            )
            wakeSignal.trySend(Unit)
            flushQueue()
        }
    }

    /**
     * unpruuf Business / Node-Mesh only (NODE_MESH_SPEC.md §6) — tells [toContactId] that one of
     * my own nodes moved from [oldAddress] to [newAddress], so they update which address they
     * poll it at. Call [NodeMeshManager.migrateMyNode] to update the local config FIRST, then
     * this — sending through the normal delivery queue, which already tries every currently-
     * configured own node and tolerates individual failures (see [depositToOwnNodes]),
     * automatically satisfies §6 point 1 ("never announce over the node that's changing") for
     * free: if the new address isn't live yet, that one deposit attempt just fails silently
     * while the announcement still gets through via whichever other own nodes are still up — no
     * special-casing needed here for which specific node the announcement travels over.
     */
    fun sendNodeMigrationSignal(toContactId: String, oldAddress: String, newAddress: String) {
        scope.launch {
            val contact = contactDao.getContactById(toContactId) ?: return@launch
            if (!contact.nodeMesh) return@launch
            val contactKey = runCatching {
                android.util.Base64.decode(contact.publicKey, android.util.Base64.DEFAULT)
            }.getOrNull()?.takeIf { it.size == 32 } ?: return@launch

            val oldConn = NodeMeshManager.buildAddressConnectionString(oldAddress)
            val newConn = NodeMeshManager.buildAddressConnectionString(newAddress)
            val signal = (NODE_MIGRATE_SIGNAL_PREFIX + "$oldConn;$newConn").toByteArray(Charsets.UTF_8)
            val encrypted = runCatching {
                cryptoManager.encryptForContact(signal, contactKey)
            }.getOrNull() ?: return@launch
            if (encrypted.size > NetworkObfuscation.PACKET_SIZE - 8) return@launch
            val padded = NetworkObfuscation.padPacket(encrypted)

            deliveryQueue.add(
                PendingDelivery(
                    null, toContactId, padded, contact.publicKey,
                    nodeMeshRoutingTag = nodeMeshTagFor(contact)
                )
            )
            wakeSignal.trySend(Unit)
            flushQueue()
        }
    }

    /** Convenience wrapper around [sendNodeMigrationSignal] — the typical real usage is "one of
     *  my nodes moved, tell every Node-Mesh contact who might be polling it", not one contact
     *  at a time. */
    fun sendNodeMigrationSignalToAll(oldAddress: String, newAddress: String) {
        scope.launch {
            val contacts = runCatching { contactDao.getAllContactsOnce() }.getOrDefault(emptyList())
                .filter { it.nodeMesh }
            for (c in contacts) sendNodeMigrationSignal(c.id, oldAddress, newAddress)
        }
    }

    /**
     * Temp Node (NODE_MESH_SPEC.md §7 step 4) — announces this device's freshly registered Temp
     * Node at [address] to [toContactId]. Sent through the normal delivery queue, same as
     * [sendNodeMigrationSignal] — at the moment this is called (right after
     * ContactDao.updateTempNode, which always starts tempNodeActive=false), [depositForNodeMesh]
     * is still in its "not yet confirmed" dual-deposit posture, so this announcement goes out via
     * the standard pool (§7 step 4's requirement) — it may ALSO reach the Temp Node itself via
     * that same dual-deposit, which is harmless redundancy (ingestPacket's existing dedup handles
     * a message arriving twice, the same way multi-node standard deposits always could), not a
     * violation of the "never bootstrap over the still-unproven node" intent that step actually
     * cares about.
     */
    fun sendTempNodeAnnouncement(toContactId: String, address: String) {
        scope.launch {
            val contact = contactDao.getContactById(toContactId) ?: return@launch
            if (!contact.nodeMesh) return@launch
            val contactKey = runCatching {
                android.util.Base64.decode(contact.publicKey, android.util.Base64.DEFAULT)
            }.getOrNull()?.takeIf { it.size == 32 } ?: return@launch

            val signal = (TEMP_NODE_SIGNAL_PREFIX + NodeMeshManager.buildAddressConnectionString(address))
                .toByteArray(Charsets.UTF_8)
            val encrypted = runCatching {
                cryptoManager.encryptForContact(signal, contactKey)
            }.getOrNull() ?: return@launch
            if (encrypted.size > NetworkObfuscation.PACKET_SIZE - 8) return@launch
            val padded = NetworkObfuscation.padPacket(encrypted)

            deliveryQueue.add(
                PendingDelivery(
                    null, toContactId, padded, contact.publicKey,
                    nodeMeshRoutingTag = nodeMeshTagFor(contact)
                )
            )
            wakeSignal.trySend(Unit)
            flushQueue()
        }
    }

    /**
     * Temp Node (NODE_MESH_SPEC.md §7 step 8) — explicit clean shutdown. Call
     * [ContactDao.clearTempNode] to drop the local registration FIRST, then this, so the
     * announcement itself is guaranteed to go out via the standard pool (once tempNodeAddress is
     * null, [depositForNodeMesh] can't route it through the now-decommissioned Temp Node even
     * opportunistically) — same "ordering does the work" reasoning [sendNodeMigrationSignal]'s
     * doc comment describes for its own case.
     */
    fun sendTempNodeDeactivate(toContactId: String) {
        scope.launch {
            val contact = contactDao.getContactById(toContactId) ?: return@launch
            if (!contact.nodeMesh) return@launch
            val contactKey = runCatching {
                android.util.Base64.decode(contact.publicKey, android.util.Base64.DEFAULT)
            }.getOrNull()?.takeIf { it.size == 32 } ?: return@launch

            val signal = TEMP_NODE_OFF_SIGNAL_PREFIX.toByteArray(Charsets.UTF_8)
            val encrypted = runCatching {
                cryptoManager.encryptForContact(signal, contactKey)
            }.getOrNull() ?: return@launch
            if (encrypted.size > NetworkObfuscation.PACKET_SIZE - 8) return@launch
            val padded = NetworkObfuscation.padPacket(encrypted)

            deliveryQueue.add(
                PendingDelivery(
                    null, toContactId, padded, contact.publicKey,
                    nodeMeshRoutingTag = nodeMeshTagFor(contact)
                )
            )
            wakeSignal.trySend(Unit)
            flushQueue()
        }
    }

    /**
     * §7 step 7's heartbeat: pings every contact's registered Temp Node on a fixed interval and
     * drives [Contact.tempNodeActive] off consecutive successes/failures — one flag, one
     * transition rule, covering both first-activation (a successful *deposit* already flips it in
     * [depositForNodeMesh]) and any later resume after an automatic fallback (a successful
     * *heartbeat* here flips it right back). §7's own wording only gives "first successful
     * message" as one example of confirmation ("z. B."), not an exclusive mechanism, so treating a
     * successful health probe as equally valid confirmation for the resume case is a deliberate,
     * spec-consistent reading, not an invented rule. A local, in-memory failure counter (not
     * persisted to the Contact row) is enough — this loop is the only writer of
     * [Contact.tempNodeActive]'s failure path, so nothing else needs to observe the intermediate
     * strike count between 1 and [TEMP_NODE_HEARTBEAT_FAILURE_THRESHOLD].
     */
    private fun startTempNodeHeartbeat() {
        val consecutiveFailures = ConcurrentHashMap<String, Int>()
        scope.launch {
            while (isActive) {
                delay(TEMP_NODE_HEARTBEAT_INTERVAL_MS)
                if (!torManager.isReady.value) continue
                val contacts = runCatching { contactDao.getAllContactsOnce() }.getOrDefault(emptyList())
                    .filter { it.nodeMesh && it.tempNodeAddress != null }
                for (c in contacts) {
                    val address = c.tempNodeAddress ?: continue
                    val alive = runCatching { nodeMeshClient.healthCheck(address) }.getOrDefault(false)
                    if (alive) {
                        consecutiveFailures.remove(c.id)
                        if (!c.tempNodeActive) contactDao.setTempNodeActive(c.id, true)
                    } else {
                        val failures = (consecutiveFailures[c.id] ?: 0) + 1
                        consecutiveFailures[c.id] = failures
                        if (failures >= TEMP_NODE_HEARTBEAT_FAILURE_THRESHOLD && c.tempNodeActive) {
                            contactDao.setTempNodeActive(c.id, false)
                        }
                    }
                }
            }
        }
    }

    /**
     * Cross-platform (iOS-interop) contacts only — see CROSS_PLATFORM_PLAN.md. Manually rotates
     * this contact's outgoing wire tag: sends `UNPRUUF_WECHSEL_V1:<generation>:<relay>` under
     * the CURRENT, about-to-be-stale generation (the recipient doesn't know about the rotation
     * yet, so both the packet's wire TAG and its payload must still use the old value — this is
     * why the send happens as one direct, synchronous relay push here rather than through the
     * general [deliveryQueue], where [attemptDelivery] would read whatever [Contact.myGeneration]
     * happens to be in the DB AT THAT LATER MOMENT — bumping it first, then letting the queue
     * pick it up asynchronously, risks the queue reading the ALREADY-bumped value and mistagging
     * the very packet meant to announce it). Only bumps [Contact.myGeneration] locally once the
     * push has actually succeeded; on failure this is a no-op the user can just retry by pressing
     * Wechsel again — a manual, occasional action, not the mainline message path, so no queue/
     * retry-backoff machinery is needed here. Does NOT change the relay itself (temp-node swap
     * is out of scope for this delivery — see CROSS_PLATFORM_PLAN.md's "genuinely new, still not
     * built" list) — only the generation counter advances.
     */
    fun wechsel(contactId: String) {
        scope.launch {
            val contact = contactDao.getContactById(contactId) ?: return@launch
            if (!contact.crossPlatform) return@launch
            // Wechsel announces a switch to ONE specific relay — my current primary, not the
            // whole pool (see ControlSignals/PairingPayload doc comments: the Wechsel signal
            // payload has always been "<generation>:<one relay>", never a list).
            val myRelay = contactMyRelayList(contact).firstOrNull() ?: return@launch
            if (!torManager.isReady.value) return@launch
            val theirCandidates = contactTheirRelayList(contact).mapNotNull { RelayManager.parseConnectionString(it) }
            if (theirCandidates.isEmpty()) return@launch
            val contactKey = runCatching {
                android.util.Base64.decode(contact.publicKey, android.util.Base64.DEFAULT)
            }.getOrNull()?.takeIf { it.size == 32 } ?: return@launch

            val oldGeneration = contact.myGeneration
            val signal = (WECHSEL_SIGNAL_PREFIX + oldGeneration + ":" + myRelay).toByteArray(Charsets.UTF_8)
            val encrypted = runCatching {
                cryptoManager.encryptForContact(signal, contactKey)
            }.getOrNull() ?: return@launch
            if (encrypted.size > NetworkObfuscation.PACKET_SIZE - 8) return@launch
            val padded = NetworkObfuscation.padPacket(encrypted)
            val wireId = identityManager.myWireId(
                contact.publicKey,
                identity = contact.myWireIdentity ?: identityManager.userId,
                hour = oldGeneration
            )

            // Try each of the contact's advertised relays in order, same failover posture as
            // attemptDelivery — this send itself is a relay push like any other.
            val sent = theirCandidates.any { parsed -> relayClient.push(parsed.address, parsed.authToken, wireId, padded) }
            if (sent) contactDao.bumpMyGeneration(contactId)
        }
    }

    /**
     * Löscht den Kontakt beidseitig: schickt dem Peer das Löschsignal (mit
     * unbegrenzten Wiederholungen über die Warteschlange) und entfernt den
     * Kontakt sofort lokal. Onion + Key werden vor der lokalen Löschung
     * erfasst, damit die Zustellung auch danach noch funktioniert.
     *
     * For a cross-platform (iOS-interop) contact, the wire ID and relay candidates are also
     * captured here, before the local removal below — see PendingDelivery's and attemptDelivery's
     * doc comments for the real bug this fixes: without this, the enqueued signal's delivery
     * attempt used to depend on a live contactDao lookup that this same function was about to
     * make fail, forever, by design (that's what "delete" does).
     */
    fun sendDeleteContact(toContactId: String) {
        scope.launch {
            val contact = contactDao.getContactById(toContactId) ?: return@launch
            val onion = contact.onionAddress
            val contactKey = runCatching {
                android.util.Base64.decode(contact.publicKey, android.util.Base64.DEFAULT)
            }.getOrNull()?.takeIf { it.size == 32 }

            if (contactKey != null) {
                val encrypted = runCatching {
                    cryptoManager.encryptForContact(DELETE_CONTACT_SIGNAL, contactKey)
                }.getOrNull()
                if (encrypted != null && encrypted.size <= NetworkObfuscation.PACKET_SIZE - 8) {
                    val padded = NetworkObfuscation.padPacket(encrypted)
                    val crossPlatformWireId = if (contact.crossPlatform) {
                        identityManager.myWireId(
                            contact.publicKey,
                            identity = contact.myWireIdentity ?: identityManager.userId,
                            hour = contact.myGeneration
                        )
                    } else null
                    val relayCandidates = contactTheirRelayList(contact)
                    deliveryQueue.add(
                        PendingDelivery(
                            null, toContactId, padded, contact.publicKey,
                            myIdentity = contact.myWireIdentity, onionOverride = onion,
                            crossPlatformWireId = crossPlatformWireId,
                            relayCandidates = relayCandidates,
                            nodeMeshRoutingTag = nodeMeshTagFor(contact)
                        )
                    )
                    wakeSignal.trySend(Unit)
                    flushQueue()
                }
            }

            // Lokal sofort entfernen — der Nutzer soll nicht warten müssen.
            messageStore.zeroizeContact(toContactId)
            contactDao.deleteById(toContactId)
            identityManager.removeContactOnionPrivKey(toContactId)
            ratchetSessionManager.deleteSession(toContactId)
            // Any earlier, still-undelivered items for this contact (e.g. a mid-transfer
            // image) would otherwise sit in the queue forever: once the contact row is
            // gone, attemptDelivery can't resolve an onion address for them and they're
            // retried on every backoff round with no path to ever succeed.
            deliveryQueue.removeAll { it.contactId == toContactId }
        }
    }

    // Einzelner Worker arbeitet die Warteschlange ab. Läuft bis alles
    // zugestellt ist; zwischen erfolglosen Runden 20s Pause bzw. Warten
    // auf Tor-Reconnect.
    //
    // Ordering within one contact, per round: all SINGLE-packet items (texts, control
    // signals) first, THEN chunk trains — previously a queued image/file blocked every
    // text behind it for the whole transfer (one ACK round-trip per 4 KB chunk; reported
    // for real as "everything hung ~5 minutes after sending an image" on the slow
    // Wi‑Fi → mobile direction). Reordering is safe: each text is its own ratchet message
    // (the receiver's skipped-key cache covers it overtaking a still-uploading transfer),
    // and chunk reassembly is index-based and per-message. Within each class, queue
    // order — and therefore chunk prefix order — is preserved.
    private fun flushQueue() {
        if (!flushing.compareAndSet(false, true)) return
        scope.launch {
            try {
                // Progressiver Backoff: schnell starten (3s), langsam wachsen (max 15s),
                // bei jedem Fortschritt zurücksetzen. Unterbrechbar durch neue Nachrichten.
                var backoff = BACKOFF_INITIAL_MS
                while (deliveryQueue.isNotEmpty() && isActive) {
                    var anyDelivered = false
                    val failedContacts = mutableSetOf<String>()
                    // Snapshot in queue order; items enqueued during this round are
                    // picked up by the next round (the while-loop re-snapshots, and the
                    // trailing flushQueue() restart covers a finished worker).
                    val snapshot = deliveryQueue.toList()

                    // Phase 1: single-packet items.
                    for (item in snapshot) {
                        if (item.isChunk || item.contactId in failedContacts) continue
                        if (attemptDelivery(item)) {
                            deliveryQueue.remove(item)
                            anyDelivered = true
                            item.messageId?.let { id -> _deliveredIds.update { it + id } }
                        } else {
                            failedContacts.add(item.contactId)
                        }
                    }

                    // Phase 2: chunk trains, grouped per contact, windowed (see
                    // attemptChunkTrainDelivery). Delivery is strictly prefix-ordered
                    // within a contact's train, so the messageId-on-last-chunk contract
                    // holds unchanged.
                    val chunksByContact = LinkedHashMap<String, MutableList<PendingDelivery>>()
                    for (item in snapshot) {
                        if (!item.isChunk) continue
                        chunksByContact.getOrPut(item.contactId) { mutableListOf() }.add(item)
                    }
                    for ((contactId, train) in chunksByContact) {
                        if (contactId in failedContacts) continue
                        val delivered = attemptChunkTrainDelivery(contactId, train)
                        if (delivered > 0) anyDelivered = true
                        train.take(delivered).forEach { item ->
                            deliveryQueue.remove(item)
                            item.messageId?.let { id -> _deliveredIds.update { it + id } }
                        }
                        if (delivered < train.size) failedContacts.add(contactId)
                    }

                    if (anyDelivered) backoff = BACKOFF_INITIAL_MS
                    if (deliveryQueue.isNotEmpty()) {
                        if (!torManager.isReady.value) {
                            withTimeoutOrNull(120_000) {
                                torManager.isReady.filter { it }.first()
                            }
                        } else if (!anyDelivered) {
                            // Warte backoff — wird aber sofort durch eine neue
                            // Nachricht (wakeSignal) unterbrochen.
                            withTimeoutOrNull(backoff) { wakeSignal.receive() }
                            backoff = nextBackoff(backoff)
                        }
                    }
                }
            } finally {
                flushing.set(false)
            }
            if (deliveryQueue.isNotEmpty()) flushQueue()
        }
    }

    /**
     * Delivers a contact's queued chunk items (in order) and returns how many were
     * delivered FROM THE FRONT — a strict prefix, never a scattered subset. LAN and the
     * relay fallback stay per-item (LAN round-trips are local and cheap; the relay is an
     * HTTP mailbox), but the Tor path sends windows of [CHUNK_WINDOW] chunks per ACK
     * round instead of one — over a high-latency mobile path that's the difference
     * between a photo taking minutes and taking a fraction of that. Mixed-transport
     * delivery of one message was already made safe when the relay fallback was extended
     * to chunks (explicit per-chunk indexes — see ChunkReassembly).
     */
    private suspend fun attemptChunkTrainDelivery(contactId: String, train: List<PendingDelivery>): Int {
        var delivered = 0

        // Cross-platform (iOS-interop) items carry their wire ID/relay candidates from enqueue
        // time (see PendingDelivery's and attemptDelivery's doc comments) — checked BEFORE any
        // contactDao lookup, for the same reason attemptDelivery does: a live lookup silently
        // breaks this whole branch once the contact row is gone, which a still-queued chunk train
        // can easily outlive (e.g. the contact is deleted mid-transfer).
        if (train.firstOrNull()?.crossPlatformWireId != null) {
            if (!torManager.isReady.value) return delivered
            // Try each of the contact's advertised relays per chunk, same failover posture as
            // attemptDelivery — safe to fail over mid-train, since reassembly is index-based and
            // connection-agnostic (a chunk can land via a different candidate than its siblings).
            val candidates = train.first().relayCandidates.orEmpty().mapNotNull { RelayManager.parseConnectionString(it) }
            if (candidates.isEmpty()) return delivered
            while (delivered < train.size) {
                val item = train[delivered]
                val wireId = item.crossPlatformWireId ?: break
                val pushed = candidates.any { parsed -> relayClient.push(parsed.address, parsed.authToken, wireId, item.padded) }
                if (!pushed) break
                delivered++
            }
            return delivered
        }

        // unpruuf Business / Node-Mesh — same reasoning as attemptDelivery's matching branch:
        // checked before any contactDao lookup, using the tag snapshotted at enqueue time. Every
        // chunk of a train shares the same routing tag (it's per-epoch, not per-packet), so this
        // reads it once from the train's first item rather than re-deriving it per chunk.
        if (train.firstOrNull()?.nodeMeshRoutingTag != null) {
            if (!torManager.isReady.value) return delivered
            val tag = train.first().nodeMeshRoutingTag!!
            while (delivered < train.size) {
                if (!depositForNodeMesh(contactId, tag, train[delivered].padded)) break
                delivered++
            }
            return delivered
        }

        val contact = contactDao.getContactById(contactId)

        // Global relay-mode override (RelayManager.RelayMode) — MANDATORY skips LAN/Tor for
        // every contact, same shape as the cross-platform branch above, meant for switching
        // back and forth to test the relay path in isolation. AUTO does the same, but only for
        // trains over RELAY_SIZE_THRESHOLD_BYTES — otherwise falls through to the normal
        // LAN → Tor-direct → relay-fallback order below.
        val totalBytes = train.sumOf { it.padded.size }
        val forceRelay = relayManager.isMandatory() ||
            (relayManager.getMode() == RelayManager.RelayMode.AUTO && totalBytes > RELAY_SIZE_THRESHOLD_BYTES)
        if (forceRelay) {
            if (!torManager.isReady.value) return delivered
            while (delivered < train.size) {
                val item = train[delivered]
                val wireId = identityManager.myWireId(item.wireKeyB64, identity = item.myIdentity ?: identityManager.userId)
                val pushed = pushToRelays(relayTargetsFor(item), wireId, item.padded)
                if (!pushed) break
                delivered++
            }
            return delivered
        }

        // LAN discovery still broadcasts/matches on the announcing device's global
        // IdentityManager.userId (see registerService/discoverPeers) — Contact.id is now a
        // local-only random UUID (see its doc comment), so the lookup key is remoteUserId, not
        // contactId/id, or LAN delivery would never match anything.
        val lanPeer = contact?.remoteUserId?.takeIf { it.isNotBlank() }?.let { lanPeers[it.take(8)] }
        if (lanPeer != null) {
            while (delivered < train.size) {
                val item = train[delivered]
                val wireId = identityManager.myWireId(item.wireKeyB64, identity = item.myIdentity ?: identityManager.userId)
                if (!sendViaTcp(lanPeer.first, lanPeer.second, item.padded, wireId)) break
                delivered++
            }
            if (delivered == train.size) return delivered
        }

        if (torManager.isReady.value) {
            val onion = train[delivered].onionOverride ?: contact?.onionAddress
            if (onion != null && onion.endsWith(".onion")) {
                while (delivered < train.size) {
                    val window = train.subList(delivered, minOf(delivered + CHUNK_WINDOW, train.size))
                    val acked = sendWindowViaTorPooled(contactId, onion, window)
                    delivered += acked
                    if (acked < window.size) break
                }
                if (delivered == train.size) return delivered
            }
        }

        if (torManager.isReady.value) {
            while (delivered < train.size) {
                val item = train[delivered]
                val wireId = identityManager.myWireId(item.wireKeyB64, identity = item.myIdentity ?: identityManager.userId)
                val pushed = pushToRelays(relayTargetsFor(item), wireId, item.padded)
                if (!pushed) break
                delivered++
            }
        }

        return delivered
    }

    // Delivers one SINGLE-packet item (texts, control signals). Chunk items go through
    // attemptChunkTrainDelivery above instead — same LAN → Tor → relay order, but windowed.
    /**
     * Where this item's relay copy goes: the relays the contact advertised at pairing time
     * (v5 and newer — see QrPairingPayload's `n` field), else this device's own globally
     * configured relay. That global fallback is all a pre-v5 pairing ever had, and it only
     * delivered when both sides happened to have configured the very same relay — which is
     * exactly the gap the advertised list closes.
     */
    private fun relayTargetsFor(item: PendingDelivery): List<RelayManager.ParsedConnection> {
        val advertised = item.relayCandidates.orEmpty().mapNotNull { RelayManager.parseConnectionString(it) }
        if (advertised.isNotEmpty()) return advertised
        if (!relayManager.isUsable()) return emptyList()
        return listOf(RelayManager.ParsedConnection(relayManager.getRelayOnion(), relayManager.getAuthToken()))
    }

    /** Tries each target in order, stopping at the first success — a retry on the next candidate
     *  after one fails is "try somewhere else", not a double-send. */
    private suspend fun pushToRelays(
        targets: List<RelayManager.ParsedConnection>,
        wireId: String,
        padded: ByteArray
    ): Boolean = targets.any { relayClient.push(it.address, it.authToken, wireId, padded) }

    /**
     * This item's Node-Mesh routing tag, snapshotted at enqueue time — see
     * [PendingDelivery.nodeMeshRoutingTag]'s doc comment for why a live lookup can't be trusted
     * here. Null for a non-Node-Mesh contact, or one whose routing seed hasn't been learned
     * (shouldn't happen post-pairing, but a QR that failed to parse [theirNodeMeshRoutingSeed]
     * shouldn't crash the send path either).
     */
    private fun nodeMeshTagFor(contact: com.nexonai.unpruuf.data.model.Contact): String? {
        if (!contact.nodeMesh) return null
        val seed = contact.theirNodeMeshRoutingSeed.takeIf { it.isNotBlank() } ?: return null
        return identityManager.nodeMeshRoutingTag(seed, identityManager.nodeMeshEpoch(NODE_MESH_ROTATION_INTERVAL_MS))
    }

    /**
     * Deposits [padded] under [routingTag] to EVERY reachable node in this device's OWN pool —
     * NODE_MESH_SPEC.md §5's "legt Nachrichten bei ALLEN erreichbaren eigenen Nodes ab", a
     * deliberately different posture from [pushToRelays]'s first-success-wins: redundancy here
     * means the message already sits on every node BEFORE any of them might go down, not that a
     * failover is attempted only after one target fails. Read live from [nodeMeshManager] rather
     * than snapshotted — unlike a contact's routing tag, this device's own node pool never
     * depends on the CONTACT's row existing, so there's no "deleted mid-flight" risk to guard
     * against here the way [nodeMeshTagFor] does.
     */
    private suspend fun depositToOwnNodes(routingTag: String, padded: ByteArray): Boolean {
        val pool = nodeMeshManager.getMyNodePool()
        if (pool.isEmpty()) return false
        var anySucceeded = false
        for (node in pool) {
            if (nodeMeshClient.deposit(node.address, node.ownerSecret, routingTag, padded)) anySucceeded = true
        }
        return anySucceeded
    }

    /**
     * Routes a Node-Mesh deposit through [contactId]'s Temp Node override (NODE_MESH_SPEC.md §7)
     * when one is registered, falling back to [depositToOwnNodes] otherwise — including when
     * [contactId]'s row is already gone (e.g. a still-queued item outliving sendDeleteContact,
     * same scenario [PendingDelivery]'s doc comment describes), since the standard pool needs no
     * contact row to reach. Unlike [depositToOwnNodes] this DOES need a live lookup — a Temp Node
     * is scoped to one contact, not global to this device — but degrading to the always-safe
     * standard pool when that lookup comes back null keeps this from ever being a hard failure
     * point the way the cross-platform/Node-Mesh branches above are careful to avoid.
     */
    private suspend fun depositForNodeMesh(contactId: String, routingTag: String, padded: ByteArray): Boolean {
        val contact = contactDao.getContactById(contactId)
        val tempAddress = contact?.tempNodeAddress
        val tempSecret = contact?.tempNodeOwnerSecret
        if (contact == null || tempAddress == null || tempSecret == null) {
            return depositToOwnNodes(routingTag, padded)
        }
        val tempSucceeded = nodeMeshClient.deposit(tempAddress, tempSecret, routingTag, padded)
        if (tempSucceeded && !contact.tempNodeActive) {
            // First successful deposit via the Temp Node — §7 step 6's confirmation ("erste
            // erfolgreiche eigene Nachricht über den Temp Node in diese Richtung"). From here on
            // this contact's outgoing traffic uses the Temp Node exclusively (see the ACTIVE
            // branch below), until startTempNodeHeartbeat() sees enough consecutive failures to
            // flip it back.
            contactDao.setTempNodeActive(contactId, true)
        }
        if (contact.tempNodeActive) {
            // Confirmed/active: Temp Node carries this one chat's outgoing traffic exclusively
            // (§7 step 6's "Standard-Nodes ... pausieren"). Still falls back to the standard pool
            // for THIS one message if the deposit above failed, so a message isn't lost in the
            // gap before the heartbeat loop notices an outage and flips the state back — the
            // state itself is heartbeat-governed, not decided per-send.
            return tempSucceeded || depositToOwnNodes(routingTag, padded)
        }
        // Registered but not yet confirmed: dual-deposit, standard nodes stay the reliable path
        // until the Temp Node has proven itself reachable at least once.
        val standardSucceeded = depositToOwnNodes(routingTag, padded)
        return tempSucceeded || standardSucceeded
    }

    private suspend fun attemptDelivery(item: PendingDelivery): Boolean {
        // Cross-platform (iOS-interop) items carry everything they need from enqueue time —
        // checked BEFORE any contactDao lookup, deliberately. Real bug found (mirrors the
        // identical class of bug already found and fixed in iOS's own RelayService.swift): this
        // branch used to gate on a live `contactDao.getContactById(item.contactId)?.crossPlatform
        // == true` check, which silently evaluates to false once the contact row is gone —
        // `null?.crossPlatform` is null, not true. sendDeleteContact() enqueues the delete signal
        // and then immediately removes the contact row in the same coroutine, so by the time the
        // delivery worker actually got to this item, the contact was already gone and this whole
        // branch was skipped — falling through to the onion/global-relay path below, which has no
        // usable destination for an iOS peer (no onion address, and the global relay is a
        // different, usually-unconfigured relay). The delete signal never actually reached the
        // other device, so the contact was removed on this phone but never on the iOS one. Fixed
        // by snapshotting the wire ID and relay candidates at enqueue time (see PendingDelivery's
        // doc comment) instead of re-deriving them here from a contact row that may no longer
        // exist.
        if (item.crossPlatformWireId != null) {
            if (!torManager.isReady.value) return false
            // Try each of the contact's advertised relays in order, stopping at the first
            // success — a retry on a different candidate after one fails is just "try somewhere
            // else", not a double-send.
            val candidates = item.relayCandidates.orEmpty().mapNotNull { RelayManager.parseConnectionString(it) }
            if (candidates.isEmpty()) return false
            return candidates.any { parsed -> relayClient.push(parsed.address, parsed.authToken, item.crossPlatformWireId, item.padded) }
        }

        // unpruuf Business / Node-Mesh — checked before any contactDao lookup, same reasoning as
        // the cross-platform branch above: item.nodeMeshRoutingTag was snapshotted at enqueue
        // time precisely so this branch keeps working even if the contact row is already gone
        // (sendDeleteContact). No LAN/Tor/legacy-relay attempt at all for these — see
        // NODE_MESH_SPEC.md §0/§1, this is a fully separate, mandatory-node-only transport.
        if (item.nodeMeshRoutingTag != null) {
            if (!torManager.isReady.value) return false
            return depositForNodeMesh(item.contactId, item.nodeMeshRoutingTag, item.padded)
        }

        val contact = contactDao.getContactById(item.contactId)

        // Rotierende Wire-ID für diesen Kontakt zum Sendezeitpunkt ableiten.
        val wireId = identityManager.myWireId(item.wireKeyB64, identity = item.myIdentity ?: identityManager.userId)

        // Global relay-mode override — same MANDATORY early-return as attemptChunkTrainDelivery.
        // Single packets are always far under RELAY_SIZE_THRESHOLD_BYTES, so AUTO never forces
        // relay here — only MANDATORY does.
        if (relayManager.isMandatory()) {
            if (!torManager.isReady.value) return false
            return pushToRelays(relayTargetsFor(item), wireId, item.padded)
        }

        // See attemptChunkTrainDelivery's matching comment — LAN matching key is remoteUserId,
        // not the local-only contactId/id.
        val lanPeer = contact?.remoteUserId?.takeIf { it.isNotBlank() }?.let { lanPeers[it.take(8)] }
        if (lanPeer != null && sendViaTcp(lanPeer.first, lanPeer.second, item.padded, wireId)) return true

        if (torManager.isReady.value) {
            val onion = item.onionOverride ?: contact?.onionAddress
            if (onion != null && onion.endsWith(".onion")) {
                if (!com.nexonai.unpruuf.BuildConfig.DEBUG) {
                    if (sendViaTorPooled(item.contactId, onion, item.padded, wireId)) return true
                } else {
                    // Debug-only, local-only timing: how long does the Tor send actually take,
                    // and was the circuit pre-warmed (see startActiveChatWarmup)? Never
                    // transmitted anywhere — logcat only — this exists purely to replace guesswork
                    // about warm-up interval tuning with real numbers from real devices.
                    val warm = isWarmPath(item.contactId)
                    val startedAt = System.currentTimeMillis()
                    val ok = sendViaTorPooled(item.contactId, onion, item.padded, wireId)
                    val elapsedMs = System.currentTimeMillis() - startedAt
                    android.util.Log.d(
                        "P2PNetworkManager",
                        "sendViaTorPooled: contact=${item.contactId.take(8)} warm=$warm ok=$ok elapsedMs=$elapsedMs"
                    )
                    if (ok) return true
                }
            }
        }

        // Direct delivery failed (peer offline/unreachable) — fall back to the relay mailbox,
        // tagged with the same wire ID the direct path would have used, if the user opted in.
        if (torManager.isReady.value) {
            return pushToRelays(relayTargetsFor(item), wireId, item.padded)
        }

        return false
    }

    // Schreibt das Paket (mit rotierender Wire-ID) und wartet auf das ACK.
    // Erst das ACK zählt als Zustellung — flush() allein garantiert nichts.
    private fun sendPacket(socket: Socket, padded: ByteArray, wireId: String): Boolean =
        runCatching {
            socket.use { s -> sendPacketReusable(s, padded, wireId) }
        }.getOrDefault(false)

    // Same write-then-await-ACK exchange as sendPacket, but WITHOUT closing the socket
    // afterwards — the building block of the pooled (reused-connection) send path below.
    // Throws instead of swallowing errors so the pool can tell a dead connection apart
    // from a delivered packet.
    private fun sendPacketReusable(socket: Socket, padded: ByteArray, wireId: String): Boolean {
        DataOutputStream(socket.getOutputStream()).apply {
            writeUTF(wireId)
            writeInt(padded.size)
            write(padded)
            flush()
        }
        return socket.getInputStream().read() == ACK
    }

    private fun sendViaTcp(host: String, port: Int, padded: ByteArray, wireId: String): Boolean =
        runCatching {
            val socket = Socket(host, port).apply { soTimeout = 15_000 }
            sendPacket(socket, padded, wireId)
        }.getOrDefault(false)

    private fun openTorSocket(onionAddress: String, timeoutMs: Int): Socket {
        val proxy = Proxy(Proxy.Type.SOCKS, InetSocketAddress("127.0.0.1", torManager.socksPort))
        val socket = Socket(proxy).apply { soTimeout = timeoutMs }
        try {
            socket.connect(InetSocketAddress.createUnresolved(onionAddress, ONION_PORT), timeoutMs)
        } catch (e: Exception) {
            // connect() can throw after the underlying fd is already allocated (timeout,
            // refused, SOCKS failure) — close it here or every failed attempt on these
            // hot, frequently-retried paths leaks a socket/fd.
            socket.runCatching { close() }
            throw e
        }
        return socket
    }

    // One-shot Tor send: fresh connection, one packet, close. Still the right tool for the
    // self-connect probes (keep-alive + reachability check) — those exist precisely to test
    // whether a NEW connection through the hidden service works right now, which a pooled,
    // already-established connection would mask. Contact traffic uses sendViaTorPooled below.
    private fun sendViaTor(onionAddress: String, padded: ByteArray, wireId: String, timeoutMs: Int = 40_000): Boolean =
        runCatching {
            // 40s default is for PROBES (keep-alive/self-check) — long enough that a
            // healthy-but-slow mobile self-connect isn't misjudged (>25s is common), short
            // enough that probe loops keep their cadence. Contact traffic goes through the
            // pooled paths, which use the longer TOR_CONNECT_TIMEOUT_MS for fresh connects.
            sendPacket(openTorSocket(onionAddress, timeoutMs), padded, wireId)
        }.getOrDefault(false)

    // ─── Pooled per-contact Tor connections ─────────────────────────────────
    // Every send used to open a fresh Tor connection: SOCKS connect → onion rendezvous →
    // one packet → close. The rendezvous is the expensive part (up to ~20s cold, seconds
    // even warm) and was paid PER PACKET — per message, and per 4096-byte chunk of a file.
    // The receive loop (receiveMessage) now serves many packets per connection, so the
    // send side keeps ONE connection per contact open and reuses it; the active chat's 20s
    // warm-up dummies ride the same connection and double as its keep-open heartbeat.
    // Follow-up messages then cost one ACK round-trip instead of a fresh rendezvous, and a
    // chunked file reuses one connection for all its chunks instead of ~one rendezvous per
    // 4 KB. A stale pooled connection (receiver idled it out, network changed, peer
    // restarted) is detected by its failed exchange and replaced with a fresh connection
    // within the SAME send attempt — so the failure mode is exactly the old behavior (one
    // fresh connection per packet), never worse. The whole pool is dropped on every
    // networkChanged (those sockets ran through circuits that no longer exist).
    private val torConnections = ConcurrentHashMap<String, Socket>()
    private val torConnectionLocks = ConcurrentHashMap<String, Mutex>()

    private suspend fun sendViaTorPooled(contactId: String, onionAddress: String, padded: ByteArray, wireId: String): Boolean {
        // Per-contact lock: the delivery queue, warm-up dummies and cover traffic all send
        // to the same contact from different coroutines — one exchange at a time per
        // connection, or interleaved writes would corrupt the stream.
        val lock = torConnectionLocks.getOrPut(contactId) { Mutex() }
        return lock.withLock {
            torConnections.remove(contactId)?.let { existing ->
                // Over an already-established connection the ACK is one round-trip — no
                // rendezvous. The 40s timeout exists for cold connection SETUP; keeping it
                // here would let one silently-dead pooled socket stall this attempt for
                // 40s before the fresh-connection fallback below even starts. 15s is still
                // generous for a live circuit's round-trip and bounds the worst case.
                existing.runCatching { soTimeout = 15_000 }
                val ok = runCatching { sendPacketReusable(existing, padded, wireId) }.getOrDefault(false)
                if (ok) {
                    torConnections[contactId] = existing
                    return@withLock true
                }
                existing.runCatching { close() }
            }
            val fresh = runCatching { openTorSocket(onionAddress, TOR_CONNECT_TIMEOUT_MS) }.getOrNull()
                ?: return@withLock false
            val ok = runCatching { sendPacketReusable(fresh, padded, wireId) }.getOrDefault(false)
            if (ok) torConnections[contactId] = fresh else fresh.runCatching { close() }
            ok
        }
    }

    /**
     * Like [sendViaTorPooled], but exchanges a WINDOW of chunk packets in one go: writes
     * all of them, then collects the ACKs — the receiver's per-packet read→ingest→ACK
     * loop is unchanged, the packets simply queue in the TCP buffers instead of each
     * waiting out a full round-trip before the next may leave. Returns how many packets
     * from the front of [window] were ACKed (a strict prefix — the receiver ACKs in
     * order and stops ACKing when it stops processing). A partially-ACKed or dead
     * pooled connection is closed; unACKed packets are simply retried by the caller —
     * safe even if one of them actually WAS processed and only its ACK got lost, because
     * the receiver's lost-ACK dedup re-ACKs duplicates without reprocessing.
     * Window size × packet size (≈33 KB at 8×4 KB) stays far below TCP buffer sizes, so
     * writing the whole window before reading any ACK cannot deadlock.
     */
    private suspend fun sendWindowViaTorPooled(contactId: String, onionAddress: String, window: List<PendingDelivery>): Int {
        val lock = torConnectionLocks.getOrPut(contactId) { Mutex() }
        return lock.withLock {
            torConnections.remove(contactId)?.let { existing ->
                existing.runCatching { soTimeout = 15_000 }
                val acked = runCatching { exchangeWindow(existing, window) }.getOrDefault(0)
                if (acked == window.size) {
                    torConnections[contactId] = existing
                    return@withLock acked
                }
                existing.runCatching { close() }
                // Partial progress on the stale connection still counts — the caller
                // retries the rest, which reopens a fresh connection next window.
                if (acked > 0) return@withLock acked
            }
            val fresh = runCatching { openTorSocket(onionAddress, TOR_CONNECT_TIMEOUT_MS) }.getOrNull()
                ?: return@withLock 0
            val acked = runCatching { exchangeWindow(fresh, window) }.getOrDefault(0)
            if (acked == window.size) torConnections[contactId] = fresh else fresh.runCatching { close() }
            acked
        }
    }

    private fun exchangeWindow(socket: Socket, window: List<PendingDelivery>): Int {
        val out = DataOutputStream(socket.getOutputStream())
        for (item in window) {
            out.writeUTF(identityManager.myWireId(item.wireKeyB64, identity = item.myIdentity ?: identityManager.userId))
            out.writeInt(item.padded.size)
            out.write(item.padded)
        }
        out.flush()
        val input = socket.getInputStream()
        var acked = 0
        while (acked < window.size && input.read() == ACK) acked++
        return acked
    }

    private fun closeAllPooledConnections() {
        val sockets = torConnections.values.toList()
        torConnections.clear()
        sockets.forEach { it.runCatching { close() } }
    }

    fun isConnectedTo(contactId: String) =
        lanPeers.containsKey(contactId.take(8)) || torManager.isReady.value

    /** True if [contactId] is currently reachable over the same-Wi-Fi LAN fast path.
     *  UI-only (transport line in the contact list) — delivery decides per attempt. */
    fun isLanPeer(contactId: String) = lanPeers.containsKey(contactId.take(8))

    private fun registerService() {
        nsdManager = context.getSystemService(NsdManager::class.java) ?: return
        val info = NsdServiceInfo().apply {
            serviceName = "unpruuf_${identityManager.userId.take(8)}"
            serviceType = SERVICE_TYPE
            port = LOCAL_PORT
        }
        regListener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(i: NsdServiceInfo) {}
            override fun onRegistrationFailed(i: NsdServiceInfo, code: Int) {}
            override fun onServiceUnregistered(i: NsdServiceInfo) {}
            override fun onUnregistrationFailed(i: NsdServiceInfo, code: Int) {}
        }
        nsdManager?.registerService(info, NsdManager.PROTOCOL_DNS_SD, regListener)
    }

    private fun discoverPeers() {
        discListener = object : NsdManager.DiscoveryListener {
            override fun onStartDiscoveryFailed(st: String, code: Int) {}
            override fun onStopDiscoveryFailed(st: String, code: Int) {}
            override fun onDiscoveryStarted(st: String) {}
            override fun onDiscoveryStopped(st: String) {}
            override fun onServiceFound(service: NsdServiceInfo) {
                if (service.serviceName.startsWith("unpruuf_")) {
                    nsdManager?.resolveService(service, object : NsdManager.ResolveListener {
                        override fun onResolveFailed(i: NsdServiceInfo, code: Int) {}
                        override fun onServiceResolved(i: NsdServiceInfo) {
                            val shortId = i.serviceName.removePrefix("unpruuf_")
                            if (shortId == identityManager.userId.take(8)) return
                            val host = i.host?.hostAddress ?: return
                            lanPeers[shortId] = Pair(host, i.port)
                            flushQueue()
                        }
                    })
                }
            }
            override fun onServiceLost(service: NsdServiceInfo) {
                lanPeers.remove(service.serviceName.removePrefix("unpruuf_"))
            }
        }
        nsdManager?.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discListener)
    }

    fun stop() {
        started = false
        runCatching { nsdManager?.unregisterService(regListener) }
        runCatching { nsdManager?.stopServiceDiscovery(discListener) }
        closeAllPooledConnections()
        serverSocket?.runCatching { close() }
        multicastLock?.runCatching { release() }
        scope.cancel()
    }
}
