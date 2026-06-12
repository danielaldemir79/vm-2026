// Seeda de 8 bästa TREORNA i den TIPS-härledda slutspelsbilden, UR användarens
// tippade MATCHRESULTAT i gruppspelet (T64, #118).
//
// DANIELS ÖNSKAN (issue #118): "utifrån sina tippade resultat i gruppspelet borde
// man få fram de 8 bästa 3orna. Då kan man tippa hela vägen, nu behöver man vänta."
// T51:s simulerings-vy lämnar idag treplats-slotsen ÖPPNA (grupp-tipsen bär bara
// 1:a/2:a). Men MATCH-tipsen bär hela bilden: räknar man simulerade tabeller ur
// dem kan man härleda treorna, ranka (FIFA Article 13) och seeda (Annexe C), precis
// som det riktiga trädet gör ur facit. Då blir sextondelsbilden komplett UR TIPSEN.
//
// ============================================================================
// HARD, INGEN PARALLELL SEEDNING (gissa aldrig, PRINCIPLES §4):
//   Vi ÅTERANVÄNDER exakt samma källlåsta kedja som det riktiga trädet och det
//   preliminära T56-läget:
//     - computeStandings (FIFA Article 13:s tiebreak) via deriveGroupTables,
//     - preliminaryThirdSeeding -> rankThirdPlaces (Article 13) + seedThirdPlaces
//       (Annexe C, 495 källlåsta kombinationer).
//   Ingen egen tabellräkning, ingen egen rankning, ingen egen Annexe C. Den enda
//   skillnaden mot facit-vägen är INDATA (tippade resultat i stället för riktiga),
//   inte HUR vi räknar. Källa: Regulations for the FIFA World Cup 26 (May 2026),
//   Article 13 (sid. 26-28) + Annexe C (sid. 80-97), committat i
//   fifa-knockout-rules-source.txt / third-place-table.ts.
//
// ÄRLIG GRÄNS, varför vi kräver att ALLA grupper är HELT tippade (gissa aldrig):
//   preliminaryThirdSeeding (T56) kräver att alla 12 grupper har en nuvarande
//   rank-3-rad. Det räcker INTE som ärlighets-gräns HÄR: computeStandings ger en
//   rad per lag (rank 1-4) ÄVEN för en grupp där INGA matcher tippats, via sin
//   stabila teamId-fallback (probe-bevisat: 0 tippade matcher -> ändå en rank-3-rad,
//   alfabetisk). Skulle vi bara kräva "en rank-3-rad per grupp" seedade vi alltså
//   treor ur otippade, alfabetiskt rangordnade grupper, en GISSNING presenterad som
//   facit (precis det T51/#88 förbjuder). Annexe C-seedningen behöver dessutom HELA
//   8-bästa-mängden (en kollisionsfri rad i tabellen), så en delvis-tippad bild kan
//   inte ärligt ge NÅGON av de 8 treorna. Därför är gränsen ALLT-ELLER-INGET: vi
//   seedar treorna BARA när VARJE grupp har ALLA sina gruppmatcher tippade (en
//   genuint komplett tabell ur tipsen). Saknas en enda gruppmatch i tipsen förblir
//   ALLA treplats-slots öppna (open-third), precis som idag. Detta är den enklaste
//   KORREKTA gränsen och matchar designbeslutet i issuen (dokumenterat i decisions.md
//   T64). Antalet gruppmatcher per grupp HÄRLEDS ur matchplanen (inte hårdkodat 6),
//   så gränsen följer datan om formatet någonsin ändras.
// ============================================================================

import type { GroupId, Group, Match, MatchResult } from '../../domain/types';
import { GROUP_IDS } from '../../domain/types';
import { deriveGroupTables } from '../groups/derive-group-tables';
import { preliminaryThirdSeeding } from '../../domain/bracket/preliminary-third-seeding';

/**
 * Ett tippat matchresultat: bara målen (samma form som ett MatchResult i
 * gruppspel, straffar är inte relevanta i gruppspelstabellen). Det är EXAKT formen
 * match-tips-storen bär (Prediction.homeGoals/awayGoals), så ingen översättning
 * krävs vid seamen.
 */
