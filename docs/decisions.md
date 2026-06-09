# Besluts-logg (VM 2026)

Varför bakom större design-beslut (lätt ADR). Nyaste överst. En rad per beslut räcker ofta,
skriv mer bara när "varför" är icke-uppenbart. Knyter till tasks/SPEC där det hjälper.

---

## 2026-06-09 , T3 (Copilot runda 2): `Match` blir en diskriminerad union på `status` (C7+C8)

**Beslut:** `Match` (`src/domain/types.ts`) modelleras som en DISKRIMINERAD UNION på `status`:
`Match = ScheduledMatch | LiveMatch | FinishedMatch`. Endast `FinishedMatch` bär ett resultat
(`result: MatchResult`, icke-null); `ScheduledMatch` och `LiveMatch` har `result: null`. Gemensamma
fält ligger i en intern `MatchBase`. `isCounted` i `computeStandings` narrowar nu på
`status === 'finished'` (i stället för en fristående `result !== null`-koll), vilket både blir renare
och binder ihop "räknas in" med matchens faktiska livscykel-läge. Ett typ-test
(`src/domain/types.test.ts`) vaktar kontraktet: `true satisfies Equal<FinishedMatch['result'],
MatchResult>` m.fl. failar bygget om typen någonsin luckras upp igen (mutations-verifierat).
**Varför / vägval:** Copilot flaggade (C7+C8) att JSDoc:en LOVADE en koppling status <-> resultat som
typen inte tvingade (`result` var `MatchResult | null` oavsett status). De två giltiga vägarna var
(a) omformulera kommentarerna ärligt som "konvention, inte typgaranti" eller (b) göra unionen så
kopplingen blir ett TYP-KONTRAKT. Vi valde (b) eftersom detta är fundamentets kärntyp, Daniel valde
kvalitet före tempo, och ripple-effekten var liten och uteslutande till det bättre: alla befintliga
Match-literaler (fixtures + tester) följde redan invarianten, och konsumenten `computeStandings` fick
en strikt RENARE narrowing (status-baserad i stället för null-koll). Resultatet: ogiltiga tillstånd
(finished utan resultat, scheduled/live med resultat) är nu OREPRESENTERBARA ("illegal states
unrepresentable"), och konsumenter (UI, computeStandings) läser `result` utan null-check efter en
`status === 'finished'`-narrowing. Live-matchens `result` hålls medvetet `null` (SPEC §6: "resultat
null tills inmatat"); en eventuell löpande ställning blir i så fall ett eget, uttryckligt fält, inte
en uppluckring av detta kontrakt.

---

## 2026-06-09 , T3 (Copilot runda 1): `computeStandings` räknar BARA gruppmatcher

**Beslut:** `computeStandings` (`src/domain/standings/compute-standings.ts`) räknar in en match i
grupptabellen bara om den är en gruppspelsmatch (`stage === 'group'` OCH satt `groupId`), utöver de
tidigare kraven (resultat finns, båda lag kända). Slutspelsmatcher ignoreras helt, även när deras
lag finns i `teamIds`. En gruppmatch utan `groupId` (data-defekt) hoppas också över.
**Varför:** Funktionen beräknar uttryckligen en GRUPPtabell. Tidigare räknade `isCounted` in alla
matcher med resultat + kända lag oavsett stage, så en blandad matchlista (en call-site som skickar
in både grupp- och slutspelsmatcher) hade kunnat förorena grupptabellen med slutspelsresultat,
ett dataintegritets-hål i kärnan av SPEC §5. Avgränsningen gör tabellen robust mot hur call-sites
filtrerar och flyttar inte ansvaret för stage-filtrering uppåt. Flaggad av Copilot (C1).

---

## 2026-06-09 , T3: Cloudflare-produktionsgren = `develop` (kopplingen aktiverad)

**Beslut:** Cloudflare Pages är NU kopplat till repot och produktionsgrenen är **`develop`**, inte
`main`. Appen är live på vm-2026.pages.dev och byggs/deployas från `develop`-linjen. `main`
reserveras för framtida formella releaser och är inte kopplad som produktion än.
**Varför:** Daniel bekräftade kopplingen denna session. Under aktiv utveckling delas appen från
`develop` (den samlade nästa-versionen), så det är den grenen som ska vara den skarpa publika URL:en.
Att vänta med en `main`-baserad produktion tills det finns formella releaser undviker en tom/inaktuell
huvud-adress. Detta KORRIGERAR tidigare dokumentation (deploy.md, inception- och T1-besluten nedan,
samt SPEC §3 och CLAUDE.md) som sa "produktion = `main`", det var en plan innan kopplingen gjordes.
En sanning per fakta: alla de raderna är nu uppdaterade till `develop` så ingen doc-drift kvarstår.

---

## 2026-06-09 , T3: FIFA-tiebreak-ordning för gruppspelstabellen (VM 2026)

**Beslut:** Tabellberäkningen (`src/domain/standings/compute-standings.ts`) rangordnar lag enligt
FIFA:s officiella ordning för VM 2026 (artikel 13), i denna prioritet: (1) poäng, (2) inbördes
poäng, (3) inbördes målskillnad, (4) inbördes gjorda mål, (5) total målskillnad, (6) totalt gjorda
mål. Kriterium 2 till 4 räknas bara på matcherna MELLAN de lag som står lika (en mini-tabell).
**Varför / nyansen:** VM 2026 ÄNDRADE ordningen mot tidigare mästerskap, inbördes möte
(head-to-head) kommer nu FÖRE total målskillnad, inte efter. Detta gissades inte: ordningen
verifierades mot FIFA:s regler och ESPN:s genomgång (2026-06-09). Att råka behålla den gamla
ordningen (total MS före inbördes) skulle ge fel tabell i just de tighta lägen som avgör vilka lag
som går vidare, kärnan i SPEC §5:s dataintegritets-krav.

**Beslut (scope-avgränsning):** Kriterium 7 (fair play / disciplin) och 8 (lottning) implementeras
INTE i T3. När alla deterministiska kriterier (1 till 6) ger exakt lika faller funktionen tillbaka
på en stabil sortering på lag-id.
**Varför:** Fair play kräver kort-/disciplindata som domänmodellen inte modellerar (Match bär inga
kort) och kan inte beräknas deterministiskt ur matchresultaten. Lottning är per definition
slumpmässig. Båda ligger utanför vad T3:s data tillåter, att gissa dem vore att hitta på. Den
stabila lag-id-sorteringen är uttryckligen INTE en FIFA-tiebreak, bara en garanti att samma indata
alltid ger samma utdata (deterministisk, ej "flaxig" ordning), tydligt kommenterad som sådan.
Den fullständiga slutspels-seedningen (8 bästa treor + FIFA:s treeplats-tabell) är T4, inte T3,
T3 levererar bara BracketSlot-TYPEN (källa: gruppvinnare/tvåa/bästa-trea) redo för T4.

**Beslut:** Datalagret byggs fixtures-först med en miljö-gate (`src/data/data-source.ts`): saknas
Supabase-env körs typad fixtures-data med en fail-loud-logg, finns env väljs en (ännu tunn) live-
klient. Domänmodellen (`src/domain/types.ts`) typar kärn-entiteterna fullt och social-entiteterna
som stubs för Fas 2.
**Varför:** Låter hela appen byggas och testas innan Supabase-kontot (T14) finns, utan kod-ändring
vid live-aktivering. Fixtures uppfyller exakt samma typer som live-datan (annars döljs en mappnings-
drift i den otestade live-grenen, en känd fallgrop). Detta är Agent Kit-playbookens "fixtures-
först"-mönster. Se `docs/patterns.md`.

---

## 2026-06-09 , T2: Tema-arkitektur (no-flash + token-kontrakt + rörelse-primitiver)

**Beslut:** No-flash-temat sätts av ett blockerande inline-script som injiceras FÖRST i
`<head>` (Vite `transformIndexHtml` med `injectTo: 'head-prepend'`). Scriptets innehåll
GENERERAS från `src/theme/theme-constants.ts` (samma nyckel/attribut/default/giltiga teman
som React-providern), inte handkopierat, och ett test (`theme-init.test.ts`) kör den exakta
genererade koden och vaktar att resolve-regeln matchar `resolveInitialTheme`.
**Varför:** Temat måste sitta på `<html>` innan CSS appliceras och innan first paint, annars
FOUC. Ett inline-script är det enda som hinner det (en ES-modul laddas deferred och tappar
no-flash). Risken är att kopiera magiska strängar in i HTML som tyst driver isär, en sanning
via codegen + synk-test löser det. Detta är Agent Kit-playbookens "no-flash-tema-utan-
duplicerade-strängar" (Astro/`define:vars`) anpassad till React + Vite (`transformIndexHtml`
är Vites motsvarighet). Se `docs/patterns.md`.

**Beslut:** Design-tokens uttrycks som CSS-variabler i Tailwind v4 `@theme inline`, med
semantiska roll-namn (`--color-bg/surface/accent/...`) som pekar på tema-växlande variabler
(`--vm-*`), roterade på `[data-theme]`. ALLA värden bor isolerat i EN fil, `src/theme/tokens.css`.
**Varför:** Token-STRUKTUREN (kontraktet) ägs av tema-motorn och ska vara stabil, men VÄRDENA
(premium-palett, typografi, känsla) authoras av design-frontend-agenten. Genom att isolera
värdena i en fil kan design äga dem utan att röra plumbingen (provider, init-script, wiring).
Semantiska roll-namn (inte råa färger) låter design byta hue/skala fritt utan att bryta
konsumenter. Värdena i `tokens.css` är de slutgiltiga premium-värdena (palett, typografi,
känsla), authorade av design-frontend-agenten i T2.

**Beslut:** Rörelse-primitiver (`Fade`/`Slide`/`Spring`) byggs som tunna wrappers över
`motion`-paketets `motion.div`. Reducerad rörelse hanteras i två lager: `MotionProvider`
sätter `MotionConfig reducedMotion="user"` (bred deklarativ grind), och Slide/Spring nollställer
dessutom transform-/skal-förskjutningen explicit via `useReducedMotion`.
**Varför:** Dubbelt skydd ger deterministiskt och testbart reduced-motion-beteende (WCAG 2.3.3):
elementen tonar bara in utan att resa/poppa. Easing/timing är isolerade i `motion-presets.ts`
så design kan finjustera personligheten utan att röra primitiverna. Paketet `motion` är det
nuvarande namnet på Framer Motion (samma version/maintainer, peer-rent mot React 19 + Vite 7,
ingen `--force`).

---

## 2026-06-09 , T1: Cloudflare-deploy via git-integration, inga secrets i repot

**Beslut:** Cloudflare Pages kopplas till repot via Cloudflares egen git-integration (Cloudflare
bygger repot direkt från sin dashboard), INTE via en GitHub Actions-deploy med API-token. GitHub
Actions-workflowen (`.github/workflows/ci.yml`) gör bara kvalitetsgrinden (build + test + lint) på
PR mot `develop`, den deployar inte. Koppling-instruktion: `docs/deploy.md`.
**Varför:** Daniels val denna session. Git-integration betyder att inga Cloudflare-tokens behöver
ligga i koden eller repot (PRINCIPLES §7), vilket tar bort hela secret-hanteringen för deployen.
Avvägning: en Actions-deploy ger lite mer kontroll över deploy-steget, men kostar en hemlighet att
förvalta och övervaka, inte värt det för en vänapp.

**Beslut:** T1-stacken pinnad till **Vite 7** + `@vitejs/plugin-react@^5.2.0`, Tailwind v4 via
`@tailwindcss/vite`-pluginen, `vite-plugin-pwa` för det installerbara skalet.
**Varför:** `@vitejs/plugin-react@6` kräver Vite 8 som peer, och vite-plugin-pwa stöder ännu inte
Vite 8. Vite 7 + plugin-react 5.2 + vite-plugin-pwa ger en helt ren peer-dependency-träd (ingen
`--force` / `--legacy-peer-deps`, vilket skulle dolt en verklig inkompatibilitet). Tailwind v4 använder
`@import "tailwindcss"` + Vite-plugin i stället för den gamla `tailwind.config.js`-stilen.

---

## 2026-06-09 , Inception: stack, hosting och scope låsta

**Beslut:** Stacken låst till React + Vite + TypeScript, Tailwind + Framer Motion,
vite-plugin-pwa, Supabase (Postgres + Auth + Realtime + RLS).
**Varför:** Matchar SPEC:ens WOW-/levande-mål (Framer Motion för rörelse), PWA = dela via länk
utan App Store, Supabase ger delad sanning + realtid + auth på gratisnivå utan egen backend-server.

**Beslut:** Hosting = **Cloudflare Pages** (inte Vercel). (Produktionsgrenen sattes till `develop`
när kopplingen aktiverades 2026-06-09, se T3-beslutet överst, denna inception-rad planerade
ursprungligen `main`.)
**Varför:** Daniels val i inception. Gratis, globalt edge-nätverk, billigare vid stor skala.
Avvägning mot Vercel: Vercel har något smidigare PR-förhandsvisningar, men skillnaden är liten
för en vän-app och Cloudflares edge + prissättning vägde över.

**Beslut:** Utökad backlog (~26 tasks, 4 faser) godkänd, utöver grund-SPEC:en.
**Varför:** Daniel bad uttryckligen om maximal kvalitet och fler roliga/vassa features. Tillägg:
bracket-tips, gamification, mini-ligor, "vad krävs"-kalkylator, what-if-simulator, delbara kort,
personlig statistik, reaktioner. Full lista i SPEC §12. Tempo: **kvalitet före tidspress** (Daniels
val), så Fas 1 byggs ordentligt, inte som en minimal snabb-deploy.

**Beslut:** Arkitektur-ryggrad = **härledd state** (tabeller/träd/poäng beräknas av rena funktioner
från matchresultat + tips) + **fixtures-först** (typad fixtures-data, miljö-gating till live Supabase).
**Varför:** Gör den kritiska FIFA-treeplats-seedningen (SPEC §5) testbar och säker, och låter hela
appen byggas innan Supabase-kontot finns. Fixtures-mönstret är bevisat i Agent Kit-playbooken.
