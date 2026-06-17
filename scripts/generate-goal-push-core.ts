// Generator för den GENERERADE mål-push-mirror:n -> supabase/functions/_shared/
// goal-push-core.ts (T89, #182).
//
// VARFÖR (genererad, INTE hand-skriven mirror): goal-push-dispatcher (Deno) kan inte importera
// src/, men mål-detekteringen MÅSTE konsumera EXAKT samma testade måltolkning (parseEvents ->
// extractGoals, SPEC §13.3 "en sanning för mål-härledning") som skytteligan/live-topplistan,
// annars driver en andra mål-parse isär (motsägande siffror för samma match). Vi BUNDLAR
// därför den rena src-grafen (edge-entry.ts) med esbuild till EN självständig Deno-ESM-modul.
// Genererad ur src = ingen hand-drift-yta. Paritet bevisas behavioralt i
// goal-push-core-mirror-parity.test.ts (bundlar om src och jämför mot denna fil).
//
// KÖR: `npm run gen:goal-push-core`
//   Kör via `vite-node` (projektets toolchain). Körs INTE i CI/build , den committade filen
//   verifieras av mirror-parity-testet (bundlar om och jämför mot src). Skriptet är bara vägen
//   att återskapa filen efter en ändring av mål-detekterings-/preferens-/parse-koden.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'src', 'features', 'push', 'edge-entry.ts');
const outPath = join(here, '..', 'supabase', 'functions', '_shared', 'goal-push-core.ts');

// Banner: gör det OMÖJLIGT att missförstå filen som hand-redigerbar (den regenereras).
const BANNER = [
  '// GENERERAD FIL , REDIGERA INTE FÖR HAND (T89, #182).',
  '//',
  '// Detta är den BUNDLADE, rena mål-push-grafen ur src/features/push/edge-entry.ts',
  '// (parseEvents + extractGoals + goal-detection + push-preferences), emitterad av',
  '// scripts/generate-goal-push-core.ts via esbuild så goal-push-dispatcher (Deno) kan',
  '// köra EXAKT samma testade TS (samma måltolkning som skytteligan, SPEC §13.3).',
  '//',
  '// SYNK: ändras mål-detekterings-/preferens-/parse-koden i src, KÖR `npm run gen:goal-push-core`',
  '// och committa om denna fil. Paritet vaktas i goal-push-core-mirror-parity.test.ts',
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
    // Deterministisk, läsbar output (ingen minify), så en framtida regenererings-diff är
    // granskningsbar och det committade artefakten är stabilt.
    legalComments: 'none',
  });
  const code = result.outputFiles[0].text;
  writeFileSync(outPath, BANNER + code);
  console.log(`Skrev den genererade mål-push-mirror:n (${code.length} byte) till ${outPath}`);
}

main().catch((err) => {
  console.error('GENERERAR INTE (hellre stopp än fel data):');
  console.error('  ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
