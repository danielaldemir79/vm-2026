# Guide: VM 2026 som riktig Android-app (TWA) , bort från Play Protect-varningen

Den här guiden är skriven för **Daniel**. Den visar hur vi tar bort Play Protect-varningen
("En osäker app har blockerats") som dyker upp när vänner installerar webbappen på Android.

> Kort bakgrund (liknelse): I dag installeras VM 2026 som en **WebAPK**, en sorts app som
> webbläsaren själv "bakar" åt sig i bakgrunden. Problemet är att webbläsaren bakar den med
> en gammal etikett (`targetSdk`), och Android-telefonen tycker "den här ser gammal ut" och
> visar varningen. Vi kan inte ändra etiketten , webbläsaren sätter den, inte vi (det fastställde
> T30). **TWA-vägen är att vi själva bakar appen i stället**, med en färsk etikett, signerar den,
> och lägger den på Google Play. Då försvinner varningen, för nu är det en riktig, aktuell,
> signerad app , inte en "gammal" genväg.

Allt nedan är verifierat mot officiella källor (se `docs/decisions.md`, T36). Inget är gissat.

---

## Vad det här löser (och varför det funkar)

En app som ligger på **Google Play** får INTE Play Protect-varningen, av tre skäl som hänger ihop:

1. Varningen visas bara om appens `targetSdk` är mer än 2 nivåer under telefonens Android-version.
   (Google, "Developer Guidance for Google Play Protect Warnings".)
