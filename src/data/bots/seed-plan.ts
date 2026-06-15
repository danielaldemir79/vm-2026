// REN seed-PLANERARE för bot-seedningen (T82, #173). Inget I/O, deterministisk.
//
// ARKITEKTUR (testbarhet, T82-direktivet): seedningen delas i (a) DENNA rena planerare
// som tar personas + tips-generatorn + en ÖGONBLICKSBILD av befintliga rum/botar och
// returnerar en SEED-PLAN (vilka konton, rum, medlemskap, tips som ska skapas), och (b)
// en TUNN exekverings-del (scripts/seed-bots.ts) som gör I/O mot Supabase admin-API.
// All logik som är värd att testa (antal, scopning, Rhodos-uteslutning, idempotens) bor
// HÄR och testas mot fixtures, exekveringen hålls dum.
//
// RHODOS RÖRS ALDRIG (HARD): det befintliga 'Rhodos'-rummet (riktiga medlemmar) får
// aldrig hamna i planen, varken som mål för nya medlemmar eller tips. Vi utesluter det
// EXPLICIT på namn och bevisar det i testet. Samma för alla rum vi inte uttryckligen
// seedar: planeraren rör BARA de nya rummen den själv skapar + de två namngivna
// befintliga rummen ('VM 2026', 'Full Stack United').
//
// IDEMPOTENS (HARD): en andra körning får inte skapa dubbletter. Nyckeln är
// bot_accounts-registret: en persona vars konto redan finns (i snapshot.existingBotUserIds,
// matchad via en stabil persona-nyckel) hoppas över helt (inget konto, ingen medlem,
// inga tips). Persona-nyckeln är deterministisk (personaKey), så samma persona mappar
// alltid till samma redan-seedade konto.

import type { BotPersona, BotCohort } from './personas';
import { generateBotPredictions, type PredictConfig, DEFAULT_PREDICT_CONFIG } from './predict';
import type { Match, Group } from '../../domain/types';
import type { PoolFacit } from '../../features/leaderboard/derive-facit';

/* ------------------------------------------------------------------ *
 * Namngivna befintliga rum (gissas inte: matchas på NAMN vid körning).
 * ------------------------------------------------------------------ */

/** Namnet på det befintliga VM-rummet som vm2026-kohorten ska in i. */
export const VM2026_ROOM_NAME = 'VM 2026';
/** Namnet på det befintliga FSU-rummet som fsu-kohorten ska in i. */
export const FSU_ROOM_NAME = 'Full Stack United';
/** Rummet som ALDRIG får röras (riktiga medlemmar). Uteslutet explicit. */
export const PROTECTED_ROOM_NAME = 'Rhodos';

/* ------------------------------------------------------------------ *
 * Snapshot-in / plan-ut-former.
 * ------------------------------------------------------------------ */

/** En befintlig rum-rad i ögonblicksbilden (det planeraren behöver: id + namn). */
export interface ExistingRoom {
  id: string;
  name: string;
}

/** Ögonblicksbild av DB-läget planeraren planerar emot (read-only). */
export interface RoomsSnapshot {
  /** Befintliga rum (namn används för att hitta VM/FSU och utesluta Rhodos). */
  existingRooms: readonly ExistingRoom[];
  /**
   * Persona-nycklar (personaKey) vars bot-konto REDAN finns (ur bot_accounts).
   * En persona med sin nyckel här hoppas över (idempotens), inget dubblettkonto.
   */
  existingBotKeys: ReadonlySet<string>;
}

/** Ett bot-konto som ska SKAPAS (auth.users + bot_accounts-rad). */
export interface PlannedAccount {
  /** Stabil persona-nyckel (idempotens-ankare). */
  personaKey: string;
  displayName: string;
  skillTier: number;
  personality: string;
  cohort: BotCohort;
}

/** Ett NYTT rum som ska skapas (för new-room-kohorten). */
export interface PlannedRoom {
  /** Lokalt plan-index 0..N-1 (matchar persona.roomIndex), inte ett DB-id (finns ej än). */
  roomIndex: number;
  name: string;
}

/** En medlemskaps-rad som ska skapas (bot in i ett rum). */
export interface PlannedMembership {
  personaKey: string;
  displayName: string;
  /** Mål-rummet: antingen ett befintligt rum-id, eller ett nytt rums plan-index. */
  target: { kind: 'existing'; roomId: string } | { kind: 'new'; roomIndex: number };
}

/** Tips-paketet för en bot i ett rum (samma form aggregeringen tar, user_id sätts vid exekvering). */
export interface PlannedPredictions {
  personaKey: string;
  target: PlannedMembership['target'];
  matchPredictions: ReturnType<typeof generateBotPredictions>['matchPredictions'];
  groupPredictions: ReturnType<typeof generateBotPredictions>['groupPredictions'];
  bracketPredictions: ReturnType<typeof generateBotPredictions>['bracketPredictions'];
}

