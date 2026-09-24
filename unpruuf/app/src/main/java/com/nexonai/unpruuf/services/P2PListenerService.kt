package com.nexonai.unpruuf.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.nexonai.unpruuf.MainActivity
import com.nexonai.unpruuf.domain.network.P2PNetworkManager
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class P2PListenerService : Service() {

    companion object {
        const val CHANNEL_ID = "unpruuf_p2p_channel"
        const val NOTIFICATION_ID = 1002

        fun startIntent(context: Context) = Intent(context, P2PListenerService::class.java)
    }

    @Inject
    lateinit var p2pNetworkManager: P2PNetworkManager

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        p2pNetworkManager.start()
    }

    private fun buildNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("unpruuf")
            .setContentText("Ready to receive")
            .setSmallIcon(android.R.drawable.ic_menu_send)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "unpruuf P2P Listener",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        p2pNetworkManager.stop()
        super.onDestroy()
    }
}
