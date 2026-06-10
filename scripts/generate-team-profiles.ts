// Generator för VM 2026:s lag-profiler -> src/data/wc2026/team-profiles.ts.
//
// VARFÖR ett generator-skript och inte handskriven data: profildatan är 48 lag x
// (FIFA-ranking + stjärnspelare + kuriosa), gissningskänslig och värd att låsa mot
// en COMMITTAD källtext med värde-likhet i CI. I stället för handknapp PARSAS den ur
// det committade källutdraget (src/data/wc2026/team-profiles-source.txt) via den
// rena parsern. Datan är därmed spårbar till källorna och kan REGENERERAS och
// verifieras (team-profiles-source.test.ts regenererar och diffar mot källan i CI,
// fail loud vid skillnad). Samma mönster som T4:s Annexe C-generator och T4b:s matchtablå.
//
// KÄLLOR: se preambeln i team-profiles-source.txt (FIFA-ranking aprilutgåvan 2026,
//   slutgiltiga trupper offentliggjorda 2026-06-02, verifierbara VM-kuriosa).
//
// KÖR: `npm run gen:team-profiles [-- <käll-textfil>]`
//   Utan argument används det committade utdraget (team-profiles-source.txt).
//   Scriptet kör via `vite-node` (följer med projektets toolchain via vitest, inget
//   extra beroende) så det körs oförändrat på projektets Node-version; CI kör Node 22.
//   Detta skript körs inte i CI/build, team-profiles.ts är committad och VERIFIERAS
//   av team-profiles-source.test.ts. Scriptet är bara contributors väg att återskapa
//   filen efter en käll-ändring.
//
// Parsnings-/emit-logiken bor i src/data/wc2026/team-profiles-parser.ts (EN sanning,
// delad med testet). Detta skript är bara CLI:n: läs fil, bygg, skriv.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildProfilesFile } from '../src/data/wc2026/team-profiles-parser.ts';
// PROFIL-OBEROENDE bas-lista: importeras direkt ur team-refs.ts, INTE teams.ts.
// teams.ts berikar lagen med team-profiles.ts vid modul-toppnivå; importeras den
// hit kraschar import:en om team-profiles.ts saknas/är trasig , exakt det läge
// generatorn ska kunna laga. team-refs.ts rör aldrig profilerna, så cykeln bryts.
import { WC2026_TEAM_REFS } from '../src/data/wc2026/team-refs.ts';

const here = dirname(fileURLToPath(import.meta.url));
const wc2026Dir = join(here, '..', 'src', 'data', 'wc2026');
const srcPath = process.argv[2] ?? join(wc2026Dir, 'team-profiles-source.txt');
const outPath = join(wc2026Dir, 'team-profiles.ts');

// Lag-listan kommer ur team-refs.ts bas-export (WC2026_TEAM_REFS): id/kod/grupp
// FÖRE profil-berikning. Avsiktligt INTE WC2026_TEAMS (teams.ts), som berikas med
// den GENERERADE team-profiles.ts , det vore ett cirkulärt bootstrap-beroende
// (generatorn kunde inte köra om utdatafilen saknades/var trasig). Bas-listan låter
// generatorn alltid återskapa team-profiles.ts från noll. Parsern dubblerar inte lagen.
const teams = WC2026_TEAM_REFS;

let fileContent: string;
try {
  fileContent = buildProfilesFile(readFileSync(srcPath, 'utf8'), teams);
} catch (err) {
  console.error('GENERERAR INTE (hellre stopp än fel data):');
  console.error('  ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
}

writeFileSync(outPath, fileContent);
console.log(`Skrev ${teams.length} lag-profiler till ${outPath} (källa: ${srcPath})`);
