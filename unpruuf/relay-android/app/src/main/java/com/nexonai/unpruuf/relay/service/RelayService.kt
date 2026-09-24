package com.nexonai.unpruuf.relay.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.nexonai.unpruuf.relay.MainActivity
import com.nexonai.unpruuf.relay.core.BlobStore
import com.nexonai.unpruuf.relay.core.RelayBridgeManager
import com.nexonai.unpruuf.relay.core.RelayConstants
import com.nexonai.unpruuf.relay.core.RelayEventLog
import com.nexonai.unpruuf.relay.core.RelayIdentity
import com.nexonai.unpruuf.relay.core.buildConnectionString
import com.nexonai.unpruuf.relay.net.RelayHttpServer
import com.nexonai.unpruuf.relay.net.RelayPluggableTransportManager
import com.nexonai.unpruuf.relay.net.RelayTorManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Owns the whole relay: the Tor hidden service, the embedded HTTP server, the blob store, and
 * the periodic TTL sweep — the Android counterpart of unpruuf/server/src/index.ts's bootstrap.
 * Runs as a foreground service (not just a background one) because other people's queued
 * messages depend on this staying up even while the phone's screen is off — the exact same
 * reasoning the main unpruuf app's TorForegroundService already documents for its own
 * wakelock, applied here to a device other people are relying on rather than just its owner.
 */
class RelayService : Service() {

    inner class LocalBinder : Binder() {
        val service: RelayService get() = this@RelayService
    }

    private val binder = LocalBinder()
    override fun onBind(intent: Intent?): IBinder = binder

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var wakeLock: PowerManager.WakeLock? = null

    private lateinit var identity: RelayIdentity
    private lateinit var blobStore: BlobStore
    private lateinit var bridgeManager: RelayBridgeManager
    private lateinit var torManager: RelayTorManager
    private var httpServer: RelayHttpServer? = null

    val isReady: StateFlow<Boolean> get() = torManager.isReady
    val onionAddress: StateFlow<String?> get() = torManager.onionAddress

    // Held as a StateFlow (not read fresh from RelayIdentity each time) specifically so
    // regenerateToken() below can make `connectionString` recompute reactively — a plain
    // `identity.authToken` getter read once into `combine()` would never notice a later
    // rotation.
    private val _authToken = MutableStateFlow("")
    val authToken: String get() = _authToken.value

    private val _ttlHours = MutableStateFlow(RelayConstants.DEFAULT_TTL_HOURS)
    val ttlHours: StateFlow<Int> = _ttlHours.asStateFlow()

    private val _queuedCount = MutableStateFlow(0L)
    val queuedCount: StateFlow<Long> = _queuedCount.asStateFlow()

    /** What's actually passing through this relay right now — see RelayEventLog's own doc
     *  comment for exactly what is (and isn't) recorded. Surfaced in RelayScreen so Gabriel can
     *  see message flow and timing on-device, without adb/logcat. */
    val activityLog: StateFlow<List<RelayEventLog.Entry>> get() = RelayEventLog.entries
    fun clearActivityLog() = RelayEventLog.clear()

    /** Full pairing string for this relay right now, or null until the onion is published. */
    val connectionString: StateFlow<String?> get() = _connectionString
    private val _connectionString = MutableStateFlow<String?>(null)

    private val _bridgesEnabled = MutableStateFlow(false)
    val bridgesEnabled: StateFlow<Boolean> = _bridgesEnabled.asStateFlow()

    private val _bridgeText = MutableStateFlow("")
    val bridgeText: StateFlow<String> = _bridgeText.asStateFlow()

    private val _bridgeStatus = MutableStateFlow<String?>(null)
    val bridgeStatus: StateFlow<String?> = _bridgeStatus.asStateFlow()

    override fun onCreate() {
        super.onCreate()
        identity = RelayIdentity(applicationContext)
        blobStore = BlobStore(applicationContext)
        bridgeManager = RelayBridgeManager(applicationContext)
        _ttlHours.value = identity.ttlHours
        _authToken.value = identity.authToken
        _bridgesEnabled.value = bridgeManager.isEnabled()
        _bridgeText.value = bridgeManager.getBridgeText()
        torManager = RelayTorManager(
            context = applicationContext,
            getPrivKey = { identity.torPrivKey },
            savePrivKey = { identity.torPrivKey = it },
            bridgeManager = bridgeManager,
            pluggableTransportManager = RelayPluggableTransportManager(applicationContext)
        )
        createNotificationChannel()
        acquireWakeLock()

        scope.launch {
            combine(torManager.onionAddress, _authToken) { onion, token ->
                onion?.let { buildConnectionString(it, token) }
            }.collect { _connectionString.value = it }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification("Starting…"))
        startRelay()
        return START_STICKY
    }

