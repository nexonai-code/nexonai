# Răspuns la propunerea tehnică DOCISIA – VĂZDUH

**Către:** Asocierea DOCISIA S.R.L. (lider) – VĂZDUH S.R.L., în atenția domnului Domșa Ovidiu și a domnului Rusan Nicolae Alexandru

**De la:** NexonAI Consulting SRL, Alba Iulia, Gabriel Hategan, unpruuf@nexonai.ro

**Data:** 28 octombrie 2026

**Subiect:** Propunerea tehnică „Audit independent de securitate al sistemului unpruuf” din 27.10.2026: clarificări și modificări solicitate

Stimați domni,

Vă mulțumim pentru propunerea tehnică din 27.10.2026. Am citit-o cu atenție. Ne convin mai multe lucruri: opinia motivată pe fiecare afirmație în trei trepte, rezumatul public redactat de auditor, folosirea cuvântului „auditat” doar pentru perimetrul și versiunea acoperite, precizarea că raportul nu este o certificare, independența față de instrucțiunile noastre și referințele metodologice alese (OWASP MASVS și ASVS, RFC-urile și standardele NIST).

În forma actuală nu putem semna propunerea. Vă rugăm să ne răspundeți la punctele de mai jos și să ne trimiteți o propunere tehnică revizuită și oferta comercială, care nu era atașată. Evaluăm în paralel și alte oferte, pe baza aceleiași cereri, pe care v-o atașăm (Cerere de ofertă, 28.10.2026).

## 1. Perimetrul

Perimetrul din secțiunea 2.1 a propunerii nu corespunde cu ce dorim în runda unu.

- **Serverul de noduri (node-mesh-server) trebuie să fie în perimetru.** Este serverul produsului nostru principal, unpruuf Business, și propunerea îl scoate din perimetru. Relay-ul vechi pentru consumatori (cel descris în propunere ca „Serverul (relay)”) nu face parte din runda unu.
- **Aplicația Android:** runda unu se referă la aplicația Business (edițiile pro, apoi group; celelalte ediții folosesc același cod). Edițiile whistleblower și press, aplicația și panoul responsabilului de caz, varianta în browser, unpruuf Control, ediția client (invitați) și nodul Android sunt **opțiuni cu preț separat**, nu parte din prețul de bază.
- iOS rămâne în afara perimetrului, așa cum a propus și dumneavoastră.

Perimetrul exact, cu loturile A–F, este în cererea atașată (secțiunea 3). Vă rugăm să ofertați fiecare lot separat.

## 2. Afirmațiile de verificat

- Formularea unora dintre afirmațiile AF1–AF6 trebuie precizată. AF1 privește ce se vede în rețea, nu ce poate citi un operator dintr-un pachet stocat. AF4 nu se aplică identic tuturor edițiilor (cazurile din ediția whistleblower și din panou sunt stocate local, criptat). Vă vom trimite lista actualizată de afirmații, împreună cu limitele pe care le cunoaștem deja și cu constatările noastre din pre-audit, după semnarea acordului de confidențialitate.
- Auditul trebuie să se facă pe o **versiune înghețată**. Avem o decizie de proiectare deschisă privind formatul pachetelor stocate; vom preda versiunea înghețată înainte de începerea lucrărilor, estimat în decembrie 2026, cu data fermă în contract. Nu începeți lucrările pe un cod în mișcare.

## 3. Echipa și competențele

Propunerea promite modelare formală (ProVerif/Tamarin), analiză dinamică cu Frida pe dispozitive cu root, teste statistice ale generatorului de numere aleatoare și analiză de metadate pe Tor, dar nu spune cine execută fiecare dintre ele și cu ce experiență. Vă rugăm să ne comunicați:

1. CV-uri și calificările fiecărei persoane, cu ponderea ei în zile.
2. **Cine execută revizuirea criptografică** a implementării Double Ratchet și a restului stratului criptografic, și ce revizuiri comparabile (mesagerie, protocoale cap-coadă, sisteme de anonimat) a făcut. Dacă nu aveți o astfel de persoană în echipă, vă rugăm să numiți un specialist subcontractat.
3. Experiența cu inginerie inversă Android, cu servicii onion Tor și cu servere Node.js.
4. Două referințe din proiecte comparabile și un raport-exemplu, anonimizat sau public.
5. Asigurarea de răspundere profesională.
6. Faptul că DOCISIA S.R.L. a fost înființată în 2026: dacă are lucrări anterioare, vă rugăm să le menționați; dacă nu, spuneți ce parte revine VĂZDUH S.R.L.

