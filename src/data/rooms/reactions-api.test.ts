import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  isReactionEmoji,
  listRoomReactions,
  REACTION_EMOJIS,
  removeMyReaction,
  upsertMyReaction,
} from './reactions-api';
import type { VmSupabaseClient } from '../supabase-browser';

// reactions-api anropar ensureSession internt (upsertMyReaction). Vi mockar auth-modulen
// så testerna fokuserar på API-logiken (projektion, validering, fel-vägar), inte auth.
vi.mock('./auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'me', isAnonymous: true }),
}));

/**
 * Bygg en mock-klient (samma "thenable builder" som comments-api.test). `from` ger en
 * kedja vars terminerande metod resolvar till `result`. .single() resolvar för
 * upsert(...).select().single(); en select/eq-kedja resolvar via .then().
 */
function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain as never;
  for (const m of ['select', 'eq', 'delete', 'insert', 'upsert']) {
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

describe('REACTION_EMOJIS + isReactionEmoji', () => {
  it('innehåller exakt de 8 kurerade emojierna (speglar DB:ns CHECK)', () => {
    expect(REACTION_EMOJIS).toEqual(['⚽', '🔥', '😂', '😭', '🎉', '👏', '😱', '🧊']);
  });

  it('isReactionEmoji godkänner en emoji i listan och nekar en utanför', () => {
    expect(isReactionEmoji('🔥')).toBe(true);
    expect(isReactionEmoji('💩')).toBe(false);
    expect(isReactionEmoji('')).toBe(false);
  });
});

describe('listRoomReactions', () => {
  it('hämtar och projicerar alla reaktioner i rummet', async () => {
    const from = vi.fn().mockReturnValue(
      builder({
        data: [
          {
            room_id: 'room1',
            user_id: 'u1',
            match_id: 'g-A-1',
            emoji: '🔥',
            created_at: '2026-06-12T10:00:00Z',
          },
        ],
        error: null,
      })
    );
    const rows = await listRoomReactions(mockClient(from), 'room1');

    expect(from).toHaveBeenCalledWith('room_reactions');
    expect(rows).toEqual([
      {
        roomId: 'room1',
        userId: 'u1',
        matchId: 'g-A-1',
        emoji: '🔥',
        createdAt: '2026-06-12T10:00:00Z',
      },
    ]);
  });

  it('tom lista (utomstående filtreras bort av RLS) ger [], inte fel', async () => {
    const from = vi.fn().mockReturnValue(builder({ data: [], error: null }));
    await expect(listRoomReactions(mockClient(from), 'room1')).resolves.toEqual([]);
  });

  it('fail loud:ar vid Supabase-fel (kastar med svensk text)', async () => {
    const from = vi.fn().mockReturnValue(builder({ data: null, error: { message: 'nätfel' } }));
    await expect(listRoomReactions(mockClient(from), 'room1')).rejects.toThrow(
      /Hämta reaktioner misslyckades: nätfel/
    );
  });
});

describe('upsertMyReaction', () => {
  it('upsertar en giltig emoji (onConflict på PK:n) och projicerar svaret', async () => {
    const chain = builder({
      data: {
        room_id: 'room1',
        user_id: 'me',
        match_id: 'g-A-1',
        emoji: '⚽',
        created_at: '2026-06-12T11:00:00Z',
      },
      error: null,
    });
    const from = vi.fn().mockReturnValue(chain);

    const saved = await upsertMyReaction(mockClient(from), 'room1', 'g-A-1', '⚽');

    expect(saved).toEqual({
      roomId: 'room1',
      userId: 'me',
      matchId: 'g-A-1',
      emoji: '⚽',
      createdAt: '2026-06-12T11:00:00Z',
    });
    // user_id UTELÄMNAS (DB-default auth.uid() + RLS-bindning); onConflict på PK:n.
    expect(chain.upsert).toHaveBeenCalledWith(
      { room_id: 'room1', match_id: 'g-A-1', emoji: '⚽' },
      { onConflict: 'room_id,user_id,match_id' }
    );
  });

  it('KASTAR på en otillåten emoji INNAN nätanrop (klient-validering)', async () => {
    const from = vi.fn();
    await expect(upsertMyReaction(mockClient(from), 'room1', 'g-A-1', '💩')).rejects.toThrow(
      /Reagera misslyckades: emojin 💩 är inte en tillåten reaktion/
    );
    expect(from).not.toHaveBeenCalled(); // inget nätanrop på ogiltig emoji
  });

  it('fail loud:ar vid RLS-/DB-avslag (icke-medlem eller CHECK-brott)', async () => {
    const from = vi
      .fn()
      .mockReturnValue(
        builder({ data: null, error: { message: 'new row violates row-level security policy' } })
      );
    await expect(upsertMyReaction(mockClient(from), 'room1', 'g-A-1', '🔥')).rejects.toThrow(
      /Reagera misslyckades: new row violates row-level security policy/
    );
  });
});

describe('removeMyReaction', () => {
  it('raderar min reaktion på en match via room_id + match_id', async () => {
    const chain = builder({ data: null, error: null });
    const from = vi.fn().mockReturnValue(chain);

    await removeMyReaction(mockClient(from), 'room1', 'g-A-1');

    expect(from).toHaveBeenCalledWith('room_reactions');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('room_id', 'room1');
    expect(chain.eq).toHaveBeenCalledWith('match_id', 'g-A-1');
  });

  it('fail loud:ar vid Supabase-fel', async () => {
    const from = vi.fn().mockReturnValue(builder({ data: null, error: { message: 'fel' } }));
    await expect(removeMyReaction(mockClient(from), 'room1', 'g-A-1')).rejects.toThrow(
      /Ta bort reaktion misslyckades: fel/
    );
  });
});
