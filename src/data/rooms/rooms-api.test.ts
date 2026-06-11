import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createRoom,
  joinRoomByCode,
  listMembers,
  listMyRooms,
  leaveRoom,
  listRoomResults,
  upsertRoomResult,
} from './rooms-api';
import type { VmSupabaseClient } from '../supabase-browser';

// rooms-api anropar ensureSession internt. Vi mockar auth-modulen så testerna
// fokuserar på API-logiken (projektion, fel-vägar, kod-retry), inte auth-flödet
// (det testas i auth.test.ts).
vi.mock('./auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'me', isAnonymous: true }),
}));

/**
 * Bygg en mock-klient. `rpc` är en vi.fn; `from` returnerar en kedja vars
 * terminerande metod (det testet bryr sig om) ger ett {data,error}-svar. Vi
 * bygger en liten "thenable builder" som returnerar sig själv för kedje-metoder
 * och resolvar till `result` när den await:as eller .single()/.maybeSingle() körs.
 */
function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain as never;
  for (const m of ['select', 'eq', 'order', 'delete', 'upsert', 'insert']) {
    chain[m] = vi.fn(self);
  }
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  // await:bar: en select/eq/order-kedja utan .single() resolvar direkt till result.
  (chain as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return chain;
}

function mockClient(opts: {
  rpc?: ReturnType<typeof vi.fn>;
  from?: ReturnType<typeof vi.fn>;
}): VmSupabaseClient {
  return {
    rpc: opts.rpc ?? vi.fn(),
    from: opts.from ?? vi.fn(),
  } as unknown as VmSupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createRoom', () => {
  it('skapar ett rum via create_room-RPC och projicerar svaret', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ room_id: 'r1', room_name: 'Vänner', room_code: 'abc23x' }],
      error: null,
    });
    const room = await createRoom(mockClient({ rpc }), 'Vänner', 'Daniel');

    expect(room).toEqual({ id: 'r1', name: 'Vänner', code: 'abc23x' });
    expect(rpc).toHaveBeenCalledWith(
      'create_room',
      expect.objectContaining({ p_name: 'Vänner', p_display_name: 'Daniel' })
    );
  });

  it('prövar en NY kod vid UNIQUE-krock (23505) och lyckas på andra försöket', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'dup' } })
      .mockResolvedValueOnce({
        data: [{ room_id: 'r2', room_name: 'X', room_code: 'second' }],
        error: null,
      });

    const room = await createRoom(mockClient({ rpc }), 'X', 'Daniel');

    expect(room.id).toBe('r2');
    expect(rpc).toHaveBeenCalledTimes(2); // krock -> retry med ny kod
  });

  it('fail loud:ar på ett ICKE-krock-fel (kastar, ingen retry)', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: '42501', message: 'nekad' } });

    await expect(createRoom(mockClient({ rpc }), 'X', 'Daniel')).rejects.toThrow(
      /Skapa rum misslyckades: nekad/
    );
    expect(rpc).toHaveBeenCalledTimes(1); // RLS-avslag är inte en kod-krock -> ingen retry
  });

  it('fail loud:ar om ingen ledig kod hittas efter maxAttempts', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'dup' } });

    await expect(createRoom(mockClient({ rpc }), 'X', 'Daniel', 3)).rejects.toThrow(
      /kunde inte hitta en ledig kod efter 3 försök/
    );
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});

describe('joinRoomByCode', () => {
  it('går med via kod och projicerar rummet', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ room_id: 'r1', room_name: 'Vänner', room_code: 'abc23x' }],
      error: null,
    });
    const room = await joinRoomByCode(mockClient({ rpc }), '  ABC23X ', 'Bob');

    expect(room).toEqual({ id: 'r1', name: 'Vänner', code: 'abc23x' });
    // Koden normaliseras (trim + gemener) före anrop, speglar DB-RPC:n.
    expect(rpc).toHaveBeenCalledWith('join_room_by_code', {
      p_code: 'abc23x',
      p_display_name: 'Bob',
    });
  });

  it('returnerar null när koden inte matchar något rum (ingen läcka)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await expect(joinRoomByCode(mockClient({ rpc }), 'zzzz9', 'Bob')).resolves.toBeNull();
  });

  it('fail loud:ar på ett RPC-fel', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'trasig' } });

    await expect(joinRoomByCode(mockClient({ rpc }), 'abc23x', 'Bob')).rejects.toThrow(
      /Gå med i rum misslyckades: trasig/
    );
  });
});

