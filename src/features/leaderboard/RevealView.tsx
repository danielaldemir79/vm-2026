// TIPS-AVSLÖJANDE-VYN (T17, #17). FUNKTIONELLT + a11y-lager (senior-dev) + PREMIUM-
// FINISH (design-frontend), ett lager.
//
// IDENTITET ("FACIT-ÖGONBLICKET"): per avgjord match avslöjas allas tips jämte facit
// + poäng. Designen gör det till ett facit-ögonblick , vem prickade rätt, vem bommade,
// synligt på en blink:
//   - FACIT-TALET (det faktiska resultatet) är hjälten: en solid guld-bricka med mörk
//     ink (samma färg-oberoende solid-bricka-form som medaljerna), "domen är fälld".
//   - VARJE pick får en FÄRG-OBEROENDE utfalls-markör (IKON + FORM, inte bara färg):
//       * EXAKT (3p) = bock i en solid grön medalj.
//       * RÄTT UTFALL (1p) = halv-cirkel-glyf i en solid guld-medalj.
//       * MISS (0p) = kryss i en neutral ring.
//     Formen + ikonen skiljer dem även i gråskala / för en färgblind användare; en
//     dold etikett (sr-only) ger skärmläsaren samma besked i ord.
//
// SEKRETESS: andras tips dolda före deadline är redan garanterat server-side (RLS,
// T15) OCH i den rena reveal-gaten (buildMatchReveal kräver låst + avgjort), så vyn
// renderar bara det som FÅR visas. Vyn LÄSER store.reveal + slår upp lagnamn ur den
// delade lag-listan (results-storen).
//
// UTFALLS-KATEGORI härleds ur pick.points mot den TESTADE poängregeln (PREDICTION_POINTS
// = { exact:3, outcome:1, miss:0 }, score.ts), inte en ny tröskel , en sanning för
// "vad är en exakt träff".

import { useMemo } from 'react';
import { useLeaderboardStore } from './leaderboard-context';
import { PREDICTION_POINTS, type Scoreline } from '../../data/predictions';

/** Formatera en målställning som "2-1". */
function formatScore(score: Scoreline): string {
  return `${score.homeGoals}-${score.awayGoals}`;
}

/** En utfalls-kategori + dess färg-oberoende markör (ikon, form, etikett). */
interface Outcome {
  /** data-outcome-värde (CSS-hak för vänsterkant + markör-variant). */
  key: 'exact' | 'outcome' | 'miss';
  /** Markör-glyf (ikon/form). Skiljer kategorierna även utan färg. */
  glyph: string;
  /** CSS-modifierare för markör-brickan. */
  markClass: string;
  /** Dold etikett för skärmläsare (samma besked i ord). */
  label: string;
}

/**
 * Härled utfalls-kategorin ur poängen ETT tips gav. Speglar poängregeln exakt
 * (PREDICTION_POINTS): 3 = exakt, 1 = rätt utfall, 0 = miss. En okänd poäng (skulle
 * inte hända för match-tips) faller till "miss" (fail-safe, ingen krasch).
 */
function outcomeFor(points: number): Outcome {
  if (points === PREDICTION_POINTS.exact) {
    return {
      key: 'exact',
      glyph: '✓',
      markClass: 'vm-reveal-mark--exact',
      label: 'Exakt rätt',
    };
  }
  if (points === PREDICTION_POINTS.outcome) {
    return {
      key: 'outcome',
      glyph: '◐',
      markClass: 'vm-reveal-mark--outcome',
      label: 'Rätt utfall',
    };
  }
  return {
    key: 'miss',
    glyph: '✗',
    markClass: 'vm-reveal-mark--miss',
    label: 'Bom',
  };
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
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
          Facit
        </p>
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
            className="vm-reveal-card rounded-card p-4"
          >
            {/* Match-rubrik + FACIT-talet (det faktiska resultatet, hjälten). */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="m-0 font-display text-sm font-semibold">
                {nameOf(match.homeTeamId)} mot {nameOf(match.awayTeamId)}
              </p>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-fg-muted">
                  Facit
                </span>
                <span
                  data-reveal-actual=""
                  className="vm-reveal-actual inline-flex items-center rounded-pill px-2.5 py-0.5 text-sm tabular-nums"
                >
                  {formatScore(match.actual)}
                </span>
              </span>
            </div>

            {/* Allas tips + poäng (sorterade på poäng fallande av reveal-modulen). Varje
                rad bär en FÄRG-OBEROENDE utfalls-markör + en grön/guld vänsterkant. */}
            {match.picks.length > 0 ? (
              <ul data-reveal-picks="" className="mt-3 flex list-none flex-col gap-1.5 p-0">
                {match.picks.map((pick) => {
                  const outcome = outcomeFor(pick.points);
                  return (
                    <li
                      key={pick.userId}
                      data-reveal-pick=""
                      data-user-id={pick.userId}
                      data-points={pick.points}
                      data-outcome={outcome.key}
                      className="vm-reveal-pick flex items-center gap-3 py-1 pl-2 text-sm"
                    >
                      {/* FÄRG-OBEROENDE utfalls-markör: ikon + form + dold ord-etikett. */}
                      <span
                        className={`vm-reveal-mark ${outcome.markClass} h-6 w-6 text-xs`}
                        aria-hidden="true"
                      >
                        {outcome.glyph}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {pick.displayName}
                        {/* sr-only-mening: kommatecknet sitter ihop med namnet (ingen
                            ledande blanksteg), annars läser skärmläsaren "Anna kommatecken".
                            Detta är interpunktion i en uppläst mening, inte husstilens
                            " , "-titel-separator. */}
                        <span className="sr-only">, {outcome.label}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-fg-muted">
                        {formatScore(pick.predicted)}
                      </span>
                      <span
                        className={`w-16 shrink-0 text-right font-medium tabular-nums ${
                          outcome.key === 'exact'
                            ? 'text-warning'
                            : outcome.key === 'miss'
                              ? 'text-fg-muted'
                              : ''
                        }`}
                      >
                        {pick.points} poäng
                      </span>
                    </li>
                  );
                })}
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
