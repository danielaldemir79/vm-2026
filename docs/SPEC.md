# VM 2026 , app-spec (design)

> Status: design godkänd i brainstorm 2026-06-09. Det här dokumentet är design-underlaget
> som backloggen formades ur. Bygget kördes task för task, med kvalitetsgrindar (planering,
> tester, oberoende granskning, CI) på varje ändring.

## 1. Vision och mål

En riktigt proffsig, snygg och "trendig" VM 2026-app som Daniel delar med sina vänner.
Den ska ge WOW-känsla och vara kul att följa tillsammans under hela mästerskapet.

Kärnan:
- Varje dag presenteras dagens matcher med tid, TV-kanal (Sverige), arena/stad och kuriosa.
- Man matar in resultat. Gruppspelstabellerna uppdateras live.
- Ett slutspelsträd som justeras dynamiskt under gruppspelet (vilka lag som kan mötas),
  låses när grupperna är klara, och animerar fram vinnaren när slutspelsresultat matas in.
- Ett tips-lager ovanpå: vänner gissar resultat före avspark, poäng och topplista.

Sekundärt mål: om den blir bra kan den bäddas in på Direkten Ryd-webben (`direkten-ryd-webb`)
till premiären.

## 2. Användningsmodell

**Bådadera: gemensam live-tracker + tips-spel** (valt av Daniel).

- **Tracker:** en delad sanning. Riktiga VM-resultat matas in (Daniel + ev. utvalda),
  alla ser samma tabeller och slutspelsträd uppdateras i realtid på sina telefoner.
- **Tips:** varje vän gissar resultat före avspark, appen poängsätter och visar topplista.

Detta kräver en delad molnbas (databas + auth + realtid) från start, så tips-lagret och
realtidssynk kan slås på utan omarkitektur.

## 3. Plattform och teknik

**Plattform: PWA (installerbar webbapp), inte native.** Dela = skicka en länk i
gruppchatten. "Lägg till på hemskärm" ger app-ikon och helskärm. Ingen App Store, fungerar
på iPhone och Android, push-notiser möjliga på installerad PWA.

Teknik-stack (låst i design-fasen 2026-06-09, se [`decisions.md`](decisions.md)):
- **Frontend:** React + Vite + TypeScript.
- **Styling/känsla:** Tailwind CSS + Framer Motion (animationer = det "levande/trendiga").
- **PWA:** vite-plugin-pwa (installerbar, offline-skal, manifest, ikon).
- **Molnbas:** Supabase (Postgres + Auth + Realtime + Row Level Security). Gratisnivån räcker.
- **Hosting:** Cloudflare Pages (gratis, egen URL). Auto-deploy: produktion från `develop` (live
  på vm-2026.pages.dev), förhandsvisning per PR. `main` reserverad för framtida formella releaser
  (uppdaterat 2026-06-09 när Cloudflare-kopplingen aktiverades, se `docs/decisions.md`).
- **Delning:** publik PWA-URL + ev. rumskod/länk för att gå med i tips-ligan.

## 4. Funktioner (faser)

Designat som en helhet, byggt i faser. Varje fas = egna tasks på boarden.

### Fas 1 , Wow-kärnan (tracker)
- **Daglig matchvy (start):** dagens matcher med avsparkstid, **svensk TV-kanal**, arena/stad,
  kuriosa. Datumnavigering (bläddra dag för dag). "Match of the day"-hero + nedräkning till
  nästa avspark.
- **Dynamiskt dags-tema:** färg/motiv byter efter vilka lag som spelar den dagen (flaggfärger,
  värdstad). Snyggt, inte pratigt.
- **Gruppspel:** 12 grupper (A till L), tabeller som uppdateras live vid resultatinmatning.
- **Slutspelsträd:** byggs/justeras dynamiskt utifrån tabellläget under gruppspelet, låses när
  grupperna är klara, animerar fram vidareavancerande lag när slutspelsresultat matas in.
- **Resultatinmatning:** mata in matchresultat, tabeller och träd uppdateras.
- **Lag-profiler:** klicka på lag, se stjärnspelare, FIFA-ranking, kuriosa, "bästa speldraget".
  Kort och visuellt.
- **Deploy:** PWA live på egen URL.

### Fas 2 , Social (tips + realtid)
- **Inloggning / rumskod:** vänner går med via länk eller kod, identifierar sig.
- **Tips-spel:** gissa resultat före avspark. Poängregler (t.ex. rätt utfall vs exakt resultat).
- **Topplista:** vem tippar bäst.
- **Realtid:** tabell/träd/topplista uppdateras live för alla samtidigt (Supabase Realtime).

