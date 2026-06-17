// REN AGGREGERING för de EVENTS-härledda turneringsstatistik-aggregaten (T88, #180). Ingen IO,
// inget React, ingen Date.now() , rent in (alla matchers events) -> rent ut (rankade rader/
// fördelningar), så reglerna är trivialt enhetstestbara (samma anda som scorer-table.ts).
//
// ÅTERANVÄNDNING (PRINCIPLES §4, DRY): vi parsar ALDRIG events själva här. Den DELADE
// projektionen (match-stats: extractGoals/extractCards) äger "vad är ett mål/kort, vem är
// skytt, är det straff/egenmål", redan hårt testad. Vi AGGREGERAR bara dess utdata över ALLA
// matcher , exakt som T87:s skytteliga gör för mål/assist.
//
// =====================================================================================
// DOMÄNREGLER (KÄLLHÄNVISADE , gissas aldrig; se även docs/decisions.md 2026-06-16 T88 + T100):
//
//  K1. KORT-LIGA: gult OCH rött räknas som ett kort (flest kort = flest tillsägelser). En
//      spelare utan känt id HOPPAS i spelar-tally:n (gissar aldrig att två okända är samma,
//      samma R3 som skytteligan), men kortet räknas ändå för LAGET (lag-id finns alltid).
//      KÄLLA: extractCards (T86, färgen normaliserad ur API-Football detail).
//
//  T1. SNABBASTE MÅL: tidigaste (minute, sedan extra) goal-event över alla matcher. Egenmål
//      INGÅR (det föll ett mål den minuten, oavsett vem som petade in det). KÄLLA: extractGoals
//      minute/extra (event.time.elapsed/+extra).
//
//  T2. 15-MIN-FÖRDELNING: varje mål faller i en hink efter spelad minut. Hinkarna 0-15, 16-30,
//      31-45, 46-60, 61-75, 76-90, samt 90+ för ALLT tilläggs-spel (extra != null), så ett
//      "90+3" inte trycks ihop med ordinarie 76-90. PRESENTATIONS-konvention (rimlig), inte en
//      officiell FIFA-indelning, så den motiveras men hävdas inte som källhänvisad sanning.
//
//  COVERAGE (T100, #207): ALLA aggregat i denna fil kan PER NATUR bara se de matcher som har
//  event-data (match_live_data, en delmängd , de auto-pollade). En match utan event-rad är
//  osynlig här. Därför är det HÄR vi placerar event-täckande stats (snabbaste mål, mål-tidning,
//  kort-liga) , men de coverage-MÄRKS i vyn ("baseras på N matcher med detaljerad spelardata").
//  Score-/antals-stats som ska täcka ALLA matcher (lag-mål, mål-per-match) bor i stället i
//  tournament-stats-tables.ts (`aggregateTeamScoreGoals`), source:ade ur officiellt facit.
// =====================================================================================

import { extractCards, extractGoals } from '../../data/match-stats';
import type { MatchGoal } from '../../data/match-stats';
import type { LiveMatchEvents } from '../../data/livescore';

// ---------------------------------------------------------------------------------------
// Kort-liga (K1)
// ---------------------------------------------------------------------------------------

/** En rad i kort-ligan (spelare): kort aggregerade över VM. */
export interface CardPlayerRow {
  playerId: number;
  playerName: string;
  teamApiId: number;
  teamName: string;
  /** Totalt antal kort (gult + rött). */
  total: number;
  yellow: number;
  red: number;
  /** Distinkta matcher spelaren fått kort i. */
  matches: number;
}

/** En rad i kort-ligan (lag): kort aggregerade per lag. */
export interface CardTeamRow {
  teamApiId: number;
  teamName: string;
  total: number;
  yellow: number;
  red: number;
}

/** Kort-ligan: spelare + lag, båda rankade på flest kort. */
export interface CardLeague {
  players: CardPlayerRow[];
  teams: CardTeamRow[];
}

interface CardPlayerAcc {
  playerId: number;
  playerName: string;
  teamApiId: number;
  teamName: string;
  yellow: number;
  red: number;
  matchIds: Set<string>;
}

interface CardTeamAcc {
  teamApiId: number;
  teamName: string;
  yellow: number;
  red: number;
}

/**
 * Aggregera kort-ligan (spelare + lag) över ALLA matcher. En spelare utan känt id räknas BARA
 * för laget (K1: gissar aldrig att två okända kort-tagare är samma spelare). Rankning: flest
 * total, sedan flest rött (grövre), sedan namn (stabil ordning).
 */
export function aggregateCardLeague(matches: readonly LiveMatchEvents[]): CardLeague {
  const byPlayer = new Map<number, CardPlayerAcc>();
  const byTeam = new Map<number, CardTeamAcc>();

  for (const { matchId, events } of matches) {
    for (const c of extractCards(events)) {
      // Lag-tally: alltid (lag-id finns även när spelar-id saknas).
      const team = byTeam.get(c.teamApiId) ?? {
        teamApiId: c.teamApiId,
        teamName: c.teamName,
        yellow: 0,
        red: 0,
      };
      team.teamName = c.teamName;
      if (c.color === 'yellow') {
        team.yellow += 1;
      } else {
        team.red += 1;
      }
      byTeam.set(c.teamApiId, team);

      // Spelar-tally: bara med känt id + namn (K1/R3).
      if (c.playerId === null || c.playerName === null) {
        continue;
      }
      const player = byPlayer.get(c.playerId) ?? {
        playerId: c.playerId,
        playerName: c.playerName,
        teamApiId: c.teamApiId,
        teamName: c.teamName,
        yellow: 0,
        red: 0,
        matchIds: new Set<string>(),
      };
      player.playerName = c.playerName;
      player.teamApiId = c.teamApiId;
      player.teamName = c.teamName;
      if (c.color === 'yellow') {
        player.yellow += 1;
      } else {
        player.red += 1;
      }
      player.matchIds.add(matchId);
      byPlayer.set(c.playerId, player);
    }
  }

  const players: CardPlayerRow[] = [...byPlayer.values()].map((p) => ({
    playerId: p.playerId,
    playerName: p.playerName,
    teamApiId: p.teamApiId,
    teamName: p.teamName,
    total: p.yellow + p.red,
    yellow: p.yellow,
    red: p.red,
    matches: p.matchIds.size,
  }));
  const teams: CardTeamRow[] = [...byTeam.values()].map((t) => ({
    teamApiId: t.teamApiId,
    teamName: t.teamName,
    total: t.yellow + t.red,
    yellow: t.yellow,
    red: t.red,
  }));

  players.sort(
    (a, b) => b.total - a.total || b.red - a.red || a.playerName.localeCompare(b.playerName, 'sv')
  );
  teams.sort(
    (a, b) => b.total - a.total || b.red - a.red || a.teamName.localeCompare(b.teamName, 'sv')
  );
  return { players, teams };
}

