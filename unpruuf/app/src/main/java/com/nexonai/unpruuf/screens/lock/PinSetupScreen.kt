package com.nexonai.unpruuf.screens.lock

import androidx.activity.compose.BackHandler
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.nexonai.unpruuf.R

/**
 * First-run PIN setup in two short steps, so the keyboard never hides what is being typed:
 * step 1 the PIN (twice), step 2 the panic PIN. There is deliberately no bottom bar and no extra
 * IME padding: the old one-page layout stacked a bottom-bar button with its own IME padding on top
 * of the window's resize (`adjustResize`) and the scaffold's insets, which on some phones left the
 * form no height at all while the keyboard was open. The buttons now sit inside the scrolling
 * column, right under the field being filled.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PinSetupScreen(viewModel: LockViewModel) {
    var pin by remember { mutableStateOf("") }
    var pinRepeat by remember { mutableStateOf("") }
    var panic by remember { mutableStateOf("") }
    var step by remember { mutableStateOf(1) }
    var pinsMismatch by remember { mutableStateOf(false) }
    val vmError by viewModel.error.collectAsState()
    val firstField = remember { FocusRequester() }
    val panicField = remember { FocusRequester() }

    val context = androidx.compose.ui.platform.LocalContext.current
    LaunchedEffect(step) { com.nexonai.unpruuf.ui.DebugCrashReport.trail(context, "pin setup step $step shown") }
    BackHandler(enabled = step == 2) { step = 1; viewModel.clearError() }
    LaunchedEffect(step) {
        runCatching { if (step == 1) firstField.requestFocus() else panicField.requestFocus() }
    }

    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(24.dp))
            Icon(Icons.Default.Lock, null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.lock_setup_title), style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(if (step == 1) R.string.lock_setup_description else R.string.lock_setup_panic_description),
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(R.string.lock_setup_step, step),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.height(20.dp))

            if (step == 1) {
                PinField(pin, { pin = it.filter(Char::isDigit); pinsMismatch = false }, stringResource(R.string.lock_field_pin), Modifier.focusRequester(firstField))
                Spacer(Modifier.height(12.dp))
                PinField(pinRepeat, { pinRepeat = it.filter(Char::isDigit); pinsMismatch = false }, stringResource(R.string.lock_field_repeat_pin))
            } else {
                PinField(panic, { panic = it.filter(Char::isDigit); viewModel.clearError() }, stringResource(R.string.lock_field_panic_pin), Modifier.focusRequester(panicField))
            }

            val errText = when {
                step == 1 && pinsMismatch -> stringResource(R.string.lock_err_pins_mismatch)
                step == 2 && vmError == LockError.PIN_TOO_SHORT -> stringResource(R.string.lock_err_pin_too_short)
                step == 2 && vmError == LockError.PANIC_SAME_AS_PIN -> stringResource(R.string.lock_err_panic_same_as_pin)
                vmError == LockError.WRONG_PIN -> stringResource(R.string.lock_err_wrong_pin)
                vmError == LockError.PIN_STORE_LOST -> stringResource(R.string.lock_err_store_lost)
                else -> null
            }
            if (errText != null) {
                Spacer(Modifier.height(12.dp))
                Text(errText, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(20.dp))

            if (step == 1) {
                Button(
                    onClick = {
                        viewModel.clearError()
                        if (pin != pinRepeat) { pinsMismatch = true } else { step = 2 }
                    },
                    enabled = pin.length >= 4 && pinRepeat.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth()
                ) { Text(stringResource(R.string.lock_setup_next)) }
            } else {
                Button(
                    onClick = { viewModel.setupPins(pin, panic) },
                    enabled = panic.length >= 4,
                    modifier = Modifier.fillMaxWidth()
                ) { Text(stringResource(R.string.lock_save_pin)) }
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = { step = 1; viewModel.clearError() }, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.lock_setup_back))
                }
            }
            if (com.nexonai.unpruuf.BuildConfig.DEBUG) {
                Spacer(Modifier.height(16.dp))
                TextButton(onClick = {
                    val text = com.nexonai.unpruuf.ui.DebugCrashReport.read(context)
                        ?: com.nexonai.unpruuf.ui.DebugCrashReport.trailText(context) ?: "(nothing recorded yet)"
                    (context as? androidx.activity.ComponentActivity)?.let { act ->
                        act.startActivity(
                            android.content.Intent.createChooser(
                                android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(android.content.Intent.EXTRA_TEXT, text)
                                },
                                "Send debug log"
                            )
                        )
                    }
                }) { Text("Debug: send log") }
            }
            Spacer(Modifier.height(48.dp))
        }
    }
}

@Composable
private fun PinField(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier) {
    OutlinedTextField(
        value = value,
        onValueChange = { if (it.length <= 12) onChange(it) },
        label = { Text(label) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = modifier.fillMaxWidth()
    )
}
