package com.nexonai.unpruuf

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class UnpruufApplication : Application() {
    override fun attachBaseContext(base: android.content.Context) {
        super.attachBaseContext(base)
        // Earliest possible: also catches a failure while Hilt builds the object graph (debug builds only).
        com.nexonai.unpruuf.ui.DebugCrashReport.install(base)
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val channel = NotificationChannel(
            CHANNEL_MESSAGES,
            getString(R.string.notif_channel_messages_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = getString(R.string.notif_channel_messages_description)
            enableVibration(true)
            enableLights(true)
        }
        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)
    }

    companion object {
        const val CHANNEL_MESSAGES = "messages"
    }
}
