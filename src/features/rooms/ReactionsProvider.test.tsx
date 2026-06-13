// Tester för ReactionsProvider (T24, #24): laddning, tyst re-fetch (realtids-signal),
// optimistisk react/byt/ta-bort, aggregering, fail-loud-vägar och realtids-seamen.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { ReactionsProvider } from './ReactionsProvider';
import { useReactionsStore } from './reactions-context';
import { summaryForMatch } from './reaction-aggregate';
import type { VmSupabaseClient } from '../../data/supabase-browser';

// Mocka data/rooms (api) + data (live-gate) + realtids-seamen. Vi testar provider-
// logiken (laddning, aggregering, optimism), inte nät/kanal-API:t. REACTION_EMOJIS
// behövs av reaction-aggregate, så vi speglar den i mocken.
const api = vi.hoisted(() => ({
  listRoomReactions: vi.fn(),
  upsertMyReaction: vi.fn(),
  removeMyReaction: vi.fn(),
}));
vi.mock('../../data/rooms', () => ({
  listRoomReactions: api.listRoomReactions,
  upsertMyReaction: api.upsertMyReaction,
  removeMyReaction: api.removeMyReaction,
  REACTION_EMOJIS: ['⚽', '🔥', '😂', '😭', '🎉', '👏', '😱', '🧊'],
}));
vi.mock('../../data', () => ({
  isSupabaseConfigured: () => true,
  LIVE_READY: true,
}));
vi.mock('../../data/supabase-browser', () => ({
  getSupabaseClient: () => ({}) as VmSupabaseClient,
}));
// Fånga den onChange provider:n ger realtids-seamen, så vi kan SIMULERA en signal.
const realtime = vi.hoisted(() => ({ lastOnChange: null as null | (() => void), calls: 0 }));
vi.mock('../../data/realtime', () => ({
  useRealtimeSubscription: (opts: { enabled: boolean; onChange: () => void }) => {
    if (opts.enabled) {
      realtime.lastOnChange = opts.onChange;
      realtime.calls += 1;
    }
  },
}));

const fakeClient = {} as VmSupabaseClient;

function react(userId: string, matchId: string, emoji: string, roomId = 'room1') {
  return { roomId, userId, matchId, emoji, createdAt: '2026-06-12T10:00:00Z' };
}

function Probe({ matchId = 'g-A-1' }: { matchId?: string }) {
  const store = useReactionsStore();
  const s = summaryForMatch(store.byMatch, matchId);
  return (
    <div>
      <span data-testid="status">{store.status}</span>
      <span data-testid="enabled">{String(store.enabled)}</span>
      <span data-testid="total">{s.total}</span>
      <span data-testid="mine">{s.myEmoji ?? ''}</span>
      <span data-testid="error">{store.error ?? ''}</span>
      {/* T74: namn-uppslaget storen exponerar (userId -> displayName), serialiserat. */}
      <span data-testid="names">
        {[...store.nameByUser.entries()].map(([id, name]) => `${id}=${name}`).join(',')}
      </span>
      <button onClick={() => void store.react(matchId, '🔥')}>react-fire</button>
      <button onClick={() => void store.react(matchId, '⚽')}>react-ball</button>
      <button onClick={() => void store.removeReaction(matchId)}>remove</button>
    </div>
  );
}

function renderProvider(props: Partial<React.ComponentProps<typeof ReactionsProvider>> = {}) {
  return render(
    <ReactionsProvider client={fakeClient} activeRoomId="room1" userId="me" {...props}>
      <Probe />
    </ReactionsProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  realtime.lastOnChange = null;
  realtime.calls = 0;
});

describe('ReactionsProvider , laddning + aggregering', () => {
  it('laddar + aggregerar rummets reaktioner vid mount (loading -> ready)', async () => {
    api.listRoomReactions.mockResolvedValue([
      react('me', 'g-A-1', '🔥'),
      react('u2', 'g-A-1', '🔥'),
      react('u3', 'g-A-1', '⚽'),
    ]);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('total').textContent).toBe('3');
    expect(screen.getByTestId('mine').textContent).toBe('🔥'); // min valda
    expect(api.listRoomReactions).toHaveBeenCalledWith(fakeClient, 'room1');
  });

  it('utan aktivt rum är lagret inaktivt (enabled=false, status idle, inget anrop)', async () => {
    renderProvider({ activeRoomId: null });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('idle'));
    expect(screen.getByTestId('enabled').textContent).toBe('false');
    expect(api.listRoomReactions).not.toHaveBeenCalled();
  });

  it('en INITIAL laddning som failar går till error (fail loud)', async () => {
    api.listRoomReactions.mockRejectedValue(new Error('nätfel'));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
    expect(screen.getByTestId('error').textContent).toBe('nätfel');
  });

  it('bygger nameByUser-kartan ur medlemmarna (T74: userId -> displayName)', async () => {
    api.listRoomReactions.mockResolvedValue([]);
    renderProvider({
      members: [
        { userId: 'u1', displayName: 'Daniel' },
        { userId: 'u2', displayName: 'Elin' },
      ],
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('names').textContent).toBe('u1=Daniel,u2=Elin');
  });
});

