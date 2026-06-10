# Besluts-logg (VM 2026)

Varför bakom större design-beslut (lätt ADR). Nyaste överst. En rad per beslut räcker ofta,
skriv mer bara när "varför" är icke-uppenbart. Knyter till tasks/SPEC där det hjälper.

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
