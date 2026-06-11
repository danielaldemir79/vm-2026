// REN bonus-poängsättning för POOL-tipsen (T16, #16): gruppvinnar-tips och
// bracket-/slutspels-tips. Inget I/O, ingen React, fristående testbar, EN sanning
// för hur ett pool-tips poängsätts. Systerfil till score.ts (T15, matchresultat-
// tips); samma "ren + injicerbar + uttömmande testad"-anda.
//
// ============================================================================
// POÄNGREGLER (SPEC §4/§12 anger BARA "rätt utfall vs exakt resultat" +
// "bonuspoäng" på rubriknivå, inga exakta bonustal, se docs/decisions.md T16):
// vi följer den VEDERTAGNA VM-POOL-standarden, dokumenterad som ett medvetet
// val (inte en gissning om en specifik regel SPEC pekar ut):
//
//   GRUPP-TIPS (gissa 1:a + 2:a per grupp, FÖRE gruppspelet):
//     * rätt GRUPPVINNARE (1:a)        -> 3 poäng
//     * rätt GRUPPTVÅA  (2:a)          -> 2 poäng
//   Poängen ges OBEROENDE per position (du kan få 3, 2, 5 eller 0 i en grupp).
//
//   BRACKET-TIPS (gissa vem som går vidare per slutspels-slot, + VM-vinnare):
//     * rätt lag VIDARE ur en slutspelsmatch -> poäng som STIGER med rundan
//       (R32=1, R16=2, kvart=3, semi=4, brons/final-deltagare=5), så ett
//       djupare och svårare rätt-tips väger tyngre (vedertaget i bracket-pooler).
//     * rätt VM-VINNARE (mästaren) -> 8 poäng (separat tippning före turneringen).
//
// VARFÖR denna gradient (källmedvetet): exakt som T15:s "exakt > utfall" är detta
// den etablerade pool-formen där ett mer specifikt/svårare rätt belönas högre. Den
// stigande bracket-skalan är standard i bracket-pooler (t.ex. ESPN Tournament
// Challenge-familjen: poäng dubblas/ökar per runda); vi väljer en enkel linjär
// 1..5 + vinnar-bonus, dokumenterad, inte en härmning av en specifik produkts exakta
// tal. SPEC anger ingen avvikande regel, så standarden är förvalet.
//
// Källa: vedertagen VM-pool-/bracket-standard (1:a > 2:a; djupare runda väger
// tyngre; mästaren ger störst bonus). Dokumenterat beslut i docs/decisions.md (T16).
// ============================================================================

import type { KnockoutStage } from '../../domain/bracket/bracket-structure';

/* ------------------------------------------------------------------ *
 * GRUPP-TIPS: gruppvinnare + grupptvåa.
 * ------------------------------------------------------------------ */

/** Poäng ett gruppvinnar-tips kan ge per position. Stabila konstanter (inga magiska tal). */
export const GROUP_PREDICTION_POINTS = {
  /** Rätt gruppvinnare (1:a). */
  winner: 3,
  /** Rätt grupptvåa (2:a). */
  runnerUp: 2,
} as const;

/** Den faktiska 1:an + 2:an i en grupp (härledd ur den färdiga grupptabellen). */
export interface GroupOutcome {
  /** Lag-id som slutade 1:a (gruppvinnare). */
  winnerTeamId: string;
  /** Lag-id som slutade 2:a (grupptvåa). */
  runnerUpTeamId: string;
}

/** Ett gruppvinnar-tips: gissad 1:a + 2:a i en grupp. Samma form som GroupOutcome. */
export type GroupPredictionPick = GroupOutcome;

/**
 * Poängsätt ett gruppvinnar-tips mot det faktiska grupputfallet.
 *
 * Positionerna poängsätts OBEROENDE: rätt 1:a ger 3, rätt 2:a ger 2, och ett
 * tips kan få båda (5), en av dem, eller noll. Vi belönar BARA exakt rätt position
 * (rätt lag som 1:a, rätt lag som 2:a). Att ett lag man satte som 1:a faktiskt
 * blev 2:a ger INGEN delpoäng, det är ett medvetet val (KISS): positionen ÄR
 * tipset, en "rätt lag fel position"-delpoäng skulle göra regeln tvetydig och är
 * inte vedertagen i grupp-pooler. (Bracket-tipsen hanterar "rätt lag" separat.)
 *
 * @param predicted  Det gissade grupputfallet (1:a + 2:a).
 * @param actual     Det faktiska grupputfallet (1:a + 2:a ur färdig tabell).
 * @returns          0-5 poäng (3 för rätt 1:a, 2 för rätt 2:a, oberoende).
 */
