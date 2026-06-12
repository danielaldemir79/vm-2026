// Admin-statistik-API (T45, #76): den typade klient-ytan mot de TVÅ admin-RPC:erna
// (admin_room_stats + admin_revealed_predictions).
//
// ANSVAR (tunt, en sak): översätt admin-UI:ts statistik-behov till RPC-anrop och
// PROJICERA de platta RPC-raderna till klient-vänliga former (rum med medlemmar +
// engagemang, och avslöjade tips grupperade per rum+medlem för poäng-motorn).
// Härleder formerna ur DB-/RPC-typerna (supabase-types.ts), inte ur en konsument-
// typ, så en schema-drift blir ett kompileringsfel (lärdomen mock-foljer-konsumenttyp).
//
// SÄKERHET ÄR SERVER-SIDE (HÖG-RISK, SEKRETESS + TÄVLINGSINTEGRITET): att BARA admin
// får läsa över alla rum UPPRÄTTHÅLLS av RPC:ernas is_app_admin()-gate (en icke-admin
// får TOM mängd), och att FRAMTIDA (hemliga) tips ALDRIG returneras upprätthålls av
// RPC:ernas now() >= deadline-filter (samma gräns som tips-RLS own_or_after_kickoff).
// Bevisat server-side med riktiga roller + jwt-claims (DO-block, se decisions.md T45)
// och via en RLS-integrationstest med riktiga anonyma sessioner (icke-admin -> tomt).
// Detta API förlitar sig ALDRIG på en klient-gate för säkerheten.
//
// FAIL LOUD (PRINCIPLES §8): varje Supabase-fel kastas vidare med ett begripligt
// svenskt meddelande, inte tyst tom data.

import type { VmSupabaseClient } from '../supabase-browser';
import type { Database } from '../supabase-types';
import { ensureSession } from '../rooms/auth';

type RoomStatsRow = Database['public']['Functions']['admin_room_stats']['Returns'][number];
type RevealedRow = Database['public']['Functions']['admin_revealed_predictions']['Returns'][number];

/** En medlem i ett rum, ur admin-överblicken. */
export interface AdminRoomMember {
  userId: string;
  displayName: string;
  joinedAt: string;
}

/**
 * Ett rum med admin-statistik (aggregat + medlemslista). ENGAGEMANGS-räknarna är
 * ANTAL tips, inte tips-innehåll: de läcker inget om VAD någon tippat (sekretess-
 * säkert), bara hur aktiv hen är.
 */
export interface AdminRoomStat {
  roomId: string;
  name: string;
  code: string;
  createdAt: string;
  memberCount: number;
  /** Antal match-resultat-tips lagda i rummet (engagemang, inte innehåll). */
  matchPredictionCount: number;
  /** Antal gruppvinnar-tips lagda i rummet. */
  groupPredictionCount: number;
  /** Antal bracket-/mästar-tips lagda i rummet. */
  bracketPredictionCount: number;
  /** Medlemmarna i rummet (visningsnamn + när de gick med). */
  members: AdminRoomMember[];
}

/**
 * Ett AVSLÖJAT tips (deadline passerad) ur en av de tre tips-typerna, normaliserat.
 * Bär room_id + user_id så klienten kan poängsätta per rum och medlem mot facit.
 *
 * `kind` diskriminerar formen:
 *   - 'match'   : key = match_id, homeGoals/awayGoals satta (target=null).
 *   - 'group'   : key = group_id, winnerCode/runnerUpCode satta.
 *   - 'bracket' : key = slot_id, target = avancerande lag-CODE (eller 'champion'-slot).
 */
export type AdminRevealedPrediction =
  | {
      kind: 'match';
      roomId: string;
      userId: string;
      matchId: string;
      homeGoals: number;
      awayGoals: number;
    }
  | {
      kind: 'group';
      roomId: string;
      userId: string;
      groupId: string;
      winnerTeamId: string;
      runnerUpTeamId: string;
    }
  | {
      kind: 'bracket';
      roomId: string;
      userId: string;
      slotId: string;
      advancingTeamId: string;
    };

/** Kasta ett begripligt fel ur ett Supabase-fel (fail loud, svensk text). */
function fail(operation: string, message: string): never {
  throw new Error(`[VM2026] ${operation} misslyckades: ${message}`);
}

