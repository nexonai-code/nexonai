---
lang: ro
label: ANEXĂ TEHNICĂ
title: unpruuf Compliance
subtitle: Prezentare tehnică și harta datelor pentru responsabilii cu protecția datelor și IT
date: 30.10.2026
version: 1.0
status: Testat, neauditat
conf: Pentru client
---
# 1. Ce este acest document
Această anexă descrie ce stochează unpruuf Compliance, unde stochează și cine poate ajunge la aceste date. Ea prezintă fapte tehnice despre software. Nu este o opinie juridică și nu este o certificare. unpruuf Compliance este testat și funcționează; nu a fost auditat independent și nu este certificat. Dacă aceste fapte acoperă obligațiile organizației tale conform GDPR și Legii 361/2022 confirmă responsabilul cu protecția datelor sau un jurist.

> **Condiție.** Organizația ta operează propriul server pentru canalul de raportare. NexonAI nu operează servere și nu are acces la sistemul tău, la raportări sau la dosarele de caz.

# 2. Componente
| Componentă | Unde rulează | Cine o operează |
| Aplicația de raportare | Telefonul Android al sesizantului (aplicație gratuită) | Sesizantul |
| Raportare din browser | Orice browser, pentru cine nu are aplicația | Sesizantul |
| Serverul tău | Calculatorul, centrul de date sau furnizorul de hosting al organizației | Organizația ta |
| Aplicația responsabilului de caz | Un calculator Windows al responsabilului de caz | Organizația ta |

# 3. Harta datelor
| Loc | Ce se află acolo | Cât timp |
| Serverul tău | Doar pachete criptate. Fără nume, fără adrese IP, fără conținut lizibil. | Cel mult 24 de ore, apoi eliminate |
| Telefonul sesizantului | Mesajele proprii și codul de caz, stocate local | Până când sesizantul le șterge |
| Calculatorul responsabilului | Dosarele de caz, criptate cu parola responsabilului | Până când organizația șterge cazul |
| Licență | Cod de licență offline, fără server de licențe | Niciun contact cu NexonAI |
| NexonAI | Nimic | Nu se aplică |

# 4. Ce nu colectează sistemul
- Fără cont, fără nume, fără număr de telefon, fără adresă de e-mail a sesizantului.
- Fără urmărire, statistici sau rapoarte de erori în aplicații; nimic nu ajunge la NexonAI sau la terți.
- Fără server de licențe: NexonAI nu află când și cât de des este folosit sistemul.
- Un singur cod QR pentru întreaga organizație, niciodată câte un cod pe angajat, astfel încât un cod nu poate fi legat de o persoană.

# 5. Drumul unei raportări
1. Sesizantul scanează codul QR al organizației în aplicație sau deschide raportarea din browser.
2. Raportarea este criptată pe dispozitivul sesizantului înainte să plece de acolo.
3. Ea este depusă pe serverul organizației, care nu o poate citi.
4. Aplicația responsabilului o preia de pe server și o decriptează pe calculatorul responsabilului.
5. Sesizantul primește o confirmare cu un cod de caz aleatoriu (de exemplu HW-7Q4M-2X9D, niciodată un număr consecutiv).
6. Întrebările și răspunsurile continuă în aceeași conversație criptată, legată doar de codul de caz.

# 6. Termene
Aplicația responsabilului urmărește termenele din Directiva (UE) 2019/1937 art. 9: confirmarea primirii în 7 zile și răspunsul în 3 luni. Prezentarea generală ordonează cazurile deschise după următorul termen și le colorează în roșu, galben sau verde.

# 7. Ștergerea și exportul unui caz
- **Ștergerea unui caz.** Responsabilul șterge definitiv un singur caz după ce tastează numărul cazului pentru confirmare. Aplicația păstrează un jurnal de ștergeri doar cu numărul cazului și data și ora ștergerii, fără conținut, pentru ca organizația să poată arăta că și când a șters.
- **Exportul unui caz.** Un caz poate fi exportat ca fișier HTML imprimabil sau ca fișier JSON, de exemplu pentru o autoritate sau pentru evidența proprie. Exportul conține numărul cazului, categoria, datele, termenele, schimbările de stare și întreaga conversație.
- Copiile făcute în afara aplicației (copii de siguranță ale calculatorului, fișiere tipărite sau exportate) intră sub regulile proprii de păstrare ale organizației și trebuie șterse și ele de organizație.

# 8. Limite cunoscute
- **Raportarea din browser.** Versiunea din browser nu folosește Tor. Un sesizant care scrie dintr-un browser obișnuit își arată adresa IP serverului tău. Raportarea din browser spune acest lucru pe primul ecran. Aplicația nu are această limită.
- **Calculatorul responsabilului.** Cine controlează calculatorul deblocat al responsabilului poate citi cazurile. Conținutul cazurilor este criptat; existența cazurilor și datele lor nu sunt.
- **Accesul la panou.** Panoul de cazuri rulează pe calculatorul responsabilului și este gândit să fie deschis doar acolo. Nu trebuie expus în rețea.
- **Parola.** Nu există recuperarea parolei. O parolă pierdută înseamnă că dosarele nu mai pot fi deschise.
- **Disponibilitate.** Aplicația responsabilului trebuie pornită cel puțin o dată pe zi, deoarece pachetele așteaptă pe server cel mult 24 de ore.

# 9. Roluri în sensul GDPR
- Organizația ta este operatorul (GDPR art. 4 pct. 7).
- NexonAI furnizează software-ul și în mod normal nu este persoană împuternicită (GDPR art. 28), deoarece nu are acces la date. Dacă NexonAI primește acces, de exemplu pentru instalare sau suport pe sistemele tale, se încheie mai întâi un acord de prelucrare a datelor. Un model face parte din acest pachet.
- Arhitectura sprijină principiile reducerii la minimum a datelor, limitării stocării și confidențialității (GDPR art. 5, 25, 32). Responsabilul cu protecția datelor sau juristul confirmă încadrarea pentru organizația ta.

Contact: unpruuf@nexonai.ro
