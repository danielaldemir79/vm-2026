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
// DOMÄNREGLER (KÄLLHÄNVISADE , gissas aldrig; se även docs/decisions.md 2026-06-16 T88):
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
//  G1. FLEST MÅL PER LAG (F1, VIKTIGT , egenmåls-lag-kreditering OVERIFIERAD): ett egenmål är
//      gjort AV en spelare men räknas FÖR motståndarlaget; API-Footballs `team`-fält är
//      tvetydigt och de stora API:erna är oeniga (kunde ej källverifieras, doc 403). Vi tolkar
//      därför ALDRIG om team-fältet: ett egenmål krediteras INTE till något lags mål-tally,
//      det noteras bara separat (ownGoals). Ett lags `goals` = mål av lagets spelare EXKLUSIVE
//      egenmål (det öppna spelets mål + straffmål, vars teamApiId är det icke-tvetydiga,
//      gjorda-för-laget). KÄLLA: docs/decisions.md 2026-06-16 (T86 + T88), match-stats
//      `isOwnGoalDetail`.
//
//  G2. TURNERINGENS MÅL-TOTAL + SNITT: totalGoals = ALLA mål i matcherna INKLUSIVE egenmål
//      (FIFA räknar egenmål i en turnerings måltotal , det föll ett mål). goalAverage =
//      totalGoals / matchesPlayed (matcher med minst ett mål-event), 0 vid 0 matcher (ingen
//      division med noll). Detta är medvetet SKILT från lag-tally:n (G1): totalen räknar målet,
//      men lag-krediteringen av just egenmålet vågar vi inte (team-fältet overifierat).
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

// ---------------------------------------------------------------------------------------
// Flest mål per lag + turneringens mål-total/snitt (G1, G2)
// ---------------------------------------------------------------------------------------

/** En rad i lag-mål-tabellen: ett lags mål (EXKLUSIVE egenmål, G1). */
export interface TeamGoalRow {
  teamApiId: number;
  teamName: string;
  /** Mål av lagets spelare, egenmål EXKLUDERAT (F1/G1). Straffmål INGÅR. */
  goals: number;
  /** Distinkta matcher laget gjort mål i. */
  matches: number;
}

/** Lag-mål-aggregatet + turneringens mål-total och snitt. */
export interface TeamGoals {
  /** Lag rankade på flest mål (egenmål-medvetet, G1). */
  teams: TeamGoalRow[];
  /** ALLA mål i matcherna INKLUSIVE egenmål (FIFA:s turneringstotal, G2). */
  totalGoals: number;
  /** Antal egenmål (noteras separat, krediteras inget lag, F1/G1). */
  ownGoals: number;
  /** Matcher med minst ett mål-event (G2:s nämnare). */
  matchesPlayed: number;
  /** totalGoals / matchesPlayed, 0 vid 0 matcher (ingen division med noll, G2). */
  goalAverage: number;
}

interface TeamGoalAcc {
  teamApiId: number;
  teamName: string;
  goals: number;
  matchIds: Set<string>;
}

/**
 * Aggregera flest mål per lag (egenmåls-medvetet, G1) + turneringens mål-total/snitt (G2).
 * Ett lags `goals` exkluderar egenmål; turneringens `totalGoals` inkluderar dem.
 */
export function aggregateTeamGoals(matches: readonly LiveMatchEvents[]): TeamGoals {
  const byTeam = new Map<number, TeamGoalAcc>();
  let totalGoals = 0;
  let ownGoals = 0;
  let matchesPlayed = 0;

  for (const { matchId, events } of matches) {
    const goals = extractGoals(events);
    if (goals.length > 0) {
      matchesPlayed += 1; // matchen "spelades" (hade minst ett mål-event)
    }
    for (const goal of goals) {
      totalGoals += 1; // FIFA:s turneringstotal: varje mål-event räknas (G2)
      if (goal.isOwnGoal) {
        ownGoals += 1;
        continue; // G1: krediteras INTE till något lags mål-tally (team-fältet overifierat)
      }
      const acc = byTeam.get(goal.teamApiId) ?? {
        teamApiId: goal.teamApiId,
        teamName: goal.teamName,
        goals: 0,
        matchIds: new Set<string>(),
      };
      acc.teamName = goal.teamName;
      acc.goals += 1;
      acc.matchIds.add(matchId);
      byTeam.set(goal.teamApiId, acc);
    }
  }

  const teams: TeamGoalRow[] = [...byTeam.values()].map((t) => ({
    teamApiId: t.teamApiId,
    teamName: t.teamName,
    goals: t.goals,
    matches: t.matchIds.size,
  }));
  teams.sort(
    (a, b) =>
      b.goals - a.goals || a.matches - b.matches || a.teamName.localeCompare(b.teamName, 'sv')
  );

  const goalAverage = matchesPlayed === 0 ? 0 : totalGoals / matchesPlayed;
  return { teams, totalGoals, ownGoals, matchesPlayed, goalAverage };
}
