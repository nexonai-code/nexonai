package com.nexonai.unpruuf.domain.security

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Hält den Sperr-Zustand der App im RAM (nie persistiert).
 * Wird beim Start, beim Wechsel in den Hintergrund und bei Bildschirmsperre
 * auf "gesperrt" gesetzt; nur eine korrekte PIN entsperrt.
 */
@Singleton
class AppLockManager @Inject constructor() {
    private val _unlocked = MutableStateFlow(false)
    val unlocked: StateFlow<Boolean> = _unlocked.asStateFlow()

    fun unlock() { _unlocked.value = true }
    fun lock() { _unlocked.value = false }

    // ─── External-intent grace ──────────────────────────────────────────────
    // Launching a system UI the app itself asked for — the camera, the file picker —
    // puts the whole app in the background, which the process-lifecycle observer in
    // MainActivity treats as "user left → wipe RAM + lock". That turned every attach
    // attempt into a dead end: PIN screen on return, the picked photo/file dropped
    // (reported for real). Calling [beginExternalIntentGrace] right before launching
    // such an intent lets exactly that one round-trip keep the app unlocked, bounded
    // by [EXTERNAL_INTENT_GRACE_MS] in case the user never comes back. Screen-off
    // (ScreenLockReceiver) deliberately ignores this grace — pocketing the phone
    // mid-picker is a real lock event, not part of the round-trip.
    // RAM-only like the rest of this class; a fresh process starts with no grace.

    @Volatile
    private var externalIntentGraceUntil = 0L

    /** Call immediately before launching an app-initiated external system UI. */
    fun beginExternalIntentGrace() {
        externalIntentGraceUntil = System.currentTimeMillis() + EXTERNAL_INTENT_GRACE_MS
    }

    /** Still inside the allowed round-trip window? */
    fun isExternalIntentGraceActive(): Boolean =
        System.currentTimeMillis() < externalIntentGraceUntil

    /** A grace was begun and ran out without [endExternalIntentGrace] — the skipped
     *  wipe+lock from the background transition still needs to happen. */
    fun isExternalIntentGraceExpired(): Boolean =
        externalIntentGraceUntil != 0L && System.currentTimeMillis() >= externalIntentGraceUntil

    fun endExternalIntentGrace() {
        externalIntentGraceUntil = 0L
    }

    companion object {
        const val EXTERNAL_INTENT_GRACE_MS = 5 * 60_000L
    }
}
