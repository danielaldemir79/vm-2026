import { describe, expect, it } from 'vitest';
import { decidePollTick } from './poll-gate';
import type { PollDayMatch } from './poll-budget';

// En liten matchdags-fixtur. Antalet matcher driver planPolls (facit-reserv +
// live-pott); kickoff-tiden spelar ingen roll för gaten (den planerar inte tid).
function days(n: number): PollDayMatch[] {
  return Array.from({ length: n }, (_, i) => ({
    appMatchId: `g-A-${i + 1}`,
    kickoffUtc: '2026-06-14T16:00:00.000Z',
  }));
}

describe('decidePollTick: budget-gate per cron-tick', () => {
  it('pollar ett vanligt live-tick (live=all) när matcher finns och budget kvar', () => {
    const d = decidePollTick({
      matchesForDay: days(4),
      callsUsedToday: 0,
      finishedAwaitingFreeze: 0,
    });
    expect(d.shouldPoll).toBe(true);
    // Inget facit väntar => bara ett live=all-anrop.
    expect(d.callBudgetThisTick).toBe(1);
  });

  it('lägger till ett freeze-anrop per nyss avslutad match (facit FÖRST)', () => {
    const d = decidePollTick({
      matchesForDay: days(4),
      callsUsedToday: 0,
      finishedAwaitingFreeze: 2,
    });
    expect(d.shouldPoll).toBe(true);
    // 2 freeze (fixtures?id) + 1 live=all.
    expect(d.callBudgetThisTick).toBe(3);
    expect(d.reason).toMatch(/2 freeze/);
  });

  it('pollar INTE när det inte finns några matcher idag', () => {
    const d = decidePollTick({
      matchesForDay: [],
      callsUsedToday: 0,
      finishedAwaitingFreeze: 0,
    });
    expect(d.shouldPoll).toBe(false);
    expect(d.callBudgetThisTick).toBe(0);
    expect(d.reason).toMatch(/inga matcher/);
  });

  it('pollar ALDRIG när dagsbudgeten redan är spräckt (hård vägg)', () => {
    const d = decidePollTick({
      matchesForDay: days(4),
      callsUsedToday: 100,
      finishedAwaitingFreeze: 3, // även med facit som väntar
      dailyBudget: 100,
    });
    expect(d.shouldPoll).toBe(false);
    expect(d.callBudgetThisTick).toBe(0);
    expect(d.reason).toMatch(/spräckt/);
  });

  it('self-contained: summan av tickets anrop spräcker ALDRIG budgeten', () => {
    // Bara 2 anrop kvar, men 5 facit väntar + live vill ha 1 => får max 2.
    const d = decidePollTick({
      matchesForDay: days(8),
      callsUsedToday: 98,
      finishedAwaitingFreeze: 5,
      dailyBudget: 100,
    });
    expect(d.shouldPoll).toBe(true);
    expect(d.callBudgetThisTick).toBe(2); // freeze tar de 2 sista, live får stå tillbaka
    expect(98 + d.callBudgetThisTick).toBeLessThanOrEqual(100);
  });

  it('prioriterar facit över live när bara 1 anrop ryms', () => {
    // 1 anrop kvar, 1 facit väntar => facit vinner, live hoppas (callBudget = 1).
    const d = decidePollTick({
      matchesForDay: days(8),
      callsUsedToday: 99,
      finishedAwaitingFreeze: 1,
      dailyBudget: 100,
    });
    expect(d.shouldPoll).toBe(true);
    expect(d.callBudgetThisTick).toBe(1);
    expect(d.reason).toMatch(/freeze/); // det enda anropet gick till facit, inte live
    expect(d.reason).not.toMatch(/live=all/);
  });

  it('fail loud på negativ dagsbudget (korrupt input gissas inte vidare)', () => {
    expect(() =>
      decidePollTick({
        matchesForDay: days(4),
        callsUsedToday: 0,
        finishedAwaitingFreeze: 0,
        dailyBudget: -1,
      })
    ).toThrow(/dailyBudget/);
  });

  it('fail loud på negativ räknare (korrupt poll_log gissas inte vidare)', () => {
    expect(() =>
      decidePollTick({ matchesForDay: days(4), callsUsedToday: -5, finishedAwaitingFreeze: 0 })
    ).toThrow(/callsUsedToday/);
  });

  it('fail loud på negativt freeze-antal', () => {
    expect(() =>
      decidePollTick({ matchesForDay: days(4), callsUsedToday: 0, finishedAwaitingFreeze: -1 })
    ).toThrow(/finishedAwaitingFreeze/);
  });
});
