// Generator för VM 2026:s arena-kapaciteter -> src/data/wc2026/venue-capacities.ts.
//
// VARFÖR ett generator-skript och inte ?raw-parsning vid runtime: kapacitets-tabellen
// används i UI:t (match-display.formatVenueCapacity -> MatchCard). Om venue-capacities.ts
// importerade gold source (venue-source.txt) med Vites `?raw` och parsade den vid
// modul-laddning, skulle HELA textfilen (277 rader, inkl. hela per-match VENUES-sektionen
// + preambeln) paketeras till klient-bundlen bara för 16 tal. I stället PARSAS källan ur
// det committade gold source-utdraget (src/data/wc2026/venue-source.txt, CAPACITIES-
// sektionen) HÄR i generatorn (Node, inte klient) via den rena parsern, och en GENERERAD,
// committad tabell emittas. Runtime importerar den förbyggda tabellen; gold source rörs
// BARA av generatorn + källånkrings-testet (?raw), aldrig i klienten. Samma mönster som
// matches.ts (scripts/generate-matches.ts) och team-profiles.ts (Copilot T4e #150, F4).
//
// KÄLLOR: se preambeln i venue-source.txt (FIFA:s officiellt tillkännagivna turnerings-
//   kapaciteter, Wikipedia "2026 FIFA World Cup", korskoll-bekräftad mot Crypto Briefing).
//
// KÖR: `npm run gen:venue-capacities [-- <käll-textfil>]`
//   Utan argument används det committade utdraget (venue-source.txt).
//   Scriptet kör via `vite-node` (följer med projektets toolchain via vitest, inget
//   extra beroende) så det körs oförändrat på projektets Node-version; CI kör Node 22.
//   Detta skript körs inte i CI/build, venue-capacities.ts är committad och VERIFIERAS
//   av venue-capacity-source.test.ts (regenerera-och-diffa via Vites `?raw`). Scriptet
//   är bara contributors väg att återskapa filen efter en käll-ändring.
//
// Parsnings-/emit-logiken bor i src/data/wc2026/venue-parser.ts (EN sanning, delad med
// testet). Detta skript är bara CLI:n: läs fil, bygg, skriv.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildVenueCapacityFile, EXPECTED_VENUE_COUNT } from '../src/data/wc2026/venue-parser.ts';

const here = dirname(fileURLToPath(import.meta.url));
const wc2026Dir = join(here, '..', 'src', 'data', 'wc2026');
const srcPath = process.argv[2] ?? join(wc2026Dir, 'venue-source.txt');
const outPath = join(wc2026Dir, 'venue-capacities.ts');

let fileContent: string;
try {
  fileContent = buildVenueCapacityFile(readFileSync(srcPath, 'utf8'));
} catch (err) {
  console.error('GENERERAR INTE (hellre stopp än fel data):');
  console.error('  ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
}

writeFileSync(outPath, fileContent);
console.log(`Skrev ${EXPECTED_VENUE_COUNT} arena-kapaciteter till ${outPath} (källa: ${srcPath})`);
