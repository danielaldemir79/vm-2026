import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDataSource, getDataSourceMode, isSupabaseConfigured, LIVE_READY } from './data-source';
import { createSupabaseDataSource } from './supabase-client';
import { resetSupabaseClientForTest } from './supabase-browser';
import { fixtureGroups, fixtureMatches, fixtureTeams } from './fixtures';
// Källkoden för data-source.ts som RÅ sträng (Vites ?raw, bundler-native, ingen
// Node-typ behövs). Driver F2-käll-scannen nedan: bevisar att den döda interims-
// strängen är borta ur den FAKTISKA källfilen.
import dataSourceSource from './data-source.ts?raw';

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

afterEach(() => {
  resetSupabaseClientForTest();
});

describe('LIVE_READY, live-klienten byggd (T14)', () => {
  it('är true sedan T14 byggt den riktiga Supabase-klienten', () => {
    // Detta lås flippades MEDVETET i T14 (från false): live tänds nu när env är
    // satt. Bryts det tillbaka till false är det en regression som detta fångar.
    expect(LIVE_READY).toBe(true);
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

  it('rapporterar fixtures när env saknas ÄVEN med LIVE_READY=true (gaten kräver båda)', () => {
    // Avgörande: läget måste spegla gaten (env OCH live-ready), inte bara flaggan.
    // Utan env faller vi alltid till fixtures, oavsett LIVE_READY.
    expect(getDataSourceMode(envWith({}), true)).toBe('fixtures');
  });

  it('rapporterar live när env finns OCH LIVE_READY är true (default sedan T14)', () => {
    // Default-LIVE_READY (true) används, så inget liveReady-argument behövs.
    expect(getDataSourceMode(liveEnv as ImportMetaEnv)).toBe('live');
  });

  it('rapporterar fixtures när env finns men liveReady injiceras false (tvåstegs-gaten)', () => {
    // Tvåstegs-gaten består: även om env är satt faller vi till fixtures om
    // live-flaggan är false. Verifieras genom att injicera liveReady=false.
    expect(getDataSourceMode(liveEnv as ImportMetaEnv, false)).toBe('fixtures');
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

  it('faller till fixtures (med varning) när env är satt men liveReady=false (tvåstegs-gaten)', async () => {
    // Tvåstegs-gatens kvarvarande princip: env utan aktiv live-flagga = fixtures.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ds = getDataSource(liveEnv as ImportMetaEnv, false);

    expect(warn).toHaveBeenCalledOnce();
    await expect(ds.getTeams()).resolves.toEqual(fixtureTeams);
  });
});

describe('getDataSource, live-läge (env finns OCH LIVE_READY true)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('väljer live-vägen UTAN fixtures-varning när env finns och live är redo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ds = getDataSource(liveEnv as ImportMetaEnv, true);

    // Ingen fixtures-fail-loud i live-läge, den hör bara hemma i fixtures-vägen.
    expect(warn).not.toHaveBeenCalled();
    expect(ds).toBeDefined();
    expect(typeof ds.getTeams).toBe('function');
  });

  it('live-källan levererar den statiska, källåkrade bas-datan (lag/grupper/matcher)', async () => {
    // T14-designval (decisions.md): tracker-basen är statisk och källåkrad, så
    // live-källan returnerar SAMMA committade data som fixtures. Det DELADE/
    // muterbara tillståndet (rum) går via rooms-API:t, inte via DataSource.
    const ds = getDataSource(liveEnv as ImportMetaEnv, true);

    await expect(ds.getTeams()).resolves.toEqual(fixtureTeams);
    await expect(ds.getGroups()).resolves.toEqual(fixtureGroups);
    await expect(ds.getMatches()).resolves.toEqual(fixtureMatches);
  });

  it('memoiserar live-klienten: fabriken körs HÖGST en gång per gate-instans', async () => {
    // C5 (bevarat efter T14): createLiveDataSource bygger live-källan via en
    // memoiserad promise, så supabase-klient-fabriken körs en gång per gate-instans
    // även om flera metoder anropas.
    const supabaseClient = await import('./supabase-client');
    const factory = vi.spyOn(supabaseClient, 'createSupabaseDataSource');

    const ds = getDataSource(liveEnv as ImportMetaEnv, true);

    await Promise.allSettled([ds.getTeams(), ds.getGroups(), ds.getMatches(), ds.getTeams()]);

    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe('createSupabaseDataSource, fel-väg: kräver giltig env', () => {
  it('kastar tydligt om den anropas direkt utan giltig Supabase-env', () => {
    // Skydd mot att kringgå gaten: ett direkt-anrop utan env ska smälla med ett
    // begripligt meddelande (getSupabaseClient fail-loud:ar), inte tyst skapa en
    // trasig klient.
    expect(() => createSupabaseDataSource(envWith({}))).toThrow(/Supabase-env saknas/);
  });

  it('initierar en klient och levererar statisk bas-data med giltig env (fel-fri väg)', async () => {
    // Med giltig env ska den riktiga klienten initieras utan att kasta, och
    // bas-data-metoderna leverera den källåkrade datan.
    const ds = createSupabaseDataSource(liveEnv as ImportMetaEnv);
    await expect(ds.getTeams()).resolves.toEqual(fixtureTeams);
  });
});

describe('F2 (#37/T14): ingen kod refererar längre den döda interims-strängen', () => {
  it('source-scan: data-source.ts nämner inte "LIVE_READY=false" (interims-grenen är borta)', () => {
    // Hotfix-reviewens F2-krav: efter flippen ska ingen kod hänga kvar vid den
    // gamla interims-varningens "LIVE_READY=false"-sträng. Vi läser källfilen som
    // rå sträng (Vites ?raw) och bevisar att strängen inte längre finns (DOM-
    // oberoende käll-scan, samma teknik som T8:s käll-scan-vakt). Källfilen
    // NÄMNER "LIVE_READY" i doc (det är OK, det är flaggans namn), men aldrig den
    // gamla "=false"-varnings-strängen.
    expect(dataSourceSource).not.toContain('LIVE_READY=false');
  });
});