### Fas 3 , Polish och extra
- **Delbara bildkort:** exportera resultat-/tabell-/trädkort som bild rakt in i gruppchatten.
- **Push-notiser:** favoritmatch börjar, resultat inlagt.
- **"Vad krävs"-scenarier:** vad ett lag behöver för att gå vidare.
- **Pinnat favoritlag** per person.
- **DR-webb-inbäddning:** möjlig integration på Direkten Ryd-premiären.

## 5. VM 2026-format och dataintegritet (KRITISK)

VM 2026 spelas i USA, Kanada och Mexiko, juni till juli 2026. Första turneringen med nytt format:

- **48 lag, 12 grupper (A till L) om 4 lag.**
- **32 lag vidare till slutspel:** 12 gruppettor + 12 grupptvåor + **de 8 bästa treorna**.
- **Slutspel:** sextondelsfinal (Round of 32) , åttondelsfinal , kvartsfinal , semifinal ,
  bronsmatch , final.

**Den svåra biten:** seedningen av de 8 bästa treorna in i sextondelsfinalerna följer en
förbestämd FIFA-tabell som beror på *vilka* grupper de kvalificerade treorna kommer från.
Detta är ökänt felkänsligt. Krav:

- Slutspelsträdets kombinationer (vem möter vem) ska byggas exakt enligt det officiella
  spelschemat och FIFA:s tredjeplats-tabell. Får inte gissas.
- **Egen dedikerad verifierings-task:** extrahera och dubbelkolla hela schemat (grupper,
  matcher, datum, arenor) och slutspelskopplingarna mot källorna i avsnitt 8, samt FIFA:s
  officiella lottning. Denna task får ta den tid den behöver och passerar en
  fullständighets-/review-grind innan den anses klar.

## 6. Datamodell (låst i design-fasen 2026-06-09)

Kärn-entiteter (tracker):
- **Team:** namn, landskod/flagga, grupp, FIFA-ranking, kuriosa, stjärnspelare, "bästa speldrag".
- **Group:** id (A till L), lag, beräknad tabell (poäng, MV, GM, IM, MS).
- **Match:** id, grupp eller slutspelsrunda, lag-hemma, lag-borta, datum/tid, arena/stad,
  svensk TV-kanal, resultat (null tills inmatat), status.
- **BracketSlot:** slutspelsposition, källa (gruppvinnare/tvåa/bästa trea enligt FIFA-regel),
  framräknat lag, nästa slot.

Social-entiteter (tips + gamification, Fas 2-3):
- **User / Player:** identitet, pinnat favoritlag, personlig statistik (träffsäkerhet, bästa call).
- **Room / League:** rum-id, namn, rumskod, medlemmar (mini-liga = eget rum, egen topplista).
- **Prediction:** användare, match, gissat resultat, poäng, jokermarkering (dubbel-poäng).
- **BracketPrediction:** användare, gissat slutspelsträd (vem går vidare per runda) + bonuspoäng.
- **GroupPrediction:** användare, gissad gruppvinnare/tvåa per grupp + bonuspoäng.
- **Achievement / Badge:** användare, märkestyp, intjänad-tidpunkt (streaks, "kallade skrällen" m.fl.).
- **Reaction:** användare, mål (match eller topplista-rad), emoji.

Tabeller, slutspelsträd, poäng och topplistor är **härledda** från Match-resultaten + Predictions
(en sanning, beräknas av rena funktioner, lagras aldrig dubbelt). Detta är arkitekturens ryggrad
och det som gör den kritiska FIFA-seedningen (§5) testbar och säker.

## 7. Visuell identitet

- Modern, "premium" känsla. Mörkt grundtema med accenter, ren typografi, mjuka animationer.
- Dags-tema som skiftar efter dagens lag/värdstad.
- Matchkort, tabeller och träd ska kännas designade, inte genererade. Rörelse och övergångar
  ger det levande intrycket. Aldrig textigt: information komprimeras visuellt.

## 8. Datakällor

Källor Daniel gett (läses av och verifieras i data-tasken):
- Spelschema: https://www.svenskafans.com/fotboll/evenemang/vm/spelschema
- TV-tider och kanaler: https://www.fotbollskanalen.se/artiklar/vm-2026/fotbolls-vm-2026-spelschema-tv-tider-avsparkstider-och-grupper--allt-om-sverige-i-vm-i-fotboll
- Laggenomgång och speltips: https://www.aftonbladet.se/sportbladet/speltips/a/pBM0Jj/fotbolls-vm-2026-genomgang-av-alla-lag-och-basta-speldragen
- VM-guide: https://www.vm-guiden.se/guide
- Plus FIFA:s officiella spelschema/lottning för slutspelskopplingarna (auktoritativ källa).

