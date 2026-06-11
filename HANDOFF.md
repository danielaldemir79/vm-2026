# HANDOFF , VM 2026

Var projektet står just nu. Nyaste överst. Bryggan mellan sessioner: disken är sanningen,
chatten är kladdpapper. En tom session ska kunna återskapa hela läget härifrån + boarden.

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

**Verifiering:** 953 tester gröna + 29 env-skippade (+30 nya). Lokal panel: godkänd (1 avvisad nit, code-vs-id-seamen verifierad airtight via negativ kontroll). Copilot 3 rundor (1->2->0). Build/lint/format rent. Datakärnan/RLS oförandrad sedan T16.

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
