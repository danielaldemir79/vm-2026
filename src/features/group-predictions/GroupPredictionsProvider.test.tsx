import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { GroupPredictionsProvider } from './GroupPredictionsProvider';
import { useGroupPredictionsStore } from './group-predictions-context';
import type { GroupPrediction } from '../../data/predictions';
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

// Mocka grupp-tips-API:t (vi testar provider-wiringen, inte Supabase-anropen som
// testas i group-predictions-api.test.ts / RLS-integrationstestet).
const api = vi.hoisted(() => ({
  listMyGroupPredictions: vi.fn(),
  upsertMyGroupPrediction: vi.fn(),
}));
vi.mock('../../data/predictions', () => ({
  listMyGroupPredictions: api.listMyGroupPredictions,
  upsertMyGroupPrediction: api.upsertMyGroupPrediction,
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

function gp(groupId: string, winner: string, runnerUp: string): GroupPrediction {
  return {
    groupId,
    userId: 'me',
    // Brandning: GroupPrediction-fälten bär Team.code (C1+C2), brandas vid testgränsen.
    winnerTeamId: teamCode(winner),
    runnerUpTeamId: teamCode(runnerUp),
    updatedAt: 't1',
  };
}

function Probe() {
  const store = useGroupPredictionsStore();
  const keys = [...store.myGroupPredictions.keys()].sort().join(',');
  return (
    <div>
      <span data-testid="status">{store.status}</span>
      <span data-testid="enabled">{String(store.enabled)}</span>
      <span data-testid="keys">{keys}</span>
      <button
        type="button"
        onClick={() => {
          store
            .saveGroupPrediction({
              groupId: 'A',
              winnerTeamId: teamCode('MEX'),
              runnerUpTeamId: teamCode('RSA'),
            })
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

describe('GroupPredictionsProvider', () => {
  it('utan aktivt rum: storen är inaktiv (idle, enabled=false), inget API-anrop', async () => {
    render(
      <GroupPredictionsProvider env={env} client={fakeClient} activeRoomId={null}>
        <Probe />
      </GroupPredictionsProvider>
    );
    expect(screen.getByTestId('enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(api.listMyGroupPredictions).not.toHaveBeenCalled();
  });

  it('med aktivt rum: laddar mina grupp-tips och fyller mappen', async () => {
    api.listMyGroupPredictions.mockResolvedValue([gp('A', 'MEX', 'RSA'), gp('B', 'CAN', 'BIH')]);
    render(
      <GroupPredictionsProvider env={env} client={fakeClient} activeRoomId="r1">
        <Probe />
      </GroupPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('keys')).toHaveTextContent('A,B');
  });

  it('save: speglar in det sparade grupp-tipset i mappen (optimistiskt)', async () => {
    api.listMyGroupPredictions.mockResolvedValue([]);
    api.upsertMyGroupPrediction.mockResolvedValue(gp('A', 'MEX', 'RSA'));
    render(
      <GroupPredictionsProvider env={env} client={fakeClient} activeRoomId="r1">
        <Probe />
      </GroupPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    await act(async () => {
      screen.getByText('save').click();
    });
    await waitFor(() => expect(screen.getByTestId('keys')).toHaveTextContent('A'));
    // Sparades mot rätt rum + input (user_id sätts av API:t ur sessionen).
    expect(api.upsertMyGroupPrediction).toHaveBeenCalledWith(fakeClient, 'r1', {
      groupId: 'A',
      winnerTeamId: 'MEX',
      runnerUpTeamId: 'RSA',
    });
  });

  it('fel-väg: ett laddningsfel ger status error (fail loud, inte tyst tom)', async () => {
    api.listMyGroupPredictions.mockRejectedValue(new Error('boom'));
    render(
      <GroupPredictionsProvider env={env} client={fakeClient} activeRoomId="r1">
        <Probe />
      </GroupPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
  });
});

describe('GroupPredictionsProvider, T61 (#110): kopierings-invalidering hämtar om grupp-tipsen utan rum-byte', () => {
  // Samma rotorsak + fix som match-tipsen: en kopierings-invalidering (tipsRefreshNonce-
  // bump) hämtar om grupp-tipsen i SAMMA rum, tyst (inget loading-flimmer).

  const statusLog: string[] = [];
  function TrackingProbe() {
    const store = useGroupPredictionsStore();
    statusLog.push(store.status);
    return (
      <div>
        <span data-testid="status">{store.status}</span>
        <span data-testid="count">{store.myGroupPredictions.size}</span>
      </div>
    );
  }

  function Harness() {
    const [nonce, setNonce] = useState(0);
    return (
      <GroupPredictionsProvider
        env={env}
        client={fakeClient}
        activeRoomId="r1"
        tipsRefreshNonce={nonce}
      >
        <TrackingProbe />
        <button onClick={() => setNonce((n) => n + 1)}>bump</button>
      </GroupPredictionsProvider>
    );
  }

  it('nonce-bump hämtar om grupp-tipsen: 1 initial + 1 efter copy, nya raderna syns utan rum-byte', async () => {
    api.listMyGroupPredictions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([gp('A', 'MEX', 'RSA'), gp('B', 'CAN', 'BIH')]);

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(api.listMyGroupPredictions).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    await act(async () => {
      screen.getByText('bump').click();
    });
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    expect(api.listMyGroupPredictions).toHaveBeenCalledTimes(2);
  });

  it('kopierings-re-fetchen är TYST: status förblir ready, inget loading-flimmer', async () => {
    statusLog.length = 0;
    const second = deferred<GroupPrediction[]>();
    api.listMyGroupPredictions
      .mockReturnValueOnce(Promise.resolve([]))
      .mockReturnValueOnce(second.promise);

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    const seenReadyAt = statusLog.length;

    await act(async () => {
      screen.getByText('bump').click();
    });
    expect(api.listMyGroupPredictions).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('status')).toHaveTextContent('ready');
    expect(statusLog.slice(seenReadyAt)).not.toContain('loading');

    await act(async () => {
      second.resolve([gp('A', 'MEX', 'RSA')]);
      await second.promise;
    });
    expect(screen.getByTestId('status')).toHaveTextContent('ready');
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(statusLog.slice(seenReadyAt)).not.toContain('loading');
  });
});
