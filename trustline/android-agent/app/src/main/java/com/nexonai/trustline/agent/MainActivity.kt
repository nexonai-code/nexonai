package com.nexonai.trustline.agent

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import com.nexonai.trustline.agent.ui.AgentApp
import com.nexonai.trustline.agent.ui.TrustLineTheme

class MainActivity : ComponentActivity() {
    private val vm: AgentViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIntent(intent)
        vm.start()
        setContent {
            TrustLineTheme {
                LaunchedEffect(Unit) { vm.syncLoop() }
                AgentApp(vm)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** trustline://enroll?code=...&relay=... from a scanned QR code or a tapped link. */
    private fun handleIntent(i: Intent?) {
        val uri = i?.data ?: return
        if (uri.scheme == "trustline" && uri.host == "enroll") {
            val code = uri.getQueryParameter("code") ?: return
            vm.enrolPrefill = Pair(uri.getQueryParameter("relay") ?: "", code)
        }
    }
}
