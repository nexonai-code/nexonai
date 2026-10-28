package com.nexonai.unpruuf.ui

import android.content.Context
import com.nexonai.unpruuf.BuildConfig
import java.io.File

/**
 * DEBUG builds only (a release build never installs the handler and never writes this file).
 * Keeps the stack trace of the last crash on the phone, so the next start can show it and the
 * tester can send it with one tap. Nothing leaves the phone on its own, the file is replaced by the
 * next crash and deleted when the report is dismissed. Only the exception text is stored, no
 * messages, contacts or keys.
 */
object DebugCrashReport {
    private const val FILE = "debug-last-crash.txt"
    private const val MAX_CHARS = 12_000

    fun install(context: Context) {
        if (!BuildConfig.DEBUG) return
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching {
                val text = buildString {
                    append("time=").append(System.currentTimeMillis()).append(" thread=").append(thread.name).append('\n')
                    append(android.util.Log.getStackTraceString(error))
                }.take(MAX_CHARS)
                File(app.filesDir, FILE).writeText(text)
            }
            previous?.uncaughtException(thread, error)
        }
    }

    /** The stored trace, or null (always null in a release build). */
    fun read(context: Context): String? {
        if (!BuildConfig.DEBUG) return null
        return runCatching { File(context.filesDir, FILE).takeIf { it.isFile }?.readText() }.getOrNull()?.takeIf { it.isNotBlank() }
    }

    fun clear(context: Context) {
        runCatching { File(context.filesDir, FILE).delete() }
    }
}
