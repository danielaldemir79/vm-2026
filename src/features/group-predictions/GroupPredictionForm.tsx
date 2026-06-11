// Tillgängligt GRUPP-TIPS-formulär för EN grupp (FUNKTIONELLT + a11y-lager, T16, #16).
//
// FOKUS (senior-devs lager): KORREKT, TILLGÄNGLIG inmatning av gruppens 1:a + 2:a
// + fel-vägar + LÅST-läge. Två väljare (gruppvinnare, grupptvåa) bland gruppens 4
// lag. Validering speglar DB-constrainten: 1:an och 2:an måste vara OLIKA lag, och
// båda måste väljas. Efter gruppens första match är formuläret LÅST (server-RLS är
// det riktiga låset; här härleds det bara för visning).
//
// DESIGN-FINISH (design-frontend): strukturen bär STABILA roller + data-attribut
// (data-group-prediction-form, data-group-id, data-group-prediction-locked,
// data-group-prediction-save/saved/error/lock) och semantiska <select>/<label>.
// Premium-finishen (kupong-identitet, guld-dekor) läggs ovanpå av design-frontend,
// precis som T15:s PredictionForm. Inga inbakade statusfärger (T7-pin).

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { GroupTeamOption } from './group-predictable-data';

export interface GroupPredictionFormProps {
  groupId: string;
  /** Gruppens 4 lag (väljarnas alternativ). */
  teams: readonly GroupTeamOption[];
  /** Mitt nuvarande grupp-tips (lag-koder) om jag redan tippat, annars null. */
  current: { winnerCode: string; runnerUpCode: string } | null;
  /** Är gruppen LÅST (första matchen sparkat igång)? Då är väljarna disabled. */
  locked: boolean;
  /**
   * Spara mitt grupp-tips. Kastar vid fel (formuläret visar det inline). Returnerar
   * en Promise så formuläret kan visa "sparar..."/fel-tillstånd.
   */
  onSubmit: (groupId: string, winnerCode: string, runnerUpCode: string) => Promise<void>;
}

const FIELD_BASE =
  'rounded-md border border-border bg-bg text-fg transition-colors duration-150 ' +
  'outline-none focus-visible:border-accent ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const SELECT = `${FIELD_BASE} h-11 w-full px-3 text-sm`;

export function GroupPredictionForm({
  groupId,
  teams,
  current,
  locked,
  onSubmit,
}: GroupPredictionFormProps) {
  // Seeda väljarna från mitt nuvarande tips (redigera = se det jag tippat).
  const [winner, setWinner] = useState<string>(current?.winnerCode ?? '');
  const [runnerUp, setRunnerUp] = useState<string>(current?.runnerUpCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Dirty-medveten synk in av ett externt uppdaterat tips (samma mönster som T15).
  const dirtyRef = useRef(false);
  const seedWinner = current?.winnerCode ?? '';
  const seedRunnerUp = current?.runnerUpCode ?? '';
  useEffect(() => {
    if (dirtyRef.current) {
      return;
    }
    setWinner(seedWinner);
    setRunnerUp(seedRunnerUp);
  }, [seedWinner, seedRunnerUp]);

  const baseId = useId();
  const winnerId = `${baseId}-winner`;
  const runnerUpId = `${baseId}-runnerup`;
  const errorId = `${baseId}-error`;
  const lockId = `${baseId}-lock`;

  function edit(setter: (v: string) => void): (v: string) => void {
    return (v: string) => {
      dirtyRef.current = true;
      setSaved(false);
      setter(v);
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // VALIDERING (fel-väg): båda platser måste väljas...
    if (winner === '' || runnerUp === '') {
      setError('Välj både gruppvinnare (1:a) och grupptvåa (2:a).');
      return;
    }
    // ...och de måste vara OLIKA lag (speglar DB:ns distinct-constraint).
    if (winner === runnerUp) {
      setError('1:an och 2:an måste vara olika lag.');
      return;
    }
    setError(null);
    try {
      await onSubmit(groupId, winner, runnerUp);
      dirtyRef.current = false;
      setSaved(true);
    } catch (err) {
      // Fail loud: ett serverfel (gruppen hann låsas på deadline-sekunden, RLS
      // nekade) visas begripligt, inte en tyst miss.
      setError(err instanceof Error ? err.message : 'Kunde inte spara grupp-tipset.');
    }
  }

  const describedBy =
    [error ? errorId : null, locked ? lockId : null].filter(Boolean).join(' ') || undefined;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-group-prediction-form=""
      data-group-id={groupId}
      data-group-prediction-locked={locked || undefined}
      className="flex flex-col gap-3 rounded-card border border-border p-4"
    >
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0" disabled={locked}>
        <legend className="font-display text-sm font-semibold leading-tight">
          Grupp {groupId}
        </legend>

        {/* LÅST-etikett: visas efter gruppens första match. data-group-prediction-lock
            är haken för design-frontend. aria-describedby kopplar den till väljarna. */}
        {locked ? (
          <p
            id={lockId}
            data-group-prediction-lock=""
            className="m-0 rounded-md border border-border bg-surface px-3 py-2.5 text-[0.8125rem] font-semibold leading-snug text-fg"
          >
            Grupp-tipset är låst, gruppspelet har börjat.{' '}
            <span className="font-medium text-fg-muted">
              Låst vid gruppens första match, så alla tippar blint.
            </span>
          </p>
        ) : null}

        {/* Gruppvinnare (1:a). */}
        <div className="flex flex-col gap-1">
          <label htmlFor={winnerId} className="text-[0.8125rem] font-semibold text-fg">
            Gruppvinnare (1:a)
          </label>
          <select
            id={winnerId}
            name="winner"
            data-group-prediction-winner=""
            value={winner}
            onChange={(e) => edit(setWinner)(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={SELECT}
          >
            <option value="">Välj lag…</option>
            {teams.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Grupptvåa (2:a). */}
        <div className="flex flex-col gap-1">
          <label htmlFor={runnerUpId} className="text-[0.8125rem] font-semibold text-fg">
            Grupptvåa (2:a)
          </label>
          <select
            id={runnerUpId}
            name="runnerUp"
            data-group-prediction-runner-up=""
            value={runnerUp}
            onChange={(e) => edit(setRunnerUp)(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={SELECT}
          >
            <option value="">Välj lag…</option>
            {teams.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Kontroll-spåret: Spara + sparat-kvitto (role=status). */}
        {!locked ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="submit"
              data-group-prediction-save=""
              className="h-11 rounded-pill bg-accent px-6 font-display text-sm font-semibold text-accent-fg shadow-sm transition-[transform,box-shadow,filter] duration-150 outline-none hover:brightness-105 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] active:translate-y-px"
            >
              {current ? 'Ändra grupp-tips' : 'Spara grupp-tips'}
            </button>
            {saved ? (
              <span
                role="status"
                data-group-prediction-saved=""
                className="inline-flex items-center gap-1.5 rounded-pill border border-border px-3 py-1.5 font-display text-[0.8125rem] font-bold leading-none text-fg"
              >
                Sparat
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Fel-listan: role="alert" (fail loud), kopplad till väljarna via aria. */}
        {error ? (
          <p
            id={errorId}
            role="alert"
            data-group-prediction-error=""
            className="m-0 rounded-md border p-3 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
              backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, var(--color-surface))',
              color: 'var(--color-danger)',
            }}
          >
            {error}
          </p>
        ) : null}
      </fieldset>
    </form>
  );
}
