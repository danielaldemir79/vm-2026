// Per-match-poll-plan-tester (pollare-v3): bevisa Daniels poll-modell.
//   - HOPPA hela ticket (0 anrop) när ingen match är i fönster (inga anrop mellan
//     matcher) ELLER när allt är klart (frysta), ELLER när budgeten är slut.
//   - DISCOVERY (live=all) bara när en in-fönster-match SAKNAR mappning; när alla är
//     mappade behövs INGET live=all (sparar ett anrop per tick).
//   - PER-MATCH: ett fixtures?id per mappad, ej-fryst match, FACIT-PRIO (finished-
//     väntar-freeze före pågående) + äldst-kickoff, budget-kapat, spräcker ALDRIG 100/dag.
// Edge, fel-vägar och negativ-kontroll (en fryst match får INGET anrop osv).

import { describe, expect, it } from 'vitest';
import {
  buildPerMatchPollPlan,
  DEFAULT_DAILY_BUDGET,
  DEFAULT_MAX_PER_MATCH_CALLS_PER_TICK,
  type WindowMatchState,
} from './per-match-poll-plan';
import type { InWindowMatch } from './live-window';

/** Bygg en in-fönster-match (msSinceKickoff styr äldst-först-sorteringen). */
function inWindow(matchId: string, msSinceKickoff: number): InWindowMatch {
  return {
    matchId,
    kickoffUtc: new Date(Date.now() - msSinceKickoff).toISOString(),
    homeAppId: 'a',
    awayAppId: 'b',
    msSinceKickoff,
  };
}

/** Bygg ett window-match-state. apiFixtureId=null => omappad (kräver discovery). */
function state(
  matchId: string,
  opts: {
    msSinceKickoff?: number;
    apiFixtureId?: number | null;
    frozen?: boolean;
    finishedAwaitingFreeze?: boolean;
  } = {}
): WindowMatchState {
  return {
    match: inWindow(matchId, opts.msSinceKickoff ?? 60 * 60 * 1000),
    apiFixtureId: opts.apiFixtureId === undefined ? 100 : opts.apiFixtureId,
    frozen: opts.frozen ?? false,
    finishedAwaitingFreeze: opts.finishedAwaitingFreeze,
  };
}

describe('buildPerMatchPollPlan: HOPPA-ticket-vägarna (0 anrop, budgeten räcker)', () => {
  it('ingen match i fönster => hoppa hela ticket (0 anrop, ingen tomgångs-polling)', () => {
    const plan = buildPerMatchPollPlan({ windowMatches: [], callsUsedToday: 0 });
    expect(plan.skipTick).toBe(true);
    expect(plan.needsDiscovery).toBe(false);
    expect(plan.perMatchTargets).toEqual([]);
    expect(plan.callBudgetThisTick).toBe(0);
    expect(plan.reason).toMatch(/fönster/);
  });

  it('alla in-fönster-matcher FRYSTA + inga okända => hoppa (inget att göra)', () => {
    const plan = buildPerMatchPollPlan({
      windowMatches: [state('a', { frozen: true }), state('b', { frozen: true })],
      callsUsedToday: 0,
    });
    expect(plan.skipTick).toBe(true);
    expect(plan.callBudgetThisTick).toBe(0);
    expect(plan.reason).toMatch(/frysta/);
  });

  it('dagsbudget redan spräckt => hoppa, ALDRIG ett anrop till (hård budget-vägg)', () => {
    const plan = buildPerMatchPollPlan({
      windowMatches: [state('a')],
      callsUsedToday: 100,
      dailyBudget: 100,
    });
    expect(plan.skipTick).toBe(true);
    expect(plan.callBudgetThisTick).toBe(0);
    expect(plan.reason).toMatch(/spräckt/);
  });
});

