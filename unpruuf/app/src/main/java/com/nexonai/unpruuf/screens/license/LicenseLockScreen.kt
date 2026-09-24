package com.nexonai.unpruuf.screens.license

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.nexonai.unpruuf.domain.AppEdition
import com.nexonai.unpruuf.domain.license.LicenseManager
import com.nexonai.unpruuf.domain.license.LicenseState

/**
 * The hard gate for a Standard/Pro install with no valid license (see
 * [LicenseManager.requiresLicense] — Client is free and never reaches this screen). Shown by
 * MainActivity in place of AppNavigation whenever the license state isn't Valid/ExpiringSoon.
 * No data is at risk here — RAM-only messages, PIN, panic-PIN are all untouched by licensing;
 * this only blocks reaching the chat list until a valid code is entered.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LicenseLockScreen(licenseManager: LicenseManager) {
    val state by licenseManager.state.collectAsState()
    var codeInput by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    Scaffold(
        bottomBar = {
            Surface(shadowElevation = 8.dp) {
                Button(
                    onClick = {
                        val result = licenseManager.applyLicenseCode(codeInput)
                        error = result
                        if (result == null) codeInput = ""
                    },
                    enabled = codeInput.isNotBlank(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .imePadding()
                        .padding(horizontal = 24.dp, vertical = 12.dp)
                ) { Text("Activate") }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(32.dp))
            Icon(
                Icons.Default.VerifiedUser, null,
                modifier = Modifier.size(56.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.height(16.dp))
            Text("License required", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            Text(
                statusText(state),
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(24.dp))

            OutlinedTextField(
                value = codeInput,
                onValueChange = { error = null; codeInput = it },
                label = { Text("License code") },
                placeholder = { Text("unpruuf-license:v1:...") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None),
                modifier = Modifier.fillMaxWidth()
            )

            if (error != null) {
                Spacer(Modifier.height(12.dp))
                Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

private fun statusText(state: LicenseState): String = when (state) {
    is LicenseState.NotConfigured ->
        "unpruuf ${AppEdition.label} needs a license code to run. Paste the code you received " +
        "from your reseller below."
    is LicenseState.Expired ->
        "The license for this device (${state.info.serial}) expired on " +
        "${formatDate(state.info.expiresAtMs)}. Enter a renewal code to continue."
    is LicenseState.Invalid ->
        "${state.reason} Enter a valid license code to continue."
    is LicenseState.Valid, is LicenseState.ExpiringSoon ->
        // Unreachable in practice — MainActivity only shows this screen for the other three
        // states — but keeps `when` exhaustive without an `else` that would silently swallow a
        // future LicenseState case.
        "Enter a valid license code to continue."
}

private fun formatDate(epochMs: Long): String =
    java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(java.util.Date(epochMs))
