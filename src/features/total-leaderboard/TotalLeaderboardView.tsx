// Den TOTALA (cross-rum) topplistans vy (T82 del 3, #173). Orkestrerar de tre delarna
// enligt den spikade UX:en:
//   1. "DIN PLACERING"-HJÄLTEN överst (TotalSelfHero), framträdande , den inloggade
//      spelarens egen position ska aldrig vara svår att hitta (ägarens krav).
//   2. KOMPRIMERAT LÄGE (default): pallen / topp-5 alltid synlig. Egen rad markerad.
//      "Visa alla N"-knapp för att fälla ut.
//   3. UTFÄLLT LÄGE: hela listan som EN virtualiserad scroll + sök + "hoppa till mig"
//      (TotalLeaderboardList). Egen rad fortsatt markerad.
//
// Anmäler sig till sektions-navet (useRegisterSection) så chip:et "Global" bara finns när
// vyn FAKTISKT renderar (självregistrering, lessons "inga döda gränssnitts-val").

import { useState } from 'react';
import { useTotalLeaderboardStore } from './total-leaderboard-context';
import { TotalSelfHero } from './TotalSelfHero';
import { TotalLeaderboardRow } from './TotalLeaderboardRow';
import { TotalLeaderboardList } from './TotalLeaderboardList';
import { useRegisterSection, SECTIONS } from '../section-nav';

/** Hur många toppdeltagare som visas i det KOMPRIMERADE läget (pallen + lite till). */
const PODIUM_COUNT = 5;

export function TotalLeaderboardView() {
  const store = useTotalLeaderboardStore();
  useRegisterSection(SECTIONS.totalLeaderboard);
  const [expanded, setExpanded] = useState(false);

  const ready = store.enabled && store.status === 'ready';

  return (
    <section aria-labelledby="total-leaderboard-heading" data-total-leaderboard-view="">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Hela poolen
        </p>
        <h2
          id="total-leaderboard-heading"
          className="font-display text-xl font-semibold sm:text-2xl"
        >
          Global topplista
        </h2>
        <p className="max-w-2xl text-sm text-fg-muted">
          Alla deltagare i alla rum, rangordnade på sin totala poäng. Din egen placering visas
          överst, så du alltid ser var du står mot alla andra.
        </p>
      </header>

      {/* Fel-väg (fail loud). */}
      {store.status === 'error' ? (
        <p
          role="alert"
          data-total-error=""
          className="mt-4 rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          {store.error ?? 'Något gick fel när den totala topplistan skulle laddas.'}
        </p>
      ) : null}

      {/* Laddning. */}
      {store.status === 'loading' || store.status === 'idle' ? (
        <p role="status" data-total-loading="" className="mt-4 text-sm text-fg-muted">
          Laddar den totala topplistan…
        </p>
      ) : null}

      {/* Tom (inga deltagare än, ovanligt , t.ex. inga rum i live-läge). */}
      {ready && store.total.length === 0 ? (
        <p data-total-empty="" className="mt-4 text-sm text-fg-muted">
          Inga deltagare att rangordna än. Gå med i ett rum och börja tippa.
        </p>
      ) : null}

      {ready && store.total.length > 0 ? (
        <div className="mt-5 flex flex-col gap-5">
          {/* 1) HJÄLTEN: din placering (om vi kan peka ut en egen rad). */}
          {store.selfSummary !== null ? <TotalSelfHero summary={store.selfSummary} /> : null}

          {/* 2) KOMPRIMERAT: pallen / topp-5. Egen rad markerad. */}
          {!expanded ? (
            <div data-total-podium="" className="flex flex-col gap-2">
              {store.total.slice(0, PODIUM_COUNT).map((entry) => (
                <TotalLeaderboardRow
                  key={entry.userId}
                  entry={entry}
                  isSelf={store.currentUserId !== null && entry.userId === store.currentUserId}
                />
              ))}
            </div>
          ) : null}

          {/* "Visa alla N" / "Visa färre"-knapp. */}
          {store.total.length > PODIUM_COUNT ? (
            <button
              type="button"
              data-total-expand-toggle=""
              aria-expanded={expanded}
              aria-controls="total-leaderboard-full"
              onClick={() => setExpanded((v) => !v)}
              className="vm-total-control self-start rounded-pill px-5 py-2.5 text-sm font-semibold"
            >
              {expanded ? 'Visa färre' : `Visa alla ${store.total.length}`}
            </button>
          ) : null}

          {/* 3) UTFÄLLT: hela listan, virtualiserad + sök + hoppa till mig. */}
          {expanded ? (
            <div id="total-leaderboard-full" data-total-full="">
              <TotalLeaderboardList entries={store.total} currentUserId={store.currentUserId} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
