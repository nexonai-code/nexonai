package com.nexonai.unpruuf.domain.network

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.ServiceConnection
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.IBinder
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.nexonai.unpruuf.data.db.ContactDao
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.freehaven.tor.control.TorControlCommands
import net.freehaven.tor.control.TorControlConnection
import org.torproject.jni.TorService
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TorManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val identityManager: IdentityManager,
    private val bridgeManager: BridgeManager,
    private val pluggableTransportManager: PluggableTransportManager,
    private val contactDao: ContactDao
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _isReady = MutableStateFlow(false)
    val isReady: StateFlow<Boolean> = _isReady.asStateFlow()

    private val _onionAddress = MutableStateFlow<String?>(null)
    val onionAddress: StateFlow<String?> = _onionAddress.asStateFlow()

    // TorService populates its socks port only AFTER bootstrap (GETINFO net/listeners/socks),
    // so it must be read lazily at send time — never cached at bind time.
    val socksPort: Int
        get() = torService?.socksPort?.takeIf { it > 0 } ?: 9050

    private var started = false
    private var torService: TorService? = null
    private var serviceConn: ServiceConnection? = null
    private var statusReceiver: BroadcastReceiver? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var lastNetwork: Network? = null
    private var bounceJob: Job? = null
    // The network we've seen onAvailable() for but haven't bounced Tor for yet — waiting on
    // either NET_CAPABILITY_VALIDATED (real usability confirmed) or the timeout fallback below.
    private var pendingSwitchNetwork: Network? = null
    private var validationTimeoutJob: Job? = null

    // Emitted after a network change has been handled (Tor bounced). Lets the
    // P2P layer re-warm send paths and re-flush the queue immediately instead of
    // waiting for the periodic loops.
    private val _networkChanged = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val networkChanged: SharedFlow<Unit> = _networkChanged.asSharedFlow()

    // Per-contact isolation: contactId → the dedicated .onion address we present to that contact
    private val contactOnionAddresses = ConcurrentHashMap<String, String>()

    // contactOnionAddresses' key set, mirrored into a StateFlow so the UI can react to it. Only
    // ever gets entries from restoreContactServices() below (pairings this device made before it
    // had a single main onion — see its doc comment) since new pairings go straight through
    // ensureMainOnion() and never touch this map. Used to proactively offer sendMainOnionUpdate()
    // for exactly these contacts instead of requiring the user to notice on their own.
    private val _legacyPairedContactIds = MutableStateFlow<Set<String>>(emptySet())
    val legacyPairedContactIds: StateFlow<Set<String>> = _legacyPairedContactIds.asStateFlow()

    // Pending pairing onion (in-memory only; linked to a contactId upon confirmPairing)
    private var pendingOnionAddress: String? = null
    private var pendingOnionPrivKey: String? = null

    fun start() {
        if (started) return
        started = true
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                when (intent.getStringExtra(TorService.EXTRA_STATUS)) {
                    TorService.STATUS_ON -> scope.launch { setupHiddenService() }
                    TorService.STATUS_OFF, TorService.STATUS_STOPPING -> _isReady.value = false
                }
            }
        }
        statusReceiver = receiver
        LocalBroadcastManager.getInstance(context).registerReceiver(
            receiver, IntentFilter(TorService.ACTION_STATUS)
        )

        val conn = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, binder: IBinder) {
                torService = (binder as TorService.LocalBinder).service
            }
            override fun onServiceDisconnected(name: ComponentName?) {
                torService = null
                _isReady.value = false
            }
        }
        serviceConn = conn
        context.bindService(
            Intent(context, TorService::class.java),
            conn,
            Context.BIND_AUTO_CREATE
        )

        registerNetworkCallback()
    }

    // TorService reagiert selbst NICHT auf Netzwechsel: Client-Circuits werden
    // bei Bedarf neu gebaut (Senden geht), aber die Hidden-Service-Deskriptoren
    // werden nicht neu publiziert — das Gerät ist dann unerreichbar.
    // Fix (wie Orbot): bei Netzwechsel DisableNetwork kurz an/aus schalten.
    // Das zwingt Tor, alle Verbindungen neu aufzubauen UND die Hidden Services
    // sofort neu zu publizieren. isReady wird hier bewusst NICHT angefasst.
    //
    // Bouncing straight off onAvailable() turned out to still lose incoming messages after a
    // Wi‑Fi → mobile-data switch specifically (reported: Pixel 9 Pro — sending recovered after
    // ~1-2 min via Tor's own client-side retries, but nothing ever arrived again). onAvailable()
    // fires as soon as Android's ConnectivityManager considers the new network the default —
    // which, for a cellular radio waking from idle/attaching to a tower, can be *before* the
    // link is actually end-to-end usable. Bouncing Tor at that moment makes the one hidden-service
    // republish attempt fail, and — unlike client-side circuit building — nothing else retries
    // it, so the descriptor stays stale for that network path indefinitely. Now gated on
    // NET_CAPABILITY_VALIDATED (Android's own DNS+HTTP probe confirming the network really
    // works), with a timeout fallback in case validation itself never fires, plus one bounded
    // extra bounce ~20s later as a cheap safety net.
    private fun registerNetworkCallback() {
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                val previous = lastNetwork
                lastNetwork = network
                if (previous != null && previous != network) {
                    pendingSwitchNetwork = network
                    validationTimeoutJob?.cancel()
                    validationTimeoutJob = scope.launch {
                        delay(8_000)
                        if (pendingSwitchNetwork == network) scheduleBounce(network)
                    }
                }
            }

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                if (network == pendingSwitchNetwork && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                    validationTimeoutJob?.cancel()
                    scheduleBounce(network)
                }
            }

            override fun onLost(network: Network) {
                if (network == pendingSwitchNetwork) {
                    pendingSwitchNetwork = null
                    validationTimeoutJob?.cancel()
                }
            }
        }
        networkCallback = cb
        runCatching { cm.registerDefaultNetworkCallback(cb) }
    }

    private fun scheduleBounce(network: Network) {
        pendingSwitchNetwork = null
        // Debounce: on rapid switches (mobile→Wi‑Fi→mobile) only bounce once, after
        // things settle — avoids overlapping bounces that leave Tor cold for a long time.
        bounceJob?.cancel()
        bounceJob = scope.launch {
            delay(2_500)
            bounceTorNetwork()
        }
    }

    /**
     * Public re-bounce, for when something *outside* this class has independently confirmed the
     * usual network-change bounce above wasn't enough — see
     * P2PNetworkManager's post-network-change reachability check, which keeps calling this (with
     * backoff) until a real self-connect through the hidden service actually succeeds, instead of
     * just hoping a fixed number of bounces at fixed delays was enough. A single validated-gated
     * bounce turned out not to be reliably sufficient on its own (reported against a real Wi‑Fi →
     * mobile-data switch, Pixel 9 Pro, on a fresh install/pairing — not just a stale-state fluke).
     */
    suspend fun forceBounce() {
        bounceTorNetwork()
    }

    private suspend fun bounceTorNetwork() {
        // Was a single immediate null-check on torControlConnection: right after a
        // network handoff the bound Tor service can be transiently unavailable, and
        // bailing out here silently skipped the bounce AND never notified the P2P
        // layer — nothing else would retry until another network-change event
        // happened to fire, so recovery could hang indefinitely. Give the control
        // connection up to ~10s to reappear (same helper setupHiddenService uses).
        val ctrl = awaitControlConnection()
        if (ctrl != null) {
            runCatching {
                ctrl.setConf("DisableNetwork", "1")
                delay(1_000)
                ctrl.setConf("DisableNetwork", "0")
            }
        }
        // Always notify the P2P layer, even if the control connection never
        // reappeared — re-warming the send path / re-flushing the queue costs
        // nothing if Tor is actually fine, but is essential if the bounce above
        // couldn't run.
        delay(1_500)
        _networkChanged.emit(Unit)
    }

    // Wendet die Bridge-Konfiguration an. SICHERHEIT: Es werden nur Bridges
    // aktiviert, die OHNE Pluggable Transport funktionieren (Vanilla). Reine
    // PT-Bridges (obfs4/snowflake) wuerden Tor ohne die IPtProxy-Binaries
    // komplett lahmlegen — daher werden sie hier bewusst NICHT gesetzt, bis
    // der PT-Client verfuegbar ist. So kann die Einstellung Tor nie zerstoeren.
    private suspend fun applyBridges(ctrl: TorControlConnection) {
        runCatching {
            if (!bridgeManager.isEnabled()) {
                ctrl.setConf("UseBridges", "0")
                return
            }
            val vanilla = bridgeManager.usableVanillaLines()
            val ptLines = bridgeManager.pluggableTransportLines()
            val neededTransports = ptLines.mapNotNull { line ->
                line.substringBefore(' ').lowercase().takeIf { it == "obfs4" || it == "snowflake" }
            }.toSet()

            // Start each configured PT client and see which ones actually came up. A PT that
            // fails to start (missing native lib, resolution mismatch, anything) simply isn't in
            // this map — its bridge lines get skipped below rather than left half-configured.
            val livePorts = if (neededTransports.isEmpty()) emptyMap()
                else runCatching { pluggableTransportManager.ensureStarted(neededTransports) }.getOrDefault(emptyMap())

            if (vanilla.isEmpty() && livePorts.isEmpty()) {
                // Nothing usable right now (no vanilla bridges, and either no PT bridges
                // configured or none of them actually started) → keep the direct connection
                // instead of leaving Tor in a broken bridge state.
                ctrl.setConf("UseBridges", "0")
                return
            }

            val conf = mutableListOf("UseBridges 1")
            livePorts.forEach { (transport, port) ->
                conf.add("ClientTransportPlugin $transport socks5 127.0.0.1:$port")
            }
            vanilla.forEach { conf.add("Bridge $it") }
            ptLines.forEach { line ->
                val transport = line.substringBefore(' ').lowercase()
                if (transport in livePorts) conf.add("Bridge $line")
            }
            ctrl.setConf(conf)
        }
    }

    /** Bridges nach einer Einstellungsaenderung sofort neu anwenden. */
    suspend fun reapplyBridges() {
        val ctrl = torService?.torControlConnection ?: return
        applyBridges(ctrl)
        bounceTorNetwork()
    }

    private suspend fun awaitControlConnection(): TorControlConnection? {
        var ctrl = torService?.torControlConnection
        repeat(20) {
            if (ctrl != null) return@repeat
            delay(500)
            ctrl = torService?.torControlConnection
        }
        return ctrl
    }

    private suspend fun setupHiddenService() {
        val ctrl = awaitControlConnection() ?: return

        applyBridges(ctrl)

        runCatching {
            val portMap = mapOf(P2PNetworkManager.ONION_PORT to "127.0.0.1:${P2PNetworkManager.LOCAL_PORT}")
            val storedKey = identityManager.getTorPrivKey()
            val result = if (storedKey != null) {
                ctrl.addOnion(storedKey, portMap)
            } else {
                ctrl.addOnion(portMap)
            }
            val serviceId = result[TorControlCommands.HS_ADDRESS] ?: return
            result[TorControlCommands.HS_PRIVKEY]?.let { identityManager.saveTorPrivKey(it) }
            _onionAddress.value = "$serviceId.onion"
            _isReady.value = true
        }
        // Rückwärtskompatibel: auch früher gekoppelte per-Kontakt-Onions wieder
        // veröffentlichen, damit BESTEHENDE Kontakte weiter senden/empfangen
        // können. Neue Kopplungen nutzen nur die Haupt-Onion (siehe QR).
        restoreContactServices(ctrl)
    }

    private suspend fun restoreContactServices(ctrl: TorControlConnection) {
        val portMap = mapOf(P2PNetworkManager.ONION_PORT to "127.0.0.1:${P2PNetworkManager.LOCAL_PORT}")
        // Only republish onions whose contact still exists. Everything else is orphaned —
        // either the contact was deleted, or the key is still stored under a serviceId from a
        // pairing that was never completed, dating from before the main-onion model
        // (createPairingOnion persisted immediately; nothing calls that flow anymore).
        // Orphans are removed for good rather than carried forever: every extra published
        // onion costs keep-alive traffic (a self-connect every 20s in P2PNetworkManager),
        // slows the reachability check (isSelfReachableViaTor probes ALL own onions), and
        // widens the attack surface — for an address no contact knows or needs anymore.
        // If the DB read fails, nothing is deleted and everything is published (the old
        // behavior) — when in doubt, one dead onion too many beats one live onion too few.
        val existingContactIds = runCatching {
            contactDao.getAllContactsOnce().map { it.id }.toSet()
        }.getOrNull()
        // Dedupe by privKey (the same onion can be stored under several keys).
        val seen = HashSet<String>()
        identityManager.getAllContactOnionKeys().forEach { (contactId, privKey) ->
            if (existingContactIds != null && contactId !in existingContactIds) {
                identityManager.removeContactOnionPrivKey(contactId)
                return@forEach
            }
            if (!seen.add(privKey)) return@forEach
            try {
                val result = ctrl.addOnion(privKey, portMap)
                val serviceId = result[TorControlCommands.HS_ADDRESS] ?: return@forEach
                contactOnionAddresses[contactId] = "$serviceId.onion"
            } catch (_: Exception) { }
        }
        _legacyPairedContactIds.value = contactOnionAddresses.keys.toSet()
    }

    /**
     * Creates a fresh hidden service for a pairing session.
     * The caller shows the returned .onion in their QR code.
     * Call [confirmPairing] after the contact is saved to link the key permanently.
     */
    suspend fun createPairingOnion(): String {
        // Noch nicht bestätigte Pairing-Onion wiederverwenden → keine Anhäufung
        // neuer Hidden Services bei jedem Öffnen des Hinzufügen-Screens.
        pendingOnionAddress?.let { return it }
        val ctrl = awaitControlConnection() ?: return _onionAddress.value ?: "pending.onion"
        val portMap = mapOf(P2PNetworkManager.ONION_PORT to "127.0.0.1:${P2PNetworkManager.LOCAL_PORT}")
        return try {
            val result = ctrl.addOnion(portMap)
            val serviceId = result[TorControlCommands.HS_ADDRESS]
                ?: return _onionAddress.value ?: "pending.onion"
            val privKey = result[TorControlCommands.HS_PRIVKEY]
                ?: return _onionAddress.value ?: "pending.onion"
            // SOFORT persistieren (unter der serviceId), damit diese Onion nach
            // einem Neustart garantiert wieder veröffentlicht wird — unabhängig
            // davon, ob/wann confirmPairing aufgerufen wird. Das behebt die
            // "eine Richtung geht, die andere nicht"-Fehler nach Neustart.
            identityManager.saveContactOnionPrivKey(serviceId, privKey)
            pendingOnionAddress = "$serviceId.onion"
            pendingOnionPrivKey = privKey
            "$serviceId.onion"
        } catch (_: Exception) {
            _onionAddress.value ?: "pending.onion"
        }
    }

    /**
     * Verknüpft die Pairing-Onion mit [contactId]. Die Onion ist bereits seit
     * [createPairingOnion] persistiert; hier wird der Speicher-Schlüssel nur von
     * der serviceId auf die contactId umgezogen, damit die Onion beim Löschen
     * des Kontakts wieder entfernt werden kann.
     */
    fun confirmPairing(contactId: String) {
        val key = pendingOnionPrivKey ?: return
        val addr = pendingOnionAddress ?: return
        val serviceId = addr.removeSuffix(".onion")
        identityManager.removeContactOnionPrivKey(serviceId)
        identityManager.saveContactOnionPrivKey(contactId, key)
        contactOnionAddresses[contactId] = addr
        _legacyPairedContactIds.value = contactOnionAddresses.keys.toSet()
        pendingOnionAddress = null
        pendingOnionPrivKey = null
    }

    /**
     * Liefert die Haupt-Onion des Geräts und erstellt sie bei Bedarf aktiv
     * (falls setupHiddenService noch nicht durch ist). Für die QR-Erzeugung,
     * damit dort nie "pending.onion" landet, solange Tor erreichbar ist.
     */
    suspend fun ensureMainOnion(): String {
        _onionAddress.value?.let { return it }
        val ctrl = awaitControlConnection() ?: return "pending.onion"
        val portMap = mapOf(P2PNetworkManager.ONION_PORT to "127.0.0.1:${P2PNetworkManager.LOCAL_PORT}")
        return runCatching {
            val storedKey = identityManager.getTorPrivKey()
            val result = if (storedKey != null) ctrl.addOnion(storedKey, portMap) else ctrl.addOnion(portMap)
            val serviceId = result[TorControlCommands.HS_ADDRESS] ?: return "pending.onion"
            result[TorControlCommands.HS_PRIVKEY]?.let { identityManager.saveTorPrivKey(it) }
            val addr = "$serviceId.onion"
            _onionAddress.value = addr
            _isReady.value = true
            addr
        }.getOrDefault(_onionAddress.value ?: "pending.onion")
    }

    private val _verifiedOnionAddress = MutableStateFlow<String?>(null)
    val verifiedOnionAddress: StateFlow<String?> = _verifiedOnionAddress.asStateFlow()

    /**
     * Ensures today's "verified" onion (see Ed25519OnionDerivation,
     * IdentityManager.verifiedOnionFactor) — the address only safety-number-verified contacts
     * get moved onto (see P2PNetworkManager.sendVerifiedOnionUpdate) — is registered, rotating
     * it if the day has changed since the last check: deriving today's key, ADD_ONION-ing it,
     * then DEL_ONION-ing yesterday's service now that today's is confirmed live (in that order,
     * so a failed registration never leaves contacts with no working address at all).
     *
     * Cheap no-op most calls: skipped via [IdentityManager.getLastVerifiedOnionDay] without a
     * Tor round-trip once today's onion is already current.
     *
     * Returns the new address if this call just rotated — the caller (P2PNetworkManager) should
     * self-test reachability before announcing it to verified contacts — or null if nothing
     * changed or Tor wasn't reachable right now (harmless; the next periodic check retries).
     */
    suspend fun ensureVerifiedOnion(): String? {
        val today = identityManager.currentDayBucket()
        if (identityManager.getLastVerifiedOnionDay() == today && _verifiedOnionAddress.value != null) {
            return null
        }
        val ctrl = awaitControlConnection() ?: return null
        val portMap = mapOf(P2PNetworkManager.ONION_PORT to "127.0.0.1:${P2PNetworkManager.LOCAL_PORT}")
        return runCatching {
            val keyBlob = Ed25519OnionDerivation.deriveTorKeyBlob(identityManager.verifiedOnionFactor, today)
            val result = ctrl.addOnion(keyBlob, portMap)
            val serviceId = result[TorControlCommands.HS_ADDRESS] ?: return null
            identityManager.getLastVerifiedOnionServiceId()?.let { old ->
                if (old != serviceId) {
                    runCatching { ctrl.sendAndWaitForResponse("DEL_ONION $old", null) }
                }
            }
            identityManager.saveLastVerifiedOnionServiceId(serviceId)
            identityManager.saveLastVerifiedOnionDay(today)
            val addr = "$serviceId.onion"
            _verifiedOnionAddress.value = addr
            addr
        }.getOrNull()
    }

    /** Alle eigenen veröffentlichten Onion-Adressen (Haupt- + je Kontakt + Verified). */
    fun getMyOnionAddresses(): List<String> =
        (contactOnionAddresses.values + listOfNotNull(_onionAddress.value, _verifiedOnionAddress.value))
            .filter { it.endsWith(".onion") }
            .distinct()

    fun stop() {
        started = false
        statusReceiver?.let { LocalBroadcastManager.getInstance(context).unregisterReceiver(it) }
        serviceConn?.let { runCatching { context.unbindService(it) } }
        networkCallback?.let { cb ->
            runCatching {
                context.getSystemService(ConnectivityManager::class.java)
                    ?.unregisterNetworkCallback(cb)
            }
        }
        scope.cancel()
        _isReady.value = false
    }
}
