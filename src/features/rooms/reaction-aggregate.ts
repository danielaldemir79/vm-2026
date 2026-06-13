// Reaktions-AGGREGERING (T24, #24): ren härledning ur de råa reaktions-raderna.
//
// ANSVAR (en sak, testbar utan React): ur ALLA rummets reaktioner + "vem är jag",
// härled per match: (a) antal per emoji, (b) vilken emoji JAG valt (om någon), och
// (c) totala antalet reaktioner. UI:t (MatchReactions) renderar bara resultatet.
//
// HÄRLEDD STATE (SPEC §6-anda): ingen denormaliserad räknar-kolumn i DB, vi räknar
// raderna i klienten. Ordnings-OBEROENDE räkning (en map per emoji), men VISNINGS-
// ordningen är stabil: vi följer REACTION_EMOJIS-ordningen (samma som väljaren), så
// brickorna aldrig hoppar runt när rader kommer/går (lärdomen: ett ordnings-beroende
// fallback-val ger instabil UI; här är ordningen explicit och stabil).

import { REACTION_EMOJIS, type ReactionEmoji, type RoomReaction } from '../../data/rooms';

/**
 * EN reagerare på EN emoji: vem (userId) + när (createdAt). Namnet slås INTE upp här
 * (aggregeringen är ren och vet inget om medlemslistan); UI-lagret (MatchReactions)
 * mappar userId -> displayName via rum-medlemmarna när popovern "vem reagerade" visas
 * (T74, #157). Att hålla namn-uppslaget utanför aggregeringen håller EN sanning för
 * "userId -> namn" (room_members), aggregeringen behöver bara identiteten + tiden.
 */
export interface ReactionReactor {
  /** Reagerarens user_id (mappas till displayName i UI:t). */
  userId: string;
  /** ISO-tidsstämpel för när reaktionen sattes (created_at). */
  createdAt: string;
}

/** Aggregatet för EN emoji på EN match: emojin, antalet, och om den är MIN. */
export interface ReactionTally {
  emoji: ReactionEmoji;
  /** Hur många i rummet valt denna emoji på matchen (alltid >= 1; nollor utelämnas). */
  count: number;
  /** Är detta MIN valda emoji på matchen? (då markeras knappen som aktiv). */
  mine: boolean;
  /**
   * VILKA som valt denna emoji (T74, #157), sorterade ÄLDST FÖRST (createdAt stigande),
   * stabilt vid lika tid (userId som sekundär nyckel). `reactors.length === count`.
   * UI:t visar dessa i popovern "vem reagerade", med namn + tid.
   */
  reactors: ReactionReactor[];
}

/** Allt UI:t behöver för EN match: brickorna (>0) + min valda emoji + totalen. */
export interface MatchReactionSummary {
  matchId: string;
  /** Per-emoji-räkningen, BARA de med count > 0, i REACTION_EMOJIS-ordning. */
  tallies: ReactionTally[];
  /** Min valda emoji på matchen, eller null (jag har inte reagerat). */
  myEmoji: ReactionEmoji | null;
  /** Totala antalet reaktioner på matchen (summa av alla tallies). */
  total: number;
}

/** Den tomma sammanfattningen för en match ingen reagerat på (stabil referens-form). */
function emptySummary(matchId: string): MatchReactionSummary {
  return { matchId, tallies: [], myEmoji: null, total: 0 };
}

/**
 * Bygg en `matchId -> MatchReactionSummary`-karta ur ALLA rummets reaktioner.
 *
 * @param reactions Alla råa reaktioner i rummet (ur reactions-api/providern).
 * @param myUserId  Mitt user_id (eller null = utloggad/lokalt: inget markeras "mitt").
 *
 * En reaktion med en emoji UTANFÖR REACTION_EMOJIS (omöjlig via DB:ns CHECK, men vi är
 * defensiva) räknas INTE in (hoppas tyst), så en oväntad rad aldrig kan rita en bricka
 * utan plats i väljaren. Räkningen är ordnings-oberoende; visnings-ordningen följer
 * REACTION_EMOJIS.
 */
export function aggregateReactionsByMatch(
  reactions: readonly RoomReaction[],
  myUserId: string | null
): Map<string, MatchReactionSummary> {
  // Per match: per emoji de RÅA reagerarna (vem + när), + min valda emoji. Räkningen
  // härleds ur reaktor-listans längd (en sanning), så count och reactors aldrig kan
  // drifta isär (T74: popovern visar exakt de personer count räknar).
  const reactors = new Map<string, Map<ReactionEmoji, ReactionReactor[]>>();
  const mine = new Map<string, ReactionEmoji>();

  for (const r of reactions) {
    if (!(REACTION_EMOJIS as readonly string[]).includes(r.emoji)) {
      continue; // okänd emoji (kan inte hända via CHECK), räkna inte
    }
    let perEmoji = reactors.get(r.matchId);
    if (perEmoji === undefined) {
      perEmoji = new Map<ReactionEmoji, ReactionReactor[]>();
      reactors.set(r.matchId, perEmoji);
    }
    const list = perEmoji.get(r.emoji);
    const reactor: ReactionReactor = { userId: r.userId, createdAt: r.createdAt };
    if (list === undefined) {
      perEmoji.set(r.emoji, [reactor]);
    } else {
      list.push(reactor);
    }
    if (myUserId !== null && r.userId === myUserId) {
      mine.set(r.matchId, r.emoji);
    }
  }

  const result = new Map<string, MatchReactionSummary>();
  for (const [matchId, perEmoji] of reactors) {
    const myEmoji = mine.get(matchId) ?? null;
    // Visnings-ordning = REACTION_EMOJIS-ordning (stabil), bara emojier med count > 0.
    const tallies: ReactionTally[] = [];
    let total = 0;
    for (const emoji of REACTION_EMOJIS) {
      const list = perEmoji.get(emoji);
      if (list !== undefined && list.length > 0) {
        // Reagerarna sorteras ÄLDST FÖRST (createdAt stigande), userId som stabil
        // sekundär nyckel vid exakt lika tid, så popover-ordningen är deterministisk
        // (lärdomen: ett ordnings-beroende val ger instabil UI; här är den explicit).
        const sorted = [...list].sort(byCreatedAtThenUser);
        tallies.push({ emoji, count: sorted.length, mine: myEmoji === emoji, reactors: sorted });
        total += sorted.length;
      }
    }
    result.set(matchId, { matchId, tallies, myEmoji, total });
  }
  return result;
}

/** Sortera reagerare: äldst först (createdAt stigande), userId som stabil sekundär nyckel. */
function byCreatedAtThenUser(a: ReactionReactor, b: ReactionReactor): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

/**
 * Slå upp sammanfattningen för EN match ur kartan, med en tom (men giltig) form som
 * fallback, så UI:t aldrig behöver null-kolla varje fält. En match ingen reagerat på
 * får en tom sammanfattning (inga brickor, ingen min emoji, total 0).
 */
export function summaryForMatch(
  byMatch: Map<string, MatchReactionSummary>,
  matchId: string
): MatchReactionSummary {
  return byMatch.get(matchId) ?? emptySummary(matchId);
}
