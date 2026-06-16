# Besluts-logg (VM 2026)

Varför bakom större design-beslut (lätt ADR). Nyaste överst. En rad per beslut räcker ofta,
skriv mer bara när "varför" är icke-uppenbart. Knyter till tasks/SPEC där det hjälper.

---

## 2026-06-16 , HOTFIX: white-screen live (Realtime kanal-namns-krock + saknad error boundary)

**Symptom:** Den live-deployade appen (vm-2026.pages.dev) white-screenade för användare mitt under
VM, headern syntes <1 s, sedan blev hela sidan blank. Bygget var intakt (HTTP 200), så ett
runtime-fel. Verifierat i browsern: `#root` hade 0 barn (helt avmonterat träd), konsolen visade
`Error: cannot add 'postgres_changes' callbacks for realtime:vm2026-tournament-stats after subscribe()`.

**Rotorsak (verifierad, gissad aldrig):** Supabase Realtime cachar kanaler per TOPIC ,
`client.channel(name)` returnerar SAMMA kanal-instans för samma namn. T83 håller ALLA flik-paneler
monterade samtidigt, så de två alltid-monterade Turnering-vyerna `ScorerTableView` (T87) och
`TournamentStatsView` (T88) anropade BÅDA `useCrossMatchEvents()`, som prenumererade på samma
channelName `'vm2026-tournament-stats'`. Den andra prenumeranten fick tillbaka den förstas redan
`subscribe()`:ade kanal och anropade `.on('postgres_changes', ...)` på den, vilket supabase-js
förbjuder , felet kastades synkront i effekten. Eftersom appen INTE hade någon error boundary
avmonterade ett enda sådant fel HELA React-trädet -> blank sida. Live-only: i fixtures-läge öppnas
ingen kanal, så alla fixtures-tester + isolerade render-harness passerade (skarven testades aldrig).

**Fix 1 (rotorsak):** `subscribeToTableChanges` (den enda Realtime-seamen) ger nu VARJE
prenumeration ett unikt topic-suffix (`${channelName}:${++counter}`), så två konsumenter aldrig kan
dela kanal-instans oavsett channelName. channelName är nu en läsbar namnrymds-PREFIX, inte ett delat
lås. Regression: faithful Supabase-fake (topic-cache + throw-on-`.on()`-after-`subscribe()`) , två
prenumerationer på samma namn kastar INTE längre; negativ-kontroll verifierad (revert -> RÖTT).

**Fix 2 (strukturell, ovillkorlig):** Ny `ErrorBoundary` (klass-komponent, `getDerivedStateFromError`
+ `componentDidCatch` som `console.error`:ar fel + komponent-stack, fail-loud). Wrappar varje
flik-panels innehåll (resetKey=aktiv flik), de tunga sektionerna var för sig (skytteliga,
turneringsstatistik, dagens matcher, topplistor, turnerings-zonen) OCH app-roten som sista
skyddsnät. En sektions-krasch kan ALDRIG mer blanka hela appen , den degraderar isolerat med en
tillgänglig fallback (role=alert, fokuseras, statisk = reduced-motion-ok). Källa: hotfix-direktiv
2026-06-16; browser-verifierad rotorsak.

---

## 2026-06-16 , T88 (#180): turneringsstatistik (rik uppsättning härledda VM-stats, near-live)

**Beslut (vilka stats + varifrån de härleds, EN sanning per siffra):** Turneringsstatistiken i
Turnering-fliken (under skytteligan) bygger en rik uppsättning aggregat, allt härlett ur befintlig
data, aldrig en gissad siffra:
- EVENTS-härlett (near-live via `useCrossMatchEvents`, T87): kort-liga (spelare + lag), snabbaste
  mål, mål-per-15min-fördelning, flest mål per lag, turneringens mål-total + målsnitt.
- STATISTICS-härlett (near-live via nya `useCrossMatchStats`): mest bollinnehav, flest skott, mest
  fouls (null-medvetna lag-medel).
- RESULTAT-härlett (den resolvade matchplanen ur ResultsProvider, dvs officiellt facit, slutgiltigt
  vid FT): flest hållna nollor (clean sheets), största skrällarna (upsets).

**Beslut (egenmål i "flest mål per lag", F1 , KÄLLHÄNVISAT, gissa aldrig):** Ett egenmål är gjort
AV en spelare men räknas FÖR motståndarlaget; API-Footballs `team`-fält är tvetydigt och de stora
fotbolls-API:erna är OENIGA om konventionen (kunde ej källverifieras, v3-doc 403; se T86-raden nedan).
Vi tolkar därför ALDRIG om team-fältet: ett egenmål krediteras INTE till något lags mål-tally, det
noteras bara separat (ownGoals). Ett lags `goals` = mål av lagets spelare EXKLUSIVE egenmål (öppet
spel + straffmål, vars teamApiId är det icke-tvetydiga, gjorda-för-laget). MEN turneringens mål-TOTAL
(`totalGoals`/målsnitt) RÄKNAR egenmålet (FIFA räknar egenmål i en turnerings måltotal , det föll ett
mål), bara LAG-krediteringen av just egenmålet vågar vi inte. Källa: `isOwnGoalDetail` (detail "Own
Goal", match-stats T86). Inline-källhänvisat i `tournament-stats-events.ts` (G1/G2) + empirisk
NEGATIV-KONTROLL (ta bort egenmåls-gardet -> 3 F1-tester rödnar, verifierat 2026-06-16).

**Beslut (skräll/upset-regel , KÄLLHÄNVISAT):** En skräll = en färdig match där det LÄGRE rankade
laget (HÖGRE FIFA-rankingtal) vann; gapet = vinnarens rankingtal − förlorarens. Oavgjort = ingen
skräll. Vinnaren avgörs av ordinarie+förlängning, vid lika av straffarna (samma vinnar-härledning som
slutspels-trädet). Källa (ranking): FIFA/Coca-Cola Men's World Ranking, juniutgåvan 2026, samma
källåkrade tabell som `team-profiles.ts` (`fifaRanking`, värde-låst i CI). Ett lag utan känd ranking
hoppas (gissar aldrig ett gap). Clean sheet: motståndaren gjorde 0 mål i ordinarie+förlängning (straff-
läggning räknas aldrig som insläppt; MatchResult bär redan mål exkl. straffar). Inline i
`tournament-stats-tables.ts` (C1/U1).

**Beslut (parallellt smalt cross-match-STATISTICS-läs-lager + delad near-live-spine, DRY rule-of-
three):** Lag-medlen läser statistics via ett EGET smalt läs-lager (`live-stats-read.ts`,
`getLiveStats`) som SELECTar bara `match_id, statistics` (spegelbild av T87:s `live-events-read.ts`,
parser-skarven delas). Near-live-mekaniken (Realtime + 20 s poll + fokus/online/visibility) var nu
upprepad en TREDJE gång (use-live-data T91, use-cross-match-events T87, denna), så den extraherades
till en DELAD generisk hook `useNearLiveCollection`; `useCrossMatchEvents` (T87) skrevs om att
delegera dit utan beteende-ändring (dess test = oförändrad negativ-kontroll, grönt). `useLiveData`
delar idén men inte laddningen (drar `*` + indexerar per app-match-id för dagsvyn), så den lämnades
utanför (KISS/YAGNI, ingen fel-abstraktion).

**Beslut (placering UTANFÖR SimulationFrame + sim-grind, F2):** Vyn mountas i Turnering-fliken men
utanför SimulationFrame, samma val som skytteligan. Event-/statistik-korten är oberoende av results-
storen (egna live-hookar). De resultat-härledda korten läser results-storens matchlista, som i what-
if-läge är de EFFEKTIVA (sim-overlaid) matcherna; vyn GATAR därför clean sheets/skrällar på att what-
if-läget är AV (`simulating === false`) och visar en lugn "visas med verkliga resultat"-notering i
sim-läge, så turneringsstatistiken aldrig speglar sandlåde-resultat.

---

## 2026-06-16 , T87 (#179): skytteliga + assist-liga (cross-match-aggregering, near-live)

**Beslut (skytteliga-reglerna, KÄLLHÄNVISADE):** Skytteligan aggregeras ur live-event-datan över
ALLA matcher med dessa regler:
- **Egenmål räknas ALDRIG som skyttens mål.** Vi filtrerar `isOwnGoal === false` innan en spelares
  mål-tally räknas. **Källa:** den regeln är universell och provider-oberoende (till skillnad från
  egenmålets LAG-kreditering, som de stora fotbolls-API:erna är oeniga om och vi aldrig tolkar om ,
  se T86-raden nedan + match-stats-types.ts MatchGoal-doc). `isOwnGoal` härleds ur API-Footballs
  detail "Own Goal" (match-stats `isOwnGoalDetail`).
- **Straffmål RÄKNAS som mål** (och noteras separat som "varav N straff"). **Källa:** så räknar
  FIFA:s officiella skyttekungs-statistik (straffar i öppet spel ingår; bara straffläggning EFTER
  120 min, dvs penalty shoot-out, räknas inte , och de kommer aldrig in i aggregeringen eftersom de
  inte är ordinarie `goal`-events). `isPenalty` ur API-Footballs detail "Penalty" (match-stats
  `isPenaltyGoal`).
- **Grupperings-nyckel = spelar-id, inte namn** (namn stavas olika mellan svar, id:t är stabilt; en
  mål/assist utan känt id hoppas , gissar aldrig att två okända skyttar är samma). **Källa:**
  live-types `LiveEvent.playerId`-doc ("STABIL nyckel för cross-match-aggregering").
- **Ranknings-sorteringen** (mål desc -> färre matcher -> fler assists -> namn) är en PRESENTATIONS-
  konvention (rimlig tie-break), inte en officiell FIFA-regel, och hävdas inte som källhänvisad
  sanning. Reglerna är inline-källhänvisade i `src/features/tournament-stats/scorer-table.ts` (R1-R4)
  och bevisade med diskriminerande tester + en empiriskt verifierad negativ-kontroll (filtret borta
  -> 3 R1-tester rödnar).

**Beslut (lättviktigt cross-match-events-läs-lager, smalt SELECT):** Skytteligan/turneringsstatistiken
läser events via ett EGET smalt läs-lager (`src/data/livescore/live-events-read.ts`,
`getLiveEvents`) som SELECTar bara `match_id, events` , inte `*` (live-read.ts:s `getLiveData` drar
ALLA tre blobbarna events+statistics+lineups per rad). **Varför:** en cross-match-aggregering rör
bara events; att dra ner statistics/lineups för hundratals matcher är onödigt nät + parse. Parser-
skarven (RawApiResponse-kuvert -> `parseEvents`) delas med live-read, så ingen tolknings-drift. T88
återanvänder samma loader + den återanvändbara hooken `useCrossMatchEvents`.

**Beslut (near-live = SAMMA T91-spine):** `useCrossMatchEvents` återanvänder dagsvyns auto-
uppdaterings-spine (Realtime på `match_live_data` + 20 s poll-fallback + fokus/online/visibility-
refetch), så aggregaten räknas om inom sekunder när ett mål skrivs. Gatat bakom live-läge; i
fixtures/demo-läge en initial hämtning, sedan vila (ingen backend att väcka). **Varför:** EN sanning
för "hur håller vi live-data färsk" (DRY), och samma robusthet som löste T91:s stale-score-bugg.

**Beslut (placering UTANFÖR SimulationFrame):** Skytteligan mountas i Turnering-fliken men utanför
`SimulationFrame`. **Varför:** den härleds ur den VERKLIGA live-event-datan, inte ur det lokala
what-if-läget, så den ska aldrig bära sim-markeringen.

---

## 2026-06-16 , T86 (#178): rik live-matchvy , drill-in + delad match-stats-projektion

**Beslut (drill-in = MODAL, inte route eller inline-expand):** Den rika matchvyn (tidslinje +
statistik + laguppställning + "vad alla tippade") öppnas via DRILL-IN i en delad `<Modal>`
(src/features/match-detail/), inte som inline-expand på livekortet och inte som en egen
hash-route. **Varför:** north-star §2 säger att den TUNGA detaljen öppnas via drill-in (det
eliminerar nästlade komprimera-knappar). En modal (inte en routad vy) är KISS i den router-lösa,
hash-baserade flik-appen, och återanvänder den redan a11y-kompletta Modal-primitiven (fokus-fälla,
Escape, portal, reduced-motion). Avvägning mot en delbar per-match-djuplänk: delning sker redan på
app-nivå (vm-2026.pages.dev) och en per-match-URL var inget uttalat krav , KISS vägde över. Drill-
in följer det etablerade mönstret `klickbar-entitet-oeppnar-en-delad-modal-overlay` (context +
provider-renderar-en-gång + återanvändbar trigger), inkopplad från Idag-listans matchrader (T92
kopplar in Tips-reveal-listans rader mot SAMMA openMatch-seam).

**Beslut (EN delad match-stats-projektion, src/data/match-stats/):** En ny, MATCH-AGNOSTISK,
team-/spelar-nyckad projektion (extractGoals/Cards/Subs/OtherEvents, normalizeTeamStats,
extractLineup) ovanpå de redan-parsade live-typerna (parse-live.ts). **Varför:** T87 (skytteliga)
aggregerar mål/assist per spelar-id över ALLA matcher, T88 (turneringsstatistik) aggregerar kort/
innehav per lag-id över ALLA matcher , båda behöver team-/spelar-id bevarade, inte den sid-nyck(
home/away)-form live-card-model.ts har (den tappar id:n och kräver ett homeApiId, rätt för EN
match-vy men oanvändbart cross-match). Vi parsar ALDRIG om de råa svaren här (parse-live äger RÅ ->
normaliserad, en sanning); projektionen tar bara den normaliserade formen ett steg till. För att
bära skytt-/assist-id + tränare genom skarven utökades `LiveEvent` (playerId/assistId) och
`LiveLineup` (coachName) additivt i parse-live (null-säkert, gissar aldrig ett id/namn).

**Egenmåls-regel (KÄLLHÄNVISAD + flaggad osäkerhet, gissa aldrig):** `extractGoals` FLAGGAR egenmål
via detail "Own Goal" (verifierbart, samma källa som live-card-model redan matchar) och straff via
detail "Penalty". Den VERIFIERBARA, provider-oberoende regeln "ett egenmål är aldrig SKYTTENS mål"
uttrycks genom att T87 filtrerar `isOwnGoal === false` innan den räknar en spelares tally. Vi tolkar
INTE om vilket lag `teamApiId` pekar på för ett egenmål (om det är det gjorda-emot-laget eller det
gynnade laget): de två stora fotbolls-API:erna är OENIGA om den konventionen (API-Football vs
football-data.org / Sportmonks), och API-Footballs egen v3-doc svarar 403 mot automatiska hämtningar
så den gick inte att bekräfta, och de committade fixtures innehåller inget egenmål att probe:a mot.
**Beslut:** behåll `teamApiId` EXAKT som API:t attribuerar eventet (ingen omtolkning), tills regeln
kan källverifieras mot ett riktigt egenmåls-svar live (eller mot den nåbara doc:en). T88:s ev. "mål
för/emot per lag"-aggregering måste vänta in den verifieringen innan den litar på egenmålets team-
fält. Negativ-kontroll bevisar att test:et som låser team-bevarandet rödnar om någon inför en flip.

---

## 2026-06-16 , T91 (#184): live-score auto-uppdatering , poll + fokus/online-skyddsnät ovanpå Realtime

**Rotorsak (fastställd, inte gissad):** en pågående match uppdaterades inte i appen förrän en
MANUELL omladdning (mål föll, ställningen stod stilla). `useLiveData` (src/features/daily/
use-live-data.ts) hade ENBART Realtime-prenumerationen på `match_live_data` , inget skyddsnät om
postgres_changes-WebSocketen missar eller tappar. Verifierat mot prod 2026-06-16: tabellen ligger
korrekt i `supabase_realtime`-publikationen (T81-migrationen) OCH pollaren skriver färsk data
(g-G-2 live, uppdaterad 16 s tidigare), så backend var friskt , felet var rent på läs-sidan.
Realtime-loggen visade dessutom återkommande "Tenant has no connected users / shutdown", dvs
klienter höll inte streamen öppen. Och `subscribeToTableChanges` förlitar sig EXPLICIT på "nästa
fokus-refetch" som skyddsnät , men det skyddsnätet saknades i useLiveData (OfficialResultsProvider
har det, live-vyn hade det inte). SW/HTTP-cache UTESLUTET som orsak: workbox-globben precachar bara
statiska bygg-assets, ingen `runtimeCaching` rör Supabase-fetchar, och PostgREST-svaren bär inget
`Cache-Control`/`ETag` , inget lager cachar live-läsningen.

**Beslut:** Lägg till TVÅ skyddsnät i useLiveData ovanpå Realtime (som förblir primär väg), båda
kör samma tysta re-fetch (bumpar refetch-nonce): (1) en periodisk POLL var 20 s medan live-läget är
aktivt, (2) en om-hämtning vid `online` + `visibilitychange` (visible). Bara i live-läge; fixtures
har ingen backend (negativ-kontroll i testet).

**Varför poll-cadensen är 20 s (källhänvisad, inte godtycklig):** livescore-pollaren skriver
`match_live_data` var ~30:e sekund under live (cron `'30 seconds'`, se supabase/functions/
livescore-poller + memory "vm2026-livescore-feasibility"). En klient-poll på 20 s fångar därför
varje ny snapshot inom några sekunder efter skrivning (kravet "inom några sekunder"), och eftersom
Realtime normalt levererar pushen FÖRST är pollen i praktiken bara redundans. Lasten är en lätt,
öppen-RLS Supabase-SELECT per vaken live-flik , ingen API-Football-kostnad (den ligger på pollaren,
som vi inte rör). Ingen SW-/cache-ändring behövdes: live-vägen cachas inte av något lager (se
rotorsak), så network-first vore en åtgärd mot ett icke-existerande problem (KISS/YAGNI).

## 2026-06-16 , T83 (F4): ResultEntryView-testets formulär-räkning bytt från getAllByRole('group') till stabil markör

**Beslut:** I `src/features/results/ResultEntryView.test.tsx` räknas synliga matchformulär via en
ny hjälpare `visibleFormCount()` som använder den stabila markören `form[data-match-id]` (vars
innersta `<li>` inte är `hidden`), i stället för `screen.getAllByRole('group').length` i de heta
`waitFor`-looparna och fönster-/utfäll-jämförelserna.

**Varför (samma patologi T90 fixade i App.test.tsx, north-star-specen tilldelar F4 till T83):**
vyn renderar ALLA 104 matchformulär (out-of-window dolda med `hidden`, inte bortfiltrerade, C2),
så trädet är stort. `getAllByRole('group')` tvingar Testing Library att för VARJE kandidat både
matcha rollen OCH avgöra synlighet via `dom-accessibility-api`s `isInaccessible` -> jsdom
`getComputedStyle`, vars kostnad växer med DOM-storleken; i en `waitFor`-loop betalas den om och
om igen. Det blåste upp filen till ~31 s under full parallell svit-last (under 20 s-blockens
timeout men sårbart). Markör-räkningen är ett O(n) `querySelectorAll` + en `hidden`-koll per nod
(ingen a11y-namnberäkning), så den är billig och deterministisk. Mätt isolerat: filens test-tid
~14,2 s -> ~9,2 s (~35 % ner), tyngsta testet ~2,8 s -> ~1,5 s.

**Ekvivalent, inte svagare:** "synlig" definieras EXAKT som produktionskoden gör (kommentar i
`ResultEntryView.tsx`: "getAllByRole('group') räknar bara de synliga"), nämligen ett kort vars
innersta `<li>` inte är `hidden`. Markören sitter 1:1 med fieldset:en (role=group), så antalet är
detsamma, och fönster-/utfäll-assertionerna behåller sin diskriminerande kraft (utfälld lista har
strikt fler synliga formulär än fönstret; ihopfälld går tillbaka till fönster-antalet). De
genuint a11y-semantiska enskilda queries:na (heading/region/alert/table/rowheader + scoped
`getByLabelText`) lämnades orörda , de är enträffs- eller subträd-scopade och därmed billiga.

## 2026-06-16 , T90 re-review-fix: App-testets install-knapp-query bytt från getByRole({name}) till stabil markör

**Beslut:** I `src/App.test.tsx` hittas den kompakta install-knappen (onboarding-klar-grenen) via
`document.querySelector('[data-install-button="native"]')` + en scoped assertion (knapp-element,
tillgängligt namn, native-markör), INTE via `screen.getByRole('button', { name: /Installera som app/i })`.

**Varför (mätt empiriskt, inte gissat):** När onboarding är KLAR finns ingen modal som gör resten
av skalet inert, så hela app-trädet (~4400 DOM-element, ~145 knappar i fixtures-läget med den fyllda
demo-datan) är tillgängligt. `getByRole({ name })` tvingar `dom-accessibility-api` att beräkna det
tillgängliga NAMNET för VARJE knapp; varje sådan beräkning anropar jsdom:s `getComputedStyle`, vars
kostnad växer med DOM-storleken (~450 ms/knapp under last). 145 knappar -> ~38 s, vilket spränger
vitest test-timeout (15 s) och fällde testet. **Detta är en TEST-frågans kostnad, inte en mount-/
prod-regression:** appen settlar på ~1,5 s, demo-bygget är en engångs-~30 ms (mätt). Bekräftat
PRE-EXISTERANDE på develop (dc5d3ad): exakt samma test timeout:ar där också, så det är inte ett
T90-fynd , T90 lägger bara till ~46 av 4400 element (~1 %). Syskon-testet (touren ÖPPEN) drabbas
inte: den öppna modalen gör skalets knappar inert, så bara dialogens få knappar namn-beräknas.
**Markör-fixen** är O(1)-uppslag och bevarar HELA beteende-assertionen (negativ-kontroll: muterad
markör OCH muterat namn rödnar båda testet, verifierat). Den bredare DOM-storleks-/getComputedStyle-
kostnaden i jsdom (syns även i `ResultEntryView.test.tsx`, ~31 s men under sin timeout) är en
separat test-prestanda-fråga, ägd av flik-IA-tasken (T83) per north-star-specens bygg-ordning.

## 2026-06-15 , T90 (#183): Global topplista RÄTTVIS (bästa rum) + helt global (server-side scoring)

**Live fairness-/privacy-fix. SUPERSEDER T82-del-3-beslutet "summa per rum" nedan.**

**Beslut 1 , aggregerings-regeln: bästa rum, INTE summa.** En deltagares globala poäng =
deras BÄSTA ENSKILDA rum-poäng (inte summan över alla rum). Antal rum ger INGEN fördel.
**Källa till regeln (gissas inte):** ägarens uttryckliga beslut i GitHub-issue #183 ("Rättvist
+ helt globalt", Daniel 2026-06-15) , den gamla summa-regeln lät en deltagare i N rum få N
gångers poäng för samma skicklighet (ägaren kallar det fusk). "Bästa rum" väljs med SAMMA
prioritet som rangordningen (poäng, sedan exakta träffar), så "bästa rum" och "global rank"
vilar på en sanning (`aggregate-total.ts` `isBetterRoom` == `compareEntries`-prioriteten).
Bevisat på REAL prod-data: en användare i 4 rum hade per-rum [7,6,7,6] -> global 7 (bästa),
inte 26 (summa); en i 2 rum [11,7] -> 11, inte 18. Negativ-kontroll: byt best-room mot summa
-> fairness-testet rödnar (verifierat, aggregate-total.test.ts).

**Beslut 2 , listan omfattar ALLA deltagare i ALLA rum (200+), server-side.** Den gamla
live-vägen (`loadRoomContributions(myRooms)`) laddade bara den inloggades EGNA rum -> "Global"
visade ~54 av 263. Den nya vägen rangordnar ALLA. Det MÅSTE ske server-side: en vanlig
medlems RLS ser bara egna rum + egna/avslöjade tips, så listan kan inte byggas i klienten
utan att antingen utelämna folk eller läcka andras hemliga tips. **Privacy:** server-vägen
läser råa tips (förbi RLS, service_role) men returnerar BARA (userId, displayName, points,
rank, exactHits) , ALDRIG en rå tips-rad (bevisat: privacy-test + real-data-körning gav
exakt de fem fälten, inga tips-fält i serialiseringen).

**Beslut 3 , arkitektur: edge function kör SAMMA testade TS-motor (genererad bundle), INTE
en SQL-reimplementation.** Att reimplementera poäng-reglerna (FIFA-tiebreak, bracket-
härledning, score) i SQL vore en andra, drift-bar motor (ägarens #1-risk). I stället:
en READ-ONLY edge function (`supabase/functions/global-leaderboard/`) kör `buildGlobalLeaderboard`
ur en **genererad, bundlad kopia** av den rena src-grafen (`derivePoolFacit` + `buildTotalLeaderboard`
+ `applyRoomResults` + den källåkrade statiska planen), emitterad av
`scripts/generate-global-leaderboard-core.ts` via esbuild. Genererad ur src = ingen hand-drift-
yta (till skillnad från den hand-skrivna livescore-mirror:n). Paritet vaktas behavioralt i
`global-leaderboard-mirror-parity.test.ts` (bundlar om src, jämför diskriminerande in->ut mot
den committade mirror:n , en glömd regenerering rödnar i CI). Demo/fixtures-vägen kör SAMMA
`buildTotalLeaderboard` lokalt -> demo + live delar exakt en rättvise-regel (ekvivalens-test).

**Beslut 4 , UI: "med i N rum"-etiketten borttagen.** Under bästa-rum-modellen ger rum-antalet
ingen fördel, så att visa det bredvid placering/poäng vore vilseledande. Raden + hjälten visar
bara placering + namn + poäng (deltagarens bästa rum-resultat); `roomCount`-fältet är borttaget
ur `TotalLeaderboardEntry`/`TotalSelfSummary`.

**Data-integritet:** ingen migration, ingen schema-ändring; edge-funktionen gör BARA `.select()`
(med `.order()`/`.range()`, rena läs-modifierare). Bot-/seed-datan är bevisat oförändrad (md5 på
bot_accounts + predictions identisk före/efter).

**Beslut 5 (F1, reviewer-fynd, must-fix): paginerad läsning MÅSTE vara totalordnad + completeness-
vaktad.** `selectAll` läste predictions (~18k = 19 sidor), bracket_predictions (~8k) och
group_predictions (~3k) sidvis med `.range()` i en loop UTAN `.order()`. **Regeln (gissas inte,
källhänvisad):** PostgREST/Postgres garanterar INTE samma radordning mellan två sidanrop utan en
total `ORDER BY` , under samtidiga skrivningar eller en annan query-plan kan en rad hoppas över
(understruken poäng) eller dubbleras (samma match räknad två gånger -> uppblåst poäng) vid sid-
gränsen, exakt den fairness-/integritets-bugg T90 skulle fixa. **Källa:** senior-developer-lärdom
`paginerad-las-utan-stabil-order-...` (reviewer, eskalerad panel T90), verifierad mot live prod-
radantal (predictions 18061 = 19 sidor, bracket_predictions 7931, group_predictions 3049, hämtade
2026-06-15). **Fix:** (a) varje paginerad läsning ordnas på tabellens **PK** (en TOTAL ordning ,
verifierat mot live-schemat: predictions `(room_id, match_id, user_id)`, bracket `(room_id, slot_id,
user_id)`, group `(room_id, group_id, user_id)`, room_members `(room_id, user_id)`, official
`(match_id)`); (b) loop-/completeness-logiken flyttad till en REN, testad funktion
(`src/data/global-leaderboard/select-all-pages.ts`, bundlad in i mirror:n , edge-funktionen blir
en tunn IO-wrapper, samma recept som resten av grafen) som verifierar hämtat antal mot ett
`count: 'exact'` och **fail-loud:ar** vid under-/over-read; (c) ett test som KORSAR sid-gränsen
(sidstorlek 3, > 1 sida) bevisar completeness + ingen tapp/dubblering + fail-loud
(`select-all-pages.test.ts`), negativ-kontrollerat (completeness-vakten borttagen -> testet rödnar).
Mirror-paritetsfixturen stärktes också med en deltagare som scorar OLIKA i två rum (u4: 1p/3p) så
best-room-**selektionen** diskrimineras (negativ-kontroll: selektions-drift -> u4-assertionen rödnar).
## 2026-06-16 , T93 (#186): Idag-vyn rullar till nästa matchdag när dagens sista match är slut (rollover)

**Beslut:** Den auto-valda ("följ verklig dag") dagen i Idag-vyn väljs nu av `followDayIndex`
(use-daily-matches.ts), inte enbart `initialDayIndex`. Regeln ovanpå kalender-valet: är HELA den
kalendervalda dagens speldag FÄRDIGSPELAD (`status === 'finished'` för varje match den dagen) rullar
vyn fram till dagen som rymmer NÄSTA KOMMANDE match. "Nästa kommande" hämtas ur EXAKT samma logik som
hero:ns nedräkning (`computeCountdown`), så dagvalet och nedräkningen är EN sanning och inte kan
divergera. Vald dag (datum-rad + hero + matchlista) rullar tillsammans.

**Källa till regeln (domän, källhänvisad):** "nästa svenska kalenderdag" är inte en gissning utan en
följd av tidszonen. En match med svensk avspark 00:00 (t.ex. Saudiarabien-Uruguay, kickoff
`2026-06-15T22:00:00.000Z`) tillhör den svenska kalenderdagen 16 juni i Europe/Stockholm (sommartid
UTC+2), inte UTC-dygnet 15 juni , samma off-by-one-skydd som `localDateKey`/`groupMatchesByDay` redan
bär. Verifierad empiriskt mot fixtures-schemat (`src/data/wc2026/matches.ts`): civ-ecu spelas svensk
15 juni 01:00, ksa-uru svensk 16 juni 00:00. Daniels skärmdump (~2026-06-15 23:07) bekräftar
beteendet: nedräkningen pekade rätt (ksa-uru) men hero stod kvar på den spelade civ-ecu.

**Varför:** asymmetri , nedräkningen (`computeCountdown`, tick-driven över ALLA matcher) rullade
korrekt vid dygnsgränsen, men dagvalet var rent kalender-baserat och rullade bara vid kalender-midnatt.
Sent på kvällen, när dagens matcher var slut men nästa avspark redan låg på nästa svenska dag, föll
`selectMatchOfTheDay` tillbaka på dagens tidigaste (spelade) match. Genom att låta dagvalet anka på
samma nästa-avspark-sanning som nedräkningen försvinner asymmetrin.

**Bevarat (rör inte det som inte är trasigt):** dagens speldag har ännu en OSPELAD match (kommande
eller live) -> stå kvar på idag; idag är en VILODAG (inga matcher) -> C7:s vilodags-val behålls
(rollover gäller "när dagens sista match är slut", en vilodag har ingen sådan); före turneringen ->
premiären; efter sista matchen (ingen kommande) -> sista dagen. Tester (use-daily-matches.test.tsx):
Daniels exakta scenario (enhet + hook end-to-end), live-match-idag, mellan-dagar, sista speldagen,
vilodag, före turneringen, tom lista. Negativ-kontroll: rollover avstängd -> exakt de 3
rollover-asserterande testerna blir röda. Spårbart: #186 + denna rad + `followDayIndex`.

**Rättning (2026-06-16, T93 F1, reviewer-fälld):** `followDayIndex` tar nu TVÅ klockor, inte en.
Kalender-basen (`initialDayIndex`) matas med `calendarNow` (det dag-granulära, inom-dygnet FRUSNA
`liveNowMs` från `useTodayKey`), men nästa-avspark-härledningen (`computeCountdown`, som filtrerar
`kickoff > now`) matas med `realtimeNow` (det per-sekund tickande `nowMs`, samma klocka som hero:ns
nedräkning). VARFÖR: en PWA-flik öppen hela dagen fryser `liveNowMs` vid dygnets början; matades
`computeCountdown` den frusna klockan plockade den en match som redan kickat igång tidigare samma dag
-> `nextKey` = dagens datum -> rollovern firade ALDRIG (exakt Daniels bugg återinförd). De injicerade-
`now`-testerna missade detta för att de gav `liveNowMs === nowMs` (alltid färskt), så den dag-frusna
grenen aldrig kördes. Nytt test (use-daily-matches.test.tsx): den dag-frusna grenen körs MEDVETET
(kalender-klocka fryst vid dygnets början, realtids-klocka på kvällen) på både enhets- och hook-nivå;
negativ-kontroll: delad klocka -> hook-testet rödnar (`'2026-06-15'` i st f `'2026-06-16'`).

## 2026-06-15 , T83 (#175): flik-app , routning, scroll-modell, sim-läge över flikar (utfall av v2-inceptionens öppna beslut)

T83 byggde flik-IA:n och avgjorde de tre öppna design-besluten v2-inceptionen listade nedan.

**Beslut 1 , routning: hash + history.pushState, INGEN router-dependency (YAGNI, PRINCIPLES §11).**
Appen har EN navigerings-axel (en av fem flikar), inga nästlade rutter, inga route-parametrar,
ingen route-baserad kod-splitting (alla paneler är ändå monterade, se beslut 4). En `location.hash`
(`#/idag`) + `history.pushState` räcker EXAKT för alla tre krav: delbar fliklänk, bakåt-knapp (en
history-post per flik-byte), djuplänk vid kall-laddning (initial flik läses ur hashen vid montering).
Ett router-paket (react-router m.fl.) vore bärvikt vi inte behöver. **Hash framför path** eftersom
appen är en statiskt hostad SPA (Cloudflare Pages) utan server-rewrite: en path-rutt (`/tips`) ger
404 vid direkt-laddning, medan en hash alltid serveras av index.html. Ren mappnings-logik i
`tab-routing.ts` (testbar fristående), window/history-IO i `use-tab-routing.ts`.

**Beslut 2 , scroll-container: EN sid-scroll, ingen nästlad scroll per flik.** Varje flik scrollar
i sidans egna scroll (window), ingen flik äger en egen inre scroll-container. Den enda inre scrollen
i appen är total-topplistans virtualiserade fönster (`CollapsibleScrollList`, T82 del 4, oförändrad).
Eftersom bara EN flik-panel är synlig åt gången (resten `hidden`/display:none, tar ingen höjd) blir
varje fliks scroll ren av sig själv. Detta är förutsättningen för F1-fixen (sticky följer sid-scroll).

**Beslut 3 , sim-läge över flikar: GLOBALT state, frame per simulerad flik, EN hemvist för kontrollen.**
What-if-läget bor redan globalt i den delade results-storen (`ResultsProvider` omsluter hela skalet,
oförändrat). Flik-IA:n delar den gamla sammanhängande sim-zonen mellan Idag (daily) och Turnering
(tabeller/träd/"vad krävs"). Beslut: VARJE flik som visar en simulerad vy bär sin egen `SimulationFrame`
(ring + tint + sticky "Simuleringsläge"-badge när läget är PÅ) , Idag och Turnering har var sin frame.
Frame:n är en REN wrapper som läser sim-seamen (`simulating`) ur storen, så två frames kan stå i två
flikar utan dubblerad state (en sanning). What-if-KONTROLLEN (`SimulationBanner`: Starta/Återställ/
Avsluta) + resultatinmatnings-grinden (`ResultEntryGate`) får EN tydlig hemvist: **Turnering**, direkt
ovanför inmatningen (där sim-läget är mest meningsfullt , man spelar ut tänkta resultat och ser
tabeller/träd ändras). Inga regressions: sim-flödet (starta/avbryt, badge, frame-attribut) bevisat i
e2e (flows.spec, Turnering-scopat) + de oförändrade simulation-enhetstesterna.

**Beslut 4 , alla flik-paneler MONTERADE samtidigt (inaktiv = `hidden`), inte villkorlig rendering.**
Att rendera bara den aktiva fliken skulle (a) TAPPA vy-state vid flik-byte (formulär-inmatning, sök,
utfällt läge, motion-layout-position lever i lokal useState , samma klass T82 del 4 skyddade genom
`hidden` i stället för unmount), och (b) göra topplistan "kall" vid byte (ny hämtning). Med alla
paneler monterade delas providers + live-data, och en `hidden` panel är ur layout OCH ur a11y-trädet
(display:none), så skärmläsaren ser bara den aktiva fliken och varje flik scrollar rent. Bonus: de
befintliga smoke-/integrationstesterna hittar allt innehåll i DOM:en (men `getByRole` ser inte roller
i en `hidden` panel , därför navigerar App.test/e2e till rätt flik före roll-assertioner, vilket
också bevisar vy-växlingen end-to-end).

**Sektions-navet (T78/T79) avvecklat:** hela `src/features/section-nav/` borttaget (chip-rad, mobil-
hamburgare, scroll-spy, sticky-band-offset, self-registrering), inga döda referenser kvar.

## 2026-06-15 , T83 (#175): F1 sticky "följ-med"-kontroll , root cause + fix (containing block)

**F1-buggen (Daniel + T82 del 4-entryn nedan):** den sticky komprimera-/"visa färre"-baren följde inte
sidans scroll , den "fäste i ett inre fönster och gled ur vy", och fanns bara i några sektioner.

**Root cause (verifierat):** `StickyFollowToggle` renderade den sticky baren (`position: sticky; top-16`)
och den långa listan som SKILDA SYSKON. En `position: sticky`-yta kan bara klistra och FÖLJA MED inom
sin egen CONTAINING BLOCK = föräldraelementets innehållsbox (CSS Positioned Layout L3 §6.2). När baren
låg ensam i en wrapper med bara sin egen höjd fanns NOLL sträcka att följa med längs, så den skrollade
ur synhåll direkt. (Det var INTE en faktisk nästlad overflow-scroll , den enda sådana är total-
topplistans avsiktliga fönster.)

**Fix:** baren OCH listan delar nu EN containing block , listan skickas som `children` till
`StickyFollowToggle` och renderas i SAMMA wrapper EFTER baren. Då sträcker sig containing block:en över
hela listans höjd, så `sticky top-16` klistrar baren under sajt-headern (~64px) och följer med ända ner
i listan. **Bevisat:** (a) enhetstest på den strukturella invarianten (bar + lista delar parent) med en
negativ-kontroll som rödnar om listan åter blir ett syskon; (b) browser-probe , bar-topp 337px före
scroll, 64px efter att ha scrollat 800px ner (klistrad under headern, inte bortglidd). Tillämpat på ALLA
tre konsumenter (resultat-listan, per-rums-topplistan, tips-listan), så täckningen är komplett där
mönstret hör hemma. Källa: `src/components/collapsible-list/StickyFollowToggle.tsx` + `.test.tsx`.

**Sticky-TÄCKNINGS-inventering (alla långa listor/sektioner per flik):**
- Tips: match-tips-listan (`PredictionsView`, StickyFollowToggle , fixat) ✓; grupp-tips + bracket-tips
  använder höjd-klipp-primitiven `CollapsibleSection` (T68, responsiva grid/träd, inte platta listor ,
  rätt mönster, MEDVETET ingen StickyFollowToggle, se T82 del 4 nedan); rums-sektionen ingen lång lista.
- Topplista: per-rums-topplistan (`LeaderboardView`, StickyFollowToggle , fixat) ✓; total-topplistan
  (`CollapsibleScrollList`, eget virtualiserat fönster + inre sticky kontroll-rad, oförändrad) ✓.
- Turnering: gruppspel/"vad krävs"/slutspelsträd använder `CollapsibleSection` (höjd-klipp, medvetet);
  resultatinmatningen (`ResultEntryView`, StickyFollowToggle , fixat) ✓.
- Idag: daily har datum-bläddring (inte en lång platt lista).
- `ScoreGuide` (poäng-förklaringen, i Tips + Topplista): är en MODAL-dialog med egen inre scroll
  (`max-h-[92dvh]` + overflow-y-auto), INTE en lång inline-lista , StickyFollowToggle är därför inte
  rätt mönster för den (modalens egen scroll är rätt). Ärligt noterat: täckningen gäller inline-listor;
  ScoreGuide täcks av sitt eget dialog-mönster (se Findings F2 i handoff).

---

## 2026-06-15 , v2-inception: appen blir en flik-app (5 flikar), inte en lång sida

Faserna 0-3 är levererade och appen är live. Ägaren godkände ett v2-bygge (SPEC §13). Det
bärande beslutet: gå från EN lång sida + sticky chip-rad (sektions-navet T78/T79) till en
**flik-app med fem flikar** (Idag, Tips, Topplista, Turnering, Mer), flik-rad längst ner på
mobil (sport-app-mönster), responsiv till top-/sido-nav på större skärm.

**Varför:** den långa sidan skalade inte , för mycket på en gång skrämmer användaren, och chip-
raden räckte inte (den hoppar bara, den fokuserar inte). Fokuserade flikar visar bara det
relevanta. Befintliga vyer återanvänds oförändrat i sak; bara placering + navigering ändras
(återanvänd, bygg inte om).

**Kopplat beslut , scroll/sticky:** scroll-modellen görs om i flik-strukturen, och sticky-buggen
(komprimera-kontrollen följer inte sidans scroll, den fäster i ett inre fönster , se T82-del-4-
beslutet nedan + `StickyFollowToggle` `top-16`) löses holistiskt där, på ALLA långa listor.

**Öppna design-beslut som T83 äger (logga utfallet här under bygget):**
- Routing-modell (state + history/hash vs router-dependency).
- Scroll-container-ägande (vem äger scrollen per flik).
- **SimulationFrame/what-if spänner nu över flera flikar:** sim-läget omsluter i dag daily +
  gruppspel + "vad krävs" + slutspelsträd + resultatinmatning som EN zon med en sticky badge.
  Flik-IA:n delar zonen mellan Idag (daily) och Turnering (tabeller/träd/scenario). T83 måste
  besluta: sim-läget blir globalt state, varje flik som visar en simulerad vy bär sim-ramen/badgen,
  och what-if-kontrollen (Start/Återställ/Avsluta) + `ResultEntryGate` får EN tydlig hemvist.

**Orört i v2:** live-pollaren + bot-/seednings-lagret (live och fungerar).

## 2026-06-15 , T82 del 4 (#173): "sticky kontroll-rad + börja-komprimerad" bruten till delad byggsten + applicerad på de långa listorna

Ägaren gillade total-topplistans sticky kontroll-rad ("följer med i listan") + att listan börjar
komprimerad, och ville ha SAMMA mönster på alla långa listor, samt att resultat-listan längst ned
"börjar bli lång bör startas komprimerad med några resultat synliga".

**Beslut 1: bryt ut mönstret till EN husplats med TVÅ varianter** (`src/components/collapsible-list/`),
valda per lista efter dess tvång (rule-of-three uppfyllt: total + resultat + tips + per-rums):
- **Virtualiserat scroll-fönster + inre sticky kontroll-rad** (`CollapsibleList`/`CollapsibleScrollList`,
  + den FLYTTADE delade `use-virtual-rows`) för fristående rader. **Total-topplistan refaktorerades att
  KONSUMERA den** , dess beteende + alla dess tester är OFÖRÄNDRADE (den var redan granskad).
- **Sticky FÖLJ-MED-toggle** (`StickyFollowToggle`) för listor som INTE kan virtualiseras: dag-grupperade
  resultat/tips (osparad inmatning bevaras via `hidden`, virtualisering skulle unmounta + tappa den) och
  per-rums-topplistan (motion-layout-glidet kräver mountade rader). Den klistrar BARA komprimera-kontrollen
  (top-16, under headern) i utfällt läge; fönster/inmatning/sortering oförändrade.

**Beslut 2: resultat-listan + tips-listan får sticky FÖLJ-MED, inte ett scroll-fönster.** De "börjar redan
komprimerade" (3-dygns- resp dagens-fönster, oförändrat); det nya är att den övre komprimera-kontrollen blir
sticky i utfällt läge så den följer med ner i den långa listan. VIRTUALISERAS MEDVETET INTE: resultat-/tips-
formulären håller osparad inmatning i lokal `useState` och bevaras via `hidden`-på-`<li>` , en virtualisering
(som unmountar rader) skulle tappa den. Inmatning + validering rörda = noll (taskens hårda krav).

**Beslut 3: per-rums-topplistan börjar komprimerad (topp-N) över en längd-tröskel, INTE virtualiserad.**
Seedade rum kan ha ~200 deltagare (bot-seed-planen), så lång nog att tjäna på det. Men dess signatur är
motion-layout-glidet (rader glider till ny plats vid poäng-ändring), som kräver mountade rader , därför
slice:ar vi bara den renderade mängden (topp-N komprimerat, allt utfällt) och låter `AnimatePresence` sköta
in/ut, ingen virtualisering. Korta rum (<= tröskeln) är OFÖRÄNDRADE (ingen toggle).

**Medvetet ORÖRDA:** gruppspels-tips, slutspelsträd, scenarier, gruppspelstabellen och bracket-tips
använder REDAN den delade höjd-klipp-primitiven (`CollapsibleSection`, T68) , de är RESPONSIVA grid/träd,
inte platta rad-listor, så "sticky kontroll-rad som följer en lista" passar inte (höjd-klippet är rätt
mönster för dem, och de börjar redan komprimerade). Kommentar-tråden har sin egen chat-/load-more-semantik.

**Beslut 4 (F1, reviewer-fynd): nav-ordningen rättad + mekaniskt vaktad.** `totalLeaderboard.order` var 75
men sektionen MONTERAS efter per-rums-topplistan (order 80), så chip-raden inverterades mot sidan i live-
läge (Global listades före Topplista men scrollade efter den). Satt till **85** (speglar monterings-
ordningen). Ett nytt test (`section-order-mirrors-mount.test.ts`) läser App.tsx, sorterar sektionerna på
deras FAKTISKA mount-position och kräver strikt stigande `order`, så driften fångas mekaniskt framöver.

Kontrast MÄTT i webbläsaren på renderad yta (båda teman): komprimera 15.2/17.9, sök-fält 12.7/17.9,
resultat-bar-knapp 9.8/13.4 (alla >> 4.5). Visuellt verifierat i `.vmshots/` (total + resultat, komprimerad
+ sticky mitt i listan). Recept: `docs/patterns.md` (sticky-kontroll-rad-...-borja-komprimerad).

## 2026-06-15 , Global topplista: sticky kontroll-rad (komprimera nåbar från alla scroll-lägen) (#173)

UX-tillägg ovanpå T82 del 3. Ägaren testade UI:t och hittade en riktig miss: "Komprimera"-kontrollen
satt bara OVANFÖR det utfällda scroll-fönstret, så stod man på plats ~100 i den utfällda listan tvingades
man skrolla tillbaka till toppen för att fälla in den. Helt korrekt fynd.

**Beslut: en STICKY kontroll-rad INUTI scroll-fönstret, inte en toggle ovanför det.** Sök-fältet,
"Hoppa till mig" OCH en "Komprimera"-kontroll bor nu i en `position: sticky; top: 0`-rad högst upp i det
scrollande fönstret (`.vm-total-controls`, tokens.css §26), så de FÖLJER MED när man bläddrar djupt i
listan. Komprimera är därmed alltid ETT tryck bort, oavsett om man står på plats 3 eller 203. Den sticky
raden har en OPAK surface-fond + hårfin nederkant + mjuk skugga, så raderna som skrollar under den aldrig
lyser igenom eller flimrar (anti-jitter). Verifierat pinnat till fönstrets topp i ALLA bredder (280px
vikbar cover -> 1920 ultrawide) + båda teman.

**Varför sticky rad och INTE en flytande "Komprimera"-knapp:** appen har redan en flytande/diskret
"Hoppa till mig", och en andra flytande knapp i samma hörn riskerar att krocka visuellt + skymma rader. En
sticky kontroll-RAD samlar alla tre kontrollerna (sök/hoppa/komprimera) på ETT ställe som följer med,
vilket är mindre visuellt brus och en tydligare mental modell ("kontrollerna sitter alltid överst i
listan") än flytande knappar. På vikbar cover (~280px) WRAPPAR hoppa+komprimera till två full-bredds-pillar
(flex-wrap + flex-1) så ingen knapp klipps; på sm+ sitter de inline.

**Beslut: View duplicerar inte sin egen expand-toggle i utfällt läge.** I KOMPRIMERAT läge äger View:n
"Visa alla N"-toggeln (med `aria-expanded`/`aria-controls`); i UTFÄLLT läge tar listans sticky
"Komprimera" över som den kanoniska komprimera-kontrollen (samma `aria-controls`). Annars skulle View:ns
toggle skrolla ur synhåll, vilket var hela problemet. Fokus återförs till "Visa alla N"-toggeln när listan
komprimeras via den sticky kontrollen (en `useEffect` kör efter att toggeln åter-monterats), så ingen
tangentbords-fokus tappas när den sticky kontrollen avmonteras.

**A11y:** komprimera-kontrollen är en riktig `<button>` (tangentbords-nåbar, fokus-ring via befintlig
`.vm-total-control:focus-visible`), bär `aria-expanded="true"` + `aria-controls="total-leaderboard-full"`,
och kontrast på den faktiskt renderade sticky-raden uppmätt (knapp-etikett 15.24:1 mörkt / 17.91:1 ljust,
getComputedStyle, inte mot hex). Ingen horisontell scroll vid 280px (scrollWidth 360 <= 375).

---

## 2026-06-15 , Total (cross-rum) topplista T82 del 3 (#173)

Den GLOBALA topplistan: en enda rankning av ALLA deltagare (botar + riktiga) över ALLA rum, vid
sidan av den befintliga per-rums-topplistan (T17). Bygger UI:t + demo-fixtures + wiringen ovanpå den
redan testade aggregeringen (`aggregate-total.ts`, byggd i del 3 av tasken).

**Beslut: aggregerings-regeln = SUMMA per rum, rangordna globalt.** En deltagares totala poäng =
summan av deras poäng ÖVER ALLA rum de är medlem i. Vi räknar INTE poäng på nytt (DRY, en sanning):
vi kör den befintliga, testade poäng-motorn (`buildLeaderboard`) PER RUM och summerar varje distinkt
deltagares per-rums-totaler. Match-/grupp-/bracket-/mästar-reglerna, facit-mappningen och
tiebreak-måttet (exakta träffar, sedan namn alfabetiskt; delad "1224"-rank vid lika poäng) ärvs
oförändrade. **Varför summa per rum (inte sammanslagna tips-listor):** en deltagare kan vara med i
flera rum och tippa SAMMA match i båda. Regeln är "summan över alla rum", så två rum ger poäng två
gånger (en per rum). Att i stället slå ihop tips-arrayerna och poängsätta en gång skulle tappa det
andra rummets bidrag (en match räknas en gång i `scoreMember`). N i "X:a av N" = antalet DISTINKTA
deltagare i totalen (en deltagare i tre rum räknas EN gång i N, men får sina tre rums poäng
summerade). Regeln + härledningen bor också som modul-doc överst i `aggregate-total.ts`.

**Beslut: Rhodos (och alla andra rum) läses som vilket rum som helst, READ-only.** Aggregeringen rör
ALDRIG data, den läser och summerar. Ingen tyst special-hantering av ett enskilt rum. Skulle en
sådan regel behövas vore den explicit + dokumenterad här, inte gömd i summeringen. INGEN anledning
funnen att special-hantera Rhodos i denna task (flaggas i handoff om det ändras).

**Beslut: en EGEN `TotalLeaderboardProvider`, miljö-gatad, INTE en utökning av den per-rums
`LeaderboardProvider`.** Per-rums-providern laddar bara DET AKTIVA rummets medlemmar + RLS-synliga
tips; totalen behöver bidrag från ALLA `myRooms`. En egen provider håller den per-rums-vyn orörd
(bryt inte T17) och bär totalens egna data-väg. I DEMO/fixtures-läge bygger den `RoomContribution[]`
ur en deterministisk demo-fixturuppsättning (botar). I LIVE-läge skulle den hämta per-rums-tips för
alla `myRooms` och bygga samma `RoomContribution[]`. **Ärlighet om live-vägen:** demo-vägen är den
som visuellt + test-verifieras i denna task (off-season, inget live-backend). Live-hämtningen följer
exakt samma per-rum-API:er som T17 redan använder (`listRoom*Predictions` + `listMembers`), så den
tänds utan ny aggregerings-kod, men den live-grenen körs inte skarpt förrän VM och flera rum finns.

**Beslut: DEMO-fixtures genereras ur bot-motorn (T82 del 1) mot ett DELVIS spelat facit.** För att
totalen ska se FYLLD ut direkt (~240 deltagare med spridda poäng) i dev/demo genererar vi personas
(`generatePersonas`) + tips (`generateBotPredictions`) mot ett facit där en del av gruppspelet
markerats spelat. Botarna sprids över hela listan (capAccuracy 0.62 håller dem under en topp-spelare,
T82 del 1). Fixtures uppfyller KÄLLANS schema-typer (`RoomMember`, `MemberPredictions` =
`Prediction`/`GroupPrediction`/`BracketPrediction`), inte konsument-formen (lessons: fixtures mot
källans schema, annars döljs mappnings-drift). Den DELADE, riktiga `derivePoolFacit` används för
facit (samma form live väver in), så aggregeringen bevisas mot den riktiga skarven.

**Beslut: virtualisering hand-rullad (ingen ny dependency).** Utfällt läge renderar 240+ rader som
EN scroll men virtualiserad: bara synliga rader (+ overscan) ligger i DOM:en, mätt mot scroll-position
och fast radhöjd. PRINCIPLES §11 (minimera beroenden, lägg inte till ett paket för något trivialt):
fast-höjd-windowing är en liten, väl förstådd beräkning (scrollTop + viewport -> synligt index-spann),
så vi skriver en fokuserad `useVirtualRows`-hook i stället för att dra in `@tanstack/react-virtual`.
Egen rad + topp-3 ligger UTANFÖR det virtualiserade fönstret (alltid renderade), så "din placering"
och pallen aldrig kan saknas ur DOM:en även om de skrollats förbi.

**Beslut: placering = EGEN prominent sektion ("Global topplista") överst i tävlings-ytan.** Totalen
får ett eget chip i sektions-navet (`SECTIONS.totalLeaderboard`) och renderas FÖRE den per-rums
topplistan, men inom samma live-gate (syns bara i live-läge, som de andra sociala sektionerna).
"Din placering"-hjälten överst i sektionen gör att den inloggade spelarens egen position aldrig är
svår att hitta (ägarens uttryckliga krav). Egen rad är dessutom färg-OBEROENDE framhävd (accent-ring
+ "DU"-bricka + tint, återbrukar T17:s `.vm-board-row[data-self]`-recept) både i komprimerat och
utfällt läge.

---

## 2026-06-15 , Bot-seedning T82 (#173): atmosfär-botar, datalager + säkert seed-skript

Bygger datalagret + det säkra seed-skriptet för ~240 diskreta "atmosfär"-botar (del 1 av flera).
Liv-lagret (kommentarer/reaktioner) är nästa task; persona-fälten för det definieras redan nu.

**Beslut: fördelning ~240 botar = 200 (20 nya rum, ojämnt) + 35 ('VM 2026') + 5 ('Full Stack
United', coola smeknamn).** Källa: Daniels bot-seeding-plan (memory `vm2026-bot-seeding-plan`,
2026-06-15). New-room-botarna tippar ALLT inkl. spelade matcher (får poäng, sprids över hela
topplistan); vm2026/fsu tippar bara kommande matcher (börjar på 0). Rhodos-rummet rörs ALDRIG.

**Beslut: poäng-skiktningens TAK = capAccuracy 0.62 (konfigurerbart), floor 0.15.** Varför just ett
tak under 1: en bot får ALDRIG kunna toppa topplistan (skulle döda tävlings-känslan mot riktiga
vänner). 0.62 är satt under vad en stark riktig spelare rimligen når (~0.9 i referens-testet), och
bevisas i predict.test.ts (60+ botar håller sig under en stark referens-spelare, topplistans 1:a är
spelaren inte en bot). Skiktningen modelleras genom att, per poängsatt enhet, med sannolikhet
`accuracy` (= skill_tier skalat in i [floor, cap]) kopiera FACIT, annars generera ett rimligt fel.
Detta är MIN design (T82), inte en extern regel; poäng-VÄRDENA (3/1, grupp 3/2, bracket 1..5,
mästare 20) återanvänds oförändrade ur den befintliga motorn (score.ts/bonus-score.ts), de gissas
inte om.

**Beslut: determinism via egen seedad PRNG (mulberry32).** Källa för algoritmen: mulberry32 (Tommy
Ettinger, publik domän), inline-citerad i prng.ts. Vald för att seedningen ska vara reproducerbar
(samma seed -> samma personas + tips), så en dry-run alltid matchar en senare live-körning och
fördelningen kan testas. Medvetet INTE kryptografisk (ingen säkerhet hänger på oförutsägbarhet).

**Beslut: idempotens-ankaret = `bot_accounts.persona_key` (UNIQUE).** Registret bot_accounts är
hela seedningens ångerknapp (user_id FK -> auth.users ON DELETE CASCADE: radera kontot => cascade
städar medlemskap + tips). persona_key (kohort#index, deterministisk) gör en omkörning idempotent
(redan seedade personas hoppas över). RLS deny-all (ingen klient når registret), samma mönster som
app_config (T80). Seed-skriptet: dry-run default, --live/--teardown bakom env (service_role aldrig
committad), Rhodos uteslutet i den rena planeraren, och ett FÖRE/EFTER-skydd som räknar riktig
(icke-bot) data och avbryter om den ändras. Byggaren kör aldrig live; koden är ändå körbar för ägaren.

**Beslut (fix-pass): rumskoden för ett seedat rum härleds INJEKTIVT (bas-32-växling), inte via en
siffer-bump.** rooms.code är UNIQUE (rooms_code_format `^[a-z2-9]{4,12}$`, T14-migrationen). Den
första `roomCodeForIndex` byggde koden som `'liga' + String(index+22)` med en `<2 -> +2`-bump , den
är INTE injektiv (index 8 och 10 gav båda `liga32`), så det 11:e rum-insertet hade kastat på UNIQUE
mitt i en skarp körning. Fixen bas-växlar index till `ROOM_CODE_ALPHABET` (32 tecken, bijektion),
noll-paddat till 3 tecken = 32^3 = 32 768 unika koder (`liga` + 3, längd 7, inom 4-12). Bor i
`src/data/rooms/room-code.ts` (samma sanning som alfabetet, kan aldrig drifta), enhetstestat över
hela domänen (alla N unika + format-regex, negativ-kontroll körd mot den gamla varianten -> rött).

**Beslut (fix-pass): före/efter-skyddet räknar icke-bot-data SERVER-SIDE (RPC), inte via en
NOT-IN-lista i URL:en.** Den första versionen fogade ~240 bot-UUID:er (~8,9 kB) i ett PostgREST
`not in`-filter i GET-URL:en, nära/över URL-längd-taket , efter-räkningen (som körs EFTER
skrivningarna) kunde då faila och lämna en halv-seedad DB. Fixen: en SECURITY DEFINER-RPC
`count_non_bot_rows(p_table)` (migration `20260615140000_t82_count_non_bot_rows.sql`) som gör NOT-IN
i SQL (`not exists`-subquery mot bot_accounts), så URL:en bär bara tabellnamnet. p_table allowlist:as
till `room_members | predictions`, EXECUTE bara service_role (samma mönster som apply_auto_facit, T80).
Skydds-BESLUTET (kasta vid ändrad räkning) bröts ut till en ren, enhetstestad funktion
(`src/data/bots/seed-protection.ts`), så nätet bevisligen kan kasta (negativ-kontroll körd).

**Beslut (fix-pass): Rhodos-vakten gjordes ÄKTA (kollar planen mot Rhodos id, kan faktiskt utlösa).**
Den gamla `assertRhodosUntouched` jämförde `rhodos.name === VM2026_ROOM_NAME` , men `findRoomByName`
hade redan matchat på namnet 'Rhodos', så jämförelsen var alltid falsk och vakten kunde ALDRIG kasta
(PRINCIPLES §8: en fail-loud som inte kan faila är teater). Fixen kollar den FÄRDIGA planen: om Rhodos
finns i snapshot:en, kasta om något planerat 'existing'-mål refererar Rhodos id. Finns Rhodos inte i
snapshot:en är det en säker no-op (inget id att råka peka på). Negativ-kontroll körd (en plan som
pekar på Rhodos id -> vakten kastar).

## 2026-06-15 , Bot-liv-lagret T82 del 2 (#173): reaktioner + sparsamma kommentarer

Liv-lagret som får sidan att kännas naturligt LEVANDE utan att spamma. Ägarens regel (HARD):
kommenterar ibland, inte för mycket; blir en kommentar inte naturlig är det BÄTTRE att boten är tyst
och bara reagerar. Reaktioner är primärt + billigt, kommentarer en sällsynt krydda.

**Beslut: match-stämning (mood) härleds ENBART ur det facit faktiskt bär (ordinarie Scoreline).**
`moodFromScoreline` (src/data/bots/match-mood.ts) klassar en spelad match som målfest / mållöst /
oavgjort / rafflande / klar seger / knapp seger. Vi härleder MEDVETET INTE "skräll" (kräver
odds/förväntan) eller "sen vinst" (kräver matchminut) , den datan finns inte i facit-formen
(`PoolFacit.matches[i].actual = Scoreline`, derive-facit.ts), och att hitta på dem ur en ren siffra
vore en gissning maskerad som fakta (lessons "lattgissad-domanregel-styr-otestad-gren"). Prioritets-
ordningen (målfest före thriller osv.) är en VAL-invariant, testad med diskriminerande fixturer
(en 4-3 = målfest, inte thriller) + negativ-kontroll (operator-mutation rödnar). Mood är EN sanning
som både reaktions- och kommentar-genereringen läser (DRY).

**Beslut: emoji-reaktioner styrs av mood + ton, ALLTID ur den kurerade 8-listan.** `generateBotReactions`
(react.ts) väljer emoji ur en mood-palett (målfest -> ⚽/🎉, mållöst -> 🧊 osv.) med en liten ton-nyans,
alltid ur klientens `REACTION_EMOJIS` (reactions-api.ts) som speglar DB:ns `room_reactions_emoji_allowed`
-CHECK 1:1 (en sanning). Kadens via personans `reactionChance` (0..0.5), spritt (seed per index), en
reaktion per (bot, match) = PK-invarianten. Kohort: new-room reagerar på SPELADE matcher (de var med),
vm2026/fsu på KOMMANDE (de har inte sett facit) med en neutral "het match"-emoji 🔥.

**Beslut: kommentarer är KURERADE svenska fraspooler per (mood, ton), med en TYSTHETS-DEFAULT.**
Poolerna (comment-pools.ts) har FLERA varianter per (mood, ton) så texten varierar (inte mekaniska
mallar som upprepas , det skulle se botigt ut). En bot kommenterar en spelad match bara om (a) den
är new-room OCH (b) en dragning < `commentChance * COMMENT_SCALE` (0.35) faller , annars INGEN
kommentar (boten är tyst). Sparsamheten är BEVISAD kvantitativt (en högt pratig bot kommenterar
~5 % av matcherna, summan över alla botar < 15 % av taket) + tysthets-defaulten testad (lågbenägen
bot i en mållös turnering = 0 kommentarer, med negativ-kontroll som rödnar). Det finns ingen extern
"rätt" formulering att källåkra , poolerna är ett medvetet designval, inte en gissad regel.

**Beslut: "svar mellan botar" approximeras som följd-fraser i samma match-tråd (schemat saknar svars-
koppling).** room_comments har INGEN parent_id/reply-kolumn (bekräftat i migrationerna
20260612103836_t66 + 20260613144345_t77: bara en nullable `match_id` som delar in i match-trådar,
ingen rad-till-rad-referens). En bot kan alltså inte peka ett svar på en SPECIFIK kommentar. `planReplies`
(comment.ts) lägger därför sparsamt en kort medhålls-fras i en tråd som REDAN har minst en ANNAN bots
kommentar (en giltig befintlig konversation, aldrig ett svar i en tom/egen tråd), per rum (svar korsar
aldrig rum). Ärlig avvägning: det läses som ett svar utan att vara en hård FK-länk. Vill vi senare ha
äkta trådar krävs en parent_id-migration (ej i scope här).

**Beslut: kommentar-idempotens via deterministisk id (room_comments saknar naturligt unik-index).**
En bot kan ha flera kommentarer per match, så det finns ingen `(rum,bot,match)`-unikhet att upserta på.
Exekvereraren (seed-bots.ts) härleder ett DETERMINISTISKT uuid (v5-stil SHA-1 över rum+bot+match+isReply
+body) och upsertar på `id`, så en omkörning byter raden i stället för att dubbla. Reaktioner upsertas på
sin PK `(room_id,user_id,match_id)` (samma modell som klientens upsertMyReaction). Teardown städar båda
via cascade (FK on delete cascade mot auth.users, verifierat i migrationerna). Rhodos-vakten utökad att
täcka liv-lagret (reaktioner + kommentarer riktas också mot rum), negativ-kontroll körd: reaktions-/
kommentar-grenen kan utlösa på egen hand (membership/prediction-grenen bortmuterad -> vakten kastar ändå).

## 2026-06-15 , Livescore pollare-v3: per-match-polling med fönster-gating (full rik data LIVE)

Byter pollarens modell: en LIVE match får full rik data UNDER matchen (målskytt/assist/kort/
byten/statistik/laguppställning), inte bara vid slutet, OCH pollaren slår bara mot API:t under
match-tid (inga anrop mellan matcher). Daniels poll-modell. Ersätter v2:s "live=all varje tick +
rik data bara vid freeze".

**Beslut: FÖNSTER-GATING (`selectInWindowMatches`, ren + mirror).** Ur den inbäddade matchplanen
väljs de matcher vars kickoff ligger i live-fönstret NU: `kickoff ∈ [now - 3,5h, now + 5min]`
(`LIVE_WINDOW_AFTER_MS` / `LIVE_WINDOW_BEFORE_MS`). Ingen match i fönster OCH inga ofrysta att
facit-kolla -> pollaren HOPPAR hela ticket (0 API-anrop). **Inga anrop mellan matcher** (Daniels
HARD-krav , det är detta som gör att budgeten räcker). 3,5h efter kickoff: 90 min + paus + ev.
förlängning 30 + straffar < 3h, 3,5h ger marginal för stoppat spel/VAR. Snävare än
`FREEZE_LOOKBACK_MS` (4h) , den aktiva pollningen slutar när matchen rimligen är slut, men
facit-skyddsnätet (robust-vägen) får ett extra bak-fönster.

**Beslut: PER-MATCH FULL DATA (`buildPerMatchPollPlan` + `pollMatchFull`).** Varje MAPPAD
in-fönster-match pollas med ETT `fixtures?id=<id>`-anrop, som bär status/ställning/elapsed OCH
events/statistics/lineups INLINE (verifierat pollare-v2, `__fixtures__/fixture-aet-pen.json`: 35
events/2 statistics/2 lineups på response[0]). Blobbarna kuvert-lindas (`shapeFrozenBlobs`, samma
skarv-fix som v2) och skrivs VARJE poll med `frozen=false` medan matchen pågår, så live-kortet får
rik data LIVE. Matchen avgjord i svaret -> `apply_auto_facit` (det manuella låset, oförändrat) +
`frozen=true`. EN delad skriv-helper för per-match- och robust-vägen (en sanning för facit-regel +
kuvert-form).

**Beslut: DISCOVERY bara när det behövs.** En in-fönster-match som saknar rad i fixture_match_map
-> ETT `live=all`-anrop + auto-mappning (`resolveFixtureToMatch`, oförändrad). När alla
in-fönster-matcher är mappade behövs INGET live=all (sparar ett anrop per tick). En match som
auto-mappas i discovery pollas först NÄSTA tick (planen kände inte dess fixture-id än) , gissar
aldrig ett id.

**Beslut (KÄLLA = Daniels budget-matte, HARD): cron */7 + hård 100/dag-vakt med FACIT-PRIO.**
~625 match-minuter/dag (mest-aktiva VM-dygn) ÷ 100 anrop = ~6,25 min/anrop -> cron-intervall */7
(sätts vid deploy). Dagsbudgeten (100, gratisnyckelns kvot) vaktas i `buildPerMatchPollPlan` (ren,
testad) OCH av hårda kollar i pollaren: `callBudgetThisTick` kan ALDRIG ta summan över 100.
FACIT-PRIO: en avgjord-men-ofryst match (status finished, frozen=false) får sitt fixtures?id FÖRE
en pågående om budgeten tryter , facit får aldrig missas. Self-contained: även om cron tickar
oftare än */7 kan summan aldrig spräcka taket. **Källa till siffrorna:** Daniels poll-modell denna
session (match-min/dag ÷ kvot), API-Footballs gratiskvot 100 anrop/dag.

**Beslut: mirror-paritet BEVISAS mekaniskt (inte bara synk-märkt).** De två nya rena funktionerna
speglas i `supabase/functions/_shared/livescore-core.ts` (Deno kan inte importera src/), och
`v3-mirror-parity.test.ts` esbuild-BUNDLAR mirror-filen och kör SAMMA diskriminerande assertioner
mot src OCH mirror (fönster-urval, facit-prio, budget-vägg, fail-loud). En en-sidig redigering av
mirror:n rödnar nu i CI (negativ-kontrollerat: muterad mirror -> rött). Det bygger det paritetstest
`docs/patterns.md` redan föreskrev men som aldrig byggdes i v2 (lärdom). Testet kör i node-miljön
(`// @vitest-environment node`) , esbuild kräver en TextEncoder/Uint8Array-invariant jsdom bryter;
`src/test/setup.ts` gatar därför sin DOM-stubbning på `HAS_DOM`.

**Avgränsning:** v3 rör BARA pollaren/data-logiken (backend). Live-kortets RENDERING (visa
målskytt/kort direkt under matchen) är frontend och hör till en design-frontend-task, inte hit.

## 2026-06-15 , Livescore pollare-v2: full lag-brygga + skarv-fix + auto-mappning + robust facit-fångst

Gör livescore-pollaren fullt autonom för HELA turneringen och fixar skarv-buggen Bit 3a fann.

**Beslut (KÄLLHÄNVISAD lag-brygga, gissas ALDRIG): full 48/48 app-lag-id -> API-Football team-id.**
Ersätter Bit 1:s medvetet ofullständiga 4-lags-brygga i BÅDE `src/data/livescore/team-bridge.ts`
(`WC2026_API_TEAM_BRIDGE`) OCH dess Deno-mirror `supabase/functions/_shared/livescore-core.ts`
(`API_TEAM_BRIDGE`). 46 av 48 är CODE-matchade mot riktig API-Football-data; cuw (Curaçao) + cod
(DR Kongo) har en API-kod-avvikelse men är ENTYDIGA (enda national-laget med det namnet, verifierat).
**Källa:** API-Footballs national-team-id, framtaget via `teams?search=<lag>&national=true` +
FIFA-trebokstavskod-match (appens lag-id = gemen FIFA-kod), cuw/cod via entydigt namn, 2026-06-15.
Bryggan definieras app->API (så en oavsiktlig dubblett blir ett objekt-litteral-fel), den omvända
API->app härleds en gång. Täcknings-/bijektions-test (48 unika API-id <-> 48 unika app-id) +
invers-rundtur vaktar den. Mirror synk-märkt mot src.

**Beslut: SKARV-FIX , kuvert-linda de lagrade blobbarna vid freeze.** Pollaren sparade tidigare
`events: rich.events ?? null` (BARA arrayen ur fixtures?id), men läs-lagrets parsers (Bit 1:s
parseEvents/parseStatistics/parseLineups) vill ha API:ts KUVERT-form `{ response: [...], errors: [] }`
(requireResponseArray läser payload.response/.errors). Skarv-buggen gjorde att en frusen match hade
visats UTAN events/statistik/laguppställning. Fix: `shapeFrozenBlobs` (ren modul `freeze-shape.ts` +
mirror) lindar varje inline-array i ett kuvert vid lagring, så producent-form == konsument-form.
**Verifierat mot riktig data:** `fixtures?id=<id>` returnerar events/statistics/lineups INLINE som
arrayer på response[0] (`__fixtures__/fixture-aet-pen.json`: 35 events/2 statistics/2 lineups), så
inga separata endpoint-anrop behövs (sparar 3 API-anrop). Skarv-test kör producent-form ->
läs-lagrets parser och bevisar full rik utdata; negativ-kontroll (gamla nakna arrayen) ger tomt.

**Beslut: AUTO-MAPPNING , självseedande fixture_match_map via inbäddad matchplan.** En live-fixture
som saknar rad i fixture_match_map auto-resolveras (`resolveFixtureToMatch`, ren + mirror): gruppmatch
via OMVÄND brygga (API-id -> app-id) + lag-par (oavsett hemma/borta) + kickoff inom 2h; slutspel (båda
lag okända) via UNIK exakt kickoff. Exakt en träff -> insert; noll/flera/ett-känt-ett-okänt ->
unresolved (gissa ALDRIG en koppling). Den kompakta planen (match_id + kickoff + lag-par) bäddas in i
edge-funktionen (`supabase/functions/_shared/embedded-match-plan.ts`), GENERERAD ur matches.ts och
VÄRDE-LÅST i CI (`match-plan.test.ts`: regenerera-och-diffa + mutationstest), samma källåkrings-mönster
som kickoff-seed. **Viktig regel:** är BARA ETT lag känt är det en seedad match vars koppling inte kan
bekräftas via bryggan -> unresolved (mappa aldrig på enbart tid när ett lag är känt, då kunde fel
match mappas).

**Beslut: ROBUST FACIT-FÅNGST , missa aldrig ett slutresultat.** Varje tick, EFTER live=all, väljer
`selectFreezeChecks` (ren + mirror) de MAPPADE matcher vars kickoff passerat (inom ett 4h bak-fönster)
och som ÄNNU INTE är frysta, och gör ett fixtures?id per styck för att härleda + frysa facit. Fångar
g-F-1-buggen (en match som faller ur live=all mellan tick innan FT sågs). Budget-gatat (facit högst
prio, spräck aldrig 100/dag) + kapat per tick (MAX_ROBUST_FREEZE_CHECKS_PER_TICK). Freeze-vägen är EN
delad helper (`freezeFacit`) för både live=all- och robust-vägen, så facit-regeln + kuvert-lindningen
är en sanning. Robust-vägen hoppar tyst-säkert en match som ännu inte är avgjord (deriveFacit
fail-loud:ar bara på faktiskt avgjorda, vi statuskollar först).

## 2026-06-15 , Livescore Bit 3a (T81): klient-läs-lager + realtime för live-data

Bit 3a är LÄS-sidan (ingen UI än, det är Bit 3b/design-frontend): hämta `match_live_data` ur
Supabase och projicera till en klient-vänlig modell (`LiveData`) via Bit 1:s parsers, plus en
realtids-prenumeration + en klock-brygga, så Bit 3b kan rendera ett livekort direkt.

**Beslut (KÄLLHÄNVISAD seam-regel, gissas ALDRIG): de jsonb-blobbarna (events/statistics/lineups) i
`match_live_data` är HELA API-Football-svar (`RawApiResponse`-KUVERT: `{ get, results, response,
errors, ... }`), inte bara `response`-arrayen.** Detta är den farligaste raden i hela Bit 3a (en gren
vars korrekthet helt avgörs av blobbens form), så den källverifieras i stället för att gissas:
- **Källa 1 (det pollaren SKRIVER):** `supabase/functions/livescore-poller/index.ts` rad 176-178
  skriver `(rich as { events?: unknown }).events ?? null` direkt ur API-Football-svaret, dvs hela
  kuvertet, inte en uppackad array.
- **Källa 2 (det Bit 1:s parsers TAR):** `parseEvents`/`parseStatistics`/`parseLineups` i
  `parse-live.ts` anropar `requireResponseArray(payload, ...)` som läser `payload.response` +
  `payload.errors`, dvs de förväntar sig KUVERTET. Direktivet bekräftar samma kontrakt ("EXAKT samma
  form som Bit 1:s parsers tar").
- **Källa 3 (de committade sample-svaren):** `__fixtures__/events-rich.json` m.fl. har nycklarna
  `{ get, parameters, errors, results, paging, response }` (verifierat 2026-06-15) , dvs kuvert-formen.
  `live-read.test.ts` matar in DE RÅA sample-svaren som DB-blobbar (?raw, samma väg som fixtures.ts),
  så testet bevisar skarven mot KÄLLANS form, inte en handskriven konsument-form (lärdomen
  mock-foljer-konsumenttyp + bevisa-skarven).

Därför kör `projectLiveData` blobben genom Bit 1:s parser. Tre fall: `null` (vanligt, live=all bär
inte rika blobbar förrän freeze) -> tom sektion; giltigt kuvert -> parserns utdata; TRASIG blob ->
fail-loud-logg i konsolen + tom sektion PER blob (en trasig events-blob släcker aldrig hela
livekortet, status/ställning/klocka lever vidare). Ingen tyst maskering, men aldrig krasch (Daniels krav).

**Beslut: två lager (samma som data-source.ts/supabase-client.ts).** `listLiveData(client)` /
`projectLiveData(row)` är rena/klient-tagande (testbara med mock-klient, exakt som
official-results-api.ts), och `getLiveData(env)` är den gate-medvetna ingången: live-läge ->
Supabase, fixtures-läge -> Bit 1:s committade live-fixtures (fixtures-först, renderbart utan backend).

**Beslut: klockan re-synkar via Bit 1:s `computeClock`, byggs inte om.** `liveClockFor(data, now)`
översätter bara `LiveData` -> `computeClock(status, elapsedMinute, lastSyncedAt, now)`. computeClock
tickar redan FRÅN `lastSyncedAt`, så varje realtids-push (ny `elapsed_minute` + `last_synced_at`)
re-synkar klockan mot sanningen, ingen drift. Fail-safe: saknad/oparsbar `last_synced_at` -> `now`
som bas (0 min sedan sync, ingen gissad tick-startpunkt, ingen NaN).

**Migration (dirigenten applicerar): `20260615120000_t81_match_live_data_realtime.sql`** lägger
`match_live_data` i `supabase_realtime`-publikationen. Verifierat read-only mot prod 2026-06-15 att
tabellen INTE redan låg i publikationen (annars hade ADD TABLE gett ett fel). NB (lärdomen
committad-migration-pastar-spegla-live): fil-versionen `...120000` är en placeholder, den FAKTISKA
live-apply-versionen sätts när dirigenten kör den, repo == live-historik gäller först efter apply.

---

## 2026-06-14 , Livescore Bit 2 (T80): Supabase-backend (persisterad live-data, auto-facit-lås, budget-gate)

Bit 2 ger livescore-featuren sin server-sida: en pollare (edge function) som under turneringen
hämtar live-data från API-Football och persisterar den, plus AUTO-facit som fyller official_match_results
när en match avslutas, utan att någonsin röra ett manuellt inmatat resultat.

**Beslut: `match_live_data` persisteras PERMANENT + fryses vid FT** (`frozen=true`). Daniels krav:
livescore ska vara bläddringsbar dagar tillbaka, så en avslutad matchs snapshot (RÅA API-blobbar i
jsonb + extraherade fält) bevaras och fryses, raderas aldrig. RLS: SELECT öppen (publik live-data,
som official_match_results), ingen skriv-policy => bara pollaren via service_role skriver.

**Beslut: `official_match_results.source` ('manual'|'auto'), default 'manual'.** Default 'manual'
SKYDDAR alla redan inmatade rader (de var per definition admin-inmatade). `upsertOfficialResult`
sätter alltid `source='manual'` (admin matar in manuellt).

**Beslut: VAR facit-härledningen bor (en sanning) , i pollaren, INTE i en plpgsql-trigger.**
Facit-REGELN (goals, inte score.extratime) är den mest fel-gissbara raden i featuren och är redan
implementerad, källhänvisad OCH testad i `parseFinalResult` (parse-live.ts). Att re-implementera den i
plpgsql vore en andra kopia som kan drifta tyst (lärdomen lattgissad-domanregel-styr-otestad-gren).
Pollaren återanvänder regeln (mirror i `supabase/functions/_shared/livescore-core.ts`, synk-märkt mot
parse-live.ts) och har dessutom hela det råa fixtures?id-svaret (inkl. score.penalty). Migrationen
äger i stället LÅSET (inte härledningen).

**Beslut: auto-facit-LÅSET = `apply_auto_facit(...)` (SECURITY DEFINER, EXECUTE bara service_role).**
Daniels HARD-krav "skriv aldrig över manuellt" är en DEKLARATIV SQL-invariant: upsertens on-conflict-gren
har `where official_match_results.source = 'auto'`. En manuell rad matchar inte => uppdateringen hoppas
=> det manuella facit står orört. INSERT-grenen fyller fortfarande TOMT. **Bevisat** med ett DO-block
(transaktion + rollback, noll data kvar) i `supabase/proofs/t80_auto_facit_lock_proof.sql`: (1) auto
fyller tomt, (2) auto uppdaterar auto, (3) auto rör ALDRIG manuellt, (4) manuell upsert vinner alltid.
Samma anda som T42:s RLS-DO-block. Dirigenten kör beviset mot live vid deploy (RAISE EXCEPTION = rött).

**Beslut: SJÄLV-budgeterande pollare (100/dag), budget i KODEN inte i cron-schemat.** `decidePollTick`
(poll-gate.ts, ren + testad, återanvänder Bit 1:s planPolls) avgör per tick om vi får polla, med facit-
fångst (freeze) prioriterad FÖRST och live=all (1 anrop) sedan, allt strikt under dagsbudgeten ur
`poll_log` (dagens räknare). Även om cron tickar oftare än var 2:e minut kan summan aldrig spräcka taket
(self-contained, negativ-kontroll körd: mutation av freeze-prioriteten rödnar testerna).

**Beslut: nyckeln i `app_config` (RLS deny-all), aldrig i repot.** MCP kan troligen inte sätta edge-
function-secrets, så API-Football-nyckeln + auto-facit-admin-id ligger i en privat tabell bara
service_role når. Migrationen skapar tabellen TOM; dirigenten inserterar värdena vid deploy (HANDOFF).

**Beslut: api_fixture_id -> appens match_id via `fixture_match_map` (inte resolveAppMatch i funktionen).**
Bit 1:s resolveAppMatch behöver hela matchplanen + lag-bryggan (klient-bundlen), som edge-funktionen
(Deno, deployar bara functions-trädet) inte kan importera utan att duplicera 104 matcher. En liten
mappnings-tabell är renaste vägen: känd koppling slås upp deterministiskt, okänd fixture LOGGAS och
hoppas (gissa aldrig). Kopplingarna seedas när en VM-fixtures id dyker upp i live=all (samma "fylls
under go-live"-princip som lag-bryggan). DEPLOY GÖRS AV DIRIGENTEN via MCP (migrations, function,
secret-insert, cron-finalisering), se HANDOFF.

## 2026-06-14 , Livescore facit: slutresultatet kommer ur `goals`, ALDRIG ur `score.extratime` (korrigering)

`parseFinalResult` (parse-live.ts) härleder en avgjord matchs facit ur API-Footballs `goals`-fält,
inte ur `score.extratime`. Detta korrigerar en tidigare bugg där AET-grenen ersatte slutresultatet
med `score.extratime` (och ett tidigare antagande i memory att extratime var KUMULATIVT).

**Källhänvisad facit-regel (gissas aldrig, verifierad mot RIKTIG data 2026-06-14):**

- `goals.home/away` = det AUKTORITATIVA slutresultatet, redan aggregerat (ordinarie + ev.
  förlängning) men EXKLUSIVE straffar. Rätt för ALLA fall: FT (goals = fulltime), AET
  (goals = fulltime + extratime) och PEN (goals = aggregatet före straffläggningen).
- `score.extratime` = ENDAST de mål som gjordes UNDER förlängningsperioden (30 min), additivt,
  ALDRIG det kumulativa slutresultatet. Får aldrig användas som facit.
- `score.penalty` = straffläggningen separat (bärs i `FinalResult.penalties` vid PEN).
- `decidedBy` härleds ur status: PEN -> 'penalties', AET -> 'extra-time', annars 'regulation'.

**Källa:** probe mot riktiga 2022-VM-slutspelssvar (5 fångade straff-/förlängningsmatcher).
Guld-fixturen `__fixtures__/fixture-aet-pen.json` är ett oförändrat API-svar för
Argentina-Frankrike (VM-finalen 2022, status PEN): `goals` 3-3, `fulltime` 2-2, `extratime` 1-1,
`penalty` 4-2. Den gamla koden hade skrivit 1-1 (bara extratime) som facit i stället för 3-3,
vilket hade korrumperat slutspels-facit. Ett diskriminerande test (et != ft != goals) rödnar om
extratime- eller fulltime-buggen återinförs (negativ-kontroll körd och bekräftad).

## 2026-06-14 , Livescore Bit 1: API-Football status-mappning + lag-brygga (källhänvisade, gissas aldrig)

Livescore-featurens datakälla är API-Football (api-sports.io). Bit 1 är den rena kärnan
(parsers, match-identitet, poll-planerare, klock-logik) byggd och bevisad mot RIKTIGA fångade
API-svar, committade oförändrade i form under `src/data/livescore/__fixtures__/` (inga
hemligheter, bara request-headern bar nyckeln). Två regler här gissas aldrig och är källhänvisade
så de kan BEKRÄFTAS mot källan, inte jagas:

**Beslut: status-mappning `fixture.status.short` -> normaliserad `LiveStatus`** (parse-live.ts,
`STATUS_BY_SHORT`). live = 1H/2H/ET; paused = HT/BT/P/SUSP/INT; finished = FT/AET/PEN; scheduled =
NS/TBD; postponed = PST/CANC/ABD/AWD/WO; en okänd kod -> 'unknown' (fail-safe, ALDRIG 'live').
**Källa (korsverifierad 2026-06-14):** API-Football v3 fixtures-status, mot två oberoende källor
(API-Football "How to save calls"-guiden + Sportmonks/pilflo api-sports-status-listor), eftersom
api-football.com/documentation-v3 svarar 403 mot automatisk hämtning. **Varför P klassas som
paused (inte live):** Daniels spec listar uttryckligen "FRYS under paus (HT, BT, P, SUSP, INT)",
matchklockan ska stå still under straffläggning, inte ticka (vattenpaus-oron).

**Beslut: lag-brygga API-Football team-id -> appens lag-id** (team-bridge.ts,
`WC2026_API_TEAM_BRIDGE`). Medvetet OFULLSTÄNDIG i Bit 1: bara lag vars API-id faktiskt setts i
de fångade svaren seedas (Nederländerna 1118, Japan 12 ur live-all-svaret fixtures?league=1&live=all;
England 10, Iran 22 ur 2022-fixturen 855735). **Varför numeriskt id, inte namn:** API-Footballs
team-id är stabila mellan säsonger, namn skiljer mellan källor ("Netherlands"/"Nederländerna").
**Full 48-lags-brygga kompletteras före go-live** (Bit 2 fyller på ur live=all under turneringen,
där varje VM-lags id dyker upp verifierbart). `resolveAppMatch` blockeras inte av luckan: okända
lag ger 'unresolved', aldrig en gissad koppling. Täckningen är testbar via `resolveMatchCoverage`.
Match-identitet kräver BÅDE lag-paret (via bryggan) OCH kickoff inom ett 2 h-fönster (UTC), så
g-F-1 (ned-jpn) löses mot den fångade live-matchen.

## 2026-06-13 , T79 (#167): responsiv sektions-nav (hamburgare-meny på mobil, chip-rad på desktop)

**Daniels feedback på T78:** på mobil kunde man LÄTT MISSA sektioner eftersom chip-raden är swipe-bar i
sidled och man inte visste att man kunde svipa. Krav: en HAMBURGARE-MENY på mobil som visar HELA menyn
(alla sektioner) vertikalt vid klick; chip-raden kvar oförändrad på större skärmar.

**Beslut: responsiv växling sker helt i CSS (Tailwind sm:-klasser), ingen JS-resize-gissning.** Chip-raden
(`SectionNav`) får `hidden sm:block` (desktop, >= sm), den nya `SectionNavMobile` får `sm:hidden` (mobil,
< sm). **Varför CSS, inte matchMedia:** task-direktivet föredrar CSS-växling, det undviker en JS-resize-
lyssnare + hydrerings-/SSR-glapp, och `display:none` på det dolda bandet tar bort det helt ur
tillgänglighets-trädet, så de TVÅ `<nav aria-label="Sektioner">`-landmärkena aldrig dubbleras för en
skärmläsare (exakt ett band är i a11y-trädet per viewport). Båda banden läser SAMMA store
(`useSectionNavState`: sections/activeId/scrollTo), så listan speglar exakt samma register-sanning som
chip-raden, inga döda rader.

**Beslut: scroll-offset-mätningen extraherades till en DELAD hook `useStickyBandOffset`** som båda banden
använder. **Varför delad:** offset-kontraktet (`--vm-section-nav-offset` styr scroll-margin-top OCH
scroll-spy-zonens topp) måste vara EN sanning; två kopierade mätningar kunde drifta isär (samma rot som
C4-context-delningen). Hooken härleder offset = headerns höjd + det SYNLIGA bandets höjd, där "synligt" =
MAX-höjden över alla `[data-section-nav]`-band (det CSS-dolda bandet rapporterar `getBoundingClientRect`-
höjd 0). MAX (inte summa) gör skrivningen idempotent: båda bandens mät-effekter räknar fram SAMMA värde, så
ingen kamp om CSS-variabeln oavsett körordning.

**Beslut: a11y-baslinjen för hamburgare-panelen** (kärnan i tasken, design-frontend polerar utseendet):
knappen bär `aria-expanded`/`aria-controls` (-> panelens `useId`-id)/`aria-haspopup` + tillgängligt namn
("Sektioner" / "Sektioner: <aktiv>", så scroll-spy-värdet syns på mobil). Escape stänger; `pointerdown`
utanför band + panel stänger (lyssnarna läggs bara när panelen är öppen). Fokus flyttas IN till första
raden vid öppning och ÅTERSTÄLLS till knappen vid stängning (en `wasOpen`-ref hindrar fokus-stöld vid
första render). Enkel fokus-fälla (Tab/Shift+Tab cyklar inom panelen, samma form som `Modal.trapFocus`).
Raderna är riktiga `<button>` med `aria-current="true"` + `data-active` på den aktiva. Panel-öppningens
animation är CSS-gatad på `prefers-reduced-motion` (WCAG 2.3.3), och rad-valet går via providerns
reduced-motion-medvetna `scrollTo`. **Varför inte den delade `Modal`-primitiven:** Modal är en
portal-baserad helskärms-dialog (fixed inset-0 z-50); hamburgare-menyn är ett lätt sticky-band med en
nedfälld panel i bandets flöde (knuffar innehåll, överlappar inte), så Modal hade varit fel form. A11y-
semantiken (Escape/fokus-in-och-retur/fokus-fälla) följer ändå samma kontrakt.

**Beslut (C4, Copilot-runda-1): scroll-spy observerar ALLA band, inte bara det forsta.**
`useSectionSpy` anropade `querySelectorAll('[data-section-nav]')` men implementationen hade en
bugg: mock i testet fyrade `emitResize` oavsett om bandet faktiskt observerades, vilket dolde
att bara forsta bandet observerades. Fixt: observern byggs om med `querySelectorAll` och ett
tvabands-harness-test verifierar att hogjdandring i mobil-bandet (panel oppnas) triggar om-
byggnad av observern med ny rootMargin. Negativ-kontroll bekraftad: querySelector-revert
(bara ett band) rodnar bada C4-testerna. Utan fixen: stale rootMargin pa mobil-bandet vid
panel-oppning, scroll-spy uppfattar knappt att aktiv sektion byts.

**Beslut (C5, Copilot-runda-1): CSS-var-cleanup ar VILLKORAD pa att inga band kvar i DOM.**
Bada banden skriver samma `--vm-section-nav-offset` via `useStickyBandOffset`. Vid unmount
av ett band (t.ex. ResizeObserver-recompute) rensades variablerna alltid - vilket nollade
offseten medan det andra bandet levde. Fix: rensa bara nar `document.querySelectorAll
('[data-section-nav]').length === 0` (inget band kvar). Negativ-kontroll: alltid-rensa-revert
rodnar testet som verifierar att variablerna behalles efter ett bands unmount.

**Beslut (C6, Copilot-runda-2): aria-controls villkorad pa att panelen ar monterad.**
Hamburgare-knappen bar `aria-controls` som pekade pa panelens id. Panelen renderas bara nar
menyn ar oppen (open === true); i stangt lage ar IDREF:en ogiltig (pekar pa ett omonterat
element). Fix: `aria-controls={open ? panelId : undefined}`. `aria-expanded` (alltid
satt) och `aria-haspopup` barer knappens tillstand oforandrat. Kontrakt-testet skarptes:
aria-controls ska SAKNAS i stangt lage och peka pa panelens id i oppet lage.

---

## 2026-06-13 , T78 (#165): sticky sektions-nav (chip-rad) med självregistrerande sektioner

**Daniels val (#165):** en smal, sticky chip-rad direkt under appens befintliga header som hoppar till
varje sektion på den långa en-sides-appen (PWA på mobil först). Återkommande krav: den får INTE bli rörig,
hålls lean och diskret.

**Beslut: chips speglar ett REGISTER, inte en hårdkodad lista , döda chips omöjliga by-construction.**
En `SectionNavProvider` håller ett register; varje sektion anropar `useRegisterSection(SECTIONS.x)` DÄR den
faktiskt renderar innehåll (i VYN, inte i det live-gatade skalet), och avregistrerar vid unmount. Navet
renderar chips ur registret sorterat på `order`. **Varför register, inte DOM-scan eller statisk lista:**
flera sektioner returnerar `null` i fixtures-/icke-live-läge (de fyra tips-/toppliste-sektionerna gatas på
`rooms.enabled` i sina skal; tracker-vyerna daily/grupper/vad krävs/slutspel renderar alltid). En sektion
som returnerar null monterar aldrig sin vy, så `useRegisterSection` körs aldrig, så inget chip kan peka på
en sektion som inte finns i DOM:en. Registret gör det till en KONSTRUKTIONS-garanti i stället för en koll
som kan glömmas. `useRegisterSection` är TOLERANT mot saknad provider (no-op), samma mönster som
`useRoomsSync`, så vy-tester i isolation inte kräver providern.

**Beslut: scroll-offset MÄTS robust, ingen magisk pixel.** Två sticky-band stackas (header sticky top-0
z-10; navet sticky med `top` = headerns uppmätta höjd, z-[9] under headern så de aldrig överlappar).
`SectionNav` mäter header- + nav-höjden (getBoundingClientRect + ResizeObserver) och skriver
`--vm-section-nav-offset` (+ `--vm-section-nav-header-top`) på `<html>`. CSS sätter
`scroll-margin-top: calc(var(--vm-section-nav-offset) + 8px)` på de åtta navigerbara sektionerna (via deras
BEFINTLIGA rubrik-id:n, T78 lägger inte till nya id:n), så ett chip-klicks `scrollIntoView({block:'start'})`
landar rubriken precis under raden oavsett bandens faktiska höjd (varierar med skärm/typsnitt/tema).

**Beslut: scroll-spy via IntersectionObserver, aktiv = aria-current.** `useSectionSpy` observerar
sektionerna med `rootMargin` som drar zonens topp under banden (samma uppmätta offset), markerar den nedersta
sektion vars topp passerat raden (aria-current="true" + data-active för designern). reduced-motion: `scrollTo`
hoppar direkt (`behavior:'auto'`) via den delade `useReducedMotion` (motion/react), annars `'smooth'` , WCAG
2.3.3.

**Beslut: rums- och admin-sektionerna hålls UTANFÖR raden** (hjälp-/arrangörsytor), per Daniels lean-krav,
så de saknar både katalog-post i `SECTIONS` och registrerings-anrop. Etiketter korta: Idag, Grupper, Vad
krävs, Slutspel, Match-tips, Grupp-tips, Mästare, Topplista. Tom rad (inga registrerade) -> hela navet
renderar `null` (ingen tom sticky-list). Funktionell + tillgänglig kärna byggd här; design-frontend stylar
mot `data-section-nav` / `data-section-chip` / `aria-current` / `--vm-section-nav-offset`.

**Beslut (C4, prestanda, Copilot-runda-2): contexten DELAS på frekvens, kanoniskt React-mönster.**
Scroll-spy:n byter `activeId` ofta vid scroll. När register/unregister OCH sections/activeId låg i SAMMA
context-värde bytte det värdet identitet vid VARJE activeId-uppdatering, så alla 8 sektions-vyer (som via
`useRegisterSection` bara behöver register/unregister) re-renderades vid varje aktiv-sektion-byte , onödig
scroll-jank på tunga mobil-vyer (gruppspelstabeller, slutspelsträd). Lösningen är context-splitting på
frekvens: `SectionNavActionsContext` = `{register, unregister}` (STABIL identitet efter mount, memo:as på de
useCallback-stabila callbacksen) som ENBART `useRegisterSection` konsumerar, och `SectionNavStateContext` =
`{sections, activeId, scrollTo}` (byter vid sections/activeId) som ENBART `SectionNav` konsumerar. Därmed
re-renderas sektions-vyerna inte längre av ett activeId-byte (bevisat med render-räknar-test:
`section-nav-perf.test.tsx`), bara navet uppdaterar sitt aktiva chip. `setActiveId` exponeras inte längre via
context (wiras direkt in i `useSectionSpy` i providern). Actions-hooken är fortsatt TOLERANT (no-op utan
provider), state-hooken fail-loud (kastar utan provider). Källa: React-dokumentationens rekommendation att
dela context när olika delar uppdateras i olika takt (Context + Reducer / "Scaling Up with Reducer and
Context"), och det etablerade rooms-context/RoomsProvider-mönstret i detta repo.

**Beslut (C1, Copilot-runda-1): `getBoundingClientRect` korrekt för sticky-element, inte `offsetTop`/`offsetParent`.**
`offsetTop`/`offsetParent` traverserar layoutträdet och missar att ett sticky-element befinner sig
i ett eget stacking-kontext vid scroll, vilket ger fel offset i Firefox och Safari. `getBoundingClientRect`
mäter den faktiska renderade positionen mot viewporten och är korrekt för sticky-stacking på alla browsers.
Alltid använda `getBoundingClientRect` vid mätning av sticky-band som ska offseta scroll-mål.

**Beslut (C5, Copilot-runda-3): CSS-variabler rensas vid providerns unmount.**
`--vm-section-nav-offset` och `--vm-section-nav-header-top` skrivs pa `<html>` av `SectionNavProvider`.
Om providern unmountas (t.ex. via React.StrictMode dubbelmount eller framtida dynamisk routing) maste
CSS-variablerna rensas (sättas till '' via `document.documentElement.style.removeProperty`) i cleanup-
funktionen av den useEffect som skriver dem, annars lever de stale-värdena kvar och skjuter
scroll-margin-top fel pa sektionerna. Rensningen bevisad negativt: utan den failar ett test som kontrollerar
att variablerna är tomma efter unmount.

---

## 2026-06-13 , T77 (#161): per-match kommentar-trådar HOPFÄLLDA på matchkortet

**Daniels val (#161, gissas inte):** per-match kommentarer, men HOPFÄLLDA så kortet inte blir rörigt.
På dagens-vyns matchkort finns en liten "Kommentarer (N)"-affordans (0 = "Kommentera") under reaktions-
raden (T24). Hopfälld default; tryck -> tråden fälls ut UNDER kortet (skriv + läs); tryck igen -> fäll
ihop. Per match, per rum, realtid.

**Beslut: ÅTERANVÄND room_comments-tabellen (T66) med en NULLABLE match_id-kolumn.** match_id IS NULL =
rums-chatten (T66, oförändrad), satt = en match-tråd (T77). Migration
`20260613144345_t77_room_comments_match_id.sql` (ADD COLUMN nullable + partiellt index
`room_comments_room_match_created_idx (room_id, match_id, created_at) WHERE match_id IS NOT NULL`),
applicerad LIVE via MCP. **Filen bär den FAKTISKA live-apply-versionen** `20260613144345` (bekräftad med
`list_migrations`), inte en rund placeholder, så en fresh-replay registrerar samma version (lessons
committad-migration-pastar-spegla-live). Verifierat live: kolumnen är nullable, de 5 befintliga rums-
chatt-raderna fick match_id NULL (T66 oförändrad). **Varför återanvända, inte en ny tabell:** kommentarer
ÄR samma sak (kort text per rum), bara en annan tråd-rymd; en match_id-kolumn är minsta ytan (KISS/DRY)
och ärver T66:s CHECK (1-500) + realtids-publikation gratis. ASCII i `comment on column`-strängen är med
FLIT (1:1 med vad MCP applicerade live, replay-trohet); migrationens kod-kommentarer har korrekt å/ä/ö.

**Beslut: INGEN RLS-policy-ändring behövs.** En match-kommentar bär SAMMA room_id som rummet, och T66:s
policyer gatar på room_id: SELECT `is_room_member(room_id)`, INSERT `is_room_member(room_id) AND user_id =
auth.uid()`, DELETE egen rad. match_id är bara en VY-uppdelning INOM rummet, inte en ny säkerhetsgräns
(kommentarer är inte hemliga, ingen tips-sekretess). **RLS BEVISAT LIVE (T53-playbook, role authenticated
+ request.jwt.claims, rollback/cleanup):** medlem skriver+läser match-kommentar (member_insert_ok=true,
member_can_read=1), utomstående nekas läsa (outsider_can_read=0) OCH skriva (outsider_insert_denied=true).
Counts oförändrade efteråt (5 total / 0 match / 5 rums-chatt), 0 leftover proof-data/funktion. Env-gatat
integrationstest med riktiga anon-sessioner: `src/data/rooms/match-comments-rls.integration.test.ts`.

**Beslut: gruppera i KLIENTEN, en hämtning + en kanal per rum (samma modell som reaktionerna T24, inte
en hämtning/kanal per match).** `listRoomMatchComments` hämtar ALLA match-trådars rader för rummet
(match_id IS NOT NULL); `MatchCommentsProvider` grupperar per match_id i minnet (`match-comments-aggregate.
groupCommentsByMatch`, ren + testbar). SKILD store från rums-chatten (CommentsProvider/T66): två tråd-rymder
på samma tabell, helt åtskilda. **T66-REGRESSIONSSKYDD:** `listRoomComments` (rums-chatten) fick ett HÅRT
`.is('match_id', null)`-filter, annars hade match-kommentarer läckt in i rums-chatt-vyn nu när tabellen
bär båda. Bevisat i seam-testet (rums-chatten orörd) + api-testet (filtret assertat).

**Beslut: TOLERANT hook (inert fallback), inte kastande.** `useMatchCommentsStore` faller till en inert
store (enabled=false) utan provider, EXAKT som `useReactionsStore` (T24 KA-F3), eftersom MatchComments är
en matchkort-FOTRAD som renderas i många tester + lokalt läge utan provider. (useCommentsStore/rums-chatten
KASTAR, men den sitter i en sektion som alltid har provider.) Realtid: egen kanal `vm2026-room-match-
comments`, filtrerat på rummet; en rums-chatt-signal väcker den också (filtret är på rum, inte tråd) men
re-fetchen re-filtrerar till match-trådar = ofarlig extra omhämtning.

**Säker rendering (HARD, samma som T66):** kommentar-texten renderas som ren React-text-nod (escaping),
ALDRIG dangerouslySetInnerHTML (test: taggig sträng visas bokstavligt, ingen <img> injiceras).

**Design ska finputsa (rena data-hakar lämnade):** `data-match-comments`, `-toggle`, `-panel`, `-list`,
`-item`, `-body`, `-input`, `-send`, `-count`. Balansera: hopfäll-knappens ton i reaktionsradens anda, den
utfällda panelens yta (`.vm-match-comments-panel`), bubbel-rytmen (återanvänder `.vm-comment-*` från T66).

## 2026-06-13 , T74 (#157): se VILKA som reagerat på en match (långtryck/hover/focus -> popover)

**Bakgrund (Daniels feedback):** "som usa-matchen la jag en låga och någon en applåd, men jag kan
inte se vem den andra är." Reaktionsraden (T24) visade bara emoji + ANTAL, aldrig VEM eller NÄR.

**Beslut (interaktion): en bricka kan öppna en "vem reagerade"-popover på TRE vägar.**
- TOUCH: LÅNGTRYCK (håll förbi tröskeln) -> popover; SLÄPP (pointerup/leave/cancel) -> dölj.
- DESKTOP: HOVER (pointerenter mus/penna) visar, pointerleave döljer.
- TANGENTBORD/a11y: FOCUS visar, blur döljer.
Mekaniken bor i en återanvändbar `useLongPress`-hook (pointer events, skiljer tap från långtryck,
sväljer click:et efter ett långtryck så håll-gesten inte OCKSÅ togglar reaktionen).

**Beslut (long-press-tröskel): 500 ms.** **Källa/varför:** 500 ms är standard-tröskeln för
long-press på touch , Android `ViewConfiguration.getLongPressTimeout()` är 400-500 ms (default 500),
iOS long-press ~500 ms. Daniel skrev "efter några sekunder", men flera sekunder vore segt på en
match-rad; 500 ms är tillräckligt långt för att inte trigga på ett vanligt tap men kort nog att
kännas direkt. Tröskeln är en namngiven konstant (`LONG_PRESS_THRESHOLD_MS`) + injicerbar för test.

**Beslut (placering): popovern ligger OVANFÖR brickan och klampas inom viewporten.** **Varför:**
Daniels krav "det måste visas så fingret inte blockar infot" , popovern läggs ovanför ankaret
(position fixed, underkant strax över brickan) och klampas horisontellt/vertikalt inom skärmen
(ingen overflow utanför viewporten). Funktionell positionering (getBoundingClientRect + klamp i
useLayoutEffect) ägs av senior-dev; design-frontend finputsar utseendet (pil, in-animation gatad av
reduced-motion) UTAN att röra positionerings-logiken eller a11y-hakarna (role=tooltip + aria-describedby).

**Beslut (namn-källa): userId -> displayName slås upp i room_members.** EN sanning (samma karta
RoomComments + topplistan använder), buren på reaktions-storen (`nameByUser`) via rooms-synk-seamens
nya `members`-fält (samma motiv som userId, T66), så MatchReactions inte behöver en egen koppling till
rums-storen. En reagerare som lämnat rummet faller till "Tidigare medlem" (samma fallback som RoomComments).

**RLS (verifierat, read-only mot live 2026-06-13):** SELECT-policyn `room_reactions_select_member` har
`qual = is_room_member(room_id)` UTAN user_id-filter , en rumsmedlem får läsa ALLA medlemmars rader
(user_id + created_at) i rummet. Att visa författare (vem + när) för andra medlemmar är alltså tillåtet.
Stämmer med T24-beslutet "reaktioner är PUBLIKA inom rummet" (ingen före-avspark-döljning). INGEN ny
skrivyta lades till, RLS rördes inte.

---

## 2026-06-13 , T76 (#158): tips-INMATNINGSkortet väver in officiellt facit (poäng + facit syns)

**Bakgrund (produktionsbugg, Daniel-rapporterad, verifierad mot live-DB):** på tips-korten
("Tippa matcherna") syntes varken poäng (T58) eller facit (T73) trots att officiella resultat var
inmatade. Rotorsak: `usePredictableData` (tips-vyns underlag) laddade BARA den statiska matchplanen
(`ds.getMatches()`), som alltid är `status: 'scheduled'` (`result: null`). Poäng-raden OCH facit-raden
i `PredictionForm` är båda gatade på `isFinished(match)`, så de renderades ALDRIG i verkligheten,
trots gröna isolerade tester (de matade in en `finished`-FIXTUR direkt, live-vägen gav aldrig en
finished match , samma blinda fläck som lessons "mock-foljer-konsumenttyp" + "handoff-pastar-ett-krav-
levererat-men-koden-wirar-aldrig-in-ytan").

**Beslut:** tips-vyns matcher väver nu in det GLOBALA officiella facit på SAMMA seam som topplistan
och live-trackern redan använder: `useOfficialResultsSync().officialResults` (T42, OfficialResults-
Provider) + den rena `applyRoomResults(base, officialResults)` (från `features/results`). Vävningen
sker i `usePredictableData` via `useMemo` ovanpå en separat bevarad bas (idempotent, ett ändrat/
borttaget resultat backar korrekt), exakt som `useLeaderboardData` och `ResultsProvider` gör.
**Varför just så (EN sanning):** `OfficialMatchResult` är strukturellt identisk med `RoomMatchResult`
och matas redan in i `applyRoomResults` av topplistan, så ingen ny hämtning och ingen parallell
omräkning införs , facit + poäng på tips-kortet räknas mot exakt samma källa som topplistan och
trackern. Realtid är gratis: T42-providern prenumererar på `official_match_results` och kör en refresh
vid admin-inmatning, så `officialResults` får en ny referens -> memon väver om -> kortet uppdateras
utan omladdning (ingen ny prenumeration). `useOfficialResultsSync` är tolerant mot saknad provider
(tomt facit), så isolerade tester och fixtures-läge är oförändrade.

**Pinnen mot buggen:** ett LIVE-invävt test (`use-predictable-matches-facit.integration.test.tsx`)
kör den RIKTIGA `usePredictableData` (EJ mockad) genom hela vävnings-seamen: verklig matchplan
(fixtures, g-A-1) + ett verkligt officiellt resultat ur OfficialResults-kontexten, och bevisar att
kortet då renderar facit + poäng. "finished" kommer ENBART ur vävningen (ingen finished-fixtur), så
en bortkopplad väv failar rött (verifierat: utan vävningen failar 3 av 4, REGRESSION-fallet kvarstår
grönt).

**UX (tip vs facit):** de stora siffer-rutorna är användarens TIPS men lästes lätt som slutresultatet.
Ett LÅST kort med ett eget tips får nu en omisskännlig "Ditt tips"-etikett (`data-prediction-tip-label`)
direkt vid rutorna; facit-brickan har sin "Facit"-etikett. Funktionell struktur + rena hakar levereras
här; design-frontend äger den slutliga visuella hierarkin (storlek/placering/mobil, balans tips vs facit).

**GruppPredictions-vyn:** har INTE samma lucka , den tippar grupp-1:a/2:a och visar ett tips-härlett
(simulerat) slutspelsträd, inte facit per match, så ingen isFinished-gatad facit-/poäng-yta att väva in.

## 2026-06-13 , T75 (#155): utfällt läge släpper höjd-taket till none (mobil-överlapp-fix)

**Bakgrund (produktionsbugg, bekräftad i skärmdumpar på iPhone OCH Samsung):** den delade
komprimerings-primitiven `CollapsibleBody` (T68) cap:ade i UTFÄLLT läge höjden till ett fast tak
(`maxHeight: '200rem'`, dvs 3200px) under det FELAKTIGA antagandet "200rem överstiger alltid
innehållet". Det är falskt på smal mobil: en utfälld sektion i 1 kolumn (t.ex. GroupPredictionsView
med 12 grupp-kuponger + simulerat slutspelsträd) blir >> 3200px. Innehållet spillde då förbi boxen
(overflow:visible utfällt) men det EFTERFÖLJANDE flex-syskonet (nedre "Visa färre"-toggeln) OCH allt
efter sektionen placerades vid 200rem-gränsen och ÖVERLAPPADE det spillda innehållet (sista gruppens
grupptvåa-väljare gick inte att nå). Desktop (3 kolumner, kortare) rymdes under 3200px, därför "bara
mobil". Drabbade alla sektioner som använder CollapsibleBody.

**Beslut:** utfällt läge slutar nu på `maxHeight: 'none'` (obegränsat, inget syskon kan överlappa).
Den mjuka öppnings-animationen behålls via TVÅ steg: (1) vid utfällning animeras max-height mot ett
animerbart tak (200rem) så CSS-transitionen (`collapsible.css`, `[data-collapsed='false']`) glider
fram (`none` går inte att animera); (2) när öppnings-transitionen är klar (`onTransitionEnd` gatad på
`event.target === bodyRef.current && propertyName === 'max-height'`) flippas `expandedUnbounded` till
true -> `maxHeight: 'none'`. Reduced-motion nollar transition-duration (`index.css`) så transitionend
kan utebli; då sätts `none` direkt via en effekt som läser `prefers-reduced-motion`. Vid ihopfällning
åter-armas taket (200rem) så nästa utfällning kan animera på nytt.
**Varför just så:** korrekthet (inget överlapp) utan att offra den premium-känsla T68 byggde. `none`
direkt utan tak vore enklare men förlorar öppnings-animationen; permanent tak (gamla buggen) klipper.
Komprimerat läge är helt oförändrat (höjd-klipp + overflow-hidden + gradient-fade + cue), och utfällt
sätter aldrig overflow-hidden, så slutspelsträdets inre sidled-scroll (overflow-x-auto i BracketView,
inuti kroppen) klipps inte. Mekaniken (state -> stil) är test-täckt i CollapsibleSection.test.tsx; en
regression som återinför ett permanent 200rem-tak i utfällt gör de testerna röda.

## 2026-06-13 , T72 (#151): grupp- + champion-tips låses PLATT efter omgång 1 (ersätter 21/6)

**Daniels beslut 2026-06-13 (källa, gissas inte):** "ändra så gruppspel tippning och mästerskap
tippningen låser sig efter första omgången är slutspelad. dvs varje grupp har gått igenom första
matchen. så blir det mer rättvist." Den gamla 21/6-deadlinen (T67, #123) var för sen; den nya,
rättvisare låspunkten är när OMGÅNG 1 är spelad, dvs när varje grupp gått igenom sin första match.
Issue #151. Match-tips + bracket-SLOT-tips (M73..M104) behåller sina EGNA avsparks-lås (rörs INTE).

**FAST TIDPUNKT:** `2026-06-17T20:00:00.000Z`. Det är avsparket för den SISTA gruppens första match
(g-L-1) = MAX över de 12 gruppernas (A..L) tidigaste match-kickoff. När den matchen startar har varje
grupp gått igenom sin första match. Verifierat live mot `match_kickoffs` (2026-06-13): `max(kickoff)
where match_id ~ '^g-[A-L]-1$'` = g-L-1 = `2026-06-17 20:00:00+00`. Klient-spegeln har dessutom ett
test (`extended-deadline-schema.test.ts`) som HÄRLEDER samma max ur `WC2026_MATCHES` och asserterar
likhet med konstanten, så en framtida schema-ändring fångas RÖTT i stället för att tyst drifta.

**VARFÖR PLATT och inte längre GREATEST(ankare, fasta tiden) (T53/T67):** tidigare var den fasta tiden
en söndags-23:59 som kunde ligga FÖRE en sen grupps första match, så GREATEST behövdes för att inte
FÖRKORTA den gruppens fönster. Den NYA tiden ÄR den sista gruppens första match, alltså ligger den per
definition PÅ ELLER EFTER varje grupps första match. Daniels intent är EN gemensam låspunkt (= omgång 1
spelad), inte per-grupp-fönster. Därför låses ALLA grupp- + champion-tips vid exakt SAMMA instant
(platt), och GREATEST-maskineriet togs bort. NULL-fail-safen BEHÅLLS (saknat ankare -> NULL-deadline ->
skriv nekas), så en okänd grupp/slot aldrig får ett öppet fönster ur tomma luften.

**EN SANNING, klient + DB:** DB: ny migration `20260613120000_t72_extended_deadline_round1_flat.sql`
ändrar `pool_extended_deadline()` till den platta instanten; `group_deadline_kickoff` returnerar nu den
platta tiden för en känd grupp (slår fortfarande upp g-X-1 enbart för känd/okänd-gaten), och champion-
grenen av `bracket_deadline_kickoff` likadant (SLOT-grenen + match-tipsen oförändrade). Alla tre helpers
CREATE OR REPLACE:as så migrationen är en komplett fresh-replaybar ögonblicksbild, inte ett implicit
beroende på T53/T67:s ordning. Klient: `src/data/predictions/prediction-deadline.ts`
(`POOL_EXTENDED_DEADLINE_ISO` + `applyExtendedDeadline`, som nu returnerar den platta tiden för ett känt
ankare). Text/lås härleds ur SAMMA ISO (formatDeadline/DeadlineNotice), ingen dubblerad tid.

**RLS BEVISAT LIVE (kmzhyblzxangpxydufve, allt rullat tillbaka, counts oförändrade efteråt):** (1) en
RIKTIG authenticated-session (tillfällig auth.users + isolerat test-rum i ett savepoint) skrev FÖRE
deadline (riktig now() 13/6 < 17/6 20:00) BÅDE ett grupp-tips OCH ett champion-tips genom RLS = TILLÅTEN,
och såg sitt eget tips via select-policyn. (2) EFTER deadline (simulerad now() 18/6): skriv-predikatet
`now() < group_deadline_kickoff('A')` resp. champion-grenen = FALSE => skriv NEKAS; FÖRE deadline (sim
16/6) = TRUE => tillåten (kontrollgrupp). (3) MATCH-tips OFÖRÄNDRADE: g-A-1-låset styrs av matchens egen
avspark (11/6 19:00), inte pool-deadlinen (sim 12/6 -> nekad). (4) SLOT-tips OFÖRÄNDRADE: `bracket_
deadline_kickoff('M73')` = `match_kickoff('M73')` = `2026-06-28 19:00:00+00` (oförändrad). Efter beviset:
0 leftover proof-rum/-users/-tips, rooms/members/group/bracket-counts identiska med baslinjen (14/27/154/10).

**Migrationen i `list_migrations`** heter `t72_extended_deadline_round1_flat` (live-version `20260613101814`,
MCP-genererad stämpel skiljer från filnamnets placeholder `20260613120000`, samma kända nyans som
T15/T16/T53/T67; namn + exekverbar SQL 1:1; ett `db reset` registrerar filens version, sluttillståndet är
verifierat identiskt med live). Som T67 kan live-funktionens inline-kommentar vara en MCP-artefakt;
committad fil bär svensk kommentar per konvention, nästa `db reset` återställer den. Noll beteendepåverkan.

**Källa:** Daniels task-direktiv T72 (#151) + live-verifierat spelschema (`match_kickoffs`, max group-first-match = g-L-1).

---

## 2026-06-13 , T4e (#149): arena-kapacitet (källåkrad) + FIFA-ranking på matchkortet

**Bakgrund (Daniels feedback 2026-06-13, #149):** "mer matchinfo på kortet, BALANSERAT, utan att
stöka till det." Domare SKIPPAS (inte sourcebart i förväg). Två tillägg: (1) åskådarkapacitet per
arena, och (2) lagets FIFA-ranking. Funktionellt + a11y-byggt av senior-dev; design-frontend
finputsar placering/balans (kapacitet diskret efter arenan, ranking under lagnamnet) på mobil.

**1) Arena-kapacitet (NY data, källåkrad, gissas ALDRIG).** Kapaciteten är PER ARENA (16 värden),
inte per match. Den bor i en EGEN CAPACITIES-sektion i gold source (`venue-source.txt`), parsas av
`venue-parser.ts` (`parseVenueCapacities`/`buildVenueCapacityTable`, fail-loud på okänd/dubblerad/
saknad arena + icke-heltal), och byggs till `WC2026_VENUE_CAPACITIES` (`venue-capacities.ts`),
värde-låst i CI (`venue-capacity-source.test.ts`: pinnar alla 16 figurer + mutationstest + svensk
formatering). venue-strängen ("Arena, Stad, Land") är OFÖRÄNDRAD (kapaciteten är en separat per-arena-
uppslagning, inte instoppad i strängen), och **matches.ts rörs INTE** (diff-verifierat: 0 ändringar).

**Generator-mönster för tabellen (Copilot T4e #150, F4):** `venue-capacities.ts` är en GENERERAD,
committad tabell (16-posters `new Map`-literal), INTE en `?raw`-parsning av gold source vid runtime.
Skälet: tabellen används i UI:t (`match-display` -> MatchCard), så en `?raw`-import skulle paketera
HELA `venue-source.txt` (277 rader, inkl. per-match VENUES-sektionen) till klient-bundlen bara för 16
tal. Nu emittas tabellen av `scripts/generate-venue-capacities.ts` (`npm run gen:venue-capacities`,
via `buildVenueCapacityFile` i `venue-parser.ts`), och gold source `?raw` finns BARA i generator +
test, aldrig i en runtime-modul (bundle-verifierat). Regenerera-och-diffa-låset (`buildVenueCapacityFile`
körd på gold source == committad `.ts`) + mutationstest av låset flyttar käll-drift-fångsten in i CI.
Exakt samma mönster som `matches.ts` och `team-profiles.ts`, se `docs/patterns.md`
"gissningskanslig-data-genereras-ur-auktoritativ-kalla-med-validerande-generator".

**Figur-VALET (viktigt, INTE en gissning):** det cirkulerar TVÅ figur-uppsättningar.
- (1) **FIFA:s officiella TURNERINGS-kapacitet** (VALD: Estadio Azteca 80 824, AT&T 70 649, MetLife
  80 663) = arenan i VM-konfiguration, exakta tal, internt konsistenta.
- (2) Arenornas ordinarie MAX-/ungefärliga kapacitet (t.ex. myfootballfacts: Azteca 83 000, AT&T
  94 000) = ordinarie/avrundad uppställning, INTE VM-konfigurationen.

Vi väljer (1) för att det är (a) FIFA:s officiella turnerings-tal, (b) ur SAMMA gold source (Wikipedia
"2026 FIFA World Cup", venue-tabellen) som redan ankrar arena-listan (T4c/T4d), och (c) korskoll-
bekräftat. **Källa (PRIMÄR):** Wikipedia "2026 FIFA World Cup" venue-tabell
(https://en.wikipedia.org/wiki/2026_FIFA_World_Cup), hämtad 2026-06-13. **Korskoll (oberoende):**
Crypto Briefing "FIFA announces official seating capacities for 2026 World Cup venues"
(https://cryptobriefing.com/fifa-2026-world-cup-venue-capacities/) bekräftar att FIFA officiellt
tillkännagav dessa figurer och citerar Azteca 80 824, MetLife "från 80 663", BMO Field ~43 000, exakt
samma som Wikipedia-tabellen. Wikipedia noterar att talen kan justeras av FIFA senare; vi pinnar
2026-06-13-figurerna och datum-stämplar checken inline i `venue-source.txt`. (Daniels exempel i
direktivet, "87 523", var arenans äldre/ordinarie siffra, inte VM-talet, alltså medvetet INTE använt.)

**Svensk siffer-formatering (en sanning):** `formatCapacity` (`match-display.ts`) ger talet "80 824"
med FAST mellanslag (U+00A0) som tusentals-avgränsare, normaliserat ur `Intl.NumberFormat('sv-SE')`
så det är deterministiskt oavsett Node-/ICU-version. `formatVenueCapacity` lägger på enheten och ger
"80 824 platser" för en känd arena. En arena utan verifierad kapacitet hanteras TYST
(`formatVenueCapacity` ger null, ingen gissad siffra) , men alla 16 HAR en figur, så den tysta
grenen gäller bara en okänd arena (t.ex. den äldre "Arena, Stad"-formen utan land).

**2) FIFA-ranking (BEFINTLIG data, bara UI).** `Team.fifaRanking` finns redan (T10/T69), källåkrad.
T4e LÄSER bara fältet och visar "FIFA-ranking #14" per lag (`formatFifaRanking`; hela ordet, inte
bara "#14", så det inte misstolkas som grupp-/tabellplacering, Daniels förtydligande). Lag UTAN känd
ranking (ännu obestämda slutspelslag, `homeTeamId`/`awayTeamId` null, eller lag utan rankingfält)
hanteras TYST (ingen "FIFA-ranking #undefined"). Ingen ny datakälla.

**UI/a11y:** MatchCard wirar in kapaciteten i Arena-`<dd>:n` (`data-venue-capacity`-hak) och rankingen
under lagnamnet (`data-fifa-ranking`-hak). Rankingen är LÄSBAR för skärmläsare (inte aria-hidden), då
den inte redan ligger i kortets a11y-namn. Rena hakar lämnade åt design-frontend för balans/mobil.

---

## 2026-06-13 , T4d (#147): värdland tillagt i venue-strängen ("Arena, Stad, Land")

**Bakgrund (Daniels feedback 2026-06-13, #147):** matchkortet visade "Arena, Stad" (T4c, #35). Daniel
bad: "kan du få med land bredvid arena och stad också." venue-strängen blir nu "Arena, Stad, Land" med
SVENSKT landsnamn, och landet syns automatiskt i UI:t (MatchCard renderar `match.venue` rakt).

**Beslut (källåkrat, samma mönster som T4c, gissas ALDRIG):** Landet läggs till i gold source
(`venue-source.txt`) per rad, in i `KNOWN_VENUES`-white-listen (`venue-parser.ts`), och matches.ts
regenereras (`npm run gen:matches`), så BARA venue-fältet ändras (id/kickoff/lag/stage byte-identiska,
diff-verifierat: 104 venue-rader + den genererade fil-headern). Inget handskrivet i matches.ts.

**Land-mappning (källa: FIFA:s värdstäder-lista, Wikipedia "2026 FIFA World Cup").** VM 2026 spelas i
tre värdländer; landet är ENTYDIGT ur arenans redan källåkrade värdstad (T4c), så ingen ny gissning görs,
det härleds en-till-en ur kommunen. Fördelning: 3 arenor i Mexiko, 2 i Kanada, 11 i USA (= 16). Svenska
landsnamn ("Mexiko"/"USA"/"Kanada"), appens språk (kommunnamnen behålls på engelska/spanska som T4c, ingen
etablerad svensk exonym finns för dem; landet har det):

| Värdland (svenskt namn) | Arenor |
|---|---|
| Mexiko | Estadio Azteca (Mexico City), Estadio Akron (Zapopan), Estadio BBVA (Guadalupe) |
| Kanada | BMO Field (Toronto), BC Place (Vancouver) |
| USA | MetLife Stadium (East Rutherford), AT&T Stadium (Arlington), SoFi Stadium (Inglewood), Arrowhead Stadium (Kansas City), Levi's Stadium (Santa Clara), NRG Stadium (Houston), Lincoln Financial Field (Philadelphia), Mercedes-Benz Stadium (Atlanta), Lumen Field (Seattle), Hard Rock Stadium (Miami Gardens), Gillette Stadium (Foxborough) |

**Lås (CI):** `venue-source.test.ts` regenererar-och-diffar matches.ts mot källorna (oförändrat lås, nu MED
land), och har nya/uppdaterade tester: venue-formen är "Arena, Stad, Land" (split(', ') ger 3 delar),
varje venue slutar på ett av de tre svenska värdländerna, land-fördelningen är exakt 3/2/11 över de 16
distinkta arenorna, och ETT land-mutationstest (byt Mexiko -> USA på Estadio Azteca) bevisar att låset
fångar ett fel värdland (fail-loud okänd arena), utöver det befintliga arena-mutationstestet.

**UI:** ingen UI-ändring behövdes, venue är en sträng som MatchCard renderar rakt, så landet syns
automatiskt. Den längre raden ("Arena, Stad, Land") bör design dubbelkolla på mobil (360px) så den inte
bryter matchkortets layout, se HANDOFF.

---

## 2026-06-13 , T71 (#145): joker-tillägget BORTTAGET (poängen blir en enkel summa)

**Beslut: ta bort hela joker-tillägget, BARA jokern.** Daniels beslut 2026-06-13: "ta bort joker
etc tillägget. det rör till det mer." Jokern lät en spelare markera EN match per omgång vars
match-poäng dubblades (×2). Det förvirrade. Efter T71 räknas varje match EN gång, så poängen är
en enkel summa utan dubbling. Detta ERSÄTTER T19-jokerbeslutet (se T19-blocket nedan):
JOKER_MULTIPLIER, joker-storen, joker-API:t, joker-toggle-UI:t och joker-markeringen är borta.

**Vad som STANNAR (joker-OBEROENDE, rör dem inte):** streak, "kallade skrällen" och "perfekt
omgång" i `derive-badges.ts`. De bedömdes alltid på RÅ match-poäng (inte den boostade), så de är
oförändrade i beteende, bara kommentarer som refererade "joker-dagen" är uppdaterade så de inte
driftar (PRINCIPLES §9, kommentarer matchar koden).

**Poäng-invarianten (verifierad med test):** en medlem som tidigare fått dubblad poäng på en
joker-match får nu rå poäng. `aggregate-scores.ts` lägger `matchPoints += base` (ingen
`base * JOKER_MULTIPLIER`-gren). Bästa call i `personal-stats.ts` väljs på rå poäng (ingen
boostad). Test uppdaterade/borttagna som antog dubbling (aggregate-scores-joker.test.ts borttagen,
personal-stats-tester avjokrade).

**DB-beslut: tabellen `room_jokers` + RPC:n `match_joker_day` + triggern `room_jokers_set_day`
LÄMNAS ORÖRDA i Supabase.** Ingen migration, inget destruktivt (appen är LIVE under VM, varsamhet).
Tabellen blir oanvänd/tom, ofarlig. De genererade TS-typerna i `supabase-types.ts` BEHÅLLS därför
(att ta bort dem skulle få den genererade typfilen att ljuga om live-schemat, en regenerering
skulle ge tillbaka dem). Kommentarerna där är uppdaterade till att säga att tabellen är oanvänd
sedan T71, inte att ett klient-API rör den.

**SPEC-not:** SPEC §12 (Prediction "jokermarkering, dubbel-poäng") + SPEC §6/§179 (gamification
"joker-match") är därmed FÖRÅLDRADE. Besluts-loggen är den levande sanningen och går före SPEC
(samma konvention som T19 ersatte tidigare beslut). SPEC lämnas som historiskt dokument.

## 2026-06-13 , T68b (#136): expand-chevronen är nu klickbar (a11y-val: aria-hidden div-spegel)

**Bakgrund:** Daniels feedback 2026-06-13: "den där expandera pilen ska vara klickbar också och
expandera. man vill klicka på den men inget händer." Chevron-cue:n vid klipp-kanten i en komprimerad
sektion (CollapsibleBody) var ren CSS-dekoration (`[data-collapsible-fade]::before/::after` på ett
aria-hidden + pointer-events-none-element), så ett klick på pilen gjorde ingenting. Den enda
interaktiva kontrollen var den övre ExpandToggle.

**Beslut:** Cue:n renderas nu som ett icke-fokuserbart `<div>` med `onClick` (`data-collapsible-cue`)
i CollapsibleBody, gatad på samma `!expanded && isClipped` som faden, som anropar samma `toggle()`.
Pillret + chevron-glyfen flyttades från fadens pseudo-element till cue:ns
(`[data-collapsible-cue]::before/::after`), så bara pillrets yta (2.25rem-pill centrerad i en 3rem-bred
träffyta) fångar klick. Gradient-faden behålls som ett separat, heltäckande pointer-events-none-lager,
så den aldrig blockerar klick/markering på komprimerat innehåll som råkar nå kanten.

**A11y-val (varför ett icke-fokuserbart aria-hidden div, inte en `<button>` eller en andra märkt
knapp):** den övre ExpandToggle är REDAN den tillgängliga kontrollen (aria-expanded/-controls,
fokuserbar, etiketterad). Cue:n är en REN mus/touch-affordans som SPEGLAR den, så den är
`aria-hidden="true"` och utanför a11y-trädet. Första lösningen (Copilot, PR #143) var en `<button
aria-hidden tabIndex={-1}>`, men `aria-hidden` på ett FOKUSERBART element är ogiltig ARIA (en button
kan ta fokus vid pekar-klick även med `tabIndex={-1}`) och trippar axe-regeln aria-hidden-focus. Ett
`<div>` är inte fokuserbart, så `aria-hidden` är giltigt och cue:n hålls helt ur a11y-trädet. Det andra
alternativet (en andra korrekt märkt knapp) skulle ge skärmläsar-/tangentbordsanvändare TVÅ kontroller
med exakt samma syfte och mål, dvs redundans/förvirring i SR-navigeringen. Skärmläsare + tangentbord når
toppknappen; mus/touch får dessutom den visuella pilen. WCAG 2.3.3 (reduced-motion nollar
cue-animationen) och AA bevaras (samma token-färgade pill som förr).

**Bevarat:** alla befintliga data-hakar (`data-collapsible`, `-body`, `-fade`, `data-collapsed`) +
ExpandToggle oförändrade. Ny stabil hak `data-collapsible-cue` för styling/test. Design-frontend gav
cue:n ett tydligt klickbart utseende (hover/active-affordans, ingen :focus-affordans eftersom cue:n
avsiktligt är icke-fokuserbar) på den nya haken.

## 2026-06-12 , T23 (#23): pinnat favoritlag + personlig statistik

**Bakgrund:** SPEC §10 + §6 förutser ett GENERISKT (lagagnostiskt, inte hårdkodat Sverige) pinnat
favoritlag per användare + personlig statistik (träffsäkerhet, bästa call). Domänmodellen hade redan
stubbarna `User.favoriteTeamId` (Team.id) + `PlayerStats` (accuracy/exactHits/bestCall).

**Beslut (lagring): favoritlaget persistas i localStorage (per-enhet), INTE Supabase.**
**Varför:** Ett favoritlag är en ren PER-ENHETS-PREFERENS (som tema, haptik, ljud, aktivt rum), inte
delad data , ingen annan behöver se mitt favoritlag. En Supabase-tabell hade krävt en migration + en ny
RLS-yta för noll delnings-värde (YAGNI + lägsta attackyta, PRINCIPLES §0/§3/§7). Vi följer därför
safe-storage-mönstret med `vm2026-`-prefixet (nyckel `vm2026-favorite-team`), robust mot blockerad/privat
storage (ingen krasch, persistensen hoppas bara över). Lagrar Team.ID (gemen intern nyckel, samma rymd som
`favoriteTeamId` i domänmodellen + match.homeTeamId/awayTeamId), inte code, så jämförelsen mot matcherna är
i rätt identitets-rymd. Ett okänt/inaktuellt id ignoreras tyst (resolveFavoriteTeam, fail-safe, inget spöklag).

**Beslut (påverkan på vyer): "notiser" tolkas som VISUELL LYFTNING (acceptanskriteriet nämner att lyfta
favoritlagets matcher; appen har inga push-notiser i MVP).** Favoritlagets matcher får en DISKRET markering
(`data-favorite` + en liten stjärn-bricka + ett ord i matchkortets a11y-namn) i dagsvyn, SKILT från
"Dagens match"-hero:n (`highlight`), så de två kan sammanfalla utan att kollidera. Lågmäld med flit, så live-
appens layout inte regredierar.

**Beslut (statistik-definitioner, gissas inte): härledd ur SAMMA score.ts-poängväg som topplistan + märkena
(EN poäng-källa, HARD, samma anda som T58/#99 + T19). Ingen ny poäng-beräkning som kan drifta.** Bedöms BARA
på AVGJORDA matcher (status 'finished'), samma poäng-/avslöjande-modell som topplistan. Exakta formler
(`derivePersonalStats`, src/features/leaderboard/personal-stats.ts):
- **Träffsäkerhet (accuracy)** = (exakta + rätt-utfall) / antal AVGJORDA tippade matcher, ett tal 0-1.
  0 avgjorda tips => null (ingen falsk 0 %, samma fail-safe som deriveSelfSummary). KÄLLA: score.ts
  (scorePrediction > 0 = rätt utfall/exakt).
- **Exakta / Rätt utfall / Miss** = antal avgjorda tips per poäng-TYP (`pointTypeOf`, samma exakt/utfall/
  miss-beslut som scorePrediction). Räknas på det OBOOSTADE utfallet: en joker ändrar poäng-TYNGD, inte HUR
  MÅNGA exakta medlemmen prickat (samma val som topplistans `exactHits`).
- **Bästa call** = det ENSKILDA avgjorda tips som gav HÖGST poäng, JOKER-MEDVETET (joker dubblar, samma
  `JOKER_MULTIPLIER` som scoreMember), så en dubblad exakt (6p) slår en oboostad exakt (3p). Bara tips med
  poäng > 0 kan vara bästa call. Vid lika poäng vinner TIDIGASTE kickoff (stabil, deterministisk tiebreak).

EDGE-fall (alla rena, testade i personal-stats.test.ts): inga tips / inga avgjorda matcher / allt miss ger
tom statistik (accuracy null eller 0, bestCall null), så den börjar tom och fylls löpande när matcher avgörs.

**T23-visuellt (design-frontend, premium-finish ovanpå senior-devs bas): HIERARKI-disciplin, ingen tävlar.**
Designvärdena bor i `src/theme/tokens.css` §25 (`.vm-favorite-chip` + `.vm-personal-stats` + syskon). Tre delar:
- **Favorit-chippet (matchkortet):** en DISKRET markering som ligger på SAMMA kort som hero-kortets SOLIDA
  guld-"Dagens match"-bricka och kan SAMMANFALLA med den. Därför med flit en LUGNARE form: en UTLINJERAD
  guld-pill (låg guld-tint + guld-kant + en guld-stjärna), INTE en solid guld-yta. Solid guld = "dagens
  hjälte" (en per dag); utlinjerad guld = "ditt lag, var det än spelar". Så de två kan stå bredvid varandra
  utan att slåss om blicken (acceptanskriteriet: får inte krocka visuellt med `data-highlight`).
- **Statistik-panelen:** ett SYSKON till poäng-summeringen (TipsScoreSummary, §20) som ligger DIREKT OVANFÖR
  den. Summeringen är "din STÄLLNING" (total + placering, den stolta solida guld-totalen). Statistiken är
  "din SPELSTIL". Den får DÄRFÖR inte härma totalens solida guld-bricka (två guld-block hade tävlat). I
  stället: samma kvällsljus-familj (surface + svag guld-glow), men en LUGNARE glow (7% vs summeringens 8%)
  + en NEUTRAL inset-topplist (inte guld). Träffsäkerheten (viktigaste talet) lyfts varmt med en guld-TINT-
  bricka + guld-TEXT-etikett (inte en solid guld-yta); övriga tre nyckeltal är lugna neutrala surface-raised-
  rutor. Bästa call-kortet bär en låg guld-glow (det stolta ögonblicket); joker-markören återbrukar den
  SOLIDA guld-bricka-formen (DRY mot `.vm-coupon-mine`).
- **Favoritlags-väljaren:** appens etablerade form-språk (accent-fokus-ring + accent-hover-kant, samma
  `FIELD_BASE`-disciplin som PredictionForm/resultatinmatningen), så den känns som EN familj med övriga
  inmatningar i stället för en avvikande egen-stil.

**WCAG AA (mätt med `scripts/contrast-t23.mjs`, canvas-komposit VÄRSTA fall, BÅDA teman, MÖRKT / LJUST):**
All guld bär text som ANTINGEN full `fg` på en låg guld-tint ELLER den AA-säkra guld-TEXT-tonen
(`--color-warning`, djup amber i ljust tema), ALDRIG rå `--vm-gold` som text på tint (den kända fällan).
- Favorit-chip text (fg) på guld-10%-tint: **12.40 / 16.04**. Stjärnan (warning guld-text): **8.21 / 5.31**.
- Panel-eyebrow (warning guld-text) på guld-7%-glow: **8.80 / 5.48**. Rubrik (fg): **13.29 / 16.58**.
- Hero-stat-tal (fg) på guld-8%-tint: **10.63 / 16.46**. Hero-stat-etikett (warning): **7.04 / 5.44**.
- Övriga stat-brickor på opak surface-raised: tal (fg) **12.66 / 17.91**, etikett (fg-muted) **6.23 / 6.52**.
- Bästa call på guld-6%-glow: rubrik (fg) **11.12 / 16.75**, kontext (fg-muted) **5.48 / 6.10**.
  (Joker-markören som tidigare mättes här togs bort i T71, joker-tillägget borttaget.)

MIN över alla text-ytor: **5.48:1 mörkt / 5.31:1 ljust** (alla >= 4.5, normal text; ljust-MIN var
5.03:1 medan joker-markören fanns, höjdes till 5.31:1 när den togs bort i T71). Glow-/kant-/tint-
lagren under tröskeln bär ALDRIG text. Tomt-läge + gating oförändrade funktionellt (alla T23-tester gröna).

---

## 2026-06-12 , T4c (#35): arena + värdstad per match, källåkrad + korskollad

**Bakgrund:** T4b:s källa (Daniels svenska TV-tablå) bar TID + svensk TV-kanal men INTE arena, så
matches.ts hade en uttrycklig "ej verifierad"-platshållare (`VENUE_UNKNOWN`) per match, gissa-aldrig.
T4c fyller arenan + värdstaden per match ur FIFA:s officiella spelschema (16 arenor i USA/Mexiko/Kanada),
korskollad mot en andra oberoende källa. VM:et pågår LIVE (sedan 11 juni), så datakvalitet är allt.

**Beslut (källåkrad, gissas ALDRIG, samma mönster som T4/T4b/T10):** En SEPARAT gold source
(`src/data/wc2026/venue-source.txt`) bär en rad per match (`MATCH_ID | venue=Arena, Stad | match=etikett`),
parsas av en ren parser (`venue-parser.ts`) och injiceras in i den GENERERADE matches.ts via matchtablå-
generatorn (en ny `venueOf`-lookup i `buildMatches`/`buildMatchesFile`, samma idé som `groupOf`). Värde-låst
mot källan i CI (`venue-source.test.ts`: regenerera-och-diffa + mutationstest + 104/16-integritet). Ingen
arena bor handskriven i matches.ts; den är spårbar till källan och regenererbar (`npm run gen:matches`).

**Join-nyckel: match-id (g-A-1 / M73), inte datum.** Match-id:t är härlett ur kickoff + lag/grupp av T4b:s
generator och redan korskollat mot FIFA i `match-schedule-source.test.ts`. Att joina på det STABILA id:t (inte
på datum, som skiljer svensk vs amerikansk lokal-dag för sena avspark) gör join:en entydig: en FIFA-match per
repo-match, inga dubbletter/luckor. `buildVenueTable` fail-loud:ar vid varje drift (okänt id, dubblett, saknad
match, fel antal, fel antal distinkta arenor).

**KÄLLOR (hämtade 2026-06-12, gissas ALDRIG):**
- PRIMÄR (auktoritativ), FIFA:s spelschema: 16-arenor-listan ur Wikipedia "2026 FIFA World Cup"; per-match
  gruppspel ur Al Jazeera "World Cup 2026: Full match schedule"; per-match slutspel (matchnr 73-104 + exakt
  kommun) ur Wikipedia "2026 FIFA World Cup knockout stage".
- KORSKOLL (oberoende andra källa): MLSSoccer "FIFA World Cup 2026 schedule: Every game by city & stadium"
  (grupperad per arena, korskollad match för match) + ESPN-spelschemat (för exakt KOMMUN) + Wikipedia per-grupp-
  sidor. De SPELADE matcherna (11-12 juni) korskollade mot MATCHRAPPORTER (historiskt fakta): Mexiko-Sydafrika
  @ Estadio Azteca, Sydkorea-Tjeckien @ Estadio Akron (Zapopan).
- Oberoende JOIN-korskoll: AT&T Stadium har FLEST matcher (9), en publik FIFA-fakta, och vår fördelning ger
  exakt 9 där (pinnat i testet). Summan 9+8+8+8+7+7+7+7+6+6+6+6+6+5+4+4 = 104.

**AVVIKELSE MELLAN KÄLLOR (flaggad, INTE gissad), Belgien-Egypten (g-G-1, 15 juni):** Al Jazeera skrev
"BC Place, Vancouver", men FYRA andra källor (Lumen Fields officiella event-sida, Seattle Sounders matchpreview,
ESPN, MLSSoccer) säger Lumen Field, Seattle. **Vald: Lumen Field, Seattle** (4 källor mot 1, inkl. arenans egen
event-sida). Al Jazeeras Vancouver bedöms vara ett enstaka fel. Pinnat i venue-source.test.ts.

**Arenanamn + kommun (källhänvisat val, inte gissat):** FIFA använder sponsor-fria TURNERINGSNAMN
("Mexico City Stadium", "Estadio Guadalajara", "Dallas Stadium" osv.), men de ETABLERADE arenanamnen (som
matchrapporterna + `Match.venue`-exemplet i `domain/types.ts`, "MetLife Stadium, East Rutherford", använder)
är de riktiga. Vi använder det ETABLERADE arenanamnet + den FAKTISKA kommunen, konsekvent. Hela 16-arenor-tabellen
(kanonisk form i `KNOWN_VENUES`):

| Arena (etablerat namn) | Värdstad (kommun) | FIFA-turneringsnamn |
|---|---|---|
| Estadio Azteca | Mexico City | Mexico City Stadium |
| Estadio Akron | Zapopan | Estadio Guadalajara |
| Estadio BBVA | Guadalupe | Estadio Monterrey |
| BMO Field | Toronto | Toronto Stadium |
| BC Place | Vancouver | BC Place Vancouver |
| MetLife Stadium | East Rutherford | New York New Jersey Stadium |
| AT&T Stadium | Arlington | Dallas Stadium |
| SoFi Stadium | Inglewood | Los Angeles Stadium |
| Arrowhead Stadium | Kansas City | Kansas City Stadium |
| Levi's Stadium | Santa Clara | San Francisco Bay Area Stadium |
| NRG Stadium | Houston | Houston Stadium |
| Lincoln Financial Field | Philadelphia | Philadelphia Stadium |
| Mercedes-Benz Stadium | Atlanta | Atlanta Stadium |
| Lumen Field | Seattle | Seattle Stadium |
| Hard Rock Stadium | Miami Gardens | Miami Stadium |
| Gillette Stadium | Foxborough | Boston Stadium |

(Arrowhead heter formellt "GEHA Field at Arrowhead Stadium"; vi använder det vedertagna korta "Arrowhead Stadium"
som Wikipedia knockout-sidan. Estadio Akron vs "Estadio Guadalajara": matchrapporterna för den SPELADE g-A-2 +
Wikipedia använder "Estadio Akron, Zapopan", så vi följer det.)

**Platshållaren behålls som fallback (gissa-aldrig kvar):** `VENUE_UNKNOWN` finns kvar som det uttryckliga
fallbacket för en match UTAN verifierad arena-rad (`buildMatches` utan `venueOf`). I praktiken har alla 104
matcher en verifierad arena (drift-vakten kräver det), men fallbacket gör att en framtida tillagd, ännu-overifierad
match inte tyst gissas. `isVenuePlaceholder` (match-display.ts) + UI:t döljer en eventuell platshållare som förr.

---

## 2026-06-12 , T44 (#75): footer-promo, synlig adress + utvecklar-promotion

**Bakgrund (Daniels feedback 2026-06-11, #75):** footer-signaturen (T38/T39) länkade danielaldemir.com
men URL:en var GÖMD (bara i `title`/`aria-label`), namnet var enda klickbara målet. Daniel vill (1)
adressen SYNLIG bredvid namnet, tydligt klickbar, och (2) tydligare promotion av honom som utvecklare.
Dirigentens dispatch lade till: appens egen adress (vm-2026.pages.dev) SYNLIG så folk kan sprida den
muntligt / skriva av den.

**Beslut (frångår T39:s "bara namnet är länk, ingen synlig URL"):** T39 valde MEDVETET att inte visa
URL:en, för att hålla signaturen som en tät, balanserad enhet. Daniels nya feedback väger tyngre här,
så det valet frångås uttryckligt.

**Runda 1 (senior-dev, 9bf727c):** lugn variant med inline-länk bredvid namnet + punkt-divider.
**Runda 2 (Daniels live-feedback + design-frontend, a2a0b76):** "footern ska lyfta upp mig, få med
hela min hemsida så man ser att man kan klicka dit" - hela strukturen skrevs om till shippad form:

1. **Appens adress synlig i ledtexten** (`App.tsx` footer-`<p>`): "dela appen med vänner, **vm-2026.pages.dev**"
   som synlig, klickbar länk-text. Visas utan `https://`-prefix (renare att läsa/säga högt/skriva av),
   `href` bär hela URL:en (`https://vm-2026.pages.dev`, kanonisk app-URL per SPEC §3 / deploy.md). Detta
   är "sprid-appen"-behovet och bor i ledtexten, SKILT från signatur-blocket nedan.
2. **Sigill + "Byggd av" / "Daniel Aldemir" som blickfång** på en egen, framträdande rad: ett `.vm-signature-seal`
   (solid accent-bricka med "DA"-initialerna) bredvid "Byggd av" + "Daniel Aldemir" i full fg + display-vikt.
   Ingen punkt-divider - `danielaldemir.com` är en separat CTA-pill (se punkt 3). Namn-länkens kontrakt
   (href/target/rel mot www.danielaldemir.com) oförändrat, T39:s tabnabbing-test håller.
3. **`danielaldemir.com` som CTA-pill** (`.vm-install-pill`-återbruk, tokens.css §22): extern-länk-ikon,
   hover-accent-kant, focus-visible-accent-ring - omisskännligt klickbar, samma affordans som install-knappen.
4. **Utvecklar-titel** ".NET-systemutvecklare" som stödtext under blickfånget.

**Val av promo-omfattning:** dirigenten föreslog även en "vill du ha en app byggd? hör av dig"-kontaktrad
och en "byggd på 2 dagar med AI"-touch. Den LUGNASTE varianten valdes (titel + synliga adresser), eftersom
briefen säger "smakfullt, aldrig skrikigt, ingen reklampelare". Slut-texten + ev. fler element är Daniels
val (AC: "Daniel godkänner den slutliga promo-texten").

**Säkerhet (tabnabbing, hela footern):** alla tre externa länkar (app-adress, namn, danielaldemir.com)
använder `rel="noopener noreferrer"` + `target="_blank"`. Vaktas av tester i `App.test.tsx` (rätt href +
target + rel-tokens för app-adressen OCH danielaldemir.com-länken), så en framtida refaktor inte tyst
tappar skyddet eller den synliga adressen.

**Verifiering (HEAD 267017b):** build EXIT 0, full svit grön (1699 tester, +3 nya T44-tester +
1 omskrivet T38-test "Made by" -> "Byggd av", 53 skip, 0 fail), lint + format:check EXIT 0.
Kontrast AA båda teman, min 5.40:1 (sigill ljust tema), verifierad via scripts + Playwright.

## 2026-06-12 , T25 (#25): code-splitting (manualChunks), E2E-svit (Playwright) + a11y-audit (axe)

### Del 1: prestanda , vendor-split (manualChunks)

**Problem (KA-F4-pinnen från T13, "manualChunks om LCP-problem"):** produktionsbygget var EN
monolitisk JS-chunk, så ALLT, app-koden OCH alla tunga tredjeparts-paket, laddades och parsades som
ett enda block, och Rollup varnade ("chunks larger than 500 kB").

**Beslut:** `build.rollupOptions.output.manualChunks` (vite.config.ts) delar de tre stora, sällan-
ändrade vendorerna till egna chunks: `react`/`react-dom` -> `react-vendor`, `motion` ->
`motion-vendor`, `@supabase/supabase-js` -> `supabase-vendor`.

**Före/efter (vite build-output, ärligt, gzip i parentes):**

| Chunk | Före | Efter |
|---|---|---|
| `index` (app-kod) | 894.98 kB (245.80) | **580.51 kB (157.43)** |
| `react-vendor` | , | 11.21 kB (4.03) |
| `motion-vendor` | , | 94.98 kB (31.36) |
| `supabase-vendor` | , | 208.40 kB (54.19) |
| CSS (oförändrad) | 121.59 kB (17.21) | 121.59 kB (17.21) |

**Vad vinsten FAKTISKT är (ärlig avgränsning):** den totala initiala JS-mängden är ungefär
oförändrad, splittad, inte borttagen. Vinsten är (1) **cache-granularitet**: app-koden (ändras varje
deploy) invaliderar inte längre vendor-cachen, en återbesökare efter en app-only-deploy hämtar bara
~580 kB app-delta i stället för hela monoliten; (2) **parallell nedladdning** av de fyra chunksen i
stället för ett seriellt block; (3) den 895 kB-monolit som utlöste 500 kB-varningen är nu reviewbara
delar. Det är en LCP-/cache-förbättring, inte ett mindre totalt nedladdnings-paket.

**Medvetet INTE gjort (KISS, ingen prematur optimering):**
- **Ingen per-vy-lazy-load.** Appen är EN skroll-sida utan router där alla sektioner renderas direkt
  vid laddning; att Suspense-dela mitt-på-sidan-sektioner (admin-statistik, slutspelsträd) skulle
  lägga till komplexitet utan att krympa det INITIALA innehållet (de syns ändå direkt). Vendor-splitten
  är den värdefulla, låg-risk-vinsten.
- **supabase-vendor laddas EAGERT även i fixtures-läge.** Verifierat: `dist/index.html` har
  `<link rel="modulepreload" ... supabase-vendor>`. Roten är att flera providers (RoomsProvider,
  OfficialResultsProvider, LeaderboardProvider, PredictionsProvider m.fl.) STATISKT importerar
  `getSupabaseClient` från `supabase-browser.ts`, som statiskt importerar `@supabase/supabase-js`.
  `getSupabaseClient()` lat-initierar visserligen klienten (cachedClient), men det STATISKA modul-
  importet drar in hela biblioteket i den eager-grafen. Att göra den lazy kräver att ~10 providers
  görs async (de behöver klienten synkront i sin render-väg när live är på), en djup refaktor med
  risk, utanför ett kvalitetspass scope. Pinnat som en framtida förbättring, inte gjort nu.

### Del 2: E2E-svit (Playwright)

**Beslut:** `@playwright/test` (devDep) + `playwright.config.ts` mot `vite preview` (det BYGGDA
dist:et, inte dev-servern, så sviten fångar bygg-/chunk-fel). En FOKUSERAD svit (`e2e/flows.spec.ts`,
7 scenarier) över kritiska flöden i FIXTURES-läge.

**Varför fixtures i CI (ingen live-DB):** config:en sätter MEDVETET inga `VITE_SUPABASE_*`-env, så
datalagrets gata (data-source.ts) faller till fixtures och alla sociala providers är vilande. Sviten
är då deterministisk och kräver inga hemligheter. De 7 scenarierna: (1) appen laddar + alla
huvudsektioner renderas, (2) komprimera/expandera (aria-expanded + dubblerad toggle), (3) dag-
bläddring (rubrik byter + återställs), (4) what-if öppna + avbryt (data-simulation-active), (5)
lagprofil-modal öppna + Esc (role=dialog tas bort), (6) tema-växling (data-theme på html), (7)
install-ytan som ärlig guide-fallback i en vanlig flik.

**Stabilitet (inga flaky-sleeps):** sviten lutar sig helt på Playwrights auto-wait (locator-
assertions retas tills de stämmer), inga `waitForTimeout`. Onboarding-touren (en z-50 overlay vid
första besök som fångar alla klick) sås som "sedd" via `addInitScript` FÖRE laddning. NB: flaggans
sanna värde i localStorage är exakt "1" (FLAG_TRUE i safe-storage.ts), inte "true", en init-script
som skrev "true" gjorde att touren ändå öppnades och blockerade klicken (fångat under bygget).

**E2E körs SEPARAT:** `npm run test:e2e` (Playwright) kör BARA e2e/; `npm test` (Vitest) är pinnat
till `include: ['src/**/*.{test,spec}.{ts,tsx}']` så Vitest ALDRIG plockar upp e2e/*.spec.ts
(Playwrights test.describe kraschar under Vitest). E2E:s tsconfig (e2e/tsconfig.json) ligger
MEDVETET utanför root-ens `tsc -b`-referenser så app-bygget inte drar in Playwright-/Node-typer.

### Del 3: A11y-audit (axe-core), WCAG AA

**Beslut:** `@axe-core/playwright` kör axe på huvudvyn i BÅDA teman (ljust + mörkt) i fixtures-läge
(`e2e/a11y.spec.ts`), mot taggarna wcag2a/wcag2aa/wcag21a/wcag21aa.

**Äkta violations som ÅTGÄRDADES (båda teman):**

- `aria-prohibited-attr` (serious) på Wordmark-spanen: `aria-label` är bara tillåtet på element som
  tar ett tillgängligt namn. En naken `<span>` (generisk roll) gör inte det. FIX: span-varianten får
  `role="img"` (kanoniskt mönster för stiliserad text-logga); h1-varianten orörd (rubriker namnges
  lagligt av aria-label). Wordmark.tsx.
- `scrollable-region-focusable` (serious) på `.vm-bracket-scroll`: en scrollbar yta måste nås med
  tangentbord (när slottarna är tomma finns inga fokuserbara barn att tabba till). FIX: ytan får
  `tabIndex={0}` + `role="group"` + aria-label + focus-visible-ring, i BÅDE BracketView.tsx och
  TipsBracketView.tsx (samma fix båda ställen).

**MEDVETET AVVISAD regel (false positive, verifierad, inte hand-wave):**

- `color-contrast` (6 noder, bara LJUST tema): axe komposterar inte `color-mix(...)`-tonade pill-ytor
  korrekt och gissar mot fel bakgrund. De flaggade elementen är "Dagens match"-etiketten + match-
  kortens stage-/TV-chip, alla `text-fg-muted` eller full `text-fg` på color-mix-tvättar. EMPIRISKT
  verifierat att de är AA: fg-muted ljust (#4f6258) = **6.52:1 mot vit surface / 5.92:1 mot bg
  #f1f5f0**, full fg är 12.6-17.9:1 (tokens.css §0, redan canvas-komposit-mätt). Bägge >> 4.5. Regeln
  avvisas därför EXPLICIT i a11y.spec.ts (`disableRules(['color-contrast'])`) med denna motivering;
  ALLA andra axe-regler vaktas skarpt (en äkta saknad etikett/fel roll/dubbla id failar rött). Att
  låta axe "rätta" de redan-mätta color-mix-värdena vore att jaga ett spöke (jfr lessons aa-kontrast-
  false-positive vs den ÄKTA T29-gold-on-tint-skulden, som var en annan, gold-text-klass).

## 2026-06-12 , T29 (#48 + T56-review F4): demo-data-chippet till AA-säker solid-form, EN delad klass

**Problem (gold-on-tint-fällan, lessons aa-kontrast-pastad-...-text-på-tint):** "Demo-data"-märket i
fyra vyers rubriker (GroupStageView, BracketView, DailyMatchesView, ScenarioView) renderade rå
`--vm-gold` som TEXT på en `color-mix(--vm-gold 12%, transparent)`-tint, fyra IDENTISKA inline-recept.
I MÖRKT tema är `--vm-gold` ljust (#f3c14e) så det höll, men i LJUST tema byter tokenen till mörk amber
(#b07d10) medan ytan är nästan vit -> **uppmätt 3.17:1** (under AA-text 4.5:1). Det är exakt samma fälla
som T9 redan fixade för "Dagens match"-chippet och som T13-review (#48) + T56-review (F4) flaggade här.

**Beslut:** byt ALLA fyra demo-chip till den färg-OBEROENDE **solid-bricka-formen** (SOLID `--vm-gold`-yta
med mörk ink `--vm-coupon-ink` #1c1403), single-sourcad i EN delad klass `.vm-demo-chip` (tokens.css §24),
samma single-sourcing som `.vm-install-pill` och samma visuella form som `.vm-coupon-mine` /
`.vm-reveal-actual` / `.vm-tips-sim-badge` bär i hela appen. De fyra spridda inline-recepten ersätts av
`className="vm-demo-chip"`.

**AA-mätning (canvas-komposit, `scripts/contrast-t29.mjs`, källskannat av `src/theme/demo-chip-aa-guard.test.ts`):**
`--vm-coupon-ink` (#1c1403) på SOLID `--vm-gold` per tema: **LJUST (gold #b07d10) = 5.03:1, MÖRKT (gold
#f3c14e) = 10.90:1**. Båda >= 4.5, AA i BÅDA teman. (Det ljusare guldet i mörkt tema ger den HÖGRE ration
mot den mörka inken, inte tvärtom.) Samma redan-uppmätta par som de övriga solid-guld-brickorna i appen
(decisions.md T15/T17-visuellt). Det GAMLA receptet mäts också i scriptet (7.86 mörkt / 3.17 ljust) som
bevis på varför bytet behövdes. Vakten `demo-chip-aa-guard.test.ts` källskannar de fyra vyerna (måste
använda `.vm-demo-chip`, får aldrig återinföra `color: var(--vm-gold)`-receptet) OCH räknar AA mot de
FAKTISKA token-värdena per tema (når medvetet den ljusa grenen där gamla formen bröts).

## 2026-06-12 , T33 (#56): delad `<Modal>`-primitiv (a11y-dialog-kontraktet, EN sanning)

**Beslut (ren refaktor, beteende-neutral):** det a11y-dialog-kontrakt som FEM dialoger handrullade
identiskt (TeamProfilePanel T10, OnboardingDialog T13, SettingsControl T32, ScoreGuide T34,
GetStartedDialog T54) lyftes till en delad `src/components/Modal.tsx`. Rule-of-three var passerad 5+
gånger; ScoreGuide- och GetStarted-filerna FLAGGADE själva i sina headers att tröskeln nåtts och att
extraktionen skulle bli en egen task. Detta är den tasken. Primitiven äger: portal till body,
role="dialog" + aria-modal + aria-labelledby/-describedby, Escape, bakgrundsklick (av/på), fokus in
(till caller-vald startpunkt) + fokus-retur till öppnaren, fokus-fälla (Tab/Shift-Tab), motion-gating
(reducerad rörelse). Den äger INTE innehållet eller den visuella overlay-/panel-stilen, det är
`children` + styling-slots (`overlayClassName/Style`, `panelClassName/Style`, `name`-baserad
data-attribut-namnrymd `data-${name}-overlay`/`-panel`), så varje dialog behåller SIN visuella identitet
(hero-band etc.). Samma form som den andra delade primitiven CollapsibleSection (T68).

**Escape-fasen är per-dialog, INTE "alla på capture" (beteende-neutralitet + verifierad jsdom-semantik):**
default är bubble-fas (de fyra dialoger som förr lyssnade så). GetStarted-guiden sätter `escapeCapture`
(capture-fas + stopPropagation), eftersom den kan öppnas OVANPÅ onboardingen ("Visa hur"-CTA:n) och
måste konsumera Escape FÖRST så bara den översta stängs (T54/#93 F2, bevarat). VARFÖR inte göra ALLA
capture (vilket först verkade ge "alla dialoger stack-safe gratis"): **empiriskt probe-bevisat (T33)**
att två CAPTURE-lyssnare på SAMMA target (document) fyrar i REGISTRERINGS-ordning, så den UNDERSTA
(monterad först) fyrar FÖRE den översta och stänger sig själv innan stopPropagation hinner verka, dvs
"alla på capture" stänger BÅDA. Den fungerande stapel-semantiken är capture-OVANPÅ-bubble (översta
capture fyrar i capture-fasen och stoppar den understas bubbel-lyssnare). En generell "vilken modal
som helst stack-safe"-lösning kräver en delad modal-stack (z-index-topp äger Escape), flaggad som
Improvement, inte smyglagd här. Probe: två capture-lyssnare -> `order: outer,inner` (outer fyrar);
capture(top) + bubble(under) -> bubble når aldrig (stopPropagation i capture).

**C7/C9-invarianterna (TeamProfilePanel) bevarade utan stabil-id-plumbing:** primitiven monteras BARA
när dialogen är öppen (callern villkorsrenderar den), så Escape-/fokus-effekterna löper exakt en gång
per öppning via mount/unmount, inte vid varje store-uppdatering (live/realtid T18). TeamProfilePanel
behöll sin `if (profile === null) return null` och renderar `<Modal>` bara när en profil finns; dess
C7/C9-tester (fokus stabilt + keydown-lyssnare läggs en gång, ingen churn vid store-uppdatering) är
gröna oförändrade.

**Fokus-retur via `document.activeElement` (mer generell än den gamla trigger-ref-fångsten):** primitiven
minns det element som var fokuserat när modalen MONTERADES och återför fokus dit vid unmount. I en riktig
webbläsare flyttar ett klick på trigger-knappen fokus dit, så `document.activeElement` === triggern vid
öppning -> retur till triggern, identiskt med det gamla beteendet i praktiken. Tre dialoger fångade förr
`triggerRef.current` explicit; den nya fångsten är korrekt i ALLA fall (även keyboard-öppning).

**Test-/markup-ändringar (ärligt listade, alla justerade BARA där de testade implementations-detaljer):**
- Panel-data-attributet normaliserades till `data-${name}-panel` (förr `-dialog`/`-onboarding-dialog`/
  `-settings-dialog`). INGEN CSS eller annan komponent refererade dessa (grep-verifierat); enda referens
  var ScoreGuide-testets `[data-score-guide-dialog]` -> uppdaterad till `[data-score-guide-panel]`
  (samma per-surface stabila krok på dialog-noden, bara namnet följer primitivens enhetliga konvention).
- TeamProfilePanel portaleras NU (förr inline). Tre tester använde `container.querySelector(...)` för
  innehåll som nu ligger i body-portalen -> bytta till `screen.getByRole('dialog').querySelector(...)`
  (samma assertion, rätt sök-rot efter portalen). Portalen är en BEVIS-bar förbättring (samma T32-robusthet
  som de tre redan-portalerade dialogerna), inget visuellt.
- GetStartedControl-testet "återställer fokus till triggern": lade `trigger.focus()` INNAN klick, för att
  spegla en riktig webbläsares klick-fokus (jsdom:s fireEvent.click fokuserar inte), så det testar
  `<Modal>`:s document.activeElement-fångst korrekt (samma grepp som TeamProfile-/Onboarding-testerna).
- `src/test/setup.ts`: WARM:ar motion-reduced-motion-init en gång (renderar en minimal hook-komponent),
  så motions globala lazy-init inte sker mot ett transient matchMedia-spion-läge i ett senare test (med
  primitiven körs useReducedMotion först vid dialog-ÖPPNING, inte vid parent-mount som förr). Produktionen
  påverkas inte; ren testmiljö-härdning, samma anda som matchMedia-/MotionGlobalConfig-stubbarna.

**Bevarat exakt:** lag-profilens panel reser 28 px (de andra 24), så `<Modal panelRisePx>` defaultar 24
och lag-profilen skickar 28, in-animationen pixel-identisk. Overlay-layout-ryggraden (fixed inset-0 z-50,
bottom-sheet-på-mobil -> centrerad-på-desktop) bor i primitivens base; den dialog-specifika finishen
(backdrop-blur, .vm-profile-overlay-blur) i `overlayClassName`. Onboardingen behåller `closeOnBackdrop=false`.
Full svit grön (176 testfiler, exit 0) efter VARJE migrering (en i taget).

## 2026-06-12 , T69 (#132): FIFA-ranking uppdaterad till juniutgåvan (2026-06-11)

**Beslut (data-uppdatering, gissas ALDRIG):** `Team.fifaRanking` för alla 48 VM-lag uppdaterades
från FIFA:s aprilutgåva (T10) till **juniutgåvan, OFFICIELLT publicerad 2026-06-11** (nästa officiella
utgåva 2026-07-20, så juni är den senaste vid byggtillfället). Värdena ändrades BARA i gold-source
(`src/data/wc2026/team-profiles-source.txt`) och `team-profiles.ts` REGENERERADES via
`npm run gen:team-profiles` (ingen handredigering av den genererade filen). Källankrings-låset
(`team-profiles-source.test.ts`: regenerera-och-diffa + mutationstest + 48/48-täckning) håller grönt.
Stjärnspelare + kuriosa är OFÖRÄNDRADE sedan T10 (samma trupper offentliggjorda 2026-06-02); bara
rank-fältet rörts (plus två kuriosa-justeringar som följer av rank-bytet, se nedan).

**Källor (FIFA-ranking, hämtade 2026-06-12):** Den officiella tabellen på
inside.fifa.com/fifa-world-ranking/men är JS-renderad (ingen tabell i server-HTML, gick INTE att
parsa direkt), så positionerna togs ur återgivningar av SAMMA 11 juni-utgåva och korskollades:
- Position 1-50: ESPN:s återgivning av juniutgåvan
  (https://www.espn.com/soccer/story/_/id/46664763/fifa-mens-top-50-world-rankings), korskollad mot
  Wikipedia (topp 20 med poäng, https://en.wikipedia.org/wiki/FIFA_Men's_World_Ranking) och
  whereig.com (full tabell, https://www.whereig.com/football/fifa-world-rankings.html). ESPN och
  whereig är IDENTISKA på 1-50.
- Position 50-90 (de lägre rankade VM-lagen): whereig.com, korskollat mot oberoende sök-återgivning
  av 11 juni-utgåvan. Samtliga sub-50 VM-lag (QAT 56, IRQ 57, RSA 60, KSA 61, JOR 63, BIH 64, CPV 67,
  GHA 73, CUW 82, HAI 83, NZL 85) bekräftade av MINST TVÅ oberoende källor.

**Den stora förändringen:** Argentina (regerande mästare) återtog 1:a-platsen (1877.27 p) före Spanien
(1874.71) och Frankrike (1870.7); Frankrike föll från 1:a (april) till 3:a. Fortsatt den tightaste
topp-3 i rankningens historia. Två kuriosa-rader justerades så de förblir SANNA mot den nya etttan:
"FIFA:s etta inför 2026" flyttades från FRA-raden till ARG-raden (verifierbart faktum, inte gissning).

**Ändrade rank-värden (19 av 48 lag, april -> juni):** ARG 3->1, FRA 1->3, MAR 8->7, NED 7->8,
URU 17->16, SEN 14->15, MEX 15->14, USA 16->17, IRN 21->20, CIV 34->33, CZE 41->40, SCO 43->42,
PAR 40->41, TUN 44->45, PAN 33->34, QAT 55->56, BIH 65->64, CPV 69->67, GHA 74->73. Övriga 29 lag
oförändrade. Alla 48 positioner är fortsatt UNIKA (testets unik-rank-invariant håller).

**Värde-låsta tester MEDVETET uppdaterade (med motivering):**
- `team-profiles-source.test.ts` spot-check: bytt från "Frankrike #1" till "Argentina #1 + Frankrike
  #3" (speglar den nya etttan). Mutationstestets kommentar uppdaterad (rank=1 är nu Argentina).
- `TeamProfilePanel.test.tsx`: Frankrikes profil visar nu "#3" (var "#1").
Inga ANDRA konsumenter låser de reella rank-värdena: skräll-badgen (T19) jämför rank RELATIONELLT
(vinnare vs förlorare), inte mot absoluta tal, och dess egna test-fixtures är syntetiska (egna
fifaRanking-värden, ej bundna till gold-source). Skräll-logiken förblir därför konsekvent.

## 2026-06-12 , T68 (#129): Komprimerbara sektioner, ETT delat mönster (CollapsibleSection)

**Bakgrund:** sidan har vuxit till åtta tunga sektioner och blev en oöverskådlig vägg att skrolla.
Daniels spec: varje sektion ska bli överblickbar via ETT delat komprimerings-mönster, rubrik +
beskrivning alltid synliga, bara "toppen" av innehållet synligt komprimerat, tydlig expandera.

**Beslut , komprimerings-METOD per sektion (Daniels direktiv: "render-subset för grupper/listor med
count, höjd-klipp för träd"):**

- **Delad primitiv `CollapsibleBody` / `CollapsibleSection`** (`src/components/CollapsibleSection.tsx`):
  återanvänder den befintliga `ExpandToggle` (T39/#68, utökad med en valfri binär `labels`-prop) så
  hela sidans expandera-kontroller bär IDENTISK a11y-semantik (aria-expanded/-controls, chevron,
  fokus-flytt vid ihopfällning). EN markup-källa = ingen drift.
- **HÖJD-KLIPP med gradient-fade valdes för ALLA sektioner**, inte render-subset. Varför: "första
  raden"/"toppen" är RESPONSIV (ett grid visar 1/2/3/4 kort per rad beroende på skärmbredd; ett träd
  har en topp-del oavsett kort-antal). En render-subset kan inte veta brytpunkten vid render-tid, så
  ett höjd-klipp till en första-rad + fade är den ÄRLIGA "första raden synlig"-effekten oavsett
  skärmbredd (mobil först). `collapsedMaxHeight` per sektion (grupper/vad krävs 20rem = ett HELT
  första-kort + en fade-veiled glimt av nästa rad så klippet aldrig skär mitt i ett kort, uppmätt kort
  ~15.5rem; träd 17rem, tips-sektionerna 15-16rem, admin 9rem, topplistan 14rem). Komprimerat innehåll
  DÖLJS inte ur a11y-trädet (det syns visuellt + nås av skärmläsare), bara höjden klipps.
- **PREMIUM-FINISH (design-lager, `src/components/collapsible.css` + CollapsibleSection):** faden är en
  EASED multi-stop-gradient (smälter in i bakytan, ingen hård kant); en token-färgad CHEVRON-cue vid
  klipp-kanten gör "det finns mer" omisskännligt (aria-hidden, knappen bär a11y:n); faden + cue:n
  renderas BARA när innehållet faktiskt klipps (ResizeObserver-mätning, gatad så jsdom behåller
  fade-test-kontraktet); och en diskret max-height-transition vid UTFÄLLNING (ihopfällning momentan,
  fokus flyttas ändå till toppen). Allt reduced-motion-gatat (WCAG 2.3.3). Senior-dev byggde den
  funktionella basen; design-lagret gör finishen premium utan att röra logik/fönster/sortering/test-hakar.
- **State överlever INTE reload** (KISS, dokumenterat): expanderat/komprimerat är lokal useState. En
  sidladdning återställer till det överblickbara default-läget, vilket är hela poängen.
- **Tips-LISTAN (Tippa matcherna) komprimeras INTE via CollapsibleBody** utan via sitt EGNA fönster-
  mönster (count-baserad lista), se nästa beslut.
- **Topplistan/avslöjandet (punkt 11) startar UTFÄLLD** (`startExpanded`): dirigentens tolkning av
  Daniels "expanderat direkt också". Poäng-sammanfattningen (egen poäng) hålls ALLTID synlig överst,
  bara topplistan + avslöjandet är komprimerbara. Flippa default om Daniel vill ha den komprimerad direkt.
- **RÖRS INTE:** dagens matcher + nedräkning (DailyMatchesView) och rum-sektionen (RoomSection), per spec.

## 2026-06-12 , T68 (#129): Tips-listan visar BARA DAGENS matcher (paritetsguard MEDVETET uppdaterad)

**Beslut:** "Tippa matcherna"-listan default visar nu BARA dagens matcher (`selectTodayMatches` i
`src/features/results/result-window.ts`), expandera fäller ut alla. Detta ERSÄTTER tips-listans
tidigare igår+framåt-fönster (T62, `windowMatches`).

**Varför + paritetsguarden:** RESULTAT-/poängvyn (ResultEntryView/RevealView) BEHÅLLER sitt bredare
fönster (igår + idag + 2 fram), där T62 medvetet tog med IGÅR så gårdagens avgjorda matchers poäng
syns kvar. TIPS-listan handlar om vad man kan tippa NU (dagens kommande matcher), inte om gårdagens
redan spelade. De två vyerna har därför nu MEDVETET OLIKA default-fönster. Det tidigare
paritets-kontraktet (`predictions-results-window-parity.test.tsx`) vaktade LIKHET; det är nu
omskrivet att vakta den AVSEDDA SKILLNADEN, så att (a) tips-vyn aldrig av misstag faller tillbaka
till det bredare fönstret (då dyker gårdagens spelade upp i tippnings-listan), och (b) resultatvyn
aldrig krymper till bara-idag (då försvinner gårdagens poäng, det T62 löste). `selectTodayMatches`
delar shape (visible/hiddenCount/anchorKey) med `windowMatches`, så ExpandToggle-wiringen är oförändrad.

## 2026-06-12 , T68 (#129): VM-mästar-listan alfabetisk + "Spara grupptips"-knappen + osparat-indikator

- **VM-mästar-listan (champion-väljaren) sorteras ALFABETISKT** på visningsnamn med svensk locale
  (`localeCompare(..., 'sv')`, så å/ä/ö hamnar efter z) i `selectPredictableBracket`
  (`bracket-predictable-slots.ts`). Bland alla 48 lag är det enklast att hitta sitt lag i
  bokstavsordning. Bara CHAMPION-listan sorteras; match-slotsen (M73..M104) är binära (hemma/borta)
  och behåller sin naturliga ordning.
- **Grupp-tips-knappen heter ALLTID "Spara grupptips"** (aldrig "Ändra"), per Daniels uttryckliga
  krav. Ett tips ändras genom att man Sparar om, så samma verb varje gång är ärligare. INGEN
  auto-spar (dirigentens beslut på Daniels fråga, tydlighet i stället).
- **Osparade-ändringar-indikator:** en synlig "Osparade ändringar"-bricka (role=status) när
  formulär-state skiljer från senast sparade. Härleds av en snapshot-jämförelse (formulärets val mot
  det senast sparade tipset), inte bara av en dirty-flagga, så indikatorn försvinner även om man
  redigerar tillbaka till det sparade värdet. Den befintliga `dirtyRef`-spåren styr fortfarande den
  externa seed-synken (rör inte halvfärdiga val); indikatorn är ny separat state.

## 2026-06-12 , T36 (#64): TWA-vägen runt Play Protect-varningen, utredd + assetlinks förberedd

**Bakgrund:** T30 (#50) fastställde att Play Protect-varningen "byggd för en äldre version av Android"
styrs av WebAPK:ns `targetSdkVersion`, som sätts av webbläsarens MINTNINGSSERVER (Chrome/Google eller
Samsung Internet), inte av vårt manifest, och alltså ligger UTANFÖR vår kontroll. Daniel ser ändå
varningen och accepterar inte att leva med den. T36 utreder en VÄG RUNT: paketera PWA:n som en
**Trusted Web Activity (TWA)** , en riktig, signerad Android-app , och publicera via Google Play.

**Beslut / slutsats (research-tung, gissa-aldrig, allt källhänvisat):**

En **Play-publicerad TWA får INTE Play Protect-varningen.** Kedjan, verifierad mot officiella källor:
1. Varningen triggas BARA när appens `targetSdkVersion` är mer än 2 nivåer under enhetens Android-API-
   nivå. Källa: Google, "Developer Guidance for Google Play Protect Warnings"
   (https://developers.google.com/android/play-protect/warning-dev-guidance), exakt: "These Play Protect
   warnings will show only if the app's targetSdkVersion is more than 2 versions lower than the current
   Android API level."
2. Google Play KRÄVER sedan 2025-08-31 att nya appar och uppdateringar targetar **Android 15 (API 35)**
   eller högre. Källa: Play Console Help, "Meet Google Play's target API level requirement"
   (https://support.google.com/googleplay/android-developer/answer/11926878), exakt: "New apps and app
   updates must target Android 15 (API level 35) or higher to be submitted to Google Play." En TWA
   byggd och uppladdad NU får alltså en aktuell targetSdk , varningens utlösande villkor uppfylls inte.
3. Appen signeras dessutom (Play App Signing, krav sedan augusti 2021), och Play Protect blockerar
   osignerade/felsignerade APK:er. En korrekt signerad, targetSdk-aktuell Play-app faller alltså utanför
   BÅDA utlösarna. Skillnaden mot dagens WebAPK: där sätts targetSdk av browser-mintningen (33, gammal),
   här av vårt eget bygge (35+) + Play.

**Vad TWA-vägen KRÄVER (källhänvisad krav-lista):**
- **Google Play Developer-konto: 25 USD ENGÅNGSAVGIFT** (inte årlig, till skillnad från Apple). Källa:
  Play Console Help, "Get started with Play Console"
  (https://support.google.com/googleplay/android-developer/answer/6112435) + flera 2026-bekräftelser.
  **= Daniels beslut, kräver hans konto, kan inte göras autonomt.**
- **Paketeringsverktyg.** PWABuilder (GUI, lättast) ELLER Bubblewrap (Googles officiella CLI).
  PWABuilder kör Bubblewrap under huven , samma output (`.aab` för Play + `.apk` för test). Källa:
  Google codelab "Adding Your PWA to Google Play" (https://developers.google.com/codelabs/pwa-in-play)
  + pwa-builder/pwabuilder-google-play (README). Rekommendation till Daniel: PWABuilder (ingen lokal
  JDK/Android-SDK, allt i webben), Bubblewrap som alternativ om han vill ha CLI-kontroll.
- **Digital Asset Links (`assetlinks.json`)** på sajtens rot under `/.well-known/`, som binder appen till
  vm-2026.pages.dev. relation = `delegate_permission/common.handle_all_urls`, namespace = `android_app`,
  plus package_name + SHA-256-fingerprinten från **Play App Signing** (Play Console -> Setup -> App
  integrity). Källor: Chrome for Developers, "Android Concepts for Web Developers"
  (https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs) + PWABuilder
  Asset-links.md. **Fingerprinten finns först EFTER signering , Daniels steg.**
- **TWA-kvalitetskriterier:** PWA:n måste vara installerbar och nå Lighthouse performance-score >= 80.
  Källa: Chromium Blog, "Changes to quality criteria for PWAs using Trusted Web Activity"
  (https://blog.chromium.org/2020/06/changes-to-quality-criteria-for-pwas.html). VM 2026 är redan en
  installerbar PWA (T30-manifestet), så detta är sannolikt uppfyllt , verifieras med Lighthouse.
- **Store-listning + granskning:** Play kräver app-namn, ikon, beskrivning, skärmdumpar, integritets-
  policy + innehållsklassificering, och en granskningstid (timmar-dagar för nya konton). Daniels steg.

**Alternativen som övervägdes:**
- **Vänta på WebAPK-fix?** Avvisat som enda lösning: targetSdk-bumpen ligger hos browser-leverantörerna
  (särskilt Samsung Internets egen pipeline, T30) och har ingen utlovad tidpunkt. TWA är det enda vi
  KAN styra själva.
- **PWABuilder vs Bubblewrap:** se ovan , samma resultat, PWABuilder enklare för Daniel.

**Vad som LEVERERADES NU (utan Daniels Play-konto):**
1. `public/.well-known/assetlinks.json` , en korrekt strukturerad STUB med en MEDVETEN platshållar-
   fingerprint (måste bytas efter signering). Källankrat av `src/pwa/assetlinks.test.ts` (giltig JSON +
   exakt relation/namespace + platshållaren kvar).
2. `docs/twa-guide.md` , pedagogisk svensk steg-för-steg för Daniel (PWABuilder/Bubblewrap, konto,
   signering, assetlinks, upload) + en numrerad "Behöver Daniel"-lista.

**Cloudflare Pages + `.well-known` (ärlig osäkerhet, MÅSTE verifieras efter deploy):** LOKALT bevisat
att `vite build` kopierar `public/.well-known/` -> `dist/.well-known/` och att `vite preview` serverar
`/.well-known/assetlinks.json` (HTTP 200, `application/json`). Det som INTE gått att verifiera autonomt
(Daniel offline, ingen deploy-access): att Cloudflare Pages serverar en dot-prefixad mapp på edge. Det
finns motstridiga community-rapporter om att Pages historiskt strippat dotfiler; den fixen (cloudflare/
wrangler-legacy PR #1566) gällde dock det GAMLA Workers-Sites-flödet, inte nödvändigtvis Pages. Cloudflares
egen dokumentation listar det INTE som känd begränsning och refererar själv till `/.well-known/acme-
challenge/`, men det är inget garanti-bevis. **Efter nästa deploy: `curl -i https://vm-2026.pages.dev/.well-known/assetlinks.json`
ska ge 200 + JSON, inte index.html.** Misslyckas det finns dokumenterade fallbackar i twa-guiden
(`_redirects`, Pages Function, eller Worker framför Pages). Filen är korrekt , bara serverings-vägen
kan behöva ett extra handgrepp.

**Avgränsning (ärlig):** Issue #64:s punkt 3 (förbättra själva install-instruktionen i appen, tydligare
än T30:s rad) ligger UTANFÖR denna tasks dispatch-scope (research + TWA-förberedelse). Den befintliga
`ANDROID_PLAY_PROTECT_NOTE` (T30) finns kvar och visas i kom-igång-guiden. Punkt 3 lämnas som ett eget
nästa-steg (se handoff Next), så denna task håller fokus och inte sväller.

---

## 2026-06-12 , T24-visuellt (#24, design-frontend): reaktionsradens premium-finish, AA UPPMÄTT i båda teman

**Beslut:** Den visuella finishen på reaktionsraden bor i `rooms.css` §9 (`.vm-reaction-*`), samma seam
och samma fil som kommentarernas finish (§8, T66), INTE i `tokens.css`. **Varför:** reaktionsraden är en
del av rums-feature:ns sociala lager och ska följa dess egen stil-fil. `rooms.css` importeras via
`RoomPanel.tsx` (exporterad ur rooms-barreln, alltid i bundlen), och appen är EN sida (DailyMatchesView +
RoomSection i samma `<main>`), så `.vm-reaction-*` gäller där MatchReactions renderas. Logik/data-hakar/
aria rördes ALDRIG (seam-principen): finishen hänger bara på senior-devs `data-reactions-*` + `data-mine` +
`aria-pressed`.

**Känsla (taskens ord, "levande men inte stojigt", kvällsljus-familjen):**
- **Vilo-bricka** (andras reaktion): en lätt, rund pill med en hårfin guld-värme i fonden
  (`color-mix(--vm-gold 4%, surface)`, samma kvällsljus-detalj som `.vm-comment-input`), så raden känns som
  en del av snacket, inte en grå knapp-rad.
- **MIN bricka** (`data-mine`): markeringen är FÄRG-OBEROENDE, `aria-pressed` bär den för skärmläsare, och
  visuellt bärs den av en accent-RING (kant, via Tailwinds `aria-pressed:border-accent`) + en lugn accent-
  tint i ytan (`color-mix(--vm-accent 10%, surface)`). Tinten ensam räcker aldrig (form + ring + aria-pressed
  bär signalen), men den lyfter "min" tydligt ur raden.
- **Antalet** (count) är den enda TEXTEN på en bricka. Färgen är SINGLE-SOURCAD i CSS (vilo = fg-muted, min
  = lyft till fg), inte en Tailwind text-utility i TSX, så count-tonen är EN sanning och inte en specificitets-
  strid (lessons tailwind-utility-vs-handskriven-css). MIN count lyfts till full fg + font-semibold så den
  läses starkt.
- **Add-knappen** lämnas på senior-devs diskreta dashed-pill (KISS, ingen extra rums-regel som vore brus).
- **Pickern** (utfälld 8-emoji-väljare): en lugn popover med en mjuk höjd (`--vm-shadow-raised`) + en hårfin
  guld inre-högdager, så den läser som ett svävande lager. Vald emoji bär en accent-RING (`box-shadow inset`)
  så "vald" syns som FORM, konsekvent med brickans ring.

**RÖRELSE / REDUCED MOTION:** ingen brick-/pop-animation (taskens punkt 3: statisk är fin). Den enda rörelsen
är de delade hover/fokus-övergångarna senior-dev satte (`transition-[...] duration-150`), nollade av den
svepande reduced-motion-grinden i `index.css`. INGA rums-egna `@keyframes`, så inget extra att nolla.

**KONTRAST (WCAG AA, UPPMÄTT per tema, sRGB-luminans, canvas-komposit VÄRSTA fall, `scripts/contrast-t24.mjs`,
lessons aa-kontrast: mät VARJE tema separat, attribuera rätt, mät VÄRSTA fallet):** emojin själv är en
färg-oberoende bild-glyf; bara ANTALET är text (solid-form-disciplin).
- Vilo-brickans antal (fg-muted) på guld-4%-pill: **mörkt 6.99:1 / ljust 6.25:1**.
- MIN brickas antal (lyft till fg) på accent-10%-pill: **mörkt 12.43:1 / ljust 15.61:1** (och OM det vore
  fg-muted skulle det ändå hålla: mörkt 6.12:1 / ljust 5.69:1, marginal-koll).
- "Reagera"-etiketten (fg-muted) på add-knappens surface-fond: **mörkt 7.50:1 / ljust 6.52:1**.
- MIN brickas accent-kant (ren UI-dekor, bär ingen text): mörkt 9.68:1 / ljust 5.40:1 mot surface
  (>= 3:1, UI-komponent-tröskeln). Alla text-ytor >= 4.5:1 (normal text). MIN över text-ytor: **mörkt 6.12:1
  / ljust 5.69:1**.

**MOBIL FÖRST (390/280):** raden är `flex flex-wrap items-center gap-1.5` (senior-dev), så brickorna RADBRYTER
på smala skärmar utan horisontell scroll; pickern är `w-full flex-wrap`, så de 8 emojierna bryter snyggt på
280px. Verifierat via build (`.vm-reaction-*` i byggd CSS) + den kompilerade cascade-ordningen (vilo-count
fg-muted spec 0,2,0 < min-count fg spec 0,3,0, vinner korrekt).

## 2026-06-12 , T24 (#24): emoji-reaktioner på matcher i rummet

**Beslut:** Ny tabell `public.room_reactions` (room_id, user_id, match_id, emoji, created_at) för
emoji-reaktioner på matcher per rum. Migration `20260612160000_t24_room_reactions_schema_rls_realtime.sql`,
applicerad LIVE. ÄRLIG precision (review-F1): namn + INNEHÅLL är 1:1 (live-schemat verifierat kolumn för
kolumn), men fil-versionen är en placeholder-stämpel, live-apply-versionen är `20260612134058` (samma
MCP-nyans som T45/T19/T53/T67). Ett `db reset` replayar samma slutläge under filens stämpel.
**Varför:** Snabbt, lekfullt social-lager ovanpå kommentarerna (T66): noll text, bara en knapp. Snacket
runt matcherna är halva nöjet.

**Beslut (MVP-yta, KISS): reaktioner sitter BARA på matchkorten i dagens-vyn, INTE på topplista-rader.**
Issuen nämnde topplista-rader "om billigt". Vi valde matcherna som MVP: det är där snacket händer, och
en reaktion på en topplista-RAD (en person) hade krävt en annan datamodell (reagera på user, inte match)
och en ny yta att aggregera/visa i. Matcher räcker som MVP (issuens egen formulering), topplista-reaktioner
kan läggas till senare utan att röra denna modell. Endast LIST-korten får raden (inte hero-kortet): hero:n
är en dubblett av en match som ändå visas i listan, så vi undviker två reaktions-ytor för samma match.

**Beslut (modell): EN reaktion per (rum, användare, match), PK (room_id, user_id, match_id).** En andra
reaktion på samma match BYTER emojin (upsert mot PK:n, RLS UPDATE på egen rad), avmarkera = DELETE. Aggregatet
(antal per emoji) räknas i KLIENTEN ur raderna (härledd state, ingen denormaliserad räknar-kolumn), i en ren
modul `src/features/rooms/reaction-aggregate.ts`.

**KURERAD EMOJI-LISTA (8 st, källhänvisad, gissas inte): `⚽ 🔥 😂 😭 🎉 👏 😱 🧊`.** Betydelser: ⚽ mål,
🔥 het match, 😂 skratt, 😭 besvikelse, 🎉 fira, 👏 bra spelat, 😱 chock, 🧊 iskall. **Källa:** designval
för denna app (inte en extern spec) , täcker fotbolls-känslorna runt en match (jubel/sorg/chock/humor) utan
en oöverskådlig palett (KISS). Listan är CHECK-låst i DB (`room_reactions_emoji_allowed`) OCH speglad 1:1 i
klientens `REACTION_EMOJIS` (`src/data/rooms/reactions-api.ts`), en sanning, två speglar. DB:n är sanningen:
en emoji utanför listan nekas av CHECK:en (bevisat live). `match_id`-formatet återanvänder EXAKT den
källåkrade constrainten från T14 KA-SA2 / room_jokers (`g-[A-L]-[1-6]` eller `M73..M104`), ingen ny tolkning.

**RLS-modell (anon = authenticated i Supabase, RLS är ENDA skyddet, samma som room_comments):** SELECT bara
rumsmedlem (`is_room_member`), INSERT bara medlem OCH `user_id = auth.uid()` (user_id sätts av DB-default,
kan inte förfalskas), UPDATE bara egen rad (byta emoji), DELETE bara egen rad (avmarkera). INGEN deadline-/
sekretess-gren (till skillnad från tips T15 / joker T19).

**Beslut (sekretess): reaktioner är PUBLIKA inom rummet DIREKT, ingen före-avspark-döljning.** **Varför:** en
reaktion avslöjar inget hemligt tips. Att trycka 🔥 på en match säger inget om VAD du tippade (utfall/exakt
poäng) , den uttrycker en känsla om matchen, inte en gissning om resultatet. Därför finns inget att skydda
före avspark, och modellen blir enklare än tips/joker (ingen now()-jämförelse, ingen sekretess-SELECT-gren).
Detta är medvetet: reaktioner ligger i `supabase_realtime`-publikationen och syns live för alla medlemmar.

**RLS BEVISAT LIVE:** (1) under bygget med simulerade sessioner (DO-block, set role authenticated +
request.jwt.claims, isolerat test-rum, städat) , medlem reagerar/byter/avmarkerar, utomstående ser/skriver
INGET, byter/raderar inte andras rad, emoji + match_id utanför reglerna nekas av CHECK. (2) Env-gatat
integrationstest med RIKTIGA anon-sessioner mot produktion (`src/data/rooms/reactions-rls.integration.test.ts`,
kördes grönt live, städar rummet + loggar ut sessionerna i afterAll). En mock kan inte bevisa RLS.

**Realtid (T18-mönstret, signal-inte-data):** `room_reactions` i publikationen. En ny/bytt/raderad reaktion
ger en postgres_changes-SIGNAL till rummets medlemmar (RLS släpper bara raderna till medlemmar). Klienten
läser ALDRIG payloadens rad; tyst re-fetch genom RLS (egen kanal `vm2026-room-reactions`, egen nonce, samma
T55/T61-mönster som kommentarer/tips). Inget flimmer vid en väns reaktion.

**Beslut (tolerant hook):** `useReactionsStore` faller till en INERT store utan provider (samma mönster som
`useRoomsSync`, T14 KA-F3, INTE den kastande `useCommentsStore`). **Varför:** reaktions-raden är en fotrad på
matchkorten i dagens-vyn, och dagens-vyn renderas i många tester och i lokalt läge utan en ReactionsProvider.
Reaktioner är ett additivt socialt lager: utan provider ska korten fungera precis som förr (ingen rad), så en
inert store (enabled=false -> MatchReactions renderar null) är rätt, inte ett kast.

## 2026-06-12 , T19 (#19): gamification (streaks, märken, joker-match)

> **DELVIS ERSATT av T71 (2026-06-13):** joker-match-delen nedan är BORTTAGEN ur appen (JOKER_MULTIPLIER,
> joker-storen/-API:t/-UI:t, dubblingen). DB-tabellen `room_jokers` + `match_joker_day` + triggern
> lämnades orörda men är oanvända. STREAKS + de två MÄRKENA (nedan) STÅR KVAR oförändrade, de var
> alltid joker-oberoende. Se T71-blocket överst.

**Beslut: streaks + märken HÄRLEDS rent ur befintlig data, INGEN ny DB-tabell.** Streak och
de två märkena räknas fram ur exakt samma data topplistan redan har (en medlems match-tips +
det härledda facit + lag-listan), via en ren modul `src/features/leaderboard/derive-badges.ts`,
precis som tabeller/träd/poäng (SPEC §6 "härledd state", anti-bloat). Ett märke är en
OBSERVATION om redan-känd data, så det behöver ingen persistens. Joker KRÄVER däremot en tabell
(delas + poängsätts för alla, se nedan).

**Reglerna (otvetydiga, källhänvisade, gissas inte):**
- **Streak** = antal RAKA avgjorda match-tips (i AVSPARKS-ordning, kickoff) som gav poäng (> 0,
  dvs minst rätt utfall). En miss (0p) bryter sviten. Rapporterar nuvarande (löpande svit) +
  längsta. Källa: `score.ts` (scorePrediction > 0 = rätt utfall/exakt) + issue #19.
- **"Kallade skrällen"** = minst EN exakt-träff (3p, `pointTypeOf === 'exact'`) på en match där
  det laget medlemmen tippade skulle VINNA hade SÄMRE FIFA-ranking (numeriskt HÖGRE rank-tal) än
  motståndaren, OCH det laget vann i ordinarie tid. Ett oavgjort eller en saknad ranking på något
  lag ger ALDRIG märket (fail-safe, ingen underdog-gissning). KÄLLA till rankingen (gissas ALDRIG):
  FIFA/Coca-Cola Men's World Ranking, juniutgåvan 2026 (publicerad 2026-06-11, uppdaterad i T69,
  ersatte aprilutgåvan från T10), committad i `team-profiles-source.txt` (URL:er + hämtdatum),
  exponerad som `Team.fifaRanking` (T10). Lägre tal = bättre lag.
  Vi kräver EXAKT-träff (inte bara rätt utfall) så märket är en bedrift, inte tur.
- **"Perfekt omgång"** = en SVENSK kalenderdag (Europe/Stockholm) där medlemmen tippade MINST 2
  matcher som ALLA är avgjorda OCH ALLA gav poäng (> 0). "Omgång" = en dags matcher (samma tolkning
  som joker-dagen, en sanning). Minst 2 så en ensam rätt-tippad match inte räknas som en hel omgång.
  Källa: `localDateKey` (samma svensk-dag-regel som dagsvyn T7 + DB:ns `match_joker_day`) + score.ts.

**Beslut: JOKER kräver persistens, ny tabell `room_jokers`.** En joker pekar ut EN match vars
MATCH-tips-poäng DUBBLAS (×2, `JOKER_MULTIPLIER`, issue #19 "dubblar poängen") i topplistans
aggregering (scoreMember-vägen, EN sanning, summan==delarna-invarianten består). Eftersom jokern
delas + poängsätts för ALLA medlemmar måste den persisteras (inte härledas). Migrationer
`20260612150000_t19_room_jokers_schema.sql` + `..._t19_room_jokers_rls.sql`, applicerade LIVE.
OBS precision (review-F3): live-versionsstämplarna är MCP-genererade (`20260612123326`/`123346`)
och skiljer från filnamnens, samma kända nyans som T15/T16/T53/T67; SQL-innehållet är verifierat
funktionellt identiskt mot live, en fresh `db reset` replayar samma slutläge under andra stämplar.

**Beslut: EN joker per användare och KALENDERDAG (svensk tid).** "Per omgång" tolkas som per
svensk kalenderdag (den naturliga VM-omgången, en dags matcher). Regeln upprätthålls STRUKTURELLT
av PK på `(room_id, user_id, joker_day)` + en `joker_day`-kolumn som en BEFORE-TRIGGER
(`room_jokers_set_day`) skriver över ur `match_joker_day(match_id)` (matchens avspark i
Europe/Stockholm som date). Klientens värde ignoreras helt (oförfalskbar omgång). En andra joker
samma dag KROCKAR med PK:n (upsert byter jokern inom dagen i stället för att skapa två).
**Varför trigger, inte GENERERAD kolumn:** en generated-kolumn kräver IMMUTABLE-uttryck, men
"slå upp kickoff i en tabell + tidszons-konvertera" är STABLE, så Postgres avvisar det
(`42P17: generation expression is not immutable`). En trigger får anropa en stable funktion.

**Beslut: joker-låset + sekretessen = SAMMA RLS-mönster som tipset (T15).** En joker får bara
sättas/ändras/tas bort FÖRE matchens avspark (deadline-lås, `now() < match_kickoff(match_id)`,
SAMMA helper som predictions-RLS, en sanning), och andras joker-val är dolda före avspark
(sekretess, strategisk info avslöjas när tipset gör). Bevisat SERVER-SIDE med riktiga roller +
manipulerade kickoff-tider (DO-block): TILLÅTEN insert öppen match (server-härledd joker_day),
EN-JOKER-PER-DAG (g-E-2 + g-F-2 båda 2026-06-15 -> andra NEKAD av PK, upsert byter), DEADLINE-LÅS
(joker på låst match NEKAD), FÖRFALSKNING (Bob i Alices namn NEKAD), SEKRETESS (Bob ser 0 av
Alices joker på öppen match), UTOMSTÅENDE (Carol läser 0, skriver NEKAD). Klient-RLS-test
(room-joker-rls.integration.test.ts) täcker de delar som är bevisbara mot live (deadlines i framtiden).

**Beslut: joker dubblar BARA match-poäng, inte grupp-/bracket-poäng.** Jokern pekar ut en MATCH,
så bara den matchens scorePrediction dubblas. `exactHits` (tiebreak) räknas på OBERÄKNAT utfall
(ett antal exakta tips, inte poäng). En joker på en miss ger 0 (0×2=0, ingen straff, ingen vinst).
Streaks/märken är JOKER-OBEROENDE (en skräll är en bedrift oavsett om man satte joker på den).

---

## 2026-06-12 , T45 (#76): admin-statistik (alla rum + medlemmar + vem tippar bäst)

**Beslut:** Två SECURITY DEFINER-RPC:er (`admin_room_stats()` + `admin_revealed_predictions()`),
BÅDA gatade på `is_app_admin()` i första raden (en icke-admin får TOM mängd, ingen rad). Migration
`20260612140000_t45_admin_stats_rpcs.sql`, applicerad LIVE och committad 1:1 (samma version + namn +
innehåll = fresh-replaybar, repo == live-historik). Daniels feedback 2026-06-11: arrangören ska se
HELA ligan.
**Varför RPC (inte admin-SELECT-policies på tabellerna):** minst yta + sekretess-vänligt. En admin-
SELECT-policy hade öppnat hela rader (rådata-tips) över alla rum; en aggregat-RPC returnerar bara det
som är säkert att visa. Det är samma roll-gatade-läsning-anda som T42:s facit-skydd, men för LÄSNING
över rumsgränser (en vanlig medlem ser bara egna rum, T14/T15/T16).

**Beslut (SEKRETESS-HARD): RPC:erna läcker ALDRIG ett framtida (hemligt) tips.**
- `admin_room_stats` returnerar bara AGGREGAT: per rum namn/kod/skapad + medlemsantal + ENGAGEMANGS-
  räknare (antal match-/grupp-/bracket-tips) + medlemmarnas visningsnamn. Ett ANTAL läcker inget om VAD
  någon tippat, bara hur aktiv hen är.
- `admin_revealed_predictions` returnerar rådata-tips över alla rum men BARA de vars deadline REDAN
  passerat (`now() >= deadline`). Det är EXAKT samma gräns som tips-sekretessens RLS SELECT
  (`*_select_own_or_after_kickoff`), och vi återanvänder SAMMA deadline-helpers (`match_kickoff` /
  `group_deadline_kickoff` / `bracket_deadline_kickoff`) som RLS, så "avslöjad" är EN sanning som inte
  kan drifta. Ett avslöjat tips är per definition inte längre hemligt (alla rumsmedlemmar ser det redan).

**Beslut: "vem tippar bäst" RÄKNAS INTE i SQL.** Det vore att duplicera den källhänvisade poäng-/facit-
motorn (FIFA-tiebreak, bracket-härledning, score-reglerna). I stället matar `admin_revealed_predictions`
de AVSLÖJADE tipsen till den befintliga, testade TS-motorn (`buildLeaderboard` mot det PUBLIKA globala
facit, samma `derivePoolFacit` som rummens egen topplista T17). Servern levererar den säkra delmängden;
klienten poängsätter med en sanning. Källa till poäng-/facit-modellen: docs/decisions.md T15/T16/T17.

**GATE + SEKRETESS BEVISAT (T42/T53-playbook), LIVE (kmzhyblzxangpxydufve):** server-side DO-block med
riktiga roller (`set role authenticated` + `request.jwt.claims`), read-only, ingen proof-data:
(1) en icke-admin-sub (inte i app_admins) -> BÅDA RPC:erna 0 rader; (2) admin-sub (i app_admins) ->
`admin_room_stats` > 0 rader; (3) läckage-koll: av 545 match-tips totalt avslöjas BARA 19 (now() >=
kickoff), 526 framtida/hemliga BORTFILTRERADE; grupp/bracket 0 avslöjade (deadlines ej passerade) =
deras hemliga tips lämnar aldrig DB:n. Plus env-gatat integrationstest med RIKTIGA anon-sessioner
(`src/data/admin/admin-stats-rls.integration.test.ts`, kört grönt live): en icke-admin får tomt ur
båda. Den fulla admin-vägen kan inte bevisas via klienten i prod (vi gör inte en främling till admin).

**UI:** `AdminStats` renderas inifrån `AdminResultEntry` (bakom `official.isAdmin`, AdminSection-gaten),
så vanliga medlemmar ser den aldrig (dubbel gating: UI + server-RPC). Funktionell + tillgänglig bas
(semantiska tabeller, data-*-hakar); premium-design polerar design-frontend efter.

## 2026-06-12 , T45-visuellt (#76): arrangörens kontrollpanel, premium-finish (design-frontend)

**Beslut (identitet):** admin-statistiken är Daniels EGNA kontrollpanel (enda yta bara arrangören ser).
Funktion före fluff, men den ska höra hemma i appens premium-familj, inte vara en grå admin-tabell. Tre
lager (tokens.css §23): (A) ÖVERSIKTS-KORTEN (Rum/Tippare totalt) som stat-kort med grön arena-glow +
talet som en SOLID guld-bricka (`.vm-admin-stat-value`); (B) GLOBAL TOPPLISTA med samma PODIUM-estetik som
rummens topplista T17, topp-3 bär pallplats-MEDALJER (`.vm-pool-medal` gold/silver/bronze, DRY mot T16/T17,
ingen ny medalj) och ledar-raden ärver topplistans guld-glow (`.vm-board-row[data-leader]`-receptet);
(C) RUM-KORTEN som lugna kort med guld-hörn-glow (kupong-värmen, samma som `.vm-reveal-card`), en kod-CHIP
+ engagemangs-PILLAR (skan-bara surface-raised-pillar i stället för en löptext-rad) + en mini-topplista.

**Beslut (KISS, lång lista):** både den globala topplistan och rum-kortens mini-listor kan bli långa (alla
rum × alla medlemmar). I stället för en expanderbar mekanik valde jag max-höjd + intern scroll
(`.vm-admin-scroll` 22rem global / `.vm-admin-scroll--room` 14rem), `overscroll-behavior: contain` så en
uttömd inre scroll inte läcker till sidan. Listan är sorterad (bäst först) så det viktigaste alltid syns
utan att scrolla, ingen expander-knapp behövs.

**DRY (återbruk, ingen ny vokabulär):** medaljerna (`.vm-pool-medal`), ledar-glow:en, den neutrala rank-
pillen (`.vm-board-rank`) och den färg-oberoende solid-bricka-formen (`--vm-coupon-ink` på `--vm-gold`,
samma som `.vm-tips-summary-total`/`.vm-coupon-mine`/`.vm-reveal-actual`) är ALLA befintliga recept ur
T15/T16/T17/T58, inte nyuppfunna. Bara de tre admin-specifika ytorna (stat-kort, rum-kort, scroll-container)
är nya klasser.

**FIX (lessons mellanslag-komma-mellanslag):** den funktionella basen hade engagemanget som en löptext med
` , ` (mellanslag-komma-mellanslag) i renderad text, exakt det husstils-komma som lessons-filen flaggat som
ett stavfel i user-facing prosa. Premium-finishen ersätter den raden med skan-bara pillar (varje pill bär
"12 medlemmar"/"64 matchtips"/... med ett RIKTIGT mellanslag mellan tal och etikett), så ` , ` är borta.

**LESSONS-VAKT (T66 module-level-eager):** `MEDAL_CLASS` ligger på modul-nivå men är en PLAIN literal
(inga importerade värden), så `AdminStats`-modulen kan importeras (via en barrel) utan att binda någon
mockad symbol. Inget importerat värde lyfts till modul-nivå (jämför T66:s `Math.floor(COMMENT_MAX_LEN*0.9)`
som knäckte barrel-mockar). Engagemangs-pillens "10 matchtips" hålls som ETT sammanhängande tecken-spann
(`{value}{' '}{label}`) så admin-vyns test `toContain('10 matchtips')` fortsatt håller; alla 11 data-*-hakar
oförändrade.

**AA (scripts/contrast-t45.mjs, canvas-komposit VÄRSTA fall = text rakt på glow-toppen, BÅDA teman):** all
läsbar text står på opak surface/surface-raised eller en LÅG-alfa tint mätt som komposit. Stat-tal +
medalj-siffror är mörk ink på SOLID token-yta (guld 10.90/5.03, silver 10.99/8.40, brons 6.60/4.87,
ALDRIG ljus token-text på tint); stat-kort-etikett (fg-muted på grön-10%-glow) 6.12/5.69; ledar-rad fg på
guld-7%-glow 13.29/16.58, ledar-poäng (warning guld-TEXT, ALDRIG rå `--vm-gold`) 8.80/5.48; rum-namn fg på
guld-6%-glow 13.50/16.75; pillar/kod-chip fg-muted/fg på surface-raised 6.23/12.66. MIN över ALLA nya text-
ytor: mörkt 6.12:1 / ljust 4.87:1, alla >= 4.5 (normal text). Glow-/kant-/topplist-lagren bär ALDRIG text.

**Responsivitet + rörelse:** mobil-först. Stat-korten `grid-cols-2` (två i bredd även smalt, korta tal),
rum-korten `grid-cols-1 lg:grid-cols-2`, globala topplistan staplar rum under namnet `< sm` (egen rum-kolumn
först från `sm`) så tabellen håller sig smal på foldable cover/mobil, namn truncar (`min-w-0 truncate`).
REDUCED-MOTION: inga layout-/transform-animationer, bara en lugn FÄRG-hover på rum-kortet (prefers-reduced-
motion skyddar transform/position, inte färg), så ingen reduced-motion-grind bryts.

## 2026-06-12 , T66 (#121): kommentarer i rummet (medlemmar snackar match live)

**Beslut:** Ny tabell `public.room_comments` (id, room_id, user_id, body, created_at) för korta
meddelanden per rum. Migration `20260612103836_t66_room_comments_schema_rls_realtime.sql`, applicerad
LIVE och committad 1:1 (samma version + namn + innehåll = fresh-replaybar, repo == live-historik).
**Varför:** Daniel lovade klassen i lanseringstexten ("snart kommer en kommentar-funktion"). Snacket
runt matcherna är halva nöjet. Enkel, ärlig MVP: ingen trådning, ingen redigering, inga reaktioner
(#24 är separat).

**Beslut (designval): visningsnamnet DENORMALISERAS INTE.** `room_comments` bär bara `user_id`; klienten
slår upp namnet i medlemslistan (`room_members.display_name`) som RoomsProvider redan har.
**Varför:** EN sanning för namnet (room_members), inget driv-isär om en vän byter visningsnamn, och
mindre yta att skriva/validera (KISS). Avvägning: en kommentar från en vän som SEDAN lämnat rummet
saknar namn i listan -> klienten faller till "Tidigare medlem" (ofarligt, ingen krasch). Alternativet
(spara display_name på raden) hade gett "namnet som det var då" men dubblerat en muterbar sanning och
krävt en andra längd-validering; vi valde enkelheten.

**RLS-modell (anon = authenticated i Supabase, RLS är ENDA skyddet, samma som room_match_results):**
SELECT bara rumsmedlem (`is_room_member(room_id)`), INSERT bara medlem OCH `user_id = auth.uid()`
(ingen förfalskning; user_id sätts av DB-default `auth.uid()`), DELETE bara egen rad
(`user_id = auth.uid()`), INGEN UPDATE i v1 (kommentarer redigeras inte = minsta yta). Längd 1-500
tecken via `room_comments_body_len` CHECK (klienten har samma gräns, men DB:n är sanningen).

**RLS BEVISAT (T53-playbook):** (1) under bygget med simulerade sessioner (set role authenticated +
request.jwt.claims, isolerat test-rum, städat) , medlem läser/skriver, utomstående ser/skriver INGET,
bara egen rad raderas, tom + 501 tecken nekas. (2) Env-gatat integrationstest med RIKTIGA anon-sessioner
mot produktion (`src/data/rooms/comments-rls.integration.test.ts`, kördes grönt live, städar rummet i
afterAll). En mock kan inte bevisa RLS, regeln lever i databasen.

**Realtid (T18-mönstret, signal-inte-data):** `room_comments` ligger i `supabase_realtime`-publikationen.
En ny/raderad kommentar ger en postgres_changes-SIGNAL till rummets MEDLEMMAR (RLS släpper bara raderna
till medlemmar). Klienten läser ALDRIG payloadens rad; den kör en TYST re-fetch genom RLS (egen kanal
`vm2026-room-comments`, egen nonce i load-effektens deps, samma T55/T61-mönster som tips-vyerna). Inget
flimrande "Laddar..." vid en väns kommentar, datan behålls under den tysta omhämtningen.

**Säker rendering (HARD):** kommentar-texten renderas som ren React-text-nod (default-escaping), ALDRIG
`dangerouslySetInnerHTML`. En `<script>`-sträng visas bokstavligt, ingen HTML/JS injiceras (test:
escape-rendering med taggig sträng).

## 2026-06-12 , T67 (#123): flytta den FÖRLÄNGDA deadlinen från 14 juni till SÖNDAG 21 juni

**Daniels beslut 2026-06-12 (källa, gissas inte):** "vald datum nu är för nära och kommer stressa
alla som vill hoppa på i helgen. ta det till söndagen veckan efter." Den fasta förlängda deadlinen
för GRUPPVINNAR-tips + CHAMPION-tips (införd i T53, #95) flyttas alltså från 14/6 till SÖNDAG 21/6, så
vänner hinner haka på under helgen utan stress. Issue #123. T53:s MODELL är oförändrad , bara
tidskonstanten byts; match-tips + bracket-SLOT-tips (M73..M104) behåller sina EGNA avsparks-lås (rörs INTE).

**FAST TIDPUNKT:** 2026-06-21 23:59 svensk tid = `2026-06-21T21:59:00Z`. Sverige är på sommartid
(CEST, UTC+2) i juni, så 23:59 lokal = 21:59 UTC. 21 juni 2026 är en söndag (verifierat).

**KONSEKVENS av den nya tiden (FÖRLÄNG, FÖRKORTA ALDRIG / GREATEST, källverifierat live mot
`match_kickoffs` 2026-06-12):** ALLA 12 gruppers FÖRSTA match (g-A-1..g-L-1) ligger 11-17 juni, alltså
FÖRE 21/6. Med T53:s 14/6-tid behöll de sena grupperna G..L sitt SENARE ankare (15-17/6); med 21/6
ligger även G..L:s ankare före deadlinen, så GREATEST ger nu ALLA 12 grupper + champion samma 21/6-tid.
Ingen grupp förkortas , GREATEST kan aldrig dra ett ankare bakåt. Garantin bor i REGELN, inte i datat:
en hypotetisk grupp med första match efter 21/6 hade fortfarande behållit sitt senare ankare (vaktat
med ett syntetiskt sent ankare i selektor-testerna, så en framtida schema-ändring inte tyst bryter den).

**EN SANNING, klient + DB:** DB: ny migration `20260612080000_t67_extended_deadline_to_21_june.sql`
ändrar `pool_extended_deadline()` till den nya instanten (group_deadline_kickoff + champion-grenen av
bracket_deadline_kickoff CREATE OR REPLACE:as ändå identiskt, så migrationen är en komplett fresh-
replaybar ögonblicksbild, inte ett implicit beroende på T53:s ordning). Klient:
`src/data/predictions/prediction-deadline.ts` (`POOL_EXTENDED_DEADLINE_ISO`). Text/lås härleds ur SAMMA
ISO (formatDeadline/DeadlineNotice), ingen dubblerad tid.

**Verifierat live mot produktion (kmzhyblzxangpxydufve) med read-only-frågor:** pool_extended_deadline
= alla 12 gruppers deadline = champion = `2026-06-21 21:59:00+00`; sena grupper G-L (ankare 15-17/6 <
21/6) ger via GREATEST 21/6; slot M73 OPÅVERKAD (`2026-06-28 19:00:00+00`); match-tips-kickoffs orörda;
ett hypotetiskt ankare 25/6 behåller 25/6 (förkorta aldrig). FAIL-SAFE bevarad (explicit null-gren).
Migrationen i `list_migrations` heter `t67_extended_deadline_to_21_june` (live-version `20260612101851`,
MCP-genererad stämpel skiljer från filnamnets `20260612080000`, samma nyans som T15/T16/T53, namn + SQL 1:1).
OBS precision (review-F1): "1:1" avser den EXEKVERBARA SQL:en; live-funktionens inline-kommentar
applicerades på engelska (MCP-artefakt) medan committad fil bär svensk kommentar per konvention, nästa
`db reset` återställer den svenska. Noll beteendepåverkan.

**Källa:** Daniels task-direktiv T67 (#123) + live-verifierat spelschema (`match_kickoffs`) + T53-modellen.

---

## 2026-06-12 , T65 (#119): "Föreslå ur mina matchtips"-knapp i grupp-tippningen (per grupp, förifyller, aldrig auto-spar)

Daniels önskan: en knapp i grupp-tippningen som FÖRIFYLLER gruppens 1:a + 2:a ur de tippade
matchresultaten, så man slipper räkna ut tabellen i huvudet. Användaren trycker själv Spara.

**Beslut 1 (KNAPP PER GRUPP, inte global "föreslå alla").** Knappen ligger i varje grupps kupong
(GroupPredictionForm), där 1:a/2:a väljs, så förslaget hamnar där handlingen sker. En global
"föreslå alla"-knapp hade förifyllt 12 formulär på en gång (svårare att överblicka vad som ändras,
och en grupp kan vara komplett tippad medan en annan inte är det). AC#4 sa "välj per grupp om inget
talar emot", och inget gör det. KISS + tydlighet.

**Beslut 2 (PER-GRUPP-GRÄNS, MEDVETET annorlunda än T64:s ALLA-12-krav).** Knappen är aktiv så snart
DEN gruppens alla matcher är tippade, oavsett om andra grupper är klara. Det SKILJER sig från T64
(de 8 bästa treorna), som kräver att ALLA 12 grupper är helt tippade. Varför skillnaden är korrekt,
inte en inkonsekvens: en grupps 1:a + 2:a beror BARA på den gruppens egna matcher (ren grupptabell),
medan de 8 bästa treorna kräver en kollisionsfri Annexe C-rad RANKAD ÖVER alla 12 gruppers treor, så
en enda otippad grupp gör hela trea-mängden ogiltig. Samma allt-eller-inget-anda (gissa aldrig ur en
ofullständig tabell), men den rätta enheten är per grupp här, per turnering där. Ofullständigt tippad
grupp -> knappen inaktiverad med ärlig text ("tippa gruppens alla matcher först"), aldrig en gissning.
Antalet gruppmatcher per grupp HÄRLEDS ur matchplanen (inte hårdkodat 6), så gränsen följer datan.

**Beslut 3 (EN SANNING: återanvänder deriveGroupTables, ingen parallell tabellräkning).**
deriveTippedGroupSuggestion bygger syntetiska färdigspelade gruppmatcher ur tipsen via SAMMA
tippedGroupMatch-adapter som T64 (nu exporterad, delad) -> deriveGroupTables -> computeStandings
(FIFA Article 13:s tiebreak) och plockar rank 1 + rank 2. Ingen egen sortering/rank-regel.

**Beslut 4 (ALDRIG AUTO-SPAR, HARD).** Knappen sätter BARA formulär-state (winner/runnerUp) och
markerar formuläret "dirty"; den anropar aldrig onSubmit. Spara är användarens egen handling, precis
som idag. Ett befintligt sparat tips är orört tills användaren själv sparar. Låst grupp (deadline
passerad) -> ingen knapp (formuläret är ändå låst).

**Identitets-rymd vid seamen (T16/F1-fällan):** standings bär Team.id (gemen "swe"), men formuläret
väljer/lagrar Team.CODE (versal "SWE", DB-constraint ^[A-Z]{3}$). Förslaget översätter id -> code vid
seamen (spegelbilden av deriveTipsBracket:s code -> id), så det landar i formulärets rymd. Ett test
matar de två verkliga källorna (deriveGroupTables-tabellen vs förslaget) mot varandra, så en
mappnings-drift failar rött i stället för att tyst välja fel lag.

## 2026-06-12 , T64 (#118): de 8 bästa treorna i simuleringsträdet seedas ur MATCH-tipsen (annars öppna)

Daniels feedback: "gällande slutspelsträdet i simuleringsläge, utifrån sina tippade resultat i
gruppspelet borde man få fram de 8 bästa 3orna. Då kan man tippa hela vägen, nu behöver man vänta."
T51:s "Slutspelet ur dina tips" lämnade treplats-slotsen ÖPPNA (grupp-tipsen bär bara 1:a/2:a). T64
fyller dem ur användarens TIPPADE MATCHRESULTAT.

**Beslut 1 (KÄLLLÅST FIFA-REGEL, gissas ALDRIG): treorna härleds via exakt samma motorkedja som
facit-trädet, bara med tippade resultat som indata.** Kedjan: bygg syntetiska färdigspelade
gruppmatcher ur match-tipsen -> `deriveGroupTables` (`computeStandings`, FIFA Article 13:s tiebreak)
-> `preliminaryThirdSeeding` (T56), som i sin tur anropar `rankThirdPlaces` (FIFA Article 13, "the
eight best-ranked teams among those finishing third") + `seedThirdPlaces` (FIFA Annexe C, 495
källlåsta kombinationer). INGEN parallell tabellräkning, rankning eller Annexe C (PRINCIPLES §4).
Enda skillnaden mot den skarpa vägen är INDATA (tips i stället för facit), inte HUR.
**Källa:** Regulations for the FIFA World Cup 26 (May 2026), Article 13 (sid. 26-28) + Annexe C (sid.
80-97), committat i `fifa-knockout-rules-source.txt` / `third-place-table.ts`. Ny modul:
`src/features/simulation/derive-tips-thirds.ts`. Resultatet matas till `deriveTipsBracket` (3:e
argumentet) som placerar varje seedad trea i sin Annexe C-slot (ny resolution `'tipped-third'`).

**Beslut 2 (LÅST käll-prioritet): grupp-tipsen äger 1:a/2:a-slotsen, match-tipsen ENBART
treplats-slotsen.** När grupp-tips och matchtips-härledd tabell pekar olika om en grupps 1:a/2:a
vinner GRUPP-tipsen den sloten (oförändrat T51-beteende). Match-tips-härledningen rör ALDRIG
1:a/2:a-slotsen, bara de 8 bästa-trea-slotsen. Varför: 1:a/2:a är ett uttryckligt, direkt grupp-tips
(det Daniel valde i kupongen); treorna går inte att uttrycka i grupp-tipset alls och MÅSTE därför
härledas ur en annan källa (match-tipsen). Att låta match-tipsen även skriva om 1:a/2:a vore att
överrösta ett direkt val med ett härlett, mindre ärligt.

**Beslut 3 (ÄRLIG GRÄNS, gissa ALDRIG, ALLT-eller-INGET): treorna seedas BARA när VARJE grupp har
ALLA sina gruppmatcher tippade.** `preliminaryThirdSeeding`:s egen gräns ("alla 12 grupper har en
rank-3-rad") räcker INTE här: `computeStandings` ger en rank-3-rad även för en grupp där INGA matcher
tippats (stabil alfabetisk teamId-fallback, probe-bevisat: 0 tippade matcher -> ändå rank-3-rad).
Skulle vi seeda på enbart "en rank-3-rad per grupp" placerade vi treor ur otippade, alfabetiskt
rangordnade grupper, en gissning presenterad som facit (precis det #88 förbjuder). Annexe
C-seedningen behöver dessutom hela 8-bästa-mängden (en kollisionsfri tabell-rad), så delvis tippat
kan inte ärligt ge NÅGON av de 8 treorna. Därför: alla 12 grupper helt tippade -> alla 8 treor
seedade; någon gruppmatch otippad -> ALLA treplats-slots öppna (`'open-third'`, precis som T51).
Antalet gruppmatcher per grupp HÄRLEDS ur matchplanen (inte hårdkodat 6), så gränsen följer datan.

**Beslut 4 (wiring): PredictionsProvider hoistad i App.** Den simulerade slutspels-vyn (under
grupp-tips-kupongerna) läser nu MINA match-tips (`usePredictionsStore`) utöver mina grupp-tips. För
att nå match-tips-storen utan en andra hämtning hoistades `PredictionsProvider` från
`PredictionSection` upp till App, där den omsluter BÅDE match-tips-sektionen och grupp-tips-sektionen
(samma mönster som `LeaderboardProvider`, T58). `PredictionSection` konsumerar nu storen i stället
för att skapa den. Utan aktivt rum/match-tips är seedningen tom -> öppna treor (oförändrat fixtures-
läge). Märkning kvar: vyn är fortsatt TYDLIGT en SIMULERING (facit orört), en tips-seedad trea bär en
lågmäld "3:a"-markör så den skiljs från en grupp-tippad 1:a/2:a.

**OBS slutspels-slot-tipsen (T16b, bracket-predictions):** AC "slot-tipsen blir tippbara hela vägen
när trädet är fyllt" gäller en ANNAN yta. Den ytan (`selectPredictableBracket` /
`useBracketPredictableData`) härleder sina slots ur det RIKTIGA trädet (`deriveBracket` på facit) och
gatar tippbarhet på `resolution === 'resolved'` (gruppspel FÄRDIGSPELAT), inte på tips-trädet. Att
göra slot-tipsen tippbara ur en SIMULERAD bild kräver server-sidan (RLS validerar/poängsätter mot
RIKTIGA resultat, deadline = slottens egen avspark), så det är ett eget, större beslut utanför denna
task. Levererat här: hela sextondelsbilden UR TIPSEN i simuleringsvyn (ettor/tvåor + de 8 bästa
treorna). Se T64 HANDOFF Findings.

---

## 2026-06-12 , T18 (#18): Supabase Realtime , prenumeration som SIGNAL -> befintlig tyst re-fetch (ingen rad-merge), sekretess via begränsad publikation + RLS-refetch

**Mål (issue #18):** appen ska leva utan reload, ett inmatat officiellt resultat ska synas direkt
hos ALLA anslutna klienter (live-tracker, tabeller, slutspelsträd, topplista, avslöjande), och rum-
data (medlemmar/delade resultat) ska uppdateras live.

**Beslut 1 (ARKITEKTUR, KISS + härledd state): Realtime-händelsen är bara en SIGNAL, inte data.**
Vi merge:ar ALDRIG postgres_changes-payloadens rad i klienten. En händelse på en tabell kör i
stället SAMMA tysta re-fetch-väg som fokus/online-lyssnaren redan har (`OfficialResultsProvider
.refresh()` / `RoomsProvider.loadRoomData()` + `tipsRefreshNonce`-bump). Re-fetchen går genom RLS
som vanligt, så facit/medlemmar/resultat alltid blir korrekt filtrerade. Varför: appen är redan
härledd state (official_match_results driver tracker + topplista via `useOfficialResultsSync` /
`useLeaderboardData`; tips-vyerna läser `tipsRefreshNonce`), så att återanvända refetch-vägen är
mindre kod, en sanning, och kan inte drifta från den fetch som testas. Rad-merge i klienten vore en
NY dataväg att hålla i synk + en sekretess-risk (se nedan).

**Beslut 2 (SEKRETESS-HARD): vi prenumererar BARA på `official_match_results`, `room_match_results`
och `room_members`, ALDRIG på predictions-tabellerna.** Migrationen
`20260612072518_t18_realtime_publication.sql` lägger de tre i `supabase_realtime`-publikationen
(read-only-verifierat: publikationen var TOM före, och innehåller exakt dessa tre efter, INTE
predictions/group_predictions/bracket_predictions). Andras tips är hemliga FÖRE avspark (RLS:
eget tips alltid, andras bara `now() >= kickoff`). Även om postgres_changes respekterar RLS väljer
vi försvar-på-djupet: ingen tips-tabell broadcastas alls, så det finns NOLL yta för en pre-avspark-
tips att läcka via realtidskanalen. Tips-färskhet drivs i stället av resultat-/medlemshändelserna
som bumpar `tipsRefreshNonce` -> tips-vyer/topplista hämtar om sina RLS-synliga rader (avslöjade
tips kommer in, dolda förblir dolda). Den re-fetchen går genom RLS, server-side sanningen.

**Källa (platforms-fakta, verifierad, inte gissad):** Supabase "Realtime Authorization", avsnitt
"Interaction with Postgres Changes": *"When using Postgres Changes on tables with RLS, database
records are sent only to clients who are allowed to read them based on your RLS policies."*
(https://supabase.com/docs/guides/realtime/authorization, web-verifierat 2026-06-12). Enable-syntax
`alter publication supabase_realtime add table ...` + React-cleanup `supabase.removeChannel(channel)`
ur Supabase "Postgres Changes" + "Getting Started with Realtime" (samma datum). OBS: dokumenten
specar INTE reconnect/backoff eller status-enumen utöver `'SUBSCRIBED'`, så vi förlitar oss på
supabase-js interna WebSocket-reconnect + behåller skyddsnäten (se Beslut 3) i stället för att
bygga en egen reconnect-loop.

**Beslut 3 (skyddsnät BEHÅLLS): fokus/online-refetch + minut-ticken tas INTE bort.** Realtime är
ett TILLÄGG (snabbare push), inte en ersättning. Faller kanalen (tappad anslutning, kanal-fel)
loggar vi fail-loud i konsolen men appen lever vidare: nästa fokus/online-event och leaderboardens
minut-tick (`lockedMatchCount`) hämtar ändå färsk data. supabase-js återansluter WebSocket internt.

**Beslut 4 (REPLICA IDENTITY default, inte `full`):** vi läser aldrig `old`-raden (vi refetchar),
så vi behöver inte previous-values i UPDATE/DELETE-payloads. KISS/YAGNI.

**Återanvändning (ingen dubblett):** all kanal-logik bor i EN modul `src/data/realtime/`
(`subscribeToTableChanges` + `useRealtimeSubscription`-hook), så facit-lagret OCH rums-lagret delar
samma setup; providers rör aldrig Supabase-kanal-API:t direkt. Prenumerationen ligger co-located med
varje providers egen refresh (lägsta koppling, speglar de befintliga fokus/online-lyssnarna):
OfficialResultsProvider -> `official_match_results` (statisk, globalt facit); RoomsProvider ->
`room_match_results` + `room_members` filtrerat på aktivt rum (`subscriptionKey = rum-id`, rum-byte
river + öppnar ny kanal, cleanup vid unmount/rum-byte).

## 2026-06-12 , T63 (#113): ytan överst blir en KOMPAKT install-knapp (ersätter info-bannern), tre klick-grenar

**Symptom/önskan (Daniels issue #113 + två förtydliganden 2026-06-12):** "info överst som ser ut som en
knapp med info installerad app" ska gå att KLICKA och "autonomt lösa installationen". Förtydligande 1:
install-INFON ska BARA visas NÄR man klickar, inte ligga framme och ta fokus, ytan överst = en KOMPAKT,
diskret knapp (ingen informationsruta). Förtydligande 2: i app-läge (standalone) ska INGEN install-yta
synas alls ("onödigt surr där då den redan är installerad"); kom-igång-raden i inställningarna får finnas
kvar (gömd hjälp-yta).

**Beslut (ERSÄTT InstallBannern med en kompakt knapp, INTE samexistens):** Den gamla `InstallBanner`
(T13/T39) ÄR just informationsrutan Daniel inte vill ha framme (rubrik + brödtext + Play Protect-not +
"Inte nu"). Daniels förtydligande "ingen informationsruta, install-INFON bara vid klick" går inte att
förena med att låta bannern ligga kvar. Därför tas `InstallBanner.tsx` (+ test) bort från huvudytan och
ERSÄTTS av en ny `InstallButton`: en diskret, surface-tonad "Installera som app"-pill. Den utförliga
guiden (samma som inställnings-portalens "Kom igång") når man bakom ETT klick. `InstallBanner`-komponenten
raderades (den renderades ingenstans efter bytet, dead UI). Kvar i `install-prompt.ts`: detektorerna
(`detectStandalone`/`detectIos`/`detectAndroid`) + `ANDROID_PLAY_PROTECT_NOTE` (de ÅTERANVÄNDS faktiskt
av guiden T54) + `resolveInstallButtonAction`/`buttonAction`-vägen (knappen). `resolveInstallMode`/
`InstallUiMode`/`dismiss`/`dismissed`/`INSTALL_DISMISSED_KEY`-maskineriet saknade produktions-konsument
efter T63 (review-F2 flaggade att det var dött, inte "återanvänds av guiden") och **togs bort i T70 (#136,
lean-städ)** tillsammans med sina tester, så install-ytan inte längre bär en otestad-reserv-skuld. (Den
ursprungliga "behålls som testad reserv"-motiveringen blev alltså inte långlivad: koden var dött, och en
dött-men-testat kod-block är fortfarande dött kod, T70 städade det.)

**Regeln (tre klick-grenar, ren funktion `resolveInstallButtonAction`, `install-prompt.ts`):** härledd ur
de REDAN källhänvisade T39/T54-detektorerna (gissas inte), bara en UI-vägsregel ovanpå:
- `native-prompt`: ett `beforeinstallprompt`-event finns (Chrome/Android/desktop) -> ETT klick öppnar
  webbläsarens äkta prompt direkt (T39:s `consumeDeferredPrompt`). Källa för engångs-prompt-mekaniken:
  MDN "beforeinstallprompt" + web.dev "Customize the install experience" (källhänvisat i T39, oförändrat).
- `guide-ios`: iOS saknar programmatiskt install-API (Apple exponerar inget, källhänvisat T39/T54) ->
  öppna kom-igång-guiden (T54) PÅ iPhone-fliken (`initialPlatform='ios'`), steg för steg, ingen falsk
  autonomi.
- `guide`: icke-iOS UTAN event (kriterier ej uppfyllda / prompt nyligen avvisad) -> öppna guiden ändå.
  ALDRIG en död knapp (#113-AC): finns ingen native-väg just nu visar vi vägen i stället för ingenting.
- `hidden`: BARA i standalone -> rendera ingenting (Daniels skarpa krav, inget surr i app-läge).

**Subtilitet (medveten skillnad mot den gamla, nu borttagna banner-regeln):** `resolveInstallButtonAction`
har aldrig läst något avfärdande-tillstånd. Den gamla bannern (`resolveInstallMode`, borttagen i T70) hade
"Inte nu" och respekterade ett permanent avfärdande; den kompakta knappen har ingen sådan affordans, den
är en alltid-nåbar CTA. En avvisad native-prompt faller till `guide`, knappen försvinner inte. (Annars vore
knappen en "död yta" efter ett oavsiktligt avvisande, tvärtemot #113-AC.) Standalone är den enda
gömnings-grenen.

**Återanvändning (ingen dubblett):** native-vägen = `useInstallPrompt`/`install-prompt-capture` (T39);
guide-vägen = `GetStartedControl`/`GetStartedDialog` (T54) via en ny `'install'`-variant + en ny valfri
`initialPlatform`-prop (icke-brytande, default = browser-härledd flik som förr), så HELA dialog-a11y:n
(fokus-fälla, Escape-capture, fokus-återställning, portal) ärvs orörd. `InstallButton` väljer bara väg.

**Gating oförändrad (T39/#68 F1):** knappen är fortsatt gömd medan onboarding-touren är öppen (touren är
en z-50 overlay över ytan vid första besöket), faller tillbaka på sin vanliga logik efteråt.

## 2026-06-12 , T62 (#111): tips-/resultatfönstret utökas BAKÅT med igår (nyss spelade matcher syns)

**Symptom (Daniels rapport 2026-06-12):** "jag ser fortfarande inte aktuell tips-resultat på varje
matchtips-kort." T58:s per-match-poäng är live men visas bara på AVGJORDA matcher. De enda avgjorda
matcherna är gårdagens (och tidigare), och tips-listans 3-dagars fönster (#39/T39) var rent
FRAMÅTBLICKANDE (ankrat på idag + 2 fram), så gårdagens matcher gled ut ur default-vyn. Användaren
mötte aldrig sina poäng utan att trycka "Visa alla".

**Beslut (regeln, källa = issuens AC + Daniels förslag):** den DELADE rena fönster-funktionen
`windowMatches` (`features/results/result-window.ts`) utökas BAKÅT med ett FAST spann
`LOOKBACK_DAYS = 1` (igår). Fönstret blir alltså `igår + idag + (WINDOW_DAYS-1) fram` = fyra svenska
kalenderdagar. Ankaret (fönstrets första dag) golvas på premiären när turneringen ej börjat (inget
tomt bakåt-spann före första matchen). Ingen ny funktion, ingen dubblett: bakåt-delen lades i samma
rena `windowMatches`, så BÅDA konsumenterna (tips-vyn + resultatvyn) ärver den.

**Varför ett FAST spann (igår) och INTE "senaste spel-dag oavsett hur långt bort":** issuen föreslog
båda. "Senaste spel-dag" är robust mot en vilodags-gårdag, men kräver att man avgör hur långt bort en
match får ligga och ändå räknas som "nyss spelad" (annars drar en turnering som slutade för två veckor
sedan in finalen i default). Ett fast spann (igår) är symmetriskt med det framåtblickande fönstret,
drar aldrig in en gammal match, kräver ingen gissning om VM-schemats längsta vilo-lucka, och löser
Daniels FAKTISKA problem exakt: VM:s gruppspel (11-27 juni) spelar matcher VARJE dag, så "igår" ÄR den
senaste spel-dagen i den fas där problemet uppstår nu.

**Medveten avgränsning (dokumenterad + testad):** är gårdagen en VILODAG (kan hända i fas-glappet
gruppspel/slutspel och i slutspelet) tas förrgårs match inte med i default, den nås via "Visa alla".
I de faserna är listan ändå kort så fönstret döljer nästan inget. Ett test
(`result-window.test.ts`, "MEDVETEN avgränsning ...") LÅSER detta beteende så det inte tyst ändras.
Vill man senare ha vilodags-robusthet är vägen att byta `LOOKBACK_DAYS` mot en "senaste spel-dag inom
N dagar"-regel, men det är YAGNI nu.

**Paritet (issuens AC3, rekommendationen i task-dispatchen):** BÅDA fönstren (tips + resultat) fick
bakåt-utökningen, eftersom den bor i den DELADE `windowMatches`. Pariteten BESTÅR alltså, den bryts
inte. Paritetsguarden (`predictions-results-window-parity.test.tsx`, T43) stärktes med ett ANDRA fall
som ankrar mitt i turneringen (16 juni, en match igår) och bevisar att gårdagens match tas med
IDENTISKT i båda vyerna. Resultatvyn är admin-gated i live sedan T48, så att även den visar gårdagens
matcher stör ingen vanlig användare (och är dessutom önskvärt: man vill se nyss inmatade resultat).

**Sortering/gruppering (AC3):** ingen ändring behövdes. Tips-listan renderar `selectPredictableMatches`
(kronologiskt, tidigast först), så gårdagens (låsta, avgjorda) match hamnar ÖVERST med sin låst-etikett
+ poäng-bricka, dagens kommande efter, vilket är kronologiskt korrekt och inte förvirrande (testat).
Resultatvyn grupperar redan per dag-rubrik (`groupMatchesForEntry`, T28), så gårdagen får sin egen
rubrik ovanför dagens. Räknaren "X matcher öppna att tippa" (AC4) räknar bara icke-låsta matcher, så
gårdagens låsta avgjorda exkluderas, oförändrat och testat.

**Verifiering av att fixen vaktas:** negativ kontroll (playbook): med `LOOKBACK_DAYS = 0` (det gamla
beteendet) rödnar T62-render-testerna (gårdagens kort faller ur fönstret), med = 1 är de gröna. Så
testerna bevisar fixen, inte bara att koden kompilerar.

## 2026-06-12 , T61 (#110): kopierade tips syns DIREKT i målrummet (invaliderings-räknare)

**Symptom (Daniels rapport 2026-06-12):** "när man kopierar tips från en grupp till annan så måste man
lämna gruppen och gå in i den igen för att se tipsen. verkar som sidan inte uppdaterar när man är där."

**Rotorsak (bekräftad mot kod):** `copyMyTips` (RoomsProvider, T52) skrev nya tips-rader i målrummet via
`copyMyPredictions` (upsertMy*-API:erna) men returnerade bara en `CopyReport`, den rörde inget React-state
i tips-vyernas providers. De fyra läsande providerna (`PredictionsProvider` match-tips, `GroupPredictions
Provider`, `BracketPredictionsProvider`, `LeaderboardProvider` topplista/avslöjande) hämtar sina rader i en
effekt med deps `[supabase, activeRoomId]` (Leaderboard även `lockedMatchCount`). Eftersom kopieringen sker
IN i det redan-aktiva rummet ändras varken `supabase` eller `activeRoomId`, så ingen re-fetch triggas. Datan
var stale tills man bytte rum (vilket bumpar `activeRoomId` -> ny epok -> re-fetch), exakt det Daniel såg.

**Fix (samma seam-anda som T55:s `lockedMatchCount`):** en monoton invaliderings-räknare `tipsRefreshNonce`
i rooms-storen. `copyMyTips` bumpar den BARA efter en LYCKAD kopiering (`report.total.copied > 0`), och de
fyra providerna har talet i sina fetch-deps. Talet bärs på den befintliga `RoomsSync`-seamen (samma seam som
tips-providers redan läser `activeRoomId` ur, och som results-lagret använder), så ingen NY koppling till
hela rums-storen uppfinns; Leaderboard läser det ur `useRoomsStore` som den redan gör. **Räknare, inte
boolean:** en flagga hade fastnat "på" och tappat en ANDRA kopierings signal mot samma rum, ett monotont
tal ger en ny invalidering varje gång (mutationsbevisat: två copy i rad -> nonce 1 -> 2).

**TYST re-fetch (T55-mönstret, ingen flimmer):** providerna fick samma `loadedRoomIdRef`-vakt som
Leaderboard redan hade (T55): en re-fetch i SAMMA rum (kopierings-invalidering) behåller `ready` + befintlig
data under hämtningen och visar ALDRIG `loading`, bara INITIAL/rumsbyte blankar. En misslyckad tyst re-fetch
behåller datan + `ready` och loggar `console.warn` (`[VM2026]`-konventionen), den blankar aldrig vyn för en
transient miss; en initial/rumsbyte-miss går till `error` som förut (fail loud, PRINCIPLES §8).

**Val vid 0 kopierade:** ingen bump (allt låst/redan-tippat eller källan tom -> ingen rad ändrades i målet
-> ingen re-fetch behövs, sparar ett nätanrop). En FAILad kopiering (`copied 0, failed > 0`) bumpar inte
heller (inget landade att hämta; engine:n sväljer per-item-skrivfel och kastar inte, så detta utfall når
success-grenen, men nonce-villkoret `copied > 0` hindrar en onödig re-fetch). En DELVIS kopiering
(`copied > 0` med några låsta/failade) bumpar, eftersom minst ett tips faktiskt landade i målet.

**INGEN polling, INGEN ny dubbelhämtning i vila** (samma princip som T55/T18-gränsen): talet är stabilt
mellan kopieringar, så effekten kör om PRECIS vid en lyckad copy, inte annars. Bevisat med render-tester per
provider (fetch-anrop: 1 initial + 1 efter copy; flimmer-bevis via TrackingProbe att `loading` aldrig syns)
och mutationsverifierat: tas bumpen bort röd:ar signal-testet i RoomsProvider, tas `tipsRefreshNonce` ur en
providers deps röd:ar dess re-fetch-test OCH ESLint `exhaustive-deps` fångar den oanvända variabeln.

**Copilot R1 (#110, F1) , save-vakten separerad från fetch-vakten:** den första versionen lät de tre
tips-providernas (`PredictionsProvider`, `GroupPredictionsProvider`, `BracketPredictionsProvider`)
`loadTokenRef` dubbel-tjäna som BÅDE fetch-cancellation OCH stale-save-vakt. När `tipsRefreshNonce` kom in
i load-effektens deps bumpas token nu även vid en kopierings-invalidering i SAMMA rum, så ett PÅGÅENDE save
kunde felaktigt klassas som föråldrat och droppas (den optimistiska speglingen uteblev). Fix: save-vakten
jämför nu mot RUMMET, inte mot load-token, en egen `activeRoomIdRef` (senaste aktiva rummet) jämförd mot
`saveRoomId` (rummet saven startade i). Den invalideras BARA av ett äkta rum-byte, det save faktiskt ska
skyddas mot, inte av en tyst re-fetch i samma rum. `loadTokenRef` behåller sin riktiga, enda roll: droppa
föråldrade FETCH-svar. SAMMA fix i alla tre (sister-filerna hålls självständiga enligt repots etablerade
konvention, vakten är tre rader, en cross-feature-helper hade brutit mönstret för lite vinst, PRINCIPLES
§0/§3/§4). Tester per provider: ett pågående save överlever en samtidig copy-invalidering i samma rum
(spegling sker), och droppas fortfarande korrekt vid RUM-BYTE. Mutationsverifierat: jämförs save-vakten
åter mot `loadTokenRef` röd:ar same-room-överlevnads-testet.

## 2026-06-12 , T54 (#93): glasklar kom-igång-yta (installera ELLER använd direkt)

**Bakgrund (Daniels live-feedback 2026-06-11):** "många lyckas inte förstå hur de ska installera det
som en app eller att de kan använda sidan direkt". Install-bannern (T13/T39) är diskret och kan
avfärdas; onboardingens install-steg (T39) var ren info utan väg (T39/#68 F1). Det fattades en
GLASKLAR, alltid-nåbar yta som säger BÅDA vägarna med rätt steg per enhet.

**Beslut/struktur:** Ny kom-igång-yta i `src/features/app-settings/` (samma feature som install/
onboarding, så ingen cross-feature-cykel): ren logik+data (`get-started-steps.ts`) + a11y-dialog
(`GetStartedDialog.tsx`) + trigger (`GetStartedControl.tsx`). Plattforms-detekteringen ÅTERANVÄNDER
T39:s `detectStandalone`/`detectIos`/`detectAndroid` (EN sanning, kan inte drifta från install-
knappen). Play Skydd-noten återanvänds ordagrant (`ANDROID_PLAY_PROTECT_NOTE`). Triggern monteras på
TVÅ ställen: i inställnings-portalen (`SettingsControl`, alltid nåbar efter onboardingen) + som inline
"Visa hur"-CTA i onboardingens install-steg. Dialog-kontraktet är den femte handrullade a11y-dialogen
(samma kopierade kontrakt som ScoreGuide T34), `<Modal>`-extraktionen är fortfarande en egen pinnad
refaktor-task (T34/#62-flaggan), inte smyglagd här.

**Källhänvisade externa fakta (gissas inte, så reviewern kan BEKRÄFTA mot källan):**
- **iOS-rekommendationen (review-F1-rättad, verifierad 2026-06-12):** Safari är enklaste vägen, men
  sedan iOS 16.4 (mars 2023) kan även Chrome/Edge/Firefox på iPhone lägga till på hemskärmen via sin
  Dela-meny. Texten rekommenderar Safari UTAN att påstå exklusivitet (det gamla "funkar bara i Safari"
  var föråldrat och hade lett Chrome-vänner fel åt andra hållet). Källor: Apple "Add a website to your
  Home Screen" (Safari-vägen, ingen exklusivitet fastställd) + Progressier "PWA installation"
  (tredjepartsstödet sedan 16.4). Inline i `get-started-steps.ts` (`IOS_SAFARI_REQUIREMENT`).
- **iOS-webbens ~7-dagars självrensning:** WebKit ITP nollar all script-writable storage (inkl.
  localStorage) efter 7 dagars frånvaro av interaktion i webb-läge; en installerad (standalone) PWA
  omfattas inte på samma sätt, därför rekommenderas hemskärmen. Källa: WebKit-bloggen "Full Third-Party
  Cookie Blocking and More" (7-day cap on all script-writable storage). Inline i `WEB_MODE_FACTS`.
- **Install-vägarna per plattform:** iOS Dela -> Lägg till; Android install-knapp/meny -> Installera
  app; desktop install-ikon i adressfältet. Källor: Apple-guiden (iOS) + web.dev "Customize the install
  experience" (Android/desktop, samma WebAPK-väg T39 byggde). Inline per väg i `GET_STARTED_PATHS`.

**Verifiering:** plattformsgrenarna + standalone testas mot ett riktigt Window med mockad UA/matchMedia
(samma grepp som T39); flikbyte, webb-läges-info, standalone-kortet och båda call-sites (inställningar +
onboarding) render-testas. Build/test/lint/format grönt.

**Copilot runda 3 (#93) , a11y-flikar + Escape-regression:**
- **WAI-ARIA Tabs-tangentbord i `PlatformTabs` (F1):** plattforms-flikarna fick förut hela Tab-ordningen
  och saknade pil-stöd. Implementerat enligt WAI-ARIA APG Tabs-mönstret
  (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): roving tabindex (bara aktiv flik tabIndex=0),
  vänster/höger-pil med wrap + Home/End. **Tolkningsval: AUTOMATIC ACTIVATION (selection follows
  focus)** , att flytta fokus byter direkt vald flik + panel. APG tillåter både automatic och manual
  activation; automatic rekommenderas när panelinnehållet är billigt att visa (här ren, redan laddad
  data) och flikantalet är litet (3 st), så det valdes (enklast, vanligast). Inline källhänvisat i
  `GetStartedDialog.tsx`.
- **Regressionstest för capture-Escape (F2):** capture-fas + `stopPropagation` (så en Escape bara
  stänger översta dialogen vid staplade modaler) saknade test. Lagt i `GetStartedControl.test.tsx`,
  mutationsverifierat (borttagen capture ELLER stopPropagation => rött). jsdom-not: i jsdom stoppar
  `stopPropagation` i capture-fasen även en bubbel-lyssnare på SAMMA target (document) , empiriskt
  probe-bekräftat innan testet skrevs, så testet vilar inte på en gissad event-semantik.

## 2026-06-12 , T60 (#102): 4 röda baslinje-tester var tidskopplade, inte en regression

**Symtom:** `feedback-seam.test.tsx` (3 fall) + `ResultEntryView.test.tsx` (1 fall, "Unable to find
button /Spara/") failade konsekvent på develop, även isolerat, och normaliserade en röd svit.

**ROTORSAK:** Alla fyra renderade `ResultEntryView` mot fixtures UTAN att frysa klockan och sparade
premiärmatchen `g-A-1` (svensk dag 2026-06-11). `ResultEntryView`:s 3-dagars fönster (#39, commit
6ce12ce/34fdd28) ankrar på "idag" när turneringen har börjat och DÖLJER (hidden, inte filtrerar bort,
C2-designen) matcher utanför fönstret. Testing Librarys roll-/etikett-queries hoppar över
hidden-subträd, så Spara-knappen + målfälten blev oåtkomliga. Testerna skrevs när 2026-06-11 låg i
framtiden (ankaret = premiären, g-A-1 inom fönstret -> grönt). Dagen den verkliga väggklockan passerade
premiär-fönstret (idag är 2026-06-12) gled fönstret till 12-14 juni, g-A-1 blev hidden och queryn
slutade hitta knappen. Det var alltså en TIDSKOPPLAD test-röta, INGEN app- eller seam-regression:
DOM:en var korrekt hela tiden (knappen finns i node-dumpen, bara inom ett hidden <li>).

**Beslut:** Frys klockan till premiärdagen (`vi.useFakeTimers({ toFake: ['Date'] })` +
`setSystemTime('2026-06-11T08:00:00.000Z')`) i båda testfilerna, exakt mönstret #39/C1/T28-blocken i
samma fil redan använder. Då ankrar fönstret deterministiskt på 11-13 juni och g-A-1 är alltid synlig,
oavsett vilken dag sviten körs. Ingen `.skip` (en riktig fix var rimlig), ingen produktionskodsändring.
**Varför just premiärdagen:** det är den enda dag-ankringen som garanterat innehåller g-A-1, och den
matchar systerblockens existerande tids-ankare (en sanning för "stabilt fönster i test").

**Lärdom (mönster för minnet):** ett test som renderar en tids-fönstrad vy mot fast fixtures-data och
läser den med a11y-queries MÅSTE frysa klockan, annars är det grönt bara så länge väggklockan råkar
ligga i fönstret och rödnar tyst när tiden passerar gränsen.

## 2026-06-12 , T56 (#100): levande slutspelsträd redan under gruppspelet (preliminärt läge, ärligt märkt)

Daniels live-feedback: "kolla även varför slutspelsträdet inte är levande nu direkt. även fast de
inte spelat så kan man visa det levande nu med de positioner som är nu. så kan den röra sig efter
varje resultat som matas in. roligt så att se redan nu."

**ROTORSAK (varför det inte kändes levande förut):** trädet var redan REAKTIVT (useBracketData
useMemo på matches i den delade storen, räknas om vid varje inmatning) och hade ett "gruppspel
pågår"-läge. MEN under gruppspelet visade grupp-/trea-slotarna BARA sin positions-etikett ("1:a
grupp E", "3:a A/B/C/D/F") + ett "4 möjliga lag"-chip, aldrig ett KONKRET nuvarande lag. Treornas
seedning var dessutom gatad bakom `qualifyingGroups === null` (skarp seedning kräver alla 12 grupper
FÄRDIGSPELADE, medvetet T4-fail-safe). Resultat: man såg inga lag röra sig, bara etiketter, alltså
"statiskt". (Den binära "tomt bakom isGroupStageComplete"-hypotesen stämde alltså inte exakt, trädet
var redan tre-läges, men preliminära LAG saknades.)

**Beslut, PRELIMINÄRT läge ('preliminary'-resolution):** under gruppspelet fylls varje slot nu med
det lag som leder positionen JUST NU, gruppens nuvarande 1:a/2:a ur tabellen (compute-standings med
FIFA-tiebreak) och de 8 nuvarande bästa treorna seedade via Annexe C. Laget rör sig vid varje inmatat
resultat (samma reaktivitet som tabellerna, ingen ny polling). Slot:en bär ÄVEN sina möjliga lag +
positions-etiketten parallellt, så ingen information går förlorad.

**ÅTERANVÄNDER de källlåsta motorerna (ingen parallell seedning, PRINCIPLES §4):** den preliminära
seedningen (`src/domain/bracket/preliminary-third-seeding.ts`) anropar EXAKT `rankThirdPlaces` (FIFA
Article 13) + `seedThirdPlaces` (FIFA Annexe C, 495 källlåsta kombinationer). Ingen egen
rankningstabell, ingen egen Annexe C. Enda skillnaden mot den skarpa vägen är NÄR vi seedar (på
nuvarande ställning, inte bara när allt är klart), inte HUR. Källa: Regulations for the FIFA World
Cup 26 (May 2026), Article 13 (sid. 27-28) + Annexe C (sid. 80-97), committat i
`fifa-knockout-rules-source.txt` / `third-place-table.ts`.

**ÄRLIG GRÄNS (dokumenterad, gissas inte):** FIFA Article 13 rangordnar treorna ÖVER grupper, vilket
bara är meningsfullt när ALLA 12 grupperna har en nuvarande trea att jämföra. Därför seedar vi
preliminärt ENDAST när alla 12 kanoniska grupperna har en rank-3-rad just nu (samma unika
täcknings-krav som den skarpa `qualifyingGroups`, men UTAN kravet på färdigspelat). Saknar någon
grupp en nuvarande trea (t.ex. en grupp som inte spelat) lämnas bästa-trea-slotarna i 'possible'-läge
(bara möjliga lag), aldrig en gissad seedning på ofullständig jämförelse. En grupp utan tabell ger
'possible' även för 1:a/2:a, ingen gissning.

**ÄRLIG MÄRKNING (samma anda som T51):** ett preliminärt träd märks tydligt, header-pillen "Nuvarande
ställning" + intro-meningen "Inte klart förrän grupperna är färdigspelade", och varje preliminär slot
bär en under-rad med sin position ("1:a grupp E · nu") + aria-label "..., nuvarande ställning (inte
klart)". `BracketState.preliminary` (true bara under gruppspel med minst ett preliminärt lag) driver
märkningen. `locked` och `preliminary` är ömsesidigt uteslutande.

**READ-ONLY mot facit:** det SKARPA låsta läget (`locked === true`, alla grupper färdiga) är
OFÖRÄNDRAT, deriveBracket räknar fortfarande den riktiga seedningen via `computeThirdPlaceRanking`
(som fortsatt returnerar null tills allt är klart). Den preliminära vägen körs bara `if
(!groupComplete)`. Det riktiga trädet rörs aldrig av T56.

---

## 2026-06-12 , T58 (#99): poäng synliga i tips-vyn (per-match-etikett + summering + käll-detalj)

**Beslut 1, utfalls-MEDVETEN per-match-etikett (en sanning, #69 kryss-noten):** match-tipsens
VARFÖR-etikett ("Exakt resultat" / "Rätt vinnare" / "Rätt kryss" / "Miss") bor nu i EN ren funktion,
`matchPointLabel(pointType, actualOutcome)` (`src/data/predictions/match-point-label.ts`), delad av
avslöjande-vyn (RevealView) OCH tips-listans poäng-rad. Tidigare bodde pointType -> etikett lokalt i
RevealView, och en 1-poängare på ett OAVGJORT facit visades felaktigt som "Rätt vinnare".
**Källa till regeln (gissas inte):** issue #69:s kryss-kommentar (Daniels fråga 2026-06-11): etiketten
ska vara utfalls-medveten/-neutral, ALDRIG "Rätt vinnare" när utfallet var oavgjort. Vi valde den
utfalls-MEDVETNA varianten ("Rätt kryss" vid draw, "Rätt vinnare" vid hemma/borta), starkare än enbart
neutral text, så ordet aldrig kan motsäga verkligheten. Håller samma sanning som poäng-guiden
(score-explainer-items: "Rätt vinnare (eller oavgjord)"). Poänglogiken var redan rätt (outcomeOf
hanterar draw, score.ts), bara ordvalet i etiketten rättades.

**Beslut 2, summering + käll-detalj ur SAMMA poäng-väg (ingen dubbelräkning, HARD):** tips-vyn får en
panel överst med total + placering (deriveSelfSummary, samma härledning som topplistan) + en detalj
per källa (matchtips / grupptippning / slutspelsträd / VM-vinnare). Käll-uppdelningen exponeras ur
aggregeringen (`scoreMemberBreakdown`, `aggregate-scores.ts`): scoreMember ackumulerar nu per källa och
totalen HÄRLEDS ur källsummorna, så invarianten "summan av källorna === total" gäller per konstruktion.
Mästar-poängen hålls SKILD från bracket (egen detalj-rad). Rad-ordning + etiketter bor i
`source-breakdown-rows.ts` (en sanning, mutations-vaktad: radernas summa === totalen).

**Beslut 3, EN delad LeaderboardProvider (ingen dubbelhämtning, HARD):** providern hoistades från
LeaderboardSection upp till App, så att OMSLUTA både tips-poolens sektioner OCH topplistan. Tips-vyns
summering (TipsScoreSummary) konsumerar då SAMMA store som topplistan (samma fetch, samma facit), i
stället för en andra provider = en andra Supabase-hämtning. Aktuell användares käll-uppdelning
(selfBreakdown) beräknas en gång i providern (där predictionsByUser + facit redan finns) och läggs på
storen. **Varför hoist (inte T51:s prop-injektion):** providern NÅR båda sektionerna efter hoist, så
den rena delningen via context är möjlig; prop-injektion behövs bara när providern inte når.

**Beslut 4, poäng PER MATCH på själva tips-kortet (krav 1, KOMPLETTERING 2026-06-12):** den första
versionen av T58 byggde den delade `matchPointLabel` + summeringen (besluten ovan) men kopplade ALDRIG
in poäng-raden i tips-listan (`features/predictions`), så Daniels krav 1 ("under tippa matcherna ska
poängen redovisas för VARJE match") var inte levererat. Nu visar `PredictionForm` , på en AVGJORD match
användaren tippade , poängen + VARFÖR direkt i låst-etiketten: "+3 · Exakt resultat" / "+1 · Rätt
vinnare" / "+1 · Rätt kryss" / "0 · Miss". **En sanning, ingen ny beräkning:** siffran kommer ur
`scorePrediction`, typen ur `pointTypeOf`, orden ur den delade `matchPointLabel` (samma funktion
avslöjande-vyn använder). Facit läses ur den VÄVDA matchdatan (`match.result` via `isFinished`-
narrowing, exakt samma kontrakt som T57:s dag-kort), inte en ny källa. **Två ärliga gränser (HARD):**
en PÅGÅENDE (låst men ospelad, status 'live') match visar BARA "Ditt tips", ingen poäng , vi gissar
aldrig en poäng på en oavgjord match (T55-principen). En match användaren INTE tippade visar ingen
poäng-rad alls , ingen "0 · Miss" för den som inte var med (det vore oärligt, hen bommade inte, hen
deltog inte). Format-skillnad mot avslöjande-vyn (som skriver "Exakt resultat +3", ord-först): tips-
listan skriver delta-FÖRST med en mittpunkt ("+3 · Exakt resultat"), orden är dock EXAKT samma
(matchPointLabel), bara ordningen i brickan skiljer. Data-hakar: `data-tip-result`, `data-tip-points`,
`data-tip-point-type` (för design-finish + test).

**Beslut 5, PREMIUM-FINISH (design-frontend, 2026-06-12, ovanpå data-attribut-seamen):** den
funktionella basen (besluten ovan) polerades till appens "arena i kvällsljus"-språk utan att röra
logik, härledningar eller test-hakar.

- **Summeringspanelen som "skyltfönster" (krav 1):** `.vm-tips-score-summary` (tokens.css §20) lyftes
  från en oformaterad ruta till en STOLT liten hero-panel , surface med en svag guld-hörn-glow (8%) +
  en hårfin inset guld-topplist (samma kvällsljus-signatur som `.vm-coupon-card` §10 / `.vm-reveal-card`
  §13, DRY). TOTALEN bärs av en SOLID guld-bricka med mörk ink (`.vm-tips-summary-total`, den färg-
  oberoende solid-bricka-formen, DRY mot `.vm-coupon-mine`/`.vm-reveal-actual`/`.vm-score-points`), så
  ögat landar på "så många poäng har JAG" först. PLACERINGEN fick en lugn `#N`-bricka
  (`.vm-tips-summary-rank-badge`, surface-raised + fg, samma neutrala bricka-roll som topplistans
  `.vm-board-rank`) + "av M" som dämpad text. Hela meningen ("Plats N av M") ligger kvar som `sr-only` i
  `data-tips-summary-rank`, så skärmläsaren läser placeringen i ord OCH testet ser den exakta texten;
  det synliga `#N` + "av M" bär samma besked för seende. Käll-raderna gjordes lugna + skanbara: en pyttig
  guld-marker (dekor) + dämpad etikett + fg-poäng, med en hårfin guld-divider (`.vm-tips-source-list`).
- **Poäng-brickan på tips-korten (krav: tydlig men inte skrikig, exakt/utfall/miss skiljbara UTAN färg):**
  de tre utfallen skiljs nu på FORMEN, inte bara färgen eller ordet (WCAG 1.4.1). Brick-FONDEN: EXAKT =
  den stolta solida guld-brickan (`.vm-coupon-mine`), UTFALL = en lugnare guld-tint-chip, MISS = en
  NEUTRAL chip (surface-raised + kant, INGEN guld-tint, så en miss lånar inte den hoppfulla guld-tonen,
  samma neutrala form som `.vm-reveal-mark--miss`). Dessutom en FÄRG-OBEROENDE markör-glyf (bock ✓ /
  halv-cirkel ◐ / kryss ✗, SAMMA glyf-familj som RevealView `MARK_BY_TYPE`) ritad via CSS `::before` per
  `data-tip-point-type` (`.vm-tip-result`, tokens.css §10). **Varför `::before` (inte ett glyf-span):** ett
  span skulle hamna i elementets `textContent` och tippa poäng-talet ur första positionen (testet vaktar
  att "0"-brickan börjar med "0", inte med glyfen); pseudo-element-innehåll exponeras varken i `textContent`
  eller för skärmläsare, så glyfen är ren visuell form och VARFÖR-ordet bär betydelsen.

**AA (T58-visuellt, scripts/contrast-t58.mjs, canvas-komposit VÄRSTA fall = text rakt på guld-glow-toppen,
BÅDA teman):** all läsbar panel-text står på den nästan-opaka panel-ytan; enda tinten i text-vägen är guld-
hörn-glow:en vid 8% alfa. Uppmätt över den 8%-tintade fonden: rubrik/placering/käll-poäng (fg) 12.96:1
mörkt / 16.46:1 ljust, eyebrow (warning guld-TEXT, ALDRIG rå `--vm-gold`) 8.58 / 5.44, käll-etikett
(fg-muted) 6.38 / 5.99. Total-brickan är coupon-ink på SOLID guld 10.90 / 5.03. MISS-brickan (fg-muted på
surface-raised) klarar AA som normal text per tema (tokens.css §0-claim). MIN över alla nya text-ytor
6.38:1 mörkt / 5.03:1 ljust, alla >= 4.5 (normal text). Glow-/topplist-/divider-/marker-/glyf-lagren bär
ALDRIG läsbar text. Verifierat visuellt i 390px + 280px x mörkt/ljust (statisk markup-harness mot byggd CSS,
Playwright): inget överflöd, ingen krock, panelen reflowar rent (header `flex-wrap` droppar rank+total till
egen rad i smalt läge). Reduced-motion: panelen har ingen egen animation (inga keyframes), så inget att nolla.

## 2026-06-12 , T57 (#98): dagens match-vy lever, fokus följer nästa match + dag följer verklig dag + resultat i listan

**Beslut (fokus, krav 1):** "Match of the day" (hero-kortets fokus) väljs nu som dagens tidigaste
match som INTE är färdigspelad (`status !== 'finished'`), inte längre dagens tidigaste match oavsett
status (`selectMatchOfTheDay`, countdown.ts). Är HELA dagen spelad faller fokus tillbaka på dagens
tidigaste match (då med sitt resultat), så hero:t aldrig blir tomt.
**Varför:** Daniels live-feedback (skärmdump): efter slutsignal stod "DAGENS MATCH" kvar på den
avslutade matchen tills sidan laddades om, fast nedräkningen redan pekade mot nästa avspark.
Asymmetrin var att nedräkningen är tick-driven (`computeCountdown(matches, nowMs)`) medan fokuset
bara var mount/dag-frusen (tidigaste oavsett status). Genom att hoppa över färdiga matcher lyfter
fokus nästa ospelade match automatiskt, drivet av SAMMA weave/tick (matchens status blir 'finished'
när det officiella resultatet vävs in, T48), ingen ny polling. En live-match räknas som ospelad
(bär inget resultat än) och kan vara fokus.

**Beslut (dag följer verklig dag, krav 2):** Startdagen i dag-bläddraren härleds nu mot det
DAG-MEDVETNA `nowMs` från `useTodayKey` (flyttar vid midnatt via minut-tick gatad på dygnsväxling +
visibilitychange vid flik-väckning), inte mot det mount-frusna `now`. Användarens medvetna val
PINNAS (`pinnedKey`): när hen bläddrat stannar dagen, den hoppar inte under hen vid midnatt; först
när hen "följer" (inget pinnat) auto-flyttar bläddraren till aktuell dag. Navigerar hen TILLBAKA till
den dag som ÄR den härledda aktuella dagen (idag) NOLLSTÄLLS pinningen (`pinnedKey = null`) så
följ-läget ÅTERUPPTAS; en bläddring bort och tillbaka till idag låser alltså inte bläddraren på idag.
Pinning på en ANNAN dag är orörd (rycker aldrig en användare som bläddrar i resultaten).
**Varför:** PWA:n lämnas öppen hela VM:t, så dagen måste flytta utan reload (samma anda som T27:s
`useTodayKey` och T35:s tick). Det tidigare mount-frusna `now` plus en sync-back-effekt som
permanent-pinnade den härledda nyckeln gjorde att bläddraren stod kvar på gårdagen tills reload. Den
permanenta pinningen ersattes av en explicit `pinnedKey` (null = följ verklig dag), vilket gör
auto-flytten korrekt OCH testbar utan att yanka en bläddrande användare. Reviewerns F1 (#98): utan
nollställningen pinnade en bläddring TILL idag den dagen permanent, så nästa dygnsväxling i en öppen
flik flyttade inte bläddraren (Daniels symptom efter en bläddring i samma session). Fixen härleder
"är idag?" med SAMMA regel som `selectedIndex` (`initialDayIndex` mot `liveNowMs`), en sanning.

**Beslut (resultat i listan, krav 3):** Matchkortet visar nu RESULTATET för en färdigspelad match
(ordinarie "hemma-borta", t.ex. "2-1", plus straffar separat i slutspel: "(4-3 på straffar)"), via
rena formaterare (`formatScore`/`formatPenalties`/`isFinished`, match-display.ts). Resultatet är
FÄRG-OBEROENDE (tyngd + `tabular-nums` i fg, inte accent/success som delar hue i ljust tema, T7-pin).
**Varför:** Med 3-dagars-fönstret som gömmer den fulla matchlistan vill man kunna bläddra bakåt och
se alla resultat direkt på korten. Datakällan var redan rätt: dag-vyn läser den VÄVDA matchdatan ur
results-storen (officiella resultat driver den sedan T48), inte den statiska planen, men kortet
renderade inte resultatet förrän nu. Straffarna visas SEPARAT så ett slutspels-resultat inte blir
tvetydigt.

---

## 2026-06-12 , T41 (#70): EOL-normalisering till LF (.gitattributes + Prettier)

**Beslut:** Repot normaliseras till **LF** för alla textfiler via `.gitattributes`
(`* text=auto eol=lf` + binär-undantag för png/woff2/ico/jpg m.fl.), och Prettier sätts till
`endOfLine: "lf"` (var `"auto"`). `git add --renormalize .` konverterade de 14 filer som var
CRLF i index (inklusive tidigare-medvetet-CRLF: tokens.css, decisions.md, patterns.md, HANDOFF.md,
supabase/README.md) till LF. Efter denna task är ALLT LF.
**Varför:** Utan `.gitattributes` (`core.autocrlf=false`, mixade radslut) avgjorde varje utvecklares
lokala editor radslutet. Windows-editorn skrev om en tidigare-LF-fil med CRLF vid minsta ändring, så
git såg HELA filen som ändrad: en 12-raders ändring blev en 186-raders hel-fil-rewrite i diffen (T38),
vilket gjorde review svårare och dolde den äkta ändringen. Mönstret återkom och krävde en manuell
numstat-vakt varje gång i **T38, T50, T51, T55, T59+**. `endOfLine: "auto"` gjorde dessutom
`format:check` blind för CRLF/LF (auto accepterar filens befintliga radslut), så lint-grinden gav
ingen signal. `eol=lf` löser roten en gång, `endOfLine: "lf"` gör att grinden nu FÅNGAR en framtida
flip. **LF (inte CRLF)** valdes för att toolchainen (Node, Vite, Prettier, git) och Cloudflare/Linux-
hostingen är LF-native; CRLF skulle kräva undantag på fler ställen. Normaliserings-diffen hölls i en
EGEN commit skild från konfig-committen och bevisades ren EOL per fil (`--numstat --ignore-all-space`
TOM => noll äkta innehållsrad ändrad).

## 2026-06-12 , T55 (#96): tips-avslöjandet visas vid AVSPARK, inte först vid slutsignal

**Symptom (Daniels rapport 2026-06-11, live under öppningsmatchen):** "Mexico-matchen startade men man
ser inte vad de andra tippat den matchen, skulle inte det synas?"

**Rotorsak 1 (primär), bekräftad mot kod + live-DB:** `buildMatchReveal` (`reveal.ts`) krävde TIDIGARE
BÅDE låst (avspark passerad) OCH avgjort (ett `MatchFacit` fanns, vilket bara skapas för
`status === 'finished'` i `derive-facit.ts`). En LÅST men PÅGÅENDE match (`status === 'live'`) saknar
facit, så den hoppades över, och avslöjandet dök upp först efter SLUTSIGNAL. Men sekretessen släpper
redan vid AVSPARK: RLS-villkoret är matchens kickoff, inte slutresultatet (verifierat live, 5 tips på
g-A-1 syns i ewrmdt-rummet efter passerad kickoff).

**Regel (gissas inte, källa):** tips-INNEHÅLLET får visas så snart matchen är LÅST (`now >= kickoff`,
`isMatchLocked`), samma grind som tips-SKRIVNINGEN och RLS-reveal-villkoret. Poäng får däremot BARA
visas/räknas på AVGJORT facit (ett tips ger poäng först när matchen är klar). **Källa:** denna logg T17
§2 ("avslöjande-gaten ... låst för sekretess; avgjord för att visa poäng") + T15 §4 (RLS-sekretess på
kickoff) + `isMatchLocked` (T15, predictions-api.ts).

**Fix:** `buildMatchReveal` avslöjar nu varje LÅST match. Facit/poäng-delen är NULLABLE via en
diskriminerad union `RevealedMatch = PendingRevealedMatch ('live') | FinishedRevealedMatch ('finished')`
(samma typ-kontrakt-anda som domänens `Match`-union, T3): en 'live'-match bär `actual: null` och picks
UTAN poäng-fält, en 'finished'-match bär facit + poäng + `pointType` som förut. Diskriminanten gör det
STRUKTURELLT omöjligt att läsa/gissa poäng på en pågående match (HARD: ärligt "Pågår", aldrig en gissad
poäng). Topplistans poäng-aggregering (`aggregate-scores.ts`) rör INTE detta, den läser fortsatt bara
`facit.matches` (finished-only), så inga poäng tickar in på en pågående match.

**Rotorsak 2 (sekundär):** `LeaderboardProvider` hämtade andras tips bara vid mount/rumsbyte (fetch-deps
`[supabase, activeRoomId]`). En app som stått öppen sedan FÖRE avspark fick aldrig in de RLS-nyligen-
släppta raderna utan en manuell reload. **Fix:** härled `lockedMatchCount` ur den BEFINTLIGA minut-
ticken (`useDeadlineTick`/`evalNow`, T15 C1) och lägg i fetch-deps. Talet ökar när en match passerar
avspark, så PRECIS den övergången triggar en (1) ny hämtning, inte varje minut-tick (talet är stabilt
mellan avsparker). INGEN ny polling, INGEN realtime (det är T18/#18). Bevisat med mock-klocka +
mutationstest (utan `lockedMatchCount` i deps failar re-fetch-testet rött, `expected 2, got 1`).

**Rotorsak 2, uppföljning (copilot R2, #96):** fetch-effekten satte ALLTID `predictionsStatus = 'loading'`
vid start. Med `lockedMatchCount` i deps betydde det att VARJE avspark blankade topplistan/sammanfattningen
("Laddar...") och tömde RevealView tyst, trots att giltig data redan fanns och bara skulle KOMPLETTERAS.
**Fix:** avspark-triggade re-fetchar är nu TYSTA. En `loadedRoomIdRef` skiljer en SYNLIG laddning (initial:
ingen data än; rumsbyte: datan hör till fel rum -> visa `loading`, blanka) från en TYST re-fetch (samma rum,
datan finns redan -> behåll `ready` + datan, byt bara ut den när svaret kommer). **Felväg (val, ärlighet):**
en TYST re-fetch som FAILAR kastar inte bort den befintliga (giltiga, om än något inaktuella) topplistan,
den behåller data + `ready` och loggar `console.warn` (`[VM2026]`-konventionen, fail-loud i konsolen utan att
blanka UI:t för en transient avspark-poll). En INITIAL/rumsbyte-fetch som failar går till `error` som förut
(ingen data att skydda, fail loud PRINCIPLES §8). Bevisat med deferred-klocka: status förblir `ready` under
re-fetchen (gamla picks kvar), `loading` syns aldrig efter första `ready`, mutationsverifierat (återinförd
ovillkorlig `loading` -> flimmer-testet rött); rumsbyte/initial visar `loading` som förut; misslyckad tyst
re-fetch behåller datan.

**HARD-kontroll (sekretess FÖRE avspark intakt):** en OLÅST match avslöjar ALDRIG andras tips, oavsett
om facit/tips råkar finnas i datan. `now >= kickoff` är den enda synlighets-grinden. Negativ kontroll
testad (olåst match, status live, picks i datan -> 0 avslöjade).

**UX-platsen (picks vid matchkortet, rotorsak 3 i issuen):** medvetet UTANFÖR denna task (#99/T58 tar
helheten). reveal-ändringen är gjord ÅTERANVÄNDBAR därifrån (exporterad union + pending-typer i
`leaderboard/index.ts`). Pågår-lägets premium-finish poleras av design-frontend ovanpå data-attribut-
hakarna (`data-reveal-status="live"`, `data-reveal-live-pick`, `data-reveal-pending`).

**Design-finish (design-frontend, samma task):** pågår-kortet fick en BESLÄKTAD MEN EGEN identitet mot
facit-kortet. Facit-kortet bär "kvällsljus"-GULD (det avgjorda, "domen är fälld"); pågår-kortet bär
appens PITCH-GRÖNA accent (matchen lever, tipsen ligger på bordet), samma gröna live-identitet som
dagshero:ns nedräknings-prick (T7). De två kort-typerna skiljs alltså på en blink BÅDE i färg (grön mot
guld) OCH i form, så särskiljningen aldrig hänger på färg ensam (WCAG 1.4.1): "Pågår"-markören är en lätt
accent-pill med en PULSANDE prick (`.vm-reveal-pending` + `.vm-pending-dot`, samma `vm-pulse`-keyframe som
`.vm-live-dot`, DRY), kontra facit-talets solida guld-bricka. Pulsen stannar vid reducerad rörelse
(index.css, `.vm-pending-dot` tillagd i reduce-blocket) och då bär ordet "Pågår" + formen budskapet, ingen
rörelse krävs (WCAG 2.3.3). Pågående tips får en svag accent-vänsterkant (`.vm-reveal-pick--live`). KONTRAST
(uppmätt i renderad DOM, per tema, korrekt attribuerat): "Pågår"-pillens accent-text på 9%-accent-tint =
8.10:1 MÖRKT (ljus accent `#1fe082` mot mörk surface) / 4.77:1 LJUST (mörk accent `#0e7a44` mot vit surface),
båda >= 4.5:1 (normal text). Det LJUSA temat ger den lägre ratiot (mörk accent på nästan-vit yta), korrekt
ordning. Kort-glow:en sitter i NEDRE VÄNSTRA hörnet, pillen uppe till HÖGER (motsatta-hörn-disciplinen, §17),
så glow:en aldrig lyfter pill-ytan och sänker text-kontrasten under AA.

## 2026-06-12 , T59 (#97): listMyRooms filtrerar på EGEN user_id (dubblett-rum-bugg)

**Symptom (Daniels skärmdump 2026-06-12):** kopiera-tips-sektionen + rum-väljaren visade samma
källrum flera gånger ("VM 2026" x7, "Rhodos Champs" x3). Antalet dubbletter = medlemsantalet i rummet.

**Rotorsak (bekräftad):** `listMyRooms` (`src/data/rooms/rooms-api.ts`) frågade `room_members` och
joinade `rooms` UTAN `.eq('user_id', <jag>)`. RLS-policyn på `room_members` låter en medlem se ALLA
medlemsrader i rum hen själv är med i (designat så medlemslistan kan visa de andra deltagarna, se
`supabase/migrations` is_room_member-grant + T14-besluten i denna logg). Utan egen-identitet-filtret
joinades därför `rooms` en gång PER medlemsrad, så varje rum dök upp x medlemsantalet. Pre-existerande
sedan T14 (#14), ofarligt så länge rummen hade en medlem, ytade när de fick flera. Ingen
integritetsbugg: varje kopiera-knapp kopierar bara användarens EGNA tips (user_id-bundet i engine +
RLS), bara visningen var trasig.

**Fix:** (1) `.eq('user_id', identity.userId)` på queryn (identiteten fanns redan via ensureSession,
returvärdet kastades tidigare) , roten, en rad per rum. (2) Defensiv dedupe på `room.id` via en Map i
mappningen, så en framtida query-/RLS-ändring inte tyst kan återinföra dubbletter. Konsumenterna
(RoomPanel-väljaren, CopyTipsControl) hade inga egna dedupes att städa och räknar inte på rå listans
längd, så de blev rätt utan ändring. Regressionstest: flera medlemsrader för samma rum -> exakt en
RoomSummary per rum (`rooms-api.test.ts`).

**Daniels beslut 2026-06-11 (källa, gissas inte):** de som inte hann tippa före premiären ska få
till och med SÖNDAG 2026-06-14 23:59 svensk tid på sig att tippa GRUPPVINNARE/TVÅA och VM-VINNARE
(champion). Spelade matcher ger inga match-poäng i efterhand , match-tipsen + bracket-SLOT-tipsen
(M73..M104) behåller sina EGNA avsparks-lås (rörs INTE). Daniels ord: "så de som inte hann med
premiären får en chans. men de matcher som spelats missar de givetvis poäng på." Issue #95.

**FAST TIDPUNKT:** 2026-06-14 23:59 svensk tid = `2026-06-14T21:59:00Z`. Sverige är på sommartid
(CEST, UTC+2) i juni, så 23:59 lokal = 21:59 UTC. Verifierad mot kalendern (sommartid gäller mars-okt).

**KRITISK DESIGN-REGEL , FÖRLÄNG, FÖRKORTA ALDRIG (GREATEST):** nya deadlinen =
`GREATEST(ursprungligt kickoff-ankare, fasta tiden)`. Grupperna G..L spelar sin FÖRSTA match EFTER
14 juni (g-G-1..g-L-1 ligger 15-17 juni, verifierat mot t15-seeden / spelschemat: G=15/6 19:00Z,
H=15/6 16:00Z, I=16/6, J=17/6 01:00Z, K=17/6 17:00Z, L=17/6 20:00Z). Att tvinga dem till fasta
tiden skulle FÖRKORTA deras fönster och låsa ute folk. GREATEST ger A..F den förlängda söndagstiden
(deras ankare ligger FÖRE 14/6) OCH låter G..L behålla sitt SENARE egna ankare. Champion-ankaret
g-A-1 (11/6) ligger FÖRE fasta tiden => `GREATEST(g-A-1, fast)` = fasta tiden (champion förlängs).

**EN SANNING (T35-principen), klient + DB:** regeln bor på EN plats per sida och speglar varandra
EXAKT. DB: ny migration `20260611150000_t53_extended_deadline_group_and_champion.sql` inför
`pool_extended_deadline()` + GREATEST i `group_deadline_kickoff` och champion-grenen av
`bracket_deadline_kickoff` (slot-grenen orörd). Klient: `src/data/predictions/prediction-deadline.ts`
(`POOL_EXTENDED_DEADLINE_ISO` + `applyExtendedDeadline`), inkopplad i `group-predictable-data.ts`,
champion-delen av `bracket-predictable-slots.ts` och `derive-copy-locks.ts` (grupp + champion). Text
(`formatDeadline`/`DeadlineNotice`) och lås härleds ur SAMMA `deadlineIso`, ingen dubblerad tid.

**FAIL-SAFE bevarad:** ett saknat ankare (okänd grupp/slot) ger fortfarande NULL-deadline (skriv
nekas / andras tips dolda), aldrig fasta tiden , `applyExtendedDeadline(null) = null`, och migrationen
har en explicit `when ... is null then null`-gren (SQL:s `greatest` ignorerar annars NULL och hade
gett ett öppet fönster). Verifierat live mot produktion (kmzhyblzxangpxydufve) med read-only-frågor
+ ett hårt skriv-prov genom riktig anonym session i ett isolerat test-rum (städat efteråt): grupp A
+ champion (tidigare LÅSTA) skriver nu igenom RLS, grupp G (sen) + slot M73 opåverkade.

**Källa:** Daniels task-direktiv T53 (#95) + t15-seeden (spelschemat) + t16-RLS-migrationerna (de två
deadline-helpers förändringen bygger på).

---

## 2026-06-11 , T52 (#91): kopiera mina tips mellan rum

Daniels live-feedback: "man ska kunna kopiera in sina resultat från ett rum till ett annat rum,
blir tjatigt att behöva fylla om varenda match varje gång." Implementerat som en ren engine
(`src/data/predictions/copy-predictions.ts`) som läser MINA tips i källrummet och skriver dem i
målrummet via de BEFINTLIGA API-funktionerna (`upsertMy*`), plus en UI-kontroll i rum-panelen
(`CopyTipsControl.tsx`) som kopierar IN till det aktiva rummet.

**HARD-beslut 1, bara EGNA tips:** kopieringen läser BARA via `listMy*` (filtrerar på `user_id` ur
sessionen) och skriver BARA via `upsertMy*` (sätter `user_id = auth.uid()`). En annans tips kan
varken läsas hit eller skrivas i deras namn. Källa: RLS-policyerna i
`supabase/migrations/20260611120200_t15_predictions_rls.sql` (+ t16-grupp/bracket-motsvarigheterna),
`user_id = (select auth.uid())` i with check, bevisat i `predictions-rls.integration.test.ts`
(FÖRFALSKNINGS-testet).

**HARD-beslut 2, deadline-lås respekteras + RLS-feltextens tvetydighet:** ett RLS-avslag i Postgres
ger kod 42501 med texten "new row violates row-level security policy" , SAMMA text oavsett om
avslaget berodde på deadline-låset eller på något annat (icke-medlemskap, förfalskning). Klienten kan
alltså INTE av feltexten avgöra VARFÖR en skrivning nekades. Därför PRE-KLASSIFICERAR vi lås på
klienten med samma sanning tips-vyerna redan visar (`isMatchLocked` + deadline-ankaren) via
`deriveCopyLocks`, hoppar låsta items utan skrivförsök och rapporterar dem som "låsta". Ett item vi
ändå försöker skriva och som nekas rapporteras ärligt per item som "kunde inte kopieras" med felets
text , aldrig en tyst no-op (PRINCIPLES §8). Deadline-ankaren är källåkrade och speglar RLS-helpers
EXAKT: match-tips -> matchens egen avspark; grupp-tips -> gruppens första match `g-X-1`
(`group_deadline_kickoff`); bracket-tips -> slottens egen avspark, och `champion` -> turneringsstart
`g-A-1` (`bracket_deadline_kickoff`). Källa: t15/t16-RLS-migrationerna + `bracketDeadlineMatchId`
(`bracket-predictions-api.ts`) + `groupFirstMatchId` (`group-predictable-data.ts`).

**HARD-beslut 3, befintliga tips i målrummet skrivs ALDRIG över (fyll bara TOMMA):** valt framför
"skriv över" och "fråga per match". Motiv: det är FÖRUTSÄGBART och OFÖRSTÖRBART , en kopiering kan
aldrig råka radera ett tips användaren redan lagt i målrummet, och behöver ingen extra dialog (KISS).
Items som redan finns i målet hoppas och rapporteras som "redan tippade". Avvägning: en användare som
VILL skriva över får göra det manuellt i målrummet (sällsynt fall, och det destruktiva alternativet
ska kräva en medveten handling, inte ske som bieffekt av en bekvämlighets-kopiering).

**Robust mot delfel:** varje skrivning är sin egen try/catch, en låst eller felande match stoppar inte
resten. Rapporten (`CopyReport`) bär per-item-utfall + totaler; UI:t sammanfattar ärligt via
`summarizeCopyReport` ("X tips kopierade, Y hoppades över (låsta), Z redan tippade, W kunde inte
kopieras"). En LÄSmiss (kan inte kopiera blint) fail-loud:ar däremot hela jobbet.

**Copilot runda 1, härdning (3 beslut):**
- *Ingen cirkulär import i data-lagret:* `copy-predictions.ts` importerar de återanvända
  API-funktionerna DIREKT ur sina käll-moduler (`predictions-api` / `group-predictions-api` /
  `bracket-predictions-api`), INTE via barrel:n `./index` (som re-exporterar copy-predictions och
  därmed gav en cirkel). Beroende-grafen är nu riktad: `index -> copy-predictions -> *-api`.
- *Inget stale kopierings-resultat vid rumsbyte:* RoomPanel remountar inte `CopyTipsControl` när det
  aktiva (mål-)rummet byts, så per-rad-tillståndet (knutet till FÖRRA rummet) nollställs nu via en
  `useEffect` på `activeRoom.id`, och en asynkron kopiering som löser EFTER ett rumsbyte släpps tyst
  (ref-jämförelse i BÅDE success- och catch-grenen), så ett gammalt utfall aldrig dyker upp i fel rum.
- *A11y, villkorlig live-region:* ett fel-utfall (failad skrivning ELLER kastad läsmiss, tone
  'negative') annonseras som `role="alert"` (assertive), lyckat/neutralt som `role="status"` (polite),
  i linje med resten av RoomPanel.

## 2026-06-11 , T51 (#88): simulerad slutspelsbild ur grupp-tipsen (treorna lämnas öppna, gissas aldrig)

Daniels live-feedback efter att ha tippat grupperna: "Tippade grupperna men fick ingen simulering på
hur 16del kommer se ut osv ... så man kan se potentiella finallag, alltså vilka som möter varandra."
En ny härledd vy (`src/features/simulation/derive-tips-bracket.ts` + `TipsBracketView.tsx`) placerar
de tippade ettorna/tvåorna i slutspelsträdets slots, så man SER mötena i sextondelen ("2:a grupp A
mot 2:a grupp B"). Återanvänder den källhänvisade T4-strukturen (`buildBracket`/`bracket-structure.ts`,
FIFA Article 12.6-12.11) och definierar ingen ny slutspelsregel. Ren funktion, skriver aldrig: de
riktiga resultaten/facit rörs inte (egen `picksByGroup`-källa, egen `TipsBracketState`).

**HARD-beslut, bästa treorna lämnas ÖPPNA (gissas ALDRIG):** sextondelarna kräver också de 8 bästa
treorna, seedade via FIFA:s Annexe C utifrån VILKA grupper treorna kom från (motorn finns:
`seed-third-places.ts` + `third-place-table.ts`, 495 källlåsta kombinationer, Annexe C). MEN
grupp-tipsen bär bara 1:a + 2:a per grupp, INTE treor. Det finns alltså ingen ärlig grund för att
seeda en trea ur tipsen. Varje bästa-trea-slot får därför resolution `'open-third'` och visas som en
öppen platshållare ("3:a A/B/C/D/F" + märket "Öppen"), aldrig med ett gissat lag. Att gissa en trea
och visa den som seedad vore precis det facit-sken issue #88 förbjuder ("ingen gissad seedning som
presenteras som facit"). Källa för treornas roll: FIFA Regulations Article 12.6 (i `bracket-structure.ts`)
+ Annexe C (i `third-place-table.ts`).

**Propageringen stannar ärligt vid sextondelen:** tipsen säger vilka LAG som möts, men inte vem som
VINNER en match (ett matchresultat, inte ett grupp-tips). Alltså kan inget lag föras vidare till
åttondelen ur tipsen, ens där båda lagen är kända. Åttondel och framåt visas därför strukturellt
("Vinnare M73 mot Vinnare M75"), så man ser VÄGEN mot finalen utan att vi hittar på vinnare. Det är
den ärliga gränsen för vad ett grupp-tips kan säga, och finalen står som två öppna slots (ingen
"potentiell finallag"-gissning). Identitets-rymd vid seamen: tipsen bär Team.CODE (versal "BRA"),
trädet/uppslag bär Team.id (gemen "bra"); motorn översätter code -> id internt (samma fälla som
T16/F1, vaktad av test som assertar i id-rymden).

**Placering:** vyn ligger direkt under grupp-tips-kupongerna i `GroupPredictionsView` (samma
`GroupPredictionsProvider`, läser mina tips ur samma store), eftersom det är där Daniel var när han
bad om den. Visar en uppmaning tills minst en grupp är tippad. Design-frontend polerar ovanpå de
återanvända bracket.css-hakarna (tipped/open-third/tbd via `data-tips-slot-resolution`).

**Copilot runda 1-fixar (samma task, #88):**
- `tippedGroupCount` räknas nu BARA över kanoniska grupp-id (A..L), via ett `Set` byggt ur
  `GROUP_IDS` (`domain/types`, EN sanning, ej hårdkodat i sim-modulen). En korrupt/legacy-nyckel i
  `picksByGroup` (t.ex. ett gammalt rum) får annars räknas som tippad grupp och ge "13 av 12".
- **EN laddning, ingen dubbel fetch:** den simulerade vyn laddar inte längre samma turneringsdata
  igen via egen `useGroupPredictableData`. `GroupPredictionsView` skickar ned sin redan-laddade
  `GroupPredictableData` som `predictableData`-prop, så `useTipsBracketData(predictableData)` härleder
  ur den injicerade datan. Fail-loud bevarat: utan injicerad data (och utan test-`data`) kastar
  `TipsBracketView` (det är ett programmeringsfel, inte ett tyst körningsläge).
- Tomläges-uppmaningen ("Tippa minst en grupp ...") blinkar inte längre fram under laddning:
  `TipsBracketPresentation` renderar inget tills `data.ready` (bracket är null både vid "laddar" och
  "tomt tips", så vi får inte gissa "tomt" under laddning).

---

## 2026-06-11 , T35 (#63): lås-tydlighet, gråmarkerat låst-läge + deadline-budskap (verifierad modell)

Daniels feedback 5: tippnings-upplevelsen ska vara TYDLIG om lås och deadlines. Tre AC. AC#2 (3-dagars
fönster + expandera på matchtips-listan) levererades REDAN i T39 (`PredictionsView`, `ExpandToggle`,
paritetsguard `predictions-results-window-parity.test.tsx`), verifierat orört på develop, byggdes inte
om. Kvar: AC#1 (visuellt lås) + AC#3 (deadline-tydlighet grupp + bracket).

**AC#1, omisskännlig GRÅMARKERING av låst kupong (visuellt):** den funktionella låsningen (fält
disabled via `fieldset disabled={locked}`, ingen spara-knapp, låst-etikett "Tipset är låst") +
tids-ticken (`use-deadline-tick`, ett öppet kort blir låst när avspark passerar, redan testat
T15) fanns. Det SAKNADE var att kortet inte LÄSTES som låst, den gamla låst-stilen tonade bara ner
gulden en aning. Beslut: `.vm-coupon-card[data-*-locked]` (tokens.css §10) byter nu HELA fonden till
en NEUTRAL grå yta (grått surface-tint på 8% fg, neutral radial i stället för guld, neutral kant +
topplist, en svag `saturate(0.85)`), så låst != aktiv är omisskännligt. Filtret verkar på HELA
kortet inklusive texten (copilot R1/R2-sanning): det är enbart en mättnadssänkning, ingen
opacity/ljushets-ändring, så textens luminans-kontrast påverkas försumbart och AA är uppmätt
kompositerat med filtret aktivt i båda teman.
Gäller alla tre kupong-typerna (match/grupp/bracket-slot) via samma data-attribut, en
sanning. Champion-hero:n (egen `.vm-champion-hero[data-bracket-prediction-locked]`) har kvar sin egen
hjälte-låst-stil (den är inte en `.vm-coupon-card`).

**AC#1, visuell finish (design-frontend):** två justeringar lyfte "låst"-läsningen från "en aning
dämpad" till omisskännlig på en armlängds avstånd, verifierat live i båda teman + på vikbar-cover-bredd
(265px, ingen overflow): (1) tinten höjd 6% -> 8% fg så kort-KROPPEN läser grå, inte "nästan surface";
(2) den streckade RIVER-perforeringen, den sista starka guld-signalen, neutraliseras till en grå
streck-linje i låst läge (`.vm-coupon-card[data-*-locked] .vm-coupon-tear`), för en `saturate(0.85)`
ensam lämnar gult tydligt gult och den gyllene linjen drog ögat lika starkt som på ett öppet kort.
HELHETEN är medvetet TVÅDELAD: de grå låsta kupongerna (formulär-ifyllningar, "inlämnat") står mot
den VARMT guldhållna champion-hero:n (firande, "trädets krona avgjord"), en hierarki, inte en
inkonsekvens, eftersom de bär samma hänglås + lås-notis-signatur men hero:n förtjänar sin värme.

**AC#3, deadline-radens TON (design-frontend):** hänglås-glyfen i `DeadlineNotice` bär nu radens
dämpade `text-fg-muted`-ton (var warning-amber), så raden läser som en vänlig UPPLYSNING ("bra att
veta NÄR det låses"), inte en VARNING, warning-amber drog ögat som ett larm. Den exakta TIDEN
(`<time>`, `text-fg` semibold) är det enda som lyfts. Medveten kontrast mot det POST-lås amber-
hänglåset i lås-notisen (det ÄR låst nu): pre-lås heads-up = lugn muted, present locked = etablerad
varm lås-signatur. AA-uppmätt (canvas-komposit på kupong-ytan, båda teman): muted glyf/relativ-text
6.52:1 (ljust) / 7.5:1 (mörkt), tid-texten 17.9:1 / 15.2:1, alla >= 4.5:1 (normal text).

**AC#3, deadline-budskap ur den VERIFIERADE modellen (HARD, gissa aldrig, källhänvisad):** Daniel sa
"deadline till söndag", men deadline-modellen får INTE gissas. Verifierad 1:1 mot RLS-migrationerna
(det FAKTISKA låset, inte en klient-gissning):
  - **Grupp-tips:** `group_deadline_kickoff(group_id)` = kickoff för gruppens FÖRSTA match `g-X-1`
    (`20260611130100_t16_group_predictions_rls.sql:29-39`). Per-grupp, inte globalt.
  - **Bracket-slot:** `bracket_deadline_kickoff(slot_id)` = slottens EGEN avspark (M73..M104).
  - **Champion:** `bracket_deadline_kickoff('champion')` = `g-A-1` (turneringens första match =
    turneringsstart) (`20260611130300_t16_bracket_predictions_rls.sql:28-37`).
  I ALLA tre fallen är deadlinen en MATCH-AVSPARK, alltså en exakt tidpunkt, inte en veckodag. Vi
  kommunicerar den exakta tiden ("Tippningen låses torsdag 11 juni kl 21:00 · om 3 dagar"), inte en
  gissad söndag. **Källa:** ovan nämnda RLS-migrationer + decisions.md T16 §4 (deadline-lås).

**EN SANNING (HARD, ingen hårdkodad text-dubblett av en tid):** budskapet härleds ur SAMMA
`deadlineIso` som driver `locked` i selektorerna (`group-predictable-data.ts` / `bracket-predictable-
slots.ts` räknar redan ut `deadlineIso` ur ankar-matchen och `locked = now >= deadlineIso`). Ny REN
`formatDeadline(deadlineIso, now)` (`src/features/predictions/format-deadline.ts`) + presentations-
komponent `DeadlineNotice` formaterar exakt det ankaret i svensk tid (återanvänder daily-lagrets
`formatKickoffTime`/`formatDayHeadingNoYear`/`localDateKey`, off-by-one-säkert). Låset och texten kan
därför aldrig drifta isär, är de olika är det samma ISO som är fel på båda. Visas bara i ÖPPET läge
(i låst läge säger låst-etiketten redan "låst"). Fail-safe: null-deadline (saknad ankar-match) -> ingen
rad (samma fail-safe som låset). Tester vaktar gränsen (now exakt på deadline -> "idag") + midnatt-
randfallet (svensk kalenderdag, inte rå < 24h) + att en låst slot inte visar den öppna deadline-raden.

---

## 2026-06-11 , T34 (#62): "Så funkar poängen", en delad förklaring vid tippningen + topplistan

Daniels huvudkrav: TYDLIGHET, en synlig, inbjudande förklaring av poängen där man tippar OCH vid
topplistan, i enkelt språk. Poäng-skalan är LÅST och live (T49), denna task ändrar INGA tal.

**Beslut, EN komponent monterad på TVÅ ställen (inte sektion + länk):** förklaringens innehåll är
identiskt på båda ytorna. En delad `ScoreGuide` (`src/features/scoring-guide/`) monteras i tips-vyns
header (`PredictionsView`) OCH vid topplistan (`LeaderboardSummary`). Varför inte "en sektion + länk
till den": i en router-lös PWA blir en länk en scroll-/flik-navigering och ger en asymmetrisk
upplevelse (förklaringen "bor" i en vy, den andra pekar dit). En delad komponent ger i stället EN
sanning för texten (kan aldrig drifta mellan ytorna) och samma upplevelse på båda, samma KISS-val som
"modal, inte routad vy" (T10). En `surface`-prop ger varje mount-punkt egna test-/styling-krokar:
fasta attributnamn med ytan som VÄRDE (`data-score-guide-open="tips"` respektive `"topplista"`,
samma form för `-overlay`/`-dialog`/`-close`), och en id-saniterad form av `surface` används i
dialogens aria-id:n (IDREF tål inte whitespace). Samma mönster som ExpandToggle:s `name`.

**Talen HÄRLEDS ur konstanterna (HARD-krav, ingen hårdkodad dubblett):** `buildScoreExplainer`
(`score-explainer-items.ts`) läser `PREDICTION_POINTS` (3/1), `GROUP_PREDICTION_POINTS` (3/2),
`BRACKET_ROUND_POINTS` (intervallets min-max, härlett, inte hårdkodat "1-5") och
`CHAMPION_PREDICTION_POINTS` (20) ur `src/data/predictions`. UI:t innehåller inga egna siffror.
Mutations-vakt: `score-explainer-items.test.ts` + `ScoreGuide.test.tsx` jämför mot KONSTANTERNA (inte
mot förväntade litteral-siffror), så en skala-ändring slår igenom på både förväntan och renderad text,
och en hårdkodad siffra skulle rödna. Källa till varje tal: score.ts (match) + bonus-score.ts
(grupp/bracket/champion), bekräftbar inline vid varje rad.

**Ersatte T46:s lokala legend (DRY + sanning):** `LeaderboardSummary` hade en egen `ScoreLegend`
(T46/#79) som (a) HÅRDKODADE "3 p / 1 p / 0 p", (b) bara täckte match-poängen, och (c) felaktigt
utlovade special-tips som "snart kommer", fast de nu är live (T49). Den ersattes av `ScoreGuide`, som
täcker hela skalan med tal ur konstanterna. Den oanvända CSS-haken `vm-board-legend` /
`data-leaderboard-score-legend` (aldrig stylad) togs bort, inget dött spår lämnas.

**Modal-primitiv (rule-of-three, kort #56):** `ScoreGuide`-dialogen är nu den FJÄRDE handrullade
a11y-dialogen med identiskt kontrakt (TeamProfilePanel T10, OnboardingDialog T13, SettingsControl T32,
denna). Kontraktet (role=dialog, aria-modal, Escape, klick-utanför, fokus in/ut, fokus-fälla, portal
till body, reduced-motion-grind) är medvetet KOPIERAT i denna task, inte lyft till en delad `<Modal>`,
för att inte bygga abstraktionen på spek och röra tre testade filer i en förklarings-task. Att
tröskeln nu passerats flaggas till dirigenten som en egen refaktor-task (se handoff Improvement).

---

## 2026-06-11 , T50 (#86): kort visningsnamn (shortName) för trånga ytor

Daniels live-feedback: "Bosnien och Hercegovina" (grupp B) tryckte ihop grupptabellens övriga
kolumner. Lösningen är GENERELL, inte en hårdkodad specialregel i komponenten: ett VALFRITT
`shortName`-fält på `Team` (`src/domain/types.ts`), satt i lag-datan (`src/data/wc2026/team-refs.ts`).
Default är `name`, så bara lag vars fulla namn är för långt sätter en kortform.

**Regel + en sanning:** fallback-regeln (`shortName ?? name`) bor i `teamShortName`
(`src/domain/team-name.ts`), så de trånga ytorna importerar samma regel i stället för att
upprepa `?? name`.
Trånga ytor som visar kortformen: grupptabellen (`GroupTable`), matchkortet + slutspelsträdet (båda
via `teamDisplayName` i `src/features/daily/match-display.ts`). Det FULLA namnet står kvar i
lagprofilen (`TeamProfilePanel`, hero-rubriken) där utrymmet finns, SPEC-andan "fullt där det ryms".

**Källa till kortformen (gissas inte):** det fulla `name` är fortfarande den verifierade lottnings-
datan (oförändrad). "Bosnien" är den vedertagna svenska kortformen för Bosnien och Hercegovina
(svenskt vardagsbruk för landet). Det är ENDA laget bland VM 2026:s 48 vars namn är så långt att en
kortform behövs (övriga ryms i de trånga ytorna), test-vaktat i `teams.test.ts` (listan med shortName
== `['BIH']`), så ett framtida långt lagnamn måste läggas till medvetet, inte smyga in ohanterat.

---

## 2026-06-11 , T49 (#84): VM-vinnar-poängen höjd 8p -> 20p

`CHAMPION_PREDICTION_POINTS` (`src/data/predictions/bonus-score.ts`) ändrad från 8 till **20**.

**Beslut + källa (gissas inte, det är ett VAL inte en härledd regel):** Daniels poäng-beslut inför
delning (pre-share). Mästar-tipset ska väga tydligt tyngst, det är turneringens svåraste enskilda
gissning (1 lag av 48, blint före första matchen). 20 valdes för att matcha match-skalan rent:
exakt match = 3p, så 20 motsvarar dryga 6 exakta matcher, en kännbar men inte absurd tyngd. Daniel
SÄNKTE från sitt ursprungliga 50 just för att hålla skalan rimlig mot 3p-matcherna. Invarianten
"mästaren väger tyngst" (> djupaste bracket-rundan, 5p) gäller fortfarande och är test-vaktad.

**Påverkan (allt uppdaterat så inget driftar):** konstanten + dess VARFÖR-kommentar (bonus-score.ts),
poängregel-headern i samma fil, testerna i `bonus-score.test.ts` (konstant-assertion 8 -> 20) och
`aggregate-scores.test.ts` (summa-testet OMRÄKNAT 17 -> 29: 3+5+1+20), poäng-raden ovan (punkt 3 i
T16-blocket), `supabase/README.md` (poängregel-noten) och kommentaren i T16-bracket-schema-migrationen
(ren beskrivande kommentar i en redan applicerad migration, ändras bara för att doc:en ska vara sann,
DB-tillståndet rörs inte). Special-tips-UI:t (T16b) visar ingen poäng-siffra för mästaren, så ingen
UI-copy behövde ändras.

---

## 2026-06-11 , T48 (#81, skärpning + Copilot R2): DOLD arrangörs-ingång + rums-byte väver inte om i live

Två efterföljande ändringar ovanpå T48-blocket nedan (samma branch/PR), drivna av Daniels skärpta
krav och ett Copilot-fynd.

**1. ARRANGÖRS-INLOGGNINGEN ÄR NU HELT DOLD (ERSÄTTER den DISKRETA `<details>`-ingången i punkt 4
nedan):** Daniels skärpta krav inför delning var "inloggningen ska de inte se", inte bara dämpa den.
Den synliga `<details>`/`<summary>`-ingången ("Är du arrangör? Logga in") togs därför BORT ur icke-
admin-vyn; en vanlig vän möts nu BARA av den lugna read-only-noten. AdminLogin renderas i stället bara
när URL:en bär ett hemligt fragment (`#arrangor`), läst via en liten hook `useOrganizerEntry`
(`src/features/admin/use-organizer-entry.ts`) som följer `hashchange` så Daniel kan skriva in fragmentet
UTAN reload (samma window-event-mönster som `use-online-status`). **VARFÖR detta är OK säkerhetsmässigt:**
det är REN UX-diskretion, INGEN säkerhetsgräns , skyddet ligger i RLS/app_admins (T42, RLS-bevisat): den
som hittar/gissar fragmentet kan ändå inte bli admin utan att finnas i app_admins. Fragmentet behöver
alltså inte vara hemligt för säkerheten, bara för att hålla ytan undan för otekniska vänner. AdminLogin-
MEKANIKEN (updateUser/verifyOtp, onUpgraded->refresh) är OFÖRÄNDRAD, bara dess synlighets-villkor är nytt.
En riktig recoverable sign-in är fortfarande T48b. Test: icke-admin UTAN fragment ser INGEN login-
affordans (negativ kontroll på texten), MED fragment (eller efter en `hashchange`) ser AdminLogin, admin
ser AdminResultEntry som förr. **Källa:** Daniels skärpta task-direktiv T48 ("inloggningen ska de inte se").

**2. RUMS-BYTE I LIVE VÄVER INTE OM I ONÖDAN (Copilot R2):** facit-källan är
`live ? officialResults : sharedResults` (se punkt 1 i T48-blocket nedan), så det aktiva rummet driver
facit BARA i fixtures-läge. Reweave-effekten i `ResultsProvider` gatade tidigare på `roomChanged` oavsett
läge, så ett rent rums-byte i LIVE körde en omvävning trots att facit-källan (de globala officiella
resultaten) är OBEROENDE av rummet. Fix: `roomChanged` gatas nu på `!live` (rum-bytet är facit-relevant
bara i fixtures), så ett rums-byte i live aldrig kan trigga en omväving. Beteendet i fixtures är
oförändrat (byter man rum byter facit och vi väver om). Test (`reweave-on-room-change.test.tsx`) låser det
FAKTISKA invariantet via referens-identitet på `store.matches` (ingen reweave = samma referens; reweave =
ny referens), och håller käll-referenserna stabila så bara rum-bytes-grenen kan trigga, verifierat rött
mot den ogatade koden. **Källa:** Copilot-review R2 på PR #83.

---

## 2026-06-11 , T48 (#81): pre-share-städning, facit-källbyte + admin-gatad inmatning + diskret login

Daniels pre-share-blockerare inför delning med otekniska vänner: (1) resultat-inmatningen syntes
för ALLA och vem som helst i rummet kunde ändra de delade resultaten, (2) arrangörs-inloggningen
såg prominent ut (oroade fast RLS skyddar), (3) grupptabellerna drevs av rums-/lokal-inmatning, inte
av Daniels officiella facit (T42). Tre kärn-ändringar, alla med en TYDLIG fixtures-vs-live-gräns så
lokal utveckling + simulering + befintliga tester är oförändrade.

**1. FACIT-KÄLLAN FÖR LIVE-TRACKERN BYTER (keystone, tävlingsintegritet):** `ResultsProvider` (T6,
den delade store som GroupStageView/BracketView/ScenarioView härleder ur) vävde tidigare in RUMMETS
delade resultat (`room_match_results`, vem som helst i rummet kunde skriva) via `applyRoomResults`.
Nu väljs facit-källan på `mode` (en sanning, samma `getDataSourceMode` som datakälle-märkningen):
- **LIVE-läge:** de GLOBALA officiella resultaten (`useOfficialResultsSync().officialResults`,
  `official_match_results`, BARA admin kan skriva, RLS-bevisat T42), så ALLA ser samma riktiga
  ställning Daniel matar in.
- **FIXTURES/lokalt:** rummets delade resultat (OFÖRÄNDRAT), så lokal utveckling + simulering +
  alla befintliga T14-tester driver tabellerna som förr.
VÄVNINGEN är OFÖRÄNDRAD: `OfficialMatchResult` är strukturellt identisk med `RoomMatchResult`, så
bara KÄLLAN (`facitResults = live ? official : room`) byts, inte den rena `applyRoomResults` (DRY,
samma val topplistan redan gjorde i T42, se `use-leaderboard-data.ts`). Konsekvens: i live-läge
skriver `submitResult` INTE längre till `room_match_results` (gatad på `!liveRef`); admin matar in
officiellt facit via AdminResultEntry (`saveOfficialResult`), inte via denna väg. `room_match_results`
behålls i schemat men är nu helt utfasad för facit (jfr T42-beslutet). **Bevis (det STARKA invariantet,
lessons `uttommande-test-vaktar-svagare-invariant`):** `official-facit-source.integration.test.tsx`
matar BÅDA källor samtidigt med OLIKA värden för samma match och bevisar att official (5-0) vinner i
live och rummets (1-1) i fixtures , ett test som bara matade EN källa skulle inte skilja "läser
official" från "läser room".

**2. RESULTAT-INMATNINGEN (ResultEntryView) GATAD I LIVE TILL "TÄNK OM":** ren regel
`shouldShowResultEntry(live, simulating)` + tunn wrapper `ResultEntryGate`. FIXTURES: visa alltid
(oförändrat). LIVE: visa BARA när simulering är PÅ , annars dold för ALLA, även arrangören (Daniels
feedback F2). Skälet: i live matas de OFFICIELLA resultaten in via den dedikerade `AdminResultEntry`
(AdminSection); att också visa den lokala ResultEntryView vid sidan om gav admin TVÅ inmatnings-ytor
("vilken är den riktiga?"). En sanning för officiell inmatning = admin-formen; den lokala vyn är
renodlat "tänk om". Regeln bor i en EGEN modul (`result-entry-gate-rule.ts`) skild från komponenten
så ResultEntryView förblir en REN, fristående-testbar vy (renderas i fixtures-paritetstester utan
facit-lager) och react-refresh-regeln hålls ren. Uttömmande testad (regel: 4 fall; komponent: 3).

**3. SIMULERING (T12) vs OFFICIELL INMATNING , den rena avgränsningen:** simuleringen ÅTERANVÄNDER
ResultEntryView som sin "tänk om"-input (samma `submitResult`-seam, men i sim-läge går skrivningen till
sim-OVERLAYN, ALDRIG till DB, redan så i ResultsProvider). Därför löser gate-regeln #4 rent: en vanlig
vän i live-läge ser INGEN delad/officiell inmatning, MEN kan starta what-if-leken (SimulationBanner är
kvar öppen för alla) och då dyker ResultEntryView upp INUTI SimulationFrame (violett ram + sticky
"Simuleringsläge"-badge), tydligt märkt som hypotetiskt. Utanför sim-läge döljs den helt. Ingen ny
sim-input byggdes; avgränsningen är "var skrivningen tar vägen" (overlay vs official), som redan fanns.

**4. ARRANGÖRS-INLOGGNINGEN BLIR DISKRET:** den prominenta `<AdminLogin>`-rutan i icke-admin-vyn tuckas
bakom en inbyggd, tillgänglig `<details>`/`<summary>`-utfällning ("Är du arrangör? Logga in"), STÄNGD
som standard. Den EXISTERANDE e-post-mekaniken (updateUser/verifyOtp) är OFÖRÄNDRAD, bara gömd , en
riktig recoverable sign-in är separat (T48b). `<details>` ger tangentbord + skärmläsar-stöd utan extra
aria-plumbing.

**OMFATTNING vs issue #81 (Copilot R1):** T48 levererar AC #1 (resultat-inmatning gatad) + #2 (officiella
resultat driver tabellerna) + den DISKRETA inloggningen. Issue #81:s AC #3 efterfrågar en RECOVERABLE
OTP/magic-link-inloggning (`signInWithOtp`) , den är medvetet UTBRUTEN till **T48b** (separat PR), så
T48-PR:en "Closes" INTE #81. Issue #81 hålls öppen tills T48b mergats; då stängs den.

**Bevarat:** T46 poäng-presentation, tippning + deadline-sekretess (RLS + klient-gate), TeamCode-
kontraktet (T16, orört , samma `applyRoomResults`/`derivePoolFacit`), auto-update-hotfixen (vite.config
+ register-sw, ej rörd). Premium-design på admin/gate-ytan lämnas till design-frontend (samma arbets-
delning som T42/T16). **Källa:** Daniels task-direktiv T48 (#81) + T42-beslutet i denna logg (official
results = facit, RLS-bevisat) + patterns.md `global-admin-gatad-facit` / `inmatning-mot-delad-store`.

## 2026-06-11 , T46 (#79): resultat-presentation (VARFÖR per tips + sammanfattning överst)

Daniels pre-share-blockerare: man måste skrolla hela vägen ner för att se sina poäng, och
avslöjande-vyn visar bara en siffra utan att förklara VARFÖR. Tre tillägg ovanpå T17, ingen
ny poäng-regel (match-värdena 3/1/0 är OFÖRÄNDRADE, PREDICTION_POINTS, score.ts).

**1. POÄNG-TYPEN ('exact' | 'outcome' | 'miss') ÄR SAMMA SANNING SOM SIFFRAN (en regel, två
vyer):** `score.ts` fick `pointTypeOf(predicted, actual)` som härleder etiketten, och
`scorePrediction` slår nu upp poängen ur `PREDICTION_POINTS[pointTypeOf(...)]`. Så siffran och
"varför"-texten kan ALDRIG drifta isär, en ändring av regeln slår igenom på båda. Avslöjande-vyn
(RevealView) visar nu en SYNLIG orsak bredvid poängen ("Exakt resultat +3" / "Rätt vinnare +1" /
"Miss 0"), driven av `pick.pointType` (reveal.ts härleder den ur SAMMA facit som `points`), inte
av en egen tröskel mot poäng-talet. **Detta ERSÄTTER T17-visuellts derivering ur `pick.points`**
(den raden i denna logg, T17-visuellt, beskriver det gamla `outcomeFor(points)`-uppslaget; T46 är
nu sanningen). Uttömmande test bevisar att `PREDICTION_POINTS[pointTypeOf] === scorePrediction`
för alla utfallspar (det STARKA invariantet, inte bara att etiketten ser rimlig ut).
**Källa:** poängregeln SPEC §4/§12 + decisions.md T15-beslutet (3/1/0); etiketterna är ren
omformulering av samma regel, inte en ny domän-regel.

**2. SAMMANFATTNING ÖVERST (egen poäng + placering):** en HÄRLEDD vy av topplistan
(`deriveSelfSummary(leaderboard, currentUserId)`), inte en ny poäng-källa, så den kan aldrig
drifta från listan. Aktuell användares id kommer ur `store.currentUserId` (= `rooms.userId`,
den anonyma auth-sessionen, T14), samma seam som "du"-framhävningen i listan. Fail-safe: null
identitet ELLER id ej i listan -> ingen panel (hellre tyst än en gissad rad), samma anda som
"du"-markeringen. Placeringen speglar DELAD rank troget (rank, inte radindex). Topplistan (full
lista) är KVAR längst ned (oförändrad).

**3. "SÅ FUNKAR POÄNGEN":** kort `<details>` med 3p exakt / 1p rätt vinnare / 0p miss, och NÄMNER
att special-tips (gruppvinnare, VM-vinnare) kommer ge poäng. Special-tips-wiring (champion-poäng,
pool-tips-inmatnings-UI) är SEPARAT kommande task (T47), därför nämns de bara, inga poängvärden
utlovas som inte är wirade.

**ARBETSDELNING (samma som T15/T16/T42):** funktionell + tillgänglig bas här (stabil semantik +
data-attribut `data-leaderboard-self-summary/-score-legend/-reveal-reason`, `vm-board-self-summary`/
`vm-board-legend`-klasser som seam), premium-finish + estetik -> design-frontend. Inga stabila
statusfärger inbakade (T7-pin); poäng-text behåller T17:s warning/fg-muted-hakar.

## 2026-06-11 , T42 (#72): admin-UI (funktionell bas) + T42b-split + Behöver-Daniel

**UI-DISPOSITION (funktionell bas här, premium-design -> T42b, samma som T16/T16b):** admin-sektionen
(`src/features/admin/`) byggdes som den FUNKTIONELLA + tillgängliga basen (stabil semantik + data-
attribut som seam), gatad på live-läge precis som tips-/topplistesektionerna:
- **AdminLogin:** diskret arrangörs-inloggning (e-post -> 6-siffrig kod -> bekräfta). Delar facit-storens
  klient/session (`store.client`) så uppgraderingen syns direkt; `onUpgraded` -> `store.refresh()`
  laddar om admin-status så vyn växlar till inmatningen utan sidladdning.
- **AdminResultEntry (BARA admins):** välj match + mål (+ status, + straffar för avgjort slutspel),
  validerat med T6:s RENA `validateResultEntry` (samma regler som lokal inmatning, DRY), sparar till
  GLOBAL facit via `saveOfficialResult`. Bara matcher med BÅDA lag kända är valbara (gissa aldrig laget).
- **Icke-admin:** read-only-not ("resultaten matas in av arrangören ... poängen räknas ut åt dig") +
  den lågmälda arrangörs-inloggningen. Simuleringen (T12) är OFÖRÄNDRAD och öppen för alla.

**TILL T42b (premium-design, ej kärna):** arena-estetiken på admin-läget, en rikare facit-/match-lista
(t.ex. 3-dagars fönster som resultatinmatningen), och inmatnings-finishen. Kärnan (datamodell, RLS,
RLS-bevis, poäng-källbyte, auth, funktionell admin-bas) är KLAR och testad här. Inget pinnat i kärnan.

**BEHÖVER DANIEL (dashboard, blockerar INTE koden):**
1. **6-siffrig kod i mejlet:** för att admin-inloggningens KOD-väg (verifyOtp, in-page) ska funka måste
   e-postmallen "Change email address" innehålla `{{ .Token }}` (Supabase Dashboard -> Authentication ->
   Email Templates). Utan den skickas bara en länk (som också funkar via detectSessionInUrl + en
   allowlistad redirect-URL, men kod-vägen är enklare). EN gång.
2. **E-post-sändning (free tier):** Supabase free tier har en INBYGGD, hårt rate-limitad sändning (några
   mejl/timme, avsedd för test). För pålitlig admin-inloggning kan Daniel koppla en egen SMTP
   (Dashboard -> Authentication -> SMTP Settings). Räcker ofta med inbyggda för Daniels enstaka inloggning.
3. **Redirect-URL (bara om länk-vägen används):** lägg `https://vm-2026.pages.dev` i Auth -> URL
   Configuration -> Redirect URLs om magic-LÄNKEN (inte koden) ska kunna klickas. Kod-vägen kräver inte detta.

Daniels admin-roll är REDAN seedad på hans nuvarande user_id (stabilt över e-post-länkningen, se §5),
så facit-skrivningen funkar direkt efter hans första inloggning.

## 2026-06-11 , T42 (#72): GLOBAL facit + admin via e-post (TÄVLINGSINTEGRITET, HÖG-RISK)

Daniels beslut: BARA admin (Daniel) matar in de officiella matchresultaten EN gång, och de gäller
för ALLA rum och ALLA användare. Tidigare var facit per-rum (`room_match_results`, vem som helst i
rummet kunde skriva), vilket bröt tävlingsintegriteten. Sex modell-/säkerhets-beslut, alla
källverifierade och RLS-bevisade.

**1. DATAMODELL (global facit, ingen room_id):** ny tabell `official_match_results` (`match_id` PK,
`home_goals`/`away_goals` smallint >= 0, `penalties_*`, `status`, `updated_by`, `updated_at`). INGEN
`room_id` , facit är ETT, delat av alla. `match_id`-formatet är SAMMA källverifierade constraint som
`room_match_results` + `match_kickoffs` (`^(g-[A-L]-[1-6]|M(7[3-9]|8[0-9]|9[0-9]|10[0-4]))$`, en
sanning för id-rymden, 72 gruppmatcher g-A-1..g-L-6 + 32 slutspel M73..M104). Straffar-constrainten är
den STRIKTA paired-formen (T14 C1: en CHECK passerar på TRUE eller NULL, så båda måste vara NOT NULL,
annars läcker ett halvt par in). Migration: `20260611140000_t42_official_results_admin_schema.sql`.

**2. ADMIN-ALLOWLIST + helper:** ny tabell `app_admins` (`user_id` PK) + RLS-helper `is_app_admin()`
(SECURITY DEFINER, `search_path=''`, EXECUTE för anon/authenticated). Samma härdning som
`is_room_member` (T14): definer-läge så policyn kan fråga `app_admins` utan att fastna i RLS, och
EXECUTE krävs för anon/authenticated eftersom RLS-uttryck evalueras i ANROPARENS roll (T14, empiriskt).

**3. RLS (källan till skyddet, gissas inte):** `official_match_results` SELECT = `using (true)` (facit
är OFFENTLIG fakta, alla ser den UTAN rum-medlemskap, till skillnad från `room_match_results`).
INSERT/UPDATE/DELETE = `is_app_admin()`, och INSERT/UPDATE `with check` binder `updated_by =
auth.uid()` (en admin kan inte signera i en annan admins namn, samma anti-förfalskning som T14:s
`rmr_insert_member`). `app_admins`: SELECT bara sin egen rad (`user_id = auth.uid()`, klienten kan visa
admin-läget utan att rad-skanna listan), INGEN skriv-policy => RLS default-deny på skriv => ingen kan
befordra sig själv (hela tävlingsintegriteten hänger på det). Migration:
`20260611140100_t42_official_results_admin_rls.sql`.

**4. RLS-BEVIS med RIKTIGA roller FÖRE klient-koden (playbook `rls-bevis-med-riktiga-sessioner-fore-
klient-koden` + `tidslas-och-sekretess-i-rls`):** kört som EN transaktion (DO-block + `set local role`
+ `request.jwt.claims` med `sub`/`role`) mot det levande projektet, sedan ROLLBACK (noll proof-data
kvar, verifierat: 0 facit-rader / 0 admin-rader efter). En admin-test-user lades tillfälligt i
`app_admins`. BEVISAT (9/9):
- admin INSERT facit -> TILLÅTEN; admin UPDATE facit -> TILLÅTEN.
- admin försöker sätta `updated_by` = annans id -> NEKAD (`with check`, "violates row-level security").
- icke-admin INSERT facit -> NEKAD; icke-admin UPDATE av admins rad -> 0 rader berörda (USING blockar).
- icke-admin SER facit -> 1 rad; ANON (anon-roll, ingen jwt) SER facit -> 1 rad (SELECT öppen).
- icke-admin försöker befordra sig själv (INSERT app_admins) -> NEKAD (ingen skriv-policy).
- icke-admin SELECT på app_admins -> 0 rader (ser inte andras admin-rad, select_self).

**5. ADMIN-IDENTITET (e-post magic-link, anonym uppgradering):** admin loggar in via e-post-magic-link
/ OTP. Daniel UPPGRADERAR sin BEFINTLIGA anonyma session med `supabase.auth.updateUser({ email })`, som
LÄNKAR en e-postidentitet till SAMMA user-rad , user_id ändras INTE, så Daniels user_id
(`f4ab8398-d061-47ff-b152-4ed1eebbaf2e`) OCH hans 85 tips (FK på user_id) BEHÅLLS. Källa: Supabase
"Anonymous Sign-Ins -> Convert an anonymous user to a permanent user"
(https://supabase.com/docs/guides/auth/auth-anonymous). Eftersom id:t är stabilt över länkningen
seedas Daniels admin-roll REDAN nu på det anonyma id:t (migration
`20260611140200_t42_seed_daniel_admin.sql`, idempotent), så facit-skrivningen funkar direkt efter
hans första magic-link-inloggning. Vanliga användare rör INTE detta (förblir anonyma, bara tippar).

**6. POÄNG-KÄLLAN BYTER (facit-källa) + `room_match_results`-ödet:** topplistan/avslöjandet/
resultat-feedback poängsätter nu mot GLOBALA `official_match_results` i stället för per-rum
`room_match_results`. `derivePoolFacit` (T17) är ÅTERANVÄND oförändrad i sin logik, bara FACIT-KÄLLAN
(matchlistan den får) byts: leaderboard-hooken väver nu in de GLOBALA officiella resultaten
(`applyRoomResults` återanvänd, döpt i kontext, samma rena vävning) i stället för rummets. TeamCode-
kontraktet (id->code vid facit-källan, T16 F1) är ORÖRT (samma `derivePoolFacit`). `room_match_results`
BEHÅLLS i schemat (raderas inte) , dels för historik, dels för att simuleringen (T12, klient-overlay)
inte rör DB:n alls. Den FASAS UT för facit-syftet (resultatinmatningen blir admin-only, se UI). Den
enda befintliga raden i produktion var en `scheduled` 0-0-platshållare (g-A-1) i ewrmdt, inget facit
att migrera. **Behöver Daniel (dashboard):** se "Behöver Daniel"-raden nedan om e-post-SMTP-sändning.

---

## 2026-06-11 , T43 (#74): PWA-uppdatering via prompt + bygg-version-stämpel

**Beslut (uppdaterings-modell):** registerType bytt från `'autoUpdate'` till **`'prompt'`** i
`vite.config.ts`, och `injectRegister: 'auto'` -> **`null`** (vi registrerar SJÄLVA via
`virtual:pwa-register` i `register-sw.ts`). En ny service worker INSTALLERAS men VÄNTAR; appen visar
en diskret "Ny version finns, ladda om"-prompt (`UpdatePrompt`) och användaren tar den i bruk med ETT
klick (`updateSW(true)` -> SW:n får `SKIP_WAITING`-meddelandet, aktiverar och laddar om).
**Varför:** roten till tasken var att användares enheter fastnar på en GAMMAL cachad version (PWA SW)
och det ser ut som buggar. `autoUpdate` ensamt kan dessutom rycka undan vyn med en tyst omladdning mitt
i något. `prompt` ger användaren ETT klick att uppdatera utan att fastna, och utan oväntad omladdning.

**Källhänvisat (regel som lätt gissas fel):** med `registerType: 'prompt'` sätts INTE workbox
`skipWaiting: true` / `clientsClaim: true`. skipWaiting skulle aktivera den nya SW:n DIREKT och kringgå
prompten (då blir det de facto auto-update, och `onNeedRefresh` slutar fyra pålitligt). I prompt-läget
är det användarens klick som posterar `SKIP_WAITING` och laddar om, dvs takeovern sker direkt VID
klicket, inte först när alla flikar stängts. Verifierat i det genererade `dist/sw.js`: en
`message`-lyssnare som anropar `self.skipWaiting()` BARA på `SKIP_WAITING`, inget ovillkorligt
skipWaiting/clientsClaim. **Källa:** vite-plugin-pwa-dokumentationen (guide "Prompt for new content
refreshing" + frameworks/index: registerType 'prompt' kräver manuell `registerSW`-import med
`onNeedRefresh`/`onOfflineReady`; klicket anropar `updateSW()`).

**Testbarhet (T43-krav):** `virtual:pwa-register` löses bara i ett Vite-bygge (otestbart i Vitest). All
uppdaterings-LOGIK ligger i `use-app-update.ts` med en INJICERBAR registrerare (`RegisterAppSw`);
`register-sw.ts` är en tunn seam som bara importerar den virtuella modulen. Hela hooken testas mot en
fake-register som fyrar callbacks. App-mount-testerna mockar `virtual:pwa-register` globalt (setup.ts).

**Beslut (version-stämpel):** commit-SHA (kort, 7) + byggtid (ISO/UTC) injiceras som Vite-`define`
(`__APP_SHA__`, `__APP_BUILT_AT__`) och visas på en diskret rad i footern (`VersionStamp`,
`data-app-version`). SHA:n löses i en prioritetsordning: **`CF_PAGES_COMMIT_SHA`** (Cloudflare-bygget,
auktoritativ i produktion) -> `git rev-parse HEAD` (lokalt) -> `"unknown"` (gissar aldrig).
**Källa för Cloudflare-variabeln:** Cloudflare Pages "System environment variables"
(`CF_PAGES_COMMIT_SHA` sätts av plattformen i varje Pages-bygge). Detta löser framtida "är det live?"-
förvirring: live-versionen kan jämföras mot develop-HEAD. Regeln + fallbacken bor i den rena, testbara
`build-info.ts`; Node-läsningarna (git, `process.env`) i `vite.config.ts`.

**Beslut (ingen @types/node):** bygg-tids-koden i `vite.config.ts` behöver `process.env` +
`node:child_process`, men hela `@types/node` LÄCKER Node-globaler (t.ex. `NodeJS.Timeout`) in i
APP-projektet via vitest-typerna och bryter browser-typningen av `window.setTimeout` (number vs Timeout)
på orelaterad kod (RoomPanel). I stället en SMAL ambient-deklaration `build-env.d.ts` som bara
deklarerar de Node-ytor bygget faktiskt rör, inkluderad ENBART i `tsconfig.node.json`.

**Cloudflare-deploy-pipeline (verifierad, ingen flagga):** produktionen auto-deployar från `develop`
via Cloudflare Pages git-integration (`docs/deploy.md`), så den nya SW:n + version-stämpeln rullar ut
automatiskt när PR:en mergas till `develop`. Inga tecken på fördröjd/utebliven trigger i repots
konfiguration (CI gör bara kvalitetsgrinden, deployen ägs av Cloudflare-dashboarden). Cloudflare-
konfig orörd (utanför repots kontroll, PRINCIPLES §7).

**Fail-loud vid misslyckad SW-registrering (#74, Copilot C3):** `registerAppSw`-catchen sväljde
tidigare felet TYST, så en felkonfig (saknad/oladdbar `virtual:pwa-register`, inget SW-stöd där det
förväntas) skulle göra cache-/uppdaterings-problemet osynligt igen , precis det tasken löser. Nu loggas
felet med `console.warn('[VM2026] ...')` (samma fail-loud-men-inte-fatalt-kontrakt som
`src/lib/safe-storage.ts`): en misslyckad registrering kraschar ALDRIG appen (den renderas vidare utan
offline/uppdaterings-prompt) men blir SYNLIG i konsolen. Modul-importören är nu ett injicerbart andra
argument till `registerAppSw` (default = riktiga importet) enbart för att göra catch-grenen testbar
(`register-sw.test.ts`) utan att den virtuella modulen behöver lösas i Vitest.

---

## 2026-06-11 , T39 (#68): tips-listan får 3-dagars fönster + expandera (delad ExpandToggle)

**Beslut (Daniels begäran):** tips-listan (`PredictionsView`) får SAMMA 3-dagars fönster + "Visa alla /
Visa färre"-expandering som resultatinmatningen (#39/T27). Default visar bara tippbara matcher inom de
närmaste 3 svenska kalenderdagarna (ankrat på idag, eller premiärdagen om turneringen ej börjat), resten
fälls ut på begäran via en dubblerad kontroll (uppe + nere).

**Återanvändning (DRY, ingen ny logik):** fönster-urvalet ÄR resultatvyns rena `windowMatches`
(`features/results/result-window.ts`), oförändrad, anropad med tipsvyns tippbara matcher. Svensk-dag-
regeln och alla edge-fall (ej börjad, slutet, vilodag, allt inom fönstret) är därmed EN sanning, redan
uttömmande testad i `result-window.test.ts`. Inget eget urval skrevs.

**ExpandToggle lyft till delad komponent (rule-of-three):** ihopfäll-/expandera-kontrollen bodde inline
i `ResultEntryView`. Den är nu 3:e konsumenten (resultat-fönster #39, dubblering #42, tips-fönster #68),
så den lyftes till `src/components/ExpandToggle.tsx` (EN markup-källa, kan aldrig drifta isär).
Resultatvyn importerar den nu i stället för en lokal kopia, beteende-bevarande. Komponenten tar en
`name`-prop för data-attribut-namnrymden (`data-${name}-toggle` / `-position`), default `'results'`, så
resultatvyns redan testade attribut är byte-identiska och tips-listan får sina egna stabila krokar
(`data-predictions-toggle*`).

**Två "nu" med olika kadens, samma seed:** fönstret mäts i DAGAR via `useTodayKey(now)` (stabil inom
dygnet, glider över midnatt utan omladdning, PWA-fälla hanterad), medan tips-LÅSET flippar MITT PÅ DAGEN
vid avspark via `useDeadlineTick(now)` (minut-tick). Båda seedas av vyns injicerade `now` (testbarhet +
ett konsekvent start-nu), sen tar respektive hook över sin egen tick. Det är medvetet två hooks, de
löser två olika tidsproblem.

**Bevarat (sekretess/lås/epoch + kontrakt):** korten FILTRERAS inte bort utanför fönstret, de DÖLJS med
`hidden` (display:none + ur a11y-trädet) och UNMOUNTAS inte, så `PredictionForm`:s lokala osparade
inmatning och storens låst-/sekretess-/epoch-läge (RLS server-side) överlever expandera/ihopfäll. Samma
C2-invariant som resultatvyn. Befintliga data-attribut (`data-predictions-list`, `data-prediction-form`)
och alla tidigare PredictionsView-tester är orörda. Code-vs-id/TeamCode-kontraktet rördes inte (det är
aggregering, inte tippning).

**Tester:** `PredictionsView.test.tsx` (fönster default = delmängd, expandera/ihopfäll, dubblerad
kontroll med identisk aria, edge: allt inom fönstret -> ingen knapp, bevarad osparad inmatning över
toggle) + `components/ExpandToggle.test.tsx` (etikett/böjning, aria-expanded/-controls, name-namnrymd).
Spårbar via #68 (+ #63 för fönster-delen).

## 2026-06-11 , T39 (#68 F1): kommentar-sanning om install-gaten (Panel-F1)

**Fix:** `App.tsx`-kommentaren vid install-banner-gaten påstod att bannern döljs medan touren är öppen
för att "touren har ett eget install-steg att installera FRÅN". Tourens install-steg (`onboarding.ts`,
steget `install`) är REN INFO (titel + brödtext + illustration, ingen install-knapp/-action). Man kan
alltså inte installera från touren. Kommentaren är rättad till sanningen: tourens install-steg BESKRIVER
installationen, man installerar via DENNA banner EFTER att touren stängts. (Reviewer-fynd, lessons
`kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller`.)

## 2026-06-11 , T39 (#68 F2): test vaktar footer-länkens tabnabbing-skydd (Panel-F2)

**Beslut:** footer-signaturens hemsidelänk (`[data-app-signature] a` -> `www.danielaldemir.com`) hade
korrekta attribut men inget test som vaktade dem. Ett test i `App.test.tsx` asserterar nu
`href=https://www.danielaldemir.com`, `target=_blank` och `rel` som innehåller BÅDE `noopener`
(kapar `window.opener`, hindrar tabnabbing) och `noreferrer`. Så kan en framtida refaktor inte tyst
tappa target/rel (öppna i samma flik eller exponera opener). Ordnings-oberoende koll på rel-tokens.

## 2026-06-11 , T39 (#68): install-knappen, rotorsak + standalone-detektering

**Symptom (Daniel):** "Installera som app"-knappen gör inget vid klick. Bekräftat blockerande inför
delningen.

**ROTORSAK (källhänvisad, gissas inte):** `beforeinstallprompt`-event:et fångades först i React-
hookens `useEffect` (`use-install-prompt.ts`), som kör EFTER att appen monterat. Men event:et fyrar
"usually on page load" UTAN garanterad tidpunkt (MDN: "There's no guaranteed time this event is fired,
but it usually happens on page load",
https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event). I en riktig
webbläsare hinner det därför ofta fyra INNAN hooken registrerat sin lyssnare, och event:et är borta
för alltid (det re-fyrar inte). Då förblir `deferredPrompt` null, knappen dyker aldrig upp / klick gör
inget. Enhetstesterna missade det för att de dispatchar event:et EFTER mount, ett klassiskt mock-/
timing-blint-fläck (samma familj som "happy-path bevisar aldrig den gren där de verkliga källorna
kopplas").

**Fix (MDN + web.dev-mönstret):** Registrera lyssnaren SÅ TIDIGT som möjligt, FÖRE framework-mount.
Ny modul `install-prompt-capture.ts` registreras från `main.tsx` (före `createRoot`),
`preventDefault`:ar mini-infobaren och stashar event:et i en modul-variabel + en liten subscribe-API.
Hooken läser det redan-fångade event:et via `useSyncExternalStore` (synkron läsning vid mount), så ett
event fångat före mount syns direkt och tappas inte. `prompt()` anropas på det SPARADE event:et och
nollas direkt (engångs, MDN/web.dev "customize-install":
https://web.dev/articles/customize-install). Live-verifierat i Chrome mot byggd `dist`: klick på
"Installera" anropar `prompt()` exakt en gång, sen försvinner knappen (event förbrukat).

**Standalone-detektering (dölj install-ytan HELT i app-läge):** `detectStandalone` kombinerar nu de
TRE standard-signalerna (web.dev "Detecting PWA standalone mode",
https://web.dev/learn/pwa/detection): (1) `matchMedia('(display-mode: standalone)')`, (2) iOS
`navigator.standalone === true` (icke-standard, MDN), (3) `document.referrer.startsWith('android-app://')`
(TWA / Android-app-wrapper). I standalone returnerade dåvarande `resolveInstallMode` 'hidden'
(funktionen togs bort i T70; den levande ekvivalenten är `resolveInstallButtonAction` -> 'hidden'),
så VARKEN install-ytan, iOS-instruktionen ELLER Play Protect-noten visas. Källhänvisat inline i
`install-prompt.ts` och `install-prompt-capture.ts`.

**Findings:** Onboarding-touren (T13) renderar en full-skärms overlay (z-50) vid första besök som
ligger ÖVER install-bannern, så en FÖRSTA-gångs-användare kan inte klicka install-knappen förrän
touren stängts. Funktionellt korrekt (touren är dismissbar och knappen funkar efteråt), men det är en
andra, separat orsak till "knappen gör inget" för exakt den vanligaste användaren (en vän som öppnar
delnings-länken första gången). Lämnas som ett pinnat fynd (F1) för orchestrator, ändring av onboarding-
beteendet ligger utanför T39:s scope.

## 2026-06-11 , T38 (#67): rum-persistens, senast valda rummet återställs över sidladdning

**Beslut (persistens-modell):** Det AKTIVA rummets id persistas i localStorage under nyckeln
`vm2026-active-room` (samma `vm2026-`-prefix som tema + app-settings), och återställs vid app-mount.
Multi-rum: bara ETT id lagras, det SENAST valda (skapa / gå-med / välj skriver alltid över), så det
är det rummet som återställs nästa gång. Persistens-primitiven bor i `active-room-storage.ts` och
bygger på `safe-storage` (T13), så blockerad/kastande storage (privat läge, sandbox) aldrig kraschar
appen, persistensen hoppas bara över.

**Återställnings-regel (verifiera, gissa aldrig):** vid mount läses det sparade id:t och VERIFIERAS
mot `listMyRooms` (rooms-api). Bara om id:t fortfarande finns bland mina rum (rummet finns OCH jag är
medlem) väljs det. Finns det inte (rummet borttaget, eller jag har lämnat på en annan enhet) faller vi
RENT till no-room och RENSAR det inaktuella id:t. Att lämna det aktiva rummet rensar också id:t.
Återställningen tar samma epoch-token (`loadTokenRef`) som övriga laddningar, så ett manuellt rumsbyte
under laddningen alltid vinner (stale-vakten från T14 KA-F2 bevaras).

**Varför:** utan persistens tappade appen vilket rum man stod i vid sidladdning, så efter en
uppdatering stod man i INGET rum och de delade inmatningarna syntes inte (de fanns kvar i molnet, men
man var inte i rummet). Kritisk UX-bug före delning. Auto-val efter skapa/gå-med fanns redan (T14),
men valet persisterades inte; nu gör det det.

**T38-visuellt (upphovs-signaturen + LIVE-bevis för persistensen, design-frontend):**

*Signaturen (footerns avsändarrad).* Daniels stolta lilla avsändarrad i "arena i kvällsljus"-
estetiken: ett "DA"-monogram-SIGILL (liten rund accent-bricka med mörk/vit ink = den färg-oberoende
solid-bricka-formen, samma recept som DU-brickan/primärknappen) + en hårfin accent-tick som diskret
separator, sen "Made by" dämpat (fg-muted) och NAMNET "Daniel Aldemir" i full fg/display-vikt så det
läses stolt, inte som en eftertanke. Diskret men närvarande, aldrig skrikig. Monogrammet är
aria-hidden (ren dekor) så skärmläsaren läser den rena meningen "Made by Daniel Aldemir" (även
`title`-attribut). Stylingen bor i `tokens.css` §18 (`.vm-signature-seal`, `.vm-signature-tick`).

*Kontrast (UPPMÄTT, scripts/contrast-t38.mjs, canvas-komposit, VÄRSTA basytan = sidans FOND --vm-bg
eftersom footern står direkt i <main>, inte i en Panel; BÅDA teman):*
- "Made by"-prefixet (--vm-fg-muted, FULL opacitet): 8.39:1 mörkt / 5.92:1 ljust. AA-säkert.
- Namnet "Daniel Aldemir" (--vm-fg, full): 17.04:1 mörkt / 16.25:1 ljust.
- Monogram "DA" (accent-fg-ink på SOLID accent-bricka): 10.85:1 mörkt / 5.40:1 ljust.
- Tick:en bär ingen text (ren dekor, aria-hidden). Alla text-ytor >= 4.5:1 (normal text).

*FYND (a11y-bug i den ursprungliga signatur-stylingen, åtgärdad):* senior-devs funktionella bas
satte `text-fg-muted/80` (80% opacitet PÅ fg-muted). Uppmätt: det faller till 3.83:1 i LJUST tema =
UNDER AA, exakt token-som-text-med-opacitet-fällan (lessons-familjen aa-kontrast-...-varsta-fall: en
token som redan ligger nära tröskeln tippar under när man lägger opacitet på den, och bara i ETT
tema). Design-frontend bytte till full opacitet på fg-muted för "Made by" + full fg för namnet, så
raden klarar AA i båda teman med marginal. Verifierad i browsern (computed color `rgb(156,178,166)` =
#9cb2a6 full opacitet i mörkt, `rgb(79,98,88)` = #4f6258 i ljust).

*LIVE-VERIFIERING av rum-persistensen (bevisad i browsern, inte bara enhetstest).* Dev-server i
LIVE-läge (lokal `.env.local` med produktionens Supabase-URL + anon-nyckel, raderad efteråt; INTE
committad) + Playwright mot en isolerad anonym testidentitet (INTE Daniels rum ewrmdt). Simulerat
exakt taskens scenario:
1. Skapade rum "DESIGN-TEST rum-persistens" (kod vh65f2). Direkt efter skapa: rummet AKTIVT,
   MEDLEMMAR (1) (skaparen är DB-medlem, INTE members=0), och `localStorage['vm2026-active-room']`
   satt till rummets id.
2. LADDADE OM sidan (full `page.goto`). Efter omladdning + rooms-load: rummet fortfarande AKTIVT
   ("Aktivt rum: DESIGN-TEST rum-persistens"), MEDLEMMAR (1), samma id i localStorage. Detta är
   precis buggen som fixen löser: FÖRE fixen hamnade man i INGET rum (members=0) efter en refresh.
3. Negativ väg (verifiera-gissa-aldrig-grenen): lämnade rummet -> localStorage-id:t RENSAT (null),
   ingen "AKTIVT", rummet borta ur MINA RUM. Persistensens hela livscykel (skriv vid val, återställ
   vid mount mot listMyRooms, rensa vid lämna) bevisad live.

*Responsivitet + a11y + reduced-motion (verifierat live):* signaturen är en enkel flex-rad utan
animation. 280px (vikbar cover): ingen horisontell scroll (docScrollWidth 265 < 280), sigillet en
crisp 20x20px disc, raden fits i viewport. 1440px: ingen horisontell scroll, renderar rent. Seal +
tick har `animationName: none` (inget att nolla för reduced-motion; tick:en är aria-hidden text-lös
dekor). Båda teman verifierade (computed colors matchar token-värdena ovan).

*Städning:* DESIGN-TEST-rummet RADERAT ur produktion efter testet (medlemslöst, exakt id-villkorat
DELETE), verifierat: 0 DESIGN-TEST-rum kvar, Daniels rum ewrmdt orört. Inget för dirigenten att städa.

## 2026-06-11 , T39 (#68): signatur-namnet länkar till Daniels sajt (www.danielaldemir.com)

**Vad:** namnet "Daniel Aldemir" i footer-signaturen (T38) är nu en länk till
`https://www.danielaldemir.com`. Diskret men klickbar, i samma arena-estetik.

**Val (varför namnet blir länken, inte en separat rad):** signaturen är EN tät, balanserad enhet
(sigill + tick + "Made by NAMN"). En extra "danielaldemir.com"-rad under hade brutit den lugna
kompositionen och dragit blicken. Att göra NAMNET klickbart är det mest naturliga målet (det ÄR
upphovspersonen) och håller raden oförändrad i vila. Namnet behåller sin stolthets-styling (full
`--vm-fg` + display-vikt), så footern ser ut precis som efter T38 tills man pekar/fokuserar.

**Affordans (tydligt en länk):** en SOLID accent-underline (`decoration-accent`, `decoration-2`,
`underline-offset-[3px]`) tänds på `hover` OCH `focus-visible`, samma "tänds-vid-interaktion"-mönster
som lagnamns-knappen (T10) men med ett SOLIT accent-streck i stället för T10:s prickade fg-muted, så
formspråket skiljer "länk till annan sajt" från "öppna en panel i appen". Vid tangentbord tar
dessutom den globala `:focus-visible`-ringen (accent, index.css, WCAG 2.4.7) över som primär signal.

**Säkerhet:** `target="_blank"` + `rel="noopener noreferrer"` (hindrar tabnabbing + läcker ingen
referrer).

**a11y:** explicit `aria-label="Daniel Aldemir, öppna www.danielaldemir.com i en ny flik"` ger ett
tydligt länknamn som även förvarnar om ny flik; `title` på raden uppdaterad med domänen. Monogrammet
+ tick:en förblir `aria-hidden`.

**Kontrast (UPPMÄTT, scripts/contrast-t38.mjs, ny rad 6, canvas-komposit mot sidans FOND, BÅDA teman):**
- Namnets TEXT är OFÖRÄNDRAD full `--vm-fg`: 17.04:1 mörkt / 16.25:1 ljust (ingen ny brödtext-kontrast).
- Länk-underline:n (accent, full opacitet) mot fonden = icke-text indikator, WCAG 1.4.11 (>=3:1):
  **10.83:1 mörkt / 4.90:1 ljust**, klarar med marginal i båda teman.

**Responsivitet (verifierat 280-1440px, båda teman):** länken är inline i samma flex-rad, lägger ingen
bredd (samma text som förr), så raden får plats på 280px utan horisontell scroll precis som T38, och
renderar rent upp till 1440px.

## 2026-06-11 , T17 (#17, Copilot C1+C2): slutspels-matchtips poängsätts + sr-only-interpunktion

**C1 (korrekthetsbug, källmedveten fix):** `deriveMatchFacit` (derive-facit.ts) filtrerade på
`stage === 'group'` och tappade ALLA slutspelsmatcher ur matchfacit, så topplistan + reveal missade
matchpoäng för färdigspelade slutspelsmatcher. **Regel + källa (gissas inte):** matchtipset
poängsätts på den ORDINARIE målställningen i ALLA tippbara matcher, grupp SOM slutspel, mot exakt
samma `scorePrediction`. **Källa:** T15 §2 i denna logg ("UTFALL (1X2) PÅ ORDINARIE MÅL, inkl.
slutspel ... alla tips bedöms på samma plan, grupp som slutspel") + `score.ts` modul-doc. En
slutspelsmatch är tippbar så snart båda lag är kända (`predictable-matches` `bothTeamsKnown`), så ett
färdigspelat slutspel ska ge matchpoäng. **Fix:** matchfacit inkluderar nu varje `status==='finished'`
match (grupp + slutspel). **Ingen dubbelräkning mot bracket-facit:** matchfacit jämför ordinarie mål
(`scorePrediction`), bracket-facit jämför vem som avancerade inkl. straffar (`scoreBracketAdvance`,
FIFA Art. 14), skilda tips-typer mot skilda facit-kartor (matchByMatchId vs bracketBySlotId). Ett
straff-avgjort slutspel räknas i matchfacit som ordinarie ställning (1-1 = 'draw'), exakt T15 §2.
Regression-test: avgjort slutspel ger matchfacit + matchpoäng i aggregeringen, additivt med bracket-tips.

**C2 (a11y):** sr-only-etiketten i RevealView hade ledande blanksteg före komma (" ,") -> skärmläsare
läser "namn kommatecken". Det är interpunktion i en uppläst mening, inte husstilens " , "-titel-
separator, så kommatecknet skrivs nu ihop med namnet (inget ledande blanksteg). Övriga aria-strängar
i leaderboard/ skannades, inga fler träffar (LeaderboardView:s `aria-label` är ren).

## 2026-06-11 , T17 (#17): topplista + tips-avslöjande (poäng-aggregering + sekretess-gate)

VM-poolens kröning: vem tippar bäst (topplista med rörelse-animation) + vad alla gissade
(tips-avslöjande efter avspark). Bygger PÅ T15:s scorePrediction + T16:s bonus-score + de tre
list-API:erna, bygger INTE om poänglogiken. Fyra modell-beslut, alla källmedvetna.

**1. FACIT-KÄLLAN (vilken sanning poängen jämför mot, dokumenterat val):** rummets DELADE,
inmatade resultat (`room_match_results`, vävda ovanpå den källåkrade planen via `applyRoomResults`,
T14 KA-F3) är facit. Rummet lovar "ni fyller i matchresultaten TILLSAMMANS", så den delade
matchlistan är den ENDA sanningen alla medlemmar delar. Grupptabeller + slutspelsträd härleds i
sin tur ur EXAKT samma matchlista (`computeStandings`/`deriveBracket`, SPEC §6 "härledd state"),
ingen ny sanning införs. **Källa:** T14 KA-F3 (apply-room-results.ts) + SPEC §6.

**2. POÄNG-/AVSLÖJANDE-MODELLEN (KISS, löser sekretess-paradoxen):** taskens fråga var "hur
beräknas andras totalpoäng innan deras tips avslöjats?". Svar: poäng räknas BARA på AVGJORDA/låsta
utfall, ett tips ger poäng FÖRST när dess match/grupp/slot är avgjord (facit innehåller bara
avgjorda utfall). Det gör topplistans POÄNG meningsfull LÖPANDE (tickar in när matcher avgörs)
utan att läsa andras OAVGJORDA tips-innehåll. RLS döljer andras tips-RADER tills deadline, så
`listRoom*`-API:erna returnerar bara egna + redan-avslöjade rader, aggregeringen kan strukturellt
bara se det som FÅR ses. Tips-INNEHÅLLET avslöjas SEPARAT (avslöjande-vyn), per avgjord+låst match.
**Avslöjande-gaten kräver BÅDE låst (`now >= kickoff`, sekretess) OCH avgjord (facit finns, för
att kunna visa poäng).** Server-RLS är det RIKTIGA skyddet (bevisat T15/T16); klient-gaten gör bara
VISNINGEN sann. **Källa:** T15 §4 (tips-sekretess RLS) + T16 §4 + isMatchLocked (T15).

**3. LAG-IDENTITET (HARD, T16 F1-seamen, code-vs-id tyst-noll):** pool-tipsen LAGRAS som versal
Team.CODE ("BRA", DB-constraint `^[A-Z]{3}$`), men det härledda facit (`computeStandings.teamId`,
`deriveBracket.winnerTeamId`) bär gemen Team.ID ("bra", `teamId(code)=toLowerCase`). Möts de två
rymderna otransformerat ger det TYST 0 poäng för ALLA tips. **Fix: facit-modulen (derive-facit.ts)
mappar id -> CODE (branded `TeamCode`) VID KÄLLAN, via lag-listan, INNAN facit lämnar modulen.** Då
bär BÅDA sidor versal code; en gemen id kan strukturellt inte nå poängfunktionen, och kontraktet är
i TYPEN (TeamCode), inte bara en docstring. bonus-score:s egen normalisering blir defense-in-depth.
**BEVIS (att seamen NÅS):** ett seam-test kör de RIKTIGA `computeStandings`/`deriveBracket` på en
produktions-grupp-fixture, plockar härlett `teamId`/`winnerTeamId` (gemen id), och kräver full poäng
mot ett code-lagrat tips. Mutationstestat: med id->id-mappning (omappat) failar seam-testet RÖTT
(`expected +0 to be 5`), med id->code är det grönt. En FAIL-LOUD-vakt kastar om ett härlett facit-id
saknar code i lag-listan (brutet referens-kontrakt), aldrig tyst. **Källa:** reviewer-lärdom T16 F1
(`tva-identitetsrymder-moter-forst-vid-otestad-poang-seam`) + docs/decisions.md T16 + team-code.ts.

**4. RANGORDNING + TIEBREAK (källmedvetet, edge-testat):** sortera på total poäng FALLANDE, LIKA
poäng = DELAD placering (samma rank, nästa distinkta hoppar fram, "1,1,3"-stilen, standard för
delade placeringar). **Tiebreak (visnings-ordning INOM en delad grupp, inte en rank-skiljare):**
(1) fler EXAKTA match-resultat (3-poängare) först, en KVALITETS-skillnad som speglar skickligare
tippande (samma anda som poängregelns "exakt > utfall"), (2) därefter visningsnamn ALFABETISKT
(svensk locale), en stabil förutsägbar ordning så listan aldrig "flaxar". Tiebreaket bryter ALDRIG
den delade placeringen, lika poäng = samma rank oavsett tiebreak. **Källa:** vedertagen poolspel-
standard (delad placering vid lika; mer specifikt rätt väger tyngre); SPEC anger ingen avvikande
regel, så standarden är förvalet, inte en gissning.

**RÖRELSE-ANIMATION (taskens punkt 1):** topplistans rader är `motion.li` med `layout='position'`,
så de GLIDER till sin nya plats när poäng/ordning ändras. Reduced-motion: `MotionConfig
reducedMotion="user"` (MotionProvider) stänger AUTOMATISKT av layout-/transform-animationer, OCH
`layout` gatas explicit på `useReducedMotion` (dubbelt skydd, WCAG 2.3.3). Funktionellt lager:
stabil semantik (`<ol>`, aria-label "Placering N") + data-attribut (`data-leaderboard-row/-rank/
-points`, `data-user-id` som stabil animations-key); premium-finish (medaljer, glow) -> design-frontend.

**ARKITEKTUR (DRY, lägsta koppling):** tre RENA moduler (derive-facit / aggregate-scores / reveal,
React-fritt, fristående testbara) + en LÄS-ONLY provider (T17 skriver inga tips, aggregerar de
befintliga). Provider:n läser facit-källan via `useLeaderboardData` (laddar statisk data + väver in
`useRoomsSync.sharedResults` med SAMMA `applyRoomResults` som ResultsProvider, så facit är IDENTISKT
och sektionen kan ligga UTANFÖR ResultsProvider, alongside tips-sektionerna). Epoch-vakt mot rumsbyte
(samma mönster som T15 C14 / T16). Sektionen gatas på `rooms.enabled` (samma som T15/T16-sektionerna).

**DISPOSITION:** topplistan + tips-avslöjandet byggda FULLT (taskens kärna). Realtids-synk (T18) +
mini-ligor (T20) out of scope. Premium-finish (medaljer, rörelse-polish) lämnas till design-frontend
ovanpå data-attribut-seamen (samma arbetsdelning som T15/T16).

## 2026-06-11 , T17-visuellt (#17): topplistans + tips-avslöjandets premium-finish (KRÖNINGEN)

Det visuella lagret ovanpå senior-devs funktionella topplista + tips-avslöjande. Mål: VM-poolens
KRÖNING , topplistan är vad kompisarna kollar VARJE dag, den ska kännas LEVANDE och TÄVLINGSINRIKTAD,
och avslöjandet ska bli ett FACIT-ÖGONBLICK. Allt inom "arena i kvällsljus"-familjen (SPEC §7) och
utan att röra senior-devs data-attribut/test-kontrakt (rank-ordning, poäng-strängar, reveal-gate).

**1. TOPPLISTAN = PODIUM + RACE (taskens punkt 1):** topp-3 bär riktiga PALLPLATS-medaljer , 1:a guld,
2:a silver, 3:a BRONS , via samma färg-OBEROENDE solid-bricka-medalj som grupp-tipsets podium (T16,
`.vm-pool-medal`, DRY) + en NY `.vm-pool-medal--bronze`-modifierare. Brons krävde tre nya tokens
(`--vm-bronze`/`-ink`/`-text`) i BÅDA teman, samma guld/silver-disciplin: rå brons = DEKOR (medalj-
fyllning), all brons-TEXT använder den AA-mätta `--vm-bronze-text`. Ledar-raden (rank 1) får en varm
guld-glow (`[data-leader]`) + gulda poäng-tal (`--color-warning`) så ögat dras dit. Plats 4+ får en
neutral rank-bricka (`.vm-board-rank`). RÖRELSE: senior-devs `motion.li layout='position'`-glid
behölls och fick en premium spring (`stiffness 520, damping 38`) + en kort ENGÅNGS highlight-puls
(`.vm-board-row[data-rank-changed]`, CSS) på en rad som JUST bytt placering, så ögat hänger med i
racet. Puls-spårningen jämför rank mot förra renderingen (useRef), pulsar bara vid en ÄNDRING (inte
första laddningen = brus), och sätts ALDRIG vid reducerad rörelse.

**2. "DU" = FÄRG-OBEROENDE framhävd egen rad (taskens punkt 1):** den egna raden markeras med accent-
ring + svag accent-tint + en läsbar "DU"-bricka (`.vm-board-self-badge`, solid accent + accent-fg-ink),
INTE bara en färg , så den syns för en färgblind användare och i båda teman (form + text + färg, tre
redundanta signaler). NY SEAM: `currentUserId` trådd genom storen (rummets `rooms.userId`); null =
ingen rad markeras (auth-sessionen ej klar). Vyn jämför rad-userId mot den. Sekretess hänger INTE på
den (bara en visnings-hak).

**3. TIPS-AVSLÖJANDET = FACIT-ÖGONBLICK (taskens punkt 2):** facit-talet (det faktiska resultatet) är
HJÄLTEN , en solid guld-bricka med mörk ink (`.vm-reveal-actual`, samma solid-bricka-form som
medaljerna). Varje pick får en FÄRG-OBEROENDE utfalls-markör (IKON + FORM, inte bara färg): EXAKT (3p)
= bock i solid grön medalj, RÄTT UTFALL (1p) = halv-cirkel i solid guld-medalj, MISS (0p) = kryss i en
neutral ring + en grön/guld vänsterkant per rad. Kategorin HÄRLEDS ur `pick.points` mot den testade
poängregeln (`PREDICTION_POINTS = {exact:3,outcome:1,miss:0}`), ingen ny tröskel. En dold `sr-only`-
etikett ("Exakt rätt"/"Rätt utfall"/"Bom") ger skärmläsaren samma besked i ord. Så man ser på en blink
vem som prickade rätt och vem som bommade, oavsett färgseende.

**KONTRAST (taskens punkt 3, canvas-komposit VÄRSTA fall, BÅDA teman, UPPMÄTT + KORSVERIFIERAT live):**
all läsbar text står på OPAK surface/surface-raised eller på en LÅG-alfa tint mätt som canvas-komposit.
Medalj-/markör-/facit-SIFFRORNA är mörk ink på SOLID bricka (färg-oberoende solid-bricka-form T9/T11/
T16), aldrig ljus medalj-färg-text på tint. Guld-TEXT = `--color-warning`, brons-TEXT = `--vm-bronze-
text`. Värden beräknade i `scripts/contrast-t17.mjs` (alfa-komposit) OCH korsverifierade i browsern
(Playwright `getComputedStyle`, faktisk render) , de två metoderna gav IDENTISKA siffror:

| Yta (värsta fall) | Mörkt | Ljust | Tröskel |
|---|---|---|---|
| Guld-medalj siffra (coupon-ink på solid gold) | 10.90:1 | 5.03:1 | 4.5 |
| Silver-medalj siffra (silver-ink på solid silver) | 10.99:1 | 8.40:1 | 4.5 |
| Brons-medalj siffra (bronze-ink på solid bronze) | 6.60:1 | 4.87:1 | 4.5 |
| "DU"-bricka (accent-fg på solid accent) | 10.85:1 | 5.40:1 | 4.5 |
| Ledar-rad namn (fg) på guld-7%-glow-rad | 15.24:1 | 16.19:1 | 4.5 |
| Ledar-rad poäng (warning) på guld-glow-rad | 10.09:1 | 5.36:1 | 4.5 |
| Egen rad namn (fg) på accent-8/10%-tint | 15.24:1 | 15.61:1 | 4.5 |
| Eyebrow/facit-tal (warning) på surface | 10.09:1 | 5.92:1 | 4.5 |
| Facit-tal (coupon-ink på solid gold) | 10.90:1 | 5.03:1 | 4.5 |
| Exakt-markör ink (on-success på solid success) | 9.97:1 | 5.47:1 | 4.5 |
| Utfall-markör ink (coupon-ink på solid gold) | 10.90:1 | 5.03:1 | 4.5 |
| Miss-markör glyf (fg-muted på surface-raised) | 6.23:1 | 6.52:1 | 3.0 |
| Reveal pick namn (fg) / tippning (fg-muted) | 15.24 / 7.50 | 17.91 / 6.52 | 4.5 |

**MIN över ALLA nya normal-text-ytor: 6.60:1 (mörkt) / 4.87:1 (ljust), alla >= AA.** Den nya brons-
tokenen valdes så även dess medalj-ink klarar AA i ljust tema (4.87:1, samma guld/silver-på-ljus-
disciplin). **RESPONSIVT + ÖVRIG VERIFIERING:** Playwright mot Vite-render (faktisk rendering, båda
teman) på 280 (foldable cover) / 760 / 1440px , noll horisontell overflow. En FÄLLA fångad i 280px-
verifieringen: "DU"-brickan låg nästlad i namn-gruppen och ÖVERLAPPADE poängen 26px när namnet
truncats till 0 bredd; fixat genom att flatta brickan + poängen till `shrink-0`-SYSKON av namnet
(flex reserverar deras plats först, kan aldrig kollidera, mätt gap 12px efter fix). Animation
verifierad i KOMPILERAD CSS (`dist/assets/*.css`, lessons `verifiera-animation-mot-kompilerad-css`):
`vm-board-rank-pulse`-keyframe finns OCH ligger inuti `@media (prefers-reduced-motion: no-preference)`
(reduced-motion-användare får ingen puls; dubbelt skydd med JS-gaten). Inga tester rörda i kontrakt;
7 NYA tester låser premium-seamen (podium-medaljer, ledar-/du-markering, currentUserId-null-fallet,
färg-oberoende reveal-markörer + sr-only-orden). 1006 gröna (var 999).

## 2026-06-11 , T16b-visuellt (#59): bracket-tips-lagrets premium-finish ("vägen till bucklan")

**Kontext:** ovanpå senior-devs funktionella lager (data-attribut-seam + semantik + tester) la
design-frontend den visuella finishen för slutspels-tipset. Det är det episka momentet, "vem tror
du tar sig hela vägen till final och vinner VM". Identitet: "VÄGEN TILL BUCKLAN". Två lager, EN
`BracketPredictionForm` (en ny `variant`-prop styr presentationen, semantiken är oförändrad):

**1. CHAMPION = HJÄLTE-momentet (pokal/guld):** en egen, större panel (`.vm-champion-hero`) med
en pokal-glyf i en solid guld-bricka, en varm guld arena-glow (samma "arena i kvällsljus"-recept
som hero/profil/onboarding), och ett STOLT guld mästar-band (`.vm-champion-band`, "Mitt tips: X" +
TeamFlag) när min mästare är vald. Det är trädets krona, översatt till tips.

**2. SLOT-TIPSEN = TIPSKUPONG-formspråk (DRY):** återbrukar HELA tips-kupong-familjen
(`.vm-coupon-card`, river-tear, coupon-eyebrow, lock-ikon, `.vm-coupon-mine`) som grupp-tipset
(T16) + match-tipset (T15) redan etablerat, så slutspels-tipset hör till SAMMA kupong-värld. De
TVÅ möjliga lagen blir ett tydligt binärt val (TeamFlag + "vs"). Rund-grupperat med en rund-marker
vars intensitet BYGGER mot finalen (`.vm-tips-round-marker`, semifinal tar accent, brons/final tar
guld, ekar `bracket.css`). TBD-läget är en elegant streckad väntan-kupong (`.vm-tips-tbd`, "Lagen
avgörs av tidigare resultat", inte tomt), låst-läget är hänglås + mitt tips kvar stolt. "Gå med i
ett rum"-läget är en INBJUDANDE guld-tonad port med pokal-ikon.

**KONTRAST (taskens punkt 4, canvas-komposit VÄRSTA fall, BÅDA teman, UPPMÄTT, inte gissat):** all
läsbar text står på OPAK surface/surface-raised, aldrig på guld-glow:en. Guld-TEXT använder den
AA-mätta `--color-warning` (aldrig rå `--vm-gold`, guld-på-ljus-fällan). Mästar-/sparat-/pokal-
brickorna är SOLID guld-yta med mörk ink (`--vm-coupon-ink`, färg-oberoende solid-bricka-form
T9/T11/T15/T16). Champion-hero:ns två guld-radialer sitter i MOTSATTA hörn (100% 0% + 0% 100%) så
de möts ALDRIG på full peak, värsta enskilda punkt är EN radial (13%). Uppmätta MIN-kontraster
(canvas-komposit, alfa-blend över base-ytan, svept, inte typfall):

| Yta (värsta fall) | Mörkt | Ljust | Tröskel |
|---|---|---|---|
| Champion brödtext (fg-muted) på hero-glow-peak (13%) | 4.66:1 | 4.98:1 | 4.5 (normal) |
| Champion eyebrow "VM-FINALEN" (warning) på hero-glow | 4.90:1 | 4.53:1 | 4.5 (normal) |
| Champion rubrik (fg, stor) på hero-glow | 7.40:1 | 13.69:1 | 3.0 (large) |
| Mästar-band "Mitt tips" (coupon-ink) på SOLID guld | 10.90:1 | 5.03:1 | 4.5 |
| Slot eyebrow/rubrik (warning/fg) på kupong-glow | 8.45 / 12.76 | 5.36 / 16.19 | 4.5 |
| Binär val-rad lagnamn (fg) / "vs" (fg-muted) | 14.20 / 6.99 | 16.86 / 6.14 | 4.5 |
| Låst-etikett (fg) / undertext (fg-muted) på guld-7%-tint | 15.19 / 7.48 | 15.14 / 5.51 | 4.5 |
| TBD eyebrow/rubrik/text på TBD-yta | 8.94 / 13.5 / 6.65 | 5.44 / 16.44 / 5.99 | 4.5 |
| Fel-text (danger) på danger-9%-tint (sämsta yta) | 4.66:1 | 4.80:1 | 4.5 (normal) |
| Rund-marker final (warning, stor) på guld-10%-yta | 8.21:1 | 5.31:1 | 3.0 (large) |

**MIN över ALLA nya text-ytor: 4.66:1 (mörkt) / 4.53:1 (ljust), alla >= AA.** En FÄLLA fångad i
mätningen: champion-brödtext (fg-muted) föll till 3.64:1 i mörkt tema vid den första glow-alfan
(16%/9%, konservativt stackad), glow:en sänktes till 13%/7% (samma kontrast-lås-disciplin som
profil-hero:n §7), då håller den 4.66:1 enkel-radial-peak. **Verifierat:** Playwright mot dev-preview
(faktisk rendering, båda teman) per skärmklass 280/768/1440px (noll horisontell overflow, formen
krymper rent via `min-w-0`), reduced-motion-grindar (champion-lift + TBD-breathe gatade på
no-preference + explicit reset under reduce), a11y (legend/label-koppling, TeamFlag aria-hidden,
binär "vs"-rad aria-hidden, väljare fokuserbar). Inga tester rörda (data-attribut-seam intakt,
953 gröna).

## 2026-06-11 , T16b (#59): bracket-/slutspels-tips-VYN (tippbarhet, deadline, champion-urval)

**Kontext:** T16 byggde HELA datakärnan (bracket_predictions schema/RLS/API + bonus-score +
`TeamCode`). T16b bygger BARA UI:t + provider + tester ovanpå den, spegel av T16:s grupp-tips-
feature (Provider/View/Form/Section/context + ren urvalslogik), med samma epoch-vakt/stale-save-
vakt/deadline-tick-rigor. Ny feature: `src/features/bracket-predictions/`. Tre modell-/UI-beslut,
alla med samma anti-fusk-/"gissa aldrig laget"-anda som T16:

**1. TIPPBARHET PER SLOT (källmedvetet, gissas inte):** en slutspels-slot (M73..M104) är TIPPBAR
först när BÅDA dess lag är KÄNDA (T9:s `deriveBracket` ger `resolution === 'resolved'` + `teamId`
på home OCH away). Innan dess visas "Lagen avgörs av tidigare resultat" och slotten är otippbar.
Samma princip som T15:s `predictable-matches` (`bothTeamsKnown`) och T9:s slot-resolver, vi tippar
aldrig ett lag som inte är fastställt. Champion-slotten är ALLTID tippbar (alla 48 lag kända före
start). **Källa:** T9 derive-bracket.ts (slot-resolution-modellen) + decisions.md T16 §2.

**2. DEADLINE-MODELL (EN sanning, speglar RLS):** per-slot-lås = slottens EGEN avspark (M73..M104:s
kickoff), champion-lås = turneringsstart (g-A-1:s kickoff). Klient-vyn slår upp ankaret via den
BEFINTLIGA `bracketDeadlineMatchId` (bracket-predictions-api), som speglar RLS-helpern
`bracket_deadline_kickoff` EXAKT, sen slår vi upp den matchens kickoff i matchplanen, ingen
dubblerad tid. LÅST = `now >= kickoff`, härlett BARA för visningen (server-RLS är det riktiga
låset). FAIL-SAFE: saknas ankar-matchen (oväntat) behandlas slotten som låst (samma riktning som
T16 §4:s NULL-deadline-fail-safe). Minut-tick (useDeadlineTick, T15 C1) så ett lås flippar utan
omladdning. **Källa:** `bracket-predictions-api.ts` + decisions.md T16 §4.

**3. CHAMPION-URVAL = ALLA 48 LAGEN (KISS, dokumenterat val):** taskens fråga var "alla 48, eller
bara de man tippat långt?". Valt: FRITT VAL bland alla lag. Skäl: champion tippas FÖRE gruppspelet,
då ingen vet vilka som tar sig långt, så en konstruerad delmängd vore både svårare att bygga och
godtycklig. Fritt val är det enkla, rättvisa momentet (KISS/YAGNI). **Källa:** taskens design-
vägledning (#59) + vedertagen VM-pool-standard (man tippar VM-vinnaren bland alla lag).

**LAG-IDENTITET (HARD, F1-seamen):** det härledda facit (`deriveBracket`) bär Team.id (GEMEN "bra"),
men ett bracket-tips LAGRAS som Team.code (VERSAL "BRA"). Urvalslogiken (`bracket-predictable-slots`)
mappar därför Team.id -> Team.code via lag-listan och bär `TeamCode` i slot-valen; vyn brandar value
-> `teamCode()` vid UI-gränsen innan `saveBracketPrediction`. Negativ kontroll (mutation: läck gemen
id) bevisar att `teamCode()` fail-loud:ar (`^[A-Z]{3}$`) i stället för att tyst ge ett ogiltigt tips
(seam-testet failar rött). **Källa:** reviewer-lärdom T16 F1 + `src/domain/team-code.ts`.

**DISPOSITION:** per-slot-tippningen + champion byggda FULLT (taskens kärna), inget pinnat. UI:t är
det funktionella + a11y-lagret (stabila roller + data-attribut som seam); premium-finish (kupong-
formspråk, flaggor, träd-känsla) lämnas till design-frontend ovanpå, samma arbetsdelning som T16.

---

## 2026-06-11 , T16b (#16, C1+C2): tips-API-fälten typade `TeamCode` (branded), namnen slutade ljuga

**Beslut (Copilot C1+C2, samma rot som F1):** API-fälten `winnerTeamId`/`runnerUpTeamId`
(group-predictions-api) + `advancingTeamId` (bracket-predictions-api), liksom row-projektionernas
`*_team_id`, BÄR faktiskt Team.**code** (versal "BRA", DB-constraint `^[A-Z]{3}$`), inte Team.id
(gemen "bra"). Namnen ljög, så en framtida konsument (T16b/T17) kunde skicka ett rått Team.id och få
TYST fel poäng. **Fix låst vid TYP-nivå (ingen DB-migration, kolumnerna behåller `*_team_id`):** ny
delad branded typ `TeamCode = string & { __brand: 'TeamCode' }` i `src/domain/team-code.ts` (med
`teamCode()` = validerad brandning, fail-loud mot `^[A-Z]{3}$`, och `asTeamCode()` = betrodd cast vid
DB-gränsen). Tips-fälten typas `TeamCode`, så en rå sträng / ett gemen id blir ett KOMPILERINGSFEL
(bevisat negativt i team-code.test.ts med `@ts-expect-error`). UI:t brandar vid sin gräns
(GroupPredictionsView: `teamCode(winnerCode)` ur `<option value={t.code}>`).

**Val branded type FRAMFÖR fält-omdöpning (`...Code`):** omdöpningen ripplat genom ~12 filer (UI-vy/
provider/form + tester) och krockat med DB-kolumnernas `*_team_id`-namn. Branded type är minst churn
och tydligast: namnen står kvar, men TYPEN bär sanningen. **F1:s normalisering i bonus-score BEHÅLLS
(defense in depth):** poängfunktionerna tar medvetet kvar `string` + `normalizeTeamRef`/`sameTeam`,
branded type stoppar felet vid kompilering på write-/API-ytan, normaliseringen är skyddet om en
otypad sträng ändå slinker in via en seam. De två lagren kompletterar varandra, ersätter inte.

**Källa till regeln (gissas inte):** identitets-rymds-driften + den rekommenderade branded-type-fixen
är reviewer-lärdomen `tva-identitetsrymder-moter-forst-vid-otestad-poang-seam` (T16 F1) +
`mock-foljer-konsumenttyp` (memory/lessons/senior-developer.md). `^[A-Z]{3}$` speglar DB-constrainten
(`..._t16_group_predictions_schema/rls.sql` + bracket-motsvarigheten). Decisions.md T16 F1-raden
förutsåg detta ("branded type kan läggas ovanpå senare utan att ändra kontraktet"), C1+C2 realiserar det.

## 2026-06-11 , T16-visuellt (#16): gruppvinnar-tips premium-finish, PODIUM-KUPONG (design-frontend)

Det visuella lagret ovanpå senior-devs funktionella grupp-tips-UI. Mål: "tippa hela gruppspelet"-
momentet , VM-kupongen man fyller i med kompisarna , ska kännas KUL och tydligt, utan att lämna
"arena i kvällsljus"-familjen eller bryta senior-devs data-attribut/test-kontrakt.

**1. IDENTITET, "PODIUM-KUPONG" (taskens punkt 1, DRY mot T15):** grupp-tipset ärver HELA T15:s
tips-kupong-fond (`.vm-coupon-card` i tokens.css §10: guld-hörn-glow, inset guld-topplist, hover-lyft,
låst-dämpning), så grupp-tipset och match-tipset hör tydligt till SAMMA kupong-familj , en sanning för
"det här är en tips-kupong", ingen andra-kort-fond. Ovanpå läggs en egen PODIUM-metafor (tokens.css §11
`.vm-pool-*`): 1:a = GULD-medalj, 2:a = SILVER-medalj. Guld + silver = en pallplats, det universella
"vem stod överst". Varje plats-rad får sin medalj + en medalj-tonad vänsterkant + en TeamFlag-
förhandsvisning (T7-discen, återbrukad) av det valda laget, så valet syns visuellt direkt , inte två
grå dropdowns. "POOL"-eyebrow + biljett-ikon + guld kupong-prick i legenden ärver T15:s signatur.

**2. SELECT BEHÅLLS (a11y + testkontrakt, INTE chip-knappar):** taskens "chips/rader" tolkas som det
VISUELLA lagret (medalj + flagga + ton) ovanpå senior-devs semantiska `<select>`, inte en ersättning.
Att byta `<select>` mot chip-knappar skulle bryta 6 tester (`getByLabelText` -> select, `.value`-
assertions) OCH tappa den inbyggda tangentbords-/skärmläsar-semantiken ett native `<select>` ger gratis.
Native select = bäst a11y + testkontraktet hålls; medalj/flagga/podium-lagret bär "kul"-känslan.

**3. MITT TIPS, ett STOLT podium (taskens punkt 1):** ett sparat/seedat grupp-tips visas som en kompakt
pallplats-rad , guld-medalj + 1:ans lag, silver-medalj + 2:ans lag (`.vm-pool-podium`). Medalj-siffrorna
(1/2) står som mörk ink på en SOLID medalj-yta (färg-OBEROENDE solid-bricka-formen, T9/T11/T15), AA-säker
i båda teman , aldrig guld/silver-som-text-på-tint (den kända fällan, lessons aa-kontrast). Sparat-
brickan ("Sparat" + bock) återbrukar T15:s `.vm-coupon-mine` (solid guld + near-black ink).

**4. LÅST-LÄGET, elegant + POSITIVT (taskens punkt 2):** efter gruppens första match dämpas kupongen
(guld-till-neutral, ingen hover-lyft, "inlämnad/avgjord"-känsla) och en låst-etikett med HÄNGLÅS
(`.vm-coupon-lock-icon`, lugn engångs-puls, nollad vid reducerad rörelse) visas: "Låst vid gruppens
första match, så alla tippar blint." POSITIV inramning (spelets rättvisa), inte frustration. Mitt podium
står KVAR synligt under etiketten. Dämpnings-receptet är T15:s `.vm-coupon-card`-låst-regel, UTÖKAD att
matcha BÅDA nycklarna (`data-prediction-locked` OCH `data-group-prediction-locked`) , en sanning, samma
recept för båda kupong-typerna. Väljarna renderas fortfarande (disabled via fieldset, men `sr-only` när
låst) så låst-kontraktet håller (väljare finns + disabled) och en skärmläsare ser vad jag tippat , samma
kontrakt-anda som T15.

**5. "GÅ MED I ETT RUM"-läget, INBJUDANDE (taskens punkt 3):** porten är en guld-tonad ruta med en rund
kupong-ikon-bricka + tydlig rubrik + en väg framåt ("Skapa eller gå med i ett rum ovanför, så öppnar
kupongerna här"), inte en grå rad. En inbjudan, inte ett fel. `data-group-predictions-no-room` bevarat.

**6. NYA SILVER-TONER (för podiumets 2:a-medalj, samma guld/silver-på-ljus-disciplin):** guld bärs redan
av appen (`--vm-gold`/`--color-warning`). Silver är NYTT: `--vm-silver` (medalj-fyllnad, DEKOR),
`--vm-silver-ink` (near-black ink PÅ en fylld silver-medalj), `--vm-silver-text` (silver som TEXT/ikon,
en SEPARAT ton , i ljust tema en djup slate #52606e, eftersom den ljusa platinan faller under AA som
text på vit yta, exakt guld-på-ljus-fällan). Egna tokens per tema, mätning bunden till silver-hue:n.

**7. RESPONSIV GRID:** grupp-korten är `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` , 1 kolumn på smal
mobil/vikbar cover, 2 på surfplatta, 3 på bred skärm (12 grupper läses bättre i 3 kolumner). KRITISK
overflow-fix: ett `<select>` krymper inte under sin längsta `<option>` (intrinsisk min-content) i en
flex-rad , utan `min-w-0` på fieldset + flex-raden + select:en spränger ett långt lagnamn ("Bosnien och
Hercegovina") kolumnen på 280px. `min-w-0` låter select:en följa `w-full` och options-texten trunceras.

**KONTRAST UPPMÄTT (canvas-komposit, VÄRSTA fall, alfa-blend över base-yta, BÅDA teman, ej typfall):**
varje text-/ikon-yta mätt mot den FAKTISKT komponerade fonden (guld-glow/tint inräknad), inte mot
token-hex:en. ALLA klarar WCAG AA som NORMAL text (>= 4.5:1), inkl. de vars formella krav bara är 3:1
(ikoner). MIN-värden: **mörkt tema 5.61:1, ljust tema 4.78:1** (4.78 är no-room-ikonen, krav 3:1; lägsta
4.5-krav-element är fel-texten 4.81 ljust). Per yta (mörkt / ljust):
- Eyebrow "POOL" + 1:a-etikett (warning) på kupong-fond: 8.40 / 5.37
- 2:a-etikett (--vm-silver-text) på kupong-fond: 8.75 / 5.84
- Grupp-rubrik + podium-lagnamn (fg) på kupong-/podium-fond: 12.68-13.26 / 16.22-16.59
- Guld-medalj-siffra (coupon-ink) på SOLID guld: 10.90 / 5.03
- Silver-medalj-siffra (silver-ink) på SOLID silver: 10.99 / 8.40
- Låst-rubrik (fg) / låst-förklaring (fg-muted) på låst-yta (guld 7% / bg): 15.16, 7.46 / 15.12, 5.51
- Hänglås-ikon (warning) på låst-yta [krav 3:1]: 10.03 / 5.00
- Sparat-bricka ink (coupon-ink) på SOLID guld: 10.90 / 5.03
- Spar-knapp (accent-fg) på accent: 10.85 / 5.40
- Öppen-räknare (fg-muted) på guld-8%-chip: 6.39 / 5.97
- "Gå med i rum"-rubrik (fg) / brödtext (fg-muted) på guld-6%-yta: 13.56, 6.67 / 16.77, 6.11
- "Gå med i rum"-kupong-ikon (warning) på guld-14%-bricka [krav 3:1]: 6.53 / 4.78
- Fel-text (danger) på danger-9%/OPAK-surface: 5.61 / 4.81
Metod: WCAG relativ luminans + ratio, color-mix som gamma-sRGB-interpolation (per CSS-spec), alfa-
komposit source-over i gamma-rummet (som webbläsaren). Engångsprob, raderad efter (samma mönster som
T15-mätningen; delade element matchar T15:s siffror exakt, t.ex. guld-medalj 10.90/5.03, accent-knapp
10.85/5.40).

**RESPONSIVT + A11Y VERIFIERAT LIVE (Playwright mot dev-render, isolerad harness, raderad efter):**
ingen horisontell overflow på 280 (vikbar cover) / 375 / 768 / 1440 px i BÅDA teman (scrollW == clientW
överallt , bekräftat EFTER `min-w-0`-fixen; FÖRE fixen sprängde select:ens min-content kolumnen till
454px). Fokus-ring bevisad LIVE: select ger `:focus-visible == true` + `outline: solid 2px` (accent-ring,
index.css). Reduced-motion: hänglås-pulsen + slot-border-transition gatade under `@media (prefers-
reduced-motion: no-preference)` / nollade vid `reduce`. Tester: alla 912 gröna, senior-devs data-attribut
+ strängar + select-semantik bevarade.

---

## 2026-06-11 , T16 (#16, F1): poängfunktionerna identitets-rymd-ROBUSTA (code vs id-drift, tyst noll)

**Beslut (korrekthets-fynd, latent kritisk):** ett pool-tips LAGRAS som versal FIFA-code ("BRA",
DB-constraint `^[A-Z]{3}$`, hela write-kedjan UI->API->DB), men det FAKTISKA facit härleds ur
`computeStandings`/`deriveBracket`, vars `teamId`/`winnerTeamId` är Team.id = GEMEN kod ("bra",
`teamId(code)=code.toLowerCase()` i team-refs.ts). Poängfunktionerna (`scoreGroupPrediction`/
`scoreBracketAdvance`/`scoreChampionPrediction`) jämförde rena strängar (`a === b`), så när T17/T16b
matar ett standings-härlett `actual` (id) mot ett code-lagrat tips blir det TYST 0p för ALLA tips
(`'BRA' === 'bra'` är false), inte ett fel. Probe-bevisat: `scoreGroupPrediction({BRA,ARG},{bra,arg})`
gav 0, borde vara 5. **Fix (strukturell, inte pinnad):** en liten `normalizeTeamRef` (toUpperCase) +
`sameTeam` normaliserar BÅDA sidor till samma rymd FÖRE jämförelse, så driften strukturellt inte kan
uppstå oavsett om konsumenten matar code eller id. **Kanon-rymd = VERSAL** (toUpperCase) för att det
är tipsens lagrings-form och DB-constraintens form (`^[A-Z]{3}$`), så normaliseringen drar mot
write-sidans sanning. Kontraktet är låst i docstrings PÅ poängfunktionerna ("accepterar både code BRA
och id bra, normaliserar"). Test som NÅR seamen: kör de RIKTIGA `computeStandings`/`deriveBracket` på
en fixture, plockar härlett `teamId`/`winnerTeamId` (gemen id), matar mot ett code-lagrat tips, kräver
full poäng. Bevisat true regression: utan normaliseringen failar testet rött med `expected +0 to be 5`.
Detta SLÅR ev. framtida `TeamCode`-branded-type-ambition (lärdomens alternativ a): normaliseringen är
robust även om en otypad sträng slinker in, branded type kan läggas ovanpå senare utan att ändra
kontraktet. (Källa till id-rymden: `teamId` i src/data/wc2026/team-refs.ts; reviewer-lärdom T16 F1.)

## 2026-06-11 , T16 (#16): pool-tipsen, gruppvinnar-tips + bracket-/slutspels-tips (modell + poäng + RLS)

VM-poolens kärna (SPEC §6: GroupPrediction + BracketPrediction). Bygger PÅ T15:s mönster
(scorePrediction, match_kickoffs-deadline-lås, sekretess-RLS, T9:s bracket-struktur), bygger
INTE om. Fyra modell-/regelbeslut, alla med dataintegritet/anti-fusk i fokus (HARD).

**1. GRUPP-TIPS-MODELLEN (källmedvetet):** ett grupp-tips är en gissad (1:a, 2:a) per grupp
(A..L), per rum, per användare. SPEC §6 (GroupPrediction) säger "gissad gruppvinnare/tvåa per
grupp". De TVÅ platserna är de enda direkt-kvalificerade (3:orna seedas av FIFA Annexe C, T4,
inte ett tippnings-moment). Ny tabell `group_predictions` (PK room+group+user, upsert), constraints:
group_id A..L, lag-id = FIFA trebokstavskod `^[A-Z]{3}$`, 1:a <> 2:a.

**2. BRACKET-TIPS-MODELLEN (källmedvetet, det klurigaste valet):** slutspelet börjar EFTER
gruppspelet, så lagen i en tidig slutspels-slot är delvis okända när man vill tippa. Man KAN INTE
tippa "Brasilien vinner sin sextondel" innan man vet att Brasilien hamnar där. **Standard-VM-pool
löser det, och vi följer det:**
  - **PER-SLOT "GÅR VIDARE"-TIPS:** ett tips per slutspelsmatch-slot (M73..M104), man tippar
    vilket LAG som går vidare ur slotten. Låses per matchens EGEN avspark (exakt T15:s deadline-
    modell), så man kan tippa när slottens lag är kända men FÖRE matchen, robust mot att lagen
    avslöjas gradvis under slutspelet.
  - **VM-VINNAR-TIPS (mästaren):** EN separat tippning FÖRE turneringen, låst vid turneringens
    FÖRSTA match (g-A-1). Lagras som slot_id = 'champion'. Detta är "vem vinner hela VM"-momentet
    (störst bonus). Ny tabell `bracket_predictions` (PK room+slot+user, upsert), constraint slot_id
    `^(M(7[3-9]|8[0-9]|9[0-9]|10[0-4])|champion)$` (slutspelsmatcherna + champion, INGA gruppmatcher),
    lag-id `^[A-Z]{3}$`.

**3. BONUS-POÄNGREGLERNA (SPEC tyst på exakta tal -> vedertagen VM-pool-standard, dokumenterad
som medvetet val, INTE gissning):** SPEC §4/§12 säger bara "bonuspoäng" + "rätt utfall vs exakt
resultat" på rubriknivå, inga exakta bonustal. Vi följer den VEDERTAGNA pool-standarden, samma
"mer specifikt/svårare rätt belönas högre"-gradient som T15:s "exakt > utfall":
  - **Grupp:** rätt gruppvinnare (1:a) = **3p**, rätt grupptvåa (2:a) = **2p**, OBEROENDE per
    position (rätt lag fel position ger 0, positionen ÄR tipset, KISS). 1:a väger mer än 2:a (den
    är svårare att pricka), vedertaget i grupp-pooler.
  - **Bracket per-slot:** rätt lag VIDARE ur en slutspelsmatch = poäng som STIGER med rundan
    (R32=1, R16=2, kvart=3, semi=4, brons/final=5). Standard i bracket-pooler (t.ex. ESPN
    Tournament Challenge-familjen: poängen ökar/dubblas per runda); vi väljer en enkel linjär
    1..5, INTE en härmning av en specifik produkts exakta tal.
  - **Mästaren:** rätt VM-vinnare = **20p** (störst, ett svårt enskilt tips). Höjt från 8p i T49
    (#84, se decision-rad nedan).
  **Källa:** vedertagen VM-pool-/bracket-standard (1:a > 2:a; djupare runda väger tyngre; mästaren
  ger störst bonus). Rena funktioner `scoreGroupPrediction` / `scoreBracketAdvance` /
  `scoreChampionPrediction` (`src/data/predictions/bonus-score.ts`), uttömmande testade.
  **VIKTIGT (anti-dubbelräkning):** ett bracket-tips poängsätts mot vem som AVANCERADE (T9:s
  vinnar-härledning inkl. straffar, FIFA Art. 14), INTE mot målställningen, det är skilt från T15:s
  scorePrediction som poängsätter ordinarie mål och räknar ett straff-avgjort slutspel som 'draw'.
  De två tipsformerna mäter olika saker.

**4. DEADLINE-LÅS + SEKRETESS ÄR SERVER-SIDE (RLS), samma anti-fusk-modell som T15 (HARD):** ett
klient-lås räcker inte (anon-rollen är enda rollen, RLS enda skyddet). Klockan = DB:ns `now()`,
aldrig klientens. Deadline-ankarena slås upp i den befintliga `match_kickoffs`-referenstabellen
(T15, redan seedad med alla 104 kickoffs) via TVÅ nya SECURITY DEFINER-helpers (samma härdning som
`match_kickoff`/`is_room_member`: search_path='', EXECUTE för anon/authenticated eftersom RLS-uttryck
körs i anroparens roll):
  - `group_deadline_kickoff(group_id)` = gruppens första match `g-X-1` (per-grupp-lås, inte globalt,
    så grupp L kan tippas efter att grupp A börjat). **Källmedvetet val:** per-grupp är rättvisare
    och KISS, dokumenterat.
  - `bracket_deadline_kickoff(slot_id)` = slottens egen avspark för M73..M104, eller `g-A-1`
    (turneringsstart) för 'champion'.
  Sekretessen: andras tips DOLDA före respektive deadline (SELECT-policy: eget alltid, andras bara
  efter deadline + medlemskap). FAIL-SAFE: en okänd grupp/slot ger NULL-deadline => `now() < NULL` =
  NULL => skriv NEKAS, `now() >= NULL` = NULL => andras tips DOLDA. Ett saknat kickoff kan aldrig
  öppna ett fusk-fönster. Migrationer: `..._t16_group_predictions_schema/rls.sql` +
  `..._t16_bracket_predictions_schema/rls.sql`.

**RLS BEVISAD SERVER-SIDE FÖRE KLIENT-KODEN (playbook-receptet, samma som T14/T15):** senior-
developern bevisade alla garantier med RIKTIGA roller (`set role authenticated` + jwt-claims, ett
självstädande DO/EXCEPTION-block) mot det levande projektet (kmzhyblzxangpxydufve), med tre
kickoff-tider tillfälligt satta i det förflutna och återställda efteråt. **9 prov, alla gröna:**
(G1) medlem får tippa öppen grupp, (G2) deadline-låset NEKAR grupp-tips efter gruppstart
(insufficient_privilege), (G3) förfalskning (grupp-tips i annans namn) nekas, (G4) sekretess: medlem
ser BARA sitt eget grupp-tips på en öppen grupp, (G5) utomstående nekas läs+skriv, (B6) medlem får
tippa öppen slot + champion, (B7) per-slot-deadline NEKAR efter slottens avspark, (B8) champion-
deadline NEKAR efter turneringsstart, (B9) bracket-sekretess: medlem ser bara sitt eget. Proof-data
städades, kickoff-tiderna återställda (verifierat 104 rader, g-A-1/g-K-1/M73 åter på sina riktiga
värden). Klient-integrationstestet (`pool-predictions-rls.integration.test.ts`) täcker det som är
bevisbart via klient-API:t mot en öppen grupp/slot (skippas offline, env-gated, som T14/T15).

**LAG-IDENTITET = `code` (uppercase FIFA-kod), inte `id` (lowercase):** Team.id är gemen landskod
(t.ex. "swe"), Team.code är versal FIFA-kod (t.ex. "SWE"). Pool-tipsen lagrar `code` (matchar
constraint `^[A-Z]{3}$` + är den stabila publika 3-bokstavskoden). bonus-score jämför lag-id-strängar
(vilken konsekvent identitet som helst funkar); UI + framtida T17-aggregering MÅSTE använda `code`
konsekvent.

**TYP-SANNING (samma som T15:s match_kickoff, Copilot C7):** `group_deadline_kickoff` och
`bracket_deadline_kickoff` har TS-typ `Returns: string | null` (hand-rättat i supabase-types.ts), INTE
`string` som generatorn skriver. NULL är fail-safe-regeln ovan; typen måste tillåta null annars antar
framtida konsumenter non-null och tappar säkerhets-invariantens kontrakt.

**ADVISOR-NOTERINGAR (medvetna, samma klass som T14/T15):** `get_advisors (security)` flaggar WARN för
(a) anonym åtkomst-policy på `group_predictions`/`bracket_predictions` och (b) att de två nya
deadline-helpers (SECURITY DEFINER) är anropbara av anon/authenticated. Båda MEDVETNA: anonyma vänner
ÄR användarna, och helpers MÅSTE vara körbara (RLS-uttryck i anroparens roll). Inga nya ERROR-nivå-
fynd, inga "RLS disabled".

**DISPOSITION (medveten halvering, taskens "bygg kärnan solitt"-tillåtelse):** DATAKÄRNAN (schema +
RLS + poäng + klient-API + tester) är byggd FULLT för BÅDE grupp- OCH bracket-tips, det är den
HÖG-RISK-delen (dataintegritet/anti-fusk). UI:t är levererat FULLT för GRUPP-tipsen
(GroupPredictionSection -> Provider -> View -> Form, mounted i App), med samma epoch-vakt/deadline-
tick-rigor som T15. BRACKET-tipsens UI är en PINNAD FORTSÄTTNING (T16b): API:t `bracket-predictions-api`
+ poängreglerna finns och är testade, men en interaktiv bracket-tips-vy (välj vinnare per slutspels-
slot + mästar-väljare, ovanpå BracketView-strukturen från T9) är inte byggd. Skäl: två fulla
provider/view/form-trippler med T15:s rigor är mer än en rimlig task; hellre en solid halva (grupp-UI
+ HELA datakärnan för båda) än två halvfärdiga UI:n. Se HANDOFF.

---

## 2026-06-11 , T15 (#15, C14): stale-request-vakt på savePrediction (samma epoch-mönster som T14 KA-F2)

**Beslut (C14, dataintegritets-fynd):** `PredictionsProvider.savePrediction` gjorde en optimistisk
`setMyPredictions` efter `await upsertMyPrediction` UTAN att kolla att det aktiva rummet fortfarande var
detsamma. `myPredictions` är bara keyad på `matchId`, så bytte vännen rum (A -> B) medan upserten var i
flykt skrev A:s svar in i B:s tips-map (förorening + visar fel rums tips). Fix: samma cancellation-/
epoch-mönster som `RoomsProvider.loadRoomData` (T14, KA-F2) , `savePrediction` bokar `loadTokenRef.current`
(samma token som load-effekten bumpar vid varje rumsbyte) FÖRE await, och droppar den optimistiska
uppdateringen tyst om token ändrats efter await. A:s tips persisteras ändå korrekt på servern (room_id i
upserten), bara den lokala spegeln av ett inaktuellt rum droppas. Load-vägen (`listMyPredictions`-effekten)
hade redan epoch-vakten, så bara save-vägen saknade den; ingen ny seam uppfanns. Regressionstest: starta
save i rum A, byt till B under await, asserta att B:s state = exakt {g-B-9} (A:s g-A-1 droppas, ingen
förorening). Bevisat true regression: utan vakten ger testet `g-A-1,g-B-9`.

## 2026-06-11 , T15 (#15, Copilot C10-C13): fyra review-fynd, disposition

**C10 (åtgärdad) , två tips-index var REDUNDANTA med PK:n, borttagna.** `predictions_room_idx
(room_id)` och `predictions_room_match_idx (room_id, match_id)` är båda exakt LEDANDE PREFIX av
primärnyckeln `(room_id, match_id, user_id)`. **KÄLLA (regeln gissas inte):** PostgreSQL
"Multicolumn Indexes" (https://www.postgresql.org/docs/current/indexes-multicolumn.html) , ett
btree-index servar sökningar på vilket ledande kolumn-prefix som helst, så PK:ns unika btree-index
täcker redan de två query-formerna (`where room_id = ?` och `where room_id = ? and match_id = ?`).
Tredje frågan, `listMyPredictions` (`where room_id = ? and user_id = ?`), servas också av PK:n
(room_id-prefix + user_id-filter i samma scan), INTE av något av de borttagna indexen. **Bevisat
mot live (kmzhyblzxangpxydufve) med EXPLAIN (enable_seqscan=off):** efter en DROP-i-transaktion-
rollback valde planeraren `predictions_pkey` för ALLA tre formerna (Index Cond room_id / room_id+
match_id / room_id+user_id). De redundanta indexen tillförde bara skriv-amplifiering + lagring.
Droppade via migration `20260611120400_t15_predictions_drop_redundant_idx.sql` (applicerad via MCP,
1:1 med filen, samma T15-mönster) + skema-kommentaren uppdaterad. Live har nu bara `predictions_pkey`.

**C11 (åtgärdad) , `use-deadline-tick` räknar bara om vid SHOW, inte hide.** `visibilitychange`
fyrar både när fliken döljs OCH visas; handlern gatar nu på `document.visibilityState === 'visible'`
så en hide inte ger en onödig setState/re-render (en dold flik renderas ändå inte). SHOW-grenen
(räkna om direkt efter strypt PWA-timer) är oförändrad. Test: `use-deadline-tick.test.ts` (hide ger
INGEN omräkning, show ger det, minut-tick + unmount-städning).

**C12 (åtgärdad) , fail-loud-felet i `PredictionsProvider.savePrediction` skiljer nu på rötterna.**
Tidigare sa det alltid "inget aktivt rum" även när roten var "ingen Supabase-klient". Nu: `!supabase`
-> "ingen Supabase-klient (live ej konfigurerat)" (kollas FÖRST, mer grundläggande brist), annars
`activeRoomId === null` -> "inget aktivt rum". Felsökbart ur texten. Test för BÅDA grenarna.

**C13 (åtgärdad) , RLS-integrationstestets öppna-match-antagande är nu tids-robust.** `OPEN_MATCH`
flyttat från `g-L-5` (27 juni) till `g-J-6` (Jordanien-Argentina, 2026-06-28T02:00:00Z) , den ALLRA
sista gruppspelsmatchen, med KÄNDA lag (grupp J fullständigt lottad) och ett giltigt predictions-
match_id. (Finalen M104 19 juli ligger längre fram men har TBD-lag, därför vald bort.) Avsparken
DÄRIVERAS ur `WC2026_MATCHES` (en sanning, inte hårdkodad här), och en `matchStillOpen`-grind
(`Date.now() < kickoff`, instant-jämförelse = tidszons-oberoende) gör att sviten SKIPPAR rent efter
avspark i stället för att börja falla när RLS låser/döljer matchen. Grinden aktiveras först efter VM:t.

---

## 2026-06-11 , T15 (#15, Copilot C1): tips-låsets re-render kräver en MINUT-tick, inte useTodayKey

**Beslut:** Tipsvyns deadline-lås (`locked = now >= kickoff`, `selectPredictableMatches`) räknas om
via en egen minut-tick-hook (`features/predictions/use-deadline-tick.ts`), inte via `useTodayKey`.
`evalNow` (det tickande nuet) ligger nu i `useMemo`-deps för `predictable`/`openCount`.
**Varför:** `useTodayKey` är referens-STABIL inom en dag (den gatar på dagsbyte), men en avspark
passerar MITT PÅ DAGEN. En dagsnyckel hade alltså aldrig flippat en match som låses kl 15:00, fältet
hade frusit öppet tills manuell omladdning. Granulariteten som behövs är alltså minuten (avspark anges
på hel minut), inte dygnet, men inte heller countdown:ens sekund-tick (overkill, listan ändras bara
vid avsparks-minuter). Samma PWA-medvetna kadens som `useTodayKey` (minut-`setInterval` +
`visibilitychange` så en återaktiverad bakgrunds-flik räknar om direkt). Server-RLS är fortfarande det
RIKTIGA låset; detta gör bara VISNINGEN sann. Regression: PredictionsView.test.tsx (falska timers,
öppen -> låst när tiden passerar avspark).

## 2026-06-11 , T15-visuellt (#15): tips-UI premium-finish, TIPS-KUPONG-identitet (design-frontend)

Det visuella lagret ovanpå senior-devs funktionella tips-UI. Mål: en EGEN identitet för tips
(tips =/= resultat), så det känns KUL att tippa, utan att lämna "arena i kvällsljus"-familjen.

**1. IDENTITET, "TIPS-KUPONG" (taskens punkt 1):** resultatinmatningen (#39) är "arenan/scoreboarden"
(grön pitch, det FAKTISKA spelet). Tips-kortet är "KUPONGEN i handen" , en spelkupong man fyller i
FÖRE avspark. Samma score-grid-formspråk och fast-bredds-kolonner (#39-invarianten ärvd, lagnamn
truncar aldrig in i rutorna), men tonad mot den varma pokal-GULDEN i stället för pitch-grönt: guld
= hopp/vad/hejarklack. Kupong-metaforen bärs av tre RENA dekor-lager (ingen bär text), isolerade i
`tokens.css` §10 (`.vm-coupon-*`): (a) en guld topp-strip (kupong-huvudets kant, inset box-shadow),
(b) en streckad "river-linje" (`.vm-coupon-tear`, repeating-linear-gradient = avrivnings-perforering)
som skiljer kupong-huvudet från ifyllnads-zonen, (c) ett diskret guld-hörn-glow i kort-fonden. Plus
en "TIPS"-eyebrow + biljett-ikon i huvudet och en guld kupong-prick i legenden (i stället för #39:s
gröna puls-prick, så identiteten skiljer sig redan i detaljen). Spar-knappen behåller den GRÖNA
accenten (interaktions-affordans, T7-pin: färg = handling, inte status); kortets signatur är guld.

**2. MITT TIPS, synligt och stolt (taskens punkt 1):** ett sparat tips bekräftas med en FYLLD guld-
bricka med mörk ink + bock ("Sparat"), inte bara diskret grå text. Brickan använder den FÄRG-OBEROENDE
solid-form som "Klar"/"Dagens match"-chippen (T9/T11): solid guld-yta + near-black ink, AA-säker i
BÅDA teman (guld-som-text-på-tint faller annars under AA, den kända fällan). Ny token `--vm-coupon-ink`
(near-black i BÅDA teman: ljus gold #f3c14e mörkt -> 10.90:1, mörk amber #b07d10 ljust -> 5.03:1).
I rubriken: en motiverande räknare ("N matcher öppna att tippa", `role=status`), bara när N > 0 (säger
aldrig "0 öppna", det vore nedslående).

**3. LÅST-LÄGET, elegant + POSITIVT (taskens punkt 2):** efter avspark dämpas kupongen (guld tonas mot
border-tonen, ingen hover-lyft, "inlämnad/avgjord"-känsla) och en låst-etikett visas med ett HÄNGLÅS
(`.vm-coupon-lock-icon`, lugn engångs-puls, nollad vid reducerad rörelse) + texten "Låst vid avspark,
så alla tippar blint, det är spelets rättvisa." Inramningen är POSITIV (en del av spelets rättvisa),
inte frustrerande. Mitt tips står kvar synligt i låst-etiketten ("Ditt tips: 2-1"). Text-lagret rörs
inte av dämpningen (full kontrast). Senior-devs data-attribut + strängar bevarade (testerna gröna).

**4. "GÅ MED I ETT RUM"-läget, INBJUDANDE (taskens punkt 3):** porten till tips är en egen guld-tonad
ruta med en kupong-ikon + tydlig rubrik + förklaring som pekar mot rum-sektionen ("Skapa eller gå med
i ett rum ovanför, så öppnar tips-kupongerna här"), inte bara en grå rad. Känns som en inbjudan, inte
ett felmeddelande. `data-predictions-no-room` bevarat.

**5. GULD-TEXT-DISCIPLIN (lessons aa-kontrast + guld-på-ljus-fällan):** rå `--vm-gold` är DEKOR-färg
(tints, glows, topp-strip, perforering, prickar). All guld-färgad TEXT/ikon som måste LÄSAS (eyebrow,
"mot"-avdelare, hänglås, no-room-ikon, "Tips-ligan"-eyebrow) använder `--color-warning` , den AA-SÄKRA
guld-text-tonen per tema (#f3c14e mörkt, djup amber #8a5a05 ljust). Felytan blandas mot OPAK surface
(inte transparent), så kupongens guld-glow inte sänker fel-textens kontrast (canvas-komposit-fälla).

**KONTRAST UPPMÄTT (canvas-komposit, VÄRSTA fall, alfa-blend över base-yta, BÅDA teman, ej typfall):**
varje text-/ikon-yta mätt mot den FAKTISKT komponerade fonden (guld-glow/tint inräknad), inte mot
token-hex:en. ALLA klarar WCAG AA som NORMAL text (>= 4.5:1), inkl. de element vars formella krav
bara är 3:1 (ikoner). MIN-värden: **mörkt tema 5.61:1, ljust tema 4.81:1.** Per yta (mörkt / ljust):
- Eyebrow "TIPS" (warning) på kupong-fond: 8.40 / 5.37
- Legend matchnamn + lagnamn (fg) på kupong-fond: 12.68 / 16.22
- Kod-chip text (fg) på guld-16%-tint: 8.78 / 13.73
- "mot"-avdelare (color-mix warning 50% / fg-muted) på kupong-fond: 7.16 / 5.79
- Låst-rubrik (fg) / låst-förklaring (fg-muted) på låst-yta (guld 7% / bg): 15.16, 7.46 / 15.12, 5.51
- Hänglås-ikon (warning) på låst-yta [krav 3:1]: 10.03 / 5.00
- Sparat-bricka ink (near-black) på SOLID guld: 10.90 / 5.03
- Räknar-chip (fg-muted) på guld-8%-tint: 6.39 / 5.97
- "Gå med i rum"-rubrik (fg) / brödtext (fg-muted) på guld-6%-yta: 13.56, 6.67 / 16.77, 6.11
- "Gå med i rum"-kupong-ikon (warning) på guld-12%-tint [krav 3:1]: 6.86 / 4.89
- Spar-knapp (accent-fg) på accent: 10.85 / 5.40
- Fel-text (danger) på danger-9%/OPAK-surface: 5.61 / 4.81
Metod: WCAG relativ luminans + ratio, color-mix som sRGB-linjär interpolation, alfa-komposit
source-over. Mätt med en engångsprob (raderad efter, samma mönster som tidigare contrast-mätningar).

**RESPONSIVT + A11Y VERIFIERAT LIVE (Playwright mot dev-render, isolerad harness, raderad efter):**
ingen horisontell overflow på 280 (vikbar cover) / 375 / 768 / 1440 px i BÅDA teman (scrollW == clientW
överallt). Score-gridens fasta kolumner håller linjeringen kort-för-kort även med långa lagnamn
("Bosnien och Hercegovina mot Sydkorea" truncar rent). Fokus-ring bevisad LIVE: score-input +
spar-knapp ger `:focus-visible == true` + `outline: solid 2px` (accent-ring, index.css). Eyebrow-
färgen verifierad live = `rgb(243,193,78)` (warning-token, inte rå guld). Reduced-motion: hänglås-
pulsen gatad under `@media (prefers-reduced-motion: no-preference)` -> ingen animation för reduce.

---

## 2026-06-11 , T15 (#15): tips-motorn, poängregel + deadline-lås + tips-sekretess (SERVER-SIDE)

Fas 2:s kärna. Vänner gissar resultat före avspark, poäng och (T17) topplista. Fyra beslut, alla
med dataintegritet/anti-fusk i fokus (HARD).

**1. POÄNGREGELN (SPEC tyst på detaljnivå -> vedertagen standard, dokumenterad):** SPEC §4/§12 säger
bara "rätt utfall vs exakt resultat" på rubriknivå, inga exakta poängtal. Vi följer den vedertagna
tips-standarden som ett MEDVETET val: **exakt resultat = 3p, rätt utfall (1X2) = 1p, annars 0p.**
Exakt ger 3 (det inkluderar rätt utfall men dubbelräknas inte till 4). Ren funktion `scorePrediction`
(`src/data/predictions/score.ts`), uttömmande testad (alla 1X2-kombinationer + edge-fall).
**Källa:** vedertagen poolspel-standard (t.ex. svenska Stryktipset/europatips-pooler: exakt > utfall).
SPEC anger ingen avvikande regel, så standarden är förvalet, inte en gissning om en specifik regel.

**2. UTFALL (1X2) PÅ ORDINARIE MÅL, inkl. slutspel (källmedvetet val mot SPEC):** ett tips är en
gissning på den ORDINARIE målställningen (home/away). Straffar tippas INTE (se beslut 4). Därför
avgörs BÅDE tippets och det faktiska resultatets 1X2 på ORDINARIE mål. Konsekvens (medveten): en
slutspelsmatch som slutar lika i ordinarie tid och avgörs på straffar räknas som 'draw' (X) i
poängsättningen, även om FIFA Article 14:s straff-vinnare för fram laget i slutspelsTRÄDET. De är
två skilda saker: trädet (vem avancerar) styrs av straffar (T9), tips-poängen av den ordinarie
ställning tipset gällde. Alla tips bedöms på samma plan (ordinarie tid), grupp som slutspel. Detta
är konsekvent och dokumenterat inline i `score.ts`, ingen gissning.

**3. DEADLINE-LÅSET ÄR SERVER-SIDE (RLS), klockan = DB:ns now() (HARD anti-fusk):** ett klient-lås
räcker INTE, en vän kan kringgå klienten och skriva rakt mot Supabase (anon-rollen är enda rollen,
RLS är enda skyddet). Avsparkstiderna är annars STATISK klient-data (`matches.ts`), och en RLS-policy
kan bara läsa data som finns i DATABASEN. **Val: en seedad referenstabell `match_kickoffs`
(match_id -> kickoff), inte en RPC som bär tabellen.** Varför tabell+policy över RPC: det gör
deadline-låset till en deklarativ RLS-invariant (`now() < public.match_kickoff(match_id)` i
INSERT/UPDATE/DELETE-policyerna) som reviewern kan BEKRÄFTA mot källan, samma modell som resten av
T14:s RLS, i stället för att gömma regeln i procedurkod. `match_kickoff(text)` är en SECURITY
DEFINER-helper (samma härdning som `is_room_member`: `search_path=''`, EXECUTE för anon/authenticated
eftersom RLS-uttryck evalueras i anroparens roll). Klockan är `now()` (transaction_timestamp), aldrig
klientens, en klient kan ljuga om sin tid men inte om serverns. FAIL-SAFE: en match utan kickoff-rad
ger NULL -> `now() < NULL` = NULL = skriv NEKAS, och `now() >= NULL` = NULL = andras tips DOLDA, ett
saknat kickoff kan aldrig öppna ett fusk-fönster.

**4. TIPS-SEKRETESS FÖRE LÅS (HARD, T15:s RLS-ansvar):** andra rumsmedlemmar får INTE läsa ditt tips
före matchens avspark. SELECT-policyn: eget tips ALLTID, andras BARA efter avspark (`now() >=
kickoff`) + medlemskap. Avslöjandets UI är T17, men sekretessen lever i T15:s RLS. Bevisat
server-side (se nedan).

**KÄLLÅNKRAD KICKOFF-SEED:** `match_kickoffs`-tiderna genereras 1:1 ur den redan källåkrade
`matches.ts` (`scripts/generate-kickoff-seed.ts` -> `..._t15_match_kickoffs_seed.sql`), värde-låst i
CI av `kickoff-seed.test.ts` (regenerera-och-diffa + mutationstest), så DB-tiden ALDRIG kan drifta
från klient-bundlens tid (annars: match "öppen" i DB men "stängd" i klienten). Samma källåkrings-
mönster som matchplanen. `match_id`-formatet återanvänder T14:s constraint (g-A-1..g-L-6 + M73..M104).

**RLS BEVISAD SERVER-SIDE FÖRE KLIENT-KODEN (playbook-receptet):** senior-developern bevisade alla
garantier med RIKTIGA roller (`set role authenticated` + JWT-claims `sub`/`role`, DO-block) mot det
levande projektet, med en match vars kickoff tillfälligt sattes i det förflutna (alla riktiga VM-
matcher ligger i framtiden) och återställdes efteråt. 7 prov, alla gröna: (1) medlem får tippa öppen
match, (2) deadline-låset NEKAR tips efter avspark (insufficient_privilege), (3) utomstående nekas,
(4) förfalskning (tips i annans namn) nekas, (5a) sekretess: medlem ser BARA sitt eget tips på en
öppen match, (5b) avslöjande: efter avspark ser hen alla, (6) UPDATE efter avspark rör 0 rader (kan
inte ändra ett låst tips), (7) utomstående ser inga tips. Proof-data städades, kickoff-tiderna
återställdes (verifierat 104 rader, g-A-1/g-L-5 åter på sina riktiga värden). Klient-integrationstestet
(`predictions-rls.integration.test.ts`) täcker de delar som är bevisbara via klient-API:t mot en öppen
match (de skippas offline, env-gated, precis som T14).

**PENALTIES UTANFÖR T15:** tips-tabellen bär bara home_goals/away_goals (ordinarie gissning). Slutspels-
/bracket-tips (vem går vidare, straffar) är T16, out of scope här.

**ADVISOR-NOTERINGAR (medvetna avvägningar, samma som T14):** `get_advisors (security)` flaggar WARN
för (a) anonym åtkomst-policy på `predictions` + `match_kickoffs` och (b) att `match_kickoff` (SECURITY
DEFINER) är anropbar av anon/authenticated. Båda MEDVETNA: anonyma vänner ÄR användarna, och
`match_kickoff` MÅSTE vara körbar av anon/authenticated (RLS-uttryck i anroparens roll, samma som
`is_room_member`). `match_kickoffs` har INGEN skriv-policy (referensdata, bara migrationer seedar),
så en klient kan aldrig flytta en deadline. Inga nya ERROR-nivå-fynd, inga "RLS disabled".

**TYP-SANNING `match_kickoff` (#15, Copilot C7):** TS-typen i `supabase-types.ts` är
`Returns: string | null`, INTE `string`. Källa: RPC:n är `select k.kickoff ... where match_id = ...`
(`20260611120200_t15_predictions_rls.sql`), vilket ger NULL för en okänd match. Det NULL:et är
fail-safe-regeln ovan (now() < NULL => skriv nekas, now() >= NULL => andras tips dolda), så typen
MÅSTE tillåta null, annars antar framtida konsumenter non-null och tappar säkerhets-invariantens
kontrakt.

---

## 2026-06-10 , T32 (#54, Daniels feedback 4, fynd 3): hero-etiketten "Dagens match" -> matchens datum när matchen inte är idag

**Beslut:** Etiketten ovanför hero:ns framträdande match (`DailyMatchesView`) säger "Dagens match"
BARA när den matchen spelas IDAG (svensk kalenderdag), annars matchens dag ("torsdag 11 juni",
versaliserat av CSS:ens `uppercase`). Logiken: jämför `localDateKey(matchOfTheDay.kickoff)` mot
`useTodayKey().todayKey`; lika -> "Dagens match", annars `formatDayHeadingNoYear(matchDayKey)`.
**Varför:** Daniel såg "DAGENS MATCH" fast nästa match var dagar bort (turneringen hade inte börjat,
premiär 11 juni). Etiketten ljög. Nu följer den dagen.
**Detaljer:** Ny ren helper `formatDayHeadingNoYear` i `format-datetime.ts` (samma lokala-väggklocka-
tolkning som `formatDayHeading`, men utan årtal, eftersom årtalet är brus i en kort hero-etikett;
navigerings-rubriken behåller årtalet). `useTodayKey` återanvänds (en sanning för "svensk dag nu",
dag-medveten över midnatt/PWA-väckning), ingen egen UTC-datumklippning (känd fälla
`utc-datum-anvant-som-lokalt-datum`). Tester (fejkad Date via `vi.useFakeTimers({ toFake: ['Date'] })`):
idag === matchens dag (11 juni) -> "Dagens match"; idag 10 juni, match 11 juni -> "torsdag 11 juni";
+ helper-enhetstest (med + utan årtal, fail-loud på felformad nyckel). Verifierat LIVE (idag 2026-06-10):
hero:n visar "torsdag 11 juni", inte "Dagens match". Spårbart: #54 + denna rad + `DailyMatchesView.tsx`
+ `format-datetime.ts`.

---

## 2026-06-10 , T32 (#54, Daniels feedback 4, fynd 2): sim-KONTROLLEN flyttad till resultatinmatningen

**Beslut:** `SimulationBanner` (what-if-kontrollen: Starta/Återställ/Avsluta + statusmeddelandet)
flyttades från TOPPEN av sim-zonen till DIREKT ovanför resultatinmatnings-sektionen
(`ResultEntryView`-panelen) i `App.tsx`. Bara banner-elementet flyttade; ordningen är nu
daily -> gruppspel -> "Vad krävs" -> slutspelsträd -> **sim-banner -> Mata in resultat**.
**Varför:** Daniels feedback ("har det med resultaten att göra? placera den över sektionen när man
matar in resultat så den får tydlig koppling"). Sim-läget handlar om RESULTAT (man spelar ut tänkta
resultat), så kontrollen får en tydligare mental koppling när den står vid inmatningen i stället för
högst upp på sidan.
**Bevarat oförändrat:** Sim-RAMEN (`SimulationFrame`) omsluter fortfarande ALLA påverkade vyer
(daily, gruppspel, "Vad krävs", slutspelsträd, inmatning) och bär den app-globala "labbet"-
markeringen (violett ram + tint) + den sticky "Simuleringsläge"-badge:n; ingen datalogik eller
sim-mekanik rördes. Verifierat LIVE: banner-rubriken ("Vad-händer-om") sitter direkt ovanför "Mata
in resultat", och sim-flödet är intakt (Starta -> frame+badge aktiva och omsluter daily + inmatning,
Återställ + Avsluta finns, Avsluta -> neutralt läge igen). Spårbart: #54 + denna rad + `App.tsx`.

---

## 2026-06-10 , T32 (#54, Daniels feedback 4, fynd 1): inställningspanelen hamnade BAKOM sidan, rotorsak + fix

**Symptom (Daniels mobil):** Klick på kugghjulet öppnade inställningarna, men panelen lades
bakom/utanför innehållet och syntes inte.

**Rotorsak (verifierad LIVE i browsern, inte gissad):** `SettingsControl`-overlayn
(`fixed inset-0 z-50`) renderades INLINE inuti appens `<header>`, som är
`sticky top-0 z-10 backdrop-blur-md`. Två CSS-effekter slog samtidigt:
1. **Containing block för fixed:** en ancestor med `transform`/`filter`/`backdrop-filter` blir
   containing block för sina `position: fixed`-descendant (CSS Positioned Layout, MDN
   "Containing block": https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_display/Containing_block).
   Headern har `backdrop-filter: blur(12px)`, så overlayns `inset-0` löstes mot headerns
   64px-box i stället för viewporten (uppmätt: overlayRect 1236×**64**, dialog top **-95**).
2. **Instängd stacking context:** headerns `sticky` + `z-index: 10` skapar en stacking context
   (MDN "Stacking context": https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context),
   så overlayns `z-50` var instängd i headerns z-10-lager och kunde inte nå över `<main>`.

**Fix:** overlayn portaleras till `document.body` via `createPortal` (React DOM). `document.body`
saknar transform/filter/backdrop-filter/stacking-context (verifierat live), så `fixed inset-0
z-50` löses mot viewporten i rot-stacking-contexten och ligger överst, oberoende av VAR triggern
sitter. Efter fixen (live): overlayParent = `<body>`, overlayRect 1237×1222 (full skärm), dialog
centrerad/synlig (desktop) och bottom-sheet (mobil 390px, top 590 = bottom 844), `elementFromPoint`
på dialogens mitt träffar dialogen (ligger överst). **Varför portal och inte att flytta gear-knappen
ut ur headern:** kugghjulet HÖR hemma i headern; portalen är den robusta lösningen som låter
triggern bo var som helst. `TeamProfilePanel`/`OnboardingDialog` "fungerade" bara för att de råkar
renderas utanför en sådan ancestor (inuti `<main>` resp. på rot-nivå), inte tack vare ett topplager.
Spårbart: #54 + denna rad + `SettingsControl.tsx` (createPortal) + nytt regressionstest
(overlayn är ett direkt barn av `document.body`).

---

## 2026-06-10 , T30 (#50): Play Protect-varningen vid Android-install, rotorsak + vad vi kan/inte kan göra

**Symptom (Daniels skärmdump):** Vid installation av PWA:n på Android visar Google Play Protect
"En osäker app har blockerats. Den här appen gjordes för en äldre version av Android och har inte
det senaste integritetsskyddet." Användaren måste klicka förbi, vilket dödar wow-känslan vid delning.

**Rotorsak (researchad, källhänvisad, INTE gissad):** Det är Play Protects **targetSdk-varning**.
Den triggas när en APK:s `targetSdkVersion` är mer än 2 nivåer under enhetens Android-API-nivå.
Källa: Google, "Developer Guidance for Google Play Protect Warnings"
(https://developers.google.com/android/play-protect/warning-dev-guidance), exakt text "This app was
built for an older version of Android and does not include the latest privacy protections".
- När en PWA installeras i Chrome på Android paketeras en **WebAPK** av en **mintningsserver**
  (Chrome/Googles, eller Samsung Internets egen). Det är DEN serverns shell-APK som sätter
  `targetSdkVersion`, inte vårt webmanifest. Chromiums WebAPK-shell deklarerade länge targetSdk 33
  (chrome/android/webapk/shell_apk/AndroidManifest.xml,
  https://chromium.googlesource.com/chromium/src/+/master/chrome/android/webapk/shell_apk/AndroidManifest.xml).
  På Android 15 (API 35) / 16 (API 36) är 33 > 2 nivåer under -> varningen triggas. Play Store kräver
  sedan 2025-08-31 targetSdk >= 35 för nya appar
  (https://support.google.com/googleplay/android-developer/answer/11926878).
- **Samsung-specifikt:** Samsung Internet har en EGEN WebAPK-pipeline (skild från Chrome/Googles), och
  det är främst dessa Samsung-mintade WebAPK:er som Play Protect flaggar, dels på targetSdk, dels på
  "reputation" (okänd app). Källa: Modern Web Weekly #69
  (https://modernwebweekly.substack.com/p/modern-web-weekly-69): "If your PWA installs without
  (technical) issues but is still flagged as unsafe ... the only thing you can basically do is inform
  your users that there's nothing wrong with your PWA and they can safely install it." Daniels
  skärmdump visar Chrome-flikar, men på en Samsung-telefon kan WebAPK:n ändå ha mintats av Samsung
  Internet (ofta förvald webbläsare).

**LIGGER HOS GOOGLE/webbläsaren (utanför vår kontroll, ärligt):** Själva `targetSdkVersion` i WebAPK:n
sätts av mintningsservern, inte av oss. Vi kan inte höja den via manifestet. Det går alltså inte att
garantera bort varningen från vår sida, den försvinner när webbläsar-leverantörerna bumpar sin
mintnings-targetSdk (eller när Play Protects reputationssignal mognar för appen).

**VAD VI ÅTGÄRDADE (det som ligger hos oss):**
1. **Maximera chansen till en RIKTIG WebAPK** (i stället för en legacy genvägs-APK, som Play Protect
   flaggar hårdare). Manifestet flyttades till `src/pwa/app-manifest.ts` och fick ett explicit `id: '/'`
   (stabil app-identitet, frikopplad från start_url; rekommenderat av web.dev
   https://web.dev/articles/add-manifest). Installerbarhets-/ikon-kraven var redan uppfyllda och hålls
   nu källankrade av ett test: minst 192x192 + 512x512 (Chrome Lighthouse "installable-manifest"
   https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest/) och en SEPARAT `maskable`-ikon.
2. **Behöll maskable SKILD från "any".** Den kombinerade `purpose: 'any maskable'` undviks medvetet,
   en maskable-ikon har säkerhetszon-padding och ser för inzoomad ut som vanlig ikon. Källa:
   progressier/DEV "Why a PWA app icon shouldn't have a purpose set to 'any maskable'"
   (https://dev.to/progressier/why-a-pwa-app-icon-shouldnt-have-a-purpose-set-to-any-maskable-4c78).
   `app-manifest.test.ts` failar om någon ikon får en kombinerad purpose.
3. **Ärlig UX i stället för förvirring.** En kort, lugnande rad visas i Android-prompt-läget
   (`ANDROID_PLAY_PROTECT_NOTE`, renderad i `InstallBanner`): appen är säker, varningen är en känd
   Android-varning för webb-appar, välj installera ändå. Detta är exakt vad Googles vägledning
   rekommenderar när varningen inte går att eliminera.

**Play Protect-noten gate:as på Android (#50, C4):** Noten renderades i ALLA `mode === 'prompt'`,
men desktop-Chrome fyrar samma `beforeinstallprompt`-event som Android, så på desktop var raden
missvisande (Play Protect finns inte där). Ny `detectAndroid(nav)` i `install-prompt.ts` (UA-sniff av
`android`-token, bredvid `detectIos`); `InstallBanner` visar noten bara när `mode === 'prompt'` OCH
Android. Källa: MDN "Navigator.userAgent" (https://developer.mozilla.org/en-US/docs/Web/API/Navigator/userAgent),
som varnar att UA-sniff är opålitlig, accepterat medvetet då fel bara ger en kosmetisk extra/saknad
info-rad (install-knappen styrs av event:et, inte av detektionen).

**iOS-vägen verifierad (samma task):** Safari-instruktionen "Tryck på Dela-knappen i Safari och välj
Lägg till på hemskärmen" stämmer mot dagens flöde (iOS 16.4+ / iOS 18: Dela -> Lägg till på hemskärmen).
Källa: MDN "Making PWAs installable"
(https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
Ingen ändring behövdes.

---

## 2026-06-10 , T31 (#51, C1): tomt Spara på en LIVE-match bevarar live (ingen statusregression)

**Beslut:** `intendedStatus` tar nu emot matchens nuvarande status. Vid TOMMA mål bevaras
`live` om matchen redan är live (annars `scheduled`). Ifyllda mål ger som förr `finished`.
**Varför:** `ResultEntryForm` renderas även för en pågående match (`match.status === 'live'`).
Med den gamla regeln (tomt -> alltid `scheduled`) backade ett tomt Spara en live-match till
scheduled, en oavsiktlig statusregression. `live -> live` (utan resultat) är en validerad no-op
enligt `validate-result.ts` `ALLOWED_TRANSITIONS` (live tillåter scheduled/live/finished, och
`status !== 'finished' && hasAnyGoal` är falskt vid tomma mål -> inget result-fel). Nollställnings-
vägen är ORÖRD: en `finished`-match med tömda fält + Spara ger fortsatt `scheduled` (avsiktlig
reset), och "Rensa resultat"-knappen sätter `scheduled` direkt. Källa för övergångsreglerna:
`src/features/results/validate-result.ts` (`ALLOWED_TRANSITIONS`, livscykel scheduled -> live -> finished).

---

## 2026-06-10 , T31 (#51, F1): två likvärdiga vägar att nollställa en spelad match

**Beslut:** En spelad match kan nollställas tillbaka till `scheduled` på två likvärdiga vägar,
båda går genom `intendedStatus` och ger samma validerade back-övergång: (1) tömma båda målfälten
och trycka Spara, (2) "Rensa resultat"-knappen (sparar en entry med tomma mål). Rensa-knappen är
inte den enda vägen, bara en tydligare genväg som syns först när matchen är spelad.
**Varför:** Tidigare docstring i `ResultEntryForm` påstod att nollställning ENBART skedde via
Rensa-knappen. Det var falskt, töm-fält+Spara ger samma resultat. Raden gör beteendet ärligt och
spårbart så nästa läsare inte tror Rensa är en spärr.

---

## 2026-06-10 , T31 (#51, Daniels feedback): auto-spelad vid spar, status-väljaren borttagen

**Beslut:** Statusväljaren ("Ej spelad"/"Pågår"/"Spelad"-dropdownen) togs bort ur
`ResultEntryForm`. Statusen sätts AUTOMATISKT vid spar och HÄRLEDS ur målfälten
(`intendedStatus`): något måltal ifyllt -> `finished` (spelad), inga mål -> `scheduled`.
Ett halv-ifyllt fall (bara ett mål) härleds till `finished` och fångas då av valideringens
`finished-without-result` ("kräver både ... mål"), så användaren leds att fylla i båda utan
ett manuellt status-steg. En "Rensa resultat"-knapp lades till, synlig BARA när matchen är
spelad (`match.status === 'finished'`), som sparar en tom inmatning (-> scheduled, inget
resultat) och därmed är den minsta sanna vägen att ÅNGRA/nollställa en spelad match.
**Varför:** Det manuella status-steget var ett onödigt moment (Daniels feedback): när man
skriver in mål ÄR matchen spelad. Härledd status håller UI:t i fas med resultatet utan en
extra väljare. **Bevarat oförändrat:** (a) T9:s slutspels-/straffvalidering (FIFA Art. 14):
straff-fältens synlighet drivs nu av den härledda statusen i stället för väljaren, men
`validate-result.ts` + `apply-match-result.ts` är ORÖRDA, så lika slutspelsmatch + straffar
= spelad, och lika utan straff-vinnare = valideringsfel, precis som förr. (b) Rum-läget (T14)
och sim-läget (T12): `submitResult`-seamen tar fortfarande en entry med status, och formuläret
skickar den härledda statusen, så bägge vägarna fungerar oförändrat (verifierat: hela sviten
grön, inkl. rooms-wiring- och simulerings-integrationstesterna). `validate-result`-koden
`result-without-finished` är nu onåbar FRÅN formuläret men kvar för det lägre API-kontraktet
(direkta `submitResult`-anropare), ärligt behållen.

**Beslut:** T2:s showcase-block i `App.tsx` (Paletten/Rörelsen-griden under rubrikerna
"Designfundament"/"Levande känsla" + Typografi-provet) togs bort ur den renderade vyn, och de
nu föräldralösa komponenterna `src/components/foundation/SwatchGrid.tsx` + `MotionDemo.tsx`
raderades (inga tester använde dem). Footer-prosan "Fundamentet är på plats: ..." (byggnadsställnings-
text) ersattes med en färdig rad. Tema-TOGGLEN i headern är INTE showcasen och är kvar (riktig funktion).
**Varför:** Showcasen var en byggnadsställning från T2 för att premium-känslan skulle synas på tidiga
PR-förhandsvisningar. På den färdiga appen (riktiga matchvyer + tips-liga) blev den brus som drog
fokus från innehållet. Daniels feedback (#51). Inga tester refererade showcase-texten, så App-smoke-
testerna (h1 = "VM 2026", main-landmark, tema-toggle, 12 grupptabeller) förblir gröna oförändrade.

## 2026-06-10 , T14 COPILOT-RUNDA 1 (issue #14): 7 fynd åtgärdade (C1-C7)

**Beslut (C1, DB-INTEGRITET, halv-straff-läcka i `rmr_penalties_paired`, KÄLLHÄNVISAT):** Den
ursprungliga CHECK:en var `(home IS NULL AND away IS NULL) OR (home >= 0 AND away >= 0)`. Den
SLÄPPER IGENOM ett halvt straff-par (t.ex. `home = NULL, away = 3`): gren 2 blir `(NULL >= 0) AND
(3 >= 0)` = `NULL AND TRUE` = `NULL`, och en Postgres-CHECK avvisar BARA på `FALSE`, ett `NULL`-
resultat behandlas som godkänt. **Källa:** PostgreSQL-dokumentationen "Constraints / Check
Constraints" (en check är uppfylld när uttrycket är TRUE eller NULL; bara FALSE bryter den), +
Copilot-fynd C1. **Fix:** ny migration `20260610190000_t14_rmr_penalties_paired_strict.sql` som
ersätter constrainten så straff-grenen kräver BÅDA `IS NOT NULL` (och icke-negativa); då matchar
ett halvt par varken "båda null"- eller "båda satta"-grenen och avvisas hårt. **Verifierat LIVE
(kmzhyblzxangpxydufve)** via MCP: före fixen accepterades en `(NULL, 3)`-rad; efter fixen nekas den
(check_violation), medan ett fullt par `(5, 4)` och ett `(NULL, NULL)`-par fortfarande accepteras.
All proof-data städades (0 kvarvarande rader). Migration applicerad via `apply_migration`.

**Beslut (C2-C7, övriga runda-1-fynd):** C2, stale schema-kommentar `(M1..M104)` rättad till den
verkliga konventionen (`g-A-1..g-L-6` + `M73..M104`) i core-schema-filens kommentar (ingen live
`COMMENT ON` fanns satt, så filen var hela ytan). C3/C4, `void selectRoom`/`void leaveRoom` i
RoomPanel saknade catch (unhandled rejection + ingen UI-återkoppling); nu egna `handleSelect`/
`handleLeave` som fångar och visar ett fel-notis (samma mönster som create/join, PRINCIPLES §8) +
tester för fel-vägen. C5, ogiltig testdata `match_id: 'M1'` i `rooms-api.test.ts` bytt till giltigt
`g-A-1` (konventionen). C6, docstring i `member-avatar.ts` rättad (implementationen tar första +
SISTA ordets initial, inte "två första orden"). C7, den hårdkodade projekt-URL:en + publishable-
nyckeln i `rooms-rls.integration.test.ts` borttagen ur repot; sviten kräver nu env
(`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`), annars `describe.skipIf` (verifierat: skippar rent
utan env, kör + grön med env).

---

## 2026-06-10 , T14 PANEL-FIXAR (issue #14): KA-F2/KA-F3 wiring + KA-SA1/SA2 härdning

**Beslut (KA-F3, delade rums-resultat vävs in end-to-end, "ni fyller i tillsammans"):** Rum-panelen
LOVAR att medlemmar fyller i matchresultaten ihop, men `saveResult`/`room_match_results` hade ingen
UI-anropare, inget delades. Wiringen sker på den BEFINTLIGA infrastrukturen utan ny apparat:
ResultsProvider ligger NÄSTLAT inuti RoomsProvider (App.tsx), så den läser rums-synken via en NY
tolerant hook `useRoomsSync` (inert utan provider, samma tolerans-mönster som `useFeedbackSettings`,
så alla results-tester utan RoomsProvider är oförändrade). (a) En inmatning i `submitResult` sparas
även till rummet (`upsertRoomResult`) när ett rum är aktivt, optimistiskt + fail-loud-men-icke-
blockerande (ett spar-fel river inte den lokala inmatningen, nästa fokus/online-refetch återhämtar).
(b) Rummets delade resultat vävs in i matchlistan via en REN funktion `applyRoomResults` (återanvänder
`applyMatchResult`, så samma validering + immutabilitet, DRY) ovanpå den SEEDADE BASEN (bevarad
separat så vävningen är idempotent och ett ändrat/borttaget delat resultat backar korrekt). (c) Utan
aktivt rum är allt lokalt precis som förr. **Konflikt: SISTA-SKRIVET-VINNER** (`updated_at`, server-
upsert på PK `(room_id, match_id)`), så den senaste skrivningen från valfri medlem är den delade
sanningen; en refetch hämtar det vinnande tillståndet. **Bieffekt (medveten):** att gå med i ett rum
gör rummets delade resultat till sanningen, en lokal-bara-inmatning gjord INNAN man gick med skrivs
inte automatiskt upp till rummet (rummet är den delade källan; man matar in på nytt om man vill dela).

**Beslut (KA-F2, cancellation-guard mot ur-synk rumsbyten):** `RoomsProvider.loadRoomData` saknade
skydd mot att ett LÅNGSAMT svar för rum A landar EFTER att man bytt till rum B (A:s medlemmar/resultat
skrev då över B:s). Fix: en monotont ökande request-token (epoch) per laddning, bara den SENAST
startade laddningens svar tillämpas, äldre kastas tyst. Acceptanstest mockar `listMembers` med olika
fördröjning, byter rum snabbt och assertar slutstate = senast valda rummet.

**Beslut (KA-F1, rumskods-kombinatorik rättad till 32 tecken):** Alfabetet är 32 tecken (24 bokstäver
a-z minus l/o + 8 siffror 2-9), inte 34. 6 tecken = 32^6 ~ 1,07 mrd kombinationer (inte 34^6 ~ 1,5
mrd, ett räknefel som glömde l/o-uteslutningen). Rättat i `room-code.ts` + denna fil; verifierat
`node -e "A.length=32, A.length**6=1073741824"`.

**Beslut (KA-SA2, match_id-format härdat, KÄLLHÄNVISAT, avviker från direktivet):** `room_match_results.
match_id` var obegränsad `text`. Ny migration lägger `check (match_id ~ '^(g-[A-L]-[1-6]|M(7[3-9]|
8[0-9]|9[0-9]|10[0-4]))$')`. **Regeln är härledd ur de FAKTISKA match-id:na i klient-bundlen, inte
gissad:** planen (`src/data/wc2026`, verifierat mot `getDataSource().getMatches()`, 104 matcher) har
TVÅ id-format, 72 gruppmatcher `g-<A-L>-<1-6>` och 32 slutspel `M73..M104` (FIFA-matchnummer; gruppspelet
bär g-...-id, så M-prefixet börjar vid 73). **Direktivets föreslagna `^M[0-9]{1,3}$` var FELAKTIGT för
denna kodbas** (antog "M1..M104"), det hade NEKAT alla 72 gruppresultat och brutit delnings-funktionen.
Constrainten matchar exakt de 104 giltiga id:na (0 av 104 omatchade) och nekar godtycklig/lång text
(verifierat live: en 10000-teckens match_id nekas, M105/M1/M1-format nekas). Källa: match-schedule-
parser.ts (`id: M${matchNumber}` rad ~475) + wc2026-id-konventionen + live-probe mot getMatches().
Applicerad via MCP `apply_migration` (live-version 20260610184225) + committad fil
`supabase/migrations/20260610160500_t14_room_match_id_format.sql` (konsoliderad slutform, se SA1-noten).

**Beslut (KA-SA1, README-historik-not gjord ärlig):** `supabase/README.md` påstod att `list_migrations`
"visar samma uppsättning" som filerna. Live har 9 migrationer (iterativ historik), committade filer är 4
(konsoliderad slutform). Omformulerat ärligt: konsoliderad slutform, live byggdes via flera iterativa
steg, sluttillstånd funktionellt identiskt verifierat mot `pg_proc`/`pg_policies`/`pg_constraint`,
`list_migrations` är sanningen för exakt historik, inte filträdet (lärdomen committad-migration-pastar-
spegla-live-men-ar-konsoliderad-historik).

---

## 2026-06-10 , T14 VISUELLT LAGER (issue #14): premium-finish på rum-UI:t, delnings-ögonblicket

**Beslut (visuellt lager ovanpå senior-devs seam, rör ALDRIG datalogiken):** Premium-finishen
byggs ENBART ovanpå senior-devs semantik + data-attribut (`data-rooms-*`, role/aria, fält-
etiketter) via en dedikerad `src/features/rooms/rooms.css` + klass-hakar i `RoomPanel.tsx` (samma
seam-princip som GroupTable/BracketView/ScenarioView). All a11y-semantik + alla RoomPanel-tester
står kvar; RLS/auth/rooms-API rörs inte. Auth är anonym, så UI:t antyder ALDRIG lösenord/konto.

**Beslut (rumskoden som stor, kopierbar "biljett", delnings-ögonblicket):** Det aktiva rummet är
en biljett (`.vm-rooms-ticket`) vars huvud bär koden i `2-2.5rem` display-vikt + en KOPIERA-knapp
med tydlig feedback (✓ "Kopierad!" + SR-uppläst, faller till "Markera koden själv" utan Clipboard-
API) och en DELA-knapp (Web Share API på mobil -> systemets delnings-ark, annars kopieras hela
inbjudnings-texten). Logiken bor i två RENA moduler: `share-room.ts` (inbjudnings-text + tunna
clipboard/share-omslag, INGEN datalogik, INGEN auto-join-routing, den vore en data-/routing-ändring)
och `member-avatar.ts`. Verifierat live: kopiera-knappen växlar idle -> copied och åter.

**Beslut (medlemmar som monogram-avatarer, STABIL per-person färg, DRY):** Varje medlem är en chip
med en monogram-bricka: initialer ur visningsnamnet + en hue härledd STABILT ur user-id (inte namn,
så två "Daniel" skiljs åt och ett namnbyte inte byter färg). Hue:n återanvänder lag-färgernas hash
(`hashCode` ur `team-hue.ts`, EN sanning för "sträng -> hue", PRINCIPLES §4, ingen parallell hash).
Den egna medlemmen ("du") får en accent-kant så man hittar sig själv (form, inte enbart färg).

**Beslut (formulären = #39-formspråket, vänliga fel):** Skapa-/gå-med-fälten bär SAMMA premium-
formspråk som resultatinmatningen (#39 FIELD_BASE: stark accent-fokus-ring WCAG 2.4.7 + mjuk hover-
lyft, placeholders), primärknapp = fylld accent (Skapa rum), sekundär = kant-knapp (Gå med). Lokala
besked skiljs i TON: ett VÄNLIGT info-besked (✓, accent-tint) vs ett FEL (!, danger-tint), båda
role="status"/alert (uppläst). Initierings-fel FAIL-LOUD:ar i en danger-tonad ruta (PRINCIPLES §8).

**KONTRAST-VAKT (taskens punkt 4, VÄRSTA FALL, lessons aa-kontrast-pastad-pa-genererad-farg):**
Två generErade/komponerade ytor mättes, inte ett typfall:
- **Avatar-ink på hue-driven tint, svept över ALLA 360 hue:er.** En FAST vit/mörk ink på en
  variabel-mättad yta FALLER vid gult (bevisat: vit ink på pastell = 3.78:1 ljust, under AA).
  Därför är BÅDE ytan och ink:en hue-roterade med LÅST lightness per tema, så hue bara roterar tonen,
  aldrig in i en kontrast-fälla. UPPMÄTT min-ratio över hela spannet (sweep + bekräftat på renderade
  pixlar i webbläsaren): **mörkt 5.89:1 (vid hue 240), ljust 4.94:1 (vid hue 60, gult = värsta)**.
  Initialerna är 12px bold = normal-text-tröskeln (4.5:1) gäller; båda klarar med marginal.
- **Hero-/biljett-text på glow-yta, full komposit-stack.** Texten ligger på samma lager som de två
  radiella glow:erna (grön i övre hörnet, guld i nedre), så en naiv komposit KAN sänka kontrasten
  (grön glow lyfter luminansen -> mörkt tema fg-muted faller, exakt fällan lessons varnar för). En
  rörlig sheen la +0.09 grön ovanpå och knäckte marginalen -> sheenen TOGS BORT (glow:en är helt
  statisk). Glow-alforna är satta så ÄVEN den teoretiskt fulla stacken (grön 0.08 + guld 0.05 i samma
  punkt) håller AA: **mörkt eyebrow 6.11 / rubrik+kod 9.61 / brödtext 4.73; ljust eyebrow 4.59 /
  rubrik+kod 15.20 / brödtext 5.54** (alla >= 4.5:1). Övriga ytor (action-knappar fg på accent-tint
  10.7-15.6:1, info-besked fg 13-16:1, medlems-namn/räknare på surface 6.5-17.9:1) ligger högt.

**Beslut (responsivt + rörelse):** Verifierat live 280/760/1440 px, BÅDA teman: NOLL horisontell
overflow vid 280 (vikbar cover), koden + action-knapparna wrappar rent, medlems-chips + formulär
staplar. Panelen har INGEN egen animation (sheenen borttagen av kontrast-skäl), så reduced-motion
kräver inget rums-specifikt motgift; den enda rörelsen är delade knapp-hover-övergångar (index.css-
grinden nollar dem). **Spårbarhet:** #14 + denna rad + `rooms.css` + `member-avatar.ts`(+test) +
`share-room.ts`(+test) + RoomPanel-testerna (oförändrade, semantiken bevarad).

---

## 2026-06-10 , T14 (issue #14): Supabase + anonym auth + rumskod + RLS, live-växlingen

**Beslut (vad som lagras i molnet vs i bundlen, KÄLLHÄNVISAT VAL):** Bara DELAD/MUTERBAR
state lagras i Supabase, tre tabeller: `rooms` (rum + kort delbar kod + skapare),
`room_members` (medlemskap + visningsnamn), `room_match_results` (delade matchresultat per
rum). Den STATISKA turneringsbasen (lag, grupper, hela spelschemat) STANNAR i klient-bundlen,
den är källåkrad och verifierad i Fas 1 (T4/T4b/T10), ändras aldrig av användare, och att
spegla den i DB:n hade bara dubblerat en redan låst sanning (drift-risk). Därför returnerar
live-datakällan (`createSupabaseDataSource`) SAMMA committade data som fixtures för
getTeams/getGroups/getMatches; det delade tillståndet nås via ett SEPARAT, additivt rooms-API
(`src/data/rooms/`), auth- + RLS-skyddat. Så fixtures-till-live-växlingen för tracker-basen
sker UTAN kod-ändring i konsumenterna (kravet), och rums-lagret är ett nytt seam ovanpå.

**Beslut (LIVE_READY flippad till true, #37-pinnen löst):** T14 byggde den riktiga klienten
(`supabase-browser.ts` singleton + `supabase-client.ts` + rooms-lagret) och flippade
`LIVE_READY = false -> true` i `data-source.ts`, tog bort interims-`console.warn`-grenen, och
uppdaterade guard-testet (nu `LIVE_READY === true`) + de injicerade live-fel-vägs-testerna.
Tvåstegs-gaten består som princip (env UTAN LIVE_READY hade fallit till fixtures). F2-kravet
(hotfix-reviewen): en käll-scan (`data-source.ts?raw`) bevisar att strängen "LIVE_READY=false"
inte finns kvar i koden. Fel-vägs-testerna injicerar nu en REJECTANDE datakälla
(`ResultsProvider`s nya `dataSource`-test-seam + `createFailingDataSource`) i stället för den
gamla kastande stubben, eftersom live-källan nu ger giltig data och inte längre kastar.

**Beslut (anonym auth, friktionsfritt + STABIL identitet):** Inloggning är ANONYM
(`signInAnonymously`, Daniels val: en vän klickar på länken och är inne utan e-post/lösenord).
Visningsnamnet bärs av `room_members.display_name` (per rum), inte av auth-profilen.
Sessionen PERSISTAS (`persistSession: true`, localStorage), så samma anonyma user-id (och
rums-medlemskap) lever mellan sidladdningar, det är det som gör "gå med" beständigt.
`ensureSession` är idempotent (återanvänder en befintlig session). Captcha: AV (Daniels val).

**Beslut (RLS är ENDA skyddet, nycklat på auth.uid() + medlemskap), KÄLLHÄNVISAT till Supabase-
modellen:** I Supabase har anon-rollen SAMMA rättigheter som `authenticated` (anonyma användare
FÅR rollen `authenticated` med `is_anonymous: true`), så Row Level Security är det enda som
skyddar datan. Modellen (migrationer i `supabase/migrations/`, speglade på projekt
kmzhyblzxangpxydufve):
- **rooms:** SELECT för medlemmar (`is_room_member(id)`); INSERT bara som sig själv
  (`created_by = auth.uid()`); UPDATE/DELETE bara skaparen.
- **room_members:** SELECT för medlemmar i samma rum; INSERT/DELETE bara sin egen rad
  (`user_id = auth.uid()`) = "gå med"/"lämna".
- **room_match_results:** SELECT/INSERT/UPDATE/DELETE bara medlemmar i rummet, och `updated_by`
  måste vara `auth.uid()` (ingen förfalskning av vem som skrev).
- **Medlemskaps-helper** `is_room_member(room_id)` är SECURITY DEFINER + `search_path=''` så
  policyn på `room_members` kan fråga `room_members` utan rekursion ("infinite recursion in
  policy"). Den MÅSTE ha EXECUTE för anon/authenticated, RLS-policy-uttryck evalueras i
  ANROPARENS roll (empiriskt bevisat: utan grant -> "permission denied for function").
- **Join-via-kod** (`join_room_by_code`) + **skapa-rum** (`create_room`) är SECURITY DEFINER-RPC:er.
  Join låter ett icke-medlem slå upp EXAKT en kod för att gå med (utan att kunna rad-skanna alla
  rum, ingen öppen SELECT-policy för icke-medlem). Create är ATOMISKT (rum + skaparens medlems-rad
  i en transaktion), annars kan skaparen inte läsa sitt eget rum (select-policyn kräver medlemskap)
  och en `return=representation`-insert nekas. En 42702-kolumn-ambiguitet (OUT `room_id` vs
  `room_members.room_id` i `on conflict`) löstes med `#variable_conflict use_column` +
  `return query select`.

**Beslut (RLS BEVISAD, inte påstådd, med RIKTIGA sessioner):** RLS-modellen är bevisad end-to-end
med TRE riktiga anonyma sessioner (Alice/Bob/Carol) mot det levande projektet, NEKAD OCH TILLÅTEN
(`rooms-rls.integration.test.ts`, 11 fall: utomstående nekas läsa/skriva/skanna, medlem tillåts,
ingen förfalskning av created_by/updated_by, bara skaparen raderar, lämna återkallar åtkomst). En
mock kan inte bevisa RLS (den lever i DB:n); bara olika `auth.uid()` visar nekad vs tillåten
(lärdomen `uttommande-test-vaktar-svagare-invariant`: testet når den gren garantin annars bryts).
Testet skipIf:ar snyggt offline/rate-limitat (anonym sign-in är rate-limitad per IP) så sviten
aldrig rödnar på en extern gräns. `get_advisors (security)` kördes efter migrationerna; alla WARN
är MEDVETNA avvägningar (anonym åtkomst ÄR poängen, RPC:erna är gå-med/skapa-flödet, leaked-
password gäller e-post-auth vi inte använder), se `supabase/README.md`.

**Beslut (synk-status på online-seamen, T13):** Online-indikatorn speglar nu ÄRLIGT synk-läget när
ett live-rum är aktivt (`live`-prop): "Online, synkad" / "Offline, ändringarna synkas när du är
online igen". Utan aktivt rum (lokalt läge) faller den till T13:s "fungerar ändå" (det finns då
ingen delad data att synka, vi lovar aldrig en mekanik som inte gäller). Om-hämtningen sker vid
fokus + online-event (INGEN polling; T18 byter detta mot Supabase Realtime på samma refresh-seam).

**Beslut (rumskods-alfabet, källhänvisat val):** Koden är gemener `a-z` (minus `l`/`o`) + siffror
`2-9` (minus `0`/`1`), ett OTVETYDIGT teckenförråd (Crockford-andan: undvik tecken som förväxlas
muntligt/i chatt). Samma teckenförråd vaktas av DB:ns check-constraint `^[a-z2-9]{4,12}$`, så klient
och databas aldrig driver isär. Teckenförrådet är 32 tecken (24 bokstäver a-z minus l/o + 8 siffror
2-9), så 6 tecken = 32^6 ~ 1,07 mrd kombinationer; UNIQUE i DB fångar den
osannolika krocken (klienten genererar då en ny kod, gissar aldrig att en kod är unik).

**Beslut (INGA secrets i repot, PRINCIPLES §7):** Supabase-URL + publik anon/publishable-nyckel läses
ur env (`import.meta.env`, satta i `.env.local` gitignorad + Cloudflare). Den publika nyckeln är
publik PER DESIGN (skyddad av just denna RLS) men hålls ändå i env, aldrig hårdkodad i källkoden,
så koden inte binds till ett specifikt projekt. **Uppdaterat efter C7 (runda 1):** RLS-
integrationstestet har INGEN hårdkodad fallback till projektets kända publika värden längre, det
KRÄVER `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` ur miljön och `describe.skipIf`:ar hela sviten
om de saknas (de är inga secrets, men behandlas som env-konfig). Se C7-blocket högre upp.

**Spårbarhet:** #14 + denna rad + `supabase/migrations/` (speglade på kmzhyblzxangpxydufve) +
`supabase/README.md` + testerna (RLS-integration, auth, rooms-api, room-code, data-source-flip).

---

## 2026-06-10 , T13 VISUELLT LAGER (issue #13): premium-finish på onboarding/install/settings

**Beslut (onboarding-touren får en "arena i kvällsljus"-hero-strip + CSS-illustrationer):**
Touren är FÖRSTA INTRYCKET för vännerna som öppnar den delade länken, så den lyfts från ett
plant kort till en wow-start. Varje steg får en dekorativ hero-strip (`OnboardingArt.tsx` +
`.vm-onboarding-hero` i tokens.css §9) med samma "arena i kvällsljus"-språk som dagliga hero:n
(§6) och lag-profilen (§7): radiella ljus (pitch-grön ur övre hörnet, varm guld ur nedre) + ett
långsamt ljus-svep (`.vm-hero-sheen`, återanvänt, stannar vid reducerad rörelse). I strippen bor
en stiliserad CSS/SVG-scen per steg (plan med pulsande boll / resultattavla "2-1" / what-if-
förgrening i sim-violett / telefon med app-ikon + "lägg till"-bricka). ALLT är inline SVG +
tema-tokens, NOLL bild-assets (snällt mot LCP). Steg-bytet är en mjuk cross-fade (motion
`AnimatePresence mode="wait"`), gatad på `useReducedMotion` så bytet hoppar rakt vid reducerad
rörelse. Skip ("Hoppa över") är alltid synlig utom på sista steget (där primärknappen "Klart"
stänger ändå), oförändrad logik. Touren visas en gång (localStorage-flagga), oförändrat.

**KONTRAST-VAKT (taskens punkt 4, canvas-komposit VÄRSTA FALL, lessons aa-kontrast-...-varsta-fall):**
En naiv komposit som STAPLADE grön-glow 0.16 + guld-glow 0.12 i SAMMA punkt under brödtext gav
fg-muted = 3.49:1 (mörkt) -> UNDER AA. Lärdomen i praktiken: glow under text kan sänka kontrasten.
DÄRFÖR ligger ALL onboarding-TEXT (eyebrow, rubrik, brödtext, stegräknare, knappar) på den OPAKA
surface-ytan UNDER hero-strippen, aldrig på glow:en. Hero-strippen bär bara dekor (CSS-art + glow
+ sheen, aria-hidden, ingen läsbar text). UPPMÄTT på surface (relativ luminans, `.vmshots/`-skript,
båda teman): accent-eyebrow 9.68:1 (mörkt) / 5.40:1 (ljust), rubrik (fg) 15.24 / 17.91, brödtext +
stegräknare (fg-muted) 7.50 / 6.52, primärknapp (accent-fg på accent) 10.85 / 5.40. Alla >= 4.5:1
(normal text). Glow:en kan per konstruktion inte sänka någon textkontrast (ingen text ligger på
den). Glow-alforna hålls ändå låga (grön 0.16 i hörnet, guld 0.10) så strippen är en lugn stämning.

**Beslut (install-bannerns ikon blir en accent-tonad "app-bricka"):** För att göra erbjudandet
INBJUDANDE (det ska läsa som en app-ikon att lägga till) utan att bli påträngande, läggs install-
ikonen i en mjuk accent-tonad bricka (`color-mix(accent 12% surface)`). UPPMÄTT (`.vmshots/`): den
gröna ikonen på brickan 7.53:1 (mörkt) / 4.57:1 (ljust), båda >= 4.5:1, fast ikonen är aria-hidden
och etiketten ("Installera VM 2026") bär betydelsen. Bannerns logik + a11y (Label-in-Name på "Inte
nu", iOS-instruktionsvarianten) är oförändrad.

**Beslut (OnlineStatusIndicator + haptik/ljud-toggles RÖRS INTE i sak):** Online-indikatorn (lugn
prick + text online, guld-tonad + ärlig "fungerar ändå" offline) och toggle-switcharna (korrekt
`role="switch"` + `aria-checked`, AV som standard) var redan eleganta + a11y-korrekta (verifierat
mot test + DOM-snapshot: dialog med två namngivna switchar, Escape stänger, fokus-fälla). Ingen
visuell ändring behövdes, scope-disciplin. Offline-pillens text (fg) på guld-tinten mäter 11.87:1
(mörkt) / 15.66:1 (ljust), AA med marginal.

**Pinnade pre-existerande fynd (F1 från senior-dev, RÖRDA INTE):** Lighthouse-a11y-fynden
(gold-chip 2.91:1 m.fl.) är pre-existerande och tillhör a11y-passet, inte rörda i detta lager.

---

## 2026-06-10 , T13 (issue #13): installation, onboarding, offline-indikator, haptik/ljud

**Beslut (egen app-settings-feature, KÄLLHÄNVISADE plattformsregler):** Fas 1-poleringen
(installerbar PWA + onboarding + offline-indikator + valbar haptik/ljud) samlas i en ny modul
`src/features/app-settings/`, byggd på SAMMA mönster som resten av appen: ren logik + tunn hook
+ a11y-komponent, persistens via en delad safe-storage-hjälpare. Inga domänregler rörs.

**Beslut (PWA install-prompt, KÄLLHÄNVISAD, gissas inte):** Installations-vägen skiljer sig per
plattform och är en regel som lätt gissas fel, så den är källhänvisad inline (`install-prompt.ts`)
och här. Chrome/Edge/Android fyrar `beforeinstallprompt`: vi `preventDefault`:ar webbläsarens
default-mini-infobar och visar en EGEN diskret install-knapp som anropar `event.prompt()` (web.dev:
"Patterns for promoting PWA installation"). iOS Safari stödjer INTE `beforeinstallprompt` (MDN:
"BeforeInstallPromptEvent" listar Safari som ej stödd), så där visas en INSTRUKTIONS-fallback
("Dela -> Lägg till på hemskärmen"), den enda vägen på iOS. Redan installerad (`display-mode:
standalone` eller iOS `navigator.standalone`) -> ingen prompt. iPadOS 13+ maskerar sig som macOS i
UA men har `maxTouchPoints > 1` (känd UA-fälla, MDN "Navigator.userAgent"), så iOS-detektionen
täcker det. Avfärdande persistas (localStorage) och respekteras permanent. Beslutet är spårbart
via #13 + denna rad + `install-prompt.test.ts` (varje mode-kombination + UA-sniff).

**Beslut (offline = ren PRECACHE, "synk" är ÄRLIGT trivialt idag):** Appen är fixtures-driven, ALL
data ligger i bundlen, så workbox-precachen av det statiska skalet (JS/CSS/HTML/ikoner + det
självhostade typsnittet, 19 entries) räcker för full offline-funktion. `navigateFallback:
'index.html'` (workbox `NavigationRoute`, verifierat i genererad `sw.js`) serverar SPA-skalet vid
en hård omladdning/djuplänk offline. "Synkar vid återuppkoppling" är därför TRIVIALT idag, det
finns ingen server-data att synka förrän T14 (Supabase). Vi lovar ingen synk-mekanik som inte
finns: en online/offline-indikator (`navigator.onLine` + online/offline-event) visar bara nät-
LÄGET. När T14 inför live-data hängs den faktiska om-hämtningen på samma online-seam (pinnat).

**Beslut (haptik + ljud AV SOM STANDARD, SPEC §12):** Oombedd vibration/ljud är påträngande, så
båda kanalerna är AV tills användaren slår på dem i inställningarna (frånvaro av flaggan = av, vi
gissar aldrig att det är önskat). Feedbacken (`feedback.ts`) är CAPABILITY-GATAD: haptik via
`navigator.vibrate` bara om API:t finns (saknas på desktop + iOS Safari), ljud via en kort
PROGRAMMATISKT genererad Web Audio-ton (oscillator + gain-envelope, ingen ljud-asset i bundlen,
PRINCIPLES §11). Feedbacken hängs på den BEFINTLIGA spar-seamen (`handleSaved` i ResultEntryView,
samma seam som målfirandet), invasivt minimum. ResultEntryView läser inställningarna via en
TOLERANT accessor (`useFeedbackSettings`, faller till tyst standard utan provider) så vyn fungerar
fristående precis som det valfria firande-lagret; setter:na (som kräver providern) nås via
`useAppSettings` (fail-loud).

**Beslut (onboarding visas EN gång, a11y-dialog återanvänd):** En kort tour (4 steg: live-vyer,
resultatinmatning, what-if, installera) visas vid första start och aldrig igen efter klar/hoppad
(localStorage-flagga). Dialogen återanvänder EXAKT T10-modalens a11y-kontrakt (role="dialog" +
aria-modal + aria-labelledby, Escape, fokus in/ut, fokus-fälla, explicit reduced-motion-grind
`=== false`). Bakgrundsklick stänger MEDVETET inte (en första-gångs-tour ska inte avfärdas av ett
oavsiktligt klick), användaren väljer "Hoppa över" eller går igenom stegen.

**Beslut (DRY: safe-storage extraherad till delad lib, rule-of-three uppnådd):** Den robusta
localStorage-åtkomsten från T2 (`getLocalStorage`, skyddar mot SecurityError i privat läge/sandbox)
flyttades till `src/lib/safe-storage.ts` som EN sanning, eftersom tema + installation + onboarding +
haptik/ljud nu alla behöver den (PRINCIPLES §4). `theme-core.ts` återexporterar den så inga gamla
call-sites eller tester ändrades. Lib:en lade till generiska flagg-hjälpare (`readStoredFlag`/
`writeStoredFlag`: exakt "1" = sant, false tar bort nyckeln så ingen "0"-rad lämnas).

**Beslut (Lighthouse ÄRLIGT rapporterad, PWA-audit borttagen i LH13):** Lighthouse 13 kör inte
längre den dedikerade PWA-kategorin (borttagen i LH12), så PWA-installerbarheten verifierades
MANUELLT i stället: giltig serverad manifest (name/short_name/start_url/standalone/theme+
background-color/lang/scope), ikoner 192+512 + maskable 512, registrerad service worker (sw.js
200 text/javascript), secure context. Uppmätta kategori-poäng (desktop-preset, lokalt):
Performance 100, Best Practices 96, A11y 93, SEO 91. A11y-fynd som var T13:s (install-knappens
WCAG 2.5.3 label-in-name) rättades; ÖVRIGA a11y-fynd (gold-chip-kontrast + `<abbr>`-kontrast i
tabeller, Wordmark-spanens aria-label, charset-meta efter no-flash-scriptet, robots.txt saknas) är
PRE-EXISTERANDE från T2/T5/T7, utanför T13:s scope, lämnade orörda (skulle riskera regression av
tidigare uppmätt AA-arbete). Spårbart via #13 + denna rad.

---

## 2026-06-10 , T12-visuellt (issue #12): sim-läget får en app-global, färg-oberoende "labbet"-markering

**Beslut (HELA sim-zonen kläs i en markering, inte bara banner-kortet):** När what-if-läget är
PÅ omsluts banner:n + alla simulerade vyer av en tunn wrapper, `SimulationFrame`
(`src/features/simulation/SimulationFrame.tsx`), som läser `simulating` ur den delade storen och
speglar den till `data-simulation-active` på sin rot. CSS-lagret (tokens.css §8) hänger en
violett INRAMNING (inset-ring + mjuk ytterglow via box-shadow, ingen layout-påverkan / CLS) +
en SVAG violett tint (pseudo-yta bakom innehållet) på den haken. Så markeringen täcker hela det
hypotetiska området, inte bara kontrollen, och ingen kan bläddra in i tabell/träd och glömma att
de spelar ut tänkta resultat. Vilo-läge = helt neutral wrapper (ingen ram, ingen tint).

**Beslut (markeringen är FÄRG-OBEROENDE, tonen är bara förstärkning):** En sticky badge
("SIMULERINGSLÄGE" + kolv-ikon + status-prick) följer med vid bläddring och bär signalen i TEXT
+ IKON (role="status", uppläst när läget slås på). Den violetta tonen/ringen ENSAM räcker
aldrig (färgblind/färg-okänslig användare ser badge-texten). Banner-rubriken får dessutom en
kolv-ikon. WCAG 2.3.3: en lugn andnings-puls på status-pricken nollas vid
`prefers-reduced-motion: reduce` (verifierat: `animation-name` blir `none`), ramen blir statisk.

**Beslut (VARFÖR violett, utanför appens rollfärger):** `--vm-sim` (mörkt `#b3a0ff`, ljust
`#5b3bb8`) ligger med flit utanför grön accent / guld-warning / mint-teal success / korall
danger, så sim-ramen aldrig kan läsas som "ett riktigt resultat-tillstånd". Indigo/violett läser
kulturellt som "labb/utkast/hypotetiskt".

**Beslut (KONTRAST mätt som canvas-komposit, värsta fall, BÅDA teman):** den violetta tinten är
en alfa-blend (`--vm-sim` @ 6 %) över sidans fond, mätt genom att komponera färgen över base-ytan
(inte ett typfall). Uppmätta värden (live-renderade pixlar bekräftade Node-alfa-blend):
- Badge-ink PÅ den fyllda violett-pillen: **8.74:1 (mörkt) / 7.60:1 (ljust)**.
- Banner-status (muted) på sitt kort i sim-läge: **7.50:1 (mörkt) / 6.52:1 (ljust)**.
- Muted-text rakt på den 6 %-tintade FONDEN (värsta fall, ingen opak yta under):
  **7.49:1 (mörkt) / 5.50:1 (ljust)**; brödtext (fg) **14.1:1 / 13.5:1**.
- Alla >= 4.5:1 (normal text). Ringen + glow:en bär ALDRIG text, kan inte sänka kontrast.
Mätmetod + lärdom (fast HSL/alfa garanterar inte fast kontrast, mät värsta fallet): lessons
`design-frontend.md` (aa-kontrast-canvas-komposit). Verifierat 280-1440 px (ingen horisontell
scroll vid 280) och i båda teman.

**Spårbarhet:** UX/produkt + intern design-regel, ingen extern auktoritativ källa. Spårbar via
#12 + denna rad + testerna (`SimulationFrame.test.tsx` markering finns bara i sim-läge + är
text-buren/färg-oberoende, `SimulationBanner.test.tsx` oförändrad). Tokens i `tokens.css` (§
SIM-TON + §8), wiring i `App.tsx`.

**Beslut (sim-overlayt är medvetet icke-persistent):** Sim-läget nollställs vid sidladdning. En PWA-omladdning (eller "Återställ allt") ger alltid tillbaka den riktiga datan. Beteendet är korrekt och avsiktligt: sandlådan ska vara lätt att lämna och får aldrig riskera att hypotetiska resultat förväxlas med sparad verklig data efter en session.

---

## 2026-06-10 , T12 (issue #12): What-if-simulatorn = hypotetiskt overlay ovanpå den delade storen

**Beslut (arkitektur, minsta sanna):** What-if-läget är INTE en egen datakälla eller en
parallell store, det är ett HYPOTETISKT OVERLAY (`Map<matchId, Match>`) ovanpå SAMMA
matchlista som alla vyer redan härleder ur (SPEC §6, härledd state). Overlayt + sim-läget bor
i den befintliga `ResultsProvider` (den äger redan matchlist-seamen), så ingen ny provider och
ingen dubbellagring behövs. Storen exponerar nu `matches` som EFFEKTIVA matcher
(`simulating ? riktiga + overlay : riktiga`), plus `simulating` + `enterSimulation` /
`exitSimulation` / `resetSimulation`. Sammanvävningen är en REN funktion
(`src/features/simulation/apply-simulation.ts`, `applySimulationOverlay(realMatches, overlay)`),
React-fri och fristående testad. **Konsumenterna (gruppspel, slutspelsträd, "Vad krävs",
inmatning) är OFÖRÄNDRADE**, de läser bara storens `matches` som vanligt och reagerar därför
automatiskt på sim-läget. Det är hela poängen med den härledda-state-arkitekturen.

**Beslut (ISOLERINGEN är en kod-invariant, riktig data skrivs ALDRIG i sim-läge):** En intern
`realMatches` är den enda sanningen. `applySimulationOverlay` tar den `readonly` och muterar
den ALDRIG (bygger en ny array), så ett hypotetiskt resultat kan per konstruktion inte ändra
den riktiga datan. Skriv-seamen ruttas av läget: `submitResult`/`setMatches` skriver OVERLAYT i
sim-läge (riktig data orörd) och den riktiga datan annars. Båda skrivvägarna är läges-medvetna
(försvar på djupet). Bevisat med negativ kontroll: stänger man av BÅDA sim-grenarna rödnar 6
isolerings-/blanda-tester (de är alltså äkta skyddsräcken, inte gröna av slump).

**Beslut (BLANDA-fallet, riktig + hypotetisk samtidigt):** Matcher UTAN overlay-post behåller
sina RIKTIGA värden, matcher MED overlay-post visar det hypotetiska. Så en tabell/ett träd
härlett ur de effektiva matcherna blandar riktiga och hypotetiska resultat korrekt. **Overlay
har FÖRETRÄDE** för en match som även har ett riktigt resultat: i sim-läge är det hypotetiska
det användaren spelar ut, så det visas tills overlayn töms. `resetSimulation` (eller en
om-seedning) tömmer overlayn -> det riktiga resultatet syns igen. Overlayt ÖVERRIDER bara
EXISTERANDE matcher (uppfinner ingen ny fixtur); en overlay-nyckel utan riktig match är ett
programmeringsfel och `applySimulationOverlay` FAIL-LOUD:ar (PRINCIPLES §8), eftersom hela
104-matchers-schemat redan finns i den riktiga datan och ett what-if bara spelar ut det.

**Beslut ("Vad krävs"/ScenarioView LÄSER overlayn i sim-läge, medvetet JA):** ScenarioView är
en konsument av samma store-`matches`, så den ser de effektiva matcherna. Det är önskat, hela
poängen är att se vad som krävs i HYPOTETISKA lägen, inte bara i de riktiga. Samma för
slutspelsträdet: ett hypotetiskt komplett gruppspel låser trädet (FIFA-seedningen) i sim-läge
och släpper låset när man avslutar (riktig data tillbaka).

**Beslut (validering gäller hypotetiska resultat, T9-grinden återanvänd):** Ett hypotetiskt
resultat går genom EXAKT samma `validateResultEntry` som ett riktigt (en sanning för
inmatnings-grinden), så T9:s straff-regel (FIFA Article 14: en slutspelsmatch som slutar lika
KRÄVER straffar) gäller även hypotetiska slutspelsresultat. Ingen ny domänregel definieras i
T12, bara overlay-mekaniken ovanpå.

**Beslut (MARKERING + ÅTERSTÄLLNING, design-frontend tar visuell finish):** En egen
`SimulationBanner` (app-globalt band, eftersom sim-läget rör ALLA vyer) bär den FUNKTIONELLA +
tillgängliga markeringen: i sim-läge ett uppläst statusmeddelande (`role="status"`, "Simulering
pågår, de riktiga resultaten påverkas inte") + ett `data-simulation-active`-attribut som
design-frontend hänger en premium-banner/badge på. Toggle (Starta/Avsluta) + "Återställ allt"
(töm overlayn, stanna i sandlådan). **Spårbarhet:** UX/produkt-regel + intern arkitektur,
ingen extern auktoritativ källa, spårbar via #12 + denna rad + testerna (`apply-simulation.test.ts`
isolering/blanda/fail-loud, `simulation-store.test.tsx` toggle/reset/isolering/blanda/validering
+ tabell+träd reagerar, `SimulationBanner.test.tsx` markering/toggle).

---

## 2026-06-10 , T11 (issue #11): Copilot C2 + C3, doc-/text-ärlighet i "Vad krävs" (inga domänregler rörda)

**Beslut (rätta två formuleringar så de matchar vad koden FAKTISKT gör):**
- **C2 (doc-inkonsekvens):** kommentaren vid `resultForOutcome` påstod neutrala marginaler "(1-0 / 1-1 /
  0-1)", men `draw`-grenen returnerar `0-0`, inte `1-1`. Kommentaren rättad till verkligheten
  "(1-0 / 0-0 / 0-1)". `docs/patterns.md` beskrev redan rätt (`1-0/0-0/0-1`), så den lämnades orörd.
- **C3 (vilseledande singular):** `ownResultGuarantees` låser ALLA lagets egna återstående matcher till
  utfallet (vinst/oavgjort), men texterna "Vinst räcker"/"Oavgjort räcker" lät som EN match. Har laget
  fler än en egen match kvar (n=3-fallet) väljs nu plural-text "Vinst i lagets matcher räcker"/"Oavgjort
  i lagets matcher räcker"; singular-fallet behåller nuvarande text. KLASSNINGEN är oförändrad, bara den
  svenska formuleringen. Plural-fallet är testat (lag med två egna matcher kvar -> plural-text, ej singular).

Båda är ren text-/doc-ärlighet (`scenario-engine.ts`), ingen domänregel ändrad. Spårbar via #11 + denna rad + testerna.

---

## 2026-06-10 , T11 (issue #11): Copilot C1, åskådar-lag i "Vad krävs" får ärlig text, aldrig falskt "måste vinna"

**Beslut (villkorstexten ljuger aldrig om eget agentskap):** i scenario-fasen kan ett lag ha spelat
ALLA sina egna matcher medan bara andra lags match återstår (åskådare, t.ex. en grupp där bara A3-A4
är kvar, eller en ofullständig matchlista). Då kan laget varken vinna eller spela oavgjort sig vidare.
Tidigare föll ett sådant lag i `buildCondition`-grenens else och fick "Måste vinna och hoppas på andra
matcher" = objektivt fel. Fix: `hasOwnRemaining(teamId, remaining)` gatar FÖRST i grenen och ger
åskådar-texten "Kan inte påverka själv, avgörs av övriga matcher i gruppen.". KLASSNINGEN (qualified/
eliminated/depends) var redan konservativt korrekt via enumerationen, det var bara TEXTEN som ljög;
fixen rör därför ingen domänregel, bara den svenska formuleringen (`scenario-engine.ts`). Riktad:
ett lag som FAKTISKT spelar i sista matchen behåller sitt egna krav-villkor (testat, båda riktningarna).

---

## 2026-06-10 , T11 (issue #11, design-frontend): premium-finish på "Vad krävs", FÄRG-OBEROENDE status-chips + AA UPPMÄTT i båda teman

**Beslut (visuellt lager, rör ALDRIG semantiken):** Premium-finishen byggs ENBART ovanpå senior-devs
data-attribut (`data-scenario-group/-team/-status/-phase`, `data-scenario-margin-dependent`,
`data-scenario-decided`) via en dedikerad `src/features/scenarios/scenario.css` + klass-hakar i
`ScenarioView.tsx` (samma seam-princip som GroupTable/BracketView, T5/T9). All a11y-semantik + alla
577 tester står kvar. "Arena i kvällsljus" för sista gruppomgångens drama: varje grupp ett kort med
mjuk topp-glow (grön i live-läget, guld när gruppen är färdigspelad), allt via `color-mix`/tema-token
(aldrig rå hex), troget BÅDA teman.

**Beslut (STATUS-CHIPEN färg-oberoende, T7/T8-pin):** Klar/Ute/Beror på skiljs med ett LAGER signaler,
aldrig bara färg: egen GLYF (`✓` / `–` / `◆` via `::before` ur status-attributet) + egen ton + egen
vikt + egen rad-markering. KLAR = succé (solid success-yta + bock + near-black ink = mest tyngd),
UTE = dämpad och RESPEKTFULL (neutral fg-baserad kant-chip + minus-glyf, INTE ett hånfullt rött skrik,
+ raden tonas till 0.72 opacitet), BEROR PÅ = spänning (guld-kant + romb-glyf, glyfen pulserar svagt
när utfallet är målskillnads-beroende). Verifierat live i reduced-motion att tonerna/listerna/glyferna
STÅR KVAR medan rörelsen nollas, så status läses i gråskala/för färgblinda.

**Beslut (KLAR-radens lyft färg-oberoende, exakt GroupTable-mönstret):** Den kvalificerade raden får
vänster-list (`inset 3px box-shadow` mot success-ton) + upphöjd yt-ton + en guld rank-medalj, samma
T7-pin-språk som kvalificeringszonen i grupptabellen, så "klar"-känslan inte hänger på en accent/success-
färg (som sammanfaller i ljust tema). UTE-raden tonas diskret, BEROR PÅ får en subtilare guld-list.

**Beslut (ny token `--vm-on-success`, EGEN mätning):** "Klar"-chip:ens ink på den fyllda success-ytan
fick en egen token (mörkt `#04140b`, ljust `#ffffff`) i stället för återbruk av `--vm-accent-fg`, så ett
framtida success-hue-byte TVINGAR en ny mätning här i stället för att tyst sänka kontrasten (lessons
`aa-kontrast-pastad-pa-genererad-farg`). Mörkt 9.97:1, ljust 5.47:1 (UPPMÄTT).

**Beslut (TOO-EARLY = elegant väntande-tillstånd, inte tom låda):** Fas 'too-early' visar ett lugnt
platshållar-block (stiliserad arena-ring i ren CSS + en varm copy "När färre matcher återstår visar vi
exakt vad varje lag behöver ...") i stället för en rad lag utan klassning. Copyn upprepar INTE frasen
"Inför sista omgången" (den står i rubrik-etiketten, som senior-devs test pinnar exakt 12 gånger), utan
utvecklar vad som väntar.

**Beslut (responsiv korrigering, pre-existerande latent bugg):** Kort-rutnätet saknade `grid-cols-1`
vid bas, så korten flödade i en implicit `auto`-kolumn (= max-content av bredaste kortet) som på 280px
(vikbar cover) blev BREDARE än viewporten och klipptes av appens `overflow-x-clip` (tyst innehålls-
klippning, ingen sid-scroll men avskuret innehåll). Lagt `grid-cols-1` (= `minmax(0,1fr)`) så kolumnen
krymper till viewporten. Verifierat live 280/360/768/1024/1440px: NOLL horisontell overflow, inget
klippt kort, kolumn-antal 1->2->3 (4 vid 2xl).

**Beslut (AA UPPMÄTT, inte påstått, i BÅDA teman, canvas-komposit, lessons aa-kontrast):** All text +
status-glyfer mätt på FAKTISKT renderad yta (komposit av halvgenomskinliga tints mot effektiv bakgrund),
inte mot hex offline, svept mot värsta fallet. **Mörkt tema:** Klar-chip-text/✓ 9.97:1, Beror på-chip-text
11.84:1, ◆-glyf 8.89:1, Ute-chip-text/–-glyf 6.48:1, Klar-rad lagnamn 13.2:1, Klar-rad villkorstext 6.50:1,
fas-etikett (decided 6.45:1 / live 7.5:1), too-early-copy 7.5:1. **Ljust tema:** Klar-chip-text/✓ 5.47:1,
Beror på-chip-text 15.63:1, ◆-glyf 5.17:1, Ute-chip-text/–-glyf 5.81:1, Klar-rad lagnamn 16.04:1, Klar-rad
villkorstext 6.19:1, fas-etikett 5.99:1, too-early-copy 6.52:1. Alla >= 4.5:1 (AA normal text). **Fynd som
rättades:** ◆-glyfen (rå `--vm-gold` #b07d10) föll på 3.17:1 i ljust tema (under AA); fixad till
`color-mix(--vm-gold 70%, --color-fg 30%)` -> 5.17:1 ljust / 8.89:1 mörkt, behåller den varma pokal-tonen.
Ingen AA-siffra här är antagen, varje är uppmätt i webbläsaren (canvas-komposit).

**Beslut (rörelse = CSS, nollad EXPLICIT vid reduced-motion):** Live-pricken, ◆-glyf-pulsen (margin-
beroende) och too-early-ringen är rena CSS-`@keyframes`. Den globala svepande reduced-motion-regeln räcker
inte (fryser keyframes på slutläget), så scenario-rörelsen nollas EXPLICIT med `animation: none` (samma
motgift som hero/bracket). Verifierat live (`emulateMedia reducedMotion: reduce`): `animationName` blir
`none` på live-pricken, margin-glyfen och too-early-ringen, medan de statiska status-signalerna står kvar.

## 2026-06-10 , T11 (issue #11): "Vad krävs"-kalkylatorn, enumererad scenario-motor + ärlig approximation

**Beslut (arkitektur, härledd state + ÅTERANVÄND compute-standings):** "Vad krävs" är en REN funktion
`computeGroupScenario(teamIds, matcher, groupId) -> GroupScenario`
(`src/features/scenarios/scenario-engine.ts`), exakt som tabeller/träd (SPEC §6). För en grupp
enumereras de 3^n W/D/L-utfallen av de ÅTERSTÅENDE matcherna; för VARJE utfall byggs syntetiska
färdiga matcher och tabellen härleds av den redan verifierade `computeStandings` (FIFA-tiebreakers
inkl. re-iteration, T3/T4). INGEN egen tabellogik. Hooken (`use-group-scenarios.ts`) är en tunn
konsument av den delade results-storen (samma sanning som gruppspel/inmatning/träd), så scenarierna
är "live": en inmatning -> ny matchlista -> useMemo räknar om. Vyn (`ScenarioView.tsx`) bär stabil
semantik + data-attribut (`data-scenario-group/-team/-status/-phase/-margin-dependent/-decided`) som
design-frontend stylar premium-finishen ovanpå.

**Beslut (W/D/L-APPROXIMATIONEN, var den ligger + åt vilket håll den är konservativ, HARD):** en
W/D/L-enumeration fixerar POÄNGEN exakt men INTE målsiffrorna, och exakta mål påverkar tiebreaks
(målskillnad b, gjorda mål c). Därför klassas varje lag KONSERVATIVT, BARA på poäng:
- **"Klar" (qualified)** påstås bara när laget är säkert topp-2 i ALLA 3^n utfall, oberoende av
  målskillnad: högst 1 annat lag står >= dess poäng (`securelyTop2`). Även om varje sådant lag vinner
  tiebreaken hamnar laget som värst på rank 2.
- **"Ute" (eliminated)** påstås bara när laget i ALLA utfall har >= 2 lag STRIKT före på poäng
  (`definitelyOutOfTop2`) OCH inte ens kan nå rank 3 med gynnsam marginal (`couldReachThird`, < 3 lag
  strikt före). Ingen marginal kan rädda det.
- **Allt målsiffer-känsligt blir "Beror på"** (med villkoret "i vissa fall avgör målskillnaden" där
  det gäller, flaggat `marginDependent`). Approximationen lutar alltså ALLTID mot "beror på", ALDRIG
  mot ett falskt "klart"/"ute". Bevisat av test: ett konstruerat målskillnads-gränsfall klassas
  aldrig qualified/eliminated, och qualified och marginDependent kan aldrig vara sanna samtidigt
  (`scenario-engine.test.ts`, KONSERVATIVITET-blocket).

**Beslut (BÄSTA-TREA-VÄGEN, kopplad till T4, korsar grupper, uttryckt KVALITATIVT):** en trea
kvalificerar om den rankas topp-8 av de 12 grupptreorna (FIFA Article 13, `rank-third-places.ts`),
vilket beror på ALLA tolv gruppers resultat. Att simulera alla gruppers kombinationer är en
kombinatorisk explosion, så trea-vägen uttrycks kvalitativt: "kan sluta trea, men om det räcker beror
på de andra grupperna". Vi påstår ALDRIG att en viss poäng som trea "räcker" (går inte att bevisa utan
de andra grupperna, gissa aldrig). En färdigspelad grupps trea klassas därför 'depends' (beror på andra
grupper), inte qualified/eliminated.

**Beslut (TRÖSKEL-GARANTI bor i funktionen + randtestad, lessons `uttommande-test-vaktar-svagare-
invariant` Förekomst 3):** 3^n växer exponentiellt, så `MAX_REMAINING_MATCHES = 3` (3^3 = 27 utfall;
VM-formatet har max 2 kvar i sista omgången). Vakten `assertEnumerable` (fail loud, kastar) bor i
motorn och randtestas DIREKT n-1/n/n+1. Men det PUBLIKA `computeGroupScenario` gatar FÖRE vakten och
returnerar fasen `'too-early'` (ett legitimt produkt-läge inför sista omgången, INTE ett fel) när n >
MAX, så vyn aldrig kraschar tidigt i turneringen (där alla 6 gruppmatcher är ospelade, fixtures-läget).
Likaså: en grupp UTAN matchdata (varken spelad eller schemalagd) klassas `'too-early'`, INTE 'decided',
så vi aldrig ger facit på en tom tabell. Båda randfallen testade.

**Spårbarhet:** FIFA-reglerna som motorn LUTAR sig på (tiebreak-ordningen, treplats-rankningen) är redan
källhänvisade i `compute-standings.ts` / `rank-third-places.ts` (Article 13, committat i
`fifa-knockout-rules-source.txt`); T11 definierar INGEN ny domänregel, bara den konservativa
approximationen ovanpå. Approximationen + konservativitets-riktningen är en intern design-regel (gissa
aldrig en garanti W/D/L inte avgör), spårbar via #11 + denna rad + testerna.

---

## 2026-06-10 , T10 (issue #10): Copilot C10, fail-loud-light motståndare i lagets väg

**Beslut (C10, TeamProfilePanel/`opponentName`):** När en match i lagets väg har ett `opponentId` som
är ICKE-null men SAKNAS i `teamsById` (data-inkonsistens) visar panelen nu id-STRÄNGEN i stället för det
maskerande `'Ej klart'`. Ett genuint `null`-motstånd (tomt slutspels-slot innan seedningen) behåller
`'Ej klart'`. **Varför:** `'Ej klart'` betyder "motståndaren är obestämd än"; att återanvända samma text
för ett trasigt uppslag DOLDE felet (såg ut som ett legitimt obestämt slot). Fail-loud-light: visa id:t så
inkonsistensen syns för tittare OCH fångas vid review/test, utan att krascha vyn (KISS). Test:
`TeamProfilePanel.test.tsx` C10-block (id-sträng visas vid miss, `null` visar fortsatt "Ej klart").
**Spårbarhet:** intern UX/fail-loud-rule, ingen extern källa, spårbar via #10 + C10 + denna rad.

---

## 2026-06-10 , T10 (issue #10): Copilot C8+C9, okänt lag ej klickbart + Escape-effekt på stabilt id

**Beslut (C8, GroupTable):** Ett lagnamn i grupptabellen är klickbart (öppnar lagprofilen via
`TeamNameButton`) BARA när laget finns i `teamsById`. Saknas det (data-inkonsistens, `teamLabel`-
fallbacken `{name: id, code: '???'}`) skickar `GroupTable` `teamId={null}`, så `TeamNameButton`
degraderar till ren text. **Varför:** en klickbar knapp för ett okänt id öppnar profil-modalen på ett
lag som `TeamProfilePanel` inte hittar i uppslaget -> `deriveTeamProfile` får ingen träff -> klicket gör
TYST ingenting. Hellre icke-klickbar text (ärlig affordans) än en knapp som ser interaktiv ut men inte
gör något. `teamLabel` returnerar nu även `known` (`team !== undefined`). Fail-loud-light bevarad: id:t
visas fortfarande synligt. Test: `GroupTable.test.tsx` (okänt lag = ingen knapp, känt lag fortsatt klickbart).

**Beslut (C9, TeamProfilePanel, samma fix som C7):** Escape-lyssnarens `useEffect` deps:ar nu på det
STABILA `openProfileId` i stället för `profile`-objektet. **Varför:** `profile` är härlett
(`deriveTeamProfile`) och får ny identitet vid varje store-uppdatering (live/realtid T18 -> `setMatches`),
så `[profile]`-deps remove/add:ade keydown-lyssnaren i onödan vid varje datauppdatering medan modalen stod
öppen (churn). Ofarligt för beteendet (Escape stängde ändå) men onödig avregistrering/registrering per
tick, och inkonsekvent med C7 (fokus-effekten band redan till `openProfileId`). Test:
`TeamProfilePanel.test.tsx` C9-block räknar keydown add/remove över en store-uppdatering (negativ kontroll:
med `[profile]`-deps failar testet, churn fångad). **Spårbarhet:** intern UX/perf-rule, ingen extern källa,
spårbar via #10 + C8/C9 + denna rad.

---

## 2026-06-10 , T10 (issue #10): flake-fix, vänta in passiva a11y-effekter i lag-profil-testet

**Beslut:** Lag-profil-modalens a11y-tester väntar in dialogens passiva öppnings-effekter (fokus
flyttas till stäng-knappen + Escape-lyssnaren registreras) med `await waitFor(() => expect(closeBtn)
.toHaveFocus())` innan de assertar fokus/Escape, i stället för att läsa `activeElement` direkt efter
`findByRole('dialog')`.

**Varför:** ROTORSAK till flaken (#10): React 19 kör passiva `useEffect` ASYNKRONT, så
`findByRole('dialog')` kan resolva i en poll-tick där dialog-noden är committad men fokus-/Escape-
effekterna ännu inte körts (`activeElement` = body). Empiriskt bevisat med en instrumenterad probe
(activeElement = BODY trots committad dialog) under full parallell svit-last (24 forks); rödnade
~2/6 körningar, alltid grön isolerat. Det var INTE `document.hasFocus()` (verifierat: `.focus()`
flyttar `activeElement` korrekt även när `hasFocus()` är false) och INTE userEvent-timing. Att vänta
in fokus-flytten flushar BÅDA effekterna och testar SAMMA invariant utan effekt-flush-race. Negativ
kontroll: med fokus-fällan urkopplad rödnar Tab-testerna fortfarande (2 failed), så de vaktar äkta.



**Beslut:** Den RÅ lag-/grupp-datan (id/namn/kod/grupp + WC2026_GROUPS + WC2026_TEAM_REFS) flyttades
till en egen modul `src/data/wc2026/team-refs.ts` som ALDRIG importerar `team-profiles.ts`. `teams.ts`
importerar bas-listan därifrån och gör BARA profil-berikningen (enrichWithProfile). Profil-generatorn
(`scripts/generate-team-profiles.ts`) och källankrings-testet (`team-profiles-source.test.ts`)
konsumerar `WC2026_TEAM_REFS` DIREKT ur `team-refs.ts`, inte ur `teams.ts`. `teams.ts` återexporterar
`WC2026_GROUPS`/`WC2026_TEAM_REFS` så den publika data-ytan är oförändrad för alla andra konsumenter.

**Varför (det cirkulära bootstrap-beroendet, Copilot C3/C4):** Generatorn/testet läste tidigare
`WC2026_TEAMS`, men den listan berikas på modul-toppnivå med den GENERERADE `team-profiles.ts`. Att
importera `teams.ts` exekverar alltså berikningen, så om den genererade filen saknas eller är trasig
(exakt det läge man vill kunna REGENERERA ur) kraschar import:en med `TypeError: Cannot read
properties of undefined` FÖRE generatorn kört. Låset gav då ett import-fel i stället för det avsedda
diff-felet och filen kunde inte återskapas (moment 22). En profil-oberoende bas-modul bryter cykeln.

**Verifierat (negativ kontroll):** Tömde `team-profiles.ts` -> `npm run gen:team-profiles` lyckas
ändå och återskapar filen VÄRDE-IDENTISK med originalet (48 profiler, 9387 byte). Med den gamla koden
kraschade samma kontroll på `reading 'mex'` vid import. Build/test/lint/format gröna.

---

## 2026-06-10 , T10 (issue #10): lag-profil-modalen, premium-finish (design-frontend)

**Beslut (visuellt lager ovanpå senior-devs funktionella dialog):** Lag-profil-modalen fick en
"arena i kvällsljus"-finish (SPEC §7) UTAN att röra logik/semantik. All a11y-dialog-semantik
(role/aria-modal/aria-labelledby, Escape, klick-utanför, fokus-in + fokus-retur, fokus-fälla) och
alla data-attribut är oförändrade; bara presentation lades på via klass-/data-haken senior-dev lämnade.

**Hero-bandet (per lag distinkt, men kontrast-säkert):** Toppen av panelen tänds med samma
radiella ljus-språk som dags-hero:n, men ur LAGETS egen signaturfärg (`--vm-profile-hue`, samma
hue som TeamFlag-discen via `hueFromCode`, en sanning). Så Brasiliens modal tänds annorlunda än
Bosniens, men alltid inom appens gröna/guld-identitet. Dekoren bor i `tokens.css §7`
(`.vm-profile-hero`), villkorad inline-hue precis som dags-temat.

**KONTRAST-VAKT (UPPMÄTT över VÄRSTA fallet, inte ett typfall, lärdomen aa-...-varsta-fall):**
`--vm-profile-hue` är BARA ett tal och väver in ENBART i hero-bandets `background-image` (dekor),
aldrig i en text-/yt-/kant-token. Glow-alfan är dessutom KONTRAST-LÅST: muted-text (#9cb2a6) ovanpå
glow:ens PEAK i det LJUSASTE hue:t (gult ~58 grader = värsta av alla 360, svept i canvas-komposit)
håller >= 4.5:1 bara om hue-glow <= 0.14 alfa. Vald **0.13 -> 4.71:1** värsta fall (marginal),
guld-ljuset **0.12 -> 4.79:1**. Så ingen lag-hue och ingen text-position kan sänka text-kontrasten
under AA, även om texten låg rakt på en glow-topp (den gör inte det, topparna sitter i hörnen, men
gränsen håller strukturellt). Ljust tema: glow över vitt mörknar pixeln -> höjer kontrast för mörk
text; värsta muted 5.31:1, guld-zon 5.71:1.

**UPPMÄTTA kontrastvärden (canvas-komposit mot FAKTISK renderad bakgrund, live i browser):**
| Element | Mörkt tema | Ljust tema | Krav |
|---|---|---|---|
| Hero lagnamn (display, fg) | 12.66:1 (mätt) / 7.80:1 (värsta glow-topp) | 17.91:1 / 14.57:1 (värsta) | 4.5:1 (delvis large) |
| Hero subline + ranking-etikett (muted, 12px) | 6.23:1 (mätt) / 4.71:1 (värsta glow-topp, alla hue:er) | 6.52:1 / 5.31:1 (värsta) | 4.5:1 (normal) |
| Ranking-värde (#n, display) | 12.66:1 | 17.91:1 | 4.5:1 |
| Stjärn-chip (på surface-raised) | 12.66:1 | 17.91:1 | 4.5:1 |
| Kuriosa-text (muted) | 6.23:1 | 6.52:1 | 4.5:1 |
| Sektionsrubrik (muted, 12px) | 7.5:1 | 6.52:1 | 4.5:1 |
| Vägen: steg-etikett (muted) | 7.5:1 | 6.52:1 | 4.5:1 |
| Vägen: resultat (accent) | #1fe082: 9.68:1 (surface) / 8.04:1 (raised, hover) | #0e7a44: 5.40:1 (surface + raised = vit) | 4.5:1 |
| Stäng-knapp glyf (muted UI) | 7.5:1 | 6.52:1 | 3:1 (UI) |

Alla >= AA som normal text, värsta fallet inräknat. (Accent-värdena i ljust tema är de redan
T8-uppmätta per-yta-värdena från `tokens.css §0`.)

**Responsivt (verifierat live, 280/360/768/1024/1440):** mobil = nästan-fullskärm bottom-sheet
(rundade topphörn, `max-h: 92dvh`, intern scroll på kroppen), desktop (sm+) = centrerad panel
(`max-w-lg`, alla hörn rundade, `max-h: 88dvh`). 280px: ingen horisontell scroll (docScrollW 265 <=
280), panelen ryms i höjd, kroppen scrollar (742 > 597). Långt namn ("Bosnien och Hercegovina")
radbryter snyggt utan att krocka med stäng-knappen (`pr-12`-reserv).

**Rörelse (a11y, WCAG 2.3.3):** overlay tonar in (opacitet), panelen reser sig mjukt (spring
"gentle", y 28->0 + scale 0.98->1). VID REDUCERAD RÖRELSE (eller innan preferensen är känd) reser
panelen INTE alls, bara opacitet. Viktigt fynd: `useReducedMotion()` ger `null` på första
renderingen; `?? false` gav då en 1-frames y=28-flash som en reduced-motion-användare hann se.
Fixat genom att kräva ett EXPLICIT `=== false` (motion-grind), så vi startar i det säkra läget tills
preferensen är känd. Verifierat frame-för-frame i browser: reducerad = `transform: none` varje frame
+ overlay-blur/dim aktiv; tillåten = mjuk y-glidning. Samma kontrakt som Slide/Spring-primitiverna.

**TeamNameButton (klickbar-affordans):** en SUBTIL prickad understrykning som bara tänds på
hover/fokus (`decoration-dotted`, `fg-muted/60`, `underline-offset-3`), så tabellernas lugn bevaras
i vila men "klickbart" signaleras vid interaktion. :focus-visible-ringen (index.css) är fortsatt
primär tangentbords-affordans; understrykningen tänds även där så mus + tangentbord får samma signal.

---

## 2026-06-10 , T10 (issue #10): lag-profil-data källånkrad (FIFA-ranking + stjärnspelare + kuriosa)

**Beslut (källånkrad, gissas ALDRIG, samma mönster som T4/T4b):** Lag-profil-datan
(FIFA-ranking, stjärnspelare, kuriosa per lag) genereras ur ett COMMITTAT källutdrag
(`src/data/wc2026/team-profiles-source.txt`, med URL:er + hämtdatum + radvis data för alla 48 lag)
via en ren parser/validator (`team-profiles-parser.ts`) till den genererade `team-profiles.ts`,
VÄRDE-LÅST mot källan i CI (`team-profiles-source.test.ts`: regenerera-och-diffa + två
mutationstest + 48/48-täckning åt båda håll). Profilerna vävs in i `WC2026_TEAMS`
(`Team.fifaRanking/starPlayers/trivia`) via `enrichWithProfile`, en sanning, inget dubbellagrat.
Reviewern kan BEKRÄFTA varje fält mot källan i stället för att jaga det.

**Källor (hämtade 2026-06-10):**
- **FIFA-ranking:** FIFA/Coca-Cola Men's World Ranking, OFFICIELLA aprilutgåvan (publicerad
  2026-04-01, nästa officiella utgåva 2026-06-11, så aprilutgåvan är den senaste vid byggtillfället).
  Position 1-50 verifierade mot ESPN:s återgivning, korskollade mot Wikipedia (topp 20) +
  whereig.com (full tabell); 50-90 mot whereig.com korskollat mot ESPN + per-lag-sök (t.ex.
  Uzbekistan #50 bekräftat av kun.uz). France 1:a (1877.32 p, tightaste topp-3 i historien).
- **Stjärnspelare:** VM 2026:s slutgiltiga 26-mannatrupper (offentliggjorda 2026-06-02), bekräftade
  mot Al Jazeeras samlade trupplista (alla 48 lag) + Wikipedia. REDAKTIONELLT urval av de mest
  framträdande namnen, MEN varje spelare tillhör bevisligen truppen enligt källa (gissa aldrig). Vid
  osäkerhet färre namn (1-2), aldrig gissade. Alla 48 lag fick minst en källbelagd spelare.
- **Kuriosa:** verifierbara VM-fakta (antal tidigare VM-slutspel FÖRE 2026 + bästa placering), ur
  Wikipedia "FIFA World Cup records and statistics". Tjeckien räknar Tjeckoslovakien; DR Kongo räknar
  Zaire (1974). Debutanter (Uzbekistan, Jordanien, Kap Verde, Curaçao) markeras som VM-debut 2026.

**Beslut ("BÄSTA SPELDRAGET" UTELÄMNAT, ärligt tomt över påhittat):** SPEC §6:s `bestPlay`-fält är
subjektivt/redaktionellt utan källbar grund per lag. Per direktivet (gissa aldrig, HARD) lämnas det
TOMT (`Team.bestPlay` förblir undefined för alla 48 lag, låst av test), i stället för att hitta på en
"bästa speldrag"-text. Profil-vyn använder i stället den VERIFIERBARA FIFA-rankingen som styrke-signal
(omdefinierat till något källbart, per direktivets alternativ). Hellre ärligt tomt än påhittat
(PRINCIPLES §8). Fältet finns kvar i typen så en framtida källbar redaktionell text kan fyllas senare.

**Faktarättning (F1, review 2026-06-10): Spanien-kuriosan var fel i gold-source.** ESP-raden angav
"VM-guld (2010), första titeln på hemma-kontinenten Afrika", ett DUBBELFEL: Spanien är europeiskt och
Sydafrika (VM-värd 2010) är inte dess hemkontinent. Verifierbar fakta: 2010 var den första VM-titeln
vunnen av ett EUROPEISKT lag UTANFÖR Europa. Källraden rättad till "VM-guld (2010), första VM-titeln
vunnen av ett europeiskt lag utanför Europa" och `team-profiles.ts` regenererad (källankrings-låset
låser om grönt). **Varför fångades det inte av låset:** regenerera-och-diffa + mutationstest bevisar
bara REPRODUKTIONS-trohet (`.ts` == källan), aldrig att källans VÄRDEN är sanna; ett faktafel i
gold-source reproduceras troget och passerar grönt. Sanningshalten i varje lätt-gissad domän-fakta
(vem/var/när, kontinent) måste fakta-kollas mot den citerade källan separat från låset.
**Källa:** Wikipedia "2010 FIFA World Cup Final" + "Spain national football team" (web-verifierad
2026-06-10). De ~7 andra stickprovade kuriosa-raderna (MEX/CZE/TUR/SWE/MAR/URU/EGY) var korrekta,
isolerat faktafel, inte systemiskt.

---

## 2026-06-10 , T28 (issue #42, Daniels feedback 2): kontext per match + lättåtkomlig ihopfällning

**Beslut (1, dag-rubriker + kontext per kort):** Resultatinmatningens lista (`ResultEntryView`)
grupperas nu under DAG-RUBRIKER (en `<h3>` per svensk speldag, "torsdag 11 juni 2026"), och varje
matchkort bär en KONTEXT-RAD med avsparkstid (svensk tid) + grupp/steg-etikett ("Grupp A" för
gruppspel, rundnamn som "Kvartsfinal" för slutspel). **Varför:** i den långa listan (särskilt
expanderad) såg man bara lagen, sammanhanget (vilken dag, tid, grupp/runda) tappades (Daniels
feedback 2). **DRY (PRINCIPLES §4):** ingen ny datum-/etikett-logik, allt återanvänder daily-lagret,
EN sanning: `groupMatchesByDay`/`localDateKey` (dag-grupperingen, off-by-one-säker),
`formatDayHeading` (dag-rubriken), `formatKickoffTime` (svensk tid), `stageLabel` (grupp/runda). Ny
ren modul `groupMatchesForEntry` (`src/features/results/group-matches-for-entry.ts`) är ett tunt lager
ovanpå `groupMatchesByDay` som filtrerar bort TOMMA vilodagar (inmatningslistan vill inte ha tomma
dag-rubriker, till skillnad från den dagliga vyns datumnavigering). Kontext-raden
(`MatchContextRow.tsx`) ligger UTANFÖR matchkortets score-grid (`data-result-card-body`), så den kan
ALDRIG bryta #39:s kolumn-linjering (Daniels FÖRSTA feedback). **Samspel med #39-fönstret:**
dag-grupperingen beror BARA på `editable` (alla dagar grupperas alltid); fönstret döljer korten PER
KORT (`hidden`), och ett dag-`<li>` döljs bara när HELA dagen är utanför fönstret, så dag-rubriker är
korrekta även i ihopfällt läge (bara fönstrets dagar syns) och över fönster-gränsen vid utfällning.
Kortens egna `hidden` står oberoende av dag-`<li>`:t, så #39:s C2-invariant (osparad inmatning
överlever expandera/ihopfäll, instansen unmountas inte) är bevarad. Slutspelsmatcher visar rundnamn,
aldrig grupp (de har `groupId` null -> `stageLabel` faller på rundnamnet, källtestat i
`match-display.test.ts`).

**Beslut (2, lättåtkomlig ihopfällning, DUBBLERAD kontroll + fokus-flytt):** Ihopfäll-/expandera-
kontrollen är nu DUBBLERAD (en uppe + en nere om listan), så en toggle ALLTID nås utan att skrolla
till slutet av en utfälld 72-korts-lista. Båda delar EN komponent (`ExpandToggle` i
`ResultEntryView.tsx`), så deras semantik (samma `aria-expanded`, samma `aria-controls`, samma
etikett) ALDRIG kan drifta isär (en sanning för kontrollen, kravet: konsekvent aria på BÅDA). Vid
IHOPFÄLLNING flyttas fokus till den ÖVRE kontrollen (via `requestAnimationFrame` efter render), så
användaren förs upp till listans topp i stället för att bli kvar långt ner vid en kontroll som just
försvann (a11y: "tappa inte bort användaren"). Bara vid ihopfällning, vid utfällning stannar fokus
där användaren var (rätt). Den visuella finishen (accent-tint + chevron, #39) ärvs oförändrad, så de
uppmätta AA-värdena gäller fortfarande. Design-finishen lämnas till design-frontend via stabila
data-attribut (`data-result-day`, `data-result-day-heading`, `data-match-context`, `data-result-time`,
`data-result-stage`, `data-results-toggle-position`).

**Spårbarhet:** detta är en UX-/produkt-regel (Daniels feedback), ingen extern auktoritativ källa att
källhänvisa, spårbar via issue #42 + denna rad. Tester: `group-matches-for-entry.test.ts` (dag-gräns
kring midnatt, vilodagar bort, tom indata), `MatchContextRow.test.tsx` (svensk tid, Grupp A vs
rundnamn, ren rad utan uppläst prick, ikon/chip-a11y), `ResultEntryView.test.tsx` T28-blocket
(dag-rubriker i ihopfällt läge + över fönster-gränsen, dubblerad kontroll med identisk aria, fokus-flytt
vid ihopfällning).

**Beslut (3, VISUELL FINISH, design-frontend-lagret ovanpå):** premium-finish på de tre
kontext-elementen via seamarna, struktur orörd (samma seam-princip).

- *Dag-rubriken* blev en ELEGANT, STICKY avdelare ("arena i kvällsljus"-tonen): en kort accent-glödande
  "tändsticka" (lodrät list) + datumet i display-fonten + en hårfin horisont-linje som tonar grön ->
  guld -> inget åt höger (arena-tier-linjen). Den klistrar inom listan men på `top-16` (inte `top-0`),
  så den KLARAR den sticky sajt-headern (`App.tsx`, ~64px) i stället för att glida in bakom den och
  döljas, då syns DAGEN man skrollar i alltid. En tonad, lätt blur:ad bakgrunds-platta (`--color-bg`
  @ 82%) gör att korten som glider under aldrig syns igenom rubriktexten.
- *Kontext-raden* fick en accent-färgad klock-ikon på tiden (skumbar "tiden först"-affordans) och ett
  STEG-CHIP som ekar TV-badge-/steg-pillen från daily (samma `rounded-pill`-recept, delat designspråk
  via delade klasser/tokens, INTE en duplicerad komponent). Avdelar-pricken togs bort: chip-gränsen
  skiljer tid och steg, så raden läses rent som "21:00 Grupp A".
- *Togglen* (dubblerad) behåller #39:s accent-pill + chevron oförändrad (kravet: konsekvent premium-stil
  uppe + nere). Båda delar `ExpandToggle`, så de är identiska per konstruktion (verifierat live:
  `className` byte-identisk på top + bottom).
- *#39-kolumnerna:* kontext-raden ligger utanför score-grid:en, verifierat LIVE @ 768/1024px att
  hemma-/borta-rutorna, "mot" och Spara är PIXEL-identiska kort-för-kort över 6 kort med olika
  lagnamns-längd.

**Uppmätt text-kontrast (WCAG AA, canvas-komposit av de FAKTISKA renderade färgerna, värsta fall över
båda teman OCH båda bakgrunds-kontexterna, inte ett typfall):**

| Element (text mot komposit-bakgrund) | Mörkt tema | Ljust tema | AA-krav |
|---|---|---|---|
| Dag-rubrik (`fg`) på bandet, över `bg` / `surface` | 16.96 / 16.66 | 16.28 / 16.57 | >= 4.5 |
| Kontext-tid (`fg`) på kort-`surface` | 15.24 | 17.91 | >= 4.5 |
| Steg-chip (`fg-muted`) på chip-tint, över `surface` / `bg` | 6.38 / 7.32 | 5.87 / 5.35 | >= 4.5 |

Lägsta uppmätta TEXT-ratio någonstans = **5.35:1** (steg-chipet, ljust tema, över `bg`), klart över AA:s
4.5:1. De dekorativa (aria-hidden, non-text) elementen mättes också mot >= 3:1-tröskeln: klock-ikonen
(accent) 5.40:1 mot `surface`, accent-"tändstickan" 4.91:1 mot bandet (ljust tema). Mätmetoden följer
playbook-lärdomen: värsta fall över hela värde-spannet (båda teman, båda underliggande ytor), bara det
uppmätta MIN-värdet påstås. Live-verifierat @ 280/360/768/1024/1440, båda teman, expandera/ihopfäll +
fokus-flytt, och `prefers-reduced-motion` (chevron-rotationen blir momentan via index.css-grinden,
inget nytt JS-driven rörelse-lager tillagt).

---

## 2026-06-10 , T9 (issue #9): Copilot R3 (C9-C10), straff-gating + chip-böjning

**Beslut (C9, `penalties-not-applicable` bara när det SÄKERT kan avgöras):** `validateResultEntry`
(`validate-result.ts`) gav förr `penalties-not-applicable` så fort straffar var ifyllda men inte
KRÄVDES, även när de ordinarie målen var ofullständiga/ogiltiga (finished utan bägge mål). Då är
"Ta bort straffmålen" missvisande, för så snart målen rättas till en LIKA ställning blir straffarna
i stället KRÄVDA (FIFA Article 14). Felet gatas nu bakom `penaltiesDefinitelyNotApplicable` =
gruppspel (oavgjort står sig, straffar gäller aldrig) ELLER giltiga ordinarie mål som inte är lika
(avgjord slutspelsmatch). I övriga "ej krävda"-fall bär de ordinarie målen redan sitt eget fel
(`finished-without-result`/heltals-fel), och straffarnas relevans beror på att det felet rättas
först, så straffarna flaggas inte då. **Källa för straff-regeln:** FIFA Article 14
(`fifa-knockout-rules-source.txt`), oförändrad sedan F1/penalties-pinnen, gissas inte. Bevisat:
slutspel finished utan/med-bara-ett/ogiltigt ordinarie mål + straffar -> målfelet, INTE
`penalties-not-applicable`; gruppspel utan mål + straffar -> fortfarande `penalties-not-applicable`
(gäller aldrig i grupp); slutspel med avgjorda mål + straffar -> fortfarande `penalties-not-applicable`.

**Beslut (C10, möjliga-lag-chippet böjs grammatiskt):** Chippets text/aria i `SlotRow`
(`BracketView.tsx`) var alltid plural ("möjliga"), så exakt 1 kvarvarande kandidat läste "1 möjliga
lag", grammatiskt fel. Ny ren hjälpare `possibleTeamsLabel(count)` böjer som `matchCountLabel`:
"lag" är neutrum, så adjektivet böjs "1 möjligt lag" / "n möjliga lag". Samma sträng driver nu både
synlig text och aria-label (en sanning). `SlotRow` exporteras för enhetstest av böjningen (singular
+ plural).

---

## 2026-06-10 , T9 (issue #9): Copilot R2 (C4-C8), bl.a. bronsmatch-ordning + form-synk

**Beslut (C4, bronsmatch FÖRE final i visnings-ordningen):** `ROUND_ORDER` (derive-bracket.ts) och
`ROUND_STEP` (BracketView.tsx) listar nu `third-place` FÖRE `final` (brons-marker = 5, final = 6).
Bronsmatchen (M103) SPELAS före finalen (M104), så trädets kolumner vänster -> höger visar ... semi ->
brons -> final. **Källhänvisad (verifierad mot T4, gissas inte):** VM 2026:s svenska TV-tablå
(`src/data/wc2026/tv-schedule-source.txt`) anger BRONSMATCH lör 18 juli (M103) och FINAL sön 19 juli
(M104); `matches.ts` har kickoff M103 `2026-07-18T21:00:00Z` < M104 `2026-07-19T19:00:00Z`; och
`bracket-structure.ts` (FIFA Art. 12.10-12.11) har M103 = brons, M104 = final. Bägge matas av
semifinalerna (M101/M102), bronsen av förlorarna, finalen av vinnarna.

**Beslut (C5, semantiskt korrekt teststage):** `homeWinsEverywhere()` i derive-bracket.test.ts satte
`stage: 'round-of-32'` på ALLA bracket-matcher (även M103/M104). Använder nu `bm.stage` ur strukturen.
Härledningen läser stage ur strukturen (inte ur Match-objektet), så utfallet är oförändrat, men testdatan
ljuger inte längre om vilken runda en match tillhör.

**Beslut (C6, qualifyingGroups kräver UNIK gruppmängd, inte antal):** `computeThirdPlaceRanking`
(`rank-third-places.ts`) gatade på `ranked.length === GROUPS_TOTAL` (= antal treor). Det blev sant med en
DUBBLETT-grupp + en SAKNAD grupp (t.ex. två A-treor, ingen L): 12 treor till antalet men 11 unika grupper,
så topp-8 seedades på en ofullständig/dubblerad gruppmängd. Samma klass som C3 i derive-bracket. Nu krävs att
Set:et av treornas grupp-id TÄCKER hela `GROUP_IDS` (en av varje, enda sanningen för giltiga grupper); det
garanterar minst 12 treor på köpet. Fail-safe: hellre null än seedning på dubblerad data. Live ofarligt redan
(enda anroparen `deriveBracket` gatar bakom `isGroupStageComplete` som efter C3 kräver unik täckning), men
funktionen är publik (domain/index.ts) och garantin bor nu i FUNKTIONEN. Bevisat: 12-treor-med-dubblett (11
unika) -> null, 13-tabeller-utan-L -> null. **Källa för gruppmängden:** `GROUP_IDS` i `src/domain/types.ts`
(A-L, SPEC §5), samma kanoniska lista som C3.

**Beslut (C7+C8, ResultEntryForm synkar mot extern matchuppdatering, DIRTY-medvetet):** Formuläret seedade
sin lokala `useState` BARA vid mount, så ett externt ändrat resultat (realtid T18, eller samma match ändrad
i den delade storen) visades aldrig i ett redan monterat formulär. Förr "löstes" det för MÅL/status via en
data-beroende re-mount-key i `ResultEntryView` (`${id}-${status}-${homeGoals}-${awayGoals}`), men den (a)
saknade STRAFFARNA, så penalties blev stale (C8, inkonsekvent med målen), och (b) en re-mount KLOTTRAR ÖVER
ett pågående osparat edit. Nu synkar `ResultEntryForm` sig själv via en `useEffect` (C7) som re-seedar mål,
status OCH straffar KONSEKVENT ur matchens nuvarande värden, men BARA när formuläret är "rent" (en
`dirtyRef` sätts vid första lokala ändringen, nollas vid lyckat sparande), så ett pågående lokalt edit
bevaras. Re-mount-keyn i `ResultEntryView` är därmed nedgraderad till en stabil `match.id` (instansen lever
kvar; C2-garantin, osparad inmatning över expandera/ihopfäll, gäller fortfarande). En enda `seedFields(match)`
är sanningen för både init och synk (DRY). Bevisat: extern mål-uppdatering synkar (rent), extern straff-only-
uppdatering synkar (C8), osparat edit bevaras vid extern uppdatering, och efter sparat synkar nästa externa
uppdatering in (dirty nollat).

---

## 2026-06-10 , T9 (issue #9, design-frontend): premium-bracket ovanpå seamen, AA UPPMÄTT i båda teman

**Beslut (visuellt lager, rör ALDRIG semantiken):** Det premium-visuella trädet byggs ENBART ovanpå
senior-devs data-attribut (`data-bracket-round/-match/-slot`, `data-slot-resolution`, `data-winner`,
`data-bracket-scroll/-locked`) via en dedikerad `src/features/bracket/bracket.css` + klass-hakar i
`BracketView.tsx`. All a11y-semantik (6 runda-regioner med exakta aria-labels, h2/h3-hierarki,
`<ul>/<li>`-slots, sr-only "(vidare)", möjliga-chippets aria-label) står kvar, och alla 462 tester är
gröna. "Arena i kvällsljus" för trädet: intensiteten BYGGER mot finalen (numrerad runda-marker 1->6,
semifinalens kant tar accent, FINALEN får en guld-signatur: guld-kant + guld-tint + guld-glow), allt
via `color-mix`/tema-token (aldrig rå hex) så det är troget BÅDA teman.

**Beslut (vinnar-framhävning FÄRG-OBEROENDE, T7/T8-pin):** Den slot som vann (`data-winner`) markeras
med ett LAGER signaler, aldrig bara grönt: accent-kant-bar (form) + accent-tint-yta (yta) + en
medalj-bock ✓ som glyf (ikon) + fetare text (vikt). Verifierat live i reduced-motion att markörerna
STÅR KVAR (bar + tint + bock) medan rörelsen nollas, så vinnaren är tydlig i gråskala/för färgblinda.

**Beslut (avancerings-animation = CSS, inte JS, samma motgift som hero:n):** "Förs fram"-känslan är en
ENGÅNGS glow-puls + medalj-pop i ren CSS (`@keyframes` i bracket.css), ingen layout-påverkan (CLS=0).
Den globala reduced-motion-regeln räcker INTE (den fryser keyframes på slutläget), så bracket-rörelsen
nollas EXPLICIT med `animation: none` vid `prefers-reduced-motion: reduce`. Verifierat live:
`animationName` blir `none` på vinnar-slot, medalj-pseudo och scroll-hintens pil.

**Beslut (responsiv scroll som FEATURE):** Trädet är brett till sin natur. På smala skärmar scrollas
det i sidled (seamens `overflow-x-auto`) med mjuka edge-fade-masker (`mask-image` mot tema) + en mobil
"Svep i sidled →"-hint (döljs >= 1024px). Verifierat live 280/360/768/1024/1440px: NOLL sid-overflow
(dokumentet scrollar aldrig horisontellt, bara bracket-containern), ingen skyldig nod sticker ut.

**Beslut (AA UPPMÄTT, inte påstått, i BÅDA teman, canvas-komposit-metoden):** All text mätt på faktiskt
renderad yta (komposit av halvgenomskinliga tints mot effektiv bakgrund), inte mot hex offline. Mörkt
tema: vinnar-lagnamn 15.8:1, resolved lagnamn 15.24:1, muted positions-etikett 7.5:1, final-text på
guld-tint 7.5:1, möjliga-chip/match-nr-cap 7.5:1, guld marker 11.28:1, runda-titel 8.39:1. Ljust tema:
vinnar-lagnamn 13.62:1, resolved 17.91:1, muted/final-text/chip/cap 6.52:1, runda-titel 5.92:1, final
guld-marker **5.03:1** (alla >= 4.5:1 AA normal text). **Fynd som rättades:** guld-text på vit yta för
final-markern föll på 3.29:1 i ljust tema (under AA). Fixad till en SOLID guld-bricka med near-black
ink (`#1c1403`), samma färg-oberoende AA-säkra mönster som "Dagens match"-chippet (T7-pin): 5.03:1
ljust / ~10.9:1 mörkt. Ingen AA-siffra i denna logg är antagen, varje är uppmätt i webbläsaren.

## 2026-06-10 , T9 (issue #9): slutspelsträdet som härledd state + två källhänvisade FIFA-regler

**Beslut (arkitektur, härledd state):** Slutspelsträdet LAGRAS aldrig, det är en REN funktion
`deriveBracket(grupptabeller, matcher) -> BracketState` (`src/features/bracket/derive-bracket.ts`),
exakt som grupptabellerna (SPEC §6). Tre datadrivna lägen, ingen gissning: (1) gruppspel pågår ->
varje slot visar "möjliga lag" + en grupp-positions-etikett, (2) grupperna klara -> slotarna LÅSES
till riktiga lag (gruppvinnare/tvåa ur tabellerna + de 8 bästa treorna seedade via FIFA Annexe C),
(3) slutspelsresultat -> vinnaren propagerar till nästa slot (en passering i M73->M104-ordning
räcker eftersom en match alltid kommer efter sina föregångare i FIFA-numreringen). Återanvänder HELA
den verifierade T4-motorn (`bracket-structure.ts`, `build-bracket.ts`, `seedThirdPlaces`/Annexe C),
definierar INGEN ny strukturell slutspelsregel. Vyn (`BracketView` + `useBracketData`) är en tunn
konsument av den delade results-storen (samma sanning som gruppspel + inmatning), gatad på `ready`
(samma stale-kontrakt som useGroupData, C8). Designseam: stabila data-attribut (`data-bracket-round/
-match/-slot`, `data-slot-resolution`, `data-winner`, `data-bracket-locked`) så design-frontend bygger
premium-trädet + vinnar-animationen utan att röra semantiken.

**Beslut (KÄLLHÄNVISAD FIFA-REGEL 1, gissas ALDRIG): rankningen av grupptreorna -> de 8 bästa.**
`rankThirdPlaces`/`computeThirdPlaceRanking` (`src/domain/bracket/rank-third-places.ts`) avgör VILKA 8
av de 12 grupptreorna som kvalificerar. Regel: FIFA Article 13, "The eight best-ranked teams among
those finishing third", kriterier a) flest poäng, b) total målskillnad, c) totalt gjorda mål, i ALLA
gruppmatcher. **Viktig tolkning (källhänvisad):** detta är de ÖVERGRIPANDE kriterierna, INTE in-grupp-
ordningens inbördes head-to-head (compute-standings steg 1), eftersom de tolv treorna kommer från
olika grupper och ALDRIG mött varandra, det finns inget inbördes möte att räkna. Kriterium d (kort/
disciplin) + e/f (FIFA-ranking) är inte deterministiskt beräkningsbara ur matchresultaten (samma
avgränsning som compute-standings compareOverall), så vid exakt lika a-c används en stabil groupId-
fallback, UTTRYCKLIGEN dokumenterad som EJ en FIFA-tiebreak. `qualifyingGroups` är null tills HELA
rangordningen är komplett (en trea per grupp, alla 12), inte bara tills 8 treor finns, så ingen
seedning sker på en gissning (fail-safe). **Källhänvisad rättelse (2026-06-10, lokal panel F1 +
lessons `uttommande-test-vaktar-svagare-invariant`, Förekomst 3):** texten sa tidigare "null tills
exakt 8 treor", men koden gatade på `qualified.length === QUALIFYING_THIRDS` (= `slice(0,8).length
=== 8`), sant för ALLA n >= 8 treor, inte bara n === 8 (probe-bevisat: 9/10/11 treor gav `['A'..'H']`,
topp-8 av en DELMÄNGD, inte null). Den AVSEDDA semantiken är "vänta tills ALLA grupptreor är
rangordnade": topp-8 av en ofullständig mängd är en gissning, en grupp som inte spelat färdigt kan ha
en bättre trea och knuffa ut en av de provisoriska 8 (testat: n=12 där grupp L sist får bästa trean
ändrar de kvalificerade). Villkoret uttrycker nu garantin direkt (`ranked.length === GROUPS_TOTAL`,
`GROUPS_TOTAL = GROUP_IDS.length`) och randen 7/8/9/11/12 är testad. Live ofarligt redan förr (enda
anroparen `deriveBracket` gatar bakom `isGroupStageComplete` = alla 12 färdiga = alltid 12 treor), men
funktionen är publik och garantin bor nu i FUNKTIONEN, inte i callerns grind.
**Källa:** Regulations for the FIFA World Cup 26 (May 2026), Article 13, sid. 27-28. Committat verbatim
i `src/domain/bracket/fifa-knockout-rules-source.txt` (pdftotext-utdrag), så reviewern kan BEKRÄFTA
regeln mot källan i stället för att jaga den.

**Beslut (KÄLLHÄNVISAD FIFA-REGEL 2, F1/penalties-pinnen LÖST): straffar i slutspel.** En
slutspelsmatch kan INTE sluta oavgjort (FIFA Article 14): vid lika ordinarie ställning avgör straffar.
Förr tappade results-reducern `MatchResult.penalties` tyst. Nu: `ResultEntry` bär penalties,
`validateResultEntry` tar matchens stage och KRÄVER en avgörande straff-vinnare för en lika
slutspelsmatch (avvisar lika-straffar och straffar där de inte är tillämpliga), `toMatchResult`
BEVARAR straffarna, och `ResultEntryForm` visar straff-fält (`data-penalties-row`) bara vid slutspel +
finished + lika ställning. Vinnar-härledningen i `deriveBracket` läser penalties för att propagera rätt
lag; en lika match UTAN avgörande straffar propagerar INGEN vinnare (fail-safe, ingen gissning).
**Acceptanstest (uppfyllt):** redigera en finished slutspelsmatch med straffar -> penalties bevaras
(`apply-match-result.test.ts` + `validate-result.test.ts`).
**Källa:** FIFA Regulations FWC2026 Article 14, sid. 28, committat i samma källfil.

**Låsnings-regeln (härledd, inte ett flagg-fält):** `isGroupStageComplete` är sann när alla 12 grupper
har varje lag på 3 spelade matcher (`played >= 3`, formatets konstant SPEC §5), härlett ur tabellerna
så det är en ren funktion av sanningen. Först då seedas treorna och slotarna låses.
**Källhänvisad rättelse (2026-06-10, Copilot R1 C3):** villkoret kollade tidigare bara `tables.length >=
12`, ett ANTAL, inte 12 UNIKA grupper. 12 tabeller med en dubblett (två A) och en saknad grupp (ingen L)
hade då låst gruppspelet felaktigt, varpå slot-resolvern slår upp den saknade gruppen, får undefined och
ger en `resolved` slot med `teamId` null (en låst plats utan lag). Nu krävs att Set:et av `groupId` täcker
hela `GROUP_IDS` (en av varje, A-L, enda sanningen för giltiga grupper), vilket på köpet garanterar minst
12 tabeller, i stället för en lös 12:a som antal. Fail-safe: hellre fortsatt "pågår" än en felaktig låsning
på dubblerad/ofullständig data. Bevisat av test (dubblett-scenario: 12 tabeller / 11 unika + 13 tabeller /
L saknas, båda ger false). **Källa för grupp-mängden:** `GROUP_IDS` i `src/domain/types.ts` (A-L, SPEC §5),
samma kanoniska lista som teams/fixtures härleds ur.

---

## 2026-06-10 , #39 (T27) senior-developer: Copilot R1, dag-medvetet fönster (C1) + dolt-ej-filtrerat (C2)

**Beslut (C1, dag-medvetet 3-dagars fönster):** `ResultEntryView` läser inte längre "idag" via ett
fruset `Date.now()`. En ny hook `useTodayKey` (`src/features/daily/use-today-key.ts`) äger ett "nu" som
bara uppdateras när den svenska kalenderdagen FAKTISKT växlar (minut-tick som gatar på dag-byte +
en `visibilitychange`-lyssnare), och vyn memoizerar fönstret på det (`windowMatches(editable, nowMs)`).
**Varför:** appen är en PWA som lämnas öppen hela VM:t (fliken kan stå öppen över midnatt). Det gamla
`useMemo(() => windowMatches(editable), [editable])` läste `Date.now()` internt men berodde bara på
matchlistan, så 3-dagars fönstret frös på första beräkningens dag och flyttade sig inte över midnatt.
`useTodayKey` återanvänder `localDateKey` (EN sanning för svensk-dag, off-by-one-säker) och returnerar ett
referens-stabilt `nowMs` inom en dag, så fönstret räknas om vid dygnsväxling men inte i onödan varje tick.
`visibilitychange` täcker att en bakgrunds-flik får sina timers strypta: appen synkar dagen direkt när den
blir synlig igen. Bevisat: `use-today-key.test.tsx` (fejkad Date, flytt över midnatt, synlighets-synk) +
`ResultEntryView.test.tsx` (vyn visar olika kort premiärdagen vs en vecka senare).

**Beslut (C2, alla kort renderas, de utanför fönstret DÖLJS med `hidden` i stället för att filtreras bort):**
Listan renderar nu ALLA `editable`-matcher som `<li>`, och markerar de utanför fönstret med `hidden`-
attributet (display:none + borttaget ur a11y-trädet) när listan inte är utfälld, i stället för att klippa
bort dem ur den renderade arrayen.
**Varför:** varje `ResultEntryForm` seedar sin lokala `useState` (osparade mål/status) en gång vid mount.
Filtrerades ett out-of-window-kort bort vid ihopfällning unmountades formuläret och OSPARAD inmatning
tappades. Med `hidden` bevaras React-instansen, så ett pågående edit överlever expandera/ihopfäll.
Prestanda-OK: före #39 renderades alla kort jämt, så att hålla dem mounted är inte dyrare än den baseline.
A11y bevarad: dolda kort nås inte av tab/skärmläsare (hidden-attributet sköter det), och `hiddenCount`/
knapptexten stämmer fortfarande (en `fieldset` i ett hidden-träd är inte i a11y-trädet, så
`getAllByRole('group')` räknar bara synliga). Bevisat: `ResultEntryView.test.tsx` (skriv i ett
out-of-window-kort, fäll ihop, fäll ut, värdet kvar). Den ursprungliga fönster-/expandera-regeln
står kvar under "#39 (T27) senior-developer: resultatinmatning, stabilt kolumn-grid + 3-dagars fönster".

---

## 2026-06-10 , #39 (T27) design-frontend: premium-finish på resultatinmatningen (kompakta kort + tydlig expandera)

**Beslut (kompakta kort, "arena i kvällsljus"):** ResultEntryForm-kortet komprimerades ovanpå senior-devs
stabila grid (seamen `data-result-card-body` orörd): padding 16 -> 14px (mobil), kort-gap + fieldset-gap
16 -> 12px, body-grid-gap (10px kolumn / 12px rad), score-input 56 -> 48px hög (font 24 -> 22px, fortfarande
ett bekvämt touch-mål >= 44px, WCAG 2.5.5), och en diskret varm topp-list (`inset 0 1px 0` i `--vm-gold`-mix)
som premium-detalj. Lagnamn fick avsiktlig ellipsis-typografi (dämpad ton + tight tracking) och "mot"-
avdelaren en guld-skiftad ton. Resultat: kort-höjden gick från 213 -> 192px (mobil) och 128px (desktop/
vikbar inner), den "luftiga spill-ytan" i Daniels skärmdump är borta.
**Varför:** Daniels mobil-feedback (#39): korten var luftiga med mycket död yta. Kompaktionen rör BARA
spårbredder/typografi/spacing/dekor (design-frontends lager), aldrig grid-strukturen eller a11y-haken
(`w-16`, `truncate`, `data-result-card-body` är låsta av strukturtesten och bevarade). Inga råa hex, allt
via `color-mix` mot semantiska tokens (samma husstil som GroupTable), så det följer temat.

**Beslut (expandera TYDLIGT SYNLIG):** "Visa alla matcher (N dolda)"-knappen gick från en blek border-pill
till en INBJUDANDE accent-kontroll: en accent-tonad yta (`color-mix(accent 12%, surface)`, hover 20%),
accent-kant (42% -> hover 60%) och en accent-färgad chevron som pekar ner (= mer finns) och vänds 180° i
utfällt läge. Knapptexten + aria-attributen (`aria-expanded`/`aria-controls`/`data-results-toggle`) är
OFÖRÄNDRADE (test-låsta). Chevron-vridningen animeras via `transition-[rotate]` (Tailwind v4:s `rotate-180`
sätter CSS-`rotate`, inte transform, så övergången måste rikta `rotate` för att inte snappa) och nollas av
den globala reduced-motion-regeln (index.css).
**Varför:** Daniel bad uttryckligen att göra den "tydligt synlig, omöjlig att missa, men inte skrikig".
En låg-alfa accent-tint + kant + chevron drar ögat utan att bli en fylld accent-knapp (den tonen är
reserverad för primär-action Spara), så hierarkin hålls.

**UPPMÄTTA kontraster (WCAG AA, canvas-komposit i webbläsaren, BÅDA teman, värsta uppmätta = min):**
Endast uppmätta värden, inga antagna (lessons `aa-kontrast-pastad...`). Mätmetod: rendera elementets
faktiska color över sin faktiska yt-färg på en 1x1-canvas, läs sRGB-byte, räkna WCAG-ratio.
- Expandera-knappens text (`--color-fg`) på sin accent-tint-yta: **ljust 15.14:1**, **mörkt 11.85:1**.
- Expandera-chevron (accent, dekorativ affordans): ljust 4.57:1, mörkt 7.53:1 (>= 4.5:1 i båda ändå).
- Lagnamn (`--color-fg`) på kort-ytan: ljust 17.91:1, mörkt 15.24:1.
- Status-etikett (`--color-fg-muted`) på kort-ytan: ljust 6.52:1, mörkt 7.50:1.
- "mot"-avdelaren (guld-mix `gold 52% / fg-muted 48%`) på kort-ytan: **ljust 4.88:1**, **mörkt 8.67:1**
  (mixet justerades från 72% guld till 52% just för att klara AA som normal text i ljust tema; aria-hidden
  men hålls ändå >= 4.5:1).
- Spara-text (`--accent-fg`) på accent: ljust 5.40:1, mörkt 10.85:1.
Alla text-par >= 4.5:1 (AA normal text) i båda teman. Min uppmätt = 4.57 (chevron, dekorativ) / 4.88 ("mot").

**Live-verifierat (dev-server, per bredd):** 280 (vikbar cover), 360, 768 (vikbar inner ~Daniels skärmdump),
1024, 1440, i båda teman. Per bredd uppmätt: noll horisontell overflow (`scrollWidth === clientWidth`),
score-kolumnerna linjerar IDENTISKT kort-till-kort (home/away-input + "mot"-center samma offset på alla
kort, en enda unik offset-uppsättning), trunkering aktiv (`overflow:hidden` + ellipsis, namn inom kort-
kanten), och layout-växeln (mobil-staplad < 640px -> desktop-inline >= 640px) korrekt. Expandera-knappen
fäller ut 5 -> 72 kort och tillbaka, `aria-expanded` växlar, chevron vänds. Reduced-motion emulerad:
chevron + kort-transition = 0.01ms (nollade), inga animationer.

## 2026-06-10 , #39 (T27) senior-developer: resultatinmatning, stabilt kolumn-grid + 3-dagars fönster

**Beslut (stabil kolumn-layout):** ResultEntryForm-kortets kropp gick från en flex-layout med
`flex-1`-lag-kolumner till ett CSS-GRID med fasta/proportionella spår: bara KONTROLL-spåret är
flexibelt (`minmax(0,1fr)`), score-blocket (hemma-ruta / "mot" / borta-ruta) sitter i auto-spår med
IDENTISK bredd på varje kort. Lagnamnen trunkeras (`truncate`, ellipsis) inom rut-bredden, fullt namn
via `title` (+ labelns text för skärmläsare, "(hemma)"/"(borta)"-suffixet flyttat till `sr-only` så det
inte konkurrerar om den trunkerade bredden).
**Varför:** Daniels mobil-feedback (#39): olika långa lagnamn knuffade poängrutorna i sidled kort för
kort, och namn höggs av fult. Med `flex-1` ärver kolumnbredden innehållet, så rutorna kunde aldrig
linjera mellan kort. Ett grid där bara kontroll-spåret är flexibelt låser score-kolumnerna på samma
plats oavsett namnlängd. Grundlayouten (grid-spåren) ägs av senior-dev; design-frontend finjusterar
spår/typografi via seamen `data-result-card-body`. Ingen horisontell overflow 280px (vikbar) -> desktop.

**Beslut (3-dagars fönster + expandera):** Inmatningslistan visar default bara matcher inom de närmaste
3 SVENSKA kalenderdagarna; en tillgänglig "Visa alla matcher (N dolda)"-knapp (`aria-expanded`,
`aria-controls`) fäller ut hela listan, "Visa färre" fäller ihop. ANKARDAGEN = idag om turneringen
pågår, annars PREMIÄRDAGEN (idag före första matchen). Ren funktion `windowMatches(matches, now)` i
`result-window.ts`, återanvänder `localDateKey` från features/daily (DRY, EN sanning för svensk-dag-
härledningen, off-by-one-säker). WINDOW_DAYS = 3.
**Varför:** Hela VM:t är 104 matcher = en orimligt lång lista (Daniels feedback). Default-fönstret håller
listan kort utan att gömma data (allt nås via expandera). Premiär-ankringen följer samma intuition som
den dagliga vyns `initialDayIndex` (visa premiären innan turneringen börjat, inte ett tomt fönster runt
"idag"). Edge-fall källtestade i `result-window.test.ts`: ej börjad, slutet (< 3 dagar kvar), allt inom
fönstret (ingen knapp), vilodag i fönstret (kalenderdagar räknas, inte matcher), tom indata, ogiltig
kickoff (fail loud via localDateKey). Detta är en UX-/produkt-regel (ingen extern auktoritativ källa att
källhänvisa), spårbar via #39 + denna rad.

---

## 2026-06-10 , T8 (issue #8) design-frontend: dags-tonen vävd in i heron + T8-PIN löst (success-ton)

**Beslut (T8-PIN LÖST, success får en egen AA-ton i ljust tema):** I ljust tema var
`--vm-success` === `--vm-accent` (#0e7a44), pinnat olöst genom T2 -> T5 -> T7. success får nu en
EGEN ton: **#0f766e** (Tailwind teal-700). Mörkt tema oförändrat (#5ad1a0, redan skild från
accentens #1fe082).
**Varför just #0f766e:** (a) tydligt skild från accentens skogsgrön, hue 175 mot 150 (deltaE76 ~28,
en omisskännlig teal-skiftning, INTE bara en annan ljushet, ren luminans-separation hade varit
otillräcklig eftersom forest och teal kan ha nära samma ljushet), (b) läses fortfarande som
positivt/grönt (teal-grön, inte blå/gul), (c) klarar WCAG AA på alla ytor success faktiskt används på.
**Var success används (grep:ad innan ändring, så AA verifieras på RIKTIGA ytor, inte ett typfall):**
- `SwatchGrid.tsx`: `bg-success` med `text-bg` ovanpå (den enda TEXT-bärande ytan). I ljust tema är
  text-bg = #f1f5f0 (nära-vitt) -> behöver AA som normal text mot success-bakgrunden.
- `GoalCelebrationOverlay.tsx`: `var(--color-success)` som EN konfetti-färg (aria-hidden, ren dekor,
  inget AA-krav, ingen text på den).
- Inga `text-success`/`border-success` i kod (success används aldrig som ren textfärg i nuläget, men
  tonen är ändå vald så den DÅ också klarar AA, för robusthet).
**AA UPPMÄTT (relativ luminans, inte antaget, lessons `aa-kontrast-pastad...`):**
- Ljust: text-bg (#f1f5f0) på success-bg #0f766e = **4.97:1** (>= 4.5, AA normal text). Vit text på
  #0f766e = 5.47:1. success som textfärg på vit yta = 5.47:1, på fond #f1f5f0 = 4.97:1. Alla >= AA.
- Mörkt (oförändrat #5ad1a0): som text på bg/surface/raised = 9.95 / 8.90 / 7.39:1; text-bg (#091310)
  på success-bg = 9.95:1. Alla >= AA.

**Beslut (dags-tonen vävd in i heron, dekorativt + subtilt):** Hero-dekoren (radiella ljus + sheen)
flyttades från inline-style i `DailyMatchesView.tsx` till en CSS-klass `.vm-daily-hero` i `tokens.css`
sektion 6, så den kan villkoras på `[data-day-theme='active']` (en inline-style kan inte selektera på
attribut). I default/vilodag-läget (`[data-day-theme='default']`, ingen `--vm-day-hue`) ser hero:n
EXAKT ut som T2/T7:s "arena i kvällsljus" (pitch-grön glow ur övre hörnet + guld ur nedre). När en dag
har lag (`active`, hue satt) tonas det ÖVRE radiella ljuset + sheen-svepet mot dagens hue via
`hsl(var(--vm-day-hue) ...)`, MJUKT inblandat (`color-mix`) med bas-grönt så tonen är en subtil
skiftning, aldrig en grell färgklick. Det NEDRE guld-ljuset hålls oförändrat (turneringens varma
signatur ligger fast oavsett dag), så bara en del av dekoren skiftar = elegant, inte rörigt.
**Kontrast-vakten är ARKITEKTUR-INVARIANT (oförändrad):** `--vm-day-hue` väver BARA in i
`background-image` på hero-dekoren, ALDRIG i en text-/yt-/kant-token. Match-korten (text) får aldrig
variabeln (låst av befintligt test i `DailyMatchesView.test.tsx`). En hue som per konstruktion bara
lever i en dekor-gradient kan inte sänka text-kontrast under AA, det finns ingen text på den.
**Övergångar:** den befintliga `[data-day-theme]`-transitionen (background-color/-image, gatad på
`prefers-reduced-motion: no-preference`) tonar dag-bytet mjukt; reduced-motion-grinden nollar den +
`vm-hero-sheen` (animation: none) som förut. Verifierat live (Playwright): båda teman, speldag (active)
mot vilodag (default), reduced-motion, 360-1440px.

---

## 2026-06-10 , T8 (issue #8): dynamiskt dags-tema, deterministisk hue ur dagens lag, BARA dekor

**Beslut (härlednings-regel, gissas inte):** Dags-temat (SPEC §7 "färg/motiv byter efter dagens
lag/värdstad") härleds av en REN funktion `deriveDayTheme(matches, teamsById, dateKey?)`
(`src/features/daily/day-theme.ts`) till EN dekorativ accent-hue (0-359). Regeln:
varje KÄNT lag som spelar dagen bidrar med sin hue (`hueFromCode`, samma FNV-1a-hash ur FIFA-koden
som TeamFlag:s disc, lyft till delade `src/features/daily/team-hue.ts` så det är EN sanning, inte två
kopior, PRINCIPLES §4), och dagens hue = det **cirkulära medlet** (vektor-medel på färghjulet) av
lagens hues. **Varför cirkulärt och inte aritmetiskt medel:** ett aritmetiskt medel av t.ex. hue 5
och 355 ger 180 (fel sida av hjulet); vektor-medlet ger ~0 (rätt). Cirkulärt medel är dessutom
ORDNINGS-OBEROENDE och deterministiskt, så en premiärdag med många lag (upp till 16) får en stabil,
väldefinierad ton i stället för en godtycklig "första laget"-regel. **Degenererat randfall (F1):**
om lagens hues tar exakt ut varandra (vektorsumma ~0, t.ex. CRO 85 mot QAT 265 som är precis
antipodala) finns ingen medelriktning, då faller regeln tillbaka på den MINSTA hue:n i uppsättningen
(`Math.min(hues)`). Det valdes för att fallbacken ska vara ORDNINGS-OBEROENDE: `hues[0]` (tidigare)
gav olika ton beroende på hemma/borta-ordning för det antipodala paret och bröt ordnings-oberoendet
nåbart med riktig speldata. Bevisat av test (ordnings-oberoende inkl. ett ANTIPODALT par i båda
ordningarna + wrap kring 0/360 + 16-lags-determinism).

**Beslut (KONTRAST-VAKT I KOD, acceptanskriterium 2, WCAG AA):** Den härledda hue:n får BARA väva in
i DEKORATIVA ytor (hero-gradienter, glow), ALDRIG i text-, yt- eller kant-tokens som bär läsbarhet.
Seamen (`use-day-theme.ts`) exponerar hue:n som CSS-variabeln `--vm-day-hue` (ett TAL, en hue-grad)
plus data-attribut, och lägger den bara på hero:ns dekor-yta (`[data-daily-hero][data-day-theme]`).
**Varför detta är vakten:** en hue som per konstruktion aldrig blir en text-/ytfärg kan inte sänka
text-kontrasten under AA, det finns ingen text på den. **Vad vakten vilar på, två komplementära test
(review F2):** (1) DOM-vakten (`DailyMatchesView.test.tsx`) bevisar att inget matchkort SÄTTER
`--vm-day-hue`/`data-day-theme` inline, bara hero-dekoren gör. Den ensam räcker INTE: "Dagens match"-
kortet renderas inne i `.vm-daily-hero` (som sätter variabeln inline) och CSS-custom-properties ÄRVS
nedåt, så en framtida kort-CSS-regel som LÄSER `var(--vm-day-hue)` vore osynlig för en DOM-vakt som
bara läser inline-style. (2) Käll-scannen (`day-theme-contrast-guard.test.ts`) stänger den luckan
DOM-oberoende: den läser KÄLLFILERNA och failar om `var(--vm-day-hue)` KONSUMERAS utanför en
`.vm-daily-hero*`-scopad CSS-regel (eller i någon annan källfil än `tokens.css`). Invarianten vilar
alltså på SÄTTNING-vakt (DOM) + KONSUMTION-vakt (källa), inte på en enda DOM-koll. Design-frontend
bygger den slutgiltiga dekoren ur hue:n i `tokens.css` sektion 6 (hsl()/color-mix), äger HUR det ser ut.

**Beslut (edge-fall, alla explicita):**
- VILODAG (matches=[]) -> neutralt DEFAULT-tema (ingen hue, `source: 'default'`); hero behåller T2:s ton.
- Bara OKÄNDA lag den dagen (slutspel innan seedningen, `homeTeamId/awayTeamId` null) -> ingen lag-hue
  finns; fall tillbaka på en hue härledd ur DAGENS DATUM-NYCKEL (`source: 'date'`), så slutspelsdagen
  ändå känns distinkt. Dokumenterat val, inte en gissning om vilka lag som spelar. Utan datum -> default.
- OGILTIG DATA (ett icke-null `teamId` som saknas i lag-uppslaget = brutet referens-kontrakt) ->
  FAIL LOUD (kastar med match-id i meddelandet), maskeras inte tyst (PRINCIPLES §8, lessons
  `tyst-maskerande-fallback`). Ett okänt LAG (teamId null) är ett giltigt slutspels-tillstånd, inte ett fel.

**Beslut (mjuka övergångar, acceptanskriterium 3):** Dag-bytet tonar via en CSS-transition på
`[data-day-theme]` (`tokens.css` sektion 6), gatad på `prefers-reduced-motion: no-preference`, så den
befintliga reduced-motion-grinden (`index.css`) stänger av den för den som bett om minskad rörelse.
Ingen egen JS-grind behövs (samma princip som body-färgövergången).

**T8-PIN (success-token, ÄGARE design-frontend) , [ERSATT 2026-06-10, se nyaste T8-raden överst:
"T8-PIN löst (success-ton)"]:** Pinnet ÄR numera löst, success fick en egen AA-ton (#0f766e) i ljust
tema. Texten nedan är HISTORIK (läget när senior-dev skrev den, innan design-frontend åtgärdade), den
beskriver INTE nuläget , behåll den bara som spår, ändra aldrig nuläget efter den. Aktuell sanning +
mätvärden står i den översta T8-raden.
> _(historik, ej längre sant)_ I ljust tema var `--vm-success` fortfarande == `--vm-accent` (#0e7a44).
> Det funktionella dags-tema-lagret RÖR INTE den krocken (dags-temat ligger helt i dekor, inte i
> success-tokenet), så ingen del av T8:s funktion berodde på separationen. Att VÄLJA det nya
> success-färgvärdet var ett design-authored token-värde (mönstret `tema-tokens-som-kontrakt`:
> senior-dev gissar inte färgvärden), så det lämnades distinkt till design-frontend i `tokens.css`.
> Acceptanstest design-frontend: i ljust tema ska `--vm-success` skilja sig från `--vm-accent` och
> klara AA mot ytorna. (Uppfyllt: #0f766e, se översta T8-raden.)

---

## 2026-06-10 , HOTFIX (issue #37): datakälla-gaten kräver `LIVE_READY` utöver env

**Beslut:** Gaten i `src/data/data-source.ts` väljer live-källan bara när BÅDA villkoren är sanna:
(1) Supabase-env satt (`isSupabaseConfigured`) OCH (2) en in-kod-konstant `LIVE_READY === true`.
`LIVE_READY` är `false` tills T14 byggt klienten. När env finns men `LIVE_READY` är false körs
fixtures med en EGEN `console.warn` (skild från "env saknas") som förklarar att klienten väntar på
T14. `getDataSource` och `getDataSourceMode` delar samma sammansatta gate (`isLiveActive`), så
UI-märkningen (demo/live) aldrig kan säga emot den faktiska källan. Båda funktionerna + provider
(`ResultsProvider`) tar en injicerbar `liveReady`-parameter (default `LIVE_READY`) så live-grenen
kan testas utan att flippa den globala konstanten (KISS).

**Varför (rotorsak):** Env-variablerna (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`) sattes i
Cloudflare 2026-06-09 inför T14, men `supabase-client.ts` är en medveten fail-loud-stub som kastar
tills T14 fyller den. En ren env-gate tände därför live-grenen i produktion (vm-2026.pages.dev) ->
varje `getGroups/getMatches/getTeams` kastade -> alla vyer visade fel-alerts i stället för matchdata
för Daniels vänner. Alternativ B (en `VITE_DATA_MODE`-env-flagga) valdes BORT: det hade krävt en
Cloudflare-env-ändring vid T14, och Daniel är borta. En in-kod-konstant flyttar T14:s enda extra steg
till en kod-ändring som ändå går genom review + bygge ihop med den riktiga klienten, så live aldrig
tänds av enbart en miljö-konfiguration. Fail-loud-principen (PRINCIPLES §8) överlever: env utan byggd
klient SKA inte tyst se ut som live, det syns nu i en console.warn i stället för som ett kast i
användarens ansikte.

**T14-PIN (får INTE missas):** När live-klienten är byggd, gör BÅDA stegen i samma ändring:
1. Sätt `LIVE_READY = true` i `src/data/data-source.ts`.
2. Ta bort interims-grenen (den `console.warn` som säger "LIVE_READY=false ... byggs i T14") i
   `getDataSource`.
Guard-testet `LIVE_READY ... är false` i `data-source.test.ts` BRYTS medvetet när konstanten flippas,
så de två stegen inte glöms.

---

## 2026-06-10 , T7 (issue #7): Copilot-review R2 (C5-C8)

**Beslut (C5, reduced-motion stänger AV hero-animationerna helt):** Vid `prefers-reduced-motion: reduce`
nollas de dekorativa hero-animationerna EXPLICIT med `animation: none` på `.vm-hero-sheen` och
`.vm-live-dot` (`src/index.css`), utöver den svepande `animation-duration: 0.01ms`-regeln.
**Varför:** Den svepande regeln (`duration: 0.01ms` + `iteration-count: 1`) kör animationen en gång
till SLUT nästan momentant, så keyframsen landar på sitt 100 %-läge, inte sitt startläge. För
`vm-sheen` är 100 % `background-position: 140% 0%`, dvs sveptet fryser mitt i/utanför fonden i stället
för i ro, och den gamla kommentaren ("stannar på sitt första steg") var falsk. Designintentet (T7
design-lager) är en HELT statisk hero vid reducerad rörelse; `animation: none` ger det och håller
kommentaren sann (WCAG 2.3.3).

**Beslut (C6, MatchCard-kommentar rättad till verkligheten):** Kommentaren i botten-raden sa att
"dt:erna är visuellt dolda (sr-only)", men Arena-dt:n är SYNLIG (`font-semibold`). Rättad (minsta
sanna ändring): de flesta dt:er är `sr-only` (värdet bär sin egen identitet, t.ex. TV-badgen och
guld-chippet), men Arena-dt:n hålls synlig eftersom ett bart arena-/stadsnamn behöver en synlig
"Arena"-etikett för att inte bli tvetydigt. Ingen funktionell ändring, bara doc-drift bort.

**Beslut (C7, vilodagar inkluderas i dagslistan):** `groupMatchesByDay` returnerar nu en post för
VARJE kalenderdag mellan turneringens första och sista speldag, även dagar utan matcher (`matches: []`).
**Varför:** VM 2026 spelas 11 juni-19 juli och har vilodagar mellan ronderna (mellan gruppspelets slut
och sextondelarna m.m.); med bara speldagar i listan hoppade datumnavigeringen rakt över dem och
vilodags-panelen i vyn (lokala reviewens F4) var oåtkomlig. Issue #7:s DoD kräver "Datumnavigering
bläddrar dag för dag, hanterar dagar utan matcher". Tomma dagar fylls med en ren datum-uppräkning i
UTC-midnatt (`enumerateDateKeys`) så ingen DST-övergång i Europe/Stockholm kan hoppa över/upprepa ett
datum (nycklarna är redan rena svenska kalenderdatum, det är bara kalender-aritmetik på dem).
**Startdags-val (dokumenterat):** `initialDayIndex` landar på "idag" när idag ligger i spannet OAVSETT
om det är en speldag eller vilodag (en vilodag som "idag" visar vilodags-panelen), annars premiären
(idag före spannet) eller sista dagen (allt passerat). Mer intuitivt än att tvinga fram nästa speldag
mitt under ett pågående mästerskap. Första/sista dag förblir kant-disabled i navigeringen.

**Beslut (C8, kuriosa SCOPAS BORT från T7 -> T10):** "Kuriosa"-fältet på matchkortet renderas aldrig
eftersom `matches.ts` inte bär verifierad trivia-data. Kuriosa flyttas till T10 (lag-profil-tasken)
där en verifierad datakälla finns. **Varför:** Samma princip som arena-platshållaren (#35) och
gissa-aldrig: en uppgift utan verifierad källa presenteras inte som data. Dirigenten uppdaterar
issue #7:s DoD.

---

## 2026-06-10 , T7 (issue #7): Copilot-review R1 (C1-C4)

**Beslut (C1, startdag synkront):** Den valda startdagen i `useDailyMatches` härleds SYNKRONT i
render (memo över `selectedKey` + fallback till `initialDayIndex`), inte längre via en `useEffect`.
En `useEffect` speglar bara den härledda nyckeln tillbaka till state för navigeringen (goPrev/goNext),
den är inte källan till vad vyn visar.
**Varför:** En effekt körs först EFTER första commit, så med effekt-initiering fanns en render där
`status==='ready'` och `days.length>0` men `selectedDay===null` -> vyn kunde flicker-visa tom-dag-
panelen ("Ingen match den här dagen") fast matcher fanns. Synkron härledning stänger den glipan
(regressionstest bevisat: failar mot effekt-versionen, passerar mot render-härledningen).

**Beslut (C2, fail loud på ogiltig kickoff):** `isUpcoming` (countdown.ts) KASTAR på en NaN-tidsstämpel
i stället för att tyst returnera `false`. Samma fail-loud-kontrakt som `localDateKey` /
`formatDayHeading` / `formatDayShort` i samma feature.
**Varför:** En tyst `false` dolde en datakorrupt match som "inte kommande" (PRINCIPLES §8, känd fälla
`tyst-maskerande-fallback` i senior-developer lessons): nästa-avspark-valet hoppade tyst över den och
hero:n kunde felaktigt landa i sluttillståndet. Ett datafel ska synas vid källan, inte maskeras.

**Beslut (C3/C4, TvBadge-doc rättad till verkligheten):** `channelTone` returnerar en HEX-LITERAL som
hue för SVT/TV4 (kanalens signaturfärg). Kommentaren/JSDoc:en sa tidigare "inga råa hex" / "aldrig
blir en rå hex", vilket var doc-drift mot koden. Vald lösning (KISS/YAGNI): rätta texten så den
beskriver verkligheten, hue:n ÄR en hex-literal men bakas alltid ihop med en semantisk yt-token via
`color-mix` (14 % bakgrund, 38 % kant) så den RENDERADE färgen följer temat, hex:en lyser aldrig rå
rakt ut. Att flytta tonerna till CSS-tokens vore en större ändring utan funktionell vinst (avvisad).

---

## 2026-06-09 , T7 (issue #7): daglig matchvy, dag-gruppering i svensk tid + dagens-match-regel

**Beslut (tidszon):** Den dagliga matchvyn grupperar och visar matcher per SVENSK kalenderdag
(Europe/Stockholm), trots att `Match.kickoff` lagras i UTC. Dag-nyckeln härleds via `Intl`
(`localDateKey`, `groupMatchesByDay`), inte genom att klippa datumdelen ur UTC-ISO-strängen.
**Varför:** Direkt UTC-datum vore en off-by-one kring midnatt (känd fälla i senior-developers
lessons): en match 2026-06-13T22:00Z är 00:00 svensk tid 2026-06-14 och hör till den svenska
dagen 06-14, inte UTC-dagen 06-13. Samma svenska tidszon som tablå-källan uttrycktes i (parserns
`SOURCE_TIMEZONE`). Allt som VISAS (tid, dag-rubrik) formateras tillbaka till svensk tid via Intl.

**Beslut ("Match of the day"):** Dagens framträdande match väljs deterministiskt som dagens
TIDIGASTE avspark (lägst kickoff, tie-break på match-id). Live-nedräkningen i hero:n räknar mot
turneringens NÄSTA kommande avspark över ALLA matcher (inte bara vald dag).
**Varför:** Rankning (FIFA-ranking) kräver lag-profil-data som är T10 (out of scope här), och för
slutspel är lagen ännu okända (homeTeamId/awayTeamId null). "Dagens första avspark" är data vi har
för varje match och en naturlig hero. Regeln kan skärpas i T10 när rankning finns, på ett
dokumenterat sätt. Nedräknings-beräkningen är en REN funktion (`computeCountdown(matches, now)`),
UI-tickandet (sekund-timer) är skilt från logiken så slut-tillståndet (efter finalen, ingen
kommande match) och exakt-vid-avspark hanteras explicit och testbart.

**Beslut (arena-platshållare, #35):** Matchkortet DÖLJER `venue` när den är "ej verifierad"-
platshållaren (`isVenuePlaceholder`, mönster-baserad detektion), i stället för att visa den som
verifierad arena-data. **Varför:** Källan bär ännu inte arena/stad (känd lucka, gissas aldrig);
att visa platshållaren vore att presentera en icke-verifierad uppgift som data. Döljs tills riktig
arena-data finns. Design-frontend finputsar (dölj/dämpa) ovanpå.

**Beslut (design-frontend, premium-lager):** Hero:n byggs som "arena i kvällsljus": en mörk yta med
två radiella ljus (pitch-grön ur övre hörnet, varm guld ur det nedre) plus ett långsamt rörligt
ljus-svep (`vm-sheen`) och en pulsande live-prick (`vm-pulse`). Båda CSS-animationerna är RENT
dekorativa och stängs AV explicit vid `prefers-reduced-motion` (`animation: none` på `.vm-hero-sheen`
/ `.vm-live-dot` i `index.css`, se C5-beslutet 2026-06-10), så hero:n är helt statisk, WCAG 2.3.3
håller utan en egen JS-grind. Nedräkningen renderas som
upphöjda "tiles" med `tabular-nums` + fast min-bredd, så siffrorna aldrig ger layout-hopp när
sekunderna tickar (ingen CLS).
**Varför (featured-signal, T7-pin):** "Dagens match" framhävs FÄRG-OBEROENDE med GULD (chip + kant +
gradient), aldrig med accent/success, eftersom de två rollerna delar exakt samma skogsgröna hue i
ljust tema (verifierat live: `--vm-accent` === `--vm-success` === #0e7a44). Guld-chippet är en SOLID
guld-bricka med mörk ink-text (`#1c1403`), inte guld-text-på-tint: solid + mörk text ger garanterad
WCAG AA i båda teman (uppmätt 5.03:1 ljust / 10.90:1 mörkt), medan guld-text-på-18%-tint föll under
AA på den ljusa ytan (2.97:1). Samma färg-oberoende princip som T5:s kvalificeringszon
(`fargoberoende-framhavning`, patterns.md).
**Beslut (lag-emblem + TV-badge):** Lag får en deterministisk tvåtons-"flagg-disc" genererad ur
FIFA-landskoden (`TeamFlag`), inte riktiga flaggbilder. **Varför:** 48 flaggbilder vore ett
nät-/asset-beroende som hotar LCP/CLS (Core Web Vitals, PRINCIPLES §12), och emoji-flaggor renderas
inte på Windows. Discen är ren dekoration (aria-hidden); lagnamnet bär a11y. Kan bytas mot riktig
flagg-data i lag-profil-tasken utan att röra matchkortet. TV-kanalen blir ett kännbart märke
(`TvBadge`) med kanal-egen ton i kant/bakgrund/prick men TEXTEN på full fg-kontrast (15.10:1 ljust /
13.23:1 mörkt), så kanalen skummas snabbt och håller AA oavsett kanalfärg.

---

## 2026-06-09 , T4b (issue #31): matchtablån genererad ur svensk TV-tablå, värde-låst, arena flaggad

**Beslut (data + arkitektur):** Hela VM 2026:s matchplan (72 gruppmatcher + 32 slutspelsmatcher
M73-M104) är nu typad `Match`-data (`src/data/wc2026/matches.ts`), GENERERAD ur en committad
svensk TV-tablå (`src/data/wc2026/tv-schedule-source.txt`, Daniel 2026-06-09) via en ren parser
(`src/data/wc2026/match-schedule-parser.ts`, delad av generator + test) och VÄRDE-LÅST mot källan
i CI (`match-schedule-source.test.ts`: regenerera-och-diffa + mutationstest). Samma mönster som
T4:s Annexe C-tabell (se `docs/patterns.md`). `fixtures.ts` bär nu denna riktiga matchplan i
stället för de tidigare demo-resultaten, så hela appen demonstreras mot den verkliga planen redan
i fixtures-läge. Gruppmatcher har kända lag (homeTeamId/awayTeamId + groupId A-L), slutspelsmatcher
har `homeTeamId/awayTeamId = null` (lagen seedas av T4/T9) men bär FIFA:s matchnummer-id ("M73"..)
så matchtablå och slutspelsträd refererar SAMMA match. Alla matcher är `scheduled` (resultat null),
vilket är det sanna läget (VM har inte börjat).
**Varför GENERERAD + värde-låst:** 104 matcher med tider/kanaler/positions-källor är för felkänsligt
att handknappa och svårt att review:a. Genom att parsa ur ett committat utdrag och kräva värde-likhet
blir datan spårbar, regenererbar och låst till källans faktiska värden (uppfyller källhänvisnings-
kravet HARD för gissningskänslig data). Mutationstestet bevisar att låset fångar ett bytt värde.

**Beslut (tid = svensk tid, lagras UTC, DST-härledd):** Tablåns klockslag är SVENSK tid
(Europe/Stockholm). `Match.kickoff` lagras i UTC (kontraktet), så parsern konverterar svensk
väggklocka -> UTC genom att HÄRLEDA offset:en ur IANA-zonen Europe/Stockholm vid instanten (inte
en hårdkodad +2). Hela fönstret 11 juni-19 juli 2026 är CEST (+2), men härledningen är korrekt även
om en framtida tablå korsar en DST-gräns.
**Varför:** Känd fälla (`utc-datum-anvant-som-lokalt-datum`): "00:00 söndag 14 juni" svensk tid är
`2026-06-13T22:00:00Z` (ett annat KALENDERDATUM i UTC). Att lagra "14 juni 00:00" rakt av som UTC
vore off-by-one kring midnatt. Ett test verifierar just denna midnatts-match (g-C-1 Brasilien vs
Marocko) inklusive rundturen tillbaka till svensk tid (14 juni 00:00).

**Beslut (KORSKOLL = oberoende verifiering av FIFA-motorn):** Varje lag i tablån korskollas mot
`teams.ts` (FIFA-lottningen) och varje slutspels-matchnummer + positions-källa (t.ex. "1E vs
3ABCDF (74)") mot `bracket-structure.ts` (FIFA Article 12). Resultat: FULL ÖVERENSSTÄMMELSE, en
oberoende svensk TV-källa bekräftar T4:s FIFA-motor exakt (alla 32 slutspelsmatcher, inkl. bästa-
trea-behörighetslistorna). En avvikelse skulle BRYTA bygget, inte gissas bort.

**Beslut (arena-lucka, gissas ALDRIG):** Källan bär tid + svensk TV-kanal men INTE arena/stad.
Arenorna kunde inte verifieras per match ur en strukturerad källa vid byggtillfället (Wikipedias
plaintext-extrakt ger inte per-match-arena tillförlitligt). `Match.venue` är obligatoriskt, så det
sätts till en UTTRYCKLIG platshållare "Arena ej verifierad (egen data-punkt)" i stället för en
gissad arena (PRINCIPLES: gissa aldrig, synligt i stället för tyst). Matchen är ändå värdefull med
tid + kanal. Arenorna fylls när en verifierad per-match-arenakälla finns (egen, fortsatt öppen
data-punkt). Källa: Svensk TV-tablå (Daniel), ur SPEC §8 (svenskafans, fotbollskanalen).

---

## 2026-06-09 , T6 (issue #6): målfirande-overlayn (design-frontends visuella lager)

**Beslut:** Det visuella målfirandet är en egen overlay-komponent (`GoalCelebrationOverlay`) som
kopplas in via `ResultEntryView`s `renderCelebration`-render-prop. Den ritar en "arena i kvällsljus"-
explosion: en mål-pop-bricka ("Mål!" med boll-glyf) som fjäder-poppar fram i en grön/guld radial-
gloria, plus konfetti i hejarklacks-tonerna (accent-grön, pokal-guld, success, fg). Konfetti-antalet
skalar med matchens totala mål (`CONFETTI_PER_GOAL` = 14 per mål) men kapas vid `CONFETTI_MAX` = 70.
Komponenten NAMNGES `GoalCelebrationOverlay` (inte `GoalCelebration`) för att inte krocka med krokens
publika TYP `GoalCelebration` (firande-tillståndet) i feature-barrelen, en värde- och en typ-export
kunde annars inte samexistera under samma namn.
**Varför:** Render-prop-seamen håller "hur det ser ut" (detta lager) helt skilt från "när + a11y"
(krokens deterministiska, reduced-motion-tysta trigger). Overlayn är `aria-hidden` + `pointer-events-
none` + `position: fixed` (ren glädje-yta: ingen dubblerad info, fångar aldrig klick, ger ingen
layout-shift). Den monteras bara när ett firande är aktivt och rivs via `AnimatePresence` när kroken
nollar tillståndet, så inget animeras i vila (Core Web Vitals). Konfettin har dessutom en EGEN
`useReducedMotion`-grind utöver krokens tystnad (dubbelt skydd, WCAG 2.3.3): vid "minska rörelse"
ritas ingen regnande konfetti. Konfetti-fältet förberäknas deterministiskt ur firande-nyckeln (seeded
PRNG, inte `Math.random`) så bitarna inte teleporterar vid en re-render mitt i animationen.

---

## 2026-06-09 , T6 (issue #6): matchresultat-state LYFT till en delad ResultsProvider (en sanning)

**Beslut (kärn-arkitektur):** Matchlistan, den enda sanningen som tabeller (och senare slutspelsträd)
härleds ur (SPEC §6), bor nu i en DELAD `ResultsProvider` (React-context, `src/features/results/`),
inte längre i gruppspelsvyns lokala state. Både resultatinmatnings-UI:t (`ResultEntryView`) och
gruppspelsvyn (`GroupStageView` via `useGroupData`) LÄSER samma store, så en inmatning -> storen
uppdaterar matcherna -> alla härledda vyer räknar om automatiskt. `useGroupData` är därmed en TUNN
KONSUMENT (äger bara tabell-härledningen); env-injektionen (fixtures/live-seedning) flyttade från
hooken till providern. Storens skriv-seam är `submitResult(matchId, entry)` (validerar + optimistisk
uppdatering) och lågnivå `setMatches` (T18:s realtid + tester). GroupData-kontraktet utåt
(status/tables/teams/mode/error/setMatches) är OFÖRÄNDRAT, så T5:s vy + tester står still.
**Varför:** Före T6 kände bara gruppspelsvyn till matcherna (lokal state), så en separat inmatnings-vy
hade inte kunnat uppdatera tabellerna utan att dubbellagra eller lyfta tillstånd via prop-drilling
genom hela appen. En delad store är den minsta lösningen (KISS) som ger EN sanning utan dubbellagring,
och designar in T14 (persistens, byt mutator-implementation mot Supabase-skrivning) och T18 (realtid,
prenumeration som anropar setMatches) på SAMMA seam utan omskrivning av konsumenterna. Behåller
fixtures-först (storen seedar via getDataSource, samma env-gate). Bygger vidare på T5-mönstret
"härledd-state-vy", nu med sanningen lyft en nivå.

**Beslut (validering = fail loud men användarvänligt):** Inmatningen valideras av en REN modul
(`validate-result.ts`) som returnerar `{ ok: true } | { ok: false; errors }` (inte kastar), så ALLA
fel kan visas samtidigt och kopplas till sina fält via `aria-describedby`/`aria-invalid`. Regler:
icke-negativa HELTAL (avvisar -1, 1.5, NaN, Infinity), status <-> resultat-kontraktet (finished KRÄVER
bägge mål, scheduled/live får INTE bära resultat, speglar Match-unionen), och status-övergångar via en
explicit tabell. Formuläret sätter `noValidate` så vår validering (med begripliga svenska meddelanden +
aria) är sanningen i stället för native constraint-bubblor (inkonsekventa, mindre tillgängliga, och de
skulle BLOCKERA submit innan vår validering kör). `applyMatchResult` (ren reducer) validerar IGEN som
skyddsnät och kastar vid ogiltig data, så ett brutet programflöde aldrig korrumperar den enda sanningen.
**Varför:** Fail loud (PRINCIPLES §8) utan att straffa användaren: en kastande validering döljer flera
fel och tvingar try/catch; ett diskriminerat returvärde ger bättre UX + a11y och samma data till både
formulär och store-mutator.

**Beslut (målfirande-KROK som seam, design-frontend äger det visuella):** Firandet ligger i en krok
`useGoalCelebration` som äger NÄR (en match blir finished med minst ett mål) + a11y (vid reducerad
rörelse tänds INGET firande, WCAG 2.3.3) + timing (auto-avklingar) + unikt key per firande (re-mount).
`ResultEntryView` exponerar ett `renderCelebration`-render-prop (aria-hidden slot) där design-frontend
lägger den visuella premium-animationen (bygger på T2:s motion-primitiver). Funktionellt fungerar
inmatningen helt utan firandet (ren glädje-yta).
**Varför:** Frikopplar "när" (senior-dev: funktionellt + a11y) från "hur det ser ut" (design-frontend),
så animationen kan byggas premium utan att röra inmatnings-logik/timing/tillgänglighet.

---

## 2026-06-09 , T5: useGroupData härleder tables BARA i ready-läget (kontrakt mot stale data)

**Beslut:** `useGroupData` släpper igenom `deriveGroupTables(...)` enbart när `status === 'ready'`,
annars `tables: []` (status med i useMemo-beroendena). GroupData-kontraktet ("tables tomt tills ready")
är därmed en hård invariant, inte bara ett happy-path-beteende.
**Varför:** `groups`/`matches` ligger kvar i state under en ny laddning (t.ex. env-byte fixtures->live).
En oavkortad härledning skulle då exponera GAMLA tabeller medan `status` är `loading`/`error` (stale data,
kontraktsbrott). Att gata på status låter den reaktiva live-omräkningen (setMatches) leva orörd i ready-läget,
men ingen stale tabell läcker i övergångar. Bevisat av ett env-byte-test (ready -> felande källa -> tables []).
Källa: Copilot-fynd C8, runda 2.

---

## 2026-06-09 , T5 design-frontend: premium gruppspels-design, kvalificeringszon färg-oberoende

**Beslut (kvalificeringszon, T7-pin):** Etta + tvåa (går vidare) framhävs med FYRA samtidiga,
FÄRG-OBEROENDE signaler i stället för en statusfärg: (1) en placerings-MEDALJ i rank-cellen, guld-ring
(`--vm-gold`) på ettan, silver-ring (fg-ton) på tvåan, (2) en vänsterställd ACCENT-LIST (`inset box-shadow`
mot `--color-accent`), (3) en diskret UPPHÖJD yt-ton (`accent 7%` color-mix) bakom raden, och (4) en
tjockare AVDELARE under tvåan ("snittet" mot utslagna). Medaljens SIFFRA håller alltid full `--color-fg`-
kontrast, guld-/silver-tonen lever bara i medaljens bakgrund + kant.
**Varför:** I LJUST tema är `--vm-accent` === `--vm-success` (båda #0e7a44, verifierat live i webbläsaren),
så zonen får aldrig luta sig mot en accent/success-färg, den skulle bli osynlig och bryta när T7 ger
success en egen ton. Form + medalj + list + typografi bär zonen oberoende av färg, och T7 kan sen färglägga
fritt utan att röra denna design. `data-qualified`-haken från senior-dev återanvänds oförändrad.

**Beslut (layout):** Varje grupp blir ett KORT (bokstavs-badge i kort-headern med tema-trogen arena-glow,
mjuk elevation, hover-lyft) i ett responsivt rutnät: 1 kol mobil, 2 (`sm`), 3 (`lg`), 4 (`2xl`/ultrawide).
Tabellen behåller ALLA 10 kolumner i DOM i alla bredder (a11y), men numerisk padding + rank-disc + lagnamn
är komprimerade så de 10 kolumnerna FÅR PLATS utan horisontell scroll ända ner till 360px (uppmätt
`intraCardScroll: 0`). GM/IM dämpas visuellt, MS/P hålls starka (visuell komprimering, SPEC §7).
**Varför:** Premium-känsla + responsivt över hela spannet utan att gömma kolumner (att gömma via
`display:none` tar bort dem ur a11y-trädet på riktiga enheter). Komprimering, inte borttagning.

**Beslut (tokens + rörelse):** All färg går via semantiska tokens (`color-mix` mot `--color-*` / `--vm-*`),
inga råa hex. Korten glider in med en STAGGER via `Slide`-primitiven (delay `i*0.04`, tak 0.4s);
reducerad rörelse nollas i primitiven. Laddning visar SKELETT-kort i samma rutnät (ingen layout-shift),
fel visar en token-färgad `role="alert"`. Caption är `sr-only` (tabellens tillgängliga namn behålls), den
synliga grupp-rubriken bärs av kort-headern.
**Varför:** En sanning för färg/rörelse (designsystemet), CLS undviks, a11y-semantiken från senior-dev
är orörd (200 tester + tabell-roller/scope intakta).

---

## 2026-06-09 , T5 (issue #5): Gruppspelsvyn = härledd state ovanpå computeStandings, fixtures-källan bär verifierad data

**Beslut (datakoppling):** Gruppspelsvyn (`src/features/groups/`) LAGRAR ingen tabell. En ren funktion
`deriveGroupTables(groups, matches)` mappar de 12 grupperna och kör den hårt testade `computeStandings`
(T3 + T4) per grupp. Hooken `useGroupData` håller MATCHERNA i React-state och härleder tabellerna via
`useMemo([groups, matches])`, så "live" blir trivialt: när matchlistan ändras (T6:s resultatinmatning
anropar `setMatches`) räknas tabellerna om automatiskt. `GroupTable` är ren presentation (tar färdig-
sorterade standings, renderar tillgänglig `<table>`), `GroupStageView` mappar grupperna + hanterar
loading/error/empty. Inmatnings-UI:t är T6 (utanför scope), `setMatches`-seamen exponeras bara.
**Varför:** SPEC §6:s "härledd state" hela vägen ut i UI:t, en sanning (matchresultaten), ingen
dubbellagring som kan driva isär. computeStandings återanvänds i stället för att räkna om tabeller i
komponenten (DRY). Härledningen ligger i en React-fri modul så den är enhetstestbar fristående.

**Beslut (datakälla):** `src/data/fixtures.ts` bär nu den VERIFIERADE VM 2026-lag-/gruppdatan
(`WC2026_TEAMS` / `WC2026_GROUPS` från T4, alla 12 grupper A-L) i stället för de tidigare 2 påhittade
platshållar-grupperna. MATCHERNA är fortfarande demo-resultat (ett urval gruppmatcher), den riktiga
matchplanen (avsparkstider, arenor, svenska TV-kanaler) är fortsatt en egen öppen data-punkt (issue #31),
gissas inte.
**Varför:** Gruppspelsvyn ska visa alla 12 riktiga grupper, och `getDataSource()` (fixtures-grenen) är
den etablerade seamen som tänds live oförändrat i T14. Att låta fixtures-källan bära den riktiga lag-/
gruppdatan ger 12 grupper genom hela kedjan med EN sanning (lag/grupper bor i `src/data/wc2026`,
re-exporteras under fixtures-namnen), i stället för att vyn skulle kringgå datakällan och importera
WC2026-datan direkt (vilket vore en parallell väg som inte motsvarar live-grenen). Följer lärdomen
"fixtures följer källans verkliga form" (samma `DataSource`-kontrakt oavsett källa).

**Beslut (T7-pin respekterad):** Kvalificeringszonen (etta + tvåa går vidare) markeras med ett
`data-qualified`-attribut + dold skärmläsar-text, INTE med en statusfärg. T7 äger success-tonen (i
ljust tema krockar accent och success på #0e7a44), så T5 bakar inte in en färg-krock, bara en stabil
hake som design-frontend målar.

---

## 2026-06-09 , T4 (Copilot runda 1, C5): FIFA-tiebreak head-to-head är FAIL-LOUD vid invariant-brott

**Beslut:** `compareHeadToHead` (`src/domain/standings/compute-standings.ts`) KASTAR nu ett tydligt
invariant-fel om ett av de jämförda lagen saknar en rad i inbördes-mini-tabellen (`h2h`), i stället för
att tyst returnera 0 ("lika"). Anroparen `resolveTiedGroup` bygger alltid `h2h` via `headToHeadStats`
över EXAKT de lag som finns i `tied` och jämför bara lag UR `tied`, så en saknad rad kan bara uppstå vid
ett programmeringsfel, aldrig på den normala vägen. Funktionen + typen `H2HStats` exporteras enbart för
test, eftersom invariant-vägen per konstruktion inte kan nås via det publika `computeStandings`-API:t och
därför måste verifieras genom ett direktanrop med en avsiktligt ofullständig map.
**Varför (Copilot C5, korrekthet):** En tyst `return 0` på ett invariant-brott MASKERAR buggen och kan ge
fel ordning i en KRITISK tiebreak, just den fel-klass SPEC §5 säger aldrig får gissas. Fail loud
(PRINCIPLES §8) gör att felet syns vid källan i stället för att tyst förvanska slutspels-seedningen. Den
LEGITIMA vägen (båda lagen har en rad, a-c skiljer dem inte -> returnerar 0) är oförändrad och täcks av ett
test, så fail-loud slår bara på ett äkta invariant-brott.
**Källa:** Regulations for the FIFA World Cup 26 (May 2026), Article 13 (inbördes-kriterierna a-c), sid.
26-27. https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf

**Not (C3, dev-ergonomi):** Generatorn `scripts/generate-third-place-table.ts` körs nu via
`npm run gen:third-place-table` (drar `vite-node`, som redan följer med toolchainen via vitest, inget nytt
beroende). Tidigare antog scriptet Node 24:s native `.ts`-type-stripping, men projektets CI kör Node 22
(`.github/workflows/ci.yml`), så en contributor på Node 22 kunde inte återköra generatorn. Källånkrings-
testet (`third-place-table-source.test.ts`) verifierar tabellen via Vites `?raw` och körs oförändrat på
Node 22, så låset är opåverkat, detta gäller bara contributors regenererings-väg.

---

## 2026-06-09 , T4 (Copilot runda 2, C8): kritisk bracket-strukturdata indexeras FAIL-LOUD (`setOnce`)

**Beslut:** Map-uppbyggnaden av slutspels-indexen sker nu via en delad `setOnce`-hjälpare
(`src/domain/bracket/set-once.ts`) som KASTAR vid en dubblett-nyckel i stället för att tyst skriva över.
Två ställen härdade: `winnerGoesTo` i `build-bracket.ts` (vilken slot tar emot en matchvinnare, exakt EN
per match) och `TABLE_INDEX` i `seed-third-places.ts` (Annexe C-kombination -> rad, de 495 kombinationerna
ska vara UNIKA). Invariant: en given strukturnyckel får härledas från exakt EN källa, en dubblett betyder
ett schemafel, inte en giltig uppdatering. Vakten verifieras av `set-once.test.ts` (dubblett kastar, första
värdet skrivs inte över); `build-bracket.test.ts` bekräftar att den RIKTIGA strukturen inte triggar vakten
(normal väg intakt).
**Varför (Copilot C8, dataintegritet):** En tyst `Map.set(...)`-överskrivning på en dubblett-nyckel skulle
ge ett "giltigt"-SEENDE men FELKOPPLAT träd / fel treplats-uppslag, just den fel-klass kritisk källhänvisad
strukturdata (SPEC §5) aldrig får drabbas av. Fail loud (PRINCIPLES §8) gör att ett schemafel i
bracket-structure eller en korrupt Annexe C-tabell syns vid källan i bygget/testet i stället för att tyst
ge fel slutspelskoppling. `setOnce` lades i en egen modul eftersom den nu delas av två konsumenter (DRY).

---

## 2026-06-09 , T4 (review F1+F2): Annexe C-tabellen LÅST mot committat FIFA-källutdrag (regenerera-och-diffa)

**Beslut:** Den genererade Annexe C-tabellen (`src/domain/bracket/third-place-table.ts`, 495 rader)
är nu förankrad till FIFA-KÄLLAN, inte bara till sig själv. Det RÅA Annexe C-textutdraget committas
som `src/domain/bracket/annexe-c-source.txt` (oförändrad `pdftotext -layout`-extraktion av Annexe C),
och ett test (`third-place-table-source.test.ts`) REGENERERAR tabellen ur det committade utdraget och
kräver VÄRDE-likhet med den committade `.ts`-filen (fail loud vid minsta skillnad, radslut-normaliserat
så CRLF/LF inte ger falskt fel). Trust-kedjan: FIFA PDF -> committat utdrag (spot-checkbart mot PDF,
sid. 80-97) -> generator -> tabell (bevisat lika av testet). Parsnings-/emit-logiken flyttades till en
typad modul `src/domain/bracket/annexe-c-parser.ts` som BÅDE generatorn och testet importerar (EN sanning,
ingen duplicerad parser). Generatorn är nu `scripts/generate-third-place-table.ts` (körs via
`npm run gen:third-place-table`, se C3-noten nedan) och defaultar till det committade utdraget.
**Varför (review-fynd F1, dataintegritet):** Det "uttömmande" 495-testet vaktade bara STRUKTURELLA
invarianter (behörighet + kollisionsfrihet), en SVAGARE invariant än FIFA fastställer. Varje av de 495
kombinationerna har 3-214 behörighets-giltiga, kollisionsfria tilldelningar, men FIFA fastställer EXAKT EN.
Alltså passerade ~493 rader bara strukturellt: ett värde-fel mitt i tabellen (regex som glider en kolumn,
PDF-feltolkning, hand-edit) som råkar landa på en ANNAN behörig kolumn passerade tyst, just den fel-klass
SPEC §5 säger aldrig får gissas. Källånkringen stänger gapet: varje rad är nu låst till FIFA:s faktiska värde.
**Bevis (mutationstest, acceptanskriterium):** `third-place-table-source.test.ts` byter två behöriga treor
på mittraden (rad 250) och bevisar att regenerera-och-diffa FAILAR, medan det strukturella `validate()`
ACCEPTERAR samma mutation (visar gapet). Empiriskt verifierat: en temporär mutation av rad 250 i den
committade `.ts`:en gjorde källånkrings-testet RÖTT medan det strukturella 495-testet förblev grönt.
**F2 (generator ej CI-körbar) löst av samma fix:** källutdraget är nu committat, så generatorns härledning
regenereras och diffas i CI, drift generator<->tabell upptäcks.
**Källa (gissas ALDRIG):** Regulations for the FIFA World Cup 26 (May 2026), Annexe C "Combinations for
eight best third-placed teams", sid. 80-97. Extraherad med `pdftotext -layout`. Källutdragets preambel
bär URL + sid-hänvisning + extraktionskommando.
https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf

## 2026-06-09 , T4: treeplats-motorn + slutspelsträd är STRUKTURELLT, källhänvisat till FIFA:s regelverk

**Beslut:** Den kritiska treeplats-/slutspelsmotorn (SPEC §5) byggs på grupp-POSITIONER (1A, 2C,
bästa-trea-av-grupp-X), inte på lagidentiteter. Tre filer i `src/domain/bracket/`:
`bracket-structure.ts` (de 32 slutspelsmatcherna M73-M104 med källor + hela trädets koppling),
`third-place-table.ts` (FIFA:s Annexe C, 495 rader, GENERERAD), `seed-third-places.ts` (motorn:
8 kvalificerade treor -> kollisionsfri seedning), `build-bracket.ts` (BracketSlot-graf med
nextSlotId genom hela trädet).
**Källa (gissas ALDRIG):** Regulations for the FIFA World Cup 26 (May 2026):
Article 12.6-12.11 (slutspelsträdet, sid. 23-25) + Annexe C (de 495 kombinationerna, sid. 80-97).
https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf
Korskollad mot Wikipedia "2026 FIFA World Cup knockout stage" (2026-06-09). Bracket-flödet
(R32 M89-M96, QF M97-M100, SF M101-M102, brons M103, final M104) stämde exakt mellan båda källor.
**Varför STRUKTURELLT:** treeplats-tabellen beror på vilka grupp-POSITIONER (3:a-från-X) som går
vidare, inte på vilka specifika lag som lottats. Därför kan motorn byggas OCH uttömmande testas
(alla 495 kombinationer) helt oberoende av den faktiska 2026-lottningen, vilket också är robustast:
även om exakt lagdata ändras står motorn fast. Lagidentiteter/schema är data, inte logik (se T4-Findings).
**Varför GENERERAD tabell:** 495 rader är för felkänsligt att handknappa och svårt att review:a.
`scripts/generate-third-place-table.ts` parsar tabellen ur FIFA:s PDF (via `pdftotext -layout`),
VALIDERAR (495 unika kombinationer, varje rad 8 unika giltiga grupper) och vägrar generera vid fel
(fail loud). Datan är därmed spårbar till källan och kan regenereras. Ett integritetstest
(`third-place-table.test.ts`) bevakar fullständigheten vid bygget. (Källånkringen mot ett committat
FIFA-utdrag tillkom i review-fixen F1+F2, se den nyare T4-raden överst.)

## 2026-06-09 , T4 (F1-beslutet): FIFA artikel 13 STEG 2-RE-ITERATION krävs, T3:s KISS-avgränsning rättad

**Beslut:** `computeStandings` (`src/domain/standings/compute-standings.ts`) RE-ITERERAR nu
inbördes-kriterierna (a-c) på en kvar-lika delmängd. T3 lämnade detta öppet som F1 (medveten KISS):
när inbördes-mötet skiljer NÅGRA men inte alla lika lag, räknades inbördes-tabellen INTE om för den
kvar-lika delmängden. F1 avgjordes mot FIFA:s OFFICIELLA ordalydelse: svaret är **JA, re-iteration
krävs.** Ny funktion `resolveTiedGroup` partitionerar de lika lagen efter första inbördes-passet och
RÄKNAR OM a-c rekursivt på enbart den kvar-lika delmängdens inbördes-matcher; faller till de
övergripande kriterierna (d total MS, e total mål) + stabil teamId-fallback först när a-c inte skiljer
någon. Ett test (`compute-standings.test.ts`, "STEG 2: RE-ITERATION") konstruerar en kvar-lika
delmängd och bevisar att re-iterationen ändrar ordningen (lag A går från tvåa till sist).
**Källa (verbatim, gissas ALDRIG):** Regulations for the FIFA World Cup 26 (May 2026), Article 13,
steg 2 (sid. 26-27): "If, after having applied criteria a) to c) above, teams still have an equal
ranking ... criteria a) to c) above are applied to the matches between the REMAINING teams only.
If no decision can be made through this procedure, criteria d) to f) below shall apply ..."
https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf
**Nyans:** re-iterationen återupptar STEG 1 (a-c) på den mindre mängden, INTE från poäng (alla i
delmängden har redan samma poäng). Termination garanteras: re-iteration sker bara på en STRIKT
mindre delmängd. Regelverket säger uttryckligen att steg 2:s d-f-svans INTE startar om, så när a-c
är uttömt sorteras resten direkt på d-e (ingen ytterligare iteration där). Detta är en RÄTTELSE av
T3-beslutet "FIFA-tiebreak-ordning" nedan, som beskrev re-iterationen som en accepterad avgränsning.
**Bekräftat:** tiebreak-ORDNINGEN T3 redan implementerade (poäng, inbördes a-c, total MS, total mål)
stämmer exakt mot regelverket och korskollades mot ESPN + FOX 2026-06-09. Bara re-iterationen saknades.

---

## 2026-06-09 , T3 (Copilot runda 3): groupId-för-gruppmatch är ett DATAKONTRAKT, inte en typgaranti (C9+C10)

**Beslut (Option A, kommentar-only):** Kommentarerna i `compute-standings.ts` (filhuvud + isCounted)
och testen `compute-standings.test.ts` omformulerades så de inte längre påstår att Match-TYPEN
garanterar en grupp för gruppmatcher. `MatchBase.groupId` är `GroupId | null` oberoende av `stage`,
så typen tvingar inte fram en grupp när `stage === 'group'`. Kravet "gruppmatch har en grupp" beskrivs
nu ärligt som ett DATAKONTRAKT från datakällan, och `groupId !== null`-kollen i `isCounted` som en
avsiktligt DEFENSIV filtrering av källan (inte en redundant koll mot en typ som redan utesluter null).
Ingen logik ändrades, den defensiva filtreringen behölls oförändrad.
**Varför / vägval:** Copilot flaggade (C9+C10) att kommentarerna över-lovade en typgaranti som inte
finns. Två vägar fanns: (A) omformulera kommentarerna ärligt, eller (B) stage-diskriminera `Match`
till en union så typen tvingar fram groupId för gruppmatcher. Vi valde A (till skillnad från
status-unionen i runda 2). Skälet: status <-> result är en KÄRN-invariant helt inom T3:s scope, men
stage <-> groupId drar in slutspelsmatch-modellering (hur en slutspelsmatch får sina lag: gruppvinnare/
tvåa/bästa-trea-seedning, källa `BracketSource`/`BracketSlot`) som T4 och T9 äger, inte T3. En
stage-diskriminerad union ovanpå den befintliga status-unionen blir dessutom tvåaxlig (stage x status),
vilket vore över-modellering (KISS/YAGNI) och skulle föregripa T4/T9. Den rena funktionen ska ändå inte
lita blint på källan, så den defensiva filtreringen är rätt oavsett, problemet var bara att
kommentarerna kallade den en typgaranti. Detta förtydligar även runda 1-beslutet nedan ("en gruppmatch
utan groupId hoppas över"): kravet är ett datakontrakt, inte en typ-invariant.

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
