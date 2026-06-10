# Mönster-bibliotek (VM 2026)

Återanvändbara kod-recept som dyker upp under bygget (DRY, rule of three: skriv in ett mönster
när det använts 3 gånger eller uppenbart kommer återanvändas). Fylls av senior-developer under
bygget. Tomt nu, det är normalt i ett nytt projekt.

> Generella, projekt-oberoende knep bor i Agent Kit-playbooken, inte här. Här bor bara
> VM-2026-specifika recept.

## Mönster

### no-flash-tema-i-react-vite-utan-duplicerade-strängar

**Recept (en sanning, ingen FOUC):**
1. Lägg alla tema-konstanter (storage-nyckel, DOM-attribut, default, giltiga teman) i EN modul
   (`src/theme/theme-constants.ts`).
2. Lägg den rena resolve-logiken i en testbar modul (`src/theme/theme-core.ts`):
   `resolveInitialTheme(stored, systemPrefersDark)` med prioritet sparat -> system -> default.
3. GENERERA det blockerande inline-scriptets text från konstanterna
   (`src/theme/theme-init.ts` -> `buildThemeInitScript()`), kopiera inte magiska strängar.
4. Injicera scriptet FÖRST i `<head>` via ett Vite-plugin (`transformIndexHtml` med
   `injectTo: 'head-prepend'`), Vites motsvarighet till Astros `define:vars`.
5. React-providern (`ThemeProvider`) LÄSER temat inline-scriptet redan satte
   (`readThemeFromDocument`) i stället för att räkna om, så ingen flash vid mount.
6. Ett test (`theme-init.test.ts`) kör den EXAKTA genererade scriptkoden via `new Function`
   mot mockad `matchMedia`/`localStorage` och assertar att den ger samma svar som
   `resolveInitialTheme`, skyddsräcket mot drift.

**Varför:** Inline-scriptet måste vara synkront i `<head>` (en deferred ES-modul tappar
no-flash), men handkopierade strängar driver tyst isär. Codegen + synk-test ger en sanning
utan dublett. Generaliserar Agent Kit-playbookens Astro-knep till React + Vite.

### tema-tokens-som-kontrakt-design-authorar-varden

**Recept:** Uttryck design-tokens som CSS-variabler i Tailwind v4 `@theme inline` med
SEMANTISKA roll-namn (`--color-bg/surface/accent/...`) som pekar på tema-växlande `--vm-*`-
variabler, roterade på `[data-theme]`. Isolera ALLA värden i EN fil (`src/theme/tokens.css`).
**Varför:** Strukturen (kontraktet) ägs av motorn och är stabil; värdena (palett, typografi)
authoras av design-agenten utan att röra plumbing (provider/init/wiring). Roll-namn (inte råa
färger) låter design byta hue/skala fritt. I VM 2026 är `tokens.css`-värdena de slutgiltiga
premium-värdena, authorade av design-frontend-agenten i T2.

### reduced-motion-i-tva-lager (motion/framer)

**Recept:** (1) En `MotionProvider` med `<MotionConfig reducedMotion="user">` som bred
deklarativ a11y-grind för hela trädet. (2) Varje rörelse-primitiv (`Slide`/`Spring`) nollställer
dessutom sin transform-/skal-förskjutning via `useReducedMotion()` så elementet bara tonar in.
Isolera easing/timing i en presets-fil (`motion-presets.ts`) så design finjusterar personlighet
utan att röra primitiverna. Testa reduced-motion genom att mocka `useReducedMotion` och asserta
att `initial`-propen saknar transform vid reducerad rörelse.
**Varför:** Dubbelt skydd = deterministiskt, testbart WCAG 2.3.3-beteende. jsdom saknar
`matchMedia`, så lägg en neutral stub i `src/test/setup.ts`.

### fixtures-forst-datakalla-med-env-gate (React + Vite, VM 2026)

**Recept (samma kod tänds live utan ändring):**
1. Definiera domäntyperna FÖRST (`src/domain/types.ts`), strikt typade.
2. Skriv fixtures (`src/data/fixtures.ts`) som uppfyller EXAKT samma typer som live-datan kommer
   göra (samma fältnamn, samma form). Annoteras mot typerna så `tsc -b` failar om formen avviker.
3. Definiera ett `DataSource`-kontrakt (async-metoder) i `src/data/data-source.ts` som både
   fixtures och live uppfyller.
4. **Gata live på TVÅ villkor, inte bara env (tvåstegs-gate).** Live väljs bara när BÅDA är sanna:
   - **Villkor 1 (env satt):** `isSupabaseConfigured(env)`, dvs båda `VITE_SUPABASE_URL` +
     `VITE_SUPABASE_ANON_KEY` finns och är icke-tomma.
   - **Villkor 2 (klienten byggd):** en in-kod-konstant `LIVE_READY === true` (default `false` tills
     live-klienten faktiskt är byggd, här T14).

   Lägg den SAMMANSATTA gaten i EN funktion (`isLiveActive(env, liveReady) = isSupabaseConfigured(env)
   && liveReady`) som BÅDE `getDataSource` OCH `getDataSourceMode` (UI-märkningen demo/live) läser, så
   källan och märkningen aldrig kan säga emot varandra. Tre fall, alla **fail-loud** (PRINCIPLES §8):
   live aktivt -> live-källan; env satt men `LIVE_READY` false (interims-läget) -> fixtures + en EGEN
   `console.warn` som förklarar att klienten väntar på sitt bygg-steg; env saknas -> fixtures + den
   vanliga "env saknas"-varningen. De två varningarna är SKILDA så lägena inte förväxlas.
5. **Pinna det enda extra steget som tänder live.** När live-klienten byggs ska BÅDA göras i SAMMA
   ändring: (a) sätt `LIVE_READY = true`, (b) ta bort interims-grenens `console.warn`. Pinna det i
   `docs/decisions.md` och låt ett guard-test (`LIVE_READY ... är false`) BRYTAS medvetet när
   konstanten flippas, så de två stegen inte glöms.
6. Live-klienten laddas via **dynamisk import** (`import('./supabase-client')`) så Rollup inte måste
   lösa ett Supabase-paket som ännu inte är installerat, fixtures-bygget förblir rent.
7. Live-stubben **fail loud:ar** (kastar) vid anrop innan den är byggd, i stället för att returnera
   tyst tom data som ser giltig ut.
8. Injicera BÅDE `env` (default `import.meta.env`) OCH `liveReady` (default `LIVE_READY`) som parametrar
   så gaten + live-grenen kan enhetstestas utan att mocka `import.meta` globalt eller flippa den globala
   konstanten.

