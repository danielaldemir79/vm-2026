// Tester för klient-läs-lagret (Bit 3a). Fokus enligt direktivet:
//   - tom data (ingen rad) -> tom lista, ingen krasch på null
//   - frusen vs live rad projiceras rätt (frozen-flaggan + status)
//   - trasig/saknad blob -> säkert tomt PER sektion, ALDRIG krasch, fail-loud-logg
//   - fixtures-läge (env saknas) returnerar committad live-fixtures UTAN backend
//   - fail-loud på Supabase-fel
//   - SKARVEN: en stored jsonb-blob är ett RawApiResponse-KUVERT (källans form),
//     parsad genom Bit 1:s RIKTIGA parser, inte en handskriven konsument-form.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  fixtureLiveData,
  getLiveData,
  getLiveDataForMatch,
  listLiveData,
  projectLiveData,
  type LiveData,
} from './live-read';
import { liveClockFor } from './live-realtime';
import type { Database } from '../supabase-types';
import type { VmSupabaseClient } from '../supabase-browser';

// Stored jsonb-blobbarna i match_live_data är HELA API-Football-svar (RawApiResponse-
// kuvert), exakt det pollaren matar in och det Bit 1:s parsers tar. Vi läser de
// committade sample-svaren RÅ (?raw, samma väg som fixtures.ts) och stoppar in dem som
// DB-blobbar, så testet bevisar SKARVEN mot KÄLLANS form (inte en konsument-form).
import eventsRaw from './__fixtures__/events-rich.json?raw';
import statisticsRaw from './__fixtures__/statistics-rich.json?raw';
import lineupsRaw from './__fixtures__/lineups-rich.json?raw';

const eventsEnvelope = JSON.parse(eventsRaw);
const statisticsEnvelope = JSON.parse(statisticsRaw);
const lineupsEnvelope = JSON.parse(lineupsRaw);

// listLiveData/getLiveDataForMatch anropar ensureSession internt. Mocka den så
// testerna fokuserar på läs-/projektions-logiken, inte auth (samma mönster som
// official-results-api.test.ts).
vi.mock('../rooms/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'anon', isAnonymous: true }),
}));

type LiveDataRow = Database['public']['Tables']['match_live_data']['Row'];

/** Bygg en komplett DB-rad med rimliga default, override per test. */
function row(overrides: Partial<LiveDataRow> = {}): LiveDataRow {
  return {
    match_id: 'g-A-1',
    api_fixture_id: 1001,
    status: 'live',
    elapsed_minute: 37,
    home_goals: 1,
    away_goals: 0,
    events: null,
    statistics: null,
    lineups: null,
    last_synced_at: '2026-06-15T18:37:00.000Z',
    frozen: false,
    updated_at: '2026-06-15T18:37:05.000Z',
    ...overrides,
  };
}

