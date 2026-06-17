// GRUPP-TIPS-formulär för EN grupp (FUNKTIONELLT a11y-lager + VISUELL premium-finish, T16, #16).
//
// FOKUS (senior-devs lager): KORREKT, TILLGÄNGLIG inmatning av gruppens 1:a + 2:a
// bland gruppens 4 lag. Validering speglar DB-constrainten: 1:an och 2:an måste vara
// OLIKA lag, och båda måste väljas. Efter gruppens första match är formuläret LÅST
// (server-RLS är det riktiga låset; här härleds det bara för visning).
//
// VISUELL DESIGN (designen, T16): det här är "tippa hela gruppspelet"-momentet,
// VM-kupongen man fyller i med kompisarna. EGEN identitet: en PODIUM-KUPONG. Samma
// TIPS-KUPONG-familj som T15 (samma `.vm-coupon-card`-fond, guld-signatur, DRY), men
// med en pallplats-metafor: 1:a = GULD-medalj, 2:a = SILVER-medalj. Varje plats-rad
// får sin medalj + en TeamFlag-förhandsvisning av det valda laget, så valet blir
// tydligt och kul, inte två grå dropdowns. Ett sparat grupp-tips visas som ett STOLT
// podium (guld-medalj + 1:ans lag, silver-medalj + 2:ans lag). Allt podium-dekor bor
// i tokens.css (`.vm-pool-*`, `.vm-coupon-*`), så STRUKTUREN här hålls ren: stabila
// roller + data-attribut + semantiska <select>/<label> bevarade. Guld/silver-TEXT
// använder de AA-mätta tonerna (--color-warning, --vm-silver-text), aldrig rå
// dekor-färg som text (guld/silver-på-ljus-fällan, lessons aa-kontrast).

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { GroupTeamOption } from './group-predictable-data';
import type { GroupSuggestion } from '../simulation/derive-tipped-group-table';
import { TeamFlag } from '../daily/TeamFlag';
import { DeadlineNotice } from '../predictions/DeadlineNotice';

export interface GroupPredictionFormProps {
  groupId: string;
  /** Gruppens 4 lag (väljarnas alternativ). */
  teams: readonly GroupTeamOption[];
  /** Mitt nuvarande grupp-tips (lag-koder) om jag redan tippat, annars null. */
  current: { winnerCode: string; runnerUpCode: string } | null;
  /** Är gruppen LÅST (första matchen sparkat igång)? Då är väljarna disabled. */
  locked: boolean;
  /**
   * Gruppens deadline (gruppens första match g-X-1, avspark ISO), SAMMA värde som
   * driver `locked`. Visas i ÖPPET läge så det är klart NÄR tippningen låses (AC#3).
   * null om ankar-matchen saknas (oväntat), då visas ingen deadline-rad (fail-safe).
   */
  deadlineIso: string | null;
  /** Injicerbart "nu" (testbarhet) för deadline-radens relativa etikett, default nuet. */
  now?: Date;
  /**
   * FÖRSLAG på 1:a/2:a UR mina tippade matchresultat (T65, #119), eller null när
   * gruppens matcher INTE alla är tippade (då går inget ärligt förslag att räkna).
   * Driver "Föreslå ur mina matchtips"-knappen: satt -> knappen aktiv, ett klick
   * FÖRIFYLLER väljarna (sparar ALDRIG, det är användarens egen Spara-handling).
   * null -> knappen inaktiverad med ärlig text ("tippa gruppens alla matcher först").
   * Utelämnad (undefined) -> ingen förslags-knapp alls (vyer utan match-tips-lager).
   */
  suggestion?: GroupSuggestion | null;
  /**
   * Spara mitt grupp-tips. Kastar vid fel (formuläret visar det inline). Returnerar
   * en Promise så formuläret kan visa "sparar..."/fel-tillstånd.
   */
  onSubmit: (groupId: string, winnerCode: string, runnerUpCode: string) => Promise<void>;
}

