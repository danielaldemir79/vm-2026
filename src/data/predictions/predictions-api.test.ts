import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  isMatchLocked,
  listMyPredictions,
  listRoomPredictions,
  upsertMyPrediction,
} from './predictions-api';
import type { VmSupabaseClient } from '../supabase-browser';

// predictions-api anropar ensureSession internt (ur rooms/auth). Vi mockar den så
// testerna fokuserar på API-logiken (projektion, fel-vägar, lås-koll), inte auth.
vi.mock('../rooms/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'me', isAnonymous: true }),
}));

/** Liten thenable-builder (samma mönster som rooms-api.test.ts). `count` defaultar till
 * antalet rader, så den paginerade läsvägen (selectAllRows) ser ett completeness-sant svar. */
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

/**
 * En mock som MODELLERAR PostgREST-cap:en: en rak (opaginerad) await ger BARA de första
 * `cap` raderna (precis som live-buggen), medan en `.range(from, to)` ger rätt sida med ett
 * exact count. Det gör regressions-testet diskriminerande: den gamla raka koden får 1000,
 * den nya paginerade koden får hela mängden.
 */
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
    // Rak await (gamla vägen) = tyst kapad till `cap` rader.
    (chain as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: allRows.slice(0, cap), error: null, count: allRows.length }).then(
        onFulfilled
      );
    return chain;
  });
}

/** Bygg `n` syntetiska predictions-rader för ett rum (unika match/user, så dubbletter syns). */
function predictionRows(roomId: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    room_id: roomId,
    match_id: `m${i}`,
    user_id: `u${i}`,
    home_goals: 1,
    away_goals: 0,
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

describe('isMatchLocked (klient-sidans VISNINGS-lås, servern är sanningen)', () => {
  const kickoff = '2026-06-20T18:00:00.000Z';

  it('OLÅST före avspark (now < kickoff)', () => {
    expect(isMatchLocked(kickoff, new Date('2026-06-20T17:59:59.000Z'))).toBe(false);
  });

  it('LÅST exakt på avspark (now === kickoff): deadline-sekunden hör till låst', () => {
    // Randfall: precis på sekunden ska matchen vara LÅST (now >= kickoff), samma
    // riktning som server-RLS:ens `now() < kickoff` (då nekas skriv på likhet).
    expect(isMatchLocked(kickoff, new Date('2026-06-20T18:00:00.000Z'))).toBe(true);
  });

  it('LÅST efter avspark (now > kickoff)', () => {
    expect(isMatchLocked(kickoff, new Date('2026-06-20T18:00:01.000Z'))).toBe(true);
  });
});

describe('listRoomPredictions', () => {
  it('projicerar DB-raderna till klient-formen', async () => {
    const from = vi.fn(() =>
      builder({
        data: [
          {
            room_id: 'r1',
            match_id: 'g-A-1',
            user_id: 'u2',
            home_goals: 2,
            away_goals: 1,
            created_at: 't0',
            updated_at: 't1',
          },
        ],
        error: null,
      })
    );
    const preds = await listRoomPredictions(mockClient(from), 'r1');
    expect(preds).toEqual([
      { matchId: 'g-A-1', userId: 'u2', homeGoals: 2, awayGoals: 1, updatedAt: 't1' },
    ]);
  });

  it('fail loud: ett Supabase-fel (t.ex. RLS-avslag) kastar med svensk text', async () => {
    const from = vi.fn(() => builder({ data: null, error: { message: 'nope' } }));
    await expect(listRoomPredictions(mockClient(from), 'r1')).rejects.toThrow(
      /Hämta tips misslyckades: nope/
    );
  });

  it('tom data -> tom lista (ingen krasch på null)', async () => {
    const from = vi.fn(() => builder({ data: null, error: null }));
    await expect(listRoomPredictions(mockClient(from), 'r1')).resolves.toEqual([]);
  });

  it('REGRESSION (F1): paginerar förbi 1000-cap, ett rum med >1000 tips läses KOMPLETT', async () => {
    // Live-buggen: ett rum med 2851 matchtips poängsattes mot bara de första 1000 -> fel
    // poäng + ordning. Mocken kapar en rak await till 1000 men ger rätt sidor via .range(),
    // så detta failar på den gamla opaginerade koden och passerar först när vi paginerar.
    const all = predictionRows('r1', 2500);
    const from = cappingFrom(all);
    const preds = await listRoomPredictions(mockClient(from), 'r1');
    expect(preds).toHaveLength(2500);
    // Sista raden (bortom 1000-cap:en) MÅSTE finnas med (annars är vi fortfarande kapade).
    expect(preds[2499]).toMatchObject({ matchId: 'm2499', userId: 'u2499' });
  });

  it('läser med stabil total ORDER BY (PK) + exact count, så sid-gränsen är väldefinierad', async () => {
    const chain = builder({ data: [], error: null, count: 0 });
    const from = vi.fn(() => chain);
    await listRoomPredictions(mockClient(from), 'r1');
    // Exact count begärs (completeness-vakten), och PK-kolumnerna ordnas (stabil paginering).
    expect(chain.select).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(chain.eq).toHaveBeenCalledWith('room_id', 'r1');
    expect(chain.order).toHaveBeenCalledWith('match_id', { ascending: true });
    expect(chain.order).toHaveBeenCalledWith('user_id', { ascending: true });
    expect(chain.range).toHaveBeenCalledWith(0, 999);
  });
});

describe('listMyPredictions', () => {
  it('filtrerar på mitt user_id och projicerar', async () => {
    const chain = builder({
      data: [
        {
          room_id: 'r1',
          match_id: 'g-B-2',
          user_id: 'me',
          home_goals: 0,
          away_goals: 0,
          created_at: 't0',
          updated_at: 't1',
        },
      ],
      error: null,
    });
    const from = vi.fn(() => chain);
    const preds = await listMyPredictions(mockClient(from), 'r1');
    expect(preds).toEqual([
      { matchId: 'g-B-2', userId: 'me', homeGoals: 0, awayGoals: 0, updatedAt: 't1' },
    ]);
    // Bekräfta att vi filtrerade på room + eget user_id (eq anropad två gånger).
    expect(chain.eq).toHaveBeenCalledWith('room_id', 'r1');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'me');
  });
});

