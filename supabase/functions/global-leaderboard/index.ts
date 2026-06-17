// GLOBAL-LEADERBOARD (edge function, Deno) , server-side, RÄTTVIS, READ-ONLY (T90, #183).
//
// ANSVAR (tunt, en sak): bygg den GLOBALA, rättvisa topplistan över ALLA deltagare i ALLA
// rum och returnera BARA säkra fält (visningsnamn, poäng, rank, exakt-träffar):
//   1. Läs ALLA rum-medlemmar + ALLA råa tips (match/grupp/bracket) + de officiella
//      resultaten med SERVICE_ROLE (förbi RLS , det är hela poängen: ingen klient får
//      läsa över rumsgränser, men den här server-vägen måste, för att kunna rangordna alla).
//   2. Gruppera tipsen per rum + userId (MemberPredictions-form).
//   3. Poängsätt + aggregera med den GENERERADE, paritets-testade scoring-mirror:n
//      (buildGlobalLeaderboard) , EXAKT samma testade TS-motor som klienten kör. INGEN
//      reimplementation av poängregler här (en sanning, ingen divergens).
//   4. Returnera BARA SafeGlobalEntry-rader. Råa tips lämnar ALDRIG funktionen.
//
// READ-ONLY (HARD, dataintegritet): funktionen gör BARA .select() (med .order()/.range() ,
// rena läs-modifierare, ingen skriv-semantik), inget .insert/.update/.delete/.upsert/.rpc-
// med-bieffekt. Den rör ALDRIG bot-/seed-datan eller någon annan rad. Bot-datan är bevisat
// oförändrad efter deploy (inga skrivningar finns i koden).
//
// PRIVACY (HARD): de råa tipsen läses (måste, för att poängsätta alla), men returvärdet bär
// BARA (userId, displayName, points, rank, exactHits). buildGlobalLeaderboard projicerar
// till SafeGlobalEntry , det finns ingen kodväg där en rå tips-rad lämnar svaret.
//
// AUTH: verify_jwt = true (kräver inloggad, även anon-session). Svaret innehåller bara redan
// publika visningsnamn + härledda poäng, inget hemligt , men vi kräver ändå en giltig token
// (ingen öppen, oautentiserad yta). Ingen admin-gate behövs: alla får se den globala listan.
//
// @ts-nocheck , Deno-runtime (npm:/Deno-globaler). Den här filen typas/lintas INTE av
// app-grafen (tsc -b/eslint kör mot src/, supabase/functions är undantaget). All
// gissningskänslig, testbar logik bor i src/data/global-leaderboard/ + den genererade
// _shared-mirror:n (rena funktioner, enhetstestade + paritets-testade mot src).

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildGlobalLeaderboard,
  selectAllPages,
  DEFAULT_PAGE_SIZE,
  EMBEDDED_STATIC_PLAN,
} from '../_shared/global-leaderboard-core.ts';

/**
 * Hämta ALLA rader ur en tabell, sidindelat (Supabase cap:ar .select() till ~1000 rader/
 * anrop; predictions har ~18k rader = 19 sidor). DEN gissningskänsliga loop-/completeness-
 * logiken bor i den DELADE, TESTADE `selectAllPages` (src/data/global-leaderboard/
 * select-all-pages.ts, bundlad in via mirror:n) , den här funktionen är bara IO-wrappern
 * som bygger en page-fetcher per tabell.
 *
 * STABIL ORDER BY (HARD, dataintegritet): PostgREST/Postgres garanterar INTE samma
 * radordning mellan två sidanrop UTAN en total ORDER BY. Utan den kan en rad hoppas över
 * (understruken poäng) eller dubbleras (uppblåst poäng) vid sid-gränsen under samtidiga
 * skrivningar/en annan query-plan , exakt fairness-buggen T90 fixar. Vi ordnar därför på
 * tabellens PK (en TOTAL ordning), och ber om ett `count: 'exact'` så `selectAllPages` kan
 * verifiera completeness (hämtat antal == rapporterat antal) och fail-loud:a annars.
 * Källa: senior-developer-lärdom "paginerad-las-utan-stabil-order-..." (reviewer T90).
 *
 * @param db        Supabase-klienten (service_role, read-only).
 * @param table     Tabellnamn.
 * @param columns   Kolumn-projektionen.
 * @param orderCols Tabellens PK-kolumner (i ordning) , den STABILA totalordningen.
 */