    private fun acquireWakeLock() {
        if (wakeLock != null) return
        val pm = getSystemService(POWER_SERVICE) as? PowerManager ?: return
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "unpruuf-relay:tor").apply {
            setReferenceCounted(false)
            runCatching { acquire() }
        }
    }

    // onStartCommand can fire more than once for an already-running service — e.g. the user
    // backgrounds and reopens MainActivity, which unconditionally calls
    // startForegroundService() again. Without this guard, every such call would launch a
    // fresh set of the coroutine loops below (sweep, count-refresh, notification-update) on
    // top of the ones already running — each individually harmless (idempotent work), but
    // wasteful and messy. torManager.start()/the httpServer null-check already handle their
    // own idempotency; this guard covers the loops that don't.
    private var relayStarted = false

    private fun startRelay() {
        if (httpServer == null) {
            httpServer = RelayHttpServer(RelayConstants.LOCAL_HTTP_PORT, blobStore) { identity.authToken }
            runCatching { httpServer?.start() }
        }
        torManager.start()

        if (relayStarted) return
        relayStarted = true

        scope.launch {
            torManager.isReady.collect { ready ->
                updateNotification(if (ready) "Relay active" else "Connecting to Tor…")
            }
        }
        scope.launch {
            while (isActive) {
                delay(RelayConstants.SWEEP_INTERVAL_MS)
                val ttlMs = _ttlHours.value * 3_600_000L
                val removed = runCatching { blobStore.sweepExpired(ttlMs) }.getOrDefault(0)
                if (removed > 0) refreshQueuedCount()
            }
        }
        scope.launch {
            while (isActive) {
                refreshQueuedCount()
                delay(5_000)
            }
        }
    }

    private fun refreshQueuedCount() {
        _queuedCount.value = runCatching { blobStore.count() }.getOrDefault(0L)
    }

    /** Applies a new TTL immediately — persisted, and used by the sweep loop on its next run.
     *  Does not retroactively delete anything already past the OLD ttl-but-under-the-new-one;
     *  the sweep only ever deletes what's actually expired under whatever TTL is current. */
    fun setTtlHours(hours: Int) {
        identity.ttlHours = hours
        _ttlHours.value = identity.ttlHours
    }

    /** Manual, immediate reset — clears every queued message right now, regardless of TTL. */
    fun wipeAllNow() {
        scope.launch {
            runCatching { blobStore.wipeAll() }
            refreshQueuedCount()
        }
    }

    /** Rotates the bearer token. Every device paired with the OLD token loses access
     *  immediately — the UI is responsible for warning about that before calling this. */
    fun regenerateToken(): String {
        val fresh = identity.regenerateToken()
        _authToken.value = fresh
        return fresh
    }

    // ─── Censorship circumvention (bridges) ──────────────────────────────────

    fun onBridgesEnabledChange(enabled: Boolean) {
        _bridgesEnabled.value = enabled
    }

    fun onBridgeTextChange(text: String) {
        _bridgeText.value = text
    }

    /** Persists the current bridge toggle/text and applies it to the running Tor connection
     *  immediately, instead of requiring the app to be restarted. */
    fun saveBridges() {
        bridgeManager.setEnabled(_bridgesEnabled.value)
        bridgeManager.setBridgeText(_bridgeText.value)
        scope.launch {
            runCatching { torManager.reapplyBridges() }
            _bridgeStatus.value = if (_bridgesEnabled.value) "Bridges applied — reconnecting…" else "Bridges disabled — reconnecting…"
        }
    }

    fun clearBridgeStatus() {
        _bridgeStatus.value = null
    }

    private fun buildNotification(status: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("unpruuf Relay")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_menu_send)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(status: String) {
        getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, buildNotification(status))
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "unpruuf Relay status",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Shows whether this relay is reachable"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }

    override fun onDestroy() {
        runCatching { httpServer?.stop() }
        torManager.stop()
        runCatching { wakeLock?.let { if (it.isHeld) it.release() } }
        wakeLock = null
        runCatching { blobStore.close() }
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_ID = "unpruuf_relay_channel"
        const val NOTIFICATION_ID = 2001
    }
}
