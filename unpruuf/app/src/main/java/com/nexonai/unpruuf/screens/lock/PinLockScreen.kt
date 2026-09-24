package com.nexonai.unpruuf.screens.lock

import android.content.Context
import android.content.ContextWrapper
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

/**
 * Quiet Ink lock screen: dimmed wordmark, PIN dots, a real number pad. Deliberately
 * reveals nothing about what the app protects, and — critically — looks IDENTICAL for a
 * normal PIN and the panic PIN: same dots, same pad, same everything. Submit is the ✓ key
 * (PINs are 4–12 digits, so auto-submit at a fixed length is impossible).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PinLockScreen(viewModel: LockViewModel) {
    var pin by remember { mutableStateOf("") }
    val error by viewModel.error.collectAsState()

    // Fingerprint is a pure convenience layer on top of the PIN, opt-in via Settings — see
    // PinManager.isBiometricEnabled. It can only ever stand in for the NORMAL PIN; there is no
    // biometric equivalent of the panic PIN, so this never touches that path.
    val context = LocalContext.current
    val activity = remember(context) { context.findFragmentActivity() }
    val biometricReady = remember(activity) {
        activity != null && viewModel.isBiometricEnabled &&
            BiometricManager.from(activity)
                .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
                BiometricManager.BIOMETRIC_SUCCESS
    }
    if (biometricReady && activity != null) {
        LaunchedEffect(Unit) {
            showBiometricPrompt(activity) { viewModel.biometricUnlock() }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.weight(1f))

        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(color = MaterialTheme.colorScheme.primary)) { append("un") }
                append("pruuf")
            },
            fontWeight = FontWeight.ExtraBold,
            fontSize = 22.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(10.dp))
        Text(
            "Enter PIN · B2",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(Modifier.height(28.dp))

        // One dot per typed digit; at least four slots so the target length reads at a
        // glance without revealing how long this user's actual PIN is.
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val slots = maxOf(4, pin.length)
            repeat(slots) { index ->
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(
                            if (index < pin.length) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.surfaceVariant
                        )
                )
            }
        }

        Spacer(Modifier.height(14.dp))

        // Fixed-height error slot so the pad never jumps when a message appears.
        Box(modifier = Modifier.height(20.dp), contentAlignment = Alignment.Center) {
            error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        }

        Spacer(Modifier.height(14.dp))

        val keyRows = listOf(
            listOf("1", "2", "3"),
            listOf("4", "5", "6"),
            listOf("7", "8", "9"),
            listOf("✓", "0", "⌫")
        )
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            keyRows.forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                    row.forEach { key ->
                        when (key) {
                            "✓" -> PadKey(
                                label = "✓",
                                emphasized = pin.length >= 4,
                                enabled = pin.length >= 4
                            ) {
                                viewModel.submitPin(pin)
                                pin = ""
                            }
                            "⌫" -> PadKey(label = "⌫", ghost = true, enabled = pin.isNotEmpty()) {
                                pin = pin.dropLast(1)
                                viewModel.clearError()
                            }
                            else -> PadKey(label = key, enabled = pin.length < 12) {
                                pin += key
                                viewModel.clearError()
                            }
                        }
                    }
                }
            }
        }

        if (biometricReady && activity != null) {
            Spacer(Modifier.height(22.dp))
            Surface(
                onClick = { showBiometricPrompt(activity) { viewModel.biometricUnlock() } },
                shape = CircleShape,
                color = MaterialTheme.colorScheme.background,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                modifier = Modifier.size(72.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.Default.Fingerprint,
                        contentDescription = "Unlock with fingerprint",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(34.dp)
                    )
                }
            }
        }

        Spacer(Modifier.weight(1.4f))
    }
}

// Compose's LocalContext isn't always the Activity itself — walk the ContextWrapper chain to
// find it, the standard way to reach a FragmentActivity from inside a composable.
private tailrec fun Context.findFragmentActivity(): FragmentActivity? = when (this) {
    is FragmentActivity -> this
    is ContextWrapper -> baseContext.findFragmentActivity()
    else -> null
}

// Biometric-only, no device-credential fallback: unpruuf already has its own separate PIN —
// falling back to the PHONE's lock-screen credential here would be a different, weaker secret
// than unpruuf's own PIN, so it's deliberately not offered. Declining or failing the prompt
// just leaves the PIN pad usable as normal, nothing else happens.
private fun showBiometricPrompt(activity: FragmentActivity, onSuccess: () -> Unit) {
    val promptInfo = BiometricPrompt.PromptInfo.Builder()
        .setTitle("Unlock unpruuf")
        .setSubtitle("Confirm your fingerprint to continue")
        .setNegativeButtonText("Use PIN instead")
        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        .build()
    val prompt = BiometricPrompt(
        activity,
        ContextCompat.getMainExecutor(activity),
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                onSuccess()
            }
        }
    )
    prompt.authenticate(promptInfo)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PadKey(
    label: String,
    emphasized: Boolean = false,
    ghost: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    val container = when {
        emphasized -> MaterialTheme.colorScheme.primary
        ghost -> MaterialTheme.colorScheme.background
        else -> MaterialTheme.colorScheme.surface
    }
    val content = when {
        emphasized -> MaterialTheme.colorScheme.onPrimary
        else -> if (enabled) MaterialTheme.colorScheme.onSurface
        else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
    }
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = CircleShape,
        color = container,
        contentColor = content,
        border = if (ghost || emphasized) null
        else BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.size(64.dp)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                label,
                fontFamily = FontFamily.Monospace,
                fontSize = 20.sp,
                color = content
            )
        }
    }
}
