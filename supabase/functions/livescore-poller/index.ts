// LIVESCORE-POLLER (edge function, Deno) , pollare-v3 (per-match-polling).
//
// ANSVAR (tunt, en sak): EN cron-tick =
//   1. Läs nyckel + admin-id + dagens budget (poll_log).
//   2. FÖNSTER-GATING (selectInWindowMatches): vilka matcher är i sitt live-fönster
//      NU (kickoff i [now-3,5h, now+5min])? Ingen i fönster OCH inga ofrysta att
//      facit-kolla -> HOPPA hela ticket (0 API-anrop). INGA anrop mellan matcher.
//   3. PLAN (buildPerMatchPollPlan): discovery (1 live=all BARA om en in-fönster-match
//      saknar mappning) + per-match (ett fixtures?id per MAPPAD in-fönster-match),
//      facit-prio, strikt under dagsbudgeten (100/dag).
//   4. DISCOVERY: ett live=all -> auto-mappa okända (resolveFixtureToMatch, självseed).
//   5. PER-MATCH: ett fixtures?id per match = FULL RIK DATA (status/ställning/elapsed
//      + events/statistics/lineups INLINE). Skriv match_live_data VARJE poll, kuvert-
//      lindat (shapeFrozenBlobs), frozen=false medan matchen pågår -> live-kortet får
//      målskytt/assist/kort/byten/statistik LIVE. Är matchen AVGJORD i svaret:
//      apply_auto_facit (det manuella låset) + frozen=true.
//   6. ROBUST FACIT-FÅNGST (skyddsnät): matcher som föll UR fönstret innan FT sågs
//      (selectFreezeChecks, 4h bak-fönster) facit-kollas ändå, budget-gatat med facit-prio.
//
// SJÄLV-BUDGETERANDE: poll_log räknar dagens anrop; buildPerMatchPollPlan + de hårda
// kollarna nedan släpper ALDRIG igenom mer än vad som ryms under DAILY_BUDGET. Pro-plan
// (7500/dag) sedan 2026-06-15, kapat på 7000 -> cron körs */2 (var 2:a min) för tät
// live-uppdatering. (Tidigare gratis 100/dag -> */7.)
// FACIT-PRIO: en avgjord-men-ofryst match får sitt anrop före en pågående om budgeten
// tryter , facit får aldrig missas. Även om cron tickar oftare än tänkt kan summan
// aldrig spräcka taket.
//
// IDEMPOTENT + FAIL-LOUD: upsertar på match_id (kör om utan dubbletter); varje fel
// loggas + kastar (svarar 500), aldrig en tyst no-op. Okänd fixture (ingen mappning,
// ej auto-mappbar) HOPPAS och loggas (gissa aldrig en koppling).
//
// INGA SECRETS I KODEN (PRINCIPLES §7): API-nyckeln läses ur app_config via
// service_role (funktioner får SUPABASE_SERVICE_ROLE_KEY i env automatiskt).

// @ts-nocheck , Deno-runtime (npm:/Deno-globaler). Den här filen typas/lintas INTE av
// app-grafen (tsc -b/eslint kör mot src/, supabase/functions är undantaget). All
// gissningskänslig, testbar logik bor i src/data/livescore/ + _shared/ (rena
// funktioner, enhetstestade + paritets-testade mot mirror:n).

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildPerMatchPollPlan,
  deriveFacit,
  EMBEDDED_MATCH_PLAN,
  normalizeStatus,
  resolveFixtureToMatch,
  selectFreezeChecks,
  selectInWindowMatches,
  shapeFrozenBlobs,
  type MappedMatchState,
  type RawFixtureResponse,
  type WindowMatchState,
} from '../_shared/livescore-core.ts';

