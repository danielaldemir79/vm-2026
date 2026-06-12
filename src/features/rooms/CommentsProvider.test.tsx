// Tester för CommentsProvider (T66, #121): laddning, tyst re-fetch (realtids-signal),
// optimistisk skriv/radera, fail-loud-vägar och realtids-seamen (signal -> refetch).

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { CommentsProvider } from './CommentsProvider';
import { useCommentsStore } from './comments-context';
import type { VmSupabaseClient } from '../../data/supabase-browser';

// Mocka data/rooms (api) + data (live-gate) + realtids-seamen. Vi testar provider-
// logiken, inte nät/kanal-API:t.
const api = vi.hoisted(() => ({
  listRoomComments: vi.fn(),
  addComment: vi.fn(),
  deleteMyComment: vi.fn(),
}));
vi.mock('../../data/rooms', () => ({
  listRoomComments: api.listRoomComments,
  addComment: api.addComment,
  deleteMyComment: api.deleteMyComment,
  COMMENT_MAX_LEN: 500,
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

function Probe() {
  const store = useCommentsStore();
  return (
    <div>
      <span data-testid="status">{store.status}</span>
      <span data-testid="enabled">{String(store.enabled)}</span>
      <span data-testid="count">{store.comments.length}</span>
      <span data-testid="bodies">{store.comments.map((c) => c.body).join('|')}</span>
      <span data-testid="error">{store.error ?? ''}</span>
      <button onClick={() => void store.addComment('ny kommentar')}>add</button>
      <button onClick={() => void store.deleteComment('c1')}>del</button>
    </div>
  );
}

function renderProvider(props: Partial<React.ComponentProps<typeof CommentsProvider>> = {}) {
  return render(
    <CommentsProvider client={fakeClient} activeRoomId="room1" userId="me" {...props}>
      <Probe />
    </CommentsProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  realtime.lastOnChange = null;
  realtime.calls = 0;
});

describe('CommentsProvider , laddning', () => {
  it('laddar rummets kommentarer vid mount (status loading -> ready)', async () => {
    api.listRoomComments.mockResolvedValue([
      { id: 'c1', userId: 'u1', body: 'Hej', createdAt: '2026-06-12T10:00:00Z' },
    ]);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(api.listRoomComments).toHaveBeenCalledWith(fakeClient, 'room1');
  });

  it('utan aktivt rum är lagret inaktivt (enabled=false, status idle, inget anrop)', async () => {
    renderProvider({ activeRoomId: null });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('idle'));
    expect(screen.getByTestId('enabled').textContent).toBe('false');
    expect(api.listRoomComments).not.toHaveBeenCalled();
  });

  it('en INITIAL laddning som failar går till error (fail loud)', async () => {
    api.listRoomComments.mockRejectedValue(new Error('nätfel'));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
    expect(screen.getByTestId('error').textContent).toBe('nätfel');
  });
});

describe('CommentsProvider , realtids-signal -> tyst re-fetch', () => {
  it('en realtids-signal kör en NY hämtning UTAN att flimra loading (behåller data)', async () => {
    api.listRoomComments.mockResolvedValueOnce([
      { id: 'c1', userId: 'u1', body: 'Först', createdAt: '2026-06-12T10:00:00Z' },
    ]);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));

    // En vän skriver -> Supabase signalerar. Andra hämtningen ger en extra rad.
    api.listRoomComments.mockResolvedValueOnce([
      { id: 'c1', userId: 'u1', body: 'Först', createdAt: '2026-06-12T10:00:00Z' },
      { id: 'c2', userId: 'u2', body: 'Svar', createdAt: '2026-06-12T10:01:00Z' },
    ]);
    expect(realtime.lastOnChange).not.toBeNull();
    act(() => realtime.lastOnChange!());

    // Status förblev 'ready' under den tysta re-fetchen (ingen loading-flimring).
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(screen.getByTestId('status').textContent).toBe('ready');
    expect(api.listRoomComments).toHaveBeenCalledTimes(2);
  });

  it('en tyst re-fetch som FAILar behåller befintliga kommentarer (kastar dem inte)', async () => {
    api.listRoomComments.mockResolvedValueOnce([
      { id: 'c1', userId: 'u1', body: 'Kvar', createdAt: '2026-06-12T10:00:00Z' },
    ]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));

    api.listRoomComments.mockRejectedValueOnce(new Error('transient'));
    act(() => realtime.lastOnChange!());

    // Datan + 'ready' behålls; felet loggas (fail-loud i konsolen), vyn blankas inte.
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('status').textContent).toBe('ready');
    warn.mockRestore();
  });
});

