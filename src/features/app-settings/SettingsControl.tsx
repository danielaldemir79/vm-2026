// Inställnings-ytan (PRESENTATION + a11y, T13; migrerad till delad <Modal> T33): ett
// kugghjul som öppnar en liten dialog med två toggles, haptik och ljud (båda AV som
// standard).
//
// A11y: kugghjulet är en <button> med aria-haspopup/aria-expanded. Dialog-kontraktet
// (role="dialog", aria-modal, aria-labelledby, Escape, fokus in/ut, fokus-fälla, portal
// till body) ägs nu av den delade <Modal>-primitiven (T33/#56). Varje toggle är en
// riktig knapp med role="switch" + aria-checked, så hjälpmedel läser av läget.
//
// PORTAL-skälet (BUGGFIX T32, #54) bor nu i <Modal>: kugghjulet sitter i appens sticky/
// backdrop-blur-header, som blir containing block för position:fixed-barn; portalen till
// document.body lyfter overlayn till rot-stacking-contexten. Primitiven gör det robust
// för ALLA dialoger, inte bara denna.
//
// Tillståndet (haptik/ljud + persistens) ägs av SettingsProvider via useAppSettings;
// denna komponent renderar bara kontrollerna ovanpå det.

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../../components/Modal';
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
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
        <SettingsDialog closeButtonRef={closeButtonRef} onClose={close}>
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

/** Inställnings-dialogen ovanpå <Modal>-primitiven: en tunn komposition (rubrik +
 * stäng-knapp + kom-igång + toggles). Portal/Escape/fokus/fokus-fälla/motion ägs av
 * <Modal>. Fokus flyttas in till stäng-knappen som stabil startpunkt. */
function SettingsDialog({
  closeButtonRef,
  onClose,
  children,
}: {
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const headingId = 'installningar-rubrik';

  return (
    <Modal
      name="settings"
      onClose={onClose}
      labelledById={headingId}
      initialFocusRef={closeButtonRef}
      overlayClassName="backdrop-blur-sm"
      overlayStyle={{ backgroundColor: 'color-mix(in srgb, var(--color-bg) 70%, transparent)' }}
      panelClassName="relative flex w-full max-w-sm flex-col gap-4 rounded-t-card border border-border bg-surface p-6 shadow-[var(--vm-shadow-raised)] sm:rounded-card"
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
          inställnings-dialogen. Öppnar dialogen som förklarar båda vägarna
          (använd direkt i webbläsaren ELLER lägg på hemskärmen) med rätt steg
          för enheten. Ligger överst, det är den vanligaste "hur gör jag?"-frågan
          från en ny vän. */}
      <GetStartedControl variant="settings" />

      <div className="flex flex-col divide-y divide-border">{children}</div>

      <p className="text-xs text-fg-muted">
        Haptik och ljud är avstängda som standard. Slå på det du vill ha.
      </p>
    </Modal>
  );
}
