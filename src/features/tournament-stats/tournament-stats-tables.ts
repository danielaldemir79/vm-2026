// REN AGGREGERING för de TABELL-härledda turneringsstatistik-aggregaten (T88, #180; T100, #207):
// clean sheets + skrällar (upsets) + lag-mål/turnerings-mål ur officiellt facit. Ingen IO, inget
// React , rent in (den resolvade matchplanen + en ranking-uppslagning) -> rent ut (rankade rader).
// Härleds ur den OFFICIELLA matchplanen (FinishedMatch.result, vävt ur official_match_results via
// ResultsProvider , en sanning för facit) + lagens FIFA-ranking, INTE ur live-events.
//
// VARFÖR result-baserat (inte event-baserat): dessa stats handlar om det AVGJORDA resultatet, inte
// om enskilda events. ResultsProvider väver redan in det officiella facit near-live (Realtime på
// official_match_results + fokus/online), så en konsument som läser matchplanen får dem färska vid
// FT, utan att vi bygger en egen läs-väg (DRY). KRITISKT (T100, #207): events-lagret (match_live_data)
// täcker BARA en delmängd matcher (de auto-pollade), så en lag-mål-/mål-per-match-stat HÄRLEDD UR
// EVENTS missar matcher utan event-rad (t.ex. en 7-1 utan auto-poll blir osynlig). Sådana score-/
// antals-stats MÅSTE därför läsa officiellt facit (alla färdiga matcher), precis som clean sheets.
//
// =====================================================================================
// DOMÄNREGLER (KÄLLHÄNVISADE , gissas aldrig; se docs/decisions.md 2026-06-16 T100 + T88):
//
//  C1. CLEAN SHEET: ett lag höll nollan i en match om MOTSTÅNDAREN gjorde 0 mål (i ordinarie
//      tid + ev. förlängning; straffläggning räknas ALDRIG som "insläppta mål"). En 0-0 ger
//      BÅDA lagen en clean sheet. KÄLLA: standard fotbolls-definition (mål mot = 0);
//      MatchResult.homeGoals/awayGoals är redan ordinarie+förlängning EXKLUSIVE straffar
//      (domain/types MatchResult-doc), så straff-grenen är redan hanterad av datamodellen.
//
//  U1. SKRÄLL (UPSET): en match där det LÄGRE rankade laget (HÖGRE FIFA-rankingtal) VANN. Gapet
//      = |vinnarens rankingtal − förlorarens rankingtal| (hur stor skrällen var). Oavgjort är
//      ingen skräll (ingen vinnare). Ett lag utan känd ranking hoppas (gissar ALDRIG ett gap).
//      KÄLLA (ranking): FIFA/Coca-Cola Men's World Ranking, juniutgåvan 2026, samma källåkrade
//      tabell som team-profiles.ts (fifaRanking), injicerad som uppslagning. Lägre tal = bättre
//      lag (FIFA-ranking-konvention). VINNAREN avgörs av ordinarie+förlängning, vid lika av
//      straffarna (MatchResult.penalties) , samma vinnar-härledning som slutspels-trädet.
//
//  G3. LAG-MÅL + TURNERINGS-MÅL UR FACIT (T100, #207, ERSÄTTER den tidigare events-härledda
//      varianten): ett lags `goalsFor` = summan av lagets mål i SLUTRESULTATEN över alla färdiga
//      matcher (hemmalag krediteras home_goals, bortalag away_goals). Detta är EXAKT samma
//      goals-for som grupptabellen visar (compute-standings `applyResult: goalsFor += scored`),
//      bara här tournament-WIDE (även slutspel) i stället för grupp-only , så "Flest mål per lag"
//      matchar GM-kolumnen användaren redan ser (för ett lags gruppmatcher), utan en divergerande
//      siffra. SLUTRESULTATET krediterar redan egenmål till det gynnade laget (egenmålet syns i
//      ställningen), så vi gör INGEN egenmåls-justering här , scorelinen ÄR sanningen. Turneringens
//      `totalGoals` = summan av alla mål i slutresultaten; `matchesPlayed` = antal färdiga matcher
//      (en 0-0 räknas, den spelades); `goalAverage` = totalGoals / matchesPlayed (0 vid 0 matcher,
//      ingen division med noll). `biggestMatch` = den färdiga matchen med högst total scoreline
//      (home_goals + away_goals); vid lika total vinner lägst match-id (stabil ordning). KÄLLA:
//      MatchResult.homeGoals/awayGoals (officiellt facit, official_match_results via ResultsProvider).
//      Verifierat mot prod 2026-06-16: 16 matcher, total 46, snitt 2,875, största g-E-1 7-1, Tyskland
//      (ger) toppar med 7 mål (events-varianten missade g-E-1 och visade fel lag som etta).
// =====================================================================================

import type { Match } from '../../domain/types';

/** En rad i clean-sheet-tabellen: ett lags hållna nollor. */
export interface CleanSheetRow {
  /** Lagets id (gemen FIFA-kod). */
  teamId: string;
  /** Antal matcher laget höll nollan i. */
  cleanSheets: number;
  /** Antal spelade (färdiga) matcher laget hade ett id i. */
  played: number;
}

