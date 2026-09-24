package com.nexonai.unpruuf.screens.qrpair

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.data.model.Contact
import com.nexonai.unpruuf.domain.AppEdition
import com.nexonai.unpruuf.domain.network.IdentityManager
import com.nexonai.unpruuf.domain.network.NodeMeshManager
import com.nexonai.unpruuf.domain.network.P2PNetworkManager
import com.nexonai.unpruuf.domain.network.RelayManager
import com.nexonai.unpruuf.domain.network.TorManager
import com.nexonai.unpruuf.domain.network.ratchet.RatchetSessionManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject

data class QrPairingPayload(
    val version: Int = 5,
    val userId: String,
    val onionAddress: String,
    val publicKeyBase64: String,
    val rotationFactorBase64: String,
    val displayName: String,
    val appEdition: String, // Werte: "standard", "pro" oder "client"
    // Raw X25519 identity public key (32 bytes, Base64) — bootstraps this
    // contact's Double Ratchet session (see RatchetSessionManager / IdentityManager).
    val x25519RatchetPublicKeyBase64: String = "",
    // v5: the relay pool this device advertises, up to RelayManager.RELAY_POOL_MAX_SIZE entries.
    // Before this existed, the relay path between two Android devices only worked if BOTH had
    // manually configured the SAME relay — the sender pushed to its own global relay and the
    // receiver polled its own, so two differently-configured devices never met (the standard QR
    // carried no relay field at all, unlike the cross-platform one). Empty when no relay is
    // configured, and then nothing is written into the QR either — see [payloadToJson].
    val relayConnectionStrings: List<String> = emptyList(),
    val timestampMs: Long = System.currentTimeMillis()
)

/** Constant head of every connection string — stripped in the QR, re-added on parse. Must stay
 *  in sync with RelayManager's own private PREFIX and server/src/connectionString.ts. */
private const val RELAY_STRING_PREFIX = "unpruuf-relay:v1:"

