// BRACKET-/SLUTSPELS-TIPS-formulär för EN slot (FUNKTIONELLT a11y-lager, T16b, #59).
//
// FOKUS (senior-devs lager): KORREKT, TILLGÄNGLIG inmatning av VILKET LAG som går
// vidare ur en slutspels-slot (eller vem som vinner HELA VM, champion-slotten). Tre
// lägen, alla datadrivna (gissa aldrig laget):
//   1. TIPPBAR  -> matchens två lag (eller alla 48 för champion) som val. Ett val
//      måste göras (fel-väg: "Välj ett lag.").
//   2. OKÄNDA LAG (teamsKnown=false, bara match-slots) -> "lagen avgörs av tidigare
//      resultat", otippbar tills lagen är kända (samma princip som T9:s bothTeamsKnown
//      och T15:s predictable-matches). Champion är ALLTID tippbar (alla 48 kända).
//   3. LÅST (avspark/turneringsstart passerad) -> väljaren disabled, mitt tips kvar
//      synligt. Server-RLS är det riktiga låset; här härleds det bara för visning.
//
// LAG-IDENTITET (HARD): väljarens <option value> är lagets CODE (TeamCode, versal),
// och onSubmit får code:n. Brandningen sker i vyn vid UI-gränsen (teamCode()), så
// API:t garanterat får en code , aldrig ett rått gemen Team.id (F1-fällan, tyst 0).
//
// VISUELL DESIGN: senior-devs lager bär stabil semantik + data-attribut som seam
// (data-bracket-prediction-form, -pick, -lock, -tbd, -save, -saved, -error). Premium-
// finish (kupong-formspråk, flaggor, animation) lämnas till design-frontend ovanpå.

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { SlotTeamOption } from './bracket-predictable-slots';

export interface BracketPredictionFormProps {
  /** slot_id (M73..M104 eller 'champion'), tips-nyckel + data-hake. */
  slotId: string;
  /** Människo-läsbar etikett för slotten ("Sextondelsfinal M73", "VM-vinnare"). */
  label: string;
  /** Lagen att välja bland (matchens två, eller alla 48 för champion). */
  teams: readonly SlotTeamOption[];
  /** Är BÅDA lagen kända? false (bara match-slots) -> otippbar TBD-ruta. */
  teamsKnown: boolean;
  /** Mitt nuvarande val (lag-code) om jag redan tippat, annars null. */
  current: string | null;
  /** Är slotten LÅST (avspark/turneringsstart passerad)? Då är väljaren disabled. */
  locked: boolean;
  /**
   * Spara mitt bracket-tips. Kastar vid fel (formuläret visar det inline). Returnerar
   * en Promise så formuläret kan visa "sparar..."/fel-tillstånd.
   */
  onSubmit: (slotId: string, advancingCode: string) => Promise<void>;
}

// Väljar-fältet: SAMMA formspråk som T16:s grupp-tips (tema-trogen fokus-ring,
// WCAG 2.4.7). Färgen är accent (interaktions-affordans, inte status), så T7-pin hålls.
const SELECT =
  'h-11 w-full px-3 text-sm rounded-md border border-border bg-bg text-fg transition-colors ' +
  'duration-150 outline-none focus-visible:border-accent ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] ' +
  'hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))] ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

/** Slå upp ett lags visningsnamn ur dess code (för mitt-tips-sammanfattningen). */
function nameFor(code: string, teams: readonly SlotTeamOption[]): string {
  return teams.find((t) => t.code === code)?.name ?? code;
}