## 9. Icke-mål (YAGNI)

- Ingen native iOS/Android-app i butik (PWA räcker).
- Inget betalsystem, ingen riktig spelinsats (det är ett kul tips-spel, inte vadslagning).
- Ingen separat backend-server att drifta (Supabase sköter data/auth/realtid).

## 10. Antaganden och öppna frågor

- **Sveriges deltagande är osäkert** (avgörs i playoff mars 2026). Appen byggs lagagnostiskt;
  "favoritlag" är generiskt och pinnas per användare, inte hårdkodat till Sverige.
- Exakta avsparkstider, arenor och TV-kanaler kan ändras , datalagret görs lätt att uppdatera.
- Hosting **låst i design-fasen 2026-06-09: Cloudflare Pages** (se [`decisions.md`](decisions.md)).

## 11. Build-ordning (faser)

Bygget sker i fyra faser. **Den fullständiga, levande task-listan bor på GitHub-boarden**
(en sanning per fakta), denna sektion ger bara fas-strukturen.

- **Fas 0 , Fundament:** repo-skelett + PWA-grund + CI/CD + tidig deploy, design-/temasystem,
  datalager (typad domänmodell + fixtures-först + härledd-state-motorn).
- **Fas 1 , Wow-kärnan (tracker):** kritisk data-task (§5), gruppspel + tabeller +
  resultatinmatning, daglig matchvy + hero + nedräkning, dags-tema, slutspelsträd, lag-profiler,
  "vad krävs"-kalkylator, what-if-simulator, Fas 1-deploy + installation + offline.
- **Fas 2 , Socialt:** Supabase + auth + rumskod, tips-motor, slutspels-/gruppvinnar-tips,
  topplista + tips-avslöjande, realtid, gamification, mini-ligor.
- **Fas 3 , Polish & viralitet:** delbara bildkort + länk-preview, push-notiser, personlig
  statistik, reaktioner, prestanda-/E2E-/a11y-pass, DR-webb-inbäddning.

Ordningen följer beroenden: fundament före kärna, kärna före socialt. Den kritiska data-tasken
(§5) tidigt, allt annat bygger på dess verifierade data.

## 12. Utökad funktionalitet (design-tillägg, godkänd 2026-06-09)

Utöver grund-designen ovan godkände Daniel en utökning för att lyfta appen flera steg (max
kvalitet, lugnt tempo). Dessa features är scope och hör till sina respektive faser:

**Tips blir en riktig VM-pool (Fas 2):**
- **Slutspels-/bracket-tips:** tippa hela slutspelsträdet (vem går vidare per runda) i förväg,
  bonuspoäng. Det klassiska som håller intresset uppe hela turneringen.
- **Gruppvinnar-tips:** gissa gruppettor/tvåor före gruppspelet, bonuspoäng.
- **Gamification:** streaks, märken ("kallade skrällen", "perfekt omgång"), och en **joker-match**
  per omgång där poängen dubblas (strategi, inte bara tur).
- **Mini-ligor:** flera kompisgäng, varje gäng eget rum och egen topplista.
- **Tips-avslöjande:** efter avspark (deadline-lås) ser alla vad varandra tippade.

**Levande känsla (Fas 1-3):**
- Målfirande-animationer vid resultatinmatning (Framer Motion).
- Valbar haptik + ljud på mobil (av som standard, installerad PWA).
- **"Vad krävs"-kalkylator** (uppflyttad till Fas 1): live-scenarier sista gruppomgången,
  "om X vinner går Y vidare", de mest spännande minuterna i ett VM.
- **What-if-simulator:** spela ut hypotetiska resultat och se tabell + slutspelsträd ändras.

**Viralitet (Fas 3):**
- Delbara bildkort (resultat, tabell, "min bracket", min topplista-placering), DR-branding möjlig.
- Rik länk-förhandsvisning (Open Graph) när PWA-länken delas i en gruppchatt.
- Smidig "lägg till på hemskärm"-onboarding + offline-först.

**Teknisk excellens (genomgående):**
- **Fixtures-först:** all kod byggs mot typad fixtures-data, miljö-gating växlar till live Supabase
  utan kod-ändring. Låter hela appen byggas och testas innan Supabase-kontot finns.
- **Härledd state:** tabeller/träd/poäng/topplistor beräknas av rena, hårt testade funktioner
  från en enda sanning (matchresultat + tips).
- **CI/CD:** GitHub Actions bygger/testar/lintar varje PR, auto-deploy till Cloudflare Pages.
- **Prestanda + tillgänglighet:** Core Web Vitals-budget, code-splitting, WCAG, E2E (Playwright).