/**
 * Hämta per-rum-statistiken (alla rum + medlemmar + engagemang). BARA en admin får
 * data , RPC:n (is_app_admin) returnerar tom mängd för en icke-admin, så listan blir
 * tom (inget fel) i det fallet. En anonym icke-admin ser alltså ingenting, vilket är
 * rätt: ingen klient-gate behövs, servern är skyddet.
 *
 * RPC:n ger EN rad per (rum, medlem) med rummets aggregat upprepat; vi GRUPPERAR
 * tillbaka per room_id till ett AdminRoomStat med en medlemslista (en sanning per rum).
 */
export async function fetchAdminRoomStats(client: VmSupabaseClient): Promise<AdminRoomStat[]> {
  await ensureSession(client);
  const { data, error } = await client.rpc('admin_room_stats');
  if (error) {
    fail('Hämta admin-statistik', error.message);
  }
  return groupRoomStats(data ?? []);
}

/**
 * Hämta de AVSLÖJADE tipsen (deadline passerad) över alla rum. BARA en admin får
 * data (RPC-gaten). Framtida/hemliga tips returneras ALDRIG (RPC-filtret now() >=
 * deadline). Konsumenten poängsätter dem mot det PUBLIKA globala facit via den
 * befintliga poäng-motorn (buildLeaderboard), så ingen poäng-logik dupliceras.
 */
export async function fetchAdminRevealedPredictions(
  client: VmSupabaseClient
): Promise<AdminRevealedPrediction[]> {
  await ensureSession(client);
  const { data, error } = await client.rpc('admin_revealed_predictions');
  if (error) {
    fail('Hämta avslöjade tips', error.message);
  }
  return (data ?? []).map(projectRevealed).filter((p): p is AdminRevealedPrediction => p !== null);
}

/** Gruppera de platta RPC-raderna till ett AdminRoomStat per rum (med medlemslista). */
function groupRoomStats(rows: readonly RoomStatsRow[]): AdminRoomStat[] {
  const byRoom = new Map<string, AdminRoomStat>();
  for (const row of rows) {
    let room = byRoom.get(row.room_id);
    if (!room) {
      room = {
        roomId: row.room_id,
        name: row.room_name,
        code: row.room_code,
        createdAt: row.room_created_at,
        memberCount: row.member_count,
        matchPredictionCount: row.match_prediction_count,
        groupPredictionCount: row.group_prediction_count,
        bracketPredictionCount: row.bracket_prediction_count,
        members: [],
      };
      byRoom.set(row.room_id, room);
    }
    room.members.push({
      userId: row.member_user_id,
      displayName: row.member_display_name,
      joinedAt: row.member_joined_at,
    });
  }
  return [...byRoom.values()];
}

/**
 * Projicera en avslöjad RPC-rad till den diskriminerade AdminRevealedPrediction-formen.
 * Returnerar null för en okänd `kind` eller en rad där de fält den typen kräver saknas
 * (defensivt: en framtida RPC-ändring ska inte krascha admin-vyn, raden hoppas över).
 */
function projectRevealed(row: RevealedRow): AdminRevealedPrediction | null {
  switch (row.kind) {
    case 'match': {
      // team_a = home_goals::text, team_b = away_goals::text (RPC-kontraktet).
      const home = toInt(row.team_a);
      const away = toInt(row.team_b);
      if (home === null || away === null) {
        return null;
      }
      return {
        kind: 'match',
        roomId: row.room_id,
        userId: row.user_id,
        matchId: row.key,
        homeGoals: home,
        awayGoals: away,
      };
    }
    case 'group': {
      // team_a = winner_team_id, team_b = runner_up_team_id (CODE).
      if (row.team_a === null || row.team_b === null) {
        return null;
      }
      return {
        kind: 'group',
        roomId: row.room_id,
        userId: row.user_id,
        groupId: row.key,
        winnerTeamId: row.team_a,
        runnerUpTeamId: row.team_b,
      };
    }
    case 'bracket': {
      // team_a = advancing_team_id (CODE), key = slot_id (M73..M104 el. 'champion').
      if (row.team_a === null) {
        return null;
      }
      return {
        kind: 'bracket',
        roomId: row.room_id,
        userId: row.user_id,
        slotId: row.key,
        advancingTeamId: row.team_a,
      };
    }
    default:
      return null;
  }
}

/** Tolka en sträng till ett heltal, eller null (RPC skickar mål-tal som text). */
function toInt(value: string | null): number | null {
  if (value === null || value.trim() === '') {
    return null;
  }
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}
