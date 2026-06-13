// Tester för MatchCommentsProvider (T77, #161): laddning (bara match-trådar), gruppering
// per match, tyst re-fetch (realtids-signal), optimistisk skriv/radera, fail-loud-vägar.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MatchCommentsProvider } from './MatchCommentsProvider';
import { useMatchCommentsStore } from './match-comments-context';
import { threadForMatch } from './match-comments-aggregate';
import type { VmSupabaseClient } from '../../data/supabase-browser';

// Mocka data/rooms (api) + data (live-gate) + realtids-seamen. Vi testar provider-
// logiken, inte nät/kanal-API:t.
const api = vi.hoisted(() => ({
  listRoomMatchComments: vi.fn(),
  addComment: vi.fn(),
  deleteMyComment: vi.fn(),
}));
vi.mock('../../data/rooms', () => ({
  listRoomMatchComments: api.listRoomMatchComments,
  addComment: api.addComment,
  deleteMyComment: api.deleteMyComment,
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

// Probe som läser EN match-tråd (g-A-1) ur storen.
function Probe({ matchId = 'g-A-1' }: { matchId?: string }) {
  const store = useMatchCommentsStore();
  const thread = threadForMatch(store.byMatch, matchId);
  return (
    <div>
      <span data-testid="status">{store.status}</span>
      <span data-testid="enabled">{String(store.enabled)}</span>
      <span data-testid="count">{thread.count}</span>
      <span data-testid="bodies">{thread.comments.map((c) => c.body).join('|')}</span>
      <span data-testid="name">{store.nameByUser.get('u1') ?? ''}</span>
      <span data-testid="error">{store.error ?? ''}</span>
      <button onClick={() => void store.addComment(matchId, 'ny kommentar')}>add</button>
      <button onClick={() => void store.deleteComment('m1')}>del</button>
    </div>
  );
}

function renderProvider(props: Partial<React.ComponentProps<typeof MatchCommentsProvider>> = {}) {
  return render(
    <MatchCommentsProvider
      client={fakeClient}
      activeRoomId="room1"
      userId="me"
      members={[{ userId: 'u1', displayName: 'Alice' } as never]}
      {...props}
    >
      <Probe />
    </MatchCommentsProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  realtime.lastOnChange = null;
  realtime.calls = 0;
});

describe('MatchCommentsProvider , laddning + gruppering', () => {
  it('laddar match-kommentarer vid mount och grupperar per match (status loading -> ready)', async () => {
    api.listRoomMatchComments.mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        body: 'A-snack',
        createdAt: '2026-06-12T10:00:00Z',
        matchId: 'g-A-1',
      },
      {
        id: 'm2',
        userId: 'u2',
        body: 'A-svar',
        createdAt: '2026-06-12T10:01:00Z',
        matchId: 'g-A-1',
      },
      {
        id: 'm3',
        userId: 'u3',
        body: 'B-snack',
        createdAt: '2026-06-12T10:02:00Z',
        matchId: 'g-B-2',
      },
    ]);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    // Bara g-A-1:s två rader syns i probe:n (grupperingen skiljer matcherna).
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('bodies').textContent).toBe('A-snack|A-svar');
    // Match-trådarna (inte rums-chatten) hämtas: listRoomMatchComments, inte listRoomComments.
    expect(api.listRoomMatchComments).toHaveBeenCalledWith(fakeClient, 'room1');
  });

  it('nameByUser mappar user_id -> displayName ur rummets medlemmar', async () => {
    api.listRoomMatchComments.mockResolvedValue([]);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('name').textContent).toBe('Alice');
  });

  it('utan aktivt rum är lagret inaktivt (enabled=false, status idle, inget anrop)', async () => {
    renderProvider({ activeRoomId: null });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('idle'));
    expect(screen.getByTestId('enabled').textContent).toBe('false');
    expect(api.listRoomMatchComments).not.toHaveBeenCalled();
  });

  it('en INITIAL laddning som failar går till error (fail loud)', async () => {
    api.listRoomMatchComments.mockRejectedValue(new Error('nätfel'));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
    expect(screen.getByTestId('error').textContent).toBe('nätfel');
  });
});