describe('upsertMyPrediction', () => {
  it('upsertar mitt tips (user_id ur sessionen) och projicerar svaret', async () => {
    const chain = builder({
      data: {
        room_id: 'r1',
        match_id: 'g-C-3',
        user_id: 'me',
        home_goals: 3,
        away_goals: 2,
        created_at: 't0',
        updated_at: 't1',
      },
      error: null,
    });
    const from = vi.fn(() => chain);
    const saved = await upsertMyPrediction(mockClient(from), 'r1', {
      matchId: 'g-C-3',
      homeGoals: 3,
      awayGoals: 2,
    });
    expect(saved).toEqual({
      matchId: 'g-C-3',
      userId: 'me',
      homeGoals: 3,
      awayGoals: 2,
      updatedAt: 't1',
    });
    // user_id sätts av API:t ur sessionen (ingen förfalskning), och vi upsertar
    // på den sammansatta nyckeln (ett tips per rum/match/användare).
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'me', match_id: 'g-C-3', home_goals: 3, away_goals: 2 }),
      { onConflict: 'room_id,match_id,user_id' }
    );
  });

  it('fail loud: ett RLS-avslag (tips efter avspark) kastar, ingen tyst no-op', async () => {
    const from = vi.fn(() =>
      builder({ data: null, error: { message: 'new row violates row-level security policy' } })
    );
    await expect(
      upsertMyPrediction(mockClient(from), 'r1', { matchId: 'g-A-1', homeGoals: 1, awayGoals: 0 })
    ).rejects.toThrow(/Spara tips misslyckades/);
  });
});
