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
            NodeMeshManager.NODE_ADDRESS_PREFIX + "abcdefghijklmnopabcdefghijklmnopabcdefghijklmnopabcdefgh.onion",
            NodeMeshManager.NODE_ADDRESS_PREFIX + "qrstuvwxyz234567qrstuvwxyz234567qrstuvwxyz234567qrstuvwx.onion"
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
        val v1 = """{"v":1,"u":"0123456789abcdef0123456789abcdef","p":"bWVzc2FnZUtleQ==","k":"cmF0Y2hldEtleQ==","s":"cm91dGluZ1NlZWQ=","n":"abcdefghijklmnopabcdefghijklmnopabcdefghijklmnopabcdefgh.onion","e":"standard"}"""
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
        val noSeed = """{"v":2,"p":"a","k":"b","n":"abcdefghijklmnopabcdefghijklmnopabcdefghijklmnopabcdefgh.onion","e":"standard"}"""
        assertNull(jsonToNodeMeshPayload(noSeed))
    }

    @Test
    fun `guest invitation id and grants survive the round trip and stay out of normal codes`() {
        val grant = com.nexonai.unpruuf.domain.network.GuestGrant.issue(
            "owner-secret",
            com.nexonai.unpruuf.domain.network.GuestGrant.Spec(
                com.nexonai.unpruuf.domain.network.GuestGrant.newGrantId(), 4_000_000_000_000L, 60, 1024
            )
        )
        val invited = payload.copy(guestGrants = listOf(grant, ""), guestInviteId = "abcDEF123_-xy")
        val parsed = jsonToNodeMeshPayload(nodeMeshPayloadToJson(invited))
        assertEquals(invited, parsed)
        assertFalse(nodeMeshPayloadToJson(payload).contains("\"i\""))
        assertFalse(nodeMeshPayloadToJson(payload).contains("\"g\""))
    }

    @Test
    fun `a malformed invitation id is dropped, never trusted`() {
        for (bad in listOf("short", "has space in it!!", "x".repeat(40), "semi;colon;id;x")) {
            val json = nodeMeshPayloadToJson(payload.copy(guestInviteId = "validId1234")).replace("validId1234", bad)
            assertEquals("", jsonToNodeMeshPayload(json)?.guestInviteId)
        }
    }

    @Test
    fun `a full invitation from a Pro user reads as an invitation in the Client app`() {
        val now = 1_800_000_000_000L
        val grants = com.nexonai.unpruuf.domain.network.GuestInvite.issueGrants(
            nodes = payload.nodeAddresses.map { com.nexonai.unpruuf.domain.network.GuestInvite.OwnNode(it, "secret-$it") },
            nowMs = now, validityDays = 7,
            quota = com.nexonai.unpruuf.domain.network.GuestInvite.Quota.NORMAL
        )
        val code = nodeMeshPayloadToJson(payload.copy(guestGrants = grants, guestInviteId = "inviteId123"))
        val parsed = jsonToNodeMeshPayload(code)!!
        val check = com.nexonai.unpruuf.domain.network.GuestClient.check(parsed.nodeAddresses, parsed.guestGrants, now)
        val ok = check as com.nexonai.unpruuf.domain.network.GuestClient.Check.Ok
        assertEquals(2, ok.grants.count { it.isNotEmpty() })
        // The guest's own code answers with the same invitation id and the same nodes.
        val answer = nodeMeshPayloadToJson(payload.copy(appEdition = "client", guestInviteId = parsed.guestInviteId))
        val answered = jsonToNodeMeshPayload(answer)!!
        assertEquals("inviteId123", answered.guestInviteId)
        assertEquals(payload.nodeAddresses, answered.nodeAddresses)
        assertEquals(emptyList<String>(), answered.guestGrants)
    }

    @Test
    fun `only v3 onion names survive decoding, a code with none is refused`() {
        val mixed = payload.copy(nodeAddresses = listOf(
            NodeMeshManager.NODE_ADDRESS_PREFIX + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion",
            NodeMeshManager.NODE_ADDRESS_PREFIX + "evil.example.com",
            NodeMeshManager.NODE_ADDRESS_PREFIX + "abcdefghijklmnop.onion:80",
            NodeMeshManager.NODE_ADDRESS_PREFIX + "127.0.0.1"
        ))
        val parsed = jsonToNodeMeshPayload(nodeMeshPayloadToJson(mixed))!!
        assertEquals(listOf(NodeMeshManager.NODE_ADDRESS_PREFIX + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion"), parsed.nodeAddresses)
        val none = payload.copy(nodeAddresses = listOf(NodeMeshManager.NODE_ADDRESS_PREFIX + "evil.example.com"))
        assertEquals(null, jsonToNodeMeshPayload(nodeMeshPayloadToJson(none)))
    }

    @Test
    fun `a header injection in an address never reaches the host line`() {
        val good = payload.nodeAddresses[0].removePrefix(NodeMeshManager.NODE_ADDRESS_PREFIX)
        val json = nodeMeshPayloadToJson(payload.copy(nodeAddresses = listOf(payload.nodeAddresses[0])))
            .replace(good, "x.onion\\r\\nX-Evil: 1;" + good)
        val parsed = jsonToNodeMeshPayload(json)
        assertEquals(listOf(NodeMeshManager.NODE_ADDRESS_PREFIX + good), parsed?.nodeAddresses)
    }
}