// Väljar-fältet: SAMMA premium-formspråk som T15 (stark tema-trogen fokus-ring,
// WCAG 2.4.7, mjuk hover). Färgen är accent (interaktions-affordans, inte status),
// så T7-pinnen hålls ren.
const FIELD_BASE =
  'rounded-md border border-border bg-bg text-fg transition-colors duration-150 ' +
  'outline-none focus-visible:border-accent ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] ' +
  'hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))] ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const SELECT = `${FIELD_BASE} h-11 w-full px-3 text-sm`;

/**
 * Biljett-/kupong-ikonen (kupong-huvudets dekor-glyf), samma som T15:s tips-kupong
 * så grupp-tipset och match-tipset delar signatur. Ren dekoration (aria-hidden).
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
 * Hänglås-ikonen (låst-läget), samma som T15. Ren dekoration (aria-hidden); låst-
 * etikettens text bär betydelsen. Får en lugn engångs-puls via .vm-coupon-lock-icon
 * (nollad vid reducerad rörelse).
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

/** Slå upp ett lags visningsnamn ur dess kod (för podium-sammanfattningen). */
function nameFor(code: string, teams: readonly GroupTeamOption[]): string {
  return teams.find((t) => t.code === code)?.name ?? code;
}

/**
 * En PLATS-rad i kupongen: medalj (1 guld / 2 silver) + etikett + TeamFlag-
 * förhandsvisning av det valda laget + väljaren. Medaljen + den medalj-tonade
 * vänsterkanten gör pallplatsen tydlig; flaggan visar valet visuellt direkt.
 */
