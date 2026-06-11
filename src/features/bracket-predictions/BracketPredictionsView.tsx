// BRACKET-/SLUTSPELS-TIPS-VYN (FUNKTIONELLT + a11y-lager, T16b, #59). Systerfil till
// GroupPredictionsView.tsx (T16).
//
// FOKUS (senior-devs lager): rätt slots, rätt lägen, tillgänglig struktur. Visar
// CHAMPION-väljaren (VM-vinnaren) överst + ett bracket-tips-formulär per slutspels-
// slot (M73..M104), rund-grupperat (sextondel -> final, T9:s ordning), i RUM-läge.
// Per slot ett tydligt LÅST-läge efter slottens avspark, ett OKÄNDA-LAG-läge tills
// tidigare resultat avgjort lagen, och mitt tips synligt. UTAN ett aktivt rum visas
// "gå med i ett rum för att tippa" (bracket-tips är per rum).
//
// DEADLINE: per slot (slottens egen avspark M73..M104) + champion (turneringsstart,
// g-A-1), inte ett globalt lås, så M104 kan tippas efter att M73 spelats. Härlett för
// VISNING; servern (RLS) är det riktiga låset. Minut-tick (useDeadlineTick) så ett
// lås flippar utan omladdning (en match startar mitt på dagen, T15 C1-lärdomen).
//
// LAG-IDENTITET: formulärets value är lagets CODE (TeamCode), brandas vid UI-gränsen
// (teamCode()) innan store.saveBracketPrediction, så API:t garanterat får en code.
//
// VISUELL premium-finish (kupong-formspråk, flaggor, träd-känsla) lämnas till design-
// frontend ovanpå; här bevaras stabila roller + data-attribut som seam.

import { useMemo } from 'react';
import { useBracketPredictionsStore } from './bracket-predictions-context';
import { useBracketPredictableData } from './use-bracket-predictable-data';
import { selectPredictableBracket } from './bracket-predictable-slots';
import { BracketPredictionForm } from './BracketPredictionForm';
import { useDeadlineTick } from '../predictions/use-deadline-tick';
import { teamCode } from '../../domain/team-code';

export interface BracketPredictionsViewProps {
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbart "nu" (testbarhet) för låst-härledningen, default = nuet. */
  now?: Date;
}

/** Människo-läsbar etikett för en slutspels-slot (rund-namn + matchnummer). */
function slotLabel(roundLabel: string, slotId: string): string {
  return `${roundLabel} ${slotId}`;
}

