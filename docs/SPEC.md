# VM 2026 , app-spec (design)

> Status: design godkänd i brainstorm 2026-06-09. Detta dokument är inputen till
> Agent Kit-inception (Läge 2: använd befintlig info, forma backlog). Bygget körs via
> `/agent-kit` i detta repo, task för task, med Agent Kits grindar.

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

Teknik-stack (förslag, låses i inception):
- **Frontend:** React + Vite + TypeScript.
- **Styling/känsla:** Tailwind CSS + Framer Motion (animationer = det "levande/trendiga").
- **PWA:** vite-plugin-pwa (installerbar, offline-skal, manifest, ikon).
- **Molnbas:** Supabase (Postgres + Auth + Realtime + Row Level Security). Gratisnivån räcker.
- **Hosting:** Vercel eller Cloudflare Pages (gratis, egen URL, auto-deploy från `main`).
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
  officiella lottning. Denna task får ta den tid den behöver och passerar Agent Kits
  fullständighets-/review-grind innan den anses klar.

## 6. Datamodell (utkast, låses i inception)

Entiteter:
- **Team:** namn, landskod/flagga, grupp, FIFA-ranking, kuriosa, stjärnspelare, "bästa speldrag".
- **Group:** id (A till L), lag, beräknad tabell (poäng, MV, GM, IM, MS).
- **Match:** id, grupp eller slutspelsrunda, lag-hemma, lag-borta, datum/tid, arena/stad,
  svensk TV-kanal, resultat (null tills inmatat), status.
- **BracketSlot:** slutspelsposition, källa (gruppvinnare/tvåa/bästa trea enligt FIFA-regel),
  framräknat lag, nästa slot.
- **User / Player (tips):** identitet, pinnat favoritlag.
- **Prediction:** användare, match, gissat resultat, poäng.

Tabeller och träd är **härledda** från Match-resultaten (en sanning, beräknas, lagras inte dubbelt).

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
- Slutgiltigt val av hosting (Vercel vs Cloudflare Pages) låses i inception.

## 11. Build-ordning (för boarden)

1. Repo-skelett + PWA-grund + deploy-pipeline (tom app live tidigt).
2. **Data-task (kritisk):** verifierat schema + grupper + slutspelskopplingar.
3. Gruppspelsvy + tabeller + resultatinmatning.
4. Slutspelsträd (dynamiskt , låst , animerat).
5. Lag-profiler + dags-tema + visuell polish.
6. Fas 2: auth/rumskod + tips + topplista + realtid.
7. Fas 3: delbara bildkort, push, "vad krävs", DR-inbäddning.