describe('buildPerMatchPollPlan: DISCOVERY (live=all bara när det behövs)', () => {
  it('alla in-fönster-matcher mappade => INGET live=all (needsDiscovery false)', () => {
    const plan = buildPerMatchPollPlan({
      windowMatches: [state('a', { apiFixtureId: 100 }), state('b', { apiFixtureId: 200 })],
      callsUsedToday: 0,
    });
    expect(plan.skipTick).toBe(false);
    expect(plan.needsDiscovery).toBe(false);
    // Bara per-match-anrop, inget live=all.
    expect(plan.callBudgetThisTick).toBe(2);
    expect(plan.perMatchTargets.map((t) => t.matchId)).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('en omappad in-fönster-match => discovery (1 live=all) + per-match för de mappade', () => {
    const plan = buildPerMatchPollPlan({
      windowMatches: [
        state('mappad', { apiFixtureId: 100 }),
        state('okänd', { apiFixtureId: null }),
      ],
      callsUsedToday: 0,
    });
    expect(plan.needsDiscovery).toBe(true);
    // 1 live=all (discovery) + 1 fixtures?id (bara den mappade; den okända pollas
    // först nästa tick efter att discovery auto-mappat den , gissar aldrig id).
    expect(plan.callBudgetThisTick).toBe(2);
    expect(plan.perMatchTargets.map((t) => t.matchId)).toEqual(['mappad']);
  });

  it('bara EN omappad match (inga mappade än) => discovery, inga per-match-anrop än', () => {
    const plan = buildPerMatchPollPlan({
      windowMatches: [state('okänd', { apiFixtureId: null })],
      callsUsedToday: 0,
    });
    expect(plan.skipTick).toBe(false);
    expect(plan.needsDiscovery).toBe(true);
    expect(plan.perMatchTargets).toEqual([]);
    expect(plan.callBudgetThisTick).toBe(1); // bara live=all
  });

  it('discovery ryms inte ens (1 anrop kvar men reserveras) => discovery + 0 per-match', () => {
    const plan = buildPerMatchPollPlan({
      windowMatches: [
        state('okänd', { apiFixtureId: null }),
        state('mappad', { apiFixtureId: 100 }),
      ],
      callsUsedToday: 99,
      dailyBudget: 100,
    });
    // Bara 1 anrop kvar: discovery reserveras FÖRST (okänd match kan vara avgjord),
    // ingen budget kvar för per-match. Spräcker aldrig taket.
    expect(plan.needsDiscovery).toBe(true);
    expect(plan.perMatchTargets).toEqual([]);
    expect(plan.callBudgetThisTick).toBe(1);
    expect(plan.callBudgetThisTick).toBeLessThanOrEqual(100 - 99);
  });
});

describe('buildPerMatchPollPlan: PER-MATCH facit-prio + budget-cap (spräck aldrig 100/dag)', () => {
  it('FACIT-PRIO: en finished-väntar-freeze får sitt anrop FÖRE pågående när budget tryter', () => {
    const plan = buildPerMatchPollPlan({
      windowMatches: [
        // pågående, äldst kickoff (skulle annars sorterats först)
        state('pågående', { apiFixtureId: 100, msSinceKickoff: 3 * 60 * 60 * 1000 }),
        // avgjord men ofryst, nyare kickoff , MEN facit-prio lyfter den först
        state('avgjord', {
          apiFixtureId: 200,
          msSinceKickoff: 60 * 60 * 1000,
          finishedAwaitingFreeze: true,
        }),
      ],
      callsUsedToday: 99, // bara plats för 1 per-match-anrop
      dailyBudget: 100,
    });
    expect(plan.perMatchTargets).toHaveLength(1);
    expect(plan.perMatchTargets[0].matchId).toBe('avgjord'); // facit-prio vann
    expect(plan.perMatchTargets[0].facitPriority).toBe(true);
    expect(plan.callBudgetThisTick).toBe(1);
  });

  it('inom samma prio-grupp sorteras äldst-kickoff först', () => {
    const plan = buildPerMatchPollPlan({
      windowMatches: [
        state('ny', { apiFixtureId: 100, msSinceKickoff: 30 * 60 * 1000 }),
        state('gammal', { apiFixtureId: 200, msSinceKickoff: 3 * 60 * 60 * 1000 }),
      ],
      callsUsedToday: 0,
    });
    expect(plan.perMatchTargets.map((t) => t.matchId)).toEqual(['gammal', 'ny']);
  });

  it('callBudgetThisTick spräcker ALDRIG dagsbudgeten (budget-vägg respekteras)', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      state(`m${i}`, { apiFixtureId: 100 + i, msSinceKickoff: (i + 1) * 60 * 1000 })
    );
    const plan = buildPerMatchPollPlan({
      windowMatches: many,
      callsUsedToday: 98,
      dailyBudget: 100,
    });
    // Bara 2 anrop kvar idag => max 2 per-match-anrop, aldrig fler.
    expect(plan.callBudgetThisTick).toBe(2);
    expect(98 + plan.callBudgetThisTick).toBeLessThanOrEqual(100);
  });

  it('kapar till maxPerMatchCallsPerTick (ett tick bränner inte hela budgeten)', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      state(`m${i}`, { apiFixtureId: 100 + i, msSinceKickoff: (i + 1) * 60 * 1000 })
    );
    const plan = buildPerMatchPollPlan({
      windowMatches: many,
      callsUsedToday: 0,
      dailyBudget: 100,
      maxPerMatchCallsPerTick: 3,
    });
    expect(plan.perMatchTargets).toHaveLength(3);
    expect(plan.callBudgetThisTick).toBe(3);
  });

  it('en FRYST in-fönster-match får INGET per-match-anrop (negativ-kontroll: redan klar)', () => {
    const plan = buildPerMatchPollPlan({
      windowMatches: [
        state('klar', { apiFixtureId: 100, frozen: true }),
        state('pågår', { apiFixtureId: 200, frozen: false }),
      ],
      callsUsedToday: 0,
    });
    expect(plan.perMatchTargets.map((t) => t.matchId)).toEqual(['pågår']);
    expect(plan.callBudgetThisTick).toBe(1);
  });

  it('discovery + per-match tillsammans hålls under remaining budget', () => {
    const plan = buildPerMatchPollPlan({
      windowMatches: [
        state('okänd', { apiFixtureId: null }),
        state('a', { apiFixtureId: 100 }),
        state('b', { apiFixtureId: 200 }),
        state('c', { apiFixtureId: 300 }),
      ],
      callsUsedToday: 97,
      dailyBudget: 100,
    });
    // 3 kvar: 1 discovery + 2 per-match = 3, aldrig 4.
    expect(plan.callBudgetThisTick).toBe(3);
    expect(plan.needsDiscovery).toBe(true);
    expect(plan.perMatchTargets).toHaveLength(2);
    expect(97 + plan.callBudgetThisTick).toBeLessThanOrEqual(100);
  });
});

describe('buildPerMatchPollPlan: fel-vägar (orimlig input gissas aldrig)', () => {
  it('fail loud på negativ dailyBudget', () => {
    expect(() =>
      buildPerMatchPollPlan({ windowMatches: [state('a')], callsUsedToday: 0, dailyBudget: -1 })
    ).toThrow(/dailyBudget/);
  });

  it('fail loud på negativ callsUsedToday', () => {
    expect(() =>
      buildPerMatchPollPlan({ windowMatches: [state('a')], callsUsedToday: -1 })
    ).toThrow(/callsUsedToday/);
  });

  it('fail loud på negativ maxPerMatchCallsPerTick', () => {
    expect(() =>
      buildPerMatchPollPlan({
        windowMatches: [state('a')],
        callsUsedToday: 0,
        maxPerMatchCallsPerTick: -1,
      })
    ).toThrow(/maxPerMatchCallsPerTick/);
  });

  it('default-konstanterna är Daniels matte (100/dag, rimligt tick-tak)', () => {
    expect(DEFAULT_DAILY_BUDGET).toBe(100);
    expect(DEFAULT_MAX_PER_MATCH_CALLS_PER_TICK).toBe(6);
  });
});