function PodiumSlot({
  place,
  label,
  selectId,
  dataAttr,
  value,
  onChange,
  teams,
  error,
  describedBy,
}: {
  place: 1 | 2;
  label: string;
  selectId: string;
  dataAttr: 'winner' | 'runner-up';
  value: string;
  onChange: (v: string) => void;
  teams: readonly GroupTeamOption[];
  error: boolean;
  describedBy: string | undefined;
}) {
  const gold = place === 1;
  // Medalj-färgad TEXT (etiketten) använder den AA-mätta tonen per medalj, aldrig
  // den råa dekor-färgen (guld/silver-på-ljus-fällan, lessons aa-kontrast).
  const labelColor = gold ? 'var(--color-warning)' : 'var(--vm-silver-text)';
  // Väljar-attributet (data-group-prediction-winner / -runner-up) är design-haken
  // OCH testkontraktet, bevarat exakt.
  const selectProps =
    dataAttr === 'winner'
      ? { 'data-group-prediction-winner': '' }
      : { 'data-group-prediction-runner-up': '' };

  return (
    <div
      className={`vm-pool-slot vm-pool-slot--${gold ? 'gold' : 'silver'} flex flex-col gap-1.5 pl-2.5`}
    >
      <div className="flex items-center gap-2">
        {/* Medaljen: plats-siffra i mörk ink på solid medalj-yta (AA-säker, T9/T11). */}
        <span
          aria-hidden="true"
          className={`vm-pool-medal vm-pool-medal--${gold ? 'gold' : 'silver'} h-5 w-5 rounded-pill text-[0.6875rem]`}
        >
          {place}
        </span>
        <label
          htmlFor={selectId}
          className="text-[0.8125rem] font-semibold"
          style={{ color: labelColor }}
        >
          {label}
        </label>
      </div>
      {/* min-w-0 på flex-raden + select: ett <select> krymper annars inte under sin
          längsta <option> (intrinsisk min-content), vilket spränger kolumnen på
          smal skärm (vikbar cover, 280px). min-w-0 låter select:en följa sin
          w-full-bredd och truncera options-texten i stället för att tvinga overflow. */}
      <div className="flex min-w-0 items-center gap-2">
        {/* TeamFlag-förhandsvisning av valt lag (eller en lugn platshållar-disc om
            inget valts än), så valet syns visuellt , flaggan är ren dekor (aria-hidden
            i TeamFlag), lagnamnet bärs av väljaren. */}
        {value ? (
          <TeamFlag code={value} size="sm" />
        ) : (
          <span
            aria-hidden="true"
            className="h-7 w-7 shrink-0 rounded-pill border border-dashed border-border"
          />
        )}
        <select
          id={selectId}
          name={dataAttr === 'winner' ? 'winner' : 'runnerUp'}
          {...selectProps}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${SELECT} min-w-0`}
        >
          <option value="">Välj lag…</option>
          {teams.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function GroupPredictionForm({
  groupId,
  teams,
  current,
  locked,
  deadlineIso,
  now,
  suggestion,
  onSubmit,
}: GroupPredictionFormProps) {
  // Seeda väljarna från mitt nuvarande tips (redigera = se det jag tippat).
  const [winner, setWinner] = useState<string>(current?.winnerCode ?? '');
  const [runnerUp, setRunnerUp] = useState<string>(current?.runnerUpCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // SENAST SPARADE tips-snapshot (T68/#129 punkt 13): driver "Osparade ändringar"-
  // indikatorn. Skiljer sig formulärets state från detta -> osparade ändringar. Seedas
  // ur mitt sparade tips (current) och uppdateras vid en lyckad Spara (och när ett
  // externt uppdaterat tips synkas in nedan), så jämförelsen är mot vad som FAKTISKT är
  // sparat, inte mot ett gammalt utgångsvärde. dirtyRef styr fortfarande den externa
  // seed-synken (rör inte användarens halvfärdiga val); dirty-INDIKATORN härleds av
  // snapshot-jämförelsen, så den är sann även efter att man redigerat tillbaka till
  // det sparade värdet (då försvinner indikatorn, korrekt: inget osparat kvar).
  const dirtyRef = useRef(false);
  const [savedWinner, setSavedWinner] = useState<string>(current?.winnerCode ?? '');
  const [savedRunnerUp, setSavedRunnerUp] = useState<string>(current?.runnerUpCode ?? '');
  const seedWinner = current?.winnerCode ?? '';
  const seedRunnerUp = current?.runnerUpCode ?? '';
  useEffect(() => {
    // Ett externt uppdaterat tips (t.ex. realtid) flyttar BÅDE väljarna OCH snapshoten,
    // så indikatorn inte felaktigt larmar "osparat" mot ett föråldrat snapshot.
    setSavedWinner(seedWinner);
    setSavedRunnerUp(seedRunnerUp);
    if (dirtyRef.current) {
      return;
    }
    setWinner(seedWinner);
    setRunnerUp(seedRunnerUp);
  }, [seedWinner, seedRunnerUp]);

  // OSPARADE ÄNDRINGAR: formulärets val skiljer sig från det senast sparade. Visas bara
  // i öppet läge (en låst grupp går inte att ändra, så "osparat" är inte relevant där).
  const dirty = winner !== savedWinner || runnerUp !== savedRunnerUp;

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

  /**
   * FÖRIFYLL 1:a/2:a ur mitt match-tips-förslag (T65, #119). Detta är ENBART en
   * formulär-förändring: vi sätter väljarna och markerar formuläret "dirty" (så den
   * externa seed-effekten inte skriver över valet), men anropar ALDRIG onSubmit.
   * Användaren trycker själv Spara, precis som vid vanlig redigering (aldrig auto-spar,
   * HARD-regel i issuen). Inaktiv när inget förslag finns (knappen är då disabled).
   */
  function applySuggestion() {
    if (!suggestion) {
      return;
    }
    dirtyRef.current = true;
    setSaved(false);
    setError(null);
    setWinner(suggestion.winnerCode);
    setRunnerUp(suggestion.runnerUpCode);
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
      // Uppdatera snapshoten till det nyss sparade -> "Osparade ändringar" försvinner.
      setSavedWinner(winner);
      setSavedRunnerUp(runnerUp);
      setSaved(true);
    } catch (err) {
      // Fail loud: ett serverfel (gruppen hann låsas på deadline-sekunden, RLS
      // nekade) visas begripligt, inte en tyst miss.
      setError(err instanceof Error ? err.message : 'Kunde inte spara grupp-tipset.');
    }
  }

  const describedBy =
    [error ? errorId : null, locked ? lockId : null].filter(Boolean).join(' ') || undefined;

  // Är mitt podium komplett (båda platser valda, olika lag)? Styr om sparat-podiumet
  // (den stolta sammanfattningen) visas, både i låst läge och efter ett sparat tips.
  const hasPodium = winner !== '' && runnerUp !== '' && winner !== runnerUp;

  // PODIUM-SAMMANFATTNINGEN: guld-medalj + 1:ans lag, silver-medalj + 2:ans lag.
  // Återanvänds i låst-läget (mitt tips står kvar synligt) och efter ett sparat tips.
  const podiumSummary = hasPodium ? (
    <div className="vm-pool-podium flex items-stretch gap-2.5 rounded-md px-3 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          aria-hidden="true"
          className="vm-pool-medal vm-pool-medal--gold h-5 w-5 shrink-0 rounded-pill text-[0.6875rem]"
        >
          1
        </span>
        <TeamFlag code={winner} size="sm" />
        <span className="min-w-0 truncate text-[0.8125rem] font-semibold text-fg">
          {nameFor(winner, teams)}
        </span>
      </div>
      <span aria-hidden="true" className="vm-pool-podium-divider" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          aria-hidden="true"
          className="vm-pool-medal vm-pool-medal--silver h-5 w-5 shrink-0 rounded-pill text-[0.6875rem]"
        >
          2
        </span>
        <TeamFlag code={runnerUp} size="sm" />
        <span className="min-w-0 truncate text-[0.8125rem] font-semibold text-fg">
          {nameFor(runnerUp, teams)}
        </span>
      </div>
    </div>
  ) : null;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-group-prediction-form=""
      data-group-id={groupId}
      data-group-prediction-locked={locked || undefined}
      // PODIUM-KUPONG (T16): ärver .vm-coupon-card-fonden (guld-hörn-glow, topplist,
      // hover-lyft, låst-dämpning, tokens.css §10) så grupp-tipset hör tydligt till
      // SAMMA tips-kupong-familj som match-tipset (DRY). Guld-tonad vilo-kant skiljer
      // den varma kupongen från resultat-kortets gröna scoreboard.
      className="vm-coupon-card flex h-full flex-col gap-3 rounded-card border border-[color-mix(in_srgb,var(--vm-gold)_22%,var(--color-border))] p-4 transition-[border-color] duration-300 hover:border-[color-mix(in_srgb,var(--vm-gold)_40%,var(--color-border))]"
    >
      <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" disabled={locked}>
        {/* KUPONG-HUVUDET: "POOL"-eyebrow + biljett-ikon ovanför grupp-rubriken, så
            kortet läses som en del av VM-kupongen. FÄRG: --color-warning (AA-säker
            guld-text-ton), INTE rå --vm-gold (guld-på-ljus-fällan, lessons). */}
        <p
          aria-hidden="true"
          className="flex items-center gap-1.5 font-display text-[0.625rem] font-bold uppercase leading-none tracking-[0.2em] text-warning"
        >
          <CouponTicketIcon />
          Pool
        </p>

        {/* legend namnger inmatningen för skärmläsare. Visuellt grupp-rubriken med en
            liten guld kupong-prick (samma signatur-detalj som T15). */}
        <legend className="flex items-center gap-2 font-display text-sm font-semibold leading-tight">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-pill"
            style={{ backgroundColor: 'var(--vm-gold)' }}
          />
          Grupp {groupId}
        </legend>

        {/* RIVER-LINJEN: kupongens avrivnings-perforering (delad med T15), skiljer
            huvudet från ifyllnads-zonen. Ren dekoration (aria-hidden). */}
        <div aria-hidden="true" className="vm-coupon-tear -mx-0.5 rounded-pill" />

        {/* LÅST-läget (taskens punkt 2): elegant + POSITIVT. Hänglås + dämpad guld-yta,
            mitt podium står KVAR synligt under etiketten. data-group-prediction-lock
            är design-haken + testkontraktet. aria-describedby kopplar den till väljarna.
            Väljarna nedan renderas fortfarande (men disabled via fieldset), så en
            skärmläsare/tangentbordsanvändare ser vad jag tippat, samma kontrakt som T15. */}
        {locked ? (
          <div className="flex flex-col gap-2.5">
            <div
              id={lockId}
              data-group-prediction-lock=""
              className="m-0 flex items-start gap-2.5 rounded-md border border-[color-mix(in_srgb,var(--vm-gold)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_7%,var(--color-bg))] px-3 py-2.5"
            >
              <span className="mt-0.5 shrink-0 text-warning">
                <CouponLockIcon />
              </span>
              <p className="m-0 text-[0.8125rem] font-semibold leading-snug text-fg">
                Grupp-tipset är låst, gruppspelet har börjat.{' '}
                <span className="font-medium text-fg-muted">
                  Låst vid gruppens första match, så alla tippar blint.
                </span>{' '}
                {hasPodium ? null : (
                  <span className="text-fg-muted">Du hann inte tippa den här gruppen.</span>
                )}
              </p>
            </div>
            {/* Mitt tips står kvar synligt som ett STOLT podium även när gruppen är låst. */}
            {podiumSummary}
          </div>
        ) : null}

        {/* PODIUM-VÄLJARNA: 1:a (guld) + 2:a (silver), var och en med sin medalj +
            TeamFlag-förhandsvisning. Renderas ALLTID (även låst, då disabled via
            fieldset) så låst-kontraktet håller: väljarna finns + är disabled. I låst
            läge döljs de visuellt så podiumet ovan är det man ser, men de finns kvar
            i DOM:en för a11y + testkontraktet. */}
        <div className={locked ? 'sr-only' : 'flex flex-col gap-3'}>
          {/* DEADLINE-RADEN (AC#3): säg KLART när gruppen låses (gruppens första match),
              ur SAMMA deadlineIso som driver låset (en sanning). Bara i öppet läge, i
              låst läge säger låst-etiketten ovan redan "låst". */}
          {!locked ? (
            <DeadlineNotice deadlineIso={deadlineIso} now={now} lead="Tippningen låses" />
          ) : null}
          <PodiumSlot
            place={1}
            label="Gruppvinnare (1:a)"
            selectId={winnerId}
            dataAttr="winner"
            value={winner}
            onChange={(v) => edit(setWinner)(v)}
            teams={teams}
            error={error !== null}
            describedBy={describedBy}
          />
          <PodiumSlot
            place={2}
            label="Grupptvåa (2:a)"
            selectId={runnerUpId}
            dataAttr="runner-up"
            value={runnerUp}
            onChange={(v) => edit(setRunnerUp)(v)}
            teams={teams}
            error={error !== null}
            describedBy={describedBy}
          />

          {/* FÖRSLAGS-KNAPPEN (T65, #119): förifyll 1:a/2:a ur mina tippade matchresultat.
              Bara i öppet läge (en låst grupp har ingen knapp, formuläret är ändå låst).
              Renderas bara när match-tips-lagret finns (suggestion !== undefined). Aktiv
              när ett komplett förslag finns; annars disabled med ärlig text ("tippa
              gruppens alla matcher först"), gissa ALDRIG. Ett klick fyller bara i
              fälten, det sparar aldrig (data-attributet är test/design-haken). */}
          {!locked && suggestion !== undefined ? (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                data-group-prediction-suggest=""
                disabled={suggestion === null}
                onClick={applySuggestion}
                aria-describedby={suggestion === null ? `${baseId}-suggest-hint` : undefined}
                className="inline-flex h-10 items-center gap-2 self-start rounded-pill border border-[color-mix(in_srgb,var(--vm-gold)_40%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_8%,var(--color-surface))] px-4 font-display text-[0.8125rem] font-semibold text-fg shadow-sm transition-[transform,box-shadow,filter,border-color] duration-150 outline-none hover:border-[color-mix(in_srgb,var(--vm-gold)_60%,var(--color-border))] hover:shadow-[var(--vm-shadow-raised)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--vm-gold)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:border-[color-mix(in_srgb,var(--vm-gold)_40%,var(--color-border))]"
              >
                {/* Glittrande "förslag"-glyf (gnista), ren dekoration (aria-hidden). */}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  className="h-4 w-4 shrink-0 text-warning"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 1.5l1.4 3.6L13 6.5l-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4z" />
                  <path d="M12.5 11l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" />
                </svg>
                Föreslå ur mina matchtips
              </button>
              {/* Ärlig förklaring när förslaget inte går att räkna (ofullständigt tippad
                  grupp). Hinten kopplas till knappen via aria-describedby, en ren
                  beskrivnings-relation (ingen role sätts, review-F1: kommentaren ska
                  inte påstå ARIA-semantik som koden inte skriver). */}
              {suggestion === null ? (
                <p
                  id={`${baseId}-suggest-hint`}
                  data-group-prediction-suggest-hint=""
                  className="m-0 text-[0.75rem] leading-snug text-fg-muted"
                >
                  Tippa gruppens alla matcher först, så kan vi föreslå 1:an och 2:an ur dina
                  resultat.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Sparat-podiumet (stolt sammanfattning) när ett tips just sparats (öppet läge). */}
          {!locked && saved && hasPodium ? podiumSummary : null}

          {/* Kontroll-spåret: Spara + osparat-indikator / sparat-kvitto. Bara i öppet läge. */}
          {!locked ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="submit"
                data-group-prediction-save=""
                className="h-11 rounded-pill bg-accent px-6 font-display text-sm font-semibold text-accent-fg shadow-[var(--vm-shadow-button)] transition-[transform,box-shadow,filter] duration-150 outline-none hover:brightness-105 hover:shadow-[var(--vm-shadow-raised)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] active:translate-y-px active:brightness-95"
              >
                {/* ALLTID "Spara grupptips", aldrig "Ändra" (T68/#129 punkt 13, Daniels
                    uttryckliga krav). Ett tips ändras genom att man Sparar om, så samma
                    verb varje gång är ärligare än "Ändra" (som antyder en separat handling),
                    och "Osparade ändringar"-indikatorn nedan bär informationen om att något
                    är oslarat i stället. INGEN auto-spar (dirigentens beslut). */}
                Spara grupptips
              </button>
              {/* OSPARADE ÄNDRINGAR (T68/#129 punkt 13): tydlig indikator när formuläret
                  skiljer sig från det senast sparade. role="status" så den annonseras
                  artigt när den dyker upp. Guld-tonad (samma tips-kupong-ton som rubriken,
                  --color-warning = AA-säker guld-text), inte danger (det är inte ett fel,
                  bara en påminnelse att spara). Försvinner när man sparat eller redigerat
                  tillbaka till det sparade värdet (dirty härleds av snapshot-jämförelsen).
                  Sparat-kvittot visas bara när INTE dirty (annars vore det motsägelsefullt). */}
              {dirty ? (
                <span
                  role="status"
                  data-group-prediction-dirty=""
                  className="inline-flex items-center gap-1.5 rounded-pill border border-[color-mix(in_srgb,var(--vm-gold)_35%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_8%,transparent)] px-3 py-1.5 font-display text-[0.8125rem] font-semibold leading-none text-warning"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-pill"
                    style={{ backgroundColor: 'var(--vm-gold)' }}
                  />
                  Osparade ändringar
                </span>
              ) : saved ? (
                <span
                  role="status"
                  data-group-prediction-saved=""
                  className="vm-coupon-mine inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-display text-[0.8125rem] font-bold leading-none shadow-sm"
                >
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
                  Sparat
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Fel-listan: role="alert" (fail loud), kopplad till väljarna via aria.
            Egen yta i danger-ton (semantiskt token, INTE accent/guld), blandad mot
            OPAK surface så kupongens guld-glow inte sänker fel-textens kontrast
            (canvas-komposit-fälla, T15-lärdomen). */}
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
