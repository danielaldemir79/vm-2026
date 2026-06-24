// Group-predictions-API (T16, #16): den typade klient-ytan mot Supabase-grupp-
// tipsen (gissad 1:a + 2:a per grupp). Systerfil till predictions-api.ts (T15);
// samma ansvar, mönster och säkerhetsprinciper.
//
// ANSVAR (tunt, en sak): översätt UI:ts grupp-tips-operationer (läs mina/rummets
// grupp-tips, spara/ändra mitt) till Supabase-anrop, och PROJICERA raderna till
// klient-vänliga former. Härleder formerna från DB-typerna (supabase-types.ts),
// inte från en konsument-typ, så en schema-drift blir ett kompileringsfel.
//
// SÄKERHET ÄR SERVER-SIDE (RLS), INTE HÄR: deadline-låset (inget grupp-tips efter
// gruppens första match) och sekretessen (andras grupp-tips dolda före deadline)
// UPPRÄTTHÅLLS av RLS i databasen (bevisat med riktiga sessioner, se docs/decisions.md
// T16). Detta API förlitar sig ALDRIG på klient-låset för säkerhet.
//
// FAIL LOUD (PRINCIPLES §8): varje Supabase-fel kastas vidare med begriplig svensk
// text. Ett RLS-avslag (t.ex. tippa efter gruppstart) blir ett synligt fel.

import type { VmSupabaseClient } from '../supabase-browser';
import type { Database } from '../supabase-types';
import { ensureSession } from '../rooms/auth';
import { selectAllRows } from '../select-all-rows';
import { asTeamCode, type TeamCode } from '../../domain/team-code';

type GroupPredictionRow = Database['public']['Tables']['group_predictions']['Row'];

// OBS LAG-IDENTITET (C1+C2): fälten heter `winnerTeamId`/`runnerUpTeamId` (speglar
// DB-kolumnerna `winner_team_id`/`runner_up_team_id`), men de bär Team.CODE (versal
// "BRA", constraint ^[A-Z]{3}$), INTE Team.id (gemen "bra"). Därför är de typade
// `TeamCode`, så en konsument som skickar ett rått Team.id får ett kompileringsfel i
// stället för tyst fel poäng (samma rot som F1, se docs/decisions.md T16). Kolumn-
// namnen behålls (ingen DB-migration); det är TYPEN som bär sanningen.

/** Ett grupp-tips så som UI:t ser det (projektion av group_predictions-raden). */
export interface GroupPrediction {
  groupId: string;
  userId: string;
  /** Tippad gruppvinnare som FIFA-code (Team.code "BRA"), inte Team.id. */
  winnerTeamId: TeamCode;
  /** Tippad grupptvåa som FIFA-code (Team.code "BRA"), inte Team.id. */
  runnerUpTeamId: TeamCode;
  updatedAt: string;
}

/** Inmatning vid skriv av ett grupp-tips (UI -> API). user_id sätts av API:t (auth). */
export interface GroupPredictionInput {
  groupId: string;
  /** Gruppvinnar-tips som FIFA-code (Team.code, brandas vid UI-gränsen via teamCode()). */
  winnerTeamId: TeamCode;
  /** Grupptvåa-tips som FIFA-code (Team.code, brandas vid UI-gränsen via teamCode()). */
  runnerUpTeamId: TeamCode;
}

/** Kasta ett begripligt fel ur ett Supabase-fel (fail loud, svensk text). */
function fail(operation: string, message: string): never {
  throw new Error(`[VM2026] ${operation} misslyckades: ${message}`);
}

/**
 * Lista de grupp-tips den inloggade får SE i ett rum. RLS avgör synligheten: det
 * egna alltid, andras BARA efter gruppens första match (sekretessen). En icke-
 * medlem ser inget. Säkerställer först en session (anonym om ingen finns), så en
 * saknad session triggar auth i stället för tom lista.
 */
export async function listRoomGroupPredictions(
  client: VmSupabaseClient,
  roomId: string
): Promise<GroupPrediction[]> {
  await ensureSession(client);
  // PAGINERA (F1): se predictions-api.ts. Stabil ORDER BY på PK (room_id+group_id+user_id)
  // + exact count, så ett rum med >1000 grupp-tips räknas komplett (completeness fail-loud).
  const rows = await selectAllRows<GroupPredictionRow>('grupp-tips', (from, to) =>
    client
      .from('group_predictions')
      .select('*', { count: 'exact' })
      .eq('room_id', roomId)
      .order('group_id', { ascending: true })
      .order('user_id', { ascending: true })
      .range(from, to)
  );
  return rows.map(projectGroupPrediction);
}

/**
 * Lista BARA mina egna grupp-tips i ett rum (för inmatningsvyn). Filtrerar på
 * user_id i frågan, men RLS skulle ändå bara släppa mina egna före deadline.
 */
export async function listMyGroupPredictions(
  client: VmSupabaseClient,
  roomId: string
): Promise<GroupPrediction[]> {
  const identity = await ensureSession(client);
  const { data, error } = await client
    .from('group_predictions')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', identity.userId);
  if (error) {
    fail('Hämta mina grupp-tips', error.message);
  }
  return (data ?? []).map(projectGroupPrediction);
}

/**
 * Spara (eller ändra) MITT grupp-tips i ett rum (upsert på PK
 * room_id+group_id+user_id). user_id sätts till den inloggades id; RLS dubbelkollar
 * att det = auth.uid() OCH att gruppens första match inte sparkat igång (deadline-
 * lås). Ett försök efter gruppstart nekas av RLS och blir ett fail-loud-fel här.
 */
export async function upsertMyGroupPrediction(
  client: VmSupabaseClient,
  roomId: string,
  input: GroupPredictionInput
): Promise<GroupPrediction> {
  const identity = await ensureSession(client);
  const row: Database['public']['Tables']['group_predictions']['Insert'] = {
    room_id: roomId,
    group_id: input.groupId,
    user_id: identity.userId,
    winner_team_id: input.winnerTeamId,
    runner_up_team_id: input.runnerUpTeamId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from('group_predictions')
    .upsert(row, { onConflict: 'room_id,group_id,user_id' })
    .select('*')
    .single();
  if (error) {
    fail('Spara grupp-tips', error.message);
  }
  return projectGroupPrediction(data);
}

/**
 * Projicera en DB-rad till den klient-vänliga GroupPrediction-formen. `*_team_id`-
 * kolumnerna är DB-validerade som versal code (constraint ^[A-Z]{3}$ på write), så
 * de brandas till TeamCode utan re-validering (asTeamCode, betrodd DB-gräns).
 */
function projectGroupPrediction(row: GroupPredictionRow): GroupPrediction {
  return {
    groupId: row.group_id,
    userId: row.user_id,
    winnerTeamId: asTeamCode(row.winner_team_id),
    runnerUpTeamId: asTeamCode(row.runner_up_team_id),
    updatedAt: row.updated_at,
  };
}
