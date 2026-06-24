// Bracket-predictions-API (T16, #16): den typade klient-ytan mot Supabase-bracket-
// tipsen (vem går vidare per slutspels-slot + VM-vinnaren). Systerfil till
// predictions-api.ts (T15) och group-predictions-api.ts; samma mönster + säkerhet.
//
// ANSVAR (tunt, en sak): översätt UI:ts bracket-tips-operationer till Supabase-
// anrop, projicera raderna. Härleder formerna från DB-typerna (supabase-types.ts).
//
// SÄKERHET ÄR SERVER-SIDE (RLS), INTE HÄR: per-slot-låset (inget tips efter
// slottens avspark), champion-låset (inget tips efter turneringsstart) och
// sekretessen UPPRÄTTHÅLLS av RLS (bevisat med riktiga sessioner, se docs/decisions.md
// T16). Detta API förlitar sig ALDRIG på klient-låset för säkerhet.

import type { VmSupabaseClient } from '../supabase-browser';
import type { Database } from '../supabase-types';
import { ensureSession } from '../rooms/auth';
import { selectAllRows } from '../select-all-rows';
import { asTeamCode, type TeamCode } from '../../domain/team-code';

type BracketPredictionRow = Database['public']['Tables']['bracket_predictions']['Row'];

// OBS LAG-IDENTITET (C1+C2): `advancingTeamId` heter så efter DB-kolumnen
// `advancing_team_id`, men bär Team.CODE (versal "BRA", constraint ^[A-Z]{3}$), INTE
// Team.id (gemen "bra"). Typas `TeamCode` så ett rått Team.id blir ett kompileringsfel
// i stället för tyst fel poäng (F1-roten, docs/decisions.md T16). Kolumnnamnet behålls.

/**
 * slot_id för VM-VINNAR-tipset (mästaren). Speglar SQL-constrainten + RLS-helpern
 * (bracket_deadline_kickoff): 'champion' låses vid turneringsstart (g-A-1), inte
 * vid en slutspelsmatch. EN sanning för den magiska slot-strängen, klient + DB.
 */
export const CHAMPION_SLOT_ID = 'champion';

/**
 * match_id vars avspark är CHAMPION-tipsets deadline-ankare: turneringens första
 * match (g-A-1). Speglar `case when slot_id = 'champion' then 'g-A-1'` i RLS-
 * helpern bracket_deadline_kickoff (en sanning för ankaret, klient + DB).
 */
export const TOURNAMENT_START_MATCH_ID = 'g-A-1';

/** Ett bracket-tips så som UI:t ser det (projektion av bracket_predictions-raden). */
export interface BracketPrediction {
  slotId: string;
  userId: string;
  /** Tippat lag som går vidare, FIFA-code (Team.code "BRA"), inte Team.id. */
  advancingTeamId: TeamCode;
  updatedAt: string;
}

/** Inmatning vid skriv av ett bracket-tips (UI -> API). user_id sätts av API:t (auth). */
export interface BracketPredictionInput {
  slotId: string;
  /** Tippat lag vidare, FIFA-code (Team.code, brandas vid UI-gränsen via teamCode()). */
  advancingTeamId: TeamCode;
}

/** Kasta ett begripligt fel ur ett Supabase-fel (fail loud, svensk text). */
function fail(operation: string, message: string): never {
  throw new Error(`[VM2026] ${operation} misslyckades: ${message}`);
}

/**
 * Vilket match_id:s avspark är deadline för ett bracket-tips på `slotId`?
 * Speglar RLS-helpern bracket_deadline_kickoff EXAKT (en sanning för ankaret):
 *   * 'champion' -> turneringens första match (g-A-1),
 *   * annars     -> slottens egen avspark (slotId är ett match_id M73..M104).
 * Klient-sidan använder detta BARA för att VISA låst-läge; servern (RLS) nekar.
 */
export function bracketDeadlineMatchId(slotId: string): string {
  return slotId === CHAMPION_SLOT_ID ? TOURNAMENT_START_MATCH_ID : slotId;
}

/**
 * Lista de bracket-tips den inloggade får SE i ett rum. RLS avgör synligheten:
 * eget alltid, andras BARA efter slottens deadline (sekretessen). Icke-medlem ser
 * inget. Säkerställer först en session (anonym om ingen finns).
 */
export async function listRoomBracketPredictions(
  client: VmSupabaseClient,
  roomId: string
): Promise<BracketPrediction[]> {
  await ensureSession(client);
  // PAGINERA (F1): se predictions-api.ts. Stabil ORDER BY på PK (room_id+slot_id+user_id)
  // + exact count, så ett rum med >1000 bracket-tips räknas komplett (completeness fail-loud).
  const rows = await selectAllRows<BracketPredictionRow>('bracket-tips', (from, to) =>
    client
      .from('bracket_predictions')
      .select('*', { count: 'exact' })
      .eq('room_id', roomId)
      .order('slot_id', { ascending: true })
      .order('user_id', { ascending: true })
      .range(from, to)
  );
  return rows.map(projectBracketPrediction);
}

/** Lista BARA mina egna bracket-tips i ett rum (för inmatningsvyn). */
export async function listMyBracketPredictions(
  client: VmSupabaseClient,
  roomId: string
): Promise<BracketPrediction[]> {
  const identity = await ensureSession(client);
  const { data, error } = await client
    .from('bracket_predictions')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', identity.userId);
  if (error) {
    fail('Hämta mina bracket-tips', error.message);
  }
  return (data ?? []).map(projectBracketPrediction);
}

/**
 * Spara (eller ändra) MITT bracket-tips i ett rum (upsert på PK
 * room_id+slot_id+user_id). user_id sätts till den inloggades id; RLS dubbelkollar
 * att det = auth.uid() OCH att slottens deadline inte passerat (per-slot eller
 * champion). Ett försök efter deadline nekas av RLS och blir ett fail-loud-fel här.
 */
export async function upsertMyBracketPrediction(
  client: VmSupabaseClient,
  roomId: string,
  input: BracketPredictionInput
): Promise<BracketPrediction> {
  const identity = await ensureSession(client);
  const row: Database['public']['Tables']['bracket_predictions']['Insert'] = {
    room_id: roomId,
    slot_id: input.slotId,
    user_id: identity.userId,
    advancing_team_id: input.advancingTeamId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from('bracket_predictions')
    .upsert(row, { onConflict: 'room_id,slot_id,user_id' })
    .select('*')
    .single();
  if (error) {
    fail('Spara bracket-tips', error.message);
  }
  return projectBracketPrediction(data);
}

/**
 * Projicera en DB-rad till den klient-vänliga BracketPrediction-formen.
 * `advancing_team_id` är DB-validerad som versal code (constraint ^[A-Z]{3}$ på
 * write), så den brandas till TeamCode utan re-validering (betrodd DB-gräns).
 */
function projectBracketPrediction(row: BracketPredictionRow): BracketPrediction {
  return {
    slotId: row.slot_id,
    userId: row.user_id,
    advancingTeamId: asTeamCode(row.advancing_team_id),
    updatedAt: row.updated_at,
  };
}
