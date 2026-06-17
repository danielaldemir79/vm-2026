// "Kom igång"-kontrollen (T54/#93): en synlig knapp som öppnar kom-igång-dialogen.
//
// FOKUS: en omisskännlig affordans ("Kom igång, installera eller använd direkt") som
// gör Daniels två vägar nåbara, och som är ALLTID nåbar efter onboardingen genom att
// monteras i inställnings-portalen (SettingsControl). Komponenten äger bara öppet/
// stängt-tillståndet + a11y-fokus; allt innehåll bor i GetStartedDialog/-steps.
//
// A11y-dialog-kontraktet ägs nu av den delade <Modal>-primitiven (T33/#56): Escape,
// fokus in/ut, fokus-fälla, portal, motion-gating. VIKTIGT: kom-igång-guiden kan öppnas
// OVANPÅ onboardingen ("Visa hur"-CTA:n i install-steget), så den sätter escapeCapture
// (capture-fas + stopPropagation) så ett Escape bara stänger guiden, inte den
// underliggande touren (T54/#93 F2, bevarat). Övriga dialoger lyssnar i bubble-fasen.

import { useRef, useState } from 'react';
import { Modal } from '../../components/Modal';
import { GetStartedDialog, GET_STARTED_HEADING_ID, GET_STARTED_INTRO_ID } from './GetStartedDialog';
import type { GetStartedPlatform } from './get-started-steps';

/** Variant styr hur triggern ser ut beroende på var den monteras. */
export interface GetStartedControlProps {
  /**
   * 'settings' (default): en full-bredds rad-knapp som passar i inställnings-listan
   * (alltid nåbar efter onboardingen). 'inline': en kompakt pill-knapp (t.ex. för
   * onboardingens install-steg). 'install' (T63, #113): en KOMPAKT, diskret "Installera
   * som app"-pill för ytan överst, som öppnar guiden när ingen native-prompt finns
   * (iOS + fallback). Stilen skiljer, beteendet (dialogen) är identiskt.
   */
  variant?: 'settings' | 'inline' | 'install';
  /**
   * Påtvingad start-flik (T63, #113), vidarebefordras till dialogen: install-variantens
   * iOS-gren öppnar guiden direkt på iPhone-fliken. Utelämnas => dialogen härleder den
   * förvalda fliken själv (resolveGetStartedState).
   */
  initialPlatform?: GetStartedPlatform;
}

export function GetStartedControl({
  variant = 'settings',
  initialPlatform,
}: GetStartedControlProps) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = () => setOpen(false);

  const inline = variant === 'inline';
  const install = variant === 'install';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        // Inline-/install-varianternas synliga text är kort, så aria-label ger
        // skärmläsaren hela sammanhanget och BÖRJAR med den synliga texten (WCAG 2.5.3
        // Label in Name, copilot R4). Settings-varianten bär sin fulla text synligt.
        aria-label={
          inline
            ? 'Visa hur du installerar appen eller kör den i webbläsaren'
            : install
              ? 'Installera som app, visa hur du lägger appen på hemskärmen'
              : undefined
        }
        data-get-started-open={variant}
        className={
          install
            ? // KOMPAKT, diskret pill (T63, #113): syns men tar inte fokus. Surface-tonad
              // (inte accent-fylld) så den är lågmäld, men en liten install-ikon + tydlig
              // text gör affordansen omisskännlig. Den delade .vm-install-pill (tokens.css
              // §22), EXAKT samma utseende som InstallButtons native-gren, en sanning i
              // stället för en kopierad klass-sträng (F1, Daniels direktiv).
              'vm-install-pill'
            : inline
              ? 'inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-2 font-display text-sm font-semibold text-accent-fg shadow-[var(--vm-shadow-button)] outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_88%,black)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]'
              : 'flex w-full items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left outline-none transition-colors hover:border-accent/60 hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]'
        }
      >
        {install ? (
          <>
            {/* Liten "lägg till"-ikon (pil ner mot bas), dekorativ; texten bär namnet. */}
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
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Installera som app
          </>
        ) : inline ? (
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
        // Den delade <Modal> äger dialog-kontraktet. escapeCapture: guiden kan ligga
        // OVANPÅ onboardingen, så den konsumerar Escape först (stänger bara sig själv).
        // Fokus in till stäng-knappen (closeButtonRef bor i GetStartedDialog).
        <Modal
          name="get-started"
          escapeCapture
          onClose={close}
          labelledById={GET_STARTED_HEADING_ID}
          describedById={GET_STARTED_INTRO_ID}
          initialFocusRef={closeButtonRef}
          overlayClassName="backdrop-blur-sm"
          overlayStyle={{ backgroundColor: 'color-mix(in srgb, var(--color-bg) 70%, transparent)' }}
          panelClassName="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-card border border-border bg-surface shadow-[var(--vm-shadow-raised)] sm:max-h-[88dvh] sm:rounded-card"
        >
          <GetStartedDialog
            onClose={close}
            closeButtonRef={closeButtonRef}
            initialPlatform={initialPlatform}
          />
        </Modal>
      ) : null}
    </>
  );
}
