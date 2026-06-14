// Generator för den inbäddade matchplanen -> supabase/functions/_shared/embedded-match-plan.ts.
//
// VARFÖR: edge-pollarens auto-mappning (resolveFixtureToMatch) behöver match_id +
// kickoff + app-lag-par per match för att koppla en live-fixture till appens match
// utan handseedning. Edge-funktionen (Deno) kan inte importera src/, så vi GENERERAR
// en kompakt inbäddad plan ur matches.ts (EN sanning) och värde-låser den i CI
// (src/data/livescore/match-plan.test.ts). Samma källåkrings-mönster som kickoff-seed.
//
// KÖR: `npm run gen:embedded-match-plan`
//   Kör via `vite-node` (projektets toolchain). Körs INTE i CI/build , den committade
//   filen verifieras av match-plan.test.ts. Skriptet är bara vägen att återskapa
//   filen efter en ändring av tider/lag i matches.ts.
//
// Emit-logiken bor i src/data/livescore/match-plan.ts (EN sanning, delad med testet).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  emitEmbeddedMatchPlan,
  EXPECTED_MATCH_PLAN_ROWS,
} from '../src/data/livescore/match-plan.ts';
import { WC2026_MATCHES } from '../src/data/wc2026/matches.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', 'supabase', 'functions', '_shared', 'embedded-match-plan.ts');

let ts: string;
try {
  ts = emitEmbeddedMatchPlan(WC2026_MATCHES);
} catch (err) {
  console.error('GENERERAR INTE (hellre stopp än fel data):');
  console.error('  ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
}

writeFileSync(outPath, ts);
console.log(`Skrev ${EXPECTED_MATCH_PLAN_ROWS} matchplan-rader till ${outPath}`);
