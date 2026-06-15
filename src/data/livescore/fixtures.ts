// Fixtures-läge för livescore: en committad live-ögonblicksbild HÄRLEDD ur verklig
// API-Football-data, så Bit 3:s livekort kan renderas UTAN backend/nyckel/nätverk
// (fixtures-först, samma princip som data-source.ts). Detta är inte påhittad data,
// det är de fångade __fixtures__/-svaren körda genom den RIKTIGA parsern, så formen
// är garanterat den parsern producerar live (fixtures måste uppfylla KÄLLANS schema,
// inte konsument-formen, här bevisat genom att fixturen ÄR källan parsad).
//
// Råa sample-svar importeras som text via Vites ?raw och JSON.parse:as (samma
// mönster som wc2026-källfilernas ?raw-import), så vi inte är beroende av
// resolveJsonModule och fixturen alltid går via parsern (ingen handredigerad form).

import type {
  RawApiResponse,
  RawEvent,
  RawFixtureResponse,
  RawLineupResponse,
  RawStatisticsResponse,
} from './api-football-types';
import type {
  FinalResult,
  LiveEvent,
  LiveLineup,
  LiveMatchSnapshot,
  LiveTeamStatistics,
} from './live-types';
import {
  parseEvents,
  parseFinalResult,
  parseLineups,
  parseLiveFixtures,
  parseStatistics,
} from './parse-live';

import liveAllRaw from './__fixtures__/live-all.json?raw';
import eventsRaw from './__fixtures__/events-rich.json?raw';
import statisticsRaw from './__fixtures__/statistics-rich.json?raw';
import lineupsRaw from './__fixtures__/lineups-rich.json?raw';
import finishedRaw from './__fixtures__/fixture-finished-ft.json?raw';
import aetPenRaw from './__fixtures__/fixture-aet-pen.json?raw';

/** Parsa en committad sample-fil (text -> typat råsvar). En sanning för fixtures-källan. */
function parseRaw<T>(raw: string): RawApiResponse<T> {
  return JSON.parse(raw) as RawApiResponse<T>;
}

/** De RÅA sample-svaren (för tester som vill köra parsern mot oförändrad källform). */
export const liveAllResponse = parseRaw<RawFixtureResponse>(liveAllRaw);
export const eventsResponse = parseRaw<RawEvent>(eventsRaw);
export const statisticsResponse = parseRaw<RawStatisticsResponse>(statisticsRaw);
export const lineupsResponse = parseRaw<RawLineupResponse>(lineupsRaw);
export const finishedResponse = parseRaw<RawFixtureResponse>(finishedRaw);

/**
 * Riktigt straffavgjort slutspelssvar (Argentina-Frankrike, VM-finalen 2022,
 * status PEN). GULD-KÄLLA för facit-regeln: goals 3-3 (aggregat efter förlängning,
 * exkl. straffar), fulltime 2-2, extratime 1-1, penalty 4-2. Bevisar att facit
 * kommer ur `goals` (3-3), inte ur `score.extratime` (1-1).
 */
export const aetPenResponse = parseRaw<RawFixtureResponse>(aetPenRaw);

/** Live-ögonblicksbilder för fixtures-läget (Nederländerna-Japan, en pågående VM-match). */
export const fixtureLiveSnapshots: LiveMatchSnapshot[] = parseLiveFixtures(liveAllResponse);

/** Rika matchhändelser för fixtures-läget (22 events ur en avgjord match). */
export const fixtureLiveEvents: LiveEvent[] = parseEvents(eventsResponse);

/** Per-lags matchstatistik för fixtures-läget. */
export const fixtureLiveStatistics: LiveTeamStatistics[] = parseStatistics(statisticsResponse);

/** Per-lags laguppställningar för fixtures-läget. */
export const fixtureLiveLineups: LiveLineup[] = parseLineups(lineupsResponse);

/** Ett facit (slutresultat) för fixtures-läget, ur ett id-uppslag på en avgjord match. */
export const fixtureFinalResult: FinalResult = parseFinalResult(finishedResponse);

/**
 * Ett straffavgjort facit för fixtures-läget (Argentina-Frankrike 2022): slutresultat
 * 3-3 ur `goals`, straffar 4-2, decidedBy 'penalties'. Kör guld-källan genom den
 * riktiga parsern, så fixturen är aktiv (inte död test-data) och vaktas mot form-drift.
 */
export const fixturePenaltyResult: FinalResult = parseFinalResult(aetPenResponse);