describe('ReactionsProvider , realtids-signal -> tyst re-fetch', () => {
  it('en realtids-signal kör en NY hämtning UTAN att flimra loading', async () => {
    api.listRoomReactions.mockResolvedValueOnce([react('me', 'g-A-1', '🔥')]);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('1'));

    // En vän reagerar -> Supabase signalerar. Andra hämtningen ger en extra rad.
    api.listRoomReactions.mockResolvedValueOnce([
      react('me', 'g-A-1', '🔥'),
      react('u2', 'g-A-1', '😱'),
    ]);
    expect(realtime.lastOnChange).not.toBeNull();
    act(() => realtime.lastOnChange!());

    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('2'));
    expect(screen.getByTestId('status').textContent).toBe('ready'); // ingen loading-flimring
    expect(api.listRoomReactions).toHaveBeenCalledTimes(2);
  });

  it('en tyst re-fetch som FAILar behåller befintliga reaktioner (kastar dem inte)', async () => {
    api.listRoomReactions.mockResolvedValueOnce([react('me', 'g-A-1', '🔥')]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('1'));

    api.listRoomReactions.mockRejectedValueOnce(new Error('transient'));
    act(() => realtime.lastOnChange!());

    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.getByTestId('total').textContent).toBe('1'); // behållen
    expect(screen.getByTestId('status').textContent).toBe('ready');
    warn.mockRestore();
  });
});

describe('ReactionsProvider , react + byt + ta bort', () => {
  it('react speglar in min reaktion optimistiskt (total + min emoji)', async () => {
    api.listRoomReactions.mockResolvedValue([]);
    api.upsertMyReaction.mockResolvedValue(react('me', 'g-A-1', '🔥'));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));

    await act(async () => {
      screen.getByText('react-fire').click();
    });
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('1'));
    expect(screen.getByTestId('mine').textContent).toBe('🔥');
    expect(api.upsertMyReaction).toHaveBeenCalledWith(fakeClient, 'room1', 'g-A-1', '🔥');
  });

  it('byta emoji BYTER min rad (total oförändrad, en per användare+match)', async () => {
    api.listRoomReactions.mockResolvedValue([react('me', 'g-A-1', '🔥')]);
    api.upsertMyReaction.mockResolvedValue(react('me', 'g-A-1', '⚽'));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('mine').textContent).toBe('🔥'));

    await act(async () => {
      screen.getByText('react-ball').click();
    });
    // Min rad BYTTES (🔥 -> ⚽), inte adderades: total kvar 1.
    await waitFor(() => expect(screen.getByTestId('mine').textContent).toBe('⚽'));
    expect(screen.getByTestId('total').textContent).toBe('1');
  });

  it('removeReaction tar bort min rad optimistiskt (total 0, min emoji null)', async () => {
    api.listRoomReactions.mockResolvedValue([react('me', 'g-A-1', '🔥')]);
    api.removeMyReaction.mockResolvedValue(undefined);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('1'));

    await act(async () => {
      screen.getByText('remove').click();
    });
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('0'));
    expect(screen.getByTestId('mine').textContent).toBe('');
    expect(api.removeMyReaction).toHaveBeenCalledWith(fakeClient, 'room1', 'g-A-1');
  });

  it('react KASTAR (fail loud) utan aktivt rum', async () => {
    api.listRoomReactions.mockResolvedValue([]);
    let thrown: unknown = null;
    function Catch() {
      const store = useReactionsStore();
      return (
        <button
          onClick={() => {
            store.react('g-A-1', '🔥').catch((e) => {
              thrown = e;
            });
          }}
        >
          go
        </button>
      );
    }
    render(
      <ReactionsProvider client={fakeClient} activeRoomId={null} userId="me">
        <Catch />
      </ReactionsProvider>
    );
    await act(async () => {
      screen.getByText('go').click();
    });
    await waitFor(() => expect(thrown).toBeInstanceOf(Error));
    expect((thrown as Error).message).toMatch(/inget aktivt rum att reagera i/);
  });
});
