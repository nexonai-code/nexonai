# Cerere de ofertă: audit independent de securitate al sistemului unpruuf

NexonAI Consulting SRL, Alba Iulia, România · 28 octombrie 2026 · Contact: Gabriel Hategan, gabriel@nexonai.ro

Solicităm unui număr mic de firme de securitate o ofertă pentru un audit independent de securitate al sistemului unpruuf, un sistem de comunicare fără identități de utilizator, în care fiecare server este operat de client. Documentul arată ce dorim să fie auditat, ce vă livrăm, ce așteptăm de la dumneavoastră și cum alegem. Nu conține detalii de protocol: codul sursă, lista afirmațiilor, lista limitelor pe care le cunoaștem deja și constatările noastre din pre-audit se transmit firmei selectate, pe baza unui acord de confidențialitate pe care îl trimitem la cerere.

| | |
|---|---|
| **Ce** | Audit independent de securitate, runda unu: serverul de noduri și aplicația Business, cu opțiuni |
| **Cine solicită** | NexonAI Consulting SRL, o companie mică; persoana de contact tehnic este dezvoltatorul |
| **Starea sistemului** | Fază pilot; **neauditat independent până acum**; niciun client în producție |
| **Ce solicităm de la dumneavoastră** | O ofertă (preț pe element de perimetru, persoane-zile pe persoană), echipa, referințe și răspunsurile la secțiunea 7 |
| **Termen** | 14 zile calendaristice de la primirea documentului; întrebările sunt binevenite până în ziua 7 |
| **Limba** | Oferta în română sau engleză; raportul în română și engleză (secțiunea 5) |
| **Începutul** | La predarea unei versiuni înghețate, estimată pentru decembrie 2026; data se fixează în contract |

## 1. Despre unpruuf

unpruuf permite companiilor și instituțiilor publice să comunice și să primească sesizări fără conturi de utilizator, numere de telefon sau adrese de e-mail. Clientul își rulează propriul server (un calculator, un server închiriat, un container sau un program Windows); NexonAI nu operează servere și nu are acces la sistemele clienților. Mesajele circulă criptate cap-coadă prin servicii onion Tor și așteaptă pe serverul clientului cel mult 24 de ore. Trei produse folosesc același sistem: **unpruuf Business** (comunicare internă, produsul principal), **unpruuf Compliance** (canal de sesizări) și **unpruuf Press** (canal pentru redacții, pilot). Aplicațiile sunt astăzi pentru Android; o versiune iOS este în lucru și nu face parte din această cerere.

Componente livrate: aplicațiile Android (edițiile standard, pro, group, client, whistleblower, press); serverul de noduri (Node.js și TypeScript, SQLite, Tor integrat, imagine Docker, scripturi Windows și Linux, un program Windows dintr-un singur fișier); un instrument de administrare pentru client (unpruuf Control); aplicația și panoul responsabilului de caz pentru canalul de sesizări; o variantă de rezervă în browser pentru raportori; un instrument de licențe și un proces de lansare semnat.

## 2. Ce vrem să putem spune după audit

1. Serverul de noduri poate face exact ce spune documentația lui și nimic mai mult, în orice setare documentată.
2. Sistemul nu păstrează identități: nici pe server, nici în materialul de asociere, nici într-un pachet stocat.
3. Criptarea și gestionarea cheilor sunt solide, așa cum au fost concepute.
4. Programul rulat de un client este programul care a fost revizuit; raportul dumneavoastră numește amprenta a ceea ce ați revizuit.

Nu așteptăm un certificat. Așteptăm un raport cu constatări și dovezi, o declarație despre ce a fost și ce nu a fost acoperit și dreptul de a cita un rezumat convenit.

## 3. Perimetru

### Perimetrul de bază (Lot A): vă rugăm să ofertați la un singur preț

