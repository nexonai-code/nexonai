package com.nexonai.unpruuf.domain

import com.nexonai.unpruuf.BuildConfig

/**
 * Edition der laufenden App (per Gradle-Flavor gesetzt).
 *
 * Pairing-Regeln (wer darf wen per QR hinzufügen):
 *  - Pro:      darf jeden hinzufügen (lädt insbesondere Client-Nutzer ein).
 *  - Standard: darf Standard und Pro hinzufügen, aber KEINE Client-Nutzer.
 *  - Client:   darf sich NUR mit Pro-Nutzern verbinden.
 */
object AppEdition {
    const val STANDARD = "standard"
    const val PRO = "pro"
    const val CLIENT = "client"

    val current: String get() = BuildConfig.EDITION

    val isStandard: Boolean get() = current == STANDARD
    val isPro: Boolean get() = current == PRO
    val isClient: Boolean get() = current == CLIENT

    /** Anzeigename der Edition, z. B. "Pro". */
    val label: String
        get() = when (current) {
            PRO -> "Pro"
            CLIENT -> "Client"
            else -> "Standard"
        }

    /** Darf diese App einen Kontakt der Edition [theirEdition] per QR hinzufügen? */
    fun canAdd(theirEdition: String): Boolean = when (current) {
        PRO -> true
        CLIENT -> theirEdition == PRO
        else -> theirEdition != CLIENT // standard
    }

    /** Erklärtext, warum ein Pairing blockiert wurde. */
    fun blockReason(theirEdition: String): String = when {
        isClient -> "unpruuf Client can only connect with unpruuf Pro users."
        theirEdition == CLIENT -> "Only unpruuf Pro can add Client users."
        else -> "This contact can't be added in this edition."
    }
}
