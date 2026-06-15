// Tester för realtids-/klock-bryggan (Bit 3a). Fokus: rätt tabell-prenumeration, och
// att liveClockFor RE-SYNKAR mot DB:ns elapsed_minute + last_synced_at via Bit 1:s
// computeClock (mjuk tick under live, frys i paus, fail-safe på trasig/saknad tid).

import { describe, expect, it } from 'vitest';
import { liveClockFor, liveDataSubscription, MATCH_LIVE_DATA_TABLE } from './live-realtime';
import type { LiveData } from './live-read';

/** Bygg en LiveData med rimliga default, override per test. */
function live(overrides: Partial<LiveData> = {}): LiveData {
  return {
    matchId: 'g-A-1',
    apiFixtureId: 1001,
    status: 'live',
    elapsedMinute: 30,
    homeGoals: 0,
    awayGoals: 0,
    events: [],
    statistics: [],
    lineups: [],
    frozen: false,
    lastSyncedAt: '2026-06-15T18:30:00.000Z',
    ...overrides,
  };
}

const SYNC_MS = Date.parse('2026-06-15T18:30:00.000Z');

describe('liveDataSubscription', () => {
  it('prenumererar på match_live_data (hela tabellen, inget filter)', () => {
    const subs = liveDataSubscription();
    expect(subs).toEqual([{ table: 'match_live_data' }]);
    // Konstanten och tabellnamnet i subscriptionen är samma sanning.
    expect(subs[0].table).toBe(MATCH_LIVE_DATA_TABLE);
  });

  it('utelämnar filter-fältet (RLS är skyddet, inte ett filter)', () => {
    expect('filter' in liveDataSubscription()[0]).toBe(false);
  });
});

describe('liveClockFor: re-sync mot elapsed + last_synced_at', () => {
  it('LIVE: tickar mjukt från lastSyncedAt (30 + 5 min sedan sync = 35)', () => {
    const now = SYNC_MS + 5 * 60_000;
    const clock = liveClockFor(live({ status: 'live', elapsedMinute: 30 }), now);
    expect(clock.displayMinute).toBe(35);
    expect(clock.ticking).toBe(true);
    expect(clock.label).toBe("35'");
  });

  it('LIVE: precis vid sync (0 min sedan) visar elapsed oförändrat', () => {
    const clock = liveClockFor(live({ status: 'live', elapsedMinute: 30 }), SYNC_MS);
    expect(clock.displayMinute).toBe(30);
  });

  it('PAUS: fryser på elapsed, tickar ALDRIG (vattenpaus-kravet)', () => {
    // 20 min efter sync i paus får inte avancera , computeClock ignorerar tiden.
    const now = SYNC_MS + 20 * 60_000;
    const clock = liveClockFor(live({ status: 'paused', elapsedMinute: 45 }), now);
    expect(clock.displayMinute).toBe(45);
    expect(clock.ticking).toBe(false);
    expect(clock.label).toBe('Paus');
  });

  it('FINISHED (frusen): visas som etikett, ingen tick', () => {
    const clock = liveClockFor(live({ status: 'finished', frozen: true }), SYNC_MS + 1e6);
    expect(clock.ticking).toBe(false);
    expect(clock.label).toBe('Slut');
  });

  it('RE-SYNK: en ny push (färsk elapsed + sync) styr klockan, gammal drift nollas', () => {
    // Före push: elapsed 30, 9 min sedan sync -> skulle visat 39.
    const before = liveClockFor(live({ elapsedMinute: 30 }), SYNC_MS + 9 * 60_000);
    expect(before.displayMinute).toBe(39);
    // Pollaren pushar en NY rad: elapsed 41 vid en ny sync-tid. Direkt efter (0 min)
    // visar klockan 41 , den re-synkade mot sanningen, ärvde inte den gamla driften.
    const newSync = Date.parse('2026-06-15T18:41:00.000Z');
    const after = liveClockFor(
      live({ elapsedMinute: 41, lastSyncedAt: '2026-06-15T18:41:00.000Z' }),
      newSync
    );
    expect(after.displayMinute).toBe(41);
  });

  it('KAPAR vid halvleksgräns (44 + 5 min -> "45+", hittar aldrig på tilläggstid)', () => {
    const now = SYNC_MS + 5 * 60_000;
    const clock = liveClockFor(live({ status: 'live', elapsedMinute: 44 }), now);
    expect(clock.displayMinute).toBe(45);
    expect(clock.label).toBe("45+'");
    expect(clock.ticking).toBe(false);
  });

  it('FAIL-SAFE: saknad last_synced_at -> now som bas (0 min sedan, ingen gissad tick)', () => {
    // Utan känd sync-punkt tickar vi inte i väg på en gissning: elapsed visas som det är.
    const clock = liveClockFor(
      live({ status: 'live', elapsedMinute: 22, lastSyncedAt: null }),
      999
    );
    expect(clock.displayMinute).toBe(22);
  });

  it('FAIL-SAFE: oparsbar last_synced_at -> now som bas, ingen NaN-tick', () => {
    const clock = liveClockFor(
      live({ status: 'live', elapsedMinute: 22, lastSyncedAt: 'inte-ett-datum' }),
      12345
    );
    expect(clock.displayMinute).toBe(22);
    expect(Number.isNaN(clock.displayMinute as number)).toBe(false);
  });
});
