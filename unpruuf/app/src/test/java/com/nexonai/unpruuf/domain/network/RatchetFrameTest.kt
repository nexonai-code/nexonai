package com.nexonai.unpruuf.domain.network

import com.nexonai.unpruuf.domain.network.ratchet.RatchetHeader
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.security.SecureRandom

/**
 * [NetworkObfuscation.PACKET_SIZE] used to be a hard cap on the whole message — anything the
 * outer static-AES layer produced over ~4088 bytes was silently dropped in [P2PNetworkManager],
 * which is why photos never worked (see STATUS.md, "on hold" item 8). These tests exercise the
 * chunking that replaces that assumption, including the explicit chunk index added when chunked
 * transfers became relay-eligible too (a polled mailbox can deliver pieces out of order across
 * retries/transports, unlike direct delivery's guaranteed in-order arrival).
 */
class RatchetFrameTest {

    private val rng = SecureRandom()
    private val header = RatchetHeader(ByteArray(32) { (it + 1).toByte() }, previousChainLength = 3, messageNumber = 7)

    /** Reassembles frames by their explicit index, in the order given — simulates in-order arrival. */
    private fun reassemble(ciphertext: ByteArray): Pair<List<RatchetFrame.Frame>, ByteArray> {
        val frames = RatchetFrame.split(header, ciphertext)
        val decoded = frames.map { RatchetFrame.decode(RatchetFrame.encode(it))!! }
        decoded.forEach { assertEqualsOrLess(RatchetFrame.encode(it).size + 28, 4088) }
        return decoded to reassembleByIndex(decoded)
    }

    /** Reassembles a set of decoded frames purely from their [RatchetFrame.Frame.ChunkCont.index] /
     *  the implicit index-0 of [RatchetFrame.Frame.ChunkStart] — order of the input list doesn't matter. */
    private fun reassembleByIndex(decoded: List<RatchetFrame.Frame>): ByteArray {
        if (decoded.size == 1) return (decoded[0] as RatchetFrame.Frame.Single).ciphertext
        val start = decoded.filterIsInstance<RatchetFrame.Frame.ChunkStart>().single()
        val slots = arrayOfNulls<ByteArray>(start.totalChunks)
        slots[0] = start.piece
        decoded.filterIsInstance<RatchetFrame.Frame.ChunkCont>().forEach { slots[it.index] = it.piece }
        assertEquals("every slot must be filled", true, slots.all { it != null })
        val buf = java.io.ByteArrayOutputStream()
        slots.forEach { buf.write(it!!) }
        return buf.toByteArray()
    }

    private fun assertEqualsOrLess(actual: Int, max: Int) {
        org.junit.Assert.assertTrue("$actual should be <= $max", actual <= max)
    }

    @Test
    fun `empty ciphertext round-trips as a single frame`() {
        val (frames, out) = reassemble(ByteArray(0))
        assertEquals(1, frames.size)
        assertArrayEquals(ByteArray(0), out)
    }

    @Test
    fun `text-sized ciphertext round-trips as a single frame`() {
        val ciphertext = "hello unpruuf".toByteArray()
        val (frames, out) = reassemble(ciphertext)
        assertEquals(1, frames.size)
        assertArrayEquals(ciphertext, out)
    }

    @Test
    fun `ciphertext exactly at the chunk boundary stays a single frame`() {
        val ciphertext = ByteArray(RatchetFrame.CIPHERTEXT_CHUNK_SIZE).also { rng.nextBytes(it) }
        val (frames, out) = reassemble(ciphertext)
        assertEquals(1, frames.size)
        assertArrayEquals(ciphertext, out)
    }

    @Test
    fun `one byte over the boundary splits into two frames`() {
        val ciphertext = ByteArray(RatchetFrame.CIPHERTEXT_CHUNK_SIZE + 1).also { rng.nextBytes(it) }
        val (frames, out) = reassemble(ciphertext)
        assertEquals(2, frames.size)
        assertArrayEquals(ciphertext, out)
    }

    @Test
    fun `a 2MB photo splits into many frames and reassembles correctly`() {
        val ciphertext = ByteArray(2 * 1024 * 1024).also { rng.nextBytes(it) }
        val (frames, out) = reassemble(ciphertext)
        assertEquals(525, frames.size)
        assertArrayEquals(ciphertext, out)
    }

    @Test
    fun `a 5MB file (the app's max) splits into the expected chunk count`() {
        val ciphertext = ByteArray(5 * 1024 * 1024).also { rng.nextBytes(it) }
        val (frames, out) = reassemble(ciphertext)
        // ceil(5*1024*1024 / 4000) — must stay comfortably under the relay's MAX_BLOBS_PER_TAG (1500).
        assertEquals(1311, frames.size)
        assertArrayEquals(ciphertext, out)
    }

    @Test
    fun `each ChunkCont carries its own index, not implied by position`() {
        val ciphertext = ByteArray(RatchetFrame.CIPHERTEXT_CHUNK_SIZE * 5).also { rng.nextBytes(it) }
        val frames = RatchetFrame.split(header, ciphertext)
        val conts = frames.filterIsInstance<RatchetFrame.Frame.ChunkCont>()
        assertEquals(listOf(1, 2, 3, 4), conts.map { it.index })
    }

    @Test
    fun `reassembly is correct even when ChunkCont frames arrive completely out of order`() {
        // The core regression test for why relay-eligible chunked transfers are safe: the relay
        // is a polled mailbox, not a live socket — nothing here should assume arrival order.
        val ciphertext = ByteArray(RatchetFrame.CIPHERTEXT_CHUNK_SIZE * 20 + 123).also { rng.nextBytes(it) }
        val frames = RatchetFrame.split(header, ciphertext)
        val encoded = frames.map { RatchetFrame.encode(it) }
        val decoded = encoded.map { RatchetFrame.decode(it)!! }.shuffled(java.util.Random(42))
        assertArrayEquals(ciphertext, reassembleByIndex(decoded))
    }

    @Test
    fun `reassembly tolerates a duplicate (retransmitted) chunk arriving twice`() {
        val ciphertext = ByteArray(RatchetFrame.CIPHERTEXT_CHUNK_SIZE * 3 + 50).also { rng.nextBytes(it) }
        val frames = RatchetFrame.split(header, ciphertext)
        val decoded = frames.map { RatchetFrame.decode(RatchetFrame.encode(it))!! }
        // Simulate index 1 arriving twice (e.g. a retry that wasn't actually needed).
        val withDuplicate = decoded + decoded.filterIsInstance<RatchetFrame.Frame.ChunkCont>().first { it.index == 1 }
        assertArrayEquals(ciphertext, reassembleByIndex(withDuplicate.shuffled(java.util.Random(7))))
    }

    @Test
    fun `malformed input decodes to null instead of throwing`() {
        assertNull(RatchetFrame.decode(ByteArray(0)))
        assertNull(RatchetFrame.decode(byteArrayOf(RatchetFrame.KIND_SINGLE, 1, 2)))
        assertNull(RatchetFrame.decode(byteArrayOf(99, 1, 2, 3)))
        // ChunkCont with no room for the 4-byte index.
        assertNull(RatchetFrame.decode(byteArrayOf(RatchetFrame.KIND_CHUNK_CONT, 1, 2)))
        // ChunkCont with index 0 — reserved for ChunkStart's own piece, never valid on the wire.
        assertNull(RatchetFrame.decode(byteArrayOf(RatchetFrame.KIND_CHUNK_CONT, 0, 0, 0, 0, 9, 9)))
    }
}
