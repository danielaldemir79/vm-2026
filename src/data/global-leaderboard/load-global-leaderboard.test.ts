// Tester för klient-läsaren av den globala topplistan (T90, #183). FOKUS: happy-path
// (säkra rader passerar igenom), och FEL-vägarna (funktionsfel + oväntad form) som
// fail-loud:ar i stället för att tyst ge en trasig lista.

import { describe, expect, it, vi } from 'vitest';
import type { VmSupabaseClient } from '../supabase-browser';
import { loadGlobalLeaderboard } from './load-global-leaderboard';

/** Bygg en minimal klient-stub vars functions.invoke ger ett givet svar. */
function clientWith(invokeResult: { data?: unknown; error?: unknown }): VmSupabaseClient {
  return {
    functions: { invoke: vi.fn().mockResolvedValue(invokeResult) },
  } as unknown as VmSupabaseClient;
}

const SAFE_ROWS = [
  { userId: 'u1', displayName: 'Alice', points: 9, rank: 1, exactHits: 3 },
  { userId: 'u2', displayName: 'Bob', points: 4, rank: 2, exactHits: 1 },
];

describe('loadGlobalLeaderboard', () => {
  it('returnerar de säkra raderna vid ett giltigt svar', async () => {
    const client = clientWith({ data: { leaderboard: SAFE_ROWS, participants: 2 }, error: null });
    const rows = await loadGlobalLeaderboard(client);
    expect(rows).toEqual(SAFE_ROWS);
  });

  it('KASTAR (fail-loud) vid ett funktionsfel', async () => {
    const client = clientWith({ data: null, error: { message: 'boom' } });
    await expect(loadGlobalLeaderboard(client)).rejects.toThrow(/topplistan.*boom/i);
  });

  it('KASTAR vid en oväntad svarsform (ingen leaderboard-array)', async () => {
    const client = clientWith({ data: { participants: 0 }, error: null });
    await expect(loadGlobalLeaderboard(client)).rejects.toThrow(/oväntad form/i);
  });

  it('KASTAR om en rad SAKNAR ett säkert fält (defensiv form-koll)', async () => {
    const bad = [{ userId: 'u1', displayName: 'Alice', points: 9, rank: 1 }]; // exactHits saknas
    const client = clientWith({ data: { leaderboard: bad, participants: 1 }, error: null });
    await expect(loadGlobalLeaderboard(client)).rejects.toThrow(/oväntad form/i);
  });

  it('KASTAR om en rad bär ett EXTRA tips-fält men fel typ (form-kollen släpper inte igenom skräp)', async () => {
    // En rad där points är en sträng (fel typ) ska inte passera form-kollen.
    const bad = [{ userId: 'u1', displayName: 'Alice', points: '9', rank: 1, exactHits: 0 }];
    const client = clientWith({ data: { leaderboard: bad, participants: 1 }, error: null });
    await expect(loadGlobalLeaderboard(client)).rejects.toThrow(/oväntad form/i);
  });
});