export function BracketPredictionForm({
  slotId,
  label,
  teams,
  teamsKnown,
  current,
  locked,
  onSubmit,
}: BracketPredictionFormProps) {
  // Seeda väljaren från mitt nuvarande tips (redigera = se det jag tippat).
  const [pick, setPick] = useState<string>(current ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Dirty-medveten synk in av ett externt uppdaterat tips (samma mönster som T15/T16):
  // följ ett nytt seed bara om användaren inte börjat redigera, annars stör vi inte.
  const dirtyRef = useRef(false);
  const seed = current ?? '';
  useEffect(() => {
    if (dirtyRef.current) {
      return;
    }
    setPick(seed);
  }, [seed]);

  const baseId = useId();
  const pickId = `${baseId}-pick`;
  const errorId = `${baseId}-error`;
  const lockId = `${baseId}-lock`;

  function edit(value: string) {
    dirtyRef.current = true;
    setSaved(false);
    setPick(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // VALIDERING (fel-väg): ett lag måste väljas.
    if (pick === '') {
      setError('Välj ett lag.');
      return;
    }
    setError(null);
    try {
      await onSubmit(slotId, pick);
      dirtyRef.current = false;
      setSaved(true);
    } catch (err) {
      // Fail loud: ett serverfel (slotten hann låsas på deadline-sekunden, RLS
      // nekade) visas begripligt, inte en tyst miss.
      setError(err instanceof Error ? err.message : 'Kunde inte spara bracket-tipset.');
    }
  }

  const describedBy =
    [error ? errorId : null, locked ? lockId : null].filter(Boolean).join(' ') || undefined;

  // OKÄNDA LAG (bara match-slots): otippbar tills tidigare resultat avgjort lagen.
  // En egen, lugn TBD-ruta , inte ett fel. (Champion har alltid teamsKnown=true.)
  if (!teamsKnown) {
    return (
      <div
        data-bracket-prediction-form=""
        data-slot-id={slotId}
        data-bracket-prediction-tbd=""
        className="flex h-full flex-col gap-1.5 rounded-card border border-dashed border-border p-3"
      >
        <p className="m-0 font-display text-[0.8125rem] font-semibold text-fg">{label}</p>
        <p className="m-0 text-xs text-fg-muted">Lagen avgörs av tidigare resultat.</p>
      </div>
    );
  }

  // Mitt sparade/valda lag (för låst-sammanfattningen + sparat-kvittot).
  const hasPick = pick !== '';
  const pickSummary = hasPick ? (
    <p
      data-bracket-prediction-pick-summary=""
      className="m-0 text-[0.8125rem] font-semibold text-fg"
    >
      Mitt tips: {nameFor(pick, teams)}
    </p>
  ) : null;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-bracket-prediction-form=""
      data-slot-id={slotId}
      data-bracket-prediction-locked={locked || undefined}
      className="flex h-full flex-col gap-2.5 rounded-card border border-border p-3"
    >
      <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0" disabled={locked}>
        <legend className="font-display text-[0.8125rem] font-semibold leading-tight">
          {label}
        </legend>

        {/* LÅST-läget: mitt tips står KVAR synligt under etiketten (samma kontrakt
            som T15/T16). data-bracket-prediction-lock är design-haken + testkontraktet.
            aria-describedby kopplar den till väljaren. Väljaren nedan renderas
            fortfarande (disabled via fieldset), så en skärmläsare/tangentbordsanvändare
            ser vad jag tippat. */}
        {locked ? (
          <div
            id={lockId}
            data-bracket-prediction-lock=""
            className="m-0 rounded-md border border-border bg-[color-mix(in_srgb,var(--color-fg)_4%,var(--color-bg))] px-3 py-2 text-[0.8125rem] leading-snug"
          >
            <span className="font-semibold text-fg">Låst</span>
            <span className="text-fg-muted">
              {' '}
              , matchen har börjat (eller turneringen för VM-vinnaren).
            </span>
            {hasPick ? <span className="mt-1 block">{pickSummary}</span> : null}
          </div>
        ) : null}

        {/* PICK-VÄLJAREN. Renderas ALLTID (även låst, då disabled via fieldset) så
            låst-kontraktet håller: väljaren finns + är disabled. I låst läge döljs den
            visuellt (sammanfattningen ovan är det man ser) men finns kvar i DOM:en
            för a11y + testkontraktet. */}
        <div className={locked ? 'sr-only' : 'flex flex-col gap-2.5'}>
          <select
            id={pickId}
            name="advancing"
            data-bracket-prediction-pick=""
            value={pick}
            onChange={(e) => edit(e.target.value)}
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

          {/* Sparat-tipset (sammanfattning) när ett tips just sparats (öppet läge). */}
          {!locked && saved && hasPick ? pickSummary : null}

          {!locked ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="submit"
                data-bracket-prediction-save=""
                className="h-10 rounded-pill bg-accent px-5 font-display text-[0.8125rem] font-semibold text-accent-fg shadow-sm transition-[transform,box-shadow,filter] duration-150 outline-none hover:brightness-105 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] active:translate-y-px"
              >
                {current ? 'Ändra tips' : 'Spara tips'}
              </button>
              {saved ? (
                <span
                  role="status"
                  data-bracket-prediction-saved=""
                  className="inline-flex items-center gap-1 rounded-pill border border-border px-2.5 py-1 font-display text-xs font-semibold text-fg-muted"
                >
                  Sparat
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Fel-listan: role="alert" (fail loud), kopplad till väljaren via aria. Egen
            yta i danger-ton (semantiskt token), blandad mot OPAK surface (canvas-
            komposit-fälla, T15-lärdomen). */}
        {error ? (
          <p
            id={errorId}
            role="alert"
            data-bracket-prediction-error=""
            className="m-0 rounded-md border p-2.5 text-sm"
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
