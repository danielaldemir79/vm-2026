// Predictions-API (T15, #15): den typade klient-ytan mot Supabase-tipsen.
//
// ANSVAR (tunt, en sak): översätt UI:ts tips-operationer (läs mina/rummets tips,
// spara/ändra mitt tips) till Supabase-anrop, och PROJICERA raderna till klient-
// vänliga former. Härleder formerna från DB-typerna (supabase-types.ts), inte
// från en konsument-typ, så en schema-drift blir ett kompileringsfel (lärdomen
// mock-foljer-konsumenttyp-doljer-mappnings-drift).
//
// SÄKERHET ÄR SERVER-SIDE (RLS), INTE HÄR: deadline-låset (inget tips efter
// avspark) och tips-sekretessen (andras tips dolda före avspark) UPPRÄTTHÅLLS av
// RLS i databasen (bevisat med riktiga sessioner i predictions-rls.integration.
// test.ts). Detta API hjälper bara UI:t att VISA rätt (en lokal kickoff-koll så
// fält kan låsas/markeras innan ett server-avslag), men förlitar sig ALDRIG på
// klient-låset för säkerhet, en kringgången klient nekas ändå av servern.
//
// FAIL LOUD (PRINCIPLES §8): varje Supabase-fel kastas vidare med ett begripligt
// svenskt meddelande. Ett RLS-avslag (t.ex. försök att tippa efter avspark) blir
// ett synligt fel, inte tyst tom data.

import type { VmSupabaseClient } from '../supabase-browser';
import type { Database } from '../supabase-types';
import { ensureSession } from '../rooms/auth';
import { selectAllRows } from '../select-all-rows';

type PredictionRow = Database['public']['Tables']['predictions']['Row'];

/** Ett tips så som UI:t ser det (projektion av predictions-raden). */
export interface Prediction {
  matchId: string;
  userId: string;
  homeGoals: number;
  awayGoals: number;
  updatedAt: string;
}

/** Inmatning vid skriv av ett tips (UI -> API). user_id sätts av API:t (auth). */
export interface PredictionInput {
  matchId: string;
  homeGoals: number;
  awayGoals: number;
}

/** Kasta ett begripligt fel ur ett Supabase-fel (fail loud, svensk text). */
function fail(operation: string, message: string): never {
  throw new Error(`[VM2026] ${operation} misslyckades: ${message}`);
}

/**
 * Avgör om en match är LÅST för tips just nu (avspark passerad). KLIENT-SIDAN är
 * bara för VISNING (lås/markera fält); servern (RLS) är den som faktiskt nekar.
 * Klockan jämförs mot den injicerbara `now` (default: nuet) i samma anda som
 * resten av appens tids-kod, så UI-tester kan styra "nu".
 *
 * @param kickoffIso  matchens avspark (ISO 8601 UTC), ur den statiska matchplanen.
 * @param now         nuet (default new Date()), injicerbart för test/determinism.
 * @returns           true om avspark passerat (now >= kickoff), då är tips låst.
 */
export function isMatchLocked(kickoffIso: string, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(kickoffIso).getTime();
}

/**
 * Lista de tips den inloggade användaren får SE i ett rum. RLS avgör synligheten:
 * det egna tipset alltid, andras BARA efter respektive matchs avspark (tips-
 * sekretessen). En icke-medlem ser inget. Anropet SÄKERSTÄLLER först en session
 * (ensureSession skapar en anonym session om ingen finns), så en saknad session
 * triggar auth i stället för att returnera tom lista; en anonym icke-medlem får
 * sedan tom lista via RLS (ingen rumsmedlemskap), inte via avsaknad identitet.
 *
 * Konsumenten (T17 topplista / tips-avslöjande) kombinerar dessa med matchernas
 * resultat och poängsätter via scorePrediction. Detta API hämtar bara raderna.
 */
export async function listRoomPredictions(
  client: VmSupabaseClient,
  roomId: string
): Promise<Prediction[]> {
  await ensureSession(client);
  // PAGINERA (F1): Supabase cap:ar en rak .select() tyst till ~1000 rader. Ett rum med fler
  // tips än så poängsattes mot en avkapad delmängd. Vi läser sidvis med stabil ORDER BY (PK
  // room_id+match_id+user_id) + exact count, så hela rummet räknas (completeness fail-loud).
  const rows = await selectAllRows<PredictionRow>('tips', (from, to) =>
    client
      .from('predictions')
      .select('*', { count: 'exact' })
      .eq('room_id', roomId)
      .order('match_id', { ascending: true })
      .order('user_id', { ascending: true })
      .range(from, to)
  );
  return rows.map(projectPrediction);
}

/**
 * Lista BARA mina egna tips i ett rum (för tips-inmatningsvyn: visa vad jag redan
 * tippat). Filtrerar på user_id i frågan, men RLS skulle ändå bara släppa mina
 * egna före avspark, så detta är ett explicit, snabbare uppslag, inte ett säkerhets-
 * antagande.
 */
export async function listMyPredictions(
  client: VmSupabaseClient,
  roomId: string
): Promise<Prediction[]> {
  const identity = await ensureSession(client);
  const { data, error } = await client
    .from('predictions')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', identity.userId);
  if (error) {
    fail('Hämta mina tips', error.message);
  }
  return (data ?? []).map(projectPrediction);
}

/**
 * Spara (eller ändra) MITT tips på en match i ett rum (upsert på PK
 * room_id+match_id+user_id). user_id sätts till den inloggades id; RLS dubbelkollar
 * att det = auth.uid() (ingen förfalskning) OCH att avspark inte passerat (deadline-
 * lås). updated_at sätts på klienten för optimistisk visning; servern är sanningen.
 *
 * Ett försök att tippa EFTER avspark nekas av RLS och blir ett fail-loud-fel här
 * (inte en tyst no-op), så UI:t kan visa "matchen är låst" om klient-låset hann
 * glida förbi (t.ex. exakt på deadline-sekunden).
 */
export async function upsertMyPrediction(
  client: VmSupabaseClient,
  roomId: string,
  input: PredictionInput
): Promise<Prediction> {
  const identity = await ensureSession(client);
  const row: Database['public']['Tables']['predictions']['Insert'] = {
    room_id: roomId,
    match_id: input.matchId,
    user_id: identity.userId,
    home_goals: input.homeGoals,
    away_goals: input.awayGoals,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from('predictions')
    .upsert(row, { onConflict: 'room_id,match_id,user_id' })
    .select('*')
    .single();
  if (error) {
    fail('Spara tips', error.message);
  }
  return projectPrediction(data);
}

/** Projicera en DB-rad till den klient-vänliga Prediction-formen. */
function projectPrediction(row: PredictionRow): Prediction {
  return {
    matchId: row.match_id,
    userId: row.user_id,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    updatedAt: row.updated_at,
  };
}
