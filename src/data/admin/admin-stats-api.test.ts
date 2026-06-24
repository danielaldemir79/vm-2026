// Tester för admin-statistik-API:t (T45, #76). FOKUS: projektion av de platta
// RPC-raderna (gruppera per rum + medlemslista, normalisera avslöjade tips per
// kind), fel-vägar (fail loud), och defensiv null-hantering. RLS-/gate-säkerheten
// bevisas separat (admin-stats-rls.integration.test.ts + DO-block i decisions.md).

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchAdminRoomStats, fetchAdminRevealedPredictions } from './admin-stats-api';
import type { VmSupabaseClient } from '../supabase-browser';

// Samma mock-mönster som de andra api-testerna: ensureSession mockas bort.
vi.mock('../rooms/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'me', isAnonymous: true }),
}));

/**
 * En klient vars rpc(name) returnerar en builder som både går att AWAITA direkt (en sida,
 * det förbestämda {data,error}) och att kedja `.order().range()` på (paginerad läsning).
 * `count` defaultar till antalet rader, så completeness-vakten ser ett sant förväntat antal.
 */
function mockClient(result: {
  data: unknown;
  error: unknown;
  count?: number | null;
}): VmSupabaseClient {
  const resolved = {
    ...result,
    count: result.count ?? (Array.isArray(result.data) ? result.data.length : 0),
  };
  const chain: Record<string, unknown> = {};
  const self = () => chain as never;
  chain.order = vi.fn(self);
  chain.range = vi.fn().mockResolvedValue(resolved);
  (chain as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(resolved).then(onFulfilled);
  return { rpc: vi.fn(() => chain) } as unknown as VmSupabaseClient;
}

/**
 * En klient som MODELLERAR PostgREST-cap:en för en RPC: en rak await ger BARA de första
 * `cap` raderna (live-buggen), men en `.range(from, to)` ger rätt sida med exact count.
 * Gör admin-regressions-testet diskriminerande (gammal opaginerad RPC vs ny paginerad).
 */
function cappingRpcClient<Row>(allRows: readonly Row[], cap = 1000): VmSupabaseClient {
  const chain: Record<string, unknown> = {};
  const self = () => chain as never;
  chain.order = vi.fn(self);
  chain.range = vi.fn((from: number, to: number) =>
    Promise.resolve({ data: allRows.slice(from, to + 1), error: null, count: allRows.length })
  );
  (chain as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data: allRows.slice(0, cap), error: null, count: allRows.length }).then(
      onFulfilled
    );
  return { rpc: vi.fn(() => chain) } as unknown as VmSupabaseClient;
}

/** Bygg `n` syntetiska AVSLÖJADE grupp-tips-rader (alla giltiga, så projektionen behåller alla). */
function revealedGroupRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    room_id: 'r1',
    user_id: `u${i}`,
    kind: 'group',
    key: `G${i}`,
    team_a: 'BRA',
    team_b: 'ARG',
  }));
}

/** Bygg `n` syntetiska admin_room_stats-rader (en per medlem, ett rum, giltiga aggregat). */
function roomStatRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    room_id: 'r1',
    room_name: 'VM 2026',
    room_code: 'vm26',
    room_created_at: 't0',
    member_count: n,
    match_prediction_count: 0,
    group_prediction_count: 0,
    bracket_prediction_count: 0,
    member_user_id: `u${i}`,
    member_display_name: `M${i}`,
    member_joined_at: `j${i}`,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchAdminRoomStats', () => {
  it('grupperar de platta raderna per rum med medlemslista + aggregat', async () => {
    const client = mockClient({
      data: [
        {
          room_id: 'r1',
          room_name: 'VM 2026',
          room_code: 'vm26',
          room_created_at: 't0',
          member_count: 2,
          match_prediction_count: 10,
          group_prediction_count: 4,
          bracket_prediction_count: 1,
          member_user_id: 'u1',
          member_display_name: 'Daniel',
          member_joined_at: 'j0',
        },
        {
          room_id: 'r1',
          room_name: 'VM 2026',
          room_code: 'vm26',
          room_created_at: 't0',
          member_count: 2,
          match_prediction_count: 10,
          group_prediction_count: 4,
          bracket_prediction_count: 1,
          member_user_id: 'u2',
          member_display_name: 'Elin',
          member_joined_at: 'j1',
        },
        {
          room_id: 'r2',
          room_name: 'Rhodos',
          room_code: 'rhod',
          room_created_at: 't1',
          member_count: 1,
          match_prediction_count: 0,
          group_prediction_count: 0,
          bracket_prediction_count: 0,
          member_user_id: 'u1',
          member_display_name: 'Daniel',
          member_joined_at: 'j2',
        },
      ],
      error: null,
    });
    const rooms = await fetchAdminRoomStats(client);
    expect(rooms).toHaveLength(2);
    const vm = rooms.find((r) => r.roomId === 'r1')!;
    expect(vm.name).toBe('VM 2026');
    expect(vm.memberCount).toBe(2);
    expect(vm.matchPredictionCount).toBe(10);
    expect(vm.members.map((m) => m.displayName)).toEqual(['Daniel', 'Elin']);
    const rhodos = rooms.find((r) => r.roomId === 'r2')!;
    expect(rhodos.members).toHaveLength(1);
  });

  it('fail loud: ett RLS-/RPC-fel kastar med svensk text', async () => {
    const client = mockClient({ data: null, error: { message: 'nope' } });
    await expect(fetchAdminRoomStats(client)).rejects.toThrow(
      /Hämta admin-statistik misslyckades: nope/
    );
  });

  it('tom data (icke-admin -> RPC tom mängd) -> tom lista, ingen krasch', async () => {
    const client = mockClient({ data: null, error: null });
    await expect(fetchAdminRoomStats(client)).resolves.toEqual([]);
  });

  it('REGRESSION (F1): paginerar förbi 1000-cap, >1000 (rum,medlem)-rader läses KOMPLETT', async () => {
    const client = cappingRpcClient(roomStatRows(2500));
    const rooms = await fetchAdminRoomStats(client);
    // Ett rum (r1) men alla 2500 medlemmar (inte kapade till 1000).
    expect(rooms).toHaveLength(1);
    expect(rooms[0].members).toHaveLength(2500);
  });

  it('begär exact count + stabil ORDER BY på RPC:n (paginering)', async () => {
    const client = mockClient({ data: [], error: null, count: 0 });
    await fetchAdminRoomStats(client);
    const chain = (client.rpc as ReturnType<typeof vi.fn>).mock.results[0].value as Record<
      string,
      ReturnType<typeof vi.fn>
    >;
    expect(client.rpc).toHaveBeenCalledWith('admin_room_stats', undefined, { count: 'exact' });
    expect(chain.range).toHaveBeenCalledWith(0, 999);
    expect(chain.order).toHaveBeenCalled();
  });
});

