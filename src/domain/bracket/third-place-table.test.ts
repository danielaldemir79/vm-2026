import { describe, expect, it } from 'vitest';
import { GROUP_IDS } from '../types';
import { THIRD_PLACE_COLUMN_WINNERS, THIRD_PLACE_TABLE } from './third-place-table';

// Integritetstest för den GENERERADE Annexe C-tabellen. Tabellen är källan till
// hela treeplats-seedningen, så den måste vara KOMPLETT och välformad: exakt 495
// rader, varje rad 8 unika giltiga grupper, och alla 495 kombinationer av 8
// grupper täckta exakt en gång. Ett fel här (t.ex. en tappad eller dubblerad rad
// vid generering) skulle ge fel eller saknad seedning, fånga det vid bygget.

/** Sorterad nyckel för en rads grupp-mängd. */
function key(groups: readonly string[]): string {
  return [...groups].sort().join('');
}

function combinations<T>(arr: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...tail] = arr;
  return [...combinations(tail, k - 1).map((c) => [head, ...c]), ...combinations(tail, k)];
}

describe('Annexe C-tabellen: form och fullständighet', () => {
  it('har exakt 495 rader (C(12,8))', () => {
    expect(THIRD_PLACE_TABLE).toHaveLength(495);
  });

  it('kolumnhuvudet är de 8 gruppvinnare som möter en trea (1A,1B,1D,1E,1G,1I,1K,1L)', () => {
    expect([...THIRD_PLACE_COLUMN_WINNERS]).toEqual(['A', 'B', 'D', 'E', 'G', 'I', 'K', 'L']);
  });

  it('varje rad har 8 unika, giltiga grupp-id', () => {
    for (const row of THIRD_PLACE_TABLE) {
      expect(row).toHaveLength(8);
      expect(new Set(row).size).toBe(8);
      for (const g of row) {
        expect(GROUP_IDS).toContain(g);
      }
    }
  });

  it('alla 495 kombinationer av 8 grupper täcks exakt en gång', () => {
    const seen = new Map<string, number>();
    for (const row of THIRD_PLACE_TABLE) {
      const k = key(row);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    // Ingen dubblett.
    for (const [k, count] of seen) {
      expect(count, `kombination ${k} förekommer ${count} gånger`).toBe(1);
    }
    // Varje matematiskt möjlig 8-kombination finns.
    const all = combinations(GROUP_IDS, 8).map((c) => c.join(''));
    expect(seen.size).toBe(all.length);
    for (const combo of all) {
      expect(seen.has(combo), `saknad kombination ${combo}`).toBe(true);
    }
  });

  it('spot-checkar kända rader mot FIFA:s Annexe C (gissas aldrig)', () => {
    // Rad 1 och rad 495 ur FIFA:s officiella Annexe C (sid. 80 resp. 97).
    expect([...THIRD_PLACE_TABLE[0]]).toEqual(['E', 'J', 'I', 'F', 'H', 'G', 'L', 'K']);
    expect([...THIRD_PLACE_TABLE[494]]).toEqual(['H', 'G', 'B', 'C', 'A', 'F', 'D', 'E']);
  });
});