/** Hela seed-planen: allt exekveringen ska skapa, + en sammanfattning för dry-run. */
export interface SeedPlan {
  accounts: PlannedAccount[];
  newRooms: PlannedRoom[];
  memberships: PlannedMembership[];
  predictions: PlannedPredictions[];
  /** Persona-nycklar som hoppades över för att kontot redan fanns (idempotens). */
  skippedExisting: string[];
  summary: SeedPlanSummary;
}

/** Aggregerade siffror för dry-run-rapporten. */
export interface SeedPlanSummary {
  accountsToCreate: number;
  newRoomsToCreate: number;
  membershipsToCreate: number;
  predictionRowsToCreate: number;
  skippedExisting: number;
  byCohort: Record<BotCohort, number>;
}

/** Ingångar planeraren behöver för tips-genereringen (turneringsdata + facit). */
export interface SeedDomain {
  matches: readonly Match[];
  groups: readonly Group[];
  facit: PoolFacit;
  /** Skiktnings-config (tak m.m.). Default DEFAULT_PREDICT_CONFIG. */
  predictConfig?: PredictConfig;
}

/**
 * En stabil, deterministisk nyckel för en persona, idempotens-ankaret. Måste vara
 * SAMMA mellan körningar för samma persona (annars vore idempotensen bruten). Vi
 * använder kohort + index, som är stabila i genereringen (personas.ts).
 */
export function personaKey(persona: BotPersona): string {
  return `${persona.cohort}#${persona.index}`;
}

/* ------------------------------------------------------------------ *
 * Planeraren.
 * ------------------------------------------------------------------ */

/**
 * Bygg seed-planen ur personas + befintligt DB-läge + turneringsdata.
 *
 * Steg:
 *   1) Hitta de namngivna befintliga rummen (VM 2026, Full Stack United) i snapshot.
 *      Rhodos (+ alla andra rum) lämnas orörda, planeraren rör bara dessa två + nya.
 *   2) Filtrera bort personas vars konto redan finns (idempotens).
 *   3) Planera konton, nya rum, medlemskap och tips för de kvarvarande.
 *
 * @throws om ett namngivet mål-rum (VM/FSU) saknas i snapshot OCH dess kohort har botar
 *         att placera där (fail loud: hellre stopp än att tyst tappa en kohort).
 */
export function buildSeedPlan(
  personas: readonly BotPersona[],
  snapshot: RoomsSnapshot,
  domain: SeedDomain
): SeedPlan {
  const vm2026Room = findRoomByName(snapshot, VM2026_ROOM_NAME);
  const fsuRoom = findRoomByName(snapshot, FSU_ROOM_NAME);

  const predictConfig = domain.predictConfig ?? DEFAULT_PREDICT_CONFIG;

  const accounts: PlannedAccount[] = [];
  const memberships: PlannedMembership[] = [];
  const predictions: PlannedPredictions[] = [];
  const skippedExisting: string[] = [];
  const usedNewRoomIndices = new Set<number>();

  for (const persona of personas) {
    const key = personaKey(persona);

    // IDEMPOTENS: kontot finns redan -> hoppa över helt (inget dubblettkonto/medlem/tips).
    if (snapshot.existingBotKeys.has(key)) {
      skippedExisting.push(key);
      continue;
    }

    const target = resolveTarget(persona, vm2026Room, fsuRoom);
    if (target.kind === 'new') {
      usedNewRoomIndices.add(target.roomIndex);
    }

    accounts.push({
      personaKey: key,
      displayName: persona.displayName,
      skillTier: persona.skillTier,
      personality: persona.personality.label,
      cohort: persona.cohort,
    });
    memberships.push({ personaKey: key, displayName: persona.displayName, target });

    const preds = generateBotPredictions(
      persona,
      domain.matches,
      domain.groups,
      domain.facit,
      predictConfig
    );
    predictions.push({
      personaKey: key,
      target,
      matchPredictions: preds.matchPredictions,
      groupPredictions: preds.groupPredictions,
      bracketPredictions: preds.bracketPredictions,
    });
  }

  // Nya rum: BARA de index som faktiskt fick minst en (icke-överhoppad) bot. Namnges
  // deterministiskt och igenkännligt (men inte uppenbart "bot-rum").
  const newRooms = [...usedNewRoomIndices]
    .sort((a, b) => a - b)
    .map((roomIndex): PlannedRoom => ({ roomIndex, name: newRoomName(roomIndex) }));

  // RHODOS-VAKT (HARD, F7): bevisa på den FÄRDIGA planen att inget mål rör Rhodos id.
  // Körs sist (när alla targets finns) så den faktiskt kan utlösa om en framtida
  // ändring började mappa mot Rhodos. Se assertRhodosUntouched.
  assertRhodosUntouched(snapshot, memberships, predictions);

  return {
    accounts,
    newRooms,
    memberships,
    predictions,
    skippedExisting,
    summary: summarize(accounts, newRooms, memberships, predictions, skippedExisting),
  };
}

/* ------------------------------------------------------------------ *
 * Hjälpare (rena).
 * ------------------------------------------------------------------ */

