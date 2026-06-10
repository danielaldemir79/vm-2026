// Rooms-API (T14, #14): den typade klient-ytan mot Supabase-rummen.
//
// ANSVAR (tunt, en sak): översätt UI:ts rum-operationer (skapa, gå med via kod,
// lista medlemmar, lämna, läsa/skriva delade resultat) till Supabase-anrop, och
// PROJICERA raderna till klient-vänliga former. Härleder formerna från DB-typerna
// (supabase-types.ts), inte från en konsument-typ, så en schema-drift blir ett
// kompileringsfel (lärdomen mock-foljer-konsumenttyp-doljer-mappnings-drift).
//
// AUTH: varje skrivande operation kräver en session. Vi anropar ensureSession()
// internt så UI:t slipper koordinera auth + data (KISS). Identiteten används för
// updated_by (server-RLS dubbelkollar att den = auth.uid(), ingen förfalskning).
//
// FAIL LOUD (PRINCIPLES §8): varje Supabase-fel kastas vidare med ett begripligt
// svenskt meddelande. Ingen tyst tom-data-maskering, ett RLS-avslag eller nätfel
// ska synas.

import type { VmSupabaseClient } from '../supabase-browser';
import type { Database } from '../supabase-types';
import { ensureSession } from './auth';
import { generateRoomCode, normalizeRoomCode } from './room-code';

type RoomMemberRow = Database['public']['Tables']['room_members']['Row'];
type ResultRow = Database['public']['Tables']['room_match_results']['Row'];

/** Ett rum så som UI:t ser det (efter skapa/gå-med). */
export interface RoomSummary {
  id: string;
  name: string;
  code: string;
}

/** En medlem i ett rum (för medlemslistan). */
export interface RoomMember {
  userId: string;
  displayName: string;
}

/** Ett delat matchresultat i ett rum (projektion av room_match_results). */
export interface RoomMatchResult {
  matchId: string;
  homeGoals: number;
  awayGoals: number;
  penalties: { homeGoals: number; awayGoals: number } | null;
  status: 'scheduled' | 'live' | 'finished';
  updatedBy: string;
  updatedAt: string;
}

/** Inmatning vid skriv av ett delat resultat (UI -> API). */
export interface RoomResultInput {
  matchId: string;
  homeGoals: number;
  awayGoals: number;
  penalties?: { homeGoals: number; awayGoals: number } | null;
  status: 'scheduled' | 'live' | 'finished';
}

/** Kasta ett begripligt fel ur ett Supabase-fel (fail loud, svensk text). */
function fail(operation: string, message: string): never {
  throw new Error(`[VM2026] ${operation} misslyckades: ${message}`);
}

/**
 * Skapa ett nytt rum (atomiskt med skaparen som första medlem, via create_room-
 * RPC). Genererar en otvetydig kod i klienten; den astronomiskt osannolika
 * UNIQUE-krocken fångas av DB:n och vi försöker då igen med en ny kod (vi gissar
 * aldrig att en kod är unik, databasen är sanningen).
 *
 * @param maxAttempts  hur många koder vi prövar vid UNIQUE-krock (default 5).
 */
export async function createRoom(
  client: VmSupabaseClient,
  name: string,
  displayName: string,
  maxAttempts = 5
): Promise<RoomSummary> {
  await ensureSession(client);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await client.rpc('create_room', {
      p_code: code,
      p_name: name,
      p_display_name: displayName,
    });
    if (error) {
      // 23505 = unique_violation (kod-krock): pröva en ny kod. Andra fel kastar.
      if (error.code === '23505') {
        continue;
      }
      fail('Skapa rum', error.message);
    }
    const row = data?.[0];
    if (!row) {
      fail('Skapa rum', 'inget rum returnerades (oväntat).');
    }
    return { id: row.room_id, name: row.room_name, code: row.room_code };
  }
  fail('Skapa rum', `kunde inte hitta en ledig kod efter ${maxAttempts} försök.`);
}

/**
 * Gå med i ett rum via dess kod (join_room_by_code-RPC). Returnerar rummet, eller
 * null om koden inte matchar något rum (klienten visar "rummet finns inte").
 * Idempotent: att gå med igen byter bara visningsnamnet.
 */
