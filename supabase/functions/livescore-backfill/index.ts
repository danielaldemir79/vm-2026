// LIVESCORE-BACKFILL (edge function, Deno) , T101 (#issue), ENGÅNGS-backfill.
//
// VARFÖR (problemet): 16 matcher är avgjorda i `official_match_results` (admin-facit),
// men bara 7 har live-event-data i `match_live_data`. De 9 första gruppmatcherna
// (g-A-1..g-E-1, inkl. 7-1-matchen) AVGJORDES innan pollarens per-match-fönster-logik
// var igång, så deras events/statistics/lineups hämtades aldrig och deras facit matades
// in för hand. Pollaren (livescore-poller) kan INTE backfilla gamla avgjorda matcher: den
// per-match-pollar bara matcher i sitt live-fönster, och robust-facit-vägen täcker bara
// REDAN MAPPADE matcher inom ett 4h-bak-fönster. Följd: de spelar-nivå-aggregat som läser
// match_live_data.events (skytteliga, kort-liga, snabbaste mål, mål-per-tidsfönster) täcker
// bara 7 av 16 avgjorda matcher.
//
// VAD DEN GÖR (tunt, en sak): hämtar EN gång de rika blobbarna (events/statistics/lineups)
// för de avgjorda matcher som saknar event-data och skriver dem till match_live_data , i
// EXAKT samma form som pollaren (shapeFrozenBlobs ur den DELADE _shared/livescore-core.ts),
// så skytteligan m.fl. plockar upp dem direkt. En form-avvikelse hade tyst åter-brutit
// statistiken (läs-lagret parsar genom RawApiResponse-kuvertet), DÄRFÖR återanvänds
// pollarens kärna i stället för att skriva en parallell variant (PRINCIPLES §4 + skarv-
// lärdomen: producent-form == konsument-form).
//
// REN ADDITIV (HARD): rör ALDRIG official_match_results och anropar ALDRIG apply_auto_facit.
// De manuella facit-raderna är korrekta + admin-låsta (Daniels HARD-krav). Den här
// funktionen skriver BARA event-data till match_live_data (+ seedar fixture_match_map för
// uppslaget). Den verifierar att API-ställningen matchar facit och RAPPORTERAR avvikelser,
// men FIXAR dem aldrig.
//
// IDEMPOTENT + FAIL-LOUD: re-körbar utan dubbletter (upsert på match_id, fixture_map-insert
// sväljer 23505); varje äkta fel loggas + kastar (svarar 500), aldrig en tyst no-op. En
// fixture som inte kan resolvas entydigt HOPPAS + loggas (gissa aldrig en koppling).
//
// DRY-RUN (default): med tom request-kropp eller {dryRun:true} skrivs INGET , bara en
// rapport per match. {dryRun:false} skriver. Så dirigenten kan bekräfta facit-paritet INNAN
// någon rad rörs.
//
// INGA SECRETS I KODEN (PRINCIPLES §7): API-nyckeln läses ur app_config via service_role
// (funktioner får SUPABASE_SERVICE_ROLE_KEY i env automatiskt). Nyckeln loggas aldrig.

// @ts-nocheck , Deno-runtime (npm:/Deno-globaler). Den här filen typas/lintas INTE av
// app-grafen (tsc -b/eslint kör mot src/, supabase/functions är undantaget). All
// gissningskänslig, delad logik bor i _shared/livescore-core.ts (samma rena, enhetstestade
// + paritets-testade kärna som pollaren använder).

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  EMBEDDED_MATCH_PLAN,
  normalizeStatus,
  resolveFixtureToMatch,
  shapeFrozenBlobs,
  type RawFixtureResponse,
} from '../_shared/livescore-core.ts';

const API_BASE = 'https://v3.football.api-sports.io';
const WC_LEAGUE_ID = 1; // API-Football: World Cup (samma som pollaren).
// En KÄND mappad WC-fixture (g-E-2, verifierad i fixture_match_map). Vi läser dess
// league.season ur API:t i stället för att hårdkoda säsongen (gissa aldrig en säsong).
const SEASON_PROBE_FIXTURE_ID = 1489375;
// Pro-plan: 7500 anrop/dag, vi kapar på 7000 med marginal (samma tak som pollaren). Den här
// backfillen är pytteliten (~1 säsongs-prob + 1 säsongslista + 1 per match), men vi
// bokför ändå mot dagsbudgeten så budget-redovisningen förblir ärlig.
const DAILY_BUDGET = 7000;
const STOCKHOLM_TZ = 'Europe/Stockholm';

/** Svensk kalenderdag (YYYY-MM-DD), samma zon + helper som pollarens bumpCallCount. */
function swedishDay(now: Date): string {
  // en-CA ger ISO-formen YYYY-MM-DD i vald tidszon.
  return new Intl.DateTimeFormat('en-CA', { timeZone: STOCKHOLM_TZ }).format(now);
}

