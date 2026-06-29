// BOT-SLUTSPELSTIPS-SEEDARE (edge function, Deno) , autonom, ÅTERKOMMANDE, Fas 3.
//
// ANSVAR (tunt, en sak): se till att varje bot har ett RIMLIGT slutspelstips
// (bracket_predictions) för varje slot som blivit TIPPBAR (båda lagen kända ur facit)
// och ännu inte låst (avspark ej passerad). Körs av ett lågfrekvent pg_cron-jobb, så
// den UPPTÄCKER själv när en ny runda öppnats (sextondel -> åttondel -> kvart -> semi ->
// final) och fyller bot-tipsen DÅ. Ingen manuell körning per runda.
//
//   1. Läs config-flaggor ur request-kroppen (dryRun default TRUE, valfri config-override).
//   2. Läs botarna (bot_accounts ⋈ room_members), de officiella resultaten och ALLA
//      befintliga bracket-tips (service_role, förbi RLS).
//   3. Härled + planera med den GENERERADE, paritets-testade mirror:n
//      (planBotBracketSeedingFromDb) , EXAKT samma testade TS-motor som klienten. INGEN
//      reimplementation av tippbar-/seednings-regler här (en sanning, ingen divergens).
//   4. DRY-RUN (default): rapportera vad som SKULLE skrivas (antal + per slot + stickprov),
//      skriv INGET. LIVE ({"dryRun": false}): upserta bot-raderna idempotent.
//
// DRY-RUN-DEFAULT (HARD): utan body, med {} eller utan dryRun=false skriver funktionen
// INGET. Bara ett explicit {"dryRun": false} verkställer. Så ett manuellt testanrop kan
// aldrig råka skriva, och dirigenten kan verifiera planen FÖRE prod-skrivning.
//
// BOT-ISOLERING (HARD): planeraren rör BARA user_id som finns i bot_accounts (botSet), och
// vi RÄKNAR icke-bot-rader före/efter en live-skrivning och AVBRYTER (fail loud) om de
// ändrats , riktiga spelares tips får ALDRIG röras (jfr seed-bots.ts skydds-räkning).
//
// IDEMPOTENT + FAIL-LOUD: upsertar på PK (room_id, slot_id, user_id), så en omkörning inte
// dubblar; ett redan giltigt bot-tips lämnas orört (planeraren tar inte med det). Varje fel
// loggas + kastar (svarar 500), aldrig en tyst no-op.
//
// INGA SECRETS I KODEN (PRINCIPLES §7): URL + service_role läses ur funktionens env
// (sätts automatiskt av Supabase). Cron skickar Authorization-headern (se CRON_SETUP.sql).
//
// @ts-nocheck , Deno-runtime (npm:/Deno-globaler). Den här filen typas/lintas INTE av
// app-grafen (tsc -b/eslint kör mot src/, supabase/functions är undantaget). All
// gissningskänslig, testbar logik bor i src/data/bots/ + den genererade _shared-mirror:n
// (rena funktioner, enhets- + paritets-testade mot src).

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  planBotBracketSeedingFromDb,
  selectAllPages,
  DEFAULT_PAGE_SIZE,
} from '../_shared/bot-bracket-core.ts';

/** Läs ALLA rader ur en tabell sidindelat med STABIL ORDER BY (tabellens PK) + exact count. */
function selectAll(db, table, columns, orderCols) {
  return selectAllPages(
    async ({ from, to }) => {
      let query = db.from(table).select(columns, { count: 'exact' });
      for (const col of orderCols) {
        query = query.order(col, { ascending: true });
      }
      const { data, error, count } = await query.range(from, to);
      if (error) throw new Error(`Läs ${table} misslyckades: ${error.message}`);
      return { rows: data ?? [], total: count ?? 0 };
    },
    table,
    DEFAULT_PAGE_SIZE
  );
}

