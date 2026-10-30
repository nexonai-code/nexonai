# Aplicația de ofițer pentru mai multe persoane: conturi nominale, „tratat de”, jurnal de activitate

Document de concept, ciornă din 30 octombrie 2026. Se aplică pentru unpruuf Compliance și unpruuf Press (același program, două ediții). Nimic din acestea nu este construit. Deciziile de produs le ia numai Gabriel.

## 1. Scop

Un birou care primește sesizări este rareori o singură persoană. Doi sau trei colegi își împart cazurile, unul este în concediu, unul nu are voie să vadă un caz despre propriul departament. Astăzi aplicația de ofițer cunoaște exact un utilizator. Documentul descrie cum pot lucra mai multe persoane nominale în același sistem de cazuri și cum arată fiecare acțiune cine a făcut-o („tratat de”), fără să schimbe ce vede sesizantul sau cum circulă mesajele.

## 2. Ce există astăzi (din cod, `officer-app/`)

- **Un singur utilizator.** O parolă (`OFFICER_PASSWORD`) decriptează fișierul cu identitatea ofițerului (`officer-identity.json`: cheie scrypt, AES-256-GCM). Cheia bazei de date a cazurilor este derivată din această identitate (`deriveDbKey`), deci baza de date și identitatea țin una de alta.
- **Un singur program per identitate.** Programul interoghează releul sau nodurile, avansează starea de criptare a fiecărui caz și trimite răspunsuri. Două programe cu aceeași identitate și-ar strica reciproc starea. Mai multe persoane trebuie deci să folosească **un singur program care rulează**, nu câte unul fiecare.
- **Acces de pe alte calculatoare** este posibil (`OFFICER_BIND_HOST`) cu o singură parolă comună a panoului (HTTP Basic) și un token de acces aleator la fiecare pornire. README-ul avertizează chiar el că HTTP simplu într-o rețea expune parola și sesizările.
- **Nu există „cine”.** Tabelele `cases` și `case_messages` nu au coloană pentru persoana care tratează sau pentru autor, și nu există jurnal de activitate. Press are „recherchen” (un cod de contact per cercetare); acesta nu este un model de utilizatori.

## 3. Ce nu se schimbă

- Partea sesizantului. Sesizantul nu vede niciodată un nume de angajat, doar „biroul”. Răspunsurile arată ca astăzi.
- Formatul mesajelor, formatul pe fir, lungimea pachetului (decizia deschisă F1 rămâne neatinsă), releul și nodurile, aplicațiile Android și iOS ale sesizantului. Este o schimbare doar în programul de ofițer. Fără muncă iOS (aplicația de ofițer rulează pe PC).
- Niciun server de-al nostru. Programul rulează la client, ca acum.
- Bazele de date existente continuă să funcționeze. Formatul bazei de date rămâne; se adaugă doar coloane și tabele noi.

## 4. Proiectare

### 4.1 Conturi și împachetarea cheii (miezul)

Astăzi parola împachetează direct identitatea. Nou: secretul identității este criptat o singură dată cu o **cheie de date** aleatoare (32 de octeți). Fiecare cont păstrează propria copie a acestei chei de date, împachetată cu o cheie derivată din parola persoanei respective (scrypt, aceiași parametri ca azi, AES-256-GCM). Un fișier nou `officer-users.json` conține, pentru fiecare cont: id, nume afișat, rol, salt, cheia de date împachetată, momentul creării și al ultimei modificări.

- **Migrare.** La prima pornire a noii versiuni, parola existentă devine primul cont (rol Admin, numele se cere o singură dată). Fișierul vechi de identitate este copiat mai întâi în `officer-identity.json.bak`. Baza de date a cazurilor nu este atinsă, pentru că cheia ei provine din identitatea neschimbată.
- **Schimbarea parolei** reîmpachetează o singură copie. **Ștergerea unui cont** șterge copia lui. Dacă cineva uită parola, se pierde doar accesul acelei persoane (Adminul setează una nouă); nu mai înseamnă pierderea tuturor cazurilor.
- **Pornirea.** O persoană cu cont deblochează programul la pornire (ca la solicitarea parolei de azi). Toți ceilalți se autentifică apoi în panou cu propria parolă.

### 4.2 Autentificarea în panou

Parola comună HTTP Basic este înlocuită de o pagină de autentificare cu conturi personale și un cookie de sesiune (HttpOnly, SameSite=Strict). Propunere: expirare la inactivitate 30 de minute, o întârziere după parole greșite repetate (de exemplu 5 încercări, apoi așteptări tot mai lungi), lungime minimă a parolei 12. Tokenul de acces per pornire rămâne. Pentru utilizare în rețea, README-ul recomandă HTTPS (reverse proxy) sau un tunel SSH; HTTP simplu rămâne un risc documentat.

### 4.3 Roluri

- **Officer**: vede și lucrează cazurile pe care are voie să le vadă, răspunde, setează starea și categoria, adaugă note interne.
- **Admin**: tot ce poate un Officer, plus conturi, atribuirea oricărui caz, jurnalul de activitate, setări, export și ștergere.
- Etapa 2: **Reader** (doar citire), de exemplu un auditor sau un supleant.

### 4.4 „Tratat de” și ce adăugăm în jurul lui

