package com.nexonai.unpruuf.screens.security

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
 * The outermost gate — shown instead of everything else (PIN, license, chat list) the moment
 * [com.nexonai.unpruuf.domain.security.RootDetector] reports a rooted device. No dismiss, no
 * bypass button: by the time this composes, MainActivity has already skipped starting Tor and
 * the P2P listener, so nothing sensitive has run yet. Same visual language as
 * [com.nexonai.unpruuf.screens.license.LicenseLockScreen] — a full-screen refusal, not a dialog
 * the user can tap past.
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
                "unpruuf refuses to run on a rooted device. Root access lets an attacker read " +
                "app memory, extract keys, and bypass screenshot protection directly — no " +
                "app-layer defense can close that gap, so unpruuf doesn't try to run with it " +
                "open. Nothing has been started: no keys generated, no connection made.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(12.dp))
            Text(
                "Un-root this device, or install unpruuf on a device that isn't rooted, and " +
                "try again.",
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
