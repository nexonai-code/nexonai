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
                title = { Text(contact?.displayName ?: "Verify contact") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
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
                            "Verified",
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
                Spacer(Modifier.height(20.dp))
            }

            Text(
                "YOUR SAFETY NUMBER FOR THIS CONTACT",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            Text(
                mySafetyNumber ?: "—",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(12.dp))
            Text(
                "Compare this with ${contact?.displayName ?: "them"} over a call or voice " +
                "message — NOT the same channel you used to share the pairing code. If both " +
                "sides see the same number, the pairing code wasn't tampered with on the way.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(28.dp))

            Text(
                "ENTER THEIR CODE",
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
                label = { Text("Code they read you") },
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
                Text("Save")
            }

            val hasRelay = contact?.myRelayConnectionString?.isNotBlank() == true ||
                contact?.theirRelayConnectionString?.isNotBlank() == true
            if (hasRelay) {
                Spacer(Modifier.height(28.dp))
                Text(
                    "RELAY ROUTING",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Which side's relay list is used to reach ${contact?.displayName ?: "this contact"}. " +
                        "Automatic switches on its own rhythm; pin it manually to force one side.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                val manualOwner = contact?.manualRelayOwner
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf<Pair<String, Boolean?>>(
                        "Automatic" to null,
                        "Mine" to true,
                        "Theirs" to false
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
                        if (matches) "Codes match — ${contact?.displayName ?: "this contact"} is verified."
                        else "Codes don't match. Do not assume this contact is who they claim — " +
                            "ask them to read their code again, or re-pair carefully.",
                        modifier = Modifier.padding(12.dp),
                        color = if (matches) MaterialTheme.colorScheme.onPrimaryContainer
                        else MaterialTheme.colorScheme.onErrorContainer
                    )
                }
            }
        }
    }
}
