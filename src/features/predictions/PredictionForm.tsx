// Tillgängligt tips-FORMULÄR för EN match (FUNKTIONELLT + a11y-lager, T15, #15).
//
// FOKUS (senior-devs lager): KORREKT, TILLGÄNGLIG tips-inmatning + fel-vägar +
// LÅST-läge. Samma fast-bredds score-grid som resultatinmatningen (#39): lagnamn
// truncar och knuffar aldrig rutorna, stark fokus-ring, stabila data-attribut.
// Skillnaden mot resultat: detta är en GISSNING före avspark, inte ett facit, så
// inga straffar och ingen status-väljare, och efter avspark är formuläret LÅST.
//
// VISUELL DESIGN (design-frontend-agentens lager, T15): en EGEN identitet , en
// TIPS-KUPONG. Resultatinmatningen är "arenan/scoreboarden" (grön pitch); tips-
// kortet är "kupongen i handen" (varm pokal-guld), en spelkupong man fyller i FÖRE
// avspark och hoppas på. Kupong-metaforen bärs av rena dekor-lager (guld topp-strip,
// streckad river-linje, guld-hörn-glow) i tokens.css (.vm-coupon-*), så STRUKTUREN
// här är ren och stabil: stabila roller + data-attribut, inga inbakade statusfärger
// (T7-pin: accent === success i ljust tema). Spar-knappen behåller den gröna
// accenten (interaktions-affordans, inte status), kortets signatur är guld.

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Match, Team } from '../../domain/types';
import { MatchContextRow } from '../results/MatchContextRow';
import { isFinished } from '../daily';
import {
  matchPointLabel,
  outcomeOf,
  pointTypeOf,
  scorePrediction,
  type MatchPointType,
} from '../../data/predictions';

// Delade fält-klasser, SAMMA premium-formspråk som resultatinmatningen (#39):
// stark tema-trogen fokus-ring (WCAG 2.4.7), mjuk hover. Färgen är accent
// (interaktions-affordans, inte status), så T7-pinnen hålls ren.
const FIELD_BASE =
  'rounded-md border border-border bg-bg text-fg transition-colors duration-150 ' +
  'outline-none focus-visible:border-accent ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] ' +
  'hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))] ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

// Score-rutan: kompakt men bekvämt touch-mål (48px hög, > 44px WCAG 2.5.5), stark
// display-siffra. w-16 (64px) är den fasta rut-bredden som håller kolumnerna i linje
// kort för kort (samma #39-invariant), så ett långt lagnamn aldrig knuffar rutorna.
const SCORE_INPUT = `${FIELD_BASE} h-12 w-16 px-2 text-center font-display text-[1.375rem] font-bold leading-none tabular-nums`;

// Lag-etiketten: avsiktlig ellipsis (truncate), dämpad ton + tight tracking så ett
// kapat namn läses som DESIGN, inte tryckfel. Fullt namn via title + labelns text.
const TEAM_LABEL =
  'min-w-0 truncate text-[0.8125rem] leading-tight tracking-[0.01em] text-fg-muted';

// FIFA-landskodens chip: kompakt monogram-bricka, texten bär full fg-kontrast,
// tonen lever bara i bakgrunden (AA oavsett tema, samma recept som #39:s code-chip).
const CODE_CHIP =
  'shrink-0 rounded-sm px-1 py-0.5 font-display text-[0.625rem] font-bold leading-none tracking-wider';

/**
 * JOKER-läget för EN match-kupong (T19, #19). Härlett ur joker-storen + match-dagen i
 * den anropande vyn, så formuläret bara RENDERAR det (ingen store-koppling här, samma
 * tunna-komponent-anda som resten). Optional: utelämnas i fixtures-/icke-rum-läge, då
 * visas ingen joker-kontroll (en kupong utan joker-läge ser ut precis som förr).
 */
