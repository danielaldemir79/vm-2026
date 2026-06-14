// Poll-planerar-tester. Bevisar Daniels HARD-invariant: facit reserveras FÖRST på
// VARJE match, och summan överskrider ALDRIG budgeten , även på tyngsta dagen.
// Edge: 0, 1, 6 matcher. Adaptivt intervall: tung dag glesare, lätt dag tätare.

import { describe, expect, it } from 'vitest';
import { ACTIVE_WINDOW_MINUTES, planPolls, type PollDayMatch } from './poll-budget';

/** Bygg N syntetiska matchdags-poster (kickoff spelar ingen roll för invarianten). */
function days(n: number): PollDayMatch[] {
  return Array.from({ length: n }, (_, i) => ({
    appMatchId: `m-${i + 1}`,
    kickoffUtc: '2026-06-14T20:00:00.000Z',
  }));
}

describe('planPolls: facit-reservation (krav 1, HARD)', () => {
  it('reserverar exakt ett facit-anrop per match', () => {
    expect(planPolls(days(1)).allocation.finalResultReserve).toBe(1);
    expect(planPolls(days(6)).allocation.finalResultReserve).toBe(6);
  });

  it('facit-reservationen == matchantalet även på en tung dag (12 matcher)', () => {
    const plan = planPolls(days(12));
    expect(plan.allocation.finalResultReserve).toBe(12);
  });
});

describe('planPolls: budget-invariant (krav, HARD)', () => {
  it('total planerade anrop <= budget för 0..16 matcher (default 100)', () => {
    for (let n = 0; n <= 16; n++) {
      const plan = planPolls(days(n));
      expect(plan.totalPlanned, `n=${n}`).toBeLessThanOrEqual(100);
    }
  });

  it('total planerade anrop <= budget även på en knapp budget', () => {
    const plan = planPolls(days(6), 20);
    expect(plan.totalPlanned).toBeLessThanOrEqual(20);
  });

  it('totalPlanned är summan av allocation-posterna (ingen drift)', () => {
    const { allocation, totalPlanned } = planPolls(days(8));
    const sum =
      allocation.finalResultReserve +
      allocation.liveBackbone +
      allocation.events +
      allocation.statistics;
    expect(sum).toBe(totalPlanned);
  });
});

describe('planPolls: edge-fall', () => {
  it('0 matcher: allt 0, inget live-intervall', () => {
    const plan = planPolls(days(0));
    expect(plan.matchCount).toBe(0);
    expect(plan.totalPlanned).toBe(0);
    expect(plan.allocation).toEqual({
      finalResultReserve: 0,
      liveBackbone: 0,
      events: 0,
      statistics: 0,
    });
    expect(plan.liveIntervalMinutes).toBeNull();
  });

  it('1 match: facit + en stor live-ryggrads-pott av resten', () => {
    const plan = planPolls(days(1));
    expect(plan.allocation.finalResultReserve).toBe(1);
    expect(plan.allocation.liveBackbone).toBeGreaterThan(0);
    expect(plan.liveIntervalMinutes).not.toBeNull();
  });

  it('fail loud på negativ budget', () => {
    expect(() => planPolls(days(1), -5)).toThrow(/får inte vara negativ/);
  });

  it('degenererad budget < matchantal: facit tar budgeten, inga övriga anrop', () => {
    // 3 matcher, budget 2: facit-prioritet betyder att facit tar de 2 anropen.
    const plan = planPolls(days(3), 2);
    expect(plan.allocation.finalResultReserve).toBe(2);
    expect(plan.allocation.liveBackbone).toBe(0);
    expect(plan.totalPlanned).toBeLessThanOrEqual(2);
  });
});

describe('planPolls: adaptivt live-intervall (krav 3)', () => {
  it('tung dag ger GLESARE intervall än lätt dag (fler matcher -> större tal)', () => {
    const light = planPolls(days(2));
    const heavy = planPolls(days(12));
    // Båda har live-anrop; den tunga dagen har färre live-anrop kvar (mer budget i
    // facit), så dess intervall ska vara större (glesare).
    expect(light.liveIntervalMinutes).not.toBeNull();
    expect(heavy.liveIntervalMinutes).not.toBeNull();
    expect(heavy.liveIntervalMinutes!).toBeGreaterThan(light.liveIntervalMinutes!);
  });

  it('intervallet är aktivt-fönster / live-anrop (härlett, inte gissat)', () => {
    const plan = planPolls(days(4));
    const expected = Math.round(ACTIVE_WINDOW_MINUTES / plan.allocation.liveBackbone);
    expect(plan.liveIntervalMinutes).toBe(expected);
  });
});
