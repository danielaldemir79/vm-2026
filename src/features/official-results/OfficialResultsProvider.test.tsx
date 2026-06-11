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
