package com.nexonai.unpruuf.domain.network

/** The ways the app can reach the Tor network, in the order it tries them. */
enum class TorPath { DIRECT, COMPANY, OBFS4, SNOWFLAKE }

/**
 * Automatic connection: the app tries to reach Tor directly; if the network blocks that, it walks
 * through the next paths by itself until one works, and remembers which one did. The user never
 * has to paste bridge lines. Pure logic, no Android classes (unit-tested).
 *
 * Built-in public bridges are the ones Tor Browser ships (tor-browser-build, projects/tor-expert-bundle/
 * pt_config.json, taken 2026-10-11). Public default bridges can be blocked by a country or a network;
 * that is exactly why the company can add a private bridge of its own (path COMPANY, tried first).
 * Refresh these lines from the same file when a new app version is built.
 */
object ConnectionPaths {

    val BUILT_IN_OBFS4: List<String> = listOf(
        "obfs4 37.218.245.14:38224 D9A82D2F9C2F65A18407B1D2B764F130847F8B5D cert=bjRaMrr1BRiAW8IE9U5z27fQaYgOhX1UCmOpg2pFpoMvo6ZgQMzLsaTzzQNTlm7hNcb+Sg iat-mode=0",
        "obfs4 209.148.46.65:443 74FAD13168806246602538555B5521A0383A1875 cert=ssH+9rP8dG2NLDN2XuFw63hIO/9MNNinLmxQDpVa+7kTOa9/m+tGWT1SmSYpQ9uTBGa6Hw iat-mode=0",
        "obfs4 146.57.248.225:22 10A6CD36A537FCE513A322361547444B393989F0 cert=K1gDtDAIcUfeLqbstggjIw2rtgIKqdIhUlHp82XRqNSq/mtAjp1BIC9vHKJ2FAEpGssTPw iat-mode=0",
        "obfs4 45.145.95.6:27015 C5B7CD6946FF10C5B3E89691A7D3F2C122D2117C cert=TD7PbUO0/0k6xYHMPW3vJxICfkMZNdkRrb63Zhl5j9dW3iRGiCx0A7mPhe5T2EDzQ35+Zw iat-mode=0",
        "obfs4 51.222.13.177:80 5EDAC3B810E12B01F6FD8050D2FD3E277B289A08 cert=2uplIpLQ0q9+0qMFrK5pkaYRDOe460LL9WHBvatgkuRr/SL31wBOEupaMMJ6koRE6Ld0ew iat-mode=0",
        "obfs4 212.83.43.95:443 BFE712113A72899AD685764B211FACD30FF52C31 cert=ayq0XzCwhpdysn5o0EyDUbmSOx3X/oTEbzDMvczHOdBJKlvIdHHLJGkZARtT4dcBFArPPg iat-mode=1",
        "obfs4 212.83.43.74:443 39562501228A4D5E27FCA4C0C81A01EE23AE3EE4 cert=PBwr+S8JTVZo6MPdHnkTwXJPILWADLqfMGoVvhZClMq/Urndyd42BwX9YFJHZnBB3H0XCw iat-mode=1"
    )

    val BUILT_IN_SNOWFLAKE: List<String> = listOf(
        "snowflake 192.0.2.3:80 2B280B23E1107BB62ABFC40DDCC8824814F80A72 fingerprint=2B280B23E1107BB62ABFC40DDCC8824814F80A72 url=https://1098762253.rsc.cdn77.org/ fronts=app.datapacket.com,www.datapacket.com ice=stun:stun.epygi.com:3478,stun:stun.uls.co.za:3478,stun:stun.voipgate.com:3478,stun:stun.mixvoip.com:3478,stun:stun.telnyx.com:3478,stun:stun.hot-chilli.net:3478,stun:stun.fitauto.ru:3478,stun:stun.m-online.net:3478 utls-imitate=hellorandomizedalpn",
        "snowflake 192.0.2.4:80 8838024498816A039FCBBAB14E6F40A0843051FA fingerprint=8838024498816A039FCBBAB14E6F40A0843051FA url=https://1098762253.rsc.cdn77.org/ fronts=app.datapacket.com,www.datapacket.com ice=stun:stun.epygi.com:3478,stun:stun.uls.co.za:3478,stun:stun.voipgate.com:3478,stun:stun.mixvoip.com:3478,stun:stun.telnyx.com:3478,stun:stun.hot-chilli.net:3478,stun:stun.fitauto.ru:3478,stun:stun.m-online.net:3478 utls-imitate=hellorandomizedalpn"
    )

