package com.nexonai.unpruuf.ui

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle

/**
 * Copying a code (group code, case number, pairing code) to the clipboard, the careful way:
 *  - the clip is marked sensitive, so Android 13+ does not show its content in the copy preview
 *    and keyboards/clipboard managers that honour the flag skip it;
 *  - it is removed again after [CLEAR_AFTER_MS], but only if it is still our clip (something
 *    the user copied in between is never touched).
 * Android 12 and older cannot hide a clip from other foreground apps; the automatic removal is the
 * only protection there.
 */
object SensitiveClipboard {
    const val CLEAR_AFTER_MS = 60_000L
    private const val EXTRA_IS_SENSITIVE = "android.content.extra.IS_SENSITIVE"

    fun copy(context: Context, label: String, text: String) {
        val cm = context.applicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        clip.description.extras = PersistableBundle().apply { putBoolean(EXTRA_IS_SENSITIVE, true) }
        cm.setPrimaryClip(clip)
        Handler(Looper.getMainLooper()).postDelayed({ clearIfStillOurs(cm, text) }, CLEAR_AFTER_MS)
    }

    private fun clearIfStillOurs(cm: ClipboardManager, text: String) {
        val current = runCatching { cm.primaryClip?.getItemAt(0)?.text?.toString() }.getOrNull()
        if (current != text) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) cm.clearPrimaryClip()
        else cm.setPrimaryClip(ClipData.newPlainText("", ""))
    }
}
