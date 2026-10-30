# Konzept: Spamschutz für offene Eingänge (unpruuf Compliance, Press, später öffentliche Stellen)

Stand 23.10.2026. Entwurf zur Entscheidung durch das Team. Nichts davon ist gebaut.

## 1. Das Problem

Ein offener Eingang (Plakat-QR, Website, Hinweisseite) kann von jedem beschrieben werden. Weil unpruuf keine Identitäten kennt, fällt die übliche Bremse weg: Es gibt keine IP, kein Konto, keine Telefonnummer, nach der man sperren könnte. Das darf auch so bleiben. Gebremst wird deshalb nie nach Person, sondern nach Kosten, Menge, Größe, Vertrauensstufe und Auswertung.

## 2. Was heute schon schützt (aus dem Code)

- Bestehende Fälle sind geschützt: Auf den Briefkästen darf nur der Besitzer ablegen (`PUT /deposit` ist Owner-only), ein Fremder kann dort keinen Spam ablegen.
- Pakete sind höchstens 4096 Bytes groß, haben eine Lebensdauer von höchstens 24 Stunden, und der Server hat eine Gesamtgrenze (200 000 Pakete).
- Lese-Endpunkte haben einen Token-Bucket je Adresse. Verbindungs-Floods bremst Tor-PoW (Server/PC).
- Gast-Grants (signiert, befristet, mit Kontingent je Stunde) sind gebaut, aber noch nicht für Eingänge genutzt.

Was fehlt: Der öffentliche Eingang des Officer-Dashboards (neue Meldung → neuer Fall) hat keine Mengen- oder Kostenbremse, und es gibt keinen Spam-Ordner.

## 3. Wo Spam überhaupt hinkommt

Nur an **eine** Stelle: die Tür für „neue Meldung“. Alles dahinter (laufende Fälle) ist privat und per Schlüssel geschützt. Das Konzept hält deshalb die Tür klein und kapselt sie ab:

- Die öffentliche Tür nimmt nur eine kleine „Neuer Fall“-Anfrage entgegen, keine Anhänge, keine langen Texte.
- Alles Weitere läuft erst nach Annahme über den privaten Fall-Kanal.
- Wird die Tür geflutet, bleibt jeder laufende Fall unberührt.

## 4. Die Schichten (von billig bis stark)

1. **Eigener Server für die öffentliche Tür.** Die 250 Adressen eines Servers teilen sich einen Speicher. Ein Spamangriff könnte sonst echte Pakete verdrängen. Eingang und interne Kommunikation gehören auf getrennte Server (eine Lizenz je Server). Wirkung: Blast-Radius begrenzt. Aufwand: keiner im Code.
2. **Mengenlimit an der Tür.** Globale Obergrenze neuer Anfragen pro Stunde und Tag (einstellbar), dazu Größenlimit. Ohne Person lässt sich nur global begrenzen. Das ist ehrlich: Ein Angreifer kann damit die Tür für alle zudrehen, deshalb braucht es Schicht 5.
3. **Quarantäne-Stufe für neue Fälle.** Ein neuer Fall ist „ungeprüft“: nur Text, höchstens wenige Nachrichten, keine Anhänge. Erst wenn die Stelle „annehmen“ klickt, steigen die Grenzen (mehr Nachrichten, Anhänge). Unangenommene Fälle verschwinden nach einer festen Frist (Vorschlag 7 Tage). Das passt zu Speicherbegrenzung. Wichtig: Nichts wird vor menschlicher Sicht automatisch gelöscht, ein Notfall darf nicht im Filter sterben.
4. **Rechenaufwand beim Absender (Proof-of-Work).** Das Melder-Gerät muss vor dem Senden eine kleine Rechenaufgabe lösen (Sekunden am Telefon). Der Server prüft sie in Millisekunden. Die Schwierigkeit steigt automatisch bei Last. Wirkung: macht Massenspam teuer, ohne Identität. Grenze: kein Schutz gegen einen zahlungskräftigen Angreifer, es kauft Zeit.
5. **Kampagnen-Tickets.** Statt eines für alle offenen Eingangs trägt jedes Plakat oder jeder Flyer ein eigenes signiertes, befristetes Ticket im QR (derselbe Mechanismus wie Gast-Grants: stateless, Ablauf, Kontingent). Wird ein Plakat missbraucht, tauscht die Stelle dessen QR aus; alle anderen Kampagnen laufen weiter. Außerdem sieht die Stelle, welcher Kanal Spam bringt. Das ist die stärkste Bremse ohne Identität.
6. **Auswertung im Dashboard.** Spam-Ordner, Sammelaktionen (markieren, löschen, Fall sperren), Gruppierung gleicher Texte, Zähler und Warnung bei ungewöhnlicher Rate.
7. **Notbetrieb („Under attack“).** Ein Schalter in der Oberfläche: Schwierigkeit hoch, nur noch Kampagnen-Tickets, oder Eingang vorübergehend zu mit Hinweistext. Die Eingangsadresse lässt sich tauschen, ohne die Fälle zu berühren.

## 5. Ehrliche Grenzen (so sagen wir es auch)

- Ein entschlossener Angreifer, der die Kosten zahlt, bleibt nicht aufzuhalten. Wir machen es teuer, begrenzen den Schaden und halten die Auswertung beherrschbar.
- Anonym heißt: keine Sperre nach Person. Gesperrt werden Fälle, Tickets und Eingänge, nicht Menschen.
- Strenge Bremsen kosten echte Melder Komfort (Rechenzeit, Ticket nötig). Je nach Stelle ist die Einstellung anders: Polizei-Eingang offen mit PoW, Drogenhilfe vielleicht mit Ticket am Plakat und Notfallhinweis.
- Nicht geprüft: das Verhalten unter echter Last. Alle Zahlen oben sind Vorschläge.

## 6. Reihenfolge und Aufwand (Vorschlag)

| Stufe | Inhalt | Format/Protokoll betroffen? | iOS (Norbert) |
|---|---|---|---|
| A | Getrennter Server, Mengenlimit, Quarantäne, Spam-Ordner, Notbetrieb (Schichten 1, 2, 3, 6, 7) | nein, nur Officer-App und Betrieb | nein |
| B | Proof-of-Work an der Tür (Schicht 4) | ja, ein Feld in der Intake-Anfrage (Android, Web-Reporter, später iOS) | ja |
| C | Kampagnen-Tickets (Schicht 5) | nutzt Gast-Grants, Server mit `NODE_MESH_GUEST_GRANTS=1` | ja |

Stufe B und C berühren das Format. Offene Entscheidung F1 (Paketlänge im Klartext) steht noch: Format nur anfassen, wenn das Team zugestimmt hat. Empfehlung: Stufe A zuerst bauen (nichts am Wire-Format), B und C zusammen mit F1 entscheiden.

## 7. Entscheidungen für das Team

1. Soll Stufe A gebaut werden?
2. Frist für unangenommene Fälle (Vorschlag 7 Tage)?
3. B und C gemeinsam mit F1 entscheiden?
4. Für Drogenhilfe und ähnliche Stellen: Notfall-Hinweistext und Eskalationsregel vor dem Start festlegen (Vorschlag: Aufgabe für die Stelle, nicht für uns).