describe('fetchAdminRevealedPredictions', () => {
  it('normaliserar match-/grupp-/bracket-rader per kind', async () => {
    const client = mockClient({
      data: [
        { room_id: 'r1', user_id: 'u1', kind: 'match', key: 'g-A-1', team_a: '2', team_b: '1' },
        { room_id: 'r1', user_id: 'u1', kind: 'group', key: 'A', team_a: 'BRA', team_b: 'ARG' },
        { room_id: 'r1', user_id: 'u2', kind: 'bracket', key: 'M73', team_a: 'ESP', team_b: null },
      ],
      error: null,
    });
    const preds = await fetchAdminRevealedPredictions(client);
    expect(preds).toEqual([
      { kind: 'match', roomId: 'r1', userId: 'u1', matchId: 'g-A-1', homeGoals: 2, awayGoals: 1 },
      {
        kind: 'group',
        roomId: 'r1',
        userId: 'u1',
        groupId: 'A',
        winnerTeamId: 'BRA',
        runnerUpTeamId: 'ARG',
      },
      { kind: 'bracket', roomId: 'r1', userId: 'u2', slotId: 'M73', advancingTeamId: 'ESP' },
    ]);
  });

  it('hoppar defensivt över en rad med okänd kind eller saknade fält (ingen krasch)', async () => {
    const client = mockClient({
      data: [
        // okänd kind -> hoppas
        { room_id: 'r1', user_id: 'u1', kind: 'mystery', key: 'x', team_a: 'A', team_b: 'B' },
        // match utan mål-tal -> hoppas (kan inte poängsättas)
        { room_id: 'r1', user_id: 'u1', kind: 'match', key: 'g-A-1', team_a: null, team_b: '1' },
        // bracket utan team_a -> hoppas
        { room_id: 'r1', user_id: 'u2', kind: 'bracket', key: 'M73', team_a: null, team_b: null },
        // giltig rad -> behålls
        { room_id: 'r1', user_id: 'u3', kind: 'group', key: 'B', team_a: 'FRA', team_b: 'ENG' },
      ],
      error: null,
    });
    const preds = await fetchAdminRevealedPredictions(client);
    expect(preds).toEqual([
      {
        kind: 'group',
        roomId: 'r1',
        userId: 'u3',
        groupId: 'B',
        winnerTeamId: 'FRA',
        runnerUpTeamId: 'ENG',
      },
    ]);
  });

  it('fail loud: ett RPC-fel kastar med svensk text', async () => {
    const client = mockClient({ data: null, error: { message: 'boom' } });
    await expect(fetchAdminRevealedPredictions(client)).rejects.toThrow(
      /Hämta avslöjade tips misslyckades: boom/
    );
  });

  it('tom data -> tom lista', async () => {
    const client = mockClient({ data: null, error: null });
    await expect(fetchAdminRevealedPredictions(client)).resolves.toEqual([]);
  });

  it('REGRESSION (F1): paginerar förbi 1000-cap, >1000 avslöjade tips läses KOMPLETT', async () => {
    // Live-buggen: admin "Vem tippar bäst" poängsattes mot bara de första 1000 avslöjade
    // tipsen -> fel poäng (Maykel 32 i admin vs 37 globalt). Paginering läser alla.
    const client = cappingRpcClient(revealedGroupRows(2500));
    const preds = await fetchAdminRevealedPredictions(client);
    expect(preds).toHaveLength(2500);
    expect(preds[2499]).toMatchObject({ kind: 'group', userId: 'u2499', groupId: 'G2499' });
  });

  it('begär exact count + stabil ORDER BY på RPC:n (paginering)', async () => {
    const client = mockClient({ data: [], error: null, count: 0 });
    await fetchAdminRevealedPredictions(client);
    const chain = (client.rpc as ReturnType<typeof vi.fn>).mock.results[0].value as Record<
      string,
      ReturnType<typeof vi.fn>
    >;
    expect(client.rpc).toHaveBeenCalledWith('admin_revealed_predictions', undefined, {
      count: 'exact',
    });
    expect(chain.range).toHaveBeenCalledWith(0, 999);
    expect(chain.order).toHaveBeenCalled();
  });
});
