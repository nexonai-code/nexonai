package com.nexonai.unpruuf.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.nexonai.unpruuf.MainActivity
import com.nexonai.unpruuf.domain.network.NetworkObfuscation
import com.nexonai.unpruuf.domain.network.TorManager
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class TorForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "unpruuf_tor_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "ACTION_START_TOR"
        const val ACTION_STOP = "ACTION_STOP_TOR"

        fun startIntent(context: Context) = Intent(context, TorForegroundService::class.java)
            .apply { action = ACTION_START }

        fun stopIntent(context: Context) = Intent(context, TorForegroundService::class.java)
            .apply { action = ACTION_STOP }
    }

    @Inject
    lateinit var torManager: TorManager

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
    }

    // Hält die CPU wach, solange Tor läuft, damit die Hidden-Service-Circuits
    // (Introduction Points) im Hintergrund / bei Bildschirm-aus / im Mobilfunk
    // nicht von Android Doze abgeschossen werden → zuverlässiger EMPFANG.
    private fun acquireWakeLock() {
        if (wakeLock != null) return
        val pm = getSystemService(POWER_SERVICE) as? PowerManager ?: return
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "unpruuf:tor").apply {
            setReferenceCounted(false)
            runCatching { acquire() }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                startForeground(NOTIFICATION_ID, buildNotification("Connecting to Tor…"))
                torManager.start()
                observeTorStatus()
            }
            ACTION_STOP -> {
                torManager.stop()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun observeTorStatus() {
        serviceScope.launch {
            torManager.isReady.collect { ready ->
                if (ready) {
                    updateNotification("Tor active")
                    scheduleDummyTraffic()
                } else {
                    updateNotification("Connecting to Tor…")
                }
            }
        }
    }

    // GRAL Säule 4: Smart Dummy Traffic
    private suspend fun scheduleDummyTraffic() {
        while (torManager.isReady.value) {
            delay((15_000L..45_000L).random())
            NetworkObfuscation.generateDummyPacket()
        }
    }

    private fun updateNotification(status: String) {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, buildNotification(status))
    }

    private fun buildNotification(status: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("unpruuf")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "unpruuf Tor Connection",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Shows the Tor connection status"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        runCatching { wakeLock?.let { if (it.isHeld) it.release() } }
        wakeLock = null
        serviceScope.cancel()
        super.onDestroy()
    }
}