/** En skräll-rad: en lägre rankad vinst, störst gap = störst skräll. */
export interface UpsetRow {
  matchId: string;
  winnerTeamId: string;
  loserTeamId: string;
  /** Vinnarens FIFA-rankingtal (högre = sämre rankat). */
  winnerRank: number;
  /** Förlorarens FIFA-rankingtal. */
  loserRank: number;
  /** Skräll-gapet = winnerRank − loserRank (alltid > 0 för en skräll). */
  rankGap: number;
}

/** Uppslagning lag-id -> FIFA-rankingtal (null för okänt lag). */
export type RankLookup = (teamId: string) => number | null;

/** En rad i lag-mål-tabellen (G3): ett lags gjorda mål ur slutresultaten. */
export interface TeamScoreGoalRow {
  /** Lagets id (gemen FIFA-kod, samma rymd som clean sheets/upsets). */
  teamId: string;
  /** Lagets gjorda mål summerat ur slutresultaten (samma som grupptabellens GM). */
  goals: number;
  /** Antal färdiga matcher laget hade ett id i (en 0-0 räknas, den spelades). */
  matches: number;
}

/** Den färdiga match som hade flest mål totalt (G3, "Flest mål i en match"). */
export interface BiggestMatch {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  /** Total scoreline (homeGoals + awayGoals), siffran matchen rankas på. */
  total: number;
}

/** Lag-mål-aggregatet + turneringens mål-total/snitt + största matchen (G3, ur officiellt facit). */
export interface TeamScoreGoals {
  /** Lag rankade på flest gjorda mål (sedan färre matcher, sedan id). */
  teams: TeamScoreGoalRow[];
  /** ALLA mål i slutresultaten över färdiga matcher (turneringens måltotal). */
  totalGoals: number;
  /** Antal färdiga matcher (G3:s nämnare; en 0-0 räknas). */
  matchesPlayed: number;
  /** totalGoals / matchesPlayed, 0 vid 0 matcher (ingen division med noll). */
  goalAverage: number;
  /** Den färdiga matchen med högst total scoreline, null när inga matcher spelats. */
  biggestMatch: BiggestMatch | null;
}

interface CleanSheetAcc {
  teamId: string;
  cleanSheets: number;
  played: number;
}

/** Bara FÄRDIGA matcher (status finished bär result, per typgaranti). Hjälpare för båda. */
function finishedMatches(matches: readonly Match[]): Array<Match & { status: 'finished' }> {
  return matches.filter((m): m is Match & { status: 'finished' } => m.status === 'finished');
}

/**
 * Aggregera clean sheets per lag (C1) över de färdiga matcherna. En 0-0 ger båda lagen en
 * nolla. Lag utan id (slutspel innan seedning) hoppas. Rankas på flest nollor (sedan id).
 */
export function aggregateCleanSheets(matches: readonly Match[]): CleanSheetRow[] {
  const byTeam = new Map<string, CleanSheetAcc>();

  const bump = (teamId: string | null, keptCleanSheet: boolean): void => {
    if (teamId === null) {
      return; // slutspelsmatch innan seedning, eller saknat lag , gissa aldrig
    }
    const acc = byTeam.get(teamId) ?? { teamId, cleanSheets: 0, played: 0 };
    acc.played += 1;
    if (keptCleanSheet) {
      acc.cleanSheets += 1;
    }
    byTeam.set(teamId, acc);
  };

  for (const m of finishedMatches(matches)) {
    // C1: ett lag höll nollan om MOTSTÅNDAREN gjorde 0 mål (ordinarie + förlängning).
    bump(m.homeTeamId, m.result.awayGoals === 0);
    bump(m.awayTeamId, m.result.homeGoals === 0);
  }

  const rows = [...byTeam.values()]
    .filter((a) => a.cleanSheets > 0) // bara lag med minst en nolla (ingen 0-rad)
    .map((a) => ({ teamId: a.teamId, cleanSheets: a.cleanSheets, played: a.played }));
  rows.sort((a, b) => b.cleanSheets - a.cleanSheets || a.teamId.localeCompare(b.teamId, 'sv'));
  return rows;
}

/**
 * Härled vinnaren ur ett resultat: högst ordinarie+förlängning, vid lika straffarna (U1, samma
 * vinnar-logik som slutspels-trädet). Returnerar 'home' | 'away' | null (oavgjort utan straffar).
 */
function winnerSide(result: Match['result']): 'home' | 'away' | null {
  if (result === null) {
    return null;
  }
  if (result.homeGoals > result.awayGoals) {
    return 'home';
  }
  if (result.awayGoals > result.homeGoals) {
    return 'away';
  }
  // Lika i ordinarie+förlängning: avgörs av straffar om de finns (slutspel).
  if (result.penalties) {
    if (result.penalties.homeGoals > result.penalties.awayGoals) {
      return 'home';
    }
    if (result.penalties.awayGoals > result.penalties.homeGoals) {
      return 'away';
    }
  }
  return null; // genuint oavgjort (gruppspel) , ingen vinnare, ingen skräll
}