- **Persoana care tratează cazul** (`assigned_to`), afișată în listă și în vederea cazului, filtru „cazurile mele”.
- **Autor per mesaj și per schimbare de stare** (înregistrare internă). Sesizantul nu vede nimic din asta.
- **Ultima tratare de / la**, vizibilă în listă, ca un coleg să vadă imediat dacă cineva lucrează la caz.
- **Note interne** per caz (nu se trimit niciodată sesizantului), cu autor și oră, criptate ca mesajele.
- **Redistribuire / predare** (concediu, plecare): Adminul sau persoana curentă mută un caz; mutarea este înregistrată.
- **Recuzare**: un caz poate fi restricționat la conturi numite, astfel încât o persoană care este subiectul sesizării sau îi este apropiată să fie exclusă din caz. Contează cel mai mult în practică și este și cel mai greu de făcut corect (vezi 6).
- **Protecție împotriva muncii duble:** o schimbare de stare poartă versiunea văzută de persoană; dacă între timp altcineva a schimbat-o, ecranul spune asta în loc să suprascrie.
- **Termene per persoană:** termenele existente de confirmare și de răspuns (7 zile, 3 luni) pot fi listate per persoană.
- **Press:** același model, cu termenul „editor”; o cercetare poate fi atribuită unei persoane.

### 4.5 Jurnal de activitate

Un tabel de evenimente: autentificare, autentificare eșuată, caz deschis, răspuns trimis, stare sau categorie schimbată, notă adăugată, export, ștergere, cont creat sau șters, caz mutat. Fiecare intrare este criptată cu cheia de date și legată de intrarea precedentă prin hash, astfel încât **o intrare modificată sau ștearsă este detectată** de oricine verifică lanțul. Numai Adminii îl văd. Păstrarea o stabilește clientul (el decide cât timp este necesar; noi nu fixăm o perioadă legală). Jurnalul este el însuși date personale despre angajați; clientul este operatorul.

## 5. Etape

| Etapa | Conținut | Dimensiune |
|---|---|---|
| 1 | Conturi și împachetarea cheii cu migrare, pagină de autentificare și sesiuni, roluri Officer și Admin, persoană per caz, autor per mesaj și schimbare de stare, „ultima tratare”, jurnal de activitate cu lanț, ecran de utilizatori pentru Admini, teste, README, text nou la prima pornire în `start.bat` | medie: fișierul de identitate, autentificarea în panou, coloane și tabele noi, un ecran nou |
| 2 | Note interne, recuzare (caz restricționat la conturi numite), redistribuire, verificare de versiune la schimbarea stării, rolul Reader, listă de termene per persoană | medie |
| 3 | Opțional: al doilea factor (cod unic) pentru Admini, închidere cu patru ochi pentru categorii sensibile | mică spre medie |

Dovada înainte de livrare: teste unitare pentru împachetare, migrare (fișierul vechi se deschide, `.bak` restaurează), parole greșite, limitare de încercări, verificări de roluri, lanțul jurnalului (o intrare modificată, verificarea eșuează); o rulare cap-coadă cu două conturi pe același caz. Fără test cu Tor real, fără audit.

## 6. Limite oneste (le spunem așa cum sunt)

1. **Ștergerea unui cont nu retrage ce a văzut deja persoana.** Identitatea biroului nu poate fi schimbată fără a reasocia fiecare sesizant, deci cheia de date rămâne. Ștergerea oprește accesul viitor prin program; nu protejează împotriva unei persoane care a copiat mai înainte folderul de date și își cunoaște parola. Același lucru este valabil și azi cu o singură parolă.
2. **Jurnalul de activitate arată manipularea, nu o împiedică.** Un Admin care deține cheia de date poate reconstrui întregul lanț. Spunem „modificările devin detectabile”, niciodată „imposibil de falsificat”.
3. **Recuzarea este la fel de bună ca configurarea.** Un Admin se poate adăuga oricând. O restricție protejează împotriva utilizatorilor obișnuiți, nu împotriva unui Admin necinstit; jurnalul arată că s-a întâmplat.
4. **Fără recuperarea parolei.** Recomandare: cel puțin doi Admini, iar configurarea avertizează dacă există unul singur.
5. **Calculatorul comun și HTTP simplu** rămân în responsabilitatea clientului (README).
6. Neauditat. Noua împachetare a cheii ar trebui să facă parte din domeniul auditului.

## 7. Repere juridice (de confirmat de un jurist, încă neverificate față de legea română 361/2022)

Directiva (UE) 2019/1937, articolul 9 alineatul (1) litera (a), cere canale care păstrează protejate identitățile și împiedică accesul personalului neautorizat; litera (c) cere o persoană sau un departament imparțial, competent să dea curs sesizărilor. Conturile nominale, rolurile și recuzarea servesc exact acestui scop. Textul este preluat dintr-o copie a directivei de pe [legislation.gov.uk](https://www.legislation.gov.uk/eudr/2019/1937/article/9/data.htm); de verificat pe EUR-Lex. Nu afirmăm că produsul îndeplinește aceste articole: sprijină organizația să le îndeplinească.

## 8. Cum putem spune

„Fiecare persoană din biroul dumneavoastră de sesizări are propriul cont. Fiecare acțiune arată cine a făcut-o. Un coleg implicat într-un caz poate fi ținut departe de el. Modificările din registru devin vizibile.” Nu: „rezistent la audit”, „imposibil de falsificat”, „conform”.

## 9. Decizii pentru Gabriel

1. Se construiește etapa 1 așa cum este descrisă? Reface modul în care se deschide fișierul de identitate care funcționează, deci are nevoie de „da”-ul tău înainte să înceapă lucrul. Recomandat: da, cu copia de siguranță și revenirea de mai sus.
2. Roluri în etapa 1: doar Officer și Admin (recomandat), Reader mai târziu.
3. Expirare la inactivitate 30 de minute și lungime de parolă 12 ca valori implicite?
4. Configurarea cere sau doar recomandă un al doilea Admin (recomandat: avertizează, nu forța)?
5. Recuzarea și notele interne din etapa 2 imediat după etapa 1, sau așteptăm primul client care le cere?
6. Press: același model cu termenul „editor” (recomandat).
