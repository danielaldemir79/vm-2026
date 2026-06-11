// "Så funkar poängen", en ÅTERANVÄNDBAR förklaring (T34, #62).
//
// FOKUS (senior-devs funktionella + a11y-lager): en synlig, inbjudande knapp som
// öppnar en lättläst förklaring av hela poäng-skalan i klartext. Samma komponent
// monteras på TVÅ ställen, vid tippningen (PredictionsView) OCH vid topplistan
// (LeaderboardSummary), så texten har EN sanning och aldrig kan drifta mellan
// ytorna. Talen HÄRLEDS ur poäng-konstanterna (buildScoreExplainer), aldrig
// hårdkodade här, se score-explainer-items.ts + dess mutations-vakt-test.
//
// VARFÖR en modal (inte en inline-utfällning): förklaringen ska kännas som en
// lugn "titt på reglerna" ovanpå nuvarande vy, nåbar från två ytor utan att
// dubblera innehållet inline i båda. Samma KISS-val som lag-profilen (T10) och
// inställningarna (T32): en overlay i en router-lös PWA.
//
// A11Y-DIALOG: knappen är en <button> med aria-haspopup="dialog"/aria-expanded.
// Dialogen följer projektets etablerade modal-kontrakt (role="dialog", aria-modal,
// aria-labelledby, Escape stänger, klick på bakgrunden stänger, fokus flyttas IN
// vid öppning och ÅTERSTÄLLS till knappen vid stängning, en enkel fokus-fälla
// håller Tab inom dialogen). Overlayn PORTALERAS till document.body, av exakt
// samma skäl som SettingsControl (T32, #54): en trigger kan sitta i en header med
// sticky/backdrop-filter, som blir containing block för position:fixed-barn och
// klämmer in overlayn, portalen lyfter den till rot-stacking-contexten.
//
// OBS, rule-of-three (kort #56): detta är nu den FJÄRDE handrullade a11y-dialogen
// (TeamProfilePanel T10, OnboardingDialog T13, SettingsControl T32, denna).
// Kontraktet är medvetet kopierat snarare än lyft till en delad primitiv I DENNA
// task, för att inte bygga abstraktionen "på spek" och röra tre testade filer i en
// förklarings-task. Att tröskeln nu passerats flaggas i handoff till dirigenten
// som en egen refaktor-task (extrahera <Modal>), inte smyglagd här.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { springs, transitions } from '../../motion';
import {
  buildScoreExplainer,
  formatScorePoints,
  type ScoreExplainerSection,
} from './score-explainer-items';

export interface ScoreGuideProps {
  /**
   * Mount-yta-markör. Ligger som VÄRDE i de fasta data-attributen
   * (`data-score-guide-open={surface}`, `-overlay`, `-dialog`, `-close`), så de TVÅ
   * mount-punkterna (tippning, topplista) får stabila, egna test-/styling-krokar utan
   * att kollidera. Används också (id-saniterad) i dialogens aria-id:n. Default 'tips'.
   */
  surface?: string;
}

/**
 * Gör surface säkert som HTML-id-fragment: aria-labelledby/-describedby är
 * space-separerade IDREF-listor, så ett surface med whitespace ("topplista v2")
 * skulle annars peka på flera/ogiltiga id:n och dialogen tappa sitt accessible name.
 */
function toIdSafeSurface(surface: string): string {
  return surface.replace(/[^A-Za-z0-9_-]/g, '-');
}

/**
 * "Så funkar poängen"-ytan: en knapp + en a11y-dialog med hela poäng-förklaringen.
 * Innehållet HÄRLEDS ur konstanterna (buildScoreExplainer), så det är samma sanning
 * som poänglogiken. Komponenten äger bara öppet/stängt-tillståndet + a11y; den bär
 * inga egna poäng-siffror.
 */
export function ScoreGuide({ surface = 'tips' }: ScoreGuideProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const motionEnabled = useReducedMotion() === false;

  const close = useCallback(() => setOpen(false), []);

  // Escape stänger. Lyssnaren bara när öppen (städas vid stängning/unmount).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  // Fokus in vid öppning, tillbaka till knappen vid stängning. Vi FÅNGAR trigger-
  // elementet i en lokal variabel vid öppningen och använder den i cleanup (samma
  // grepp som SettingsControl), så fokus alltid återlämnas till just den knapp som
  // öppnade dialogen, även om ref:en hunnit ändras.
  useEffect(() => {
    if (!open) {
      return;
    }
    const trigger = triggerRef.current;
    closeButtonRef.current?.focus();
    return () => {
      trigger?.focus?.();
    };
  }, [open]);

  // Fokus-fälla: håll Tab inom dialogen (samma hjälpare som de andra modalerna).
  const onDialogKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || dialogRef.current === null) {
      return;
    }
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-score-guide-open={surface}
        className="vm-score-trigger inline-flex items-center gap-2 rounded-pill border px-3.5 py-1.5 font-display text-xs font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
      >
        {/* Guld-frågesigill (solid bricka + mörk ink) som tydlig "här finns en
            förklaring"-affordans. Dekorativt, etiketten bär betydelsen. */}
        <span aria-hidden="true" className="vm-score-trigger-seal h-4 w-4 text-[0.625rem]">
          ?
        </span>
        Så funkar poängen
      </button>

      {open ? (
        <ScoreGuideDialog
          surface={surface}
          dialogRef={dialogRef}
          closeButtonRef={closeButtonRef}
          onClose={close}
          onDialogKeyDown={onDialogKeyDown}
          motionEnabled={motionEnabled}
        />
      ) : null}
    </>
  );
}

