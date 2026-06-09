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
4. En `getDataSource(env = import.meta.env)`-gate väljer källa: `isSupabaseConfigured(env)` (båda
   `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` finns och är icke-tomma) -> live, annars fixtures
   med en **fail-loud `console.warn`** så fixtures-läget syns och övergången till live inte glöms.
5. Live-klienten laddas via **dynamisk import** (`import('./supabase-client')`) så Rollup inte måste
   lösa ett Supabase-paket som ännu inte är installerat, fixtures-bygget förblir rent.
6. Live-stubben **fail loud:ar** (kastar) vid anrop innan den är byggd, i stället för att returnera
   tyst tom data som ser giltig ut.
7. Injicera `env` som parameter (default `import.meta.env`) så gaten kan enhetstestas utan att mocka
   `import.meta` globalt.

**Varför:** Hela appen kan byggas och testas innan Supabase-kontot finns (T14), utan kod-ändring vid
aktivering. Fixtures som uppfyller live-typerna fångar mappnings-drift i bygget i stället för att
gömma den i en otestad live-gren. Detta är Agent Kit-playbookens generella "fixtures-först"-mönster
konkretiserat för VM 2026:s React + Vite + Supabase-stack. Källa: T3.

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
   opacity/scale). Lägg keyframes i `index.css`. De fångas AUTOMATISKT av den globala
   `@media (prefers-reduced-motion: reduce)`-regeln (som nollar `animation-duration`/`iteration-count`),
   så de snappar till sitt statiska första steg utan en egen JS-grind. Verifiera LIVE genom att
   emulera reduced-motion och läsa `getComputedStyle(...).animationDuration` (ska bli ~0.01ms).
3. NEDRÄKNING utan layout-hopp (CLS=0): rendera siffror med `tabular-nums` OCH en fast `min-width` per
   enhet (en "tile"), så bredden aldrig ändras när 9 -> 10 eller sekunder tickar. Den rena
   tick-logiken (computeCountdown) ligger kvar i hooken; design rör bara presentationen.
4. RESPONSIVT: hero:n är `flex-col` på mobil (nedräkning över featured-kortet), `lg:flex-row` på
   bred skärm. Verifiera att inget barn är bredare än viewporten på 360px (mät `scrollWidth` vs
   `clientWidth` på `documentElement`, och leta efter element vars `getBoundingClientRect().right`
   sticker ut).

**Varför:** "Levande" får aldrig betyda "rörig för den som valt minska rörelse" eller "hoppig LCP/CLS".
Genom att uttrycka dekor-rörelsen som CSS-keyframes ärver den den globala reduced-motion-grinden gratis
(en sanning, inget dubbelt skydd att hålla i synk), och `tabular-nums` + fast tile-bredd gör en
sekund-tickande nedräkning till en nollkostnad för CLS. Återanvänds av kommande hero/levande vyer
(slutspelsträd, topplista). Källa: T7 design-frontend (`src/features/daily/DailyMatchesView.tsx` +
`vm-pulse`/`vm-sheen` i `src/index.css`).

### lag-identitet-utan-asset-beroende-och-kanal-badge-med-fg-kontrast (design, VM 2026)

**Recept (visuell identitet på matchkort utan att offra prestanda eller a11y):**
1. LAG-EMBLEM utan nätverk: generera en deterministisk tvåtons-disc ur lagets FIFA-landskod
   (en liten FNV-hash -> två hue-grader ~140 grader isär, HSL med MÅTTLIG mättnad/ljushet ~34-42% L).
   Inga flaggbilder (48 nät-hämtningar = LCP/CLS-risk) och inga emoji-flaggor (renderas inte på
   Windows). Cappa ljusheten så vit text på discen håller AA (42% L -> >= ~5:1 även på den ljusaste
   hue:n). Discen är `aria-hidden` (ren dekoration); lagnamnet bär a11y. Bytbar mot riktig flagg-data
   senare utan att röra kortet.
2. KANAL-BADGE som skummas: ge kanalen ett eget märke (prick + namn) med kanalens egen ton i
   BAKGRUND + KANT + PRICK, men håll TEXTEN på `var(--color-fg)` (uppmätt 15.10:1 ljust / 13.23:1
   mörkt), så badgen läses skarpt oavsett kanalfärg. Okänd kanal faller tillbaka på en neutral fg-ton.
**Varför:** Ett matchkort utan lag-identitet blir en textrad; en deterministisk disc ger varje lag en
igenkännbar signatur till noll prestanda-kostnad. Kanal-tonen i bakgrund/kant (inte i texten) ger
kanal-igenkänning utan att riskera en låg färg-på-färg-kontrast. Källa: T7 design-frontend
(`src/features/daily/TeamFlag.tsx` + `TvBadge.tsx`).