Reaktioner (lätt socialt, emoji på matcher/topplista) och personlig statistik (din träffsäkerhet
över tid) hör till Fas 3.

## 13. v2 , Flik-IA och live-statistik (godkänd 2026-06-15)

Faserna 0-3 är levererade och appen är live (vm-2026.pages.dev). Daniel godkände ett v2-bygge
som lyfter appen från "en lång sida" till en fokuserad flik-app, och som utnyttjar det uppgraderade
live-data-kontot (API-Football Pro, ~7500 anrop/dag, tills 15 juli) för rik VM-statistik. Mål:
mer proffsigt, mer användarvänligt, roligare att följa VM tillsammans.

**13.1 Informationsarkitektur , flik-app (kärnan, byggs först).**
Den enda långa sidan + den sticky chip-raden (sektions-navet, T78/T79) ersätts av en flik-rad
längst ner (mobil-först, som en modern sport-app). Användaren ska inte skrämmas av allt på en
gång , varje flik visar bara det relevanta. Fem flikar:
- **Idag** (hem): dagens matcher, den pågående LIVE-matchen (rik vy), hero + nedräkning.
- **Tips:** tips-spelet (match-, grupp-, bracket-tips) + rummen.
- **Topplista:** total (cross-rum) + per-rum, med LIVE-scoring som rör sig under matcher.
- **Turnering:** grupptabeller, slutspelsträd, "vad krävs", skytteliga, turneringsstatistik.
- **Mer:** lag-profiler, favoritlag, inställningar (push), arrangörs-/admin-ytan.
Skalet är responsivt (flik-rad på mobil, top-/sido-nav på större skärm). Befintliga vyer
återanvänds oförändrat i sak , bara deras placering och navigering ändras.

**13.2 Scroll-modell och sticky-fix (löses inuti 13.1).**
Den sticky "visa färre"/komprimera-kontrollen följer i dag inte sidans scroll (den fäster i ett
inre scroll-fönster och glider ur vy). Scroll-modellen görs om i flik-strukturen så kontrollen
följer scrollen överallt, och den ska finnas på ALLA långa listor, inte bara några.

**13.3 Live-statistik-features (utnyttjar Pro-kontot, härledd state ur live-datan).**
Live-data-infrastrukturen finns redan (per-match-pollare som edge function + `match_live_data`
med events/statistics/lineups + Realtime). v2 bygger UI och härledd statistik ovanpå den:
- **Live-uppdaterad topplista under matcher:** placeringar rör sig i realtid när mål trillar
  (kärnan i tips-spänningen).
- **Mål-push-notiser:** PWA-push "MÅL! Spanien 2-1". OBS: push-stacken finns INTE i dag (ingen
  VAPID-nyckel, ingen prenumerations-lagring, ingen service-worker-push-hanterare, ingen sändare ,
  push var en planerad men ej byggd Fas 3-punkt). v2 bygger därför hela push-fundamentet från grunden
  (eget fundament + mål-detektering ovanpå), inte ovanpå befintlig infra.
- **Rik live-matchvy:** statistik-panel (bollinnehav/skott/hörnor) + laguppställning/formation +
  händelse-tidslinje (datan finns i `match_live_data`; bygger vidare på befintliga livekort).
- **Skytteliga:** aggregera målskyttar ur event-datan.
- **Turneringsstatistik:** flest mål/lag, skrällar och andra roliga VM-stat-vyer.

**En sanning för mål-härledning (HARD):** alla features som räknar mål ur event-strömmen (live-
topplista, mål-push, rik matchvy, skytteliga, turneringsstatistik) ska konsumera EN delad mål-
härlednings-util (självmål/straff/VAR-ogiltigt hanteras på ETT ställe), så appen aldrig visar
motsägande siffror för samma match.

**13.4 Datakälla (tillägg till §8).**
Live-resultat och matchstatistik: API-Football (v3, World Cup league-id 1), Pro-plan från
2026-06-15. Nyckel i Supabase `app_config`, aldrig i koden (§7-säkerhet). Self-budgeterande
pollare så taket aldrig spräcks. Den befintliga pollaren och bot-/seednings-lagret RÖRS EJ i v2
(de är live och fungerar).

**13.5 Out of scope (YAGNI för v2).** Ingen ombyggnad av pollaren/bot-lagret, ingen ny backend,
ingen native app. v2 är IA + UI + härledd statistik ovanpå redan existerande data.

Den fullständiga, levande task-listan för v2 bor på GitHub-boarden (en sanning per fakta).
