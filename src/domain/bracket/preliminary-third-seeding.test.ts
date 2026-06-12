import { describe, expect, it } from 'vitest';
import type { GroupId, GroupStanding, GroupTable } from '../types';
import { GROUP_IDS } from '../types';
import { preliminaryThirdSeeding } from './preliminary-third-seeding';
import { rankThirdPlaces } from './rank-third-places';
import { seedThirdPlaces } from './seed-third-places';
import { COLUMN_MATCH_IDS } from './seed-third-places';

// ============================================================================
// PRELIMINÄR treplats-seedning (T56, #100). Återanvänder rankThirdPlaces (FIFA
// Article 13) + seedThirdPlaces (Annexe C) på NUVARANDE (ofullständiga) tabeller.
// Skiljt från den skarpa vägen (computeThirdPlaceRanking) som kräver färdigspelat:
// här seedar vi de 8 nuvarande bästa treorna, men bara när ALLA 12 grupper har en
// nuvarande trea (annars vore "8 bästa av en delmängd" en gissning).
// ============================================================================

/** Bygg en standing-rad (bara fälten rankningen läser spelar roll). */
function row(
  teamId: string,
  rank: number,
  played: number,
  points = 0,
  gd = 0,
  gf = 0
): GroupStanding {
  return {
    teamId,
    played,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: gf,
    goalsAgainst: gf - gd,
    goalDifference: gd,
    points,
    rank,
  };
}

/**
 * En grupptabell DÄR LAGEN BARA SPELAT 1 MATCH (ofullständig). Trean (rank 3) får
 * parametriserbar poäng/MS/GM så treplats-rankningen kan styras deterministiskt.
 * Lag-id = "<g>1".."<g>4".
 */
function partialTable(g: GroupId, thirdPoints = 1, thirdGD = 0, thirdGF = 1): GroupTable {
  return {
    groupId: g,
    standings: [
      row(`${g}1`, 1, 1, 3, 1, 1),
      row(`${g}2`, 2, 1, 1, 0, 1),
      row(`${g}3`, 3, 1, thirdPoints, thirdGD, thirdGF),
      row(`${g}4`, 4, 1, 0, -1, 0),
    ],
  };
}

/** Alla 12 grupper med EN match spelad. Treornas poäng styr vilka 8 som leder just nu. */
function allPartial(thirdPointsByGroup?: Partial<Record<GroupId, number>>): GroupTable[] {
  return GROUP_IDS.map((g) => partialTable(g, thirdPointsByGroup?.[g] ?? 1));
}

describe('preliminaryThirdSeeding', () => {
  it('seedar de 8 nuvarande bästa treorna när alla 12 grupper har en trea (även ofullständigt)', () => {
    // A-H får höga trea-poäng (leder just nu), I-L låga (utanför de 8). Bara 1 match
    // spelad per lag, alltså INTE färdigspelat, men alla 12 har en nuvarande trea.
    const tables = allPartial({
      A: 3,
      B: 3,
      C: 3,
      D: 3,
      E: 3,
      F: 3,
      G: 3,
      H: 3,
      I: 0,
      J: 0,
      K: 0,
      L: 0,
    });
    const seeding = preliminaryThirdSeeding(tables);

    // 8 matcher seedade (de 8 Annexe C-kolumnerna).
    expect(seeding.size).toBe(8);
    // Exakt de 8 Annexe C-matcherna, inga andra.
    expect(new Set(seeding.keys())).toEqual(new Set(COLUMN_MATCH_IDS));
    // De seedade grupperna är de 8 nuvarande bästa (A-H), 8 distinkta grupper.
    const seededGroups = [...seeding.values()];
    expect(new Set(seededGroups).size).toBe(8);
    expect([...seededGroups].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  });

  it('är IDENTISK med den källlåsta motorn (samma rankThirdPlaces + seedThirdPlaces, ingen egen tabell)', () => {
    const tables = allPartial({
      A: 3,
      B: 3,
      C: 3,
      D: 3,
      E: 3,
      F: 3,
      G: 3,
      H: 3,
      I: 0,
      J: 0,
      K: 0,
      L: 0,
    });
    // Oberoende uträkning DIREKT via motorerna (det preliminaryThirdSeeding ska göra).
    const ranked = rankThirdPlaces(tables);
    const top8 = [...ranked.slice(0, 8).map((t) => t.group)].sort();
    const expected = new Map(
      seedThirdPlaces(top8).map((a) => [a.matchId, a.thirdPlaceGroup] as const)
    );

    const seeding = preliminaryThirdSeeding(tables);
    expect(new Map(seeding)).toEqual(expected);
  });

  it('RÖR SIG vid ny ställning: ett bättre resultat för en grupp ändrar vilka 8 som seedas', () => {
    // Utgångsläge: A-H leder (poäng 3), I-L utanför (poäng 0).
    const before = preliminaryThirdSeeding(
      allPartial({ A: 3, B: 3, C: 3, D: 3, E: 3, F: 3, G: 3, H: 3, I: 0, J: 0, K: 0, L: 0 })
    );
    expect([...before.values()].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

    // Nu får grupp I:s trea ett resultat som lyfter den förbi H:s (poäng 3 > 0), och
    // H:s trea sjunker (poäng 0). De 8 bästa ändras: I in, H ut.
    const after = preliminaryThirdSeeding(
      allPartial({ A: 3, B: 3, C: 3, D: 3, E: 3, F: 3, G: 3, H: 0, I: 3, J: 0, K: 0, L: 0 })
    );
    const afterGroups = [...after.values()].sort();
    expect(afterGroups).toContain('I');
    expect(afterGroups).not.toContain('H');
  });

  it('returnerar TOM map om någon grupp saknar en nuvarande trea (ärlig gräns, ingen gissning)', () => {
    // 11 grupper med en trea, grupp L har bara 2 lag (ingen rank-3-rad). Då kan de
    // 12 treorna inte rangordnas övergripande, alltså ingen preliminär seedning.
    const tables = allPartial();
    const indexOfL = GROUP_IDS.indexOf('L');
    tables[indexOfL] = {
      groupId: 'L',
      standings: [row('L1', 1, 1, 3, 1, 1), row('L2', 2, 1, 0, -1, 0)],
    };
    const seeding = preliminaryThirdSeeding(tables);
    expect(seeding.size).toBe(0);
  });

  it('returnerar TOM map med färre än 12 grupper (tidigt i gruppspelet)', () => {
    const seeding = preliminaryThirdSeeding([partialTable('A'), partialTable('B')]);
    expect(seeding.size).toBe(0);
  });

  it('muterar inte sina argument', () => {
    const tables = allPartial({ A: 3, B: 3, C: 3, D: 3, E: 3, F: 3, G: 3, H: 3 });
    const snapshot = JSON.stringify(tables);
    preliminaryThirdSeeding(tables);
    expect(JSON.stringify(tables)).toBe(snapshot);
  });
});
