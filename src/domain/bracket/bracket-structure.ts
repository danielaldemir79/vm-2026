// VM 2026:s slutspelsträd, STRUKTURELLT (positioner, inte lagidentiteter).
//
// Detta är den källhänvisade kopian av FIFA:s officiella spelschema för
// slutspelet: vilka grupp-POSITIONER (1A, 2C, bästa-trea-av-X) som möts i varje
// sextondelsfinal, och hur vinnarna kopplas vidare genom åttondelar, kvarts,
// semi, bronsmatch och final. Eftersom trädet beror på POSITIONER och inte på
// vilka specifika lag som lottats, kan det byggas och uttömmande testas helt
// oberoende av lagidentiteter (den faktiska 2026-lottningen).
//
// ============================================================================
// KÄLLA (gissas ALDRIG): Regulations for the FIFA World Cup 26 (May 2026),
//   Article 12 "Group and knockout stages", §12.6-12.11, sid. 23-25.
//   https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf
// Korskollad mot 2026 FIFA World Cup knockout stage (Wikipedia, 2026-06-09).
// ============================================================================
//
// Matchnumren (M73-M104) är FIFA:s officiella numrering. Sextondelsfinalerna är
// M73-M88, åttondelar M89-M96, kvartsfinaler M97-M100, semifinaler M101-M102,
// bronsmatch M103, final M104.

import type { BracketSource, GroupId, MatchStage } from '../types';

/** En slutspelsrunda (allt utom gruppspel). */
export type KnockoutStage = Exclude<MatchStage, 'group'>;

/**
 * Var ett lag i en slutspels-slot kommer ifrån. Återanvänder domänens
 * BracketSource (DRY): tre grupp-källor vid sextondelsfinalen (gruppvinnare,
 * grupptvåa, bästa trea) och två match-progressions-källor för senare rundor
 * (vinnaren/förloraren av en tidigare match).
 *
 * `best-third` bär de 5 grupper vars trea KAN hamna här (FIFA:s officiella
 * "Best 3rd place of <grupper>", Article 12.6). Exakt vilken av dem som
 * faktiskt seedas hit avgörs av Annexe C-tabellen, det är seed-motorns jobb
 * (seed-third-places.ts), inte strukturens.
 */
export type SlotSource = BracketSource;

/**
 * En slutspelsmatch i strukturen: dess officiella matchnummer-id, rundan, och
 * de två sidornas källor. Detta är ren positions-data, inga lag, inga datum.
 */
export interface BracketMatch {
  /** FIFA:s officiella matchnummer-id, t.ex. "M79". */
  id: string;
  stage: KnockoutStage;
  home: SlotSource;
  away: SlotSource;
}

/* ------------------------------------------------------------------ *
 * Sextondelsfinaler (Round of 32), M73-M88.
 *
 * Källa: Article 12.6 (sid. 23-24). De 8 matcher som har en BÄSTA TREA är
 * M74, M77, M79, M80, M81, M82, M85, M87, var och en med exakt 5 behöriga
 * grupper enligt FIFA:s tabell. Övriga 8 är vinnare-mot-tvåa-möten.
 * "teams from the same group shall not meet each other in the round of 32."
 * ------------------------------------------------------------------ */
export const ROUND_OF_32: readonly BracketMatch[] = [
  // M73 Runner-up A v Runner-up B
  { id: 'M73', stage: 'round-of-32', home: ru('A'), away: ru('B') },
  // M74 Winner E v Best 3rd of A,B,C,D,F
  { id: 'M74', stage: 'round-of-32', home: w('E'), away: best('A', 'B', 'C', 'D', 'F') },
  // M75 Winner F v Runner-up C
  { id: 'M75', stage: 'round-of-32', home: w('F'), away: ru('C') },
  // M76 Winner C v Runner-up F
  { id: 'M76', stage: 'round-of-32', home: w('C'), away: ru('F') },
  // M77 Winner I v Best 3rd of C,D,F,G,H
  { id: 'M77', stage: 'round-of-32', home: w('I'), away: best('C', 'D', 'F', 'G', 'H') },
  // M78 Runner-up E v Runner-up I
  { id: 'M78', stage: 'round-of-32', home: ru('E'), away: ru('I') },
  // M79 Winner A v Best 3rd of C,E,F,H,I
  { id: 'M79', stage: 'round-of-32', home: w('A'), away: best('C', 'E', 'F', 'H', 'I') },
  // M80 Winner L v Best 3rd of E,H,I,J,K
  { id: 'M80', stage: 'round-of-32', home: w('L'), away: best('E', 'H', 'I', 'J', 'K') },
  // M81 Winner D v Best 3rd of B,E,F,I,J
  { id: 'M81', stage: 'round-of-32', home: w('D'), away: best('B', 'E', 'F', 'I', 'J') },
  // M82 Winner G v Best 3rd of A,E,H,I,J
  { id: 'M82', stage: 'round-of-32', home: w('G'), away: best('A', 'E', 'H', 'I', 'J') },
  // M83 Runner-up K v Runner-up L
  { id: 'M83', stage: 'round-of-32', home: ru('K'), away: ru('L') },
  // M84 Winner H v Runner-up J
  { id: 'M84', stage: 'round-of-32', home: w('H'), away: ru('J') },
  // M85 Winner B v Best 3rd of E,F,G,I,J
  { id: 'M85', stage: 'round-of-32', home: w('B'), away: best('E', 'F', 'G', 'I', 'J') },
  // M86 Winner J v Runner-up H
  { id: 'M86', stage: 'round-of-32', home: w('J'), away: ru('H') },
  // M87 Winner K v Best 3rd of D,E,I,J,L
  { id: 'M87', stage: 'round-of-32', home: w('K'), away: best('D', 'E', 'I', 'J', 'L') },
  // M88 Runner-up D v Runner-up G
  { id: 'M88', stage: 'round-of-32', home: ru('D'), away: ru('G') },
];

