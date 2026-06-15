// Match-identitet: koppla en API-Football-fixture (LiveMatchSnapshot) till appens
// egen match (Match.id, t.ex. 'g-F-1'). Detta är SKARVEN mellan två datakällor och
// just den gren som är lättast att få tyst fel (en happy-path-mock bevisar aldrig
// mappningen mellan två identitets-rymder), så den är fullt testad mot de fångade samplen.
//
// STRATEGI (gissar aldrig en koppling):
//   1. LAG-IDENTITET via den committade, källhänvisade bryggan (team-bridge.ts):
//      API-team-id -> app-lag-id. Båda lagen måste finnas i bryggan OCH matcha
//      appmatchens hemma/borta-par (i någon ordning, se nedan).
//   2. AVSPARKSTID inom ett rimligt fönster (UTC), som andra bekräftelse: även om
//      två lag möts flera gånger (gruppspel + ev. retur) särskiljer kickoff matchen.
//
// Båda måste stämma. En fixture vars lag inte (ännu) finns i bryggan, eller vars
// kickoff inte matchar någon appmatch, returneras som 'unresolved' , aldrig en
// gissad koppling. Det gör Bit 1 robust mot en ofullständig brygga (preambeln i
// team-bridge.ts): okända lag blockerar inte, de markeras bara olösta.

import type { Match } from '../../domain/types';
import { WC2026_MATCHES } from '../wc2026/matches';
import type { LiveMatchSnapshot } from './live-types';
import { resolveAppTeamId, WC2026_API_TEAM_BRIDGE } from './team-bridge';

/**
 * Hur nära i tid en API-fixtures avspark måste ligga appmatchens kickoff för att
 * räknas som samma match. Avsparkstider kan justeras något (TV-tablå vs API), och
 * vi vill tåla minut-drift utan att råka matcha en HELT annan match samma dag. Ett
 * par timmar är rymligt nog för rimlig drift men snävt nog att inte fånga nästa
 * avspark (VM-matcher ligger normalt minst 3 h isär per arena/fönster).
 */
export const KICKOFF_MATCH_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Resultatet av ett identitets-försök. Diskriminerad union, fail-loud-vänlig. */
export type MatchResolution =
  | { kind: 'resolved'; appMatchId: string; apiFixtureId: number }
  | { kind: 'unresolved'; apiFixtureId: number; reason: string };

/** Returnerar [hemma-id, borta-id] som appens lag-id, eller null om något lag är okänt. */
function bridgeBoth(snapshot: LiveMatchSnapshot): [string, string] | null {
  const home = resolveAppTeamId(snapshot.homeTeamApiId);
  const away = resolveAppTeamId(snapshot.awayTeamApiId);
  if (home === null || away === null) {
    return null;
  }
  return [home, away];
}

/** Sant om appmatchens lag-par är samma som API-paret (hemma/borta ELLER omvänt). */
function teamsMatch(match: Match, appHome: string, appAway: string): boolean {
  if (match.homeTeamId === null || match.awayTeamId === null) {
    return false; // slutspelsmatch utan seedade lag kan inte lag-matchas
  }
  const sameOrder = match.homeTeamId === appHome && match.awayTeamId === appAway;
  // Tål att API:t har hemma/borta omvänt mot appens tablå , lag-PARET avgör
  // identiteten, hemma/borta-orienteringen är inte en del av match-identiteten.
  const swapped = match.homeTeamId === appAway && match.awayTeamId === appHome;
  return sameOrder || swapped;
}

/** Sant om appmatchens kickoff ligger inom fönstret från API-fixtures avspark. */
function kickoffMatches(match: Match, snapshot: LiveMatchSnapshot): boolean {
  const appMs = Date.parse(match.kickoff);
  const apiMs = Date.parse(snapshot.kickoffUtc);
  if (Number.isNaN(appMs) || Number.isNaN(apiMs)) {
    return false;
  }
  return Math.abs(appMs - apiMs) <= KICKOFF_MATCH_WINDOW_MS;
}

