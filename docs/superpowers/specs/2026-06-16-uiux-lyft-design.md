# VM 2026 , UI/UX-lyft, north star (v2)

Datum: 2026-06-16. Beslutad med Daniel (full delegering: "jag litar pa ditt
omdome, styr mot basta mojliga resultat"). Detta dokument ar den TVARGAENDE
riktningen som ALLA v2-tasks (T83-T95) ska folja. Per-task-detaljer bor i
respektive GitHub-issue; SPEC SS13 har den ursprungliga v2-omfattningen. Det
har dokumentet vinner vid konflikt om visuell/UX-riktning.

## Problemet (Daniels rapport 2026-06-15/16)

Appen kanns for lang, rorig och skrammande ("for mycket pa en gang"), och det
ar svart att hitta ratt sak. Detta ar ett ARKITEKTUR- och TATTHETS-problem,
inte ett "fult utseende"-problem. Losningen ar fokus och progressiv
avslojning, inte en omdesign av farger/typografi.

## Visuell ambition (LAST)

**Forfina nuvarande identitet till proffsklass + selektiva wow-moment.**
Behall ljus/gron/rundad-kort-identiteten. Gor den stram, konsekvent och
mindre tat-packad. Lagg till nagra fa hog-impact delight-moment (hero,
live-puls, mjuk motion). INGEN full omdesign (hog risk mitt under VM, loser
inte karnproblemet battre). Allt motion respekterar reduced-motion.

## North star, 6 principer

1. **Fokuserade flikar, inte en lang sida (T83).** 5 flikar nederst pa mobil
   (Sofascore-monster), responsiv nav pa desktop. Ordning (beslut U4):
   **Idag -> Tips -> Topplista -> Turnering -> Mer.** Varje flik visar bara
   sitt = inget skrammer, allt ar latt att hitta. Detta ar grundlosningen pa
   "for lang".
2. **Progressive disclosure.** Visa sammanfattning, gom detaljen tills den
   efterfragas. Langa listor komprimerade default. EN sticky komprimera-knapp
   PER SEKTION (sektionens), aldrig tva konkurrerande. Tung detalj (rik
   matchvy) oppnas via **DRILL-IN** (beslut), inte inline-expand , det
   eliminerar nastlade komprimera-knappar helt.
3. **Ett konsekvent komponentsprak.** EN kort-stil, EN chip-stil, EN knapp,
   EN list-rad, EN "DU"-markering, EN komprimera-kontroll, overallt (T95).
   Konsekvens = proffsigt.
4. **Tydlig hierarki per skarm.** Varje flik: titel -> EN hjalte/primart fokus
   -> sekundart under. Luftig spacing-skala. **Idag-hjalten slimmas (beslut
   U2):** ETT focal-block (live-match om live, annars nasta-match + nedrakning)
   + dagens ovriga matcher som kompakt lista under. Sekundara ytor
   (favoritlag-valjare, install/onboarding) flyttas ner eller till Mer, sa
   Idag inte blir en vagg.
5. **Hitta "ditt" direkt, overallt.** Anvandarens egen rad markerad + pinnad
   overst i VARJE lista (topplista, facit, medlemmar). Favoritlagets matcher
   lyfts. Svarar pa "svart att hitta ratt".
6. **Live-feeden ar rubriken (wow-lagret).** Pro-abonnemanget motiverar appen
   under VM: Idag leder med live/nasta match, stallningen auto-uppdateras
   (T91), live-topplista under matcher (T84), rik matchvy vid drill-in (T86),
   skytteliga + turneringsstatistik (T87/T88), mal-puls + push (T85/T89). Mjuk
   motion (mal-pulser, topplista-rader som ror sig).

## Flik-placering (fran T83/#175, bekraftad)

- **Idag:** slimmad hero (live/nasta match) + DailyMatchesView + LiveNowSection.
- **Tips:** Prediction/Group/Bracket-sektioner + RoomSection (medlemslistan, se T94).
- **Topplista:** per-rum -> global (T90) -> resultat-/facit-listor. Ordning + komprimering + egen-rad (T92).
- **Turnering:** grupptabeller, slutspelstrad, "vad kravs", skytteliga (T87), turneringsstatistik (T88).
- **Mer:** favoritlag/lag-profiler, admin, installningar/push, footer, version.

## Bygg-ordning (autonomt, task-for-task)

1. **T90** , fair global topplista. Byggd + fixad (eace72b) + edge-fn deployad. Re-review -> MERGE.
2. **T83** , flik-IA-grunden. Disk-grind + review + design-frontend (U2/U4 + walkthrough D1-D5, F3 toast-z-index) + test-fix (App.test.tsx settle/timeout) -> MERGE. Allt vilar pa denna.
3. **T91** (stale live-score) + **T93** (fel dag efter midnatt) , live UX-buggar, fristaende, hog nytta.
4. **T84** (live-topplista) + **T86** (rik matchvy, drill-in-malet).
5. **T87** (skytteliga) + **T88** (turneringsstatistik).
6. **T85** (push-fundament) + **T89** (mal-push).
7. **T92** (topplista-UX) + **T94** (medlems-rutnat). Beror pa T83 (+T90/T86).
8. **T95** , holistiskt proffsighets-pass SIST, pa den fardiga strukturen.

## Per-task-disciplin (Daniels direktiv)

Varje task byggs i en FARSK subagent / isolerat arbetstrad (clean kontext),
med issue-direktivet + detta dokument som spec. Sen reviewer-grind, sen
journalist uppdaterar minne/handoff. Build/test/lint gront + reviewad INNAN
merge. design-frontend-specialisten leder UI-tasksen. Operativt lage: FULL
AUTONOMI, auto-MERGE till develop nar alla grindar ar grona (Daniels fullmakt
2026-06-16) -> live pa vm-2026.pages.dev. Copilot-loop hoppas (publikt
merit-repo, mystery-disciplin , lokal panel racker). Botar + livescore-pollare
ROR VI EJ (live + funkar).
