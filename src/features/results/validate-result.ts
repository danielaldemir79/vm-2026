// Validering av en resultatinmatning (REN funktion, inget I/O, ingen React).
//
// Detta är fel-vägs-grinden för T6: innan ett inmatat resultat får uppdatera
// den delade matchlistan (results-store) måste det vara giltigt. Valideringen
// är medvetet en egen ren modul så den kan enhetstestas fristående och
// återanvändas av både formuläret (visa fel inline) och store-mutatorn
// (vägra ett ogiltigt resultat fail-loud, PRINCIPLES §8).
//
// Vad som valideras (SPEC §6 + Match-unionen i domain/types.ts):
//   - Mål är ICKE-NEGATIVA HELTAL (ingen 1.5, ingen -1, ingen NaN/Infinity).
//   - En FÄRDIG match (status 'finished') KRÄVER ett resultat (Match-unionen:
//     bara FinishedMatch bär result). En scheduled/live-match får INTE bära ett
//     resultat (result === null).
//   - Status-ÖVERGÅNGAR följer matchens livscykel framåt: scheduled -> live ->
//     finished (samt att stanna kvar, och att backa ett felinmatat resultat).
//
// VARFÖR ren + diskriminerat returvärde: en validering som kastar tvingar varje
// anropare till try/catch och döljer FLERA fel (man ser bara det första). Ett
// `{ ok: true } | { ok: false; errors }`-resultat låter formuläret visa ALLA
// fel samtidigt (bättre UX, a11y) och store-mutatorn fail-loud:a på samma data.

import type { MatchResult, MatchStage, MatchStatus } from '../../domain/types';

/** Stabila fel-koder så UI och tester refererar fel utan att binda mot copy-text. */
export type ResultValidationCode =
  | 'home-not-integer'
  | 'away-not-integer'
  | 'home-negative'
  | 'away-negative'
  | 'finished-without-result'
  | 'result-without-finished'
  | 'invalid-status-transition'
  // Slutspelsmatch med lika ordinarie ställning KRÄVER en avgörande straff-vinnare
  // (FIFA Article 14: oavgjort kan inte stå sig i slutspel). Saknas straffar, eller
  // är de också lika, är inmatningen ofullständig.
  | 'knockout-tie-needs-penalties'
  // Straffmål måste vara icke-negativa heltal (samma kontrakt som ordinarie mål).
  | 'penalties-home-not-integer'
  | 'penalties-away-not-integer'
  // Straffar angivna på en match som INTE behöver dem (inte lika ställning, eller
  // gruppspel där oavgjort står sig). Fail loud i stället för att tyst ignorera.
  | 'penalties-not-applicable'
  // Anropad för en match som inte finns i listan (programmeringsfel, inte en
  // inmatnings-validering). Egen kod så den inte maskeras som en status-övergång.
  | 'unknown-match';

/** Vilka inmatningsfält ett fel kan bindas till (för aria-koppling i formuläret). */
export type ResultValidationField = 'home' | 'away' | 'status' | 'result' | 'penalties';

/** Ett enskilt valideringsfel: en kod (stabil) + ett användarvänligt meddelande. */
export interface ResultValidationError {
  code: ResultValidationCode;
  /**
   * Vilket fält felet sitter på, så formuläret kan koppla det till rätt input
   * (aria). Utelämnas för fel som INTE hör till ett enskilt fält (t.ex. okänd
   * match), så formuläret inte felaktigt markerar en input som ogiltig.
   */
  field?: ResultValidationField;
  /** Begripligt svenskt meddelande (visas i UI:t). */
  message: string;
}

/** Resultatet av en validering: giltigt, eller en lista med ALLA fel (inte bara det första). */
export type ResultValidation = { ok: true } | { ok: false; errors: ResultValidationError[] };

