// Tester för det PARALLELLA, lättviktiga cross-match-STATISTICS-läs-lagret (T88, #180).
// Spegelbild av live-events-read.test.ts men för statistics-blobben (T88:s bollinnehav-/
// skott-/fouls-aggregat behöver BARA statistics, inte de tunga events/lineups). Fokus:
//   - tom data (ingen rad) -> tom lista, ingen krasch på null
//   - null statistics-blob -> [] (vanligt: statistics sätts inte förrän matchen rullar/fryses)
//   - SKARVEN: en stored statistics-blob är ett RawApiResponse-KUVERT (källans form), parsad
//     genom Bit 1:s RIKTIGA parseStatistics, inte en handskriven konsument-form
//   - trasig blob -> säkert tomt PER match, ALDRIG krasch, fail-loud-logg
//   - SELECTar bara `match_id, statistics` (inte de tunga events/lineups , hela poängen)
//   - fixtures-läge (env saknas) returnerar committad live-fixtures-statistik UTAN backend
//   - fail-loud på Supabase-fel

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  fixtureLiveStatsData,
  getLiveStats,
  listLiveStats,
  projectLiveStats,
} from './live-stats-read';

// Stored statistics-blobben i match_live_data är ett HELT API-Football-svar (RawApiResponse-
// kuvert), exakt det pollaren matar in och det Bit 1:s parseStatistics tar. Vi läser det
// committade sample-svaret RÅ (?raw, samma väg som fixtures.ts) och stoppar in det som
// DB-blob, så testet bevisar SKARVEN mot KÄLLANS form (inte en konsument-form).
import statisticsRaw from './__fixtures__/statistics-rich.json?raw';

const statisticsEnvelope = JSON.parse(statisticsRaw);

// listLiveStats anropar ensureSession internt. Mocka den så testerna fokuserar på läs-/
// projektions-logiken, inte auth (samma mönster som live-events-read.test.ts).
vi.mock('../rooms/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'anon', isAnonymous: true }),
}));

/** En thenable-builder som fångar ARGUMENTEN till select (så vi kan asserta smalt SELECT). */
function builder(result: { data: unknown; error: unknown }) {
  const selectArgs: unknown[] = [];
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn((...args: unknown[]) => {
    selectArgs.push(...args);
    return result;
  });
  return { chain, selectArgs };
}

function clientReturning(result: { data: unknown; error: unknown }) {
  const { chain, selectArgs } = builder(result);
  const client = { from: vi.fn(() => chain) } as unknown as Parameters<typeof listLiveStats>[0];
  return { client, selectArgs };
}

describe('projectLiveStats (ren projektion)', () => {
  it('null statistics-blob -> [] (vanligt: statistik sätts inte förrän matchen rullar)', () => {
    expect(projectLiveStats({ match_id: 'g-A-1', statistics: null })).toEqual({
      matchId: 'g-A-1',
      statistics: [],
    });
  });

  it('SKARVEN: ett RawApiResponse-kuvert parsas genom Bit 1:s parseStatistics', () => {
    const projected = projectLiveStats({ match_id: 'g-F-1', statistics: statisticsEnvelope });
    expect(projected.matchId).toBe('g-F-1');
    // Den riktiga sample-matchen bär två lag med statistik (bollinnehav/skott-råvaran).
    expect(projected.statistics.length).toBe(2);
    expect(projected.statistics[0]?.teamApiId).toBeTypeOf('number');
    expect(projected.statistics[0]?.statistics.length).toBeGreaterThan(0);
  });

  it('TRASIG blob -> [] för just den matchen + fail-loud-logg (aldrig krasch)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { not: 'an envelope' } as unknown as Parameters<
      typeof projectLiveStats
    >[0]['statistics'];
    const projected = projectLiveStats({ match_id: 'g-B-2', statistics: broken });
    expect(projected).toEqual({ matchId: 'g-B-2', statistics: [] });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('g-B-2');
    warn.mockRestore();
  });
});

describe('listLiveStats (smalt SELECT + fail-loud)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tom data (ingen rad) -> tom lista, ingen krasch på null', async () => {
    const { client } = clientReturning({ data: null, error: null });
    await expect(listLiveStats(client)).resolves.toEqual([]);
  });

  it('SELECTar bara match_id + statistics (inte de tunga events/lineups)', async () => {
    const { client, selectArgs } = clientReturning({ data: [], error: null });
    await listLiveStats(client);
    // Smalt SELECT: exakt 'match_id, statistics' , inte '*', inte events/lineups.
    expect(selectArgs).toEqual(['match_id, statistics']);
    expect(selectArgs[0]).not.toContain('events');
    expect(selectArgs[0]).not.toContain('lineups');
    expect(selectArgs[0]).not.toBe('*');
  });

  it('projicerar varje rad (kuvert -> parsad statistik)', async () => {
    const { client } = clientReturning({
      data: [
        { match_id: 'g-F-1', statistics: statisticsEnvelope },
        { match_id: 'g-A-1', statistics: null },
      ],
      error: null,
    });
    const rows = await listLiveStats(client);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.matchId).toBe('g-F-1');
    expect(rows[0]?.statistics.length).toBe(2);
    expect(rows[1]).toEqual({ matchId: 'g-A-1', statistics: [] });
  });

  it('fail-loud på ett Supabase-fel (aldrig tyst tom data)', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'boom' } });
    await expect(listLiveStats(client)).rejects.toThrow(/Hämta live-statistik.*boom/);
  });
});

describe('fixtureLiveStatsData + getLiveStats (fixtures-först)', () => {
  it('fixtures-data bär en match med per-lags-statistik (renderbar utan backend)', () => {
    const rows = fixtureLiveStatsData();
    expect(rows.length).toBeGreaterThan(0);
    const withStats = rows.find((r) => r.statistics.length > 0);
    expect(withStats).toBeDefined();
    expect(withStats?.matchId.startsWith('api-')).toBe(true);
  });

  it('getLiveStats i fixtures-läge (tomt env) returnerar fixtures-data utan backend', async () => {
    const rows = await getLiveStats({} as ImportMetaEnv);
    expect(rows).toEqual(fixtureLiveStatsData());
  });
});