describe('listMyRooms', () => {
  it('projicerar de inbäddade rummen och filtrerar bort null', async () => {
    const from = vi.fn().mockReturnValue(
      builder({
        data: [
          { rooms: { id: 'r1', name: 'A', code: 'aaa11' } },
          { rooms: null }, // en föräldralös rad ska filtreras bort, inte krascha
          { rooms: { id: 'r2', name: 'B', code: 'bbb22' } },
        ],
        error: null,
      })
    );

    const rooms = await listMyRooms(mockClient({ from }));

    expect(rooms).toEqual([
      { id: 'r1', name: 'A', code: 'aaa11' },
      { id: 'r2', name: 'B', code: 'bbb22' },
    ]);
  });

  it('filtrerar på EGEN user_id (rotorsak T59 #97: annars en rad per medlem)', async () => {
    // Roten till dubblett-buggen: utan .eq('user_id', <jag>) släpper RLS igenom ALLA
    // medlemsrader i rum man är med i, så rummen joinas en gång per medlem. Detta test
    // låser fast att vi frågar room_members filtrerat på den EGNA identiteten
    // (ensureSession-mockens uid = 'me'), så queryn ger en rad per rum, inte per medlem.
    const chain = builder({
      data: [{ rooms: { id: 'r1', name: 'A', code: 'aaa11' } }],
      error: null,
    });
    const from = vi.fn().mockReturnValue(chain);

    await listMyRooms(mockClient({ from }));

    expect(from).toHaveBeenCalledWith('room_members');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'me');
  });

  it('dedupar samma rum till EN post när queryn ger flera medlemsrader (regression T59 #97)', async () => {
    // Regressionsskydd för den defensiva dedupen: även om queryn (RLS-drift eller en
    // framtida select-ändring) skulle ge flera rader för SAMMA rum (en per medlem, precis
    // det bugg-symptomet, "VM 2026 x7"), ska listan visa rummet exakt EN gång. Här:
    // 'rVM' tre gånger + 'rR' två gånger -> exakt två RoomSummary, en per distinkt room.id.
    const from = vi.fn().mockReturnValue(
      builder({
        data: [
          { rooms: { id: 'rVM', name: 'VM 2026', code: 'vm0001' } },
          { rooms: { id: 'rVM', name: 'VM 2026', code: 'vm0001' } },
          { rooms: { id: 'rR', name: 'Rhodos Champs', code: 'rho002' } },
          { rooms: { id: 'rVM', name: 'VM 2026', code: 'vm0001' } },
          { rooms: { id: 'rR', name: 'Rhodos Champs', code: 'rho002' } },
        ],
        error: null,
      })
    );

    const rooms = await listMyRooms(mockClient({ from }));

    // Exakt en post per rum (AC 1), i joined_at-ordning (första förekomsten vinner).
    expect(rooms).toEqual([
      { id: 'rVM', name: 'VM 2026', code: 'vm0001' },
      { id: 'rR', name: 'Rhodos Champs', code: 'rho002' },
    ]);
  });

  it('fail loud:ar på fel', async () => {
    const from = vi.fn().mockReturnValue(builder({ data: null, error: { message: 'fel' } }));
    await expect(listMyRooms(mockClient({ from }))).rejects.toThrow(/Hämta mina rum misslyckades/);
  });
});

describe('listMembers', () => {
  it('projicerar medlemmarna (user_id/display_name -> userId/displayName)', async () => {
    const from = vi.fn().mockReturnValue(
      builder({
        data: [
          { user_id: 'u1', display_name: 'Daniel' },
          { user_id: 'u2', display_name: 'Bob' },
        ],
        error: null,
      })
    );

    const members = await listMembers(mockClient({ from }), 'r1');

    expect(members).toEqual([
      { userId: 'u1', displayName: 'Daniel' },
      { userId: 'u2', displayName: 'Bob' },
    ]);
  });

  it('fail loud:ar på fel', async () => {
    const from = vi.fn().mockReturnValue(builder({ data: null, error: { message: 'fel' } }));
    await expect(listMembers(mockClient({ from }), 'r1')).rejects.toThrow(
      /Hämta medlemmar misslyckades/
    );
  });
});

describe('leaveRoom', () => {
  it('tar bort sin egen medlems-rad (room_id + user_id)', async () => {
    const chain = builder({ data: null, error: null });
    const from = vi.fn().mockReturnValue(chain);

    await leaveRoom(mockClient({ from }), 'r1');

    expect(from).toHaveBeenCalledWith('room_members');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('room_id', 'r1');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'me'); // ensureSession-mockens uid
  });

  it('fail loud:ar på fel', async () => {
    const from = vi.fn().mockReturnValue(builder({ data: null, error: { message: 'fel' } }));
    await expect(leaveRoom(mockClient({ from }), 'r1')).rejects.toThrow(/Lämna rum misslyckades/);
  });
});

