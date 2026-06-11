import { describe, expect, it, vi, beforeEach } from 'vitest';
import { listOfficialResults, upsertOfficialResult } from './official-results-api';
import type { VmSupabaseClient } from '../supabase-browser';

// official-results-api anropar ensureSession internt (ur rooms/auth). Vi mockar
// den så testerna fokuserar på API-logiken (projektion, fel-vägar, upsert-form),
// inte auth. user_id ur sessionen = 'admin' (det sätts på updated_by).
vi.mock('../rooms/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'admin', isAnonymous: false }),
}));

/** Liten thenable-builder (samma mönster som predictions-api.test.ts). */
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

describe('listOfficialResults', () => {
  it('projicerar DB-raderna till klient-formen (utan straffar)', async () => {
    const from = vi.fn(() =>
      builder({
        data: [
          {
            match_id: 'g-A-1',
            home_goals: 3,
            away_goals: 1,
            penalties_home: null,
            penalties_away: null,
            status: 'finished',
            updated_by: 'admin',
            updated_at: 't1',
          },
        ],
        error: null,
      })
    );
    const results = await listOfficialResults(mockClient(from));
    expect(results).toEqual([
      {
        matchId: 'g-A-1',
        homeGoals: 3,
        awayGoals: 1,
        penalties: null,
        status: 'finished',
        updatedBy: 'admin',
        updatedAt: 't1',
      },
    ]);
  });

  it('mappar straffar (båda satta) till penalties-objektet', async () => {
    const from = vi.fn(() =>
      builder({
        data: [
          {
            match_id: 'M104',
            home_goals: 1,
            away_goals: 1,
            penalties_home: 4,
            penalties_away: 3,
            status: 'finished',
            updated_by: 'admin',
            updated_at: 't2',
          },
        ],
        error: null,
      })
    );
    const [r] = await listOfficialResults(mockClient(from));
    expect(r.penalties).toEqual({ homeGoals: 4, awayGoals: 3 });
  });

  it('fail loud: ett Supabase-fel kastar med svensk text', async () => {
    const from = vi.fn(() => builder({ data: null, error: { message: 'nope' } }));
    await expect(listOfficialResults(mockClient(from))).rejects.toThrow(
      /Hämta officiella resultat misslyckades: nope/
    );
  });

  it('tom data -> tom lista (ingen krasch på null)', async () => {
    const from = vi.fn(() => builder({ data: null, error: null }));
    await expect(listOfficialResults(mockClient(from))).resolves.toEqual([]);
  });
});

describe('upsertOfficialResult', () => {
  it('upsertar på match_id (GLOBAL, ingen room_id), updated_by ur sessionen', async () => {
    const chain = builder({
      data: {
        match_id: 'g-C-3',
        home_goals: 2,
        away_goals: 0,
        penalties_home: null,
        penalties_away: null,
        status: 'finished',
        updated_by: 'admin',
        updated_at: 't1',
      },
      error: null,
    });
    const from = vi.fn(() => chain);
    const saved = await upsertOfficialResult(mockClient(from), {
      matchId: 'g-C-3',
      homeGoals: 2,
      awayGoals: 0,
      status: 'finished',
    });
    expect(saved.matchId).toBe('g-C-3');
    // GLOBAL: onConflict är BARA match_id (ingen room_id), updated_by sätts ur
    // sessionen (RLS dubbelkollar = auth.uid(), ingen förfalskning). Ingen room_id
    // skickas med (det är hela poängen med global facit).
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        match_id: 'g-C-3',
        home_goals: 2,
        away_goals: 0,
        status: 'finished',
        updated_by: 'admin',
      }),
      { onConflict: 'match_id' }
    );
    const upsert = chain.upsert as ReturnType<typeof vi.fn>;
    const row = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).not.toHaveProperty('room_id');
  });

  it('skickar straffar som separata kolumner när de finns', async () => {
    const chain = builder({
      data: {
        match_id: 'M104',
        home_goals: 1,
        away_goals: 1,
        penalties_home: 5,
        penalties_away: 4,
        status: 'finished',
        updated_by: 'admin',
        updated_at: 't1',
      },
      error: null,
    });
    const from = vi.fn(() => chain);
    await upsertOfficialResult(mockClient(from), {
      matchId: 'M104',
      homeGoals: 1,
      awayGoals: 1,
      penalties: { homeGoals: 5, awayGoals: 4 },
      status: 'finished',
    });
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ penalties_home: 5, penalties_away: 4 }),
      { onConflict: 'match_id' }
    );
  });

  it('fail loud: ett RLS-avslag (icke-admin skriver) kastar, ingen tyst no-op', async () => {
    const from = vi.fn(() =>
      builder({ data: null, error: { message: 'new row violates row-level security policy' } })
    );
    await expect(
      upsertOfficialResult(mockClient(from), {
        matchId: 'g-A-1',
        homeGoals: 1,
        awayGoals: 0,
        status: 'finished',
      })
    ).rejects.toThrow(/Spara officiellt resultat misslyckades/);
  });
});
