// App-shell , den färdiga app-vyn.
//
// Headern bär wordmark + tema-toggle + nät-status, och main:en de RIKTIGA vyerna
// (daglig matchvy, gruppspel, "vad krävs", slutspelsträd, resultatinmatning,
// tips-ligan). T2:s "designfundament"-showcase (palett/rörelse/typografi-prov)
// togs bort i T31 (#51, Daniels feedback): den var byggnadsställning som inte
// hör hemma i den färdiga appen. Tema-TOGGLEN i headern är INTE showcasen och
// är kvar, den är en riktig funktion.

import type { ReactNode } from 'react';
import { Fade, Slide } from './motion';
import { ThemeToggle } from './components/ThemeToggle';
import { Wordmark } from './components/Wordmark';
import { DailyMatchesView } from './features/daily';
import { GroupStageView } from './features/groups';
import { BracketView } from './features/bracket';
import { GoalCelebrationOverlay, ResultEntryView, ResultsProvider } from './features/results';
import { ScenarioView } from './features/scenarios';
import { SimulationBanner, SimulationFrame } from './features/simulation';
import { TeamProfileProvider } from './features/team-profile';
import { RoomSection, RoomsProvider, useRoomsStore } from './features/rooms';
import { PredictionSection } from './features/predictions';
import { GroupPredictionSection } from './features/group-predictions';
import { BracketPredictionSection } from './features/bracket-predictions';
import { LeaderboardSection } from './features/leaderboard';
import {
  InstallBanner,
  OnboardingDialog,
  OnlineStatusIndicator,
  SettingsControl,
} from './features/app-settings';

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
    <RoomsProvider>
      <AppShell />
    </RoomsProvider>
  );
}

