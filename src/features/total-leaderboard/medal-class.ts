// Medalj-modifierare per topp-3-placering (T82 del 3, #173). Samma kartläggning som
// T17:s LeaderboardView (DRY-anda): 1=guld, 2=silver, 3=brons. Plats 4+ = ingen medalj
// (undefined), då bär raden den neutrala .vm-board-rank-pillen i stället.

/** Topp-3-placering -> .vm-pool-medal-modifierare. undefined för plats 4+. */
export const MEDAL_CLASS: Record<number, string | undefined> = {
  1: 'vm-pool-medal--gold',
  2: 'vm-pool-medal--silver',
  3: 'vm-pool-medal--bronze',
};
