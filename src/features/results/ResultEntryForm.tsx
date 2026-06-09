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

// Delade fält-klasser: en stark, tema-trogen fokus-ring (WCAG 2.4.7, synlig i
// båda teman via --color-accent) och en mjuk hover/focus-lyft. En sanning så
// mål-fälten och status-väljaren ser ut som EN familj. Färgen på ringen är
// accent (interaktions-affordans, inte status), så T7-pinnen hålls ren.
const FIELD_BASE =
  'rounded-md border border-border bg-bg text-fg transition-colors duration-150 ' +
  'outline-none focus-visible:border-accent ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] ' +
  'hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))]';

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

/** Slå upp lagets FIFA-trebokstavskod (för code-badge), tomt om okänt. */
function teamCode(teamId: string | null, teamsById: ReadonlyMap<string, Team>): string {
  if (teamId === null) {
    return '';
  }
  return teamsById.get(teamId)?.code ?? '';
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
  const homeCode = teamCode(match.homeTeamId, teamsById);
  const awayCode = teamCode(match.awayTeamId, teamsById);

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
      className="group/form flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-[var(--vm-shadow-card)] transition-shadow duration-300 hover:shadow-[var(--vm-shadow-raised)] sm:p-5"
    >
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        {/* legend namnger hela inmatningen för skärmläsare (vilka lag). Visuellt
            är den matchens rubrik med en liten gräsplan-grön puls-prick. legend
            ligger utanför grid:en nedan så den spänner hela kortets bredd. */}
        <legend className="flex items-center gap-2 font-display text-sm font-semibold sm:text-base">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-pill"
            style={{ backgroundColor: 'var(--color-accent)' }}
          />
          {matchLabel}
        </legend>

        {/* Kortets kropp: på desktop står kontrollerna (status + spara) till
            vänster och scoreboarden till höger, så kortets bredd fylls med avsikt
            i stället för att scoreboarden flyter i tomrum. På mobil staplar de
            (scoreboard överst, kontroller under), kompakt och utan horisontell
            scroll. items-center håller raderna i lod mot varandra. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          {/* Scoreline: hemma- och borta-fälten hugger en centrerad "mot"-avdelare,
              så raden läses som en faktisk resultat-rad (2 mot 0), inte två lösa
              fält. Varje lag-kolumn har sin label centrerad ÖVER sitt fält.
              order: scoreboarden överst på mobil, men till höger på desktop. */}
          <div className="order-1 flex items-end justify-center gap-3 sm:order-2 sm:gap-5">
            {/* Hemma-lag. Code-badgen ligger UTANFÖR <label> (egen aria-hidden-rad)
              så labelns tillgängliga text förblir exakt "{lag} (hemma)", det
              skärmläsaren och testerna läser; badgen är bara visuell krydda. */}
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 sm:max-w-[13rem]">
              <span className="flex max-w-full items-center gap-1.5 text-xs">
                {homeCode ? (
                  <span
                    aria-hidden="true"
                    className="shrink-0 rounded-sm px-1 py-0.5 font-display text-[0.625rem] font-bold leading-none tracking-wide"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
                      color: 'var(--color-fg)',
                    }}
                  >
                    {homeCode}
                  </span>
                ) : null}
                <label htmlFor={homeId} className="min-w-0 truncate text-fg-muted">
                  <span className="font-medium text-fg">{home}</span> (hemma)
                </label>
              </span>
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
                className={`${FIELD_BASE} h-14 w-16 px-2 text-center font-display text-2xl font-bold tabular-nums`}
              />
            </div>

            {/* "mot"-avdelaren, vertikalt centrerad mot fälten (inte labels). */}
            <span
              aria-hidden="true"
              className="shrink-0 pb-4 font-display text-xs font-semibold uppercase tracking-[0.2em] text-fg-muted"
            >
              mot
            </span>

            {/* Borta-lag: speglad layout, samma label-utanför-badge-mönster så även
              denna labels tillgängliga text förblir exakt "{lag} (borta)". */}
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 sm:max-w-[13rem]">
              <span className="flex max-w-full items-center gap-1.5 text-xs">
                {awayCode ? (
                  <span
                    aria-hidden="true"
                    className="shrink-0 rounded-sm px-1 py-0.5 font-display text-[0.625rem] font-bold leading-none tracking-wide"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
                      color: 'var(--color-fg)',
                    }}
                  >
                    {awayCode}
                  </span>
                ) : null}
                <label htmlFor={awayId} className="min-w-0 truncate text-fg-muted">
                  <span className="font-medium text-fg">{away}</span> (borta)
                </label>
              </span>
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
                className={`${FIELD_BASE} h-14 w-16 px-2 text-center font-display text-2xl font-bold tabular-nums`}
              />
            </div>
          </div>

          {/* Kontroller: status-väljare + spara. Ligger till vänster på desktop
              (order-1), under scoreboarden på mobil (order-2). Spara fyller
              kontroll-radens bredd på mobil men håller sig kompakt på desktop. */}
          <div className="order-2 flex flex-wrap items-end gap-3 sm:order-1">
            <div className="flex flex-col gap-1.5">
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
                className={`${FIELD_BASE} h-11 px-3 pr-8 text-sm`}
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
              className="ml-auto h-11 rounded-pill bg-accent px-6 font-display text-sm font-semibold text-accent-fg shadow-sm transition-[transform,box-shadow,filter] duration-150 outline-none hover:brightness-105 hover:shadow-[var(--vm-shadow-raised)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] active:translate-y-px active:brightness-95"
            >
              Spara
            </button>
          </div>
        </div>

        {/* Fel-lista: role="alert" annonseras direkt (fail loud), och fälten
            pekar hit via aria-describedby. Tom lista renderas inte (inget brus).
            Egen yta i danger-ton (semantiskt token, INTE accent/success) så felet
            är omöjligt att missa men håller T7-pinnen ren. */}
        {errors.length > 0 ? (
          <ul
            id={errorsId}
            role="alert"
            className="m-0 flex list-none flex-col gap-1.5 rounded-md border p-3 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
              backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
              color: 'var(--color-danger)',
            }}
          >
            {errors.map((e) => (
              <li key={e.code} className="flex items-start gap-2">
                <span aria-hidden="true" className="font-bold leading-snug">
                  !
                </span>
                <span className="leading-snug">{e.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </fieldset>
    </form>
  );
}
