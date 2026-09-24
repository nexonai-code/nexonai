package com.nexonai.unpruuf.domain.network.ratchet

/**
 * Double Ratchet message header (Signal spec §"Sending/receiving": `dh`, `pn`, `n`).
 *
 * Travels in the clear alongside the ciphertext — it is not secret, only
 * authenticated (folded into the AEAD associated data by [DoubleRatchet]) — so the
 * receiver can locate the right chain/message key before it can decrypt anything.
 *
 * Wire layout, fixed 40 bytes: `dhPub(32) | pn(4, big-endian) | n(4, big-endian)`.
 */
data class RatchetHeader(
    /** Sender's current ratchet public key (raw X25519, 32 bytes). */
    val dhPub: ByteArray,
    /** Length of the sender's previous sending chain (messages sent before their last DH step). */
    val previousChainLength: Int,
    /** Index of this message within the sender's current sending chain. */
    val messageNumber: Int,
) {
    fun encode(): ByteArray {
        require(dhPub.size == DH_KEY_LEN) { "dhPub must be $DH_KEY_LEN bytes" }
        val out = ByteArray(SIZE)
        System.arraycopy(dhPub, 0, out, 0, DH_KEY_LEN)
        writeInt(out, DH_KEY_LEN, previousChainLength)
        writeInt(out, DH_KEY_LEN + 4, messageNumber)
        return out
    }

    override fun equals(other: Any?): Boolean =
        other is RatchetHeader &&
            dhPub.contentEquals(other.dhPub) &&
            previousChainLength == other.previousChainLength &&
            messageNumber == other.messageNumber

    override fun hashCode(): Int {
        var result = dhPub.contentHashCode()
        result = 31 * result + previousChainLength
        result = 31 * result + messageNumber
        return result
    }

    companion object {
        const val DH_KEY_LEN = 32
        const val SIZE = DH_KEY_LEN + 4 + 4

        fun decode(raw: ByteArray, offset: Int = 0): RatchetHeader {
            require(raw.size - offset >= SIZE) { "truncated ratchet header" }
            val dhPub = raw.copyOfRange(offset, offset + DH_KEY_LEN)
            val pn = readInt(raw, offset + DH_KEY_LEN)
            val n = readInt(raw, offset + DH_KEY_LEN + 4)
            return RatchetHeader(dhPub, pn, n)
        }

        private fun writeInt(out: ByteArray, at: Int, value: Int) {
            out[at] = (value ushr 24).toByte()
            out[at + 1] = (value ushr 16).toByte()
            out[at + 2] = (value ushr 8).toByte()
            out[at + 3] = value.toByte()
        }

        private fun readInt(raw: ByteArray, at: Int): Int =
            ((raw[at].toInt() and 0xFF) shl 24) or
                ((raw[at + 1].toInt() and 0xFF) shl 16) or
                ((raw[at + 2].toInt() and 0xFF) shl 8) or
                (raw[at + 3].toInt() and 0xFF)
    }
}
