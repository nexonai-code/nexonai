package com.nexonai.unpruuf.ui.theme

import androidx.compose.ui.graphics.Color

// "Quiet Ink" palette — teal-biased near-blacks layered by elevation instead of neutral
// greys, so the dark theme reads as chosen rather than defaulted. Three surface levels
// (ink → surface → raised) do the depth work; hairlines only where a surface can't.
val UnpruufBlack = Color(0xFF0E1517)      // ink — app ground
val UnpruufDarkGray = Color(0xFF151E20)   // surface — cards, fields, app bars
val UnpruufGray = Color(0xFF1B2629)       // raised — incoming bubbles, avatars
val UnpruufLine = Color(0xFF243134)       // hairline dividers/borders
val UnpruufWhite = Color(0xFFE9EEED)      // primary text (soft, not pure white)
val UnpruufLightGray = Color(0xFF8DA09D)  // dim — secondary text, the technical voice
val UnpruufRed = Color(0xFFE25C6C)
val UnpruufAmber = Color(0xFFE0A33C)      // "connecting"/pending states
val UnpruufGreen = Color(0xFF37C871)      // signal green — unread dot

// Akzentfarbe pro Edition — macht auf einen Blick sichtbar, welche Version läuft.
// Standard = Seafoam · Pro = Gold · Client = Blau. The dark companion of each accent
// is a deep SURFACE tint (own chat bubbles, banners), not just a darker button color —
// the accent itself stays reserved for state and action.
val StandardAccent = Color(0xFF45D0BB)
val StandardAccentDark = Color(0xFF123B35)
val ProAccent = Color(0xFFE3B341)
val ProAccentDark = Color(0xFF3A2E14)
val ClientAccent = Color(0xFF64A9EE)
val ClientAccentDark = Color(0xFF122C44)
