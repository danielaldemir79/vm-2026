// Åskådarkapacitet per arena (T4e #149), källåkrad och värde-låst i CI.
//
// Kapaciteten är PER ARENA (16 värden), inte per match. Den BYGGS ur den committade
// gold source-filen (venue-source.txt, CAPACITIES-sektionen) via den rena parsern
// (venue-parser.ts) EN gång vid modul-laddning, så det finns EN sanning: UI:t
// (match-display.formatVenueCapacity) och testerna läser denna tabell, ingen hårdkodad
// siffra på sidan av källan. Fail-loud:ar redan vid import om källan driver (saknad/
// dubblerad/okänd arena), så en data-regression syns vid bygget, inte tyst i UI:t.
//
// VARFÖR en egen modul (inte i venue-parser.ts): parsern är medvetet REN (ren sträng in,
// map ut, inga Node-/fil-beroenden), så app-bygget typkollar den och testet kör exakt
// samma logik. Det committade ?raw-bygget av tabellen är DATA, inte logik, så det bor här.
//
// KÄLLA (gissas ALDRIG): FIFA:s officiellt tillkännagivna TURNERINGS-kapaciteter,
// Wikipedia "2026 FIFA World Cup" (venue-tabellen), hämtad 2026-06-13, korskoll-bekräftad
// mot Crypto Briefing (FIFA:s officiella figurer). Se preambeln i venue-source.txt +
// docs/decisions.md (T4e) för figur-valet (FIFA:s turnerings-tal, inte arenornas
// ordinarie max-kapacitet) och korskollen.

import venueSource from './venue-source.txt?raw';
import {
  buildVenueCapacityTable,
  parseVenueCapacities,
  type VenueCapacityTable,
} from './venue-parser';

/** Arena-sträng ("Arena, Stad, Land") -> åskådarkapacitet (VM-konfiguration). */
export const WC2026_VENUE_CAPACITIES: VenueCapacityTable = buildVenueCapacityTable(
  parseVenueCapacities(venueSource)
);
