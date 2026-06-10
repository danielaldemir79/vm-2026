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

  it('qualifyingGroups är null tills exakt 8 treor finns (inte avgjort -> ingen gissning)', () => {
    // Bara 5 grupper med en trea: under 8 -> null (seedThirdPlaces körs inte).
    const partial = GROUP_IDS.slice(0, 5).map((g, i) => tableWithThird(g, 9 - i, 0, 3));
    const { qualifyingGroups, qualified } = computeThirdPlaceRanking(partial);
    expect(qualifyingGroups).toBeNull();
    expect(qualified).toHaveLength(5);
  });

  it('qualifyingGroups är de 8 unika grupperna som seedThirdPlaces kan ta emot', () => {
    const { qualifyingGroups } = computeThirdPlaceRanking(twelveTables());
    expect(qualifyingGroups).not.toBeNull();
    expect(new Set(qualifyingGroups!).size).toBe(8);
  });
});
