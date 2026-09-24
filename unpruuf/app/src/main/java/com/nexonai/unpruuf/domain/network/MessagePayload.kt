package com.nexonai.unpruuf.domain.network

/**
 * Binary layout of the plaintext a Double Ratchet message carries: `[type: 1 byte][payload]`.
 * Lives *inside* the ratchet ciphertext — see [P2PNetworkManager] for the outer chunking/framing
 * that wraps the ciphertext itself.
 */
object MessagePayload {

    private const val TYPE_TEXT: Byte = 0
    private const val TYPE_FILE: Byte = 1
    private const val TYPE_IMAGE: Byte = 2

    sealed class Content {
        data class Text(val text: String) : Content()
        data class Attachment(val name: String, val bytes: ByteArray, val isImage: Boolean) : Content()
    }

    fun encodeText(text: String): ByteArray = byteArrayOf(TYPE_TEXT) + text.toByteArray(Charsets.UTF_8)

    fun encodeAttachment(name: String, bytes: ByteArray, isImage: Boolean): ByteArray {
        val nameBytes = name.toByteArray(Charsets.UTF_8)
        require(nameBytes.size <= 0xFFFF) { "file name too long" }
        val out = ByteArray(1 + 2 + nameBytes.size + bytes.size)
        out[0] = if (isImage) TYPE_IMAGE else TYPE_FILE
        out[1] = (nameBytes.size ushr 8).toByte()
        out[2] = nameBytes.size.toByte()
        System.arraycopy(nameBytes, 0, out, 3, nameBytes.size)
        System.arraycopy(bytes, 0, out, 3 + nameBytes.size, bytes.size)
        return out
    }

    fun decode(raw: ByteArray): Content? {
        if (raw.isEmpty()) return null
        return when (raw[0]) {
            TYPE_TEXT -> Content.Text(String(raw, 1, raw.size - 1, Charsets.UTF_8))
            TYPE_FILE, TYPE_IMAGE -> {
                if (raw.size < 3) return null
                val nameLen = ((raw[1].toInt() and 0xFF) shl 8) or (raw[2].toInt() and 0xFF)
                if (raw.size < 3 + nameLen) return null
                val name = String(raw, 3, nameLen, Charsets.UTF_8)
                val bytes = raw.copyOfRange(3 + nameLen, raw.size)
                Content.Attachment(name, bytes, isImage = raw[0] == TYPE_IMAGE)
            }
            else -> null
        }
    }
}
