package com.nexonai.unpruuf.screens.lock

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PinSetupScreen(viewModel: LockViewModel) {
    var pin by remember { mutableStateOf("") }
    var pinRepeat by remember { mutableStateOf("") }
    var panic by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    val vmError by viewModel.error.collectAsState()

    Scaffold(
        bottomBar = {
            // bottomBar respektiert System-Insets + Tastatur → Button ist IMMER sichtbar.
            Surface(shadowElevation = 8.dp) {
                Button(
                    onClick = {
                        localError = null
                        viewModel.clearError()
                        if (pin != pinRepeat) { localError = "PINs do not match."; return@Button }
                        viewModel.setupPins(pin, panic)
                    },
                    enabled = pin.length >= 4 && pinRepeat.isNotEmpty() && panic.length >= 4,
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .imePadding()
                        .padding(horizontal = 24.dp, vertical = 12.dp)
                ) { Text("Save PIN") }
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
            Icon(Icons.Default.Lock, null, modifier = Modifier.size(56.dp), tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(16.dp))
            Text("Set up PIN · B2", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            Text(
                "Set a PIN to open the app and a separate panic PIN. " +
                "Entering the panic PIN instantly deletes all contacts and opens the app empty.",
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(24.dp))

            PinField(pin, { pin = it.filter(Char::isDigit) }, "PIN (min. 4 digits)")
            Spacer(Modifier.height(12.dp))
            PinField(pinRepeat, { pinRepeat = it.filter(Char::isDigit) }, "Repeat PIN")
            Spacer(Modifier.height(12.dp))
            PinField(panic, { panic = it.filter(Char::isDigit) }, "Panic PIN")

            val err = localError ?: vmError
            if (err != null) {
                Spacer(Modifier.height(12.dp))
                Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun PinField(value: String, onChange: (String) -> Unit, label: String) {
    OutlinedTextField(
        value = value,
        onValueChange = { if (it.length <= 12) onChange(it) },
        label = { Text(label) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = Modifier.fillMaxWidth()
    )
}
