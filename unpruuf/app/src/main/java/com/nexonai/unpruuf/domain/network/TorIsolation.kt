package com.nexonai.unpruuf.domain.network

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** The SOCKS user name that keeps one contact's Tor traffic apart from every other contact's (see [Socks5]). */
object TorIsolation {
    /**
     * A keyed hash of [contactId] under the device secret [deviceSecret]: 32 hex characters, the same for
     * the same contact on this device, different for every contact and every device, and it does not
     * reveal the contact id. It stays on the phone (Tor reads it; it is never sent into the network).
     */
    fun keyFor(deviceSecret: ByteArray, contactId: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(deviceSecret, "HmacSHA256"))
        return mac.doFinal("tor-isolation:v1:$contactId".toByteArray()).take(16).joinToString("") { "%02x".format(it) }
    }
}
