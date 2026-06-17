// BRACKET-/SLUTSPELS-TIPS-formulär för EN slot (FUNKTIONELLT a11y-lager + VISUELL
// premium-finish, T16b, #59).
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
// VISUELL DESIGN (designen, T16b): "vägen till bucklan". Två varianter, EN
// komponent (variant-propen styr):
//   * CHAMPION ('champion'): HJÄLTE-momentet, "vem lyfter bucklan". En guld arena-
//     glow-hero (.vm-champion-hero) med en pokal-glyf, en stor TeamFlag-förhands-
//     visning av min mästare och ett STOLT guld mästar-band (.vm-champion-band) när
//     valet är gjort. Det är trädets krona, översatt till tips.
//   * SLOT ('slot'): TIPSKUPONG-formspråk, ärver HELA tips-kupong-familjen
//     (.vm-coupon-card, river-tear, coupon-eyebrow, lock-ikon, .vm-coupon-mine) som
//     grupp-tipset (T16) + match-tipset (T15) redan etablerat (DRY), så slutspels-
//     tipset hör till SAMMA kupong-värld. De TVÅ möjliga lagen blir ett tydligt val
//     med TeamFlag-förhandsvisning. TBD-läget är en elegant streckad väntan-kupong,
//     låst-läget hänglås + mitt tips kvar stolt.
// All dekor bor i tokens.css (.vm-champion-*, .vm-coupon-*, .vm-tips-*), så STRUKTUREN
// här hålls ren: stabila roller + data-attribut + semantiska <select>/<label>/<legend>
// bevarade EXAKT (senior-devs seam + testkontrakt). Guld-TEXT använder den AA-mätta
// --color-warning, aldrig rå --vm-gold (guld-på-ljus-fällan, lessons aa-kontrast).

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { SlotTeamOption } from './bracket-predictable-slots';
import { TeamFlag } from '../daily/TeamFlag';
import { DeadlineNotice } from '../predictions/DeadlineNotice';

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
   * Slottens deadline (slottens egen avspark, eller g-A-1 för champion, avspark ISO),
   * SAMMA värde som driver `locked`. Visas i ÖPPET läge så det är klart NÄR tippningen
   * låses (AC#3). null om ankar-matchen saknas (oväntat) -> ingen deadline-rad.
   */
  deadlineIso?: string | null;
  /** Injicerbart "nu" (testbarhet) för deadline-radens relativa etikett, default nuet. */
  now?: Date;
  /**
   * Visuell variant: 'champion' = hjälte-hero (pokal/guld), 'slot' = tips-kupong.
   * Default 'slot' (de flesta slotsen). Påverkar BARA presentationen, inte semantiken.
   */
  variant?: 'champion' | 'slot';
  /**
   * Spara mitt bracket-tips. Kastar vid fel (formuläret visar det inline). Returnerar
   * en Promise så formuläret kan visa "sparar..."/fel-tillstånd.
   */
  onSubmit: (slotId: string, advancingCode: string) => Promise<void>;
}

// Väljar-fältet: SAMMA premium-formspråk som T15/T16 (stark tema-trogen fokus-ring,
// WCAG 2.4.7, mjuk hover). Färgen är accent (interaktions-affordans, inte status),
// så T7-pinnen hålls ren. min-w-0 så <select> krymper under sin längsta <option>
// (intrinsisk min-content) i stället för att spränga kolumnen på smal skärm (280px).
const SELECT =
  'h-11 w-full min-w-0 px-3 text-sm rounded-md border border-border bg-bg text-fg transition-colors ' +
  'duration-150 outline-none focus-visible:border-accent ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] ' +
  'hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))] ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Pokal-glyfen (champion-hjältens signatur). Ren dekoration (aria-hidden); mästar-
 * etiketten bär betydelsen. Står i mörk ink på den solida guld-brickan (AA-säker).
 */
function TrophyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
      <path d="M7 5H4.5a1.5 1.5 0 0 0 0 5H7M17 5h2.5a1.5 1.5 0 0 1 0 5H17" />
      <path d="M12 13v3M9 20h6M9.5 20a2.5 2.5 0 0 1 5 0" />
    </svg>
  );
}