**Varför tvåstegs-gate och inte bara env (#37, hotfix):** env kan vara satt INNAN live-klienten är
byggd. Här sattes `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` i Cloudflare (2026-06-09) inför T14,
medan `supabase-client.ts` fortfarande var en medveten fail-loud-stub. En REN env-gate tände därför
live-grenen i produktion (vm-2026.pages.dev) -> stubben kastade i varje `getGroups/getMatches/getTeams`
-> alla vyer visade fel-alerts i stället för matchdata. `LIVE_READY` (en in-kod-konstant, inte en
env-flagga, så den flippas bara genom review + bygge ihop med den riktiga klienten) bevarar fail-loud-
principen (env utan byggd klient SKA inte tyst se ut som live) men flyttar smällen från användarens
ansikte till en `console.warn` tills klienten finns. **Varför fixtures-först över huvud taget:** hela
appen kan byggas och testas innan Supabase-kontot finns (T14), utan kod-ändring vid aktivering.
Fixtures som uppfyller live-typerna fångar mappnings-drift i bygget i stället för att gömma den i en
otestad live-gren. Detta är Agent Kit-playbookens generella "fixtures-först"-mönster konkretiserat för
VM 2026:s React + Vite + Supabase-stack. Källa: T3 (env-gaten), tvåstegs-gaten hotfix #37
(`docs/decisions.md` 2026-06-10).

### harledd-state-vy: ren-derive + hook-med-state + reaktiv-memo (React, VM 2026)

**Recept (en levande vy ovanpå härledd state, inga dubbellagrade beräkningar):**

1. Lägg HÄRLEDNINGEN i en REN, React-fri modul (`src/features/<x>/derive-*.ts`): `(domändata, råa-fakta)
   => härledd-form[]`. Den delegerar till den redan testade domän-funktionen (här `computeStandings`),
   räknar inte om logiken själv (DRY). Muterar aldrig sina argument, så den kan köras om vid varje ändring.
2. En hook (`use-*-data.ts`) laddar EN gång via den etablerade datakällan (`getDataSource(env)`,
   fixtures-seamen), håller de RÅA FAKTA (matcher) i `useState`, och HÄRLEDER den visade formen via
   `useMemo([status, domändata, råa-fakta])`. Lagra ALDRIG den härledda formen i state, det vore
   dubbellagring som kan driva isär. GATA härledningen på `status === 'ready'` (annars `[]`): de råa fakta
   ligger kvar i state under en ny laddning (t.ex. env-byte), och en oavkortad härledning skulle exponera
   STALE form medan status är loading/error (kontraktsbrott, se decisions.md C8). Exponera en `setFakta`-
   sättare så nästa task (inmatning) kopplar in sig, "live" = en `setFakta` triggar en ny memo-härledning
   automatiskt i ready-läget.
3. Modellera laddningstillståndet EXPLICIT (`'loading' | 'ready' | 'error'`), inte bara `data | null`.
   Fel FAIL-LOUD:ar (`role="alert"`), inte en tyst tom vy (PRINCIPLES §8). Vanligast: live-stubben kastar
   före T14, vyn ska visa det.
4. Injicera `env` (default `import.meta.env`) genom hook + vy så datakälle-läget kan testas utan att mocka
   `import.meta` globalt (samma mönster som `getDataSource`). Använd en `cancelled`-flagga i `useEffect` så
   ett state-update inte sker efter unmount.
5. Presentations-komponenten är REN (tar färdig-härledd form, renderar bara). Bygg TILLGÄNGLIG semantik
   (riktig `<table>` med `<caption>`/`<th scope>`, `role="status"`/`role="alert"`), och lämna PREMIUM-
   visuell styling till design-frontend, men gör strukturen lätt att styla: stabil semantik + data-attribut
   (t.ex. `data-qualified`) i stället för inbakade statusfärger (respektera T7-pinnen: accent/success-krock).
6. Test-täckning: vyn renderar rätt antal element (12 grupper), tillgänglig struktur (roller/landmärken),
   den REAKTIVA omräkningen (sätt nya fakta via sättaren -> assertera ny härledd form), fel-vägen
   (datakällan kastar -> `role="alert"`, inga tabeller), OCH kontrakts-invarianten "härledd form tom utom
   vid ready" (assertera `[]` i loading-läget + ett env-byte ready->felande källa som bevisar att den gamla
   formen INTE läcker). Skapa env-objektet EN gång per test (stabil referens): hooken har `useEffect([env])`,
   så ett inline-objekt i renderHook-callbacken ger en ny referens vid varje render och kan trigga om
   laddningen (flaky/loopande test). Wrappa async-settle i `waitFor` så inget state-update sker efter testet
   (act-varning).

**Varför:** SPEC §6:s härledda state hela vägen ut i UI:t. En sanning (de råa fakta), den visade formen
är en ren funktion av dem, så "live" blir gratis och korrekt utan en andra kopia. Hooken äger I/O +
state, den rena modulen äger logiken (testbar fristående), komponenten äger bara presentation (frikopplad,
lätt för design-frontend att ta över). Återanvänds av kommande vy-tasks (slutspelsträd, topplista). Källa:
T5 (`src/features/groups/`: `deriveGroupTables` + `useGroupData` + `GroupTable`/`GroupStageView`).

### gissningskanslig-data-genereras-ur-auktoritativ-kalla-med-validerande-generator (VM 2026)

**Recept (stor, regel-kritisk datatabell utan handknapp och utan gissning):**

1. Hämta den AUKTORITATIVA källan (t.ex. FIFA:s regelverks-PDF) och extrahera ren text
   (`pdftotext -layout fil.pdf out.txt`). **COMMITTA det råa textutdraget** (den relevanta sektionen)
   som en fil i repot, med en preambel som bär källans URL + avsnitt/sida + extraktionskommando, så
   en människa kan spot-checka utdraget mot källan och CI kan regenerera ur det.
2. Lägg parsnings-/validerings-/emit-logiken i en **typad, ren modul** (sträng in, sträng ut, inga
   IO-beroenden) som BÅDE generator-skriptet OCH källankrings-testet importerar (EN sanning, ingen
   duplicerad parser). Generator-skriptet (`scripts/generate-<tabell>.ts`, körs via ett npm-script som
   drar `vite-node`, t.ex. `npm run gen:third-place-table`) är en tunn CLI ovanpå modulen: läs committat
   utdrag, bygg, skriv. `vite-node` följer med projektets toolchain (via vitest) och kör `.ts` direkt på
   repo:ts Node 22 (CI), så scriptet är återkörbart utan Node 24:s native `.ts`-type-stripping. Parsa med
   strikt regex (matcha radens form exakt, ignorera sidbrytnings-/rubrik-brus).
3. **VALIDERA före emit** och faila högt vid fel (kasta i modulen / `process.exit(1)` i CLI:n):
   rätt antal rader, varje rad välformad, inga dubbletter, hela domänen täckt (t.ex. alla C(n,k)
   kombinationer). Hellre stopp än fel data.
4. Emitta en **GENERERAD .ts-fil** med ett filhuvud som (a) säger "redigera inte för hand, se
   generatorn", (b) **källhänvisar inline** (källans namn + avsnitt/sida + URL), (c) förklarar
   kolumn-/rad-semantiken. Committa generatorn, den rena modulen, det råa utdraget OCH .ts-filen.
