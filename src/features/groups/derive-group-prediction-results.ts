// HÄRLEDNING: knyt ihop de avgjorda grupptabellerna med användarens grupp-tips till
// ett per-grupp-resultat som GroupResultPanel visar i "Tippa grupperna"-vyn (poäng +
// per-pick rätt/fel + facit). REN funktion, ingen IO, ingen React, testbar i isolation.
//
// EN POST GES BARA NÄR: (1) gruppen är AVGJORD (alla lag har spelat alla sina
// gruppmatcher) OCH (2) användaren har ett grupp-tips för gruppen. Annars ingen post
// (panelen visas inte). Poäng + per-position-utfall härleds via evaluateGroupPrediction
// (en sanning för poäng-seamen, code<->id hanterad där).

import type { GroupId, GroupTable } from '../../domain/types';
import { evaluateGroupPrediction, type GroupPrediction } from '../../data/predictions';

/** Det vyn behöver per avgjord grupp man tippat på. */
export interface GroupResultEntry {
  groupId: GroupId;
  /** Total gruppoäng (0/2/3/5). */
  points: number;
  /** Tippade rätt gruppvinnare (1:a). */
  winnerCorrect: boolean;
  /** Tippade rätt grupptvåa (2:a). */
  runnerUpCorrect: boolean;
  /** Tippad gruppvinnare (Team.code, versal). */
  predictedWinnerCode: string;
  /** Tippad grupptvåa (Team.code, versal). */
  predictedRunnerUpCode: string;
  /** Faktisk gruppvinnare (Team.id ur den färdiga tabellen), för "Så blev det"-raden. */
  actualWinnerTeamId: string;
  /** Faktisk grupptvåa (Team.id ur den färdiga tabellen). */
  actualRunnerUpTeamId: string;
}

/**
 * Är gruppen AVGJORD? Varje lag i en grupp möter alla andra exakt en gång, så ett
 * komplett gruppspel = alla lag har spelat (antal lag - 1) matcher. Härlett ur
 * grupp-storleken, inga magiska tal (4-lags-grupp -> 3 matcher per lag).
 */
function isGroupDecided(table: GroupTable): boolean {
  const teamCount = table.standings.length;
  if (teamCount === 0) {
    return false;
  }
  const matchesPerTeam = teamCount - 1;
  return table.standings.every((s) => s.played === matchesPerTeam);
}

/**
 * Bygg per-grupp-resultatet för de avgjorda grupper användaren tippat på.
 *
 * @param tables         de härledda grupptabellerna (useGroupData), standings sorterade.
 * @param myPredictions  mina grupp-tips per groupId (listMyGroupPredictions, code-rymd).
 * @returns              Map groupId -> resultat, bara för avgjorda grupper med ett tips.
 */
export function deriveGroupPredictionResults(
  tables: readonly GroupTable[],
  myPredictions: ReadonlyMap<string, GroupPrediction>
): Map<GroupId, GroupResultEntry> {
  const results = new Map<GroupId, GroupResultEntry>();

  for (const table of tables) {
    if (!isGroupDecided(table)) {
      continue;
    }
    const prediction = myPredictions.get(table.groupId);
    if (!prediction) {
      continue;
    }
    // Faktiskt utfall ur den sorterade tabellen: rank 1 + rank 2 (Team.id, gemen).
    const actualWinner = table.standings.find((s) => s.rank === 1);
    const actualRunnerUp = table.standings.find((s) => s.rank === 2);
    if (!actualWinner || !actualRunnerUp) {
      continue; // data-inkonsistens (saknad placering): hoppa hellre än att gissa
    }

    const evaluation = evaluateGroupPrediction(
      { winnerTeamId: prediction.winnerTeamId, runnerUpTeamId: prediction.runnerUpTeamId },
      { winnerTeamId: actualWinner.teamId, runnerUpTeamId: actualRunnerUp.teamId }
    );

    results.set(table.groupId, {
      groupId: table.groupId,
      points: evaluation.points,
      winnerCorrect: evaluation.winnerCorrect,
      runnerUpCorrect: evaluation.runnerUpCorrect,
      predictedWinnerCode: prediction.winnerTeamId,
      predictedRunnerUpCode: prediction.runnerUpTeamId,
      actualWinnerTeamId: actualWinner.teamId,
      actualRunnerUpTeamId: actualRunnerUp.teamId,
    });
  }

  return results;
}
