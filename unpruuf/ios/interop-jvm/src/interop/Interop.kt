package interop

import com.google.crypto.tink.subtle.Hkdf
import com.google.crypto.tink.subtle.X25519
import com.nexonai.unpruuf.domain.network.NetworkObfuscation
import com.nexonai.unpruuf.domain.network.RatchetFrame
import com.nexonai.unpruuf.domain.network.ratchet.DoubleRatchet
import com.nexonai.unpruuf.domain.network.ratchet.RatchetHeader
import java.io.File
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

// Fixed test keys, same values as NodeMeshCryptoTests.interopSides. The side with the smaller
// public key sends first, so the role follows from the keys.
private val keyA = ByteArray(32) { 0x11 }
private val keyB = ByteArray(32) { 0x22 }
private val privA = ByteArray(32) { 0x31 }
private val privB = ByteArray(32) { 0x41 }
private val X3DH_INFO = "unpruuf-x3dh-lite-v1".toByteArray()

private class Side(val messageKey: ByteArray, val pair: DoubleRatchet.KeyPair)

private fun side(key: ByteArray, priv: ByteArray) = Side(key, DoubleRatchet.KeyPair(priv, X25519.publicFromPrivate(priv)))

private fun compareUnsigned(a: ByteArray, b: ByteArray): Int {
    for (i in 0 until minOf(a.size, b.size)) {
        val d = (a[i].toInt() and 0xFF) - (b[i].toInt() and 0xFF)
        if (d != 0) return d
    }
    return a.size - b.size
}

private fun pairSecret(a: ByteArray, b: ByteArray): ByteArray {
    val md = MessageDigest.getInstance("SHA-256")
    if (compareUnsigned(a, b) <= 0) { md.update(a); md.update(b) } else { md.update(b); md.update(a) }
    return md.digest()
}

private fun rootKey(me: Side, other: Side, secret: ByteArray): ByteArray =
    Hkdf.computeHkdf("HmacSha256", X25519.computeSharedSecret(me.pair.privateKey, other.pair.publicKey), secret, X3DH_INFO, 32)

// CryptoManager.encryptForContact / decryptWithKey (that class needs Android's key store).
private fun outerEncrypt(plaintext: ByteArray, key: ByteArray): ByteArray {
    val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
    return iv + cipher.doFinal(plaintext)
}

private fun outerDecrypt(data: ByteArray, key: ByteArray): ByteArray {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, data.copyOf(12)))
    return cipher.doFinal(data.copyOfRange(12, data.size))
}

private fun ByteArray.hex() = joinToString("") { "%02x".format(it) }
private fun String.unhex() = chunked(2).map { it.toInt(16).toByte() }.toByteArray()

private fun roles(): Pair<Side, Side> {
    val a = side(keyA, privA)
    val b = side(keyB, privB)
    return if (compareUnsigned(a.pair.publicKey, b.pair.publicKey) < 0) a to b else b to a
}

/** Plaintext lines `M <hex>`, each followed by its packets, `P <hex>`. */
private fun generate(out: File) {
    val (sender, receiver) = roles()
    val secret = pairSecret(sender.messageKey, receiver.messageKey)
    val state = DoubleRatchet.initSender(rootKey(sender, receiver, secret), sender.pair, receiver.pair.publicKey)
    val text = StringBuilder()
    for (plaintext in listOf(byteArrayOf(0) + "Hallo von Android".toByteArray(), ByteArray(10_000) { (it % 251).toByte() })) {
        text.append("M ").append(plaintext.hex()).append('\n')
        val encrypted = DoubleRatchet.encrypt(state, plaintext, secret)
        for (frame in RatchetFrame.split(encrypted.header, encrypted.ciphertext)) {
            val packet = NetworkObfuscation.padPacket(outerEncrypt(RatchetFrame.encode(frame), receiver.messageKey))
            text.append("P ").append(packet.hex()).append('\n')
        }
    }
    out.writeText(text.toString())
}

private fun check(file: File) {
    val (sender, receiver) = roles()
    val secret = pairSecret(sender.messageKey, receiver.messageKey)
    val state = DoubleRatchet.initReceiver(rootKey(receiver, sender, secret), receiver.pair)
    var expected: ByteArray? = null
    var header: RatchetHeader? = null
    var pieces = arrayOfNulls<ByteArray>(0)
    var opened = 0

    fun finish(h: RatchetHeader, ciphertext: ByteArray) {
        val plaintext = DoubleRatchet.decrypt(state, h, ciphertext, secret)
        check(plaintext.contentEquals(expected)) { "plaintext differs" }
        opened++
    }

    for (line in file.readLines()) {
        val (kind, value) = line.split(" ")
        if (kind == "M") { expected = value.unhex(); continue }
        val raw = outerDecrypt(NetworkObfuscation.unpadPacket(value.unhex()), receiver.messageKey)
        when (val frame = RatchetFrame.decode(raw) ?: error("frame does not decode")) {
            is RatchetFrame.Frame.Single -> finish(frame.header, frame.ciphertext)
            is RatchetFrame.Frame.ChunkStart -> {
                header = frame.header
                pieces = arrayOfNulls(frame.totalChunks)
                pieces[0] = frame.piece
            }
            is RatchetFrame.Frame.ChunkCont -> {
                pieces[frame.index] = frame.piece
                if (pieces.all { it != null }) finish(header!!, pieces.fold(ByteArray(0)) { all, p -> all + p!! })
            }
        }
    }
    check(opened == 2) { "opened $opened of 2 messages" }
    println("opened $opened messages from ${file.name}")
}

fun main(args: Array<String>) {
    when (args[0]) {
        "generate" -> generate(File(args[1]))
        "check" -> check(File(args[1]))
    }
}
