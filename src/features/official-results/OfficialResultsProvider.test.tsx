import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { OfficialResultsProvider } from './OfficialResultsProvider';
import { useOfficialResultsStore, useOfficialResultsSync } from './official-results-context';
import type { VmSupabaseClient } from '../../data/supabase-browser';
import type { OfficialMatchResult } from '../../data/official';

// Mocka data/official-API:t: vi styr facit + admin-status + skriv-utfall per test,
// utan att slå mot Supabase. Provider:n är limmet vi testar (laddning, save, fel).
const apiState = vi.hoisted(() => ({
  results: [] as OfficialMatchResult[],
  isAdmin: false,
  listError: null as Error | null,
  saveError: null as Error | null,
}));

vi.mock('../../data/official', () => ({
  listOfficialResults: vi.fn(async () => {
    if (apiState.listError) {
      throw apiState.listError;
    }
    return apiState.results;
  }),
  isAppAdmin: vi.fn(async () => apiState.isAdmin),
  upsertOfficialResult: vi.fn(async (_c: unknown, input: { matchId: string }) => {
    if (apiState.saveError) {
      throw apiState.saveError;
    }
    const saved: OfficialMatchResult = {
      matchId: input.matchId,
      homeGoals: 1,
      awayGoals: 0,
      penalties: null,
      status: 'finished',
      updatedBy: 'admin',
      updatedAt: 't',
    };
    return saved;
  }),
}));

// REALTID (T18, #18): mocka realtids-seamen så vi kan FÅNGA den onChange provider:n
// registrerar och fyra en simulerad postgres_changes-händelse manuellt, utan en riktig
// kanal. Vi sparar senaste options så testet kan trigga onChange och se att facit
// re-fetchas (samma tysta väg som fokus/online).
const realtime = vi.hoisted(() => ({
  lastOptions: null as { enabled: boolean; onChange: () => void } | null,
  unsubscribe: vi.fn(),
}));
vi.mock('../../data/realtime', () => ({
  useRealtimeSubscription: (opts: { enabled: boolean; onChange: () => void }) => {
    realtime.lastOptions = opts;
  },
}));

const fakeClient = {} as VmSupabaseClient;
// Live-gaten: env måste se konfigurerad ut OCH liveReady=true (injiceras).
const liveEnv = {
  VITE_SUPABASE_URL: 'https://x.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon',
} as unknown as ImportMetaEnv;

beforeEach(() => {
  apiState.results = [];
  apiState.isAdmin = false;
  apiState.listError = null;
  apiState.saveError = null;
  realtime.lastOptions = null;
  vi.clearAllMocks();
});

/** Liten probe som visar storens status + admin + antal facit-rader. */
function Probe() {
  const store = useOfficialResultsStore();
  return (
    <div>
      <span data-testid="status">{store.status}</span>
      <span data-testid="admin">{String(store.isAdmin)}</span>
      <span data-testid="count">{store.results.length}</span>
      <span data-testid="error">{store.error ?? ''}</span>
      <button
        onClick={() => {
          // Catch:a i probe:n så ett avsiktligt RLS-avslag i ett test inte blir en
          // unhandled rejection. Den RIKTIGA anroparen (admin-formen) visar felet;
          // poängen här är att listan inte växer vid ett misslyckat save.
          store
            .saveOfficialResult({
              matchId: 'g-A-1',
              homeGoals: 1,
              awayGoals: 0,
              status: 'finished',
            })
            .catch(() => {});
        }}
      >
        spara
      </button>
      <button onClick={() => store.refresh().catch(() => {})}>refresh</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <OfficialResultsProvider env={liveEnv} liveReady={true} client={fakeClient}>
      <Probe />
    </OfficialResultsProvider>
  );
}

