// Tips-INMATNINGSVYN (FUNKTIONELLT + a11y-lager, T15, #15).
//
// FOKUS (senior-devs lager): rätt matcher, rätt lägen, tillgänglig struktur. Visar
// tips-formulär per KOMMANDE match (båda lag kända) i RUM-läge, ett tydligt LÅST-
// läge efter avspark, och mitt tips synligt. UTAN ett aktivt rum visas "gå med i
// ett rum för att tippa" (tips är per rum).
//
// VISUELL DESIGN (design-frontend, T15): tips-ligan är det SOCIALA hjärtat, det ska
// kännas KUL att tippa. Vyn får en guld-tonad eyebrow + rubrik (kupong-identiteten),
// en inbjudande "gå med i ett rum"-ruta som pekar mot rum-sektionen, och korten
// (PredictionForm) bär kupong-finishen. Stabil semantik + data-attribut bevaras,
// inga inbakade statusfärger (T7-pin).
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

  // Hur många KOMMANDE (icke-låsta) matcher finns att tippa? Driver en liten,
  // motiverande räknare i rubriken ("3 matcher öppna att tippa"), så det känns
  // levande och kul. Låsta matcher räknas inte (de går inte att tippa längre).
  const openCount = useMemo(() => predictable.filter((p) => !p.locked).length, [predictable]);

  const ready = store.enabled && status === 'ready' && store.status === 'ready';

  return (
    <section aria-labelledby="predictions-heading" data-predictions-view="">
      <header className="flex flex-col gap-2">
        {/* Guld eyebrow (kupong-identiteten): tips-ligan signaleras varmt redan i
            rubriken. accent-grön vore resultat-tonen, guld är tips-tonen. FÄRG:
            --color-warning (den AA-säkra guld-TEXT-tonen per tema), inte rå --vm-gold
            (faller under AA som text på ljus yta, lessons guld-på-ljus). */}
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
          Tips-ligan
        </p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="predictions-heading" className="font-display text-xl font-semibold sm:text-2xl">
            Tippa matcherna
          </h2>
          {/* Motiverande räknare: bara när det FINNS öppna matcher att tippa, så den
              aldrig säger "0 öppna" (det vore nedslående, inte kul). role=status så
              den annonseras artigt när den dyker upp. */}
          {ready && openCount > 0 ? (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-pill border border-[color-mix(in_srgb,var(--vm-gold)_30%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_8%,transparent)] px-2.5 py-0.5 font-display text-xs font-semibold text-fg-muted"
            >
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-pill"
                style={{ backgroundColor: 'var(--vm-gold)' }}
              />
              {openCount} {openCount === 1 ? 'match' : 'matcher'} öppna att tippa
            </span>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Gissa resultaten före avspark. Exakt resultat ger mest, rätt vinnare ger en poäng. Du och
          kompisarna tippar blint, sen jämför ni.
        </p>
      </header>

      {/* UTAN aktivt rum: tips är per rum, så peka INBJUDANDE mot rums-flödet. En
          egen guld-tonad ruta med en kupong-ikon, inte bara en grå rad, så porten
          till tips känns som en inbjudan att gå med, inte ett felmeddelande. */}
      {!store.enabled ? (
        <div
          data-predictions-no-room=""
          className="mt-4 flex items-start gap-3 rounded-card border border-[color-mix(in_srgb,var(--vm-gold)_22%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_6%,var(--color-surface))] p-4 sm:p-5"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 rounded-md border border-[color-mix(in_srgb,var(--vm-gold)_30%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_12%,transparent)] p-2 text-warning"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 5.5A1 1 0 0 1 3 4.5h10a1 1 0 0 1 1 1v1a1.5 1.5 0 0 0 0 3v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1a1.5 1.5 0 0 0 0-3z" />
              <path d="M10 4.75v6.5" strokeDasharray="1.4 1.4" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="m-0 font-display text-sm font-semibold text-fg">
              Gå med i ett rum för att tippa
            </p>
            <p className="m-0 mt-1 text-sm text-fg-muted">
              Tipsen är per rum, du och kompisarna gissar resultaten före avspark och jämför sen.
              Skapa eller gå med i ett rum ovanför, så öppnar tips-kupongerna här.
            </p>
          </div>
        </div>
      ) : null}

      {/* Fel-väg (fail loud): datakällan eller tips-laddningen brast. */}
      {store.enabled && (status === 'error' || store.status === 'error') ? (
        <p
          role="alert"
          data-predictions-error=""
          className="mt-4 rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          {error ?? store.error ?? 'Något gick fel när tipsen skulle laddas.'}
        </p>
      ) : null}

      {/* Laddning: enkel status (annonseras artigt). */}
      {store.enabled && (status === 'loading' || store.status === 'loading') ? (
        <p role="status" data-predictions-loading="" className="mt-4 text-sm text-fg-muted">
          Laddar matcher att tippa…
        </p>
      ) : null}

      {/* Tips-listan: en kupong per tippbar match, kommande överst, låsta nedtill. */}
      {ready ? (
        predictable.length > 0 ? (
          <ol data-predictions-list="" className="mt-5 flex list-none flex-col gap-3 p-0">
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
        ) : (
          // Aktivt rum men inga tippbara matcher (t.ex. alla framtida matcher saknar
          // ännu kända lag): en lugn, vänlig tom-ruta i stället för en tom sektion.
          <p className="mt-5 rounded-card border border-border bg-surface px-4 py-8 text-center text-sm text-fg-muted">
            Inga matcher att tippa just nu. Så snart nästa match har båda lag klara dyker kupongen
            upp här.
          </p>
        )
      ) : null}
    </section>
  );
}
