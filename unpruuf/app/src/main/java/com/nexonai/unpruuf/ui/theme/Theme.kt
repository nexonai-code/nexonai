package com.nexonai.unpruuf.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.nexonai.unpruuf.domain.AppEdition

private fun schemeFor(accent: Color, accentDeep: Color) = darkColorScheme(
    primary = accent,
    onPrimary = UnpruufBlack,
    // The accent's DEEP SURFACE form: own chat bubbles, status pills, banners. Text on it
    // is regular text color, not white-on-accent — the accent never floods a surface.
    primaryContainer = accentDeep,
    onPrimaryContainer = UnpruufWhite,
    secondary = UnpruufLightGray,
    onSecondary = UnpruufBlack,
    // secondaryContainer drives the Contacts screen's migration banner (see
    // LegacyOnionBanner) — mapped to the same deep accent surface as primaryContainer
    // so every "attention" surface in the app shares one calm treatment.
    secondaryContainer = accentDeep,
    onSecondaryContainer = UnpruufWhite,
    tertiary = UnpruufAmber,
    onTertiary = UnpruufBlack,
    background = UnpruufBlack,
    onBackground = UnpruufWhite,
    surface = UnpruufDarkGray,
    onSurface = UnpruufWhite,
    surfaceVariant = UnpruufGray,
    onSurfaceVariant = UnpruufLightGray,
    outline = UnpruufLine,
    outlineVariant = UnpruufLine,
    error = UnpruufRed,
    onError = UnpruufWhite
)

// The "two voices" rule from the design system: human content in the platform grotesk
// (Roboto — untouched), everything technical in monospace. label styles are exactly
// where the technical voice already lives across the app — timestamps, delivery state,
// the encryption line, status pills, section eyebrows — so overriding them applies the
// voice everywhere at once without touching each call site.
private val QuietInkTypography = Typography(
    labelSmall = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Normal,
        fontSize = 10.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.6.sp
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Normal,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp
    )
)

@Composable
fun UnpruufTheme(content: @Composable () -> Unit) {
    // Farbschema nach Edition — sofort sichtbar, welche Version läuft.
    val scheme = when (AppEdition.current) {
        AppEdition.PRO -> schemeFor(ProAccent, ProAccentDark)
        AppEdition.CLIENT -> schemeFor(ClientAccent, ClientAccentDark)
        else -> schemeFor(StandardAccent, StandardAccentDark)
    }
    MaterialTheme(
        colorScheme = scheme,
        typography = QuietInkTypography,
        content = content
    )
}
