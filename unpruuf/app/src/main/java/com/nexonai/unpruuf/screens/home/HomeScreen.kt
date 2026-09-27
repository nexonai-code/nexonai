package com.nexonai.unpruuf.screens.home

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.nexonai.unpruuf.domain.AppEdition
import com.nexonai.unpruuf.ui.components.EclipseMark
import androidx.compose.ui.res.stringResource
import com.nexonai.unpruuf.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateBack: () -> Unit,
    isTorConnected: Boolean = false
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("unpruuf", fontWeight = FontWeight.Bold)
                        // Farbiges Editions-Badge — sofort sichtbar welche Version. Bewusst
                        // ausgeblendet für Whistleblower: ein sichtbares "WHISTLEBLOWER"-Label
                        // auf dem Homescreen wäre selbst ein Risiko für den Melder, falls jemand
                        // mitliest — die App soll unauffällig wie jeder andere Messenger wirken
                        // (siehe AppEdition.kt, Theme.kt fällt aus demselben Grund auf den
                        // Standard-Teal-Akzent zurück statt eine eigene Farbe zu bekommen).
                        if (!AppEdition.isWhistleblower) {
                            Spacer(Modifier.width(8.dp))
                            Surface(
                                color = MaterialTheme.colorScheme.primary,
                                shape = MaterialTheme.shapes.small
                            ) {
                                Text(
                                    AppEdition.label.uppercase(),
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.labelSmall,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, stringResource(R.string.home_cd_back))
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Spacer(Modifier.height(8.dp))

            // Freestanding mark + wordmark (see BRANDING.md "Contexts › 1") — the
            // mark sits to the upper-left, the wordmark bottom-aligned to its
            // lower-right, not centered under it. Replaces the old logo_unpruuf.png
            // placeholder with a Compose-drawn EclipseMark so it can take the
            // current edition's accent color like everything else on this screen.
            Row(
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                EclipseMark(modifier = Modifier.size(64.dp))
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = MaterialTheme.colorScheme.primary)) { append("un") }
                        append("pruuf")
                    },
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 6.dp)
                )
            }

            // Tor status
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = if (isTorConnected)
                        MaterialTheme.colorScheme.primaryContainer
                    else
                        MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        if (isTorConnected) Icons.Default.Lock else Icons.Default.LockOpen,
                        null,
                        tint = if (isTorConnected) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            if (isTorConnected) stringResource(R.string.home_tor_active) else stringResource(R.string.home_connecting_to_tor),
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            if (isTorConnected) stringResource(R.string.home_p2p_secured)
                            else stringResource(R.string.home_waiting_for_tor),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Security status
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(stringResource(R.string.home_gral_status_title), fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    SecurityStatusRow(stringResource(R.string.home_row_zero_infra), stringResource(R.string.home_row_zero_infra_desc), true)
                    SecurityStatusRow(stringResource(R.string.home_row_ram_only), stringResource(R.string.home_row_ram_only_desc), true)
                    SecurityStatusRow(stringResource(R.string.home_row_hourly_rotation), stringResource(R.string.home_row_hourly_rotation_desc), true)
                    SecurityStatusRow(stringResource(R.string.home_row_dummy_traffic), stringResource(R.string.home_row_dummy_traffic_desc), true)
                    SecurityStatusRow(stringResource(R.string.home_row_revoke), stringResource(R.string.home_row_revoke_desc), true)
                }
            }

            Spacer(Modifier.weight(1f))
        }
    }
}

@Composable
private fun SecurityStatusRow(label: String, description: String, active: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            if (active) Icons.Default.CheckCircle else Icons.Default.Cancel,
            null,
            tint = if (active) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.error,
            modifier = Modifier.size(18.dp)
        )
        Spacer(Modifier.width(8.dp))
        Text(label, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        Text(
            description,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
