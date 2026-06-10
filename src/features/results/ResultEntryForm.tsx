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

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Match, MatchStatus, Team } from '../../domain/types';
import type { ResultEntry, ResultValidationError, ResultValidationField } from './validate-result';

/**
 * Är detta en slutspelsmatch? Bara där kan en lika ordinarie ställning kräva en
 * straffläggning (FIFA Article 14). En sanning som styr om straff-fälten visas.
 */
function isKnockout(match: Match): boolean {
  return match.stage !== 'group';
}

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

// Score-rutans delade klasser: kompakt, men ett bekvämt touch-mål (48px hög,
// över 44px-tröskeln, WCAG 2.5.5) och stark display-siffra. w-16 (64px) är LÅST
// av strukturtestet (#39): den fasta rut-bredden är det som håller kolumnerna i
// linje kort för kort, så ett långt lagnamn aldrig kan knuffa scoreboarden.
const SCORE_INPUT = `${FIELD_BASE} h-12 w-16 px-2 text-center font-display text-[1.375rem] font-bold leading-none tabular-nums`;

// Lag-etikettens delade klasser: en avsiktlig ellipsis (truncate är LÅST av
// #39-testet), dämpad ton + tight tracking så ett kapat namn läses som DESIGN,
// inte som ett tryckfel. Fullt namn via title (+ labelns text åt skärmläsaren).
const TEAM_LABEL =
  'min-w-0 truncate text-[0.8125rem] leading-tight tracking-[0.01em] text-fg-muted';

// FIFA-landskodens chip: liten, kompakt monogram-bricka i fg-ton (samma recept
// som grupptabellens kod-chip, en sanning för lag-identitet). Texten bär full
// fg-kontrast, tonen lever bara i bakgrunden, så chipet är AA oavsett tema.
const CODE_CHIP =
  'shrink-0 rounded-sm px-1 py-0.5 font-display text-[0.625rem] font-bold leading-none tracking-wider';

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

/**
 * Härled formulärets fält-strängar ur matchens NUVARANDE läge. EN sanning för
 * både den initiala seedningen (useState-init) OCH den externa synkningen
 * (useEffect), så de aldrig kan drifta isär (DRY). Ett tomt resultat -> tomma
 * fält, ett inmatat resultat -> dess värden som strängar.
 */
function seedFields(match: Match): {
  homeGoals: string;
  awayGoals: string;
  status: MatchStatus;
  homePens: string;
  awayPens: string;
} {
  return {
    homeGoals: match.result ? String(match.result.homeGoals) : '',
    awayGoals: match.result ? String(match.result.awayGoals) : '',
    status: match.status,
    homePens: match.result?.penalties ? String(match.result.penalties.homeGoals) : '',
    awayPens: match.result?.penalties ? String(match.result.penalties.awayGoals) : '',
  };
}

