// Tester för det LÄTTVIKTIGA cross-match-events-läs-lagret (T87, #179). Fokus:
//   - tom data (ingen rad) -> tom lista, ingen krasch på null
//   - null events-blob -> [] (vanligt: events sätts inte förrän matchen rullar)
//   - SKARVEN: en stored events-blob är ett RawApiResponse-KUVERT (källans form), parsad
//     genom Bit 1:s RIKTIGA parseEvents, inte en handskriven konsument-form (samma bevis
//     som live-read.test, så aggregeringen läser EXAKT det pollaren skriver)
//   - trasig blob -> säkert tomt PER match, ALDRIG krasch, fail-loud-logg
//   - SELECTar bara `match_id, events` (inte de tunga statistics/lineups , det är hela
//     poängen med ett eget smalt läs-lager)
//   - fixtures-läge (env saknas) returnerar committad live-fixtures-events UTAN backend
//   - fail-loud på Supabase-fel

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  fixtureLiveEventsData,
  getLiveEvents,
  listLiveEvents,
  projectLiveEvents,
} from './live-events-read';

// Stored events-blobben i match_live_data är ett HELT API-Football-svar (RawApiResponse-
// kuvert), exakt det pollaren matar in och det Bit 1:s parseEvents tar. Vi läser det
// committade sample-svaret RÅ (?raw, samma väg som fixtures.ts) och stoppar in det som
// DB-blob, så testet bevisar SKARVEN mot KÄLLANS form (inte en konsument-form).
import eventsRaw from './__fixtures__/events-rich.json?raw';

const eventsEnvelope = JSON.parse(eventsRaw);

// listLiveEvents anropar ensureSession internt. Mocka den så testerna fokuserar på läs-/
// projektions-logiken, inte auth (samma mönster som live-read.test.ts).
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
  const client = { from: vi.fn(() => chain) } as unknown as Parameters<typeof listLiveEvents>[0];
  return { client, selectArgs };
}

describe('projectLiveEvents (ren projektion)', () => {
  it('null events-blob -> [] (vanligt: events sätts inte förrän matchen rullar)', () => {
    expect(projectLiveEvents({ match_id: 'g-A-1', events: null })).toEqual({
      matchId: 'g-A-1',
      events: [],
    });
  });

  it('SKARVEN: ett RawApiResponse-kuvert parsas genom Bit 1:s parseEvents', () => {
    const projected = projectLiveEvents({ match_id: 'g-F-1', events: eventsEnvelope });
    expect(projected.matchId).toBe('g-F-1');
    // Den riktiga sample-matchen bär flera events; minst ett mål (skytteligans råvara).
    expect(projected.events.length).toBeGreaterThan(0);
    expect(projected.events.some((e) => e.kind === 'goal')).toBe(true);
  });

  it('TRASIG blob -> [] för just den matchen + fail-loud-logg (aldrig krasch)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // En blob som INTE är ett giltigt kuvert (parseEvents kastar på fel form).
    const broken = { not: 'an envelope' } as unknown as Parameters<
      typeof projectLiveEvents
    >[0]['events'];
    const projected = projectLiveEvents({ match_id: 'g-B-2', events: broken });
    expect(projected).toEqual({ matchId: 'g-B-2', events: [] });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('g-B-2');
    warn.mockRestore();
  });
});

describe('listLiveEvents (smalt SELECT + fail-loud)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tom data (ingen rad) -> tom lista, ingen krasch på null', async () => {
    const { client } = clientReturning({ data: null, error: null });
    await expect(listLiveEvents(client)).resolves.toEqual([]);
  });

  it('SELECTar bara match_id + events (inte de tunga statistics/lineups)', async () => {
    const { client, selectArgs } = clientReturning({ data: [], error: null });
    await listLiveEvents(client);
    // Smalt SELECT: exakt 'match_id, events' , inte '*', inte statistics/lineups.
    expect(selectArgs).toEqual(['match_id, events']);
    expect(selectArgs[0]).not.toContain('statistics');
    expect(selectArgs[0]).not.toContain('lineups');
    expect(selectArgs[0]).not.toBe('*');
  });

  it('projicerar varje rad (kuvert -> parsade events)', async () => {
    const { client } = clientReturning({
      data: [
        { match_id: 'g-F-1', events: eventsEnvelope },
        { match_id: 'g-A-1', events: null },
      ],
      error: null,
    });
    const rows = await listLiveEvents(client);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.matchId).toBe('g-F-1');
    expect(rows[0]?.events.length).toBeGreaterThan(0);
    expect(rows[1]).toEqual({ matchId: 'g-A-1', events: [] });
  });

  it('fail-loud på ett Supabase-fel (aldrig tyst tom data)', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'boom' } });
    await expect(listLiveEvents(client)).rejects.toThrow(/Hämta live-events.*boom/);
  });
});

describe('fixtureLiveEventsData + getLiveEvents (fixtures-först)', () => {
  it('fixtures-data bär en match med events (renderbar utan backend)', () => {
    const rows = fixtureLiveEventsData();
    expect(rows.length).toBeGreaterThan(0);
    const withGoals = rows.find((r) => r.events.some((e) => e.kind === 'goal'));
    expect(withGoals).toBeDefined();
    expect(withGoals?.matchId.startsWith('api-')).toBe(true);
  });

  it('getLiveEvents i fixtures-läge (tomt env) returnerar fixtures-data utan backend', async () => {
    const rows = await getLiveEvents({} as ImportMetaEnv);
    expect(rows).toEqual(fixtureLiveEventsData());
  });
});
