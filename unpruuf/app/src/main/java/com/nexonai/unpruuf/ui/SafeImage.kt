package com.nexonai.unpruuf.ui

import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap

/**
 * Decoding of an image that arrived from a contact. The compressed bytes are small but the picture
 * they describe can be huge (a few KB of PNG can claim 30 000 x 30 000 pixels); decoding that
 * would exhaust memory and crash the app. So the size is read first, absurd sizes are refused and
 * everything else is decoded at reduced size.
 */
object SafeImage {
    /** Longest side we ever decode to; the chat shows 200 dp and a full-screen view needs no more. */
    const val TARGET_PX = 2048
    /** Refused outright: more than this many pixels or a side longer than [MAX_SIDE]. */
    const val MAX_PIXELS = 50_000_000L
    const val MAX_SIDE = 20_000

    /** Power-of-two subsampling that brings the longer side to about [target]; 0 if the size is not acceptable. */
    fun sampleSizeFor(width: Int, height: Int, target: Int = TARGET_PX): Int {
        if (width <= 0 || height <= 0) return 0
        if (width > MAX_SIDE || height > MAX_SIDE || width.toLong() * height > MAX_PIXELS) return 0
        var sample = 1
        while (width / (sample * 2) >= target || height / (sample * 2) >= target) sample *= 2
        return sample
    }

    fun decode(body: ByteArray): ImageBitmap? = runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(body, 0, body.size, bounds)
        val sample = sampleSizeFor(bounds.outWidth, bounds.outHeight)
        if (sample == 0) return@runCatching null
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        BitmapFactory.decodeByteArray(body, 0, body.size, opts)?.asImageBitmap()
    }.getOrNull()
}
