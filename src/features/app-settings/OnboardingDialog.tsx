// Onboarding-touren (PRESENTATION + a11y-dialog, T13).
//
// FOKUS: en KORREKT modal-dialog (samma a11y-kontrakt som lag-profil-modalen,
// T10): role="dialog" + aria-modal, märkt av rubriken (aria-labelledby), Escape
// stänger (= hoppa över), fokus flyttas in vid öppning och tillbaka vid stängning,
// och en enkel fokus-fälla håller Tab inom dialogen. Rörelse gatas EXPLICIT mot
// reducerad rörelse (=== false), samma motion-grind som T10 (undviker 1-frames-
// flash innan preferensen är känd).
//
// Runtime-tillståndet (öppen, steg, persistens) ägs av useOnboarding; denna
// komponent renderar bara och anropar tillbaka.

import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { springs, transitions } from '../../motion';
import { ONBOARDING_STEPS, ONBOARDING_STEP_COUNT } from './onboarding';
import { useOnboarding } from './use-onboarding';

export function OnboardingDialog() {
  const { open, stepIndex, onLastStep, next, finish } = useOnboarding();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const motionEnabled = useReducedMotion() === false;

  // Escape = hoppa över touren (stäng + markera avklarad). Lyssnaren läggs bara
  // när touren är öppen (städas vid stängning/unmount).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        finish();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, finish]);

  // Flytta fokus in i dialogen vid öppning (tappa inte bort tangentbords-
  // användaren), återställ till öppnaren vid stängning. Bind till `open` (stabilt
  // boolean), inte till härlett innehåll, så effekten löper en gång per öppning.
  useEffect(() => {
    if (!open) {
      return;
    }
    openerRef.current = document.activeElement as HTMLElement | null;
    primaryButtonRef.current?.focus();
    return () => {
      openerRef.current?.focus?.();
    };
  }, [open]);

  // Fokus-fälla: håll Tab inom dialogen (samma hjälpare som TeamProfilePanel).
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

  if (!open) {
    return null;
  }

  const step = ONBOARDING_STEPS[stepIndex];
  const headingId = 'onboarding-rubrik';
  const bodyId = 'onboarding-text';

  const panelInitial = motionEnabled ? { opacity: 0, y: 24, scale: 0.98 } : { opacity: 0 };
  const panelAnimate = motionEnabled ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1 };

  return (
    // Overlay täcker skärmen. Vi stänger INTE på bakgrundsklick här (till skillnad
    // från lag-profilen): en första-gångs-tour ska inte avfärdas av ett oavsiktligt
    // klick utanför, användaren väljer "Hoppa över" eller går igenom stegen.
    <motion.div
      data-onboarding-overlay=""
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitions.quick}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 backdrop-blur-sm sm:items-center sm:p-6"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg) 72%, transparent)' }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={bodyId}
        data-onboarding-dialog=""
        data-onboarding-step={step.id}
        onKeyDown={onDialogKeyDown}
        initial={panelInitial}
        animate={panelAnimate}
        transition={motionEnabled ? springs.gentle : transitions.quick}
        className="relative flex w-full max-w-md flex-col gap-5 rounded-t-card border border-border bg-surface p-6 shadow-[var(--vm-shadow-raised)] sm:rounded-card sm:p-7"
      >
        <header className="flex flex-col gap-2">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Välkommen till VM 2026
          </p>
          <h2 id={headingId} className="font-display text-2xl font-bold sm:text-3xl">
            {step.title}
          </h2>
          <p id={bodyId} className="text-sm leading-relaxed text-fg-muted">
            {step.body}
          </p>
        </header>

        {/* Steg-indikator: prickar som visar var i touren man är. aria-hidden,
            steg-status bärs av "Steg X av Y"-texten nedan för skärmläsare. */}
        <div aria-hidden="true" data-onboarding-dots="" className="flex gap-1.5">
          {ONBOARDING_STEPS.map((s, i) => (
            <span
              key={s.id}
              className="h-1.5 rounded-pill transition-all duration-200"
              style={{
                width: i === stepIndex ? '1.5rem' : '0.375rem',
                backgroundColor:
                  i === stepIndex
                    ? 'var(--color-accent)'
                    : 'color-mix(in srgb, var(--color-fg) 20%, transparent)',
              }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-fg-muted">
            Steg {stepIndex + 1} av {ONBOARDING_STEP_COUNT}
          </span>
          <div className="flex gap-2">
            {/* HOPPA ÖVER: bara meningsfullt innan sista steget (där den primära
                knappen ändå stänger). Markerar touren som avklarad. */}
            {!onLastStep ? (
              <button
                type="button"
                data-onboarding-skip=""
                onClick={finish}
                className="rounded-pill border border-border bg-surface px-4 py-2 font-display text-sm font-semibold text-fg-muted outline-none transition-colors hover:bg-surface-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
              >
                Hoppa över
              </button>
            ) : null}
            {/* PRIMÄR: "Nästa" tills sista steget, då "Klart". Fokus-startpunkt. */}
            <button
              ref={primaryButtonRef}
              type="button"
              data-onboarding-next={onLastStep ? 'finish' : 'next'}
              onClick={next}
              className="rounded-pill bg-accent px-5 py-2 font-display text-sm font-semibold text-accent-fg shadow-md outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_88%,black)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
            >
              {onLastStep ? 'Klart' : 'Nästa'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
