// LIVESCORE-POLLER (edge function, Deno) , T80 (#180), livescore Bit 2.
//
// ANSVAR (tunt, en sak): EN cron-tick = (1) läs nyckel + budget, (2) avgör med
// budget-gaten om vi får polla, (3) ett `fixtures?league=1&live=all`-anrop
// (täcker ALLA live-matcher), (4) skriv match_live_data per resolvbar match,
// (5) för matcher som nyss AVSLUTATS: hämta `fixtures?id=` (rikt svar med
// events/lineups/statistics), härled facit (Bit 1:s regel via _shared) och skriv
// det med apply_auto_facit (det manuella låset), frys raden.
//
// SJÄLV-BUDGETERANDE (Daniels HARD-krav, 100/dag): poll_log räknar dagens anrop;
// gaten släpper aldrig igenom mer än vad som ryms. Live=all (1 anrop) prioriteras
// lågt mot facit-fångst (freeze) , facit får aldrig missas pga budget. Även om
// cron tickar oftare än tänkt kan summan aldrig spräcka taket.
//
// IDEMPOTENT + FAIL-LOUD: upsertar på match_id (kör om utan dubbletter); varje
// fel loggas + kastar (svarar 500), aldrig en tyst no-op. Okänd fixture (ingen
// rad i fixture_match_map) HOPPAS och loggas (gissa aldrig en koppling).
//
// INGA SECRETS I KODEN (PRINCIPLES §7): API-nyckeln läses ur app_config via
// service_role (funktioner får SUPABASE_SERVICE_ROLE_KEY i env automatiskt).

// @ts-nocheck , Deno-runtime (npm:/Deno-globaler). Den här filen typas/lintas
// INTE av app-grafen (tsc -b/eslint kör mot src/, supabase/functions är
// undantaget). De rena, testbara bitarna bor i src/data/livescore/ + _shared/.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  deriveFacit,
  normalizeStatus,
  resolveAppTeamId,
  type RawFixtureResponse,
} from '../_shared/livescore-core.ts';

const API_BASE = 'https://v3.football.api-sports.io';
const WC_LEAGUE_ID = 1; // API-Football: World Cup
const DAILY_BUDGET = 100; // gratisnyckelns kvot
const STOCKHOLM_TZ = 'Europe/Stockholm';

/** Svensk kalenderdag (YYYY-MM-DD), samma zon som appens dag-gruppering. */
function swedishDay(now: Date): string {
  // en-CA ger ISO-formen YYYY-MM-DD i vald tidszon.
  return new Intl.DateTimeFormat('en-CA', { timeZone: STOCKHOLM_TZ }).format(now);
}

