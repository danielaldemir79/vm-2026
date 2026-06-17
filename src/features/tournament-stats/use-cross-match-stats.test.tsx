// Tester för den ÅTERANVÄNDBARA cross-match-STATISTICS-hooken (T88, #180). Spegelbild av
// use-cross-match-events.test.tsx men för statistics-blobben. Fokus (delad T91-spine):
//   1. Fixtures-läge: en initial hämtning av committad fixtures-statistik, blir ready.
//   2. NEAR-LIVE (T91-spine): statistik om-hämtas vid ett Realtime-event, vid online/visibility
//      OCH periodiskt (poll), så uppdaterad statistik syns inom sekunder.
//   3. NEGATIV-KONTROLL: fixtures-läge väcker INGEN poll och ingen Realtime-kanal.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCrossMatchStats } from './use-cross-match-stats';
import { NEAR_LIVE_POLL_INTERVAL_MS } from './use-near-live-collection';

const FIXTURES_ENV = {} as ImportMetaEnv;
const LIVE_ENV = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-test-key',
} as unknown as ImportMetaEnv;

describe('useCrossMatchStats (fixtures-läge)', () => {
  it('laddar committad fixtures-statistik och blir ready', async () => {
    const { result } = renderHook(() => useCrossMatchStats(FIXTURES_ENV, false));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.error).toBeNull();
    // Fixtures bär minst en match med per-lags-statistik (renderbar utan backend).
    expect(result.current.matches.length).toBeGreaterThan(0);
    expect(result.current.matches.some((m) => m.statistics.length > 0)).toBe(true);
  });

  it('matches är tom under laddning (ingen stale-data lekt ut)', async () => {
    const { result } = renderHook(() => useCrossMatchStats(FIXTURES_ENV, false));
    expect(result.current.matches.length).toBe(0);
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});

// NEAR-LIVE-SKYDDSNÄTET (T91-spine). Mockar källan + Realtime-kanalen så vi kan räkna
// hämtningar och fyra fallback-händelser deterministiskt.
const { getLiveStatsSpy } = vi.hoisted(() => ({ getLiveStatsSpy: vi.fn() }));
let lastRealtimeOnChange: (() => void) | null = null;

vi.mock('../../data/livescore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/livescore')>();
  getLiveStatsSpy.mockImplementation((...args: Parameters<typeof actual.getLiveStats>) =>
    actual.getLiveStats(...args)
  );
  return { ...actual, getLiveStats: getLiveStatsSpy };
});

vi.mock('../../data/realtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/realtime')>();
  return {
    ...actual,
    useRealtimeSubscription: (opts: { onChange: () => void; enabled: boolean }) => {
      lastRealtimeOnChange = opts.enabled ? opts.onChange : null;
    },
  };
});

vi.mock('../../data/supabase-browser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase-browser')>();
  return { ...actual, getSupabaseClient: () => ({}) as unknown };
});

describe('useCrossMatchStats (live-läge: near-live-skyddsnät, T91-spine)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getLiveStatsSpy.mockReset();
    getLiveStatsSpy.mockResolvedValue([]);
    lastRealtimeOnChange = null;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  async function settleInitialLoad() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it('hämtar en gång vid mount (initial load)', async () => {
    renderHook(() => useCrossMatchStats(LIVE_ENV, true));
    await settleInitialLoad();
    expect(getLiveStatsSpy).toHaveBeenCalledTimes(1);
  });

  it('NEAR-LIVE: ett Realtime-event (uppdaterad statistik skriven) triggar en om-hämtning', async () => {
    const { result } = renderHook(() => useCrossMatchStats(LIVE_ENV, true));
    await settleInitialLoad();
    expect(getLiveStatsSpy).toHaveBeenCalledTimes(1);
    expect(lastRealtimeOnChange).not.toBeNull();

    getLiveStatsSpy.mockResolvedValue([
      {
        matchId: 'g-A-1',
        statistics: [
          {
            teamApiId: 6,
            teamName: 'Brasilien',
            statistics: [{ type: 'Ball Possession', value: '62%' }],
          },
        ],
      },
    ]);
    await act(async () => {
      lastRealtimeOnChange?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getLiveStatsSpy).toHaveBeenCalledTimes(2);
    expect(result.current.matches[0]?.statistics[0]?.teamName).toBe('Brasilien');
  });

  it('POLL-FALLBACK: om-hämtar periodiskt även utan Realtime-event', async () => {
    renderHook(() => useCrossMatchStats(LIVE_ENV, true));
    await settleInitialLoad();
    expect(getLiveStatsSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NEAR_LIVE_POLL_INTERVAL_MS);
    });
    expect(getLiveStatsSpy).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NEAR_LIVE_POLL_INTERVAL_MS);
    });
    expect(getLiveStatsSpy).toHaveBeenCalledTimes(3);
  });

  it('NEGATIV-KONTROLL: fixtures-läge väcker INGEN poll och ingen Realtime-kanal', async () => {
    renderHook(() => useCrossMatchStats(FIXTURES_ENV, false));
    await settleInitialLoad();
    expect(getLiveStatsSpy).toHaveBeenCalledTimes(1);
    expect(lastRealtimeOnChange).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NEAR_LIVE_POLL_INTERVAL_MS * 3);
    });
    expect(getLiveStatsSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getLiveStatsSpy).toHaveBeenCalledTimes(1);
  });
});
