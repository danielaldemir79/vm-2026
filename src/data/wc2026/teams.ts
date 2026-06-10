// Verifierad lag- och gruppdata för VM 2026, ur FIFA:s slutspelslottning.
//
// Detta är RIKTIG, verifierad data (inte platshållare): de 48 lagen och deras
// grupper A-L enligt slutdragningen den 5 december 2025 (Kennedy Center,
// Washington D.C.). Värdnationerna lottades till förbestämda positioner:
// Mexiko A1, Kanada B1, USA D1.
//
// ============================================================================
// KÄLLA (gissas ALDRIG): FIFA:s officiella slutspelslottning, 2026-06-09:
//   - 2026 FIFA World Cup draw (Wikipedia), full gruppindelning A-L.
//     https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_draw
//   - Korskollad mot grupp-vis täckning (Sky Sports grupp C, OneFootball/UEFA
//     grupp F m.fl.) 2026-06-09. Grupp C och F bekräftade av flera källor.
// FIFA:s trebokstavskoder (code) följer FIFA:s landskods-standard.
// ============================================================================
//
// VAD SOM ÄR DATA HÄR vs VAD SOM ÄR FLAGGAT: lagnamn + grupper är verifierade.
// Den FULLSTÄNDIGA matchplanen (72 gruppmatcher med exakta avsparkstider,
// arenor och SVENSKA TV-kanaler) är INTE med här, den kräver en svensk
// sändningsrätts-källa och är medvetet flaggad som en egen data-punkt (se T4
// handoff Findings) i stället för att gissas.
//
// RÅ-DATAN (lag + grupper, FÖRE profil-berikning) bor i team-refs.ts, en
// PROFIL-OBEROENDE modul. Den här filen BERIKAR de lagen med profil-fälten.
// Varför den uppdelningen: se preambeln i team-refs.ts (bryter ett cirkulärt
// bootstrap-beroende så profil-generatorn kan köra även utan team-profiles.ts).
//
// LAG-PROFIL-FÄLTEN (T10): fifaRanking, starPlayers och trivia fylls nu ur den
// KÄLLÅNKRADE profil-tabellen (team-profiles.ts, genererad ur team-profiles-source.txt
// och värde-låst i CI). De vävs in nedan (enrichWithProfile), så Team-objekten bär
// den verifierade profildatan utan att profilerna och lagen lagras dubbelt. bestPlay
// utelämnas med flit (subjektivt utan källa, se decisions.md T10). Drift mellan
// profil-tabellen och lag-listan fail-loud:ar redan vid byggtid (buildProfileTable),
// en sanning.

import type { Team } from '../../domain/types';
import { WC2026_TEAM_BASES, type TeamBase } from './team-refs';
import { WC2026_TEAM_PROFILES } from './team-profiles';

// Grupper + de profil-oberoende referenserna är samma sanning som lagen och
// återexporteras härifrån, så konsumenter har EN data-yta (teams.ts) oförändrad.
export { WC2026_GROUPS, WC2026_TEAM_REFS } from './team-refs';

/**
 * Väv in den källånkrade profil-datan (FIFA-ranking, stjärnspelare, kuriosa) på
 * ett bas-Team. Profilerna bor i en EGEN tabell (team-profiles.ts, värde-låst mot
 * källan), och vävs in här så Team-objekten bär dem utan dubbellagring. Saknas en
 * profil för ett lag är det en data-inkonsistens som redan fail-loud:ats vid
 * profil-byggtid (buildProfileTable kräver 48/48), men vi gör en sista grind här
 * också: ett känt lag utan profil är ett internt fel (fail loud, PRINCIPLES §8),
 * inte ett tyst tomt fält. bestPlay sätts ALDRIG (utelämnat med flit, decisions.md T10).
 */
function enrichWithProfile(base: TeamBase): Team {
  const profile = WC2026_TEAM_PROFILES[base.id];
  if (profile === undefined) {
    throw new Error(
      `Lag ${base.code} (${base.id}) saknar profil i team-profiles.ts (ska aldrig hända, 48/48-täckning krävs).`
    );
  }
  return {
    ...base,
    fifaRanking: profile.fifaRanking,
    starPlayers: profile.starPlayers,
    trivia: profile.trivia,
  };
}

/**
 * Alla 48 lag som en platt, typad lista i A-L-ordning. Bas-lagen (id/namn/kod/grupp)
 * kommer ur den profil-oberoende WC2026_TEAM_BASES (team-refs.ts); här berikas de
 * med profil-fälten (T10) ur den källånkrade profil-tabellen (enrichWithProfile).
 * Lag-id härleds ur landskoden (stabil nyckel som matcher/tabeller refererar, SPEC §6).
 */
export const WC2026_TEAMS: Team[] = WC2026_TEAM_BASES.map(enrichWithProfile);
