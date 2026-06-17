// Generator för den GENERERADE scoring-mirror:n -> supabase/functions/_shared/
// global-leaderboard-core.ts (T90, #183).
//
// VARFÖR (genererad, INTE hand-skriven mirror): edge-funktionen (Deno) kan inte importera
// src/, men den globala topplistan MÅSTE poängsätta server-side med EXAKT samma testade
// TS-motor som klienten (derivePoolFacit + buildTotalLeaderboard + applyRoomResults), annars
// driver en andra motor isär (ägarens #1-risk). Vi BUNDLAR därför den rena src-grafen
// (edge-entry.ts) med esbuild till EN självständig Deno-ESM-modul. Generad ur src = ingen
// hand-drift-yta. Paritet bevisas behavioralt i global-leaderboard-mirror-parity.test.ts.
//
// KÖR: `npm run gen:global-leaderboard-core`
//   Kör via `vite-node` (projektets toolchain). Körs INTE i CI/build , den committade
//   filen verifieras av mirror-parity-testet (bundlar om och jämför mot src). Skriptet är
//   bara vägen att återskapa filen efter en ändring av scoring-/aggregerings-koden.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'src', 'data', 'global-leaderboard', 'edge-entry.ts');
const outPath = join(here, '..', 'supabase', 'functions', '_shared', 'global-leaderboard-core.ts');

// Banner: gör det OMÖJLIGT att missförstå filen som hand-redigerbar (den regenereras).
const BANNER = [
  '// GENERERAD FIL , REDIGERA INTE FÖR HAND (T90, #183).',
  '//',
  '// Detta är den BUNDLADE, rena scoring-grafen ur src/data/global-leaderboard/edge-entry.ts',
  '// (derivePoolFacit + buildTotalLeaderboard + applyRoomResults + den källåkrade statiska',
  '// planen), emitterad av scripts/generate-global-leaderboard-core.ts via esbuild så',
  '// edge-funktionen (Deno) kan köra EXAKT samma testade TS-motor som klienten.',
  '//',
  '// SYNK: ändras scoring-/aggregerings-koden i src, KÖR `npm run gen:global-leaderboard-core`',
  '// och committa om denna fil. Paritet vaktas i global-leaderboard-mirror-parity.test.ts',
  '// (bundlar om src och jämför diskriminerande in->ut mot denna fil , divergens rödnar i CI).',
  '// @ts-nocheck , Deno-runtime, typas/lintas inte av app-grafen (eslint/tsc kör mot src/).',
  '',
  '',
].join('\n');

async function main(): Promise<void> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    // Deterministisk, läsbar output (ingen minify), så diffen i en framtida regenerering
    // är granskningsbar och det committade artefakten är stabilt.
    legalComments: 'none',
  });
  const code = result.outputFiles[0].text;
  writeFileSync(outPath, BANNER + code);
  console.log(`Skrev den genererade scoring-mirror:n (${code.length} byte) till ${outPath}`);
}

main().catch((err) => {
  console.error('GENERERAR INTE (hellre stopp än fel data):');
  console.error('  ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
