package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectionPathsTest {

    private val goodObfs4 = "obfs4 37.218.245.14:38224 D9A82D2F9C2F65A18407B1D2B764F130847F8B5D cert=bjRaMrr1BRiAW8IE9U5z27fQaYgOhX1UCmOpg2pFpoMvo6ZgQMzLsaTzzQNTlm7hNcb+Sg iat-mode=0"

    @Test fun `order without remembered path starts direct then obfs4 then snowflake`() {
        assertEquals(
            listOf(TorPath.DIRECT, TorPath.OBFS4, TorPath.SNOWFLAKE),
            ConnectionPaths.order(null, hasCompanyBridge = false, preferRemembered = true)
        )
    }

    @Test fun `company bridge comes right after direct`() {
        assertEquals(
            listOf(TorPath.DIRECT, TorPath.COMPANY, TorPath.OBFS4, TorPath.SNOWFLAKE),
            ConnectionPaths.order(null, hasCompanyBridge = true, preferRemembered = false)
        )
    }

    @Test fun `remembered path goes first at app start only`() {
        assertEquals(
            listOf(TorPath.SNOWFLAKE, TorPath.DIRECT, TorPath.OBFS4),
            ConnectionPaths.order(TorPath.SNOWFLAKE, hasCompanyBridge = false, preferRemembered = true)
        )
        assertEquals(
            listOf(TorPath.DIRECT, TorPath.OBFS4, TorPath.SNOWFLAKE),
            ConnectionPaths.order(TorPath.SNOWFLAKE, hasCompanyBridge = false, preferRemembered = false)
        )
    }

    @Test fun `a remembered company path is ignored when the company bridge is gone`() {
        assertEquals(
            listOf(TorPath.DIRECT, TorPath.OBFS4, TorPath.SNOWFLAKE),
            ConnectionPaths.order(TorPath.COMPANY, hasCompanyBridge = false, preferRemembered = true)
        )
    }

    @Test fun `budgets are positive and snowflake gets the longest`() {
        val all = TorPath.values().map { ConnectionPaths.budgetSeconds(it) }
        assertTrue(all.all { it > 0 })
        assertEquals(ConnectionPaths.budgetSeconds(TorPath.SNOWFLAKE), all.max())
    }

    @Test fun `bootstrap progress is read from Tor's status line`() {
        assertEquals(85, ConnectionPaths.parseBootstrapProgress("NOTICE BOOTSTRAP PROGRESS=85 TAG=loading_descriptors SUMMARY=\"Loading relay descriptors\""))
        assertEquals(100, ConnectionPaths.parseBootstrapProgress("NOTICE BOOTSTRAP PROGRESS=100 TAG=done SUMMARY=\"Done\""))
        assertEquals(-1, ConnectionPaths.parseBootstrapProgress(null))
        assertEquals(-1, ConnectionPaths.parseBootstrapProgress("garbage"))
    }

    @Test fun `every built-in line passes the shape check`() {
        assertEquals(ConnectionPaths.BUILT_IN_OBFS4.size, ConnectionPaths.BUILT_IN_OBFS4.count { ConnectionPaths.cleanCompanyBridgeLine(it) != null })
        assertTrue(ConnectionPaths.BUILT_IN_SNOWFLAKE.all { it.startsWith("snowflake ") })
    }

    @Test fun `company bridge lines accept obfs4 and plain IP port, and strip a leading Bridge`() {
        assertEquals(goodObfs4, ConnectionPaths.cleanCompanyBridgeLine(goodObfs4))
        assertEquals(goodObfs4, ConnectionPaths.cleanCompanyBridgeLine("Bridge $goodObfs4"))
        assertNotNull(ConnectionPaths.cleanCompanyBridgeLine("203.0.113.9:443 D9A82D2F9C2F65A18407B1D2B764F130847F8B5D"))
        assertNotNull(ConnectionPaths.cleanCompanyBridgeLine("203.0.113.9:443"))
    }

    @Test fun `company bridge lines reject anything else`() {
        assertNull(ConnectionPaths.cleanCompanyBridgeLine(""))
        assertNull(ConnectionPaths.cleanCompanyBridgeLine("obfs4 1.2.3.4:443 short cert=abc"))
        assertNull(ConnectionPaths.cleanCompanyBridgeLine("obfs4 1.2.3.4:443 D9A82D2F9C2F65A18407B1D2B764F130847F8B5D"))
        assertNull(ConnectionPaths.cleanCompanyBridgeLine("webtunnel 1.2.3.4:443 D9A82D2F9C2F65A18407B1D2B764F130847F8B5D url=https://x/y"))
        assertNull(ConnectionPaths.cleanCompanyBridgeLine("$goodObfs4\nBridge evil"))
        assertNull(ConnectionPaths.cleanCompanyBridgeLine("x".repeat(700)))
        // Tor config injection: a newline must never get through
        assertNull(ConnectionPaths.cleanCompanyBridgeLine("203.0.113.9:443\nControlPort 1"))
    }

    @Test fun `lines are distinct and capped`() {
        val many = (1..30).map { "203.0.113.$it:443" }
        assertEquals(ConnectionPaths.MAX_COMPANY_LINES, ConnectionPaths.cleanCompanyBridgeLines(many).size)
        assertEquals(1, ConnectionPaths.cleanCompanyBridgeLines(listOf(goodObfs4, goodObfs4, "junk")).size)
    }

    @Test fun `node list file carries the company bridge and ignores a broken bridge line`() {
        val file = listOf(
            "unpruuf-node-list:v1", "name: Acme", "secret: abcdefghijklmnopqrstuvwxyz012345",
            "count: 1", "bridge: $goodObfs4", "bridge: not a bridge", "", "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefab.onion"
        ).joinToString("\n")
        val parsed = NodeListFile.parse(file)
        assertNotNull(parsed)
        assertEquals(listOf(goodObfs4), parsed!!.bridges)
        assertEquals(1, parsed.addresses.size)
    }

    @Test fun `node list file without bridge has none`() {
        val file = listOf("unpruuf-node-list:v1", "name: A", "secret: abcdefghijklmnopqrstuvwxyz012345", "count: 1", "", "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefab.onion").joinToString("\n")
        assertEquals(emptyList<String>(), NodeListFile.parse(file)!!.bridges)
    }
}
