// Joker-API (T19, #19): den typade klient-ytan mot Supabase-jokrarna.
//
// ANSVAR (tunt, en sak): översätt UI:ts joker-operationer (läs rummets/mina jokrar,
// sätt/ångra min joker) till Supabase-anrop, och PROJICERA raderna till en klient-
// vänlig form. Härleder formen ur DB-typerna (supabase-types.ts), inte ur en
// konsument-typ, så en schema-drift blir ett kompileringsfel (lärdomen
// mock-foljer-konsumenttyp-doljer-mappnings-drift). Systerfil till predictions-api.ts.
//
// VAD ÄR EN JOKER: en spelare pekar ut EN match per omgång (svensk kalenderdag) vars
// MATCH-tips-poäng DUBBLAS i topplistan. En joker per (rum, användare, dag) garanteras
// av DB:ns PK (en upsert byter jokern inom dagen i stället för att skapa en andra).
//
// SÄKERHET ÄR SERVER-SIDE (RLS), INTE HÄR: deadline-låset (ingen joker efter avspark,
// samma lås som tipset) och sekretessen (andras joker dolda före avspark) UPPRÄTTHÅLLS
// av RLS i databasen (bevisat med riktiga sessioner, se room-joker-rls.integration.
// test.ts + DO-block-beviset i HANDOFF/decisions.md T19). Detta API hjälper bara UI:t
// att VISA rätt, men förlitar sig ALDRIG på klient-låset för säkerhet.
//
// JOKER_DAY SKRIVS AV SERVERN: kolumnen joker_day fylls av en before-trigger ur
// match_joker_day(match_id), så klienten skickar den ALDRIG. Vi utelämnar den ur
// insert-objektet (Omit nedan); ett klient-värde skulle ändå ignoreras av triggern.
//
// FAIL LOUD (PRINCIPLES §8): varje Supabase-fel kastas vidare med ett begripligt
// svenskt meddelande. Ett RLS-avslag (t.ex. joker efter avspark) blir ett synligt
// fel, inte tyst tom data.

import type { VmSupabaseClient } from '../supabase-browser';
import type { Database } from '../supabase-types';
import { ensureSession } from '../rooms/auth';

type RoomJokerRow = Database['public']['Tables']['room_jokers']['Row'];

/** En joker så som UI:t ser den (projektion av room_jokers-raden). */
export interface RoomJoker {
  /** Vilken match jokern dubblar poängen på. */
  matchId: string;
  /** Vem som valde jokern. */
  userId: string;
  /** Den svenska kalenderdagen (ISO YYYY-MM-DD) jokern gäller, server-härledd. */
  jokerDay: string;
  updatedAt: string;
}

/** Inmatning vid sättning av en joker (UI -> API). user_id sätts av API:t (auth). */
export interface RoomJokerInput {
  matchId: string;
}

/** Kasta ett begripligt fel ur ett Supabase-fel (fail loud, svensk text). */
function fail(operation: string, message: string): never {
  throw new Error(`[VM2026] ${operation} misslyckades: ${message}`);
}

/**
 * Lista de jokrar den inloggade får SE i ett rum. RLS avgör synligheten: den egna
 * jokern alltid, andras BARA efter respektive matchs avspark (sekretessen, samma som
 * tipsen). En icke-medlem ser inget. SÄKERSTÄLLER först en session (ensureSession).
 *
 * Konsumenten (T17 topplista) använder dessa för att DUBBLA rätt matchs poäng i
 * aggregeringen. Detta API hämtar bara raderna.
 */
export async function listRoomJokers(
  client: VmSupabaseClient,
  roomId: string
): Promise<RoomJoker[]> {
  await ensureSession(client);
  const { data, error } = await client.from('room_jokers').select('*').eq('room_id', roomId);
  if (error) {
    fail('Hämta joker', error.message);
  }
  return (data ?? []).map(projectJoker);
}

/**
 * Lista BARA mina egna jokrar i ett rum (för joker-väljaren: visa vilken match jag
 * dubblat per dag). Filtrerar på user_id i frågan; RLS skulle ändå bara släppa mina
 * egna före avspark, så detta är ett explicit, snabbare uppslag.
 */
export async function listMyJokers(client: VmSupabaseClient, roomId: string): Promise<RoomJoker[]> {
  const identity = await ensureSession(client);
  const { data, error } = await client
    .from('room_jokers')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', identity.userId);
  if (error) {
    fail('Hämta mina joker', error.message);
  }
  return (data ?? []).map(projectJoker);
}

/**
 * Sätt (eller flytta) MIN joker på en match. EN joker per (rum, användare, kalenderdag):
 * upsert på (room_id, user_id, joker_day) byter jokern inom samma dag i stället för att
 * skapa en andra. user_id sätts till den inloggades id; RLS dubbelkollar att det =
 * auth.uid() (ingen förfalskning) OCH att avspark inte passerat (deadline-lås).
 *
 * joker_day UTELÄMNAS (triggern fyller den server-härlett ur match-dagen, klientens
 * värde skulle ignoreras). Vi tar därför Insert-typen MINUS joker_day, så TS inte
 * kräver ett fält vi medvetet inte skickar.
 *
 * Ett försök att sätta jokern EFTER avspark nekas av RLS och blir ett fail-loud-fel här
 * (inte en tyst no-op), så UI:t kan visa "matchen är låst".
 */
export async function upsertMyJoker(
  client: VmSupabaseClient,
  roomId: string,
  input: RoomJokerInput
): Promise<RoomJoker> {
  const identity = await ensureSession(client);
  // Insert MINUS joker_day: triggern (room_jokers_set_day) fyller dagen server-side.
  const row: Omit<Database['public']['Tables']['room_jokers']['Insert'], 'joker_day'> = {
    room_id: roomId,
    match_id: input.matchId,
    user_id: identity.userId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from('room_jokers')
    // joker_day fylls av triggern; vi castar bort den ur Insert-kontraktet (se Omit ovan).
    .upsert(row as Database['public']['Tables']['room_jokers']['Insert'], {
      onConflict: 'room_id,user_id,joker_day',
    })
    .select('*')
    .single();
  if (error) {
    fail('Spara joker', error.message);
  }
  return projectJoker(data);
}

/**
 * Ångra MIN joker för en viss match (ta bort raden). Bara FÖRE avspark (RLS); efter
 * avspark är jokern bindande och kan inte tas bort. Tyst no-op om ingen joker fanns.
 */
export async function removeMyJoker(
  client: VmSupabaseClient,
  roomId: string,
  matchId: string
): Promise<void> {
  const identity = await ensureSession(client);
  const { error } = await client
    .from('room_jokers')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', identity.userId)
    .eq('match_id', matchId);
  if (error) {
    fail('Ångra joker', error.message);
  }
}

/** Projicera en DB-rad till den klient-vänliga RoomJoker-formen. */
function projectJoker(row: RoomJokerRow): RoomJoker {
  return {
    matchId: row.match_id,
    userId: row.user_id,
    jokerDay: row.joker_day,
    updatedAt: row.updated_at,
  };
}