2. Google Play KRÄVER sedan augusti 2025 att nya appar är byggda för Android 15 (API 35) eller nyare.
   En app vi laddar upp nu får alltså automatiskt en färsk etikett. (Play Console Help, "target API
   level requirement".)
3. Appen är signerad (Play sköter signeringen åt oss). Play Protect blockerar bara osignerade appar.

Resultat: en TWA på Play är aktuell + signerad = faller utanför varningen. Det är hela poängen.

---

## Det här är redan FÖRBERETT åt dig (gjordes i T36, behövde inte ditt konto)

- **`public/.well-known/assetlinks.json`** finns på plats. Det är "kopplings-intyget" mellan din
  sajt och appen (mer nedan). Den har en **platshållar-nyckel** just nu , du fyller i den riktiga i
  steg 5 nedan.
- Ett test (`src/pwa/assetlinks.test.ts`) vaktar att filen har rätt form och att platshållaren inte
  glöms.
- Manifestet (`src/pwa/app-manifest.ts`) har redan `id`, `start_url`, `scope` och ikoner som en TWA
  vill ha (gjordes i T30). Inget behöver ändras där.

Du behöver alltså bara göra stegen i nästa avsnitt.

---

## "Behöver Daniel": numrerade steg (kräver ditt Google Play-konto)

Gör dem i ordning. Räkna med en kvälls jobb + några timmars-dagars väntan på Plays granskning.

1. **Skaffa ett Google Play Developer-konto.** Gå till Play Console och registrera dig. Det kostar
   **25 USD , en ENGÅNGSAVGIFT** (inte per år, till skillnad från Apple). Kort med riktigt saldo, inte
   förbetalt. (Källa: Play Console Help, "Get started with Play Console".)

2. **Bygg Android-paketet.** Två vägar, välj EN:
   - **PWABuilder (rekommenderas, enklast , allt i webbläsaren):**
     1. Gå till `https://www.pwabuilder.com`.
     2. Skriv in `https://vm-2026.pages.dev` och tryck Start.
     3. Välj **Android -> Google Play**, generera paketet, ladda ner zip-filen.
     4. Zip:en innehåller `.aab` (det du laddar upp till Play) + en `.apk` (för att testa på din egen
        telefon först) + en `assetlinks.json` med RÄTT fingerprint redan ifylld (spara den, du behöver
        dess fingerprint i steg 5).
   - **Bubblewrap (alternativ, om du vill köra kommandon själv):**
     ```bash
     npm install -g @bubblewrap/cli
     bubblewrap init --manifest https://vm-2026.pages.dev/manifest.webmanifest
     bubblewrap build
     ```
     `bubblewrap init` ställer frågor (paketnamn, namn, färg). `bubblewrap build` skapar
     `app-release-bundle.aab` (till Play) + `app-release-signed.apk` (till test). Första gången laddar
     Bubblewrap ner Java + Android-verktyg åt dig. (Källa: Google codelab "Adding Your PWA to Google Play".)

   > Notera **paketnamnet** du väljer/får (t.ex. `app.vm2026.twa`). Det måste matcha `package_name` i
   > `assetlinks.json` (steg 5).

3. **Testa `.apk` på din egen telefon först** (valfritt men klokt): överför `.apk`:n och installera. Då
   ser du appen innan den går publikt. (I detta sideloadade läge kan adressfältet synas tills steg 5+6
   är klara , det är väntat, det försvinner när asset-links verifierats.)

4. **Ladda upp `.aab` till Google Play.** I Play Console: skapa appen, ladda upp `.aab`:n, och **aktivera
   Play App Signing** (det är default och krävs). Google håller då den slutgiltiga signerings-nyckeln;
   din egen nyckel blir bara en "upload key". Fyll i store-listningen: namn, ikon, beskrivning,
   skärmdumpar, integritetspolicy och innehållsklassificering.

5. **Fyll i den RIKTIGA fingerprinten i `assetlinks.json`.** Det här är det som binder appen till sajten.
   1. I Play Console: **Setup -> App integrity** -> kopiera **SHA-256 certificate fingerprint** (ser ut
      som `AB:CD:12:...`, 32 byte med kolon emellan). Det är Play App Signings nyckel , använd just den,
      inte din lokala upload-nyckel. (Källa: Chrome for Developers, TWA-docs + PWABuilder Asset-links.md.)
   2. Öppna `public/.well-known/assetlinks.json` i repot. Byt ut platshållar-texten i
      `sha256_cert_fingerprints` mot den riktiga fingerprinten. Byt `package_name` till appens faktiska
      paketnamn (från steg 2) om det inte redan är `app.vm2026.twa`.
   3. Använde du PWABuilder? Då har du redan en färdig `assetlinks.json` i zip:en , kopiera dess
      `package_name` + fingerprint rakt in i repots fil.
   4. Uppdatera testet `src/pwa/assetlinks.test.ts`: det sista test-fallet kräver i dag att platshållaren
      finns kvar. Byt det till att kontrollera den riktiga formen (32 kolon-separerade hex-byte), så
      pinnen flyttas från "ej klar än" till "rätt nyckel ifylld".
   5. Committa och pusha till `develop`. Cloudflare bygger och deployar automatiskt.

6. **Verifiera att intygsfilen är LIVE.** När Cloudflare deployat, kör (eller öppna i webbläsaren):
   ```bash
   curl -i https://vm-2026.pages.dev/.well-known/assetlinks.json
   ```
   Det ska ge `HTTP/2 200` och visa JSON-innehållet (inte appens startsida).
   - **Funkar det? Klart.** Android verifierar appen mot sajten och adressfältet försvinner i appen.
   - **Får du 404, eller appens startsida i stället för JSON?** Då serverar Cloudflare Pages inte
     `.well-known`-mappen som väntat (en känd, men osäker, dotfile-egenhet). Se nästa avsnitt.

---

## Om Cloudflare inte serverar `.well-known` (fallback , bara om steg 6 misslyckas)

Lokalt är allt bevisat: bygget kopierar filen och `vite preview` serverar den korrekt. Det enda som
inte gått att testa i förväg är Cloudflares edge (det kräver en riktig deploy). Skulle steg 6 ge 404
eller fel innehåll, prova i denna ordning (en räcker):

1. **`_redirects`-regel.** Lägg en fil `public/_redirects` med raden:
   ```
   /.well-known/assetlinks.json   /assetlinks.json   200
   ```
   och lägg en kopia av filen som `public/assetlinks.json` (utan punkt-mappen). Då serveras innehållet
   på rätt URL även om dot-mappen strular. (`200` = servera, inte omdirigera bort.)
2. **Pages Function.** Skapa `functions/.well-known/assetlinks.json.ts` som returnerar JSON:en med
   `content-type: application/json`. Cloudflare kör Functions även för dot-vägar.
3. **Worker framför Pages.** Sista utväg: en liten Cloudflare Worker som fångar
   `/.well-known/assetlinks.json` och svarar med innehållet. (Cloudflare Community rekommenderar detta
   som den mest robusta lösningen för dotfiler.)

Verifiera igen med `curl -i` efter vald fallback. Innehållet i `assetlinks.json` ändras inte , det är
bara serverings-VÄGEN som får ett extra handgrepp.

---

## Sammanfattning

| Steg | Vem | Status |
|------|-----|--------|
| assetlinks.json-stub + test | Agent Kit (T36) | KLART |
| TWA-research + guide | Agent Kit (T36) | KLART |
| Manifest redo för TWA | Agent Kit (T30) | KLART |
| Play Developer-konto (25 USD) | **Daniel** | Behövs |
| Bygg `.aab` (PWABuilder/Bubblewrap) | **Daniel** | Behövs |
| Ladda upp + Play App Signing | **Daniel** | Behövs |
| Fyll i riktig fingerprint + pusha | **Daniel** | Behövs |
| Verifiera filen live (`curl`) | **Daniel** | Behövs |
| Plays granskning | Google | Väntan |

När alla "Behövs"-rader är gröna är appen på Play , och Play Protect-varningen är borta.
