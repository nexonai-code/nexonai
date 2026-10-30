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
import androidx.compose.ui.res.stringResource
import com.nexonai.unpruuf.R

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
                stringResource(R.string.security_rooted_title),
                style = MaterialTheme.typography.headlineSmall,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(12.dp))
            Text(
                stringResource(R.string.security_rooted_body),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(12.dp))
            Text(
                stringResource(R.string.security_rooted_hint),
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
