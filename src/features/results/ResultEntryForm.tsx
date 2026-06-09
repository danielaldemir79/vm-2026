// Tillgängligt inmatnings-FORMULÄR för EN match (FUNKTIONELLT + a11y-lager, T6).
//
// FOKUS (senior-devs lager): KORREKT, TILLGÄNGLIG inmatning + fel-vägar. Riktiga
// <label> kopplade till varje fält, en <fieldset>/<legend> som namnger matchen,
// fel kopplade till sina fält via aria-describedby + aria-invalid, och hela
// formuläret tangentbordsstyrt (native input + submit). Validering körs vid
// submit och felen visas i en role="alert"-lista (fail loud, men användarvänligt).
//
// VISUELL DESIGN (design-frontend-agentens lager, ovanpå): premium-styling av
// fält/knappar + målfirande-animationen (kroken useGoalCelebration ger seamen).
// Strukturen är gjord lätt att styla: stabila roller + data-attribut, inga
// inbakade statusfärger (T7-pin: accent === success i ljust tema).
//
// VARFÖR ett eget formulär per match (inte ett globalt): varje match är en egen
// liten enhet med eget tillstånd (mål + status + fel). En per-match-form håller
// fält-id:n unika (a11y) och låter en inmatning vara optimistisk och isolerad.

import { useId, useMemo, useState, type FormEvent } from 'react';
import type { Match, MatchStatus, Team } from '../../domain/types';
import type { ResultEntry, ResultValidationError } from './validate-result';

/** De status användaren kan välja i formuläret, med svenska etiketter. */
const STATUS_OPTIONS: ReadonlyArray<{ value: MatchStatus; label: string }> = [
  { value: 'scheduled', label: 'Ej spelad' },
  { value: 'live', label: 'Pågår' },
  { value: 'finished', label: 'Spelad' },
];

export interface ResultEntryFormProps {
  match: Match;
  teamsById: ReadonlyMap<string, Team>;
  /**
   * Spara en inmatning. Returnerar valideringsresultatet så formuläret kan visa
   * fel inline (vid ok rensas felen och firande-kroken kan triggas av föräldern).
   */
  onSubmit: (matchId: string, entry: ResultEntry) => import('./validate-result').ResultValidation;
  /** Anropas EFTER ett lyckat sparande (förälder triggar t.ex. målfirande). */
  onSaved?: (match: Match, entry: ResultEntry) => void;
}

/** Visa ett lag med namn, fail-safe till id om laget saknas i uppslaget. */
function teamName(teamId: string | null, teamsById: ReadonlyMap<string, Team>): string {
  if (teamId === null) {
    return 'Okänt lag';
  }
  return teamsById.get(teamId)?.name ?? teamId;
}

/**
 * Tolka ett text-input-värde till mål: tomt fält -> null (inget resultat),
 * annars number. Vi parsar INTE bort decimaler/skräp här, det är validatorns
 * jobb (icke-negativt heltal), så ett ogiltigt värde NÅR valideringen och får
 * ett begripligt fel, i stället för att tyst saneras (fail loud).
 */
function parseGoals(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  return Number(trimmed);
}