export function ResultEntryForm({ match, teamsById, onSubmit, onSaved }: ResultEntryFormProps) {
  const home = teamName(match.homeTeamId, teamsById);
  const away = teamName(match.awayTeamId, teamsById);
  const homeCode = teamCode(match.homeTeamId, teamsById);
  const awayCode = teamCode(match.awayTeamId, teamsById);

  // Seeda formuläret från matchens NUVARANDE läge (redigera = se det inmatade).
  // EN seedningskälla (seedFields) för både init och den externa synkningen nedan.
  const seed = seedFields(match);
  const [homeGoals, setHomeGoals] = useState<string>(seed.homeGoals);
  const [awayGoals, setAwayGoals] = useState<string>(seed.awayGoals);
  const [status, setStatus] = useState<MatchStatus>(seed.status);
  // Straffmål (bara slutspel), seedade från ett ev. inmatat penalties-resultat.
  const [homePens, setHomePens] = useState<string>(seed.homePens);
  const [awayPens, setAwayPens] = useState<string>(seed.awayPens);
  const [errors, setErrors] = useState<ResultValidationError[]>([]);

  // DIRTY-flagga (C7/C8): true så fort användaren rört ETT fält och ännu inte
  // sparat. Den styr den externa synkningen nedan, så ett pågående lokalt edit
  // ALDRIG klottras över av en extern matchuppdatering. En ref (inte state): den
  // läses bara i effekten och ska inte trigga en re-render när den ändras.
  const dirtyRef = useRef(false);

  // Synka formuläret med matchens NUVARANDE värden när matchen UPPDATERAS EXTERNT
  // (t.ex. realtid T18, eller att samma match ändras i den delade storen). Utan
  // detta seedades fälten BARA vid mount, så ett externt resultat (inkl. straffar,
  // C8) visades aldrig i ett redan monterat formulär. VARFÖR `!dirtyRef.current`:
  // har användaren ett OSPARAT edit på gång ska en extern uppdatering inte rycka
  // undan det, vi synkar bara när formuläret är "rent". Effekten beror på de
  // RÅA match-värdena (inte på match-referensen), så en ny match-array med samma
  // värden inte trigger:ar en onödig re-seed. Goals OCH straffar synkas tillsammans,
  // så de två fältgrupperna behandlas konsekvent (C8).
  const { homeGoals: seedHome, awayGoals: seedAway } = seed;
  const seedStatus = seed.status;
  const { homePens: seedHomePens, awayPens: seedAwayPens } = seed;
  useEffect(() => {
    if (dirtyRef.current) {
      return;
    }
    setHomeGoals(seedHome);
    setAwayGoals(seedAway);
    setStatus(seedStatus);
    setHomePens(seedHomePens);
    setAwayPens(seedAwayPens);
    // Beror på de råa seed-värdena: synkar om bara när matchens faktiska data ändras.
  }, [seedHome, seedAway, seedStatus, seedHomePens, seedAwayPens]);

  // Unika, stabila fält-id:n så <label htmlFor> och aria-describedby pekar rätt
  // även när flera matcher renderas samtidigt (a11y).
  const baseId = useId();
  const homeId = `${baseId}-home`;
  const awayId = `${baseId}-away`;
  const statusId = `${baseId}-status`;
  const homePensId = `${baseId}-home-pens`;
  const awayPensId = `${baseId}-away-pens`;
  const errorsId = `${baseId}-errors`;

  // Straff-fälten visas bara när en straffläggning är RELEVANT: en slutspelsmatch
  // som matas in som spelad (finished) med lika ordinarie ställning (FIFA Art. 14).
  // Härleds reaktivt ur de inmatade fälten, så fälten dyker upp i samma ögonblick
  // som användaren skriver in en lika ställning. Tomma/ogiltiga mål -> inte lika.
  const showPenalties = useMemo(() => {
    if (!isKnockout(match) || status !== 'finished') {
      return false;
    }
    const h = parseGoals(homeGoals);
    const a = parseGoals(awayGoals);
    // Mål måste vara icke-negativa heltal (>= 0). Number.isInteger ensamt godtar
    // negativa heltal, så straff-fälten kunde annars visas vid t.ex. -1 mot -1.
    return (
      h !== null &&
      a !== null &&
      Number.isInteger(h) &&
      Number.isInteger(a) &&
      h >= 0 &&
      a >= 0 &&
      h === a
    );
  }, [match, status, homeGoals, awayGoals]);

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

  // Varje fält-setter går via denna så DIRTY-flaggan sätts vid första lokala
  // ändringen. Då vet sync-effekten att det finns ett osparat edit att skydda.
  function edit<T>(setter: (value: T) => void): (value: T) => void {
    return (value: T) => {
      dirtyRef.current = true;
      setter(value);
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entry: ResultEntry = {
      homeGoals: parseGoals(homeGoals),
      awayGoals: parseGoals(awayGoals),
      status,
      // Ta BARA med straffar när de är RELEVANTA (slutspel, finished, lika), annars
      // UTELÄMNA fältet helt. Att inte skicka penalties betyder "ingen straffläggning",
      // så ett gammalt straff-värde som ligger kvar i state efter att ställningen
      // ändrats till avgjord aldrig läcker in i inmatningen. Den synliga formen
      // (showPenalties) styr inmatningens form, en sanning.
      ...(showPenalties
        ? { penalties: { homeGoals: parseGoals(homePens), awayGoals: parseGoals(awayPens) } }
        : {}),
    };
    const result = onSubmit(match.id, entry);
    if (result.ok) {
      setErrors([]);
      // Sparat: formuläret är inte längre "smutsigt". Nästa externa uppdatering av
      // matchen (storen återspeglar nu sparningen, ev. realtid T18) får synka in.
      dirtyRef.current = false;
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
      // "Arena i kvällsljus"-finish (#39): kortet är KOMPAKT (tightare padding +
      // gap än det luftiga utgångsläget) och bär en diskret premium-yta, en svag
      // varm topp-list (inset box-shadow i guld-ton) som fångar "kvällsljuset"
      // utan att bli en grell kant. Skuggorna ligger i KLASSEN (inte inline) så
      // hover-lyftet faktiskt kan överskrida vilo-skuggan, inline-style hade
      // vunnit över :hover-utility:n och fryst skuggan. color-mix mot tokens, så
      // den följer temat och dämpas rent i ljust läge. Hover lyfter kortet
      // (starkare skugga + en aning klarare accent-kant) så listan känns
      // interaktiv utan att skrika.
      className="group/form flex flex-col gap-3 rounded-card border border-border bg-surface p-3.5 shadow-[var(--vm-shadow-card),inset_0_1px_0_0_color-mix(in_srgb,var(--vm-gold)_22%,transparent)] transition-[box-shadow,border-color] duration-300 hover:border-[color-mix(in_srgb,var(--color-accent)_28%,var(--color-border))] hover:shadow-[var(--vm-shadow-raised),inset_0_1px_0_0_color-mix(in_srgb,var(--vm-gold)_34%,transparent)] sm:p-5"
    >
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        {/* legend namnger hela inmatningen för skärmläsare (vilka lag). Visuellt
            är den matchens rubrik med en liten gräsplan-grön puls-prick. legend
            ligger utanför grid:en nedan så den spänner hela kortets bredd. */}
        <legend className="flex items-center gap-2 font-display text-sm font-semibold leading-tight tracking-[-0.01em] sm:text-[0.9375rem]">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-pill"
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
          className="grid grid-cols-[auto_auto_auto] items-end justify-center gap-x-2.5 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:justify-between sm:gap-x-4"
        >
          {/* Kontroller: status-väljare + spara. Spänner hela score-raden på mobil
              (col-span-3, under scoreboarden) men sitter i sitt eget flexibla spår
              på desktop (col 1, vänster). Det är detta spår, INTE lag-kolumnerna,
              som tar upp kortets variabla bredd, så score-rutorna står still. */}
          <div className="order-2 col-span-3 flex flex-wrap items-end justify-center gap-2.5 sm:order-1 sm:col-span-1 sm:justify-start">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={statusId}
                className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-fg-muted"
              >
                Status
              </label>
              <select
                id={statusId}
                name="status"
                value={status}
                onChange={(e) => edit(setStatus)(e.target.value as MatchStatus)}
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
              className="ml-auto h-11 self-end rounded-pill bg-accent px-6 font-display text-sm font-semibold text-accent-fg shadow-sm transition-[transform,box-shadow,filter] duration-150 outline-none hover:brightness-105 hover:shadow-[var(--vm-shadow-raised)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] active:translate-y-px active:brightness-95"
            >
              Spara
            </button>
          </div>

          {/* Hemma-lag (grid-cell, FAST bredd via input-spåret). Namnet truncar
              inom rut-bredden (w-16): ett långt lagnamn klipps med ellipsis i
              stället för att knuffa rutan, fullt namn via title + labelns text. */}
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
              {/* min-w-0 + truncate: tillåt krympning under innehållets bredd så
                  ellipsisen slår in i stället för att spräcka grid-cellen. title
                  ger fullt namn vid hover (labelns text ger det åt skärmläsaren). */}
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
              aria-invalid={invalid('home') || undefined}
              aria-describedby={describedBy('home')}
              className={SCORE_INPUT}
            />
          </div>

          {/* "mot"-avdelaren (grid-cell, fast). Vertikalt mot rutorna: pb lyfter
              den från label-raden så den linjerar mot mitten av score-rutorna
              (48px höga nu), inte mot namnen. Dämpad guld-ton ger den en diskret
              "mot"-signatur i stället för en grå etikett, kvällsljus-detaljen. */}
          <span
            aria-hidden="true"
            className="order-1 self-end pb-3 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.18em] sm:order-2 sm:self-center sm:pb-0"
            // Guld-skiftad "mot": en varm kvällsljus-detalj i stället för en grå
            // etikett. Blandningen lutar mot fg-muted (AA-säker bastext-ton) så
            // även ljust tema håller AA som normal text (uppmätt 4.5:1+, se
            // handoff), gulden ger karaktären utan att sänka läsbarheten.
            style={{ color: 'color-mix(in srgb, var(--vm-gold) 52%, var(--color-fg-muted))' }}
          >
            mot
          </span>

          {/* Borta-lag: speglad layout, samma truncate-inom-rut-bredd. */}
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
              aria-invalid={invalid('away') || undefined}
              aria-describedby={describedBy('away')}
              className={SCORE_INPUT}
            />
          </div>
        </div>

        {/* Straffläggning (FIFA Article 14): visas BARA för en slutspelsmatch som
            matas in som spelad med lika ordinarie ställning. data-penalties-row är
            en stabil hake för design-frontend (och tester). Layout speglar score-
            raden: hemma-straff / "straffar" / borta-straff, fast bredd så det
            linjerar med score-rutorna ovanför. */}
        {showPenalties ? (
          <div data-penalties-row="" className="flex items-end justify-center gap-2.5">
            <div className="flex w-16 flex-col items-center gap-1">
              <label
                htmlFor={homePensId}
                className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-fg-muted"
              >
                Straff
                <span className="sr-only"> {home}</span>
              </label>
              <input
                id={homePensId}
                name="homePenalties"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={homePens}
                onChange={(e) => edit(setHomePens)(e.target.value)}
                aria-invalid={invalid('penalties') || undefined}
                aria-describedby={describedBy('penalties')}
                className={SCORE_INPUT}
              />
            </div>
            <span
              aria-hidden="true"
              className="self-end pb-3 font-display text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-fg-muted"
            >
              straffar
            </span>
            <div className="flex w-16 flex-col items-center gap-1">
              <label
                htmlFor={awayPensId}
                className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-fg-muted"
              >
                Straff
                <span className="sr-only"> {away}</span>
              </label>
              <input
                id={awayPensId}
                name="awayPenalties"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={awayPens}
                onChange={(e) => edit(setAwayPens)(e.target.value)}
                aria-invalid={invalid('penalties') || undefined}
                aria-describedby={describedBy('penalties')}
                className={SCORE_INPUT}
              />
            </div>
          </div>
        ) : null}

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
