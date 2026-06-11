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
//     * rätt VM-VINNARE (mästaren) -> 20 poäng (separat tippning före turneringen).
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
 * IDENTITETS-RYMD: code (BRA) vs id (bra), normalisering.
 * ------------------------------------------------------------------ */

/**
 * Normalisera en lag-referens till EN identitets-rymd (versal FIFA-kod) före
 * jämförelse. Domänen bär två stabila identiteter för samma lag:
 *   - Team.code  = VERSAL FIFA-kod  ("BRA"), så lagras ett tips (UI-option ->
 *     API -> DB, constraint ^[A-Z]{3}$), och
 *   - Team.id    = GEMEN kod        ("bra"), `teamId(code)=code.toLowerCase()`,
 *     vilket är vad det HÄRLEDDA facit bär (computeStandings.teamId,
 *     deriveBracket.winnerTeamId propagerar Team.id).
 *
 * Poängfunktionerna nedan jämför ett LAGRAT tips (code) mot ett HÄRLETT facit
 * (id). Utan normalisering möts de två rymderna först i poäng-seamen och ger
 * TYST 0 poäng för alla tips (`'BRA' === 'bra'` är false), ett fel som inget
 * happy-path-test fångar (se docs/decisions.md T16, F1). Genom att normalisera
 * BÅDA sidor till versal kod INNAN jämförelse kan driften strukturellt inte
 * uppstå, oavsett om konsumenten matar code eller id på endera sidan.
 *
 * Versal (toUpperCase) väljs som kanon-rymd för att den är tipsens lagrings-form
 * och DB-constraintens form (^[A-Z]{3}$), så normaliseringen drar mot sanningen
 * på write-sidan, inte mot en härledd biform.
 */
function normalizeTeamRef(teamRef: string): string {
  return teamRef.toUpperCase();
}

/** Lika lag oavsett identitets-rymd (code "BRA" === id "bra"). En sanning för seam-jämförelsen. */
function sameTeam(a: string, b: string): boolean {
  return normalizeTeamRef(a) === normalizeTeamRef(b);
}

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
 * IDENTITETS-KONTRAKT: båda sidor får bära lag-referensen i ENDERA rymden,
 * code (versal "BRA", som tipset LAGRAS) eller id (gemen "bra", som facit
 * HÄRLEDS ur computeStandings/deriveBracket). Funktionen normaliserar båda
 * sidor (sameTeam) före jämförelse, så ett code-lagrat tips mot ett
 * standings-härlett actual ger rätt poäng i stället för tyst 0 (T16 F1).
 *
 * @param predicted  Det gissade grupputfallet (1:a + 2:a), code eller id.
 * @param actual     Det faktiska grupputfallet (1:a + 2:a ur färdig tabell), code eller id.
 * @returns          0-5 poäng (3 för rätt 1:a, 2 för rätt 2:a, oberoende).
 */
