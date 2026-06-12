// "Kom igång"-dialogen (PRESENTATION + a11y, T54/#93).
//
// FOKUS (senior-devs funktionella + a11y-lager): en glasklar yta som svarar på
// Daniels feedback, en vän ska direkt FÖRSTÅ att hen kan (a) använda appen direkt i
// webbläsaren ELLER (b) lägga den på hemskärmen som en app, med rätt steg för sin
// enhet. Standalone-läget (appen körs redan installerad) visar i stället ett kort
// "du kör appen, allt klart" i stället för instruktioner (ingen poäng att be någon
// installera det som redan är installerat). All copy + alla steg HÄRLEDS ur den rena
// datan (get-started-steps.ts), så texten har EN sanning och kan justeras utan att
// röra denna komponent.
//
// A11Y-DIALOG: knappen (i GetStartedControl) är en <button> med aria-haspopup="dialog".
// Dialogen följer projektets ETABLERADE modal-kontrakt, samma som ScoreGuide (T34),
// SettingsControl (T32), OnboardingDialog (T13), TeamProfilePanel (T10): role="dialog"
// + aria-modal, märkt av rubriken (aria-labelledby) + intro (aria-describedby), Escape
// stänger, klick på bakgrunden stänger, fokus flyttas IN vid öppning och ÅTERSTÄLLS
// till knappen vid stängning, en enkel fokus-fälla håller Tab inom dialogen, och
// overlayn PORTALERAS till document.body (samma stacking-context-skäl som T32/T34:
// en trigger i en header med sticky/backdrop-filter blir annars containing block för
// position:fixed-barn och klämmer in overlayn). Rörelse gatas mot reducerad rörelse.
//
// OBS, modal-primitiv (rule-of-three, redan flaggad i T34/#62, decisions.md): detta
// är ännu en handrullad a11y-dialog med samma kontrakt. Den extraheras MEDVETET INTE
// till en delad <Modal> i denna task (det är en egen refaktor-task, T34 flaggade
// tröskeln till dirigenten), så T54 inte rör fyra testade dialog-filer på spek.

import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { springs, transitions } from '../../motion';
import {
  GET_STARTED_PATHS,
  WEB_MODE_FACTS,
  getPathFor,
  resolveGetStartedState,
  type GetStartedPlatform,
} from './get-started-steps';

/** Props: dialogen styrs utifrån (öppen/stäng), så triggern äger fokus-återställningen. */
export interface GetStartedDialogProps {
  /** Stäng-callback (Escape, bakgrundsklick, stäng-knapp anropar denna). */
  onClose: () => void;
  /** Ref till dialog-panelen (fokus-fälla + fokus in). Ägs av triggern. */
  dialogRef: React.RefObject<HTMLDivElement | null>;
  /** Ref till stäng-knappen (fokus-startpunkt vid öppning). Ägs av triggern. */
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  /** Fokus-fälle-hanteraren (Tab hålls inom dialogen). Ägs av triggern. */
  onDialogKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** true => animera panelen (reducerad rörelse gatar bort den). Ägs av triggern. */
  motionEnabled: boolean;
}

/**
 * Själva kom-igång-dialogen. Härleder plattforms-läget EN gång per öppning (rena
 * detektor-anrop via resolveGetStartedState) och låter användaren byta väg via flikar.
 */
