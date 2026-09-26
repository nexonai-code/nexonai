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

    val current: String get() = BuildConfig.EDITION

    val isStandard: Boolean get() = current == STANDARD
    val isPro: Boolean get() = current == PRO
    val isClient: Boolean get() = current == CLIENT
    val isWhistleblower: Boolean get() = current == WHISTLEBLOWER

    /** Anzeigename der Edition, z. B. "Pro". */
    val label: String
        get() = when (current) {
            PRO -> "Pro"
            CLIENT -> "Client"
            WHISTLEBLOWER -> "Whistleblower"
            else -> "Standard"
        }

    /** Darf diese App einen Kontakt der Edition [theirEdition] per QR hinzufügen? */
    fun canAdd(theirEdition: String): Boolean = when (current) {
        WHISTLEBLOWER -> theirEdition == OFFICER
        PRO -> theirEdition != WHISTLEBLOWER && theirEdition != OFFICER
        CLIENT -> theirEdition == PRO
        else -> theirEdition != CLIENT && theirEdition != WHISTLEBLOWER && theirEdition != OFFICER // standard
    }

    /** Erklärtext, warum ein Pairing blockiert wurde. */
    fun blockReason(theirEdition: String): String = when {
        isWhistleblower -> "This app can only connect with a compliance officer's pairing code."
        isClient -> "unpruuf Client can only connect with unpruuf Pro users."
        theirEdition == CLIENT -> "Only unpruuf Pro can add Client users."
        theirEdition == WHISTLEBLOWER || theirEdition == OFFICER ->
            "This is a whistleblower/compliance pairing code — it can't be added here."
        else -> "This contact can't be added in this edition."
    }
}