5. **KÄLLÅNKRA tabellen, inte bara strukturen.** Skriv ett test som REGENERERAR tabellen ur det committade
   utdraget och kräver VÄRDE-likhet med den committade .ts-filen (radslut-normaliserat, fail loud vid minsta
   skillnad). Strukturella invarianter (form, fullständighet, behörighet) räcker INTE: om källan är en-till-en
   men dina invarianter är en-till-många passerar ett transkriptions-/parsnings-fel mitt i tabellen tyst (se
   lärdomen `uttommande-test-vaktar-svagare-invariant-an-kallan-faststaller`). Lägg dessutom ett
   **mutationstest** som byter ett värde på en mittrad och bevisar att källankringen FAILAR (annars vet du
   inte att låset funkar). Behåll gärna det strukturella integritetstestet som snabb extra grind.
6. Bygg konsumenten (motorn) på ett förbyggt O(1)-index över tabellen och **fail loud** om en giltig
   nyckel ändå saknas (skulle bara hända vid trasig tabell, som testet utesluter).

**Varför:** En stor regel-tabell (här FIFA:s Annexe C, 495 rader) är för felkänslig att skriva för
hand och omöjlig att review:a snabbt. Genom att generera ur ett COMMITTAT källutdrag och kräva värde-likhet
i CI blir datan spårbar, regenererbar och låst till källans faktiska värden, och reviewern kan BEKRÄFTA den
mot källan i stället för att jaga den. Detta uppfyller källhänvisnings-kravet (HARD) för gissningskänslig data.
Källa: T4 (treeplats-tabellen, `scripts/generate-third-place-table.ts` + `src/domain/bracket/annexe-c-parser.ts`
+ committat `annexe-c-source.txt` -> `src/domain/bracket/third-place-table.ts`, källankrat av
`third-place-table-source.test.ts`).