export interface JokerControl {
  /** Är DENNA match min joker (poängen dubblas)? */
  isJoker: boolean;
  /**
   * Har jag redan en joker en ANNAN match SAMMA omgång (svensk dag)? Då byter ett klick
   * här jokern hit (en per dag). UI:t förklarar det ("flytta din joker hit"). null = jag
   * har ingen joker den dagen än (då SÄTTER ett klick jokern).
   */
  otherJokerSameDayMatchLabel: string | null;
  /** Sätt/flytta jokern hit (eller ångra om den redan är här). Kastar vid fel. */
  onToggle: () => Promise<void>;
}

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
  /**
   * JOKER-kontrollen (T19, #19), eller utelämnad om joker-läget inte är aktivt (fixtures
   * / inget rum). När den finns visas en stjärn-toggle på en ÖPPEN kupong ("din joker
   * idag"), och en låst-etikett visar om jokern gällde just denna match efter avspark.
   */
  joker?: JokerControl;
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

/**
 * Poäng-resultatet för MITT tips på en AVGJORD match: siffran + typen + VARFÖR-orden.
 * EN sanning, allt härlett ur score.ts (pointTypeOf/scorePrediction) + den delade
 * matchPointLabel (samma funktion avslöjande-vyn använder, #99 anti-dubblett). Bara
 * relevant när matchen är 'finished' OCH jag tippade, annars finns ingen poäng att visa
 * (en pågående match ger ALDRIG en gissad poäng, HARD T55, och en otippad match har
 * inget tips att döma, alltså ingen "0 Miss"-rad för den som inte var med).
 */
interface MyMatchPoints {
  /** Tilldelade poäng (3/1/0), ur scorePrediction (slår upp PREDICTION_POINTS via typen). */
  points: number;
  /** Poäng-TYPEN ('exact' | 'outcome' | 'miss'), data-hook + ord-uppslag. */
  type: MatchPointType;
  /** VARFÖR i ord ("Exakt resultat" / "Rätt vinnare" / "Rätt kryss" / "Miss"). */
  reason: string;
}

/**
 * Härled MITT poäng-resultat för matchen, eller null om det inte FINNS en poäng att
 * visa ärligt. Returnerar null för en match som inte är avgjord (ingen gissad poäng,
 * T55) och för en match jag inte tippade (current === null: inget tips att döma).
 * När den returnerar ett värde är BÅDE siffran och orden samma sanning som topplistan.
 */
function myMatchPoints(
  match: Match,
  current: { homeGoals: number; awayGoals: number } | null
): MyMatchPoints | null {
  if (current === null || !isFinished(match)) {
    return null;
  }
  // isFinished narrowar match.result till MatchResult (icke-null) via unions-kontraktet,
  // så ingen egen null-check behövs. Poängen avgörs på ORDINARIE mål (score.ts-regeln);
  // straffar rör inte tips-poängen (de styr slutspelsTRÄDET, inte tipset).
  const actual = match.result;
  const type = pointTypeOf(current, actual);
  return {
    points: scorePrediction(current, actual),
    type,
    // Utfalls-medveten (#69): "Rätt kryss" på ett oavgjort facit, aldrig "Rätt vinnare".
    reason: matchPointLabel(type, outcomeOf(actual)),
  };
}

/**
 * Poäng-tillägget i ord för tips-radens bricka: "+3", "+1" eller "0". Ett 0 får inget
 * plustecken (det är ingen vinst). Samma talform som avslöjande-vyns formatPointDelta,
 * men ordningen här är delta-FÖRST ("+3 · Exakt resultat"), tips-listans format.
 */
function formatPointDelta(points: number): string {
  return points > 0 ? `+${points}` : `${points}`;
}

/**
 * Brick-formen per poäng-typ (form/vikt, inte bara färg, matchar avslöjandets markör-
 * familj översatt till kupong-estetiken): EXAKT = den STOLTA solida guld-brickan
 * (.vm-coupon-mine, samma som sparat-kvittot), UTFALL = en lugnare guld-tint-chip
 * (delvis rätt = delvis varm), MISS = en NEUTRAL chip (surface-raised + kant, INGEN
 * guld-tint, så en miss lånar inte den hoppfulla guld-tonen). Tre tydligt skilda former.
 * Den FÄRG-OBEROENDE markör-glyfen (bock/halv-cirkel/kryss) ritas per typ via CSS
 * ::before (.vm-tip-result, tokens.css §10), så formen, inte bara färgen, skiljer dem.
 */
