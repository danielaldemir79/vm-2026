// EN sanning för match-tipsens VARFÖR-etikett (T58, #99). REN funktion, inget I/O,
// ingen React, fristående testbar. Bor bredvid score.ts/pointTypeOf, samma anda:
// poäng-TYPEN (pointTypeOf) avgör orsaken, och denna modul ger den i ORD.
//
// ============================================================================
// VARFÖR EN GEMENSAM MODUL (anti-dubblett, #69 kryss-noten)
// ============================================================================
// Etiketten visas nu på TVÅ ytor: avslöjande-vyn (RevealView, "Vad alla tippade")
// OCH tips-listans poäng-rad per avgjord match (Tippa matcherna, T58). Tidigare bodde
// pointType -> etikett-mappningen lokalt i RevealView (OUTCOME_BY_TYPE). Lägger vi en
// ANDRA kopia i tips-vyn kan de två drifta isär, exakt den dubblett #99 förbjuder
// ("pointType-til-etikett-mappningen ska bo på ETT ställe"). Den bor nu HÄR, och båda
// ytorna läser den.
//
// ============================================================================
// UTFALLS-MEDVETEN ETIKETT (HARD, #69 kryss-noten)
// ============================================================================
// BUGG (Daniels fråga 2026-06-11): avslöjande-vyn sa "Rätt vinnare +1" ÄVEN när
// utfallet var OAVGJORT (en korrekt 1-poängare på rätt kryss). Poänglogiken är rätt
// (outcomeOf hanterar draw, score.ts), bara ORDVALET ljög: ett oavgjort har ingen
// "vinnare". Poäng-guiden (score-explainer-items) säger redan "Rätt vinnare (eller
// oavgjord)", och denna etikett håller SAMMA sanning, fast kompakt per rad.
//
// REGEL (utfalls-MEDVETEN, inte bara utfalls-neutral): för en 1-poängare bestäms
// ordet av det FAKTISKA utfallet (actualOutcome), så det aldrig motsäger verkligheten:
//   * draw       -> "Rätt kryss"   (oavgjort har ingen vinnare, men ett rätt tecken)
//   * home/away  -> "Rätt vinnare" (det fanns en vinnare och man prickade den)
// 'exact' och 'miss' beror inte av utfallet (exakt resultat resp. fel utfall), så de
// är konstanta. Att binda 'outcome'-ordet till actualOutcome gör det STRUKTURELLT
// omöjligt att säga "Rätt vinnare" på ett kryss.

import type { MatchPointType, Outcome } from './score';

/**
 * VARFÖR-etiketten (i ord) för en match-tips-poäng, utfalls-medveten. Härledd ur
 * poäng-TYPEN (pointTypeOf) + det FAKTISKA utfallet (outcomeOf på facit), så ordet
 * aldrig kan motsäga verkligheten (aldrig "Rätt vinnare" på ett oavgjort, #69).
 *
 * UTTÖMMANDE över MatchPointType, inget default-fall: en ny poäng-typ blir ett
 * KOMPILERINGSFEL här (fail-loud i typen), inte en tyst fallback-etikett.
 *
 * @param pointType      Poäng-typen ur pointTypeOf ('exact' | 'outcome' | 'miss').
 * @param actualOutcome  Det FAKTISKA 1X2-utfallet (outcomeOf på facit). Avgör bara
 *                       'outcome'-ordet (kryss vs vinnare); ignoreras för exact/miss.
 * @returns              Etiketten i ord ("Exakt resultat" / "Rätt vinnare" /
 *                       "Rätt kryss" / "Miss").
 */
export function matchPointLabel(pointType: MatchPointType, actualOutcome: Outcome): string {
  switch (pointType) {
    case 'exact':
      return 'Exakt resultat';
    case 'outcome':
      // Utfalls-medvetet (#69): ett oavgjort har ingen vinnare, men ett rätt tecken.
      return actualOutcome === 'draw' ? 'Rätt kryss' : 'Rätt vinnare';
    case 'miss':
      return 'Miss';
  }
}
