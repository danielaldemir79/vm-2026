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
// handoff Findings) i stället för att gissas. Lag-profil-fälten (fifaRanking,
// trivia, starPlayers, bestPlay) lämnas tomma här, de fylls av lag-profil-tasken.

import type { Group, GroupId, Team } from '../../domain/types';

/**
 * De 48 lagen, grupperade A-L i lottnings-positionsordning (position 1-4).
 * Definieras grupp för grupp för läsbarhet; den platta listan byggs nedan.
 */
const TEAMS_BY_GROUP: Record<GroupId, ReadonlyArray<{ name: string; code: string }>> = {
  // Grupp A: värdnation Mexiko på A1 (förbestämd).
  A: [
    { name: 'Mexiko', code: 'MEX' },
    { name: 'Sydafrika', code: 'RSA' },
    { name: 'Sydkorea', code: 'KOR' },
    { name: 'Tjeckien', code: 'CZE' },
  ],
  // Grupp B: värdnation Kanada på B1 (förbestämd).
  B: [
    { name: 'Kanada', code: 'CAN' },
    { name: 'Bosnien och Hercegovina', code: 'BIH' },
    { name: 'Qatar', code: 'QAT' },
    { name: 'Schweiz', code: 'SUI' },
  ],
  C: [
    { name: 'Brasilien', code: 'BRA' },
    { name: 'Marocko', code: 'MAR' },
    { name: 'Haiti', code: 'HAI' },
    { name: 'Skottland', code: 'SCO' },
  ],
  // Grupp D: värdnation USA på D1 (förbestämd).
  D: [
    { name: 'USA', code: 'USA' },
    { name: 'Paraguay', code: 'PAR' },
    { name: 'Australien', code: 'AUS' },
    { name: 'Turkiet', code: 'TUR' },
  ],
  E: [
    { name: 'Tyskland', code: 'GER' },
    { name: 'Curaçao', code: 'CUW' },
    { name: 'Elfenbenskusten', code: 'CIV' },
    { name: 'Ecuador', code: 'ECU' },
  ],
  // Grupp F: Sverige (vann playoff mars 2026, SPEC §10:s öppna fråga avgjord).
  F: [
    { name: 'Nederländerna', code: 'NED' },
    { name: 'Japan', code: 'JPN' },
    { name: 'Sverige', code: 'SWE' },
    { name: 'Tunisien', code: 'TUN' },
  ],
  G: [
    { name: 'Belgien', code: 'BEL' },
    { name: 'Egypten', code: 'EGY' },
    { name: 'Iran', code: 'IRN' },
    { name: 'Nya Zeeland', code: 'NZL' },
  ],
  H: [
    { name: 'Spanien', code: 'ESP' },
    { name: 'Kap Verde', code: 'CPV' },
    { name: 'Saudiarabien', code: 'KSA' },
    { name: 'Uruguay', code: 'URU' },
  ],
  I: [
    { name: 'Frankrike', code: 'FRA' },
    { name: 'Senegal', code: 'SEN' },
    { name: 'Irak', code: 'IRQ' },
    { name: 'Norge', code: 'NOR' },
  ],
  J: [
    { name: 'Argentina', code: 'ARG' },
    { name: 'Algeriet', code: 'ALG' },
    { name: 'Österrike', code: 'AUT' },
    { name: 'Jordanien', code: 'JOR' },
  ],
  K: [
    { name: 'Portugal', code: 'POR' },
    { name: 'DR Kongo', code: 'COD' },
    { name: 'Uzbekistan', code: 'UZB' },
    { name: 'Colombia', code: 'COL' },
  ],
  L: [
    { name: 'England', code: 'ENG' },
    { name: 'Kroatien', code: 'CRO' },
    { name: 'Ghana', code: 'GHA' },
    { name: 'Panama', code: 'PAN' },
  ],
};

/** Stabilt internt lag-id: gemen landskod (t.ex. "swe"), oberoende av visningsnamn. */
function teamId(code: string): string {
  return code.toLowerCase();
}

/**
 * Alla 48 lag som en platt, typad lista. Lag-id härleds ur landskoden (stabil
 * nyckel som matcher/tabeller refererar, SPEC §6). group sätts ur indelningen
 * ovan så Team.group och Group.teamIds garanterat stämmer överens (en sanning).
 */
export const WC2026_TEAMS: Team[] = (Object.keys(TEAMS_BY_GROUP) as GroupId[]).flatMap((group) =>
  TEAMS_BY_GROUP[group].map(
    (t): Team => ({
      id: teamId(t.code),
      name: t.name,
      code: t.code,
      group,
    })
  )
);

/**
 * De 12 grupperna med sina lag-id i lottnings-positionsordning (position 1-4).
 * Refererar Team.id, inte inbäddade objekt (en sanning per lag, SPEC §6).
 */
export const WC2026_GROUPS: Group[] = (Object.keys(TEAMS_BY_GROUP) as GroupId[]).map(
  (group): Group => ({
    id: group,
    teamIds: TEAMS_BY_GROUP[group].map((t) => teamId(t.code)),
  })
);
