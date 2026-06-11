// AKTUELL ANVÄNDARES sammanfattning för topplistan (T46, #79). REN funktion, inget I/O,
// ingen React, fristående testbar.
//
// VARFÖR (Daniels begäran, pre-share-blockerare): idag måste man skrolla hela vägen ner
// till topplistan för att se sina egna poäng. Den här härledningen plockar AKTUELL
// användares rad ur den redan rangordnade topplistan (buildLeaderboard), så en panel
// ÖVERST kan visa totala poäng + placering utan att skrolla.
//
// EN SANNING: vi räknar INTE om poäng/rank här. Topplistan (aggregate-scores) är redan
// poängsatt + rangordnad (delad rank vid lika, T17); vi LÄSER bara ut den egna raden.
// Så summan överst och raden i listan kan aldrig drifta isär.

import type { LeaderboardEntry } from './aggregate-scores';

/** Sammanfattningen för aktuell användare: var i topplistan står JAG? */
export interface SelfSummary {
  /** Aktuell användares totala poäng (alla tre tips-typer mot facit). */
  points: number;
  /** Aktuell användares placering (delad rank vid lika, samma som i listan). */
  rank: number;
  /** Hur många medlemmar topplistan rangordnar (för "av N"-kontexten). */
  totalMembers: number;
}

/**
 * Härled aktuell användares sammanfattning ur den rangordnade topplistan.
 *
 * @param leaderboard   Den färdigrangordnade topplistan (buildLeaderboard).
 * @param currentUserId Den inloggade användarens id, eller null innan sessionen är klar.
 * @returns             Sammanfattningen, eller null om vi inte kan peka ut en egen rad
 *                      (ingen känd identitet, eller identiteten finns inte i listan).
 *                      null = visa ingen panel (hellre tyst än en gissad/fel rad).
 */
export function deriveSelfSummary(
  leaderboard: readonly LeaderboardEntry[],
  currentUserId: string | null
): SelfSummary | null {
  // Ingen känd identitet: vi vet inte vilken rad som är "jag", så ingen panel (samma
  // fail-safe som "du"-framhävningen i listan, currentUserId null => ingen rad markeras).
  if (currentUserId === null) {
    return null;
  }
  const self = leaderboard.find((entry) => entry.userId === currentUserId);
  // Identiteten finns inte i listan (t.ex. inte medlem i rummet än): ingen panel, hellre
  // tyst än att gissa en rad. Returnerar null i stället för att maskera med 0/sista plats.
  if (self === undefined) {
    return null;
  }
  return {
    points: self.points,
    rank: self.rank,
    totalMembers: leaderboard.length,
  };
}
