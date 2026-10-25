R=[]
def a(area,rows):
    for r in rows: R.append((area,)+r)
a('Aplicația · Mesagerie',[
('Conexiune directă prin Tor','Mod direct (ediția Standard și contacte directe): fiecare dispozitiv are propria adresă Tor (serviciu ascuns) și primește direct. Fără cont, fără număr de telefon, fără server. Aplicația Business nu folosește această cale: telefonul ei nu are adresă proprie.','ok',0),
('Scurtătură în același Wi-Fi','Doar cât există un contact direct, niciodată în ediția pentru avertizori. Nume de serviciu neutru, care se schimbă din oră în oră și pe care îl pot calcula doar contactele.','ok',0),
('Livrare confirmată','Mesajele se retrimit până când celălalt dispozitiv confirmă. Chatul arată „în așteptare” sau „confirmat”. O confirmare pierdută nu blochează coada.','ok',0),
('Dimensiune fixă a pachetelor','Fiecare pachet are 4096 de octeți pe fir, deci cine urmărește rețeaua nu află lungimea mesajului. Limită: un pachet stocat arată lungimea conținutului unui operator de nod sau de releu (constatarea F1, vezi pachetul de dovezi). Închiderea ei cere o schimbare a formatului pe fir.','part',1),
('Fișiere și fotografii','Conținutul mare se împarte în pachete și se reasamblează, până la 5 MB. Cameră, miniaturi, imagini reduse la 2048 px.','ok',0),
('Metadatele fotografiilor eliminate','Fiecare fotografie este recodificată: EXIF, GPS și miniaturile încorporate dispar.','ok',0),
('Schimbarea rețelei','La schimbarea rețelei, Tor repornește și adresa este republicată. Autoverificare la fiecare 4 minute.','ok',0),
('Releu opțional','Dezactivat implicit. O cutie poștală proprie, oarbă, care vede doar pachete criptate. Lista de relee călătorește în codul QR de asociere.','ok',0),
])
a('Aplicația · Confidențialitate',[
('Criptare cap-coadă','Double Ratchet (X25519, HKDF, XChaCha20-Poly1305) într-un strat exterior AES-256-GCM. Secretizare înainte în ambele direcții.','ok',0),
('Mesaje doar în memorie','Niciodată scrise pe disc. Cu aplicația deschisă dispar după 5 minute; la ieșirea din aplicație sau la blocarea ecranului, imediat.','ok',0),
('Bază de date de contacte criptată','SQLCipher, AES-256. Se stochează doar contactele, niciodată mesajele.','ok',0),
('Blocarea capturilor de ecran','Fără capturi de ecran, aplicația este ascunsă în comutatorul de aplicații.','ok',0),
('Notificări neutre','Doar „Mesaj nou”. Niciodată expeditorul, niciodată conținutul, nimic pe ecranul de blocare.','ok',0),
])
a('Aplicația · Identitate',[
('Fără ID de utilizator în Business','Aplicația Business (Pro, Pro Groups) nu are deloc ID de utilizator. Codul de asociere conține doar chei, o sămânță de rutare și adrese de noduri. Nimic din el nu numește o persoană sau un dispozitiv, iar două contacte care își compară codurile nu găsesc nimic în comun.','ok',1),
('Fără ID pe fir în Business','Un pachet este adresat printr-o etichetă de rutare pe care o pot calcula doar cei doi parteneri și care se schimbă din oră în oră. Nu există niciun ID de căutat, deci nimeni nu poate asocia o etichetă cu o persoană.','ok',1),
('Fără nume de utilizator propriu','Nu există nume de profil. Fiecare contact vă numește la el. Redenumire oricând.','ok',0),
('ID schimbător per contact','Doar în modul direct (Standard). Fiecare contact vede pentru dumneavoastră un ID diferit, care se schimbă din oră în oră, decalat per pereche. Business nu are nevoie de ID, vezi mai sus.','ok',0),
('ID propriu după asociere','Doar în modul direct (Standard). Ambele dispozitive schimbă un ID nou. Două contacte care își compară notițele nu găsesc niciun ID comun.','ok',0),
('Protecție la suprascrierea QR','Un QR cu o identitate cunoscută, dar cu chei diferite, este respins în loc să înlocuiască tăcut contactul.','ok',0),
('Număr de siguranță','Cod de șase cifre per contact, verificat pe alt canal, de exemplu la telefon. O potrivire marchează contactul ca verificat.','ok',0),
('Adresă Tor proprie per contact','Doar în modul direct (Standard). Asocierile noi folosesc adresa principală, cele mai vechi au adresă proprie. ID-ul este complet separat, adresa doar parțial.','part',0),
('Contacte verificate pe o adresă care se schimbă zilnic','Doar în modul direct (Standard). Construit, netestat pe Tor real.','part',0),
])
a('Aplicația · Analiza traficului',[
('Trafic momeală','Pachete momeală aleatorii către toate contactele. Țin căile active; receptorul le aruncă.','ok',0),
('Rezistență la analiza temporală','Intervale aleatorii, dar nu un canal cu debit constant.','part',0),
])
a('Aplicația · Acces și constrângere',[
('Blocare cu PIN','Aplicația se deschide doar cu PIN (hash cu sare, niciodată în clar). Tastatură numerică.','ok',0),
('PIN de panică','Un al doilea PIN șterge deodată toate contactele și cheile și deschide o aplicație goală.','ok',0),
('Amprentă','În plus față de PIN, niciodată în locul lui. Nu declanșează niciodată PIN-ul de panică.','ok',0),
('Ștergerea chatului','Șterge mesajele de pe ambele părți, contactul rămâne.','ok',0),
('Ștergerea contactului','Se șterge și pe celălalt telefon (în coadă, cu reîncercări).','ok',0),
('Detectarea root','Aplicația refuză să pornească pe un dispozitiv care pare root. Cel mai bun efort, nu o dovadă.','ok',0),
('Expirarea versiunii','O versiune se oprește după aproximativ 180 de zile de la compilare, în fiecare ediție.','ok',0),
])
a('Aplicația · Fiabilitate și cenzură',[
('Servicii în fundal și wakelock','Tor și receptorul rulează în fundal. O singură cerere de a exclude aplicația din optimizarea bateriei.','ok',0),
('Adresa rămâne publicată','La fiecare 20 de secunde dispozitivul se conectează la sine. Resturile contactelor șterse sunt curățate la pornire.','ok',0),
('Bridge-uri','Setări → Ocolirea cenzurii. Bridge-urile simple cu adresă și amprentă funcționează.','ok',0),
('Cale de conectare automată','Dacă Tor nu se poate conecta, aplicația încearcă singură următoarea cale: direct, bridge-ul companiei (dacă organizația are unul), bridge-uri obfs4 publice, Snowflake. Calea care a funcționat se reține pentru următoarea pornire. Bridge-urile introduse manual au întotdeauna prioritate. Netestat într-o rețea care blochează cu adevărat Tor.','part',1),
])
a('Aplicația · Ediții și licență',[
('Standard, Pro, Pro Groups, Client','Un singur cod sursă, patru culori și pictograme. Standard se asociază cu Standard și Pro, Pro cu Standard, Pro și Client, Client doar cu Pro, Pro Groups doar cu Pro Groups. Toate pot fi instalate alături.','ok',0),
('Ediția Pro Groups','Pro (Business) plus grupuri locale. Un grup este o listă pe fiecare telefon plus un cod de grup pe care membrii îl stabilesc împreună; nimeni nu poate crea un grup în locul altcuiva. Un mesaj de grup ajunge la fiecare membru ca mesaj obișnuit unu-la-unu, pe serverele proprii ale expeditorului, afișat sub numele din propriul carnet de adrese. Până la 10 membri, doar text, fără server de grup, fără listă de membri nicăieri. Încă nerulat pe telefoane reale.','unk',1),
('Interfață în limba română','Aplicația principală vorbește acum engleză și română și urmează limba telefonului. Toate textele sunt în fișiere de resurse. Un vorbitor nativ de română nu le-a citit încă.','unk',1),
('Ediția pentru avertizori','Linie proprie pentru birourile de raportare. Vezi mai jos.','ok',0),
('Coduri de licență semnate','Ed25519, verificate offline, fără server. Avertisment de expirare în Setări, apoi blocare. Codul se leagă de dispozitiv la activare.','ok',0),
('Protecție la derularea ceasului înapoi','Aplicația reține cea mai recentă dată văzută. Fără ancoră de timp externă.','part',0),
])
a('Aplicația · Business node-mesh',[
('Adăugarea nodurilor proprii','Scanați QR-ul proprietarului de pe server. Aplicația preia singură toate adresele acelui server. Până la 1000 de noduri proprii per dispozitiv.','ok',0),
('Liste de noduri','Grupuri denumite de noduri proprii. Import din fișier sau din text lipit, redenumire, ștergere. Alegeți o listă la adăugarea unui contact.','ok',0),
('3 noduri aleatorii per contact','Din lista aleasă, de pe servere diferite, pe cât se poate. Contactele partajează noduri.','ok',0),
('Chei proprii per contact','Nicio cheie și nicio sămânță de rutare nu aparține la două contacte.','ok',0),
('Adrese de pachet schimbătoare','Adresa unui pachet (eticheta de rutare) se schimbă în fiecare oră.','ok',0),
('Durata pachetelor per chat','1, 6 sau 24 de ore, pictogramă ceas în chat. Se aplică la ce trimiteți.','ok',0),
('Ritm uniform de preluare','Aproximativ la fiecare 20 de secunde, cu variație, chiar și când nu așteaptă nimic. Un observator nu poate spune când se deschide un chat.','ok',0),
('Depuneri momeală','Pachete goale aproximativ la fiecare 15 minute per contact, ca depunerile să nu apară doar cu mesaje reale. Un operator de nod le poate totuși deosebi de mesaje după lungime (constatarea F1); un observator al rețelei nu.','part',0),
('Deblocarea serverului','După o repornire serverul este blocat. Aplicația arată „blocat, deblocați” și trimite cheia după confirmare.','ok',0),
('Temp Node per chat','Un nod suplimentar pentru exact o conversație, doar în memorie, cu QR propriu. Prima trimitere reușită îl confirmă.','ok',0),
('Temp Node pe acest telefon','Doar Pro Groups. Telefonul pornește singur Temp Node-ul pentru un chat: o adresă nouă, care există doar cât rulează, nimic păstrat, fără al doilea dispozitiv. Contactul poate prelua doar cât telefonul este pornit și aplicația rulează. Încă nerulat pe un telefon real.','unk',1),
('Feed al companiei','Organizația întreține listele de noduri central. Aplicația găsește singură adresa curentă, verifică semnătura, nu acceptă niciodată o versiune mai veche. Tot sau nimic.','part',0),
('Fără carnet de adrese','Sistemul nu stochează liste de contacte și nici ID-uri de utilizator. Legătura dintre oameni există doar în chei, noduri și adrese. Contactele există doar pe telefon.','ok',0),
])
a('Aplicația · Ediția pentru avertizori',[
('Un singur QR al companiei','Un singur QR pentru întreaga organizație. Un caz se deschide automat.','ok',0),
('Cazul meu','Număr de caz, stare și termene pentru avertizor.','ok',0),
('Română','Texte proprii (peste 280), vizibile doar avertizorilor și responsabililor.','ok',0),
('Releu obligatoriu','Raportările trec întotdeauna prin releul organizației. Fără LAN, fără serviciu onion propriu.','ok',0),
('unpruuf Press (pilot)','Aceeași aplicație de raportare, cu formulări pentru jurnaliști: o sursă scrie unei redacții. Un pilot, netestat cu o sursă reală.','unk',1),
])
a('Aplicația · Tor Client Edition (versiune specială)',[
('Scanarea QR a codului de feed','Codul de feed se scanează în loc să se tasteze.','unk',0),
('Autorizare client','Serviciul de feed este invizibil fără cheia din codul de feed. Construit, netestat pe Tor real.','unk',0),
])
a('Serverul de noduri',[
('Platforme','Windows (install.bat și start.bat), Linux, Docker, .exe gata făcut fără Node.js. Rularea pe Windows și build-ul Docker mai trebuie verificate pe o mașină reală.','unk',0),
('Tor integrat','Descarcă Tor o singură dată, îl rulează singur, publică fiecare nod ca serviciu onion. După o cădere repornește cu aceeași adresă. Descărcarea este verificată cu valori SHA-256 fixate, luate din lista semnată a proiectului Tor (din 14 octombrie; înainte nu era verificată).','ok',1),
('Proof-of-work împotriva inundării','Protecția proprie a Tor este mereu activă. În plus, o limită la preluări (5 pe secundă, rafală de 30).','ok',0),
('Până la 250 de noduri per server','Numărul vine din licență și nu este o setare. Un singur proces Tor, toate serviciile onion.','ok',0),
('Licența serverului','Un cod per server: client, serie, noduri (max 250), expirare. Verificat offline, nu se trimite nimic, niciun dispozitiv înregistrat. Fără licență rulează doar pagina de configurare.','ok',0),
('Chei sigilate','Secretul proprietarului și cheile onion sunt pe disc doar criptate. Blocat după o repornire până când aplicația sau pagina de configurare îl deblochează. Adresele rămân aceleași.','ok',0),
('Doar proprietarul scrie','Depunerea cere secretul proprietarului. Contactele doar citesc, cu o etichetă de rutare, și nu pot șterge nimic. Doar timpul șterge.','ok',0),
('Durata pachetelor','Profil de 1, 6 sau 24 de ore. O depunere poate cere un timp mai scurt, niciodată mai lung. Pachetele expirate sunt suprascrise.','ok',0),
('Alegeți unde stau pachetele','Disc (implicit) sau doar memorie, cu NODE_MESH_STORE=ram. O repornire golește pachetele în așteptare.','ok',0),
('Sloturi de la 1 la 3','Până la trei servere proprii pe o mașină, resetare zilnică eșalonată (minutul 0, 20, 40), porturi și foldere proprii.','ok',0),
('Pagina de configurare','Accesibilă doar pe această mașină. QR al proprietarului, lipirea licenței, deblocare, salvarea listei de noduri ca fișier.','ok',0),
('Pagina de prezentare generală','Semafor, noduri, pachete stocate, cea mai lungă așteptare, contoare pe 24 de ore, grafic orar, starea licenței, unde stau pachetele. Se reîmprospătează la 5 secunde.','ok',0),
('Temp Node','start-tempnode.bat: un nod pentru o conversație, totul în memorie, fără licență.','ok',0),
('Verificarea versiunii','Serverul ține o listă semnată cu hash-urile propriilor fișiere și se verifică singur la pornire și în fiecare oră. Un fișier modificat arată un avertisment pe pagina de prezentare și pe cea de configurare; poate și refuza să pornească. Un script verifică o copie din exterior. Un server deja compromis poate minți despre sine, iar o dovadă reală la distanță ar cere hardware special. Neconstruit.','ok',1),
('Bridge-ul companiei','Un bridge Tor privat, cu front obfs4, pe un server mic separat (start-bridge). Linia lui intră în lista de noduri și în feed-ul companiei, deci aplicațiile din rețele blocate îl folosesc. O pornire completă prin el nu este încă verificată.','unk',1),
('Serviciul de feed','start-feed: organizația publică listele de noduri criptate și semnate, la o adresă onion care se schimbă la câteva ore. Aplicațiile o calculează singure.','unk',0),
])
a('Android ca nod (relay-android)',[
('Mod nod Business','Un dispozitiv Android ca exact un nod. Același contract ca serverul. Arată QR-ul proprietarului, profilul și slotul.','unk',0),
('Verificarea licenței','Aceeași verificare offline ca la server.','ok',0),
('Limite','Fără proof-of-work Tor, pachete într-un fișier pe dispozitiv (nu doar în memorie), netestat pe un dispozitiv.','part',0),
('Mod releu','Aceeași aplicație poate rula în schimb ca releu clasic: serviciu Tor, QR, retenție reglabilă, jurnal de activitate, bridge-uri, blocare root.','ok',0),
])
a('Relee și unelte',[
('Server releu (server/)','Cutie poștală oarbă pentru Standard și iOS. Docker/Linux, Windows, macOS, Android. Înregistrează evenimente fără conținut.','ok',0),
('Aplicația pentru responsabili','Panou Windows pentru responsabilii de caz, în limba română: participant real în același protocol. Un singur cod pentru întreaga organizație (mare, pentru proiector), cazurile se deschid singure cu număr de caz aleatoriu, confirmarea de primire și semnalele de stare se întorc la avertizor, termene conform Directivei UE 2019/1937, actualizări în direct. Ștergerea sau exportul unui singur caz nu este încă construit.','unk',0),
('Raportor web','Pagină de raportare în browser, fără instalare, anonimat mai slab, declarat deschis într-un banner.','unk',0),
('Pachetul de dovezi','Folderul evidence/: nouă scripturi care testează suprafața serverului, ce stochează, codul lui, permisiunile și bibliotecile aplicației, etichetele de rutare, codul de asociere și hash-urile Tor, plus un tabel care leagă fiecare afirmație de dovada ei și un domeniu propus pentru o verificare independentă. Nu este un audit. A găsit o afirmație pe care dovezile nu o susțin (F1) și patru vulnerabilități cunoscute în bibliotecile serverului, acum remediate.','ok',1),
('Unealta de licențe','Offline: creare pereche de chei, emitere de coduri pentru aplicații și servere (unul sau lot), verificare, semnarea unei versiuni de server, interfață web mică.','ok',0),
('unpruuf Control','Consola clientului, pe propriul PC de administrare (pagină web locală, engleză și română). Adaugă servere prin SSH, cu o cheie per server și cheia gazdei fixată, instalează serverul de noduri în Docker, arată starea tuturor serverelor, le deblochează după repornire, le actualizează și împarte coduri de licență din stocul clientului către servere și dispozitive cu nume. Avertizează la a doua instalare a aceleiași licențe. Evidență, nu protecție la copiere. Testat doar pe un server simulat, niciodată pe un VPS real.','unk',1),
('Unealta pentru lista de relee','Listă semnată de adrese de relee pentru companii, cheie proprie. Încă nelegată complet în aplicație.','part',0),
('Aplicația iOS','Companion îngust în mod releu. Două iPhone-uri reale au schimbat mesaje în ambele sensuri. Încă fără node-mesh, fără liste de noduri, fără module de licență. La 14 octombrie a fost scrisă o specificație de construcție pentru clientul Business (ca un iPhone să se poată asocia cu un telefon Android Pro); nimic din ea nu este construit. Echipa hotărăște punctele deschise.','part',0),
])