/**
 * Vad användaren matar in för en match: mål hemma/borta + den status matchen
 * ska få. Måldelen tillåts vara `null` (tomt fält) så vi kan validera "finished
 * utan resultat" explicit i stället för att tolka ett tomt fält som 0.
 *
 * `penalties` (straffläggning) är bara relevant för SLUTSPEL och bara när
 * ordinarie ställning är lika (FIFA Article 14). Den är `null` när ingen
 * straffläggning skett (alla gruppmatcher, samt slutspel med avgjord ordinarie
 * tid). Varje straffmål får vara `null` (tomt fält) av samma skäl som ordinarie
 * mål: så "lika i slutspel utan straff-vinnare" kan valideras explicit.
 */
export interface ResultEntry {
  homeGoals: number | null;
  awayGoals: number | null;
  status: MatchStatus;
  penalties?: { homeGoals: number | null; awayGoals: number | null } | null;
}

/**
 * Tillåtna status-övergångar (matchens livscykel). En match rör sig framåt
 * scheduled -> live -> finished, men vi tillåter också att STANNA i sitt läge
 * (idempotent redigering: rätta ett redan inmatat resultat) och att BACKA ett
 * läge (t.ex. ett felinmatat 'finished' tillbaka till 'live'/'scheduled' när
 * resultatet ska tas bort). Det enda som är förbjudet är ett hopp som inte
 * motsvarar en verklig livscykel-väg, här finns inga sådana eftersom alla par
 * mellan de tre lägena är meningsfulla, men funktionen är tabell-driven så en
 * framtida status (t.ex. 'postponed') inte tyst blir tillåten överallt.
 *
 * VARFÖR en explicit tabell: status-övergångar är domänregler. En hårdkodad
 * if-sats sprider regeln; en tabell gör den till EN sanning som testet kan svepa
 * uttömmande och en framtida status tvingar ett medvetet val (fail-loud default).
 */
const ALLOWED_TRANSITIONS: Readonly<Record<MatchStatus, readonly MatchStatus[]>> = {
  scheduled: ['scheduled', 'live', 'finished'],
  live: ['scheduled', 'live', 'finished'],
  finished: ['scheduled', 'live', 'finished'],
};

/** Är ett värde ett icke-negativt heltal? (Avvisar NaN, Infinity, decimaltal, negativa.) */
function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Slutspels-stages (allt utom gruppspel). En match i något av dessa kan INTE
 * sluta oavgjort: vid lika ordinarie ställning avgör straffar (FIFA Article 14,
 * se fifa-knockout-rules-source.txt). I gruppspel (`group`) står oavgjort sig.
 */
function isKnockoutStage(stage: MatchStage): boolean {
  return stage !== 'group';
}

/**
 * Validera straffläggningen för en FÄRDIG slutspelsmatch med lika ordinarie
 * ställning (FIFA Article 14). Anropas bara när vi vet att straffar KRÄVS
 * (slutspel + finished + lika mål). Lägger fel i `errors` (muterar listan):
 *   - straffar saknas helt eller har ett tomt fält -> ofullständig inmatning,
 *   - straffmål inte icke-negativa heltal -> samma kontrakt som ordinarie mål,
 *   - straffarna är OCKSÅ lika -> ingen vinnare utsedd (en straffläggning
 *     fortsätter tills en sida leder, så lika är ett ogiltigt slut-tillstånd).
 */
function validatePenaltiesRequired(entry: ResultEntry, errors: ResultValidationError[]): void {
  const p = entry.penalties;
  if (!p || p.homeGoals === null || p.awayGoals === null) {
    errors.push({
      code: 'knockout-tie-needs-penalties',
      field: 'penalties',
      message:
        'Slutspelsmatch med lika ställning måste avgöras på straffar, ange straffmål för båda lagen.',
    });
    return;
  }
  if (!isNonNegativeInteger(p.homeGoals)) {
    errors.push({
      code: 'penalties-home-not-integer',
      field: 'penalties',
      message: 'Hemmalagets straffmål måste vara ett heltal som är noll eller större.',
    });
  }
  if (!isNonNegativeInteger(p.awayGoals)) {
    errors.push({
      code: 'penalties-away-not-integer',
      field: 'penalties',
      message: 'Bortalagets straffmål måste vara ett heltal som är noll eller större.',
    });
  }
  // Bara meningsfullt att kräva en vinnare när bägge straffmål är giltiga tal.
  if (
    isNonNegativeInteger(p.homeGoals) &&
    isNonNegativeInteger(p.awayGoals) &&
    p.homeGoals === p.awayGoals
  ) {
    errors.push({
      code: 'knockout-tie-needs-penalties',
      field: 'penalties',
      message: 'Straffarna måste utse en vinnare, de kan inte sluta lika.',
    });
  }
}

