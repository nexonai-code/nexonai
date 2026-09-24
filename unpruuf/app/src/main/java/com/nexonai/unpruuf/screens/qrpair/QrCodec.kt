package com.nexonai.unpruuf.screens.qrpair

import java.nio.ByteBuffer
import java.util.UUID

// Small, pure, stateless wire-encoding helpers shared by QrPairViewModel's onion-based QR (v4)
// and CrossPlatformPairing's relay-based QR — package-level so both can call them without
// either depending on an instance of the other's ViewModel.

/** 36-char dashed UUID string → 22-char unpadded Base64 of its 16 raw bytes. */
internal fun compactUserId(userId: String): String? = try {
    val uuid = UUID.fromString(userId)
    val bytes = ByteBuffer.allocate(16)
        .putLong(uuid.mostSignificantBits)
        .putLong(uuid.leastSignificantBits)
        .array()
    android.util.Base64.encodeToString(
        bytes,
        android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING
    )
} catch (e: Exception) {
    null
}

/** Reverses [compactUserId] back to the standard dashed UUID string. */
internal fun expandUserId(compact: String): String? = try {
    val bytes = android.util.Base64.decode(
        compact,
        android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING
    )
    if (bytes.size != 16) null else {
        val bb = ByteBuffer.wrap(bytes)
        UUID(bb.long, bb.long).toString()
    }
} catch (e: Exception) {
    null
}

/** Minimal flat {"k":"v",...} parser — every value here is either a short opaque string or
 *  Base64, never containing unescaped quotes/braces, so a real JSON parser isn't needed. */
internal fun parseSimpleJson(json: String): Map<String, String> {
    val result = mutableMapOf<String, String>()
    val cleaned = json.trim().removePrefix("{").removeSuffix("}")
    val pairs = cleaned.split(",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*\$)".toRegex())
    for (pair in pairs) {
        val colonIdx = pair.indexOf(':')
        if (colonIdx < 0) continue
        val key = pair.substring(0, colonIdx).trim().trim('"')
        val value = pair.substring(colonIdx + 1).trim().trim('"')
        result[key] = value
    }
    return result
}
