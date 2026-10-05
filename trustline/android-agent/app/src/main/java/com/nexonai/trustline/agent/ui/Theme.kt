package com.nexonai.trustline.agent.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Light = lightColorScheme(primary = Color(0xFF0B5C6B), onPrimary = Color.White, secondary = Color(0xFF2E7D32), error = Color(0xFFB3261E),
    background = Color(0xFFF5F7F8), surface = Color.White)
private val Dark = darkColorScheme(primary = Color(0xFF6CC4D4), onPrimary = Color(0xFF00252B), secondary = Color(0xFF81C784), error = Color(0xFFF2B8B5))

@Composable
fun TrustLineTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
