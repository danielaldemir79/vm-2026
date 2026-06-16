// REN AGGREGERING för de TABELL-härledda turneringsstatistik-aggregaten (T88, #180): clean
// sheets + skrällar (upsets). Ingen IO, inget React , rent in (den resolvade matchplanen +
// en ranking-uppslagning) -> rent ut (rankade rader). Härleds ur den OFFICIELLA matchplanen
// (FinishedMatch.result, vävt ur official_match_results via ResultsProvider , en sanning för
// facit) + lagens FIFA-ranking, INTE ur live-events (de blir slutgiltiga vid FT).
//
// VARFÖR result-baserat (inte event-baserat): clean sheets + skrällar handlar om det AVGJORDA
// resultatet, inte om enskilda events. ResultsProvider väver redan in det officiella facit
// near-live (Realtime på official_match_results + fokus/online), så en konsument som läser
// matchplanen får dem färska vid FT, utan att vi bygger en egen läs-väg (DRY).
//
// =====================================================================================
// DOMÄNREGLER (KÄLLHÄNVISADE , gissas aldrig; se docs/decisions.md 2026-06-16 T88):
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
