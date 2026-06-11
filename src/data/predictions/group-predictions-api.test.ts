import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  listMyGroupPredictions,
  listRoomGroupPredictions,
  upsertMyGroupPrediction,
} from './group-predictions-api';
import type { VmSupabaseClient } from '../supabase-browser';

// Samma mock-mönster som predictions-api.test.ts: ensureSession mockas så testerna
// fokuserar på API-logiken (projektion, fel-vägar, upsert-nyckel), inte auth.
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
      winnerTeamId: 'FRA',
      runnerUpTeamId: 'ENG',
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
        winnerTeamId: 'BRA',
        runnerUpTeamId: 'ARG',
      })
    ).rejects.toThrow(/Spara grupp-tips misslyckades/);
  });
});