/**
 * Biljett-/kupong-ikonen (kupong-huvudets dekor-glyf), SAMMA som T15/T16:s tips-
 * kupong så slutspels-tipset delar signatur med grupp- och match-tipset. Ren dekoration.
 */
function CouponTicketIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 5.5A1 1 0 0 1 3 4.5h10a1 1 0 0 1 1 1v1a1.5 1.5 0 0 0 0 3v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1a1.5 1.5 0 0 0 0-3z" />
      <path d="M10 4.75v6.5" strokeDasharray="1.4 1.4" />
    </svg>
  );
}

/**
 * Hänglås-ikonen (låst-läget), SAMMA som T15/T16. Ren dekoration (aria-hidden); låst-
 * etikettens text bär betydelsen. Får en lugn engångs-puls via .vm-coupon-lock-icon.
 */
function CouponLockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="vm-coupon-lock-icon h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.25" y="7" width="9.5" height="6.5" rx="1.4" />
      <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
      <circle cx="8" cy="10" r="0.85" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Kompass-/väntan-glyfen (TBD-läget), en lugn "kommer snart"-signal i stället för en
 * tom ruta. Ren dekoration (aria-hidden); TBD-texten bär betydelsen.
 */
function TbdHourglassIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="vm-tips-tbd-icon h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 2.5h7M4.5 13.5h7" />
      <path d="M5 2.5c0 3 6 3.5 6 5.5s-6 2.5-6 5.5M11 2.5c0 3-6 3.5-6 5.5" />
    </svg>
  );
}

