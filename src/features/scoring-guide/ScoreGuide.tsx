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
   * Data-attribut-namnrymd (`data-score-guide-${surface}-*`), så de TVÅ mount-
   * punkterna (tippning, topplista) får stabila, egna test-/styling-krokar utan
   * att kollidera. Samma mönster som ExpandToggle:s `name`. Default 'tips'.
   */
  surface?: string;
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
        className="inline-flex items-center gap-1.5 rounded-pill border border-[color-mix(in_srgb,var(--vm-gold)_30%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_8%,var(--color-surface))] px-3 py-1.5 font-display text-xs font-semibold text-fg outline-none transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--vm-gold)_16%,var(--color-surface))] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
      >
        {/* Liten fråge-cirkel som affordans (dekorativ, etiketten bär betydelsen). */}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: 'var(--vm-gold)' }}
        >
          <circle cx="8" cy="8" r="6.5" />
          <path d="M6.2 6.1a1.8 1.8 0 0 1 3.5.6c0 1.2-1.7 1.5-1.7 2.6" />
          <path d="M8 11.4h.01" />
        </svg>
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
  const headingId = `score-guide-rubrik-${surface}`;
  const introId = `score-guide-intro-${surface}`;
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
        className="relative flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-card border border-border bg-surface p-6 shadow-[var(--vm-shadow-raised)] sm:max-h-[88dvh] sm:rounded-card sm:p-7"
      >
        <header className="flex items-start justify-between gap-3 pr-1">
          <div className="flex flex-col gap-1">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
              Poängen
            </p>
            <h2 id={headingId} className="font-display text-xl font-bold sm:text-2xl">
              Så funkar poängen
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Stäng förklaringen"
            data-score-guide-close={surface}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill border border-border bg-surface text-fg-muted outline-none transition-colors hover:bg-surface-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ×
            </span>
          </button>
        </header>

        <p id={introId} className="text-sm leading-relaxed text-fg-muted">
          Du samlar poäng genom att tippa rätt. Här ser du vad varje rätt gissning ger, ju svårare
          och mer exakt, desto mer.
        </p>

        <div className="flex flex-col gap-4">
          {sections.map((section) => (
            <ScoreSection key={section.id} surface={surface} section={section} />
          ))}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

/** En grupp regel-rader under en rubrik (matcherna, grupperna, slutspelet, mästaren). */
function ScoreSection({ surface, section }: { surface: string; section: ScoreExplainerSection }) {
  const headingId = `score-guide-${surface}-${section.id}`;
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
            {/* Poäng-brickan: HÄRLEDD text ur konstanten (formatScorePoints), aldrig
                en hårdkodad siffra. tabular-nums så talen står stadigt. */}
            <span className="inline-flex shrink-0 items-baseline rounded-pill bg-[color-mix(in_srgb,var(--vm-gold)_14%,var(--color-surface-raised))] px-2.5 py-0.5 font-display text-sm font-bold tabular-nums text-fg">
              {formatScorePoints(item.points)}
            </span>
            <span className="text-sm leading-relaxed text-fg-muted">{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
