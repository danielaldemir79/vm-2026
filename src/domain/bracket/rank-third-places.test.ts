import { describe, expect, it } from 'vitest';
import type { GroupId, GroupStanding, GroupTable } from '../types';
import { GROUP_IDS } from '../types';
import { computeThirdPlaceRanking, rankThirdPlaces } from './rank-third-places';

// ============================================================================
// FIFA Article 13: rangordna de 12 grupptreorna -> de 8 bästa. Övergripande
// kriterier a-c (poäng, total målskillnad, totalt gjorda mål), sedan stabil
// groupId-fallback (kort/ranking utanför scope, se modul-källan). De tolv
// treorna har aldrig mött varandra, så det finns INGET inbördes möte.
// ============================================================================

/** Bygg en standing-rad med givna nyckeltal (rank sätts explicit per test). */
function standing(
  teamId: string,
  rank: number,
  points: number,
  goalDifference: number,
  goalsFor: number
): GroupStanding {
  return {
    teamId,
    played: 3,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor,
    goalsAgainst: goalsFor - goalDifference,
    goalDifference,
    points,
    rank,
  };
}

/**
 * Bygg en grupptabell där bara treans (rank 3) nyckeltal spelar roll för dessa
 * tester. Övriga rader fylls med platshållare så strukturen är realistisk
 * (4 lag, rank 1-4) utan att påverka treplats-rankningen.
 */
function tableWithThird(
  group: GroupId,
  thirdPoints: number,
  thirdGD: number,
  thirdGF: number
): GroupTable {
  return {
    groupId: group,
    standings: [
      standing(`${group}1`, 1, 9, 5, 7),
      standing(`${group}2`, 2, 6, 2, 5),
      standing(`${group}3`, 3, thirdPoints, thirdGD, thirdGF),
      standing(`${group}4`, 4, 0, -6, 1),
    ],
  };
}

describe('rankThirdPlaces, FIFA-kriterier a-c', () => {
  it('rangordnar på poäng först (flest poäng = bäst trea)', () => {
    const tables = [
      tableWithThird('A', 3, 0, 3),
      tableWithThird('B', 6, 0, 3),
      tableWithThird('C', 4, 0, 3),
    ];
    const ranked = rankThirdPlaces(tables);
    expect(ranked.map((t) => t.group)).toEqual(['B', 'C', 'A']);
  });

  it('vid lika poäng avgör total målskillnad (b)', () => {
    const tables = [
      tableWithThird('A', 4, 1, 4),
      tableWithThird('B', 4, 3, 4),
      tableWithThird('C', 4, -2, 4),
    ];
    expect(rankThirdPlaces(tables).map((t) => t.group)).toEqual(['B', 'A', 'C']);
  });

  it('vid lika poäng OCH målskillnad avgör totalt gjorda mål (c)', () => {
    const tables = [
      tableWithThird('A', 4, 1, 3),
      tableWithThird('B', 4, 1, 6),
      tableWithThird('C', 4, 1, 4),
    ];
    expect(rankThirdPlaces(tables).map((t) => t.group)).toEqual(['B', 'C', 'A']);
  });

  it('vid HELT lika a-c är ordningen stabil på groupId (inte en FIFA-tiebreak)', () => {
    const tables = [
      tableWithThird('L', 4, 1, 3),
      tableWithThird('C', 4, 1, 3),
      tableWithThird('A', 4, 1, 3),
    ];
    // Deterministisk groupId-stigande fallback.
    expect(rankThirdPlaces(tables).map((t) => t.group)).toEqual(['A', 'C', 'L']);
  });

  it('hoppar över en grupp som saknar en rank-3-rad (gissar inte fram en trea)', () => {
    const noThird: GroupTable = {
      groupId: 'A',
      standings: [standing('A1', 1, 9, 5, 7), standing('A2', 2, 6, 2, 5)],
    };
    const withThird = tableWithThird('B', 4, 0, 3);
    const ranked = rankThirdPlaces([noThird, withThird]);
    expect(ranked.map((t) => t.group)).toEqual(['B']);
  });
});

describe('computeThirdPlaceRanking, de 8 bästa', () => {
  /** 12 grupper, treornas poäng distinkta så ordningen är entydig (12,11,...,1). */
  function twelveTables(): GroupTable[] {
    return GROUP_IDS.map((g, i) => tableWithThird(g, 12 - i, 0, 3));
  }

  it('väljer exakt 8 kvalificerade och ger deras grupper sorterat (seed-form)', () => {
    const { qualified, qualifyingGroups } = computeThirdPlaceRanking(twelveTables());
    expect(qualified).toHaveLength(8);
    // De 8 bästa = grupperna A-H (högst poäng 12..5); seed-formen är sorterad.
    expect(qualifyingGroups).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    // De 4 sämsta (I-L) faller utanför.
    expect(qualified.map((t) => t.group)).not.toContain('I');
  });

  it('qualifyingGroups är de 8 unika grupperna som seedThirdPlaces kan ta emot', () => {
    const { qualifyingGroups } = computeThirdPlaceRanking(twelveTables());
    expect(qualifyingGroups).not.toBeNull();
    expect(new Set(qualifyingGroups!).size).toBe(8);
  });
});