/** En liten bock-glyf för sparat-kvittot (samma signatur som T16). Ren dekoration. */
function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8.5l3 3 6-6.5" />
    </svg>
  );
}

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
  deadlineIso = null,
  now,
  variant = 'slot',
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
  const isChampion = variant === 'champion';

  // OKÄNDA LAG (bara match-slots): otippbar tills tidigare resultat avgjort lagen.
  // En egen, lugn streckad väntan-KUPONG , inte ett fel, inte tomt. (Champion har
  // alltid teamsKnown=true, så TBD-grenen nås bara av slot-varianten.)
  if (!teamsKnown) {
    return (
      <div
        data-bracket-prediction-form=""
        data-slot-id={slotId}
        data-bracket-prediction-tbd=""
        className="vm-tips-tbd flex h-full flex-col gap-2 rounded-card border border-dashed border-[color-mix(in_srgb,var(--vm-gold)_24%,var(--color-border))] p-4"
      >
        <p className="m-0 flex items-center gap-1.5 font-display text-[0.625rem] font-bold uppercase leading-none tracking-[0.2em] text-warning">
          <CouponTicketIcon />
          Slot
        </p>
        <p className="m-0 font-display text-[0.8125rem] font-semibold leading-tight text-fg">
          {label}
        </p>
        <div className="mt-auto flex items-center gap-2 text-fg-muted">
          <TbdHourglassIcon />
          <p className="m-0 text-xs leading-snug">Lagen avgörs av tidigare resultat.</p>
        </div>
      </div>
    );
  }

  // Mitt sparade/valda lag (för låst-sammanfattningen + sparat-kvittot).
  const hasPick = pick !== '';

  // Mitt-tips-sammanfattningen: lag-flagga + namn. Champion får ett STORT, stolt
  // guld mästar-band (.vm-champion-band), slot-varianten en kompakt rad. Texten
  // "Mitt tips: <namn>" bevaras EXAKT (testkontraktet + skärmläsar-sammanfattningen).
  const pickSummary = hasPick ? (
    isChampion ? (
      <div
        data-bracket-prediction-pick-summary=""
        className="vm-champion-band flex items-center gap-3 rounded-pill px-4 py-2.5"
      >
        <TeamFlag code={pick} size="md" />
        <span className="min-w-0">
          <span className="block font-display text-[0.625rem] font-bold uppercase leading-none tracking-[0.18em] opacity-80">
            Min VM-vinnare
          </span>
          <span className="mt-0.5 block truncate font-display text-base font-bold leading-tight">
            Mitt tips: {nameFor(pick, teams)}
          </span>
        </span>
      </div>
    ) : (
      <div data-bracket-prediction-pick-summary="" className="flex min-w-0 items-center gap-2">
        <TeamFlag code={pick} size="sm" />
        <span className="min-w-0 truncate text-[0.8125rem] font-semibold text-fg">
          Mitt tips: {nameFor(pick, teams)}
        </span>
      </div>
    )
  ) : null;

  // CHAMPION-HJÄLTEN: en egen, större panel (pokal + guld arena-glow). Den är hela
  // tippnings-vyns ankare , "vem lyfter bucklan".
  if (isChampion) {
    return (
      <form
        onSubmit={handleSubmit}
        noValidate
        data-bracket-prediction-form=""
        data-slot-id={slotId}
        data-bracket-prediction-locked={locked || undefined}
        className="vm-champion-hero flex flex-col gap-4 rounded-card border border-[color-mix(in_srgb,var(--vm-gold)_30%,var(--color-border))] p-5 sm:p-6"
      >
        <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0" disabled={locked}>
          {/* legend namnger inmatningen för skärmläsare; den ÄR hjälte-rubriken och
              ligger som direkt barn till fieldset (a11y: legend måste vara direkt barn
              för pålitlig fieldset-association, C1/#59). legend bär själv flex-raden
              som div:en bar förut: pokal-emblem + textkolumn (eyebrow + label). */}
          <legend className="m-0 flex w-full items-center gap-3 p-0">
            {/* Pokal-emblemet: solid guld-bricka med mörk ink (AA-säker, T9/T11-form). */}
            <span
              aria-hidden="true"
              data-champion-celebrate={saved || undefined}
              className="vm-champion-trophy h-12 w-12 shrink-0 rounded-pill"
            >
              <TrophyIcon />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5 font-display text-[0.625rem] font-bold uppercase leading-none tracking-[0.22em] text-warning">
                VM-finalen
              </span>
              <span className="mt-1.5 font-display text-xl font-bold leading-tight text-fg sm:text-2xl">
                {label}
              </span>
            </span>
          </legend>

          <p className="m-0 max-w-prose text-sm text-fg-muted">
            Vem lyfter bucklan? Välj laget du tror tar sig hela vägen och vinner VM 2026, du tippar
            bland alla 48 lag innan turneringen sparkar igång.
          </p>

          {/* LÅST-läget (turneringen har börjat): hänglås + mitt mästar-band kvar stolt. */}
          {locked ? (
            <div className="flex flex-col gap-3">
              <div
                id={lockId}
                data-bracket-prediction-lock=""
                className="m-0 flex items-start gap-2.5 rounded-md border border-[color-mix(in_srgb,var(--vm-gold)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_7%,var(--color-bg))] px-3 py-2.5"
              >
                <span className="mt-0.5 shrink-0 text-warning">
                  <CouponLockIcon />
                </span>
                <p className="m-0 text-[0.8125rem] font-semibold leading-snug text-fg">
                  Låst, turneringen har börjat.{' '}
                  <span className="font-medium text-fg-muted">
                    VM-vinnaren tippas innan första matchen, så alla gissar blint.
                  </span>{' '}
                  {hasPick ? null : (
                    <span className="text-fg-muted">Du hann inte tippa VM-vinnaren.</span>
                  )}
                </p>
              </div>
              {pickSummary}
            </div>
          ) : null}

          {/* VÄLJAREN + mästar-band + spara. I låst läge döljs hela detta block visuellt
              (mästar-bandet ovan är det man ser) men finns kvar i DOM:en (disabled via
              fieldset) för a11y + testkontraktet. */}
          <div className={locked ? 'sr-only' : 'flex flex-col gap-4'}>
            {/* DEADLINE-RADEN (AC#3): VM-vinnaren låses vid turneringsstart (g-A-1),
                ur SAMMA deadlineIso som driver låset (en sanning). Bara i öppet läge. */}
            {!locked ? (
              <DeadlineNotice deadlineIso={deadlineIso} now={now} lead="Tippningen låses" />
            ) : null}
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor={pickId} className="font-display text-sm font-semibold text-fg">
                Min VM-vinnare
              </label>
              <div className="flex min-w-0 items-center gap-2.5">
                {/* TeamFlag-förhandsvisning av min mästare (eller en lugn platshållar-disc),
                    så valet syns visuellt direkt. Flaggan är ren dekor (aria-hidden). */}
                {hasPick ? (
                  <TeamFlag code={pick} size="md" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="h-9 w-9 shrink-0 rounded-pill border border-dashed border-border"
                  />
                )}
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
                  <option value="">Välj VM-vinnare…</option>
                  {teams.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Mästar-bandet (stolt sammanfattning) när champion just sparats. */}
            {saved && hasPick ? pickSummary : null}

            {/* Kontroll-spåret: Spara + sparat-kvitto. Bara i öppet läge (i låst läge
                finns ingen spara-knapp , samma kontrakt som slot-varianten). */}
            {!locked ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="submit"
                  data-bracket-prediction-save=""
                  className="h-11 rounded-pill bg-accent px-6 font-display text-sm font-semibold text-accent-fg shadow-[var(--vm-shadow-button)] transition-[transform,box-shadow,filter] duration-150 outline-none hover:brightness-105 hover:shadow-[var(--vm-shadow-raised)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] active:translate-y-px active:brightness-95"
                >
                  {current ? 'Ändra tips' : 'Spara tips'}
                </button>
                {saved ? (
                  <span
                    role="status"
                    data-bracket-prediction-saved=""
                    className="vm-coupon-mine inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-display text-[0.8125rem] font-bold leading-none shadow-sm"
                  >
                    <CheckIcon />
                    Sparat
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Fel-listan: role="alert" (fail loud), kopplad via aria. Egen yta i danger-
              ton, blandad mot OPAK surface-raised (canvas-komposit-fälla, T15-lärdomen). */}
          {error ? (
            <p
              id={errorId}
              role="alert"
              data-bracket-prediction-error=""
              className="m-0 rounded-md border p-3 text-sm"
              style={{
                borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
                backgroundColor:
                  'color-mix(in srgb, var(--color-danger) 9%, var(--color-surface-raised))',
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

  // SLOT-VARIANTEN: en tips-kupong (ärver hela kupong-familjen). De TVÅ möjliga lagen
  // som ett tydligt binärt val.
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-bracket-prediction-form=""
      data-slot-id={slotId}
      data-bracket-prediction-locked={locked || undefined}
      className="vm-coupon-card flex h-full flex-col gap-3 rounded-card border border-[color-mix(in_srgb,var(--vm-gold)_20%,var(--color-border))] p-4 transition-[border-color] duration-300 hover:border-[color-mix(in_srgb,var(--vm-gold)_38%,var(--color-border))]"
    >
      <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" disabled={locked}>
        {/* KUPONG-HUVUDET: "SLOT"-eyebrow + biljett-ikon, så kupongen läses som en del
            av VM-poolen. FÄRG: --color-warning (AA-säker guld-text-ton), aldrig rå guld. */}
        <p
          aria-hidden="true"
          className="flex items-center gap-1.5 font-display text-[0.625rem] font-bold uppercase leading-none tracking-[0.2em] text-warning"
        >
          <CouponTicketIcon />
          Slot
        </p>

        {/* legend namnger inmatningen för skärmläsare; visuellt slot-rubriken med en
            liten guld kupong-prick (samma signatur-detalj som T15/T16). */}
        <legend className="flex items-center gap-2 font-display text-[0.8125rem] font-semibold leading-tight">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-pill"
            style={{ backgroundColor: 'var(--vm-gold)' }}
          />
          {label}
        </legend>

        {/* RIVER-LINJEN: kupongens avrivnings-perforering (delad med T15/T16). */}
        <div aria-hidden="true" className="vm-coupon-tear -mx-0.5 rounded-pill" />

        {/* LÅST-läget: elegant + POSITIVT. Hänglås + dämpad guld-yta, mitt tips står
            KVAR synligt. data-bracket-prediction-lock är design-haken + testkontraktet.
            Väljaren nedan renderas fortfarande (disabled via fieldset), så en skärm-
            läsare/tangentbordsanvändare ser vad jag tippat. */}
        {locked ? (
          <div className="flex flex-col gap-2.5">
            <div
              id={lockId}
              data-bracket-prediction-lock=""
              className="m-0 flex items-start gap-2.5 rounded-md border border-[color-mix(in_srgb,var(--vm-gold)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_7%,var(--color-bg))] px-3 py-2.5"
            >
              <span className="mt-0.5 shrink-0 text-warning">
                <CouponLockIcon />
              </span>
              <p className="m-0 text-[0.8125rem] font-semibold leading-snug text-fg">
                Låst, matchen har börjat.{' '}
                <span className="font-medium text-fg-muted">Slotten låses vid avspark.</span>{' '}
                {hasPick ? null : (
                  <span className="text-fg-muted">Du hann inte tippa den här slotten.</span>
                )}
              </p>
            </div>
            {pickSummary}
          </div>
        ) : null}

        {/* PICK-VÄLJAREN. Renderas ALLTID (även låst, då disabled via fieldset) så
            låst-kontraktet håller. I låst läge döljs den visuellt (sammanfattningen
            ovan är det man ser) men finns kvar i DOM:en för a11y + testkontraktet. */}
        <div className={locked ? 'sr-only' : 'flex flex-col gap-2.5'}>
          {/* DEADLINE-RADEN (AC#3): slotten låses vid sin egen avspark, ur SAMMA
              deadlineIso som driver låset (en sanning). Bara i öppet läge. */}
          {!locked ? <DeadlineNotice deadlineIso={deadlineIso} now={now} lead="Låses" /> : null}
          {/* De TVÅ möjliga lagen som ett tydligt val: flaggor + namn + "vs", så valet
              känns konkret innan väljaren. Ren dekoration (aria-hidden), väljaren bär
              det riktiga valet. Visas bara när det är en binär match-slot (2 lag). */}
          {teams.length === 2 ? (
            <div
              aria-hidden="true"
              className="flex items-center gap-2 rounded-md border border-border bg-[color-mix(in_srgb,var(--color-fg)_3%,var(--color-surface))] px-2.5 py-2"
            >
              {teams.map((t, i) => (
                <span key={t.code} className="contents">
                  {i === 1 ? (
                    <span className="vm-tips-versus px-0.5 text-[0.625rem]">vs</span>
                  ) : null}
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <TeamFlag code={t.code} size="sm" />
                    <span className="min-w-0 truncate text-xs font-semibold text-fg">{t.name}</span>
                  </span>
                </span>
              ))}
            </div>
          ) : null}

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
            <option value="">Vem går vidare?…</option>
            {teams.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Sparat-tipset (sammanfattning) när ett tips just sparats (öppet läge). */}
          {saved && hasPick ? pickSummary : null}

          {/* Kontroll-spåret: Spara + sparat-kvitto. Bara i öppet läge (i låst läge
              finns ingen spara-knapp , samma kontrakt som T15/T16, testkontraktet). */}
          {!locked ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="submit"
                data-bracket-prediction-save=""
                className="h-10 rounded-pill bg-accent px-5 font-display text-[0.8125rem] font-semibold text-accent-fg shadow-[var(--vm-shadow-button)] transition-[transform,box-shadow,filter] duration-150 outline-none hover:brightness-105 hover:shadow-[var(--vm-shadow-raised)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] active:translate-y-px active:brightness-95"
              >
                {current ? 'Ändra tips' : 'Spara tips'}
              </button>
              {saved ? (
                <span
                  role="status"
                  data-bracket-prediction-saved=""
                  className="vm-coupon-mine inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-display text-xs font-bold leading-none shadow-sm"
                >
                  <CheckIcon />
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
