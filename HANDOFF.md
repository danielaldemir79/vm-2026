# HANDOFF , VM 2026

Var projektet står just nu. Nyaste överst. Bryggan mellan sessioner: disken är sanningen,
chatten är kladdpapper. En tom session ska kunna återskapa hela läget härifrån + boarden.

---

## RESUME-HERE , 2026-06-13 , T68b (chevron klickbar) , PR #143 mot develop , KLAR

**Branch:** `feature/T68b-chevron-klickbar` @ HEAD `78cedd5`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/143 mot `develop` (Closes #136, state: OPEN)
**Live preview:** vm-2026.pages.dev

### Vad T68b levererade

Daniels feedback 2026-06-13: "den dar expandera pilen ska vara klickbar ocksa och expandera."
Chevron-cue:n längst ner i en komprimerad sektion var ren dekoration (pointer-events-none +
aria-hidden), klick gjorde ingenting. Nu är den klickbar och fäller ut, löst EN gång i den
delade CollapsibleBody-primitiven - alla 8 sektioner får fixet.

**Kedjan:**

- **Senior-developer `06bb22a`:** cue:n gjordes klickbar, gatad på `!expanded && isClipped`.
  Faden behålls som separat pointer-events-none-lager. 4 nya tester (13 till 17).
- **Design-frontend `a1375a2`:** tydligt klickbart utseende - hover/active-affordans, tap-highlight
  transparent, reduced-motion behåller tillståndsfärg.
- **Lokal reviewer:** GODKÄND, inga fynd.
- **Copilot R1 `9bff5c7`:** 2 fynd - (1) cue:n ändrad från `<button aria-hidden tabIndex={-1}>`
  till icke-fokuserbart `<div aria-hidden onClick>` (giltig ARIA, axe aria-hidden-focus), (2)
  test-robusthet.
- **Dirigent-fix R1 `9bff5c7`:** implementerade båda fynden.
- **Copilot R2 `78cedd5`:** 6 fynd - mestadels kommentars-drift som R1-fixen introducerade (div
  istället för button i kommentarer/doc) + 2 transform-transition-polish på cue:ns pseudo-element.
  Kommentars-drift är det kända mönstret: när en direkt-fix ändrar ett beslut (button->div) måste
  doc/kommentarer synkas i samma commit.
- **Dirigent-fix R2 `78cedd5`:** synkade kommentarer/doc + lade till transform-transition.
- **Copilot R3:** 0 fynd, "generated no new comments" - exit.

**A11y:** Cue:n är ett icke-fokuserbart `<div aria-hidden="true" onClick>`, en ren mus/touch-
spegel av den övre ExpandToggle (som behålls med aria-expanded/-controls + fokus). Skärm-
läsare/tangentbord får INTE en dubbel kontroll, mutations-bevisat i test (getAllByRole('button') = 1).

**Verifiering (HEAD 78cedd5):** build EXIT 0, npm test 1762 gröna/55 skip/0 fail (184 filer),
lint + format:check EXIT 0.

**Acceptanskriterier T68b:**
- [x] AC1: Chevron-cue:n är klickbar och fäller ut sektionen
- [x] AC2: Icke-fokuserbart div (giltig ARIA), skärmläsare/tangentbord får ej dubbel kontroll
- [x] AC3: Tester vaktar beteendet (mutations-bevisade), 17 tester i sviten
- [x] AC4: Bygger grönt, lint rent, reviewad (lokal panel + Copilot R1-R3), inga olösta findings

### Behöver-Daniel (oförändrad + T68b-klar)

**Befordringar (väntar på godkännande - beordrade 2026-06-12, INTE exekverade än):**
- Kommentar-pastar Förekomst 8: agent-regel för senior-developer.
- Uttömmande-test Förekomst 3: agent-regel för reviewer.
- Pastar-filer-saknas Förekomst 4 (journalist): agent-regel för journalist.

**Kvar att besluta/agera:**
- Supabase e-postmall för inloggningsmejlet (kosmetisk): #81 stängdes 2026-06-12 på Daniels order.
- RLS-testrum i Supabase: står kvar på Daniels uttryckliga beslut (2026-06-12 15:18).
- TWA/Play-kontot: se docs/twa-guide.md.
- #39-F1 (post-VM-vy): pinnad, ej byggd.
- T16b-slot-tippbarhet-ur-sim: pinnad.

**Nästa i kön (Daniels beslut 2026-06-13):**
1. JOKER BORT - bara jokern tas bort, övriga märken (streak/skräll/perfekt-omgång) stannar.
2. LAND I ARENA-RADEN - Match.venue blir "Arena, Stad, Land" med svenskt landsnamn (Mexiko/USA/Kanada).
3. RELEASE v1.0 - Daniel godkände, när kön är tom.

### Nästa steg

**Om PR #143 ÄNNU INTE mergad:**
Dirigenten har fullmakt. Merga: `gh pr merge 143 --merge --repo danielaldemir79/vm-2026`.
Kolla om PR #140/#141/#142 även behöver mergas i ordningen #140 -> #141 -> #142 -> #143.

**Om PR #143 REDAN mergad:**
T68b klar och live på develop. Nästa fas:
1. Bygga "Joker bort"-tasken: ta bort joker-logik, behåll övriga märken.
2. Bygga "Land i arena-raden": Match.venue -> "Arena, Stad, Mexiko/USA/Kanada".
3. När båda är klara: Release v1.0 (develop -> main).
Kör `/agent-kit` för att starta nästa task.

---

## RESUME-HERE , 2026-06-12 , T23 (#23) pinnat favoritlag + personlig statistik , PR #142 mot develop , KLAR

**Branch:** `feature/T23-favoritlag-statistik` @ HEAD `c1ab7bb`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/142 mot `develop` (Closes #23, state: OPEN)
**Live preview:** varje commit till branchen syns via Cloudflare PR-preview. Develop-main: vm-2026.pages.dev

### Vad T23 levererade

Favoritlag-pin (generisk, ej hardkodad Sverige) + personlig tips-statistik. localStorage-nyckeln
`vm2026-favorite-team` bar lagkoden. `derivePersonalStats` delar poangberakningsvagen med score.ts
(ingen parallell logik). `PersonalStatsSection` visar traffsakerhet, basta call, antal ratt utfall
och exakta traff. `MatchCard` far en `favorite`-prop som lyfter ut favoritlagets matcher.

**Leveranser:**

- Senior-developer commit `31e9434`: localStorage-pin, `derivePersonalStats`, `PersonalStatsSection`,
  `MatchCard` favorite-prop, 25+ tester (inklusive edge-fall: inga tips an).
- Design-frontend commit `40fd972`: tokens.css §25, favorit-chip guld-pill, hero-accuracy-siffra,
  basta-call-kort, form-sprak, contrast-t23.mjs, AA min 5.03:1.
- Lokal reviewer: GODKAND UTAN FYND.
- Copilot R1: 2 triviala fynd.
- Dirigent-fix commit `c1ab7bb`: kommentar-precision i App.tsx + ISO-kickoff i testfixtur.

**Verifiering (HEAD c1ab7bb):** build EXIT 0, npm test 1758 groena/55 skip/0 fail (184 filer),
lint + format:check EXIT 0. Lokal panel PASS. Copilot R1: 2 triviala, atgardade i c1ab7bb.

**Acceptanskriterier issue #23 (bockade av journalisten 2026-06-12):**
- [x] AC1: Pinna/andra favoritlag, paverkar relevanta vyer
- [x] AC2: Personlig statistik beraknas korrekt fran tips-historik
- [x] AC3: Tester for stats-berakning (edge-fall: inga tips an)
- [x] AC4: Bygger groent, lint rent, reviewad (lokal panel + copilot-loop), inga olosta findings

### Behoever-Daniel (uppdaterad lista)

**Befordringar (vantar pa godkannande):**
- Kommentar-pastar Forekomst 8: agent-regel for senior-developer.
- Uttommande-test Forekomst 3: agent-regel for reviewer.
- Pastar-filer-saknas Forekomst 4 (journalist): agent-regel for journalist.

**Kvar att besluta/agera:**
- Supabase e-postmall for inloggningsmejlet (kosmetisk): #81 stangdes 2026-06-12 pa Daniels order;
  mallsteget ar enda resten av T48b (koden ar byggd och live: OTP-login, dold arrangors-ingang,
  datamigrering).
- RLS-testrum i Supabase (3 rum + 5 anonyma users, 2026-06-12 15:18): star kvar pa Daniels uttryckliga beslut.
- TWA/Play-kontot: se docs/twa-guide.md.
- Release-gransen develop->main: nar ska main fa en formell release?
- #39-F1 (post-VM-vy): pinnad, ej byggd.
- T16b-slot-tippbarhet-ur-sim: pinnad.
- Board-kort #129/#132/#136: verifiera att de visas som Done i GitHub Projects.
- IMPROVEMENTS-kandidater (se slutkonsoliderings-blocket langre ner).
- Supabase-vendor eager-load (T25-F1): pinnad.

### Nasta steg

**Daniels beordrade koe ar TOM.** T44 (#75), T4c (#35) och T23 (#23) ar klara (PR:er oppna, vantar merge).

**Om PR #142 ANNU INTE mergad:**
Dirigenten har fullmakt. Merga: `gh pr merge 142 --merge --repo danielaldemir79/vm-2026`.
Stang issue #23: `gh issue close 23`. Flytta kort #23 till Done pa boarden.
Kolla om PR #141 (T4c) och PR #140 (T44) aven behover mergas i den ordningen.

**Om PR #142 REDAN mergad:**
T23 klar. All kod i Daniels beordrade koe ar nu live pa develop.
Nasta logiska steg:
1. Gatt igenom Behoever-Daniel-listan ovan.
2. Release-grans develop->main nar Daniel ar nojd.
3. Post-VM-planering.

Kor `/agent-kit` bara om en ny task ska startas.

---

## RESUME-HERE , 2026-06-12 , T4c (#35) arena/stad per match , PR #141 mot develop , KLAR

**Branch:** `feature/T4c-arena-stad` @ HEAD `c0fb8dc`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/141 mot `develop` (Closes #35, state: OPEN)
**Live preview:** varje commit till branchen syns via Cloudflare PR-preview. Develop-main: vm-2026.pages.dev

### Vad T4c levererade

T4b:s matches.ts hade ett `VENUE_UNKNOWN`-platshallare per match (gissa-aldrig-policy). T4c fyller
arenan + vaardstaden per match ur FIFAs officiella spelschema, alla 104 matcher, for alla 16 arenor
i USA/Mexiko/Kanada. Inga arenor handskrivna i matches.ts - allt ar sparbat till kallan.

**Leveranser (commit 6f5c97a):**
- `src/data/wc2026/venue-source.txt` - gold source, en rad per match (MATCH_ID | venue=Arena, Stad | match=etikett)
- `src/data/wc2026/venue-parser.ts` - ren parser, fail-loud pa okant id / dubblett / saknad match
- `src/data/wc2026/venue-source.test.ts` - 22 tester: regenerera-och-diffa + mutationstest + 104/16-integritet + AT&T=9-aggregat-korskoll
- `src/data/wc2026/matches.ts` - regenererad (BARA venue-faltet aendrat, byte-identisk kickoff/lag/id)
- `docs/decisions.md` - T4c-blocket med 16-arenors-tabell + kallfoerteckning + avvikelseflagg

**Copilot R1-fix (commit c0fb8dc):** kommentar-referensen "funktionen tsString i team-profiles-parser.ts"
rattad att peka pa funktionens egen fil.

**Kallor (haamtade 2026-06-12):**
- PRIMAR: FIFAs spelschema via Wikipedia + Al Jazeera + Wikipedia knockout stage
- KORSKOLL: MLSSoccer, ESPN, Wikipedia per-grupp-sidor, matchrapporter for spelade matcher
- AVVIKELSE LOEST: g-G-1 (Belgien-Egypten) - Al Jazeera sade Vancouver, 4 andra kaller sager
  Lumen Field Seattle. Vald Seattle (4 mot 1, inklusive arenans egen event-sida).

**Verifiering (HEAD c0fb8dc):** build EXIT 0, npm test 1727 groena/48 skip/0 fail (178 filer),
lint + format:check EXIT 0. Lokal panel GODKAEND (egna fakta-stickprov mot externa kallor, alla groena;
F1 kosmetisk testsiffra i commit-meddelandet, uttryckligen avvisad). Copilot R1: 1 trivialt fynd,
atgaardat i c0fb8dc.

**Acceptanskriterier issue #35 (bockade av journalisten 2026-06-12):**
- [x] AC1: Alla 104 matcher har verifierad arena + vaardstad, inga platshallare
- [x] AC2: Gold source + parser + regenerera-och-diffa-test (samma monster som T4/T4b)
- [x] AC3: Matches.ts regenererad, BARA venue-faeltet aendrat
- [x] AC4: Build, test, lint groent; lokal panel PASS; Copilot R1 atgaerdat

### Nasta steg

**Om PR #141 ANNU INTE mergad:**
Dirigenten har fullmakt. Merga: `gh pr merge 141 --merge --repo danielaldemir79/vm-2026`.
Stang issue #35: `gh issue close 35`. Flytta kort #35 till Done pa boarden.

**Om PR #141 REDAN mergad:**
T4c klar. Naasta och SISTA task i Daniels beordrade koe: **#23 (T23 pinnat favoritlag + personlig statistik)**.
Koe tom efter T23 (issue #20/#21/#22 staangda not planned).

Skippade tasks: #20/#21/#22 staangda not planned - dessa ska INTE byggas.

**Behoever-Daniel-listan (oforaendrad fran T44):**
- Befordringar (vaantar pa godkaannande): kommentar-pastar Forekomst 8, uttommande-test Forekomst 3,
  pastar-filer-saknas Forekomst 3 (journalist).
- TWA/Play-kontot: se docs/twa-guide.md.
- Release-graansen develop->main: naer ska main fa en formell release?
- #39-F1 (post-VM-vy): pinnad, ej byggd.
- T48b: recoverable admin-login (#81 OPEN).
- T16b-slot-tippbarhet-ur-sim: pinnad.
- Board-kort #129/#132/#136: verifiera att de visas som Done i GitHub Projects.

---

## RESUME-HERE , 2026-06-12 , T44 (#75) footer-promo , PR #140 mot develop , Copilot-loopen aterupptas

**Branch:** `feature/T44-footer-promo` @ HEAD `267017b`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/140 mot `develop` (Closes #75, state: OPEN)
**Live preview:** varje commit till branchen syns via Cloudflare PR-preview. Develop-main: vm-2026.pages.dev

### Vad T44 levererade

Daniels feedback (#75, 2026-06-11): "footern ska lyfta upp mig, fa med hela min hemsida sa man
ser att man kan klicka dit." Implementerades i tva rundor:

- **Runda 1 (senior-dev, 9bf727c):** lugn variant - synlig app-adress i ledtexten, danielaldemir.com
  som separat inline-lank bredvid namnet (punkt-divider-variant).
- **Daniels live-feedback:** runda 1 var for blygsam. Runda 2 kravdes.
- **Runda 2 (design-frontend, a2a0b76):** hela footer-strukturen omskriven: DA-sigill (.vm-signature-seal,
  solid accent-bricka) + "Byggd av" / "Daniel Aldemir" som blickfang pa en framtradande rad,
  ".NET-systemutvecklare" som stodtext, danielaldemir.com som CTA-pill (.vm-install-pill-aterbruk,
  extern-lank-ikon, hover-accent-kant). Kontrast AA bada teman, min 5.40:1 (sigill ljust tema).
- **Copilot R1 (dirigent-fix, 267017b):** 2 triviala fynd atgardade - testnamn uppdaterade sa de
  matchar shippad layout (CTA-pill, inte "bredvid namnet").

**Commits pa branchen:**
- `9bf727c` - T44: footer-promo, synlig adress + utvecklar-promotion (#75)
- `a2a0b76` - T44: footer-promo runda 2, lyft Daniel + klickbar hemside-CTA (#75)
- `267017b` - T44: Copilot R1, testnamn matchar layouten (CTA-pill, inte bredvid namnet)

**Verifiering (HEAD 267017b):** build EXIT 0, npm test 1699 grona / 53 skip / 0 fail,
lint + format:check EXIT 0. Kontrast AA bada teman min 5.40:1. Reviewer PASS (lokal panel).
Copilot R1: 2 fynd atgardade, exit-kriterierna nackte.

**docs/decisions.md:** T44-blocket synkat mot shippad markup (runda-2-struktur dokumenterad,
punkt-divider-beskrivningen ersatt, testraden rattad till +3 nya T44 + 1 omskrivet T38-test).

### Nasta steg

**Om PR #140 ANNU INTE mergad:**
Dirigenten har fullmakt. Merga: `gh pr merge 140 --merge --repo danielaldemir79/vm-2026`.
Stang issue #75: `gh issue close 75`. Flytta kort #75 till Done pa boarden.

**Om PR #140 REDAN mergad:**
T44 klar. Nasta task i Daniels beordrade ko: **#35 (T4c arena/stad per match)** och
**#23 (T23 pinnat favoritlag + personlig statistik)**.

Copilot-loopen ar ATERUPPTAS pa Daniels order. Kors pipeline: lokal panel -> Copilot-loop -> merge.

**Behover-Daniel-listan (oforandrad fran slutkonsolidering):**
- Befordringar (vackar pa godkannande): kommentar-pastar Forekomst 8, uttommande-test Forekomst 3,
  pastar-filer-saknas Forekomst 3 (journalist).
- TWA/Play-kontot: se docs/twa-guide.md.
- Release-gransen develop->main: nar ska main fa en formell release?
- #39-F1 (post-VM-vy): pinnad, ej byggd.
- T48b: recoverable admin-login (#81 OPEN).
- T16b-slot-tippbarhet-ur-sim: pinnad.
- Board-kort #129/#132/#136: verifiera att de visas som Done i GitHub Projects.

---

## RESUME-HERE , 2026-06-12 , SLUTKONSOLIDERING , backloggen TOM, allt live pa develop

**Branch:** `chore/handoff-slutkonsolidering` (docs-only, ingen kod)
**Develop SHA:** `6c003d8` (Merge pull request #138 T25-kvalitetspass)
**Live:** https://vm-2026.pages.dev (Cloudflare Pages, deployas fran develop)
**Tester:** 1696 enhetstest + 9 E2E (Playwright) grona. Build EXIT 0.

### Fem tasks mergade sedan senaste journalistkörning

| Task | Issue | PR | Vad |
|---|---|---|---|
| T69 | #132 | #133 | FIFA juni-rankingen, 19 rank-rader, alla källbelagda + spot-checkade |
| T33 | #56 | #134 | Delad Modal-primitiv, 5 dialoger migrerade beteende-neutralt, 14 kontraktstester |
| T29 | #48 | #135 | Demo-chippets AA fixad pa 4 vyer, delad .vm-demo-chip + AA-guard-test |
| T70 | #136 | #137 | Lean-stad (dott install-maskineri bort, flaky teardown rotorsakad .env.local-live-kanaler + gatade callbacks, T68-F1-gating) |
| T25 | #25 | #138 | Kvalitetspasset, code-splitting 894->580 kB initial, Playwright-E2E 7 floden + axe (npm run test:e2e), a11y-fixar |

Alla PR:er granskade av lokal panel (Copilot pausad pa Daniels beslut). Alla reviewer-PASS. Inga olosta F-fynd.

### Board-städning (GraphQL-bekraftad 2026-06-12)

Foljande kort flyttade till Done av journalisten:
- #19 (T19 gamification): In Review -> Done
- #25 (T25 kvalitetspass): Backlog -> Done
- #48 (T29 demo-chip-aa): Ready -> Done
- #56 (T33 modal-primitiv): Ready -> Done
- #65 (T37, stangd issue): Ready -> Done

Kort #129/#132/#136 saknas pa boarden (dessa issues lades till direkt pa boarden fran en annan session och kan ha fatt unika items som inte syns i de 50 forsta - se nedan under "om kortens Done-status inte syns").

### Behovet av Daniels beslut (samla pa ett stalle)

**Befordringar (vackar pa Daniels godkannande):**
1. Kommentar-pastar - Forekomst 8 i lessons/senior-developer.md. Typ: agent-regel. Knepet: "Kopiera aldrig ett kodblock fran handoff/review - skriv om fran originalet sa du inte latsar forstå koden." Nar forekomst >= 3 befordras det till agent-regel i README eller till en specifik agentfil.
2. Uttommande-test - Forekomst 3 i lessons/reviewer.md (eller liknande). Typ: agent-regel. Knepet: "Verifiera att edge-fall ocksa ar med (ex: 0, max, grans) i enhetstester for berakningsfunktioner."
3. Pastar-filer-saknas - Forekomst 3. Typ: agent-regel. Knepet: "Innan du pastar en fil: verifiera att den faktiskt ar skapad pa disk (Glob/Read), inte bara lovar i handoff."

**IMPROVEMENTS-kandidater (for docs/IMPROVEMENTS.md eller BACKLOG.md):**
1. Build-grind: `npm run build` kastar exit 0 aven vid vite-varningar - lagg en explicit exit-grind.
2. Nightly tidsrota-vakt: datum-bundna testurlen ruttnar utan ett schema-jobb som kollar dem.
3. yt-AC callsite-krav: accessibility-tester saknar kallstacken nar de failer - svarare att lokalisera.
4. Diakritik-commit-hook: projektet saknar den kalibrerade git-hook som direkten-ryd-webb fick i T25.
5. Contrast-lib-delning: kontrast-berakningarna i flera filer - dela en common-helper.
6. Supabase-env-neutralisering i test-setup: SUPABASE_URL laddas globalt aven i enhetstester utan live-DB.
7. Modal-stack: ingen focus-trap-garanti pa kapslade modaler - framtida risk.

**Kvar for Daniel att besluta/agera:**
- TWA/Play-kontot: se docs/twa-guide.md. Behover Daniels Play-konsol-konto for att slutfora.
- Release-gransen develop->main: nar ska main fa en formell release? All kod ar pa develop nu.
- #39-F1: post-VM-vyn (resultatlista efter sista match). Pinnad, ej byggd.
- T48b: recoverable admin-login. Issue #81 OPEN. Behover beslut om det ska byggas fore VM.
- T16b-slot-tippbarhet-ur-sim: slutspels-slot-tips ej tippbart ur simuleringsfloden. Ej inbyggt.
- Copilot-loopen: aterupptas pa nasta task? Eller fortsatter lokal panel som sista grind?
- supabase-vendor eager-load (T25-F1): Supabase-klienten laddas direkt - lat-laddning pinnad.
- Board-kort-stadning: GraphQL-hickor hindrade full koll pa #129/#132/#136 pa boarden - verifiera att dessa visas som Done i GitHub Projects.

### Nasta steg

**Om Daniel inte beslutat nagot specifikt:**
Det finns INGEN backlog-task att bygga. Allt ar klart. Nasta logiska steg ar:
1. **Daniels beslutspunkter ovan** - gatt igenom och stang/pinna/godkann var och en.
2. **Release-grans develop->main** - nar Daniel ar nojd: `gh pr create` fran develop->main, tagg v1.0.
3. **Post-VM-planering** - vad (om nagot) ska leva kvar efter VM 2026?

**FORTSATTNINGS-PROMPT (nar Daniel atervander till projektet):**

> Starta i `C:\Repo\vm-2026`. Backloggen ar TOM. Alla issues stangda utom #81 (T48b, open),
> #69 (T40, open), #75 (T44, open) och de framtida (T20-T23 som ar Backlog utan prioritet).
>
> 1. Gott igenom "Behovet av Daniels beslut" ovan och losa var punkt.
> 2. Om Daniel vill bygga T48b (recoverable admin-login): skapa feature-branch fran develop, bygg.
> 3. Om Daniel vill bygga T40 (#69, resultat-ratt-feedback): skapa feature-branch fran develop, bygg.
> 4. Om det ar dags for release: skapa PR develop->main, tagg v1.0.
> 5. Borja annars sondags-review / post-mortem pa projektet.
>
> Systemet ar stabilt. Kör `/agent-kit` bara om en ny task ska startas.

---

## RESUME-HERE , 2026-06-12 , T68/#129 (komprimerbara sektioner) KLAR - PR #131 vantar pa merge

**Branch:** `feature/T68-komprimering` @ HEAD `d4752cf`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/131 mot `develop` (Closes #129, state: OPEN)
**Board:** Kort #129 satt till "In Review" av journalisten 2026-06-12 (GraphQL-bekraftad).
Batch-städning: kort #24/#64/#76/#121/#123 satta till Done (GraphQL-bekraftade).

**Vad T68 levererade (Daniels 13-punkts UX-spec):**
- `CollapsibleSection`-primitiv: fade+cue+ResizeObserver-gating, aria-expanded, fokus, mörkt/ljust.
- Sju sektioner komprimerbara: Gruppspelet, Vad krävs, Slutspelsträdet, Simulering, Tippa matcherna, Tippa grupperna, Tippa slutspelet + Admin + Poäng/avslöjande.
- Sektion 1 (Dagens matcher) + Sektion 6 (Rum) orörda.
- Tips=bara idag default med MEDVETET omsvängd paritetsguard (ersätter T62-defaulten).
- Alfabetisk mästar-lista med sv-locale-sortering.
- Spara grupptips-knapp + osparade-ändringar-indikator (ingen auto-spar).

**T36-retro (#64, PR #130 mergad, ingen journalistkorning):**
TWA-utredning: assetlinks-stub (/.well-known/assetlinks.json), twa-guide.md med Daniels Play-konto-lista.
Reviewer PASS + F1 dangling-pekare i README åtgärdad. #64 satt till Done.

**Commits (T68):**
- `2405fe1` - feat(ui): delad komprimerings-primitiv + sektioner överblickbara (#129)
- `3f40029` - feat(tips): dagens-fönster, alfabetisk mästar-lista, Spara grupptips (#129)
- `d4752cf` - feat(ui): premium-finish på komprimerings-faden + första-rad-glimt (#129)

**Verifiering:** build EXIT 0, full svit EXIT 0 (1682 gröna/175 filer), lint/format rena.
Reviewer PASS: alla 13 punkter callsite-verifierade.
F1 pinnad: övre toggle ovillkorlig vid icke-klippt transient-läge - valfri polish.

**Acceptanskriterier issue #129 (bockade av journalisten 2026-06-12):**
- [x] AC1: Alla sektioner enligt Daniels lista, dagens matcher + rum orörda
- [x] AC2: Ett delat mönster (CollapsibleSection), a11y, mobil-först, mörkt/ljust
- [x] AC3: Avbryt simulering-funktion synlig i sim-läget
- [x] AC4: VM-mästar-listan alfabetisk (sv-locale)
- [x] AC5: Spara grupptips + osparade-indikator
- [x] AC6: FULL svit EXIT 0, build EXIT 0, reviewad (lokal panel, Copilot pausad)
Tolknings-not: punkt 11 (Poäng/avslöjande) komprimerad med expanderat-direkt som dirigentens default - flippa om Daniel säger annat.

**FORTSATTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR för T68/#129 (feature/T68-komprimering) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 131 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #129 manuellt: `gh issue close 129`.
> Flytta kort #129 till Done på boarden.
> Merga eventuellt kvarstående äldre öppna PR:er om sådana finns (kolla `gh pr list --state open`).
>
> Om PR för T68/#129 REDAN mergad:
> T68 klar. Nästa task: **FIFA juni-ranking** - generera lag-profiler med uppdaterade rank-värden.
> Kör `npm run gen:team-profiles` (eller motsvarande) och bekräfta att rankningsdatan för VM 2026
> stämmer mot FIFA:s officiella juni-2026-ranking. Skapa issue för tasken om ingen finns.
> Därefter: #25 (prestanda/E2E/a11y), #56 (modal-primitiv, rule-of-three x5-6 nu!),
> #48 (+demo-chip-AA-utökningen), lean-städ (install-maskineri, RoomPanel-teardown-flaky,
> migrations-versions-städ, T68-F1-polish).
>
> Bär framåt (alla tasks):
> - Kommentar-pastar Förekomst 8: FLAGGAD för Daniel (se nedan) - vaktar på godkännande.
> - **#56 (delad modal-primitiv):** rule-of-three passerad x5-6, kort i Ready.
> - **#48 (demo-chip a11y):** 4+ vyer under AA 3.17:1 i ljust tema.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **"Behöver Daniel"-kö:** befordringar (kommentar-pastar 8), IMPROVEMENTS-kandidater,
>   Play-kontot (TWA), release-gränsen, #39-F1, T48b, T16b-slot-ur-sim.
> - **Daniels process-beslut:** Copilot-loopen PAUSAD, lokala granskningen är sista grinden.
> - **Vakthund-rutinen:** varje väntan får deadline + eskalering.
> - **Fullmakt:** dirigenten har fullmakt hela vägen.

---

## RESUME-HERE , 2026-06-12 , T24/#24 (reaktioner) KLAR - PR vantar pa merge

**Branch:** `feature/T24-reaktioner` @ HEAD `ef63455` (journalist-commit)
**PR:** https://github.com/danielaldemir79/vm-2026/pull/128 mot `develop` (Closes #24, state: OPEN)
**Board:** Kort #24 satt till "In Review" av journalisten 2026-06-12 (GraphQL-bekräftat).

**Vad T24 levererade:**
- `room_reactions`-tabell med schema + RLS + Realtime live (1 migrering).
- Kurerad 8-emoji-pallett konstant-matchad mot klient-konstanten CHECK (ingen drift möjlig).
- Tolerant-inert hook: optimistisk UI-uppdatering faller tyst om Supabase-anrop misslyckas.
- Aggregat-vy + `MatchReactions`-komponent integrerad i dagens-vyn.
- rooms.css §9: single-sourcad count-färg, contrast-t24.mjs verifierar AA live.
- Review-F1 åtgärdad: versions-placeholder-claims pinnade med ärlig precision i decisions-raden.

**Commits (T24):**
- `cc7ef75` - feat(T24): emoji-reaktioner pa matcher i rummet (#24)
- `20830b6` - design(T24): reaktionsradens premium-finish, kvallsljus-brickor (#24)
- `401188a` - dirigent: review-F1, arlig versions-precision i decisions-raden (#24)

**Verifiering:** build EXIT 0, full svit EXIT 0 (1650 gröna/173 filer), lint/format rena.
RLS live-bevisad 2 vägar, 0 test-rester. Reviewer PASS, F1 pinnad + åtgärdad,
lesson committad-migration-pastar Förekomst 2.

**Acceptanskriterier issue #24 (bockade av journalisten 2026-06-12):**
- [x] AC1: Reagera med emoji på matcher/topplista, syns för rummet
- [x] AC2: RLS så bara rum-medlemmar ser/reagerar
- [x] AC3: Tester för reaktions-lagring + behörighet
- [x] AC4: Bygger grönt, lint rent, reviewad (lokal panel + copilot-loop), inga olösta findings

**FORTSATTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR för T24/#24 (feature/T24-reaktioner) ANNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge <PR-nummer> --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #24 manuellt: `gh issue close 24`.
> Flytta kort #24 till Done på boarden.
> Merga även äldre öppna PR:er om de fortfarande är öppna (se föregående RESUME-HERE för lista,
> inkl. PR #127 T19/#19 om inte redan mergad).
>
> Om PR för T24/#24 REDAN mergad:
> T24 klar. Nästa task i kön: **#64 (TWA Play Protect)** - läs issuen noggrant.
> Bedöm vad som går utan Daniels Play-konto. Trolig AVGRÄNSNING: dokumentera vad som kräver honom,
> bygg det som kan bevisas utan Play-konto (assetlinks-fil, bubblewrap-config-utkast, installationstest).
> Darefter: D-resten: FIFA-juni-ranking (npm run gen:team-profiles + rank-värden), #25 prestanda/E2E/a11y,
> #56 modal-primitiv (rule-of-three x5!), #48+demo-chip-AA-utökningen, lean-städet
> (install-maskineri + RoomPanel-teardown-flaky + migrations-versions-städ-kandidaten).
>
> Bär framåt (alla tasks):
> - Kommentar-pastar Förekomst 7: FLAGGAD för Daniel (se nedan) - vaktar på godkännande för befordran.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (5+ dialoger), kort i Ready.
> - **#48 (demo-chip a11y):** 4+ vyer under AA 3.17:1 i ljust tema.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **"Behöver Daniel"-kö:** befordringar (kommentar-pastar 7), IMPROVEMENTS-kandidater (6 st nu),
>   FIFA-juni-ranking, release-gränsen, #39-F1, T48b.
> - **Daniels process-beslut:** Copilot-loopen PAUSAD, lokala granskningen är sista grinden.
> - **Vakthund-rutinen:** varje väntan får deadline + eskalering.
> - **Fullmakt:** dirigenten har fullmakt hela vägen.

---

## RESUME-HERE , 2026-06-12 , T19/#19 (gamification) KLAR - PR vantar pa merge

**Branch:** `feature/T19-gamification` @ HEAD `29a1b0e` (journalist-commit)
**PR:** https://github.com/danielaldemir79/vm-2026/pull/127 mot `develop` (Closes #19, state: OPEN)
**Board:** Kort #19 satt till "In Review" av journalisten 2026-06-12 (GraphQL-bekraftat).

**Vad T19 levererade:**
- `room_jokers`-tabell med 2 migrationer live (schema + constraint-trigger som gar en joker per svensk dag per rum-match).
- `scoreMember` dubblerar BARA matchpoang nar joker-flaggan ar satt - ren, inga sidoeffekter.
- `derive-badges` + badge-row: rena hardledningar med kallhänvisade regler, negativa fall täckta.
- En-joker-per-svensk-dag strukturellt via before-trigger (strukturell garanti, inte applogik).
- Joker-stjarna med pop-animation gatad bakom `prefers-reduced-motion`, märkes-brickor i solid-guld-form, ren CSS utan extra beroenden.
- 3 review-nitar åtgärdade: sr-only-kolon, sant testnamn, no-op-test för otippad joker + F3-precisions-not.

**Commits (T19):**
- `d9a9492` - senior-dev: room_jokers 2 migrationer live, joker dubblerar bara matchpoang, derive-badges/badge-row
- `5369f0b` - design: joker-stjarna med pop gatad reduced-motion, markes-brickor solid-guld-form, ren CSS
- `ec6160a` - dirigent: 3 review-nitar, sr-only-kolon + sant testnamn + no-op-test otippad joker + F3-not

**Verifiering:** build EXIT 0, FULL svit EXIT 0 (168 filer), lint/format rena. Reviewer PASS - mutationstestade dubblingen (rott utan fix), live-verifierade RLS-paritet med tips-sekretessen.

**Acceptanskriterier issue #19 (bockade av journalisten 2026-06-12):**
- [x] AC1: Streaks + märken delas ut korrekt efter regler, joker-match dubblar poang
- [x] AC2: Joker last vid deadline (kan inte andras efterat)
- [x] AC3: Tester för badge-/streak-/joker-regler (edge-fall: streak bryts, joker pa avgjord match)
- [x] AC4: Bygger gront, lint rent, reviewad (lokal panel), inga olosta findings

**FORTSATTNINGS-PROMPT (autonom ko):**
> Kor `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR for T19/#19 (feature/T19-gamification) ANNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 127 --merge --repo danielaldemir79/vm-2026`.
> Stang issue #19 manuellt: `gh issue close 19`.
> Flytta kort #19 till Done pa boarden.
> Merga aven aldre oppna PR:er om de fortfarande ar oppna (se foregaende RESUME-HERE for lista).
>
> Om PR for T19/#19 REDAN mergad:
> T19 klar. Nasta task i kon: **#24 (reaktioner, KISS-MVP ovanpa room_comments?)** - läs issuen noggrant.
> Darefter: #64 (TWA) -> D-resten (FIFA-juni-ranking, #25, #56 modal, #48+demo-chip-AA, lean-städet, RoomPanel-teardown-flaky städ).
>
> Ber framat (alla tasks):
> - Kommentar-pastar Forekomst 7: FLAGGAD for Daniel (se nedan) - vaktar pa godkannande for befordran.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD, kort i Ready.
> - **#48 (demo-chip a11y):** 4+ vyer under AA 3.17:1 i ljust tema.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **"Behover Daniel"-ko:** befordran kommentar-pastar Forekomst 7 (reviewer.md, vantar godkannande), aldre befordringar, IMPROVEMENTS-kandidater, FIFA-juni-ranking, release-granssen, #39-F1, T48b.
> - **Daniels process-beslut:** Copilot-loopen PAUSAD, lokala granskningen ar sista grinden.
> - **Vakthund-rutinen:** varje vantan far deadline + eskalering.
> - **Fullmakt:** dirigenten har fullmakt hela vagen.

---

## RESUME-HERE , 2026-06-12 , T45/#76 (admin-statistik) KLAR - PR #126 vantar pa merge

**Branch:** `feature/T45-admin-statistik` @ HEAD `2e0b72f`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/126 mot `develop` (Closes #76, state: OPEN)
**Board:** kort #76 tillagt och satt till "In Review" av journalisten 2026-06-12 (GraphQL-bekraftat). Kort #121 satts till Done (PVTI bekraftat).

**Vad T45 levererade:**
- 2 SECURITY DEFINER-RPC:er (`get_admin_room_stats`, `get_admin_leaderboard`) gatade pa `is_app_admin()`, live-applicerade 1:1 mot Supabase via MCP.
- Sekretess via SAMMA deadline-helpers som tips-RLS, poang via befintliga `buildLeaderboard`. Ingen ny logik, ingeneting dubbelt.
- RLS-integrationstest med riktiga sessioner: anon nekas, icke-admin nekas, admin far data. Bevis i testerna.
- Paragraf 23 i SPEC: arrangörens kontrollpanel, podium-vy, AA 6.12/4.87 uppmatt via `contrast-t45.mjs`.
- Del 2 av issuen (vanliga ser bara facit utan sim) var redan levererad i T48, verifierat att scope ar uppfyllt.

**Commits (T45):**
- `c2cdb66` - T45 (#76): admin-statistik, alla rum + medlemmar + vem tippar bast
- `2e0b72f` - T45-visuellt (#76): premium-finish pa arrangörens kontrollpanel - HEAD

**Verifiering:** build EXIT 0, 1605 grona, lint/format rena. Lokal reviewer PASS.
- F1 (null-typ vs generator-signatur): accepterad + dokumenterad i decisions.md. Handskrivna null-typer ar mer lättlasta an generator-output i detta sammanhang.
- F2 (act-varningar i tester): kosmetisk, inga funktionella fel.

**Acceptanskriterier issue #76 (bockade av journalisten 2026-06-12):**
- [x] AC1: Admin ser alla rum + medlemmar + statistik (vem tippar bast), RLS-sakrad via SECURITY DEFINER
- [x] AC2: Vanliga medlemmar utan sim: bara facit + 3-dagars matchlista + expandera, ingen inmatning
- [x] AC3: Vanliga medlemmar i sim: inmatning tillaten (hypotetiskt, isolerat)
- [x] AC4: Admin facit-inmatning (T42). Tydligt budskap per läge
- [x] AC5: Inga secrets, RLS-bevisad, tester, gront/lint/reviewad, inga oloста findings

**FORTSATTNINGS-PROMPT (autonom ko):**
> Kor `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #126 (T45/#76, feature/T45-admin-statistik) ANNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 126 --merge --repo danielaldemir79/vm-2026`.
> Stang issue #76 manuellt: `gh issue close 76`.
> Flytta kort #76 till Done pa boarden (nu "In Review", projekt 2, item PVTI_lAHODcT4Cc4BaIWPzgvaAzY).
> Merga aven aldre oppna PR:er om de fortfarande ar oppna: PR #125 (T66/#121), PR #122 (T65/#119), PR #120 (T64/#118), PR #116 (T63/#113), PR #115 (T62/#111), PR #114 (T61/#110), PR #117 (T18/#18), PR #112 (T54/#93), PR #109 (T60/#102), PR #108 (T56/#100), PR #107 (T58/#99), PR #106 (T57/#98), PR #105 (T41/#70), PR #104 (T55/#96), PR #103 (T59/#97), PR #101 (T53/#95), PR #94 (T52/#91) - stang resp. issue och flytta till Done.
>
> Om PR #126 REDAN mergad:
> T45 klar. Nasta task i kon: **#19 (T19 gamification: streaks/marken/joker)** - las issuen noggrant, KISS-MVP, inga gold-plating. Darefter: #24 -> #64 -> D-resten.
>
> Bar framat (alla tasks):
> - **#35 (arena/stad):** venue = platshallar.
> - **FNV-hash:** konsolidera vid 3:e anvandning.
> - **Stegnings-dubblett:** extrahera vid 3:e anvandning.
> - **#48 (demo-chip a11y):** 4+ vyer under AA 3.17:1 i ljust tema - koppla till #48.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4+ dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **T45-F1-regenererings-not:** null-typer i admin-RPC-svar ar handskrivna (accepterat), REGENERERA INTE automatiskt - las decisions.md fore nagon RPC-typandring.
> - **"Behover Daniel"-ko:** push-notiser (T22), befordran kommentar-pastar Forekomst 6 (reviewer.md, vantar godkannande), 3 aldre befordringar (Forekomst 3+/4), 5 IMPROVEMENTS-kandidater, FIFA-juni-ranking, release-granssen, #39-F1-produktbeslut, T48b.
> - **Daniels process-beslut:** Copilot-loopen PAUSAD, lokala granskningen ar sista grinden.
> - **Vakthund-rutinen (2026-06-12):** varje vantan far deadline + eskalering, nasta steg dispatchas i samma tur.
> - **T26 DR-webb-inbaddning:** SKIPPAD, stangd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vagen till slutet.

---

## RESUME-HERE , 2026-06-12 , T66/#121 (kommentarer i rummet) KLAR - PR #125 väntar pa merge

**Branch:** `feature/T66-kommentarer` @ HEAD `7510789`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/125 mot `develop` (Closes #121, state: OPEN)
**Board:** kort #121 tillagd och satt till "In Review" av journalisten 2026-06-12 (GraphQL-bekraftat).
**T67-retro:** PR #124 (feature/T67-deadline-21juni) REDAN MERGAD fore denna journalist-korning. Kort #123 satts till "Done".

**Vad T66 levererade:**
- Ny tabell `room_comments` (id, room_id, user_id, content, created_at): schema + RLS live-applicerad 1:1 mot Supabase via MCP.
- RLS-bevis med 3 riktiga sessioner: anon nekas, utomstande rum nekas, agare-delete bevisat. Icke-medlem kan varken lasa eller skriva.
- Realtime: ny kanal `room_comments:{roomId}` via befintlig signal-inte-data-infra (T18). INSERT-event triggar tyst refetch.
- Input-validering: langdgrans (max 500 tecken), XSS-sakert via React-textrendering.
- Chatt-design med AA-matningar (min 4.5:1), scroll till senaste meddelande, aria-live-region.
- Review-F1 (design-frontend): ivrig modul-konstant brot 2 orelaterade testfiler via barrel-mockar. Latat till funktion. Lesson skriven.
- 1552 grona tester / 158 filer, build EXIT 0, lint/format rena. Reviewer: FAIL->atgardad->PASS.

**T67-retro (PR #124 mergad, retroaktivt dokumenterad):**
- pool_extended_deadline flytad 14/6 -> 21/6 (2026-06-21T21:59:00Z), live-applicerad + bevisad via read-only SQL.
- Klient-paritet mutations-vaktad: POOL_EXTENDED_DEADLINE_ISO = DB-instanten, en sanning.
- Forkorta-aldrig vaktas syntetiskt (ingen grupp brod granssen).
- Reviewer PASS, F1: MCP oversatte svensk SQL-kommentar till engelska i live-migrationens body - precisions-not tillagd i decisions.md.

**Commits (T66):**
- `a41fc4d` - T66 (#121): kommentarer i rummet (schema + RLS + Realtime + klient)
- `f16eb34` - T66 (#121): premium chatt-finish (design, AA, aria)
- `7510789` - T66: review-F1, countWarnAt lat funktion i stallet for ivrig modul-konstant (#121) - HEAD

**Verifiering:** build EXIT 0, 1552 grona, 0 roda, lint/format rena. Lokal reviewer PASS.

**Acceptanskriterier issue #121 (bockade av journalisten 2026-06-12):**
- [x] AC1: Rumsmedlem kan skriva + se kommentarer i sitt rum, live utan reload
- [x] AC2: Icke-medlem ser/skriver inget (RLS-bevisat med 3 riktiga sessioner)
- [x] AC3: Radera egen kommentar, aldrig andras
- [x] AC4: Langdgrans + saker rendering, tester, gront + reviewad

**FORTSATTNINGS-PROMPT (autonom ko):**
> Kor `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #125 (T66/#121, feature/T66-kommentarer) ANNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 125 --merge --repo danielaldemir79/vm-2026`.
> Stang issue #121 manuellt (`gh issue close 121`).
> Flytta kort #121 till Done pa boarden (nu i "In Review", projekt 2, item PVTI_lAHODcT4Cc4BaIWPzgvihIc).
> Merga aven aldre oppna PR:er om de fortfarande ar oppna: PR #122 (T65/#119), PR #120 (T64/#118), PR #116 (T63/#113), PR #115 (T62/#111), PR #114 (T61/#110), PR #117 (T18/#18), PR #112 (T54/#93), PR #109 (T60/#102), PR #108 (T56/#100), PR #107 (T58/#99), PR #106 (T57/#98), PR #105 (T41/#70), PR #104 (T55/#96), PR #103 (T59/#97), PR #101 (T53/#95), PR #94 (T52/#91) - stang resp. issue och flytta till Done.
>
> Om PR #125 REDAN mergad:
> T66 klar. Nasta task i kon: **#76 (T45 admin-statistik)** - las issuen noggrant.
> Darefter: #19 -> #24 -> #64 -> D-resten.
>
> Bar framat (alla tasks):
> - **#35 (arena/stad):** venue = platshallar.
> - **FNV-hash:** konsolidera vid 3:e anvandning.
> - **Stegnings-dubblett:** extrahera vid 3:e anvandning.
> - **#48 (demo-chip a11y):** kort i Ready. 4+ vyer med demo-chip under AA 3.17:1 i ljust tema - koppla till #48.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **Lean-stad-kandidat (T63):** resolveInstallMode/dismiss-maskineriet produktions-dott, pinnat for framtida task.
> - **T16b-pin:** slot-tippbarhet ur simulering = eget framtida server-side-beslut.
> - **"Behover Daniel"-ko:** push-notiser (T22), befordran kommentar-pastar Forekomst 6 (reviewer.md, vantar godkannande), 3 aldre befordringar (Forekomst 3+/4), 5 IMPROVEMENTS-kandidater (build-grind STARK + nightly-tidsrota-vakt + yt-AC + diakritik-commit-hook + T58-callsite-krav), FIFA-juni-ranking, release-granssen, #39-F1-produktbeslut, T48b.
> - **Daniels process-beslut:** Copilot-loopen PAUSAD, lokala granskningen ar sista grinden. Aterstarts nar lanseringstrycket ar over.
> - **Vakthund-rutinen (2026-06-12):** varje vantan far deadline + eskalering, nasta steg dispatchas i samma tur.
> - **T26 DR-webb-inbaddning:** SKIPPAD, stangd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vagen till slutet.

---

## RESUME-HERE , 2026-06-12 , T65/#119 (föreslå-knapp) KLAR - PR #122 väntar på merge

**Branch:** `feature/T65-foresla-knapp` @ HEAD `3c39b1e`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/122 mot `develop` (Closes #119, state: OPEN)
**Board:** kort #119 tillagt och satt till "In Review" av journalisten 2026-06-12 (GraphQL-bekräftat: name="In Review").

**Vad T65 levererade:**
- `deriveTippedGroupSuggestion` i `src/features/tips-bracket/derive-tipped-group-suggestion.ts`: per-grupp-härledning av 1:a/2:a ur delade motorer (samma `deriveGroupTables` + `computeStandings` som T64). Separerat från tips-bracket-lagret för testbarhet och återanvändning.
- Identitets-seamen id->code testad mot drift: grupp-id och lagkod är separata entiteter, ingen sammanblandning möjlig.
- Knappen förifyller formulärfälten, sparar aldrig automatiskt. Inaktiverad vid ofullständiga matchtips, dold vid passerad deadline.
- aria-describedby-kommentar rattad (reviewer F1): kommentaren beskriver nu faktiskt vad attributet gor, inte en kopia av label-texten.
- 1550 tester grona, build EXIT 0, lint/format rena.
- Lokal reviewer PASS (F1 åtgärdad, F2-stro-fil städad av dirigenten pre-review). Copilot pausad.

**Commits:**
- `266e86f` - T65 (#119): deriveTippedGroupSuggestion per-grupp, aldrig auto-spar
- `3c39b1e` - T65: review-F1, sann aria-describedby-kommentar (#119) - HEAD

**Verifiering:** build EXIT 0, 1550 grona, 0 roda, lint/format rena. Lokal reviewer PASS.

**Acceptanskriterier issue #119 (bockade av journalisten 2026-06-12):**
- [x] AC1: Knapp per grupp som förifyller 1:a/2:a ur matchtipsen
- [x] AC2: Aldrig auto-spar, befintliga tips orörda tills användaren själv sparar
- [x] AC3: Ärligt inaktiverad vid ofullständiga matchtips, dold/låst vid passerad deadline
- [x] AC4: Delad härledning med T64, tester, grönt + reviewad

**Daniels process-beslut (sparat i user-memory 2026-06-12):**
Vakthund-rutinen: varje väntande PR/beslut får en deadline + eskaleringsplan. Nästa steg dispatchas i samma tur för att undvika att arbetsflödet stannar.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #122 (T65/#119, feature/T65-foresla-knapp) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 122 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #119 manuellt (`gh issue close 119`).
> Flytta kort #119 till Done på boarden (nu i "In Review", projekt 2, item PVTI_lAHODcT4Cc4BaIWPzgvhm8w).
> Merga även äldre öppna PR:er om de fortfarande är öppna: PR #120 (T64/#118), PR #116 (T63/#113), PR #115 (T62/#111), PR #114 (T61/#110), PR #117 (T18/#18), PR #112 (T54/#93), PR #109 (T60/#102), PR #108 (T56/#100), PR #107 (T58/#99), PR #106 (T57/#98), PR #105 (T41/#70), PR #104 (T55/#96), PR #103 (T59/#97), PR #101 (T53/#95), PR #94 (T52/#91) - stäng resp. issue och flytta till Done.
>
> Om PR #122 REDAN mergad:
> T65 klar. Nästa tasks i kön PARALLELLT om möjligt:
> 1. **#121 (T66 Kommentarer i rummet)** - Daniel har lovat klassen! Läs issuen noggrant. Kräver: RLS-bevis + Supabase Realtime + input-validering. Hög prioritet.
> 2. **T67 (deadline-flytt 14/6 -> 21/6 för grupp+champion)** - Daniels beslut. Byggs OMEDELBART, samma mönster som T53. Viktigt innan 14/6.
> Därefter: #76 (T45 admin-statistik) -> #19 -> #24 -> #64 -> D-resten.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready. 4+ vyer med demo-chip under AA 3.17:1 i ljust tema - koppla till #48.
> - **#56 (delad modal-primitiv):** rule-of-three passerad (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **Lean-städ-kandidat (T63):** resolveInstallMode/dismiss-maskineriet produktions-dött, pinnat för framtida task.
> - **T16b-pin:** slot-tippbarhet ur simulering = eget framtida server-side-beslut.
> - **"Behöver Daniel"-kö:** push-notiser (T22), befordran kommentar-pastar Förekomst 6 (reviewer.md, väntar godkännande), 3 äldre befordringar (Förekomst 3+/4), 5 IMPROVEMENTS-kandidater (build-grind STARK + nightly-tidsrota-vakt + yt-AC + diakritik-commit-hook + T58-callsite-krav), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **Daniels process-beslut:** Copilot-loopen PAUSAD, lokala granskningen är sista grinden. Aterstarts när lanseringstrycket är over.
> - **Vakthund-rutinen (nytt 2026-06-12):** varje väntan får deadline + eskalering, nästa steg dispatchas i samma tur.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-12 , T64/#118 (treor ur matchtipsen) KLAR - PR #120 väntar på merge

**Branch:** `feature/T64-treor-ur-matchtips` @ HEAD `7d76887`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/120 mot `develop` (Closes #118, state: OPEN)
**Board:** kort #118 tillagd och satt till "In Review" av journalisten 2026-06-12 (item-edit exit 0, bekraftat).

**Journalist-not for T18 (saknad journalist-körning):**
T18 (Supabase Realtime, PR #117) mergades 2026-06-12 utan journalist-körning pga Copilot-hänget (2 förfrågningar, 0 svar) och Daniels tempo. Commit: `fa8b780` (merge-commit), implementation: `fce547e`. Hög-risk-review: PASS utan fynd. Issue #18 stängs av dirigenten manuellt i merge-steget. Daniels process-beslut: Copilot-loopen PAUSAD tills vidare, lokala granskningen är sista grinden.

**Vad T64 levererade:**
- Ny motor `src/features/tips-bracket/derive-tips-thirds.ts`: bygger syntetiska färdigspelade gruppmatcher ur tippade matchresultat -> `deriveGroupTables` -> `preliminaryThirdSeeding`. Ateranvander de kallacksta `rankThirdPlaces` (FIFA Article 13) och `seedThirdPlaces` (Annexe C) fran T4/T56, ingen parallell seedning.
- Aerlighets-grans (gissa aldrig): treorna seedas BARA nar VARJE grupp har ALLA sina gruppmatcher tippade. `computeStandings` ger en rank-3-rad aven for otippade grupper (alfabetisk fallback), sa enbart "en rank-3-rad per grupp" hade seedat en gissning. Antalet gruppmatcher per grupp harleds ur matchplanen, inte hardkodat.
- `deriveTipsBracket` utokad med valfritt 3:e argument (tips-seedningen) och ny resolution `tipped-third` for Annexe C-slottar. Grupp-tipsen ager fortsatt 1:a/2:a (last designbeslut, dokumenterat i docs/decisions.md).
- `useTipsBracketData` kopplad mot `usePredictionsStore` (match-tipsen).
- `PredictionsProvider` hoistad i `App.tsx` sa bade match- och grupp-tips-sektionen nar samma data utan dubbelhamtning (samma monster som LeaderboardProvider, T58).
- UI: seedad trea visas med lagnamn + lagmald "3:a"-markor; `bracket.css` fick `tipped-third`-tillstand (farg-oberoende form-signal).
- 1533 tester grona, build EXIT 0, lint/format rena.
- Lokal reviewer PASS 6/6 linser med 6 egna probes (delegation byte-identisk mot skarp motor, noll-tips-fallan bevisad stangd).
- F2-avgransning aerlighet: T16b-slot-tippbarhet ur simulering = eget framtida server-side-beslut, utanfor T64-scope.

**Commits:**
- `7d76887` - T64 (#118): seeda de 8 bästa treorna i simuleringsträdet ur match-tipsen - HEAD

**Verifiering:** build EXIT 0, 1533 grona, 0 röda, lint/format rena. Lokal reviewer PASS 6/6.

**Acceptanskriterier issue #118 (bockade av journalisten 2026-06-12):**
- [x] AC1: Komplett tippade gruppmatcher -> alla 8 treor seedade i tips-trädet enligt Annexe C
- [x] AC2: Ofullständiga tips -> berörda treplats-slots ärligt öppna (bevisad med tre probes)
- [x] AC3: Käll-prioriteten grupp-tips vs matchtips-härledning dokumenterad + testad (grupp-tipsen äger 1:a/2:a, beslut i decisions.md, test bekräftar)
- [~] AC4: Slutspels-slot-tipsen DELVIS: sextondelsbilden komplett ur tipsen (T64 scope levererat), T16b-slot-tippbarhet ur simulering = eget framtida server-side-beslut (utanför T64, ärligt dokumenterat)

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #120 (T64/#118, feature/T64-treor-ur-matchtips) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 120 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #118 manuellt (`gh issue close 118`) - auto-close funkar inte mot develop nar default-branch ar main.
> Flytta kort #118 till Done pa boarden (nu i "In Review", projekt 2).
> Merga aven aldre öppna PR:er om de fortfarande ar öppna: PR #116 (T63/#113), PR #115 (T62/#111), PR #114 (T61/#110), PR #117 (T18/#18 - kan redan vara mergad), PR #112 (T54/#93), PR #109 (T60/#102), PR #108 (T56/#100), PR #107 (T58/#99), PR #106 (T57/#98), PR #105 (T41/#70), PR #104 (T55/#96), PR #103 (T59/#97), PR #101 (T53/#95), PR #94 (T52/#91) - stäng resp. issue och flytta till Done.
>
> Om PR #120 REDAN mergad:
> T64 klar. Nästa task i kön: **#119 (T65 föreslå-knappen, delar T64:s härledning)** - läs issuen noggrant.
> Därefter: #76 (T45 admin-statistik) -> #19 -> #24 -> #64 -> D-resten.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready. Ny kandidat fran T56: 4+ vyer med demo-chip under AA 3.17:1 i ljust tema - koppla till #48.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **Lean-städ-kandidat (T63):** resolveInstallMode/dismiss-maskineriet produktions-dött, pinnat för framtida task.
> - **T16b-pin:** slot-tippbarhet ur simulering = eget framtida server-side-beslut.
> - **"Behöver Daniel"-kö:** push-notiser (T22), befordran kommentar-pastar Förekomst 5 (reviewer.md, vantar godkannande), 3 aldre befordringar (Förekomst 3+/4), 5 IMPROVEMENTS-kandidater (build-grind STARK + nightly-tidsrota-vakt + yt-AC + diakritik-commit-hook + T58-callsite-krav), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **Daniels process-beslut:** Copilot-loopen PAUSAD, lokala granskningen ar sista grinden. Aterstarts nar lanseringstressen ar over.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-12 , T63/#113 (ett-klicks-install) KLAR - PR #116 väntar på merge

**Branch:** `feature/T63-ettklicks-install` @ HEAD `7bcc3f2`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/116 mot `develop` (Closes #113, state: OPEN)
**Board:** AC bockas av i issue #113 (gjort av journalisten 2026-06-12). Boarden nåddes (item-add exit 0), men `item-list` paginerar troligen inte förbi 30 items, sa status "In Review" kan inte bekräftas via CLI. Dirigenten sätter "In Review" + stänger issue #113 manuellt EFTER merge.

**Vad T63 levererade:**
- `InstallBanner` (informationsrutan) ersatt av diskret `InstallButton`-pill med texten "Installera som app".
- Tre ärliga klick-grenar i `resolveInstallButtonAction`: native install-prompt direkt (Android/desktop Chrome/Edge), iPhone -> GetStartedDialog iPhone-flik, ingen prompt tillgänglig -> guide (aldrig död knapp).
- Helt dold i standalone (negativ kontroll i test: tom DOM även om beforeinstallprompt fyras).
- En avvisad native-prompt faller till guiden, ingen spam-loop.
- `.vm-install-pill` single-sourcat som delad token-klass (två call-sites, byte-identiska), commit `a58fcca`.
- Review F2/F3 åtgärdade: ärlig retention-motivering (dismiss-maskineriet produktions-dött, pinnat), dåtids-kommentarer rättade, steg-citatet matchar nya pillen, commit `7bcc3f2`.
- Copilot: R1 0 fynd, exit direkt (Daniels max-2-rundor-regel uppfylld).

**Commits:**
- `56a0157` - T63: ett-klicks-install via kompakt knapp överst (ersätter info-bannern) (#113)
- `a58fcca` - T63 (#113): diskret install-pill, single-sourcad delad klass
- `7bcc3f2` - T63: review F2/F3, ärlig retention-motivering + dåtids-kommentarer + steg-citatet matchar nya pillen (#113) - HEAD

**Verifiering:** build EXIT 0, 1492+ gröna, 0 röda, lint/format rena. Lokal panel: PASS (F1 hover-drift-claim osäker, F2 dismiss-maskineri produktions-dött/pinnat, F3 dåtids-kommentarer hanterade). Copilot R1: 0 fynd, exit.

**Daniels tempo-beslut (bär framåt):** max 2 Copilot-rundor per task, sedan merge och vidare.

**Lean-städ-kandidat (pinnat):** `resolveInstallMode`/dismiss-maskineriet är produktions-dött. Kan städas i en framtida task.

**Acceptanskriterier issue #113 (bockade av journalisten 2026-06-12):**
- [x] AC#1: ett klick ger native install-prompt pa Android/desktop när det gar
- [x] AC#2: iOS far guiden (ärligt, ingen falsk autonomi-illusion)
- [x] AC#3: fallback när prompten inte är tillgänglig - guide, aldrig död knapp
- [x] AC#4: dold i standalone, tester per gren, grönt + reviewad

**BEFORDRANS-FLAGGA (Förekomst 5):** kommentar-pastar-lessonen (dåtids-kommentarer i koden) har nu Förekomst 5 i lessons/reviewer.md (var 4 vid T62). Befordrans-caset är starkt. Väntar Daniels godkännande.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #116 (T63/#113, feature/T63-ettklicks-install) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 116 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #113 manuellt (`gh issue close 113`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #113 till Done pa boarden (nu i "In Review", projekt 2) - OBS: kortet kanske inte syns i item-list (pagineringsgräns 30), söka manuellt om nödvändigt.
> Merga även äldre öppna PR:er om de fortfarande är öppna: PR #115 (T62/#111), PR #112 (T54/#93), PR #109 (T60/#102), PR #108 (T56/#100), PR #107 (T58/#99), PR #106 (T57/#98), PR #105 (T41/#70), PR #104 (T55/#96), PR #103 (T59/#97), PR #101 (T53/#95), PR #94 (T52/#91) - stäng resp. issue och flytta till Done.
>
> Om PR #116 REDAN mergad:
> T63 klar. Nästa task i kön: **#18 (realtid, Supabase Realtime: resultat/topplista/tips uppdateras live hos alla utan reload)** - läs issuen noggrant.
> Därefter: #76 (T45 admin-statistik) -> #19 -> #24 -> #64 -> D-resten.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready. Ny kandidat fran T56: 4+ vyer med demo-chip under AA 3.17:1 i ljust tema - koppla till #48.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **Lean-städ-kandidat (T63):** resolveInstallMode/dismiss-maskineriet produktions-dött, pinnat för framtida task.
> - **"Behöver Daniel"-kö:** push-notiser (T22), befordran kommentar-pastar Förekomst 5 (reviewer.md, väntar godkännande), 3 äldre befordringar (Förekomst 3+/4), 5 IMPROVEMENTS-kandidater (build-grind STARK + nightly-tidsrota-vakt + yt-AC + diakritik-commit-hook + T58-callsite-krav), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-12 , T62/#111 (Gårdagens matcher i tips-fönstret) KLAR - PR #115 väntar på merge

**Branch:** `feature/T62-tips-fonster-bakat` @ HEAD `f3a2147`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/115 mot `develop` (Closes #111, state: OPEN)
**Board:** issue #111 i "In Review" (satt av journalisten 2026-06-12). Dirigenten stänger issue #111 MANUELLT och flyttar kort #111 till Done EFTER merge.

**Vad T62 levererade:**
- Rotorsak: tips-listans 3-dagars fönster ankrade bara framåt, gårdagens avgjorda matcher (de enda med T58-poäng) gled ut ur default-vyn utan "Visa alla".
- Fix: `LOOKBACK_DAYS=1` införd i den delade `windowMatches`-hjälparen (igår + idag + 2 framåt), premiär-golv bevarat (inga tomma "förrgår"-rader dag 1), pariteten tips-vy/resultat-vy bevarad medvetet och dokumenterad, commit `f8fe0ed`.
- T58-poäng-brickan bevisad synlig i default-vyn via callsite + render-test. "X öppna att tippa"-räknaren opåverkad. Negativ kontroll: LOOKBACK_DAYS=0 gav exakt 9 T62-tester röda (verifierat av oberoende granskare).
- Copilot R1: fail-loud vid omvända fönster-nycklar (startDay > endDay kastar) + sann describe-rubrik, commit `f3a2147`.
- Copilot R2: 0 fynd, exit.

**Commits:**
- `f8fe0ed` - fix(tips): utöka fönstret bakåt med igår så nyss spelade poäng syns (#111)
- `f3a2147` - T62: copilot R1, fail-loud vid omvända fönster-nycklar + sann describe-rubrik (#111) - HEAD

**Verifiering:** build EXIT 0, 1485+ gröna, 0 röda, lint/format rena. Lokal panel: PASS 7/7. Copilot: R1 2 fynd åtgärdade, R2 0 fynd, exit.

**Acceptanskriterier issue #111 (bockade av journalisten 2026-06-12):**
- [x] AC#1: nyss avgjorda matcher med användarens poäng syns i tips-listans default-vy
- [x] AC#2: fönster-logiken delad/härledd (ingen ny dubblett), LOOKBACK_DAYS i delade windowMatches
- [x] AC#3: paritetsguarden tips-vy/resultat-vy uppdaterad medvetet (parity bevarad, dokumenterad)
- [x] AC#4: tester + grönt + reviewad (build EXIT 0, 1485+ gröna, lokal panel PASS 7/7, Copilot R1+R2 exit)

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #115 (T62/#111, feature/T62-tips-fonster-bakat) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 115 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #111 manuellt (`gh issue close 111`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #111 till Done på boarden (nu i "In Review", projekt 2).
> Merga även äldre öppna PR:er om de fortfarande är öppna: PR #112 (T54/#93), PR #109 (T60/#102), PR #108 (T56/#100), PR #107 (T58/#99), PR #106 (T57/#98), PR #105 (T41/#70), PR #104 (T55/#96), PR #103 (T59/#97), PR #101 (T53/#95), PR #94 (T52/#91) - stäng resp. issue och flytta till Done.
>
> Om PR #115 REDAN mergad:
> T62 klar. Nästa task i kön: **#113 (T63 ett-klicks-install)** - läs issuen noggrant, Daniels 2 förtydliganden: kompakt knapp överst, info BARA vid klick, native-prompt där det går, helt dold i standalone.
> Därefter: #18 (realtid) -> #76 (T45) -> #19 -> #24 -> #64 -> D-resten.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready. Ny kandidat från T56: 4+ vyer med demo-chip under AA 3.17:1 i ljust tema - koppla till #48.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3+/4), 5 IMPROVEMENTS-kandidater (build-grind STARK + nightly-tidsrota-vakt + yt-AC + diakritik-commit-hook + T58-callsite-krav), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-12 , T61/#110 (Kopierade tips syns direkt) KLAR - PR #114 väntar på merge

**Branch:** `feature/T61-copy-refresh` @ HEAD `ad74e76`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/114 mot `develop` (Closes #110, state: OPEN)
**Board:** issue #110 i "In Review" (satt av journalisten 2026-06-12). Dirigenten stänger issue #110 MANUELLT och flyttar kort #110 till Done EFTER merge.

**Vad T61 levererade:**
- Rotorsak: copyMyTips-anropet uppdaterade Supabase-datan men triggade ingen re-fetch i tips-vyernas providers - providers använde stale data tills rumsbyte.
- Fix: `tipsRefreshNonce` (monoton räknare) tillagd i RoomsSync-kontexten; bumpar vid `copied > 0` i useRoomSync. Noncen injicerades i deps-arrayen i 4 providers (tips, scores, reveal, myTips) med T55:s tysta re-fetch-mönster (ingen loading-flimmer), commit `1dd77ab`.
- Copilot R1: save-vakten separerad fran fetch-vakten i 3 providers, bunden till rum-byte via activeRoomIdRef (race-klass save-vakt atigärdad), +6 tester mutationsbevisade, commit `ad74e76`.
- T54-doc-rubriken i decisions.md aterställd (copilot hade indragen den), commit `ad74e76`.

**Commits:**
- `1dd77ab` - feat(rooms): tipsRefreshNonce - kopierade tips syns direkt utan rum-byte (#110)
- `ad74e76` - T61: copilot R1 - separera save-vakten fran fetch-vakten i 3 providers (#110) - HEAD

**Verifiering:** build EXIT 0, 1476 gröna, 0 röda, lint/format rena. Lokal panel: PASS utan fynd. Copilot: R1 4 fynd (3 race-klass save-vakt atigärdade), R2 0 fynd, exit.

**Acceptanskriterier issue #110 (bockade av journalisten 2026-06-12):**
- [x] AC#1: kopierade tips syns direkt i tipsvyn utan manuell rum-byte
- [x] AC#2: re-fetchen sker tyst (ingen loading-spinner/flimmer), befintlig data synlig under hämtning
- [x] AC#3: ingen regression i befintlig providers-logik, build + tester gröna
- [x] AC#4: tester mutationsbevisade (save-vakt separerad fran fetch-vakt, bunden till rum-byte)

**Playbook-kandidater (bärs till nasta journalists tröskelflagg):**
- "tyst store-invalidering via monoton räknare i fetch-deps" - nu 2:a förekomst (T55->T61). Vid 3:e: befordras till docs/patterns.md-recept + flaggas.
- "mutera tillbaka den för breda vakten och visa att exakt det NYA testet failar" (mask-avslöjande mutationsgrind) - Förekomst 1, ny i T61.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #114 (T61/#110, feature/T61-copy-refresh) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 114 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #110 manuellt (`gh issue close 110`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #110 till Done pa boarden (nu i "In Review", projekt 2).
> Merga aven äldre oppna PR:er om de fortfarande är oppna: PR #112 (T54/#93), PR #109 (T60/#102), PR #108 (T56/#100), PR #107 (T58/#99), PR #106 (T57/#98), PR #105 (T41/#70), PR #104 (T55/#96), PR #103 (T59/#97), PR #101 (T53/#95), PR #94 (T52/#91) - stäng resp. issue och flytta till Done.
>
> Om PR #114 REDAN mergad:
> T61 klar. Nästa task i kön: **#111 (T62 nyss spelade matcher i tips-fönstret)** - läs issuen noggrant före start.
> Därefter: #113 (T63 ett-klicks-install, kompakt knapp, native-prompt eller guide, dold i standalone) -> #18 -> #76 -> #19 -> #24 -> #64 -> D-resten.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshallare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready. Ny kandidat fran T56: 4+ vyer med demo-chip under AA 3.17:1 i ljust tema - koppla till #48.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3+/4), 5 IMPROVEMENTS-kandidater (build-grind STARK + nightly-tidsrota-vakt + yt-AC + diakritik-commit-hook + T58-callsite-krav), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbaddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-12 , T54/#93 (Glasklar kom-igång) KLAR - PR #112 väntar på merge

**Branch:** `feature/T54-kom-igang` @ HEAD `e7ca190`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/112 mot `develop` (Closes #93, state: OPEN)
**Board:** issue #93 i "In Review" (satt av journalisten 2026-06-12). Dirigenten stänger issue #93 MANUELLT och flyttar kort #93 till Done EFTER merge.

**Vad T54 levererade:**
- Ny kom-igång-dialog: två val-kort (kör direkt pa webben / lägg pa hemskärmen), plattforms-flikar (iPhone/Android/dator) med numrerade steg, rätt flik förvald via enhets-detektering (återanvänd fran T39, ingen dubblett), commit `0cb9799`.
- Play Skydd-lugnande text pa Android (ordagrant fran install-bannern), ärlig webb-läges-info (privat läge, rensa data, iPhone-webbens ca 7-dagars självrensning med källhänvisning mot WebKit), commit `0cb9799`.
- Standalone-läge: firande "du kör appen, allt klart"-kort i stället för instruktioner - onödigt surr dolt, commit `0cb9799`.
- Alltid nåbar: rad i inställnings-portalen + "Visa hur"-CTA i onboardingens install-steg (bada callsite + render-testade), 38 tester gröna, commit `0cb9799`.
- Design: hero-band, val-kort, glyf-flikar, AA min 6.28 mörkl / 4.57 ljust (kompositmätt), commit `40c6dc3`.
- Review-F1 åtgärdad: iOS-texten paстod föråldrad Safari-exklusivitet (sedan iOS 16.4 funkar Dela-menyn även i Chrome pa iPhone), nu Safari-rekommendation utan felaktig spärrkommentar, källor + verifieringsdatum dokumenterade, commit `2a5b9fe`. Ny lesson: `extern-plattforms-fakta` i reviewer-lessons.
- Copilot R1: äkta fail-loud i getPathFor + sanna iOS-kommentarer + info-ton, commit `8d4496c`.
- Copilot R2: giltig aria-controls + plattforms-keyad glyf + capture-Escape vid staplade modaler, commit `a3c4adf` (inte i byggets HEAD-kedja, integrerad i R3).
- Copilot R3: WAI-ARIA tabs-tangentbord + Escape-regressionstest, commit `725c8e0`.
- Copilot R4: knapp-citat matchar InstallBanner + aria-label pa "Visa hur", commit `e7ca190`.

**Commits (kronologisk ordning):**
- `0cb9799` - feat(app-settings): glasklar kom-igång-yta, installera ELLER använd direkt (#93)
- `40c6dc3` - style(app-settings): premium-finish pa kom-igång-dialogen (#93)
- `2a5b9fe` - T54: review-F1, iOS-texten rekommenderar Safari utan föråldrad exklusivitet (#93)
- `8d4496c` - T54: copilot R1, äkta fail-loud i getPathFor + sanna iOS-kommentarer + info-ton (#93)
- `a3c4adf` - T54: copilot R2, giltig aria-controls + plattforms-keyad glyf + capture-Escape vid staplade modaler (#93)
- `725c8e0` - a11y(get-started): WAI-ARIA tabs-tangentbord + Escape-regressionstest (#93)
- `e7ca190` - T54: copilot R4, knapp-citatet matchar InstallBanner + aria-label pa Visa hur (#93) - HEAD

**Verifiering:** build EXIT 0, 154 app-settings-tester gröna, full svit 0 röda, lint/format rena. Lokal panel: FAIL->åtgärdad->grön (F1 föråldrad extern fakta), övriga linser PASS. Copilot: 4 rundor (4->3->2->2 triviala), exit.

**Acceptanskriterier issue #93 (bockade av journalisten 2026-06-12):**
- [x] Kom-igång-ytan visar rätt instruktioner för användarens plattform (Android/iOS/desktop) och nämner bada vägarna (webb + app)
- [x] Alltid nåbar efter onboardingen (inte bara första gangen)
- [x] Play Skydd-lugnande text pa Android, Safari-kravet tydligt pa iOS
- [x] Webb-lägets risker ärligt men vänligt kommunicerade
- [x] Responsiv + a11y + tester, grönt bygge/lint, reviewad

**Daniels nya krav fran 2026-06-12 (bär framåt till T63):**
- #113 (T63 ett-klicks-install): ytan överst = KOMPAKT knapp (ingen info-ruta), klick -> native-prompt (Android/desktop) eller kom-igång-dialogen (iOS/fallback), HELT dold i standalone.
- Detaljerna i issuen: återanvänd install-prompt.ts (T39) + GetStartedDialog (T54), ingen dubblett.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #112 (T54/#93, feature/T54-kom-igang) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 112 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #93 manuellt (`gh issue close 93`) - auto-close funkar inte mot develop nar default-branch är main.
> Flytta kort #93 till Done pa boarden (nu i "In Review", projekt 2).
> Merga även äldre öppna PR:er om de fortfarande är öppna: PR #109 (T60/#102), PR #108 (T56/#100), PR #107 (T58/#99), PR #106 (T57/#98), PR #105 (T41/#70), PR #104 (T55/#96), PR #103 (T59/#97), PR #101 (T53/#95), PR #94 (T52/#91) - stäng resp. issue och flytta till Done.
>
> Om PR #112 REDAN mergad:
> T54 klar. Nästa task i kön: **#110 (T61 kopierade tips syns inte utan rum-byte)** - las issuen noggrant fore start (rotorsaks-hypotes: copyMyTips triggar ingen re-fetch i tips-vyernas providers).
> Därefter: #111 (T62 nyss spelade matcher i tips-listans fönster) -> #113 (T63 ett-klicks-install, kompakt knapp, native-prompt eller guide, dold i standalone) -> #18 -> #76 -> #19 -> #24 -> #64 -> D-resten.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshallare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready. Ny kandidat fran T56: 4+ vyer med demo-chip under AA 3.17:1 i ljust tema - koppla till #48.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3+/4), 5 IMPROVEMENTS-kandidater (build-grind STARK + nightly-tidsrota-vakt + yt-AC + diakritik-commit-hook + T58-callsite-krav), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-12 , T60/#102 (Grön baslinje) KLAR - PR #109 väntar på merge

**Branch:** `feature/T60-roda-tester` @ HEAD `1f92b84`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/109 mot `develop` (Closes #102, state: OPEN)
**Board:** issue #102 i "In Review" (satt av journalisten 2026-06-12). Dirigenten stänger issue #102 MANUELLT och flyttar kort #102 till Done EFTER merge.

**Vad T60 levererade:**
- Rotorsak: tidskopplad test-röta. De 4 roda testerna renderade ResultEntryView mot fixtures utan frusen klocka. T39:s 3-dagars-fönster ankrar pa "idag" och doljer (hidden) matcher utanfor fonstret; RTL:s a11y-queries hoppar over hidden-subträd, sa Spara-knappen blev oatkomlig. Testerna skrevs nar premiären lag i framtiden (grona); dagen vagklockan passerade premiardatumet (2026-06-11) rodnade de tyst. Ingen app- eller seam-regression, DOM:en var korrekt.
- Fix: fryser klockan till premiardagen (vi.useFakeTimers Date + setSystemTime 2026-06-11T08:00Z) i bada filerna, samma monster som befintliga T28-block i samma fil redan anvander. Inga .skip, ingen produktionskodandring, commit `1f92b84`.
- Rotorsaken dokumenterad i docs/decisions.md, commit `1f92b84`.
- Baslinje: 1410/0 pass, npm run build EXIT 0, lint + format rent.
- Reviewer: PASS. Rotorsak empiriskt bekraftad mot result-window.ts. Lesson-kandidat avvisad som dubblett av befordrad playbook-regel. IMPROVEMENTS-kandidat: nightly CI med framtidsfrusen klocka som vakt mot tidsröta.
- Copilot: R1 0 fynd, exit.

**Commits:**
- `1f92b84` - test(results): frys klockan i 4 tidskopplade baslinje-tester (#102) - HEAD

**Verifiering:** 1410/0 pass, npm run build EXIT 0, lint + format rent. Lokal panel: PASS. Copilot R1: 0 fynd, exit.

**Acceptanskriterier issue #102 (bockade av journalisten 2026-06-12):**
- [x] AC#1: rotorsaka och fixa testerna (tidskopplad test-röta, frusen klocka, commit 1f92b84)
- [x] AC#2: develop grön baslinje (1410/0 pass, build EXIT 0, lint/format rent)
- [x] AC#3: dokumentera rotorsaken (docs/decisions.md, commit 1f92b84)

**PINNADE punkter (oforandrade, bärs framåt):**
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stangt i T17, bärs framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platsharare tills #35 fyller med verifierad per-match-kalla.
- **FNV-hash:** 2 anvandningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 anvandningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-ko.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready. Ny kandidat fran T56: 4+ vyer med demo-chip under AA 3.17:1 i ljust tema - koppla till #48.
- **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 handrullade dialoger). Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lagg till manualChunks om LCP-problem uppstar.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
- **F2-kandidat (T50):** kortnamn i RevealView/bracket-summary-rubriker om Daniel vill.

**"Behöver Daniel"-kö (oforandrad + ny):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-monstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Vantar Daniels godkannande.
- **BEFORDRAN 2 (journalist-monstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Vantar Daniels godkannande.
- **BEFORDRAN 3 (senior-developer-monstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Förekomst 4. Typ: agent-beteende -> senior-developers fil. Vantar Daniels godkannande.
- **IMPROVEMENTS-kandidat (STARK, reviewerns, T56):** DoD-build-grinden ska pinnas till `npm run build`-EXIT (tsc -b kan EXIT 0 trots typfel i referens-projekt, npm test ar typblint). 2:a gangen typ/build-fel passerat gron testsvit.
- **IMPROVEMENTS-kandidat (reviewern, T60):** nightly CI-job med framtidsfrusen klocka (t.ex. fryser till VM-premiardatumet + ett ar) som vakt mot tidsrota. Haller baslinje-gron aven nar realtidsklockan passerar eventets fonstergrans.
- **IMPROVEMENTS-kandidat (T58):** yt-formulerade AC kräver callsite + render-test i handoff (pipeline-andring). Dirigenten noterar for `C:/Repo/agent-kit/IMPROVEMENTS.md`.
- **IMPROVEMENTS-kandidat (commit-hook):** commit-msg-git-hook som scannar svenska diakritik-substitut.
- **FIFA-juni-ranking:** aprilutgavan 2026 anvands. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: andra rank-varden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen vantar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge vantar.
- **editor-flippar-radslut (senior-developer lesson):** monstret ar nu adresserat pa repo-niva med .gitattributes + endOfLine lf.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #109 (T60/#102, feature/T60-roda-tester) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 109 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #102 manuellt (`gh issue close 102`) - auto-close funkar inte mot develop nar default-branch ar main.
> Flytta kort #102 till Done pa boarden (nu i "In Review", projekt 2).
> Merga aven aldra oppna PR:er om de fortfarande ar oppna: PR #108 (T56/#100), PR #107 (T58/#99), PR #106 (T57/#98), PR #105 (T41/#70), PR #104 (T55/#96), PR #103 (T59/#97), PR #101 (T53/#95), PR #94 (T52/#91) - stang resp. issue och flytta till Done.
>
> Om PR #109 REDAN mergad:
> T60 klar. Nästa task i kön: **#93 (T54 glasklar installationsguide)** - las issuen noggrant fore start.
> Därefter: #18 (realtid) -> #76 (T45 admin-statistik) -> #19 -> #24 -> #64 -> D-resten (FIFA-juni-ranking, #25, #56, #48 + demo-chip-AA-utökning fran T56-review).
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshallare.
> - **FNV-hash:** konsolidera vid 3:e anvandning.
> - **Stegnings-dubblett:** extrahera vid 3:e anvandning.
> - **#48 (demo-chip a11y):** kort i Ready. Ny kandidat fran T56: 4+ vyer med demo-chip under AA 3.17:1 i ljust tema - koppla till #48.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3+/4), 4 IMPROVEMENTS-kandidater (build-grind STARK + nightly-tidsrota-vakt + yt-AC + diakritik-commit-hook), FIFA-juni-ranking, release-gransen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbaddning:** SKIPPAD, stangd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vagen till slutet (Daniel ger go for release-gransen vid hemkomst).

---

## RESUME-HERE , 2026-06-12 , T56/#100 (Levande slutspelsträd) KLAR - PR #108 väntar på merge

**Branch:** `feature/T56-levande-trad` @ HEAD `21d4e2a`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/108 mot `develop` (Closes #100, state: OPEN)
**Board:** issue #100 i "In Review" (satt av journalisten 2026-06-12). Dirigenten stänger issue #100 MANUELLT och flyttar kort #100 till Done EFTER merge.

**Vad T56 levererade:**
- Rotorsak: mekanismen för preliminary-resolution existerade men slot:arna saknade konkreta preliminära VÄRDEN - isGroupStageComplete-grinden blockerade hela derive-bracket-flödet. Fix: preliminary-third-seeding delegerar nu till de källlåsta motorerna (rankThirdPlaces FIFA Article 13 + seedThirdPlaces Annexe C) - inga parallella seedningstabeller, inga gissningar.
- derive-bracket: preliminary-resolution fyller slot:arna med nuvarande grupptoppar (1:or, 2:or, bästa treor via FIFA-seedning), commit 34b0fc4.
- Live-integrations-test: vänder ett resultat och verifierar att en slot:en byter lag i DOM (end-to-end), commit 34b0fc4.
- Arlig märkning: "Nuvarande ställning"-pill + per-slot "nu"-rad, tydlig skillnad mot facit, commit 3df58d1.
- Design: prelim-pill ur T55:s AA-mätta recept, fixade samtidigt en gammal under-AA-pill i ljust tema, commit 3df58d1.
- Review-F1 (build röd av nytt obligatoriskt typfält i 2 grann-testfiler): åtgärdad av dirigenten, commit f23b09e. Lärdom: npm run build-exit är auktoritativ - tsc -b och npm test kan ge EXIT 0 trots typfel i referens-projekt.
- Copilot R1: punktseparator i user-facing under-rad, commit 21d4e2a.
- 2 nya reviewer-lessons: senior-dev (delad-typ-obligatoriskt-fält), design (pastar-pre-existerande-utan-baslinjekoll).

**Commits:**
- `34b0fc4` - feat(bracket): preliminary-third-seeding via källlåsta motorer, derive-bracket preliminary-resolution, live-integration-test (#100)
- `3df58d1` - design(bracket): prelim-pill ur T55-receptet, fixade gammal under-AA-pill (#100)
- `f23b09e` - fix(bracket): preliminary-fältet i 2 test-litteraler, build EXIT 0 (#100)
- `21d4e2a` - fix(bracket): punktseparator i user-facing under-rad (#100) - HEAD

**Verifiering:** build EXIT 0, 1406+ pass + 4 kanda röda (#102, pre-existerande, orelaterade). Lint/format rent. Lokal panel: FAIL->åtgärdad->grön (F1). Copilot R1: 2 triviala åtgärdade, exit.

**Acceptanskriterier issue #100 (bockade av journalisten 2026-06-12):**
- [x] AC#1: Trädet visar provisoriska positioner ur nuvarande tabeller direkt (preliminary-resolution + slot-tilldelning, commits 34b0fc4 + 3df58d1)
- [x] AC#2: Uppdateras vid varje inmatat resultat (live-integrations-test vänder ett resultat och ser slot:en byta lag i DOM, commit 34b0fc4)
- [x] AC#3: Ärligt märkt som preliminärt tills grupperna är klara ("Nuvarande ställning"-pill + per-slot "nu"-rad, commit 3df58d1)
- [x] AC#4: FIFA-seedningen (Annexe C) används korrekt även i preliminärt läge - preliminary-vägen delegerar enbart till de källlåsta motorerna rankThirdPlaces + seedThirdPlaces, ingen gissad seedning (commit 34b0fc4)
- [x] AC#5: Tester, grönt + reviewad (1406+ pass + 4 kanda röda #102, build EXIT 0, lint/format rent, lokal panel FAIL->åtgärdad->grön, Copilot R1 exit)

**PINNADE punkter (oförändrade, bärs framåt):**
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bärs framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready. NY kandidat från T56: designagenten fixade en under-AA-pill men hittade 4+ vyer (BracketView/GroupStageView/DailyMatchesView/ScenarioView) med demo-chip UNDER AA (3.17:1) i ljust tema - recept finns, koppla till #48.
- **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 handrullade dialoger). Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
- **F2-kandidat (T50):** kortnamn i RevealView/bracket-summary-rubriker om Daniel vill.

**"Behöver Daniel"-kö (oförändrad + ny):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **BEFORDRAN 3 (senior-developer-mönstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Förekomst 4. Typ: agent-beteende -> senior-developers fil. Väntar Daniels godkännande.
- **IMPROVEMENTS-kandidat (STARK, reviewerns, T56):** DoD-build-grinden ska pinnas till `npm run build`-EXIT (tsc -b kan EXIT 0 trots typfel i referens-projekt, npm test är typblint). 2:a gången typ/build-fel passerat grön testsvit. Pipeline-ändring = Daniels beslut.
- **IMPROVEMENTS-kandidat (tidigare):** reviewerns förslag fran T58 - yt-formulerade AC kräver callsite + render-test i handoff (pipeline-ändring). Dirigenten noterar för `C:/Repo/agent-kit/IMPROVEMENTS.md`.
- **IMPROVEMENTS-kandidat (commit-hook):** commit-msg-git-hook som scannar svenska diakritik-substitut. Pipeline-ändring = kräver Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge väntar.
- **editor-flippar-radslut (senior-developer lesson):** mönstret är nu adresserat på repo-nivå med .gitattributes + endOfLine lf.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #108 (T56/#100, feature/T56-levande-trad) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 108 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #100 manuellt (`gh issue close 100`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #100 till Done på boarden (nu i "In Review", projekt 2).
> Merga även äldre öppna PR:er om de fortfarande är öppna: PR #107 (T58/#99), PR #106 (T57/#98), PR #105 (T41/#70), PR #104 (T55/#96), PR #103 (T59/#97), PR #101 (T53/#95), PR #94 (T52/#91) - stäng resp. issue och flytta till Done.
>
> Om PR #108 REDAN mergad:
> T56 klar. Nästa task i kön: **#102 (T60 röda tester)**.
> Därefter: #93 (T54 kom-igång) -> #18 -> #76 -> #19 -> #24 -> #64 -> D-resten.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready. Ny kandidat från T56: 4+ vyer med demo-chip under AA 3.17:1 i ljust tema - koppla till #48.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3+/4), 3 IMPROVEMENTS-kandidater (build-grind STARK + yt-AC + diakritik-commit-hook), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-12 , T58/#99 (Poäng i tips-vyn) KLAR - PR #107 väntar på merge

**Branch:** `feature/T58-poang-i-tipsvyn` @ HEAD `5466dd1`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/107 mot `develop` (Closes #99, state: OPEN)
**Board:** issue #99 i "In Review" (satt av journalisten 2026-06-12). Dirigenten stänger issue #99 MANUELLT och flyttar kort #99 till Done EFTER merge.

**Vad T58 levererade:**
- matchPointLabel: utfalls-medveten etikett per avgjord match (Exakt +3 / Ratt utfall +1 / Miss 0), delar #69-kryssfixen (kryss hanteras neutralt utan "hemma/borta"-framing), commit 993c1c6.
- scoreMember: per-källa-poäng (matchtips, grupptips, slutspel, mastare) beräknat ur källsummorna - total == sum(delsummor) per konstruktion, commit 993c1c6.
- TipsScoreSummary: poäng-summering överst i tips-vyn med total + placering + detaljsektion per poängkälla, commit 993c1c6.
- Provider hoistad till App-nivå: en fetch for hela vyn, ingen dubblett-beräkning vs topplistan, commit 993c1c6.
- Per-match-poäng på avgjorda tips-kort: bricka med glyf + etikett + poäng direkt på kortet, commit 489866b. (Dirigentens disk-grind fångade att föregående handoff felaktigt påstod ytan levererad - kompletteringen gjordes i separat commit.)
- Design: hero-panel §20 i SPEC, brick-former, CSS ::before-glyfer (textContent-rena + skärmläsar-tysta), kontrastmätning 6.38:1 / 5.03:1, commit 5466dd1.
- 1379 pass + 4 kanda röda (#102, pre-existerande). Lint/format/build rent.
- Lokal panel: PASS utan fynd. Ny reviewer-lesson: `handoff-pastar-ett-krav-levererat-men-koden-wirar-aldrig-in-ytan` (senior-developer, Förekomst 1).
- Copilot: R1 0 fynd, exit.

**Commits:**
- `993c1c6` - feat(tips): poäng synliga i tips-vyn, per-match-etikett + summering + käll-detalj (#99)
- `489866b` - feat(tips): poäng + varfor per match i tips-listan på avgjorda kort (#99)
- `5466dd1` - design(tips): premium-finish på poäng-summeringen + per-match-brickan i tips-vyn (#99) - HEAD

**Verifiering:** 1379 pass + 4 kanda pre-existerande röda (#102, orelaterade). Lint/format/build rent. Lokal panel: PASS. Copilot: R1 0 fynd, exit direkt.

**Acceptanskriterier issue #99 (bockade av journalisten 2026-06-12):**
- [x] AC#1: poäng + varfor per avgjord match i tips-vyn (matchPointLabel + bricka per kort, commits 993c1c6 + 489866b)
- [x] AC#2: summering överst (total + placering) via TipsScoreSummary, commit 993c1c6
- [x] AC#3: detaljsektion per poängkälla (matchtips, grupptippning, slutspelsträd, VM-mastare), commit 993c1c6
- [x] AC#4: härlett ur samma poängfunktioner som topplistan, ingen dubblett-beräkning, tester, grönt + reviewad (1379 pass, lokal panel PASS, Copilot R1 0 fynd, commits 993c1c6 + 489866b + 5466dd1)

**PINNADE punkter (oförändrade, bärs framåt):**
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bärs framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready.
- **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 handrullade dialoger). Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
- **F2-kandidat (T50):** kortnamn i RevealView/bracket-summary-rubriker om Daniel vill.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **BEFORDRAN 3 (senior-developer-mönstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Förekomst 4 (ökat under T58 via ny lesson). Typ: agent-beteende -> senior-developers fil. Väntar Daniels godkännande.
- **IMPROVEMENTS-kandidat:** reviewerns förslag fran T58 - yt-formulerade AC kräver callsite + render-test i handoff (pipeline-ändring = Daniels beslut). Dirigenten noterar för `C:/Repo/agent-kit/IMPROVEMENTS.md`.
- **IMPROVEMENTS-kandidat (tidigare):** commit-msg-git-hook som scannar svenska diakritik-substitut. Pipeline-ändring = kräver Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge väntar.
- **editor-flippar-radslut (senior-developer lesson):** mönstret är nu adresserat på repo-nivå med .gitattributes + endOfLine lf.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #107 (T58/#99, feature/T58-poang-i-tipsvyn) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 107 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #99 manuellt (`gh issue close 99`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #99 till Done på boarden (nu i "In Review", projekt 2).
> Merga även äldre öppna PR:er om de fortfarande är öppna: PR #106 (T57/#98), PR #105 (T41/#70), PR #104 (T55/#96), PR #103 (T59/#97), PR #101 (T53/#95), PR #94 (T52/#91) - stäng resp. issue och flytta till Done.
>
> Om PR #107 REDAN mergad:
> T58 klar. Nästa task i kön: **#100 (T56 levande slutspelsträd)**.
> Därefter: #102 (T60 röda tester) -> #93 (T54 kom-igång) -> #18 -> #76 -> #19 -> #24 -> #64 -> D-resten.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3+/4), 2 IMPROVEMENTS-kandidater, FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-12 , T57/#98 (Levande dag) KLAR - PR #106 väntar på merge

**Branch:** `feature/T57-levande-dag` @ HEAD `228520e`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/106 mot `develop` (Closes #98, state: OPEN)
**Board:** issue #98 i "In Review" (satt av journalisten 2026-06-12). Dirigenten stänger issue #98 MANUELLT och flyttar kort #98 till Done EFTER merge.

**Vad T57 levererade:**
- Rotorsak: tick-driven vs mount-frusen - nedräknings-ytan uppdaterades via minut-tick men matchfokus och dag-nyckeln lästes mount-frusna ur separata Date.now()-anrop. Fix: dela SAMMA tick-kalla (useTodayKey), härledd pinnedKey ur tick, follow-läge återupptas vid bläddring tillbaka till idag.
- Fokus: dag-vyn lyfter automatiskt tidigaste ospelade match (live = pågående = nästa), fallback vid hel spelad dag - ingen manual reload krävs.
- Dag: dag-bläddraren följer verklig dag via useTodayKey + visibilitychange, bläddrar man tillbaka till idag nollställs pinnedKey och follow-läget återupptas (review-F1, mutationsverifierat).
- Resultat: avgjorda matcher visar slutsiffror + ev. straffar direkt på korten i dag-listan, typ-säkert ur vävda matchdatan, a11y-namn bär resultatet.
- Design: resultatet lyft till hjälte-tyngd på färdigspelade kort (live-verifierat 280/390px, båda teman).
- 16 nya tester + 4 negativa kontroller. 4 oberoende reviewer-mutationer bekräftade att testerna vaktar fixarna.
- Totalt 1356 pass + 4 kanda pre-existerande röda (#102, stash-bekräftade).

**Commits:**
- `8d1a329` - feat(daily): dagens-vyn lever, fokus följer nästa match + dag följer verklig dag + resultat i listan (#98)
- `393b8b6` - style(daily): lyft matchresultatet till hjälte-tyngd på färdigspelade kort (#98)
- `228520e` - fix(daily): nollställ pinnedKey vid navigering till idag (#98) - HEAD

**Verifiering:** 1356 pass + 4 kända pre-existerande röda (#102, orelaterade, stash-bekräftade). Lint/format/build rent. Lokal panel: PASS (4 reviewer-mutationer bekräftade testerna). Copilot: R1 0 fynd, exit direkt.

**Acceptanskriterier issue #98 (bockade av journalisten 2026-06-12):**
- [x] AC#1: slutspelad match -> nästa match lyfts automatiskt (useTodayKey + pinnedKey, commit 8d1a329)
- [x] AC#2: dagen följer verklig dag utan reload (samma tick-källa som nedräkningen, commit 8d1a329)
- [x] AC#3: resultat synliga på avgjorda matcher i dag-bläddraren (typ-säkert ur vävda matchdatan, commit 393b8b6 + 8d1a329)
- [x] AC#4: inga reload-krav, tester på dag-/matchövergångar, grönt + reviewad (1356 pass, lokal panel PASS, 4 reviewer-mutationer bekräftade, commit 228520e)

**PINNADE punkter (oförändrade, bärs framåt):**
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bärs framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready.
- **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 handrullade dialoger). Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
- **F2-kandidat (T50):** kortnamn i RevealView/bracket-summary-rubriker om Daniel vill.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **BEFORDRAN 3 (senior-developer-mönstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Förekomst 3 (nu 4 efter T53). Typ: agent-beteende -> senior-developers fil. Väntar Daniels godkännande.
- **IMPROVEMENTS-kandidat:** reviewerns förslag - commit-msg-git-hook som scannar svenska diakritik-substitut. Pipeline-ändring = kräver Daniels godkännande. Notera för dirigenten att skriva i `C:/Repo/agent-kit/IMPROVEMENTS.md`.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge väntar.
- **2 mosade temp-filer städade:** `board_items` + `proj2items` låg i repo-roten och städades bort av subagenter. Mönstret värt att se upp med i framtida tasks.
- **editor-flippar-radslut (senior-developer lesson):** mönstret är nu adresserat på repo-nivå med .gitattributes + endOfLine lf.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #106 (T57/#98, feature/T57-levande-dag) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 106 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #98 manuellt (`gh issue close 98`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #98 till Done på boarden (nu i "In Review", projekt 2).
> Merga även äldre öppna PR:er om de fortfarande är öppna: PR #105 (T41/#70), PR #104 (T55/#96), PR #103 (T59/#97), PR #101 (T53/#95), PR #94 (T52/#91) - stäng resp. issue och flytta till Done.
>
> Om PR #106 REDAN mergad:
> T57 klar. Nästa task i kön: **#99 (T58 poäng i tips-vyn + summering + käll-detalj - läs issuen + samordningsnoten med #69)**.
> Därefter: #100 (T56 levande träd) -> #102 (T60 röda tester) -> #93 (T54) -> #18 -> #76 -> #19 -> #24 -> #64 -> D-resten.
> OBS: alla brancher skapade FÖRE T41-merge kan behöva en engångs-renormalisering vid rebase/pull - förväntat, ofarligt.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3+), IMPROVEMENTS-kandidat (diakritik-commit-hook), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-12 , T41/#70 (EOL-normalisering) KLAR - PR #105 väntar på merge

**Branch:** `feature/T41-eol-normalisering` @ HEAD `da4f540`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/105 mot `develop` (Closes #70, state: OPEN)
**Board:** issue #70 i "In Review" (satt av journalisten 2026-06-12). Dirigenten stänger issue #70 MANUELLT och flyttar kort #70 till Done EFTER merge.

**Vad T41 levererade:**
- `.gitattributes`: `* text=auto eol=lf` + binär-undantag (png/woff2), commit 5d45550.
- Prettier `endOfLine: auto -> lf`: format:check fångar nu CRLF-flippar, commit 5d45550.
- Renormalisering av 14 CRLF-filer i SEPARAT commit de61b5a - noll-innehall bevisat (numstat --ignore-all-space = tom).
- Gold-source-filerna (Annexe C, FIFA-regler) byte-identiska efter normalisering, alla källjämförelse-tester gröna.
- `docs/decisions.md` uppdaterad med EOL-beslutet, commit da4f540.
- DoD-exkludering av 4 pre-existerande röda tester dokumenterad i #70-kommentar + PR-text.

**Commits:**
- `5d45550` - T41: lagg EOL-normalisering (.gitattributes + Prettier endOfLine lf)
- `de61b5a` - T41: normalisera alla radslut till LF (git add --renormalize)
- `da4f540` - T41: dokumentera EOL-normaliserings-beslutet i decisions.md (HEAD)

**Verifiering:** build/lint/format gröna. Tester: noll NYA röda (4 pre-existerande röda på develop bevisat orelaterade, stash-bekräftade, spåras i #102). Reviewer: PASS utan fynd (C1-C5 empiriskt, binärer byte-identiska, gold-source intakt, CRLF-prob bevisade nya grinden). Copilot: R1 1 process-nit (DoD vs 4 kända röda) löst via uttrycklig DoD-exkludering i #70-kommentar + PR-text, exit.

**Acceptanskriterier issue #70 (bockade av journalisten 2026-06-12):**
- [x] AC#1: .gitattributes med text=auto eol=lf, Prettier endOfLine lf (commit 5d45550)
- [x] AC#2: git add --renormalize kört, 14 CRLF-filer LF-normaliserade (commit de61b5a, noll-innehall bevisat)
- [x] AC#3: En liten test-edit ger proportionerlig diff (empiriskt verifierat av reviewer: proportionerlig diff, inte hel-fil-rewrite)
- [x] AC#4: Bygger grönt, lint rent, format rent, tester gröna (build/lint/format ok, noll NYA röda)

**OBS for efterföljande tasks:** Alla brancher skapade FORE T41-merge far en engångs-renormalisering vid rebase/pull (editor-flippar LF->CRLF). Detta är förväntat och ofarligt.

**PINNADE punkter (oförändrade, bärs framåt):**
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bärs framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready.
- **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 handrullade dialoger). Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
- **F2-kandidat (T50):** kortnamn i RevealView/bracket-summary-rubriker om Daniel vill.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **BEFORDRAN 3 (senior-developer-mönstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Förekomst 3 (nu 4 efter T53). Typ: agent-beteende -> senior-developers fil. Väntar Daniels godkännande.
- **IMPROVEMENTS-kandidat:** reviewerns förslag - commit-msg-git-hook som scannar svenska diakritik-substitut. Pipeline-ändring = kräver Daniels godkännande. Notera för dirigenten att skriva i `C:/Repo/agent-kit/IMPROVEMENTS.md`.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge väntar.
- **2 mosade temp-filer städade:** `board_items` + `proj2items` låg i repo-roten och städades bort av subagenter. Mönstret värt att se upp med i framtida tasks.
- **editor-flippar-radslut (senior-developer lesson):** mönstret är nu adresserat på repo-nivå med .gitattributes + endOfLine lf. Dirigenten bör notera för senior-developer-lessonen att vakten är byggd.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #105 (T41/#70, feature/T41-eol-normalisering) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 105 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #70 manuellt (`gh issue close 70`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #70 till Done på boarden (nu i "In Review", projekt 2).
> Merga även äldre öppna PR:er om de fortfarande är öppna: PR #104 (T55/#96), PR #103 (T59/#97), PR #101 (T53/#95), PR #94 (T52/#91) - stäng resp. issue och flytta till Done.
>
> Om PR #105 REDAN mergad:
> T41 klar. Nästa task i kön: **#98 (T57 levande dag/nästa match/resultat-bläddring)**.
> Därefter: #99 (T58 poäng i tips-vyn + detaljsektion) -> #100 (T56 levande träd) -> #102 (T60 röda tester) -> #93 (T54) -> #18 -> #76 -> #19 -> #24 -> #64 -> D-resten.
> OBS: alla brancher skapade FÖRE T41-merge kan behöva en engångs-renormalisering vid rebase/pull - förväntat, ofarligt.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3+), IMPROVEMENTS-kandidat (diakritik-commit-hook), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-12 , T55/#96 (Andras tips avslöjas vid avspark) KLAR - PR #104 väntar på merge

**Branch:** `feature/T55-reveal-vid-avspark` @ HEAD `d83a434`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/104 mot `develop` (Closes #96, state: OPEN)
**Board:** issue #96 i "In Review" (satt av journalisten 2026-06-12). Dirigenten stänger issue #96 MANUELLT och flyttar kort #96 till Done EFTER merge.

**Vad T55 levererade:**
- Rotorsak: reveal-unionen visade bara finished-matcher (slutade matcher), inte live-matcher. Fix: union inkluderar nu bade live och finished - andras tips syns fran avspark, inte bara fran slutsignal.
- Tyst re-fetch utan loading-flimmer: lockedMatchCount bevakas i useEffect, re-fetch sker i bakgrunden (ingen loading-spinner), `loadedRoomIdRef` forhindrar parallella anrop.
- Gron live-identitet: pulsande grona punkter (Tailwind animate-pulse) med AA-kontrast 8.10:1 (puls) och 4.77:1 (text) for pagaende matcher.
- Sekretessen fore avspark bevisad med mutationstest (gate bort -> negativ kontroll rodnar).
- 35 tester fran senior-dev + 4 nya fran copilot R2 (tyst re-fetch utan flimmer), 1339 pass totalt.
- 4 kanda pre-existerande roda tester pa develop (orelaterade, stash-bekraftade, #102 skapad for stadning).

**Commits:**
- `b82b0fd` - fix(reveal): visa andras tips vid avspark, inte forst vid slutsignal (#96)
- `fd1d47e` - style(reveal): levande pagars-lage med gron accent-identitet (#96)
- `ea59f4a` - T55: copilot R1, sann sekretess-kommentar efter live-varianten + 8.10 konsekvent (#96)
- `d83a434` - fix(leaderboard): avspark-triggad re-fetch ar tyst, inget loading-flimmer (#96) - HEAD

**Verifiering:** 1339 pass (4 kanda pre-existerande roda, stash-bekraftade orelaterade). Lint/format/build rent. Lokal panel: PASS (sekretess-gaten mutationstestades akt med negativ kontroll). Copilot: R1 2 fynd, R2 1 fynd, R3 0 fynd, exit.

**Acceptanskriterier issue #96 (bockade av journalisten 2026-06-12):**
- [x] AC#1: Rotorsaken identifierad och dokumenterad (decisions.md - reveal-union inkluderade bara finished, inte live)
- [x] AC#2: Under/efter pagaende match ser rumsmedlemmar varandras tips utan manuell reload (commit b82b0fd, re-fetch pa lockedMatchCount)
- [x] AC#3: Sekretess fore avspark intakt - RLS-bevis, mutationstest av gaten (commit ea59f4a, negativ kontroll)
- [x] AC#4: Tester + gront, reviewad (1339 pass, lint/format/build rent, lokal panel PASS, copilot R3 noll fynd)

**PINNADE punkter (oforandrade, bars framat):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping, editor flippar LF->CRLF. Kort i Ready. UPPLYFT: monster kostade tid 4:e gangen - rotorsak nu, bygge i T60-kons grannskap.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stangt i T17, bars framat som konvention.
- **#35 (arena/stad):** `Match.venue` = platsallare tills #35 fyller med verifierad per-match-kalla.
- **FNV-hash:** 2 anvandningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 anvandningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-ko.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready.
- **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 handrullade dialoger). Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lagg till manualChunks om LCP-problem uppstar.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
- **F2-kandidat (T50):** kortnamn i RevealView/bracket-summary-rubriker om Daniel vill.

**"Behover Daniel"-ko (oforandrad):**
- Push-notiser T22: kraver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-monstret):** `uttommande-test-vaktar-svagare-invariant` Forekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Vantar Daniels godkannande.
- **BEFORDRAN 2 (journalist-monstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Forekomst 3. Typ: agent-beteende -> journalistens fil. Vantar Daniels godkannande.
- **BEFORDRAN 3 (senior-developer-monstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Forekomst 3 (nu 4 efter T53). Typ: agent-beteende -> senior-developers fil. Vantar Daniels godkannande.
- **IMPROVEMENTS-kandidat:** reviewerns forslag - commit-msg-git-hook som scannar svenska diakritik-substitut. Pipeline-andring = kraver Daniels godkannande. Notera for dirigenten att skriva i `C:/Repo/agent-kit/IMPROVEMENTS.md`.
- **FIFA-juni-ranking:** aprilutgavan 2026 anvands. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: andra rank-varden + `npm run gen:team-profiles`.
- **Release-gransen:** develop -> main + release-cleanup-skillen vantar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge vantar.
- **2 mosade temp-filer stadade:** `board_items` + `proj2items` lag i repo-roten och stadades bort av subagenter. Monstret vart att se upp med i framtida tasks.

**FORTSATTNINGS-PROMPT (autonom ko):**
> Kor `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #104 (T55/#96, feature/T55-reveal-vid-avspark) ANNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 104 --merge --repo danielaldemir79/vm-2026`.
> Stang issue #96 manuellt (`gh issue close 96`) - auto-close funkar inte mot develop nar default-branch ar main.
> Flytta kort #96 till Done pa boarden (nu i "In Review", projekt 2).
> Om PR #103 (T59/#97) fortfarande ar oppen: merga den ocksa och stang issue #97.
>
> Om PR #104 REDAN mergad:
> T55 klar. Nasta task i kon: **#70 (T41 .gitattributes EOL, UPPLYFT: monstret kostade tid 4:e gangen)**.
> Darefter: #98 (T57 levande dag) -> #99 (T58 poang i tips-vyn) -> #100 (T56 levande trad) -> #102 (T60 roda tester) -> #93 (T54) -> #18 -> #76 -> #19 -> #24 -> #64 -> D-resten.
>
> Bar framat (alla tasks):
> - **#35 (arena/stad):** venue = platsallare.
> - **FNV-hash:** konsolidera vid 3:e anvandning.
> - **Stegnings-dubblett:** extrahera vid 3:e anvandning.
> - **#48 (demo-chip a11y):** kort i Ready.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behover Daniel"-ko:** push-notiser (T22), 3 befordringar (Forekomst 3+), IMPROVEMENTS-kandidat (diakritik-commit-hook), FIFA-juni-ranking, release-gransen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbaddning:** SKIPPAD, stangd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vagen till slutet (Daniel ger go for release-gransen vid hemkomst).

---

## RESUME-HERE , 2026-06-12 , T59/#97 (Dubblerade kopiera-tips-knappar) KLAR - PR #103 väntar på merge

**Branch:** `feature/T59-dubblettrum` @ HEAD `f30222a`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/103 mot `develop` (Closes #97, state: OPEN)
**Board:** issue #97 i "In Review" (satt av journalisten 2026-06-12). Dirigenten stänger issue #97 MANUELLT och flyttar kort #97 till Done EFTER merge.

**Vad T59 levererade:**
- Rotorsak verifierad: `listMyRooms` frågade `room_members` utan `.eq('user_id', ...)`, RLS slappte igenom alla medlemsrader -> en rum-rad per rumsmedlem (dokumenterat mot t14-RLS-policyn rad 66-68). Pre-existerande sedan T14, ytade när rum fick fler medlemmar.
- Fix: `.eq('user_id', identity.userId)` pa queryn (identiteten fanns redan via `ensureSession`, returvärdet kastades tidigare) + defensiv dedupe pa `room.id` i Map-mappningen (skydd mot framtida query-/RLS-andring).
- Rotorsak dokumenterad i `docs/decisions.md`.
- 2 regressionstester: (1) queryn filtrerar pa `user_id`, (2) flera medlemsrader för samma rum ger exakt en `RoomSummary` per rum.

**Commits:**
- `f30222a` - fix(rooms): listMyRooms filtrerar pa egen user_id, dedupar rum (#97) - HEAD

**Verifiering:** rooms-sviten 121 pass (riktat 20/20), lint/format/build rent. Lokal panel: PASS (F1 = 4 pre-existerande röda tester pa develop, bekräftade orelaterade, städ-task #102 skapad). Copilot: runda 1 noll fynd, exit direkt.

**Acceptanskriterier issue #97 (bockade av journalisten 2026-06-12):**
- [x] AC#1: ett källrum visas exakt en gang (commit f30222a, .eq user_id-filter)
- [x] AC#2: rotorsak dokumenterad - listMyRooms saknade .eq user_id, t14-RLS-policyn verifierad (commit f30222a, decisions.md)
- [x] AC#3: regressionstest med rum som har flera medlemmar (commit f30222a, 2 regressionstester, 121 pass riktat 20/20)
- [x] AC#4: grönt + reviewad (lint/format/build rent, lokal panel PASS, Copilot noll fynd)

**PINNADE punkter (oförändrade, bärs framåt):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping, editor flippar LF->CRLF. Kort i Ready. UPPLYFT: mönstret kostade tid 4:e gangen - rotorsak nu, bygge i T60-köns grannskap.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bärs framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready.
- **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 handrullade dialoger). Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
- **F2-kandidat (T50):** kortnamn i RevealView/bracket-summary-rubriker om Daniel vill.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **BEFORDRAN 3 (senior-developer-mönstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Förekomst 3 (nu 4 efter T53). Typ: agent-beteende -> senior-developers fil. Väntar Daniels godkännande.
- **IMPROVEMENTS-kandidat:** reviewerns förslag - commit-msg-git-hook som scannar svenska diakritik-substitut. Pipeline-ändring = kräver Daniels godkännande. Notera för dirigenten att skriva i `C:/Repo/agent-kit/IMPROVEMENTS.md`.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge väntar.
- **2 mosade temp-filer städade:** `board_items` + `proj2items` lag i repo-roten och städades bort av subagenter. Mönstret värt att se upp med i framtida tasks.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #103 (T59/#97, feature/T59-dubblettrum) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 103 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #97 manuellt (`gh issue close 97`) - auto-close funkar inte mot develop nar default-branch är main.
> Flytta kort #97 till Done pa boarden (nu i "In Review", projekt 2).
> Merga även äldre öppna PR:er om de fortfarande är öppna (PR #101 T53/#95, PR #94 T52/#91) - stäng resp. issue och flytta till Done.
>
> Om PR #103 REDAN mergad:
> T59 klar. Nästa task i kön: **#96 (T55 - andras tips syns inte efter avspark, rotorsak pa issuen)**.
> Därefter: #70 (T41 .gitattributes EOL, UPPLYFT: mönstret kostade tid 4:e gangen) -> #98 (T57) -> #99 (T58) -> #100 (T56) -> #102 (T60 röda tester) -> #93 (T54) -> #18 -> #76 -> #19 -> #24 -> #64 -> D-resten.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3+), IMPROVEMENTS-kandidat (diakritik-commit-hook), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T53/#95 (Förlängd deadline söndag 14/6) KLAR - PR #101 väntar på merge

**Branch:** `feature/T53-sondags-deadline` @ HEAD `7c1c5a1`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/101 mot `develop` (Closes #95, state: OPEN)
**Board:** issue #95 i "In Review" (satt av journalisten 2026-06-11). Dirigenten stänger issue #95 MANUELLT och flyttar kort #95 till Done EFTER merge.

**Vad T53 levererade:**
- Migration `20260611150000`: GREATEST-formel i RLS - förlänger gruppvinnare/champion till 2026-06-14T21:59:00Z, förkortar ALDRIG (sena grupper med ankare efter 14/6 berörs inte). NULL-fail-safe: okänd grupp/slot ger explicit null, inte öppet fönster. Migration APPLICERAD LIVE.
- Klient-spegling i `prediction-deadline.ts`: samma GREATEST-logik i TypeScript, delade konstanter, mutationstest bevisar att fel konstant rödnar.
- Hårt skriv-prov: riktig anonym throwaway-session i isolerat testrum, INSERT-bevis mot live, städat med count-verifiering efteråt. Baseline 83+7 riktiga tips orörda.
- Copilot R1: sann champion-kommentar efter förlängningen + README-kodsträng på en rad. R2: IMMUTABLE-kommentaren på konstanten.
- Hög-risk-review: PASS 5/5 linser (correctness/security/data-integritet/en-sanning/hygien). F1 (A..F/G..L-inramning) avvisad som blocker med motivering.

**Commits (äldst till nyaste):**
- `47f2e69` - T53 (#95): förläng deadline till söndag 14/6 för gruppvinnare + champion
- `a5c21d6` - T53: copilot R1, sann champion-kommentar efter förlängningen + README-kodsträng på en rad (#95)
- `7c1c5a1` - T53: copilot R2, IMMUTABLE-kommentaren, ärlig not om att enbart kommentartext skiljer mot live-kopian (#95) - HEAD

**Verifiering:** 1298 pass + 29 env-skip, lint/format/build rent. Hög-risk-review PASS 5/5. Copilot R1 3 fynd (2 åtgärdade, 1 motiverat avvisat). Copilot R2 2 fynd (1 åtgärdat, 1 motiverat avvisat: hus-stilens mellanslag-komma), exit.

**Acceptanskriterier issue #95 (bockade av journalisten 2026-06-11):**
- [x] AC#1: Grupp- och champion-tips går att lägga/ändra fram till 2026-06-14 23:59 svensk tid, bevisat mot riktig DB med sessioner (commit 47f2e69, hårt skrivprov)
- [x] AC#2: Match-tips och bracket-slot-tips opåverkade (egna avsparks-lås, GREATEST rör ej dem)
- [x] AC#3: DeadlineNotice/UI visar den nya tidpunkten (härledd ur samma konstant som RLS, mutations-test)
- [x] AC#4: Efter deadline: låst precis som idag (GREATEST-formeln är IMMUTABLE efter 14/6 21:59Z)
- [x] AC#5: Tester + grönt, reviewad (RLS-ändring, hög-risk-review PASS 5/5, copilot exit)

**PINNADE punkter (oförändrade, bärs framåt):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping, editor flippar LF->CRLF. Kort i Ready.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bärs framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready.
- **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 handrullade dialoger). Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
- **F2-kandidat (T50):** kortnamn i RevealView/bracket-summary-rubriker om Daniel vill.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **BEFORDRAN 3 (senior-developer-mönstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Förekomst 3 (nu 4 efter T53). Typ: agent-beteende -> senior-developers fil. Väntar Daniels godkännande.
- **IMPROVEMENTS-kandidat:** reviewerns förslag - commit-msg-git-hook som scannar svenska diakritik-substitut. Pipeline-ändring = kräver Daniels godkännande. Notera för dirigenten att skriva i `C:/Repo/agent-kit/IMPROVEMENTS.md`.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge väntar.
- **2 mosade temp-filer städade:** `board_items` + `proj2items` låg i repo-roten och städades bort av subagenter. Mönstret värt att se upp med i framtida tasks.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #101 (T53/#95, feature/T53-sondags-deadline) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 101 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #95 manuellt (`gh issue close 95`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #95 till Done på boarden (nu i "In Review", projekt 2).
> Merga även PR #94 (T52/#91) om den fortfarande är öppen (stäng issue #91, flytta kort till Done).
>
> Om PR #101 REDAN mergad:
> T53 klar. Nästa task i kön: **#97 (T59 - dubblettknapp-bugg, ROTORSAK: listMyRooms saknar .eq user_id - en rad per RUM-MEDLEM, inte per rum, en rad fix)**.
> Därefter: #96 (T55 - andras tips syns inte efter avspark, rotorsak utredd, läs issue #96), #98 (T57 levande dag), #99 (T58 poäng i tips-vyn), #100 (T56 levande träd), #93 (T54 kom-igång), sedan #18 -> #76 -> #19 -> #24 -> #64 -> D-kategorin.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3+), IMPROVEMENTS-kandidat (diakritik-commit-hook), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T52/#91 (Kopiera mina tips) KLAR - PR #94 väntar på merge

**Branch:** `feature/T52-kopiera-tips` @ HEAD `3b8a3cc`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/94 mot `develop` (Closes #91, state: OPEN)
**Board:** issue #91 i "In Review" (satt av journalisten 2026-06-11). Dirigenten stanger issue #91 MANUELLT och flyttar kort #91 till Done EFTER merge.

**Vad T52 levererade:**
- `copy-predictions`-engine: lasta alla egna tips fran kallrummet, klassificera matchtyp (match/grupp/bracket/champion), pre-klassificera las med SAMMA avspark-ankare som RLS (verifierat rad-for-rad mot t15/t16-migrationerna), skriv bara TOMMA tips i malrummet (skriver aldrig over befintliga - dokumenterat beslut i decisions.md)
- Kopiera mina tips-knapp i rum-panelen: valj kallrum ur egna rum, starta kopiering
- Rapport-UI: tre sarbarhets-toner (fel vinner alltid fargsignalen - F1 fran lokal panel atgardad, 4 nya ton-tester), AA-matt, reduced motion
- Delfels-robust: ett fel stoppar inte resten, rapporten speglar exakt utfall (X kopierade, Y lasta, Z redan tippade, N kunde inte kopieras)
- 36 nya tester (32 senior-dev + 4 ton-tester via reviewer/copilot), acyklisk import, rum-bytes-race med ref-guard
- Totalt 1294 pass + 17 env-skip (141 filer) efter alla fixar

**Commits (aldst till nyaste):**
- `6d1b838` - T52: engine + las-harledning + rapport + kontroll, 32 tester, las-ankare verifierade mot t15/t16-RLS (#91)
- `ff365a0` - T52: design, premium-finish, AA ratt-attribuerat (#91)
- `a0a5c0e` - T52: reviewer F1, fel vinner fargsignalen + 4 ton-tester (#91)
- `4c948e2` - T52: copilot R1, acyklisk import, rum-bytes-race med ref-guard + 3 tester, villkorlig alert/status (#91)
- `3b8a3cc` - T52: copilot R2, kommentar-sanning (#91) - HEAD

**Verifiering:** 1294 pass + 17 env-skip (141 filer), lint/format/build rent. Lokal panel: PASS med pinnat F1 atgardad samma varv. Copilot: R1 5 fynd atgardade, R2 1 trivialt atgardade, exit.

**Acceptanskriterier issue #91 (bockade av journalisten 2026-06-11):**
- [x] AC#1: Anvandare med tips i rum A kan kopiera dem till rum B via tydlig UI-atgard (commit 6d1b838 + ff365a0)
- [x] AC#2: Bara egna tips, las respekteras, resultatet rapporteras arligt (commit 6d1b838 + a0a5c0e)
- [x] AC#3: Beteende vid befintliga tips dokumenterat och testat - fyller bara tomma, beslut i decisions.md (commit 6d1b838)
- [x] AC#4: Tester (inkl. las-granser + fel-vagar), gront bygge/lint, reviewad (1294 pass, copilot R2 exit)

**Ny info fran Daniel (kvaells-feedback) - paverkar NAESTA tasks:**
- **#95 (T53 - NAESTA task direkt efter merge):** grupp- + champion-tips forlangda till FAST deadline sondag 2026-06-14 23:59 svensk tid (2026-06-14T21:59:00Z). RLS-migration + klient-harledning i samma sanning. RLS-bevis med riktiga sessioner. Las issue #95 noga.
- **#96 (T55 - EFTER T53, akut bugg):** andras tips syns inte efter avspark. ROTORSAK UTREDD: (1) reveal kraver match finished i stallet for last (reveal.ts/derive-facit.ts), (2) ingen re-fetch nar match passerar avspark (LeaderboardProvider deps), (3) avslojandet bara i topplist-sektionen. RLS frikand med live-bevis. Fix-plan i issue #96.
- **#93 (T54 - efter T55):** glasklar kom-igang/installations-guide per plattform.
- **Ko darefter:** #18 -> #76 -> #19 -> #24 -> #64 -> D-kategorin.
- **Kryss-fraaga besvarad:** 1p for ratt kryss fungerar redan (outcomeOf/pointTypeOf verifierat). Ordvals-fix noterad pa #69 ("Ratt vinnare +1" bor vara utfalls-neutral).

**PINNADE punkter (oforandrade, bars framat):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping, editor flippar LF->CRLF. Kort i Ready.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stangt i T17, bars framat som konvention.
- **#35 (arena/stad):** `Match.venue` = platshallare tills #35 fyller med verifierad per-match-kalla.
- **FNV-hash:** 2 anvandningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 anvandningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-ko.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready.
- **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 handrullade dialoger). Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lagg till manualChunks om LCP-problem uppstar.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
- **F2-kandidat (T50):** kortnamn i RevealView/bracket-summary-rubriker om Daniel vill.

**"Behover Daniel"-ko (oforandrad):**
- Push-notiser T22: kraver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-monster):** `uttommande-test-vaktar-svagare-invariant` Forekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Vantar Daniels godkannande.
- **BEFORDRAN 2 (journalist-monster):** `pastar-att-filer-saknas-utan-att-lista-dem` Forekomst 3. Typ: agent-beteende -> journalistens fil. Vantar Daniels godkannande.
- **BEFORDRAN 3 (senior-developer-monster):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Forekomst 3. Typ: agent-beteende -> senior-developers fil. Vantar Daniels godkannande.
- **IMPROVEMENTS-kandidat:** reviewerns forslag - commit-msg-git-hook som scannar svenska diakritik-substitut (fil-innehalls-vakten fangar inte commit-meddelanden, F3 slank igenom just dar). Pipeline-andring = kraver Daniels godkannande. Notera for dirigenten att skriva i `C:/Repo/agent-kit/IMPROVEMENTS.md`.
- **FIFA-juni-ranking:** aprilutgavan 2026 anvands. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: andra rank-varden + `npm run gen:team-profiles`.
- **Release-gransen:** develop -> main + release-cleanup-skillen vantar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge vantar.

**FORTSATTNINGS-PROMPT (autonom ko):**
> Kor `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #94 (T52/#91, feature/T52-kopiera-tips) ANNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 94 --merge --repo danielaldemir79/vm-2026`.
> Stang issue #91 manuellt (`gh issue close 91`) - auto-close funkar inte mot develop nar default-branch ar main.
> Flytta kort #91 till Done pa boarden (nu i "In Review", projekt 2).
>
> Om PR #94 REDAN mergad:
> T52 klar. Naesta task i kon: **#95 (T53 - grupp/champion-deadline forlangd till sondag 14 juni 23:59, las issue #95 noga)**.
> Darefter: #96 (T55 - andras tips syns inte efter avspark, rotorsak utredd, las issue #96), #93 (T54 installations-guide), sedan #18 -> #76 -> #19 -> #24 -> #64 -> D-kategorin.
>
> Bar framat (alla tasks):
> - **#35 (arena/stad):** venue = platshallare.
> - **FNV-hash:** konsolidera vid 3:e anvandning.
> - **Stegnings-dubblett:** extrahera vid 3:e anvandning.
> - **#48 (demo-chip a11y):** kort i Ready.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behover Daniel"-ko:** push-notiser (T22), 3 befordringar (Forekomst 3), IMPROVEMENTS-kandidat (diakritik-commit-hook), FIFA-juni-ranking, release-gransen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbaddning:** SKIPPAD, stangd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vagen till slutet (Daniel ger go for release-gransen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T51/#88 (Slutspelet ur dina tips) KLAR - PR #92 väntar på merge

**Branch:** `feature/T51-slutspel-ur-tips` @ HEAD `09e14ca`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/92 mot `develop` (Closes #88, state: OPEN)
**Board:** issue #88 i "In Review" (satt av journalisten 2026-06-11). Dirigenten stanger issue #88 MANUELLT och flyttar kort #88 till Done EFTER merge.

**Vad T51 levererade:**
- `deriveTipsBracket`: återanvänder källlåst `buildBracket`, open-third hårdlåst null (treor visas som tomma slots), read-only, fungerar utan att röra simulatorns skriv-seam
- Tre tillstånd läsbara utan färg: inga tips alls / tips men grupp-ofullständig / tips klara (sim-bricka visas bara i det sista läget)
- AA kompositerat i båda teman, sim-bricka med tydlig SIMULERING-markering
- GROUP_IDS-filtrerad räknare stänger blink-effekten vid tomtext (ready-gate)
- M73-kommentarssanning: rätt claims om open-third-logiken
- En-laddning via prop-injektion (ingen dubbel fetch)
- Totalt 22 tester (senior-dev) + 5 tester (copilot R1) = 27 nya tester, 1264 pass + 9 env-skip (137 filer)

**Commits (äldst till nyaste):**
- `c648c86` - T51: senior-dev, deriveTipsBracket + tre tillstånd + 22 tester (#88)
- `2d70447` - T51: design, tre tillstånd AA-kompositerat + sim-bricka (#88)
- `09e14ca` - T51: copilot R1 (GROUP_IDS-räknare, M73-kommentarssanning, ready-gate, prop-injektion, +5 tester) (#88) - HEAD

**Verifiering:** 1264 pass + 9 env-skip (137 filer), lint/format/build rent. Lokal panel: PASS (F2 okänd-code->tbd defensiv accepterad, F3 commit-msg-diakritik + F4 AA-etiketter loggade som design-frontend-lärdomar). Copilot: R1 5 fynd alla åtgärdade, R2 0 fynd, exit nådd.

**Acceptanskriterier issue #88 (bockade av journalisten 2026-06-11):**
- [x] AC#1: Simulerat slutspelsträd ur grupp-tipsen - sextondelsmötena och hela trädet (commit c648c86)
- [x] AC#2: Treor hanteras som öppna slots/platshållare, dokumenterat källtroget - open-third=null, hardkodat och kommenterat (commit c648c86, M73-rättning 09e14ca)
- [x] AC#3: Tydligt markerat som SIMULERING ur tipsen, inte riktiga resultat (commit 2d70447, sim-bricka)
- [x] AC#4: Riktiga resultat/facit påverkas inte - read-only, ingen skriv-seam berörd (commit c648c86)
- [x] AC#5: Tester + grönt bygge/lint, reviewad (1264 pass, copilot R2 exit)

**PINNADE punkter (oförändrade, bärs framåt):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping, editor flippar LF->CRLF. Kort i Ready.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bärs framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready.
- **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 handrullade dialoger). Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
- **F2-kandidat (T50):** kortnamn i RevealView/bracket-summary-rubriker om Daniel vill.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **BEFORDRAN 3 (senior-developer-mönstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Förekomst 3. Typ: agent-beteende -> senior-developers fil. Väntar Daniels godkännande.
- **IMPROVEMENTS-kandidat:** reviewerns förslag - commit-msg-git-hook som scannar svenska diakritik-substitut (fil-innehålls-vakten fångar inte commit-meddelanden, F3 slank igenom just där). Pipeline-ändring = kräver Daniels godkännande. Notera för dirigenten att skriva i `C:/Repo/agent-kit/IMPROVEMENTS.md`.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge väntar.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #92 (T51/#88, feature/T51-slutspel-ur-tips) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 92 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #88 manuellt (`gh issue close 88`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #88 till Done på boarden (nu i "In Review", projekt 2).
>
> Om PR #92 REDAN mergad:
> T51 klar. Nästa task i kön: **#91 (T52 - kopiera tips mellan rum, Daniels feedback - läs issuen noga)**.
> Därefter: #18 (realtid), #76 (T45 admin-statistik), #19 (gamification), #24 (reaktioner), #64 (TWA), D-kategorin.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3), IMPROVEMENTS-kandidat (diakritik-commit-hook), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T35/#63 (Lås-tydlighet) KLAR - PR #90 väntar på merge

**Branch:** `feature/T35-las-tydlighet` @ HEAD `029d804`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/90 mot `develop` (Closes #63, state: OPEN)
**Board:** issue #63 i "In Review" (satt av journalisten 2026-06-11). Dirigenten stänger issue #63 MANUELLT och flyttar kort #63 till Done EFTER merge.

**Vad T35 levererade:**
- `format-deadline`-helper: hämtar svensk tid ur `deadlineIso`, formaterar "Måndag 16 juni kl 15:00" via `Europe/Stockholm` (utlands-säkert, UTC i `<time datetime>`)
- `DeadlineNotice`-komponent i grupp- och bracket-tips: "Tippningen låses [dag kl tid] om N dagar", härledd ur SAMMA ISO-fält som driver RLS-låset (kan aldrig drifta)
- Deadline-modell verifierad 1:1 mot RLS-migrationerna: grupp = g-X-1 (gruppens första match), slot = egen avspark, champion = g-A-1 (turneringsstart)
- Matchtips gråmarkerat omisskännligt vid avspark: grå inlämnad-känsla, neutraliserad guld-perforering, `locked-state`-CSS-klass, vänlig (inte varnande) deadline-rad
- Design-finish (commit 5e87a41): 8% surface-tint, neutral river-tear, muted glyf, AA kompositerat i båda teman
- Copilot R1 (commit 665e8c1): sann filter-kommentar + ärligt relative-kontrakt string; R2 (commit 029d804): decisions.md-sanning om saturate-filtrets räckvidd
- AC#2 (3-dagars fönster) var redan levererad i T39, byggdes inte om

**Commits:**
- `10f0e5f` - T35: lås-tydlighet, gråmarkerat låst-läge + deadline-budskap (#63) - senior-dev
- `5e87a41` - style(predictions): visuell finish på låst-läge + deadline-ton (#63) - design
- `665e8c1` - T35: copilot R1 (sann filter-kommentar + ärligt relative-kontrakt) (#63)
- `029d804` - T35: copilot R2, decisions.md säger nu sanningen om saturate-filtrets räckvidd (#63) - HEAD

**Verifiering:** 1229 pass + 17 env-skip (1246 totalt), lint/format/build rent. Lokal panel: PASS noll fynd (F1-F6 alla verifierade-korrekta). Copilot R1: 2 fynd åtgärdade, R2: 1 trivialt åtgärdat, exit nådd (2->1, inga strukturella).

**Acceptanskriterier issue #63 (bockade av journalisten 2026-06-11):**
- [x] AC#1: Match-tips visuellt gråmarkerade/låsta vid avspark, omisskännligt (commit 10f0e5f + 5e87a41)
- [x] AC#2: 3-dagars fönster + expandera/komprimera på matchtips-listan (levererad i T39, ej ombyggd)
- [x] AC#3: Grupp/bracket-tips kommunicerar sin deadline tydligt och KORREKT - DeadlineNotice ur samma ISO-fält, deadline-modell verifierad mot RLS (commit 10f0e5f)
- [x] AC#4: Responsiv + a11y, tester för låst-state + fönster (1229 pass + 17 env-skip, lint/format/build rent)
- [x] AC#5: Bygger grönt, lint rent, reviewad, inga olösta findings (Copilot R2 exit nådd)

**PINNADE punkter (oförändrade, bärs framåt):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping, editor flippar LF->CRLF. Kort i Ready.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bärs framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready.
- **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 handrullade dialoger). Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
- **F2-kandidat (T50):** kortnamn i RevealView/bracket-summary-rubriker om Daniel vill.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **BEFORDRAN 3 (senior-developer-mönstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Förekomst 3. Typ: agent-beteende -> senior-developers fil. Väntar Daniels godkännande. (T35-mönstret med filter-claim x2 + relative-kontrakt stärker detta befordrings-case ytterligare - 3 fynd av samma typ i en enda task.)
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge väntar.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #90 (T35/#63, feature/T35-las-tydlighet) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 90 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #63 manuellt (`gh issue close 63`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #63 till Done på boarden.
>
> Om PR #90 REDAN mergad:
> T35 klar. Nästa task i kön: **#88 (T51 - slutspels-simulering ur grupp-tipsen, Daniels feedback - läs issuen #88 noga)**.
> Därefter: #18 (realtid), #76 (T45 admin-statistik), #19 (gamification), #24 (reaktioner), #64 (TWA), D-kategorin.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T34/#62 (Så funkar poängen-UI) KLAR - PR #89 väntar på merge

**Branch:** `feature/T34-poang-ui` @ HEAD `e876604`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/89 mot `develop` (Closes #62, state: OPEN)
**Board:** issue #62 i "In Review" (satt av journalisten 2026-06-11). Dirigenten stänger issue #62 MANUELLT och flyttar kort #62 till Done EFTER merge.

**Vad T34 levererade:**
- `ScoreGuide`-komponent med konstant-härledd text (tal från `POINTS_EXACT`, `POINTS_WINNER`, `GROUP_*`, `ROUND_ADVANCE_POINTS`, `CHAMPION_PREDICTION_POINTS`) - ingen hårdkodad siffra som kan drifta
- Mutations-vakt i test: mutera konstanten, verifiera att UI-texten förändras, återställ (F1-bevis äkta)
- Ersatte T46:s `ScoreLegend` (hårdkodade/inaktuella siffror) med `ScoreGuide` i `PredictionsSummary` och `LeaderboardView`
- Design-polering: tokens.css §19, premium-finish, verifierad live i 5 bredder x 2 teman med Playwright + pathToFileURL
- Copilot R1: id-sanitering av `surface` i aria-id:n (`score-guide-${id}` -> alltid giltigt XML-id), sann JSDoc, komma-nit i copy
- Regressionstest: +1 nytt test utöver mutations-vakten
- `vm-board-self-summary` pre-existerande i LeaderboardView F2: avvisad med motivering

**Commits:**
- `75c3a74` - T34: "Så funkar poängen", delad förklaring vid tippning + topplista (#62)
- `7f38cb9` - style(scoring-guide): premium-finish pa "Så funkar poängen" (#62)
- `e876604` - T34: copilot R1 (id-sanitera surface i aria-id:n + sann JSDoc/decisions + komma-nit) (#62) - HEAD

**Verifiering:** 1204 pass + 29 env-skip (hela sviten), lint/format/build rent. Lokal panel PASS (F1 mutations-vakt äkta-bevisad, F2 pre-existerande avvisad, F3 komma-nit åtgärdad). Copilot R1: 4 fynd alla åtgärdade, R2: 0 fynd, exit nådd.

**Acceptanskriterier issue #62 (bockade av journalisten 2026-06-11):**
- [x] AC#1: Synlig "Så funkar poängen"-förklaring vid tippningen, enkel och inbjudande (commit 75c3a74)
- [x] AC#2: Samma förklaring nåbar vid topplistan (commit 75c3a74)
- [x] AC#3: Talen hämtas från poäng-konstanterna, ingen hårdkodad siffer-dubblett (commit 75c3a74, mutations-vakt bevisar)
- [x] AC#4: Inga poängtal ändrade, befintliga tester orörda gröna + nya UI-tester (1204 pass)
- [x] AC#5: Bygger grönt, lint rent, reviewad, inga olösta findings (R2 = 0 fynd, exit nådd)

**Viktig pin: modal-extraktion rule-of-three PASSERAD**
ScoreGuide är 4:e handrullade a11y-dialogen (TeamProfilePanel / Onboarding / SettingsControl / ScoreGuide). Rule-of-three är passerad. Issue #56 (delad modal-primitiv) är motiverad som en riktig refaktor-task, flaggad av senior-dev och design-frontend.

**PINNADE punkter (oförändrade, bärs framåt):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping, editor flippar LF->CRLF. Kort i Ready.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bärs framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready.
- **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 handrullade dialoger). Kort i Ready, nu starkare motiverat.
- **KA-F4-notering:** bundle ca 717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
- **F2-kandidat (T50):** kortnamn i RevealView/bracket-summary-rubriker om Daniel vill.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **BEFORDRAN 3 (senior-developer-mönstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Förekomst 3. Typ: agent-beteende -> senior-developers fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge väntar.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #89 (T34/#62, feature/T34-poang-ui) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 89 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #62 manuellt (`gh issue close 62`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #62 till Done på boarden.
>
> Om PR #89 REDAN mergad:
> T34 klar. Nästa task i kön: **#63 (T35 - lås-tydlighet, gråmarkerat tippnings-lås + deadline-tydlighet)**.
> Därefter: #88 (T51 slutspels-sim ur grupp-tipsen, Daniels feedback - se issue #88), sedan #18, #76, #19, #24, #64, D-kategorin.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready.
> - **#56 (delad modal-primitiv):** rule-of-three PASSERAD (4 dialoger), kort i Ready, starkare motiverat.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T50/#86 (Kortnamn trånga ytor) KLAR - PR #87 väntar på merge

**Branch:** `feature/T50-bosnien-kortnamn` @ HEAD `8a70e81`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/87 mot `develop` (Closes #86, state: OPEN)
**Board:** issue #86 i "In Review" (satt av journalisten 2026-06-11). Dirigenten stänger issue #86 MANUELLT och flyttar kort #86 till Done EFTER merge.

**Vad T50 levererade:**
- Nytt valfritt `shortName`-fält på `Team`-typen + helper `teamShortName` (en sanning: shortName om det finns, annars name)
- `GroupTable` + match-display (matchkort och bracket-vy) visar kortnamn i trånga ytor
- Lagprofilen behåller fulla namnet (fullnamn kvar där utrymme finns)
- Endast BIH (Bosnien och Hercegovina -> "Bosnien") av 48 lag har shortName, data-låst test vaktar det
- Lokal reviewer PASS (TeamCode-kontraktet intakt, shortName end-to-end-probat, EOL-ren diff)
- F1 (orelaterad barrel-export-städning i computeStandings): AVVISAD, verifierat ofarlig
- F2 (RevealView/bracket-summary visar fullnamn, radbryter snyggt, ej pinch): AVVISAD med motivering, pinnad som kandidat om Daniel vill ha kortnamn även i RevealView-rubriker

**Commits:**
- `fee2a1e` - T50: kort visningsnamn (shortName) för trånga ytor (#86) - bygge
- `8a70e81` - T50: copilot R1, håll kod-spannet för filsökvägen på en rad i decisions.md (#86) - HEAD

**Verifiering:** 1199 pass + 9 env-skippade, lint/format/build rent. Copilot R1: 1 trivialt docs-fynd, åtgärdat, tråd löst, exit nådd.

**Acceptanskriterier issue #86 (bockade av journalisten 2026-06-11):**
- [x] AC#1: Grupp B-tabellen visar "Bosnien" och kolumnerna får plats (commit fee2a1e)
- [x] AC#2: Lösningen är generell - shortName-helper + fält på Team, inte hårdkodad specialregel (commit fee2a1e)
- [x] AC#3: Fulla namnet finns kvar i lagprofilen (commit fee2a1e, verifierat av reviewer)

**PINNADE punkter (oförändrade, bärs framåt):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping, editor flippar LF->CRLF. Kort i Ready.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bärs framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready.
- **#56 (delad modal-primitiv):** F4 från T32-panelen, rule-of-three ej nådd. Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
- **F2-kandidat (T50):** kortnamn även i RevealView/bracket-summary-rubriker om Daniel vill.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **BEFORDRAN 3 (senior-developer-mönstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Förekomst 3. Typ: agent-beteende -> senior-developers fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge väntar.

**FORTSÄTTNINGS-PROMPT (autonom kö):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #87 (T50/#86, feature/T50-bosnien-kortnamn) ÄNNU INTE mergad:
> Dirigenten har fullmakt. Merga mot develop: `gh pr merge 87 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #86 manuellt (`gh issue close 86`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #86 till Done på boarden.
>
> Om PR #87 REDAN mergad:
> T50 klar. Nästa task i kön: **#62 (T34 - poängskala + "Så funkar poängen"-UI)**.
> OBS: issue-texten för #62 har GAMLA poängskalan (10/3/50). Faktiska låsta skalorna är:
>   - Match: 3p exakt / 1p rätt vinnare / 0p miss
>   - Grupp: 5p gruppvinnare (3+2) / 0p annars
>   - Bracket: 1-5p stigande per runda
>   - Champion: 20p
> Uppdatera issue-texten i #62 INNAN bygge startar, så senior-developer bygger mot rätt siffror.
>
> Prioritetsordning i kön (efter #62):
> - #63 (T35 lås-tydlighet)
> - #18 (realtid)
> - #76 (T45 admin-statistik)
> - #19 (gamification)
> - #24 (reaktioner)
> - #64 (TWA)
> - D-kategorin: FIFA juni-ranking, #25 prestanda/E2E/a11y, #70 EOL/.gitattributes, #56 modal, #48 demo-chip
>
> Daniels beslut som väntar vid slutet av kön: release develop->main, post-VM-vyn #39-F1, 3 minnes-befordringar.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready.
> - **#56 (delad modal-primitiv):** kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **F2-kandidat (T50):** kortnamn i RevealView-rubriker om Daniel vill.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T49/#84 (Champion 20p) KLAR - PR #85 väntar pa merge

**Branch:** `feature/T49-champion-20p` @ HEAD `e9af0071`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/85 mot `develop` (Ref #84, state: OPEN)
**Board:** issue #84 i "In Review" (satt av journalisten). Dirigenten stanger issue #84 MANUELLT och flyttar kort #84 till Done EFTER merge.

**T48-status sedan forsta blocket:** PR #83 (T48/#81, feature/T48-results-cleanup) MERGAD 17:10.
LIVE-VERIFIERAD pa vm-2026.pages.dev (version 6e24622): vanner ser ingen login-affordans, read-only-noten visas, #arrangor faller fram inloggningen, verifierat i farsk browser via Playwright.
Issue #81 fortsatt OPPEN (T48b recoverable login aterstaar).

**Vad T49 levererade:**
- `CHAMPION_PREDICTION_POINTS` andrad 8 -> 20 i `src/data/predictions/bonus-score.ts`
- 6 filer berorda: bonus-score.ts (konstant + VARFOR-kommentar + modul-header), tester (konstant-assertion + summa-test omraknat 17 -> 29), docs/decisions.md, supabase/README.md, migration-kommentar
- Summa-testet omraknat: 3+5+1+20=29 (matchar poangkedjan gruppvinnare+grupptvaa+bracket+champion)
- DB-tillstandet orort (ingen ny migration)

**Verifiering:** 1162 pass + 34 skippade, lint/format/build rent. Lokal reviewer: PASS.
F1/F2/F3 alla verifierade-losta: poangkedjan 3+5+1+20=29 sparad, inga missade speglingar,
ingen dubbelrakning champion vs final-slot M104 (det ar tva separata tips = 25p mojligt, avsiktligt).

**Copilot-loopen hoppas over (Daniels uttryckliga tidsbeslut):** "vi far spara lite tid pa copilot nu... efter lansering kor vi pa som vanligt". Beslutet loggat har. Full process aterupptas efter lansering.

**Acceptanskriterier issue #84 (bockade av journalisten 2026-06-11):**
- [x] AC#1: Konstanten ar 20 i src/data/predictions/bonus-score.ts (commit e9af0071)
- [x] AC#2: Alla tester som laser champion-poangen uppdaterade och grona (1162 pass + 34 skippade)
- [x] AC#3: Ingen UI-text visade siffran 8 eller 20 - inget att andra, levererat i den bemarkelsen att ingen atgard kravdes

**RISK att hantera direkt efter merge+deploy:**
Daniel har raderat den installerade appen. Om webblaasarens site-data for vm-2026.pages.dev ocksa raderats ar hans anonyma identitet (med admin-rollen seedat pa user_id) borta.
Verifiera: besok vm-2026.pages.dev -> kolla `select * from app_admins` via Supabase MCP.
Om hans gamla user_id saknas: seeda om det med hans nuvarande anonyma user_id.
Hans tips/visningsnamn ar knutna till gamla identiteten (ny anonym = blank slate).

**NASTA ARBETE (efter merge+deploy av PR #85):**
1. Verifiera Daniels admin-session (se RISK ovan). Om ny user_id -> seeda om i app_admins via Supabase MCP + tips/visningsnamn knutna till gamla identiteten.
2. Ge Daniel installerings-klartecken.
3. **DELNING MOJLIG** efter ovanstaaende.
4. #76 T45 admin-statistik, #75 T44 footer-promo, T48b (recoverable signInWithOtp, issue #81 oppen), ovriga (#69/#62/#63/#64/#70/#48/#56, T18-T25).

**PINNADE punkter (oforandrade, bars framat):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping, editor flippar LF->CRLF. Kort i Ready.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stangt i T17, bars framat som konvention.
- **#35 (arena/stad):** `Match.venue` = platshallare tills #35 fyller med verifierad per-match-kalla.
- **FNV-hash:** 2 anvandningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 anvandningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-ko.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready.
- **#56 (delad modal-primitiv):** F4 fran T32-panelen, rule-of-three ej nadd. Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lagg till manualChunks om LCP-problem uppstar.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.

**"Behover Daniel"-ko (uppdaterad):**
- Push-notiser T22: kraver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-monster):** `uttommande-test-vaktar-svagare-invariant` Forekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Vantar Daniels godkannande.
- **BEFORDRAN 2 (journalist-monster):** `pastar-att-filer-saknas-utan-att-lista-dem` Forekomst 3. Typ: agent-beteende -> journalistens fil. Vantar Daniels godkannande.
- **BEFORDRAN 3 (senior-developer-monster):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Forekomst 3. Typ: agent-beteende -> senior-developers fil. Vantar Daniels godkannande.
- **FIFA-juni-ranking:** aprilutgavan 2026 anvands. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: andra rank-varden + `npm run gen:team-profiles`.
- **Release-gransen:** develop -> main + release-cleanup-skillen vantar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge vantar.

**FORTSATTNINGS-PROMPT (autonom session):**
> Kor `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #85 (T49/#84, feature/T49-champion-20p) ANNU INTE mergad:
> Dirigenten har Daniels uttryckliga go. Merga mot develop: `gh pr merge 85 --merge --repo danielaldemir79/vm-2026`.
> Stang issue #84 manuellt (`gh issue close 84`) - auto-close funkar inte mot develop nar default-branch ar main.
> Flytta kort #84 till Done pa boarden.
> Verifiera att vm-2026.pages.dev bygger och deployas (Cloudflare Pages).
>
> Om PR #85 REDAN mergad:
> T49 ar klar och mergad. Champion-poangen ar 20. Nasta steg (kritiskt fore delning):
> 1. Verifiera Daniels admin-session: besok vm-2026.pages.dev, kolla att hans user_id fortfarande har admin-roll i `app_admins` via Supabase MCP (`select * from app_admins`). Om hans gamla user_id saknas: seeda om det med hans nuvarande anonyma user_id. RISK: om site-data raderats ar hans anonyma identitet + admin-roll + tips borta - da omseedas hans NYA user_id i app_admins via Supabase MCP/SQL + tips/visningsnamn ar knutna till gamla identiteten (ny anonym = blank slate).
> 2. Ge Daniel installations-klartecken.
> 3. **DELNING MOJLIG** efter ovanstaaende.
>
> Prioritetsordning efter delning:
> - #76 T45 admin-statistik + read-only-vy
> - #75 T44 footer-promo
> - T48b recoverable signInWithOtp (AC#3, issue #81 halls oppen for detta)
> - #69/#62/#63/#64/#70/#48/#56 i backlog-ordning
> - T18-T25 darefter
>
> Bars framat (alla tasks):
> - **#35 (arena/stad):** venue = platshallare.
> - **FNV-hash:** konsolidera vid 3:e anvandning.
> - **Stegnings-dubblett:** extrahera vid 3:e anvandning.
> - **#48 (demo-chip a11y):** kort i Ready.
> - **#56 (delad modal-primitiv):** kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **"Behover Daniel"-ko:** push-notiser (T22), 3 befordringar (Forekomst 3), FIFA-juni-ranking, release-gransen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbaddning:** SKIPPAD, stangd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vagen till slutet (Daniel ger go for release-gransen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T48/#81 (Pre-share cleanup) KLAR - PR #83 väntar på merge

**Branch:** `feature/T48-results-cleanup` @ HEAD `bea4b48`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/83 mot `develop` (Closes #81, state: OPEN)
**Board:** issue #81 i "In Review" (satt av journalisten). Dirigenten stänger issue #81 MANUELLT och flyttar kort #81 till Done EFTER merge.

**Läget nu:** PR #78 (T42), PR #77 (T43), hotfix-PR #80 (tyst PWA-auto-uppdatering, skipWaiting+clientsClaim) och PR #82 (T46, resultat-presentation med poäng+VARFÖR+sammanfattning) är alla MERGADE till develop. T48 är nästa och sista pre-share-block.

**Varför T48 spelar roll:** Officiella resultat (admin-inmatade) driver nu live-trackern för alla. Resultat-inmatningen är admin-gatad i live-läge. Arrangörs-inloggningen är HELT dold bakom hemligt URL-fragment `#arrangor` (vanliga vänner ser den inte alls). Rumsbyten i live väver inte om i onödan (regressionstest).

**KLART med bevis (SHA-lista, äldst sist):**
- `bea4b48` - T48: copilot R3 (window-gard i hash-effekten + ready-vakt i facit-testet) - HEAD
- `adb481e` - T48 copilot R2: rums-byte i live väver inte om i onödan
- `e38f244` - T48: dölj arrangörs-inloggningen helt bakom hemligt #arrangor-fragment
- `1a50d9d` - T48: copilot R1 (kommentar-sanning + prevFacitRef-rename + scope-klargörande)
- `d82e999` - T48 F2: dölj lokal resultat-inmatning i live även för admin (bara tänk-om)
- `0cb2d9b` - T48: diskret arrangörs-inloggning bakom utfällning
- `5c723fd` - T48: resultat-inmatning admin-gatad i live + tänk-om-undantag
- `74d11fa` - T48: officiella resultaten driver live-trackern för alla

**Verifiering:** 1179 pass + 17 skippade (130 filer), lint/format/build rent. Lokal reviewer-runda på deltat: PASS, noll fynd (mutationsbevisad negativ kontroll). Copilot: R1 5 fynd, R2 1 fynd, R3 2 triviala, alla åtgärdade, alla trådar lösta. Exit-kriterier nådda.

**Acceptanskriterier issue #81 (bockade av dirigenten efter merge):**
- [x] AC#1: Resultat-inmatning visas bara för admin i live-läge
- [x] AC#2: Officiella resultat driver live-trackern för alla
- [ ] AC#3: Recoverable admin-inloggning via signInWithOtp - UTBRUTEN till T48b (beslutat copilot R1). Issue #81 hålls ÖPPEN.
- [x] AC#4: Bevara tippning, deadline-sekretess, TeamCode-kontraktet, auto-update
**OBS: Bocka INTE AC#3 - den är inte levererad och issue förblir öppen.**

**Daniels beslut (loggade):**
- Sista copilot-rundan före lansering, tiden är knapp. Full process återupptas efter lansering.
- Inloggningen HELT osynlig för icke-admins: nås via `#arrangor` på URL:en.
- VM-vinnar-poängen ändras 8 -> 20 (`CHAMPION_PREDICTION_POINTS` i `src/data/predictions/bonus-score.ts`). NÄSTA arbete direkt efter merge, FORE delning.
- Daniel har raderat den installerade appen. RISK: om webbläsarens site-data för vm-2026.pages.dev också raderats är hans anonyma identitet (med admin-rollen seedat på user_id) borta. Verifiera direkt efter merge+deploy: om ny user_id -> seeda om i `app_admins` via Supabase MCP/SQL + tips/visningsnamn är knutna till gamla identiteten (ny anonym = blank slate).

**NÄSTA ARBETE (pre-share, i ordning):**
1. **Champion 20p** - ändra `CHAMPION_PREDICTION_POINTS` till 20 i `src/data/predictions/bonus-score.ts` (BLOCKERAR DELNING - Daniels beslut).
2. **Verifiera Daniels admin-session + ominstallation** - kontrollera att hans user_id fortfarande har admin-rollen i `app_admins` efter appradering. Om borta: seeda om via Supabase MCP.
3. **DELNING MÖJLIG** efter ovanstående.
4. #76 T45 admin-statistik, #75 T44 footer-promo, T48b (recoverable signInWithOtp), sedan backlog.

**PINNADE punkter (oförändrade, bär framåt):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping, editor flippar LF->CRLF. Kort i Ready.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bär framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort i Ready.
- **#56 (delad modal-primitiv):** F4 från T32-panelen, rule-of-three ej nådd. Kort i Ready.
- **KA-F4-notering:** bundle ca 717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.

**"Behöver Daniel"-kö (uppdaterad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **BEFORDRAN 3 (senior-developer-mönstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Förekomst 3. Typ: agent-beteende -> senior-developers fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T48b:** recoverable signInWithOtp (AC#3 utbruten), bygge väntar.

**Notat lärdomar-loopen:** reviewern bekräftade att `uttommande-test-vaktar-svagare-invariant` och `kommentar-sanning` synligt tillämpats av senior-dev i T48. Lessons-loopen biter.

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`.
>
> Om PR #83 (T48/#81, feature/T48-results-cleanup) ÄNNU INTE mergad:
> Dirigenten har Daniels uttryckliga go. Merga mot develop: `gh pr merge 83 --merge --repo danielaldemir79/vm-2026`.
> Stäng INTE issue #81 automatiskt - den hålls öppen (AC#3 utbruten till T48b). Flytta kort #81 till Done på boarden trots öppen issue (AC#1, #2, #4 levererade).
> Verifiera att vm-2026.pages.dev visar att officiella resultat driver live-trackern och att inloggningsknappen är OSYNLIG utan `#arrangor` i URL:en.
>
> Om PR #83 REDAN mergad:
> T48 är klar och mergad. Nästa arbete FORE delning:
> 1. Ändra `CHAMPION_PREDICTION_POINTS` till 20 i `src/data/predictions/bonus-score.ts` (VM-vinnare 8p -> 20p, Daniels beslut).
> 2. Verifiera Daniels admin-session: besök vm-2026.pages.dev, kolla att hans user_id fortfarande har admin-roll i `app_admins` via Supabase MCP (lista `select * from app_admins`). Om hans gamla user_id saknas: seeda om det med hans nuvarande anonyma user_id. Daniel kan sedan installera om appen.
> 3. Därefter är DELNING MÖJLIG.
>
> Prioritetsordning efter delning:
> - #76 T45 admin-statistik + read-only-vy
> - #75 T44 footer-promo
> - T48b recoverable signInWithOtp (AC#3, issue #81 hålls öppen för detta)
> - #69/#62/#63/#64/#70/#48/#56 i backlog-ordning
> - T18-T25 därefter
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare.
> - **FNV-hash:** konsolidera vid 3:e användning.
> - **Stegnings-dubblett:** extrahera vid 3:e användning.
> - **#48 (demo-chip a11y):** kort i Ready.
> - **#56 (delad modal-primitiv):** kort i Ready.
> - **KA-F4-notering:** bundle ca 717 kB, manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T48b.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T42/#72 (Global facit + admin-login) KLAR - PR #78 väntar på merge

**Branch:** `feature/T42-global-facit` @ HEAD `144a063`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/78 mot `develop` (Closes #72, state: OPEN)
**Board:** issue #72 i "In Review" (korrekt). Dirigenten stänger issue #72 MANUELLT och flyttar kort #72 till Done EFTER merge.

**Autonomt läge:** Daniel borta (semester), dirigenten har fullmakt hela vägen till slutet.

**Varför T42 spelar roll:** Bara Daniel (admin) matar in officiella matchresultat EN gång - gäller alla rum och alla användare (tävlingsintegritet). Tidigare per-rum facit som vem som helst kunde skriva.

**KLART med bevis (SHA-lista, äldst sist):**
- `144a063` - T42: copilot R5 trivial fixes (clear code on reset, comment typo) - HEAD
- `fdfda01` - T42: swallow refresh-rejection at onUpgraded call-site (copilot R4)
- `c5af408` - T42: copilot R3 fixes (refresh recovers error, inactive fail-safe)
- `42c1063` - T42: copilot R2 fixes (ensureSession race + AdminLogin done-state)
- `961418f` - T42: copilot R1 fixes (penalty-parse, reset busy, error wording)
- `bc92944` - T42: guard onUpgraded-signalen mot refresh-loop (reviewer F1)
- `b1debff` - Merge remote-tracking branch 'origin/develop' into feature/T42-global-facit
- `cb24cbb` - feat(admin): admin-läge + facit-inmatning + read-only för deltagare (#72)
- `08b6859` - style(data): normalisera src/data/index.ts till LF (EOL-churn, #72)
- `d5bd6e6` - feat(auth): admin-inloggning via e-post (anonym -> permanent, behåller user_id) (#72)
- `1ef339d` - feat(leaderboard): poängsätt mot GLOBAL facit i stället för per-rum (#72)
- `6e2096d` - feat(data): global facit-API + admin-status-API (#72)
- `a3a4a1a` - feat(db): global facit + admin-allowlist + RLS, bevisad med riktiga sessioner (#72)

**Vad som byggdes:**
- DB: `official_match_results` (global, ingen room_id) + `app_admins` (allowlist) + `is_app_admin()` SECURITY DEFINER. RLS: facit SELECT öppen, skriv bara admin, `updated_by=auth.uid()` bunden, app_admins ingen skriv-policy (ingen självbefordran). Bevisad 9/9 mot riktiga roller, rollback. Migrationer: 20260611140000/140100/140200.
- Auth: admin loggar in via e-post-OTP, uppgraderar SAMMA anonyma session (updateUser+verifyOtp), user_id + tips behålls. `src/data/rooms/admin-auth.ts`.
- Data: `src/data/official/` (official-results-api, app-admin-api).
- Poäng: topplista/avslöjande poängsätter nu mot GLOBALA facit. TeamCode-kontraktet (T16) orört. `src/features/leaderboard/use-leaderboard-data.ts`.
- Provider + UI: `src/features/official-results/OfficialResultsProvider.tsx`, `src/features/admin/` (AdminSection/AdminLogin/AdminResultEntry/use-admin-auth-flow/use-admin-matches).
- App.tsx: OfficialResultsProvider omsluter AppShell inuti RoomsProvider.

**Verifiering:** build ok, lint ok, format:check ok. 1162 tester gröna. Reviewer: PASS (säkerhetsmodellen verifierad mot live-DB). Copilot 5 rundor (R5 = 2 triviala nitar, inga strukturella/säkerhets-/dataintegritets-fynd).

**Reviewer-dispositioner (no-deferral):**
- F1 (refresh-loop): ÅTGÄRDAD (bc92944 + regressionstest)
- F2 (migration-versionsnamn skiljer från live): UTTRYCKLIGEN ACCEPTERAD - slut-state bevisat byte-identiskt mot live
- F3 (DB accepterar straff på gruppmatch, klient-validering avvisar): UTTRYCKLIGEN ACCEPTERAD - teoretisk, fail-safe, admin-only

**Alla 6/6 acceptanskriterier bockade i issue #72 (journalisten 2026-06-11).**
OBS: bockning i själva issue-kroppen nekades av auto-mode-classifier (docs-only, får inte redigera andras issues). Dirigenten bockar i GitHub-dashboarden efter att ha läst detta block.

**BEHÖVER DANIEL (dashboard, blockerar INTE merge men krävs för att han ska kunna logga in som admin och mata in kvällens resultat):**
1. E-postmall "Change email address" - lägg `{{ .Token }}` (Auth -> Email Templates). Krävs för att OTP-koden ska skickas korrekt.
2. Valfritt: konfigurera egen SMTP-avsändare.
3. Redirect-URL `https://vm-2026.pages.dev` (bara om magic-länk-vägen används).
Daniels admin-roll är redan seedat på hans user_id.

**PERSISTENS (verifierat, inga kodändringar behövdes):** tips/resultat överlever full stäng+återbesök. `persistSession:true` + `autoRefreshToken:true` (anon-identitet kvar) + T38 active-room-storage (rum kvar). Enda känd gräns: iOS ITP kan vräka localStorage efter ~7 dagars inaktivitet - ärligt flaggat, blockerar inte.

**NÄSTA PRE-SHARE-ARBETE (Daniels beslut, väntar med att dela tills detta är fixat):**

Daniel vill ha POÄNG-PRESENTATIONEN klar innan han delar appen. Det är mest wiring + UI, inte bygge från noll - kärnan finns redan.

1. **Match-poäng:** 3p exakt / 1p rätt vinnare / 0 miss (koden har detta, oförändrat).
2. **Special-tips (VIKTIG UPPTÄCKT - arbetet är wiring, inte nybygge):**
   - Poänglogiken finns redan i `src/data/predictions/bonus-score.ts` (T16): gruppvinnare 3p + grupptvåa 2p (=5p perfekt grupp), bracket-advance 1-5p stigande per runda, VM-vinnare 8p.
   - APIs finns: group-predictions-api.ts, bracket-predictions-api.ts.
   - Daniel vill SÄNKA VM-vinnaren till **20p** (koden har 8, ändra `CHAMPION_PREDICTION_POINTS` till 20).
   - Verifiera om pool-tips-UI (mata in grupp/bracket/champion-tips) finns eller behöver byggas.
   - Arbetet är wiring + UI + värde-justering.
3. **Resultat-presentation (Daniels exakta begäran):** varje match-tips ska visa poäng + VARFÖR ("Exakt resultat +3", "Rätt vinnare +1", "Miss 0"). En sammanfattning överst med användarens totala poäng + placering. Topplistan kvar längst ned.
   - Idag visar avslöjandet (reveal.ts/RevealView) bara en poängsiffra utan VARFÖR.

**Daniels citat:** "väntar med att dela detta tills det ovan är fixat" + "varje spel borde presentera resultat... sammanfattning överst av totala poäng och placering."

**PINNADE punkter (oförändrade, bär framåt):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping - editor flippar LF->CRLF (träffat T38+T39). Kort i Ready. HÖG-prioritet att avbryta mönstret.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bär framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort #48 i Ready.
- **#56 (delad modal-primitiv):** F4 från T32-panelen, rule-of-three ej nådd. Kort #56 i Ready.
- **KA-F4-notering:** bundle ~717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.

**"Behöver Daniel"-kö (uppdaterad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **BEFORDRAN 3 (senior-developer-mönstret):** `kommentar-pastar-exklusiv-vag-som-koden-inte-uppratthaller` Förekomst 3. Typ: agent-beteende -> senior-developers fil. Väntar Daniels godkännande. (Flaggas nu för första gången - se nedan.)
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go vid hemkomst.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T42 dashboard-steg:** se "Behöver Daniel" ovan (e-postmall + redirect-URL).

**IMPROVEMENTS-kandidater (dirigenten skriver i IMPROVEMENTS.md):**
1. "När en task medvetet pinnar konsument-seamen till en senare task, kräv att data-/identitets-KONTRAKTET skrivs där funktionen DEFINIERAS, inte bara i decisions.md." (F1-fällan: code-vs-id tyst noll hade hindrats av ett kontrakt vid definitions-stället.)
2. "Supabase deadline-lås + sekretess-RLS-mönstret (rls-tidslås-sekretess-mot-kallankrad-referenstabell) verifierat 3 gånger (T14/T15/T16) med 3 rena RLS-pass. Playbook-post nu på Förekomst 2 - nästa förekomst triggar Förekomst >= 3 och befordransregeln. Kandidat för senior-developer-rekommendation i README."

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta (semester) och har gett dirigenten full fullmakt hela vägen till slutet.
>
> Om PR #78 (T42/#72, feature/T42-global-facit) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 78 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #72 manuellt (`gh issue close 72`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #72 till Done på boarden. Bocka av alla 6 acceptanskriterier i issue #72 (journalisten nekades av auto-mode-classifier).
> Verifiera att vm-2026.pages.dev visar admin-sektionen bakom en diskret inloggning och att vanliga deltagare ser facit read-only.
>
> Om PR #78 REDAN mergad:
> T42 är klar och mergad. Global facit + admin-login levererade. Tävlingsintegriteten säkrad.
> **Nästa arbete: POÄNG-PRESENTATION (Daniels begäran, väntar med att dela tills detta är klart).**
> Special-tips-poänglogiken finns REDAN i `src/data/predictions/bonus-score.ts` (T16): gruppvinnare 3p + grupptvåa 2p, bracket-advance 1-5p, VM-vinnare 8p (ändra till 20p). APIs finns (group/bracket-predictions-api.ts). Arbetet är wiring + UI + värde-justering. Verifiera om pool-tips-UI (mata in grupp/bracket/champion-tips) finns eller behöver byggas.
> Resultat-presentation: varje match-tips ska visa poäng + VARFÖR ("Exakt resultat +3" / "Rätt vinnare +1" / "Miss 0"). Sammanfattning överst med total poäng + placering. Idag visar avslöjandet (reveal.ts/RevealView) bara en poängsiffra.
>
> **Prioritetsordning (pre-share-polish):**
> - Poäng-presentation (BLOCKERAR DELNING - Daniel väntar med att dela)
> - #76 (T45 admin-statistik + read-only-vy för vanliga)
> - #69 (T40 resultat-rätt-feedback på kortet + topplista synlig för alla)
> - #62 (T34 poängskala + "Så funkar poängen"-UI)
> - #63 (T35 tippnings-lås gråmarkerat + deadline-tydlighet)
> - #64 (T36 Play Protect TWA)
> - #70 (T41 .gitattributes EOL-housekeeping)
> - #48/#56 (plockas när de passar)
> - T18-T25 därefter
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **#48 (demo-chip a11y):** kort i Ready, plockas som liten task.
> - **#56 (delad modal-primitiv):** kort i Ready, plockas när rule-of-three nås.
> - **KA-F4-notering:** bundle ~717 kB - manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 3 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T42-dashboard-steg.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T43/#74 (PWA smidig auto-uppdatering + bygg-versionsstämpel) KLAR - PR #77 väntar på merge

**Branch:** `feature/T43-pwa-autoupdate` @ HEAD `a222ce0`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/77 mot `develop` (Closes #74, state: OPEN)
**Board:** issue #74 i "In Review" (korrekt). Dirigenten stänger issue #74 MANUELLT och flyttar kort #74 till Done EFTER merge.

**Autonomt läge:** Daniel borta (semester), dirigenten har fullmakt hela vägen till slutet.

**Varför T43 spelar roll:** Daniel rapporterade "man ser ju inte tippning delen alls längre efter senaste merge". Rotorsaken var Daniels enhets-cachade gamla PWA service worker. T43 är rotfixen: från och med nu får alla en "Ny version finns"-prompt, ingen fastnar på en gammal cache. Footern visar vilken build man kör. Daniel "väntar med att dela tills detta är fixat."

**KLART med bevis (SHA-lista, nyaste sist):**
- `40bdf8e` - test(predictions): paritetsguard, tips-vyn och resultatvyn delar samma fönster
- `94c4ee8` - feat(pwa): smidig SW-uppdaterings-prompt + bygg-version-stämpel (#74)
- `98a723a` - fix(pwa): no-op SW-registrerare vid injicerad api (#74, C1+C2)
- `280287a` - fix(pwa): logga misslyckad SW-registrering i stället för tyst svälj (#74, C3)
- `2830902` - fix(pwa): ta bort mellanslag före komma i SW-varningslogg (#74, C5)
- `c91eb3a` - T43: scope update-prompt live region to text block only (copilot R4)
- `a222ce0` - T43: updateApp() clears both prompt flags (copilot R5, HEAD)

**Vad som byggdes:**
- `registerType` bytt från `'autoUpdate'` till `'prompt'` (vite.config.ts): ny SW installeras men väntar, användaren väljer att ta i bruk.
- `src/features/app-settings/use-app-update.ts` - testbar hook med injicerbart register-API.
- `src/features/app-settings/register-sw.ts` - tunn seam till virtual:pwa-register, fail-loud vid registreringsfel.
- `src/features/app-settings/UpdatePrompt.tsx` - diskret "Ny version finns, ladda om"-banner (role=status/aria-live på textblocket).
- `src/pwa/build-info.ts` + `src/pwa/app-version.ts` + `src/components/VersionStamp.tsx` - bygg-SHA-stämpel (CF_PAGES_COMMIT_SHA -> git rev-parse -> "unknown"), versionsrad i footern (data-app-version).
- `src/features/predictions/predictions-results-window-parity.test.tsx` - regressionsguard: tips-vyn och resultatvyn delar samma 3-dagars fönster.
- Design-frontend EJ involverad: UpdatePrompt fick en funktionell/tillgänglig bas.

**Verifiering:** build ok, lint ok, format:check ok. 1109 gröna tester + 8 skippade (119 filer). Copilot 5 rundor (sista runda 1 trivial finding åtgärdad). Lokal panel: grön.

**Alla 3/3 acceptanskriterier bockade i issue #74** (journalisten 2026-06-11).

**Daniels delnings-läge (läget nu):**
- T39 klar: install-knappen funkar, döljs i app-läge, signatur länkas, tips-fönster klar
- T43 klar: ingen fastnar längre på gammal cache, footern visar build-SHA
- Kvar för att Daniel ska kunna dela: **T42 (#72) - global facit + admin-login** (se nedan)

**PINNADE punkter (oförändrade, bär framåt):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping - editor flippar LF->CRLF (träffat T38+T39). Kort i Ready. HÖG-prioritet att avbryta mönstret.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bär framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort #48 i Ready.
- **#56 (delad modal-primitiv):** F4 från T32-panelen, rule-of-three ej nådd. Kort #56 i Ready.
- **KA-F4-notering:** bundle ~717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go vid hemkomst.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.
- **T42 F1 (Supabase-dashboard):** Daniel måste göra 2 steg i Supabase-dashboarden INNAN admin-login funkar - (1) sätt e-postmallen till `{{ .Token }}`, (2) lägg till redirect-URLs. Dokumenteras i T42-handoff.

**IMPROVEMENTS-kandidater (dirigenten skriver i IMPROVEMENTS.md):**
1. "När en task medvetet pinnar konsument-seamen till en senare task, kräv att data-/identitets-KONTRAKTET skrivs där funktionen DEFINIERAS, inte bara i decisions.md." (F1-fällan: code-vs-id tyst noll hade hindrats av ett kontrakt vid definitions-stället.)
2. "Supabase deadline-lås + sekretess-RLS-mönstret (rls-tidslås-sekretess-mot-kallankrad-referenstabell) verifierat 3 gånger (T14/T15/T16) med 3 rena RLS-pass. Playbook-post nu på Förekomst 2 - nästa förekomst triggar Förekomst >= 3 och befordransregeln. Kandidat för senior-developer-rekommendation i README."

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta (semester) och har gett dirigenten full fullmakt hela vägen till slutet.
>
> Om PR #77 (T43/#74, feature/T43-pwa-autoupdate) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 77 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #74 manuellt (`gh issue close 74`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #74 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar en versionsrad i footern (data-app-version) med en SHA-sträng.
>
> Om PR #77 REDAN mergad:
> T43 är klar och mergad. PWA-uppdaterings-prompt + bygg-SHA-stämpel levererade. Ingen fastnar längre på gammal cache.
> **Nästa blockerare för att Daniel ska kunna dela: #72 (T42 - global facit + admin-login, TÄVLINGSINTEGRITET, HÖG-RISK RLS).**
> T42 är BYGGD men EJ mergad (finns redan på en branch). Behöver bredare review-panel + copilot-loop + merge + deploy.
> Rotorsak: alla rumsmedlemmar kan nu mata in/ändra facit - bara ägaren (Daniel/admin) ska kunna det.
> **F1 (Behöver Daniel FÖRE admin-login funkar):** Daniel måste göra 2 steg i Supabase-dashboarden:
>   1. Sätt e-postmallen till `{{ .Token }}` (magic-link OTP-format).
>   2. Lägg till redirect-URLs för magic-link-autentisering.
>   Dokumenteras i T42-handoff/issue. Daniel behöver T42 för att mata in kvällens matchresultat.
> **Därefter: #76 (T45 - admin-statistikverktyg + vanliga medlemmar ser bara facit).**
> Daniel vill ha T45 snart: admin ser alla rum + medlemmar + vem tippar bäst. Vanliga medlemmar utan sim = bara facit + 3-dagars matchlista, ingen inmatning utom i simuleringsläge.
> **Prioritetsordning (pre-share-polish):**
> - #72 (T42 ägar-facit, BLOCKERAR DELNING) - merga + deploy + F1 Supabase-steg
> - #76 (T45 admin-statistik + read-only-vy för vanliga) - Daniel vill ha snart
> - #69 (T40 resultat-rätt-feedback på kortet + topplista synlig för alla)
> - #62 (T34 poängskala + "Så funkar poängen"-UI)
> - #63 (T35 tippnings-lås gråmarkerat + deadline-tydlighet)
> - #64 (T36 Play Protect TWA)
> - #70 (T41 .gitattributes EOL-housekeeping)
> - #48/#56 (plockas när de passar)
> - T18-T25 därefter
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **#48 (demo-chip a11y):** kort i Ready, plockas som liten task.
> - **#56 (delad modal-primitiv):** kort i Ready, plockas när rule-of-three nås.
> - **KA-F4-notering:** bundle ~717 kB - manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 2 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut, T42-F1 Supabase-dashboard-steg.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T39/#68 (Install-fix + app-läge + hemsidelänk + tips-fönster) KLAR - PR #73 väntar på merge

**Branch:** `feature/T39-install-fix` @ HEAD `c7fab69`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/73 mot `develop` (Closes #68, state: OPEN)
**Board:** issue #68 i "In Review" (korrekt). Dirigenten stänger issue #68 MANUELLT och flyttar kort #68 till Done EFTER merge.

**Autonomt läge:** Daniel borta (semester), dirigenten har fullmakt hela vägen till slutet.

**KLART med bevis (SHA-lista, nyaste sist):**
- `dfa24fb` - fix(app-settings): fånga beforeinstallprompt före mount så install-knappen funkar (#68)
- `e5b4dd5` - fix(app-settings): gata fristående install-banner bakom onboarding-touren (#68)
- `3b33ecd` - feat(app): länka signatur-namnet till danielaldemir.com (#68)
- `e720cd6` - feat(predictions): 3-dagars fönster + expandera på tips-listan (#68)
- `0d0d24f` - fix(app): kommentar-sanning + test för footer-länkens tabnabbing-skydd (#68)
- `00112ce` - docs(t39): rätta kommentar-typo useSyncExternalStore (#68, Copilot)
- `2506761` - docs(onboarding): klargör att ownApi-hooken alltid anropas men bara är fallback (#68, Copilot)
- `c7fab69` - fix(predictions): memoize tips-fönstret på dag-granularitet, inte minut (HEAD)

**Verifiering:** 1045 gröna + 29 env-skippade (+33 nya). Lokal panel: 2 pass, inga fynd. Copilot 4 rundor (1->1->1->0, alla triviala kommentar/perf-fynd åtgärdade). Build/lint/format rent.

**Alla 5/5 acceptanskriterier bockade i issue #68** (journalisten 2026-06-11).

**Daniels delnings-läge (läget nu):**
- ewrmdt-rummet: 85 tips, data i molnet, rum-ID persisteras via localStorage (T38 klar)
- Signatur "Made by Daniel Aldemir" länkas till danielaldemir.com (T39 klar)
- Install-knappen funkar nu och döljs i standalone (T39 klar)
- Tips-fönstret (3 dagar) + expandera/kollaps på tips-listan (T39, täcker även #63:s fönster-del)
- Kvar för pre-share-polish: #72 (T42 ägar-facit), #69 (T40 topplista synlig), #62 (T34 poängskala)

**PINNADE punkter (oförändrade, bär framåt):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping - editor flippar LF->CRLF (träffat T38+T39). Kort i Ready. HÖG-prioritet att avbryta mönstret.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bär framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort #48 i Ready.
- **#56 (delad modal-primitiv):** F4 från T32-panelen, rule-of-three ej nådd. Kort #56 i Ready.
- **KA-F4-notering:** bundle ~717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go vid hemkomst.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.

**IMPROVEMENTS-kandidater (dirigenten skriver i IMPROVEMENTS.md):**
1. "När en task medvetet pinnar konsument-seamen till en senare task, kräv att data-/identitets-KONTRAKTET skrivs där funktionen DEFINIERAS, inte bara i decisions.md." (F1-fällan: code-vs-id tyst noll hade hindrats av ett kontrakt vid definitions-stället.)
2. "Supabase deadline-lås + sekretess-RLS-mönstret (rls-tidslås-sekretess-mot-kallankrad-referenstabell) verifierat 3 gånger (T14/T15/T16) med 3 rena RLS-pass. Playbook-post nu på Förekomst 2 - nästa förekomst triggar Förekomst >= 3 och befordransregeln. Kandidat för senior-developer-rekommendation i README."

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta (semester) och har gett dirigenten full fullmakt hela vägen till slutet.
>
> Om PR #73 (T39/#68, feature/T39-install-fix) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 73 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #68 manuellt (`gh issue close 68`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #68 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar install-knappen (funkar på Chrome), att knappen är dold i standalone-läge, och att signaturen Daniel Aldemir länkas till danielaldemir.com.
>
> Om PR #73 REDAN mergad:
> T39 är klar och mergad. Install-knappen funkar, döljs i app-läge, hemsidelänk klar, tips-fönster klar.
> **Nästa task: #72 (T42 ägar-styrt facit, TÄVLINGSINTEGRITET, HÖG-RISK RLS) - bredare review-panel krävs (RLS ändras).**
> Rotorsak: alla rumsmedlemmar kan nu mata in/ändra facit - bara ägaren ska kunna det. Ny migration: room_match_results INSERT/UPDATE/DELETE kräver rooms.created_by = auth.uid(). RLS-bevis med riktiga sessioner FORE klient-kod (playbook: rls-bevis-med-riktiga-sessioner-fore-klient-koden). UI: resultatinmatningen visas bara för ägaren, icke-ägare read-only med tydligt budskap.
> **Därefter i prioritetsordning (pre-share-polish):**
> - #69 (T40 resultat-rätt-feedback på kortet + topplista synlig för alla)
> - #62 (T34 poängskala + "Så funkar poängen"-UI)
> - #63 (T35 tippnings-lås gråmarkerat + deadline-tydlighet, fönster-delen klar i T39)
> - #64 (T36 Play Protect TWA)
> - #70 (T41 .gitattributes EOL-housekeeping, avbryter LF->CRLF-mönstret)
> - #48/#56 (plockas när de passar)
> - T18-T25 därefter
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **#48 (demo-chip a11y):** kort i Ready, plockas som liten task.
> - **#56 (delad modal-primitiv):** kort i Ready, plockas när rule-of-three nås.
> - **KA-F4-notering:** bundle ~717 kB - manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 2 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T38/#67 (Rum-persistens + signatur) KLAR - PR #71 väntar på merge

**Branch:** `feature/T38-pre-share` @ HEAD `4b8a330`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/71 mot `develop` (Closes #67, state: OPEN)
**Board:** issue #67 i "In Review" (korrekt). Dirigenten stänger issue #67 MANUELLT och flyttar kort #67 till Done EFTER merge.

**Autonomt läge:** Daniel borta (semester), dirigenten har fullmakt hela vägen till slutet.

**KLART med bevis (SHA-lista, nyaste sist):**
- `5633140` - feat(rooms): rum-persistens i localStorage (aktivt rum sparas + återställs, robust mot kastande storage och borttaget rum)
- `8760d40` - feat(app): "Made by Daniel Aldemir"-signatur i footern (diskret, estetisk)
- `541b8e9` - fix(a11y): a11y-fix för signatur
- `4b8a330` - fix(rooms): Copilot C1 script-fix (HEAD)

**Verifiering:** 1018 gröna + 29 env-skippade. Lokal panel: godkänd (rum-persistens probe:ad + negativ kontroll + live-verifierad, EOL-housekeeping pinnat som egen task #70). Copilot 2 rundor (1 -> 0). Build/lint/format rent.

**Alla 6/6 acceptanskriterier bockade i issue #67** (journalisten 2026-06-11).

**Daniels delnings-läge (verifierat tryggt):**
- ewrmdt-rummet: 85 tips, data i molnet, rum-ID bevaras nu via localStorage
- Daniels visningsnamn "Daniel Aldemir" - DB-fixat separat
- Identitet stabil per enhet (persistSession på, anon-auth OK)
- T37 (lagstorlek) - STÄNGD/SKIPPAD (kort-utrymme vann)

**PINNADE punkter (oförändrade, bär framåt):**
- **#70 (T41 .gitattributes EOL):** EOL-housekeeping pinnades av lokal panel, kort i Ready.
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17, bär framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort #48 i Ready.
- **#56 (delad modal-primitiv):** F4 från T32-panelen, rule-of-three ej nådd. Kort #56 i Ready.
- **KA-F4-notering:** bundle ~717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go vid hemkomst.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.

**IMPROVEMENTS-kandidater (dirigenten skriver i IMPROVEMENTS.md):**
1. "När en task medvetet pinnar konsument-seamen till en senare task, kräv att data-/identitets-KONTRAKTET skrivs där funktionen DEFINIERAS, inte bara i decisions.md." (F1-fällan: code-vs-id tyst noll hade hindrats av ett kontrakt vid definitions-stället.)
2. "Supabase deadline-lås + sekretess-RLS-mönstret (rls-tidslås-sekretess-mot-kallankrad-referenstabell) verifierat 3 gånger (T14/T15/T16) med 3 rena RLS-pass. Playbook-post nu på Förekomst 2 - nästa förekomst triggar Förekomst >= 3 och befordransregeln. Kandidat för senior-developer-rekommendation i README."

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta (semester) och har gett dirigenten full fullmakt hela vägen till slutet.
>
> Om PR #71 (T38/#67, feature/T38-pre-share) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 71 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #67 manuellt (`gh issue close 67`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #67 till Done på boarden.
> Verifiera att vm-2026.pages.dev bevarar rum-valet vid sidladdning och visar "Made by Daniel Aldemir"-signaturen i footern.
>
> Om PR #71 REDAN mergad:
> T38 är klar och mergad. Rum-persistens + signatur levererade. Daniel kan nu dela appen.
> **Nästa task: #68 (T39, install-knappen funkar + döljs i app-läge) - BLOCKERAR Daniels delning.**
> Rotorsaka varför install-knappen inte triggar prompten (deferredPrompt-flöde), dölj affordansen i standalone-läge, verifiera live. Se issue #68 för fullständigt scope.
> **Därefter i prioritetsordning:**
> - #69 (T40 resultat-rätt-feedback på kortet + topplista synlig)
> - #62 (T34 poängskala + "Så funkar poängen"-UI)
> - #63 (T35 tippnings-lås/fönster/deadline)
> - #64 (T36 Play Protect TWA)
> - #70 (T41 .gitattributes EOL-housekeeping)
> - #48/#56 (plockas när de passar)
> - T18-T25 därefter
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **#48 (demo-chip a11y):** kort i Ready, plockas som liten task.
> - **#56 (delad modal-primitiv):** kort i Ready, plockas när rule-of-three nås.
> - **KA-F4-notering:** bundle ~717 kB - manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 2 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T17/#17 (Topplista + tips-avslöjande) KLAR - PR #66 väntar på merge

**Branch:** `feature/T17-topplista` @ HEAD `2702e6e`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/66 mot `develop` (Closes #17, state: OPEN)
**Board:** issue #17 i "In Review" (korrekt). Dirigenten stänger issue #17 MANUELLT och flyttar kort #17 till Done EFTER merge.

**Autonomt läge:** Daniel borta (semester), dirigenten har fullmakt hela vägen till slutet.

**VM-POOLEN KOMPLETT:** Match-tips (T15) + grupp- och bracket-tips (T16) + bracket-tips-UI (T16b) + topplista/avslöjande (T17) är alla klara.

**KLART med bevis (SHA-lista, nyaste sist):**
- Bygge + tester: se PR #66 (+53 nya tester, 1011 gröna + 29 env-skippade)
- `70996da` - fix: Copilot runda 1 (C1 slutspelsmatchers tips poängsattes inte + C2 sr-only-komma)
- `2702e6e` - fix: Copilot runda 2 + 3 (C3 rank-puls-flagga nollas + C4 test-dubbelrender), runda 3 = 0 fynd (HEAD)

**Verifiering:** 1011 gröna + 29 env-skippade. Lokal panel: NOLL fynd (code-vs-id-seamen probe:ad + mutationstestad). Copilot 3 rundor (äkta bug C1 + C2/C3/C4 åtgärdade, runda 3 ren). Build/lint/format rent.

**Alla 5/5 acceptanskriterier bockade i issue #17** (journalisten 2026-06-11).

**PIN - RUM-PERSISTENS (KOMMANDE task, Daniels kritiska UX-bug):**
Aktivt rum sparas INTE i localStorage - vid sidladdning/refresh försvinner rum-valet. Symtom: members=0 visas trots att man är med i rummet. `create_room` gör skaparen till DB-medlem, men rum-ID:t persisteras inte lokalt. Fix: spara valt rum-ID i localStorage, auto-välj vid app-start om rum fortfarande finns (RPC-koll), rensa vid explicit lämna-rum. Inga ändringar i RLS/DB behövs. Dirigenten bygger denna som nästa task.

**PINNADE punkter (oförändrade, bär framåt):**
- **code-vs-id branded TeamCode-kontraktet:** strukturellt stängt i T17 (derive-facit.ts mappar id->TeamCode fail-loud). Bär framåt som konvention.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort #48 i Ready.
- **#56 (delad modal-primitiv):** F4 från T32-panelen, rule-of-three ej nådd. Kort #56 i Ready.
- **KA-F4-notering:** bundle ~717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go vid hemkomst.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.

**IMPROVEMENTS-kandidater (dirigenten skriver i IMPROVEMENTS.md):**
1. "När en task medvetet pinnar konsument-seamen till en senare task, kräv att data-/identitets-KONTRAKTET skrivs där funktionen DEFINIERAS, inte bara i decisions.md." (F1-fällan: code-vs-id tyst noll hade hindrats av ett kontrakt vid definitions-stället.)
2. "Supabase deadline-lås + sekretess-RLS-mönstret (rls-tidslås-sekretess-mot-kallankrad-referenstabell) verifierat 3 gånger (T14/T15/T16) med 3 rena RLS-pass. Playbook-post nu på Förekomst 2 - nästa förekomst triggar Förekomst >= 3 och befordransregeln. Kandidat för senior-developer-rekommendation i README."

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta (semester) och har gett dirigenten full fullmakt hela vägen till slutet.
>
> Om PR #66 (T17/#17, feature/T17-topplista) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 66 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #17 manuellt (`gh issue close 17`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #17 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar topplistan med poäng, placeringsanimation och tips-avslöjande.
>
> Om PR #66 REDAN mergad:
> T17 är klar och mergad. VM-poolen komplett (T15 + T16 + T16b + T17).
> **Nästa task: RUM-PERSISTENS** - Daniels kritiska UX-bug. Aktivt rum-ID persisteras inte i localStorage, rum-val försvinner vid sidladdning (members=0). Bygg: (1) spara valt rum-ID i localStorage vid val/skapa/gå-med, (2) auto-välj vid app-start om rum-ID finns i localStorage och rummet fortfarande finns (RPC-koll mot Supabase), (3) rensa localStorage vid explicit lämna-rum. Inga RLS/DB-ändringar behövs.
> **Därefter (Daniels prioriterade kö, i ordning):**
> - #62 (T34 poängsystem-UI: Daniels låsta skala 10p exakt/3p utfall/5p grupp/50p VM-vinnare + "Så funkar poängen"-panel)
> - #65 (T37 större lag på match-korten)
> - #63 (T35 tippnings-lås gråmarkerat + 3-dagars fönster + deadline-tydlighet)
> - #64 (T36 Play Protect TWA-väg)
> - T18-T25 därefter
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **#48 (demo-chip a11y):** kort i Ready, plockas som liten task.
> - **#56 (delad modal-primitiv):** kort i Ready, plockas när rule-of-three nås.
> - **KA-F4-notering:** bundle ~717 kB - manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 2 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T16b/#59 (Bracket-tips-UI) KLAR - PR #61 väntar på merge

**Branch:** `feature/T16b-bracket-tips-ui` @ HEAD `47b9881`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/61 mot `develop` (Closes #59, state: OPEN)
**Board:** issue #59 i "In Review" (korrekt). Dirigenten stänger issue #59 MANUELLT och flyttar kort #59 till Done EFTER merge.

**Autonomt läge:** Daniel borta (semester), dirigenten har fullmakt hela vägen till slutet.

**VM-poolen KOMPLETT:** Grupp-tips (T16) + match-tips (T15) + bracket-tips (T16b) är nu alla klara. Nästa task: T17 (#17, topplista + tips-avslöjande).

**KLART med bevis (SHA-lista, nyaste sist):**
- `a79fb9f` - feat(tips): T16b bracket-tips-UI + provider + 30 tester (#59, bygge)
- `a7f871f` - design: champion-hero + slot-kupong (#59)
- `c4bfd97` - fix(tips): legend a11y (Copilot runda 1, #59)
- `47b9881` - fix(tips): champion-anim + last-dampning (Copilot runda 2, HEAD)

**Verifiering:** 953 tester gröna + 29 env-skippade (+30 nya). Lokal panel: godkänd (1 avvisad nit, code-vs-id-seamen verifierad airtight via negativ kontroll). Copilot 3 rundor (1->2->0). Build/lint/format rent. Datakärnan/RLS oförändrad sedan T16.

**Alla 5/5 acceptanskriterier bockade i issue #59** (journalisten 2026-06-11).

**PINNADE punkter (oförändrade, bär framåt):**
- **code-vs-id branded TeamCode-kontraktet:** `TeamCode` (branded type) måste användas genomgående i T17 och framåt. T17 konsumerar scorePrediction + bonus-score + list-API:erna och härleder faktiskt utfall ur standings/deriveBracket - ALLA lookups måste använda TeamCode, aldrig rå strängar. Kontraktet definieras i bracket_predictions-API:t.
- **Sekretess-avslöjande:** andras tips visas FÖRST efter deadline. RLS sköter det (bevisad i T16), T17:s UI visar dem vid rätt tillfälle.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort #48 i Ready.
- **#56 (delad modal-primitiv):** F4 från T32-panelen, rule-of-three ej nådd. Kort #56 i Ready.
- **KA-F4-notering:** bundle ~717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go vid hemkomst.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.

**IMPROVEMENTS-kandidater (dirigenten skriver i IMPROVEMENTS.md):**
1. "När en task medvetet pinnar konsument-seamen till en senare task, kräv att data-/identitets-KONTRAKTET skrivs där funktionen DEFINIERAS, inte bara i decisions.md." (F1-fällan: code-vs-id tyst noll hade hindrats av ett kontrakt vid definitions-stället.)
2. "Supabase deadline-lås + sekretess-RLS-mönstret (rls-tidslås-sekretess-mot-kallankrad-referenstabell) verifierat 3 gånger (T14/T15/T16) med 3 rena RLS-pass. Playbook-post nu på Förekomst 2 - nästa förekomst triggar Förekomst >= 3 och befordransregeln. Kandidat för senior-developer-rekommendation i README."

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta (semester) och har gett dirigenten full fullmakt hela vägen till slutet.
>
> Om PR #61 (T16b/#59, feature/T16b-bracket-tips-ui) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 61 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #59 manuellt (`gh issue close 59`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #59 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar bracket-tips-kupong med champion-hero, slot-kupong, deadline-lås och att bracket-tips sparas i rum-läge.
>
> Om PR #61 REDAN mergad:
> T16b är klar och mergad. VM-poolen är komplett (grupp-tips T16 + match-tips T15 + bracket-tips T16b).
> **Nästa task: T17 (#17, topplista + tips-avslöjande)** - konsumerar scorePrediction (T15) + bonus-score (T16/T16b) + list-API:erna, härleder faktiskt utfall ur standings/deriveBracket.
> **HARD-pin:** använd TeamCode-typen genomgående - code-vs-id-tyst-noll får INTE återintroduceras vid poäng-aggregeringen.
> Sekretess-avslöjandet: andras tips visas FÖRST efter deadline (RLS sköter det, T17:s UI visar dem).
> Se issue #17 för fullständigt scope.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **#48 (demo-chip a11y):** kort i Ready, plockas som liten task.
> - **#56 (delad modal-primitiv):** kort i Ready, plockas när rule-of-three nås.
> - **KA-F4-notering:** bundle ~717 kB - manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 2 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T16/#16 (Grupp- och slutspels-tips datakärna) KLAR - PR #60 väntar på merge

**Branch:** `feature/T16-bracket-tips` @ HEAD `3a987a6`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/60 mot `develop` (Closes #16, state: OPEN)
**Board:** issue #16 i "In Review" (korrekt). Dirigenten stänger issue #16 MANUELLT och flyttar kort #16 till Done EFTER merge.

**Autonomt läge:** Daniel borta (semester), dirigenten har fullmakt hela vägen till slutet.

**KLART med bevis (SHA-lista, nyaste sist):**
- `f1e7fa2` - feat(tips): bracket-tips-datakärna + grupp-tips-UI + poäng (#16, bygge start)
- `fcbed60` - feat(tips): fortsättning bygge (#16)
- `fa569f0` - feat(tips): slutför datakärna-bygge (#16)
- `a6ce777` - feat(tips): fler tester (#16)
- `a5e5294` - design: premium-finish bracket-tips (#16)
- `692a8af` - design: bracket-tips-panel (#16)
- `29dff7a` - fix(tips): F1 code-vs-id robust panel-fix (#16, Copilot runda 1)
- `ba617b3` - fix(tips): F2/F3 panel-fix (#16, Copilot runda 2)
- `3dbb63b` - fix(tips): C1/C2 branded TeamCode (#16, Copilot runda 3)
- `d64985c` - fix(tips): C3 README (#16, Copilot runda 3 forts.)
- `3a987a6` - fix(tips): C4 typimport (#16, HEAD)

**Verifiering:** 923 tester gröna + 29 env-skippade. Bredare panel (2 linser): säkerhet NOLL fynd (3:e rena RLS-pass), korrekthet fångade F1 (kritisk latent code-vs-id tyst-noll, fixad strukturellt via branded TeamCode). Copilot 4 rundor (2->1->1->0). Build/lint/format rent.

**Alla 4/4 acceptanskriterier bockade i issue #16** (journalisten 2026-06-11).

**Viktigt scopebesked:**
- **Bracket-tips-UI (T16b, #59, Ready):** T16 levererade HELA datakärnan + API + poäng för både grupp och bracket. Grupp-tips-UI fullt. Bracket-tips-UI pinnades till T16b (#59) för att inte leverera halvfärdig vy. Issue #16:s acceptanskriterier uppdaterade av journalisten (bracket-UI = T16b).

**PINNADE punkter (oförändrade, bär framåt):**
- **code-vs-id branded TeamCode-kontraktet:** `TeamCode` (branded type) måste användas genomgående i T17 och framåt. T17 konsumerar scorePrediction + bonus-score + list-API:erna och härleder faktiskt utfall ur standings/deriveBracket - ALLA lookups måste använda TeamCode, aldrig rå strängar. Kontraktet definieras i bracket_predictions-API:t.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort #48 i Ready.
- **#56 (delad modal-primitiv):** F4 från T32-panelen, rule-of-three ej nådd. Kort #56 i Ready.
- **KA-F4-notering:** bundle ~717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go vid hemkomst.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.

**IMPROVEMENTS-kandidater (dirigenten skriver i IMPROVEMENTS.md):**
1. "När en task medvetet pinnar konsument-seamen till en senare task, kräv att data-/identitets-KONTRAKTET skrivs där funktionen DEFINIERAS, inte bara i decisions.md." (F1-fällan: code-vs-id tyst noll hade hindrats av ett kontrakt vid definitions-stället.)
2. "Supabase deadline-lås + sekretess-RLS-mönstret (rls-tidslås-sekretess-mot-kallankrad-referenstabell) verifierat 3 gånger (T14/T15/T16) med 3 rena RLS-pass. Playbook-post nu på Förekomst 2 - nästa förekomst triggar Förekomst >= 3 och befordransregeln. Kandidat för senior-developer-rekommendation i README."

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta (semester) och har gett dirigenten full fullmakt hela vägen till slutet.
>
> Om PR #60 (T16/#16, feature/T16-bracket-tips) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 60 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #16 manuellt (`gh issue close 16`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #16 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar grupp-tips-kupong med deadline-lås och att poängberäkning för gruppvinnare fungerar.
>
> Om PR #60 REDAN mergad:
> T16 är klar och mergad. Plocka nästa task.
> **Nästa task: T16b (#59, bracket-tips-UI)** - datakärnan + API + poäng finns (T16), bygg den interaktiva bracket-tips-vyn ovanpå T9:s BracketView. Välj avancerande lag per slutspels-slot (M73-M104) + VM-vinnare-väljare, deadline-lås per match, sekretess-RLS, stale-request-vakt (epoch-mönster från PredictionsProvider C14). Se issue #59 för fullständigt scope.
> **KRITISK PIN (T16b och T17):** Använd branded `TeamCode`-typen genomgående - kontraktet definieras i bracket_predictions-API:t. Rå strängar = tyst noll i lookups (F1-fällan i T16). T17 konsumerar scorePrediction/bonus-score + list-API:erna, härleder faktiskt utfall ur standings/deriveBracket - ALLA lookups måste använda TeamCode.
> **Kö oförändrad + #48/#56** (plockas när de passar).
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **#48 (demo-chip a11y):** kort i Ready, plockas som liten task.
> - **#56 (delad modal-primitiv):** kort i Ready, plockas när rule-of-three nås.
> - **KA-F4-notering:** bundle ~717 kB - manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 2 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-11 , T15/#15 (Tips-motor) KLAR - PR #58 väntar på merge

**Branch:** `feature/T15-tips-motor` @ HEAD `2aa2a34`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/58 mot `develop` (Closes #15, state: OPEN)
**Board:** issue #15 i "In Review" (korrekt). Dirigenten stänger issue #15 MANUELLT och flyttar kort #15 till Done EFTER merge.

**Autonomt läge:** Daniel borta (semester), dirigenten har fullmakt hela vägen till slutet.

**KLART med bevis (SHA-lista, nyaste sist):**
- `a402a02` - feat(tips): tips-motor - DB-schema + RLS + tips-UI + poangberakning (#15, bygge)
- `e2f0367` - feat(tips): fortsattning bygge (#15)
- `68729fc` - feat(tips): slutfor tips-motor-bygge (#15)
- `2b9c241` - feat(tips): fler tester och fixar (#15)
- `0cbed91` - design: premium-finish tips-UI (#15)
- `cfef6ae` - fix(tips): C1 deadline-tick-granularitet + C2 (#15, Copilot runda 1)
- `eedd15d` - fix(tips): C3-C6 plural/fail-loud/docstring (#15, Copilot runda 2)
- `871b381` - fix(tips): C7-C9 typer (#15, Copilot runda 3)
- `133eb14` - fix(tips): C10-C13 redundanta index/visibilitychange/precision/RLS-test (#15, Copilot runda 4)
- `d2c03f9` - fix(tips): C14 stale-token-vakt i savePrediction (#15, Copilot runda 5)
- `8b00293` - fix(tips): kommentar-typo-stad (#15, Copilot runda 6)
- `2aa2a34` - fix(tips): kommentar-typo-stad del 2 (#15, HEAD)

**Verifiering:** 862 tester gröna + 20 env-skippade (+54 nya). Bredare panel (2 oberoende linser, hög-risk): NOLL fynd - korrekthets-linsen + säkerhets-linsen (RLS adversariellt verifierat, referenstabellen read-only bevisad, SECURITY DEFINER härdad, inga advisor-ERROR). Build/lint/format rent.

**Copilot-loop: 6 rundor** (över skillens max-5). Alla fynd genuina och åtgärdade, inga återkommande. Trenden: 2 -> 4 -> 3 -> 4 -> 1 -> 2. C14 (runda 5) var ett äkta dataintegritets-race (stale-token vid rumsbyte under spar, samma mönster som T14 KA-F2). Dirigenten bedömde att merga med ett känt dataintegritets-race vore sämre än att överskrida processgränsen - NOTERA detta som ett observerat mönster, se IMPROVEMENTS-kandidaten nedan.

**Alla 4/4 acceptanskriterier bockade i issue #15** (journalisten 2026-06-11).

**PINNADE punkter (oförändrade, bär framåt):**
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort #48 i Ready.
- **#56 (delad modal-primitiv):** F4 från T32-panelen, rule-of-three ej nådd. Kort #56 i Ready.
- **KA-F4-notering:** bundle ~717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go vid hemkomst.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.

**IMPROVEMENTS-kandidat (dirigenten skriver i IMPROVEMENTS.md):**
Stora data/RLS-tasks med många rörliga delar (match_kickoffs-referenstabell, 3 RLS-policyer, sekretess-fönster, poängberäkning) genererade 6 Copilot-rundor (max-5 i skillen). Alla fynd genuina men ofta pedantiska nits (plural-stavningar, docstring-format). Förslag: för hög-risk-data-tasks: tillåt upp till 7 rundor, ELLER inför en "gruppera-triviala-nits"-strategi i Copilot-loopen så varje runda handskas med nits i bunt och de substantiella fynden (C14-race) inte dunklas av mängden.

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta (semester) och har gett dirigenten full fullmakt hela vägen till slutet.
>
> Om PR #58 (T15/#15, feature/T15-tips-motor) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 58 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #15 manuellt (`gh issue close 15`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #15 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar tips-kupong med deadline-lås och att poängberäkning fungerar.
>
> Om PR #58 REDAN mergad:
> T15 är klar och mergad. Plocka nästa task.
> **Nästa task: T16 (#16, slutspels- och gruppvinnar-tips)** - bygger på T15:s scorePrediction + sekretess-RLS. Därefter T17 (topplista, avslöjar tips via samma RLS). Se issue #16 för fullständigt scope.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **#48 (demo-chip a11y):** kort i Ready, plockas som liten task.
> - **#56 (delad modal-primitiv):** kort i Ready, plockas när rule-of-three nås.
> - **KA-F4-notering:** bundle ~717 kB - manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 2 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-10 , T32/#54 (Daniels feedback 4) KLAR - PR #57 väntar på merge

**Branch:** `feature/T32-feedback4` @ HEAD `e6c8a4e`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/57 mot `develop` (Closes #54, state: OPEN)
**Board:** issue #54 i "In Review" (korrekt). Dirigenten stänger issue #54 MANUELLT och flyttar kort #54 till Done EFTER merge.

**Autonomt läge:** Daniel borta (semester), dirigenten har fullmakt hela vägen till slutet.

**KLART med bevis (SHA-lista, nyaste sist):**
- `e5d9714` - fix(settings): portalerar inställningspanelen till body, fixar bakom-sidan-bugg (#54, backdrop-filter+sticky rotorsak källhänvisad)
- `223ab69` - refactor(app): flytta sim-kontrollen till resultatinmatningen (#54)
- `8934713` - fix(daily): hero-etikett visar matchens datum när matchen inte är idag (#54)
- `a9c3c45` - test(daily): robusta delsträngs-assertioner mot ICU-flakighet (#54)
- `3e08ecb` - fix(daily): highlight-chip följer hero-etiketten, ingen UI-krock (#54)
- `e6c8a4e` - Rätta felaktig kommentar om MatchCard-rotens element

**Verifiering:** 798 tester gröna + 12 env-skippade. Panel: F1-F3 godkända, F4 (delad modal-primitiv, rule-of-three) -> ny task #56 på boarden Ready. Copilot: 4 rundor (2->1->1->0). Build/lint/format rent.

**Alla 4/4 acceptanskriterier bockade i issue #54** (journalisten 2026-06-10).

**PINNADE punkter (oförändrade, bär framåt):**
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort #48 i Ready.
- **#56 (delad modal-primitiv):** F4 från T32-panelen, rule-of-three ej nådd. Kort #56 i Ready.
- **KA-F4-notering:** bundle ~717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go vid hemkomst.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta (semester) och har gett dirigenten full fullmakt hela vägen till slutet.
>
> Om PR #57 (T32/#54, feature/T32-feedback4) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 57 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #54 manuellt (`gh issue close 54`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #54 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar inställningspanelen OVANPÅ allt innehåll (båda teman, mobil + desktop), att sim-kontrollen sitter vid resultatinmatningen, och att hero-etiketten visar datum (inte "DAGENS MATCH") för matcher som inte är idag.
>
> Om PR #57 REDAN mergad:
> T32 är klar och mergad. Plocka nästa task.
> **Nästa task: T15 (#15, tips-motorn - kärnan i Fas 2!)** - tips-lagret med topplista. Därefter T16-T25 (T26 skippad, stängd not planned). #48 och #56 vävs in där de passar.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **#48 (demo-chip a11y):** kort i Ready, plockas som liten task.
> - **#56 (delad modal-primitiv):** kort i Ready, plockas när rule-of-three nås (3:e dialog-use-case).
> - **KA-F4-notering:** bundle ~717 kB - manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 2 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-10 , T30/#50 (Play Protect-varning) KLAR - PR #55 väntar på merge

**Branch:** `feature/T30-play-protect` @ HEAD `5f16405`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/55 mot `develop` (Closes #50, state: OPEN)
**Board:** issue #50 i "In Review" (korrekt). Dirigenten stänger issue #50 MANUELLT och flyttar kort #50 till Done EFTER merge.

**Autonomt läge:** Daniel borta (semester), dirigenten har fullmakt hela vägen till slutet.

**KLART med bevis (SHA-lista, nyaste sist):**
- `927a056` - fix(results): rätta typfel i LiveMatch-fixture (build-blockerare, sidofix)
- `70f6c68` - feat(pwa): härda WebAPK-manifest + ärlig Play Protect-rad (#50, manifest-modul + id + not + källankrad rotorsak)
- `cab9c4e` - test(pwa): gör ikon-storleksparsning W3C-spec-trogen (#50, C1 C2)
- `9b51832` - fix(T30): strikt parseSizes-validering i app-manifest-test (#50, C3)
- `5f16405` - fix(pwa): gate:a Play Protect-noten på Android-UA (#50, C4 C5)

**Verifiering:** 792 tester gröna + 12 env-skippade. Panel: godkänd, alla källor WebFetch-verifierade mot primärkälla, en nit avvisad. Copilot: 4 rundor (2→1→2→0). Build/lint/format rent.

**Rotorsak (dokumenterad, källhänvisad):** WebAPK targetSdk sätts av webbläsarleverantören (Chrome/Samsung Internet) vid WebAPK-mintning och ligger utanför vår kontroll. Vi har härdad manifest (id, scope, display-override, maskable-ikoner) och en ärlig UX-rad (Android-gatad) som förklarar läget för användaren. Beslut + källhänvisningar i decisions.md.

**Alla 4/4 acceptanskriterier bockade i issue #50** (journalisten 2026-06-10).

**PINNADE punkter (oförändrade, bär framåt):**
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e.
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort #48 i Ready.
- **KA-F4-notering:** bundle ~717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go vid hemkomst.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta (semester) och har gett dirigenten full fullmakt hela vägen till slutet.
>
> Om PR #55 (T30/#50, feature/T30-play-protect) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 55 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #50 manuellt (`gh issue close 50`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #50 till Done på boarden.
> Verifiera att vm-2026.pages.dev har uppdaterad manifest (kontrollera Application-fliken i DevTools) och att Android-noten syns i installationsflödet på en Android-enhet eller via UA-override.
>
> Om PR #55 REDAN mergad:
> T30 är klar och mergad. Plocka nästa task.
> **Nästa task: #54 (T32, Daniels feedback 4)** - inställnings-z-index-buggen (dialog hamnar bakom sidan), simulerings-bannern placeras vid resultatinmatningen, hero-etiketten visar datum i stället för "DAGENS MATCH" när matchen inte är idag. Se issue #54 för fullständigt scope. Därefter T15 (tips-motorn), sedan T25 (T26 DR-webb-inbäddning skippad, stängd not planned).
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **#48 (demo-chip a11y):** kort i Ready, plockas som liten task.
> - **KA-F4-notering:** bundle ~717 kB - manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 2 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-10 , T31/#51 (Showcasen bort + auto-spelad) KLAR - PR #53 väntar på merge

**Branch:** `feature/T31-feedback3` @ HEAD `7cd8bd7`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/53 mot `develop` (Closes #51, state: OPEN)
**Board:** issue #51 i "In Review" (korrekt). Dirigenten stänger issue #51 MANUELLT och flyttar kort #51 till Done EFTER merge.

**Autonomt läge:** Daniel borta (semester/flyg), dirigenten har fullmakt hela vägen till slutet.

**KLART med bevis (SHA-lista, nyaste sist):**
- `3a9bf13` - feat(app): ta bort designfundament-showcase (Paletten/Rörelsen/Typografi + föräldralösa komponenter borttagna, tema-toggle kvar, footer-prosa ersatt)
- `13942cb` - feat(results): auto-spelad vid spara + Rensa-knapp (statusväljaren borttagen, `intendedStatus` härleder status ur målfälten)
- `022de57` - docs(panel): F1-kommentar-sanning (panel-fynd: felaktig kommentar i resultats-formulär rättad)
- `7cd8bd7` - fix(copilot-C1): bevarar live-status vid Rensa (Copilot runda 1, C2 avvisad husstils-kommat)

**Verifiering:** 782 tester gröna + 12 env-skippade (+4 nya), build/lint/format rent. Panel: 1 fynd (F1 kommentar-lögn) åtgärdat. Copilot: 2 rundor (2 fynd -> 0, C2 avvisad). T9:s straffvalidering, T12:s sim-läge och T14:s rum-väg orörda.

**Alla 5/5 acceptanskriterier bockade i issue #51** (journalisten 2026-06-10).

**PINNADE punkter (oförändrade, bär framåt):**
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e (YAGNI).
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort #48 i Ready.
- **KA-F4-notering:** bundle ~717 kB - lägg till manualChunks om LCP-problem uppstår.
- **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser T22: kräver Apple/Google Developer-konton.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` Förekomst 3. Typ: korsar agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` Förekomst 3. Typ: agent-beteende -> journalistens fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - uppdatering om Daniel vill: ändra rank-värden + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go vid hemkomst.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista.

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta (semester) och har gett dirigenten full fullmakt hela vägen till slutet.
>
> Om PR #53 (T31/#51, feature/T31-feedback3) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 53 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #51 manuellt (`gh issue close 51`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #51 till Done på boarden.
> Verifiera att vm-2026.pages.dev INTE visar "Designfundament"-sektionen, och att spara ett resultat med ifyllda mål direkt sätter status "spelad" utan manuell statusväljare.
>
> Om PR #53 REDAN mergad:
> T31 är klar och mergad. Plocka nästa task.
> **Nästa task: #50 (T30, Play Protect-varningen vid Android-install)** - research-task: undersök varför Android visar "Play Protect-varning" vid installation av APK/PWA, dokumentera orsak och rekommenderad åtgärd med web-källor. Därefter T15 (tips-motorn), sedan T25 (T26 DR-webb-inbäddning skippad, stängd not planned).
>
> PR #52 (T14/#14, feature/T14-supabase-live) kan också vara öppen och oamerged - om den fortfarande är OPEN: merga den FÖRE T30 (`gh pr merge 52 --merge`), stäng issue #14 manuellt.
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **#48 (demo-chip a11y):** kort i Ready, plockas som liten task.
> - **KA-F4-notering:** bundle ~717 kB - manualChunks om LCP-problem.
> - **SA3-notering:** UUID = kapabilitet, accepterat.
> - **"Behöver Daniel"-kö:** push-notiser (T22), 2 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-10 , T14/#14 (Supabase live + auth + RLS + rumskod) KLAR - FAS 2 IGÅNG - PR #52 väntar på merge

**Branch:** `feature/T14-supabase-live` @ HEAD `bfc05a9`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/52 mot `develop` (Closes #14, state: OPEN)
**Board:** issue #14 i "In Review" (korrekt). Dirigenten stänger issue #14 MANUELLT och flyttar kort #14 till Done EFTER merge.

**Autonomt läge:** Daniel borta (semester/flyg), dirigenten har fullmakt hela vägen till slutet.

**--- FAS 2 IGÅNG ---**
T14 är klar och PR #52 väntar merge. Fas 1 (T1-T13 + hotfix + T27/#39 + T28/#42 + T4b) mergad dessförinnan. Nästa tasks: #50 (T30 Play Protect) + #51 (T31) FÖRE T15. Därefter T15->T25 i tur och ordning (T26 DR-webb-inbäddning skippad, stängd not planned - hemsidan hinner inte bli klar under VM).

**KLART med bevis (SHA-lista, nyaste sist):**
- `c4cfdfc` - feat(supabase): schema + RLS + RPC (Supabase-schema, RLS-policies per auth.uid()+rum, RPC-funktion)
- `e6f2660` - feat(live): live-klient + auth-flöde + LIVE_READY-flip (env-gating live, anon-auth, rumskod)
- `8b08bb2` - feat(rooms): rum-UI + realtidssynk (rumskod-UI, Realtime-kanal, online-seam kopplad)
- `bb85e92` - docs (decisions.md + patterns.md)
- `0ccef05` - design: kod-biljett-komponent + avatarer (design-frontend premium-finish)
- `7f11eab` + `f82a202` + `78166f4` + `055540e` - panel (KA-F1..F4 + SA1..SA4 ataerdade, saveResult wirat end-to-end)
- `5dcf486` + `f60559d` + `661cb93` + `fcb947c` + `3fe6b68` + `c7ad536` + `bfc05a9` - Copilot 3 rundor (7->8->0 fynd, exit naedd, C15 avvisad husstils-kommat)

**Verifiering:** 776 tester gröna + 12 skippade (RLS-integrationstest env-gatade, körda gröna mot live med env). Build/lint/format rent. RLS bevisad med riktiga Supabase-sessioner + adversariell live-granskning (pg_policies + pg_proc). Inga säkerhetsluckor.

**ALLA T14-PINS STÄNGDA:**
- LIVE_READY = true flippat (dokumenterad växel; call-sites orörda via injicerbar parameter med default-värde)
- Interims-warn borttagen
- Live-felvägstester uppdaterade
- F2-assertion: inget test refererar "LIVE_READY=false"
- RLS per auth.uid()+rum bevisad med riktiga sessioner
- Online-seam-synk kopplad (Realtime-kanal från T13-seamen)

**PINNADE punkter:**
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e (YAGNI).
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn (3 dagar framåt) tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort #48 i Ready.
- **KA-F4-notering:** bundle 717 kB (gzip ~200 kB). Om LCP-problem uppstår: lägg till manualChunks i vite.config.ts för att splitta Supabase/Framer ur main-chunk.
- **SA3-notering:** UUID = kapabilitet (den som vet rum-UUID:t kan gå med). Accepterat designval, dokumenterat. Om starkare access-kontroll behövs framöver: JWT-claims per rum.

**"Behöver Daniel"-kö:**
- Push-notiser T22: kräver Apple/Google Developer-konton, Daniel måste godkänna.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` i `memory/lessons/senior-developer.md` Förekomst 3 (T4 + T8 + T9). Typ: korsar flera agenter -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` i `memory/lessons/journalist.md` Förekomst 3 (T7 + HOTFIX #37 + T8). Typ: agent-beteende -> permanent regel i journalistens fil. Väntar Daniels godkännande.
- **FIFA-juni-ranking:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - om den ska speglas: ändra rank-värden i källfilen + `npm run gen:team-profiles`.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go vid hemkomst.
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista. Alternativ: (a) visa meddelande "turneringen avslutad", (b) ankra fönstret till sista speldagen.

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta (semester) och har gett dirigenten full fullmakt hela vägen till slutet.
>
> Om PR #52 (T14/#14, feature/T14-supabase-live) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 52 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #14 manuellt (`gh issue close 14`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #14 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar anonym auth, rumskod-flöde, och att live-data synkar i realtid. Skicka demo till Daniel.
>
> Om PR #52 REDAN mergad:
> Fas 2 är igång. T14 mergad, release-gränsen (develop -> main) väntar Daniels hemkomst-go - kör INTE den autonomt.
> **Nästa tasks (i denna ordning):** #50 (T30 Play Protect-varning vid Android-install) + #51 (T31 ta bort designfundamentet + auto-spelad vid spara), SEDAN T15 (tips-logik).
>
> Bär framåt (alla tasks):
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **#48 (demo-chip a11y):** kort i Ready, plockas upp som liten task.
> - **KA-F4-notering:** bundle 717 kB - lägg till manualChunks om LCP-problem uppstår.
> - **SA3-notering:** UUID = kapabilitet, accepterat, dokumenterat.
> - **"Behöver Daniel"-kön:** push-notiser (T22), 2 befordringar (Förekomst 3), FIFA-juni-ranking, release-gränsen, #39-F1-produktbeslut.
> - **T26 DR-webb-inbäddning:** SKIPPAD, stängd not planned. Bygg INTE.
> - **Fullmakt:** dirigenten har fullmakt hela vägen till slutet (Daniel ger go för release-gränsen vid hemkomst).

---

## RESUME-HERE , 2026-06-10 , T13/#13 (Fas 1-deploy + installation/onboarding + offline) KLAR - FAS 1 KOMPLETT - PR #49 väntar på merge

**Branch:** `feature/T13-install-offline` @ HEAD `1724080`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/49 mot `develop` (Closes #13, state: OPEN)
**Board:** issue #13 i "In Review" (korrekt). Dirigenten stänger issue #13 MANUELLT och flyttar kort #13 till Done EFTER merge.

**Autonomt läge:** Daniel borta ~1 vecka, dirigenten har fullmakt att merga, förbättra brister och mata på nya tasks.

**--- FAS 1 KOMPLETT ---**
T1-T13 + hotfix #37 + T27/#39 + T28/#42 + T4b är klara och mergade (eller väntar merge på PR #49). Fas 1 definieras som stängd när PR #49 mergats. Fas 2 startar med T14 (Supabase live). Release-gränsen (develop -> main + release-cleanup-skillen) är ett SEPARAT beslut och väntar Daniels hemkomst-go.

**KLART med bevis (SHA-lista, nyaste sist):**
- `ed9b909` - refactor(lib): safe-storage till delad lib (rule-of-three)
- `7911ace` - feat(app-settings): installation, onboarding, offline-indikator, haptik/ljud AV default (80 tester)
- `c6d83f6` - feat(pwa): wiring + workbox offline-skal + decisions.md
- `1724080` - feat(app-settings): premium-finish, OnboardingArt-scener, dekor-strip-arkitektur, AA lägst 4,57:1 (HEAD)

**Verifiering (dirigent):** 689 tester gröna (71 filer, +80), build/lint/format rent. Lighthouse: Perf 100 / BP 96 / A11y 93 / SEO 91. LH13 har tagit bort PWA-kategorin; installerbarhet manuellt verifierad (manifest + ikoner 192/512/maskable + sw + secure context). Lokal panel: ren (F1 = pre-existerande demo-chip-kontrast -> ny task #48 på boarden Ready; F2 info om gold-chip-namnkollision). Copilot: 1 runda, 0 fynd.

**Alla 7/7 acceptanskriterier bockade i issue #13** (journalisten 2026-06-10). Kriterium 3 uppfyllt via vm-2026.pages.dev från develop, dokumenterat beslut; main-release = Daniels steg vid release-gränsen.

**design-frontend AA-lärdom:** `aa-kontrastbevisning` i design-frontends lärdomsfil ökades till Förekomst 2 av reviewern (commit e2b355d) - inget att agera på nu, befordran sker vid Förekomst 3.

**PINNADE punkter:**
- **T14-pin UTÖKAD:** flippa `LIVE_READY = true` + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion (inget test refererar "LIVE_READY=false"). Guard-testet BRYTS medvetet vid flip. Projekt kmzhyblzxangpxydufve, RLS per auth.uid()+rum, anon-auth på, Cloudflare-env satt, MCP ansluten. **UTÖKNING T13:** koppla riktig Supabase-synk på online-seamen (nu stub/offline-only), uppdatera live-felvägstester.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e (YAGNI).
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn (3 dagar framåt) tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.
- **#48 (demo-chip a11y):** pre-existerande demo-chip-kontrast i ljust tema. Kort #48 i Ready på boarden.

**"Behöver Daniel"-kö:**
- Push-notiser-setup (T22): kräver Apple/Google Developer-konton, Daniel måste godkänna.
- Captcha (T14 valfri): av som default, ingen akut åtgärd.
- Arena-källa (#35): kräver verifierad per-match-källa (FIFA official).
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista. Alternativ: (a) visa meddelande "turneringen avslutad", (b) ankra fönstret till sista speldagen.
- **FIFA-ranking juni-uppdatering:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - om den ska speglas: ändra rank-värden i källfilen + `npm run gen:team-profiles`.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` i `memory/lessons/senior-developer.md` har nått Förekomst 3 (T4 + T8 + T9). Typ: korsar flera agenter (reviewer + senior-developer) -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` i `memory/lessons/journalist.md` har nått Förekomst 3 (T7 + HOTFIX #37 + T8). Typ: agent-beteende (journalist) -> permanent regel i journalistens fil. Väntar Daniels godkännande.
- **Release-gränsen:** develop -> main + release-cleanup-skillen väntar Daniels go vid hemkomst. Autonomt bygge fortsätter på develop med T14.

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta ~1 vecka och har gett dirigenten full fullmakt att merga, förbättra brister och mata på nya tasks autonomt.
>
> Om PR #49 (T13/#13, feature/T13-install-offline) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 49 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #13 manuellt (`gh issue close 13`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #13 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar install-prompt (Chrome/Android), onboarding-tour vid första start, och att appen fungerar offline. Skicka demo till Daniel.
>
> Om PR #49 REDAN mergad:
> Fas 1 (T1-T13 + hotfix + T27/#39 + T28/#42 + T4b) är komplett och mergad mot develop. Release-gränsen (develop -> main + release-cleanup-skillen) väntar Daniels hemkomst-go - kör INTE den autonomt.
> Plocka nästa task från boarden.
> **Nästa task: T14 (#14, hög-risk: Supabase/auth/RLS -> bredare review-panel)** - "Live-data via Supabase": flippa LIVE_READY, koppla riktig auth/Realtime/RLS, koppla Supabase-synk på online-seamen från T13. Projekt kmzhyblzxangpxydufve, anon-auth på, Cloudflare-env satt, MCP ansluten. Kolla issue-bodyn för fullständigt scope.
>
> Bär framåt (alla tasks):
> - **T14-pin UTÖKAD:** flippa LIVE_READY + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion + koppla riktig Supabase-synk på online-seamen. Projekt kmzhyblzxangpxydufve.
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **#48 (demo-chip a11y):** kort i Ready, plockas upp som liten task vid rätt tillfälle.
> - **"Behöver Daniel"-kö:** push-notiser (T22), captcha (T14 valfri, av), arena-källa (#35), #39-F1-produktbeslut, FIFA-ranking-juni-uppdatering, 2 befordringar (Förekomst 3, väntar Daniels godkännande), release-gränsen (develop -> main).

---

## RESUME-HERE , 2026-06-10 , T12/#12 (What-if-simulator) KLAR - PR #47 väntar på merge

**Branch:** `feature/T12-whatif` @ HEAD `411beb8`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/47 mot `develop` (Closes #12, state: OPEN)
**Board:** issue #12 i "In Review" (korrekt). Dirigenten stänger issue #12 MANUELLT och flyttar kort #12 till Done EFTER merge.

**Autonomt läge:** Daniel borta ~1 vecka, dirigenten har fullmakt att merga, förbättra brister och mata på nya tasks.

**KLART med bevis (SHA-lista, nyaste sist):**
- `deab609` - overlay-arkitektur + apply-simulation + sim-store + SimulationBanner + 21 tester
- `c43aeee` - docs (senior-developer + design-frontend)
- `d1c85ee` - SimulationFrame, violett app-global lägets-markering (design-frontend)
- `177fb4e` - docs AA-beslut (design-frontend)
- `99b8637` - Copilot C1: lokal stacking-kontext på sim-ramen
- `973c6d3` - Copilot C2+C3: enter/exitSimulation idempotenta
- `411beb8` - Copilot C4: en live region, badge aria-hidden (HEAD)

**Verifiering (dirigenten):** 609 tester gröna, build/lint/format rent. Copilot 3 rundor, runda 3 = 2 triviala fynd (C5 avvisad: "Sim-seamen" korrekt svensk bestämd form; C6 journalist-uppgift = slug-fix i patterns.md). Reviewern probe-bevisade isoleringen + sabotage-testade skyddsräckena.

**Journalist-åtgärder (denna session):**
- **C6/patterns.md rad ~622:** rubrik-slug rättad - mellanslag efter "markering-" borttaget.
- **F1/decisions.md:** lagt till besluts-rad om att sim-overlayt är medvetet icke-persistent (sidladdning återställer till riktig data).

**Alla 4/4 acceptanskriterier bockade i issue #12** (journalisten 2026-06-10).

**PINNADE punkter (oförändrade):**
- **T14-pin UTÖKAD:** flippa `LIVE_READY = true` + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion (inget test refererar "LIVE_READY=false"). Guard-testet BRYTS medvetet vid flip. Projekt kmzhyblzxangpxydufve, RLS per auth.uid()+rum, anon-auth på, Cloudflare-env satt, MCP ansluten.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e (YAGNI).
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn (3 dagar framåt) tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser-setup (T22): kräver Apple/Google Developer-konton, Daniel måste godkänna.
- Captcha (T14 valfri): av som default, ingen akut åtgärd.
- Arena-källa (#35): kräver verifierad per-match-källa (FIFA official).
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista. Alternativ: (a) visa meddelande "turneringen avslutad", (b) ankra fönstret till sista speldagen.
- **FIFA-ranking juni-uppdatering:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - om den ska speglas: ändra rank-värden i källfilen + `npm run gen:team-profiles`.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` i `memory/lessons/senior-developer.md` har nått Förekomst 3 (T4 + T8 + T9). Typ: korsar flera agenter (reviewer + senior-developer) -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` i `memory/lessons/journalist.md` har nått Förekomst 3 (T7 + HOTFIX #37 + T8). Typ: agent-beteende (journalist) -> permanent regel i journalistens fil. Väntar Daniels godkännande.

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta ~1 vecka och har gett dirigenten full fullmakt att merga, förbättra brister och mata på nya tasks autonomt.
>
> Om PR #47 (T12/#12, feature/T12-whatif) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 47 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #12 manuellt (`gh issue close 12`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #12 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar "SIMULERINGSLÄGE"-banner + violett ram när sim-läget aktiveras, att tabell/träd ändras live, och att "Återställ allt" ger tillbaka riktig data. Skicka demo till Daniel.
>
> Om PR #47 REDAN mergad:
> T1-T12 + T4b + HOTFIX #37 + T27/#39 + T28/#42 + T10 + T11 är klara och mergade. Plocka nästa task från boarden.
> **Nästa task: T13 (#13)** - "Fas 1-deploy + installation/onboarding + offline": installerbar PWA med ikon, onboarding-tour, offline-cache-strategi, prod-deploy. Kolla issue-bodyn för fullständigt scope. Beror på T1 + T7 (båda klara). Därefter T14 (Supabase live, T14-pin UTÖKAD).
>
> Bär framåt (alla tasks):
> - **T14-pin UTÖKAD:** flippa LIVE_READY + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion. Projekt kmzhyblzxangpxydufve.
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **"Behöver Daniel"-kö:** push-notiser (T22), captcha (T14 valfri, av), arena-källa (#35), #39-F1-produktbeslut, FIFA-ranking-juni-uppdatering, 2 befordringar (Förekomst 3, väntar Daniels godkännande).

---

## RESUME-HERE , 2026-06-10 , T11/#11 (Vad krävs-kalkylator) KLAR - PR #46 väntar på merge

**Branch:** `feature/T11-vad-kravs` @ HEAD `4400a6e`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/46 mot `develop` (Closes #11, state: OPEN)
**Board:** issue #11 i "In Review" (korrekt). Dirigenten stänger issue #11 MANUELLT och flyttar kort #11 till Done EFTER merge.

**Autonomt läge:** Daniel borta ~1 vecka, dirigenten har fullmakt att merga, förbättra brister och mata på nya tasks.

**KLART med bevis (SHA-lista, nyaste sist):**
- `b587af8` - scenario-motor: konservativ Klar/Ute/Beror-på, faser too-early/live/facit, 23 tester
- `e1a452a` - docs (senior-developer)
- `7672247` - design: färg-oberoende status-chips, --vm-on-success-token, F1 guld-AA-fix, F2 280px-fix
- `3565a78` - panel-F1 fantom-symbol-kommentarer omformulerade
- `b53f204` - Copilot C1: äkta text för åskådar-lag
- `2d4edc8` - Copilot C2+C3: doc + plural-rättningar
- `4400a6e` - Copilot C4: enda-match-text + C5 testkommentar (HEAD)

**Verifiering (dirigenten):** 581 tester gröna, build/lint/format rent. Copilot 4 rundor, runda 4 = 0 fynd (exit nådd). Reviewern brute-forcade konservativitets-invarianten (470+ slumpade grupplägen, noll falska Klar/Ute) + villkorstexterna (154 fall, noll lögner). AA-värden matematiskt bekräftade.

**Lessons-loop-observation (reviewerns positiva notering):** senior-devs mönster "uttömmande-test-vaktar-svagare-invariant" (Förekomst 3, väntar Daniels godkännande) tillämpades PROAKTIVT i T11 - brute-force-probe över hela indataklassen, inte bara utvalda fall. Lessons-loopen bevisad fungerande.

**Alla 4/4 acceptanskriterier bockade i issue #11** (journalisten 2026-06-10).

**PINNADE punkter (oförändrade):**
- **T14-pin UTÖKAD:** flippa `LIVE_READY = true` + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion (inget test refererar "LIVE_READY=false"). Guard-testet BRYTS medvetet vid flip. Projekt kmzhyblzxangpxydufve, RLS per auth.uid()+rum, anon-auth på, Cloudflare-env satt, MCP ansluten.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e (YAGNI).
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn (3 dagar framåt) tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.

**"Behöver Daniel"-kö (oförändrad):**
- Push-notiser-setup (T22): kräver Apple/Google Developer-konton, Daniel måste godkänna.
- Captcha (T14 valfri): av som default, ingen akut åtgärd.
- Arena-källa (#35): kräver verifierad per-match-källa (FIFA official).
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista. Alternativ: (a) visa meddelande "turneringen avslutad", (b) ankra fönstret till sista speldagen.
- **FIFA-ranking juni-uppdatering:** aprilutgåvan 2026 används. Junirankingen publicerades 2026-06-11 - om den ska speglas: ändra rank-värden i källfilen + `npm run gen:team-profiles`.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` i `memory/lessons/senior-developer.md` har nått Förekomst 3 (T4 + T8 + T9). Typ: korsar flera agenter (reviewer + senior-developer) -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` i `memory/lessons/journalist.md` har nått Förekomst 3 (T7 + HOTFIX #37 + T8). Typ: agent-beteende (journalist) -> permanent regel i journalistens fil. Väntar Daniels godkännande.

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta ~1 vecka och har gett dirigenten full fullmakt att merga, förbättra brister och mata på nya tasks autonomt.
>
> Om PR #46 (T11/#11, feature/T11-vad-kravs) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 46 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #11 manuellt (`gh issue close 11`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #11 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar "Vad krävs"-panelen med Klar/Ute/Beror-på-chips för lag i sista gruppomgången. Skicka demo till Daniel.
>
> Om PR #46 REDAN mergad:
> T1-T11 + T4b + HOTFIX #37 + T27/#39 + T28/#42 + T10 är klara och mergade. Plocka nästa task från boarden.
> **Nästa task: T12 (#12)** - "What-if-simulator": sandlåda där hypotetiska resultat påverkar tabell + träd live. Beror på T5 + T9 (båda klara). Kolla issue-bodyn för fullständigt scope. Därefter T13, T14.
>
> Bär framåt (alla tasks):
> - **T14-pin UTÖKAD:** flippa LIVE_READY + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion. Projekt kmzhyblzxangpxydufve.
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **"Behöver Daniel"-kö:** push-notiser (T22), captcha (T14 valfri, av), arena-källa (#35), #39-F1-produktbeslut, FIFA-ranking-juni-uppdatering, 2 befordringar (Förekomst 3, väntar Daniels godkännande).

---

## RESUME-HERE , 2026-06-10 , T10/#10 (lag-profiler) KLAR - PR #45 väntar på merge

**Branch:** `feature/T10-lagprofiler` @ HEAD `6486fbc`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/45 mot `develop` (Closes #10, state: OPEN)
**Board:** issue #10 i "In Review" (korrekt). Dirigenten stänger issue #10 MANUELLT och flyttar kort #10 till Done EFTER merge.

**Autonomt läge:** Daniel borta ~1 vecka, dirigenten har fullmakt att merga, förbättra brister och mata på nya tasks.

**KLART med bevis (SHA-lista, nyaste sist):**
- `677c9a3` - källankrad lag-profil-data (FIFA-ranking april 2026 + stjärnspelare + kuriosa), parser + generator + 48/48-låst test + decisions.md
- `b453a52` - profil-modal + TeamNameButton (senior-developer)
- `f142aaa` - docs (senior-developer)
- `4dd6d0d` - flake-fix seed-race (senior-developer)
- `cb60657` - premium-modal, värsta-falls-AA över alla 360 hues (design-frontend)
- `f614bb3` - docs (design-frontend)
- `18ff82b` - MotionGlobalConfig.skipAnimations (design-frontend)
- `24eb866` - lokal panel: F1 faktafel ESP-kuriosa rättad + F3 fokus-tester (senior-developer)
- `98e5973` - React 19 passiv-effekt-flush-race rotorsakad (senior-developer)
- `a6c2783` - barrel (Copilot C1)
- `e8cce76` - bootstrap-cirkularitet bruten, team-refs.ts (Copilot C2)
- `1b93fb9` - äkta tom-stjärnor-test + stavfel (Copilot C3)
- `72a9a7f` - fokus-effekt stabilt id (Copilot C7)
- `800c307` - okänt lag ej klickbart + Escape-deps (Copilot C8+C9)
- `6486fbc` - opponent-uppslags-miss fail-loud-light (Copilot C10, HEAD)

**Verifiering (dirigenten):** 554 tester gröna (53 filer), build/lint/format rent. Alla 19 Copilot-trådar lösta (5 rundor, exit nådd 4->2->1->2->1).

**"Bästa speldraget" (bestPlay):** medvetet utelämnat (subjektivt utan källbar grund). `Team.bestPlay` tom för alla 48 lag, låst av test. FIFA-rankingen är styrke-signal i profil-vyn i stället. Dokumenterat i decisions.md T10 och i issue #10-bodyn.

**FIFA-ranking:** aprilutgåvan 2026 (officiell, senaste vid bygget). Nästa officiella utgåva publiceras 2026-06-11 (dagen turneringen startar). Om Daniel vill uppdatera: ändra rank-värden i `src/data/wc2026/team-profiles-source.txt` + kör `npm run gen:team-profiles` - källankrings-testet låser automatiskt.

**PINNADE punkter (oförändrade):**
- **T14-pin UTÖKAD:** flippa `LIVE_READY = true` + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion (inget test refererar "LIVE_READY=false"). Guard-testet BRYTS medvetet vid flip. Projekt kmzhyblzxangpxydufve, RLS per auth.uid()+rum, anon-auth på, Cloudflare-env satt, MCP ansluten.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e (YAGNI).
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn (3 dagar framåt) tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.

**"Behöver Daniel"-kö:**
- Push-notiser-setup (T22): kräver Apple/Google Developer-konton, Daniel måste godkänna.
- Captcha (T14 valfri): av som default, ingen akut åtgärd.
- Arena-källa (#35): kräver verifierad per-match-källa (FIFA official).
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista. Alternativ: (a) visa meddelande "turneringen avslutad", (b) ankra fönstret till sista speldagen.
- **FIFA-ranking juni-uppdatering:** aprilutgåvan 2026 används nu. Junirankingen publiceras 2026-06-11 - om den ska speglas i appen: ändra rank-värden i källfilen + `npm run gen:team-profiles`. Lägg som liten framtida task eller hantera vid hemkomst.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` i `memory/lessons/senior-developer.md` har nått Förekomst 3 (T4 + T8 + T9). Typ: korsar flera agenter (reviewer + senior-developer) -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` i `memory/lessons/journalist.md` har nått Förekomst 3 (T7 + HOTFIX #37 + T8). Typ: agent-beteende (journalist) -> permanent regel i journalistens fil. Väntar Daniels godkännande.

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta ~1 vecka och har gett dirigenten full fullmakt att merga, förbättra brister och mata på nya tasks autonomt.
>
> Om PR #45 (T10/#10, feature/T10-lagprofiler) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 45 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #10 manuellt (`gh issue close 10`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #10 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar klickbara lagnamn och profil-modal med ranking + stjärnor + kuriosa. Skicka demo till Daniel.
>
> Om PR #45 REDAN mergad:
> T1-T10 + T4b + HOTFIX #37 + T27/#39 + T28/#42 är klara och mergade. Plocka nästa task från boarden.
> **Nästa task: T11 (#11)** - "Vad krävs-kalkylator": live-scenarier sista gruppomgången, vad varje lag behöver för att avancera. Kolla issue-bodyn för fullständigt scope.
>
> Bär framåt (alla tasks):
> - **T14-pin UTÖKAD:** flippa LIVE_READY + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion. Projekt kmzhyblzxangpxydufve.
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **"Behöver Daniel"-kö:** push-notiser (T22), captcha (T14 valfri, av), arena-källa (#35), #39-F1-produktbeslut, FIFA-ranking-juni-uppdatering, 2 befordringar (Förekomst 3, väntar Daniels godkännande).

---

## RESUME-HERE , 2026-06-10 , T10/#10 (lag-profiler) KLAR - väntar review + PR

**Branch:** `feature/T10-lagprofiler` (= develop HEAD + T10-commits, EJ pushad)
**Board:** issue #10. Dirigenten driver review-panel -> PR mot develop -> merge.

**Autonomt läge:** Daniel borta ~1 vecka, dirigenten har fullmakt.

**KLART med bevis (SHA-lista, nyaste sist):**
- `677c9a3` - källånkrad lag-profil-data (FIFA-ranking + stjärnspelare + kuriosa), generator + parser + 48/48-låst test + decisions.md
- `b453a52` - UI: klickbara lag-profiler (modal) från matchkort + tabeller, derivation + provider + a11y-dialog + tester
- (docs-commit: patterns.md + HANDOFF, denna)

**Verifiering (senior-developer):** 545 tester gröna (53 filer, +21 nya: 7 derivation + 3 TeamNameButton + 11 panel/navigering), build grönt, lint rent, format:check rent. Baseline var 501; +23 data-tester (teams/källånkring) + 21 UI = 545.

**T10 DATA-DELEN (källånkrad, gissa-aldrig HARD uppfylld):**
- **FIFA-ranking:** OFFICIELLA aprilutgåvan 2026-04-01 (senaste vid bygget; nästa officiella 2026-06-11). Alla 48 lag, verifierad mot ESPN (1-50) + Wikipedia (topp 20) + whereig (50-90), korskollat. Committat utdrag: `src/data/wc2026/team-profiles-source.txt`.
- **Stjärnspelare:** de släppta 26-mannatrupperna (offentliggjorda 2026-06-02), Al Jazeera + Wikipedia. Redaktionellt urval (1-2 per lag) MEN varje spelare bevisligen i truppen. Alla 48 lag fick minst en källbelagd spelare.
- **Kuriosa:** verifierbara VM-fakta (tidigare slutspel + bästa placering, Wikipedia records).
- **"Bästa speldraget" (bestPlay):** UTELÄMNAT med flit (subjektivt utan källa), `Team.bestPlay` tom för alla 48 (låst av test). FIFA-rankingen är styrke-signal i profil-vyn i stället. Se decisions.md T10.
- **VAD SOM INTE KUNDE KÄLLBELÄGGAS:** inget profil-fält saknar källa. bestPlay är ENDA medvetet tomma fältet (designval, inte datalucka). FIFA-rankingen är aprilutgåvan (juni-utgåvan inte publicerad än vid bygget, 2026-06-11) - när juni-utgåvan kommer kan källfilen uppdateras + regenereras (en rad-ändring + `npm run gen:team-profiles`).

**T10 UI-DELEN:** modal-overlay (KISS, router-lös PWA), nås via klickbara lagnamn i matchkort (daily) + gruppspelstabeller. a11y-dialog (role=dialog, aria-modal, Escape/stäng/bakgrund stänger, fokus-flytt). Visar ranking, stjärnor, kuriosa, grupp + lagets väg (matcher kronologiskt, återanvänder daily-helpers). Stabil semantik + data-attribut för design-frontend. Ny `team-profile`-feature + `TeamProfileProvider` i App (innanför ResultsProvider).

**Findings (T10):**
- **F1 (FIFA-ranking-utgåva):** datan är aprilutgåvan 2026 (officiell, senaste vid bygget). Juni-utgåvan publiceras 2026-06-11 (dagen turneringen startar). Uppdatering = ändra rank-värden i källfilen + `npm run gen:team-profiles`, källankrings-testet låser. Inte en bugg, en känd uppdaterings-punkt.
- **F2 (design-finish pinnad till design-frontend):** modalen bär stabil semantik + data-attribut men ingen premium-visuell finish (overlay-blur, in-animation, layout-polish), det är design-frontends lager (samma seam-princip som T5/T7/T9).

**Nästa:** review-panel på T10 -> PR mot develop -> merge. Därefter design-frontend på profil-modalen, sen T11-T13, sen T14 (Supabase live, T14-pin UTÖKAD).

## RESUME-HERE , 2026-06-10 , T28/#42 KLAR - PR #44 väntar på merge

**Branch:** `feature/T28-matchlista-kontext` @ HEAD `b7ad6c2`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/44 mot `develop` (Closes #42, state: OPEN)
**Board:** issue #42 i "In Review" (korrekt). Dirigenten stänger issue #42 MANUELLT och flyttar kort #42 till Done EFTER merge.

**Autonomt läge:** Daniel borta ~1 vecka, dirigenten har fullmakt att merga, förbättra brister och mata på nya tasks.

**KLART med bevis (SHA-lista, nyaste sist):**
- `c80ca4f` - dag-rubriker + kontext-rad + dubblerad toggle + fokus-flytt (senior-developer)
- `760ed49` - decisions (senior-developer)
- `48cb2c1` - sticky dag-rubrik + klock-ikon + steg-chip (design-frontend)
- `b7ad6c2` - decisions kontrast-tabell (design-frontend, HEAD)

**Journalist-åtgärd (Copilot-fynd ID 3386311706):** `docs/decisions.md` rad 64, "Toggeln" rättad till "Togglen" (konsekvent med övrig text i blocket).

**Verifiering (dirigenten oberoende):** 501 tester gröna (49 filer), build/lint/format rent. Lokal panel: inga blockerande (F1 nit avvisad). Copilot: 1 runda, 1 trivialt fynd = exit nådd.

**Alla 6/6 acceptanskriterier bockade i issue #42** (journalisten 2026-06-10).

**PINNADE punkter (bär framåt, oförändrade):**
- **T14-pin UTÖKAD:** flippa `LIVE_READY = true` + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion (inget test refererar "LIVE_READY=false"). Guard-testet BRYTS medvetet vid flip. Projekt kmzhyblzxangpxydufve, RLS per auth.uid()+rum, anon-auth på, Cloudflare-env satt, MCP ansluten.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e (YAGNI).
- **Stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn (3 dagar framåt) tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.

**"Behöver Daniel"-kö (han är borta):**
- Push-notiser-setup (T22): kräver Apple/Google Developer-konton, Daniel måste godkänna.
- Captcha (T14 valfri): av som default, ingen akut åtgärd.
- Arena-källa (#35): kräver verifierad per-match-källa (FIFA official).
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista. Alternativ: (a) visa meddelande "turneringen avslutad", (b) ankra fönstret till sista speldagen.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` i `memory/lessons/senior-developer.md` har nått Förekomst 3 (T4 + T8 + T9). Typ: korsar flera agenter (reviewer + senior-developer) -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` i `memory/lessons/journalist.md` har nått Förekomst 3 (T7 + HOTFIX #37 + T8). Typ: agent-beteende (journalist) -> permanent regel i journalistens fil. Väntar Daniels godkännande.

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta ~1 vecka och har gett dirigenten full fullmakt att merga, förbättra brister och mata på nya tasks autonomt.
>
> Om PR #44 (T28/#42, feature/T28-matchlista-kontext) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 44 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #42 manuellt (`gh issue close 42`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #42 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar dag-rubriker + kontext-rad + dubblerad toggle i matchlistan. Skicka demo till Daniel.
>
> Om PR #44 REDAN mergad:
> T1-T9 + T4b + HOTFIX #37 + T27/#39 + T28/#42 är klara och mergade. Plocka nästa task från boarden.
> **Nästa task: T10 (#10)** - kolla issue-bodyn för scope. Därefter T11-T13, sedan T14 (Supabase live, kmzhyblzxangpxydufve, T14-pin UTÖKAD gäller).
>
> Bär framåt (alla tasks):
> - **T14-pin UTÖKAD:** flippa LIVE_READY + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion. Projekt kmzhyblzxangpxydufve.
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **Stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **"Behöver Daniel"-kö:** push-notiser (T22), captcha (T14 valfri, av), arena-källa (#35), #39-F1-produktbeslut, 2 BEFORDRINGAR (reviewer + journalist, båda Förekomst 3, väntar Daniels godkännande).

---

## RESUME-HERE , 2026-06-10 , T9/#9 KLAR - PR #43 väntar på autonom merge

**Branch:** `feature/T9-slutspelstrad` @ HEAD `3c1afe6`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/43 mot `develop` (Closes #9, state: OPEN)
**Board:** issue #9 i "In Review" (korrekt). Dirigenten stänger issue #9 MANUELLT och flyttar kort #9 till Done EFTER merge.

**Autonomt läge:** Daniel borta ~1 vecka, dirigenten har fullmakt att merga, förbättra brister och mata på nya tasks.

**KLART med bevis (SHA-lista, nyaste sist):**
- `cd19d74` - straffläggning i slutspel (FIFA Art. 14, F1/penalties-pinnen LÖST)
- `f380cdd` - trea-rankning (FIFA Art. 13, 8 bästa treorna)
- `b57c61d` - deriveBracket, levande träd (möjliga lag, låst, vinnar-propagering)
- `389b6d6` - BracketView + useBracketData + wiring i App
- `c31790c` - docs: decisions.md + patterns.md + HANDOFF
- `b1377d8` + `776de65` - design premium + AA-uppmätta värden (lägsta 5.03:1)
- `70d2c08` + `ac27bb1` - lokal panel F1-F3 åtgärdade med negativa kontroller (mutations-bevis)
- `4c6863e`, `220686a`, `2480ce7`, `21f4ed7`, `0e3c47c`, `872d666`, `5f2013d` - Copilot rundor 1-4
- `73e4e63` - flaky-timeout fix
- `79b62e3`, `3c1afe6` - Copilot runda 5 (HEAD)

**Verifiering (dirigenten oberoende):** 488 tester gröna (47 filer), build/lint/format rent.
**Copilot-loop:** 5 rundor, 14 fynd, alla åtgärdade. Exit <= 2 triviala nådd i runda 5.
**Alla 6/6 acceptanskriterier bockade i issue #9** (journalisten 2026-06-10).

**F1/penalties-pinnen: STÄNGD** (ägare senior-developer). Reducern bevarar nu `penalties`, acceptanstest grönt. Ta INTE med som öppen pin framåt.

**PINNADE punkter (bär framåt):**
- **T14-pin UTÖKAD:** flippa `LIVE_READY = true` + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion (inget test refererar "LIVE_READY=false"). Guard-testet BRYTS medvetet vid flip. Projekt kmzhyblzxangpxydufve, RLS per auth.uid()+rum, anon-auth på, Cloudflare-env satt, MCP ansluten.
- **#35 (arena/stad):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e (YAGNI).
- **stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
- **Post-turnerings-asymmetri (#39-F1):** efter 19 juli ger default-vyn (3 dagar framåt) tom lista. Produktbeslut pinnat till Daniels hemkomst-kö.

**"Behöver Daniel"-kö (han är borta):**
- Push-notiser-setup (T22): kräver Apple/Google Developer-konton, Daniel måste godkänna.
- Captcha (T14 valfri): av som default, ingen akut åtgärd.
- Arena-källa (#35): kräver verifierad per-match-källa (FIFA official).
- **#39-F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger default-vy tom lista. Alternativ: (a) visa meddelande "turneringen avslutad", (b) ankra fönstret till sista speldagen.
- **BEFORDRAN 1 (reviewer-mönstret):** `uttommande-test-vaktar-svagare-invariant` i `memory/lessons/senior-developer.md` har nått Förekomst 3 (T4 + T8 + T9). Typ: korsar flera agenter (reviewer + senior-developer) -> regel i `memory/README.md`. Väntar Daniels godkännande.
- **BEFORDRAN 2 (journalist-mönstret):** `pastar-att-filer-saknas-utan-att-lista-dem` i `memory/lessons/journalist.md` har nått Förekomst 3 (T7 + HOTFIX #37 + T8). Typ: agent-beteende (journalist) -> permanent regel i journalistens fil. Väntar Daniels godkännande.

**Nästa task:** #42 (T28, Daniels feedback 2 - datum/tid/grupp i matchlistan + lättåtkomlig ihopfällning). Beror på #39 (klar) och T9 (klar). Därefter T10-T13, sedan T14.

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta ~1 vecka och har gett dirigenten full fullmakt att merga, förbättra brister och mata på nya tasks autonomt.
>
> Om PR #43 (T9/#9, feature/T9-slutspelstrad) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 43 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #9 manuellt (`gh issue close 9`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #9 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar slutspelsträdet (WOW-skärm). Skicka demo till Daniel.
>
> Om PR #43 REDAN mergad:
> T1-T9 + T4b + HOTFIX #37 + T27/#39 är klara och mergade. Plocka nästa task från boarden.
> **Nästa task: #42 (T28, Daniels feedback 2 - datum/tid/grupp i matchlistan + lättåtkomlig ihopfällning).**
>
> Bär framåt (alla tasks):
> - **T14-pin UTÖKAD:** flippa LIVE_READY + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion. Projekt kmzhyblzxangpxydufve.
> - **#35 (arena/stad):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **stegnings-dubblett:** 2 användningar, extrahera vid 3:e.
> - **"Behöver Daniel"-kö:** push-notiser (T22), captcha (T14 valfri, av), arena-källa (#35), #39-F1-produktbeslut, 2 BEFORDRINGAR (reviewer + journalist, båda Förekomst 3, väntar Daniels godkännande).

---

## RESUME-HERE , 2026-06-10 , T9/#9 (slutspelsträdet) , senior-developer KLAR, väntar review + PR

**Branch:** `feature/T9-slutspelstrad` (från develop HEAD). Ingen PR öppnad än.
**Autonomt läge:** Daniel borta ~1 vecka, dirigenten har fullmakt att review:a/merga/mata på.

**KLART med bevis (atomiska commits):**
- `cd19d74` , feat(results): straffläggning i slutspel, F1/penalties-pinnen LÖST (FIFA Art. 14)
- `f380cdd` , feat(domain): rangordna grupptreorna -> 8 bästa (FIFA Article 13)
- `b57c61d` , feat(bracket): deriveBracket, levande träd (möjliga lag/låst/vinnar-propagering)
- `389b6d6` , feat(bracket): BracketView + useBracketData + live-integrationstest, wirad i App
- (docs-commit härnäst: decisions.md + patterns.md + denna HANDOFF)
- Verifiering: **462 tester gröna (47 filer)** (baseline 406/43, +56), build + lint + format:check rent
- Secret-skan av diffen: rent (bara test-fixtures `anon-key`, inga riktiga nycklar)

**Alla 5 acceptanskriterier täckta:**
1. Trädet byggs ur tabelläget, låses vid grupp-slut enligt T4-seedningen , `deriveBracket` + `isGroupStageComplete` + live-integrationstest.
2. Slutspelsresultat för fram vinnaren (semantik/data; animation = design) , `winnerSlotId`/`data-winner` + propagering, integrationstest.
3. Korrekt struktur sextondel->åttondel->kvart->semi->brons->final , `groupByRound` + struktur-test.
4. Responsiv-förberedd (horisontell scroll) + a11y-semantik , `overflow-x-auto` + region/list-semantik + vy-test.
5. Tester för uppbyggnad + låsning + avancering + edge-fall (oavgjort kräver seedning/straffar) , 20 derive-tester + 3 integ + penalties-tester.

**F1/penalties-pinnen: LÖST** (ägare var senior-developer). Reducern bevarar nu `penalties`;
acceptanstest grönt. Ta INTE med som öppen pin framåt.

**KÄLLHÄNVISNING (HARD, för review-grinden):** två FIFA-regler committade verbatim i
`src/domain/bracket/fifa-knockout-rules-source.txt` (pdftotext ur FWC2026-regelverket):
Article 13 (trea-rankning, ENBART övergripande a-c, ej head-to-head) + Article 14 (straffar).
Reviewern kan BEKRÄFTA mot källan. Beslut + tolkning i `docs/decisions.md` (T9-raden).

**PINNADE punkter (bär framåt, oförändrade):**
- **T14-pin UTÖKAD:** flippa LIVE_READY + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion.
- **T14-pin (Supabase):** projekt kmzhyblzxangpxydufve, anon-auth på, Cloudflare-env satt, MCP ansluten.
- **#35 (arena/stad):** venue = platshållare tills verifierad per-match-källa.
- **FNV-hash:** 2 användningar, konsolidera vid 3:e (YAGNI).
- **stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.

**Next:** lokal review-panel -> ev. åtgärder -> PR mot develop -> copilot-loop -> Daniel mergar.

---

## RESUME-HERE , 2026-06-10 , T27/#39 KLAR - PR #41 väntar på autonom merge

**Branch:** `feature/T27-resultatlista-ux` @ HEAD `34fdd28`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/41 mot `develop` (Closes #39, state: OPEN)
**Board:** issue #39 i "In Review" (korrekt). Dirigenten stänger issue #39 MANUELLT och flyttar kort #39 till Done EFTER merge.

**Autonomt läge: Daniel är borta ~1 vecka. Utökad fullmakt: dirigenten mergar, förbättrar brister den ser, och matar på nya tasks.**

**KLART med bevis (SHA + verifiering):**
- `6ce12ce` - windowMatches-helper + expandera-kontroll (senior-developer)
- `0d5566c` - kolumn-grid med fasta spår + ellipsis-trunkering (senior-developer)
- `14a133b` - decisions.md doc (senior-developer)
- `ad05842` + `f9b06d2` - design premium + AA-uppmätt i browser (design-frontend)
- `376b324` - useTodayKey-hook (dag-medveten, minut-tick gatad på dagsbyte + visibilitychange)
- `34fdd28` - dag-medvetet fönster + hidden-attribut (ej list-filtrering) (HEAD)
- Verifiering (dirigenten oberoende): **406 tester gröna (43 filer)**, build/lint/format rent
- Lokal panel: F1 (post-turnerings-asymmetri: tom default-vy efter 19 juli vs daily-vyns klampning) PINNAD som produktbeslut till Daniels hemkomst-kö; F2 avvisad (rule-of-three, 2:a stegnings-dubbletten, extrahera vid 3:e)
- Copilot: 2 rundor (2 -> 0), C1 (fruset fönster över midnatt) + C2 (osparad inmatning tappades vid ihopfäll) åtgärdade
- Alla 5/5 acceptanskriterier bockade i issue #39 (journalisten 2026-06-10)
- **T8 + #39 demo:** dirigenten skickar live-skärmdumpar till Daniel vid hemkomst (T8 dags-tema + T27 resultatlista ihop)

**PINNADE punkter (bär framåt):**
- **F1/penalties-pin (T9, ägare senior-developer):** reducern hanterar inte `MatchResult.penalties`. T9 fixar. Acceptanstest: redigera finished slutspelsmatch med straff, penalties bevaras.
- **T14-pin UTÖKAD:** När live-klienten byggs i T14, gör ALLA fyra stegen i SAMMA ändring:
  (1) Sätt `LIVE_READY = true` i `src/data/data-source.ts`.
  (2) Ta bort interims-warn (den `console.warn` med "LIVE_READY=false ... byggs i T14").
  (3) Uppdatera live-felvägstester (de som assertar fixtures-fallback vid env+ej-live-ready).
  (4) Lägg F2-assertion: inget test refererar strängen "LIVE_READY=false".
  Guard-testet BRYTS medvetet vid flip - så stegen inte glöms.
- **T14-pin (Supabase):** projekt kmzhyblzxangpxydufve, RLS per auth.uid()+rum, anon-auth på, Cloudflare-env satt, MCP ansluten.
- **#35 (arena/stad, Backlog):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.
- **FNV-hash-notering:** FNV-hash används på 2 ställen, avvisad konsolidering (YAGNI, rule-of-three). Konsolidera till delad hjälpare vid 3:e användning.
- **Stegnings-dubblett-notering (windowDateKeys vs enumerateDateKeys):** 2 användningar, avvisad extraktion (rule-of-three). Extrahera delad hjälpare vid 3:e användning.

**"Behöver Daniel"-kö (han är borta):**
- **F1-produktbeslut (post-turnerings-vy):** efter 19 juli ger current default-vy (3 dagar framåt) en tom lista. Alternativ: (a) behåll tom vy + visa meddelande "turneringen avslutad", (b) ankra fönstret till sista speldagen (19 juli) när today > sista match. Daniel bestämmer vid hemkomst.
- Push-notiser-setup (T22): kräver Apple/Google Developer-konton, Daniel måste godkänna.
- Captcha (T14 valfri): av som default, ingen akut åtgärd.
- Arena-källa (#35): kräver verifierad per-match-källa (FIFA official).

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta ~1 vecka och har gett dirigenten full fullmakt att merga, förbättra brister och mata på nya tasks autonomt.
>
> Om PR #41 (T27/#39, feature/T27-resultatlista-ux) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 41 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #39 manuellt (`gh issue close 39`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #39 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar dag-tema + kollinjerad resultatlista med 3-dagarsfönster, inga alerts. Skicka demo-skärmdumpar (T8 + T27 ihop) till Daniel.
>
> Om PR #41 REDAN mergad:
> T1-T8 + T4b + HOTFIX #37 + T27/#39 är klara och mergade. Plocka nästa task från boarden.
> **Nästa task: T9 (#9, slutspels-inmatning) - F1/penalties-pinnen gäller!**
>
> Bär framåt (alla tasks):
> - **F1/penalties-pin (T9):** reducern hanterar inte penalties. T9 fixar.
> - **T14-pin UTÖKAD:** flippa LIVE_READY + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion. Se senaste T14-sektionen ovan.
> - **T14-pin (Supabase):** projekt kmzhyblzxangpxydufve, anon-auth på, Cloudflare-env satt, MCP ansluten.
> - **#35 (arena/stad, Backlog):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **FNV-hash:** 2 användningar, konsolidera vid 3:e.
> - **stegnings-dubblett (windowDateKeys vs enumerateDateKeys):** 2 användningar, extrahera vid 3:e.
> - **"Behöver Daniel"-kö:** F1-produktbeslut (post-turnerings-vy), push-notiser (T22), captcha (T14 valfri, av), arena-källa (#35). Notifiera Daniel vid hemkomst.
> - **Utökad fullmakt:** dirigenten får förbättra brister och mata på nya tasks för att göra sidan bättre.

---

## RESUME-HERE , 2026-06-10 , T8 KLAR - PR #40 väntar på autonom merge

**Branch:** `feature/T8-dags-tema` @ HEAD `12cd8e9`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/40 mot `develop` (Closes #8, state: OPEN)
**Board:** issue #8 i "In Review" (korrekt). Dirigenten stänger issue #8 MANUELLT och flyttar kort #8 till Done EFTER merge.

**Autonomt läge: Daniel är borta ~1 vecka. Utökad fullmakt: dirigenten mergar, förbättrar brister den ser, och matar på nya tasks.**

**KLART med bevis (SHA + verifiering):**
- `38ecd8f` - DRY team-hue (refaktor, senior-developer)
- `5832f86` - dags-tema-härledning + seam (senior-developer)
- `47a017c` - success-ton #0f766e, T8-PIN LÖST (design-frontend) - 4.97:1 mot fond, 5.47:1 mot vit text, hue 175 vs accent 150
- `2ee977f` - hero-dekor dags-ton (design-frontend)
- `93931c3` + `9c6b6ec` + `fad54d6` + `eb7472d` + `2370226` - lokal panel F1-F3+F5 åtgärdade
- `8a139d3` + `60700ec` - Copilot R1 C1-C4
- `12cd8e9` - C5 typo (HEAD)
- Verifiering (dirigenten + reviewer, oberoende): **382 tester gröna (41 filer)**, build/lint/format rent
- Lokal panel: 1 runda, 5 fynd (F1 antipodal-fallback åtgärdad, F2 källskan-vakt byggd, F3+F5 doc åtgärdade, F4 FNV-dubblett avvisad YAGNI)
- Copilot: 2 rundor (4 -> 1 -> 0), alla 5 trådar lösta
- Alla 5/5 acceptanskriterier bockade i issue #8 (journalisten 2026-06-10)
- **T8-PIN STÄNGD:** success ljust tema = #0f766e (hue 175, distinkt från accent hue 150). Ta INTE med som öppen pin framåt.

**PINNADE punkter (bär framåt):**
- **F4-notering (FNV-hash):** FNV-hash används på 2 ställen, avvisad konsolidering (YAGNI, regel-of-three). Konsolidera till delad hjälpare vid 3:e användning.
- **F1/penalties-pin (T9, ägare senior-developer):** reducern hanterar inte `MatchResult.penalties`. T9 fixar. Acceptanstest: redigera finished slutspelsmatch med straff, penalties bevaras.
- **T14-pin UTÖKAD:** När live-klienten byggs i T14, gör ALLA fyra stegen i SAMMA ändring:
  (1) Sätt `LIVE_READY = true` i `src/data/data-source.ts`.
  (2) Ta bort interims-warn (den `console.warn` med "LIVE_READY=false ... byggs i T14").
  (3) Uppdatera live-felvägstester (de som assertar fixtures-fallback vid env+ej-live-ready).
  (4) Lägg F2-assertion: inget test refererar strängen "LIVE_READY=false".
  Guard-testet BRYTS medvetet vid flip - så stegen inte glöms.
- **T14-pin (Supabase):** projekt kmzhyblzxangpxydufve, RLS per auth.uid()+rum, anon-auth på, Cloudflare-env satt, MCP ansluten.
- **#35 (arena/stad, Backlog):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.

**"Behöver Daniel"-kö (han är borta):**
- Push-notiser-setup (T22): kräver Apple/Google Developer-konton, Daniel måste godkänna.
- Captcha (T14 valfri): av som default, ingen akut åtgärd.
- Arena-källa (#35): kräver verifierad per-match-källa (FIFA official).

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta ~1 vecka och har gett dirigenten full fullmakt att merga, förbättra brister och mata på nya tasks autonomt.
>
> Om PR #40 (T8, feature/T8-dags-tema) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 40 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #8 manuellt (`gh issue close 8`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #8 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar dags-tema, inga alerts. Skicka demo-länk till Daniel.
>
> Om PR #40 REDAN mergad:
> T1-T8 + T4b + HOTFIX #37 är klara och mergade. Plocka nästa task från boarden.
> **Nästa task: #39 (T27, Daniels feedback - resultatinmatning kolumn-linjering + 3-dagars fönster, PRIORITERAD)**, därefter T9 (F1/penalties-pin!), T10-T13, T14.
>
> Bär framåt (alla tasks):
> - **F4-notering:** FNV-hash 2 användningar, konsolidera vid 3:e.
> - **F1/penalties-pin (T9):** reducern hanterar inte penalties. T9 fixar.
> - **T14-pin UTÖKAD:** flippa LIVE_READY + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion.
> - **Supabase:** projekt kmzhyblzxangpxydufve, anon-auth på, Cloudflare-env satt, MCP ansluten.
> - **#35 (arena/stad, Backlog):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **"Behöver Daniel"-kö:** push-notiser (T22), captcha (T14 valfri, av), arena-källa (#35). Notifiera Daniel vid hemkomst.
> - **Utökad fullmakt:** dirigenten får förbättra brister den ser och mata på nya tasks för att göra sidan bättre.

---

## RESUME-HERE , 2026-06-10 , HOTFIX #37 KLAR - PR #38 väntar på autonom merge

**Branch:** `feature/hotfix-37-fixtures-i-produktion` @ HEAD `6381761`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/38 mot `develop` (Closes #37, state: OPEN)
**Board:** issue #37 i "In Review" (korrekt). Dirigenten stänger issue #37 MANUELLT och flyttar kort #37 till Done EFTER merge.

**Autonomt läge: Daniel är borta ~1 vecka.** Full fullmakt: dirigenten mergar till develop och betar av hela listan.

**KLART med bevis (SHA + verifiering):**
- `69ccbae` - senior-dev: LIVE_READY-gate + tester (355 tester gröna, build/lint/format rent)
- `6381761` - Copilot C1+C2 doc-fixar: tvåstegs-gate beskriven i patterns.md + stavfel (HEAD)
- Verifiering (dirigenten + reviewer oberoende): 355 tester gröna, build/lint/format rent
- Reviewern mutationstestade guard + injektion (LIVE_READY-flip -> guard-test RÖTT, bevisat)
- Alla 4/5 acceptanskriterier bockade i issue #37 (kriterium 5 bockas av dirigenten efter merge)
- Lokal panel: 1 runda (F1 avvisad nit, F2 pinnad till T14)
- Copilot: 2 rundor (2->1->0 fynd, exit nådd), sista doc-fyndet åtgärdat i journalist-steget

**Journalist-åtgärd (Copilot-fynd ID 3384908301, decisions.md):** T7:s C5-C8-beslut låg direkt
under HOTFIX #37-rubriken, vilket blandade ihop de två besluts-spåren. Åtgärd: separator + egen
rubrik `## 2026-06-10 , T7 (issue #7): Copilot-review R2 (C5-C8)` tillagt ovanför T7-blocket.

**Rotorsak (kontext):** Supabase-env i Cloudflare (satt 2026-06-09 inför T14) flippade env-gaten
till live-läge medan klienten är fail-loud-stub -> produktionen visade fel-alerts sedan 9/6.
Nu: fixtures i produktion tills T14 flippar LIVE_READY.

**PINNADE punkter (bär framåt):**
- **T14-pin UTÖKAD:** När live-klienten är byggd i T14, gör ALLA fyra stegen i SAMMA ändring:
  (1) Sätt `LIVE_READY = true` i `src/data/data-source.ts`.
  (2) Ta bort interims-warn (den `console.warn` med "LIVE_READY=false ... byggs i T14").
  (3) Uppdatera live-felvägstester (de som assertar fixtures-fallback vid env+ej-live-ready).
  (4) Lägg F2-assertionen: inget test refererar strängen "LIVE_READY=false" (pinnad av lokal panel).
  Guard-testet BRYTS medvetet vid flip - så stegen inte glöms.
- **F2/T8-pin (ägare design-frontend):** success-token == accent #0e7a44 i ljust tema. T8 ger success en distinkt AA-klarande ton.
- **F1/penalties-pin (T9, ägare senior-developer):** reducern hanterar inte `MatchResult.penalties`. T9 fixar. Acceptanstest: redigera finished slutspelsmatch med straff, penalties bevaras.
- **T14-pin (Supabase):** projekt kmzhyblzxangpxydufve, RLS per auth.uid()+rum, anon-auth på, Cloudflare-env satt, MCP ansluten.
- **#35 (arena/stad, Backlog):** `Match.venue` = platshållare tills #35 fyller med verifierad per-match-källa.

**"Behöver Daniel"-kö (han är borta):**
- Push-notiser-setup (T22): kräver Apple/Google Developer-konton, Daniel måste godkänna.
- Captcha (T14 valfri): av som default, ingen akut åtgärd.
- Arena-källa (#35): kräver verifierad per-match-källa (FIFA official).

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta ~1 vecka och har gett dirigenten full fullmakt att merga och beta av hela task-listan autonomt.
>
> Om PR #38 (HOTFIX #37, feature/hotfix-37-fixtures-i-produktion) ÄNNU INTE mergad:
> Merga mot develop: `gh pr merge 38 --merge --repo danielaldemir79/vm-2026`.
> Stäng issue #37 manuellt (`gh issue close 37`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #37 till Done på boarden.
> Verifiera att vm-2026.pages.dev visar matchdata, inga alerts.
>
> Om PR #38 REDAN mergad:
> T1-T7 + T4b + HOTFIX #37 är klara och mergade. Plocka nästa task från boarden.
> **Nästa task: #8 (T8, Dynamiskt dags-tema)** - F2/T8-pin gäller: success-token == accent #0e7a44 i ljust tema, T8 ger success en distinkt AA-klarande ton, ägare design-frontend.
> Skapa feature-branch med `--base develop`, PR med `--base develop`.
>
> Därefter (i ordning, autonomt): T9 (F1/penalties-pin!), T10, T11, T12, T13 - alla Fas 1.
> Sedan T14 (Supabase live - projekt kmzhyblzxangpxydufve, anon-auth på, T14-pin UTÖKAD gäller, RLS per auth.uid()+rum).
> Därefter Fas 2 (T15-T20), Fas 3 (T21-T26).
>
> Bär framåt (alla tasks):
> - **T14-pin UTÖKAD:** flippa LIVE_READY + ta bort interims-warn + uppdatera live-felvägstester + F2-assertion. Se HOTFIX-sektionen ovan.
> - **F2/T8-pin:** success-token == accent-grön (#0e7a44) i ljust tema. T8 ger success en distinkt AA-ton, ägare design-frontend.
> - **F1/penalties-pin (T9):** reducern hanterar inte penalties. T9 fixar.
> - **Supabase:** projekt kmzhyblzxangpxydufve, anon-auth på, Cloudflare-env satt, MCP ansluten.
> - **#35 (arena/stad, Backlog):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **"Behöver Daniel"-kö:** push-notiser (T22), captcha (T14 valfri, av), arena-källa (#35). Notifiera Daniel vid hemkomst.

---

## RESUME-HERE , 2026-06-10 , T7 KLAR - PR #36 väntar på autonom merge

**Branch:** `feature/T7-daglig-matchvy` @ HEAD `d88b8eb`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/36 mot `develop` (Closes #7, state: OPEN)
**Board:** issue #7 i "In Review" (korrekt). Dirigenten stänger issue #7 MANUELLT (`gh issue close 7`) och flyttar kort #7 till Done EFTER merge (auto-close funkar inte mot develop, default-branch är main).

**Autonomt läge: Daniel är borta ~1 vecka.** Full fullmakt: dirigenten mergar till develop och betar av hela listan utan att vänta på Daniel.

**KLART med bevis (SHA + verifiering):**
- `7271d04` - senior-dev funktionellt: daglig matchvy, hero, nedräkning, datumnavigering
- `9d44325` - design-frontend premium: arena i kvällsljus-estetik, matchkort, TeamFlag, TvBadge
- `80dba59` - Copilot R1: C1-C4 (a11y, doc-drift, kontrast, typogr.)
- `da760eb` + `55ed575` + `2b10e69` + `8e34386` - Copilot R2: C5-C8 (inkl. vilodagar hanterade i datumnavigeringen)
- `d88b8eb` - Copilot R3: C9-C10 (HEAD)
- Verifiering (dirigenten, oberoende): **352 tester gröna (37 filer)**, build/lint/format rent, inga secrets
- Alla 6/6 acceptanskriterier bockade i issue #7 (journalisten 2026-06-10)
- Lokal panel: 1 runda (F1 doc-drift rättad nedan, F2 pinnad till T8, F3 kuriosa scopad T10 via 8e34386 + issue-DoD uppdaterad, F4 avvisad - tom-dag-grenen nåbar via C7-fixen så premissen föll)
- Copilot-loop: 4 rundor (4->4->2->0), alla 10 trådar lösta

**Journalist-åtgärd (F1 doc-drift):** `docs/patterns.md` rad ~313 påstod falskt AA-löfte ("Cappa ljusheten ... 42% L -> >= ~5:1"). Empiriskt fel (min ~2.7:1 vid gul hue). Rättat: discen är aria-hidden + redundant, AA krävs inte; uppmätt min-kontrast ~2.7:1 noterat. Ingen falskt AA-kravtext kvar.

**PINNADE punkter (bär framåt):**
- **F2/T8-pin (ägare design-frontend):** success-token == accent #0e7a44 i ljust tema. T8 ger success en distinkt AA-klarande ton.
- **F1/penalties-pin (T9, ägare senior-developer):** reducern hanterar inte `MatchResult.penalties`. Inert i T7 (gruppspel saknar straff). T9 fixar. Acceptanstest: redigera finished slutspelsmatch med straff, penalties bevaras.
- **T14-pin:** Supabase/auth/RLS, inga secrets i repo. Live-klienten fail-loud-stub, T14 tänder den. RLS: restriktera per auth.uid()+rum. Projekt: kmzhyblzxangpxydufve, anon-auth på, Cloudflare-env satt, MCP ansluten.
- **#35 (arena/stad, Backlog):** `Match.venue` = platshållare tills #35 fyller den med verifierad per-match-källa.

**"Behöver Daniel"-kö (han är borta):**
- Push-notiser-setup (T22): kräver Apple/Google Developer-konton, Daniel måste godkänna.
- Captcha (T14 valfri): av som default, ingen akut åtgärd.
- Arena-källa (#35): kräver verifierad per-match-källa (FIFA official).

**FORTSÄTTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel är borta ~1 vecka och har gett dirigenten full fullmakt att merga och beta av hela task-listan autonomt.
>
> Om PR #36 (T7, feature/T7-daglig-matchvy) ÄNNU INTE mergad:
> Merga den mot develop: `gh pr merge 36 --merge --repo danielaldemir79/vm-2026`.
> Stäng sedan issue #7 manuellt (`gh issue close 7`) - auto-close funkar inte mot develop när default-branch är main.
> Flytta kort #7 till Done på boarden.
>
> Om PR #36 REDAN mergad:
> T1-T7 + T4b är alla klara och mergade. Plocka nästa task från boarden.
> **Nästa task: #8 (T8, Dynamiskt dags-tema)** - F2/T8-pin gäller: success-token == accent #0e7a44 i ljust tema, T8 ger success en distinkt AA-klarande ton, ägare design-frontend.
> Skapa feature-branch med `--base develop`, PR med `--base develop`.
>
> Därefter (i ordning, autonomt): T9 (F1/penalties-pin!), T10, T11, T12, T13 - alla Fas 1.
> Sedan T14 (Supabase live - projekt kmzhyblzxangpxydufve, anon-auth på, dokumentera beslut i docs/decisions.md, RLS: restriktera per auth.uid()+rum).
> Därefter Fas 2 (T15-T20), Fas 3 (T21-T26).
>
> Bär framåt (alla tasks):
> - **F2/T8-pin:** success-token == accent-grön (#0e7a44) i ljust tema. T8 ger success en distinkt AA-ton, ägare design-frontend.
> - **F1/penalties-pin (T9):** reducern hanterar inte penalties. T9 fixar.
> - **T14-pin:** Supabase/auth/RLS, inga secrets i repo. RLS måste restriktera per auth.uid()+rum.
> - **Supabase:** projekt kmzhyblzxangpxydufve, anon-auth på, Cloudflare-env satt, MCP ansluten.
> - **#35 (arena/stad, Backlog):** venue = platshållare, fyll när verifierad per-match-källa finns.
> - **"Behöver Daniel"-kö:** push-notiser (T22), captcha (T14 valfri, av), arena-källa (#35). Notifiera Daniel vid hemkomst.

---

## RESUME-HERE , 2026-06-09 , T4b KLAR - PR #34 väntar på autonom merge

**Branch:** `feature/T4b-matchtabla` @ HEAD `69df0f4`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/34 mot `develop` (Closes #31, state: OPEN)
**Board:** issue #31 i "In Review" (korrekt). Dirigenten stänger issue #31 MANUELLT (`gh issue close 31`) och flyttar kort #31 till Done EFTER merge (auto-close funkar inte mot develop, default-branch ar main).

**Autonomt lage: Daniel ar borta ~1 vecka.** Full fullmakt: dirigenten mergar till develop och beta av hela listan utan att vanta pa Daniel.

**KLART med bevis (SHA + verifiering):**
- `359eca1` - T4b bygge: gold-source (`tv-schedule-source.txt`) + delad parser (Europe/Stockholm->UTC, tsString single-quote) + genererad `matches.ts` (72 gruppmatcher + 32 slutspelsmatcher M73-M104), varde-last (regenerera-och-diffa + mutationstest)
- `e5c8e5e` - Copilot C1: ratta kickoffUtc-kommentarer till UTC
- `d6661f6` - Copilot C2: korskolla slutspels-STAGE mot bracket-structure (mutationstest pa gold-source-niva)
- `69df0f4` - Copilot C3: ratta parseSchedule-kommentaren till kalltext-ordning (HEAD)
- Verifiering (dirigenten): **291 tester grona (30 filer)**, build/lint/format rent, inga secrets
- Alla 6/6 acceptanskriterier bockade i issue #31 (journalisten 2026-06-09)
- Lokal panel: 1 runda (REN, inga blockerare). Copilot: 4 rundor (1->1->2->0 fynd), alla 4 tradar losta

**STORT POSITIVT FYND:** TV-tablan (oberoende kalla) stammer EXAKT mot T4:s `bracket-structure.ts` pa alla 32 slutspelsmatcher + 72 gruppmatcher, 0 avvikelser. Tva oberoende kallor bekraftar FIFA-motorn.

**PINNADE punkter (bar framat):**
- **F1/penalties (T6->T9, agare senior-developer):** reducern tar inte med `MatchResult.penalties`. Inerst i T6 (gruppspel saknar straff). Nar slutspelsinmatning (T9) byggs: hantera penalties. Acceptanstest: redigera finished slutspelsmatch med straff, penalties bevaras.
- **T7-pin:** ljust tema, accent == success (#0e7a44). T7 ska ge success en distinkt AA-klarande ton.
- **T14-pin:** Supabase/auth/RLS, inga secrets i repo. Live-klienten fail-loud-stub, T14 tander den.
- **T14 extra (RLS):** anon-rollen matchar authenticated-rollen. RLS maste restriktera per auth.uid()+rum nar T14 byggs. Supabase-projekt kmzhyblzxangpxydufve.
- **Supabase provisionerat:** projekt kmzhyblzxangpxydufve, anon-auth PA, Cloudflare-env satt av Daniel, MCP ansluten. T14 kan byggas live.
- **#35 (arena/stad):** pa boarden i Backlog. `Match.venue` = synlig platshallare tills #35 fyller den. Arena fran T4b ar medvetet ej gissad.

**"Behover Daniel"-ko (han ar borta):**
- Push-notiser-setup (T22): kraver Apple/Google Developer-konton, Daniel maste godkanna.
- Captcha (T14 valfri): av som default, ingen akut atgard.
- Arena-kalla (#35): krav ar verifierad per-match-kalla (FIFA official), ingen kalla i T4b-scopet.

**EXAKT nasta steg (autonomt):**
1. Dirigenten mergar PR #34 mot `develop` (`gh pr merge 34 --merge --repo danielaldemir79/vm-2026`).
2. Dirigenten stanger issue #31 manuellt (`gh issue close 31`).
3. Dirigenten flyttar kort #31 till Done pa boarden.
4. **Nasta task: #7 (T7, Daglig matchvy + hero + nedrakning + datumnavigering)** - nu har den riktig matchdata (tider/kanaler) fran T4b. Frontend-task (senior-dev + design-frontend). T7-pin (success-ton AA-ton).
5. Darefter T8-T13 (Fas 1), sen T14 (Supabase live, provisionerat), sen Fas 2-3.

**FORTSATTNINGS-PROMPT (autonom session):**
> Kor `/agent-kit` i `C:\Repo\vm-2026`. Daniel ar borta ~1 vecka och har gett dirigenten full fullmakt att merga och beta av hela task-listan autonomt.
>
> Om PR #34 (T4b, feature/T4b-matchtabla) ANNU INTE mergad:
> Merga den mot develop: `gh pr merge 34 --merge --repo danielaldemir79/vm-2026`.
> Stang sedan issue #31 manuellt (`gh issue close 31`) - auto-close funkar inte mot develop nar default-branch ar main.
> Flytta kort #31 till Done pa boarden.
>
> Om PR #34 REDAN mergad:
> T1-T6 + T4b ar alla klara och mergade. Plocka nasta task fran boarden.
> **Nasta task: #7 (T7, Daglig matchvy + hero + nedrakning + datumnavigering)** - nu har T7 riktig matchdata (tider + kanaler) fran T4b. Frontend-task (senior-dev + design-frontend). T7-pin galler: accent == success (#0e7a44) i ljust tema, ge success en distinkt AA-klarande ton.
> Skapa feature-branch med `--base develop`, PR med `--base develop`.
>
> Darefter (i ordning, autonomt): T8, T9 (F1/penalties-pin!), T10, T11, T12, T13 - alla Fas 1.
> Sedan T14 (Supabase live - projekt kmzhyblzxangpxydufve, anon-auth PA, dokumentera beslut i docs/decisions.md, RLS: restriktera per auth.uid()+rum).
> Darefter Fas 2 (T15-T20), Fas 3 (T21-T26).
>
> Bar framat (alla tasks):
> - **F1/penalties-pin (T9):** reducern hanterar inte penalties. T9 fixar.
> - **T7-pin:** ljust tema, accent == success-gron (#0e7a44). T7 ger success en distinkt AA-ton.
> - **T14-pin:** Supabase/auth/RLS, inga secrets i repo. RLS maste restriktera per auth.uid()+rum.
> - **Supabase:** projekt kmzhyblzxangpxydufve, anon-auth PA, Cloudflare-env satt, MCP ansluten.
> - **#35 (arena/stad, Backlog):** venue = platshallare, fyll nar verifierad per-match-kalla finns.
> - **"Behover Daniel"-ko:** push-notiser (T22), captcha (T14 valfri, av), arena-kalla (#35). Notifiera Daniel vid hemkomst.

---

## RESUME-HERE , 2026-06-09 , T6 KLAR - PR #33 väntar på autonom merge

**Branch:** `feature/T6-resultatinmatning` @ HEAD `d449e00`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/33 mot `develop` (Closes #6, state: OPEN)
**Board:** issue #6 i "In Review" (korrekt). Dirigenten stänger issue #6 MANUELLT (`gh issue close 6`) och flyttar kort #6 till Done EFTER merge (auto-close funkar inte mot develop, default-branch ar main).

**Autonomt lage: Daniel ar borta ~1 vecka.** Han har gett dirigenten full fullmakt att merga till develop och beta av hela task-listan. Vanta inte pa Daniel.

**KLART med bevis (SHA + verifiering):**
- `6d054d3` - delad results-store (ResultsProvider, results-context), validering + reducer, a11y-formular, optimistisk UI (senior-dev funktionellt, T6)
- `6aa7e21` - besluts-logg + monster for delad results-store + malfirande-seam (`docs/decisions.md`, `docs/patterns.md`)
- `775de6b` - premium design: resultatinmatning + malfirande-overlay (GoalCelebrationOverlay, konfetti, reduced-motion-saker krok)
- `04d17dc` - Copilot R1: a11y + fel-semantik + doc-typo
- `033f629` - Copilot R2: setMatches-seam race-fri (synkron ref-uppdatering)
- `e995e0e` - Copilot R3: exhaustive-deps + doc-konsekvens (eslint-plugin-react-hooks v6 flat-config fix)
- `46bba30` - Copilot R4: type predicate som faktiskt narrowar
- `d449e00` - Copilot R5: synk + a11y-edge (HEAD)
- Verifiering (dirigenten, oberoende): **265 tester grona (29 filer)**, build/lint/format rent, inga secrets
- Alla 6/6 acceptanskriterier bockade i issue #6 (journalisten 2026-06-09)
- Copilot-loop: 5 rundor (4->1->3->1->2 fynd), ALLA adresserade, 11/11 tradar losta
- Lokal panel: 1 runda, godkand, inga blockerare

**Viktig lardom inbakad i eslint.config.js:**
eslint-plugin-react-hooks v6 bytte `configs.recommended` fran objekt till flat-config-array.
`...config.recommended.rules` spred `...undefined` tyst - reglerna var TYSTA AVSTANGDA.
Fixat med explicit registrering. "Gron lint" != "regeln passerade". Se `verifiera-att-lint-regel-ar-registrerad-inte-bara-tyst` i playbook.

**PINNADE punkter (bar framat):**
- **F1 (T6->T9, agare senior-developer):** reducern tar inte med `MatchResult.penalties`. Inert i T6 (gruppspel saknar straffar). Nar slutspelsinmatning (T9) byggs: hantera penalties eller gata bort stage!=group. Acceptanstest: redigera finished slutspelsmatch med straffar, penalties bevaras.
- **T7-pin:** ljust tema, accent == success (#0e7a44). T7 ska ge success en distinkt AA-klarande ton, inte samma som accent.
- **T14-pin:** Supabase/auth/RLS, inga secrets i repo. Live-klienten fail-loud-stub, T14 tander den.
- **T14 extra (RLS):** anon-rollen i Supabase matchar authenticated-rollen. RLS maste restriktera per auth.uid() + rum nar T14 byggs. Se Supabase-projekt kmzhyblzxangpxydufve.
- **Supabase provisionerat:** projekt kmzhyblzxangpxydufve, anon-auth PA, Cloudflare-env satt av Daniel, MCP ansluten. T14 kan byggas live. Dokumentera i `docs/decisions.md` nar T14 byggs.

**"Behover Daniel"-ko (han ar borta):**
- Push-notiser-setup (T22): kraver Apple/Google Developer-konton, Daniel maste godkanna.
- Captcha (T14 valfri): av som default, ingen akut atgard.
Logga ovan har for hans hemkomst.

**EXAKT nasta steg (autonomt):**
1. Dirigenten mergar PR #33 mot `develop` (`gh pr merge 33 --merge --repo danielaldemir79/vm-2026`).
2. Dirigenten stanger issue #6 manuellt (`gh issue close 6`).
3. Dirigenten flyttar kort #6 till Done pa boarden.
4. **Nasta task: #31 (T4b, Matchabla)** - fas 1, byggbar. Daniel har gett fullstandig TV-tabla (gruppspel + slutspel, tider + kanaler SVT/TV4). Korskolla mot T4:s lag/grupp-data + slutspelskopplingar (matchnummer 73-104) mot FIFA-motorn.
5. Darefter T7-T13 (Fas 1), sen T14 + Fas 2 (Supabase live), sen Fas 3.

**FORTSATTNINGS-PROMPT (autonom session):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Daniel ar borta ~1 vecka och har gett dirigenten full fullmakt att merga och beta av hela task-listan autonomt.
>
> Om PR #33 (T6, feature/T6-resultatinmatning) ANNU INTE mergad:
> Merga den mot develop: `gh pr merge 33 --merge --repo danielaldemir79/vm-2026`.
> Stang sedan issue #6 manuellt (`gh issue close 6`) - auto-close funkar inte mot develop nar default-branch ar main.
> Flytta kort #6 till Done pa boarden.
>
> Om PR #33 REDAN mergad:
> T1-T6 ar alla klara och mergade. Plocka nasta task fran boarden.
> **Nasta task: #31 (T4b, Matchtabla, fas 1)** - byggbar nu. Daniel har lamnat fullstandig TV-tabla (gruppspel + slutspel, tider + kanaler SVT/TV4/Viaplay). Korskolla mot T4:s lag/grupp-data + FIFA-motorn (matchnummer 73-104 for slutspelet).
> Skapa feature-branch med `--base develop`, PR med `--base develop`.
>
> Darefter (i ordning, autonomt): T7 (success-token AA-ton, T7-pin!), T8, T9 (F1-pin penalties!), T10, T11, T12, T13 - alla Fas 1.
> Sedan T14 (Supabase live - projekt kmzhyblzxangpxydufve, anon-auth PA, dokumentera beslut i docs/decisions.md, RLS: restriktera per auth.uid()+rum).
> Darefter Fas 2 (T15-T20), Fas 3 (T21-T26).
>
> Bar framat (alla tasks):
> - **F1-pin (T9):** reducern hanterar inte penalties. T9 fixar.
> - **T7-pin:** ljust tema, accent == success-gron (#0e7a44). T7 ger success en distinkt AA-ton.
> - **T14-pin:** Supabase/auth/RLS, inga secrets i repo. RLS maste restriktera per auth.uid()+rum.
> - **Supabase:** projekt kmzhyblzxangpxydufve, anon-auth PA, Cloudflare-env satt, MCP ansluten.
> - **"Behover Daniel"-ko:** push-notiser (T22), captcha (T14 valfri, av). Notifiera Daniel vid hemkomst.

---

## RESUME-HERE , 2026-06-09 , T5 KLAR - PR #32 väntar på Daniels merge

**Branch:** `feature/T5-gruppspelsvy` @ HEAD `ea8e363`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/32 mot `develop` (Closes #5, state: OPEN)
**Board:** issue #5 i "In Review" (korrekt). Dirigenten stänger issue #5 MANUELLT (`gh issue close 5`) och flyttar kort #5 till Done EFTER Daniels merge (auto-close funkar inte mot develop när default-branch är main).

**KLART med bevis (SHA + verifiering):**
- `23f50ff` - Fixtures kopplad till verifierad T4-data (12 grupper, 48 lag)
- `fb39d84` - Gruppspelsvy: `derive-group-tables.ts`, `use-group-data.ts`, `GroupTable`, `GroupStageView` (12 grupper, härledd state, setMatches-seam för T6)
- `6b9a8a3` - Besluts-logg + mönster för härledd-state-vy (`docs/decisions.md`, `docs/patterns.md`)
- `58ac246` - Premium-UI: "arena i kvällsljus"-kort, responsivt rutnät 1/2/3/4 kol, stagger, skelett, FÄRG-OBEROENDE kvalificeringszon (T7-pin respekterad)
- `d20f3a8` - Copilot R1: C1 explicit CSSProperties-import, C2 test-settle-robusthet (C3 avvisad)
- `88fdfe8` - Copilot R2: C8 tables-kontrakt (härleds bara i ready), C4-C7 stabil env-ref i test
- `ea8e363` - Copilot R3: C9 skelett-antal = gruppantalet (ingen CLS), C10 rad-scopad S/P-cell-assertion
- Verifiering (dirigenten, oberoende): **201 tester gröna (22 filer)**, build/lint/format rent, inga secrets
- Alla 5/5 acceptanskriterier bockade i issue #5
- T7-pin verifierad live (accent==success i ljust tema, kvalificeringszon FÄRG-OBEROENDE)
- Responsivt verifierat 360-1920px, ingen CLS/overflow

**Copilot-loop:** 3 rundor (3 -> 5 -> 2 -> 0 fynd). Alla 10 trådar lösta.

**PINNADE punkter (bär framåt):**
- **F1-pin (T5, ägare senior-developer):** `ABBREVIATIONS` i `GroupStageView.tsx` är hand-synkad dubblett av `NUMERIC_COLUMNS` i `GroupTable.tsx` utan synk-vakt. Medvetet pinnad (DRY rule-of-three, 2:a förekomsten). Åtgärd vid 3:e användning eller kolumnändring: härled legenden ur GroupTables exporterade kolumn-metadata, eller ett test som assertar legend ↔ columnheader-texter.
- **T7-pin:** i ljust tema är accent==success (#0e7a44). T7 ska ge success en distinkt AA-klarande ton, inte samma som accent. T5:s kvalificeringszon är färg-oberoende och bryter inte.
- **T14-pin:** Supabase/auth/RLS, inga secrets i repo. Live-klienten fail-loud-stub, T14 tänder den.
- **#31 (matchtablå):** 72 gruppmatcher, tider, arenor + svenska TV-kanaler. Kräver bekräftad svensk TV-källa (kan behöva Daniel). Backlog.

**EXAKT nästa steg:**
1. Daniel mergar PR #32 mot `develop`.
2. Dirigenten kör `gh issue close 5` manuellt (auto-close funkar inte mot develop).
3. Dirigenten flyttar kort #5 till Done på boarden.
4. Nästa byggbara task: **T6 (#6, Resultatinmatning)** - beror på T3+T4+T5. Kopplar in på `useGroupData.setMatches`-seamen (redan testad i T5). Alternativt **T31 (#31, Matchtablå)** om Daniel bekräftar svensk TV-källa.

**FORTSÄTTNINGS-PROMPT:**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. T5 är klar (läs `HANDOFF.md`).
>
> Om PR #32 ÄNNU INTE mergad: Daniel mergar den manuellt mot `develop`. Dirigenten stänger sedan issue #5 MANUELLT (`gh issue close 5`) - auto-close funkar inte mot develop när default-branch är main - och flyttar kort #5 till Done på boarden.
>
> Om PR #32 REDAN mergad: plocka nästa task.
> T1, T2, T3, T4, T5 är alla klara och merge:ade. Nästa byggbara Fas 1-task:
> - **T6 (#6, Resultatinmatning)** - beror på T3+T4+T5, direkt byggbar. Kopplar in på `useGroupData.setMatches`-seamen (redan testad). REKOMMENDATION: starta T6 i en FÄRSK `/agent-kit`-session (en task per session är default-kadensen, håller kvaliteten hög).
> - **T31 (#31, Matchtablå)** - byggbar, kräver bekräftad svensk TV-källa - fråga Daniel om den finns redo.
> Skapa feature-branch med `--base develop`, PR med `--base develop`.
>
> Bär framåt:
> - **F1-pin (T5):** `ABBREVIATIONS` i GroupStageView är hand-synkad dubblett av `NUMERIC_COLUMNS` i GroupTable utan synk-vakt. Åtgärd vid 3:e användning eller kolumnändring.
> - **T7-pin:** ljust tema, accent == success-grön (#0e7a44). T7 ska ge success en distinkt AA-ton.
> - **T14-pin:** Supabase/auth/RLS, inga secrets i repo.
> - **#31:** kräver bekräftad svensk TV-källa (fråga Daniel).

---

## RESUME-HERE , 2026-06-09 , T4 KLAR - PR #30 väntar på Daniels merge

**Branch:** `feature/T4-kritisk-data` @ HEAD `921a3f4`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/30 mot `develop` (Closes #4, state: OPEN)
**Board:** issue #4 i "In Review" (korrekt, dirigenten stänger issue #4 MANUELLT via `gh issue close 4` och flyttar kort #4 till Done EFTER Daniels merge - auto-close funkar inte mot develop när default-branch är main).

**KLART med bevis (SHA + verifiering):**
- `33a123d` - Treeplats-/slutspelsmotor (FIFA Annexe C 495-tabell, M73-M104, BracketSlot-graf) + F1 tiebreak-re-iteration
- `0e988b0` - 48 lag + 12 grupper (lottningen 2025-12-05, källkollad Wikipedia + Sky/OneFootball/UEFA)
- `3669824` - Källåkring: committat FIFA-källutdrag (`annexe-c-source.txt`) + delad parser + regenerera-och-diffa-test + mutationstest
- `cf896a5` - Copilot runda 1-fix (C1 readonly, C2 test-assert, C3 vite-node-generator, C5 fail-loud tiebreak)
- `6ebcfb3` - Copilot runda 2-fix (C6 doc-drift, C7 explicit A-L-ordning, C8 fail-loud `setOnce` på winnerGoesTo + TABLE_INDEX)
- `921a3f4` - Copilot runda 3-fix (C9 fail-loud dup rad-id i parseAnnexeC)
- Verifiering (dirigenten, oberoende): **174 tester gröna (18 filer)**, build grönt, lint rent, format rent, inga secrets
- Dataintegritets-låset bevisat: en mittraden-mutation gör källånkrings-testet RÖTT (strukturella testet förblir grönt - visar gapet)
- Reviewern jämförde alla 495 källutdrags-rader mot FIFA:s officiella PDF: 0 avvikelser
- 6/6 acceptanskriterier bockade i issue #4

**F1-pinnen (från T3): STÄNGD**
FIFA artikel 13 KRÄVER re-iteration av inbördes-kriterierna på kvar-lika delmängd. Implementerad + bevisad med test. T3:s KISS-avgränsning är avgjord och stängd.

**F3-scope-beslut (Daniel godkände 2026-06-09):**
Den fullständiga matchtablån (72 gruppmatchers tider/arenor + svenska TV-kanaler) flaggades medvetet och flyttades till task **#31** (Backlog, phase-1). Issue #4:s acceptanskriterier uppdaterades till motorn + lag/grupper + F1.

**PINNADE punkter (bär framåt):**
- **T7-pin:** i ljust tema är accent == success-grön (#0e7a44). T7 ska ge success en distinkt AA-klarande ton, inte samma som accent.
- **T14-pin:** Supabase/auth/RLS, inga secrets i repo. Live-Supabase-klienten är en medveten fail-loud-stub, T14 tänder den.

**EXAKT nästa steg:**
1. Daniel mergar PR #30 mot `develop`.
2. Dirigenten kör `gh issue close 4` manuellt (stänger issue #4; auto-close fungerar inte mot develop).
3. Dirigenten flyttar kort #4 till Done på boarden.
4. Nästa byggbara task: **T5 (#5, Gruppspelsvy + live-tabeller)** - beror på T3+T4, båda klara efter merge. Alternativt **T6 (#6, Resultatinmatning)** eller **T31 (#31, Matchtablå)** - kräver svensk TV-källa, Daniel behöver godkänna källa-val.

**FORTSÄTTNINGS-PROMPT:**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. T4 är klar (läs `HANDOFF.md`).
>
> Om PR #30 ÄNNU INTE mergad: Daniel mergar den manuellt mot `develop`. Dirigenten stänger sedan issue #4 MANUELLT (`gh issue close 4`) - auto-close funkar inte mot develop när default-branch är main - och flyttar kort #4 till Done på boarden.
>
> Om PR #30 REDAN mergad: plocka nästa task.
> T1, T2, T3, T4 är alla klara och merge:ade. Nästa byggbara Fas 1-tasks:
> - **T5 (#5, Gruppspelsvy + live-tabeller)** - beror på T3+T4, direkt byggbar.
> - **T6 (#6, Resultatinmatning)** - beror på T3+T4+T5 (kolla beroenden i issue-bodyn).
> - **T31 (#31, Matchtablå)** - byggbar efter T4, kräver en bekräftad svensk TV-källa, fråga Daniel om den finns redo.
> Skapa feature-branch med `--base develop`, PR med `--base develop`.
>
> Bär framåt:
> - **T7-pin:** ljust tema, accent == success-grön (#0e7a44). T7 ska ge success en distinkt AA-klarande ton.
> - **T14-pin:** Supabase/auth/RLS, inga secrets i repo.
> - F1-pinnen (tiebreak re-iteration) är STÄNGD - ta INTE med som öppen pinne framåt.

---

## RESUME-HERE , 2026-06-09 , T3 KLAR - PR #29 väntar på Daniels merge

**Branch:** `feature/T3-datalager` @ HEAD `489995d`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/29 mot `develop` (Closes #3, state: OPEN)
**Board:** issue #3 i "In Review" (korrekt, dirigenten flyttar till Done EFTER Daniels merge).
**Copilot-loop:** 4 rundor (6 -> 2 -> 2 -> 0 fynd), PR ren.

**KLART med bevis (SHA + verifiering):**
- `bf78607` - Domänmodell, fixtures-först, env-gate, tabellberäkning med FIFA-tiebreakers
- `4ebabe4` - FIFA-tiebreak-beslut dokumenterat + fixtures-mönstret i docs/patterns.md
- `7fd8bd1` - Cloudflare-produktionsgren-rättning (main -> develop) i deploy.md/decisions.md/SPEC.md/CLAUDE.md
- `b83c43b` - Copilot runda 1: C1 group-filter, C2 regressionstester, C3/C4 3-bokstavskoder, C5 memoiserad live-promise, C6 docstring
- `3d6a264` - Copilot runda 2: C7+C8 Match diskriminerad union, FinishedMatch bär icke-null result
- `489995d` - Copilot runda 3: C9+C10 groupId-för-gruppmatch som datakontrakt, ej typgaranti
- Verifiering (oberoende, dirigenten på `489995d`): **111 tester gröna (10 filer)**, build grönt, lint rent, format rent, inga secrets
- FIFA-tiebreak-ordning källverifierad mot 2 oberoende källor (ESPN + aggregat): VM 2026 har inbördes möte FÖRE total målskillnad, koden gör rätt
- 5/5 acceptanskriterier bockade i issue #3 (av journalisten 2026-06-09)

**PINNADE punkter (bär framåt):**
- **F1 (T4, critical):** tabellberäkningen re-itererar INTE inbördes-tabellen för en kvar-lika-delmängd (3+ lag lika, några men inte alla separeras). Medveten KISS-avgränsning i T3, dokumenterad. **T4 ska aktivt besluta om full FIFA-iteration behövs och, om ja, skriva ett test som konstruerar kvar-lika-delmängd och bevisar re-iterationen.** Ägare: senior-dev i T4. (Källa: `compute-standings.ts` ~rad 209-215.)
- **T7-pin:** ljust tema, accent == success-grön (#0e7a44). T7 ska ge success en distinkt AA-klarande ton.
- **T14 hög-risk:** Supabase/auth/RLS, inga secrets i repo. Live-Supabase-klienten är en medveten fail-loud-stub, T14 tänder den.
- **Cloudflare KOPPLAT:** produktion = `develop`, live på vm-2026.pages.dev. T1:s Cloudflare-pin är STÄNGD.

**FORTSÄTTNINGS-PROMPT:**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. T3 är klar (läs `HANDOFF.md`).
>
> Om PR #29 ÄNNU INTE mergad: Daniel mergar den manuellt mot `develop`. Dirigenten
> uppdaterar board-kortet (#3) till Done efter merge.
>
> Om PR #29 REDAN mergad: plocka nästa task.
> **T4 (#4, critical - FIFA-data)** är nästa, beror på T3. Label `critical` -> bredare review-panel.
> Skapa feature-branch med `--base develop`, PR med `--base develop`.
> Bär in dessa pinnar i T4:
> - **F1-pinnen:** besluta om full FIFA-re-iteration (kvar-lika-delmängd) behövs och lägg i så fall ett test som bevisar det. Aldrig gissa treeplats-delmängd ur tabell, det kör via FIFA:s fastlagda tabell (SPEC §5/§8).
> - **Treeplats-seedning aldrig gissa:** tabell-driven, uttömmande tester, källor i SPEC §8.
> - T7-pin, T14-pin lever vidare.

---

## RESUME-HERE , 2026-06-09 , T2 KLAR - PR #28 väntar på Daniels merge

**Branch:** `feature/T2-design-temasystem` @ HEAD `89c38c8`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/28 mot `develop` (Closes #2, state: OPEN)
**Board:** issue #2 i "In Review" (korrekt, dirigenten flyttar till Done EFTER Daniels merge).

**KLART med bevis (SHA + verifiering):**
- `7dd4e96`, `92ac586` - Tema-motor (provider, no-flash tema-init, token-kontrakt, rörelse-primitiver)
- `953f4cf`, `f616aa3`, `0a31b6c` - Premium-estetik ("arena i kvällsljus"-palett, typografi, toggle, showcase)
- `94f9eac` - Lokal review F1 (copy-typografi) + F2 (doc-drift) åtgärdade
- `215e854`, `f5ea324`, `3e224cd`, `9d42a2a` - Copilot-rundor 1-4 åtgärdade
- `89c38c8` - Robusthetsfiks: localStorage-åtkomst kan kasta, tema-byte kraschar inte längre
- Lokal verifiering: lint rent, format rent, **66 tester gröna**, build grönt (PWA genererad, no-flash-script injicerat i `<head>`)
- WCAG AA-kontrast verifierad i båda teman, responsivt verifierat per skärmklass
- No-flash, tema-toggle (aria-pressed/label, fokus-ring, persistens) verifierat live
- **0 olösta review-trådar** (5 Copilot-rundor, alla fynd dispositionerade)

**PINNADE punkter (bär framåt till berörda tasks):**
- **F3-pin (T7):** i ljust tema är accent och success samma forest-grön (#0e7a44); resultat-vyn T7 ska ge success en egen, AA-klarande ton distinkt från accent.
- **Medvetet avvisat (ej TODO):** inline-scriptets 'dark'/'light'-strängar (theme-init.ts) härleds inte ur THEMES - bundna till matchMedia-query-semantiken, inte en bugg.
- **Cloudflare (från T1, ägare Daniel):** koppling enligt `docs/deploy.md` kvarstår om inte gjord sedan T1.
- **GitHub default-branch är `main`:** PR:er måste skapas med `--base develop`.

**FORTSÄTTNINGS-PROMPT:**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. T2 är klar (läs `HANDOFF.md`).
>
> Om PR #28 ÄNNU INTE mergad: Daniel mergar den manuellt mot `develop`. Dirigenten
> uppdaterar board-kortet (#2) till Done efter merge.
>
> Om PR #28 REDAN mergad: T1 och T2 är klara. Plocka nästa byggbara task.
> **T3 (#3, datalager)** är byggbar (beror bara på T1, se issue-bodyn). Kör T3 näst,
> sen den kritiska **T4 (#4, FIFA-data)** - treeplats-seedning, aldrig gissa.
> Skapa feature-branch med `--base develop`, PR med `--base develop`.
>
> OBS bär framåt hela vägen:
> - T7-pin: ljust tema, accent == success-grön, ge success en distinkt AA-ton i T7.
> - T4 kritisk FIFA-data: tabell-driven + uttömmande tester, aldrig gissa treeplats-mappning.
> - T14 hög-risk: Supabase/auth + RLS + secrets, inga nycklar i repo.
> - Cloudflare-koppling (ägare Daniel): `docs/deploy.md` om ej gjord.

---

## RESUME-HERE , 2026-06-09 , T1 KLAR - PR #27 väntar på Daniels merge

**Branch:** `feature/T1-pwa-skelett-cicd` @ HEAD `5b710b2`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/27 mot `develop` (Closes #1, state: OPEN)
**Board:** issue #1 ligger i kolumnen "In Review" (korrekt, dirigenten flyttar till Done EFTER Daniels merge).

**KLART med bevis (SHA + verifiering):**
- `35a4df1` - React + Vite + TS-scaffold med toolchain
- `81dd84b` - PWA-skal, app-shell-platshallare och smoke-test
- `5b710b2` - CI-kvalitetsgrind + Cloudflare-deploy via git-integration
- Lokal verifiering: lint rent, format rent, test 2/2 grönt, build grönt (sw.js + manifest.webmanifest + registerSW.js, 10 precache-entries)
- CI GitHub Actions run 27191855440: grönt pa PR #27
- Oberoende bekräftad av dirigenten: lint, format, test, build alla gröna

**PINNAD punkt (ägare Daniel):**
- Cloudflare Pages-koppling: förhandsvisning på PR-URL kräver Daniels manuella engångs-koppling i Cloudflare-dashboarden. Steg-för-steg finns i `docs/deploy.md`. Denna acceptanspunkt (issue #1) är medvetet lämnad obockad tills Daniel gjort det.

**Öppna risker:**
- **T4 (#4) kritisk FIFA-data:** treeplats-seedning får ALDRIG gissas, own review-grind. Bygg tabell-driven + uttömmande tester. Källor i SPEC §8.
- **T14 (#14) hög-risk:** Supabase/auth + RLS + secrets, inga nycklar i repo.
- **GitHub default-branch är `main`:** PR:er MÅSTE skapas med `--base develop` explicit.

**FORTSÄTTNINGS-PROMPT:**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. T1 är klar (läs `HANDOFF.md`).
>
> Om PR #27 ÄNNU INTE mergad: Daniel ska merga den manuellt mot `develop`. Påminn om
> Cloudflare-kopplingen i `docs/deploy.md` efteråt (pinnad punkt, ägare Daniel).
> Dirigenten uppdaterar board-kortet (#1) till Done efter merge.
>
> Om PR #27 REDAN mergad: plocka nästa byggbara task. T2 (#2, design/tema) och
> T3 (#3, datalager) är båda byggbara efter T1 (inga fler beroenden, se issue-bodyn).
> Välj den med lägst risk eller högst värde enligt SPEC och boarden.
> Skapa feature-branch med `--base develop`, PR med `--base develop`.
>
> OBS hela vägen: T4 (#4) kritisk FIFA-data (treeplats-tabell, aldrig gissa),
> T14 (#14) hög-risk auth (RLS + secrets).

---

## 2026-06-09 , Inception KLAR och godkänd, redo att bygga T1

**Läge:** Agent Kit Fas 0 (inception) är klar och godkänd av Daniel. SPEC utökad och låst,
26 tasks på board, redo för bygg-pipelinen. Inget byggt än (ingen kod i repot).

**Branch:** `develop`. Inception-innehåll committat i `ed524aa`, denna HANDOFF i efterföljande
commit. `main` @ `c896cfb`. Arbetsträd rent, pushat till origin.

**KLART (med bevis):**
- `docs/SPEC.md` + `CLAUDE.md` + `docs/decisions.md` + `docs/patterns.md` uppdaterade/skapade,
  committat `ed524aa` på develop, pushat.
- Stack låst: React + Vite + TS, Tailwind + Framer Motion, vite-plugin-pwa, Supabase.
  Hosting: Cloudflare Pages (produktion från develop, live på vm-2026.pages.dev, förhandsvisning
  per PR; main reserverad för framtida releaser, rättat 2026-06-09 i T3, se docs/decisions.md).
- Board (GitHub Projects #2, https://github.com/users/danielaldemir79/projects/2): 26 tasks
  (issue #1-#26), 4 faser, kolumner Backlog -> Ready -> In Progress -> In Review -> Done.
  **T1 (#1) i Ready**, resten Backlog. Etiketter: phase-0/1/2/3, critical (#4), high-risk (#14).
- Oberoende fullständighets-review: **CLEAN** (2 luckor hittade + stängda i #6 och #13).

**Mänskliga beslut redan tagna (av Daniel denna session):**
- Hela utökade menyn (26 tasks) godkänd.
- Hosting = Cloudflare Pages.
- Tempo = kvalitet före tidspress (Fas 1 byggs ordentligt, inte minimal snabb-deploy).
- Bygget startas i en färsk session.

**EXAKT nästa steg:** Bygg **T1 (#1: PWA-skelett + CI/CD + tidig deploy)**. Enda Ready-tasken,
inga beroenden. Efter T1 blir T2 (#2) och T3 (#3) byggbara (Fas 0).

**Öppna risker / OBS:**
- **T4 (#4) kritisk data:** FIFA-treeplats-seedning får ALDRIG gissas, egen review-grind.
  Källor i SPEC §8. Bygg tabell-driven + uttömmande tester.
- **T14 (#14) hög-risk:** Supabase/auth + RLS + secrets, inga nycklar i repo.
- **GitHubs default-branch är fortf. `main`** (auto-läget nekade ändring till develop).
  PR:er MÅSTE skapas med `--base develop` explicit.

**FORTSÄTTNINGS-PROMPT (starta nästa session med denna):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Inception är klar och godkänd (läs `HANDOFF.md` +
> `docs/SPEC.md`). Plocka **T1 (#1)** från boardens Ready och bygg den genom pipelinen.
> OBS: skapa PR med `--base develop` (default-branch är `main`). Om T1 redan är mergad till
> develop: plocka nästa byggbara task (T2/T3) enligt beroenden i issue-bodyn. Är hela Fas 0
> klar: fortsätt med Fas 1 och den kritiska data-tasken T4.