describe('computeThirdPlaceRanking, qualifyingGroups-RANDEN (null tills KOMPLETT rangordning)', () => {
  // F1 (lokal panel + lessons "uttommande-test-vaktar-svagare-invariant"): garantin
  // är "null tills ALLA 12 grupptreor finns rangordnade", INTE "minst 8". Det gamla
  // villkoret `qualified.length === 8` (= `slice(0,8).length === 8`) är sant för ALLA
  // n >= 8 och skulle seeda topp-8 av en ofullständig mängd. Vi testar därför HELA
  // randen kring tröskeln (7, 8, 9, 11, 12), inte bara ett värde långt under (gamla
  // n=5-testet rörde aldrig grenen 8-11 där den påstådda garantin faktiskt bröts).

  /** n grupptabeller, var och en med en trea, distinkta poäng så ordningen är entydig. */
  function nTables(n: number): GroupTable[] {
    return GROUP_IDS.slice(0, n).map((g, i) => tableWithThird(g, 20 - i, 0, 3));
  }

  it('n=7 (under tröskeln): null, ingen seedning', () => {
    const { qualifyingGroups, qualified } = computeThirdPlaceRanking(nTables(7));
    expect(qualifyingGroups).toBeNull();
    expect(qualified).toHaveLength(7); // alla 7 är (provisoriskt) inom topp-8
  });

  it('n=8 (exakt 8 treor men rangordningen ÄNNU INTE komplett): null', () => {
    // Detta är raden gamla villkoret slog fel på: 8 treor -> det returnerade
    // ['A'..'H'] fast 4 grupper ännu inte har en rangordnad trea. En av dem kan
    // få en bättre trea och knuffa ut en av dessa 8. Sant svar: inte avgjort än.
    const { qualifyingGroups, qualified } = computeThirdPlaceRanking(nTables(8));
    expect(qualifyingGroups).toBeNull();
    expect(qualified).toHaveLength(8);
  });

  it('n=9 (över 8, fortfarande ofullständig): null (gamla villkoret gav ["A".."H"])', () => {
    const { qualifyingGroups } = computeThirdPlaceRanking(nTables(9));
    expect(qualifyingGroups).toBeNull();
  });

  it('n=11 (en grupp kvar): fortfarande null, ingen gissning på den sista', () => {
    const { qualifyingGroups } = computeThirdPlaceRanking(nTables(11));
    expect(qualifyingGroups).toBeNull();
  });

  it('n=12 (KOMPLETT rangordning): non-null, exakt de 8 bästa grupperna sorterat', () => {
    const { qualifyingGroups, qualified } = computeThirdPlaceRanking(nTables(12));
    expect(qualifyingGroups).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(qualified).toHaveLength(8);
  });

  it('n=12 där en SEN grupp har den bästa trean ändrar vilka 8 som kvalificerar', () => {
    // Bevisar VARFÖR vi väntar på alla 12: grupp L (sist) får den allra bästa trean
    // och tränger ut den svagaste av de annars-kvalificerade. Hade vi seedat vid
    // 11 grupper (utan L) vore L felaktigt utelämnad.
    const tables = GROUP_IDS.map((g, i) =>
      g === 'L' ? tableWithThird(g, 99, 9, 9) : tableWithThird(g, 20 - i, 0, 3)
    );
    const { qualifyingGroups } = computeThirdPlaceRanking(tables);
    // L är nu bäst och inne; H (poäng 13, svagast av de tidigare 8) faller ut.
    expect(qualifyingGroups).toContain('L');
    expect(qualifyingGroups).not.toContain('H');
    expect(qualifyingGroups).toHaveLength(8);
  });

  // C6 (Copilot runda 2, samma klass som C3 i derive-bracket): en ren ANTALS-koll
  // (`ranked.length === GROUP_IDS.length`) släpper igenom 12 treor med en DUBBLETT-
  // grupp + en SAKNAD grupp. Då är `ranked.length === 12` sant fast täckningen är
  // ofullständig, och en seedning skulle ske på fel/dubblerad gruppmängd. Garantin
  // måste vila på UNIK gruppmängd, inte antal.
  it('är null med 12 treor om en grupp är DUBBLERAD och en saknas (11 unika grupper)', () => {
    // 12 tabeller, alla med en rank-3-rad, men L är utbytt mot ett andra A:
    // 12 treor totalt (ranked.length === 12), men bara 11 UNIKA grupper.
    const tables = GROUP_IDS.map((g, i) =>
      g === 'L' ? tableWithThird('A', 20 - i, 0, 3) : tableWithThird(g, 20 - i, 0, 3)
    );
    const { ranked, qualifyingGroups } = computeThirdPlaceRanking(tables);
    // ranked.length === 12: en ren antals-koll hade felaktigt sagt "komplett".
    expect(ranked).toHaveLength(GROUP_IDS.length);
    // ...men bara 11 unika grupper (A dubblerad, L saknas).
    expect(new Set(ranked.map((t) => t.group)).size).toBe(GROUP_IDS.length - 1);
    // Garantin (unik täckning) håller: ingen seedning på en ofullständig gruppmängd.
    expect(qualifyingGroups).toBeNull();
  });

  it('är null med 13 tabeller om en kanonisk grupp saknas (antalet räcker inte)', () => {
    // 13 treor: alla utom L (11) + två extra A. ranked.length (13) >= 12, men L
    // saknas -> får inte seeda. Speglar derive-brackets C3-test på domän-nivå.
    const tables = [
      ...GROUP_IDS.filter((g) => g !== 'L').map((g, i) => tableWithThird(g, 20 - i, 0, 3)),
      tableWithThird('A', 5, 0, 3),
      tableWithThird('A', 4, 0, 3),
    ];
    const { ranked, qualifyingGroups } = computeThirdPlaceRanking(tables);
    expect(ranked.length).toBeGreaterThan(GROUP_IDS.length);
    expect(new Set(ranked.map((t) => t.group)).has('L')).toBe(false);
    expect(qualifyingGroups).toBeNull();
  });
});