describe('listRoomResults', () => {
  it('projicerar resultat MED straffar', async () => {
    const from = vi.fn().mockReturnValue(
      builder({
        data: [
          {
            room_id: 'r1',
            match_id: 'M73',
            home_goals: 1,
            away_goals: 1,
            penalties_home: 4,
            penalties_away: 3,
            status: 'finished',
            updated_by: 'u1',
            updated_at: '2026-06-10T00:00:00Z',
          },
        ],
        error: null,
      })
    );

    const results = await listRoomResults(mockClient({ from }), 'r1');

    expect(results[0]).toEqual({
      matchId: 'M73',
      homeGoals: 1,
      awayGoals: 1,
      penalties: { homeGoals: 4, awayGoals: 3 },
      status: 'finished',
      updatedBy: 'u1',
      updatedAt: '2026-06-10T00:00:00Z',
    });
  });

  it('projicerar resultat UTAN straffar som penalties: null', async () => {
    const from = vi.fn().mockReturnValue(
      builder({
        data: [
          {
            room_id: 'r1',
            // Giltigt gruppmatch-id ('g-A-1'); 'M1' finns inte i planen och nekas
            // av rmr_match_id_format (gruppspel = g-...-id, slutspel = M73..M104).
            match_id: 'g-A-1',
            home_goals: 2,
            away_goals: 0,
            penalties_home: null,
            penalties_away: null,
            status: 'finished',
            updated_by: 'u1',
            updated_at: '2026-06-10T00:00:00Z',
          },
        ],
        error: null,
      })
    );

    const results = await listRoomResults(mockClient({ from }), 'r1');
    expect(results[0].penalties).toBeNull();
  });
});

describe('upsertRoomResult', () => {
  it('skriver resultat med straffar (sätter penalties_home/away)', async () => {
    const chain = builder({
      data: {
        room_id: 'r1',
        match_id: 'M73',
        home_goals: 1,
        away_goals: 1,
        penalties_home: 5,
        penalties_away: 4,
        status: 'finished',
        updated_by: 'me',
        updated_at: '2026-06-10T00:00:00Z',
      },
      error: null,
    });
    const from = vi.fn().mockReturnValue(chain);

    const result = await upsertRoomResult(mockClient({ from }), 'r1', {
      matchId: 'M73',
      homeGoals: 1,
      awayGoals: 1,
      penalties: { homeGoals: 5, awayGoals: 4 },
      status: 'finished',
    });

    expect(result.penalties).toEqual({ homeGoals: 5, awayGoals: 4 });
    // updated_by bundet till ensureSession-uid ('me'), upsert på rätt konflikt-nyckel.
    const upsertArg = (chain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upsertArg).toMatchObject({
      room_id: 'r1',
      match_id: 'M73',
      penalties_home: 5,
      penalties_away: 4,
      updated_by: 'me',
    });
  });

  it('skriver resultat UTAN straffar som null-par (gruppspel)', async () => {
    const chain = builder({
      data: {
        room_id: 'r1',
        // Gruppmatch -> giltigt 'g-A-1'-id (gruppspel bär g-...-id, inte 'M1').
        match_id: 'g-A-1',
        home_goals: 2,
        away_goals: 0,
        penalties_home: null,
        penalties_away: null,
        status: 'finished',
        updated_by: 'me',
        updated_at: '2026-06-10T00:00:00Z',
      },
      error: null,
    });
    const from = vi.fn().mockReturnValue(chain);

    await upsertRoomResult(mockClient({ from }), 'r1', {
      matchId: 'g-A-1',
      homeGoals: 2,
      awayGoals: 0,
      status: 'finished',
    });

    const upsertArg = (chain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upsertArg.penalties_home).toBeNull();
    expect(upsertArg.penalties_away).toBeNull();
  });

  it('fail loud:ar på ett skriv-fel (t.ex. RLS-avslag)', async () => {
    const from = vi.fn().mockReturnValue(builder({ data: null, error: { message: 'RLS nekad' } }));

    await expect(
      upsertRoomResult(mockClient({ from }), 'r1', {
        matchId: 'g-A-1',
        homeGoals: 1,
        awayGoals: 0,
        status: 'finished',
      })
    ).rejects.toThrow(/Spara resultat misslyckades: RLS nekad/);
  });
});