function AppShell() {
  return (
    // min-h-dvh + overflow-x-clip = aldrig horisontell scroll på någon skärm.
    // Den dekorativa gröna glow-fonden ligger bakom innehållet via en pseudo-yta.
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
          color-mix mot --color-surface), sticky så toggle alltid är nåbar. */}
      <header className="sticky top-0 z-10 border-b border-border backdrop-blur-md">
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

      <main className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 sm:px-8 sm:py-16">
        {/* Hero. Wordmark som h1 (bär appens tillgängliga namn, håller smoke-testet). */}
        <Fade>
          <section className="flex flex-col items-start gap-5 py-6 sm:py-10">
            <span className="rounded-pill border border-border bg-surface px-3 py-1 text-xs font-medium text-fg-muted">
              USA · Kanada · Mexiko · sommaren 2026
            </span>
            <Wordmark as="h1" className="text-5xl leading-none sm:text-7xl" />
            <p className="max-w-xl text-balance text-lg text-fg-muted sm:text-xl">
              Följ mästerskapet tillsammans. Matcher, tabeller och ett slutspelsträd som lever, plus
              tips-ligan med kompisarna. Allt i en app du delar med en länk.
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

        {/* Installations-bannern (T13): diskret erbjudande att lägga till på
            hemskärmen. Visar en install-knapp i Chrome/Android (beforeinstallprompt),
            en "Dela -> Lägg till på hemskärm"-instruktion i iOS Safari, och inget
            alls när appen redan är installerad eller tipset avfärdats. Bär sin egen
            synlighets-logik (useInstallPrompt), så den tar ingen plats när dold. */}
        <Slide direction="up">
          <InstallBanner />
        </Slide>

        {/* Gruppspelsvyn (T5) + resultatinmatningen (T6) delar EN ResultsProvider
            (T6:s delade store): en inmatning i ResultEntryView uppdaterar samma
            matcher som gruppspelstabellerna härleds ur, så tabellerna räknas om
            live (härledd state, SPEC §6). Den FUNKTIONELLA + tillgängliga
            strukturen byggs här; design-frontend ger premium-polish + den
            visuella målfirande-animationen ovanpå. */}
        <ResultsProvider>
          {/* Lag-profiler (T10): klickbara lagnamn i matchkort + tabeller öppnar en
              profil-modal (FIFA-ranking, stjärnspelare, kuriosa, lagets väg). Providern
              ligger INNANFÖR ResultsProvider eftersom profil-modalen läser den delade
              storen (lag/grupper/matcher), och OMSLUTER alla vyer med klickbara lagnamn
              (daily, gruppspel, resultatinmatning) så profilen kan öppnas från dem alla. */}
          <TeamProfileProvider>
            {/* What-if-simulatorn (T12): slå på sim-läget och spela ut tänkta
              resultat, så tabell + slutspelsträd + "Vad krävs" ändras live UTAN
              att de riktiga resultaten rörs. SimulationFrame omsluter banner:n +
              alla simulerade vyer och lägger, NÄR sim-läget är PÅ, en violett
              ram + svag tint + en sticky "Simuleringsläge"-badge runt hela zonen,
              så ingen förväxlar en simulering med de riktiga resultaten. Ramen är
              en tunn wrapper som bara läser sim-seamen i storen (en sanning); i
              vilo-läge är den helt neutral (ingen ram, ingen tint). */}
            <SimulationFrame>
              {/* Daglig matchvy (T7): startskärmens hjärta, dagens matcher +
                datumnavigering + "Match of the day"-hero med live-nedräkning. Läser
                SAMMA delade store som gruppspelet och inmatningen. Den FUNKTIONELLA
                + tillgängliga strukturen byggs här; design-frontend ger WOW-hero +
                premium-matchkort + nedräknings-visual ovanpå. */}
              <Slide direction="up">
                <DailyMatchesView />
              </Slide>

              <Slide direction="up">
                <GroupStageView />
              </Slide>

              {/* "Vad krävs"-kalkylatorn (T11): live-scenarier för sista
                gruppomgången, vad varje lag behöver för att gå vidare (Klar/Ute/
                Beror på). Läser SAMMA delade store, så scenarierna räknas om när ett
                resultat matas in. Den FUNKTIONELLA + tillgängliga strukturen +
                data-seamen byggs här; design-frontend ger premium-finish ovanpå. */}
              <Slide direction="up">
                <ScenarioView />
              </Slide>

              {/* Slutspelsträdet (T9): det levande trädet sextondel -> final. Läser
                SAMMA delade store som gruppspelet, så det justeras under gruppspelet
                (möjliga lag), låses vid grupp-slut (FIFA-seedningen) och för fram
                vinnaren när ett slutspelsresultat matas in. Den FUNKTIONELLA +
                tillgängliga strukturen + data-seamen byggs här; design-frontend ger
                premium-trädet med kopplingslinjer + vinnar-animation ovanpå. */}
              <Slide direction="up">
                <BracketView />
              </Slide>

              {/* What-if-KONTROLLEN (Starta/Återställ/Avsluta + statusmeddelandet)
                sitter DIREKT ovanför resultatinmatningen (T32, #54, Daniels feedback
                4, fynd 2). Sim-läget handlar om RESULTAT (man spelar ut tänkta
                resultat), så kontrollen får tydlig koppling genom att stå vid
                inmatnings-sektionen i stället för högst upp på sidan. Sim-RAMEN
                (SimulationFrame) omsluter fortfarande ALLA påverkade vyer (daily,
                gruppspel, "Vad krävs", slutspelsträd, inmatning) och bär den globala
                "labbet"-markeringen + den sticky badge:n; det är bara själva
                kontroll-banner:n som flyttat hit. */}
              <Slide direction="up">
                <SimulationBanner />
              </Slide>

              <Slide direction="up">
                <Panel>
                  {/* Design-frontends premium-firande kopplas in via render-proppen.
                    Kroken (i vyn) styr trigger/timing/reduced-motion, overlayn ritar
                    bara explosionen, en ren glädje-yta. */}
                  <ResultEntryView
                    renderCelebration={(celebration) => (
                      <GoalCelebrationOverlay celebration={celebration} />
                    )}
                  />
                </Panel>
              </Slide>
            </SimulationFrame>
          </TeamProfileProvider>
        </ResultsProvider>

        {/* Tips-ligan (T14): skapa/gå med i ett rum, se medlemmar, dela koden.
            Det FUNKTIONELLA + tillgängliga rums-UI:t byggs här (stabil semantik +
            data-attribut); design-frontend ger premium-finish ovanpå. RoomSection
            renderar HELA kortet bara när Supabase är konfigurerat (live-läge), i
            lokalt läge syns ingenting, så appen fungerar precis som förr. */}
        <Slide direction="up">
          <RoomSection surface={(children) => <Panel>{children}</Panel>} />
        </Slide>

        {/* Tips-motorn (T15): vänner gissar resultat före avspark. Tips är per rum,
            så PredictionSection visar tips-vyn när det sociala lagret är konfigurerat
            (live-läge), med "gå med i ett rum för att tippa" tills ett rum är aktivt.
            Deadline-låset (inget tips efter avspark) + tips-sekretessen (andras tips
            dolda före avspark) upprätthålls SERVER-SIDE av RLS, bevisat med riktiga
            sessioner. Det FUNKTIONELLA + tillgängliga UI:t byggs här (stabil semantik
            + data-attribut, samma #39-formspråk som resultatinmatningen); design-
            frontend ger premium-finish ovanpå. */}
        <Slide direction="up">
          <PredictionSection surface={(children) => <Panel>{children}</Panel>} />
        </Slide>

        {/* Gruppvinnar-tipsen (T16, VM-poolens kärna): tippa 1:an + 2:an i varje
            grupp FÖRE gruppspelet. Per rum, deadline per grupp (gruppens första
            match), server-side RLS-lås + sekretess (bevisat med riktiga sessioner).
            Funktionellt + tillgängligt UI byggs här; design-frontend ger finishen.
            Bracket-/slutspels-tipsen (vem går vidare per slot + VM-vinnaren) har
            full datakärna (schema/RLS/poäng/API) men dess UI är en pinnad
            fortsättning, se T16 HANDOFF + docs/decisions.md. */}
        <Slide direction="up">
          <GroupPredictionSection surface={(children) => <Panel>{children}</Panel>} />
        </Slide>

        {/* Bracket-/slutspels-tipsen (T16b, #59): tippa VM-vinnaren + vem som går
            vidare ur varje slutspels-slot (M73-M104). Per rum, deadline per slot
            (slottens egen avspark) + champion vid turneringsstart, server-side
            RLS-lås + sekretess (bevisat i T16). En slot tippas först när dess två lag
            är kända (gissa aldrig laget). Funktionellt + tillgängligt UI byggs här;
            design-frontend ger finishen ovanpå (datakärnan finns från T16). */}
        <Slide direction="up">
          <BracketPredictionSection surface={(children) => <Panel>{children}</Panel>} />
        </Slide>

        {/* Topplistan + tips-avslöjandet (T17, #17): vem tippar bäst (poäng från
            ALLA tre tips-typer mot facit, delad placering vid lika, rörelse-animation
            vid placeringsändring) + vad alla tippade per avgjord match (avslöjas
            FÖRST efter avspark, sekretessen är server-side i RLS, T15/T16). Per rum,
            "gå med i ett rum" tills ett rum är aktivt. Det FUNKTIONELLA + tillgängliga
            UI:t byggs här (stabil semantik + data-attribut); design-frontend ger
            premium-finish (medaljer, glow, finputsad rörelse) ovanpå. */}
        <Slide direction="up">
          <LeaderboardSection surface={(children) => <Panel>{children}</Panel>} />
        </Slide>

        <footer className="flex flex-col gap-2 border-t border-border pt-6 text-sm text-fg-muted">
          <p>
            VM 2026, USA, Kanada och Mexiko. Följ mästerskapet tillsammans, dela appen med en länk.
          </p>
          {/* Diskret upphovs-signatur (T38, #67). Stabil semantik + data-attribut
              (data-app-signature) som krok för design-frontends finputs efteråt;
              denna rad är den funktionella basen, inte den slutgiltiga stylingen. */}
          <p data-app-signature="" className="text-xs text-fg-muted/80">
            Made by Daniel Aldemir
          </p>
        </footer>
      </main>

      {/* Onboarding-touren (T13): visas EN gång vid första start (localStorage-
          flagga), aldrig igen efter klar/hoppad. Ligger på rot-nivå (utanför main)
          så modalen täcker hela skärmen. Bär sin egen öppen-logik (useOnboarding),
          renderar inget när touren redan setts. */}
      <OnboardingDialog />
    </div>
  );
}
