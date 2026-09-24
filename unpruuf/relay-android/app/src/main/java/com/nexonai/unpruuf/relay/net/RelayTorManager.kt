package com.nexonai.unpruuf.relay.net

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.ServiceConnection
import android.os.IBinder
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.nexonai.unpruuf.relay.core.RelayBridgeManager
import com.nexonai.unpruuf.relay.core.RelayConstants
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.freehaven.tor.control.TorControlCommands
import net.freehaven.tor.control.TorControlConnection
import org.torproject.jni.TorService

/**
 * Publishes ONE fixed Tor hidden service mapping [RelayConstants.ONION_VIRTUAL_PORT] to the
 * embedded HTTP server on localhost. Directly modeled on the main unpruuf app's
 * domain/network/TorManager.kt — same TorService bind, same control-connection await pattern,
 * same addOnion call — simplified from that file's per-contact multi-onion model down to the
 * single address this relay actually needs. This is the highest-confidence part of this app:
 * it reuses a mechanism already reasoned through carefully in this exact codebase, not a new
 * one written from scratch. Bridge/pluggable-transport support (below) is the same reuse
 * applied to `TorManager.applyBridges()`.
 */
class RelayTorManager(
    private val context: Context,
    private val getPrivKey: () -> String?,
    private val savePrivKey: (String) -> Unit,
    private val bridgeManager: RelayBridgeManager,
    private val pluggableTransportManager: RelayPluggableTransportManager
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _isReady = MutableStateFlow(false)
    val isReady: StateFlow<Boolean> = _isReady.asStateFlow()

    private val _onionAddress = MutableStateFlow<String?>(null)
    val onionAddress: StateFlow<String?> = _onionAddress.asStateFlow()

    private var started = false
    private var torService: TorService? = null
    private var serviceConn: ServiceConnection? = null
    private var statusReceiver: android.content.BroadcastReceiver? = null

    fun start() {
        if (started) return
        started = true

        val receiver = object : android.content.BroadcastReceiver() {
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
        context.bindService(Intent(context, TorService::class.java), conn, Context.BIND_AUTO_CREATE)
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
            val portMap = mapOf(RelayConstants.ONION_VIRTUAL_PORT to "127.0.0.1:${RelayConstants.LOCAL_HTTP_PORT}")
            val storedKey = getPrivKey()
            val result = if (storedKey != null) ctrl.addOnion(storedKey, portMap) else ctrl.addOnion(portMap)
            val serviceId = result[TorControlCommands.HS_ADDRESS] ?: return
            result[TorControlCommands.HS_PRIVKEY]?.let(savePrivKey)
            _onionAddress.value = "$serviceId.onion"
            _isReady.value = true
        }
    }

    // Only activates bridges that will actually work: vanilla lines always, PT lines (obfs4/
    // snowflake) only for a transport that actually reported a live local SOCKS port —
    // otherwise falls back to UseBridges 0, exactly like the main messenger app's
    // TorManager.applyBridges(). A relay that fails to bootstrap Tor at all is useless to
    // everyone depending on it, not just its owner, so this must never leave Tor in a
    // half-configured bridge state.
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

            val livePorts = if (neededTransports.isEmpty()) emptyMap()
                else runCatching { pluggableTransportManager.ensureStarted(neededTransports) }.getOrDefault(emptyMap())

            if (vanilla.isEmpty() && livePorts.isEmpty()) {
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

    /** Applies a bridge-setting change immediately instead of waiting for the next Tor
     *  restart: re-sends the bridge config, then forces Tor to rebuild its connection to the
     *  network (and republish the hidden service) under the new configuration. */
    suspend fun reapplyBridges() {
        val ctrl = torService?.torControlConnection ?: return
        applyBridges(ctrl)
        runCatching {
            ctrl.setConf("DisableNetwork", "1")
            delay(1_000)
            ctrl.setConf("DisableNetwork", "0")
        }
    }

    fun stop() {
        started = false
        statusReceiver?.let {
            runCatching { LocalBroadcastManager.getInstance(context).unregisterReceiver(it) }
        }
        serviceConn?.let { runCatching { context.unbindService(it) } }
        runCatching { pluggableTransportManager.stopAll() }
        scope.cancel()
        _isReady.value = false
    }
}
