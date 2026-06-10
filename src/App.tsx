// App-shell , branded "foundation showcase" (T2 design).
//
// Detta är INTE de riktiga matchvyerna (de byggs i T7+). Syftet är en smakfull
// landningsyta som visar VM 2026-wordmark, tema-toggle och demonstrerar paletten
// + rörelse-känslan, så premium-kvaliteten KÄNNS live på PR-förhandsvisningen.
// Fokuserad med flit: tillräckligt för att bevisa fundamentet, inte mer.

import type { ReactNode } from 'react';
import { Fade, Slide } from './motion';
import { ThemeToggle } from './components/ThemeToggle';
import { Wordmark } from './components/Wordmark';
import { SwatchGrid } from './components/foundation/SwatchGrid';
import { MotionDemo } from './components/foundation/MotionDemo';
import { DailyMatchesView } from './features/daily';
import { GroupStageView } from './features/groups';
import { BracketView } from './features/bracket';
import { GoalCelebrationOverlay, ResultEntryView, ResultsProvider } from './features/results';
import { ScenarioView } from './features/scenarios';
import { SimulationBanner } from './features/simulation';
import { TeamProfileProvider } from './features/team-profile';

/** Sektions-rubrik med liten överrad (eyebrow) för redaktionell känsla. */
function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="mb-5">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
        {eyebrow}
      </p>
      <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">{title}</h2>
    </header>
  );
}

/** Ett innehållskort på en yt-token, samma form återanvänds i showcasen. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-[var(--vm-shadow-card)] sm:p-7">
      {children}
    </section>
  );
}

export default function App() {
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
          <ThemeToggle />
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

        {/* Foundation-grid: palett + rörelse sida vid sida på stora skärmar,
            staplade på mobil. Inga krockande element, kolumnerna bryts rent. */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Slide direction="up">
            <Panel>
              <SectionHeading eyebrow="Designfundament" title="Paletten" />
              <p className="mb-5 text-sm text-fg-muted">
                Arena i kvällsljus: djup grönsvart fond, elektrisk gräsplan-grön och pokal-guld.
                Växla tema uppe till höger, färgerna följer med.
              </p>
              <SwatchGrid />
            </Panel>
          </Slide>

          <Slide direction="up">
            <Panel>
              <SectionHeading eyebrow="Levande känsla" title="Rörelsen" />
              <p className="mb-5 text-sm text-fg-muted">
                Mjuka, självsäkra övergångar (respekterar alltid "minska rörelse"). Ett smakprov,
                inte den riktiga matchvyn.
              </p>
              <MotionDemo />
            </Panel>
          </Slide>
        </div>

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
              att de riktiga resultaten rörs. Markeringen ("Simulering pågår") +
              Återställ/Avsluta bor här; eftersom läget bara är ett overlay i den
              delade storen reagerar ALLA vyer nedanför automatiskt. Ligger överst
              så markeringen syns innan man bläddrar i de simulerade vyerna. */}
            <Slide direction="up">
              <SimulationBanner />
            </Slide>

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
          </TeamProfileProvider>
        </ResultsProvider>

        {/* Typografi-prov: visar display- mot brödtext-stacken. */}
        <Slide direction="up">
          <Panel>
            <SectionHeading eyebrow="Typografi" title="Display + brödtext" />
            <div className="flex flex-col gap-3">
              <p className="font-display text-4xl font-bold sm:text-5xl">Slutspelsträdet växer</p>
              <p className="max-w-2xl text-fg-muted">
                Rubriker i Space Grotesk (självhostad, lätt), brödtext i systemstacken för snabb
                laddning. En distinkt, sportig ton, inte den generiska look:en.
              </p>
            </div>
          </Panel>
        </Slide>

        <footer className="border-t border-border pt-6 text-sm text-fg-muted">
          Fundamentet är på plats: tema, rörelse, palett, gruppspelet och det levande
          slutspelsträdet. Tips-ligan byggs härnäst.
        </footer>
      </main>
    </div>
  );
}
