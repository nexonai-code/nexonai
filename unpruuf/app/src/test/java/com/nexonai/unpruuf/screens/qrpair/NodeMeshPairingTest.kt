package com.nexonai.unpruuf.screens.qrpair

import com.nexonai.unpruuf.domain.network.NodeMeshManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class NodeMeshPairingTest {

    private val payload = NodeMeshPairingPayload(
        messageKeyBase64 = "bWVzc2FnZUtleQ==",
        x25519RatchetPublicKeyBase64 = "cmF0Y2hldEtleQ==",
        nodeMeshRoutingSeedBase64 = "cm91dGluZ1NlZWQ=",
        nodeAddresses = listOf(
            NodeMeshManager.NODE_ADDRESS_PREFIX + "abcdefghijklmnop.onion:80",
            NodeMeshManager.NODE_ADDRESS_PREFIX + "qrstuvwxyz234567.onion:80"
        ),
        appEdition = "pro"
    )

    @Test
    fun `encoded QR carries no user id`() {
        val json = nodeMeshPayloadToJson(payload)
        assertFalse(json.contains("\"u\""))
        assertEquals(2, parseSimpleJson(json)["v"]?.toInt())
    }

    @Test
    fun `round trip preserves every field`() {
        val parsed = jsonToNodeMeshPayload(nodeMeshPayloadToJson(payload))
        assertEquals(payload, parsed)
    }

    @Test
    fun `v1 QR with user id still parses and ignores it`() {
        val v1 = """{"v":1,"u":"0123456789abcdef0123456789abcdef","p":"bWVzc2FnZUtleQ==","k":"cmF0Y2hldEtleQ==","s":"cm91dGluZ1NlZWQ=","n":"abcdefghijklmnop.onion:80","e":"standard"}"""
        val parsed = jsonToNodeMeshPayload(v1)
        assertNotNull(parsed)
        assertEquals("bWVzc2FnZUtleQ==", parsed!!.messageKeyBase64)
        assertEquals(1, parsed.nodeAddresses.size)
    }

    @Test
    fun `node mesh QR is never mistaken for a cross platform QR`() {
        assertNull(jsonToCrossPlatformPayload(nodeMeshPayloadToJson(payload)))
    }

    @Test
    fun `missing routing seed is rejected`() {
        val noSeed = """{"v":2,"p":"a","k":"b","n":"abcdefghijklmnop.onion:80","e":"standard"}"""
        assertNull(jsonToNodeMeshPayload(noSeed))
    }
}