    /** Snowflake client settings, the same values as in the Snowflake bridge lines above. */
    const val SNOWFLAKE_BROKER_URL = "https://1098762253.rsc.cdn77.org/"
    const val SNOWFLAKE_FRONT_DOMAINS = "app.datapacket.com,www.datapacket.com"
    const val SNOWFLAKE_ICE_SERVERS =
        "stun:stun.epygi.com:3478,stun:stun.uls.co.za:3478,stun:stun.voipgate.com:3478,stun:stun.mixvoip.com:3478," +
        "stun:stun.telnyx.com:3478,stun:stun.hot-chilli.net:3478,stun:stun.fitauto.ru:3478,stun:stun.m-online.net:3478"

    /** How long one path gets to reach "Bootstrapped 100%" before the next one is tried. */
    fun budgetSeconds(path: TorPath): Int = when (path) {
        TorPath.DIRECT -> 30
        TorPath.COMPANY -> 40
        TorPath.OBFS4 -> 45
        TorPath.SNOWFLAKE -> 90
    }

    /**
     * The order to try. DIRECT first, then the company's own bridge (if it has one), then obfs4,
     * then Snowflake. At app start the path that worked last time goes first; after a network
     * change it does not (a new network deserves a fresh look at the fast direct path).
     */
    fun order(remembered: TorPath?, hasCompanyBridge: Boolean, preferRemembered: Boolean): List<TorPath> {
        val base = buildList {
            add(TorPath.DIRECT)
            if (hasCompanyBridge) add(TorPath.COMPANY)
            add(TorPath.OBFS4)
            add(TorPath.SNOWFLAKE)
        }
        if (!preferRemembered || remembered == null || remembered == TorPath.DIRECT || remembered !in base) return base
        return listOf(remembered) + base.filter { it != remembered }
    }

    /** "NOTICE BOOTSTRAP PROGRESS=85 TAG=... SUMMARY=..." (Tor's status/bootstrap-phase) -> 85, or -1. */
    fun parseBootstrapProgress(info: String?): Int {
        val m = Regex("PROGRESS=(\\d{1,3})").find(info ?: "") ?: return -1
        return m.groupValues[1].toInt().coerceIn(0, 100)
    }

    // ─── Bridge-line shape checks (used for company bridges that arrive in a list file) ───

    private val OBFS4_RE = Regex("^obfs4 \\S+:\\d{1,5} [0-9A-Fa-f]{40} cert=[A-Za-z0-9+/]{20,}={0,2}( iat-mode=[0-2])?$")
    private val VANILLA_RE = Regex("^(\\[[0-9a-fA-F:]+]|\\d{1,3}(\\.\\d{1,3}){3}):\\d{1,5}( [0-9A-Fa-f]{40})?$")

    /** One bridge line, with an optional leading "Bridge " removed, or null if it is not a usable line. */
    fun cleanCompanyBridgeLine(raw: String): String? {
        var s = raw.trim()
        if (s.startsWith("Bridge ", ignoreCase = true)) s = s.substring(7).trim()
        if (s.length > 600 || s.any { it.isISOControl() }) return null
        return if (OBFS4_RE.matches(s) || VANILLA_RE.matches(s)) s else null
    }

    /** Valid, distinct lines out of [raw], at most [MAX_COMPANY_LINES]. */
    fun cleanCompanyBridgeLines(raw: List<String>): List<String> =
        raw.mapNotNull { cleanCompanyBridgeLine(it) }.distinct().take(MAX_COMPANY_LINES)

    const val MAX_COMPANY_LINES = 10

    fun isObfs4(line: String): Boolean = line.startsWith("obfs4 ")
}