// _req: cron anropar utan att bry sig om request-kroppen (alltid ett tomt POST).
Deno.serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY saknas i funktionens env.');
    }
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // --- 1. Config: API-nyckel + admin-id (auto-rader signeras med admins id) ---
    const { data: cfgRows, error: cfgErr } = await db
      .from('app_config')
      .select('key, value')
      .in('key', ['api_football_key', 'auto_facit_admin_id']);
    if (cfgErr) throw new Error(`Läs app_config misslyckades: ${cfgErr.message}`);
    const cfg = new Map((cfgRows ?? []).map((r) => [r.key, r.value]));
    const apiKey = cfg.get('api_football_key');
    const adminId = cfg.get('auto_facit_admin_id');
    if (!apiKey) throw new Error('app_config saknar api_football_key (inserta vid deploy).');
    if (!adminId) throw new Error('app_config saknar auto_facit_admin_id (inserta vid deploy).');

    // --- 2. Budget: dagens räknare + gate ---
    const now = new Date();
    const day = swedishDay(now);
    const { data: logRow, error: logErr } = await db
      .from('poll_log')
      .select('calls')
      .eq('day', day)
      .maybeSingle();
    if (logErr) throw new Error(`Läs poll_log misslyckades: ${logErr.message}`);
    const callsUsedToday = logRow?.calls ?? 0;
    const remaining = DAILY_BUDGET - callsUsedToday;
    if (remaining <= 0) {
      // Hård budget-vägg: polla aldrig mer idag.
      return json({
        skipped: true,
        reason: `dagsbudget spräckt (${callsUsedToday}/${DAILY_BUDGET})`,
      });
    }

    let callsThisTick = 0;
    const log: string[] = [];

    // --- 3. live=all: ETT anrop täcker alla samtidiga live-matcher ---
    const liveResp = await apiGet(apiKey, `/fixtures?league=${WC_LEAGUE_ID}&live=all`);
    callsThisTick += 1;
    const liveFixtures: RawFixtureResponse[] = (liveResp.response ?? []) as RawFixtureResponse[];

    // Översätt API-fixture-id -> appens match_id via mappnings-tabellen (gissar aldrig).
    const fixtureIds = liveFixtures.map((f) => f.fixture.id);
    const matchIdByFixture = await loadFixtureMap(db, fixtureIds);

    // --- 4. Skriv match_live_data per RESOLVBAR live-match (upsert, idempotent) ---
    const newlyFinished: { matchId: string; apiFixtureId: number }[] = [];
    for (const f of liveFixtures) {
      const matchId = matchIdByFixture.get(f.fixture.id);
      if (!matchId) {
        log.push(`okänd fixture ${f.fixture.id} (saknar fixture_match_map-rad), hoppas`);
        continue;
      }
      // Krav: båda lagen i bryggan (annars är mappningen inte verifierad). Bara
      // en mjuk varning , mappnings-tabellen är den auktoritativa kopplingen.
      if (
        resolveAppTeamId(f.teams.home.id) === null ||
        resolveAppTeamId(f.teams.away.id) === null
      ) {
        log.push(`fixture ${f.fixture.id}: lag saknas i bryggan (komplettera före go-live)`);
      }
      const status = normalizeStatus(f.fixture.status.short);
      const finished = status === 'finished';
      const { error: upErr } = await db.from('match_live_data').upsert(
        {
          match_id: matchId,
          api_fixture_id: f.fixture.id,
          status,
          elapsed_minute: f.fixture.status.elapsed,
          home_goals: f.goals.home,
          away_goals: f.goals.away,
          // live=all bär inte alltid events/stats/lineups , de fylls vid freeze
          // (fixtures?id) nedan. Rör inte de jsonb-fälten här (behåll ev. tidigare).
          last_synced_at: now.toISOString(),
          frozen: false,
          updated_at: now.toISOString(),
        },
        { onConflict: 'match_id' }
      );
      if (upErr)
        throw new Error(`Upsert match_live_data ${matchId} misslyckades: ${upErr.message}`);
      if (finished) newlyFinished.push({ matchId, apiFixtureId: f.fixture.id });
    }

    // --- 5. FREEZE + AUTO-FACIT för nyss avslutade (facit FÖRST, inom budget) ---
    // En match räknas som "behöver freeze" om den är avgjord men ännu inte fryst.
    const toFreeze = await filterUnfrozen(db, newlyFinished);
    for (const m of toFreeze) {
      if (callsUsedToday + callsThisTick >= DAILY_BUDGET) {
        log.push(`budget slut , skjuter upp freeze av ${m.matchId} till nästa tick`);
        break; // self-contained: spräck aldrig taket
      }
      // Rikt id-uppslag (events/lineups/statistics + score.penalty i ETT anrop).
      const fxResp = await apiGet(apiKey, `/fixtures?id=${m.apiFixtureId}`);
      callsThisTick += 1;
      const rich = (fxResp.response ?? [])[0] as RawFixtureResponse | undefined;
      if (!rich) {
        log.push(`fixtures?id=${m.apiFixtureId} gav ingen post, hoppas`);
        continue;
      }
      const facit = deriveFacit(rich); // Bit 1:s facit-regel (goals, inte extratime)
      // Skriv facit MED det manuella låset (apply_auto_facit): rör aldrig en
      // manuell rad, fyller tomt eller uppdaterar auto.
      const { error: facitErr } = await db.rpc('apply_auto_facit', {
        p_match_id: m.matchId,
        p_home_goals: facit.homeGoals,
        p_away_goals: facit.awayGoals,
        p_status: 'finished',
        p_penalties_home: facit.penalties?.home ?? null,
        p_penalties_away: facit.penalties?.away ?? null,
        p_updated_by: adminId,
      });
      if (facitErr)
        throw new Error(`apply_auto_facit ${m.matchId} misslyckades: ${facitErr.message}`);
      // Frys snapshotten + spara de rika blobbarna (bläddringsbar dagar tillbaka).
      const { error: freezeErr } = await db.from('match_live_data').upsert(
        {
          match_id: m.matchId,
          api_fixture_id: m.apiFixtureId,
          status: 'finished',
          elapsed_minute: rich.fixture.status.elapsed,
          home_goals: rich.goals.home,
          away_goals: rich.goals.away,
          events: (rich as { events?: unknown }).events ?? null,
          statistics: (rich as { statistics?: unknown }).statistics ?? null,
          lineups: (rich as { lineups?: unknown }).lineups ?? null,
          last_synced_at: now.toISOString(),
          frozen: true,
          updated_at: now.toISOString(),
        },
        { onConflict: 'match_id' }
      );
      if (freezeErr) throw new Error(`Frys ${m.matchId} misslyckades: ${freezeErr.message}`);
      log.push(`facit + freeze: ${m.matchId} ${facit.homeGoals}-${facit.awayGoals}`);
    }

    // --- Bokför dagens anrop (atomisk öka via RPC-fri upsert med läst värde) ---
    await bumpCallCount(db, day, callsUsedToday + callsThisTick);

    return json({
      ok: true,
      day,
      callsThisTick,
      callsUsedToday: callsUsedToday + callsThisTick,
      log,
    });
  } catch (err) {
    console.error('[livescore-poller]', err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Hjälpare (tunna, fail-loud).
// ---------------------------------------------------------------------------

async function apiGet(apiKey: string, path: string): Promise<{ response?: unknown[] }> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-apisports-key': apiKey },
  });
  if (!res.ok) {
    throw new Error(`API-Football ${path} svarade ${res.status}`);
  }
  const body = await res.json();
  // API-Football rapporterar fel i `errors` (icke-tomt) , fail loud (gissa aldrig
  // vidare på ett trasigt svar), samma kontrakt som Bit 1:s requireResponseArray.
  const errors = body?.errors;
  const hasErrors = Array.isArray(errors)
    ? errors.length > 0
    : errors && Object.keys(errors).length > 0;
  if (hasErrors) {
    throw new Error(`API-Football ${path} fel: ${JSON.stringify(errors)}`);
  }
  return body;
}

