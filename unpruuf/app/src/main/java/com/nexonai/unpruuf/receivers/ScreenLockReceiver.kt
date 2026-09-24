package com.nexonai.unpruuf.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.nexonai.unpruuf.data.repository.InMemoryMessageStore
import com.nexonai.unpruuf.domain.security.AppLockManager
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class ScreenLockReceiver : BroadcastReceiver() {

    @Inject
    lateinit var messageStore: InMemoryMessageStore

    @Inject
    lateinit var appLockManager: AppLockManager

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_SCREEN_OFF) {
            messageStore.zeroizeAll()
            appLockManager.lock()
        }
    }
}