- **Serverul de noduri** (revizuire de cod și teste de tip cutie neagră): toate rutele, middleware-ul și setările; stocarea și ștergerea datelor expirate; regula „scrie doar proprietarul” și permisiunile pentru invitați; limitele cererilor; schema cheilor sigilate și ruta de deblocare; pagina locală de configurare; integrarea Tor (serviciul onion, apărarea prin proof-of-work, bridge-uri); fluxul de liste al companiei; imaginea Docker, scripturile Windows și Linux și programul Windows dintr-un singur fișier; ce face procesul în rețea (o zi de captură de trafic pe un server controlat de dumneavoastră).
- **Aplicația Android Business** (edițiile pro, apoi group; celelalte ediții folosesc același cod): revizuire statică și analiză dinamică pe cel puțin două telefoane, unul cu acces root; stocare și memorie după utilizare; trafic doar prin Tor; manifest, permisiuni, componente exportate; PIN, blocare după încercări, ștergere de panică, protecția capturilor de ecran, clipboard, notificări; intrări din exterior (coduri scanate, liste importate, imagini, fișiere); comportamentul la pierderea telefonului.
- **Criptografie și protocol:** revizuire, de către un specialist numit, a conceptului de criptare cap-coadă (un concept bazat pe ratchet, cu un strat exterior de transport), a începutului sesiunii, a derivării și stocării cheilor, a utilizării numerelor aleatoare și a modului în care pachetele sunt adresate pentru preluare. Modelarea formală este binevenită dacă aduce valoare; spuneți ce ați modela.
- **Rețea și metadate:** ce poate afla un observator pasiv de rețea și un operator de server din dimensiunile pachetelor, ritm și adrese; evaluarea limitelor pe care le declarăm.
- **Lanțul de build și lansare:** inventarul dependențelor (SBOM) și vulnerabilitățile cunoscute; manifestul de lansare semnat și modul în care clientul verifică o lansare; cum se obține și se verifică Tor; reproductibilitatea build-ului livrat.

### Opțiuni: vă rugăm să ofertați separat fiecare

| Lot | Conținut |
|---|---|
| B | unpruuf Compliance: ediția whistleblower a aplicației, aplicația și panoul responsabilului de caz (baza locală criptată de cazuri, gestionarea parolei, accesul la panoul local), varianta în browser pentru raportori |
| C | unpruuf Control: seiful de chei, gestionarea SSH, pagina web locală, instalarea la distanță pe care o execută |
| D | Ediția gratuită pentru invitați (client) și permisiunile de invitat de pe server |
| E | unpruuf Press (pilot): codurile pe fiecare cercetare |
| F | Nodul Android (relay-android) |

### În afara perimetrului

iOS; relay-ul vechi pentru consumatori; Tor în sine și sistemele de operare; furnizorul de găzduire al clientului; un telefon compromis; un observator pasiv global (îl declarăm ca limită); evaluarea juridică (legislația privind protecția datelor și Directiva (UE) 2019/1937 țin de un jurist).

## 4. Afirmații de testat

Firmei selectate îi vom da o listă numerotată de afirmații (aproximativ treizeci), fiecare cu ipotezele ei și cu dovezile pe care le avem deja. Pe categorii: serverul nu stochează adresa expeditorului, user agent sau identitate; datele stocate devin ilizibile și sunt șterse după durata de viață de cel mult 24 de ore; scrie doar proprietarul (și deținătorii unei permisiuni valide de invitat); serverul nu face nicio conexiune ieșită în afara descărcării unice a Tor și nu are telemetrie; programul rulat de un client este cel lansat; conceptul de criptare este solid; tot traficul aplicațiilor trece prin Tor, cu excepția unei scurtături documentate în aceeași rețea; mesajele nu se scriu în stocarea telefonului; aplicația nu conține biblioteci de analiză, publicitate sau Google; protecțiile unui telefon pierdut funcționează așa cum sunt descrise. Formatul unui pachet stocat se poate mai schimba înaintea înghețării (secțiunea 9); opinia dumneavoastră se referă la versiunea înghețată.

