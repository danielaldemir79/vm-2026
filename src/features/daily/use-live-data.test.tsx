// Tester för useLiveData (Bit 3b). Fokus på SKARVEN: i fixtures-läge re-nycklas den
// committade demo-raden ('api-<id>') till sitt APP-match-id ('g-F-1') via Bit 1:s
// resolver, så dagsvyn (som slår upp på app-match-id) faktiskt träffar. Detta är just
// den mappnings-gren som annars tyst kunde bli fel (lessons "bevisa skarven").
//
// Env-injektion (default-arg) väljer källa: ett tomt env-objekt = fixtures-läge (ingen
// Supabase-konfig), exakt som datalagrets gate, så testet kör utan backend/nätverk.

import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLiveData } from './use-live-data';

/** Tomt env = ingen Supabase-konfig = fixtures-läge (datalagrets gate). */
function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

describe('useLiveData (fixtures-läge)', () => {
  it('laddar och blir ready', async () => {
    const { result } = renderHook(() => useLiveData(fixturesEnv(), false));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.error).toBeNull();
  });

  it('re-nycklar demo-raden till APP-match-id (g-F-1, Nederländerna-Japan)', async () => {
    const { result } = renderHook(() => useLiveData(fixturesEnv(), false));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    // Re-nyckling: app-match-id finns, råa 'api-...'-nyckeln gör det INTE.
    expect(result.current.byMatchId.has('g-F-1')).toBe(true);
    expect(result.current.byMatchId.has('api-1489376')).toBe(false);
    // Raden bär den riktiga demo-datan (en pågående match med rika blobbar).
    const row = result.current.byMatchId.get('g-F-1');
    expect(row?.status).toBe('live');
    expect(row?.events.length).toBeGreaterThan(0);
    expect(row?.statistics.length).toBeGreaterThan(0);
    expect(row?.lineups.length).toBeGreaterThan(0);
  });

  it('byMatchId är tom under laddning (ingen stale-data lekt ut)', () => {
    const { result } = renderHook(() => useLiveData(fixturesEnv(), false));
    expect(result.current.byMatchId.size).toBe(0);
  });
});