export function BracketPredictionsView({
  env = import.meta.env,
  now = new Date(),
}: BracketPredictionsViewProps) {
  const store = useBracketPredictionsStore();
  const { status, bracket, teams, matches, error } = useBracketPredictableData(env);

  // Deadline-medveten re-render (samma minut-tick som T15/T16): låst-statusen
  // (now >= slottens/championens avspark) räknas om utan manuell omladdning.
  const evalNow = useDeadlineTick(now);

  // evalNow ingår i deps (det är poängen): räkna om när tiden passerar en avspark.
  const predictable = useMemo(
    () => selectPredictableBracket(bracket, teams, matches, evalNow),
    [bracket, teams, matches, evalNow]
  );

  // Hur många slots är ÄNNU öppna att tippa (kända lag + ej låsta), champion inräknad?
  // Motiverande räknare (samma anda som T15/T16).
  const openCount = useMemo(() => {
    const openSlots = predictable.rounds
      .flatMap((r) => r.slots)
      .filter((s) => s.teamsKnown && !s.locked).length;
    const championOpen = predictable.champion.locked ? 0 : 1;
    return openSlots + championOpen;
  }, [predictable]);

  const ready = store.enabled && status === 'ready' && store.status === 'ready';

  // Spara-handlern (delad av champion + match-slots): brandar value -> TeamCode vid
  // UI-gränsen (F1-fällan), så API:t garanterat får en versal code.
  const handleSave = async (slotId: string, advancingCode: string) => {
    await store.saveBracketPrediction({
      slotId,
      advancingTeamId: teamCode(advancingCode),
    });
  };

  const champion = predictable.champion;
  const myChampion = store.myBracketPredictions.get(champion.slotId) ?? null;

  return (
    <section aria-labelledby="bracket-predictions-heading" data-bracket-predictions-view="">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
          VM-poolen
        </p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2
            id="bracket-predictions-heading"
            className="font-display text-xl font-semibold sm:text-2xl"
          >
            Tippa slutspelet
          </h2>
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
              {openCount} {openCount === 1 ? 'slot öppen' : 'slots öppna'} att tippa
            </span>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Tippa vem som vinner hela VM och vilket lag som går vidare ur varje slutspelsmatch. Du
          tippar en slot så snart dess två lag är kända, men före matchen, så alla gissar blint.
        </p>
      </header>

      {/* UTAN aktivt rum (taskens punkt 3): bracket-tips är per rum. Samma inbjudande
          formspråk som grupp-tips-vyn (T16). */}
      {!store.enabled ? (
        <div
          data-bracket-predictions-no-room=""
          className="mt-4 rounded-card border border-[color-mix(in_srgb,var(--vm-gold)_22%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_6%,var(--color-surface))] p-4 sm:p-5"
        >
          <p className="m-0 font-display text-sm font-semibold text-fg">
            Gå med i ett rum för att tippa slutspelet
          </p>
          <p className="m-0 mt-1 text-sm text-fg-muted">
            Bracket-tipsen är per rum, du och kompisarna gissar VM-vinnaren och vem som går vidare,
            och jämför sen. Skapa eller gå med i ett rum ovanför, så öppnar slottarna här.
          </p>
        </div>
      ) : null}

      {/* Fel-väg (fail loud). */}
      {store.enabled && (status === 'error' || store.status === 'error') ? (
        <p
          role="alert"
          data-bracket-predictions-error=""
          className="mt-4 rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          {error ?? store.error ?? 'Något gick fel när slutspelet skulle laddas.'}
        </p>
      ) : null}

      {/* Laddning. */}
      {store.enabled && (status === 'loading' || store.status === 'loading') ? (
        <p role="status" data-bracket-predictions-loading="" className="mt-4 text-sm text-fg-muted">
          Laddar slutspelet att tippa…
        </p>
      ) : null}

      {ready ? (
        <div className="mt-5 flex flex-col gap-6">
          {/* CHAMPION-VÄLJAREN (VM-vinnaren): överst, det största enskilda tipset.
              Alla 48 lag (KISS), låst vid turneringsstart. */}
          <div data-bracket-predictions-champion="">
            <BracketPredictionForm
              slotId={champion.slotId}
              label="VM-vinnare"
              teams={champion.teams}
              teamsKnown
              current={myChampion ? myChampion.advancingTeamId : null}
              locked={champion.locked}
              onSubmit={handleSave}
            />
          </div>

          {/* SLUTSPELS-SLOTSEN, rund-grupperade (sextondel -> final). Varje runda en
              rubrik + en responsiv grid av slot-formulär. Öppna, låsta och okända-lag-
              slots alla synliga (med sina respektive lägen), så trädet känns helt. */}
          {predictable.rounds.map((round) => (
            <section
              key={round.stage}
              data-bracket-predictions-round={round.stage}
              aria-label={round.label}
              className="flex flex-col gap-3"
            >
              <h3 className="font-display text-sm font-bold uppercase tracking-wide text-fg-muted">
                {round.label}
              </h3>
              <ol className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
                {round.slots.map((slot) => {
                  const mine = store.myBracketPredictions.get(slot.slotId) ?? null;
                  return (
                    <li key={slot.slotId}>
                      <BracketPredictionForm
                        slotId={slot.slotId}
                        label={slotLabel(round.label, slot.slotId)}
                        teams={slot.teams}
                        teamsKnown={slot.teamsKnown}
                        current={mine ? mine.advancingTeamId : null}
                        locked={slot.locked}
                        onSubmit={handleSave}
                      />
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}
