// Tillgängligt tips-FORMULÄR för EN match (FUNKTIONELLT + a11y-lager, T15, #15).
//
// FOKUS (senior-devs lager): KORREKT, TILLGÄNGLIG tips-inmatning + fel-vägar +
// LÅST-läge. Samma premium-formspråk som resultatinmatningen (#39, ResultEntryForm):
// fast-bredds score-grid (lagnamn truncar, knuffar aldrig rutorna), stark fokus-ring,
// stabila data-attribut. Skillnaden: detta är en GISSNING före avspark, inte ett
// faktiskt resultat, så det finns inga straffar och ingen status-väljare, och efter
// avspark är formuläret LÅST (deadline-låset visas tydligt, server-RLS upprätthåller det).
//
// VISUELL DESIGN (design-frontend-agentens lager, ovanpå): premium-styling. Strukturen
// är gjord lätt att styla: stabila roller + data-attribut (data-prediction-form,
// data-prediction-locked), inga inbakade statusfärger (T7-pin: accent === success i ljust tema).

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Match, Team } from '../../domain/types';
import { MatchContextRow } from '../results/MatchContextRow';

// Delade fält-klasser, SAMMA premium-formspråk som resultatinmatningen (#39).
const FIELD_BASE =
  'rounded-md border border-border bg-bg text-fg transition-colors duration-150 ' +
  'outline-none focus-visible:border-accent ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] ' +
  'hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))] ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const SCORE_INPUT = `${FIELD_BASE} h-12 w-16 px-2 text-center font-display text-[1.375rem] font-bold leading-none tabular-nums`;

const TEAM_LABEL =
  'min-w-0 truncate text-[0.8125rem] leading-tight tracking-[0.01em] text-fg-muted';

const CODE_CHIP =
  'shrink-0 rounded-sm px-1 py-0.5 font-display text-[0.625rem] font-bold leading-none tracking-wider';

export interface PredictionFormProps {
  match: Match;
  teamsById: ReadonlyMap<string, Team>;
  /** Mitt nuvarande tips (tippade mål) om jag redan tippat, annars null. */
  current: { homeGoals: number; awayGoals: number } | null;
  /** Är matchen LÅST (avspark passerad)? Då är fälten disabled + en låst-etikett visas. */
  locked: boolean;
  /**
   * Spara mitt tips. Kastar vid fel (formuläret visar det inline). Returnerar en
   * Promise så formuläret kan visa "sparar..."/fel-tillstånd.
   */
  onSubmit: (matchId: string, homeGoals: number, awayGoals: number) => Promise<void>;
}

function teamName(teamId: string | null, teamsById: ReadonlyMap<string, Team>): string {
  if (teamId === null) {
    return 'Okänt lag';
  }
  return teamsById.get(teamId)?.name ?? teamId;
}

function teamCode(teamId: string | null, teamsById: ReadonlyMap<string, Team>): string {
  if (teamId === null) {
    return '';
  }
  return teamsById.get(teamId)?.code ?? '';
}

/** Tolka ett text-input-värde till mål: tomt -> null, annars number (validatorn nedan). */
function parseGoals(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  return Number(trimmed);
}

/** Är ett värde ett icke-negativt heltal? (Avvisar tomt, NaN, decimal, negativt.) */
function isNonNegativeInteger(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 0;
}

