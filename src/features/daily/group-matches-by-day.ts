// Gruppera matcher per SVENSK kalenderdag (REN funktion, inget I/O, ingen React).
//
// KRITISK tidszons-regel (känd fälla `utc-datum-anvant-som-lokalt-datum`,
// senior-developer lessons): Match.kickoff lagras i UTC (se matches.ts +
// match-schedule-parser.ts), men den dagliga matchvyn grupperar och visar per
// SVENSK kalenderdag (Europe/Stockholm). En match som spelas 00:00 svensk tid
// hör till den svenska dagen, INTE till UTC-dygnet före (kickoff är då ~22:00Z
// dagen innan). Att klippa ut datumdelen ur kickoff-strängen (UTC) vore en
// off-by-one just kring midnatt. Därför härleds kalenderdatumet ur zonen via
// Intl (samma teknik som parserns zoneOffsetMinutes), inte ur UTC-ISO-strängen.
//
// VARFÖR en egen ren modul (inte inline i vyn/hooken): dag-grupperingen är logik
// utan React-beroende, så den kan enhetstestas fristående (inkl. midnatts-fallet
// så off-by-one fångas) och vyn/hooken blir tunna. Samma uppdelning som
// deriveGroupTables (härledd-state-vy-mönstret, docs/patterns.md).

import type { Match } from '../../domain/types';

/**
 * IANA-tidszonen den dagliga vyn grupperar/visar i. EN sanning: samma zon som
 * tablå-källan uttrycktes i (SOURCE_TIMEZONE i match-schedule-parser.ts). Vi
 * importerar inte den konstanten hit för att inte koppla vy-lagret till
 * parser-/generator-lagret (olika ansvar), men hålls medvetet identisk: båda är
 * svensk tid. Byts den ena ska den andra följa.
 */
export const DISPLAY_TIMEZONE = 'Europe/Stockholm';

/** En kalenderdag i den dagliga vyn: dag-nyckel + matcherna den dagen. */
export interface MatchDay {
  /**
   * Dag-nyckeln som ett LOKALT (svenskt) kalenderdatum, "YYYY-MM-DD". Härlett i
   * DISPLAY_TIMEZONE, inte via UTC-ISO-strängen (off-by-one-skyddet ovan). Stabil
   * och jämförbar/sorterbar som sträng (ISO-datumform). Datumnavigeringen
   * stegar mellan dessa nycklar.
   */
  dateKey: string;
  /** Matcherna den dagen, sorterade på avsparkstid (tidigast först). */
  matches: Match[];
}

/**
 * Härled det lokala kalenderdatumet (YYYY-MM-DD) för ett UTC-instant i en given
 * IANA-zon. Använder Intl med `en-CA` (vars korta datumformat redan är
 * YYYY-MM-DD) så vi slipper plocka isär och pussla ihop delar för hand.
 *
 * VARFÖR Intl och inte `toISOString().slice(0, 10)`: ISO-strängen är i UTC; att
 * klippa datumdelen ärver UTC-dygnet, inte det svenska. En match 2026-06-13T22:00Z
 * är 2026-06-14 00:00 svensk tid, alltså svenska dagen 2026-06-14, inte 06-13.
 */
export function localDateKey(isoInstant: string, timeZone: string = DISPLAY_TIMEZONE): string {
  const date = new Date(isoInstant);
  if (Number.isNaN(date.getTime())) {
    // Fail loud (PRINCIPLES §8): en ogiltig kickoff är ett datafel, inte något
    // att tyst gruppera under en gissad dag.
    throw new Error(`Ogiltig kickoff-tidsstämpel: "${isoInstant}".`);
  }
  // en-CA ger ISO-ordningen (2026-06-14) ut ur den lokaliserade formateringen.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Gruppera matcher per svensk kalenderdag och returnera dagarna i
 * KRONOLOGISK ordning (tidigaste dagen först), var och en med sina matcher
 * sorterade på avsparkstid.
 *
 * Tom indata ger en tom lista (normalfall: "idag" kan ligga före turneringen,
 * datumnavigeringen visar tom-dag-tillståndet). Funktionen muterar inte sina
 * argument (kopierar innan sort), så den kan köras om reaktivt vid varje ändring.
 *
 * @param matches   Alla matcher (UTC-kickoff). Slutspel utan kända lag tas med:
 *                  de har ändå en avsparkstid och hör till en speldag.
 * @param timeZone  Zonen att gruppera i (default svensk tid). Injicerbar för test.
 */
export function groupMatchesByDay(
  matches: readonly Match[],
  timeZone: string = DISPLAY_TIMEZONE
): MatchDay[] {
  const byDay = new Map<string, Match[]>();
  for (const match of matches) {
    const key = localDateKey(match.kickoff, timeZone);
    const bucket = byDay.get(key);
    if (bucket) {
      bucket.push(match);
    } else {
      byDay.set(key, [match]);
    }
  }

  // Sortera dagarna kronologiskt (dateKey är ISO-datumform, sträng-sort = datum-
  // sort) och matcherna inom varje dag på avsparks-instant (UTC-jämförelse är
  // korrekt även mellan två svenska klockslag, instanten är entydig).
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, dayMatches]) => ({
      dateKey,
      matches: [...dayMatches].sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
    }));
}
