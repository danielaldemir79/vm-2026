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
import { GROUP_IDS } from '../types';
import { QUALIFYING_THIRDS } from './seed-third-places';

// En KOMPLETT rangordning har EN trea per KANONISK grupp (VM 2026 har 12 grupper
// A-L, SPEC §5). GROUP_IDS är enda sanningen för giltiga grupper (ingen magisk
// 12). Garantin för `qualifyingGroups` (se nedan) vilar på att ALLA dessa grupper
// är representerade bland de rangordnade treorna (unik täckning, inte bara antal).

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
   * seedThirdPlaces (Annexe C) tar emot. `null` tills ALLA 12 grupptreor finns
   * rangordnade (en KOMPLETT rangordning), så ingen seedning sker på en gissning.
   *
   * VARFÖR hela 12, inte bara 8: topp-8 av en OFULLSTÄNDIG mängd treor (t.ex. 9,
   * 10 eller 11 av 12 grupper färdiga) är en gissning, en grupp som ännu inte
   * spelat färdigt kan visa sig ha en BÄTTRE trea än någon av de provisoriska 8
   * och knuffa ut en av dem. Fail-safe: hellre "ännu inte avgjort" (null) än en
   * seedning som senare måste rivas. Non-null exakt när rangordningen är komplett.
   */
  qualifyingGroups: GroupId[] | null;
}

/**
 * Rangordna grupptreorna och avgör vilka 8 som kvalificerar (FIFA Article 13).
 *
 * @param tables  De härledda grupptabellerna (alla 12 när gruppspelet är klart).
 * @returns       Rangordnade treor + de 8 kvalificerade + deras grupper (eller
 *                null om INTE alla 12 grupptreor kunde rangordnas, t.ex. mitt i
 *                gruppspelet eller med ofullständig data).
 *
 * VARFÖR null tills alla 12: en seedbar grupp-lista får bara fyllas när
 * rangordningen är KOMPLETT (en trea per KANONISK grupp, hela GROUP_IDS). Med färre
 * (t.ex. 9-11 färdiga grupper) vore topp-8 av en DELMÄNGD en gissning, en grupp
 * som ännu inte spelat färdigt kan ha en bättre trea och knuffa ut en av de
 * provisoriska 8. Att returnera null tills dess håller "inte avgjort än" till
 * ETT ställe och låter härledningen (derive-bracket) lämna bästa-trea-slotarna i
 * sitt "möjliga lag"-läge tills gruppspelet är klart. seedThirdPlaces KRÄVER
 * dessutom exakt 8 unika grupper och fail-loud:ar annars.
 */
export function computeThirdPlaceRanking(tables: readonly GroupTable[]): ThirdPlaceRanking {
  const ranked = rankThirdPlaces(tables);
  const qualified = ranked.slice(0, QUALIFYING_THIRDS);

  // Garantin uttrycks DIREKT: bara en KOMPLETT rangordning (en trea PER kanonisk
  // grupp, alla GROUP_IDS) ger en seedbar grupp-lista, annars null.
  //
  // Varför UNIKA grupper, inte bara `ranked.length === GROUP_IDS.length` (C6, samma
  // klass som C3 i derive-bracket): en ren ANTALS-koll släpper igenom 12 treor som
  // råkar ha en DUBBLETT-grupp och saknar en grupp (t.ex. två A-treor, ingen L).
  // Då vore mängden "komplett" till antalet men inte i täckning, och en av de 8
  // seedade grupperna kunde vara fel/dubblerad medan en kanonisk grupp saknas.
  // Vi kräver därför att Set:et av treornas grupp-id TÄCKER hela GROUP_IDS (en av
  // varje, enda sanningen för giltiga grupper). När hela GROUP_IDS täcks är minst
  // 12 treor givet på köpet. Fail-safe: hellre null än en seedning på en
  // ofullständig/dubblerad gruppmängd (gissa aldrig, PRINCIPLES §8).
  const rankedGroups = new Set(ranked.map((t) => t.group));
  const allGroupsPresent = GROUP_IDS.every((g) => rankedGroups.has(g));
  const qualifyingGroups = allGroupsPresent ? [...qualified.map((t) => t.group)].sort() : null;

  return { ranked, qualified, qualifyingGroups };
}
