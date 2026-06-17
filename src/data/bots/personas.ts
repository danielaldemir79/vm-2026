// Persona-motor för bot-seedningen (T82, #173). REN, deterministisk, inget I/O.
//
// SYFTE: generera ~240 diskreta bot-personas som ger appen liv + tävlings-tryck utan
// att toppa topplistan eller spamma. Varje persona bär allt seed-planeraren och tips-
// generatorn behöver: namn, skicklighets-skikt, personlighet och kohort/rums-placering.
//
// DETERMINISM (HARD): allt härleds ur EN seed via createRng (prng.ts). Samma seed ->
// exakt samma personas, så bygget kan testas (antal, fördelning, fsu-nicknames) och en
// dry-run alltid matchar en senare live-körning av samma seed (en sanning för planen).
//
// KOHORTER (T82-direktivet, speglar DB:ns bot_accounts_cohort_valid-check):
//   * 'new-room' : ~200 botar i 20 NYA rum, OJÄMNT fördelade (olika rumsstorlekar).
//                  De tippar ALLT (inkl. redan spelade matcher) => får poäng, sprids
//                  över hela topplistan. Bär roomIndex 0..19 (vilket nytt rum).
//   * 'vm2026'   : 35 botar i det befintliga 'VM 2026'-rummet. Tippar bara KOMMANDE
//                  matcher => börjar på 0 poäng.
//   * 'fsu'      : 5 botar i 'Full Stack United'-rummet, med COOLA SMEKNAMN (krav),
//                  aldrig vanligt namn. Tippar bara kommande => börjar på 0.
// (Rhodos-rummet rörs ALDRIG, se seed-plan.ts. Inga botar pekar dit.)

import { createRng, randomInt, pick, type Rng } from './prng';
import {
  SWEDISH_FIRST_NAMES,
  INTERNATIONAL_FIRST_NAMES,
  LAST_NAMES,
  NICKNAMES,
  FSU_NICKNAMES,
} from './name-pools';

/** Bot-kohort. Speglar bot_accounts_cohort_valid (migrationen) EXAKT (en sanning). */
export type BotCohort = 'new-room' | 'vm2026' | 'fsu';

/**
 * Personlighet styr hur "pratig"/aktiv en bot är i liv-lagret (kommentarer/reaktioner,
 * NÄSTA task). Vi definierar fälten nu så datamodellen är komplett och nästa task bara
 * tänder dem (samma "typ-stub före logik"-anda som domänens social-entiteter).
 */
export interface BotPersonality {
  /** Etikett som persisteras i bot_accounts.personality (intern seednings-data). */
  label: string;
  /** Benägenhet att kommentera (0..1). Liv-lagret (nästa task) läser den. */
  commentChance: number;
  /** Benägenhet att reagera med emoji (0..1). */
  reactionChance: number;
  /** Ton i ev. kommentarer (styr ordval i liv-lagret). */
  tone: BotTone;
}

/** Tonlägen en bot kan ha (driver liv-lagrets ordval senare). */
export type BotTone = 'peppig' | 'analytisk' | 'skämtsam' | 'lugn';

/** En färdig bot-persona, allt nedströms-lagren behöver. */
export interface BotPersona {
  /** Stabilt internt index 0..N-1 i genereringsordning (för spårbarhet/test). */
  index: number;
  /** Visningsnamnet (förnamn / förnamn efternamn / smeknamn). 1..40 tecken (DB-gräns). */
  displayName: string;
  /** Skicklighets-skikt 0..1: högre => fler rätt tips (med spridning, ingen bot toppar). */
  skillTier: number;
  personality: BotPersonality;
  cohort: BotCohort;
  /**
   * För 'new-room'-kohorten: vilket av de 20 nya rummen (0..19) boten hör till. Null
   * för 'vm2026'/'fsu' (de går till ett befintligt namngivet rum, inte ett nytt index).
   */
  roomIndex: number | null;
}

/** Konfiguration för genereringen. Default matchar T82-direktivets fördelning. */
export interface PersonaPlanConfig {
  /** Seed för determinismen. Samma seed -> samma personas. */
  seed: number;
  /** Antal NYA rum att fördela 'new-room'-botarna över (default 20). */
  newRoomCount: number;
  /** Ungefärligt antal 'new-room'-botar att fördela över de nya rummen (default 200). */
  newRoomBotCount: number;
  /** Antal 'vm2026'-botar (default 35). */
  vm2026BotCount: number;
  /** Antal 'fsu'-botar (default 5). Får COOLA smeknamn. */
  fsuBotCount: number;
}

/** T82-direktivets fördelning som förval (~240 botar totalt). */
export const DEFAULT_PERSONA_CONFIG: PersonaPlanConfig = {
  seed: 20260615,
  newRoomCount: 20,
  newRoomBotCount: 200,
  vm2026BotCount: 35,
  fsuBotCount: 5,
};

