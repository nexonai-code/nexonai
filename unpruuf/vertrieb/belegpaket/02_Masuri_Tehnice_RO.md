---
lang: ro
label: ANEXĂ TEHNICĂ
title: Măsuri tehnice și organizatorice
subtitle: unpruuf Compliance – GDPR art. 32, împărțite între software și organizație
date: 30.10.2026
version: 1.0
status: Model
conf: Pentru client
---
# 1. Cum se folosește lista
Coloana din stânga arată ce face unpruuf Compliance singur. Coloana din dreapta arată ce adaugă organizația ta, pentru că serverul și calculatorul responsabilului îți aparțin. Preia lista în evidența activităților de prelucrare (GDPR art. 30) și completează coloana din dreapta. Lista este descrierea proprie a NexonAI despre software; nu a fost auditată independent.

# 2. Confidențialitate
| Măsură | Asigurată de software | Adăugată de organizație |
| Accesul la raportări | Doar aplicația responsabilului poate decripta raportările. Serverul nu le poate citi. | Numește responsabilii de caz în procedura internă. Folosește un calculator utilizat doar de ei. |
| Identitatea sesizantului | Nu se colectează cont, nume, telefon sau e-mail. Un singur cod QR pentru întreaga organizație. | Publică doar codul QR al organizației. Nu distribui coduri personale. |
| Acces fizic | Nu se aplică | Păstrează serverul și calculatorul responsabilului într-o încăpere încuiată sau într-un centru de date contractat. |
| Acces logic la server | Fiecare cerere către server necesită un token de acces aleatoriu. | Restrânge conturile de administrator, aplică actualizările de securitate. |
| Panoul de cazuri | Rulează pe calculatorul responsabilului și este gândit doar pentru acesta. | Nu deschide portul panoului în rețea. Blochează ecranul la plecare. |

# 3. Pseudonimizare și criptare
| Măsură | Asigurată de software | Adăugată de organizație |
| În tranzit | Criptare de la un capăt la altul între sesizant și responsabil; aplicația se conectează prin Tor. | Recomandă sesizanților aplicația sau Tor Browser în locul unui browser obișnuit. |
| Pe server | Doar pachete criptate, eliminate după cel mult 24 de ore. | Nu este nevoie de altceva. |
| Pe calculatorul responsabilului | Conținutul cazurilor criptat cu parola responsabilului. | Activează criptarea întregului disc (de exemplu BitLocker). Păstrează parola într-un manager de parole. |
| Numerele de caz | Coduri aleatorii, niciodată consecutive. | Nu adăuga nume în titluri sau note decât dacă cazul o cere. |

# 4. Integritate
| Măsură | Asigurată de software | Adăugată de organizație |
| Integritatea mesajelor | Criptare autentificată: pachetele modificate sunt respinse. | Nu se aplică |
| Istoricul cazului | Schimbările de stare și conversația se păstrează cu dată și oră; ștergerile se scriu într-un jurnal de ștergeri. | Stabilește cine poate schimba starea unui caz. |

# 5. Disponibilitate și reziliență
| Măsură | Asigurată de software | Adăugată de organizație |
| Primirea raportărilor | Aplicația de raportare reîncearcă până la 14 zile, până sosește confirmarea. | Pornește aplicația responsabilului cel puțin o dată pe zi. |
| Copii de siguranță | Nu sunt incluse. | Fă copii criptate ale bazei de date a cazurilor și testează restaurarea. |
| Server | Rulează ca serviciu mic; un server de rezervă poate fi pornit oricând. | Păstrează o procedură scrisă pentru repornirea sau înlocuirea serverului. |

# 6. Limitarea stocării și ștergere
| Măsură | Asigurată de software | Adăugată de organizație |
| Server | Pachetele expiră după cel mult 24 de ore. | Nu este nevoie de altceva. |
| Cazuri | Ștergerea definitivă a unui caz după confirmarea numărului; jurnal de ștergeri fără conținut. | Stabilește termenele de păstrare în procedură și șterge la timp, inclusiv în copii de siguranță și exporturi. |
| Export | Exportul unui caz ca HTML sau JSON. | Păstrează exporturile doar acolo unde permite procedura. |

# 7. Testare și evaluare
| Măsură | Asigurată de software | Adăugată de organizație |
| Testarea software-ului | Teste automate ale aplicației responsabilului; stare: testat, neauditat independent. Un test de securitate independent este planificat. | Revizuiește lista anual și după modificări. |
| Incidente | Nu se aplică | Stabilește cum se raportează o suspiciune de încălcare (GDPR art. 33, 34). |

Contact: unpruuf@nexonai.ro
