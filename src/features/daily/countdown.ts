// Nedräknings-logik + "dagens match"-val (RENA funktioner, inget I/O, ingen React).
//
// Ansvar: räkna ut tiden till NÄSTA kommande avspark (mot ett givet "nu") och
// välja dagens framträdande match. UI-tickandet (en timer som re-renderar varje
// sekund) hålls UTANFÖR (i hooken/vyn), så själva beräkningen är en ren funktion
// av (matcher, nu) och därmed deterministisk och enhetstestbar. Edge-fallen
// (ingen kommande match efter finalen, exakt vid avspark) hanteras explicit i
// stället för att krascha eller ticka negativt.

import type { Match } from '../../domain/types';

/** En nedräkning uppdelad i hela dygn/timmar/minuter/sekunder (alla >= 0). */
export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Total kvarvarande tid i millisekunder (>= 0; 0 = avspark är nu eller passerad). */
  totalMs: number;
}

/**
 * Resultatet av en nedräknings-beräkning. Diskriminerad union så slut-tillståndet
 * (ingen kommande match) är ett EGET, explicit fall i stället för null/0 som en
 * konsument kan missförstå. Vyn narrowar på `kind` och kan inte råka rendera en
 * nedräkning utan en match.
 */
export type CountdownState =
  | {
      kind: 'upcoming';
      /** Nästa match som inte sparkat igång än (tidigast i framtiden). */
      match: Match;
      /** Tiden kvar till dess avspark, uppdelad. */
      remaining: CountdownParts;
    }
  | {
      // Ingen kommande match: turneringen är slutspelad (efter finalen) eller
      // matchlistan är tom. Vyn visar ett sluttillstånd, ingen nedräkning.
      kind: 'no-upcoming';
    };

/** Antal millisekunder per tidsenhet (läsbarhet, inga magiska tal i räkningen). */
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Dela upp en kvarvarande tid (ms) i hela dygn/timmar/minuter/sekunder.
 * Negativ indata klampas till 0 (en passerad avspark räknas inte "bakåt").
 */
export function splitDuration(remainingMs: number): CountdownParts {
  const totalMs = Math.max(0, remainingMs);
  const days = Math.floor(totalMs / MS_PER_DAY);
  const hours = Math.floor((totalMs % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((totalMs % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((totalMs % MS_PER_MINUTE) / MS_PER_SECOND);
  return { days, hours, minutes, seconds, totalMs };
}

/**
 * Är matchen en KOMMANDE avspark vid tidpunkten `nowMs`? En match räknas som
 * kommande tills dess avsparks-instant passerats (kickoff > nu). Exakt vid
 * avspark (kickoff === nu) räknas den INTE längre som kommande, så nedräkningen
 * inte fastnar på 0 utan går vidare till nästa match (eller sluttillståndet).
 */
function isUpcoming(match: Match, nowMs: number): boolean {
  return new Date(match.kickoff).getTime() > nowMs;
}

/**
 * Räkna ut nedräkningen till nästa kommande avspark mot `now`.
 *
 * Plockar den TIDIGASTE matchen vars kickoff ligger strikt efter `now` (UTC-
 * jämförelse på instant, korrekt oavsett tidszon). Finns ingen sådan match
 * (efter finalen, eller tom lista) returneras `{ kind: 'no-upcoming' }` i
 * stället för att krascha eller ge en negativ nedräkning.
 *
 * @param matches  Alla matcher (UTC-kickoff).
 * @param now      "Nu" som Date eller epoch-ms. Injiceras (testbarhet + UI-tick),
 *                 default = aktuell tid.
 */
export function computeCountdown(
  matches: readonly Match[],
  now: Date | number = Date.now()
): CountdownState {
  const nowMs = typeof now === 'number' ? now : now.getTime();

  let next: Match | null = null;
  let nextMs = Number.POSITIVE_INFINITY;
  for (const match of matches) {
    if (!isUpcoming(match, nowMs)) {
      continue;
    }
    const ms = new Date(match.kickoff).getTime();
    if (ms < nextMs) {
      next = match;
      nextMs = ms;
    }
  }

  if (next === null) {
    return { kind: 'no-upcoming' };
  }
  return {
    kind: 'upcoming',
    match: next,
    remaining: splitDuration(nextMs - nowMs),
  };
}

/**
 * Välj dagens framträdande match ("Match of the day") bland en dags matcher.
 *
 * DETERMINISTISK regel (dokumenterad så valet aldrig är godtyckligt): den
 * TIDIGASTE matchen på dagen (lägst kickoff). Vid exakt samma avsparkstid bryts
 * lika med matchens id (stabil, lexikografisk), så valet är entydigt och
 * oberoende av inkommande ordning. Returnerar null för en tom dag.
 *
 * VARFÖR tidigast (och inte t.ex. högst rankad): rankning kräver lag-profil-data
 * (FIFA-ranking) som är lag-profil-tasken (T10, out of scope här), och för
 * slutspel är lagen ännu okända (homeTeamId/awayTeamId null). "Dagens första
 * avspark" är data vi HAR för alla matcher och en naturlig hero för en dagsvy.
 * Regeln kan skärpas i T10 när rankning finns, då på ett dokumenterat sätt.
 */
export function selectMatchOfTheDay(dayMatches: readonly Match[]): Match | null {
  let best: Match | null = null;
  for (const match of dayMatches) {
    if (best === null) {
      best = match;
      continue;
    }
    const cmp = match.kickoff.localeCompare(best.kickoff);
    if (cmp < 0 || (cmp === 0 && match.id.localeCompare(best.id) < 0)) {
      best = match;
    }
  }
  return best;
}