Pentru fiecare afirmație așteptăm una dintre trei opinii motivate: **confirmată, confirmată cu rezerve, neconfirmată**, iar acolo unde nu ați testat, **netestată**.

## 5. Ce așteptăm să livrați

1. Un raport scris cu toate constatările: titlu, gravitate pe o scară numită, descriere, pași de reproducere, impact, recomandare. Gravitatea o stabiliți dumneavoastră; noi putem corecta fapte, niciodată gravități.
2. O **declarație de acoperire**: pentru fiecare afirmație, opinia dumneavoastră; ce nu ați verificat și de ce (perimetru, timp, acces).
3. **Amprenta** (identificatorul de commit și hash-urile fișierelor) versiunii revizuite, modelul de amenințare convenit, instrumentele și versiunile lor.
4. Un **proiect de raport** cu cel puțin cinci zile lucrătoare înaintea raportului final, pentru corectarea faptelor de către noi.
5. **Notificare intermediară** pentru orice constatare critică sau ridicată, în cel mult o zi lucrătoare de la confirmare.
6. O **reverificare** inclusă în preț, pentru toate constatările critice și ridicate și pentru cele medii pe care alegem să le remediem, pe o versiune corectată, în cel mult zece zile lucrătoare de la primirea ei, cel târziu la 60 de zile după raportul final.
7. Un **rezumat executiv** de o pagină, fără jargon, și un **rezumat public scurt, redactat de dumneavoastră**, pe care îl putem arăta clienților. Solicităm dreptul de a cita rezumatul public și declarația de acoperire cuvânt cu cuvânt, cu o formulare convenită; nu vom numi sistemul „certificat” și nu vom folosi cuvântul „auditat” fără versiune și perimetru.
8. Rapoarte în **engleză și română** (prețuiți separat a doua limbă dacă e în plus), ca PDF semnat și într-un format editabil.

## 6. Ce predăm noi și ce aduceți dumneavoastră

Predăm, după acordul de confidențialitate: codul sursă și istoricul lui la un tag înghețat, lista afirmațiilor, limitele declarate, constatările noastre din pre-audit și scripturile de dovezi, documentația și build-urile livrate, inclusiv build-uri de test care rulează pe telefoane cu root pentru analiza dumneavoastră (aplicația de lansare refuză să ruleze pe dispozitive cu root). O persoană tehnică numită răspunde la întrebări în cel mult două zile lucrătoare.

Dumneavoastră aduceți: propriile telefoane de test (cel puțin unul cu root) și un server controlat de dumneavoastră pentru captura de trafic; propriile instrumente. Testele active rulează doar pe instanțele de test puse la dispoziție de noi sau create de dumneavoastră, niciodată pe infrastructura unui client.

Confidențialitate: codul sursă și constatările rămân confidențiale până la remediere; protocolul este în evaluare pentru brevet, deci acordul va conține o clauză în acest sens; solicităm stocare criptată și confirmare scrisă a ștergerii la final.

## 7. Ce vă rugăm să ne comunicați (răspundeți la fiecare punct)

**Firma și echipa**
1. Entitatea juridică, numărul de înregistrare, adresa, anii de activitate. Dacă ofertați ca asociere, care firmă este contractantul și care firmă răspunde de ce parte.
2. Numele, rolurile, calificările și certificările fiecărei persoane care ar lucra la acest proiect și ponderea ei în zile. Vă rugăm să atașați CV-uri scurte.
3. Cine execută revizuirea criptografică și ce revizuiri comparabile (mesagerie, protocoale cap-coadă, sisteme de anonimat) a făcut această persoană? Dacă subcontractați, numiți subcontractorul.
4. Experiența cu inginerie inversă și analiză dinamică Android, cu servicii onion Tor sau rețele de anonimat comparabile și cu servere Node.js.
5. Două referințe din proiecte comparabile și un **raport-exemplu**, anonimizat sau public.
6. Asigurarea de răspundere profesională (suma acoperită) și certificările de calitate sau de securitate ale firmei.

