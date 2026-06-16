// Tester för useLiveData (Bit 3b + T91). Två fokus:
//   1. SKARVEN (fixtures-läge): den committade demo-raden ('api-<id>') re-nycklas till
//      sitt APP-match-id ('g-F-1') via Bit 1:s resolver, så dagsvyn (som slår upp på
//      app-match-id) faktiskt träffar. Just den mappnings-gren som annars tyst kunde bli
//      fel (lessons "bevisa skarven").
//   2. AUTO-UPPDATERINGENS SKYDDSNÄT (T91, #184): live-vyn fick inte ny ställning förrän
//      en manuell omladdning. Rotorsaken var att useLiveData enbart hade Realtime , INGEN
//      poll-fallback eller fokus/online/visibility-refetch när Realtime missar/tappar
//      (precis det skyddsnät OfficialResultsProvider redan har). Dessa tester bevisar att
//      live-data om-hämtas vid online/visibility OCH periodiskt (poll), så ett missat
//      Realtime-event aldrig fryser ställningen, samt negativ-kontroll att fixtures-läget
//      INTE väcker poll/lyssnare (ingen backend att slå mot).
//
// Env-injektion (default-arg) väljer källa: ett tomt env-objekt = fixtures-läge (ingen
// Supabase-konfig), exakt som datalagrets gate, så testet kör utan backend/nätverk. För
// live-grenen mockas getLiveData (räknbara hämtningar) + useRealtimeSubscription (så vi
// isolerar fallback-vägarna från den riktiga kanalen).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLiveData, LIVE_POLL_INTERVAL_MS } from './use-live-data';

// STABILA env-referenser (skapas EN gång, inte i render-callbacken): useLiveData har env
// direkt i load-effektens deps (precis som appen, där env = import.meta.env är en stabil
// singleton). Ett NYTT env-objekt per render skulle få effekten att re-köra varje render
// -> oändlig load-loop. Appen drabbas aldrig (stabil singleton); testet måste därför ge
// en lika stabil referens, annars testar vi en artefakt i stället för hooken.
const FIXTURES_ENV = {} as ImportMetaEnv;
const LIVE_ENV = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-test-key',
} as unknown as ImportMetaEnv;

/** Tomt env = ingen Supabase-konfig = fixtures-läge (datalagrets gate). */
function fixturesEnv(): ImportMetaEnv {
  return FIXTURES_ENV;
}

/** Live-env: url + nyckel satta => isSupabaseConfigured(env) true (med liveReady=true). */
function liveEnv(): ImportMetaEnv {
  return LIVE_ENV;
}

describe('useLiveData (fixtures-läge)', () => {
  it('laddar och blir ready', async () => {
    const { result } = renderHook(() => useLiveData(fixturesEnv(), false));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.error).toBeNull();
  });

  it('re-nycklar demo-raden till APP-match-id (g-F-1, Nederländerna-Japan)', async () => {
    const { result } = renderHook(() => useLiveData(fixturesEnv(), false));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    // Re-nyckling: app-match-id finns, råa 'api-...'-nyckeln gör det INTE.
    expect(result.current.byMatchId.has('g-F-1')).toBe(true);
    expect(result.current.byMatchId.has('api-1489376')).toBe(false);
    // Raden bär den riktiga demo-datan (en pågående match med rika blobbar).
    const row = result.current.byMatchId.get('g-F-1');
    expect(row?.status).toBe('live');
    expect(row?.events.length).toBeGreaterThan(0);
    expect(row?.statistics.length).toBeGreaterThan(0);
    expect(row?.lineups.length).toBeGreaterThan(0);
  });

  it('byMatchId är tom under laddning (ingen stale-data lekt ut)', async () => {
    const { result } = renderHook(() => useLiveData(fixturesEnv(), false));
    // Den SYNKRONA initiala renderingen: ingen data ännu (poängen med testet).
    expect(result.current.byMatchId.size).toBe(0);
    // Låt den asynkrona hämtningen settla INNAN testet stänger, så dess setState sker
    // inuti ett väntat act (ingen "update outside act"-varning, pristine logg).
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});

// AUTO-UPPDATERINGENS SKYDDSNÄT (T91). Mockar live-källan + Realtime-kanalen så vi kan
// räkna hämtningar och fyra fallback-händelser deterministiskt.
//
// VIKTIGT: getLiveData-spionen DELEGERAR TILL DEN RIKTIGA implementationen by default
// (live-suitens beforeEach överstyr via getLiveDataSpy.mockResolvedValue). Så fixtures-
// suiten ovan (som kör den äkta vägen) påverkas inte , den ärver default-impl som anropar
// originalet. Vi räknar ändå alltid anropen (spy.mock.calls), oavsett vem som svarar.
//
// vi.hoisted: vi.mock hissas till filtoppen, så spionen MÅSTE skapas i samma hissade
// fas för att vara åtkomlig i mock-factoryn (annars TDZ-fel). Standardmönstret.
const { getLiveDataSpy } = vi.hoisted(() => ({ getLiveDataSpy: vi.fn() }));
let lastRealtimeOnChange: (() => void) | null = null;

vi.mock('../../data/livescore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/livescore')>();
  // Default-implementationen = originalet, så ett tomt (oöverstyrt) spy kör äkta vägen.
  getLiveDataSpy.mockImplementation((...args: Parameters<typeof actual.getLiveData>) =>
    actual.getLiveData(...args)
  );
  return {
    ...actual,
    getLiveData: getLiveDataSpy,
  };
});

