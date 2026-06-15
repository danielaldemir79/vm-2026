// Hämta RoomContribution[] för ALLA rum den inloggade är med i (LIVE-vägen för den
// totala topplistan, T82 del 3, #173). REN data-funktion (tar en klient + en rumslista,
// gör nätverksanropen), ingen React.
//
// VARFÖR en egen funktion (inte i den per-rums LeaderboardProvider): den per-rums-vyn
// (T17) laddar bara DET AKTIVA rummets tips. Totalen behöver bidrag från ALLA myRooms,
// så vi hämtar varje rums medlemmar + RLS-synliga tips och bygger samma
// RoomContribution-form aggregeringen tar. Vi RÄKNAR INGEN poäng här (DRY): det gör
// buildTotalLeaderboard mot det DELADE facit. Säkerheten är SERVER-SIDE (RLS): vi ser
// bara egna + redan-avslöjade tips i varje rum, precis som per-rums-vyn.
//
// FIXTURES-FÖRST: denna LIVE-väg körs bara när Supabase är konfigurerat. I demo/fixtures-
// läge bygger providern i stället RoomContribution[] ur demo-total-fixtures (botar), så
// samma RoomContribution-form tänds live UTAN aggregerings-ändring (en sanning).

import {
  listRoomPredictions,
  listRoomGroupPredictions,
  listRoomBracketPredictions,
  type Prediction,
  type GroupPrediction,
  type BracketPrediction,
} from '../../data/predictions';
import { listMembers, type RoomSummary } from '../../data/rooms';
import type { VmSupabaseClient } from '../../data/supabase-browser';
import type { MemberPredictions } from '../leaderboard';
import type { RoomContribution } from './aggregate-total';

/** Gruppera ett rums tre tips-typer per userId (samma form som per-rums-providern). */
function groupByUser(
  match: readonly Prediction[],
  group: readonly GroupPrediction[],
  bracket: readonly BracketPrediction[]
): Map<string, MemberPredictions> {
  const byUser = new Map<string, MemberPredictions>();
  const ensure = (userId: string): MemberPredictions => {
    let entry = byUser.get(userId);
    if (!entry) {
      entry = { userId, matchPredictions: [], groupPredictions: [], bracketPredictions: [] };
      byUser.set(userId, entry);
    }
    return entry;
  };
  for (const p of match) {
    (ensure(p.userId).matchPredictions as Prediction[]).push(p);
  }
  for (const p of group) {
    (ensure(p.userId).groupPredictions as GroupPrediction[]).push(p);
  }
  for (const p of bracket) {
    (ensure(p.userId).bracketPredictions as BracketPrediction[]).push(p);
  }
  return byUser;
}

/** Hämta ETT rums bidrag (medlemmar + RLS-synliga tips, keyade per userId). */
async function loadOne(client: VmSupabaseClient, room: RoomSummary): Promise<RoomContribution> {
  const [members, match, group, bracket] = await Promise.all([
    listMembers(client, room.id),
    listRoomPredictions(client, room.id),
    listRoomGroupPredictions(client, room.id),
    listRoomBracketPredictions(client, room.id),
  ]);
  return {
    roomId: room.id,
    members,
    predictionsByUser: groupByUser(match, group, bracket),
  };
}

/**
 * Hämta RoomContribution[] för alla `rooms` parallellt (LIVE-vägen). Aggregeringen
 * (buildTotalLeaderboard) poängsätter dem sedan mot det delade facit. En tom rumslista
 * ger en tom total (giltigt: man är inte med i något rum än).
 */
export async function loadRoomContributions(
  client: VmSupabaseClient,
  rooms: readonly RoomSummary[]
): Promise<RoomContribution[]> {
  return Promise.all(rooms.map((room) => loadOne(client, room)));
}