/** Räkna icke-bot-rader i en redan inläst bracket-radmängd (isolerings-vakt). */
function countNonBot(rows, botSet) {
  let n = 0;
  for (const r of rows) {
    if (!botSet.has(r.user_id)) n += 1;
  }
  return n;
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY saknas i funktionens env.');
    }
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // --- 1. Body: dryRun (default TRUE) + valfri config-override ---
    let body = {};
    try {
      const text = await req.text();
      if (text.trim().length > 0) body = JSON.parse(text);
    } catch {
      // Ogiltig/ingen body -> default (dry-run). Vi gissar aldrig en skriv-avsikt.
      body = {};
    }
    const dryRun = body?.dryRun !== false; // skriver BARA vid explicit false
    const config = body?.config; // {favoriteCap?, replaceInvalid?} -> planeraren validerar

    // --- 2. Läs botarna, facit och befintliga bracket-tips (service_role) ---
    const { data: botRows, error: botErr } = await db
      .from('bot_accounts')
      .select('user_id, skill_tier, persona_key');
    if (botErr) throw new Error(`Läs bot_accounts misslyckades: ${botErr.message}`);
    const bots = botRows ?? [];
    const botSet = new Set(bots.map((b) => b.user_id));
    const skillById = new Map(bots.map((b) => [b.user_id, b.skill_tier]));
    const keyById = new Map(bots.map((b) => [b.user_id, b.persona_key]));

    // Medlemskap: var bor varje bot? (room_members < 1000 rader -> en läsning räcker.)
    const { data: memberRows, error: memErr } = await db
      .from('room_members')
      .select('room_id, user_id');
    if (memErr) throw new Error(`Läs room_members misslyckades: ${memErr.message}`);
    const botMemberships = (memberRows ?? []).filter((m) => botSet.has(m.user_id));
    const botsForSeeding = botMemberships.map((m) => ({
      userId: m.user_id,
      roomId: m.room_id,
      skillTier: skillById.get(m.user_id) ?? 0,
      seedKey: keyById.get(m.user_id) ?? m.user_id,
    }));

    // Officiella resultat (facit-källan) -> RoomMatchResult-form (samma som global-leaderboard).
    const { data: officialRows, error: offErr } = await db
      .from('official_match_results')
      .select('match_id, home_goals, away_goals, penalties_home, penalties_away, status');
    if (offErr) throw new Error(`Läs official_match_results misslyckades: ${offErr.message}`);
    const officialResults = (officialRows ?? []).map((o) => ({
      matchId: o.match_id,
      homeGoals: o.home_goals,
      awayGoals: o.away_goals,
      penalties:
        o.penalties_home !== null && o.penalties_away !== null
          ? { homeGoals: o.penalties_home, awayGoals: o.penalties_away }
          : null,
      status: o.status,
      updatedBy: '',
      updatedAt: '',
    }));

    // ALLA bracket-tips (bot + icke-bot), paginerat med stabil PK-ordning + completeness-vakt.
    const existingRows = await selectAll(
      db,
      'bracket_predictions',
      'room_id, slot_id, user_id, advancing_team_id',
      ['room_id', 'slot_id', 'user_id']
    );
    const existingBracket = existingRows.map((r) => ({
      roomId: r.room_id,
      slotId: r.slot_id,
      userId: r.user_id,
      advancingTeamId: r.advancing_team_id,
    }));

    // --- 3. Planera (en sanning: samma motor som klienten) ---
    const nowIso = new Date().toISOString();
    const plan = planBotBracketSeedingFromDb({
      bots: botsForSeeding,
      existingBracket,
      officialResults,
      nowIso,
      config,
    });

    const report = {
      now: nowIso,
      bots: botsForSeeding.length,
      seedableSlots: plan.seedableSlots.map((s) => ({
        slotId: s.slotId,
        stage: s.stage,
        favorite: s.favorite,
        underdog: s.underdog,
      })),
      summary: plan.summary,
      nonBotExistingCount: plan.nonBotExistingCount,
      sampleRows: plan.rows.slice(0, 5),
    };

    // --- 4a. DRY-RUN (default): rapportera, skriv inget ---
    if (dryRun) {
      return json({ ok: true, dryRun: true, wouldWrite: plan.rows.length, ...report });
    }

    // --- 4b. LIVE: bot-isolerad, idempotent upsert + före/efter-skydd ---
    // Belt-and-suspenders: planeraren garanterar redan bot-only, men vi vägrar skriva en
    // rad som mot förmodan pekar på ett icke-bot-id.
    for (const row of plan.rows) {
      if (!botSet.has(row.userId)) {
        throw new Error(`AVBRYTER live-skriv: rad pekar på icke-bot-id ${row.userId}.`);
      }
    }
    const nonBotBefore = plan.nonBotExistingCount;

    let written = 0;
    const BATCH = 500;
    for (let i = 0; i < plan.rows.length; i += BATCH) {
      const batch = plan.rows.slice(i, i + BATCH).map((r) => ({
        room_id: r.roomId,
        slot_id: r.slotId,
        user_id: r.userId,
        advancing_team_id: r.advancingTeamId,
        updated_at: nowIso,
      }));
      if (batch.length === 0) continue;
      const { error: upErr } = await db
        .from('bracket_predictions')
        .upsert(batch, { onConflict: 'room_id,slot_id,user_id' });
      if (upErr) throw new Error(`Upsert bracket_predictions misslyckades: ${upErr.message}`);
      written += batch.length;
    }

    // EFTER-SKYDD: räkna om icke-bot-rader och AVBRYT (fail loud) om de ändrats.
    const afterRows = await selectAll(
      db,
      'bracket_predictions',
      'room_id, slot_id, user_id, advancing_team_id',
      ['room_id', 'slot_id', 'user_id']
    );
    const nonBotAfter = countNonBot(afterRows, botSet);
    if (nonBotAfter !== nonBotBefore) {
      throw new Error(
        `ISOLERINGSBROTT: icke-bot bracket-rader ändrades (${nonBotBefore} -> ${nonBotAfter}). ` +
          `Detta får ALDRIG hända , riktig data ska vara orörd.`
      );
    }

    return json({ ok: true, dryRun: false, written, nonBotBefore, nonBotAfter, ...report });
  } catch (err) {
    console.error('[bot-bracket-seeder]', err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