/** Namn på ett nytt seedat rum (deterministiskt, igenkännligt men diskret). */
function newRoomName(roomIndex: number): string {
  // 1-baserat i namnet för läsbarhet ("Tipsligan 1".."Tipsligan 20").
  return `Tipsligan ${roomIndex + 1}`;
}

/** Hitta ett rum på exakt namn (trimmat) i snapshot, eller null. */
function findRoomByName(snapshot: RoomsSnapshot, name: string): ExistingRoom | null {
  return snapshot.existingRooms.find((r) => r.name.trim() === name) ?? null;
}

/**
 * RHODOS-VAKT (HARD, F7): bevisa att den FÄRDIGA planen inte rör Rhodos rum-id.
 *
 * Strukturellt KAN Rhodos inte hamna som mål (new-room skapar egna rum, vm2026/fsu
 * går till sina två namngivna rum), men en vakt ska kunna UTLÖSA om en framtida
 * ändring av misstag började mappa ett medlemskap/tips mot Rhodos. Den gamla vakten
 * jämförde `rhodos.name === VM2026_ROOM_NAME` , men `findRoomByName` matchade redan
 * på namnet 'Rhodos', så den jämförelsen var alltid falsk och vakten kunde ALDRIG
 * kasta (PRINCIPLES §8: en fail-loud som inte kan faila är teater).
 *
 * Den ÄKTA kontrollen: ta Rhodos rum-id ur snapshot:en (om Rhodos finns) och kasta
 * om något planerat 'existing'-mål (medlemskap eller tips) refererar det id:t.
 *
 * Finns Rhodos inte i snapshot:en är det en säker no-op , det finns då inget id att
 * råka peka på, och planeraren skapar bara nya rum + de två namngivna befintliga.
 */
function assertRhodosUntouched(
  snapshot: RoomsSnapshot,
  memberships: readonly PlannedMembership[],
  predictions: readonly PlannedPredictions[]
): void {
  const rhodos = findRoomByName(snapshot, PROTECTED_ROOM_NAME);
  if (rhodos === null) {
    return; // Rhodos finns inte i snapshot -> inget id att råka peka på.
  }
  const touchesRhodos = (target: PlannedMembership['target']): boolean =>
    target.kind === 'existing' && target.roomId === rhodos.id;

  if (
    memberships.some((m) => touchesRhodos(m.target)) ||
    predictions.some((p) => touchesRhodos(p.target))
  ) {
    throw new Error(
      `[VM2026] AVBRYTER: en seed-plan refererar det SKYDDADE Rhodos-rummet (${rhodos.id}). ` +
        `Detta får ALDRIG hända , granska planeraren innan någon körning.`
    );
  }
}

/**
 * Vilket rum en persona ska in i, utifrån kohort. new-room -> ett nytt rum (plan-index);
 * vm2026/fsu -> sitt befintliga namngivna rum. Fail loud om det namngivna rummet saknas
 * (hellre stopp än att tyst tappa kohorten).
 */
function resolveTarget(
  persona: BotPersona,
  vm2026Room: ExistingRoom | null,
  fsuRoom: ExistingRoom | null
): PlannedMembership['target'] {
  switch (persona.cohort) {
    case 'new-room':
      if (persona.roomIndex === null) {
        throw new Error(`[VM2026] new-room-persona #${persona.index} saknar roomIndex.`);
      }
      return { kind: 'new', roomIndex: persona.roomIndex };
    case 'vm2026':
      if (vm2026Room === null) {
        throw new Error(
          `[VM2026] Hittade inte rummet "${VM2026_ROOM_NAME}" i snapshot; kan inte placera ` +
            `vm2026-botarna. Avbryter (gissar inte vilket rum som menas).`
        );
      }
      return { kind: 'existing', roomId: vm2026Room.id };
    case 'fsu':
      if (fsuRoom === null) {
        throw new Error(
          `[VM2026] Hittade inte rummet "${FSU_ROOM_NAME}" i snapshot; kan inte placera ` +
            `fsu-botarna. Avbryter (gissar inte vilket rum som menas).`
        );
      }
      return { kind: 'existing', roomId: fsuRoom.id };
  }
}

/** Summera planen för dry-run-rapporten. */
function summarize(
  accounts: readonly PlannedAccount[],
  newRooms: readonly PlannedRoom[],
  memberships: readonly PlannedMembership[],
  predictions: readonly PlannedPredictions[],
  skippedExisting: readonly string[]
): SeedPlanSummary {
  const byCohort: Record<BotCohort, number> = { 'new-room': 0, vm2026: 0, fsu: 0 };
  for (const a of accounts) {
    byCohort[a.cohort] += 1;
  }
  const predictionRows = predictions.reduce(
    (sum, p) =>
      sum + p.matchPredictions.length + p.groupPredictions.length + p.bracketPredictions.length,
    0
  );
  return {
    accountsToCreate: accounts.length,
    newRoomsToCreate: newRooms.length,
    membershipsToCreate: memberships.length,
    predictionRowsToCreate: predictionRows,
    skippedExisting: skippedExisting.length,
    byCohort,
  };
}
