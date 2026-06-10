// Rangordna de TOLV grupptreorna och välj de 8 BÄSTA (FIFA Article 13).
//
// VM 2026-formatet: 12 gruppettor + 12 grupptvåor + de 8 BÄSTA treorna går till
// slutspel (SPEC §5). Vilka 8 av de 12 treorna som kvalificerar avgörs av en
// FÖRBESTÄMD FIFA-rangordning. Resultatet (vilka 8 GRUPPER) matas sedan in i
// seedThirdPlaces (Annexe C) för att placera dem i rätt sextondelsfinaler.
//
// REN funktion, inget I/O, ingen React. Den arbetar på de redan härledda
// grupptabellerna (computeStandings) och plockar rad 3 (rank === 3) ur varje.
//
// ============================================================================
// KÄLLA (gissas ALDRIG): Regulations for the FIFA World Cup 26 (May 2026),
//   Article 13, "The eight best-ranked teams among those finishing third",
//   sid. 27-28. Committat verbatim i fifa-knockout-rules-source.txt.
//   https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf
//
// FIFA:s ordnings-kriterier för treorna (verbatim):
//   a) greatest number of points obtained in all group matches;
//   b) goal difference resulting from all group matches;
//   c) greatest number of goals scored in all group matches;
//   d) highest team conduct score (kort/disciplin)           <- EJ beräkningsbar
//   e/f) FIFA/Coca-Cola Men's World Ranking                  <- EJ beräkningsbar
//
// VIKTIGT (mot in-grupp-ordningen i compute-standings): de tolv treorna har
// ALDRIG mött varandra (olika grupper), så det finns INGET inbördes möte att
// räkna. FIFA:s trea-ranking är därför ENBART de övergripande a-c (poäng, total
// målskillnad, totalt gjorda mål), INTE compute-standings steg 1:s inbördes a-c.
//
// UTANFÖR SCOPE (gissas INTE, samma avgränsning som compute-standings):
//   - Kriterium d (kort/disciplin): Match bär ingen kort-data.
//   - Kriterium e/f (FIFA-ranking): inte tillgänglig deterministiskt här.
// När a-c ger exakt lika faller vi tillbaka på en STABIL sortering på groupId
// (treans grupp-bokstav). Detta är UTTRYCKLIGEN inte en FIFA-tiebreak, bara en
// deterministisk stabilitetsgaranti (samma indata -> samma utdata), exakt som
// compareOverall i compute-standings. Edge-fallet (>8 treor exakt lika på a-c
// kring snittet 8/9) är osannolikt men hanteras förutsägbart i stället för
// "flaxigt", och kan skärpas om/när kort- eller ranking-data tillkommer.
// ============================================================================

import type { GroupId, GroupStanding, GroupTable } from '../types';
import { QUALIFYING_THIRDS } from './seed-third-places';

/**
 * En grupptrea: gruppens id + dess härledda tabellrad (rank === 3). Egen typ så
 * konsumenten (seedningen) får både gruppen OCH statistiken om den behövs i UI:t.
 */
export interface ThirdPlaceTeam {
  group: GroupId;
  standing: GroupStanding;
}

/**
 * Jämför två treor på FIFA Article 13:s övergripande kriterier a-c, sedan stabil
 * groupId-fallback. Returnerar < 0 om `a` ska rankas före `b`.
 *
 * a) flest poäng, b) bäst total målskillnad, c) flest totalt gjorda mål. Kort-
 * och ranking-kriterierna (d-f) är inte beräkningsbara (se filhuvudet), så den
 * sista raden är en deterministisk stabilitets-fallback, INTE en FIFA-tiebreak.
 */
