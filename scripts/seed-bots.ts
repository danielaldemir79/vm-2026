// Säkert seed-skript för bot-atmosfären (T82, #173). Körs via vite-node.
//
// ARKITEKTUR (T82-direktivet): detta är den TUNNA exekverings-delen. ALL logik som är
// värd att testa (personas, tips-skiktning, seed-PLANEN, Rhodos-uteslutning, idempotens)
// bor i src/data/bots/ och är enhetstestad mot fixtures. Här gör vi bara I/O:
//   1) läs en ögonblicksbild av befintliga rum + redan seedade botar (read-only),
//   2) bygg seed-planen (REN funktion, buildSeedPlan),
//   3) DRY-RUN (default): rapportera vad som SKULLE skapas, skriv INGET,
//      LIVE (--live): skapa konton/rum/medlemmar/tips, med före/efter-skydd av riktig data,
//      TEARDOWN (--teardown): radera BARA botar via registret (cascade städar resten).
//
// SÄKERHET (HARD):
//   * Service_role-nyckel + URL läses ur ENV (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY),
//     ALDRIG hårdkodat, ALDRIG committat. Fail loud om de saknas i live/teardown.
//   * RHODOS rörs aldrig: planeraren utesluter det, och vi rör bara de rum planen pekar på.
//   * FÖRE/EFTER-SKYDD i live: räkna RIKTIGA (icke-bot) medlemmar + tips före och efter,
//     AVBRYT (kasta) om de ändrats, så en bugg aldrig kan röra riktig data tyst.
//   * Default = dry-run: man kan aldrig råka skriva genom att bara köra skriptet.
//
// Detta skript körs ALDRIG mot den skarpa databasen av byggaren; live-läget körs av
// ägaren efter uttryckligt go (se HANDOFF). Här bevisas det bara kunna köras säkert.

import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/data/supabase-types';
import { generatePersonas } from '../src/data/bots/personas';
import {
  buildSeedPlan,
  type RoomsSnapshot,
  type ExistingRoom,
  type SeedDomain,
  type SeedPlan,
  type PlannedMembership,
} from '../src/data/bots/seed-plan';
import { derivePoolFacit } from '../src/features/leaderboard/derive-facit';
import { WC2026_TEAM_BASES, WC2026_GROUPS } from '../src/data/wc2026/team-refs';
import { WC2026_MATCHES } from '../src/data/wc2026/matches';
import { roomCodeForIndex } from '../src/data/rooms/room-code';
import { assertRealDataUnchanged, type RealDataCounts } from '../src/data/bots/seed-protection';
import type { Team } from '../src/domain/types';

type AdminClient = SupabaseClient<Database>;

/* ------------------------------------------------------------------ *
 * CLI.
 * ------------------------------------------------------------------ */

type Mode = 'dry-run' | 'live' | 'teardown' | 'help';

function parseMode(argv: readonly string[]): Mode {
  if (argv.includes('--help') || argv.includes('-h')) {
    return 'help';
  }
  if (argv.includes('--teardown')) {
    return 'teardown';
  }
  if (argv.includes('--live')) {
    return 'live';
  }
  return 'dry-run';
}

const USAGE = `
seed-bots , seeda VM-tipsligan med diskreta atmosfär-botar (T82).

ANVÄNDNING:
  npm run seed:bots                # DRY-RUN (default): rapportera, skriv INGET
  npm run seed:bots -- --live      # LIVE: skapa konton/rum/medlemmar/tips
  npm run seed:bots -- --teardown  # RIV: radera BARA botar (via bot_accounts-registret)
  npm run seed:bots -- --help      # denna hjälp

MILJÖ (krävs i --live och --teardown, ALDRIG committad):
  SUPABASE_URL                 projektets URL
  SUPABASE_SERVICE_ROLE_KEY    service_role-nyckeln (admin)

SÄKERHET:
  * Dry-run skriver inget , du kan inte råka seeda genom att bara köra skriptet.
  * Rhodos-rummet rörs ALDRIG (uteslutet i planeraren).
  * Live räknar riktiga (icke-bot) medlemmar + tips före/efter och AVBRYTER om de ändras.
`.trim();

