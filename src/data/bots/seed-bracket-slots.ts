// REN seednings-PLANERARE för bot-SLUTSPELSTIPS (bracket_predictions), Fas 3.
//
// SYFTE: när en slutspelsrunda blir TIPPBAR (båda lagen i en slot är kända ur
// gruppspels-/match-facit) ska varje bot ha ett RIMLIGT slot-tips , ett val mellan
// slottens TVÅ faktiska lag, skicklighets-viktat (hög skill_tier väljer oftare det
// FIFA-starkare laget, låg skill_tier mer mot slumpen). Detta är slutspelets
// motsvarighet till predict.ts grupp-/match-tips, byggt på SAMMA filosofi:
//   * FIFA-ranking som styrke-signal (samma signal profil-vyn använder, se
//     team-profiles-parser.ts: "Profil-vyn använder FIFA-rankingen som styrke-signal"),
//   * skill_tier-viktad realism med ett TAK < 1 (även en vass bot missar skrällar, så
//     ingen bot blir "klärvoajant", samma motiv som predict.ts capAccuracy),
//   * DETERMINISTISK per bot + slot (createRng seedad ur en stabil nyckel), så en
//     dry-run rapporterar exakt samma plan som en senare live-körning.
//
// VARFÖR EN EGEN MODUL (inte predict.ts): predict.ts byggde slot-tips FÖRE seedningen,
// då inget slutspelslag var känt , den plockade då ett godtyckligt lag bland ALLA 48
// (en platshållare som aldrig kan ge poäng, eftersom det avancerande laget måste vara
// ett av slottens två). DENNA modul körs NÄR lagen är kända och väljer mellan de TVÅ
// riktiga lagen. Den återanvänder predict.ts-mönstren (prng, skill->sannolikhet, FIFA-
// styrka), den uppfinner ingen ny filosofi.
//
// TIPPBAR-REGELN (gissas inte, spegel av bracket-predictable-slots.ts
// selectPredictableBracket): en match-slot är seedbar när BÅDA lagen är `resolved`
// (teamsKnown) OCH slottens egen avspark inte passerat (`!locked`, now < kickoff). En
// LÅST slot seedas aldrig: efter avspark kan ett tips inte längre läggas av en riktig
// spelare (RLS nekar), så en bot får inte heller "tippa i efterhand" (det vore att
// gissa på ett känt/pågående utfall , orättvist mot riktiga spelare). Champion-slotten
// hanteras inte här (den tippas bland alla 48 och låstes vid turneringsstart).
//
// IDEMPOTENS + BOT-ISOLERING: planeraren rör BARA de botar den får in (anroparen läser
// dem ur bot_accounts), och planerar ett tips bara för en (bot, rum, slot) som SAKNAR
// ett giltigt tips. Ett redan giltigt bot-tips (ett av slottens två lag) lämnas orört
// (en omkörning ger då inga rader). Se planBotBracketSeeding.

import type { BracketState } from '../../features/bracket/derive-bracket';
import type { Team } from '../../domain/types';
import { teamCode, type TeamCode } from '../../domain/team-code';
import { createRng, type Rng } from './prng';

/** Slutspelsrundan en seedbar slot tillhör (för rapport-gruppering). */
type KnockoutStage = BracketState['matches'][number]['stage'];

/* ------------------------------------------------------------------ *
 * Konfiguration.
 * ------------------------------------------------------------------ */

/** Skiktnings-config för slot-valet. */
export interface SeedBracketConfig {
  /**
   * Sannolikheten att en bot med skill_tier 1 väljer FAVORITEN (det FIFA-starkare
   * laget). MÅSTE ligga i (0.5, 1): > 0.5 så en stark bot faktiskt lutar mot favoriten,
   * < 1 så även den vassaste boten ibland tippar skrällen (ingen bot blir perfekt,
   * samma motiv som predict.ts capAccuracy). skill_tier 0 ger alltid 0.5 (slantsing).
   */
  favoriteCap: number;
  /**
   * Skriv över ett BEFINTLIGT bot-tips som INTE är ett av slottens två lag (t.ex. ett
   * gammalt platshållar-tips bland alla 48 från den ursprungliga seedningen, som aldrig
   * kan ge poäng). true = fyll saknade OCH ersätt ogiltiga; false = fyll bara saknade.
   * Ett redan GILTIGT tips (ett av de två lagen) rörs ALDRIG, oavsett detta val.
   */
  replaceInvalid: boolean;
}