export interface MatchTipScore {
  homeGoals: number;
  awayGoals: number;
}

/** Resultatet av tips-treseedningen: vilken grupps tippade trea som seedas till varje match. */
export interface TipsThirdSeeding {
  /** matchId (M73..M104, bara de 8 Annexe C-matcherna) -> grupp vars tippade trea seedas dit. */
  seedingByMatchId: ReadonlyMap<string, GroupId>;
  /** Lag-id (Team.id) för den tippade trean per seedad grupp, för slot-uppslag. */
  thirdTeamIdByGroup: ReadonlyMap<GroupId, string>;
  /**
   * Är ALLA 12 grupper helt tippade (så seedningen är komplett och ärlig)? När
   * false är seedingByMatchId tom: alla treplats-slots förblir öppna (gissa aldrig).
   */
  complete: boolean;
}

/** En tom (icke-seedad) bild: används när tipsen inte är kompletta. */
const EMPTY_SEEDING: TipsThirdSeeding = {
  seedingByMatchId: new Map(),
  thirdTeamIdByGroup: new Map(),
  complete: false,
};

/**
 * Bygg en syntetisk FÄRDIGSPELAD gruppmatch ur ett match-tips. Samma mönster som
 * scenario-motorns syntheticMatch (DRY-anda): vi sätter status 'finished' + result
 * så computeStandings räknar in den. Identitet/grupp/lag tas oförändrat ur den
 * statiska matchen, bara resultatet kommer ur tipset. straffar utelämnas (gruppspel).
 */
function tippedGroupMatch(match: Match, score: MatchTipScore): Match {
  const result: MatchResult = { homeGoals: score.homeGoals, awayGoals: score.awayGoals };
  return {
    id: match.id,
    stage: 'group',
    groupId: match.groupId,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    kickoff: match.kickoff,
    venue: match.venue,
    status: 'finished',
    result,
  };
}

/**
 * Räkna hur många gruppmatcher VARJE kanonisk grupp har i matchplanen (en sanning
 * ur datan, inte hårdkodat 6). En grupp utan rad i mapen har 0 (saknas i datan).
 */
