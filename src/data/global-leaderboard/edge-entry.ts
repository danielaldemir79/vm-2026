// BUNDLE-ENTRYPOINT för edge-funktionens genererade scoring-mirror (T90, #183).
//
// VARFÖR EN EGEN ENTRYPOINT: edge-funktionen (Deno) kan inte importera src/, så
// scripts/generate-global-leaderboard-core.ts BUNDLAR denna fil med esbuild till EN
// självständig Deno-ESM-modul (supabase/functions/_shared/global-leaderboard-core.ts).
// Bundlingen drar in HELA den rena scoring-grafen (derivePoolFacit + buildTotalLeaderboard
// + applyRoomResults + den källåkrade statiska planen) , så edge-funktionen kör EXAKT samma
// testade TS-kod som klienten, utan en hand-skriven mirror (ingen drift-yta). Paritet bevisas
// behavioralt i global-leaderboard-mirror-parity.test.ts (esbuild-bundle == src).
//
// DEEP imports (inte data-barrel): data-barrel:n drar in Supabase-klienten; vi importerar
// den källåkrade WC2026-planen direkt, så bundlen förblir ren (ingen IO, ingen Deno-global).

import { WC2026_TEAMS, WC2026_GROUPS } from '../wc2026/teams';
import { WC2026_MATCHES } from '../wc2026/matches';
import { buildGlobalLeaderboard, type StaticPlan } from './build-global-leaderboard';
import { selectAllPages, DEFAULT_PAGE_SIZE } from '../select-all-pages';

/**
 * Den statiska, källåkrade turneringsplanen (lag + grupper + matcher) , INBÄDDAD i
 * bundlen. EN sanning, samma som klientens fixtures (de re-exporterar samma WC2026_*).
 * Edge-funktionen väver de officiella resultaten på detta och härleder facit, EXAKT som
 * klientens useLeaderboardData.
 */
export const EMBEDDED_STATIC_PLAN: StaticPlan = {
  teams: WC2026_TEAMS,
  groups: WC2026_GROUPS,
  matches: WC2026_MATCHES,
};

// Sidindelad full-läsning (stabil ordning + completeness-vakt) bundlas också in, så
// edge-funktionen kör SAMMA testade loop-logik som src , den förblir en tunn IO-wrapper.
export { buildGlobalLeaderboard, selectAllPages, DEFAULT_PAGE_SIZE };
export type { RawRoomData, SafeGlobalEntry, StaticPlan } from './build-global-leaderboard';
export type { PageFetcher, PageRequest, PageResult } from '../select-all-pages';
