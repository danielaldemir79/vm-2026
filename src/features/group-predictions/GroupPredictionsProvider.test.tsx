import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { GroupPredictionsProvider } from './GroupPredictionsProvider';
import { useGroupPredictionsStore } from './group-predictions-context';
import type { GroupPrediction } from '../../data/predictions';
import type { VmSupabaseClient } from '../../data/supabase-browser';

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
  useRoomsSync: () => ({ activeRoomId: null, sharedResults: [], saveResult: vi.fn() }),
}));

const fakeClient = {} as unknown as VmSupabaseClient;
const env = {} as ImportMetaEnv;

function gp(groupId: string, winner: string, runnerUp: string): GroupPrediction {
  return {
    groupId,
    userId: 'me',
    winnerTeamId: winner,
    runnerUpTeamId: runnerUp,
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
            .saveGroupPrediction({ groupId: 'A', winnerTeamId: 'MEX', runnerUpTeamId: 'RSA' })
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
