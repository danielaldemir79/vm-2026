// REN modul: bygg seed-SQL:en för match_kickoffs ur den källåkrade matchplanen.
//
// VARFÖR (anti-fusk, dataintegritet): deadline-låset (RLS på predictions) slår upp
// avsparkstider i DB-tabellen match_kickoffs. De tiderna MÅSTE vara EXAKT samma
// instant som klient-bundlens matches.ts (annars kunde en match vara "öppen" i DB
// men "stängd" i klienten, eller tvärtom). I stället för att handknappa 104 rader
// genererar vi seed-SQL:en ur matches.ts (EN sanning för tiderna) och VÄRDE-LÅSER
// den genererade migrationen mot den committade ur denna modul i CI
// (kickoff-seed.test.ts: regenerera-och-diffa). Samma källåkrings-mönster
// som matchplanen själv (docs/patterns.md, gissningskanslig-data-genereras...).
//
// REN: in = matchlistan, ut = en SQL-sträng. Ingen IO, fristående testbar. Skriptet
// (scripts/generate-kickoff-seed.ts) är bara CLI:n som läser/skriver filen.

import type { Match } from '../../domain/types';

/** Förväntat antal matcher (hela planen: 72 grupp + 32 slutspel). Fail-loud-grind. */
export const EXPECTED_KICKOFF_ROWS = 104;

/**
 * Bygg en deterministisk migration-fil som seedar match_kickoffs ur matchplanen.
 *
 * VALIDERAR före emit (fail loud, hellre stopp än fel data, PRINCIPLES §8):
 *   - rätt antal matcher (EXPECTED_KICKOFF_ROWS),
 *   - inga dubblett-id (en rad per match), och
 *   - varje kickoff är en giltig ISO-instant.
 * En `on conflict ... do update` gör seeden IDEMPOTENT: körs den om (eller efter en
 * käll-uppdaterad tid) uppdateras raden i stället för att kasta på PK-krock.
 *
 * @param matches  hela matchplanen (WC2026_MATCHES), sorteras på id för stabil emit.
 * @returns        SQL-texten för seed-migrationen (en sanning, Prettier-oberoende).
 */
export function buildKickoffSeedSql(matches: readonly Match[]): string {
  if (matches.length !== EXPECTED_KICKOFF_ROWS) {
    throw new Error(
      `[VM2026] Förväntade ${EXPECTED_KICKOFF_ROWS} matcher för kickoff-seed, fick ${matches.length}.`
    );
  }

  const seen = new Set<string>();
  // Sortera på id (stabil ordning oavsett matchlistans ordning) så den genererade
  // filen är deterministisk och regenerera-och-diffa-låset håller.
  const sorted = [...matches].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const rows: string[] = [];
  for (const m of sorted) {
    if (seen.has(m.id)) {
      throw new Error(`[VM2026] Dubblett-match_id i kickoff-seed: ${m.id}.`);
    }
    seen.add(m.id);
    const kickoff = new Date(m.kickoff);
    if (Number.isNaN(kickoff.getTime())) {
      throw new Error(`[VM2026] Ogiltig kickoff för match ${m.id}: ${m.kickoff}.`);
    }
    // Normalisera till en kanonisk ISO-instant (samma form oavsett källans skrivsätt).
    rows.push(`  ('${m.id}', '${kickoff.toISOString()}')`);
  }

  return `${HEADER}insert into public.match_kickoffs (match_id, kickoff) values
${rows.join(',\n')}
on conflict (match_id) do update set kickoff = excluded.kickoff;
`;
}

// Filhuvud: säger var datan kommer ifrån + att den är genererad (gissa aldrig).
const HEADER = `-- GENERERAD FIL, redigera inte för hand. Se scripts/generate-kickoff-seed.ts.
--
-- T15 (#15): seed av match_kickoffs ur den källåkrade matchplanen
-- (src/data/wc2026/matches.ts, värde-låst mot den svenska TV-tablån). Tiderna är
-- EXAKT samma instant som klient-bundlens kickoff, så deadline-låset (RLS på
-- predictions) och klient-UI:t aldrig kan drifta isär om när en match stänger.
-- Värde-låst mot matches.ts i CI av kickoff-seed.test.ts (regenerera-och-
-- diffa). Idempotent (on conflict do update), så en körning om/efter en tid-
-- uppdatering är säker.

`;