/* ------------------------------------------------------------------ *
 * Env + klient (fail loud, inga secrets i koden).
 * ------------------------------------------------------------------ */

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `[VM2026] Saknar miljövariabel ${name}. Sätt SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ` +
        `i miljön (aldrig i koden). Kör med --help för detaljer.`
    );
  }
  return value;
}

function createAdminClient(): AdminClient {
  const url = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  // service_role förbigår RLS (admin). persistSession av: ett engångs-skript, ingen session.
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* ------------------------------------------------------------------ *
 * Domän-data (samma källåkrade turneringsdata som appen).
 * ------------------------------------------------------------------ */

function buildDomain(): SeedDomain {
  const teams: Team[] = WC2026_TEAM_BASES.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    group: b.group,
  }));
  // Facit härleds ur appens matchlista. På en skarp körning skulle den vävas med rummets
  // delade resultat; för bot-tipsen räcker den statiska planen (kommande vs spelat avgörs
  // av facit, och en skarp körning kan mata in en uppdaterad matchlista här).
  const facit = derivePoolFacit(teams, WC2026_GROUPS, WC2026_MATCHES);
  return { matches: WC2026_MATCHES, groups: WC2026_GROUPS, facit };
}

/* ------------------------------------------------------------------ *
 * Snapshot (read-only läsning av befintligt läge).
 * ------------------------------------------------------------------ */

async function readSnapshot(client: AdminClient): Promise<RoomsSnapshot> {
  const { data: rooms, error: roomsError } = await client.from('rooms').select('id, name');
  if (roomsError) {
    throw new Error(`[VM2026] Kunde inte läsa rum: ${roomsError.message}`);
  }
  // Idempotens-ankaret: persona_key för varje redan seedad bot (UNIQUE i registret).
  // En persona vars nyckel ligger här hoppas över av planeraren (ingen dubblett).
  const { data: bots, error: botsError } = await client.from('bot_accounts').select('persona_key');
  if (botsError) {
    throw new Error(`[VM2026] Kunde inte läsa bot_accounts: ${botsError.message}`);
  }
  const existingBotKeys = new Set<string>((bots ?? []).map((r) => r.persona_key));
  const existingRooms: ExistingRoom[] = (rooms ?? []).map((r) => ({ id: r.id, name: r.name }));
  return { existingRooms, existingBotKeys };
}

/* ------------------------------------------------------------------ *
 * Före/efter-skydd: räkna RIKTIG (icke-bot) data.
 * (Beslutet om OFÖRÄNDRING bor i src/data/bots/seed-protection.ts, enhetstestat.)
 * ------------------------------------------------------------------ */

/**
 * Räkna RIKTIGA (icke-bot) rader: medlemmar och match-tips vars user_id INTE finns i
 * bot_accounts. Används före och efter live-körningen, en skillnad => riktig data rördes
 * => avbryt (fail loud, assertRealDataUnchanged).
 *
 * NOT-IN GÖRS SERVER-SIDE (count_non_bot_rows-RPC), inte via ett PostgREST not-in-filter
 * med ~240 UUID:er i GET-URL:en: en sådan URL (~8,9 kB) ligger nära/över URL-längd-taket,
 * och efter-räkningen körs EFTER skrivningarna , en URL-spräckning där hade lämnat en
 * halv-seedad DB. RPC:n skickar bara tabellnamnet, så URL:en hålls liten oavsett antal
 * botar. Se migrationen 20260615140000_t82_count_non_bot_rows.sql + docs/decisions.md.
 */
async function countRealData(client: AdminClient): Promise<RealDataCounts> {
  const members = await countNonBotRows(client, 'room_members');
  const predictions = await countNonBotRows(client, 'predictions');
  return { members, predictions };
}

/** Räkna icke-bot-rader i en tabell via SQL-RPC:n (NOT-IN i databasen, inte i URL:en). */
async function countNonBotRows(
  client: AdminClient,
  table: 'room_members' | 'predictions'
): Promise<number> {
  const { data, error } = await client.rpc('count_non_bot_rows', { p_table: table });
  if (error) {
    throw new Error(`[VM2026] Kunde inte räkna riktig data i ${table}: ${error.message}`);
  }
  return data ?? 0;
}

/* ------------------------------------------------------------------ *
 * Rapport (dry-run + sammanfattning).
 * ------------------------------------------------------------------ */

