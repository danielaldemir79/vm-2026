// REN URVALS-MODELL för "LIVE NU"-fältet (Bit 3c): vilka matcher PÅGÅR just nu, och i
// vilken ordning de ska visas i topp-fältets live-block. Helt utan IO och utan React,
// rent in (alla matcher + lag + live-data per match-id), rent ut (en sorterad lista),
// så urvalet är trivialt enhetstestbart, samma anda som countdown.ts/live-card-model.ts.
//
// VARFÖR ETT EGET LAGER (Bit 3c, Daniels live-feedback): topp-fältet blandade ihop en
// PÅGÅENDE match (visad som ett statiskt "dagens match"-kort) med NÄSTA avspark
// (nedräkningen). Det går inte att skilja "vad händer NU" från "vad kommer SEN". Det
// här lagret pekar ut exakt de matcher som faktiskt pågår, så vyn kan LEDA med dem i
// ett tydligt live-block och hålla nedräkningen för nästa avspark separat. Nedräkningen
// (computeCountdown) hoppar redan över pågående/spelade matcher (kickoff i det förflutna),
// så de två blocken kan aldrig peka på samma match.
//
// "PÅGÅR" = live ELLER paus (HT/BT): en match i halvtidsvila pågår fortfarande och hör
// hemma i live-blocket, inte i nedräkningen. En avslutad (frozen) match hör INTE hit,
// den är historik och visas i dagslistan med sitt frusna livekort som förr.

import type { Match, Team } from '../../domain/types';
import type { LiveData } from '../../data/livescore';
import { teamDisplayName } from './match-display';

/** FIFA-landskoden för ett lag (lag-tillhörighet i livekortet), null när laget är okänt. */
function teamCode(teamId: string | null, teamsById: ReadonlyMap<string, Team>): string | null {
  if (teamId === null) {
    return null;
  }
  return teamsById.get(teamId)?.code ?? null;
}

/**
 * En post i live-blocket: matchen, dess live-data och de visningsnamn + det API-lag-id
 * livekortet behöver. Färdigformad så vyn bara renderar, ingen uppslagning i JSX:en.
 */
export interface LiveFeedEntry {
  /** Schemamatchen (för id, steg, lag, kickoff). */
  match: Match;
  /** Den projicerade live-raden (status/ställning/events/...). */
  live: LiveData;
  /** Hemmalagets visningsnamn (appens, så live-panelen talar samma namn som kortet). */
  homeName: string;
  /** Bortalagets visningsnamn. */
  awayName: string;
  /** Hemmalagets FIFA-landskod (lag-tillhörighet på mål/kort i livekortet), null om okänt. */
  homeCode: string | null;
  /** Bortalagets FIFA-landskod, null om okänt. */
  awayCode: string | null;
}

/** Pågår matchen just nu (live eller halvtidsvila)? En frusen/avslutad match gör det inte. */
function isOngoing(status: LiveData['status']): boolean {
  return status === 'live' || status === 'paused';
}

/**
 * En sorterings-rang så det mest RELEVANTA live-läget hamnar överst: en rullande match
 * (live) före en i paus, och inom samma läge den som sparkade igång först (tidigast
 * kickoff = längst kommen). Lägre tal = högre upp.
 */
function relevanceRank(entry: LiveFeedEntry): number {
  return entry.live.status === 'live' ? 0 : 1;
}

/**
 * Välj och ordna de matcher som PÅGÅR just nu för "LIVE NU"-blocket.
 *
 * Går igenom live-datan (inte alla matcher) eftersom bara matcher med en live-rad kan
 * vara igång, slår upp varje rads schemamatch (matchById) och behåller bara de som
 * faktiskt pågår OCH finns i schemat (en live-rad utan schemamatch hoppas, gissa aldrig
 * en match , samma robusthet som fixtures-re-nycklingen). Resultatet sorteras: live
 * före paus, sedan tidigast kickoff först (den match som kommit längst, ett naturligt
 * "huvud-event" överst). Tom lista = inget pågår -> vyn behåller sitt vanliga topp-fält.
 *
 * @param liveByMatchId  live-data per appens match-id (useLiveData.byMatchId).
 * @param matchById      alla turneringens matcher per id (för uppslag av schemamatchen).
 * @param teamsById      lag per id (för visningsnamn).
 */
export function selectLiveFeed(
  liveByMatchId: ReadonlyMap<string, LiveData>,
  matchById: ReadonlyMap<string, Match>,
  teamsById: ReadonlyMap<string, Team>
): LiveFeedEntry[] {
  const entries: LiveFeedEntry[] = [];
  for (const [matchId, live] of liveByMatchId) {
    if (!isOngoing(live.status)) {
      continue; // avslutad/ej startad: hör inte hemma i live-blocket
    }
    const match = matchById.get(matchId);
    if (match === undefined) {
      continue; // ingen schemamatch -> kan inte visas med rätt namn/steg, hoppa
    }
    entries.push({
      match,
      live,
      homeName: teamDisplayName(match.homeTeamId, teamsById),
      awayName: teamDisplayName(match.awayTeamId, teamsById),
      homeCode: teamCode(match.homeTeamId, teamsById),
      awayCode: teamCode(match.awayTeamId, teamsById),
    });
  }
  entries.sort((a, b) => {
    const byRelevance = relevanceRank(a) - relevanceRank(b);
    if (byRelevance !== 0) {
      return byRelevance;
    }
    // Samma läge: tidigast kickoff först (kommit längst). Match-id som stabil tie-break
    // vid exakt samma avspark, så ordningen aldrig flimrar mellan renders.
    const byKickoff = a.match.kickoff.localeCompare(b.match.kickoff);
    return byKickoff !== 0 ? byKickoff : a.match.id.localeCompare(b.match.id);
  });
  return entries;
}
