import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { BracketPredictionsProvider } from './BracketPredictionsProvider';
import { useBracketPredictionsStore } from './bracket-predictions-context';
import type { BracketPrediction } from '../../data/predictions';
import type { VmSupabaseClient } from '../../data/supabase-browser';
import { teamCode } from '../../domain/team-code';

/** Ett löfte vars resolve går att trigga utifrån (styr async-ordning i testet). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// Mocka bracket-tips-API:t (vi testar provider-wiringen, inte Supabase-anropen som
// testas i bracket-predictions-api.test.ts / RLS-integrationstestet).
const api = vi.hoisted(() => ({
  listMyBracketPredictions: vi.fn(),
  upsertMyBracketPrediction: vi.fn(),
}));
vi.mock('../../data/predictions', () => ({
  listMyBracketPredictions: api.listMyBracketPredictions,
  upsertMyBracketPrediction: api.upsertMyBracketPrediction,
}));

vi.mock('../../data', () => ({
  isSupabaseConfigured: () => true,
  LIVE_READY: true,
}));

vi.mock('../rooms', () => ({
  useRoomsSync: () => ({
    activeRoomId: null,
    sharedResults: [],
    saveResult: vi.fn(),
    tipsRefreshNonce: 0,
  }),
}));

const fakeClient = {} as unknown as VmSupabaseClient;
const env = {} as ImportMetaEnv;

function bp(slotId: string, code: string): BracketPrediction {
  return {
    slotId,
    userId: 'me',
    // Brandning: BracketPrediction-fältet bär Team.code (C1+C2), brandas vid testgränsen.
    advancingTeamId: teamCode(code),
    updatedAt: 't1',
  };
}

function Probe() {
  const store = useBracketPredictionsStore();
  const keys = [...store.myBracketPredictions.keys()].sort().join(',');
  return (
    <div>
      <span data-testid="status">{store.status}</span>
      <span data-testid="enabled">{String(store.enabled)}</span>
      <span data-testid="keys">{keys}</span>
      <button
        type="button"
        onClick={() => {
          store
            .saveBracketPrediction({ slotId: 'M73', advancingTeamId: teamCode('BRA') })
            .catch(() => {});
        }}
      >
        save
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BracketPredictionsProvider', () => {
  it('utan aktivt rum: storen är inaktiv (idle, enabled=false), inget API-anrop', () => {
    render(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId={null}>
        <Probe />
      </BracketPredictionsProvider>
    );
    expect(screen.getByTestId('enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(api.listMyBracketPredictions).not.toHaveBeenCalled();
  });

  it('med aktivt rum: laddar mina bracket-tips och fyller mappen (slotId-nycklar)', async () => {
    api.listMyBracketPredictions.mockResolvedValue([bp('M73', 'BRA'), bp('champion', 'ARG')]);
    render(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="r1">
        <Probe />
      </BracketPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('keys')).toHaveTextContent('M73,champion');
  });

  it('save: speglar in det sparade bracket-tipset i mappen (optimistiskt)', async () => {
    api.listMyBracketPredictions.mockResolvedValue([]);
    api.upsertMyBracketPrediction.mockResolvedValue(bp('M73', 'BRA'));
    render(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="r1">
        <Probe />
      </BracketPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    await act(async () => {
      screen.getByText('save').click();
    });
    await waitFor(() => expect(screen.getByTestId('keys')).toHaveTextContent('M73'));
    expect(api.upsertMyBracketPrediction).toHaveBeenCalledWith(fakeClient, 'r1', {
      slotId: 'M73',
      advancingTeamId: 'BRA',
    });
  });

  it('fel-väg: ett laddningsfel ger status error (fail loud, inte tyst tom)', async () => {
    api.listMyBracketPredictions.mockRejectedValue(new Error('boom'));
    render(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="r1">
        <Probe />
      </BracketPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
  });

  it('EPOCH-VAKT: ett föråldrat laddnings-svar (rum A) skriver inte över ett nyare rum (B)', async () => {
    // Rum A:s laddning hänger (utlöses manuellt EFTER rumsbytet); rum B löser direkt.
    let resolveA!: (v: BracketPrediction[]) => void;
    const aPending = new Promise<BracketPrediction[]>((res) => {
      resolveA = res;
    });
    api.listMyBracketPredictions
      .mockReturnValueOnce(aPending) // rum A: hänger
      .mockResolvedValueOnce([bp('M80', 'FRA')]); // rum B: löser direkt

    const { rerender } = render(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="rA">
        <Probe />
      </BracketPredictionsProvider>
    );
    // Byt till rum B INNAN rum A:s svar landar (bumpar epoch-token).
    rerender(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="rB">
        <Probe />
      </BracketPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('keys')).toHaveTextContent('M80'));

    // Nu landar rum A:s FÖRÅLDRADE svar. Epoch-vakten ska KASTA det (inte visa A:s tips).
    await act(async () => {
      resolveA([bp('M73', 'BRA')]);
      await aPending;
    });
    // Mappen ska fortfarande bara bära rum B:s tips (M80), inte A:s (M73).
    expect(screen.getByTestId('keys')).toHaveTextContent('M80');
    expect(screen.getByTestId('keys')).not.toHaveTextContent('M73');
  });

  it('STALE-SAVE-VAKT: ett save som löser efter ett rumsbyte skriver inte i nya rummets map', async () => {
    api.listMyBracketPredictions.mockResolvedValue([]); // båda rummen: tomma
    // Upserten (startad i rum A) hänger tills vi löser den efter rumsbytet.
    let resolveSave!: (v: BracketPrediction) => void;
    const savePending = new Promise<BracketPrediction>((res) => {
      resolveSave = res;
    });
    api.upsertMyBracketPrediction.mockReturnValueOnce(savePending);

    const { rerender } = render(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="rA">
        <Probe />
      </BracketPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    // Starta ett save i rum A (upserten hänger).
    act(() => {
      screen.getByText('save').click();
    });
    // Byt rum till B medan saven är i await (bumpar epoch-token).
    rerender(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="rB">
        <Probe />
      </BracketPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    // Lös A:s save NU. Stale-vakten ska droppa den lokala spegeln (inte skriva i B:s map).
    await act(async () => {
      resolveSave(bp('M73', 'BRA'));
      await savePending;
    });
    expect(screen.getByTestId('keys')).not.toHaveTextContent('M73');
  });
});

describe('BracketPredictionsProvider, T61 (#110): kopierings-invalidering hämtar om bracket-tipsen utan rum-byte', () => {
  // Samma rotorsak + fix som match-/grupp-tipsen: en kopierings-invalidering
  // (tipsRefreshNonce-bump) hämtar om bracket-tipsen i SAMMA rum, tyst (inget flimmer).

  const statusLog: string[] = [];
  function TrackingProbe() {
    const store = useBracketPredictionsStore();
    statusLog.push(store.status);
    return (
      <div>
        <span data-testid="status">{store.status}</span>
        <span data-testid="count">{store.myBracketPredictions.size}</span>
      </div>
    );
  }

  function Harness() {
    const [nonce, setNonce] = useState(0);
    return (
      <BracketPredictionsProvider
        env={env}
        client={fakeClient}
        activeRoomId="r1"
        tipsRefreshNonce={nonce}
      >
        <TrackingProbe />
        <button onClick={() => setNonce((n) => n + 1)}>bump</button>
      </BracketPredictionsProvider>
    );
  }

  it('nonce-bump hämtar om bracket-tipsen: 1 initial + 1 efter copy, nya raderna syns utan rum-byte', async () => {
    api.listMyBracketPredictions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([bp('M73', 'BRA'), bp('M74', 'ARG')]);

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(api.listMyBracketPredictions).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    await act(async () => {
      screen.getByText('bump').click();
    });
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    expect(api.listMyBracketPredictions).toHaveBeenCalledTimes(2);
  });

  it('kopierings-re-fetchen är TYST: status förblir ready, inget loading-flimmer', async () => {
    statusLog.length = 0;
    const second = deferred<BracketPrediction[]>();
    api.listMyBracketPredictions
      .mockReturnValueOnce(Promise.resolve([]))
      .mockReturnValueOnce(second.promise);

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    const seenReadyAt = statusLog.length;

    await act(async () => {
      screen.getByText('bump').click();
    });
    expect(api.listMyBracketPredictions).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('status')).toHaveTextContent('ready');
    expect(statusLog.slice(seenReadyAt)).not.toContain('loading');

    await act(async () => {
      second.resolve([bp('M73', 'BRA')]);
      await second.promise;
    });
    expect(screen.getByTestId('status')).toHaveTextContent('ready');
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(statusLog.slice(seenReadyAt)).not.toContain('loading');
  });
});

describe('BracketPredictionsProvider, T61 (#110/F1): save-vakten skiljer rum-byte från same-room re-fetch', () => {
  // Copilot R1, F1: save-vakten delade förut loadTokenRef med fetch-vakten, så en copy-
  // invalidering (nonce-bump) i SAMMA rum droppade ett pågående save. Fixen jämför mot
  // RUMMET, inte mot load-token.

  /** Sond med save (slot M73) + nonce-bump i SAMMA rum. */
  function SaveProbe() {
    const store = useBracketPredictionsStore();
    const keys = [...store.myBracketPredictions.keys()].sort().join(',');
    return (
      <div>
        <span data-testid="status">{store.status}</span>
        <span data-testid="keys">{keys}</span>
        <button
          type="button"
          onClick={() => {
            store
              .saveBracketPrediction({ slotId: 'M73', advancingTeamId: teamCode('BRA') })
              .catch(() => {});
          }}
        >
          save
        </button>
      </div>
    );
  }

  it('SAMME RUM: ett pågående save överlever en samtidig copy-invalidering (spegling SKER)', async () => {
    api.listMyBracketPredictions
      .mockResolvedValueOnce([]) // initial: tomt
      .mockResolvedValueOnce([bp('M80', 'FRA')]); // copy-re-fetch: ett inkopierat bracket-tips
    const pendingSave = deferred<BracketPrediction>();
    api.upsertMyBracketPrediction.mockReturnValue(pendingSave.promise);

    function Harness() {
      const [nonce, setNonce] = useState(0);
      return (
        <BracketPredictionsProvider
          env={env}
          client={fakeClient}
          activeRoomId="r1"
          tipsRefreshNonce={nonce}
        >
          <SaveProbe />
          <button onClick={() => setNonce((n) => n + 1)}>bump</button>
        </BracketPredictionsProvider>
      );
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));

    await act(async () => {
      screen.getByText('save').click();
    });
    await act(async () => {
      screen.getByText('bump').click();
    });
    await waitFor(() => expect(screen.getByTestId('keys')).toHaveTextContent('M80'));

    // Lös saven NU. Rummet bytte aldrig -> slot M73 ska speglas in (inte droppas).
    await act(async () => {
      pendingSave.resolve(bp('M73', 'BRA'));
      await pendingSave.promise;
    });
    expect(screen.getByTestId('keys').textContent).toBe('M73,M80');
  });

  it('RUM-BYTE: ett pågående save droppas fortfarande korrekt när rummet byts under await', async () => {
    api.listMyBracketPredictions.mockImplementation(
      async (_client: VmSupabaseClient, roomId: string): Promise<BracketPrediction[]> => {
        if (roomId === 'B') {
          return [bp('M88', 'ESP')];
        }
        return [];
      }
    );
    const pendingSave = deferred<BracketPrediction>();
    api.upsertMyBracketPrediction.mockReturnValue(pendingSave.promise);

    function Harness() {
      const [roomId, setRoomId] = useState('A');
      return (
        <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId={roomId}>
          <SaveProbe />
          <button onClick={() => setRoomId('B')}>to-B</button>
        </BracketPredictionsProvider>
      );
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));

    await act(async () => {
      screen.getByText('save').click();
    });
    await act(async () => {
      screen.getByText('to-B').click();
    });
    await waitFor(() => expect(screen.getByTestId('keys')).toHaveTextContent('M88'));

    await act(async () => {
      pendingSave.resolve(bp('M73', 'BRA'));
      await pendingSave.promise;
    });
    // B:s state är orörd: A:s slot droppades (rummet bytte).
    expect(screen.getByTestId('keys').textContent).toBe('M88');
  });
});
