// Kommentar-API (T66, #121): den typade klient-ytan mot rummets kommentarer.
//
// ANSVAR (tunt, en sak): översätt UI:ts kommentar-operationer (lista, skriv, radera
// egen) till Supabase-anrop och PROJICERA raderna till en klient-vänlig form. Härleder
// formen ur DB-typerna (supabase-types.ts), inte ur en konsument-typ, så en schema-drift
// blir ett kompileringsfel (lärdomen mock-foljer-konsumenttyp-doljer-mappnings-drift).
//
// VISNINGSNAMN: kommentaren bär BARA user_id (ingen denormaliserad display_name,
// migrations-beslutet). Klienten slår upp namnet i medlemslistan den redan har
// (RoomsProvider.members), så namnet är EN sanning (room_members) och driver inte isär.
//
// LÄNGDGRÄNS: COMMENT_MAX_LEN (500) speglar DB:ns room_comments_body_len-CHECK. Vi
// trimmar + validerar i klienten (snäll UX: tom/för lång stoppas innan nätanrop), men
// DB:n är sanningen (gissa aldrig att klienten skickar rätt). En tom/för lång body som
// ändå når DB:n nekas av CHECK:en -> fail-loud-fel.
//
// AUTH: addComment kräver en session (ensureSession). user_id sätts av DB:ns
// default auth.uid() OCH RLS:s with check binder den till auth.uid(), så vi skickar
// den inte ens från klienten (ingen förfalskning möjlig).
//
// FAIL LOUD (PRINCIPLES §8): varje Supabase-fel kastas vidare med ett begripligt
// svenskt meddelande. Ingen tyst tom-data-maskering.

import type { VmSupabaseClient } from '../supabase-browser';
import type { Database } from '../supabase-types';
import { ensureSession } from './auth';

type CommentRow = Database['public']['Tables']['room_comments']['Row'];

/** Längdgräns för en kommentar, speglar DB:ns room_comments_body_len-CHECK (1-500). */
export const COMMENT_MAX_LEN = 500;

/** En kommentar så som UI:t ser den (projektion av room_comments). */
export interface RoomComment {
  id: string;
  /** Författarens user_id. UI:t slår upp visningsnamnet i medlemslistan. */
  userId: string;
  body: string;
  /** ISO-tidsstämpel (created_at). UI:t formaterar den lokalt. */
  createdAt: string;
}

/** Kasta ett begripligt fel ur ett Supabase-fel (fail loud, svensk text). */
function fail(operation: string, message: string): never {
  throw new Error(`[VM2026] ${operation} misslyckades: ${message}`);
}

/**
 * Hämta ett rums kommentarer i tidsordning (ÄLDST först, nyast sist = chatt-konvention,
 * nyaste längst ner). RLS: bara medlemmar får rader (utomstående får tom lista, inte fel).
 */
export async function listRoomComments(
  client: VmSupabaseClient,
  roomId: string
): Promise<RoomComment[]> {
  const { data, error } = await client
    .from('room_comments')
    .select('id, user_id, body, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  if (error) {
    fail('Hämta kommentarer', error.message);
  }
  return (data ?? []).map(projectComment);
}

/**
 * Skriv en kommentar i ett rum. Trimmar body och validerar längden i klienten
 * (1..COMMENT_MAX_LEN) INNAN nätanropet (snabb, snäll feedback). user_id sätts av
 * DB:ns default auth.uid() (vi skickar den inte), RLS kräver medlemskap. Returnerar
 * den sparade kommentaren (projicerad) så UI:t kan spegla in den optimistiskt.
 *
 * KASTAR (fail loud) vid tom/för lång text (klient-validering) ELLER ett RLS-/DB-
 * avslag (icke-medlem, CHECK-brott): en kommentar som inte gick in ska SYNAS som ett
 * fel, aldrig tyst svälja.
 */
export async function addComment(
  client: VmSupabaseClient,
  roomId: string,
  body: string
): Promise<RoomComment> {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    fail('Skriv kommentar', 'kommentaren är tom.');
  }
  if (trimmed.length > COMMENT_MAX_LEN) {
    fail('Skriv kommentar', `kommentaren är för lång (max ${COMMENT_MAX_LEN} tecken).`);
  }
  // Säkerställ en session så auth.uid() finns för DB-defaulten + RLS-checken.
  await ensureSession(client);
  const row: Database['public']['Tables']['room_comments']['Insert'] = {
    room_id: roomId,
    body: trimmed,
    // user_id UTELÄMNAS med flit: DB:ns default auth.uid() + RLS:s with check binder
    // den till den inloggade, så avsändaren aldrig kan förfalskas från klienten.
  };
  const { data, error } = await client
    .from('room_comments')
    .insert(row)
    .select('id, user_id, body, created_at')
    .single();
  if (error) {
    fail('Skriv kommentar', error.message);
  }
  return projectComment(data);
}

/**
 * Radera EN av MINA egna kommentarer (RLS: DELETE bara på egen rad). Idempotent:
 * en redan borttagen kommentar (eller en annans, som RLS ändå nekar) rör 0 rader,
 * inget fel. Vi filtrerar även på id, så bara den valda raden rörs.
 */
export async function deleteMyComment(client: VmSupabaseClient, commentId: string): Promise<void> {
  const { error } = await client.from('room_comments').delete().eq('id', commentId);
  if (error) {
    fail('Radera kommentar', error.message);
  }
}

/** Projicera en DB-rad till den klient-vänliga RoomComment-formen. */
function projectComment(
  row: Pick<CommentRow, 'id' | 'user_id' | 'body' | 'created_at'>
): RoomComment {
  return {
    id: row.id,
    userId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
  };
}
