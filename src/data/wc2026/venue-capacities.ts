// GENERERAD FIL, redigera inte för hand. Se scripts/generate-venue-capacities.ts.
//
// VM 2026:s åskådarkapacitet per arena (16 värden), källåkrad och värde-låst i CI.
// GENERERAD ur det committade gold source-utdraget (venue-source.txt, CAPACITIES-
// sektionen) via den rena parsern (venue-parser.ts), och VÄRDE-LÅST mot källan i CI
// (venue-capacity-source.test.ts: regenerera-och-diffa + pinnade figurer + mutationstest).
//
// VARFÖR en genererad, committad tabell (inte ?raw-parsa källan vid runtime): tabellen
// används i UI:t (match-display.formatVenueCapacity -> MatchCard), så en ?raw-import av
// gold source skulle paketera HELA textfilen (277 rader, inkl. per-match VENUES-sektionen)
// till klient-bundlen bara för 16 tal. I stället importerar runtime denna förbyggda
// tabell; gold source rörs BARA av generatorn + testet (?raw), aldrig i klienten. Samma
// mönster som matches.ts/team-profiles.ts (Copilot T4e #150, F4).
//
// KÄLLA (gissas ALDRIG): FIFA:s officiellt tillkännagivna TURNERINGS-kapaciteter,
// Wikipedia "2026 FIFA World Cup" (venue-tabellen), hämtad 2026-06-13, korskoll-bekräftad
// mot Crypto Briefing (FIFA:s officiella figurer). Se preambeln i venue-source.txt +
// docs/decisions.md (T4e) för figur-valet (FIFA:s turnerings-tal, inte arenornas
// ordinarie max-kapacitet) och korskollen.

import type { VenueCapacityTable } from './venue-parser';

/** Arena-sträng ("Arena, Stad, Land") -> åskådarkapacitet (VM-konfiguration). */
export const WC2026_VENUE_CAPACITIES: VenueCapacityTable = new Map([
  ['MetLife Stadium, East Rutherford, USA', 80663],
  ['AT&T Stadium, Arlington, USA', 70649],
  ['SoFi Stadium, Inglewood, USA', 70492],
  ['Arrowhead Stadium, Kansas City, USA', 69045],
  ["Levi's Stadium, Santa Clara, USA", 68827],
  ['NRG Stadium, Houston, USA', 68777],
  ['Lincoln Financial Field, Philadelphia, USA', 68324],
  ['Mercedes-Benz Stadium, Atlanta, USA', 68239],
  ['Lumen Field, Seattle, USA', 66925],
  ['Hard Rock Stadium, Miami Gardens, USA', 64478],
  ['Gillette Stadium, Foxborough, USA', 64146],
  ['Estadio Azteca, Mexico City, Mexiko', 80824],
  ['Estadio BBVA, Guadalupe, Mexiko', 51243],
  ['Estadio Akron, Zapopan, Mexiko', 45664],
  ['BC Place, Vancouver, Kanada', 52497],
  ['BMO Field, Toronto, Kanada', 43036],
]);
