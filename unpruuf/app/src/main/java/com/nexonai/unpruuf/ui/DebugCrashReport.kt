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
        // The dialog can vanish within a second when the app ends again at once. So the whole report
        // is also written as a text file into the phone's Downloads folder, on a background thread,
        // right at the start: the tester opens Files > Downloads and shares it from there.
        Thread {
            runCatching { captureLogcat(app) }
            runCatching { writeReportToDownloads(app) }
        }.apply { name = "debug-report"; isDaemon = true }.start()
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
        return listOfNotNull(exit, trace, trailText(context)?.let { "trail (NEWEST FIRST):\n$it" }, torLogTail(context), logcatTail(context)).joinToString("\n\n")
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

    private const val LOGCAT = "debug-logcat.txt"

    /**
     * The app's own system log (Android lets an app read only its own), which still holds the last
     * words of a process that has ended: native messages of Tor, the C library and the runtime.
     */
    private fun captureLogcat(context: Context) {
        val p = ProcessBuilder("logcat", "-d", "-v", "time", "-t", "600").redirectErrorStream(true).start()
        val noise = listOf("Choreographer", "ViewRootImpl", "OpenGLRenderer", "InputMethod", "InsetsController", "SurfaceView", "BufferQueue", "HwViewRootImpl")
        val lines = p.inputStream.bufferedReader().readLines().filter { l -> noise.none { l.contains(it) } }.takeLast(220)
        File(context.filesDir, LOGCAT).writeText(lines.joinToString("\n").takeLast(24_000))
    }

    private fun logcatTail(context: Context): String? =
        runCatching { File(context.filesDir, LOGCAT).takeIf { it.isFile }?.readText() }.getOrNull()?.takeIf { it.isNotBlank() }
            ?.let { "system log of this app (oldest first):\n$it" }

    @Volatile private var reportWritten = false

    private fun writeReportToDownloads(context: Context) {
        if (reportWritten || android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) return
        val text = read(context) ?: ("(no earlier run recorded)\n\n" + (logcatTail(context) ?: "(no system log)"))
        val name = "unpruuf-debug-" + java.text.SimpleDateFormat("yyyyMMdd-HHmmss", java.util.Locale.US).format(java.util.Date()) + ".txt"
        val values = android.content.ContentValues().apply {
            put(android.provider.MediaStore.Downloads.DISPLAY_NAME, name)
            put(android.provider.MediaStore.Downloads.MIME_TYPE, "text/plain")
            put(android.provider.MediaStore.Downloads.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS)
        }
        val uri = context.contentResolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return
        context.contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray(Charsets.UTF_8)) }
        reportWritten = true
    }

    /** Last lines of Tor's own log (debug builds), newest first; written by TorManager.start(). */
    private fun torLogTail(context: Context): String? =
        runCatching { File(context.filesDir, "tor-debug.log").takeIf { it.isFile }?.readText() }.getOrNull()
            ?.lines()?.filter { it.isNotBlank() }?.takeLast(40)?.reversed()?.joinToString("\n")
            ?.let { "tor log (NEWEST FIRST):\n$it" }

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
        runCatching { File(context.filesDir, "tor-debug.log").delete() }
        runCatching { File(context.filesDir, LOGCAT).delete() }
    }
}
