// Enhetstester för joker-API:t (T19, #19): projektion, fel-vägar (fail loud), och att
// upsert sker på (room_id, user_id, joker_day) MED user_id ur sessionen (ingen
// förfalskning) och UTAN joker_day (triggern fyller den server-side).

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { listRoomJokers, listMyJokers, upsertMyJoker, removeMyJoker } from './room-joker-api';
import type { VmSupabaseClient } from '../supabase-browser';

// ensureSession mockas (samma som predictions-api.test.ts): fokus på API-logiken.
vi.mock('../rooms/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'me', isAnonymous: true }),
}));

function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain as never;
  for (const m of ['select', 'eq', 'upsert', 'insert', 'delete', 'order']) {
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

describe('listRoomJokers', () => {
  it('projicerar DB-raderna till klient-formen (inkl. server-härledd joker_day)', async () => {
    const from = vi.fn(() =>
      builder({
        data: [
          {
            room_id: 'r1',
            match_id: 'g-A-1',
            user_id: 'u2',
            joker_day: '2026-06-11',
            created_at: 't0',
            updated_at: 't1',
          },
        ],
        error: null,
      })
    );
    const jokers = await listRoomJokers(mockClient(from), 'r1');
    expect(jokers).toEqual([
      { matchId: 'g-A-1', userId: 'u2', jokerDay: '2026-06-11', updatedAt: 't1' },
    ]);
  });

  it('fail loud: ett Supabase-fel kastar med svensk text', async () => {
    const from = vi.fn(() => builder({ data: null, error: { message: 'nope' } }));
    await expect(listRoomJokers(mockClient(from), 'r1')).rejects.toThrow(
      /Hämta joker misslyckades: nope/
    );
  });

  it('tom data -> tom lista (ingen krasch på null)', async () => {
    const from = vi.fn(() => builder({ data: null, error: null }));
    await expect(listRoomJokers(mockClient(from), 'r1')).resolves.toEqual([]);
  });
});

describe('listMyJokers', () => {
  it('filtrerar på mitt user_id och projicerar', async () => {
    const chain = builder({
      data: [
        {
          room_id: 'r1',
          match_id: 'g-B-2',
          user_id: 'me',
          joker_day: '2026-06-13',
          created_at: 't0',
          updated_at: 't1',
        },
      ],
      error: null,
    });
    const from = vi.fn(() => chain);
    const jokers = await listMyJokers(mockClient(from), 'r1');
    expect(jokers).toEqual([
      { matchId: 'g-B-2', userId: 'me', jokerDay: '2026-06-13', updatedAt: 't1' },
    ]);
    expect(chain.eq).toHaveBeenCalledWith('room_id', 'r1');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'me');
  });
});

describe('upsertMyJoker', () => {
  it('upsertar på (room_id,user_id,joker_day) med user_id ur sessionen, UTAN joker_day', async () => {
    const chain = builder({
      data: {
        room_id: 'r1',
        match_id: 'g-C-3',
        user_id: 'me',
        joker_day: '2026-06-15',
        created_at: 't0',
        updated_at: 't1',
      },
      error: null,
    });
    const from = vi.fn(() => chain);
    const saved = await upsertMyJoker(mockClient(from), 'r1', { matchId: 'g-C-3' });
    expect(saved).toEqual({
      matchId: 'g-C-3',
      userId: 'me',
      jokerDay: '2026-06-15',
      updatedAt: 't1',
    });
    // user_id ur sessionen, match_id ur input; joker_day skickas ALDRIG (triggern fyller den).
    const [[row, opts]] = (chain.upsert as ReturnType<typeof vi.fn>).mock.calls;
    expect(row).toMatchObject({ room_id: 'r1', match_id: 'g-C-3', user_id: 'me' });
    expect(row).not.toHaveProperty('joker_day');
    expect(opts).toEqual({ onConflict: 'room_id,user_id,joker_day' });
  });

  it('fail loud: ett RLS-avslag (joker efter avspark) kastar, ingen tyst no-op', async () => {
    const from = vi.fn(() =>
      builder({ data: null, error: { message: 'new row violates row-level security policy' } })
    );
    await expect(upsertMyJoker(mockClient(from), 'r1', { matchId: 'g-A-1' })).rejects.toThrow(
      /Spara joker misslyckades/
    );
  });
});

describe('removeMyJoker', () => {
  it('raderar min joker på en match (filtrerar room + user + match)', async () => {
    const chain = builder({ data: null, error: null });
    const from = vi.fn(() => chain);
    await removeMyJoker(mockClient(from), 'r1', 'g-A-1');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('room_id', 'r1');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'me');
    expect(chain.eq).toHaveBeenCalledWith('match_id', 'g-A-1');
  });

  it('fail loud: ett Supabase-fel kastar med svensk text', async () => {
    const from = vi.fn(() => builder({ data: null, error: { message: 'boom' } }));
    await expect(removeMyJoker(mockClient(from), 'r1', 'g-A-1')).rejects.toThrow(
      /Ångra joker misslyckades: boom/
    );
  });
});