const TIP_BADGE_CLASS_BY_TYPE: Record<MatchPointType, string> = {
  exact: 'vm-coupon-mine',
  outcome:
    'border border-[color-mix(in_srgb,var(--vm-gold)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_7%,var(--color-bg))] text-fg',
  miss: 'border border-border bg-surface-raised text-fg-muted',
};

/**
 * Biljett-/kupong-ikonen (kupong-huvudets dekor-glyf): en liten perforerad biljett.
 * Ren dekoration (aria-hidden), den ger kupong-känslan utan att bära text.
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
      {/* Biljett-kropp med två urtag (perforering) i sidorna. */}
      <path d="M2 5.5A1 1 0 0 1 3 4.5h10a1 1 0 0 1 1 1v1a1.5 1.5 0 0 0 0 3v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1a1.5 1.5 0 0 0 0-3z" />
      <path d="M10 4.75v6.5" strokeDasharray="1.4 1.4" />
    </svg>
  );
}

/**
 * Joker-stjärnan (joker-toggeln + låst joker-markören): en femuddig stjärna. Ren
 * dekoration (aria-hidden); knappens/etikettens text bär betydelsen. `filled` styr om
 * stjärnan är fylld (aktiv joker) eller bara konturad (inaktiv), via fill-attributet.
 */
function JokerStarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 1.6l1.9 3.9 4.3.6-3.1 3 .74 4.3L8 11.9l-3.84 2 .74-4.3-3.1-3 4.3-.6z" />
    </svg>
  );
}