export function PredictionForm({
  match,
  teamsById,
  current,
  locked,
  onSubmit,
}: PredictionFormProps) {
  const home = teamName(match.homeTeamId, teamsById);
  const away = teamName(match.awayTeamId, teamsById);
  const homeCode = teamCode(match.homeTeamId, teamsById);
  const awayCode = teamCode(match.awayTeamId, teamsById);

  // Seeda fälten från mitt nuvarande tips (redigera = se det jag tippat).
  const [homeGoals, setHomeGoals] = useState<string>(current ? String(current.homeGoals) : '');
  const [awayGoals, setAwayGoals] = useState<string>(current ? String(current.awayGoals) : '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Synka in ett externt uppdaterat tips (t.ex. realtid senare) när formuläret är
  // RENT (inte ett pågående osparat edit), samma dirty-medvetna mönster som #39.
  const dirtyRef = useRef(false);
  const seedHome = current ? String(current.homeGoals) : '';
  const seedAway = current ? String(current.awayGoals) : '';
  useEffect(() => {
    if (dirtyRef.current) {
      return;
    }
    setHomeGoals(seedHome);
    setAwayGoals(seedAway);
  }, [seedHome, seedAway]);

  const baseId = useId();
  const homeId = `${baseId}-home`;
  const awayId = `${baseId}-away`;
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
    const h = parseGoals(homeGoals);
    const a = parseGoals(awayGoals);
    // VALIDERING (fel-väg): ett tips KRÄVER båda mål som icke-negativa heltal.
    if (!isNonNegativeInteger(h) || !isNonNegativeInteger(a)) {
      setError('Ange ett tips: hemma- och bortamål som heltal, noll eller större.');
      return;
    }
    setError(null);
    try {
      await onSubmit(match.id, h, a);
      dirtyRef.current = false;
      setSaved(true);
    } catch (err) {
      // Fail loud: ett serverfel (t.ex. matchen hann låsas på deadline-sekunden,
      // RLS nekade) visas som ett begripligt fel, inte en tyst miss.
      setError(err instanceof Error ? err.message : 'Kunde inte spara tipset.');
    }
  }

  const matchLabel = `${home} mot ${away}`;
  const describedBy =
    [error ? errorId : null, locked ? lockId : null].filter(Boolean).join(' ') || undefined;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-prediction-form=""
      data-match-id={match.id}
      data-prediction-locked={locked || undefined}
      className="group/form flex flex-col gap-3 rounded-card border border-border bg-surface p-3.5 shadow-[var(--vm-shadow-card),inset_0_1px_0_0_color-mix(in_srgb,var(--vm-gold)_22%,transparent)] transition-[box-shadow,border-color] duration-300 hover:border-[color-mix(in_srgb,var(--color-accent)_28%,var(--color-border))] sm:p-5"
    >
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0" disabled={locked}>
        <legend className="flex items-center gap-2 font-display text-sm font-semibold leading-tight tracking-[-0.01em] sm:text-[0.9375rem]">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-pill"
            style={{ backgroundColor: 'var(--color-accent)' }}
          />
          {matchLabel}
        </legend>

        {/* Kontext-rad (återanvänd från resultatinmatningen): avsparkstid + grupp/runda. */}
        <MatchContextRow match={match} />

        {/* LÅST-etikett: visas tydligt efter avspark. data-prediction-lock är haken
            för design-frontend. role/aria-describedby kopplar den till fälten så en
            skärmläsare får veta varför fälten är inaktiva. */}
        {locked ? (
          <p
            id={lockId}
            data-prediction-lock=""
            className="m-0 rounded-md border border-border bg-bg px-3 py-2 text-[0.8125rem] font-semibold text-fg-muted"
          >
            Tipset är låst, matchen har sparkat igång.
            {current
              ? ` Ditt tips: ${current.homeGoals}–${current.awayGoals}.`
              : ' Du hann inte tippa.'}
          </p>
        ) : null}

        {/* Score-grid (SAMMA #39-struktur som resultatinmatningen, fast bredd). */}
        <div
          data-prediction-card-body=""
          className="grid grid-cols-[auto_auto_auto] items-end justify-center gap-x-2.5 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:justify-between sm:gap-x-4"
        >
          {/* Kontroll-spåret (Spara). Bär kortets variabla bredd, så rutorna står still. */}
          <div className="order-2 col-span-3 flex flex-wrap items-end justify-center gap-2.5 sm:order-1 sm:col-span-1 sm:justify-start">
            {!locked ? (
              <button
                type="submit"
                data-prediction-save=""
                className="ml-auto h-11 self-end rounded-pill bg-accent px-6 font-display text-sm font-semibold text-accent-fg shadow-sm transition-[transform,box-shadow,filter] duration-150 outline-none hover:brightness-105 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] active:translate-y-px"
              >
                {current ? 'Ändra tips' : 'Spara tips'}
              </button>
            ) : null}
            {/* Sparat-kvitto (role=status): diskret bekräftelse, annonseras artigt. */}
            {saved && !locked ? (
              <span
                role="status"
                data-prediction-saved=""
                className="self-center font-display text-[0.8125rem] font-semibold text-fg-muted"
              >
                Sparat
              </span>
            ) : null}
          </div>

          {/* Hemma-lag (fast bredd via input-spåret). */}
          <div className="order-1 flex w-16 flex-col items-center gap-1 sm:order-2">
            <span className="flex w-full items-center justify-center gap-1">
              {homeCode ? (
                <span
                  aria-hidden="true"
                  className={CODE_CHIP}
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
                    color: 'var(--color-fg)',
                  }}
                >
                  {homeCode}
                </span>
              ) : null}
              <label htmlFor={homeId} title={home} className={TEAM_LABEL}>
                <span className="font-semibold text-fg">{home}</span>
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
              onChange={(e) => edit(setHomeGoals)(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              className={SCORE_INPUT}
            />
          </div>

          {/* "mot"-avdelaren (fast). */}
          <span
            aria-hidden="true"
            className="order-1 self-end pb-3 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.18em] sm:order-2 sm:self-center sm:pb-0"
            style={{ color: 'color-mix(in srgb, var(--vm-gold) 52%, var(--color-fg-muted))' }}
          >
            mot
          </span>

          {/* Borta-lag (speglad layout). */}
          <div className="order-1 flex w-16 flex-col items-center gap-1 sm:order-2">
            <span className="flex w-full items-center justify-center gap-1">
              {awayCode ? (
                <span
                  aria-hidden="true"
                  className={CODE_CHIP}
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
                    color: 'var(--color-fg)',
                  }}
                >
                  {awayCode}
                </span>
              ) : null}
              <label htmlFor={awayId} title={away} className={TEAM_LABEL}>
                <span className="font-semibold text-fg">{away}</span>
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
              onChange={(e) => edit(setAwayGoals)(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              className={SCORE_INPUT}
            />
          </div>
        </div>

        {/* Fel-listan: role="alert" (fail loud), kopplad till fälten via aria. */}
        {error ? (
          <p
            id={errorId}
            role="alert"
            data-prediction-error=""
            className="m-0 rounded-md border p-3 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
              backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
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