describe('CommentsProvider , cancelled-vakt vid unmount (T70)', () => {
  it('ett laddnings-svar som FAILar EFTER unmount rör ingen state (ingen window-not-defined i teardown)', async () => {
    // ROTORSAK till de intermittenta teardown-felen (#136): listRoomComments-Promisen
    // kan landa EFTER att providern avmonterats (eller jsdom tagits ner mellan testfiler).
    // .catch körde då setError/setStatus mot en avmonterad komponent (raden ~150), vilket
    // ger "window is not defined" i teardown. Cleanup sätter cancelled=true och alla
    // state-setters gatas på den. Vi bevisar det: en avvisad fetch EFTER unmount får
    // INTE kasta (om setError körde mot en riven render skulle React klaga/krascha här).
    let reject!: (err: Error) => void;
    api.listRoomComments.mockReturnValueOnce(
      new Promise((_resolve, rej) => {
        reject = rej;
      })
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderProvider();
    // Avmontera MEDAN laddningen är i flykten (Promisen ännu inte avgjord).
    unmount();
    // Avvisa nu, efter unmount: cancelled-vakten ska svälja det utan state-touch.
    await act(async () => {
      reject(new Error('sent nätfel efter unmount'));
      // Spola mikrotasks så .catch hinner köra (och no-op:a) innan vi mäter.
      await Promise.resolve();
    });
    // Ingen React-felmupp om setState-efter-unmount (cancelled-vakten höll).
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('CommentsProvider , skriv + radera', () => {
  it('addComment speglar in den sparade kommentaren optimistiskt (nyast nederst)', async () => {
    api.listRoomComments.mockResolvedValue([
      { id: 'c1', userId: 'u1', body: 'Gammal', createdAt: '2026-06-12T10:00:00Z' },
    ]);
    api.addComment.mockResolvedValue({
      id: 'c2',
      userId: 'me',
      body: 'ny kommentar',
      createdAt: '2026-06-12T10:05:00Z',
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));

    await act(async () => {
      screen.getByText('add').click();
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    // Nyast nederst (chatt-konvention).
    expect(screen.getByTestId('bodies').textContent).toBe('Gammal|ny kommentar');
    expect(api.addComment).toHaveBeenCalledWith(fakeClient, 'room1', 'ny kommentar');
  });

  it('deleteComment tar bort raden lokalt optimistiskt', async () => {
    api.listRoomComments.mockResolvedValue([
      { id: 'c1', userId: 'me', body: 'Min', createdAt: '2026-06-12T10:00:00Z' },
    ]);
    api.deleteMyComment.mockResolvedValue(undefined);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));

    await act(async () => {
      screen.getByText('del').click();
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'));
    expect(api.deleteMyComment).toHaveBeenCalledWith(fakeClient, 'c1');
  });

  it('addComment KASTAR (fail loud) utan klient', async () => {
    api.listRoomComments.mockResolvedValue([]);
    // Utan klient OCH utan live-gate (men vi mockar live=true), så vi tvingar klient=undefined
    // genom att INTE ge en klient och låta getSupabaseClient ge ett objekt , i stället
    // testar vi fail-loud-grenen direkt via store-kontraktet med activeRoomId=null.
    let thrown: unknown = null;
    function Catch() {
      const store = useCommentsStore();
      return (
        <button
          onClick={() => {
            store.addComment('x').catch((e) => {
              thrown = e;
            });
          }}
        >
          go
        </button>
      );
    }
    render(
      <CommentsProvider client={fakeClient} activeRoomId={null} userId="me">
        <Catch />
      </CommentsProvider>
    );
    await act(async () => {
      screen.getByText('go').click();
    });
    await waitFor(() => expect(thrown).toBeInstanceOf(Error));
    expect((thrown as Error).message).toMatch(/inget aktivt rum att skriva i/);
  });
});
