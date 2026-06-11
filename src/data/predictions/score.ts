// REN poängsättnings-funktion för tips (T15, #15). Inget I/O, ingen React,
// fristående testbar, EN sanning för hur ett tips poängsätts.
//
// POÄNGREGEL (SPEC §4/§12 anger BARA "rätt utfall vs exakt resultat" på
// rubriknivå, inte exakta poängtal, se docs/decisions.md T15-beslutet):
// vi följer den VEDERTAGNA tips-standarden, dokumenterad som ett medvetet val:
//   * EXAKT resultat (rätt antal mål för BÅDA lagen)        -> 3 poäng
//   * RÄTT UTFALL (rätt 1X2: hemmavinst / oavgjort / borta) -> 1 poäng
//   * annars                                                -> 0 poäng
// Exakt resultat ger 3 (det INKLUDERAR rätt utfall, men belönas högre, inte 3+1).
//
// UTFALL (1X2) BERÄKNAS PÅ ORDINARIE MÅL (källmedvetet val, dokumenterat):
// ett tips är en gissning på den ORDINARIE målställningen (home/away). Straffar
// tippas INTE (bracket-/slutspels-tips är T16, utanför T15, se schema-migrationen).
// Därför avgörs BÅDE tippets och det faktiska resultatets utfall på ORDINARIE
// mål. Konsekvens (medveten): en slutspelsmatch som slutar lika i ordinarie tid
// och avgörs på straffar räknas som 'draw' (X) här, eftersom det är den ordinarie
// ställningen tipset gällde. Detta är konsekvent: alla tips bedöms på samma plan
// (ordinarie tid), oavsett grupp/slutspel. (FIFA Article 14:s straff-vinnare
// styr slutspelsTRÄDET, inte tips-poängen, det är två skilda saker.)
//
// VARFÖR ren + injicerbar: poängsättningen ska kunna enhetstestas uttömmande
// (alla 1X2-kombinationer, exakt/utfall/miss, edge-fall) och återanvändas av
// topplistan (T17) utan att dra in nät/DB. Den tar färdiga målställningar, inte
// rådata, så den är trivialt deterministisk.

/** En målställning (hemma/borta) i ordinarie tid. Tippad eller faktisk. */
export interface Scoreline {
  homeGoals: number;
  awayGoals: number;
}

/** Poäng ett tips kan ge. Stabila konstanter så UI/tester refererar dem, inte magiska tal. */
export const PREDICTION_POINTS = {
  /** Exakt rätt resultat (rätt antal mål för båda lagen). */
  exact: 3,
  /** Rätt utfall (rätt 1X2) men inte exakt resultat. */
  outcome: 1,
  /** Fel utfall. */
  miss: 0,
} as const;

/** Utfallet av en match på ordinarie mål: hemmavinst, oavgjort, bortavinst. */
export type Outcome = 'home' | 'draw' | 'away';

/**
 * Poäng-TYPEN ett match-tips gav, som etikett (inte siffran). EN sanning för "varför"
 * ett tips gav sin poäng, så UI:t kan visa orsaken ("Exakt resultat", "Rätt vinnare",
 * "Miss") utan att gissa en egen tröskel mot poängsiffran.
 *   * 'exact'   = exakt resultat (3p)
 *   * 'outcome' = rätt utfall men ej exakt (1p)
 *   * 'miss'    = fel utfall (0p)
 */
export type MatchPointType = 'exact' | 'outcome' | 'miss';

/**
 * Härled 1X2-utfallet ur en målställning (ordinarie tid). En sanning för hur ett
 * utfall avgörs, delad av både tippet och det faktiska resultatet, så de jämförs
 * på samma plan.
 */
export function outcomeOf(score: Scoreline): Outcome {
  if (score.homeGoals > score.awayGoals) {
    return 'home';
  }
  if (score.homeGoals < score.awayGoals) {
    return 'away';
  }
  return 'draw';
}

/**
 * Är två målställningar exakt lika (samma antal mål för båda lagen)?
 * Det starkare villkoret (3 poäng) som per definition också medför rätt utfall.
 */
function isExact(a: Scoreline, b: Scoreline): boolean {
  return a.homeGoals === b.homeGoals && a.awayGoals === b.awayGoals;
}

/**
 * Härled poäng-TYPEN (etiketten) ett tips ger mot facit. EN sanning för klassningen,
 * delad med scorePrediction (siffran), så typ och poäng ALDRIG kan drifta isär: båda
 * läser samma exakt-/utfall-/miss-beslut. UI:t (avslöjande-vyn) visar "varför"-texten
 * ur denna typ, poäng-värdet ur PREDICTION_POINTS[typ], en regel.
 *
 * @param predicted  Den tippade ordinarie målställningen.
 * @param actual     Den faktiska ordinarie målställningen (matchens result).
 * @returns          'exact' (samma resultat), 'outcome' (samma 1X2, ej exakt) el. 'miss'.
 */
export function pointTypeOf(predicted: Scoreline, actual: Scoreline): MatchPointType {
  if (isExact(predicted, actual)) {
    return 'exact';
  }
  if (outcomeOf(predicted) === outcomeOf(actual)) {
    return 'outcome';
  }
  return 'miss';
}

/**
 * Poängsätt ett tips mot det faktiska resultatet. Slår upp poängen ur poäng-TYPEN
 * (pointTypeOf) i PREDICTION_POINTS, så siffran och etiketten är samma sanning: en
 * ändring av regeln slår igenom på BÅDA. (PREDICTION_POINTS-nycklarna ÄR MatchPointType.)
 *
 * @param predicted  Den tippade ordinarie målställningen.
 * @param actual     Den faktiska ordinarie målställningen (matchens result).
 * @returns          3 (exakt), 1 (rätt utfall) eller 0 (miss). Se modul-doc för regeln.
 */
export function scorePrediction(predicted: Scoreline, actual: Scoreline): number {
  return PREDICTION_POINTS[pointTypeOf(predicted, actual)];
}
