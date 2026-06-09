import { describe, expect, it } from 'vitest';
import { GROUP_IDS, type GroupId } from '../types';
import { COLUMN_MATCH_IDS, QUALIFYING_THIRDS, seedThirdPlaces } from './seed-third-places';
import { ROUND_OF_32 } from './bracket-structure';

// ============================================================================
// UTTÖMMANDE test av treeplats-motorn (SPEC §5, det kritiska dataintegritets-
// kravet). Alla C(12,8) = 495 kombinationer av vilka 8 grupper som bidrar med
// en kvalificerad bästa trea ska ge en GILTIG, KOLLISIONSFRI seedning enligt
// FIFA:s Annexe C, och varje seedad trea måste vara behörig för matchen den
// hamnar i (Article 12.6). Motorn är strukturell (positioner, inte lag), så
// detta kan bevisas helt oberoende av den faktiska 2026-lottningen.
// ============================================================================

/** Generera alla k-delmängder av en array (för C(12,8)-uttömningen). */
function combinations<T>(arr: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...tail] = arr;
  return [...combinations(tail, k - 1).map((c) => [head, ...c]), ...combinations(tail, k)];
}

const ALL_COMBINATIONS = combinations(GROUP_IDS, QUALIFYING_THIRDS);

/** De 8 sextondelsfinaler som har en bästa-trea-plats, från strukturen. */
const BEST_THIRD_MATCHES = new Map(
  ROUND_OF_32.filter((m) => m.away.kind === 'best-third').map((m) => [
    m.id,
    m.away.kind === 'best-third' ? m.away.eligibleGroups : [],
  ])
);

describe('treeplats-motorn: grundfall', () => {
  it('har exakt 495 kombinationer att täcka (C(12,8))', () => {
    expect(ALL_COMBINATIONS).toHaveLength(495);
  });

  it('seedar alla 8 platser för en konkret kombination', () => {
    const qualifying: GroupId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const assignment = seedThirdPlaces(qualifying);

    expect(assignment).toHaveLength(QUALIFYING_THIRDS);
    // Varje match-id i tilldelningen är en av de 8 bästa-trea-matcherna.
    for (const a of assignment) {
      expect(COLUMN_MATCH_IDS).toContain(a.matchId);
    }
  });
});

describe('treeplats-motorn: UTTÖMMANDE över alla 495 kombinationer', () => {
  it('varje kombination ger en giltig, kollisionsfri seedning', () => {
    for (const qualifying of ALL_COMBINATIONS) {
      const assignment = seedThirdPlaces(qualifying);

      // 1. Exakt 8 tilldelningar.
      expect(assignment, `kombination ${qualifying.join('')}`).toHaveLength(QUALIFYING_THIRDS);

      // 2. KOLLISIONSFRITT: varje sextondelsfinal förekommer exakt en gång.
      const matchIds = assignment.map((a) => a.matchId);
      expect(new Set(matchIds).size, `dubbel match i ${qualifying.join('')}`).toBe(
        QUALIFYING_THIRDS
      );

      // 3. KOLLISIONSFRITT: varje seedad trea-grupp förekommer exakt en gång.
      const thirdGroups = assignment.map((a) => a.thirdPlaceGroup);
      expect(new Set(thirdGroups).size, `dubbel trea i ${qualifying.join('')}`).toBe(
        QUALIFYING_THIRDS
      );

      // 4. De seedade treorna är EXAKT de 8 kvalificerade grupperna (inga
      //    påhittade, ingen utelämnad).
      expect([...thirdGroups].sort()).toEqual([...qualifying].sort());

      // 5. BEHÖRIGHET (FIFA Article 12.6): varje trea hamnar bara i en match
      //    vars behöriga grupper inkluderar den. Detta är kärnan i att tabellen
      //    inte gissats: en felseedad trea skulle bryta den officiella
      //    behörighetslistan.
      for (const a of assignment) {
        const eligible = BEST_THIRD_MATCHES.get(a.matchId);
        expect(eligible, `okänd bästa-trea-match ${a.matchId}`).toBeDefined();
        expect(
          eligible!.includes(a.thirdPlaceGroup),
          `3${a.thirdPlaceGroup} ej behörig i ${a.matchId} (behöriga: ${eligible!.join(',')})`
        ).toBe(true);
      }
    }
  });

  it('är deterministisk: samma kombination ger samma seedning vid upprepning', () => {
    const qualifying: GroupId[] = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const first = seedThirdPlaces(qualifying);
    const second = seedThirdPlaces([...qualifying].reverse());
    expect(second).toEqual(first);
  });
});

describe('treeplats-motorn: fel-vägar (fail loud, gissar aldrig)', () => {
  it('kastar om färre än 8 grupper anges', () => {
    expect(() => seedThirdPlaces(['A', 'B', 'C'])).toThrow(/exakt 8/);
  });

  it('kastar om fler än 8 grupper anges', () => {
    expect(() => seedThirdPlaces(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'])).toThrow(/exakt 8/);
  });

  it('kastar vid dubblerad grupp (vore 8 i längd men inte 8 unika)', () => {
    expect(() => seedThirdPlaces(['A', 'A', 'B', 'C', 'D', 'E', 'F', 'G'])).toThrow(/[Dd]ubbler/);
  });

  it('kastar vid ogiltigt grupp-id', () => {
    // "M" finns inte (grupperna är A-L). Cast för att testa runtime-vakten.
    const bad = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'M'] as GroupId[];
    expect(() => seedThirdPlaces(bad)).toThrow(/[Oo]giltigt/);
  });
});
