// SKARV-TEST (det viktigaste i denna task): bevisa att producent-formen (det pollaren
// SKRIVER vid freeze) exakt matchar konsument-formen (det läs-lagret TAR). Vi tar ett
// RIKTIGT fixtures?id-sample (fixture-aet-pen.json, inline events/statistics/lineups på
// response[0]), kör det genom freeze-formningen (shapeFrozenBlobs), och sedan genom
// läs-lagrets PARSER (projectLiveData), och bevisar att skarven håller , INTE bara
// happy-path utan den faktiska producent -> konsument-vägen (lärdomen bevisa-skarven).
//
// NEGATIV-KONTROLL (lärdomen bevisa-att-testet-vaktar): vi matar OCKSÅ in den GAMLA
// formen (bara arrayen, ingen kuvert-lindning) genom samma läs-lager och bevisar att
// den GER TOMT (skarv-buggen), så testet skiljer rätt form från fel.

import { describe, expect, it, vi } from 'vitest';
import { shapeFrozenBlobs, wrapApiEnvelope } from './freeze-shape';
import { projectLiveData } from './live-read';
import type { Database } from '../supabase-types';
import aetPenRaw from './__fixtures__/fixture-aet-pen.json?raw';

type LiveDataRow = Database['public']['Tables']['match_live_data']['Row'];

// response[0] ur ett RIKTIGT fixtures?id-svar (Argentina-Frankrike, status PEN). Det
// bär events/statistics/lineups INLINE som arrayer , exakt formen live-data har.
const rich = JSON.parse(aetPenRaw).response[0] as {
  events: unknown[];
  statistics: unknown[];
  lineups: unknown[];
};

/** En komplett DB-rad med rimliga default; freeze sätter de tre blobbarna. */
function frozenRow(overrides: Partial<LiveDataRow> = {}): LiveDataRow {
  return {
    match_id: 'M104',
    api_fixture_id: 979139,
    status: 'finished',
    elapsed_minute: 120,
    home_goals: 3,
    away_goals: 3,
    events: null,
    statistics: null,
    lineups: null,
    last_synced_at: '2026-07-19T17:00:00.000Z',
    frozen: true,
    updated_at: '2026-07-19T17:00:05.000Z',
    ...overrides,
  };
}

describe('wrapApiEnvelope: linda en array i ett RawApiResponse-kuvert', () => {
  it('lindar en array och sätter results = längden, errors = []', () => {
    const env = wrapApiEnvelope([{ a: 1 }, { a: 2 }]);
    expect(env.response).toEqual([{ a: 1 }, { a: 2 }]);
    expect(env.results).toBe(2);
    expect(env.errors).toEqual([]);
  });

  it('lindar null/undefined till ett TOMT kuvert (inte en gissad post)', () => {
    expect(wrapApiEnvelope(null).response).toEqual([]);
    expect(wrapApiEnvelope(undefined).results).toBe(0);
  });

  it('kopierar arrayen (muterar inte källan)', () => {
    const src = [1, 2];
    const env = wrapApiEnvelope(src);
    env.response.push(3);
    expect(src).toEqual([1, 2]); // källan orörd
  });
});

describe('SKARVEN: freeze-formning (producent) -> läs-lager (konsument)', () => {
  it('shapeFrozenBlobs ger kuvert (response/errors), inte bara arrayen', () => {
    const blobs = shapeFrozenBlobs(rich);
    // KUVERT-form (inte en naken array): har response + errors.
    expect(Array.isArray(blobs.events)).toBe(false);
    expect(blobs.events.response).toHaveLength(rich.events.length);
    expect(blobs.events.errors).toEqual([]);
    expect(blobs.statistics.response).toHaveLength(rich.statistics.length);
    expect(blobs.lineups.response).toHaveLength(rich.lineups.length);
  });

  it('en frusen rad med KUVERT-LINDADE blobbar parsas RIKT av läs-lagret', () => {
    // Producent: forma blobbarna som pollaren gör vid freeze.
    const blobs = shapeFrozenBlobs(rich);
    // Lagra dem som jsonb i DB-raden, läs sedan via läs-lagrets RIKTIGA parser.
    const data = projectLiveData(
      frozenRow({
        events: blobs.events as unknown as LiveDataRow['events'],
        statistics: blobs.statistics as unknown as LiveDataRow['statistics'],
        lineups: blobs.lineups as unknown as LiveDataRow['lineups'],
      })
    );
    // Skarven HÅLLER: läs-lagret får ut de rika sektionerna (inte tomt).
    expect(data.events.length).toBe(rich.events.length); // 35 events
    expect(data.statistics).toHaveLength(2); // 2 lag
    expect(data.lineups).toHaveLength(2);
    expect(data.frozen).toBe(true);
    // Stickprov: ett verkligt event kom igenom parsern (Messi-mål finns).
    expect(data.events.some((e) => e.kind === 'goal')).toBe(true);
  });

  it('NEGATIV-KONTROLL: GAMLA formen (bara arrayen, ingen kuvert) ger TOMT i läs-lagret', () => {
    // Detta är skarv-BUGGEN: pollaren sparade tidigare `events: rich.events` (arrayen),
    // som läs-lagrets requireResponseArray INTE kan parsa -> tom sektion. Beviset att
    // kuvert-lindningen behövs (om den tas bort RÖDNAR testet ovan, detta blir då lika).
    // Läs-lagret loggar fail-loud per trasig blob (förväntat här), dämpa i testet.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = projectLiveData(
      frozenRow({
        events: rich.events as unknown as LiveDataRow['events'],
        statistics: rich.statistics as unknown as LiveDataRow['statistics'],
        lineups: rich.lineups as unknown as LiveDataRow['lineups'],
      })
    );
    // Den nakna arrayen är inte ett kuvert -> parsern kastar -> per-blob fail-safe -> [].
    expect(data.events).toEqual([]);
    expect(data.statistics).toEqual([]);
    expect(data.lineups).toEqual([]);
    expect(warn).toHaveBeenCalled(); // fail-loud, inte tyst
    warn.mockRestore();
  });
});
