package com.nexonai.unpruuf

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.nexonai.unpruuf.data.repository.InMemoryMessageStore
import com.nexonai.unpruuf.domain.license.LicenseManager
import com.nexonai.unpruuf.domain.license.LicenseState
import com.nexonai.unpruuf.domain.security.AppLockManager
import com.nexonai.unpruuf.domain.security.RootDetector
import com.nexonai.unpruuf.navigation.AppNavigation
import com.nexonai.unpruuf.screens.license.LicenseLockScreen
import com.nexonai.unpruuf.screens.lock.LockViewModel
import com.nexonai.unpruuf.screens.lock.PinLockScreen
import com.nexonai.unpruuf.screens.lock.PinSetupScreen
import com.nexonai.unpruuf.screens.security.AppExpiredScreen
import com.nexonai.unpruuf.screens.security.RootBlockedScreen
import com.nexonai.unpruuf.services.P2PListenerService
import com.nexonai.unpruuf.services.TorForegroundService
import com.nexonai.unpruuf.ui.theme.UnpruufTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : FragmentActivity() {

    @Inject lateinit var appLockManager: AppLockManager
    @Inject lateinit var messageStore: InMemoryMessageStore
    @Inject lateinit var licenseManager: LicenseManager

    private var deepLinkContactId by mutableStateOf<String?>(null)
    private var showBetaNotice by mutableStateOf(false)

    // Outermost gate — read reactively at the top of the Compose tree in setContent, ahead of
    // the PIN/license branches. Re-evaluated on every foreground-return below, not just on cold
    // start; root status realistically only changes via a reboot (which restarts this process
    // anyway), so per-launch + per-resume is enough — no separate polling loop.
    private var isRooted by mutableStateOf(false)

    // Second outermost gate, checked right after isRooted — a build older than
    // BuildConfig.BUILD_EXPIRY_MS (~6 months from when it was compiled) refuses to run.
    // Independent of licensing; applies to every edition including the free Client edition.
    private var isExpired by mutableStateOf(false)

    // Enforces the skipped wipe+lock if an external picker/camera round-trip is abandoned
    // (user never returns). Runs on the process lifecycle's scope, not the activity's, so
    // it survives the activity being destroyed while backgrounded.
    private var graceEnforceJob: Job? = null

    private fun scheduleGraceExpiryEnforcement() {
        graceEnforceJob?.cancel()
        graceEnforceJob = ProcessLifecycleOwner.get().lifecycleScope.launch {
            delay(AppLockManager.EXTERNAL_INTENT_GRACE_MS + 1_000)
            if (appLockManager.isExternalIntentGraceExpired()) {
                messageStore.zeroizeAll()
                appLockManager.lock()
                appLockManager.endExternalIntentGrace()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Root check first, before anything else touches this device — before FLAG_SECURE,
        // before permissions, and critically before Tor/the P2P listener ever start (a rooted
        // device must never reach the point where an onion identity or key material is even
        // generated). See RootDetector for the detection design and its honest limits.
        val rooted = RootDetector.isDeviceRooted(this, BuildConfig.DEBUG)
        isRooted = rooted

        // Second gate, same spot: a build older than its ~6-month freshness window refuses to
        // run too, right after the root check and before anything else.
        val expired = System.currentTimeMillis() > BuildConfig.BUILD_EXPIRY_MS
        isExpired = expired

        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
        super.onCreate(savedInstanceState)

        if (rooted) {
            setContent { UnpruufTheme { RootBlockedScreen() } }
            return
        }
        if (expired) {
            setContent { UnpruufTheme { AppExpiredScreen() } }
            return
        }

        requestNotificationPermission()
        requestBatteryExemptionOnce()

        startForegroundService(TorForegroundService.startIntent(this))
        startForegroundService(P2PListenerService.startIntent(this))

        // App-weiter Hintergrund-Wechsel (nicht bei internen Activity-Wechseln wie
        // dem QR-Scanner): RAM-Chats mit Nullen überschreiben + App sperren.
        //
        // Exception: an app-initiated external system UI (camera, file picker — see
        // AppLockManager.beginExternalIntentGrace) also backgrounds the whole app. Wiping
        // and locking there turned every attach attempt into a dead end: the PIN screen
        // replaced the chat (disposing the composable that held the ActivityResult
        // callback), so the picked photo/file was silently dropped — reported for real.
        // While such a round-trip is in flight, this one background transition is skipped;
        // if the user never returns, the enforcement job below performs the skipped
        // wipe+lock when the grace expires, and onStart double-checks on return.
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) {
                if (appLockManager.isExternalIntentGraceActive()) {
                    scheduleGraceExpiryEnforcement()
                    return
                }
                messageStore.zeroizeAll()
                appLockManager.lock()
            }

            override fun onStart(owner: LifecycleOwner) {
                // Re-check on every foreground-return, same granularity as the PIN re-lock
                // right below — root status realistically only flips via a reboot, which
                // already restarts this whole process, but this is a cheap belt-and-suspenders
                // re-check rather than a one-shot-at-cold-start-only guarantee.
                isRooted = RootDetector.isDeviceRooted(this@MainActivity, BuildConfig.DEBUG)
                isExpired = System.currentTimeMillis() > BuildConfig.BUILD_EXPIRY_MS

                graceEnforceJob?.cancel()
                if (appLockManager.isExternalIntentGraceExpired()) {
                    // Came back only after the grace ran out — the background wipe+lock
                    // was skipped back then, so it happens now.
                    messageStore.zeroizeAll()
                    appLockManager.lock()
                }
                appLockManager.endExternalIntentGrace()
            }
        })

        deepLinkContactId = intent?.getStringExtra("contactId")
        showBetaNotice = !getSharedPreferences("app_flags", MODE_PRIVATE)
            .getBoolean("beta_notice_shown", false)

        setContent {
            UnpruufTheme {
                if (isRooted) {
                    // Caught by the onStart re-check above, not just the onCreate gate at the
                    // top of this function — same screen, same refusal, no way past it.
                    RootBlockedScreen()
                    return@UnpruufTheme
                }
                if (isExpired) {
                    AppExpiredScreen()
                    return@UnpruufTheme
                }
                val unlocked by appLockManager.unlocked.collectAsState()
                if (!unlocked) {
                    val lockViewModel: LockViewModel = hiltViewModel()
                    if (lockViewModel.isPinSet) {
                        PinLockScreen(lockViewModel)
                    } else {
                        PinSetupScreen(lockViewModel)
                    }
                } else {
                    // Licensing gate: Client edition is free (see LicenseManager.requiresLicense)
                    // and never sees this. Standard/Pro need a Valid or ExpiringSoon (still
                    // usable, just warned in Settings) license state to reach the app at all —
                    // anything else (NotConfigured/Expired/Invalid) shows the activation screen
                    // instead of AppNavigation. No RAM/PIN/contact data is touched by this.
                    val licenseState by licenseManager.state.collectAsState()
                    // Debug builds skip the license gate entirely — same reasoning as the
                    // debug-only pairing fallback: a license self-binds to the first device
                    // it's activated on, so every fresh test device otherwise needs its own
                    // distinct code. Release builds are completely unaffected by this line.
                    val licensed = BuildConfig.DEBUG || !licenseManager.requiresLicense ||
                        licenseState is LicenseState.Valid ||
                        licenseState is LicenseState.ExpiringSoon
                    if (!licensed) {
                        LicenseLockScreen(licenseManager)
                    } else {
                        AppNavigation(
                            deepLinkContactId = deepLinkContactId,
                            onDeepLinkConsumed = { deepLinkContactId = null }
                        )
                        if (showBetaNotice) {
                            BetaNoticeDialog(onDismiss = {
                                showBetaNotice = false
                                getSharedPreferences("app_flags", MODE_PRIVATE)
                                    .edit().putBoolean("beta_notice_shown", true).apply()
                            })
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra("contactId")?.let { deepLinkContactId = it }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                0
            )
        }
    }

    // Bittet EINMALIG darum, die App von der Akku-Optimierung (Doze) auszunehmen.
    // Ohne das drosselt Android Tor im Hintergrund → der Hidden Service wird
    // unzuverlässig erreichbar (v. a. im Mobilfunk). Wird nur einmal gefragt.
    private fun requestBatteryExemptionOnce() {
        val prefs = getSharedPreferences("app_flags", MODE_PRIVATE)
        if (prefs.getBoolean("battery_asked", false)) return
        val pm = getSystemService(PowerManager::class.java) ?: return
        if (pm.isIgnoringBatteryOptimizations(packageName)) return
        prefs.edit().putBoolean("battery_asked", true).apply()
        runCatching {
            @Suppress("BatteryLife")
            startActivity(
                Intent(
                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:$packageName")
                )
            )
        }
    }
}

// Shown once, right after unlocking, for every current build of every edition
// (Standard/Pro/Client are all pre-release right now).
@OptIn(ExperimentalMaterial3Api::class)
@androidx.compose.runtime.Composable
private fun BetaNoticeDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Beta version") },
        text = {
            Text(
                "unpruuf is under active development. Some features may still " +
                "change or behave unexpectedly, and updates will arrive frequently. " +
                "Thank you for testing!"
            )
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Got it") }
        }
    )
}
