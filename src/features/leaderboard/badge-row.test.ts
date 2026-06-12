// Tester för märkes-radens innehåll (T19, #19): vilka märken visas, ordning, tröskel.

import { describe, expect, it } from 'vitest';
import { buildBadgeRow, MIN_STREAK_SHOWN } from './badge-row';
import type { MemberBadges } from './derive-badges';

function badges(partial: Partial<MemberBadges>): MemberBadges {
  return {
    streak: { current: 0, longest: 0 },
    calledUpset: false,
    perfectRound: false,
    ...partial,
  };
}

describe('buildBadgeRow', () => {
  it('null -> tom lista (ingen egen rad att visa märken för)', () => {
    expect(buildBadgeRow(null)).toEqual([]);
  });

  it('inga tjänade märken -> tom lista (raden utelämnas i UI:t)', () => {
    expect(buildBadgeRow(badges({}))).toEqual([]);
  });

  it('visar streak-brickan när nuvarande streak >= tröskeln', () => {
    expect(MIN_STREAK_SHOWN).toBe(2);
    const rows = buildBadgeRow(badges({ streak: { current: 3, longest: 5 } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('streak');
    expect(rows[0].label).toBe('3 i rad');
  });

  it('döljer streak-brickan under tröskeln (en svit på 1 räknas inte)', () => {
    const rows = buildBadgeRow(badges({ streak: { current: 1, longest: 4 } }));
    expect(rows.some((r) => r.id === 'streak')).toBe(false);
  });

  it('visar skräll- och perfekt-omgång-märken när de tjänats, i ordning streak->skräll->perfekt', () => {
    const rows = buildBadgeRow(
      badges({ streak: { current: 2, longest: 2 }, calledUpset: true, perfectRound: true })
    );
    expect(rows.map((r) => r.id)).toEqual(['streak', 'called-upset', 'perfect-round']);
  });

  it('varje bricka bär en icke-tom förklaring (begriplig för skärmläsare/title)', () => {
    const rows = buildBadgeRow(badges({ calledUpset: true }));
    expect(rows[0].description.length).toBeGreaterThan(0);
  });
});
