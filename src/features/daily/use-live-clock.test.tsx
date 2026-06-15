// Tester för useLiveClock-hooken (Bit 3b). Bevisar att den BARA är React-limmet ovanpå
// Bit 1:s rena klocka (liveClockFor/computeClock): rätt label/tick per status med ett
// injicerat `now`, ingen egen tid-logik. Drift-fallen (paus fryser, kap vid halvlek)
// är redan bevisade i live-clock.test.ts; här bevisar vi att hooken ANVÄNDER dem rätt.

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLiveClock } from './use-live-clock';
import type { LiveData } from '../../data/livescore';

const SYNC = '2026-06-14T20:00:00.000Z';
const SYNC_MS = Date.parse(SYNC);
const min = (m: number) => m * 60_000;

function live(over: Partial<LiveData> = {}): LiveData {
  return {
    matchId: 'g-F-1',
    apiFixtureId: 1489376,
    status: 'live',
    elapsedMinute: 29,
    homeGoals: 0,
    awayGoals: 0,
    events: [],
    statistics: [],
    lineups: [],
    frozen: false,
    lastSyncedAt: SYNC,
    ...over,
  };
}

describe('useLiveClock', () => {
  it('LIVE: tickar mjukt från sync (elapsed 29 + 5 min -> "34\'", ticking)', () => {
    const { result } = renderHook(() => useLiveClock(live(), SYNC_MS + min(5)));
    expect(result.current.label).toBe("34'");
    expect(result.current.displayMinute).toBe(34);
    expect(result.current.ticking).toBe(true);
  });

  it('PAUS: fryser på elapsed, ticking false (vattenpaus-säker)', () => {
    const { result } = renderHook(() =>
      useLiveClock(live({ status: 'paused', elapsedMinute: 45 }), SYNC_MS + min(20))
    );
    expect(result.current.label).toBe('Paus');
    expect(result.current.displayMinute).toBe(45);
    expect(result.current.ticking).toBe(false);
  });

  it('SLUT: label "Slut", ingen tick', () => {
    const { result } = renderHook(() =>
      useLiveClock(live({ status: 'finished' }), SYNC_MS + min(120))
    );
    expect(result.current.label).toBe('Slut');
    expect(result.current.ticking).toBe(false);
  });

  it('saknad last_synced_at -> fail-safe (faller på now, ingen gissad tick-bas)', () => {
    // null sync -> liveClockFor använder now som bas = 0 min sedan sync -> elapsed oförändrad.
    const { result } = renderHook(() =>
      useLiveClock(live({ lastSyncedAt: null, elapsedMinute: 30 }), SYNC_MS + min(99))
    );
    expect(result.current.displayMinute).toBe(30);
  });
});
