// PROFIL-OBEROENDE bas-data för VM 2026:s lag (id/namn/kod/grupp + grupperna).
//
// Detta är de 48 lagen och deras grupper A-L, RÅ (FÖRE någon profil-berikning).
// Den enda anledningen att den bor i en EGEN modul, skild från teams.ts, är att
// bryta ett cirkulärt bootstrap-beroende:
//
//   teams.ts berikar varje Team med data ur den GENERERADE team-profiles.ts
//   (enrichWithProfile). Profil-generatorn (scripts/generate-team-profiles.ts) och
//   källankrings-testet (team-profiles-source.test.ts) behöver bara lag-listan
//   (id/kod/grupp) för att mappa källraderna mot lagen. Läste de teams.ts skulle
//   import:en EXEKVERA teams.ts modul-toppnivå, dvs berikningen mot
//   team-profiles.ts. Om den genererade filen saknas eller är trasig (precis det
//   läge man vill kunna REGENERERA ur) kraschar import:en med ett TypeError
//   ("Cannot read properties of undefined") FÖRE generatorn ens kört, så låset ger
//   ett import-fel i stället för det avsedda diff-felet och man kan inte återskapa
//   filen. Det är moment 22.
//
// Genom att lägga bas-listan här (UTAN import av team-profiles.ts) kan generatorn
// och testet alltid läsa lagen och regenerera profilerna från noll. teams.ts bygger
// vidare på dessa bas-objekt och berikar dem. (Mönster: en profil-oberoende bas-lista
// före berikning, samma idé som matchschemats raw-refs i match-schedule-parser.)
//
// KÄLLA för lag + grupper (gissas ALDRIG): se preambeln i teams.ts.

import type { Group, GroupId } from '../../domain/types';
import { GROUP_IDS } from '../../domain/types';
import type { TeamRef } from './team-profiles-parser';

/**
 * En rå lag-rad i lottnings-datan: fullt namn + FIFA-kod, plus ett VALFRITT kort
 * namn (`shortName`) för lag vars fulla namn är för långt för appens trånga ytor
 * (grupptabell/matchkort/slutspelsträd). Sätts bara där det behövs (default = `name`).
 */
interface RawTeam {
  name: string;
  code: string;
  /** Kort visningsnamn för trånga ytor, t.ex. "Bosnien". Default = `name`. */
  shortName?: string;
}

/**
 * De 48 lagen, grupperade A-L i lottnings-positionsordning (position 1-4).
 * Bara namn + kod (+ ev. kort namn) här (den verifierade rå-datan); id/grupp
 * härleds nedan. Definieras grupp för grupp för läsbarhet; de platta listorna
 * byggs nedan.
 */
const TEAMS_BY_GROUP: Record<GroupId, ReadonlyArray<RawTeam>> = {
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
    // Det fulla, verifierade landsnamnet (lottnings-data, lagprofilen) + ett kort
    // visningsnamn för trånga ytor: "Bosnien och Hercegovina" tryckte ihop
    // grupptabellens kolumner (T50, Daniels live-feedback). "Bosnien" är den
    // vedertagna svenska kortformen för landet. Enda laget i VM 2026:s 48 vars
    // namn är så långt att en kortform behövs; övriga ryms i de trånga ytorna.
    { name: 'Bosnien och Hercegovina', code: 'BIH', shortName: 'Bosnien' },
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
export function teamId(code: string): string {
  return code.toLowerCase();
}

/** Ett bas-lag FÖRE profil-berikning (id/namn/kod/grupp). teams.ts berikar detta. */
export interface TeamBase {
  id: string;
  name: string;
  /** Kort visningsnamn för trånga ytor (valfritt, default = name). Se Team i types.ts. */
  shortName?: string;
  code: string;
  group: GroupId;
}

/**
 * Alla 48 bas-lag (id/namn/kod/grupp) som en platt lista i A-L-ordning.
 * Gruppordningen härleds EXPLICIT ur den kanoniska `GROUP_IDS` (A-L, enda sanningen
 * för iteration, se domain/types.ts), inte ur `Object.keys` (som bara RÅKAR vara
 * insättningsordning). teams.ts berikar dessa till fullständiga Team-objekt.
 */
export const WC2026_TEAM_BASES: readonly TeamBase[] = GROUP_IDS.flatMap((group) =>
  TEAMS_BY_GROUP[group].map((t): TeamBase => {
    const base: TeamBase = { id: teamId(t.code), name: t.name, code: t.code, group };
    // Bär bara med shortName när källan satt ett (default = name via teamShortName),
    // så bas-objektet inte får ett tomt/odefinierat fält för de flesta lagen.
    if (t.shortName !== undefined) {
      base.shortName = t.shortName;
    }
    return base;
  })
);

/**
 * De 48 lagens MINIMALA referenser (id/kod/grupp) i A-L-ordning, formen
 * profil-parsern/generatorn behöver (TeamRef, en sanning för formen i
 * team-profiles-parser.ts). Profil-OBEROENDE: detta är ankaret som låter
 * generatorn + källankrings-testet köra även om team-profiles.ts saknas/är trasig.
 */
export const WC2026_TEAM_REFS: readonly TeamRef[] = WC2026_TEAM_BASES.map(
  (t): TeamRef => ({ id: t.id, code: t.code, group: t.group })
);

/**
 * De 12 grupperna med sina lag-id i lottnings-positionsordning (position 1-4).
 * Refererar lag-id, inte inbäddade objekt (en sanning per lag, SPEC §6).
 * Grupp-ordningen härleds explicit ur `GROUP_IDS` (A-L), inte objekt-nyckelordning.
 */
export const WC2026_GROUPS: Group[] = GROUP_IDS.map(
  (group): Group => ({
    id: group,
    teamIds: TEAMS_BY_GROUP[group].map((t) => teamId(t.code)),
  })
);
