// App-shell , branded "foundation showcase" (T2 design).
//
// Detta är INTE de riktiga matchvyerna (de byggs i T7+). Syftet är en smakfull
// landningsyta som visar VM 2026-wordmark, tema-toggle och demonstrerar paletten
// + rörelse-känslan, så premium-kvaliteten KÄNNS live på PR-förhandsvisningen.
// Fokuserad med flit: tillräckligt för att bevisa fundamentet, inte mer.

import { Fade, Slide } from './motion';
import { ThemeToggle } from './components/ThemeToggle';
import { Wordmark } from './components/Wordmark';
import { SwatchGrid } from './components/foundation/SwatchGrid';
import { MotionDemo } from './components/foundation/MotionDemo';

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
function Panel({ children }: { children: React.ReactNode }) {
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
              Följ mästerskapet tillsammans. Matcher, tabeller och ett slutspelsträd som lever ,
              plus tips-ligan med kompisarna. Allt i en app du delar med en länk.
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
                Växla tema uppe till höger , färgerna följer med.
              </p>
              <SwatchGrid />
            </Panel>
          </Slide>

          <Slide direction="up">
            <Panel>
              <SectionHeading eyebrow="Levande känsla" title="Rörelsen" />
              <p className="mb-5 text-sm text-fg-muted">
                Mjuka, självsäkra övergångar (respekterar alltid "minska rörelse"). Ett smakprov ,
                inte den riktiga matchvyn.
              </p>
              <MotionDemo />
            </Panel>
          </Slide>
        </div>

        {/* Typografi-prov: visar display- mot brödtext-stacken. */}
        <Slide direction="up">
          <Panel>
            <SectionHeading eyebrow="Typografi" title="Display + brödtext" />
            <div className="flex flex-col gap-3">
              <p className="font-display text-4xl font-bold sm:text-5xl">Slutspelsträdet växer</p>
              <p className="max-w-2xl text-fg-muted">
                Rubriker i Space Grotesk (självhostad, lätt), brödtext i systemstacken för snabb
                laddning. En distinkt, sportig ton , inte den generiska look:en.
              </p>
            </div>
          </Panel>
        </Slide>

        <footer className="border-t border-border pt-6 text-sm text-fg-muted">
          Fundamentet är på plats: tema, rörelse och palett. Matchvyerna byggs härnäst.
        </footer>
      </main>
    </div>
  );
}
