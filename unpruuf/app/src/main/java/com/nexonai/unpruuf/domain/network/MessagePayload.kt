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
    /** Pro Groups: `[3][group id: 8 bytes][member count incl. sender: 1 byte][UTF-8 text]`. */
    private const val TYPE_GROUP_TEXT: Byte = 3
    const val GROUP_ID_BYTES = 8

    sealed class Content {
        data class Text(val text: String) : Content()
        data class Attachment(val name: String, val bytes: ByteArray, val isImage: Boolean) : Content()
        /** A message to a group, delivered as an ordinary 1:1 message from one member (see domain/group/). */
        class Group(val groupId: ByteArray, val memberCount: Int, val text: String) : Content()
    }

    fun encodeText(text: String): ByteArray = byteArrayOf(TYPE_TEXT) + text.toByteArray(Charsets.UTF_8)

    fun encodeGroupText(groupId: ByteArray, memberCount: Int, text: String): ByteArray {
        require(groupId.size == GROUP_ID_BYTES) { "group id must be $GROUP_ID_BYTES bytes" }
        require(memberCount in 1..255) { "member count out of range" }
        return byteArrayOf(TYPE_GROUP_TEXT) + groupId + byteArrayOf(memberCount.toByte()) + text.toByteArray(Charsets.UTF_8)
    }

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
            TYPE_GROUP_TEXT -> {
                if (raw.size < 2 + GROUP_ID_BYTES) return null
                Content.Group(
                    groupId = raw.copyOfRange(1, 1 + GROUP_ID_BYTES),
                    memberCount = raw[1 + GROUP_ID_BYTES].toInt() and 0xFF,
                    text = String(raw, 2 + GROUP_ID_BYTES, raw.size - 2 - GROUP_ID_BYTES, Charsets.UTF_8)
                )
            }
            else -> null
        }
    }
}
