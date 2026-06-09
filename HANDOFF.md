# HANDOFF , VM 2026

Var projektet står just nu. Nyaste överst. Bryggan mellan sessioner: disken är sanningen,
chatten är kladdpapper. En tom session ska kunna återskapa hela läget härifrån + boarden.

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