/** Tonlägen som plockas till personligheter (en sanning för listan). */
const TONES: readonly BotTone[] = ['peppig', 'analytisk', 'skämtsam', 'lugn'];

/** Max längd på ett visningsnamn (speglar DB-checkarna, fail-loud-gräns). */
const MAX_DISPLAY_NAME_LEN = 40;

/**
 * Bygg en personlighet deterministiskt. Benägenheterna sätts MÅTTLIGT (inte nära 1),
 * så liv-lagret (nästa task) inte spammar: botar ska KÄNNAS med, inte dränka rummet.
 */
function buildPersonality(rng: Rng): BotPersonality {
  const tone = pick(rng, TONES);
  // Kommentar-benägenhet hålls låg (0..0.30): de flesta botar är tysta, några pratar.
  const commentChance = roundTo(rng() * 0.3, 3);
  // Reaktioner är lättare än kommentarer, så något högre tak (0..0.50).
  const reactionChance = roundTo(rng() * 0.5, 3);
  return {
    label: `${tone}-${commentChance > 0.2 ? 'pratig' : 'sparsam'}`,
    commentChance,
    reactionChance,
    tone,
  };
}

/** Avrunda till `decimals` decimaler (stabila, läsbara persona-värden). */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Bygg ett VANLIGT visningsnamn (för-/efternamn eller smeknamn) deterministiskt.
 * Fördelning (medveten variation, inte jämn): ~40 % bara förnamn, ~35 % förnamn +
 * efternamn, ~25 % smeknamn. Förnamnen blandar svenskt och internationellt.
 */
function buildRegularName(rng: Rng): string {
  const roll = rng();
  if (roll < 0.25) {
    return pick(rng, NICKNAMES);
  }
  const firstNamePool = rng() < 0.6 ? SWEDISH_FIRST_NAMES : INTERNATIONAL_FIRST_NAMES;
  const first = pick(rng, firstNamePool);
  if (roll < 0.65) {
    return first; // bara förnamn
  }
  const name = `${first} ${pick(rng, LAST_NAMES)}`;
  // Skydd: trunkera ALDRIG tyst, men poolerna är korta nog att detta aldrig slår in.
  // Fail loud vore fel här (namnet ÄR giltigt-format), så vi faller tillbaka på bara
  // förnamnet om kombinationen mot förmodan blev för lång (bevarar DB-gränsen).
  return name.length <= MAX_DISPLAY_NAME_LEN ? name : first;
}

/**
 * Härled ett skicklighets-skikt 0..1 deterministiskt. Vi drar mot MITTEN (medel-
 * skickliga är vanligast, riktigt vassa och riktigt dåliga är få) via medelvärdet av
 * två dragningar (en enkel triangulär fördelning), så skikten inte är platt likformiga.
 * Tips-generatorns TAK (predict.ts) ser ändå till att ingen bot toppar, oavsett skikt.
 */
function buildSkillTier(rng: Rng): number {
  return roundTo((rng() + rng()) / 2, 3);
}

/**
 * Generera alla bot-personas deterministiskt ur konfigurationen.
 *
 * Ordning (stabil): först de ~200 'new-room'-botarna (fördelade över de nya rummen),
 * sedan 'vm2026', sist 'fsu'. Index 0..N-1 löper genom hela följden.
 *
 * NEW-ROOM-FÖRDELNING (OJÄMN, krav): varje 'new-room'-bot lottas till ETT av de
 * `newRoomCount` rummen via en sned vikt (lägre rumsindex får högre vikt), så
 * rummen blir olika stora i stället för jämnstora. Determinismen bevaras (samma seed
 * -> samma rums-tilldelning). Vi GARANTERAR att inget rum blir tomt (annars vore ett
 * "nytt rum" en lögn): efter lottningen får varje tomt rum en bot omflyttad dit.
 */
export function generatePersonas(config: PersonaPlanConfig = DEFAULT_PERSONA_CONFIG): BotPersona[] {
  validateConfig(config);
  const rng = createRng(config.seed);
  const personas: BotPersona[] = [];
  let index = 0;

  // 1) NEW-ROOM (~200): ojämnt över de nya rummen.
  const roomAssignments = assignRooms(rng, config.newRoomBotCount, config.newRoomCount);
  for (let i = 0; i < config.newRoomBotCount; i++) {
    personas.push({
      index: index++,
      displayName: buildRegularName(rng),
      skillTier: buildSkillTier(rng),
      personality: buildPersonality(rng),
      cohort: 'new-room',
      roomIndex: roomAssignments[i],
    });
  }

  // 2) VM2026 (35): befintligt rum, börjar på 0 poäng (tippar bara kommande).
  for (let i = 0; i < config.vm2026BotCount; i++) {
    personas.push({
      index: index++,
      displayName: buildRegularName(rng),
      skillTier: buildSkillTier(rng),
      personality: buildPersonality(rng),
      cohort: 'vm2026',
      roomIndex: null,
    });
  }

  // 3) FSU (5): COOLA SMEKNAMN, aldrig vanligt namn (krav). Plockas UTAN återläggning
  // ur FSU_NICKNAMES så de fem inte krockar (distinkta alias).
  const fsuNames = pickDistinct(rng, FSU_NICKNAMES, config.fsuBotCount);
  for (let i = 0; i < config.fsuBotCount; i++) {
    personas.push({
      index: index++,
      displayName: fsuNames[i],
      skillTier: buildSkillTier(rng),
      personality: buildPersonality(rng),
      cohort: 'fsu',
      roomIndex: null,
    });
  }

  return personas;
}