**Atestare și independență**
7. Sunteți atestați ca auditori de securitate cibernetică de Directoratul Național de Securitate Cibernetică (DNSC)? Ce entitate juridică sau persoană deține atestarea, de ce tip, cu ce număr și perioadă și ce acoperă exact (audituri ale rețelelor și sistemelor informatice ale unei organizații sau și revizuire de cod și teste de penetrare ale produselor software)? Vă rugăm să atașați o copie. Apreciem atestarea, deoarece instituțiile publice și entitățile NIS2 din România o solicită, dar ea nu înlocuiește referințele de la punctele 3–5. Nu vom descrie niciodată rezultatul ca fiind confirmat sau aprobat de DNSC.
8. O declarație scrisă de independență care numește și orice legătură a firmei și a experților cu NexonAI, cu echipa ei și cu instituții care sunt sau pot deveni clienți ai ei (de exemplu instituții publice, universități și companii din Alba Iulia), inclusiv activitate didactică sau angajare.

**Metodă și plan**
9. Abordarea dumneavoastră pentru fiecare element al perimetrului de bază, în cel mult două pagini; standardele folosite (de exemplu OWASP MASVS și ASVS); ce ați modela formal, dacă este cazul.
10. Planul în săptămâni, **persoane-zile pe persoană și pe pas** și disponibilitatea în perioada decembrie 2026 – februarie 2027. Precizați dacă lucrul este cu normă întreagă sau parțială pentru fiecare persoană.
11. Ce vă mai trebuie de la noi, în afara celor din secțiunea 6.

## 8. Cum ofertați

- Un **preț pentru perimetrul de bază (Lot A)** și un preț pentru fiecare dintre loturile B–F, fiecare ca preț fix sau preț plafonat pe timp și materiale, în euro fără TVA, cu persoane-zile și tarif zilnic pe persoană.
- Prețul reverificării așa cum e descrisă, prețul unei runde suplimentare, prețul celei de-a doua limbi a raportului și al rezumatului public, deplasări dacă există, condiții de plată și valabilitatea ofertei (cel puțin 60 de zile).
- Orice excludeți sau presupuneți.

## 9. Calendar și selecție

| Pas | Când |
|---|---|
| Întrebări către noi | până în ziua 7 de la primirea documentului |
| Termen pentru oferte | ziua 14 |
| Interviuri cu firmele selectate (online, o oră) | în două săptămâni de la termen |
| Acordul de confidențialitate și predarea brief-urilor | înainte de interviul cu firmele selectate |
| Decizie și contract | în două săptămâni de la interviuri |
| Predarea versiunii înghețate | estimat decembrie 2026; data fermă în contract |
| Audit, proiect de raport, raport final, reverificare | conform planului dumneavoastră; estimăm în total opt–zece săptămâni |

Luăm decizii de proiectare asupra formatului pachetelor stocate înainte de înghețare. Veți primi versiunea înghețată, iar auditul se aplică ei; modificarea nu va avea loc în timpul auditului.

**Cum alegem** (ponderile sunt ale noastre și pot fi ajustate din motive întemeiate): competență și referințe 35 %; potrivirea metodei cu perimetrul 25 %; livrabile și condiții din secțiunea 5 15 %; preț 15 %; calendar și disponibilitate 10 %. Atestarea DNSC contează ca un plus în cadrul competenței, niciodată ca înlocuitor al referințelor. Putem pune întrebări de clarificare și comparăm oferte de la mai multe firme. Nu avem obligația de a plasa o comandă.

## 10. Onestitate privind rezultatul

Vom publica doar ce susține raportul dumneavoastră, cu perimetrul și versiunea lui. Niciun sistem nu este „complet sigur” și nu vom pretinde asta. Un raport care găsește probleme și o spune deschis are pentru noi mai multă valoare decât unul favorabil.

---

NexonAI Consulting SRL, Alba Iulia · fază pilot, neauditat independent · gabriel@nexonai.ro
