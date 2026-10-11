package com.nexonai.unpruuf.domain.network

import IPtProxy.Controller
import IPtProxy.OnTransportEvents
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
 * Checked against a real compile and against IPtProxy 5.5.1's public API (javap): `Controller`
 * runs BOTH clients. obfs4 needs no settings; Snowflake is configured through the controller's
 * snowflakeBrokerUrl / snowflakeFrontDomains / snowflakeIceServers. Whether Snowflake really gets
 * through on a blocked network is not tested (needs a device on such a network).
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

    /**
     * The Snowflake CLIENT. (Earlier versions started IPtProxy's `SnowflakeProxy` here. That is the
     * volunteer proxy that lends this phone to OTHER people, not the client, so it never gave Tor a
     * path. Found by reading IPtProxy 5.5.1's public API: the client is the same `Controller` that
     * runs obfs4, configured through its snowflake* properties.) Broker, front domains and STUN
     * servers are the values from Tor Browser's Snowflake bridge lines ([ConnectionPaths]).
     */
    private fun startSnowflake(): Int? = runCatching {
        controller.snowflakeBrokerUrl = ConnectionPaths.SNOWFLAKE_BROKER_URL
        controller.snowflakeFrontDomains = ConnectionPaths.SNOWFLAKE_FRONT_DOMAINS
        controller.snowflakeIceServers = ConnectionPaths.SNOWFLAKE_ICE_SERVERS
        controller.start("snowflake", null)
        val port = controller.port("snowflake")
        if (port > 0) port.toInt() else null
    }.getOrNull()

    fun stopAll() {
        runCatching { if (obfs4Port != null) controller.stop("obfs4") }
        runCatching { if (snowflakePort != null) controller.stop("snowflake") }
        obfs4Port = null
        snowflakePort = null
    }
}
