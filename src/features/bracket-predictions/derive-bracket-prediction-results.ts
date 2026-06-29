// HÄRLEDNING: knyt ihop det avgjorda slutspels-facit med användarens bracket-tips till
// ett per-slot-resultat som BracketResultPanel visar i "Tippa slutspelet"-vyn (rätt/fel +
// poäng + vem som faktiskt gick vidare). REN funktion, ingen IO, ingen React, testbar i
// isolation. Systerfil till derive-group-prediction-results.ts (grupp-tipsens motsvarighet,
// T-grupp-resultat), samma form + samma "en post bara när avgjort + tippat"-regel.
//
// EN POST GES BARA NÄR: (1) slotten är AVGJORD (finns i facit = matchen spelad, laget vidare
// känt) OCH (2) användaren har ett bracket-tips för slotten. Annars ingen post (panelen visas
// inte). Poängen + rätt/fel HÄRLEDS via de BEFINTLIGA, redan testade bracket-poängfunktionerna
// (scoreBracketAdvance / scoreChampionPrediction, bonus-score.ts), så slutspels-tipsets poäng
// i vyn ALDRIG kan drifta från topplistans (EN sanning, PRINCIPLES §4 återanvänd).
//
// LAG-IDENTITET (T16 F1-seamen): både facit (BracketFacit.advancingTeam) och tipset
// (BracketPrediction.advancingTeamId) bär VERSAL Team.code (TeamCode). scoreBracketAdvance/
// scoreChampionPrediction normaliserar dessutom själva (sameTeam), så jämförelsen är robust.

import {
  scoreBracketAdvance,
  scoreChampionPrediction,
  BRACKET_ROUND_POINTS,
  CHAMPION_PREDICTION_POINTS,
  CHAMPION_SLOT_ID,
  type BracketPrediction,
} from '../../data/predictions';
import type { BracketFacit } from '../leaderboard';
import type { TeamCode } from '../../domain/team-code';

/** Det vyn behöver per avgjord slot man tippat på (en slutspelsmatch ELLER mästar-tipset). */
export interface BracketSlotResult {
  /** slot_id: matchnumret (M73..M104) eller CHAMPION_SLOT_ID ('champion'). */
  slotId: string;
  /** Tippade rätt lag vidare (eller rätt mästare). */
  correct: boolean;
  /** Poäng tipset gav (rundans vikt / mästar-bonus vid rätt, annars 0). */
  points: number;
  /** Maximal poäng slotten kunde ge (rundans vikt, eller mästar-bonusen). */
  maxPoints: number;
  /** Tippat lag (Team.code, versal), för "Du tippade"-raden. */
  predictedCode: string;
  /** Lag som FAKTISKT gick vidare (Team.code, versal), för "Gick vidare"-raden. */
  actualCode: string;
}

/**
 * Bygg per-slot-resultatet för de avgjorda slutspels-slots användaren tippat på, plus
 * mästar-tipset om finalen är avgjord.
 *
 * @param bracketSlots  Avgjorda slutspels-slots (PoolFacit.bracketSlots), redan i code-rymd.
 * @param champion      VM-mästaren (final-vinnaren) som code, eller null tills finalen avgjord.
 * @param myBracketPredictions  Mina bracket-tips per slotId (inkl. CHAMPION_SLOT_ID), code-rymd.
 * @returns             Map slotId -> resultat, bara för avgjorda slots/champion man tippat på.
 */
export function deriveBracketPredictionResults(
  bracketSlots: readonly BracketFacit[],
  champion: TeamCode | null,
  myBracketPredictions: ReadonlyMap<string, BracketPrediction>
): Map<string, BracketSlotResult> {
  const results = new Map<string, BracketSlotResult>();

  // 1) Slutspelsmatchernas slots: vem gick vidare, mot vad jag tippade (rundans vikt).
  for (const slot of bracketSlots) {
    const prediction = myBracketPredictions.get(slot.slotId);
    if (!prediction) {
      continue; // ingen post utan ett tips (gissa aldrig)
    }
    const points = scoreBracketAdvance(slot.stage, prediction.advancingTeamId, slot.advancingTeam);
    results.set(slot.slotId, {
      slotId: slot.slotId,
      // Rundans poäng är alltid > 0 (1..5), så points > 0 <=> rätt lag (en sanning med
      // poängfunktionen, ingen egen jämförelse-tröskel som kan drifta).
      correct: points > 0,
      points,
      maxPoints: BRACKET_ROUND_POINTS[slot.stage],
      predictedCode: prediction.advancingTeamId,
      actualCode: slot.advancingTeam,
    });
  }

  // 2) VM-mästar-tipset (CHAMPION_SLOT_ID): mot final-vinnaren, om finalen är avgjord.
  if (champion !== null) {
    const prediction = myBracketPredictions.get(CHAMPION_SLOT_ID);
    if (prediction) {
      const points = scoreChampionPrediction(prediction.advancingTeamId, champion);
      results.set(CHAMPION_SLOT_ID, {
        slotId: CHAMPION_SLOT_ID,
        correct: points > 0, // mästar-bonusen är > 0 (20) vid rätt, en sanning med poängfn.
        points,
        maxPoints: CHAMPION_PREDICTION_POINTS,
        predictedCode: prediction.advancingTeamId,
        actualCode: champion,
      });
    }
  }

  return results;
}
