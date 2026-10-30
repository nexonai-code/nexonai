---
lang: ro
label: MODEL
title: Evaluarea impactului asupra protecției datelor
subtitle: Model precompletat pentru un canal intern de raportare cu unpruuf Compliance (GDPR art. 35)
date: 30.10.2026
version: 1.0
status: Model
conf: Intern
---
# 1. Despre acest model
Un canal intern de raportare prelucrează informații despre posibile încălcări și despre persoanele implicate. Multe autorități de supraveghere consideră că astfel de canale necesită probabil o evaluare a impactului asupra protecției datelor. Părțile care descriu unpruuf Compliance sunt precompletate. Câmpurile marcate cu [ ] se completează de organizație împreună cu responsabilul cu protecția datelor. Acest model nu este consultanță juridică.

# 2. Descrierea prelucrării
| Element | Conținut |
| Operator | [ ] Denumirea organizației, adresa |
| Responsabil cu protecția datelor | [ ] Contact |
| Scop | Primirea, tratarea și urmărirea raportărilor conform Directivei (UE) 2019/1937 și Legii 361/2022 |
| Temei juridic | Obligație legală, GDPR art. 6 alin. (1) lit. c) împreună cu Legea 361/2022; pentru categorii speciale dintr-o raportare: GDPR art. 9 alin. (2) lit. g) sau b) [ ] de confirmat |
| Persoane vizate | Sesizanți, persoane vizate de raportare, martori, responsabili de caz |
| Categorii de date | Conținutul raportărilor și răspunsurilor, atașamente, codul de caz, date calendaristice, starea cazului. Software-ul nu colectează numele, contul, telefonul sau e-mailul sesizantului. |
| Destinatari | Responsabilii de caz desemnați; autorități, unde legea o cere |
| Sisteme | Aplicația de raportare sau raportarea din browser, serverul propriu al organizației, aplicația responsabilului pe un calculator Windows (vezi Prezentarea tehnică) |
| Păstrare | Raportările se păstrează 5 ani în registru (Legea 361/2022 art. 7) [ ] de confirmat cu textul consolidat și procedura internă |
| Transferuri în afara UE | Niciunul prin software. [ ] Confirmă locația serverului. |

# 3. Necesitate și proporționalitate
- Se prelucrează doar conținutul pe care sesizantul alege să îl trimită; nu sunt necesare date de cont sau de contact.
- Serverul păstrează pachete criptate cel mult 24 de ore; dosarele există doar pe calculatorul responsabilului.
- Cazurile pot fi șterse individual la sfârșitul termenului de păstrare; un jurnal de ștergeri fără conținut documentează acest lucru.
- [ ] Descrie cum sunt informați sesizanții și angajații (afiș, intranet, procedură).

# 4. Riscuri pentru drepturile și libertățile persoanelor vizate
| Risc | Probabilitate | Gravitate | Măsuri | Risc rezidual |
| Identificarea sesizantului din metadate | [ ] | [ ] | Nu se colectează identificatori; un singur cod QR al organizației; aplicația folosește Tor; raportarea din browser avertizează că arată adresa IP | [ ] |
| Acces neautorizat la dosare | [ ] | [ ] | Criptare cu parola responsabilului; calculator dedicat; criptarea discului; blocarea ecranului | [ ] |
| Pierderea raportărilor | [ ] | [ ] | Aplicația reîncearcă 14 zile; aplicația responsabilului rulează zilnic; copii de siguranță criptate | [ ] |
| Păstrarea datelor prea mult timp | [ ] | [ ] | Termene de păstrare în procedură; ștergerea unui caz cu jurnal de ștergeri | [ ] |
| Dezvăluirea persoanei vizate | [ ] | [ ] | Acces limitat la responsabilii de caz; export doar când este necesar | [ ] |
| Pierderea parolei responsabilului | [ ] | [ ] | Manager de parole; predare documentată între responsabili | [ ] |

# 5. Măsuri
Vezi lista măsurilor tehnice și organizatorice din acest pachet. [ ] Adaugă măsurile specifice organizației.

# 6. Aviz și decizie
| Element | Conținut |
| Avizul responsabilului cu protecția datelor | [ ] |
| Opinia reprezentanților angajaților, unde a fost cerută | [ ] |
| Decizia operatorului | [ ] Prelucrare aprobată / aprobată cu condiții / neaprobată |
| Data și semnătura | [ ] |
| Următoarea revizuire | [ ] |
