// Tips-INMATNINGSVYN (FUNKTIONELLT + a11y-lager, T15, #15).
//
// FOKUS (senior-devs lager): rätt matcher, rätt lägen, tillgänglig struktur. Visar
// tips-formulär per KOMMANDE match (båda lag kända) i RUM-läge, ett tydligt LÅST-
// läge efter avspark, och mitt tips synligt. UTAN ett aktivt rum visas "gå med i
// ett rum för att tippa" (tips är per rum). Premium-finish lämnas till design-frontend
// (stabil semantik + data-attribut, inga inbakade statusfärger, T7-pin).
//
// SÄKERHET: deadline-låset + sekretessen upprätthålls SERVER-SIDE (RLS). Vyn visar
// bara läget; ett save som nekas (matchen hann låsas) blir ett fail-loud-fel i formuläret.

import { useMemo } from 'react';
import { usePredictionsStore } from './predictions-context';
import { usePredictableData } from './use-predictable-matches';
import { selectPredictableMatches } from './predictable-matches';
import { PredictionForm } from './PredictionForm';
import { useTodayKey } from '../daily';

export interface PredictionsViewProps {
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbart "nu" (testbarhet) för låst-härledningen, default = nuet. */
  now?: Date;
}

export function PredictionsView({ env, now }: PredictionsViewProps) {
  const store = usePredictionsStore();
  const { status, matches, teams, error } = usePredictableData(env);

  // Dagsbyte-medveten re-render (samma hook som dagliga vyn): låst-statusen
  // räknas om vid dagsbyte/återaktiverad flik så en match som passerat avspark
  // syns som låst utan att användaren manuellt laddar om. Server-RLS är ändå låset.
  useTodayKey();
  const evalNow = now ?? new Date();

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const predictable = useMemo(
    () => selectPredictableMatches(matches, evalNow),
    // evalNow ingår inte i deps: en ny Date() per render skulle loopa. useTodayKey
    // triggar re-render vid dagsbyte, vilket räcker för låst-visningen (servern är låset).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches]
  );

  return (
    <section aria-labelledby="predictions-heading" data-predictions-view="">
      <h2 id="predictions-heading" className="font-display text-xl font-semibold sm:text-2xl">
        Tippa matcherna
      </h2>

      {/* UTAN aktivt rum: tips är per rum, så peka mot rums-flödet. */}
      {!store.enabled ? (
        <p data-predictions-no-room="" className="mt-3 text-sm text-fg-muted">
          Gå med i ett rum för att tippa. Tipsen är per rum, du och kompisarna gissar resultaten
          före avspark och jämför sen.
        </p>
      ) : null}

      {/* Fel-väg (fail loud): datakällan eller tips-laddningen brast. */}
      {store.enabled && (status === 'error' || store.status === 'error') ? (
        <p role="alert" data-predictions-error="" className="mt-3 text-sm">
          {error ?? store.error ?? 'Något gick fel när tipsen skulle laddas.'}
        </p>
      ) : null}

      {/* Laddning: enkel status (annonseras artigt). */}
      {store.enabled && (status === 'loading' || store.status === 'loading') ? (
        <p role="status" data-predictions-loading="" className="mt-3 text-sm text-fg-muted">
          Laddar matcher att tippa…
        </p>
      ) : null}

      {/* Tips-listan: en form per tippbar match, kommande överst, låsta nedtill. */}
      {store.enabled && status === 'ready' && store.status === 'ready' ? (
        <ol data-predictions-list="" className="mt-4 flex list-none flex-col gap-3 p-0">
          {predictable.map(({ match, locked }) => {
            const mine = store.myPredictions.get(match.id) ?? null;
            return (
              <li key={match.id}>
                <PredictionForm
                  match={match}
                  teamsById={teamsById}
                  current={mine ? { homeGoals: mine.homeGoals, awayGoals: mine.awayGoals } : null}
                  locked={locked}
                  onSubmit={async (matchId, homeGoals, awayGoals) => {
                    await store.savePrediction({ matchId, homeGoals, awayGoals });
                  }}
                />
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
