// Reaktions-API (T24, #24): den typade klient-ytan mot rummets emoji-reaktioner.
//
// ANSVAR (tunt, en sak): översätt UI:ts reaktions-operationer (lista, sätt/byt, ta
// bort) till Supabase-anrop och PROJICERA raderna till en klient-vänlig form. Härleder
// formen ur DB-typerna (supabase-types.ts), inte ur en konsument-typ, så en schema-drift
// blir ett kompileringsfel (lärdomen mock-foljer-konsumenttyp-doljer-mappnings-drift).
//
// MODELL: EN reaktion per (rum, användare, match). upsertMyReaction skriver/byter den
// egna raden (upsert mot PK:n room_id+user_id+match_id), removeMyReaction tar bort den.
// Aggregatet (hur många tryckte vilken emoji på en match) räknas i PROVIDER:n ur de råa
// raderna (härledd state), inte här, så API:t är rent läs/skriv mot DB.
//
// KURERAD EMOJI-LISTA (REACTION_EMOJIS, 8 st): speglar DB:ns room_reactions_emoji_allowed
// -CHECK 1:1 (migrationen 20260612160000_t24...). En sanning, två speglar. Klienten
// validerar mot listan INNAN nätanropet (snäll UX), men DB:n är sanningen: en emoji
// utanför listan som ändå når DB:n nekas av CHECK:en -> fail-loud-fel.
//
// AUTH: upsertMyReaction kräver en session (ensureSession). user_id sätts av DB:ns
// default auth.uid() OCH RLS:s with check binder den till auth.uid(), så vi skickar
// den inte ens från klienten (ingen förfalskning möjlig).
//
// FAIL LOUD (PRINCIPLES §8): varje Supabase-fel kastas vidare med ett begripligt
// svenskt meddelande. Ingen tyst tom-data-maskering.

import type { VmSupabaseClient } from '../supabase-browser';
import type { Database } from '../supabase-types';
import { ensureSession } from './auth';

type ReactionRow = Database['public']['Tables']['room_reactions']['Row'];

/**
 * Den KURERADE emoji-listan (8 st). Speglar DB:ns room_reactions_emoji_allowed-CHECK
 * EXAKT (migrationen). Ordningen här är också UI-ordningen (väljaren visar dem så här).
 * Designval + betydelser dokumenterade i docs/decisions.md (T24).
 */
export const REACTION_EMOJIS = ['⚽', '🔥', '😂', '😭', '🎉', '👏', '😱', '🧊'] as const;

/** En tillåten reaktions-emoji (typ-snäv: bara de 8 ur listan). */
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Är strängen en av de 8 tillåtna emojierna? (klient-validering före nätanrop). */
export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(value);
}

/** En reaktion så som UI:t ser den (projektion av room_reactions). */
export interface RoomReaction {
  /** Vilket rum reaktionen hör till. */
  roomId: string;
  /** Reagerarens user_id. UI:t jämför mot "mig" för att markera min knapp. */
  userId: string;
  /** Matchen reaktionen sitter på (match-id ur den statiska planen). */
  matchId: string;
  /** Den valda emojin (en av REACTION_EMOJIS). */
  emoji: ReactionEmoji;
  /** ISO-tidsstämpel (created_at). */
  createdAt: string;
}

/** Kasta ett begripligt fel ur ett Supabase-fel (fail loud, svensk text). */
function fail(operation: string, message: string): never {
  throw new Error(`[VM2026] ${operation} misslyckades: ${message}`);
}

/**
 * Hämta ALLA reaktioner i ett rum (klienten/providern aggregerar per match). RLS: bara
 * medlemmar får rader (utomstående får tom lista, inte fel). Ingen sortering behövs,
 * aggregeringen är ordnings-oberoende (en räkning per emoji).
 */
export async function listRoomReactions(
  client: VmSupabaseClient,
  roomId: string
): Promise<RoomReaction[]> {
  const { data, error } = await client
    .from('room_reactions')
    .select('room_id, user_id, match_id, emoji, created_at')
    .eq('room_id', roomId);
  if (error) {
    fail('Hämta reaktioner', error.message);
  }
  return (data ?? []).map(projectReaction);
}

/**
 * Sätt ELLER byt MIN reaktion på en match (upsert mot PK:n room_id+user_id+match_id).
 * En andra reaktion på samma match BYTER emojin i stället för att skapa en ny rad.
 * Validerar emojin mot REACTION_EMOJIS i klienten INNAN nätanropet (snabb feedback);
 * DB:n är ändå sanningen (CHECK nekar en otillåten emoji). user_id sätts av DB:ns
 * default auth.uid() (vi skickar den inte), RLS kräver medlemskap.
 *
 * KASTAR (fail loud) vid otillåten emoji (klient-validering) ELLER ett RLS-/DB-avslag
 * (icke-medlem, CHECK-brott): en reaktion som inte gick in ska SYNAS som ett fel.
 */
export async function upsertMyReaction(
  client: VmSupabaseClient,
  roomId: string,
  matchId: string,
  emoji: string
): Promise<RoomReaction> {
  if (!isReactionEmoji(emoji)) {
    fail('Reagera', `emojin ${emoji} är inte en tillåten reaktion.`);
  }
  // Säkerställ en session så auth.uid() finns för DB-defaulten + RLS-checken.
  await ensureSession(client);
  const row: Database['public']['Tables']['room_reactions']['Insert'] = {
    room_id: roomId,
    match_id: matchId,
    emoji,
    // user_id UTELÄMNAS med flit: DB:ns default auth.uid() + RLS:s with check binder
    // den till den inloggade, så avsändaren aldrig kan förfalskas från klienten.
  };
  const { data, error } = await client
    .from('room_reactions')
    // onConflict på PK:n: en andra reaktion på samma match uppdaterar emoji-kolumnen
    // (RLS:s UPDATE-policy gäller på den egna raden), den skapar aldrig en andra rad.
    .upsert(row, { onConflict: 'room_id,user_id,match_id' })
    .select('room_id, user_id, match_id, emoji, created_at')
    .single();
  if (error) {
    fail('Reagera', error.message);
  }
  return projectReaction(data);
}

/**
 * Ta bort MIN reaktion på en match (avmarkera). RLS: DELETE bara på egen rad. Vi
 * filtrerar på match_id; user_id behöver vi inte skicka (RLS gränsar till den egna
 * raden ändå). Idempotent: en redan borttagen reaktion rör 0 rader, inget fel.
 */
export async function removeMyReaction(
  client: VmSupabaseClient,
  roomId: string,
  matchId: string
): Promise<void> {
  const { error } = await client
    .from('room_reactions')
    .delete()
    .eq('room_id', roomId)
    .eq('match_id', matchId);
  if (error) {
    fail('Ta bort reaktion', error.message);
  }
}

/** Projicera en DB-rad till den klient-vänliga RoomReaction-formen. */
function projectReaction(
  row: Pick<ReactionRow, 'room_id' | 'user_id' | 'match_id' | 'emoji' | 'created_at'>
): RoomReaction {
  return {
    roomId: row.room_id,
    userId: row.user_id,
    matchId: row.match_id,
    // DB:ns CHECK garanterar att emoji är en av de 8; narrowa typen för UI:t. En
    // hypotetisk rad utanför listan (omöjlig via CHECK:en) skulle ändå bära strängen.
    emoji: row.emoji as ReactionEmoji,
    createdAt: row.created_at,
  };
}
