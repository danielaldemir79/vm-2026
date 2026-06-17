// Match-STÄMNING ur facit för liv-lagret (T82 del 2, #173). REN, deterministisk, inget I/O.
//
// SYFTE: klassa en SPELAD matchs utfall i en "mood" som BÅDE reaktions-generatorn
// (react.ts) och kommentars-generatorn (comment.ts) läser, så emoji-valet och fras-
// poolerna styrs av EN sanning om matchen i stället för två parallella tolkningar (DRY).
//
// GISSA ALDRIG (HARD, lessons "lattgissad-domanregel-styr-otestad-gren"): facit ger BARA
// den ordinarie målställningen per match (PoolFacit.matches[i].actual = Scoreline
// { homeGoals, awayGoals }, se derive-facit.ts). Det finns INGEN minut-data och INGA
// odds/seeds i den formen, så vi kan INTE ärligt härleda "sen vinst" (kräver minut) eller
// "skräll" (kräver förväntan/odds) ur ett resultat. Vi klassar därför BARA det som
// poängställningen FAKTISKT bär: målfest, mållöst, oavgjort, rafflande jämn, klar seger,
// knapp seger. Att hitta på en skräll- eller sen-vinst-gren ur enbart en siffra vore en
// gissning maskerad som fakta, exakt det lessons-filen varnar för.
//
// SKARVEN (bevisa, inte happy-path): moodFromScoreline läser EXAKT källans Scoreline-form
// (homeGoals/awayGoals), och match-mood.test.ts kör den mot ett RIKTIGT derivePoolFacit,
// inte en handrullad konsument-form, så en form-drift i facit rödnar i stället för att
// tyst falla till default-stämningen.

import type { Scoreline } from '../predictions';

/**
 * En matchs stämning, härledd ENBART ur den ordinarie målställningen (det facit faktiskt
 * bär). Ordnad efter hur en åskådare skulle beskriva matchen. INGEN 'skräll'/'sen-vinst'
 * (ej härledbart ur en siffra, se modul-doc).
 */
export type MatchMood =
  | 'goalfest' // mål-rik match (högt totalt antal mål)
  | 'goalless' // 0-0, mållöst
  | 'draw' // oavgjort med mål (t.ex. 2-2)
  | 'thriller' // jämn men avgjord, båda gjorde mål (1 måls marginal, mål i båda ändar)
  | 'comfortable' // klar seger (stor marginal)
  | 'narrow'; // knapp, mållåst seger (default-utfallet)

/** Tröskel: total mål >= denna räknas som målfest. Källa: designval, T82 (decisions.md). */
export const GOALFEST_TOTAL = 5;
/** Tröskel: målmarginal >= denna räknas som en klar/bekväm seger. */
export const COMFORTABLE_MARGIN = 3;

/**
 * Klassa en målställning till en MatchMood. REN och total: varje giltig Scoreline mappar
 * till exakt en mood (ingen gren kan falla mellan stolarna). Prioritets-ordningen är
 * medveten och dokumenterad, den är en VAL-invariant (testad diskriminerande, lessons
 * "invariant-test-vars-fixtur-kollapsar-operatorn"): målfest före allt annat (en 4-3 är
 * först och främst en målfest), sedan oavgjort-grenarna, sedan segrarna efter marginal.
 */
export function moodFromScoreline(score: Scoreline): MatchMood {
  const total = score.homeGoals + score.awayGoals;
  const margin = Math.abs(score.homeGoals - score.awayGoals);
  const bothScored = score.homeGoals > 0 && score.awayGoals > 0;

  // 1) Målfest: många mål totalt, oavsett vinnare (en 4-3 ÄR en målfest, inte en thriller).
  if (total >= GOALFEST_TOTAL) {
    return 'goalfest';
  }
  // 2) Oavgjort: mållöst (0-0) vs oavgjort med mål (t.ex. 1-1, 2-2).
  if (margin === 0) {
    return total === 0 ? 'goalless' : 'draw';
  }
  // 3) Klar seger: stor marginal.
  if (margin >= COMFORTABLE_MARGIN) {
    return 'comfortable';
  }
  // 4) Rafflande: 1-2 måls marginal MED mål i båda ändar (t.ex. 2-1, 3-2) , det kändes nära.
  if (margin <= 2 && bothScored) {
    return 'thriller';
  }
  // 5) Default: knapp, mållåst seger (t.ex. 1-0, 2-0 utan svar). Total-funktion: allt övrigt.
  return 'narrow';
}