// ---------------------------------------------------------------------------------------
// Snabbaste mål + 15-min-fördelning (T1, T2)
// ---------------------------------------------------------------------------------------

/** Hinkarnas etiketter i ordning (T2). 90+ samlar ALLT tilläggsspel. */
export const GOAL_TIMING_BUCKETS = [
  '0-15',
  '16-30',
  '31-45',
  '46-60',
  '61-75',
  '76-90',
  '90+',
] as const;

export type GoalTimingBucketLabel = (typeof GOAL_TIMING_BUCKETS)[number];

/** En hink i 15-min-fördelningen. */
export interface GoalTimingBucket {
  label: GoalTimingBucketLabel;
  count: number;
}

/** Det snabbaste målet (tidigaste minut) i turneringen. */
export interface FastestGoal {
  minute: number;
  extra: number | null;
  /** Skyttens namn, null när API:t saknade det (gissa aldrig). */
  scorerName: string | null;
  teamName: string;
  matchId: string;
}

/** Mål-tidnings-aggregatet: snabbaste mål + 15-min-fördelning. */
export interface GoalTiming {
  /** Tidigaste målet, null innan turneringens första mål. */
  fastest: FastestGoal | null;
  /** Alla hinkar i ordning (alltid alla 7, även de tomma , stabil stapel). */
  buckets: GoalTimingBucket[];
}

/** Vilken 15-min-hink ett mål faller i (T2). Tilläggsspel (extra != null) -> '90+'. */
function bucketFor(goal: MatchGoal): GoalTimingBucketLabel {
  if (goal.extra !== null) {
    return '90+';
  }
  const m = goal.minute;
  if (m <= 15) return '0-15';
  if (m <= 30) return '16-30';
  if (m <= 45) return '31-45';
  if (m <= 60) return '46-60';
  if (m <= 75) return '61-75';
  if (m <= 90) return '76-90';
  // En minut > 90 utan `extra` (ovanligt men möjligt i råa data) hör till tilläggsspelet.
  return '90+';
}

/** Är mål A tidigare än mål B? (minut, sedan tillägg; null-tillägg = 0). */
function isEarlier(a: MatchGoal, b: MatchGoal): boolean {
  if (a.minute !== b.minute) {
    return a.minute < b.minute;
  }
  return (a.extra ?? 0) < (b.extra ?? 0);
}

/**
 * Aggregera snabbaste mål + 15-min-fördelning över ALLA matcher. Egenmål INGÅR (T1: det föll
 * ett mål). Hinkarna initieras alltid till 0 i ordning, så stapeln är stabil även tom.
 */
export function aggregateGoalTiming(matches: readonly LiveMatchEvents[]): GoalTiming {
  const counts = new Map<GoalTimingBucketLabel, number>(
    GOAL_TIMING_BUCKETS.map((label) => [label, 0])
  );
  let fastestGoal: MatchGoal | null = null;
  let fastestMatchId = '';

  for (const { matchId, events } of matches) {
    for (const goal of extractGoals(events)) {
      counts.set(bucketFor(goal), (counts.get(bucketFor(goal)) ?? 0) + 1);
      if (fastestGoal === null || isEarlier(goal, fastestGoal)) {
        fastestGoal = goal;
        fastestMatchId = matchId;
      }
    }
  }

  const buckets: GoalTimingBucket[] = GOAL_TIMING_BUCKETS.map((label) => ({
    label,
    count: counts.get(label) ?? 0,
  }));
  const fastest: FastestGoal | null =
    fastestGoal === null
      ? null
      : {
          minute: fastestGoal.minute,
          extra: fastestGoal.extra,
          scorerName: fastestGoal.scorerName,
          teamName: fastestGoal.teamName,
          matchId: fastestMatchId,
        };
  return { fastest, buckets };
}

// NOTERA (T100, #207): "flest mål per lag" + turneringens mål-total/snitt FLYTTADES härifrån till
// tournament-stats-tables.ts (`aggregateTeamScoreGoals`), source:at ur det OFFICIELLA facit i
// stället för events. Roten: events-lagret (match_live_data) täcker bara en delmängd matcher, så en
// match utan event-rad (t.ex. en 7-1 utan auto-poll) var osynlig och stat:en blev fel (visade fel
// lag som etta + fel målsnitt). De EVENTS-härledda stats:en ovan (snabbaste mål, mål-per-15min,
// kort-liga) stannar event-baserade men ska coverage-märkas i vyn ("baseras på N matcher med
// detaljerad spelardata"), eftersom de per natur bara kan se de matcher som HAR event-data.
