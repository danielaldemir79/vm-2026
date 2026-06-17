# VM 2026 , UI/UX-lyft, north star (v2)

Datum: 2026-06-16. Beslutad med Daniel (full delegering: "jag litar på ditt
omdöme, styr mot bästa möjliga resultat"). Detta dokument är den TVÄRGÅENDE
riktningen som ALLA v2-tasks (T83-T95) ska följa. Per-task-detaljer bor i
respektive GitHub-issue; SPEC SS13 har den ursprungliga v2-omfattningen. Det
här dokumentet vinner vid konflikt om visuell/UX-riktning.

## Problemet (Daniels rapport 2026-06-15/16)

Appen känns för lång, rörig och skrämmande ("för mycket på en gång"), och det
är svårt att hitta rätt sak. Detta är ett ARKITEKTUR- och TÄTHETS-problem,
inte ett "fult utseende"-problem. Lösningen är fokus och progressiv
avslöjning, inte en omdesign av färger/typografi.

## Visuell ambition (LÄST)

**Förfina nuvarande identitet till proffsklass + selektiva wow-moment.**
Behåll ljus/grön/rundad-kort-identiteten. Gör den stram, konsekvent och
mindre tät-packad. Lägg till några få hög-impact delight-moment (hero,
live-puls, mjuk motion). INGEN full omdesign (hög risk mitt under VM, löser
inte kärnproblemet bättre). Allt motion respekterar reduced-motion.

## North star, 6 principer

1. **Fokuserade flikar, inte en lång sida (T83).** 5 flikar nederst på mobil
   (Sofascore-mönster), responsiv nav på desktop. Ordning (beslut U4):
   **Idag -> Tips -> Topplista -> Turnering -> Mer.** Varje flik visar bara
   sitt = inget skrämmer, allt är lätt att hitta. Detta är grundlösningen på
   "för lång".
2. **Progressive disclosure.** Visa sammanfattning, göm detaljen tills den
   efterfrågas. Långa listor komprimerade default. EN sticky komprimera-knapp
   PER SEKTION (sektionens), aldrig två konkurrerande. Tung detalj (rik
   matchvy) öppnas via **DRILL-IN** (beslut), inte inline-expand , det
   eliminerar nästlade komprimera-knappar helt.
3. **Ett konsekvent komponentspråk.** EN kort-stil, EN chip-stil, EN knapp,
   EN list-rad, EN "DU"-markering, EN komprimera-kontroll, överallt (T95).
   Konsekvens = proffsigt.
4. **Tydlig hierarki per skärm.** Varje flik: titel -> EN hjälte/primärt fokus
   -> sekundärt under. Luftig spacing-skala. **Idag-hjälten slimmas (beslut
   U2):** ETT focal-block (live-match om live, annars nästa-match + nedräkning)
   + dagens övriga matcher som kompakt lista under. Sekundära ytor
   (favoritlag-väljare, install/onboarding) flyttas ner eller till Mer, så
   Idag inte blir en vägg.
5. **Hitta "ditt" direkt, överallt.** Användarens egen rad markerad + pinnad
   överst i VARJE lista (topplista, facit, medlemmar). Favoritlagets matcher
   lyfts. Svarar på "svårt att hitta rätt".
6. **Live-feeden är rubriken (wow-lagret).** Pro-abonnemanget motiverar appen
   under VM: Idag leder med live/nästa match, ställningen auto-uppdateras
   (T91), live-topplista under matcher (T84), rik matchvy vid drill-in (T86),
   skytteliga + turneringsstatistik (T87/T88), mål-puls + push (T85/T89). Mjuk
   motion (mål-pulser, topplista-rader som rör sig).

## Flik-placering (från T83/#175, bekräftad)

- **Idag:** slimmad hero (live/nästa match) + DailyMatchesView + LiveNowSection.
- **Tips:** Prediction/Group/Bracket-sektioner + RoomSection (medlemslistan, se T94).
- **Topplista:** per-rum -> global (T90) -> resultat-/facit-listor. Ordning + komprimering + egen-rad (T92).
- **Turnering:** grupptabeller, slutspelsträd, "vad krävs", skytteliga (T87), turneringsstatistik (T88).
- **Mer:** favoritlag/lag-profiler, admin, inställningar/push, footer, version.

## Bygg-ordning (autonomt, task-för-task)

1. **T90** , fair global topplista. Byggd + fixad (eace72b) + edge-fn deployad. Re-review -> MERGE.
2. **T83** , flik-IA-grunden. Disk-grind + review + design-frontend (U2/U4 + walkthrough D1-D5, F3 toast-z-index) + test-fix (App.test.tsx settle/timeout) -> MERGE. Allt vilar på denna.
3. **T91** (stale live-score) + **T93** (fel dag efter midnatt) , live UX-buggar, fristående, hög nytta.
4. **T84** (live-topplista) + **T86** (rik matchvy, drill-in-målet).
5. **T87** (skytteliga) + **T88** (turneringsstatistik).
6. **T85** (push-fundament) + **T89** (mål-push).
7. **T92** (topplista-UX) + **T94** (medlems-rutnät). Beror på T83 (+T90/T86).
8. **T95** , holistiskt proffsighets-pass SIST, på den färdiga strukturen.

## Per-task-disciplin (Daniels direktiv)

Varje task byggs i en FÄRSK subagent / isolerat arbetsträd (clean kontext),
med issue-direktivet + detta dokument som spec. Sen reviewer-grind, sen
journalist uppdaterar minne/handoff. Build/test/lint grönt + reviewad INNAN
merge. design-frontend-specialisten leder UI-tasksen. Operativt läge: FULL
AUTONOMI, auto-MERGE till develop när alla grindar är gröna (Daniels fullmakt
2026-06-16) -> live på vm-2026.pages.dev. Copilot-loop hoppas (publikt
merit-repo, mystery-disciplin , lokal panel räcker). Botar + livescore-pollare
RÖR VI EJ (live + funkar).