/**
 * Koppla EN API-fixture till en appmatch. Kräver BÅDE lag-identitet (via bryggan)
 * OCH kickoff inom fönstret. Returnerar 'unresolved' med en läsbar orsak om något
 * saknas , aldrig en gissad koppling.
 *
 * @param snapshot  den normaliserade API-fixturen.
 * @param matches   appens matcher (injicerbar för test, default = WC2026_MATCHES).
 */
export function resolveAppMatch(
  snapshot: LiveMatchSnapshot,
  matches: readonly Match[] = WC2026_MATCHES
): MatchResolution {
  const bridged = bridgeBoth(snapshot);
  if (bridged === null) {
    return {
      kind: 'unresolved',
      apiFixtureId: snapshot.apiFixtureId,
      reason:
        `lag saknas i bryggan (API-id ${snapshot.homeTeamApiId}/${snapshot.awayTeamApiId}); ` +
        'bryggan kompletteras före go-live',
    };
  }
  const [appHome, appAway] = bridged;

  const candidates = matches.filter(
    (m) => teamsMatch(m, appHome, appAway) && kickoffMatches(m, snapshot)
  );

  if (candidates.length === 0) {
    return {
      kind: 'unresolved',
      apiFixtureId: snapshot.apiFixtureId,
      reason: `ingen appmatch med lag ${appHome}/${appAway} inom kickoff-fönstret (${snapshot.kickoffUtc})`,
    };
  }
  if (candidates.length > 1) {
    // Två kandidater inom fönstret vore tvetydigt , hellre fail loud (olöst) än
    // att tyst välja en. I praktiken omöjligt med 2 h-fönstret, men vi gissar inte.
    return {
      kind: 'unresolved',
      apiFixtureId: snapshot.apiFixtureId,
      reason: `tvetydigt: ${candidates.length} appmatcher matchar lag ${appHome}/${appAway} inom fönstret`,
    };
  }
  return {
    kind: 'resolved',
    appMatchId: candidates[0].id,
    apiFixtureId: snapshot.apiFixtureId,
  };
}

/** En rad i täcknings-rapporten: en appmatch och om den kan lösas via bryggan. */
export interface CoverageRow {
  appMatchId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** Sant om BÅDA lagen i matchen finns i bryggan (matchen kan lösas från live-data). */
  bridgeable: boolean;
}

/** En sammanfattning av hur stor del av appens matcher bryggan i dag täcker. */
export interface CoverageReport {
  totalMatches: number;
  /** Antal matcher där båda lagen finns i bryggan. */
  bridgeableMatches: number;
  rows: CoverageRow[];
}

/**
 * Bygg en TESTBAR täckningsrapport: vilka appmatcher KAN lösas mot live-data med
 * dagens brygga, och vilka inte (för att en slutspelsmatch saknar seedade lag,
 * eller för att lagets API-id ännu inte är i bryggan). Gör den ofullständiga
 * bryggan synlig och mätbar i stället för en tyst lucka , Bit 2 fyller på resten.
 *
 * @param matches  appens matcher (injicerbar, default = WC2026_MATCHES).
 */
export function resolveMatchCoverage(matches: readonly Match[] = WC2026_MATCHES): CoverageReport {
  const rows: CoverageRow[] = matches.map((m) => {
    const bridgeable =
      m.homeTeamId !== null &&
      m.awayTeamId !== null &&
      isTeamBridged(m.homeTeamId) &&
      isTeamBridged(m.awayTeamId);
    return {
      appMatchId: m.id,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      bridgeable,
    };
  });
  return {
    totalMatches: rows.length,
    bridgeableMatches: rows.filter((r) => r.bridgeable).length,
    rows,
  };
}

// Mängden app-lag-id som bryggan känner (härledd EN gång ur bryggan, en sanning).
const BRIDGED_APP_TEAM_IDS: ReadonlySet<string> = new Set(Object.values(WC2026_API_TEAM_BRIDGE));

/** Sant om ett app-lag-id finns någonstans i bryggans värde-mängd. */
function isTeamBridged(appTeamId: string): boolean {
  return BRIDGED_APP_TEAM_IDS.has(appTeamId);
}