// Isolera fallback-vägarna från den riktiga kanalen: fånga onChange så ett test kan
// simulera ett Realtime-event, men ingen WebSocket öppnas i jsdom.
vi.mock('../../data/realtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/realtime')>();
  return {
    ...actual,
    useRealtimeSubscription: (opts: { onChange: () => void; enabled: boolean }) => {
      lastRealtimeOnChange = opts.enabled ? opts.onChange : null;
    },
  };
});

// supabase-browser mockas så live-grenen inte försöker skapa en riktig klient.
vi.mock('../../data/supabase-browser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase-browser')>();
  return {
    ...actual,
    getSupabaseClient: () => ({}) as unknown,
  };
});

describe('useLiveData (live-läge: auto-uppdaterings-skyddsnät, T91)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getLiveDataSpy.mockReset();
    getLiveDataSpy.mockResolvedValue([]);
    lastRealtimeOnChange = null;
  });

  afterEach(() => {
    // Rensa kvarvarande poll-intervall UTAN att fyra det (att köra det skulle bumpa
    // refetch-nonce -> en setState efter att testet stängt, utanför act = brus i loggen).
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  /** Låt den initiala hämtningen settla (mikrotask + ev. timers). */
  async function settleInitialLoad() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it('hämtar live-data en gång vid mount (initial load)', async () => {
    renderHook(() => useLiveData(liveEnv(), true));
    await settleInitialLoad();
    expect(getLiveDataSpy).toHaveBeenCalledTimes(1);
  });

  it('om-hämtar vid online-event (Realtime kan ha missat under offline)', async () => {
    renderHook(() => useLiveData(liveEnv(), true));
    await settleInitialLoad();
    expect(getLiveDataSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getLiveDataSpy).toHaveBeenCalledTimes(2);
  });

  it('om-hämtar när fliken blir synlig igen (PWA-väckning, missat medan bakgrundad)', async () => {
    renderHook(() => useLiveData(liveEnv(), true));
    await settleInitialLoad();
    expect(getLiveDataSpy).toHaveBeenCalledTimes(1);

    // Simulera att fliken döljs och sen blir synlig igen.
    const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get');
    visibilitySpy.mockReturnValue('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    // Dold -> ingen extra hämtning (vi väcker bara på synlig).
    expect(getLiveDataSpy).toHaveBeenCalledTimes(1);

    visibilitySpy.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getLiveDataSpy).toHaveBeenCalledTimes(2);
    visibilitySpy.mockRestore();
  });

  it('POLL-FALLBACK: om-hämtar periodiskt även utan Realtime-event (det missade målet)', async () => {
    renderHook(() => useLiveData(liveEnv(), true));
    await settleInitialLoad();
    expect(getLiveDataSpy).toHaveBeenCalledTimes(1);

    // Ett helt poll-intervall utan något Realtime-event: skyddsnätet ska ändå hämta.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_INTERVAL_MS);
    });
    expect(getLiveDataSpy).toHaveBeenCalledTimes(2);

    // Och igen nästa intervall (kontinuerligt skyddsnät, inte en engångs-timeout).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_INTERVAL_MS);
    });
    expect(getLiveDataSpy).toHaveBeenCalledTimes(3);
  });

  it('ett Realtime-event triggar fortfarande en om-hämtning (kanalen lever kvar)', async () => {
    renderHook(() => useLiveData(liveEnv(), true));
    await settleInitialLoad();
    expect(getLiveDataSpy).toHaveBeenCalledTimes(1);
    expect(lastRealtimeOnChange).not.toBeNull();

    await act(async () => {
      lastRealtimeOnChange?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getLiveDataSpy).toHaveBeenCalledTimes(2);
  });

  it('NEGATIV-KONTROLL: fixtures-läge väcker INGEN poll och ingen Realtime-kanal', async () => {
    renderHook(() => useLiveData(fixturesEnv(), false));
    await settleInitialLoad();
    // En initial hämtning (fixtures), men ingen Realtime-kanal kopplas (enabled=false).
    expect(getLiveDataSpy).toHaveBeenCalledTimes(1);
    expect(lastRealtimeOnChange).toBeNull();

    // Flera poll-intervall passerar: ingen extra hämtning (ingen backend att polla).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_INTERVAL_MS * 3);
    });
    expect(getLiveDataSpy).toHaveBeenCalledTimes(1);

    // Online/visibility-event i fixtures-läge ska inte heller hämta (ingen källa att synka).
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getLiveDataSpy).toHaveBeenCalledTimes(1);
  });
});