function reportPlan(plan: SeedPlan, live: boolean): void {
  const s = plan.summary;
  console.log(`\n${live ? 'LIVE-PLAN' : 'DRY-RUN (skriver inget)'} , bot-seedning T82\n`);
  console.log(`  Konton att skapa:      ${s.accountsToCreate}`);
  console.log(`    , new-room:           ${s.byCohort['new-room']}`);
  console.log(`    , vm2026:             ${s.byCohort.vm2026}`);
  console.log(`    , fsu:                ${s.byCohort.fsu}`);
  console.log(`  Nya rum att skapa:     ${s.newRoomsToCreate}`);
  console.log(`  Medlemskap att skapa:  ${s.membershipsToCreate}`);
  console.log(`  Tips-rader att skapa:  ${s.predictionRowsToCreate}`);
  console.log(`  Reaktioner att skapa:  ${s.reactionsToCreate}`);
  console.log(`  Kommentarer att skapa: ${s.commentsToCreate} (varav svar: ${s.replyComments})`);
  console.log(`  Hoppas över (finns):   ${s.skippedExisting}`);

  // Stickprov: visa 5 planerade botar (namn + kohort + mål) så man ser att de ser rimliga ut.
  console.log('\n  Stickprov (5 konton):');
  for (const account of plan.accounts.slice(0, 5)) {
    const membership = plan.memberships.find((m) => m.personaKey === account.personaKey);
    console.log(
      `    , ${account.displayName} [${account.cohort}] skill=${account.skillTier} -> ` +
        `${describeTarget(membership)}`
    );
  }
  console.log('');
}

function describeTarget(membership: PlannedMembership | undefined): string {
  if (!membership) {
    return '(okänt mål)';
  }
  return membership.target.kind === 'new'
    ? `nytt rum #${membership.target.roomIndex}`
    : `befintligt rum ${membership.target.roomId}`;
}

/* ------------------------------------------------------------------ *
 * Körningar.
 * ------------------------------------------------------------------ */

async function runDryRun(): Promise<void> {
  // Dry-run behöver INTE service_role: planeras mot en TOM snapshot om env saknas, så
  // man kan se planens FORM utan att röra DB:n alls. Med env läses en riktig snapshot.
  const personas = generatePersonas();
  const domain = buildDomain();
  let snapshot: RoomsSnapshot;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    snapshot = await readSnapshot(createAdminClient());
  } else {
    console.log(
      '\n(Ingen Supabase-env satt , planerar mot en tom snapshot för att visa planens form.)'
    );
    snapshot = synthFreshSnapshot();
  }
  const plan = buildSeedPlan(personas, snapshot, domain);
  reportPlan(plan, false);
  console.log('Inget skrevs (dry-run). Kör med --live för att verkställa.\n');
}

/** En syntetisk frisk snapshot för dry-run utan DB (visar planens form). */
function synthFreshSnapshot(): RoomsSnapshot {
  return {
    existingRooms: [
      { id: '(vm-room-id)', name: 'VM 2026' },
      { id: '(fsu-room-id)', name: 'Full Stack United' },
      { id: '(rhodos-room-id)', name: 'Rhodos' },
    ],
    existingBotKeys: new Set(),
  };
}

async function runLive(): Promise<void> {
  const client = createAdminClient(); // fail loud om env saknas
  const personas = generatePersonas();
  const domain = buildDomain();
  const snapshot = await readSnapshot(client);
  const plan = buildSeedPlan(personas, snapshot, domain);
  reportPlan(plan, true);

  if (plan.accounts.length === 0) {
    console.log('Inget att seeda (allt redan på plats). Klart.\n');
    return;
  }

  const before = await countRealData(client);
  console.log(
    `Skydds-räkning FÖRE: ${before.members} riktiga medlemmar, ${before.predictions} tips.`
  );

  await executePlan(client, plan);

  const after = await countRealData(client);
  assertRealDataUnchanged(before, after);
  console.log(
    `Skydds-räkning EFTER: ${after.members} riktiga medlemmar, ${after.predictions} tips (oförändrat).`
  );
  console.log('Seedning klar.\n');
}

