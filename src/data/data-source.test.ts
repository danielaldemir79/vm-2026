import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDataSource, getDataSourceMode, isSupabaseConfigured, LIVE_READY } from './data-source';
import { createSupabaseDataSource } from './supabase-client';
import * as supabaseClient from './supabase-client';
import { fixtureMatches, fixtureTeams } from './fixtures';

/** Giltig Supabase-env för att tända live-grenen i test. */
const liveEnv = {
  VITE_SUPABASE_URL: 'https://x.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
};

// Bygg ett ImportMetaEnv-objekt för test. Vi injicerar env i funktionerna i
// stället för att mocka import.meta.env globalt, det gör gaten ren att testa.
function envWith(overrides: Partial<ImportMetaEnv>): ImportMetaEnv {
  return overrides as ImportMetaEnv;
}

describe('LIVE_READY, hotfix-grindens skarpläge (#37)', () => {
  it('är false tills T14 byggt live-klienten (annars tänder produktion den kastande stubben)', () => {
    // Detta lås är medvetet: när T14 flippar LIVE_READY ska detta test brytas
    // SAMTIDIGT som interims-varningen tas bort, så de två stegen inte glöms.
    expect(LIVE_READY).toBe(false);
  });
});

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

  it('rapporterar fixtures när env FINNS men LIVE_READY är false (interims-läget #37)', () => {
    // Avgörande: läget måste spegla gaten, inte bara env. Annars hade UI:t märkt
    // demo-data som "live" medan datakällan i själva verket är fixtures.
    // Standarden (LIVE_READY=false) gäller, så ingen liveReady-injektion här.
    expect(
      getDataSourceMode(
        envWith({
          VITE_SUPABASE_URL: 'https://x.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'anon-key',
        })
      )
    ).toBe('fixtures');
  });

  it('rapporterar live när env finns OCH LIVE_READY är true', () => {
    // Live-grenen verifieras genom att injicera liveReady=true (KISS, ingen
    // global konstant att flippa).
    expect(getDataSourceMode(liveEnv as ImportMetaEnv, true)).toBe('live');
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
    expect(warn.mock.calls[0][0]).toContain('Supabase-env saknas');

    // Källan returnerar den typade fixtures-datan.
    await expect(ds.getTeams()).resolves.toEqual(fixtureTeams);
    await expect(ds.getMatches()).resolves.toEqual(fixtureMatches);
  });
});

describe('getDataSource, interims-läget (env satt men LIVE_READY false, #37)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('kör FIXTURES (inte den kastande stubben) och varnar att klienten väntar på T14', async () => {
    // Detta är hela hotfixen #37: i produktion är Supabase-env satt (Cloudflare),
    // men supabase-client.ts är fortfarande en kastande stub. Med default
    // (LIVE_READY=false) MÅSTE gaten falla till fixtures, annars ser Daniels
    // vänner fel-alerts i alla vyer.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ds = getDataSource(liveEnv as ImportMetaEnv);

    // En EGEN varning som skiljer interims-läget från "env saknas".
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('LIVE_READY=false');

    // Fixtures-data, INTE ett kast: produktion visar matcher, inte fel.
    await expect(ds.getTeams()).resolves.toEqual(fixtureTeams);
    await expect(ds.getMatches()).resolves.toEqual(fixtureMatches);
  });
});

describe('getDataSource, live-läge (env finns OCH LIVE_READY true)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Live-grenen tänds genom att injicera liveReady=true (default är false sedan
  // #37). Det håller testet enkelt (KISS): ingen global konstant att flippa,
  // bara en parameter, och live-vägens beteende verifieras oförändrat.

  it('väljer live-vägen UTAN fixtures-varning när env finns och live är redo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ds = getDataSource(liveEnv as ImportMetaEnv, true);

    // Ingen fixtures-fail-loud i live-läge, den hör bara hemma i fixtures-vägen.
    expect(warn).not.toHaveBeenCalled();
    // Live-källan finns (kontraktet uppfyllt), implementationen byggs i T14.
    expect(ds).toBeDefined();
    expect(typeof ds.getTeams).toBe('function');
  });

  it('live-källan fail loud:ar vid anrop före T14 (kastar, inte tyst tom data)', async () => {
    const ds = getDataSource(liveEnv as ImportMetaEnv, true);

    // Stubben ska KASTA (inte returnera tom array) så ett för tidigt live-läge
    // upptäcks, inte maskeras som ett giltigt tomt svar.
    await expect(ds.getTeams()).rejects.toThrow(/inte byggd än \(T14\)/);
  });

  it('memoiserar live-klienten: fabriken körs HÖGST en gång per gate-instans', async () => {
    // C5: createLiveDataSource byggde tidigare en ny klient vid varje getTeams/
    // getGroups/getMatches. Nu memoiseras promisen, så fabriken körs en gång.
    const factory = vi.spyOn(supabaseClient, 'createSupabaseDataSource');

    const ds = getDataSource(liveEnv as ImportMetaEnv, true);

    // Flera anrop på samma instans (de fail loud:ar, men init ska bara ske en gång).
    await Promise.allSettled([ds.getTeams(), ds.getGroups(), ds.getMatches(), ds.getTeams()]);

    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe('createSupabaseDataSource, fel-väg: kräver giltig env', () => {
  it('kastar tydligt om den anropas direkt utan giltig Supabase-env', () => {
    // Skydd mot att kringgå gaten: ett direkt-anrop utan env ska smälla med ett
    // begripligt meddelande, inte tyst skapa en trasig klient.
    expect(() => createSupabaseDataSource(envWith({}))).toThrow(/utan giltig Supabase-env/);
  });
});
