// Härled de 12 grupptabellerna ur grupper + matcher (REN funktion, inget I/O).
//
// Detta är gruppspelsvyns datakoppling i ren form: den tar gruppmedlemskapet
// och alla matcher och producerar en sorterad GroupTable per grupp via
// computeStandings (T3 + T4: FIFA-tiebreakers + steg 2-re-iteration). Tabellerna
// LAGRAS aldrig, de härleds (SPEC §6, "härledd state"), så det finns en enda
// sanning. Funktionen är ren och muterar inte sina argument, därför är "live"
// trivialt: när matchlistan i state ändras anropas funktionen om och ger nya
// tabeller (se use-group-data.ts useMemo-härledning).
//
// VARFÖR en egen modul (inte inline i komponenten): härledningen är logik utan
// React-beroende, så den är enhetstestbar fristående (derive-group-tables.test.ts)
// och komponenten blir tunn. Vi räknar INTE om tabeller själva här, vi delegerar
// till den hårt testade computeStandings (DRY, återanvänd, bygg inte om).

import type { Group, GroupTable, Match } from '../../domain/types';
import { GROUP_IDS } from '../../domain/types';
import { computeStandings } from '../../domain/standings/compute-standings';

/**
 * Beräkna en sorterad GroupTable per grupp.
 *
 * @param groups   Grupperna med sina lag-id (Group.teamIds refererar Team.id).
 * @param matches  Alla matcher. computeStandings filtrerar själv defensivt till
 *                 färdigspelade GRUPPmatcher med satt groupId och kända lag, så
 *                 en blandad/ofullständig lista (slutspel inblandat, matcher utan
 *                 resultat) ger ändå korrekta grupp-delsummor.
 * @returns        En GroupTable per inskickad grupp, i kanonisk grupp-ordning
 *                 A-L (GROUP_IDS), inte i inkommande array-ordning. Så vyn alltid
 *                 visar grupperna i samma, förutsägbara ordning oavsett hur
 *                 datakällan råkar leverera dem.
 *
 * Endast matcher som tillhör gruppen (matchande groupId) skickas till
 * computeStandings per grupp. Det är en optimering OCH en tydlighet: varje
 * grupps beräkning ser bara sina egna matcher. computeStandings skulle ändå
 * filtrera bort främmande lag, men att för-filtrera på groupId håller
 * delberäkningen liten och uppenbar.
 */
export function deriveGroupTables(
  groups: readonly Group[],
  matches: readonly Match[]
): GroupTable[] {
  // Indexera grupperna på id så vi kan iterera i kanonisk A-L-ordning oberoende
  // av inkommande ordning (en sanning för grupp-ordningen = GROUP_IDS).
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  // Gruppera matcherna på groupId EN gång (O(n)) i stället för att filtrera hela
  // matchlistan per grupp (O(n*12)). Matcher utan groupId (slutspel) hamnar inte
  // i någon hink och bidrar därför inte till någon grupptabell.
  const matchesByGroup = new Map<string, Match[]>();
  for (const match of matches) {
    if (match.groupId === null) {
      continue;
    }
    const bucket = matchesByGroup.get(match.groupId);
    if (bucket) {
      bucket.push(match);
    } else {
      matchesByGroup.set(match.groupId, [match]);
    }
  }

  const tables: GroupTable[] = [];
  for (const groupId of GROUP_IDS) {
    const group = groupsById.get(groupId);
    // Bara grupper som faktiskt finns i indatan får en tabell. En datakälla med
    // färre än 12 grupper (t.ex. tidiga fixtures) ger lika många tabeller, inte
    // tomma rader för grupper som inte finns.
    if (!group) {
      continue;
    }
    tables.push({
      groupId,
      standings: computeStandings(group.teamIds, matchesByGroup.get(groupId) ?? []),
    });
  }
  return tables;
}
