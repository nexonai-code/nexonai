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

    @Volatile private var appContext: Context? = null

    /** Short form for code without a Context at hand; debug builds only. */
    fun t(event: String) { appContext?.let { trail(it, event) } }

    fun install(context: Context) {
        if (!BuildConfig.DEBUG) return
        val app = context.applicationContext ?: context
        appContext = app
        trail(app, "process start pid=${android.os.Process.myPid()}")
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

    /**
     * What to show on the next start: the stored Java trace of the last crash, and (Android 11+) how
     * the system says the previous process ended. The second part also covers crashes below Java
     * (native code), kills and out-of-memory, which leave no trace file. Null if nothing is worth
     * showing; always null in a release build.
     */
    fun read(context: Context): String? {
        if (!BuildConfig.DEBUG) return null
        val trace = runCatching { File(context.filesDir, FILE).takeIf { it.isFile }?.readText() }.getOrNull()?.takeIf { it.isNotBlank() }
        val exit = lastAbnormalExit(context)
        if (trace == null && exit == null) return null
        return listOfNotNull(exit, trace, trailText(context)?.let { "trail (NEWEST FIRST):\n$it" }).joinToString("\n\n")
    }

    private const val PREFS = "debug_crash_report"
    private const val KEY_SEEN = "last_exit_seen_ms"

    private fun lastAbnormalExit(context: Context): String? {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.R) return null
        return runCatching {
            val am = context.getSystemService(android.app.ActivityManager::class.java) ?: return null
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val seen = prefs.getLong(KEY_SEEN, 0L)
            // Diagnosis build: every process end since the last report is listed, normal ones too.
            val bad = am.getHistoricalProcessExitReasons(context.packageName, 0, 6)
                .filter { it.timestamp > seen }
            if (bad.isEmpty()) return null
            prefs.edit().putLong(KEY_SEEN, bad.maxOf { it.timestamp }).apply()
            bad.joinToString("\n") {
                "exit: ${reasonName(it.reason)} status=${it.status} importance=${it.importance} " +
                    "process=${it.processName} at=${it.timestamp} description=${it.description}"
            }
        }.getOrNull()
    }

    private fun reasonName(r: Int): String = when (r) {
        android.app.ApplicationExitInfo.REASON_EXIT_SELF -> "EXIT_SELF (the app ended itself)"
        android.app.ApplicationExitInfo.REASON_SIGNALED -> "SIGNALED (killed by a signal)"
        android.app.ApplicationExitInfo.REASON_LOW_MEMORY -> "LOW_MEMORY"
        android.app.ApplicationExitInfo.REASON_CRASH -> "CRASH (Java exception)"
        android.app.ApplicationExitInfo.REASON_CRASH_NATIVE -> "CRASH_NATIVE (native code)"
        android.app.ApplicationExitInfo.REASON_ANR -> "ANR (not responding)"
        android.app.ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "INITIALIZATION_FAILURE"
        android.app.ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "DEPENDENCY_DIED"
        android.app.ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "EXCESSIVE_RESOURCE_USAGE"
        android.app.ApplicationExitInfo.REASON_OTHER -> "OTHER"
        android.app.ApplicationExitInfo.REASON_USER_REQUESTED -> "USER_REQUESTED (swiped away or force-stopped)"
        android.app.ApplicationExitInfo.REASON_USER_STOPPED -> "USER_STOPPED"
        android.app.ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "PERMISSION_CHANGE (a permission was changed in Settings, Android restarts the app)"
        else -> "reason $r"
    }

    private const val TRAIL = "debug-trail.txt"
    private const val TRAIL_MAX = 6_000
    private val trailLock = Any()

    /** Debug builds only: one line per lifecycle event, so "it closed" can be told apart (crash, finish, recreate). */
    fun trail(context: Context, event: String) {
        if (!BuildConfig.DEBUG) return
        runCatching {
            synchronized(trailLock) {
                val f = File(context.filesDir, TRAIL)
                val old = if (f.isFile) f.readText() else ""
                val line = "${java.text.SimpleDateFormat("HH:mm:ss.SSS", java.util.Locale.US).format(java.util.Date())} $event\n"
                f.writeText((old + line).takeLast(TRAIL_MAX))
            }
        }
    }

    fun trailText(context: Context): String? {
        if (!BuildConfig.DEBUG) return null
        return runCatching { File(context.filesDir, TRAIL).takeIf { it.isFile }?.readText() }.getOrNull()?.takeIf { it.isNotBlank() }
            ?.lines()?.filter { it.isNotBlank() }?.takeLast(60)?.reversed()?.joinToString("\n")
    }

    fun clear(context: Context) {
        runCatching { File(context.filesDir, FILE).delete() }
        runCatching { File(context.filesDir, TRAIL).delete() }
    }
}
