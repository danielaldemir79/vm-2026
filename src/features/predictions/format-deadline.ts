// REN deadline-formatering för pool-tipsen (grupp + bracket): ett UTC-instant
// (deadlineIso) -> ett tydligt SVENSKT lås-budskap (T35, #63 AC#3). Ingen React,
// inget I/O, fristående testbar.
//
// VARFÖR denna fil finns (Daniels feedback 5): grupp- och bracket-tipsen säger inte
// klart NÄR tippningen låses. Den verifierade deadline-modellen (mot RLS, docs/
// decisions.md T16 §4) är:
//   * grupp-tips  -> gruppens FÖRSTA match (g-X-1) avspark,
//   * bracket-slot -> slottens egen avspark (M73..M104),
//   * champion    -> turneringens första match (g-A-1) avspark.
// I ALLA tre fallen är deadlinen en MATCH-AVSPARK. Den här funktionen formaterar
// just den avsparks-tiden, så budskapet säger den EXAKTA tidpunkten, aldrig en
// gissad dag (Daniel sa "deadline till söndag", men modellen säger per-match-avspark,
// så vi visar den faktiska tiden, inte en söndag).
//
// EN SANNING (HARD, lessons: ingen hårdkodad text-dubblett av en tid): budskapet
// härleds ur SAMMA `deadlineIso` som driver `locked` (now >= deadlineIso) i
// selektorerna (group-predictable-data.ts / bracket-predictable-slots.ts). Vi
// dubblerar alltså aldrig tiden, vi formaterar exakt det ankaret. Då kan låset och
// texten ALDRIG drifta isär: är de olika, är det samma ISO som är fel på båda.
//
// SVENSK TID + off-by-one-säkert: vi återanvänder daily-lagrets formatterare
// (formatKickoffTime "HH:MM", formatDayHeadingNoYear "fredag 11 juni"), som redan
// hanterar Europe/Stockholm + dygnsgräns rätt (off-by-one-fällan, lessons). Vi
// hittar inte på en egen formatering här (DRY, PRINCIPLES §4).

import { formatKickoffTime, formatDayHeadingNoYear } from '../daily/format-datetime';
import { localDateKey } from '../daily/group-matches-by-day';

/** Ett människo-läsbart, KORREKT lås-budskap för en tips-deadline. */
export interface DeadlineMessage {
  /** Exakt tidpunkt, t.ex. "fredag 11 juni kl 21:00" (svensk tid). */
  absolute: string;
  /**
   * Relativ närhet (för en mjuk brådska-känsla), eller null när den inte tillför
   * (mer än en dag kvar och inte idag). T.ex. "idag", "imorgon", "om 3 dagar".
   * Aldrig en exakt timme/minut, det vore en andra sanning om samma tid.
   */
  relative: string | null;
}

/** En svensk dag, i millisekunder. Bara för den GROVA relativa etiketten (dagar). */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hur många hela SVENSKA kalenderdagar (Europe/Stockholm) ligger `deadlineMs` efter
 * `nowMs`? Räknas på dag-NYCKLAR (localDateKey, härledda i svensk zon), inte på rå
 * ms-skillnad, så "imorgon kl 01:00" blir 1 dag även om det är < 24h bort, och en
 * deadline senare idag blir 0 (off-by-one-säkert kring midnatt, lessons).
 */
function swedishDayDiff(nowMs: number, deadlineMs: number): number {
  const nowKey = localDateKey(new Date(nowMs).toISOString());
  const deadlineKey = localDateKey(new Date(deadlineMs).toISOString());
  // Tolka bägge dag-nycklarna som lokal väggklocka 12:00 (mitt på dagen, okänsligt
  // för zon-offset, samma grepp som daily-formatterarna) och ta skillnaden i hela
  // dagar. UTC-baserad subtraktion av två 12:00-lokala datum ger rätt heltal dagar.
  const toNoonMs = (key: string): number => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d, 12, 0, 0);
  };
  return Math.round((toNoonMs(deadlineKey) - toNoonMs(nowKey)) / DAY_MS);
}

/** Den grova relativa etiketten (dagar), eller null när den inte tillför. */
function relativeLabel(dayDiff: number): string | null {
  if (dayDiff <= 0) {
    // <= 0: deadlinen är idag (eller, teoretiskt, redan passerad, men då är kortet
    // låst och denna text visas inte). "idag" bär brådskan.
    return 'idag';
  }
  if (dayDiff === 1) {
    return 'imorgon';
  }
  return `om ${dayDiff} dagar`;
}

/**
 * Formatera en tips-deadline (en match-avspark) till ett tydligt svenskt budskap.
 *
 * @param deadlineIso  Deadline-ankarets avspark (UTC ISO), SAMMA värde som driver
 *                     `locked` i selektorn. null när ankar-matchen saknas (oväntat).
 * @param now          Nuet (default new Date()), injicerbart för test/determinism.
 * @returns Ett DeadlineMessage, eller null när `deadlineIso` är null (ingen tid att
 *          visa, anroparen faller då på sitt fail-safe-budskap, samma som låset).
 */
export function formatDeadline(
  deadlineIso: string | null,
  now: Date = new Date()
): DeadlineMessage | null {
  if (deadlineIso === null) {
    return null;
  }
  const deadlineMs = new Date(deadlineIso).getTime();
  const day = formatDayHeadingNoYear(localDateKey(deadlineIso)); // "fredag 11 juni"
  const time = formatKickoffTime(deadlineIso); // "21:00"
  const absolute = `${day} kl ${time}`;
  const relative = relativeLabel(swedishDayDiff(now.getTime(), deadlineMs));
  return { absolute, relative };
}