const API_BASE = 'https://v3.football.api-sports.io';
const WC_LEAGUE_ID = 1; // API-Football: World Cup
// Pro-plan (uppgraderad 2026-06-15): 7500 anrop/dag. Vi kapar på 7000 med marginal
// (för manuella trigg + framtida bruk). Med cron var 2:a min ger det rikligt med
// frekvent live-polling utan att nå taket (~105 anrop/match * några matcher/dag << 7000).
const DAILY_BUDGET = 7000;
const STOCKHOLM_TZ = 'Europe/Stockholm';
// Tak för robust-facit-kollar per tick (skyddsnätet, utöver per-match-planen): så ett
// enstaka tick aldrig bränner budgeten på gamla matcher. Normalt 0-1 matcher behöver det.
const MAX_ROBUST_FREEZE_CHECKS_PER_TICK = 4;

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

    // --- 2. Budget: dagens räknare ---
    const now = new Date();
    const day = swedishDay(now);
    const { data: logRow, error: logErr } = await db
      .from('poll_log')
      .select('calls')
      .eq('day', day)
      .maybeSingle();
    if (logErr) throw new Error(`Läs poll_log misslyckades: ${logErr.message}`);
    const callsUsedToday = logRow?.calls ?? 0;

    let callsThisTick = 0;
    const log: string[] = [];

    // --- 3. FÖNSTER-GATING: vilka matcher är i sitt live-fönster NU? ---
    const inWindow = selectInWindowMatches(EMBEDDED_MATCH_PLAN, now);

    // DB-state för de in-fönster-matcherna: är de mappade (fixture_match_map) och
    // vad har deras live-rad för status/frozen (match_live_data)?
    const inWindowMatchIds = inWindow.map((m) => m.matchId);
    const fixtureByMatch = await loadFixtureIdsByMatch(db, inWindowMatchIds);
    const liveStateByMatch = await loadLiveStateByMatch(db, inWindowMatchIds);

    const windowMatches: WindowMatchState[] = inWindow.map((m) => {
      const live = liveStateByMatch.get(m.matchId);
      return {
        match: m,
        apiFixtureId: fixtureByMatch.get(m.matchId) ?? null,
        frozen: live?.frozen === true,
        // Känd avgjord men ofryst -> facit-prio (får sitt anrop före pågående).
        finishedAwaitingFreeze: live?.status === 'finished' && live?.frozen !== true,
      };
    });

    // --- 4. PLAN: discovery + per-match, strikt under dagsbudgeten (facit-prio) ---
    const plan = buildPerMatchPollPlan({
      windowMatches,
      callsUsedToday,
      dailyBudget: DAILY_BUDGET,
    });
    log.push(`plan: ${plan.reason}`);

    let matchIdByFixture = new Map<number, string>();

    if (!plan.skipTick) {
      // --- 4a. DISCOVERY: ETT live=all -> auto-mappa okända in-fönster-matcher ---
      if (plan.needsDiscovery) {
        const liveResp = await apiGet(apiKey, `/fixtures?league=${WC_LEAGUE_ID}&live=all`);
        callsThisTick += 1;
        const liveFixtures: RawFixtureResponse[] = (liveResp.response ??
          []) as RawFixtureResponse[];
        matchIdByFixture = await loadFixtureMap(
          db,
          liveFixtures.map((f) => f.fixture.id)
        );
        for (const f of liveFixtures) {
          if (matchIdByFixture.has(f.fixture.id)) continue; // redan mappad
          const res = resolveFixtureToMatch({
            apiFixtureId: f.fixture.id,
            homeTeamApiId: f.teams.home.id,
            awayTeamApiId: f.teams.away.id,
            kickoffUtc: new Date(f.fixture.date).toISOString(),
          });
          if (res.kind !== 'resolved') {
            log.push(`auto-map ${f.fixture.id}: ${res.reason}, hoppas`);
            continue;
          }
          const inserted = await insertFixtureMap(db, res.appMatchId, f.fixture.id);
          if (inserted) {
            matchIdByFixture.set(f.fixture.id, res.appMatchId);
            log.push(`auto-map: fixture ${f.fixture.id} -> ${res.appMatchId} (självseedad)`);
          } else {
            // En konkurrent hann skapa raden , läs om så vi ändå får match_id.
            matchIdByFixture = await loadFixtureMap(
              db,
              liveFixtures.map((fx) => fx.fixture.id)
            );
          }
        }
      }

      // --- 4b. PER-MATCH: ett fixtures?id per mappad in-fönster-match = FULL DATA ---
      // Planen gav redan de MAPPADE matcher som ryms (facit-prio + budget-kapat). En
      // match som auto-mappades i discovery ovan pollas först NÄSTA tick (planen kände
      // inte dess fixture-id än) , vi gissar aldrig ett id.
      for (const t of plan.perMatchTargets) {
        if (callsUsedToday + callsThisTick >= DAILY_BUDGET) {
          log.push(`budget slut , skjuter upp per-match-poll av ${t.matchId} till nästa tick`);
          break; // self-contained: spräck aldrig taket
        }
        const ok = await pollMatchFull(db, apiKey, adminId, t, now, log);
        callsThisTick += 1; // pollMatchFull gör alltid ett fixtures?id-anrop
        if (ok) log.push(`per-match: ${t.matchId}${t.facitPriority ? ' (facit-prio)' : ''}`);
      }
    }

    // --- 5. ROBUST FACIT-FÅNGST (skyddsnät): matcher som föll UR fönstret ofrysta ---
    // Per-match-pollningen ovan täcker matcher i fönster. Men en match kan ha fallit ur
    // fönstret (>3,5h sedan kickoff) innan dess FT hann frysas. Robust-vägen (4h bak-
    // fönster) fångar dem så ett slutresultat aldrig missas. Budget-gatat (facit högst
    // prio, spräck aldrig 100/dag) + kapat per tick. KÖRS ÄVEN OM ticket annars hoppades
    // (det är just då en match utanför fönstret kan behöva sitt facit).
    const robustBudget = DAILY_BUDGET - (callsUsedToday + callsThisTick);
    if (robustBudget > 0) {
      const mapped = await loadMappedMatchStates(db);
      const maxChecks = Math.min(robustBudget, MAX_ROBUST_FREEZE_CHECKS_PER_TICK);
      // Hoppa matcher vi redan per-match-pollade denna tick (steg 4b), undvik dubbel-anrop.
      const polledThisTick = new Set(plan.perMatchTargets.map((t) => t.matchId));
      const candidates = selectFreezeChecks(EMBEDDED_MATCH_PLAN, mapped, now, maxChecks).filter(
        (t) => !polledThisTick.has(t.matchId)
      );
      for (const t of candidates) {
        if (callsUsedToday + callsThisTick >= DAILY_BUDGET) {
          log.push(`budget slut , skjuter upp robust freeze av ${t.matchId} till nästa tick`);
          break;
        }
        const ok = await pollMatchFull(
          db,
          apiKey,
          adminId,
          { matchId: t.matchId, apiFixtureId: t.apiFixtureId, facitPriority: true },
          now,
          log
        );
        callsThisTick += 1;
        if (ok) log.push(`facit + freeze (robust): ${t.matchId}`);
      }
    }

    // --- 6. Bokför dagens anrop (idempotent upsert med läst värde) ---
    if (callsThisTick > 0) {
      await bumpCallCount(db, day, callsUsedToday + callsThisTick);
    }

    return json({
      ok: true,
      day,
      skipped: plan.skipTick && callsThisTick === 0,
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

/** Läs api_fixture_id för en mängd match_id (in-fönster-matchernas mappning). */
async function loadFixtureIdsByMatch(
  db: ReturnType<typeof createClient>,
  matchIds: string[]
): Promise<Map<string, number>> {
  if (matchIds.length === 0) return new Map();
  const { data, error } = await db
    .from('fixture_match_map')
    .select('match_id, api_fixture_id')
    .in('match_id', matchIds);
  if (error) throw new Error(`Läs fixture_match_map (per match) misslyckades: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.match_id, r.api_fixture_id]));
}

/** Läs status + frozen för en mängd match_id (in-fönster-matchernas live-state). */
async function loadLiveStateByMatch(
  db: ReturnType<typeof createClient>,
  matchIds: string[]
): Promise<Map<string, { status: string; frozen: boolean }>> {
  if (matchIds.length === 0) return new Map();
  const { data, error } = await db
    .from('match_live_data')
    .select('match_id, status, frozen')
    .in('match_id', matchIds);
  if (error) throw new Error(`Läs match_live_data (per match) misslyckades: ${error.message}`);
  return new Map(
    (data ?? []).map((r) => [r.match_id, { status: r.status, frozen: r.frozen === true }])
  );
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

/**
 * Insert en auto-mappad koppling i fixture_match_map. Idempotent: en krock på PK
 * (en konkurrent hann seeda samma rad) är INTE ett fel , vi returnerar false så
 * anroparen läser om mappningen. Ett ÄKTA fel (annat constraint/nätfel) fail-loud:ar.
 * Returnerar true om DENNA insert skapade raden.
 */
async function insertFixtureMap(
  db: ReturnType<typeof createClient>,
  matchId: string,
  apiFixtureId: number
): Promise<boolean> {
  const { error } = await db
    .from('fixture_match_map')
    .insert({ match_id: matchId, api_fixture_id: apiFixtureId });
  if (error) {
    // 23505 = unique_violation (raden fanns redan, t.ex. via ett parallellt tick).
    if (error.code === '23505') return false;
    throw new Error(
      `Insert fixture_match_map ${matchId}/${apiFixtureId} misslyckades: ${error.message}`
    );
  }
  return true;
}

/**
 * Läs ALLA mappade matchers frozen-status (för robust facit-fångst). Joinar
 * fixture_match_map (kopplingen) med match_live_data (frozen-flaggan): en match utan
 * live-rad ännu räknas som EJ fryst (frozen=false), så den freeze-kollas om dess
 * kickoff passerat (just det fall där matchen föll ur fönstret innan vi såg FT).
 */
async function loadMappedMatchStates(
  db: ReturnType<typeof createClient>
): Promise<MappedMatchState[]> {
  const { data: mapRows, error: mapErr } = await db
    .from('fixture_match_map')
    .select('api_fixture_id, match_id');
  if (mapErr) throw new Error(`Läs fixture_match_map (robust) misslyckades: ${mapErr.message}`);
  const rows = mapRows ?? [];
  if (rows.length === 0) return [];
  const { data: liveRows, error: liveErr } = await db
    .from('match_live_data')
    .select('match_id, frozen')
    .in(
      'match_id',
      rows.map((r) => r.match_id)
    );
  if (liveErr) throw new Error(`Läs frozen-status (robust) misslyckades: ${liveErr.message}`);
  const frozenByMatch = new Map((liveRows ?? []).map((r) => [r.match_id, r.frozen === true]));
  return rows.map((r) => ({
    matchId: r.match_id,
    apiFixtureId: r.api_fixture_id,
    frozen: frozenByMatch.get(r.match_id) ?? false,
  }));
}

/**
 * PER-MATCH-POLL (v3 kärnan): hämta fixtures?id = FULL RIK DATA i ETT anrop och skriv
 * match_live_data med ställning/status/elapsed OCH kuvert-lindade blobbar
 * (events/statistics/lineups via shapeFrozenBlobs , skarv-fixen: producent-form ==
 * konsument-form). Så live-kortet får målskytt/assist/kort/byten/statistik LIVE.
 *
 *   - Matchen PÅGÅR -> frozen=false (fortsätt polla nästa tick).
 *   - Matchen är AVGJORD -> apply_auto_facit (det manuella låset) + frozen=true.
 *
 * EN sanning för per-match-skrivning, delad av per-match- och robust-vägen. Returnerar
 * true om en rad skrevs (false om svaret saknade posten). GÖR ALLTID ett fixtures?id-
 * anrop (anroparen räknar upp callsThisTick efteråt).
 */
async function pollMatchFull(
  db: ReturnType<typeof createClient>,
  apiKey: string,
  adminId: string,
  m: { matchId: string; apiFixtureId: number; facitPriority?: boolean },
  now: Date,
  log: string[]
): Promise<boolean> {
  // Rikt id-uppslag (status/goals/score + events/statistics/lineups INLINE, ett anrop).
  const fxResp = await apiGet(apiKey, `/fixtures?id=${m.apiFixtureId}`);
  const rich = (fxResp.response ?? [])[0] as RawFixtureResponse | undefined;
  if (!rich) {
    log.push(`fixtures?id=${m.apiFixtureId} gav ingen post, hoppas`);
    return false;
  }
  const status = normalizeStatus(rich.fixture.status.short);
  const finished = status === 'finished';

  // KUVERT-LINDA de rika blobbarna så läs-lagret kan parsa dem (skarv-fixen). Görs för
  // BÅDE pågående och avgjorda matcher , det är hela v3-poängen: rik data LIVE.
  const blobs = shapeFrozenBlobs(
    rich as { events?: unknown[]; statistics?: unknown[]; lineups?: unknown[] }
  );

  // Avgjord match: skriv facit MED det manuella låset (apply_auto_facit) FÖRST , rör
  // aldrig en manuell rad, fyller tomt eller uppdaterar auto. deriveFacit fail-loud:ar
  // bara på faktiskt avgjorda, så vi gör det bara i finished-grenen.
  if (finished) {
    const facit = deriveFacit(rich); // Bit 1:s facit-regel (goals, inte extratime)
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
  }

  const { error: upErr } = await db.from('match_live_data').upsert(
    {
      match_id: m.matchId,
      api_fixture_id: m.apiFixtureId,
      status,
      elapsed_minute: rich.fixture.status.elapsed,
      home_goals: rich.goals.home,
      away_goals: rich.goals.away,
      events: blobs.events,
      statistics: blobs.statistics,
      lineups: blobs.lineups,
      last_synced_at: now.toISOString(),
      frozen: finished, // fryst BARA när matchen är avgjord; pågående pollas vidare
      updated_at: now.toISOString(),
    },
    { onConflict: 'match_id' }
  );
  if (upErr) throw new Error(`Upsert match_live_data ${m.matchId} misslyckades: ${upErr.message}`);
  return true;
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
