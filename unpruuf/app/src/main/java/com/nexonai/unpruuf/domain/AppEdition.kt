package com.nexonai.unpruuf.domain

import com.nexonai.unpruuf.BuildConfig

/**
 * Edition der laufenden App (per Gradle-Flavor gesetzt).
 *
 * Pairing-Regeln (wer darf wen per QR hinzufügen):
 *  - Pro:      darf Standard und Client hinzufügen (lädt insbesondere Client-Nutzer ein).
 *  - Standard: darf Standard und Pro hinzufügen, aber KEINE Client-Nutzer.
 *  - Client:   darf sich NUR mit Pro-Nutzern verbinden.
 *  - Whistleblower / Officer: eigene, vom Consumer-Produkt komplett isolierte Produktlinie
 *    (siehe CROSS_PLATFORM_PLAN.md "Two separate product lines") — dürfen ausschließlich
 *    miteinander, nie mit Standard/Pro/Client. [OFFICER] ist keine echte Android-Edition
 *    (läuft nie als Gradle-Flavor) — es ist der `e`-Feld-Wert, den die separate Node-basierte
 *    Officer-App (unpruuf/officer-app/) in ihre eigene Pairing-QR schreibt, damit
 *    AppEdition.canAdd() den Officer-Peer erkennen kann, obwohl er kein Android ist.
 */
object AppEdition {
    const val STANDARD = "standard"
    const val PRO = "pro"
    const val CLIENT = "client"
    const val WHISTLEBLOWER = "whistleblower"
    const val OFFICER = "officer"
    /** Press edition of the reporting app (a source writing to a journalist): behaves exactly like
     *  [WHISTLEBLOWER], only the wording differs (app/src/press/res). */
    const val PRESS = "press"

    val current: String get() = BuildConfig.EDITION

    val isStandard: Boolean get() = current == STANDARD
    val isPro: Boolean get() = current == PRO
    val isClient: Boolean get() = current == CLIENT
    /** True for both reporting editions: they share every rule, press only changes the words. */
    val isWhistleblower: Boolean get() = current == WHISTLEBLOWER || current == PRESS

    /** Anzeigename der Edition, z. B. "Pro". */
    val label: String
        get() = when (current) {
            PRO -> "Pro"
            CLIENT -> "Client"
            WHISTLEBLOWER -> "Whistleblower"
            PRESS -> "Press"
            else -> "Standard"
        }

    /** Darf diese App einen Kontakt der Edition [theirEdition] per QR hinzufügen? */
    fun canAdd(theirEdition: String): Boolean = when (current) {
        WHISTLEBLOWER, PRESS -> theirEdition == OFFICER
        PRO -> theirEdition != WHISTLEBLOWER && theirEdition != PRESS && theirEdition != OFFICER
        CLIENT -> theirEdition == PRO
        else -> theirEdition != CLIENT && theirEdition != WHISTLEBLOWER && theirEdition != PRESS && theirEdition != OFFICER // standard
    }

    /** Erklärtext, warum ein Pairing blockiert wurde. */
    fun blockReason(theirEdition: String): String = when {
        isWhistleblower -> "This app can only connect with a compliance officer's pairing code."
        isClient -> "unpruuf Client can only connect with unpruuf Pro users."
        theirEdition == CLIENT -> "Only unpruuf Pro can add Client users."
        theirEdition == WHISTLEBLOWER || theirEdition == PRESS || theirEdition == OFFICER ->
            "This is a whistleblower/compliance pairing code — it can't be added here."
        else -> "This contact can't be added in this edition."
    }
}
