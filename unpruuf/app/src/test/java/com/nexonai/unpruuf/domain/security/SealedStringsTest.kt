package com.nexonai.unpruuf.domain.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SealedStringsTest {
    private class MapStore : StringStore {
        val map = mutableMapOf<String, String>()
        override fun get(key: String) = map[key]
        override fun put(key: String, value: String) { map[key] = value }
    }

    // Not real encryption: just enough that plain text is visibly not stored as is.
    private fun xor(b: ByteArray) = ByteArray(b.size) { (b[it].toInt() xor 0x5A).toByte() }
    private fun sealedOn(store: StringStore) = SealedStrings(store, ::xor, ::xor)

    private val secret = "unpruuf-node-owner:v1:abcdefghijklmnop.onion:SuperSecretOwnerSecret123"

    @Test fun storedValueIsNotPlainTextAndReadsBack() {
        val store = MapStore()
        val s = sealedOn(store)
        s.put("my_nodes", secret)
        val raw = store.map.getValue("my_nodes")
        assertTrue(raw.startsWith("k1:"))
        assertFalse(raw.contains("SuperSecretOwnerSecret123"))
        assertEquals(secret, s.get("my_nodes"))
    }

    @Test fun plainValueFromAnOlderVersionIsReadAndThenRewrittenEncrypted() {
        val store = MapStore().apply { map["my_nodes"] = secret }
        val s = sealedOn(store)
        assertEquals(secret, s.get("my_nodes"))
        assertTrue(store.map.getValue("my_nodes").startsWith("k1:"))
        assertFalse(store.map.getValue("my_nodes").contains("SuperSecret"))
        assertEquals(secret, s.get("my_nodes"))
    }

    @Test fun missingKeyGivesTheDefault() {
        val s = sealedOn(MapStore())
        assertEquals("", s.get("nothing"))
        assertEquals("x", s.get("nothing", "x"))
    }

    @Test fun anUnreadableSealedValueGivesTheDefaultInsteadOfCrashing() {
        val store = MapStore().apply { map["my_nodes"] = "k1:not-base64-@@@" }
        assertEquals("", sealedOn(store).get("my_nodes"))
        val wrongKey = SealedStrings(store, ::xor) { throw IllegalStateException("key gone") }
        store.map["a"] = "k1:" + java.util.Base64.getEncoder().encodeToString(xor("hi".toByteArray()))
        assertEquals("", wrongKey.get("a"))
    }

    @Test fun emptyValuesAreAllowed() {
        val s = sealedOn(MapStore())
        s.put("k", "")
        assertEquals("", s.get("k", "fallback"))
    }
}
