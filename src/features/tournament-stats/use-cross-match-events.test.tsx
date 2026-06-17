// Tester för den ÅTERANVÄNDBARA cross-match-events-hooken (T87, #179; T88 lutar sig på den).
// Fokus, samma struktur som use-live-data.test (delad T91-spine):
//   1. Fixtures-läge: en initial hämtning av committade fixtures-events, blir ready (renderbar
//      utan backend).
//   2. NEAR-LIVE (T91-spine): live-data om-hämtas vid ett Realtime-event, vid online/visibility
//      OCH periodiskt (poll), så ett nytt mål syns inom sekunder utan manuell omladdning.
//   3. NEGATIV-KONTROLL: fixtures-läge väcker INGEN poll och ingen Realtime-kanal (ingen
//      backend att slå mot).
//
// Live-grenen mockar getLiveEvents (räknbara hämtningar) + useRealtimeSubscription (så vi
// isolerar fallback-vägarna från den riktiga WebSocket-kanalen), exakt som use-live-data.test.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCrossMatchEvents, CROSS_MATCH_POLL_INTERVAL_MS } from './use-cross-match-events';

// STABILA env-referenser (skapas EN gång): hooken har env i load-effektens deps. Ett NYTT
// env-objekt per render skulle re-köra effekten varje render -> oändlig load-loop. Appen
// drabbas aldrig (import.meta.env är en stabil singleton); testet måste ge samma stabilitet.
const FIXTURES_ENV = {} as ImportMetaEnv;
const LIVE_ENV = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-test-key',
} as unknown as ImportMetaEnv;

describe('useCrossMatchEvents (fixtures-läge)', () => {
  it('laddar committade fixtures-events och blir ready', async () => {
    const { result } = renderHook(() => useCrossMatchEvents(FIXTURES_ENV, false));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.error).toBeNull();
    // Fixtures bär minst en match med events (skytteligan kan renderas utan backend).
    expect(result.current.matches.length).toBeGreaterThan(0);
    expect(result.current.matches.some((m) => m.events.some((e) => e.kind === 'goal'))).toBe(true);
  });

  it('matches är tom under laddning (ingen stale-data lekt ut)', async () => {
    const { result } = renderHook(() => useCrossMatchEvents(FIXTURES_ENV, false));
    expect(result.current.matches.length).toBe(0);
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});

// NEAR-LIVE-SKYDDSNÄTET (T91-spine). Mockar källan + Realtime-kanalen så vi kan räkna
// hämtningar och fyra fallback-händelser deterministiskt (samma mönster som use-live-data.test).
const { getLiveEventsSpy } = vi.hoisted(() => ({ getLiveEventsSpy: vi.fn() }));
let lastRealtimeOnChange: (() => void) | null = null;

vi.mock('../../data/livescore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/livescore')>();
  // Default = originalet, så ett oöverstyrt spy kör äkta vägen (fixtures-suiten ovan).
  getLiveEventsSpy.mockImplementation((...args: Parameters<typeof actual.getLiveEvents>) =>
    actual.getLiveEvents(...args)
  );
  return { ...actual, getLiveEvents: getLiveEventsSpy };
});

// Isolera fallback-vägarna från den riktiga kanalen: fånga onChange så ett test kan simulera
// ett Realtime-event, men ingen WebSocket öppnas i jsdom.
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

describe('useCrossMatchEvents (live-läge: near-live-skyddsnät, T91-spine)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getLiveEventsSpy.mockReset();
    getLiveEventsSpy.mockResolvedValue([]);
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
    renderHook(() => useCrossMatchEvents(LIVE_ENV, true));
    await settleInitialLoad();
    expect(getLiveEventsSpy).toHaveBeenCalledTimes(1);
  });

  it('NEAR-LIVE: ett Realtime-event (nytt mål skrivet) triggar en om-hämtning', async () => {
    const { result } = renderHook(() => useCrossMatchEvents(LIVE_ENV, true));
    await settleInitialLoad();
    expect(getLiveEventsSpy).toHaveBeenCalledTimes(1);
    expect(lastRealtimeOnChange).not.toBeNull();

    // Simulera att pollaren skrev ett nytt mål -> Realtime-push -> ny data syns.
    getLiveEventsSpy.mockResolvedValue([
      {
        matchId: 'g-A-1',
        events: [
          {
            minute: 12,
            extra: null,
            kind: 'goal',
            rawType: 'Goal',
            detail: 'Normal Goal',
            teamApiId: 6,
            teamName: 'Brasilien',
            playerId: 100,
            playerName: 'Ny skytt',
            assistId: null,
            assistName: null,
            cardColor: null,
          },
        ],
      },
    ]);
    await act(async () => {
      lastRealtimeOnChange?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getLiveEventsSpy).toHaveBeenCalledTimes(2);
    // Den nya datan syns i hooken (aggregeringen ovanpå skulle nu räkna om).
    expect(result.current.matches[0]?.events[0]?.playerName).toBe('Ny skytt');
  });

  it('POLL-FALLBACK: om-hämtar periodiskt även utan Realtime-event (det missade målet)', async () => {
    renderHook(() => useCrossMatchEvents(LIVE_ENV, true));
    await settleInitialLoad();
    expect(getLiveEventsSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CROSS_MATCH_POLL_INTERVAL_MS);
    });
    expect(getLiveEventsSpy).toHaveBeenCalledTimes(2);
    // Kontinuerligt skyddsnät, inte en engångs-timeout.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CROSS_MATCH_POLL_INTERVAL_MS);
    });
    expect(getLiveEventsSpy).toHaveBeenCalledTimes(3);
  });

  it('om-hämtar vid online + vid visibility (PWA-väckning), inte vid hidden', async () => {
    renderHook(() => useCrossMatchEvents(LIVE_ENV, true));
    await settleInitialLoad();
    expect(getLiveEventsSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getLiveEventsSpy).toHaveBeenCalledTimes(2);

    const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get');
    visibilitySpy.mockReturnValue('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getLiveEventsSpy).toHaveBeenCalledTimes(2); // dold -> ingen hämtning

    visibilitySpy.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getLiveEventsSpy).toHaveBeenCalledTimes(3);
    visibilitySpy.mockRestore();
  });

  it('NEGATIV-KONTROLL: fixtures-läge väcker INGEN poll och ingen Realtime-kanal', async () => {
    renderHook(() => useCrossMatchEvents(FIXTURES_ENV, false));
    await settleInitialLoad();
    expect(getLiveEventsSpy).toHaveBeenCalledTimes(1);
    expect(lastRealtimeOnChange).toBeNull(); // ingen kanal kopplad (enabled=false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CROSS_MATCH_POLL_INTERVAL_MS * 3);
    });
    expect(getLiveEventsSpy).toHaveBeenCalledTimes(1); // ingen backend att polla

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getLiveEventsSpy).toHaveBeenCalledTimes(1); // ingen källa att synka mot
  });
});
