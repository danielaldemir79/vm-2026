// STARTSIDANS SLUTSPELS-PÅMINNELSE (2026-06-28, Daniels önskemål): en tydlig notis på
// Idag som påminner om att tippa slutspelet , och som BYTER innehåll OCH färg per runda
// (sextondel -> åttondel -> kvart -> semi -> final), så ögat reagerar på att något
// ändrats vid varje ny runda. Metall-stege mot finalen: brons kvart, silver semi, guld
// final; egna toner (turkos/blå) för rundorna innan (per-runda-färgen bor i
// slutspel-reminder.css via data-round).
//
// ALLTID SYNLIG under slutspelet (Daniels krav): den gatas bara på live-läge + att vi är
// i slutspels-fönstret + att det finns en kommande runda att påminna om , ingen
// permanent dismiss (innehålls-/färg-bytet per runda håller den levande, inte tjatig).
// I fixtures-/lokalt läge renderas inget (App-/daily-testerna opåverkade).
//
// FÄRG-OBEROENDE: pokal-ikon + runda-bricka (namn) + mening + knapp-text bär budskapet;
// per-runda-tonen förstärker bara. Knappen leder till Tips + slutspels-tipset (onTip, App
// äger navigeringen: byt flik + scrolla till #tips-slutspel) och behåller appens accent
// (konsekvent, AA-säker affordans) , runda-färgen ligger i ramen, inte i knappen.

import { useRoomsStore } from '../rooms';
import { useResultsStore } from '../results/results-context';
import { knockoutWindowActive } from './slutspel-reminder-window';
import { currentKnockoutRound, ROUND_REMINDER } from './slutspel-reminder-round';
import './slutspel-reminder.css';

export function SlutspelReminder({ onTip }: { onTip: () => void }) {
  const rooms = useRoomsStore();
  const { status, matches } = useResultsStore();
  const now = Date.now();

  // Visa bara i live-läge, när datan är redo, i slutspels-fönstret, och när det finns en
  // kommande runda att påminna om (currentKnockoutRound null = inga slutspelsmatcher kvar).
  if (!rooms.enabled || status !== 'ready') {
    return null;
  }
  if (!knockoutWindowActive(matches, now)) {
    return null;
  }
  const round = currentKnockoutRound(matches, now);
  if (round === null) {
    return null;
  }
  const info = ROUND_REMINDER[round];

  return (
    <aside
      // key=runda: vid runda-byte remountas notisen, så "pop"-animationen (CSS) spelar om
      // och ögat fångar att den uppdaterats.
      key={round}
      data-slutspel-reminder=""
      data-round={round}
      role="note"
      aria-label={`Slutspelet: ${info.name}, påminnelse om att tippa`}
      className="vm-slutspel-reminder flex flex-wrap items-center gap-3 rounded-card border px-4 py-3"
    >
      {/* Pokal-glyf i en per-runda-färgad disc (form + färg-signal). */}
      <span
        aria-hidden="true"
        className="vm-slutspel-reminder-disc inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill"
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

      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
        {/* Runda-brickan: byter namn OCH färg per runda (data-round -> CSS). */}
        <span className="vm-slutspel-reminder-badge w-fit rounded-pill border px-2 py-0.5 font-display text-[0.625rem] font-bold uppercase tracking-[0.18em] text-fg">
          {info.name}
        </span>
        <p className="text-sm text-fg">{info.line}</p>
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
        {info.cta}
      </button>
    </aside>
  );
}