/**
 * Default: favorit-tak 0.85 (stark bot lutar tydligt mot favoriten men tippar ibland
 * skräll), och ersätt ogiltiga platshållar-tips (så botarna får RIKTIGA slot-tips som
 * kan ge poäng, inte de ursprungliga alla-48-platshållarna). Se modul-doc + decisions.md.
 */
export const DEFAULT_SEED_BRACKET_CONFIG: SeedBracketConfig = {
  favoriteCap: 0.85,
  replaceInvalid: true,
};

/* ------------------------------------------------------------------ *
 * Former in/ut.
 * ------------------------------------------------------------------ */

/** En seedbar slot: dess två lag rangordnade efter FIFA-styrka (favorit vs skräll). */
export interface SeedableSlot {
  /** slot_id = matchnumret (M73..M104), tips-nyckeln + deadline-ankaret. */
  slotId: string;
  stage: KnockoutStage;
  /** Det FIFA-starkare laget (lägre ranking-tal), som versal CODE. */
  favorite: TeamCode;
  /** Det FIFA-svagare laget, som versal CODE. */
  underdog: TeamCode;
}

/** En bot som ska seedas: dess konto, rum, skicklighet och en stabil seed-nyckel. */
export interface BotForSeeding {
  userId: string;
  roomId: string;
  /** 0..1, styr favorit-sannolikheten (samma skala som persona.skillTier). */
  skillTier: number;
  /** Stabil nyckel (t.ex. persona_key) som seedar rng:n deterministiskt per bot+slot. */
  seedKey: string;
}

/** En befintlig bracket-tips-rad (för att upptäcka saknade/ogiltiga tips). */
export interface ExistingBracketRow {
  roomId: string;
  slotId: string;
  userId: string;
  advancingTeamId: string;
}

/** En planerad bracket-tips-rad (det exekveringen ska upserta). */
export interface PlannedBracketRow {
  roomId: string;
  slotId: string;
  userId: string;
  advancingTeamId: TeamCode;
}

/** Aggregerad sammanfattning för dry-run-rapporten. */
export interface BotBracketSeedSummary {
  seedableSlots: number;
  bots: number;
  rowsToWrite: number;
  /** Saknade (bot hade ingen rad för slotten) som fylls. */
  missingFilled: number;
  /** Ogiltiga (ej ett av de två lagen) som ersätts (0 om replaceInvalid=false). */
  invalidReplaced: number;
  /** Redan giltiga (ett av de två lagen) som lämnas orörda (idempotens). */
  alreadyValid: number;
  /** Ogiltiga som LÄMNADES för att replaceInvalid=false. */
  invalidLeft: number;
  /** Antal planerade rader per slot_id (för rapport per runda). */
  bySlot: Record<string, number>;
}

/** Hela seed-planen. */
export interface BotBracketSeedPlan {
  rows: PlannedBracketRow[];
  summary: BotBracketSeedSummary;
  /** De seedbara slottarna (för rapportering: vilka rundor/lag är i spel). */
  seedableSlots: SeedableSlot[];
  /**
   * Antal befintliga bracket-rader som INTE tillhör en bot (riktiga spelare). Anroparen
   * kan jämföra före/efter en live-skrivning och fail-loud:a om den ändras (bot-isolering).
   */
  nonBotExistingCount: number;
}

/* ------------------------------------------------------------------ *
 * Slot-valet (skill-viktad favorit).
 * ------------------------------------------------------------------ */

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Välj vilket lag boten tror går vidare ur en slot. p(favorit) skalas linjärt ur
 * skill_tier: tier 0 -> 0.5 (slantsing), tier 1 -> favoriteCap. Resten av massan går
 * till skrällen, så även en stark bot tippar ibland fel (taket < 1). Deterministiskt
 * givet rng:n (anroparen seedar den per bot + slot).
 */
export function pickAdvancingTeam(
  slot: Pick<SeedableSlot, 'favorite' | 'underdog'>,
  skillTier: number,
  rng: Rng,
  config: SeedBracketConfig
): TeamCode {
  const pFavorite = 0.5 + clamp01(skillTier) * (config.favoriteCap - 0.5);
  return rng() < pFavorite ? slot.favorite : slot.underdog;
}

