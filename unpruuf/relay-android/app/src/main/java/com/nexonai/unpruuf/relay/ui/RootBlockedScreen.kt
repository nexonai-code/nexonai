package com.nexonai.unpruuf.relay.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GppBad
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * The outermost gate for the relay app — shown instead of [com.nexonai.unpruuf.relay.ui.RelayScreen]
 * the moment [com.nexonai.unpruuf.relay.security.RootDetector] reports a rooted device. No
 * dismiss, no bypass: by the time this composes, MainActivity has already skipped starting and
 * binding to RelayService, so the relay's own onion identity key is never touched. Same
 * component as the main unpruuf app's RootBlockedScreen, adapted to this app's wording.
 */
@Composable
fun RootBlockedScreen() {
    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                Icons.Default.GppBad, null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.error
            )
            Spacer(Modifier.height(20.dp))
            Text(
                "This device appears to be rooted",
                style = MaterialTheme.typography.headlineSmall,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(12.dp))
            Text(
                "The unpruuf relay refuses to run on a rooted device. Root access lets an " +
                "attacker read process memory and extract this relay's own onion identity key " +
                "directly — no app-layer defense can close that gap, so the relay doesn't try " +
                "to run with it open. Nothing has been started.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(12.dp))
            Text(
                "Un-root this device, or run the relay on a device that isn't rooted, and try " +
                "again.",
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