function groupMatchCounts(matches: readonly Match[]): Map<GroupId, number> {
  const counts = new Map<GroupId, number>();
  for (const match of matches) {
    if (match.stage !== 'group' || match.groupId === null) {
      continue;
    }
    counts.set(match.groupId, (counts.get(match.groupId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Är ALLA 12 grupper HELT tippade? Sant när varje kanonisk grupp (A-L) finns i
 * matchplanen OCH alla dess gruppmatcher har ett tips. Det är ärlighets-gränsen
 * för att seeda treorna (se filhuvudet): först då är tabellerna genuint kompletta
 * ur tipsen och Annexe C kan ge hela 8-bästa-mängden utan gissning.
 *
 * Vi räknar TIPPADE gruppmatcher per grupp (bara matcher som finns i matchplanen
 * OCH har ett tips) och jämför mot gruppens totala antal gruppmatcher. En grupp som
 * saknas i matchplanen (oväntat) gör hela bilden ofullständig (fail-safe: hellre
 * öppna treor än en seedning på en grupp vi inte har matcher för).
 */
function allGroupsFullyTipped(
  matches: readonly Match[],
  tipsByMatchId: ReadonlyMap<string, MatchTipScore>
): boolean {
  const totalByGroup = groupMatchCounts(matches);
  const tippedByGroup = new Map<GroupId, number>();
  for (const match of matches) {
    if (match.stage !== 'group' || match.groupId === null) {
      continue;
    }
    if (tipsByMatchId.has(match.id)) {
      tippedByGroup.set(match.groupId, (tippedByGroup.get(match.groupId) ?? 0) + 1);
    }
  }
  return GROUP_IDS.every((g) => {
    const total = totalByGroup.get(g) ?? 0;
    // En grupp utan matcher i planen (total 0) kan aldrig vara "helt tippad" på ett
    // meningsfullt sätt: behandla som ofullständig (ingen grupp att seeda en trea ur).
    return total > 0 && (tippedByGroup.get(g) ?? 0) === total;
  });
}

/**
 * Lag-id (Team.id) på rank 3 i en grupps tippade tabell, eller null. En sanning för
 * "vem är trean i grupp X ur tipsen" (den tippade tabellen), aldrig ett fruset id.
 */
function tippedThirdTeamId(
  group: GroupId,
  tablesByGroup: Map<GroupId, { standings: { teamId: string; rank: number }[] }>
): string | null {
  return tablesByGroup.get(group)?.standings.find((r) => r.rank === 3)?.teamId ?? null;
}

/**
 * Härled de 8 bästa treornas seedning UR användarens tippade matchresultat.
 *
 * @param groups        Gruppmedlemskapen (Group.teamIds -> Team.id), för tabellerna.
 * @param matches       Den statiska matchplanen (ger lag/grupp per match + totalen
 *                      gruppmatcher per grupp).
 * @param tipsByMatchId Mina tippade matchresultat (matchId -> mål hemma/borta). Bara
 *                      gruppmatcher används; slutspels-tips (om de fanns) ignoreras
 *                      av computeStandings ändå.
 * @returns             Seedningen (matchId -> grupp + trea-lag-id) NÄR alla 12
 *                      grupper är helt tippade, annars en TOM, icke-komplett bild
 *                      (alla treplats-slots förblir öppna, gissa aldrig).
 *
 * Funktionen är REN: den muterar inte sina argument och skriver aldrig (de riktiga
 * resultaten/facit rörs inte, detta är en härledd simulering ur tipsen).
 */
export function deriveTipsThirdSeeding(
  groups: readonly Group[],
  matches: readonly Match[],
  tipsByMatchId: ReadonlyMap<string, MatchTipScore>
): TipsThirdSeeding {
  // Ärlighets-grinden FÖRST: utan ett komplett tipp-set seedar vi ingen trea (alla
  // treplats-slots öppna), precis som T51 idag. Billig koll, undviker onödigt arbete.
  if (!allGroupsFullyTipped(matches, tipsByMatchId)) {
    return EMPTY_SEEDING;
  }

  // Bygg syntetiska FÄRDIGSPELADE gruppmatcher ur tipsen (bara för matcher vi har
  // ett tips på, och bara gruppmatcher), och räkna tabellerna via DEN SAMMA
  // härledningen som gruppspelsvyn (deriveGroupTables -> computeStandings, FIFA-
  // tiebreak). En sanning för tabellräkningen, ingen parallell logik.
  const syntheticMatches: Match[] = [];
  for (const match of matches) {
    if (match.stage !== 'group' || match.groupId === null) {
      continue;
    }
    const score = tipsByMatchId.get(match.id);
    if (score) {
      syntheticMatches.push(tippedGroupMatch(match, score));
    }
  }
  const tables = deriveGroupTables(groups, syntheticMatches);
  const tablesByGroup = new Map(tables.map((t) => [t.groupId, t]));

  // Seeda via den källlåsta motorn (rankThirdPlaces Article 13 + seedThirdPlaces
  // Annexe C), exakt som det riktiga + preliminära trädet. Eftersom alla 12 grupper
  // är helt tippade har varje grupp en rank-3-rad och preliminaryThirdSeeding ger en
  // komplett 8-mängd (samma all-12-täcknings-krav som den skarpa vägen).
  const seedingByMatchId = preliminaryThirdSeeding(tables);
  if (seedingByMatchId.size === 0) {
    // Defensivt: borde inte hända när alla grupper är helt tippade (12 treor finns),
    // men om motorn ändå inte kunde seeda (t.ex. en oväntat ofullständig tabell)
    // håller vi den ärliga gränsen och lämnar treplats-slotsen öppna.
    return EMPTY_SEEDING;
  }

  // Slå upp den tippade trean (Team.id) per seedad grupp, så vyn kan placera laget.
  const thirdTeamIdByGroup = new Map<GroupId, string>();
  for (const group of seedingByMatchId.values()) {
    const teamId = tippedThirdTeamId(group, tablesByGroup);
    if (teamId !== null) {
      thirdTeamIdByGroup.set(group, teamId);
    }
  }

  return { seedingByMatchId, thirdTeamIdByGroup, complete: true };
}