/**
 * Aggregera skrällar (U1): färdiga matcher där det lägre rankade laget vann, rankade störst
 * gap först. Ett lag utan känd ranking hoppas (gissar aldrig ett gap).
 *
 * @param matches  den resolvade matchplanen (FinishedMatch bär result).
 * @param rankOf   uppslagning lag-id -> FIFA-rankingtal (null = okänt, hoppas).
 */
export function aggregateUpsets(matches: readonly Match[], rankOf: RankLookup): UpsetRow[] {
  const upsets: UpsetRow[] = [];

  for (const m of finishedMatches(matches)) {
    const side = winnerSide(m.result);
    if (side === null || m.homeTeamId === null || m.awayTeamId === null) {
      continue; // oavgjort eller oseedad slutspelsmatch , ingen skräll
    }
    const winnerTeamId = side === 'home' ? m.homeTeamId : m.awayTeamId;
    const loserTeamId = side === 'home' ? m.awayTeamId : m.homeTeamId;
    const winnerRank = rankOf(winnerTeamId);
    const loserRank = rankOf(loserTeamId);
    if (winnerRank === null || loserRank === null) {
      continue; // okänd ranking , gissa aldrig ett gap (U1)
    }
    // SKRÄLL bara om vinnaren var LÄGRE rankad (högre rankingtal) än förloraren.
    if (winnerRank <= loserRank) {
      continue; // favoriten vann som väntat , ingen skräll
    }
    upsets.push({
      matchId: m.id,
      winnerTeamId,
      loserTeamId,
      winnerRank,
      loserRank,
      rankGap: winnerRank - loserRank,
    });
  }

  upsets.sort((a, b) => b.rankGap - a.rankGap || a.matchId.localeCompare(b.matchId, 'sv'));
  return upsets;
}

interface TeamScoreAcc {
  teamId: string;
  goals: number;
  matches: number;
}

/**
 * Aggregera lag-mål + turneringens mål-total/snitt + största matchen (G3) ur det OFFICIELLA
 * facit (de färdiga matchernas slutresultat), INTE ur live-events. Det här är fixen i T100
 * (#207): events-lagret täcker bara en delmängd matcher, så en match utan event-rad (t.ex. en
 * 7-1 utan auto-poll) var osynlig för en events-härledd lag-mål-stat. Facit täcker ALLA färdiga
 * matcher, så siffran blir den sanna och matchar grupptabellens GM-kolumn.
 *
 * Ett lags `goals` = summan av lagets mål i slutresultaten (hemma: home_goals, borta: away_goals);
 * scorelinen krediterar redan egenmål till det gynnade laget, så ingen egenmåls-justering görs här
 * (G3). En match utan kända lag (oseedad slutspelsmatch) hoppas för den lag-saknande sidan men
 * räknas ändå i totalen (målen föll). Rankas på flest mål, sedan färre matcher, sedan id.
 */
export function aggregateTeamScoreGoals(matches: readonly Match[]): TeamScoreGoals {
  const byTeam = new Map<string, TeamScoreAcc>();
  let totalGoals = 0;
  let matchesPlayed = 0;
  let biggest: BiggestMatch | null = null;

  const bump = (teamId: string | null, scored: number): void => {
    if (teamId === null) {
      return; // oseedad slutspelsmatch / saknat lag , gissa aldrig vems målen är
    }
    const acc = byTeam.get(teamId) ?? { teamId, goals: 0, matches: 0 };
    acc.goals += scored;
    acc.matches += 1;
    byTeam.set(teamId, acc);
  };

  for (const m of finishedMatches(matches)) {
    matchesPlayed += 1; // en färdig match räknas alltid (en 0-0 spelades ändå, G3)
    const { homeGoals, awayGoals } = m.result;
    totalGoals += homeGoals + awayGoals;
    bump(m.homeTeamId, homeGoals);
    bump(m.awayTeamId, awayGoals);

    // Största matchen: högst total scoreline, vid lika lägst match-id (stabil ordning). Bara
    // matcher med BÅDA lagen kända (annars kan vi inte visa "X mot Y"), och total > 0 (en 0-0 är
    // ingen "stor" match att lyfta fram).
    const total = homeGoals + awayGoals;
    if (
      total > 0 &&
      m.homeTeamId !== null &&
      m.awayTeamId !== null &&
      (biggest === null ||
        total > biggest.total ||
        (total === biggest.total && m.id.localeCompare(biggest.matchId, 'sv') < 0))
    ) {
      biggest = {
        matchId: m.id,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeGoals,
        awayGoals,
        total,
      };
    }
  }

  const teams: TeamScoreGoalRow[] = [...byTeam.values()].map((a) => ({
    teamId: a.teamId,
    goals: a.goals,
    matches: a.matches,
  }));
  teams.sort(
    (a, b) => b.goals - a.goals || a.matches - b.matches || a.teamId.localeCompare(b.teamId, 'sv')
  );

  const goalAverage = matchesPlayed === 0 ? 0 : totalGoals / matchesPlayed;
  return { teams, totalGoals, matchesPlayed, goalAverage, biggestMatch: biggest };
}
