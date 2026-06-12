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

/** En klient vars rpc(name) returnerar ett förbestämt {data,error}. */
function mockClient(result: { data: unknown; error: unknown }): VmSupabaseClient {
  return { rpc: vi.fn().mockResolvedValue(result) } as unknown as VmSupabaseClient;
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
});