export function GetStartedDialog({
  onClose,
  dialogRef,
  closeButtonRef,
  onDialogKeyDown,
  motionEnabled,
}: GetStartedDialogProps) {
  // Härled läget ur webbläsaren en gång vid öppning (standalone? + förvald plattform).
  const [{ isStandalone, defaultPlatform }] = useState(() => resolveGetStartedState(window));
  // Vilken plattforms-flik som är aktiv (startar på den förvalda, kan bytas).
  const [activePlatform, setActivePlatform] = useState<GetStartedPlatform>(defaultPlatform);

  const headingId = 'kom-igang-rubrik';
  const introId = 'kom-igang-intro';

  const panelInitial = motionEnabled ? { opacity: 0, y: 24, scale: 0.98 } : { opacity: 0 };
  const panelAnimate = motionEnabled ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1 };

  return createPortal(
    <motion.div
      data-get-started-overlay=""
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
        data-get-started-dialog=""
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
        initial={panelInitial}
        animate={panelAnimate}
        transition={motionEnabled ? springs.gentle : transitions.quick}
        className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-card border border-border bg-surface shadow-[var(--vm-shadow-raised)] sm:max-h-[88dvh] sm:rounded-card"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Stäng kom igång"
          data-get-started-close=""
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-pill border border-border bg-surface/80 text-fg-muted outline-none backdrop-blur-sm transition-colors hover:bg-surface-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </button>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <header className="flex flex-col gap-1 border-b border-border px-6 pb-5 pr-14 pt-6 sm:px-7 sm:pt-7">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Kom igång
            </p>
            <h2 id={headingId} className="font-display text-xl font-bold leading-tight sm:text-2xl">
              Använd appen direkt, eller lägg den på hemskärmen
            </h2>
          </header>

          {isStandalone ? (
            <AlreadyInstalled introId={introId} />
          ) : (
            <GetStartedBody
              introId={introId}
              activePlatform={activePlatform}
              onSelectPlatform={setActivePlatform}
            />
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

/**
 * Standalone-läget: appen körs redan installerad, så vi ber INTE användaren
 * installera den igen, vi bekräftar bara lugnt att allt är på plats (T54-direktivet:
 * "redan installerad -> visa 'du kör appen, allt klart'").
 */
function AlreadyInstalled({ introId }: { introId: string }) {
  return (
    <div data-get-started-installed="" className="flex flex-col gap-3 px-6 py-6 sm:px-7">
      <p id={introId} className="text-sm leading-relaxed text-fg">
        Du kör redan appen från hemskärmen, allt är klart. Dina tips sparas stabilt och du startar
        appen med ett tryck.
      </p>
      <p className="text-sm leading-relaxed text-fg-muted">
        Inget mer att göra här. Stäng den här rutan och fortsätt följa VM:t.
      </p>
    </div>
  );
}

/** Webb-läges-info (alltid) + plattforms-flikar med rätt installations-steg. */
function GetStartedBody({
  introId,
  activePlatform,
  onSelectPlatform,
}: {
  introId: string;
  activePlatform: GetStartedPlatform;
  onSelectPlatform: (platform: GetStartedPlatform) => void;
}) {
  return (
    <div className="flex flex-col gap-6 px-6 py-5 sm:px-7 sm:py-6">
      {/* VÄG 1: använd direkt i webbläsaren (med ärlig info). */}
      <WebModeSection introId={introId} />

      {/* VÄG 2: lägg på hemskärmen, rätt steg för rätt enhet bakom flikar. */}
      <section aria-labelledby="kom-igang-app-rubrik" className="flex flex-col gap-3">
        <h3
          id="kom-igang-app-rubrik"
          className="font-display text-sm font-bold uppercase tracking-[0.12em] text-fg"
        >
          Eller lägg den på hemskärmen som en app
        </h3>
        <p className="text-sm leading-relaxed text-fg-muted">
          Då öppnas den i helskärm, startar snabbt och fungerar även utan nät. Välj din enhet:
        </p>

        <PlatformTabs activePlatform={activePlatform} onSelectPlatform={onSelectPlatform} />
        <PlatformSteps activePlatform={activePlatform} />
      </section>
    </div>
  );
}

/** "Använd direkt i webbläsaren"-rutan: intro + ärliga punkter + rekommendation. */
function WebModeSection({ introId }: { introId: string }) {
  return (
    <section
      aria-labelledby="kom-igang-webb-rubrik"
      data-get-started-web=""
      className="flex flex-col gap-2 rounded-card border border-border bg-surface-raised p-4"
    >
      <h3
        id="kom-igang-webb-rubrik"
        className="font-display text-sm font-bold uppercase tracking-[0.12em] text-fg"
      >
        {WEB_MODE_FACTS.heading}
      </h3>
      <p id={introId} className="text-sm leading-relaxed text-fg">
        {WEB_MODE_FACTS.intro}
      </p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {WEB_MODE_FACTS.cautions.map((caution) => (
          <li
            key={caution}
            className="flex items-start gap-2 text-sm leading-relaxed text-fg-muted"
          >
            {/* Dekorativ "viktigt"-prick; texten bär hela betydelsen. */}
            <span
              aria-hidden="true"
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-pill bg-warning"
            />
            {caution}
          </li>
        ))}
      </ul>
      <p className="text-sm font-medium leading-relaxed text-fg">{WEB_MODE_FACTS.recommendation}</p>
    </section>
  );
}

/**
 * Plattforms-flikarna. En tablist (WCAG: role="tablist"/"tab", aria-selected), så en
 * skärmläsare/tangentbordsanvändare förstår att det är växlingsbara vägar. Den aktiva
 * fliken bär aria-selected=true; klick byter aktiv väg.
 */
function PlatformTabs({
  activePlatform,
  onSelectPlatform,
}: {
  activePlatform: GetStartedPlatform;
  onSelectPlatform: (platform: GetStartedPlatform) => void;
}) {
  return (
    <div role="tablist" aria-label="Välj enhet" className="flex flex-wrap gap-2">
      {GET_STARTED_PATHS.map((path) => {
        const selected = path.platform === activePlatform;
        return (
          <button
            key={path.platform}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`kom-igang-steg-${path.platform}`}
            id={`kom-igang-flik-${path.platform}`}
            data-get-started-tab={path.platform}
            onClick={() => onSelectPlatform(path.platform)}
            className="rounded-pill border px-3.5 py-1.5 font-display text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
            style={{
              backgroundColor: selected ? 'var(--color-accent)' : 'var(--color-surface)',
              color: selected ? 'var(--color-accent-fg)' : 'var(--color-fg-muted)',
              borderColor: selected
                ? 'color-mix(in srgb, var(--color-accent) 70%, transparent)'
                : 'var(--color-border)',
            }}
          >
            {path.label}
          </button>
        );
      })}
    </div>
  );
}

/** De numrerade stegen för den aktiva plattformen + ev. plattforms-noten. */
function PlatformSteps({ activePlatform }: { activePlatform: GetStartedPlatform }) {
  const path = getPathFor(activePlatform);
  // getPathFor är total över GetStartedPlatform-unionen (varje plattform finns i
  // GET_STARTED_PATHS), men TypeScript vet inte det, så vi fail-loud:ar hellre än
  // renderar en tom yta om datan och unionen någonsin drifter isär (PRINCIPLES §8).
  if (path === undefined) {
    return null;
  }
  return (
    <div
      role="tabpanel"
      id={`kom-igang-steg-${activePlatform}`}
      aria-labelledby={`kom-igang-flik-${activePlatform}`}
      data-get-started-steps={activePlatform}
      className="flex flex-col gap-3"
    >
      {/* Numrerad lista = ordningen bärs av <ol> (skärmläsare läser steg-numren),
          inte av en hårdkodad siffra i texten. */}
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {path.steps.map((step, index) => (
          <li key={step.id} data-get-started-step={step.id} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-accent font-display text-xs font-bold text-accent-fg tabular-nums"
            >
              {index + 1}
            </span>
            <span className="text-sm leading-relaxed text-fg">{step.text}</span>
          </li>
        ))}
      </ol>
      {path.note !== null ? (
        <p
          data-get-started-note={activePlatform}
          className="rounded-card border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-fg-muted"
        >
          {path.note}
        </p>
      ) : null}
    </div>
  );
}
