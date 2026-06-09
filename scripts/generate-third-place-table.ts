// Generator för FIFA:s Annexe C-tabell -> src/domain/bracket/third-place-table.ts.
//
// VARFÖR ett generator-skript och inte handskriven data: tabellen är 495 rader
// kritisk, gissningskänslig data. Att handknappa den vore felkänsligt och omöjligt
// att review:a snabbt. I stället PARSAS den ur FIFA:s officiella regelverks-PDF
// (Regulations for the FIFA World Cup 26, Annexe C), via det committade text-
// utdraget src/domain/bracket/annexe-c-source.txt. Datan är därmed spårbar till
// källan och kan REGENERERAS och verifieras (third-place-table-source.test.ts
// regenererar och diffar tabellen mot källan i CI, fail loud vid skillnad).
//
// KÄLLA: Regulations for the FIFA World Cup 26 (May 2026), Annexe C
//   "Combinations for eight best third-placed teams", sid. 80-97.
//   https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf
//
// KÖR: `node scripts/generate-third-place-table.ts [<käll-textfil>]`
//   Utan argument används det committade utdraget (annexe-c-source.txt).
//   Käll-textfilen är resultatet av `pdftotext -layout FWC2026_regulations_EN.pdf`.
//   Node 24+ kör .ts direkt (native type stripping); ingen byggsteg behövs.
//
// Parsnings-/emit-logiken bor i src/domain/bracket/annexe-c-parser.ts (EN sanning,
// delad med testet). Detta skript är bara CLI:n: läs fil, bygg, skriv.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTableFile, EXPECTED_ROWS } from '../src/domain/bracket/annexe-c-parser.ts';

const here = dirname(fileURLToPath(import.meta.url));
const bracketDir = join(here, '..', 'src', 'domain', 'bracket');
const srcPath = process.argv[2] ?? join(bracketDir, 'annexe-c-source.txt');
const outPath = join(bracketDir, 'third-place-table.ts');

let fileContent: string;
try {
  fileContent = buildTableFile(readFileSync(srcPath, 'utf8'));
} catch (err) {
  console.error('GENERERAR INTE (hellre stopp än fel data):');
  console.error('  ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
}

writeFileSync(outPath, fileContent);
console.log(`Skrev ${EXPECTED_ROWS} rader till ${outPath} (källa: ${srcPath})`);
