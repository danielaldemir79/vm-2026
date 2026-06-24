import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  listMyGroupPredictions,
  listRoomGroupPredictions,
  upsertMyGroupPrediction,
} from './group-predictions-api';
import type { VmSupabaseClient } from '../supabase-browser';
import { teamCode } from '../../domain/team-code';

// Samma mock-mönster som predictions-api.test.ts: ensureSession mockas så testerna
// fokuserar på API-logiken (projektion, fel-vägar, upsert-nyckel), inte auth.
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

/** Bygg `n` syntetiska grupp-tips-rader för ett rum (unika group/user, så dubbletter syns). */
function groupRows(roomId: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    room_id: roomId,
    group_id: `G${i}`,
    user_id: `u${i}`,
    winner_team_id: 'BRA',
    runner_up_team_id: 'ARG',
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

describe('listRoomGroupPredictions', () => {
  it('projicerar DB-raderna till klient-formen', async () => {
    const from = vi.fn(() =>
      builder({
        data: [
          {
            room_id: 'r1',
            group_id: 'A',
            user_id: 'u2',
            winner_team_id: 'BRA',
            runner_up_team_id: 'ARG',
            created_at: 't0',
            updated_at: 't1',
          },
        ],
        error: null,
      })
    );
    const preds = await listRoomGroupPredictions(mockClient(from), 'r1');
    expect(preds).toEqual([
      { groupId: 'A', userId: 'u2', winnerTeamId: 'BRA', runnerUpTeamId: 'ARG', updatedAt: 't1' },
    ]);
  });

  it('fail loud: ett Supabase-fel (RLS-avslag) kastar med svensk text', async () => {
    const from = vi.fn(() => builder({ data: null, error: { message: 'nope' } }));
    await expect(listRoomGroupPredictions(mockClient(from), 'r1')).rejects.toThrow(
      /Hämta grupp-tips misslyckades: nope/
    );
  });

  it('tom data -> tom lista (ingen krasch på null)', async () => {
    const from = vi.fn(() => builder({ data: null, error: null }));
    await expect(listRoomGroupPredictions(mockClient(from), 'r1')).resolves.toEqual([]);
  });

  it('REGRESSION (F1): paginerar förbi 1000-cap, ett rum med >1000 grupp-tips läses KOMPLETT', async () => {
    const all = groupRows('r1', 2500);
    const from = cappingFrom(all);
    const preds = await listRoomGroupPredictions(mockClient(from), 'r1');
    expect(preds).toHaveLength(2500);
    expect(preds[2499]).toMatchObject({ groupId: 'G2499', userId: 'u2499' });
  });

  it('läser med stabil total ORDER BY (PK) + exact count', async () => {
    const chain = builder({ data: [], error: null, count: 0 });
    const from = vi.fn(() => chain);
    await listRoomGroupPredictions(mockClient(from), 'r1');
    expect(chain.select).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(chain.eq).toHaveBeenCalledWith('room_id', 'r1');
    expect(chain.order).toHaveBeenCalledWith('group_id', { ascending: true });
    expect(chain.order).toHaveBeenCalledWith('user_id', { ascending: true });
    expect(chain.range).toHaveBeenCalledWith(0, 999);
  });
});

describe('listMyGroupPredictions', () => {
  it('filtrerar på mitt user_id och projicerar', async () => {
    const chain = builder({
      data: [
        {
          room_id: 'r1',
          group_id: 'C',
          user_id: 'me',
          winner_team_id: 'ESP',
          runner_up_team_id: 'POR',
          created_at: 't0',
          updated_at: 't1',
        },
      ],
      error: null,
    });
    const from = vi.fn(() => chain);
    const preds = await listMyGroupPredictions(mockClient(from), 'r1');
    expect(preds).toEqual([
      { groupId: 'C', userId: 'me', winnerTeamId: 'ESP', runnerUpTeamId: 'POR', updatedAt: 't1' },
    ]);
    expect(chain.eq).toHaveBeenCalledWith('room_id', 'r1');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'me');
  });
});

describe('upsertMyGroupPrediction', () => {
  it('upsertar mitt grupp-tips (user_id ur sessionen) på rätt nyckel och projicerar', async () => {
    const chain = builder({
      data: {
        room_id: 'r1',
        group_id: 'E',
        user_id: 'me',
        winner_team_id: 'FRA',
        runner_up_team_id: 'ENG',
        created_at: 't0',
        updated_at: 't1',
      },
      error: null,
    });
    const from = vi.fn(() => chain);
    const saved = await upsertMyGroupPrediction(mockClient(from), 'r1', {
      groupId: 'E',
      winnerTeamId: teamCode('FRA'),
      runnerUpTeamId: teamCode('ENG'),
    });
    expect(saved).toEqual({
      groupId: 'E',
      userId: 'me',
      winnerTeamId: 'FRA',
      runnerUpTeamId: 'ENG',
      updatedAt: 't1',
    });
    // user_id ur sessionen (ingen förfalskning), upsert på den sammansatta nyckeln.
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'me',
        group_id: 'E',
        winner_team_id: 'FRA',
        runner_up_team_id: 'ENG',
      }),
      { onConflict: 'room_id,group_id,user_id' }
    );
  });

  it('fail loud: ett RLS-avslag (tips efter gruppstart) kastar, ingen tyst no-op', async () => {
    const from = vi.fn(() =>
      builder({ data: null, error: { message: 'new row violates row-level security policy' } })
    );
    await expect(
      upsertMyGroupPrediction(mockClient(from), 'r1', {
        groupId: 'A',
        winnerTeamId: teamCode('BRA'),
        runnerUpTeamId: teamCode('ARG'),
      })
    ).rejects.toThrow(/Spara grupp-tips misslyckades/);
  });
});