@HiltViewModel
class QrPairViewModel @Inject constructor(
    private val contactDao: ContactDao,
    private val identityManager: IdentityManager,
    private val torManager: TorManager,
    private val ratchetSessionManager: RatchetSessionManager,
    private val relayManager: RelayManager,
    private val nodeMeshManager: NodeMeshManager,
    private val p2pNetworkManager: P2PNetworkManager
) : ViewModel() {

    private val _errorState = MutableStateFlow<String?>(null)
    val errorState = _errorState.asStateFlow()

    private val _successState = MutableStateFlow<String?>(null)
    val successState = _successState.asStateFlow()

    private val _myQrPayload = MutableStateFlow<QrPairingPayload?>(null)
    val myQrPayload = _myQrPayload.asStateFlow()

    init {
        generateMyQrCode()
    }

    private fun generateMyQrCode() {
        viewModelScope.launch {
            // Wiederholen, bis eine ECHTE Onion vorliegt. myQrPayload wird erst
            // gesetzt, wenn die Onion gültig ist → der Screen zeigt bis dahin den
            // Warte-Zustand statt eines ungültigen QR-Codes.
            repeat(30) {
                withTimeoutOrNull(60_000) { torManager.isReady.filter { it }.first() }
                val onion = torManager.ensureMainOnion()
                if (onion.endsWith(".onion") && onion != "pending.onion") {
                    _myQrPayload.value = createMyQrPayload(
                        userId = identityManager.userId,
                        onion = onion,
                        pubKey = android.util.Base64.encodeToString(
                            identityManager.myMessageKey,
                            android.util.Base64.NO_WRAP
                        ),
                        rotFactor = identityManager.getCurrentRotationFactor(),
                        name = "",
                        ratchetPubKey = identityManager.myX25519RatchetPublicKeyBase64,
                        relays = relayManager.getMyRelayPool()
                    )
                    return@launch
                }
                kotlinx.coroutines.delay(3_000)
            }
        }
    }

    // Erstellt den eigenen QR Code für die Standard-App
    fun createMyQrPayload(
        userId: String,
        onion: String,
        pubKey: String,
        rotFactor: String,
        name: String,
        ratchetPubKey: String = "",
        relays: List<String> = emptyList()
    ): QrPairingPayload {
        return QrPairingPayload(
            userId = userId,
            onionAddress = onion,
            publicKeyBase64 = pubKey,
            rotationFactorBase64 = rotFactor,
            displayName = name,
            appEdition = AppEdition.current,
            x25519RatchetPublicKeyBase64 = ratchetPubKey,
            relayConnectionStrings = relays
        )
    }

    // Wenn ein QR-Code mit der Kamera gescannt wird
    fun handleScannedQr(payload: QrPairingPayload, displayName: String) {
        viewModelScope.launch {
            // Edition-Pairing-Regeln durchsetzen (Pro/Standard/Client).
            if (!AppEdition.canAdd(payload.appEdition)) {
                _errorState.value = AppEdition.blockReason(payload.appEdition)
                return@launch
            }

            // Invalid onion address → contact would be permanently unreachable
            if (payload.onionAddress == "pending.onion" || !payload.onionAddress.endsWith(".onion")) {
                _errorState.value = "Invalid QR code: Tor wasn't ready on the other device. Reopen the QR screen there and scan again."
                return@launch
            }

            // Older app versions didn't include a ratchet key — reject rather
            // than silently create a contact that can never receive messages.
            if (payload.x25519RatchetPublicKeyBase64.isBlank()) {
                _errorState.value = "This QR code is from an older app version. Update both devices and scan again."
                return@launch
            }

            // A QR claiming to be a contact we already have — block a silent overwrite instead
            // of letting Room's REPLACE quietly swap in new keys under an already-trusted name
            // (fixed 2026-09-17, see SECURITY_CLAIMS.md). Harmless identical re-scans (both
            // devices already paired, one side just scanned again) fall through as a no-op
            // rather than creating a duplicate contact row.
            val existing = contactDao.getContactByRemoteUserId(payload.userId)
            if (existing != null) {
                if (existing.publicKey != payload.publicKeyBase64 ||
                    existing.x25519RatchetPublicKey != payload.x25519RatchetPublicKeyBase64
                ) {
                    _errorState.value = "This contact's key has changed since you last paired " +
                        "with them. If they reinstalled or reset the app, re-verify their safety " +
                        "number before trusting this. To replace them, delete the old contact first."
                } else {
                    _successState.value = "$displayName is already a contact."
                }
                return@launch
            }

            val contact = Contact(
                id = identityManager.newWireIdentity(),
                onionAddress = payload.onionAddress,
                publicKey = payload.publicKeyBase64,
                rotationFactor = payload.rotationFactorBase64,
                displayName = displayName,
                isClientSlot = payload.appEdition == AppEdition.CLIENT,
                x25519RatchetPublicKey = payload.x25519RatchetPublicKeyBase64,
                remoteUserId = payload.userId,
                myWireIdentity = identityManager.newWireIdentity(),
                // v5: both sides' relay pools are fixed at pairing time. Mine is what I just
                // advertised in my own QR — it must be stored per contact rather than read live
                // later, because THEY will keep pushing to whatever I showed them, even if I
                // reconfigure my relay afterwards (see P2PNetworkManager.pollRelayOnce).
                myRelayConnectionString = RelayManager.buildConnectionStringList(relayManager.getMyRelayPool()),
                theirRelayConnectionString = RelayManager.buildConnectionStringList(payload.relayConnectionStrings)
            )

            contactDao.insert(contact)
            // Both devices already know both X25519 keys at this point (mutual QR
            // exchange) — no async handshake needed before the ratchet session exists.
            ratchetSessionManager.createSession(contact)
            // Tell them our fresh per-contact identity right away — see Contact.kt and
            // P2PNetworkManager.sendNewIdentitySignal()'s doc comments.
            p2pNetworkManager.sendNewIdentitySignal(contact.id)
            // Onion pro Gerät (Haupt-Onion) → kein per-Kontakt-confirmPairing nötig.
            _successState.value = "$displayName added."
        }
    }

    // ─── Cross-platform (iOS-interop) pairing — see CROSS_PLATFORM_PLAN.md ─────────────────
    // Structurally separate from the onion-based flow above, not a variant of it: no onion
    // involved, relay-mandatory, gated to Pro only (the format itself carries no edition field
    // — iOS has no Standard/Client concept, so "both sides are Pro" is the only rule there is
    // to enforce here; AppEdition.canAdd()'s edition matrix is unrelated and untouched).

    /** Null until a relay is configured in Settings (Settings → Relay) — the cross-platform QR
     *  is meaningless without one, since its whole point is "the relay that reaches me". */
    fun myCrossPlatformQrPayload(): CrossPlatformPairingPayload? {
        val pool = relayManager.getMyRelayPool()
        if (pool.isEmpty()) return null
        return CrossPlatformPairingPayload(
            userId = identityManager.userId,
            messageKeyBase64 = android.util.Base64.encodeToString(
                identityManager.myMessageKey, android.util.Base64.NO_WRAP
            ),
            x25519RatchetPublicKeyBase64 = identityManager.myX25519RatchetPublicKeyBase64,
            relayConnectionStrings = pool,
            appEdition = AppEdition.current
        )
    }

    /** True when Settings → Relay is set to Mandatory — the QR screen uses this to default to
     *  the no-onion cross-platform-format pairing automatically for Android↔Android contacts
     *  too, not just genuine iOS interop, since Mandatory means an onion will never be used for
     *  this device's traffic anyway (see CHANGELOG "Business/Mandatory pairing unification"). */
    fun isRelayMandatory(): Boolean = relayManager.isMandatory()

    fun handleScannedCrossPlatformQr(payload: CrossPlatformPairingPayload, displayName: String) {
        viewModelScope.launch {
            // Cross-platform-format pairing is a paid Pro feature for genuine iOS interop — but
            // the same wire format is now also what Mandatory relay mode uses for Android↔Android
            // pairing (see isRelayMandatory's doc comment), where gating behind Pro would block
            // exactly the Business/Node customers this mode exists for. Waive the check whenever
            // Mandatory is the reason this format is in use; the deliberate manual "iOS /
            // cross-platform" toggle on Standard/Client still requires Pro as before.
            if (!AppEdition.isPro && !relayManager.isMandatory()) {
                _errorState.value = "Cross-platform (iOS) pairing is a Pro feature."
                return@launch
            }
            // The payload carries no edition field from iOS (defaults to STANDARD — see
            // CrossPlatformPairingPayload's doc comment) or from an old Android QR, but two real
            // Android editions pairing this way under Mandatory still need the normal
            // Client-can-only-add-Pro rule enforced, same as the onion-based flow below.
            if (!AppEdition.canAdd(payload.appEdition)) {
                _errorState.value = AppEdition.blockReason(payload.appEdition)
                return@launch
            }
            if (payload.relayConnectionStrings.none { RelayManager.parseConnectionString(it) != null }) {
                _errorState.value = "This QR code's relay address looks invalid. Ask them to check their relay setup and try again."
                return@launch
            }
            if (payload.x25519RatchetPublicKeyBase64.isBlank()) {
                _errorState.value = "This QR code is from an older app version. Update both devices and scan again."
                return@launch
            }

            val existing = contactDao.getContactByRemoteUserId(payload.userId)
            if (existing != null) {
                if (existing.publicKey != payload.messageKeyBase64 ||
                    existing.x25519RatchetPublicKey != payload.x25519RatchetPublicKeyBase64
                ) {
                    _errorState.value = "This contact's key has changed since you last paired " +
                        "with them. If they reinstalled or reset the app, re-verify their safety " +
                        "number before trusting this. To replace them, delete the old contact first."
                } else {
                    _successState.value = "$displayName is already a contact."
                }
                return@launch
            }

            val contact = Contact(
                id = identityManager.newWireIdentity(),
                onionAddress = "",
                publicKey = payload.messageKeyBase64,
                rotationFactor = "",
                displayName = displayName,
                isClientSlot = payload.appEdition == AppEdition.CLIENT,
                x25519RatchetPublicKey = payload.x25519RatchetPublicKeyBase64,
                crossPlatform = true,
                myRelayConnectionString = RelayManager.buildConnectionStringList(relayManager.getMyRelayPool()),
                theirRelayConnectionString = RelayManager.buildConnectionStringList(payload.relayConnectionStrings),
                remoteUserId = payload.userId,
                myWireIdentity = identityManager.newWireIdentity()
            )

            contactDao.insert(contact)
            ratchetSessionManager.createSession(contact)
            p2pNetworkManager.sendNewIdentitySignal(contact.id)
            _successState.value = "$displayName added."
        }
    }

    // ─── unpruuf Business / Node-Mesh pairing — see NODE_MESH_SPEC.md ──────────────────────
    // Its own third format, not a variant of either above: no onion, no relay-pool-with-token,
    // no wire-identity concept at all (see IdentityManager.nodeMeshRoutingTag's doc comment for
    // why routing needs none). Gated purely on NodeMeshManager.isUsable() — at least one own
    // node configured — not on edition, matching how this transport is meant to work regardless
    // of Standard/Pro/Client tier; AppEdition.canAdd() is still enforced on scan, same as every
    // other pairing format, since the Client-can-only-add-Pro business rule is orthogonal to
    // which transport a pairing uses.

    /** Null until at least one own node is configured (Settings → Business Node-Mesh) — the
     *  Node-Mesh QR is meaningless without one, mirroring [myCrossPlatformQrPayload]'s same gate
     *  for the relay pool. */
    fun myNodeMeshQrPayload(): NodeMeshPairingPayload? {
        if (!nodeMeshManager.isUsable()) return null
        return NodeMeshPairingPayload(
            userId = identityManager.userId,
            messageKeyBase64 = android.util.Base64.encodeToString(
                identityManager.myMessageKey, android.util.Base64.NO_WRAP
            ),
            x25519RatchetPublicKeyBase64 = identityManager.myX25519RatchetPublicKeyBase64,
            nodeMeshRoutingSeedBase64 = identityManager.myNodeMeshRoutingSeedBase64,
            nodeAddresses = nodeMeshManager.getMyAdvertisedAddresses(),
            appEdition = AppEdition.current
        )
    }

    fun handleScannedNodeMeshQr(payload: NodeMeshPairingPayload, displayName: String) {
        viewModelScope.launch {
            if (!AppEdition.canAdd(payload.appEdition)) {
                _errorState.value = AppEdition.blockReason(payload.appEdition)
                return@launch
            }
            if (payload.nodeAddresses.isEmpty()) {
                _errorState.value = "This QR code's node address looks invalid. Ask them to check their node setup and try again."
                return@launch
            }
            if (payload.x25519RatchetPublicKeyBase64.isBlank() || payload.nodeMeshRoutingSeedBase64.isBlank()) {
                _errorState.value = "This QR code is from an older app version. Update both devices and scan again."
                return@launch
            }
            if (!nodeMeshManager.isUsable()) {
                _errorState.value = "Set up your own node first (Settings → Business Node-Mesh) — without it, this contact's messages would have nowhere to reach you."
                return@launch
            }

            val existing = contactDao.getContactByRemoteUserId(payload.userId)
            if (existing != null) {
                if (existing.publicKey != payload.messageKeyBase64 ||
                    existing.x25519RatchetPublicKey != payload.x25519RatchetPublicKeyBase64
                ) {
                    _errorState.value = "This contact's key has changed since you last paired " +
                        "with them. If they reinstalled or reset the app, re-verify their safety " +
                        "number before trusting this. To replace them, delete the old contact first."
                } else {
                    _successState.value = "$displayName is already a contact."
                }
                return@launch
            }

            val contact = Contact(
                id = identityManager.newWireIdentity(),
                onionAddress = "",
                publicKey = payload.messageKeyBase64,
                rotationFactor = "",
                displayName = displayName,
                isClientSlot = payload.appEdition == AppEdition.CLIENT,
                x25519RatchetPublicKey = payload.x25519RatchetPublicKeyBase64,
                remoteUserId = payload.userId,
                nodeMesh = true,
                theirNodeMeshRoutingSeed = payload.nodeMeshRoutingSeedBase64,
                theirNodeAddresses = NodeMeshManager.buildNodeConnectionStringList(payload.nodeAddresses)
            )

            contactDao.insert(contact)
            ratchetSessionManager.createSession(contact)
            // No NEW_IDENTITY signal here, deliberately — Node-Mesh's routing tag has no
            // identity component to announce (see IdentityManager.nodeMeshRoutingTag's doc
            // comment), so myWireIdentity stays null for this contact and sendNewIdentitySignal
            // would have nothing correct to send.
            _successState.value = "$displayName added."
        }
    }

    fun clearError() { _errorState.value = null }

    /** Scanned content wasn't a valid unpruuf QR code — usually an older app
     *  version on the other device (v3 changed the QR's wire format). */
    fun showUnreadableQrError() {
        _errorState.value = "Couldn't read this code. Make sure both devices are updated to the latest version, then scan again."
    }

    fun clearSuccess() { _successState.value = null }

    // ─── Compact wire format (v3) ────────────────────────────────────────────
    // The QR code's own physical size is fixed (fits the screen), so the only
    // way to make it easier for weak-autofocus/budget cameras (reported: Galaxy
    // S23 Ultra, Honor 5X) to scan is to shrink the payload — fewer bytes means
    // a lower QR version, which means larger, easier-to-resolve modules for the
    // same on-screen size. Short single-letter keys and a compact 16-byte UUID
    // encoding (instead of the 36-char dashed string) cut the payload from
    // ~477 to ~320 chars, dropping the QR from version 13 (69x69 modules) to
    // version 10 (57x57 modules) — about 30% fewer modules to resolve.
    // This is a wire-format change: both devices must run this build or newer,
    // and any pairing must be redone via a freshly scanned QR (same rule as
    // every previous wire-level change — see CHANGELOG.md).
    fun payloadToJson(payload: QrPairingPayload): String {
        val compactUserId = compactUserId(payload.userId) ?: payload.userId
        val onionId = payload.onionAddress.removeSuffix(".onion")
        // `n` is omitted entirely when no relay is configured — a device that doesn't use the
        // relay keeps exactly the QR size it had before v5. Each entry drops the constant
        // "unpruuf-relay:v1:" prefix (~17 chars each, re-added on parse); the address and token
        // stay verbatim, because an address MAY legitimately contain a colon (host:port) and
        // guessing a ".onion" suffix back on would be ambiguous for those.
        val relays = compactRelayList(payload.relayConnectionStrings)
        val relayField = if (relays.isEmpty()) "" else ""","n":"$relays"""
        return """{"v":${payload.version},"u":"$compactUserId","o":"$onionId","p":"${payload.publicKeyBase64}","r":"${payload.rotationFactorBase64}","e":"${payload.appEdition}","k":"${payload.x25519RatchetPublicKeyBase64}"$relayField}"""
    }

    /** Full `unpruuf-relay:v1:<addr>:<token>` strings -> `;`-joined, prefix-stripped form. */
    private fun compactRelayList(relays: List<String>): String =
        relays.map { it.trim() }
            .filter { it.isNotEmpty() }
            .map { it.removePrefix(RELAY_STRING_PREFIX) }
            .take(RelayManager.RELAY_POOL_MAX_SIZE)
            .joinToString(";")

    /** Inverse of [compactRelayList] — re-adds the prefix so the rest of the app only ever sees
     *  canonical connection strings (RelayManager.parseConnectionString rejects anything else). */
    private fun expandRelayList(compact: String): List<String> =
        compact.split(";")
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .map { if (it.startsWith(RELAY_STRING_PREFIX)) it else RELAY_STRING_PREFIX + it }
            .filter { RelayManager.parseConnectionString(it) != null }
            .take(RelayManager.RELAY_POOL_MAX_SIZE)

    fun jsonToPayload(json: String): QrPairingPayload? {
        return try {
            val map = parseSimpleJson(json)
            val compactUserId = map["u"] ?: return null
            val onionId = map["o"] ?: return null
            QrPairingPayload(
                version = map["v"]?.toIntOrNull() ?: 1,
                userId = expandUserId(compactUserId) ?: return null,
                onionAddress = "$onionId.onion",
                publicKeyBase64 = map["p"] ?: return null,
                rotationFactorBase64 = map["r"] ?: return null,
                displayName = "",
                appEdition = map["e"] ?: return null,
                x25519RatchetPublicKeyBase64 = map["k"] ?: "",
                // Absent on a pre-v5 QR (and on any device with no relay configured) — an empty
                // list then, which simply means "no relay advertised", exactly as before.
                relayConnectionStrings = map["n"]?.let { expandRelayList(it) } ?: emptyList(),
                timestampMs = 0L
            )
        } catch (e: Exception) {
            null
        }
    }

    // compactUserId/expandUserId/parseSimpleJson moved to QrCodec.kt (package-level, shared
    // with CrossPlatformPairing.kt's relay-based QR) — same functions, no behavior change.
}
