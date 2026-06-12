// "Kom igång"-kontrollen (T54/#93): en synlig knapp som öppnar kom-igång-dialogen.
//
// FOKUS: en omisskännlig affordans ("Kom igång, installera eller använd direkt") som
// gör Daniels två vägar nåbara, och som är ALLTID nåbar efter onboardingen genom att
// monteras i inställnings-portalen (SettingsControl). Komponenten äger bara öppet/
// stängt-tillståndet + a11y-fokus; allt innehåll bor i GetStartedDialog/-steps.
//
// A11y-fokus-kontraktet (samma hjälpare som ScoreGuide T34 / SettingsControl T32):
// Escape stänger, fokus flyttas in i dialogen vid öppning och ÅTERSTÄLLS till just
// den knapp som öppnade den vid stängning (trigger fångas i en lokal variabel i
// effekten, så fokus återlämnas korrekt även om ref:en hunnit ändras), en enkel
// fokus-fälla håller Tab inom dialogen.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useReducedMotion } from 'motion/react';
import { GetStartedDialog } from './GetStartedDialog';

/** Variant styr hur triggern ser ut beroende på var den monteras. */
export interface GetStartedControlProps {
  /**
   * 'settings' (default): en full-bredds rad-knapp som passar i inställnings-listan
   * (alltid nåbar efter onboardingen). 'inline': en kompakt pill-knapp (t.ex. för
   * onboardingens install-steg). Stilen skiljer, beteendet (dialogen) är identiskt.
   */
  variant?: 'settings' | 'inline';
}

export function GetStartedControl({ variant = 'settings' }: GetStartedControlProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const motionEnabled = useReducedMotion() === false;

  const close = useCallback(() => setOpen(false), []);

  // Escape stänger. Lyssnaren bara när öppen (städas vid stängning/unmount).
  // CAPTURE-fas + stopPropagation (copilot R2): dialogen kan öppnas OVANPÅ en annan
  // modal (onboardingens "Visa hur"-CTA), och båda lyssnar på document. Utan detta
  // når samma Escape-tryck även den underliggande modalens lyssnare och stänger
  // BÅDA på en gång. Capture låter den överst liggande dialogen konsumera Escape
  // först; den underliggande stängs av nästa tryck, som förväntat.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, close]);

  // Fokus in vid öppning, tillbaka till triggern vid stängning. Triggern fångas i en
  // lokal variabel vid öppningen och används i cleanup (samma grepp som de andra
  // modalerna), så fokus alltid återlämnas till just den knapp som öppnade dialogen.
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

  const inline = variant === 'inline';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        // Inline-variantens synliga text är bara "Visa hur" (kompakt i onboardingen).
        // aria-label ger skärmläsaren hela sammanhanget, och BÖRJAR med den synliga
        // texten (WCAG 2.5.3 Label in Name, copilot R4). Settings-varianten bär sin
        // fulla text synligt och behöver ingen label.
        aria-label={
          inline ? 'Visa hur du installerar appen eller kör den i webbläsaren' : undefined
        }
        data-get-started-open={variant}
        className={
          inline
            ? 'inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-2 font-display text-sm font-semibold text-accent-fg shadow-md outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_88%,black)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]'
            : 'flex w-full items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left outline-none transition-colors hover:border-accent/60 hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]'
        }
      >
        {inline ? (
          'Visa hur'
        ) : (
          <>
            <span className="flex flex-col gap-0.5">
              <span className="font-display text-sm font-semibold text-fg">Kom igång</span>
              <span className="text-xs text-fg-muted">
                Installera som app, eller använd direkt i webbläsaren
              </span>
            </span>
            {/* Dekorativ chevron, etiketten bär betydelsen. */}
            <span aria-hidden="true" className="text-fg-muted">
              ›
            </span>
          </>
        )}
      </button>

      {open ? (
        <GetStartedDialog
          onClose={close}
          dialogRef={dialogRef}
          closeButtonRef={closeButtonRef}
          onDialogKeyDown={onDialogKeyDown}
          motionEnabled={motionEnabled}
        />
      ) : null}
    </>
  );
}
