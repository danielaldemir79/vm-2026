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

### gissningskanslig-data-genereras-ur-auktoritativ-kalla-med-validerande-generator (VM 2026)

**Recept (stor, regel-kritisk datatabell utan handknapp och utan gissning):**

1. Hämta den AUKTORITATIVA källan (t.ex. FIFA:s regelverks-PDF) och extrahera ren text
   (`pdftotext -layout fil.pdf out.txt`).
2. Skriv ett **generator-skript** (`scripts/generate-<tabell>.mjs`) som PARSAR tabellen ur texten
   med en strikt regex (matcha radens form exakt, ignorera sidbrytnings-/rubrik-brus).
3. **VALIDERA i generatorn före emit** och vägra skriva vid fel (fail loud, `process.exit(1)`):
   rätt antal rader, varje rad välformad, inga dubbletter, hela domänen täckt (t.ex. alla C(n,k)
   kombinationer). Hellre stopp än fel data.
4. Emitta en **GENERERAD .ts-fil** med ett filhuvud som (a) säger "redigera inte för hand, se
   generatorn", (b) **källhänvisar inline** (källans namn + avsnitt/sida + URL), (c) förklarar
   kolumn-/rad-semantiken. Committa BÅDE generatorn (härledningen) och .ts-filen (det koden importerar).
5. Skriv ett **integritetstest** för den genererade filen som bevakar fullständigheten vid bygget
   (samma invarianter som generatorns validering + ett par källhänvisade spot-checks mot kända rader).
6. Bygg konsumenten (motorn) på ett förbyggt O(1)-index över tabellen och **fail loud** om en giltig
   nyckel ändå saknas (skulle bara hända vid trasig tabell, som testet utesluter).

**Varför:** En stor regel-tabell (här FIFA:s Annexe C, 495 rader) är för felkänslig att skriva för
hand och omöjlig att review:a snabbt. Genom att generera ur källan med en validerande generator blir
datan spårbar, regenererbar och självkontrollerande, och reviewern kan BEKRÄFTA den mot källan i
stället för att jaga den. Detta uppfyller källhänvisnings-kravet (HARD) för gissningskänslig data.
Källa: T4 (treeplats-tabellen, `scripts/generate-third-place-table.mjs` ->
`src/domain/bracket/third-place-table.ts`).