describe('OfficialResultsProvider', () => {
  it('laddar facit + admin-status och blir ready', async () => {
    apiState.results = [
      {
        matchId: 'g-A-1',
        homeGoals: 3,
        awayGoals: 1,
        penalties: null,
        status: 'finished',
        updatedBy: 'admin',
        updatedAt: 't',
      },
    ];
    apiState.isAdmin = true;
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('admin').textContent).toBe('true');
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('icke-admin: isAdmin = false, facit ändå laddat (read-only)', async () => {
    apiState.isAdmin = false;
    apiState.results = [
      {
        matchId: 'M104',
        homeGoals: 2,
        awayGoals: 2,
        penalties: { homeGoals: 4, awayGoals: 3 },
        status: 'finished',
        updatedBy: 'admin',
        updatedAt: 't',
      },
    ];
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('admin').textContent).toBe('false');
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('save lägger till resultatet optimistiskt i listan', async () => {
    apiState.isAdmin = true;
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('count').textContent).toBe('0');
    await act(async () => {
      screen.getByText('spara').click();
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
  });

  it('fail loud: ett ladd-fel ger status error + meddelande (ingen tyst tom)', async () => {
    apiState.listError = new Error('RLS nej');
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
    expect(screen.getByTestId('error').textContent).toBe('RLS nej');
  });

  it('save fail-loud:ar (kastar) vid RLS-avslag, så UI kan visa felet', async () => {
    apiState.isAdmin = true;
    apiState.saveError = new Error('icke-admin nekas');
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    // Skrivningen kastar; provider:n sväljer inte felet (saveOfficialResult kastar
    // vidare till anroparen som kan visa det, här catch:at i probe:n). Vi verifierar
    // att listan INTE växte (ett misslyckat save ändrar inte facit optimistiskt).
    await act(async () => {
      screen.getByText('spara').click();
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'));
  });

  // Copilot R3: en lyckad refresh ska återhämta en tidigare felad init-load, annars
  // fastnar UI:t i 'error' fast data nu är fräsch.
  it('en lyckad refresh återhämtar ett tidigare ladd-fel (error -> ready, fel rensat)', async () => {
    apiState.listError = new Error('RLS nej');
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));

    // Nästa hämtning lyckas: felet borta, facit finns.
    apiState.listError = null;
    apiState.results = [
      {
        matchId: 'g-A-1',
        homeGoals: 1,
        awayGoals: 0,
        penalties: null,
        status: 'finished',
        updatedBy: 'admin',
        updatedAt: 't',
      },
    ];
    await act(async () => {
      screen.getByText('refresh').click();
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('error').textContent).toBe('');
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  // Copilot R3: när live-läget slås av (enabled false) ska facit + fel rensas, så ett
  // gammalt facit inte ligger kvar i ett läge som ska vara vilande (fail-safe).
  it('när live-läget slås av rensas facit + fel (vilande = fail-safe)', async () => {
    apiState.results = [
      {
        matchId: 'g-A-1',
        homeGoals: 2,
        awayGoals: 1,
        penalties: null,
        status: 'finished',
        updatedBy: 'admin',
        updatedAt: 't',
      },
    ];
    const { rerender } = render(
      <OfficialResultsProvider env={liveEnv} liveReady={true} client={fakeClient}>
        <Probe />
      </OfficialResultsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));

    rerender(
      <OfficialResultsProvider env={liveEnv} liveReady={false} client={fakeClient}>
        <Probe />
      </OfficialResultsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'));
    expect(screen.getByTestId('error').textContent).toBe('');
    expect(screen.getByTestId('status').textContent).toBe('ready');
  });

  // REALTID (T18, #18): en facit-händelse från en ANNAN klient (admin matade in ett
  // resultat någon annanstans) ska köra den TYSTA re-fetchen, så denna klients facit
  // uppdateras live utan reload.
  it('en Realtime-facit-händelse re-fetchar facit (live-uppdatering utan reload)', async () => {
    apiState.isAdmin = false;
    apiState.results = [];
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('count').textContent).toBe('0');

    // Provider:n registrerade en realtids-prenumeration (enabled i live-läge).
    expect(realtime.lastOptions).not.toBeNull();
    expect(realtime.lastOptions!.enabled).toBe(true);

    // Simulera att en ANNAN klient matade in ett resultat: servern har nu en rad.
    apiState.results = [
      {
        matchId: 'g-A-1',
        homeGoals: 2,
        awayGoals: 0,
        penalties: null,
        status: 'finished',
        updatedBy: 'admin',
        updatedAt: 't2',
      },
    ];
    // Fyra realtids-händelsen -> provider:n kör sin tysta refresh.
    await act(async () => {
      realtime.lastOptions!.onChange();
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    // Tyst: ingen 'loading'-flicker, status förblev ready hela tiden.
    expect(screen.getByTestId('status').textContent).toBe('ready');
  });

  it('realtids-prenumerationen är vilande utan live (enabled false)', async () => {
    render(
      <OfficialResultsProvider env={{} as ImportMetaEnv} liveReady={false}>
        <Probe />
      </OfficialResultsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(realtime.lastOptions).not.toBeNull();
    expect(realtime.lastOptions!.enabled).toBe(false);
  });

  it('inaktivt utan Supabase-env: enabled false, status ready, isAdmin false', async () => {
    render(
      <OfficialResultsProvider env={{} as ImportMetaEnv} liveReady={false}>
        <Probe />
      </OfficialResultsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('admin').textContent).toBe('false');
    expect(screen.getByTestId('count').textContent).toBe('0');
  });
});

describe('useOfficialResultsSync (tolerant utan provider)', () => {
  it('returnerar tom lista utan provider (additivt lager, fail-safe)', () => {
    let captured: OfficialMatchResult[] | null = null;
    function SyncProbe() {
      captured = useOfficialResultsSync().officialResults;
      return null;
    }
    render(<SyncProbe />);
    expect(captured).toEqual([]);
  });
});

describe('useOfficialResultsStore (fail loud utan provider)', () => {
  it('kastar utan provider (wiring-fel, inte tyst tom)', () => {
    function BadProbe() {
      useOfficialResultsStore();
      return null;
    }
    // Dämpa Reacts förväntade error-logg för det avsiktliga kastet.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<BadProbe />)).toThrow(/OfficialResultsProvider/);
    spy.mockRestore();
  });
});