export async function joinRoomByCode(
  client: VmSupabaseClient,
  code: string,
  displayName: string
): Promise<RoomSummary | null> {
  await ensureSession(client);

  const { data, error } = await client.rpc('join_room_by_code', {
    p_code: normalizeRoomCode(code),
    p_display_name: displayName,
  });
  if (error) {
    fail('Gå med i rum', error.message);
  }
  const row = data?.[0];
  if (!row) {
    return null; // okänd kod, ingen läcka
  }
  return { id: row.room_id, name: row.room_name, code: row.room_code };
}

/**
 * Lista de rum den inloggade användaren är medlem i. RLS gör att bara egna rum
 * returneras (en icke-medlem ser inget). Tom session -> tom lista (ingen identitet).
 */
export async function listMyRooms(client: VmSupabaseClient): Promise<RoomSummary[]> {
  await ensureSession(client);
  // Hämta via medlemskap-join: room_members -> rooms (RLS låter bara egna passera).
  const { data, error } = await client
    .from('room_members')
    .select('rooms ( id, name, code )')
    .order('joined_at', { ascending: true });
  if (error) {
    fail('Hämta mina rum', error.message);
  }
  const rows = data ?? [];
  return rows
    .map((r) => r.rooms as { id: string; name: string; code: string } | null)
    .filter((room): room is { id: string; name: string; code: string } => room !== null)
    .map((room) => ({ id: room.id, name: room.name, code: room.code }));
}

/** Lista medlemmarna i ett rum (RLS: bara om anroparen själv är medlem). */
export async function listMembers(client: VmSupabaseClient, roomId: string): Promise<RoomMember[]> {
  const { data, error } = await client
    .from('room_members')
    .select('user_id, display_name')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });
  if (error) {
    fail('Hämta medlemmar', error.message);
  }
  return (data ?? []).map((m: Pick<RoomMemberRow, 'user_id' | 'display_name'>) => ({
    userId: m.user_id,
    displayName: m.display_name,
  }));
}

/**
 * Lämna ett rum (ta bort sin egen medlems-rad). RLS låter bara en användare ta
 * bort sin EGEN rad. Idempotent: redan ej-medlem -> ofarligt (0 rader rörda).
 */
export async function leaveRoom(client: VmSupabaseClient, roomId: string): Promise<void> {
  const identity = await ensureSession(client);
  const { error } = await client
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', identity.userId);
  if (error) {
    fail('Lämna rum', error.message);
  }
}

/** Hämta alla delade matchresultat i ett rum (RLS: bara medlemmar). */
export async function listRoomResults(
  client: VmSupabaseClient,
  roomId: string
): Promise<RoomMatchResult[]> {
  const { data, error } = await client.from('room_match_results').select('*').eq('room_id', roomId);
  if (error) {
    fail('Hämta resultat', error.message);
  }
  return (data ?? []).map(projectResult);
}

/**
 * Skriv (eller uppdatera) ett delat matchresultat i ett rum (upsert på PK
 * room_id+match_id). updated_by sätts till den inloggades id; RLS dubbelkollar
 * att det = auth.uid() (ingen förfalskning). Medlemskap krävs (RLS).
 */
export async function upsertRoomResult(
  client: VmSupabaseClient,
  roomId: string,
  input: RoomResultInput
): Promise<RoomMatchResult> {
  const identity = await ensureSession(client);
  const row: Database['public']['Tables']['room_match_results']['Insert'] = {
    room_id: roomId,
    match_id: input.matchId,
    home_goals: input.homeGoals,
    away_goals: input.awayGoals,
    penalties_home: input.penalties ? input.penalties.homeGoals : null,
    penalties_away: input.penalties ? input.penalties.awayGoals : null,
    status: input.status,
    updated_by: identity.userId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from('room_match_results')
    .upsert(row, { onConflict: 'room_id,match_id' })
    .select('*')
    .single();
  if (error) {
    fail('Spara resultat', error.message);
  }
  return projectResult(data);
}

/** Projicera en DB-rad till den klient-vänliga RoomMatchResult-formen. */
function projectResult(row: ResultRow): RoomMatchResult {
  // Straffar: båda satta eller båda null (DB:s check rmr_penalties_paired
  // garanterar att de aldrig är halvt satta).
  const penalties =
    row.penalties_home !== null && row.penalties_away !== null
      ? { homeGoals: row.penalties_home, awayGoals: row.penalties_away }
      : null;
  return {
    matchId: row.match_id,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    penalties,
    // Status valideras av DB:s check rmr_status_valid, så castningen är säker.
    status: row.status as RoomMatchResult['status'],
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}
