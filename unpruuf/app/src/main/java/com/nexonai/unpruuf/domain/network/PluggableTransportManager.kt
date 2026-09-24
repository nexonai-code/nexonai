package com.nexonai.unpruuf.domain.network

import IPtProxy.Controller
import IPtProxy.OnTransportEvents
import IPtProxy.SnowflakeProxy
import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Starts the local obfs4/Snowflake client proxies (via Guardian Project's IPtProxy) that
 * TorManager.applyBridges() plugs into Tor as `ClientTransportPlugin ... socks5 127.0.0.1:<port>`.
 * This is the implementation behind the hook comment that used to live in applyBridges().
 *
 * THIRD PASS, most of it now confirmed against real Android Studio compile errors (not guesses):
 * `OnTransportEvents` is a top-level type in the `IPtProxy` package (not nested inside a class
 * also called `IPtProxy`, unlike what the project's README's own code sample implied — that
 * sample apparently doesn't match package layout as of the 5.5.1 version this app depends on).
 * `Controller(stateDir, enableLogging, unsafeLogging, logLevel, OnTransportEvents)`,
 * `controller.start(name, bridges)`, and `controller.port(name): Long` are all confirmed to
 * resolve. `SnowflakeProxy`'s `capacity`/`brokerUrl`/`relayUrl`/`stunServer` properties are
 * confirmed too; `frontDomain` and `proxy.port` are confirmed NOT to exist and have been
 * removed/replaced. **Still unconfirmed:** whether `controller.port("snowflake")` is really how a
 * running `SnowflakeProxy`'s port is read (see `startSnowflake()`'s comment) — everything else in
 * this file has now been checked against a real compiler, so this is the one thing most likely to
 * still need a fix if Snowflake bridges don't actually work end-to-end.
 *
 * Safety invariant this preserves (do not weaken): TorManager.applyBridges() must only add
 * `ClientTransportPlugin`/PT bridge lines for a transport that actually reports a live local
 * port here. If a PT fails to start (missing/incompatible native library, wrong API below,
 * anything), this returns no port for it and applyBridges() falls back to `UseBridges 0` exactly
 * as it did before pluggable-transport support existed — Tor itself must never be put in a
 * broken, half-configured bridge state.
 */
@Singleton
class PluggableTransportManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
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
     * Starts whichever of obfs4/Snowflake the user has configured PT bridge lines for
     * (see [BridgeManager.pluggableTransportLines]) and isn't already running. Returns the
     * transport name → local SOCKS port for every transport that is now actually live.
     * Never throws — any failure just means that transport is absent from the result.
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
        // Confirmed against a real Android Studio build: controller.start(name, bridges) and
        // controller.port(name) both exist and resolve — the only thing wrong in the previous
        // pass was port()'s return type (Long, not Int; gomobile maps Go's int to Kotlin Long).
        controller.start("obfs4", null)
        val port = controller.port("obfs4")
        if (port > 0) port.toInt() else null
    }.getOrNull()

    private fun startSnowflake(): Int? = runCatching {
        val proxy = SnowflakeProxy().apply {
            // 0 = pure client, don't also volunteer this device as a public relay for others'
            // Snowflake traffic. capacity/brokerUrl/relayUrl/stunServer are confirmed real
            // property names (no error against them in the build that flagged frontDomain/port
            // below as wrong); capacity's type/semantics beyond "0 = client-only" not further verified.
            capacity = 0L
            brokerUrl = "https://snowflake-broker.torproject.net/"
            relayUrl = "wss://snowflake.torproject.net/"
            stunServer = "stun:stun.l.google.com:19302"
        }
        proxy.start()
        snowflakeProxy = proxy
        // proxy.port doesn't exist (confirmed unresolved). Reusing controller.port(name) — same
        // call obfs4 above uses — on the theory both transports register with the same Controller
        // and expose their port the same way. UNCONFIRMED for "snowflake" specifically: if this
        // throws/returns 0, Ctrl-click into SnowflakeProxy in Android Studio to find its real
        // port accessor and paste it back — isolated to this one line.
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
