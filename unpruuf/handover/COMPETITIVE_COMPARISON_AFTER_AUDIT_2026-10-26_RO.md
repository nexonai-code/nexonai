# Comparația cu concurența: poziția noastră după auditul independent

Document de scenariu, 26 octombrie 2026. Reface comparația din aceeași zi pornind de la o singură ipoteză: **auditul independent este încheiat și trecut, iar tot ce spunem este susținut de dovezi pe care le putem preda.** Aceasta nu este situația de azi. Azi avem un audit intern (R1/R2) și un pachet de dovezi, nu avem raport independent și avem trei decizii de design deschise. Pagina arată ce am avea voie să spunem, și față de cine, odată ce premisa este adevărată, și ce dovadă îi trebuie fiecărei afirmații, ca nimeni să nu o spună cu o zi înainte să existe dovada. Starea reală de azi este în `COMPETITIVE_COMPARISON_2026-10-26.md`. Faptele despre concurenți poartă aceleași etichete ca acolo: **[verificat]** prin căutare web pe 26 octombrie (surse de calitate mică spre medie), **[general]** cunoștințe generale, nereverificate, **[necunoscut]**.

## 1. Premisa, exact

Scenariul este valabil doar dacă toate acestea sunt adevărate; pagina nu se folosește înainte:

1. **Audit independent, runda unu, încheiat** pe un tag înghețat: serverul de noduri și aplicația Business (pro, apoi group), lanțul de build și release, integrarea Tor și bridge, intrările din exterior, revizuirea criptografiei de către un specialist. Raportul numește amprenta release-ului revizuit.
2. **Rezultat:** niciun Critical și niciun High deschis; fiecare Medium reparat și retestat sau acceptat cu motiv scris și dată de expirare; declarația de acoperire a auditorului confirmă afirmațiile noastre una câte una (confirmat, neconfirmat, netestat).
3. **Avem voie să citam:** rezumatul scurt convenit și declarația de acoperire, cuvânt cu cuvânt. Nu există certificat și nu pretindem unul.
4. **Cele trei puncte deschise sunt închise:** F1 (lungimea în interiorul părții criptate, umplere aleatorie, semnale de control în ratchet), M5 (cheia de scriere comună spusă onest și limitată ca ritm), M8 (manifestul release acoperă `node_modules`, modulul nativ și `tor-bin`; exe-ul este semnat).
5. **Testat, nu doar citit:** două telefoane (unul cu root), un server pe VPS cu rețeaua Tor reală, o captură de 24 de ore, scripturile Windows și exe-ul; există protocoale.
6. **Limita de domeniu care rămâne:** Control, aplicația Officer, Press, părțile Compliance și iOS **nu** au fost în runda unu. Tot ce urmează despre ele este scris „încă neacoperit”.

## 2. Ce am putea spune atunci și dovada din spatele fiecărei propoziții

Regula: o propoziție intră în materialul pentru clienți doar cu dovada la îndemână. Numerele trimit la `evidence/CLAIMS_TO_EVIDENCE.md`.

| Ce spunem | Dovada pe care o predăm | Acoperă | Nu acoperă |
|---|---|---|---|
| „Serverul nu află nume, nu află adresele expeditorilor și nu are cheia proprietarului.” (A5, A6) | declarația de acoperire a auditului; evidence 02 (analiza stocării: un tabel, cinci coloane, nicio adresă sau user agent găsită); scanarea codului 03 (niciun cod nu citește adresa apelantului) | serverul de noduri la amprenta auditată | un server modificat de cineva (rândul următor) |
| „Serverul pe care îl rulezi este cel lansat de noi.” (A11, A12) | amprenta din raportul de audit; manifest de release semnat pe fișierele programului, biblioteci, modulul nativ și Tor; `verify-release`; semnătura exe-ului | release-uri din tagul auditat | alte taguri, până la o nouă revizuire |
| „Un pachet dispare pentru toți după cel mult 24 de ore și este suprascris în cca. un minut.” (A4, A7, A16) | test dinamic al auditului; evidence 02 înainte/după expirare; captura de 24 de ore | serverul de noduri, toate setările documentate | o copie făcută de cineva cât timp pachetul era încă lizibil |
| „Serverul nu face nicio conexiune ieșită în afară de descărcarea unică a Tor; fără telemetrie.” (A8) | evidence 03; captura de rețea a auditului | serverul de noduri | mașina clientului și găzduirea lui |
| „Scrie doar proprietarul; cheia de scriere comună este o limită cunoscută.” (A2, formularea M5) | declarația auditului; testele aplicației și serverului; limita scrisă în propriile noastre brief-uri | serverul de noduri | revocarea per persoană (o etapă ulterioară) |
| „Lungimea mesajului nu poate fi citită dintr-un pachet stocat.” (F1 închis) | revizuirea criptografiei de audit; vectori cu răspuns cunoscut; evidence 08 cu 0 constatări | formatul de transport versiunea 2 | analiza de trafic dincolo de pachet |
| „Mesajele sunt criptate cap-coadă cu Double Ratchet și un al doilea strat exterior.” | revizuirea criptografiei; vectori; teste unitare (Android 247, officer 32, node 139) | aplicația Android Business, serverul de noduri | iOS, până trece aceiași vectori |
| „Tot traficul trece prin Tor; o excepție documentată în același Wi-Fi.” | evidence 04; test dinamic al auditului; circuite observate per contact | aplicația Business | rețeaua utilizatorului, Tor însuși |
| „Un telefon pierdut dă puțin: PIN cu blocare, ștergere de panică, cheia bazei de date sigilată, fără capturi de ecran, fără backup.” | protocoale de test pe dispozitiv (H1, M9, M10, clipboard, blocare); testele pe dispozitiv ale auditului | aplicația Android Business pe modelele testate | un telefon cu root sau examinat criminalistic dincolo de ce s-a testat |
| „Fără analitică, fără servicii Google, fără biblioteci de reclame.” | evidence 04 și 09; lista dependențelor; OSV și npm audit curate la tag | tot codul de la tag | modificări ulterioare |
| „Dependențele noastre nu aveau vulnerabilități cunoscute la lansare.” (A13) | evidence 09 și scanarea OSV din ziua lansării | tagul | după ziua lansării |