export function scoreGroupPrediction(predicted: GroupPredictionPick, actual: GroupOutcome): number {
  let points = 0;
  if (sameTeam(predicted.winnerTeamId, actual.winnerTeamId)) {
    points += GROUP_PREDICTION_POINTS.winner;
  }
  if (sameTeam(predicted.runnerUpTeamId, actual.runnerUpTeamId)) {
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
 * pooler). `third-place` och `final` får samma vikt som de djupaste rundorna.
 *
 * VAD `actual` BETYDER PER SLOT (kontrakt för den som matar in facit, T16b):
 * `actual` = laget som GÅR VIDARE ur slottens match (deriveBracket-utfallet),
 * vilket skiljer sig mellan rundor:
 *   - round-of-32 .. semi-final: vinnaren som avancerar till nästa runda.
 *   - final (M104): FINAL-VINNAREN, dvs VM-mästaren (samma lag som
 *     scoreChampionPrediction belönar, men här via final-slottens utfall).
 *   - third-place (M103, bronsmatchen): BRONSMATCH-VINNAREN = 3:e plats i VM.
 *     OBS: M103:s DELTAGARE är semifinal-FÖRLORARNA (slotten matas av
 *     `match-loser` av M101/M102, se derive-bracket.ts), så "går vidare ur
 *     M103" är INTE en semifinal-vinst utan bronsmatch-segern. `actual` här
 *     är alltså den som VANN bronsmatchen, inte den som nådde semifinalen.
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

/**
 * Bonus för att tippa rätt VM-VINNARE (mästaren), separat tippning före turneringen.
 *
 * VARFÖR 20 (Daniels beslut, T49 #84, pre-share): mästar-tipset ska väga TYDLIGT
 * tyngst, det är turneringens svåraste enskilda gissning (1 lag av 48, blint före
 * första matchen). 20 är satt så bonusen matchar match-skalan rent: exakt match = 3p,
 * så 20 mästar-poäng motsvarar dryga 6 exakta matcher, en känn-bar men inte absurd
 * tyngd (Daniel sänkte från sitt ursprungliga 50 just för att hålla skalan rimlig
 * mot 3p-matcherna). Källa: docs/decisions.md T49 (#84), Daniels poäng-beslut.
 */
export const CHAMPION_PREDICTION_POINTS = 20;

/**
 * Poängsätt ett "vem går vidare"-tips på EN slutspelsmatch mot vem som FAKTISKT
 * gick vidare. Rätt lag ger rundans poäng, annars 0.
 *
 * IDENTITETS-KONTRAKT: `predicted` och `actual` får bära lag-referensen i
 * ENDERA rymden, code (versal "BRA", tipsets lagrings-form) eller id (gemen
 * "bra", som deriveBracket.winnerTeamId HÄRLEDER). Funktionen normaliserar
 * båda (sameTeam) före jämförelse, så ett code-lagrat tips mot ett
 * bracket-härlett actual ger rundans poäng i stället för tyst 0 (T16 F1).
 *
 * VIKTIGT (anti-dubbelräkning, källmedvetet): ett bracket-tips poängsätts mot vem
 * som AVANCERADE (vann matchen enligt T9:s vinnar-härledning, som inkluderar
 * straffar i slutspel, FIFA Art. 14), INTE mot målställningen. Det är därför detta
 * är skilt från scorePrediction (T15), som poängsätter den ordinarie målställningen
 * och medvetet räknar ett straff-avgjort slutspel som 'draw'. De två tipsformerna
 * mäter olika saker och får inte blandas ihop.
 *
 * @param stage      slutspelsrundan matchen tillhör (avgör poängvikten).
 * @param predicted  lag man tippade skulle gå vidare ur matchen (code eller id).
 * @param actual     lag som FAKTISKT gick vidare, T9:s vinnar-härledning (code eller id).
 * @returns          rundans poäng vid rätt lag, annars 0.
 */
export function scoreBracketAdvance(
  stage: KnockoutStage,
  predicted: string,
  actual: string
): number {
  return sameTeam(predicted, actual) ? BRACKET_ROUND_POINTS[stage] : 0;
}

/**
 * Poängsätt VM-VINNAR-tipset (mästaren) mot den faktiska mästaren (final-vinnaren).
 * Rätt mästare ger CHAMPION_PREDICTION_POINTS, annars 0.
 *
 * IDENTITETS-KONTRAKT: båda argument får bära lag-referensen i ENDERA rymden,
 * code (versal "BRA", tipsets lagrings-form) eller id (gemen "bra", som facit
 * härleds). Normaliseras (sameTeam) före jämförelse (T16 F1).
 *
 * @param predictedChampion  lag man tippade som mästare före turneringen (code eller id).
 * @param actualChampion     lag som faktiskt vann finalen, mästaren (code eller id).
 */
export function scoreChampionPrediction(predictedChampion: string, actualChampion: string): number {
  return sameTeam(predictedChampion, actualChampion) ? CHAMPION_PREDICTION_POINTS : 0;
}