/** Fail loud på en orimlig config (favoriteCap måste ligga i (0.5, 1)). */
function validateConfig(config: SeedBracketConfig): void {
  if (!(config.favoriteCap > 0.5 && config.favoriteCap < 1)) {
    throw new Error(
      `[VM2026] favoriteCap (${config.favoriteCap}) måste ligga i intervallet (0.5, 1): ` +
        `> 0.5 så favoriten faktiskt favoriseras, < 1 så ingen bot blir perfekt.`
    );
  }
}

/* ------------------------------------------------------------------ *
 * Vilka slots är seedbara NU (tippbar = lag kända OCH ej låst).
 * ------------------------------------------------------------------ */

/**
 * Härled de seedbara match-slottarna ur det levande slutspelsträdet.
 *
 * Spegel av bracket-predictable-slots.ts (selectPredictableBracket): en match-slot är
 * seedbar när BÅDA lagen är `resolved` (teamsKnown) OCH slottens egen avspark inte
 * passerat (now < kickoff = `!locked`). Lagen rangordnas efter FIFA-ranking (lägre tal
 * = starkare = favorit); saknas en ranking behandlas laget som svagast, och vid lika
 * (ska inte hända, rankingen är unik) bryts oavgjort deterministiskt på code, så valet
 * är reproducerbart.
 *
 * @param bracket  Det härledda trädet (deriveBracket), ger slottarnas lag-tillstånd.
 * @param teams    Alla lag (för id -> code + FIFA-ranking).
 * @param matches  Matchplanen (för slottens avspark = deadline).
 * @param now      Nuet (injicerbart för test/determinism).
 */
export function selectSeedableSlots(
  bracket: BracketState,
  teams: readonly Team[],
  matches: readonly { id: string; kickoff: string }[],
  now: Date
): SeedableSlot[] {
  const nowMs = now.getTime();
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const kickoffById = new Map(matches.map((m) => [m.id, m.kickoff]));

  const out: SeedableSlot[] = [];
  for (const match of bracket.matches) {
    const homeKnown = match.home.resolution === 'resolved' && match.home.teamId !== null;
    const awayKnown = match.away.resolution === 'resolved' && match.away.teamId !== null;
    if (!homeKnown || !awayKnown) {
      continue; // lagen ännu inte kända -> otippbar (gissar aldrig laget)
    }
    // LÅST = avspark passerad (eller saknad avspark, fail-safe som selectPredictableBracket
    // isLocked: en slot utan känd deadline behandlas som låst -> seedas inte).
    const kickoff = kickoffById.get(match.matchId);
    const locked = kickoff === undefined || nowMs >= new Date(kickoff).getTime();
    if (locked) {
      continue;
    }
    const home = teamById.get(match.home.teamId!);
    const away = teamById.get(match.away.teamId!);
    if (home === undefined || away === undefined) {
      continue; // brutet referens-kontrakt (lag saknas i listan): hoppa, gissa inte
    }
    const [favorite, underdog] = rankByStrength(home, away);
    out.push({
      slotId: match.matchId,
      stage: match.stage,
      favorite: teamCode(favorite.code),
      underdog: teamCode(underdog.code),
    });
  }
  return out;
}

/** Rangordna två lag: starkare (lägre FIFA-ranking) först. Deterministisk tie-break på code. */
function rankByStrength(a: Team, b: Team): [Team, Team] {
  const ra = a.fifaRanking ?? Number.POSITIVE_INFINITY;
  const rb = b.fifaRanking ?? Number.POSITIVE_INFINITY;
  if (ra < rb) return [a, b];
  if (rb < ra) return [b, a];
  return a.code <= b.code ? [a, b] : [b, a];
}

/* ------------------------------------------------------------------ *
 * Planeraren.
 * ------------------------------------------------------------------ */

/** Stabil nyckel för en (bot, rum, slot)-rad i befintlig-uppslaget. */
function rowKey(roomId: string, slotId: string, userId: string): string {
  return `${roomId} ${slotId} ${userId}`;
}