Ce **nu** spunem nici atunci: „imposibil de spart”, „certificat”, „conform GDPR”, „100 % sigur”, „primul”, „singurul”, „mai sigur decât X” și nimic despre Compliance, Press, Control, aplicația Officer sau iOS ce nu este în raport.

## 3. Mesagerie: unde stăm atunci

Coloanele concurenților sunt neschimbate față de comparația zilei; se schimbă doar coloana noastră și rândul de audit.

| | **unpruuf Business, după audit** | **SimpleX** | **Session** | **Briar** | **Threema OnPrem** | **Wire** | **Matrix / Element** |
|---|---|---|---|---|---|---|---|
| Audit independent | **da: runda unu pe versiunea X, rezumat și declarație de acoperire disponibile** | Trail of Bits 2022 și 2024 [verificat] | Quarkslab 2021; o lucrare academică din 2026 raportează șapte vulnerabilități, stadiul remedierii necunoscut [verificat] | Cure53 2017, audituri ulterioare raportate, sursele diferă [verificat] | revizuiri publicate, nereverificate [general] | audituri din 2018 documentate, nimic mai nou găsit [verificat] | nereverificat [general] |
| Server | al clientului, mereu | al oricui [verificat] | rețea de noduri operată de alții [verificat] | niciunul [verificat] | al clientului [general] | al Wire sau on-premise [verificat] | orice operator [general] |
| Identificator | niciunul | niciunul, după spusa lor [verificat] | ID aleator [verificat] | niciunul [verificat] | ID aleator [general] | e-mail sau telefon [general] | cont [general] |
| Anonimitate în rețea | servicii onion Tor | Tor opțional [general] | rutare onion proprie [verificat] | Tor, Bluetooth, Wi-Fi [verificat] | niciuna [general] | niciuna [general] | niciuna [general] |
| Administrare pentru firme | Control, licențe, liste, feed, deblocare | niciuna [general] | niciuna [general] | niciuna [general] | da [general] | da [general] | prin software-ul serverului [general] |
| Apeluri, desktop, multi-dispozitiv | **nu** | da [general] | da [general] | parțial [general] | da [general] | da [general] | da [general] |

Ce schimbă auditul: ne mută de la **„prima obiecție”** la **„paritate la cerința de intrare”**. SimpleX, Briar, Wire și Session pot arăta și ele rapoarte; un raport nu ne face mai buni decât ei, ne face comparabili. Ce rămâne al nostru este combinația: server mereu la client, fără identități, Tor de la început, o administrare finalizată și trei produse pe același sistem. Spunem asta, arătăm raportul și ne oprim.

Ce **nu** schimbă auditul: fără apeluri, fără client desktop, fără multi-dispozitiv, grupuri de zece, aplicația Business doar în engleză, un singur dezvoltator și viteza Tor, dacă testele pe dispozitiv nu au produs cifre oneste pe care să le putem arăta.

## 4. Canale de raportare: poziția atunci

| | **unpruuf Compliance / Press** | **SecureDrop** | **GlobaLeaks** | **EQS Integrity Line** |
|---|---|---|---|---|
| Stadiul auditului | **protocolul și serverul de noduri sunt acoperite de raportul rundei unu; aplicația Compliance, aplicația Officer și Press nu sunt** | audituri publicate, nereverificate [general] | audituri raportate, nereverificate [general] | certificări pretinse, nereverificate [general] |
| Referințe | doar pilot | multe [general] | multe [general] | multe [general] |
| Unde sunt datele | serverul propriu al organizației | al redacției [general] | propriu sau găzduit [general] | la furnizor, în UE [general] |