async function runTeardown(): Promise<void> {
  const client = createAdminClient(); // fail loud om env saknas
  const before = await countRealData(client);

  const { data: bots, error } = await client.from('bot_accounts').select('user_id');
  if (error) {
    throw new Error(`[VM2026] Kunde inte läsa bot_accounts för teardown: ${error.message}`);
  }
  const botIds = (bots ?? []).map((r) => r.user_id);
  console.log(`\nTEARDOWN , raderar ${botIds.length} bot-konton (cascade städar medlemskap/tips).`);

  // Radera auth.users-raderna => ON DELETE CASCADE städar room_members + alla tips +
  // bot_accounts-raden. Vi rör BARA bot-id:n (ur registret), aldrig riktig data.
  for (const id of botIds) {
    const { error: delError } = await client.auth.admin.deleteUser(id);
    if (delError) {
      throw new Error(`[VM2026] Kunde inte radera bot ${id}: ${delError.message}`);
    }
  }

  const after = await countRealData(client);
  assertRealDataUnchanged(before, after);
  console.log(
    `Teardown klar. Riktig data oförändrad (${after.members} medlemmar, ${after.predictions} tips).\n`
  );
}

/**
 * TUNN exekvering av planen mot admin-API:t. Idempotens på rad-nivå via upsert/onConflict
 * (en andra körning skapar inga dubbletter även om snapshot-idempotensen missade något).
 * Håller sig STRIKT till de rum/konton planen pekar på (Rhodos kan strukturellt inte finnas
 * där, planeraren utesluter det). Ordningen är: konton -> registret -> nya rum -> medlemmar
 * -> tips, så varje FK finns när nästa rad refererar den.
 *
 * VIKTIGT: byggaren kör ALDRIG denna väg (ingen service_role-env i byggmiljön), men koden
 * är fullt KÖRBAR så ägaren kan verkställa SAMMA testade plan efter go (T82-kravet "ska
 * kunna köras"). Säkerheten ligger i dry-run-default + env-gating + före/efter-skyddet i
 * runLive, inte i att lamslå koden.
 */
async function executePlan(client: AdminClient, plan: SeedPlan): Promise<void> {
  // 1) Konton: ett auth.users + en bot_accounts-rad per planerat konto. Synkron e-post
  //    (unik per persona-nyckel) så kontot får en stabil FK-bar identitet. email_confirm
  //    så kontot är direkt användbart (ingen bekräftelse-mejl till en bot).
  const userIdByKey = new Map<string, string>();
  for (const account of plan.accounts) {
    const email = `bot+${slugifyKey(account.personaKey)}@vm2026.local`;
    const { data, error } = await client.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { bot: true, persona_key: account.personaKey },
    });
    if (error || !data.user) {
      throw new Error(
        `[VM2026] Kunde inte skapa bot-konto (${account.personaKey}): ${error?.message}`
      );
    }
    userIdByKey.set(account.personaKey, data.user.id);
    // Registrera i bot_accounts (idempotens-ankaret + ångerknappen). Upsert på persona_key
    // så en omkörning inte dubblar registret.
    const { error: regError } = await client.from('bot_accounts').upsert(
      {
        user_id: data.user.id,
        persona_key: account.personaKey,
        display_name: account.displayName,
        skill_tier: account.skillTier,
        personality: account.personality,
        cohort: account.cohort,
      },
      { onConflict: 'persona_key' }
    );
    if (regError) {
      throw new Error(
        `[VM2026] Kunde inte registrera bot ${account.personaKey}: ${regError.message}`
      );
    }
  }

  // 2) Nya rum: ett rum per plan-index. created_by måste vara en auth.users; vi använder
  //    den FÖRSTA boten som hör till rummet (alla bot-konton finns nu). Mappa plan-index
  //    -> riktigt rum-id för medlems-/tips-stegen.
  const roomIdByIndex = new Map<number, string>();
  for (const room of plan.newRooms) {
    const creatorKey = firstMembershipKeyForNewRoom(plan, room.roomIndex);
    const createdBy = creatorKey ? userIdByKey.get(creatorKey) : undefined;
    if (!createdBy) {
      throw new Error(`[VM2026] Nytt rum #${room.roomIndex} saknar en skapar-bot. Avbryter.`);
    }
    const { data, error } = await client
      .from('rooms')
      .insert({ name: room.name, code: roomCodeForIndex(room.roomIndex), created_by: createdBy })
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(`[VM2026] Kunde inte skapa nytt rum #${room.roomIndex}: ${error?.message}`);
    }
    roomIdByIndex.set(room.roomIndex, data.id);
  }

  // 3) Medlemskap: bot in i sitt rum (befintligt id eller nytt rums riktiga id). Upsert på
  //    PK (room_id,user_id) så en omkörning inte dubblar.
  for (const membership of plan.memberships) {
    const userId = mustUserId(userIdByKey, membership.personaKey);
    const roomId = resolveRoomId(membership.target, roomIdByIndex);
    const { error } = await client
      .from('room_members')
      .upsert(
        { room_id: roomId, user_id: userId, display_name: membership.displayName },
        { onConflict: 'room_id,user_id' }
      );
    if (error) {
      throw new Error(
        `[VM2026] Kunde inte lägga till medlem ${membership.personaKey}: ${error.message}`
      );
    }
  }

  // 4) Tips: match-/grupp-/bracket-tips per bot, i rätt rum. Upsert på respektive PK så en
  //    omkörning inte dubblar. user_id sätts här (planen bär tomt user_id by design).
  for (const pred of plan.predictions) {
    const userId = mustUserId(userIdByKey, pred.personaKey);
    const roomId = resolveRoomId(pred.target, roomIdByIndex);
    await upsertPredictions(client, roomId, userId, pred);
  }

  // 5) LIV-LAGRET (T82 del 2): emoji-reaktioner + SPARSAMMA kommentarer, i rätt rum.
  await upsertReactions(client, plan, userIdByKey, roomIdByIndex);
  await upsertComments(client, plan, userIdByKey, roomIdByIndex);
}

