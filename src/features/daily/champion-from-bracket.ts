// REN HÄRLEDNING: världsmästaren ur det redan härledda slutspelsträdet. Skild från
// ChampionBanner (den tunna vyn) så logiken är enhetstestbar utan providers, exakt
// som slutspel-reminder-round/window är rena helpers till SlutspelReminder.
//
// EN SANNING: samma härledning som BracketView:s "Världsmästare"-ruta , finalens
// (stage 'final') vinnar-slot, och BARA när finalen faktiskt är avgjord (winnerSlotId
// satt). Vi gissar aldrig en mästare i förväg (ospelad final -> null).

import type { BracketState } from '../bracket/derive-bracket';

/**
 * Världsmästarens Team.id, eller null om finalen inte är avgjord (eller trädet saknas).
 * Ren funktion av det härledda trädet, lagrar inget.
 */
export function championTeamIdFromBracket(bracket: BracketState | null): string | null {
  const finalMatch = bracket?.matches.find((m) => m.stage === 'final');
  if (!finalMatch || finalMatch.winnerSlotId === null) {
    return null;
  }
  const champ = [finalMatch.home, finalMatch.away].find(
    (s) => s.id === finalMatch.winnerSlotId
  );
  return champ?.teamId ?? null;
}