/** Liten deterministisk sträng-hash (FNV-1a 32-bit) -> rng-seed per bot + slot. */
function botSlotSeed(seedKey: string, slotId: string): number {
  let hash = 0x811c9dc5;
  const value = `${seedKey}#${slotId}`;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Bygg seed-planen: för varje bot, för varje seedbar slot, planera ett slot-tips OM
 * boten saknar ett giltigt tips där.
 *
 * IDEMPOTENS: ett redan giltigt bot-tips (advancing_team_id == ett av slottens två lag)
 * lämnas orört. Ett saknat tips fylls; ett ogiltigt tips ersätts bara om
 * config.replaceInvalid (default true). En andra körning på samma läge ger inga rader.
 *
 * BOT-ISOLERING: endast `bots` planeras. Befintliga rader för icke-botar rörs aldrig och
 * räknas bara (nonBotExistingCount), så anroparen kan vakta dem före/efter en skrivning.
 * En sista invariant-kontroll bekräftar att INGEN planerad rad pekar på ett icke-bot-id.
 */
export function planBotBracketSeeding(input: {
  bots: readonly BotForSeeding[];
  seedableSlots: readonly SeedableSlot[];
  existingBracket: readonly ExistingBracketRow[];
  config?: SeedBracketConfig;
}): BotBracketSeedPlan {
  const config = input.config ?? DEFAULT_SEED_BRACKET_CONFIG;
  validateConfig(config);

  const botUserIds = new Set(input.bots.map((b) => b.userId));

  // Befintliga bot-tips per (rum, slot, user) + räkna icke-bot-rader (för isolerings-vakten).
  const existingByKey = new Map<string, string>();
  let nonBotExistingCount = 0;
  for (const row of input.existingBracket) {
    if (!botUserIds.has(row.userId)) {
      nonBotExistingCount += 1;
      continue; // icke-bot-rad: bara räkna, aldrig röra
    }
    existingByKey.set(rowKey(row.roomId, row.slotId, row.userId), row.advancingTeamId);
  }

  const rows: PlannedBracketRow[] = [];
  const bySlot: Record<string, number> = {};
  let missingFilled = 0;
  let invalidReplaced = 0;
  let alreadyValid = 0;
  let invalidLeft = 0;

  for (const bot of input.bots) {
    for (const slot of input.seedableSlots) {
      const key = rowKey(bot.roomId, slot.slotId, bot.userId);
      const existing = existingByKey.get(key);
      const valid =
        existing !== undefined && (existing === slot.favorite || existing === slot.underdog);

      if (valid) {
        alreadyValid += 1;
        continue; // giltigt tips -> orört (idempotens)
      }
      if (existing !== undefined && !config.replaceInvalid) {
        invalidLeft += 1;
        continue; // ogiltigt men vi ersätter inte (config)
      }

      const advancingTeamId = pickAdvancingTeam(
        slot,
        bot.skillTier,
        createRng(botSlotSeed(bot.seedKey, slot.slotId)),
        config
      );
      rows.push({ roomId: bot.roomId, slotId: slot.slotId, userId: bot.userId, advancingTeamId });
      bySlot[slot.slotId] = (bySlot[slot.slotId] ?? 0) + 1;
      if (existing === undefined) {
        missingFilled += 1;
      } else {
        invalidReplaced += 1;
      }
    }
  }

  // BOT-ISOLERINGS-INVARIANT (HARD): ingen planerad rad får peka på ett icke-bot-id.
  // Strukturellt omöjligt (vi itererar bara `bots`), men en explicit grind fail-loud:ar
  // om en framtida ändring bröt det , hellre stopp än en skrivning mot riktig data.
  for (const row of rows) {
    if (!botUserIds.has(row.userId)) {
      throw new Error(
        `[VM2026] AVBRYTER: seed-planen pekar på ett icke-bot-id (${row.userId}). ` +
          `Bot-seedning får ALDRIG röra riktiga spelares rader.`
      );
    }
  }

  return {
    rows,
    seedableSlots: [...input.seedableSlots],
    nonBotExistingCount,
    summary: {
      seedableSlots: input.seedableSlots.length,
      bots: input.bots.length,
      rowsToWrite: rows.length,
      missingFilled,
      invalidReplaced,
      alreadyValid,
      invalidLeft,
      bySlot,
    },
  };
}
