// Match-kommentar-GRUPPERING (T77, #161): ren härledning ur de råa match-tråd-raderna.
//
// ANSVAR (en sak, testbar utan React): ur ALLA rummets MATCH-kommentarer (de med
// match_id satt), gruppera per match_id -> kommentarerna i den matchens tråd (ÄLDST
// först = chatt-konvention). UI:t (MatchComments) slår upp sin match och renderar
// tråden + antalet. Samma modell som reaktions-aggregeringen (T24): EN hämtning för
// hela rummet, grupperad i minnet, inte en hämtning per match.
//
// HÄRLEDD STATE (SPEC §6-anda): ingen denormaliserad räknar-kolumn i DB, antalet är
// listans längd (en sanning, kan aldrig drifta isär). Ordningen är ÄLDST FÖRST
// (createdAt stigande, id som stabil sekundär nyckel vid exakt lika tid), deterministisk
// så trådarna aldrig hoppar runt när rader kommer/går.
//
// RUMS-CHATTEN (T66, match_id null) hör INTE hit: providern hämtar bara match-trådar
// (listRoomMatchComments filtrerar match_id IS NOT NULL), men vi är defensiva och
// hoppar en ev. null-rad ändå, så en match-tråd aldrig kan visa en rums-chatt-rad.

import type { RoomComment } from '../../data/rooms';

/** Allt UI:t behöver för EN match-tråd: kommentarerna (äldst först) + antalet. */
export interface MatchCommentThread {
  matchId: string;
  /** Trådens kommentarer, ÄLDST först (chatt-konvention). `comments.length === count`. */
  comments: RoomComment[];
  /** Antal kommentarer i tråden (= comments.length, härlett, ingen separat räknare). */
  count: number;
}

/** Den tomma tråden för en match ingen kommenterat (stabil, giltig form). */
function emptyThread(matchId: string): MatchCommentThread {
  return { matchId, comments: [], count: 0 };
}

/**
 * Bygg en `matchId -> MatchCommentThread`-karta ur ALLA rummets match-kommentarer.
 *
 * @param comments Alla råa MATCH-kommentarer i rummet (match_id satt; ur comments-api/
 *                 providern via listRoomMatchComments).
 *
 * En rad UTAN matchId (null = rums-chatt, ska inte finnas i indatan, men vi är defensiva)
 * hoppas tyst, så en match-tråd aldrig kan rita en rums-chatt-rad. Inom varje tråd
 * sorteras kommentarerna ÄLDST FÖRST, så ordningen är stabil oavsett indatans ordning.
 */
export function groupCommentsByMatch(
  comments: readonly RoomComment[]
): Map<string, MatchCommentThread> {
  const byMatch = new Map<string, RoomComment[]>();
  for (const c of comments) {
    if (c.matchId === null) {
      continue; // rums-chatt-rad (kan inte hända i match-indatan), gruppera aldrig in den
    }
    const list = byMatch.get(c.matchId);
    if (list === undefined) {
      byMatch.set(c.matchId, [c]);
    } else {
      list.push(c);
    }
  }

  const result = new Map<string, MatchCommentThread>();
  for (const [matchId, list] of byMatch) {
    // ÄLDST FÖRST (createdAt stigande), id som stabil sekundär nyckel vid exakt lika
    // tid, så tråden är deterministisk (lärdomen: ett ordnings-beroende val ger instabil
    // UI; här är ordningen explicit).
    const sorted = [...list].sort(byCreatedAtThenId);
    result.set(matchId, { matchId, comments: sorted, count: sorted.length });
  }
  return result;
}

/** Sortera kommentarer: äldst först (createdAt stigande), id som stabil sekundär nyckel. */
function byCreatedAtThenId(a: RoomComment, b: RoomComment): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Slå upp tråden för EN match ur kartan, med en tom (men giltig) form som fallback, så
 * UI:t aldrig behöver null-kolla varje fält. En match ingen kommenterat får en tom tråd
 * (inga kommentarer, count 0 = affordansen visar "Kommentera").
 */
export function threadForMatch(
  byMatch: Map<string, MatchCommentThread>,
  matchId: string
): MatchCommentThread {
  return byMatch.get(matchId) ?? emptyThread(matchId);
}
