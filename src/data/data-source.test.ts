import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDataSource, getDataSourceMode, isSupabaseConfigured } from './data-source';
import { createSupabaseDataSource } from './supabase-client';
import { fixtureMatches, fixtureTeams } from './fixtures';

// Bygg ett ImportMetaEnv-objekt för test. Vi injicerar env i funktionerna i
// stället för att mocka import.meta.env globalt, det gör gaten ren att testa.
function envWith(overrides: Partial<ImportMetaEnv>): ImportMetaEnv {
  return overrides as ImportMetaEnv;
}

describe('isSupabaseConfigured, miljö-detektering', () => {
  it('är false när BÅDA env-variablerna saknas (fixtures-läge)', () => {
    expect(isSupabaseConfigured(envWith({}))).toBe(false);
  });

  it('är false vid HALV konfiguration (bara URL, ingen nyckel)', () => {
    // En halv-konfiguration ska inte tändas live, hellre fixtures än trasigt live.
    expect(isSupabaseConfigured(envWith({ VITE_SUPABASE_URL: 'https://x.supabase.co' }))).toBe(
      false
    );
  });

  it('är false vid HALV konfiguration (bara nyckel, ingen URL)', () => {
    expect(isSupabaseConfigured(envWith({ VITE_SUPABASE_ANON_KEY: 'anon-key' }))).toBe(false);
  });

  it('är false när variablerna är tomma eller bara whitespace', () => {
    expect(
      isSupabaseConfigured(envWith({ VITE_SUPABASE_URL: '   ', VITE_SUPABASE_ANON_KEY: '' }))
    ).toBe(false);
  });

  it('är true när BÅDA env-variablerna finns och är icke-tomma (live-läge)', () => {
    expect(
      isSupabaseConfigured(
        envWith({
          VITE_SUPABASE_URL: 'https://x.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'anon-key',
        })
      )
    ).toBe(true);
  });
});

describe('getDataSourceMode', () => {
  it('rapporterar fixtures när env saknas', () => {
    expect(getDataSourceMode(envWith({}))).toBe('fixtures');
  });

  it('rapporterar live när env finns', () => {
    expect(
      getDataSourceMode(
        envWith({
          VITE_SUPABASE_URL: 'https://x.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'anon-key',
        })
      )
    ).toBe('live');
  });
});

describe('getDataSource, fixtures-läge (env saknas)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('väljer fixtures-källan OCH loggar en fail-loud varning (syns, inte tyst)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ds = getDataSource(envWith({}));

    // Fail-loud: fixtures-läget ska SYNAS så övergången till live inte glöms.
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('FIXTURES-läge');

    // Källan returnerar den typade fixtures-datan.
    await expect(ds.getTeams()).resolves.toEqual(fixtureTeams);
    await expect(ds.getMatches()).resolves.toEqual(fixtureMatches);
  });
});

describe('getDataSource, live-läge (env finns)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('väljer live-vägen UTAN fixtures-varning när env finns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ds = getDataSource(
      envWith({
        VITE_SUPABASE_URL: 'https://x.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'anon-key',
      })
    );

    // Ingen fixtures-fail-loud i live-läge, den hör bara hemma i fixtures-vägen.
    expect(warn).not.toHaveBeenCalled();
    // Live-källan finns (kontraktet uppfyllt), implementationen byggs i T14.
    expect(ds).toBeDefined();
    expect(typeof ds.getTeams).toBe('function');
  });

  it('live-källan fail loud:ar vid anrop före T14 (kastar, inte tyst tom data)', async () => {
    const ds = getDataSource(
      envWith({
        VITE_SUPABASE_URL: 'https://x.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'anon-key',
      })
    );

    // Stubben ska KASTA (inte returnera tom array) så ett för tidigt live-läge
    // upptäcks, inte maskeras som ett giltigt tomt svar.
    await expect(ds.getTeams()).rejects.toThrow(/inte byggd än \(T14\)/);
  });
});

describe('createSupabaseDataSource, fel-väg: kräver giltig env', () => {
  it('kastar tydligt om den anropas direkt utan giltig Supabase-env', () => {
    // Skydd mot att kringgå gaten: ett direkt-anrop utan env ska smälla med ett
    // begripligt meddelande, inte tyst skapa en trasig klient.
    expect(() => createSupabaseDataSource(envWith({}))).toThrow(/utan giltig Supabase-env/);
  });
});