/** Liten thenable-builder (samma mönster som official-results-api.test.ts). */
function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain as never;
  for (const m of ['select', 'eq', 'order']) {
    chain[m] = vi.fn(self);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
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

describe('projectLiveData (ren projektion)', () => {
  it('projicerar de skalära fälten oförändrat (status/ställning/minut/frozen)', () => {
    const data = projectLiveData(row({ status: 'paused', elapsed_minute: 45, frozen: false }));
    expect(data).toMatchObject({
      matchId: 'g-A-1',
      apiFixtureId: 1001,
      status: 'paused',
      elapsedMinute: 45,
      homeGoals: 1,
      awayGoals: 0,
      frozen: false,
      lastSyncedAt: '2026-06-15T18:37:00.000Z',
    });
  });

  it('en FRUSEN (finished) rad projiceras med frozen=true', () => {
    const data = projectLiveData(row({ status: 'finished', frozen: true, elapsed_minute: 90 }));
    expect(data.status).toBe('finished');
    expect(data.frozen).toBe(true);
  });

  it('null-blobbar -> tomma sektioner (en pågående match har ännu inga rika blobbar)', () => {
    const data = projectLiveData(row({ events: null, statistics: null, lineups: null }));
    expect(data.events).toEqual([]);
    expect(data.statistics).toEqual([]);
    expect(data.lineups).toEqual([]);
  });

  it('null api_fixture_id/elapsed/goals tål null utan krasch', () => {
    const data = projectLiveData(
      row({ api_fixture_id: null, elapsed_minute: null, home_goals: null, away_goals: null })
    );
    expect(data.apiFixtureId).toBeNull();
    expect(data.elapsedMinute).toBeNull();
    expect(data.homeGoals).toBeNull();
    expect(data.awayGoals).toBeNull();
  });

  it('okänt/null status fail-SAFE:ar till unknown (ALDRIG live på en kod vi inte förstår)', () => {
    expect(projectLiveData(row({ status: null })).status).toBe('unknown');
    expect(projectLiveData(row({ status: 'WAT' })).status).toBe('unknown');
    // Ett giltigt värde bevaras (negativ-kontroll: regeln avvisar inte allt).
    expect(projectLiveData(row({ status: 'live' })).status).toBe('live');
  });
});

describe('projectLiveData SKARVEN: råa jsonb-kuvert parsas av Bit 1', () => {
  it('parsar ett RawApiResponse-kuvert (events) genom den RIKTIGA parsern', () => {
    const data = projectLiveData(row({ events: eventsEnvelope }));
    // events-rich har 22 poster -> parsern ger 22 normaliserade events.
    expect(data.events).toHaveLength(22);
    // Bevisa att det är PARSAD form (konsument-fält), inte den råa blobben.
    expect(data.events[0]).toHaveProperty('kind');
    expect(data.events[0]).toHaveProperty('minute');
  });

  it('parsar statistik- och lineup-kuvert genom de riktiga parsrarna', () => {
    const data = projectLiveData(row({ statistics: statisticsEnvelope, lineups: lineupsEnvelope }));
    expect(data.statistics).toHaveLength(2); // 2 lag
    expect(data.lineups).toHaveLength(2);
    expect(data.lineups[0]).toHaveProperty('startXI');
  });

  it('en TRASIG blob -> tom sektion + fail-loud-logg, ALDRIG krasch (resten lever)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Trasig: ett objekt utan response-array (parsern kastar internt).
    const data = projectLiveData(
      row({
        events: {
          bogus: true,
        } as unknown as Database['public']['Tables']['match_live_data']['Row']['events'],
      })
    );
    // Sektionen blev tom (säkert), men inte tyst: en warn loggades.
    expect(data.events).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('events');
    // Resten av kortet är intakt (skarven släckte inte hela vyn).
    expect(data.status).toBe('live');
    expect(data.homeGoals).toBe(1);
    warn.mockRestore();
  });

  it('en trasig events-blob släcker INTE statistik/lineups (per-sektion isolering)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = projectLiveData(
      row({
        events: 42 as unknown as LiveDataRow['events'], // trasig
        statistics: statisticsEnvelope, // giltig
        lineups: lineupsEnvelope, // giltig
      })
    );
    expect(data.events).toEqual([]); // trasig sektion isolerad
    expect(data.statistics).toHaveLength(2); // grannarna oskadda
    expect(data.lineups).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('listLiveData (klient-tagande)', () => {
  it('tom data (data null) -> tom lista, ingen krasch', async () => {
    const from = vi.fn(() => builder({ data: null, error: null }));
    await expect(listLiveData(mockClient(from))).resolves.toEqual([]);
  });

  it('projicerar alla rader', async () => {
    const from = vi.fn(() =>
      builder({
        data: [
          row({ match_id: 'g-A-1' }),
          row({ match_id: 'g-B-2', frozen: true, status: 'finished' }),
        ],
        error: null,
      })
    );
    const all = await listLiveData(mockClient(from));
    expect(all.map((d) => d.matchId)).toEqual(['g-A-1', 'g-B-2']);
    expect(all[1].frozen).toBe(true);
    expect(from).toHaveBeenCalledWith('match_live_data');
  });

  it('fail loud: ett Supabase-fel kastar med svensk text', async () => {
    const from = vi.fn(() => builder({ data: null, error: { message: 'nät nere' } }));
    await expect(listLiveData(mockClient(from))).rejects.toThrow(
      /Hämta live-data misslyckades: nät nere/
    );
  });
});

describe('getLiveDataForMatch (PK-uppslag)', () => {
  it('returnerar den projicerade raden vid träff', async () => {
    const from = vi.fn(() => builder({ data: row({ match_id: 'M104' }), error: null }));
    const data = await getLiveDataForMatch(mockClient(from), 'M104');
    expect(data?.matchId).toBe('M104');
  });

  it('returnerar null när matchen saknar rad (inte ett fel)', async () => {
    const from = vi.fn(() => builder({ data: null, error: null }));
    await expect(getLiveDataForMatch(mockClient(from), 'g-Z-9')).resolves.toBeNull();
  });

  it('fail loud på ett riktigt Supabase-fel', async () => {
    const from = vi.fn(() => builder({ data: null, error: { message: 'boom' } }));
    await expect(getLiveDataForMatch(mockClient(from), 'g-A-1')).rejects.toThrow(
      /Hämta live-data för g-A-1 misslyckades: boom/
    );
  });
});

describe('getLiveData (gate-medveten) + fixtures-läge', () => {
  /** Env utan Supabase -> fixtures-läge (samma gate som getDataSource). */
  const fixturesEnv = {} as unknown as ImportMetaEnv;

  it('fixtures-läge: returnerar committad live-fixtures UTAN backend', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = await getLiveData(fixturesEnv);
    expect(data.length).toBeGreaterThan(0);
    // Rik demo-data: fixturen bär parsade events/statistik/lineups (Bit 3b kan rendera).
    expect(data[0].events.length).toBeGreaterThan(0);
    expect(data[0].statistics.length).toBeGreaterThan(0);
    expect(data[0].lineups.length).toBeGreaterThan(0);
    warn.mockRestore();
  });

  it('fixtureLiveData är ren (samma form som projektionen, klient-modellen)', () => {
    const data = fixtureLiveData();
    const first: LiveData = data[0];
    expect(first).toHaveProperty('matchId');
    expect(first).toHaveProperty('status');
    expect(first).toHaveProperty('frozen');
    expect(first).toHaveProperty('lastSyncedAt');
  });

  // DEMO-KLOCKAN TICKAR (lessons: tidsberoende headline-UI bara bevisat med injicerat now).
  // En PÅGÅENDE demo-match ska synka lastSyncedAt till NU så klockan tickar mjukt i demon,
  // i stället för att den FRUSNA kickoff-tiden åldras och drar klockan till halvleks-taket
  // ("45+", stilla). Vi bevisar det genom att köra den RIKTIGA klock-bryggan mot demo-raden
  // med ett verklighetstroget `now` (dagar efter den committade kickoff-tiden).
  it('en PÅGÅENDE demo-match synkar lastSyncedAt till `now` (klockan tickar, capar inte)', () => {
    const now = Date.parse('2026-06-20T12:00:00.000Z'); // långt EFTER fixturens kickoff
    const rows = fixtureLiveData(now);
    const liveRow = rows.find((r) => r.status === 'live');
    expect(liveRow).toBeDefined();
    // Synkad till nu (inte den frusna kickoff-tiden 2026-06-14T20:00Z).
    expect(liveRow?.lastSyncedAt).toBe(new Date(now).toISOString());

    // Klockan: 0 min sedan sync -> visar snapshotens elapsed och TICKAR (inte "45+").
    const clock = liveClockFor(liveRow as LiveData, now);
    expect(clock.ticking).toBe(true);
    expect(clock.label).not.toMatch(/\+/); // inte halvleks-taket
  });

  // NEGATIV-KONTROLL: den GAMLA buggen (lastSyncedAt = den frusna kickoff-tiden) skulle,
  // med samma `now`, kapa klockan till "45+" och sluta ticka. Vi bevisar att DEN formen
  // verkligen är trasig, så testet ovan vaktar något äkta (lessons: bevisa att testet vaktar).
  it('negativ-kontroll: en FRUSEN kickoff-sync med samma now hade capat klockan ("45+")', () => {
    const now = Date.parse('2026-06-20T12:00:00.000Z');
    const live = fixtureLiveData(now).find((r) => r.status === 'live') as LiveData;
    // Återinför den gamla, trasiga formen (frusen kickoff som sync-bas).
    const frozenSync: LiveData = { ...live, lastSyncedAt: '2026-06-14T20:00:00.000Z' };
    const clock = liveClockFor(frozenSync, now);
    expect(clock.ticking).toBe(false);
    expect(clock.label).toMatch(/\+/); // halvleks-taket, raka motsatsen till live-känslan
  });
});