## 4. Efortul și calendarul

Opt săptămâni, inclusiv reverificarea, pentru doi experți și acest perimetru, ne par puține, mai ales dacă adăugați modelarea formală. Vă rugăm să ne dați **persoane-zile pe persoană și pe pas** și să precizați dacă lucrul este cu normă întreagă sau parțială. Vom reexamina calendarul după clarificarea perimetrului.

## 5. Atestarea DNSC

Am reținut că VĂZDUH S.R.L. și domnul Rusan sunt atestați DNSC (seria CLE nr. 26031, respectiv seria CIE nr. 26025). Vă rugăm:

1. Să ne trimiteți copii ale atestatelor și să precizați **ce entitate figurează ca auditor atestat în raport** (noi înțelegem: VĂZDUH S.R.L., nu liderul asocierii).
2. Să ne spuneți ce tip este „General” și **ce acoperă exact atestarea**: audituri ale rețelelor și sistemelor informatice ale unei organizații sau și revizuire de cod și teste de penetrare ale unui produs software.
3. Să ne explicați ce înseamnă „Raportul poate fi înaintat DNSC pentru confirmare”. Nu cunoaștem o procedură prin care DNSC să confirme un raport de audit al unui produs. Nu vom folosi niciodată formulări de tipul „confirmat” sau „aprobat de DNSC”.

Apreciem atestarea, pentru că instituțiile publice și entitățile NIS2 din România o cer. Ea nu înlocuiește însă referințele de la punctul 3.

## 6. Independența

Vă rugăm să extindeți declarația de independență, astfel încât să numească și orice legătură a firmelor și a experților cu NexonAI, cu echipa ei și cu instituții care sunt sau pot deveni clienți ai noștri (de exemplu instituții publice, universități și companii din Alba Iulia), inclusiv activitate didactică sau angajare.

## 7. Raportul și condițiile

Propunerea acoperă bine mai multe condiții. Mai solicităm:

1. **Proiect de raport** cu cel puțin cinci zile lucrătoare înaintea raportului final, pentru corectarea faptelor. Corectăm doar fapte, niciodată gravități sau concluzii.
2. **Notificare intermediară** a constatărilor critice și ridicate, în cel mult o zi lucrătoare de la confirmare.
3. **Reverificare** pentru constatările critice, ridicate și pentru cele medii pe care alegem să le remediem, nu doar pentru critice și ridicate.
4. Dreptul de a cita **rezumatul public și declarația de acoperire cuvânt cu cuvânt**, cu formulare convenită.
5. Raportul în **română și engleză**; vă rugăm să includeți prețul versiunii engleze în ofertă.

## 8. Teste pe dispozitive cu root

Aplicația de lansare refuză să ruleze pe dispozitive cu root. Pentru analiza dinamică vom pune la dispoziție build-uri de test convenite la pasul 1, dar vă rugăm să ne spuneți ce aveți nevoie.

## 9. Confidențialitate și brevet

Protocolul este în evaluare pentru brevet. Înainte de predarea codului sursă semnăm un acord de confidențialitate cu clauză pentru brevet, verificat de consilierul nostru juridic. Solicităm stocare criptată, păstrarea doar a documentelor de lucru strict necesare și confirmare scrisă a ștergerii la final.

## 10. Oferta comercială

Nu am primit propunerea comercială. Vă rugăm să includeți: preț fix sau plafonat pe fiecare lot (A–F), persoane-zile și tarif zilnic pe persoană, prețul reverificării, prețul unei runde suplimentare, prețul traducerii în engleză și al rezumatului public, condiții de plată și valabilitatea ofertei (cel puțin 60 de zile).

Vă rugăm să ne trimiteți răspunsul și propunerea revizuită în cel mult 10 zile calendaristice. Întrebările pot fi trimise la unpruuf@nexonai.ro.

Cu stimă,

Gabriel Hategan
NexonAI Consulting SRL, Alba Iulia
unpruuf@nexonai.ro

Anexă: Cerere de ofertă, audit independent de securitate al sistemului unpruuf, 28.10.2026
