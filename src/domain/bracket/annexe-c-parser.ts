// Ren parser för FIFA:s Annexe C-källtext -> third-place-table.ts.
//
// EN sanning för hur det committade Annexe C-utdraget (annexe-c-source.txt) blir
// tabell-filen: både generator-skriptet (scripts/generate-third-place-table.ts,
// CLI med fil-IO) OCH källånkrings-testet (third-place-table-source.test.ts)
// importerar dessa rena funktioner. Ingen duplicerad parser, så testet kör EXAKT
// den logik genereringen kör. Inga Node-beroenden här (ren sträng in, sträng ut),
// så modulen typkollas av app-bygget och kan testas direkt.
//
// VARFÖR den här filen finns (F1, dataintegritet): det strukturella 495-testet
// vaktar bara behörighet + kollisionsfrihet, en SVAGARE invariant än den FIFA
// fastställer (exakt en rad per kombination). Genom att regenerera tabellen ur
// det committade utdraget och kräva värde-likhet låses varje rad till FIFA:s
// faktiska värde, inte bara till "en behörig form".
//
// KÄLLA (gissas ALDRIG): Regulations for the FIFA World Cup 26 (May 2026),
//   Annexe C "Combinations for eight best third-placed teams", sid. 80-97.
//   https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf

/** Annexe C:s tabellhuvud. Allt EFTER denna rad i källan är dataraderna. */
export const HEADER_RE = /Option\s+1A\s+1B\s+1D\s+1E\s+1G\s+1I\s+1K\s+1L/;

/** En datarad: rad-id (1-495) följt av åtta koder "3X" (X = grupp A-L). */
export const ROW_RE = /^(\d{1,3})\s+((?:3[A-L]\s*){8})/;

/** Antalet rader i Annexe C, C(12,8) = de 495 kombinationerna av 8 av 12 grupper. */
export const EXPECTED_ROWS = 495;

/** Rader indexerade på sitt 1-baserade rad-id; varje värde är 8 grupp-bokstäver. */
export type ParsedRows = Record<number, string[]>;

/**
 * Parsa Annexe C-källtexten till rader (rad-id -> 8 grupp-bokstäver).
 * Hoppar fram till tabellhuvudet och läser dataraderna därefter; rader som inte
 * matchar radmönstret (tomrader, sidbrytningar, "Annexes"-marginaltext) ignoreras.
 * @throws Om tabellhuvudet inte hittas (fel fil / trasig extraktion, fail loud).
 */
export function parseAnnexeC(text: string): ParsedRows {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => HEADER_RE.test(l));
  if (start === -1) {
    throw new Error('Hittade inte Annexe C-tabellhuvudet i källtexten.');
  }
  const rows: ParsedRows = {};
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

/**
 * Validera de parsade raderna STRUKTURELLT: alla 495 rad-id finns, varje rad har
 * 8 unika giltiga grupper, och inga två rader delar samma grupp-kombination.
 * Returnerar en lista med problem (tom = giltig). Detta är samma strukturella
 * invariant som det "uttömmande" testet, det räcker INTE som korrekthetsbevis
 * (därför källånkringen), men det fångar grova generator-/extraktions-fel tidigt.
 */
export function validate(rows: ParsedRows): string[] {
  const errors: string[] = [];
  const seenKeys = new Set<string>();
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
  const count = Object.keys(rows).length;
  if (count !== EXPECTED_ROWS) {
    errors.push(`Förväntade ${EXPECTED_ROWS} rader, fick ${count}.`);
  }
  if (seenKeys.size !== EXPECTED_ROWS) {
    errors.push(`Förväntade ${EXPECTED_ROWS} unika kombinationer, fick ${seenKeys.size}.`);
  }
  return errors;
}

/** Emittera tabell-kroppen (de 495 array-litteralerna) i rad-id-ordning. */
export function emitTableBody(rows: ParsedRows): string {
  const lines: string[] = [];
  for (let n = 1; n <= EXPECTED_ROWS; n++) {
    lines.push(`  [${rows[n].map((g) => `'${g}'`).join(', ')}], // ${n}`);
  }
  return lines.join('\n');
}

/**
 * Bygg HELA innehållet i third-place-table.ts ur Annexe C-källtexten (LF-radslut).
 * Parsar -> VALIDERAR -> emitterar. Vid valideringsfel KASTAS ett fel med alla
 * problem (fail loud) i stället för att returnera en halv tabell.
 * @throws Om källan inte ger 495 välformade, unika rader.
 */
export function buildTableFile(text: string): string {
  const rows = parseAnnexeC(text);
  const errors = validate(rows);
  if (errors.length > 0) {
    throw new Error('Ogiltig Annexe C-källa:\n  - ' + errors.join('\n  - '));
  }
  const body = emitTableBody(rows);
  return `// GENERERAD FIL, redigera inte för hand. Se scripts/generate-third-place-table.ts.
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
}
