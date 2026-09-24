package com.nexonai.unpruuf.relay.security

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import java.io.File

/**
 * Heuristic, dependency-free root detection. No Play Integrity, no network call — a relay
 * operator's device phoning home to Google on every launch would be exactly the kind of
 * third-party involvement this whole architecture exists to avoid. Combines several independent
 * signals and requires at least one *strong* one before reporting root, so a single weak/
 * coincidental match (e.g. test-keys on a legitimate custom ROM) doesn't lock out a real user.
 *
 * This is a byte-for-byte copy of the same file in the main unpruuf app
 * (app/src/main/java/com/nexonai/unpruuf/domain/security/RootDetector.kt) — deliberately a plain
 * object with zero Gradle dependencies and no DI annotations, since relay-android and the main
 * app are separate Gradle projects with no shared Android module, and relay-android doesn't use
 * Hilt at all. Keep both copies in sync when the detection logic changes.
 *
 * Honest limit: this is Best-effort, not provable. A sufficiently determined root-hiding
 * framework (Magisk Hide, Zygisk + Shamiko) can defeat on-device heuristics like these. This
 * raises the bar against casual/opportunistic risk; it does not make root detection airtight.
 */
object RootDetector {

    private val SU_PATHS = arrayOf(
        "/system/bin/su", "/system/xbin/su", "/sbin/su",
        "/system/sd/xbin/su", "/system/bin/failsafe/su",
        "/data/local/xbin/su", "/data/local/bin/su", "/data/local/su",
        "/su/bin/su", "/system/usr/we-need-root/su-backup",
        "/system/xbin/mu",
    )

    private val ROOT_MANAGER_PACKAGES = arrayOf(
        "com.topjohnwu.magisk",
        "eu.chainfire.supersu",
        "com.noshufou.android.su",
        "com.noshufou.android.su.elite",
        "com.koushikdutta.superuser",
        "com.thirdparty.superuser",
        "com.yellowes.su",
        "com.kingroot.kinguser",
        "com.kingo.root",
        "com.smedialink.oneclickroot",
        "com.zhiqupk.root.global",
        "com.alephzain.framaroot",
    )

    private val MAGISK_PATHS = arrayOf(
        "/sbin/.magisk", "/data/adb/magisk", "/data/adb/modules",
    )

    /**
     * True if the device shows real signs of being rooted. Always false on a debug build (so
     * local development on a rooted/emulated dev device is never blocked) and always false on a
     * recognized Android emulator fingerprint (the AVD trips several of these heuristics by
     * design and is not a security-relevant "rooted" case).
     */
    fun isDeviceRooted(context: Context, isDebugBuild: Boolean): Boolean {
        if (isDebugBuild) return false
        if (looksLikeEmulator()) return false

        val suBinaryPresent = SU_PATHS.any { File(it).exists() }
        val suExecWorks = trySuExec()
        val rootAppInstalled = ROOT_MANAGER_PACKAGES.any { isPackageInstalled(context, it) }
        val magiskArtifacts = MAGISK_PATHS.any { File(it).exists() }
        val testKeys = Build.TAGS?.contains("test-keys") == true
        val systemWritable = File("/system").let { it.exists() && it.canWrite() }

        // Require at least one strong signal (a working su exec, or su binary + a root manager
        // app together) rather than any single weak signal alone.
        val strongSignal = suExecWorks || (suBinaryPresent && rootAppInstalled)
        val weakSignalCount = listOf(suBinaryPresent, magiskArtifacts, testKeys, systemWritable)
            .count { it }

        return strongSignal || weakSignalCount >= 2
    }

    private fun isPackageInstalled(context: Context, packageName: String): Boolean = try {
        context.packageManager.getPackageInfo(packageName, PackageManager.GET_ACTIVITIES)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }

    private fun trySuExec(): Boolean = try {
        val process = Runtime.getRuntime().exec(arrayOf("su", "-c", "id"))
        val exitCode = process.waitFor()
        exitCode == 0
    } catch (e: Exception) {
        false
    }

    private fun looksLikeEmulator(): Boolean {
        val fingerprint = Build.FINGERPRINT.lowercase()
        val model = Build.MODEL.lowercase()
        val hardware = Build.HARDWARE.lowercase()
        val product = Build.PRODUCT.lowercase()
        return fingerprint.contains("generic") || fingerprint.contains("unknown") ||
            model.contains("emulator") || model.contains("sdk_gphone") ||
            hardware.contains("goldfish") || hardware.contains("ranchu") ||
            product.contains("sdk") || product.contains("emulator")
    }
}
