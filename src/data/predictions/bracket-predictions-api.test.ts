import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  bracketDeadlineMatchId,
  CHAMPION_SLOT_ID,
  TOURNAMENT_START_MATCH_ID,
  listMyBracketPredictions,
  listRoomBracketPredictions,
  upsertMyBracketPrediction,
} from './bracket-predictions-api';
import type { VmSupabaseClient } from '../supabase-browser';
import { teamCode } from '../../domain/team-code';

vi.mock('../rooms/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'me', isAnonymous: true }),
}));

function builder(result: { data: unknown; error: unknown; count?: number | null }) {
  const resolved = {
    ...result,
    count: result.count ?? (Array.isArray(result.data) ? result.data.length : 0),
  };
  const chain: Record<string, unknown> = {};
  const self = () => chain as never;
  for (const m of ['select', 'eq', 'upsert', 'insert', 'delete', 'order', 'range']) {
    chain[m] = vi.fn(self);
  }
  chain.single = vi.fn().mockResolvedValue(resolved);
  (chain as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(resolved).then(onFulfilled);
  return chain;
}

/** Modellerar PostgREST-cap:en (rak await = kapad), men ger rätt sida via .range(). */
function cappingFrom<Row>(allRows: readonly Row[], cap = 1000) {
  return vi.fn(() => {
    const chain: Record<string, unknown> = {};
    const self = () => chain as never;
    for (const m of ['select', 'eq', 'order']) {
      chain[m] = vi.fn(self);
    }
    chain.range = vi.fn((from: number, to: number) =>
      Promise.resolve({ data: allRows.slice(from, to + 1), error: null, count: allRows.length })
    );
    (chain as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: allRows.slice(0, cap), error: null, count: allRows.length }).then(
        onFulfilled
      );
    return chain;
  });
}

/** Bygg `n` syntetiska bracket-tips-rader för ett rum (unika slot/user, så dubbletter syns). */
function bracketRows(roomId: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    room_id: roomId,
    slot_id: `M${i}`,
    user_id: `u${i}`,
    advancing_team_id: 'BRA',
    created_at: 't0',
    updated_at: 't1',
  }));
}

function mockClient(from: ReturnType<typeof vi.fn>): VmSupabaseClient {
  return { from } as unknown as VmSupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bracketDeadlineMatchId (deadline-ankaret, speglar RLS-helpern)', () => {
  it('en per-slot-tips (M73..M104) använder slottens EGEN avspark', () => {
    expect(bracketDeadlineMatchId('M73')).toBe('M73');
    expect(bracketDeadlineMatchId('M104')).toBe('M104');
  });

  it('champion-tipset använder TURNERINGSSTART (g-A-1), inte en slutspelsmatch', () => {
    expect(bracketDeadlineMatchId(CHAMPION_SLOT_ID)).toBe(TOURNAMENT_START_MATCH_ID);
    expect(bracketDeadlineMatchId(CHAMPION_SLOT_ID)).toBe('g-A-1');
  });
});

describe('listRoomBracketPredictions', () => {
  it('projicerar DB-raderna till klient-formen', async () => {
    const from = vi.fn(() =>
      builder({
        data: [
          {
            room_id: 'r1',
            slot_id: 'M73',
            user_id: 'u2',
            advancing_team_id: 'BRA',
            created_at: 't0',
            updated_at: 't1',
          },
        ],
        error: null,
      })
    );
    const preds = await listRoomBracketPredictions(mockClient(from), 'r1');
    expect(preds).toEqual([
      { slotId: 'M73', userId: 'u2', advancingTeamId: 'BRA', updatedAt: 't1' },
    ]);
  });

  it('fail loud: ett Supabase-fel (RLS-avslag) kastar med svensk text', async () => {
    const from = vi.fn(() => builder({ data: null, error: { message: 'nope' } }));
    await expect(listRoomBracketPredictions(mockClient(from), 'r1')).rejects.toThrow(
      /Hämta bracket-tips misslyckades: nope/
    );
  });

  it('tom data -> tom lista (ingen krasch på null)', async () => {
    const from = vi.fn(() => builder({ data: null, error: null }));
    await expect(listRoomBracketPredictions(mockClient(from), 'r1')).resolves.toEqual([]);
  });

  it('REGRESSION (F1): paginerar förbi 1000-cap, ett rum med >1000 bracket-tips läses KOMPLETT', async () => {
    const all = bracketRows('r1', 2500);
    const from = cappingFrom(all);
    const preds = await listRoomBracketPredictions(mockClient(from), 'r1');
    expect(preds).toHaveLength(2500);
    expect(preds[2499]).toMatchObject({ slotId: 'M2499', userId: 'u2499' });
  });

  it('läser med stabil total ORDER BY (PK) + exact count', async () => {
    const chain = builder({ data: [], error: null, count: 0 });
    const from = vi.fn(() => chain);
    await listRoomBracketPredictions(mockClient(from), 'r1');
    expect(chain.select).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(chain.eq).toHaveBeenCalledWith('room_id', 'r1');
    expect(chain.order).toHaveBeenCalledWith('slot_id', { ascending: true });
    expect(chain.order).toHaveBeenCalledWith('user_id', { ascending: true });
    expect(chain.range).toHaveBeenCalledWith(0, 999);
  });
});

describe('listMyBracketPredictions', () => {
  it('filtrerar på mitt user_id och projicerar (inkl. champion-slotten)', async () => {
    const chain = builder({
      data: [
        {
          room_id: 'r1',
          slot_id: 'champion',
          user_id: 'me',
          advancing_team_id: 'ARG',
          created_at: 't0',
          updated_at: 't1',
        },
      ],
      error: null,
    });
    const from = vi.fn(() => chain);
    const preds = await listMyBracketPredictions(mockClient(from), 'r1');
    expect(preds).toEqual([
      { slotId: 'champion', userId: 'me', advancingTeamId: 'ARG', updatedAt: 't1' },
    ]);
    expect(chain.eq).toHaveBeenCalledWith('room_id', 'r1');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'me');
  });
});

describe('upsertMyBracketPrediction', () => {
  it('upsertar mitt bracket-tips (user_id ur sessionen) på rätt nyckel och projicerar', async () => {
    const chain = builder({
      data: {
        room_id: 'r1',
        slot_id: 'M89',
        user_id: 'me',
        advancing_team_id: 'ESP',
        created_at: 't0',
        updated_at: 't1',
      },
      error: null,
    });
    const from = vi.fn(() => chain);
    const saved = await upsertMyBracketPrediction(mockClient(from), 'r1', {
      slotId: 'M89',
      advancingTeamId: teamCode('ESP'),
    });
    expect(saved).toEqual({ slotId: 'M89', userId: 'me', advancingTeamId: 'ESP', updatedAt: 't1' });
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'me', slot_id: 'M89', advancing_team_id: 'ESP' }),
      { onConflict: 'room_id,slot_id,user_id' }
    );
  });

  it('fail loud: ett RLS-avslag (tips efter deadline) kastar, ingen tyst no-op', async () => {
    const from = vi.fn(() =>
      builder({ data: null, error: { message: 'new row violates row-level security policy' } })
    );
    await expect(
      upsertMyBracketPrediction(mockClient(from), 'r1', {
        slotId: 'M73',
        advancingTeamId: teamCode('BRA'),
      })
    ).rejects.toThrow(/Spara bracket-tips misslyckades/);
  });
});
