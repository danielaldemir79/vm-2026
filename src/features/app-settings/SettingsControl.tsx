// Inställnings-ytan (PRESENTATION + a11y, T13): ett kugghjul som öppnar en liten
// dialog med två toggles, haptik och ljud (båda AV som standard).
//
// A11y: kugghjulet är en <button> med aria-haspopup/aria-expanded. Dialogen följer
// samma modal-kontrakt som onboarding/lag-profil (role="dialog", aria-modal,
// aria-labelledby, Escape stänger, fokus in/ut, fokus-fälla). Varje toggle är en
// riktig knapp med role="switch" + aria-checked, så hjälpmedel läser av läget.
//
// Tillståndet (haptik/ljud + persistens) ägs av SettingsProvider via useAppSettings;
// denna komponent renderar bara kontrollerna ovanpå det.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { springs, transitions } from '../../motion';
import { useAppSettings } from './settings-context';
import { GetStartedControl } from './GetStartedControl';

/** Kugghjuls-ikon (dekorativ, aria-hidden, etiketten bär betydelsen). */
function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** En toggle-rad: etikett + förklaring + en role="switch"-knapp. */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
  dataAttr,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  dataAttr: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-sm font-semibold text-fg">{label}</span>
        <span className="text-xs text-fg-muted">{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-settings-toggle={dataAttr}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border p-0.5 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        style={{
          backgroundColor: checked
            ? 'var(--color-accent)'
            : 'color-mix(in srgb, var(--color-fg) 12%, var(--color-surface))',
          borderColor: checked
            ? 'color-mix(in srgb, var(--color-accent) 70%, transparent)'
            : 'var(--color-border)',
        }}
      >
        {/* Glidande knopp. Transformen är ren dekoration; reduced-motion nollar
            transition globalt (index.css), så läget syns korrekt ändå. */}
        <span
          aria-hidden="true"
          data-on={checked}
          className="h-5 w-5 rounded-full bg-[var(--color-surface)] shadow-md transition-transform duration-200 data-[on=true]:translate-x-5"
        />
      </button>
    </div>
  );
}

export function SettingsControl() {
  const { haptics, sound, setHaptics, setSound } = useAppSettings();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const motionEnabled = useReducedMotion() === false;

  const close = useCallback(() => setOpen(false), []);

  // Escape stänger. Lyssnaren bara när öppen.
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

  // Fokus in vid öppning, tillbaka till kugghjulet vid stängning. Vi FÅNGAR
  // trigger-elementet i en lokal variabel vid öppningen och använder den i
  // cleanup (i stället för triggerRef.current direkt), så vi alltid återlämnar
  // fokus till det kugghjul som öppnade dialogen, även om ref:en hunnit ändras.
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

  // Fokus-fälla (samma hjälpare som de andra modalerna).
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
        aria-label="Inställningar"
        title="Inställningar"
        data-settings-open=""
        className="inline-flex h-10 w-10 items-center justify-center rounded-pill border border-border bg-surface-raised text-fg-muted shadow-sm outline-none transition-colors duration-200 hover:border-accent/60 hover:text-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
      >
        <GearIcon />
      </button>

      {open ? (
        <SettingsDialog
          dialogRef={dialogRef}
          closeButtonRef={closeButtonRef}
          onClose={close}
          onDialogKeyDown={onDialogKeyDown}
          motionEnabled={motionEnabled}
        >
          <ToggleRow
            label="Haptik"
            description="Kort vibration när ett resultat sparas (mobil)."
            checked={haptics}
            onChange={setHaptics}
            dataAttr="haptics"
          />
          <ToggleRow
            label="Ljud"
            description="Diskret ljud när ett resultat sparas."
            checked={sound}
            onChange={setSound}
            dataAttr="sound"
          />
        </SettingsDialog>
      ) : null}
    </>
  );
}

/** Själva dialog-skalet (overlay + modal-panel). Hålls intern, en sak.
 *
 * PORTAL till document.body (BUGGFIX T32, #54): kugghjulet bor i appens <header>,
 * som är `sticky z-10 backdrop-blur-md`. BÅDE sticky+z-index OCH backdrop-filter
 * gör headern till en STACKING CONTEXT och dessutom till CONTAINING BLOCK för
 * position:fixed-barn (CSS-spec: en ancestor med transform/filter/backdrop-filter
 * blir den fixerade descendantens containing block, inte viewporten). Renderas
 * overlayn inline i headern blir den därför (a) inklämd i headerns 64px-box i
 * stället för att täcka skärmen, och (b) instängd i headerns z-10-lager, så `z-50`
 * inte kan nå över <main>. Resultatet: panelen hamnar bakom/utanför sidan (Daniels
 * fynd). Genom att portalera overlayn till document.body (som saknar transform/
 * filter/stacking-context, verifierat live) hamnar den i ROT-stacking-contexten
 * där `fixed inset-0 z-50` löses mot viewporten och ligger överst, oberoende av
 * VAR triggern råkar sitta. TeamProfilePanel/OnboardingDialog "fungerar" bara för
 * att de råkar renderas utanför en sådan ancestor; portalen gör det robust här.
 *
 * SSR-not: createPortal kräver document; appen är klient-renderad (Vite SPA, ingen
 * SSR), så document finns alltid när detta körs (dialogen renderas dessutom bara
 * efter ett klick, dvs i webbläsaren). */
function SettingsDialog({
  dialogRef,
  closeButtonRef,
  onClose,
  onDialogKeyDown,
  motionEnabled,
  children,
}: {
  dialogRef: React.RefObject<HTMLDivElement | null>;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onDialogKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  motionEnabled: boolean;
  children: ReactNode;
}) {
  const headingId = 'installningar-rubrik';
  const panelInitial = motionEnabled ? { opacity: 0, y: 24, scale: 0.98 } : { opacity: 0 };
  const panelAnimate = motionEnabled ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1 };

  return createPortal(
    <motion.div
      data-settings-overlay=""
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
        data-settings-dialog=""
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
        initial={panelInitial}
        animate={panelAnimate}
        transition={motionEnabled ? springs.gentle : transitions.quick}
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-t-card border border-border bg-surface p-6 shadow-[var(--vm-shadow-raised)] sm:rounded-card"
      >
        <header className="flex items-center justify-between gap-3 pr-1">
          <h2 id={headingId} className="font-display text-xl font-bold">
            Inställningar
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Stäng inställningar"
            data-settings-close=""
            className="inline-flex h-8 w-8 items-center justify-center rounded-pill border border-border bg-surface text-fg-muted outline-none transition-colors hover:bg-surface-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ×
            </span>
          </button>
        </header>

        {/* "Kom igång"-ytan (T54/#93): alltid nåbar EFTER onboardingen, här i
            inställnings-portalen. Öppnar dialogen som förklarar båda vägarna
            (använd direkt i webbläsaren ELLER lägg på hemskärmen) med rätt steg
            för enheten. Ligger överst, det är den vanligaste "hur gör jag?"-frågan
            från en ny vän. */}
        <GetStartedControl variant="settings" />

        <div className="flex flex-col divide-y divide-border">{children}</div>

        <p className="text-xs text-fg-muted">
          Haptik och ljud är avstängda som standard. Slå på det du vill ha.
        </p>
      </motion.div>
    </motion.div>,
    document.body
  );
}
