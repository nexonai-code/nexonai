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
    /** unpruuf Pro Groups: Pro (Business) plus local groups. Own install id, pairs only with other
     *  Groups installs, so every contact of a group member is guaranteed to understand group
     *  messages. Pro/Standard/Client never see it as a contact and vice versa. */
    const val GROUP = "group"

    val current: String get() = BuildConfig.EDITION

    val isStandard: Boolean get() = current == STANDARD
    /** True for Pro and for Pro Groups: the Groups edition is Pro with local groups on top, so
     *  every "behaves like Pro" check (Node-Mesh only, licence, pairing UI) includes it. */
    val isPro: Boolean get() = current == PRO || current == GROUP
    val isGroup: Boolean get() = current == GROUP
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
            GROUP -> "Pro Groups"
            else -> "Standard"
        }

    /** Darf diese App einen Kontakt der Edition [theirEdition] per QR hinzufügen? */
    fun canAdd(theirEdition: String): Boolean = when (current) {
        WHISTLEBLOWER, PRESS -> theirEdition == OFFICER
        GROUP -> theirEdition == GROUP
        PRO -> theirEdition != WHISTLEBLOWER && theirEdition != PRESS && theirEdition != OFFICER && theirEdition != GROUP
        CLIENT -> theirEdition == PRO
        else -> theirEdition != CLIENT && theirEdition != WHISTLEBLOWER && theirEdition != PRESS && theirEdition != OFFICER && theirEdition != GROUP // standard
    }

    /** Why a pairing was blocked — text from the resources (English / Romanian). */
    fun blockReason(context: android.content.Context, theirEdition: String): String = context.getString(
        when {
            isGroup -> com.nexonai.unpruuf.R.string.msg_edition_group_only
            theirEdition == GROUP -> com.nexonai.unpruuf.R.string.msg_edition_group_code
            isWhistleblower -> com.nexonai.unpruuf.R.string.msg_edition_wb_only
            isClient -> com.nexonai.unpruuf.R.string.msg_edition_client_only
            theirEdition == CLIENT -> com.nexonai.unpruuf.R.string.msg_edition_pro_adds_client
            theirEdition == WHISTLEBLOWER || theirEdition == PRESS || theirEdition == OFFICER -> com.nexonai.unpruuf.R.string.msg_edition_wb_code
            else -> com.nexonai.unpruuf.R.string.msg_edition_other
        }
    )
}