export function ResultEntryForm({ match, teamsById, onSubmit, onSaved }: ResultEntryFormProps) {
  const home = teamName(match.homeTeamId, teamsById);
  const away = teamName(match.awayTeamId, teamsById);

  // Seeda formuläret från matchens NUVARANDE läge (redigera = se det inmatade).
  const [homeGoals, setHomeGoals] = useState<string>(
    match.result ? String(match.result.homeGoals) : ''
  );
  const [awayGoals, setAwayGoals] = useState<string>(
    match.result ? String(match.result.awayGoals) : ''
  );
  const [status, setStatus] = useState<MatchStatus>(match.status);
  const [errors, setErrors] = useState<ResultValidationError[]>([]);

  // Unika, stabila fält-id:n så <label htmlFor> och aria-describedby pekar rätt
  // även när flera matcher renderas samtidigt (a11y).
  const baseId = useId();
  const homeId = `${baseId}-home`;
  const awayId = `${baseId}-away`;
  const statusId = `${baseId}-status`;
  const errorsId = `${baseId}-errors`;

  // Snabb uppslagning fält -> har-fel, för aria-invalid + describedby per fält.
  const errorsByField = useMemo(() => {
    const map = new Map<ResultValidationError['field'], ResultValidationError[]>();
    for (const e of errors) {
      const bucket = map.get(e.field);
      if (bucket) {
        bucket.push(e);
      } else {
        map.set(e.field, [e]);
      }
    }
    return map;
  }, [errors]);

  const describedBy = (field: ResultValidationError['field']): string | undefined =>
    errorsByField.has(field) ? errorsId : undefined;
  const invalid = (field: ResultValidationError['field']): boolean => errorsByField.has(field);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entry: ResultEntry = {
      homeGoals: parseGoals(homeGoals),
      awayGoals: parseGoals(awayGoals),
      status,
    };
    const result = onSubmit(match.id, entry);
    if (result.ok) {
      setErrors([]);
      onSaved?.(match, entry);
    } else {
      setErrors(result.errors);
    }
  }

  const matchLabel = `${home} mot ${away}`;

  return (
    <form
      onSubmit={handleSubmit}
      // noValidate: vår egen validering (validateResultEntry) är sanningen, med
      // begripliga svenska meddelanden kopplade via aria. Native constraint-
      // validering (min/step) skulle annars BLOCKERA submit med inkonsekventa,
      // mindre tillgängliga webbläsar-bubblor innan vår validering hinner köra.
      // min/step på fälten är kvar som inmatnings-HINT (numeriskt tangentbord,
      // pil-steg), inte som hård grind.
      noValidate
      data-match-id={match.id}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        {/* legend namnger hela inmatningen för skärmläsare (vilka lag). */}
        <legend className="font-display text-sm font-semibold">{matchLabel}</legend>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={homeId} className="text-xs font-medium text-fg-muted">
              {home} (hemma)
            </label>
            <input
              id={homeId}
              name="homeGoals"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={homeGoals}
              onChange={(e) => setHomeGoals(e.target.value)}
              aria-invalid={invalid('home') || undefined}
              aria-describedby={describedBy('home')}
              className="w-16 rounded-md border border-border bg-bg px-2 py-1.5 text-right tabular-nums"
            />
          </div>

          <span aria-hidden="true" className="pb-2 text-fg-muted">
            –
          </span>

          <div className="flex flex-col gap-1">
            <label htmlFor={awayId} className="text-xs font-medium text-fg-muted">
              {away} (borta)
            </label>
            <input
              id={awayId}
              name="awayGoals"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={awayGoals}
              onChange={(e) => setAwayGoals(e.target.value)}
              aria-invalid={invalid('away') || undefined}
              aria-describedby={describedBy('away')}
              className="w-16 rounded-md border border-border bg-bg px-2 py-1.5 text-right tabular-nums"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={statusId} className="text-xs font-medium text-fg-muted">
              Status
            </label>
            <select
              id={statusId}
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as MatchStatus)}
              aria-invalid={invalid('status') || undefined}
              aria-describedby={describedBy('status')}
              className="rounded-md border border-border bg-bg px-2 py-1.5"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="ml-auto rounded-pill bg-accent px-4 py-1.5 font-display text-sm font-semibold text-accent-fg"
          >
            Spara
          </button>
        </div>

        {/* Fel-lista: role="alert" annonseras direkt (fail loud), och fälten
            pekar hit via aria-describedby. Tom lista renderas inte (inget brus). */}
        {errors.length > 0 ? (
          <ul id={errorsId} role="alert" className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {errors.map((e) => (
              <li
                key={e.code}
                style={{ color: 'var(--color-danger)' }}
                className="flex items-start gap-2"
              >
                <span aria-hidden="true">!</span>
                <span>{e.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </fieldset>
    </form>
  );
}
