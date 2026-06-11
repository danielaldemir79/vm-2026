// Generator för deadline-låsets kickoff-seed -> supabase/migrations/<seed>.sql.
//
// VARFÖR (anti-fusk): RLS-deadline-låset på predictions slår upp avsparkstider i
// match_kickoffs. De tiderna måste vara EXAKT klient-bundlens (matches.ts) tider.
// I stället för 104 handknappade rader genererar vi seed-migrationen ur matches.ts
// (EN sanning) och värde-låser den i CI (kickoff-seed.test.ts). Samma
// källåkrings-mönster som matchplanen (docs/patterns.md).
//
// KÖR: `npm run gen:kickoff-seed`
//   Skriptet kör via `vite-node` (följer med projektets toolchain via vitest,
//   inget extra beroende), så det körs oförändrat på projektets Node-version.
//   Detta skript körs inte i CI/build, seed-migrationen är committad och
//   VERIFIERAS av kickoff-seed.test.ts. Skriptet är bara contributors väg
//   att återskapa filen efter en tid-ändring i matches.ts.
//
// Bygg-logiken bor i src/data/wc2026/kickoff-seed.ts (EN sanning, delad med testet).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildKickoffSeedSql, EXPECTED_KICKOFF_ROWS } from '../src/data/wc2026/kickoff-seed.ts';
import { WC2026_MATCHES } from '../src/data/wc2026/matches.ts';

const here = dirname(fileURLToPath(import.meta.url));
// Den committade seed-migrationen (versionen är låst, den ändras bara om tiderna gör det).
const outPath = join(
  here,
  '..',
  'supabase',
  'migrations',
  '20260611120300_t15_match_kickoffs_seed.sql'
);

let sql: string;
try {
  sql = buildKickoffSeedSql(WC2026_MATCHES);
} catch (err) {
  console.error('GENERERAR INTE (hellre stopp än fel data):');
  console.error('  ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
}

writeFileSync(outPath, sql);
console.log(`Skrev ${EXPECTED_KICKOFF_ROWS} kickoff-rader till ${outPath}`);
