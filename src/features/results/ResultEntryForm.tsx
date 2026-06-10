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
import type { ResultEntry, ResultValidationError, ResultValidationField } from './validate-result';

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
  // Fel utan `field` (t.ex. okänd match) hör inte till någon input och hoppas
  // över här, de visas ändå i fel-listan (role=alert) nedan.
  const errorsByField = useMemo(() => {
    const set = new Set<ResultValidationField>();
    for (const e of errors) {
      if (e.field !== undefined) {
        set.add(e.field);
      }
    }
    return set;
  }, [errors]);

  // Ett 'result'-fel ("finished utan resultat") är inte bundet till ett enskilt
  // måltal utan till BÅDA, så det kopplas till hemma- OCH borta-fältet (C1).
  // Övriga fält matchar exakt sitt eget namn. Skärmläsaren får då fel-kontexten
  // på de tomma målfälten, inte bara i fel-listan.
  const hasFieldError = (field: ResultValidationField): boolean =>
    errorsByField.has(field) ||
    ((field === 'home' || field === 'away') && errorsByField.has('result'));

  const describedBy = (field: ResultValidationField): string | undefined =>
    hasFieldError(field) ? errorsId : undefined;
  const invalid = (field: ResultValidationField): boolean => hasFieldError(field);

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

        {/* Kortets kropp som ett STABILT KOLUMN-RUTNÄT (#39, Daniels feedback).
            PROBLEMET som löses: med en flex-layout där lag-kolumnerna var `flex-1`
            knuffade olika långa lagnamn poängrutorna i sidled, så rutorna, "mot"-
            etiketten och Spara hoppade kort för kort. Lösningen är ett grid med
            FASTA spår för score-blocket: bara KONTROLL-spåret är flexibelt
            (`minmax(0,1fr)`), medan hemma-ruta / "mot" / borta-ruta sitter i spår
            med innehålls-bestämd (auto) bredd som är IDENTISK på varje kort
            (samma input-bredd, samma "mot"). Lagnamnen lever som etiketter OVANFÖR
            sina rutor och TRUNKERAS (ellipsis) inom rut-bredden, så ett långt namn
            kan aldrig knuffa layouten, fullständigt namn via title (+ labelns text
            som skärmläsaren läser).

            Mobil (default): score-raden överst (centrerad), kontrollerna under, allt
            staplat och utan horisontell scroll ner till smala vikbara skärmar (280px).
            Desktop (sm+): kontroller till vänster, score-blocket till höger, i lod. */}
        <div
          data-result-card-body=""
          className="grid grid-cols-[auto_auto_auto] items-end justify-center gap-x-3 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:justify-between sm:gap-x-5"
        >
          {/* Kontroller: status-väljare + spara. Spänner hela score-raden på mobil
              (col-span-3, under scoreboarden) men sitter i sitt eget flexibla spår
              på desktop (col 1, vänster). Det är detta spår, INTE lag-kolumnerna,
              som tar upp kortets variabla bredd, så score-rutorna står still. */}
          <div className="order-2 col-span-3 flex flex-wrap items-end justify-center gap-3 sm:order-1 sm:col-span-1 sm:justify-start">
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

          {/* Hemma-lag (grid-cell, FAST bredd via input-spåret). Namnet truncar
              inom rut-bredden (w-16): ett långt lagnamn klipps med ellipsis i
              stället för att knuffa rutan, fullt namn via title + labelns text. */}
          <div className="order-1 flex w-16 flex-col items-center gap-1.5 sm:order-2">
            <span className="flex w-full items-center justify-center gap-1 text-xs">
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
              {/* min-w-0 + truncate: tillåt krympning under innehållets bredd så
                  ellipsisen slår in i stället för att spräcka grid-cellen. title
                  ger fullt namn vid hover (labelns text ger det åt skärmläsaren). */}
              <label htmlFor={homeId} title={home} className="min-w-0 truncate text-fg-muted">
                <span className="font-medium text-fg">{home}</span>
                <span className="sr-only"> (hemma)</span>
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

          {/* "mot"-avdelaren (grid-cell, fast). Vertikalt mot rutorna (pb-4 lyfter
              den från label-raden så den linjerar mot inputs, inte namnen). */}
          <span
            aria-hidden="true"
            className="order-1 self-end pb-4 font-display text-xs font-semibold uppercase tracking-[0.2em] text-fg-muted sm:order-2 sm:self-center sm:pb-0"
          >
            mot
          </span>

          {/* Borta-lag: speglad layout, samma truncate-inom-rut-bredd. */}
          <div className="order-1 flex w-16 flex-col items-center gap-1.5 sm:order-2">
            <span className="flex w-full items-center justify-center gap-1 text-xs">
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
              <label htmlFor={awayId} title={away} className="min-w-0 truncate text-fg-muted">
                <span className="font-medium text-fg">{away}</span>
                <span className="sr-only"> (borta)</span>
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
