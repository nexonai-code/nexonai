package com.nexonai.unpruuf.domain.network

import java.nio.ByteBuffer
import java.security.SecureRandom

object NetworkObfuscation {
    const val PACKET_SIZE = 4096

    fun padPacket(payload: ByteArray): ByteArray {
        require(payload.size <= PACKET_SIZE - 8) { "Payload exceeds max size" }
        val result = ByteArray(PACKET_SIZE)
        val pad = ByteArray(PACKET_SIZE - payload.size - 8).also {
            SecureRandom().nextBytes(it)
        }
        val offset = if (pad.isEmpty()) 0 else SecureRandom().nextInt(maxOf(1, pad.size / 2))
        ByteBuffer.wrap(result).putInt(payload.size).putInt(offset)
        System.arraycopy(payload, 0, result, 8 + offset, payload.size)
        System.arraycopy(pad, 0, result, 8, offset)
        return result
    }

    fun unpadPacket(packet: ByteArray): ByteArray {
        require(packet.size == PACKET_SIZE) { "Invalid packet size" }
        val buf = ByteBuffer.wrap(packet)
        val payloadSize = buf.int
        val offset = buf.int
        val payload = ByteArray(payloadSize)
        System.arraycopy(packet, 8 + offset, payload, 0, payloadSize)
        return payload
    }

    fun generateDummyPacket(): ByteArray {
        val dummy = ByteArray(PACKET_SIZE)
        SecureRandom().nextBytes(dummy)
        return dummy
    }
}
