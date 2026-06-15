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
// SIMULERING ÖVER FLIKAR (T83-beslut): what-if-läget är globalt state i den delade
// results-storen (ResultsProvider omsluter hela skalet, oförändrat). Varje flik som
// visar en SIMULERAD vy bär sin egen SimulationFrame (ring + tint + sticky badge när
// sim-läget är PÅ): Idag (daily) och Turnering (tabeller/träd/"vad krävs"). What-if-
// KONTROLLEN (SimulationBanner) + resultatinmatnings-grinden (ResultEntryGate) bor på
// EN plats: Turnering , där sim-läget är mest meningsfullt (man spelar ut tänkta
// resultat och ser tabeller/träd ändras). Frame:n är en ren wrapper som läser sim-
// seamen, så den kan stå i två flikar utan dubblerad state (en sanning).

import type { ReactNode } from 'react';
import { Fade, Slide } from './motion';
import { ThemeToggle } from './components/ThemeToggle';
import { Wordmark } from './components/Wordmark';
import { DailyMatchesView } from './features/daily';
import { GroupStageView } from './features/groups';
import { BracketView } from './features/bracket';
import { GoalCelebrationOverlay, ResultEntryGate, ResultsProvider } from './features/results';
import { ScenarioView } from './features/scenarios';
import { SimulationBanner, SimulationFrame } from './features/simulation';
import { TeamProfileProvider } from './features/team-profile';
import {
  RoomSection,
  RoomsProvider,
  ReactionsProvider,
  MatchCommentsProvider,
  useRoomsStore,
} from './features/rooms';
import { OfficialResultsProvider } from './features/official-results';
import { PredictionSection, PredictionsProvider } from './features/predictions';
import { GroupPredictionSection } from './features/group-predictions';
import { BracketPredictionSection } from './features/bracket-predictions';
import { LeaderboardProvider, LeaderboardSection } from './features/leaderboard';
import { TotalLeaderboardSection } from './features/total-leaderboard';
import { FavoriteTeamProvider } from './features/favorite-team';
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
import { VersionStamp } from './components/VersionStamp';

/** Id-bas för flik-panelerna (TabBar:s aria-controls + TabPanel:s id pekar hit). */
const TAB_PANEL_BASE = 'vm-tabpanel';