Linia onestă pentru canalele de raportare, chiar și după audit: „transportul, serverul și protocolul comun au fost revizuite independent; aplicațiile Compliance și Press sunt obiectul rundei următoare.” Dacă Gabriel decide să pună aplicația Compliance și aplicația Officer în runda unu (domeniul este decizia lui), această secțiune devine „acoperit”, iar oferta către prima primărie sau firmă devine mult mai puternică. Aceasta este singura decizie de domeniu care schimbă cel mai mult comparația.

## 5. Discuția

Cu auditul în mână, mutarea de deschidere se schimbă din apărare în invitația de a verifica. O întrebare, apoi raportul.

| Dacă numesc | Punctul lor forte | Ce întrebăm sau arătăm | Ce evităm |
|---|---|---|---|
| **SimpleX** | gratuit, auditat de două ori, fără identificatori | „Cine administrează licențele, actualizările și listele pentru 300 de oameni? Iată raportul și amprenta noastră.” | să-l numim mai slab |
| **Session** | ușor de început | „Cine operează nodurile prin care trec mesajele voastre?” și nimic despre lucrarea lor din 2026 până nu se știe stadiul remedierii | să repetăm lucrarea ca fapt |
| **Briar / Cwtch** | niciun server, offline | „Aveți nevoie de o consolă de administrare și de un canal de raportare pe același sistem?” | să pretindem că ascundem mai mult |
| **Threema OnPrem / Wire** | maturitate, suport, apeluri, desktop | „Aveți nevoie de un cont sau de o legătură cu un furnizor? Ce află serverul despre cine vorbește cu cine?” Arătăm declarația de acoperire | discuții de preț înainte să existe lista noastră de prețuri |
| **Matrix / Element** | federație, multe funcții | „Vreți ca oamenii să se găsească între ei sau doar cei invitați personal?” | să numim federația o slăbiciune |
| **SecureDrop / GlobaLeaks** | dovedite, gratuite | „Aveți nevoie și de un canal intern și cine rulează serverul și actualizările?” | să pretindem că le înlocuim |
| **EQS și similari** | suită completă, contract, certificat | „Unde stau rapoartele și poate furnizorul să le citească? Iată cine le poate citi pe ale noastre și dovada.” | să promitem conformitate juridică (decide juristul) |

Pachetul de dovezi pentru fiecare discuție serioasă: rezumatul de audit convenit și declarația de acoperire; amprenta release-ului și modul de verificare (`verify-release`); tabelul afirmațiilor cu coloana de dovezi (secțiunea 2); raportul de dovezi; protocoalele de test; limitele scrise (M5, domeniul auditului). Ce nu este în acest pachet nu se spune.

## 6. Scara formulărilor

| Nivel | Propoziție | Necesită |
|---|---|---|
| Permis acum, înainte de orice audit | „produse finalizate pentru conformitate, presă și firme pe același sistem; server mereu la client; fără identități; Tor de la început; fază pilot, neauditat independent” | nimic nou |
| Permis după runda unu | „revizuit independent, versiunea X, rezumat disponibil la cerere” | contractul semnat care ne permite citarea, raportul final, tagul |
| Permis după o a doua rundă | la fel pentru Control, aplicația Officer, Compliance și Press, fiecare numit | raportul acelei runde |
| Niciodată | certificat, imposibil de spart, conform GDPR, 100 % sigur, primul, singurul, mai sigur decât, „auditat” fără versiune și domeniu | nicio dovadă nu le poate face adevărate |

## 7. Ce trebuie să fie adevărat înainte să se folosească această pagină

1. Deciziile despre F1, M5 și M8 sunt luate și implementate (`AUDIT_PLAN_2026-10-26.md`, fazele 0 și 1). Deciziile de produs sunt ale lui Gabriel; recomandarea pentru F1 este A+.
2. Testele pe dispozitiv și cu Tor real există ca protocoale, cu cifre oneste pentru baterie și timp de livrare.
3. Contractul ne permite să citam rezumatul și declarația de acoperire.
4. Raportul final este în mână, remedierile sunt retestate, iar tagul din raport este tagul pe care îl livrăm.
5. Celulele concurenților marcate [general] sau [necunoscut] au fost verificate pe paginile furnizorilor (prețul și auditul Threema OnPrem, prețul Wire on-premise, starea Cwtch, stadiul remedierii la Session, prețul și certificarea EQS).
6. Pagina se rescrie apoi cu formulările raportului real, nu cu cele ale acestui scenariu.

---

Scenariu redactat înainte să existe auditul. Faptele despre concurenți conform etichetelor; sursele ca în comparația din aceeași zi.
