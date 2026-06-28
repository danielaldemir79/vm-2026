// App-shell , den färdiga app-vyn (T83, #175: flik-app).
//
// IA (T83): appen är en FLIK-APP med fem flikar (Idag/Tips/Topplista/Turnering/Mer),
// inte längre EN lång sida med en sticky chip-rad (sektions-navet T78/T79, avvecklat).
// Flik-raden ligger längst ner på mobil (sport-app-mönster) och blir en top-rad på
// desktop (TabBar + tabs.css). Varje befintlig vy återanvänds OFÖRÄNDRAD i sak; bara
// placeringen (vilken flik) + navigeringen ändras (återanvänd, bygg inte om). Se
// docs/decisions.md 2026-06-15 (flik-IA + scroll/sticky + sim-läge över flikar).
//
// ALLA flik-paneler hålls MONTERADE samtidigt (inaktiv = `hidden`), så vy-state
// (formulär, sök, utfällt läge), providers och live-data delas och inget nollställs
// vid flik-byte (se TabPanel för det fulla varför). Det gör också att de befintliga
// smoke-/integrationstesterna hittar allt innehåll i DOM:en oförändrat.
//
// SLUTSPELET STYR TURNERING (2026-06-28): nu när slutspelet är det som gäller leder
// Turnering med SLUTSPELSTRÄDET (BracketView), och gruppspelet (GroupStageView) ligger
// UNDER det. What-if-simulatorn (SimulationBanner/-Frame + den lokala ResultEntryGate)
// och "Vad krävs"-kalkylatorn (ScenarioView) är BORTTAGNA: de gjorde sitt syfte under
// gruppspelet, och officiella resultat matas ändå in via AdminSection (Mer). De
// officiella facit-resultaten driver tabeller + träd direkt ur results-storen (live).

import { useCallback, type ReactNode } from 'react';
import { Fade, Slide } from './motion';
import { ThemeToggle } from './components/ThemeToggle';
import { Wordmark } from './components/Wordmark';
import { Surface } from './components/Surface';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DailyMatchesView, SlutspelReminder } from './features/daily';
import { GroupStageView } from './features/groups';
import { BracketView } from './features/bracket';
import { ResultsProvider } from './features/results';
import { ScorerTableView, SuspensionsView, TournamentStatsView } from './features/tournament-stats';
import { TeamProfileProvider } from './features/team-profile';
import {
  RoomSection,
  RoomPill,
  RoomsProvider,
  ReactionsProvider,
  MatchCommentsProvider,
  focusRoomForm,
  useRoomsStore,
} from './features/rooms';
import { OfficialResultsProvider } from './features/official-results';
import { PredictionSection, PredictionsProvider } from './features/predictions';
import { GroupPredictionSection } from './features/group-predictions';
import { BracketPredictionSection } from './features/bracket-predictions';
import { LeaderboardProvider, LeaderboardSection, RevealSection } from './features/leaderboard';
import { MatchDetailProvider } from './features/match-detail';
import { TotalLeaderboardSection } from './features/total-leaderboard';
import { FavoriteTeamProvider, FavoriteTeamSection } from './features/favorite-team';
import { MinSidaSection } from './features/min-sida';
import { PushOptInSection } from './features/push';
import { AdminSection } from './features/admin';
import {
  InstallButton,
  OnboardingDialog,
  OnlineStatusIndicator,
  SettingsControl,
  UpdatePrompt,
  useOnboarding,
} from './features/app-settings';
import { TabBar, TabPanel, useTabRouting } from './features/tabs';
import { SectionNav, type SectionNavItem } from './components/section-nav';
import { VersionStamp } from './components/VersionStamp';

/** Id-bas för flik-panelerna (TabBar:s aria-controls + TabPanel:s id pekar hit). */
const TAB_PANEL_BASE = 'vm-tabpanel';

/**
 * Sektions-navet i Turnering (T103, Daniels önskemål: en meny som hoppar direkt till
 * rätt sektion). Ordningen + id:na MÅSTE matcha sektionernas ankare i Turnering-panelen
 * nedan (en sanning: navet skrollar till exakt dessa id:n, scroll-spy:n läser dem).
 * SLUTSPEL leder nu (det som gäller), gruppspelet under , samma ordning som panelen.
 */
