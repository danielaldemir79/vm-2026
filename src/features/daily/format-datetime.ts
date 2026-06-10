// Formatering av UTC-instant -> SVENSK visningstid/datum (RENA funktioner).
//
// Match.kickoff är UTC (en sanning, se matches.ts). Allt som VISAS för användaren
// formateras tillbaka till svensk tid (Europe/Stockholm) här, så vyn aldrig
// råkar visa UTC-klockan eller klippa UTC-datumet rakt av (off-by-one-fällan,
// senior-developer lessons). Via Intl med sv-SE-locale, så veckodag/månad blir
// svenska utan en egen tabell.

import { DISPLAY_TIMEZONE } from './group-matches-by-day';

/**
 * Avsparkstid på formen "HH:MM" i svensk tid (24-timmars), t.ex. "21:00".
 * Detta är den tid som ska stå på matchkortet.
 */
export function formatKickoffTime(isoInstant: string, timeZone: string = DISPLAY_TIMEZONE): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoInstant));
}

/**
 * En läsbar svensk dag-rubrik ur en dag-nyckel ("YYYY-MM-DD"), t.ex.
 * "torsdag 11 juni 2026". Dag-nyckeln är redan ett LOKALT svenskt datum
 * (härlett i DISPLAY_TIMEZONE av groupMatchesByDay), så vi tolkar den som
 * lokal väggklocka 12:00 för att slippa all tidszons-glidning i själva
 * formateringen (mitt på dagen kan ingen offset flytta datumet en dag).
 *
 * @throws Om nyckeln inte är på formen YYYY-MM-DD (datafel, fail loud).
 */
export function formatDayHeading(dateKey: string): string {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    throw new Error(`Ogiltig dag-nyckel (väntade YYYY-MM-DD): "${dateKey}".`);
  }
  const [, year, month, day] = m;
  // 12:00 lokal-ish (vi bygger Date i lokal zon med dag-komponenterna); valet av
  // klockslag mitt på dagen gör formateringen okänslig för zon-offset.
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  return formatted;
}

/**
 * En kompakt svensk dag-etikett för datumnavigerings-knappar, t.ex. "ons 10 jun".
 * Samma lokala-väggklocka-tolkning som formatDayHeading.
 *
 * @throws Om nyckeln inte är på formen YYYY-MM-DD.
 */
export function formatDayShort(dateKey: string): string {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    throw new Error(`Ogiltig dag-nyckel (väntade YYYY-MM-DD): "${dateKey}".`);
  }
  const [, year, month, day] = m;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  return new Intl.DateTimeFormat('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}
