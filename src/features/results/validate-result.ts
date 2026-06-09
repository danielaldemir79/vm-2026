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

import type { MatchResult, MatchStatus } from '../../domain/types';

/** Stabila fel-koder så UI och tester refererar fel utan att binda mot copy-text. */
export type ResultValidationCode =
  | 'home-not-integer'
  | 'away-not-integer'
  | 'home-negative'
  | 'away-negative'
  | 'finished-without-result'
  | 'result-without-finished'
  | 'invalid-status-transition';

/** Ett enskilt valideringsfel: en kod (stabil) + ett användarvänligt meddelande. */
export interface ResultValidationError {
  code: ResultValidationCode;
  /** Vilket fält felet sitter på, så formuläret kan koppla det till rätt input (aria). */
  field: 'home' | 'away' | 'status' | 'result';
  /** Begripligt svenskt meddelande (visas i UI:t). */
  message: string;
}

/** Resultatet av en validering: giltigt, eller en lista med ALLA fel (inte bara det första). */
export type ResultValidation = { ok: true } | { ok: false; errors: ResultValidationError[] };

/**
 * Vad användaren matar in för en match: mål hemma/borta + den status matchen
 * ska få. Måldelen tillåts vara `null` (tomt fält) så vi kan validera "finished
 * utan resultat" explicit i stället för att tolka ett tomt fält som 0.
 */
export interface ResultEntry {
  homeGoals: number | null;
  awayGoals: number | null;
  status: MatchStatus;
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
 * Validera en resultatinmatning mot matchens nuvarande status.
 *
 * @param current  Matchens status INNAN inmatningen (för övergångs-kontrollen).
 * @param entry    Det användaren matat in (mål + ny status).
 * @returns        `{ ok: true }` eller ALLA fel samlade (`{ ok: false, errors }`).
 */
export function validateResultEntry(current: MatchStatus, entry: ResultEntry): ResultValidation {
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

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Bygg ett färdigt MatchResult ur en VALIDERAD finished-inmatning. Anropas bara
 * efter att validateResultEntry gett ok för status 'finished' (då är bägge mål
 * garanterat icke-null heltal). Kastar annars, för att fånga en anropare som
 * hoppade över valideringen (fail loud, inte ett tyst NaN-resultat).
 */
export function toMatchResult(entry: ResultEntry): MatchResult {
  if (entry.homeGoals === null || entry.awayGoals === null) {
    throw new Error(
      'toMatchResult anropad utan bägge måltal, validera med validateResultEntry först.'
    );
  }
  return { homeGoals: entry.homeGoals, awayGoals: entry.awayGoals };
}