const TURNERING_SECTIONS: readonly SectionNavItem[] = [
  { id: 'turnering-slutspel', label: 'Slutspel' },
  { id: 'turnering-grupper', label: 'Grupper' },
  { id: 'turnering-skytteligan', label: 'Skytteligan' },
  { id: 'turnering-statistik', label: 'Statistik' },
  { id: 'turnering-avstangda', label: 'Avstängda' },
];

/**
 * GLOBALA (cross-rum) TOPPLISTAN AKTIV (T96 dolde den, 2026-06-17 åter tänd).
 *
 * TotalLeaderboardSection läser edge-funktionen (global-leaderboard). Den BOOT-KRASCHADE
 * (503) en period: den DEPLOYADE artefakten (v1) var stale/korrupt , KÄLLAN var hel hela
 * tiden (boot:ar rent lokalt i Deno). En ren omdeploy av nuvarande källa löste det
 * (funktionen svarar nu 200 med BARA säkra fält: visningsnamn, poäng, rank, exakt-träffar).
 * Därför är flaggan true. Per-rums-topplistan + "vad alla tippade"-listan var KVAR och
 * opåverkade hela tiden.
 *
 * SLÄCK IGEN (om funktionen någonsin krånglar): flippa denna till `false` , render-grenen
 * nedan döljer då TotalLeaderboardSection helt, inget annat behöver röras.
 */
const GLOBAL_LEADERBOARD_ENABLED = true;

/**
 * Ett innehållskort, delad yt-form för app-vyns sektioner. Nu en tunn wrapper runt
 * den ENA delade Surface-primitiven (D3/D4): alla `surface={...}`-render-props i
 * appen funnlas hit, så hela appen bär EXAKT samma kort-stil (radie/kant/fond/skugga/
 * luft). Tidigare var kort-idiomet handkopierat här, nu en sanning i Surface.
 */
function Panel({ children }: { children: ReactNode }) {
  return <Surface>{children}</Surface>;
}

/**
 * Online-indikatorn KOPPLAD till rums-synk-läget (T14). `live` är true när det
 * finns ett aktivt rum med delad server-data, då speglar indikatorn synk-status
 * ärligt; annars (lokalt läge / inget rum) faller den till T13:s "fungerar ändå".
 * Wiringen bor här (inte i app-settings) så app-settings slipper ett beroende till
 * rums-feature:n (undviker cirkulärt beroende).
 */
function SyncAwareOnlineStatus() {
  const rooms = useRoomsStore();
  return <OnlineStatusIndicator live={rooms.enabled && rooms.activeRoom !== null} />;
}

export default function App() {
  return (
    // RoomsProvider omsluter hela appen (T14): det sociala rums-lagret + auth.
    // Är Supabase inte konfigurerat är det inaktivt (enabled=false) och appen
    // fungerar lokalt precis som förr. Online-indikatorn läser dess synk-läge.
    //
    // OfficialResultsProvider (T42, #72): det GLOBALA facit-lagret + admin-status.
    // Ligger INNANFÖR RoomsProvider (delar auth-sessionen) och OMSLUTER hela appen
    // så topplistan (facit-källan), resultat-feedback och admin-inmatningen alla
    // läser SAMMA globala facit. Vilande utan Supabase, precis som rums-lagret.
    <RoomsProvider>
      <OfficialResultsProvider>
        {/* FavoriteTeamProvider (T23, #23): det pinnade favoritlaget (localStorage,
            per-enhet, ingen Supabase-yta). Omsluter hela appen så dagsvyn (lyfter
            favoritlagets matcher) och favoritlags-väljaren delar samma favorit-store.
            (Personliga statistiken läser LeaderboardStore, inte denna.) Vilande utan
            effekt om inget lag är pinnat; helt oberoende av Supabase. */}
        <FavoriteTeamProvider>
          {/* ROT-SKYDDSNÄT (HOTFIX, white-screen): sista boundaryn. Skulle något oväntat
              kasta UTANFÖR de finkorniga boundaryerna nedan, visar vi en lugn helsides-
              fallback i stället för en blank sida. Per-flik- och per-sektion-boundaryerna
              fångar normalt felet långt innan det når hit (isolerat), men roten garanterar
              att appen ALDRIG mer kan bli helt blank. */}
          <ErrorBoundary label="appen">
            <AppShell />
          </ErrorBoundary>
        </FavoriteTeamProvider>
      </OfficialResultsProvider>
    </RoomsProvider>
  );
}