/** Ett innehållskort på en yt-token, delad yt-form för app-vyns sektioner. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-[var(--vm-shadow-card)] sm:p-7">
      {children}
    </section>
  );
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
          <AppShell />
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

        {/* Header: wordmark + tema-toggle. Frostat glas-band (tema-troget via
          color-mix mot --color-surface), sticky så toggle alltid är nåbar.
          data-app-header = den STABILA kroken sticky-offsetterna (top-16) mäter mot. */}
        <header
          data-app-header=""
          className="sticky top-0 z-30 border-b border-border backdrop-blur-md"
        >
          <div
            className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-surface) 70%, transparent)' }}
          >
            <Wordmark className="text-xl sm:text-2xl" />
            {/* Nät-status + inställningar (kugghjul) + tema-toggle. Status-chippet
              döljs på de minsta skärmarna (sm:inline-flex) så headern aldrig
              trängs; offline-läget syns ändå tydligt via offline-bannern nedan. */}
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden sm:inline-flex">
                <SyncAwareOnlineStatus />
              </span>
              <SettingsControl />
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* FLIK-RADEN: tillgänglig tablist. På desktop (>= sm) en top-rad direkt under
          headern; på mobil en fast rad längst ner (sport-app-mönster), se tabs.css.
          Funktionell + tillgänglig struktur här; design-frontend lägger premium-finishen
          (ikoner, aktiv-indikator, mikro-animation) ovanpå via .vm-tab*-hakarna. */}
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
                  {/* ===================== IDAG ===================== */}
                  <TabPanel tabId="idag" activeTab={activeTab} panelIdBase={TAB_PANEL_BASE}>
                    <div className="flex flex-col gap-12">
                      {/* Hero. Wordmark som h1 (bär appens tillgängliga namn, håller smoke-testet). */}
                      <Fade>
                        <section className="flex flex-col items-start gap-5 py-6 sm:py-10">
                          <span className="rounded-pill border border-border bg-surface px-3 py-1 text-xs font-medium text-fg-muted">
                            USA · Kanada · Mexiko · sommaren 2026
                          </span>
                          <Wordmark as="h1" className="text-5xl leading-none sm:text-7xl" />
                          <p className="max-w-xl text-balance text-lg text-fg-muted sm:text-xl">
                            Följ mästerskapet tillsammans. Matcher, tabeller och ett slutspelsträd
                            som lever, plus tips-ligan med kompisarna. Allt i en app du delar med en
                            länk.
                          </p>
                          <div className="flex flex-wrap gap-3">
                            <span className="rounded-pill bg-accent px-5 py-2.5 font-display text-sm font-semibold text-accent-fg shadow-md">
                              48 lag · 12 grupper
                            </span>
                            <span className="rounded-pill border border-border px-5 py-2.5 font-display text-sm font-semibold">
                              Installeras som app
                            </span>
                          </div>
                        </section>
                      </Fade>

                      {/* Den KOMPAKTA install-knappen (T63, #113): diskret "Installera som
                        app"-pill. GATAD bakom onboarding-touren (T39/#68, F1): medan touren
                        är öppen visas den inte; annars enligt plattform/event. Hör hemma i
                        Idag (hemmet), första ytan en delningslänk-besökare ser. */}
                      {onboarding.open ? null : (
                        <Slide direction="up">
                          <div className="flex">
                            <InstallButton />
                          </div>
                        </Slide>
                      )}

                      {/* Daglig matchvy (T7) , Idag-flikens hjärta: dagens matcher +
                        LIVE-matchen (LiveNowSection åker med) + nedräkning. SimulationFrame
                        runt daily bär sim-markeringen NÄR what-if-läget är PÅ (kontrollen bor
                        i Turnering, men daily speglar ett simulerat resultat live, så ramen
                        ska synas här med). ReactionsProvider + MatchCommentsProvider omsluter
                        bara dagens-vyn (de enda ytorna med reaktioner/match-trådar). */}
                      <SimulationFrame>
                        <Slide direction="up">
                          <ReactionsProvider>
                            <MatchCommentsProvider>
                              <DailyMatchesView />
                            </MatchCommentsProvider>
                          </ReactionsProvider>
                        </Slide>
                      </SimulationFrame>
                    </div>
                  </TabPanel>

                  {/* ===================== TIPS ===================== */}
                  <TabPanel tabId="tips" activeTab={activeTab} panelIdBase={TAB_PANEL_BASE}>
                    <div className="flex flex-col gap-12">
                      {/* Tips-motorn (T15): match-tips per rum. ScoreGuide (poäng-förklaringen)
                        renderas inuti PredictionsView, så den följer Tips-fliken. */}
                      <Slide direction="up">
                        <PredictionSection surface={(children) => <Panel>{children}</Panel>} />
                      </Slide>

                      {/* Gruppvinnar-tipsen (T16): tippa 1:an + 2:an i varje grupp. */}
                      <Slide direction="up">
                        <GroupPredictionSection surface={(children) => <Panel>{children}</Panel>} />
                      </Slide>

                      {/* Bracket-/slutspels-tipsen (T16b, #59): VM-vinnaren + slot-vinnare. */}
                      <Slide direction="up">
                        <BracketPredictionSection
                          surface={(children) => <Panel>{children}</Panel>}
                        />
                      </Slide>

                      {/* Tips-ligan (T14): skapa/gå med i ett rum, dela koden. Hör hemma i
                        Tips , det är HÄR man organiserar vem man tippar mot. */}
                      <Slide direction="up">
                        <RoomSection surface={(children) => <Panel>{children}</Panel>} />
                      </Slide>
                    </div>
                  </TabPanel>

                  {/* ===================== TOPPLISTA ===================== */}
                  <TabPanel tabId="topplista" activeTab={activeTab} panelIdBase={TAB_PANEL_BASE}>
                    <div className="flex flex-col gap-12">
                      {/* Per-rums-topplistan (T17): vem tippar bäst i DITT rum. ScoreGuide
                        renderas inuti LeaderboardSummary, så den följer Topplista-fliken. */}
                      <Slide direction="up">
                        <LeaderboardSection surface={(children) => <Panel>{children}</Panel>} />
                      </Slide>

                      {/* Den GLOBALA (cross-rum) topplistan (T82 del 3, #173): EN rankning av
                        ALLA deltagare över ALLA rum. Visas även i demo/fixtures-läge. */}
                      <Slide direction="up">
                        <TotalLeaderboardSection
                          surface={(children) => <Panel>{children}</Panel>}
                        />
                      </Slide>
                    </div>
                  </TabPanel>

                  {/* ===================== TURNERING ===================== */}
                  <TabPanel tabId="turnering" activeTab={activeTab} panelIdBase={TAB_PANEL_BASE}>
                    {/* SimulationFrame runt HELA turnerings-zonen: tabeller + "vad krävs" +
                      slutspelsträd + what-if-kontrollen + resultatinmatningen är alla
                      simulerings-PÅVERKADE, så ramen/badgen omsluter dem som EN zon (precis
                      som förr, fast nu i Turnering-fliken). Daily-ramen i Idag bär samma
                      markering där, eftersom sim-läget är globalt (en sanning i storen). */}
                    <SimulationFrame>
                      {/* Gruppspelstabellerna (T5): härledda ur den delade storen. */}
                      <Slide direction="up">
                        <GroupStageView />
                      </Slide>

                      {/* "Vad krävs"-kalkylatorn (T11): live-scenarier för sista gruppomgången. */}
                      <Slide direction="up">
                        <ScenarioView />
                      </Slide>

                      {/* Slutspelsträdet (T9): det levande trädet sextondel -> final. */}
                      <Slide direction="up">
                        <BracketView />
                      </Slide>

                      {/* What-if-KONTROLLEN (Starta/Återställ/Avsluta + status): EN hemvist,
                        här i Turnering DIREKT ovanför resultatinmatningen (T32, #54). Sim-
                        läget handlar om RESULTAT, så kontrollen sitter vid inmatningen, och
                        ramen (ovan) omsluter alla påverkade vyer i fliken. */}
                      <Slide direction="up">
                        <SimulationBanner />
                      </Slide>

                      {/* Resultatinmatningen (T6), GRINDAD i live-läge (T48, #81): EN hemvist
                        här i Turnering. I live visas den bara när what-if-läget är PÅ (lokal
                        "tänk om"-lek, skriver aldrig delat facit). Officiella resultat matas
                        in via AdminSection (Mer). I fixtures-läge alltid synlig. */}
                      <Slide direction="up">
                        <ResultEntryGate
                          surface={(children) => <Panel>{children}</Panel>}
                          renderCelebration={(celebration) => (
                            <GoalCelebrationOverlay celebration={celebration} />
                          )}
                        />
                      </Slide>
                    </SimulationFrame>
                  </TabPanel>

                  {/* ===================== MER ===================== */}
                  <TabPanel tabId="mer" activeTab={activeTab} panelIdBase={TAB_PANEL_BASE}>
                    <div className="flex flex-col gap-12">
                      {/* Arrangörs-facit (T42, #72): de OFFICIELLA matchresultaten matas in av
                        arrangören och gäller GLOBALT. Hör hemma i Mer (hjälp-/arrangörsytor). */}
                      <Slide direction="up">
                        <AdminSection surface={(children) => <Panel>{children}</Panel>} />
                      </Slide>

                      {/* Footern (T44, #75): appens synliga adress + upphovs-kortet (signaturen)
                        + versionsstämpel. Hör hemma i Mer (lugn samlingsplats). */}
                      <footer className="flex flex-col gap-5 border-t border-border pt-6 text-sm text-fg-muted">
                        {/* Footerns ledtext + appens SYNLIGA adress (T44, #75): adressen ska gå
                          att LÄSA och säga högt. vm-2026.pages.dev som synlig, klickbar länk-
                          text; href bär hela URL:en. Egen-flik + tabnabbing-skydd. */}
                        <p>
                          VM 2026, USA, Kanada och Mexiko. Följ mästerskapet tillsammans, dela appen
                          med vänner,{' '}
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
                  </TabPanel>
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
