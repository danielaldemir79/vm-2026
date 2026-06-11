// TIPS-AVSLÖJANDE-VYN (FUNKTIONELLT + a11y-lager, T17, #17).
//
// FOKUS (senior-devs lager): visa, FÖRST efter avspark, vad alla rumsmedlemmar
// gissade på varje AVGJORD match, jämte facit + poäng. Sekretessen (andras tips
// dolda före deadline) är redan garanterad server-side (RLS, T15) OCH i den rena
// reveal-gaten (buildMatchReveal kräver låst + avgjort), så den här vyn renderar
// bara det som FÅR visas. Stabil semantik + data-attribut som seam; premium-finish
// (flaggor, kort-känsla) lämnas till design-frontend.
//
// Vyn läser store.reveal (per avgjord+låst match: facit + alla synliga picks +
// poäng) och slår upp lagnamn ur den delade lag-listan (results-storen).

import { useMemo } from 'react';
import { useLeaderboardStore } from './leaderboard-context';
import type { Scoreline } from '../../data/predictions';

/** Formatera en målställning som "2-1". */
function formatScore(score: Scoreline): string {
  return `${score.homeGoals}-${score.awayGoals}`;
}

export function RevealView() {
  const store = useLeaderboardStore();

  // Lagnamn-uppslag (Team.id -> namn) ur lag-listan i storen, för läsbar match-rubrik.
  const teamNameById = useMemo(
    () => new Map(store.teams.map((t) => [t.id, t.name])),
    [store.teams]
  );
  const nameOf = (teamId: string | null): string =>
    teamId === null ? 'Okänt lag' : (teamNameById.get(teamId) ?? teamId);

  const ready = store.enabled && store.status === 'ready';

  // Inget att avslöja än (inga avgjorda+låsta matcher): rendera inget (vyn är tyst
  // tills första matchen avgjorts, ingen tom-rubrik som distraherar).
  if (!ready || store.reveal.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="reveal-heading" data-reveal-view="">
      <header className="flex flex-col gap-2">
        <h2 id="reveal-heading" className="font-display text-xl font-semibold sm:text-2xl">
          Vad alla tippade
        </h2>
        <p className="max-w-2xl text-sm text-fg-muted">
          Efter avspark avslöjas allas tips. Här ser du vad var och en gissade, och hur det gick.
        </p>
      </header>

      <ol data-reveal-list="" className="mt-5 flex list-none flex-col gap-4 p-0">
        {store.reveal.map((match) => (
          <li
            key={match.matchId}
            data-reveal-match=""
            data-match-id={match.matchId}
            className="rounded-card border border-border bg-surface p-4"
          >
            {/* Match-rubrik + facit. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="m-0 font-display text-sm font-semibold">
                {nameOf(match.homeTeamId)} mot {nameOf(match.awayTeamId)}
              </p>
              <p
                data-reveal-actual=""
                className="m-0 font-display text-sm font-semibold tabular-nums text-warning"
              >
                {formatScore(match.actual)}
              </p>
            </div>

            {/* Allas tips + poäng (sorterade på poäng fallande av reveal-modulen). */}
            {match.picks.length > 0 ? (
              <ul data-reveal-picks="" className="mt-3 flex list-none flex-col gap-1.5 p-0">
                {match.picks.map((pick) => (
                  <li
                    key={pick.userId}
                    data-reveal-pick=""
                    data-user-id={pick.userId}
                    data-points={pick.points}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{pick.displayName}</span>
                    <span className="shrink-0 tabular-nums text-fg-muted">
                      {formatScore(pick.predicted)}
                    </span>
                    <span className="w-16 shrink-0 text-right font-medium tabular-nums">
                      {pick.points} {pick.points === 1 ? 'poäng' : 'poäng'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p data-reveal-no-picks="" className="mt-3 text-sm text-fg-muted">
                Ingen i rummet tippade den här matchen.
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
