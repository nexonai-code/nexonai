# unpruuf Control

**English first, Romanian below.**

The customer's own console for their unpruuf node servers and licence codes. It runs **on the customer's admin PC**
(a web page on `127.0.0.1`, nothing is reachable from outside) and reaches the customer's servers over SSH.
NexonAI runs nothing and sees nothing: no account, no connection to us, no copy of your keys.

## What it does

| | |
|---|---|
| **Add a server** | Enter the VPS login from the hosting company. Control checks the machine (Linux, 64-bit, memory, disk, Docker), pins the server's identity, creates **its own SSH key for this server**, installs it, and from then on works only with that key. The password is used once and never stored. Optionally it switches off password login on the server afterwards. |
| **Install** | Uploads the server software that travels with Control (no download from NexonAI), checks the checksum, installs Docker on Debian/Ubuntu if missing, builds and starts the node server. The server's setup page is reached only through the SSH connection, never opened to the internet. |
| **Licences** | Import the codes NexonAI issued (`license-tool`: `issue-server.js --count N` for server codes, `issue.js --count N` for app codes): server codes and app codes. App codes are device-bound (the first phone that activates one keeps it); server codes are not bound to a machine. Control verifies every code offline, hands the next free server code to a new server, lets you give app codes to named devices, shows what is free or expiring, and stops the same code from being given to two servers. |
| **Operate** | One table of all servers: reachable, locked, licence days left, node addresses registered, version, program check. **Unlock** after a restart with one click (Control keeps each server's write code, encrypted). Update the server software. Put a renewed licence on the server. Company bridge lines. **New write key** when someone who had the node lists leaves. |
| **Distribute** | Download each server's node list or all of them as one ZIP, and a short guide for your people. Right after an installation the dialog offers the list as well. Warns when all servers sit with one hosting company or in one region. |
| **Products** | Business, unpruuf Compliance and unpruuf Press use the same server. The choice sets sensible defaults (Business: packets wait up to 6 hours; unpruuf Compliance and Press: up to 24 hours) that you can change per server. |

One VPS is one server, one licence, 250 node addresses. The 250 addresses are created by the server itself when its licence is applied; Control waits for them and shows the progress.

## Start (Windows)

1. Install Node.js 20 or newer (https://nodejs.org).
2. Double-click `install.bat` once, then `start.bat`. The page opens in your browser.
3. First start: choose a **long passphrase**. Everything Control knows is kept in one encrypted file, `data/vault.enc`, that only this passphrase opens. There is no way to recover it. Keep an encrypted backup (Settings) and let a second administrator hold the passphrase.

Linux / macOS: `./install.sh`, then `./start.sh`. Port 8860 (`CONTROL_PORT`), data folder `CONTROL_DATA_DIR`.

## Honest limits

- **Not a copy protection.** Control stops the common mistake (one code on two servers) and shows what is free. It cannot stop somebody from copying a code by hand. "One server per licence" stays in the contract.
- **It sees no phone and no message.** People, phones and chats do not exist for it; it only hands out lists and codes.
- **The vault is the crown jewels.** Whoever has `vault.enc` and the passphrase has every server key and write code in it.
- **Tested against a simulated server, not yet against a real VPS.** The install steps, the setup-page calls, host-key pinning, sudo handling and failure cases are covered by automated tests with a simulated SSH server; the Docker build on a real machine has not been run. Try the first installation on a spare VPS.
- **Docker is installed automatically on Debian and Ubuntu only.** On other systems install Docker first.
- Not audited, not certified.

## For NexonAI (building a delivery)

```
cd node-mesh-server && npm run build          # then, to sign the release:
node ../license-tool/sign-release.js          # writes release-manifest.txt (needs your private key)
cd ../control && npm ci && npm run build && npm run bundle
npm test
```

`npm run bundle` writes `bundle/node-server.tgz` and `bundle/bundle.json` from `../node-mesh-server`. If the release was signed, the signed list goes into the bundle and every installed server shows "unchanged, signed" with the fingerprint; otherwise servers show "unsigned". Ship `bundle/` with the delivery.

---

# unpruuf Control (română)

Consola proprie a clientului pentru serverele de noduri unpruuf și codurile de licență. Rulează **pe calculatorul de administrare al clientului** (o pagină web pe `127.0.0.1`, nimic nu este accesibil din exterior) și ajunge la serverele clientului prin SSH. NexonAI nu operează nimic și nu vede nimic: fără cont, fără conexiune către noi, fără copie a cheilor tale.

## Ce face

- **Adaugă un server:** introduci datele de acces la VPS primite de la compania de găzduire. Control verifică mașina (Linux, 64 de biți, memorie, disc, Docker), fixează identitatea serverului, creează **propria cheie SSH pentru acest server**, o instalează și de atunci lucrează doar cu ea. Parola se folosește o singură dată și nu este păstrată. Opțional oprește apoi autentificarea cu parolă pe server.
- **Instalează:** încarcă software-ul de server care vine cu Control (fără descărcare de la NexonAI), verifică suma de control, instalează Docker pe Debian/Ubuntu dacă lipsește, construiește și pornește serverul de noduri. Pagina de configurare a serverului este atinsă doar prin conexiunea SSH, niciodată deschisă pe internet.
- **Licențe:** importă codurile emise de NexonAI (`license-tool`: `issue-server.js --count N` pentru coduri de server, `issue.js --count N` pentru coduri de aplicație): coduri de server și de aplicație. Codurile de aplicație sunt legate de dispozitiv (primul telefon care îl activează îl păstrează); codurile de server nu sunt legate de o mașină. Control verifică fiecare cod offline, dă următorul cod liber unui server nou, îți permite să dai coduri de aplicație unor dispozitive cu nume, arată ce este liber sau expiră și împiedică darea aceluiași cod la două servere.
- **Operare:** un tabel cu toate serverele: accesibil, blocat, zile de licență rămase, adrese de noduri înregistrate, versiune, verificarea programului. **Deblocare** după o repornire dintr-un clic (Control păstrează, criptat, codul de scriere al fiecărui server). Actualizarea software-ului, punerea unei licențe reînnoite pe server, liniile de bridge ale companiei, **cheie de scriere nouă** când pleacă cineva care a avut listele de noduri.
- **Distribuire:** descarci lista de noduri a fiecărui server sau pe toate într-un singur ZIP, plus un ghid scurt pentru oamenii tăi. Avertizează când toate serverele sunt la o singură companie de găzduire sau într-o singură regiune.
- **Produse:** Business, unpruuf Compliance și unpruuf Press folosesc același server. Alegerea setează valori implicite potrivite (Business: pachetele așteaptă până la 6 ore; unpruuf Compliance și Press: până la 24 de ore), pe care le poți schimba pentru fiecare server.

Un VPS este un server, o licență, 250 de adrese de noduri. Cele 250 de adrese le creează serverul însuși când i se aplică licența; Control așteaptă și arată progresul.

## Pornire (Windows)

1. Instalează Node.js 20 sau mai nou (https://nodejs.org).
2. Dublu clic pe `install.bat` o dată, apoi pe `start.bat`. Pagina se deschide în browser.
3. La prima pornire alege o **parolă lungă**. Tot ce știe Control este într-un singur fișier criptat, `data/vault.enc`, pe care îl deschide doar această parolă. Nu există cale de recuperare. Păstrează o copie de rezervă criptată (Setări) și lasă un al doilea administrator să dețină parola.

## Limite, spuse deschis

- **Nu este protecție la copiere.** Control previne greșeala frecventă (un cod pe două servere) și arată ce este liber. Nu poate opri pe cineva să copieze manual un cod. „Un server pe licență” rămâne în contract.
- **Nu vede niciun telefon și niciun mesaj.** Persoanele, telefoanele și conversațiile nu există pentru el; doar împarte liste și coduri.
- **Seiful este bunul cel mai prețios.** Cine are `vault.enc` și parola are toate cheile serverelor și codurile de scriere din el.
- **Testat față de un server simulat, nu încă pe un VPS real.** Pașii de instalare, apelurile către pagina de configurare, fixarea identității serverului, tratarea sudo și cazurile de eroare sunt acoperite de teste automate cu un server SSH simulat; construirea Docker pe o mașină reală nu a fost rulată. Încearcă prima instalare pe un VPS de probă.
- **Docker se instalează automat doar pe Debian și Ubuntu.** Pe alte sisteme instalează mai întâi Docker.
- Neauditat, necertificat.