/**
 * Hänglås-ikonen (låst-läget): ett stängt hänglås. Ren dekoration (aria-hidden);
 * låst-etikettens text bär betydelsen åt skärmläsaren. Får en lugn engångs-puls
 * via .vm-coupon-lock-icon (nollad vid reducerad rörelse).
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

export function PredictionForm({
  match,
  teamsById,
  current,
  locked,
  onSubmit,
  joker,
}: PredictionFormProps) {
  const home = teamName(match.homeTeamId, teamsById);
  const away = teamName(match.awayTeamId, teamsById);
  const homeCode = teamCode(match.homeTeamId, teamsById);
  const awayCode = teamCode(match.awayTeamId, teamsById);

  // JOKER-toggelns lokala tillstånd (T19): sparar-flagga + ev. fel. Separat från tips-
  // sparandet (en joker är ett eget val), men samma fail-loud-anda (RLS-avslag -> synligt).
  const [jokerBusy, setJokerBusy] = useState(false);
  const [jokerError, setJokerError] = useState<string | null>(null);
  async function handleJokerToggle() {
    if (joker === undefined) {
      return;
    }
    setJokerError(null);
    setJokerBusy(true);
    try {
      await joker.onToggle();
    } catch (err) {
      // Fail loud: ett RLS-avslag (matchen hann låsas) eller nätfel visas, inte tyst.
      setJokerError(err instanceof Error ? err.message : 'Kunde inte ändra jokern.');
    } finally {
      setJokerBusy(false);
    }
  }

  // MITT poäng-resultat (siffra + varför) för en AVGJORD match jag tippade, annars null.
  // Visas i låst-etiketten bredvid "Ditt tips". En pågående (men låst) match ger null
  // -> bara "Ditt tips", ingen gissad poäng (HARD T55). En otippad avgjord match ger
  // också null (current === null) -> ingen "0 Miss"-rad för den som inte var med (ärligt).
  const points = myMatchPoints(match, current);

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
      // TIPS-KUPONG (T15, design-frontend): .vm-coupon-card bär kupong-dekoren
      // (guld topp-strip + hörn-glow, dämpad i låst läge) i tokens.css §10, så
      // STRUKTUREN här hålls ren. Hover-lyftet bor i CSS (annars vinner inline över
      // :hover). En aning rundare hörn + guld-tonad vilo-kant skiljer den varma
      // kupongen från resultat-kortets gröna scoreboard utan att lämna familjen.
      className="vm-coupon-card group/form flex flex-col gap-3 rounded-card border border-[color-mix(in_srgb,var(--vm-gold)_22%,var(--color-border))] p-3.5 transition-[border-color] duration-300 hover:border-[color-mix(in_srgb,var(--vm-gold)_40%,var(--color-border))] sm:p-5"
    >
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0" disabled={locked}>
        {/* KUPONG-HUVUDET: en liten "TIPS"-eyebrow + biljett-ikon ovanför matchnamnet,
            så kortet omedelbart läses som en kupong (inte ett facit). FÄRG: --color-
            warning (den AA-SÄKRA guld-TEXT-tonen: ljus #f3c14e i mörkt, djup amber
            #8a5a05 i ljust), INTE --vm-gold (som faller under AA som text på ljus yta,
            den kända guld-på-ljus-fällan, lessons). Dekorativ guld-glow lever i CSS-
            fonden, här bär texten/ikonen läsbarhet -> warning-tonen. */}
        <p
          aria-hidden="true"
          className="flex items-center gap-1.5 font-display text-[0.625rem] font-bold uppercase leading-none tracking-[0.2em] text-warning"
        >
          <CouponTicketIcon />
          Tips
        </p>

        {/* legend namnger inmatningen för skärmläsare (vilka lag). Visuellt matchens
            rubrik med en liten guld kupong-prick (i stället för #39:s gröna puls-
            prick, så identiteten skiljer sig redan i detaljen). */}
        <legend className="flex items-center gap-2 font-display text-sm font-semibold leading-tight tracking-[-0.01em] sm:text-[0.9375rem]">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-pill"
            style={{ backgroundColor: 'var(--vm-gold)' }}
          />
          {matchLabel}
        </legend>

        {/* Kontext-rad (återanvänd från resultatinmatningen, DRY): avsparkstid +
            grupp/runda. Ligger UTANFÖR score-grid:en så den aldrig bryter #39:s
            kolumn-linjering. */}
        <MatchContextRow match={match} />

        {/* RIVER-LINJEN: kupongens avrivnings-perforering, skiljer huvudet (lag +
            kontext) från ifyllnads-zonen (mål-rutorna). Ren dekoration (aria-hidden). */}
        <div aria-hidden="true" className="vm-coupon-tear -mx-0.5 rounded-pill" />

        {/* JOKER-VÄLJAREN (T19, #19): en stjärn-toggle på en ÖPPEN kupong, "din joker idag".
            En joker dubblar matchens poäng, EN per omgång (svensk dag). Visas bara när
            joker-läget är aktivt (rum + live). På en LÅST kupong visas i stället en lugn
            "jokern gällde här"-markör nedanför (i låst-etiketten), inte en knapp. Stabila
            data-attribut (data-joker-toggle / data-joker-active) är hakarna för design + test. */}
        {joker !== undefined && !locked ? (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              data-joker-toggle=""
              data-joker-active={joker.isJoker || undefined}
              aria-pressed={joker.isJoker}
              disabled={jokerBusy}
              onClick={handleJokerToggle}
              className={`vm-joker-toggle inline-flex w-fit items-center gap-1.5 rounded-pill border px-3 py-1.5 font-display text-[0.75rem] font-bold leading-none transition-[background-color,border-color,filter] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--vm-gold)_55%,transparent)] disabled:cursor-not-allowed disabled:opacity-60 ${
                joker.isJoker
                  ? 'vm-coupon-mine border-transparent'
                  : 'border-[color-mix(in_srgb,var(--vm-gold)_30%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_7%,var(--color-bg))] text-fg hover:border-[color-mix(in_srgb,var(--vm-gold)_50%,var(--color-border))]'
              }`}
            >
              <JokerStarIcon filled={joker.isJoker} />
              {joker.isJoker ? 'Din joker idag (×2 poäng)' : 'Gör till din joker (×2 poäng)'}
            </button>
            {/* Förklaring när jokern ligger på en ANNAN match samma dag: ett klick FLYTTAR
                den hit (en per omgång). Lugn dämpad text, inte ett fel. */}
            {!joker.isJoker && joker.otherJokerSameDayMatchLabel !== null ? (
              <p data-joker-move-hint="" className="m-0 text-[0.75rem] leading-snug text-fg-muted">
                Du har jokern på {joker.otherJokerSameDayMatchLabel} idag. Ett klick flyttar den
                hit.
              </p>
            ) : null}
            {/* Joker-fel (fail loud): RLS-avslag eller nätfel. Egen liten danger-rad. */}
            {jokerError ? (
              <p
                role="alert"
                data-joker-error=""
                className="m-0 text-[0.75rem] leading-snug"
                style={{ color: 'var(--color-danger)' }}
              >
                {jokerError}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* LÅST-etikett: visas tydligt efter avspark. POSITIV inramning , "låst vid
            avspark" är spelets rättvisa (alla tippar blint), inte en frustration.
            data-prediction-lock är haken för design-frontend. aria-describedby
            kopplar den till fälten så en skärmläsare får veta varför fälten är
            inaktiva. Hänglås-ikon + dämpad guld-yta gör låsningen elegant. */}
        {locked ? (
          <div
            id={lockId}
            data-prediction-lock=""
            className="m-0 flex items-start gap-2.5 rounded-md border border-[color-mix(in_srgb,var(--vm-gold)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_7%,var(--color-bg))] px-3 py-2.5"
          >
            <span className="mt-0.5 shrink-0 text-warning">
              <CouponLockIcon />
            </span>
            <div className="m-0 flex flex-col gap-1.5">
              <p className="m-0 text-[0.8125rem] font-semibold leading-snug text-fg">
                Tipset är låst, matchen har sparkat igång.{' '}
                <span className="font-medium text-fg-muted">
                  Låst vid avspark, så alla tippar blint, det är spelets rättvisa.
                </span>{' '}
                {current ? (
                  <span className="whitespace-nowrap">
                    Ditt tips: {current.homeGoals}–{current.awayGoals}.
                  </span>
                ) : (
                  <span className="text-fg-muted">Du hann inte tippa.</span>
                )}
              </p>

              {/* POÄNG-RADEN (T58 krav 1): på en AVGJORD match jag tippade visas poängen
                  + VARFÖR direkt på tips-kortet ("+3 · Exakt resultat" / "+1 · Rätt kryss"
                  / "0 · Miss"). Härlett ur SAMMA poäng-väg som topplistan (scorePrediction
                  + matchPointLabel, en sanning, ingen ny beräkning). Visas BARA när points
                  finns: en pågående låst match ger inget (T55, inga gissade poäng), och en
                  match jag inte tippade ger inget (ingen "0 Miss" för den som inte var med).
                  data-tip-points/-point-type = stabila hakar för design + test. */}
              {points ? (
                <span
                  data-tip-result=""
                  data-tip-points={points.points}
                  data-tip-point-type={points.type}
                  className={`vm-tip-result inline-flex w-fit items-center gap-1.5 rounded-pill px-2.5 py-1 font-display text-[0.75rem] font-bold leading-none ${TIP_BADGE_CLASS_BY_TYPE[points.type]}`}
                >
                  {/* FÄRG-OBEROENDE markör-glyf (bock/halv-cirkel/kryss), samma form-familj
                      som facit-avslöjandets markör. Ritas via CSS ::before per
                      data-tip-point-type (.vm-tip-result, tokens.css §10), så glyfen är REN
                      dekor som aldrig hamnar i textContent (poäng-talet förblir radens
                      första tecken). VARFÖR-ordet bär betydelsen i text. */}
                  <span className="tabular-nums">{formatPointDelta(points.points)}</span>
                  <span aria-hidden="true" className="opacity-60">
                    ·
                  </span>
                  <span>{points.reason}</span>
                </span>
              ) : null}

              {/* JOKER GÄLLDE HÄR (T19): på en LÅST kupong som var min joker, en lugn
                  guld-markör så man ser att poängen ovan dubblades. Bara markören (jokern
                  är bindande efter avspark, ingen knapp). data-joker-locked = test/design-hak. */}
              {locked && joker?.isJoker ? (
                <span
                  data-joker-locked=""
                  className="vm-coupon-mine inline-flex w-fit items-center gap-1.5 rounded-pill px-2.5 py-1 font-display text-[0.75rem] font-bold leading-none"
                >
                  <JokerStarIcon filled />
                  Joker, poängen dubblades
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Score-grid (SAMMA #39-struktur som resultatinmatningen, fast bredd). */}
        <div
          data-prediction-card-body=""
          className="grid grid-cols-[auto_auto_auto] items-end justify-center gap-x-2.5 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:justify-between sm:gap-x-4"
        >
          {/* Kontroll-spåret (Spara + sparat-kvitto). Bär kortets variabla bredd,
              så rutorna står still. */}
          <div className="order-2 col-span-3 flex flex-wrap items-center justify-center gap-2.5 sm:order-1 sm:col-span-1 sm:justify-start">
            {!locked ? (
              <button
                type="submit"
                data-prediction-save=""
                className="ml-auto h-11 self-end rounded-pill bg-accent px-6 font-display text-sm font-semibold text-accent-fg shadow-sm transition-[transform,box-shadow,filter] duration-150 outline-none hover:brightness-105 hover:shadow-[var(--vm-shadow-raised)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] active:translate-y-px active:brightness-95"
              >
                {current ? 'Ändra tips' : 'Spara tips'}
              </button>
            ) : null}
            {/* Sparat-kvitto (role=status): en STOLT, fylld guld-bricka med mörk ink
                (samma färg-oberoende solid-bricka-form som "Klar"/"Dagens match"-
                chippen, T9/T11, AA-säker i båda teman). "Mitt tips syns och stolt"
                (taskens punkt 1): inte bara ett diskret kvitto, utan en tydlig bock. */}
            {saved && !locked ? (
              <span
                role="status"
                data-prediction-saved=""
                className="vm-coupon-mine inline-flex items-center gap-1.5 self-center rounded-pill px-3 py-1.5 font-display text-[0.8125rem] font-bold leading-none shadow-sm"
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

          {/* Hemma-lag (fast bredd via input-spåret). */}
          <div className="order-1 flex w-16 flex-col items-center gap-1 sm:order-2">
            <span className="flex w-full items-center justify-center gap-1">
              {homeCode ? (
                <span
                  aria-hidden="true"
                  className={CODE_CHIP}
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--vm-gold) 16%, transparent)',
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

          {/* "mot"-avdelaren (fast). Guld-skiftad (kvällsljus-detaljen): blandningen
              lutar mot fg-muted (AA-säker bastext-ton) och använder --color-warning
              (den AA-säkra guld-text-tonen per tema), inte rå --vm-gold, så även över
              kupongens guld-tintade fond håller den AA som normal text (uppmätt, se
              decisions.md). 50/50-mix ger karaktären utan att sänka läsbarheten. */}
          <span
            aria-hidden="true"
            className="order-1 self-end pb-3 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.18em] sm:order-2 sm:self-center sm:pb-0"
            style={{ color: 'color-mix(in srgb, var(--color-warning) 50%, var(--color-fg-muted))' }}
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
                    backgroundColor: 'color-mix(in srgb, var(--vm-gold) 16%, transparent)',
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

        {/* Fel-listan: role="alert" (fail loud), kopplad till fälten via aria.
            Egen yta i danger-ton (semantiskt token, INTE accent/guld) så felet är
            omöjligt att missa men håller T7-pinnen ren. */}
        {error ? (
          <p
            id={errorId}
            role="alert"
            data-prediction-error=""
            className="m-0 rounded-md border p-3 text-sm"
            // Felytan blandas mot den OPAKA surface-tokenen (inte transparent): så
            // sänker kupongens guld-glow i kort-fonden inte fel-textens kontrast
            // (canvas-komposit-fälla, uppmätt 4.38:1 över glow:en -> 4.81:1 över
            // opak surface, light). danger-token (semantiskt, INTE accent/guld), T7-pin.
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