function selectAll(db, table, columns, orderCols) {
  return selectAllPages(
    async ({ from, to }) => {
      // .order() per PK-kolumn = total ordning; .range() = sidan; count:'exact' = total.
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

Deno.serve(async () => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY saknas i funktionens env.');
    }
    // SERVICE_ROLE: läser förbi RLS (måste, för att se ALLA rum). persistSession: false ,
    // en statslös funktion. Vi gör BARA select med denna klient (read-only).
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // --- 1. Läs allt som behövs (READ-ONLY, sidindelat) ---
    // orderCols = tabellens PK (verifierat mot live-schemat): en TOTAL ordning, så sid-
    // gränserna är väldefinierade (ingen tappad/dubblerad rad). Se selectAll-headern.
    const [members, matchPreds, groupPreds, bracketPreds, official] = await Promise.all([
      selectAll(db, 'room_members', 'room_id, user_id, display_name', ['room_id', 'user_id']),
      selectAll(db, 'predictions', 'room_id, match_id, user_id, home_goals, away_goals', [
        'room_id',
        'match_id',
        'user_id',
      ]),
      selectAll(
        db,
        'group_predictions',
        'room_id, group_id, user_id, winner_team_id, runner_up_team_id',
        ['room_id', 'group_id', 'user_id']
      ),
      selectAll(db, 'bracket_predictions', 'room_id, slot_id, user_id, advancing_team_id', [
        'room_id',
        'slot_id',
        'user_id',
      ]),
      selectAll(
        db,
        'official_match_results',
        'match_id, home_goals, away_goals, penalties_home, penalties_away, status',
        ['match_id']
      ),
    ]);

    // --- 2. Gruppera per rum + userId till MemberPredictions-form (källans schema) ---
    // roomId -> userId -> MemberPredictions. Vi skapar bara rader för (rum, user) som har
    // ett medlemskap; en tips-rad utan medlemskap (ska inte finnas) hoppas tyst (fail-safe).
    const byRoom = new Map(); // roomId -> { members: Map<userId,displayName>, preds: Map<userId, MemberPredictions> }

    const ensureRoom = (roomId) => {
      let r = byRoom.get(roomId);
      if (!r) {
        r = { members: new Map(), preds: new Map() };
        byRoom.set(roomId, r);
      }
      return r;
    };
    const ensurePreds = (roomId, userId) => {
      const r = ensureRoom(roomId);
      let p = r.preds.get(userId);
      if (!p) {
        p = { userId, matchPredictions: [], groupPredictions: [], bracketPredictions: [] };
        r.preds.set(userId, p);
      }
      return p;
    };

    for (const m of members) {
      ensureRoom(m.room_id).members.set(m.user_id, m.display_name);
    }
    for (const p of matchPreds) {
      ensurePreds(p.room_id, p.user_id).matchPredictions.push({
        matchId: p.match_id,
        userId: p.user_id,
        homeGoals: p.home_goals,
        awayGoals: p.away_goals,
        updatedAt: '',
      });
    }
    for (const p of groupPreds) {
      ensurePreds(p.room_id, p.user_id).groupPredictions.push({
        groupId: p.group_id,
        userId: p.user_id,
        winnerTeamId: p.winner_team_id, // lagrat som CODE (versal), facit jämförs mot code
        runnerUpTeamId: p.runner_up_team_id,
        updatedAt: '',
      });
    }
    for (const p of bracketPreds) {
      ensurePreds(p.room_id, p.user_id).bracketPredictions.push({
        slotId: p.slot_id,
        userId: p.user_id,
        advancingTeamId: p.advancing_team_id, // lagrat som CODE (versal)
        updatedAt: '',
      });
    }

    // RawRoomData[]: members ur medlems-raderna (inte ur tips), så en medlem UTAN tips
    // räknas (0p, med i listan), exakt som klientens per-rums-topplista.
    const rooms = [];
    for (const [roomId, r] of byRoom) {
      const memberList = [];
      for (const [userId, displayName] of r.members) {
        memberList.push({ userId, displayName });
      }
      rooms.push({ roomId, members: memberList, predictionsByUser: r.preds });
    }

    // --- 3. Officiella resultat -> facit-källans form (RoomMatchResult) ---
    const officialResults = official.map((o) => ({
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

    // --- 4. Poängsätt + aggregera med den DELADE motorn (en sanning) ---
    const leaderboard = buildGlobalLeaderboard(rooms, officialResults, EMBEDDED_STATIC_PLAN);

    return new Response(JSON.stringify({ leaderboard, participants: leaderboard.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // FAIL-LOUD: svara 500 med ett begripligt fel (aldrig en tyst tom/fel topplista).
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `[VM2026] global-leaderboard: ${message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
