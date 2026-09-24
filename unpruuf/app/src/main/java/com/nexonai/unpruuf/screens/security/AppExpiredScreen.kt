package com.nexonai.unpruuf.screens.security

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.UpdateDisabled
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * The build-freshness gate — shown instead of everything else once
 * `System.currentTimeMillis() > BuildConfig.BUILD_EXPIRY_MS`. Checked right after the
 * root-detection gate in MainActivity, before FLAG_SECURE/Tor/the P2P listener. Independent of
 * [com.nexonai.unpruuf.domain.license.LicenseManager] — this is a hard ~6-month freshness
 * window on the compiled build itself, applying to every edition including the free Client
 * edition, not a paid-license concept. No bypass: an expired build simply stops running.
 */
@Composable
fun AppExpiredScreen() {
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
                Icons.Default.UpdateDisabled, null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.error
            )
            Spacer(Modifier.height(20.dp))
            Text(
                "This build has expired",
                style = MaterialTheme.typography.headlineSmall,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(12.dp))
            Text(
                "This version of unpruuf is more than 6 months old and no longer runs. " +
                "Please install the latest update.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
