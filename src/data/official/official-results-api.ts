// Official-results-API (T42, #72): den typade klient-ytan mot de GLOBALA
// officiella matchresultaten (facit).
//
// ANSVAR (tunt, en sak): översätt UI:ts facit-operationer (läs de globala
// officiella resultaten, admin sparar/ändrar ett officiellt resultat) till
// Supabase-anrop, och PROJICERA raderna till en klient-vänlig form. Härleder
// formen ur DB-typerna (supabase-types.ts), inte ur en konsument-typ, så en
// schema-drift blir ett kompileringsfel (lärdomen mock-foljer-konsumenttyp).
//
// SÄKERHET ÄR SERVER-SIDE (RLS), INTE HÄR (HÖG-RISK, TÄVLINGSINTEGRITET): att
// BARA admin får skriva facit UPPRÄTTHÅLLS av RLS (is_app_admin() + with_check
// updated_by = auth.uid()), bevisat med riktiga sessioner i
// official-results-rls.integration.test.ts + DO-block-beviset i decisions.md T42.
// Detta API hjälper bara UI:t att VISA/SKRIVA rätt; en kringgången klient (en
// icke-admin som postar rakt mot Supabase) nekas ändå av servern.
//
// FAIL LOUD (PRINCIPLES §8): varje Supabase-fel kastas vidare med ett begripligt
// svenskt meddelande. Ett RLS-avslag (en icke-admin försöker skriva facit) blir
// ett synligt fel, inte tyst tom data.

import type { VmSupabaseClient } from '../supabase-browser';
import type { Database } from '../supabase-types';
import { ensureSession } from '../rooms/auth';

type OfficialResultRow = Database['public']['Tables']['official_match_results']['Row'];

/**
 * Ett officiellt (globalt) matchresultat så som UI:t / facit-vävningen ser det.
 *
 * STRUKTURELLT IDENTISKT med RoomMatchResult (rooms-api) MEDVETET: facit-vävningen
 * (applyRoomResults) tar emot exakt denna form, så den GLOBALA facit-källan kan
 * matas in i samma rena vävning som tidigare tog rummets resultat , ingen ny
 * vävnings-logik, bara en annan källa (T42 poäng-källbytet, DRY).
 */
export interface OfficialMatchResult {
  matchId: string;
  homeGoals: number;
  awayGoals: number;
  penalties: { homeGoals: number; awayGoals: number } | null;
  status: 'scheduled' | 'live' | 'finished';
  updatedBy: string;
  updatedAt: string;
}

/** Inmatning vid skriv av ett officiellt resultat (admin-UI -> API). */
export interface OfficialResultInput {
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
 * Lista ALLA globala officiella resultat (facit). RLS SELECT är öppen (facit är
 * offentlig fakta), så detta funkar för vem som helst , även en anonym icke-medlem
 * utan rum. Inget medlemskap krävs (till skillnad från rummets resultat).
 *
 * Konsumenten (T17-topplistan / tips-avslöjandet / resultat-feedback) väver in
 * dessa i matchplanen via applyRoomResults och poängsätter tipsen mot dem.
 *
 * SÄKERSTÄLLER en session först (ensureSession): facit är publikt, men appen kör
 * ändå anonym auth, så ett anrop innan sessionen är klar triggar auth i stället
 * för att slå mot ett oinloggat läge.
 */
export async function listOfficialResults(
  client: VmSupabaseClient
): Promise<OfficialMatchResult[]> {
  await ensureSession(client);
  const { data, error } = await client.from('official_match_results').select('*');
  if (error) {
    fail('Hämta officiella resultat', error.message);
  }
  return (data ?? []).map(projectResult);
}

/**
 * Spara (eller ändra) ETT officiellt resultat (upsert på PK match_id). BARA en
 * admin lyckas , RLS (is_app_admin) nekar en icke-admin, vilket blir ett fail-loud-
 * fel här (inte en tyst no-op), så admin-UI:t kan visa "du saknar behörighet" om
 * en icke-admin på något sätt nådde knappen. updated_by sätts till den inloggades
 * id; RLS dubbelkollar att det = auth.uid() (ingen förfalskning av signaturen).
 */
export async function upsertOfficialResult(
  client: VmSupabaseClient,
  input: OfficialResultInput
): Promise<OfficialMatchResult> {
  const identity = await ensureSession(client);
  const row: Database['public']['Tables']['official_match_results']['Insert'] = {
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
    .from('official_match_results')
    .upsert(row, { onConflict: 'match_id' })
    .select('*')
    .single();
  if (error) {
    fail('Spara officiellt resultat', error.message);
  }
  return projectResult(data);
}

/** Projicera en DB-rad till den klient-vänliga OfficialMatchResult-formen. */
function projectResult(row: OfficialResultRow): OfficialMatchResult {
  // Straffar: båda satta eller båda null (DB:s check omr_penalties_paired
  // garanterar att de aldrig är halvt satta, samma strikta form som T14 C1).
  const penalties =
    row.penalties_home !== null && row.penalties_away !== null
      ? { homeGoals: row.penalties_home, awayGoals: row.penalties_away }
      : null;
  return {
    matchId: row.match_id,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    penalties,
    // Status valideras av DB:s check omr_status_valid, så castningen är säker.
    status: row.status as OfficialMatchResult['status'],
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}
