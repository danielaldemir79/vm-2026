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
 *
 * Fail loud (PRINCIPLES §8, samma kontrakt som localDateKey/formatDayHeading i
 * samma feature): en ogiltig kickoff (NaN-tidsstämpel) är ett DATAFEL. Att låta
 * NaN-jämförelsen tyst bli `false` skulle dölja en datakorrupt match som "inte
 * kommande", så nästa-avspark-valet hoppade tyst över den och hero:n kunde
 * felaktigt landa i sluttillståndet (Copilot R1, C2). Vi kastar i stället.
 */
function isUpcoming(match: Match, nowMs: number): boolean {
  const kickoffMs = new Date(match.kickoff).getTime();
  if (Number.isNaN(kickoffMs)) {
    throw new Error(`Ogiltig kickoff-tidsstämpel för match "${match.id}": "${match.kickoff}".`);
  }
  return kickoffMs > nowMs;
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
 * Den TIDIGASTE matchen i en lista (lägst kickoff), med matchens id som stabil,
 * lexikografisk tie-break vid exakt samma avsparkstid. Ren hjälpare så både
 * "dagens fokus-match" och dess all-spelade-fallback delar EXAKT samma ordnings-
 * regel (ingen risk att de driver isär). Returnerar null för en tom lista.
 */
function earliestMatch(matches: readonly Match[]): Match | null {
  let best: Match | null = null;
  for (const match of matches) {
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

/**
 * Välj dagens framträdande match ("Match of the day", hero-kortets fokus) bland
 * en dags matcher.
 *
 * DETERMINISTISK regel (dokumenterad så valet aldrig är godtyckligt): den
 * tidigaste matchen på dagen som INTE redan är färdigspelad (status !==
 * 'finished'), med matchens id som lexikografisk tie-break vid samma avsparkstid.
 * Är HELA dagen färdigspelad faller vi tillbaka på dagens tidigaste match (så ett
 * fullständigt spelat dygn fortfarande har ett hero-kort, nu med sitt resultat).
 * Returnerar null för en tom dag.
 *
 * VARFÖR "tidigaste ICKE-färdiga" (T57, #98): tidigare valdes alltid dagens
 * tidigaste match oavsett status, så när en match blåstes av stod "Dagens match"
 * kvar på den avslutade matchen tills sidan laddades om, fast nedräkningen redan
 * pekade mot nästa avspark (Daniels live-feedback). Genom att hoppa över färdiga
 * matcher lyfter fokus automatiskt nästa ospelade match på dagen, drivet av samma
 * minut-/sekund-tick som nedräkningen (ingen ny polling): matchens status blir
 * 'finished' när det officiella resultatet vävs in (T48), och vyn räknar om.
 *
 * VARFÖR tidigast (och inte t.ex. högst rankad): rankning kräver lag-profil-data
 * (FIFA-ranking) som är lag-profil-tasken (T10, out of scope här), och för
 * slutspel är lagen ännu okända (homeTeamId/awayTeamId null). "Dagens första
 * ospelade avspark" är data vi HAR för alla matcher och en naturlig hero.
 */
export function selectMatchOfTheDay(dayMatches: readonly Match[]): Match | null {
  const notFinished = dayMatches.filter((m) => m.status !== 'finished');
  // Finns minst en ospelad match: fokusera dess tidigaste. Annars (hela dagen
  // spelad) faller vi tillbaka på dagens tidigaste match, så hero:t inte
  // försvinner på ett färdigspelat dygn (det visar då matchen MED resultat).
  return earliestMatch(notFinished.length > 0 ? notFinished : dayMatches);
}
