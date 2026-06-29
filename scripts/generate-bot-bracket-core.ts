// Generator för den GENERERADE bot-slutspelstips-mirror:n -> supabase/functions/_shared/
// bot-bracket-core.ts (Fas 3).
//
// VARFÖR (genererad, INTE hand-skriven mirror, samma mönster som T90 global-leaderboard):
// edge-funktionen (Deno) kan inte importera src/, men bot-seedaren MÅSTE härleda "vilka
// slots är tippbara nu" + planera tipsen med EXAKT samma testade TS-motor som klienten
// (applyRoomResults + deriveBracket + selectSeedableSlots + planBotBracketSeeding). Vi
// BUNDLAR därför den rena src-grafen (bracket-seed-edge-entry.ts) med esbuild till EN
// fristående Deno-ESM-modul. Generad ur src = ingen hand-drift-yta. Paritet bevisas
// behavioralt i bot-bracket-mirror-parity.test.ts.
//
// KÖR: `npm run gen:bot-bracket-core`
//   Kör via `vite-node` (projektets toolchain). Körs INTE i CI/build , den committade
//   filen verifieras av mirror-parity-testet (bundlar om och jämför mot src). Skriptet är
//   bara vägen att återskapa filen efter en ändring av seednings-/härlednings-koden.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'src', 'data', 'bots', 'bracket-seed-edge-entry.ts');
const outPath = join(here, '..', 'supabase', 'functions', '_shared', 'bot-bracket-core.ts');

// Banner: gör det OMÖJLIGT att missförstå filen som hand-redigerbar (den regenereras).
const BANNER = [
  '// GENERERAD FIL , REDIGERA INTE FÖR HAND (Fas 3, bot-slutspelstips).',
  '//',
  '// Detta är den BUNDLADE, rena härlednings-/seednings-grafen ur',
  '// src/data/bots/bracket-seed-edge-entry.ts (applyRoomResults + deriveBracket +',
  '// selectSeedableSlots + planBotBracketSeeding + den källåkrade statiska planen),',
  '// emitterad av scripts/generate-bot-bracket-core.ts via esbuild så edge-funktionen',
  '// (Deno) kan köra EXAKT samma testade TS-motor som klienten.',
  '//',
  '// SYNK: ändras seednings-/härlednings-koden i src, KÖR `npm run gen:bot-bracket-core`',
  '// och committa om denna fil. Paritet vaktas i bot-bracket-mirror-parity.test.ts',
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
    legalComments: 'none',
  });
  const code = result.outputFiles[0].text;
  writeFileSync(outPath, BANNER + code);
  console.log(`Skrev den genererade bot-bracket-mirror:n (${code.length} byte) till ${outPath}`);
}

main().catch((err) => {
  console.error('GENERERAR INTE (hellre stopp än fel data):');
  console.error('  ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