/**
 * Validera en resultatinmatning mot matchens nuvarande status och stage.
 *
 * @param current  Matchens status INNAN inmatningen (för övergångs-kontrollen).
 * @param entry    Det användaren matat in (mål + ny status + ev. straffar).
 * @param stage    Matchens stage (gruppspel eller slutspelsrunda). Avgör om
 *                 straffar krävs/tillåts (FIFA Article 14). Default 'group' så
 *                 befintliga gruppspels-call-sites (och deras tester) är oförändrade.
 * @returns        `{ ok: true }` eller ALLA fel samlade (`{ ok: false, errors }`).
 */
export function validateResultEntry(
  current: MatchStatus,
  entry: ResultEntry,
  stage: MatchStage = 'group'
): ResultValidation {
  const errors: ResultValidationError[] = [];

  // 1. Status-övergång först: en ogiltig övergång gör måldelens innebörd oklar.
  if (!ALLOWED_TRANSITIONS[current].includes(entry.status)) {
    errors.push({
      code: 'invalid-status-transition',
      field: 'status',
      message: `Ogiltig statusövergång: en match kan inte gå från ${current} till ${entry.status}.`,
    });
  }

  // 2. Måltal: när de FINNS måste de vara icke-negativa heltal. Ett tomt fält
  //    (null) är inte ett tal-fel här, det fångas av resultat-kravet i steg 3.
  if (entry.homeGoals !== null && !isNonNegativeInteger(entry.homeGoals)) {
    errors.push({
      code: entry.homeGoals < 0 ? 'home-negative' : 'home-not-integer',
      field: 'home',
      message: 'Hemmamål måste vara ett heltal som är noll eller större.',
    });
  }
  if (entry.awayGoals !== null && !isNonNegativeInteger(entry.awayGoals)) {
    errors.push({
      code: entry.awayGoals < 0 ? 'away-negative' : 'away-not-integer',
      field: 'away',
      message: 'Bortamål måste vara ett heltal som är noll eller större.',
    });
  }

  // 3. Status <-> resultat-kontraktet (Match-unionen):
  //    - 'finished' KRÄVER bägge måltal (annars finished utan resultat).
  //    - 'scheduled'/'live' får INTE bära ett resultat (måltal ska vara tomma).
  const hasAnyGoal = entry.homeGoals !== null || entry.awayGoals !== null;
  const hasBothGoals = entry.homeGoals !== null && entry.awayGoals !== null;

  if (entry.status === 'finished' && !hasBothGoals) {
    errors.push({
      code: 'finished-without-result',
      field: 'result',
      message: 'En spelad match kräver både hemma- och bortamål.',
    });
  }
  if (entry.status !== 'finished' && hasAnyGoal) {
    errors.push({
      code: 'result-without-finished',
      field: 'result',
      message:
        'Bara en spelad (finished) match får ha ett resultat. Sätt status till spelad först.',
    });
  }

  // 4. Straffar (FIFA Article 14, bara slutspel). Tre lägen, alla fail-loud:
  //    - SLUTSPEL + finished + lika ordinarie ställning -> straffar KRÄVS (och
  //      måste utse en vinnare). Avgörs bara när bägge ordinarie mål är giltiga
  //      tal (annars rapporteras redan deras fel ovan, straff-kravet är då för
  //      tidigt att bedöma och skulle bara bruskaka fel-listan).
  //    - Straffar angivna men det går SÄKERT att avgöra att de inte är
  //      tillämpliga -> 'penalties-not-applicable' (maskera inte tyst).
  //    - Straffar angivna men det går INTE att avgöra säkert ännu (slutspel,
  //      finished, men ordinarie mål saknas/ogiltiga) -> säg INGET om straffar.
  //      Felet bor då i de ordinarie målen (finished-without-result/heltals-fel
  //      ovan), och straffarna kan bli KRÄVDA så snart målen rättas till lika.
  //      Att då säga "Ta bort straffmålen" vore missvisande (C9, Copilot runda 3).
  const penaltiesProvided =
    entry.penalties != null &&
    (entry.penalties.homeGoals !== null || entry.penalties.awayGoals !== null);
  const ordinaryGoalsValid =
    hasBothGoals &&
    isNonNegativeInteger(entry.homeGoals as number) &&
    isNonNegativeInteger(entry.awayGoals as number);
  const isLevelOrdinary = ordinaryGoalsValid && entry.homeGoals === entry.awayGoals;
  const penaltiesRequired =
    isKnockoutStage(stage) && entry.status === 'finished' && isLevelOrdinary;

  // Det går att SÄKERT avgöra att straffar inte är tillämpliga bara i två fall:
  //   - gruppspel (oavgjort står sig, straffar gäller aldrig), eller
  //   - slutspel med GILTIGA ordinarie mål som inte är lika (avgjord match).
  // I övriga "ej krävda"-fall (ofullständiga/ogiltiga ordinarie mål, eller en
  // ej-finished match) beror straffarnas relevans på att det ordinarie felet
  // rättas först, så vi flaggar inte straffarna då (annars missvisande, C9).
  const penaltiesDefinitelyNotApplicable =
    !isKnockoutStage(stage) || (ordinaryGoalsValid && !isLevelOrdinary);

  if (penaltiesRequired) {
    validatePenaltiesRequired(entry, errors);
  } else if (penaltiesProvided && penaltiesDefinitelyNotApplicable) {
    // Straffar finns men matchen behöver dem säkert inte: ett avgjort
    // slutspelsresultat ska INTE bära en straffläggning, och gruppspel aldrig.
    errors.push({
      code: 'penalties-not-applicable',
      field: 'penalties',
      message:
        'Straffar gäller bara en slutspelsmatch som slutat lika i ordinarie tid. Ta bort straffmålen.',
    });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Bygg ett färdigt MatchResult ur en VALIDERAD finished-inmatning. Anropas bara
 * efter att validateResultEntry gett ok för status 'finished' (då är bägge mål
 * garanterat icke-null heltal). Kastar annars, för att fånga en anropare som
 * hoppade över valideringen (fail loud, inte ett tyst NaN-resultat).
 *
 * BEVARAR STRAFFAR (F1/penalties-pinnen, T9): om inmatningen bär en komplett
 * straffläggning (bägge straffmål icke-null) tas den med i resultatet. Utan
 * detta tappades penalties tyst i reducern, så en slutspelsmatch avgjord på
 * straffar förlorade sin vinnar-information. Validerings-grinden har redan
 * säkrat att straffarna är giltiga och utser en vinnare när de krävs; här
 * speglar vi dem bara in i den lagrade formen.
 */
export function toMatchResult(entry: ResultEntry): MatchResult {
  if (entry.homeGoals === null || entry.awayGoals === null) {
    throw new Error(
      'toMatchResult anropad utan bägge måltal, validera med validateResultEntry först.'
    );
  }
  const result: MatchResult = { homeGoals: entry.homeGoals, awayGoals: entry.awayGoals };
  const p = entry.penalties;
  if (p != null && p.homeGoals !== null && p.awayGoals !== null) {
    result.penalties = { homeGoals: p.homeGoals, awayGoals: p.awayGoals };
  }
  return result;
}