/* ------------------------------------------------------------------ *
 * Åttondelsfinaler (Round of 16), M89-M96. Källa: Article 12.7 (sid. 25).
 * ------------------------------------------------------------------ */
export const ROUND_OF_16: readonly BracketMatch[] = [
  { id: 'M89', stage: 'round-of-16', home: ww('M74'), away: ww('M77') },
  { id: 'M90', stage: 'round-of-16', home: ww('M73'), away: ww('M75') },
  { id: 'M91', stage: 'round-of-16', home: ww('M76'), away: ww('M78') },
  { id: 'M92', stage: 'round-of-16', home: ww('M79'), away: ww('M80') },
  { id: 'M93', stage: 'round-of-16', home: ww('M83'), away: ww('M84') },
  { id: 'M94', stage: 'round-of-16', home: ww('M81'), away: ww('M82') },
  { id: 'M95', stage: 'round-of-16', home: ww('M86'), away: ww('M88') },
  { id: 'M96', stage: 'round-of-16', home: ww('M85'), away: ww('M87') },
];

/* ------------------------------------------------------------------ *
 * Kvartsfinaler, M97-M100. Källa: Article 12.8 (sid. 25).
 * ------------------------------------------------------------------ */
export const QUARTER_FINALS: readonly BracketMatch[] = [
  { id: 'M97', stage: 'quarter-final', home: ww('M89'), away: ww('M90') },
  { id: 'M98', stage: 'quarter-final', home: ww('M93'), away: ww('M94') },
  { id: 'M99', stage: 'quarter-final', home: ww('M91'), away: ww('M92') },
  { id: 'M100', stage: 'quarter-final', home: ww('M95'), away: ww('M96') },
];

/* ------------------------------------------------------------------ *
 * Semifinaler, M101-M102. Källa: Article 12.9 (sid. 25).
 *   SF1 (M101): vinnare M97 v vinnare M98
 *   SF2 (M102): vinnare M99 v vinnare M100
 * ------------------------------------------------------------------ */
export const SEMI_FINALS: readonly BracketMatch[] = [
  { id: 'M101', stage: 'semi-final', home: ww('M97'), away: ww('M98') },
  { id: 'M102', stage: 'semi-final', home: ww('M99'), away: ww('M100') },
];

/* ------------------------------------------------------------------ *
 * Bronsmatch (M103) och final (M104). Källa: Article 12.10-12.11 (sid. 25).
 * Bronsmatchen spelas mellan semifinal-FÖRLORARNA.
 * ------------------------------------------------------------------ */
export const THIRD_PLACE_MATCH: BracketMatch = {
  id: 'M103',
  stage: 'third-place',
  home: lw('M101'),
  away: lw('M102'),
};

export const FINAL: BracketMatch = {
  id: 'M104',
  stage: 'final',
  home: ww('M101'),
  away: ww('M102'),
};

/** Hela slutspelsträdet i ett, i officiell match-ordning (M73 -> M104). */
export const BRACKET_MATCHES: readonly BracketMatch[] = [
  ...ROUND_OF_32,
  ...ROUND_OF_16,
  ...QUARTER_FINALS,
  ...SEMI_FINALS,
  THIRD_PLACE_MATCH,
  FINAL,
];

/* ------------------------------------------------------------------ *
 * Korta hjälp-konstruktorer (intern, gör tabellerna ovan läsbara). De är
 * rena fabriker, ingen logik, så strukturen läses som FIFA:s schema rad för rad.
 * ------------------------------------------------------------------ */
function w(group: GroupId): SlotSource {
  return { kind: 'group-winner', group };
}
function ru(group: GroupId): SlotSource {
  return { kind: 'group-runner-up', group };
}
function best(...eligibleGroups: GroupId[]): SlotSource {
  return { kind: 'best-third', eligibleGroups };
}
function ww(matchId: string): SlotSource {
  return { kind: 'match-winner', matchId };
}
function lw(matchId: string): SlotSource {
  return { kind: 'match-loser', matchId };
}