/**
 * Emoji-reaktioner: en rad per planerad reaktion. Idempotent via PK:n
 * (room_id, user_id, match_id) , en omkörning byter bara emojin på samma rad, dubblar inte
 * (samma upsert-modell som klientens upsertMyReaction). user_id sätts här.
 */
async function upsertReactions(
  client: AdminClient,
  plan: SeedPlan,
  userIdByKey: ReadonlyMap<string, string>,
  roomIdByIndex: ReadonlyMap<number, string>
): Promise<void> {
  if (plan.reactions.length === 0) {
    return;
  }
  const rows = plan.reactions.map((r) => ({
    room_id: resolveRoomId(r.target, roomIdByIndex),
    user_id: mustUserId(userIdByKey, r.personaKey),
    match_id: r.matchId,
    emoji: r.emoji,
  }));
  const { error } = await client
    .from('room_reactions')
    .upsert(rows, { onConflict: 'room_id,user_id,match_id' });
  if (error) {
    throw new Error(`[VM2026] Kunde inte skriva bot-reaktioner: ${error.message}`);
  }
}

/**
 * Kommentarer (match-trådar): en rad per planerad kommentar. room_comments har INGET
 * naturligt unik-index (en användare kan ha flera kommentarer per match), så vi gör
 * omkörningen idempotent via en DETERMINISTISK id (uuid härledd ur det stabila innehållet
 * room_id+user_id+match_id+isReply+body) och upsert på `id`. Samma plan -> samma id -> ingen
 * dubblett, och en bot kan inte råka få samma fras två gånger i samma tråd (önskad dedup).
 */
async function upsertComments(
  client: AdminClient,
  plan: SeedPlan,
  userIdByKey: ReadonlyMap<string, string>,
  roomIdByIndex: ReadonlyMap<number, string>
): Promise<void> {
  if (plan.comments.length === 0) {
    return;
  }
  const rows = plan.comments.map((c) => {
    const roomId = resolveRoomId(c.target, roomIdByIndex);
    const userId = mustUserId(userIdByKey, c.personaKey);
    return {
      id: deterministicCommentId(roomId, userId, c.matchId, c.isReply, c.body),
      room_id: roomId,
      user_id: userId,
      match_id: c.matchId,
      body: c.body,
    };
  });
  const { error } = await client.from('room_comments').upsert(rows, { onConflict: 'id' });
  if (error) {
    throw new Error(`[VM2026] Kunde inte skriva bot-kommentarer: ${error.message}`);
  }
}