describe('MatchCommentsProvider , realtids-signal -> tyst re-fetch', () => {
  it('en signal kör en NY hämtning UTAN att flimra loading (behåller data)', async () => {
    api.listRoomMatchComments.mockResolvedValueOnce([
      {
        id: 'm1',
        userId: 'u1',
        body: 'Först',
        createdAt: '2026-06-12T10:00:00Z',
        matchId: 'g-A-1',
      },
    ]);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));

    api.listRoomMatchComments.mockResolvedValueOnce([
      {
        id: 'm1',
        userId: 'u1',
        body: 'Först',
        createdAt: '2026-06-12T10:00:00Z',
        matchId: 'g-A-1',
      },
      { id: 'm2', userId: 'u2', body: 'Svar', createdAt: '2026-06-12T10:01:00Z', matchId: 'g-A-1' },
    ]);
    expect(realtime.lastOnChange).not.toBeNull();
    act(() => realtime.lastOnChange!());

    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(screen.getByTestId('status').textContent).toBe('ready');
    expect(api.listRoomMatchComments).toHaveBeenCalledTimes(2);
  });

  it('en tyst re-fetch som FAILar behåller befintliga kommentarer (kastar dem inte)', async () => {
    api.listRoomMatchComments.mockResolvedValueOnce([
      { id: 'm1', userId: 'u1', body: 'Kvar', createdAt: '2026-06-12T10:00:00Z', matchId: 'g-A-1' },
    ]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));

    api.listRoomMatchComments.mockRejectedValueOnce(new Error('transient'));
    act(() => realtime.lastOnChange!());

    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('status').textContent).toBe('ready');
    warn.mockRestore();
  });
});

describe('MatchCommentsProvider , skriv + radera', () => {
  it('addComment speglar in den sparade kommentaren optimistiskt (rätt match, nyast nederst)', async () => {
    api.listRoomMatchComments.mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        body: 'Gammal',
        createdAt: '2026-06-12T10:00:00Z',
        matchId: 'g-A-1',
      },
    ]);
    api.addComment.mockResolvedValue({
      id: 'm2',
      userId: 'me',
      body: 'ny kommentar',
      createdAt: '2026-06-12T10:05:00Z',
      matchId: 'g-A-1',
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));

    await act(async () => {
      screen.getByText('add').click();
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(screen.getByTestId('bodies').textContent).toBe('Gammal|ny kommentar');
    // API:t anropas med matchId (T77): kommentaren skrivs i RÄTT match-tråd.
    expect(api.addComment).toHaveBeenCalledWith(fakeClient, 'room1', 'ny kommentar', 'g-A-1');
  });

  it('deleteComment tar bort raden lokalt optimistiskt', async () => {
    api.listRoomMatchComments.mockResolvedValue([
      { id: 'm1', userId: 'me', body: 'Min', createdAt: '2026-06-12T10:00:00Z', matchId: 'g-A-1' },
    ]);
    api.deleteMyComment.mockResolvedValue(undefined);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));

    await act(async () => {
      screen.getByText('del').click();
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'));
    expect(api.deleteMyComment).toHaveBeenCalledWith(fakeClient, 'm1');
  });

  it('addComment KASTAR (fail loud) utan aktivt rum', async () => {
    let thrown: unknown = null;
    function Catch() {
      const store = useMatchCommentsStore();
      return (
        <button
          onClick={() => {
            store.addComment('g-A-1', 'x').catch((e) => {
              thrown = e;
            });
          }}
        >
          go
        </button>
      );
    }
    render(
      <MatchCommentsProvider client={fakeClient} activeRoomId={null} userId="me">
        <Catch />
      </MatchCommentsProvider>
    );
    await act(async () => {
      screen.getByText('go').click();
      await Promise.resolve();
    });
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/inget aktivt rum/);
  });
});

describe('useMatchCommentsStore , utan provider (TOLERANT, samma som reaktionerna)', () => {
  it('faller till en INERT store (enabled=false) i stället för att kasta', () => {
    let observed: { enabled: boolean; status: string } | null = null;
    function Bare() {
      const s = useMatchCommentsStore();
      observed = { enabled: s.enabled, status: s.status };
      return null;
    }
    // Renderar UTAN provider och kastar INTE (en matchkort-fotrad i lokalt läge): den
    // inerta storen gör att MatchComments renderar null (matchkortet ser ut som förr).
    expect(() => render(<Bare />)).not.toThrow();
    expect(observed).toEqual({ enabled: false, status: 'idle' });
  });
});
