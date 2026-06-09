// Generator för VM 2026:s matchplan -> src/data/wc2026/matches.ts.
//
// VARFÖR ett generator-skript och inte handskriven data: matchplanen är 104
// matcher (72 grupp + 32 slutspel) med tider, kanaler och positions-källor, för
// felkänslig att handknappa och svår att review:a snabbt. I stället PARSAS den ur
// den committade svenska TV-tablån (src/data/wc2026/tv-schedule-source.txt) via
// den rena parsern. Datan är därmed spårbar till källan och kan REGENERERAS och
// verifieras (match-schedule-source.test.ts regenererar och diffar matches.ts mot
// källan i CI, fail loud vid skillnad). Samma mönster som T4:s Annexe C-generator.
//
// KÄLLA: Svensk TV-tablå (Daniel, 2026-06-09), ur SPEC §8:s svenska sändnings-
//   källor (svenskafans, fotbollskanalen). Tid = svensk tid (Europe/Stockholm).
//
// KÖR: `npm run gen:matches [-- <käll-textfil>]`
//   Utan argument används det committade utdraget (tv-schedule-source.txt).
//   Scriptet kör via `vite-node` (följer med projektets toolchain via vitest,
//   inget extra beroende) så det körs oförändrat på projektets Node-version; CI
//   kör Node 22. Detta skript körs inte i CI/build, matches.ts är committad och
//   VERIFIERAS av match-schedule-source.test.ts (regenerera-och-diffa via Vites
//   `?raw`). Scriptet är bara contributors väg att återskapa filen efter en
//   käll-ändring.
//
// Parsnings-/emit-logiken bor i src/data/wc2026/match-schedule-parser.ts (EN
// sanning, delad med testet). Detta skript är bara CLI:n: läs fil, bygg, skriv.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildMatchesFile,
  EXPECTED_TOTAL_MATCHES,
} from '../src/data/wc2026/match-schedule-parser.ts';
import { WC2026_TEAMS } from '../src/data/wc2026/teams.ts';

const here = dirname(fileURLToPath(import.meta.url));
const wc2026Dir = join(here, '..', 'src', 'data', 'wc2026');
const srcPath = process.argv[2] ?? join(wc2026Dir, 'tv-schedule-source.txt');
const outPath = join(wc2026Dir, 'matches.ts');

// groupOf-lookupen kommer ur teams.ts (en sanning för gruppindelningen); parsern
// dubblerar den inte. Bygg en O(1)-map id -> grupp.
const groupById = new Map(WC2026_TEAMS.map((t) => [t.id, t.group]));
const groupOf = (id: string) => groupById.get(id);

let fileContent: string;
try {
  fileContent = buildMatchesFile(readFileSync(srcPath, 'utf8'), groupOf);
} catch (err) {
  console.error('GENERERAR INTE (hellre stopp än fel data):');
  console.error('  ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
}

writeFileSync(outPath, fileContent);
console.log(`Skrev ${EXPECTED_TOTAL_MATCHES} matcher till ${outPath} (källa: ${srcPath})`);
