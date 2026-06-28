// STARTSIDANS SLUTSPELS-PÅMINNELSE (2026-06-28, Daniels önskemål): en tydlig notis på
// Idag som påminner om att tippa slutspelsträdet medan slutspelet är LIVE. "Får ligga
// några dagar" -> den visas genom hela slutspels-fönstret (slutspel-reminder-window.ts)
// och går att STÄNGA (dismiss persisteras), så den aldrig blir tjatig.
//
// GATE: bara i live-läge (rooms.enabled , annars finns ingen tips-funktion att leda
// till), när datan är redo, när slutspels-fönstret är aktivt (datum), och inte
// bortstängd. I fixtures-/lokalt läge renderas inget (App-/daily-testerna opåverkade).
//
// FÄRG-OBEROENDE: ikon (pokal) + rubrik-text + knapp-text bär budskapet; accent-tonen
// förstärker bara. Knappen leder till Tips + slutspels-tipset (onTip, App äger
// navigeringen: byt flik + scrolla till #tips-slutspel).

import { useState } from 'react';
import { useRoomsStore } from '../rooms';
import { useResultsStore } from '../results/results-context';
import { readStoredFlag, writeStoredFlag } from '../../lib/safe-storage';
import { knockoutWindowActive } from './slutspel-reminder-window';

/** localStorage-flagga: användaren har stängt påminnelsen (per enhet). */
const DISMISS_KEY = 'vm-slutspel-reminder-dismissed';

export function SlutspelReminder({ onTip }: { onTip: () => void }) {
  const rooms = useRoomsStore();
  const { status, matches } = useResultsStore();
  // Initieras EN gång ur lagrad flagga (per enhet). Stänger man, persisteras det.
  const [dismissed, setDismissed] = useState(() => readStoredFlag(DISMISS_KEY));

  // Visa bara i live-läge, när datan är redo, i slutspels-fönstret, och inte bortstängd.
  if (!rooms.enabled || status !== 'ready' || dismissed) {
    return null;
  }
  if (!knockoutWindowActive(matches, Date.now())) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    writeStoredFlag(DISMISS_KEY, true);
  };

  return (
    <aside
      data-slutspel-reminder=""
      role="note"
      aria-label="Slutspelet är live"
      className="flex flex-wrap items-center gap-3 rounded-card border px-4 py-3"
      style={{
        // Lugn accent-tint + accent-kant (turneringens energi-färg), troget båda teman.
        // Texten står på den opaka surface-blandade tinten (AA), inte på rå accent.
        backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))',
        borderColor: 'color-mix(in srgb, var(--color-accent) 35%, var(--color-border))',
      }}
    >
      {/* Pokal-glyf i en accent-disc (form-signal, färg-oberoende). */}
      <span
        aria-hidden="true"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-accent) 18%, transparent)',
          color: 'var(--color-accent)',
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      </span>

      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
        <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-accent">
          Slutspelet är live
        </p>
        <p className="text-sm text-fg">
          Glöm inte att tippa era slutspelsresultat , vem går vidare och vem tar bucklan?
        </p>
      </div>

      {/* CTA: leder till Tips + slutspels-tipset. Accent-fylld pill (AA: accent-fg på accent). */}
      <button
        type="button"
        onClick={onTip}
        className="shrink-0 rounded-pill px-4 py-2 text-sm font-semibold transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{
          backgroundColor: 'var(--color-accent)',
          color: 'var(--color-accent-fg)',
        }}
      >
        Tippa slutspelet
      </button>

      {/* Stäng (dismiss): persisteras, så den inte återkommer. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dölj påminnelsen"
        className="shrink-0 rounded-pill p-1.5 text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </aside>
  );
}