function AppShell() {
  // EN onboarding-instans ägs här och delas med både touren och install-gaten,
  // så "är touren öppen?" är EN sanning (inte två divergerande hook-tillstånd).
  const onboarding = useOnboarding();
  // Aktiv flik <-> URL-hash (delbar länk, bakåt-knapp, djuplänk vid kall-laddning).
  const { activeTab, selectTab } = useTabRouting();

  // GENVÄG TILL RUM-HANTERINGEN (T96, #193): rum-pillen i app-baren (RoomPill) kan
  // skicka en hit "skapa rum" / "gå med i rum" från VILKEN flik som helst (även när man
  // inte är med i något rum än). Vi byter till Tips (där RoomSection ligger överst) och
  // scrollar + fokuserar RÄTT formulär via focusRoomForm. Tips-panelen är alltid monterad
  // men `hidden` tills fliken är aktiv, så målet får layout först EFTER flik-bytets commit
  // + paint , därför dubbel rAF innan vi scrollar/fokuserar (annars är formuläret ännu utan
  // layout och scroll/focus blir no-op). Själva DOM-delen bor i focusRoomForm (testbar seam).
  const openRooms = useCallback(
    (target: 'create' | 'join') => {
      selectTab('tips');
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => focusRoomForm(target))
        );
      } else {
        focusRoomForm(target);
      }
    },
    [selectTab]
  );

  // GENVÄG TILL SLUTSPELS-TIPSET (2026-06-28): startsidans SlutspelReminder leder hit ,
  // byt till Tips och scrolla till slutspels-tipset (#tips-slutspel, överst i Tips). Samma
  // dubbel-rAF som openRooms: Tips-panelen får layout först efter flik-bytets commit + paint,
  // så vi väntar två frames innan vi scrollar (annars är målet ännu utan layout = no-op).
  const openBracketTips = useCallback(() => {
    selectTab('tips');
    const scrollToTips = () => {
      const el = typeof document !== 'undefined' ? document.getElementById('tips-slutspel') : null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToTips));
    } else {
      scrollToTips();
    }
  }, [selectTab]);

  return (
    <>
      {/* min-h-dvh + overflow-x-clip = aldrig horisontell scroll på någon skärm.
          Den dekorativa gröna glow-fonden ligger bakom innehållet via en pseudo-yta. */}
      <div className="relative min-h-dvh overflow-x-clip">
        {/* Dekorativ ljusgloria (arena-ljus). aria-hidden, ren stämning, följer temat
          via --vm-glow-accent (RGB-delar) så den fungerar i båda lägena. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[60vh] opacity-60"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 0%, rgb(var(--vm-glow-accent) / 0.18), transparent 70%)',
          }}
        />

        {/* APP-BAR (D5/D8): header + flik-rad läses som EN sammanhållen, frostad
          app-bar på desktop. Headern bär INGEN egen botten-kant på desktop
          (sm:border-b-0); flik-radens egen kant fortsätter bandet, så de två
          banden inte ser ut som två lösa lister utan en enhetlig topp-app-bar. På
          mobil (där flik-raden ligger längst ner) behåller headern sin kant som
          förr. data-app-header = den STABILA kroken sticky-offsetterna mäter mot. */}
        <header
          data-app-header=""
          className="sticky top-0 z-30 border-b border-border backdrop-blur-md sm:border-b-0"
        >
          <div
            className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-surface) 70%, transparent)' }}
          >
            <Wordmark className="text-xl sm:text-2xl" />
            {/* RUM-PILLEN (T96, #193) + nät-status + inställningar (kugghjul) + tema-
              toggle. Pillen ligger HÄR i app-bar-headern (utanför flik-panelerna), så
              det AKTIVA rummet syns , och kan bytas , på ALLA flikar (Idag/Tips/
              Topplista/Turnering/Mer), inte bara i RoomSection (Tips). Menyn bär också
              skapa/gå-med-genvägar (onOpenRooms ovan: byter till Tips + scrollar/
              fokuserar rätt formulär), så man når rum-hanteringen var man än står. Den
              renderar null i fixtures-/lokalt läge (app-baren ser ut precis som förr då);
              utan aktivt rum blir den en "Rum"-CTA (skapa/gå-med), eftersom onOpenRooms
              alltid ges här. Status-chippet döljs på de minsta skärmarna (sm:inline-flex)
              så headern aldrig trängs; offline-läget syns ändå via offline-bannern. */}
            <div className="flex items-center gap-2 sm:gap-3">
              <RoomPill onOpenRooms={openRooms} />
              <span className="hidden sm:inline-flex">
                <SyncAwareOnlineStatus />
              </span>
              <SettingsControl />
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* FLIK-RADEN: tillgänglig tablist. På desktop (>= sm) en top-rad direkt under
          headern (del av app-baren); på mobil en fast rad längst ner (sport-app-
          mönster), se tabs.css. Ikoner + glidande aktiv-indikator + mjuk motion
          ligger nu på via .vm-tab*-hakarna (D1/D2). */}
        <TabBar activeTab={activeTab} onSelect={selectTab} panelIdBase={TAB_PANEL_BASE} />

        {/* data-tab-content bär botten-luft så den FASTA mobil-flikraden aldrig skymmer
          sidans sista innehåll (tabs.css; noll på desktop). Alla providers omsluter
          panelerna, så en monterad-men-dold flik delar samma store/live-data. */}
        <main
          data-tab-content=""
          className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 sm:px-8 sm:py-16"
        >
          {/* EN delad ResultsProvider (T6) + LeaderboardProvider (T58) + PredictionsProvider
            (T64) + TeamProfileProvider (T10) omsluter de flikar som delar deras store, så
            data räknas EN gång och delas över flikarna (en sanning, härledd state). De
            ligger här utanför panelerna just för att Idag (daily), Tips (tips) och Turnering
            (tabeller/träd) alla läser samma matcher/poäng utan dubbelhämtning. */}
          <ResultsProvider>
            <TeamProfileProvider>
              <LeaderboardProvider>
                <PredictionsProvider>
                  {/* MatchDetailProvider (T86, #178): den rika matchvyns drill-in. Ligger HÄR,
                      innanför Results + Leaderboard (matchvyn läser matcher/lag ur results-
                      storen + reveal ur leaderboard-storen) och omsluter ALLA flik-paneler så
                      en matchrad i Idag (nu) eller Tips-reveal (T92) kan öppna vyn. Overlayn
                      renderas bara när ett match-id är öppet, så den vilar tills man drillar in. */}
                  <MatchDetailProvider>
                    {/* ===================== IDAG ===================== */}
                    <TabPanel tabId="idag" activeTab={activeTab} panelIdBase={TAB_PANEL_BASE}>
                      {/* IDAG, AVLASTAD (U2, north-star §4): fliken leder med EN sak , dagens
                      live/nästa-match + matchlista. Den långa marknads-heron (wordmark +
                      paragraf + pills), install-knappen och favoritlags-väljaren är BORTA
                      härifrån: de var sekundära ytor som tryckte ner matcherna och gjorde
                      Idag till en vägg. Install + favoritlag bor nu i Mer (de är install/
                      inställning), så Idag = nedräkning/live + matcher, inget annat.
                      En SLANK rad bär ändå appens namn (h1, tillgängligt namn + smoke-test)
                      som en lugn flik-titel, inte en hel landningssida. */}
                      {/* SAMMA TOPP-NIVÅ-RYTM SOM ÖVRIGA FLIKAR (gap-12 = 48px): Idag bar förr en
                      egen, tätare rytm (gap-8 sm:gap-10) utan principiellt skäl. Nu vilar flik-
                      titeln -> dagens-hjärta på exakt samma luft som kort-mot-kort i Tips/
                      Topplista/Turnering/Mer, så HELA appen andas på EN skala (north-star §4). */}
                      <div className="flex flex-col gap-12">
                        <Fade>
                          <div className="flex flex-col gap-1">
                            <span className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                              USA · Kanada · Mexiko · 2026
                            </span>
                            <Wordmark as="h1" className="text-3xl leading-none sm:text-4xl" />
                          </div>
                        </Fade>

                        {/* SLUTSPELS-PÅMINNELSE (2026-06-28, Daniels önskemål): en tydlig notis
                        högst upp på startsidan medan slutspelet är live , "glöm inte att tippa era
                        slutspelsresultat". Gatar sig själv (live-läge + slutspels-fönster + inte
                        bortstängd) och leder till slutspels-tipset (openBracketTips: Tips +
                        scrolla till #tips-slutspel). Dismissbar, får ligga genom hela slutspelet. */}
                        <Slide direction="up">
                          <SlutspelReminder onTip={openBracketTips} />
                        </Slide>

                        {/* Daglig matchvy (T7) , Idag-flikens hjärta: dagens matcher +
                        LIVE-matchen (LiveNowSection åker med) + nedräkning. ReactionsProvider +
                        MatchCommentsProvider omsluter bara dagens-vyn (de enda ytorna med
                        reaktioner/match-trådar). showFavoritePicker={false}: väljaren är en
                        INSTÄLLNING och bor i Mer (U2). */}
                        <Slide direction="up">
                          <ReactionsProvider>
                            <MatchCommentsProvider>
                              {/* Idag-flikens hjärta (live + matcher) i egen boundary:
                                  ett fel i livekortet/dagslistan släcker aldrig hela
                                  appen, bara den här ytan degraderar lugnt. */}
                              <ErrorBoundary label="dagens matcher" resetKey={activeTab}>
                                <DailyMatchesView showFavoritePicker={false} />
                              </ErrorBoundary>
                            </MatchCommentsProvider>
                          </ReactionsProvider>
                        </Slide>
                      </div>
                    </TabPanel>

                    {/* ===================== TIPS ===================== */}
                    <TabPanel tabId="tips" activeTab={activeTab} panelIdBase={TAB_PANEL_BASE}>
                      {/* Hela Tips-panelens innehåll i en boundary (per-flik): ett fel i
                          tips-/rums-vyerna degraderar fliken lugnt, övriga flikar lever vidare. */}
                      <ErrorBoundary label="tips-fliken" resetKey={activeTab}>
                        <div className="flex flex-col gap-12">
                          {/* TIPPA SLUTSPELET ÖVERST (2026-06-28, Daniels önskemål): slutspelet är
                          LIVE nu, så slutspels-tipset (VM-vinnaren + vem går vidare per slot, T16b)
                          LEDER Tips och är expanderat från start (startExpanded i vyn). id=tips-slutspel
                          = scroll-mål för startsidans slutspels-notis (SlutspelReminder i Idag). */}
                          <div id="tips-slutspel" className="scroll-mt-28">
                            <Slide direction="up">
                              <BracketPredictionSection
                                surface={(children) => <Panel>{children}</Panel>}
                              />
                            </Slide>
                          </div>

                          {/* Din statistik + tippa matcherna (T15): PredictionSection renderar din
                          poäng-summering + personliga statistik högst upp (TipsScoreSummary +
                          PersonalStatsSection) och därunder själva match-kupongen. ScoreGuide
                          (poäng-förklaringen) renderas inuti PredictionsView. */}
                          <Slide direction="up">
                            <PredictionSection surface={(children) => <Panel>{children}</Panel>} />
                          </Slide>

                          {/* Gruppvinnar-tipsen (T16): tippa 1:an + 2:an i varje grupp. */}
                          <Slide direction="up">
                            <GroupPredictionSection
                              surface={(children) => <Panel>{children}</Panel>}
                            />
                          </Slide>

                          {/* "Vad alla tippade" (T92 del D): en paginerad, kompakt matchlista
                          (senaste först), tap på en rad -> rik matchvy (drill-in, T86, via
                          MatchDetailProvider som omsluter alla flik-paneler). EN sektions-kollaps +
                          EN paginering, aldrig två. Egen boundary (HOTFIX-mönstret): en krasch i den
                          tunga reveal-listan degraderar isolerat och släcker aldrig hela Tips-fliken
                          eller appen. */}
                          <Slide direction="up">
                            <ErrorBoundary label="vad alla tippade" resetKey={activeTab}>
                              <RevealSection />
                            </ErrorBoundary>
                          </Slide>

                          {/* RUM-VALET SIST (2026-06-28, Daniels önskemål, vänder T96): RoomSection
                          (skapa rum / gå med via kod + T94:s komprimerade medlems-rutnät) flyttad
                          till BOTTEN av Tips. Din statistik + tippa matcherna är det primära; rum-
                          hanteringen är en sekundär yta man sällan rör. Den persistenta rum-pillen i
                          app-baren (RoomPill) speglar aktivt rum på alla flikar, och dess "skapa/gå
                          med"-genväg scrollar hit (focusRoomForm) oavsett att sektionen nu ligger sist. */}
                          <Slide direction="up">
                            <RoomSection surface={(children) => <Panel>{children}</Panel>} />
                          </Slide>
                        </div>
                      </ErrorBoundary>
                    </TabPanel>

                    {/* ===================== TOPPLISTA ===================== */}
                    <TabPanel tabId="topplista" activeTab={activeTab} panelIdBase={TAB_PANEL_BASE}>
                      <div className="flex flex-col gap-12">
                        {/* Per-rums-topplistan (T17): vem tippar bäst i DITT rum. ScoreGuide
                        renderas inuti LeaderboardSummary, så den följer Topplista-fliken.
                        Egen boundary: en krasch i en topplista släcker inte den andra. */}
                        <Slide direction="up">
                          <ErrorBoundary label="topplistan" resetKey={activeTab}>
                            <LeaderboardSection surface={(children) => <Panel>{children}</Panel>} />
                          </ErrorBoundary>
                        </Slide>

                        {/* Den GLOBALA (cross-rum) topplistan (T82 del 3, #173): EN rankning av
                        ALLA deltagare över ALLA rum. TILLFÄLLIGT DÖLJD (T96, #193): edge-
                        funktionen global-leaderboard 503:ar (trasig sedan T90), så vi renderar
                        inte sektionen alls tills den är fixad (flagga GLOBAL_LEADERBOARD_ENABLED
                        överst). Visar ingen trasig/fel-ruta , den globala raden är bara borta.
                        Per-rums-topplistan ovan + reveal-listan i Tips är kvar. */}
                        {GLOBAL_LEADERBOARD_ENABLED && (
                          <Slide direction="up">
                            <ErrorBoundary label="den globala topplistan" resetKey={activeTab}>
                              <TotalLeaderboardSection
                                surface={(children) => <Panel>{children}</Panel>}
                              />
                            </ErrorBoundary>
                          </Slide>
                        )}
                      </div>
                    </TabPanel>

                    {/* ===================== TURNERING ===================== */}
                    <TabPanel tabId="turnering" activeTab={activeTab} panelIdBase={TAB_PANEL_BASE}>
                      {/* SEKTIONS-NAV (T103, Daniels önskemål): en sticky genvägs-meny överst i den
                      LÅNGA Turnering-fliken, så man (a) ser vilka sektioner som finns och (b) hoppar
                      direkt dit. Pinnar under app-baren (header på mobil; header + flik-rad på
                      desktop, se section-nav.css). Chipsen skrollar till ankarna nedan (under nav-
                      kanten, reduced-motion-gatat) och den aktiva chippen följer scrollen (scroll-
                      spy). Sektions-listan är en sanning i TURNERING_SECTIONS ovan. */}
                      <SectionNav
                        items={TURNERING_SECTIONS}
                        ariaLabel="Hoppa till sektion i Turnering"
                      />
                      {/* SAMMA TOPP-NIVÅ-RYTM SOM ÖVRIGA FLIKAR (gap-12): en delad flex-gap-
                      behållare ger samma luft mellan Turnering-sektionerna som Tips/Topplista/Mer.
                      scroll-mt-32: ett ankar-marginal-fallback (sektionerna bär stabila id:n nedan)
                      så även en ren #hash-navigering landar under app-baren, inte bakom den. */}
                      <div className="flex flex-col gap-12 [&_[data-section-anchor]]:scroll-mt-32">
                        {/* Slutspelsträd + grupptabeller i EN boundary: en krasch i en härledd vy
                          (t.ex. trädet på en oväntad ställning) degraderar zonen lugnt i stället
                          för att släcka hela appen. */}
                        <ErrorBoundary label="turneringsvyn" resetKey={activeTab}>
                          {/* SLUTSPELSTRÄDET ÖVERST (2026-06-28, Daniels önskemål): det är det som
                            gäller nu, så det LEDER Turnering. Det levande trädet sextondel -> final,
                            med alternativen hela vägen + definitiva platser markerade. Gruppspelet
                            ligger UNDER. data-section-anchor + id = sektions-navets hoppmål (T103). */}
                          <div id="turnering-slutspel" data-section-anchor="">
                            <Slide direction="up">
                              <BracketView />
                            </Slide>
                          </div>

                          {/* Gruppspelstabellerna (T5), UNDER slutspelet: härledda ur den delade
                            storen (de officiella facit-resultaten driver dem live). */}
                          <div id="turnering-grupper" data-section-anchor="">
                            <Slide direction="up">
                              <GroupStageView />
                            </Slide>
                          </div>
                        </ErrorBoundary>

                        {/* Skytteligan (T87, #179) , den första roliga turnerings-stat-delen.
                      Härleds ur den VERKLIGA live-event-datan (near-live via cross-match-hooken).
                      I fixtures-läge renderas en demo-skytteliga ur committade events (ingen
                      backend). Egen boundary: en krasch här (t.ex. en oväntad live-data-form)
                      får aldrig släcka hela appen. */}
                        <div id="turnering-skytteligan" data-section-anchor="">
                          <Slide direction="up">
                            <ErrorBoundary label="skytteligan" resetKey={activeTab}>
                              <ScorerTableView />
                            </ErrorBoundary>
                          </Slide>
                        </div>

                        {/* Turneringsstatistiken (T88, #180) , den rika "roliga VM-stats"-delen
                      (kort-liga, mål-fördelning, lag-mål, lag-medel, clean sheets, skrällar).
                      Korten härleds ur den VERKLIGA live-datan (egna cross-match-hookar) + de
                      officiella facit-resultaten. Egen boundary, isolerad från skytteligan ovan. */}
                        <div id="turnering-statistik" data-section-anchor="">
                          <Slide direction="up">
                            <ErrorBoundary label="turneringsstatistiken" resetKey={activeTab}>
                              <TournamentStatsView />
                            </ErrorBoundary>
                          </Slide>
                        </div>

                        {/* Avstängda spelare (T99, #200) , härledd ur kort-datan (rött / 2 gula),
                      uppskattad längd, auto-bort när avtjänad. Härleds ur den VERKLIGA live-event-
                      datan via cross-match-hooken. Egen boundary, isolerad från statistiken ovan:
                      en krasch här får aldrig släcka hela appen (hotfix-mönstret). Skador byggs
                      INTE (ny datakälla, medvetet skippat, se decisions). */}
                        <div id="turnering-avstangda" data-section-anchor="">
                          <Slide direction="up">
                            <ErrorBoundary label="avstangda" resetKey={activeTab}>
                              <SuspensionsView />
                            </ErrorBoundary>
                          </Slide>
                        </div>
                      </div>
                    </TabPanel>

                    {/* ===================== MER ===================== */}
                    <TabPanel tabId="mer" activeTab={activeTab} panelIdBase={TAB_PANEL_BASE}>
                      {/* Hela Mer-panelens innehåll i en boundary (per-flik): ett fel i en
                          arrangörs-/inställnings-yta degraderar fliken lugnt utan att släcka appen. */}
                      <ErrorBoundary label="Mer-fliken" resetKey={activeTab}>
                        <div className="flex flex-col gap-12">
                          {/* MIN SIDA (T97): den personliga profil-hubben , vem du är + din
                        ställning + dina rum + favoritlag. Leder Mer ("om mig") och gatar
                        honest: inget i fixtures/lokalt läge eller utan identitet + rum. */}
                          <Slide direction="up">
                            <MinSidaSection surface={(children) => <Panel>{children}</Panel>} />
                          </Slide>

                          {/* Arrangörs-facit (T42, #72): de OFFICIELLA matchresultaten matas in av
                        arrangören och gäller GLOBALT. Hör hemma i Mer (hjälp-/arrangörsytor). */}
                          <Slide direction="up">
                            <AdminSection surface={(children) => <Panel>{children}</Panel>} />
                          </Slide>

                          {/* FAVORITLAGS-VÄLJAREN (U2): flyttad hit från Idag , det är en
                        INSTÄLLNING, inte dagens-innehåll. Avlastar Idag-fliken. */}
                          <Slide direction="up">
                            <FavoriteTeamSection
                              surface={(children) => <Panel>{children}</Panel>}
                            />
                          </Slide>

                          {/* MÅL-NOTISER opt-in (T85, #177): web-push-fundamentet. En
                        INSTÄLLNING (slå på pling vid mål), bor i Mer bredvid favoritlag.
                        Sektionen visar sig ärligt per läge (stöds ej / iOS-hint / nekad /
                        aktivera / på + test). Samma Panel-yta som resten av Mer. */}
                          <Slide direction="up">
                            <PushOptInSection surface={(children) => <Panel>{children}</Panel>} />
                          </Slide>

                          {/* Den KOMPAKTA install-knappen (T63, #113): "Installera som app"-pill.
                        Flyttad hit från Idag (U2): install är en åtgärd som hör hemma i Mer,
                        inte före dagens matcher. GATAD bakom onboarding-touren (T39/#68, F1):
                        medan touren är öppen visas den inte; annars enligt plattform/event. */}
                          {onboarding.open ? null : (
                            <Slide direction="up">
                              <Panel>
                                <div className="flex flex-col gap-3">
                                  <header className="flex flex-col gap-1">
                                    <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                                      Appen
                                    </p>
                                    <h2 className="font-display text-xl font-semibold sm:text-2xl">
                                      Installera som app
                                    </h2>
                                    <p className="text-sm text-fg-muted">
                                      Lägg VM 2026 på hemskärmen, så öppnas den som en egen app,
                                      även offline.
                                    </p>
                                  </header>
                                  <div className="flex">
                                    <InstallButton />
                                  </div>
                                </div>
                              </Panel>
                            </Slide>
                          )}

                          {/* Footern (T44, #75): appens synliga adress + upphovs-kortet (signaturen)
                        + versionsstämpel. Hör hemma i Mer (lugn samlingsplats). */}
                          <footer className="flex flex-col gap-5 border-t border-border pt-6 text-sm text-fg-muted">
                            {/* Footerns ledtext + appens SYNLIGA adress (T44, #75): adressen ska gå
                          att LÄSA och säga högt. vm-2026.pages.dev som synlig, klickbar länk-
                          text; href bär hela URL:en. Egen-flik + tabnabbing-skydd. */}
                            <p>
                              VM 2026, USA, Kanada och Mexiko. Följ mästerskapet tillsammans, dela
                              appen med vänner,{' '}
                              <a
                                href="https://vm-2026.pages.dev"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Öppna appens adress vm-2026.pages.dev i en ny flik"
                                className="rounded-sm font-medium text-fg underline-offset-[3px] decoration-accent decoration-2 hover:underline focus-visible:underline"
                              >
                                vm-2026.pages.dev
                              </a>
                              .
                            </p>

                            {/* UPPHOVS-KORTET (T38 signatur -> T44 runda 2, #75): footern lyfter
                          Daniel. data-app-signature = stabil krok + testad semantik (T38/T39-
                          testerna vaktar "Daniel Aldemir" + länk-kontraktet). */}
                            <div data-app-signature="" className="flex flex-col gap-3">
                              <div className="flex items-center gap-2.5">
                                <span aria-hidden="true" className="vm-signature-seal">
                                  DA
                                </span>
                                <span className="flex flex-col leading-tight">
                                  <span className="text-xs text-fg-muted">Byggd av</span>
                                  <a
                                    href="https://www.danielaldemir.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Daniel Aldemir, öppna www.danielaldemir.com i en ny flik"
                                    className="rounded-sm font-display text-base font-semibold text-fg underline-offset-[3px] decoration-accent decoration-2 hover:underline focus-visible:underline"
                                  >
                                    Daniel Aldemir
                                  </a>
                                </span>
                              </div>

                              {/* Titel-raden (T44, #75): promotar Daniel som utvecklaren. */}
                              <p className="text-xs text-fg-muted">.NET-systemutvecklare</p>

                              {/* HEMSIDE-CTA:n (T44 runda 2, #75): danielaldemir.com som en
                            uppenbart klickbar pill (delade .vm-install-pill-formen). */}
                              <a
                                href="https://www.danielaldemir.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Öppna danielaldemir.com i en ny flik"
                                className="vm-install-pill self-start"
                              >
                                danielaldemir.com
                                <svg
                                  aria-hidden="true"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="vm-install-pill-icon"
                                >
                                  <path d="M15 3h6v6" />
                                  <path d="M10 14 21 3" />
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                </svg>
                              </a>
                            </div>

                            {/* Version-stämpel (T43, #74): diskret bygg-identifierare. */}
                            <VersionStamp />
                          </footer>
                        </div>
                      </ErrorBoundary>
                    </TabPanel>
                  </MatchDetailProvider>
                </PredictionsProvider>
              </LeaderboardProvider>
            </TeamProfileProvider>
          </ResultsProvider>
        </main>

        {/* Onboarding-touren (T13): visas EN gång vid första start. Ligger på rot-nivå
          (utanför main) så modalen täcker hela skärmen. Får den DELADE onboarding-
          instansen så install-gaten och touren stänger i takt (EN sanning, T39/#68 F1). */}
        <OnboardingDialog onboarding={onboarding} />

        {/* "Ny version finns"-prompten (T43, #74): diskret banner när en ny app-version
          väntar. Ligger på rot-nivå (utanför main, fixed) så den aldrig tränger layouten. */}
        <UpdatePrompt />
      </div>
    </>
  );
}
