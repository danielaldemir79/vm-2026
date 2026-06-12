import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { JokerProvider } from './JokerProvider';
import { useJokerStore } from './joker-context';
import type { RoomJoker } from '../../data/predictions';
import type { VmSupabaseClient } from '../../data/supabase-browser';

// Mocka joker-API:t (vi testar provider-wiringen, inte Supabase-anropen, som testas i
// room-joker-api.test.ts + RLS-integrationstestet).
const api = vi.hoisted(() => ({
  listMyJokers: vi.fn(),
  upsertMyJoker: vi.fn(),
  removeMyJoker: vi.fn(),
}));
vi.mock('../../data/predictions', () => ({
  listMyJokers: api.listMyJokers,
  upsertMyJoker: api.upsertMyJoker,
  removeMyJoker: api.removeMyJoker,
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

function joker(matchId: string, jokerDay: string): RoomJoker {
  return { matchId, userId: 'me', jokerDay, updatedAt: 't1' };
}

/** Sond som exponerar storen + knappar för set/clear. */
function Probe() {
  const store = useJokerStore();
  const [err, setErr] = useState<string | null>(null);
  const keys = [...store.myJokers.keys()].sort().join(',');
  return (
    <div>
      <span data-testid="status">{store.status}</span>
      <span data-testid="enabled">{String(store.enabled)}</span>
      <span data-testid="keys">{keys}</span>
      <span data-testid="error">{err ?? ''}</span>
      <button onClick={() => store.setJoker('g-A-2').catch((e: unknown) => setErr(String(e)))}>
        set
      </button>
      <button onClick={() => store.clearJoker('g-A-1').catch((e: unknown) => setErr(String(e)))}>
        clear
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('JokerProvider', () => {
  it('UTAN aktivt rum: idle, inte enabled, inga joker laddas', () => {
    render(
      <JokerProvider env={env} liveReady client={fakeClient} activeRoomId={null}>
        <Probe />
      </JokerProvider>
    );
    expect(screen.getByTestId('status').textContent).toBe('idle');
    expect(screen.getByTestId('enabled').textContent).toBe('false');
    expect(api.listMyJokers).not.toHaveBeenCalled();
  });

  it('MED aktivt rum: laddar mina joker och blir ready', async () => {
    api.listMyJokers.mockResolvedValue([joker('g-A-1', '2026-06-11')]);
    render(
      <JokerProvider env={env} liveReady client={fakeClient} activeRoomId="r1">
        <Probe />
      </JokerProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('keys').textContent).toBe('g-A-1');
  });

  it('setJoker speglar in jokern optimistiskt + STÄDAR bort en befintlig joker SAMMA dag', async () => {
    // Befintlig joker g-A-1 (2026-06-11). Vi sätter g-A-2 SAMMA dag -> g-A-1 ska bort (en/dag).
    api.listMyJokers.mockResolvedValue([joker('g-A-1', '2026-06-11')]);
    api.upsertMyJoker.mockResolvedValue(joker('g-A-2', '2026-06-11')); // samma dag
    render(
      <JokerProvider env={env} liveReady client={fakeClient} activeRoomId="r1">
        <Probe />
      </JokerProvider>
    );
    await waitFor(() => expect(screen.getByTestId('keys').textContent).toBe('g-A-1'));
    screen.getByText('set').click();
    await waitFor(() => expect(screen.getByTestId('keys').textContent).toBe('g-A-2'));
    expect(api.upsertMyJoker).toHaveBeenCalledWith(fakeClient, 'r1', { matchId: 'g-A-2' });
  });

  it('setJoker på en ANNAN dag BEHÅLLER den befintliga jokern (en per dag, flera dagar OK)', async () => {
    api.listMyJokers.mockResolvedValue([joker('g-A-1', '2026-06-11')]);
    api.upsertMyJoker.mockResolvedValue(joker('g-A-2', '2026-06-12')); // ANNAN dag
    render(
      <JokerProvider env={env} liveReady client={fakeClient} activeRoomId="r1">
        <Probe />
      </JokerProvider>
    );
    await waitFor(() => expect(screen.getByTestId('keys').textContent).toBe('g-A-1'));
    screen.getByText('set').click();
    await waitFor(() => expect(screen.getByTestId('keys').textContent).toBe('g-A-1,g-A-2'));
  });

  it('clearJoker tar bort jokern lokalt', async () => {
    api.listMyJokers.mockResolvedValue([joker('g-A-1', '2026-06-11')]);
    api.removeMyJoker.mockResolvedValue(undefined);
    render(
      <JokerProvider env={env} liveReady client={fakeClient} activeRoomId="r1">
        <Probe />
      </JokerProvider>
    );
    await waitFor(() => expect(screen.getByTestId('keys').textContent).toBe('g-A-1'));
    screen.getByText('clear').click();
    await waitFor(() => expect(screen.getByTestId('keys').textContent).toBe(''));
    expect(api.removeMyJoker).toHaveBeenCalledWith(fakeClient, 'r1', 'g-A-1');
  });

  it('FAIL LOUD: ett laddningsfel sätter error-status', async () => {
    api.listMyJokers.mockRejectedValue(new Error('RLS nekade'));
    render(
      <JokerProvider env={env} liveReady client={fakeClient} activeRoomId="r1">
        <Probe />
      </JokerProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
  });
});
