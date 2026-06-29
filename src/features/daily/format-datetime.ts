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
 * Kort svensk avsparksDAG ur en UTC-instant, t.ex. "5 juli" eller "28 juni"
 * (dag + kort månad, utan veckodag och årtal). Används där en kompakt
 * avsparksdag ska visas utan klockslag, t.ex. på slutspelsträdets KOMMANDE
 * matchnoder (båda lag kända, ännu ospelad), så ögat ser NÄR matchen spelas
 * i stället för en tvetydig "klar"-markör.
 *
 * KRITISKT (off-by-one-fällan, senior-developer lessons): kickoff är en UTC-
 * instant, så vi formaterar via Europe/Stockholm med Intl, vi klipper ALDRIG
 * ISO-datumet rakt av. En avspark sent på kvällen UTC kan annars landa på FEL
 * svensk dag (t.ex. 23:00Z = 01:00 svensk tid nästa dag), och då skulle ett
 * rått datum-klipp visa gårdagens datum.
 */
export function formatKickoffDateShort(
  isoInstant: string,
  timeZone: string = DISPLAY_TIMEZONE
): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    day: 'numeric',
    month: 'short',
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
 * En svensk dag-etikett UTAN årtal ur en dag-nyckel ("YYYY-MM-DD"), t.ex.
 * "torsdag 11 juni". Samma lokala-väggklocka-tolkning som formatDayHeading (12:00
 * lokal -> okänslig för zon-offset), men utan år. Används där årtalet är brus i en
 * kort etikett (t.ex. hero:ns "dagens match"-rad som visar matchens dag när den
 * inte spelas idag), versaliseras av anroparen via CSS (uppercase) vid behov.
 *
 * @throws Om nyckeln inte är på formen YYYY-MM-DD (datafel, fail loud).
 */
export function formatDayHeadingNoYear(dateKey: string): string {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    throw new Error(`Ogiltig dag-nyckel (väntade YYYY-MM-DD): "${dateKey}".`);
  }
  const [, year, month, day] = m;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  return new Intl.DateTimeFormat('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
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
