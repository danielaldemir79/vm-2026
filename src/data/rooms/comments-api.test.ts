import { describe, expect, it, vi, beforeEach } from 'vitest';
import { addComment, deleteMyComment, listRoomComments, COMMENT_MAX_LEN } from './comments-api';
import type { VmSupabaseClient } from '../supabase-browser';

// comments-api anropar ensureSession internt (addComment). Vi mockar auth-modulen så
// testerna fokuserar på API-logiken (projektion, validering, fel-vägar), inte auth-flödet.
vi.mock('./auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'me', isAnonymous: true }),
}));

/**
 * Bygg en mock-klient (samma "thenable builder" som rooms-api.test): `from` ger en
 * kedja vars terminerande metod resolvar till `result`. .single() resolvar för
 * insert(...).select().single(); en select/eq/order-kedja resolvar via .then().
 */
function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain as never;
  for (const m of ['select', 'eq', 'order', 'delete', 'insert']) {
    chain[m] = vi.fn(self);
  }
  chain.single = vi.fn().mockResolvedValue(result);
  (chain as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return chain;
}

function mockClient(from: ReturnType<typeof vi.fn>): VmSupabaseClient {
  return { from } as unknown as VmSupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listRoomComments', () => {
  it('hämtar och projicerar kommentarer i tidsordning (äldst först)', async () => {
    const from = vi.fn().mockReturnValue(
      builder({
        data: [
          { id: 'c1', user_id: 'u1', body: 'Hej', created_at: '2026-06-12T10:00:00Z' },
          { id: 'c2', user_id: 'u2', body: 'Tja', created_at: '2026-06-12T10:01:00Z' },
        ],
        error: null,
      })
    );
    const rows = await listRoomComments(mockClient(from), 'room1');

    expect(from).toHaveBeenCalledWith('room_comments');
    expect(rows).toEqual([
      { id: 'c1', userId: 'u1', body: 'Hej', createdAt: '2026-06-12T10:00:00Z' },
      { id: 'c2', userId: 'u2', body: 'Tja', createdAt: '2026-06-12T10:01:00Z' },
    ]);
  });

  it('tom lista (utomstående filtreras bort av RLS) ger [], inte fel', async () => {
    const from = vi.fn().mockReturnValue(builder({ data: [], error: null }));
    await expect(listRoomComments(mockClient(from), 'room1')).resolves.toEqual([]);
  });

  it('fail loud:ar vid Supabase-fel (kastar med svensk text)', async () => {
    const from = vi.fn().mockReturnValue(builder({ data: null, error: { message: 'nätfel' } }));
    await expect(listRoomComments(mockClient(from), 'room1')).rejects.toThrow(
      /Hämta kommentarer misslyckades: nätfel/
    );
  });
});

describe('addComment', () => {
  it('skriver en trimmad kommentar och projicerar svaret (user_id sätts av DB-default)', async () => {
    const chain = builder({
      data: { id: 'c9', user_id: 'me', body: 'Vilken match!', created_at: '2026-06-12T11:00:00Z' },
      error: null,
    });
    const from = vi.fn().mockReturnValue(chain);

    const saved = await addComment(mockClient(from), 'room1', '  Vilken match!  ');

    expect(saved).toEqual({
      id: 'c9',
      userId: 'me',
      body: 'Vilken match!',
      createdAt: '2026-06-12T11:00:00Z',
    });
    // user_id UTELÄMNAS med flit (DB-default auth.uid() + RLS-bindning), body trimmas.
    expect(chain.insert).toHaveBeenCalledWith({ room_id: 'room1', body: 'Vilken match!' });
  });

  it('KASTAR på en tom/whitespace-body INNAN nätanrop (klient-validering)', async () => {
    const from = vi.fn();
    await expect(addComment(mockClient(from), 'room1', '   ')).rejects.toThrow(
      /Skriv kommentar misslyckades: kommentaren är tom/
    );
    expect(from).not.toHaveBeenCalled(); // inget nätanrop på tom text
  });

  it('KASTAR på en för lång body (> COMMENT_MAX_LEN) INNAN nätanrop', async () => {
    const from = vi.fn();
    const tooLong = 'x'.repeat(COMMENT_MAX_LEN + 1);
    await expect(addComment(mockClient(from), 'room1', tooLong)).rejects.toThrow(
      /för lång \(max 500 tecken\)/
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('släpper igenom exakt COMMENT_MAX_LEN tecken (randen)', async () => {
    const exact = 'y'.repeat(COMMENT_MAX_LEN);
    const chain = builder({
      data: { id: 'c10', user_id: 'me', body: exact, created_at: '2026-06-12T11:05:00Z' },
      error: null,
    });
    const from = vi.fn().mockReturnValue(chain);
    await expect(addComment(mockClient(from), 'room1', exact)).resolves.toMatchObject({
      id: 'c10',
    });
  });

  it('fail loud:ar vid RLS-/DB-avslag (icke-medlem eller CHECK-brott)', async () => {
    const from = vi
      .fn()
      .mockReturnValue(
        builder({ data: null, error: { message: 'new row violates row-level security policy' } })
      );
    await expect(addComment(mockClient(from), 'room1', 'hej')).rejects.toThrow(
      /Skriv kommentar misslyckades: new row violates row-level security policy/
    );
  });
});

describe('deleteMyComment', () => {
  it('raderar en kommentar via id (RLS nekar andras tyst, 0 rader)', async () => {
    const chain = builder({ data: null, error: null });
    const from = vi.fn().mockReturnValue(chain);

    await deleteMyComment(mockClient(from), 'c1');

    expect(from).toHaveBeenCalledWith('room_comments');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('fail loud:ar vid Supabase-fel', async () => {
    const from = vi.fn().mockReturnValue(builder({ data: null, error: { message: 'fel' } }));
    await expect(deleteMyComment(mockClient(from), 'c1')).rejects.toThrow(
      /Radera kommentar misslyckades: fel/
    );
  });
});