Deno.serve(async (req) => {
  try {
    // DRY-RUN är DEFAULT: tom kropp -> dryRun=true (rör inget). Bara explicit {dryRun:false}
    // skriver. En trasig/saknad kropp tolkas defensivt som dry-run (skriv aldrig av misstag).
    let dryRun = true;
    try {
      const body = await req.json();
      if (body && typeof body === 'object' && body.dryRun === false) {
        dryRun = false;
      }
    } catch {
      // Ingen/ogiltig JSON-kropp -> behåll dry-run-default.
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY saknas i funktionens env.');
    }
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const log: string[] = [];
    let callsThisRun = 0;

    // --- 1. Config: API-nyckel (samma key-read-mönster som pollaren) ---
    const { data: cfgRows, error: cfgErr } = await db
      .from('app_config')
      .select('key, value')
      .in('key', ['api_football_key']);
    if (cfgErr) throw new Error(`Läs app_config misslyckades: ${cfgErr.message}`);
    const apiKey = new Map((cfgRows ?? []).map((r) => [r.key, r.value])).get('api_football_key');
    if (!apiKey) throw new Error('app_config saknar api_football_key.');

    // --- 2. Härled säsongen ur API:t (gissa/hårdkoda aldrig) ---
    const probeResp = await apiGet(apiKey, `/fixtures?id=${SEASON_PROBE_FIXTURE_ID}`);
    callsThisRun += 1;
    const probe = (probeResp.response ?? [])[0] as { league?: { season?: number } } | undefined;
    const season = probe?.league?.season;
    if (typeof season !== 'number') {
      throw new Error(
        `Kunde inte härleda säsongen ur fixture ${SEASON_PROBE_FIXTURE_ID} (league.season saknas).`
      );
    }
    log.push(`säsong härledd ur fixture ${SEASON_PROBE_FIXTURE_ID}: ${season}`);

    // --- 3. Alla WC-fixtures för säsongen (ETT anrop) ---
    const allResp = await apiGet(apiKey, `/fixtures?league=${WC_LEAGUE_ID}&season=${season}`);
    callsThisRun += 1;
    const allFixtures = (allResp.response ?? []) as RawFixtureResponse[];
    log.push(`hämtade ${allFixtures.length} WC-fixtures för säsong ${season}`);

    // --- 4. Befintligt DB-state: vilka matcher har redan en NON-EMPTY events-blob? ---
    // De ska INTE backfillas (idempotens + rör inte de 7 redan pollade). Vi läser bara
    // events-arrayens längd, inte hela blobben.
    const existingWithEvents = await loadMatchesWithEvents(db);

    // --- 5. Bygg backfill-set: resolved + FINISHED + saknar event-data ---
    type MatchReport = {
      matchId: string;
      apiFixtureId: number;
      apiStatus: string;
      apiScore: string;
      officialScore: string | null;
      eventCount: number;
      goalEventCount: number;
      scoreMatches: boolean;
      goalEventsMatchScore: boolean;
      action: 'would-write' | 'written' | 'skipped-no-post';
    };
    const reports: MatchReport[] = [];
    const unresolved: { apiFixtureId: number; reason: string }[] = [];
    let skippedNotFinished = 0;
    let skippedAlreadyHasEvents = 0;

    // Facit-uppslag (official_match_results) för paritets-kollen , LÄSES bara, rörs aldrig.
    const officialByMatch = await loadOfficialScores(db);

    for (const fx of allFixtures) {
      const res = resolveFixtureToMatch({
        apiFixtureId: fx.fixture.id,
        homeTeamApiId: fx.teams.home.id,
        awayTeamApiId: fx.teams.away.id,
        kickoffUtc: new Date(fx.fixture.date).toISOString(),
      });
      if (res.kind !== 'resolved') {
        // Slutspels-platshållare (M73..) saknar lag i bryggan -> unresolved, helt väntat.
        // Vi loggar men spammar inte rapporten med dem.
        unresolved.push({ apiFixtureId: fx.fixture.id, reason: res.reason });
        continue;
      }
      const matchId = res.appMatchId;
      const status = normalizeStatus(fx.fixture.status.short);
      if (status !== 'finished') {
        skippedNotFinished += 1;
        continue;
      }
      if (existingWithEvents.has(matchId)) {
        skippedAlreadyHasEvents += 1;
        continue;
      }

      // I backfill-setet. Hämta den RIKA fixturen (events/statistics/lineups inline).
      const richResp = await apiGet(apiKey, `/fixtures?id=${fx.fixture.id}`);
      callsThisRun += 1;
      const rich = (richResp.response ?? [])[0] as RawFixtureResponse | undefined;
      if (!rich) {
        reports.push({
          matchId,
          apiFixtureId: fx.fixture.id,
          apiStatus: status,
          apiScore: 'n/a',
          officialScore: officialByMatch.get(matchId) ?? null,
          eventCount: 0,
          goalEventCount: 0,
          scoreMatches: false,
          goalEventsMatchScore: false,
          action: 'skipped-no-post',
        });
        log.push(`fixtures?id=${fx.fixture.id} (${matchId}) gav ingen post, hoppas`);
        continue;
      }

      const richEvents = Array.isArray(rich.events) ? rich.events : [];
      const eventCount = richEvents.length;
      // Mål-events räknas EXAKT som appens skytteliga räknar dem (en sanning, PRINCIPLES §4):
      // ett mål är ett event vars `type` normaliseras till 'goal'. Vi speglar
      // normalizeEventKind (parse-live.ts:151) , `rawType.toLowerCase() === 'goal'` , i
      // stället för en parallell regel. KÄLLHÄNVISNING (gissas aldrig): ett MISSAT straff är
      // INTE ett mål-event i API-Football v3, det är ett "Var"/"Missed Penalty"-event, så det
      // faller bort redan på type-filtret (precis som extractGoals i match-stats.ts:59-61,
      // vars doc rad 33-40 källhänvisar just den regeln). Egenmål ÄR ett 'goal'-event och
      // räknas mot ställningen (skytteligan filtrerar bort dem ur SKYTT-tallyn, inte ur
      // måltotalen). Se docs/decisions.md T101.
      const goalEventCount = richEvents.filter(
        (e) => ((e as { type?: string })?.type ?? '').toLowerCase() === 'goal'
      ).length;

      const apiHome = rich.goals?.home;
      const apiAway = rich.goals?.away;
      const apiScore = `${apiHome}-${apiAway}`;
      const officialScore = officialByMatch.get(matchId) ?? null;
      const scoreMatches = officialScore !== null && apiScore === officialScore;
      // Mål-events ska summera till API-ställningen (egenmål räknas för motståndaren men är
      // fortfarande ETT Goal-event, så total = home+away). Diskriminerande paritets-koll.
      const totalGoals =
        typeof apiHome === 'number' && typeof apiAway === 'number' ? apiHome + apiAway : -1;
      const goalEventsMatchScore = goalEventCount === totalGoals;

      const action: MatchReport['action'] = dryRun ? 'would-write' : 'written';

      if (!dryRun) {
        await writeBackfill(db, matchId, rich, status);
      }

      reports.push({
        matchId,
        apiFixtureId: fx.fixture.id,
        apiStatus: status,
        apiScore,
        officialScore,
        eventCount,
        goalEventCount,
        scoreMatches,
        goalEventsMatchScore,
        action,
      });
    }

    // --- 6. Bokför dagens anrop mot poll_log (samma bumpCallCount-mönster som pollaren) ---
    // Görs i BÅDE dry-run och write , anropen är gjorda mot API:t oavsett, budgeten ska vara
    // ärlig. Kapad mot DAILY_BUDGET som en sanity-gate (denna körning är pytteliten).
    if (callsThisRun > 0) {
      const day = swedishDay(new Date());
      const usedToday = await readCallsToday(db, day);
      if (usedToday + callsThisRun > DAILY_BUDGET) {
        // Skulle aldrig hända (3..12 anrop), men fail-loud hellre än tyst spräckt budget.
        log.push(
          `VARNING: dagsbudget skulle spräckas (${usedToday}+${callsThisRun} > ${DAILY_BUDGET})`
        );
      }
      await bumpCallCount(db, day, usedToday + callsThisRun);
    }

    const written = reports.filter((r) => r.action === 'written').length;
    const wouldWrite = reports.filter((r) => r.action === 'would-write').length;
    const anomalies = reports.filter((r) => !r.scoreMatches || !r.goalEventsMatchScore);

    return json({
      ok: true,
      dryRun,
      season,
      callsThisRun,
      summary: {
        backfillCandidates: reports.length,
        wouldWrite,
        written,
        skippedAlreadyHasEvents,
        skippedNotFinished,
        unresolvedCount: unresolved.length,
        anomalyCount: anomalies.length,
      },
      reports,
      anomalies,
      // Bara antalet + en liten provtagning av unresolved (M73.. slutspels-platshållare
      // utan lag i bryggan är väntade, inte fel) , full lista hade dränkt rapporten.
      unresolvedSample: unresolved.slice(0, 5),
      log,
    });
  } catch (err) {
    console.error('[livescore-backfill]', err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Hjälpare (tunna, fail-loud) , speglar pollarens motsvarigheter där de delas.
// ---------------------------------------------------------------------------

/** Samma apiGet-kontrakt som pollaren: fail-loud på HTTP-fel OCH API-Footballs `errors`. */
async function apiGet(apiKey: string, path: string): Promise<{ response?: unknown[] }> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-apisports-key': apiKey },
  });
  if (!res.ok) {
    throw new Error(`API-Football ${path} svarade ${res.status}`);
  }
  const body = await res.json();
  const errors = body?.errors;
  const hasErrors = Array.isArray(errors)
    ? errors.length > 0
    : errors && Object.keys(errors).length > 0;
  if (hasErrors) {
    throw new Error(`API-Football ${path} fel: ${JSON.stringify(errors)}`);
  }
  return body;
}

/**
 * Vilka match_id har redan en NON-EMPTY events-blob (de 7 pollade)? De backfillas inte.
 * Läser bara `match_id, events` och behåller dem vars events->'response' har poster.
 */
async function loadMatchesWithEvents(db: ReturnType<typeof createClient>): Promise<Set<string>> {
  const { data, error } = await db.from('match_live_data').select('match_id, events');
  if (error) throw new Error(`Läs match_live_data (events) misslyckades: ${error.message}`);
  const withEvents = new Set<string>();
  for (const row of data ?? []) {
    const resp = (row.events as { response?: unknown[] } | null)?.response;
    if (Array.isArray(resp) && resp.length > 0) {
      withEvents.add(row.match_id);
    }
  }
  return withEvents;
}

/** Facit-ställningar ("h-a") per match_id ur official_match_results , LÄSES bara, rörs aldrig. */
async function loadOfficialScores(
  db: ReturnType<typeof createClient>
): Promise<Map<string, string>> {
  const { data, error } = await db
    .from('official_match_results')
    .select('match_id, home_goals, away_goals');
  if (error) throw new Error(`Läs official_match_results misslyckades: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.match_id, `${r.home_goals}-${r.away_goals}`]));
}

/**
 * Skriv backfill för EN match: idempotent fixture_match_map-insert (23505 = redan finns = ok)
 * + upsert match_live_data med de KUVERT-LINDADE blobbarna (shapeFrozenBlobs, EXAKT pollarens
 * form). frozen=true (matchen är avgjord). RÖR ALDRIG official_match_results / apply_auto_facit.
 */
async function writeBackfill(
  db: ReturnType<typeof createClient>,
  matchId: string,
  rich: RawFixtureResponse,
  status: string
): Promise<void> {
  const apiFixtureId = rich.fixture.id;
  await insertFixtureMap(db, matchId, apiFixtureId);

  const blobs = shapeFrozenBlobs(
    rich as { events?: unknown[]; statistics?: unknown[]; lineups?: unknown[] }
  );
  const now = new Date().toISOString();
  const { error } = await db.from('match_live_data').upsert(
    {
      match_id: matchId,
      api_fixture_id: apiFixtureId,
      status,
      elapsed_minute: rich.fixture.status.elapsed,
      home_goals: rich.goals.home,
      away_goals: rich.goals.away,
      events: blobs.events,
      statistics: blobs.statistics,
      lineups: blobs.lineups,
      last_synced_at: now,
      frozen: true, // backfill = avgjord match, fryst (pollas aldrig om)
      updated_at: now,
    },
    { onConflict: 'match_id' }
  );
  if (error) throw new Error(`Upsert match_live_data ${matchId} misslyckades: ${error.message}`);
}

/**
 * Insert en koppling i fixture_match_map. Idempotent: 23505 (unique_violation, raden fanns
 * redan) är INTE ett fel. Ett ÄKTA fel fail-loud:ar. Samma kontrakt som pollarens insertFixtureMap.
 */
async function insertFixtureMap(
  db: ReturnType<typeof createClient>,
  matchId: string,
  apiFixtureId: number
): Promise<void> {
  const { error } = await db
    .from('fixture_match_map')
    .insert({ match_id: matchId, api_fixture_id: apiFixtureId });
  if (error && error.code !== '23505') {
    throw new Error(
      `Insert fixture_match_map ${matchId}/${apiFixtureId} misslyckades: ${error.message}`
    );
  }
}

/** Läs dagens anrops-räknare (0 om ingen rad ännu). */
async function readCallsToday(db: ReturnType<typeof createClient>, day: string): Promise<number> {
  const { data, error } = await db.from('poll_log').select('calls').eq('day', day).maybeSingle();
  if (error) throw new Error(`Läs poll_log misslyckades: ${error.message}`);
  return data?.calls ?? 0;
}

/** Bokför dagens anrop (idempotent upsert), samma mönster som pollarens bumpCallCount. */
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