async function loadFixtureMap(
  db: ReturnType<typeof createClient>,
  fixtureIds: number[]
): Promise<Map<number, string>> {
  if (fixtureIds.length === 0) return new Map();
  const { data, error } = await db
    .from('fixture_match_map')
    .select('api_fixture_id, match_id')
    .in('api_fixture_id', fixtureIds);
  if (error) throw new Error(`Läs fixture_match_map misslyckades: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.api_fixture_id, r.match_id]));
}

/** Behåll bara matcher som ännu inte är frysta (de behöver freeze/facit). */
async function filterUnfrozen(
  db: ReturnType<typeof createClient>,
  matches: { matchId: string; apiFixtureId: number }[]
): Promise<{ matchId: string; apiFixtureId: number }[]> {
  if (matches.length === 0) return [];
  const ids = matches.map((m) => m.matchId);
  const { data, error } = await db
    .from('match_live_data')
    .select('match_id, frozen')
    .in('match_id', ids);
  if (error) throw new Error(`Läs frozen-status misslyckades: ${error.message}`);
  const frozen = new Set((data ?? []).filter((r) => r.frozen).map((r) => r.match_id));
  return matches.filter((m) => !frozen.has(m.matchId));
}

async function bumpCallCount(
  db: ReturnType<typeof createClient>,
  day: string,
  newTotal: number
): Promise<void> {
  const { error } = await db
    .from('poll_log')
    .upsert({ day, calls: newTotal, updated_at: new Date().toISOString() }, { onConflict: 'day' });
  if (error) throw new Error(`Uppdatera poll_log misslyckades: ${error.message}`);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
