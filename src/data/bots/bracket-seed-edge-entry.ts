// BUNDLE-ENTRYPOINT för bot-slutspelstips-seedarens edge-funktion (Fas 3).
//
// VARFÖR EN EGEN ENTRYPOINT (samma mönster som global-leaderboard/edge-entry.ts, T90):
// edge-funktionen (Deno) kan inte importera src/, men den MÅSTE härleda "vilka slots är
// tippbara nu" med EXAKT samma testade TS-motor som appen (applyRoomResults ->
// deriveGroupTables -> deriveBracket -> selectSeedableSlots), annars driver en andra
// motor isär. scripts/generate-bot-bracket-core.ts BUNDLAR denna fil med esbuild till EN
// fristående Deno-ESM-modul (supabase/functions/_shared/bot-bracket-core.ts). Paritet
// bevisas behavioralt i bot-bracket-mirror-parity.test.ts (esbuild-bundle == src).
//
// DEEP imports (inte data-barrels): vi importerar den källåkrade WC2026-planen +
// härlednings-funktionerna direkt, så bundlen förblir ren (ingen Supabase-klient, ingen
// Deno-/import.meta-global). RoomMatchResult tas som TYP (raderas vid kompilering).

import { WC2026_TEAMS, WC2026_GROUPS } from '../wc2026/teams';
import { WC2026_MATCHES } from '../wc2026/matches';
import { deriveGroupTables } from '../../features/groups/derive-group-tables';
import { deriveBracket } from '../../features/bracket/derive-bracket';
import { applyRoomResults } from '../../features/results/apply-room-results';
import type { RoomMatchResult } from '../rooms/rooms-api';
import {
  planBotBracketSeeding,
  selectSeedableSlots,
  type BotForSeeding,
  type ExistingBracketRow,
  type BotBracketSeedPlan,
  type SeedBracketConfig,
} from './seed-bracket-slots';

/**
 * Den statiska, källåkrade turneringsplanen (lag + grupper + matcher), INBÄDDAD i bundlen.
 * EN sanning, samma som klientens fixtures. Edge-funktionen väver de officiella resultaten
 * på detta och härleder trädet, EXAKT som klienten.
 */
export const EMBEDDED_BRACKET_PLAN = {
  teams: WC2026_TEAMS,
  groups: WC2026_GROUPS,
  matches: WC2026_MATCHES,
} as const;

/** Indata edge-funktionen matar in (rådata läst ur DB + nu + config). */
export interface BracketSeedDbInput {
  /** Botarna att seeda (ur bot_accounts ⋈ room_members): konto, rum, skicklighet, nyckel. */
  bots: readonly BotForSeeding[];
  /** ALLA befintliga bracket-tips-rader (bot + icke-bot), för saknad/ogiltig + isolerings-vakt. */
  existingBracket: readonly ExistingBracketRow[];
  /** De officiella matchresultaten (official_match_results), facit-källan. */
  officialResults: readonly RoomMatchResult[];
  /** Nuet, ISO. Avgör vilka slots som ännu är otippade (now < avspark). */
  nowIso: string;
  config?: SeedBracketConfig;
}

/**
 * Härled de tippbara slottarna ur de officiella resultaten och planera bot-slot-tips.
 *
 * En sanning för hela kedjan: officiella resultat -> matchplan -> grupptabeller ->
 * slutspelsträd -> seedbara slots -> seed-plan. Detta är EXAKT samma härledning appen
 * gör för bracket-tips-vyn, så botarnas slots "öppnas" i samma stund trädet får sina
 * riktiga lag (self-triggering per runda när edge-funktionen körs återkommande).
 */
export function planBotBracketSeedingFromDb(input: BracketSeedDbInput): BotBracketSeedPlan {
  // Officiella resultat vävs på den statiska planen (samma väg som global-leaderboard +
  // klientens results-store), så grupptabeller + slutspelsträd härleds ur facit.
  const matches = applyRoomResults(EMBEDDED_BRACKET_PLAN.matches, [...input.officialResults]);
  const tables = deriveGroupTables(EMBEDDED_BRACKET_PLAN.groups, matches);
  const bracket = deriveBracket(tables, matches);
  const seedableSlots = selectSeedableSlots(
    bracket,
    EMBEDDED_BRACKET_PLAN.teams,
    matches,
    new Date(input.nowIso)
  );
  return planBotBracketSeeding({
    bots: input.bots,
    seedableSlots,
    existingBracket: input.existingBracket,
    config: input.config,
  });
}

// Sidindelad full-läsning (stabil ordning + completeness-vakt) bundlas också in, så
// edge-funktionen kör SAMMA testade loop-logik som klienten/global-leaderboard.
export { selectAllPages, DEFAULT_PAGE_SIZE } from '../select-all-pages';
export type { PageFetcher, PageRequest, PageResult } from '../select-all-pages';
export type {
  BotForSeeding,
  ExistingBracketRow,
  PlannedBracketRow,
  BotBracketSeedPlan,
  BotBracketSeedSummary,
  SeedBracketConfig,
} from './seed-bracket-slots';
export { DEFAULT_SEED_BRACKET_CONFIG } from './seed-bracket-slots';
