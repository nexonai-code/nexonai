package com.nexonai.unpruuf.screens.contactdetail

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.ui.res.stringResource
import com.nexonai.unpruuf.R

/**
 * Out-of-band pairing verification (safety number) — see IdentityManager.safetyNumber's doc
 * comment for the mechanism. Reachable for ANY contact (not just ones added via the debug
 * copy/paste flow) so it generalizes to an optional extra check on top of a normal QR pairing
 * too, not only the remote-tester path it was built for.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactDetailScreen(
    contactId: String,
    onNavigateBack: () -> Unit,
    viewModel: ContactDetailViewModel = hiltViewModel()
) {
    val contact by viewModel.contact.collectAsState()
    val mySafetyNumber by viewModel.mySafetyNumber.collectAsState()
    val verifyResult by viewModel.verifyResult.collectAsState()
    var enteredCode by remember { mutableStateOf("") }

    LaunchedEffect(contactId) { viewModel.load(contactId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(contact?.displayName ?: stringResource(R.string.cd_verify_contact_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, stringResource(R.string.cd_cd_back))
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            if (contact?.isVerified == true) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.CheckCircle, null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            stringResource(R.string.cd_verified),
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
                Spacer(Modifier.height(20.dp))
            }

            Text(
                stringResource(R.string.cd_your_safety_number),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            Text(
                mySafetyNumber ?: stringResource(R.string.cd_dash),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(12.dp))
            Text(
                stringResource(R.string.cd_compare_body, contact?.displayName ?: stringResource(R.string.cd_them)),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(28.dp))

            Text(
                stringResource(R.string.cd_enter_their_code),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = enteredCode,
                onValueChange = {
                    enteredCode = it
                    viewModel.clearVerifyResult()
                },
                label = { Text(stringResource(R.string.cd_code_field)) },
                placeholder = { Text("123 456") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = { viewModel.verify(enteredCode) },
                enabled = enteredCode.isNotBlank() && mySafetyNumber != null,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.cd_save))
            }

            val hasRelay = contact?.myRelayConnectionString?.isNotBlank() == true ||
                contact?.theirRelayConnectionString?.isNotBlank() == true
            if (hasRelay) {
                Spacer(Modifier.height(28.dp))
                Text(
                    stringResource(R.string.cd_relay_routing),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    stringResource(R.string.cd_relay_routing_body, contact?.displayName ?: stringResource(R.string.cd_this_contact)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                val manualOwner = contact?.manualRelayOwner
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf<Pair<String, Boolean?>>(
                        stringResource(R.string.cd_relay_automatic) to null,
                        stringResource(R.string.cd_relay_mine) to true,
                        stringResource(R.string.cd_relay_theirs) to false
                    ).forEach { (label, value) ->
                        val selected = when (value) {
                            null -> manualOwner == null
                            true -> manualOwner == "mine"
                            false -> manualOwner == "theirs"
                        }
                        if (selected) {
                            Button(onClick = { viewModel.switchRelayOwner(value) }) { Text(label) }
                        } else {
                            OutlinedButton(onClick = { viewModel.switchRelayOwner(value) }) { Text(label) }
                        }
                    }
                }
            }

            verifyResult?.let { matches ->
                Spacer(Modifier.height(16.dp))
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = if (matches) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.errorContainer
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        if (matches) stringResource(R.string.cd_codes_match, contact?.displayName ?: stringResource(R.string.cd_this_contact))
                        else stringResource(R.string.cd_codes_mismatch),
                        modifier = Modifier.padding(12.dp),
                        color = if (matches) MaterialTheme.colorScheme.onPrimaryContainer
                        else MaterialTheme.colorScheme.onErrorContainer
                    )
                }
            }
        }
    }
}
