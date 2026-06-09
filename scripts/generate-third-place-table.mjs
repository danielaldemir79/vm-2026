// Generator för FIFA:s Annexe C-tabell (de 495 kombinationerna av de 8 bästa
// treorna) -> src/domain/bracket/third-place-table.ts.
//
// VARFÖR ett generator-skript och inte handskriven data: tabellen är 495 rader
// kritisk, gissningskänslig data. Att handknappa den vore felkänsligt och
// omöjligt att review:a snabbt. I stället PARSAS den ur FIFA:s officiella
// regelverks-PDF (Regulations for the FIFA World Cup 26, Annexe C), så datan är
// spårbar till källan och kan REGENERERAS och verifieras om PDF:en uppdateras.
//
// KÄLLA: Regulations for the FIFA World Cup 26 (May 2026), Annexe C
//   "Combinations for eight best third-placed teams", sid. 80-97.
//   https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf
//
// Annexe C:s tabellhuvud är "Option 1A 1B 1D 1E 1G 1I 1K 1L": varje rad ger,
// för EN kombination av 8 kvalificerade treor, vilken trea (3X) som möter
// gruppvinnaren i respektive kolumn (1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L). De 8
// värdena i en rad ÄR exakt de 8 grupper vars trea gick vidare, så raden är
// både nyckeln (vilka 8 grupper) och tilldelningen (vem möter vem).
//
// KÖR: `node scripts/generate-third-place-table.mjs <sökväg-till-pdftotext-output>`
// där argumentet är resultatet av `pdftotext -layout FWC2026_regulations_EN.pdf`.
// Skriptet committas så HÄRLEDNINGEN är dokumenterad; den genererade .ts-filen
// committas också (den är det datalager koden faktiskt importerar).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HEADER_RE = /Option\s+1A\s+1B\s+1D\s+1E\s+1G\s+1I\s+1K\s+1L/;
const ROW_RE = /^(\d{1,3})\s+((?:3[A-L]\s*){8})/;
const EXPECTED_ROWS = 495; // C(12,8)

function parseAnnexeC(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => HEADER_RE.test(l));
  if (start === -1) {
    throw new Error('Hittade inte Annexe C-tabellhuvudet i källtexten.');
  }
  const rows = {};
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].trim().match(ROW_RE);
    if (!m) continue;
    const idx = Number(m[1]);
    const groups = m[2]
      .trim()
      .split(/\s+/)
      .map((code) => code[1]);
    if (groups.length === 8) rows[idx] = groups;
  }
  return rows;
}

function validate(rows) {
  const errors = [];
  const seenKeys = new Set();
  for (let n = 1; n <= EXPECTED_ROWS; n++) {
    const r = rows[n];
    if (!r) {
      errors.push(`Rad ${n} saknas.`);
      continue;
    }
    const set = new Set(r);
    if (set.size !== 8) errors.push(`Rad ${n} har dubbletter: ${r.join('')}`);
    if (r.some((g) => !'ABCDEFGHIJKL'.includes(g))) {
      errors.push(`Rad ${n} har en grupp utanför A-L: ${r.join('')}`);
    }
    const key = [...r].sort().join('');
    if (seenKeys.has(key)) errors.push(`Rad ${n}: dubbel grupp-kombination ${key}`);
    seenKeys.add(key);
  }
  if (Object.keys(rows).length !== EXPECTED_ROWS) {
    errors.push(`Förväntade ${EXPECTED_ROWS} rader, fick ${Object.keys(rows).length}.`);
  }
  if (seenKeys.size !== EXPECTED_ROWS) {
    errors.push(`Förväntade ${EXPECTED_ROWS} unika kombinationer, fick ${seenKeys.size}.`);
  }
  return errors;
}

function emit(rows) {
  const lines = [];
  for (let n = 1; n <= EXPECTED_ROWS; n++) {
    lines.push(`  [${rows[n].map((g) => `'${g}'`).join(', ')}], // ${n}`);
  }
  return lines.join('\n');
}

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = process.argv[2];
if (!srcPath) {
  console.error('Användning: node generate-third-place-table.mjs <pdftotext-output.txt>');
  process.exit(1);
}

const text = readFileSync(srcPath, 'utf8');
const rows = parseAnnexeC(text);
const errors = validate(rows);
if (errors.length > 0) {
  console.error('VALIDERING MISSLYCKADES (genererar INTE, hellre stopp än fel data):');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

const body = emit(rows);
const fileHeader = `// GENERERAD FIL, redigera inte för hand. Se scripts/generate-third-place-table.mjs.
//
// FIFA:s Annexe C-tabell: de 495 kombinationerna av de 8 bästa treorna och
// vilken trea (3X) som möter vilken gruppvinnare i sextondelsfinalerna.
//
// KÄLLA (gissas ALDRIG): Regulations for the FIFA World Cup 26 (May 2026),
//   Annexe C "Combinations for eight best third-placed teams", sid. 80-97.
//   https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf
//
// Kolumnordningen följer Annexe C:s tabellhuvud "Option 1A 1B 1D 1E 1G 1I 1K 1L":
// rad[i] ger gruppen vars trea möter gruppvinnaren i kolumn i, där kolumnerna är
// [1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L]. Vilken sextondelsfinal varje vinnare spelar
// (M79/M85/M81/M74/M82/M77/M87/M80) definieras i bracket-structure.ts. De 8
// värdena i en rad ÄR exakt de 8 grupper vars trea kvalificerade sig, så raden
// fungerar både som nyckel (vilka 8 grupper) och som tilldelning.

import type { GroupId } from '../types';

/** Annexe C:s kolumnordning: vilka gruppvinnare som möter en trea, i tabellordning. */
export const THIRD_PLACE_COLUMN_WINNERS = ['A', 'B', 'D', 'E', 'G', 'I', 'K', 'L'] as const;

/**
 * En rad ur Annexe C: 8 grupp-id i kolumnordning (THIRD_PLACE_COLUMN_WINNERS).
 * rad[i] = gruppen vars trea möter gruppvinnaren i kolumn i.
 */
export type ThirdPlaceRow = readonly [
  GroupId,
  GroupId,
  GroupId,
  GroupId,
  GroupId,
  GroupId,
  GroupId,
  GroupId,
];

/** Alla 495 rader ur Annexe C (rad-index 1-495 i kommentar, 0-baserat i arrayen). */
export const THIRD_PLACE_TABLE: readonly ThirdPlaceRow[] = [
${body}
];
`;

const outPath = join(here, '..', 'src', 'domain', 'bracket', 'third-place-table.ts');
writeFileSync(outPath, fileHeader);
console.log(`Skrev ${EXPECTED_ROWS} rader till ${outPath}`);
