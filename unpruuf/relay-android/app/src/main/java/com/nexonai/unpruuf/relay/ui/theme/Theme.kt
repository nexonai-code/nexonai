package com.nexonai.unpruuf.relay.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.sp

// Same "Quiet Ink" palette as the main unpruuf app's ui/theme — this is a separate Gradle
// project with no shared module, so the tokens are duplicated rather than imported, but kept
// numerically identical so the two apps read as one family.
val Ink = Color(0xFF0E1517)
val Surface = Color(0xFF151E20)
val Raised = Color(0xFF1B2629)
val Line = Color(0xFF243134)
val TextPrimary = Color(0xFFE9EEED)
val TextDim = Color(0xFF8DA09D)
val Accent = Color(0xFF45D0BB)
val AccentDeep = Color(0xFF123B35)
val Amber = Color(0xFFE0A33C)
val Danger = Color(0xFFE25C6C)

private val RelayColorScheme = darkColorScheme(
    primary = Accent,
    onPrimary = Ink,
    primaryContainer = AccentDeep,
    onPrimaryContainer = TextPrimary,
    secondary = TextDim,
    onSecondary = Ink,
    tertiary = Amber,
    onTertiary = Ink,
    background = Ink,
    onBackground = TextPrimary,
    surface = Surface,
    onSurface = TextPrimary,
    surfaceVariant = Raised,
    onSurfaceVariant = TextDim,
    outline = Line,
    outlineVariant = Line,
    error = Danger,
    onError = TextPrimary
)

// Same "technical voice" idea as the main app: labels are monospace with a touch of tracking,
// used for the connection string, status, and every timestamp/count on this screen.
private val RelayTypography = Typography(
    labelSmall = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontSize = 10.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.6.sp
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp
    )
)

@Composable
fun UnpruufRelayTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = RelayColorScheme,
        typography = RelayTypography,
        content = content
    )
}
