package com.nexonai.unpruuf.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke

/**
 * The "Eclipse" mark (see BRANDING.md), drawn directly with Canvas/Path
 * instead of a raster asset so it can take the current edition's accent
 * color like any other themed element. Geometry mirrors BRANDING.md's
 * canonical 100x100 SVG path (M20,20 L20,60 A30,30 0 0,0 80,60 L80,20)
 * exactly; keep this in sync with the launcher-icon vector drawables
 * (ic_launcher_foreground.xml in the main/pro/client flavors) if the mark
 * is ever redrawn.
 */
@Composable
fun EclipseMark(
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.primary
) {
    Canvas(modifier = modifier) {
        val s = size.minDimension / 100f
        val offsetX = (size.width - 100f * s) / 2f
        val offsetY = (size.height - 100f * s) / 2f
        fun x(v: Float) = offsetX + v * s
        fun y(v: Float) = offsetY + v * s

        val path = Path().apply {
            moveTo(x(20f), y(20f))
            lineTo(x(20f), y(60f))
            arcTo(
                rect = Rect(x(20f), y(30f), x(80f), y(90f)),
                startAngleDegrees = 180f,
                sweepAngleDegrees = 180f,
                forceMoveTo = false
            )
            lineTo(x(80f), y(20f))
        }

        val brush = Brush.verticalGradient(
            colors = listOf(color, color.copy(alpha = 0f)),
            startY = y(90f),
            endY = y(20f)
        )

        drawPath(
            path = path,
            brush = brush,
            style = Stroke(width = 8f * s, cap = StrokeCap.Round)
        )
    }
}
