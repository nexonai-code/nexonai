package com.nexonai.unpruuf.relay

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.nexonai.unpruuf.relay.security.RootDetector
import com.nexonai.unpruuf.relay.service.RelayService
import com.nexonai.unpruuf.relay.ui.RelayScreen
import com.nexonai.unpruuf.relay.ui.RootBlockedScreen
import com.nexonai.unpruuf.relay.ui.theme.UnpruufRelayTheme

class MainActivity : ComponentActivity() {

    private var relayService by mutableStateOf<RelayService?>(null)

    // Outermost gate — see RootDetector for the detection design and its honest limits.
    // Re-checked in onResume below; root status realistically only changes via a reboot, which
    // already restarts this process, so per-launch + per-resume is enough.
    private var isRooted by mutableStateOf(false)

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder) {
            relayService = (binder as RelayService.LocalBinder).service
        }
        override fun onServiceDisconnected(name: ComponentName?) {
            relayService = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Root check first, before anything else — before permissions and critically before
        // RelayService (and this device's own relay onion identity key) ever starts.
        val rooted = RootDetector.isDeviceRooted(this, BuildConfig.DEBUG)
        isRooted = rooted

        super.onCreate(savedInstanceState)

        if (rooted) {
            setContent { UnpruufRelayTheme { RootBlockedScreen() } }
            return
        }

        requestNotificationPermission()
        requestBatteryExemptionOnce()

        val intent = Intent(this, RelayService::class.java)
        startForegroundService(intent)
        bindService(intent, connection, BIND_AUTO_CREATE)

        setContent {
            UnpruufRelayTheme {
                if (isRooted) {
                    RootBlockedScreen()
                } else {
                    RelayScreen(service = relayService)
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        isRooted = RootDetector.isDeviceRooted(this, BuildConfig.DEBUG)
    }

    override fun onDestroy() {
        runCatching { unbindService(connection) }
        super.onDestroy()
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 0)
        }
    }

    // Same one-time request as the main unpruuf app's MainActivity — without this, Doze
    // throttles the background Tor process and the hidden service becomes unreliable, which
    // matters even more here since other people are depending on this relay staying reachable.
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
