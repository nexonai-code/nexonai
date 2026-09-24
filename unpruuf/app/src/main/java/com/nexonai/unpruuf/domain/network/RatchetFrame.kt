package com.nexonai.unpruuf.domain.network

import com.nexonai.unpruuf.domain.network.ratchet.RatchetHeader

/**
 * Outer wire framing for one ratchet-encrypted logical message, split across as many
 * [CIPHERTEXT_CHUNK_SIZE] pieces as needed to fit [NetworkObfuscation]'s 4096-byte packets — this
 * is what replaces the old hard 4096-byte-total message cap (which silently dropped anything
 * bigger, including any real photo/file — see STATUS.md "on hold" item 8).
 *
 * Each piece becomes its own outer packet (static-AES + padding, see
 * [CryptoManager.encryptForContact]/[NetworkObfuscation.padPacket]) and its own queued,
 * individually-ACKed delivery — see [P2PNetworkManager]. Direct delivery alone would guarantee
 * strict arrival order (the delivery queue never attempts a later item for a contact once an
 * earlier one to that same contact has failed this round) — but chunks can now also fall back to
 * the relay per-frame (a polled mailbox, not a live socket), so [ChunkCont] carries its own
 * [ChunkCont.index] instead of relying on arrival order: the receive side buffers by index and
 * only completes once every index 1..totalChunks-1 has arrived, regardless of the order they
 * actually showed up in.
 */
object RatchetFrame {
    const val KIND_SINGLE: Byte = 0
    const val KIND_CHUNK_START: Byte = 1
    const val KIND_CHUNK_CONT: Byte = 2

    /** Ciphertext bytes per outer packet — comfortably under the ~4015-4059 byte budget of every frame kind. */
    const val CIPHERTEXT_CHUNK_SIZE = 4000

    sealed class Frame {
        data class Single(val header: RatchetHeader, val ciphertext: ByteArray) : Frame()
        /** Always chunk index 0. */
        data class ChunkStart(val totalChunks: Int, val header: RatchetHeader, val piece: ByteArray) : Frame()
        /** [index] is 1-based (0 is always the ChunkStart's own piece) — never re-derived from arrival order. */
        data class ChunkCont(val index: Int, val piece: ByteArray) : Frame()
    }

    /** Splits one ratchet-encrypted message into 1+ frames, in order. */
    fun split(header: RatchetHeader, ciphertext: ByteArray): List<Frame> {
        if (ciphertext.size <= CIPHERTEXT_CHUNK_SIZE) {
            return listOf(Frame.Single(header, ciphertext))
        }
        val totalChunks = (ciphertext.size + CIPHERTEXT_CHUNK_SIZE - 1) / CIPHERTEXT_CHUNK_SIZE
        return (0 until totalChunks).map { index ->
            val start = index * CIPHERTEXT_CHUNK_SIZE
            val end = minOf(start + CIPHERTEXT_CHUNK_SIZE, ciphertext.size)
            val piece = ciphertext.copyOfRange(start, end)
            if (index == 0) Frame.ChunkStart(totalChunks, header, piece) else Frame.ChunkCont(index, piece)
        }
    }

    fun encode(frame: Frame): ByteArray = when (frame) {
        is Frame.Single -> byteArrayOf(KIND_SINGLE) + frame.header.encode() + frame.ciphertext
        is Frame.ChunkStart -> byteArrayOf(KIND_CHUNK_START) + intBytes(frame.totalChunks) + frame.header.encode() + frame.piece
        is Frame.ChunkCont -> byteArrayOf(KIND_CHUNK_CONT) + intBytes(frame.index) + frame.piece
    }

    fun decode(raw: ByteArray): Frame? {
        if (raw.isEmpty()) return null
        return when (raw[0]) {
            KIND_SINGLE -> {
                if (raw.size < 1 + RatchetHeader.SIZE) return null
                val header = RatchetHeader.decode(raw, 1)
                val ciphertext = raw.copyOfRange(1 + RatchetHeader.SIZE, raw.size)
                Frame.Single(header, ciphertext)
            }
            KIND_CHUNK_START -> {
                if (raw.size < 1 + 4 + RatchetHeader.SIZE) return null
                val totalChunks = readInt(raw, 1)
                if (totalChunks < 2) return null // a real multi-chunk transfer always has >= 2 pieces
                val header = RatchetHeader.decode(raw, 1 + 4)
                val piece = raw.copyOfRange(1 + 4 + RatchetHeader.SIZE, raw.size)
                Frame.ChunkStart(totalChunks, header, piece)
            }
            KIND_CHUNK_CONT -> {
                if (raw.size < 1 + 4) return null
                val index = readInt(raw, 1)
                if (index < 1) return null // 0 is reserved for ChunkStart's own piece
                Frame.ChunkCont(index, raw.copyOfRange(1 + 4, raw.size))
            }
            else -> null
        }
    }

    private fun intBytes(value: Int): ByteArray = byteArrayOf(
        (value ushr 24).toByte(), (value ushr 16).toByte(), (value ushr 8).toByte(), value.toByte()
    )

    private fun readInt(raw: ByteArray, at: Int): Int =
        ((raw[at].toInt() and 0xFF) shl 24) or
            ((raw[at + 1].toInt() and 0xFF) shl 16) or
            ((raw[at + 2].toInt() and 0xFF) shl 8) or
            (raw[at + 3].toInt() and 0xFF)
}