export function scoreGroupPrediction(predicted: GroupPredictionPick, actual: GroupOutcome): number {
  let points = 0;
  if (predicted.winnerTeamId === actual.winnerTeamId) {
    points += GROUP_PREDICTION_POINTS.winner;
  }
  if (predicted.runnerUpTeamId === actual.runnerUpTeamId) {
    points += GROUP_PREDICTION_POINTS.runnerUp;
  }
  return points;
}

/* ------------------------------------------------------------------ *
 * BRACKET-TIPS: vem går vidare per slutspels-slot, + VM-vinnaren.
 * ------------------------------------------------------------------ */

/**
 * Poäng per slutspelsrunda för ett rätt "går vidare"-tips. STIGER med rundan:
 * ett rätt-tips längre fram är svårare och väger tyngre (vedertaget i bracket-
 * pooler). `third-place` (bronsmatchen) och `final` poängsätts som att man rätt
 * gissade vilket lag som NÅDDE den matchen (en semifinal-vinst respektive den
 * andra semifinal-vinsten), därför samma vikt som de djupaste rundorna.
 *
 * Nyckeln är KnockoutStage (domänens slutspelsrundor), så skalan kan aldrig
 * drifta från strukturens rundor (kompileringsfel om en runda byter namn).
 */
export const BRACKET_ROUND_POINTS: Readonly<Record<KnockoutStage, number>> = {
  'round-of-32': 1,
  'round-of-16': 2,
  'quarter-final': 3,
  'semi-final': 4,
  'third-place': 5,
  final: 5,
};

/** Bonus för att tippa rätt VM-VINNARE (mästaren), separat tippning före turneringen. */
export const CHAMPION_PREDICTION_POINTS = 8;

/**
 * Poängsätt ett "vem går vidare"-tips på EN slutspelsmatch mot vem som FAKTISKT
 * gick vidare. `predicted` och `actual` är lag-id (det lag man tror/vet avancerade
 * ur matchen). Rätt lag ger rundans poäng, annars 0.
 *
 * VIKTIGT (anti-dubbelräkning, källmedvetet): ett bracket-tips poängsätts mot vem
 * som AVANCERADE (vann matchen enligt T9:s vinnar-härledning, som inkluderar
 * straffar i slutspel, FIFA Art. 14), INTE mot målställningen. Det är därför detta
 * är skilt från scorePrediction (T15), som poängsätter den ordinarie målställningen
 * och medvetet räknar ett straff-avgjort slutspel som 'draw'. De två tipsformerna
 * mäter olika saker och får inte blandas ihop.
 *
 * @param stage      slutspelsrundan matchen tillhör (avgör poängvikten).
 * @param predicted  lag-id man tippade skulle gå vidare ur matchen.
 * @param actual     lag-id som FAKTISKT gick vidare (T9:s vinnar-härledning).
 * @returns          rundans poäng vid rätt lag, annars 0.
 */
export function scoreBracketAdvance(
  stage: KnockoutStage,
  predicted: string,
  actual: string
): number {
  return predicted === actual ? BRACKET_ROUND_POINTS[stage] : 0;
}

/**
 * Poängsätt VM-VINNAR-tipset (mästaren) mot den faktiska mästaren (final-vinnaren).
 * Rätt mästare ger CHAMPION_PREDICTION_POINTS, annars 0.
 *
 * @param predictedChampion  lag-id man tippade som mästare (före turneringen).
 * @param actualChampion     lag-id som faktiskt vann finalen (mästaren).
 */
export function scoreChampionPrediction(predictedChampion: string, actualChampion: string): number {
  return predictedChampion === actualChampion ? CHAMPION_PREDICTION_POINTS : 0;
}