/** Själva dialog-skalet (overlay + modal-panel + förklaringen). Intern, en sak. */
function ScoreGuideDialog({
  surface,
  dialogRef,
  closeButtonRef,
  onClose,
  onDialogKeyDown,
  motionEnabled,
}: {
  surface: string;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onDialogKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  motionEnabled: boolean;
}) {
  // Id-saniterad form i alla aria-id:n (copilot R1): IDREF tål inte whitespace.
  const idSurface = toIdSafeSurface(surface);
  const headingId = `score-guide-rubrik-${idSurface}`;
  const introId = `score-guide-intro-${idSurface}`;
  // Härled förklaringen ur konstanterna EN gång per öppning (rent, inga sidoeffekter).
  const sections = buildScoreExplainer();

  const panelInitial = motionEnabled ? { opacity: 0, y: 24, scale: 0.98 } : { opacity: 0 };
  const panelAnimate = motionEnabled ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1 };

  return createPortal(
    <motion.div
      data-score-guide-overlay={surface}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitions.quick}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 backdrop-blur-sm sm:items-center sm:p-6"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg) 70%, transparent)' }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={introId}
        data-score-guide-dialog={surface}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
        initial={panelInitial}
        animate={panelAnimate}
        transition={motionEnabled ? springs.gentle : transitions.quick}
        className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-card border border-border bg-surface shadow-[var(--vm-shadow-raised)] sm:max-h-[88dvh] sm:rounded-card"
      >
        {/* Stäng-knappen (stabil fokus-startpunkt) svävar över hero-bandet med egen
            fond, så den syns mot den ljustonade arena-glow:en. Samma grepp som
            lag-profilen (T10). */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Stäng förklaringen"
          data-score-guide-close={surface}
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-pill border border-border bg-surface/80 text-fg-muted outline-none backdrop-blur-sm transition-colors hover:bg-surface-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </button>

        {/* Scroll-region: hero + intro + sektioner. Kroppen får aldrig svämma över
            overlayns kant (max-h på panelen + intern scroll här). */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* HERO-BANDET: "arena i kvällsljus" i grön + guld (samma familj som lag-
              profilen och slutspels-hjälten). Pokal-emblem + eyebrow + rubrik. All
              text står på den opaka surface-raised-fonden, glow:en är ren stämning. */}
          <header className="vm-score-guide-hero flex items-center gap-4 border-b border-border px-6 pb-5 pt-6 pr-14 sm:px-7 sm:pt-7">
            {/* Pokal-emblem (solid guld + mörk ink). Dekorativt, rubriken bär betydelsen. */}
            <span
              aria-hidden="true"
              className="vm-score-guide-emblem h-11 w-11 rounded-pill sm:h-12 sm:w-12"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 4h10v3a5 5 0 0 1-10 0V4Z" />
                <path d="M7 5H4.5a2.5 2.5 0 0 0 2.5 4M17 5h2.5a2.5 2.5 0 0 1-2.5 4" />
                <path d="M12 12v3M9 19h6M10 19v-1.2a2 2 0 0 1 4 0V19" />
              </svg>
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
                Poängen
              </p>
              <h2
                id={headingId}
                className="font-display text-xl font-bold leading-tight sm:text-2xl"
              >
                Så funkar poängen
              </h2>
            </div>
          </header>

          {/* KROPP: intro + sektionerna, generös andning. */}
          <div className="flex flex-col gap-5 px-6 py-5 sm:px-7 sm:py-6">
            <p id={introId} className="text-sm leading-relaxed text-fg-muted">
              Du samlar poäng genom att tippa rätt. Här ser du vad varje rätt gissning ger, ju
              svårare och mer exakt, desto mer.
            </p>

            <div className="flex flex-col gap-5">
              {sections.map((section) => (
                <ScoreSection key={section.id} surface={surface} section={section} />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

/** En grupp regel-rader under en rubrik (matcherna, grupperna, slutspelet, mästaren). */
function ScoreSection({ surface, section }: { surface: string; section: ScoreExplainerSection }) {
  const headingId = `score-guide-${toIdSafeSurface(surface)}-${section.id}`;
  return (
    <section aria-labelledby={headingId} data-score-guide-section={section.id}>
      <h3
        id={headingId}
        className="mb-2 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted"
      >
        <span aria-hidden="true" className="h-3 w-1 rounded-pill bg-accent" />
        {section.heading}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {section.items.map((item) => (
          <li key={item.id} data-score-guide-rule={item.id} className="flex items-baseline gap-3">
            {/* Poäng-brickan: HÄRLEDD text ur konstanten (formatScorePoints), aldrig en
                hårdkodad siffra. STOLT solid guld-bricka med mörk ink (.vm-score-points),
                samma färg-oberoende, AA-säkra solid-bricka-form som kupongens/facitets
                tal, så den undviker guld-på-tint-fällan. tabular-nums = stadiga tal. */}
            <span className="vm-score-points min-w-[2.75rem] justify-center rounded-pill px-2.5 py-0.5 text-sm tabular-nums">
              {formatScorePoints(item.points)}
            </span>
            <span className="text-sm leading-relaxed text-fg-muted">{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