/** Match-/grupp-/bracket-tips för EN bot i ETT rum (rad-idempotent via onConflict). */
async function upsertPredictions(
  client: AdminClient,
  roomId: string,
  userId: string,
  pred: SeedPlan['predictions'][number]
): Promise<void> {
  if (pred.matchPredictions.length > 0) {
    const { error } = await client.from('predictions').upsert(
      pred.matchPredictions.map((p) => ({
        room_id: roomId,
        match_id: p.matchId,
        user_id: userId,
        home_goals: p.homeGoals,
        away_goals: p.awayGoals,
      })),
      { onConflict: 'room_id,match_id,user_id' }
    );
    if (error) {
      throw new Error(
        `[VM2026] Kunde inte skriva match-tips (${pred.personaKey}): ${error.message}`
      );
    }
  }
  if (pred.groupPredictions.length > 0) {
    const { error } = await client.from('group_predictions').upsert(
      pred.groupPredictions.map((p) => ({
        room_id: roomId,
        group_id: p.groupId,
        user_id: userId,
        winner_team_id: p.winnerTeamId,
        runner_up_team_id: p.runnerUpTeamId,
      })),
      { onConflict: 'room_id,group_id,user_id' }
    );
    if (error) {
      throw new Error(
        `[VM2026] Kunde inte skriva grupp-tips (${pred.personaKey}): ${error.message}`
      );
    }
  }
  if (pred.bracketPredictions.length > 0) {
    const { error } = await client.from('bracket_predictions').upsert(
      pred.bracketPredictions.map((p) => ({
        room_id: roomId,
        slot_id: p.slotId,
        user_id: userId,
        advancing_team_id: p.advancingTeamId,
      })),
      { onConflict: 'room_id,slot_id,user_id' }
    );
    if (error) {
      throw new Error(
        `[VM2026] Kunde inte skriva bracket-tips (${pred.personaKey}): ${error.message}`
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * Små exekverings-hjälpare (rena nog att läsas snabbt).
 * ------------------------------------------------------------------ */

/** Persona-nyckel -> e-post-säker slug (a-z0-9 + bindestreck). */
function slugifyKey(key: string): string {
  return key.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

/**
 * DETERMINISTISK kommentar-id (uuid v5-stil, SHA-1 över ett namespace + stabilt innehåll).
 * room_comments saknar ett naturligt unik-index, så detta gör en omkörning idempotent:
 * samma plan -> samma id -> upsert byter raden i stället för att skapa en dubblett. Format-
 * korrekt uuid (version-nibble 5, variant-bitar satta) så DB:ns uuid-kolumn accepterar den.
 */
function deterministicCommentId(
  roomId: string,
  userId: string,
  matchId: string,
  isReply: boolean,
  body: string
): string {
  // Fast namespace (en slumpad uuid, konstant) + det stabila innehållet. SHA-1 -> 16 byte.
  const namespace = 'a3f1c2d4-5b6e-7f80-91a2-b3c4d5e6f708';
  const hash = createHash('sha1')
    .update(namespace)
    .update(`${roomId}|${userId}|${matchId}|${isReply ? 'r' : 'c'}|${body}`)
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122-variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Den första medlemmens persona-nyckel i ett nytt rum (skaparen). */
function firstMembershipKeyForNewRoom(plan: SeedPlan, roomIndex: number): string | null {
  const m = plan.memberships.find(
    (mem) => mem.target.kind === 'new' && mem.target.roomIndex === roomIndex
  );
  return m?.personaKey ?? null;
}

/** Lös ett medlemskaps-/tips-mål till ett riktigt rum-id. */
function resolveRoomId(
  target: PlannedMembership['target'],
  roomIdByIndex: ReadonlyMap<number, string>
): string {
  if (target.kind === 'existing') {
    return target.roomId;
  }
  const id = roomIdByIndex.get(target.roomIndex);
  if (!id) {
    throw new Error(`[VM2026] Nytt rum #${target.roomIndex} saknar ett skapat rum-id.`);
  }
  return id;
}

/** Slå upp ett bot-konto-id på persona-nyckel, fail loud om det saknas. */
function mustUserId(userIdByKey: ReadonlyMap<string, string>, key: string): string {
  const id = userIdByKey.get(key);
  if (!id) {
    throw new Error(`[VM2026] Internt fel: persona ${key} saknar ett skapat konto-id.`);
  }
  return id;
}

/* ------------------------------------------------------------------ *
 * Entry.
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  switch (mode) {
    case 'help':
      console.log(`\n${USAGE}\n`);
      return;
    case 'dry-run':
      await runDryRun();
      return;
    case 'live':
      await runLive();
      return;
    case 'teardown':
      await runTeardown();
      return;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
