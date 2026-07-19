// REN HÄRLEDNING: den globala topplistans VINNARE (rank 1). Skild från WinnerBanner
// (den tunna vyn) så logiken är enhetstestbar utan provider, samma mönster som
// champion-from-bracket. Vi kröner BARA en tydlig etta (rank === 1); en tom lista
// eller en topp-rad som inte är rank 1 ger null (vi gissar aldrig en vinnare).

import type { TotalLeaderboardEntry } from '../total-leaderboard';

/**
 * Topplistans vinnare (den rank-1-rad som ligger först), eller null om listan är tom
 * eller toppraden inte är rank 1. Ren funktion, lagrar inget.
 */
export function pickLeaderboardWinner(
  total: readonly TotalLeaderboardEntry[]
): TotalLeaderboardEntry | null {
  const top = total[0];
  if (!top || top.rank !== 1) {
    return null;
  }
  return top;
}