function compareThirds(a: ThirdPlaceTeam, b: ThirdPlaceTeam): number {
  const sa = a.standing;
  const sb = b.standing;
  if (sa.points !== sb.points) {
    return sb.points - sa.points; // a) poäng
  }
  if (sa.goalDifference !== sb.goalDifference) {
    return sb.goalDifference - sa.goalDifference; // b) total målskillnad
  }
  if (sa.goalsFor !== sb.goalsFor) {
    return sb.goalsFor - sa.goalsFor; // c) totalt gjorda mål
  }
  // d (disciplin) + e/f (FIFA-ranking) utanför scope. Stabil groupId-fallback.
  return a.group < b.group ? -1 : a.group > b.group ? 1 : 0;
}

/**
 * Plocka ut den fullständiga listan av grupptreor (rank === 3) ur de härledda
 * grupptabellerna, sorterade enligt FIFA Article 13 (bäst trea först).
 *
 * @param tables  De härledda grupptabellerna (deriveGroupTables). En tabell utan
 *                en rank-3-rad (t.ex. en grupp med färre än 3 lag i tidiga
 *                fixtures) bidrar inte med någon trea, den hoppas över i stället
 *                för att gissa fram en.
 * @returns       Alla grupptreor, FIFA-rangordnade (kan vara färre än 12 om en
 *                grupp saknar en trea).
 */
export function rankThirdPlaces(tables: readonly GroupTable[]): ThirdPlaceTeam[] {
  const thirds: ThirdPlaceTeam[] = [];
  for (const table of tables) {
    const third = table.standings.find((row) => row.rank === 3);
    if (third) {
      thirds.push({ group: table.groupId, standing: third });
    }
  }
  return [...thirds].sort(compareThirds);
}

/**
 * Hela treplats-rankningen i ett: de FIFA-rangordnade treorna OCH vilka av dem
 * som KVALIFICERAR (de 8 bästa). Skiljt på "kvalificerade" och "övriga" så UI:t
 * kan visa både vilka som är inne och vilka som är på bubblan.
 */
export interface ThirdPlaceRanking {
  /** Alla grupptreor, FIFA-rangordnade (bäst först). */
  ranked: ThirdPlaceTeam[];
  /** De 8 bästa som kvalificerar (delmängd av `ranked`, i samma ordning). */
  qualified: ThirdPlaceTeam[];
  /**
   * Grupp-id för de 8 kvalificerade treorna (i grupp-bokstavsordning), formen
   * seedThirdPlaces (Annexe C) tar emot. `null` tills exakt 8 treor finns
   * rangordnade (gruppspelet inte klart / ofullständig data), så ingen seedning
   * sker på en gissning. Fail-safe: hellre "ännu inte avgjort" än fel seedning.
   */
  qualifyingGroups: GroupId[] | null;
}

/**
 * Rangordna grupptreorna och avgör vilka 8 som kvalificerar (FIFA Article 13).
 *
 * @param tables  De härledda grupptabellerna (alla 12 när gruppspelet är klart).
 * @returns       Rangordnade treor + de 8 kvalificerade + deras grupper (eller
 *                null om inte exakt 8 treor kunde rangordnas, t.ex. mitt i
 *                gruppspelet eller med ofullständig data).
 *
 * VARFÖR null tills 8: seedThirdPlaces KRÄVER exakt 8 unika grupper och fail-
 * loud:ar annars. Att returnera null här (i stället för en kortare lista) håller
 * "inte avgjort än" till ETT ställe och låter härledningen (derive-bracket)
 * lämna bästa-trea-slotarna i sitt "möjliga lag"-läge tills gruppspelet är klart.
 */
export function computeThirdPlaceRanking(tables: readonly GroupTable[]): ThirdPlaceRanking {
  const ranked = rankThirdPlaces(tables);
  const qualified = ranked.slice(0, QUALIFYING_THIRDS);

  // Bara en KOMPLETT rangordning (exakt 8 treor) ger en seedbar grupp-lista.
  // Färre treor (ofullständigt gruppspel) -> null, ingen seedning på en gissning.
  const qualifyingGroups =
    qualified.length === QUALIFYING_THIRDS ? [...qualified.map((t) => t.group)].sort() : null;

  return { ranked, qualified, qualifyingGroups };
}
