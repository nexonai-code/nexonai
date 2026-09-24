package com.nexonai.unpruuf.relay.net

import IPtProxy.Controller
import IPtProxy.OnTransportEvents
import IPtProxy.SnowflakeProxy
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Starts the local obfs4/Snowflake client proxies (via Guardian Project's IPtProxy) that
 * RelayTorManager.applyBridges() plugs into Tor as `ClientTransportPlugin ... socks5
 * 127.0.0.1:<port>`. Direct port of the main messenger app's
 * `domain/network/PluggableTransportManager.kt` — same IPtProxy API surface, same confirmed
 * (against a real Android Studio build, on the messenger app) method shapes:
 * `Controller(stateDir, enableLogging, unsafeLogging, logLevel, OnTransportEvents)`,
 * `controller.start(name, bridges)`, `controller.port(name): Long`. `SnowflakeProxy`'s
 * `capacity`/`brokerUrl`/`relayUrl`/`stunServer` are real properties; `frontDomain` and
 * `proxy.port` are confirmed NOT to exist. **Still unconfirmed** (inherited caveat from the
 * messenger app, not newly introduced here): whether `controller.port("snowflake")` is really
 * how a running `SnowflakeProxy`'s port is read — everything else here has been checked
 * against a real compiler on the sibling implementation, this one line is the most likely spot
 * to need a fix if Snowflake specifically doesn't work end-to-end.
 *
 * Safety invariant (do not weaken): RelayTorManager.applyBridges() must only add a
 * `ClientTransportPlugin`/PT bridge line for a transport that actually reports a live local
 * port here. A transport that fails to start simply isn't in the returned map — the caller
 * falls back to `UseBridges 0` exactly as if no PT bridges were configured at all, never a
 * half-configured bridge state.
 */
class RelayPluggableTransportManager(private val context: Context) {

    private var obfs4Port: Int? = null
    private var snowflakeProxy: SnowflakeProxy? = null
    private var snowflakePort: Int? = null

    private val controller: Controller by lazy {
        Controller(
            stateDir(), /* enableLogging = */ false, /* unsafeLogging = */ false, "NONE",
            object : OnTransportEvents {
                override fun connected(name: String?) {}
                override fun error(name: String?, error: Exception?) {}
                override fun stopped(name: String?, error: Exception?) {}
            }
        )
    }

    /**
     * Starts whichever of obfs4/Snowflake [neededTransports] asks for and isn't already
     * running. Returns transport name → local SOCKS port for every one that is now actually
     * live. Never throws — a failure just means that transport is absent from the result.
     */
    suspend fun ensureStarted(neededTransports: Set<String>): Map<String, Int> = withContext(Dispatchers.IO) {
        val result = mutableMapOf<String, Int>()

        if ("obfs4" in neededTransports) {
            val port = obfs4Port ?: startObfs4()?.also { obfs4Port = it }
            port?.let { result["obfs4"] = it }
        }
        if ("snowflake" in neededTransports) {
            val port = snowflakePort ?: startSnowflake()?.also { snowflakePort = it }
            port?.let { result["snowflake"] = it }
        }
        result
    }

    private fun stateDir(): String = context.getDir("pt", Context.MODE_PRIVATE).absolutePath

    private fun startObfs4(): Int? = runCatching {
        controller.start("obfs4", null)
        val port = controller.port("obfs4")
        if (port > 0) port.toInt() else null
    }.getOrNull()

    private fun startSnowflake(): Int? = runCatching {
        val proxy = SnowflakeProxy().apply {
            // 0 = pure client — don't volunteer this relay device as a public Snowflake relay
            // too; it already has one job.
            capacity = 0L
            brokerUrl = "https://snowflake-broker.torproject.net/"
            relayUrl = "wss://snowflake.torproject.net/"
            stunServer = "stun:stun.l.google.com:19302"
        }
        proxy.start()
        snowflakeProxy = proxy
        val port = controller.port("snowflake")
        if (port > 0) port.toInt() else null
    }.getOrNull()

    fun stopAll() {
        runCatching { if (obfs4Port != null) controller.stop("obfs4") }
        runCatching { snowflakeProxy?.stop() }
        obfs4Port = null
        snowflakeProxy = null
        snowflakePort = null
    }
}
