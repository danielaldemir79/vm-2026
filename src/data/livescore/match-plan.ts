// REN modul: bygg den KOMPAKTA matchplanen (match_id + kickoff + lag-par) ur den
// källåkrade WC2026_MATCHES. Auto-mappningen (fixture-map-resolver) behöver bara dessa
// fyra fält per match, inte hela Match-objektet, och edge-pollaren (Deno) kan inte
// importera src/, så vi GENERERAR en kompakt inbäddad plan till
// `supabase/functions/_shared/embedded-match-plan.ts` ur denna modul och VÄRDE-LÅSER
// den genererade filen mot WC2026_MATCHES i CI (match-plan.test.ts: regenerera-och-
// diffa). Samma källåkrings-mönster som kickoff-seed.ts , EN sanning för tiderna +
// lagen, ingen handknapp, ingen drift mellan klient-bundle och pollare.
//
// REN: in = matchlistan, ut = planen / en TS-modul-sträng. Ingen IO. Skriptet
// (scripts/generate-embedded-match-plan.ts) är bara CLI:n som läser/skriver filen.

import type { Match } from '../../domain/types';
import type { MatchPlanEntry } from './fixture-map-resolver';

/** Förväntat antal matcher (hela planen: 72 grupp + 32 slutspel). Fail-loud-grind. */
export const EXPECTED_MATCH_PLAN_ROWS = 104;

/**
 * Bygg den kompakta matchplanen ur WC2026_MATCHES. Validerar (fail loud, PRINCIPLES §8):
 * rätt antal matcher, inga dubblett-id, varje kickoff en giltig ISO-instant. Sorterar
 * på id för stabil, deterministisk ordning (regenerera-och-diffa-låset).
 *
 * @param matches  hela matchplanen (WC2026_MATCHES).
 */
export function buildMatchPlan(matches: readonly Match[]): MatchPlanEntry[] {
  if (matches.length !== EXPECTED_MATCH_PLAN_ROWS) {
    throw new Error(
      `[VM2026] Förväntade ${EXPECTED_MATCH_PLAN_ROWS} matcher för matchplanen, fick ${matches.length}.`
    );
  }
  const seen = new Set<string>();
  const sorted = [...matches].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted.map((m) => {
    if (seen.has(m.id)) {
      throw new Error(`[VM2026] Dubblett-match_id i matchplanen: ${m.id}.`);
    }
    seen.add(m.id);
    const kickoff = new Date(m.kickoff);
    if (Number.isNaN(kickoff.getTime())) {
      throw new Error(`[VM2026] Ogiltig kickoff för match ${m.id}: ${m.kickoff}.`);
    }
    return {
      matchId: m.id,
      // Kanonisk ISO-instant (samma form oavsett källans skrivsätt), så delta-
      // jämförelsen mot live-fixturen är stabil.
      kickoffUtc: kickoff.toISOString(),
      homeAppId: m.homeTeamId,
      awayAppId: m.awayTeamId,
    };
  });
}

/**
 * Emitta den inbäddade _shared-modulen som en TS-sträng (för edge-pollaren). Skriven
 * i projektets Prettier-stil (single quotes, 2-space indent) så emit == `prettier
 * --write` och regenerera-och-diffa-låset håller (lärdomen: emit måste matcha Prettier).
 *
 * @param matches  hela matchplanen (WC2026_MATCHES).
 */
export function emitEmbeddedMatchPlan(matches: readonly Match[]): string {
  const plan = buildMatchPlan(matches);
  const rows = plan
    .map(
      (e) =>
        `  { matchId: '${e.matchId}', kickoffUtc: '${e.kickoffUtc}', ` +
        `homeAppId: ${tsNullableString(e.homeAppId)}, awayAppId: ${tsNullableString(e.awayAppId)} },`
    )
    .join('\n');
  return `${EMBEDDED_HEADER}export const EMBEDDED_MATCH_PLAN: ReadonlyArray<MatchPlanEntry> = [
${rows}
];
`;
}

/** En sträng-literal eller `null` i emit (lag är null för oseedat slutspel). */
function tsNullableString(value: string | null): string {
  return value === null ? 'null' : `'${value}'`;
}

const EMBEDDED_HEADER = `// GENERERAD FIL, redigera inte för hand. Se scripts/generate-embedded-match-plan.ts.
//
// Den KOMPAKTA matchplanen (match_id + kickoff + app-lag-par) inbäddad i edge-
// pollaren, så auto-mappningen (resolveFixtureToMatch i livescore-core.ts) kan
// koppla en live-fixture till appens match_id UTAN att en rad seedats för hand.
// GENERERAD ur src/data/wc2026/matches.ts (EN sanning för tider + lag) och VÄRDE-
// LÅST mot den i CI (src/data/livescore/match-plan.test.ts: regenerera-och-diffa).
// Gruppmatcher har lag; slutspel M73-M104 har null lag tills seedat.

/** En kompakt schemarad (spegel av MatchPlanEntry i src/data/livescore/fixture-map-resolver.ts). */
export interface MatchPlanEntry {
  matchId: string;
  kickoffUtc: string;
  homeAppId: string | null;
  awayAppId: string | null;
}

`;