**Andra användningen (T4b, #31, matchtablån):** samma recept tillämpat på VM 2026:s matchplan
(`src/data/wc2026/tv-schedule-source.txt` -> `match-schedule-parser.ts` -> `matches.ts`, källankrat
av `match-schedule-source.test.ts` med mutationstest). Två lärdomar värda att lyfta för återanvändning:
- **Emittera i projektets Prettier-stil direkt** (här single-quote-strängar via en liten `tsString`-
  hjälpare, inte `JSON.stringify` som ger double quotes). Annars blir den genererade filen `format:check`-
  röd ELLER så normaliserar `prettier --write` den och driver isär från generatorns output, vilket bryter
  regenerera-och-diffa-låset. Emit + Prettier måste ge samma bytes.
- **Mutationstestet kan vara enkelt** när källan har många oberoende värden: byt ETT värde (här första
  "(TV4)" -> "(SVT)") och bevisa att diffen failar. Det räcker som bevis att låset fångar fel; det
  behövs ingen behörighets-bevarande swap som i Annexe C (där den strukturella valideringen var stark).

**Tredje användningen (T10, #10, lag-profiler):** samma recept tillämpat på lag-profil-datan
(FIFA-ranking + stjärnspelare + kuriosa per lag): `src/data/wc2026/team-profiles-source.txt` (källutdrag
med URL:er + hämtdatum + radvis data per lag) -> `team-profiles-parser.ts` -> `team-profiles.ts`,
källankrat av `team-profiles-source.test.ts` (regenerera-och-diffa + 2 mutationstest + 48/48-täckning).
Tre saker värda att lyfta för nästa data-task:
- **Prettier-emit har FLER regler än bara quote-typ.** Utöver `tsString` (single quotes) krävde denna
  tabell två till för att emit == `prettier --write` (annars bryts diff-låset): (a) OKVOTERADE objekt-
  nycklar när nyckeln är ett giltigt JS-identifierare (Prettier skriver `mex:`, inte `'mex':`), och (b)
  RADBRYTNING av ett `nyckel: 'långt värde',` som överskrider print-bredden (100) till `nyckel:\n
  '...',`. Replikera den regeln i emit (`emitStringField`), och byt till DOUBLE quotes för en sträng som
  innehåller apostrof men inget citationstecken (Prettiers val, t.ex. `"N'Golo Kanté"`). Verifiera alltid
  med `prettier --check` på den genererade filen INNAN testet, så låset inte är fördröjt-rött.
- **Drift-vakten ska gå åt BÅDA håll.** `buildProfileTable` failar både om ett lag i teams.ts saknar
  profil OCH om en profil saknar lag (48/48), så datan aldrig tyst blir ofullständig eller föräldralös.
  Profilerna vävs sedan in i `WC2026_TEAMS` (`enrichWithProfile`), en sanning, inget dubbellagrat.
- **Källhänvisnings-krav (HARD) uppfyllt + ett ärligt-tomt-fält.** FIFA-rankingen (gissningskänslig)
  verifierades mot flera källor (ESPN + Wikipedia + whereig, aprilutgåvan 2026), stjärnspelare mot de
  släppta trupperna (redaktionellt urval men bevisligen i truppen). "Bästa speldraget" (SPEC §6:s
  `bestPlay`) var subjektivt utan källa och LÄMNADES TOMT (låst av test), i stället för att gissas, med
  FIFA-rankingen som verifierbar styrke-signal i profil-vyn. Se decisions.md T10.

### klickbar-entitet-oeppnar-en-delad-modal-overlay-fran-var-som-helst (React, VM 2026)

**Recept (ett element i flera vyer öppnar EN delad detalj-modal, utan prop-drilling):**
1. LYFT "vad är öppet?" till en EGEN context (`team-profile-context.ts`: kontrakt + context +
   `useTeamProfile`-hook), skild från data-storen. Hooken FAIL-LOUD:ar utan provider (ett klickbart
   element utan provider är ett wiring-fel, inte ett tillstånd att maskera med tyst no-op, PRINCIPLES §8).
2. En PROVIDER (`TeamProfileProvider.tsx`) håller `openId`-state + open/close OCH renderar modalen EN
   gång i trädet, så vyerna bara wrappar sig själva en gång och får både "öppna"-seamen och overlayn
   (samma form som ResultsProvider). Ligger INNANFÖR data-providern om modalen läser den delade storen.
3. En ÅTERANVÄNDBAR TRIGGER-komponent (`TeamNameButton.tsx`): en RIKTIG `<button>` (inte en klickbar
   `<span>`) med ett explicit `aria-label` ("Visa lagprofil för X"), så den nås med tangentbord och har
   rätt roll. Degraderar till ren `<span>` när entiteten är okänd (id null), så vi aldrig erbjuder en
   knapp som inte gör något. Inkopplad i flera vyer (matchkort + tabell) utan att de känner till modalen.
4. MODALEN (`TeamProfilePanel.tsx`) är en KORREKT a11y-dialog: `role="dialog"` + `aria-modal` +
   `aria-labelledby` (rubriken), Escape/stäng-knapp/bakgrundsklick stänger (panelen `stopPropagation`:ar
   så ett klick i den inte bubblar till overlayns onClose), fokus flyttas IN vid öppning (stäng-knappen,
   stabil startpunkt) och ÅTERSTÄLLS till öppnaren vid stängning, plus en enkel fokus-fälla (Tab cyklar
   inom dialogen). Innehållet HÄRLEDS av en ren funktion (`deriveTeamProfile`) och saknad data visas
   ärligt ("Data saknas"), aldrig gissat. Stabil semantik + data-attribut (`data-team-profile-panel/
   -overlay/-trigger`, `data-profile-ranking/-stars/-trivia/-path`) som design-frontend stylar ovanpå.
5. TÄCKNING: trigger (öppnar rätt id, null -> ej knapp), navigering (öppna från BÅDA vyerna), dialog
   (stäng på 3 sätt, aria-modal + fokus-flytt), edge (okänt id -> ingen dialog, saknad data -> "Data
   saknas"), och fail-loud utan provider. Isolerade komponent-tester (MatchCard/GroupTable) wrappas i en
   minimal context-STUB (`src/test/team-profile-stub.tsx`) så de slipper montera hela modal-/store-kedjan.

**Varför:** "Klicka på lag -> profil" (SPEC §4) ska nås från matchkort OCH tabeller utan att varje vy
prop-drillar en callback. En delad context + en återanvändbar trigger + en modal-en-gång ger det med låg
koppling, och fail-loud-hooken gör en glömd provider till ett synligt fel. En MODAL (inte en routad vy)
är KISS i en router-lös PWA: en snabb titt ovanpå nuvarande vy, ingen URL-navigering att bygga. Källa:
T10 (`src/features/team-profile/`).

### svensk-vaggklocka-till-utc-via-iana-zon-inte-hardkodad-offset (VM 2026)

**Recept (lagra ett lokalt klockslag som rätt UTC-instant, off-by-one-säkert):**
1. Källans tid är en LOKAL väggklocka (här Europe/Stockholm). `Match.kickoff` lagras i UTC, UI:t
   formaterar tillbaka. Härled offset:en ur IANA-zonen vid själva instanten via
   `Intl.DateTimeFormat(..., { timeZoneName: 'longOffset' })` (ger "GMT+02:00"), INTE en hårdkodad +2.
2. Bygg väggklockan som om den vore UTC (`Date.UTC(...)`), dra av offset:en, och korrigera ett steg om
   instanten hamnar på andra sidan en DST-gräns än startgissningen (`zonedWallTimeToUtcIso`).
3. Testa explicit ett MIDNATTS-fall: "00:00 lokal tid" ska ge UTC-instanten DAGEN INNAN (+2-zon), och
   en rundtur tillbaka till lokal tid ska ge samma kalenderdatum/klockslag som källan. Testa även ett
   vinterdatum (+1) för att bevisa att offset:en härleds, inte hårdkodas.

**Varför:** Känd fälla `utc-datum-anvant-som-lokalt-datum`: `toISOString()`/UTC rakt av på ett lokalt
klockslag ger off-by-one kring midnatt. IANA-härledning är korrekt även om datan korsar en DST-gräns.
Återanvänds av daglig matchvy (T-serien) som visar avsparkstid i svensk tid. Källa: T4b
(`src/data/wc2026/match-schedule-parser.ts`, `zonedWallTimeToUtcIso`).

### inmatning-mot-delad-store-som-haerledd-state-uppdaterar (React, VM 2026)

**Recept (ett inmatnings-UI uppdaterar härledda vyer via EN delad sanning):**

1. LYFT den RÅA SANNINGEN (här matchlistan) till en DELAD store via React-context
   (`src/features/results/`: `results-context.ts` = kontrakt + context + `useResultsStore`-hook,
   `ResultsProvider.tsx` = seedning + state + mutatorer). Inte lokal vy-state, annars kan bara EN vy
   ändra den. Providern SEEDAR via `getDataSource(env)` (fixtures-först-seamen, samma env-gate), håller
   sanningen i `useState`, och fail-loud:ar seed-fel (status 'error' + meddelande, inte tyst tom).
2. Alla härledda vyer LÄSER samma store och härleder sitt (T5:s `useGroupData` blev en tunn konsument:
   `useResultsStore()` + `useMemo(deriveGroupTables, [status, groups, matches])`, gatad på `ready`).
   Lagra ALDRIG den härledda formen, härled den, så en inmatning -> ny matchlista -> alla vyer räknar
   om automatiskt (en sanning, ingen dubbellagring).
3. EXPONERA skriv-seam på storen: ett HÖGNIVÅ `submitResult(id, entry)` (validerar + optimistisk
   uppdatering, för UI:t) OCH ett LÅGNIVÅ `setMatches` (för T18:s realtid + tester). T14 (persistens)
   byter `submitResult`-implementationen mot en server-skrivning, T18 prenumererar och anropar
   `setMatches`, allt på SAMMA seam utan att röra konsumenterna.
4. `useResultsStore` KASTAR utan provider (fail loud): en konsument utan provider är ett wiring-fel,
   inte ett tillstånd att maskera med tom data. (Testa: `renderHook(useResultsStore)` utan wrapper kastar.)
5. submitResult validerar mot matchens NUVARANDE status via en `matchesRef` (uppdaterad i en effekt),
   INTE som sido-effekt inne i en state-uppdaterare (det är inte garanterat synkront, ett anti-mönster).
   Reffen uppdateras direkt vid en lyckad skrivning så två snabba submit i följd båda ser senaste listan.
6. VALIDERING i en REN modul (`validate-result.ts`) som returnerar `{ ok: true } | { ok: false; errors }`
   (kastar INTE): så ALLA fel visas samtidigt och kopplas till fält via aria. Den rena reducern
   (`apply-match-result.ts`) validerar IGEN (skyddsnät) och kastar vid ogiltig data, så ett brutet
   flöde aldrig korrumperar sanningen. Sätt `noValidate` på formen så DIN validering (svenska meddelanden
   + aria) är sanningen, inte native constraint-bubblor (de blockerar submit innan din validering kör).
7. Test-täckning: validering (icke-negativa heltal: -1/1.5/NaN/Infinity, status<->resultat-kontraktet,
   uttömmande status-övergångar), reducern (ny array-referens, oförändrade element behåller referens,
   status-backning nollar resultat, fail-loud på okänt id/ogiltig data), storen (seedning, fail-loud
   utan provider, submitResult lämnar listan orörd vid fel), OCH det viktigaste: ett INTEGRATIONSTEST
   som monterar inmatnings-vy + härledd vy under SAMMA provider och bevisar att ett sparat resultat
   ändrar den härledda tabellen (rad-scopat via `rowheader` + `within(row).getAllByRole('cell')`,
   stabilt kolumnindex, samma teknik som T5).

**Varför:** SPEC §6:s härledda state med ett SKRIV-lager: inmatningen är den enda mutationen, allt annat
(tabeller, snart slutspelsträd) är rena funktioner av matchlistan, så "live" blir gratis och korrekt
utan en andra kopia. Den delade storen är den minsta lösningen som låter flera vyer dela en sanning utan
prop-drilling, och designar in T14/T18 på samma seam. Generaliserar T5:s "härledd-state-vy" med en delad
källa + valideringsgrind. Källa: T6 (`src/features/results/`).

### maalfirande-krok-som-seam-design-aeger-visuellt (React + motion, VM 2026)

**Recept (en effekt-/glädje-animation där FUNKTION och VISUELL polish ägs av olika lager):**
1. Lägg NÄR + a11y + timing i en KROK (`useGoalCelebration`): den avgör triggern (här: match blir
   finished med minst ett mål), hoppar firandet vid `useReducedMotion()` (WCAG 2.3.3, ingen overlay tänds),
   auto-avklingar via en timeout (rensad vid nytt firande/unmount), och ger ett UNIKT `key` per firande
   (matchId + en räknare) så det visuella lagret re-mountar och spelar om även för samma match.
2. Exponera ett `renderCelebration`-RENDER-PROP (aria-hidden slot) på vyn där DESIGN-FRONTEND lägger den
   visuella premium-animationen (konfetti/mål-pop, bygger på T2:s motion-primitiver). Default = inget
   visuellt lager, så vyn är funktionellt komplett utan det (firandet är ren glädje-yta).
3. Test: mocka `motion/react`s `useReducedMotion` (samma mönster som motion-primitives-testet), använd
   `vi.useFakeTimers` för auto-avklingen, och asserta: tänds vid mål, unikt key per firande, avklingar
   efter sin varaktighet, dismiss stänger, INGET firande vid 0-0 och INGET vid reducerad rörelse.

**Varför:** Frikopplar "när det firas + tillgänglighet" (senior-dev, deterministiskt + testbart) från
"hur det ser ut" (design-frontend), så animationen kan göras premium utan att röra trigger/timing/a11y.
Render-propet är seamen mellan lagren. Källa: T6 (`src/features/results/goal-celebration.ts` +
`ResultEntryView.tsx`).

### fargoberoende-framhavning-nar-tva-roller-delar-hue (design, VM 2026)

**Recept:** När en zon ska framhävas men en token-roll den vill använda KAN sammanfalla med en annan
roll i något tema (i VM 2026: `--vm-accent` === `--vm-success` === #0e7a44 i ljust tema), framhäv med
FLERA samtidiga signaler som INTE är beroende av att färgerna skiljer sig:
1. FORM/markör (här en placerings-medalj med ring i `--vm-gold` / fg-ton),
2. KANT eller list (här `inset box-shadow` mot `--color-accent`),
3. YT-ton (svag `color-mix(... accent 7% ...)` bakom raden),
4. AVDELARE/typografi (tjockare gräns vid "snittet", starkare vikt på nyckeltalen).
Håll texten/siffran i framhävnings-markören på full `--color-fg`-kontrast, låt rollens hue leva i
bakgrund + kant, så markören är AA oavsett hue-kollision. Behåll en stabil `data-*`-hake (här
`data-qualified`) + `sr-only`-text så a11y och framtida färgläggning hänger ihop.
**Varför:** En framhävning som BARA är en färg går sönder (osynlig eller tvetydig) i det tema där två
roller delar hue, och låser dessutom den andra rollen från att få en egen ton senare. Redundanta,
färg-oberoende signaler läses i båda teman och låter en senare task färglägga fritt utan att bryta
designen. Verifiera i webbläsaren att kollisionen är LIVE (läs `getComputedStyle` på `--vm-accent` vs
`--vm-success`) och att zonen ändå läses. Källa: T5 design-frontend (`src/features/groups/GroupTable.tsx`,
kvalificeringszonen, T7-pin).

**Andra användningen (T7, daglig matchvy):** samma princip för "Dagens match"-framhävningen, men en
viktig SKÄRPNING värd att lyfta: **solid fyllning + mörk text slår färg-på-tint** för ett litet
text-märke. Ett "DAGENS MATCH"-chip med GULD-TEXT på en 18% guld-tint föll under AA på den ljusa ytan
(uppmätt 2.97:1), medan SAMMA chip som en SOLID guld-bricka (`background: var(--vm-gold)`) med mörk
ink-text (`#1c1403`) gav garanterad AA i båda teman (5.03:1 ljust / 10.90:1 mörkt), eftersom guld är
ljus/mellanljus i båda temana. Regel: när en framhävnings-roll ska bära LITEN TEXT, gör den till en
solid bricka med kontrast-säker text, lägg inte rollens hue i texten mot en svag tint. Verifiera
alltid den uträknade kontrasten i webbläsaren (composita tint:ens alfa mot ytan bakom, annars räknar
du fel ratio). Källa: T7 design-frontend (`src/features/daily/MatchCard.tsx`, featured-varianten).

### premium-hero-med-reduced-motion-saker-css-dekor-och-no-cls-nedrakning (design, VM 2026)

**Recept (en levande "WOW"-hero som inte bryter a11y eller Core Web Vitals):**
1. STÄMNING via lager-gradienter på EN yta: en mörk grundyta + två radiella ljus (här pitch-grön ur
   ena hörnet, varm guld ur det andra) via `radial-gradient(... rgb(var(--vm-glow-accent) / 0.16) ...)`
   och `color-mix(... var(--vm-gold) ...)`. Allt via tema-token-RGB-delar (`--vm-glow-accent`) /
   `color-mix`, aldrig rå hex, så stämningen följer temat.
2. RÖRELSE som dekoration, INTE som JS: ett långsamt ljus-svep (`@keyframes` som flyttar
   `background-position`) på en `aria-hidden`-overlay + en pulsande "live"-prick (`@keyframes` på
   opacity/scale). Lägg keyframes i `index.css`. OBS: den globala
   `@media (prefers-reduced-motion: reduce)`-regeln (`animation-duration: 0.01ms` +
   `iteration-count: 1`) räcker INTE för hero-animationerna, den kör animationen en gång till SLUT
   nästan momentant, så keyframesen landar på sitt 100 %-läge (slutläget), inte sitt första steg.
   För `vm-sheen` är 100 % `background-position: 140% 0%`, dvs svepet fryser mitt i/utanför fonden i
   stället för i ro. Designintentet är en HELT statisk hero, så de dekorativa hero-animationerna
   nollas EXPLICIT med `animation: none` på `.vm-hero-sheen` / `.vm-live-dot` (se `src/index.css` +
   decisions.md C5-blocket 2026-06-10), utan en egen JS-grind. Verifiera LIVE genom att emulera
   reduced-motion och läsa `getComputedStyle(...).animationName` (ska bli `none` på hero-elementen).
3. NEDRÄKNING utan layout-hopp (CLS=0): rendera siffror med `tabular-nums` OCH en fast `min-width` per
   enhet (en "tile"), så bredden aldrig ändras när 9 -> 10 eller sekunder tickar. Den rena
   tick-logiken (computeCountdown) ligger kvar i hooken; design rör bara presentationen.
4. RESPONSIVT: hero:n är `flex-col` på mobil (nedräkning över featured-kortet), `lg:flex-row` på
   bred skärm. Verifiera att inget barn är bredare än viewporten på 360px (mät `scrollWidth` vs
   `clientWidth` på `documentElement`, och leta efter element vars `getBoundingClientRect().right`
   sticker ut).

**Varför:** "Levande" får aldrig betyda "rörig för den som valt minska rörelse" eller "hoppig LCP/CLS".
Den svepande globala reduced-motion-regeln fryser keyframes på sitt slutläge (inte stänger av dem), så
dekor-rörelsen måste nollas EXPLICIT med `animation: none` för att hero:n ska bli helt statisk (en
sanning ägd av decisions.md C5), och `tabular-nums` + fast tile-bredd gör en
sekund-tickande nedräkning till en nollkostnad för CLS. Återanvänds av kommande hero/levande vyer
(slutspelsträd, topplista). Källa: T7 design-frontend (`src/features/daily/DailyMatchesView.tsx` +
`vm-pulse`/`vm-sheen` i `src/index.css`).

### lag-identitet-utan-asset-beroende-och-kanal-badge-med-fg-kontrast (design, VM 2026)

**Recept (visuell identitet på matchkort utan att offra prestanda eller a11y):**
1. LAG-EMBLEM utan nätverk: generera en deterministisk tvåtons-disc ur lagets FIFA-landskod
   (en liten FNV-hash -> två hue-grader ~140 grader isär, HSL med MÅTTLIG mättnad/ljushet ~34-42% L).
   Inga flaggbilder (48 nät-hämtningar = LCP/CLS-risk) och inga emoji-flaggor (renderas inte på
   Windows). Discen är `aria-hidden` (ren dekoration, redundant - lagnamnet finns som text bredvid),
   så AA-krav gäller inte; uppmätt min-kontrast för vit text är ~2.7:1 vid ljusaste hue. Bytbar mot
   riktig flagg-data senare utan att röra kortet.
2. KANAL-BADGE som skummas: ge kanalen ett eget märke (prick + namn) med kanalens egen ton i
   BAKGRUND + KANT + PRICK, men håll TEXTEN på `var(--color-fg)` (uppmätt 15.10:1 ljust / 13.23:1
   mörkt), så badgen läses skarpt oavsett kanalfärg. Okänd kanal faller tillbaka på en neutral fg-ton.
**Varför:** Ett matchkort utan lag-identitet blir en textrad; en deterministisk disc ger varje lag en
igenkännbar signatur till noll prestanda-kostnad. Kanal-tonen i bakgrund/kant (inte i texten) ger
kanal-igenkänning utan att riskera en låg färg-på-färg-kontrast. Källa: T7 design-frontend
(`src/features/daily/TeamFlag.tsx` + `TvBadge.tsx`).

### deterministiskt-haerlett-dekor-tema-som-seam-kontrast-saekert (VM 2026)

**Recept (en datadriven färgton som ALDRIG kan sänka läsbarhet, med funktion och visuellt åtskilt):**

1. HÄRLEDNINGEN i en REN modul (`src/features/<x>/<x>-theme.ts`): `(domändata, uppslag, ev. nyckel)
   => { hue: number | null; source; ... }`. Deterministisk: samma indata ger alltid samma ton. När
   tonen ska väga flera bidrag (här: alla lag som spelar dagen), använd **cirkulärt medel** (vektor-
   medel på färghjulet via `cos/sin` + `atan2`), INTE aritmetiskt medel, det senare wrappar fel kring
   0/360 (medel av hue 5 och 355 ska bli ~0, inte 180). Cirkulärt medel är dessutom ordnings-oberoende,
   så en stor uppsättning (premiärdag) ger en stabil ton utan en godtycklig "första elementet"-regel.
   OBS det degenererade randfallet: tar bidragen exakt ut varandra (antipodala hues, vektorsumma ~0)
   finns ingen medelriktning, välj en ORDNINGS-OBEROENDE tie-break (t.ex. `Math.min` av hues), INTE
   `hues[0]` som beror på insamlingsordningen och bryter ordnings-oberoendet för just det paret.
   ÅTERANVÄND en redan etablerad härledningsregel om en finns (här `hueFromCode`, lyft ur TeamFlag till
   delade `team-hue.ts` så lag-färgen är EN sanning i både discen och dags-temat, inte två kopior).
2. KONTRAST-VAKTEN ÄR ARKITEKTUREN, inte en efterkontroll: låt den härledda tonen BARA vara ett TAL
   (en hue-grad) i en CSS-variabel (`--vm-day-hue`) som uteslutande väver in i DEKORATIVA ytor
   (gradienter, glow). Den får ALDRIG bli en text-/yt-/kant-token. En ton som per konstruktion aldrig
   är en textfärg KAN inte sänka text-kontrasten under WCAG AA, det finns ingen text på den. Bevisa det
   med TVÅ komplementära test: (a) en DOM-vakt som assertar att läsbarhets-bärande element (matchkort)
   ALDRIG SÄTTER variabeln/attributet, bara dekor-ytan gör; (b) en DOM-OBEROENDE KÄLL-SCAN som läser
   källfilerna och failar om `var(--vm-day-hue)` KONSUMERAS utanför dekor-ytans scope (`.vm-daily-hero*`).
   DOM-vakten ensam räcker INTE: dekor-ytan sätter variabeln inline och CSS-custom-properties ÄRVS nedåt,
   så ett kort som RENDERAS inuti dekor-ytan (här "Dagens match" inne i hero:n) skulle tyst ärva tonen
   om en framtida kort-CSS-regel LÄSTE den, och en DOM-vakt som bara läser inline-style vore ändå grön.
   Käll-scannen vaktar KONSUMTIONEN i koden, DOM-vakten vaktar SÄTTNINGEN i DOM.
3. EDGE-FALL explicit, alla testade: tom indata (vilodag) -> default/ingen ton (ytan behåller bas-temat);
   data utan användbart bidrag (slutspel innan seedningen, bara okända lag) -> en dokumenterad fallback
   (här hue ur datum-nyckeln) så ytan ändå känns distinkt, ALDRIG en gissning om saknad data; ogiltig data
   (brutet referens-kontrakt, ett satt id som saknas i uppslaget) -> FAIL LOUD (kasta med id i meddelandet),
   maskera inte tyst (lessons `tyst-maskerande-fallback`).
4. SEAMEN är en tunn hook (`use-<x>-theme.ts`): memoiserar härledningen och returnerar `style` (CSS-var)
   + stabila data-attribut att SPREADA på dekor-ytan. Senior-dev äger NÄR/HUR tonen härleds (deterministiskt,
   testbart, kontrast-säkert); design-frontend äger HUR den ser ut (bygger gradienten ur hue:n i CSS-tokens).
   Samma lager-uppdelning som målfirande-kroken.
5. ÖVERGÅNGAR via en CSS-transition på dekor-ytans `[data-*]`-hake, gatad på
   `@media (prefers-reduced-motion: no-preference)`, så den befintliga reduced-motion-grinden nollar den.
   Ingen egen JS-grind (WCAG 2.3.3 gratis).

**Varför:** "Färg/motiv byter efter dagens lag" (SPEC §7) får ALDRIG bli läsbarhets-sänkande. Genom att
tvinga ut den dynamiska tonen i en ren dekor-variabel är kontrast-säkerheten en INVARIANT i koden, inte
något som måste mätas om för varje genererad ton. Den rena härledningen är fristående testbar (determinism,
wrap, edge-fall, fail-loud), och seam:en låter design färglägga fritt utan att kunna bryta a11y. Källa: T8
(`src/features/daily/team-hue.ts` + `day-theme.ts` + `use-day-theme.ts`, inkopplad på DailyMatchesView-hero:n,
dekor-token i `tokens.css` sektion 6).

### harlett-slutspelstrad-tre-lagen-ovanpa-en-verifierad-seednings-motor (VM 2026)

**Recept (ett LEVANDE slutspelsträd som ren funktion av matchresultaten, utan att gissa en regel):**

1. ÅTERANVÄND den verifierade strukturen + seedningen, bygg INTE om. En källhänvisad positions-struktur
   (`bracket-structure.ts`, FIFA Article 12) + tree-grafen (`build-bracket.ts`) + treplats-seedningen
   (`seedThirdPlaces`/Annexe C) finns redan (T4). Härledningen LIGGER OVANPÅ den och definierar ingen ny
   strukturell slutspelsregel, den fyller bara lag-tillståndet (PRINCIPLES §4).
2. HÄRLEDNINGEN i en REN modul (`derive-bracket.ts`): `(grupptabeller, matcher) => BracketState`. Tre
   datadrivna lägen per slot, INGEN gissning: (a) gruppspel pågår -> `possible` + en positions-etikett
   ("1:a grupp E", "3:a A/B/C/D/F" EXAKT ur strukturens eligibleGroups, inte spekulation om kvalificering);
   (b) grupperna klara -> `resolved` till riktiga lag (gruppvinnare/tvåa ur tabellerna + de 8 bästa treorna
   via seedningen); (c) slutspelsresultat -> vinnaren propagerar. Bygg slotarna i MATCH-ORDNING (M73->M104):
   eftersom en match alltid kommer efter sina föregångare i FIFA-numreringen är föregångar-utfallet redan
   beräknat när du når en match-progressions-slot, så EN passering propagerar vinnare genom hela trädet.
3. LÅSNINGEN härleds, inte ur ett flagg-fält: `isGroupStageComplete` = alla 12 grupper har varje lag på 3
   spelade matcher (`played >= 3`), en ren funktion av sanningen. Först då seedas treorna (annars stannar
   bästa-trea-slotarna i `possible`-läget). `qualifyingGroups` är null tills rangordningen är komplett
   (en trea per grupp, alla A-L representerade), så
   seedThirdPlaces (som fail-loud:ar på fel antal) aldrig anropas på en ofullständig gissning.
4. VINNAR-PROPAGERING via en ren `outcomeOf(match, home, away)`: ordinarie mål avgör, vid lika avgör
   straffar (FIFA Article 14); en lika match UTAN avgörande straffar ger INGEN vinnare (fail-safe, propagera
   aldrig en gissning). Bronsmatchen matas av `match-loser` (semifinal-förlorarna), final av `match-winner`.
5. SEAM: hooken (`use-bracket-data.ts`) är en tunn konsument av den DELADE results-storen (samma sanning som
   gruppspel + inmatning), härleder via `useMemo` gatad på `status === 'ready'` (samma stale-kontrakt som
   useGroupData, C8). Vyn (`BracketView`) renderar stabil semantik (region per runda, slot som list-rad) +
   DATA-ATTRIBUT (`data-bracket-round/-match/-slot`, `data-slot-resolution`, `data-winner`,
   `data-bracket-locked`, `data-bracket-scroll`) som design-frontend bygger premium-trädet + vinnar-
   animationen ("drag fram vinnaren") ovanpå, utan att röra härledningen. Responsiv-förberedd:
   `overflow-x-auto` + fasta rund-kolumner (horisontell scroll på mobil, inget kläms ihop).
6. TÄCKNING: enhetstesta härledningen i alla tre lägen + fel-vägar (lika utan straffar, ofullständigt
   gruppspel), OCH ett LIVE-integrationstest som monterar vyn under storen, seedar ett fullständigt
   gruppspel (bevisar låsning + kollisionsfri Annexe C-seedning) och ett slutspelsresultat (bevisar att
   vinnaren förs fram till nästa slot), allt via samma `setMatches`-seam som inmatningen.

**Källhänvisnings-krav (HARD) för gissningskänslig data:** två FIFA-regler källhänvisades INNAN koden
skrevs och committades verbatim i `src/domain/bracket/fifa-knockout-rules-source.txt` (pdftotext-utdrag ur
FWC2026-regelverket): (1) rankningen av grupptreorna -> de 8 bästa (Article 13, ENBART övergripande a-c,
INTE inbördes head-to-head eftersom treorna aldrig mötts), (2) straffar i slutspel (Article 14). Så
reviewern kan BEKRÄFTA reglerna mot källan i stället för att jaga dem.

**Varför:** SPEC §5+§6 kräver ett träd som justeras under gruppspelet, låses korrekt vid grupp-slut (den
ökända felkänsliga seedningen) och för fram vinnaren. Genom att göra trädet till en ren funktion av en enda
sanning (matchlistan) ovanpå den redan verifierade, källhänvisade seednings-motorn blir "live" gratis och
korrekt, och den kritiska FIFA-regeln kan aldrig drifta isär från koden. Generaliserar T5/T6:s "härledd-
state-vy" till en andra härledd vy på samma delade store. Källa: T9 (`src/features/bracket/` +
`src/domain/bracket/rank-third-places.ts`).

### premium-bracket-ovanpa-data-attribut-seam-med-intensitet-mot-finalen (design, VM 2026)

**Recept (ett vackert, läsbart slutspelsträd som stylas ENBART via seamens data-attribut):**

1. STYLA OVANPÅ SEAMEN, rör aldrig semantiken. En dedikerad feature-CSS (`bracket.css`) + klass-hakar i
   vyn hänger ALLT på senior-devs stabila data-attribut (`data-bracket-round/-match/-slot`,
   `data-slot-resolution`, `data-winner`, `data-bracket-scroll/-locked`). Resultat: alla regioner,
   rubrik-hierarkin, `<ul>/<li>`-slots och aria-labels står kvar, alla tester gröna. Inga råa hex,
   bara `color-mix`/tema-token, så trädet är troget BÅDA teman.
2. INTENSITET SOM BYGGER MOT FINALEN ger trädet riktning: en numrerad runda-marker (1->6) i rubriken,
   semifinalens kant tar lite accent, och FINALEN får en signatur (guld-kant + guld-tint + guld-glow
   via `color-mix(... var(--vm-gold) ...)`). Vertikalt centrerade rund-kolumner (`justify-content:
   center`) ger träd-känslan (senare rundor möter sina föregångare på mitten) + en subtil
   kopplings-affordans (en `::after`-feeder-linje per kolumn, utom de yttersta). Ärlig: fejkar inte
   exakt bezier-geometri som den platta kolumn-datan inte bär.
3. VINNAR-FRAMHÄVNING FÄRG-OBEROENDE (T7/T8-pin): stapla form + yta + ikon + vikt, aldrig bara färg.
   `[data-winner]` -> accent-kant-bar (`box-shadow: inset 3px 0 0`) + accent-tint-yta + en medalj-bock ✓
   (CSS-pseudo `::after` på en namn-span, så TSX-semantiken inte rörs) + fet text. Bevisat i reduced-
   motion att markörerna står kvar medan rörelsen nollas -> vinnaren syns i gråskala/för färgblinda.
4. AVANCERINGS-ANIMATION = CSS, inte JS (samma motgift som hero:n): en engångs glow-puls + medalj-pop
   (`@keyframes`), noll layout-påverkan (CLS=0). Den globala reduced-motion-regeln räcker INTE (fryser
   keyframes på slutläget), så bracket-rörelsen nollas EXPLICIT med `animation: none` vid
   `prefers-reduced-motion: reduce`. Verifiera live: `getComputedStyle(...).animationName === 'none'`.
5. SCROLL SOM FEATURE: trädet är brett, så mobil scrollar i sidled (seamens `overflow-x-auto`) med mjuka
   edge-fade-masker (`mask-image: linear-gradient(...)` mot tema) + en "Svep i sidled →"-hint som döljs
   `>= 1024px`. Verifiera 280/360/768/1024/1440px: NOLL sid-overflow (dokumentet scrollar aldrig
   horisontellt, bara bracket-containern), ingen nod sticker ut förbi viewporten.
6. AA UPPMÄTT, ALDRIG PÅSTÅTT, i BÅDA teman (canvas-komposit-metoden, lessons `aa-kontrast-pastad...`):
   mät på faktiskt renderad yta (komposita halvgenomskinliga tints mot effektiv bakgrund). KÄND fälla:
   guld-text på vit yta faller under AA i ljust tema (här 3.29:1). Motgift = en SOLID guld-bricka med
   near-black ink (`#1c1403`), samma mönster som "Dagens match"-chippet (T7-pin), 5.03:1 ljust /
   ~10.9:1 mörkt. När en framhävnings-roll bär liten text: solid bricka + kontrast-säker ink, aldrig
   rollens hue i texten mot en svag tint.

**Varför:** "Träd ska kännas designade, inte genererade" (SPEC §7), och det är skärmen folk visar för
kompisar. Genom att styla på data-attribut-seamen kan trädet bli premium utan att riskera senior-devs
härledning eller a11y, och genom att tvinga ut framhävning + animation i form/ikon/CSS (inte färg/JS)
håller det läsbarheten helig i båda teman, för färgblinda och vid reducerad rörelse. Källa: T9 design-
frontend (`src/features/bracket/bracket.css` + `BracketView.tsx`).

### scenario-motor-enumererar-utfall-konservativt-ovanpa-verifierad-tabellmotor (VM 2026)

**Recept (ett "vad krävs"/scenario-lager ovanpå härledd state, utan att gissa eller över-claima):**

1. ENUMERERA utfallen, ÅTERANVÄND tabellmotorn. För n återstående matcher finns 3^n W/D/L-utfall
   (vinst/oavgjort/förlust). För VARJE utfall: bygg SYNTETISKA färdiga matcher (neutrala marginaler
   1-0/0-0/0-1) och låt den redan verifierade `computeStandings` (FIFA-tiebreakers) räkna tabellen.
   Bygg ALDRIG egen tabellogik (DRY, PRINCIPLES §4).
2. KÄNN APPROXIMATIONEN och var KONSERVATIV. En W/D/L-enumeration fixerar POÄNGEN exakt men INTE
   målsiffrorna, och mål påverkar tiebreaks. Klassa därför BARA på poäng: "klar" bara om laget är
   säkert i mål-positionen i ALLA utfall oberoende av marginal (`<= 1` annat lag med >= poäng för
   topp-2), "ute" bara om ingen marginal kan rädda det (`>= k` lag STRIKT före), allt målsiffer-
   känsligt -> "beror på" (+ en `marginDependent`-flagga som gör approximationens gräns SYNLIG).
   Approximationen ska ALLTID luta mot "beror på", aldrig mot ett falskt "klart"/"ute" (HARD: gissa
   aldrig en garanti enumeringen inte avgör). Använd POÄNG-konservativa "kan-nå"-signaler (inte den
   neutrala-marginal-ranken) för UI-flaggor (`canFinishTop2/Third`), annars kan en godtyckligt vald
   marginal ge en falsk negativ.
3. TRÖSKEL-GARANTIN bor i FUNKTIONEN + randtesta n-1/n/n+1 (lessons `uttommande-test-vaktar-svagare-
   invariant`). 3^n exploderar, så en `MAX`-vakt (`assertEnumerable`) FAIL-LOUD:ar (kastar) på oväntat
   stort n och testas direkt på randen. Men det PUBLIKA API:t gatar FÖRE vakten och returnerar en FAS
   (`'too-early'`) i stället för att kasta när det normala "för tidigt"-läget råder (många matcher kvar
   tidigt i turneringen), så vyn aldrig kraschar. En modell-fas (`decided` | `scenarios` | `too-early`)
   skiljer facit, det egentliga scenario-läget och det för-tidiga, och en tom grupp (ingen matchdata)
   klassas `too-early`, INTE `decided` (annars facit på en tom tabell).
4. CROSS-GRUPP-BEROENDE uttrycks KVALITATIVT, inte simulerat. Där utfallet beror på ANDRA gruppers
   resultat (här bästa-trea-vägen, FIFA Art. 13), säg det ärligt ("beror på de andra grupperna") i
   stället för att simulera en kombinatorisk explosion eller påstå en obevisbar tröskel ("X poäng
   räcker som trea"). Gissa aldrig en garanti du inte kan bevisa lokalt.
5. SEAM som de andra härledda vyerna: ren motor (testbar fristående) -> tunn hook på den DELADE storen
   (`useMemo` gatad på `status === 'ready'`, C8-kontraktet) -> vy med stabil semantik + data-attribut
   (`data-scenario-*`) för design-frontend. Färg-OBEROENDE status-chip (text + form, inte bara färg,
   T7-pin).
6. TÄCKNING: edge-fall (redan klart, omöjligt, beror på annan grupp, ej startad, tom grupp), tröskel-
   randen (n-1/n/n+1 på vakten + mjuk too-early-degradering), OCH ett KONSERVATIVITETS-test (ett
   konstruerat målskillnads-gränsfall klassas ALDRIG "klar"/"ute"; "klar" och `marginDependent` kan
   aldrig vara sanna samtidigt). Hand-byggda standings-fixtures: verifiera de faktiska poängen med en
   probe (`computeStandings`) INNAN du skriver assertions, annars testar du fel antagande.

**Varför:** "Vad krävs"-scenarier (SPEC §5, de mest spännande VM-minuterna) ska vara KORREKTA och
ÄRLIGA, aldrig ett falskt "klart" som målskillnad rubbar. Genom att enumerera ovanpå den verifierade
tabellmotorn och klassa konservativt på poäng blir slutsatsen sann inom det enumeringen avgör, och allt
osäkert syns som "beror på" i stället för att maskeras. Generaliserar de tidigare härledda-state-vyerna
(T5/T6/T9) till ett scenario-lager, och är basen för T12:s what-if-sandbox. Källa: T11
(`src/features/scenarios/`: `scenario-engine.ts` + `use-group-scenarios.ts` + `ScenarioView.tsx`).
