package com.nexonai.unpruuf.screens.qrpair

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nexonai.unpruuf.domain.network.GuestInvite
import java.text.DateFormat
import java.util.Date

/**
 * "Invite a guest" screen (Pro only). Shows the owner what a guest is, lets them pick how long
 * the access lasts and how much the guest may send, and then shows ONE invitation QR code. The
 * code holds secrets: it is shown only on request, only as long as this screen is open, and the
 * app is already hidden from screenshots (FLAG_SECURE).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GuestInviteScreen(
    onNavigateBack: () -> Unit,
    viewModel: GuestInviteViewModel = hiltViewModel()
) {
    val validityDays by viewModel.validityDays.collectAsState()
    val quota by viewModel.quota.collectAsState()
    val invitation by viewModel.invitation.collectAsState()
    val error by viewModel.error.collectAsState()
    val blocked = remember { viewModel.blockedReason() }

    // Leaving the screen (back, system back, navigation) always hides the code.
    DisposableEffect(Unit) { onDispose { viewModel.clearInvitation() } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Invite a guest") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) { Icon(Icons.Default.ArrowBack, "Back") }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.padding(padding).padding(horizontal = 20.dp).verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(12.dp))

            if (blocked != null) {
                Text(blocked, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
                return@Column
            }

            Text(
                "A guest uses the free unpruuf Client app and has no servers of their own. " +
                "They write on your servers, only with this invitation, and only as much as you allow. " +
                "You see when and how much a guest sends, never who they are.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(20.dp))
            SectionLabel("ACCESS LASTS")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                GuestInvite.VALIDITY_DAYS_OPTIONS.forEach { days ->
                    FilterChip(
                        selected = validityDays == days,
                        onClick = { viewModel.setValidityDays(days) },
                        label = { Text("$days days") }
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            SectionLabel("HOW MUCH MAY THE GUEST SEND")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                GuestInvite.Quota.values().forEach { q ->
                    FilterChip(
                        selected = quota == q,
                        onClick = { viewModel.setQuota(q) },
                        label = { Text(quotaLabel(q)) }
                    )
                }
            }
            Text(
                "${quota.depositsPerHour} messages and ${quota.bytesPerHour / 1024} KB per hour, per server.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp).fillMaxWidth()
            )

            Spacer(Modifier.height(20.dp))
            val current = invitation
            if (current == null) {
                Button(onClick = { viewModel.createInvitation() }, modifier = Modifier.fillMaxWidth()) {
                    Text("Create invitation")
                }
            } else {
                val qrBitmap = remember(current.json) { generateQrBitmap(current.json) }
                qrBitmap?.let {
                    Card(shape = RoundedCornerShape(18.dp), modifier = Modifier.size(300.dp)) {
                        Image(
                            bitmap = it.asImageBitmap(),
                            contentDescription = "Guest invitation QR code",
                            filterQuality = FilterQuality.None,
                            modifier = Modifier.fillMaxSize().background(Color.White).padding(8.dp)
                        )
                    }
                } ?: Text("The invitation is too large for a QR code. Use fewer nodes.", color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(10.dp))
                Text(
                    "Valid until " + DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(current.expiresAtMs)) +
                    " · works on ${current.nodeCount} of your server${if (current.nodeCount == 1) "" else "s"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Show this code only to the person you invite, once. Anyone who scans it can write on your servers until it expires. Afterwards the guest shows you their own code: Add contact, Scan.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
                Spacer(Modifier.height(14.dp))
                OutlinedButton(onClick = { viewModel.clearInvitation() }, modifier = Modifier.fillMaxWidth()) {
                    Text("Done, hide the code")
                }
            }

            error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
    )
}

private fun quotaLabel(q: GuestInvite.Quota) = when (q) {
    GuestInvite.Quota.LIGHT -> "Light"
    GuestInvite.Quota.NORMAL -> "Normal"
    GuestInvite.Quota.HIGH -> "High"
}
