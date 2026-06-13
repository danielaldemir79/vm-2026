// Reaktions-FÖRFATTAR-härledning (T74, #157): ren mappning från en emojis reagerare
// (userId + createdAt) + medlems-namn-uppslag -> visnings-rader (namn + tid + min).
//
// ANSVAR (en sak, testbar utan React): ur en ReactionTally:s `reactors` (redan
// sorterade äldst-först i aggregeringen) + en `userId -> displayName`-karta, bygg de
// rader popovern "vem reagerade" visar. Namn-uppslaget kommer från room_members (EN
// sanning, samma källa som RoomComments + topplistan använder), INTE en ny datakälla.
//
// EDGE-FALL (PRINCIPLES §5, fel-vägar): en reagerare som lämnat rummet (saknas i
// medlemslistan) faller till "Tidigare medlem" (samma fallback som RoomComments),
// ALDRIG en tom/trasig rad eller en krasch. Tom reaktor-lista -> tom rad-lista.
//
// VARFÖR härledd här (inte i aggregeringen): aggregeringen är ren och rör inte
// medlemslistan (lägsta koppling). Namn-uppslaget lever i UI-nära lagret eftersom
// medlemmarna kommer från rums-storen, inte från reaktions-raderna.

import type { ReactionReactor } from './reaction-aggregate';

/** Saknad medlem (lämnat rummet): samma fallback-etikett som RoomComments. */
export const UNKNOWN_MEMBER_NAME = 'Tidigare medlem';

/** En rad i "vem reagerade"-popovern: vem (namn), när (ISO + redan formaterad), min. */
export interface ReactionAuthorRow {
  /** Reagerarens user_id (stabil React-nyckel + avatar-hue-källa). */
  userId: string;
  /** Visningsnamnet (ur medlemslistan), eller fallback om medlemmen lämnat rummet. */
  name: string;
  /** Rå ISO-tidsstämpel (för <time dateTime>), oförändrad från reaktionen. */
  createdAtIso: string;
  /** Är detta JAG? (popovern kan markera "(du)", färg-oberoende). */
  mine: boolean;
}

/**
 * Bygg popover-raderna för EN emoji: mappa varje reagerare till namn + tid + min-flagga.
 * Ordningen ärvs från `reactors` (aggregeringen sorterar äldst-först, deterministiskt).
 *
 * @param reactors  Reagerarna för emojin (ur ReactionTally.reactors, redan sorterade).
 * @param nameByUser  userId -> displayName (ur room_members; saknad => fallback).
 * @param myUserId  Mitt user_id (null = utloggad/lokalt), för "(du)"-markering.
 */
export function resolveReactionAuthors(
  reactors: readonly ReactionReactor[],
  nameByUser: ReadonlyMap<string, string>,
  myUserId: string | null
): ReactionAuthorRow[] {
  return reactors.map((r) => ({
    userId: r.userId,
    name: nameByUser.get(r.userId) ?? UNKNOWN_MEMBER_NAME,
    createdAtIso: r.createdAt,
    mine: myUserId !== null && r.userId === myUserId,
  }));
}