/**
 * Lotta `botCount` botar till `roomCount` rum med en SNED vikt (lägre rumsindex får
 * högre sannolikhet), så rummen blir olika stora. Garanterar att inget rum blir tomt
 * genom att i efterhand fylla varje tomt rum med en omlottad bot.
 */
function assignRooms(rng: Rng, botCount: number, roomCount: number): number[] {
  // Sned vikt: rum i får vikt (roomCount - i), så rum 0 är tyngst, rum (roomCount-1)
  // lättast. Ger en naturligt ojämn storleksfördelning utan att något rum dör.
  const weights = Array.from({ length: roomCount }, (_, i) => roomCount - i);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  const assignments: number[] = [];
  for (let i = 0; i < botCount; i++) {
    assignments.push(weightedRoom(rng, weights, totalWeight));
  }

  // Garantera icke-tomma rum: hitta tomma rum, flytta en bot från det STÖRSTA rummet
  // till varje tomt (bevarar antalet botar, bara omfördelar).
  ensureNoEmptyRooms(assignments, roomCount);
  return assignments;
}

/** Välj ett rum proportionellt mot vikterna (deterministiskt ur rng). */
function weightedRoom(rng: Rng, weights: readonly number[], totalWeight: number): number {
  let r = rng() * totalWeight;
  for (let room = 0; room < weights.length; room++) {
    r -= weights[room];
    if (r < 0) {
      return room;
    }
  }
  return weights.length - 1; // numerisk svans-säkerhet
}

/** Flytta botar så att inget rum är tomt (krav: ett "nytt rum" får inte vara tomt). */
function ensureNoEmptyRooms(assignments: number[], roomCount: number): void {
  const counts = new Array(roomCount).fill(0);
  for (const room of assignments) {
    counts[room] += 1;
  }
  for (let room = 0; room < roomCount; room++) {
    if (counts[room] > 0) {
      continue;
    }
    // Hitta det största rummet (har minst en bot att avvara) och flytta en bot hit.
    const donor = counts.indexOf(Math.max(...counts));
    const donorBotPos = assignments.indexOf(donor);
    assignments[donorBotPos] = room;
    counts[donor] -= 1;
    counts[room] += 1;
  }
}

/** Plocka `count` DISTINKTA element ur en pool (utan återläggning), deterministiskt. */
function pickDistinct<T>(rng: Rng, pool: readonly T[], count: number): T[] {
  if (count > pool.length) {
    throw new Error(
      `[VM2026] pickDistinct: kan inte plocka ${count} distinkta ur en pool på ${pool.length}.`
    );
  }
  const remaining = [...pool];
  const chosen: T[] = [];
  for (let i = 0; i < count; i++) {
    const idx = randomInt(rng, 0, remaining.length);
    chosen.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return chosen;
}

/** Fail loud på en orimlig konfiguration (negativa antal, för få rum, för få fsu-namn). */
function validateConfig(config: PersonaPlanConfig): void {
  if (config.newRoomCount < 1) {
    throw new Error(`[VM2026] newRoomCount måste vara minst 1 (var ${config.newRoomCount}).`);
  }
  if (config.newRoomBotCount < config.newRoomCount) {
    throw new Error(
      `[VM2026] newRoomBotCount (${config.newRoomBotCount}) måste vara minst newRoomCount ` +
        `(${config.newRoomCount}) annars kan inte varje rum få minst en bot.`
    );
  }
  if (config.vm2026BotCount < 0 || config.fsuBotCount < 0) {
    throw new Error('[VM2026] bot-antal kan inte vara negativa.');
  }
  if (config.fsuBotCount > FSU_NICKNAMES.length) {
    throw new Error(
      `[VM2026] fsuBotCount (${config.fsuBotCount}) överstiger antalet coola fsu-smeknamn ` +
        `(${FSU_NICKNAMES.length}); lägg till fler i FSU_NICKNAMES eller sänk antalet.`
    );
  }
}
